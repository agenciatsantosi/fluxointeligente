import * as db from './services/database.js';

async function test() {
    console.log("Fetching recent failed downloader tasks...");
    const res = await db.query("SELECT * FROM downloader_schedule WHERE status = 'failed' AND created_at >= '2026-05-22' ORDER BY id DESC LIMIT 5");
    console.log(JSON.stringify(res.rows, null, 2));
    process.exit(0);
}
test();
