
import pkg from 'pg';
import dotenv from 'dotenv';
const { Pool } = pkg;

dotenv.config({ path: '.env.local', override: true });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function fixSettings() {
    try {
        console.log('Checking database settings...');
        
        // Ensure system_config table exists (it should, but just in case)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS system_config (
                key TEXT PRIMARY KEY,
                value TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Check if menu_downloader exists
        const res = await pool.query('SELECT * FROM system_config WHERE key = $1', ['menu_downloader']);
        
        if (res.rows.length === 0) {
            console.log('Adding menu_downloader setting...');
            await pool.query('INSERT INTO system_config (key, value) VALUES ($1, $2)', ['menu_downloader', 'true']);
        } else {
            console.log('Ensuring menu_downloader is enabled...');
            await pool.query('UPDATE system_config SET value = $1 WHERE key = $2', ['true', 'menu_downloader']);
        }

        // Also ensure shopee_central is enabled and old ones are disabled if needed
        // The frontend uses menu_shopee_central now
        await pool.query("INSERT INTO system_config (key, value) VALUES ('menu_shopee_central', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true'");
        
        console.log('Done! Settings updated.');
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await pool.end();
    }
}

fixSettings();
