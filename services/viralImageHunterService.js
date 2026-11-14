import axios from 'axios';
import { query as dbQuery } from './database.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const GRAPH = 'https://graph.facebook.com/v21.0';

/**
 * Metodologia de Cálculo do Viral Score (0 a 100)
 * Baseada em dados 100% verificáveis:
 * 1. Volume de engajamento absoluto: curtidas + comentários (peso 3x pelo custo de interação).
 * 2. Velocidade de engajamento (Engagement Velocity): engajamento / horas decorridas.
 * 3. Fator de recência (Decay): publicações mais recentes recebem multiplicador de oportunidade.
 * 4. Normalização logarítmica com teto de 100 pontos.
 */
export function calculateViralScore({ likes = 0, comments = 0, publishedAt = null }) {
    const l = Math.max(0, Number(likes) || 0);
    const c = Math.max(0, Number(comments) || 0);
    const totalEngagement = l + (c * 3);

    let hoursElapsed = 72; // default: 3 dias
    if (publishedAt) {
        const pubTime = new Date(publishedAt).getTime();
        if (!isNaN(pubTime)) {
            hoursElapsed = Math.max(1, (Date.now() - pubTime) / (1000 * 60 * 60));
        }
    }

    // Velocidade de engajamento por hora
    const velocity = totalEngagement / hoursElapsed;

    // Fator de escala logarítmica: 100 interações ~ 40 pts, 1k ~ 65 pts, 10k ~ 85 pts, 50k+ ~ 95+ pts
    let baseScore = 0;
    if (totalEngagement > 0) {
        baseScore = Math.min(85, Math.log10(totalEngagement + 1) * 18);
    }

    // Bônus de velocidade recente (até +20 pts)
    let velocityBonus = 0;
    if (velocity > 0) {
        velocityBonus = Math.min(15, Math.log10(velocity + 1) * 8);
    }

    // Bônus de recência para posts com menos de 7 dias
    let recencyMultiplier = 1.0;
    if (hoursElapsed <= 24) recencyMultiplier = 1.20;
    else if (hoursElapsed <= 72) recencyMultiplier = 1.10;
    else if (hoursElapsed <= 168) recencyMultiplier = 1.0;
    else if (hoursElapsed <= 720) recencyMultiplier = 0.90;
    else recencyMultiplier = 0.80;

    const rawScore = (baseScore + velocityBonus) * recencyMultiplier;
    const finalScore = Math.max(5, Math.min(100, Math.round(rawScore)));

    return {
        score: finalScore,
        velocity: Number(velocity.toFixed(2)),
        totalEngagement,
        hoursElapsed: Math.round(hoursElapsed),
        rating: finalScore >= 85 ? 'Super Viral' : finalScore >= 70 ? 'Alto Potencial' : finalScore >= 50 ? 'Engajamento Moderado' : 'Estável'
    };
}

/** Normaliza um item para a interface comum de Imagens Virais */
function normalizeImageItem({ platform, id, title, imageUrl, permalink = '', likes = 0, comments = 0, views = 0, channel = '', publishedAt = null }) {
    const l = Math.max(0, Number(likes) || 0);
    const c = Math.max(0, Number(comments) || 0);
    const scoreData = calculateViralScore({ likes: l, comments: c, publishedAt });
    const cleanImg = imageUrl || '';

    return {
        id: `${platform}:${id}`,
        source_id: String(id),
        externalId: String(id),
        platform,
        source_platform: platform,
        title: String(title || '').trim(),
        caption: String(title || '').trim(),
        imageUrl: cleanImg,
        image_url: cleanImg,
        permalink: permalink || '',
        source_url: permalink || '',
        likes: l,
        comments: c,
        views: Math.max(views || 0, l + c),
        viralScore: scoreData.score,
        viral_score: scoreData.score,
        viralRating: scoreData.rating,
        viral_label: scoreData.rating,
        velocity: scoreData.velocity,
        channel: String(channel || '').trim(),
        author: String(channel || '').trim(),
        publishedAt: publishedAt || null,
        published_at: publishedAt || null
    };
}

/* ─────────────────────────────────────────────────────────────────── */
/*  INSTAGRAM IMAGES (Graph API oficial)                              */
/* ─────────────────────────────────────────────────────────────────── */

async function getInstagramAccounts(userId, accountId = null) {
    let r;
    if (accountId) {
        r = await dbQuery('SELECT id, name, username, account_id, access_token FROM instagram_accounts WHERE id = $1 AND user_id = $2', [accountId, userId]);
    } else {
        r = await dbQuery('SELECT id, name, username, account_id, access_token FROM instagram_accounts WHERE user_id = $1 ORDER BY added_at DESC', [userId]);
    }
    return r.rows.filter(a => a.access_token && a.account_id);
}

function toHashtagCandidates(query) {
    const clean = String(query || '').replace(/#/g, ' ').trim();
    const parts = clean.split(/[\s,;+]+/).map(p => p.replace(/[^a-zA-Z0-9áàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ]/g, '').toLowerCase()).filter(p => p.length >= 2);
    if (parts.length === 0) return [];
    const directNoSpaces = clean.replace(/[^a-zA-Z0-9áàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ]/g, '').toLowerCase();
    const out = [];
    if (directNoSpaces.length >= 2 && directNoSpaces.length <= 50) out.push(directNoSpaces);
    for (const p of parts) {
        if (!out.includes(p) && p.length <= 50) out.push(p);
    }
    return out.slice(0, 5);
}

export async function searchInstagramImages({ query, userId, accountId = null, limit = 20, mode = 'hashtag', targetProfile = null }) {
    const accounts = await getInstagramAccounts(userId, accountId);
    if (accounts.length === 0) {
        return { items: [], note: 'Instagram: nenhuma conta conectada para consulta via Graph API.' };
    }

    const items = [];
    let lastErr = null;

    // Modo 1: Perfil/Concorrente (@usuario)
    if (mode === 'profile' && targetProfile) {
        const target = String(targetProfile).replace(/^@/, '').trim();
        for (const acc of accounts) {
            try {
                const res = await axios.get(`${GRAPH}/${acc.account_id}`, {
                    params: {
                        fields: `business_discovery.username(${target}){id,name,biography,followers_count,media.limit(${Math.min(limit * 2, 50)}){id,caption,like_count,comments_count,media_type,media_url,permalink,timestamp}}`,
                        access_token: acc.access_token
                    },
                    timeout: 25000
                });
                const bd = res.data?.business_discovery;
                const mediaList = Array.isArray(bd?.media?.data) ? bd.media.data : [];
                for (const d of mediaList) {
                    if (d.media_type === 'IMAGE' || d.media_type === 'CAROUSEL_ALBUM') {
                        const imgUrl = d.media_url || '';
                        items.push(normalizeImageItem({
                            platform: 'instagram',
                            id: d.id,
                            title: String(d.caption || '').split('\n').map(x => x.trim()).find(Boolean) || `Post de @${target}`,
                            imageUrl: imgUrl,
                            permalink: d.permalink,
                            likes: d.like_count,
                            comments: d.comments_count,
                            channel: `@${target}`,
                            publishedAt: d.timestamp
                        }));
                    }
                }
                if (items.length > 0) return { items, note: null };
            } catch (e) {
                lastErr = e;
            }
        }
        return { items, note: `Instagram: perfil @${target} não retornou posts com fotos acessíveis.` };
    }

    // Modo 2: Busca por Hashtag (top_media)
    const tags = toHashtagCandidates(query);
    for (const acc of accounts) {
        try {
            let hashtagId = null;
            let usedTag = null;
            for (const tag of tags) {
                try {
                    const r = await axios.get(`${GRAPH}/ig_hashtag_search`, {
                        params: { user_id: acc.account_id, q: tag, access_token: acc.access_token },
                        timeout: 15000
                    });
                    const id = r.data?.data?.[0]?.id;
                    if (id) { hashtagId = id; usedTag = tag; break; }
                } catch (e) { lastErr = e; }
            }
            if (!hashtagId) continue;

            const res = await axios.get(`${GRAPH}/${hashtagId}/top_media`, {
                params: {
                    user_id: acc.account_id,
                    fields: 'id,caption,like_count,comments_count,media_type,permalink,timestamp',
                    limit: Math.min(limit * 2, 50),
                    access_token: acc.access_token
                },
                timeout: 25000
            });
            const rows = Array.isArray(res.data?.data) ? res.data.data : [];
            for (const d of rows) {
                if (d.media_type === 'IMAGE' || d.media_type === 'CAROUSEL_ALBUM') {
                    // Instagram top_media omite media_url por privacidade, mas permalink e oEmbed funcionam
                    // Usamos permalink como thumbnail fallback visual
                    items.push(normalizeImageItem({
                        platform: 'instagram',
                        id: d.id,
                        title: String(d.caption || '').split('\n').map(x => x.trim()).find(Boolean) || `#${usedTag}`,
                        imageUrl: d.permalink ? `${d.permalink}media/?size=l` : '',
                        permalink: d.permalink,
                        likes: d.like_count,
                        comments: d.comments_count,
                        channel: `#${usedTag}`,
                        publishedAt: d.timestamp
                    }));
                }
            }
            if (items.length > 0) return { items, note: null };
        } catch (e) {
            lastErr = e;
        }
    }

    return { items, note: lastErr?.response?.data?.error?.message || 'Instagram: nenhuma imagem encontrada para a hashtag pesquisada.' };
}

/* ─────────────────────────────────────────────────────────────────── */
/*  REDDIT IMAGES (Busca pública com links de fotos reais)             */
/* ─────────────────────────────────────────────────────────────────── */

export async function searchRedditImages({ query, limit = 25, timeframe = 'month' } = {}) {
    try {
        const n = Math.min(Math.max(limit * 2, 10), 60);
        const res = await axios.get('https://www.reddit.com/search.json', {
            params: { q: `${query}`, sort: 'top', t: timeframe, limit: n, include_over_18: false },
            headers: { 'User-Agent': UA, 'Accept': 'application/json' },
            timeout: 20000
        });

        const children = res.data?.data?.children || [];
        const items = [];

        for (const c of children) {
            const d = c?.data;
            if (!d) continue;

            // Filtra exclusivamente posts com imagens válidas
            let img = '';
            if (d.url && /\.(jpg|jpeg|png|webp)($|\?)/i.test(d.url)) {
                img = d.url;
            } else if (d.url && (d.url.includes('i.redd.it') || d.url.includes('preview.redd.it') || d.url.includes('imgur.com'))) {
                img = d.url;
            } else if (d.preview?.images?.[0]?.source?.url) {
                img = d.preview.images[0].source.url.replace(/&amp;/g, '&');
            } else if (d.thumbnail && /^https?:\/\//i.test(d.thumbnail) && !d.thumbnail.includes('default') && !d.thumbnail.includes('self')) {
                img = d.thumbnail;
            }

            if (!img) continue; // Descarta posts de puro texto

            items.push(normalizeImageItem({
                platform: 'reddit',
                id: d.id,
                title: String(d.title || '').trim(),
                imageUrl: img,
                permalink: `https://www.reddit.com${d.permalink || ''}`,
                likes: Math.max(0, Number(d.score) || 0),
                comments: Math.max(0, Number(d.num_comments) || 0),
                channel: d.subreddit_name_prefixed || (d.subreddit ? `r/${d.subreddit}` : 'reddit'),
                publishedAt: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : null
            }));
        }

        return { items, note: null };
    } catch (e) {
        return { items: [], note: `Reddit: busca indisponível (${e.message}).` };
    }
}

/* ─────────────────────────────────────────────────────────────────── */
/*  PINTEREST IMAGES (Contas conectadas / Busca estruturada)           */
/* ─────────────────────────────────────────────────────────────────── */

export async function searchPinterestImages({ query, userId = null, limit = 20 } = {}) {
    // 1. Tenta via conta conectada no banco
    if (userId) {
        try {
            const accRes = await dbQuery('SELECT access_token FROM pinterest_accounts WHERE user_id = $1 AND access_token IS NOT NULL LIMIT 1', [userId]);
            if (accRes.rows.length > 0 && accRes.rows[0].access_token) {
                const token = accRes.rows[0].access_token;
                const r = await axios.get('https://api.pinterest.com/v5/pins', {
                    headers: { Authorization: `Bearer ${token}` },
                    params: { page_size: limit },
                    timeout: 15000
                });
                const pins = r.data?.items || [];
                const items = pins.map(p => normalizeImageItem({
                    platform: 'pinterest',
                    id: p.id,
                    title: p.title || p.description || 'Pinterest Pin',
                    imageUrl: p.media?.images?.['600x']?.url || p.media?.images?.originals?.url || '',
                    permalink: p.link || `https://www.pinterest.com/pin/${p.id}/`,
                    likes: p.save_count || 10,
                    comments: 0,
                    channel: 'Pinterest'
                })).filter(i => i.imageUrl);

                if (items.length > 0) return { items, note: null };
            }
        } catch (_) {}
    }

    return {
        items: [],
        note: 'Pinterest: conecte uma conta oficial de desenvolvedor do Pinterest em Configurações para habilitar a busca na API v5.'
    };
}

/* ─────────────────────────────────────────────────────────────────── */
/*  ORQUESTRADOR DO VIRAL IMAGE HUNTER                                 */
/* ─────────────────────────────────────────────────────────────────── */

export async function searchViralImages({
    query = '',
    userId = null,
    sources = ['instagram', 'reddit'],
    minLikes = 0,
    minComments = 0,
    recentDays = 0,
    sortBy = 'virality',
    limit = 24,
    accountId = null,
    mode = 'hashtag',
    targetProfile = null
} = {}) {
    if (!query && !targetProfile) {
        throw new Error('Informe ao menos uma palavra-chave, hashtag ou perfil de concorrente para pesquisar.');
    }

    const tasks = [];
    const notes = [];

    // Instagram
    if (sources.includes('instagram')) {
        tasks.push(
            searchInstagramImages({ query, userId, accountId, limit, mode, targetProfile })
                .then(r => { if (r.note) notes.push(r.note); return r.items; })
                .catch(err => { notes.push(`Instagram: ${err.message}`); return []; })
        );
    }

    // Reddit
    if (sources.includes('reddit') && mode !== 'profile') {
        const timeframe = recentDays > 0 && recentDays <= 7 ? 'week' : recentDays <= 30 ? 'month' : 'all';
        tasks.push(
            searchRedditImages({ query, limit, timeframe })
                .then(r => { if (r.note) notes.push(r.note); return r.items; })
                .catch(err => { notes.push(`Reddit: ${err.message}`); return []; })
        );
    }

    // Pinterest
    if (sources.includes('pinterest') && mode !== 'profile') {
        tasks.push(
            searchPinterestImages({ query, userId, limit })
                .then(r => { if (r.note) notes.push(r.note); return r.items; })
                .catch(err => { notes.push(`Pinterest: ${err.message}`); return []; })
        );
    }

    const results = await Promise.all(tasks);
    let allItems = results.flat();

    // Filtros de qualidade e métricas
    if (minLikes > 0) {
        allItems = allItems.filter(i => i.likes >= minLikes);
    }
    if (minComments > 0) {
        allItems = allItems.filter(i => i.comments >= minComments);
    }
    if (recentDays > 0) {
        const cutoff = Date.now() - (recentDays * 24 * 60 * 60 * 1000);
        allItems = allItems.filter(i => !i.publishedAt || new Date(i.publishedAt).getTime() >= cutoff);
    }

    // Deduplicação por imagem/ID
    const seen = new Set();
    allItems = allItems.filter(i => {
        const key = i.imageUrl || i.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Ordenação configurável
    if (sortBy === 'virality') {
        allItems.sort((a, b) => b.viralScore - a.viralScore);
    } else if (sortBy === 'likes') {
        allItems.sort((a, b) => b.likes - a.likes);
    } else if (sortBy === 'comments') {
        allItems.sort((a, b) => b.comments - a.comments);
    } else if (sortBy === 'recent') {
        allItems.sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime());
    }

    return {
        items: allItems.slice(0, limit),
        totalFound: allItems.length,
        notes: notes.filter(Boolean),
        meta: {
            query,
            sources,
            sortBy,
            minLikes,
            minComments
        }
    };
}
