import pg from 'pg';

// Force pg to parse TIMESTAMP WITHOUT TIME ZONE (OID 1114) as UTC to avoid 4-hour timezone offset shifts in logs
pg.types.setTypeParser(1114, stringValue => new Date(stringValue + 'Z'));

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Prioriza DATABASE_URL injetada no ambiente do container/VPS. Se não existir, carrega do .env.local
if (!process.env.DATABASE_URL) {
    dotenv.config({ path: '.env.local', override: true });
}
dotenv.config();

const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:cz1lr7uoy71tjn5tpow9@2.25.168.70:5439/fluxointeligente?sslmode=disable';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new pg.Pool({
    connectionString: dbUrl,
    max: 30, // Aumentado de 10 para 30 para evitar starvation durante workers
    idleTimeoutMillis: 30000, // Tempo para fechar conexões inativas
    connectionTimeoutMillis: 10000, // Tempo máximo para esperar por uma conexão disponível
    keepAlive: true, // Mantém conexões com banco de dados externo ativas
});

// Trata erros em conexões inativas no pool para evitar crash do servidor (ex: ECONNRESET)
pool.on('error', (err) => {
    console.error('[DATABASE] Unexpected error on idle database client:', err.message || err);
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
        // Suppress noise for "already exists" errors during migrations
        const isAlreadyExists = error.message.includes('already exists') || error.code === '42P07' || error.code === '42710';
        if (!isAlreadyExists) {
            console.error('Database query error:', error.message, 'Query:', text);
        }
        throw error;
    }
}

// Executa um callback dentro de uma transação explícita (BEGIN/COMMIT/ROLLBACK).
// Usado para claim atômico de jobs (SELECT ... FOR UPDATE SKIP LOCKED + UPDATE
// de status na mesma transação), evitando que dois workers processem o mesmo post.
export async function withTransaction(fn) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch {}
        throw error;
    } finally {
        client.release();
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
                metadata TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Migration to add metadata column if it doesn't exist yet
        try {
            await query(`ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS metadata TEXT`);
        } catch (e) {
            // Ignore error if column already exists
        }

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

        // Post Automation Tables
        await query(`
            CREATE TABLE IF NOT EXISTS automations (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                page_ids TEXT NOT NULL,
                visual_identity TEXT,
                start_date TIMESTAMP,
                end_date TIMESTAMP,
                schedule_times TEXT,
                auto_approve BOOLEAN DEFAULT TRUE,
                status TEXT DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await query(`
            CREATE TABLE IF NOT EXISTS automation_posts (
                id SERIAL PRIMARY KEY,
                automation_id INTEGER REFERENCES automations(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                caption TEXT,
                hashtags TEXT,
                image_url TEXT,
                scheduled_time TIMESTAMP,
                status TEXT DEFAULT 'pending',
                platform TEXT,
                error_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                published_at TIMESTAMP
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

        // AI Pricing Table (custos por modelo/provedor)
        await query(`
            CREATE TABLE IF NOT EXISTS ai_pricing (
                id SERIAL PRIMARY KEY,
                provider TEXT NOT NULL,           -- 'openai', 'huggingface', 'cloudflare', 'pollinations', 'ninerouter', 'gemini'
                model TEXT NOT NULL,              -- 'gpt-image-1', 'dall-e-3', 'FLUX.1-dev', 'flux-1-schnell', etc.
                pricing_type TEXT NOT NULL,       -- 'per_image', 'per_megapixel', 'per_step', 'per_token', 'free'
                input_price_usd DECIMAL(10,6),    -- preço input (prompt tokens, megapixels, steps)
                output_price_usd DECIMAL(10,6),   -- preço output (imagem, completion tokens)
                currency TEXT DEFAULT 'USD',
                is_active BOOLEAN DEFAULT TRUE,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(provider, model)
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
                account_id TEXT UNIQUE NOT NULL,
                username TEXT,
                profile_picture_url TEXT,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Trend Searches (historico do Radar de Conteudo Viral)
        await query(`
            CREATE TABLE IF NOT EXISTS trend_searches (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                query TEXT NOT NULL,
                detected_niche TEXT,
                sources TEXT,
                count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await query(`
            CREATE TABLE IF NOT EXISTS trend_search_items (
                id SERIAL PRIMARY KEY,
                search_id INTEGER REFERENCES trend_searches(id) ON DELETE CASCADE,
                platform TEXT NOT NULL,
                item_id TEXT NOT NULL,
                title TEXT,
                views INTEGER DEFAULT 0,
                likes INTEGER DEFAULT 0,
                comments INTEGER DEFAULT 0,
                channel TEXT,
                url TEXT,
                thumbnail TEXT,
                duration INTEGER DEFAULT 0,
                published_at TIMESTAMP,
                selected BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Threads Accounts Table
        await query(`
            CREATE TABLE IF NOT EXISTS threads_accounts(
                id SERIAL PRIMARY KEY,
                name TEXT,
                access_token TEXT NOT NULL,
                account_id TEXT UNIQUE NOT NULL,
                username TEXT,
                profile_picture_url TEXT,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                status TEXT DEFAULT 'active',
                last_error TEXT,
                expires_at TIMESTAMP,
                token_type TEXT DEFAULT 'short_lived'
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
                is_trial BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Migrations for Instagram Queue
        try {
            await query("ALTER TABLE instagram_queue ADD COLUMN IF NOT EXISTS aspect_ratio TEXT DEFAULT '9:16'");
            await query("ALTER TABLE instagram_queue ADD COLUMN IF NOT EXISTS media_url TEXT");
            await query("ALTER TABLE instagram_queue ADD COLUMN IF NOT EXISTS telegram_message_id TEXT");
            await query("ALTER TABLE instagram_queue ADD COLUMN IF NOT EXISTS is_trial BOOLEAN DEFAULT FALSE");
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
                access_token TEXT,
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

        // YouTube Accounts Table
        await query(`
            CREATE TABLE IF NOT EXISTS youtube_accounts (
                id SERIAL PRIMARY KEY,
                channel_name TEXT,
                channel_id TEXT UNIQUE NOT NULL,
                access_token TEXT NOT NULL,
                refresh_token TEXT NOT NULL,
                profile_picture_url TEXT,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Table for Account Associations (Linking accounts together)
        await query(`
            CREATE TABLE IF NOT EXISTS account_associations (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                account_a_platform TEXT NOT NULL,
                account_a_id TEXT NOT NULL,
                account_b_platform TEXT NOT NULL,
                account_b_id TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, account_a_platform, account_a_id, account_b_platform, account_b_id)
            )
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_acc_assoc_user ON account_associations(user_id)`);

        // YouTube Videos Queue Table (for manual scheduling)
        await query(`
            CREATE TABLE IF NOT EXISTS youtube_videos_queue (
                id SERIAL PRIMARY KEY,
                video_path TEXT NOT NULL,
                caption TEXT,
                planned_time TIMESTAMPTZ NOT NULL,
                status TEXT DEFAULT 'pending',
                account_id INTEGER REFERENCES youtube_accounts(id) ON DELETE CASCADE,
                error_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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

        // TikTok Accounts Table
        await query(`
            CREATE TABLE IF NOT EXISTS tiktok_accounts (
                id SERIAL PRIMARY KEY,
                channel_name TEXT,
                username TEXT UNIQUE NOT NULL,
                avatar_url TEXT,
                access_token TEXT NOT NULL,
                refresh_token TEXT NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                refresh_expires_at TIMESTAMP,
                open_id TEXT UNIQUE NOT NULL,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // TikTok Warming Accounts (Account Warming)
        await query(`
            CREATE TABLE IF NOT EXISTS tiktok_warming_accounts (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                username TEXT NOT NULL,
                niche TEXT,
                audience TEXT,
                language TEXT DEFAULT 'pt-BR',
                visual_style TEXT,
                status_planning TEXT DEFAULT 'Não iniciado',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // TikTok Warming Generated Images
        await query(`
            CREATE TABLE IF NOT EXISTS tiktok_warming_images (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                warming_account_id INTEGER REFERENCES tiktok_warming_accounts(id) ON DELETE CASCADE,
                category TEXT,
                concept TEXT,
                emotional_trigger TEXT,
                visual_prompt TEXT,
                image_text TEXT,
                caption TEXT,
                comment_question TEXT,
                hashtags TEXT,
                variations TEXT,
                image_url TEXT NOT NULL,
                local_path TEXT,
                format TEXT DEFAULT '9:16',
                style TEXT,
                tone TEXT,
                intensity TEXT DEFAULT 'moderada',
                is_favorite BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // TikTok Warming Publications (manual tracking)
        await query(`
            CREATE TABLE IF NOT EXISTS tiktok_warming_publications (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                warming_account_id INTEGER REFERENCES tiktok_warming_accounts(id) ON DELETE CASCADE,
                warming_image_id INTEGER REFERENCES tiktok_warming_images(id) ON DELETE SET NULL,
                platform TEXT DEFAULT 'tiktok',
                published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                likes INTEGER DEFAULT 0,
                comments INTEGER DEFAULT 0,
                shares INTEGER DEFAULT 0,
                views INTEGER DEFAULT 0,
                manual_entry BOOLEAN DEFAULT TRUE,
                notes TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Migrações das tabelas de Aquecimento (garante colunas em bases já criadas)
        try {
            await query(`ALTER TABLE tiktok_warming_accounts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
            await query(`ALTER TABLE tiktok_warming_images ADD COLUMN IF NOT EXISTS intensity TEXT DEFAULT 'moderada'`);
            await query(`ALTER TABLE tiktok_warming_images ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
            await query(`ALTER TABLE tiktok_warming_publications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
        } catch (warmMigErr) {
            console.warn('[DATABASE] TikTok warming migration warning:', warmMigErr.message);
        }

        // Kwai Accounts Table
        await query(`
            CREATE TABLE IF NOT EXISTS kwai_accounts (
                id SERIAL PRIMARY KEY,
                channel_name TEXT,
                username TEXT UNIQUE NOT NULL,
                avatar_url TEXT,
                cookies TEXT NOT NULL,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
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
            await query(`ALTER TABLE instagram_queue ADD COLUMN IF NOT EXISTS is_trial BOOLEAN DEFAULT FALSE`);
            
            // New columns for Meta health monitoring
            await query(`ALTER TABLE facebook_pages ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'`);
            await query(`ALTER TABLE facebook_pages ADD COLUMN IF NOT EXISTS last_error TEXT`);
            await query(`ALTER TABLE instagram_accounts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'`);
            await query(`ALTER TABLE instagram_accounts ADD COLUMN IF NOT EXISTS last_error TEXT`);
            await query(`ALTER TABLE instagram_accounts ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT TRUE`);

            // New columns for token management
            await query(`ALTER TABLE instagram_accounts ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP`);
            await query(`ALTER TABLE instagram_accounts ADD COLUMN IF NOT EXISTS token_type TEXT DEFAULT 'short_lived'`);
            
            // Fix for UNIQUE/PRIMARY KEY constraint on whatsapp_groups
            try {
                // Primeiro verificamos se a PK antiga (sem account_id) existe
                await query(`
                    DO $$ 
                    BEGIN 
                        IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'whatsapp_groups_pkey' AND table_name = 'whatsapp_groups') THEN
                            -- Verifica se a PK atual contém o account_id
                            IF NOT EXISTS (
                                SELECT 1 FROM information_schema.key_column_usage 
                                WHERE constraint_name = 'whatsapp_groups_pkey' AND column_name = 'account_id'
                            ) THEN
                                ALTER TABLE whatsapp_groups DROP CONSTRAINT whatsapp_groups_pkey;
                                ALTER TABLE whatsapp_groups ADD PRIMARY KEY (group_id, user_id, account_id);
                            END IF;
                        ELSE
                            -- Se não houver PK, criamos a correta
                            ALTER TABLE whatsapp_groups ADD PRIMARY KEY (group_id, user_id, account_id);
                        END IF;
                    END $$;
                `);
                console.log('[DATABASE] Fixed whatsapp_groups PRIMARY KEY constraint');
            } catch (pkErr) {
                console.warn('[DATABASE] whatsapp_groups PK fix warning:', pkErr.message);
            }
            
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
                source_platform TEXT, -- Plataforma de origem (tiktok, facebook, instagram)
                platform TEXT NOT NULL,
                account_id TEXT NOT NULL,
                caption TEXT,
                scheduled_at TIMESTAMPTZ NOT NULL,
                status TEXT DEFAULT 'pending',
                error_message TEXT,
                is_trial BOOLEAN DEFAULT FALSE,
                comment_link_in_post BOOLEAN DEFAULT FALSE,
                shopee_link TEXT,
                posted_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_downloader_schedule_status ON downloader_schedule(status, scheduled_at)`);
        // Migration: metricas de performance por post agendado (video/imagem) - Facebook/Instagram
        await query(`
            ALTER TABLE downloader_schedule
            ADD COLUMN IF NOT EXISTS published_post_id TEXT,
            ADD COLUMN IF NOT EXISTS likes INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS comments INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS shares INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS reach INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS saved INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS metrics_updated_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS permalink TEXT
        `);

        // Alternância de comentários promocionais de assinatura (1 sim / 1 não).
        // Contador por página: incremento atômico via ON CONFLICT (seguro sob concorrência).
        await query(`
            CREATE TABLE IF NOT EXISTS promo_comment_state (
                user_id INTEGER NOT NULL,
                platform TEXT NOT NULL,
                account_id TEXT NOT NULL,
                counter BIGINT NOT NULL DEFAULT 0,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, platform, account_id)
            )
        `);
        // Auditoria/histórico + idempotência (UNIQUE por tarefa: retries nunca duplicam).
        await query(`
            CREATE TABLE IF NOT EXISTS promo_comment_log (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                platform TEXT NOT NULL,
                account_id TEXT NOT NULL,
                task_id INTEGER NOT NULL,
                position BIGINT NOT NULL,
                decision TEXT NOT NULL,
                comment_text TEXT,
                subscription_link TEXT,
                ai_used BOOLEAN DEFAULT FALSE,
                template_id INTEGER,
                send_status TEXT DEFAULT 'pending',
                attempts INTEGER DEFAULT 0,
                comment_id TEXT,
                error_message TEXT,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(task_id)
            )
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_promo_log_page ON promo_comment_log(user_id, platform, account_id, id DESC)`);

        // --- LINK NOS CAMPEÕES INTELIGENTE: config de monetização por página ---
        await query(`
            CREATE TABLE IF NOT EXISTS champion_page_config (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                platform TEXT NOT NULL,
                account_id TEXT NOT NULL,
                subscription_link TEXT DEFAULT '',
                product_link TEXT DEFAULT '',
                default_message TEXT DEFAULT '',
                priority_offer TEXT NOT NULL DEFAULT 'subscription',
                auto_monetization_enabled BOOLEAN NOT NULL DEFAULT TRUE,
                max_comments_per_period INTEGER NOT NULL DEFAULT 3,
                period_minutes INTEGER NOT NULL DEFAULT 1440,
                min_interval_minutes INTEGER NOT NULL DEFAULT 30,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, platform, account_id)
            )
        `);

        // --- LINK NOS CAMPEÕES INTELIGENTE: posts que cruzaram o limite ---
        await query(`
            CREATE TABLE IF NOT EXISTS champion_posts (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                source_type TEXT NOT NULL,
                source_id INTEGER NOT NULL,
                platform TEXT NOT NULL,
                account_id TEXT NOT NULL,
                post_id TEXT,
                caption TEXT DEFAULT '',
                views INTEGER DEFAULT 0,
                threshold_views INTEGER DEFAULT 1000,
                status TEXT NOT NULL DEFAULT 'monitoring',
                offer_type TEXT,
                link_used TEXT,
                comment_text TEXT,
                comment_status TEXT,
                error_message TEXT,
                attempts INTEGER DEFAULT 0,
                last_attempt_at TIMESTAMPTZ,
                crossed_at TIMESTAMPTZ,
                monetized_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, source_type, source_id)
            )
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_champion_posts_user ON champion_posts(user_id, status, updated_at DESC)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_champion_page_config_user ON champion_page_config(user_id, platform, account_id)`);

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
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                type TEXT, -- 'visit' ou 'click'
                link_id INTEGER REFERENCES shopee_bio_links(id) ON DELETE SET NULL,
                location TEXT,
                ip TEXT,
                device TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Table for Mercado Livre Bio Links (Vitrine)
        await query(`
            CREATE TABLE IF NOT EXISTS ml_bio_links (
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

        // --- MERCADO LIVRE BIO SETTINGS TABLE ---
        await query(`
            CREATE TABLE IF NOT EXISTS ml_bio_settings (
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                whatsapp_link TEXT,
                primary_color TEXT DEFAULT '#3483FA',
                secondary_color TEXT DEFAULT '#2D3277',
                font_family TEXT DEFAULT 'Sans-serif',
                logo_url TEXT,
                hero_image_url TEXT,
                title TEXT,
                description TEXT,
                whatsapp_banner_text TEXT DEFAULT '👉 Entre na nossa comunidade no WhatsApp',
                theme TEXT DEFAULT 'Névoa Espiritual',
                background_url TEXT,
                overlay_opacity INTEGER DEFAULT 50,
                hero_text TEXT DEFAULT 'AGENDAR CONSULTA AGORA',
                hero_link TEXT,
                testimonials TEXT DEFAULT '[]',
                links_data TEXT DEFAULT '[]',
                limited_slots_enabled INTEGER DEFAULT 0,
                limited_slots_text TEXT DEFAULT 'VAGAS LIMITADAS',
                whatsapp_floating_enabled INTEGER DEFAULT 1,
                save_contact_enabled INTEGER DEFAULT 0,
                slug TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // --- MERCADO LIVRE BIO ANALYTICS TABLE ---
        await query(`
            CREATE TABLE IF NOT EXISTS ml_bio_analytics (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                type TEXT, -- 'visit' ou 'click'
                link_id INTEGER REFERENCES ml_bio_links(id) ON DELETE SET NULL,
                location TEXT,
                ip TEXT,
                device TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // --- MERCADO LIVRE CATEGORIES TABLE ---
        await query(`
            CREATE TABLE IF NOT EXISTS ml_categories (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                slug TEXT UNIQUE NOT NULL,
                keywords TEXT NOT NULL,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // --- SHORT LINKS TABLE (CLOAKING) ---
        await query(`
            CREATE TABLE IF NOT EXISTS short_links (
                id SERIAL PRIMARY KEY,
                slug TEXT UNIQUE NOT NULL,
                target_url TEXT NOT NULL,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                clicks INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_short_links_slug ON short_links(slug)`);

        // --- SHORT LINK DETAILED CLICKS TABLE ---
        await query(`
            CREATE TABLE IF NOT EXISTS short_link_clicks (
                id SERIAL PRIMARY KEY,
                link_id INTEGER REFERENCES short_links(id) ON DELETE CASCADE,
                clicked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                ip_address TEXT,
                user_agent TEXT,
                country TEXT,
                region TEXT,
                city TEXT,
                referrer TEXT
            )
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_short_link_clicks_link ON short_link_clicks(link_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_short_link_clicks_time ON short_link_clicks(clicked_at)`);

        // Migrations for scarcity and bot filtering
        try {
            await query(`ALTER TABLE short_links ADD COLUMN max_clicks INTEGER DEFAULT NULL`);
        } catch (e) {}
        try {
            await query(`ALTER TABLE short_links ADD COLUMN expires_at TIMESTAMP DEFAULT NULL`);
        } catch (e) {}
        try {
            await query(`ALTER TABLE short_link_clicks ADD COLUMN is_bot INTEGER DEFAULT 0`);
        } catch (e) {}
        // Atribuicao: liga o link curto (comentario) ao post que o gerou
        try {
            await query(`ALTER TABLE short_links ADD COLUMN IF NOT EXISTS source_type TEXT`);
            await query(`ALTER TABLE short_links ADD COLUMN IF NOT EXISTS source_id INTEGER`);
            await query(`ALTER TABLE short_links ADD COLUMN IF NOT EXISTS platform TEXT`);
            await query(`ALTER TABLE short_links ADD COLUMN IF NOT EXISTS account_id TEXT`);
            await query(`CREATE INDEX IF NOT EXISTS idx_short_links_source ON short_links(source_type, source_id)`);
        } catch (e) {}
        try {
            await query(`ALTER TABLE short_link_clicks ADD COLUMN device_type TEXT DEFAULT 'Desconhecido'`);
        } catch (e) {}

        await query(`CREATE INDEX IF NOT EXISTS idx_shopee_bio_user ON shopee_bio_links(user_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_shopee_bio_name ON shopee_bio_links(name)`);

        // --- SHOPEE CATEGORIES TABLE ---
        await query(`
            CREATE TABLE IF NOT EXISTS shopee_categories (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                slug TEXT UNIQUE NOT NULL,
                keywords TEXT NOT NULL,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Seed initial categories if empty
        const catCount = await query('SELECT count(*) FROM shopee_categories');
        if (parseInt(catCount.rows[0].count) === 0) {
            console.log('[DATABASE] Seeding initial Shopee categories...');
            const initialCategories = [
                { name: 'Moda Masculina', slug: 'moda_masculina', keywords: 'roupas masculinas moda masculina' },
                { name: 'Moda Feminina', slug: 'moda_feminina', keywords: 'roupas femininas moda feminina' },
                { name: 'Celulares', slug: 'celulares', keywords: 'celulares smartphones xiaomi iphone' },
                { name: 'Casa & Decor', slug: 'casa', keywords: 'casa decoração cozinha utilidades' },
                { name: 'Saúde & Beleza', slug: 'beleza', keywords: 'maquiagem cosméticos saúde beleza' },
                { name: 'Umbanda | Candomblé', slug: 'umbanda', keywords: 'umbanda, candomblé, orixás, artigos religiosos umbanda, roupas de santo, guias de umbanda, axe' },
                { name: 'Evangélicos', slug: 'evangelico', keywords: 'evangélicos artigos, evangélicos vestidos, evangélico plus size, evangélico presente, evangélico itens, evangélico masculino, evangélico oficial, evangélico roupa, gospel, bíblia, cristão, umbanda artigos, orixás roupas, axe presentes, candomblé itens' },
                { name: 'Brinquedos', slug: 'brinquedos', keywords: 'brinquedos infantil kids bonecas carrinhos' },
                { name: 'Eletrônicos', slug: 'eletronicos', keywords: 'fones de ouvido smartwatch eletrônicos tech gadget' },
                { name: 'Acessórios', slug: 'acessorios', keywords: 'joias relógios óculos' },
                { name: 'Bebês', slug: 'bebes', keywords: 'bebê enxoval fraldas infantil recém nascido' },
                { name: 'Esportes', slug: 'esportes', keywords: 'academia fitness esporte suplemento treino' },
                { name: 'Automotivo', slug: 'automotivo', keywords: 'acessórios carros motos automotivo som automotivo' },
                { name: 'Relógios', slug: 'relogios', keywords: 'relógios luxo smartwatch digital analógico' },
                { name: 'Bolsas', slug: 'bolsas', keywords: 'bolsas femininas mochilas malas carteiras' },
                { name: 'Calçados Fem', slug: 'calcados_fem', keywords: 'sapatos femininos sandálias saltos sapatilhas' },
                { name: 'Calçados Masc', slug: 'calcados_masc', keywords: 'sapatos masculinos tênis botas chinelos' },
                { name: 'Cozinha', slug: 'cozinha', keywords: 'utensílios cozinha panelas airfryer fritadeira' },
                { name: 'Games', slug: 'games', keywords: 'video games consoles ps5 xbox nintendo switch' },
                { name: 'Informática', slug: 'informatica', keywords: 'computadores notebooks mouse teclado monitor hardware' },
                { name: 'Pet Shop', slug: 'pet', keywords: 'pet shop cães gatos ração brinquedos pet coleira' },
                { name: 'Papelaria', slug: 'papelaria', keywords: 'papelaria escritório escola canetas cadernos estojo' },
                { name: 'Bizarros', slug: 'bizarros', keywords: 'achadinhos úteis bizarros engraçados' },
                { name: 'Achadinhos', slug: 'achadinhos', keywords: 'achadinhos úteis casa cozinha ferramentas utilidades' },
                { name: 'Macrame', slug: 'macrame', keywords: 'macrame decoração artesanato nó' }
            ];

            for (const cat of initialCategories) {
                await query('INSERT INTO shopee_categories (name, slug, keywords) VALUES ($1, $2, $3) ON CONFLICT (slug) DO NOTHING', [cat.name, cat.slug, cat.keywords]);
            }
        }

        // Migration: Ensure new categories exist (for existing databases)
        await query("INSERT INTO shopee_categories (name, slug, keywords) VALUES ('Macrame', 'macrame', 'macrame decoraçāo artesanato nó') ON CONFLICT (slug) DO NOTHING");
        await query("INSERT INTO shopee_categories (name, slug, keywords) VALUES ('Mais Baratos', 'mais_baratos', 'barato promocao oferta') ON CONFLICT (slug) DO NOTHING");
        await query("INSERT INTO shopee_categories (name, slug, keywords) VALUES ('Mais Vendidos', 'mais_vendidos', 'sucesso vendas') ON CONFLICT (slug) DO NOTHING");
        await query("INSERT INTO shopee_categories (name, slug, keywords) VALUES ('Evangélicos', 'evangelicos', 'biblia fe deus jesus') ON CONFLICT (slug) DO NOTHING");

        // --- SEED INITIAL MERCADO LIVRE CATEGORIES ---
        const mlCatCount = await query('SELECT count(*) FROM ml_categories');
        if (parseInt(mlCatCount.rows[0].count) === 0) {
            console.log('[DATABASE] Seeding initial Mercado Livre categories...');
            const initialMLCategories = [
                { name: 'Moda Masculina', slug: 'moda_masculina', keywords: 'roupas masculinas moda masculina' },
                { name: 'Moda Feminina', slug: 'moda_feminina', keywords: 'roupas femininas moda feminina' },
                { name: 'Celulares', slug: 'celulares', keywords: 'celulares smartphones xiaomi iphone' },
                { name: 'Casa & Decor', slug: 'casa', keywords: 'casa decoração cozinha utilidades' },
                { name: 'Saúde & Beleza', slug: 'beleza', keywords: 'maquiagem cosméticos saúde beleza' },
                { name: 'Brinquedos', slug: 'brinquedos', keywords: 'brinquedos infantil kids bonecas carrinhos' },
                { name: 'Eletrônicos', slug: 'eletronicos', keywords: 'fones de ouvido smartwatch eletrônicos tech gadget' },
                { name: 'Acessórios', slug: 'acessorios', keywords: 'joias relógios óculos' },
                { name: 'Bebês', slug: 'bebes', keywords: 'bebê enxoval fraldas infantil recém nascido' },
                { name: 'Esportes', slug: 'esportes', keywords: 'academia fitness esporte suplemento treino' },
                { name: 'Automotivo', slug: 'automotivo', keywords: 'acessórios carros motos automotivo som automotivo' },
                { name: 'Relógios', slug: 'relogios', keywords: 'relógios luxo smartwatch digital analógico' },
                { name: 'Bolsas', slug: 'bolsas', keywords: 'bolsas femininas mochilas malas carteiras' },
                { name: 'Calçados', slug: 'calcados', keywords: 'sapatos tênis botas chinelos' },
                { name: 'Cozinha', slug: 'cozinha', keywords: 'utensílios cozinha panelas airfryer fritadeira' },
                { name: 'Games', slug: 'games', keywords: 'video games consoles ps5 xbox nintendo switch' },
                { name: 'Informática', slug: 'informatica', keywords: 'computadores notebooks mouse teclado monitor hardware' },
                { name: 'Pet Shop', slug: 'pet', keywords: 'pet shop cães gatos ração brinquedos pet coleira' },
                { name: 'Papelaria', slug: 'papelaria', keywords: 'papelaria escritório escola canetas cadernos estojo' },
                { name: 'Achadinhos', slug: 'achadinhos', keywords: 'achadinhos úteis casa cozinha ferramentas utilidades' }
            ];

            for (const cat of initialMLCategories) {
                await query('INSERT INTO ml_categories (name, slug, keywords) VALUES ($1, $2, $3) ON CONFLICT (slug) DO NOTHING', [cat.name, cat.slug, cat.keywords]);
            }
        }

        // Migration: Add source_platform to downloader_schedule if it doesn't exist
        // Table for notifications
        await query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                type TEXT NOT NULL, -- 'success', 'error', 'warning', 'info'
                module TEXT, -- 'whatsapp', 'telegram', 'instagram', 'facebook', 'shopee', 'system'
                title TEXT NOT NULL,
                message TEXT,
                read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read)`);
        
        // Table for notification preferences
        await query(`
            CREATE TABLE IF NOT EXISTS notification_settings (
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                whatsapp_success BOOLEAN DEFAULT TRUE,
                whatsapp_error BOOLEAN DEFAULT TRUE,
                telegram_success BOOLEAN DEFAULT TRUE,
                telegram_error BOOLEAN DEFAULT TRUE,
                instagram_success BOOLEAN DEFAULT TRUE,
                instagram_error BOOLEAN DEFAULT TRUE,
                facebook_success BOOLEAN DEFAULT TRUE,
                facebook_error BOOLEAN DEFAULT TRUE,
                youtube_success BOOLEAN DEFAULT TRUE,
                youtube_error BOOLEAN DEFAULT TRUE,
                system_status BOOLEAN DEFAULT TRUE,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('[DATABASE] Verificando migrações...');
        await query(`ALTER TABLE downloader_schedule ADD COLUMN IF NOT EXISTS source_platform TEXT`);
        await query(`ALTER TABLE downloader_schedule ADD COLUMN IF NOT EXISTS is_trial BOOLEAN DEFAULT FALSE`);
        await query(`ALTER TABLE downloader_schedule ADD COLUMN IF NOT EXISTS comment_link_in_post BOOLEAN DEFAULT FALSE`);
        await query(`ALTER TABLE downloader_schedule ADD COLUMN IF NOT EXISTS shopee_link TEXT`);
        await query(`ALTER TABLE downloader_schedule ADD COLUMN IF NOT EXISTS enable_royalties BOOLEAN DEFAULT FALSE`);
        await query(`ALTER TABLE downloader_schedule ADD COLUMN IF NOT EXISTS royalty_music_urls TEXT`);
        await query(`ALTER TABLE downloader_schedule ADD COLUMN IF NOT EXISTS royalty_volume REAL DEFAULT 0.25`);
        await query(`ALTER TABLE downloader_schedule ADD COLUMN IF NOT EXISTS custom_comment_phrases TEXT`);
        await query(`ALTER TABLE instagram_queue ADD COLUMN IF NOT EXISTS is_trial BOOLEAN DEFAULT FALSE`);

        const tablesToMigrate = [
            'instagram_accounts',
            'facebook_pages',
            'tiktok_accounts',
            'youtube_accounts',
            'threads_accounts',
            'twitter_accounts',
            'whatsapp_accounts',
            'telegram_accounts'
        ];
        for (const tbl of tablesToMigrate) {
            await query(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS consecutive_errors INTEGER DEFAULT 0`);
            await query(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE`);
            await query(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS last_lock_error TEXT`);
        }

        // Pinterest cookie migrations
        try {
            await query(`ALTER TABLE pinterest_accounts ADD COLUMN IF NOT EXISTS cookies TEXT`);
            await query(`ALTER TABLE pinterest_accounts ADD COLUMN IF NOT EXISTS login_method TEXT DEFAULT 'official'`);
            await query(`ALTER TABLE pinterest_accounts ALTER COLUMN access_token DROP NOT NULL`);
            console.log('[DATABASE] Pinterest cookie migrations completed');
        } catch (migErr) {
            console.warn('[DATABASE] Pinterest cookie migrations warning:', migErr.message);
        }

        // Post Automations migrations
        try {
            await query(`
                CREATE TABLE IF NOT EXISTS automations (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    name TEXT NOT NULL,
                    page_ids JSONB,
                    status TEXT DEFAULT 'active',
                    visual_identity JSONB,
                    start_date TIMESTAMP,
                    end_date TIMESTAMP,
                    schedule_times JSONB,
                    auto_approve BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            await query(`
                CREATE TABLE IF NOT EXISTS automation_posts (
                    id SERIAL PRIMARY KEY,
                    automation_id INTEGER REFERENCES automations(id) ON DELETE CASCADE,
                    title TEXT NOT NULL,
                    image_url TEXT,
                    description TEXT,
                    hashtags TEXT,
                    status TEXT DEFAULT 'pending',
                    scheduled_date TIMESTAMP,
                    published_date TIMESTAMP,
                    error_message TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            // Migration: Add published_page_id and published_platform columns
            await query(`
                ALTER TABLE automation_posts 
                ADD COLUMN IF NOT EXISTS published_page_id TEXT,
                ADD COLUMN IF NOT EXISTS published_platform TEXT,
                ADD COLUMN IF NOT EXISTS publish_attempts INTEGER DEFAULT 0,
                ADD COLUMN IF NOT EXISTS retry_at TIMESTAMP,
                ADD COLUMN IF NOT EXISTS image_provider TEXT,
                ADD COLUMN IF NOT EXISTS image_model TEXT,
                ADD COLUMN IF NOT EXISTS image_cost_usd DECIMAL(10,6) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER DEFAULT 0,
                ADD COLUMN IF NOT EXISTS completion_tokens INTEGER DEFAULT 0
            `);
            // Migration: performance de posts por plataforma (curtidas/views por post)
            try {
                await query(`
                    ALTER TABLE automation_posts
                    ADD COLUMN IF NOT EXISTS published_post_id TEXT,
                    ADD COLUMN IF NOT EXISTS media_type TEXT,
                    ADD COLUMN IF NOT EXISTS likes INTEGER DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS comments INTEGER DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS shares INTEGER DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS reach INTEGER DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS saved INTEGER DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS metrics_updated_at TIMESTAMP,
                    ADD COLUMN IF NOT EXISTS permalink TEXT
                `);
                await query(`
                    CREATE TABLE IF NOT EXISTS post_metrics_snapshots (
                        id SERIAL PRIMARY KEY,
                        automation_post_id INTEGER REFERENCES automation_posts(id) ON DELETE CASCADE,
                        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                        platform TEXT,
                        likes INTEGER DEFAULT 0,
                        comments INTEGER DEFAULT 0,
                        shares INTEGER DEFAULT 0,
                        views INTEGER DEFAULT 0,
                        reach INTEGER DEFAULT 0,
                        saved INTEGER DEFAULT 0,
                        captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `);
            } catch (migErr2) {
                console.warn('[DATABASE] Post metrics migrations warning:', migErr2.message);
            }
            console.log('[DATABASE] Automations tables initialized');
        } catch (migErr) {
            console.warn('[DATABASE] Automations migrations warning:', migErr.message);
        }

        // Seed default AI pricing (preços de referência 2024-2025)
        try {
            const defaultPricing = [
                // OpenAI
                ['openai', 'gpt-image-1', 'per_image', 0.040, 0.000, 'USD'],
                ['openai', 'gpt-image-1-mini', 'per_image', 0.020, 0.000, 'USD'],
                ['openai', 'dall-e-3', 'per_image', 0.040, 0.000, 'USD'],      // 1024x1024 standard
                ['openai', 'dall-e-3-hd', 'per_image', 0.080, 0.000, 'USD'],    // 1024x1024 HD
                ['openai', 'dall-e-2', 'per_image', 0.020, 0.000, 'USD'],       // 1024x1024
                // Hugging Face (Inference API - gratuito com rate limit, paid endpoints variam)
                ['huggingface', 'FLUX.1-dev', 'free', 0.000, 0.000, 'USD'],
                ['huggingface', 'FLUX.1-klein', 'free', 0.000, 0.000, 'USD'],
                ['huggingface', 'FLUX.1-schnell', 'free', 0.000, 0.000, 'USD'],
                ['huggingface', 'stable-diffusion-xl-base-1.0', 'free', 0.000, 0.000, 'USD'],
                ['huggingface', 'stable-diffusion-3-medium', 'free', 0.000, 0.000, 'USD'],
                ['huggingface', 'sdxl-turbo', 'free', 0.000, 0.000, 'USD'],
                ['huggingface', 'SSD-1B', 'free', 0.000, 0.000, 'USD'],
                ['huggingface', 'stable-diffusion-v1-5', 'free', 0.000, 0.000, 'USD'],
                ['huggingface', 'stable-diffusion-v1-4', 'free', 0.000, 0.000, 'USD'],
                ['huggingface', 'openjourney-v4', 'free', 0.000, 0.000, 'USD'],
                // Cloudflare Workers AI (incluído no plano Workers AI, ~$0.011/1000 requests para FLUX)
                ['cloudflare', 'flux-1-schnell', 'per_image', 0.0001, 0.000, 'USD'],
                ['cloudflare', 'stable-diffusion-xl-base-1.0', 'per_image', 0.0001, 0.000, 'USD'],
                // Pollinations.ai (gratuito)
                ['pollinations', 'flux', 'free', 0.000, 0.000, 'USD'],
                ['pollinations', 'flux-klein', 'free', 0.000, 0.000, 'USD'],
                ['pollinations', 'flux-realism', 'free', 0.000, 0.000, 'USD'],
                ['pollinations', 'flux-anime', 'free', 0.000, 0.000, 'USD'],
                ['pollinations', 'flux-3d', 'free', 0.000, 0.000, 'USD'],
                ['pollinations', 'gptimage', 'free', 0.000, 0.000, 'USD'],
                ['pollinations', 'midjourney', 'free', 0.000, 0.000, 'USD'],
                // 9Router (proxy OpenAI - mesmo preço OpenAI + markup)
                ['ninerouter', 'gpt-image-1', 'per_image', 0.045, 0.000, 'USD'],
                ['ninerouter', 'gpt-image-1-mini', 'per_image', 0.022, 0.000, 'USD'],
                ['ninerouter', 'dall-e-3', 'per_image', 0.045, 0.000, 'USD'],
                // Gemini (para prompts de texto - não gera imagem)
                ['gemini', 'gemini-1.5-flash', 'per_token', 0.000000075, 0.0000003, 'USD'],
                ['gemini', 'gemini-1.5-pro', 'per_token', 0.00000125, 0.000005, 'USD'],
                // Google (geração de imagem via Gemini native image — ~1290 tokens/imagem)
                ['google', 'gemini-2.5-flash-image', 'per_image', 0.039, 0.000, 'USD'],
                ['google', 'gemini-2.0-flash-preview-image-generation', 'per_image', 0.039, 0.000, 'USD'],
                // Runware (serverless GPU pay-as-you-go — FLUX schnell ~$0.001/imagem)
                ['runware', 'runware-flux-schnell', 'per_image', 0.001, 0.000, 'USD'],
                ['runware', 'runware-flux-dev', 'per_image', 0.003, 0.000, 'USD'],
            ];
            for (const p of defaultPricing) {
                await query(`
                    INSERT INTO ai_pricing (provider, model, pricing_type, input_price_usd, output_price_usd, currency)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (provider, model) DO NOTHING
                `, p);
            }
            console.log('[DATABASE] Default AI pricing seeded');
        } catch (seedErr) {
            console.warn('[DATABASE] AI pricing seed warning:', seedErr.message);
        }

        console.log('✅ PostgreSQL Database initialized successfully');

    } catch (error) {
        console.error('❌ Error initializing database:', error);
    }
}

// ============================================
// YOUTUBE ACCOUNTS FUNCTIONS
// ============================================

export async function getYoutubeAccounts(userId) {
    const res = await query('SELECT * FROM youtube_accounts WHERE user_id = $1 ORDER BY added_at DESC', [userId]);
    return res.rows;
}

export async function getYoutubeAccountById(id, userId) {
    const res = await query('SELECT * FROM youtube_accounts WHERE id = $1 AND user_id = $2', [id, userId]);
    return res.rows[0];
}

export async function saveYoutubeAccount(data, userId) {
    const { channel_name, channel_id, access_token, refresh_token, profile_picture_url } = data;
    
    const res = await query(`
        INSERT INTO youtube_accounts (channel_name, channel_id, access_token, refresh_token, profile_picture_url, user_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (channel_id) DO UPDATE SET
            channel_name = EXCLUDED.channel_name,
            access_token = EXCLUDED.access_token,
            refresh_token = EXCLUDED.refresh_token,
            profile_picture_url = EXCLUDED.profile_picture_url,
            added_at = CURRENT_TIMESTAMP
        RETURNING *
    `, [channel_name, channel_id, access_token, refresh_token, profile_picture_url, userId]);
    
    return res.rows[0];
}

export async function removeYoutubeAccount(id, userId) {
    return await query('DELETE FROM youtube_accounts WHERE id = $1 AND user_id = $2', [id, userId]);
}

// TIKTOK ACCOUNTS FUNCTIONS
export async function getTikTokAccounts(userId) {
    const res = await query('SELECT * FROM tiktok_accounts WHERE user_id = $1 ORDER BY added_at DESC', [userId]);
    return res.rows;
}

export async function getTikTokAccountById(id, userId) {
    const res = await query('SELECT * FROM tiktok_accounts WHERE id = $1 AND user_id = $2', [id, userId]);
    return res.rows[0];
}

export async function saveTikTokAccount(data, userId) {
    const { channel_name, username, avatar_url, access_token, refresh_token, expires_at, refresh_expires_at, open_id } = data;
    
    const res = await query(`
        INSERT INTO tiktok_accounts (channel_name, username, avatar_url, access_token, refresh_token, expires_at, refresh_expires_at, open_id, user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (open_id) DO UPDATE SET
            channel_name = EXCLUDED.channel_name,
            username = EXCLUDED.username,
            avatar_url = EXCLUDED.avatar_url,
            access_token = EXCLUDED.access_token,
            refresh_token = EXCLUDED.refresh_token,
            expires_at = EXCLUDED.expires_at,
            refresh_expires_at = EXCLUDED.refresh_expires_at,
            added_at = CURRENT_TIMESTAMP
        RETURNING *
    `, [channel_name, username, avatar_url, access_token, refresh_token, expires_at, refresh_expires_at, open_id, userId]);
    
    return res.rows[0];
}

export async function removeTikTokAccount(id, userId) {
    return await query('DELETE FROM tiktok_accounts WHERE id = $1 AND user_id = $2', [id, userId]);
}

// KWAI ACCOUNTS FUNCTIONS
export async function getKwaiAccounts(userId) {
    const res = await query('SELECT * FROM kwai_accounts WHERE user_id = $1 ORDER BY added_at DESC', [userId]);
    return res.rows;
}

export async function getKwaiAccountById(id, userId) {
    const res = await query('SELECT * FROM kwai_accounts WHERE id = $1 AND user_id = $2', [id, userId]);
    return res.rows[0];
}

export async function saveKwaiAccount(data, userId) {
    const { channel_name, username, avatar_url, cookies } = data;
    
    const res = await query(`
        INSERT INTO kwai_accounts (channel_name, username, avatar_url, cookies, user_id)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (username) DO UPDATE SET
            channel_name = EXCLUDED.channel_name,
            avatar_url = EXCLUDED.avatar_url,
            cookies = EXCLUDED.cookies,
            added_at = CURRENT_TIMESTAMP
        RETURNING *
    `, [channel_name, username, avatar_url, cookies, userId]);
    
    return res.rows[0];
}

export async function removeKwaiAccount(id, userId) {
    return await query('DELETE FROM kwai_accounts WHERE id = $1 AND user_id = $2', [id, userId]);
}


// YOUTUBE VIDEOS QUEUE FUNCTIONS
export async function getPendingYoutubeVideos(searchTime) {
    const res = await query('SELECT * FROM youtube_videos_queue WHERE status = $1 AND planned_time <= $2', ['pending', searchTime]);
    return res.rows;
}

export async function markYoutubeVideoPosted(id) {
    return await query('UPDATE youtube_videos_queue SET status = $1, error_message = NULL WHERE id = $2', ['completed', id]);
}

export async function markYoutubeVideoFailed(id, error) {
    return await query('UPDATE youtube_videos_queue SET status = $1, error_message = $2 WHERE id = $3', ['failed', error, id]);
}

// ============================================
// DOWNLOADER SCHEDULE FUNCTIONS
// ============================================

export async function addDownloaderSchedule(data, userId) {
    const res = await query(`
        INSERT INTO downloader_schedule(user_id, source_url, media_url, media_type, source_platform, platform, account_id, caption, scheduled_at)
        VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
    `, [userId, data.sourceUrl, data.mediaUrl, data.mediaType, data.sourcePlatform || 'video', data.platform, data.accountId, data.caption || '', data.scheduledAt]);
    return res.rows[0];
}

export async function getDownloaderSchedule(userId, accountId = null) {
    let sql = `SELECT * FROM downloader_schedule WHERE user_id = $1`;
    const params = [userId];
    if (accountId) {
        sql += ` AND account_id = $2`;
        params.push(String(accountId));
    }
    sql += ` ORDER BY scheduled_at ASC`;
    const res = await query(sql, params);
    return res.rows;
}

export async function deleteDownloaderSchedule(id, userId) {
    return await query(`DELETE FROM downloader_schedule WHERE id = $1 AND user_id = $2`, [id, userId]);
}

export async function getPendingDownloaderSchedules() {
    // Only fetch tasks that are ACTUALLY DUE: scheduled in the past or within the next 2 minutes.
    // This is critical for performance with large queues (50k+ rows).
    // The LIMIT prevents loading too many rows at once even if the clock drifted.
    const res = await query(`
        SELECT id, user_id, source_url, media_url, media_type, source_platform, platform, account_id, caption, 
               scheduled_at, is_trial, comment_link_in_post, shopee_link,
               enable_royalties, royalty_music_urls, royalty_volume, custom_comment_phrases,
               status, error_message, posted_at, created_at
        FROM downloader_schedule
        WHERE status = 'pending'
        AND scheduled_at <= (NOW() + INTERVAL '2 minutes')
        ORDER BY scheduled_at ASC
        LIMIT 20
    `);
    return res.rows;
}

export async function getDeferredDownloaderSchedules(limit = 5) {
    // Only pre-analyze DEFERRED tasks scheduled within the next 3 hours.
    // This prevents analyzing URLs that won't be posted for days/weeks.
    const res = await query(`
        SELECT id, user_id, source_url, media_url, media_type, source_platform, platform, account_id, caption, 
               scheduled_at, custom_comment_phrases, status
        FROM downloader_schedule
        WHERE status = 'pending' AND media_url = 'DEFERRED'
        AND scheduled_at <= (NOW() + INTERVAL '3 hours')
        ORDER BY scheduled_at ASC
        LIMIT $1
    `, [limit]);
    return res.rows;
}

export async function updateDownloaderScheduleAnalysis(id, mediaUrl, caption, sourcePlatform) {
    return await query(`
        UPDATE downloader_schedule
        SET media_url = $1, caption = $2, source_platform = COALESCE($3, source_platform)
        WHERE id = $4
    `, [mediaUrl, caption, sourcePlatform, id]);
}

export async function clearFailedDownloaderSchedules(userId) {
    return await query(`
        DELETE FROM downloader_schedule
        WHERE user_id = $1 AND status = 'failed'
    `, [userId]);
}

export async function deleteAllPendingDownloaderSchedules(userId, platform = null) {
    if (platform && platform !== 'all') {
        return await query(`
            DELETE FROM downloader_schedule
            WHERE user_id = $1 AND status = 'pending' AND platform = $2
        `, [userId, platform]);
    }
    return await query(`
        DELETE FROM downloader_schedule
        WHERE user_id = $1 AND status = 'pending'
    `, [userId]);
}

export async function deleteDownloaderSchedulesBulk(ids, userId) {
    if (!ids || ids.length === 0) return { success: true };
    return await query(`
        DELETE FROM downloader_schedule
        WHERE user_id = $1 AND id = ANY($2::int[])
    `, [userId, ids]);
}

export async function updateDownloaderScheduleStatus(id, status, errorMsg = null) {
    return await query(`
        UPDATE downloader_schedule
        SET status = $1, error_message = $2, posted_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE NULL END
        WHERE id = $3
    `, [status, errorMsg, id]);
}

/**
 * Garante as tabelas da alternância (idempotente). O boot do servidor já
 * executa o mesmo DDL; exportado para testes de integração.
 */
export async function ensurePromoCommentTables() {
    await query(`
        CREATE TABLE IF NOT EXISTS promo_comment_state (
            user_id INTEGER NOT NULL,
            platform TEXT NOT NULL,
            account_id TEXT NOT NULL,
            counter BIGINT NOT NULL DEFAULT 0,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, platform, account_id)
        )
    `);
    await query(`
        CREATE TABLE IF NOT EXISTS promo_comment_log (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            platform TEXT NOT NULL,
            account_id TEXT NOT NULL,
            task_id INTEGER NOT NULL,
            position BIGINT NOT NULL,
            decision TEXT NOT NULL,
            comment_text TEXT,
            subscription_link TEXT,
            ai_used BOOLEAN DEFAULT FALSE,
            template_id INTEGER,
            send_status TEXT DEFAULT 'pending',
            attempts INTEGER DEFAULT 0,
            comment_id TEXT,
            error_message TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(task_id)
        )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_promo_log_page ON promo_comment_log(user_id, platform, account_id, id DESC)`);
}

/**
 * Alternância de comentários promocionais (1 sim / 1 não por página).
 * - Idempotente: se a tarefa já tem decisão gravada, retorna sem consumir posição.
 * - Atômico sob concorrência: o contador é incrementado em statement único
 *   (row lock do Postgres), então dois vídeos simultâneos nunca pegam a mesma posição.
 * - Falhas de publicação nunca chegam aqui (só chamar após sucesso).
 * @returns { decision: 'comment'|'skip', position }
 */
export async function decidePromoComment(userId, platform, accountId, taskId, frequency = 2) {
    const freq = Math.min(Math.max(parseInt(frequency) || 2, 1), 10);
    const acc = String(accountId);

    const existing = await query(`SELECT decision, position FROM promo_comment_log WHERE task_id = $1`, [taskId]);
    if (existing.rows.length > 0) {
        return { decision: existing.rows[0].decision, position: Number(existing.rows[0].position), reused: true };
    }

    const cnt = await query(`
        INSERT INTO promo_comment_state(user_id, platform, account_id, counter, updated_at)
        VALUES($1, $2, $3, 1, NOW())
        ON CONFLICT (user_id, platform, account_id)
        DO UPDATE SET counter = promo_comment_state.counter + 1, updated_at = NOW()
        RETURNING counter
    `, [userId, platform, acc]);
    const position = Number(cnt.rows[0].counter);
    const decision = ((position - 1) % freq === 0) ? 'comment' : 'skip';

    const ins = await query(`
        INSERT INTO promo_comment_log(user_id, platform, account_id, task_id, position, decision, send_status)
        VALUES($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (task_id) DO NOTHING
        RETURNING decision, position
    `, [userId, platform, acc, taskId, position, decision, decision === 'skip' ? 'skipped' : 'pending']);
    if (ins.rows.length === 0) {
        // Corrida raríssima na mesma tarefa: outra execução decidiu primeiro.
        const retry = await query(`SELECT decision, position FROM promo_comment_log WHERE task_id = $1`, [taskId]);
        return { decision: retry.rows[0].decision, position: Number(retry.rows[0].position), reused: true };
    }
    return { decision, position, reused: false };
}

export async function updatePromoLog(taskId, patch = {}) {
    const allowed = ['comment_text', 'subscription_link', 'ai_used', 'template_id', 'send_status', 'attempts', 'comment_id', 'error_message'];
    const sets = [];
    const vals = [taskId];
    for (const k of allowed) {
        if (patch[k] !== undefined) {
            vals.push(patch[k]);
            sets.push(`${k} = $${vals.length}`);
        }
    }
    if (sets.length === 0) return null;
    vals.push(new Date().toISOString());
    const res = await query(`UPDATE promo_comment_log SET ${sets.join(', ')}, updated_at = $${vals.length} WHERE task_id = $1 RETURNING *`, vals);
    return res.rows[0] || null;
}

export async function getRecentPromoTexts(userId, platform, accountId, limit = 5) {
    const res = await query(`
        SELECT comment_text FROM promo_comment_log
        WHERE user_id = $1 AND platform = $2 AND account_id = $3
          AND comment_text IS NOT NULL AND send_status = 'sent'
        ORDER BY id DESC LIMIT $4
    `, [userId, platform, String(accountId), limit]);
    return res.rows.map(r => r.comment_text);
}

/**
 * Cria (ou reabre, se ainda nao foi enviado) um log de comentario promocional
 * manual para um post ja publicado. Retorna null se o post JA recebeu comentario.
 */
export async function createManualPromoLog(userId, platform, accountId, taskId) {
    const res = await query(`
        INSERT INTO promo_comment_log(user_id, platform, account_id, task_id, position, decision, send_status)
        VALUES($1, $2, $3, $4, 0, 'comment', 'pending')
        ON CONFLICT (task_id) DO UPDATE
            SET send_status = 'pending', decision = 'comment', error_message = NULL
            WHERE promo_comment_log.send_status <> 'sent'
        RETURNING *
    `, [userId, platform, String(accountId), taskId]);
    return res.rows[0] || null;
}

/** IDs das tarefas que JA receberam comentario promocional enviado com sucesso. */
export async function getPromoLoggedTaskIds(taskIds = []) {
    const ids = (taskIds || []).map(Number).filter(n => Number.isInteger(n));
    if (ids.length === 0) return new Set();
    const res = await query(
        `SELECT task_id FROM promo_comment_log WHERE task_id = ANY($1::int[]) AND send_status = 'sent'`,
        [ids]
    );
    return new Set(res.rows.map(r => Number(r.task_id)));
}

/** IDs de posts que ja possuem link de oferta atribuido (short link com source). */
export async function getLinkedSourceIds(userId, sourceType, ids = []) {
    const clean = (ids || []).map(Number).filter(n => Number.isInteger(n));
    if (clean.length === 0) return new Set();
    const res = await query(
        `SELECT DISTINCT source_id FROM short_links
         WHERE user_id = $1 AND source_type = $2 AND source_id = ANY($3::int[])`,
        [userId, sourceType, clean]
    );
    return new Set(res.rows.map(r => Number(r.source_id)));
}

/** Remove links curtos de um post (usado para desfazer tentativa que falhou). */
export async function deleteShortLinkBySource(userId, sourceType, sourceId) {
    await query(
        `DELETE FROM short_links WHERE user_id = $1 AND source_type = $2 AND source_id = $3`,
        [userId, sourceType, sourceId]
    );
}

// ============================================================
// LINK NOS CAMPEÕES INTELIGENTE — CRUD
// ============================================================

/** Lista as configs de monetização por página de um usuário. */
export async function getChampionPageConfigs(userId) {
    const res = await query(
        `SELECT * FROM champion_page_config WHERE user_id = $1 ORDER BY platform, account_id`,
        [userId]
    );
    return res.rows;
}

/** Busca a config de uma página específica (ou null). */
export async function getChampionPageConfig(userId, platform, accountId) {
    const res = await query(
        `SELECT * FROM champion_page_config WHERE user_id = $1 AND platform = $2 AND account_id = $3`,
        [userId, platform, String(accountId)]
    );
    return res.rows[0] || null;
}

/** Normaliza link colado pelo usuário: garante protocolo http(s) para o redirect funcionar. */
export function normalizeLinkUrl(v) {
    const s = String(v || '').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    return `https://${s.replace(/^\/+/, '')}`;
}

/** Cria ou atualiza a config de monetização de uma página (upsert). */
export async function upsertChampionPageConfig(userId, platform, accountId, data = {}) {
    const res = await query(`
        INSERT INTO champion_page_config
            (user_id, platform, account_id, subscription_link, product_link, default_message,
             priority_offer, auto_monetization_enabled, max_comments_per_period, period_minutes, min_interval_minutes, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, NOW())
        ON CONFLICT (user_id, platform, account_id) DO UPDATE SET
            subscription_link = EXCLUDED.subscription_link,
            product_link = EXCLUDED.product_link,
            default_message = EXCLUDED.default_message,
            priority_offer = EXCLUDED.priority_offer,
            auto_monetization_enabled = EXCLUDED.auto_monetization_enabled,
            max_comments_per_period = EXCLUDED.max_comments_per_period,
            period_minutes = EXCLUDED.period_minutes,
            min_interval_minutes = EXCLUDED.min_interval_minutes,
            updated_at = NOW()
        RETURNING *
    `, [
        userId, platform, String(accountId),
        normalizeLinkUrl(data.subscription_link),
        normalizeLinkUrl(data.product_link),
        data.default_message || '',
        data.priority_offer || 'subscription',
        data.auto_monetization_enabled !== false,
        Math.max(parseInt(data.max_comments_per_period) || 3, 1),
        Math.max(parseInt(data.period_minutes) || 1440, 10),
        Math.max(parseInt(data.min_interval_minutes) || 30, 1),
    ]);
    return res.rows[0];
}

/**
 * Registra/atualiza um post campeão de forma idempotente (upsert pelo par único).
 * Se o post já existe, atualiza views e, se cruzou o limite, grava crossed_at.
 */
export async function upsertChampionPost(userId, { sourceType, sourceId, platform, accountId, postId, caption, views, threshold }) {
    const res = await query(`
        INSERT INTO champion_posts
            (user_id, source_type, source_id, platform, account_id, post_id, caption, views, threshold_views, status, crossed_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::int,$9::int,
                CASE WHEN $8::int >= $9::int THEN 'identified' ELSE 'monitoring' END,
                CASE WHEN $8::int >= $9::int THEN NOW() ELSE NULL END,
                NOW())
        ON CONFLICT (user_id, source_type, source_id) DO UPDATE SET
            views = EXCLUDED.views,
            post_id = COALESCE(champion_posts.post_id, EXCLUDED.post_id),
            caption = COALESCE(NULLIF(EXCLUDED.caption, ''), champion_posts.caption),
            threshold_views = EXCLUDED.threshold_views,
            status = CASE
                WHEN champion_posts.status = 'commented' THEN 'commented'
                WHEN EXCLUDED.views >= EXCLUDED.threshold_views AND champion_posts.status = 'monitoring' THEN 'identified'
                ELSE champion_posts.status
            END,
            crossed_at = COALESCE(champion_posts.crossed_at,
                CASE WHEN EXCLUDED.views >= EXCLUDED.threshold_views THEN NOW() ELSE NULL END),
            updated_at = NOW()
        RETURNING *
    `, [userId, sourceType, sourceId, platform, String(accountId), postId || null, caption || '', views || 0, threshold || 1000]);
    return res.rows[0];
}

/** Lista posts campeões com filtros opcionais. */
export async function getChampionPosts(userId, { status = null, platform = null, accountId = null, days = null, limit = 100 } = {}) {
    const conds = ['user_id = $1'];
    const vals = [userId];
    if (status) { vals.push(status); conds.push(`status = $${vals.length}`); }
    if (platform) { vals.push(platform); conds.push(`platform = $${vals.length}`); }
    if (accountId) { vals.push(String(accountId)); conds.push(`account_id = $${vals.length}`); }
    if (days) { vals.push(days); conds.push(`updated_at >= NOW() - ($${vals.length} || ' days')::interval`); }
    vals.push(limit);
    const res = await query(
        `SELECT cp.*,
                COALESCE(ds.media_url, ap.image_url) AS image_url,
                COALESCE(ds.permalink, ap.permalink) AS permalink,
                COALESCE(ds.posted_at, ap.published_date) AS published_at,
                COALESCE(ds.media_type, ap.media_type) AS media_type,
                (SELECT COALESCE(SUM(sl.clicks), 0) FROM short_links sl
                  WHERE sl.user_id = cp.user_id AND sl.source_type = cp.source_type AND sl.source_id = cp.source_id) AS clicks
         FROM champion_posts cp
         LEFT JOIN downloader_schedule ds ON cp.source_type = 'downloader_schedule' AND ds.id = cp.source_id
         LEFT JOIN automation_posts ap ON cp.source_type = 'automation_posts' AND ap.id = cp.source_id
         WHERE ${conds.map(c => c.replace(/\b(user_id|status|platform|account_id|updated_at)\b/g, 'cp.$1')).join(' AND ')}
         ORDER BY cp.updated_at DESC LIMIT $${vals.length}`,
        vals
    );
    return res.rows;
}

/** Marca o status de um post campeão (com dados opcionais de comentário). */
export async function updateChampionPostStatus(userId, id, status, extra = {}) {
    const res = await query(`
        UPDATE champion_posts SET
            status = $3,
            offer_type = COALESCE($4, offer_type),
            link_used = COALESCE($5, link_used),
            comment_text = COALESCE($6, comment_text),
            comment_status = COALESCE($7, comment_status),
            error_message = $8,
            attempts = COALESCE($9, attempts),
            last_attempt_at = CASE WHEN $9 IS NOT NULL THEN NOW() ELSE last_attempt_at END,
            monetized_at = CASE WHEN $3 = 'commented' THEN NOW() ELSE monetized_at END,
            updated_at = NOW()
        WHERE user_id = $1 AND id = $2
        RETURNING *
    `, [
        userId, id, status,
        extra.offer_type || null,
        extra.link_used || null,
        extra.comment_text || null,
        extra.comment_status || null,
        extra.error_message ?? null,
        extra.attempts ?? null,
    ]);
    return res.rows[0] || null;
}

/** Quantos comentários promocionais um usuário enviou numa plataforma/conta dentro da janela (minutos). */
export async function countRecentPromoComments(userId, platform, accountId, windowMinutes = 1440) {
    const res = await query(`
        SELECT COUNT(*)::int AS n FROM (
            SELECT created_at FROM promo_comment_log
            WHERE user_id = $1 AND platform = $2 AND account_id = $3 AND send_status = 'sent'
            UNION
            SELECT monetized_at FROM champion_posts
            WHERE user_id = $1 AND platform = $2 AND account_id = $3 AND monetized_at IS NOT NULL
        ) t
        WHERE t.created_at >= NOW() - ($4 || ' minutes')::interval
    `, [userId, platform, String(accountId), windowMinutes]);
    return res.rows[0]?.n || 0;
}

/** Último comentário promocional enviado para uma conta (para respeitar intervalo mínimo). */
export async function getLastPromoCommentAt(userId, platform, accountId) {
    const res = await query(`
        SELECT MAX(ts) AS last_at FROM (
            SELECT MAX(updated_at) AS ts FROM promo_comment_log
            WHERE user_id = $1 AND platform = $2 AND account_id = $3 AND send_status = 'sent'
            UNION ALL
            SELECT MAX(monetized_at) AS ts FROM champion_posts
            WHERE user_id = $1 AND platform = $2 AND account_id = $3 AND monetized_at IS NOT NULL
        ) t
    `, [userId, platform, String(accountId)]);
    return res.rows[0]?.last_at || null;
}

/** Resumo/métricas do painel de campeões. */
export async function getChampionStats(userId) {
    const res = await query(`
        SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'monitoring')::int AS monitoring,
            COUNT(*) FILTER (WHERE status = 'identified')::int AS identified,
            COUNT(*) FILTER (WHERE status = 'commented')::int AS commented,
            COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
            COUNT(*) FILTER (WHERE status = 'awaiting_config')::int AS awaiting_config
        FROM champion_posts WHERE user_id = $1
    `, [userId]);
    return res.rows[0];
}

/** Quantidade de comentários enviados hoje pelo usuário (métrica agregada). */
export async function countChampionCommentsSentToday(userId) {
    const res = await query(`
        SELECT COUNT(*)::int AS n FROM champion_posts
        WHERE user_id = $1 AND monetized_at >= CURRENT_DATE
    `, [userId]);
    return res.rows[0]?.n || 0;
}

export async function getPromoHistory(userId, { limit = 50, platform = null, accountId = null } = {}) {    const conds = ['user_id = $1'];
    const vals = [userId];
    if (platform) { vals.push(platform); conds.push(`platform = $${vals.length}`); }
    if (accountId) { vals.push(String(accountId)); conds.push(`account_id = $${vals.length}`); }
    vals.push(Math.min(Math.max(parseInt(limit) || 50, 1), 200));
    const res = await query(`
        SELECT * FROM promo_comment_log WHERE ${conds.join(' AND ')}
        ORDER BY id DESC LIMIT $${vals.length}
    `, vals);
    return res.rows;
}

// Pausa (pending -> paused) ou reativa (paused -> pending) um post da fila.
// O worker só coleta status='pending', então 'paused' é ignorado com segurança.
export async function setDownloaderSchedulePaused(id, userId, paused) {
    const target = paused ? 'paused' : 'pending';
    const from = paused ? 'pending' : 'paused';
    const res = await query(`
        UPDATE downloader_schedule
        SET status = $1
        WHERE id = $2 AND user_id = $3 AND status = $4
        RETURNING *
    `, [target, id, userId, from]);
    return res.rows[0] || null;
}

// Reagenda um post (muda scheduled_at). Vale para pending/paused/failed.
export async function updateDownloaderScheduleDateTime(id, userId, scheduledAt) {
    const res = await query(`
        UPDATE downloader_schedule
        SET scheduled_at = $1
        WHERE id = $2 AND user_id = $3 AND status IN ('pending', 'paused', 'failed')
        RETURNING *
    `, [scheduledAt, id, userId]);
    return res.rows[0] || null;
}

// Duplica um post da fila (novo id, status pending). Se scheduledAt não for
// informado, coloca no fim da fila da mesma conta (+30min do último pendente).
export async function duplicateDownloaderSchedule(id, userId, scheduledAt = null) {
    const src = await query(`SELECT * FROM downloader_schedule WHERE id = $1 AND user_id = $2`, [id, userId]);
    const orig = src.rows[0];
    if (!orig) return null;

    let when = scheduledAt;
    if (!when) {
        const latest = await query(`
            SELECT MAX(scheduled_at) AS latest FROM downloader_schedule
            WHERE user_id = $1 AND platform = $2 AND account_id = $3 AND status IN ('pending', 'paused')
        `, [userId, orig.platform, orig.account_id]);
        const base = latest.rows[0]?.latest ? new Date(latest.rows[0].latest) : new Date();
        when = new Date(base.getTime() + 30 * 60 * 1000).toISOString();
    }

    const res = await query(`
        INSERT INTO downloader_schedule(user_id, source_url, media_url, media_type, source_platform, platform, account_id, caption, scheduled_at, is_trial, comment_link_in_post, shopee_link, enable_royalties, royalty_music_urls, royalty_volume, custom_comment_phrases)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        RETURNING *
    `, [userId, orig.source_url, orig.media_url, orig.media_type, orig.source_platform, orig.platform, orig.account_id, orig.caption, when, orig.is_trial, orig.comment_link_in_post, orig.shopee_link, orig.enable_royalties, orig.royalty_music_urls, orig.royalty_volume, orig.custom_comment_phrases]);
    return res.rows[0];
}

export async function getAccountQueueInfo(accountId, userId, platform = null) {
    const params = [accountId, userId];
    let sql = `
        SELECT 
            COUNT(*) AS total,
            MIN(scheduled_at) AS earliest,
            MAX(scheduled_at) AS latest
        FROM downloader_schedule
        WHERE account_id = $1 AND user_id = $2 AND status = 'pending'
    `;
    if (platform) {
        sql += ` AND platform = $3`;
        params.push(String(platform));
    }
    const res = await query(sql, params);
    return res.rows[0];
}

export async function addDownloaderScheduleBatch(items, userId) {
    const inserted = [];
    for (const data of items) {
        const res = await query(`
            INSERT INTO downloader_schedule(user_id, source_url, media_url, media_type, source_platform, platform, account_id, caption, scheduled_at, is_trial, comment_link_in_post, shopee_link, enable_royalties, royalty_music_urls, royalty_volume, custom_comment_phrases)
            VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            RETURNING *
        `, [
            userId, 
            data.sourceUrl, 
            data.mediaUrl, 
            data.mediaType, 
            data.sourcePlatform || 'video', 
            data.platform, 
            data.accountId, 
            data.caption || '', 
            data.scheduledAt, 
            data.isTrial || false,
            data.commentLinkInPost || false,
            data.shopeeLink || null,
            data.enableRoyalties || false,
            data.royaltyMusicUrls || null,
            data.royaltyVolume !== undefined ? data.royaltyVolume : 0.25,
            data.customCommentPhrases || null
        ]);
        inserted.push(res.rows[0]);
    }
    return inserted;
}

export async function shiftDownloaderQueue(failedTaskId, userId) {
    // 1. Get the failed task
    const taskRes = await query(`SELECT * FROM downloader_schedule WHERE id = $1 AND user_id = $2`, [failedTaskId, userId]);
    if (taskRes.rows.length === 0) return false;
    const failedTask = taskRes.rows[0];

    // 2. Find all subsequent pending tasks for the same platform & account_id
    const subsequentRes = await query(`
        SELECT * FROM downloader_schedule 
        WHERE user_id = $1 AND platform = $2 AND account_id = $3 AND status = 'pending' AND id != $4 AND scheduled_at >= $5
        ORDER BY scheduled_at ASC, id ASC
    `, [userId, failedTask.platform, failedTask.account_id, failedTaskId, failedTask.scheduled_at]);

    const subsequentTasks = subsequentRes.rows;
    if (subsequentTasks.length === 0) {
        console.log(`[QUEUE SHIFT] No subsequent pending tasks to shift for task ${failedTaskId}`);
        return false;
    }

    console.log(`[QUEUE SHIFT] Shifting queue for task ${failedTaskId}. Found ${subsequentTasks.length} subsequent tasks.`);

    // Construct the chain: [failedTask, task_1, task_2, ..., task_N]
    const chain = [failedTask, ...subsequentTasks];

    // Begin Transaction
    await query('BEGIN');
    try {
        for (let i = 0; i < chain.length - 1; i++) {
            const current = chain[i];
            const next = chain[i + 1];

            await query(`
                UPDATE downloader_schedule
                SET source_url = $1,
                    media_url = $2,
                    media_type = $3,
                    source_platform = $4,
                    caption = $5,
                    is_trial = $6,
                    comment_link_in_post = $7,
                    shopee_link = $8,
                    status = 'pending', -- Reset the first/failed element or keep pending for others
                    error_message = NULL
                WHERE id = $9
            `, [
                next.source_url,
                next.media_url,
                next.media_type,
                next.source_platform,
                next.caption,
                next.is_trial,
                next.comment_link_in_post,
                next.shopee_link,
                current.id
            ]);
        }

        // Delete the last task in the chain since its content has been shifted forward
        const lastTask = chain[chain.length - 1];
        await query(`DELETE FROM downloader_schedule WHERE id = $1`, [lastTask.id]);
        
        await query('COMMIT');
        console.log(`[QUEUE SHIFT] Successfully shifted queue. Deleted last task ${lastTask.id}.`);
        return true;
    } catch (err) {
        await query('ROLLBACK');
        console.error('[QUEUE SHIFT] Error shifting queue:', err.message);
        throw err;
    }
}

// ============================================
// AUTOMATION QUEUE FUNCTIONS
// ============================================

export async function addToAutomationQueue(scheduleId, platform, plannedTime, userId) {
    const queryStr = `
        INSERT INTO automation_execution_queue(schedule_id, platform, planned_time, user_id, status)
        VALUES($1, $2, $3, $4, 'pending')
        ON CONFLICT (schedule_id, planned_time) DO NOTHING
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
    if (userId) {
        return await query(
            'DELETE FROM automation_execution_queue WHERE schedule_id = $1 AND user_id = $2 AND status = \'pending\'',
            [scheduleId, userId]
        );
    } else {
        return await query(
            'DELETE FROM automation_execution_queue WHERE schedule_id = $1 AND status = \'pending\'',
            [scheduleId]
        );
    }
}

export async function clearFutureAutomationQueue(scheduleId, userId, threshold) {
    if (userId) {
        return await query(
            'DELETE FROM automation_execution_queue WHERE schedule_id = $1 AND user_id = $2 AND status = \'pending\' AND planned_time > $3',
            [scheduleId, userId, threshold]
        );
    } else {
        return await query(
            'DELETE FROM automation_execution_queue WHERE schedule_id = $1 AND status = \'pending\' AND planned_time > $2',
            [scheduleId, threshold]
        );
    }
}

export async function clearOldPendingTasks(scheduleId, localNow) {
    // Delete tasks that are pending and planned for more than 30 minutes ago
    const queryStr = `
        DELETE FROM automation_execution_queue 
        WHERE schedule_id = $1 
        AND status = 'pending' 
        AND planned_time < $2::TIMESTAMP - INTERVAL '4 hours'
    `;
    return await query(queryStr, [scheduleId, localNow]);
}

export async function getPendingAutomationTasks(localNow) {
    const res = await query(
        'SELECT * FROM automation_execution_queue WHERE status = \'pending\' AND planned_time <= $1 ORDER BY planned_time ASC',
        [localNow]
    );
    return res.rows;
}

export async function markAutomationTaskComplete(id, errorMessage = null) {
    const status = errorMessage ? 'failed' : 'completed';
    return await query(
        'UPDATE automation_execution_queue SET status = $1, error_message = $2, executed_at = NOW() WHERE id = $3',
        [status, errorMessage, id]
    );
}

export async function hasTaskInTimeRange(scheduleId, startTime, endTime) {
    const queryStr = `
        SELECT COUNT(*) as count 
        FROM automation_execution_queue 
        WHERE schedule_id = $1 AND planned_time >= $2 AND planned_time <= $3
    `;
    const res = await query(queryStr, [scheduleId, startTime, endTime]);
    return parseInt(res.rows[0].count) > 0;
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
 * Get history of sent products
 */
export async function getSentProducts(userId, limit = 100) {
    const queryStr = `
        SELECT * FROM sent_products 
        WHERE user_id = $1 
        ORDER BY sent_at DESC 
        LIMIT $2
    `;
    const res = await query(queryStr, [userId, limit]);
    return res.rows;
}

/**
 * Get products sent in the last N hours
 */
export async function getProductsSentInLastHours(hours = 24, userId, localNow) {
    const queryStr = `
        SELECT DISTINCT product_id
        FROM sent_products
        WHERE sent_at >= $3::TIMESTAMP - ($1 || ' hours')::INTERVAL
        AND user_id = $2
    `;

    const res = await query(queryStr, [hours, userId, localNow]);
    return res.rows.map(row => row.product_id);
}

/**
 * Check if a product was sent today
 */
export async function wasProductSentToday(productId, userId, localNow) {
    const queryStr = `
        SELECT COUNT(*) as count
        FROM sent_products
        WHERE product_id = $1
        AND DATE(sent_at) = DATE($3::TIMESTAMP)
        AND user_id = $2
    `;

    const res = await query(queryStr, [productId, userId, localNow]);
    return parseInt(res.rows[0].count) > 0;
}

// ============================================
// ANALYTICS FUNCTIONS
// ============================================

/**
 * Log an analytics event
 */
export async function logEvent(eventType, data = {}, userId) {
    let metadataStr = null;
    try {
        // Strip out some fields that are already in columns so we don't duplicate
        const { productId, groupId, success, errorMessage, ...metadataObj } = data;
        if (Object.keys(metadataObj).length > 0) {
            metadataStr = JSON.stringify(metadataObj);
        }
    } catch(e) {}

    const queryStr = `
        INSERT INTO analytics_events(event_type, product_id, group_id, success, error_message, metadata, user_id)
        VALUES($1, $2, $3, $4, $5, $6, $7)
    `;

    return await query(queryStr, [
        eventType,
        data.productId || null,
        data.groupId || null,
        data.success === undefined ? null : data.success,
        data.errorMessage || null,
        metadataStr,
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
        AND (event_type LIKE '%_send' OR event_type = 'send')
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

    // Platform distribution
    const platformStats = (await query(`
        SELECT 
            event_type,
            COUNT(*) as count
        FROM analytics_events
        WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL
        AND user_id = $2
        AND (event_type LIKE '%_send' OR event_type = 'send')
        GROUP BY event_type
    `, [days, userId])).rows;

    const statsMap = {
        whatsappSends: 0,
        telegramSends: 0,
        facebookSends: 0,
        instagramSends: 0,
        twitterSends: 0
    };

    platformStats.forEach(s => {
        const type = (s.event_type || '').toLowerCase();
        if (type.includes('whatsapp')) statsMap.whatsappSends += parseInt(s.count);
        else if (type.includes('telegram')) statsMap.telegramSends += parseInt(s.count);
        else if (type.includes('facebook')) statsMap.facebookSends += parseInt(s.count);
        else if (type.includes('instagram')) statsMap.instagramSends += parseInt(s.count);
        else if (type.includes('twitter')) statsMap.twitterSends += parseInt(s.count);
        else if (type === 'send') statsMap.whatsappSends += parseInt(s.count);
    });

    return {
        totalSends: parseInt(totalSends),
        totalCommission: parseFloat(totalCommission),
        successRate: successRate ? parseFloat(successRate) : 100,
        mediaTypes: mediaTypes,
        ...statsMap
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
            metadata,
            created_at as timestamp
        FROM analytics_events
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
    `;

    const res = await query(queryStr, [userId, limit]);
    return res.rows.map(row => {
        let platform = 'system';
        const type = (row.eventType || '').toLowerCase();
        
        if (type.includes('whatsapp')) platform = 'whatsapp';
        else if (type.includes('telegram')) platform = 'telegram';
        else if (type.includes('facebook')) platform = 'facebook';
        else if (type.includes('instagram')) platform = 'instagram';
        else if (type.includes('twitter')) platform = 'twitter';
        else if (row.groupId) platform = 'telegram';

        // Friendly action names
        let action = row.eventType;
        if (type === 'whatsapp_send') action = 'Envio WhatsApp';
        else if (type === 'telegram_send') action = 'Envio Telegram';
        else if (type === 'facebook_send') action = 'Envio Facebook';
        else if (type === 'instagram_send') action = 'Envio Instagram';
        else if (type === 'twitter_send') action = 'Envio Twitter/X';
        else if (type === 'media_download') action = 'Download de Mídia';

        return {
            ...row,
            platform,
            action,
            status: row.success ? 'success' : 'error'
        };
    });
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
        RETURNING *
    `;

    const res = await query(queryStr, [pageId, userId]);

    if (res.rowCount > 0) {
        return { success: true, enabled: res.rows[0].enabled };
    }

    return { success: false };
}

/**
 * Enable one page and disable all others for a user
 */
export async function selectExclusiveFacebookPage(pageId, userId) {
    // 1. Disable all
    await query('UPDATE facebook_pages SET enabled = FALSE WHERE user_id = $1', [userId]);
    
    // 2. Enable the selected one
    const res = await query(`
        UPDATE facebook_pages 
        SET enabled = TRUE 
        WHERE id = $1 AND user_id = $2 
        RETURNING *
    `, [pageId, userId]);
    
    return res.rows[0];
}

// ============================================
// SCHEDULES FUNCTIONS
// ============================================

export async function saveSchedule(platform, config, userId) {
    // 1. Check if a schedule already exists for this platform/user
    const checkRes = await query(
        'SELECT id FROM schedules WHERE platform = $1 AND user_id = $2 LIMIT 1',
        [platform, userId]
    );

    const active = config.schedule?.enabled !== false;
    const configStr = JSON.stringify(config);

    if (checkRes.rowCount > 0) {
        // 2. Update existing
        const id = checkRes.rows[0].id;
        await query(
            'UPDATE schedules SET config = $1, active = $2, user_id = $4 WHERE id = $3',
            [configStr, active, id, userId]
        );
        return { id, success: true, updated: true };
    }

    // 3. Insert new
    const res = await query(
        'INSERT INTO schedules(platform, config, active, user_id) VALUES($1, $2, $3, $4) RETURNING id',
        [platform, configStr, active, userId]
    );

    return { id: res.rows[0].id, success: true, updated: false };
}

export async function updateScheduleConfig(id, config, userId) {
    const queryStr = `
        UPDATE schedules 
        SET config = $1 
        WHERE id = $2 AND user_id = $3
    `;
    return await query(queryStr, [JSON.stringify(config), id, userId]);
}

/**
 * Get all schedules with next execution time
 */
export async function getSchedules(userId, localNow) {
    const queryStr = `
        SELECT s.id, s.platform, s.config, s.active, s.created_at as "createdAt",
        (SELECT MIN(planned_time) 
         FROM automation_execution_queue 
         WHERE schedule_id = s.id 
         AND status = 'pending' 
         AND planned_time > $2::TIMESTAMP) as "nextExecution",
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

    const res = await query(queryStr, [userId, localNow]);
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
export async function getPendingInstagramVideos(localNow) {
    const queryStr = `
        SELECT * FROM instagram_queue 
        WHERE status = 'pending'
        AND (scheduled_time IS NULL OR scheduled_time <= $1)
        ORDER BY created_at ASC
    `;
    const res = await query(queryStr, [localNow]);
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
        WHERE id = $${i++} AND ( IS NULL OR user_id =  OR (SELECT role FROM users WHERE id = ) = 'admin')$${i++}
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
export async function getPendingFacebookVideos(localNow) {
    const queryStr = `
        SELECT * FROM facebook_reels_queue 
        WHERE status = 'pending'
        AND (scheduled_time IS NULL OR scheduled_time <= $1)
        ORDER BY created_at ASC
    `;
    const res = await query(queryStr, [localNow]);
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
        WHERE id = $${i++} AND ( IS NULL OR user_id =  OR (SELECT role FROM users WHERE id = ) = 'admin')$${i++}
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
export async function getDueStories(localNow) {
    const queryStr = `
        SELECT sq.*, u.id as user_id
        FROM story_queue sq
        JOIN users u ON sq.user_id = u.id
        WHERE sq.status = 'pending'
        AND (sq.scheduled_time IS NULL OR sq.scheduled_time <= $1)
        ORDER BY sq.scheduled_time ASC NULLS FIRST
    `;
    const res = await query(queryStr, [localNow]);
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

export async function toggleInstagramAccount(id, userId) {
    // Primeiro desativa todas as contas do usuário para garantir seleção única (opcional, mas a UI parece esperar isso)
    // Se quiser permitir múltiplas contas ativas, remova o primeiro update.
    await query('UPDATE instagram_accounts SET enabled = FALSE WHERE user_id = $1', [userId]);
    
    const res = await query(`
        UPDATE instagram_accounts 
        SET enabled = TRUE
        WHERE id = $1 AND user_id = $2
        RETURNING *
    `, [id, userId]);
    return res.rows[0];
}

export async function removeInstagramAccount(id, userId) {
    await query('DELETE FROM instagram_accounts WHERE id = $1 AND user_id = $2', [id, userId]);
    return { success: true };
}

// ============================================
// TREND SEARCHES (Radar de Conteudo Viral)
// ============================================

export async function saveTrendSearch(userId, { query: qText, detectedNiche, sources, count, items = [] } = {}) {
    const res = await query(`
        INSERT INTO trend_searches (user_id, query, detected_niche, sources, count, created_at)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
        RETURNING id
    `, [userId, qText, detectedNiche || null, sources || [], count || 0]);
    const searchId = res.rows[0].id;

    for (const it of items) {
        await query(`
            INSERT INTO trend_search_items (search_id, platform, item_id, title, views, likes, comments, channel, url, thumbnail, duration, published_at, selected, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)
        `, [
            searchId,
            it.platform,
            it.id,
            it.title || '',
            it.views || 0,
            it.likes || 0,
            it.comments || 0,
            it.channel || null,
            it.url || null,
            it.thumbnail || null,
            it.duration || 0,
            it.publishedAt || null,
            !!it.selected
        ]);
    }

    return { success: true, id: searchId };
}

export async function getTrendSearches(userId) {
    const res = await query(`
        SELECT s.*, COUNT(i.id) as items_count
        FROM trend_searches s
        LEFT JOIN trend_search_items i ON i.search_id = s.id
        WHERE s.user_id = $1
        GROUP BY s.id
        ORDER BY s.created_at DESC
    `, [userId]);
    return res.rows.map(r => ({
        ...r,
        // sources pode vir como string JSON (text) ou array
        sources: Array.isArray(r.sources)
            ? r.sources
            : (() => { try { const p = JSON.parse(r.sources); return Array.isArray(p) ? p : []; } catch { return []; } })(),
        items_count: Number(r.items_count) || 0
    }));
}

export async function getTrendSearchItems(searchId, userId) {
    const search = await query('SELECT id FROM trend_searches WHERE id = $1 AND user_id = $2', [searchId, userId]);
    if (search.rows.length === 0) return [];
    const res = await query('SELECT * FROM trend_search_items WHERE search_id = $1 ORDER BY created_at DESC', [searchId]);
    return res.rows;
}

export async function deleteTrendSearch(searchId, userId) {
    await query('DELETE FROM trend_search_items WHERE search_id IN (SELECT id FROM trend_searches WHERE id = $1 AND user_id = $2)', [searchId, userId]);
    await query('DELETE FROM trend_searches WHERE id = $1 AND user_id = $2', [searchId, userId]);
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
        INSERT INTO pinterest_accounts (username, access_token, login_method, user_id) 
        VALUES ($1, $2, 'official', $3)
        RETURNING id
    `;
    const res = await query(queryStr, [username, accessToken, userId]);
    return { success: true, id: res.rows[0].id };
}

export async function savePinterestAccountCookie(username, cookiesJson, userId) {
    const checkRes = await query('SELECT id FROM pinterest_accounts WHERE username = $1 AND user_id = $2', [username, userId]);
    if (checkRes.rows.length > 0) {
        await query(
            'UPDATE pinterest_accounts SET cookies = $1, login_method = $2, access_token = NULL WHERE username = $3 AND user_id = $4',
            [cookiesJson, 'cookie', username, userId]
        );
        return { success: true, id: checkRes.rows[0].id };
    } else {
        const insertRes = await query(
            'INSERT INTO pinterest_accounts (username, cookies, login_method, access_token, user_id) VALUES ($1, $2, $3, NULL, $4) RETURNING id',
            [username, cookiesJson, 'cookie', userId]
        );
        return { success: true, id: insertRes.rows[0].id };
    }
}

export async function getPinterestAccounts(userId) {
    const queryStr = `
        SELECT id, username, access_token as "accessToken", cookies, login_method as "loginMethod", enabled, added_at as "addedAt" 
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
    savePinterestAccountCookie,
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
    incrementShopeeBioClick,
    addMlBioLink,
    getMlBioLinks,
    deleteMlBioLink,
    incrementMlBioClick,
    getMlBioSettings,
    getMlBioSettingsBySlug,
    saveMlBioSettings,
    getMlCategories,
    addMlCategory,
    updateMlCategory,
    deleteMlCategory
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


// --- SHOPEE CATEGORIES FUNCTIONS ---
export async function getShopeeCategories(onlyActive = false) {
    let q = 'SELECT * FROM shopee_categories';
    if (onlyActive) q += ' WHERE is_active = TRUE';
    q += ' ORDER BY name ASC';
    const res = await query(q);
    return res.rows;
}

export async function getLastExecutionTime(scheduleId) {
    const res = await query(
        'SELECT planned_time FROM automation_execution_queue WHERE schedule_id = $1 AND status = \'completed\' ORDER BY planned_time DESC LIMIT 1',
        [scheduleId]
    );
    return res.rows[0]?.planned_time ? new Date(res.rows[0].planned_time) : null;
}

export async function addShopeeCategory(name, slug, keywords) {
    const res = await query('INSERT INTO shopee_categories (name, slug, keywords) VALUES ($1, $2, $3) RETURNING *', [name, slug, keywords]);
    return res.rows[0];
}

export async function updateShopeeCategory(id, data) {
    const { name, slug, keywords, is_active } = data;
    const res = await query('UPDATE shopee_categories SET name = $1, slug = $2, keywords = $3, is_active = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5 RETURNING *', [name, slug, keywords, is_active, id]);
    return res.rows[0];
}

export async function deleteShopeeCategory(id) {
    return await query('DELETE FROM shopee_categories WHERE id = $1', [id]);
}


// ============================================
// NOTIFICATIONS FUNCTIONS
// ============================================

export async function addNotificationDB(userId, type, module, title, message) {
    const res = await query(`
        INSERT INTO notifications (user_id, type, module, title, message)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
    `, [userId, type, module, title, message]);
    return res.rows[0];
}


export async function getNotificationsDB(userId, limit = 50) {
    const res = await query(`
        SELECT * FROM notifications
        WHERE user_id = $1 OR user_id IS NULL
        ORDER BY created_at DESC
        LIMIT $2
    `, [userId, limit]);
    return res.rows;
}

export async function getUnreadNotificationsCountDB(userId) {
    const res = await query(`
        SELECT COUNT(*) as count FROM notifications
        WHERE (user_id = $1 OR user_id IS NULL) AND read = FALSE
    `, [userId]);
    return parseInt(res.rows[0].count);
}

export async function markNotificationAsReadDB(id, userId) {
    return await query(`
        UPDATE notifications
        SET read = TRUE
        WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)
    `, [id, userId]);
}

export async function markAllNotificationsAsReadDB(userId) {
    return await query(`
        UPDATE notifications
        SET read = TRUE
        WHERE user_id = $1 OR user_id IS NULL
    `, [userId]);
}

export async function deleteNotificationDB(id, userId) {
    return await query(`
        DELETE FROM notifications
        WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)
    `, [id, userId]);
}

export async function clearAllNotificationsDB(userId) {
    return await query(`
        DELETE FROM notifications
        WHERE user_id = $1
    `, [userId]);
}

// ============================================
// NOTIFICATION SETTINGS FUNCTIONS
// ============================================

export async function getNotificationSettings(userId) {
    if (!userId) return null;
    try {
        const res = await query('SELECT * FROM notification_settings WHERE user_id = $1', [userId]);
        if (res.rows.length === 0) {
            // Create default settings if not exists
            const defaultSettings = await query(`
                INSERT INTO notification_settings (user_id)
                VALUES ($1)
                RETURNING *
            `, [userId]);
            return defaultSettings.rows[0];
        }
        return res.rows[0];
    } catch (error) {
        console.error('[DB] Error getting notification settings:', error);
        return null;
    }
}

export async function updateNotificationSettings(userId, settings) {
    if (!userId) return null;
    try {
        const fields = Object.keys(settings)
            .filter(key => key !== 'user_id' && key !== 'updated_at')
            .map((key, i) => `${key} = $${i + 2}`)
            .join(', ');
        const values = Object.keys(settings)
            .filter(key => key !== 'user_id' && key !== 'updated_at')
            .map(key => settings[key]);
            
        if (fields.length === 0) return null;

        const res = await query(`
            UPDATE notification_settings 
            SET ${fields}, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $1
            RETURNING *
        `, [userId, ...values]);
        
        return res.rows[0];
    } catch (error) {
        console.error('[DB] Error updating notification settings:', error);
        throw error;
    }
}
// ============================================
// THREADS ACCOUNTS FUNCTIONS
// ============================================

export async function getThreadsAccounts(userId) {
    const res = await query('SELECT * FROM threads_accounts WHERE user_id = $1 ORDER BY added_at DESC', [userId]);
    return res.rows;
}

export async function getThreadsAccountById(id, userId) {
    const idStr = String(id);
    let res;
    // Se for um número pequeno (ex: database ID), busca pelo ID primário
    // IDs da Meta são strings numéricas muito longas (> 10 dígitos)
    const isMetaId = idStr.length > 10 || isNaN(Number(id));
    
    if (isMetaId) {
        res = await query('SELECT * FROM threads_accounts WHERE account_id = $1 AND user_id = $2', [idStr, userId]);
    } else {
        res = await query('SELECT * FROM threads_accounts WHERE id = $1 AND user_id = $2', [parseInt(id), userId]);
    }
    return res.rows[0];
}

export async function addThreadsAccount(name, token, accountId, username, profilePic, userId, expiresAt = null, tokenType = 'short_lived') {
    const res = await query(`
        INSERT INTO threads_accounts (name, access_token, account_id, username, profile_picture_url, user_id, expires_at, token_type)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (account_id) DO UPDATE SET
            name = EXCLUDED.name,
            access_token = EXCLUDED.access_token,
            username = EXCLUDED.username,
            profile_picture_url = EXCLUDED.profile_picture_url,
            expires_at = EXCLUDED.expires_at,
            token_type = EXCLUDED.token_type,
            added_at = CURRENT_TIMESTAMP
        RETURNING *
    `, [name, token, accountId, username, profilePic, userId, expiresAt, tokenType]);
    return res.rows[0];
}

export async function removeThreadsAccount(id, userId) {
    return await query('DELETE FROM threads_accounts WHERE id = $1 AND user_id = $2', [id, userId]);
}

export async function updateThreadsAccountStatus(accountId, status, error = null) {
    return await query('UPDATE threads_accounts SET status = $1, last_error = $2 WHERE account_id = $3', [status, error, accountId]);
}

// ============================================
// ACCOUNT ASSOCIATIONS FUNCTIONS
// ============================================

export async function getAccountAssociations(userId) {
    const res = await query('SELECT * FROM account_associations WHERE user_id = $1', [userId]);
    return res.rows;
}

export async function addAccountAssociation(userId, a_plat, a_id, b_plat, b_id) {
    // Add A -> B
    await query(`
        INSERT INTO account_associations (user_id, account_a_platform, account_a_id, account_b_platform, account_b_id)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (user_id, account_a_platform, account_a_id, account_b_platform, account_b_id) DO NOTHING
    `, [userId, a_plat, a_id, b_plat, b_id]);

    // Add B -> A (Symmetric)
    await query(`
        INSERT INTO account_associations (user_id, account_a_platform, account_a_id, account_b_platform, account_b_id)
        VALUES ($1, $4, $5, $2, $3)
        ON CONFLICT (user_id, account_a_platform, account_a_id, account_b_platform, account_b_id) DO NOTHING
    `, [userId, a_plat, a_id, b_plat, b_id]);

    return { success: true };
}

export async function removeAccountAssociation(userId, a_plat, a_id, b_plat, b_id) {
    await query(`
        DELETE FROM account_associations 
        WHERE user_id = $1 
        AND (
            (account_a_platform = $2 AND account_a_id = $3 AND account_b_platform = $4 AND account_b_id = $5)
            OR
            (account_a_platform = $4 AND account_a_id = $5 AND account_b_platform = $2 AND account_b_id = $3)
        )
    `, [userId, a_plat, a_id, b_plat, b_id]);
    return { success: true };
}
// ============================================
// SHORT LINKS (CLOAKING) FUNCTIONS
// ============================================

export async function createShortLink(slug, targetUrl, userId, maxClicks = null, expiresAt = null, ref = {}) {
    const res = await query(`
        INSERT INTO short_links (slug, target_url, user_id, max_clicks, expires_at, source_type, source_id, platform, account_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (slug) DO UPDATE SET 
            target_url = EXCLUDED.target_url, 
            max_clicks = EXCLUDED.max_clicks, 
            expires_at = EXCLUDED.expires_at,
            source_type = COALESCE(EXCLUDED.source_type, short_links.source_type),
            source_id = COALESCE(EXCLUDED.source_id, short_links.source_id),
            platform = COALESCE(EXCLUDED.platform, short_links.platform),
            account_id = COALESCE(EXCLUDED.account_id, short_links.account_id)
        RETURNING *
    `, [slug, targetUrl, userId, maxClicks || null, expiresAt || null,
        ref.sourceType || null, ref.sourceId || null, ref.platform || null, ref.accountId || null]);
    return res.rows[0];
}

/**
 * Soma os cliques dos links atribuidos a cada post de uma origem.
 * Retorna um mapa { [sourceId]: cliques }.
 */
export async function getClicksBySource(userId, sourceType, ids = []) {
    const clean = (ids || []).map(Number).filter(n => Number.isInteger(n));
    if (clean.length === 0) return {};
    const res = await query(
        `SELECT source_id, COALESCE(SUM(clicks),0)::int AS clicks
         FROM short_links
         WHERE user_id = $1 AND source_type = $2 AND source_id = ANY($3::int[])
         GROUP BY source_id`,
        [userId, sourceType, clean]
    );
    const map = {};
    for (const r of res.rows) map[r.source_id] = r.clicks;
    return map;
}

/**
 * Backfill: atribui links curtos existentes (sem origem) aos posts agendados,
 * casando pelo link de destino (== shopee_link do post) e pela data de criacao.
 */
export async function assignShortLinkSources(userId, { days = 30, toleranceHours = 3 } = {}) {
    const links = (await query(
        `SELECT id, target_url, created_at FROM short_links
         WHERE user_id = $1 AND source_type IS NULL AND created_at >= NOW() - ($2 || ' days')::interval`,
        [userId, days]
    )).rows;
    const posts = (await query(
        `SELECT id, shopee_link, posted_at FROM downloader_schedule
         WHERE user_id = $1 AND status = 'completed' AND shopee_link IS NOT NULL AND posted_at IS NOT NULL
           AND posted_at >= NOW() - ($2 || ' days')::interval`,
        [userId, days]
    )).rows;

    const result = { links: links.length, posts: posts.length, matched: 0 };
    if (!links.length || !posts.length) return result;

    const pairs = [];
    for (const link of links) {
        const lt = new Date(link.created_at).getTime();
        for (const post of posts) {
            if (String(post.shopee_link).trim() !== String(link.target_url).trim()) continue;
            const diff = Math.abs(new Date(post.posted_at).getTime() - lt);
            if (diff <= toleranceHours * 3600 * 1000) pairs.push({ link, post, diff });
        }
    }
    pairs.sort((a, b) => a.diff - b.diff);

    const usedLinks = new Set(), usedPosts = new Set();
    for (const pr of pairs) {
        if (usedLinks.has(pr.link.id) || usedPosts.has(pr.post.id)) continue;
        usedLinks.add(pr.link.id);
        usedPosts.add(pr.post.id);
        await query(
            `UPDATE short_links SET source_type = 'downloader_schedule', source_id = $1 WHERE id = $2`,
            [pr.post.id, pr.link.id]
        );
        result.matched++;
    }
    return result;
}

export async function getShortLink(slug) {
    const res = await query('SELECT * FROM short_links WHERE slug = $1', [slug]);
    return res.rows[0];
}

export async function incrementShortLinkClicks(slug) {
    return await query('UPDATE short_links SET clicks = clicks + 1 WHERE slug = $1', [slug]);
}

export async function getShortLinksByUser(userId) {
    const res = await query('SELECT * FROM short_links WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    return res.rows;
}

export async function deleteShortLink(id, userId) {
    return await query('DELETE FROM short_links WHERE id = $1 AND user_id = $2', [id, userId]);
}

export async function logShortLinkClick(linkId, metadata) {
    const { ipAddress, userAgent, country, region, city, referrer, isBot, deviceType } = metadata;
    await query(`
        INSERT INTO short_link_clicks (link_id, ip_address, user_agent, country, region, city, referrer, is_bot, device_type)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [linkId, ipAddress, userAgent, country, region, city, referrer, isBot ? 1 : 0, deviceType || 'Desconhecido']);
}

export async function updateShortLinkTarget(id, targetUrl, maxClicks, expiresAt, userId) {
    const res = await query(`
        UPDATE short_links 
        SET target_url = $1, max_clicks = $2, expires_at = $3
        WHERE id = $4 AND user_id = $5
        RETURNING *
    `, [targetUrl, maxClicks || null, expiresAt || null, id, userId]);
    return res.rows[0];
}

export async function getShortLinkStats(linkId, userId) {
    const linkCheck = await query('SELECT * FROM short_links WHERE id = $1 AND user_id = $2', [linkId, userId]);
    if (linkCheck.rows.length === 0) return null;

    const link = linkCheck.rows[0];

    const hourlyRes = await query(`
        SELECT EXTRACT(HOUR FROM clicked_at) AS hour, COUNT(*) AS count
        FROM short_link_clicks
        WHERE link_id = $1 AND COALESCE(is_bot, 0) = 0
        GROUP BY hour
        ORDER BY hour
    `, [linkId]);

    const countriesRes = await query(`
        SELECT COALESCE(country, 'Desconhecido') AS country, COUNT(*) AS count
        FROM short_link_clicks
        WHERE link_id = $1 AND COALESCE(is_bot, 0) = 0
        GROUP BY country
        ORDER BY count DESC
        LIMIT 10
    `, [linkId]);

    const regionsRes = await query(`
        SELECT COALESCE(region, 'Desconhecido') AS region, COUNT(*) AS count
        FROM short_link_clicks
        WHERE link_id = $1 AND COALESCE(is_bot, 0) = 0
        GROUP BY region
        ORDER BY count DESC
        LIMIT 10
    `, [linkId]);

    const citiesRes = await query(`
        SELECT COALESCE(city, 'Desconhecido') AS city, COUNT(*) AS count
        FROM short_link_clicks
        WHERE link_id = $1 AND COALESCE(is_bot, 0) = 0
        GROUP BY city
        ORDER BY count DESC
        LIMIT 10
    `, [linkId]);

    const recentRes = await query(`
        SELECT ip_address, clicked_at, country, region, city, user_agent, referrer, COALESCE(is_bot, 0) AS is_bot, COALESCE(device_type, 'Desconhecido') AS device_type
        FROM short_link_clicks
        WHERE link_id = $1
        ORDER BY clicked_at DESC
        LIMIT 50
    `, [linkId]);

    const devicesRes = await query(`
        SELECT COALESCE(device_type, 'Desconhecido') AS name, COUNT(*) AS count
        FROM short_link_clicks
        WHERE link_id = $1 AND COALESCE(is_bot, 0) = 0
        GROUP BY name
        ORDER BY count DESC
    `, [linkId]);

    return {
        link,
        hourly: hourlyRes.rows.map(r => ({ hour: parseInt(r.hour), count: parseInt(r.count) })),
        countries: countriesRes.rows.map(r => ({ name: r.country, count: parseInt(r.count) })),
        regions: regionsRes.rows.map(r => ({ name: r.region, count: parseInt(r.count) })),
        cities: citiesRes.rows.map(r => ({ name: r.city, count: parseInt(r.count) })),
        devices: devicesRes.rows.map(r => ({ name: r.name, count: parseInt(r.count) })),
        recent: recentRes.rows
    };
}


// ==========================================
// 🔗 LINK DEDUP
// ==========================================

export async function findShortLinkByTargetUrl(userId, targetUrl) {
    let normalized = targetUrl.trim();
    let withoutSlash = normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
    let withSlash = withoutSlash + '/';
    
    const res = await query(
        'SELECT * FROM short_links WHERE user_id = $1 AND target_url IN ($2, $3) ORDER BY created_at DESC LIMIT 1',
        [userId, withoutSlash, withSlash]
    );
    return res.rows[0] || null;
}

// ==========================================
// 🚦 PLATFORM LIMITS & USAGE
// ==========================================

const PLATFORM_DEFAULTS = [
    { platform: 'instagram', limit_type: 'reels',       daily_max: 5,   label: 'Reels' },
    { platform: 'instagram', limit_type: 'trial_reels', daily_max: 10,  label: 'Trial Reels' },
    { platform: 'instagram', limit_type: 'feed',        daily_max: 10,  label: 'Posts Feed' },
    { platform: 'facebook',  limit_type: 'reels',       daily_max: 5,   label: 'Reels' },
    { platform: 'facebook',  limit_type: 'feed',        daily_max: 10,  label: 'Posts Feed' },
    { platform: 'whatsapp',  limit_type: 'messages',    daily_max: 50,  label: 'Mensagens' },
    { platform: 'telegram',  limit_type: 'messages',    daily_max: 100, label: 'Mensagens' },
    { platform: 'twitter',   limit_type: 'tweets',      daily_max: 15,  label: 'Tweets' },
    { platform: 'youtube',   limit_type: 'shorts',      daily_max: 3,   label: 'Shorts' },
    { platform: 'threads',   limit_type: 'posts',       daily_max: 10,  label: 'Posts' },
    { platform: 'pinterest', limit_type: 'pins',        daily_max: 25,  label: 'Pins' },
    { platform: 'tiktok',    limit_type: 'posts',       daily_max: 15,  label: 'Videos' },
];

export async function migratePlatformLimits() {
    await query(`
        CREATE TABLE IF NOT EXISTS platform_limits (
            id         SERIAL PRIMARY KEY,
            user_id    INTEGER NOT NULL,
            platform   VARCHAR(50) NOT NULL,
            limit_type VARCHAR(50) NOT NULL,
            account_id VARCHAR(100) NOT NULL DEFAULT 'default',
            daily_max  INTEGER NOT NULL DEFAULT 10,
            is_enabled BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);
    
    try {
        await query(`ALTER TABLE platform_limits ADD COLUMN IF NOT EXISTS account_id VARCHAR(100) NOT NULL DEFAULT 'default'`);
        await query(`ALTER TABLE platform_limits DROP CONSTRAINT IF EXISTS platform_limits_user_id_platform_limit_type_key`);
        await query(`ALTER TABLE platform_limits ADD CONSTRAINT platform_limits_user_account_limit UNIQUE (user_id, platform, limit_type, account_id)`);
    } catch (e) {
        // Ignore if constraint already exists
    }

    await query(`
        CREATE TABLE IF NOT EXISTS platform_usage (
            id         SERIAL PRIMARY KEY,
            user_id    INTEGER NOT NULL,
            platform   VARCHAR(50) NOT NULL,
            limit_type VARCHAR(50) NOT NULL,
            account_id VARCHAR(100) NOT NULL DEFAULT 'default',
            usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
            count      INTEGER NOT NULL DEFAULT 0
        )
    `);

    try {
        await query(`ALTER TABLE platform_usage ADD COLUMN IF NOT EXISTS account_id VARCHAR(100) NOT NULL DEFAULT 'default'`);
        await query(`ALTER TABLE platform_usage DROP CONSTRAINT IF EXISTS platform_usage_user_id_platform_limit_type_usage_date_key`);
        await query(`ALTER TABLE platform_usage ADD CONSTRAINT platform_usage_user_account_limit UNIQUE (user_id, platform, limit_type, usage_date, account_id)`);
    } catch (e) {
        // Ignore if constraint already exists
    }

    console.log('[DATABASE] Platform limits tables ready');
}

export async function getPlatformLimits(userId) {
    // Ensure defaults exist for this user
    for (const d of PLATFORM_DEFAULTS) {
        await query(`
            INSERT INTO platform_limits (user_id, platform, limit_type, daily_max, is_enabled, account_id)
            VALUES ($1, $2, $3, $4, true, 'default')
            ON CONFLICT (user_id, platform, limit_type, account_id) DO NOTHING
        `, [userId, d.platform, d.limit_type, d.daily_max]);
    }

    const limits = await query(
        "SELECT * FROM platform_limits WHERE user_id = $1 AND account_id = 'default' ORDER BY platform, limit_type",
        [userId]
    );

    // Join with today's aggregated usage across all accounts
    const today = new Date().toISOString().split('T')[0];
    const usage = await query(`
        SELECT platform, limit_type, COALESCE(SUM(count), 0) as count
        FROM platform_usage
        WHERE user_id = $1 AND usage_date = $2
        GROUP BY platform, limit_type
    `, [userId, today]);

    const usageMap = {};
    for (const u of usage.rows) {
        usageMap[`${u.platform}:${u.limit_type}`] = parseInt(u.count);
    }

    return limits.rows.map(l => ({
        ...l,
        used_today: usageMap[`${l.platform}:${l.limit_type}`] || 0
    }));
}

export async function setPlatformLimit(userId, platform, limitType, dailyMax, isEnabled, accountId = 'default') {
    const res = await query(`
        INSERT INTO platform_limits (user_id, platform, limit_type, daily_max, is_enabled, account_id, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (user_id, platform, limit_type, account_id)
        DO UPDATE SET daily_max = $4, is_enabled = $5, updated_at = NOW()
        RETURNING *
    `, [userId, platform, limitType, dailyMax, isEnabled, accountId]);
    return res.rows[0];
}

export async function checkPlatformLimit(userId, platform, limitType, accountId = 'default') {
    const limitRes = await query(
        'SELECT * FROM platform_limits WHERE user_id = $1 AND platform = $2 AND limit_type = $3 AND account_id = $4',
        [userId, platform, limitType, accountId]
    );

    let limit = limitRes.rows[0];
    if (!limit) {
        const defaultLimitRes = await query(
            'SELECT * FROM platform_limits WHERE user_id = $1 AND platform = $2 AND limit_type = $3 AND account_id = \'default\'',
            [userId, platform, limitType]
        );
        limit = defaultLimitRes.rows[0];
    }

    // If no limit configured, allow by default
    if (!limit) return { allowed: true, used: 0, max: null, enabled: false };
    if (!limit.is_enabled) return { allowed: true, used: 0, max: limit.daily_max, enabled: false };

    const today = new Date().toISOString().split('T')[0];
    const usageRes = await query(
        'SELECT count FROM platform_usage WHERE user_id = $1 AND platform = $2 AND limit_type = $3 AND usage_date = $4 AND account_id = $5',
        [userId, platform, limitType, today, accountId]
    );

    const configRes = await query('SELECT value FROM user_config WHERE user_id = $1 AND key = $2', [userId, 'safe_mode_enabled']);
    const isSafeMode = configRes.rows.length > 0 && configRes.rows[0].value === 'true';

    let maxLimit = limit.daily_max;
    if (isSafeMode) {
        maxLimit = Math.max(1, Math.floor(maxLimit / 2));
    }

    const used = usageRes.rows.length > 0 ? parseInt(usageRes.rows[0].count) : 0;
    return {
        allowed: used < maxLimit,
        used,
        max: maxLimit,
        enabled: true,
        safeModeActive: isSafeMode
    };
}

export async function incrementPlatformUsage(userId, platform, limitType, accountId = 'default') {
    const today = new Date().toISOString().split('T')[0];
    await query(`
        INSERT INTO platform_usage (user_id, platform, limit_type, usage_date, count, account_id)
        VALUES ($1, $2, $3, $4, 1, $5)
        ON CONFLICT (user_id, platform, limit_type, usage_date, account_id)
        DO UPDATE SET count = platform_usage.count + 1
    `, [userId, platform, limitType, today, accountId]);
}

export async function resetPlatformUsage(userId, platform, limitType) {
    const today = new Date().toISOString().split('T')[0];
    if (limitType) {
        await query(
            'DELETE FROM platform_usage WHERE user_id = $1 AND platform = $2 AND limit_type = $3 AND usage_date = $4',
            [userId, platform, limitType, today]
        );
    } else {
        await query(
            'DELETE FROM platform_usage WHERE user_id = $1 AND platform = $2 AND usage_date = $3',
            [userId, platform, today]
        );
    }
}

export { PLATFORM_DEFAULTS };

// ========================================================
// MERCADO LIVRE DATABASE HELPER FUNCTIONS
// ========================================================

export async function addMlBioLink(data, userId) {
    const check = await query(`SELECT id FROM ml_bio_links WHERE user_id = $1 AND product_id = $2`, [userId, data.productId]);
    if (check.rows.length > 0) return check.rows[0];

    const res = await query(`
        INSERT INTO ml_bio_links(user_id, product_id, name, image_url, affiliate_link, category)
        VALUES($1, $2, $3, $4, $5, $6)
        RETURNING *
    `, [userId, data.productId, data.name, data.imageUrl, data.affiliateLink, data.category || 'Geral']);
    return res.rows[0];
}

export async function getMlBioLinks(userId, keyword = '') {
    let q = `SELECT * FROM ml_bio_links WHERE user_id = $1 AND is_active = TRUE`;
    let params = [userId];
    
    if (keyword) {
        q += ` AND (name ILIKE $2 OR category ILIKE $2)`;
        params.push(`%${keyword}%`);
    }
    
    q += ` ORDER BY created_at DESC`;
    const res = await query(q, params);
    return res.rows;
}

export async function deleteMlBioLink(id, userId) {
    return await query(`DELETE FROM ml_bio_links WHERE id = $1 AND user_id = $2`, [id, userId]);
}

export async function incrementMlBioClick(id) {
    return await query(`UPDATE ml_bio_links SET clicks = clicks + 1 WHERE id = $1`, [id]);
}

// --- MERCADO LIVRE BIO SETTINGS FUNCTIONS ---
export async function getMlBioSettings(userId) {
    const results = await query('SELECT * FROM ml_bio_settings WHERE user_id = $1', [userId]);
    return results.rows[0] || null;
}

export async function getMlBioSettingsBySlug(slug) {
    const results = await query('SELECT * FROM ml_bio_settings WHERE slug = $1', [slug]);
    return results.rows[0] || null;
}

export async function saveMlBioSettings(userId, settings) {
    const existing = await getMlBioSettings(userId);
    if (existing) {
        return await query(`
            UPDATE ml_bio_settings 
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
            INSERT INTO ml_bio_settings 
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

// --- MERCADO LIVRE CATEGORIES FUNCTIONS ---
export async function getMlCategories(onlyActive = false) {
    let q = 'SELECT * FROM ml_categories';
    if (onlyActive) q += ' WHERE is_active = TRUE';
    q += ' ORDER BY name ASC';
    const res = await query(q);
    return res.rows;
}

export async function addMlCategory(name, slug, keywords) {
    const res = await query('INSERT INTO ml_categories (name, slug, keywords) VALUES ($1, $2, $3) RETURNING *', [name, slug, keywords]);
    return res.rows[0];
}

export async function updateMlCategory(id, data) {
    const { name, slug, keywords, is_active } = data;
    const res = await query('UPDATE ml_categories SET name = $1, slug = $2, keywords = $3, is_active = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5 RETURNING *', [name, slug, keywords, is_active, id]);
    return res.rows[0];
}

export async function deleteMlCategory(id) {
    return await query('DELETE FROM ml_categories WHERE id = $1', [id]);
}

function getTableForPlatform(platform) {
    const mapping = {
        'instagram': 'instagram_accounts',
        'facebook': 'facebook_pages',
        'tiktok': 'tiktok_accounts',
        'youtube': 'youtube_accounts',
        'threads': 'threads_accounts',
        'twitter': 'twitter_accounts',
        'whatsapp': 'whatsapp_accounts',
        'telegram': 'telegram_accounts'
    };
    return mapping[platform.toLowerCase()];
}

// ============================================
// SAFELOCK SAFETY SECURITY FUNCTIONS
// ============================================
export async function getAccountLockStatus(platform, accountId) {
    const table = getTableForPlatform(platform);
    if (!table) return { is_locked: false, consecutive_errors: 0 };
    
    const idField = (table === 'instagram_accounts' || table === 'threads_accounts' || table === 'facebook_pages') ? 'account_id' : 'id';
    const isNumericId = (idField === 'id');
    const queryParam = isNumericId ? (parseInt(accountId) || 0) : String(accountId);
    
    try {
        const res = await query(`SELECT is_locked, consecutive_errors, last_lock_error FROM ${table} WHERE ${idField} = $1`, [queryParam]);
        if (res.rows.length === 0 && idField === 'account_id') {
            const resFallback = await query(`SELECT is_locked, consecutive_errors, last_lock_error FROM ${table} WHERE id = $1`, [parseInt(accountId) || 0]);
            return resFallback.rows[0] || { is_locked: false, consecutive_errors: 0 };
        }
        return res.rows[0] || { is_locked: false, consecutive_errors: 0 };
    } catch (e) {
        console.error(`[LOCK CHECK ERROR] Failed to fetch lock status for ${platform}/${accountId}:`, e.message);
        return { is_locked: false, consecutive_errors: 0 };
    }
}

export async function incrementConsecutiveErrors(platform, accountId, errorMsg) {
    const table = getTableForPlatform(platform);
    if (!table) return;
    
    const idField = (table === 'instagram_accounts' || table === 'threads_accounts' || table === 'facebook_pages') ? 'account_id' : 'id';
    const isNumericId = (idField === 'id');
    const queryParam = isNumericId ? (parseInt(accountId) || 0) : String(accountId);
    
    try {
        let exists = await query(`SELECT id, consecutive_errors FROM ${table} WHERE ${idField} = $1`, [queryParam]);
        if (exists.rows.length === 0 && idField === 'account_id') {
            exists = await query(`SELECT id, consecutive_errors FROM ${table} WHERE id = $1`, [parseInt(accountId) || 0]);
        }
        if (exists.rows.length > 0) {
            const newErrors = (exists.rows[0].consecutive_errors || 0) + 1;
            const isLocked = newErrors >= 5;
            const targetId = exists.rows[0].id;
            
            await query(
                `UPDATE ${table} SET consecutive_errors = $1, is_locked = $2, last_lock_error = $3 WHERE id = $4`,
                [newErrors, isLocked, isLocked ? errorMsg : null, targetId]
            );
            
            console.log(`[SAFELOCK] Account ${platform}/${accountId} consecutive errors: ${newErrors}. Locked? ${isLocked}`);
            return { locked: isLocked, errorsCount: newErrors };
        }
    } catch (e) {
        console.error(`[SAFELOCK ERROR] Failed to increment errors for ${platform}/${accountId}:`, e.message);
    }
}

export async function resetConsecutiveErrors(platform, accountId) {
    const table = getTableForPlatform(platform);
    if (!table) return;
    
    const idField = (table === 'instagram_accounts' || table === 'threads_accounts' || table === 'facebook_pages') ? 'account_id' : 'id';
    const isNumericId = (idField === 'id');
    const queryParam = isNumericId ? (parseInt(accountId) || 0) : String(accountId);
    
    try {
        let exists = await query(`SELECT id FROM ${table} WHERE ${idField} = $1`, [queryParam]);
        if (exists.rows.length === 0 && idField === 'account_id') {
            exists = await query(`SELECT id FROM ${table} WHERE id = $1`, [parseInt(accountId) || 0]);
        }
        if (exists.rows.length > 0) {
            const targetId = exists.rows[0].id;
            await query(
                `UPDATE ${table} SET consecutive_errors = 0, is_locked = FALSE, last_lock_error = NULL WHERE id = $1`,
                [targetId]
            );
            console.log(`[SAFELOCK] Account ${platform}/${accountId} unlocked/reset successfully.`);
        }
    } catch (e) {
        console.error(`[SAFELOCK ERROR] Failed to reset errors for ${platform}/${accountId}:`, e.message);
    }
}

export async function discardAccountBacklog(platform, accountId, userId) {
    try {
        const res = await query(
            `UPDATE downloader_schedule 
             SET status = 'skipped', last_error = 'Pulado por segurança: Conta estava travada (SafeLock)' 
             WHERE user_id = $1 AND platform = $2 AND status IN ('pending', 'failed') AND planned_time < NOW()`,
            [userId, platform]
        );
        console.log(`[SAFELOCK CLEANUP] Skipped ${res.rowCount} old scheduled tasks for ${platform}/${accountId} to prevent flood (Option Y).`);
    } catch (e) {
        console.error(`[SAFELOCK ERROR] Failed to discard backlog:`, e.message);
    }
}

// TikTok Warming Accounts CRUD
export async function createTikTokWarmingAccount(userId, data) {
    const res = await query(
        `INSERT INTO tiktok_warming_accounts (user_id, name, username, niche, audience, language, visual_style, status_planning, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()) RETURNING *`,
        [userId, data.name, data.username, data.niche || null, data.audience || null, data.language || 'pt-BR', data.visual_style || null, 'Não iniciado']
    );
    return res.rows[0];
}

export async function getTikTokWarmingAccounts(userId) {
    const res = await query('SELECT * FROM tiktok_warming_accounts WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    return res.rows;
}

export async function getTikTokWarmingAccountById(id, userId) {
    const res = await query('SELECT * FROM tiktok_warming_accounts WHERE id = $1 AND user_id = $2', [id, userId]);
    return res.rows[0];
}

export async function updateTikTokWarmingAccount(id, userId, data) {
    const res = await query(
        `UPDATE tiktok_warming_accounts 
         SET name = $3, username = $4, niche = $5, audience = $6, language = $7, visual_style = $8, updated_at = NOW()
         WHERE id = $1 AND user_id = $2 RETURNING *`,
        [id, userId, data.name, data.username, data.niche || null, data.audience || null, data.language || 'pt-BR', data.visual_style || null]
    );
    return res.rows[0];
}

export async function deleteTikTokWarmingAccount(id, userId) {
    await query('DELETE FROM tiktok_warming_accounts WHERE id = $1 AND user_id = $2', [id, userId]);
}

// TikTok Warming Images CRUD
export async function createTikTokWarmingImage(userId, data) {
    const res = await query(
        `INSERT INTO tiktok_warming_images (user_id, warming_account_id, category, concept, emotional_trigger, visual_prompt, image_text, caption, comment_question, hashtags, variations, image_url, local_path, format, style, tone, intensity, is_favorite, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, FALSE, NOW(), NOW()) RETURNING *`,
        [
            userId, 
            data.warming_account_id, 
            data.category || null,
            data.concept || null,
            data.emotional_trigger || null,
            data.visual_prompt || null,
            data.image_text || null,
            data.caption || null,
            data.comment_question || null,
            data.hashtags || null,
            data.variations || null,
            data.image_url,
            data.local_path || null,
            data.format || '9:16',
            data.style || null,
            data.tone || null,
            data.intensity || 'moderada'
        ]
    );
    return res.rows[0];
}

export async function getTikTokWarmingImages(userId, accountId = null) {
    if (accountId) {
        const res = await query('SELECT * FROM tiktok_warming_images WHERE user_id = $1 AND warming_account_id = $2 ORDER BY created_at DESC', [userId, accountId]);
        return res.rows;
    }
    const res = await query('SELECT * FROM tiktok_warming_images WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    return res.rows;
}

export async function getTikTokWarmingImageById(id, userId) {
    const res = await query('SELECT * FROM tiktok_warming_images WHERE id = $1 AND user_id = $2', [id, userId]);
    return res.rows[0];
}

export async function updateTikTokWarmingImage(id, userId, data) {
    const fields = [];
    // IMPORTANTE: os parâmetros $1 e $2 são SEMPRE id e userId (usados no WHERE),
    // portanto devem ser os primeiros da lista. Os campos dinâmicos começam em $3.
    const values = [id, userId];
    let i = 3;

    if (data.is_favorite !== undefined) { fields.push(`is_favorite = $${i++}`); values.push(data.is_favorite); }
    if (data.image_text !== undefined) { fields.push(`image_text = $${i++}`); values.push(data.image_text); }
    if (data.concept !== undefined) { fields.push(`concept = $${i++}`); values.push(data.concept); }
    if (data.caption !== undefined) { fields.push(`caption = $${i++}`); values.push(data.caption); }
    if (data.comment_question !== undefined) { fields.push(`comment_question = $${i++}`); values.push(data.comment_question); }
    if (data.hashtags !== undefined) { fields.push(`hashtags = $${i++}`); values.push(data.hashtags); }
    if (data.image_url !== undefined) { fields.push(`image_url = $${i++}`); values.push(data.image_url); }
    if (data.local_path !== undefined) { fields.push(`local_path = $${i++}`); values.push(data.local_path); }

    if (fields.length === 0) return null;
    fields.push('updated_at = NOW()');
    
    const res = await query(
        `UPDATE tiktok_warming_images SET ${fields.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING *`,
        values
    );
    return res.rows[0];
}

export async function deleteTikTokWarmingImage(id, userId) {
    await query('DELETE FROM tiktok_warming_images WHERE id = $1 AND user_id = $2', [id, userId]);
}

// TikTok Warming Publications CRUD
export async function createTikTokWarmingPublication(userId, data) {
    const res = await query(
        `INSERT INTO tiktok_warming_publications (user_id, warming_account_id, warming_image_id, platform, published_at, likes, comments, shares, views, manual_entry, notes)
         VALUES ($1, $2, $3, $4, COALESCE($5, NOW()), $6, $7, $8, $9, $10, $11) RETURNING *`,
        [
            userId,
            data.warming_account_id,
            data.warming_image_id || null,
            data.platform || 'tiktok',
            data.published_at || null,
            data.likes || 0,
            data.comments || 0,
            data.shares || 0,
            data.views || 0,
            data.manual_entry !== false,
            data.notes || null
        ]
    );
    return res.rows[0];
}

export async function getTikTokWarmingPublications(userId, accountId = null) {
    if (accountId) {
        const res = await query('SELECT * FROM tiktok_warming_publications WHERE user_id = $1 AND warming_account_id = $2 ORDER BY published_at DESC', [userId, accountId]);
        return res.rows;
    }
    const res = await query('SELECT * FROM tiktok_warming_publications WHERE user_id = $1 ORDER BY published_at DESC', [userId]);
    return res.rows;
}

export async function updateTikTokWarmingPublication(id, userId, data) {
    const fields = [];
    // $1 e $2 são sempre id e userId (WHERE); os campos dinâmicos começam em $3.
    const values = [id, userId];
    let i = 3;

    if (data.likes !== undefined) { fields.push(`likes = $${i++}`); values.push(data.likes); }
    if (data.comments !== undefined) { fields.push(`comments = $${i++}`); values.push(data.comments); }
    if (data.shares !== undefined) { fields.push(`shares = $${i++}`); values.push(data.shares); }
    if (data.views !== undefined) { fields.push(`views = $${i++}`); values.push(data.views); }
    if (data.notes !== undefined) { fields.push(`notes = $${i++}`); values.push(data.notes); }

    if (fields.length === 0) return null;
    fields.push('updated_at = NOW()');
    
    const res = await query(
        `UPDATE tiktok_warming_publications SET ${fields.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING *`,
        values
    );
    return res.rows[0];
}

export async function deleteTikTokWarmingPublication(id, userId) {
    await query('DELETE FROM tiktok_warming_publications WHERE id = $1 AND user_id = $2', [id, userId]);
}

// ============================================
// PERFORMANCE DE POSTS (Facebook / Instagram)
// ============================================

export async function updateAutomationPostMetrics(id, userId, data) {
    const fields = [];
    const values = [id, userId];
    let i = 3;
    if (data.published_post_id !== undefined) { fields.push(`published_post_id = $${i++}`); values.push(data.published_post_id); }
    if (data.media_type !== undefined) { fields.push(`media_type = $${i++}`); values.push(data.media_type); }
    if (data.published_platform !== undefined) { fields.push(`published_platform = $${i++}`); values.push(data.published_platform); }
    if (data.published_page_id !== undefined) { fields.push(`published_page_id = $${i++}`); values.push(data.published_page_id); }
    if (data.permalink !== undefined) { fields.push(`permalink = $${i++}`); values.push(data.permalink); }
    if (data.likes !== undefined) { fields.push(`likes = $${i++}`); values.push(data.likes); }
    if (data.comments !== undefined) { fields.push(`comments = $${i++}`); values.push(data.comments); }
    if (data.shares !== undefined) { fields.push(`shares = $${i++}`); values.push(data.shares); }
    if (data.views !== undefined) { fields.push(`views = $${i++}`); values.push(data.views); }
    if (data.reach !== undefined) { fields.push(`reach = $${i++}`); values.push(data.reach); }
    if (data.saved !== undefined) { fields.push(`saved = $${i++}`); values.push(data.saved); }
    if (fields.length === 0) return null;
    fields.push('metrics_updated_at = NOW()');
    const res = await query(
        `UPDATE automation_posts SET ${fields.join(', ')} WHERE id = $1 AND automation_id IN (SELECT id FROM automations WHERE user_id = $2) RETURNING *`,
        values
    );
    return res.rows[0];
}

export async function savePostMetricsSnapshot(postId, userId, platform, metrics = {}) {
    const res = await query(
        `INSERT INTO post_metrics_snapshots (automation_post_id, user_id, platform, likes, comments, shares, views, reach, saved)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [postId, userId, platform || null, metrics.likes || 0, metrics.comments || 0, metrics.shares || 0, metrics.views || 0, metrics.reach || 0, metrics.saved || 0]
    );
    return res.rows[0];
}

export async function getAutomationPostsForMetrics(userId, { platform = null, mediaType = null, days = 30, limit = 100 } = {}) {
    const params = [userId];
    let where = "WHERE a.user_id = $1 AND ap.status = 'published' AND ap.published_post_id IS NOT NULL";
    if (platform) { params.push(platform); where += ` AND ap.published_platform = $${params.length}`; }
    if (mediaType) { params.push(mediaType); where += ` AND ap.media_type = $${params.length}`; }
    params.push(days);
    where += ` AND ap.published_date >= NOW() - ($${params.length} || ' days')::interval`;
    params.push(limit);
    const res = await query(
        `SELECT ap.* FROM automation_posts ap JOIN automations a ON a.id = ap.automation_id ${where} ORDER BY (ap.views + ap.likes*3 + ap.comments*5 + ap.shares*8) DESC, ap.published_date DESC LIMIT $${params.length}`,
        params
    );
    return res.rows;
}

export async function getPostMetricsSummary(userId, { days = 30 } = {}) {
    const res = await query(
        `SELECT
            ap.published_platform AS platform,
            COALESCE(ap.media_type, 'desconhecido') AS media_type,
            COUNT(*)::int AS posts,
            COALESCE(SUM(ap.likes),0)::int AS likes,
            COALESCE(SUM(ap.comments),0)::int AS comments,
            COALESCE(SUM(ap.shares),0)::int AS shares,
            COALESCE(SUM(ap.views),0)::int AS views,
            COALESCE(SUM(ap.reach),0)::int AS reach,
            COALESCE(SUM(ap.saved),0)::int AS saved
         FROM automation_posts ap JOIN automations a ON a.id = ap.automation_id
         WHERE a.user_id = $1 AND ap.status = 'published' AND ap.published_date >= NOW() - ($2 || ' days')::interval
         GROUP BY ap.published_platform, COALESCE(ap.media_type, 'desconhecido')
         ORDER BY (COALESCE(SUM(ap.views),0) + COALESCE(SUM(ap.likes),0)*3) DESC`,
        [userId, days]
    );
    return res.rows;
}

// ============================================
// PERFORMANCE DE POSTS AGENDADOS (downloader_schedule) — vídeos/imagens FB/IG
// ============================================

export async function updateDownloaderScheduleMetrics(id, userId, data) {
    const fields = [];
    const values = [id, userId];
    let i = 3;
    if (data.published_post_id !== undefined) { fields.push(`published_post_id = $${i++}`); values.push(data.published_post_id); }
    if (data.media_type !== undefined) { fields.push(`media_type = $${i++}`); values.push(data.media_type); }
    if (data.permalink !== undefined) { fields.push(`permalink = $${i++}`); values.push(data.permalink); }
    if (data.likes !== undefined) { fields.push(`likes = $${i++}`); values.push(data.likes); }
    if (data.comments !== undefined) { fields.push(`comments = $${i++}`); values.push(data.comments); }
    if (data.shares !== undefined) { fields.push(`shares = $${i++}`); values.push(data.shares); }
    if (data.views !== undefined) { fields.push(`views = $${i++}`); values.push(data.views); }
    if (data.reach !== undefined) { fields.push(`reach = $${i++}`); values.push(data.reach); }
    if (data.saved !== undefined) { fields.push(`saved = $${i++}`); values.push(data.saved); }
    if (fields.length === 0) return null;
    fields.push('metrics_updated_at = NOW()');
    const res = await query(
        `UPDATE downloader_schedule SET ${fields.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING *`,
        values
    );
    return res.rows[0];
}

export async function getDownloaderSchedulesForMetrics(userId, { platform = null, mediaType = null, days = 30, limit = 100 } = {}) {
    const params = [userId];
    let where = "WHERE user_id = $1 AND status = 'completed' AND published_post_id IS NOT NULL AND posted_at IS NOT NULL AND platform IN ('facebook','instagram')";
    if (platform) { params.push(platform); where += ` AND platform = $${params.length}`; }
    if (mediaType) { params.push(mediaType); where += ` AND media_type = $${params.length}`; }
    params.push(days);
    where += ` AND posted_at >= NOW() - ($${params.length} || ' days')::interval`;
    params.push(limit);
    const res = await query(
        `SELECT * FROM downloader_schedule ${where} ORDER BY (views + likes*3 + comments*5 + shares*8) DESC, posted_at DESC LIMIT $${params.length}`,
        params
    );
    return res.rows;
}

export async function getDownloaderMetricsSummary(userId, { days = 30 } = {}) {
    const res = await query(
        `SELECT
            d.platform,
            COALESCE(d.media_type, 'desconhecido') AS media_type,
            COUNT(*)::int AS posts,
            COALESCE(SUM(d.likes),0)::int AS likes,
            COALESCE(SUM(d.comments),0)::int AS comments,
            COALESCE(SUM(d.shares),0)::int AS shares,
            COALESCE(SUM(d.views),0)::int AS views,
            COALESCE(SUM(d.reach),0)::int AS reach,
            COALESCE(SUM(d.saved),0)::int AS saved,
            COALESCE(SUM((SELECT COALESCE(SUM(sl.clicks),0) FROM short_links sl
                          WHERE sl.source_type = 'downloader_schedule' AND sl.source_id = d.id)),0)::int AS clicks
         FROM downloader_schedule d
         WHERE d.user_id = $1 AND d.status = 'completed' AND d.posted_at >= NOW() - ($2 || ' days')::interval
           AND d.platform IN ('facebook','instagram')
         GROUP BY d.platform, COALESCE(d.media_type, 'desconhecido')
         ORDER BY (COALESCE(SUM(d.views),0) + COALESCE(SUM(d.likes),0)*3) DESC`,
        [userId, days]
    );
    return res.rows;
}

export async function getDownloaderSchedulesForBackfill(userId, { days = 90 } = {}) {
    const res = await query(
        `SELECT id, platform, account_id, media_type, caption, posted_at
         FROM downloader_schedule
         WHERE user_id = $1 AND status = 'completed' AND published_post_id IS NULL
           AND platform IN ('facebook','instagram') AND posted_at >= NOW() - ($2 || ' days')::interval
         ORDER BY posted_at DESC`,
        [userId, days]
    );
    return res.rows;
}

// Fuso usado para agrupar horários/dias (público-alvo brasileiro)
const PERF_TZ = 'America/Sao_Paulo';

/**
 * Monta a origem SQL (tabela + WHERE + params) para as análises de performance,
 * unificando os dois caminhos: 'automation' (automation_posts) e 'scheduled' (downloader_schedule).
 */
function perfSourceSql(source, userId, { platform = null, mediaType = null, days = 30 } = {}) {
    const params = [userId];
    let table, where, p, timeCol;
    if (source === 'scheduled') {
        table = 'downloader_schedule d';
        p = 'd';
        timeCol = 'd.posted_at';
        where = "WHERE d.user_id = $1 AND d.status = 'completed' AND d.platform IN ('facebook','instagram')";
        if (platform) { params.push(platform); where += ` AND d.platform = $${params.length}`; }
        if (mediaType) { params.push(mediaType); where += ` AND d.media_type = $${params.length}`; }
    } else {
        table = 'automation_posts ap JOIN automations a ON a.id = ap.automation_id';
        p = 'ap';
        timeCol = 'ap.published_date';
        where = "WHERE a.user_id = $1 AND ap.status = 'published'";
        if (platform) { params.push(platform); where += ` AND ap.published_platform = $${params.length}`; }
        if (mediaType) { params.push(mediaType); where += ` AND ap.media_type = $${params.length}`; }
    }
    params.push(days);
    where += ` AND ${timeCol} >= NOW() - ($${params.length} || ' days')::interval`;
    return { table, where, params, p, timeCol };
}

/**
 * Melhores horários/dias para postar: agrupa por dia da semana + hora e calcula
 * o engajamento médio (score) e os totais.
 */
export async function getPostPerformanceTimes(userId, opts = {}) {
    const { table, where, params, p, timeCol } = perfSourceSql(opts.source, userId, opts);
    const res = await query(
        `SELECT
            EXTRACT(DOW FROM ${timeCol} AT TIME ZONE '${PERF_TZ}')::int AS dow,
            EXTRACT(HOUR FROM ${timeCol} AT TIME ZONE '${PERF_TZ}')::int AS hour,
            COUNT(*)::int AS posts,
            COALESCE(SUM(${p}.views),0)::int AS views,
            COALESCE(SUM(${p}.likes),0)::int AS likes,
            COALESCE(SUM(${p}.comments),0)::int AS comments,
            COALESCE(ROUND(AVG(${p}.views + ${p}.likes*3 + ${p}.comments*5 + ${p}.shares*8)),0)::int AS avg_score
         FROM ${table} ${where}
         GROUP BY 1, 2
         ORDER BY avg_score DESC`,
        params
    );
    return res.rows;
}

/**
 * Evolução diária de performance: agrupa os posts publicados por dia e soma as métricas.
 */
export async function getPostDailyPerformance(userId, opts = {}) {
    const { table, where, params, p, timeCol } = perfSourceSql(opts.source, userId, opts);
    const res = await query(
        `SELECT
            TO_CHAR(${timeCol} AT TIME ZONE '${PERF_TZ}', 'YYYY-MM-DD') AS day,
            COUNT(*)::int AS posts,
            COALESCE(SUM(${p}.views),0)::int AS views,
            COALESCE(SUM(${p}.likes),0)::int AS likes,
            COALESCE(SUM(${p}.comments),0)::int AS comments,
            COALESCE(SUM(${p}.shares),0)::int AS shares,
            COALESCE(SUM(${p}.views + ${p}.likes*3 + ${p}.comments*5 + ${p}.shares*8),0)::int AS score
         FROM ${table} ${where}
         GROUP BY 1
         ORDER BY 1`,
        params
    );
    return res.rows;
}
