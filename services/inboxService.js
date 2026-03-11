import axios from 'axios';
import * as db from './database.js';

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

        const allConversations = [];

        // 2. Fetch from Facebook Pages (FB + IG fallback)
        for (const page of fbPages.rows) {
            try {
                console.log(`[INBOX] [User ${userId}] Fetching FB & IG convs for Page: ${page.name} (${page.id})...`);

                // A. Fetch FB Conversations
                const fbResponse = await axios.get(`${GRAPH_BASE_URL}/${page.id}/conversations`, {
                    params: {
                        access_token: page.access_token,
                        fields: 'id,updated_time,unread_count,messages.limit(1){message,created_time,from},participants'
                    }
                });

                if (fbResponse.data && fbResponse.data.data) {
                    const fbConvs = fbResponse.data.data.map(conv => {
                        const lastMsg = conv.messages?.data[0];
                        const participant = conv.participants?.data.find(p => p.id !== page.id);
                        return {
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
                        };
                    });
                    allConversations.push(...fbConvs);
                }

                // B. Fetch IG Conversations managed by this Page
                const igResponse = await axios.get(`${GRAPH_BASE_URL}/${page.id}/conversations`, {
                    params: {
                        access_token: page.access_token,
                        fields: 'id,updated_time,unread_count,messages.limit(1){message,created_time,from},participants',
                        platform: 'instagram'
                    }
                });

                if (igResponse.data && igResponse.data.data) {
                    const igConvs = igResponse.data.data.map(conv => {
                        const lastMsg = conv.messages?.data[0];
                        const participant = conv.participants?.data.find(p => p.id !== page.id);
                        return {
                            id: conv.id,
                            name: participant?.username || participant?.name || 'Instagram User',
                            platform: 'instagram',
                            lastMessage: lastMsg?.message || '',
                            timestamp: formatTimestamp(conv.updated_time),
                            rawTimestamp: conv.updated_time,
                            unread: conv.unread_count > 0,
                            unreadCount: conv.unread_count || 0,
                            accountId: page.id, // Using Page ID as accountId for IG via Page
                            accountName: page.instagram_username ? `@${page.instagram_username}` : `${page.name} (IG)`
                        };
                    });
                    console.log(`[INBOX] ✅ Found ${igConvs.length} IG convs via Page: ${page.name}`);
                    allConversations.push(...igConvs);
                }
            } catch (err) {
                const errorData = err.response?.data?.error;
                // Silence #100 errors (Page not linked to IG or not Professional IG)
                // These are expected for many pages and shouldn't floor the console.
                if (errorData?.code === 100 && errorData?.message?.includes('Instagram')) {
                    // console.log(`[INBOX] Page ${page.name} has no linked Professional Instagram account.`);
                } else {
                    console.error(`Error fetching convs for page ${page.name}:`, errorData?.message || err.message);
                }
            }
        }

        // 3. Standalone Instagram Accounts
        for (const ig of igAccounts.rows) {
            try {
                // If it fails with code 3, we already tried fallback above
                const response = await axios.get(`${GRAPH_BASE_URL}/${ig.id}/conversations`, {
                    params: {
                        access_token: ig.access_token,
                        fields: 'id,updated_time,unread_count,messages.limit(1){message,created_time,from},participants',
                        platform: 'instagram'
                    }
                });

                if (response.data && response.data.data) {
                    const igConvs = response.data.data
                        .filter(conv => !allConversations.some(c => c.id === conv.id))
                        .map(conv => {
                            const lastMsg = conv.messages?.data[0];
                            return {
                                id: conv.id,
                                name: conv.participants?.data.find(p => p.id !== ig.id)?.username || 'Instagram User',
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
                    allConversations.push(...igConvs);
                }
            } catch (err) {
                // Ignore silent errors for direct IG fetch if fallback is active
            }
        }

        // Sort by timestamp (most recent first)
        return { success: true, conversations: allConversations };
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

        if (!token) {
            console.error(`[INBOX] getMessages: No token found for accountId: ${accountId}`);
            throw new Error('Account token not found');
        }

        try {
            const response = await axios.get(`${GRAPH_BASE_URL}/${threadId}/messages`, {
                params: {
                    access_token: token,
                    fields: 'id,message,created_time,from',
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
            // First, fetch the thread to get the participants
            const threadResponse = await axios.get(`${GRAPH_BASE_URL}/${threadId}?fields=participants`, {
                params: { access_token: useToken }
            });

            const participants = threadResponse.data.participants?.data || [];
            const recipient = participants.find(p => p.id !== accountId);

            if (!recipient) {
                throw new Error(`Recipient not found in conversation thread ${threadId}.`);
            }

            const payload = {
                recipient: { id: recipient.id },
                message: { text: text },
                messaging_type: "RESPONSE"
            };

            return await axios.post(`${GRAPH_BASE_URL}/me/messages`, payload, {
                params: {
                    access_token: useToken,
                    platform: platform === 'instagram' ? 'instagram' : undefined
                }
            });
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
        } else {
            // Fallback to Instagram Accounts
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
        const recipient = participants.find(p => p.id !== accountId);

        if (!recipient) {
            throw new Error(`Recipient not found in conversation thread ${threadId}.`);
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
