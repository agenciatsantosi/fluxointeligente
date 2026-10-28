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
            // Template editável (usa {{FRASE}}) para o admin ver e editar
            defaultPrompt: toEditableTemplate(
                buildDefaultPrompt('Frase de exemplo', s.value, {
                    provider: 'pollinations',
                    emotion: 'auto',
                    watermark: ''
                }),
                s.id
            )
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
            defaultPrompt: prompt ? toEditableTemplate(prompt, id) : ''
        });
    }

    return [...natives, ...customs];
}

/**
 * Normaliza o prompt padrão para o formato EDITÁVEL:
 *  - "Frase de exemplo" / qualquer frase de amostra → marcador {{FRASE}}
 *  - entidade de exemplo → marcador {{ENTIDADE}} quando o estilo é detectável
 * Assim o admin vê o TEMPLATE real, não um texto congelado.
 */
function toEditableTemplate(prompt, styleId) {
    if (!prompt) return '';
    let out = String(prompt);

    // Substitui a frase de amostra por {{FRASE}}
    out = out.replace(/FRASE PARA GERAR A IMAGEM:\s*"[^"]*"/gi, 'FRASE PARA GERAR A IMAGEM: {{FRASE}}');
    out = out.replace(/PHRASE TO RENDER EXACTLY:\s*"[^"]*"/gi, 'PHRASE TO RENDER EXACTLY: {{FRASE}}');
    out = out.replace(/^FRASE:\s*.*$/gim, 'FRASE: {{FRASE}}');

    // Se ainda sobrou a frase de exemplo solta, troca
    out = out.replace(/Frase de exemplo\.?/gi, '{{FRASE}}');

    return out.trim();
}

/**
 * Monta o prompt final de um estilo, priorizando o prompt customizado.
 * Substitui os marcadores {{FRASE}}, {{ENTIDADE}}, {{ENTIDADE_NOME}},
 * {{PALETA}}, {{CENARIO}} e {{PROPS}}.
 */
export async function buildPromptForStyle(phrase, styleValue, opts = {}) {
    const styleId = opts.styleId || extractStyleId(styleValue);
    const provider = String(opts.provider || opts.imageProvider || 'auto').toLowerCase().trim();
    const isOpenAI = provider === 'openai';

    // Dados da entidade (para marcadores e para o fallback nativo)
    let ent = null;
    let builtStyle = null;
    for (const s of CARD_STYLES) {
        if (s.id === styleId) { builtStyle = s; break; }
    }
    if (builtStyle && builtStyle.entities) {
        const detected = builtStyle.detectEntity ? builtStyle.detectEntity(phrase) : 'auto';
        ent = builtStyle.entities[detected] || builtStyle.entities.auto;
    }

    // Detecta entidade espiritual da Umbanda na frase (mesma lógica do estilo
    // Sabedoria das Eres) para preencher os marcadores de styles customizados,
    // ex: o estilo "Umbanda Cuiabá" salvado pelo usuário usa {{entidade_umbanda}},
    // {{descricao_personagem}}, {{elementos_e_guias}}, {{cores_da_guia_e_roupa}}.
    let umbandaEnt = null;
    try {
        const sabedoria = CARD_STYLES.find(s => s.id === 'sabedoria_eres');
        if (sabedoria && sabedoria.detectEntity) {
            const detId = sabedoria.detectEntity(phrase);
            umbandaEnt = sabedoria.entities[detId] || sabedoria.entities.auto;
        }
    } catch (_) { /* ignora */ }

    const inject = (template) => template
        .replace(/\{\{FRASE\}\}/gi, phrase)
        .replace(/\{\{ENTIDADE_NOME\}\}/gi, ent?.name || '')
        .replace(/\{\{ENTIDADE\}\}/gi, ent?.scene || '')
        .replace(/\{\{PALETA\}\}/gi, ent?.palette || '')
        .replace(/\{\{CENARIO\}\}/gi, ent?.props || '')
        .replace(/\{\{ENTIDADE_UMBANDA\}\}/gi, umbandaEnt?.name || 'Caboclo Sete Flechas')
        .replace(/\{\{DESCRICAO_PERSONAGEM\}\}/gi, umbandaEnt?.scene || 'nobre indígena com cocar de penas e arco')
        .replace(/\{\{ELEMENTOS_E_GUIAS\}\}/gi, umbandaEnt?.props || 'arco tradicional e flechas')
        .replace(/\{\{CORES_DA_GUIA_E_ROUPA\}\}/gi, umbandaEnt?.palette || 'tons terrosos, ocre e marrom');

    const custom = await getCustomPrompt(styleId);

    if (custom) {
        const injected = inject(custom);
        if (!isOpenAI) {
            // Se o custom prompt já pede para renderizar uma frase (estilos de
            // card com texto, ex: Umbanda Cuiabá), NÃO anexar "NO TEXT" — isso
            // contradiria a intenção do autor do prompt.
            const asksForText = /PHRASE TO RENDER EXACTLY|FRASE PARA GERAR A IMAGEM|{{FRASE}}/i.test(injected);
            if (injected.length > 1800) {
                console.log(`[Cards] Custom prompt tem ${injected.length} chars (excede limite difuso). Usando prompt nativo otimizado.`);
                return buildDefaultPrompt(phrase, styleValue, opts);
            }
            return asksForText
                ? injected
                : [
                      injected,
                      '',
                      'CRÍTICO: NO TEXT, NO WORDS, NO LETTERS, NO NUMBERS, NO TYPOGRAPHY anywhere in the image.'
                  ].join('\n');
        }
        return injected;
    }

    // Sem override: usa o builder padrão (que já sabe montar o prompt nativo)
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