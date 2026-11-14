import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import axios from 'axios';
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

    // 8. Se a referência original for um CARD COM FRASE / PÔSTER (tem texto/headline de destaque):
    // Aplica o overlay tipográfico profissional de pôster com a nova frase remodelada no topo!
    if (analysis?.ocr?.has_text && newPhrase && result.imageUrl && (visualStyle === 'sem_estilo' || visualStyle === 'card_clean_moderno')) {
        try {
            console.log('[ViralCreativeStudio] 🖋️ A referência viral é um Card com Frase. Aplicando overlay tipográfico de pôster...');
            const author = /z[eé]\s*p[ei]lintra|seu\s*z[eé]/i.test(`${referenceTitle} ${newPhrase}`) ? 'SEU ZÉ PILINTRA' : (analysis?.marketing_psychology?.core_subject || '');
            result.imageUrl = await applyViralPosterCardOverlay({
                imageLocalOrUrl: result.imageUrl,
                phrase: newPhrase,
                authorSignature: author
            });
        } catch (overlayErr) {
            console.warn('[ViralCreativeStudio] Falha ao aplicar overlay de pôster:', overlayErr.message);
        }
    }

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
 * Garante fidelidade máxima aos arquétipos visuais sagrados e clássicos brasileiros,
 * preservando dinamicamente a pose, enquadramento e símbolos reais da referência.
 */
export function enhancePromptWithCanonicalArchetype(rawPrompt, analysis, title = '', phrase = '') {
    const combinedContext = `${title} ${phrase} ${analysis?.marketing_psychology?.core_subject || ''} ${analysis?.creative_remix_proposal?.essence_description_pt || ''} ${analysis?.ocr?.extracted_text || ''} ${analysis?.composition?.element_distribution || ''} ${analysis?.art_style_analysis?.exact_technique || ''}`.toLowerCase();
    let prompt = rawPrompt || '';

    const isZePelintra = /z[eé]\s*p[ei]lintra|seu\s*z[eé]|malandro\b/i.test(combinedContext);
    const isCigana = /cigan[ao]|povo\s*cigano|santa\s*sara|pombagira\s*cigana/i.test(combinedContext);
    const isOgum = /ogum|s[aã]o\s*jorge/i.test(combinedContext);
    const isPretoVelho = /preto\s*velho|preta\s*velha|pai\s*jo[aã]o|vov[oó]\s*(?:maria|conga|joaquim)/i.test(combinedContext);

    // Identifica se a referência original é uma ilustração gráfica (como a do Zé Pilintra)
    const isIllustration = analysis?.art_style_analysis?.is_illustration || 
        /illustration|ilustra[çc][aã]o|desenho|drawing|artwork/i.test(analysis?.art_style_analysis?.medium || '') ||
        /illustration/i.test(prompt);

    const isCardWithText = !!analysis?.ocr?.has_text;

    if (isZePelintra) {
        console.log('[ViralCreativeStudio] 🎩 Detectado arquétipo de Seu Zé Pelintra! Analisando pose e composição dinâmica da referência...');

        // 1. Detecta dinamicamente a POSE da referência (costas vs sentado vs em pé)
        let zePose = '';
        if (/rear|back|costas|shoulder|ombro|3\/4|three-quarter/i.test(combinedContext)) {
            zePose = 'A distinguished adult Afro-Brazilian gentleman (Seu Zé Pelintra), seen from behind in an elegant three-quarter rear view (3/4 rear profile), turned with his back partially to the viewer while looking back over his shoulder with a confident, charismatic expression, holding a rocks glass with drink in hand. Waist-up framing occupying the lower 60% of the composition.';
        } else if (/sitting|cross-legged|squat|sentad|c[oó]coras/i.test(combinedContext)) {
            zePose = 'A distinguished adult Afro-Brazilian gentleman (Seu Zé Pelintra), sitting calmly on the floor with cross-legged or squatting posture, serene respectful expression, full-body framing.';
        } else {
            zePose = 'A distinguished adult Afro-Brazilian gentleman (Seu Zé Pelintra), standing with relaxed elegant charisma, holding a glass or polished cane, confident posture.';
        }

        // 2. Detecta dinamicamente os SÍMBOLOS E CENÁRIO da referência
        let zeProps = '';
        if (/dice|dados|flutuando|floating/i.test(combinedContext)) {
            zeProps = 'Surrounded by translucent 3D dice and playing cards (ace of spades and hearts) floating in the air with delicate cinematic mist and atmospheric depth.';
        } else if (/candle|vela|lamp|poste|lanterna/i.test(combinedContext)) {
            zeProps = 'Surrounded by fanned-out playing cards, glowing red ritual candles, a vintage dark liquor bottle, and an antique warm street lamppost nearby.';
        } else {
            zeProps = 'Surrounded by playing cards, subtle mystical aura, and vintage Brazilian Bohemian nightlife atmosphere.';
        }

        // 3. Vestimenta Canônica Obrigatória (Nunca terno verde ou sem chapéu!)
        const zeWardrobe = 'He is dressed in an immaculate tailored ALL-WHITE linen suit (pure white blazer jacket, pressed white trousers), crisp white dress shirt, vivid bright RED silk necktie, and a classic WHITE Panama hat with a prominent RED ribbon hatband, neat mustache and trimmed goatee.';

        // 4. Se for Card com Texto, reserva o topo para o pôster
        const layoutInstruction = isCardWithText
            ? 'Poster composition: the character and visual elements are centered in the lower 60% of the canvas, leaving the top 40% clean, clear and open with a soft atmospheric gradient.'
            : 'Centered balanced artistic composition.';

        // Remove menções de terno verde, anime ou roupas casuais
        prompt = prompt
            .replace(/green\s+suit/gi, 'pure white suit')
            .replace(/green\s+jacket/gi, 'white jacket')
            .replace(/green\s+blazer/gi, 'white blazer')
            .replace(/green/gi, 'red')
            .replace(/young\s+hipster/gi, 'dignified adult gentleman')
            .replace(/bowtie/gi, 'red necktie');

        if (isIllustration) {
            prompt = `Clean graphic digital art poster illustration with crisp outlines and rich contrast on pure white background: ${zePose} ${zeWardrobe} ${zeProps} ${layoutInstruction} High aesthetic quality, masterpiece spiritual artwork, absolutely NO green suit, NO anime hair, NO modern casual clothes.`;
        } else {
            prompt = `${zePose} ${zeWardrobe} ${zeProps} ${layoutInstruction} Elegant clean background, cinematic lighting, masterpiece portrait, highly detailed.`;
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

    // Regra estrita anti-texto para NUNCA gerar letras deformadas pelo modelo generativo
    const antiTextGuard = ', absolutely NO text, NO typography, NO words, NO letters, NO writing, NO alphabet, NO title, NO watermark, NO logo, NO signatures';
    if (!prompt.includes('NO text')) {
        prompt += antiTextGuard;
    }

    return prompt;
}

function escapeXml(unsafe) {
    if (!unsafe) return '';
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

function wrapText(text, maxChars = 24) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';
    for (const w of words) {
        if (!current) { current = w; }
        else if ((current + ' ' + w).length <= maxChars) { current += ' ' + w; }
        else { lines.push(current); current = w; }
    }
    if (current) lines.push(current);
    return lines;
}

/**
 * Aplica um overlay de tipografia estilizada de pôster em alta definição
 * no topo da imagem, criando um card viral que preserva o formato de cartaz com frase.
 */
export async function applyViralPosterCardOverlay({
    imageLocalOrUrl,
    phrase,
    authorSignature = ''
}) {
    if (!phrase || !String(phrase).trim()) return imageLocalOrUrl;

    try {
        let inputBuffer = null;
        let localFilePath = null;
        let isLocalFile = false;

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
        const width = metadata.width || 1080;
        const height = metadata.height || 1350;

        const scale = width / 1080;
        const cleanPhrase = String(phrase).toUpperCase().replace(/[“"”]/g, '').trim();
        const lines = wrapText(cleanPhrase, 20).slice(0, 5);

        let fontSize = Math.round(50 * scale);
        if (lines.length > 3) fontSize = Math.round(42 * scale);
        if (lines.length > 4) fontSize = Math.round(36 * scale);

        const lineH = Math.round(fontSize * 1.25);
        const totalTextH = lines.length * lineH;
        
        // Posição vertical inicial no topo
        const topMargin = Math.round(height * 0.05);
        let curY = topMargin + fontSize;

        const svgParts = [];
        svgParts.push(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`);
        svgParts.push(`<defs>
            <linearGradient id="topFade" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#ffffff" stop-opacity="0.92"/>
                <stop offset="70%" stop-color="#ffffff" stop-opacity="0.55"/>
                <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
            </linearGradient>
            <filter id="textGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#ffffff" flood-opacity="0.9"/>
            </filter>
        </defs>`);

        // Gradiente sutil atrás das letras para garantir contraste perfeito
        const bannerH = Math.round(topMargin + totalTextH + (authorSignature ? 60 * scale : 25 * scale));
        svgParts.push(`<rect x="0" y="0" width="${width}" height="${bannerH}" fill="url(#topFade)"/>`);

        lines.forEach((line, idx) => {
            const isHighlight = idx === lines.length - 1 || idx === 0;
            const color = isHighlight ? '#c01515' : '#111827';
            svgParts.push(`<text x="${width / 2}" y="${curY}" text-anchor="middle" font-family="'Impact', 'Arial Black', 'Montserrat', sans-serif" font-weight="900" font-size="${fontSize}px" fill="${color}" letter-spacing="1.5px" filter="url(#textGlow)">${escapeXml(line)}</text>`);
            curY += lineH;
        });

        if (authorSignature) {
            curY += Math.round(12 * scale);
            svgParts.push(`<text x="${width / 2}" y="${curY}" text-anchor="middle" font-family="'Montserrat', 'Arial', sans-serif" font-weight="900" font-size="${Math.round(22 * scale)}px" fill="#b91c1c" letter-spacing="3.5px">✦ ${escapeXml(authorSignature.toUpperCase())} ✦</text>`);
        }

        svgParts.push(`</svg>`);

        const composited = await sharp(inputBuffer)
            .composite([{ input: Buffer.from(svgParts.join('')), top: 0, left: 0 }])
            .png()
            .toBuffer();

        if (isLocalFile && localFilePath) {
            fs.writeFileSync(localFilePath, composited);
            return imageLocalOrUrl;
        }

        // Salva arquivo com overlay em /uploads/automations
        const fileName = `viral-poster-${Date.now()}.png`;
        const uploadsDir = path.join(process.cwd(), 'uploads', 'automations');
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
        const fullPath = path.join(uploadsDir, fileName);
        fs.writeFileSync(fullPath, composited);
        return `/uploads/automations/${fileName}`;
    } catch (err) {
        console.warn('[ViralCreativeStudio] Falha ao aplicar overlay tipográfico no card:', err.message);
        return imageLocalOrUrl;
    }
}
