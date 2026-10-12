/**
 * ════════════════════════════════════════════════════════════════════════
 * 🎨 PROMPTS PERSONALIZADOS POR ESTILO DE CARD
 * ════════════════════════════════════════════════════════════════════════
 *
 * Permite que o admin customize/adicione prompts para cada Estilo Visual
 * sem precisar alterar código. Os prompts ficam no banco (system_config) e
 * sobrescrevem os padrões de services/cardStyles.js em tempo de execução.
 *
 * Chaves no banco:
 *   card_prompt_<STYLE_ID>      → prompt de fundo (provedores não-OpenAI)
 *   card_style_<STYLE_ID>_name  → rótulo exibido no select
 *   card_style_<STYLE_ID>_value → valor persistido em visual_identity.style
 *   card_style_<STYLE_ID>_custom → 'true' marca estilo criado pelo admin
 * ════════════════════════════════════════════════════════════════════════
 */

import { query, getSystemConfig, saveSystemConfig } from './database.js';
import { CARD_STYLES, buildCardPrompt as buildDefaultPrompt } from './cardStyles.js';

const PREFIX_PROMPT = 'card_prompt_';
const PREFIX_NAME = 'card_style_';
const PREFIX_VALUE = 'card_style_value_';
const PREFIX_CUSTOM = 'card_style_custom_';

/** Ids de estilo válidos (de código). */
const BUILTIN_IDS = CARD_STYLES.map(s => s.id);

/** Ids criados pelo admin (apelidos salvos em card_style_custom_*). */
async function getCustomIds() {
    try {
        const { rows } = await query(
            'SELECT key FROM system_config WHERE key LIKE $1',
            [`${PREFIX_CUSTOM}%`]
        );
        return rows
            .map(r => r.key.slice(PREFIX_CUSTOM.length))
            .filter(Boolean);
    } catch (err) {
        console.warn('[CARD PROMPTS] Erro ao ler estilos custom:', err.message);
        return [];
    }
}

/** Lê o prompt customizado de um estilo (ou null se não existir). */
export async function getCustomPrompt(styleId) {
    if (!styleId) return null;
    try {
        const val = await getSystemConfig(`${PREFIX_PROMPT}${styleId}`);
        return val && String(val).trim() ? String(val) : null;
    } catch {
        return null;
    }
}

/** Salva o prompt customizado de um estilo (string vazia = volta ao padrão). */
export async function saveCustomPrompt(styleId, prompt) {
    if (!styleId) throw new Error('styleId é obrigatório');
    const value = prompt && String(prompt).trim() ? String(prompt) : '';
    await saveSystemConfig(`${PREFIX_PROMPT}${styleId}`, value);
    return value;
}

/** Salva um novo estilo (criado pelo admin). */
export async function saveCustomStyle({ id, name, value, prompt, emotion }) {
    if (!id) throw new Error('id é obrigatório');
    const safeId = String(id).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');

    if (BUILTIN_IDS.includes(safeId)) {
        throw new Error(`"${safeId}" é um estilo nativo. Use "Editar prompt" para customizá-lo.`);
    }

    await saveSystemConfig(`${PREFIX_CUSTOM}${safeId}`, 'true');
    await saveSystemConfig(`${PREFIX_NAME}${safeId}`, name || safeId);
    await saveSystemConfig(`${PREFIX_VALUE}${safeId}`, value || `Card personalizado: ${name || safeId}`);
    await saveCustomPrompt(safeId, prompt || '');
    if (emotion !== undefined) {
        await saveSystemConfig(`${PREFIX_NAME}${safeId}_emotion`, emotion ? 'true' : 'false');
    }
    return safeId;
}

/** Remove um estilo customizado. Estilos nativos não podem ser removidos. */
export async function deleteCustomStyle(styleId) {
    if (BUILTIN_IDS.includes(styleId)) {
        throw new Error('Estilos nativos não podem ser removidos. Você pode apenas customizar o prompt.');
    }
    const keys = [
        `${PREFIX_CUSTOM}${styleId}`,
        `${PREFIX_NAME}${styleId}`,
        `${PREFIX_VALUE}${styleId}`,
        `${PREFIX_PROMPT}${styleId}`,
        `${PREFIX_NAME}${styleId}_emotion`,
    ];
    await query('DELETE FROM system_config WHERE key = ANY($1)', [keys]);
}

/**
 * Lista todos os estilos disponíveis (nativos + customizados),
 * com a indicação de quais têm prompt customizado.
 */
export async function listAllStyles() {
    const customIds = await getCustomIds();

    // Coleta prompts customizados dos nativos
    const natives = [];
    for (const s of CARD_STYLES) {
        let custom = null;
        try {
            const val = await getSystemConfig(`${PREFIX_PROMPT}${s.id}`);
            custom = val && String(val).trim() ? String(val) : null;
        } catch { /* ignora */ }

        natives.push({
            id: s.id,
            label: s.label,
            value: s.value,
            hasEmotion: !!s.hasEmotion,
            builtin: true,
            custom: false,
            customPrompt: custom,
            prompt: custom || null,
            defaultPrompt: buildDefaultPrompt('Frase de exemplo', s.value, {
                provider: 'pollinations',
                emotion: 'auto',
                watermark: ''
            })
        });
    }

    // Estilos customizados
    const customs = [];
    for (const id of customIds) {
        const [name, value, prompt, emotion] = await Promise.all([
            getSystemConfig(`${PREFIX_NAME}${id}`).catch(() => id),
            getSystemConfig(`${PREFIX_VALUE}${id}`).catch(() => id),
            getSystemConfig(`${PREFIX_PROMPT}${id}`).catch(() => null),
            getSystemConfig(`${PREFIX_NAME}${id}_emotion`).catch(() => 'false'),
        ]);

        customs.push({
            id,
            label: `🎨 ${name || id} (personalizado)`,
            value: value || id,
            hasEmotion: String(emotion) === 'true',
            builtin: false,
            custom: true,
            customPrompt: prompt || null,
            prompt: prompt || null,
            defaultPrompt: null
        });
    }

    return [...natives, ...customs];
}

/**
 * Monta o prompt final de um estilo, priorizando o prompt customizado.
 * Se houver override, usamos tokens simples no lugar da frase.
 */
export async function buildPromptForStyle(phrase, styleValue, opts = {}) {
    const styleId = opts.styleId || extractStyleId(styleValue);
    const custom = await getCustomPrompt(styleId);

    if (custom) {
        // Substitui marcadores no prompt customizado
        const provider = String(opts.provider || opts.imageProvider || 'auto').toLowerCase().trim();
        const isOpenAI = provider === 'openai';

        // Prompt customizado para não-OpenAI: injeta a frase e limpa instruções de texto
        const injected = custom
            .replace(/\{\{FRASE\}\}/gi, phrase)
            .replace(/\{\{PHRASE\}\}/gi, phrase);

        if (!isOpenAI) {
            return [
                injected,
                '',
                'CRÍTICO: NO TEXT, NO WORDS, NO LETTERS, NO NUMBERS, NO TYPOGRAPHY anywhere in the image.'
            ].join('\n');
        }

        return injected;
    }

    // Sem override: usa o builder padrão
    return buildDefaultPrompt(phrase, styleValue, opts);
}

/** Extrai o id do estilo a partir do value persistido. */
function extractStyleId(styleValue) {
    if (!styleValue) return null;
    const n = String(styleValue)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

    for (const s of CARD_STYLES) {
        const sn = String(s.id).toLowerCase();
        if (n.includes(sn)) return s.id;
        if (String(s.value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === n) return s.id;
    }
    // tenta achar um custom pelo value exato
    return null;
}

export default {
    getCustomPrompt,
    saveCustomPrompt,
    saveCustomStyle,
    deleteCustomStyle,
    listAllStyles,
    buildPromptForStyle,
    CARD_STYLES
};