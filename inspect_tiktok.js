import * as db from './services/database.js';

async function inspect() {
    try {
        await db.initializeDatabase();
        const res = await db.query('SELECT id, user_id, channel_name, username, open_id FROM tiktok_accounts');
        console.log('TIKTOK ACCOUNTS:', res.rows);
    } catch (e) {
        console.error('ERROR:', e);
    }
    process.exit(0);
}

inspect();
