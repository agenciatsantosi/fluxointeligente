import * as threads from './threadsService.js';
import * as db from './database.js';

let isAutoReplyRunning = false;

/**
 * Process new replies for all Threads accounts of a user
 */
export async function processThreadsAutoReplies(userId) {
    // Prevent concurrent execution for the same user
    if (isAutoReplyRunning) {
        console.log(`[THREADS-AUTO] Already running, skipping for user ${userId}`);
        return;
    }
    isAutoReplyRunning = true;
    try {
        const accounts = await db.getThreadsAccounts(userId);
        
        for (const account of accounts) {
            console.log(`[THREADS-AUTO] Checking replies for @${account.username}...`);
            
            // 1. Get recent threads/posts
            const postsRes = await fetchThreads(account.account_id, account.access_token);
            if (!postsRes.success) continue;

            for (const post of postsRes.data) {
                // 2. Get replies for each post - pass userId to use correct account context
                const repliesRes = await threads.getThreadComments(post.id, account.id, userId);
                
                // Code 10 = permission not granted (threads_read_replies requires Meta app review)
                if (!repliesRes.success) {
                    if (repliesRes.error?.includes('permission') || repliesRes.error?.includes('code 10')) {
                        console.warn(`[THREADS-AUTO] Sem permissão para ler replies (threads_read_replies requer aprovação Meta). Pulando auto-reply.`);
                        break; // Skip all posts for this account - same error will repeat
                    }
                    continue;
                }

                // 3. Check for keywords and reply
                for (const reply of repliesRes.data) {
                    // Skip if we already replied (simple check: if our username is in the replies list of this comment, but API doesn't nested replies easily)
                    // Better: Store replied_comment_ids in DB to avoid double replies
                    const alreadyReplied = await db.query('SELECT id FROM threads_auto_replies WHERE comment_id = $1', [reply.id]);
                    if (alreadyReplied.rows.length > 0) continue;

                    if (shouldReply(reply.text)) {
                        console.log(`[THREADS-AUTO] Match found! Replying to: "${reply.text}"`);
                        
                        // Find associated product link if possible (from post text or DB)
                        const link = extractLinkFromPost(post.text);
                        const replyText = `Olá! Aqui está o link que você pediu: ${link || 'Verifique o link na bio!'}`;

                        // Pass userId so the right account credentials are used
                        const result = await threads.replyToThread(reply.id, replyText, account.id, userId);
                        if (result.success) {
                            await db.query('INSERT INTO threads_auto_replies (comment_id, thread_id, user_id, replied_at) VALUES ($1, $2, $3, NOW())', 
                                [reply.id, post.id, userId]);
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error('[THREADS-AUTO] Error in auto-reply worker:', error.message);
    } finally {
        isAutoReplyRunning = false;
    }
}

async function fetchThreads(accountId, token) {
    try {
        const axios = (await import('axios')).default;
        const res = await axios.get(`https://graph.threads.net/v1.0/${accountId}/threads`, {
            params: { fields: 'id,text,timestamp', access_token: token, limit: 5 }
        });
        return { success: true, data: res.data.data || [] };
    } catch (e) {
        return { success: false };
    }
}

function shouldReply(text) {
    if (!text) return false;
    const keywords = ['quero', 'link', 'valor', 'preço', 'preco', 'onde', 'comprar', 'enviar', 'manda'];
    const lowerText = text.toLowerCase();
    return keywords.some(k => lowerText.includes(k));
}

function extractLinkFromPost(postText) {
    if (!postText) return null;
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const matches = postText.match(urlRegex);
    return matches ? matches[0] : null;
}
