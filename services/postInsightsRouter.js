import express from 'express';
import * as db from './database.js';
import { requireAuth } from './authService.js';
import * as postInsights from './postInsightsService.js';

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

export default router;
