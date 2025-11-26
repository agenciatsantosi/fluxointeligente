/**
 * Notification Service
 * Manages in-memory notifications for the system
 */

let notifications = [];
let notificationId = 1;

/**
 * Add a new notification
 */
export function addNotification(type, module, title, message) {
    const notification = {
        id: (notificationId++).toString(),
        type, // 'success' | 'error' | 'warning' | 'info'
        module, // 'whatsapp' | 'telegram' | 'instagram' | 'facebook' | 'pinterest' | 'shopee' | 'system'
        title,
        message,
        timestamp: new Date().toISOString(),
        read: false
    };

    notifications.unshift(notification);

    // Keep only last 100 notifications
    if (notifications.length > 100) {
        notifications = notifications.slice(0, 100);
    }

    console.log(`[NOTIFICATION] ${type.toUpperCase()} - ${title}: ${message}`);
    return notification;
}

/**
 * Get all notifications
 */
export function getNotifications() {
    return notifications;
}

/**
 * Get unread count
 */
export function getUnreadCount() {
    return notifications.filter(n => !n.read).length;
}

/**
 * Mark notification as read
 */
export function markAsRead(id) {
    const notification = notifications.find(n => n.id === id);
    if (notification) {
        notification.read = true;
        return true;
    }
    return false;
}

/**
 * Mark all as read
 */
export function markAllAsRead() {
    notifications.forEach(n => n.read = true);
    return true;
}

/**
 * Clear all notifications
 */
export function clearAll() {
    notifications = [];
    notificationId = 1;
    return true;
}

/**
 * Delete single notification
 */
export function deleteNotification(id) {
    const index = notifications.findIndex(n => n.id === id);
    if (index !== -1) {
        notifications.splice(index, 1);
        return true;
    }
    return false;
}

export default {
    addNotification,
    getNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
    clearAll,
    deleteNotification
};
