import axios from 'axios';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'autopostagem',
    password: process.env.DB_PASSWORD || 'postgres',
    port: process.env.DB_PORT || 5432,
});

async function testIG() {
    try {
        console.log('Fetching facebook pages from DB...');
        const fbPages = await pool.query('SELECT id, name, access_token, instagram_business_id FROM facebook_pages WHERE instagram_business_id IS NOT NULL');
        
        if (fbPages.rows.length === 0) {
            console.log('No pages with instagram_business_id found.');
            process.exit(0);
        }

        console.log(`Found ${fbPages.rows.length} pages with IG connected.`);
        
        for (const page of fbPages.rows) {
            console.log(`\nTesting Page: ${page.name} (ID: ${page.id}) -> IG ID: ${page.instagram_business_id}`);
            try {
                const response = await axios.get(`https://graph.facebook.com/v19.0/${page.id}/conversations`, {
                    params: {
                        access_token: page.access_token,
                        fields: 'id,updated_time,unread_count',
                        platform: 'instagram'
                    }
                });
                console.log('✅ SUCCESS! Meta returned:', response.data.data.length, 'conversations.');
            } catch (error) {
                console.log('❌ ERROR! Meta rejected the request:');
                console.log(JSON.stringify(error.response?.data, null, 2) || error.message);
            }
        }
    } catch (e) {
        console.error('DB Error:', e);
    } finally {
        await pool.end();
    }
}

testIG();
