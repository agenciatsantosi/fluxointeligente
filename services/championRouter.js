import express from 'express';
import * as db from './database.js';
import { requireAuth } from './authService.js';
import * as champion from './championMonitorService.js';

const router = express.Router();

// GET /api/champions/settings -> limite de views + monitoramento ativo
router.get('/settings', requireAuth, async (req, res) => {
    try {
        const settings = await champion.getGlobalSettings(req.user.userId);
        res.json({ success: true, ...settings });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/champions/settings -> salva limite de views + ativação
router.post('/settings', requireAuth, async (req, res) => {
    try {
        const settings = await champion.setGlobalSettings(req.user.userId, {
            threshold: req.body?.threshold,
            enabled: req.body?.enabled,
        });
        res.json({ success: true, ...settings });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/champions/page-configs -> configs de monetização por página
router.get('/page-configs', requireAuth, async (req, res) => {
    try {
        const configs = await db.getChampionPageConfigs(req.user.userId);
        res.json({ success: true, configs });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/champions/page-configs -> cria/atualiza config de uma página
router.post('/page-configs', requireAuth, async (req, res) => {
    try {
        const { platform, accountId, ...data } = req.body || {};
        if (!platform || !accountId) {
            return res.status(400).json({ success: false, error: 'Informe plataforma e conta.' });
        }
        const cfg = await db.upsertChampionPageConfig(req.user.userId, platform, accountId, data);
        res.json({ success: true, config: cfg });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/champions/posts?status=&platform=&accountId=&days=
router.get('/posts', requireAuth, async (req, res) => {
    try {
        const posts = await db.getChampionPosts(req.user.userId, {
            status: req.query.status || null,
            platform: req.query.platform || null,
            accountId: req.query.accountId || null,
            days: req.query.days ? parseInt(req.query.days) : null,
            limit: 200,
        });
        const stats = await db.getChampionStats(req.user.userId);
        const sentToday = await db.countChampionCommentsSentToday(req.user.userId);
        // Resolve nomes das páginas/contas
        const fb = await db.getFacebookPages(req.user.userId).catch(() => []);
        const ig = await db.getInstagramAccounts(req.user.userId).catch(() => []);
        const nameOf = (platform, accountId) => {
            const id = String(accountId);
            if (platform === 'instagram') {
                const a = ig.find(x => String(x.account_id || x.id) === id);
                return a?.username ? `@${a.username}` : (a?.name || id);
            }
            const p = fb.find(x => String(x.id) === id);
            return p?.name || id;
        };
        const shaped = posts.map(p => ({
            ...p,
            account_name: nameOf(p.platform, p.account_id),
            platform_label: p.platform === 'instagram' ? 'Instagram' : 'Facebook',
        }));
        res.json({ success: true, posts: shaped, stats, sentToday });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/champions/scan -> força detecção + monetização agora
router.post('/scan', requireAuth, async (req, res) => {
    try {
        const result = await champion.runChampionCycle(req.user.userId);
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/champions/:id/retry -> tenta de novo um que falhou
router.post('/:id/retry', requireAuth, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        // Volta para "identified" (com tentativas zeradas) para o próximo ciclo reprocessar.
        const r = await db.query(
            `UPDATE champion_posts SET status = 'identified', attempts = 0, error_message = NULL, updated_at = NOW()
             WHERE user_id = $1 AND id = $2 RETURNING id`,
            [req.user.userId, id]
        );
        if (!r.rowCount) return res.status(404).json({ success: false, error: 'Post campeão não encontrado.' });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
