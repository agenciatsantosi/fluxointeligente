import axios from 'axios';
import * as db from './database.js';

const GRAPH_BASE = 'https://graph.facebook.com/v18.0';

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

    // 2. insights (impressions / video views / reach) — pode falhar para alguns posts
    try {
        const res = await axios.get(`${GRAPH_BASE}/${postId}/insights`, {
            params: { metric: 'post_impressions,post_video_views,post_engaged_users', access_token: accessToken },
            timeout: 15000
        });
        const items = res.data?.data || [];
        for (const item of items) {
            const val = (item.values && item.values[0] && item.values[0].value) || 0;
            if (item.name === 'post_impressions') metrics.views = Math.max(metrics.views, Number(val) || 0);
            if (item.name === 'post_video_views') metrics.views = Math.max(metrics.views, Number(val) || 0);
            if (item.name === 'post_engaged_users') metrics.reach = Math.max(metrics.reach, Number(val) || 0);
        }
    } catch (e) {
        // Insights nem sempre disponíveis (ex.: posts antigos ou sem permissão) — não é erro fatal
        console.warn('[POST INSIGHTS] FB insights error:', e.response?.data?.error?.message || e.message);
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

    // 2. insights (impressions, reach, saved, shares, plays)
    // A lista de métricas válidas depende do tipo de mídia; tentamos um conjunto amplo e ignoramos os que falharem.
    const metricSets = [
        'impressions,reach,saved,shares',
        'plays,reach,saved,shares,total_interactions'
    ];
    for (const mset of metricSets) {
        try {
            const res = await axios.get(`${GRAPH_BASE}/${mediaId}/insights`, {
                params: { metric: mset, access_token: accessToken },
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
                if (item.name === 'total_interactions') {
                    // fallback para views se nada mais
                    if (metrics.views === 0) metrics.views = n;
                }
            }
            break; // se funcionou, não tenta o outro set
        } catch (e) {
            // tenta o próximo set
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

export default {
    fetchFacebookPostMetrics,
    fetchInstagramMediaMetrics,
    refreshPostMetrics,
    refreshAllPostMetrics,
    getTopPosts,
    getPostMetricsSummary
};
