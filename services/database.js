import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: '.env.local', override: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL
});

// Helper for queries
export async function query(text, params) {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        // console.log('executed query', { text, duration, rows: res.rowCount });
        return res;
    } catch (error) {
        console.error('Database query error:', error.message, 'Query:', text);
        throw error;
    }
}

// Initialize database schema
export async function initializeDatabase() {
    try {
        // Table for users (Centralized here)
        await query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                name TEXT,
                role TEXT DEFAULT 'user',
                subscription_plan TEXT DEFAULT 'free',
                subscription_status TEXT DEFAULT 'active',
                subscription_start TIMESTAMP,
                subscription_end TIMESTAMP,
                payment_method TEXT,
                total_paid REAL DEFAULT 0,
                last_login TIMESTAMP,
                is_blocked BOOLEAN DEFAULT FALSE,
                phone TEXT,
                document TEXT,
                deleted_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Table for tracking sent products
        await query(`
            CREATE TABLE IF NOT EXISTS sent_products (
                id SERIAL PRIMARY KEY,
                product_id TEXT NOT NULL,
                product_name TEXT,
                price REAL,
                commission REAL,
                group_id TEXT,
                group_name TEXT,
                sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                media_type TEXT,
                category TEXT,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Index for faster queries
        await query(`CREATE INDEX IF NOT EXISTS idx_sent_products_date ON sent_products(sent_at)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_sent_products_product_id ON sent_products(product_id)`);

        // Table for analytics events
        await query(`
            CREATE TABLE IF NOT EXISTS analytics_events (
                id SERIAL PRIMARY KEY,
                event_type TEXT NOT NULL,
                product_id TEXT,
                group_id TEXT,
                success BOOLEAN,
                error_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Table for daily aggregated stats
        await query(`
            CREATE TABLE IF NOT EXISTS daily_stats (
                date TEXT PRIMARY KEY,
                total_sent INTEGER DEFAULT 0,
                total_failed INTEGER DEFAULT 0,
                total_skipped INTEGER DEFAULT 0,
                total_commission REAL DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Table for Facebook pages
        await query(`
            CREATE TABLE IF NOT EXISTS facebook_pages (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                access_token TEXT NOT NULL,
                enabled BOOLEAN DEFAULT TRUE,
                instagram_business_id TEXT,
                instagram_username TEXT,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Table for Schedules
        await query(`
            CREATE TABLE IF NOT EXISTS schedules (
                id SERIAL PRIMARY KEY,
                platform TEXT NOT NULL,
                config TEXT NOT NULL,
                caption TEXT,
                status TEXT DEFAULT 'pending',
                active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Table for Automation Execution Queue (Randomized scheduling)
        await query(`
            CREATE TABLE IF NOT EXISTS automation_execution_queue (
                id SERIAL PRIMARY KEY,
                schedule_id INTEGER REFERENCES schedules(id) ON DELETE CASCADE,
                platform TEXT NOT NULL,
                planned_time TIMESTAMP NOT NULL,
                status TEXT DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Table for Telegram Groups
        await query(`
            CREATE TABLE IF NOT EXISTS telegram_groups (
                group_id TEXT PRIMARY KEY,
                group_name TEXT NOT NULL,
                enabled BOOLEAN DEFAULT TRUE,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Table for Telegram Bots (Accounts)
        await query(`
            CREATE TABLE IF NOT EXISTS telegram_accounts (
                id SERIAL PRIMARY KEY,
                name TEXT,
                username TEXT,
                token TEXT NOT NULL,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Table for audit logs
        await query(`
            CREATE TABLE IF NOT EXISTS audit_logs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                action TEXT NOT NULL,
                details TEXT,
                ip_address TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // System Config Table
        await query(`
            CREATE TABLE IF NOT EXISTS system_config (
                key TEXT PRIMARY KEY,
                value TEXT,
                description TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // User Config Table
        await query(`
            CREATE TABLE IF NOT EXISTS user_config (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                key TEXT NOT NULL,
                value TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, key)
            )
        `);

        // WhatsApp Accounts Table (Phone numbers/connections)
        await query(`
            CREATE TABLE IF NOT EXISTS whatsapp_accounts (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                phone TEXT,
                status TEXT DEFAULT 'disconnected',
                session_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // WhatsApp Groups Table
        await query(`
            CREATE TABLE IF NOT EXISTS whatsapp_groups (
                group_id TEXT NOT NULL,
                group_name TEXT NOT NULL,
                enabled BOOLEAN DEFAULT TRUE,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                account_id INTEGER REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
                PRIMARY KEY (group_id, user_id, account_id)
            )
        `);

        // Pinterest Boards Table
        await query(`
            CREATE TABLE IF NOT EXISTS pinterest_boards (
                board_id TEXT NOT NULL,
                board_name TEXT NOT NULL,
                enabled BOOLEAN DEFAULT TRUE,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                PRIMARY KEY (board_id, user_id)
            )
        `);

        // Instagram Accounts Table
        await query(`
            CREATE TABLE IF NOT EXISTS instagram_accounts(
                id SERIAL PRIMARY KEY,
                name TEXT,
                access_token TEXT NOT NULL,
                account_id TEXT NOT NULL,
                username TEXT,
                profile_picture_url TEXT,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Instagram Queue Table
        await query(`
            CREATE TABLE IF NOT EXISTS instagram_queue (
                id SERIAL PRIMARY KEY,
                video_path TEXT NOT NULL,
                caption TEXT,
                aspect_ratio TEXT DEFAULT '9:16',
                status TEXT DEFAULT 'pending',
                scheduled_time TIMESTAMP,
                posted_at TIMESTAMP,
                error TEXT,
                title TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Migrations for Instagram Queue
        try {
            await query("ALTER TABLE instagram_queue ADD COLUMN IF NOT EXISTS aspect_ratio TEXT DEFAULT '9:16'");
            await query("ALTER TABLE instagram_queue ADD COLUMN IF NOT EXISTS media_url TEXT");
            await query("ALTER TABLE instagram_queue ADD COLUMN IF NOT EXISTS telegram_message_id TEXT");
            console.log('[DATABASE] Instagram queue migrations completed');
        } catch (migErr) {
            console.warn('[DATABASE] Instagram queue migrations warning (likely already exists):', migErr.message);
        }

        // Story Queue Table (for both Instagram and Facebook scheduled stories)
        await query(`
            CREATE TABLE IF NOT EXISTS story_queue (
                id SERIAL PRIMARY KEY,
                platform TEXT NOT NULL,
                account_id TEXT NOT NULL,
                media_url TEXT NOT NULL,
                media_type TEXT DEFAULT 'image',
                caption TEXT,
                status TEXT DEFAULT 'pending',
                scheduled_time TIMESTAMP,
                posted_at TIMESTAMP,
                error TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_story_queue_status ON story_queue(status, scheduled_time)`);
 
        // Facebook Reels Queue Table
        await query(`
            CREATE TABLE IF NOT EXISTS facebook_reels_queue (
                id SERIAL PRIMARY KEY,
                video_path TEXT NOT NULL,
                caption TEXT,
                aspect_ratio TEXT DEFAULT '9:16',
                status TEXT DEFAULT 'pending',
                scheduled_time TIMESTAMP,
                posted_at TIMESTAMP,
                error TEXT,
                title TEXT,
                share_to_feed BOOLEAN DEFAULT TRUE,
                allow_comments BOOLEAN DEFAULT TRUE,
                allow_embedding BOOLEAN DEFAULT TRUE,
                playlist_id TEXT,
                thumbnail_url TEXT,
                thumb_offset INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_fb_reels_queue_status ON facebook_reels_queue(status, scheduled_time)`);
 
        // Pinterest Accounts Table
        await query(`
            CREATE TABLE IF NOT EXISTS pinterest_accounts (
                id SERIAL PRIMARY KEY,
                username TEXT,
                access_token TEXT NOT NULL,
                enabled BOOLEAN DEFAULT TRUE,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Twitter Accounts Table
        await query(`
            CREATE TABLE IF NOT EXISTS twitter_accounts (
                id SERIAL PRIMARY KEY,
                username TEXT,
                api_key TEXT NOT NULL,
                api_secret TEXT NOT NULL,
                access_token TEXT NOT NULL,
                access_token_secret TEXT NOT NULL,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // AI Agents Table
        await query(`
            CREATE TABLE IF NOT EXISTS ai_agents (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                account_id TEXT NOT NULL,
                platform TEXT NOT NULL,
                is_active BOOLEAN DEFAULT FALSE,
                prompt TEXT,
                model TEXT DEFAULT 'gemini-1.5-flash',
                activation_keyword TEXT,
                handoff_active BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(account_id, platform)
            )
        `);

        // Migration to add column to existing table
        try {
            await query(`ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS activation_keyword TEXT`);
            await query(`ALTER TABLE facebook_pages ADD COLUMN IF NOT EXISTS instagram_business_id TEXT`);
            await query(`ALTER TABLE facebook_pages ADD COLUMN IF NOT EXISTS instagram_username TEXT`);
            await query(`ALTER TABLE whatsapp_groups ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES whatsapp_accounts(id) ON DELETE CASCADE`);
            await query(`ALTER TABLE instagram_queue ADD COLUMN IF NOT EXISTS aspect_ratio TEXT DEFAULT '9:16'`);
            await query(`ALTER TABLE instagram_queue ADD COLUMN IF NOT EXISTS share_to_feed BOOLEAN DEFAULT TRUE`);
            await query(`ALTER TABLE instagram_queue ADD COLUMN IF NOT EXISTS allow_comments BOOLEAN DEFAULT TRUE`);
            await query(`ALTER TABLE instagram_queue ADD COLUMN IF NOT EXISTS allow_embedding BOOLEAN DEFAULT TRUE`);
            await query(`ALTER TABLE instagram_queue ADD COLUMN IF NOT EXISTS playlist_id TEXT`);
            await query(`ALTER TABLE instagram_queue ADD COLUMN IF NOT EXISTS thumbnail_url TEXT`);
            await query(`ALTER TABLE instagram_queue ADD COLUMN IF NOT EXISTS thumb_offset INTEGER`);
            
            // New columns for Meta health monitoring
            await query(`ALTER TABLE facebook_pages ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'`);
            await query(`ALTER TABLE facebook_pages ADD COLUMN IF NOT EXISTS last_error TEXT`);
            await query(`ALTER TABLE instagram_accounts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'`);
            await query(`ALTER TABLE instagram_accounts ADD COLUMN IF NOT EXISTS last_error TEXT`);

            // New columns for token management
            await query(`ALTER TABLE instagram_accounts ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP`);
            await query(`ALTER TABLE instagram_accounts ADD COLUMN IF NOT EXISTS token_type TEXT DEFAULT 'short_lived'`);
            
            // Comment automations updates
            await query(`ALTER TABLE comment_automations ADD COLUMN IF NOT EXISTS trigger_count INTEGER DEFAULT 0`);
            await query(`ALTER TABLE comment_automations ADD COLUMN IF NOT EXISTS button_text TEXT`);
            await query(`ALTER TABLE comment_automations ADD COLUMN IF NOT EXISTS button_url TEXT`);
            await query(`ALTER TABLE comment_automations ADD COLUMN IF NOT EXISTS trigger_type TEXT DEFAULT 'all_posts'`);
            await query(`ALTER TABLE comment_automations ADD COLUMN IF NOT EXISTS post_id TEXT`);
            await query(`ALTER TABLE comment_automations ADD COLUMN IF NOT EXISTS post_url TEXT`);

            // Bio Link Pro Migrations
            await query(`ALTER TABLE shopee_bio_settings ADD COLUMN IF NOT EXISTS links_data TEXT DEFAULT '[]'`);
            await query(`ALTER TABLE shopee_bio_settings ADD COLUMN IF NOT EXISTS font_family TEXT DEFAULT 'Sans-serif'`);
            await query(`ALTER TABLE shopee_bio_settings ADD COLUMN IF NOT EXISTS testimonials TEXT DEFAULT '[]'`);
        } catch (e) {
            console.log('Migration error (likely columns already exist):', e.message);
        }

        // Automation Execution Queue Table
        await query(`
            CREATE TABLE IF NOT EXISTS automation_execution_queue (
                id SERIAL PRIMARY KEY,
                schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
                platform TEXT NOT NULL,
                planned_time TIMESTAMP NOT NULL,
                status TEXT DEFAULT 'pending',
                error_message TEXT,
                executed_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_automation_queue_status ON automation_execution_queue(status, planned_time)`);

        // Comment Automations Table
        await query(`
            CREATE TABLE IF NOT EXISTS comment_automations (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                account_id TEXT NOT NULL,
                platform TEXT NOT NULL,
                keyword TEXT NOT NULL,
                reply_type TEXT DEFAULT 'fixed',
                reply_text TEXT,
                send_dm BOOLEAN DEFAULT FALSE,
                dm_text TEXT,
                button_text TEXT,
                button_url TEXT,
                trigger_type TEXT DEFAULT 'all_posts',
                post_id TEXT,
                post_url TEXT,
                is_active BOOLEAN DEFAULT TRUE,
                trigger_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);


        // Table for Downloader Scheduled Posts
        await query(`
            CREATE TABLE IF NOT EXISTS downloader_schedule (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                source_url TEXT NOT NULL,
                media_url TEXT NOT NULL,
                media_type TEXT NOT NULL,
                platform TEXT NOT NULL,
                account_id TEXT NOT NULL,
                caption TEXT,
                scheduled_at TIMESTAMP NOT NULL,
                status TEXT DEFAULT 'pending',
                error_message TEXT,
                posted_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_downloader_schedule_status ON downloader_schedule(status, scheduled_at)`);

        // Table for Shopee Shopee Bio Links (Vitrine)
        await query(`
            CREATE TABLE IF NOT EXISTS shopee_bio_links (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                product_id TEXT NOT NULL,
                name TEXT NOT NULL,
                image_url TEXT,
                affiliate_link TEXT NOT NULL,
                category TEXT,
                clicks INTEGER DEFAULT 0,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // --- SHOPEE BIO SETTINGS TABLE (PREMIUM PRO) ---
        await query(`
            CREATE TABLE IF NOT EXISTS shopee_bio_settings (
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                whatsapp_link TEXT,
                primary_color TEXT DEFAULT '#EE4D2D',
                secondary_color TEXT DEFAULT '#1A1A1A',
                font_family TEXT DEFAULT 'Sans-serif',
                logo_url TEXT,
                hero_image_url TEXT,
                title TEXT,
                description TEXT,
                whatsapp_banner_text TEXT DEFAULT '👉 Entre na nossa comunidade no WhatsApp',
                theme TEXT DEFAULT 'Papel Natural',
                background_url TEXT,
                overlay_opacity INTEGER DEFAULT 50,
                hero_text TEXT DEFAULT 'AGENDAR CONSULTA AGORA',
                hero_link TEXT,
                testimonials TEXT DEFAULT '[]',
                links_data TEXT DEFAULT '[]', -- Novos links modulares personalizados
                limited_slots_enabled INTEGER DEFAULT 0,
                limited_slots_text TEXT DEFAULT 'VAGAS LIMITADAS',
                whatsapp_floating_enabled INTEGER DEFAULT 1,
                save_contact_enabled INTEGER DEFAULT 0,
                slug TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // --- SHOPEE BIO ANALYTICS TABLE ---
        await query(`
            CREATE TABLE IF NOT EXISTS shopee_bio_analytics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                type TEXT, -- 'visit' ou 'click'
                link_id INTEGER REFERENCES shopee_bio_links(id) ON DELETE SET NULL,
                location TEXT,
                ip TEXT,
                device TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await query(`CREATE INDEX IF NOT EXISTS idx_shopee_bio_user ON shopee_bio_links(user_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_shopee_bio_name ON shopee_bio_links(name)`);

        console.log('✅ PostgreSQL Database initialized successfully');

    } catch (error) {
        console.error('❌ Error initializing database:', error);
    }
}

// ============================================
// DOWNLOADER SCHEDULE FUNCTIONS
// ============================================

export async function addDownloaderSchedule(data, userId) {
    const res = await query(`
        INSERT INTO downloader_schedule(user_id, source_url, media_url, media_type, platform, account_id, caption, scheduled_at)
        VALUES($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
    `, [userId, data.sourceUrl, data.mediaUrl, data.mediaType, data.platform, data.accountId, data.caption || '', data.scheduledAt]);
    return res.rows[0];
}

export async function getDownloaderSchedule(userId) {
    const res = await query(`
        SELECT * FROM downloader_schedule
        WHERE user_id = $1
        ORDER BY scheduled_at ASC
    `, [userId]);
    return res.rows;
}

export async function deleteDownloaderSchedule(id, userId) {
    return await query(`DELETE FROM downloader_schedule WHERE id = $1 AND user_id = $2`, [id, userId]);
}

export async function getPendingDownloaderSchedules() {
    const res = await query(`
        SELECT * FROM downloader_schedule
        WHERE status = 'pending' AND scheduled_at <= NOW()
        ORDER BY scheduled_at ASC
    `);
    return res.rows;
}

export async function clearFailedDownloaderSchedules(userId) {
    return await query(`
        DELETE FROM downloader_schedule
        WHERE user_id = $1 AND status = 'failed'
    `, [userId]);
}

export async function updateDownloaderScheduleStatus(id, status, errorMsg = null) {
    return await query(`
        UPDATE downloader_schedule
        SET status = $1, error_message = $2, posted_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE NULL END
        WHERE id = $3
    `, [status, errorMsg, id]);
}

export async function getAccountQueueInfo(accountId, userId) {
    const res = await query(`
        SELECT 
            COUNT(*) AS total,
            MIN(scheduled_at) AS earliest,
            MAX(scheduled_at) AS latest
        FROM downloader_schedule
        WHERE account_id = $1 AND user_id = $2 AND status = 'pending'
    `, [accountId, userId]);
    return res.rows[0];
}

export async function addDownloaderScheduleBatch(items, userId) {
    const inserted = [];
    for (const data of items) {
        const res = await query(`
            INSERT INTO downloader_schedule(user_id, source_url, media_url, media_type, platform, account_id, caption, scheduled_at)
            VALUES($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `, [userId, data.sourceUrl, data.mediaUrl, data.mediaType, data.platform, data.accountId, data.caption || '', data.scheduledAt]);
        inserted.push(res.rows[0]);
    }
    return inserted;
}

// ============================================
// AUTOMATION QUEUE FUNCTIONS
// ============================================

export async function addToAutomationQueue(scheduleId, platform, plannedTime, userId) {
    const queryStr = `
        INSERT INTO automation_execution_queue(schedule_id, platform, planned_time, user_id, status)
        VALUES($1, $2, $3, $4, 'pending')
        RETURNING *
    `;
    const res = await query(queryStr, [scheduleId, platform, plannedTime, userId]);
    return res.rows[0];
}

export async function getPlannedTasks(userId, limit = 10) {
    const queryStr = `
        SELECT q.*, s.platform as schedule_platform
        FROM automation_execution_queue q
        JOIN schedules s ON q.schedule_id = s.id
        WHERE q.user_id = $1 AND q.status = 'pending'
        ORDER BY q.planned_time ASC
        LIMIT $2
    `;
    const res = await query(queryStr, [userId, limit]);
    return res.rows;
}

export async function clearAutomationQueue(scheduleId, userId) {
    return await query(
        'DELETE FROM automation_execution_queue WHERE schedule_id = $1 AND user_id = $2 AND status = \'pending\'',
        [scheduleId, userId]
    );
}

export async function getPendingAutomationTasks() {
    const res = await query(
        'SELECT * FROM automation_execution_queue WHERE status = \'pending\' AND planned_time <= NOW() ORDER BY planned_time ASC'
    );
    return res.rows;
}

export async function markAutomationTaskComplete(id) {
    return await query(
        'UPDATE automation_execution_queue SET status = \'completed\', executed_at = NOW() WHERE id = $1',
        [id]
    );
}

// ============================================
// COMMENT AUTOMATIONS FUNCTIONS
// ============================================

export async function getCommentAutomations(userId) {
    const queryStr = `
        SELECT * FROM comment_automations 
        WHERE user_id = $1 
        ORDER BY created_at DESC
    `;
    const res = await query(queryStr, [userId]);
    return res.rows;
}

export async function addCommentAutomation(data, userId) {
    const queryStr = `
        INSERT INTO comment_automations (
            user_id, account_id, platform, keyword, reply_type, 
            reply_text, send_dm, dm_text, is_active, button_text, button_url
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
    `;
    const params = [
        userId, data.account_id, data.platform, data.keyword, data.reply_type || 'fixed',
        data.reply_text, data.send_dm || false, data.dm_text, 
        data.is_active !== undefined ? data.is_active : true,
        data.button_text || null, data.button_url || null
    ];
    const res = await query(queryStr, params);
    return res.rows[0];
}

export async function updateCommentAutomation(id, data, userId) {
    const queryStr = `
        UPDATE comment_automations SET
            keyword = COALESCE($1, keyword),
            reply_type = COALESCE($2, reply_type),
            reply_text = COALESCE($3, reply_text),
            send_dm = COALESCE($4, send_dm),
            dm_text = COALESCE($5, dm_text),
            is_active = COALESCE($6, is_active),
            button_text = COALESCE($7, button_text),
            button_url = COALESCE($8, button_url),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $9 AND user_id = $10
        RETURNING *
    `;
    const params = [
        data.keyword, data.reply_type, data.reply_text, 
        data.send_dm, data.dm_text, data.is_active, 
        data.button_text, data.button_url,
        id, userId
    ];
    const res = await query(queryStr, params);
    return res.rows[0];
}

export async function deleteCommentAutomation(id, userId) {
    const queryStr = `DELETE FROM comment_automations WHERE id = $1 AND user_id = $2`;
    await query(queryStr, [id, userId]);
    return { success: true };
}

export async function findCommentAutomationByKeyword(accountId) {
    const queryStr = `
        SELECT * FROM comment_automations
        WHERE account_id = $1 AND is_active = TRUE
    `;
    const res = await query(queryStr, [accountId]);
    return res.rows;
}

export async function incrementCommentTrigger(id) {
    const queryStr = `UPDATE comment_automations SET trigger_count = trigger_count + 1 WHERE id = $1`;
    await query(queryStr, [id]);
}

// ============================================
// TELEGRAM GROUPS FUNCTIONS
// ============================================

export async function saveTelegramGroup(group, userId) {
    const queryStr = `
        INSERT INTO telegram_groups(group_id, group_name, enabled, user_id)
        VALUES($1, $2, $3, $4)
        ON CONFLICT (group_id) DO UPDATE SET
            group_name = EXCLUDED.group_name,
            enabled = EXCLUDED.enabled,
            user_id = EXCLUDED.user_id
    `;
    await query(queryStr, [group.groupId, group.groupName, group.enabled ? true : false, userId]);
}

export async function getTelegramGroups(userId) {
    const res = await query('SELECT * FROM telegram_groups WHERE user_id = $1', [userId]);
    return res.rows.map(g => ({
        id: g.group_id,
        name: g.group_name,
        enabled: !!g.enabled
    }));
}

// ============================================
// TELEGRAM ACCOUNTS FUNCTIONS
// ============================================

export async function saveTelegramAccount(accountData, userId) {
    console.log(`[DEBUG DB] Saving account for user ${userId}: @${accountData.username}`);
    const queryStr = `
        INSERT INTO telegram_accounts(name, username, token, user_id)
        VALUES($1, $2, $3, $4)
    `;
    return await query(queryStr, [accountData.name, accountData.username, accountData.token, userId]);
}

export async function getTelegramAccounts(userId) {
    const res = await query('SELECT id, name, username, token, added_at FROM telegram_accounts WHERE user_id = $1 ORDER BY added_at DESC', [userId]);
    return res.rows;
}

export async function removeTelegramAccount(id, userId) {
    return await query('DELETE FROM telegram_accounts WHERE id = $1 AND user_id = $2', [id, userId]);
}

// ============================================
// PRODUCT TRACKING FUNCTIONS
// ============================================

/**
 * Log a sent product
 */
export async function logSentProduct(productData, userId) {
    const queryStr = `
        INSERT INTO sent_products(product_id, product_name, price, commission, group_id, group_name, media_type, category, user_id)
        VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;

    console.log(`[DATABASE] Logging sent product: ID ${productData.productId} (${productData.productName}) for user ${userId} on ${productData.category}`);

    return await query(queryStr, [
        productData.productId,
        productData.productName,
        productData.price,
        productData.commission,
        productData.groupId,
        productData.groupName,
        productData.mediaType,
        productData.category || null,
        userId
    ]);
}

/**
 * Get products sent in the last N hours
 */
export async function getProductsSentInLastHours(hours = 24, userId) {
    const queryStr = `
        SELECT DISTINCT product_id
        FROM sent_products
        WHERE sent_at >= NOW() - ($1 || ' hours')::INTERVAL
        AND user_id = $2
    `;

    const res = await query(queryStr, [hours, userId]);
    return res.rows.map(row => row.product_id);
}

/**
 * Check if a product was sent today
 */
export async function wasProductSentToday(productId, userId) {
    const queryStr = `
        SELECT COUNT(*) as count
        FROM sent_products
        WHERE product_id = $1
        AND DATE(sent_at) = CURRENT_DATE
        AND user_id = $2
    `;

    const res = await query(queryStr, [productId, userId]);
    return parseInt(res.rows[0].count) > 0;
}

// ============================================
// ANALYTICS FUNCTIONS
// ============================================

/**
 * Log an analytics event
 */
export async function logEvent(eventType, data = {}, userId) {
    const queryStr = `
        INSERT INTO analytics_events(event_type, product_id, group_id, success, error_message, user_id)
        VALUES($1, $2, $3, $4, $5, $6)
    `;

    return await query(queryStr, [
        eventType,
        data.productId || null,
        data.groupId || null,
        data.success === undefined ? null : data.success,
        data.errorMessage || null,
        userId
    ]);
}

/**
 * Get dashboard statistics
 */
export async function getDashboardStats(days = 7, userId) {
    // Total sends in period
    const totalSends = (await query(`
        SELECT COUNT(*) as count
        FROM sent_products
        WHERE sent_at >= NOW() - ($1 || ' days')::INTERVAL
        AND user_id = $2
    `, [days, userId])).rows[0].count;

    // Total commission in period
    const totalCommission = (await query(`
        SELECT COALESCE(SUM(commission), 0) as total
        FROM sent_products
        WHERE sent_at >= NOW() - ($1 || ' days')::INTERVAL
        AND user_id = $2
    `, [days, userId])).rows[0].total;

    // Success rate
    const successRateRes = await query(`
        SELECT 
            COUNT(CASE WHEN success = TRUE THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) as rate
        FROM analytics_events
        WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL
        AND event_type = 'send'
        AND user_id = $2
    `, [days, userId]);
    const successRate = successRateRes.rows[0].rate;

    // Media type distribution
    const mediaTypes = (await query(`
        SELECT 
            media_type,
            COUNT(*) as count
        FROM sent_products
        WHERE sent_at >= NOW() - ($1 || ' days')::INTERVAL
        AND user_id = $2
        GROUP BY media_type
    `, [days, userId])).rows;

    return {
        totalSends: parseInt(totalSends),
        totalCommission: parseFloat(totalCommission),
        successRate: successRate ? parseFloat(successRate) : 100,
        mediaTypes: mediaTypes
    };
}

/**
 * Get sends over time (for chart)
 */
export async function getSendsOverTime(days = 7, userId) {
    const queryStr = `
        SELECT 
            DATE(sent_at) as date,
            COUNT(*) as count,
            COALESCE(SUM(commission), 0) as commission
        FROM sent_products
        WHERE sent_at >= NOW() - ($1 || ' days')::INTERVAL
        AND user_id = $2
        GROUP BY DATE(sent_at)
        ORDER BY DATE(sent_at)
    `;

    const res = await query(queryStr, [days, userId]);
    return res.rows;
}

/**
 * Get top products by send count
 */
export async function getTopProducts(limit = 10, days = 30, userId) {
    const queryStr = `
        SELECT 
            product_id,
            product_name,
            COUNT(*) as send_count,
            COALESCE(SUM(commission), 0) as total_commission,
            AVG(price) as avg_price
        FROM sent_products
        WHERE sent_at >= NOW() - ($1 || ' days')::INTERVAL
        AND user_id = $2
        GROUP BY product_id, product_name
        ORDER BY send_count DESC
        LIMIT $3
    `;

    const res = await query(queryStr, [days, userId, limit]);
    return res.rows;
}

/**
 * Get group performance statistics
 */
export async function getGroupPerformance(days = 30, userId) {
    const queryStr = `
        SELECT 
            group_id,
            group_name,
            COUNT(*) as total_sends,
            COALESCE(SUM(commission), 0) as total_commission
        FROM sent_products
        WHERE sent_at >= NOW() - ($1 || ' days')::INTERVAL
        AND user_id = $2
        GROUP BY group_id, group_name
        ORDER BY total_sends DESC
    `;

    const res = await query(queryStr, [days, userId]);
    return res.rows;
}

/**
 * Get analytics events (for logs page)
 */
export async function getEvents(limit = 100, userId) {
    const queryStr = `
        SELECT 
            id,
            event_type as "eventType",
            product_id as "productId",
            group_id as "groupId",
            success,
            error_message as "errorMessage",
            created_at as timestamp
        FROM analytics_events
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
    `;

    const res = await query(queryStr, [userId, limit]);
    return res.rows;
}

/**
 * Update daily stats (called at end of day or on demand)
 */
export async function updateDailyStats(date = null) {
    const targetDate = date || new Date().toISOString().split('T')[0];

    const stats = (await query(`
        SELECT 
            COUNT(*) as total_sent,
            COALESCE(SUM(commission), 0) as total_commission
        FROM sent_products
        WHERE DATE(sent_at) = $1
    `, [targetDate])).rows[0];

    const events = (await query(`
        SELECT 
            COUNT(CASE WHEN success = FALSE THEN 1 END) as total_failed
        FROM analytics_events
        WHERE DATE(created_at) = $1
        AND event_type = 'send'
    `, [targetDate])).rows[0];

    const queryStr = `
        INSERT INTO daily_stats(date, total_sent, total_failed, total_commission, updated_at)
        VALUES($1, $2, $3, $4, CURRENT_TIMESTAMP)
        ON CONFLICT (date) DO UPDATE SET
            total_sent = EXCLUDED.total_sent,
            total_failed = EXCLUDED.total_failed,
            total_commission = EXCLUDED.total_commission,
            updated_at = CURRENT_TIMESTAMP
    `;

    return await query(queryStr, [
        targetDate,
        stats.total_sent,
        events.total_failed,
        stats.total_commission
    ]);
}

// ============================================
// FACEBOOK PAGES FUNCTIONS
// ============================================

/**
 * Add or update a Facebook page
 */
export async function saveFacebookPage(pageData, userId) {
    const queryStr = `
        INSERT INTO facebook_pages(id, name, access_token, enabled, instagram_business_id, instagram_username, added_at, user_id)
        VALUES($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7)
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            access_token = EXCLUDED.access_token,
            enabled = EXCLUDED.enabled,
            instagram_business_id = EXCLUDED.instagram_business_id,
            instagram_username = EXCLUDED.instagram_username,
            user_id = EXCLUDED.user_id
    `;

    return await query(queryStr, [
        pageData.id,
        pageData.name,
        pageData.accessToken,
        pageData.enabled !== false,
        pageData.instagramBusinessId || null,
        pageData.instagramUsername || null,
        userId
    ]);
}


/**
 * Get all Facebook pages
 */
export async function getFacebookPages(userId) {
    const queryStr = `
        SELECT id, name, access_token as "accessToken", enabled, added_at as "addedAt"
        FROM facebook_pages
        WHERE user_id = $1
        ORDER BY added_at DESC
    `;

    const res = await query(queryStr, [userId]);
    return res.rows;
}

/**
 * Remove a Facebook page
 */
export async function removeFacebookPage(pageId, userId) {
    return await query('DELETE FROM facebook_pages WHERE id = $1 AND user_id = $2', [pageId, userId]);
}

/**
 * Get a single Facebook page by its page ID (used by story worker)
 */
export async function getFacebookPageById(pageId) {
    const res = await query('SELECT id, name, access_token FROM facebook_pages WHERE id = $1 LIMIT 1', [pageId]);
    return res.rows[0] || null;
}


/**
 * Toggle Facebook page enabled status
 */
export async function toggleFacebookPage(pageId, userId) {
    const queryStr = `
        UPDATE facebook_pages
        SET enabled = NOT enabled
        WHERE id = $1 AND user_id = $2
        RETURNING enabled
    `;

    const res = await query(queryStr, [pageId, userId]);

    if (res.rowCount > 0) {
        return { success: true, enabled: res.rows[0].enabled };
    }

    return { success: false };
}

// ============================================
// SCHEDULES FUNCTIONS
// ============================================

/**
 * Save a schedule
 */
export async function saveSchedule(platform, config, userId) {
    const queryStr = `
        INSERT INTO schedules(platform, config, active, user_id)
        VALUES($1, $2, $3, $4)
        RETURNING id
    `;

    const res = await query(queryStr, [
        platform,
        JSON.stringify(config),
        config.schedule?.enabled !== false,
        userId
    ]);

    return { id: res.rows[0].id, success: true };
}

/**
 * Get all schedules with next execution time
 */
export async function getSchedules(userId) {
    const queryStr = `
        SELECT s.id, s.platform, s.config, s.active, s.created_at as "createdAt",
        (SELECT MIN(planned_time) 
         FROM automation_execution_queue 
         WHERE schedule_id = s.id 
         AND status = 'pending' 
         AND planned_time >= NOW() - INTERVAL '10 minutes') as "nextExecution",
        (SELECT COUNT(*) 
         FROM automation_execution_queue 
         WHERE schedule_id = s.id 
         AND status = 'completed') as "totalSent",
        (SELECT MAX(planned_time) 
         FROM automation_execution_queue 
         WHERE schedule_id = s.id 
         AND status = 'completed') as "lastExecution"
        FROM schedules s
        WHERE s.user_id = $1
        ORDER BY s.created_at DESC
    `;

    const res = await query(queryStr, [userId]);
    return res.rows.map(row => ({
        ...row,
        config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
        totalSent: parseInt(row.totalSent || 0),
        lastExecution: row.lastExecution
    }));
}

/**
 * Get active schedules
 */
export async function getActiveSchedules() {
    const queryStr = `
        SELECT id, platform, config, active, created_at as "createdAt", user_id as "userId"
        FROM schedules
        WHERE active = TRUE
    `;

    const res = await query(queryStr);
    return res.rows.map(row => ({
        ...row,
        config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config
    }));
}

/**
 * Get a single schedule
 */
export async function getSchedule(id, userId) {
    const res = await query('SELECT * FROM schedules WHERE id = $1 AND user_id = $2', [id, userId]);
    if (res.rows[0]) {
        res.rows[0].config = typeof res.rows[0].config === 'string' ? JSON.parse(res.rows[0].config) : res.rows[0].config;
    }
    return res.rows[0];
}

/**
 * Delete a schedule
 */
export async function deleteSchedule(id, userId) {
    try {
        await query('DELETE FROM automation_execution_queue WHERE schedule_id = $1', [id]);
        const res = await query('DELETE FROM schedules WHERE id = $1 AND user_id = $2', [id, userId]);
        return { success: res.rowCount > 0 };
    } catch (error) {
        console.error('[DATABASE] Error deleting schedule:', error);
        throw error;
    }
}

/**
 * Toggle a schedule's active status
 */
export async function toggleSchedule(id, active, userId) {
    return await query('UPDATE schedules SET active = $1 WHERE id = $2 AND user_id = $3', [active, id, userId]);
}

export async function updateInstagramVideoMediaUrl(id, mediaUrl, telegramMessageId = null) {
    await query('UPDATE instagram_queue SET media_url = $1, telegram_message_id = $2 WHERE id = $3', [mediaUrl, telegramMessageId, id]);
    return { success: true };
}

// --- INSTAGRAM QUEUE FUNCTIONS ---

/**
 * Add video to Instagram queue
 */
export async function addToInstagramQueue(videoPath, caption, scheduledTime = null, title = null, userId, aspectRatio = '9:16') {
    // Derive title from filename if not provided
    const derivedTitle = title || path.basename(videoPath);

    const queryStr = `
        INSERT INTO instagram_queue(video_path, caption, scheduled_time, title, user_id, aspect_ratio)
        VALUES($1, $2, $3, $4, $5, $6)
        RETURNING id
    `;
    const res = await query(queryStr, [videoPath, caption, scheduledTime, derivedTitle, userId, aspectRatio]);
    return { success: true, id: res.rows[0].id };
}

/**
 * Get all videos in queue
 */
export async function getInstagramQueue(status = null, userId) {
    let queryStr = 'SELECT * FROM instagram_queue WHERE user_id = $1';
    const params = [userId];

    if (status) {
        queryStr += ' AND status = $2';
        params.push(status);
    }
    queryStr += ' ORDER BY created_at ASC';

    const res = await query(queryStr, params);
    return res.rows;
}

/**
 * Get pending videos for posting
 */
export async function getPendingInstagramVideos() {
    const queryStr = `
        SELECT * FROM instagram_queue 
        WHERE status = 'pending'
        AND (scheduled_time IS NULL OR scheduled_time <= NOW())
        ORDER BY created_at ASC
    `;
    const res = await query(queryStr);
    return res.rows;
}

/**
 * Update video details (caption and/or title)
 */
export async function updateInstagramVideo(id, updates, userId) {
    const fields = [];
    const values = [];
    let i = 1;

    if (updates.caption !== undefined) {
        fields.push(`caption = $${i++}`);
        values.push(updates.caption);
    }
    if (updates.title !== undefined) {
        fields.push(`title = $${i++}`);
        values.push(updates.title);
    }
    if (updates.aspectRatio !== undefined) {
        fields.push(`aspect_ratio = $${i++}`);
        values.push(updates.aspectRatio);
    }
    if (updates.shareToFeed !== undefined) {
        fields.push(`share_to_feed = $${i++}`);
        values.push(updates.shareToFeed);
    }
    if (updates.allowComments !== undefined) {
        fields.push(`allow_comments = $${i++}`);
        values.push(updates.allowComments);
    }
    if (updates.allowEmbedding !== undefined) {
        fields.push(`allow_embedding = $${i++}`);
        values.push(updates.allowEmbedding);
    }
    if (updates.playlistId !== undefined) {
        fields.push(`playlist_id = $${i++}`);
        values.push(updates.playlistId);
    }
    if (updates.thumbnailUrl !== undefined) {
        fields.push(`thumbnail_url = $${i++}`);
        values.push(updates.thumbnailUrl);
    }
    if (updates.thumbOffset !== undefined) {
        fields.push(`thumb_offset = $${i++}`);
        values.push(updates.thumbOffset);
    }

    if (fields.length === 0) return;

    values.push(id);
    values.push(userId);
    
    const queryStr = `
        UPDATE instagram_queue 
        SET ${fields.join(', ')} 
        WHERE id = $${i++} AND user_id = $${i++}
    `;

    return await query(queryStr, values);
}

/**
 * Update video caption (Legacy wrapper)
 */
export async function updateInstagramCaption(id, caption, userId) {
    return await updateInstagramVideo(id, { caption }, userId);
}

/**
 * Mark video as posted
 */
export async function markInstagramVideoPosted(id) {
    const queryStr = `
        UPDATE instagram_queue 
        SET status = 'posted', posted_at = NOW()
        WHERE id = $1
    `;
    await query(queryStr, [id]);
    return { success: true };
}

/**
 * Mark video as failed
 */
export async function markInstagramVideoFailed(id, error) {
    const queryStr = `
        UPDATE instagram_queue 
        SET status = 'failed', error = $1
        WHERE id = $2
    `;
    await query(queryStr, [error, id]);
    return { success: true };
}

/**
 * Delete video from queue
 */
export async function deleteFromInstagramQueue(id, userId) {
    await query('DELETE FROM instagram_queue WHERE id = $1 AND user_id = $2', [id, userId]);
    return { success: true };
}

// --- FACEBOOK REELS QUEUE FUNCTIONS ---

/**
 * Add video to Facebook Reels queue
 */
export async function addToFacebookQueue(videoPath, caption, scheduledTime = null, title = null, userId, aspectRatio = '9:16') {
    const derivedTitle = title || path.basename(videoPath);
    const queryStr = `
        INSERT INTO facebook_reels_queue(video_path, caption, scheduled_time, title, user_id, aspect_ratio)
        VALUES($1, $2, $3, $4, $5, $6)
        RETURNING id
    `;
    const res = await query(queryStr, [videoPath, caption, scheduledTime, derivedTitle, userId, aspectRatio]);
    return { success: true, id: res.rows[0].id };
}

/**
 * Get all videos in Facebook Reels queue
 */
export async function getFacebookQueue(status = null, userId) {
    let queryStr = 'SELECT * FROM facebook_reels_queue WHERE user_id = $1';
    const params = [userId];
    if (status) {
        queryStr += ' AND status = $2';
        params.push(status);
    }
    queryStr += ' ORDER BY created_at ASC';
    const res = await query(queryStr, params);
    return res.rows;
}

/**
 * Get pending videos for Facebook Reels posting
 */
export async function getPendingFacebookVideos() {
    const queryStr = `
        SELECT * FROM facebook_reels_queue 
        WHERE status = 'pending'
        AND (scheduled_time IS NULL OR scheduled_time <= NOW())
        ORDER BY created_at ASC
    `;
    const res = await query(queryStr);
    return res.rows;
}

/**
 * Update Facebook Reel details
 */
export async function updateFacebookVideo(id, updates, userId) {
    const fields = [];
    const values = [];
    let i = 1;

    if (updates.caption !== undefined) { fields.push(`caption = $${i++}`); values.push(updates.caption); }
    if (updates.title !== undefined) { fields.push(`title = $${i++}`); values.push(updates.title); }
    if (updates.aspectRatio !== undefined) { fields.push(`aspect_ratio = $${i++}`); values.push(updates.aspectRatio); }
    if (updates.shareToFeed !== undefined) { fields.push(`share_to_feed = $${i++}`); values.push(updates.shareToFeed); }
    if (updates.allowComments !== undefined) { fields.push(`allow_comments = $${i++}`); values.push(updates.allowComments); }
    if (updates.allowEmbedding !== undefined) { fields.push(`allow_embedding = $${i++}`); values.push(updates.allowEmbedding); }
    if (updates.playlistId !== undefined) { fields.push(`playlist_id = $${i++}`); values.push(updates.playlistId); }
    if (updates.thumbnailUrl !== undefined) { fields.push(`thumbnail_url = $${i++}`); values.push(updates.thumbnailUrl); }
    if (updates.thumbOffset !== undefined) { fields.push(`thumb_offset = $${i++}`); values.push(updates.thumbOffset); }

    if (fields.length === 0) return;
    values.push(id);
    values.push(userId);
    
    const queryStr = `
        UPDATE facebook_reels_queue 
        SET ${fields.join(', ')} 
        WHERE id = $${i++} AND user_id = $${i++}
    `;
    return await query(queryStr, values);
}

/**
 * Mark Facebook Reel as posted
 */
export async function markFacebookVideoPosted(id) {
    const queryStr = `UPDATE facebook_reels_queue SET status = 'posted', posted_at = NOW() WHERE id = $1`;
    await query(queryStr, [id]);
    return { success: true };
}

/**
 * Mark Facebook Reel as failed
 */
export async function markFacebookVideoFailed(id, error) {
    const queryStr = `UPDATE facebook_reels_queue SET status = 'failed', error = $1 WHERE id = $2`;
    await query(queryStr, [error, id]);
    return { success: true };
}

/**
 * Delete Facebook Reel from queue
 */
export async function deleteFromFacebookQueue(id, userId) {
    await query('DELETE FROM facebook_reels_queue WHERE id = $1 AND user_id = $2', [id, userId]);
    return { success: true };
}

/**
 * Update Facebook Reels scheduled time
 */
export async function updateFacebookScheduledTime(id, scheduledTime) {
    const queryStr = `
        UPDATE facebook_reels_queue 
        SET scheduled_time = $1, status = 'pending'
        WHERE id = $2
    `;
    await query(queryStr, [scheduledTime, id]);
    return { success: true };
}

// ============================================
// STORY QUEUE FUNCTIONS
// ============================================

/**
 * Add a single story to the queue
 */
export async function addToStoryQueue(platform, accountId, mediaUrl, mediaType, caption, scheduledTime, userId) {
    const queryStr = `
        INSERT INTO story_queue (platform, account_id, media_url, media_type, caption, scheduled_time, user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
    `;
    const res = await query(queryStr, [platform, accountId, mediaUrl, mediaType || 'image', caption || null, scheduledTime || null, userId]);
    return { success: true, id: res.rows[0].id };
}

/**
 * Get all stories in queue for user
 */
export async function getStoryQueue(userId, platform = null, status = null) {
    let queryStr = 'SELECT * FROM story_queue WHERE user_id = $1';
    const params = [userId];
    if (platform) { queryStr += ` AND platform = $${params.length + 1}`; params.push(platform); }
    if (status) { queryStr += ` AND status = $${params.length + 1}`; params.push(status); }
    queryStr += ' ORDER BY scheduled_time ASC NULLS LAST, created_at ASC';
    const res = await query(queryStr, params);
    return res.rows;
}

/**
 * Get pending stories that are due to be posted
 */
export async function getDueStories() {
    const queryStr = `
        SELECT sq.*, u.id as user_id
        FROM story_queue sq
        JOIN users u ON sq.user_id = u.id
        WHERE sq.status = 'pending'
        AND (sq.scheduled_time IS NULL OR sq.scheduled_time <= NOW())
        ORDER BY sq.scheduled_time ASC NULLS FIRST
    `;
    const res = await query(queryStr);
    return res.rows;
}

/**
 * Mark story as posted
 */
export async function markStoryPosted(id) {
    await query(`UPDATE story_queue SET status = 'posted', posted_at = NOW() WHERE id = $1`, [id]);
    return { success: true };
}

/**
 * Mark story as failed
 */
export async function markStoryFailed(id, error) {
    await query(`UPDATE story_queue SET status = 'failed', error = $1 WHERE id = $2`, [error, id]);
    return { success: true };
}

/**
 * Delete a story from the queue
 */
export async function deleteFromStoryQueue(id, userId) {
    await query('DELETE FROM story_queue WHERE id = $1 AND user_id = $2', [id, userId]);
    return { success: true };
}

/**
 * Update scheduled_time for a story
 */
export async function updateStoryScheduledTime(id, scheduledTime, userId) {
    await query('UPDATE story_queue SET scheduled_time = $1 WHERE id = $2 AND user_id = $3', [scheduledTime, id, userId]);
    return { success: true };
}

// ============================================
// TWITTER CONFIG FUNCTIONS
// ============================================

/**
 * Save Twitter Account (Add or Update)
 */
export async function saveTwitterAccount(account, userId) {
    let existing = null;

    // If ID is provided, check by ID first
    if (account.id) {
        const res = await query('SELECT id FROM twitter_accounts WHERE id = $1 AND user_id = $2', [account.id, userId]);
        existing = res.rows[0];
    }

    // If not found by ID, check by username
    if (!existing) {
        const res = await query('SELECT id FROM twitter_accounts WHERE username = $1 AND user_id = $2', [account.username, userId]);
        existing = res.rows[0];
    }

    if (existing) {
        // Update existing
        const queryStr = `
            UPDATE twitter_accounts 
            SET api_key = $1, api_secret = $2, access_token = $3, access_token_secret = $4, username = $5, profile_image_url = $6, updated_at = CURRENT_TIMESTAMP
            WHERE id = $7 AND user_id = $8
        `;
        return await query(queryStr, [
            account.apiKey,
            account.apiSecret,
            account.accessToken,
            account.accessTokenSecret,
            account.username,
            account.profileImage || null,
            existing.id,
            userId
        ]);
    } else {
        // Insert new
        const queryStr = `
            INSERT INTO twitter_accounts(api_key, api_secret, access_token, access_token_secret, username, profile_image_url, user_id)
            VALUES($1, $2, $3, $4, $5, $6, $7)
        `;
        return await query(queryStr, [
            account.apiKey,
            account.apiSecret,
            account.accessToken,
            account.accessTokenSecret,
            account.username,
            account.profileImage || null,
            userId
        ]);
    }
}

/**
 * Get all Twitter accounts
 */
export async function getTwitterAccounts(userId = null) {
    let res;
    if (userId) {
        res = await query('SELECT * FROM twitter_accounts WHERE user_id = $1 ORDER BY added_at DESC', [userId]);
    } else {
        res = await query('SELECT * FROM twitter_accounts ORDER BY added_at DESC');
    }

    return res.rows.map(account => ({
        id: account.id,
        apiKey: account.api_key,
        apiSecret: account.api_secret,
        accessToken: account.access_token,
        accessTokenSecret: account.access_token_secret,
        username: account.username,
        profileImage: account.profile_image_url,
        addedAt: account.added_at,
        userId: account.user_id
    }));
}

/**
 * Delete Twitter account
 */
export async function deleteTwitterAccount(id, userId) {
    return await query('DELETE FROM twitter_accounts WHERE id = $1 AND user_id = $2', [id, userId]);
}

/**
 * Get Twitter daily usage count
 */
export async function getTwitterDailyCount() {
    const res = await query(`
        SELECT COUNT(*) as count
        FROM analytics_events
        WHERE event_type = 'twitter_send'
        AND success = TRUE
        AND DATE(created_at) = CURRENT_DATE
    `);
    return parseInt(res.rows[0].count);
}

/**
 * Update Instagram video scheduled time
 */
export async function updateInstagramScheduledTime(id, scheduledTime) {
    const queryStr = `
        UPDATE instagram_queue 
        SET scheduled_time = $1, status = 'pending'
        WHERE id = $2
    `;
    await query(queryStr, [scheduledTime, id]);
    return { success: true };
}

// ============================================
// SYSTEM CONFIG FUNCTIONS
// ============================================

/**
 * Save system config
 */
export async function saveSystemConfig(key, value) {
    const queryStr = `
        INSERT INTO system_config(key, value, updated_at)
        VALUES($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE SET
            value = EXCLUDED.value,
            updated_at = CURRENT_TIMESTAMP
    `;
    await query(queryStr, [key, value]);
    return { success: true };
}

/**
 * Save multiple system configs at once
 */
export async function saveSystemConfigBulk(configs) {
    for (const [key, value] of Object.entries(configs)) {
        await saveSystemConfig(key, value);
    }
    return { success: true };
}

/**
 * Get system config
 */
export async function getSystemConfig(key) {
    const res = await query('SELECT value FROM system_config WHERE key = $1', [key]);
    return res.rows[0] ? res.rows[0].value : null;
}

/**
 * Get all system settings
 */
export async function getSystemSettings() {
    const res = await query('SELECT key, value FROM system_config');
    const settings = {};
    res.rows.forEach(row => {
        settings[row.key] = row.value;
    });
    return settings;
}

/**
 * Update a system setting
 */
export async function updateSystemSetting(key, value) {
    return await saveSystemConfig(key, value);
}

// ============================================
// INSTAGRAM ACCOUNT FUNCTIONS
// ============================================

export async function addInstagramAccount(name, accessToken, accountId, username = '', profilePic = '', userId, expiresAt = null, tokenType = 'short_lived') {
    const queryStr = `
        INSERT INTO instagram_accounts(name, access_token, account_id, username, profile_picture_url, user_id, expires_at, token_type, added_at)
        VALUES($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
        ON CONFLICT (account_id) DO UPDATE SET
            name = EXCLUDED.name,
            access_token = EXCLUDED.access_token,
            username = EXCLUDED.username,
            profile_picture_url = EXCLUDED.profile_picture_url,
            user_id = EXCLUDED.user_id,
            expires_at = EXCLUDED.expires_at,
            token_type = EXCLUDED.token_type
        RETURNING id
    `;
    const res = await query(queryStr, [name, accessToken, accountId, username, profilePic, userId, expiresAt, tokenType]);
    return { success: true, id: res.rows[0].id };
}

export async function getLogs(userId) {
    const res = await query('SELECT * FROM analytics_events WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 500', [userId]);
    return res.rows;
}

export async function clearLogs(userId) {
    return await query('DELETE FROM analytics_events WHERE user_id = $1', [userId]);
}

export async function getInstagramAccounts(userId) {
    const res = await query('SELECT * FROM instagram_accounts WHERE user_id = $1 ORDER BY added_at DESC', [userId]);
    return res.rows;
}

export async function getInstagramAccountById(id, userId) {
    const res = await query('SELECT * FROM instagram_accounts WHERE id = $1 AND user_id = $2', [id, userId]);
    return res.rows[0];
}

export async function removeInstagramAccount(id, userId) {
    await query('DELETE FROM instagram_accounts WHERE id = $1 AND user_id = $2', [id, userId]);
    return { success: true };
}

export async function updateFacebookPageStatus(id, userId, status, lastError = null) {
    const queryStr = `
        UPDATE facebook_pages 
        SET status = $1, last_error = $2
        WHERE id = $3 AND user_id = $4
    `;
    return await query(queryStr, [status, lastError, id, userId]);
}

export async function updateInstagramAccountStatus(accountId, userId, status, lastError = null) {
    const queryStr = `
        UPDATE instagram_accounts 
        SET status = $1, last_error = $2
        WHERE account_id = $3 AND user_id = $4
    `;
    return await query(queryStr, [status, lastError, accountId, userId]);
}

// ==================== WhatsApp Accounts Functions ====================

export async function addWhatsAppAccount(userId, name) {
    const queryStr = `
        INSERT INTO whatsapp_accounts (user_id, name) 
        VALUES ($1, $2)
        RETURNING id
    `;
    const res = await query(queryStr, [userId, name]);
    return { success: true, id: res.rows[0].id };
}

export async function getWhatsAppAccounts(userId) {
    const queryStr = `
        SELECT id, name, phone, status, session_id as "sessionId", created_at as "createdAt"
        FROM whatsapp_accounts
        WHERE user_id = $1
        ORDER BY created_at DESC
    `;
    const res = await query(queryStr, [userId]);
    return res.rows;
}

export async function removeWhatsAppAccount(id, userId) {
    return await query('DELETE FROM whatsapp_accounts WHERE id = $1 AND user_id = $2', [id, userId]);
}

export async function updateWhatsAppAccountStatus(id, userId, status, phone = null) {
    const queryStr = `
        UPDATE whatsapp_accounts 
        SET status = $1, phone = COALESCE($2, phone)
        WHERE id = $3 AND user_id = $4
    `;
    return await query(queryStr, [status, phone, id, userId]);
}

// ==================== WhatsApp Groups Functions ====================

export async function getWhatsAppGroups(userId, accountId = null) {
    let queryStr = `
        SELECT group_id as "groupId", group_name as "groupName", enabled, added_at as "addedAt", account_id as "accountId" 
        FROM whatsapp_groups 
        WHERE user_id = $1
    `;
    const params = [userId];

    if (accountId) {
        queryStr += ` AND account_id = $2`;
        params.push(accountId);
    }

    queryStr += ` ORDER BY added_at DESC`;
    const res = await query(queryStr, params);
    return res.rows.map(row => ({ ...row, enabled: !!row.enabled }));
}

export async function addWhatsAppGroup(groupId, groupName, userId, accountId) {
    const queryStr = `
        INSERT INTO whatsapp_groups (group_id, group_name, user_id, account_id) 
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (group_id, user_id, account_id) DO UPDATE SET 
            group_name = EXCLUDED.group_name
    `;
    return await query(queryStr, [groupId, groupName, userId, accountId]);
}

export async function removeWhatsAppGroup(groupId, userId, accountId) {
    return await query('DELETE FROM whatsapp_groups WHERE group_id = $1 AND user_id = $2 AND account_id = $3', [groupId, userId, accountId]);
}

export async function toggleWhatsAppGroup(groupId, userId, accountId) {
    const queryStr = `
        UPDATE whatsapp_groups 
        SET enabled = NOT enabled 
        WHERE group_id = $1 AND user_id = $2 AND account_id = $3
    `;
    return await query(queryStr, [groupId, userId, accountId]);
}

// ==================== Pinterest Boards Functions ====================

export async function getPinterestBoards(userId) {
    const queryStr = `
        SELECT board_id as "boardId", board_name as "boardName", enabled, added_at as "addedAt" 
        FROM pinterest_boards 
        WHERE user_id = $1 
        ORDER BY added_at DESC
    `;
    const res = await query(queryStr, [userId]);
    return res.rows.map(row => ({ ...row, enabled: !!row.enabled }));
}

export async function addPinterestBoard(boardId, boardName, userId) {
    const queryStr = `
        INSERT INTO pinterest_boards (board_id, board_name, user_id) 
        VALUES ($1, $2, $3)
        ON CONFLICT (board_id, user_id) DO UPDATE SET 
            board_name = EXCLUDED.board_name
    `;
    return await query(queryStr, [boardId, boardName, userId]);
}

export async function removePinterestBoard(boardId, userId) {
    return await query('DELETE FROM pinterest_boards WHERE board_id = $1 AND user_id = $2', [boardId, userId]);
}

export async function togglePinterestBoard(boardId, userId) {
    const queryStr = `
        UPDATE pinterest_boards 
        SET enabled = NOT enabled 
        WHERE board_id = $1 AND user_id = $2
    `;
    return await query(queryStr, [boardId, userId]);
}

// Note: Pinterest migration logic removed as it was SQLite specific.
// Table creation is now handled in initializeDatabase().

// ==================== Pinterest Accounts Functions ====================

export async function addPinterestAccount(username, accessToken, userId) {
    const queryStr = `
        INSERT INTO pinterest_accounts (username, access_token, user_id) 
        VALUES ($1, $2, $3)
        RETURNING id
    `;
    const res = await query(queryStr, [username, accessToken, userId]);
    return { success: true, id: res.rows[0].id };
}

export async function getPinterestAccounts(userId) {
    const queryStr = `
        SELECT id, username, access_token as "accessToken", enabled, added_at as "addedAt" 
        FROM pinterest_accounts 
        WHERE user_id = $1 
        ORDER BY added_at DESC
    `;
    const res = await query(queryStr, [userId]);
    return res.rows.map(row => ({ ...row, enabled: !!row.enabled, id: row.id.toString() }));
}

export async function removePinterestAccount(id, userId) {
    return await query('DELETE FROM pinterest_accounts WHERE id = $1 AND user_id = $2', [id, userId]);
}

export async function togglePinterestAccount(id, userId) {
    return await query('UPDATE pinterest_accounts SET enabled = NOT enabled WHERE id = $1 AND user_id = $2', [id, userId]);
}

export async function getPinterestAccountById(id, userId) {
    const res = await query('SELECT * FROM pinterest_accounts WHERE id = $1 AND user_id = $2', [id, userId]);
    return res.rows[0];
}

// ==================== User Config Functions ====================

export async function getUserConfig(userId, key) {
    const res = await query('SELECT value FROM user_config WHERE user_id = $1 AND key = $2', [userId, key]);
    return res.rows[0] ? res.rows[0].value : null;
}

export async function setUserConfig(userId, key, value) {
    const queryStr = `
        INSERT INTO user_config (user_id, key, value, updated_at) 
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP) 
        ON CONFLICT(user_id, key) DO UPDATE SET 
            value = EXCLUDED.value, 
            updated_at = CURRENT_TIMESTAMP
    `;
    return await query(queryStr, [userId, key, value]);
}

export async function getAllUserConfig(userId) {
    const res = await query('SELECT key, value FROM user_config WHERE user_id = $1', [userId]);
    const config = {};
    res.rows.forEach(row => {
        config[row.key] = row.value;
    });
    return config;
}

export async function deleteUserConfig(userId, key) {
    return await query('DELETE FROM user_config WHERE user_id = $1 AND key = $2', [userId, key]);
}

// ============================================
// AUTH FUNCTIONS (Centralized)
// ============================================

export async function getUserByEmail(email) {
    const res = await query('SELECT * FROM users WHERE email = $1', [email]);
    return res.rows[0];
}

export async function createUser(email, hashedPassword, name) {
    const queryStr = `
        INSERT INTO users (email, password, name) 
        VALUES ($1, $2, $3)
        RETURNING id
    `;
    const res = await query(queryStr, [email, hashedPassword, name]);
    return res.rows[0];
}

export async function getAllUsers() {
    const res = await query('SELECT id, email, name, role, created_at as "createdAt" FROM users ORDER BY created_at DESC');
    return res.rows;
}

export async function deleteUser(id) {
    return await query('DELETE FROM users WHERE id = $1', [id]);
}

export async function updateUserRole(id, role) {
    return await query('UPDATE users SET role = $1 WHERE id = $2', [role, id]);
}

// Automatically initialize the database on startup
// initializeDatabase(); // Removed auto-call to avoid race conditions

// ============================================
// AI AGENTS FUNCTIONS
// ============================================

export async function getAiAgents(userId) {
    const result = await query('SELECT * FROM ai_agents WHERE user_id = $1', [userId]);
    return result.rows;
}

export async function getAiAgent(accountId, platform) {
    const result = await query('SELECT * FROM ai_agents WHERE account_id = $1 AND platform = $2 LIMIT 1', [accountId, platform]);
    return result.rows[0] || null;
}

export async function saveAiAgent(agentData, userId) {
    const { account_id, platform, prompt, is_active, model, activation_keyword } = agentData;
    const existing = await getAiAgent(account_id, platform);

    if (existing) {
        const result = await query(
            'UPDATE ai_agents SET prompt = $1, is_active = $2, model = $3, activation_keyword = $4, updated_at = CURRENT_TIMESTAMP WHERE account_id = $5 AND platform = $6 AND user_id = $7 RETURNING *',
            [prompt, is_active, model || 'gemini-1.5-flash', activation_keyword || '', account_id, platform, userId]
        );
        return result.rows[0];
    } else {
        const result = await query(
            'INSERT INTO ai_agents (account_id, platform, prompt, is_active, model, activation_keyword, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [account_id, platform, prompt, is_active, model || 'gemini-1.5-flash', activation_keyword || '', userId]
        );
        return result.rows[0];
    }
}

export async function setHandoffActive(accountId, platform, isActive) {
    const result = await query(
        'UPDATE ai_agents SET handoff_active = $1 WHERE account_id = $2 AND platform = $3 RETURNING *',
        [isActive, accountId, platform]
    );
    return result.rows[0];
}

// ============================================
// ADMIN & SYSTEM FUNCTIONS
// ============================================

export async function getAdminSystemStats() {
    try {
        const usersCount = await query('SELECT COUNT(*) FROM users WHERE deleted_at IS NULL');
        const activeUsers = await query('SELECT COUNT(DISTINCT user_id) FROM audit_logs WHERE created_at > NOW() - INTERVAL \'24 hours\'');
        const totalPaid = await query('SELECT SUM(total_paid) FROM users');
        const totalPosts = await query('SELECT COUNT(*) FROM instagram_queue WHERE status = \'posted\'');

        return {
            totalUsers: parseInt(usersCount.rows[0].count),
            activeUsers: parseInt(activeUsers.rows[0].count),
            totalRevenue: parseFloat(totalPaid.rows[0].sum || 0),
            totalPosts: parseInt(totalPosts.rows[0].count)
        };
    } catch (error) {
        console.error('[DATABASE] Error getting admin system stats:', error);
        throw error;
    }
}

export async function getPostgresDatabaseSize() {
    try {
        const result = await query('SELECT pg_size_pretty(pg_database_size(current_database()))');
        return result.rows[0].pg_size_pretty;
    } catch (error) {
        console.error('[DATABASE] Error getting database size:', error);
        return 'N/A';
    }
}

export async function updateUserSubscription(id, plan, status, endDate) {
    try {
        const queryText = `
            UPDATE users 
            SET subscription_plan = $1, subscription_status = $2, subscription_end = $3, updated_at = CURRENT_TIMESTAMP 
            WHERE id = $4 
            RETURNING *
        `;
        const res = await query(queryText, [plan, status, endDate, id]);
        return res.rows[0];
    } catch (error) {
        console.error('[DATABASE] Error updating user subscription:', error);
        throw error;
    }
}

export async function addPayment(userId, amount, method, status = 'completed') {
    try {
        // Record payment in maybe a new payments table, or just update user total_paid
        const res = await query('UPDATE users SET total_paid = total_paid + $1 WHERE id = $2 RETURNING *', [amount, userId]);
        
        // Log the action
        await query('INSERT INTO audit_logs (user_id, action, details) VALUES ($1, $2, $3)', [
            userId, 
            'payment_received', 
            JSON.stringify({ amount, method, status })
        ]);
        
        return res.rows[0];
    } catch (error) {
        console.error('[DATABASE] Error adding payment:', error);
        throw error;
    }
}

export async function getSubscriptionStats() {
    try {
        const byPlan = await query(`
            SELECT subscription_plan, COUNT(*) as count, SUM(total_paid) as revenue 
            FROM users 
            WHERE deleted_at IS NULL 
            GROUP BY subscription_plan
        `);
        
        const total = await query('SELECT COUNT(*) as count, SUM(total_paid) as revenue FROM users WHERE deleted_at IS NULL');
        
        return {
            byPlan: byPlan.rows.map(r => ({
                subscription_plan: r.subscription_plan,
                count: parseInt(r.count),
                revenue: parseFloat(r.revenue || 0)
            })),
            total: {
                count: parseInt(total.rows[0].count),
                revenue: parseFloat(total.rows[0].revenue || 0)
            }
        };
    } catch (error) {
        console.error('[DATABASE] Error getting subscription stats:', error);
        throw error;
    }
}

export async function getDatabaseTableStats() {
    try {
        const tables = [
            'users', 'sent_products', 'analytics_events', 'daily_stats', 
            'facebook_pages', 'schedules', 'telegram_groups', 'telegram_accounts', 
             'audit_logs', 'system_config', 'user_config', 'whatsapp_accounts',
            'instagram_queue', 'facebook_reels_queue', 'ai_agents', 'comment_automations'
         ];
        
        const stats = [];
        for (const table of tables) {
            try {
                const res = await query(`SELECT COUNT(*) FROM ${table}`);
                stats.push({
                    table,
                    count: parseInt(res.rows[0].count)
                });
            } catch (err) {
                // Table might not exist yet
                console.warn(`[DATABASE] Table ${table} not found or error:`, err.message);
            }
        }
        return stats;
    } catch (error) {
        console.error('[DATABASE] Error getting table stats:', error);
        throw error;
    }
}

// ============================================
// SCHEDULES & AUTOMATION FUNCTIONS
// ============================================


// ============================================
export default {
    query,
    initializeDatabase,
    saveTelegramGroup,
    getTelegramGroups,
    saveTelegramAccount,
    getTelegramAccounts,
    removeTelegramAccount,
    logSentProduct,
    getProductsSentInLastHours,
    wasProductSentToday,
    logEvent,
    getDashboardStats,
    getSendsOverTime,
    getTopProducts,
    getGroupPerformance,
    getEvents,
    updateDailyStats,
    saveFacebookPage,
    getFacebookPages,
    removeFacebookPage,
    toggleFacebookPage,
    saveSchedule,
    getSchedules,
    getActiveSchedules,
    addToInstagramQueue,
    getInstagramQueue,
    getPendingInstagramVideos,
    updateInstagramVideo,
    updateInstagramCaption,
    markInstagramVideoPosted,
    markInstagramVideoFailed,
    deleteFromInstagramQueue,
    saveTwitterAccount,
    getTwitterAccounts,
    deleteTwitterAccount,
    getTwitterDailyCount,
    updateInstagramScheduledTime,
    saveSystemConfig,
    getSystemConfig,
    getSystemSettings,
    updateSystemSetting,
    addInstagramAccount,
    getInstagramAccounts,
    getInstagramAccountById,
    removeInstagramAccount,
    getWhatsAppGroups,
    addWhatsAppGroup,
    removeWhatsAppGroup,
    toggleWhatsAppGroup,
    addWhatsAppAccount,
    getWhatsAppAccounts,
    removeWhatsAppAccount,
    updateWhatsAppAccountStatus,
    getPinterestBoards,
    addPinterestBoard,
    removePinterestBoard,
    togglePinterestBoard,
    addPinterestAccount,
    getPinterestAccounts,
    removePinterestAccount,
    togglePinterestAccount,
    getPinterestAccountById,
    getUserConfig,
    setUserConfig,
    getAllUserConfig,
    deleteUserConfig,
    getUserByEmail,
    createUser,
    getAllUsers,
    deleteUser,
    updateUserRole,
    getAiAgents,
    getAiAgent,
    saveAiAgent,
    setHandoffActive,
    getAdminSystemStats,
    getPostgresDatabaseSize,
    updateUserSubscription,
    addPayment,
    getSubscriptionStats,
    getDatabaseTableStats,
    addToAutomationQueue,
    clearAutomationQueue,
    getPendingAutomationTasks,
    markAutomationTaskComplete,
    getPlannedTasks,
    addShopeeBioLink,
    getShopeeBioLinks,
    deleteShopeeBioLink,
    incrementShopeeBioClick
};

// ============================================
// SHOPEE BIO LINKS (VITRINE) FUNCTIONS
// ============================================

export async function addShopeeBioLink(data, userId) {
    const check = await query(`SELECT id FROM shopee_bio_links WHERE user_id = $1 AND product_id = $2`, [userId, data.productId]);
    if (check.rows.length > 0) return check.rows[0];

    const res = await query(`
        INSERT INTO shopee_bio_links(user_id, product_id, name, image_url, affiliate_link, category)
        VALUES($1, $2, $3, $4, $5, $6)
        RETURNING *
    `, [userId, data.productId, data.name, data.imageUrl, data.affiliateLink, data.category || 'Geral']);
    return res.rows[0];
}

export async function getShopeeBioLinks(userId, keyword = '') {
    let q = `SELECT * FROM shopee_bio_links WHERE user_id = $1 AND is_active = TRUE`;
    let params = [userId];
    
    if (keyword) {
        q += ` AND (name ILIKE $2 OR category ILIKE $2)`;
        params.push(`%${keyword}%`);
    }
    
    q += ` ORDER BY created_at DESC`;
    const res = await query(q, params);
    return res.rows;
}

export async function deleteShopeeBioLink(id, userId) {
    return await query(`DELETE FROM shopee_bio_links WHERE id = $1 AND user_id = $2`, [id, userId]);
}

export async function incrementShopeeBioClick(id) {
    return await query(`UPDATE shopee_bio_links SET clicks = clicks + 1 WHERE id = $1`, [id]);
}

// --- SHOPEE BIO SETTINGS FUNCTIONS ---
export async function getShopeeBioSettings(userId) {
    const results = await query('SELECT * FROM shopee_bio_settings WHERE user_id = $1', [userId]);
    return results.rows[0] || null;
}

export async function getShopeeBioSettingsBySlug(slug) {
    const results = await query('SELECT * FROM shopee_bio_settings WHERE slug = $1', [slug]);
    return results.rows[0] || null;
}

export async function saveShopeeBioSettings(userId, settings) {
    const existing = await getShopeeBioSettings(userId);
    if (existing) {
        return await query(`
            UPDATE shopee_bio_settings 
            SET whatsapp_link = $1, primary_color = $2, secondary_color = $3, font_family = $4, 
                logo_url = $5, hero_image_url = $6, title = $7, description = $8, whatsapp_banner_text = $9, 
                theme = $10, background_url = $11, overlay_opacity = $12, hero_text = $13, hero_link = $14,
                testimonials = $15, links_data = $16, limited_slots_enabled = $17, limited_slots_text = $18, 
                whatsapp_floating_enabled = $19, save_contact_enabled = $20, slug = $21,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $22
        `, [
            settings.whatsapp_link, settings.primary_color, settings.secondary_color, settings.font_family,
            settings.logo_url, settings.hero_image_url, settings.title, settings.description, settings.whatsapp_banner_text,
            settings.theme, settings.background_url, settings.overlay_opacity, settings.hero_text, settings.hero_link,
            settings.testimonials, settings.links_data, settings.limited_slots_enabled, settings.limited_slots_text,
            settings.whatsapp_floating_enabled, settings.save_contact_enabled, settings.slug,
            userId
        ]);
    } else {
        return await query(`
            INSERT INTO shopee_bio_settings 
            (user_id, whatsapp_link, primary_color, secondary_color, font_family, logo_url, hero_image_url, title, description, whatsapp_banner_text,
             theme, background_url, overlay_opacity, hero_text, hero_link, testimonials, links_data, limited_slots_enabled, limited_slots_text,
             whatsapp_floating_enabled, save_contact_enabled, slug)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
        `, [
            userId, settings.whatsapp_link, settings.primary_color, settings.secondary_color, settings.font_family,
            settings.logo_url, settings.hero_image_url, settings.title, settings.description, settings.whatsapp_banner_text,
            settings.theme, settings.background_url, settings.overlay_opacity, settings.hero_text, settings.hero_link,
            settings.testimonials, settings.links_data, settings.limited_slots_enabled, settings.limited_slots_text,
            settings.whatsapp_floating_enabled, settings.save_contact_enabled, settings.slug
        ]);
    }
}

