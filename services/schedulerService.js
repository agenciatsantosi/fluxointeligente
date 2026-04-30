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
import * as notifications from './notificationService.js';

// Map to store active cron jobs: scheduleId -> Array of cron tasks
const activeJobs = new Map();

/**
 * Initialize scheduler by loading active schedules from DB
 */
export async function initializeScheduler() {
    console.log('[SCHEDULER] Initializing...');
    const schedules = await db.getActiveSchedules();

    // Start workers
    startStoryWorker();
    startReelsWorker();
    startAutomationWorker(); // New worker for dynamic scheduling

    // Plan executions for active schedules
    for (const schedule of schedules) {
        try {
            // 1. Clear OLD pending tasks from the past that were never executed
            // This prevents "mass posting" when the server restarts
            await db.clearOldPendingTasks(schedule.id);

            await planDailyExecutions(schedule.id, schedule.platform, schedule.config, schedule.userId);
            // We still need to keep a basic "anchor" to re-plan every day at midnight
            startDailyReplanner(schedule.id, schedule.platform, schedule.config, schedule.userId);
        } catch (error) {
            console.error(`[SCHEDULER] Failed to plan schedule ${schedule.id}:`, error);
        }
    }

    console.log(`[SCHEDULER] Loaded and planned ${schedules.length} active schedules`);
}

/**
 * Start a job (Legacy name, now Plans dynamic executions)
 */
export async function startJob(id, platform, config, userId) {
    const numericId = parseInt(id);
    console.log(`[SCHEDULER] Planning dynamic executions for schedule ${numericId} (${platform})`);
    
    // 1. Clear existing pending tasks for this schedule to avoid duplicates
    await db.clearAutomationQueue(numericId);
    
    // 2. Plan new tasks for the next 24 hours
    await planDailyExecutions(numericId, platform, config, userId);
    
    // 3. Start a daily replanner (at 00:00)
    startDailyReplanner(numericId, platform, config, userId);
}

/**
 * Plans Randomized executions for the next 24 hours
 */
async function planDailyExecutions(id, platform, config, userId) {
    const times = (config.schedule.scheduleMode === 'multiple' || config.schedule.scheduleMode === 'automated') && config.schedule.times
        ? config.schedule.times
        : [config.schedule.time || '09:00'];
    
    const variationMinutes = config.schedule.randomVariation || 0;
    const now = new Date();
    
    for (const baseTime of times) {
        const [hour, minute] = baseTime.split(':').map(Number);
        
        // Calculate planned time for today or tomorrow
        let plannedTime = new Date();
        plannedTime.setHours(hour, minute, 0, 0);
        
        // Apply random variation
        if (variationMinutes > 0) {
            const variation = (Math.random() * variationMinutes * 2) - variationMinutes;
            plannedTime.setMinutes(plannedTime.getMinutes() + Math.round(variation));
        }
        
        // If the time already passed today, check if it's within a small tolerance (10 min + variation)
        // to stay on today's schedule if it just passed or is very close.
        const toleranceMs = (variationMinutes || 10) * 60 * 1000;
        if (plannedTime.getTime() < now.getTime() - toleranceMs) {
            plannedTime.setDate(plannedTime.getDate() + 1);
        }
        
        console.log(`[SCHEDULER] Planning ${platform} task for ${plannedTime.toLocaleString()} (Base: ${baseTime})`);
        await db.addToAutomationQueue(id, platform, plannedTime, userId);
    }
}

/**
 * Set up a cron to replan at midnight
 */
function startDailyReplanner(id, platform, config, userId) {
    const numericId = parseInt(id);
    stopJob(numericId); // Stop existing cron for this specific replanning
    
    const replanTask = cron.schedule('0 0 * * *', () => {
        console.log(`[SCHEDULER] Midnight replan for schedule ${numericId}`);
        planDailyExecutions(numericId, platform, config, userId);
    });
    
    activeJobs.set(numericId, [replanTask]);
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
    await db.clearAutomationQueue(id);
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
        await db.clearAutomationQueue(id);
    }

    return result;
}

/**
 * Run a schedule immediately (Manual trigger)
 */
export async function runScheduleNow(id, userId) {
    const schedule = await db.getSchedule(id, userId);
    if (!schedule) throw new Error('Agendamento não encontrado');
    
    const config = typeof schedule.config === 'string' ? JSON.parse(schedule.config) : schedule.config;
    
    console.log(`[SCHEDULER] Manual trigger for schedule ${id} (${schedule.platform})`);
    
    // Use the existing runAutomation logic with productCount override (only 1 product for manual test)
    console.log(`[SCHEDULER] Starting background automation for user ${userId} (Manual Test: 1 product)...`);
    const testConfig = { ...config, schedule: { ...config.schedule, productCount: 1 } };

    // PROFESSIONAL CHECK: If it's Telegram, verify the bot token BEFORE starting
    if (schedule.platform === 'telegram' && testConfig.botToken) {
        const { testTelegramConnection } = await import('./telegramService.js');
        const validation = await testTelegramConnection(testConfig.botToken);
        if (!validation.success) {
            console.error(`[SCHEDULER] Bot token validation failed for schedule ${id}: ${validation.error}`);
            throw new Error(`O Bot selecionado para este agendamento está INVÁLIDO ou DESCONECTADO. Por favor, verifique o Token no BotFather. (Erro: ${validation.error})`);
        }
    }
    
    runAutomation(schedule.platform, testConfig, userId).then(() => {
        console.log(`[SCHEDULER] Manual run finished successfully for ${id}`);
    }).catch(err => {
        console.error(`[SCHEDULER] Manual run failed for ${id}:`, err);
        notifications.addNotification(
            'error', 
            schedule.platform, 
            'Erro na Execução Manual', 
            `Falha ao executar ${schedule.platform}: ${err.message}`,
            userId
        );
    });
    
    return { success: true, message: 'Execução iniciada com sucesso' };
}


/**
 * Run the automation logic
 */
async function runAutomation(platform, config, userId) {
    console.log(`[AUTOMATION] Running ${platform} automation for user ${userId}...`);
    
    // Notify user that automation is starting
    notifications.addNotification(
        'info', 
        platform, 
        'Automação Iniciada', 
        `O agendamento para ${platform} começou a ser processado agora.`,
        userId
    );

    // Check Start Date
    const todayStr = new Date().toISOString().split('T')[0];
    if (config.schedule && config.schedule.startDate && todayStr < config.schedule.startDate) {
        console.log(`[AUTOMATION] Skipping ${platform} run: Start date ${config.schedule.startDate} not reached yet. (Today: ${todayStr})`);
        return;
    }

    try {
        // 1. Identify destinations and calculate total products needed
        let destinations = [null]; // Default for single-destination platforms
        if (platform === 'facebook') destinations = config.facebookPages || [];
        else if (platform === 'whatsapp') destinations = config.whatsappRecipients || [];
        else if (platform === 'instagram') destinations = config.instagramAccounts?.length > 0 ? config.instagramAccounts : [null];
        else if (platform === 'telegram') destinations = (config.groups || []).filter(g => g.enabled !== false);

        if (destinations.length === 0) {
            console.log(`[AUTOMATION] No active destinations for ${platform}. Skipping.`);
            return;
        }

        const baseProductCount = config.schedule.productCount || 1;
        const totalNeeded = baseProductCount * destinations.length;

        // 2. Fetch products (enough for all destinations if possible)
        const products = await prepareProductsForPosting(
            config.shopeeSettings,
            totalNeeded,
            {}, // filters
            config.schedule?.enableRotation !== false,
            config.categoryType,
            userId
        );

        console.log(`[AUTOMATION] Prepared ${products.length} products for ${platform} across ${destinations.length} destinations`);

        // 3. Process each destination with its unique set of products
        for (let i = 0; i < destinations.length; i++) {
            const dest = destinations[i];
            const destProducts = products.slice(i * baseProductCount, (i + 1) * baseProductCount);

            if (destProducts.length === 0) {
                if (i > 0) {
                    console.log(`[AUTOMATION] Ran out of unique products for destination #${i + 1}. Stopping.`);
                    break;
                } else {
                    throw new Error('Nenhum produto encontrado para postagem.');
                }
            }

            for (const product of destProducts) {
                try {
                    const postData = { ...product };
                    const isStory = config.mediaType === 'story' || config.automationType === 'story' || config.postType === 'story';
                    const isReel = config.mediaType === 'reel' || config.mediaType === 'reels' || config.automationType === 'reel' || config.postType === 'reels' || config.postType === 'reel';

                    let result;

                    if (platform === 'facebook') {
                        const page = dest;
                        const isStoryFB = config.mediaType === 'story' || config.automationType === 'story';
                        const isReelFB = config.mediaType === 'reel' || config.mediaType === 'reels' || config.automationType === 'reel';

                        if (isStoryFB || isReelFB) {
                            console.log(`[AUTOMATION] Posting FB ${isStoryFB ? 'Story' : 'Reel'} for page ${page.id}`);
                            result = await facebookService.wrapMetaAction(userId, async () => {
                                const freshPages = await db.getFacebookPages(userId);
                                const freshPage = freshPages.find(p => String(p.id) === String(page.id));
                                const currentToken = (freshPage?.accessToken || freshPage?.access_token) || page.accessToken;
                                
                                return await facebookService.postStory(
                                    page.id, 
                                    currentToken, 
                                    product.videoUrl || product.imageUrl, 
                                    product.videoUrl ? 'video' : 'image'
                                );
                            });
                        } else {
                            result = await facebookService.wrapMetaAction(userId, async () => {
                                const freshPages = await db.getFacebookPages(userId);
                                const freshPage = freshPages.find(p => String(p.id) === String(page.id));
                                const currentToken = (freshPage?.accessToken || freshPage?.access_token) || page.accessToken;

                                return await facebookService.postProduct(
                                    page.id,
                                    currentToken,
                                    { ...postData, imageUrl: product.imageUrl },
                                    config.messageTemplate || '',
                                    config.mediaType || 'auto'
                                );
                            });
                        }

                        if (result?.success) {
                            await db.logSentProduct({
                                productId: postData.productId || postData.id,
                                productName: postData.productName || postData.name,
                                price: postData.price,
                                commission: postData.commission,
                                groupId: page.id,
                                groupName: page.name || 'Facebook Page',
                                mediaType: isStoryFB ? 'STORY' : (isReelFB ? 'REEL' : 'FEED'),
                                category: 'facebook'
                            }, userId);

                            await db.logEvent('facebook_send', { productId: postData.productId || postData.id, groupId: page.id, success: true }, userId);
                        }
                    } 
                    else if (platform === 'whatsapp') {
                        const recipient = dest;
                        const accountId = config.accountId;
                        if (!accountId) continue;

                        const whatsappStatus = whatsappService.getConnectionStatus(userId, accountId);
                        if (whatsappStatus.status === 'connected') {
                            await whatsappService.sendProductMessage(
                                userId, accountId, recipient.id, postData,
                                config.messageTemplate || '', config.mediaType || 'auto',
                                { simulateTyping: false, mentionAll: false, postToStatus: false }
                            );

                            await db.logSentProduct({
                                productId: postData.productId || postData.id, 
                                productName: postData.productName || postData.name, 
                                price: postData.price, 
                                commission: postData.commission,
                                groupId: recipient.id, groupName: recipient.name || 'WhatsApp Contact', mediaType: 'MESSAGE', category: 'whatsapp'
                            }, userId);

                            await db.logEvent('whatsapp_send', { productId: postData.productId || postData.id, groupId: recipient.id, success: true }, userId);
                        }
                    }
                    else if (platform === 'instagram') {
                        const account = dest;
                        if (account) {
                            if (isStory) {
                                result = await facebookService.wrapMetaAction(userId, async () => {
                                    return await instagramGraph.postStoryGraph(product.videoUrl || product.imageUrl, product.videoUrl ? 'video' : 'image', account.id);
                                });
                            } else if (isReel && product.videoUrl) {
                                result = await facebookService.wrapMetaAction(userId, async () => {
                                    return await instagramGraph.postVideoGraph(product.videoUrl, postData.name + '\n' + (config.messageTemplate || ''), account.id, { shareToFeed: true });
                                });
                            } else {
                                result = await facebookService.wrapMetaAction(userId, async () => {
                                    return await instagramGraph.postProductGraph(product, config.messageTemplate || '', config.groupLink || '', config.customHashtags || [], account.id);
                                });
                            }

                            if (result?.success) {
                                await db.logSentProduct({
                                    productId: postData.productId || postData.id, 
                                    productName: postData.productName || postData.name, 
                                    price: postData.price, 
                                    commission: postData.commission,
                                    groupId: account.id, groupName: account.username || 'Instagram Account', mediaType: isStory ? 'STORY' : (isReel ? 'REEL' : 'FEED'), category: 'instagram'
                                }, userId);
                                await db.logEvent('instagram_send', { productId: postData.productId || postData.id, groupId: account.id, success: true }, userId);
                            }
                        } else {
                            await instagramService.postProduct(postData, config.messageTemplate || '', config.groupLink || '', config.customHashtags || []);
                        }
                    }
                    else if (platform === 'telegram') {
                        const group = dest;
                        const resultTelegram = await telegramService.postToTelegramGroup(group.id, postData, config.botToken, config.messageTemplate || '', config.mediaType || 'auto');
                        if (resultTelegram.success) {
                            await db.logSentProduct({
                                productId: postData.productId || postData.id, 
                                productName: postData.productName || postData.name, 
                                price: postData.price, 
                                commission: postData.commission,
                                groupId: group.id, groupName: group.name || 'Telegram Group', mediaType: 'MESSAGE', category: 'telegram'
                            }, userId);
                            await db.logEvent('telegram_send', { productId: postData.productId || postData.id, groupId: group.id, success: true }, userId);
                        }
                    }
                    else if (platform === 'twitter') {
                        if (config.twitterSettings?.apiKey) {
                            twitterService.initializeTwitter(config.twitterSettings.apiKey, config.twitterSettings.apiSecret, config.twitterSettings.accessToken, config.twitterSettings.accessTokenSecret);
                        }
                        await twitterService.postProduct(postData, config.messageTemplate || '', config.hashtags || []);
                    }
                    else if (platform === 'pinterest' && config.boardId) {
                        let pinterestToken;
                        if (config.schedule?.accountId) {
                            const account = await db.getPinterestAccountById(config.schedule.accountId, userId);
                            if (account) pinterestToken = account.access_token;
                        }
                        if (!pinterestToken) pinterestToken = await db.getUserConfig(userId, 'pinterest_access_token');
                        
                        if (pinterestToken) {
                            const resPin = await pinterestService.createPin(pinterestToken, config.boardId, postData.name.substring(0, 100), postData.description || postData.name, postData.affiliateLink, postData.imageUrl);
                            if (resPin.success) {
                                await db.logSentProduct({
                                    productId: postData.id, productName: postData.name, price: postData.price, commission: postData.commission,
                                    groupId: config.boardId, groupName: 'Pinterest Board', mediaType: 'IMAGE', category: 'pinterest'
                                }, userId);
                                await db.logEvent('pinterest_post', { productId: postData.id, groupId: config.boardId, success: true }, userId);
                            }
                        }
                    }

                    // Delay between products (30-60s)
                    await new Promise(r => setTimeout(r, 30000 + Math.random() * 30000));

                } catch (error) {
                    console.error(`[AUTOMATION] Error sending product ${product.productName}:`, error);
                }
            }
        }

        // Notify user of success
        notifications.addNotification(
            'success', 
            platform, 
            'Automação Concluída', 
            `A postagem para ${platform} foi realizada com sucesso (${products.length} itens).`,
            userId
        );

    } catch (error) {
        console.error(`[AUTOMATION] Fatal error in ${platform} run:`, error);
        notifications.addNotification(
            'error', 
            platform, 
            'Falha na Automação', 
            `Ocorreu um erro ao processar o agendamento de ${platform}: ${error.message}`,
            userId
        );
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
                        result = await facebookService.wrapMetaAction(story.user_id, async () => {
                            return await instagramGraph.postStoryGraph(story.media_url, story.media_type, story.account_id);
                        });
                    } else if (story.platform === 'facebook') {
                        result = await facebookService.wrapMetaAction(story.user_id, async () => {
                            // Re-fetch page to ensure fresh token on retry
                            const page = await db.getFacebookPageById(story.account_id);
                            if (!page) throw new Error('Página não encontrada');
                            return await facebookService.postStory(page.id, page.access_token, story.media_url, story.media_type);
                        });
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

                        const result = await facebookService.wrapMetaAction(reel.user_id, async () => {
                            return await instagramGraph.postVideoGraph(
                                videoUrl,
                                reel.caption,
                                account.account_id,
                                {
                                    shareToFeed: reel.share_to_feed,
                                    allowComments: reel.allow_comments
                                }
                            );
                        });

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
                        // facebookService.postStory with 'video' handles Reels
                        const result = await facebookService.wrapMetaAction(reel.user_id, async () => {
                            // Re-fetch page for fresh token
                            const freshPages = await db.getFacebookPages(reel.user_id);
                            const page = freshPages.find(p => String(p.id) === String(reel.account_id) || String(p.id) === String(reel.page_id));
                            if (!page) throw new Error('Página não encontrada');
                            return await facebookService.postStory(page.id, page.access_token, videoUrl, 'video');
                        });

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
// ============================================
// DYNAMIC AUTOMATION WORKER
// Runs every minute. Checks for planned tasks.
// ============================================

let automationWorkerRunning = false;

export function startAutomationWorker() {
    console.log('[AUTOMATION WORKER] Starting cron (every minute)...');

    cron.schedule('* * * * *', async () => {
        if (automationWorkerRunning) return;
        automationWorkerRunning = true;

        try {
            const dueTasks = await db.getPendingAutomationTasks();
            if (dueTasks.length === 0) {
                automationWorkerRunning = false;
                return;
            }

            console.log(`[AUTOMATION WORKER] Found ${dueTasks.length} task(s) to execute`);

            for (const task of dueTasks) {
                try {
                    // Task already has config because it's joined with schedules or carries it
                    // Actually, the task from automation_execution_queue doesn't have config directly
                    // We need to fetch the schedule details or join in the query
                    
                    const schedule = await db.getSchedule(task.schedule_id, task.user_id);
                    if (!schedule) {
                        console.error(`[AUTOMATION WORKER] Schedule ${task.schedule_id} not found for task ${task.id}`);
                        await db.markAutomationTaskComplete(task.id); // Mark it so we don't retry forever
                        continue;
                    }

                    const config = typeof schedule.config === 'string' ? JSON.parse(schedule.config) : schedule.config;
                    
                    // SAFETY CHECK: If the task is too old (e.g., > 1 hour late), skip it to avoid flood
                    const plannedTime = new Date(task.planned_time);
                    const now = new Date();
                    const diffMinutes = (now.getTime() - plannedTime.getTime()) / (1000 * 60);

                    if (diffMinutes > 60) {
                        console.log(`[AUTOMATION WORKER] ⚠️ Task ${task.id} is too old (${Math.round(diffMinutes)} min late). Skipping to avoid flood.`);
                        await db.markAutomationTaskComplete(task.id);
                        continue;
                    }

                    console.log(`[AUTOMATION WORKER] Executing task ${task.id} for ${task.platform} (Schedule: ${task.schedule_id})`);
                    
                    await runAutomation(task.platform, config, task.user_id);
                    
                    await db.markAutomationTaskComplete(task.id);
                    console.log(`[AUTOMATION WORKER] ✅ Task ${task.id} completed`);

                } catch (err) {
                    console.error(`[AUTOMATION WORKER] ❌ Task ${task.id} failed:`, err.message);
                    // For now we just mark complete to avoid loops, but could mark 'failed' if implemented
                    await db.markAutomationTaskComplete(task.id);
                }
            }
        } catch (err) {
            console.error('[AUTOMATION WORKER] Fatal error:', err.message);
        } finally {
            automationWorkerRunning = false;
        }
    });
}
