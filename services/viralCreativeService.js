import { orchestratePostGeneration, generateCaptionAndHashtags, translateVisualPromptWithGroq, generateImage, getAiConfig } from './ai_generator.js';
import { query } from './database.js';

/**
 * Agente: Viral Creative Studio + Viral Caption AI
 * Transforma uma referência viral analisada em uma publicação original e de alta conversão.
 */
export async function createViralRemix({
    referenceId = null,
    referenceTitle = '',
    referenceImageUrl = '',
    analysis = null,
    visualStyle = 'umbanda_cuiaba',
    format = 'feed_vertical', // 'feed_square' (1:1), 'feed_vertical' (4:5), 'story' (9:16)
    tone = 'religioso', // 'religioso', 'motivacional', 'inspirador', 'informativo', 'emocional'
    userId = null
}) {
    console.log(`[ViralCreativeStudio] Iniciando remodelagem inteligente para: "${referenceTitle}" (estilo: ${visualStyle}, tom: ${tone})`);

    // 1. Determina a frase ou ideia central a ser recriada
    let newPhrase = analysis?.creative_remix_proposal?.new_improved_phrase || '';
    if (!newPhrase || newPhrase.length < 10) {
        newPhrase = analysis?.ocr?.hook_phrase || referenceTitle || 'Mensagem de fé e sabedoria';
    }

    // 2. Mapeamento de tamanho e proporção
    let platformFormat = null;
    if (format === 'feed_square') platformFormat = 'facebook_feed'; // 1080x1080
    else if (format === 'story') platformFormat = 'instagram_story'; // 1080x1920
    else platformFormat = 'instagram_feed'; // 1080x1350 (4:5)

    // 3. Monta o objeto de identidade visual
    const visualIdentity = {
        style: visualStyle || 'umbanda_cuiaba',
        imageProvider: 'auto',
        format
    };

    // 4. Executa a geração orquestrada em paralelo (Imagem via Agnes AI + Legenda via Qroc)
    const result = await orchestratePostGeneration({
        title: newPhrase,
        visualIdentity,
        userId,
        platform: platformFormat
    });

    // 5. Salva a nova criação no banco de dados para histórico e agendamento
    let postId = null;
    try {
        const insertRes = await query(`
            INSERT INTO viral_recreated_posts (
                user_id,
                reference_item_id,
                recreated_image_url,
                caption,
                hashtags,
                status
            ) VALUES ($1, $2, $3, $4, $5, 'draft')
            RETURNING id
        `, [
            userId,
            referenceId ? Number(referenceId) : null,
            result.imageUrl,
            result.description,
            result.hashtags
        ]);
        postId = insertRes.rows[0]?.id;
    } catch (e) {
        console.warn('[ViralCreativeStudio] Aviso ao persistir post remodelado:', e.message);
    }

    return {
        id: postId,
        originalReference: {
            title: referenceTitle,
            imageUrl: referenceImageUrl,
            analysis
        },
        recreated: {
            phrase: newPhrase,
            imageUrl: result.imageUrl,
            caption: result.description,
            hashtags: result.hashtags,
            format,
            style: visualStyle
        }
    };
}
