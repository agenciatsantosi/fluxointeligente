import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function testConnection() {
    console.log('Testing Postgres Connection...');
    const pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL
    });

    try {
        const client = await pool.connect();
        console.log('✅ Connected to PostgreSQL successfully!');
        const res = await client.query('SELECT NOW()');
        console.log('Query result:', res.rows[0]);
        client.release();
        await pool.end();
    } catch (err) {
        console.error('❌ Error connecting to PostgreSQL:', err.message);
        process.exit(1);
    }
}

testConnection();
