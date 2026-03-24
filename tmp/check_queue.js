
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', override: true });

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL
});

async function checkQueue() {
    const res = await pool.query('SELECT id, status, posted_at, error, title FROM instagram_queue ORDER BY created_at DESC LIMIT 10');
    console.log('--- Recent Instagram Queue ---');
    console.table(res.rows);
    
    const fbRes = await pool.query('SELECT id, status, posted_at, error, title FROM facebook_reels_queue ORDER BY created_at DESC LIMIT 10');
    console.log('--- Recent Facebook Reels Queue ---');
    console.table(fbRes.rows);
    
    await pool.end();
}

checkQueue().catch(console.error);
