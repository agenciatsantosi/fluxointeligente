import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL
});

async function diag() {
    try {
        console.log('--- USERS ---');
        const users = await pool.query('SELECT id, email FROM users');
        console.log(JSON.stringify(users.rows, null, 2));

        console.log('--- WHATSAPP GROUPS ---');
        const groups = await pool.query('SELECT * FROM whatsapp_groups');
        console.log(JSON.stringify(groups.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

diag();
