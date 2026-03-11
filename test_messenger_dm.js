/**
 * test_messenger_dm.js
 * Directly tests sending a Messenger DM to a specific user PSID.
 * Run: node test_messenger_dm.js
 */

import axios from 'axios';
import * as db from './services/database.js';

const PAGE_ID = '110461371922671';
// The PSID of the person to DM (from real comment webhook)
// Replace this with a real senderId from your webhook logs
const TEST_PSID = process.argv[2] || null;

async function testDM() {
    try {
        const res = await db.query('SELECT id, name, access_token FROM facebook_pages WHERE id = $1', [PAGE_ID]);
        const page = res.rows[0];
        if (!page) throw new Error('Page not found');

        console.log(`Using page: ${page.name} (${page.id})`);

        // First, fetch a real recent comment to get the sender's PSID
        if (!TEST_PSID) {
            console.log('\nFetching real commenter PSID from recent posts...');
            const posts = await axios.get(`https://graph.facebook.com/v19.0/${PAGE_ID}/feed`, {
                params: { fields: 'id', limit: 3, access_token: page.access_token }
            });

            let realPsid = null;
            for (const post of (posts.data.data || [])) {
                const comments = await axios.get(`https://graph.facebook.com/v19.0/${post.id}/comments`, {
                    params: { fields: 'id,from', limit: 3, access_token: page.access_token }
                });
                const c = (comments.data.data || []).find(x => x.from?.id);
                if (c) {
                    realPsid = c.from.id;
                    console.log(`Found real commenter PSID: ${realPsid}`);
                    break;
                }
            }

            if (!realPsid) {
                console.log('No real comments found. Pass a PSID as: node test_messenger_dm.js <PSID>');
                process.exit(0);
            }

            await sendDM(page.access_token, PAGE_ID, realPsid, '🤖 Teste do sistema automático MeliFlow!');
        } else {
            await sendDM(page.access_token, PAGE_ID, TEST_PSID, '🤖 Teste do sistema automático MeliFlow!');
        }

        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

async function sendDM(token, pageId, recipientPsid, message) {
    console.log(`\nSending DM to PSID: ${recipientPsid}...`);

    try {
        // Method 1: POST /{page-id}/messages
        const r = await axios.post(`https://graph.facebook.com/v19.0/${pageId}/messages`, {
            recipient: { id: recipientPsid },
            message: { text: message },
            messaging_type: 'RESPONSE'
        }, {
            params: { access_token: token }
        });
        console.log('✅ DM sent successfully!', r.data);
    } catch (err) {
        console.error('❌ Method 1 failed:', JSON.stringify(err.response?.data || err.message, null, 2));

        // Method 2: POST /me/messages
        try {
            console.log('\nTrying method 2: POST /me/messages...');
            const r2 = await axios.post('https://graph.facebook.com/v19.0/me/messages', {
                recipient: { id: recipientPsid },
                message: { text: message }
            }, {
                params: { access_token: token }
            });
            console.log('✅ Method 2 worked!', r2.data);
        } catch (err2) {
            console.error('❌ Method 2 also failed:', JSON.stringify(err2.response?.data || err2.message, null, 2));
        }
    }
}

testDM();
