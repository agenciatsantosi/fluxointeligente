import cron from 'node-cron';
import { prepareProductsForPosting } from './automationService.js';
import * as facebookService from './facebookService.js';
import * as whatsappService from './whatsappService.js';
import * as telegramService from './telegramService.js';
import * as instagramService from './instagramService.js';
import * as instagramGraph from './instagramGraphService.js';
import * as twitterService from './twitterService.js';
import * as pinterestService from './pinterestService.js';
import * as youtubeService from './youtubeService.js';
import * as threadsService from './threadsService.js';
import * as db from './database.js';
import * as notifications from './notificationService.js';
import * as shopeeScraper from './shopeeScraper.js';
import * as cleanupService from './cleanupService.js';
import { processThreadsAutoReplies } from './threadsAutoReply.js';

// Map to store active cron jobs: scheduleId -> Array of cron tasks
const activeJobs = new Map();

/**
 * Helper to get local timestamp in YYYY-MM-DD HH:mm:ss format
 */
const userTimezones = new Map();

async function getDbNow() {
    try {
        const res = await db.query('SELECT NOW()');
        return new Date(res.rows[0].now);
    } catch (e) {
        return new Date();
    }
}

async function getUserTimezone(userId) {
    if (!userId) return 'America/Sao_Paulo';
    if (userTimezones.has(userId)) return userTimezones.get(userId);
    try {
        const tz = await db.getUserConfig(userId, 'TIMEZONE') || 'America/Sao_Paulo';
        userTimezones.set(userId, tz);
        return tz;
    } catch (e) {
        return 'America/Sao_Paulo';
    }
}

function getLocalTimestamp(timeZone = 'America/Sao_Paulo', returnString = false) {
    return getLocalTimestampForDate(new Date(), timeZone, returnString);
}

function getLocalTimestampForDate(dateObj, timeZone = 'America/Sao_Paulo', returnString = false) {
    try {
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        
        const parts = formatter.formatToParts(dateObj);
        const p = {};
        parts.forEach(part => { p[part.type] = part.value; });
        
        if (returnString) {
            return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
        }
        
        return new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    } catch (e) {
        return returnString ? '1970-01-01 00:00:00' : new Date();
    }
}

/**
 * Initialize scheduler by loading active schedules from DB
 */
export async function initializeScheduler() {
    console.log('[SCHEDULER] Initializing...');
    const schedules = await db.getActiveSchedules();

    // Start workers
    startStoryWorker();
    startReelsWorker();
    startDownloaderWorker();
    startDeferredAnalysisWorker();
    startAutomationWorker(); // New worker for dynamic scheduling
    startCleanupWorker(); // Media cleanup worker
    startThreadsAutoReplyWorker(); // Threads auto-reply monitor
 
    // Initialize social API clients
    await twitterService.initializeTwitter().catch(e => console.error('[SCHEDULER] Twitter init failed:', e.message));
    await threadsService.initializeThreadsAPI().catch(e => console.error('[SCHEDULER] Threads init failed:', e.message));

    // Plan executions for active schedules
    for (const schedule of schedules) {
        try {
            const localNow = getLocalTimestamp();
            const config = typeof schedule.config === 'string' ? JSON.parse(schedule.config) : schedule.config;
            
            // 1. Clear existing pending tasks for this schedule to avoid duplicates on restart
            await db.clearAutomationQueue(schedule.id, schedule.userId);
            
            // 2. Plan new tasks for the next 24 hours
            await planDailyExecutions(schedule.id, schedule.platform, config, schedule.userId);
            
            // 3. Start a daily replanner (at 00:00)
            startDailyReplanner(schedule.id, schedule.platform, config, schedule.userId);
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
    if (!config) {
        console.warn(`\x1b[33m[SCHEDULER] Agendamento ${id} está SEM config. Pulando...\x1b[0m`);
        return;
    }

    // Handle both nested { schedule: { ... } } and flat { scheduleMode, times, ... } structures
    const schedule = config.schedule || config;
    
    // Check if we have at least the minimum required fields
    if (!schedule.scheduleMode && !schedule.time && !schedule.times) {
         console.warn(`\x1b[33m[SCHEDULER] Agendamento ${id} está com dados de horário vazios. Pulando...\x1b[0m`);
         return;
    }

    const times = (schedule.scheduleMode === 'multiple' || schedule.scheduleMode === 'automated') && schedule.times
        ? schedule.times
        : [schedule.time || '09:00'];
    
    const variationMinutes = schedule.randomVariation || 0;
    const timezone = await getUserTimezone(userId) || 'America/Sao_Paulo';
    
    // Get the real UTC offset for this timezone right now
    // Get base time from DB to ensure sync
    const nowUtc = await getDbNow();
    
    // Use Intl to get the current date/time parts IN the user's timezone
    const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    });
    const parts = Object.fromEntries(fmt.formatToParts(nowUtc).map(p => [p.type, p.value]));
    const tzYear = parseInt(parts.year), tzMonth = parseInt(parts.month) - 1, tzDay = parseInt(parts.day);
    const tzHour = parseInt(parts.hour), tzMinute = parseInt(parts.minute);
    const tzNowMinutes = tzHour * 60 + tzMinute;

    // Clear FUTURE tasks (only if they are more than 30 mins away) to prevent duplicates on server restart
    // This protects posts that are about to run!
    const clearingThreshold = new Date(nowUtc.getTime() + 30 * 60 * 1000);
    await db.clearFutureAutomationQueue(id, userId, clearingThreshold);
    
    for (const baseTime of times) {
        const [hour, minute] = baseTime.split(':').map(Number);
        
        // Build this task's datetime in the user's timezone as a UTC timestamp
        let plannedLocal = new Date(Date.UTC(tzYear, tzMonth, tzDay, hour, minute, 0));
        // plannedLocal is currently in UTC but represents local clock values - need to shift
        // Get the offset: how many ms is the timezone ahead of UTC?
        const tzOffset = nowUtc.getTime() - new Date(Date.UTC(tzYear, tzMonth, tzDay, tzHour, tzMinute, parseInt(parts.second || '0'))).getTime();
        let plannedUtc = new Date(plannedLocal.getTime() + tzOffset);
        
        // STEP 1: Check if base time (without variation) already passed significantly
        // Use a strict 3-minute tolerance to avoid rescheduling already-ran tasks on restart
        const strictToleranceMs = 3 * 60 * 1000; // 3 minutes
        if (plannedUtc.getTime() < nowUtc.getTime() - strictToleranceMs) {
            // Push base time to tomorrow BEFORE applying variation
            plannedUtc = new Date(plannedUtc.getTime() + 24 * 60 * 60 * 1000);
        }

        // STEP 2: Apply random variation AFTER determining the correct day
        // This prevents the variation from creating a "new" time that bypasses ON CONFLICT dedup
        if (variationMinutes > 0) {
            const variation = (Math.random() * variationMinutes * 2) - variationMinutes;
            plannedUtc = new Date(plannedUtc.getTime() + Math.round(variation) * 60000);
        }

        await db.addToAutomationQueue(id, platform, plannedUtc, userId);
        console.log(`\x1b[36m📅 [SCHEDULER] Tarefa Agendada: ${platform} para ${plannedUtc.toLocaleString('pt-BR', { timeZone: timezone })} (User: ${userId})\x1b[0m`);
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
    
    const testConfig = { ...config, schedule: { ...config.schedule, productCount: 1 } };

    // Verify Telegram bot token BEFORE starting
    if (schedule.platform === 'telegram') {
        const botToken = config.botToken;
        if (!botToken) throw new Error('Token do Bot não configurado neste agendamento.');
        
        const { testTelegramConnection } = await import('./telegramService.js');
        const validation = await testTelegramConnection(botToken);
        if (!validation.success) {
            throw new Error(`Bot inválido ou desconectado. Verifique o Token. (Erro: ${validation.error})`);
        }
        console.log(`[SCHEDULER] Bot token válido para schedule ${id}: @${validation.botInfo?.username}`);
    }
    
    // Run in background, notify user of result
    runAutomation(schedule.platform, testConfig, userId).then(() => {
        console.log(`[SCHEDULER] Manual run finished successfully for ${id}`);
        notifications.addNotification('success', schedule.platform, 'Envio Concluído', `Automação ${schedule.platform} executada com sucesso!`, userId);
    }).catch(err => {
        console.error(`[SCHEDULER] Manual run failed for ${id}:`, err);
        notifications.addNotification('error', schedule.platform, 'Erro na Execução Manual', `Falha: ${err.message}`, userId);
    });
    
    return { success: true, message: 'Execução iniciada! Aguarde alguns segundos.' };
}



/**
 * Run the automation logic
 */
async function runAutomation(platform, config, userId, scheduleId = null) {
    let successCount = 0;
    let lastError = null;
    console.log(`[AUTOMATION] Running ${platform} automation for user ${userId}...`);
    
    // Notify user that automation is starting
    notifications.addNotification(
        'info', 
        platform, 
        'Automação Iniciada', 
        `O agendamento para ${platform} começou a ser processado agora.`,
        userId
    );

    // Check Start Date - DISABLED: Post immediately if it's in the queue
    /*
    const todayStr = new Date().toISOString().split('T')[0];
    if (config.schedule && config.schedule.startDate && todayStr < config.schedule.startDate) {
        console.log(`[AUTOMATION] Skipping ${platform} run: Start date ${config.schedule.startDate} not reached yet. (Today: ${todayStr})`);
        return;
    }
    */

    try {
        // 1. Identify destinations and calculate total products needed
        let destinations = [null]; // Default for single-destination platforms
        if (platform === 'facebook') destinations = config.facebookPages || [];
        else if (platform === 'whatsapp') destinations = config.whatsappRecipients || [];
        else if (platform === 'instagram') {
            // Support both multi-account (new) and single account (old) configurations
            if (config.instagramAccounts?.length > 0) {
                destinations = config.instagramAccounts;
            } else if (config.accountId) {
                destinations = [{ id: config.accountId, name: config.accountName || 'Instagram' }];
            } else if (config.instagramAccount) {
                destinations = [config.instagramAccount];
            } else {
                destinations = [null]; // Fallback to Private API (requires manual login)
            }
        }
        else if (platform === 'telegram') destinations = (config.groups || []).filter(g => g.enabled !== false);
        else if (platform === 'threads') {
            if (config.threadsAccounts?.length > 0) {
                destinations = config.threadsAccounts;
            } else if (config.accountId) {
                destinations = [{ id: config.accountId, name: config.accountName || 'Threads' }];
            } else {
                destinations = [null];
            }
        }

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
            userId,
            config.mediaType || 'auto',
            true, // shouldScrape
            {
                contentType: config.schedule?.contentType || 'shopee',
                shopeeMediaMode: config.schedule?.shopeeMediaMode || 'any'
            }
        );

        console.log(`[AUTOMATION] Prepared ${products.length} products for ${platform} across ${destinations.length} destinations`);

        if (!products || products.length === 0) {
            console.log(`[AUTOMATION] ⚠️ Nenhum produto novo encontrado para postar no agendamento ${scheduleId}.`);
            throw new Error('Nenhum produto novo encontrado na Shopee (Filtros muito restritos ou sem estoque).');
        }

        // 3. Process each destination with its unique set of products
        for (let i = 0; i < destinations.length; i++) {
            const dest = destinations[i];
            const destProducts = products.slice(i * baseProductCount, (i + 1) * baseProductCount);
            console.log(`[AUTOMATION] Destino ${i + 1}/${destinations.length}: ${dest?.name || dest?.id || 'Destino'} - Enviando ${destProducts.length} produtos`);

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
                            successCount++;
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

                        let whatsappStatus = whatsappService.getConnectionStatus(userId, accountId);
                        
                        // Se estiver conectando (sessão existe mas socket abrindo), aguarda até 10s
                        if (whatsappStatus.status === 'connecting') {
                            console.log(`[AUTOMATION] WhatsApp da conta ${accountId} está conectando... aguardando 10s`);
                            await new Promise(r => setTimeout(r, 10000));
                            whatsappStatus = whatsappService.getConnectionStatus(userId, accountId);
                        }

                        if (whatsappStatus.status === 'connected') {
                            await whatsappService.sendProductMessage(
                                userId, accountId, recipient.id, postData,
                                config.messageTemplate || '', config.mediaType || 'auto',
                                { simulateTyping: false, mentionAll: false, postToStatus: false }
                            );

                            successCount++;
                            await db.logSentProduct({
                                productId: postData.productId || postData.id, 
                                productName: postData.productName || postData.name, 
                                price: postData.price, 
                                commission: postData.commission,
                                groupId: recipient.id, groupName: recipient.name || 'WhatsApp Contact', mediaType: 'MESSAGE', category: 'whatsapp'
                            }, userId);

                            await db.logEvent('whatsapp_send', { productId: postData.productId || postData.id, groupId: recipient.id, success: true }, userId);
                        } else {
                            throw new Error(`WhatsApp não está conectado (Status: ${whatsappStatus.status})`);
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
                                successCount++;
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
                            successCount++;
                            // Auto-update group ID if migrated
                            if (resultTelegram.newChatId && scheduleId) {
                                console.log(`[AUTOMATION] 🔄 Auto-updating group ID ${group.id} -> ${resultTelegram.newChatId} for schedule ${scheduleId}`);
                                const updatedConfig = { ...config };
                                const groupToUpdate = updatedConfig.groups.find(g => String(g.id) === String(group.id));
                                if (groupToUpdate) {
                                    groupToUpdate.id = resultTelegram.newChatId;
                                    await db.updateScheduleConfig(scheduleId, updatedConfig, userId);
                                }
                            }

                            await db.logSentProduct({
                                productId: postData.productId || postData.id, 
                                productName: postData.productName || postData.name, 
                                price: postData.price, 
                                commission: postData.commission,
                                groupId: resultTelegram.newChatId || group.id, groupName: group.name || 'Telegram Group', mediaType: 'MESSAGE', category: 'telegram'
                            }, userId);
                            await db.logEvent('telegram_send', { productId: postData.productId || postData.id, groupId: group.id, success: true }, userId);
                        } else {
                            lastError = resultTelegram.error || 'Erro desconhecido no Telegram';
                        }
                    }
                    else if (platform === 'twitter') {
                        // O Twitter já é inicializado com as contas do banco no startup
                        const resultTwitter = await twitterService.postProduct(postData, config.messageTemplate || '', config.hashtags || [], null, config.mediaType || 'auto');
                        
                        if (resultTwitter.success) {
                            successCount++;
                            await db.logSentProduct({
                                productId: postData.productId || postData.id, 
                                productName: postData.productName || postData.name, 
                                price: postData.price, 
                                commission: postData.commission,
                                groupId: resultTwitter.tweetId || 'twitter_post', 
                                groupName: 'Twitter (X)', 
                                mediaType: 'TWEET', 
                                category: 'twitter'
                            }, userId);
                            await db.logEvent('twitter_send', { productId: postData.productId || postData.id, success: true }, userId);
                        } else {
                            lastError = resultTwitter.error || 'Erro desconhecido no Twitter';
                            await db.logEvent('twitter_send', { productId: postData.productId || postData.id, success: false, errorMessage: lastError }, userId);
                        }
                    }
                    else if (platform === 'youtube') {
                        const accountId = config.accountId;
                        if (!accountId) continue;
                        
                        if (product.videoUrl) {
                            result = await youtubeService.uploadShorts(
                                product.videoUrl, // Caminho local
                                product.productName,
                                (config.messageTemplate || '') + '\n' + product.affiliateLink,
                                accountId,
                                userId
                            );
                            
                            if (result?.success) {
                                successCount++;
                                await db.logSentProduct({
                                    productId: postData.productId || postData.id,
                                    productName: postData.productName || postData.name,
                                    price: postData.price,
                                    commission: postData.commission,
                                    groupId: accountId,
                                    groupName: 'YouTube Channel',
                                    mediaType: 'SHORT',
                                    category: 'youtube'
                                }, userId);
                                await db.logEvent('youtube_send', { productId: postData.productId || postData.id, groupId: accountId, success: true }, userId);
                            }
                        } else {
                            console.log(`[AUTOMATION] ⏭️ Produto ${product.productName} pulado no YouTube: Sem vídeo disponível.`);
                        }
                    }
                    else if (platform === 'threads') {
                        const account = dest;
                        result = await threadsService.postProductThreads(
                            product, 
                            config.messageTemplate || '', 
                            config.groupLink || '', 
                            config.customHashtags || [], 
                            account?.id || config.accountId,
                            userId,
                            {
                                mediaMode: config.shopeeMediaMode || 'any',
                                contentType: config.contentType || 'shopee'
                            }
                        );

                        if (result?.success) {
                            successCount++;
                            await db.logSentProduct({
                                productId: postData.productId || postData.id,
                                productName: postData.productName || postData.name,
                                price: postData.price,
                                commission: postData.commission,
                                groupId: account?.id || config.accountId,
                                groupName: account?.name || 'Threads Account',
                                mediaType: product.videoUrl ? 'VIDEO' : 'IMAGE',
                                category: 'threads'
                            }, userId);
                            await db.logEvent('threads_send', { productId: postData.productId || postData.id, success: true }, userId);
                        }
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
                                successCount++;
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

        if (successCount === 0 && destinations.length > 0) {
            throw new Error(lastError || 'Nenhum produto foi enviado com sucesso. Verifique os logs e configurações.');
        }

        // Notify user of success
        notifications.addNotification(
            'success', 
            platform, 
            'Automação Concluída', 
            `A postagem para ${platform} foi realizada com sucesso (${successCount} itens enviados).`,
            userId
        );
        // Limpeza de arquivos temporários após postagem
        if (products && products.length > 0) {
            for (const p of products) {
                if (p.id) await shopeeScraper.cleanupProductMedia(p.id);
            }
        }

        return { success: true, count: successCount };
    } catch (error) {
        console.error(`[AUTOMATION] Fatal error in ${platform} run:`, error.message);
        notifications.addNotification(
            'error', 
            platform, 
            'Falha na Automação', 
            `Ocorreu um erro ao processar o agendamento de ${platform}: ${error.message}`,
            userId
        );

        // Limpeza de segurança se possível
        try {
            // Note: products may not be defined here if error happened before its declaration
            // In JavaScript, variables declared with 'const' inside try are not available in catch.
            // But we can check if it exists or was passed.
        } catch (e) {}

        throw error;
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
            // Use Acre time as the most "behind" reference to fetch all potentially due tasks
            const searchTime = getLocalTimestamp('America/Rio_Branco'); 
            const dueStories = await db.getDueStories(searchTime);
            if (dueStories.length === 0) {
                storyWorkerRunning = false;
                return;
            }

            console.log(`[STORY WORKER] Found ${dueStories.length} story(ies) to post`);

            for (const story of dueStories) {
                try {
                    // Refine check: Is it due in the user's specific timezone?
                    const userTz = await getUserTimezone(story.user_id);
                    const userNow = getLocalTimestamp(userTz);
                    if (new Date(story.planned_time) > userNow) continue;

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
                        notifications.addNotification('success', story.platform, 'Story Enviado', `Seu Story no ${story.platform} foi publicado com sucesso.`, story.user_id);
                    } else {
                        await db.markStoryFailed(story.id, result?.error || 'Erro desconhecido');
                        console.error(`[STORY WORKER] ❌ Failed story ${story.id}: ${result?.error}`);
                        notifications.addNotification('error', story.platform, 'Falha no Story', `Erro ao publicar Story no ${story.platform}: ${result?.error || 'Erro desconhecido'}`, story.user_id);
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

// ============================================
// DOWNLOADER DEFERRED ANALYSIS WORKER
// Runs every 2 minutes. Extracts info for fast-scheduled items before they are due.
// ============================================

let deferredAnalysisWorkerRunning = false;

export function startDeferredAnalysisWorker() {
    console.log('[DEFERRED ANALYSIS WORKER] Starting cron (every 2 minutes)...');

    cron.schedule('*/2 * * * *', async () => {
        if (deferredAnalysisWorkerRunning) return;
        deferredAnalysisWorkerRunning = true;

        try {
            const pendingDeferred = await db.getDeferredDownloaderSchedules(5); // Processa 5 por vez
            if (pendingDeferred.length > 0) {
                console.log(`[DEFERRED ANALYSIS WORKER] Encontradas ${pendingDeferred.length} tarefas pendentes de análise.`);
                const { fetchMediaInfo } = await import('./downloaderService.js');

                for (const task of pendingDeferred) {
                    try {
                        console.log(`[DEFERRED ANALYSIS WORKER] Analisando task ${task.id} (${task.source_url})...`);
                        const extracted = await fetchMediaInfo(task.source_url);
                        
                        if (extracted && extracted.mediaUrl && extracted.mediaUrl.startsWith('http')) {
                            let newCaption = task.caption || '';
                            
                            // Se extraiu o título, vamos mesclar com a legenda global (se não estiver já contido)
                            if (extracted.title) {
                                if (!newCaption || newCaption.trim() === '') {
                                    newCaption = extracted.title;
                                } else if (!newCaption.includes(extracted.title)) {
                                    newCaption = `${extracted.title}\n\n${newCaption}`;
                                }
                            }
                            
                            await db.updateDownloaderScheduleAnalysis(
                                task.id, 
                                extracted.mediaUrl, 
                                newCaption, 
                                extracted.platform || task.source_platform
                            );
                            console.log(`[DEFERRED ANALYSIS WORKER] ✅ Task ${task.id} analisada e atualizada com sucesso!`);
                        }
                    } catch (extError) {
                        console.error(`[DEFERRED ANALYSIS WORKER] ❌ Erro ao analisar task ${task.id}:`, extError.message);
                        // Marca como falho para evitar loop infinito na mesma tarefa
                        await db.updateDownloaderScheduleStatus(task.id, 'failed', `Erro de análise: ${extError.message}`);
                    }
                }
            }
        } catch (err) {
            console.error('[DEFERRED ANALYSIS WORKER] Fatal error:', err.message);
        } finally {
            deferredAnalysisWorkerRunning = false;
        }
    });
}

// ============================================
// DOWNLOADER QUEUE WORKER
// Runs every minute. Posts scheduled media from Downloader.
// ============================================

let downloaderWorkerRunning = false;

export function startDownloaderWorker() {
    console.log('[DOWNLOADER WORKER] Starting cron (every minute)...');

    cron.schedule('* * * * *', async () => {
        if (downloaderWorkerRunning) return;
        downloaderWorkerRunning = true;

        try {
            // Fetch all pending downloader schedules
            // We use a broad search first
            const pendingTasks = await db.getPendingDownloaderSchedules();
            if (pendingTasks.length === 0) {
                downloaderWorkerRunning = false;
                return;
            }

            console.log(`[DOWNLOADER WORKER] Found ${pendingTasks.length} task(s) to process`);

            for (const task of pendingTasks) {
                try {
                    // CRITICAL: Respect User Timezone (Since we use TIMESTAMPTZ, comparison is simple)
                    const dbNow = await getDbNow();
                    
                    if (task.scheduled_at > dbNow) {
                        // Future task, skip
                        continue;
                    }

                    const userTz = await getUserTimezone(task.user_id);
                    const userNowStr = getLocalTimestampForDate(dbNow, userTz, true);
                    console.log(`[DOWNLOADER WORKER] 🚀 EXECUTING task ${task.id} (Scheduled: ${task.scheduled_at.toISOString()} | User Now: ${userNowStr} | TZ: ${userTz})`);
                    
                    await processDownloaderTask(task);

                } catch (taskErr) {
                    console.error(`[DOWNLOADER WORKER] ❌ Error processing task ${task.id}:`, taskErr.message);
                    await db.updateDownloaderScheduleStatus(task.id, 'failed', taskErr.message);
                }
            }
        } catch (err) {
            console.error('[DOWNLOADER WORKER] Fatal error:', err.message);
        } finally {
            downloaderWorkerRunning = false;
        }
    });
}

/**
 * Logic to process a single downloader task
 * (Moved from server.js loop for better organization)
 */
export async function processDownloaderTask(task) {
    console.time(`[DOWNLOADER TASK ${task.id}]`);
    await db.updateDownloaderScheduleStatus(task.id, 'processing');
    
    try {
        // 1. Ensure we have a real media URL (Extraction Phase)
        if (task.media_url === 'DEFERRED' || !task.media_url.startsWith('http') || task.media_url.includes('placeholder')) {
            console.log(`[DOWNLOADER] Task ${task.id}: Iniciando extração profunda para ${task.source_url}...`);
            const { fetchMediaInfo } = await import('./downloaderService.js');
            try {
                const extracted = await fetchMediaInfo(task.source_url);
                if (extracted && extracted.mediaUrl && extracted.mediaUrl.startsWith('http')) {
                    task.media_url = extracted.mediaUrl;
                    console.log(`[DOWNLOADER] Task ${task.id}: Link extraído com sucesso.`);
                    
                    if (extracted.title) {
                        if (!task.caption || task.caption.trim() === '') {
                            task.caption = extracted.title;
                        } else if (!task.caption.includes(extracted.title)) {
                            task.caption = `${extracted.title}\n\n${task.caption}`;
                        }
                    }
                    if (extracted.platform && extracted.platform !== 'video') {
                        task.source_platform = extracted.platform;
                    }
                } else {
                    throw new Error('Extração retornou link inválido');
                }
            } catch (extError) {
                console.error(`[DOWNLOADER] ❌ Falha crítica na extração para Task ${task.id}:`, extError.message);
                // We don't stop here, downloadToLocal might still recover via yt-dlp directly
            }
        }

        let result;
        let finalUrl = task.media_url;
        
        // Clean byte-range params
        try {
            const parsed = new URL(task.media_url);
            parsed.searchParams.delete('bytestart');
            parsed.searchParams.delete('byteend');
            finalUrl = parsed.toString();
        } catch (e) {}

        let localDownloadPath = null;
        const { downloadToLocal } = await import('./downloaderService.js');
        const fs = await import('fs');

        // Check if current finalUrl is a local path that no longer exists
        const isLocalFile = finalUrl && !finalUrl.startsWith('http') && (finalUrl.includes('\\') || finalUrl.includes('/'));
        if (isLocalFile && !fs.existsSync(finalUrl)) {
            console.warn(`[DOWNLOADER] ⚠️ Arquivo local não encontrado (${finalUrl}). Tentando re-download de ${task.source_url}...`);
            // Force re-download by using source_url or original media_url if possible
            finalUrl = task.source_url || task.media_url;
        }

        // STRATEGY: PROACTIVE DOWNLOAD
        // Always download locally for ALL platforms to ensure stability and bypass crawler blocks
        try {
            console.log(`[DOWNLOADER] Task ${task.id}: Realizando download preventivo para ${task.platform}...`);
            const downloadRes = await downloadToLocal(finalUrl, task.source_platform || 'video', task.source_url);
            if (downloadRes.success) {
                localDownloadPath = downloadRes.absolutePath;
                finalUrl = downloadRes.absolutePath;
                console.log(`[DOWNLOADER] Task ${task.id}: Download concluído em ${localDownloadPath}`);
            } else if (!finalUrl.startsWith('http')) {
                // If download failed and we don't even have a fallback HTTP URL, we must fail
                throw new Error(`Falha no download e sem link de backup: ${downloadRes.error}`);
            }
        } catch (dlErr) {
            console.error(`[DOWNLOADER] Download preventivo falhou para task ${task.id}:`, dlErr.message);
            // Critical if file is local-only or if it's not Instagram (Instagram Graph API is picky but sometimes accepts direct links)
            if (task.platform !== 'instagram' || !finalUrl.startsWith('http')) {
                throw new Error(`Erro ao baixar mídia para postagem: ${dlErr.message}`);
            }
        }

        if (task.platform === 'instagram') {
            if (task.media_type === 'video') {
                result = await instagramGraph.postVideoGraph(finalUrl, task.caption, task.account_id);
            } else {
                result = await instagramGraph.postImageGraph(finalUrl, task.caption, task.account_id);
            }
        } else if (task.platform === 'facebook') {
            const pages = await db.getFacebookPages(task.user_id);
            const page = pages.find(p => String(p.id) === String(task.account_id));
            if (!page) throw new Error('Página não encontrada');
            const token = page.accessToken || page.access_token;

            if (task.media_type === 'video') {
                result = await facebookService.postReel(page.id, token, finalUrl, task.caption, task.user_id);
            } else {
                result = await facebookService.postPhoto(page.id, token, finalUrl, task.caption, task.user_id);
            }
        } else if (task.platform === 'whatsapp') {
            // No WhatsApp, account_id da tarefa é o group_id
            const groups = await db.getWhatsAppGroups(task.user_id);
            const group = groups.find(g => g.groupId === task.account_id);
            if (!group) throw new Error('Grupo do WhatsApp não encontrado');

            if (task.media_type === 'video') {
                result = await whatsappService.sendVideo(task.user_id, group.accountId, group.groupId, finalUrl, task.caption);
            } else {
                result = await whatsappService.sendImage(task.user_id, group.accountId, group.groupId, finalUrl, task.caption);
            }
        } else if (task.platform === 'telegram') {
            // No Telegram, account_id é o chat_id
            const tgAccounts = await db.getTelegramAccounts(task.user_id);
            if (tgAccounts.length === 0) throw new Error('Nenhum bot do Telegram configurado');
            const botToken = tgAccounts[0].token;

            result = await telegramService.postToTelegramGroup(task.account_id, {
                videoUrl: task.media_type === 'video' ? finalUrl : null,
                imagePath: task.media_type === 'image' ? finalUrl : null,
            }, botToken, task.caption, task.media_type === 'video' ? 'video' : 'image');
        } else if (task.platform === 'twitter') {
            result = await twitterService.postTweet(task.caption, finalUrl, task.account_id);
        } else if (task.platform === 'threads') {
            result = await threadsService.publishPost(task.account_id, task.caption, finalUrl, task.media_type, task.user_id);
        }

        if (localDownloadPath) {
            const fs = await import('fs');
            try { fs.unlinkSync(localDownloadPath); } catch (e) {}
        }

        if (result?.success) {
            await db.updateDownloaderScheduleStatus(task.id, 'completed');
            await db.logEvent(`${task.platform}_send`, { groupId: task.account_id, success: true, message: 'Post Agendado via Downloader ✅' }, task.user_id);
            console.log(`[DOWNLOADER] ✅ Tarefa ${task.id} concluída`);
        } else {
            const errMsg = result?.error || 'Erro desconhecido';
            await db.updateDownloaderScheduleStatus(task.id, 'failed', errMsg);
            await db.logEvent(`${task.platform}_send`, { groupId: task.account_id, success: false, errorMessage: errMsg }, task.user_id);
        }
    } catch (err) {
        console.error(`[DOWNLOADER] ❌ Erro na tarefa ${task.id}:`, err.message);
        await db.updateDownloaderScheduleStatus(task.id, 'failed', err.message);
        await db.logEvent(`${task.platform}_send`, { groupId: task.account_id, success: false, errorMessage: err.message }, task.user_id).catch(() => {});
    } finally {
        console.timeEnd(`[DOWNLOADER TASK ${task.id}]`);
    }
}

export function startReelsWorker() {
    console.log('[REELS WORKER] Starting cron (every minute)...');

    cron.schedule('* * * * *', async () => {
        if (reelsWorkerRunning) return;
        reelsWorkerRunning = true;

        try {
            // Use Acre time as base to fetch potential tasks
            const searchTime = getLocalTimestamp('America/Rio_Branco');
            
            // 1. Process Instagram Reels
            const pendingIg = await db.getPendingInstagramVideos(searchTime);
            if (pendingIg.length > 0) {
                console.log(`[REELS WORKER] Found ${pendingIg.length} Instagram Reel(s) to post`);
                const publicUrl = await db.getSystemConfig('public_url') || '';

                for (const reel of pendingIg) {
                    try {
                        const userTz = await getUserTimezone(reel.user_id);
                        const userNow = getLocalTimestamp(userTz);
                        if (new Date(reel.planned_time) > userNow) continue;

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
                            notifications.addNotification('success', 'instagram', 'Reel Publicado', 'Seu Reel no Instagram foi publicado com sucesso.', reel.user_id);
                        } else {
                            await db.markInstagramVideoFailed(reel.id, result.error);
                            notifications.addNotification('error', 'instagram', 'Falha no Reel', `Erro ao publicar Reel no Instagram: ${result.error}`, reel.user_id);
                        }
                    } catch (err) {
                        console.error(`[REELS WORKER] Error posting IG Reel ${reel.id}:`, err);
                        await db.markInstagramVideoFailed(reel.id, err.message);
                    }
                }
            }

            // 2. Process Facebook Reels
            const pendingFb = await db.getPendingFacebookVideos(searchTime);
            if (pendingFb.length > 0) {
                console.log(`[REELS WORKER] Found ${pendingFb.length} Facebook Reel(s) to post`);
                const publicUrl = await db.getSystemConfig('public_url') || '';

                for (const reel of pendingFb) {
                    try {
                        const userTz = await getUserTimezone(reel.user_id);
                        const userNow = getLocalTimestamp(userTz);
                        if (new Date(reel.planned_time) > userNow) continue;
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
                            notifications.addNotification('success', 'facebook', 'Reel Publicado', 'Seu Reel no Facebook foi publicado com sucesso.', reel.user_id);
                        } else {
                            await db.markFacebookVideoFailed(reel.id, result.error);
                            notifications.addNotification('error', 'facebook', 'Falha no Reel', `Erro ao publicar Reel no Facebook: ${result.error}`, reel.user_id);
                        }
                    } catch (err) {
                        console.error(`[REELS WORKER] Error posting FB Reel ${reel.id}:`, err);
                        await db.markFacebookVideoFailed(reel.id, err.message);
                    }
                }
            }
            
            // 3. Process YouTube Shorts
            const pendingYt = await db.getPendingYoutubeVideos(searchTime);
            if (pendingYt.length > 0) {
                console.log(`[REELS WORKER] Found ${pendingYt.length} YouTube Short(s) to post`);
                for (const short of pendingYt) {
                    try {
                        const userTz = await getUserTimezone(short.user_id);
                        const userNow = getLocalTimestamp(userTz);
                        if (new Date(short.planned_time) > userNow) continue;

                        const result = await youtubeService.uploadShorts(
                            short.video_path,
                            short.caption?.split('\n')[0] || 'Short', // Use first line as title
                            short.caption || '',
                            short.account_id,
                            short.user_id
                        );

                        if (result.success) {
                            await db.markYoutubeVideoPosted(short.id);
                            console.log(`[REELS WORKER] ✅ Posted YouTube Short ${short.id}`);
                            notifications.addNotification('success', 'youtube', 'Short Publicado', 'Seu YouTube Short foi publicado com sucesso.', short.user_id);
                        } else {
                            await db.markYoutubeVideoFailed(short.id, result.error);
                            notifications.addNotification('error', 'youtube', 'Falha no Short', `Erro ao publicar YouTube Short: ${result.error}`, short.user_id);
                        }
                    } catch (err) {
                        console.error(`[REELS WORKER] Error posting YouTube Short ${short.id}:`, err);
                        await db.markYoutubeVideoFailed(short.id, err.message);
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
    console.log('\n\x1b[35m🚀 [AUTOMATION WORKER] Monitoramento de agendamentos ATIVO (Check a cada 30s)\x1b[0m\n');
    cron.schedule('*/30 * * * * *', runAutomationCycle);
}

export async function runAutomationCycle() {
    if (automationWorkerRunning) return;
    automationWorkerRunning = true;

        try {
            const tz = 'America/Sao_Paulo';
            const nowLocal = getLocalTimestamp(tz);
            const nowStr = getLocalTimestamp(tz, true);
            
            console.log(`[AUTOMATION WORKER] 🔍 Verificando fila às ${nowStr} (Fuso: ${tz})...`);
            console.time('[AUTOMATION CYCLE]');
            
            // Usamos o timestamp local para comparar com o planned_time do banco
            const dueTasks = await db.getPendingAutomationTasks(nowLocal);
            if (dueTasks.length === 0) {
                // console.log(`[AUTOMATION WORKER] Nenhuma tarefa pendente para ${now.toISOString()}`);
                console.timeEnd('[AUTOMATION CYCLE]');
                automationWorkerRunning = false;
                return;
            }

            console.log(`[AUTOMATION WORKER] Found ${dueTasks.length} task(s) to execute`);

            // RATE LIMIT: Keep track of processed schedules in this run
            const processedSchedules = new Set();

            for (const task of dueTasks) {
                try {
                    const plannedTime = new Date(task.planned_time);
                    const now = getLocalTimestamp('America/Sao_Paulo');
                    
                    // STRICT RATE LIMIT: Only 1 task per schedule per run cycle (30s)
                    // AND only 1 task per schedule per minute if it's NOT a backlog
                    const isBacklog = plannedTime.getTime() < (now.getTime() - 120000); // More than 2 minutes old
                    
                    if (processedSchedules.has(task.schedule_id)) {
                        continue;
                    }
                    
                    // Extra safety: Check if we already posted for this schedule VERY recently (last 45s)
                    // This prevents the 30s cron from double-firing in the same minute
                    const lastExecution = await db.getLastExecutionTime(task.schedule_id);
                    if (lastExecution && (now.getTime() - lastExecution.getTime()) < 45000 && !isBacklog) {
                         console.log(`[AUTOMATION WORKER] ⏳ Skipping task ${task.id} (Schedule ${task.schedule_id}) - Cooldown active (45s)`);
                         continue;
                    }
                    processedSchedules.add(task.schedule_id);

                    const schedule = await db.getSchedule(task.schedule_id, task.user_id);
                    if (!schedule) {
                        console.error(`[AUTOMATION WORKER] Schedule ${task.schedule_id} not found for task ${task.id}`);
                        await db.markAutomationTaskComplete(task.id); // Mark it so we don't retry forever
                        continue;
                    }

                    const config = typeof schedule.config === 'string' ? JSON.parse(schedule.config) : schedule.config;
                    
                    // SAFETY CHECK: If the task is too old (e.g., > 1 hour late), skip it to avoid flood
                    const now2 = getLocalTimestamp('America/Sao_Paulo');
                    const diffMinutes = (now2.getTime() - plannedTime.getTime()) / (1000 * 60);

                    if (diffMinutes > 1440) {
                        console.log(`[AUTOMATION WORKER] ⚠️ Task ${task.id} is too old (> 24h). Skipping.`);
                        await db.markAutomationTaskComplete(task.id);
                        continue;
                    }

                    console.log(`\x1b[33m⏳ [AUTOMATION WORKER] Executando tarefa ${task.id} para ${task.platform}...\x1b[0m`);
                    
                    const result = await runAutomation(task.platform, config, task.user_id, task.schedule_id);
                    
                    if (result && result.success) {
                        await db.markAutomationTaskComplete(task.id);
                        console.log(`\x1b[32m✅ [AUTOMATION WORKER] Tarefa ${task.id} concluída com SUCESSO!\x1b[0m`);
                        
                        // Adiciona notificação de sucesso no painel
                        notifications.addNotification(
                            'success', 
                            task.platform, 
                            'Postagem Concluída', 
                            `O agendamento para ${task.platform} foi executado com sucesso.`, 
                            task.user_id
                        );
                    } else {
                        const errorMsg = result?.error || 'Erro desconhecido na automação';
                        console.error(`\x1b[31m❌ [AUTOMATION WORKER] Tarefa ${task.id} falhou: ${errorMsg}\x1b[0m`);
                        await db.markAutomationTaskComplete(task.id, errorMsg);
                        notifications.addNotification('error', task.platform, 'Falha no Agendamento', `Erro ao processar ${task.platform}: ${errorMsg}`, task.user_id);
                    }
                } catch (err) {
                    console.error(`\x1b[31m❌ [AUTOMATION WORKER] Erro fatal na tarefa ${task.id}: ${err.message}\x1b[0m`);
                    await db.markAutomationTaskComplete(task.id, err.message);
                    notifications.addNotification('error', task.platform, 'Falha no Agendamento', `Erro fatal ao processar ${task.platform}: ${err.message}`, task.user_id);
                }
        }
        console.timeEnd('[AUTOMATION CYCLE]');
    } catch (err) {
        console.timeEnd('[AUTOMATION CYCLE]');
        console.error('[AUTOMATION WORKER] Fatal error:', err.message);
    } finally {
        automationWorkerRunning = false;
    }
}

/**
 * Cleanup Worker
 * Runs every 12 hours to clean old media files
 */
function startCleanupWorker() {
    console.log('[CLEANUP WORKER] Starting cron (every 12 hours)...');
    
    // Run once on startup after 1 minute
    setTimeout(() => {
        cleanupService.runCleanup().catch(err => console.error('[CLEANUP WORKER] Initial run failed:', err));
    }, 60000);

    // Schedule every 12 hours
    cron.schedule('0 */12 * * *', async () => {
        try {
            await cleanupService.runCleanup();
        } catch (err) {
            console.error('[CLEANUP WORKER] Scheduled run failed:', err);
        }
    });
}

/**
 * Threads Auto-Reply Worker
 * Runs every 10 minutes to process new replies
 */
function startThreadsAutoReplyWorker() {
    console.log('[THREADS WORKER] Starting auto-reply monitor (every 10 minutes)...');
    
    cron.schedule('*/10 * * * *', async () => {
        try {
            // Get all users who have Threads accounts
            const res = await db.query('SELECT DISTINCT user_id FROM threads_accounts');
            for (const row of res.rows) {
                await processThreadsAutoReplies(row.user_id);
            }
        } catch (err) {
            console.error('[THREADS WORKER] Auto-reply check failed:', err);
        }
    });
}
