import cron from 'node-cron';
import { query, getFacebookPages, getInstagramAccounts } from './database.js';
import { generateImage, generateCaptionAndHashtags } from './ai_generator.js';
import * as facebookService from './facebookService.js';
import * as instagramGraph from './instagramGraphService.js';

let generationRunning = false;
let publishingRunning = false;

// Initialize Cron Jobs
export function initAutomationCron() {
    // 1. Generation Job: Runs every 5 minutes to generate content for pending posts
    cron.schedule('*/5 * * * *', async () => {
        if (generationRunning) return;
        generationRunning = true;
        try {
            await processPendingGenerations();
        } catch (error) {
            console.error('[AutomationCron] Error in generation job:', error);
        } finally {
            generationRunning = false;
        }
    });

    // 2. Publishing Job: Runs every 1 minute to publish scheduled posts
    cron.schedule('* * * * *', async () => {
        if (publishingRunning) return;
        publishingRunning = true;
        try {
            await processScheduledPublishing();
        } catch (error) {
            console.error('[AutomationCron] Error in publishing job:', error);
        } finally {
            publishingRunning = false;
        }
    });
    
    console.log('[AutomationCron] Cron jobs initialized successfully');
}

// Dispara o processamento imediatamente sem esperar o tempo do cron (útil para "Postar Agora" ou Aprovações)
export function triggerAutomationProcessing() {
    setImmediate(async () => {
        if (!generationRunning) {
            generationRunning = true;
            try {
                await processPendingGenerations();
            } catch (error) {
                console.error('[AutomationCron] Error in triggered generation job:', error);
            } finally {
                generationRunning = false;
            }
        }
        if (!publishingRunning) {
            publishingRunning = true;
            try {
                await processScheduledPublishing();
            } catch (error) {
                console.error('[AutomationCron] Error in triggered publishing job:', error);
            } finally {
                publishingRunning = false;
            }
        }
    });
}

// Process pending posts (Generate Image and Text)
async function processPendingGenerations() {
    // Find up to 5 pending posts
    const result = await query(`
        SELECT p.*, a.visual_identity, a.auto_approve, a.schedule_times, a.page_ids, a.user_id 
        FROM automation_posts p
        JOIN automations a ON p.automation_id = a.id
        WHERE p.status = 'pending' AND a.status = 'active'
        ORDER BY p.created_at ASC
        LIMIT 5
    `);
    
    if (result.rows.length === 0) return;

    console.log(`[AutomationCron] Processing ${result.rows.length} pending generations...`);

    for (const post of result.rows) {
        try {
            // Update status to generating
            await query('UPDATE automation_posts SET status = $1 WHERE id = $2', ['generating', post.id]);
            
            // Generate Image
            const imageUrl = await generateImage(post.title, post.visual_identity, post.user_id);
            
            // Generate Caption & Hashtags
            const textData = await generateCaptionAndHashtags(post.title, post.user_id);
            
        // Determine next status based on auto-approve or post_mode
        const isNow = post.schedule_times && (post.schedule_times.mode === 'now' || post.schedule_times === 'now');
        const nextStatus = (post.auto_approve || isNow) ? 'scheduled' : 'generated';
        
        let scheduledDate = null;
        if (isNow) {
            // Postar Agora: marca para publicar IMEDIATAMENTE (agora mesmo)
            scheduledDate = new Date().toISOString();
        } else if (post.auto_approve) {
            const date = new Date();
            date.setMinutes(date.getMinutes() + 5);
            scheduledDate = date.toISOString();
        }

            await query(`
                UPDATE automation_posts 
                SET image_url = $1, description = $2, hashtags = $3, status = $4, scheduled_date = $5, updated_at = NOW()
                WHERE id = $6
            `, [imageUrl, textData.description, textData.hashtags, nextStatus, scheduledDate, post.id]);
            
            console.log(`[AutomationCron] Generated content for post ID ${post.id}`);
        } catch (error) {
            console.error(`[AutomationCron] Failed to generate for post ${post.id}:`, error);
            await query('UPDATE automation_posts SET status = $1, error_message = $2 WHERE id = $3', ['error', error.message, post.id]);
        }
    }
}

// Process posts that are ready to be published
async function processScheduledPublishing() {
    // Find scheduled posts that are due
    const result = await query(`
        SELECT p.*, a.page_ids, a.user_id
        FROM automation_posts p
        JOIN automations a ON p.automation_id = a.id
        WHERE p.status = 'scheduled' AND a.status = 'active' AND (p.scheduled_date IS NULL OR p.scheduled_date <= NOW())
        ORDER BY p.scheduled_date ASC
        LIMIT 5
    `);
    
    if (result.rows.length === 0) return;

    console.log(`[AutomationCron] Processing ${result.rows.length} scheduled publications...`);

    for (const post of result.rows) {
        try {
            await query('UPDATE automation_posts SET status = $1 WHERE id = $2', ['publishing', post.id]);

            const caption = `${post.description || ''}\n\n${post.hashtags || ''}`.trim();
            let pageIds = [];
            try {
                pageIds = typeof post.page_ids === 'string' ? JSON.parse(post.page_ids) : (post.page_ids || []);
            } catch {
                pageIds = [post.page_ids];
            }

            console.log(`[AutomationCron] Publicando post ${post.id} para as redes/páginas:`, pageIds);

            if (pageIds.length > 0) {
                const fbPages = await getFacebookPages(post.user_id);
                const igAccounts = await getInstagramAccounts(post.user_id);

                for (const targetId of pageIds) {
                    try {
                        // Tenta encontrar em Páginas do Facebook
                        const fbPage = fbPages.find(p => String(p.id) === String(targetId));
                        if (fbPage) {
                            const token = fbPage.accessToken || fbPage.access_token;
                            await facebookService.postPhoto(fbPage.id, token, post.image_url, caption, post.user_id);
                            console.log(`[AutomationCron] Sucesso ao publicar no Facebook (Página: ${fbPage.name || fbPage.id})`);
                            continue;
                        }

                        // Tenta encontrar em Contas do Instagram
                        const igAcc = igAccounts.find(a => String(a.id) === String(targetId) || String(a.accountId) === String(targetId) || String(a.username) === String(targetId));
                        if (igAcc) {
                            await instagramGraph.postImageGraph(post.image_url, caption, igAcc.id);
                            console.log(`[AutomationCron] Sucesso ao publicar no Instagram (${igAcc.username || igAcc.id})`);
                            continue;
                        }

                        console.warn(`[AutomationCron] Conta/Página ID ${targetId} não foi encontrada no banco para o usuário ${post.user_id}`);
                    } catch (pubErr) {
                        console.error(`[AutomationCron] Erro ao publicar para ID ${targetId}:`, pubErr.message);
                    }
                }
            }

            await query('UPDATE automation_posts SET status = $1, published_date = NOW() WHERE id = $2', ['published', post.id]);
        } catch (error) {
            console.error(`[AutomationCron] Failed to publish post ${post.id}:`, error);
            await query('UPDATE automation_posts SET status = $1, error_message = $2 WHERE id = $3', ['error', error.message, post.id]);
        }
    }
}
