import axios from 'axios';
import { query } from './services/database.js';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    try {
        console.log('Fetching account ID and token from DB...');
        const res = await query('SELECT * FROM instagram_accounts LIMIT 1');
        const account = res.rows[0];
        if (!account) throw new Error('No account found');

        const { access_token, account_id } = account;
        const testUrl = 'https://fluxointeligente-fluxointeligente.ddyzc4.easypanel.host/uploads/stories/story-1773267808633-416979639.jpeg';

        console.log(`Testing REGULAR FEED post with account: ${account.name} (${account_id})`);

        let createUrl = `https://graph.facebook.com/v18.0/${account_id}/media`;
        const payload = {
            // No media_type defaults to IMAGE (Feed)
            access_token: access_token,
            image_url: testUrl,
            caption: 'Test regular post'
        };

        const createRes = await axios.post(createUrl, payload);
        console.log('Success! Container created:', createRes.data.id);
        
    } catch (err) {
        console.error('API Error:', JSON.stringify(err.response?.data?.error || err.message, null, 2));
    }
    process.exit(0);
}

run();
