import axios from 'axios';
import {
    getSystemConfig,
    addThreadsAccount,
    getThreadsAccounts,
    getThreadsAccountById,
    removeThreadsAccount,
    query
} from './database.js';
import { generateSmartTags } from './smartTags.js';
import { wrapMetaAction } from './facebookService.js';
import { maybeBridgeMedia } from './instagramGraphService.js';

// Threads API configuration
let globalAccessToken = null;
let globalAccountId = null;

/**
 * Initialize Threads API from database
 */
export async function initializeThreadsAPI(userId = 1) {
    try {
        const accounts = await getThreadsAccounts(userId);
        if (accounts.length > 0) {
            const defaultAccount = accounts[0];
            globalAccessToken = defaultAccount.access_token;
            globalAccountId = defaultAccount.account_id;
            console.log(`[THREADS] Initialized default account: ${defaultAccount.username}`);
            return true;
        }
    } catch (error) {
        console.error('[THREADS] Initialization error:', error);
    }
    return false;
}

/**
 * Exchange short-lived token for long-lived token (60 days)
 * Reuses Meta's OAuth infrastructure
 */
export async function exchangeForLongLivedToken(shortLivedToken) {
    try {
        const appId = await getSystemConfig('META_APP_ID');
        const appSecret = await getSystemConfig('META_APP_SECRET');

        if (appId && appSecret) {
            console.log('[THREADS] Exchanging for long-lived token...');
            // Threads long-lived exchange: https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret={app-secret}&access_token={short-token}
            const response = await axios.get('https://graph.threads.net/access_token', {
                params: {
                    grant_type: 'th_exchange_token',
                    client_secret: appSecret,
                    access_token: shortLivedToken
                }
            });

            if (response.data && response.data.access_token) {
                const longLivedToken = response.data.access_token;
                const expiresIn = response.data.expires_in || 5184000;
                const expiresAt = new Date(Date.now() + expiresIn * 1000);
                return { token: longLivedToken, type: 'long_lived', expiresAt: expiresAt.toISOString() };
            }
        }
    } catch (error) {
        console.error('[THREADS] Token exchange error:', error.response?.data || error.message);
    }
    
    // Fallback: Use short-lived token if exchange fails
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);
    return { token: shortLivedToken, type: 'short_lived', expiresAt: expiresAt.toISOString() };
}

/**
 * Add a new Threads account (Supports both raw token and OAuth code)
 */
export async function addAccount(payload, userId) {
    let { token, code, redirectUri } = payload;
    let cleanToken = token ? token.trim() : null;
    
    try {
        const appId = await getSystemConfig('META_APP_ID');
        const appSecret = await getSystemConfig('META_APP_SECRET');

        // If we have a code, we must exchange it for a short-lived token first
        if (code) {
            console.log('[THREADS] Exchanging OAuth code for short-lived token...');
            if (!appId || !appSecret) {
                throw new Error('META_APP_ID ou META_APP_SECRET não configurados no sistema.');
            }

            // Clean code: Meta often adds #_ at the end
            let cleanCode = code.trim();
            if (cleanCode.includes('#_')) {
                cleanCode = cleanCode.split('#_')[0];
            }

            // Ensure redirectUri matches the one used to generate the code
            // If the user pasted a Postman code, we try to use the Postman callback
            const finalRedirectUri = (cleanCode.length > 100 && !redirectUri) 
                ? 'https://oauth.pstmn.io/v1/callback' 
                : (redirectUri || 'http://localhost:5174/dashboard/automation_accounts');

            console.log(`[THREADS] Using Redirect URI for exchange: ${finalRedirectUri}`);

            try {
                const exchangeRes = await axios.post('https://graph.threads.net/oauth/access_token', null, {
                    params: {
                        client_id: appId,
                        client_secret: appSecret,
                        grant_type: 'authorization_code',
                        redirect_uri: finalRedirectUri,
                        code: cleanCode
                    }
                });

                if (exchangeRes.data && exchangeRes.data.access_token) {
                    cleanToken = exchangeRes.data.access_token;
                    console.log('[THREADS] Successfully exchanged code for short-lived token.');
                } else {
                    throw new Error('O Meta não retornou um access_token na resposta.');
                }
            } catch (exchangeError) {
                console.error('[THREADS] Exchange Error Details:', exchangeError.response?.data || exchangeError.message);
                const metaError = exchangeError.response?.data?.error_message || exchangeError.response?.data?.message || exchangeError.message;
                throw new Error(`Erro no Meta: ${metaError}`);
            }
        }

        if (!cleanToken) throw new Error('Token ou Código é obrigatório.');

        // Remove "Bearer " if present
        if (cleanToken.startsWith('Bearer ')) {
            cleanToken = cleanToken.substring(7).trim();
        }

        console.log(`[THREADS] Validating account with token starting with: ${cleanToken.substring(0, 10)}...`);

        // Validate token and get account info
        const infoResponse = await axios.get('https://graph.threads.net/v1.0/me', {
            params: {
                fields: 'id,username,name,threads_profile_picture_url',
                access_token: cleanToken
            }
        });

        const { id, username, name, threads_profile_picture_url } = infoResponse.data;
        console.log(`[THREADS] Successfully fetched info for user: ${username} (${id})`);

        // Exchange for long-lived token (Try-catch for safety if credentials fail)
        let finalToken = cleanToken;
        let expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
        let tokenType = 'short_lived';

        try {
            const longLivedResult = await exchangeForLongLivedToken(cleanToken);
            if (longLivedResult && longLivedResult.token) {
                finalToken = longLivedResult.token;
                expiresAt = longLivedResult.expiresAt;
                tokenType = longLivedResult.type;
                console.log('[THREADS] Successfully upgraded to long-lived token (60 days).');
            }
        } catch (llError) {
            console.warn('[THREADS] Long-lived token exchange failed, using short-lived fallback:', llError.message);
        }

        const result = await addThreadsAccount(
            name || username || 'Threads Account',
            finalToken,
            id,
            username,
            threads_profile_picture_url,
            userId,
            expiresAt,
            tokenType
        );

        return { success: true, account: result };
    } catch (error) {
        const metaErrorData = error.response?.data?.error || error.response?.data || {};
        const metaMessage = metaErrorData.message || error.message;
        const metaCode = metaErrorData.code;
        
        console.error('[THREADS] Add account error details:', JSON.stringify({
            message: metaMessage,
            code: metaCode,
            fullData: error.response?.data || error.message
        }));
        
        let userFriendlyError = metaMessage;
        
        if (metaMessage.includes('Cannot parse access token') || metaMessage.includes('Invalid OAuth 2.0 Access Token')) {
            userFriendlyError = 'Token inválido ou malformado. Certifique-se de que o App ID e Secret estão corretos e que o token/código é válido.';
        } else if (metaCode === 190) {
            userFriendlyError = 'O token fornecido expirou ou é inválido. Por favor, gere um novo.';
        } else if (metaCode === 10 || metaMessage.includes('Permission')) {
            userFriendlyError = 'Permissão insuficiente. Verifique os escopos "threads_basic" e "threads_content_publish".';
        }

        return { success: false, error: userFriendlyError, details: metaErrorData };
    }
}

/**
 * Get credentials for a specific account
 */
async function getCredentials(dbAccountId = null, userId = 1) {
    if (dbAccountId) {
        const account = await getThreadsAccountById(dbAccountId, userId);
        if (!account) throw new Error(`Conta Threads ${dbAccountId} não encontrada para o usuário ${userId}.`);
        return { token: account.access_token, id: account.account_id, userId: account.user_id };
    }
    
    const accounts = await getThreadsAccounts(userId);
    if (accounts.length > 0) {
        return { token: accounts[0].access_token, id: accounts[0].account_id, userId: accounts[0].user_id };
    }

    throw new Error('Nenhuma conta Threads configurada.');
}

/**
 * Wait for media processing (similar to Instagram)
 */
async function waitForProcessing(containerId, token, maxAttempts = 30) {
    let status = 'IN_PROGRESS';
    let attempts = 0;

    while (status !== 'FINISHED' && status !== 'PUBLISHED' && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        const res = await axios.get(`https://graph.threads.net/v1.0/${containerId}`, {
            params: {
                fields: 'status,error_message',
                access_token: token
            }
        });
        status = res.data.status;
        if (status === 'ERROR') throw new Error(res.data.error_message || 'Erro no processamento do Threads');
        attempts++;
    }
    return true;
}

/**
 * Post to Threads (Generic function)
 */
export async function postThread(content, dbAccountId = null, userId = 1) {
    const { token, id, finalUserId } = await getCredentials(dbAccountId, userId);
    
    const action = async () => {
        console.log(`[THREADS] Creating thread for account ${id}...`);

        // 1. Create Container
        // NOTE: Threads API ALWAYS requires media_type, even for text-only posts
        const payload = {
            access_token: token,
            text: content.text,
            media_type: 'TEXT'  // Default - required by Threads API
        };

        if (content.mediaUrl) {
            console.log(`[THREADS] Processing media for bridge: ${content.mediaUrl}`);
            const bridgeResult = await maybeBridgeMedia(content.mediaUrl, userId);
            const finalMediaUrl = bridgeResult.url;
            console.log(`[THREADS] Media bridged to: ${finalMediaUrl}`);

            const isVideo = content.mediaType === 'video' || finalMediaUrl.match(/\.(mp4|mov)$/i);
            payload.media_type = isVideo ? 'VIDEO' : 'IMAGE';  // Override TEXT
            if (isVideo) {
                payload.video_url = finalMediaUrl;
            } else {
                payload.image_url = finalMediaUrl;
            }
        }

        const containerRes = await axios.post(`https://graph.threads.net/v1.0/${id}/threads`, payload);
        const containerId = containerRes.data.id;

        // 2. Wait if media is involved
        if (content.mediaUrl) {
            await waitForProcessing(containerId, token);
        }

        // 3. Publish
        const publishRes = await axios.post(`https://graph.threads.net/v1.0/${id}/threads_publish`, {
            creation_id: containerId,
            access_token: token
        });

        return { success: true, mediaId: publishRes.data.id };
    };

    return await wrapMetaAction(userId, action, 'threads', id);
}

/**
 * Post Shopee Product to Threads
 */
export async function postProductThreads(product, messageTemplate, groupLink, customHashtags = [], dbAccountId = null, userId = 1, options = {}) {
    const { token, id, finalUserId } = await getCredentials(dbAccountId, userId);
    const { mediaMode = 'any', contentType = 'shopee' } = options;

    const action = async () => {
        // Format caption (Reusing Instagram logic patterns)
        const price = product.price || 0;
        const realPrice = price.toFixed(2);
        
        let caption = messageTemplate
            .replace(/{product_name}/g, product.productName || product.name || '')
            .replace(/{preco_com_desconto}/g, realPrice)
            .replace(/{link}/g, product.affiliateLink || product.link || '')
            .replace(/\[LINK_DO_GRUPO\]/g, groupLink || '');

        const smartTags = generateSmartTags(product.productName || product.name || '');
        const hashtags = [...new Set([...customHashtags, ...smartTags.split(' ')])].map(t => `#${t.replace('#', '')}`).join(' ');
        
        caption += `\n\n${hashtags}`;

        // MEDIA SELECTION LOGIC
        let mediaUrl = null;
        let mediaType = 'image';

        if (contentType === 'text') {
            mediaUrl = null;
        } else if (contentType === 'image') {
            mediaUrl = product.imageUrl || (product.images && product.images[0]);
            mediaType = 'image';
        } else if (contentType === 'video') {
            mediaUrl = product.videoUrl;
            mediaType = 'video';
            if (!mediaUrl) throw new Error('Produto sem vídeo disponível');
        } else {
            // Shopee mode
            if (mediaMode === 'video_only') {
                mediaUrl = product.videoUrl;
                mediaType = 'video';
                if (!mediaUrl) throw new Error('Produto sem vídeo (filtro: Apenas Vídeo)');
            } else if (mediaMode === 'image_only') {
                mediaUrl = product.imageUrl || (product.images && product.images[0]);
                mediaType = 'image';
            } else if (mediaMode === 'video_preferred') {
                mediaUrl = product.videoUrl || product.imageUrl || (product.images && product.images[0]);
                mediaType = product.videoUrl ? 'video' : 'image';
            } else {
                // 'any'
                mediaUrl = product.videoUrl || product.imageUrl || (product.images && product.images[0]);
                mediaType = product.videoUrl ? 'video' : 'image';
            }
        }

        return await postThread({
            text: caption,
            mediaUrl: mediaUrl,
            mediaType: mediaType
        }, dbAccountId, userId);
    };

    return await wrapMetaAction(userId, action, 'threads', id);
}

/**
 * Get comments/replies for a specific thread
 */
export async function getThreadComments(threadId, dbAccountId = null, userId = 1) {
    const { token } = await getCredentials(dbAccountId, userId);
    
    try {
        const response = await axios.get(`https://graph.threads.net/v1.0/${threadId}/replies`, {
            params: {
                fields: 'id,text,timestamp,username,permalink',
                access_token: token
            }
        });
        return { success: true, data: response.data.data || [] };
    } catch (error) {
        const metaCode = error.response?.data?.error?.code;
        const metaMessage = error.response?.data?.error?.message || error.message;
        if (metaCode === 10) {
            // Suppress noisy log for expected permission errors (threads_read_replies)
            return { success: false, error: `permission denied (code 10): ${metaMessage}` };
        }
        console.error('[THREADS] Error fetching comments:', error.response?.data || error.message);
        return { success: false, error: metaMessage };
    }
}

/**
 * Reply to a specific thread or comment
 */
export async function replyToThread(parentThreadId, text, dbAccountId = null, userId = 1) {
    const { token, id, finalUserId } = await getCredentials(dbAccountId, userId);

    const action = async () => {
        console.log(`[THREADS] Replying to thread ${parentThreadId}...`);

        // 1. Create Reply Container
        const containerRes = await axios.post(`https://graph.threads.net/v1.0/${id}/threads`, null, {
            params: {
                access_token: token,
                text: text,
                reply_to_id: parentThreadId
            }
        });
        
        const containerId = containerRes.data.id;

        // 2. Wait for processing (replies are fast but safety first)
        await waitForProcessing(containerId, token);

        // 3. Publish Reply
        const publishRes = await axios.post(`https://graph.threads.net/v1.0/${id}/threads_publish`, null, {
            params: {
                creation_id: containerId,
                access_token: token
            }
        });

        return { success: true, mediaId: publishRes.data.id };
    };

    return await wrapMetaAction(userId, action, 'threads', id);
}

/**
 * Get insights for a specific thread
 */
export async function getThreadInsights(threadId, dbAccountId = null) {
    const { token } = await getCredentials(dbAccountId);
    
    try {
        const response = await axios.get(`https://graph.threads.net/v1.0/${threadId}/insights`, {
            params: {
                metric: 'views,likes,replies,reposts,quotes',
                access_token: token
            }
        });
        return { success: true, insights: response.data.data || [] };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Get insights for the entire account
 */
export async function getAccountInsights(dbAccountId = null, userId = 1) {
    const { token, id } = await getCredentials(dbAccountId, userId);
    
    try {
        // 1. Get basic profile info (follower_count is NOT a /me field - use threads_insights instead)
        const userRes = await axios.get(`https://graph.threads.net/v1.0/me`, {
            params: {
                fields: 'id,username,threads_profile_picture_url',
                access_token: token
            }
        });

        // 2. Get aggregate insights including follower count via threads_insights metric
        const insightsRes = await axios.get(`https://graph.threads.net/v1.0/${id}/threads_insights`, {
            params: {
                metric: 'views,likes,replies,reposts,quotes,followers_count',
                access_token: token
            }
        });

        // Parse insights into flat object for the UI
        const rawInsights = insightsRes.data.data || [];
        const insightMap = {};
        rawInsights.forEach((item) => {
            insightMap[item.name] = item.values?.[0]?.value || item.total_value?.value || 0;
        });

        return { 
            success: true, 
            profile: userRes.data,
            insights: insightMap,
            // Flat metrics for display cards:
            views: insightMap.views || 0,
            likes: insightMap.likes || 0,
            replies: insightMap.replies || 0,
            reposts: insightMap.reposts || 0,
        };
    } catch (error) {
        console.error('[THREADS] Error fetching account insights:', error.response?.data || error.message);
        return { success: false, error: error.response?.data?.error?.message || error.message };
    }
}
/**
 * Entry point for publishing a post (used by server.js)
 */
export async function publishPost(dbAccountId, text, mediaUrl, mediaType, userId) {
    return await postThread({
        text,
        mediaUrl,
        mediaType
    }, dbAccountId, userId);
}
