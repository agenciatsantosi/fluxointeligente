/**
 * ════════════════════════════════════════════════════════════════════════
 * 🎨 ESTILOS DE IMAGEM COM TEXTO — "Card de Frase"
 * ════════════════════════════════════════════════════════════════════════
 *
 * Diferente dos estilos jornalísticos, estes estilos têm o TEXTO DA FRASE
 * escrito DENTRO da imagem. Por isso eles não passam pelo prompt padrão
 * (que proíbe letras) e usam os construtores abaixo.
 *
 * Este módulo é PURO (sem import de Node), então pode ser usado tanto no
 * backend (services/ai_generator.js) quanto no front-end
 * (pages/PostAutomationPage.tsx) mantendo uma única fonte de verdade.
 * ════════════════════════════════════════════════════════════════════════
 */

/* ────────────────────────────  EMOÇÕES  ──────────────────────────── */

/** Catálogo base de emoções. A IA escolhe uma em modo "auto". */
export const EMOTIONS = [
    { id: 'auto', label: 'Automático (IA escolhe pela frase)', emoji: '🤖' },
    { id: 'amor', label: 'Amor / Carinho', emoji: '💕' },
    { id: 'fofo', label: 'Fofo / Delicado', emoji: '🥺' },
    { id: 'motivacional', label: 'Motivacional / Determinação', emoji: '💪' },
    { id: 'engasgado', label: 'Engraçado / Triguedo', emoji: '😂' },
    { id: 'triste', label: 'Triste / Emocional', emoji: '🥹' },
    { id: 'ansiedade', label: 'Ansiedade / Sobrecarregado', emoji: '😵‍💫' },
    { id: 'festa', label: 'Festa / Comemore', emoji: '🎉' }
];

/** Normaliza o retorno do LLM para um id de emoção válido. */
const EMOTION_ALIASES = {
    'ansiedade': 'ansiedade', 'anxiety': 'ansiedade', 'ansioso': 'ansiedade',
    'estresse': 'ansiedade', 'stress': 'ansiedade', 'preocupacao': 'ansiedade',
    'engasgado': 'engasgado', 'engasgada': 'engasgado', 'divertido': 'engasgado',
    'humor': 'engasgado', 'risada': 'engasgado', 'comedia': 'engasgado',
    'fofo': 'fofo', 'fofa': 'fofo', 'doce': 'fofo', 'kawaii': 'fofo', 'fofo-doce': 'fofo',
    'amor': 'amor', 'amoroso': 'amor', 'carinho': 'amor', 'romance': 'amor', 'paixao': 'amor',
    'motivacional': 'motivacional', 'determinacao': 'motivacional', 'forca': 'motivacional',
    'sucesso': 'motivacional', 'inspiracao': 'motivacional', 'coragem': 'motivacional',
    'triste': 'triste', 'tristeza': 'triste', 'melancolia': 'triste', 'saudade': 'triste',
    'chateado': 'triste', 'decepcionado': 'triste',
    'festa': 'festa', 'comemoracao': 'festa', 'celebracao': 'festa',
    'alegria': 'festa', 'felicidade': 'festa', 'sucesso-total': 'festa'
};

/**
 * Converte a saída textual do LLM em um id de emoção conhecido.
 * @param {string} detected
 * @param {string[]} [allowed] ids permitidos (padrão: todos)
 */
export function normalizeDetectedEmotion(detected, allowed = EMOTIONS.map(e => e.id)) {
    const key = String(detected || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z]/g, '');
    const mapped = EMOTION_ALIASES[key];
    return (mapped && allowed.includes(mapped)) ? mapped : 'fofo';
}

/* ─────────────────────────  UTILITÁRIOS  ───────────────────────── */

const toUpper = (t) => String(t || '').toUpperCase();

/** Quebra a frase em linhas, isolando o último trecho (destaque) quando há pontuação. */
function wrapPhrase(phrase, maxCharsPerLine = 22, maxLines = 6) {
    const words = String(phrase || '').trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];

    // O ÚLTIMO trecho é o destaque (rosa no kawaii, negrito nos demais).
    // Mantemos ele sozinho na última linha para não quebrar a frase.
    const breakIdx = words.findIndex((w, i) => i < words.length - 1 && /[.!?…]$/.test(w));
    let headWords = words;
    let tailWords = [];

    if (breakIdx !== -1) {
        const candidate = words.slice(breakIdx + 1);
        if (candidate.join(' ').length <= maxCharsPerLine && candidate.length < words.length) {
            headWords = words.slice(0, breakIdx + 1);
            tailWords = candidate;
        }
    }

    const lines = [];
    let current = '';
    for (const word of headWords) {
        const candidate = current ? `${current} ${word}` : word;
        if (candidate.length <= maxCharsPerLine) current = candidate;
        else { if (current) lines.push(current); current = word; }
    }
    if (current) lines.push(current);
    if (tailWords.length) lines.push(tailWords.join(' '));

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

/** Bloco de marca d'água reutilizado por todos os estilos. */
function watermarkBlock(watermark) {
    return watermark && String(watermark).trim()
        ? `Place a small social media watermark text "${String(watermark).trim()}" discreetly, thin rounded sans-serif, low opacity, never competing with the phrase.`
        : 'Do not render any watermark text.';
}

/** Negative prompt: nunca inclui "text/words" porque texto é essencial aqui. */
export function buildCardNegativePrompt() {
    return 'photorealism if not requested, 3d render if not requested, busy background, cluttered layout, blurry text, misspelled words, gibberish letters, random symbols, extra limbs, deformed hands, low quality, harsh shadows, neon colors, brand logos';
}

/* ───────────────────────────  ESTILOS  ──────────────────────────── */

export const CARD_STYLES = [
    /* ─────────────────── 1. KAWAII (personagem fofo) ─────────────────── */
    {
        id: 'kawaii',
        value: 'Card de frase Kawaii com personagem fofo, texto grande na imagem, cores pastel e destaque emocional',
        label: '💖 Card de Frase Kawaii (personagem fofo)',
        hasEmotion: true,
        scenes: {
            auto: 'the character matches the emotion of the phrase',
            amor: 'shy and in love, cheeks blushing pink, hands clasped near the face',
            fofo: 'extremely cute and innocent, big sparkling eyes, curious happy expression',
            motivacional: 'determined and optimistic, bright confident smile, tiny arm raised',
            engasgado: 'laughing hard with tears of joy, mouth wide open laughing',
            triste: 'emotional and tender, teary sparkling eyes, a single teardrop',
            ansiedade: 'overwhelmed and dizzy, spirals floating around the head',
            festa: 'celebrating with both arms raised, big open smile'
        },
        palettes: {
            auto: 'soft warm beige and cream',
            amor: 'warm cream and soft pink',
            fofo: 'light beige and pastel yellow',
            motivacional: 'warm beige and soft gold',
            engasgado: 'light cream and soft apricot',
            triste: 'cool light beige and soft blue',
            ansiedade: 'light cream and soft lavender',
            festa: 'warm cream and festive coral'
        },
        build(phrase, o) {
            return [
                'A cute social media quote card, square 1:1, flat pastel illustration style.',
                '',
                // A frase vem CEDO: o fallback Flux trunca o prompt em 800 chars.
                `PHRASE TO RENDER EXACTLY: "${o.phraseForPrompt}"`,
                'Render this phrase EXACTLY as written, letter by letter, no missing, no duplicated and no invented words, in ALL CAPITAL LETTERS using a bold extra-heavy rounded bubble/gummy display font, dark charcoal black, thick and very legible, broken into short centered lines (max 5 lines).',
                `Highlight the LAST fragment of the phrase in a warm rose pink color, same font but slightly larger, clearly standing out from the black text.`,
                '',
                `BACKGROUND: solid flat ${o.palette} with a very subtle soft grain, clean, no photos, no patterns, no borders.`,
                '',
                'LAYOUT: the upper 55% holds the phrase text; below it sits ONE adorable kawaii chibi character — a simple round white blob-like baby creature with a chubby body, tiny arms, big glossy sparkling anime eyes with heart-shaped highlights and blush on the cheeks.',
                `CHARACTER POSE: ${o.scene}.`,
                '',
                'ACCENT: a few small heart-shaped sparkles floating around the character.',
                '',
                watermarkBlock(o.watermark),
                '',
                'STYLE: adorable kawaii illustration, clean vector shapes, soft cel shading, thick friendly outlines, generous empty space, square composition, high resolution, masterpiece.',
                '',
                'AVOID: photorealism, 3d render, busy patterns, realistic humans, extra fingers, deformed hands, blurry text, misspelled words, harsh contrast, neon colors.'
            ].join('\n');
        }
    },

    /* ─────────────── 2. CARTA 3D (personagem Pixar + carta) ─────────────── */
    {
        id: 'carta_3d',
        value: 'Carta 3D fofa com personagem Pixar, envelope com coração, mesa de madeira e pôr do sol',
        label: '💌 Carta 3D Pixar (envelope + pôr do sol)',
        hasEmotion: true,
        scenes: {
            auto: 'warm and affectionate, gently looking at the letter',
            amor: 'lovestruck, blushing, holding the envelope with both hands close to the heart',
            fofo: 'playful and curious, peeking over the envelope',
            motivacional: 'confident and cheerful, standing tall with a proud smile',
            engasgado: 'giggling, one hand covering the mouth',
            triste: 'quiet and emotional, holding the letter close, eyes slightly teary',
            ansiedade: 'nervous and fidgety, clutching the envelope tightly',
            festa: 'jumping with joy, arms up, letter flying in the air'
        },
        palettes: {
            auto: 'warm cream, soft orange and blush pink',
            amor: 'cream, warm peach and rose pink',
            fofo: 'cream, pastel yellow and soft mint',
            motivacional: 'cream, warm gold and light amber',
            engasgado: 'cream, soft apricot and light coral',
            triste: 'cream, dusty blue and muted lavender',
            ansiedade: 'cream, light periwinkle and cool grey',
            festa: 'cream, festive coral and bright pink'
        },
        build(phrase, o) {
            return [
                'A cozy 3D rendered social media scene, square 1:1, Pixar/Disney animation style.',
                '',
                `PHRASE TO RENDER EXACTLY: "${o.phraseForPrompt}"`,
                'The phrase is written ON the letter paper, spelled exactly as given, letter by letter, in a neat friendly rounded handwriting, black ink, filling the paper neatly with balanced margins.',
                'A few emotionally important words in the phrase must be highlighted in pink for emphasis.',
                '',
                'SCENE: one adorable 3D character with big glossy eyes, rounded soft shapes and warm subsurface-scattered skin standing next to a rustic wooden table.',
                `POSE: ${o.scene}.`,
                'ON THE TABLE: a cream paper letter, a white envelope sealed with a red wax heart, a ceramic coffee mug with a heart symbol, and a few soft pink cherry blossom flowers and petals.',
                '',
                'BACKGROUND: warm golden hour sunset sky with dreamy circular bokeh, soft light flares and a few distant birds.',
                '',
                `PALETTE: ${o.palette}, soft and inviting.`,
                '',
                watermarkBlock(o.watermark),
                '',
                'STYLE: high-end 3D animation render, soft global illumination, subsurface scattering, shallow depth of field, gentle rim light, cinematic, ultra detailed, masterpiece.',
                '',
                'AVOID: photorealism, live-action humans, flat 2d cartoon, busy clutter, blurry text, misspelled words, extra fingers, deformed hands, harsh shadows, neon colors.'
            ].join('\n');
        }
    },

    /* ─────────────────── 3. CADERNO ESPIRAL (foto real) ─────────────────── */
    {
        id: 'caderno',
        value: 'Foto real de página de caderno espiral com a frase escrita à mão',
        label: '📓 Foto de Caderno Espiral (frase manuscrita)',
        hasEmotion: false,
        build(phrase, o) {
            return [
                'A realistic top-down photograph of a single page of a spiral-bound notebook lying flat on a plain neutral surface.',
                '',
                `PHRASE TO RENDER EXACTLY: "${o.phraseForPrompt}"`,
                'The phrase is handwritten BY HAND in the center of the page, spelled exactly as given, letter by letter, in casual slightly imperfect cursive handwriting, dark gray ballpoint ink, natural and authentic — like a real diary entry.',
                '',
                'THE NOTEBOOK: the page fills most of the frame; on the left edge the metal spiral binding and its punched holes are clearly visible and slightly torn; the paper is slightly off-white with faint horizontal ruled lines and a visible page margin.',
                '',
                'LIGHT AND TONE: soft directional light coming from the top left casting a gentle diagonal shadow across the page, desaturated muted tones, subtle vignette, shallow depth of field, subtle film grain, natural realistic color.',
                '',
                watermarkBlock(o.watermark),
                '',
                'AVOID: printed or typed fonts, computer-generated lettering, perfectly straight machine text, hands, pens, faces, people, illustrations, cartoons, blurry text, misspelled words, gibberish letters, heavy filters.'
            ].join('\n');
        }
    },

    /* ───────────────── 4. MINIMALISTA EDITORIAL ───────────────── */
    {
        id: 'minimalista',
        value: 'Minimalista editorial tipográfico, fundo branco, serifa itálica elegante',
        label: '✨ Minimalista Editorial (serifa elegante)',
        hasEmotion: false,
        build(phrase, o) {
            return [
                'A minimalist editorial typographic poster, square 1:1.',
                '',
                `PHRASE TO RENDER EXACTLY: "${o.phraseForPrompt}"`,
                'The phrase is centered in the middle of the canvas, spelled exactly as given, letter by letter, set in an elegant high-contrast serif typeface in ITALIC, deep navy blue or near-black, medium size with generous letter spacing — refined magazine typography.',
                '',
                'ABOVE THE PHRASE: a single large decorative opening double quotation mark in the same color and typeface.',
                'AFTER THE PHRASE: optionally one small colorful emoji glyph that fits the meaning.',
                '',
                'BACKGROUND: pure white or very light cream, completely flat, no texture, no objects, no illustrations.',
                'COMPOSITION: very generous white space, calm, airy and refined.',
                '',
                watermarkBlock(o.watermark),
                '',
                'STYLE: luxury magazine layout, high-end branding, crisp vector-typography look, square composition.',
                '',
                'AVOID: characters, cartoons, illustrations, patterns, gradients, frames, borders, decorative clutter, blurry text, misspelled words, gibberish letters, low contrast, neon colors.'
            ].join('\n');
        }
    },

    /* ─────────────── 5. PAPEL RASGADO (dark moody) ─────────────── */
    {
        id: 'papel_rasgado',
        value: 'Folha de papel rasgado sobre fundo escuro, frase manuscrita e rabisco de coração',
        label: '🖤 Papel Rasgado Dark (fundo preto)',
        hasEmotion: false,
        build(phrase, o) {
            return [
                'A moody realistic photograph of a rectangular sheet of white paper with rough torn deckled edges, lying on a dark charcoal black textured background.',
                '',
                `PHRASE TO RENDER EXACTLY: "${o.phraseForPrompt}"`,
                'The phrase is handwritten in the middle of the paper, spelled exactly as given, letter by letter, in dark gray ink, loose casual handwriting with a slightly uneven baseline — like a torn-out diary note.',
                '',
                'COMPOSITION: the bright paper is centered on the dark surface and casts a soft drop shadow onto it; there is generous empty margin around the handwriting.',
                'BELOW THE PHRASE: a small hand-drawn doodle of a heart with a flowing scribble underline.',
                '',
                'TONE: monochrome, moody, high contrast between the bright paper and the dark background, soft even light, subtle film grain.',
                '',
                watermarkBlock(o.watermark),
                '',
                'AVOID: printed or typed fonts, computer-generated lettering, colorful or saturated tones, hands, pens, people, characters, cartoons, bright backgrounds, blurry text, misspelled words, gibberish letters.'
            ].join('\n');
        }
    },

    /* ─────────── 6. SABEDORIA DAS ERES (dark cinematográfico vertical) ─────────── */
    {
        id: 'sabedoria_eres',
        value: 'Sabedoria das Eres dark cinematográfico, personagem da frase no chapéu, título dourado em pincelada, formato vertical',
        label: '🔥 Sabedoria das Eres (dark cinematográfico vertical)',
        hasEmotion: false,
        // Cada entidade tem sua própria cena, paleta e acessório característico.
        entities: {
            auto: {
                name: 'a Guardiã',
                scene: 'a dignified dark-skinned woman wearing an elegant black headwrap with a deep red band and gold jewelry, wearing a black robe with red and gold accents, holding a black staff, serious wise expression',
                palette: 'deep crimson red and warm gold',
                props: 'a lit black candle with warm golden flame, red roses, rising smoke'
            },
            pombagira: {
                name: 'Pombagira Maria Caveira',
                scene: 'a powerful dark-skinned woman wearing a black veil and a wide-brimmed black hat with a deep red band, dark makeup with pale skull-like detailing, black dress with red accents, holding a smoking pipe, intense piercing gaze',
                palette: 'deep crimson red, bone white and warm gold',
                props: 'a lit black candle, scattered red roses, curling smoke'
            },
            'vov-conga': {
                name: 'Vovó Maria Conga',
                scene: 'an elderly dark-skinned grandmother wearing a dark headwrap tied elegantly, a long black dress with delicate red and gold embroidery, holding a wooden rosary in her weathered hands, gentle warm wise smile, silver jewelry',
                palette: 'warm amber gold, deep red and soft cream',
                props: 'a lit candle, a small wooden cross, dried flowers'
            },
            'pai-joao': {
                name: 'Pai João',
                scene: 'a calm dark-skinned man with a short beard wearing a simple black shirt and a dark hat, holding an open leather book, serene confident expression, warm golden rim light',
                palette: 'earthy amber, deep brown and warm gold',
                props: 'a lit candle, an open old book, a wooden staff'
            },
            'ze-pelintra': {
                name: 'Seu Zé Pelintra',
                scene: 'a lively dark-skinned man wearing a red and black striped scarf, a black hat tilted playfully, a wide friendly smile, holding playing cards fanned in one hand, charming charismatic energy',
                palette: 'vibrant red, gold and warm amber',
                props: 'a lit candle, scattered playing cards, red roses'
            },
            erê: {
                name: 'Erê Trovazinho',
                scene: 'a small joyful dark-skinned child spirit with bright sparkling eyes, wearing a tiny red and gold outfit with a small pointed hat, playful mischievous smile, holding a tiny golden star',
                palette: 'bright gold, warm red and light cream',
                props: 'a lit candle, tiny golden stars, colorful smoke'
            },
           auto: {
                name: 'a Guardiã',
                scene: 'a dignified dark-skinned woman wearing an elegant black headwrap with a deep red band and gold jewelry, wearing a black robe with red and gold accents, holding a black staff, serious wise expression',
                palette: 'deep crimson red and warm gold',
                props: 'a lit black candle with warm golden flame, red roses, rising smoke'
            },
            exu: {
                name: 'o Exu',
                scene: 'a dignified dark-skinned man wearing a black fedora hat with a deep RED hatband and a red feather accent, dressed in an elegant black suit with red beaded necklace and red accents, holding a black cane, serious confident expression',
                palette: 'deep crimson red, black and warm gold',
                props: 'a lit black candle, red roses, curling smoke'
            },
            default: {
                name: 'a Guardiã',
                scene: 'a dignified dark-skinned woman wearing an elegant black headwrap with a deep red band and gold jewelry, wearing a black robe with red and gold accents, serious wise expression',
                palette: 'deep crimson red and warm gold',
                props: 'a lit black candle with warm golden flame, red roses, rising smoke'
            }
        },
        /**
         * Detecta qual entidade (Pombagira, Vovó Conga, Pai João, Zé Pelintra, Erê...)
         * está sendo citada na frase, para desenhar o personagem e a paleta certos.
         */
        detectEntity(phrase) {
            const t = String(phrase || '')
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '');

            const rules = [
                { id: 'pombagira', re: /\b(pombagira|caveira|maria caveira|pretinha|maria pretinha)\b/ },
                { id: 'vov-conga', re: /\b(vovo|vovô|maria conga|maria conga|conga|dona conga)\b/ },
                { id: 'pai-joao', re: /\b(pai joao|pai joao|joao|Seu Joao|padre joao)\b/ },
                { id: 'ze-pelintra', re: /\b(ze pelintra|seu ze|ze|ze do burro|pelintra)\b/ },
                { id: 'ere', re: /\b(ere|ere_|trovazinho|erê|trovazinho|cabrai|caboclo)\b/ },
                { id: 'exu', re: /\b(exu|tiriri|tranca-rua|tranca rua|exu tiriri|barba)\b/ }
            ];

            for (const r of rules) {
                if (r.re.test(t)) return r.id;
            }
            return 'auto';
        },
        build(phrase, o) {
            const ent = this.entities[o.entityId] || this.entities.auto;
            return [
                'A cinematic vertical social media poster, portrait 4:5 format, extremely dark moody atmosphere with deep black background and warm golden accents.',
                '',
                `PHRASE TO RENDER EXACTLY: "${o.phraseForPrompt}"`,
                '',
                'TITLE: the leading name of the phrase (e.g. "Pombagira Maria Caveira", "Vovó Maria Conga") is rendered at the TOP RIGHT in a large expressive GOLD BRUSH SCRIPT calligraphy, thick hand-painted strokes, slight ink texture, very decorative and elegant.',
                'BODY: the teaching that follows is rendered in the CENTER RIGHT in an elegant high-contrast CREAM SERIF typeface, mixed weights with the most important word highlighted in gold, thin elegant gold horizontal rules separating the blocks.',
                '',
                `SUBTITLE: at the BOTTOM LEFT a short uppercase letter-spaced cream sans-serif tagline in two lines, framed by thin gold corner brackets.`,
                '',
                `CHARACTER: on the LEFT HALF, ${ent.scene}, dramatic side lighting with warm golden rim light.`,
                `PROPS: ${ent.props}.`,
                `PALETTE: ${ent.palette}.`,
                '',
                'DECORATIVE: thin gold ornamental glyphs separating text blocks, a small gold diamond ornament, delicate gold fleur-de-lis motif, subtle dark red paint-brush stroke accents in the top-left and bottom-right corners.',
                '',
                'TONE: very dark low-key lighting, black and deep crimson red with warm gold highlights, cinematic contrast, shallow depth of field, subtle film grain.',
                '',
                watermarkBlock(o.watermark),
                '',
                'STYLE: luxury editorial poster, cinematic portrait photography blended with elegant gold typography, high-end branding aesthetic, ultra detailed, masterpiece.',
                '',
                'AVOID: bright backgrounds, cartoon style, flat vector art, cheerful colors, blurry text, misspelled words, gibberish letters, extra fingers, deformed hands, cheap clipart, neon colors.'
            ].join('\n');
        }
    }
];

/* ─────────────────────────  API PÚBLICA  ───────────────────────── */

/** Retorna a definição do estilo a partir do valor persistido. */
export function getCardStyle(styleValue) {
    if (typeof styleValue !== 'string') return null;

    const norm = (t) => String(t)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

    const n = norm(styleValue);

    return CARD_STYLES.find(s => {
        // correspondência exata do valor persistido (caso normal)
        if (norm(s.value) === n) return true;
        // o id do estilo aparece dentro do valor (ex: "... carta 3d ...")
        if (n.includes(norm(s.id))) return true;
        // compatibilidade com o valor antigo do kawaii
        if (s.id === 'kawaii' && n.includes('card de frase')) return true;
        return false;
    }) || null;
}

/** Detecta se o visual_identity usa algum dos estilos com texto. */
export function isCardStyle(visualIdentity) {
    if (!visualIdentity) return false;
    const style = (typeof visualIdentity === 'object' ? visualIdentity.style : visualIdentity);
    return !!getCardStyle(style);
}

/**
 * Monta o prompt final do estilo de card.
 *
 * @param {string} phrase        Frase a ser escrita na imagem
 * @param {string} styleValue    Valor persistido em visual_identity.style
 * @param {object} opts
 * @param {string} [opts.emotion]   id de emoção (padrão 'auto')
 * @param {string} [opts.watermark] @handle opcional
 * @returns {string|null} prompt pronto para o gerador de imagens
 */
export function buildCardPrompt(phrase, styleValue, opts = {}) {
    const style = getCardStyle(styleValue);
    if (!style) return null;

    const provider = String(opts.provider || opts.imageProvider || 'auto').toLowerCase().trim();
    const isOpenAI = provider === 'openai';

    const emotion = style.hasEmotion ? (opts.emotion || 'auto') : 'auto';
    const cleanPhrase = toUpper(String(phrase || '').trim()).replace(/\s+/g, ' ').trim();
    const lines = wrapPhrase(cleanPhrase);

    // Se o provedor NÃO for OpenAI (ex: Pollinations, Cloudflare, etc.),
    // pedimos à IA apenas a ilustração de fundo fofa sem texto ("NO TEXT, NO WORDS"),
    // deixando espaço limpo acima do personagem para o nosso gerador tipográfico estampar perfeitamente!
    if (!isOpenAI) {
        if (style.id === 'kawaii') {
            const scene = style.scenes ? (style.scenes[emotion] || style.scenes.auto) : '';
            const palette = style.palettes ? (style.palettes[emotion] || style.palettes.auto) : 'soft warm cream';
            return [
                'A cute social media card background, square 1:1, flat pastel vector illustration style.',
                `BACKGROUND: clean solid flat ${palette} with very soft warm pastel tone, generous empty space on the entire upper 55% of the frame.`,
                'LAYOUT: the lower center 45% holds ONE adorable kawaii chibi character — a simple round white blob-like baby creature with a chubby body, tiny arms, big glossy sparkling anime eyes and pink blush on cheeks.',
                `CHARACTER POSE: ${scene}.`,
                'ACCENT: a few tiny floating soft pastel sparkles and small pastel hearts around the character.',
                'STYLE: adorable kawaii flat illustration, clean vector shapes, soft cel shading, thick friendly outlines, empty clean upper background area.',
                'CRITICAL: NO TEXT, NO WORDS, NO LETTERS, NO TYPOGRAPHY, NO WATERMARK anywhere in the image.'
            ].join('\n');
        }

        if (style.id === 'carta_3d') {
            const scene = style.scenes ? (style.scenes[emotion] || style.scenes.auto) : '';
            const palette = style.palettes ? (style.palettes[emotion] || style.palettes.auto) : 'warm cream and peach';
            return [
                'A 3D Pixar style scene, square 1:1, golden hour lighting.',
                'SCENE: an adorable 3D character with big expressive eyes and soft warm lighting standing next to a rustic wooden table.',
                `POSE: ${scene}.`,
                'ON THE TABLE: an elegant cream paper, white envelope with red wax heart, ceramic mug, soft pink petals.',
                'BACKGROUND: warm dreamy golden hour sunset bokeh, soft light flares.',
                `PALETTE: ${palette}.`,
                'STYLE: 3D Pixar style render, soft lighting, depth of field, high resolution.',
                'CRITICAL: NO TEXT, NO WRITING, NO LETTERS, blank clean paper, NO WORDS anywhere.'
            ].join('\n');
        }

        if (style.id === 'caderno') {
            return [
                'A realistic top-down photograph of an open spiral notebook with a blank clean off-white page, square 1:1.',
                'THE NOTEBOOK: spiral metal rings visible on the left margin, empty clean lined paper with generous blank space in the center.',
                'LIGHT: soft natural morning sunlight casting gentle shadows.',
                'CRITICAL: completely BLANK clean notebook paper, NO TEXT, NO WRITING, NO HANDWRITING, NO WORDS, NO LETTERS.'
            ].join('\n');
        }

        if (style.id === 'minimalista') {
            return [
                'A clean minimalist editorial background, pure warm white and cream flat empty surface, elegant studio soft lighting, generous empty space, square 1:1, NO TEXT, NO WORDS, NO OBJECTS.'
            ].join('\n');
        }

        if (style.id === 'papel_rasgado') {
            return [
                'A moody realistic photograph of a clean blank torn sheet of off-white paper with deckled edges, lying centered on a dark charcoal textured background, square 1:1.',
                'CRITICAL: completely BLANK clean paper, NO TEXT, NO WRITING, NO WORDS, NO LETTERS.'
            ].join('\n');
        }

        if (style.id === 'sabedoria_eres') {
            const entityId = style.detectEntity(phrase);
            const ent = style.entities[entityId] || style.entities.auto;
            return [
                'A cinematic vertical portrait 4:5 image, extremely dark and moody, deep black background with warm golden light accents and faint smoke.',
                '',
                'COMPOSITION: the RIGHT HALF of the frame is DARK, EMPTY and clean — reserved negative space for typography. The LEFT HALF holds the character.',
                '',
                `CHARACTER: ${ent.scene}, dramatic warm side lighting with golden rim light.`,
                `PROPS: ${ent.props}, placed on the LEFT side.`,
                `PALETTE: ${ent.palette}, very dark low-key tones.`,
                '',
                'DECORATIVE: a small lit candle with warm golden flame near the bottom LEFT, deep red roses, thin subtle gold ornamental corner brackets at the top-right and bottom-left, subtle dark red paint-brush stroke accents in the top-left corner.',
                '',
                'STYLE: cinematic portrait photography, luxury editorial poster background, shallow depth of field, subtle film grain, ultra detailed.',
                '',
                'CRITICAL: absolutely NO TEXT, NO WORDS, NO LETTERS, NO TYPOGRAPHY, NO NUMBERS anywhere in the image. The right half must stay clean and dark.'
            ].join('\n');
        }
    }

    return style.build(cleanPhrase, {
        phraseForPrompt: lines.length ? lines.join(' | ') : cleanPhrase,
        emotion,
        entityId: style.detectEntity ? style.detectEntity(cleanPhrase) : 'auto',
        scene: style.scenes ? (style.scenes[emotion] || style.scenes.auto) : '',
        palette: style.palettes ? (style.palettes[emotion] || style.palettes.auto) : '',
        watermark: opts.watermark || ''
    });
}

/** Ids de emoção permitidos para um estilo (todos, quando hasEmotion=false). */
export function emotionsForStyle(styleValue) {
    const style = getCardStyle(styleValue);
    return (style && style.hasEmotion) ? EMOTIONS : EMOTIONS.slice(0, 1);
}

export default {
    EMOTIONS,
    CARD_STYLES,
    getCardStyle,
    isCardStyle,
    buildCardPrompt,
    emotionsForStyle,
    normalizeDetectedEmotion,
    buildCardNegativePrompt
};