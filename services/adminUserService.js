import * as db from './database.js';
import bcrypt from 'bcrypt';
import * as auditService from './auditService.js';

/**
 * Get users with advanced filtering
 */
export async function getUsers(filters = {}) {
    let queryText = `
        SELECT 
            id, email, name, subscription_plan, subscription_status, 
            subscription_start, subscription_end, payment_method, 
            total_paid, created_at, last_login, is_blocked, phone, document, role
        FROM users
        WHERE deleted_at IS NULL
    `;

    const params = [];
    let paramIndex = 1;

    if (filters.search) {
        queryText += ` AND (name ILIKE $${paramIndex} OR email ILIKE $${paramIndex + 1} OR document ILIKE $${paramIndex + 2})`;
        const term = `%${filters.search}%`;
        params.push(term, term, term);
        paramIndex += 3;
    }

    if (filters.plan && filters.plan !== 'all') {
        queryText += ` AND subscription_plan = $${paramIndex}`;
        params.push(filters.plan);
        paramIndex++;
    }

    if (filters.status && filters.status !== 'all') {
        queryText += ` AND subscription_status = $${paramIndex}`;
        params.push(filters.status);
        paramIndex++;
    }

    if (filters.blocked === 'true') {
        queryText += ` AND is_blocked = true`;
    }

    queryText += ` ORDER BY created_at DESC`;

    try {
        const res = await db.query(queryText, params);
        return res.rows;
    } catch (error) {
        console.error('[ADMIN USER] Error getting users:', error);
        throw error;
    }
}

/**
 * Get full user details
 */
export async function getUserDetails(id) {
    try {
        const res = await db.query(`
            SELECT * FROM users WHERE id = $1
        `, [id]);

        const user = res.rows[0];

        if (!user) return null;

        // Get recent logs
        const logs = await auditService.getUserLogs(id, 50);

        return {
            ...user,
            logs
        };
    } catch (error) {
        console.error('[ADMIN USER] Error getting user details:', error);
        throw error;
    }
}

/**
 * Update user profile
 */
export async function updateUser(id, data, adminId) {
    try {
        const updates = [];
        const values = [];
        let paramIndex = 1;

        const allowedFields = ['name', 'email', 'phone', 'document', 'subscription_plan', 'subscription_status', 'role'];

        for (const field of allowedFields) {
            if (data[field] !== undefined) {
                updates.push(`${field} = $${paramIndex}`);
                values.push(data[field]);
                paramIndex++;
            }
        }

        if (updates.length === 0) return { success: true };

        values.push(id);
        const queryText = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`;

        await db.query(queryText, values);

        await auditService.logAction(adminId, 'update_user', { userId: id, updates: data });

        return { success: true };
    } catch (error) {
        console.error('[ADMIN USER] Error updating user:', error);
        throw error;
    }
}

/**
 * Reset user password
 */
export async function resetPassword(id, newPassword, adminId) {
    try {
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await db.query(`
            UPDATE users SET password = $1 WHERE id = $2
        `, [hashedPassword, id]);

        await auditService.logAction(adminId, 'reset_password', { userId: id });

        return { success: true };
    } catch (error) {
        console.error('[ADMIN USER] Error resetting password:', error);
        throw error;
    }
}

/**
 * Toggle user block status
 */
export async function toggleUserBlock(id, isBlocked, adminId) {
    try {
        await db.query(`
            UPDATE users SET is_blocked = $1 WHERE id = $2
        `, [isBlocked, id]);

        await auditService.logAction(adminId, 'toggle_block', { userId: id, isBlocked });

        return { success: true };
    } catch (error) {
        console.error('[ADMIN USER] Error toggling block:', error);
        throw error;
    }
}

/**
 * Soft delete user
 */
export async function deleteUser(id, adminId) {
    try {
        await db.query(`
            UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1
        `, [id]);

        await auditService.logAction(adminId, 'delete_user', { userId: id });

        return { success: true };
    } catch (error) {
        console.error('[ADMIN USER] Error deleting user:', error);
        throw error;
    }
}
