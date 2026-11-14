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

const VISION_SYSTEM_PROMPT = `Você é o "Vision Analysis Service" do FluxoInteligente, um diretor de arte sênior e especialista em marketing visual e neurociência do engajamento nas redes sociais.

Analise minuciosamente a imagem fornecida e responda ESTRITAMENTE em formato JSON estruturado com os seguintes campos:

{
  "ocr": {
    "has_text": true/false,
    "extracted_text": "Texto completo escrito na imagem (se houver)",
    "hook_phrase": "A frase de maior impacto ou título principal"
  },
  "composition": {
    "layout_type": "Retrato / Card com texto / Fotografia / Ilustração / etc",
    "element_distribution": "Onde estão os personagens, textos e espaços vazios",
    "visual_hierarchy": "Qual o primeiro ponto focal que captura o olho"
  },
  "design": {
    "color_palette": ["#cor1", "#cor2", "tons predominantes"],
    "lighting": "Luz suave / Dramática / Volumétrica / Estúdio",
    "art_style": "Vintage envelhecido / Fotografia realista / 3D / Flat / etc",
    "contrast_score": "Alto / Médio / Suave"
  },
  "marketing_psychology": {
    "core_subject": "Assunto principal e arquétipo (ex: Caboclo Sete Flechas, reflexão de vida, fé)",
    "dominant_emotion": "Paz / Força / Curiosidade / Saudade / Inspiração",
    "viral_hook_reason": "Explicação científica e prática de por que esta imagem reteve a atenção",
    "target_audience": "Público-alvo provável"
  },
  "creative_remix_proposal": {
    "new_improved_phrase": "Uma nova frase ou conselho original e poderoso no mesmo nicho (SEM COPIAR a original)",
    "suggested_scene": "Descrição detalhada em português da nova cena aprimorada que supera a original",
    "prompt_image_en": "Prompt hiper-realista e detalhado em INGLÊS pronto para ser enviado ao gerador de imagens (Agnes AI / FLUX)"
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
