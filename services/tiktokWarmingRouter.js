import express from 'express';
import * as db from './database.js';
import { requireAuth } from './authService.js';
import { generateImage, generateWarmingContent, applyWarmingTextOverlay } from './ai_generator.js';

const router = express.Router();

/* ─────────────────────────────────────────────────────────────────────────
 * 🔥 AQUECIMENTO DE CONTA (TikTok Warming)
 * Ferramenta editorial que ajuda a preparar conteúdos para estimular
 * engajamento orgânico. NÃO publica, NÃO automatiza interações e NÃO
 * promete resultados. Todo dado de desempenho é registro manual.
 * ───────────────────────────────────────────────────────────────────────── */

const VALID_FORMATS = ['9:16', '1:1', '4:5'];

// Descrição de estilo usada pelo gerador de imagem (não é card, então não
// recebe texto do modelo: o texto é aplicado por código em vetor).
const WARMING_STYLE_DESCRIPTIONS = {
    fotografia_realista: 'Fotografia realista, profissional e moderna',
    cinematografico: 'Fotografia cinematográfica com iluminação dramática',
    ilustracao: 'Ilustração digital vibrante e criativa',
    '3d': '3D Render moderno e futurista',
    editorial: 'Editorial de alta moda e estética luxo'
};

function normalizeHandle(username) {
    const clean = String(username || '').trim().replace(/^@+/, '');
    return clean ? `@${clean}` : '';
}

function buildVisualPrompt(item, format, style) {
    const base = String(item.visual_prompt || item.concept || '').trim();
    const ratio = format === '9:16'
        ? 'vertical 9:16 mobile-first composition'
        : (format === '4:5' ? 'vertical 4:5 mobile-first composition' : 'square 1:1 composition');
    return [
        base || 'A striking, emotionally engaging social media visual scene.',
        '',
        `Art style: ${WARMING_STYLE_DESCRIPTIONS[style] || WARMING_STYLE_DESCRIPTIONS.fotografia_realista}.`,
        `Composition: ${ratio}, strong visual contrast, one clear central subject, cinematic depth of field, room left for text overlay at the bottom.`,
        'CRITICAL: absolutely NO text, NO letters, NO words, NO numbers, NO watermarks, NO logos, NO UI elements in the image.'
    ].join('\n');
}

/* ─────────────────────────── CONTAS ─────────────────────────── */

// GET /api/tiktok/warming/accounts
router.get('/accounts', requireAuth, async (req, res) => {
    try {
        const accounts = await db.getTikTokWarmingAccounts(req.user.userId);
        res.json({ success: true, accounts });
    } catch (error) {
        console.error('[WARMING] list accounts error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/tiktok/warming/accounts
router.post('/accounts', requireAuth, async (req, res) => {
    try {
        const { name, username } = req.body || {};
        if (!name || !String(name).trim()) {
            return res.status(400).json({ success: false, error: 'Informe o nome de identificação da conta.' });
        }
        if (!username || !String(username).trim()) {
            return res.status(400).json({ success: false, error: 'Informe o @usuário do TikTok.' });
        }
        const account = await db.createTikTokWarmingAccount(req.user.userId, {
            name: String(name).trim(),
            username: String(username).trim().replace(/^@+/, ''),
            niche: req.body.niche,
            audience: req.body.audience,
            language: req.body.language,
            visual_style: req.body.visual_style
        });
        res.json({ success: true, account });
    } catch (error) {
        console.error('[WARMING] create account error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// PUT /api/tiktok/warming/accounts/:id
router.put('/accounts/:id', requireAuth, async (req, res) => {
    try {
        const { name, username } = req.body || {};
        if (!name || !String(name).trim()) {
            return res.status(400).json({ success: false, error: 'Informe o nome de identificação da conta.' });
        }
        if (!username || !String(username).trim()) {
            return res.status(400).json({ success: false, error: 'Informe o @usuário do TikTok.' });
        }
        const existing = await db.getTikTokWarmingAccountById(req.params.id, req.user.userId);
        if (!existing) return res.status(404).json({ success: false, error: 'Conta não encontrada.' });

        const account = await db.updateTikTokWarmingAccount(req.params.id, req.user.userId, {
            name: String(name).trim(),
            username: String(username).trim().replace(/^@+/, ''),
            niche: req.body.niche,
            audience: req.body.audience,
            language: req.body.language,
            visual_style: req.body.visual_style
        });
        res.json({ success: true, account });
    } catch (error) {
        console.error('[WARMING] update account error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /api/tiktok/warming/accounts/:id
router.delete('/accounts/:id', requireAuth, async (req, res) => {
    try {
        const existing = await db.getTikTokWarmingAccountById(req.params.id, req.user.userId);
        if (!existing) return res.status(404).json({ success: false, error: 'Conta não encontrada.' });
        await db.deleteTikTokWarmingAccount(req.params.id, req.user.userId);
        res.json({ success: true });
    } catch (error) {
        console.error('[WARMING] delete account error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/* ─────────────────────── GERAÇÃO DE IMAGENS ─────────────────────── */

// POST /api/tiktok/warming/generate
router.post('/generate', requireAuth, async (req, res) => {
    const userId = req.user.userId;
    try {
        const {
            warmingAccountId,
            category = 'identificacao_emocional',
            quantity = 2,
            format = '9:16',
            intensity = 'moderada',
            style = 'fotografia_realista',
            tone = 'curioso',
            idea = '',
            includeQuestion = true,
            variations = false
        } = req.body || {};

        if (!warmingAccountId) {
            return res.status(400).json({ success: false, error: 'Selecione uma conta antes de gerar.' });
        }

        const account = await db.getTikTokWarmingAccountById(warmingAccountId, userId);
        if (!account) return res.status(404).json({ success: false, error: 'Conta não encontrada.' });

        const safeCount = Math.min(Math.max(parseInt(quantity) || 2, 1), 10);
        const safeFormat = VALID_FORMATS.includes(format) ? format : '9:16';
        const handle = normalizeHandle(account.username);

        // 1. Conteúdo editorial (conceito, frase, legenda, pergunta, hashtags, variações)
        const contents = await generateWarmingContent({
            category,
            quantity: safeCount,
            intensity,
            style,
            tone,
            idea,
            includeQuestion: includeQuestion !== false,
            variations: !!variations,
            account
        }, userId);

        const created = [];
        const errors = [];

        // 2. Uma imagem real por conteúdo (com texto aplicado em vetor)
        for (const item of contents) {
            try {
                const visualPrompt = buildVisualPrompt(item, safeFormat, style);
                const background = await generateImage(
                    item.concept || item.image_text || 'Engagement visual',
                    {
                        style: WARMING_STYLE_DESCRIPTIONS[style] || WARMING_STYLE_DESCRIPTIONS.fotografia_realista,
                        aspect_ratio: safeFormat,
                        imageProvider: 'auto',
                        watermark: '',
                        prompt_override: visualPrompt
                    },
                    userId,
                    null,
                    null
                );

                if (!background) {
                    errors.push('O provedor de imagem não retornou resultado para um dos conteúdos.');
                    continue;
                }

                const finalUrl = await applyWarmingTextOverlay(background, {
                    phrase: item.image_text,
                    question: includeQuestion ? item.comment_question : '',
                    handle
                });

                const saved = await db.createTikTokWarmingImage(userId, {
                    warming_account_id: account.id,
                    category: item.category || category,
                    concept: item.concept,
                    emotional_trigger: item.emotional_trigger,
                    visual_prompt: item.visual_prompt,
                    image_text: item.image_text,
                    caption: item.caption,
                    comment_question: includeQuestion ? item.comment_question : '',
                    hashtags: item.hashtags,
                    variations: item.variations,
                    image_url: finalUrl,
                    format: safeFormat,
                    style,
                    tone,
                    intensity
                });
                created.push(saved);
            } catch (itemErr) {
                console.warn('[WARMING] item generation error:', itemErr.message);
                errors.push(itemErr.message);
            }
        }

        if (created.length === 0) {
            return res.status(502).json({
                success: false,
                error: errors[0] || 'Não foi possível gerar as imagens. Confira as chaves de API em Configurações → APIs.'
            });
        }

        res.json({ success: true, count: created.length, images: created, errors });
    } catch (error) {
        console.error('[WARMING] generate error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/tiktok/warming/images?accountId=&favorites=
router.get('/images', requireAuth, async (req, res) => {
    try {
        const accountId = req.query.accountId ? parseInt(req.query.accountId) : null;
        let images = await db.getTikTokWarmingImages(req.user.userId, accountId);
        if (String(req.query.favorites) === 'true') {
            images = images.filter(img => img.is_favorite);
        }
        res.json({ success: true, images });
    } catch (error) {
        console.error('[WARMING] list images error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// PATCH /api/tiktok/warming/images/:id (favoritar / editar textos)
router.patch('/images/:id', requireAuth, async (req, res) => {
    try {
        const existing = await db.getTikTokWarmingImageById(req.params.id, req.user.userId);
        if (!existing) return res.status(404).json({ success: false, error: 'Imagem não encontrada.' });
        const image = await db.updateTikTokWarmingImage(req.params.id, req.user.userId, req.body || {});
        res.json({ success: true, image: image || existing });
    } catch (error) {
        console.error('[WARMING] update image error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /api/tiktok/warming/images/:id
router.delete('/images/:id', requireAuth, async (req, res) => {
    try {
        const existing = await db.getTikTokWarmingImageById(req.params.id, req.user.userId);
        if (!existing) return res.status(404).json({ success: false, error: 'Imagem não encontrada.' });
        await db.deleteTikTokWarmingImage(req.params.id, req.user.userId);
        res.json({ success: true });
    } catch (error) {
        console.error('[WARMING] delete image error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/tiktok/warming/images/:id/regenerate
// Regenera a imagem do zero usando a mesma frase/conceito (mantém os textos).
router.post('/images/:id/regenerate', requireAuth, async (req, res) => {
    const userId = req.user.userId;
    try {
        const existing = await db.getTikTokWarmingImageById(req.params.id, userId);
        if (!existing) return res.status(404).json({ success: false, error: 'Imagem não encontrada.' });
        const account = await db.getTikTokWarmingAccountById(existing.warming_account_id, userId);
        if (!account) return res.status(404).json({ success: false, error: 'Conta não encontrada.' });

        const visualPrompt = buildVisualPrompt(
            { visual_prompt: existing.visual_prompt, concept: existing.concept },
            existing.format || '9:16',
            existing.style || 'fotografia_realista'
        );

        const background = await generateImage(
            existing.concept || existing.image_text || 'Engagement visual',
            {
                style: WARMING_STYLE_DESCRIPTIONS[existing.style] || WARMING_STYLE_DESCRIPTIONS.fotografia_realista,
                aspect_ratio: existing.format || '9:16',
                imageProvider: 'auto',
                watermark: '',
                prompt_override: visualPrompt
            },
            userId, null, null
        );
        if (!background) return res.status(502).json({ success: false, error: 'O provedor de imagem não retornou resultado.' });

        const finalUrl = await applyWarmingTextOverlay(background, {
            phrase: existing.image_text,
            question: existing.comment_question,
            handle
        });

        const updated = await db.createTikTokWarmingImage(userId, {
            warming_account_id: existing.warming_account_id,
            category: existing.category,
            concept: existing.concept,
            emotional_trigger: existing.emotional_trigger,
            visual_prompt: existing.visual_prompt,
            image_text: existing.image_text,
            caption: existing.caption,
            comment_question: existing.comment_question,
            hashtags: existing.hashtags,
            variations: existing.variations,
            image_url: finalUrl,
            format: existing.format,
            style: existing.style,
            tone: existing.tone,
            intensity: existing.intensity
        });
        res.json({ success: true, image: updated });
    } catch (error) {
        console.error('[WARMING] regenerate error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/tiktok/warming/images/:id/rerender
// Edita os textos e re-renderiza a imagem NA MESMA linha (novo fundo + novo texto).
router.post('/images/:id/rerender', requireAuth, async (req, res) => {
    const userId = req.user.userId;
    try {
        const existing = await db.getTikTokWarmingImageById(req.params.id, userId);
        if (!existing) return res.status(404).json({ success: false, error: 'Imagem não encontrada.' });
        const account = await db.getTikTokWarmingAccountById(existing.warming_account_id, userId);
        const handle = normalizeHandle(account?.username);

        const newPhrase = req.body.image_text !== undefined ? String(req.body.image_text).trim() : (existing.image_text || '');
        const newQuestion = req.body.comment_question !== undefined ? String(req.body.comment_question).trim() : (existing.comment_question || '');
        if (!newPhrase) return res.status(400).json({ success: false, error: 'Informe o texto principal da imagem.' });

        const visualPrompt = buildVisualPrompt(
            { visual_prompt: existing.visual_prompt, concept: existing.concept },
            existing.format || '9:16',
            existing.style || 'fotografia_realista'
        );

        const background = await generateImage(
            existing.concept || newPhrase || 'Engagement visual',
            {
                style: WARMING_STYLE_DESCRIPTIONS[existing.style] || WARMING_STYLE_DESCRIPTIONS.fotografia_realista,
                aspect_ratio: existing.format || '9:16',
                imageProvider: 'auto',
                watermark: '',
                prompt_override: visualPrompt
            },
            userId, null, null
        );
        if (!background) return res.status(502).json({ success: false, error: 'O provedor de imagem não retornou resultado.' });

        const finalUrl = await applyWarmingTextOverlay(background, {
            phrase: newPhrase,
            question: newQuestion,
            handle
        });

        const updated = await db.updateTikTokWarmingImage(req.params.id, userId, {
            image_text: req.body.image_text ?? existing.image_text,
            caption: req.body.caption ?? existing.caption,
            comment_question: req.body.comment_question ?? existing.comment_question,
            hashtags: req.body.hashtags ?? existing.hashtags,
            concept: req.body.concept ?? existing.concept,
            image_url: finalUrl
        });
        res.json({ success: true, image: updated });
    } catch (error) {
        console.error('[WARMING] rerender error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/tiktok/warming/images/:id/variation
// Cria uma NOVA imagem com outra abordagem, partindo da ideia/conceito atual.
router.post('/images/:id/variation', requireAuth, async (req, res) => {
    const userId = req.user.userId;
    try {
        const existing = await db.getTikTokWarmingImageById(req.params.id, userId);
        if (!existing) return res.status(404).json({ success: false, error: 'Imagem não encontrada.' });
        const account = await db.getTikTokWarmingAccountById(existing.warming_account_id, userId);
        if (!account) return res.status(404).json({ success: false, error: 'Conta não encontrada.' });

        const providedIdea = String(req.body?.idea || '').trim();
        const pool = String(existing.variations || '').split('|').map(s => s.trim()).filter(Boolean);
        const idea = providedIdea || (pool.length ? pool[Math.floor(Math.random() * pool.length)] : (existing.concept || existing.image_text || ''));

        const contents = await generateWarmingContent({
            category: existing.category || 'identificacao_emocional',
            quantity: 1,
            intensity: existing.intensity || 'moderada',
            style: existing.style || 'fotografia_realista',
            tone: existing.tone || 'curioso',
            idea,
            includeQuestion: !!existing.comment_question,
            variations: false,
            account
        }, userId);

        const item = contents[0];
        if (!item) return res.status(502).json({ success: false, error: 'Não foi possível gerar a variação.' });

        const safeFormat = VALID_FORMATS.includes(existing.format) ? existing.format : '9:16';
        const visualPrompt = buildVisualPrompt(item, safeFormat, existing.style || 'fotografia_realista');
        const background = await generateImage(
            item.concept || item.image_text || 'Engagement visual',
            {
                style: WARMING_STYLE_DESCRIPTIONS[existing.style] || WARMING_STYLE_DESCRIPTIONS.fotografia_realista,
                aspect_ratio: safeFormat,
                imageProvider: 'auto',
                watermark: '',
                prompt_override: visualPrompt
            },
            userId, null, null
        );
        if (!background) return res.status(502).json({ success: false, error: 'O provedor de imagem não retornou resultado.' });

        const finalUrl = await applyWarmingTextOverlay(background, {
            phrase: item.image_text,
            question: existing.comment_question ? item.comment_question : '',
            handle: normalizeHandle(account.username)
        });

        const saved = await db.createTikTokWarmingImage(userId, {
            warming_account_id: account.id,
            category: item.category || existing.category,
            concept: item.concept,
            emotional_trigger: item.emotional_trigger,
            visual_prompt: item.visual_prompt,
            image_text: item.image_text,
            caption: item.caption,
            comment_question: existing.comment_question ? item.comment_question : '',
            hashtags: item.hashtags,
            variations: item.variations,
            image_url: finalUrl,
            format: safeFormat,
            style: existing.style,
            tone: existing.tone,
            intensity: existing.intensity
        });
        res.json({ success: true, image: saved });
    } catch (error) {
        console.error('[WARMING] variation error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/* ─────────────────── REGISTRO MANUAL DE PUBLICAÇÕES ─────────────────── */

// GET /api/tiktok/warming/publications?accountId=
router.get('/publications', requireAuth, async (req, res) => {
    try {
        const accountId = req.query.accountId ? parseInt(req.query.accountId) : null;
        const publications = await db.getTikTokWarmingPublications(req.user.userId, accountId);
        res.json({ success: true, publications });
    } catch (error) {
        console.error('[WARMING] list publications error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/tiktok/warming/publications
router.post('/publications', requireAuth, async (req, res) => {
    try {
        const { warmingAccountId, warmingImageId, likes, comments, shares, views, notes } = req.body || {};
        if (!warmingAccountId) {
            return res.status(400).json({ success: false, error: 'Selecione a conta da publicação.' });
        }
        const account = await db.getTikTokWarmingAccountById(warmingAccountId, req.user.userId);
        if (!account) return res.status(404).json({ success: false, error: 'Conta não encontrada.' });

        const publication = await db.createTikTokWarmingPublication(req.user.userId, {
            warming_account_id: account.id,
            warming_image_id: warmingImageId || null,
            platform: 'tiktok',
            likes: parseInt(likes) || 0,
            comments: parseInt(comments) || 0,
            shares: parseInt(shares) || 0,
            views: parseInt(views) || 0,
            notes: notes || 'Registro manual',
            manual_entry: true
        });
        res.json({ success: true, publication });
    } catch (error) {
        console.error('[WARMING] create publication error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// PATCH /api/tiktok/warming/publications/:id
router.patch('/publications/:id', requireAuth, async (req, res) => {
    try {
        const publication = await db.updateTikTokWarmingPublication(req.params.id, req.user.userId, req.body || {});
        if (!publication) return res.status(404).json({ success: false, error: 'Registro não encontrado.' });
        res.json({ success: true, publication });
    } catch (error) {
        console.error('[WARMING] update publication error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /api/tiktok/warming/publications/:id
router.delete('/publications/:id', requireAuth, async (req, res) => {
    try {
        await db.deleteTikTokWarmingPublication(req.params.id, req.user.userId);
        res.json({ success: true });
    } catch (error) {
        console.error('[WARMING] delete publication error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
