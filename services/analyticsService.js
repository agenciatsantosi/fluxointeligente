import * as db from './database.js';

/**
 * Analytics Service
 * Provides statistics and metrics for the dashboard
 */

/**
 * Get dashboard statistics for the last N days
 */
export function getDashboardStats(days = 7) {
    try {
        // Get base stats from database
        const baseStats = db.getDashboardStats(days);

        // Get module-specific stats
        const whatsappSends = getModuleSends('whatsapp', days);
        const telegramSends = getModuleSends('telegram', days);
        const facebookSends = getModuleSends('facebook', days);
        const instagramSends = getModuleSends('instagram', days);

        return {
            totalSends: baseStats.totalSends || 0,
            whatsappSends: whatsappSends || 0,
            telegramSends: telegramSends || 0,
            facebookSends: facebookSends || 0,
            instagramSends: instagramSends || 0,
            successRate: baseStats.successRate || 100,
            totalCommission: baseStats.totalCommission || 0,
            mediaTypes: baseStats.mediaTypes || []
        };
    } catch (error) {
        console.error('[ANALYTICS] Error getting dashboard stats:', error);
        return {
            totalSends: 0,
            whatsappSends: 0,
            telegramSends: 0,
            facebookSends: 0,
            instagramSends: 0,
            successRate: 100,
            totalCommission: 0,
            mediaTypes: []
        };
    }
}

/**
 * Get sends count for a specific module
 */
function getModuleSends(module, days = 7) {
    try {
        // Count events for this module
        const events = db.getEvents(1000); // Get recent events

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        const moduleSends = events.filter(event => {
            const eventDate = new Date(event.timestamp);
            const isInRange = eventDate >= cutoffDate;
            const isModule = event.eventType && event.eventType.toLowerCase().includes(module);
            const isSend = event.eventType && event.eventType.toLowerCase().includes('send');

            return isInRange && isModule && isSend;
        });

        return moduleSends.length;
    } catch (error) {
        console.error(`[ANALYTICS] Error getting ${module} sends:`, error);
        return 0;
    }
}

/**
 * Get statistics for a specific module
 */
export function getModuleStats(module, days = 7) {
    try {
        const sends = getModuleSends(module, days);
        const events = db.getEvents(1000);

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        const moduleEvents = events.filter(event => {
            const eventDate = new Date(event.timestamp);
            const isInRange = eventDate >= cutoffDate;
            const isModule = event.eventType && event.eventType.toLowerCase().includes(module);

            return isInRange && isModule;
        });

        const successCount = moduleEvents.filter(e => e.success).length;
        const failCount = moduleEvents.filter(e => !e.success).length;
        const successRate = moduleEvents.length > 0
            ? (successCount / moduleEvents.length) * 100
            : 100;

        return {
            module,
            sends,
            successCount,
            failCount,
            successRate: Math.round(successRate * 10) / 10,
            totalEvents: moduleEvents.length
        };
    } catch (error) {
        console.error(`[ANALYTICS] Error getting ${module} stats:`, error);
        return {
            module,
            sends: 0,
            successCount: 0,
            failCount: 0,
            successRate: 100,
            totalEvents: 0
        };
    }
}

/**
 * Get sends over time for charts
 */
export function getSendsOverTime(days = 7) {
    try {
        return db.getSendsOverTime(days);
    } catch (error) {
        console.error('[ANALYTICS] Error getting sends over time:', error);
        return [];
    }
}

/**
 * Get top performing products
 */
export function getTopProducts(limit = 10, days = 30) {
    try {
        return db.getTopProducts(limit, days);
    } catch (error) {
        console.error('[ANALYTICS] Error getting top products:', error);
        return [];
    }
}

/**
 * Get group performance statistics
 */
export function getGroupPerformance(days = 30) {
    try {
        return db.getGroupPerformance(days);
    } catch (error) {
        console.error('[ANALYTICS] Error getting group performance:', error);
        return [];
    }
}

/**
 * Log an analytics event
 */
export function logEvent(eventType, data = {}) {
    try {
        return db.logEvent(eventType, data);
    } catch (error) {
        console.error('[ANALYTICS] Error logging event:', error);
        return null;
    }
}

export default {
    getDashboardStats,
    getModuleStats,
    getSendsOverTime,
    getTopProducts,
    getGroupPerformance,
    logEvent
};
