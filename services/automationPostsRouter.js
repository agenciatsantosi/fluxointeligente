import express from 'express';
import { query } from './database.js';
import { requireAuth } from './authService.js';
import { generateImage, generateCaptionAndHashtags } from './ai_generator.js';

const router = express.Router();

// POST /api/automations/preview
router.post('/preview', requireAuth, async (req, res) => {
    try {
        const { title, visual_identity } = req.body;
        const userId = req.user.id;
        
        const imageUrl = await generateImage(title, visual_identity, userId);
        const textData = await generateCaptionAndHashtags(title, userId);
        
        res.json({ success: true, data: { image_url: imageUrl, ...textData } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/automations
router.get('/', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await query('SELECT * FROM automations WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
        
        // Count posts per automation
        const automations = [];
        for (const auto of result.rows) {
            const stats = await query(`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                    SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) as published,
                    SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error,
                    SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) as scheduled
                FROM automation_posts 
                WHERE automation_id = $1
            `, [auto.id]);
            
            automations.push({
                ...auto,
                stats: stats.rows[0]
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
        const userId = req.user.id;
        
        const result = await query(`
            INSERT INTO automations (user_id, name, page_ids, visual_identity, start_date, end_date, schedule_times, auto_approve)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `, [userId, name, JSON.stringify(page_ids), JSON.stringify(visual_identity), start_date, end_date, JSON.stringify(schedule_times), auto_approve]);
        
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
        const { titles } = req.body; // Array of titles
        
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
        
        values.push(postId);
        
        if (updates.length > 0) {
            const result = await query(`
                UPDATE automation_posts 
                SET ${updates.join(', ')}, updated_at = NOW()
                WHERE id = $${index}
                RETURNING *
            `, values);
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
        const userId = req.user.id;

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
            SET image_url = $1, description = $2, hashtags = $3, status = 'generated', error_message = NULL, updated_at = NOW()
            WHERE id = $4
            RETURNING *
        `, [imageUrl, textData.description, textData.hashtags, postId]);

        res.json({ success: true, data: updated.rows[0] });
    } catch (error) {
        console.error('[AI] Error regenerating post:', error);
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
        const { status } = req.body;
        if(status) {
            const result = await query('UPDATE automations SET status = $1 WHERE id = $2 RETURNING *', [status, id]);
            res.json({ success: true, data: result.rows[0] });
        } else {
            res.json({ success: true });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
