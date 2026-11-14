import axios from 'axios';
import { getAiConfig, callGroqGenerate } from './ai_generator.js';
import { query } from './database.js';

/**
 * Baixa uma imagem como buffer e retorna base64 + mimeType
 */
async function fetchImageAsBase64(imageUrl) {
    if (!imageUrl || typeof imageUrl !== 'string') return null;

    // Se vier como URL de proxy interno, desempacota para o link original direto
    if (imageUrl.includes('/api/trends/images/proxy?url=')) {
        try {
            const splitted = imageUrl.split('proxy?url=')[1];
            if (splitted) imageUrl = decodeURIComponent(splitted);
        } catch (_) {}
    }

    // Se já for data URL
    if (imageUrl.startsWith('data:image/')) {
        const match = imageUrl.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
        if (match) return { mimeType: match[1], base64: match[2] };
    }

    try {
        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 20000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
            }
        });

        const mimeType = response.headers['content-type'] || 'image/jpeg';
        const base64 = Buffer.from(response.data).toString('base64');
        return { mimeType: mimeType.split(';')[0], base64 };
    } catch (e) {
        console.warn('[VisionService] Falha ao baixar imagem para visão computacional:', e.message);
        return null;
    }
}

const VISION_SYSTEM_PROMPT = `Você é o "Vision Analysis & Essence Preservation Service" do FluxoInteligente, um diretor de arte sênior especialista em tendências visuais, semiótica, arquétipos e criação de conteúdo viral de alta conversão.

Sua missão suprema é PRESERVAR A ESSÊNCIA VISUAL que fez a imagem viralizar. 
A nova arte gerada DEVE SER UMA VARIAÇÃO DIRETA E RECONHECÍVEL DA MESMA ESSÊNCIA — com o MESMO estilo artístico, o MESMO arquétipo/personagem central e os MESMOS elementos simbólicos marcantes, porém sendo uma composição nova e original (sem cópia pixel a pixel).

REGRAS DE PRESERVAÇÃO DA ESSÊNCIA (MANDATÓRIAS):
1. ESTILO ARTÍSTICO IDÊNTICO (NUNCA ALTERAR A MÍDIA):
   - Se a referência for ILUSTRAÇÃO, DESENHO, GRAVURA VINTAGE ou AQUARELA: a nova arte DEVE SER OBRIGATORIAMENTE ILUSTRAÇÃO / AQUARELA / GRAVURA. NUNCA transforme ilustração em fotografia realista de pessoas!
   - Se a referência for FOTOGRAFIA REALISTA: a nova arte deve ser fotografia realista.
   - Se for CARD COM FRASE / TEXTO: identifique a tipografia, moldura e textura de fundo.

2. ARQUÉTIPO E PERSONAGEM CENTRAL IDÊNTICO:
   - Se a imagem mostra uma Cigana / Pombagira Cigana dançando com vestido vermelho: a nova arte DEVE ser uma belíssima Mulher Cigana dançando com vestido vermelho esvoaçante! NUNCA troque por um velho, um homem ou um cenário aleatório!
   - Se mostra Ogum com espada de ferro: a nova arte DEVE ser Ogum com espada de ferro!
   - Se mostra Caboclo na mata: a nova arte DEVE ser o Caboclo com cocar e arco!
   - Se mostra Preto Velho: a nova arte DEVE ser um Preto Velho benzedor sereno!
   - Se mostra uma xícara de café com frase motivacional: a nova arte DEVE ser uma xícara de café estética!

3. ELEMENTOS ICÔNICOS E PALETA DE CORES:
   - Capture os símbolos específicos que tornam a imagem magnética (ex: roda cigana de madeira, violão acústico, rosas vermelhas, lua crescente, lanterna, tons de carmesim e dourado envelhecido sobre fundo limpo).
   - O prompt em inglês deve incluir esses elementos icônicos exatos.

Analise minuciosamente a imagem fornecida e responda ESTRITAMENTE em formato JSON estruturado com os seguintes campos:

{
  "ocr": {
    "has_text": true/false,
    "extracted_text": "Texto completo escrito na imagem (se houver)",
    "hook_phrase": "A frase de maior impacto ou título principal"
  },
  "art_style_analysis": {
    "medium": "Ilustração Artística / Aquarela / Desenho Vintage / Fotografia Realista / etc",
    "exact_technique": "Ex: vintage watercolor graphic illustration with ink outlines on clean warm parchment background",
    "is_illustration": true/false
  },
  "composition": {
    "layout_type": "Retrato / Card com texto / Fotografia / Ilustração / etc",
    "element_distribution": "Onde estão os personagens, textos e espaços vazios",
    "visual_hierarchy": "Qual o primeiro ponto focal que captura o olho"
  },
  "design": {
    "color_palette": ["#cor1", "#cor2", "tons predominantes"],
    "lighting": "Luz suave / Dramática / Volumétrica / Estúdio",
    "art_style": "Vintage envelhecido / Ilustração / Fotografia / etc",
    "contrast_score": "Alto / Médio / Suave"
  },
  "marketing_psychology": {
    "core_subject": "Assunto principal e arquétipo (ex: Cigana dançando, Ogum, reflexão de vida, fé)",
    "dominant_emotion": "Paz / Força / Fascínio / Saudade / Inspiração",
    "viral_hook_reason": "Explicação do que tornou esta imagem viral e magnética",
    "target_audience": "Público-alvo provável"
  },
  "creative_remix_proposal": {
    "new_improved_phrase": "Uma nova frase ou conselho original e poderoso no mesmo nicho e arquétipo",
    "essence_description_pt": "Descrição em português da nova arte garantindo a MESMA ESSÊNCIA, MESMO PERSONAGEM e MESMO ESTILO ARTÍSTICO da referência",
    "prompt_image_en": "Prompt DETALHADO E IMERSIVO EM INGLÊS pronto para o gerador de imagem (FLUX / Agnes AI) que MANTENHA A MESMA ESSÊNCIA, O MESMO PERSONAGEM CENTRAL, O MESMO ESTILO ARTÍSTICO (se for ilustração/aquarela, mantenha ilustração/aquarela; se for foto, mantenha foto) E OS MESMOS SÍMBOLOS MARCANTES da referência viral. Sem qualquer texto ou letras na imagem."
  }
}

Regras: Retorne APENAS o JSON puro, sem crases de markdown e sem explicações antes ou depois.`;

/**
 * Executa a análise visual multimodal
 */
export async function analyzeViralImage(imageUrl, contextTitle = '', userId = null) {
    const config = await getAiConfig(userId);
    const imgData = await fetchImageAsBase64(imageUrl);

    let analysisResult = null;

    // 1. Tenta Gemini 1.5 Flash Vision (melhor custo-benefício e rapidez)
    if (config.geminiApiKey && imgData) {
        try {
            console.log('[VisionService] Analisando imagem via Gemini 1.5 Flash Vision...');
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${config.geminiApiKey}`;
            const payload = {
                contents: [{
                    parts: [
                        { text: `${VISION_SYSTEM_PROMPT}\n\nContexto da postagem original: "${contextTitle}"` },
                        {
                            inline_data: {
                                mime_type: imgData.mimeType,
                                data: imgData.base64
                            }
                        }
                    ]
                }],
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 1500
                }
            };

            const res = await axios.post(url, payload, { timeout: 35000 });
            const candidate = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (candidate) {
                const cleaned = candidate.replace(/```json/gi, '').replace(/```/g, '').trim();
                analysisResult = JSON.parse(cleaned);
            }
        } catch (e) {
            console.warn('[VisionService] Gemini Vision falhou:', e.message);
        }
    }

    // 2. Fallback: OpenAI GPT-4o Vision
    if (!analysisResult && config.openaiApiKey && (imgData || imageUrl.startsWith('http'))) {
        try {
            console.log('[VisionService] Tentando análise via OpenAI GPT-4o Vision...');
            const imagePayload = imgData 
                ? `data:${imgData.mimeType};base64,${imgData.base64}`
                : imageUrl;

            const res = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o',
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: `${VISION_SYSTEM_PROMPT}\n\nContexto da postagem: "${contextTitle}"` },
                        { type: 'image_url', image_url: { url: imagePayload } }
                    ]
                }],
                temperature: 0.3,
                max_tokens: 1500
            }, {
                headers: { Authorization: `Bearer ${config.openaiApiKey}`, 'Content-Type': 'application/json' },
                timeout: 40000
            });

            const content = res.data?.choices?.[0]?.message?.content;
            if (content) {
                const cleaned = content.replace(/```json/gi, '').replace(/```/g, '').trim();
                analysisResult = JSON.parse(cleaned);
            }
        } catch (e) {
            console.warn('[VisionService] OpenAI Vision falhou:', e.message);
        }
    }

    // 3. Fallback Textual via Qroc (Groq): Se não houver visão ou o download da imagem falhar
    if (!analysisResult && config.groqApiKey) {
        try {
            console.log('[VisionService] Executando análise contextual via Qroc (Groq)...');
            const prompt = `Analise o tema e contexto deste conteúdo viral: "${contextTitle}".
Gere uma análise no formato JSON com OCR simulado a partir do título, psicologia de marketing e proposta de remix.
${VISION_SYSTEM_PROMPT}`;
            const text = await callGroqGenerate(config.groqApiKey, prompt, 25000, 1000);
            const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
            analysisResult = JSON.parse(cleaned);
        } catch (e) {
            console.warn('[VisionService] Qroc contextual falhou:', e.message);
        }
    }

    if (!analysisResult) {
        // Fallback estruturado de emergência
        analysisResult = {
            ocr: {
                has_text: Boolean(contextTitle),
                extracted_text: contextTitle || 'Sem texto detectado',
                hook_phrase: contextTitle || 'Mensagem de alto engajamento'
            },
            composition: {
                layout_type: 'Card vertical de engajamento',
                element_distribution: 'Foco central com texto em destaque',
                visual_hierarchy: 'Título principal seguido de imagem'
            },
            design: {
                color_palette: ['#3b82f6', '#1e293b', '#ffffff'],
                lighting: 'Iluminação equilibrada',
                art_style: 'Editorial moderno',
                contrast_score: 'Alto'
            },
            marketing_psychology: {
                core_subject: contextTitle || 'Tendência identificada',
                dominant_emotion: 'Inspiração e reflexão',
                viral_hook_reason: 'Identificação imediata do público com a mensagem',
                target_audience: 'Seguidores do nicho'
            },
            creative_remix_proposal: {
                new_improved_phrase: contextTitle ? `A verdadeira força está em transformar desafios em aprendizado. — Reflexão` : 'Mensagem original inspiradora',
                suggested_scene: 'Personagem nobre e sereno no terço esquerdo sobre textura de pergaminho antigo.',
                prompt_image_en: 'masterpiece vintage engraving portrait, highly detailed, soft dramatic lighting, no text'
            }
        };
    }

    // Se houver item salvo na tabela viral_image_items, atualiza a análise
    try {
        await query(
            `UPDATE viral_image_items 
             SET ocr_text = $1, analysis_json = $2 
             WHERE image_url = $3 OR permalink = $4`,
            [analysisResult.ocr?.extracted_text || '', JSON.stringify(analysisResult), imageUrl, imageUrl]
        );
    } catch (_) {}

    return analysisResult;
}
