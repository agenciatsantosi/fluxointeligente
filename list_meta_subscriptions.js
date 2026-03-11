import axios from 'axios';
import * as db from './services/database.js';

async function listSubscriptions() {
    try {
        console.log('--- Listing Page Subscriptions ---');

        const res = await db.query('SELECT id, name, access_token FROM facebook_pages WHERE id = $1', ['110461371922671']);
        if (res.rows.length === 0) {
            console.log('Page not found.');
            process.exit(0);
        }

        const page = res.rows[0];
        console.log(`Checking Page: ${page.name} (${page.id})...`);

        const url = `https://graph.facebook.com/v19.0/${page.id}/subscribed_apps`;
        const response = await axios.get(url, {
            params: { access_token: page.access_token }
        });

        console.log('Subscribed Apps:', JSON.stringify(response.data, null, 2));

        // Also check App settings if possible? 
        // We need the App ID and App Secret for that, which we might have in .env

        process.exit(0);
    } catch (err) {
        console.error('Error listing subscriptions:', err.response?.data || err.message);
        process.exit(1);
    }
}

listSubscriptions();
