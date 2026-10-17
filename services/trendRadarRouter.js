import express from 'express';
import { requireAuth } from './authService.js';
import { searchTrends } from './trendRadarService.js';
import { remixTrendingContent, inferPageNiche } from './ai_generator.js';
import {
    saveTrendSearch, getTrendSearches, getTrendSearchItems, deleteTrendSearch
} from './database.js';

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
            detected = await inferPageNiche({ name: pageName, username: pageUsername, platform: pagePlatform }, userId).catch(() => null);
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
        const timeframe = ['hour', 'day', 'week', 'month', 'year', 'all'].includes(req.query.timeframe) ? req.query.timeframe : 'month';

        const data = await searchTrends({
            query: q,
            mode,
            sources: sources.length ? sources : ['youtube'],
            limit, minViews, shortOnly, timeframe,
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

export default router;
