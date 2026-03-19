import cron from 'node-cron';
import { prepareProductsForPosting } from './automationService.js';
import * as facebookService from './facebookService.js';
import * as whatsappService from './whatsappService.js';
import * as telegramService from './telegramService.js';
import * as instagramService from './instagramService.js';
import * as instagramGraph from './instagramGraphService.js';
import * as twitterService from './twitterService.js';
import * as pinterestService from './pinterestService.js';
import * as db from './database.js';

// Map to store active cron jobs: scheduleId -> Array of cron tasks
const activeJobs = new Map();

/**
 * Initialize scheduler by loading active schedules from DB
 */
export async function initializeScheduler() {
    console.log('[SCHEDULER] Initializing...');
    const schedules = await db.getActiveSchedules();

    schedules.forEach(schedule => {
        try {
            startJob(schedule.id, schedule.platform, schedule.config, schedule.userId);
        } catch (error) {
            console.error(`[SCHEDULER] Failed to start schedule ${schedule.id}:`, error);
        }
    });

    console.log(`[SCHEDULER] Loaded ${schedules.length} active schedules`);
}

/**
 * Start a job for a specific schedule
 */
function startJob(id, platform, config, userId) {
    // Convert to number for consistency
    const numericId = parseInt(id);

    // Stop existing jobs for this ID if any
    stopJob(numericId);

    const tasks = [];
    const times = (config.schedule.scheduleMode === 'multiple' || config.schedule.scheduleMode === 'automated') && config.schedule.times
        ? config.schedule.times
        : [config.schedule.time || '09:00'];

    times.forEach(time => {
        const [hour, minute] = time.split(':');
        let cronExpression;

        switch (config.schedule.frequency) {
            case 'daily':
                cronExpression = `${minute} ${hour} * * *`;
                break;
            case 'weekly':
                cronExpression = `${minute} ${hour} * * 1`; // Monday
                break;
            case 'monthly':
                cronExpression = `${minute} ${hour} 1 * *`; // 1st of month
                break;
            default:
                cronExpression = `${minute} ${hour} * * *`;
        }

        const task = cron.schedule(cronExpression, () => {
            console.log(`[SCHEDULER] Triggering ${platform} job (ID: ${numericId}) at ${time}`);
            runAutomation(platform, config, userId);
        });

        tasks.push(task);
    });

    activeJobs.set(numericId, tasks);
    console.log(`[SCHEDULER] Started ${tasks.length} task(s) for schedule ${numericId} (${platform})`);
}

/**
 * Stop a job
 */
function stopJob(id) {
    // Convert to number to ensure Map lookup works (HTTP params are strings)
    const numericId = parseInt(id);
    const tasks = activeJobs.get(numericId);
    if (tasks) {
        console.log(`[SCHEDULER] Stopping ${tasks.length} task(s) for schedule ${numericId}`);
        tasks.forEach(task => task.stop());
        activeJobs.delete(numericId);
        console.log(`[SCHEDULER] Schedule ${numericId} stopped successfully`);
    } else {
        console.log(`[SCHEDULER] No active tasks found for schedule ${numericId}`);
    }
}

/**
 * Create a new schedule
 */
export async function createSchedule(platform, config, userId) {
    // Save Telegram groups if present
    if (platform === 'telegram' && config.groups) {
        try {
            for (const group of config.groups) {
                await db.saveTelegramGroup({
                    groupId: group.id,
                    groupName: group.name,
                    enabled: group.enabled
                }, userId);
            }
            console.log(`[SCHEDULER] Saved ${config.groups.length} Telegram groups`);
        } catch (error) {
            console.error('[SCHEDULER] Failed to save Telegram groups:', error);
        }
    }

    const result = await db.saveSchedule(platform, config, userId);
    if (result.success && config.schedule.enabled) {
        const schedule = await db.getSchedule(result.id, userId);
        if (schedule) {
            startJob(result.id, platform, config, userId);
        }
    }
    return result;
}

/**
 * Delete a schedule
 */
export async function removeSchedule(id, userId) {
    stopJob(id);
    return await db.deleteSchedule(id, userId);
}

/**
 * Toggle a schedule
 */
export async function toggleSchedule(id, active, userId) {
    const result = await db.toggleSchedule(id, active, userId);

    if (active) {
        const schedule = await db.getSchedule(id, userId);
        if (schedule) {
            startJob(schedule.id, schedule.platform, schedule.config, userId);
        }
    } else {
        stopJob(id);
    }

    return result;
}

/**
 * Run the automation logic
 */
async function runAutomation(platform, config, userId) {
    console.log(`[AUTOMATION] Running ${platform} automation...`);

    // Check Start Date
    const todayStr = new Date().toISOString().split('T')[0];
    if (config.schedule && config.schedule.startDate && todayStr < config.schedule.startDate) {
        console.log(`[AUTOMATION] Skipping ${platform} run: Start date ${config.schedule.startDate} not reached yet. (Today: ${todayStr})`);
        return;
    }

    try {
        // Use prepareProductsForPosting from automationService
        const products = await prepareProductsForPosting(
            config.shopeeSettings,
            config.schedule.productCount,
            {}, // filters
            config.enableRotation,
            config.categoryType
        );

        console.log(`[AUTOMATION] Prepared ${products.length} products for ${platform}`);

        for (const product of products) {
            try {
                // Prepare post data
                const postData = {
                    ...product,
                    // prepareProductsForPosting already returns affiliateLink
                };

                if (platform === 'facebook' && config.facebookPages) {
                    for (const page of config.facebookPages) {
                        await facebookService.postProduct(
                            page.id,
                            page.accessToken,
                            postData,
                            config.messageTemplate || '',
                            config.mediaType || 'auto'
                        );
                    }
                }
                else if (platform === 'whatsapp' && config.whatsappRecipients) {
                    const accountId = config.accountId;
                    if (!accountId) {
                        console.error(`[AUTOMATION][User ${userId}] Missing accountId for WhatsApp schedule`);
                        continue;
                    }

                    // Check WhatsApp connection status first for this specific account
                    const whatsappStatus = whatsappService.getConnectionStatus(userId, accountId);

                    if (whatsappStatus.status !== 'connected') {
                        console.warn(`[AUTOMATION][User ${userId}][Acc ${accountId}] WhatsApp is not connected (status: ${whatsappStatus.status}). Skipping.`);
                        continue;
                    }

                    for (const recipient of config.whatsappRecipients) {
                        try {
                            await whatsappService.sendProductMessage(
                                userId,
                                accountId,
                                recipient.id,
                                postData,
                                config.messageTemplate || '',
                                config.mediaType || 'auto',
                                {
                                    simulateTyping: false,
                                    mentionAll: false,
                                    postToStatus: false
                                }
                            );
                            // Random delay between recipients
                            await new Promise(r => setTimeout(r, 5000 + Math.random() * 5000));
                        } catch (error) {
                            console.error(`[AUTOMATION][User ${userId}][Acc ${accountId}] Failed to send to ${recipient.name}:`, error);
                        }
                    }
                }
                else if (platform === 'instagram') {
                    // Instagram automation
                    await instagramService.postProduct(
                        postData,
                        config.messageTemplate || '',
                        config.groupLink || '',
                        config.customHashtags || []
                    );
                }
                else if (platform === 'telegram' && config.groups) {
                    console.log(`[AUTOMATION] Starting Telegram sending for ${config.groups.length} groups`);
                    // Telegram automation
                    for (const group of config.groups) {
                        console.log(`[AUTOMATION] Processing group: ${group.name} (Enabled: ${group.enabled})`);
                        if (!group.enabled) {
                            console.log(`[AUTOMATION] Skipping disabled group: ${group.name}`);
                            continue;
                        }

                        try {
                            console.log(`[AUTOMATION] Sending to group ${group.id}...`);
                            const result = await telegramService.postToTelegramGroup(
                                group.id,
                                postData,
                                config.botToken,
                                config.messageTemplate || '',
                                config.mediaType || 'auto'
                            );
                            console.log(`[AUTOMATION] Send result for ${group.name}:`, result);
                        } catch (err) {
                            console.error(`[AUTOMATION] Failed to send to ${group.name}:`, err);
                        }

                        // Random delay between groups (5-10s)
                        await new Promise(r => setTimeout(r, 5000 + Math.random() * 5000));
                    }
                }
                else if (platform === 'twitter') {
                    // Twitter automation
                    if (config.twitterSettings && config.twitterSettings.apiKey) {
                        twitterService.initializeTwitter(
                            config.twitterSettings.apiKey,
                            config.twitterSettings.apiSecret,
                            config.twitterSettings.accessToken,
                            config.twitterSettings.accessTokenSecret
                        );
                    }

                    await twitterService.postProduct(
                        postData,
                        config.messageTemplate || '',
                        config.hashtags || []
                    );
                }
                else if (platform === 'pinterest' && config.boardId) {
                    // Pinterest automation
                    let pinterestToken;

                    // Tentar usar token da conta específica
                    if (config.schedule && config.schedule.accountId) {
                        const account = await db.getPinterestAccountById(config.schedule.accountId, userId);
                        if (account) {
                            pinterestToken = account.access_token;
                        }
                    }

                    // Fallback para token global
                    if (!pinterestToken) {
                        pinterestToken = await db.getUserConfig(userId, 'pinterest_access_token');
                    }

                    if (!pinterestToken) {
                        console.warn('[AUTOMATION] Pinterest not connected. Skipping.');
                        continue;
                    }

                    const result = await pinterestService.createPin(
                        pinterestToken,
                        config.boardId,
                        postData.name.substring(0, 100),
                        postData.description || postData.name,
                        postData.affiliateLink,
                        postData.image
                    );

                    if (result.success) {
                        console.log(`[AUTOMATION] ✅ Pinterest: ${postData.name}`);
                        // Log sent product
                        await db.logSentProduct({
                            productId: postData.id || postData.productId,
                            productName: postData.name,
                            price: postData.price || 0,
                            commission: postData.commission || 0,
                            groupId: config.boardId,
                            groupName: 'Pinterest Board',
                            mediaType: 'IMAGE',
                            category: 'pinterest'
                        }, userId);

                        await db.logEvent('pinterest_post', {
                            productId: postData.id || postData.productId,
                            groupId: config.boardId,
                            success: true
                        }, userId);
                    }
                }

                // Delay between products
                await new Promise(r => setTimeout(r, 30000 + Math.random() * 30000)); // 30-60s delay

            } catch (error) {
                console.error(`[AUTOMATION] Error sending product ${product.productName}:`, error);
            }
        }

    } catch (error) {
        console.error(`[AUTOMATION] Fatal error in ${platform} run:`, error);
    }
}

// ============================================
// STORY QUEUE WORKER
// Runs every minute. Posts stories that are due.
// ============================================

let storyWorkerRunning = false;

export function startStoryWorker() {
    console.log('[STORY WORKER] Starting cron (every minute)...');

    cron.schedule('* * * * *', async () => {
        if (storyWorkerRunning) return; // prevent overlapping runs
        storyWorkerRunning = true;

        try {
            const dueStories = await db.getDueStories();
            if (dueStories.length === 0) {
                storyWorkerRunning = false;
                return;
            }

            console.log(`[STORY WORKER] Found ${dueStories.length} story(ies) to post`);

            for (const story of dueStories) {
                try {
                    let result;

                    if (story.platform === 'instagram') {
                        result = await instagramGraph.postStoryGraph(story.media_url, story.media_type, story.account_id);
                    } else if (story.platform === 'facebook') {
                        // For Facebook we need page token — fetch from DB using account_id
                        const pages = await db.getFacebookPageById(story.account_id);
                        if (!pages) {
                            console.warn(`[STORY WORKER] FB page not found: ${story.account_id}`);
                            await db.markStoryFailed(story.id, 'Página não encontrada');
                            continue;
                        }
                        result = await facebookService.postStory(pages.id, pages.access_token, story.media_url, story.media_type);
                    } else {
                        console.warn(`[STORY WORKER] Unknown platform: ${story.platform}`);
                        continue;
                    }

                    if (result && result.success) {
                        await db.markStoryPosted(story.id);
                        console.log(`[STORY WORKER] ✅ Posted story ${story.id} on ${story.platform}`);
                    } else {
                        await db.markStoryFailed(story.id, result?.error || 'Erro desconhecido');
                        console.error(`[STORY WORKER] ❌ Failed story ${story.id}: ${result?.error}`);
                    }

                    // Small delay between stories to avoid rate limiting
                    await new Promise(r => setTimeout(r, 5000));

                } catch (err) {
                    console.error(`[STORY WORKER] Error posting story ${story.id}:`, err.message);
                    await db.markStoryFailed(story.id, err.message);
                }
            }
        } catch (err) {
            console.error('[STORY WORKER] Fatal error:', err.message);
        } finally {
            storyWorkerRunning = false;
        }
    });
}

// ============================================
// REELS QUEUE WORKER
// Runs every minute. Posts Reels that are due.
// ============================================

let reelsWorkerRunning = false;

export function startReelsWorker() {
    console.log('[REELS WORKER] Starting cron (every minute)...');

    cron.schedule('* * * * *', async () => {
        if (reelsWorkerRunning) return;
        reelsWorkerRunning = true;

        try {
            // 1. Process Instagram Reels
            const pendingIg = await db.getPendingInstagramVideos();
            if (pendingIg.length > 0) {
                console.log(`[REELS WORKER] Found ${pendingIg.length} Instagram Reel(s) to post`);
                const publicUrl = await db.getSystemConfig('public_url') || '';

                for (const reel of pendingIg) {
                    try {
                        const accounts = await db.getInstagramAccounts(reel.user_id);
                        if (accounts.length === 0) {
                            await db.markInstagramVideoFailed(reel.id, 'Nenhuma conta do Instagram vinculada');
                            continue;
                        }

                        const account = accounts[0]; // Logic could be improved to select specific account
                        
                        let videoUrl;
                        if (reel.media_url) {
                            videoUrl = reel.media_url;
                            console.log(`[REELS WORKER] Using media_url (Telegram) for Reel ${reel.id}: ${videoUrl}`);
                        } else {
                            videoUrl = `${publicUrl}/${reel.video_path.replace(/\\/g, '/')}`;
                            console.log(`[REELS WORKER] Using local path for Reel ${reel.id}: ${videoUrl}`);
                        }

                        const result = await instagramGraph.postVideoGraph(
                            videoUrl,
                            reel.caption,
                            account.account_id,
                            {
                                shareToFeed: reel.share_to_feed,
                                allowComments: reel.allow_comments
                            }
                        );

                        if (result.success) {
                            await db.markInstagramVideoPosted(reel.id);
                            console.log(`[REELS WORKER] ✅ Posted IG Reel ${reel.id}`);
                        } else {
                            await db.markInstagramVideoFailed(reel.id, result.error);
                        }
                    } catch (err) {
                        console.error(`[REELS WORKER] Error posting IG Reel ${reel.id}:`, err);
                        await db.markInstagramVideoFailed(reel.id, err.message);
                    }
                }
            }

            // 2. Process Facebook Reels
            const pendingFb = await db.getPendingFacebookVideos();
            if (pendingFb.length > 0) {
                console.log(`[REELS WORKER] Found ${pendingFb.length} Facebook Reel(s) to post`);
                const publicUrl = await db.getSystemConfig('public_url') || '';

                for (const reel of pendingFb) {
                    try {
                        // Get user's FB pages
                        const pages = await db.getFacebookPages(reel.user_id);
                        if (pages.length === 0) {
                            await db.markFacebookVideoFailed(reel.id, 'Nenhuma página do Facebook vinculada');
                            continue;
                        }

                        const page = pages[0]; // Logic could be improved
                        const videoUrl = `${publicUrl}/${reel.video_path.replace(/\\/g, '/')}`;

                        // facebookService.postStory with 'video' handles Reels
                        const result = await facebookService.postStory(page.id, page.access_token, videoUrl, 'video');

                        if (result.success) {
                            await db.markFacebookVideoPosted(reel.id);
                            console.log(`[REELS WORKER] ✅ Posted FB Reel ${reel.id}`);
                        } else {
                            await db.markFacebookVideoFailed(reel.id, result.error);
                        }
                    } catch (err) {
                        console.error(`[REELS WORKER] Error posting FB Reel ${reel.id}:`, err);
                        await db.markFacebookVideoFailed(reel.id, err.message);
                    }
                }
            }

        } catch (err) {
            console.error('[REELS WORKER] Fatal error:', err.message);
        } finally {
            reelsWorkerRunning = false;
        }
    });
}
