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
    if (!newPhrase || newPhrase.length < 5) {
        newPhrase = analysis?.ocr?.hook_phrase || analysis?.ocr?.extracted_text || referenceTitle || 'Mensagem de fé e inspiração';
    }

    // 2. Mapeamento de tamanho e proporção
    let platformFormat = null;
    if (format === 'feed_square' || format === '1:1') platformFormat = 'facebook_feed'; // 1080x1080
    else if (format === 'story' || format === '9:16') platformFormat = 'instagram_story'; // 1080x1920
    else platformFormat = 'instagram_feed'; // 1080x1350 (4:5)

    // 3. Monta o objeto de identidade visual
    const visualIdentity = {
        style: visualStyle === 'sem_estilo' ? 'sem_estilo' : (visualStyle || 'sem_estilo'),
        imageProvider: 'auto',
        format
    };

    // 4. Se o usuário escolheu "Sem estilo fixo" e a análise gerou um prompt visual descritivo da arte, usa direto
    const customVisualPrompt = visualStyle === 'sem_estilo' && analysis?.creative_remix_proposal?.prompt_image_en
        ? analysis.creative_remix_proposal.prompt_image_en
        : null;

    // 5. Executa a geração orquestrada em paralelo (Imagem via Agnes AI + Legenda via Qroc)
    const result = await orchestratePostGeneration({
        title: newPhrase,
        visualIdentity,
        userId,
        platform: platformFormat,
        customVisualPrompt
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
