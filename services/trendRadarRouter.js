import express from 'express';
import { requireAuth } from './authService.js';
import { searchTrends } from './trendRadarService.js';
import { remixTrendingContent, inferPageNiche, discoverNichesFromVideos } from './ai_generator.js';
import {
    saveTrendSearch, getTrendSearches, getTrendSearchItems, deleteTrendSearch,
    getFacebookPages, query
} from './database.js';
import axios from 'axios';
import * as instagramGraph from './instagramGraphService.js';
import { searchViralImages } from './viralImageHunterService.js';
import { analyzeViralImage } from './visionAnalysisService.js';
import { createViralRemix } from './viralCreativeService.js';
import { publishViralPost, runAutopilotCycle } from './viralAutopilotCron.js';

/**
 * Radar de Tendências — rotas.
 * Tudo somente-leitura: busca conteúdo viral para depois remodelarmos com IA.
 * Requer autenticação; nenhuma chave de IA ou token sai daqui.
 */
const router = express.Router();

function parseUserId(req) {
    return req.user?.id || req.user?.userId;
}

function parseSources(raw) {
    const allowed = ['youtube', 'reddit', 'instagram'];
    return String(raw || 'youtube,instagram')
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(s => allowed.includes(s));
}

// GET /api/trends/search?q=...&sources=...&mode=hashtag|profile|ownfeed&persist=1
//     &pageName=...&pageUsername=...&pagePlatform=...&instagramAccountId=...
router.get('/search', requireAuth, async (req, res) => {
    try {
        const userId = parseUserId(req);
        let q = String(req.query.q || '').trim();
        const pageName = String(req.query.pageName || '').trim();
        const pageUsername = String(req.query.pageUsername || '').trim();
        const pagePlatform = String(req.query.pagePlatform || '').trim();
        const instagramAccountId = req.query.instagramAccountId ? parseInt(req.query.instagramAccountId) : null;
        const mode = ['hashtag', 'profile', 'ownfeed'].includes(req.query.mode) ? req.query.mode : 'hashtag';
        const persist = req.query.persist === '1' || req.query.persist === 'true';

        // Sem tema digitado, mas com página selecionada: a IA descobre o nicho.
        let detected = null;
        if (!q && (pageName || pageUsername)) {
            // Busca conteúdo real da página (legendas/captions) para a IA entender o contexto.
            const samples = [];
            const pid = String(req.query.pageId || '').trim();
            const igAccountId = req.query.instagramAccountId ? parseInt(req.query.instagramAccountId) : null;
            if (pagePlatform === 'instagram' && igAccountId) {
                try {
                    const ig = await instagramGraph.getAccountMedia(igAccountId, 15);
                    if (ig?.success && Array.isArray(ig.media)) {
                        for (const m of ig.media) { if (m?.caption) samples.push(String(m.caption).slice(0, 200)); }
                    }
                } catch {}
            } else if (pagePlatform === 'facebook' && pid) {
                try {
                    const pages = await db.getFacebookPages(userId);
                    const pg = pages.find(p => String(p.id) === pid);
                    const token = pg?.accessToken || pg?.access_token;
                    if (token) {
                        const r = await axios.get(`https://graph.facebook.com/v19.0/${pid}/posts`, {
                            params: { fields: 'message', limit: 15, access_token: token },
                            timeout: 15000
                        });
                        for (const p of (r.data?.data || [])) { if (p?.message) samples.push(String(p.message).slice(0, 200)); }
                    }
                } catch {}
            }
            detected = await inferPageNiche({ name: pageName, username: pageUsername, platform: pagePlatform, samples }, userId).catch(() => null);
            if (detected?.queries?.[0]) q = detected.queries[0];
            else if (detected?.nicho) q = detected.nicho;
        }
        if (!q && mode !== 'ownfeed') {
            return res.status(400).json({ success: false, error: 'Informe o tema/nicho ou escolha uma página para a IA detectar o nicho.' });
        }

        const sources = parseSources(req.query.sources);
        const limit = Math.min(Math.max(parseInt(req.query.limit || '20') || 20, 1), 40);
        const minViews = Math.max(parseInt(req.query.minViews || '0') || 0, 0);
        const shortOnly = req.query.shortOnly === '1' || req.query.shortOnly === 'true';
        const reelsOnly = req.query.reelsOnly === '1' || req.query.reelsOnly === 'true';
        const timeframe = ['hour', 'day', 'week', 'month', 'year', 'all'].includes(req.query.timeframe) ? req.query.timeframe : 'month';
const recentDays = Math.max(parseInt(req.query.recentDays || '0') || 0, 0);
const sortBy = ['views', 'virality', 'recent'].includes(req.query.sortBy) ? req.query.sortBy : 'views';

        const data = await searchTrends({
            query: q,
            mode,
            sources: sources.length ? sources : ['youtube'],
            limit, minViews, shortOnly, reelsOnly, timeframe,
            recentDays, sortBy,
            userId, instagramAccountId, persist
        });
        res.json({ success: true, ...data, detectedNiche: detected?.nicho || null, nicheQueries: detected?.queries || [] });
    } catch (error) {
        console.error('[TRENDS] search error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/trends/remix  { theme, winners:[...], count, style }
router.post('/remix', requireAuth, async (req, res) => {
    try {
        const { theme = '', winners = [], count = 10, style = '' } = req.body || {};
        const userId = parseUserId(req);
        const out = await remixTrendingContent({ theme, winners, count, style }, userId);
        if (!out) {
            return res.status(503).json({
                success: false,
                error: 'Nenhum provedor de IA respondeu. Verifique ChatGPT/OpenAI (ou Gemini/9Router) em Configurações → APIs.'
            });
        }
        res.json({ success: true, ...out });
    } catch (error) {
        console.error('[TRENDS] remix error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/trends/history — lista pesquisas salvas do usuário
router.get('/history', requireAuth, async (req, res) => {
    try {
        const userId = parseUserId(req);
        const rows = await getTrendSearches(userId);
        res.json({ success: true, searches: rows });
    } catch (error) {
        console.error('[TRENDS] history error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/trends/history/:id/items — itens de uma pesquisa salva
router.get('/history/:id/items', requireAuth, async (req, res) => {
    try {
        const userId = parseUserId(req);
        const searchId = parseInt(req.params.id);
        const rows = await getTrendSearchItems(searchId, userId);
        res.json({ success: true, items: rows });
    } catch (error) {
        console.error('[TRENDS] history items error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /api/trends/history/:id — exclui uma pesquisa salva
router.delete('/history/:id', requireAuth, async (req, res) => {
    try {
        const userId = parseUserId(req);
        const searchId = parseInt(req.params.id);
        await deleteTrendSearch(searchId, userId);
        res.json({ success: true });
    } catch (error) {
        console.error('[TRENDS] delete history error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/trends/discover-niches  { items:[{title,views,ageDays,platform}] }
router.post('/discover-niches', requireAuth, async (req, res) => {
    try {
        const userId = parseUserId(req);
        const items = Array.isArray(req.body?.items) ? req.body.items : [];
        const out = await discoverNichesFromVideos({ items }, userId);
        if (!out) return res.status(503).json({ success: false, error: 'A IA não retornou nichos. Verifique o provedor de IA em Configurações → APIs.' });
        res.json({ success: true, ...out });
    } catch (error) {
        console.error('[TRENDS] discover-niches error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ───────────────────────────────────────────────────────────────────
// 📸 RADAR DE IMAGENS VIRAIS (Agentes: Hunter, Vision, Creative, Publisher)
// ───────────────────────────────────────────────────────────────────

// GET /api/trends/images/search — Agente 1: Viral Image Hunter
router.get('/images/search', requireAuth, async (req, res) => {
    try {
        const userId = parseUserId(req);
        const q = String(req.query.q || '').trim();
        const sourcesRaw = String(req.query.sources || 'instagram,reddit');
        const sources = sourcesRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        const minLikes = Math.max(0, parseInt(req.query.minLikes || '0') || 0);
        const minComments = Math.max(0, parseInt(req.query.minComments || '0') || 0);
        const recentDays = Math.max(0, parseInt(req.query.recentDays || '0') || 0);
        const sortBy = ['virality', 'likes', 'comments', 'recent'].includes(req.query.sortBy) ? req.query.sortBy : 'virality';
        const limit = Math.min(Math.max(parseInt(req.query.limit || '24') || 24, 1), 60);
        const mode = ['hashtag', 'profile'].includes(req.query.mode) ? req.query.mode : 'hashtag';
        const targetProfile = req.query.targetProfile ? String(req.query.targetProfile).trim() : null;
        const accountId = req.query.instagramAccountId ? parseInt(req.query.instagramAccountId) : null;

        const data = await searchViralImages({
            query: q,
            userId,
            sources,
            minLikes,
            minComments,
            recentDays,
            sortBy,
            limit,
            mode,
            targetProfile,
            accountId
        });

        res.json({ success: true, ...data });
    } catch (error) {
        console.error('[TRENDS-IMAGES] search error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/trends/images/proxy — Proxy transparente para imagens com proteção de hotlink (Instagram/Reddit)
router.get('/images/proxy', async (req, res) => {
    try {
        const targetUrl = String(req.query.url || '').trim();
        if (!targetUrl || !targetUrl.startsWith('http')) {
            return res.status(400).send('Invalid url');
        }
        const response = await axios.get(targetUrl, {
            responseType: 'stream',
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
            }
        });
        res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        response.data.pipe(res);
    } catch (err) {
        res.status(502).send('Proxy error');
    }
});

// POST /api/trends/images/analyze — Agente 2: Vision Analysis Service & OCR
router.post('/images/analyze', requireAuth, async (req, res) => {
    try {
        const userId = parseUserId(req);
        const { imageUrl, title = '' } = req.body || {};
        if (!imageUrl) {
            return res.status(400).json({ success: false, error: 'URL da imagem é obrigatória para análise visual.' });
        }

        const analysis = await analyzeViralImage(imageUrl, title, userId);
        res.json({ success: true, analysis });
    } catch (error) {
        console.error('[TRENDS-IMAGES] analyze error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/trends/images/recreate — Agente 3: Viral Creative Studio
router.post('/images/recreate', requireAuth, async (req, res) => {
    try {
        const userId = parseUserId(req);
        const {
            referenceId = null,
            referenceTitle = '',
            referenceImageUrl = '',
            analysis = null,
            visualStyle = 'umbanda_cuiaba',
            format = 'feed_vertical',
            tone = 'religioso'
        } = req.body || {};

        const remix = await createViralRemix({
            referenceId,
            referenceTitle,
            referenceImageUrl,
            analysis,
            visualStyle,
            format,
            tone,
            userId
        });

        res.json({ success: true, ...remix });
    } catch (error) {
        console.error('[TRENDS-IMAGES] recreate error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/trends/images/publish — Agente 4: Auto Publisher AI
router.post('/images/publish', requireAuth, async (req, res) => {
    try {
        const { postId, pageIds } = req.body || {};
        if (!postId) {
            return res.status(400).json({ success: false, error: 'ID da publicação é obrigatório.' });
        }

        const publishRes = await publishViralPost(postId, pageIds);
        res.json({ success: true, ...publishRes });
    } catch (error) {
        console.error('[TRENDS-IMAGES] publish error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/trends/images/recreated — Lista publicações remodeladas
router.get('/images/recreated', requireAuth, async (req, res) => {
    try {
        const userId = parseUserId(req);
        const rows = await query(`
            SELECT p.*, r.title as reference_title, r.platform as reference_platform, r.image_url as reference_image_url
            FROM viral_recreated_posts p
            LEFT JOIN viral_image_items r ON r.id = p.reference_item_id
            WHERE p.user_id = $1
            ORDER BY p.created_at DESC
            LIMIT 50
        `, [userId]);
        res.json({ success: true, posts: rows.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ───────────────────────────────────────────────────────────────────
// 🤖 CENTRAL DE AUTOMAÇÃO VIRAL (Piloto Automático 24 Horas)
// ───────────────────────────────────────────────────────────────────

// GET /api/trends/images/autopilot — Lista automações ativas
router.get('/images/autopilot', requireAuth, async (req, res) => {
    try {
        const userId = parseUserId(req);
        const rows = await query(`
            SELECT * FROM viral_image_automations 
            WHERE user_id = $1 
            ORDER BY created_at DESC
        `, [userId]);
        res.json({ success: true, automations: rows.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/trends/images/autopilot — Cria nova automação 24h
router.post('/images/autopilot', requireAuth, async (req, res) => {
    try {
        const userId = parseUserId(req);
        const {
            name,
            query: qText,
            sources = ['instagram', 'reddit'],
            frequency_hours = 6,
            posts_per_day = 2,
            viral_threshold = 75,
            auto_approve = false,
            visual_style = 'umbanda_cuiaba',
            target_page_ids = []
        } = req.body || {};

        if (!name || !qText) {
            return res.status(400).json({ success: false, error: 'Nome e palavras-chave/hashtags são obrigatórios.' });
        }

        const insert = await query(`
            INSERT INTO viral_image_automations (
                user_id, name, query, sources, frequency_hours, posts_per_day,
                viral_threshold, auto_approve, visual_style, target_page_ids,
                status, next_run_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', NOW())
            RETURNING *
        `, [
            userId, name, qText, JSON.stringify(sources), frequency_hours, posts_per_day,
            viral_threshold, auto_approve, visual_style, JSON.stringify(target_page_ids)
        ]);

        // Dispara uma rodada inicial em background
        runAutopilotCycle(insert.rows[0].id).catch(e => console.warn('[Autopilot] Primeira rodada:', e.message));

        res.json({ success: true, automation: insert.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// PUT /api/trends/images/autopilot/:id/status — Pausar ou Ativar
router.put('/images/autopilot/:id/status', requireAuth, async (req, res) => {
    try {
        const userId = parseUserId(req);
        const { id } = req.params;
        const { status } = req.body || {}; // 'active' ou 'paused'

        const r = await query(`
            UPDATE viral_image_automations 
            SET status = $1, updated_at = NOW() 
            WHERE id = $2 AND user_id = $3 
            RETURNING *
        `, [status, id, userId]);

        if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Automação não encontrada.' });
        res.json({ success: true, automation: r.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /api/trends/images/autopilot/:id — Excluir automação
router.delete('/images/autopilot/:id', requireAuth, async (req, res) => {
    try {
        const userId = parseUserId(req);
        const { id } = req.params;
        await query('DELETE FROM viral_image_automations WHERE id = $1 AND user_id = $2', [id, userId]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/trends/images/autopilot/:id/trigger — Executar Agora
router.post('/images/autopilot/:id/trigger', requireAuth, async (req, res) => {
    try {
        const userId = parseUserId(req);
        const { id } = req.params;
        const check = await query('SELECT id FROM viral_image_automations WHERE id = $1 AND user_id = $2', [id, userId]);
        if (check.rows.length === 0) return res.status(404).json({ success: false, error: 'Automação não encontrada.' });

        runAutopilotCycle(id).catch(e => console.warn('[Autopilot Trigger]:', e.message));
        res.json({ success: true, message: 'Execução do piloto automático iniciada com sucesso!' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/trends/images/autopilot/stats — Indicadores da Central
router.get('/images/autopilot/stats', requireAuth, async (req, res) => {
    try {
        const userId = parseUserId(req);
        const [autos, items, recreated] = await Promise.all([
            query('SELECT COUNT(*) as total, SUM(CASE WHEN status = \'active\' THEN 1 ELSE 0 END) as active FROM viral_image_automations WHERE user_id = $1', [userId]),
            query('SELECT COUNT(*) as total_found, AVG(viral_score) as avg_score FROM viral_image_items WHERE user_id = $1', [userId]),
            query('SELECT COUNT(*) as total_recreated, SUM(CASE WHEN status = \'published\' THEN 1 ELSE 0 END) as total_published, SUM(CASE WHEN status = \'pending_approval\' THEN 1 ELSE 0 END) as pending_approval FROM viral_recreated_posts WHERE user_id = $1', [userId])
        ]);

        res.json({
            success: true,
            stats: {
                totalAutomations: parseInt(autos.rows[0]?.total || 0),
                activeAutomations: parseInt(autos.rows[0]?.active || 0),
                totalFound: parseInt(items.rows[0]?.total_found || 0),
                avgViralScore: Math.round(parseFloat(items.rows[0]?.avg_score || 0)),
                totalRecreated: parseInt(recreated.rows[0]?.total_recreated || 0),
                totalPublished: parseInt(recreated.rows[0]?.total_published || 0),
                pendingApproval: parseInt(recreated.rows[0]?.pending_approval || 0)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
