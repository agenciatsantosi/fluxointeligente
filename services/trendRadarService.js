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
 * Fontes (grátis, sem chave):
 *  - YouTube: busca via yt-dlp (binário que já embarcamos) com contagem de views.
 *  - Reddit: busca pública (upvotes como proxy de popularidade). Best-effort —
 *    IPs de datacenter (VPS) costumam receber 403; no PC local funciona.
 *
 * A arquitetura é de "fontes plugáveis": adicionar outra fonte (ex: Agent-Reach
 * como CLI externo) é só somar uma função searchX() e incluí-la em searchTrends().
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

// yt-dlp >= 2025.11.12 precisa de runtime JS externo para resolver o YouTube.
function getJsRuntimeArgs() {
    const major = Number(String(process.versions?.node || '0').split('.')[0]);
    if (major >= 20) return ['--js-runtimes', `node:${process.execPath}`];
    return [];
}

function toViews(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/**
 * Busca no YouTube e devolve os vídeos mais vistos do nicho.
 * Pedimos o dobro do limite e ordenamos por views (o ytsearch não ordena por views).
 */
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
    const { stdout } = await execFileAsync(exe, args, {
        maxBuffer: 1024 * 1024 * 64,
        timeout: timeoutMs,
        windowsHide: true
    });
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
        items.push({
            platform: 'youtube',
            id,
            title: String(j.title || '').trim(),
            url: `https://www.youtube.com/watch?v=${id}`,
            views,
            channel: String(j.channel || j.uploader || '').trim(),
            duration,
            thumbnail: (thumbs.length ? thumbs[thumbs.length - 1].url : '') || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
            publishedAt: j.upload_date || null
        });
    }
    let out = items.filter(i => i.title && i.views >= minViews);
    if (shortOnly) out = out.filter(i => i.duration > 0 && i.duration <= 185);
    return out.sort((a, b) => b.views - a.views).slice(0, limit);
}

/** Busca no Reddit (top do período). Best-effort: pode falhar em IP de VPS. */
export async function searchReddit({ query, limit = 20, timeframe = 'month' } = {}) {
    const n = Math.min(Math.max(limit, 1), 50);
    const res = await axios.get('https://www.reddit.com/search.json', {
        params: { q: query, sort: 'top', t: timeframe, limit: n, include_over_18: false },
        headers: { 'User-Agent': UA, 'Accept': 'application/json' },
        timeout: 20000
    });
    const children = res.data?.data?.children || [];
    return children.map(c => c?.data).filter(Boolean).map(d => ({
        platform: 'reddit',
        id: d.id,
        title: String(d.title || '').trim(),
        url: `https://www.reddit.com${d.permalink || ''}`,
        views: toViews(d.score), // upvotes como proxy de popularidade
        channel: d.subreddit_name_prefixed || (d.subreddit ? `r/${d.subreddit}` : ''),
        duration: 0,
        thumbnail: (d.thumbnail && /^https?:/i.test(d.thumbnail)) ? d.thumbnail : '',
        publishedAt: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : null,
        comments: Number(d.num_comments || 0),
        upvoteRatio: Number(d.upvote_ratio || 0)
    })).sort((a, b) => b.views - a.views);
}

/**
 * Agrega as fontes pedidas, deduplica e ordena por popularidade.
 * Nunca lança por causa de uma fonte — devolve `notes` com o que falhou.
 */
export async function searchTrends({ query, sources = ['youtube', 'reddit'], limit = 20, minViews = 0, shortOnly = false, timeframe = 'month', userId, instagramAccountId } = {}) {
    const q = String(query || '').trim();
    if (!q) throw new Error('Informe o tema/nicho para pesquisar.');
    const per = Math.min(Math.max(limit, 1), 40);
    const notes = [];
    const jobs = [];

    if (sources.includes('youtube')) {
        jobs.push(
            searchYouTube({ query: q, limit: per, minViews, shortOnly })
                .then(items => ({ src: 'youtube', items }))
                .catch(e => { notes.push(`YouTube falhou: ${e.message}`); return { src: 'youtube', items: [] }; })
        );
    }
    if (sources.includes('reddit')) {
        jobs.push(
            searchReddit({ query: q, limit: per, timeframe })
                .then(items => ({ src: 'reddit', items: items.filter(i => i.views >= minViews) }))
                .catch(e => { notes.push(`Reddit indisponível: ${e.message}`); return { src: 'reddit', items: [] }; })
        );
    }
    if (sources.includes('instagram')) {
        jobs.push(
            searchInstagram({ query: q, userId, accountId: instagramAccountId, limit: per })
                .then(items => ({ src: 'instagram', items: items.filter(i => i.views >= minViews) }))
                .catch(e => { notes.push(`Instagram indisponível: ${e.message}`); return { src: 'instagram', items: [] }; })
        );
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

    return {
        query: q,
        sources,
        count: items.length,
        items: items.slice(0, per * 2),
        notes,
        generatedAt: new Date().toISOString()
    };
}

// ---------------------------------------------------------------------------
// INSTAGRAM — via API oficial (Graph) da conta conectada.
// Usa ig_hashtag_search + top_media: são os posts de MAIOR ENGAJAMENTO da hashtag.
// Não precisa de scraping nem cookie; usa o token da conta já cadastrada.
// (Facebook não entra aqui: não existe API pública para buscar CONTEÚDO de
// terceiros. Só nossas próprias páginas. Exigiria sessão de navegador logada.)
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
    'de', 'da', 'do', 'das', 'dos', 'para', 'pra', 'com', 'e', 'a', 'o', 'as', 'os',
    'um', 'uma', 'no', 'na', 'nos', 'nas', 'em', 'sobre', 'que', 'por', 'ao', 'aos',
    'the', 'of', 'to', 'and', 'for', 'with', 'your'
]);

/** Transforma uma frase ("frases de umbanda") em candidatos a hashtag. */
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

async function getInstagramAccountsForSearch(userId) {
    const r = await dbQuery('SELECT id, name, username, account_id, access_token FROM instagram_accounts WHERE user_id = $1 ORDER BY added_at DESC', [userId]);
    return r.rows.filter(a => a.access_token && a.account_id);
}

export async function searchInstagram({ query, userId, accountId, limit = 20 } = {}) {
    const graph = 'https://graph.facebook.com/v21.0';
    const tags = toHashtagCandidates(query);
    if (tags.length === 0) throw new Error('Tema curto demais para virar hashtag no Instagram.');

    let accounts;
    if (accountId) {
        const r = await dbQuery('SELECT id, name, username, account_id, access_token FROM instagram_accounts WHERE id = $1 AND user_id = $2', [accountId, userId]);
        accounts = r.rows.filter(a => a.access_token && a.account_id);
    } else {
        accounts = await getInstagramAccountsForSearch(userId);
    }
    if (accounts.length === 0) {
        throw new Error('Nenhuma conta do Instagram conectada (necessária para buscar no Instagram).');
    }

    let lastErr = null;
    for (const acc of accounts) {
        try {
            let hashtagId = null;
            let usedTag = null;
            for (const tag of tags) {
                try {
                    const r = await axios.get(`${graph}/ig_hashtag_search`, {
                        params: { user_id: acc.account_id, q: tag, access_token: acc.access_token },
                        timeout: 20000
                    });
                    const id = r.data?.data?.[0]?.id;
                    if (id) { hashtagId = id; usedTag = tag; break; }
                } catch (e) { lastErr = e; }
            }
            if (!hashtagId) continue;

            const n = Math.min(Math.max(limit, 1), 50);
            const res = await axios.get(`${graph}/${hashtagId}/top_media`, {
                params: {
                    user_id: acc.account_id,
                    fields: 'id,caption,like_count,comments_count,media_type,permalink,timestamp',
                    limit: n,
                    access_token: acc.access_token
                },
                timeout: 20000
            });
            const rows = Array.isArray(res.data?.data) ? res.data.data : [];
            return rows.map(d => {
                const likes = Number(d.like_count || 0);
                const comments = Number(d.comments_count || 0);
                const firstLine = String(d.caption || '').split('\n').map(x => x.trim()).find(Boolean) || '(sem legenda)';
                return {
                    platform: 'instagram',
                    id: d.id,
                    title: firstLine.slice(0, 120),
                    url: d.permalink || '',
                    views: likes + comments,
                    likes,
                    comments,
                    channel: `#${usedTag}${acc.username ? ` · @${acc.username}` : ''}`,
                    duration: 0,
                    thumbnail: d.thumbnail_url || '',
                    publishedAt: d.timestamp || null
                };
            }).sort((a, b) => b.views - a.views);
        } catch (e) {
            lastErr = e;
        }
    }

    const apiErr = lastErr?.response?.data?.error?.message;
    throw new Error(apiErr || 'Instagram indisponível. Tente outra conta ou outro tema.');
}
