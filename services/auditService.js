import db from './database.js';

/**
 * Initialize audit logs table
 */
export async function initializeAudit() {
    // Schema is handled in database.js initializeDatabase
    console.log('✅ Audit Logs system initialized');
}

/**
 * Log an action
 * @param {number} userId - ID of the user performing the action (or null for system)
 * @param {string} action - Action name (e.g., 'login', 'update_user', 'delete_post')
 * @param {object} details - Additional details about the action
 * @param {string} ipAddress - IP address of the user
 */
export async function logAction(userId, action, details = {}, ipAddress = null) {
    try {
        await db.query(`
            INSERT INTO audit_logs (user_id, action, details, ip_address)
            VALUES ($1, $2, $3, $4)
        `, [
            userId,
            action,
            JSON.stringify(details),
            ipAddress
        ]);
    } catch (error) {
        console.error('[AUDIT] Error logging action:', error);
    }
}

/**
 * Get audit logs for a specific user
 */
export async function getUserLogs(userId, limit = 100) {
    try {
        const res = await db.query(`
            SELECT * FROM audit_logs 
            WHERE user_id = $1 
            ORDER BY created_at DESC 
            LIMIT $2
        `, [userId, limit]);

        return res.rows.map(log => ({
            ...log,
            details: JSON.parse(log.details || '{}')
        }));
    } catch (error) {
        console.error('[AUDIT] Error getting user logs:', error);
        return [];
    }
}

/**
 * Get all system logs (admin)
 */
export async function getAllLogs(limit = 100) {
    try {
        const res = await db.query(`
            SELECT a.*, u.email, u.name 
            FROM audit_logs a
            LEFT JOIN users u ON a.user_id = u.id
            ORDER BY a.created_at DESC 
            LIMIT $1
        `, [limit]);

        return res.rows.map(log => ({
            ...log,
            details: JSON.parse(log.details || '{}')
        }));
    } catch (error) {
        console.error('[AUDIT] Error getting all logs:', error);
        return [];
    }
}

// Initialize on load
initializeAudit();

export default {
    initializeAudit,
    logAction,
    getUserLogs,
    getAllLogs
};
