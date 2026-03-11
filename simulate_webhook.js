/**
 * simulate_webhook.js
 * Fetches a REAL comment from Facebook and fires the full webhook automation pipeline.
 * Run: node simulate_webhook.js
 */

import axios from 'axios';
import * as db from './services/database.js';

const PAGE_ID = '110461371922671';

async function getRealCommentId(pageToken) {
    try {
        // Get recent posts from the page
        const postsRes = await axios.get(`https://graph.facebook.com/v19.0/${PAGE_ID}/feed`, {
            params: { fields: 'id,message', limit: 5, access_token: pageToken }
        });

        const posts = postsRes.data.data;
        if (!posts || posts.length === 0) {
            console.log('[SIM] No posts found on the page. Please create a post first.');
            return null;
        }

        console.log(`[SIM] Found ${posts.length} posts. Looking for comments...`);

        // Loop through posts to find a comment
        for (const post of posts) {
            const commentsRes = await axios.get(`https://graph.facebook.com/v19.0/${post.id}/comments`, {
                params: { fields: 'id,message,from', limit: 5, access_token: pageToken }
            });

            const comments = commentsRes.data.data;
            if (comments && comments.length > 0) {
                const c = comments[0];
                console.log(`[SIM] Using real comment: "${c.message}" (ID: ${c.id}) from post: ${post.id}`);
                return { commentId: c.id, message: c.message, senderId: c.from?.id };
            }
        }

        console.log('[SIM] No comments found on any recent post.');
        return null;
    } catch (err) {
        console.error('[SIM] Error fetching comments:', err.response?.data || err.message);
        return null;
    }
}

async function simulate() {
    try {
        // Get page token from DB
        const res = await db.query('SELECT access_token FROM facebook_pages WHERE id = $1', [PAGE_ID]);
        const pageToken = res.rows[0]?.access_token;

        if (!pageToken) {
            console.error('[SIM] Page token not found for page', PAGE_ID);
            process.exit(1);
        }

        // Try to get a real comment ID
        const realComment = await getRealCommentId(pageToken);

        const commentId = realComment?.commentId || '999_test_comment_id';
        const message = realComment?.message || 'eu quero';
        const senderId = realComment?.senderId || '123456';

        const payload = {
            object: 'page',
            entry: [{
                id: PAGE_ID,
                time: Math.floor(Date.now() / 1000),
                changes: [{
                    field: 'feed',
                    value: {
                        item: 'comment',
                        verb: 'add',
                        comment_id: commentId,
                        message: message,
                        from: { id: senderId, name: 'Simulation User' }
                    }
                }]
            }]
        };

        console.log(`\n[SIM] Sending webhook to server with comment_id: ${commentId}`);
        const simRes = await axios.post('http://localhost:3001/api/webhook', payload);
        console.log(`[SIM] Server response: ${simRes.status} - ${simRes.data}`);

        process.exit(0);
    } catch (err) {
        console.error('[SIM] Error:', err.message);
        process.exit(1);
    }
}

simulate();
