/**
 * ════════════════════════════════════════════════════════════════════════
 * 🎨 CARD DE FRASE KAWAII — Estilo Visual das Imagens
 * ════════════════════════════════════════════════════════════════════════
 *
 * Gera imagens estilo "card de frase" (quote card) com:
 *   - Fundo sólido pastel (creme/bege)
 *   - Frase completa em caixa alta, fonte grossa e arredondada
 *   - Trecho final em destaque (cor de destaque)
 *   - Personagem kawaii (bebê fofo) com olhos brilhantes
 *   - Corações / elementos flutuando conforme a emoção
 *   - Marca d'água "@usuario" no rodapé
 *
 * Diferente dos demais estilos, ESTE permite texto na imagem.
 * Por isso o prompt NÃO recebe o sufixo "NO TEXT, no letters, no watermark".
 * ════════════════════════════════════════════════════════════════════════
 */

/** Identificador único do estilo (usado no select do front-end). */
export const KAWAII_STYLE_ID = 'kawaii_quote_card';

/** Label exibido no select "Estilo Visual das Imagens". */
export const KAWAII_STYLE_LABEL = '💖 Card de Frase Kawaii (com texto)';

/** Valor persistido em visual_identity.style */
export const KAWAII_STYLE_VALUE =
    'Card de frase Kawaii com personagem fofo, texto grande na imagem, cores pastel e destaque emocional';

/**
 * Emoções selecionáveis. O valor `prompt` descreve a cena do personagem e
 * os elementos flutuantes; `palette` define as cores do card.
 */
export const KAWAII_EMOTIONS = [
    {
        id: 'auto',
        label: 'Automático (IA escolhe pela frase)',
        emoji: '🤖',
        prompt: 'Choose the emotion that best matches the meaning of the phrase automatically.',
        palette: 'soft warm beige and cream'
    },
    {
        id: 'amor',
        label: 'Amor / Carinho',
        emoji: '💕',
        prompt: 'the character is shy and in love, cheeks blushing pink, tiny hearts floating up around the head, hands clasped near the face',
        palette: 'warm cream and soft pink'
    },
    {
        id: 'fofo',
        label: 'Fofo / Delicado',
        emoji: '🥺',
        prompt: 'the character is extremely cute and innocent with big sparkling eyes, tiny sparkles and small pastel flowers floating around',
        palette: 'light beige and pastel yellow'
    },
    {
        id: 'motivacional',
        label: 'Motivacional / Determination',
        emoji: '💪',
        prompt: 'the character is determined and optimistic with a bright determined smile, small sparkles and rising stars floating around',
        palette: 'warm beige and soft gold'
    },
    {
        id: 'engasgado',
        label: 'Engraçado / Triguedo',
        emoji: '😂',
        prompt: 'the character is laughing hard with tears of joy, small comedy sparkles and funny stars floating around',
        palette: 'light cream and soft apricot'
    },
    {
        id: 'triste',
        label: 'Triste / Emocional',
        emoji: '🥹',
        prompt: 'the character is emotional and tender with teary sparkling eyes, tiny teardrops and soft rain drops floating around',
        palette: 'cool light beige and soft blue'
    },
    {
        id: 'ansiedade',
        label: 'Ansiedade / Sobrecarregado',
        emoji: '😵‍💫',
        prompt: 'the character looks overwhelmed and dizzy with spirals and scattered scribbles floating around',
        palette: 'light cream and soft lavender'
    },
    {
        id: 'festa',
        label: 'Festa / Comemore',
        emoji: '🎉',
        prompt: 'the character is celebrating with both arms raised, confetti and colorful balloons floating around',
        palette: 'warm cream and festive coral'
    }
];

/** Mapa de emojis por emoção para montar o prompt final. */
const EMOTION_EMOJI = {
    'auto': '',
    'amor': '💗',
    'fofo': '🌸',
    'motivacional': '⭐',
    'engasgado': '✨',
    'triste': '💧',
    'ansiedade': '💫',
    'festa': '🎊'
};

/**
 * Detecta se o estilo visual selecionado é o Card Kawaii.
 * Aceita o objeto visual_identity completo ou apenas a string de style.
 */
export function isKawaiiStyle(visualIdentity) {
    if (!visualIdentity) return false;

    const style = typeof visualIdentity === 'object'
        ? visualIdentity.style
        : visualIdentity;

    if (typeof style !== 'string') return false;

    const normalized = style
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    return normalized.includes('kawaii') || normalized.includes('card de frase');
}

/**
 * Retorna a configuração de emoção a partir do visual_identity.
 */
export function resolveEmotion(visualIdentity) {
    const emotionId = (visualIdentity && typeof visualIdentity === 'object' && visualIdentity.emotion)
        ? String(visualIdentity.emotion)
        : 'auto';

    return KAWAII_EMOTIONS.find(e => e.id === emotionId) || KAWAII_EMOTIONS[0];
}

/**
 * Converte o texto da frase em caixa alta, respeitando acentos.
 */
function toUpperCaseSafe(text) {
    return String(text || '').toUpperCase();
}

/**
 * Quebra a frase em linhas de largura equilibrada para caber no card
 * sem estourar as bordas. Máximo de ~22 caracteres por linha.
 */
function wrapPhrase(phrase, maxCharsPerLine = 22, maxLines = 6) {
    const words = String(phrase || '').trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];

    // ────────────────────────────────────────────────────────────────────
    // O ÚLTIMO TRECHO é o destaque (renderizado em rosa). Se a frase tiver
    // pontuação final (., !, ?, ...), mantemos esse trecho sempre numa
    // linha própria para que a IA destaque a frase inteira e não só uma
    // palavra solta — foi assim na arte de referência ("TE AMO MUITO...").
    // ────────────────────────────────────────────────────────────────────
    const breakIdx = words.findIndex((w, i) =>
        i < words.length - 1 && /[.!?…]$/.test(w)
    );

    let headWords = words;
    let tailWords = [];

    if (breakIdx !== -1) {
        const candidateTail = words.slice(breakIdx + 1);
        // Só separa se o rabo for curto (cabe em 1 linha) e não for a frase inteira
        if (candidateTail.join(' ').length <= maxCharsPerLine && candidateTail.length < words.length) {
            headWords = words.slice(0, breakIdx + 1);
            tailWords = candidateTail;
        }
    }

    const lines = [];
    let current = '';

    for (const word of headWords) {
        const candidate = current ? `${current} ${word}` : word;
        if (candidate.length <= maxCharsPerLine) {
            current = candidate;
        } else {
            if (current) lines.push(current);
            current = word;
        }
    }
    if (current) lines.push(current);

    // O rabo em destaque entra SEMPRE como última linha
    if (tailWords.length) lines.push(tailWords.join(' '));

    // Se ficou com linhas demais, redistribui as palavras em menos linhas
    if (lines.length > maxLines) {
        const perLine = Math.ceil(words.length / maxLines);
        const rebalanced = [];
        for (let i = 0; i < words.length; i += perLine) {
            rebalanced.push(words.slice(i, i + perLine).join(' '));
        }
        return rebalanced;
    }

    return lines;
}

/**
 * Monta o prompt final em inglês para o gerador de imagens.
 *
 * @param {string} phrase              Frase que deve aparecer na imagem
 * @param {string} emotionId           Id da emoção selecionada
 * @param {string} watermark           Handle ex: "@entree_afetos" (opcional)
 * @returns {string} prompt pronto para OpenAI / Gemini / Flux
 */
export function buildKawaiiCardPrompt(phrase, emotionId = 'auto', watermark = '') {
    const emotion = KAWAII_EMOTIONS.find(e => e.id === emotionId) || KAWAII_EMOTIONS[0];

    const cleanPhrase = toUpperCaseSafe(String(phrase || '').trim())
        .replace(/\s+/g, ' ')
        .trim();

    const phraseLines = wrapPhrase(cleanPhrase);
    const phraseForPrompt = phraseLines.length ? phraseLines.join(' | ') : cleanPhrase;

    const highlightEmoji = EMOTION_EMOJI[emotion.id] || '💗';

    // Watermark só entra se o usuário realmente informou um @handle
    const watermarkBlock = watermark && watermark.trim()
        ? `At the very bottom center place a small elegant social media watermark text "${watermark.trim()}" in a thin rounded sans-serif font, low opacity so it does not compete with the phrase.`
        : 'Do not render any watermark text.';

    return [
        'A cute social media quote card, square 1:1 format, flat pastel illustration style.',
        '',
        // ⚠️ A FRASE VEM CEDO DE PROPÓSITO: o fallback Flux trunca o prompt em
        // 800 caracteres, então o texto precisa estar logo no início.
        `PHRASE TO RENDER EXACTLY: "${phraseForPrompt}"`,
        'Render this phrase EXACTLY as written, letter by letter, no missing, no duplicated and no invented words, in ALL CAPITAL LETTERS using a bold extra-heavy rounded bubble/gummy display font, dark charcoal black, thick and very legible, broken into short centered lines (max 5 lines).',
        `Highlight the LAST fragment of the phrase in a warm rose pink color, same font but slightly larger, clearly standing out from the black text.`,
        '',
        `BACKGROUND: solid flat ${emotion.palette} background with a very subtle soft grain texture, clean and calm, no photos, no patterns, no borders.`,
        '',
        'LAYOUT (from top to bottom):',
        '1) The upper 55% of the canvas is occupied by the phrase text.',
        `2) Below the phrase, in the lower 35%, sits one single adorable kawaii chibi character: ${emotion.prompt}.`,
        '3) The character is drawn as a simple round white blob-like baby creature with a chubby body, tiny arms, big glossy sparkling anime eyes with heart-shaped highlights, tiny blush on the cheeks and a soft cute expression.',
        '',
        'ACCENT DECORATION:',
        `- A few small ${highlightEmoji} style accent sparkles floating around the character.`,
        '',
        watermarkBlock,
        '',
        'STYLE AND QUALITY:',
        'Adorable kawaii illustration, clean vector-like shapes with soft cel shading, thick friendly outlines, minimal details, generous empty space, very popular aesthetic on Pinterest and Instagram, square composition, high resolution, masterpiece.',
        '',
        'AVOID:',
        'photorealism, 3d render, gradient mesh background, busy patterns, realistic humans, extra fingers, deformed hands, blurry text, misspelled words, random gibberish letters, harsh contrast, neon colors.'
    ].join('\n');
}

/**
 * Negative prompt padrão (usado por modelos que aceitam negative_prompt).
 * Para este estilo NÃO incluímos "text/words" no negative, pois texto é essencial.
 */
export function buildKawaiiNegativePrompt() {
    return 'photorealism, realistic people, 3d render, busy background, cluttered layout, blurry text, misspelled words, gibberish letters, extra limbs, deformed hands, low quality, harsh shadows, neon colors, watermark logo';
}

export default {
    KAWAII_STYLE_ID,
    KAWAII_STYLE_LABEL,
    KAWAII_STYLE_VALUE,
    KAWAII_EMOTIONS,
    isKawaiiStyle,
    resolveEmotion,
    buildKawaiiCardPrompt,
    buildKawaiiNegativePrompt
};