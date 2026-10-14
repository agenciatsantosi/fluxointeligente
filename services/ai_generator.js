import axios from 'axios';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import * as db from './database.js';
import {
    isCardStyle,
    getCardStyle,
    buildCardPrompt,
    normalizeDetectedEmotion
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
    for (let i = 0; i < keys.length; i++) {
        const entry = keys[i];
        // Aceita tanto strings (retrocompatível) quanto { key, accountId }
        const key = typeof entry === 'string' ? entry : entry.key;
        const accId = typeof entry === 'string' ? null : entry.accountId;
        const keyInfo = `chave ${i + 1}/${keys.length}${accId ? ` (conta ${accId.slice(0, 8)}...)` : ''}`;
        try {
            console.log(`[AI] ${label} usando ${keyInfo} (${String(key).slice(0, 8)}...)`);
            const result = await actionFn(key, accId);
            if (i > 0) console.log(`[AI] ${label} sucesso na ${keyInfo} após fallback.`);
            return result;
        } catch (err) {
            const status = err?.response?.status;
            const errMsg = err?.response?.data?.error?.message
                || err?.response?.data?.message
                || err?.message
                || 'erro desconhecido';

            lastErr = err;

            if (i === keys.length - 1) {
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
 * Retorna as dimensões ideais para a rede social alvo.
 * Facebook: paisagem 1200x630 (feed) — OpenAI: 1792x1024
 * Instagram: retrato 1080x1350 (4:5, melhor engajamento) — OpenAI: 1024x1792
 * Padrão: quadrado 1024x1024
 */
function getPlatformSize(platform, cardStyleId) {
    const p = (platform || '').toLowerCase().trim();
    // Estilos de card com composição de destaque à esquerda usam quadrado 1:1
    // (Sabedoria das Eres: entidade à esquerda + texto à direita)
    if (cardStyleId === 'sabedoria_eres') {
        return { width: 1080, height: 1080, openaiSize: '1024x1024' };
    }
    // Card romântico vertical: sempre 4:5 (casal à esquerda + frase à direita),
    // independente da rede de destino
    if (cardStyleId === 'casal_romantico') {
        return { width: 1080, height: 1350, openaiSize: '1024x1792' };
    }
    // Card Dilemas (Prompt Mestre Universal): vertical 4:5 1080x1350 full-bleed
    // (frase no topo + cena central + pergunta + 2 escolhas lado a lado + CTA)
    if (cardStyleId === 'dilemas') {
        return { width: 1080, height: 1350, openaiSize: '1024x1792' };
    }
    if (p === 'facebook') return { width: 1200, height: 630, openaiSize: '1792x1024' };
    if (p === 'instagram') return { width: 1080, height: 1350, openaiSize: '1024x1792' };
    return { width: 1024, height: 1024, openaiSize: '1024x1024' };
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

    return {
        ninerouterUrl: ninerouterUrl.trim(),
        ninerouterApiKey: ninerouterApiKey.trim(),
        geminiApiKey: geminiApiKey.trim(),
        openaiApiKey: openaiApiKey.trim(),
        huggingfaceApiKey: huggingfaceApiKey.trim(),
        cloudflareAccountId: cloudflareAccountId.trim(),
        cloudflareApiToken: cloudflareApiToken.trim(),
        imageProvider: imageProvider.trim()
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

    // Test Hugging Face specifically
    if (provider === 'huggingface') {
        if (!config.huggingfaceApiKey) {
            return { success: false, provider: 'Hugging Face', error: 'Chave do Hugging Face não preenchida.' };
        }
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
                return { success: true, message: 'Hugging Face Inference API respondendo com sucesso!', provider: 'Hugging Face' };
            }
            return { success: false, provider: 'Hugging Face', error: 'Resposta vazia da API' };
        } catch (error) {
            let errorMsg = error.message;
            if (error.code === 'ENOTFOUND' || error.message.includes('ENOTFOUND')) {
                errorMsg = 'DNS não resolve api-inference.huggingface.co — verifique DNS/rede do servidor (ex: `cat /etc/resolv.conf`, teste `curl -I https://api-inference.huggingface.co`)';
            } else if (error.code === 'ECONNREFUSED') {
                errorMsg = 'Conexão recusada — firewall/bloqueio de rede no servidor';
            } else if (error.code === 'ETIMEDOUT') {
                errorMsg = 'Timeout — rede lenta ou bloqueio de saída';
            } else if (error.response?.data?.error) {
                errorMsg = error.response.data.error;
            }
            return { success: false, provider: 'Hugging Face', error: `Falha ao conectar com Hugging Face: ${errorMsg}` };
        }
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

    // 1. Tenta Gemini
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

    // 2. Tenta 9Router
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

    // 3. Tenta OpenAI
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

    // 1. Tenta Gemini
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

    // 2. Tenta 9Router
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

    // 3. Tenta OpenAI
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

    // 1. Gemini
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

    // 2. 9Router
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

    // 3. OpenAI
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

export async function applyCardTextOverlay(imageLocalOrUrl, phrase, cardStyleId, handle = '', dilemmaData = null) {
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
            const resp = await axios.get(imageLocalOrUrl, { responseType: 'arraybuffer', timeout: 30000 });
            inputBuffer = Buffer.from(resp.data);
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
        } else if (cardStyleId === 'twitter_x') {
            // ─── CARD TWITTER/X — EXU TIRIRI ───
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
            let tspans = `<defs>${twShadow}</defs>`;

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
            tspans += `<text x="${nameX}" y="${nameY}" font-size="${nameSize}px" font-weight="800" fill="${TW_WHITE}">${escapeXml('Exu Tiriri')}</text>`;

            // Tridente vermelho apos o nome (nome fixo -> posicao estimada)
            const triC = nameX + Math.round(nameSize * 6.4);
            const triTop = nameY - nameSize + 3;
            const triBot = nameY + 1;
            const triMid = triTop + Math.round((triBot - triTop) * 0.45);
            tspans += `<g stroke="${TW_RED}" stroke-width="2.2" stroke-linecap="round" fill="none">`;
            tspans += `<line x1="${triC}" y1="${triTop + 9}" x2="${triC}" y2="${triBot}"/>`;
            tspans += `<line x1="${triC - 9}" y1="${triMid}" x2="${triC + 9}" y2="${triMid}"/>`;
            tspans += `<line x1="${triC - 9}" y1="${triMid}" x2="${triC - 9}" y2="${triTop + 3}"/>`;
            tspans += `<line x1="${triC}" y1="${triMid - 2}" x2="${triC}" y2="${triTop}"/>`;
            tspans += `<line x1="${triC + 9}" y1="${triMid}" x2="${triC + 9}" y2="${triTop + 3}"/>`;
            tspans += `<line x1="${triC - 4}" y1="${triBot}" x2="${triC + 4}" y2="${triBot}"/>`;
            tspans += `</g>`;

            // Selo azul de verificacao
            const sealC = triC + Math.round(nameSize * 1.25);
            const sealY = nameY - Math.round(nameSize * 0.32);
            tspans += `<circle cx="${sealC}" cy="${sealY}" r="${Math.round(nameSize * 0.36)}" fill="${TW_BLUE}"/>`;
            tspans += `<path d="M ${sealC - 4.5} ${sealY + 0.5} L ${sealC - 1} ${sealY + 4} L ${sealC + 5} ${sealY - 4.5}" stroke="#ffffff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;

            tspans += `<text x="${nameX}" y="${nameY + Math.round(nameSize * 1.02)}" font-size="${handleSize}px" font-weight="400" fill="${TW_GRAY}">${escapeXml('@exutiriri')}</text>`;
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

        if (cardStyleId === 'sabedoria_eres' || cardStyleId === 'twitter_x') {
            // A IA nem sempre respeita "fundo liso/escuro à esquerda" — ela
            // devolve texturas corridas que estragam a leitura do texto.
            // Aqui a coluna de texto é NEUTRALIZADA na própria imagem:
            // desfoca + dessatura + escurece a faixa esquerda com transição suave,
            // deixando a cena/personagem à direita intacta.
            const panelW = Math.round(width * 0.56);
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

export async function generateImage(title, visualIdentity, userId, platform = null) {
    const resolvedIdentity = resolveRandomVisualIdentity(visualIdentity);
    const cardId = isCardStyle(resolvedIdentity) ? getCardStyle(resolvedIdentity?.style || resolvedIdentity)?.id : null;

    // 🧠 DILEMAS: prompt/dilema gerados por OUTRA IA (Gemini/9Router/OpenAI) e
    // imagem de fundo gerada SÓ pelo Cloud — nunca pela OpenAI (que tentaria
    // renderizar texto e quebra o layout do card).
    let dilemmaData = null;
    let identityForImage = resolvedIdentity;
    if (cardId === 'dilemas') {
        try {
            const cfg = await getAiConfig(userId);
            dilemmaData = await resolveDilemmaContent(title, cfg);
            console.log('[AI] Dilema resolvido via LLM:', dilemmaData ? `${dilemmaData.question} | A:${dilemmaData.optionA.title} | B:${dilemmaData.optionB.title}` : 'fallback');
        } catch (e) {
            console.warn('[AI] Falha ao resolver dilema via LLM:', e.message);
        }
        identityForImage = {
            ...(resolvedIdentity && typeof resolvedIdentity === 'object' ? resolvedIdentity : {}),
            imageProvider: 'cloudflare'
        };
    }

    const rawUrl = await generateRawImage(title, identityForImage, userId, platform, cardId);
    if (!rawUrl) return null;

    let finalUrl = rawUrl;

    // Se for estilo Card com texto e NÃO for gerado via OpenAI (ex: Pollinations, Cloudflare, Huggingface)
    // aplica a frase perfeitamente renderizada como overlay vetorial.
    // Dilemas SEMPRE recebem overlay (mesmo se provider=openai), pois o layout
    // do card viral é montado por código, nunca pelo modelo de imagem.
    const isCard = isCardStyle(resolvedIdentity);
    const selectedProvider = (
        (resolvedIdentity && typeof resolvedIdentity === 'object' && resolvedIdentity.imageProvider) ||
        'auto'
    ).toLowerCase().trim();

    const watermarkText = (resolvedIdentity && typeof resolvedIdentity === 'object' && resolvedIdentity.watermark)
        ? resolvedIdentity.watermark
        : '';

    if (isCard && (selectedProvider !== 'openai' || cardId === 'dilemas')) {
        const cardStyle = getCardStyle(resolvedIdentity?.style || resolvedIdentity);
        console.log(`[AI] Aplicando overlay tipográfico nítido para estilo de card "${cardStyle?.id || 'card'}"...`);
        finalUrl = await applyCardTextOverlay(finalUrl, title, cardStyle?.id, watermarkText, dilemmaData);
    }

    if (watermarkText && String(watermarkText).trim()) {
        console.log(`[AI] Aplicando overlay de marca d'água: "${watermarkText}"`);
        finalUrl = await applyWatermarkOverlay(finalUrl, watermarkText);
    }

    return finalUrl;
}

async function generateRawImage(title, visualIdentity, userId, platform = null, cardStyleId = null) {
    const config = await getAiConfig(userId);
    let lastError = null;
    const targetSize = getPlatformSize(platform, cardStyleId);
    console.log(`[AI] Tamanho alvo para ${platform || 'padrão'}: ${targetSize.width}x${targetSize.height}`);

    // Otimiza e traduz o título para uma descrição de cena hiper-realista em inglês
    const optimizedPrompt = await optimizeVisualPrompt(title, visualIdentity, config);
    console.log('[AI] Optimized Image Prompt:', optimizedPrompt);

    const selectedProvider = (
        (visualIdentity && typeof visualIdentity === 'object' && visualIdentity.imageProvider) ||
        config.imageProvider ||
        'auto'
    ).toLowerCase().trim();
    console.log(`[AI] Provedor de imagem ativo: ${selectedProvider}`);

    // 1. OpenAI (com failover entre múltiplas chaves)
    const openAiKeyPool = await getKeyPool(userId, 'openai_api_key');
    if ((selectedProvider === 'auto' || selectedProvider === 'openai') && openAiKeyPool.length > 0) {
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
                        if (imgData.b64_json) return saveBase64Image(imgData.b64_json);
                        if (imgData.url) return imgData.url;
                    }
                    throw new Error('OpenAI não retornou imagem válida');
                }, `OpenAI (${model})`);

                console.log(`[AI] Imagem gerada com sucesso via OpenAI (${model})!`);
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
    if ((selectedProvider === 'auto' || selectedProvider === 'openai') && config.ninerouterUrl) {
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
                    if (imgData.b64_json) return saveBase64Image(imgData.b64_json);
                    if (imgData.url) return imgData.url;
                }
            } catch (e) {
                console.warn(`[AI] 9Router (${model}) falhou:`, e.response?.data?.error?.message || e.message);
            }
        }
    }

    // 3. Hugging Face Inference API (com failover entre múltiplas chaves)
    const hfKeyPool = await getKeyPool(userId, 'huggingface_api_key');
    if ((selectedProvider === 'auto' || selectedProvider === 'huggingface') && hfKeyPool.length > 0) {
        const hfModels = ['black-forest-labs/FLUX.1-dev', 'stabilityai/stable-diffusion-xl-base-1.0', 'stabilityai/stable-diffusion-3-medium'];
        for (const model of hfModels) {
            try {
                console.log(`[AI] Gerando imagem via Hugging Face (${model})... pool de ${hfKeyPool.length} chave(s)...`);
                
                // Failover entre chaves
                const localUrl = await executeWithKeyFailover(hfKeyPool, async (apiKey) => {
                    const res = await axios.post(
                        `https://api-inference.huggingface.co/models/${model}`,
                        { inputs: optimizedPrompt, parameters: { width: targetSize.width, height: targetSize.height, num_inference_steps: 30 } },
                        {
                            headers: {
                                'Authorization': `Bearer ${apiKey}`,
                                'Content-Type': 'application/json'
                            },
                            responseType: 'arraybuffer',
                            timeout: 120000
                        }
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
                return localUrl;
            } catch (e) {
                lastError = `Hugging Face (${model}): ${e.response?.data?.error || e.message}`;
                console.warn(`[AI] Hugging Face (${model}) falhou:`, e.response?.data?.error || e.message);
            }
        }
        if (selectedProvider === 'huggingface') {
            throw new Error(lastError || 'Hugging Face não respondeu com imagem.');
        }
    } else if (selectedProvider === 'huggingface') {
        throw new Error('Hugging Face selecionado, mas chave de API não configurada.');
    }

    // 4. Cloudflare Workers AI (com failover entre múltiplas contas/tokens)
    const cfKeyPool = await getKeyPool(userId, 'cloudflare_api_token');
    const cfHasCreds = cfKeyPool.length > 0 && cfKeyPool.some(k => k.accountId || config.cloudflareAccountId);
    if ((selectedProvider === 'auto' || selectedProvider === 'cloudflare') && cfHasCreds) {
        const cfModels = ['@cf/black-forest-labs/flux-1-schnell', '@cf/stabilityai/stable-diffusion-xl-base-1.0'];
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
                console.warn(`[AI] Cloudflare (${model}) falhou:`, errDetail);
            }
        }
        if (selectedProvider === 'cloudflare') {
            throw new Error(lastError || 'Cloudflare não retornou imagem válida. Verifique permissões do API Token.');
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
            const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(promptForPollinations)}?model=flux&width=${targetSize.width}&height=${targetSize.height}&nologo=true&enhance=true&seed=${seed}`;
            
            console.log('[AI] Pollinations.ai URL gerada com sucesso!');
            return pollinationsUrl;
        } catch (e) {
            console.warn('[AI] Pollinations.ai indisponível:', e.message);
        }
    }

    // 6. Fallback com Flux contextual (Pollinations) apenas em modo auto ou pollinations
    if (selectedProvider === 'auto' || selectedProvider === 'pollinations') {
        try {
            const cleanPrompt = optimizedPrompt.slice(0, 800).trim();
let fallbackUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanPrompt)}?model=flux&width=${targetSize.width}&height=${targetSize.height}&nologo=true&seed=${Math.floor(Math.random() * 1000000)}`;
            console.log('[AI] Using Flux contextual image generator');
            return fallbackUrl;
        } catch (e) {
            console.error('[AI] Fallback image gen error:', e.message);
        }
    }

    return null;
}
