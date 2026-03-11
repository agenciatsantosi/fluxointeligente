import axios from 'axios';
import * as db from './services/database.js';

async function fixSubscriptions() {
    try {
        console.log('--- Fixing Page Webhook Subscriptions ---');

        // Fetch all connected pages
        const res = await db.query('SELECT id, name, access_token FROM facebook_pages');
        if (res.rows.length === 0) {
            console.log('No pages found in database.');
            process.exit(0);
        }

        const fields = 'feed,comments,mention,messages,messaging_postbacks';

        for (const page of res.rows) {
            console.log(`\nProcessing Page: ${page.name} (${page.id})...`);

            const url = `https://graph.facebook.com/v19.0/${page.id}/subscribed_apps`;

            try {
                const response = await axios.post(url, null, {
                    params: {
                        subscribed_fields: fields,
                        access_token: page.access_token
                    }
                });

                if (response.data.success) {
                    console.log(`✅ Successfully subscribed to fields: ${fields}`);
                } else {
                    console.error(`❌ Failed to subscribe:`, response.data);
                }
            } catch (err) {
                console.error(`❌ Error for page ${page.id}:`, err.response?.data || err.message);
            }
        }

        console.log('\n--- All subscriptions processed ---');
        process.exit(0);
    } catch (err) {
        console.error('Core script error:', err.message);
        process.exit(1);
    }
}

fixSubscriptions();
