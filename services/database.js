import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'meliflow.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize database schema
function initializeDatabase() {
    // Table for tracking sent products
    db.exec(`
        CREATE TABLE IF NOT EXISTS sent_products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id TEXT NOT NULL,
            product_name TEXT,
            price REAL,
            commission REAL,
            group_id TEXT,
            group_name TEXT,
            sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            media_type TEXT,
            category TEXT
        )
    `);

    // Index for faster queries
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_sent_products_date 
        ON sent_products(sent_at)
    `);

    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_sent_products_product_id 
        ON sent_products(product_id)
    `);

    // Table for analytics events
    db.exec(`
        CREATE TABLE IF NOT EXISTS analytics_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            product_id TEXT,
            group_id TEXT,
            success BOOLEAN,
            error_message TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Table for daily aggregated stats
    db.exec(`
        CREATE TABLE IF NOT EXISTS daily_stats (
            date TEXT PRIMARY KEY,
            total_sent INTEGER DEFAULT 0,
            total_failed INTEGER DEFAULT 0,
            total_skipped INTEGER DEFAULT 0,
            total_commission REAL DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Table for Facebook pages
    db.exec(`
        CREATE TABLE IF NOT EXISTS facebook_pages (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            access_token TEXT NOT NULL,
            enabled BOOLEAN DEFAULT 1,
            added_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Table for Schedules
    db.exec(`
        CREATE TABLE IF NOT EXISTS schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            platform TEXT NOT NULL,
            config TEXT NOT NULL,
            active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Table for Instagram Video Queue
    db.exec(`
        CREATE TABLE IF NOT EXISTS instagram_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_path TEXT NOT NULL,
            caption TEXT,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Table for Telegram Groups
    db.exec(`
        CREATE TABLE IF NOT EXISTS telegram_groups (
            group_id TEXT PRIMARY KEY,
            group_name TEXT NOT NULL,
            enabled BOOLEAN DEFAULT 1,
            added_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    console.log('✅ Database initialized successfully');
}

// Initialize on module load
initializeDatabase();

// ============================================
// TELEGRAM GROUPS FUNCTIONS
// ============================================

export function saveTelegramGroup(group) {
    const stmt = db.prepare(`
        INSERT OR REPLACE INTO telegram_groups (group_id, group_name, enabled)
        VALUES (?, ?, ?)
    `);
    stmt.run(group.groupId, group.groupName, group.enabled ? 1 : 0);
}

export function getTelegramGroups() {
    const stmt = db.prepare('SELECT * FROM telegram_groups');
    const groups = stmt.all();
    return groups.map(g => ({
        id: g.group_id,
        name: g.group_name,
        enabled: !!g.enabled
    }));
}

// Initialize on module load
initializeDatabase();

// ============================================
// PRODUCT TRACKING FUNCTIONS
// ============================================

/**
 * Log a sent product
 */
export function logSentProduct(productData) {
    const stmt = db.prepare(`
        INSERT INTO sent_products(product_id, product_name, price, commission, group_id, group_name, media_type, category)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?)
            `);

    return stmt.run(
        productData.productId,
        productData.productName,
        productData.price,
        productData.commission,
        productData.groupId,
        productData.groupName,
        productData.mediaType,
        productData.category || null
    );
}

/**
 * Get products sent in the last N hours
 */
export function getProductsSentInLastHours(hours = 24) {
    const stmt = db.prepare(`
        SELECT DISTINCT product_id
        FROM sent_products
        WHERE sent_at >= datetime('now', '-' || ? || ' hours')
        `);

    return stmt.all(hours).map(row => row.product_id);
}

/**
 * Check if a product was sent today
 */
export function wasProductSentToday(productId) {
    const stmt = db.prepare(`
        SELECT COUNT(*) as count
        FROM sent_products
        WHERE product_id = ?
        AND date(sent_at) = date('now')
            `);

    const result = stmt.get(productId);
    return result.count > 0;
}

// ============================================
// ANALYTICS FUNCTIONS
// ============================================

/**
 * Log an analytics event
 */
export function logEvent(eventType, data = {}) {
    const stmt = db.prepare(`
        INSERT INTO analytics_events(event_type, product_id, group_id, success, error_message)
        VALUES(?, ?, ?, ?, ?)
            `);

    // Convert boolean to integer (SQLite doesn't support boolean)
    let successValue = null;
    if (data.success !== undefined) {
        successValue = data.success ? 1 : 0;
    }

    return stmt.run(
        eventType,
        data.productId || null,
        data.groupId || null,
        successValue,
        data.errorMessage || null
    );
}

/**
 * Get dashboard statistics
 */
export function getDashboardStats(days = 7) {
    // Total sends in period
    const totalSends = db.prepare(`
        SELECT COUNT(*) as count
        FROM sent_products
        WHERE sent_at >= datetime('now', '-' || ? || ' days')
        `).get(days);

    // Total commission in period
    const totalCommission = db.prepare(`
        SELECT COALESCE(SUM(commission), 0) as total
        FROM sent_products
        WHERE sent_at >= datetime('now', '-' || ? || ' days')
        `).get(days);

    // Success rate
    const successRate = db.prepare(`
        SELECT 
            COUNT(CASE WHEN success = 1 THEN 1 END) * 100.0 / COUNT(*) as rate
        FROM analytics_events
        WHERE created_at >= datetime('now', '-' || ? || ' days')
        AND event_type = 'send'
        `).get(days);

    // Media type distribution
    const mediaTypes = db.prepare(`
        SELECT 
            media_type,
        COUNT(*) as count
        FROM sent_products
        WHERE sent_at >= datetime('now', '-' || ? || ' days')
        GROUP BY media_type
        `).all(days);

    return {
        totalSends: totalSends.count,
        totalCommission: totalCommission.total,
        successRate: successRate.rate || 100,
        mediaTypes: mediaTypes
    };
}

/**
 * Get sends over time (for chart)
 */
export function getSendsOverTime(days = 7) {
    const stmt = db.prepare(`
        SELECT 
            date(sent_at) as date,
        COUNT(*) as count,
        COALESCE(SUM(commission), 0) as commission
        FROM sent_products
        WHERE sent_at >= datetime('now', '-' || ? || ' days')
        GROUP BY date(sent_at)
        ORDER BY date(sent_at)
        `);

    return stmt.all(days);
}

/**
 * Get top products by send count
 */
export function getTopProducts(limit = 10, days = 30) {
    const stmt = db.prepare(`
        SELECT 
            product_id,
        product_name,
        COUNT(*) as send_count,
        COALESCE(SUM(commission), 0) as total_commission,
        AVG(price) as avg_price
        FROM sent_products
        WHERE sent_at >= datetime('now', '-' || ? || ' days')
        GROUP BY product_id, product_name
        ORDER BY send_count DESC
        LIMIT ?
            `);

    return stmt.all(days, limit);
}

/**
 * Get group performance statistics
 */
export function getGroupPerformance(days = 30) {
    const stmt = db.prepare(`
        SELECT 
            group_id,
        group_name,
        COUNT(*) as total_sends,
        COALESCE(SUM(commission), 0) as total_commission
        FROM sent_products
        WHERE sent_at >= datetime('now', '-' || ? || ' days')
        GROUP BY group_id, group_name
        ORDER BY total_sends DESC
        `);

    return stmt.all(days);
}

/**
 * Get analytics events (for logs page)
 */
export function getEvents(limit = 100) {
    const stmt = db.prepare(`
        SELECT 
            id,
        event_type as eventType,
        product_id as productId,
        group_id as groupId,
        success,
        error_message as errorMessage,
        created_at as timestamp
        FROM analytics_events
        ORDER BY created_at DESC
        LIMIT ?
            `);

    return stmt.all(limit).map(row => ({
        ...row,
        success: Boolean(row.success)
    }));
}

/**
 * Update daily stats (called at end of day or on demand)
 */
export function updateDailyStats(date = null) {
    const targetDate = date || new Date().toISOString().split('T')[0];

    const stats = db.prepare(`
        SELECT 
            COUNT(*) as total_sent,
        COALESCE(SUM(commission), 0) as total_commission
        FROM sent_products
        WHERE date(sent_at) = ?
        `).get(targetDate);

    const events = db.prepare(`
        SELECT 
            COUNT(CASE WHEN success = 0 THEN 1 END) as total_failed
        FROM analytics_events
        WHERE date(created_at) = ?
        AND event_type = 'send'
            `).get(targetDate);

    const stmt = db.prepare(`
        INSERT OR REPLACE INTO daily_stats(date, total_sent, total_failed, total_commission, updated_at)
        VALUES(?, ?, ?, ?, CURRENT_TIMESTAMP)
            `);

    return stmt.run(
        targetDate,
        stats.total_sent,
        events.total_failed,
        stats.total_commission
    );
}

// ============================================
// FACEBOOK PAGES FUNCTIONS
// ============================================

/**
 * Add or update a Facebook page
 */
export function saveFacebookPage(pageData) {
    const stmt = db.prepare(`
        INSERT OR REPLACE INTO facebook_pages(id, name, access_token, enabled, added_at)
        VALUES(?, ?, ?, ?, COALESCE((SELECT added_at FROM facebook_pages WHERE id = ?), CURRENT_TIMESTAMP))
        `);

    return stmt.run(
        pageData.id,
        pageData.name,
        pageData.accessToken,
        pageData.enabled ? 1 : 0,
        pageData.id
    );
}

/**
 * Get all Facebook pages
 */
export function getFacebookPages() {
    const stmt = db.prepare(`
        SELECT id, name, access_token as accessToken, enabled, added_at as addedAt
        FROM facebook_pages
        ORDER BY added_at DESC
        `);

    return stmt.all().map(row => ({
        ...row,
        enabled: Boolean(row.enabled)
    }));
}

/**
 * Remove a Facebook page
 */
export function removeFacebookPage(pageId) {
    const stmt = db.prepare(`
        DELETE FROM facebook_pages WHERE id = ?
        `);

    return stmt.run(pageId);
}

/**
 * Toggle Facebook page enabled status
 */
export function toggleFacebookPage(pageId) {
    const stmt = db.prepare(`
        UPDATE facebook_pages
        SET enabled = NOT enabled
        WHERE id = ?
        `);

    const result = stmt.run(pageId);

    if (result.changes > 0) {
        const page = db.prepare('SELECT enabled FROM facebook_pages WHERE id = ?').get(pageId);
        return { success: true, enabled: Boolean(page.enabled) };
    }

    return { success: false };
}

// ============================================
// SCHEDULES FUNCTIONS
// ============================================

/**
 * Save a schedule
 */
export function saveSchedule(platform, config) {
    const stmt = db.prepare(`
        INSERT INTO schedules(platform, config, active)
    VALUES(?, ?, ?)
        `);

    const result = stmt.run(
        platform,
        JSON.stringify(config),
        config.schedule?.enabled !== false ? 1 : 0
    );

    return { id: result.lastInsertRowid, success: true };
}

/**
 * Get all schedules
 */
export function getSchedules() {
    const stmt = db.prepare(`
        SELECT id, platform, config, active, created_at as createdAt
        FROM schedules
        ORDER BY created_at DESC
        `);

    return stmt.all().map(row => ({
        ...row,
        config: JSON.parse(row.config),
        active: Boolean(row.active)
    }));
}

/**
 * Get active schedules
 */
export function getActiveSchedules() {
    const stmt = db.prepare(`
        SELECT id, platform, config, active, created_at as createdAt
        FROM schedules
        WHERE active = 1
        `);

    return stmt.all().map(row => ({
        ...row,
        config: JSON.parse(row.config),
        active: Boolean(row.active)
    }));
}

/**
 * Delete a schedule
 */
export function deleteSchedule(id) {
    const stmt = db.prepare(`
        DELETE FROM schedules WHERE id = ?
        `);
    return stmt.run(id);
}

/**
 * Toggle schedule active status
 */
export function toggleSchedule(id, active) {
    const stmt = db.prepare(`
        UPDATE schedules SET active = ? WHERE id = ?
        `);
    return stmt.run(active ? 1 : 0, id);
}

// --- INSTAGRAM QUEUE FUNCTIONS ---

/**
 * Add video to Instagram queue
 */
export function addToInstagramQueue(videoPath, caption, scheduledTime = null) {
    const stmt = db.prepare(`
        INSERT INTO instagram_queue(video_path, caption, scheduled_time)
    VALUES(?, ?, ?)
        `);
    const result = stmt.run(videoPath, caption, scheduledTime);
    return { success: true, id: result.lastInsertRowid };
}

/**
 * Get all videos in queue
 */
export function getInstagramQueue(status = null) {
    let query = 'SELECT * FROM instagram_queue';
    if (status) {
        query += ' WHERE status = ?';
    }
    query += ' ORDER BY created_at ASC';

    const stmt = db.prepare(query);
    return status ? stmt.all(status) : stmt.all();
}

/**
 * Get pending videos for posting
 */
export function getPendingInstagramVideos() {
    const stmt = db.prepare(`
    SELECT * FROM instagram_queue 
        WHERE status = 'pending'
    AND(scheduled_time IS NULL OR scheduled_time <= datetime('now'))
        ORDER BY created_at ASC
        `);
    return stmt.all();
}

/**
 * Update video caption
 */
export function updateInstagramCaption(id, caption) {
    const stmt = db.prepare(`
        UPDATE instagram_queue SET caption = ? WHERE id = ?
        `);
    stmt.run(caption, id);
    return { success: true };
}

/**
 * Mark video as posted
 */
export function markInstagramVideoPosted(id) {
    const stmt = db.prepare(`
        UPDATE instagram_queue 
        SET status = 'posted', posted_at = datetime('now')
        WHERE id = ?
        `);
    stmt.run(id);
    return { success: true };
}

/**
 * Mark video as failed
 */
export function markInstagramVideoFailed(id, error) {
    const stmt = db.prepare(`
        UPDATE instagram_queue 
        SET status = 'failed', error = ?
        WHERE id = ?
            `);
    stmt.run(error, id);
    return { success: true };
}

/**
 * Delete video from queue
 */
export function deleteFromInstagramQueue(id) {
    const stmt = db.prepare(`
        DELETE FROM instagram_queue WHERE id = ?
        `);
    stmt.run(id);
    return { success: true };
}

// Export database instance for advanced queries
export default db;
