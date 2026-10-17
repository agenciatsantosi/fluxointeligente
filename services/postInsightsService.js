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
 * Backfill: casa posts publicados antigos (sem published_post_id) com os posts
 * reais das plataformas, por proximidade de data, e salva o ID + tipo de mídia.
 */
export async function backfillPostIds(userId, { days = 90, toleranceHours = 48 } = {}) {
    const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000);
    const result = { scanned: 0, matched: 0, perPlatform: {} };

    // Posts publicados sem published_post_id, com plataforma e página conhecidas
    const rows = (await db.query(
        `SELECT ap.id, ap.published_date, ap.published_page_id, ap.published_platform, ap.image_url
         FROM automation_posts ap JOIN automations a ON a.id = ap.automation_id
         WHERE a.user_id = $1 AND ap.status = 'published'
           AND ap.published_post_id IS NULL
           AND ap.published_platform IS NOT NULL
           AND ap.published_page_id IS NOT NULL
           AND ap.published_date >= $2`,
        [userId, cutoff]
    )).rows;

    result.scanned = rows.length;

    const fbPages = await db.getFacebookPages(userId).catch(() => []);
    const igAccounts = await db.getInstagramAccounts(userId).catch(() => []);
    const cache = {}; // cache das listagens por plataforma+target

    for (const post of rows) {
        try {
            const platform = post.published_platform;
            let token = null;
            let targetId = null;

            if (platform === 'facebook') {
                const page = fbPages.find(p => String(p.id) === String(post.published_page_id)) || fbPages[0];
                token = page?.accessToken || page?.access_token;
                targetId = page?.id;
            } else if (platform === 'instagram') {
                const acc = igAccounts.find(a => String(a.id) === String(post.published_page_id)) || igAccounts[0];
                token = acc?.access_token;
                targetId = acc?.account_id;
            }
            if (!token || !targetId) continue;

            const cacheKey = platform + ':' + targetId;
            if (!cache[cacheKey]) {
                cache[cacheKey] = await listPlatformPosts(platform, targetId, token).catch(() => []);
            }
            const candidates = cache[cacheKey];
            if (!candidates.length) continue;

            // Acha a mídia com data mais próxima
            const postTime = new Date(post.published_date).getTime();
            let best = null, bestDiff = Infinity;
            for (const c of candidates) {
                if (!c.time) continue;
                const diff = Math.abs(new Date(c.time).getTime() - postTime);
                if (diff < bestDiff) { bestDiff = diff; best = c; }
            }
            if (best && bestDiff <= toleranceHours * 3600 * 1000) {
                const mediaType = best.media_type || (/(\.mp4|\.webm|\.mov)/i.test(post.image_url || '') ? 'video' : 'image');
                await db.updateAutomationPostMetrics(post.id, userId, {
                    published_post_id: best.id,
                    media_type: mediaType
                });
                result.matched++;
                result.perPlatform[platform] = (result.perPlatform[platform] || 0) + 1;
            }
        } catch (e) {
            console.warn('[POST INSIGHTS] backfill item error:', e.message);
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
