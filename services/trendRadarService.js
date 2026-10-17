import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { query as dbQuery } from './database.js';

const execFileAsync = promisify(execFile);

/**
 * Radar de Tendências
 * -------------------
 * Descobre conteúdo que está dando MUITA view num nicho, para depois remodelarmos
 * (via IA) e postarmos no nosso perfil. É só LEITURA — nunca publica nada.
 *
 * Fontes:
 *  - YouTube: busca via yt-dlp (binário que já embarcamos) com contagem de views.
 *  - Reddit: busca pública (upvotes como proxy de popularidade). Best-effort —
 *    IPs de datacenter (VPS) costumam receber 403; no PC local funciona.
 *  - Instagram: busca via API oficial (Graph) da conta conectada.
 *      * Por hashtag: posts de maior engajamento da hashtag.
 *      * Por perfil/concorrente (@usuario): business_discovery do perfil alvo.
 *      * Feed próprio: posts da própria conta conectada (para detectar nicho real).
 *
 * A arquitetura é de "fontes plugáveis": adicionar outra fonte é só somar uma
 * função searchX() e incluí-la em searchTrends().
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function getYtDlpExecutable() {
    const win = path.join(process.cwd(), 'bin', 'yt-dlp.exe');
    const linux = path.join(process.cwd(), 'bin', 'yt-dlp');
    if (process.platform === 'win32') {
        return fs.existsSync(win) ? win : 'yt-dlp';
    }
    return fs.existsSync(linux) ? linux : 'yt-dlp';
}

function getJsRuntimeArgs() {
    const major = Number(String(process.versions?.node || '0').split('.')[0]);
    if (major >= 20) return ['--js-runtimes', `node:${process.execPath}`];
    return [];
}

function toViews(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** Normaliza um item de qualquer fonte para o formato comum do radar. */
function normalizeItem({ platform, id, title, url, views = 0, likes = 0, comments = 0, channel = '', duration = 0, thumbnail = '', publishedAt = null } = {}) {
    return {
        platform,
        id: String(id),
        title: String(title || '').trim(),
        url: url || '',
        views: Math.max(toViews(views), toViews(likes + comments)), // proxy se views nao vier
        likes: toViews(likes),
        comments: toViews(comments),
        channel: String(channel || '').trim(),
        duration: Number(duration) || 0,
        thumbnail: thumbnail || '',
        publishedAt: publishedAt || null
    };
}

/* ------------------------------------------------------------------ */
/*  YOUTUBE                                                           */
/* ------------------------------------------------------------------ */

export async function searchYouTube({ query, limit = 20, minViews = 0, shortOnly = false, timeoutMs = 120000 } = {}) {
    const exe = getYtDlpExecutable();
    const want = Math.min(Math.max(limit, 1) * 2, 50);
    const args = [
        `ytsearch${want}:${query}`,
        '--dump-json',
        '--flat-playlist',
        '--no-warnings',
        '--ignore-errors',
        '--socket-timeout', '20',
        ...getJsRuntimeArgs()
    ];
    let stdout = '';
    try {
        const { stdout: out } = await execFileAsync(exe, args, {
            maxBuffer: 1024 * 1024 * 64,
            timeout: timeoutMs,
            windowsHide: true
        });
        stdout = out;
    } catch (e) {
        const msg = e.stderr ? String(e.stderr).slice(0, 200) : e.message;
        if (/rate.?limit|throttl|429|Too Many/i.test(msg)) {
            throw new Error('YouTube está limitando buscas (rate limit). Tente novamente em instantes ou use Instagram.');
        }
        throw e;
    }
    const items = [];
    for (const line of String(stdout || '').split('\n')) {
        if (!line.trim()) continue;
        let j;
        try { j = JSON.parse(line); } catch { continue; }
        const id = j.id;
        if (!id) continue;
        const duration = Number(j.duration || 0);
        const views = toViews(j.view_count);
        const thumbs = Array.isArray(j.thumbnails) ? j.thumbnails : [];
        items.push(normalizeItem({
            platform: 'youtube', id,
            title: String(j.title || '').trim(),
            url: `https://www.youtube.com/watch?v=${id}`,
            views,
            channel: String(j.channel || j.uploader || '').trim(),
            duration,
            thumbnail: (thumbs.length ? thumbs[thumbs.length - 1].url : '') || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
            publishedAt: j.upload_date || null
        }));
    }
    let out = items.filter(i => i.title && i.views >= minViews);
    if (shortOnly) out = out.filter(i => i.duration > 0 && i.duration <= 185);
    return out.sort((a, b) => b.views - a.views).slice(0, limit);
}

/* ------------------------------------------------------------------ */
/*  REDDIT                                                            */
/* ------------------------------------------------------------------ */

export async function searchReddit({ query, limit = 20, timeframe = 'month' } = {}) {
    const n = Math.min(Math.max(limit, 1), 50);
    const res = await axios.get('https://www.reddit.com/search.json', {
        params: { q: query, sort: 'top', t: timeframe, limit: n, include_over_18: false },
        headers: { 'User-Agent': UA, 'Accept': 'application/json' },
        timeout: 20000
    });
    const children = res.data?.data?.children || [];
    return children.map(c => c?.data).filter(Boolean).map(d => normalizeItem({
        platform: 'reddit', id: d.id,
        title: String(d.title || '').trim(),
        url: `https://www.reddit.com${d.permalink || ''}`,
        views: toViews(d.score),
        channel: d.subreddit_name_prefixed || (d.subreddit ? `r/${d.subreddit}` : ''),
        duration: 0,
        thumbnail: (d.thumbnail && /^https?:/i.test(d.thumbnail)) ? d.thumbnail : '',
        publishedAt: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : null
    })).sort((a, b) => b.views - a.views);
}

/* ------------------------------------------------------------------ */
/*  INSTAGRAM (Graph API oficial da conta conectada)                  */
/* ------------------------------------------------------------------ */

const GRAPH = 'https://graph.facebook.com/v21.0';

async function getInstagramAccountsForSearch(userId, accountId = null) {
    let r;
    if (accountId) {
        r = await dbQuery('SELECT id, name, username, account_id, access_token FROM instagram_accounts WHERE id = $1 AND user_id = $2', [accountId, userId]);
    } else {
        r = await dbQuery('SELECT id, name, username, account_id, access_token FROM instagram_accounts WHERE user_id = $1 ORDER BY added_at DESC', [userId]);
    }
    return r.rows.filter(a => a.access_token && a.account_id);
}

/** Busca por HASHTAG: posts de maior engajamento daquela hashtag. */
async function searchInstagramByHashtag({ query, userId, accountId, limit = 20 }) {
    const accounts = await getInstagramAccountsForSearch(userId, accountId);
    if (accounts.length === 0) throw new Error('Nenhuma conta do Instagram conectada.');

    const tags = toHashtagCandidates(query);
    if (tags.length === 0) throw new Error('Tema curto demais para virar hashtag no Instagram.');

    let lastErr = null;
    for (const acc of accounts) {
        try {
            let hashtagId = null;
            let usedTag = null;
            for (const tag of tags) {
                try {
                    const r = await axios.get(`${GRAPH}/ig_hashtag_search`, {
                        params: { user_id: acc.account_id, q: tag, access_token: acc.access_token },
                        timeout: 20000
                    });
                    const id = r.data?.data?.[0]?.id;
                    if (id) { hashtagId = id; usedTag = tag; break; }
                } catch (e) { lastErr = e; }
            }
            if (!hashtagId) continue;

            const n = Math.min(Math.max(limit, 1), 50);
            const res = await axios.get(`${GRAPH}/${hashtagId}/top_media`, {
                params: {
                    user_id: acc.account_id,
                    fields: 'id,caption,like_count,comments_count,media_type,permalink,timestamp',
                    limit: n,
                    access_token: acc.access_token
                },
                timeout: 20000
            });
            const rows = Array.isArray(res.data?.data) ? res.data.data : [];
            return rows.map(d => normalizeItem({
                platform: 'instagram', id: d.id,
                title: String(d.caption || '').split('\n').map(x => x.trim()).find(Boolean) || '(sem legenda)',
                url: d.permalink || '',
                views: toViews(d.like_count) + toViews(d.comments_count),
                likes: toViews(d.like_count),
                comments: toViews(d.comments_count),
                channel: `#${usedTag}${acc.username ? ` · @${acc.username}` : ''}`,
                duration: 0,
                thumbnail: '',
                publishedAt: d.timestamp || null
            })).sort((a, b) => b.views - a.views);
        } catch (e) {
            lastErr = e;
        }
    }
    const apiErr = lastErr?.response?.data?.error?.message;
    throw new Error(apiErr || 'Instagram indisponível. Tente outra conta ou outro tema.');
}

/** Busca por PERFIL/CONCORRENTE (@usuario): business_discovery do alvo. */
async function searchInstagramByProfile({ query, userId, accountId, limit = 20 }) {
    const accounts = await getInstagramAccountsForSearch(userId, accountId);
    if (accounts.length === 0) throw new Error('Nenhuma conta do Instagram conectada.');

    const target = String(query).replace(/^@/, '').trim();
    if (!target) throw new Error('Informe o usuário do Instagram (ex: @concorrente).');

    let lastErr = null;
    for (const acc of accounts) {
        try {
            const res = await axios.get(`${GRAPH}/${acc.account_id}`, {
                params: {
                    fields: `business_discovery.username(${target}){id,name,biography,followers_count,media.limit(${Math.min(limit, 50)}){caption,like_count,comments_count,media_type,permalink,timestamp}}`,
                    access_token: acc.access_token
                },
                timeout: 25000
            });
            const bd = res.data?.business_discovery;
            if (!bd || !bd.media || !Array.isArray(bd.media.data)) {
                lastErr = new Error(`Perfil "@${target}" não encontrado ou sem posts públicos acessíveis.`);
                continue;
            }
            return bd.media.data.map(d => normalizeItem({
                platform: 'instagram', id: d.id,
                title: String(d.caption || '').split('\n').map(x => x.trim()).find(Boolean) || '(sem legenda)',
                url: d.permalink || '',
                views: toViews(d.like_count) + toViews(d.comments_count),
                likes: toViews(d.like_count),
                comments: toViews(d.comments_count),
                channel: `${bd.name || target} · @${target}`,
                duration: 0,
                thumbnail: '',
                publishedAt: d.timestamp || null
            })).sort((a, b) => b.views - a.views);
        } catch (e) {
            const b = e.response?.data?.error || {};
            lastErr = e;
            if (b.message) lastErr = new Error(b.message);
        }
    }
    throw new Error(lastErr?.message || `Não foi possível acessar o perfil "@${target}".`);
}

/** Feed PRÓPRIO: posts da própria conta conectada (para detectar nicho real). */
async function searchInstagramOwnFeed({ userId, accountId, limit = 20 }) {
    const accounts = await getInstagramAccountsForSearch(userId, accountId);
    if (accounts.length === 0) throw new Error('Nenhuma conta do Instagram conectada.');

    // Usa a primeira conta disponível (ou a especificada)
    const acc = accounts[0];

    try {
        const n = Math.min(Math.max(limit, 1), 50);
        const res = await axios.get(`${GRAPH}/${acc.account_id}/media`, {
            params: {
                fields: 'id,caption,like_count,comments_count,media_type,permalink,timestamp',
                limit: n,
                access_token: acc.access_token
            },
            timeout: 25000
        });
        const rows = Array.isArray(res.data?.data) ? res.data.data : [];
        return rows.map(d => normalizeItem({
            platform: 'instagram', id: d.id,
            title: String(d.caption || '').split('\n').map(x => x.trim()).find(Boolean) || '(sem legenda)',
            url: d.permalink || '',
            views: toViews(d.like_count) + toViews(d.comments_count),
            likes: toViews(d.like_count),
            comments: toViews(d.comments_count),
            channel: `Seu perfil · @${acc.username || acc.account_id}`,
            duration: 0,
            thumbnail: '',
            publishedAt: d.timestamp || null
        })).sort((a, b) => b.views - a.views);
    } catch (e) {
        const apiErr = e.response?.data?.error?.message;
        throw new Error(apiErr || 'Não foi possível carregar seus posts do Instagram.');
    }
}

/* ------------------------------------------------------------------ */
/*  ORQUESTRADOR + PERSISTÊNCIA                                       */
/* ------------------------------------------------------------------ */

const STOPWORDS = new Set([
    'de', 'da', 'do', 'das', 'dos', 'para', 'pra', 'com', 'e', 'a', 'o', 'as', 'os',
    'um', 'uma', 'no', 'na', 'nos', 'nas', 'em', 'sobre', 'que', 'por', 'ao', 'aos',
    'the', 'of', 'to', 'and', 'for', 'with', 'your'
]);

export function toHashtagCandidates(phrase) {
    const norm = String(phrase || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    const words = norm.split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !STOPWORDS.has(w));
    const cands = [];
    const joined = words.join('');
    if (joined && joined.length <= 30) cands.push(joined);
    for (const w of words) if (w.length >= 4 && !cands.includes(w)) cands.push(w);
    return [...new Set(cands)].slice(0, 4);
}

/**
 * Busca agregada. Se `persist` for true, grava no banco (tabelas trend_searches/items).
 * `mode`: 'hashtag' (padrao), 'profile' (@usuario), 'ownfeed' (posts próprios).
 */
export async function searchTrends({
    query, sources = ['youtube', 'instagram'], limit = 20, minViews = 0,
    shortOnly = false, timeframe = 'month', userId, instagramAccountId,
    mode = 'hashtag', persist = false
} = {}) {
    const q = String(query || '').trim();
    if (!q && mode !== 'ownfeed') throw new Error('Informe o tema/nicho para pesquisar.');
    const per = Math.min(Math.max(limit, 1), 40);
    const notes = [];
    const jobs = [];

    if (sources.includes('youtube')) {
        jobs.push(
            searchYouTube({ query: q, limit: per, minViews, shortOnly })
                .then(items => ({ src: 'youtube', items }))
                .catch(e => { notes.push(`YouTube: ${e.message}`); return { src: 'youtube', items: [] }; })
        );
    }
    if (sources.includes('reddit')) {
        jobs.push(
            searchReddit({ query: q, limit: per, timeframe })
                .then(items => ({ src: 'reddit', items: items.filter(i => i.views >= minViews) }))
                .catch(e => { notes.push(`Reddit: ${e.message}`); return { src: 'reddit', items: [] }; })
        );
    }
    if (sources.includes('instagram')) {
        let igJob;
        if (mode === 'profile') {
            igJob = searchInstagramByProfile({ query: q, userId, accountId: instagramAccountId, limit: per })
                .then(items => ({ src: 'instagram', items }))
                .catch(e => { notes.push(`Instagram (@): ${e.message}`); return { src: 'instagram', items: [] }; });
        } else if (mode === 'ownfeed') {
            igJob = searchInstagramOwnFeed({ userId, accountId: instagramAccountId, limit: per })
                .then(items => ({ src: 'instagram', items }))
                .catch(e => { notes.push(`Instagram (feed): ${e.message}`); return { src: 'instagram', items: [] }; });
        } else {
            igJob = searchInstagramByHashtag({ query: q, userId, accountId: instagramAccountId, limit: per })
                .then(items => ({ src: 'instagram', items: items.filter(i => i.views >= minViews) }))
                .catch(e => { notes.push(`Instagram (#): ${e.message}`); return { src: 'instagram', items: [] }; });
        }
        jobs.push(igJob);
    }

    const results = await Promise.all(jobs);
    const seen = new Set();
    const items = [];
    for (const r of results) {
        for (const it of r.items) {
            const key = `${it.platform}:${it.id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            items.push(it);
        }
    }
    items.sort((a, b) => b.views - a.views);

    const out = {
        query: q,
        mode,
        sources,
        count: items.length,
        items: items.slice(0, per * 2),
        notes,
        generatedAt: new Date().toISOString()
    };

    if (persist && userId) {
        try {
            await dbQuery(
                `INSERT INTO trend_searches (user_id, query, detected_niche, sources, count, created_at)
                 VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP) RETURNING id`,
                [userId, q, null, JSON.stringify(sources), items.length]
            );
        } catch (e) {
            console.warn('[TRENDS] Falha ao persistir busca:', e.message);
        }
    }

    return out;
}
