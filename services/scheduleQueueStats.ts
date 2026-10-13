/**
 * scheduleQueueStats — seletores puros e testáveis para o painel
 * "Fila de publicação" (/dashboard/schedules).
 *
 * Não depende de React nem de rede: recebe a lista de posts já carregada
 * (GET /api/media/schedule) e calcula pendentes, próximo post, progresso
 * e mini-contadores por página/perfil.
 *
 * Regra (espelho do worker: só `pending` é coletado):
 *   pendentes(pagina) = posts onde pagina = X
 *                       E status = 'pending' (ou 'processing' = publicando agora)
 *                       E scheduled_at >= agora
 *                       E dentro do escopo (período da visão ou total geral)
 */

export type QueueStatusKey = 'scheduled' | 'publishing' | 'published' | 'failed' | 'paused';

export interface PostLike {
    id: number;
    platform: string;
    account_id: string | number;
    account_name?: string;
    scheduled_at: string;
    status: string;
    media_type?: string;
    source_url?: string;
    caption?: string;
}

export interface PageRef {
    key: string; // `${platform}:${account_id}`
    platform: string;
    name: string;
}

export interface Scope {
    /** início do escopo (inclusive) ou null = sem limite inferior */
    from: Date | null;
    /** fim do escopo (inclusive) ou null = sem limite superior */
    to: Date | null;
    now: Date;
}

export interface PageQueueStats extends PageRef {
    pending: number;
    nextAt: string | null;
    published: number;
    failed: number;
    paused: number;
    processing: number;
    total: number; // tudo dentro do escopo (qualquer status)
}

const toTime = (v: any): number => {
    const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
    return isNaN(t) ? NaN : t;
};

const inScope = (scheduledAt: string, scope: Scope): boolean => {
    const t = toTime(scheduledAt);
    if (isNaN(t)) return false;
    if (scope.from && t < scope.from.getTime()) return false;
    if (scope.to && t > scope.to.getTime()) return false;
    return true;
};

/** Tipo de mídia: image | video | carousel (heurística usada no front). */
export function getMediaKind(post: PostLike): 'image' | 'video' | 'carousel' {
    if (post.media_type === 'carousel') return 'carousel';
    if (post.media_type === 'image') return 'image';
    const url = post.source_url || '';
    if (url.includes('/photo') || url.includes('/p/')) return 'image';
    return 'video';
}

/**
 * Status canônico de um post da fila para exibição.
 * - processing -> publishing (publicando agora)
 * - completed -> published
 * - failed -> failed
 * - paused -> paused
 * - pending -> scheduled (agendado, mesmo que atrasado)
 */
export function resolvePostStatus(post: PostLike): QueueStatusKey {
    switch (String(post.status || '').toLowerCase()) {
        case 'processing': return 'publishing';
        case 'completed': return 'published';
        case 'failed': return 'failed';
        case 'paused': return 'paused';
        default: return 'scheduled';
    }
}

/** Conta como "ainda falta postar": pending futuro (+processing transitório). */
export function isStillPending(post: PostLike, now: Date): boolean {
    const st = String(post.status || '').toLowerCase();
    if (st === 'processing') return true;
    if (st !== 'pending') return false;
    const t = toTime(post.scheduled_at);
    if (isNaN(t)) return false;
    return t >= now.getTime();
}

export function pageKeyOf(post: PostLike): string {
    return `${post.platform}:${String(post.account_id)}`;
}

/** Próximo post futuro (menor scheduled_at >= now) dentro do escopo. */
function nextFutureIn(posts: PostLike[], scope: Scope): PostLike | null {
    let best: PostLike | null = null;
    let bestT = Infinity;
    for (const p of posts) {
        const st = String(p.status || '').toLowerCase();
        if (st !== 'pending' && st !== 'processing') continue;
        const t = toTime(p.scheduled_at);
        if (isNaN(t) || t < scope.now.getTime()) continue;
        if (!inScope(p.scheduled_at, scope)) continue;
        if (t < bestT) { bestT = t; best = p; }
    }
    return best;
}

/** Estatísticas de UMA página dentro do escopo. */
export function computePageStats(posts: PostLike[], page: PageRef, scope: Scope): PageQueueStats {
    const mine = posts.filter(p => pageKeyOf(p) === page.key && inScope(p.scheduled_at, scope));
    let pending = 0, published = 0, failed = 0, paused = 0, processing = 0;
    for (const p of mine) {
        const st = String(p.status || '').toLowerCase();
        if (st === 'processing') { processing += 1; pending += 1; }
        else if (st === 'pending' && toTime(p.scheduled_at) >= scope.now.getTime()) pending += 1;
        else if (st === 'completed') published += 1;
        else if (st === 'failed') failed += 1;
        else if (st === 'paused') paused += 1;
    }
    const next = nextFutureIn(mine, scope);
    return { ...page, pending, nextAt: next ? next.scheduled_at : null, published, failed, paused, processing, total: mine.length };
}

/**
 * Resumo da fila: um card por página + totais gerais.
 * `pages` = união das contas conectadas + páginas presentes nos posts
 * (contas sem posts aparecem com "Fila vazia").
 */
export function computeQueueSummary(
    posts: PostLike[],
    pages: PageRef[],
    scope: Scope
): { pages: PageQueueStats[]; totals: { pending: number; published: number; failed: number; paused: number; processing: number; total: number; nextAt: string | null } } {
    const stats = pages.map(pg => computePageStats(posts, pg, scope));
    const totals = { pending: 0, published: 0, failed: 0, paused: 0, processing: 0, total: 0, nextAt: null as string | null };
    let bestT = Infinity;
    for (const s of stats) {
        totals.pending += s.pending;
        totals.published += s.published;
        totals.failed += s.failed;
        totals.paused += s.paused;
        totals.processing += s.processing;
        totals.total += s.total;
        if (s.nextAt) {
            const t = toTime(s.nextAt);
            if (!isNaN(t) && t < bestT) { bestT = t; totals.nextAt = s.nextAt; }
        }
    }
    return { pages: stats, totals };
}

/** Ordena cards: mais pendentes primeiro (desempate: próximo mais cedo). */
export function sortPagesByPending(pages: PageQueueStats[]): PageQueueStats[] {
    return [...pages].sort((a, b) => (b.pending - a.pending) || (toTime(a.nextAt) - toTime(b.nextAt)));
}

/** Ordena cards: próximo post mais cedo primeiro (sem próximo vai pro fim). */
export function sortPagesByNext(pages: PageQueueStats[]): PageQueueStats[] {
    const t = (s: PageQueueStats) => (s.nextAt ? toTime(s.nextAt) : Infinity);
    return [...pages].sort((a, b) => t(a) - t(b));
}

const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "hoje 08:00" | "amanhã 14:30" | "12/10 08:00" | "sem agendamento". */
export function formatNextPostLabel(scheduledAt: string | null, now: Date = new Date()): string {
    if (!scheduledAt) return 'sem agendamento';
    const d = new Date(scheduledAt);
    if (isNaN(d.getTime())) return 'sem agendamento';
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    if (sameDay(d, now)) return `hoje ${hh}:${mm}`;
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (sameDay(d, tomorrow)) return `amanhã ${hh}:${mm}`;
    const dd = String(d.getDate()).padStart(2, '0');
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mo} ${hh}:${mm}`;
}

/** Metadados visuais por status canônico (borda = status, nunca rede). */
export const STATUS_META: Record<QueueStatusKey, { label: string; border: string; badge: string; dot: string }> = {
    scheduled:  { label: 'Agendado',        border: 'border-l-blue-500',   badge: 'bg-blue-50 text-blue-700 border-blue-200',      dot: 'bg-blue-500' },
    publishing: { label: 'Publicando',      border: 'border-l-amber-400',  badge: 'bg-amber-50 text-amber-700 border-amber-200',   dot: 'bg-amber-400' },
    published:  { label: 'Publicado',       border: 'border-l-emerald-500',badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
    failed:     { label: 'Falhou',          border: 'border-l-red-500',    badge: 'bg-red-50 text-red-700 border-red-200',         dot: 'bg-red-500' },
    paused:     { label: 'Pausado',         border: 'border-l-gray-300',   badge: 'bg-gray-100 text-gray-600 border-gray-200',     dot: 'bg-gray-400' },
};
