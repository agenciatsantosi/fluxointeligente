import axios from 'axios';
import * as db from './database.js';
import * as threads from './threadsService.js';

const GRAPH_BASE_URL = 'https://graph.facebook.com/v19.0';

/**
 * Get all conversations for a user's connected Facebook Pages and Instagram Accounts
 */
export async function getConversations(userId) {
    try {
        // 1. Get all connected Facebook Pages (enriched with IG linkage)
        const fbPages = await db.query('SELECT id, name, access_token, instagram_business_id, instagram_username FROM facebook_pages WHERE user_id = $1', [userId]);

        // 2. Get all connected Instagram Accounts (initial query)
        const igAccounts = await db.query('SELECT account_id as id, name, access_token FROM instagram_accounts WHERE user_id = $1', [userId]);

        // 3. Get all connected Threads Accounts
        const threadsAccounts = await db.query('SELECT account_id as id, username as name, access_token FROM threads_accounts WHERE user_id = $1', [userId]);

        const allConversations = [];

        // 2. Fetch from Facebook Pages (FB + IG fallback) in Parallel
        const pagePromises = fbPages.rows.map(async (page) => {
            try {
                const results = [];
                // console.log(`[INBOX] [User ${userId}] Fetching FB & IG convs for Page: ${page.name} (${page.id})...`);

                // Create individual promises for FB and IG to run them together
                const fbPromise = axios.get(`${GRAPH_BASE_URL}/${page.id}/conversations`, {
                    params: {
                        access_token: page.access_token,
                        fields: 'id,updated_time,unread_count,messages.limit(1){message,created_time,from},participants',
                        limit: 30
                    },
                    timeout: 40000
                }).catch(e => null);

                // Optimization: ONLY fetch IG conversations if the page actually has an Instagram Business ID linked
                // Usar o instagram_business_id DIRETAMENTE como endpoint costuma ser mais estável para IG DMs
                const igPromise = page.instagram_business_id ? axios.get(`${GRAPH_BASE_URL}/${page.instagram_business_id}/conversations`, {
                    params: {
                        access_token: page.access_token,
                        fields: 'id,updated_time,participants',
                        platform: 'instagram',
                        limit: 10
                    },
                    timeout: 45000
                }).catch(e => {
                    // Fallback: Tentar via Page ID se o IG ID falhar
                    return axios.get(`${GRAPH_BASE_URL}/${page.id}/conversations`, {
                        params: {
                            access_token: page.access_token,
                            fields: 'id,updated_time,participants',
                            platform: 'instagram',
                            limit: 10
                        },
                        timeout: 45000
                    }).catch(err => {
                        console.error(`[INBOX] Erro total IG DMs da página ${page.name}:`, err.response?.data?.error?.message || err.message);
                        return null;
                    });
                }) : Promise.resolve(null);

                const [fbRes, igRes] = await Promise.all([fbPromise, igPromise]);

                if (fbRes?.data?.data) {
                    fbRes.data.data.forEach(conv => {
                        const lastMsg = conv.messages?.data[0];
                        const participant = conv.participants?.data?.find(p => p.id !== page.id);
                        results.push({
                            id: conv.id,
                            name: participant?.name || 'Facebook User',
                            platform: 'facebook',
                            lastMessage: lastMsg?.message || '',
                            timestamp: formatTimestamp(conv.updated_time),
                            rawTimestamp: conv.updated_time,
                            unread: conv.unread_count > 0,
                            unreadCount: conv.unread_count || 0,
                            accountId: page.id,
                            accountName: page.name
                        });
                    });
                }

                if (igRes?.data?.data) {
                    igRes.data.data.forEach(conv => {
                        const lastMsg = conv.messages?.data?.[0];
                        const participant = conv.participants?.data?.find(p => p.id !== page.instagram_business_id && p.id !== page.id);
                        results.push({
                            id: conv.id,
                            name: participant?.username || participant?.name || 'Instagram User',
                            platform: 'instagram',
                            lastMessage: lastMsg?.message || 'Clique para ver a conversa...',
                            timestamp: formatTimestamp(conv.updated_time),
                            rawTimestamp: conv.updated_time,
                            unread: (conv.unread_count || 0) > 0,
                            unreadCount: conv.unread_count || 0,
                            accountId: page.instagram_business_id,
                            accountName: page.instagram_username ? `@${page.instagram_username}` : `${page.name} (IG)`
                        });
                    });
                }
                return results;
            } catch (err) {
                return [];
            }
        });

        // 3. Standalone Instagram Accounts in Parallel
        const igPromises = igAccounts.rows.map(async (ig) => {
            try {
                const response = await axios.get(`${GRAPH_BASE_URL}/${ig.id}/conversations`, {
                    params: {
                        access_token: ig.access_token,
                        fields: 'id,updated_time,unread_count,messages.limit(1){message,created_time,from},participants',
                        platform: 'instagram'
                    },
                    timeout: 10000
                });

                if (response.data?.data) {
                    return response.data.data.map(conv => {
                        const lastMsg = conv.messages?.data[0];
                        return {
                            id: conv.id,
                            name: conv.participants?.data?.find(p => p.id !== ig.id)?.username || 'Instagram User',
                            platform: 'instagram',
                            lastMessage: lastMsg?.message || '',
                            timestamp: formatTimestamp(conv.updated_time),
                            rawTimestamp: conv.updated_time,
                            unread: conv.unread_count > 0,
                            unreadCount: conv.unread_count || 0,
                            accountId: ig.id,
                            accountName: ig.name
                        };
                    });
                }
                return [];
            } catch (err) {
                return [];
            }
        });

        // 4. Threads Posts (Treating each post with replies as a conversation)
        const threadsPromises = threadsAccounts.rows.map(async (acc) => {
            try {
                // Fetch recent threads for this account
                const response = await axios.get(`https://graph.threads.net/v1.0/${acc.id}/threads`, {
                    params: {
                        fields: 'id,text,timestamp,shortcode,permalink',
                        access_token: acc.access_token,
                        limit: 10
                    }
                });

                if (response.data?.data) {
                    const convs = [];
                    for (const thread of response.data.data) {
                        // Check for replies
                        const repliesRes = await threads.getThreadComments(thread.id);
                        
                        if (repliesRes.success && repliesRes.data.length > 0) {
                            const lastReply = repliesRes.data[0];
                            convs.push({
                                id: thread.id,
                                name: `Post: ${thread.text?.substring(0, 30)}...`,
                                platform: 'threads',
                                lastMessage: lastReply.text || 'Nova resposta no Threads',
                                timestamp: formatTimestamp(lastReply.timestamp || thread.timestamp),
                                rawTimestamp: lastReply.timestamp || thread.timestamp,
                                unread: true,
                                unreadCount: repliesRes.data.length,
                                accountId: acc.id,
                                accountName: `@${acc.name}`
                            });
                        }
                    }
                    return convs;
                }
                return [];
            } catch (err) {
                console.error(`[INBOX] Error fetching Threads for ${acc.name}:`, err.message);
                return [];
            }
        });

        // Resolve all in parallel
        const allSettled = await Promise.allSettled([...pagePromises, ...igPromises, ...threadsPromises]);
        allSettled.forEach(result => {
            if (result.status === 'fulfilled' && result.value) {
                allConversations.push(...result.value);
            }
        });

        // Remove duplicates if any (by ID)
        const uniqueConversations = Array.from(new Map(allConversations.map(c => [c.id, c])).values());

        // Sort by timestamp (most recent first)
        uniqueConversations.sort((a, b) => {
            const dateA = a.rawTimestamp ? new Date(a.rawTimestamp).getTime() : 0;
            const dateB = b.rawTimestamp ? new Date(b.rawTimestamp).getTime() : 0;
            return dateB - dateA;
        });

        const accountsList = [];
        fbPages.rows.forEach(p => {
            accountsList.push({ id: p.id, name: p.name, platform: 'facebook' });
            if (p.instagram_business_id) {
                accountsList.push({ 
                    id: p.instagram_business_id, // Use the correct instagram_business_id
                    name: p.instagram_username ? `@${p.instagram_username}` : `${p.name} (IG)`, 
                    platform: 'instagram' 
                });
            }
        });
        igAccounts.rows.forEach(ig => {
            accountsList.push({ id: ig.id, name: ig.name, platform: 'instagram' });
        });
        threadsAccounts.rows.forEach(acc => {
            accountsList.push({ id: acc.id, name: `@${acc.name}`, platform: 'threads' });
        });

        return { success: true, conversations: uniqueConversations, accounts: accountsList };
    } catch (error) {
        console.error('getConversations Error:', error);
        throw error;
    }
}

/**
 * Get messages for a specific thread
 */
export async function getMessages(threadId, platform, accountId) {
    try {
        let token = '';
        let userId = null;

        // Try Facebook Pages first (Direct Page ID match)
        let pageRes = await db.query('SELECT access_token FROM facebook_pages WHERE id = $1', [accountId]);

        if (pageRes.rows[0]) {
            token = pageRes.rows[0].access_token;
        } else if (platform === 'instagram') {
            // Check if this is an Instagram ID linked to a Page we have
            pageRes = await db.query('SELECT access_token FROM facebook_pages WHERE instagram_business_id = $1', [accountId]);
            if (pageRes.rows[0]) {
                token = pageRes.rows[0].access_token;
                console.log(`[INBOX] getMessages: Found linked Page token for IG ${accountId}`);
            }
        }

        if (!token) {
            // Fallback to Instagram Accounts table
            const igRes = await db.query('SELECT access_token, user_id FROM instagram_accounts WHERE account_id = $1', [accountId]);
            token = igRes.rows[0]?.access_token;
            userId = igRes.rows[0]?.user_id;
        }

        if (platform === 'threads') {
            const threadsRes = await threads.getThreadComments(threadId);
            if (threadsRes.success) {
                const messages = threadsRes.data.map(msg => ({
                    id: msg.id,
                    text: msg.text,
                    sender: msg.username === accountId ? 'user' : 'contact', // simplistic check
                    timestamp: formatTimestamp(msg.timestamp)
                })).reverse();
                return { success: true, messages };
            }
            throw new Error(threadsRes.error);
        }

        if (!token) {
            console.error(`[INBOX] getMessages: No token found for accountId: ${accountId}`);
            throw new Error('Account token not found');
        }

        try {
            const response = await axios.get(`${GRAPH_BASE_URL}/${threadId}/messages`, {
                params: {
                    access_token: token,
                    fields: 'id,message,created_time,from',
                    limit: 30,
                    platform: platform === 'instagram' ? 'instagram' : undefined
                }
            });

            if (response.data && response.data.data) {
                const messages = response.data.data.map(msg => ({
                    id: msg.id,
                    text: msg.message,
                    sender: msg.from.id === accountId ? 'user' : 'contact',
                    timestamp: formatTimestamp(msg.created_time)
                })).reverse();

                return { success: true, messages };
            }
        } catch (err) {
            if (platform === 'instagram' && userId) {
                console.log(`[INBOX] getMessages failed for IG ${accountId}, searching for linked Page token...`);
                const fbPages = await db.query('SELECT name, id, access_token FROM facebook_pages WHERE user_id = $1', [userId]);

                for (const page of fbPages.rows) {
                    try {
                        // Verificar se esta página é a dona deste IG
                        const linkRes = await axios.get(`${GRAPH_BASE_URL}/${page.id}`, {
                            params: { fields: 'instagram_business_account', access_token: page.access_token }
                        });

                        if (linkRes.data.instagram_business_account?.id === accountId) {
                            console.log(`[INBOX] ✅ getMessages FALLBACK FOUND MATCH: Page '${page.name}' manages this IG.`);
                            const fbResponse = await axios.get(`${GRAPH_BASE_URL}/${threadId}/messages`, {
                                params: {
                                    access_token: page.access_token,
                                    fields: 'id,message,created_time,from',
                                    limit: 30,
                                    platform: 'instagram'
                                }
                            });

                            if (fbResponse.data && fbResponse.data.data) {
                                const messages = fbResponse.data.data.map(msg => ({
                                    id: msg.id,
                                    text: msg.message,
                                    sender: msg.from.id === accountId ? 'user' : 'contact',
                                    timestamp: formatTimestamp(msg.created_time)
                                })).reverse();
                                return { success: true, messages };
                            }
                        }
                    } catch (e) { }
                }
            }
            throw err;
        }

        return { success: true, messages: [] };
    } catch (error) {
        console.error('getMessages Error:', error);
        throw error;
    }
}

/**
 * Send a message to a thread
 */
export async function sendMessage(threadId, platform, accountId, text) {
    try {
        if (platform === 'threads') {
            return await threads.replyToThread(threadId, text);
        }

        let token = '';
        let userId = null;

        // Try Facebook Pages first (Direct or via IG link)
        let pageRes = await db.query('SELECT access_token FROM facebook_pages WHERE id = $1', [accountId]);

        if (pageRes.rows[0]) {
            token = pageRes.rows[0].access_token;
        } else if (platform === 'instagram') {
            pageRes = await db.query('SELECT access_token FROM facebook_pages WHERE instagram_business_id = $1', [accountId]);
            if (pageRes.rows[0]) {
                token = pageRes.rows[0].access_token;
                console.log(`[INBOX] sendMessage: Found linked Page token for IG ${accountId}`);
            }
        }

        if (!token) {
            // Fallback to Instagram Accounts
            const igRes = await db.query('SELECT access_token, user_id FROM instagram_accounts WHERE account_id = $1', [accountId]);
            token = igRes.rows[0]?.access_token;
            userId = igRes.rows[0]?.user_id;
        }

        if (!token) {
            console.error(`[INBOX] sendMessage: No token found for accountId: ${accountId}`);
            throw new Error('Account token not found');
        }

            const trySendMessage = async (useToken) => {
                // 1. Get IDs to ignore
                let myIGAccountId = null;
                if (platform === 'instagram') {
                    const igIdQuery = await db.query('SELECT instagram_business_id FROM facebook_pages WHERE id = $1', [accountId]);
                    myIGAccountId = igIdQuery.rows[0]?.instagram_business_id;
                }

                // 2. Fetch thread to detect recipient
                const threadResponse = await axios.get(`${GRAPH_BASE_URL}/${threadId}`, {
                    params: { 
                        access_token: useToken,
                        fields: 'participants,messages.limit(10){from}' 
                    }
                });

                const data = threadResponse.data;
                let recipientId = null;
                const participants = data.participants?.data || [];
                const foundParticipant = participants.find(p => p.id !== accountId && p.id !== myIGAccountId && p.id !== userId);
                if (foundParticipant) recipientId = foundParticipant.id;

                if (!recipientId && data.messages?.data) {
                    for (const msg of data.messages.data) {
                        const fromId = msg.from?.id;
                        if (fromId && fromId !== accountId && fromId !== myIGAccountId && fromId !== userId) {
                            recipientId = fromId;
                            break;
                        }
                    }
                }

                if (!recipientId) throw new Error(`Não foi possível detectar o destinatário da conversa.`);

                // 3. TRY SENDING (First Attempt: STANDARD RESPONSE)
                const payloadStandard = {
                    recipient: { id: recipientId },
                    message: { text: text },
                    messaging_type: "RESPONSE"
                };

                try {
                    console.log(`[INBOX] sendMessage: Attempting standard response to ${recipientId}`);
                    return await axios.post(`${GRAPH_BASE_URL}/me/messages`, payloadStandard, {
                        params: { access_token: useToken, platform: platform === 'instagram' ? 'instagram' : undefined }
                    });
                } catch (standardError) {
                    const errCode = standardError.response?.data?.error?.code;
                    // If it's a 24h window error (#10), try HUMAN_AGENT tag as fallback
                    if (errCode === 10) {
                        console.log(`[INBOX] sendMessage: 24h window closed, trying HUMAN_AGENT fallback...`);
                        const payloadTag = {
                            recipient: { id: recipientId },
                            message: { text: text },
                            messaging_type: "MESSAGE_TAG",
                            tag: "HUMAN_AGENT"
                        };
                        return await axios.post(`${GRAPH_BASE_URL}/me/messages`, payloadTag, {
                            params: { access_token: useToken, platform: platform === 'instagram' ? 'instagram' : undefined }
                        });
                    }
                    throw standardError;
                }
            };

        try {
            const response = await trySendMessage(token);

            // Human Handoff
            try {
                await db.setHandoffActive(accountId, platform, true);
                console.log(`[AGENTS] Human Handoff triggered. Bot paused for ${accountId}.`);
            } catch (e) { }

            return { success: true, data: response.data };
        } catch (err) {
            if (platform === 'instagram' && userId) {
                console.log(`[INBOX] sendMessage failed for IG ${accountId}, searching for linked Page token...`);
                const fbPages = await db.query('SELECT name, id, access_token FROM facebook_pages WHERE user_id = $1', [userId]);

                for (const page of fbPages.rows) {
                    try {
                        // Verificar vínculo
                        const linkRes = await axios.get(`${GRAPH_BASE_URL}/${page.id}`, {
                            params: { fields: 'instagram_business_account', access_token: page.access_token }
                        });

                        if (linkRes.data.instagram_business_account?.id === accountId) {
                            console.log(`[INBOX] ✅ sendMessage FALLBACK FOUND MATCH: Page '${page.name}' manages this IG.`);
                            const response = await trySendMessage(page.access_token);

                            try {
                                await db.setHandoffActive(accountId, platform, true);
                            } catch (e) { }

                            return { success: true, data: response.data };
                        }
                    } catch (e) { }
                }
            }
            throw err;
        }
    } catch (error) {
        console.error('[INBOX] sendMessage Error:', error.response?.data || error.message);
        throw new Error(error.response?.data?.error?.message || 'Error sending message to Facebook Graph API');
    }
}

function formatTimestamp(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();

    if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString();
}

export async function markAsRead(userId, threadId, platform, accountId) {
    try {
        let token = '';

        // Try Facebook Pages first
        const fbPageRes = await db.query('SELECT access_token FROM facebook_pages WHERE id = $1', [accountId]);
        if (fbPageRes.rows[0]) {
            token = fbPageRes.rows[0].access_token;
        } else if (platform === 'instagram') {
            const linkedIgRes = await db.query('SELECT access_token FROM facebook_pages WHERE instagram_business_id = $1', [accountId]);
            if (linkedIgRes.rows[0]) {
                token = linkedIgRes.rows[0].access_token;
            } else {
                // Fallback to Instagram Accounts
                const igRes = await db.query('SELECT access_token FROM instagram_accounts WHERE account_id = $1', [accountId]);
                token = igRes.rows[0]?.access_token;
            }
        } else {
            // Fallback to Instagram Accounts (should rarely hit for FB)
            const igRes = await db.query('SELECT access_token FROM instagram_accounts WHERE account_id = $1', [accountId]);
            token = igRes.rows[0]?.access_token;
        }

        if (!token) throw new Error('Account token not found');

        const threadResponse = await axios.get(`${GRAPH_BASE_URL}/${threadId}?fields=participants`, {
            params: {
                access_token: token,
                platform: platform === 'instagram' ? 'instagram' : undefined
            }
        });

        const participants = threadResponse.data.participants?.data || [];
        
        let myIGAccountId = null;
        if (platform === 'instagram') {
            const igIdQuery = await db.query('SELECT instagram_business_id FROM facebook_pages WHERE id = $1', [accountId]);
            myIGAccountId = igIdQuery.rows[0]?.instagram_business_id;
        }

        let recipient = participants.find(p => p.id !== accountId && p.id !== myIGAccountId);

        if (!recipient) {
            // Fallback: look at recent messages to find the sender
            try {
                const msgResponse = await axios.get(`${GRAPH_BASE_URL}/${threadId}/messages`, {
                    params: { limit: 5, access_token: token, fields: 'from', platform: platform === 'instagram' ? 'instagram' : undefined }
                });
                const msgs = msgResponse.data?.data || [];
                const otherSender = msgs.find(m => m.from && m.from.id !== accountId && m.from.id !== myIGAccountId);
                if (otherSender) {
                    recipient = otherSender.from;
                }
            } catch (fallbackErr) {
                console.warn('[INBOX] markAsRead fallback failed:', fallbackErr.message);
            }
        }

        if (!recipient) {
            console.warn(`[INBOX] markAsRead skipped: Recipient not found in conversation thread ${threadId}.`);
            return { success: true, warning: 'Recipient not found' };
        }

        const payload = {
            recipient: { id: recipient.id },
            sender_action: "mark_seen"
        };

        const endpoint = platform === 'facebook' || platform === 'page' ? 'me/messages' : 'me/messages'; // IG & FB share the same endpoint format in Graph API

        const response = await axios.post(`${GRAPH_BASE_URL}/me/messages`, payload, {
            params: {
                access_token: token,
                platform: platform === 'instagram' ? 'instagram' : undefined
            }
        });

        return { success: true, data: response.data };
    } catch (error) {
        // Meta returns Error #10 if the message is outside the 24h window.
        // We shouldn't throw a fatal error for mark_seen failing.
        console.warn('[INBOX] Could not send mark_seen to Meta API (likely outside 24h window). Ignoring.');
        return { success: true, warning: error.response?.data?.error?.message || error.message };
    }
}

export async function getUnreadCount(userId) {
    try {
        console.log(`[INBOX] Checking unread count for user: ${userId}`);
        const fbPages = await db.query('SELECT id, access_token FROM facebook_pages WHERE user_id = $1', [userId]);
        const igAccounts = await db.query('SELECT account_id as id, access_token FROM instagram_accounts WHERE user_id = $1', [userId]);

        let totalUnread = 0;

        for (const page of fbPages.rows) {
            try {
                // A. FB Unread
                const fbResponse = await axios.get(`${GRAPH_BASE_URL}/${page.id}/conversations`, {
                    params: { access_token: page.access_token, fields: 'unread_count', limit: 50 }
                });
                if (fbResponse.data && fbResponse.data.data) {
                    const unread = fbResponse.data.data.reduce((sum, c) => sum + (c.unread_count || 0), 0);
                    totalUnread += unread;
                }

                // B. IG Unread via Page
                const igResponse = await axios.get(`${GRAPH_BASE_URL}/${page.id}/conversations`, {
                    params: {
                        access_token: page.access_token,
                        fields: 'unread_count',
                        limit: 50,
                        platform: 'instagram'
                    }
                });
                if (igResponse.data && igResponse.data.data) {
                    const unread = igResponse.data.data.reduce((sum, c) => sum + (c.unread_count || 0), 0);
                    totalUnread += unread;
                }
            } catch (err) {
                console.error(`[INBOX] Error fetching unreads for ${page.id}:`, err.response?.data?.error?.message || err.message);
            }
        }

        for (const ig of igAccounts.rows) {
            try {
                const response = await axios.get(`${GRAPH_BASE_URL}/${ig.id}/conversations`, {
                    params: { access_token: ig.access_token, fields: 'unread_count', platform: 'instagram', limit: 50 }
                });
                if (response.data && response.data.data) {
                    const unread = response.data.data.reduce((sum, c) => sum + (c.unread_count || 0), 0);
                    console.log(`[INBOX] IG Account ${ig.id} unread messages: ${unread}`);
                    totalUnread += unread;
                }
            } catch (err) {
                console.error(`[INBOX] Error fetching IG unread for ${ig.id}:`, err.response?.data || err.message);
            }
        }

        console.log(`[INBOX] Total unread count for ${userId}: ${totalUnread}`);
        return { success: true, count: totalUnread };
    } catch (error) {
        console.error('getUnreadCount Error:', error);
        return { success: false, error: error.message };
    }
}

export default {
    getConversations,
    getMessages,
    sendMessage,
    getUnreadCount
};
