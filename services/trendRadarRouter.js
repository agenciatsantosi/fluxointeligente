import express from 'express';
import { requireAuth } from './authService.js';
import { searchTrends } from './trendRadarService.js';
import { remixTrendingContent, inferPageNiche } from './ai_generator.js';

/**
 * Radar de Tendências — rotas.
 * Tudo somente-leitura: busca conteúdo viral para depois remodelarmos com IA.
 * Requer autenticação; nenhuma chave de IA ou token sai daqui.
 */
const router = express.Router();

// GET /api/trends/search?q=umbanda&sources=youtube,instagram&limit=20
//     &pageName=...&pageUsername=...&pagePlatform=instagram&instagramAccountId=3
// Se `q` vier vazio e houver página, a IA descobre o nicho automaticamente.
router.get('/search', requireAuth, async (req, res) => {
    try {
        const userId = req.user?.id || req.user?.userId;
        let q = String(req.query.q || '').trim();
        const pageName = String(req.query.pageName || '').trim();
        const pageUsername = String(req.query.pageUsername || '').trim();
        const pagePlatform = String(req.query.pagePlatform || '').trim();
        const instagramAccountId = req.query.instagramAccountId ? parseInt(req.query.instagramAccountId) : null;

        // Sem tema digitado, mas com página selecionada: a IA descobre o nicho.
        let detected = null;
        if (!q && (pageName || pageUsername)) {
            detected = await inferPageNiche({ name: pageName, username: pageUsername, platform: pagePlatform }, userId).catch(() => null);
            if (detected?.queries?.[0]) q = detected.queries[0];
            else if (detected?.nicho) q = detected.nicho;
        }
        if (!q) {
            return res.status(400).json({ success: false, error: 'Informe o tema/nicho ou escolha uma página para a IA detectar o nicho.' });
        }

        const rawSources = String(req.query.sources || 'youtube,instagram');
        const allowed = ['youtube', 'reddit', 'instagram'];
        const sources = rawSources.split(',').map(s => s.trim().toLowerCase()).filter(s => allowed.includes(s));
        const limit = Math.min(Math.max(parseInt(req.query.limit || '20') || 20, 1), 40);
        const minViews = Math.max(parseInt(req.query.minViews || '0') || 0, 0);
        const shortOnly = req.query.shortOnly === '1' || req.query.shortOnly === 'true';
        const timeframe = ['hour', 'day', 'week', 'month', 'year', 'all'].includes(req.query.timeframe) ? req.query.timeframe : 'month';

        const data = await searchTrends({
            query: q,
            sources: sources.length ? sources : ['youtube'],
            limit, minViews, shortOnly, timeframe,
            userId, instagramAccountId
        });
        res.json({ success: true, ...data, detectedNiche: detected?.nicho || null, nicheQueries: detected?.queries || [] });
    } catch (error) {
        console.error('[TRENDS] search error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/trends/remix  { theme, winners:[{title,views,channel,platform}], count, style }
router.post('/remix', requireAuth, async (req, res) => {
    try {
        const { theme = '', winners = [], count = 10, style = '' } = req.body || {};
        const userId = req.user?.id || req.user?.userId;
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

export default router;
