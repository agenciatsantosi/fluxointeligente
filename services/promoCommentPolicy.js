/**
 * promoCommentPolicy — lógica PURA (sem imports, sem I/O) da alternância de
 * comentários promocionais de assinatura. Testável com `node` puro.
 *
 * Regra: a cada `frequency` vídeos publicados com sucesso na mesma página,
 * apenas o 1º recebe o comentário (posições 1, 1+f, 1+2f, ...).
 */

export const PROMO_PLATFORMS = ['facebook', 'instagram', 'threads'];

/** Templates de fallback em PT-BR. {link} = link da assinatura. */
export const PROMO_TEMPLATES = [
    { id: 0, style: 'convite', text: 'Quer apoiar nossa página e ter acesso à assinatura com conteúdos exclusivos? Conheça aqui: {link}' },
    { id: 1, style: 'comunidade', text: 'Faça parte da nossa comunidade de assinantes 💜 Veja como participar: {link}' },
    { id: 2, style: 'curta', text: 'Gostou do vídeo? Assine nossa página e não perca nada: {link}' },
    { id: 3, style: 'curiosidade', text: 'Você sabia que dá pra assinar nossa página e receber conteúdo exclusivo? Descubra: {link}' },
    { id: 4, style: 'beneficio', text: 'Assinantes têm acesso a conteúdos e novidades antes de todo mundo ✨ Assine aqui: {link}' },
    { id: 5, style: 'direta', text: 'Apoie nosso trabalho assinando a página 👇 {link}' },
    { id: 6, style: 'pergunta', text: 'Já conhece a assinatura da nossa página? Vale muito a pena conferir: {link}' },
    { id: 7, style: 'media', text: 'Esse vídeo é só o começo! Quem assina recebe muito mais conteúdo exclusivo. Saiba mais: {link}' },
];

export function normalizeText(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** position 1-based. frequency=2 → comenta nas posições 1,3,5... */
export function shouldComment(position, frequency = 2) {
    const f = Math.min(Math.max(parseInt(frequency) || 2, 1), 10);
    const p = parseInt(position) || 0;
    if (p < 1) return false;
    return ((p - 1) % f) === 0;
}

/**
 * Escolhe um template evitando os usados recentemente (por texto normalizado).
 * @param {string[]} recentTexts textos recentes da mesma página
 * @param {function} rng gerador aleatório (default Math.random)
 */
export function pickTemplate(recentTexts = [], rng = Math.random) {
    const recent = new Set((recentTexts || []).map(normalizeText));
    // Candidatos cujo texto normalizado não aparece no histórico recente
    let candidates = PROMO_TEMPLATES.filter(t => {
        const base = normalizeText(t.text.replace('{link}', '').replace(/https?:\/\/\S+/g, ''));
        for (const r of recent) {
            if (r && (r.includes(base.slice(0, 20)) || base.includes(r.slice(0, 20)))) return false;
        }
        return true;
    });
    if (candidates.length === 0) candidates = [...PROMO_TEMPLATES];
    return candidates[Math.floor(rng() * candidates.length)];
}

/** Monta o texto final: substitui {link} ou anexa o link ao final. */
export function buildPromoText(templateText, link) {
    const clean = String(link || '').trim();
    let text = String(templateText || '').trim();
    if (/{link}/i.test(text)) {
        text = text.replace(/\{link\}/gi, clean);
    } else if (clean) {
        text = `${text}\n${clean}`;
    }
    return text.trim();
}

/** Valida antes de enviar: não vazio, com link, sem placeholder, tamanho ok. */
export function validatePromoText(text, link) {
    if (!text || !String(text).trim()) return false;
    const t = String(text).trim();
    if (t.length < 10 || t.length > 400) return false;
    if (/\{link\}/i.test(t)) return false;
    if (link && !t.includes(String(link).trim())) return false;
    return true;
}

/** Retry controlado: no máx 2 tentativas e só para erros transitórios. */
export function shouldRetryPromo(error, attempt) {
    if (attempt >= 2) return false;
    const msg = String((error && (error.response?.data?.error?.message || error.message)) || error || '').toLowerCase();
    return /429|rate|limit|5\d\d|timeout|timed out|econn|eai_again|socket|temporar|try again|please retry/.test(msg);
}

export function retryDelayMs(attempt) {
    return attempt <= 1 ? 5000 : 15000;
}
