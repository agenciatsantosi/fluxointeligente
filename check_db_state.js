import * as db from './services/database.js';

async function check() {
    try {
        console.log('--- Checking Comment Automations ---');
        const res = await db.query('SELECT * FROM comment_automations');
        console.log(`Total automations found: ${res.rows.length}`);
        res.rows.forEach(auto => {
            console.log(`- ID: ${auto.id}, Account: ${auto.account_id}, Platform: ${auto.platform}, Keyword: "${auto.keyword}", Active: ${auto.is_active}`);
        });

        console.log('\n--- Checking Facebook Pages ---');
        const pages = await db.query('SELECT id, name FROM facebook_pages');
        pages.rows.forEach(p => {
            console.log(`- ID: ${p.id}, Name: ${p.name}`);
        });

        console.log('\n--- Checking Instagram Accounts ---');
        const igs = await db.query('SELECT account_id, name FROM instagram_accounts');
        igs.rows.forEach(ig => {
            console.log(`- ID: ${ig.account_id}, Name: ${ig.name}`);
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
