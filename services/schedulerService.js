import cron from 'node-cron';
import { prepareProductsForPosting } from './automationService.js';
import * as facebookService from './facebookService.js';
import * as whatsappService from './whatsappService.js';
import * as telegramService from './telegramService.js';
import * as instagramService from './instagramService.js';
import * as db from './database.js';

// Map to store active cron jobs: scheduleId -> Array of cron tasks
const activeJobs = new Map();

/**
 * Initialize scheduler by loading active schedules from DB
 */
export function initializeScheduler() {
    console.log('[SCHEDULER] Initializing...');
    const schedules = db.getActiveSchedules();

    schedules.forEach(schedule => {
        try {
            startJob(schedule.id, schedule.platform, schedule.config);
        } catch (error) {
            console.error(`[SCHEDULER] Failed to start schedule ${schedule.id}:`, error);
        }
    });

    console.log(`[SCHEDULER] Loaded ${schedules.length} active schedules`);
}

/**
 * Start a job for a specific schedule
 */
function startJob(id, platform, config) {
    // Convert to number for consistency
    const numericId = parseInt(id);

    // Stop existing jobs for this ID if any
    stopJob(numericId);

    const tasks = [];
    const times = config.schedule.scheduleMode === 'multiple' && config.schedule.times
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
            runAutomation(platform, config);
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
export function createSchedule(platform, config) {
    // Save Telegram groups if present
    if (platform === 'telegram' && config.groups) {
        try {
            config.groups.forEach(group => {
                db.saveTelegramGroup({
                    groupId: group.id,
                    groupName: group.name,
                    enabled: group.enabled
                });
            });
            console.log(`[SCHEDULER] Saved ${config.groups.length} Telegram groups`);
        } catch (error) {
            console.error('[SCHEDULER] Failed to save Telegram groups:', error);
        }
    }

    const result = db.saveSchedule(platform, config);
    if (result.success && config.schedule.enabled) {
        startJob(result.id, platform, config);
    }
    return result;
}

/**
 * Delete a schedule
 */
export function removeSchedule(id) {
    stopJob(id);
    return db.deleteSchedule(id);
}

/**
 * Toggle a schedule
 */
export function toggleSchedule(id, active) {
    const result = db.toggleSchedule(id, active);

    if (active) {
        const schedules = db.getActiveSchedules();
        const schedule = schedules.find(s => s.id === parseInt(id));
        if (schedule) {
            startJob(schedule.id, schedule.platform, schedule.config);
        }
    } else {
        stopJob(id);
    }

    return result;
}

/**
 * Run the automation logic
 */
async function runAutomation(platform, config) {
    console.log(`[AUTOMATION] Running ${platform} automation...`);

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
                    // Check WhatsApp connection status first
                    const whatsappStatus = whatsappService.getConnectionStatus();

                    if (whatsappStatus.status !== 'connected') {
                        console.warn(`[AUTOMATION] WhatsApp is not connected (status: ${whatsappStatus.status}). Skipping WhatsApp automation.`);
                        console.warn('[AUTOMATION] Please connect WhatsApp via the WhatsApp Automation page before scheduling.');
                        continue; // Skip to next product
                    }

                    for (const recipient of config.whatsappRecipients) {
                        try {
                            await whatsappService.sendProductMessage(
                                recipient.id,
                                postData,
                                config.messageTemplate || '',
                                config.mediaType || 'auto',  // Pass mediaType as 4th parameter
                                {
                                    simulateTyping: false,
                                    mentionAll: false,
                                    postToStatus: false
                                }
                            );
                            // Random delay between recipients
                            await new Promise(r => setTimeout(r, 5000 + Math.random() * 5000));
                        } catch (error) {
                            console.error(`[AUTOMATION] Failed to send to WhatsApp recipient ${recipient.name}:`, error);
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
