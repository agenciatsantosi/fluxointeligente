import axios from 'axios';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import * as db from './database.js';
import {
    trackImageGenerationCost,
    trackPromptGenerationCost
} from './aiCostTracker.js';
import {
    isCardStyle,
    getCardStyle,
    buildCardPrompt,
    normalizeDetectedEmotion,
    CARD_STYLES
} from './cardStyles.js';
import { buildPromptForStyle } from './cardPromptAdminService.js';

/**
 * Normaliza uma lista de chaves vindas do banco.
 * Aceita: array, JSON string array, ou string separada por vírgula/ponto e vírgula/quebra de linha.
 * Formato especial Cloudflare: array de { accountId, token } → retorna tokens.
 */
function parseKeyList(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) {
        return raw
            .map(k => (typeof k === 'object' && k !== null ? String(k.token || '').trim() : String(k).trim()))
            .filter(Boolean);
    }
    const text = String(raw).trim();
    if (!text) return [];
    if (text.startsWith('[')) {
        try {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) {
                return parsed
                    .map(k => (typeof k === 'object' && k !== null ? String(k.token || '').trim() : String(k).trim()))
                    .filter(Boolean);
            }
        } catch {}
    }
    return text.split(/[,;\n\r]+/).map(k => k.trim()).filter(Boolean);
}

/**
 * Carrega o pool de chaves para um provedor (usuário + sistema), removendo duplicadas.
 * Retorna [{ key, accountId? }] — accountId só existe para Cloudflare (pares).
 */
async function getKeyPool(userId, providerKey) {
    const rawValues = [];
    const userRaw = userId ? await db.getUserConfig(userId, providerKey) : null;
    const sysRaw = await db.getSystemConfig(providerKey);
    if (userRaw) rawValues.push(userRaw);
    if (sysRaw) rawValues.push(sysRaw);

    const entries = [];
    for (const raw of rawValues) {
        // Formato de pares (Cloudflare com múltiplas contas)
        let isPairFormat = false;
        const text = typeof raw === 'string' ? raw.trim() : '';
        if (Array.isArray(raw) && raw.some(k => typeof k === 'object' && k !== null)) isPairFormat = true;
        if (text.startsWith('[')) {
            try {
                const parsed = JSON.parse(text);
                if (Array.isArray(parsed) && parsed.some(k => typeof k === 'object' && k !== null)) isPairFormat = true;
            } catch {}
        }

        if (isPairFormat) {
            const list = Array.isArray(raw) ? raw : JSON.parse(text);
            for (const item of list) {
                if (item && typeof item === 'object' && item.token) {
                    const t = String(item.token).trim();
                    if (t) entries.push({ key: t, accountId: item.accountId ? String(item.accountId).trim() : null });
                }
            }
        } else {
            for (const k of parseKeyList(raw)) {
                entries.push({ key: k, accountId: null });
            }
        }
    }

    // Remove duplicadas por (key + accountId)
    const seen = new Set();
    const unique = [];
    for (const e of entries) {
        const sig = `${e.accountId || ''}::${e.key}`;
        if (!seen.has(sig)) {
            seen.add(sig);
            unique.push(e);
        }
    }
    return unique;
}

/**
 * Executa uma ação com failover automático entre chaves.
 * Se a chave 1 falhar (rede, 401, 403, 429, 5xx), tenta a chave 2, 3...
 */
async function executeWithKeyFailover(keys, actionFn, label) {
    if (!keys || keys.length === 0) {
        throw new Error(`${label}: nenhuma chave configurada.`);
    }

    let lastErr = null;
    // Rotação: começa em posição aleatória para distribuir o uso entre as
    // chaves/contas (cada conta Cloudflare tem sua própria cota diária).
    // Todas continuam sendo tentadas em caso de falha.
    const startOffset = Math.floor(Math.random() * keys.length);
    for (let n = 0; n < keys.length; n++) {
        const i = (startOffset + n) % keys.length;
        const entry = keys[i];
        // Aceita tanto strings (retrocompatível) quanto { key, accountId }
        const key = typeof entry === 'string' ? entry : entry.key;
        const accId = typeof entry === 'string' ? null : entry.accountId;
        const keyInfo = `chave ${i + 1}/${keys.length}${accId ? ` (conta ${accId.slice(0, 8)}...)` : ''}`;
        try {
            console.log(`[AI] ${label} usando ${keyInfo} (${String(key).slice(0, 8)}...)`);
            const result = await actionFn(key, accId);
            if (n > 0) console.log(`[AI] ${label} sucesso na ${keyInfo} após fallback.`);
            return result;
        } catch (err) {
            const status = err?.response?.status;
            // Decodifica corpo de erro em buffer (ex: HF retorna ArrayBuffer JSON: {error})
            const decodeBody = () => {
                try {
                    const d = err?.response?.data;
                    if (!d) return null;
                    const text = Buffer.isBuffer(d) ? d.toString('utf-8') : (typeof d === 'string' ? d : JSON.stringify(d));
                    try {
                        const parsed = JSON.parse(text);
                        const m = parsed?.error || parsed?.message;
                        return typeof m === 'string' ? m : (m ? JSON.stringify(m) : text.slice(0, 300));
                    } catch {
                        return /^request failed/i.test(text.trim()) ? null : text.slice(0, 300);
                    }
                } catch { return null; }
            };
            const bodyMsg = decodeBody();
            let errMsg = err?.response?.data?.error?.message
                || err?.response?.data?.message
                || bodyMsg
                || err?.message
                || 'erro desconhecido';
            // DNS/rede: diz exatamente o que verificar no servidor
            if (err?.code === 'ENOTFOUND' || /ENOTFOUND/i.test(err?.message || '')) {
                errMsg = `DNS do servidor não resolve o host da API (${err?.hostname || 'verifique a rede do servidor'}). Teste no servidor: curl -I https://...`;
            }

            lastErr = err;

            if (n === keys.length - 1) {
                err.message = `${label} falhou em todas as ${keys.length} chaves. Último erro: ${errMsg}`;
                throw err;
            }

            const isAuthOrQuota = status === 401 || status === 403 || status === 429 || status >= 500;
            const isNetwork = !status && (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || /timeout|Network Error/i.test(err.message || ''));

            if (isAuthOrQuota || isNetwork) {
                console.warn(`[AI] ${label} falhou na ${keyInfo}: ${errMsg}. Tentando próxima chave...`);
            } else {
                console.warn(`[AI] ${label} erro não-auth na ${keyInfo}: ${errMsg}. Tentando próxima chave...`);
            }
        }
    }

    throw lastErr || new Error(`${label}: todas as chaves falharam.`);
}

/**
 * Retorna as dimensões ideais para posts de redes sociais (Instagram, Facebook).
 *
 * Padrões oficiais de redes sociais modernas (Feed):
 * - Retrato 4:5: 1080x1350 (formato preferencial para feed do Instagram e Facebook mobile — máxima ocupação de tela)
 * - Quadrado 1:1: 1080x1080 (formato clássico para feed)
 *
 * NUNCA usar 1200x630 (banner horizontal antigo que deforma cards) nem 1024x1024 (resolução defasada).
 * A largura padrão é SEMPRE 1080px.
 */
function getPlatformSize(platform, cardStyleId, visualIdentity = null) {
    const p = (platform || '').toLowerCase().trim();
    const explicitRatio = visualIdentity && typeof visualIdentity === 'object'
        ? String(visualIdentity.aspect_ratio || visualIdentity.format || '').trim()
        : '';

    // 1. Estilos de card com formato intrínseco rígido:
    // - Dilemas: 4:5 vertical 1080x1350 (frase topo + cena centro + pergunta + 2 botões + CTA)
    if (cardStyleId === 'dilemas') {
        return { width: 1080, height: 1350, openaiSize: '1024x1792' };
    }
    // - Casal Romântico: 4:5 vertical 1080x1350 (casal à esquerda 60% + coluna manuscrita à direita 40%)
    if (cardStyleId === 'casal_romantico') {
        return { width: 1080, height: 1350, openaiSize: '1024x1792' };
    }
    // - Twitter/X: 1:1 quadrado 1080x1080 (mockup fiel de tweet quadrado)
    if (cardStyleId === 'twitter_x') {
        return { width: 1080, height: 1080, openaiSize: '1024x1024' };
    }
    // - Romântico Ilustrado: 1:1 quadrado 1080x1080 (frase no topo + ilustração delicada)
    if (cardStyleId === 'romantico_ilustrado') {
        return { width: 1080, height: 1080, openaiSize: '1024x1024' };
    }
    // - Sabedoria das Eres: 1:1 quadrado 1080x1080 (entidade à direita + texto à esquerda)
    if (cardStyleId === 'sabedoria_eres') {
        return { width: 1080, height: 1080, openaiSize: '1024x1024' };
    }
    // - Cristão Cinematográfico: 4:5 vertical 1080x1350 (personagem bíblico à direita 60% + frase topo esquerdo + marca rodapé)
    if (cardStyleId === 'cristao_cinematografico') {
        return { width: 1080, height: 1350, openaiSize: '1024x1792' };
    }
    // - Bíblia Aberta Cinematográfica: 4:5 vertical 1080x1350 (Bíblia central + céu + vale com caminho/pegadas)
    if (cardStyleId === 'biblia_aberta_cinematografica') {
        return { width: 1080, height: 1350, openaiSize: '1024x1792' };
    }
    // - Educativo Universal: 1:1 quadrado 1080x1080 (dica à esquerda + cena do nicho à direita + rodapé produto)
    if (cardStyleId === 'educativo_universal') {
        return { width: 1080, height: 1080, openaiSize: '1024x1024' };
    }
    // - Demais cards (kawaii, carta_3d, caderno, minimalista, papel_rasgado):
    // Padrão 1:1 quadrado (1080x1080), a não ser que o usuário force explicitamente 4:5
    const isSquareCard = ['kawaii', 'carta_3d', 'caderno', 'minimalista', 'papel_rasgado'].includes(cardStyleId);
    if (isSquareCard) {
        if (explicitRatio === '4:5' || explicitRatio === 'portrait' || explicitRatio === 'retrato') {
            return { width: 1080, height: 1350, openaiSize: '1024x1792' };
        }
        return { width: 1080, height: 1080, openaiSize: '1024x1024' };
    }

    // 2. Se o usuário definiu proporção explícita no formulário (aspect_ratio)
    if (explicitRatio === '1:1' || explicitRatio === 'square' || explicitRatio === 'quadrado') {
        return { width: 1080, height: 1080, openaiSize: '1024x1024' };
    }
    if (explicitRatio === '4:5' || explicitRatio === 'portrait' || explicitRatio === 'retrato') {
        return { width: 1080, height: 1350, openaiSize: '1024x1792' };
    }
    if (explicitRatio === '9:16' || explicitRatio === 'story' || explicitRatio === 'reels') {
        return { width: 1080, height: 1920, openaiSize: '1024x1792' };
    }

    // 3. Padrão por rede social para posts de feed (fotografia/jornalismo):
    // Tanto Instagram quanto Facebook: Retrato 4:5 (1080x1350) é o formato campeão em retenção e engajamento mobile.
    if (p === 'instagram' || p === 'facebook' || p === 'threads') {
        return { width: 1080, height: 1350, openaiSize: '1024x1792' };
    }

    // 4. Fallback padrão: 1080x1350 (4:5 vertical) para posts gerais, ou 1080x1080 se estilo card
    if (cardStyleId) {
        return { width: 1080, height: 1080, openaiSize: '1024x1024' };
    }
    return { width: 1080, height: 1350, openaiSize: '1024x1792' };
}

async function getAiConfig(userId) {
    const ninerouterUrl = (await db.getUserConfig(userId, 'ninerouter_url'))
        || (await db.getUserConfig(userId, 'NINEROUTER_URL'))
        || (await db.getSystemConfig('ninerouter_url'))
        || (await db.getSystemConfig('NINEROUTER_URL'))
        || process.env.NINEROUTER_URL || '';

    const ninerouterApiKey = (await db.getUserConfig(userId, 'ninerouter_api_key'))
        || (await db.getUserConfig(userId, 'NINEROUTER_API_KEY'))
        || (await db.getSystemConfig('ninerouter_api_key'))
        || (await db.getSystemConfig('NINEROUTER_API_KEY'))
        || process.env.NINEROUTER_API_KEY || '';

    let geminiApiKey = (userId ? await db.getUserConfig(userId, 'gemini_api_key') : null)
        || (userId ? await db.getUserConfig(userId, 'GEMINI_API_KEY') : null)
        || (await db.getSystemConfig('gemini_api_key'))
        || (await db.getSystemConfig('GEMINI_API_KEY'))
        || process.env.GEMINI_API_KEY || '';
    if (geminiApiKey === 'PLACEHOLDER_API_KEY') geminiApiKey = '';

    const openaiApiKey = (userId ? await db.getUserConfig(userId, 'openai_api_key') : null)
        || (userId ? await db.getUserConfig(userId, 'OPENAI_API_KEY') : null)
        || (await db.getSystemConfig('openai_api_key'))
        || (await db.getSystemConfig('OPENAI_API_KEY'))
        || process.env.OPENAI_API_KEY || '';

    // Novos provedores
    const huggingfaceApiKey = (userId ? await db.getUserConfig(userId, 'huggingface_api_key') : null)
        || (userId ? await db.getUserConfig(userId, 'HUGGINGFACE_API_KEY') : null)
        || (await db.getSystemConfig('huggingface_api_key'))
        || (await db.getSystemConfig('HUGGINGFACE_API_KEY'))
        || process.env.HUGGINGFACE_API_KEY || '';

    const cloudflareAccountId = (userId ? await db.getUserConfig(userId, 'cloudflare_account_id') : null)
        || (userId ? await db.getUserConfig(userId, 'CLOUDFLARE_ACCOUNT_ID') : null)
        || (await db.getSystemConfig('cloudflare_account_id'))
        || (await db.getSystemConfig('CLOUDFLARE_ACCOUNT_ID'))
        || process.env.CLOUDFLARE_ACCOUNT_ID || '';

    const cloudflareApiToken = (userId ? await db.getUserConfig(userId, 'cloudflare_api_token') : null)
        || (userId ? await db.getUserConfig(userId, 'CLOUDFLARE_API_TOKEN') : null)
        || (await db.getSystemConfig('cloudflare_api_token'))
        || (await db.getSystemConfig('CLOUDFLARE_API_TOKEN'))
        || process.env.CLOUDFLARE_API_TOKEN || '';

    // Provedor de imagem selecionado
    const imageProvider = (userId ? await db.getUserConfig(userId, 'image_provider') : null)
        || (await db.getSystemConfig('image_provider'))
        || process.env.IMAGE_PROVIDER || 'auto';

    // Modelo de imagem do Google (Gemini native image generation)
    const googleImageModel = (userId ? await db.getUserConfig(userId, 'google_image_model') : null)
        || (await db.getSystemConfig('google_image_model'))
        || process.env.GOOGLE_IMAGE_MODEL || 'gemini-2.5-flash-image';

    // Runware (serverless GPU inference)
    const runwareApiKey = (userId ? await db.getUserConfig(userId, 'runware_api_key') : null)
        || (userId ? await db.getUserConfig(userId, 'RUNWARE_API_KEY') : null)
        || (await db.getSystemConfig('runware_api_key'))
        || (await db.getSystemConfig('RUNWARE_API_KEY'))
        || process.env.RUNWARE_API_KEY || '';

    const runwareImageModel = (userId ? await db.getUserConfig(userId, 'runware_image_model') : null)
        || (await db.getSystemConfig('runware_image_model'))
        || process.env.RUNWARE_IMAGE_MODEL || 'runware:100@1';

    // Variante FLUX para Pollinations (ex: 'flux', 'flux-klein', 'flux-realism', 'flux-anime', 'flux-3d')
    const pollinationsFluxVariant = (userId ? await db.getUserConfig(userId, 'pollinations_flux_variant') : null)
        || (await db.getSystemConfig('pollinations_flux_variant'))
        || process.env.POLLINATIONS_FLUX_VARIANT || 'flux';

    // Rede de segurança (fallback gratuito via Pollinations quando os pagos falham).
    // Ligada por padrão; desligue com free_fallback=0 para falhar em vez de trocar de provedor.
    const freeFallbackRaw = (userId ? await db.getUserConfig(userId, 'free_fallback') : null)
        ?? (await db.getSystemConfig('free_fallback'))
        ?? process.env.FREE_FALLBACK
        ?? '1';

    return {
        ninerouterUrl: ninerouterUrl.trim(),
        ninerouterApiKey: ninerouterApiKey.trim(),
        geminiApiKey: geminiApiKey.trim(),
        openaiApiKey: openaiApiKey.trim(),
        huggingfaceApiKey: huggingfaceApiKey.trim(),
        cloudflareAccountId: cloudflareAccountId.trim(),
        cloudflareApiToken: cloudflareApiToken.trim(),
        imageProvider: imageProvider.trim(),
        pollinationsFluxVariant: pollinationsFluxVariant.trim(),
        googleImageModel: (googleImageModel || 'gemini-2.5-flash-image').trim(),
        runwareApiKey: runwareApiKey.trim(),
        runwareImageModel: (runwareImageModel || 'runware:100@1').trim(),
        freeFallback: String(freeFallbackRaw).trim() !== '0'
    };
}

// Helper para chamar Gemini com fallback automático de modelos suportados (priorizando flash-lite estáveis)
async function callGeminiGenerate(apiKey, promptText, timeout = 25000) {
    const models = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-flash-latest'];
    for (const model of models) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const res = await axios.post(url, {
                contents: [{ parts: [{ text: promptText }] }]
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout
            });
            const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (text) return text;
        } catch (err) {
            console.warn(`[AI] Gemini model ${model} failed (${err.response?.status || err.message}), trying next...`);
        }
    }
    throw new Error('Todos os modelos Gemini testados falharam ou estão indisponíveis');
}

// ─── Google (Gemini native image generation) ───
// Usa a mesma API key do Gemini (AI Studio). Mapeia o tamanho alvo para o
// aspectRatio suportado e redimensiona o resultado para as dimensões exatas.
const GOOGLE_ASPECTS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
function googleAspectFor(width, height) {
    const r = width / height;
    let best = '1:1';
    let bestDiff = Infinity;
    for (const a of GOOGLE_ASPECTS) {
        const [w, h] = a.split(':').map(Number);
        const diff = Math.abs(w / h - r);
        if (diff < bestDiff) { bestDiff = diff; best = a; }
    }
    return best;
}

async function generateImageViaGoogle(prompt, config, targetSize) {
    const model = config.googleImageModel || 'gemini-2.5-flash-image';
    const aspectRatio = googleAspectFor(targetSize.width, targetSize.height);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.geminiApiKey}`;
    let res;
    try {
        res = await axios.post(url, {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                responseModalities: ['TEXT', 'IMAGE'],
                imageConfig: { aspectRatio }
            }
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 120000
        });
    } catch (e) {
        const detail = e?.response?.data?.error?.message || e.message;
        const status = e?.response?.status;
        if (status === 400 && /API key|API_KEY/i.test(detail)) {
            throw new Error(`Google: chave Gemini inválida (${detail})`);
        }
        if (status === 404) {
            throw new Error(`Google: modelo "${model}" não encontrado ou sem suporte a imagem. Troque em google_image_model (ex: gemini-2.5-flash-image). Detalhe: ${detail}`);
        }
        throw new Error(`Google (${model}): ${detail}`);
    }
    const parts = res.data?.candidates?.[0]?.content?.parts || [];
    const imgPart = parts.find(p => p?.inlineData?.data);
    if (!imgPart) {
        const textPart = parts.find(p => p?.text)?.text;
        throw new Error(`Google (${model}) não retornou imagem.${textPart ? ` Resposta: ${String(textPart).slice(0, 200)}` : ''}`);
    }
    const buffer = Buffer.from(imgPart.inlineData.data, 'base64');
    return await saveResizedImage(buffer, targetSize.width, targetSize.height, `google-${model.replace(/[^a-z0-9]/gi, '')}`);
}

// ─── Runware (serverless GPU inference) ───
// POST https://api.runware.ai/v1 — taskType imageInference.
// Modelos AIR: runware:100@1 (FLUX.1 schnell), runware:101@1 (FLUX.1 dev).
async function generateImageViaRunware(prompt, config, targetSize, apiKeyOverride = null) {
    const apiKey = apiKeyOverride || config.runwareApiKey;
    if (!apiKey) throw new Error('Runware selecionado, mas a API key não está configurada.');
    const model = config.runwareImageModel || 'runware:100@1';
    const taskUUID = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    let res;
    try {
        res = await axios.post('https://api.runware.ai/v1', [{
            taskType: 'imageInference',
            taskUUID,
            outputType: ['base64Data'],
            outputFormat: 'PNG',
            positivePrompt: prompt,
            width: targetSize.width,
            height: targetSize.height,
            model,
            numberResults: 1
        }], {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 180000
        });
    } catch (e) {
        const errItem = e?.response?.data?.[0] || e?.response?.data;
        const detail = errItem?.errorMessage || errItem?.error || errItem?.message || e.message;
        throw new Error(`Runware (${model}): ${typeof detail === 'string' ? detail.slice(0, 300) : JSON.stringify(detail)}`);
    }
    const item = Array.isArray(res.data) ? res.data[0] : res.data;
    if (item?.imageBase64Data) {
        return await saveResizedImage(Buffer.from(item.imageBase64Data, 'base64'), targetSize.width, targetSize.height, 'runware');
    }
    if (item?.imageDataURI) {
        const b64 = String(item.imageDataURI).replace(/^data:image\/[a-zA-Z]+;base64,/, '');
        return await saveResizedImage(Buffer.from(b64, 'base64'), targetSize.width, targetSize.height, 'runware');
    }
    if (item?.imageURL) {
        const dl = await axios.get(item.imageURL, { responseType: 'arraybuffer', timeout: 60000 });
        return await saveResizedImage(Buffer.from(dl.data), targetSize.width, targetSize.height, 'runware');
    }
    throw new Error(`Runware (${model}) não retornou imagem: ${JSON.stringify(item).slice(0, 200)}`);
}

// ─── Hugging Face: endpoints, candidatos e probe (escopo de módulo) ───
// Endpoints: router novo primeiro, legado como fallback
function hfEndpoints(model) {
    return [
        `https://router.huggingface.co/hf-inference/models/${model}`,
        `https://api-inference.huggingface.co/models/${model}`
    ];
}
// Candidatos em ordem de preferência — o HF descontinuou modelos no serverless
// (ex: SDXL) e o provider hf-inference serve poucos modelos de imagem
// (FLUX.1-schnell, SD3-Medium). O sistema testa em runtime e usa o primeiro que responder.
const HF_IMAGE_CANDIDATES = [
    'black-forest-labs/FLUX.1-schnell',
    'stabilityai/stable-diffusion-3-medium',
    'black-forest-labs/FLUX.1-klein',
    'black-forest-labs/FLUX.1-dev',
    'stabilityai/sdxl-turbo',
    'segmind/SSD-1B',
    'runwayml/stable-diffusion-v1-5',
    'CompVis/stable-diffusion-v1-4',
    'prompthero/openjourney-v4',
    'stabilityai/stable-diffusion-xl-base-1.0'
];
const hfSleep = (ms) => new Promise(r => setTimeout(r, ms));
// Lê corpo de erro do HF (ArrayBuffer JSON) → {status, message, estimatedTime}
function parseHfErrorBody(e) {
    let message = null;
    let estimatedTime = 0;
    try {
        const d = e?.response?.data;
        if (d) {
            const text = Buffer.isBuffer(d) ? d.toString('utf-8') : (typeof d === 'string' ? d : JSON.stringify(d));
            try {
                const parsed = JSON.parse(text);
                const m = parsed?.error || parsed?.message;
                if (m) message = typeof m === 'string' ? m : JSON.stringify(m);
                if (parsed?.estimated_time) estimatedTime = Number(parsed.estimated_time) || 0;
            } catch { if (text && !/^request failed/i.test(text.trim())) message = text.slice(0, 300); }
        }
    } catch {}
    return { status: e?.response?.status || 0, message, estimatedTime };
}
// Probe barato (64px, 1 step): descobre se o modelo está suportado.
// Trata 503 "model loading" com espera+retry. Retorna
// {ok:true} | {auth:true} | {credits:true} | {gated:true} | {ok:false, detail}
async function probeHfModel(apiKey, model) {
    for (const url of hfEndpoints(model)) {
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const res = await axios.post(
                    url,
                    { inputs: 'test', parameters: { width: 64, height: 64, num_inference_steps: 1 } },
                    {
                        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                        responseType: 'arraybuffer',
                        timeout: 90000
                    }
                );
                if (res.data?.byteLength > 0) return { ok: true };
            } catch (e) {
                const { status, message, estimatedTime } = parseHfErrorBody(e);
                if (status === 401) return { auth: true };
                if (status === 402) return { credits: true, detail: message };
                if (status === 403) return { gated: true, detail: message };
                // 503 modelo carregando: espera o tempo estimado e tenta de novo
                if (status === 503 && estimatedTime > 0 && attempt < 2) {
                    await hfSleep(Math.min(estimatedTime, 60) * 1000);
                    continue;
                }
                break; // outro erro → próximo endpoint
            }
        }
    }
    return { ok: false };
}
// POST com retry para 503 "model loading" (usado na geração real)
async function hfPostWithRetry(url, payload, apiKey, timeout = 120000) {
    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            return await axios.post(url, payload, {
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                responseType: 'arraybuffer',
                timeout
            });
        } catch (e) {
            lastErr = e;
            const { status, estimatedTime } = parseHfErrorBody(e);
            if (status === 503 && estimatedTime > 0 && attempt < 2) {
                console.log(`[AI] HF: modelo carregando, aguardando ${Math.min(estimatedTime, 60)}s...`);
                await hfSleep(Math.min(estimatedTime, 60) * 1000);
                continue;
            }
            throw e;
        }
    }
    throw lastErr;
}

/**
 * Testa UM par específico {accountId, token} do Cloudflare (checker individual).
 * Não salva nada — só valida o que está digitado na tela.
 * Retorna { ok, status: 'ok'|'quota'|'auth'|'error', message }.
 */
export async function checkCloudflarePair(accountId, token) {
    const acc = String(accountId || '').trim();
    const tok = String(token || '').trim();
    if (!acc || !tok) {
        return { ok: false, status: 'error', message: 'Preencha Account ID e Token.' };
    }
    try {
        const res = await axios.post(
            `https://api.cloudflare.com/client/v4/accounts/${acc}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
            { prompt: 'test', steps: 1 },
            {
                headers: { 'Authorization': `Bearer ${tok}`, 'Content-Type': 'application/json' },
                responseType: 'arraybuffer',
                timeout: 30000
            }
        );
        const buf = Buffer.isBuffer(res.data) ? res.data : Buffer.from(res.data || []);
        if (buf.length > 0) {
            return { ok: true, status: 'ok', message: 'Conta ativa e com cota disponível.' };
        }
        return { ok: false, status: 'error', message: 'Resposta vazia da API.' };
    } catch (e) {
        const status = e.response?.status;
        let body = '';
        try {
            const d = e.response?.data;
            body = Buffer.isBuffer(d) ? d.toString('utf-8') : (typeof d === 'string' ? d : JSON.stringify(d || ''));
        } catch { body = e.message; }
        if (status === 429 || /daily free allocation|10,?000 neurons|4006/i.test(body)) {
            return { ok: false, status: 'quota', message: 'Cota diária gratuita esgotada (10.000 neurons). Volta na virada do dia (UTC) ou use outra conta.' };
        }
        if (status === 401 || status === 403 || /authentication error|unauthorized|invalid.*token|10000/i.test(body)) {
            return { ok: false, status: 'auth', message: 'Token inválido/expirado. Gere um novo em dash.cloudflare.com.' };
        }
        return { ok: false, status: 'error', message: body.slice(0, 200) || e.message };
    }
}

export async function testConnection(userId, provider = 'all') {
    const config = await getAiConfig(userId);

    // Test Gemini specifically
    if (provider === 'gemini') {
        if (!config.geminiApiKey) {
            return { success: false, provider: 'Google Gemini', error: 'Chave do Gemini não preenchida.' };
        }
        try {
            const text = await callGeminiGenerate(config.geminiApiKey, 'Diga apenas OK', 15000);
            if (text) {
                return { success: true, message: 'Google Gemini respondendo perfeitamente!', provider: 'Google Gemini' };
            }
        } catch (error) {
            return { success: false, provider: 'Google Gemini', error: `Falha ao conectar com Gemini: ${error.message}` };
        }
    }

    // Test OpenAI specifically
    if (provider === 'openai') {
        if (!config.openaiApiKey) {
            return { success: false, provider: 'OpenAI', error: 'Chave da OpenAI não preenchida.' };
        }
        try {
            const res = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: 'Diga OK' }],
                max_tokens: 5
            }, {
                headers: {
                    'Authorization': `Bearer ${config.openaiApiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });

            if (res.status === 200) {
                return { success: true, message: 'OpenAI (DALL-E 3 / GPT) respondendo com sucesso!', provider: 'OpenAI' };
            }
        } catch (error) {
            return { success: false, provider: 'OpenAI', error: `Falha ao conectar com OpenAI: ${error.response?.data?.error?.message || error.message}` };
        }
    }

    // Test Hugging Face specifically (usa o pool de chaves, igual à geração real)
    if (provider === 'huggingface') {
        const hfPool = await getKeyPool(userId, 'huggingface_api_key');
        if (hfPool.length === 0) {
            return { success: false, provider: 'Hugging Face', error: 'Chave do Hugging Face não preenchida.' };
        }
        // 1. Diagnóstico direto do token via whoami (separa "token inválido" de "problema no inference")
        let whoamiName = null;
        try {
            const who = await axios.get('https://huggingface.co/api/whoami-v2', {
                headers: { 'Authorization': `Bearer ${hfPool[0].key}` },
                timeout: 15000
            });
            whoamiName = who.data?.name || who.data?.email || 'ok';
        } catch (whoErr) {
            if (whoErr?.response?.status === 401) {
                return { success: false, provider: 'Hugging Face', error: 'Token REJEITADO pelo Hugging Face (401 no whoami). O valor salvo não é um token válido — gere um novo em huggingface.co/settings/tokens, cole no painel e clique Salvar Chaves.' };
            }
            // Sem whoami (rede/API instável): segue para o teste de inference mesmo assim
        }
        // 2. Descobre qual modelo está suportado (probe barato em cada candidato)
        let workingModel = null;
        let sawCredits = false;
        let sawGated = null;
        for (const m of HF_IMAGE_CANDIDATES) {
            const r = await probeHfModel(hfPool[0].key, m);
            if (r.auth) {
                return { success: false, provider: 'Hugging Face', error: 'Token REJEITADO pelo Hugging Face (401). Gere um novo em huggingface.co/settings/tokens, cole no painel e clique Salvar Chaves.' };
            }
            if (r.credits) sawCredits = true;
            if (r.gated && !sawGated) sawGated = m;
            if (r.ok) { workingModel = m; break; }
        }
        if (!workingModel) {
            let reason = `Token válido (conta: ${whoamiName || 'ok'}), mas nenhum modelo de imagem respondeu.`;
            if (sawCredits) reason += ' A conta parece SEM CRÉDITOS de Inference (erro 402) — confira o billing em huggingface.co.';
            else if (sawGated) reason += ` Modelos com licença restrita (ex: ${sawGated}) exigem aceitar os termos na página do modelo. O FLUX.1-schnell (aberto) também não respondeu — pode estar em manutenção no provider hf-inference; tente de novo em alguns minutos.`;
            else reason += ' Verifique a rede do servidor e tente de novo em alguns minutos.';
            return { success: false, provider: 'Hugging Face', error: reason };
        }
        return { success: true, message: `Hugging Face OK${whoamiName ? ` (conta: ${whoamiName})` : ''} — modelo ativo: ${workingModel} (${hfPool.length} chave(s) no pool)`, provider: 'Hugging Face' };
    }

    // Test Cloudflare specifically (com failover entre todos os tokens)
    if (provider === 'cloudflare') {
        const cfTokens = await getKeyPool(userId, 'cloudflare_api_token');
        const hasCfAccount = cfTokens.some(k => k.accountId) || !!config.cloudflareAccountId;
        if (!hasCfAccount || cfTokens.length === 0) {
            return { success: false, provider: 'Cloudflare Workers AI', error: 'Account ID ou API Token do Cloudflare não preenchidos.' };
        }
        try {
            await executeWithKeyFailover(cfTokens, async (token, pairAccountId) => {
                const accountId = pairAccountId || config.cloudflareAccountId;
                if (!accountId) throw new Error('Account ID não configurado');
                const res = await axios.post(
                    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
                    { prompt: 'test', steps: 1 },
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 30000
                    }
                );
                if (res.data?.result?.image) return true;
                // Resposta sem imagem mas sem erro HTTP (ex: arraybuffer) = sucesso
                if (res.data && Buffer.isBuffer(res.data) && res.data.length > 0) return true;
                throw new Error('Resposta inválida da API');
            }, 'Cloudflare Workers AI');

            return {
                success: true,
                message: `Cloudflare Workers AI respondendo com sucesso! (${cfTokens.length} par(es) conta/token no pool)`,
                provider: 'Cloudflare Workers AI'
            };
        } catch (error) {
            const cfErrors = error.response?.data?.errors;
            let errorMsg = error.message;
            if (cfErrors && Array.isArray(cfErrors) && cfErrors.length > 0) {
                errorMsg = cfErrors.map(e => e.message || JSON.stringify(e)).join('; ');
            } else if (error.response?.data?.messages && Array.isArray(error.response.data.messages)) {
                errorMsg = error.response.data.messages.map(m => m.message || JSON.stringify(m)).join('; ');
            } else if (error.response?.data?.result?.errors) {
                errorMsg = error.response.data.result.errors.map(e => e.message || JSON.stringify(e)).join('; ');
            }
            return { success: false, provider: 'Cloudflare Workers AI', error: `Falha ao conectar com Cloudflare: ${errorMsg}` };
        }
    }

    // Test Google image generation (Gemini native image)
    if (provider === 'google') {
        if (!config.geminiApiKey) {
            return { success: false, provider: 'Google', error: 'Chave Gemini (Google) não preenchida. Use a mesma chave de aistudio.google.com.' };
        }
        const gModel = config.googleImageModel || 'gemini-2.5-flash-image';
        try {
            const localUrl = await generateImageViaGoogle('test', config, { width: 1024, height: 1024 });
            return { success: true, message: `Google (${gModel}) gerando imagens com sucesso!`, provider: 'Google', imageUrl: localUrl };
        } catch (error) {
            return { success: false, provider: 'Google', error: `Falha ao gerar imagem com Google: ${error.message}` };
        }
    }

    // Test Runware (tiny image)
    if (provider === 'runware') {
        const rwPool = await getKeyPool(userId, 'runware_api_key');
        if (rwPool.length === 0) {
            return { success: false, provider: 'Runware', error: 'API key da Runware não preenchida. Gere em runware.ai/dashboard (Create key).' };
        }
        try {
            const localUrl = await generateImageViaRunware('test', config, { width: 512, height: 512 }, rwPool[0].key);
            return { success: true, message: `Runware (${config.runwareImageModel || 'runware:100@1'}) gerando imagens com sucesso!`, provider: 'Runware', imageUrl: localUrl };
        } catch (error) {
            return { success: false, provider: 'Runware', error: `Falha ao gerar imagem com Runware: ${error.message}` };
        }
    }

    // Test Pollinations (always available, no key needed)
    if (provider === 'pollinations') {
        try {
            const pollinationsUrl = 'https://image.pollinations.ai/prompt/test?width=64&height=64&model=flux&nologo=true';
            await axios.head(pollinationsUrl, { timeout: 10000 });
            return { success: true, message: 'Pollinations.ai (FLUX) disponível!', provider: 'Pollinations.ai' };
        } catch (error) {
            return { success: false, provider: 'Pollinations.ai', error: `Pollinations.ai indisponível: ${error.message}` };
        }
    }

    // Test all
    if (config.geminiApiKey) {
        try {
            const text = await callGeminiGenerate(config.geminiApiKey, 'Diga apenas OK', 15000);
            if (text) {
                return { success: true, message: 'Conexão com Google Gemini estabelecida com sucesso!', provider: 'Google Gemini' };
            }
        } catch (error) {
            console.warn('[AI] Gemini test error:', error.message);
        }
    }

    if (config.openaiApiKey) {
        try {
            const res = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: 'Diga OK' }],
                max_tokens: 5
            }, {
                headers: {
                    'Authorization': `Bearer ${config.openaiApiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });

            if (res.status === 200) {
                return { success: true, message: 'Conexão com OpenAI estabelecida com sucesso!', provider: 'OpenAI' };
            }
        } catch (error) {
            return { success: false, error: `Falha ao conectar com OpenAI: ${error.response?.data?.error?.message || error.message}` };
        }
    }

    // Test Hugging Face in auto mode
    if (config.huggingfaceApiKey) {
        try {
            const res = await axios.post(
                'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-dev',
                { inputs: 'test', parameters: { width: 64, height: 64, num_inference_steps: 1 } },
                {
                    headers: {
                        'Authorization': `Bearer ${config.huggingfaceApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    responseType: 'arraybuffer',
                    timeout: 30000
                }
            );
            if (res.data && res.data.byteLength > 0) {
                return { success: true, message: 'Conexão com Hugging Face estabelecida com sucesso!', provider: 'Hugging Face' };
            }
        } catch (error) {
            console.warn('[AI] Hugging Face test error:', error.message);
        }
    }

    // Test Cloudflare in auto mode
    if (config.cloudflareAccountId && config.cloudflareApiToken) {
        try {
            const res = await axios.post(
                `https://api.cloudflare.com/client/v4/accounts/${config.cloudflareAccountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
                { prompt: 'test', steps: 1 },
                {
                    headers: {
                        'Authorization': `Bearer ${config.cloudflareApiToken}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );
            if (res.data?.result?.image) {
                return { success: true, message: 'Conexão com Cloudflare Workers AI estabelecida com sucesso!', provider: 'Cloudflare Workers AI' };
            }
        } catch (error) {
            console.warn('[AI] Cloudflare test error:', error.message);
        }
    }

    // Test Pollinations in auto mode
    try {
        const pollinationsUrl = 'https://image.pollinations.ai/prompt/test?width=64&height=64&model=flux&nologo=true';
        await axios.head(pollinationsUrl, { timeout: 10000 });
        return { success: true, message: 'Conexão com Pollinations.ai (FLUX) estabelecida com sucesso!', provider: 'Pollinations.ai' };
    } catch (error) {
        console.warn('[AI] Pollinations test error:', error.message);
    }

    return {
        success: false,
        error: 'Nenhuma chave de IA válida configurada. Salve suas credenciais primeiro.'
    };
}

// Gera descrição visual contextualizada de alta precisão quando as APIs de LLM não estão disponíveis
function buildAccurateVisualDescription(title, visualIdentity) {
    const clean = title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // 1. Futebol / Esportes (garantindo que times e partidas gerem estádio/partida e não pessoas aleatórias)
    if (/futebol|esporte|gol|campeonato|timao|corinthians|flamengo|palmeiras|libertadores|sao paulo|internacional|brasileirao|jogo|partida|champions|rodada|roma|inter|milan|juventus|real madrid|barcelona|serie a|mundial|copa|selecao|torneio|final|classico|derby/.test(clean)) {
        return `Dynamic action sports photography of a professional soccer match representing ${title}, two soccer players fiercely competing for the ball on a pristine stadium pitch, vivid and accurate team kits, dramatic stadium floodlights, blurred cheering fans in background, highly detailed photorealistic sports photography, 8k resolution, no text, no watermark`;
    }

    // 2. Culinária / Alimentos / Receitas
    if (/bolo|doce|chocolate|receita|comida|prato|restaurante|cafe|lanche|pizza|hamburguer|culinaria|sobremesa|sabor|almoco|jantar|cozinhar|carne|frango|salada|morango|sorvete/.test(clean)) {
        return `Mouthwatering gourmet food photography representing ${title}, freshly prepared with exquisite presentation, warm culinary studio lighting, shallow depth of field, rustic tabletop, appetizing steam, rich textures, 8k resolution, cinematic award-winning food styling, no text, no watermark`;
    }

    // 3. Finanças / Dinheiro / Investimentos / Negócios / Vendas
    if (/dinheiro|vendas|investimento|financas|lucro|renda|economia|dolar|bolsa|cripto|bitcoin|negocio|empresa|empreendedor|vender|marketing|cliente|sucesso|carreira|trabalho/.test(clean)) {
        return `Sophisticated modern business and financial success scene representing ${title}, sleek luxury executive office with glass skyscraper view, financial growth graphs, warm ambient lighting, elegant composition, high resolution 8k, photorealistic, professional atmosphere, no text, no watermark`;
    }

    // 4. Tecnologia / Smartphones / Gadgets / IA / Software
    if (/tecnologia|tech|\bia\b|inteligencia artificial|celular|smartphone|iphone|computador|setup|game|gamer|software|programacao|app|robo|gadget|smartwatch|fone|bluetooth|notebook/.test(clean)) {
        return `Futuristic sleek high-end technology visual representing ${title}, premium minimalist desk setup, subtle cybernetic lighting, clean glass and matte metallic textures, cinematic lighting, 8k render, hyper-detailed, no text, no letters`;
    }

    // 5. Beleza / Skincare / Cosméticos / Maquiagem / Cabelo
    if (/maquiagem|pele|skincare|beleza|cabelo|estetica|cosmetico|perfume|spa|unha|rosto|hidratante|batom/.test(clean)) {
        return `Luxury aesthetic beauty and skincare photography representing ${title}, pristine clean marble background, natural botanical elements, soft morning sunlight, pastel tones, macro clarity, 8k, elegant commercial composition, no text, no watermark`;
    }

    // 6. Fitness / Saúde / Academia / Emagrecer / Dieta
    if (/treino|academia|fitness|saude|dieta|emagrecer|musculacao|exercicio|crossfit|suplemento|corrida|correr/.test(clean)) {
        return `Dynamic energetic fitness and health scene representing ${title}, modern state-of-the-art gym, dramatic directional athletic lighting, inspiring atmosphere, crisp 8k photography, sharp athletic details, no text, no words`;
    }

    // 7. Frases / Motivação / Espiritual / Reflexão / Mindset
    if (/frase|motivacao|reflexao|sucesso|mente|fe|deus|oracao|pensamento|dia|bom dia|vida|paz|gratidao|proposito|inspiracao/.test(clean)) {
        return `Breathtaking inspiring natural landscape representing ${title}, magnificent golden hour sunrise over majestic mountain peaks, peaceful sunbeams breaking through mist, serene inspiring atmosphere, cinematic 8k wallpaper, vibrant colors, no text`;
    }

    // 8. Viagem / Praias / Turismo / Férias / Natureza
    if (/viagem|viajar|praia|ferias|turismo|hotel|natureza|paisagem|trilha|ilha|resort|montanha|passeio/.test(clean)) {
        return `Spectacular travel landscape photography representing ${title}, gorgeous tropical scenic paradise, crystal clear turquoise water, vibrant natural sunlight, national geographic quality, 8k, cinematic panorama, no text`;
    }

    // 9. Moda / Roupas / Calçados / Estilo
    if (/moda|look|roupa|vestido|tenis|sapato|estilo|fashion|tendencia|bolsa|acessorio|calcado/.test(clean)) {
        return `High fashion editorial studio photography representing ${title}, contemporary designer aesthetic, elegant softbox lighting, clean neutral studio backdrop, sharp fabric textures, 8k, ultra-stylish look, no text`;
    }

    // 10. Veículos / Carros / Motos
    if (/carro|veiculo|moto|automovel|corrida|motor|pilotar|caminhao|esportivo/.test(clean)) {
        return `Sleek luxury modern automobile photography representing ${title}, reflective clean asphalt road at twilight, gleaming reflections, volumetric rim light, cinematic 8k, automotive magazine cover quality, no text`;
    }

    // 11. Animais / Pets
    if (/pet|cachorro|gato|cao|filhote|animal|veterinario|racao/.test(clean)) {
        return `Heartwarming detailed portrait photography of adorable healthy pet representing ${title}, expressive eyes, warm natural outdoor sunlight, soft bokeh background, 8k macro detail, photorealistic, no text`;
    }

    // 12. Fallback geral dinâmico extraindo palavras-chave
    const stopWords = new Set(['para', 'pela', 'pelo', 'com', 'sem', 'apos', 'sobre', 'onde', 'como', 'mais', 'menos', 'entre', 'esse', 'essa', 'esta', 'este', 'isso', 'aquele', 'aquela', 'voce', 'dicas', 'passo']);
    const keywords = clean.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w)).slice(0, 4).join(' ');

    return `Stunning professional social media visual concept representing "${title}" (${keywords}), beautifully balanced cinematic composition, rich realistic textures, volumetric soft studio lighting, depth of field bokeh, high resolution 8k, photorealistic masterpiece, no text, no watermark`;
}

// Gera prompt contextualizado e culturalmente exato para cards espirituais (Umbanda)
// usando Gemini (com fallback para 9Router e OpenAI), traduzindo para prompt fotográfico
// em inglês ideal para o Cloudflare (FLUX / SDXL) com personagem à direita e fundo escuro à esquerda.
async function generateCardPromptWithLLM(phrase, style, config, imageProvider) {
    let customTemplate = '';
    try {
        customTemplate = (await db.getSystemConfig(`card_prompt_${style.id}`)) || '';
    } catch (_) {}

    const isNonOpenAI = String(imageProvider || 'auto').toLowerCase() !== 'openai';

    const systemPrompt = `Você é um diretor de arte sênior e especialista visual nas tradições, entidades e arquétipos da Umbanda brasileira (Pretos-Velhos, Caboclos, Baianos, Exus, Pombagiras, Erês).

Sua missão é criar um PROMPT EM INGLÊS para gerar a imagem hiper-realista no modelo ${isNonOpenAI ? 'FLUX / Stable Diffusion (Cloudflare Workers AI)' : 'DALL-E 3'}.

${customTemplate ? `## DIRETRIZES DO ESTILO:\n${customTemplate.slice(0, 1500)}\n` : ''}
## FRASE DA PUBLICAÇÃO:
"${phrase}"

## REGRAS VISUAIS OBRIGATÓRIAS:
1. IDENTIFIQUE A ENTIDADE PRINCIPAL DA FRASE COM MÁXIMA FIDELIDADE:
   - Se Pai João ou Preto-Velho: Homem negro idoso (75-80 anos), barba branca farta e volumosa, rugas profundas de sabedoria, pele negra envelhecida, olhar sereno e acolhedor. VESTE ROUPA TODA BRANCA de linho ou algodão (camisa branca e calça branca), coifa ou chapéu branco claro, guias de contas no peito, segurando bengala de madeira rústica ou cachimbo com fumaça suave.
   - Se Vovó Maria Conga ou Preta-Velha: Idosa negra (80 anos), sorriso doce e afetuoso, vestindo roupa ou vestido TODO BRANCO bordado, turbante branco na cabeça, terço de contas de madeira.
   - Se Seu Zé Pelintra: Homem negro elegante e carismático (60 anos), bigode branco/grisalho, sorriso largo e acolhedor, terno de linho branco ou camisa branca com gravata/cachecol vermelho, chapéu Panamá branco com fita vermelha, segurando cartas de baralho ou bengala.
   - Se Exu Tiriri ou Exu: Homem negro vigoroso e imponente (40 anos), olhar firme e penetrante, trajes pretos e vermelhos nobres, chapéu preto com fita vermelha, guias pretas e vermelhas, atmosfera mística com vela e fumaça.
   - Se Pombagira ou Maria Caveira: Mulher negra majestosa e altiva, vestido preto com detalhes vermelhos elegantes, véu ou chapéu de aba, batom vermelho, segurando rosa vermelha ou cigarrilha com fumaça sutil.
   - Se Erê: Criança negra radiante e alegre (6-8 anos), olhar brilhante e sorriso espontâneo, roupas festivas e luminosas, estrelas ou doces.
   - Se Caboclo: Indígena nobre e imponente, olhar altivo no horizonte, cocar de penas nobres, colares de sementes, arco tradicional.
   - Se Baiano: Homem negro acolhedor com chapéu de palha, camisa de linho clara, sorriso caloroso.
   - Se não citar entidade específica: Guardião ancestral africano idoso, sábio e respeitado.

2. COMPOSIÇÃO DO QUADRO:
   - O PERSONAGEM DEVE FICAR ESTRITAMENTE NO LADO DIREITO (strictly on the right side of the frame).
   - O LADO ESQUERDO DO QUADRO DEVE SER ESCURO, SUAVE E VAZIO (smooth dark atmospheric negative space on the left, empty, deep shadows) para sobreposição de texto posterior.
   - Iluminação noturna, luz quente e suave de vela âmbar, sombras chiaroscuro.

3. ESTILO E FOTOGRAFIA:
   - Fotografia cinematográfica hiper-realista, 8k, textura de pele natural com poros, tecidos detalhados, acabamento editorial premium, lente 85mm f/1.8.
   - PROIBIDO: NENHUM texto, palavras, letras, números, marcas ou tipografia na imagem (CRITICAL: NO TEXT, NO WORDS, NO LETTERS).
   - NUNCA crie estátuas, esculturas, desenhos ou personagens 3D cartoon.

4. TAMANHO DO PROMPT:
   - O texto do prompt em inglês deve ter entre 400 e 1000 caracteres (máximo absoluto de 1200 caracteres).

RESPONDA APENAS COM O PROMPT EM INGLÊS DIRETO, SEM INTRODUÇÃO, SEM ASPAS, SEM EXPLICAÇÕES.`;

    // 1. Tenta OpenAI (ChatGPT — prioridade: melhor direção criativa)
    if (config.openaiApiKey) {
        try {
            console.log('[AI] Gerando prompt visual rico via OpenAI...');
            const res = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: systemPrompt }],
                max_tokens: 500,
                temperature: 0.7
            }, {
                headers: {
                    'Authorization': `Bearer ${config.openaiApiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 20000
            });
            const content = res.data?.choices?.[0]?.message?.content?.trim();
            if (content && content.length > 50) {
                let clean = content.replace(/^["']|["']$/g, '').trim();
                if (clean.length > 1500) clean = clean.slice(0, 1500);
                if (!clean.toUpperCase().includes('NO TEXT')) {
                    clean += '. NO TEXT, NO WORDS, NO LETTERS, NO TYPOGRAPHY.';
                }
                return clean;
            }
        } catch (e) {
            console.warn('[AI] Falha ao gerar prompt via OpenAI:', e.message);
        }
    }

    // 2. Tenta Gemini
    if (config.geminiApiKey) {
        try {
            console.log('[AI] Gerando prompt visual rico via Gemini...');
            const result = await callGeminiGenerate(config.geminiApiKey, systemPrompt, 20000);
            if (result && result.trim().length > 50) {
                let clean = result.trim().replace(/^["']|["']$/g, '').trim();
                if (clean.length > 1500) clean = clean.slice(0, 1500);
                if (!clean.toUpperCase().includes('NO TEXT')) {
                    clean += '. NO TEXT, NO WORDS, NO LETTERS, NO TYPOGRAPHY.';
                }
                return clean;
            }
        } catch (e) {
            console.warn('[AI] Falha ao gerar prompt via Gemini:', e.message);
        }
    }

    // 3. Tenta 9Router
    if (config.ninerouterUrl) {
        try {
            console.log('[AI] Gerando prompt visual rico via 9Router...');
            const baseUrl = config.ninerouterUrl.replace(/\/+$/, '');
            const headers = { 'Content-Type': 'application/json' };
            if (config.ninerouterApiKey) headers['Authorization'] = `Bearer ${config.ninerouterApiKey}`;
            const res = await axios.post(`${baseUrl}/chat/completions`, {
                model: 'gemini-1.5-flash',
                messages: [{ role: 'user', content: systemPrompt }],
                max_tokens: 500,
                temperature: 0.7
            }, { headers, timeout: 20000 });
            const content = res.data?.choices?.[0]?.message?.content?.trim();
            if (content && content.length > 50) {
                let clean = content.replace(/^["']|["']$/g, '').trim();
                if (clean.length > 1500) clean = clean.slice(0, 1500);
                if (!clean.toUpperCase().includes('NO TEXT')) {
                    clean += '. NO TEXT, NO WORDS, NO LETTERS, NO TYPOGRAPHY.';
                }
                return clean;
            }
        } catch (e) {
            console.warn('[AI] Falha ao gerar prompt via 9Router:', e.message);
        }
    }

    return null;
}

// Gera prompt contextualizado para cards de DILEMAS (multi-nicho: relacionamento/ex, futebol, cotidiano, trabalho, etc.)
// baseado no PROMPT MESTRE UNIVERSAL DE DILEMAS com catálogo de 24 nichos (A-X), temas transversais e emoções.
async function generateDilemaPromptWithLLM(phrase, style, config, imageProvider) {
    let customTemplate = '';
    try {
        customTemplate = (await db.getSystemConfig(`card_prompt_${style.id}`)) || '';
    } catch (_) {}

    const isNonOpenAI = String(imageProvider || 'auto').toLowerCase() !== 'openai';

    const systemPrompt = `You are a senior art director specialized in hyper-realistic cinematic photography for social media.
Based on the following received phrase, your ONLY task is to create a DETAILED and DIRECT PROMPT IN ENGLISH to generate an impressive cinematic photographic scene that perfectly represents the context, emotion and niche of the phrase. This image will be the FULL-BLEED BACKGROUND of a vertical dilemma card (the texts, question, 2 choices and CTA will be overlaid later by code, NEVER by the image model).

RECEIVED PHRASE:
"${phrase}"

MANDATORY RULES FOR THE IMAGE PROMPT:
1. CINEMATIC EMOTIONAL VISUAL SCENE (ADAPTED TO THE PHRASE CONTEXT):
   - If the phrase mentions entities, spirituality, faith or new beginnings (e.g. Erê, orixá, peace, hope, smile): create a warm magical scene with a smiling child or serene figure under golden sunset light (golden hour), with soft traditional elements, nature, candles or colorful ribbons in the background.
   - If it is about relationships/family/work/overcoming: create the corresponding human scene with authentic expressiveness.
   - Always vary scenarios, lighting and people according to the subject. NEVER use generic worried men by a window unless the phrase asks for it.

2. ESSENTIAL COMPOSITION (FULL-BLEED VERTICAL CARD BACKGROUND):
   - Vertical composition with the main subject in the CENTER of the frame, leaving the TOP 35% of the image with darker soft sky/background for the title and the BOTTOM 30% slightly darker for the question and choice buttons.
   - Deep soft shadows at top and bottom, gently blurred background (shallow depth of field), warm cinematic tones.

3. STYLE AND QUALITY:
   - Ultra-realistic cinematic photography, 8k, 85mm f/1.8 lens, dramatic moody chiaroscuro or magical golden light, rich skin and fabric textures.
   - Natural inspiring facial expression.
   - STRICTLY FORBIDDEN: NO TEXT, NO LETTERS, NO NUMBERS, NO WATERMARKS IN THE IMAGE (NO TEXT, NO WORDS, NO LETTERS, NO TYPOGRAPHY).
   - NEVER generate illustrations, cartoons or 3D.

4. SIZE:
   - Maximum 900 characters of direct English.

RESPOND ONLY WITH THE DIRECT ENGLISH PROMPT, WITH NO INTRODUCTION, NO QUOTES, NO EXPLANATIONS.`;

    // 1. Tenta OpenAI (ChatGPT — prioridade: melhor direção criativa)
    if (config.openaiApiKey) {
        try {
            console.log('[AI] Card Dilemas: gerando prompt fotográfico contextual via OpenAI...');
            const res = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: systemPrompt }],
                max_tokens: 500,
                temperature: 0.7
            }, {
                headers: {
                    'Authorization': `Bearer ${config.openaiApiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 20000
            });
            const content = res.data?.choices?.[0]?.message?.content?.trim();
            if (content && content.length > 50) {
                let clean = content.replace(/^["']|["']$/g, '').trim();
                if (clean.length > 1500) clean = clean.slice(0, 1500);
                if (!clean.toUpperCase().includes('NO TEXT')) {
                    clean += '. NO TEXT, NO WORDS, NO LETTERS, NO TYPOGRAPHY.';
                }
                return clean;
            }
        } catch (e) {
            console.warn('[AI] Falha ao gerar prompt de dilema via OpenAI:', e.message);
        }
    }

    // 2. Tenta Gemini
    if (config.geminiApiKey) {
        try {
            console.log('[AI] Card Dilemas: gerando prompt fotográfico contextual via Gemini...');
            const result = await callGeminiGenerate(config.geminiApiKey, systemPrompt, 20000);
            if (result && result.trim().length > 50) {
                let clean = result.trim().replace(/^["']|["']$/g, '').trim();
                if (clean.length > 1500) clean = clean.slice(0, 1500);
                if (!clean.toUpperCase().includes('NO TEXT')) {
                    clean += '. NO TEXT, NO WORDS, NO LETTERS, NO TYPOGRAPHY.';
                }
                return clean;
            }
        } catch (e) {
            console.warn('[AI] Falha ao gerar prompt de dilema via Gemini:', e.message);
        }
    }

    // 3. Tenta 9Router
    if (config.ninerouterUrl) {
        try {
            console.log('[AI] Card Dilemas: gerando prompt fotográfico contextual via 9Router...');
            const baseUrl = config.ninerouterUrl.replace(/\/+$/, '');
            const headers = { 'Content-Type': 'application/json' };
            if (config.ninerouterApiKey) headers['Authorization'] = `Bearer ${config.ninerouterApiKey}`;
            const res = await axios.post(`${baseUrl}/chat/completions`, {
                model: 'gemini-1.5-flash',
                messages: [{ role: 'user', content: systemPrompt }],
                max_tokens: 500,
                temperature: 0.7
            }, { headers, timeout: 20000 });
            const content = res.data?.choices?.[0]?.message?.content?.trim();
            if (content && content.length > 50) {
                let clean = content.replace(/^["']|["']$/g, '').trim();
                if (clean.length > 1500) clean = clean.slice(0, 1500);
                if (!clean.toUpperCase().includes('NO TEXT')) {
                    clean += '. NO TEXT, NO WORDS, NO LETTERS, NO TYPOGRAPHY.';
                }
                return clean;
            }
        } catch (e) {
            console.warn('[AI] Falha ao gerar prompt de dilema via 9Router:', e.message);
        }
    }

    return null;
}

// Gera prompt contextualizado para cards TWITTER/X via PROMPT UNIVERSAL:
// o LLM interpreta a frase (nicho, personagem, emoção, símbolos) e devolve
// o PROMPT EM INGLÊS da cena de fundo — sem misturar contextos/religiões.
async function generateTwitterPromptWithLLM(phrase, style, config, imageProvider) {
    let customTemplate = '';
    try {
        customTemplate = (await db.getSystemConfig(`card_prompt_${style.id}`)) || '';
    } catch (_) {}

    const isNonOpenAI = String(imageProvider || 'auto').toLowerCase() !== 'openai';

    const systemPrompt = `You are an expert in text interpretation, niche identification, cultural references, characters, religions and cinematic image creation for social media.

Your mission: receive a phrase, understand its meaning, identify the subject and generate a DIRECT PROMPT IN ENGLISH for an image model (${isNonOpenAI ? 'FLUX / Stable Diffusion (Cloudflare Workers AI)' : 'DALL-E 3'}). This image will be ONLY the background of a square Twitter/X-style card (texts, avatar, footer icons are overlaid later by code, NEVER by the image model).

RECEIVED PHRASE:
"${phrase}"

${customTemplate ? `## STYLE GUIDELINES:\n${customTemplate.slice(0, 1000)}\n` : ''}

ANALYZE BEFORE GENERATING (internal, do not output):
1. Central theme and niche of the phrase (Christianity/Jesus, Umbanda/Candomblé entities, other religions, motivation, love, football, business, humor, any other subject — never force the phrase into a known category).
2. The character, entity, person, animal or concept mentioned; literal and emotional meaning; predominant emotion (hope, love, sadness, joy, faith, courage, humor, reflection, overcoming).
3. The correct appearance: clothes, objects, symbols, setting, colors — and elements that must NOT appear because they clash with the context.

ABSOLUTE RULE — NEVER MIX CONTEXTS:
- A phrase about an Erê demands a CHILD figure (joyful, innocent; light clothes, straw hat, colorful ribbons, toys, sweets when fitting). NEVER tridents, Exu canes, or dark malandro aesthetics.
- A phrase about Jesus demands a respectful adult Christian context (medium/long hair, beard, simple clothes, warm welcoming light, biblical landscapes or gestures of compassion when fitting). NEVER Umbanda symbols.
- A phrase about Exus/Pombagiras/Pretos-Velhos/Caboclos: depict THAT specific entity faithfully, never borrow another character's traits.
- A phrase about football demands sports elements, not random religious symbols.
- A motivational phrase gets no religious character unless the text justifies it.
- When in doubt about a symbol, prefer a neutral respectful representation over inventing details.

CHARACTER FIDELITY EXAMPLES:
- Jesus Christ: respectful adult, medium or long hair, beard, simple clothes, warm light. Do not turn Jesus-inspired phrases into literal Bible quotes.
- Erês: child figure, cheerful/innocent/spontaneous expression.
- Pretos-Velhos: serene wise elderly figures, coherent traditional setting.
- Caboclos: natural and cultural elements fitting the specific character, no generic stereotypes.

SCENE: cinematic composition transmitting the phrase's meaning and emotion (hope = dawn/soft light; sadness = delicate emotive light; love = warmth; faith = symbols coherent with the identified tradition; joy = natural smiles).

MANDATORY COMPOSITION FOR THE BACKGROUND:
- Square 1:1. Dark charcoal Twitter/X post mockup aesthetic, thin rounded post frame inset from edges, cinematic lighting, high contrast, realistic finish.
- Main character or element preferentially on the RIGHT side of the frame.
- LEFT side: smooth dark empty negative space for text overlay.
- TOP LEFT: a circular avatar medallion silhouette area, empty, no face detail.
- BOTTOM: thin divider line and small minimal abstract gray UI glyph shapes (bubble, arrows, heart, ribbon, upload), purely decorative, nothing resembling letters.
- STRICTLY FORBIDDEN: ANY TEXT, LETTERS, NUMBERS, VERIFICATION SEALS, OFFICIAL PROFILES, BRANDS or typography in the image (NO TEXT, NO WORDS, NO LETTERS, NO TYPOGRAPHY).
- NEVER statues, sculptures, paintings, drawings, 3D cartoons, deformed anatomy.
- Maximum 1000 characters of direct English.

RESPOND ONLY WITH THE DIRECT ENGLISH PROMPT, NO INTRODUCTION, NO QUOTES, NO EXPLANATIONS.`;

    // 1. Tenta OpenAI (ChatGPT — prioridade: melhor direção criativa)
    if (config.openaiApiKey) {
        try {
            console.log('[AI] Card Twitter/X: gerando prompt contextual via OpenAI...');
            const res = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: systemPrompt }],
                max_tokens: 500,
                temperature: 0.7
            }, {
                headers: {
                    'Authorization': `Bearer ${config.openaiApiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 20000
            });
            const content = res.data?.choices?.[0]?.message?.content?.trim();
            if (content && content.length > 50) {
                let clean = content.replace(/^["']|["']$/g, '').trim();
                if (clean.length > 1500) clean = clean.slice(0, 1500);
                if (!clean.toUpperCase().includes('NO TEXT')) {
                    clean += '. NO TEXT, NO WORDS, NO LETTERS, NO TYPOGRAPHY.';
                }
                return clean;
            }
        } catch (e) {
            console.warn('[AI] Falha ao gerar prompt Twitter/X via OpenAI:', e.message);
        }
    }

    // 2. Tenta Gemini
    if (config.geminiApiKey) {
        try {
            console.log('[AI] Card Twitter/X: gerando prompt contextual via Gemini...');
            const result = await callGeminiGenerate(config.geminiApiKey, systemPrompt, 20000);
            if (result && result.trim().length > 50) {
                let clean = result.trim().replace(/^["']|["']$/g, '').trim();
                if (clean.length > 1500) clean = clean.slice(0, 1500);
                if (!clean.toUpperCase().includes('NO TEXT')) {
                    clean += '. NO TEXT, NO WORDS, NO LETTERS, NO TYPOGRAPHY.';
                }
                return clean;
            }
        } catch (e) {
            console.warn('[AI] Falha ao gerar prompt Twitter/X via Gemini:', e.message);
        }
    }

    // 3. Tenta 9Router
    if (config.ninerouterUrl) {
        try {
            console.log('[AI] Card Twitter/X: gerando prompt contextual via 9Router...');
            const baseUrl = config.ninerouterUrl.replace(/\/+$/, '');
            const headers = { 'Content-Type': 'application/json' };
            if (config.ninerouterApiKey) headers['Authorization'] = `Bearer ${config.ninerouterApiKey}`;
            const res = await axios.post(`${baseUrl}/chat/completions`, {
                model: 'gemini-1.5-flash',
                messages: [{ role: 'user', content: systemPrompt }],
                max_tokens: 500,
                temperature: 0.7
            }, { headers, timeout: 20000 });
            const content = res.data?.choices?.[0]?.message?.content?.trim();
            if (content && content.length > 50) {
                let clean = content.replace(/^["']|["']$/g, '').trim();
                if (clean.length > 1500) clean = clean.slice(0, 1500);
                if (!clean.toUpperCase().includes('NO TEXT')) {
                    clean += '. NO TEXT, NO WORDS, NO LETTERS, NO TYPOGRAPHY.';
                }
                return clean;
            }
        } catch (e) {
            console.warn('[AI] Falha ao gerar prompt Twitter/X via 9Router:', e.message);
        }
    }

    return null;
}

// Gera prompt contextualizado para o card ROMÂNTICO ILUSTRADO:
// o LLM interpreta a emoção da frase e devolve o PROMPT EM INGLÊS do fundo
// ilustrado (a frase é estampada depois em vetor, nunca pelo modelo).
async function generateRomanticoPromptWithLLM(phrase, style, config, imageProvider) {
    let customTemplate = '';
    try {
        customTemplate = (await db.getSystemConfig(`card_prompt_${style.id}`)) || '';
    } catch (_) {}

    const systemPrompt = `You are a senior art director specialized in delicate romantic digital illustration for social media love-quote pages.

Based on the received phrase, your ONLY task is to create a DETAILED and DIRECT PROMPT IN ENGLISH for the illustrated BACKGROUND of a square card (the phrase will be overlaid later by code in the upper third, NEVER by the image model).

RECEIVED PHRASE:
"${phrase}"

${customTemplate ? `## STYLE GUIDELINES:\n${customTemplate.slice(0, 1000)}\n` : ''}

RULES:
1. READ THE PHRASE and identify the core emotion: love, saudade, affection, reciprocity, passion, disappointment, self-esteem, overcoming or reflection.
2. SCENE (LOWER two thirds): for love/affection phrases, a cozy adult couple cuddled in bed in a quiet tender moment (dark-haired man, brown-haired woman, side by side in a delicate embrace, eyes closed, comfort and trust; old-rose, beige and mauve bedding; cozy bedroom; golden sunset through a window; tiny decorative hearts; tender non-explicit intimacy, no nudity). For NON-romantic phrases adapt: friendship (friends showing affection), family (warm family scene), self-esteem (confident contemplative character), overcoming (character before a lit window / new horizon), saudade (contemplative setting), reflection (delicate symbolic composition). Never force a bed couple on a non-romantic phrase and never mix contexts.
3. UPPER THIRD: soft light pastel blurred empty background (cream, peach, pale rose), smooth, no objects, no faces — clean space for typography.
4. STYLE: semi-realistic digital illustration, romantic animation finish, soft clean lines, delicate shadows, warm light, pastel tones, natural well-drawn faces, cozy nostalgic atmosphere. NOT photorealistic, no photography.
5. STRICTLY FORBIDDEN: ANY TEXT, LETTERS, NUMBERS, WATERMARKS (NO TEXT, NO WORDS, NO LETTERS, NO TYPOGRAPHY). No deformed anatomy, no extra fingers, no explicit nudity.
6. Square 1:1. Maximum 900 characters of direct English.

RESPOND ONLY WITH THE DIRECT ENGLISH PROMPT, NO INTRODUCTION, NO QUOTES, NO EXPLANATIONS.`;

    // 1. Tenta OpenAI (ChatGPT — prioridade: melhor direção criativa)
    if (config.openaiApiKey) {
        try {
            console.log('[AI] Card Romântico Ilustrado: gerando prompt contextual via OpenAI...');
            const res = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: systemPrompt }],
                max_tokens: 500,
                temperature: 0.7
            }, {
                headers: {
                    'Authorization': `Bearer ${config.openaiApiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 20000
            });
            const content = res.data?.choices?.[0]?.message?.content?.trim();
            if (content && content.length > 50) {
                let clean = content.replace(/^["']|["']$/g, '').trim();
                if (clean.length > 1500) clean = clean.slice(0, 1500);
                if (!clean.toUpperCase().includes('NO TEXT')) {
                    clean += '. NO TEXT, NO WORDS, NO LETTERS, NO TYPOGRAPHY.';
                }
                return clean;
            }
        } catch (e) {
            console.warn('[AI] Falha ao gerar prompt romântico via OpenAI:', e.message);
        }
    }

    // 2. Tenta Gemini
    if (config.geminiApiKey) {
        try {
            console.log('[AI] Card Romântico Ilustrado: gerando prompt contextual via Gemini...');
            const result = await callGeminiGenerate(config.geminiApiKey, systemPrompt, 20000);
            if (result && result.trim().length > 50) {
                let clean = result.trim().replace(/^["']|["']$/g, '').trim();
                if (clean.length > 1500) clean = clean.slice(0, 1500);
                if (!clean.toUpperCase().includes('NO TEXT')) {
                    clean += '. NO TEXT, NO WORDS, NO LETTERS, NO TYPOGRAPHY.';
                }
                return clean;
            }
        } catch (e) {
            console.warn('[AI] Falha ao gerar prompt romântico via Gemini:', e.message);
        }
    }

    // 3. Tenta 9Router
    if (config.ninerouterUrl) {
        try {
            console.log('[AI] Card Romântico Ilustrado: gerando prompt contextual via 9Router...');
            const baseUrl = config.ninerouterUrl.replace(/\/+$/, '');
            const headers = { 'Content-Type': 'application/json' };
            if (config.ninerouterApiKey) headers['Authorization'] = `Bearer ${config.ninerouterApiKey}`;
            const res = await axios.post(`${baseUrl}/chat/completions`, {
                model: 'gemini-1.5-flash',
                messages: [{ role: 'user', content: systemPrompt }],
                max_tokens: 500,
                temperature: 0.7
            }, { headers, timeout: 20000 });
            const content = res.data?.choices?.[0]?.message?.content?.trim();
            if (content && content.length > 50) {
                let clean = content.replace(/^["']|["']$/g, '').trim();
                if (clean.length > 1500) clean = clean.slice(0, 1500);
                if (!clean.toUpperCase().includes('NO TEXT')) {
                    clean += '. NO TEXT, NO WORDS, NO LETTERS, NO TYPOGRAPHY.';
                }
                return clean;
            }
        } catch (e) {
            console.warn('[AI] Falha ao gerar prompt romântico via 9Router:', e.message);
        }
    }

    return null;
}

// Gera prompt contextualizado para o card CRISTÃO CINEMATOGRÁFICO:
// o LLM interpreta a frase, identifica a passagem/personagem/cena bíblica
// e devolve o PROMPT EM INGLÊS do fundo fotorrealista (a frase e a marca
// FOCO EM CRISTO são estampadas depois em vetor, nunca pelo modelo).
async function generateCristaoPromptWithLLM(phrase, style, config, imageProvider) {
    let customTemplate = '';
    try {
        customTemplate = (await db.getSystemConfig(`card_prompt_${style.id}`)) || '';
    } catch (_) {}

    const systemPrompt = `You are a senior art director specialized in ultra-realistic cinematic Christian Bible art for social media.

Based on the received phrase, your ONLY task is to create a DETAILED and DIRECT PROMPT IN ENGLISH for the PHOTOREALISTIC BACKGROUND of a vertical 4:5 card (the phrase and brand mark will be overlaid later by code, NEVER by the image model).

RECEIVED PHRASE:
"${phrase}"

${customTemplate ? `## STYLE GUIDELINES:\n${customTemplate.slice(0, 1000)}\n` : ''}

RULES:
1. READ THE PHRASE and identify: the biblical passage (if referenced), the main character (Jesus, Moses, David, Paul, etc.), the specific event/scene, and the core emotion (faith, courage, hope, deliverance, worship, peace, awe, etc.).
2. MAIN CHARACTER (RIGHT 60% of frame): portray the identified character faithfully to the biblical narrative.
   - JESUS: Semitic features, beard, period-appropriate robes, expression matching the passage (compassionate, authoritative, suffering, resurrected glory, teaching, calming storm, etc.).
   - MOSES: Elderly, long white/gray beard, beige/brown robes, head covering, wooden staff when appropriate.
   - DAVID: Young shepherd or king, harp/sling/crown as context demands.
   - PAUL: Roman-era attire, scrolls, chains if imprisonment.
   - OTHERS: Adapt accurately. NEVER mix characters/events from different passages.
3. SCENE & BACKGROUND: Grand biblical landscape — rocky mountains, dramatic sky, golden sun rays breaking through clouds (crepuscular rays), volumetric lighting. 
   - If Exodus 14 / Red Sea: Moses foreground with staff, Hebrew people behind, TOWERING WALLS OF WATER on both sides with foam, depth, realism.
   - If Gethsemane: Olive trees, night, distant disciples sleeping, anguished prayer.
   - If Calvary: Cross, dark sky, dramatic light.
   - If Sea of Galilee: Storm/waves, boat, Jesus walking or calming.
   - If Throne Room: Heavenly glory, lightning, elders, sea of glass.
   - Default: Epic biblical wilderness/mountains with divine light.
4. STYLE: Photorealistic cinematic, 8K, dramatic volumetric lighting, natural skin texture, correct anatomy, detailed fabric/stone/water. Editorial poster finish. NOT illustration, painting, drawing, cartoon, or artificial 3D.
5. FORMAT: Vertical 4:5 portrait. Maximum 1200 characters of direct English.
6. STRICTLY FORBIDDEN: ANY TEXT, LETTERS, NUMBERS, WATERMARKS, LOGOS, SIGNATURES (NO TEXT, NO WORDS, NO LETTERS, NO TYPOGRAPHY). No deformed anatomy, extra fingers, blurry.

RESPOND ONLY WITH THE DIRECT ENGLISH PROMPT, NO INTRODUCTION, NO QUOTES, NO EXPLANATIONS.`;

    // 1. Tenta OpenAI (ChatGPT — prioridade: melhor direção criativa)
    if (config.openaiApiKey) {
        try {
            console.log('[AI] Card Cristão Cinematográfico: gerando prompt contextual via OpenAI...');
            const res = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: systemPrompt }],
                max_tokens: 500,
                temperature: 0.7
            }, {
                headers: {
                    'Authorization': `Bearer ${config.openaiApiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 20000
            });
            const content = res.data?.choices?.[0]?.message?.content?.trim();
            if (content && content.length > 50) {
                let clean = content.replace(/^["']|["']$/g, '').trim();
                if (clean.length > 1500) clean = clean.slice(0, 1500);
                if (!clean.toUpperCase().includes('NO TEXT')) {
                    clean += '. NO TEXT, NO WORDS, NO LETTERS, NO TYPOGRAPHY.';
                }
                return clean;
            }
        } catch (e) {
            console.warn('[AI] Falha ao gerar prompt cristão via OpenAI:', e.message);
        }
    }

    // 2. Tenta Gemini
    if (config.geminiApiKey) {
        try {
            console.log('[AI] Card Cristão Cinematográfico: gerando prompt contextual via Gemini...');
            const result = await callGeminiGenerate(config.geminiApiKey, systemPrompt, 20000);
            if (result && result.trim().length > 50) {
                let clean = result.trim().replace(/^["']|["']$/g, '').trim();
                if (clean.length > 1500) clean = clean.slice(0, 1500);
                if (!clean.toUpperCase().includes('NO TEXT')) {
                    clean += '. NO TEXT, NO WORDS, NO LETTERS, NO TYPOGRAPHY.';
                }
                return clean;
            }
        } catch (e) {
            console.warn('[AI] Falha ao gerar prompt cristão via Gemini:', e.message);
        }
    }

    // 3. Tenta 9Router
    if (config.ninerouterUrl) {
        try {
            console.log('[AI] Card Cristão Cinematográfico: gerando prompt contextual via 9Router...');
            const baseUrl = config.ninerouterUrl.replace(/\/+$/, '');
            const headers = { 'Content-Type': 'application/json' };
            if (config.ninerouterApiKey) headers['Authorization'] = `Bearer ${config.ninerouterApiKey}`;
            const res = await axios.post(`${baseUrl}/chat/completions`, {
                model: 'gemini-1.5-flash',
                messages: [{ role: 'user', content: systemPrompt }],
                max_tokens: 500,
                temperature: 0.7
            }, { headers, timeout: 20000 });
            const content = res.data?.choices?.[0]?.message?.content?.trim();
            if (content && content.length > 50) {
                let clean = content.replace(/^["']|["']$/g, '').trim();
                if (clean.length > 1500) clean = clean.slice(0, 1500);
                if (!clean.toUpperCase().includes('NO TEXT')) {
                    clean += '. NO TEXT, NO WORDS, NO LETTERS, NO TYPOGRAPHY.';
                }
                return clean;
            }
        } catch (e) {
            console.warn('[AI] Falha ao gerar prompt cristão via 9Router:', e.message);
        }
    }

    return null;
}

// Gera prompt contextualizado para o card BÍBLIA ABERTA CINEMATOGRÁFICA:
// o LLM interpreta a frase e adapta a intensidade da luz, a paisagem e a atmosfera
// ao significado da mensagem (sofrimento→acolhimento, vitória→força, fé→paz),
// mantendo a composição fixa: céu dramático + Bíblia aberta central + vale com caminho e pegadas douradas.
async function generateBibliaAbertaPromptWithLLM(phrase, style, config, imageProvider) {
    let customTemplate = '';
    try {
        customTemplate = (await db.getSystemConfig(`card_prompt_${style.id}`)) || '';
    } catch (_) {}

    const systemPrompt = `You are a senior art director specialized in ultra-realistic cinematic Christian spiritual art for social media.

Based on the received phrase, your ONLY task is to create a DETAILED and DIRECT PROMPT IN ENGLISH for the PHOTOREALISTIC BACKGROUND of a vertical 4:5 card with a FIXED COMPOSITION (the phrase will be overlaid later by code on the Bible pages, NEVER by the image model).

RECEIVED PHRASE:
"${phrase}"

${customTemplate ? `## STYLE GUIDELINES:\n${customTemplate.slice(0, 1000)}\n` : ''}

FIXED COMPOSITION (MUST BE FOLLOWED EXACTLY):
1. UPPER THIRD — DRAMATIC SKY: dense dark storm clouds (deep grays, charcoal, midnight blue) dramatically parted by intense volumetric GOLDEN CELESTIAL LIGHT breaking through — crepuscular rays (god rays) streaming downward. Subtle golden light particles / dust motes floating. Divine, hopeful, ethereal atmosphere. Cinematic contrast between darkness and divine light.
2. MIDDLE (CENTER) — HUGE OPEN BIBLE: a massive ancient Bible seen straight-on, perfectly centered, pages glowing from the celestial light above. Pages in aged beige/parchment tones with realistic paper texture, subtle fiber, slight curling at edges, faint handwritten-style lettering impressions. Thick leather spine in deep brown with subtle gold tooling. The Bible sits naturally integrated into the landscape.
3. LOWER THIRD — VAST ROCKY VALLEY: sweeping biblical wilderness valley toward horizon. Rugged mountains, rocky cliffs, canyons, earth tones (ochre, sienna, umber, golden sand). A NARROW WINDING PATH leads from foreground into distance toward illuminated horizon. ON THE PATH: subtle GOLDEN-ILLUMINATED HUMAN FOOTPRINTS integrated into the rocky ground — each step glowing faintly with divine gold light. Realistic impressions in dust/stone, not stickers. Atmospheric perspective.

ADAPTATION RULES (based on phrase meaning):
- If phrase speaks of SUFFERING/PAIN: softer warmer light, more intimate atmosphere, sense of embrace/comfort.
- If phrase speaks of VICTORY/TRIUMPH: stronger brighter rays, more majestic landscape, sense of power/renewal.
- If phrase speaks of FAITH/TRUST: steady peaceful light, calm atmosphere, sense of confidence/peace.
- If phrase speaks of HOPE: dawn-like light, horizon clearly illuminated, sense of promise/future.
- If phrase speaks of PROTECTION: light forming almost a shield/canopy over the Bible/path.
- NEVER add/remove compositional elements. Only adapt LIGHT INTENSITY, COLOR TEMPERATURE, ATMOSPHERIC MOOD.

STYLE: Photorealistic cinematic, 8K, masterful volumetric lighting, photorealistic textures (rock, paper, leather, dust). NO CHARACTERS, NO FIGURES, NO PEOPLE, NO JESUS, NO MOSES, NO ANGELS, NO CROSSES, NO RELIGIOUS FIGURES. Only the Bible, sky, light, valley, path, golden footprints.

FORMAT: Vertical 4:5 portrait. Maximum 1200 characters of direct English.

STRICTLY FORBIDDEN: ANY TEXT, LETTERS, NUMBERS, WATERMARKS, LOGOS, SIGNATURES, TYPOGRAPHY. NO HUMAN FIGURES, NO RELIGIOUS FIGURES.

RESPOND ONLY WITH THE DIRECT ENGLISH PROMPT, NO INTRODUCTION, NO QUOTES, NO EXPLANATIONS.`;

    // 1. Tenta OpenAI (ChatGPT — prioridade: melhor direção criativa)
    if (config.openaiApiKey) {
        try {
            console.log('[AI] Card Bíblia Aberta Cinematográfica: gerando prompt contextual via OpenAI...');
            const res = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: systemPrompt }],
                max_tokens: 500,
                temperature: 0.7
            }, {
                headers: {
                    'Authorization': `Bearer ${config.openaiApiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 20000
            });
            const content = res.data?.choices?.[0]?.message?.content?.trim();
            if (content && content.length > 50) {
                let clean = content.replace(/^["']|["']$/g, '').trim();
                if (clean.length > 1500) clean = clean.slice(0, 1500);
                if (!clean.toUpperCase().includes('NO TEXT')) {
                    clean += '. NO TEXT, NO WORDS, NO LETTERS, NO TYPOGRAPHY.';
                }
                return clean;
            }
        } catch (e) {
            console.warn('[AI] Falha ao gerar prompt Bíblia Aberta via OpenAI:', e.message);
        }
    }

    // 2. Tenta Gemini
    if (config.geminiApiKey) {
        try {
            console.log('[AI] Card Bíblia Aberta Cinematográfica: gerando prompt contextual via Gemini...');
            const result = await callGeminiGenerate(config.geminiApiKey, systemPrompt, 20000);
            if (result && result.trim().length > 50) {
                let clean = result.trim().replace(/^["']|["']$/g, '').trim();
                if (clean.length > 1500) clean = clean.slice(0, 1500);
                if (!clean.toUpperCase().includes('NO TEXT')) {
                    clean += '. NO TEXT, NO WORDS, NO LETTERS, NO TYPOGRAPHY.';
                }
                return clean;
            }
        } catch (e) {
            console.warn('[AI] Falha ao gerar prompt Bíblia Aberta via Gemini:', e.message);
        }
    }

    // 3. Tenta 9Router
    if (config.ninerouterUrl) {
        try {
            console.log('[AI] Card Bíblia Aberta Cinematográfica: gerando prompt contextual via 9Router...');
            const baseUrl = config.ninerouterUrl.replace(/\/+$/, '');
            const headers = { 'Content-Type': 'application/json' };
            if (config.ninerouterApiKey) headers['Authorization'] = `Bearer ${config.ninerouterApiKey}`;
            const res = await axios.post(`${baseUrl}/chat/completions`, {
                model: 'gemini-1.5-flash',
                messages: [{ role: 'user', content: systemPrompt }],
                max_tokens: 500,
                temperature: 0.7
            }, { headers, timeout: 20000 });
            const content = res.data?.choices?.[0]?.message?.content?.trim();
            if (content && content.length > 50) {
                let clean = content.replace(/^["']|["']$/g, '').trim();
                if (clean.length > 1500) clean = clean.slice(0, 1500);
                if (!clean.toUpperCase().includes('NO TEXT')) {
                    clean += '. NO TEXT, NO WORDS, NO LETTERS, NO TYPOGRAPHY.';
                }
                return clean;
            }
        } catch (e) {
            console.warn('[AI] Falha ao gerar prompt Bíblia Aberta via 9Router:', e.message);
        }
    }

    return null;
}

// Otimiza prompt visual usando o LLM ativo antes de enviar ao gerador de imagem
async function optimizeVisualPrompt(title, visualIdentity, config) {
    const styleDescription = (visualIdentity && typeof visualIdentity === 'object' && visualIdentity.style)
        ? visualIdentity.style
        : (typeof visualIdentity === 'string' && visualIdentity ? visualIdentity : 'Fotografia realista, profissional e moderna');

    // ────────────────────────────────────────────────────────────────────
    // 🎨 CARDS COM TEXTO NA IMAGEM (Kawaii, Carta 3D, Caderno,
    // Minimalista, Papel Rasgado) — Atalho: estes estilos têm a FRASE
    // escrita dentro da imagem, então não podem passar pelo fluxo
    // jornalístico (que proíbe letras). Montamos o prompt direto e
    // devolvemos antes do LLM de otimização.
    // Se a emoção estiver em "auto", o LLM só classifica a frase.
    // ────────────────────────────────────────────────────────────────────
    if (isCardStyle(visualIdentity)) {
        const style = getCardStyle(styleDescription);
        const emotion = (visualIdentity && typeof visualIdentity === 'object' && visualIdentity.emotion)
            ? String(visualIdentity.emotion)
            : 'auto';
        const watermark = (visualIdentity && typeof visualIdentity === 'object' && visualIdentity.watermark)
            ? visualIdentity.watermark
            : '';
        const imageProvider = (visualIdentity && typeof visualIdentity === 'object' && visualIdentity.imageProvider)
            || config.imageProvider
            || 'auto';

        // Emoção "auto": o LLM escolhe a que melhor combina com a frase
        if (style.hasEmotion && emotion === 'auto') {
            try {
                const classifierPrompt = `Classifique a emoção dominante da frase abaixo em UMA das opções:

amor, fofo, motivacional, engasgado, triste, ansiedade, festa

FRASE: "${title}"

Responda APENAS com UMA palavra (a opção), sem aspas, sem pontuação, sem explicação.`;

                let detected = null;
                if (config.geminiApiKey) {
                    const r = await callGeminiGenerate(config.geminiApiKey, classifierPrompt, 15000);
                    detected = (r || '').trim().toLowerCase();
                }
                if (!detected && config.ninerouterUrl) {
                    const baseUrl = config.ninerouterUrl.replace(/\/+$/, '');
                    const headers = { 'Content-Type': 'application/json' };
                    if (config.ninerouterApiKey) headers['Authorization'] = `Bearer ${config.ninerouterApiKey}`;
                    const r = await axios.post(`${baseUrl}/chat/completions`, {
                        model: 'gemini-1.5-flash',
                        messages: [{ role: 'user', content: classifierPrompt }],
                        max_tokens: 10,
                        temperature: 0.2
                    }, { headers, timeout: 15000 });
                    detected = (r.data?.choices?.[0]?.message?.content || '').trim().toLowerCase();
                }
                if (!detected && config.openaiApiKey) {
                    const r = await axios.post('https://api.openai.com/v1/chat/completions', {
                        model: 'gpt-4o-mini',
                        messages: [{ role: 'user', content: classifierPrompt }],
                        max_tokens: 10,
                        temperature: 0.2
                    }, {
                        headers: {
                            'Authorization': `Bearer ${config.openaiApiKey}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 15000
                    });
                    detected = (r.data?.choices?.[0]?.message?.content || '').trim().toLowerCase();
                }

                const emotionId = normalizeDetectedEmotion(detected);
                console.log(`[AI] Card "${style.id}": emoção detectada "${detected}" -> "${emotionId}"`);

                return buildPromptForStyle(title, style.value, { emotion: emotionId, watermark, imageProvider, styleId: style.id });
            } catch (e) {
                console.warn(`[AI] Card "${style.id}": falha ao detectar emoção, usando "fofo":`, e.message);
                return buildPromptForStyle(title, style.value, { emotion: 'fofo', watermark, imageProvider, styleId: style.id });
            }
        }

        // 🌟 Estilo Sabedoria das Eres: usa Gemini (ou 9Router/OpenAI) como Diretor de Arte
        // espiritual para interpretar a entidade e compor o prompt em inglês exato para o Cloudflare (FLUX/SDXL)
        if (style.id === 'sabedoria_eres') {
            try {
                const llmPrompt = await generateCardPromptWithLLM(title, style, config, imageProvider);
                if (llmPrompt) {
                    console.log(`[AI] Card "${style.id}": prompt enriquecido pelo LLM com sucesso (${llmPrompt.length} chars)`);
                    return llmPrompt;
                }
            } catch (err) {
                console.warn(`[AI] Card "${style.id}": falha ao gerar prompt via LLM, usando nativo:`, err.message);
            }
        }

        // 🌟 Estilo Dilemas (Engajamento / Multi-nicho): usa Gemini para identificar nicho
        // (relacionamento/ex, futebol, cotidiano, trabalho) e gerar a cena fotográfica cinematográfica exata
        if (style.id === 'dilemas') {
            try {
                const llmPrompt = await generateDilemaPromptWithLLM(title, style, config, imageProvider);
                if (llmPrompt) {
                    console.log(`[AI] Card "${style.id}": prompt enriquecido pelo LLM com sucesso (${llmPrompt.length} chars)`);
                    return llmPrompt;
                }
            } catch (err) {
                console.warn(`[AI] Card "${style.id}": falha ao gerar prompt de dilema via LLM, usando nativo:`, err.message);
            }
        }

        // 🐦 Estilo Twitter/X (Prompt Universal): o LLM interpreta a frase
        // (nicho, personagem, emoção, símbolos) e gera a cena exata sem misturar contextos
        if (style.id === 'twitter_x') {
            try {
                const llmPrompt = await generateTwitterPromptWithLLM(title, style, config, imageProvider);
                if (llmPrompt) {
                    console.log(`[AI] Card "${style.id}": prompt enriquecido pelo LLM com sucesso (${llmPrompt.length} chars)`);
                    return llmPrompt;
                }
            } catch (err) {
                console.warn(`[AI] Card "${style.id}": falha ao gerar prompt universal via LLM, usando nativo:`, err.message);
            }
        }

        // 💕 Estilo Romântico Ilustrado: o LLM interpreta a emoção da frase
        // e gera o fundo ilustrado (a frase vai em vetor no terço superior)
        if (style.id === 'romantico_ilustrado') {
            try {
                const llmPrompt = await generateRomanticoPromptWithLLM(title, style, config, imageProvider);
                if (llmPrompt) {
                    console.log(`[AI] Card "${style.id}": prompt enriquecido pelo LLM com sucesso (${llmPrompt.length} chars)`);
                    return llmPrompt;
                }
            } catch (err) {
                console.warn(`[AI] Card "${style.id}": falha ao gerar prompt romântico via LLM, usando nativo:`, err.message);
            }
        }

        // ✝️ Estilo Cristão Cinematográfico: o LLM interpreta a passagem bíblica,
        // identifica personagem/cena e gera o fundo fotorrealista 4:5
        // (frase no topo esquerdo + marca FOCO EM CRISTO no rodapé em vetor)
        if (style.id === 'cristao_cinematografico') {
            try {
                const llmPrompt = await generateCristaoPromptWithLLM(title, style, config, imageProvider);
                if (llmPrompt) {
                    console.log(`[AI] Card "${style.id}": prompt enriquecido pelo LLM com sucesso (${llmPrompt.length} chars)`);
                    return llmPrompt;
                }
            } catch (err) {
                console.warn(`[AI] Card "${style.id}": falha ao gerar prompt cristão via LLM, usando nativo:`, err.message);
            }
        }

        // 📖 Estilo Bíblia Aberta Cinematográfica: o LLM adapta a luz/atmosfera
        // ao significado da frase (sofrimento→acolhimento, vitória→força, fé→paz)
        // composição fixa: céu dramático + Bíblia central + vale com caminho/pegadas
        if (style.id === 'biblia_aberta_cinematografica') {
            try {
                const llmPrompt = await generateBibliaAbertaPromptWithLLM(title, style, config, imageProvider);
                if (llmPrompt) {
                    console.log(`[AI] Card "${style.id}": prompt enriquecido pelo LLM com sucesso (${llmPrompt.length} chars)`);
                    return llmPrompt;
                }
            } catch (err) {
                console.warn(`[AI] Card "${style.id}": falha ao gerar prompt Bíblia Aberta via LLM, usando nativo:`, err.message);
            }
        }

        // 📚 Estilo Educativo Universal: o LLM interpreta tema/produto,
        // gera o conteúdo do card (título, dica, interação, produto) e o fundo
        // fotográfico do nicho (textos 100% em vetor à esquerda)
        if (style.id === 'educativo_universal') {
            try {
                const llmPrompt = await generateEducativoPromptWithLLM(title, style, config, imageProvider);
                if (llmPrompt) {
                    console.log(`[AI] Card "${style.id}": prompt enriquecido pelo LLM com sucesso (${llmPrompt.length} chars)`);
                    return llmPrompt;
                }
            } catch (err) {
                console.warn(`[AI] Card "${style.id}": falha ao gerar prompt educativo via LLM, usando nativo:`, err.message);
            }
        }

        // Emoção escolhida manualmente (ou estilo sem emoção): sem LLM
        console.log(`[AI] Card "${style.id}": prompt direto${style.hasEmotion ? ` com emoção "${emotion}"` : ''}`);
        return buildPromptForStyle(title, style.value, { emotion, watermark, imageProvider, styleId: style.id });
    }

    const basePrompt = `Você é um diretor de arte especializado em imagens jornalísticas para Instagram, Facebook e portais de notícias.

Sua tarefa é analisar os dados da notícia e criar um prompt detalhado para um gerador de imagens. A imagem precisa representar fielmente o assunto principal da notícia, sem fugir do título ou inventar informações.

DADOS DA NOTÍCIA
Título:
${title}

Resumo:
${title}

Categoria:
Geral (Identifique automaticamente se aplicável)

Nome da página:
Página de Notícias

Estilo visual da página:
${styleDescription}

Formato da imagem:
1:1 ou 4:5

Objetivo da publicação:
Engajamento em redes sociais

REGRAS DE INTERPRETAÇÃO
1. Identifique o assunto principal da notícia.
2. Identifique as pessoas, objetos, animais, lugares ou acontecimentos realmente mencionados.
3. Identifique a ação principal da notícia.
4. Escolha uma cena visual que represente diretamente o título e o resumo.
5. Se a notícia mencionar uma pessoa pública, represente-a de forma realista somente se houver informação suficiente.
6. Se não houver informação suficiente para mostrar uma pessoa específica, use uma representação genérica relacionada ao assunto.
7. Não invente resultados, datas, números, locais, pessoas, cargos ou acontecimentos.
8. Não transforme uma notícia sobre uma possibilidade em algo que pareça confirmado.
9. Não use elementos que não tenham relação clara com a notícia.
10. A imagem deve ser compreensível mesmo para alguém que não leia a legenda.

REGRAS PARA DIFERENTES CATEGORIAS
- Esportes: mostrar atletas, campo, quadra, estádio, torcida ou o momento esportivo relacionado à notícia. Não inventar placar, resultado ou uniforme específico.
- Política: mostrar ambiente institucional, autoridades, coletiva, reunião ou local relacionado. Não criar discursos, textos, bandeiras ou símbolos partidários não mencionados.
- Tecnologia: mostrar dispositivos, laboratório, computador, inteligência artificial, software ou inovação relacionada ao assunto. Não criar interfaces com informações falsas.
- Economia: mostrar comércio, empresas, mercado, produção, dinheiro ou atividade econômica relacionada. Não inventar números, gráficos ou cotações.
- Saúde: mostrar profissionais, hospitais, exames, pesquisa ou cuidados médicos. Evitar imagens sensacionalistas, sangue ou situações desnecessariamente dramáticas.
- Segurança: mostrar ambiente urbano, viaturas, investigação ou situação relacionada sem violência gráfica ou cenas sensacionalistas.
- Entretenimento: mostrar palco, evento, artista, produção audiovisual ou ambiente relacionado à notícia.
- Ciência: mostrar laboratório, pesquisadores, equipamentos ou fenômeno científico relacionado.
- Geral: escolher uma representação jornalística direta e realista do assunto principal.

DIREÇÃO DE ARTE
Use o seguinte estilo visual da página:
${styleDescription}

A imagem deve ter aparência de fotografia ou ilustração jornalística profissional, boa iluminação, composição equilibrada, foco no assunto principal e qualidade adequada para redes sociais.

NUNCA INSERIR NA IMAGEM
- título da notícia, legendas, frases, palavras, letras, números, manchetes, marcas, logotipos, etc.
- Se aparecerem telas, jornais, placas ou documentos, eles devem estar desfocados ou sem conteúdo legível.

RETORNE SOMENTE UM JSON VÁLIDO, SEM MARKDOWN, SEM EXPLICAÇÕES E SEM TEXTO FORA DO JSON, USANDO ESTA ESTRUTURA:
{
  "categoria_identificada": "",
  "assunto_principal": "",
  "cena_principal": "",
  "personagens_ou_elementos": [],
  "local": "",
  "acao": "",
  "estilo_visual": "",
  "composicao": "",
  "iluminacao": "",
  "cores": "",
  "prompt_imagem": "",
  "negative_prompt": ""
}

No campo "prompt_imagem", escreva o prompt final completo para o gerador de imagens em INGLÊS.
O prompt final em inglês deve começar com: "Professional journalistic image about..."
No campo "negative_prompt", inclua em INGLÊS: "texts, letters, numbers, headlines, captions, logos, brands, watermarks, invented information, deformed people, deformed hands, low quality, blurred image, confusing composition, graphic violence, elements unrelated to the news."
`;

    const parseJsonPrompt = (text) => {
        try {
            const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleaned);
            if (parsed && parsed.prompt_imagem) {
                // Ensure the final prompt has the negative instructions at the end for models that don't support negative prompts well natively
                return `${parsed.prompt_imagem}, NO TEXT, no letters, no watermark, 8k resolution, photorealistic, masterpiece`;
            }
        } catch (e) {
            console.error('[AI] Error parsing JSON from Art Director prompt:', e.message);
        }
        return null;
    };

    // 1. Tentativa com Gemini
    if (config.geminiApiKey) {
        try {
            const promptText = await callGeminiGenerate(config.geminiApiKey, basePrompt, 30000);
            if (promptText) {
                const finalPrompt = parseJsonPrompt(promptText);
                if (finalPrompt) return finalPrompt;
            }
        } catch (e) {
            console.log('[AI] Could not optimize image prompt via Gemini:', e.message);
        }
    }

    // 2. Tentativa com 9Router
    if (config.ninerouterUrl) {
        try {
            const baseUrl = config.ninerouterUrl.replace(/\/+$/, '');
            const headers = { 'Content-Type': 'application/json' };
            if (config.ninerouterApiKey) headers['Authorization'] = `Bearer ${config.ninerouterApiKey}`;
            const res = await axios.post(`${baseUrl}/chat/completions`, {
                model: 'gemini-1.5-flash',
                messages: [{ role: 'user', content: basePrompt }],
                max_tokens: 800,
                temperature: 0.5
            }, { headers, timeout: 30000 });
            const promptText = res.data?.choices?.[0]?.message?.content?.trim();
            if (promptText) {
                const finalPrompt = parseJsonPrompt(promptText);
                if (finalPrompt) return finalPrompt;
            }
        } catch (e) {
            console.log('[AI] Could not optimize image prompt via 9Router:', e.message);
        }
    }

    // 3. Tentativa com OpenAI
    if (config.openaiApiKey) {
        try {
            const res = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: basePrompt }],
                max_tokens: 800,
                temperature: 0.5,
                response_format: { type: "json_object" }
            }, {
                headers: {
                    'Authorization': `Bearer ${config.openaiApiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });
            const promptText = res.data?.choices?.[0]?.message?.content?.trim();
            if (promptText) {
                const finalPrompt = parseJsonPrompt(promptText);
                if (finalPrompt) return finalPrompt;
            }
        } catch (e) {
            console.log('[AI] Could not optimize image prompt via OpenAI:', e.message);
        }
    }

    // 4. Fallback contextualizado inteligente por palavras-chave
    return buildAccurateVisualDescription(title, visualIdentity);
}

// Gera hashtags inteligentes e específicas baseadas no título e palavras-chave
function buildSmartHashtags(title) {
    const clean = title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const tags = new Set();

    // Culinária
    if (/bolo|doce|chocolate|receita|comida|prato|culinaria|sobremesa/.test(clean)) {
        tags.add('#Receitas').add('#Culinaria').add('#Gastronomia').add('#Delicia').add('#FoodLovers');
    }
    // Negócios / Finanças
    else if (/dinheiro|vendas|investimento|financas|lucro|renda|economia|dolar|marketing|empreendedor/.test(clean)) {
        tags.add('#Empreendedorismo').add('#Financas').add('#Negocios').add('#MarketingDigital').add('#Sucesso');
    }
    // Tecnologia
    else if (/tecnologia|tech|\bia\b|inteligencia artificial|celular|smartphone|software|programacao/.test(clean)) {
        tags.add('#Tecnologia').add('#TechNews').add('#Inovacao').add('#InteligenciaArtificial');
    }
    // Beleza
    else if (/maquiagem|pele|skincare|beleza|cabelo|estetica|cosmetico/.test(clean)) {
        tags.add('#Beleza').add('#Skincare').add('#DicasDeBeleza').add('#AutoCuidado');
    }
    // Fitness
    else if (/treino|academia|fitness|saude|dieta|emagrecer|musculacao/.test(clean)) {
        tags.add('#Fitness').add('#Treino').add('#VidaSaudavel').add('#Foco').add('#Saude');
    }
    // Futebol
    else if (/futebol|esporte|gol|campeonato|timao|corinthians|flamengo|palmeiras|libertadores|sao paulo|internacional|brasileirao|jogo|partida|champions|rodada|roma|inter|milan|juventus|real madrid|barcelona|serie a|mundial|copa|selecao|torneio|final|classico|derby/.test(clean)) {
        tags.add('#Futebol').add('#Brasileirao').add('#FutebolBrasileiro');
        if (/sao paulo/.test(clean)) tags.add('#SaoPaulo');
        if (/internacional/.test(clean)) tags.add('#Internacional');
    }

    // Extrai palavras-chave principais do título
    const stopWords = new Set(['para', 'pela', 'pelo', 'com', 'sem', 'apos', 'sobre', 'onde', 'como', 'mais', 'menos', 'entre', 'esse', 'essa', 'esta', 'este', 'isso', 'aquele', 'aquela', 'voce', 'dicas']);
    const words = clean.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 4 && !stopWords.has(w));

    words.slice(0, 4).forEach(w => {
        const capitalized = w.charAt(0).toUpperCase() + w.slice(1);
        tags.add(`#${capitalized}`);
    });

    tags.add('#Noticias').add('#Esportes');
    return Array.from(tags).slice(0, 8).join(' ');
}

// Gera legenda inteligente e dinâmica de fallback
function buildSmartFallbackCaption(title) {
    const clean = title.toLowerCase();
    if (/sao paulo|internacional|futebol|brasileirao|jogo/.test(clean)) {
        let matchName = 'Partida decisiva';
        if (clean.includes('sao paulo') && clean.includes('internacional')) matchName = 'São Paulo x Internacional';
        return `⚽ ${matchName} em campo!\n\n${title}\n\n🔥 Como está a sua expectativa para esse jogão? Deixe seu palpite nos comentários! 👇`;
    }
    return `✨ ${title}\n\nConfira todos os detalhes imperdíveis sobre este tema! Separamos os melhores insights para você aplicar agora mesmo.\n\n👇 O que você achou? Deixe sua opinião nos comentários e compartilhe com alguém que precisa ver isso!`;
}

export async function generateCaptionAndHashtags(title, userId) {
    const config = await getAiConfig(userId);

    const prompt = `Você é um copywriter e especialista em engajamento nas redes sociais (Instagram, Facebook, etc.).
Crie um post completo e envolvente com base no título: "${title}".

DIRETRIZES:
1. Legenda (description):
   - Não comece com clichês como "Confira esta super novidade".
   - Adapte o tom perfeitamente ao nicho do título (futebol/esportes, culinária, negócios, tecnologia, bem-estar, etc.).
   - Parágrafos curtos, boa leitura e 2 ou 3 emojis bem posicionados.
   - Finalize com uma chamada para ação (CTA) natural incentivando comentários.
2. Hashtags:
   - Gere de 6 a 10 hashtags RELEVANTES e específicas sobre os tópicos centrais do título.

Responda ESTRITAMENTE em formato JSON:
{
  "description": "Texto completo da legenda...",
  "hashtags": "#Tag1 #Tag2 #Tag3..."
}`;

    // 1. OpenAI (ChatGPT — prioridade: melhor direção criativa)
    if (config.openaiApiKey) {
        try {
            const res = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7
            }, {
                headers: {
                    'Authorization': `Bearer ${config.openaiApiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 25000
            });

            const content = res.data.choices[0].message.content;
            const cleaned = content.replace(/```json/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleaned);
            if (parsed.description && parsed.hashtags) return parsed;
        } catch (e) {
            console.warn('[AI] OpenAI text gen error:', e.message);
        }
    }

    // 2. Gemini
    if (config.geminiApiKey) {
        try {
            const text = await callGeminiGenerate(config.geminiApiKey, prompt, 25000);
            const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleaned);
            if (parsed.description && parsed.hashtags) return parsed;
        } catch (e) {
            console.warn('[AI] Gemini text gen error:', e.message);
        }
    }

    // 3. 9Router
    if (config.ninerouterUrl) {
        try {
            const baseUrl = config.ninerouterUrl.replace(/\/+$/, '');
            const headers = { 'Content-Type': 'application/json' };
            if (config.ninerouterApiKey) headers['Authorization'] = `Bearer ${config.ninerouterApiKey}`;

            const res = await axios.post(`${baseUrl}/chat/completions`, {
                model: 'gemini-1.5-flash',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7
            }, { headers, timeout: 25000 });

            const content = res.data.choices[0].message.content;
            const cleaned = content.replace(/```json/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleaned);
            if (parsed.description && parsed.hashtags) return parsed;
        } catch (e) {
            console.warn('[AI] 9Router text gen failed:', e.message);
        }
    }

    // Fallback inteligente e contextual
    return {
        description: buildSmartFallbackCaption(title),
        hashtags: buildSmartHashtags(title)
    };
}

/**
 * Gera pacote de dilemas em lote usando o Prompt Mestre Universal (Gemini / 9Router / OpenAI).
 * Suporta o catálogo completo de nichos (A-X), temas transversais e emoções.
 * Retorna lista de textos formatados com Conflito + Decisão A + Decisão B prontos para publicação.
 */
export async function generateDilemmasBatch({ niche, theme, count = 5, style = 'misto' }, userId) {
    const config = await getAiConfig(userId);

    const safeCount = Math.min(Math.max(parseInt(count) || 5, 1), 30);
    const safeNiche = niche && String(niche).trim() ? String(niche).trim() : 'Geral';
    const safeTheme = theme && String(theme).trim() ? String(theme).trim() : 'Automático';

    const prompt = `Você é o maior especialista em criação de dilemas virais para redes sociais (Instagram, Facebook, TikTok), operando rigorosamente sob as regras do PROMPT MESTRE UNIVERSAL DE DILEMAS.

SUA MISSÃO:
Crie exatamente ${safeCount} DILEMAS VIRAIS INÉDITOS com base nos seguintes parâmetros:

NICHO: ${safeNiche} (se for 'Geral', identifique automaticamente e varie entre os 24 nichos do catálogo: relacionamentos, família, amizade, finanças, trabalho, negócios, moral/ética, espiritualidade, redes sociais, estudos, filhos, saúde, superação, confiança, cidadania, cotidiano, nostalgia, etc.)
TEMA: ${safeTheme} (se for Automático, escolha temas transversais marcantes: Confiança, Traição, Perdão, Lealdade, Sacrifício, Liberdade, Responsabilidade, Ambição, Arrependimento, Justiça, etc.)
ESTILO/TOM: ${style} (equilibre situações realistas, profundas, morais e provocativas)

MOTOR DE CRIAÇÃO OBRIGATÓRIO:
1. Extraia a mensagem central ou situação.
2. Identifique o conflito real entre dois desejos, valores ou consequências.
3. Crie duas alternativas REALISTAS, DEFENSÁVEIS e DISTINTAS (não crie uma opção ridícula para favorecer a outra).
4. Emojis coerentes: use emojis adequados ao contexto (não fique preso apenas a ❤️ e 💔, use símbolos coerentes com o assunto).
5. Estrutura exata de cada dilema:
   - Linha 1: Frase da situação/conflito em CAIXA ALTA com reticências ou interrogação (curta e impactante).
   - Linha 2: Emoji + PRIMEIRA DECISÃO (OPÇÃO A) em caixa alta.
   - Linha 3: Emoji + SEGUNDA DECISÃO (OPÇÃO B) em caixa alta.

Responda ESTRITAMENTE em formato JSON com array "dilemmas":
{
  "dilemmas": [
    {
      "niche": "Nicho",
      "theme": "Tema transversal",
      "emotion": "Emoção principal",
      "question": "SITUAÇÃO IMPACTANTE EM CAIXA ALTA...",
      "optionA": "👉 PRIMEIRA DECISÃO",
      "optionB": "👉 SEGUNDA DECISÃO",
      "formattedText": "SITUAÇÃO IMPACTANTE EM CAIXA ALTA...\\n👉 PRIMEIRA DECISÃO\\n👉 SEGUNDA DECISÃO"
    }
  ]
}`;

    const parseResult = (raw) => {
        try {
            const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleaned);
            if (Array.isArray(parsed.dilemmas) && parsed.dilemmas.length > 0) {
                return parsed.dilemmas.map(d => ({
                    question: d.question,
                    optionA: d.optionA,
                    optionB: d.optionB,
                    text: d.formattedText || `${d.question}\n${d.optionA}\n${d.optionB}`
                }));
            }
        } catch (e) {
            console.warn('[AI] Erro ao parsear JSON de dilemas:', e.message);
        }
        return null;
    };

    // 1. Gemini
    if (config.geminiApiKey) {
        try {
            const text = await callGeminiGenerate(config.geminiApiKey, prompt, 30000);
            const parsed = parseResult(text);
            if (parsed) return parsed;
        } catch (e) {
            console.warn('[AI] Gemini generateDilemmasBatch error:', e.message);
        }
    }

    // 2. 9Router
    if (config.ninerouterUrl) {
        try {
            const baseUrl = config.ninerouterUrl.replace(/\/+$/, '');
            const headers = { 'Content-Type': 'application/json' };
            if (config.ninerouterApiKey) headers['Authorization'] = `Bearer ${config.ninerouterApiKey}`;
            const res = await axios.post(`${baseUrl}/chat/completions`, {
                model: 'gemini-1.5-flash',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.8
            }, { headers, timeout: 30000 });
            const content = res.data?.choices?.[0]?.message?.content;
            const parsed = parseResult(content);
            if (parsed) return parsed;
        } catch (e) {
            console.warn('[AI] 9Router generateDilemmasBatch error:', e.message);
        }
    }

    // 3. OpenAI
    if (config.openaiApiKey) {
        try {
            const res = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.8
            }, {
                headers: {
                    'Authorization': `Bearer ${config.openaiApiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });
            const content = res.data?.choices?.[0]?.message?.content;
            const parsed = parseResult(content);
            if (parsed) return parsed;
        } catch (e) {
            console.warn('[AI] OpenAI generateDilemmasBatch error:', e.message);
        }
    }

    throw new Error('Não foi possível gerar dilemas com os provedores de IA configurados.');
}

/**
 * Gera UMA frase promocional curta pedindo a assinatura da página.
 * Reutiliza os mesmos provedores de IA do sistema (Gemini → 9Router → OpenAI).
 * Retorna string pronta (com o link incluído) ou lança erro (caller usa fallback).
 */
export async function generatePromoComment({ videoTitle = '', videoCaption = '', pageName = '', link = '', recentTexts = [] }, userId) {
    const config = await getAiConfig(userId);
    const safeLink = String(link || '').trim();
    if (!safeLink) throw new Error('Link de assinatura ausente.');

    const context = [videoTitle, videoCaption].filter(Boolean).join(' | ').slice(0, 300);
    const avoid = (recentTexts || []).slice(0, 5).map(t => `- "${String(t).slice(0, 120)}"`).join('\n');

    const prompt = `Você escreve comentários curtos para redes sociais (Facebook, Instagram, Threads), em português brasileiro natural e persuasivo.

TAREFA: crie UMA frase promocional convidando quem assistiu ao vídeo a ASSINAR a página "${pageName || 'a página'}" para apoiar o trabalho e receber conteúdo exclusivo.
${context ? `CONTEXTO DO VÍDEO (use como inspiração, sem inventar fatos): ${context}` : ''}
REGRAS:
- Máximo 220 caracteres, tom humano (pode usar 1 emoji, sem exagero).
- Chamada para ação clara e natural (conhecer/assinar/apoiar a página).
- NÃO prometa benefícios específicos (descontos, prêmios, valores) — só "conteúdo exclusivo" de forma genérica.
- NÃO pareça mensagem automática repetitiva.
- Termine com o link exatamente assim, em linha própria: ${safeLink}
${avoid ? `EVITE repetir estas mensagens recentes:\n${avoid}` : ''}
Responda APENAS com a frase pronta, sem aspas e sem explicações.`;

    const clean = (raw) => {
        const t = String(raw || '').replace(/```/g, '').trim().replace(/^["'“”]+|["'“”]+$/g, '').trim();
        if (!t || t.length < 10 || t.length > 400) return null;
        return t.includes(safeLink) ? t : `${t}\n${safeLink}`;
    };

    if (config.geminiApiKey) {
        try {
            const text = await callGeminiGenerate(config.geminiApiKey, prompt, 20000);
            const out = clean(text);
            if (out) return { text: out, aiUsed: true };
        } catch (e) {
            console.warn('[AI] Gemini generatePromoComment error:', e.message);
        }
    }

    if (config.ninerouterUrl) {
        try {
            const baseUrl = config.ninerouterUrl.replace(/\/+$/, '');
            const headers = { 'Content-Type': 'application/json' };
            if (config.ninerouterApiKey) headers['Authorization'] = `Bearer ${config.ninerouterApiKey}`;
            const res = await axios.post(`${baseUrl}/chat/completions`, {
                model: 'gemini-1.5-flash',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.9
            }, { headers, timeout: 20000 });
            const out = clean(res.data?.choices?.[0]?.message?.content);
            if (out) return { text: out, aiUsed: true };
        } catch (e) {
            console.warn('[AI] 9Router generatePromoComment error:', e.message);
        }
    }

    if (config.openaiApiKey) {
        try {
            const res = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.9
            }, {
                headers: {
                    'Authorization': `Bearer ${config.openaiApiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 20000
            });
            const out = clean(res.data?.choices?.[0]?.message?.content);
            if (out) return { text: out, aiUsed: true };
        } catch (e) {
            console.warn('[AI] OpenAI generatePromoComment error:', e.message);
        }
    }

    throw new Error('IA indisponível para gerar comentário promocional.');
}

function escapeXml(unsafe) {
    return String(unsafe).replace(/[<>&'"]/g, c => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
            default: return c;
        }
    });
}

function wrapText(text, maxChars = 22) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let currentLine = '';
    for (const w of words) {
        if ((currentLine + ' ' + w).trim().length <= maxChars) {
            currentLine = (currentLine + ' ' + w).trim();
        } else {
            if (currentLine) lines.push(currentLine);
            currentLine = w;
        }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
}

/**
 * Extrai o nome da entidade citada no início da frase ("Erê Trovazinho lembra..."
 * -> "Erê Trovazinho") + @handle derivado ("@eretrovazinho").
 * Mesma heurística do card sabedoria_eres (nome = até o primeiro verbo).
 */
function extractEntityName(phrase) {
    const rawWords = String(phrase || '').trim().split(/\s+/).filter(Boolean);
    const verbRe = /\b(ensina|diz|lembra|falou|afirma|deixa|comecou|come[çc]ou|precisa|pode|nao|não|foi|ser|estar|quer|vai|deve|e)\b/i;
    let titleWords = [];
    for (let i = 1; i < Math.min(rawWords.length, 7); i++) {
        if (verbRe.test(rawWords[i])) { titleWords = rawWords.slice(0, i); break; }
    }
    if (titleWords.length === 0 || titleWords.length > 5) {
        titleWords = rawWords.slice(0, Math.min(3, rawWords.length));
    }
    // Remove pronomes/artigos presos ao fim do nome ("Jesus nos ensina" -> "Jesus")
    while (titleWords.length > 1 && /^(nos|vos|me|te|se|lhe|lhes|o|a|os|as|um|uma|uns|umas|que|de|da|do|das|dos|e|ao|aos)$/i.test(titleWords[titleWords.length - 1])) {
        titleWords.pop();
    }
    const name = titleWords.join(' ').replace(/["“”]/g, '').trim() || 'Umbanda';
    const handle = '@' + name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 20);
    return { name, handle: handle === '@' ? '@umbanda' : handle };
}

/**
 * 🧠 PROMPT MESTRE UNIVERSAL — gera o DILEMA (pergunta + 2 escolhas com emoji,
 * título e subtítulo) a partir de QUALQUER frase, usando outra IA (Gemini /
 * 9Router / OpenAI). O Cloudflare usa SÓ para gerar a imagem de fundo.
 */
async function resolveDilemmaContent(phrase, config) {
    const cleanPhrase = String(phrase || '').split(/\r?\n/)[0].trim();
    if (!cleanPhrase) return null;

    const prompt = `Você é o PROMPT MESTRE UNIVERSAL GERADOR DE DILEMAS. Receba a frase e crie o dilema completo.
FRASE: "${cleanPhrase}"

REGRAS:
- Identifique nicho, tema e emoção automaticamente.
- Se for afirmação/conselho/reflexão positiva sem conflito explícito, transforme em decisão plausível sem distorcer a mensagem.
- Pergunta curta de reflexão (ex: "QUAL É O SEU CAMINHO AGORA?", "O QUE VOCÊ FARIA?", "QUAL CAMINHO VOCÊ ESCOLHERIA?").
- Escolha A e B curtas, emocionais, distintas e defensáveis, com emoji coerente ao contexto + título em CAIXA ALTA (máx 22 chars) + subtítulo curto (máx 48 chars).
- Exemplo para "Erê Trovazinho lembra que sempre existe espaço para um novo sorriso, uma nova esperança e um novo começo." => pergunta "QUAL É O SEU CAMINHO AGORA?", A 😊 "ACREDITAR E RECOMEÇAR" / "Com mais fé, coragem e o coração leve.", B 😟 "CONTINUAR NO MESMO LUGAR" / "Esperando que as coisas melhorem sozinhas."

Responda ESTRITAMENTE em JSON:
{"question":"...","optionA":{"emoji":"😊","title":"...","subtitle":"..."},"optionB":{"emoji":"😟","title":"...","subtitle":"..."},"cta":"COMENTE SUA ESCOLHA!"}`;

    const parse = (raw) => {
        try {
            const cleaned = String(raw || '').replace(/```json/gi, '').replace(/```/g, '').trim();
            const start = cleaned.indexOf('{');
            const end = cleaned.lastIndexOf('}');
            if (start < 0 || end <= start) return null;
            const obj = JSON.parse(cleaned.slice(start, end + 1));
            if (obj && obj.question && obj.optionA && obj.optionB) {
                return {
                    question: String(obj.question).toUpperCase().slice(0, 80),
                    optionA: {
                        emoji: String(obj.optionA.emoji || '😊').slice(0, 4),
                        title: String(obj.optionA.title || '').toUpperCase().slice(0, 30),
                        subtitle: String(obj.optionA.subtitle || '').slice(0, 60)
                    },
                    optionB: {
                        emoji: String(obj.optionB.emoji || '😟').slice(0, 4),
                        title: String(obj.optionB.title || '').toUpperCase().slice(0, 30),
                        subtitle: String(obj.optionB.subtitle || '').slice(0, 60)
                    },
                    cta: String(obj.cta || 'COMENTE SUA ESCOLHA!').toUpperCase().slice(0, 40)
                };
            }
        } catch (e) {
            console.warn('[AI] Falha ao parsear dilema:', e.message);
        }
        return null;
    };

    if (config.geminiApiKey) {
        try {
            const text = await callGeminiGenerate(config.geminiApiKey, prompt, 20000);
            const parsed = parse(text);
            if (parsed) return parsed;
        } catch (e) {
            console.warn('[AI] Dilema via Gemini falhou:', e.message);
        }
    }
    if (config.ninerouterUrl) {
        try {
            const baseUrl = config.ninerouterUrl.replace(/\/+$/, '');
            const headers = { 'Content-Type': 'application/json' };
            if (config.ninerouterApiKey) headers['Authorization'] = `Bearer ${config.ninerouterApiKey}`;
            const res = await axios.post(`${baseUrl}/chat/completions`, {
                model: 'gemini-1.5-flash',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 500,
                temperature: 0.7
            }, { headers, timeout: 20000 });
            const parsed = parse(res.data?.choices?.[0]?.message?.content);
            if (parsed) return parsed;
        } catch (e) {
            console.warn('[AI] Dilema via 9Router falhou:', e.message);
        }
    }
    if (config.openaiApiKey) {
        try {
            const res = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 500,
                temperature: 0.7
            }, { headers: { 'Authorization': `Bearer ${config.openaiApiKey}`, 'Content-Type': 'application/json' }, timeout: 20000 });
            const parsed = parse(res.data?.choices?.[0]?.message?.content);
            if (parsed) return parsed;
        } catch (e) {
            console.warn('[AI] Dilema via OpenAI falhou:', e.message);
        }
    }
    return null;
}

/**
 * 🐦 Resolve o perfil do cabeçalho do card Twitter/X (nome + @handle do
 * personagem/entidade da frase) via LLM com fallback por palavras-chave.
 * Ex: frase sobre Jesus -> {name:'Jesus Cristo', handle:'@jesuscristo'}.
 */
async function resolveTwitterProfile(phrase, config) {
    const cleanPhrase = String(phrase || '').trim();
    if (!cleanPhrase) return null;

    const fallback = () => {
        try {
            const sabedoria = CARD_STYLES.find(s => s.id === 'sabedoria_eres');
            const entityId = sabedoria && sabedoria.detectEntity ? sabedoria.detectEntity(cleanPhrase) : 'auto';
            const ent = sabedoria && sabedoria.entities[entityId];
            if (ent && entityId !== 'auto') {
                const h = '@' + ent.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 20);
                return { name: ent.name, handle: h === '@' ? '@umbanda' : h };
            }
        } catch (_) {}
        return extractEntityName(cleanPhrase);
    };

    const prompt = `Identifique o personagem, entidade, pessoa ou perfil citado na frase abaixo e responda ESTRITAMENTE em JSON:
{"name":"Nome de exibição","handle":"@handleMinusculoSemEspacos"}
FRASE: "${cleanPhrase.slice(0, 300)}"
REGRAS:
- Se citar Jesus/Cristo: {"name":"Jesus Cristo","handle":"@jesuscristo"}.
- Se citar Erê/entidade da Umbanda: use o nome da entidade (ex: {"name":"Erê Trovazinho","handle":"@eretrovazinho"}).
- Se for frase motivacional/geral sem personagem: use o tema como perfil (ex: {"name":"Reflexão Diária","handle":"@reflexaodiaria"}), nunca palavras soltas como "Mesmo quando suas".
- Handle: minúsculas, sem acentos/espaços, máx 20 chars, sempre com @.`;

    const parse = (raw) => {
        try {
            const cleaned = String(raw || '').replace(/```json/gi, '').replace(/```/g, '').trim();
            const start = cleaned.indexOf('{');
            const end = cleaned.lastIndexOf('}');
            if (start < 0 || end <= start) return null;
            const obj = JSON.parse(cleaned.slice(start, end + 1));
            if (obj && obj.name) {
                let h = String(obj.handle || '').trim();
                if (!h.startsWith('@')) h = '@' + h;
                h = '@' + h.slice(1).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 20);
                const name = String(obj.name).trim().slice(0, 32);
                if (!name || h === '@') return null;
                return { name, handle: h };
            }
        } catch (e) {
            console.warn('[AI] Falha ao parsear perfil Twitter/X:', e.message);
        }
        return null;
    };

    if (config.geminiApiKey) {
        try {
            const text = await callGeminiGenerate(config.geminiApiKey, prompt, 15000);
            const parsed = parse(text);
            if (parsed) return parsed;
        } catch (e) {
            console.warn('[AI] Perfil Twitter/X via Gemini falhou:', e.message);
        }
    }
    if (config.ninerouterUrl) {
        try {
            const baseUrl = config.ninerouterUrl.replace(/\/+$/, '');
            const headers = { 'Content-Type': 'application/json' };
            if (config.ninerouterApiKey) headers['Authorization'] = `Bearer ${config.ninerouterApiKey}`;
            const res = await axios.post(`${baseUrl}/chat/completions`, {
                model: 'gemini-1.5-flash',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 200,
                temperature: 0.3
            }, { headers, timeout: 15000 });
            const parsed = parse(res.data?.choices?.[0]?.message?.content);
            if (parsed) return parsed;
        } catch (e) {
            console.warn('[AI] Perfil Twitter/X via 9Router falhou:', e.message);
        }
    }
    if (config.openaiApiKey) {
        try {
            const res = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 200,
                temperature: 0.3
            }, { headers: { 'Authorization': `Bearer ${config.openaiApiKey}`, 'Content-Type': 'application/json' }, timeout: 15000 });
            const parsed = parse(res.data?.choices?.[0]?.message?.content);
            if (parsed) return parsed;
        } catch (e) {
            console.warn('[AI] Perfil Twitter/X via OpenAI falhou:', e.message);
        }
    }
    return fallback();
}

/**
 * 📚 Resolve o conteúdo do card Educativo Universal via LLM.
 * Entrada: "TEMA | PRODUTO" (produto opcional).
 * Retorna JSON com título, blocos de dica, interação, produto e cores.
 */
function parseEducativoInput(line) {
    const raw = String(line || '').split(/\r?\n/)[0].trim();
    const sep = raw.indexOf('|');
    if (sep >= 0) {
        return { tema: raw.slice(0, sep).trim(), produto: raw.slice(sep + 1).trim() };
    }
    return { tema: raw, produto: '' };
}

async function llmChat(config, prompt, maxTokens = 900, temperature = 0.7, timeout = 25000) {
    // OpenAI (ChatGPT) primeiro: melhor direção criativa e instruções
    if (config.openaiApiKey) {
        try {
            const res = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: maxTokens,
                temperature
            }, {
                headers: { 'Authorization': `Bearer ${config.openaiApiKey}`, 'Content-Type': 'application/json' },
                timeout
            });
            const content = res.data?.choices?.[0]?.message?.content;
            if (content && String(content).trim()) return content;
        } catch (e) {
            console.warn('[AI] LLM via OpenAI falhou:', e.message);
        }
    }
    if (config.geminiApiKey) {
        try {
            const text = await callGeminiGenerate(config.geminiApiKey, prompt, timeout);
            if (text && text.trim()) return text;
        } catch (e) {
            console.warn('[AI] LLM via Gemini falhou:', e.message);
        }
    }
    if (config.ninerouterUrl) {
        try {
            const baseUrl = config.ninerouterUrl.replace(/\/+$/, '');
            const headers = { 'Content-Type': 'application/json' };
            if (config.ninerouterApiKey) headers['Authorization'] = `Bearer ${config.ninerouterApiKey}`;
            const res = await axios.post(`${baseUrl}/chat/completions`, {
                model: 'gemini-1.5-flash',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: maxTokens,
                temperature
            }, { headers, timeout });
            const content = res.data?.choices?.[0]?.message?.content;
            if (content && String(content).trim()) return content;
        } catch (e) {
            console.warn('[AI] LLM via 9Router falhou:', e.message);
        }
    }
    return null;
}

async function resolveEducativoContent(line, config) {
    const { tema, produto } = parseEducativoInput(line);
    if (!tema) return null;

    const fallback = () => ({
        titulo: tema.toUpperCase().slice(0, 60),
        titulo_destaque: '',
        subtitulo: '',
        blocos: [],
        dica_extra: '',
        interacao: 'Gostou da dica? Comente ❤️ e compartilhe!',
        produto_nome: produto.slice(0, 40),
        produto_chamada: produto ? 'Conheça nosso material completo.' : '',
        selo: '',
        cor: '#14532d'
    });

    const prompt = `Você é um especialista em marketing digital e criação de cards educativos para Instagram/Facebook.
TEMA: "${tema.slice(0, 200)}"
PRODUTO: "${produto.slice(0, 200) || '(não informado)'}"

Crie o conteúdo de UM card quadrado que ENSINA algo útil sobre o tema e divulga o produto no final.
REGRAS:
- Identifique o nicho automaticamente (receitas, amor/simpatias, espiritualidade, finanças, beleza, saúde, motivação, etc.).
- Ensine algo CONCRETO e VERDADEIRO (receita com ingredientes e preparo, passo a passo, dica prática, curiosidade explicada). Não invente fatos, não prometa milagres (ex: não prometa emagrecimento garantido nem controlar sentimentos).
- Título curto e curioso (máx 60 caracteres) + UMA palavra de destaque do título para grifar em amarelo.
- Subtítulo/explicação curta (máx 140 caracteres).
- Até 2 blocos de conteúdo. Cada bloco: rótulo curto (ex: "Ingredientes:", "Como fazer:", "Passo a passo:") + até 4 itens curtos (máx 55 caracteres cada).
- Dica extra opcional e curta (máx 90 caracteres) ou string vazia.
- UMA chamada de interação curta (máx 70 caracteres, ex: "Gostou? Comente ❤️ e compartilhe!").
- Produto: nome curto (máx 40 caracteres, use o PRODUTO informado ou deduza do tema) + chamada comercial curta (máx 70 caracteres, sem preços/inventar bônus) + selo motivacional curtíssimo opcional (máx 38 caracteres) ou string vazia.
- Cor escura do nicho em hexadecimal (ex: receitas verde #14532d, amor vermelho #9f1239, espiritualidade roxo #4c1d95, finanças azul #1e3a8a, beleza rosa #9d174d).
- Escreva em português do Brasil, acentuação correta.

Responda ESTRITAMENTE em JSON (sem markdown, sem explicação):
{"titulo":"...","titulo_destaque":"...","subtitulo":"...","blocos":[{"rotulo":"...","itens":["..."]}],"dica_extra":"...","interacao":"...","produto_nome":"...","produto_chamada":"...","selo":"...","cor":"..."}`;

    const parse = (raw) => {
        try {
            const cleaned = String(raw || '').replace(/```json/gi, '').replace(/```/g, '').trim();
            const start = cleaned.indexOf('{');
            const end = cleaned.lastIndexOf('}');
            if (start < 0 || end <= start) return null;
            const obj = JSON.parse(cleaned.slice(start, end + 1));
            if (!obj || !obj.titulo) return null;
            const s = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);
            const blocos = Array.isArray(obj.blocos) ? obj.blocos.slice(0, 2).map(b => ({
                rotulo: s(b.rotulo, 28),
                itens: Array.isArray(b.itens) ? b.itens.map(i => s(i, 55)).filter(Boolean).slice(0, 4) : []
            })).filter(b => b.rotulo && b.itens.length > 0) : [];
            let cor = String(obj.cor || '#14532d').trim();
            if (!/^#[0-9a-fA-F]{6}$/.test(cor)) cor = '#14532d';
            return {
                titulo: s(obj.titulo, 60).toUpperCase(),
                titulo_destaque: s(obj.titulo_destaque, 24).toUpperCase(),
                subtitulo: s(obj.subtitulo, 140),
                blocos,
                dica_extra: s(obj.dica_extra, 90),
                interacao: s(obj.interacao, 70) || 'Gostou da dica? Comente ❤️ e compartilhe!',
                produto_nome: s(obj.produto_nome, 40) || produto.slice(0, 40),
                produto_chamada: s(obj.produto_chamada, 70),
                selo: s(obj.selo, 38),
                cor
            };
        } catch (e) {
            console.warn('[AI] Falha ao parsear conteúdo educativo:', e.message);
            return null;
        }
    };

    const raw = await llmChat(config, prompt, 900, 0.7, 25000);
    const parsed = raw ? parse(raw) : null;
    if (parsed) return parsed;
    return fallback();
}

// Gera o prompt em INGLÊS do fundo fotográfico do card Educativo Universal:
// cena do nicho à direita + espaço de texto à esquerda (sem texto no fundo).
async function generateEducativoPromptWithLLM(line, style, config, imageProvider) {
    const { tema, produto } = parseEducativoInput(line);
    const ref = tema || String(line || '');
    if (!ref.trim()) return null;

    const systemPrompt = `You are a senior art director for educational social media cards (Instagram/Facebook).

Based on the THEME below, your ONLY task is to create a DETAILED and DIRECT PROMPT IN ENGLISH for the PHOTOGRAPHIC BACKGROUND of a square 1:1 card (all texts will be overlaid later by code on the LEFT side, NEVER by the image model).

THEME: "${ref.slice(0, 200)}"
${produto ? `RELATED PRODUCT (context only, do not render): "${produto.slice(0, 120)}"` : ''}

RULES:
1. Identify the niche automatically (healthy recipes/food, love/relationships, spirituality, christianity, finance, beauty, health, motivation, etc.) and describe a matching appetizing/emotional photorealistic scene with real objects, ingredients, people or settings from that niche. Never mix religious/cultural symbols from different contexts.
2. COMPOSITION: full-bleed photo. MAIN SUBJECT sharp and vibrant on the RIGHT 55% of the frame. LEFT 45%: same scene heavily blurred with a smooth dark gradient overlay (deep dark tones, low detail, clean copy space). BOTTOM 15%: darker gradient band.
3. STYLE: professional editorial photography, warm light, shallow depth of field, ultra detailed. NOT illustration, painting, drawing, cartoon, 3D render.
4. STRICTLY FORBIDDEN: ANY TEXT, LETTERS, NUMBERS, WATERMARKS, LOGOS (NO TEXT, NO WORDS, NO LETTERS, NO TYPOGRAPHY). No deformed anatomy, no extra fingers.
5. Square 1:1. Maximum 800 characters of direct English.

RESPOND ONLY WITH THE DIRECT ENGLISH PROMPT, NO INTRODUCTION, NO QUOTES, NO EXPLANATIONS.`;

    const out = await llmChat(config, systemPrompt, 500, 0.7, 20000);
    if (out && out.trim().length > 50) {
        let clean = out.trim().replace(/^["']|["']$/g, '').trim();
        if (clean.length > 1500) clean = clean.slice(0, 1500);
        if (!clean.toUpperCase().includes('NO TEXT')) {
            clean += '. NO TEXT, NO WORDS, NO LETTERS, NO TYPOGRAPHY.';
        }
        return clean;
    }
    return null;
}

export async function applyCardTextOverlay(imageLocalOrUrl, phrase, cardStyleId, handle = '', dilemmaData = null, twitterProfile = null, educativoData = null) {
    if (!phrase || !String(phrase).trim()) return imageLocalOrUrl;

    try {
        let inputBuffer = null;
        let isLocalFile = false;
        let localFilePath = null;

        if (imageLocalOrUrl.startsWith('/uploads/')) {
            localFilePath = path.join(process.cwd(), imageLocalOrUrl);
            if (fs.existsSync(localFilePath)) {
                inputBuffer = fs.readFileSync(localFilePath);
                isLocalFile = true;
            }
        } else if (imageLocalOrUrl.startsWith('http')) {
            try {
                const resp = await axios.get(imageLocalOrUrl, { responseType: 'arraybuffer', timeout: 30000 });
                inputBuffer = Buffer.from(resp.data);
            } catch (dlErr) {
                // Fundo remoto morto (ex: Pollinations 402): não retorna URL quebrada —
                // estoura para o chamador tratar como falha de geração (retry/erro claro).
                const status = dlErr?.response?.status;
                throw new Error(`[FUNDOMORTO] Fundo remoto indisponível (${status || dlErr.message}). O provedor de imagem pode estar fora do ar ou sem créditos.`);
            }
        }

        if (!inputBuffer) return imageLocalOrUrl;

        const metadata = await sharp(inputBuffer).metadata();
        const width = metadata.width || 1024;
        const height = metadata.height || 1024;

        let svgOverlay = '';
        const safePhrase = String(phrase).trim();

        if (cardStyleId === 'kawaii') {
            const lines = wrapText(safePhrase.toUpperCase(), 24);
            const fontSize = lines.length > 4 ? 28 : (lines.length > 3 ? 32 : 36);
            const lineHeight = fontSize * 1.35;
            const totalBlockHeight = lines.length * lineHeight;
            const startY = Math.round((height * 0.44 - totalBlockHeight) / 2) + fontSize + 15;

            let tspans = '';
            lines.forEach((line, idx) => {
                const isLast = idx === lines.length - 1;
                const color = isLast ? '#ff4f79' : '#1e1e24';
                const y = startY + (idx * lineHeight);
                tspans += `<text x="${width / 2 + 1}" y="${y + 1}" text-anchor="middle" font-family="'Nunito', 'Segoe UI', Arial, sans-serif" font-weight="900" font-size="${fontSize}px" fill="#ffffff" opacity="0.95">${escapeXml(line)}</text>\n`;
                tspans += `<text x="${width / 2}" y="${y}" text-anchor="middle" font-family="'Nunito', 'Segoe UI', Arial, sans-serif" font-weight="900" font-size="${fontSize}px" fill="${color}">${escapeXml(line)}</text>\n`;
            });

            svgOverlay = `
                <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
                    ${tspans}
                </svg>
            `;
        } else if (cardStyleId === 'minimalista') {
            const lines = wrapText(safePhrase, 28);
            const fontSize = lines.length > 4 ? 26 : (lines.length > 3 ? 30 : 34);
            const lineHeight = fontSize * 1.45;
            const totalBlockHeight = lines.length * lineHeight;
            const startY = Math.round((height - totalBlockHeight) / 2) + fontSize - 20;

            let tspans = '';
            tspans += `<text x="${width / 2}" y="${startY - fontSize}" text-anchor="middle" font-family="'Georgia', 'Times New Roman', serif" font-style="italic" font-size="52px" fill="#1b2a4a" opacity="0.75">“</text>\n`;

            lines.forEach((line, idx) => {
                const y = startY + (idx * lineHeight);
                tspans += `<text x="${width / 2}" y="${y}" text-anchor="middle" font-family="'Georgia', 'Times New Roman', serif" font-style="italic" font-size="${fontSize}px" fill="#1b2a4a">${escapeXml(line)}</text>\n`;
            });

            svgOverlay = `
                <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
                    ${tspans}
                </svg>
            `;
        } else if (cardStyleId === 'sabedoria_eres') {
            // Layout quadrado 1:1 cinematográfico.
            // Metade ESQUERDA = personagem (gerado pela IA) | Metade DIREITA = tipografia.
            const rawWords = safePhrase.split(/\s+/).filter(Boolean);

            // O nome da entidade = até o primeiro verbo ("ensina", "diz", "lembra", "é", "foi")
            const verbRe = /\b(ensina|diz|lembra|falou|afirma|deixa|comecou|come[çc]ou|precisa|pode|nao|não|foi|ser|estar|quer|vai|deve|e)\b/i;
            let titleWords = [];
            let bodyWords = rawWords;
            for (let i = 1; i < Math.min(rawWords.length, 7); i++) {
                if (verbRe.test(rawWords[i])) { titleWords = rawWords.slice(0, i); bodyWords = rawWords.slice(i); break; }
            }
            if (titleWords.length === 0 || titleWords.length > 5) {
                titleWords = rawWords.slice(0, Math.min(3, rawWords.length));
                bodyWords = rawWords.slice(titleWords.length);
            }

            const title = titleWords.join(' ');
            const bodyText = bodyWords.join(' ');

            const GOLD = '#d4a017';
            const CREAM = '#f5ecd7';

            // Coluna de texto na metade ESQUERDA (personagem ocupa a direita)
            const pad = Math.round(width * 0.055);
            const textLeft = pad;
            const textWidth = Math.round(width * 0.46) - pad;

            // Gradiente escuro suave: o painel já foi limpo/desescurecido pelo sharp,
            // então o gradiente só serve para dar profundidade e esconder a emenda.
            const gradId = `txtbg${width}`;
            let tspans = '';
            const shadow = `<filter id="sh" x="-25%" y="-25%" width="150%" height="150%"><feDropShadow dx="0" dy="2" stdDeviation="3.5" flood-color="#000000" flood-opacity="0.9"/></filter>`;

            tspans += `<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="0">`;
            tspans += `<stop offset="0%" stop-color="#000000" stop-opacity="0.42"/>`;
            tspans += `<stop offset="55%" stop-color="#000000" stop-opacity="0.30"/>`;
            tspans += `<stop offset="100%" stop-color="#000000" stop-opacity="0"/>`;
            tspans += `</linearGradient></defs>`;
            tspans += `<rect x="0" y="0" width="${Math.round(width * 0.62)}" height="${height}" fill="url(#${gradId})"/>`;

            // Título: quebra em 2 linhas se necessário
            const titleSize = Math.round(textWidth * 0.135);
            const titleLines = wrapText(title, title.length > 16 ? 12 : 16);

            // Corpo: fonte ajustada ao número de linhas
            let bodyLines = wrapText(bodyText, 20);
            let bodySize = Math.round(textWidth / 10.5);
            const MAX_BODY_LINES = 8;
            if (bodyLines.length > MAX_BODY_LINES) {
                bodySize = Math.max(15, Math.round(textWidth / 13));
                bodyLines = wrapText(bodyText, 26);
            }
            const bodyLineHeight = Math.round(bodySize * 1.44);

            // Palavra em destaque = mais longa do corpo
            let highlight = '';
            for (const w of bodyWords) {
                const clean = w.replace(/[^\p{L}\p{N}]/gu, '');
                if (clean.length >= 4 && clean.length > highlight.replace(/[^\p{L}\p{N}]/gu, '').length) highlight = clean;
            }

            // ─── TÍTULO (brush script dourado) ───
            // Centraliza verticalmente o conjunto título+regra+corpo
            const bodyBlockH = bodyLines.length * bodyLineHeight;
            const totalBlockH = titleLines.length * titleSize * 1.1 + Math.round(titleSize * 0.12) + Math.round(bodySize * 1.75) + bodyBlockH;
            const blockTop = Math.max(Math.round(height * 0.1), Math.round((height - totalBlockH) / 2) - Math.round(height * 0.04));
            const titleTop = blockTop;

            tspans += `<g filter="url(#sh)">`;
            titleLines.forEach((line, idx) => {
                const y = titleTop + (idx * titleSize * 1.1);
                const fs = Math.round(titleSize * (idx === 0 ? 1 : 0.78));
                tspans += `<text x="${textLeft}" y="${y}" font-family="'Brush Script MT', 'Segoe Script', 'URW Chancery L', Georgia, serif" font-style="italic" font-weight="700" font-size="${fs}px" fill="${GOLD}">${escapeXml(line)}</text>\n`;
            });
            tspans += `</g>`;

            // ─── REGRA + fleur-de-lis ───
            const titleEndY = titleTop + (titleLines.length * titleSize * 1.1);
            const ruleY = titleEndY + Math.round(titleSize * 0.12);
            const ruleW = Math.round(textWidth * 0.62);
            const fx = textLeft + Math.round(ruleW * 0.5);
            tspans += `<g filter="url(#sh)" stroke="${GOLD}" fill="none" stroke-width="1.8" opacity="0.95">`;
            tspans += `<line x1="${textLeft}" y1="${ruleY}" x2="${textLeft + Math.round(ruleW * 0.34)}" y2="${ruleY}"/>`;
            tspans += `<line x1="${textLeft + Math.round(ruleW * 0.66)}" y1="${ruleY}" x2="${textLeft + ruleW}" y2="${ruleY}"/>`;
            tspans += `<path d="M ${fx} ${ruleY - 12} L ${fx} ${ruleY + 10} M ${fx - 7} ${ruleY - 7} Q ${fx} ${ruleY - 18} ${fx + 7} ${ruleY - 7} M ${fx - 7} ${ruleY + 3} Q ${fx} ${ruleY + 10} ${fx + 7} ${ruleY + 3}"/>`;
            tspans += `</g>`;

            // ─── CORPO (serifa creme, destaque dourado) ───
            const bodyTop = ruleY + Math.round(bodySize * 1.75);
            tspans += `<g filter="url(#sh)" font-family="'Georgia', 'Times New Roman', serif" font-size="${bodySize}px" fill="${CREAM}">`;
            bodyLines.forEach((line, idx) => {
                const y = bodyTop + (idx * bodyLineHeight);
                let content = escapeXml(line);
                if (highlight) {
                    const escHl = escapeXml(highlight);
                    content = content.replace(escHl, `<tspan fill="${GOLD}" font-weight="700">${escHl}</tspan>`);
                }
                tspans += `<text x="${textLeft}" y="${y}">${content}</text>\n`;
            });
            tspans += `</g>`;

            // ─── REGRA + losango ───
            const bodyEndY = bodyTop + (bodyLines.length * bodyLineHeight);
            const diaY = bodyEndY + Math.round(bodySize * 0.6);
            const dW = Math.round(textWidth * 0.66);
            const dx = textLeft + Math.round(dW * 0.5);
            tspans += `<g filter="url(#sh)" stroke="${GOLD}" fill="none" stroke-width="1.5" opacity="0.9">`;
            tspans += `<line x1="${textLeft}" y1="${diaY}" x2="${textLeft + Math.round(dW * 0.32)}" y2="${diaY}"/>`;
            tspans += `<line x1="${textLeft + Math.round(dW * 0.68)}" y1="${diaY}" x2="${textLeft + dW}" y2="${diaY}"/>`;
            tspans += `<path d="M ${dx} ${diaY - 8} L ${dx + 8} ${diaY} L ${dx} ${diaY + 8} L ${dx - 8} ${diaY} Z"/>`;
            tspans += `</g>`;

            // ─── COLCHETE DE CANTO DOURADO (rodapé esquerdo) ───
            // Sem tagline/rodapé: o prompt exige "não adicione nenhum texto extra"
            const bq = Math.round(width * 0.04);
            const bx = pad;
            const by = height - Math.round(height * 0.032);
            tspans += `<g stroke="${GOLD}" fill="none" stroke-width="2" opacity="0.7">`;
            tspans += `<path d="M ${bx + bq} ${by} L ${bx} ${by} L ${bx} ${by - bq}"/>`;
            tspans += `</g>`;

            svgOverlay = `
                <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
                    <defs>${shadow}</defs>
                    ${tspans}
                </svg>
            `;
        } else if (cardStyleId === 'dilemas') {
            // ─── CARD DE DILEMAS — PROMPT MESTRE UNIVERSAL (FULL-BLEED 4:5) ───
            // Layout igual à referência viral:
            // TOPO: frase principal em destaque | MEIO: cena (fundo) |
            // INFERIOR: pergunta + 2 escolhas lado a lado + CTA.
            // O dilemmaData vem da IA (Gemini/9Router/OpenAI). Se o usuário
            // mandou frase com 3 linhas, usa as linhas. Senão usa a IA.
            const rawParts = safePhrase.split(/\r?\n/).map(p => p.trim()).filter(Boolean);
            const mainPhrase = rawParts[0] || safePhrase;

            let q = dilemmaData?.question || '';
            let aEmoji = dilemmaData?.optionA?.emoji || '';
            let aTitle = dilemmaData?.optionA?.title || '';
            let aSub = dilemmaData?.optionA?.subtitle || '';
            let bEmoji = dilemmaData?.optionB?.emoji || '';
            let bTitle = dilemmaData?.optionB?.title || '';
            let bSub = dilemmaData?.optionB?.subtitle || '';
            let cta = dilemmaData?.cta || 'COMENTE SUA ESCOLHA!';

            // Frase com opções manuais (3 linhas) tem prioridade sobre a IA
            if (rawParts.length >= 3) {
                q = '';
                const parseOpt = (s) => {
                    const m = String(s).match(/^(\p{Extended_Pictographic}|\p{Emoji_Presentation}|.)\s*(.*)$/u);
                    return { emoji: (m?.[1] || '').slice(0, 4), title: (m?.[2] || s).toUpperCase().slice(0, 30) };
                };
                const pa = parseOpt(rawParts[1]);
                const pb = parseOpt(rawParts[2]);
                aEmoji = pa.emoji || '😊'; aTitle = pa.title; aSub = '';
                bEmoji = pb.emoji || '😟'; bTitle = pb.title; bSub = '';
                q = 'O QUE VOCÊ FARIA?';
            } else if (rawParts.length === 2 && !dilemmaData) {
                q = 'O QUE VOCÊ FARIA?';
                aEmoji = '👉'; aTitle = rawParts[1].toUpperCase().slice(0, 30); aSub = '';
                bEmoji = '👉'; bTitle = ''; bSub = '';
            }
            if (!q) q = 'QUAL É O SEU CAMINHO AGORA?';
            if (!aTitle) { aEmoji = '😊'; aTitle = 'ACREDITAR E RECOMEÇAR'; aSub = 'Com mais fé, coragem e o coração leve.'; }
            if (!bTitle) { bEmoji = '😟'; bTitle = 'CONTINUAR NO MESMO LUGAR'; bSub = 'Esperando que as coisas melhorem sozinhas.'; }

            const cx = Math.round(width / 2);
            const padX = Math.round(width * 0.045);
            const topY = Math.round(height * 0.035);

            // Frase do topo (destaque máximo, centralizada)
            const phraseLines = wrapText(mainPhrase.toUpperCase(), width >= 1080 ? 24 : 20);
            const topLines = phraseLines.slice(0, 5);
            const phraseFont = topLines.length > 4 ? Math.round(width * 0.052) : (topLines.length > 3 ? Math.round(width * 0.058) : Math.round(width * 0.064));
            const phraseLH = Math.round(phraseFont * 1.18);

            const HL = ['NOVO','NOVA','SORRISO','ESPERANÇA','ESPERANCA','COMEÇO','COMEC','RECOMEÇO','RECOMEC','FÉ','FE','AMOR','FELICIDADE','SONHO','DINHEIRO','FAMÍLIA','FAMILIA','PERDÃO','PERDAO','CORAGEM','PAZ','ALEGRIA'];
            const paintLine = (line, fontPx) => {
                const words = String(line).split(/\s+/);
                const gap = Math.round(fontPx * 0.28);
                let out = '';
                words.forEach((w, i) => {
                    const norm = w.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z]/gi, '').toUpperCase();
                    const isHL = HL.some(h => norm.includes(h));
                    const dx = i === 0 ? '' : ` dx="${gap}"`;
                    out += `<tspan${dx} fill="${isHL ? '#fcd34d' : '#ffffff'}">${escapeXml(w)}</tspan>`;
                });
                return out;
            };

            let tspans = `<defs><filter id="sh" x="-25%" y="-25%" width="150%" height="150%"><feDropShadow dx="0" dy="2" stdDeviation="3.5" flood-color="#000000" flood-opacity="0.9"/></filter>
                <linearGradient id="dtop" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#000000" stop-opacity="0.88"/>
                    <stop offset="100%" stop-color="#000000" stop-opacity="0.15"/>
                </linearGradient>
                <linearGradient id="dbot" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#000000" stop-opacity="0.10"/>
                    <stop offset="100%" stop-color="#000000" stop-opacity="0.92"/>
                </linearGradient>
            </defs>`;
            // Faixas de legibilidade topo + base
            tspans += `<rect x="0" y="0" width="${width}" height="${Math.round(height * 0.34)}" fill="url(#dtop)"/>`;
            tspans += `<rect x="0" y="${Math.round(height * 0.58)}" width="${width}" height="${Math.round(height * 0.42)}" fill="url(#dbot)"/>`;

            // 1. FRASE PRINCIPAL (topo, centralizada, com sombra forte)
            let fy = topY + phraseFont;
            tspans += `<g filter="url(#sh)" font-family="'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="900" font-size="${phraseFont}px" text-anchor="middle">`;
            topLines.forEach((line) => {
                tspans += `<text x="${cx}" y="${fy}" xml:space="preserve">${paintLine(line, phraseFont)}</text>`;
                fy += phraseLH;
            });
            tspans += `</g>`;

            // 2. PERGUNTA (centralizada, acima dos botões)
            const btnH = Math.round(height * 0.13);
            const btnW = Math.round((width - padX * 2 - Math.round(width * 0.03)) / 2);
            const btnY = Math.round(height * 0.74);
            const qFont = Math.round(width * 0.042);
            const qY = btnY - Math.round(height * 0.035);
            tspans += `<g filter="url(#sh)" font-family="'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="900" font-size="${qFont}px" fill="#ffffff" text-anchor="middle">`;
            tspans += `<text x="${cx}" y="${qY}" font-style="italic">${escapeXml(q)}</text>`;
            tspans += `<rect x="${cx - Math.round(btnW * 0.9)}" y="${qY + 8}" width="${Math.round(btnW * 1.8)}" height="5" rx="2.5" fill="#fcd34d"/>`;
            tspans += `</g>`;

            // 3. DOIS BOTÕES LADO A LADO (verde × vermelho)
            const tFont = Math.round(width * 0.036);
            const sFont = Math.round(width * 0.022);
            const eFont = Math.round(width * 0.075);
            const drawBtn = (bx, fill1, fill2, emoji, title, sub) => {
                const emojiCx = bx + Math.round(btnW * 0.17);
                const emojiCy = btnY + Math.round(btnH * 0.52);
                const textCx = bx + Math.round(btnW * 0.60);
                const tLines = wrapText(title.toUpperCase(), 13).slice(0, 2);
                const titleTop = btnY + Math.round(btnH * 0.30) + (tLines.length > 1 ? -4 : 8);
                let s = `<g font-family="'Segoe UI', Roboto, Helvetica, Arial, sans-serif" text-anchor="middle">`;
                s += `<rect x="${bx}" y="${btnY}" width="${btnW}" height="${btnH}" rx="${Math.round(btnW * 0.06)}" fill="${fill1}" stroke="${fill2}" stroke-width="3"/>`;
                s += `<text x="${emojiCx}" y="${emojiCy}" font-size="${eFont}px">${escapeXml(emoji)}</text>`;
                tLines.forEach((tl, i) => {
                    s += `<text x="${textCx}" y="${titleTop + i * Math.round(tFont * 1.08)}" font-size="${tFont}px" font-weight="900" fill="#ffffff">${escapeXml(tl)}</text>`;
                });
                if (sub) {
                    const sLines = wrapText(sub, 24).slice(0, 2);
                    const subTop = titleTop + tLines.length * Math.round(tFont * 1.08) + 2;
                    sLines.forEach((sl, i) => {
                        s += `<text x="${textCx}" y="${subTop + i * Math.round(sFont * 1.3)}" font-size="${sFont}px" font-weight="500" fill="#ffffff" opacity="0.95">${escapeXml(sl)}</text>`;
                    });
                }
                s += `</g>`;
                return s;
            };
            const bxA = padX;
            const bxB = padX + btnW + Math.round(width * 0.03);
            tspans += drawBtn(bxA, '#047857', '#10b981', aEmoji, aTitle, aSub);
            tspans += drawBtn(bxB, '#b91c1c', '#ef4444', bEmoji, bTitle, bSub);

            // 4. CTA RODAPÉ
            const ctaY = btnY + btnH + Math.round(height * 0.045);
            const ctaFont = Math.round(width * 0.040);
            tspans += `<g font-family="'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="900" font-size="${ctaFont}px" fill="#fcd34d" text-anchor="middle" filter="url(#sh)">`;
            tspans += `<text x="${cx}" y="${ctaY}">👇 ${escapeXml(cta)} 👇</text>`;
            tspans += `</g>`;

            svgOverlay = `
                <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
                    ${tspans}
                </svg>
            `;
        } else if (cardStyleId === 'romantico_ilustrado') {
            // ─── ROMÂNTICO ILUSTRADO (frase no terço superior + ilustração) ───
            // Padrão viral: frase entre aspas, palavras de impacto em vinho,
            // linha de atribuição "——♡ @perfil ♡——" e coraçõezinhos espalhados.
            const WINE = '#8e1e2e';
            const INK = '#231a12';

            // Aspas como no padrão (só adiciona se a frase ainda não tem)
            let quotePhrase = safePhrase.trim();
            if (!/^["“”]/.test(quotePhrase)) quotePhrase = `"${quotePhrase}`;
            if (!/["“”]$/.test(quotePhrase)) quotePhrase = `${quotePhrase}"`;

            // Palavras de impacto em vinho: a mais longa (frase curta) ou a
            // palavra de virada de cada cláusula + o fecho final
            // (ex: "prioridade" + "apenas resto mesmo.")
            const stripW = (w) => w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');
            const clauses = quotePhrase.split(/[,;—–]/).map(c => c.trim()).filter(Boolean);
            const redSet = new Set();
            const longestOf = (words) => {
                let best = null;
                for (const w of words) {
                    if (!best || w.key.length > best.key.length) best = w;
                }
                return best;
            };
            const wordsOf = (cl) => cl.split(/\s+/).map(w => ({ raw: w, key: stripW(w) })).filter(w => w.key.length >= 4);
            if (clauses.length <= 1) {
                const top = longestOf(wordsOf(clauses[0] || quotePhrase));
                if (top) redSet.add(top.key);
            } else {
                for (let ci = 1; ci < clauses.length; ci++) {
                    const ws = wordsOf(clauses[ci]);
                    if (ws.length > 0) redSet.add(ws[0].key); // virada após a vírgula
                    if (ci === clauses.length - 1) {
                        ws.slice(-3).forEach(w => redSet.add(w.key)); // fecho final
                    }
                }
            }

            const paintRomLine = (line) => {
                return line.split(/(\s+)/).map(tok => {
                    if (/^\s+$/.test(tok) || tok === '') return escapeXml(tok);
                    const key = stripW(tok);
                    if (key && redSet.has(key)) return `<tspan fill="${WINE}">${escapeXml(tok)}</tspan>`;
                    return escapeXml(tok);
                }).join('');
            };

            let rLines = wrapText(quotePhrase, 24);
            let rSize = rLines.length > 6 ? 30 : rLines.length > 4 ? 34 : 40;
            if (rLines.length > 9) { rSize = 27; rLines = wrapText(quotePhrase, 28); }
            const rLH = Math.round(rSize * 1.42);
            const rTopY = Math.round(height * 0.045);
            const blockH = rLines.length * rLH;

            let tspans = `<defs><filter id="rsh" x="-25%" y="-25%" width="150%" height="150%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#5b3a29" flood-opacity="0.35"/></filter>`;
            tspans += `<linearGradient id="rtop" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fff8f1" stop-opacity="0.85"/><stop offset="100%" stop-color="#fff8f1" stop-opacity="0"/></linearGradient></defs>`;
            // Véu claro no topo para legibilidade sem esconder a ilustração
            const attrSize = Math.round(rSize * 0.52);
            const attrY = rTopY + rSize + blockH + Math.round(rLH * 0.55);
            tspans += `<rect x="0" y="0" width="${width}" height="${Math.round(attrY + attrSize)}" fill="url(#rtop)"/>`;

            tspans += `<g filter="url(#rsh)" font-family="'Georgia', 'Times New Roman', serif" font-weight="700" font-size="${rSize}px" fill="${INK}" text-anchor="middle" xml:space="preserve">`;
            rLines.forEach((line, li) => {
                tspans += `<text x="${width / 2}" y="${rTopY + rSize + li * rLH}">${paintRomLine(line)}</text>\n`;
            });
            tspans += `</g>`;

            // Linha de atribuição "—— @perfil ——" com coraçõezinhos em vetor
            // (usa a marca d'água digitada; ♡ em texto não renderiza na fonte)
            const attrHandle = String(handle || '').trim();
            if (attrHandle && attrHandle !== '@SEU_PERFIL') {
                const estW = attrHandle.length * attrSize * 0.52;
                const gapH = 26;
                const heartPathAttr = (cx, cy, s) =>
                    `M ${cx} ${cy + s * 0.35} C ${cx - s * 0.6} ${cy - s * 0.15} ${cx - s * 0.35} ${cy - s * 0.6} ${cx} ${cy - s * 0.25} C ${cx + s * 0.35} ${cy - s * 0.6} ${cx + s * 0.6} ${cy - s * 0.15} ${cx} ${cy + s * 0.35} Z`;
                const hy = attrY - Math.round(attrSize * 0.28);
                const hs = 9;
                const hLX = Math.round(width / 2 - estW / 2 - gapH);
                const hRX = Math.round(width / 2 + estW / 2 + gapH);
                const dashW = 44;
                tspans += `<g font-family="'Georgia', 'Times New Roman', serif" font-size="${attrSize}px" font-weight="700" fill="${INK}">`;
                tspans += `<text x="${width / 2}" y="${attrY}" text-anchor="middle">${escapeXml(attrHandle)}</text>`;
                tspans += `<text x="${Math.round(hLX - gapH * 0.7 - dashW)}" y="${attrY}">——</text>`;
                tspans += `<text x="${Math.round(hRX + gapH * 0.7)}" y="${attrY}">——</text>`;
                tspans += `<path d="${heartPathAttr(hLX, hy, hs)}" fill="${WINE}"/>`;
                tspans += `<path d="${heartPathAttr(hRX, hy, hs)}" fill="${WINE}"/>`;
                tspans += `</g>`;
            }

            // Coraçõezinhos espalhados ao redor do texto (cheios + contorno)
            const heartPath = (cx, cy, s) =>
                `M ${cx} ${cy + s * 0.35} C ${cx - s * 0.6} ${cy - s * 0.15} ${cx - s * 0.35} ${cy - s * 0.6} ${cx} ${cy - s * 0.25} C ${cx + s * 0.35} ${cy - s * 0.6} ${cx + s * 0.6} ${cy - s * 0.15} ${cx} ${cy + s * 0.35} Z`;
            const hMidY = rTopY + Math.round(blockH / 2);
            const hS = Math.max(11, Math.round(rSize * 0.36));
            const hxL = Math.round(width * 0.055);
            const hxR = Math.round(width * 0.945);
            tspans += `<g>`;
            tspans += `<path d="${heartPath(hxL, rTopY + 6, hS * 0.8)}" fill="none" stroke="${WINE}" stroke-width="3"/>`;
            tspans += `<path d="${heartPath(hxR, rTopY + 2, hS * 1.1)}" fill="${WINE}"/>`;
            tspans += `<path d="${heartPath(hxL, hMidY, hS)}" fill="${WINE}"/>`;
            tspans += `<path d="${heartPath(hxR, hMidY + 6, hS * 0.85)}" fill="none" stroke="${WINE}" stroke-width="3"/>`;
            tspans += `<path d="${heartPath(Math.round(width * 0.12), attrY - 4, hS * 0.6)}" fill="${WINE}" opacity="0.85"/>`;
            tspans += `<path d="${heartPath(Math.round(width * 0.88), attrY - 4, hS * 0.6)}" fill="${WINE}" opacity="0.85"/>`;
            tspans += `</g>`;

            svgOverlay = `
                <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
                    ${tspans}
                </svg>
            `;
        } else if (cardStyleId === 'cristao_cinematografico') {
            // ─── CRISTÃO CINEMATOGRÁFICO 4:5 (FOCO EM CRISTO) ───
            // Frase no topo esquerdo (serifada, azul-marinho/preto, destaque dourado),
            // marca "FOCO EM CRISTO" no rodapé esquerdo (emblema circular + cruz/livro).
            const NAVY = '#1a2a4a';
            const GOLD = '#c9a227';
            const INK = '#0f1a2e';
            const WHITE = '#ffffff';

            // Aspas apenas se não houver referência bíblica já no final
            let quotePhrase = safePhrase.trim();
            const hasRef = /\(\s*[A-Za-zÀ-ú]+\s+\d+[:.]\d+/.test(quotePhrase) || /[A-Za-zÀ-ú]+\s+\d+[:.]\d+$/.test(quotePhrase);
            if (!hasRef && !/^["“”]/.test(quotePhrase)) quotePhrase = `"${quotePhrase}`;
            if (!hasRef && !/["“”]$/.test(quotePhrase)) quotePhrase = `${quotePhrase}"`;

            // Palavras de destaque em dourado: palavras-chave bíblicas comuns
            const GOLD_WORDS = ['DEUS', 'JESUS', 'CRISTO', 'SENHOR', 'PAI', 'ESPÍRITO', 'ESPIRITO', 'SANTO', 'AMOR', 'FÉ', 'FE', 'ESPERANÇA', 'ESPERANCA', 'SALVAÇÃO', 'SALVACAO', 'GRAÇA', 'GRACA', 'CRUZ', 'REINO', 'CÉU', 'CEU', 'VIDA', 'VERDADE', 'CAMINHO', 'LUZ', 'MUNDO', 'PAZ', 'FORÇA', 'FORCA', 'ROCHA', 'REFÚGIO', 'REFUGIO', 'FORTALEZA', 'PASTOR', 'CORDEIRO', 'ALFA', 'ÔMEGA', 'OMEGA', 'REI', 'REIS', 'GLÓRIA', 'GLORIA', 'PODER', 'ETERNO', 'AMÉM', 'AMEM'];
            const stripW = (w) => w.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z]/g, '');
            const goldSet = new Set();
            for (const w of quotePhrase.split(/\s+/)) {
                const key = stripW(w);
                if (GOLD_WORDS.includes(key)) goldSet.add(key);
            }

            const paintLine = (line) => {
                return line.split(/(\s+)/).map(tok => {
                    if (/^\s+$/.test(tok) || tok === '') return escapeXml(tok);
                    const key = stripW(tok);
                    if (key && goldSet.has(key)) return `<tspan fill="${GOLD}">${escapeXml(tok)}</tspan>`;
                    return escapeXml(tok);
                }).join('');
            };

            // Quebra de linhas no topo esquerdo (área ~55% da largura)
            const maxChars = Math.max(22, Math.round(width * 0.028));
            let cLines = wrapText(quotePhrase, maxChars);
            let cSize = cLines.length > 8 ? 28 : cLines.length > 6 ? 32 : cLines.length > 4 ? 38 : 44;
            if (cLines.length > 10) { cSize = 26; cLines = wrapText(quotePhrase, maxChars + 4); }
            const cLH = Math.round(cSize * 1.42);
            const cTopY = Math.round(height * 0.055);
            const cLeftX = Math.round(width * 0.06);
            const blockH = cLines.length * cLH;

            // Véu de legibilidade no canto superior esquerdo
            const veilW = Math.round(width * 0.58);
            const veilH = Math.round(cTopY + blockH + cSize * 1.2);
            let tspans = `<defs>`;
            tspans += `<filter id="csh" x="-25%" y="-25%" width="150%" height="150%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000000" flood-opacity="0.5"/></filter>`;
            tspans += `<linearGradient id="cveil" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${WHITE}" stop-opacity="0.92"/><stop offset="100%" stop-color="${WHITE}" stop-opacity="0"/></linearGradient>`;
            tspans += `</defs>`;
            tspans += `<rect x="0" y="0" width="${veilW}" height="${veilH}" fill="url(#cveil)"/>`;

            // FRASE PRINCIPAL (topo esquerdo)
            tspans += `<g filter="url(#csh)" font-family="'Cinzel', 'Trajan Pro', 'Garamond', 'Times New Roman', serif" font-weight="700" font-size="${cSize}px" fill="${NAVY}" xml:space="preserve">`;
            cLines.forEach((line, li) => {
                const y = cTopY + cSize + li * cLH;
                tspans += `<text x="${cLeftX}" y="${y}">${paintLine(line)}</text>`;
            });
            tspans += `</g>`;

            // ─── MARCA FOCO EM CRISTO (rodapé esquerdo) ───
            const brandY = height - Math.round(height * 0.055);
            const emblemR = Math.round(width * 0.038);
            const emblemX = Math.round(width * 0.06) + emblemR;
            const textX = emblemX + emblemR + Math.round(width * 0.018);
            const brandFont = Math.round(width * 0.028);
            const subFont = Math.round(width * 0.018);

            // Emblema circular preto com contorno dourado
            tspans += `<circle cx="${emblemX}" cy="${brandY}" r="${emblemR}" fill="#000000" stroke="${GOLD}" stroke-width="2.5"/>`;
            // Cruz sobre livro aberto (simplificado em paths SVG)
            const cs = emblemR * 0.45;
            // Livro (base)
            tspans += `<path d="M ${emblemX - cs} ${brandY - cs * 0.2} L ${emblemX - cs} ${brandY + cs * 0.6} L ${emblemX + cs} ${brandY + cs * 0.6} L ${emblemX + cs} ${brandY - cs * 0.2} Z" fill="${WHITE}" opacity="0.9"/>`;
            // Páginas
            tspans += `<path d="M ${emblemX} ${brandY - cs * 0.2} L ${emblemX} ${brandY + cs * 0.6}" stroke="${INK}" stroke-width="1.5" opacity="0.6"/>`;
            // Cruz vertical
            tspans += `<path d="M ${emblemX} ${brandY - cs * 0.5} L ${emblemX} ${brandY + cs * 0.3}" stroke="${WHITE}" stroke-width="${Math.max(2, Math.round(cs * 0.18))}" stroke-linecap="round"/>`;
            // Cruz horizontal
            tspans += `<path d="M ${emblemX - cs * 0.45} ${brandY - cs * 0.1} L ${emblemX + cs * 0.45} ${brandY - cs * 0.1}" stroke="${WHITE}" stroke-width="${Math.max(2, Math.round(cs * 0.18))}" stroke-linecap="round"/>`;

            // Texto "FOCO EM CRISTO"
            tspans += `<g font-family="'Cinzel', 'Trajan Pro', 'Garamond', 'Times New Roman', serif" font-weight="700" fill="${INK}" text-anchor="start">`;
            tspans += `<text x="${textX}" y="${brandY - Math.round(brandFont * 0.15)}" font-size="${brandFont}px">FOCO EM </text>`;
            tspans += `<text x="${textX}" y="${brandY + Math.round(brandFont * 1.05)}" font-size="${brandFont}px" fill="${GOLD}">CRISTO</text>`;
            tspans += `<text x="${textX}" y="${brandY + Math.round(brandFont * 2.2)}" font-size="${subFont}px" font-weight="600" fill="${GOLD}" opacity="0.9">LEVANDO A MENSAGEM DE JESUS</text>`;
            tspans += `</g>`;

            svgOverlay = `
                <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
                    ${tspans}
                </svg>
            `;
        } else if (cardStyleId === 'biblia_aberta_cinematografica') {
            // ─── BÍBLIA ABERTA CINEMATOGRÁFICA 4:5 (CAMINHO DA FÉ) ───
            // Frase CENTRAL nas páginas da Bíblia aberta (serifada, preta/marrom-escuro),
            // composição: céu dramático topo + Bíblia central + vale com caminho/pegadas base.
            const INK = '#1a1a12';
            const DARK_BROWN = '#3d2e1a';
            const GOLD = '#c9a227';
            const WHITE = '#ffffff';

            // Aspas apenas se não houver referência bíblica já no final
            let quotePhrase = safePhrase.trim();
            const hasRef = /\(\s*[A-Za-zÀ-ú]+\s+\d+[:.]\d+/.test(quotePhrase) || /[A-Za-zÀ-ú]+\s+\d+[:.]\d+$/.test(quotePhrase);
            if (!hasRef && !/^["“”]/.test(quotePhrase)) quotePhrase = `"${quotePhrase}`;
            if (!hasRef && !/["“”]$/.test(quotePhrase)) quotePhrase = `${quotePhrase}"`;

            // Palavras de destaque em dourado: palavras-chave bíblicas
            const GOLD_WORDS = ['DEUS', 'JESUS', 'CRISTO', 'SENHOR', 'PAI', 'ESPÍRITO', 'ESPIRITO', 'SANTO', 'AMOR', 'FÉ', 'FE', 'ESPERANÇA', 'ESPERANCA', 'SALVAÇÃO', 'SALVACAO', 'GRAÇA', 'GRACA', 'CRUZ', 'REINO', 'CÉU', 'CEU', 'VIDA', 'VERDADE', 'CAMINHO', 'LUZ', 'MUNDO', 'PAZ', 'FORÇA', 'FORCA', 'ROCHA', 'REFÚGIO', 'REFUGIO', 'FORTALEZA', 'PASTOR', 'CORDEIRO', 'ALFA', 'ÔMEGA', 'OMEGA', 'REI', 'REIS', 'GLÓRIA', 'GLORIA', 'PODER', 'ETERNO', 'AMÉM', 'AMEM', 'BÍBLIA', 'BIBLIA', 'PALAVRA', 'VERDADE', 'CAMINHO', 'VIDA'];
            const stripW = (w) => w.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z]/g, '');
            const goldSet = new Set();
            for (const w of quotePhrase.split(/\s+/)) {
                const key = stripW(w);
                if (GOLD_WORDS.includes(key)) goldSet.add(key);
            }

            const paintLine = (line) => {
                return line.split(/(\s+)/).map(tok => {
                    if (/^\s+$/.test(tok) || tok === '') return escapeXml(tok);
                    const key = stripW(tok);
                    if (key && goldSet.has(key)) return `<tspan fill="${GOLD}">${escapeXml(tok)}</tspan>`;
                    return escapeXml(tok);
                }).join('');
            };

            // Extrai a referência para a linha dourada abaixo (evita duplicar no corpo)
            let refTextOnly = '';
            {
                const rm = quotePhrase.match(/\(?\s*([A-Za-zÀ-ú]+\s+\d+[:.]\d+)\s*\)?$/);
                if (rm) {
                    refTextOnly = rm[1];
                    quotePhrase = quotePhrase.slice(0, rm.index).trim();
                    if (/^["“”]/.test(quotePhrase) && !/["“”]$/.test(quotePhrase)) quotePhrase = `${quotePhrase}"`;
                }
            }

            // Área da Bíblia: centro da imagem (~45% altura, ~70% largura)
            const bibleTopY = Math.round(height * 0.22);
            const bibleBottomY = Math.round(height * 0.68);
            const bibleH = bibleBottomY - bibleTopY;
            const bibleW = Math.round(width * 0.72);
            const bibleLeftX = Math.round((width - bibleW) / 2);
            const bibleRightX = bibleLeftX + bibleW;
            const bibleCenterX = width / 2;

            // Quebra de linhas CENTRADA na área das páginas da Bíblia
            const maxChars = Math.max(24, Math.round(bibleW * 0.026));
            let bLines = wrapText(quotePhrase, maxChars);
            let bSize = bLines.length > 10 ? 26 : bLines.length > 8 ? 30 : bLines.length > 6 ? 34 : bLines.length > 4 ? 38 : 42;
            if (bLines.length > 12) { bSize = 24; bLines = wrapText(quotePhrase, maxChars + 4); }
            const bLH = Math.round(bSize * 1.4);
            const blockH = bLines.length * bLH;
            const blockTopY = bibleTopY + Math.round((bibleH - blockH) / 2) + Math.round(bSize * 0.5);

            let tspans = `<defs>`;
            tspans += `<filter id="bsh" x="-25%" y="-25%" width="150%" height="150%"><feDropShadow dx="0" dy="1.5" stdDeviation="2" flood-color="#000000" flood-opacity="0.35"/></filter>`;
            tspans += `</defs>`;

            // Véu pergaminho atrás do texto: garante legibilidade em QUALQUER fundo
            // (mesmo se a IA desobedecer e gerar rostos/pessoas em vez da Bíblia).
            const veilPad = Math.round(bSize * 0.9);
            const veilTop = blockTopY - bSize - veilPad;
            const veilBottom = blockTopY + blockH + veilPad + (refTextOnly ? Math.round(bSize * 1.2) : 0);
            tspans += `<rect x="${bibleLeftX - veilPad}" y="${veilTop}" width="${(bibleRightX - bibleLeftX) + veilPad * 2}" height="${veilBottom - veilTop}" rx="${Math.round(bSize * 0.5)}" fill="#f5ecd7" opacity="0.88"/>`;

            // FRASE PRINCIPAL (CENTRADA nas páginas da Bíblia)
            tspans += `<g filter="url(#bsh)" font-family="'Cinzel', 'Trajan Pro', 'Garamond', 'Times New Roman', serif" font-weight="700" font-size="${bSize}px" fill="${INK}" text-anchor="middle" xml:space="preserve">`;
            bLines.forEach((line, li) => {
                const y = blockTopY + li * bLH;
                tspans += `<text x="${bibleCenterX}" y="${y}">${paintLine(line)}</text>`;
            });
            tspans += `</g>`;

            // Referência bíblica em tamanho menor abaixo da frase (extraída acima)
            if (refTextOnly) {
                const refSize = Math.round(bSize * 0.55);
                const refY = blockTopY + blockH + Math.round(bLH * 0.6);
                tspans += `<g font-family="'Cinzel', 'Trajan Pro', 'Garamond', 'Times New Roman', serif" font-weight="600" font-size="${refSize}px" fill="${GOLD}" text-anchor="middle" opacity="0.95">`;
                tspans += `<text x="${bibleCenterX}" y="${refY}">${escapeXml(refTextOnly)}</text>`;
                tspans += `</g>`;
            }

            // Sutil brilho dourado nas bordas das páginas da Bíblia (efeito de luz)
            const glowY1 = bibleTopY + Math.round(bibleH * 0.15);
            const glowY2 = bibleBottomY - Math.round(bibleH * 0.15);
            tspans += `<g stroke="${GOLD}" stroke-width="1.5" fill="none" opacity="0.35">`;
            tspans += `<line x1="${bibleLeftX}" y1="${glowY1}" x2="${bibleRightX}" y2="${glowY1}"/>`;
            tspans += `<line x1="${bibleLeftX}" y1="${glowY2}" x2="${bibleRightX}" y2="${glowY2}"/>`;
            tspans += `</g>`;

            svgOverlay = `
                <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
                    ${tspans}
                </svg>
            `;
        } else if (cardStyleId === 'educativo_universal') {
            // ─── EDUCATIVO UNIVERSAL 1:1 (dica + produto + LINK NA BIO) ───
            // Coluna de texto à ESQUERDA sobre foto neutralizada; cena do nicho à direita.
            const ed = educativoData && typeof educativoData === 'object' ? educativoData : {};
            const COR = /^#[0-9a-fA-F]{6}$/.test(ed.cor || '') ? ed.cor : '#14532d';
            const AMARELO = '#ffd21f';
            const BRANCO = '#ffffff';
            const TINTA = '#14210f';

            const m = Math.round(width * 0.045);
            const colL = m;
            const colR = Math.round(width * 0.60);
            const colW = colR - colL;

            const shadowEdu = `<filter id="edsh" x="-25%" y="-25%" width="150%" height="150%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000000" flood-opacity="0.85"/></filter>`;
            let tspans = `<defs>${shadowEdu}</defs>`;
            const rect = (x, y, w, h, rx, fill, op = 1) =>
                `<rect x="${Math.round(x)}" y="${Math.round(y)}" width="${Math.round(w)}" height="${Math.round(h)}" rx="${Math.round(rx)}" fill="${fill}" opacity="${op}"/>`;

            const titulo = String(ed.titulo || safePhrase).toUpperCase().slice(0, 60);
            const destaque = String(ed.titulo_destaque || '').toUpperCase();
            const paintTitulo = (line) => {
                if (!destaque) return escapeXml(line);
                const parts = line.split(destaque);
                if (parts.length < 2) return escapeXml(line);
                return parts.map((p, i) =>
                    escapeXml(p) + (i < parts.length - 1 ? `<tspan fill="${AMARELO}">${escapeXml(destaque)}</tspan>` : '')
                ).join('');
            };

            // Tamanhos base (escala pela largura; padrão 1080)
            const sc = width / 1080;
            const F = (v) => Math.max(14, Math.round(v * sc));
            const tSize0 = F(54), subSize0 = F(29), itemSize0 = F(27), chipSize0 = F(30);

            // Monta linhas (duas passagens: se estourar a zona, reduz fontes)
            const layoutEdu = (k) => {
                const ts = Math.round(tSize0 * k), ss = Math.round(subSize0 * k), is = Math.round(itemSize0 * k), cs = Math.round(chipSize0 * k);
                const tLines = wrapText(titulo, 18).slice(0, 3);
                const subLines = wrapText(String(ed.subtitulo || ''), 30).slice(0, 4);
                const blocos = (Array.isArray(ed.blocos) ? ed.blocos : []).slice(0, 2).map(b => ({
                    rotulo: String(b.rotulo || ''),
                    itens: (Array.isArray(b.itens) ? b.itens : []).slice(0, 4).map(it =>
                        wrapText(String(it), 32).slice(0, 2)
                    ).filter(l => l.length > 0)
                })).filter(b => b.rotulo && b.itens.length > 0);
                const dicaLines = ed.dica_extra ? wrapText(String(ed.dica_extra), 34).slice(0, 2) : [];
                const lh = (s, mm) => Math.round(s * mm);
                let h = 0;
                h += tLines.length * lh(ts, 1.18) + 44 * sc;
                h += 12 * sc;
                h += subLines.length * lh(ss, 1.35);
                h += 14 * sc;
                for (const b of blocos) {
                    h += lh(cs, 1.2) + 30 * sc;
                    for (const it of b.itens) h += it.length * lh(is, 1.32) + 10 * sc;
                    h += 10 * sc;
                }
                if (dicaLines.length) h += dicaLines.length * lh(is, 1.32) + 34 * sc;
                return { ts, ss, is, cs, tLines, subLines, blocos, dicaLines, totalH: h,
                    lhT: lh(ts, 1.18), lhS: lh(ss, 1.35), lhI: lh(is, 1.32), lhC: lh(cs, 1.2) };
            };

            let L = layoutEdu(1);
            const zoneH = height * 0.76;
            if (L.totalH > zoneH) L = layoutEdu(zoneH / L.totalH);

            let y = Math.round(height * 0.045);
            const fontStack = `'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;

            // Faixa do título
            const bannerH = L.tLines.length * L.lhT + Math.round(40 * sc);
            tspans += rect(colL - Math.round(10 * sc), y - Math.round(16 * sc), colW + Math.round(84 * sc), bannerH, Math.round(18 * sc), COR, 0.94);
            tspans += `<g filter="url(#edsh)" font-family="${fontStack}" font-weight="900" font-size="${L.ts}px" fill="${BRANCO}">`;
            L.tLines.forEach((line, li) => {
                tspans += `<text x="${colL + Math.round(8 * sc)}" y="${y + L.ts + li * L.lhT}">${paintTitulo(line)}</text>\n`;
            });
            tspans += `</g>`;
            y += bannerH + Math.round(14 * sc);

            // Subtítulo
            if (L.subLines.length) {
                tspans += `<g filter="url(#edsh)" font-family="${fontStack}" font-weight="600" font-size="${L.ss}px" fill="${BRANCO}">`;
                L.subLines.forEach((line, li) => {
                    tspans += `<text x="${colL}" y="${y + L.ss + li * L.lhS}">${escapeXml(line)}</text>\n`;
                });
                tspans += `</g>`;
                y += L.subLines.length * L.lhS + Math.round(14 * sc);
            }

            // Blocos (ingredientes / passo a passo)
            const numberedRe = /como fazer|passo|modo de preparo|preparo/i;
            for (const b of L.blocos) {
                const chipW = Math.min(colW, b.rotulo.length * L.cs * 0.62 + Math.round(56 * sc));
                const chipH = L.lhC + Math.round(18 * sc);
                tspans += rect(colL, y, chipW, chipH, Math.round(chipH / 2), COR, 0.95);
                tspans += `<text x="${colL + Math.round(26 * sc)}" y="${y + Math.round(chipH / 2 + L.cs * 0.35)}" font-family="${fontStack}" font-weight="800" font-style="italic" font-size="${L.cs}px" fill="${BRANCO}">${escapeXml(b.rotulo)}</text>\n`;
                y += chipH + Math.round(12 * sc);
                const numbered = numberedRe.test(b.rotulo);
                b.itens.forEach((itLines, ii) => {
                    if (numbered) {
                        const r = Math.round(L.is * 0.62);
                        const cx = colL + Math.round(8 * sc) + r;
                        const cy = y + Math.round(L.is * 0.4);
                        tspans += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${COR}" stroke="${BRANCO}" stroke-width="2"/>`;
                        tspans += `<text x="${cx}" y="${cy + Math.round(r * 0.55)}" text-anchor="middle" font-family="${fontStack}" font-weight="900" font-size="${Math.round(L.is * 0.85)}px" fill="${BRANCO}">${ii + 1}</text>\n`;
                        const tx = cx + r + Math.round(12 * sc);
                        tspans += `<g filter="url(#edsh)" font-family="${fontStack}" font-weight="600" font-size="${L.is}px" fill="${BRANCO}">`;
                        itLines.forEach((line, li) => {
                            tspans += `<text x="${tx}" y="${y + L.is + li * L.lhI}">${escapeXml(line)}</text>\n`;
                        });
                        tspans += `</g>`;
                    } else {
                        const dx = colL + Math.round(10 * sc);
                        const tx = dx + Math.round(22 * sc);
                        tspans += `<circle cx="${dx + Math.round(6 * sc)}" cy="${y + Math.round(L.is * 0.45)}" r="${Math.max(5, Math.round(L.is * 0.2))}" fill="${AMARELO}"/>`;
                        tspans += `<g filter="url(#edsh)" font-family="${fontStack}" font-weight="600" font-size="${L.is}px" fill="${BRANCO}">`;
                        itLines.forEach((line, li) => {
                            tspans += `<text x="${tx}" y="${y + L.is + li * L.lhI}">${escapeXml(line)}</text>\n`;
                        });
                        tspans += `</g>`;
                    }
                    y += itLines.length * L.lhI + Math.round(10 * sc);
                });
                y += Math.round(8 * sc);
            }

            // Dica extra (faixa amarela)
            if (L.dicaLines.length) {
                const dH = L.dicaLines.length * L.lhI + Math.round(30 * sc);
                tspans += rect(colL - Math.round(6 * sc), y, colW + Math.round(12 * sc), dH, Math.round(14 * sc), AMARELO, 0.96);
                tspans += `<g font-family="${fontStack}" font-weight="800" font-style="italic" font-size="${L.is}px" fill="${TINTA}">`;
                L.dicaLines.forEach((line, li) => {
                    tspans += `<text x="${colL + Math.round(14 * sc)}" y="${y + Math.round(22 * sc) + L.is + li * L.lhI}">${escapeXml(line)}</text>\n`;
                });
                tspans += `</g>`;
                y += dH + Math.round(10 * sc);
            }

            // Selo motivacional (canto superior direito, sobre a foto)
            if (ed.selo) {
                const selLines = wrapText(String(ed.selo), 22).slice(0, 2);
                const selSize = F(26);
                tspans += `<g filter="url(#edsh)" font-family="${fontStack}" font-weight="700" font-style="italic" font-size="${selSize}px" fill="${BRANCO}" text-anchor="end">`;
                selLines.forEach((line, li) => {
                    tspans += `<text x="${width - m}" y="${Math.round(height * 0.05) + selSize + li * Math.round(selSize * 1.3)}">${escapeXml(line)}</text>\n`;
                });
                tspans += `</g>`;
            }

            // Barra de interação (rodapé esquerdo, faixa escura)
            const interLines = wrapText(String(ed.interacao || 'Gostou da dica? Comente ❤️ e compartilhe!'), 40).slice(0, 2);
            const intSize = F(27);
            const intLH = Math.round(intSize * 1.3);
            const intH = interLines.length * intLH + Math.round(30 * sc);
            const intY = height - intH - Math.round(28 * sc);
            const intW = Math.round(width * 0.56);
            tspans += rect(m, intY, intW, intH, Math.round(20 * sc), '#101010', 0.88);
            tspans += `<g font-family="${fontStack}" font-weight="800" font-size="${intSize}px" fill="${AMARELO}">`;
            interLines.forEach((line, li) => {
                tspans += `<text x="${m + Math.round(24 * sc)}" y="${intY + Math.round(24 * sc) + intSize + li * intLH}">${escapeXml(line)}</text>\n`;
            });
            tspans += `</g>`;

            // Cartão do produto (rodapé direito, painel claro + LINK NA BIO)
            const prodX = Math.round(width * 0.62);
            const prodW = width - prodX - m;
            const pNome = wrapText(String(ed.produto_nome || 'LINK NA BIO'), 20).slice(0, 3);
            const pCham = ed.produto_chamada ? wrapText(String(ed.produto_chamada), 24).slice(0, 2) : [];
            const pnSize = F(26), pcSize = F(21);
            const pnLH = Math.round(pnSize * 1.25), pcLH = Math.round(pcSize * 1.3);
            const pillH = Math.round(52 * sc);
            const prodH = pNome.length * pnLH + pCham.length * pcLH + pillH + Math.round(56 * sc);
            const prodY = height - prodH - Math.round(28 * sc);
            tspans += rect(prodX, prodY, prodW, prodH, Math.round(18 * sc), '#ffffff', 0.96);
            let py = prodY + Math.round(26 * sc) + pnSize;
            tspans += `<g font-family="${fontStack}" font-weight="900" font-size="${pnSize}px" fill="${COR}" text-anchor="middle">`;
            pNome.forEach((line, li) => {
                tspans += `<text x="${prodX + prodW / 2}" y="${py + li * pnLH}">${escapeXml(line)}</text>\n`;
            });
            tspans += `</g>`;
            py += pNome.length * pnLH + Math.round(6 * sc);
            if (pCham.length) {
                tspans += `<g font-family="${fontStack}" font-weight="600" font-size="${pcSize}px" fill="#333333" text-anchor="middle">`;
                pCham.forEach((line, li) => {
                    tspans += `<text x="${prodX + prodW / 2}" y="${py + li * pcLH}">${escapeXml(line)}</text>\n`;
                });
                tspans += `</g>`;
                py += pCham.length * pcLH + Math.round(10 * sc);
            }
            const pillW = Math.min(prodW - Math.round(24 * sc), Math.round(300 * sc));
            const pillX = prodX + (prodW - pillW) / 2;
            tspans += rect(pillX, py, pillW, pillH, Math.round(pillH / 2), AMARELO, 1);
            tspans += `<text x="${pillX + pillW / 2}" y="${py + Math.round(pillH / 2 + F(24) * 0.35)}" text-anchor="middle" font-family="${fontStack}" font-weight="900" font-size="${F(24)}px" fill="${TINTA}">LINK NA BIO</text>\n`;

            svgOverlay = `
                <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
                    ${tspans}
                </svg>
            `;
        } else if (cardStyleId === 'twitter_x') {
            // ─── CARD TWITTER/X (perfil da frase + foto full-bleed + vetor) ───
            // Post escuro autentico: moldura arredondada, cabecalho com
            // nome/selo/handle, frase branca a esquerda/centro e rodape
            // com divisor + icones do X (comentario, repost, curtida, marcador, share).
            const pad = Math.round(width * 0.055);
            const textLeft = pad;

            const TW_WHITE = '#ffffff';
            const TW_GRAY = '#71767b';
            const TW_BORDER = '#2f3336';
            const TW_RED = '#e11d2e';
            const TW_BLUE = '#1d9bf0';
            const TW_HEART = '#f91880';

            const twShadow = `<filter id="twsh" x="-25%" y="-25%" width="150%" height="150%"><feDropShadow dx="0" dy="2" stdDeviation="3.5" flood-color="#000000" flood-opacity="0.9"/></filter>`;
            let tspans = `<defs>${twShadow}<linearGradient id="twleft" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#000000" stop-opacity="0.72"/><stop offset="55%" stop-color="#000000" stop-opacity="0.45"/><stop offset="100%" stop-color="#000000" stop-opacity="0"/></linearGradient><linearGradient id="twfade" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#000000" stop-opacity="0.55"/><stop offset="22%" stop-color="#000000" stop-opacity="0"/><stop offset="82%" stop-color="#000000" stop-opacity="0"/><stop offset="100%" stop-color="#000000" stop-opacity="0.6"/></linearGradient></defs>`;
            // Full-bleed: gradientes de legibilidade sobre a foto (esquerda + topo/base)
            tspans += `<rect x="0" y="0" width="${Math.round(width * 0.68)}" height="${height}" fill="url(#twleft)"/>`;
            tspans += `<rect x="0" y="0" width="${width}" height="${height}" fill="url(#twfade)"/>`;

            // ─── MOLDURA do post (cantos arredondados) ───
            const fr = Math.round(width * 0.024);
            tspans += `<rect x="${fr}" y="${fr}" width="${width - fr * 2}" height="${height - fr * 2}" rx="${Math.round(width * 0.028)}" fill="none" stroke="${TW_BORDER}" stroke-width="2.5"/>`;

            // ─── CABECALHO ───
            const avCX = textLeft + Math.round(width * 0.034);
            const avCY = Math.round(height * 0.088);
            const avR = Math.round(width * 0.031);
            tspans += `<circle cx="${avCX}" cy="${avCY}" r="${avR + 3}" fill="none" stroke="${TW_RED}" stroke-width="2" opacity="0.85"/>`;

            const nameX = avCX + avR + Math.round(width * 0.014);
            const nameSize = Math.round(width * 0.030);
            const nameY = avCY - Math.round(nameSize * 0.10);
            const handleSize = Math.round(nameSize * 0.72);
            tspans += `<g font-family="'Segoe UI', Roboto, Helvetica, Arial, sans-serif">`;
            // Nome/handle do PERSONAGEM DA FRASE (via LLM; fallback por palavras-chave).
            // Ex: frase sobre Jesus -> "Jesus Cristo / @jesuscristo".
            const entity = (twitterProfile && twitterProfile.name)
                ? { name: twitterProfile.name, handle: twitterProfile.handle }
                : extractEntityName(safePhrase);
            const handle = entity.handle;
            tspans += `<text x="${nameX}" y="${nameY}" font-size="${nameSize}px" font-weight="800" fill="${TW_WHITE}">${escapeXml(entity.name)}</text>`;

            // Nome da entidade citada na frase (sem selo de verificação:
            // o Prompt Universal proíbe inventar selos/perfis oficiais).

            tspans += `<text x="${nameX}" y="${nameY + Math.round(nameSize * 1.02)}" font-size="${handleSize}px" font-weight="400" fill="${TW_GRAY}">${escapeXml(handle)}</text>`;
            tspans += `</g>`;

            // ─── FRASE (branca, esquerda/centro, tamanho auto) ───
            let pLines = wrapText(safePhrase, 22);
            let pSize = pLines.length > 8 ? 28 : pLines.length > 6 ? 32 : pLines.length > 4 ? 38 : 44;
            if (pLines.length > 10) { pSize = 26; pLines = wrapText(safePhrase, 26); }
            const pLH = Math.round(pSize * 1.38);
            const areaTop = Math.round(height * 0.175);
            const areaBottom = Math.round(height * 0.83);
            const blockH = pLines.length * pLH;
            let pStartY = Math.round(areaTop + Math.max(0, (areaBottom - areaTop - blockH) / 2)) + Math.round(pSize * 0.9);
            pStartY = Math.min(pStartY, areaBottom - blockH + Math.round(pSize * 0.9));
            tspans += `<g filter="url(#twsh)" font-family="'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="700" font-size="${pSize}px" fill="${TW_WHITE}">`;
            pLines.forEach((line, idx) => {
                tspans += `<text x="${textLeft}" y="${pStartY + idx * pLH}">${escapeXml(line)}</text>\n`;
            });
            tspans += `</g>`;

            // ─── RODAPE: divisor + icones ───
            const divY = Math.round(height * 0.878);
            const fx1 = Math.round(width * 0.055);
            const fx2 = width - fx1;
            tspans += `<line x1="${fx1}" y1="${divY}" x2="${fx2}" y2="${divY}" stroke="${TW_BORDER}" stroke-width="1.5"/>`;
            const icY = Math.round(divY + (height - divY) / 2) + 2;
            const slotW = (fx2 - fx1) / 5;
            const s = Math.max(9, Math.round(width * 0.012));
            const ic = (i) => Math.round(fx1 + slotW * (i + 0.5));

            // comentario
            tspans += `<g stroke="${TW_GRAY}" stroke-width="2.4" fill="none"><circle cx="${ic(0)}" cy="${icY - 1}" r="${s}"/><path d="M ${ic(0) - 6} ${icY + 6} L ${ic(0) - 9} ${icY + 13} L ${ic(0) - 1} ${icY + 9} Z" fill="${TW_GRAY}" stroke="none"/></g>`;
            // repostagem
            const r1y = icY - 5, r2y = icY + 5;
            tspans += `<g stroke="${TW_GRAY}" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round">`;
            tspans += `<line x1="${ic(1) - 10}" y1="${r1y}" x2="${ic(1) + 10}" y2="${r1y}"/><path d="M ${ic(1) + 4} ${r1y - 4} L ${ic(1) + 10} ${r1y} L ${ic(1) + 4} ${r1y + 4}"/>`;
            tspans += `<line x1="${ic(1) + 10}" y1="${r2y}" x2="${ic(1) - 10}" y2="${r2y}"/><path d="M ${ic(1) - 4} ${r2y - 4} L ${ic(1) - 10} ${r2y} L ${ic(1) - 4} ${r2y + 4}"/>`;
            tspans += `</g>`;
            // curtida (coracao vermelho)
            const hX = ic(2);
            tspans += `<path d="M ${hX} ${icY + 9} C ${hX - 14} ${icY - 2} ${hX - 9} ${icY - 13} ${hX} ${icY - 5} C ${hX + 9} ${icY - 13} ${hX + 14} ${icY - 2} ${hX} ${icY + 9} Z" fill="${TW_HEART}"/>`;
            // marcador
            const bX = ic(3);
            tspans += `<path d="M ${bX - 7} ${icY - 11} L ${bX + 7} ${icY - 11} L ${bX + 7} ${icY + 11} L ${bX} ${icY + 5} L ${bX - 7} ${icY + 11} Z" stroke="${TW_GRAY}" stroke-width="2.4" fill="none" stroke-linejoin="round"/>`;
            // compartilhar
            const sX = ic(4);
            tspans += `<g stroke="${TW_GRAY}" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="${sX}" y1="${icY + 10}" x2="${sX}" y2="${icY - 6}"/><path d="M ${sX - 5} ${icY - 1} L ${sX} ${icY - 7} L ${sX + 5} ${icY - 1}"/><path d="M ${sX - 9} ${icY + 1} L ${sX - 9} ${icY + 10} L ${sX + 9} ${icY + 10} L ${sX + 9} ${icY + 1}"/></g>`;

            svgOverlay = `
                <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
                    ${tspans}
                </svg>
            `;
        } else if (cardStyleId === 'casal_romantico') {
            // ─── CASAL ROMÂNTICO 4:5 ───
            // Casal a esquerda (60%) + frase manuscrita centralizada a direita (40%),
            // destaque salmao, coracao doodle e handle no rodape da coluna.
            const colL = Math.round(width * 0.60);
            const colR = Math.round(width * 0.955);
            const colW = colR - colL;
            const cx = Math.round(colL + colW / 2);

            const RM_WHITE = '#fff8f2';
            const RM_SALMON = '#ffa08a';

            const rmShadow = `<filter id="rmsh" x="-25%" y="-25%" width="150%" height="150%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000000" flood-opacity="0.9"/></filter>`;
            let tspans = `<defs>${rmShadow}</defs>`;

            // Palavra em destaque = mais longa da frase
            const rmWords = safePhrase.split(/\s+/).filter(Boolean);
            let highlight = '';
            for (const w of rmWords) {
                const clean = w.replace(/[^\p{L}\p{N}]/gu, '');
                if (clean.length >= 4 && clean.length > highlight.replace(/[^\p{L}\p{N}]/gu, '').length) highlight = clean;
            }

            let rLines = wrapText(safePhrase, 18);
            let rSize = rLines.length > 8 ? 26 : rLines.length > 6 ? 30 : rLines.length > 4 ? 36 : 42;
            if (rLines.length > 12) { rSize = 24; rLines = wrapText(safePhrase, 21); }
            const rLH = Math.round(rSize * 1.42);
            const rTop = Math.round(height * 0.12);
            const rBottom = Math.round(height * 0.78);
            const rBlockH = rLines.length * rLH;
            let rStartY = Math.round(rTop + Math.max(0, (rBottom - rTop - rBlockH) / 2)) + Math.round(rSize * 0.9);
            rStartY = Math.min(rStartY, rBottom - rBlockH + Math.round(rSize * 0.9));

            tspans += `<g filter="url(#rmsh)" font-family="'Segoe Script', 'Brush Script MT', 'URW Chancery L', Georgia, cursive" font-size="${rSize}px" fill="${RM_WHITE}" text-anchor="middle">`;
            rLines.forEach((line, idx) => {
                const y = rStartY + idx * rLH;
                let content = escapeXml(line);
                if (highlight) {
                    const escHl = escapeXml(highlight);
                    content = content.replace(escHl, `<tspan fill="${RM_SALMON}">${escHl}</tspan>`);
                }
                tspans += `<text x="${cx}" y="${y}">${content}</text>\n`;
            });
            tspans += `</g>`;

            // ─── CORACAO doodle + linhas laterais ───
            const heartY = rStartY + rLines.length * rLH + Math.round(rSize * 0.9);
            const hs = Math.max(10, Math.round(rSize * 0.42));
            tspans += `<g filter="url(#rmsh)" stroke="${RM_SALMON}" stroke-width="2.4" fill="none" opacity="0.95">`;
            tspans += `<path d="M ${cx} ${heartY + hs} C ${cx - hs * 1.2} ${heartY - hs * 0.2} ${cx - hs * 0.75} ${heartY - hs * 1.1} ${cx} ${heartY - hs * 0.4} C ${cx + hs * 0.75} ${heartY - hs * 1.1} ${cx + hs * 1.2} ${heartY - hs * 0.2} ${cx} ${heartY + hs} Z"/>`;
            const lnLen = Math.round(colW * 0.22);
            tspans += `<line x1="${cx - hs - lnLen}" y1="${heartY}" x2="${cx - hs - 8}" y2="${heartY}" opacity="0.6"/>`;
            tspans += `<line x1="${cx + hs + 8}" y1="${heartY}" x2="${cx + hs + lnLen}" y2="${heartY}" opacity="0.6"/>`;
            tspans += `</g>`;

            // ─── HANDLE (marca d'agua configurada ou @SEU_PERFIL) ───
            const handleTxt = (typeof handle === 'string' && handle.trim()) ? handle.trim() : '@SEU_PERFIL';
            const hSize = Math.max(14, Math.round(width * 0.020));
            tspans += `<text x="${cx}" y="${heartY + hs + Math.round(hSize * 1.9)}" text-anchor="middle" font-family="'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="${hSize}px" font-weight="600" letter-spacing="1" fill="#ffffff" opacity="0.75">${escapeXml(handleTxt)}</text>`;

            svgOverlay = `
                <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
                    ${tspans}
                </svg>
            `;
        } else {
            // carta_3d, caderno, papel_rasgado
            const lines = wrapText(safePhrase, 26);
            const fontSize = lines.length > 4 ? 26 : (lines.length > 3 ? 30 : 34);
            const lineHeight = fontSize * 1.35;
            const totalBlockHeight = lines.length * lineHeight;
            const startY = Math.round((height * 0.46 - totalBlockHeight) / 2) + fontSize + 25;

            let tspans = '';
            lines.forEach((line, idx) => {
                const y = startY + (idx * lineHeight);
                tspans += `<text x="${width / 2 + 1}" y="${y + 1}" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-weight="800" font-size="${fontSize}px" fill="#ffffff" opacity="0.85">${escapeXml(line)}</text>\n`;
                tspans += `<text x="${width / 2}" y="${y}" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-weight="800" font-size="${fontSize}px" fill="#2d3748">${escapeXml(line)}</text>\n`;
            });

            svgOverlay = `
                <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
                    ${tspans}
                </svg>
            `;
        }

        let baseBuffer = inputBuffer;

        if (cardStyleId === 'sabedoria_eres' || cardStyleId === 'educativo_universal') {
            // A IA nem sempre respeita "fundo liso/escuro à esquerda" — ela
            // devolve texturas corridas que estragam a leitura do texto.
            // Aqui a coluna de texto é NEUTRALIZADA na própria imagem:
            // desfoca + dessatura + escurece a faixa esquerda com transição suave,
            // deixando a cena/personagem à direita intacta.
            const panelW = Math.round(width * (cardStyleId === 'educativo_universal' ? 0.60 : 0.56));
            try {
                // Blur ANTES do extract evita costura dura na emenda.
                const cleanedPanel = await sharp(inputBuffer)
                    .blur(Math.max(10, Math.round(width * 0.045)))
                    .extract({ left: 0, top: 0, width: panelW, height })
                    .modulate({ brightness: 0.62, saturation: 0.45 })
                    .toBuffer();

                // Rampa de ALPHA para o painel fundir com a arte original sem
                // emenda vertical. Só os últimos 28% do painel desvanecem,
                // para não borrar a borda do personagem.
                const rampId = `pr${width}`;
                const rampSvg = Buffer.from(
                    `<svg width="${panelW}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
                    `<defs><linearGradient id="${rampId}" x1="0" y1="0" x2="1" y2="0">` +
                    `<stop offset="0%" stop-color="#ffffff" stop-opacity="1"/>` +
                    `<stop offset="72%" stop-color="#ffffff" stop-opacity="1"/>` +
                    `<stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>` +
                    `</linearGradient></defs>` +
                    `<rect width="${panelW}" height="${height}" fill="url(#${rampId})"/>` +
                    `</svg>`
                );

                const fadedPanel = await sharp(cleanedPanel)
                    .ensureAlpha()
                    .composite([{ input: rampSvg, blend: 'dest-in' }])
                    .toBuffer();

                baseBuffer = await sharp(inputBuffer)
                    .composite([{ input: fadedPanel, left: 0, top: 0, blend: 'over' }])
                    .toBuffer();
            } catch (cleanErr) {
                console.warn(`[AI] Falha ao limpar painel de texto do card: ${cleanErr.message}`);
            }
        }

        if (cardStyleId === 'casal_romantico') {
            // Coluna de texto a DIREITA: neutraliza a faixa direita (espelho do bloco acima)
            // para a frase manuscrita branca ter legibilidade total.
            const panelW = Math.round(width * 0.46);
            const panelLeft = width - panelW;
            try {
                const cleanedPanel = await sharp(inputBuffer)
                    .blur(Math.max(10, Math.round(width * 0.045)))
                    .extract({ left: panelLeft, top: 0, width: panelW, height })
                    .modulate({ brightness: 0.55, saturation: 0.5 })
                    .toBuffer();

                const rampId = `rm${width}`;
                const rampSvg = Buffer.from(
                    `<svg width="${panelW}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
                    `<defs><linearGradient id="${rampId}" x1="0" y1="0" x2="1" y2="0">` +
                    `<stop offset="0%" stop-color="#ffffff" stop-opacity="0"/>` +
                    `<stop offset="28%" stop-color="#ffffff" stop-opacity="1"/>` +
                    `<stop offset="100%" stop-color="#ffffff" stop-opacity="1"/>` +
                    `</linearGradient></defs>` +
                    `<rect width="${panelW}" height="${height}" fill="url(#${rampId})"/>` +
                    `</svg>`
                );

                const fadedPanel = await sharp(cleanedPanel)
                    .ensureAlpha()
                    .composite([{ input: rampSvg, blend: 'dest-in' }])
                    .toBuffer();

                baseBuffer = await sharp(inputBuffer)
                    .composite([{ input: fadedPanel, left: panelLeft, top: 0, blend: 'over' }])
                    .toBuffer();
            } catch (cleanErr) {
                console.warn(`[AI] Falha ao limpar painel de texto do card: ${cleanErr.message}`);
            }
        }

        const composited = await sharp(baseBuffer)
            .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
            .png()
            .toBuffer();

        if (isLocalFile && localFilePath) {
            fs.writeFileSync(localFilePath, composited);
            console.log(`[AI] Overlay de frase do card aplicada com sucesso no arquivo existente: ${imageLocalOrUrl}`);
            return imageLocalOrUrl;
        } else {
            return saveBase64Image(composited.toString('base64'));
        }
    } catch (err) {
        // Fundo remoto morto: propaga (não devolve URL quebrada para o post).
        if (String(err.message || '').startsWith('[FUNDOMORTO]')) throw err;
        console.warn(`[AI] Não foi possível aplicar overlay de texto do card:`, err.message);
        return imageLocalOrUrl;
    }
}

async function applyWatermarkOverlay(imageLocalOrUrl, watermarkText) {
    if (!watermarkText || !String(watermarkText).trim()) return imageLocalOrUrl;
    const cleanHandle = String(watermarkText).trim();

    try {
        let inputBuffer = null;
        let isLocalFile = false;
        let localFilePath = null;

        if (imageLocalOrUrl.startsWith('/uploads/')) {
            localFilePath = path.join(process.cwd(), imageLocalOrUrl);
            if (fs.existsSync(localFilePath)) {
                inputBuffer = fs.readFileSync(localFilePath);
                isLocalFile = true;
            }
        } else if (imageLocalOrUrl.startsWith('http')) {
            const resp = await axios.get(imageLocalOrUrl, { responseType: 'arraybuffer', timeout: 30000 });
            inputBuffer = Buffer.from(resp.data);
        }

        if (!inputBuffer) return imageLocalOrUrl;

        const metadata = await sharp(inputBuffer).metadata();
        const width = metadata.width || 1024;
        const height = metadata.height || 1024;

        const fontSize = Math.max(18, Math.round(width * 0.026));
        const yPos = Math.round(height * 0.95);

        const svgWatermark = `
            <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
                <style>
                    .handle-shadow {
                        font-family: Arial, Helvetica, sans-serif;
                        font-size: ${fontSize}px;
                        font-weight: 700;
                        fill: #ffffff;
                        opacity: 0.5;
                    }
                    .handle-text {
                        font-family: Arial, Helvetica, sans-serif;
                        font-size: ${fontSize}px;
                        font-weight: 700;
                        fill: #222222;
                        opacity: 0.75;
                    }
                </style>
                <text x="${Math.round(width / 2) + 1}" y="${yPos + 1}" text-anchor="middle" class="handle-shadow">${cleanHandle}</text>
                <text x="${Math.round(width / 2)}" y="${yPos}" text-anchor="middle" class="handle-text">${cleanHandle}</text>
            </svg>
        `;

        const composited = await sharp(inputBuffer)
            .composite([{ input: Buffer.from(svgWatermark), top: 0, left: 0 }])
            .png()
            .toBuffer();

        if (isLocalFile && localFilePath) {
            fs.writeFileSync(localFilePath, composited);
            console.log(`[AI] Watermark "${cleanHandle}" aplicada com sucesso no arquivo existente: ${imageLocalOrUrl}`);
            return imageLocalOrUrl;
        } else {
            return saveBase64Image(composited.toString('base64'));
        }
    } catch (err) {
        console.warn(`[AI] Não foi possível aplicar watermark "${cleanHandle}":`, err.message);
        return imageLocalOrUrl;
    }
}

function saveBase64Image(b64Data) {
    try {
        const uploadDir = path.resolve(process.cwd(), 'uploads', 'automations');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        const filename = `ai-${Date.now()}-${Math.floor(Math.random() * 100000)}.png`;
        const filePath = path.join(uploadDir, filename);

        // Remove prefixos data:image/...;base64, se houver
        const cleanB64 = b64Data.replace(/^data:image\/[a-zA-Z]+;base64,/, '').trim();
        const buffer = Buffer.from(cleanB64, 'base64');
        fs.writeFileSync(filePath, buffer);
        console.log(`[AI] Imagem base64 salva localmente (${buffer.length} bytes) em: /uploads/automations/${filename}`);
        return `/uploads/automations/${filename}`;
    } catch (err) {
        console.warn('[AI] Erro ao salvar imagem base64 no disco, usando data URI:', err.message);
        return `data:image/png;base64,${b64Data}`;
    }
}

/**
 * Salva um buffer de imagem, redimensionando (cover) para as dimensões alvo.
 * Usado por provedores com dimensões fixas (Cloudflare Workers AI) para garantir
 * o formato correto da rede social (ex: 1080x1350 vertical para Instagram).
 */
async function saveResizedImage(buffer, width, height, prefix = 'ai') {
    const uploadDir = path.resolve(process.cwd(), 'uploads', 'automations');
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }
    const filename = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}.png`;
    const filePath = path.join(uploadDir, filename);

    try {
        const meta = await sharp(buffer).metadata();
        const srcW = meta.width || width;
        const srcH = meta.height || height;

        // Só redimensiona se realmente diferir do alvo
        if (srcW !== width || srcH !== height) {
            const resized = await sharp(buffer)
                .resize(width, height, { fit: 'cover', position: 'centre' })
                .png()
                .toBuffer();
            fs.writeFileSync(filePath, resized);
            console.log(`[AI] Imagem redimensionada ${srcW}x${srcH} → ${width}x${height} em: /uploads/automations/${filename}`);
        } else {
            fs.writeFileSync(filePath, buffer);
            console.log(`[AI] Imagem salva em: /uploads/automations/${filename}`);
        }
        return `/uploads/automations/${filename}`;
    } catch (err) {
        console.warn('[AI] Erro ao redimensionar, salvando original:', err.message);
        try {
            fs.writeFileSync(filePath, buffer);
            return `/uploads/automations/${filename}`;
        } catch (err2) {
            return `data:image/png;base64,${buffer.toString('base64')}`;
        }
    }
}

// Resolução de estilo quando múltiplos estilos forem selecionados para randomização
function resolveRandomVisualIdentity(visualIdentity) {
    if (!visualIdentity || typeof visualIdentity !== 'object') return visualIdentity;
    if (Array.isArray(visualIdentity.selected_styles) && visualIdentity.selected_styles.length > 0) {
        const randomIndex = Math.floor(Math.random() * visualIdentity.selected_styles.length);
        const pickedStyle = visualIdentity.selected_styles[randomIndex];
        console.log(`[AI] Randomizando estilo entre [${visualIdentity.selected_styles.length} selecionados] -> Escolhido: "${pickedStyle.slice(0, 40)}..."`);
        return {
            ...visualIdentity,
            style: pickedStyle
        };
    }
    return visualIdentity;
}

// Cards com layout 100% em vetor (dilemas, twitter_x, educativo_universal):
// o fundo NUNCA pode vir da OpenAI (que renderizaria texto e quebraria o layout).
// Força Cloudflare apenas quando o usuário deixou 'auto' ou escolheu 'openai';
// demais provedores explícitos são respeitados.
function withForcedProvider(resolvedIdentity) {
    const base = (resolvedIdentity && typeof resolvedIdentity === 'object' ? resolvedIdentity : {});
    const current = String(base.imageProvider || 'auto').toLowerCase().trim();
    if (current === 'auto' || current === 'openai') {
        return { ...base, imageProvider: 'cloudflare', __forcedCloudflare: true };
    }
    return base;
}

export async function generateImage(title, visualIdentity, userId, platform = null, postId = null) {
    const resolvedIdentity = resolveRandomVisualIdentity(visualIdentity);
    const cardId = isCardStyle(resolvedIdentity) ? getCardStyle(resolvedIdentity?.style || resolvedIdentity)?.id : null;
    // Escolha explícita do usuário (auto = cadeia completa com fallbacks).
    // IMPORTANTE: considera a configuração GLOBAL (image_provider) e não só a
    // da automação — senão um 'cloudflare' global cai em 'auto' e libera o
    // fallback gratuito (Pollinations) quando o Cloudflare falha.
    const globalCfg = await getAiConfig(userId).catch(() => null);
    const userProvider = (
        (resolvedIdentity && typeof resolvedIdentity === 'object' && resolvedIdentity.imageProvider) ||
        globalCfg?.imageProvider ||
        'auto'
    ).toLowerCase().trim();

    // 🧠 DILEMAS: prompt/dilema gerados por OUTRA IA (Gemini/9Router/OpenAI) e
    // imagem de fundo gerada SÓ pelo Cloud — nunca pela OpenAI (que tentaria
    // renderizar texto e quebra o layout do card).
    // 🐦 TWITTER/X: mesmo esquema — fundo SÓ pelo Cloud (foto full-bleed, sem
    // texto do modelo), perfil do cabeçalho via LLM, textos 100% em vetor.
    let dilemmaData = null;
    let twitterProfile = null;
    let educativoData = null;
    let identityForImage = resolvedIdentity;
    if (cardId === 'dilemas') {
        try {
            const cfg = await getAiConfig(userId);
            dilemmaData = await resolveDilemmaContent(title, cfg);
            console.log('[AI] Dilema resolvido via LLM:', dilemmaData ? `${dilemmaData.question} | A:${dilemmaData.optionA.title} | B:${dilemmaData.optionB.title}` : 'fallback');
        } catch (e) {
            console.warn('[AI] Falha ao resolver dilema via LLM:', e.message);
        }
        identityForImage = withForcedProvider(resolvedIdentity);
    }
    if (cardId === 'twitter_x') {
        try {
            const cfg = await getAiConfig(userId);
            twitterProfile = await resolveTwitterProfile(title, cfg);
            console.log('[AI] Perfil Twitter/X resolvido:', twitterProfile ? `${twitterProfile.name} ${twitterProfile.handle}` : 'fallback');
        } catch (e) {
            console.warn('[AI] Falha ao resolver perfil Twitter/X:', e.message);
        }
        identityForImage = withForcedProvider(resolvedIdentity);
    }
    if (cardId === 'educativo_universal') {
        try {
            const cfg = await getAiConfig(userId);
            educativoData = await resolveEducativoContent(title, cfg);
            console.log('[AI] Conteúdo educativo resolvido via LLM:', educativoData ? `${educativoData.titulo} | ${educativoData.blocos.length} bloco(s)` : 'fallback');
        } catch (e) {
            console.warn('[AI] Falha ao resolver conteúdo educativo via LLM:', e.message);
        }
        identityForImage = withForcedProvider(resolvedIdentity);
    }

    let rawUrl = null;
    const wasForced = !!(identityForImage && identityForImage.__forcedCloudflare);
    const attempt = (identity) => generateRawImage(title, identity, userId, platform, cardId, postId);
    try {
        rawUrl = await attempt(identityForImage);
    } catch (e1) {
        let pendingErr = e1;
        // O provedor forçado (Cloudflare) falhou: tenta os demais provedores
        // configurados, menos OpenAI/9Router (renderizariam texto no fundo).
        if (wasForced && (cardId === 'dilemas' || cardId === 'twitter_x' || cardId === 'educativo_universal')) {
            console.warn(`[AI] Provedor forçado falhou (${e1.message}). Tentando demais provedores (menos OpenAI)...`);
            const retryIdentity = { ...identityForImage };
            delete retryIdentity.__forcedCloudflare;
            retryIdentity.imageProvider = 'auto';
            retryIdentity.skipOpenAI = true;
            try {
                rawUrl = await attempt(retryIdentity);
            } catch (e2) {
                pendingErr = e2;
            }
        }
        // Rede de segurança final (SOMENTE modo Auto): Pollinations é grátis e sem
        // chave — gera o fundo para não travar preview/automação quando os pagos
        // falham. Provedor explícito é estrito: usa SÓ ele e estoura o erro.
        // Desligável via free_fallback=0 (user/system config ou env FREE_FALLBACK).
        if (!rawUrl) {
            const cfgFb = await getAiConfig(userId).catch(() => null);
            const allowNet = (userProvider === 'auto' || wasForced) && (!cfgFb || cfgFb.freeFallback !== false);
            if (!allowNet) throw pendingErr;
            try {
                console.warn(`[AI] Provedores pagos falharam (${pendingErr.message}). Última tentativa via Pollinations (grátis)...`);
                const safeBase = (identityForImage && typeof identityForImage === 'object') ? identityForImage : {};
                rawUrl = await attempt({ ...safeBase, imageProvider: 'pollinations' });
            } catch (e3) {
                throw pendingErr;
            }
        }
    }
    if (!rawUrl) return null;

    let finalUrl = rawUrl;

    // Se for estilo Card com texto e NÃO for gerado via OpenAI (ex: Pollinations, Cloudflare, Huggingface)
    // aplica a frase perfeitamente renderizada como overlay vetorial.
    // Dilemas e Twitter/X SEMPRE recebem overlay (mesmo se provider=openai), pois o layout
    // do card é montado por código, nunca pelo modelo de imagem.
    const isCard = isCardStyle(resolvedIdentity);
    const selectedProvider = (
        (resolvedIdentity && typeof resolvedIdentity === 'object' && resolvedIdentity.imageProvider) ||
        'auto'
    ).toLowerCase().trim();

    const watermarkText = (resolvedIdentity && typeof resolvedIdentity === 'object' && resolvedIdentity.watermark)
        ? resolvedIdentity.watermark
        : '';

    if (isCard && (selectedProvider !== 'openai' || cardId === 'dilemas' || cardId === 'twitter_x' || cardId === 'educativo_universal')) {
        const cardStyle = getCardStyle(resolvedIdentity?.style || resolvedIdentity);
        console.log(`[AI] Aplicando overlay tipográfico nítido para estilo de card "${cardStyle?.id || 'card'}"...`);
        finalUrl = await applyCardTextOverlay(finalUrl, title, cardStyle?.id, watermarkText, dilemmaData, twitterProfile, educativoData);
    }

    // Romântico Ilustrado já estampa o @perfil na linha de atribuição e o
    // Educativo Universal já tem rodapé próprio de produto: não duplica marca d'água.
    if (watermarkText && String(watermarkText).trim() && cardId !== 'romantico_ilustrado' && cardId !== 'educativo_universal') {
        console.log(`[AI] Aplicando overlay de marca d'água: "${watermarkText}"`);
        finalUrl = await applyWatermarkOverlay(finalUrl, watermarkText);
    }

    return finalUrl;
}

/**
 * Resume os erros do Cloudflare em mensagem acionável (PT-BR).
 * Diferencia cota diária esgotada (429/4006) de token inválido (401/10000),
 * para o usuário não confundir com "modelo quebrado".
 */
function summarizeCloudflareErrors(errors) {
    const list = (errors || []).filter(Boolean);
    if (list.length === 0) return null;
    const text = list.join(' || ');
    const hasQuota = /daily free allocation|10,?000 neurons|4006/i.test(text);
    const hasAuth = /Authentication error|unauthorized|invalid.*token|10000/i.test(text) && !/4006/i.test(text);
    const parts = [];
    if (hasQuota) {
        parts.push('COTA DIÁRIA GRATUITA ESGOTADA (10.000 neurons/dia). Gerações voltam sozinhas após a virada do dia (UTC) ou assine o Cloudflare Workers Paid para continuar agora.');
    }
    if (hasAuth || (!hasQuota && /error/i.test(text))) {
        parts.push('TOKEN INVÁLIDO/EXPIRADO (Authentication error). Gere um novo API Token em dash.cloudflare.com → Workers AI e atualize em Configurações → APIs.');
    }
    if (parts.length === 0) return null;
    return `Cloudflare falhou nos modelos tentados. ${parts.join(' ')} Detalhe: ${text.slice(0, 400)}`;
}

async function generateRawImage(title, visualIdentity, userId, platform = null, cardStyleId = null, postId = null) {
    const config = await getAiConfig(userId);
    let lastError = null;
    const targetSize = getPlatformSize(platform, cardStyleId, visualIdentity);
    console.log(`[AI] Tamanho alvo para ${platform || 'padrão'} (card: ${cardStyleId || 'não'}): ${targetSize.width}x${targetSize.height}`);

    // Otimiza e traduz o título para uma descrição de cena hiper-realista em inglês
    const optimizedPrompt = await optimizeVisualPrompt(title, visualIdentity, config);
    console.log('[AI] Optimized Image Prompt:', optimizedPrompt);

    const selectedProvider = (
        (visualIdentity && typeof visualIdentity === 'object' && visualIdentity.imageProvider) ||
        config.imageProvider ||
        'auto'
    ).toLowerCase().trim();
    console.log(`[AI] Provedor de imagem ativo: ${selectedProvider}`);

    // Cards com layout 100% em vetor: o fundo nunca pode vir de um provedor que
    // renderiza texto (OpenAI / 9Router com modelos de imagem). Usado no fallback
    // quando o provedor forçado falha.
    const skipOpenAI = !!(visualIdentity && typeof visualIdentity === 'object' && visualIdentity.skipOpenAI);

    // 1. OpenAI (com failover entre múltiplas chaves)
    const openAiKeyPool = await getKeyPool(userId, 'openai_api_key');
    if ((selectedProvider === 'auto' || selectedProvider === 'openai') && openAiKeyPool.length > 0 && !skipOpenAI) {
        const openAiModels = ['gpt-image-1-mini', 'gpt-image-1', 'chatgpt-image-latest', 'dall-e-3', 'dall-e-2'];
        
        for (const model of openAiModels) {
            try {
                console.log(`[AI] Gerando imagem via OpenAI (${model})... pool de ${openAiKeyPool.length} chave(s)...`);
                const payload = {
                    model,
                    prompt: optimizedPrompt,
                    n: 1,
                    size: targetSize.openaiSize
                };
                if (model === 'dall-e-3') {
                    payload.quality = 'standard';
                }

                // Failover: chave 1, se falhar (401/429/5xx) tenta chave 2, 3...
                const imageResult = await executeWithKeyFailover(openAiKeyPool, async (apiKey) => {
                    const res = await axios.post('https://api.openai.com/v1/images/generations', payload, {
                        headers: {
                            'Authorization': `Bearer ${apiKey}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 60000
                    });

                    const imgData = res.data?.data?.[0];
                    if (imgData) {
                        if (imgData.b64_json) {
                            return await saveResizedImage(Buffer.from(imgData.b64_json, 'base64'), targetSize.width, targetSize.height, `openai-${model.replace(/[^a-z0-9]/gi, '')}`);
                        }
                        if (imgData.url) {
                            try {
                                const dl = await axios.get(imgData.url, { responseType: 'arraybuffer', timeout: 30000 });
                                return await saveResizedImage(Buffer.from(dl.data), targetSize.width, targetSize.height, `openai-${model.replace(/[^a-z0-9]/gi, '')}`);
                            } catch (_) {
                                return imgData.url;
                            }
                        }
                    }
                    throw new Error('OpenAI não retornou imagem válida');
                }, `OpenAI (${model})`);

                console.log(`[AI] Imagem gerada com sucesso via OpenAI (${model})!`);
                // Track cost if postId provided
                if (postId) {
                    await trackImageGenerationCost(postId, {
                        provider: 'openai',
                        model,
                        width: targetSize.width,
                        height: targetSize.height,
                        prompt_tokens: 0, // OpenAI Images API não retorna tokens
                        completion_tokens: 0
                    });
                }
                return imageResult;
            } catch (e) {
                lastError = `OpenAI (${model}): ${e.response?.data?.error?.message || e.message}`;
                console.warn(`[AI] OpenAI (${model}) falhou:`, e.response?.data?.error?.message || e.message);
            }
        }
        if (selectedProvider === 'openai') {
            throw new Error(lastError || 'OpenAI não retornou imagem válida.');
        }
    } else if (selectedProvider === 'openai') {
        throw new Error('OpenAI selecionado, mas chave de API não configurada.');
    }

    // 2. 9Router (Se configurado)
    if ((selectedProvider === 'auto' || selectedProvider === 'openai') && config.ninerouterUrl && !skipOpenAI) {
        const baseUrl = config.ninerouterUrl.replace(/\/+$/, '');
        const headers = { 'Content-Type': 'application/json' };
        if (config.ninerouterApiKey) headers['Authorization'] = `Bearer ${config.ninerouterApiKey}`;

        for (const model of ['gpt-image-1-mini', 'dall-e-3']) {
            try {
                console.log(`[AI] Gerando imagem via 9Router (${model})...`);
                const res = await axios.post(`${baseUrl}/images/generations`, {
                    model,
                    prompt: optimizedPrompt,
                    n: 1,
                    size: targetSize.openaiSize
                }, { headers, timeout: 60000 });

                const imgData = res.data?.data?.[0];
                if (imgData) {
                    if (imgData.b64_json) {
                        return await saveResizedImage(Buffer.from(imgData.b64_json, 'base64'), targetSize.width, targetSize.height, `ninerouter-${model.replace(/[^a-z0-9]/gi, '')}`);
                    }
                    if (imgData.url) {
                        try {
                            const dl = await axios.get(imgData.url, { responseType: 'arraybuffer', timeout: 30000 });
                            return await saveResizedImage(Buffer.from(dl.data), targetSize.width, targetSize.height, `ninerouter-${model.replace(/[^a-z0-9]/gi, '')}`);
                        } catch (_) {
                            return imgData.url;
                        }
                    }
                }
            } catch (e) {
                console.warn(`[AI] 9Router (${model}) falhou:`, e.response?.data?.error?.message || e.message);
            }
        }
    }

    // Track 9Router cost (same pricing as OpenAI)
    if (postId && selectedProvider === 'ninerouter') {
        await trackImageGenerationCost(postId, {
            provider: 'ninerouter',
            model: 'gpt-image-1', // default
            width: targetSize.width,
            height: targetSize.height
        });
    }

    // 2b. Google (Gemini native image generation) — usa a mesma API key do Gemini
    if ((selectedProvider === 'auto' || selectedProvider === 'google') && config.geminiApiKey) {
        const gModel = config.googleImageModel || 'gemini-2.5-flash-image';
        try {
            console.log(`[AI] Gerando imagem via Google (${gModel})...`);
            const localUrl = await generateImageViaGoogle(optimizedPrompt, config, targetSize);
            console.log(`[AI] Imagem gerada com sucesso via Google (${gModel})!`);
            if (postId) {
                await trackImageGenerationCost(postId, {
                    provider: 'google',
                    model: gModel,
                    width: targetSize.width,
                    height: targetSize.height
                });
            }
            return localUrl;
        } catch (e) {
            lastError = e.message;
            console.warn(`[AI] Google (${gModel}) falhou:`, e.message);
            if (selectedProvider === 'google') {
                throw new Error(lastError || 'Google não retornou imagem válida.');
            }
        }
    } else if (selectedProvider === 'google') {
        throw new Error('Google selecionado, mas a chave Gemini (Google) não está configurada.');
    }

    // 3. Hugging Face Inference API (com failover entre múltiplas chaves)
    // (helpers hfEndpoints / HF_IMAGE_CANDIDATES / probeHfModel em escopo de módulo, acima)
    // Extrai a mensagem real de erro do HF (vem como ArrayBuffer JSON: {error})
    const parseHfError = (e, model) => {
        try {
            const d = e?.response?.data;
            if (d) {
                const text = Buffer.isBuffer(d) ? d.toString('utf-8') : (typeof d === 'string' ? d : JSON.stringify(d));
                try {
                    const parsed = JSON.parse(text);
                    const msg = parsed?.error || parsed?.message;
                    if (msg) {
                        const status = e?.response?.status;
                        const detail = typeof msg === 'string' ? msg : JSON.stringify(msg);
                        if (status === 401) return `Token inválido ou sem permissão (401): ${detail}`;
                        if (status === 403) return `Modelo com acesso restrito (403) — aceite a licença em huggingface.co/${model}: ${detail}`;
                        if (status === 404) return `Modelo indisponível no Inference API (404): ${detail}`;
                        return detail.slice(0, 300);
                    }
                    return text.slice(0, 300);
                } catch {
                    if (text && !/^request failed/i.test(text.trim())) return text.slice(0, 300);
                }
            }
        } catch {}
        return e?.response?.data?.error || e.message;
    };
    const hfKeyPool = await getKeyPool(userId, 'huggingface_api_key');
    if ((selectedProvider === 'auto' || selectedProvider === 'huggingface') && hfKeyPool.length > 0) {
        let hfAuthFailed = false;
        for (const model of HF_IMAGE_CANDIDATES) {
            if (hfAuthFailed) break;
            for (const hfUrl of hfEndpoints(model)) {
            try {
                console.log(`[AI] Gerando imagem via Hugging Face (${model})... pool de ${hfKeyPool.length} chave(s)...`);
                
                // Failover entre chaves (com retry automático se o modelo estiver carregando)
                const localUrl = await executeWithKeyFailover(hfKeyPool, async (apiKey) => {
                    const res = await hfPostWithRetry(
                        hfUrl,
                        { inputs: optimizedPrompt, parameters: { width: targetSize.width, height: targetSize.height, num_inference_steps: 30 } },
                        apiKey
                    );
                    if (res.data && res.data.byteLength > 0) {
                        // Redimensiona para o tamanho alvo (HF pode devolver 768x768 fixo)
                        return await saveResizedImage(
                            Buffer.from(res.data),
                            targetSize.width,
                            targetSize.height,
                            `hf-${model.split('/').pop().replace(/[^a-z0-9]/gi, '')}`
                        );
                    }
                    throw new Error('Hugging Face retornou resposta vazia');
                }, `Hugging Face (${model})`);
                
                console.log(`[AI] Imagem gerada com sucesso via Hugging Face (${model})!`);
                if (postId) {
                    await trackImageGenerationCost(postId, {
                        provider: 'huggingface',
                        model,
                        width: targetSize.width,
                        height: targetSize.height,
                        steps: 30
                    });
                }
                return localUrl;
            } catch (e) {
                const msg = parseHfError(e, model);
                lastError = `Hugging Face (${model}): ${msg}`;
                console.warn(`[AI] Hugging Face (${model}) falhou:`, msg);
                // 401 = token inválido: inútil tentar outros modelos com as mesmas chaves
                if (/401|token (inválido|rejeitado)/i.test(msg)) {
                    hfAuthFailed = true;
                    break;
                }
            }
            }
        }
        if (selectedProvider === 'huggingface') {
            throw new Error(lastError || 'Hugging Face não respondeu com imagem.');
        }
    } else if (selectedProvider === 'huggingface') {
        throw new Error('Hugging Face selecionado, mas chave de API não configurada.');
    }

    // 3b. Runware (serverless GPU, com failover entre múltiplas chaves)
    const rwKeyPool = await getKeyPool(userId, 'runware_api_key');
    if ((selectedProvider === 'auto' || selectedProvider === 'runware') && rwKeyPool.length > 0) {
        const rwModel = config.runwareImageModel || 'runware:100@1';
        try {
            console.log(`[AI] Gerando imagem via Runware (${rwModel})... pool de ${rwKeyPool.length} chave(s)...`);
            const localUrl = await executeWithKeyFailover(rwKeyPool, async (apiKey) => {
                return await generateImageViaRunware(optimizedPrompt, config, targetSize, apiKey);
            }, `Runware (${rwModel})`);
            console.log(`[AI] Imagem gerada com sucesso via Runware (${rwModel})!`);
            if (postId) {
                await trackImageGenerationCost(postId, {
                    provider: 'runware',
                    model: rwModel,
                    width: targetSize.width,
                    height: targetSize.height
                });
            }
            return localUrl;
        } catch (e) {
            lastError = e.message;
            console.warn(`[AI] Runware (${rwModel}) falhou:`, e.message);
            if (selectedProvider === 'runware') {
                throw new Error(lastError || 'Runware não retornou imagem válida.');
            }
        }
    } else if (selectedProvider === 'runware') {
        throw new Error('Runware selecionado, mas a API key não está configurada.');
    }

    // 4. Cloudflare Workers AI (com failover entre múltiplas contas/tokens)
    const cfKeyPool = await getKeyPool(userId, 'cloudflare_api_token');
    const cfHasCreds = cfKeyPool.length > 0 && cfKeyPool.some(k => k.accountId || config.cloudflareAccountId);
    if ((selectedProvider === 'auto' || selectedProvider === 'cloudflare') && cfHasCreds) {
        const cfModels = ['@cf/black-forest-labs/flux-1-schnell', '@cf/stabilityai/stable-diffusion-xl-base-1.0'];
        const cfErrors = [];
        for (const model of cfModels) {
            try {
                console.log(`[AI] Gerando imagem via Cloudflare Workers AI (${model})... pool de ${cfKeyPool.length} par(es) conta/token...`);
                const isFlux = model.includes('flux');
                // ⚠️ NÃO enviar width/height: os modelos do Cloudflare Workers AI
                // têm dimensões FIXAS e rejeitam o payload com erro Triton:
                // "Expected an 'InferenceResponse' object ... found type 'list'"
                const cfPayload = { prompt: optimizedPrompt };
                if (isFlux) {
                    // FLUX-1-schnell: 4 steps (padrão) gera rostos derretidos e
                    // artefatos graves. A doc do Cloudflare define steps com
                    // MÁXIMO 8 — acima disso a API rejeita o payload.
                    cfPayload.steps = 8;
                    // Prompt MAX 2048 chars. O prompt do card Sabedoria das Eres
                    // já é curto (~1472), mas o OpenAI-style pode ser longo.
                    // Trunca preventivamente.
                    if (cfPayload.prompt.length > 2000) {
                        cfPayload.prompt = cfPayload.prompt.slice(0, 2000);
                    }
                } else {
                    // SDXL: num_steps MÁXIMO 20 no Cloudflare
                    cfPayload.num_steps = 20;
                }

                // Failover: tenta conta 1, se falhar tenta conta 2, 3...
                const localUrl = await executeWithKeyFailover(cfKeyPool, async (token, pairAccountId) => {
                    const accountId = pairAccountId || config.cloudflareAccountId;
                    if (!accountId) throw new Error('Account ID do Cloudflare não configurado');
                    const res = await axios.post(
                        `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
                        cfPayload,
                        {
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            },
                            responseType: 'arraybuffer',
                            timeout: 120000
                        }
                    );

                    if (!res.data) throw new Error('Resposta vazia do Cloudflare');

                    // Extrai o buffer da imagem (JSON com base64 ou binário direto)
                    let imgBuffer = null;

                    // 1. Primeiro tenta fazer parse se a resposta for um JSON (ex: { result: { image: "base64..." } })
                    try {
                        const jsonText = Buffer.isBuffer(res.data) ? res.data.toString('utf-8') : (typeof res.data === 'string' ? res.data : JSON.stringify(res.data));
                        const parsed = JSON.parse(jsonText);
                        if (parsed.result?.image) {
                            imgBuffer = Buffer.from(String(parsed.result.image).replace(/^data:image\/[a-zA-Z]+;base64,/, ''), 'base64');
                        }
                    } catch {}

                    // 2. Se não for JSON, trata como binário direto PNG/JPEG
                    if (!imgBuffer && Buffer.isBuffer(res.data) && res.data.length > 0) {
                        imgBuffer = res.data;
                    }

                    if (!imgBuffer || imgBuffer.length === 0) {
                        throw new Error('Resposta do Cloudflare sem imagem válida');
                    }

                    // 3. Redimensiona para o tamanho alvo (modelos CF têm dimensões fixas)
                    return await saveResizedImage(imgBuffer, targetSize.width, targetSize.height, `cloudflare-${model.replace(/[^a-z0-9]/gi, '')}`);
                }, `Cloudflare (${model})`);

                console.log(`[AI] Imagem gerada com sucesso via Cloudflare (${model})!`);
                if (postId) {
                    await trackImageGenerationCost(postId, {
                        provider: 'cloudflare',
                        model,
                        width: targetSize.width,
                        height: targetSize.height,
                        steps: isFlux ? 8 : 20
                    });
                }
                return localUrl;
            } catch (e) {
                let errDetail = e.message;
                if (e.response?.data) {
                    try {
                        const raw = Buffer.isBuffer(e.response.data) ? e.response.data.toString('utf-8') : JSON.stringify(e.response.data);
                        const parsed = JSON.parse(raw);
                        errDetail = parsed.errors?.[0]?.message || parsed.messages?.[0]?.message || raw;
                    } catch {
                        errDetail = e.response.data.toString();
                    }
                }
                lastError = `Cloudflare (${model}): ${errDetail}`;
                cfErrors.push(`${model}: ${errDetail}`);
                console.warn(`[AI] Cloudflare (${model}) falhou:`, errDetail);
            }
        }
        if (selectedProvider === 'cloudflare') {
            throw new Error(summarizeCloudflareErrors(cfErrors) || lastError || 'Cloudflare não retornou imagem válida. Verifique permissões do API Token.');
        }
    } else if (selectedProvider === 'cloudflare') {
        throw new Error('Cloudflare selecionado, mas Account ID ou API Token não estão configurados.');
    }

    // 5. Pollinations.ai (Gratuito, sem chave)
    if (selectedProvider === 'auto' || selectedProvider === 'pollinations') {
        try {
            console.log('[AI] Gerando imagem via Pollinations.ai (FLUX)...');
            
            // Pollinations.ai tem limite prático de URL (~2000 chars).
            // Para prompts longos, usa versão resumida segura.
            let promptForPollinations = optimizedPrompt;
            const maxPromptChars = 1200;
            if (promptForPollinations.length > maxPromptChars) {
                promptForPollinations = promptForPollinations.slice(0, maxPromptChars).trim();
                console.log(`[AI] Prompt resumido para Pollinations (${promptForPollinations.length} chars)`);
            }
            
            const seed = Math.floor(Math.random() * 1000000);
            // Permite escolher variante FLUX via config (padrão: flux)
            const fluxVariant = config.pollinationsFluxVariant || 'flux';
            // Cards com composição rígida: desliga o enhance (ele reescreve o prompt
            // e derruba restrições como NO TEXT / sem pessoas).
            const useEnhance = cardStyleId ? 'false' : 'true';
            const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(promptForPollinations)}?model=${fluxVariant}&width=${targetSize.width}&height=${targetSize.height}&nologo=true&enhance=${useEnhance}&seed=${seed}`;
            
            console.log('[AI] Pollinations.ai URL gerada com sucesso!');
            if (postId) {
                await trackImageGenerationCost(postId, {
                    provider: 'pollinations',
                    model: fluxVariant,
                    width: targetSize.width,
                    height: targetSize.height
                });
            }
            return pollinationsUrl;
        } catch (e) {
            console.warn('[AI] Pollinations.ai indisponível:', e.message);
        }
    }

    // 6. Fallback com Flux contextual (Pollinations) apenas em modo auto ou pollinations
    if (selectedProvider === 'auto' || selectedProvider === 'pollinations') {
        try {
            const cleanPrompt = optimizedPrompt.slice(0, 800).trim();
const fluxVariant = config.pollinationsFluxVariant || 'flux';
            let fallbackUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanPrompt)}?model=${fluxVariant}&width=${targetSize.width}&height=${targetSize.height}&nologo=true&seed=${Math.floor(Math.random() * 1000000)}`;
            console.log('[AI] Using Flux contextual image generator');
            if (postId) {
                await trackImageGenerationCost(postId, {
                    provider: 'pollinations',
                    model: fluxVariant,
                    width: targetSize.width,
                    height: targetSize.height
                });
            }
            return fallbackUrl;
        } catch (e) {
            console.error('[AI] Fallback image gen error:', e.message);
        }
    }

    return null;
}
