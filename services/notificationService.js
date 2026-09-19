import * as db from './database.js';

/**
 * Notification Service
 * Manages persistent notifications for the system using PostgreSQL
 */

/**
 * Add a new notification
 */
export async function addNotification(type, module, title, message, userId = null) {
    try {
        // Check user preferences if userId is provided
        if (userId) {
            const settings = await db.getNotificationSettings(userId);
            if (settings) {
                const settingKey = `${module}_${type}`;
                // Check specific module_type setting (e.g., whatsapp_success)
                if (settings[settingKey] === false) {
                    // console.log(`[NOTIFICATION SKIP] User disabled ${settingKey}`);
                    return null;
                }
                
                // Check system status setting
                if (module === 'system' && settings.system_status === false) {
                    return null;
                }
            }
        }

        const notification = await db.addNotificationDB(userId, type, module, title, message);
        console.log(`[NOTIFICATION] ${type.toUpperCase()} - ${title}: ${message}`);
        return notification;
    } catch (error) {
        console.error('[NOTIFICATION SERVICE] Error adding notification:', error);
        return null;
    }
}

/**
 * Get all notifications for a user
 */
export async function getNotifications(userId) {
    try {
        return await db.getNotificationsDB(userId);
    } catch (error) {
        console.error('[NOTIFICATION SERVICE] Error fetching notifications:', error);
        return [];
    }
}

/**
 * Get unread count
 */
export async function getUnreadCount(userId) {
    try {
        return await db.getUnreadNotificationsCountDB(userId);
    } catch (error) {
        console.error('[NOTIFICATION SERVICE] Error fetching unread count:', error);
        return 0;
    }
}

/**
 * Mark notification as read
 */
export async function markAsRead(id, userId) {
    try {
        await db.markNotificationAsReadDB(id, userId);
        return true;
    } catch (error) {
        console.error('[NOTIFICATION SERVICE] Error marking as read:', error);
        return false;
    }
}

/**
 * Mark all as read
 */
export async function markAllAsRead(userId) {
    try {
        await db.markAllNotificationsAsReadDB(userId);
        return true;
    } catch (error) {
        console.error('[NOTIFICATION SERVICE] Error marking all as read:', error);
        return false;
    }
}

/**
 * Delete single notification
 */
export async function deleteNotification(id, userId) {
    try {
        await db.deleteNotificationDB(id, userId);
        return true;
    } catch (error) {
        console.error('[NOTIFICATION SERVICE] Error deleting notification:', error);
        return false;
    }
}

/**
 * Clear all notifications
 */
export async function clearAll(userId) {
    try {
        await db.clearAllNotificationsDB(userId);
        return true;
    } catch (error) {
        console.error('[NOTIFICATION SERVICE] Error clearing notifications:', error);
        return false;
    }
}

export default {
    addNotification,
    getNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll
};
