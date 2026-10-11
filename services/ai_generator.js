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
    const models = ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-flash-latest', 'gemini-2.5-flash'];
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

    // Test Cloudflare specifically
    if (provider === 'cloudflare') {
        if (!config.cloudflareAccountId || !config.cloudflareApiToken) {
            return { success: false, provider: 'Cloudflare Workers AI', error: 'Account ID ou API Token do Cloudflare não preenchidos.' };
        }
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
                return { success: true, message: 'Cloudflare Workers AI respondendo com sucesso!', provider: 'Cloudflare Workers AI' };
            }
            return { success: false, provider: 'Cloudflare Workers AI', error: 'Resposta inválida da API' };
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

                return buildCardPrompt(title, style.value, { emotion: emotionId, watermark });
            } catch (e) {
                console.warn(`[AI] Card "${style.id}": falha ao detectar emoção, usando "fofo":`, e.message);
                return buildCardPrompt(title, style.value, { emotion: 'fofo', watermark });
            }
        }

        // Emoção escolhida manualmente (ou estilo sem emoção): sem LLM
        console.log(`[AI] Card "${style.id}": prompt direto${style.hasEmotion ? ` com emoção "${emotion}"` : ''}`);
        return buildCardPrompt(title, style.value, { emotion, watermark });
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

async function applyCardTextOverlay(imageLocalOrUrl, phrase, cardStyleId) {
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
            const lines = wrapText(safePhrase.toUpperCase(), 18);
            const fontSize = lines.length > 3 ? 38 : 44;
            const lineHeight = fontSize * 1.35;
            const totalBlockHeight = lines.length * lineHeight;
            const startY = Math.round((height * 0.44 - totalBlockHeight) / 2) + fontSize + 20;

            let tspans = '';
            lines.forEach((line, idx) => {
                const isLast = idx === lines.length - 1;
                const color = isLast ? '#ff4f79' : '#1e1e24';
                const y = startY + (idx * lineHeight);
                tspans += `<text x="${width / 2 + 2}" y="${y + 2}" text-anchor="middle" font-family="'Nunito', 'Segoe UI', Arial, sans-serif" font-weight="900" font-size="${fontSize}px" fill="#ffffff" opacity="0.95">${escapeXml(line)}</text>\n`;
                tspans += `<text x="${width / 2}" y="${y}" text-anchor="middle" font-family="'Nunito', 'Segoe UI', Arial, sans-serif" font-weight="900" font-size="${fontSize}px" fill="${color}">${escapeXml(line)}</text>\n`;
            });

            svgOverlay = `
                <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
                    ${tspans}
                </svg>
            `;
        } else if (cardStyleId === 'minimalista') {
            const lines = wrapText(safePhrase, 24);
            const fontSize = lines.length > 3 ? 36 : 42;
            const lineHeight = fontSize * 1.45;
            const totalBlockHeight = lines.length * lineHeight;
            const startY = Math.round((height - totalBlockHeight) / 2) + fontSize - 20;

            let tspans = '';
            tspans += `<text x="${width / 2}" y="${startY - fontSize}" text-anchor="middle" font-family="'Georgia', 'Times New Roman', serif" font-style="italic" font-size="64px" fill="#1b2a4a" opacity="0.75">“</text>\n`;

            lines.forEach((line, idx) => {
                const y = startY + (idx * lineHeight);
                tspans += `<text x="${width / 2}" y="${y}" text-anchor="middle" font-family="'Georgia', 'Times New Roman', serif" font-style="italic" font-size="${fontSize}px" fill="#1b2a4a">${escapeXml(line)}</text>\n`;
            });

            svgOverlay = `
                <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
                    ${tspans}
                </svg>
            `;
        } else {
            // carta_3d, caderno, papel_rasgado
            const lines = wrapText(safePhrase, 22);
            const fontSize = lines.length > 3 ? 34 : 40;
            const lineHeight = fontSize * 1.35;
            const totalBlockHeight = lines.length * lineHeight;
            const startY = Math.round((height * 0.48 - totalBlockHeight) / 2) + fontSize + 30;

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

        const composited = await sharp(inputBuffer)
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

export async function generateImage(title, visualIdentity, userId) {
    const rawUrl = await generateRawImage(title, visualIdentity, userId);
    if (!rawUrl) return null;

    let finalUrl = rawUrl;

    // Se for estilo Card com texto e NÃO for gerado via OpenAI (ex: Pollinations, Cloudflare, Huggingface)
    // aplica a frase perfeitamente renderizada como overlay vetorial
    const isCard = isCardStyle(visualIdentity);
    const selectedProvider = (
        (visualIdentity && typeof visualIdentity === 'object' && visualIdentity.imageProvider) ||
        'auto'
    ).toLowerCase().trim();

    if (isCard && selectedProvider !== 'openai') {
        const cardStyle = getCardStyle(visualIdentity?.style || visualIdentity);
        console.log(`[AI] Aplicando overlay tipográfico nítido para estilo de card "${cardStyle?.id || 'card'}"...`);
        finalUrl = await applyCardTextOverlay(finalUrl, title, cardStyle?.id);
    }

    const watermarkText = (visualIdentity && typeof visualIdentity === 'object' && visualIdentity.watermark)
        ? visualIdentity.watermark
        : '';

    if (watermarkText && String(watermarkText).trim()) {
        console.log(`[AI] Aplicando overlay de marca d'água: "${watermarkText}"`);
        finalUrl = await applyWatermarkOverlay(finalUrl, watermarkText);
    }

    return finalUrl;
}

async function generateRawImage(title, visualIdentity, userId) {
    const config = await getAiConfig(userId);
    let lastError = null;

    // Otimiza e traduz o título para uma descrição de cena hiper-realista em inglês
    const optimizedPrompt = await optimizeVisualPrompt(title, visualIdentity, config);
    console.log('[AI] Optimized Image Prompt:', optimizedPrompt);

    const selectedProvider = (
        (visualIdentity && typeof visualIdentity === 'object' && visualIdentity.imageProvider) ||
        config.imageProvider ||
        'auto'
    ).toLowerCase().trim();
    console.log(`[AI] Provedor de imagem ativo: ${selectedProvider}`);

    // 1. OpenAI (Modelos mais recentes: gpt-image-1-mini, gpt-image-1, chatgpt-image-latest, dall-e-3, dall-e-2)
    if ((selectedProvider === 'auto' || selectedProvider === 'openai') && config.openaiApiKey) {
        const openAiModels = ['gpt-image-1-mini', 'gpt-image-1', 'chatgpt-image-latest', 'dall-e-3', 'dall-e-2'];
        
        for (const model of openAiModels) {
            try {
                console.log(`[AI] Gerando imagem via OpenAI (${model})...`);
                const payload = {
                    model,
                    prompt: optimizedPrompt,
                    n: 1,
                    size: '1024x1024'
                };
                if (model === 'dall-e-3') {
                    payload.quality = 'standard';
                }

                const res = await axios.post('https://api.openai.com/v1/images/generations', payload, {
                    headers: {
                        'Authorization': `Bearer ${config.openaiApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 60000
                });

                const imgData = res.data?.data?.[0];
                if (imgData) {
                    if (imgData.b64_json) {
                        const localUrl = saveBase64Image(imgData.b64_json);
                        console.log(`[AI] Imagem gerada com sucesso via OpenAI (${model}) em base64!`);
                        return localUrl;
                    }
                    if (imgData.url) {
                        console.log(`[AI] Imagem gerada com sucesso via OpenAI (${model}) com URL!`);
                        return imgData.url;
                    }
                }
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
                    size: '1024x1024'
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

    // 3. Hugging Face Inference API
    if ((selectedProvider === 'auto' || selectedProvider === 'huggingface') && config.huggingfaceApiKey) {
        const hfModels = ['black-forest-labs/FLUX.1-dev', 'stabilityai/stable-diffusion-xl-base-1.0', 'stabilityai/stable-diffusion-3-medium'];
        for (const model of hfModels) {
            try {
                console.log(`[AI] Gerando imagem via Hugging Face (${model})....`);
                const res = await axios.post(
                    `https://api-inference.huggingface.co/models/${model}`,
                    { inputs: optimizedPrompt, parameters: { width: 1024, height: 1024, num_inference_steps: 30 } },
                    {
                        headers: {
                            'Authorization': `Bearer ${config.huggingfaceApiKey}`,
                            'Content-Type': 'application/json'
                        },
                        responseType: 'arraybuffer',
                        timeout: 120000
                    }
                );
                if (res.data && res.data.byteLength > 0) {
                    const base64 = Buffer.from(res.data, 'binary').toString('base64');
                    const localUrl = saveBase64Image(base64);
                    console.log(`[AI] Imagem gerada com sucesso via Hugging Face (${model})!`);
                    return localUrl;
                }
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

    // 4. Cloudflare Workers AI
    if ((selectedProvider === 'auto' || selectedProvider === 'cloudflare') && config.cloudflareAccountId && config.cloudflareApiToken) {
        const cfModels = ['@cf/black-forest-labs/flux-1-schnell', '@cf/stabilityai/stable-diffusion-xl-base-1.0'];
        for (const model of cfModels) {
            try {
                console.log(`[AI] Gerando imagem via Cloudflare Workers AI (${model})...`);
                const isFlux = model.includes('flux');
                const cfPayload = { prompt: optimizedPrompt };
                if (isFlux) {
                    cfPayload.steps = 4;
                } else {
                    cfPayload.num_steps = 20;
                }

                const res = await axios.post(
                    `https://api.cloudflare.com/client/v4/accounts/${config.cloudflareAccountId}/ai/run/${model}`,
                    cfPayload,
                    {
                        headers: {
                            'Authorization': `Bearer ${config.cloudflareApiToken}`,
                            'Content-Type': 'application/json'
                        },
                        responseType: 'arraybuffer',
                        timeout: 120000
                    }
                );

                if (res.data) {
                    // 1. Primeiro tenta fazer parse se a resposta for um JSON (ex: { result: { image: "base64..." } })
                    try {
                        const jsonText = Buffer.isBuffer(res.data) ? res.data.toString('utf-8') : (typeof res.data === 'string' ? res.data : JSON.stringify(res.data));
                        const parsed = JSON.parse(jsonText);
                        if (parsed.result?.image) {
                            const localUrl = saveBase64Image(parsed.result.image);
                            console.log(`[AI] Imagem extraída de JSON gerada com sucesso via Cloudflare (${model})!`);
                            return localUrl;
                        }
                    } catch {}

                    // 2. Se não for JSON, trata como binário direto PNG/JPEG
                    if (Buffer.isBuffer(res.data) && res.data.length > 0) {
                        const localUrl = saveBase64Image(res.data.toString('base64'));
                        console.log(`[AI] Imagem binária pura gerada com sucesso via Cloudflare (${model})!`);
                        return localUrl;
                    }
                }
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
            const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(promptForPollinations)}?model=flux&width=1024&height=1024&nologo=true&enhance=true&seed=${seed}`;
            
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
            const fallbackUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanPrompt)}?model=flux&width=1024&height=1024&nologo=true&seed=${Math.floor(Math.random() * 1000000)}`;
            console.log('[AI] Using Flux contextual image generator');
            return fallbackUrl;
        } catch (e) {
            console.error('[AI] Fallback image gen error:', e.message);
        }
    }

    return null;
}
