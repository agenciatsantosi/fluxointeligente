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

    /* ─────────── 6. SABEDORIA DAS ERES (arte espiritual da Umbanda) ─────────── */
    {
        id: 'sabedoria_eres',
        value: 'Sabedoria das Eres da Umbanda, arte espiritual hiper-realista quadrada, entidade da frase à direita e texto à esquerda',
        label: '🔥 Sabedoria das Eres (arte espiritual da Umbanda)',
        hasEmotion: false,

        /**
         * Cada entidade tem descrição visual COMPLETA e inequívoca.
         * O gerador (FLUX/SD) precisa ler isto nos primeiros tokens do prompt,
         * por isso as descrições são curtas e muito específicas.
         */
        entities: {
            'pai-joao': {
                name: 'Pai João',
                scene: 'Pai João, Preto Velho da Umbanda. An ELDERLY black man, 75 years old, FULL WHITE BEARD, deep wrinkles, dark brown skin. He wears a PURE WHITE long-sleeved linen shirt and a PURE WHITE robe — the fabric is WHITE, bright WHITE, luminous WHITE, not dark, not blue, not black. He wears a WHITE felt fedora hat on his head. Long WHITE wooden-bead necklace on his chest. He sits calmly holding a WHITE wooden staff. Serene wise expression',
                palette: 'pure white clothing, warm brown skin, soft dark brown background, amber candlelight',
                props: 'a single lit candle, a plain clay cup on a wooden table, soft smoke'
            },
            'vovo-conga': {
                name: 'Vovó Maria Conga',
                scene: 'Vovó Maria Conga, Ialorixá do Congo. An ELDERLY black woman, 80 years old, deep wrinkles, calm dignified face. She wears a PURE WHITE long-sleeved robe — the fabric is WHITE, bright WHITE, not dark, not black. A WHITE headwrap (turban) on her head. Silver jewelry and a wooden rosary in her hands. Gentle warm smile',
                palette: 'pure white robe, warm brown skin, soft dark background, amber candlelight, silver',
                props: 'a single lit candle, a small wooden cross, soft smoke'
            },
            'ze-pelintra': {
                name: 'Seu Zé Pelintra',
                scene: 'Seu Zé Pelintra, Preto Velho trapueteiro. A cheerful older black man, 65 years old, WHITE mustache, wide joyful smile. He wears a RED and BLACK striped scarf around his neck, a WHITE long-sleeved shirt, and a LIGHT CREAM felt hat on his head. He holds PLAYING CARDS fanned in one hand',
                palette: 'bright RED, WHITE, warm amber, gold, dark background',
                props: 'a single lit candle, a fan of playing cards, soft smoke'
            },
            'pombagira': {
                name: 'Pombagira Maria Caveira',
                scene: 'Pombagira Maria Caveira, a feared Pombagira. A majestic black woman, 60 years old. She wears a BLACK VEIL covering her hair, a BLACK wide-brimmed hat, and a pure BLACK dress with RED trim. Pale skull-like white paint on her forehead and chin, red lipstick, piercing intense eyes. She holds a lit smoking pipe',
                palette: 'pure BLACK, deep crimson RED, bone white, dark background, warm gold',
                props: 'a single lit candle, scattered red roses, curling smoke'
            },
            exu: {
                name: 'Exu Tiriri',
                scene: 'Exu Tiriri, an Exu (male spirit of the crossroads). A muscular black man, 40 years old, short black beard. He wears a BLACK FEDORA hat with a RED band, a DEEP RED shirt, RED beaded necklace (guias) and RED beads on his wrists. He leans forward with an intense bold gaze, holding a black walking cane',
                palette: 'fiery RED, BLACK, gold, dark background, smoke grey',
                props: 'a single lit red candle, a red scarf, swirling smoke'
            },
            'erê': {
                name: 'Erê Trovazinho',
                scene: 'Erê Trovazinho, a joyful Erê child spirit. A happy black child, 7 years old, bright sparkling eyes, playful mischievous grin. He wears a pure RED and GOLD outfit with a small pointed GOLD hat, holding a small golden star in one hand',
                palette: 'bright GOLD, cheerful RED, light cream, dark background, soft pastel',
                props: 'a single lit candle, tiny golden stars floating, colorful light smoke'
            },
            caboclo: {
                name: 'Caboclo',
                scene: 'Caboclo, an Indigenous Caboclo entity. A noble indigenous black man, 50 years old, straight black hair, a FEATHERED headdress (cocar de penas) on his head. He wears beaded necklaces and a woven cloak, holding a smoking pipe, proud dignified gaze',
                palette: 'earthy ochre, deep brown, turquoise, gold, dark background',
                props: 'a single lit candle, a wooden bow, tobacco smoke'
            },
            'preto-velho': {
                name: 'Pretos-Velho',
                scene: 'a Preto Velho master. An elderly black man, 80 years old, FULL WHITE BEARD, deeply wrinkled face. He wears a PURE WHITE long-sleeved robe - the fabric is WHITE, bright WHITE, not dark, not black. A WHITE cap on his head. He holds an open book, calm serene wise expression',
                palette: 'pure WHITE clothing, warm brown skin, soft dark background, amber candlelight',
                props: 'a single lit candle, an open book, a wooden pipe'
            },
            baiano: {
                name: 'O Baiano',
                scene: 'O Baiano, a warm folk entity. A friendly older black man, 60 years old, big WHITE mustache, warm welcoming smile. He wears a WHITE long-sleeved linen shirt, a colorful woven sash and a STRAW hat on his head',
                palette: 'warm cream, straw yellow, soft red, brown, dark background',
                props: 'a single lit candle, a rustic wooden table, corn and herbs'
            },
            jesus: {
                name: 'Jesus Cristo',
                scene: 'Jesus Christ. A compassionate Middle-Eastern man, 33 years old, long dark-brown hair, short beard, gentle serene expression. He wears a PURE WHITE robe with a soft light-blue sash, arms slightly open in blessing, warm divine glow behind him',
                palette: 'pure white robe, soft gold divine light, warm brown skin tones, dark background',
                props: 'soft radiant light halo, white lilies, gentle glowing particles'
            },
            auto: {
                name: 'a Guardiã espiritual',
                scene: 'an elder black spiritual guardian, 70 years old, deep wrinkles, calm wise eyes. He wears a PURE WHITE long-sleeved robe - the fabric is WHITE, bright WHITE. A WHITE headwrap on his head. He holds a wooden staff, serene dignified expression',
                palette: 'pure WHITE clothing, warm brown skin, soft dark background, amber candlelight',
                props: 'a single lit candle, rising smoke, sacred stones'
            }
        },

        /**
         * Detecta a entidade citada na frase.
         * A ordem importa: padrões mais específicos ANTES dos genéricos,
         * para "Zé Pelintra" não cair em "Exu" e vice-versa.
         */
        detectEntity(phrase) {
            const t = String(phrase || '')
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '');

            const rules = [
                // Específicos primeiro (nomes únicos)
                { id: 'ze-pelintra', re: /\b(ze pelintra|seu ze pelintra|ze do burro|pelintra)\b/ },
                { id: 'vovo-conga', re: /\b(maria conga|vovo? maria conga|doña conga|dona conga)\b/ },
                { id: 'pai-joao', re: /\b(pai joao|seu pai joao|padre joao)\b/ },
                { id: 'pombagira', re: /\b(pombagira|maria caveira|maria pretinha|caveira|pretinha)\b/ },
                { id: 'exu', re: /\b(exu tiriri|tiriri|tranca rua|tranca-rua|exu)\b/ },
                { id: 'erê', re: /(er[eê]|trovazinho|cabrai|travess[oõ])\b/ },
                { id: 'caboclo', re: /\b(caboclo|caboclos)\b/ },
                { id: 'baiano', re: /\b(baiano|o baiano)\b/ },
                { id: 'jesus', re: /\b(jesus|cristo|nazareno|senhor jesus)\b/ },
                // Genéricos por último
                { id: 'preto-velho', re: /\b(preto velho|preto-velho|preto velhos|pretos velhos)\b/ },
                { id: 'vovo-conga', re: /\b(vovo|vovô)\b/ },
                { id: 'pai-joao', re: /\b(joao)\b/ }
            ];

            for (const r of rules) {
                if (r.re.test(t)) return r.id;
            }
            return 'auto';
        },
        build(phrase, o) {
            const ent = this.entities[o.entityId] || this.entities.auto;
            const words = String(phrase || '').trim().split(/\s+/).filter(Boolean);

            // Separa o NOME da entidade (até o verbo) do restante da frase
            const verbRe = /\b(ensina|diz|lembra|falou|afirma|deixa|come[cç]ou|precisa|pode|n[aã]o|foi|quer|vai|deve|é|e)\b/i;
            let titleWords = [];
            let bodyWords = words;
            for (let i = 1; i < Math.min(words.length, 7); i++) {
                if (verbRe.test(words[i])) { titleWords = words.slice(0, i); bodyWords = words.slice(i); break; }
            }
            if (titleWords.length === 0 || titleWords.length > 5) {
                titleWords = words.slice(0, Math.min(3, words.length));
                bodyWords = words.slice(titleWords.length);
            }
            const entityName = titleWords.join(' ');
            const teaching = bodyWords.join(' ');

            // Palavra-chave (mais longa do corpo) para destaque
            let highlight = '';
            for (const w of bodyWords) {
                const clean = w.replace(/[^\p{L}\p{N}]/gu, '');
                if (clean.length >= 4 && clean.length > highlight.replace(/[^\p{L}\p{N}]/gu, '').length) highlight = clean;
            }

            return [
                'Aja como um diretor de arte sênior, fotógrafo profissional e designer gráfico especializado em artes espirituais hiper-realistas da Umbanda para o Facebook.',
                '',
                `FRASE PARA GERAR A IMAGEM: "${phrase}"`,
                '',
                'INSTRUÇÕES DE GERAÇÃO: interprete automaticamente a frase fornecida, identifique a entidade espiritual mencionada e crie uma única imagem original que represente visualmente o significado da mensagem.',
                '',
                'REPRESENTAÇÃO VISUAL:',
                `ENTIDADE IDENTIFICADA NESTA FRASE: ${ent.name} (linha espiritual ${o.entityId}).`,
                `APARÊNCIA DESTA ENTIDADE: ${ent.scene}.`,
                `CENÁRIO E PROPS: ${ent.props}.`,
                'Represente a entidade de maneira respeitosa e coerente com a tradição, usando aparência humana realista, vestimentas adequadas, expressões naturais e elementos simbólicos pertinentes.',
                '',
                'ESTILO VISUAL:',
                'Fotografia hiper-realista, cinematográfica e profissional. Iluminação dramática e volumétrica, pele com textura natural, anatomia correta, tecidos detalhados, sombras realistas, profundidade de campo e acabamento editorial premium.',
                `Paleta sugerida para esta entidade: ${ent.palette}.`,
                'Escolha automaticamente o cenário, a iluminação, as cores, o enquadramento e os elementos visuais conforme a entidade e o significado da frase.',
                'Cada imagem deve ter uma composição original. Evite repetir poses, cenários e enquadramentos.',
                'Não produza esculturas, estátuas, pinturas, desenhos, gravuras, colagens ou personagens artificiais em 3D.',
                '',
                'TEXTO DA ARTE:',
                `TÍTULO DESTACADO: o nome da entidade "${entityName}" deve receber destaque visual na parte superior, com tipografia elegante, expressiva e de alto contraste.`,
                'Reproduza integralmente a frase fornecida, respeitando todas as palavras, acentos e sinais de pontuação.',
                'Use tipografia elegante, expressiva e altamente legível em celulares. Distribua o texto em linhas equilibradas.',
                'Não altere, resuma, reescreva ou complete a frase.',
                'Não adicione nenhum texto extra: sem slogans, assinaturas, citações inventadas, logotipos, marcas-d\'água, hashtags ou frases de rodapé.',
                '',
                'FORMATO:',
                'Imagem quadrada 1:1, alta resolução, otimizada para o feed do Facebook.',
                'Composição sofisticada, impacto visual, iluminação profissional e excelente contraste entre o texto e o fundo.',
                '',
                'Gere diretamente uma única imagem final. Não apresente explicações ou descrições.',
                '',
                `Prioridades: fidelidade à frase, representação correta da entidade, realismo fotográfico e legibilidade. Entidade desta arte: ${ent.name}. Ensinamento: "${teaching}"${highlight ? `. Palavra-chave a destacar: "${highlight}"` : ''}.`
            ].join('\n');
        }
    },

    /* ─────────── 7. DILEMAS (Engajamento / O que você faria?) ─────────── */
    {
        id: 'dilemas',
        value: 'Dilemas morais e escolhas do cotidiano para engajamento, arte hiper-realista da situação e pergunta provocativa',
        label: '🤔 Dilemas Morais & Cotidiano (o que você faria?)',
        hasEmotion: false,
        categories: [
            { id: 'relacionamentos', label: '💍 Relacionamentos', example: 'VOCÊ PERCEBE QUE A PESSOA QUE AMA ESTÁ INFELIZ...\n❤️ INSISTIR NA CONVERSA\n⏳ ESPERAR O TEMPO DELA' },
            { id: 'ex_termino', label: '💔 Ex & Término (Ex Maldito)', example: 'SEU EX MANDA MENSAGEM DE MADRUGADA COM SAUDADE...\n📱 RESPONDER E CONVERSAR\n🚫 BLOQUEAR E SEGUIR' },
            { id: 'casamento', label: '💒 Casamento & Vida a Dois', example: 'ROTINA DO CASAMENTO ESFRIOU MAS AINDA EXISTE CARINHO...\n🔥 PROPOR UMA MUDANÇA RADICAL\n🕊️ ACEITAR A FASE COM PACIÊNCIA' },
            { id: 'futebol', label: '⚽ Futebol & Rivalidade', example: 'SEU TIME PRECISA DO EMPATE DO MAIOR RIVAL PRA SER CAMPEÃO...\n🏆 TORCER PELO RIVAL\n❌ NUNCA TORCER POR ELES' },
            { id: 'familia', label: '🏡 Família & Conflito', example: 'VOCÊ TEM UM ÚNICO DIA LIVRE NA SEMANA...\n👨‍👩‍👦 VISITAR QUEM ESTÁ COBRANDO\n🛌 DESCANSAR SOZINHO' },
            { id: 'amizade', label: '👥 Amizade & Lealdade', example: 'SUA AMIGA CANCELOU OS PLANOS PELA TERCEIRA VEZ...\n💬 TER UMA CONVERSA SÉRIA\n🚶 SE AFASTAR EM SILÊNCIO' },
            { id: 'dinheiro_trabalho', label: '💼 Dinheiro & Trabalho', example: 'DESCOBRE QUE UM COLEGA TRABALHA MENOS E GANHA O DOBRO...\n📢 COBRAR SEU CHEFE\n🤫 FICAR NA SUA E PRODUZIR' },
            { id: 'financas', label: '💰 Finanças & Escolhas', example: 'SOBROU UM DINHEIRO NO FIM DO MÊS...\n✈️ REALIZAR UM SONHO AGORA\n🏦 GUARDAR PRA UMA EMERGÊNCIA' },
            { id: 'empreendedorismo', label: '🚀 Negócios & Sociedade', example: 'SEU SÓCIO QUER CRESCER RÁPIDO DEMAIS COM RISCO ALTO...\n🛡️ BARRAR E PRESERVAR O CAIXA\n📈 ARRISCAR PRA DOBRAR' },
            { id: 'etica_moral', label: '⚖️ Ética & Verdade', example: 'SEU AMIGO ERROU MAS OUTRO VAI LEVAR A CULPA...\n🗣️ CONTAR A VERDADE\n🤐 GUARDAR O SEGREDO' },
            { id: 'espiritualidade', label: '🕊️ Espiritualidade & Valores', example: 'ALGUÉM QUE TE PREJUDICOU PEDE SUA AJUDA NUM MOMENTO DIFÍCIL...\n🤲 AJUDAR DE CORAÇÃO ABERTO\n✋ RESPEITAR SEUS LIMITES' },
            { id: 'redes_sociais', label: '📱 Redes & Vida Digital', example: 'RECEBE UMA PROVOCAÇÃO PÚBLICA EM UM COMENTÁRIO...\n🛡️ RESPONDER À ALTURA\n🔕 IGNORAR E SEGUIR' },
            { id: 'filhos_criacao', label: '👶 Filhos & Criação', example: 'SEU FILHO QUEBROU UMA REGRA IMPORTANTE...\n📏 SER FIRME NA CONSEQUÊNCIA\n🤗 ACOLHER E CONVERSAR' },
            { id: 'saude_vida', label: '🌿 Saúde & Cansaço', example: 'CORPO PEDE DESCANSO MAS AS METAS ESTÃO ATRASADAS...\n🛌 PARAR TUDO E DORMIR\n☕ TOMAR CAFÉ E VIRAR A NOITE' },
            { id: 'sonhos_metas', label: '🌟 Sonhos & Zona de Conforto', example: 'OPORTUNIDADE DE OURO MAS TENDO QUE RECOMEÇAR DO ZERO...\n🚀 LARGAR TUDO E TENTAR\n🏡 MANTER A SEGURANÇA ATUAL' },
            { id: 'confianca_segredo', label: '🤫 Segredos & Confiança', example: 'DESCOBRIU UM SEGREDO QUE PODE SALVAR SEU AMIGO DE UMA FURADA...\n📢 CONTAR O SEGREDO\n🤐 MANTER A PROMESSA DE SILÊNCIO' }
        ],
        build(phrase, o) {
            const cleanPhrase = String(phrase || '').trim();
            return [
                'A dramatic, emotionally charged social media dilemma card, square 1:1, cinematic photorealism.',
                '',
                `DILEMMA SITUATION: "${cleanPhrase}"`,
                '',
                'COMPOSITION: the subject or situation is positioned primarily on the RIGHT side of the frame.',
                'LEFT SIDE: smooth, dark, deep negative space with gentle atmospheric shadows for bold typography overlay.',
                '',
                'STYLE: hyper-realistic cinematic editorial photograph, shallow depth of field, 85mm lens f/1.8, realistic human expressions depicting moral hesitation, decision making, or deep emotional reflection.',
                'LIGHTING: dramatic chiaroscuro or moody ambient cinematic light, high dynamic range, natural skin textures.',
                '',
                'CRITICAL: NO TEXT, NO LETTERS, NO WORDS, NO WATERMARKS anywhere in the image.'
            ].join('\n');
        }
    },

    /* ─────────── 8. TWITTER/X — UMBANDA (post social espiritual) ─────────── */
    {
        id: 'twitter_x',
        value: 'Card post Twitter X Umbanda, fundo preto, entidade a direita e frase a esquerda',
        label: '🐦 Card Twitter/X — Umbanda',
        hasEmotion: false,
        build(phrase, o) {
            return [
                'A professional social media card in the style of an authentic dark Twitter/X post, square 1:1, 1024x1024, Umbanda spiritual theme featuring the same entity named at the start of the phrase below.',
                '',
                `PHRASE TO RENDER EXACTLY: "${o.phraseForPrompt}"`,
                'Render this phrase EXACTLY as written, letter by letter, no missing, no duplicated and no invented words, preserving every word, accent and punctuation mark. The phrase is the ONLY variable text of the post: never render the literal characters "{{frase}}", replace them with the given text.',
                'The phrase is the hero of the composition, placed prominent on the LEFT and CENTER of the card, in a large elegant highly legible white sans-serif font. Adjust font size and line breaks automatically to the phrase length, never cutting words, never overflowing the card limits.',
                '',
                'VISUAL STYLE: black and charcoal background, cinematic lighting, deep shadows, intense red accents. Mysterious, elegant, spiritual and striking atmosphere. Thin dark-gray borders, rounded corners, authentic Twitter/X post look.',
                '',
                'RIGHT SIDE: a realistic and respectful depiction of the Umbanda entity named in the phrase (e.g. an Erê child with straw hat and colorful guides, a Preto-Velho elder, a Caboclo, a Pombagira or an Exu with black hat — match whoever the phrase names), with subtle smoke and candles in the background.',
                '',
                'TOP LEFT: a circular avatar medallion matching the main image. Beside the avatar write the entity name EXACTLY as it appears at the start of the phrase, followed by its @handle in lowercase without spaces or accents. No verification seals or official badges.',
                '',
                'FOOTER: a thin divider line and discreet Twitter/X-inspired icons — comment, repost, like, bookmark and share — in gray tones, with the heart in red.',
                '',
                'RULES: do not add extra phrases, captions, quotes or watermarks. Never write a fixed name such as "Exu Tiriri" unless the phrase itself names Exu Tiriri. Keep the visual identity consistent. High contrast, professional finish, balanced composition. Preserve the phrase integrally, without summarizing or changing its meaning.',
                '',
                'AVOID: blurry text, misspelled words, gibberish letters, extra limbs, deformed hands, neon colors, brand logos other than the X-style icons described.'
            ].join('\n');
        }
    },

    /* ─────────── 9. CASAL ROMÂNTICO 4:5 (foto vertical + frase manuscrita) ─────────── */
    {
        id: 'casal_romantico',
        value: 'Card casal romantico vertical 4:5, foto cinematografica a esquerda e frase manuscrita a direita',
        label: '💑 Casal Romântico 4:5 (frase manuscrita)',
        hasEmotion: false,
        build(phrase, o) {
            const handle = o.watermark && String(o.watermark).trim() ? String(o.watermark).trim() : '@SEU_PERFIL';
            return [
                'A cinematic, ultra-realistic, emotional vertical 4:5 photograph for a romantic quotes page on social media.',
                '',
                `PHRASE TO RENDER EXACTLY: "${o.phraseForPrompt}"`,
                'Render this phrase EXACTLY as written, letter by letter, no missing, no duplicated and no invented words, without changing a single word. The phrase is the ONLY variable text of the image: never render the literal characters "{{FRASE}}".',
                'Place the phrase centered in the RIGHT region of the image, arranged in short harmonious lines, in a delicate elegant perfectly legible white handwritten script font. Highlight a few important words in a soft salmon/peach tone, keeping the rest white. Respect the margins and never cover the couple.',
                '',
                'MAIN SCENE (LEFT 60% of the frame): a young couple in love in a cozy bedroom at night. The man sits on the bed, shirtless, wearing black pants, gently holding the woman in his arms. The woman wears a simple white t-shirt and black sport shorts with white details. She sits on his lap, legs around his waist, arms around his neck, face close to his, sharing a soft passionate kiss. Natural expressions of affection, intimacy, trust and emotional connection. Realistic anatomy, well-defined hands, natural poses.',
                '',
                'SETTING: elegant cozy bedroom at night, large window behind showing the lit city and the moon in the dark sky. Bed with soft sheets, voluminous neutral-tone blankets and cozy pillows. Small lamps and lit candles on the sides, romantic intimate atmosphere.',
                '',
                'LIGHT AND COLOR: warm cinematic lighting, amber, gold and soft orange tones from the lamps. Cool bluish night light through the window, contrasting warm interior and cold exterior. Soft shadows, depth of field, natural skin reflections, realistic fabric texture, premium photographic finish.',
                '',
                'COMPOSITION: the couple fills ~60% of the LEFT side. The RIGHT 40% holds the phrase over a dark discreet background with excellent legibility. Vertical framing, natural perspective, balanced composition, main focus on the couple.',
                '',
                `BOTTOM DETAIL: below the phrase, a small thin-stroke salmon heart doodle with delicate horizontal side lines. Below it, the discreet identifier "${handle}" in a small elegant font.`,
                '',
                'FINAL STYLE: ultra-realistic romantic photography, premium quality, cozy atmosphere, cinema lighting, natural skin detail, sophisticated textures, warm enveloping colors, visual depth, viral love-quotes aesthetic for Instagram and Facebook.',
                '',
                'RULES: no titles, no extra watermarks, no random texts, no unnecessary graphic elements. Reproduce the composition faithfully. Prioritize text legibility and the natural look of the couple.',
                '',
                'FORMAT: vertical 4:5 portrait, high resolution.',
                '',
                'AVOID: blurry text, misspelled words, gibberish letters, deformed anatomy, extra fingers, distorted faces, harsh flash, neon colors.'
            ].join('\n');
        }
    },

    /* ─────────── 10. ROMÂNTICO ILUSTRADO 1:1 (frase no topo + ilustração delicada) ─────────── */
    {
        id: 'romantico_ilustrado',
        value: 'Card romantico ilustrado para redes sociais, frase no topo e ilustração digital delicada',
        label: '💕 Romântico Ilustrado (frase + desenho)',
        hasEmotion: false,
        build(phrase, o) {
            return [
                'A delicate romantic digital illustration for social media love-quote pages (Instagram, Facebook, Pinterest), square 1:1, 1024x1024.',
                '',
                `PHRASE TO RENDER EXACTLY ON THE TOP: "${o.phraseForPrompt}"`,
                'Render this phrase EXACTLY as written, letter by letter, centered on the UPPER part of the image, in a strong elegant highly legible serif editorial font. Main text in dark brown or black; highlight a few important words in burnt red or wine. Small decorative drawn hearts on the sides when fitting. Auto-adjust font size and line breaks, never cut words, never cover faces, never overflow.',
                'If the received phrase includes a signature or authorship, preserve it exactly. Never invent author names. The phrase is the ONLY variable text: never render the literal characters "{{frase}}".',
                '',
                'MAIN SCENE (LOWER two thirds): for love/affection phrases, a cozy adult couple cuddled in bed in a quiet tender moment — dark-haired man, brown-haired woman, lying side by side in a delicate embrace, eyes closed, comfort and trust. Old-rose, beige and mauve sheets, cozy bedroom, golden sunset light through a window, small decorative hearts. Tender non-explicit intimacy, no nudity.',
                'Adapt the scene when the phrase is not romantic: friendship (friends showing affection), family (warm family scene), self-esteem (confident contemplative character), overcoming (character before a lit window / new horizon), saudade (contemplative setting), reflection (delicate symbolic composition).',
                '',
                'STYLE: semi-realistic digital illustration, romantic animation finish, soft clean lines, delicate shadows, warm light, pastel tones (rose, peach, beige, brown), natural well-drawn faces, cozy nostalgic emotional atmosphere. NOT photorealistic.',
                '',
                'RULES: square balanced composition, phrase prominent on top, illustration conveying the emotion, professional ready-to-post finish.',
                '',
                'AVOID: blurry text, misspelled words, gibberish letters, deformed anatomy, extra fingers, photorealism, explicit nudity.'
            ].join('\n');
        }
    },

    /* ─────────── 11. CRISTÃO CINEMATOGRÁFICO 4:5 (FOCO EM CRISTO) ─────────── */
    {
        id: 'cristao_cinematografico',
        value: 'Card cristão cinematográfico 4:5, personagem bíblico realista, frase no topo esquerdo, marca FOCO EM CRISTO no rodapé',
        label: '✝️ Cristão Cinematográfico 4:5 (Foco em Cristo)',
        hasEmotion: false,
        build(phrase, o) {
            return [
                'A cinematic ultra-realistic Christian Bible art card for social media, vertical 4:5 portrait, 1080x1350.',
                '',
                `PHRASE TO RENDER EXACTLY TOP-LEFT: "${o.phraseForPrompt}"`,
                'Render this phrase EXACTLY as written, letter by letter, in the UPPER LEFT area of the image, in a strong elegant serif editorial font (like Trajan, Cinzel, or Garamond). Main text in navy blue or black; highlight key words in gold-brown. Ensure sufficient contrast with a subtle light overlay behind text. Auto-wrap lines, never cut words, never cover the main character\'s face.',
                'If the received phrase includes a biblical reference (book chapter:verse), preserve it exactly. Never invent references.',
                '',
                'MAIN CHARACTER (RIGHT 60%): based on the phrase, identify the biblical character and scene. If Jesus is mentioned, portray Jesus Christ with Semitic features, beard, robes, compassionate/authoritative expression appropriate to the passage. If Moses: elderly, long beard, beige/brown robes, staff, head covering. If David: shepherd/king attire, harp or sling. If Paul: Roman citizen attire, scrolls. Adapt faithfully to the specific passage — DO NOT mix characters or events from different passages.',
                '',
                'SCENE (RIGHT 60% + BACKGROUND): grand biblical landscape — rocky mountains, dramatic sky, golden sun rays breaking through clouds, volumetric lighting. If Exodus 14:14 / Red Sea: Moses in foreground with staff, Hebrew people behind, towering walls of water on both sides with foam and depth. For other passages: appropriate biblical setting (Gethsemane, Calvary, Mount Sinai, Sea of Galilee, Jerusalem, wilderness, throne room of heaven, etc.). Epic, reverent, emotional atmosphere.',
                '',
                'BRAND MARK (BOTTOM-LEFT): a discreet circular emblem — black circle with gold outline, white cross over open book symbol, text "FOCO EM CRISTO" with "CRISTO" in gold, subtitle "LEVANDO A MENSAGEM DE JESUS" in small gold text. Well aligned, not competing with main phrase.',
                '',
                'STYLE: photorealistic cinematic, 8K, dramatic volumetric lighting, natural skin texture, correct anatomy, detailed fabric, stone, water. Shallow depth of field where appropriate. Editorial poster finish.',
                '',
                'FORMAT: vertical 4:5 portrait, high resolution.',
                '',
                'DO NOT: cartoon, illustration, painting, drawing, caricature, childish art, artificial 3D, distorted faces, deformed hands, extra fingers, blurry.',
                'DO NOT: any text, words, letters, numbers, typography, watermark, logo, signature in the AI-generated background (the phrase and brand mark are overlaid later in vector).',
                '',
                'CRITICAL: NO TEXT, NO WORDS, NO LETTERS, NO TYPOGRAPHY anywhere in the background image.'
            ].join('\n');
        }
    },

    /* ─────────── 12. BÍBLIA ABERTA CINEMATOGRÁFICA 4:5 (Caminho da Fé) ─────────── */
    {
        id: 'biblia_aberta_cinematografica',
        value: 'Card cristão cinematográfico 4:5, Bíblia aberta gigante central, céu dramático com luz celestial, vale rochoso com caminho e pegadas douradas, frase nas páginas',
        label: '📖 Bíblia Aberta Cinematográfica 4:5 (Caminho da Fé)',
        hasEmotion: false,
        build(phrase, o) {
            return [
                'A cinematic ultra-realistic Christian spiritual art card for social media, vertical 4:5 portrait, 1080x1350.',
                '',
                `PHRASE TO RENDER EXACTLY ON THE OPEN BIBLE PAGES (CENTER): "${o.phraseForPrompt}"`,
                'Render this phrase EXACTLY as written, letter by letter, centered on the illuminated pages of the huge open Bible in the middle of the composition, in a large elegant serif font (like Trajan, Cinzel, Garamond, or Times New Roman). Main text in black or dark brown, highly legible on the glowing beige pages. Auto-wrap lines to fit the page width, never cut words, never alter the text. If the phrase includes a biblical reference (book chapter:verse), preserve it exactly. Never invent references. The phrase is the ONLY variable text: never render the literal characters "{{frase}}".',
                '',
                'COMPOSITION (TOP TO BOTTOM):',
                '',
                '1. UPPER THIRD — DRAMATIC SKY: dense dark storm clouds (deep grays, charcoal, midnight blue) dramatically parted by intense volumetric GOLDEN CELESTIAL LIGHT breaking through — crepuscular rays (god rays) streaming downward, illuminating everything below. Subtle golden light particles / dust motes floating in the air, creating a divine, hopeful, ethereal atmosphere. Cinematic contrast between darkness and divine light.',
                '',
                '2. MIDDLE (CENTER) — HUGE OPEN BIBLE: a massive ancient Bible seen straight-on, perfectly centered, pages glowing from the celestial light above. Pages in aged beige/parchment tones with realistic paper texture, subtle fiber, slight curling at edges, faint handwritten-style lettering impressions visible but not readable. The Bible spine visible at center, thick leather binding in deep brown with subtle gold tooling. The light from above illuminates the pages directly — this is where the phrase will be overlaid in vector later. The Bible sits naturally integrated into the landscape, not floating.',
                '',
                '3. LOWER THIRD — VAST ROCKY VALLEY: below the Bible, a sweeping biblical wilderness valley stretches toward the horizon. Rugged mountains, rocky cliffs, canyons, earth tones (ochre, sienna, umber, burnt umber, golden sand). A NARROW WINDING PATH leads from the foreground (below the Bible) into the distance toward the illuminated horizon. ON THE PATH: subtle GOLDEN-ILLUMINATED HUMAN FOOTPRINTS, integrated into the rocky ground — each step glowing faintly with divine gold light, symbolizing the walk of faith, perseverance, God\'s presence. The footprints are realistic impressions in the dust/stone, not stickers or artificial overlays. Atmospheric perspective: distant mountains fade into golden haze.',
                '',
                'LIGHTING & ATMOSPHERE: volumetric golden sun rays (crepuscular rays) piercing clouds, dramatic chiaroscuro, photorealistic textures (rock, paper, leather, dust), atmospheric depth, subtle floating golden particles, sense of faith, comfort, protection, hope, overcoming. Epic cinematic scale. Reverent, emotional, spiritual.',
                '',
                'STYLE: photorealistic cinematic, 8K, masterful volumetric lighting, correct anatomy of zero characters (no people, no figures — only the Bible, the landscape, the path, the footprints). Natural textures throughout. Editorial poster finish.',
                '',
                'FORMAT: vertical 4:5 portrait, high resolution.',
                '',
                'DO NOT: cartoon, illustration, painting, drawing, caricature, childish art, artificial 3D, distorted elements, deformed hands, extra fingers, blurry, people, Jesus, Moses, angels, crosses, religious figures, halos, haloes, churches, stained glass.',
                'DO NOT: any text, words, letters, numbers, typography, watermark, logo, signature in the AI-generated background (the phrase on the Bible pages is overlaid later in vector).',
                '',
                'CRITICAL: NO TEXT, NO WORDS, NO LETTERS, NO TYPOGRAPHY anywhere in the background image. NO HUMAN FIGURES, NO RELIGIOUS FIGURES. Only the Bible, the sky, the light, the valley, the path, the golden footprints.'
            ].join('\n');
        }
    },

    /* ─────────── 13. EDUCATIVO UNIVERSAL 1:1 (dica + produto) ─────────── */
    {
        id: 'educativo_universal',
        value: 'Card educativo universal 1:1, dica pratica com titulo no topo, blocos de conteudo, interacao e produto com link na bio',
        label: '📚 Educativo Universal 1:1 (dica + produto)',
        hasEmotion: false,
        build(phrase, o) {
            return [
                'A professional educational social media card background, square 1:1, 1080x1080, photorealistic.',
                '',
                'COMPOSITION: full-bleed appetizing photorealistic scene related to the theme (food, kitchen, lifestyle, spirituality, business, beauty, health — matching the phrase topic). MAIN SUBJECT occupies the RIGHT 55% of the frame, sharp, vibrant, high detail.',
                'LEFT 45%: the same scene heavily blurred with a smooth dark gradient overlay (deep dark tones, low detail, soft, clean copy space for typography). BOTTOM 15%: darker gradient band for footer legibility.',
                '',
                'STYLE: professional food/lifestyle photography, warm appetizing light, shallow depth of field, ultra detailed, editorial finish.',
                '',
                'FORMAT: square 1:1, high resolution.',
                '',
                'DO NOT: cartoon, illustration, drawing, caricature, distorted faces, deformed hands, extra fingers, blurry main subject.',
                'DO NOT: any text, words, letters, numbers, typography, watermark, logo, signature in the image (all texts are overlaid later in vector).',
                '',
                'CRITICAL: NO TEXT, NO WORDS, NO LETTERS, NO TYPOGRAPHY anywhere in the background image.'
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
                // ⚠️ Prompt curto: FLUX/SD ignoram o meio/fim de prompts longos.
                // A identidade visual vem PRIMEIRO e as cores são repetidas
                // para o gerador não "escolher" outra paleta.
                `SUBJECT: ${ent.scene}.`,
                `COLOR PALETTE: ${ent.palette}.`,
                `PROPS: ${ent.props}.`,
                '',
                'PLACE THE SUBJECT ON THE RIGHT HALF of the frame.',
                'LEFT HALF: plain smooth dark background, empty, no scenery, no landscape, no pattern, no mosaic, no texture, no frame, no ornament. Solid dark color only.',
                'Overall mood: dark, nighttime, low-key lighting, deep shadows, most of the frame in darkness.',
                '',
                'STYLE: hyper-realistic cinematic photograph, dramatic volumetric lighting, natural skin texture, correct anatomy, detailed fabric, shallow depth of field, premium editorial finish, ultra detailed.',
                '',
                'FORMAT: square 1:1, high resolution.',
                '',
                'DO NOT: statues, sculptures, paintings, drawings, engravings, collages, artificial 3D characters, distorted faces, melted faces, deformed hands, extra fingers, blurry.',
                'DO NOT: any text, words, letters, numbers, typography, watermark, logo, signature.',
                '',
                'CRITICAL: NO TEXT, NO WORDS, NO LETTERS, NO TYPOGRAPHY anywhere.'
            ].join('\n');
        }

        if (style.id === 'twitter_x') {
            // Fundo por CONTEXTO da frase: mesma detecção de entidade do sabedoria_eres
            // (Erê -> criança Erê, Jesus -> Jesus, Exu -> Exu, etc.)
            const sabedoria = CARD_STYLES.find(s => s.id === 'sabedoria_eres');
            const entityId = (sabedoria && sabedoria.detectEntity) ? sabedoria.detectEntity(phrase) : 'auto';
            const ent = (sabedoria && sabedoria.entities[entityId]) || { scene: 'a spiritual guardian', palette: 'dark background, candlelight', props: 'soft smoke' };
            return [
                // ⚠️ Prompt curto: FLUX/SD ignoram o meio/fim de prompts longos.
                // A identidade visual vem PRIMEIRO; o texto (avatar, frase,
                // rodapé) é estampado depois em vetor — aqui só o fundo, SEM texto.
                `SUBJECT: ${ent.scene}.`,
                `COLOR PALETTE: ${ent.palette}.`,
                `PROPS: ${ent.props}.`,
                '',
                'LAYOUT: an authentic dark Twitter/X post mockup, square 1:1. Thin dark-gray rounded post frame inset from the edges.',
                'PLACE THE SUBJECT ON THE RIGHT HALF of the frame.',
                'LEFT HALF: plain smooth dark background, empty, no scenery, no landscape, no pattern, no mosaic, no texture, no frame, no ornament. Solid dark color only, clean space for typography.',
                'TOP LEFT: a circular avatar medallion with a shadowy silhouette, empty medallion, no face detail needed.',
                'BOTTOM: a thin horizontal divider line and a row of small minimal abstract gray UI glyph shapes (bubble, arrows, heart, ribbon, upload), purely decorative, nothing that looks like letters.',
                'Overall mood: dark, mysterious, cinematic low-key lighting, deep shadows, most of the frame in darkness.',
                '',
                'STYLE: hyper-realistic cinematic photograph, dramatic volumetric lighting, natural skin texture, correct anatomy, detailed fabric, shallow depth of field, premium editorial finish, ultra detailed.',
                '',
                'FORMAT: square 1:1, high resolution.',
                '',
                'DO NOT: statues, sculptures, paintings, drawings, engravings, collages, artificial 3D characters, distorted faces, melted faces, deformed hands, extra fingers, blurry.',
                'DO NOT: any text, words, letters, numbers, typography, watermark, logo, signature.',
                '',
                'CRITICAL: NO TEXT, NO WORDS, NO LETTERS, NO TYPOGRAPHY anywhere.'
            ].join('\n');
        }

        if (style.id === 'casal_romantico') {
            return [
                // ⚠️ Prompt curto: FLUX/SD ignoram o meio/fim de prompts longos.
                // O texto (frase, coração, handle) é estampado depois em vetor.
                'SUBJECT (LEFT 60%): a young couple in love in a cozy bedroom at night. A shirtless man in black pants sits on the bed holding a woman in his arms. The woman wears a simple white t-shirt and black sport shorts, sitting on his lap, arms around his neck, sharing a soft kiss. Natural affectionate expressions, realistic anatomy, well-defined hands.',
                'COLOR PALETTE: warm amber, gold, soft orange lamplight, cool blue night window light, neutral bedding tones, dark shadows.',
                'PROPS: bed with soft sheets and pillows, lit candles, small lamps, large window with lit city and moon.',
                '',
                'LAYOUT: vertical 4:5 cinematic photograph. The couple fills the LEFT 60% of the frame.',
                'RIGHT 40%: plain smooth dark background, empty, no scenery, no landscape, no pattern, no mosaic, no texture, no frame, no ornament. Solid dark color only, clean space for typography.',
                'BOTTOM RIGHT: a small thin-stroke heart doodle shape with two short horizontal side lines, purely decorative, nothing that looks like letters.',
                'Overall mood: romantic, intimate, cozy, warm cinematic night.',
                '',
                'STYLE: ultra-realistic romantic photography, warm cinematic lighting, natural skin texture, correct anatomy, detailed fabric, shallow depth of field, premium editorial finish, ultra detailed.',
                '',
                'FORMAT: vertical 4:5 portrait, high resolution.',
                '',
                'DO NOT: statues, sculptures, paintings, drawings, engravings, collages, artificial 3D characters, distorted faces, deformed hands, extra fingers, blurry.',
                'DO NOT: any text, words, letters, numbers, typography, watermark, logo, signature.',
                '',
                'CRITICAL: NO TEXT, NO WORDS, NO LETTERS, NO TYPOGRAPHY anywhere.'
            ].join('\n');
        }

        if (style.id === 'romantico_ilustrado') {
            return [
                // Ilustração delicada full-bleed; o terço superior fica claro e
                // suave para a frase (estampada depois em vetor). SEM texto.
                'SUBJECT (LOWER two thirds): a cozy adult couple cuddled in bed in a quiet tender moment. A dark-haired man and a brown-haired woman lying side by side in a delicate embrace, eyes closed, serene comfort and trust. Old-rose, beige and mauve sheets and blankets, cozy bedroom with simple headboard and soft pillows, golden sunset light through a window, tiny decorative hearts. Tender non-explicit intimacy, correct anatomy, well-defined hands.',
                'COLOR PALETTE: pastel rose, peach, beige, soft brown, warm golden light, cream.',
                'PROPS: soft pillows, warm blankets, window glow, floating heart doodles.',
                '',
                'LAYOUT: square 1:1 romantic digital illustration. UPPER THIRD: soft light pastel blurred empty background (cream, peach, pale rose), smooth, no objects, no faces, clean space for typography. LOWER TWO THIRDS: the couple scene, faces never covered.',
                '',
                'STYLE: semi-realistic digital illustration, romantic animation finish, soft clean lines, delicate shadows, natural well-drawn faces, cozy nostalgic emotional atmosphere. NOT photorealistic, no photography.',
                '',
                'FORMAT: square 1:1, high resolution.',
                '',
                'DO NOT: statues, sculptures, paintings, drawings, engravings, collages, artificial 3D characters, distorted faces, deformed hands, extra fingers, blurry, photorealism, explicit nudity.',
                'DO NOT: any text, words, letters, numbers, typography, watermark, logo, signature.',
                '',
                'CRITICAL: NO TEXT, NO WORDS, NO LETTERS, NO TYPOGRAPHY anywhere.'
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