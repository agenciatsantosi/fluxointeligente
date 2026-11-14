import { orchestratePostGeneration, generateCaptionAndHashtags, translateVisualPromptWithGroq, generateImage, getAiConfig, callGroqGenerate } from './ai_generator.js';
import { analyzeViralImage } from './visionAnalysisService.js';
import { query } from './database.js';

/**
 * Agente: Viral Creative Studio + Viral Caption AI
 * Transforma uma referência viral analisada em uma publicação original preservando com fidelidade sua essência.
 */
export async function createViralRemix({
    referenceId = null,
    referenceTitle = '',
    referenceImageUrl = '',
    analysis = null,
    visualStyle = 'sem_estilo',
    format = 'feed_vertical', // 'feed_square' (1:1), 'feed_vertical' (4:5), 'story' (9:16)
    tone = 'religioso', // 'religioso', 'motivacional', 'inspirador', 'informativo', 'emocional'
    userId = null,
    exampleReferences = []
}) {
    console.log(`[ViralCreativeStudio] Iniciando remodelagem inteligente para: "${referenceTitle}" (estilo: ${visualStyle}, tom: ${tone}, exemplos de ref: ${exampleReferences.length})`);

    const config = await getAiConfig(userId);

    // 1. Se a análise visual não veio ou veio incompleta, executa a visão computacional em tempo real
    if ((!analysis || !analysis.creative_remix_proposal?.prompt_image_en) && referenceImageUrl) {
        try {
            console.log('[ViralCreativeStudio] 🔍 Executando análise de visão computacional em tempo real para preservar a essência...');
            analysis = await analyzeViralImage(referenceImageUrl, referenceTitle, userId);
        } catch (e) {
            console.warn('[ViralCreativeStudio] Falha ao analisar referência em tempo real:', e.message);
        }
    }

    // 2. Determina a frase ou ideia central a ser recriada
    let newPhrase = analysis?.creative_remix_proposal?.new_improved_phrase || '';
    if (!newPhrase || newPhrase.length < 5) {
        newPhrase = analysis?.ocr?.hook_phrase || analysis?.ocr?.extracted_text || referenceTitle || 'Mensagem de fé e inspiração';
    }

    // 3. Mapeamento de tamanho e proporção
    let platformFormat = null;
    if (format === 'feed_square' || format === '1:1') platformFormat = 'facebook_feed'; // 1080x1080
    else if (format === 'story' || format === '9:16') platformFormat = 'instagram_story'; // 1080x1920
    else platformFormat = 'instagram_feed'; // 1080x1350 (4:5)

    // 4. Monta o objeto de identidade visual
    const visualIdentity = {
        style: visualStyle === 'sem_estilo' ? 'sem_estilo' : (visualStyle || 'sem_estilo'),
        imageProvider: 'auto',
        format
    };

    // 5. Guia de exemplos de referência selecionados pelo usuário
    let examplesGuide = '';
    if (Array.isArray(exampleReferences) && exampleReferences.length > 0) {
        const sampleSummaries = exampleReferences
            .map(e => e.title || e.caption || '')
            .filter(Boolean)
            .slice(0, 3);
        if (sampleSummaries.length > 0) {
            examplesGuide = ` (Follow aesthetic standards and tone inspired by top references: ${sampleSummaries.join('; ')})`;
        }
    }

    // 6. Constrói o Prompt Visual que PRESERVA A ESSÊNCIA DA REFERÊNCIA
    let customVisualPrompt = analysis?.creative_remix_proposal?.prompt_image_en || null;

    // Se não tiver prompt direto da análise, traduz o contexto do post original com foco no ARQUÉTIPO VISUAL
    if (!customVisualPrompt) {
        try {
            console.log('[ViralCreativeStudio] 🎨 Gerando prompt visual focado na essência da referência via Qroc...');
            const essenceSubject = referenceTitle || newPhrase;
            customVisualPrompt = await translateVisualPromptWithGroq(essenceSubject, visualIdentity, config);
        } catch (promptErr) {
            console.warn('[ViralCreativeStudio] Aviso ao sintetizar prompt visual:', promptErr.message);
        }
    }

    if (customVisualPrompt && examplesGuide) {
        customVisualPrompt = `${customVisualPrompt}, highly engaging aesthetic, masterpiece${examplesGuide}`;
    }

    // 7. Executa a geração orquestrada em paralelo (Imagem com essência preservada + Legenda via Qroc)
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
