import axios from 'axios';
import * as db from './database.js';

const GRAPH_BASE = 'https://graph.facebook.com/v18.0';

// Métricas de insights de post do Facebook (varia por versão/tipo). Buscadas individualmente.
const FB_POST_METRICS = [
    'post_impressions',
    'post_impressions_unique',
    'post_video_views',
    'post_reach',
    'post_clicks_by_type'
];

// Métricas de insights de mídia do Instagram. Buscadas individualmente.
const IG_MEDIA_METRICS = [
    'impressions',
    'reach',
    'saved',
    'shares',
    'plays',
    'total_interactions'
];

/**
 * Busca métricas de um post do Facebook (likes, comments, shares, views, reach).
 */
export async function fetchFacebookPostMetrics(postId, accessToken) {
    const metrics = { likes: 0, comments: 0, shares: 0, views: 0, reach: 0, saved: 0 };
    if (!postId || !accessToken) return metrics;

    // 1. likes / comments / shares (campos diretos)
    try {
        const res = await axios.get(`${GRAPH_BASE}/${postId}`, {
            params: { fields: 'likes.summary(true),comments.summary(true),shares', access_token: accessToken },
            timeout: 15000
        });
        const data = res.data || {};
        metrics.likes = data.likes?.summary?.total_count || 0;
        metrics.comments = data.comments?.summary?.total_count || 0;
        metrics.shares = data.shares?.count || (typeof data.shares === 'number' ? data.shares : 0) || 0;
    } catch (e) {
        console.warn('[POST INSIGHTS] FB fields error:', e.response?.data?.error?.message || e.message);
    }

    // 2. insights — os nomes de métricas variam por versão da API e tipo de post.
    // Buscamos métrica por métrica para que uma inválida não derrube as demais.
    for (const metric of FB_POST_METRICS) {
        try {
            const res = await axios.get(`${GRAPH_BASE}/${postId}/insights`, {
                params: { metric, period: 'lifetime', access_token: accessToken },
                timeout: 15000
            });
            const items = res.data?.data || [];
            for (const item of items) {
                const raw = (item.values && item.values[0]) ? item.values[0].value : 0;
                const n = typeof raw === 'object' ? Number(Object.values(raw)[0]) || 0 : Number(raw) || 0;
                if (item.name === 'post_impressions' || item.name === 'post_video_views' || item.name === 'post_clicks_by_type') {
                    metrics.views = Math.max(metrics.views, n);
                } else if (item.name === 'post_impressions_unique' || item.name === 'post_reach') {
                    metrics.reach = Math.max(metrics.reach, n);
                }
            }
        } catch (e) {
            // métrica indisponível para este post/versão — ignora
        }
    }

    return metrics;
}

/**
 * Busca métricas de uma mídia do Instagram (likes, comments, views, reach, saved, shares).
 */
export async function fetchInstagramMediaMetrics(mediaId, accessToken) {
    const metrics = { likes: 0, comments: 0, shares: 0, views: 0, reach: 0, saved: 0 };
    if (!mediaId || !accessToken) return metrics;

    // 1. campos diretos (like_count, comments_count)
    try {
        const res = await axios.get(`${GRAPH_BASE}/${mediaId}`, {
            params: { fields: 'like_count,comments_count,media_type', access_token: accessToken },
            timeout: 15000
        });
        const data = res.data || {};
        metrics.likes = data.like_count || 0;
        metrics.comments = data.comments_count || 0;
    } catch (e) {
        console.warn('[POST INSIGHTS] IG fields error:', e.response?.data?.error?.message || e.message);
    }

    // 2. insights — a lista de métricas válidas depende do tipo de mídia.
    // Buscamos individualmente para que uma métrica inválida não derrube as demais.
    for (const metric of IG_MEDIA_METRICS) {
        try {
            const res = await axios.get(`${GRAPH_BASE}/${mediaId}/insights`, {
                params: { metric, period: 'lifetime', access_token: accessToken },
                timeout: 15000
            });
            const items = res.data?.data || [];
            for (const item of items) {
                const val = (item.values && item.values[0] && item.values[0].value) || 0;
                const n = Number(val) || 0;
                if (item.name === 'impressions' || item.name === 'plays') metrics.views = Math.max(metrics.views, n);
                if (item.name === 'reach') metrics.reach = Math.max(metrics.reach, n);
                if (item.name === 'saved') metrics.saved = Math.max(metrics.saved, n);
                if (item.name === 'shares') metrics.shares = Math.max(metrics.shares, n);
                if (item.name === 'total_interactions' && metrics.views === 0) metrics.views = n;
            }
        } catch (e) {
            // métrica indisponível para esta mídia/versão — ignora
        }
    }

    return metrics;
}

/**
 * Resolve o access_token para um post publicado, a partir da página/conta.
 */
async function resolveAccessToken(userId, platform, pageId) {
    if (platform === 'facebook') {
        const pages = await db.getFacebookPages(userId);
        const page = pages.find(p => String(p.id) === String(pageId)) || pages[0];
        return page?.accessToken || page?.access_token || null;
    }
    if (platform === 'instagram') {
        const accounts = await db.getInstagramAccounts(userId);
        const acc = accounts.find(a => String(a.account_id) === String(pageId) || String(a.id) === String(pageId)) || accounts[0];
        return acc?.access_token || null;
    }
    return null;
}

/**
 * Atualiza métricas de um post publicado (automation_posts) e salva snapshot.
 */
export async function refreshPostMetrics(userId, postId) {
    const res = await db.query('SELECT ap.* FROM automation_posts ap JOIN automations a ON a.id = ap.automation_id WHERE ap.id = $1 AND a.user_id = $2', [postId, userId]);
    const post = res.rows[0];
    if (!post) throw new Error('Post não encontrado.');
    if (!post.published_post_id) throw new Error('Post ainda não tem ID na plataforma (não publicado ou não capturado).');

    const platform = post.published_platform;
    const token = await resolveAccessToken(userId, platform, post.published_page_id);
    if (!token) throw new Error(`Token de acesso não encontrado para ${platform}.`);

    let metrics;
    if (platform === 'facebook') {
        metrics = await fetchFacebookPostMetrics(post.published_post_id, token);
    } else if (platform === 'instagram') {
        metrics = await fetchInstagramMediaMetrics(post.published_post_id, token);
    } else {
        throw new Error(`Plataforma não suportada para métricas: ${platform}`);
    }

    await db.updateAutomationPostMetrics(post.id, userId, {
        likes: metrics.likes,
        comments: metrics.comments,
        shares: metrics.shares,
        views: metrics.views,
        reach: metrics.reach,
        saved: metrics.saved
    });
    await db.savePostMetricsSnapshot(post.id, userId, platform, metrics);

    return { post, metrics };
}

/**
 * Atualiza métricas de todos os posts publicados de um usuário (com published_post_id).
 */
export async function refreshAllPostMetrics(userId, { platform = null, days = 30 } = {}) {
    const posts = await db.getAutomationPostsForMetrics(userId, { platform, days, limit: 200 });
    const results = [];
    for (const post of posts) {
        try {
            const r = await refreshPostMetrics(userId, post.id);
            results.push({ id: post.id, ok: true, metrics: r.metrics });
        } catch (e) {
            results.push({ id: post.id, ok: false, error: e.message });
        }
        // pequena pausa para evitar rate limit
        await new Promise(r => setTimeout(r, 300));
    }
    return results;
}

/**
 * Top posts por engajamento (views + likes*3 + comments*5 + shares*8).
 */
export async function getTopPosts(userId, { platform = null, mediaType = null, days = 30, limit = 20 } = {}) {
    const posts = await db.getAutomationPostsForMetrics(userId, { platform, mediaType, days, limit });
    return posts.map(p => ({
        id: p.id,
        title: p.title,
        platform: p.published_platform,
        media_type: p.media_type,
        image_url: p.image_url,
        published_date: p.published_date,
        likes: p.likes || 0,
        comments: p.comments || 0,
        shares: p.shares || 0,
        views: p.views || 0,
        reach: p.reach || 0,
        saved: p.saved || 0,
        score: (p.views || 0) + (p.likes || 0) * 3 + (p.comments || 0) * 5 + (p.shares || 0) * 8
    }));
}

export async function getPostMetricsSummary(userId, { days = 30 } = {}) {
    return db.getPostMetricsSummary(userId, { days });
}

/**
 * Busca os posts/mídias recentes de uma página FB ou conta IG.
 */
async function listPlatformPosts(platform, targetId, token) {
    if (platform === 'facebook') {
        const res = await axios.get(`${GRAPH_BASE}/${targetId}/posts`, {
            params: { fields: 'id,created_time,message,attachments{media_type,type}', limit: 100, access_token: token },
            timeout: 20000
        });
        return (res.data?.data || []).map(p => ({
            id: p.id,
            time: p.created_time,
            caption: p.message || '',
            media_type: (p.attachments?.data?.[0]?.media_type === 'video' || p.attachments?.data?.[0]?.type?.includes('video')) ? 'video' : 'image'
        }));
    }
    if (platform === 'instagram') {
        const res = await axios.get(`${GRAPH_BASE}/${targetId}/media`, {
            params: { fields: 'id,caption,timestamp,media_type', limit: 100, access_token: token },
            timeout: 20000
        });
        return (res.data?.data || []).map(m => ({
            id: m.id,
            time: m.timestamp,
            caption: m.caption || '',
            media_type: (m.media_type === 'VIDEO' || m.media_type === 'REELS') ? 'video' : 'image'
        }));
    }
    return [];
}

/**
 * Normaliza texto para comparação (remove acentos, pontuação e espaços extras).
 */
function normalizeText(s) {
    return String(s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

/**
 * Backfill: casa posts publicados antigos (sem published_post_id) com os posts
 * reais das plataformas. Resolve a página alvo pelo próprio post ou, quando ausente,
 * pelos page_ids da automação; casa por data com atribuição 1-para-1 e, como
 * último recurso, por semelhança de texto (título x legenda).
 */
export async function backfillPostIds(userId, { days = 90, toleranceHours = 48 } = {}) {
    const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000);
    const result = { scanned: 0, matched: 0, perPlatform: {}, byDate: 0, byText: 0 };

    // Posts publicados sem published_post_id no período (inclui page_ids da automação)
    const rows = (await db.query(
        `SELECT ap.id, ap.title, ap.published_date, ap.published_page_id, ap.published_platform, ap.image_url, a.page_ids
         FROM automation_posts ap JOIN automations a ON a.id = ap.automation_id
         WHERE a.user_id = $1 AND ap.status = 'published'
           AND ap.published_post_id IS NULL
           AND ap.published_date >= $2`,
        [userId, cutoff]
    )).rows;

    result.scanned = rows.length;

    const fbPages = await db.getFacebookPages(userId).catch(() => []);
    const igAccounts = await db.getInstagramAccounts(userId).catch(() => []);
    const cache = {}; // cache das listagens por plataforma+target

    const loadCandidates = async (platform, targetId, token) => {
        if (!token || !targetId) return [];
        const cacheKey = platform + ':' + targetId;
        if (!cache[cacheKey]) {
            cache[cacheKey] = await listPlatformPosts(platform, targetId, token).catch(() => []);
        }
        return cache[cacheKey];
    };

    const mediaTypeOf = (candidate, imageUrl) =>
        candidate?.media_type || (/(\.mp4|\.webm|\.mov)/i.test(imageUrl || '') ? 'video' : 'image');

    // Resolve a plataforma/página alvo: a do post ou, se ausente, a da automação (page_ids)
    const resolveTarget = (post) => {
        if (post.published_platform && post.published_page_id) {
            if (post.published_platform === 'facebook') {
                const page = fbPages.find(p => String(p.id) === String(post.published_page_id));
                if (page) return { platform: 'facebook', pageRef: page.id, targetId: page.id, token: page.accessToken || page.access_token };
            } else if (post.published_platform === 'instagram') {
                const acc = igAccounts.find(a => String(a.id) === String(post.published_page_id));
                if (acc) return { platform: 'instagram', pageRef: acc.id, targetId: acc.account_id, token: acc.access_token };
            }
        }
        let ids = [];
        try { ids = typeof post.page_ids === 'string' ? JSON.parse(post.page_ids) : (post.page_ids || []); } catch { ids = [post.page_ids]; }
        for (const raw of (ids || [])) {
            const id = String(raw);
            const page = fbPages.find(p => String(p.id) === id);
            if (page) return { platform: 'facebook', pageRef: page.id, targetId: page.id, token: page.accessToken || page.access_token };
            const acc = igAccounts.find(a => String(a.id) === id || String(a.account_id) === id);
            if (acc) return { platform: 'instagram', pageRef: acc.id, targetId: acc.account_id, token: acc.access_token };
        }
        return null;
    };

    // Agrupa posts por alvo para casamento 1-para-1 por data
    const groups = {};
    const unresolved = [];
    for (const post of rows) {
        const target = resolveTarget(post);
        if (!target) { unresolved.push(post); continue; }
        const key = target.platform + ':' + target.targetId;
        if (!groups[key]) groups[key] = { ...target, posts: [] };
        groups[key].posts.push(post);
    }

    // Estratégia 1: casamento por data, 1-para-1 (par mais próximo primeiro)
    for (const key of Object.keys(groups)) {
        const g = groups[key];
        const candidates = await loadCandidates(g.platform, g.targetId, g.token);
        if (!candidates.length) { unresolved.push(...g.posts); continue; }

        const pairs = [];
        for (const post of g.posts) {
            const pt = new Date(post.published_date).getTime();
            for (const c of candidates) {
                if (!c.time) continue;
                pairs.push({ post, c, d: Math.abs(new Date(c.time).getTime() - pt) });
            }
        }
        pairs.sort((a, b) => a.d - b.d);

        const usedPosts = new Set(), usedCand = new Set();
        for (const pr of pairs) {
            if (pr.d > toleranceHours * 3600 * 1000) break;
            if (usedPosts.has(pr.post.id) || usedCand.has(pr.c.id)) continue;
            usedPosts.add(pr.post.id);
            usedCand.add(pr.c.id);
            try {
                await db.updateAutomationPostMetrics(pr.post.id, userId, {
                    published_post_id: pr.c.id,
                    media_type: mediaTypeOf(pr.c, pr.post.image_url),
                    published_platform: g.platform,
                    published_page_id: g.pageRef
                });
                result.matched++;
                result.byDate++;
                result.perPlatform[g.platform] = (result.perPlatform[g.platform] || 0) + 1;
            } catch (e) {
                console.warn('[POST INSIGHTS] backfill update error:', e.message);
            }
        }
        for (const post of g.posts) if (!usedPosts.has(post.id)) unresolved.push(post);
    }

    // Estratégia 2: sem alvo resolvido -> casa pelo texto (título x legenda)
    const sources = [
        ...fbPages.map(p => ({ platform: 'facebook', targetId: p.id, token: p.accessToken || p.access_token, pageRef: p.id })),
        ...igAccounts.map(a => ({ platform: 'instagram', targetId: a.account_id, token: a.access_token, pageRef: a.id }))
    ];
    for (const post of unresolved) {
        try {
            const title = normalizeText(post.title);
            if (title.length < 12) continue;
            const postTime = new Date(post.published_date).getTime();
            let best = null, bestDiff = Infinity;
            for (const src of sources) {
                const candidates = await loadCandidates(src.platform, src.targetId, src.token);
                for (const c of candidates) {
                    const text = normalizeText(c.caption);
                    if (!text || !text.includes(title)) continue;
                    const diff = c.time ? Math.abs(new Date(c.time).getTime() - postTime) : Infinity;
                    if (diff < bestDiff) { bestDiff = diff; best = { candidate: c, src }; }
                }
            }
            // Exige legenda contendo o título e data dentro de 60 dias para evitar falso positivo
            if (best && bestDiff <= 60 * 24 * 3600 * 1000) {
                await db.updateAutomationPostMetrics(post.id, userId, {
                    published_post_id: best.candidate.id,
                    media_type: mediaTypeOf(best.candidate, post.image_url),
                    published_platform: best.src.platform,
                    published_page_id: best.src.pageRef
                });
                result.matched++;
                result.byText++;
                result.perPlatform[best.src.platform] = (result.perPlatform[best.src.platform] || 0) + 1;
            }
        } catch (e) {
            console.warn('[POST INSIGHTS] backfill text error:', e.message);
        }
    }

    return result;
}

export default {
    fetchFacebookPostMetrics,
    fetchInstagramMediaMetrics,
    refreshPostMetrics,
    refreshAllPostMetrics,
    backfillPostIds,
    getTopPosts,
    getPostMetricsSummary
};
