import * as db from './services/database.js';

async function main() {
    try {
        const res = await db.query('SELECT id, user_id, platform, caption, scheduled_at, comment_link_in_post, shopee_link, status FROM downloader_schedule ORDER BY id DESC LIMIT 10');
        console.log('LAST 10 SCHEDULES:');
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
}

main();
