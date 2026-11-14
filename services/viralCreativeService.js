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

    // 6.1 ENRIQUECIMENTO CANÔNICO OBRIGATÓRIO (Garante fidelidade aos trajes sagrados e zero texto deformado)
    customVisualPrompt = enhancePromptWithCanonicalArchetype(
        customVisualPrompt,
        analysis,
        referenceTitle,
        newPhrase
    );

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
        let safeRefId = null;
        const numRefId = Number(referenceId);
        if (!isNaN(numRefId) && Number.isInteger(numRefId) && numRefId > 0) {
            try {
                const check = await query(`SELECT id FROM viral_image_items WHERE id = $1 LIMIT 1`, [numRefId]);
                if (check.rows.length > 0) {
                    safeRefId = numRefId;
                }
            } catch (_) {}
        }

        const numUserId = Number(userId);
        const safeUserId = (!isNaN(numUserId) && Number.isInteger(numUserId) && numUserId > 0) ? numUserId : 1;

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
            safeUserId,
            safeRefId,
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

/**
 * Garante fidelidade máxima aos arquétipos visuais sagrados e clássicos brasileiros.
 * Nunca permite que a IA invente personagens com roupas erradas (ex: terno verde em Zé Pelintra,
 * anime hipster, ou colocar velho no lugar de cigana).
 */
export function enhancePromptWithCanonicalArchetype(rawPrompt, analysis, title = '', phrase = '') {
    const combinedContext = `${title} ${phrase} ${analysis?.marketing_psychology?.core_subject || ''} ${analysis?.creative_remix_proposal?.essence_description_pt || ''} ${analysis?.ocr?.extracted_text || ''}`.toLowerCase();
    let prompt = rawPrompt || '';

    const isZePelintra = /z[eé]\s*p[ei]lintra|seu\s*z[eé]|malandro\b/i.test(combinedContext);
    const isCigana = /cigan[ao]|povo\s*cigano|santa\s*sara|pombagira\s*cigana/i.test(combinedContext);
    const isOgum = /ogum|s[aã]o\s*jorge/i.test(combinedContext);
    const isPretoVelho = /preto\s*velho|preta\s*velha|pai\s*jo[aã]o|vov[oó]\s*(?:maria|conga|joaquim)/i.test(combinedContext);

    // Identifica se a referência original é uma ilustração gráfica (como a do Zé Pilintra)
    const isIllustration = analysis?.art_style_analysis?.is_illustration || 
        /illustration|ilustra[çc][aã]o|desenho|drawing|artwork/i.test(analysis?.art_style_analysis?.medium || '') ||
        /illustration/i.test(prompt);

    if (isZePelintra) {
        console.log('[ViralCreativeStudio] 🎩 Detectado arquétipo canônico de Seu Zé Pelintra! Aplicando vestimenta estrita e trajes brancos...');
        const zeWardrobe = 'A dignified adult Afro-Brazilian gentleman (the iconic Umbanda spiritual guide Seu Zé Pelintra), with confident, respectful and serene presence. He is dressed in an immaculate tailored ALL-WHITE linen suit (pure white blazer jacket, pressed white trousers), crisp white dress shirt, vivid bright RED silk necktie, and a classic WHITE Panama hat with a prominent RED ribbon hatband, neat mustache and trimmed goatee.';
        const zeProps = 'Surrounded by traditional iconic symbols: fanned-out playing cards, glowing red ritual candles, a vintage dark liquor bottle, and an antique warm street lamppost nearby.';
        
        // Remove menções de terno verde, anime ou roupas casuais
        prompt = prompt
            .replace(/green\s+suit/gi, 'pure white suit')
            .replace(/green\s+jacket/gi, 'white jacket')
            .replace(/green\s+blazer/gi, 'white blazer')
            .replace(/green/gi, 'red')
            .replace(/young\s+hipster/gi, 'dignified adult gentleman')
            .replace(/bowtie/gi, 'red necktie');

        if (isIllustration) {
            prompt = `Clean graphic digital art illustration with crisp outlines and rich vibrant colors, isolated on pure white minimalist background: ${zeWardrobe} ${zeProps} Minimalist clean white studio background with soft ground shadow, high aesthetic quality, masterpiece spiritual illustration, absolutely NO green suit, NO anime hair, NO modern casual clothes.`;
        } else {
            prompt = `${zeWardrobe} ${zeProps} Elegant clean background, cinematic lighting, masterpiece portrait, highly detailed.`;
        }
    } else if (isCigana) {
        console.log('[ViralCreativeStudio] 💃 Detectado arquétipo canônico de Cigana! Aplicando vestimenta estrita...');
        const ciganaWardrobe = 'A radiant, graceful Gypsy woman (Povo Cigano / Pombagira Cigana) dancing with passionate and proud expression, long flowing dark wavy hair adorned with deep red roses, wearing an elaborate voluminous ruffled flamenco dress in rich crimson-red and golden accents with ornate gold coins and jewelry.';
        const ciganaProps = 'Surrounded by iconic gypsy symbols: a rustic wooden wagon wheel, acoustic Spanish guitar, scattered red roses, and a glowing mystical crescent moon in warm amber light.';

        if (isIllustration) {
            prompt = `Fine vintage graphic illustration with bold ink lines and rich watercolor palette, on warm ivory background: ${ciganaWardrobe} ${ciganaProps} Clean artistic composition, masterpiece spiritual artwork, NOT an old man, NOT a cauldron, NOT a wizard.`;
        } else {
            prompt = `${ciganaWardrobe} ${ciganaProps} Romantic mystical atmosphere, cinematic lighting, masterpiece.`;
        }
    } else if (isOgum) {
        console.log('[ViralCreativeStudio] ⚔️ Detectado arquétipo canônico de Ogum!');
        const ogumDetails = 'A heroic and commanding African warrior deity (Ogum), athletic and muscular, adorned in deep royal navy-blue and cobalt ceremonial vestments with sacred beaded necklaces (guias), holding a raised forged iron sword, noble and protective stance, iron shield nearby.';
        prompt = `${ogumDetails} ${prompt}`;
    } else if (isPretoVelho) {
        console.log('[ViralCreativeStudio] 👴 Detectado arquétipo canônico de Preto Velho!');
        const pretoVelhoDetails = 'A revered elderly Afro-descendant spiritual elder (Preto Velho), with gentle weathered face, wise kind eyes, white hair and beard, wearing traditional humble white cotton clothing, holding a wooden rosary and pipe, peaceful comforting aura.';
        prompt = `${pretoVelhoDetails} ${prompt}`;
    }

    // Regra estrita anti-texto para NUNCA gerar letras deformadas como "SEU ZPELINTR"
    const antiTextGuard = ', absolutely NO text, NO typography, NO words, NO letters, NO writing, NO alphabet, NO title, NO watermark, NO logo, NO signatures';
    if (!prompt.includes('NO text')) {
        prompt += antiTextGuard;
    }

    return prompt;
}
