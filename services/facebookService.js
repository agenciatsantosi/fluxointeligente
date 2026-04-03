import axios from 'axios';
import fs from 'fs';
import * as db from './database.js';
import path from 'path';
import { uploadToTelegramBridge, deleteTelegramMessage } from './telegramService.js';
import { generateSmartTags } from './smartTags.js';

// Facebook Graph API configuration
const GRAPH_API_VERSION = 'v18.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Helper to shorten URL using is.gd (Trusted by Meta crawler)
 */
async function shortenUrl(url) {
    if (!url || (!url.includes('easypanel.host') && !url.includes('hstgr.cloud'))) return url;
    try {
        console.log(`[FACEBOOK] Domain block probable, shortening URL via is.gd: ${url}`);
        const response = await axios.get(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`, { timeout: 5000 });
        if (response.data && response.data.startsWith('http')) {
            const shortUrl = response.data.trim();
            console.log(`[FACEBOOK] Short URL generated: ${shortUrl}`);
            return shortUrl;
        }
    } catch (err) {
        console.warn(`[FACEBOOK] URL Shortener failed: ${err.message}. Sending original URL.`);
    }
    return url;
}

/**
 * Add a Facebook page
 */
export async function addPage(pageData, userId) {
    const page = {
        id: pageData.pageId?.toString().trim(),
        name: pageData.pageName || 'Unnamed Page',
        accessToken: pageData.accessToken?.toString().trim(),
        enabled: true,
        instagramBusinessId: pageData.instagramBusinessId,
        instagramUsername: pageData.instagramUsername,
        addedAt: new Date().toISOString()
    };

    // Save to database
    await db.saveFacebookPage(page, userId);

    console.log(`[FACEBOOK] Page added: ${page.name} (${page.id}) ${page.instagramBusinessId ? 'with IG: ' + page.instagramUsername : ''}`);

    // Subscribe page to Webhooks automatically
    try {
        await axios.post(
            `${GRAPH_API_BASE}/${page.id}/subscribed_apps`,
            { subscribed_fields: 'feed,messages' },
            { params: { access_token: page.accessToken } }
        );
        console.log(`[FACEBOOK] Page ${page.name} subscribed to Webhooks successfully.`);
    } catch (err) {
        console.warn(`[FACEBOOK] Webhook subscription failed for ${page.name}:`, err.response?.data || err.message);
    }

    return { success: true, page };
}

/**
 * Get all configured pages
 */
export async function getPages(userId) {
    return await db.getFacebookPages(userId);
}

/**
 * Remove a page
 */
export async function removePage(pageId, userId) {
    await db.removeFacebookPage(pageId, userId);
    console.log(`[FACEBOOK] Page removed: ${pageId}`);
    return { success: true };
}

/**
 * Toggle page enabled status
 */
export async function togglePage(pageId, userId) {
    return await db.toggleFacebookPage(pageId, userId);
}

/**
 * Verify page access token
 */
export async function verifyPageToken(pageId, accessToken) {
    try {
        const cleanId = pageId?.toString().trim();
        const cleanToken = accessToken?.toString().trim();

        if (!cleanId || !cleanToken) {
            return { success: false, error: 'ID da Página ou Token ausentes' };
        }

        // First, try to get page info
        const response = await axios.get(`${GRAPH_API_BASE}/${cleanId}`, {
            params: {
                fields: 'id,name',
                access_token: cleanToken
            }
        });

        return {
            success: true,
            page: {
                id: response.data.id,
                name: response.data.name
            }
        };
    } catch (error) {
        console.error('[FACEBOOK] Token verification error:', JSON.stringify(error.response?.data || error.message, null, 2));

        // Provide helpful error messages
        let errorMessage = 'Erro ao verificar token';

        if (error.response?.data?.error) {
            const fbError = error.response.data.error;

            if (fbError.message.includes('does not exist')) {
                errorMessage = `❌ Page ID incorreto ou você não tem acesso a esta página.

💡 Dica: Verifique se:
- O Page ID está correto
- Você é administrador da página
- O token foi gerado para esta página específica`;
            } else if (fbError.message.includes('permissions') || fbError.message.includes('missing')) {
                errorMessage = `❌ Token sem permissões necessárias.

💡 Solução:
1. Vá em Graph API Explorer
2. Gere um novo token
3. Marque as permissões: pages_manage_posts, pages_read_engagement
4. Certifique-se de selecionar SUA PÁGINA (não seu perfil)`;
            } else if (fbError.code === 190) {
                errorMessage = `❌ Token inválido ou expirado.

💡 Solução: Gere um novo Access Token no Facebook Developers`;
            } else {
                errorMessage = `❌ Erro do Facebook: ${fbError.message}`;
            }
        }

        return {
            success: false,
            error: errorMessage
        };
    }
}

/**
 * Helper to wait for Facebook to finish processing a video/reel
 */
async function waitForFacebookMediaProcessing(targetId, accessToken, maxAttempts = 40) {
    let status = 'processing';
    let attempts = 0;
    
    console.log(`[FACEBOOK] Polling status for media ${targetId}...`);
    
    while (attempts < maxAttempts) {
        // Wait 5s between checks
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        try {
            const statusRes = await axios.get(`${GRAPH_API_BASE}/${targetId}`, {
                params: { fields: 'status', access_token: accessToken }
            });
            
            // Handle different status formats (Reels vs regular videos)
            const statusObj = statusRes.data.status;
            status = (statusObj?.video_status || statusObj || 'processing').toLowerCase();
            
            console.log(`[FACEBOOK] Media ${targetId} status: ${status} (Attempt ${attempts + 1}/${maxAttempts})`);
            
            // Stop immediately on error - don't keep retrying
            if (status === 'error' || status === 'failed') {
                throw new Error('O Facebook recusou o arquivo de vídeo. Verifique o formato (MP4 H.264) e o tamanho do arquivo.');
            }
            
            if (status === 'ready' || status === 'published') return true;
        } catch (err) {
            // Only re-throw if it's our processing error, not a transient network error
            if (err.message.includes('recusou') || err.message.includes('Facebook reportou')) {
                throw err;
            }
            console.warn(`[FACEBOOK] Status check network error:`, err.response?.data || err.message);
        }
        attempts++;
    }
    
    throw new Error(`Timeout aguardando processamento do Facebook (Status final: ${status})`);
}

/**
 * Post text message to Facebook page
 */
export async function postMessage(pageId, accessToken, message, userId = null) {
    const action = async () => {
        const response = await axios.post(
            `${GRAPH_API_BASE}/${pageId}/feed`,
            { message: message },
            { params: { access_token: accessToken } }
        );

        console.log(`[FACEBOOK] Message posted to page ${pageId}`);
        return { success: true, postId: response.data.id };
    };

    if (userId) {
        return await wrapMetaAction(userId, action, 'facebook', pageId);
    }

    try {
        return await action();
    } catch (error) {
        console.error('[FACEBOOK] Post message error:', error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data?.error?.message || error.message
        };
    }
}

/**
 * Post photo with caption to Facebook page
 */
export async function postPhoto(pageId, accessToken, imageUrl, caption, userId = null) {
    const action = async () => {
        let currentToken = accessToken;
        
        // If we have a userId, we fetch the latest token from the DB.
        // This is CRITICAL for the retry logic in wrapMetaAction, so it uses 
        // the newly refreshed token if one was just generated.
        if (userId) {
            const pages = await getPages(userId);
            const page = pages.find(p => String(p.id) === String(pageId));
            if (page) {
                currentToken = page.accessToken || page.access_token;
                console.log(`[FACEBOOK] postPhoto using dynamic token for page ${pageId}`);
            }
        }

        const shortUrl = await shortenUrl(imageUrl);
        const isLocal = imageUrl.startsWith('/') || imageUrl.includes(':') || imageUrl.includes('\\');
        
        let response;
        if (isLocal && fs.existsSync(imageUrl)) {
            console.log(`[FACEBOOK] Uploading local photo: ${imageUrl}`);
            const FormData = (await import('form-data')).default;
            const form = new FormData();
            form.append('source', fs.createReadStream(imageUrl));
            form.append('caption', caption || '');
            
            response = await axios.post(
                `${GRAPH_API_BASE}/${pageId}/photos`,
                form,
                { 
                    params: { access_token: currentToken },
                    headers: { ...form.getHeaders() }
                }
            );
        } else {
            response = await axios.post(
                `${GRAPH_API_BASE}/${pageId}/photos`,
                { url: shortUrl, caption: caption },
                { params: { access_token: currentToken } }
            );
        }

        console.log(`[FACEBOOK] Photo posted to page ${pageId}`);
        return { success: true, postId: response.data.id };
    };

    if (userId) {
        return await wrapMetaAction(userId, action, 'facebook', pageId);
    }

    try {
        return await action();
    } catch (error) {
        console.error('[FACEBOOK] Post photo error:', error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data?.error?.message || error.message
        };
    }
}

/**
 * Post video to Facebook page
 */
export async function postVideo(pageId, accessToken, videoUrl, description, userId = null) {
    const action = async () => {
        let currentToken = accessToken;
        
        // If we have a userId, we fetch the latest token from the DB.
        // This is CRITICAL for the retry logic in wrapMetaAction, so it uses 
        // the newly refreshed token if one was just generated.
        if (userId) {
            const pages = await getPages(userId);
            const page = pages.find(p => String(p.id) === String(pageId));
            if (page) {
                currentToken = page.accessToken || page.access_token;
                console.log(`[FACEBOOK] postVideo using dynamic token for page ${pageId}`);
            }
        }

        // Robust Windows/Posix local path detection (e.g. C:\... or /usr/...)
        const isLocal = videoUrl.includes(':\\') || videoUrl.includes(':/') || videoUrl.startsWith('/') || videoUrl.startsWith('./') || videoUrl.startsWith('../');
        
        let response;
        if (isLocal && fs.existsSync(videoUrl)) {
            console.log(`[FACEBOOK] >>> UPLOAD BINÁRIO ATIVADO p/ arquivo local: ${videoUrl}`);
            const FormData = (await import('form-data')).default;
            const form = new FormData();
            form.append('source', fs.createReadStream(videoUrl));
            form.append('description', description || '');
            
            response = await axios.post(
                `${GRAPH_API_BASE}/${pageId}/videos`,
                form,
                { 
                    params: { access_token: currentToken },
                    headers: { ...form.getHeaders() },
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity
                }
            );
        } else {
            response = await axios.post(
                `${GRAPH_API_BASE}/${pageId}/videos`,
                { file_url: videoUrl, description: description },
                { params: { access_token: currentToken } }
            );
        }

        console.log(`[FACEBOOK] Video posted to page ${pageId}`);
        await waitForFacebookMediaProcessing(response.data.id, currentToken, 60);
        return { success: true, postId: response.data.id };
    };

    if (userId) {
        return await wrapMetaAction(userId, action, 'facebook', pageId);
    }

    try {
        return await action();
    } catch (error) {
        console.error('[FACEBOOK] Post video error:', error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data?.error?.message || error.message
        };
    }
}

/**
 * Post Story (Image or Video) to Facebook page
 */
export async function postStory(pageId, accessToken, mediaUrl, mediaType, userId = null) {
    if (!accessToken) {
        throw new Error('Facebook Access Token is missing. Please reconnect your account or select a page.');
    }
    
    const action = async () => {
        let telegramMessageId = null;
        try {
            let finalMediaUrl = mediaUrl;

            // --- TELEGRAM BRIDGE LOGIC ---
            const cleanMediaUrl = String(mediaUrl).trim();
            const isLocal = cleanMediaUrl.includes('localhost') || cleanMediaUrl.includes('127.0.0.1') || cleanMediaUrl.startsWith('/uploads/');
            const isTelegram = cleanMediaUrl.includes('api.telegram.org');

            // 1. Tentar usar PUBLIC_URL do sistema se a mídia for local
            if (isLocal) {
                try {
                    const systemPublicUrl = await db.getSystemConfig('system_public_url');
                    if (systemPublicUrl && !systemPublicUrl.includes('localhost')) {
                        let relativePath = cleanMediaUrl;
                        if (cleanMediaUrl.includes('/uploads/')) {
                            const parts = cleanMediaUrl.split('/uploads/');
                            relativePath = parts[parts.length - 1];
                            finalMediaUrl = `${systemPublicUrl.replace(/\/$/, '')}/uploads/${relativePath}`;
                            console.log(`[STORY FB] Local media resolved via PUBLIC_URL: ${finalMediaUrl}`);
                        }
                    }
                } catch (configErr) {
                    console.warn('[STORY FB] Failed to fetch system_public_url:', configErr.message);
                }
            }

            // 2. Se for uma URL pública direta (não local e não telegram), usa diretamente
            if (!isLocal && !isTelegram && (cleanMediaUrl.startsWith('http://') || cleanMediaUrl.startsWith('https://'))) {
                console.log(`[STORY FB] Direct public URL detected: ${cleanMediaUrl}`);
                finalMediaUrl = cleanMediaUrl;
            } else if (!finalMediaUrl.startsWith('http') || isLocal) {
                // 3. Fallback: Telegram Bridge
                const bridgeEnabled = await db.getSystemConfig('telegram_bridge_enabled');
                if (bridgeEnabled === 'true' || bridgeEnabled === true) {
                    const bridgeToken = await db.getSystemConfig('telegram_bridge_bot_token');
                    const bridgeChatId = await db.getSystemConfig('telegram_bridge_chat_id');

                    if (bridgeToken && bridgeChatId) {
                        try {
                            console.log('[STORY FB] Using Telegram Bridge for story upload...');
                            let localPath = cleanMediaUrl;
                            if (cleanMediaUrl.includes('/uploads/')) {
                                const relativePath = cleanMediaUrl.split('/uploads/')[1];
                                localPath = path.join(process.cwd(), 'uploads', relativePath);
                            }
                            const bridgeData = await uploadToTelegramBridge(bridgeToken, bridgeChatId, localPath);
                            finalMediaUrl = bridgeData.fileUrl;
                            telegramMessageId = bridgeData.messageId;
                            console.log(`[STORY FB] Story bridged via Telegram: ${finalMediaUrl}`);
                        } catch (bridgeErr) {
                            console.error('[STORY FB] Telegram Bridge failed, falling back to original URL:', bridgeErr.message);
                            finalMediaUrl = cleanMediaUrl;
                        }
                    }
                }
            }

            // Se a URL final ainda for um caminho local ou omitir HTTP, o Meta vai rejeitar.
            if (!finalMediaUrl.startsWith('http') || finalMediaUrl.includes('127.0.0.1') || finalMediaUrl.includes('localhost')) {
                throw new Error('Falha no Upload do Story: O Meta exige links públicos. Configure a "URL Pública do Sistema" nas configurações ou ative corretamente o Telegram Bridge para converter uploads locais.');
            }

            // Final safety: shorten URL if it's a known blocked domain
            finalMediaUrl = await shortenUrl(finalMediaUrl);

            if (mediaType === 'video') {
                const initRes = await axios.post(`${GRAPH_API_BASE}/${pageId}/video_reels`, null, {
                    params: { upload_phase: 'start', access_token: accessToken }
                });

                const videoId = initRes.data.video_id;
                console.log(`[STORY FB] Reel initialized: ${videoId}`);

                await axios.post(`${GRAPH_API_BASE}/${videoId}`, null, {
                    params: { video_url: finalMediaUrl, access_token: accessToken }
                });

                await waitForFacebookMediaProcessing(videoId, accessToken, 40);
                
                await axios.post(`${GRAPH_API_BASE}/${pageId}/video_reels`, null, {
                    params: { upload_phase: 'finish', video_id: videoId, video_state: 'PUBLISHED', access_token: accessToken }
                });

                if (telegramMessageId) {
                    const bridgeToken = await db.getSystemConfig('telegram_bridge_bot_token');
                    const bridgeChatId = await db.getSystemConfig('telegram_bridge_chat_id');
                    await deleteTelegramMessage(bridgeToken, bridgeChatId, telegramMessageId);
                }

                return { success: true, postId: videoId };
            } else {
                const photoRes = await axios.post(`${GRAPH_API_BASE}/${pageId}/photos`, {
                    url: finalMediaUrl,
                    published: false,
                    access_token: accessToken
                });

                const photoId = photoRes.data.id;
                const storyRes = await axios.post(`${GRAPH_API_BASE}/${pageId}/photo_stories`, {
                    photo_id: photoId,
                    access_token: accessToken
                });

                if (telegramMessageId) {
                    const bridgeToken = await db.getSystemConfig('telegram_bridge_bot_token');
                    const bridgeChatId = await db.getSystemConfig('telegram_bridge_chat_id');
                    await deleteTelegramMessage(bridgeToken, bridgeChatId, telegramMessageId);
                }

                return { success: true, postId: storyRes.data.id };
            }
        } catch (error) {
            if (telegramMessageId) {
                try {
                    const bridgeToken = await db.getSystemConfig('telegram_bridge_bot_token');
                    const bridgeChatId = await db.getSystemConfig('telegram_bridge_chat_id');
                    await deleteTelegramMessage(bridgeToken, bridgeChatId, telegramMessageId);
                } catch (cleanupErr) {}
            }
            throw error;
        }
    };

    if (userId) {
        return await wrapMetaAction(userId, action, 'facebook', pageId);
    }

    try {
        return await action();
    } catch (error) {
        console.error('[FACEBOOK] Post Story error:', error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data?.error?.message || error.message
        };
    }
}


/**
 * Post product to Facebook page
 */
export async function postProduct(pageId, accessToken, product, template, mediaType = 'auto', userId = null) {
    try {
        // Format message using template
        const price = product.price || 0;
        const fakeOriginalPrice = price * 1.5;
        const realPrice = price;

        let message = template
            .replace(/{nome_produto}/g, product.productName || product.name || '')
            .replace(/{product_name}/g, product.productName || product.name || '')
            .replace(/{preco_original}/g, fakeOriginalPrice.toFixed(2))
            .replace(/{preco_com_desconto}/g, realPrice.toFixed(2))
            .replace(/{comissao}/g, product.commission?.toFixed(2) || '0.00')
            .replace(/{taxa}/g, product.commissionRate?.toFixed(1) || '0.0')
            .replace(/{product_link}/g, product.affiliateLink || product.link || '')
            .replace(/{link}/g, product.affiliateLink || product.link || '')
            .replace(/{desconto}/g, '50')
            .replace(/{avaliacao}/g, product.rating || 'N/A');

        const productName = product.productName || product.name || '';
        const smartTags = generateSmartTags(productName);
        if (smartTags && !message.includes('{smart_tags}')) {
            message += `\n\n${smartTags}`;
        } else if (smartTags) {
            message = message.replace(/{smart_tags}/g, smartTags);
        } else {
            message = message.replace(/{smart_tags}/g, '');
        }

        // Determine media to send (Prioritize video if mediaType is auto)
        const video = (product.videos && product.videos.length > 0) ? product.videos[0] : (product.videoUrl || product.videoPath);
        const image = (product.images && product.images.length > 0) ? product.images[0] : (product.imageUrl || product.imagePath);

        const shouldSendVideo = (mediaType === 'auto' || mediaType === 'video') && video;
        const shouldSendImage = (mediaType === 'auto' || mediaType === 'image') && image;

        if (shouldSendVideo) {
            return await postVideo(pageId, accessToken, video, message, userId);
        } else if (shouldSendImage) {
            return await postPhoto(pageId, accessToken, image, message, userId);
        } else {
            return await postMessage(pageId, accessToken, message, userId);
        }
    } catch (error) {
        console.error('[FACEBOOK] Post product error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Get linked Instagram Business account for a Page
 */
export async function getLinkedInstagramAccount(pageId, accessToken) {
    try {
        const response = await axios.get(`${GRAPH_API_BASE}/${pageId}`, {
            params: {
                fields: 'instagram_business_account{id,username,name,profile_picture_url}',
                access_token: accessToken
            }
        });

        if (response.data.instagram_business_account) {
            return {
                success: true,
                instagramAccount: response.data.instagram_business_account
            };
        } else {
            return {
                success: false,
                error: 'Nenhuma conta do Instagram Business vinculada a esta página foi encontrada.'
            };
        }
    } catch (error) {
        console.error('[FACEBOOK] Get linked IG error:', error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data?.error?.message || error.message
        };
    }
}

/**
 * List all pages managed by the user token
 */
export async function listAvailablePages(userAccessToken) {
    try {
        // 1. Try to get all accounts managed by this user
        const response = await axios.get(`${GRAPH_API_BASE}/me/accounts`, {
            params: {
                fields: 'id,name,access_token,category,picture,instagram_business_account{id,username,name}',
                access_token: userAccessToken,
                limit: 100
            }
        });

        let pages = response.data.data || [];

        // 2. If no accounts found, maybe it's already a Page Token?
        if (pages.length === 0) {
            try {
                const meResponse = await axios.get(`${GRAPH_API_BASE}/me`, {
                    params: {
                        fields: 'id,name,access_token,category,picture',
                        access_token: userAccessToken
                    }
                });

                // If it has a category, it's likely a Page
                if (meResponse.data.category) {
                    pages = [meResponse.data];
                }
            } catch (meErr) {
                console.log('[FACEBOOK] Fallback to /me failed, likely not a page token.');
            }
        }

        return {
            success: true,
            pages: pages
        };
    } catch (error) {
        console.error('[FACEBOOK] List pages error:', JSON.stringify(error.response?.data || error.message, null, 2));
        return {
            success: false,
            error: error.response?.data?.error?.message || 'Erro ao listar páginas. Verifique seu User Token.'
        };
    }
}

export async function getPageInsights(pageId, accessToken) {
    try {
        const response = await axios.get(
            `${GRAPH_API_BASE}/${pageId}/insights`,
            {
                params: {
                    metric: 'page_impressions,page_engaged_users,page_post_engagements',
                    period: 'day',
                    access_token: accessToken
                }
            }
        );

        return {
            success: true,
            insights: response.data.data
        };
    } catch (error) {
        console.error('[FACEBOOK] Get insights error:', error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data?.error?.message || error.message
        };
    }
}

/**
 * Reply to a specific Facebook comment
 */
export async function replyToComment(commentId, message, accessToken) {
    try {
        const response = await axios.post(
            `${GRAPH_API_BASE}/${commentId}/comments`,
            {
                message: message
            },
            {
                params: {
                    access_token: accessToken
                }
            }
        );
        return { success: true, id: response.data.id };
    } catch (error) {
        console.error('[FACEBOOK] Reply comment error:', error.response?.data || error.message);
        return { success: false, error: error.response?.data?.error?.message || error.message };
    }
}

/**
 * Send a Messenger DM to a user who commented (using sender's PSID)
 * This replaces the private_replies endpoint which requires Advanced App Review
 */
export async function sendPrivateReply(commentId, message, accessToken, senderId = null, pageId = null, button = null) {
    // If we have the sender's PSID, use the Messenger /messages endpoint directly
    if (senderId && pageId) {
        try {
            let messageData = { text: message };
            
            // If button is provided, use a Button Template
            if (button && button.text && button.url) {
                console.log(`[FACEBOOK] Preparing Button Template for PSID ${senderId}: ${button.text}`);
                messageData = {
                    attachment: {
                        type: 'template',
                        payload: {
                            template_type: 'button',
                            text: message,
                            buttons: [
                                {
                                    type: 'web_url',
                                    url: button.url,
                                    title: button.text.substring(0, 20) // Meta limit is 20 chars for buttons
                                }
                            ]
                        }
                    }
                };
            }

            const response = await axios.post(
                `${GRAPH_API_BASE}/${pageId}/messages`,
                {
                    recipient: { id: senderId },
                    message: messageData,
                    messaging_type: 'RESPONSE'
                },
                {
                    params: { access_token: accessToken }
                }
            );
            console.log(`[FACEBOOK] ✅ Messenger DM sent to PSID ${senderId} ${button ? 'with button' : '(text only)'}`);
            return { success: true, id: response.data.message_id };
        } catch (err) {
            console.error('[FACEBOOK] Messenger DM error:', err.response?.data || err.message);
            // Fallback: try using private_replies with comment_id (text only)
        }
    }

    // Fallback: private_replies endpoint (only supports text)
    try {
        const response = await axios.post(
            `${GRAPH_API_BASE}/${commentId}/private_replies`,
            { message: message },
            { params: { access_token: accessToken } }
        );
        return { success: true, id: response.data.id };
    } catch (error) {
        console.error('[FACEBOOK] Private reply error:', error.response?.data || error.message);
        return { success: false, error: error.response?.data?.error?.message || error.message };
    }
}

export default {
    addPage,
    getPages,
    removePage,
    togglePage,
    verifyPageToken,
    postMessage,
    postPhoto,
    postProduct,
    getPageInsights,
    listAvailablePages,
    replyToComment,
    sendPrivateReply,
    postStory,
    refreshAllUserPages
};

/**
 * Automatically refresh all connected Facebook Pages and Instagram accounts
 * using a new User Access Token.
 */
export async function refreshAllUserPages(userId, userAccessToken) {
    try {
        console.log(`[FACEBOOK] Iniciando renovação automática de tokens para o usuário ${userId}...`);
        
        // 1. Get all pages managed by this user token
        const result = await listAvailablePages(userAccessToken);
        if (!result.success || !result.pages) {
            console.error('[FACEBOOK] Erro ao listar páginas para renovação:', result.error);
            return { success: false, error: result.error };
        }

        const availablePages = result.pages;
        
        // 2. Get pages already in our database for this user
        const currentPages = await getPages(userId);
        
        let updateCount = 0;
        let igUpdateCount = 0;
        for (const currentPage of currentPages) {
            // Find this page in the fresh list from Meta
            const freshPage = availablePages.find(p => String(p.id) === String(currentPage.id));
            
            if (freshPage && freshPage.access_token) {
                console.log(`[FACEBOOK] Renovando token para a página: ${currentPage.name} (${currentPage.id})`);
                
                // 1. Update the page in database
                await db.saveFacebookPage({
                    id: freshPage.id,
                    name: freshPage.name,
                    accessToken: freshPage.access_token,
                    enabled: currentPage.enabled,
                    instagramBusinessId: freshPage.instagram_business_account?.id || currentPage.instagramBusinessId,
                    instagramUsername: freshPage.instagram_business_account?.username || (currentPage.instagramUsername || null)
                }, userId);
                
                // 2. If it has an Instagram account linked, update it too
                if (freshPage.instagram_business_account) {
                    console.log(`[INSTAGRAM] Sincronizando conta vinculada: @${freshPage.instagram_business_account.username}`);
                    
                    // Use the existing addInstagramAccount (now as an UPSERT)
                    await db.addInstagramAccount(
                        freshPage.instagram_business_account.name || freshPage.instagram_business_account.username,
                        freshPage.access_token, // Instagram uses the Page Token
                        freshPage.instagram_business_account.id,
                        freshPage.instagram_business_account.username,
                        null, // Profile Pic
                        userId
                    );
                    igUpdateCount++;
                }
                
                updateCount++;
            }
        }

        console.log(`[FACEBOOK] Renovação concluída. ${updateCount} páginas e ${igUpdateCount} contas IG sincronizadas.`);
        return { success: true, updated: updateCount, instagramUpdated: igUpdateCount };
    } catch (error) {
        console.error('[FACEBOOK] Erro crítico durante a renovação automática:', error.message);
        return { success: false, error: error.message };
    }
}
/**
 * Execute a Meta action with automatic session recovery.
 * The actionFn itself fetches the token fresh from DB on each call (postVideo/postPhoto do this).
 * If the token is still expired after fetching, we mark the account as expired for the user to reconnect.
 */
export async function wrapMetaAction(userId, actionFn, platform = 'facebook', accountId = null) {
    try {
        const result = await actionFn();
        return result;
    } catch (error) {
        const errorData = error.response?.data?.error || {};
        const isSessionExpired = errorData.code === 190 || errorData.error_subcode === 463 ||
            (errorData.message && errorData.message.toLowerCase().includes('expired'));

        if (isSessionExpired) {
            console.warn(`[META] Sessão expirada para usuário ${userId}. Token da conta precisa ser renovado manualmente.`);
            console.error('[META] Erro:', errorData.message || error.message);

            // Mark account as expired in DB so the UI can show reconnect button
            if (accountId) {
                try {
                    const errorMsg = errorData.message || error.message;
                    if (platform === 'facebook') {
                        await db.updateFacebookPageStatus(accountId, userId, 'expired', errorMsg);
                    } else {
                        await db.updateInstagramAccountStatus(accountId, userId, 'expired', errorMsg);
                    }
                } catch (dbErr) {
                    // Don't crash if DB update fails
                }
            }

            return {
                success: false,
                error: 'Token expirado. Reconecte a conta na página de Contas para restaurar.',
                code: 190
            };
        }

        return {
            success: false,
            error: errorData.message || error.message,
            code: errorData.code
        };
    }
}
