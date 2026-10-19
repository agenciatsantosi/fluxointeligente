import express from 'express';
import * as db from './database.js';
import { requireAuth } from './authService.js';
import * as postInsights from './postInsightsService.js';
import * as promoComments from './promoCommentService.js';

const router = express.Router();

// GET /api/post-insights/posts?platform=&mediaType=&days=&limit=
router.get('/posts', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const platform = req.query.platform || null;
        const mediaType = req.query.mediaType || null;
        const days = parseInt(req.query.days) || 30;
        const limit = parseInt(req.query.limit) || 50;
        const posts = await postInsights.getTopPosts(userId, { platform, mediaType, days, limit });
        res.json({ success: true, posts });
    } catch (error) {
        console.error('[POST INSIGHTS] list posts error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/post-insights/summary?days=
router.get('/summary', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const days = parseInt(req.query.days) || 30;
        const summary = await postInsights.getPostMetricsSummary(userId, { days });
        res.json({ success: true, summary });
    } catch (error) {
        console.error('[POST INSIGHTS] summary error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/post-insights/times?source=&platform=&mediaType=&days=
router.get('/times', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const source = req.query.source || 'automation';
        const platform = req.query.platform || null;
        const mediaType = req.query.mediaType || null;
        const days = parseInt(req.query.days) || 30;
        const times = await postInsights.getBestPostingTimes(userId, { source, platform, mediaType, days });
        res.json({ success: true, times });
    } catch (error) {
        console.error('[POST INSIGHTS] times error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/post-insights/daily?source=&platform=&mediaType=&days=
router.get('/daily', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const source = req.query.source || 'automation';
        const platform = req.query.platform || null;
        const mediaType = req.query.mediaType || null;
        const days = parseInt(req.query.days) || 30;
        const daily = await postInsights.getDailyPerformance(userId, { source, platform, mediaType, days });
        res.json({ success: true, daily });
    } catch (error) {
        console.error('[POST INSIGHTS] daily error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/post-insights/refresh/:id  -> atualiza metricas de um post
router.post('/refresh/:id', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { post, metrics } = await postInsights.refreshPostMetrics(userId, req.params.id);
        res.json({ success: true, post, metrics });
    } catch (error) {
        console.error('[POST INSIGHTS] refresh error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/post-insights/backfill  -> recupera IDs de posts antigos (sem published_post_id) a partir das plataformas
router.post('/backfill', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const days = parseInt(req.body?.days) || 90;
        const result = await postInsights.backfillPostIds(userId, { days });
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('[POST INSIGHTS] backfill error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/post-insights/refresh-all  -> atualiza todos os posts publicados (com published_post_id)
router.post('/refresh-all', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const platform = req.body?.platform || null;
        const days = parseInt(req.body?.days) || 30;
        const results = await postInsights.refreshAllPostMetrics(userId, { platform, days });
        const ok = results.filter(r => r.ok).length;
        res.json({ success: true, total: results.length, updated: ok, results });
    } catch (error) {
        console.error('[POST INSIGHTS] refresh-all error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// POSTS AGENDADOS (downloader_schedule) — vídeos/imagens FB/IG
// ============================================================

// GET /api/post-insights/scheduled/posts?platform=&mediaType=&days=&limit=
router.get('/scheduled/posts', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const platform = req.query.platform || null;
        const mediaType = req.query.mediaType || null;
        const days = parseInt(req.query.days) || 30;
        const limit = parseInt(req.query.limit) || 50;
        const posts = await postInsights.getTopDownloaderPosts(userId, { platform, mediaType, days, limit });
        res.json({ success: true, posts });
    } catch (error) {
        console.error('[POST INSIGHTS] scheduled posts error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/post-insights/scheduled/summary?days=
router.get('/scheduled/summary', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const days = parseInt(req.query.days) || 30;
        const summary = await postInsights.getDownloaderMetricsSummary(userId, { days });
        res.json({ success: true, summary });
    } catch (error) {
        console.error('[POST INSIGHTS] scheduled summary error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/post-insights/scheduled/refresh/:id
router.post('/scheduled/refresh/:id', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { task, metrics } = await postInsights.refreshDownloaderTaskMetrics(userId, req.params.id);
        res.json({ success: true, task, metrics });
    } catch (error) {
        console.error('[POST INSIGHTS] scheduled refresh error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/post-insights/scheduled/refresh-all
router.post('/scheduled/refresh-all', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const platform = req.body?.platform || null;
        const mediaType = req.body?.mediaType || null;
        const days = parseInt(req.body?.days) || 30;
        const results = await postInsights.refreshAllDownloaderMetrics(userId, { platform, mediaType, days });
        const ok = results.filter(r => r.ok).length;
        res.json({ success: true, total: results.length, updated: ok, results });
    } catch (error) {
        console.error('[POST INSIGHTS] scheduled refresh-all error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/post-insights/scheduled/backfill  -> recupera IDs de vídeos antigos + atribui cliques
router.post('/scheduled/backfill', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const days = parseInt(req.body?.days) || 30;
        const result = await postInsights.backfillDownloaderPostIds(userId, { days });
        const clicks = await postInsights.backfillClickAttribution(userId, { days });
        res.json({ success: true, ...result, clicks });
    } catch (error) {
        console.error('[POST INSIGHTS] scheduled backfill error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/post-insights/promo-config  -> config do comentario promocional (link da oferta)
router.get('/promo-config', requireAuth, async (req, res) => {
    try {
        const cfg = await promoComments.getPromoConfig(req.user.userId);
        res.json({ success: true, enabled: cfg.enabled, hasLink: !!cfg.link, link: cfg.link || '', mode: cfg.mode, frequency: cfg.frequency });
    } catch (error) {
        console.error('[POST INSIGHTS] promo-config error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/post-insights/scheduled/link-winners  -> adiciona o link da oferta (comentario) nos posts que mais performam
// body: { days, limit (1-10), minViews }
router.post('/scheduled/link-winners', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const days = parseInt(req.body?.days) || 30;
        const limit = parseInt(req.body?.limit) || 3;
        const minViews = parseInt(req.body?.minViews) || 0;
        const dryRun = !!req.body?.dryRun;
        const source = req.body?.source || 'both';
        const goal = req.body?.goal === 'sell' ? 'sell' : 'subscribe';
        const customText = req.body?.customText || '';
        const customLink = req.body?.customLink || '';
        const pageFilter = (req.body?.pageFilter && req.body.pageFilter.platform && req.body.pageFilter.accountId)
            ? { platform: String(req.body.pageFilter.platform), accountId: String(req.body.pageFilter.accountId) }
            : null;
        const result = await promoComments.linkTopWinners(userId, { days, limit, minViews, dryRun, source, goal, customText, pageFilter, customLink });
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('[POST INSIGHTS] link-winners error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

export default router;
