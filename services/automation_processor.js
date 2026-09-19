import cron from 'node-cron';
import { query } from './database.js';
import { generateImage, generateCaptionAndHashtags } from './ai_generator.js';

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

// Process pending posts (Generate Image and Text)
async function processPendingGenerations() {
    // Find up to 5 pending posts
    const result = await query(`
        SELECT p.*, a.visual_identity, a.auto_approve, a.page_ids, a.user_id 
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
            
            // Determine next status based on auto-approve
            const nextStatus = post.auto_approve ? 'scheduled' : 'generated';
            
            // We need to schedule it to some time if it's auto_approve
            // For now we set it 5 minutes from now if auto_approve, else NULL to wait for manual schedule
            let scheduledDate = null;
            if (post.auto_approve) {
                // Here we should ideally check 'schedule_times' from the automation to pick the next available slot.
                // For MVP, schedule to next 5 minutes
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
        SELECT p.*, a.page_ids 
        FROM automation_posts p
        JOIN automations a ON p.automation_id = a.id
        WHERE p.status = 'scheduled' AND a.status = 'active' AND p.scheduled_date <= NOW()
        ORDER BY p.scheduled_date ASC
        LIMIT 5
    `);
    
    if (result.rows.length === 0) return;

    console.log(`[AutomationCron] Processing ${result.rows.length} scheduled publications...`);

    for (const post of result.rows) {
        try {
            // Update to publishing
            await query('UPDATE automation_posts SET status = $1 WHERE id = $2', ['publishing', post.id]);
            
            // Call social media posting service here
            // e.g. await publishToPages(post.page_ids, post.image_url, post.description, post.hashtags);
            // This would integrate with facebookService, instagramService, etc.
            
            // Simulating API call for this implementation snippet
            console.log(`[AutomationCron] Published post ID ${post.id} to pages: ${post.page_ids}`);
            
            await query('UPDATE automation_posts SET status = $1, published_date = NOW() WHERE id = $2', ['published', post.id]);
        } catch (error) {
            console.error(`[AutomationCron] Failed to publish post ${post.id}:`, error);
            await query('UPDATE automation_posts SET status = $1, error_message = $2 WHERE id = $3', ['error', error.message, post.id]);
        }
    }
}
