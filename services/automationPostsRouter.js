import express from 'express';
import { query, getUserConfig, getSystemConfig } from './database.js';
import { requireAuth } from './authService.js';
import { generateImage, generateCaptionAndHashtags, generateDilemmasBatch } from './ai_generator.js';
import { triggerAutomationProcessing } from './automation_processor.js';
import { runImageCleanup } from './imageCleanupService.js';

const router = express.Router();

// POST /api/automations/generate-dilemmas (Gera dilemas por Nicho e Tema com IA)
router.post('/generate-dilemmas', requireAuth, async (req, res) => {
    try {
        const { niche, theme, count, style } = req.body;
        const userId = req.user?.id || req.user?.userId;

        const dilemmas = await generateDilemmasBatch({ niche, theme, count, style }, userId);
        res.json({ success: true, dilemmas });
    } catch (err) {
        console.error('[Generate Dilemmas Error]:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/automations/preview
router.post('/preview', requireAuth, async (req, res) => {
    try {
        const { title, visual_identity } = req.body;
        const userId = req.user?.id || req.user?.userId;

        // 🛡️ Validação antecipada: cards com texto precisam de provedor compatível
        const isCard = visual_identity && typeof visual_identity === 'object' && visual_identity.style
            ? ['kawaii', 'carta_3d', 'caderno', 'minimalista', 'papel_rasgado'].some(id => 
                String(visual_identity.style).toLowerCase().includes(id))
            : false;

        if (isCard) {
            const provider = visual_identity.imageProvider || 'auto';
            
            // Se o provider explicitamente escolhido for OpenAI, valida a chave
            const needsOpenAI = provider === 'openai';
            
            if (needsOpenAI) {
                const openaiApiKey = (await getUserConfig(userId, 'openai_api_key'))
                    || (await getUserConfig(userId, 'OPENAI_API_KEY'))
                    || (await getSystemConfig('openai_api_key'))
                    || (await getSystemConfig('OPENAI_API_KEY'))
                    || process.env.OPENAI_API_KEY || '';
                if (!openaiApiKey?.trim()) {
                    return res.status(400).json({
                        success: false,
                        error: 'Cards com frase escrita na imagem exigem chave OpenAI configurada.',
                        details: 'Vá em Configurações do Sistema → APIs → OpenAI API Key e cole uma key com acesso a gpt-image-1 ou dall-e-3. Ou selecione outro provedor (Pollinations, Hugging Face, Cloudflare) que não precisa de OpenAI.'
                    });
                }
            }
        }

        const imageUrl = await generateImage(title, visual_identity, userId);
        const textData = await generateCaptionAndHashtags(title, userId);

        if (!imageUrl) {
            return res.status(502).json({
                success: false,
                error: 'O provedor de imagem selecionado não conseguiu gerar a imagem. Verifique suas credenciais ou selecione outro provedor (ex: Pollinations, Cloudflare ou Hugging Face).'
            });
        }

        res.json({
            success: true,
            imageUrl,
            data: { image_url: imageUrl, imageUrl, ...textData }
        });
    } catch (error) {
        console.error('[Automation Preview Error]:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/automations
router.get('/', requireAuth, async (req, res) => {
    try {
        const userId = req.user?.id || req.user?.userId;
        const includeCompleted = req.query.includeCompleted === 'true';
        const result = await query('SELECT * FROM automations WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
        
        // Carrega contas do usuário uma única vez (evita N+1 queries)
        const [fbRes, igRes] = await Promise.all([
            query('SELECT id, name FROM facebook_pages WHERE user_id = $1', [userId]).catch(() => ({ rows: [] })),
            query('SELECT id, username, COALESCE(username, id::text) as name FROM instagram_accounts WHERE user_id = $1', [userId]).catch(() => ({ rows: [] }))
        ]);
        const accountMap = new Map();
        for (const p of fbRes.rows) accountMap.set(String(p.id), { name: p.name, platform: 'facebook' });
        for (const a of igRes.rows) accountMap.set(String(a.id), { name: a.name, platform: 'instagram' });

        const automations = [];
        for (const auto of result.rows) {
            const stats = await query(`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                    SUM(CASE WHEN status IN ('generating','generated') THEN 1 ELSE 0 END) as generated,
                    SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) as published,
                    SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error,
                    SUM(CASE WHEN status IN ('scheduled','publishing') THEN 1 ELSE 0 END) as scheduled
                FROM automation_posts 
                WHERE automation_id = $1
            `, [auto.id]);
            
            const s = stats.rows[0] || {};
            const total = parseInt(s.total || 0);
            const pending = parseInt(s.pending || 0);
            const generated = parseInt(s.generated || 0);
            const scheduled = parseInt(s.scheduled || 0);
            const error = parseInt(s.error || 0);
            const published = parseInt(s.published || 0);

            // Próximo post a ser publicado (agendado com data mais próxima primeiro, depois pendentes mais antigos)
            const nextPost = await query(`
                SELECT id, title, status, scheduled_date FROM automation_posts
                WHERE automation_id = $1 AND status IN ('pending','generating','generated','scheduled','publishing')
                ORDER BY CASE WHEN scheduled_date IS NULL THEN 1 ELSE 0 END, scheduled_date ASC, created_at ASC
                LIMIT 1
            `, [auto.id]).catch(() => ({ rows: [] }));

            // Automação concluída: todos os posts já foram publicados (ou falharam)
            const isCompleted = total > 0 && pending === 0 && generated === 0 && scheduled === 0 && error === 0;

            // Filtra concluídas por padrão (só fica o que ainda tem trabalho pendente)
            if (!includeCompleted && isCompleted) continue;

            // Resolve nomes das páginas/contas destino
            let targets = [];
            try {
                const ids = typeof auto.page_ids === 'string' ? JSON.parse(auto.page_ids) : (auto.page_ids || []);
                targets = ids.map((id) => {
                    const acc = accountMap.get(String(id));
                    return acc
                        ? { id: String(id), name: acc.name, platform: acc.platform }
                        : { id: String(id), name: null, platform: 'desconhecido' };
                });
            } catch { targets = []; }

            automations.push({
                ...auto,
                targets,
                is_completed: isCompleted,
                stats: { ...s, pending, generated, scheduled, error, published, total },
                next_post: nextPost.rows[0] || null
            });
        }
        
        res.json({ success: true, data: automations });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/automations
router.post('/', requireAuth, async (req, res) => {
    try {
        const { name, page_ids, visual_identity, start_date, end_date, schedule_times, auto_approve } = req.body;
        const userId = req.user?.id || req.user?.userId;

        const startDateVal = (start_date && String(start_date).trim() !== '') ? start_date : null;
        const endDateVal = (end_date && String(end_date).trim() !== '') ? end_date : null;
        const nameVal = name || 'Automação sem nome';
        
        const result = await query(`
            INSERT INTO automations (user_id, name, page_ids, visual_identity, start_date, end_date, schedule_times, auto_approve)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `, [userId, nameVal, JSON.stringify(page_ids || []), JSON.stringify(visual_identity || {}), startDateVal, endDateVal, JSON.stringify(schedule_times || {}), !!auto_approve]);
        
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/automations/:id/posts
router.get('/:id/posts', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await query('SELECT * FROM automation_posts WHERE automation_id = $1 ORDER BY created_at ASC', [id]);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/automations/:id/posts
router.post('/:id/posts', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id || req.user?.userId;
        const { titles } = req.body; // Array of titles
        
        // Valida ownership
        const autoCheck = await query('SELECT id FROM automations WHERE id = $1 AND user_id = $2', [id, userId]);
        if (autoCheck.rows.length === 0) {
            return res.status(403).json({ success: false, error: 'Automação não encontrada ou permissão negada.' });
        }
        
        const inserted = [];
        for (const title of titles) {
            if (!title.trim()) continue;
            const result = await query(`
                INSERT INTO automation_posts (automation_id, title, status)
                VALUES ($1, $2, 'pending')
                RETURNING *
            `, [id, title.trim()]);
            inserted.push(result.rows[0]);
        }
        
        if (inserted.length > 0) {
            triggerAutomationProcessing();
        }
        
        res.json({ success: true, data: inserted });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// PUT /api/automations/:id/posts (atualiza ou insere títulos em lote)
router.put('/:id/posts', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id || req.user?.userId;
        const { titles, replace } = req.body; // replace: true -> apaga existentes e insere novos
        
        const autoCheck = await query('SELECT id FROM automations WHERE id = $1 AND user_id = $2', [id, userId]);
        if (autoCheck.rows.length === 0) {
            return res.status(403).json({ success: false, error: 'Automação não encontrada ou permissão negada.' });
        }
        
        if (replace) {
            await query('DELETE FROM automation_posts WHERE automation_id = $1', [id]);
        }
        
        const inserted = [];
        for (const title of titles) {
            if (!title.trim()) continue;
            const result = await query(`
                INSERT INTO automation_posts (automation_id, title, status)
                VALUES ($1, $2, 'pending')
                RETURNING *
            `, [id, title.trim()]);
            inserted.push(result.rows[0]);
        }
        
        if (inserted.length > 0) {
            triggerAutomationProcessing();
        }
        
        res.json({ success: true, data: inserted });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// PUT /api/automations/posts/:postId
router.put('/posts/:postId', requireAuth, async (req, res) => {
    try {
        const { postId } = req.params;
        const { description, hashtags, status, scheduled_date, image_url } = req.body;
        
        const updates = [];
        const values = [];
        let index = 1;
        
        if (description !== undefined) { updates.push(`description = $${index++}`); values.push(description); }
        if (hashtags !== undefined) { updates.push(`hashtags = $${index++}`); values.push(hashtags); }
        if (status !== undefined) { updates.push(`status = $${index++}`); values.push(status); }
        if (scheduled_date !== undefined) { updates.push(`scheduled_date = $${index++}`); values.push(scheduled_date); }
        if (image_url !== undefined) { updates.push(`image_url = $${index++}`); values.push(image_url); }

        // Ao (re)agendar um post, zera o contador de tentativas e limpa erro/retry anteriores
        if (status !== undefined || scheduled_date !== undefined) {
            updates.push(`publish_attempts = 0`);
            updates.push(`retry_at = NULL`);
            updates.push(`error_message = NULL`);
        }
        
        values.push(postId);
        
        if (updates.length > 0) {
            const result = await query(`
                UPDATE automation_posts 
                SET ${updates.join(', ')}, updated_at = NOW()
                WHERE id = $${index}
                RETURNING *
            `, values);
            triggerAutomationProcessing();
            res.json({ success: true, data: result.rows[0] });
        } else {
            res.json({ success: true, message: 'Nenhuma alteração enviada.' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/automations/posts/:postId/regenerate
router.post('/posts/:postId/regenerate', requireAuth, async (req, res) => {
    try {
        const { postId } = req.params;
        const userId = req.user?.id || req.user?.userId;

        const postRes = await query(`
            SELECT p.*, a.visual_identity 
            FROM automation_posts p 
            JOIN automations a ON p.automation_id = a.id 
            WHERE p.id = $1 AND a.user_id = $2
        `, [postId, userId]);

        if (postRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Post não encontrado.' });
        }

        const post = postRes.rows[0];
        let visualIdentity = post.visual_identity;
        if (typeof visualIdentity === 'string') {
            try { visualIdentity = JSON.parse(visualIdentity); } catch (e) {}
        }

        const imageUrl = await generateImage(post.title, visualIdentity, userId);
        const textData = await generateCaptionAndHashtags(post.title, userId);

        const updated = await query(`
            UPDATE automation_posts 
            SET image_url = $1, description = $2, hashtags = $3, status = 'generated',
                publish_attempts = 0, retry_at = NULL, error_message = NULL, updated_at = NOW()
            WHERE id = $4
            RETURNING *
        `, [imageUrl, textData.description, textData.hashtags, postId]);

        res.json({ success: true, data: updated.rows[0] });
    } catch (error) {
        console.error('[AI] Error regenerating post:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/automations/:id/trigger-processing - Dispara processamento de posts existentes
router.post('/:id/trigger-processing', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id || req.user?.userId;
        
        // Valida ownership
        const autoCheck = await query('SELECT id FROM automations WHERE id = $1 AND user_id = $2', [id, userId]);
        if (autoCheck.rows.length === 0) {
            return res.status(403).json({ success: false, error: 'Automação não encontrada ou permissão negada.' });
        }
        
        // Atualiza posts pending/generated para scheduled com data agora
        const updateResult = await query(`
            UPDATE automation_posts 
            SET status = 'scheduled', scheduled_date = NOW(), updated_at = NOW()
            WHERE automation_id = $1 AND status IN ('pending', 'generated', 'scheduled')
            RETURNING id
        `, [id]);
        
        console.log(`[API] Trigger processing: ${updateResult.rows.length} posts agendados para publicação imediata`);
        
        // Dispara o processamento imediato
        triggerAutomationProcessing();
        
        res.json({ 
            success: true, 
            message: `${updateResult.rows.length} posts agendados para publicação imediata`,
            triggered: updateResult.rows.length
        });
    } catch (error) {
        console.error('[API] Error triggering processing:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/automations/cleanup-images
router.post('/cleanup-images', requireAuth, async (req, res) => {
    try {
        const log = await runImageCleanup();
        res.json({
            success: true,
            message: `Limpeza concluída: ${log.removed} imagem(ns) removida(s), ${log.cleared} referência(s) limpa(s).`,
            log
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /api/automations/:id
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        await query('DELETE FROM automations WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// PUT /api/automations/:id
router.put('/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id || req.user?.userId;
        const { name, page_ids, visual_identity, start_date, end_date, schedule_times, auto_approve, status } = req.body;

        const fields = [];
        const values = [];
        let idx = 1;

        if (status !== undefined) {
            fields.push(`status = $${idx++}`);
            values.push(status);
        }
        if (name !== undefined) {
            fields.push(`name = $${idx++}`);
            values.push(name || 'Automação sem nome');
        }
        if (page_ids !== undefined) {
            fields.push(`page_ids = $${idx++}`);
            values.push(JSON.stringify(page_ids || []));
        }
        if (visual_identity !== undefined) {
            fields.push(`visual_identity = $${idx++}`);
            values.push(JSON.stringify(visual_identity || {}));
        }
        if (start_date !== undefined) {
            fields.push(`start_date = $${idx++}`);
            values.push((start_date && String(start_date).trim() !== '') ? start_date : null);
        }
        if (end_date !== undefined) {
            fields.push(`end_date = $${idx++}`);
            values.push((end_date && String(end_date).trim() !== '') ? end_date : null);
        }
        if (schedule_times !== undefined) {
            fields.push(`schedule_times = $${idx++}`);
            values.push(JSON.stringify(schedule_times || {}));
        }
        if (auto_approve !== undefined) {
            fields.push(`auto_approve = $${idx++}`);
            values.push(!!auto_approve);
        }

        if (fields.length === 0) {
            return res.json({ success: true, message: 'Nenhuma alteração enviada.' });
        }

        values.push(id);
        values.push(userId);

        const result = await query(
            `UPDATE automations SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx++} AND user_id = $${idx++} RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Automação não encontrada ou não pertence ao usuário.' });
        }

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
