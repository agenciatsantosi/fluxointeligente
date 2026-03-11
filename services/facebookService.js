import axios from 'axios';
import * as db from './database.js';
import path from 'path';
import { uploadToTelegramBridge, deleteTelegramMessage } from './telegramService.js';

// Facebook Graph API configuration
const GRAPH_API_VERSION = 'v18.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

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
 * Post text message to Facebook page
 */
export async function postMessage(pageId, accessToken, message) {
    try {
        const response = await axios.post(
            `${GRAPH_API_BASE}/${pageId}/feed`,
            {
                message: message
            },
            {
                params: {
                    access_token: accessToken
                }
            }
        );

        console.log(`[FACEBOOK] Message posted to page ${pageId}`);
        return {
            success: true,
            postId: response.data.id
        };
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
export async function postPhoto(pageId, accessToken, imageUrl, caption) {
    try {
        const response = await axios.post(
            `${GRAPH_API_BASE}/${pageId}/photos`,
            {
                url: imageUrl,
                caption: caption
            },
            {
                params: {
                    access_token: accessToken
                }
            }
        );

        console.log(`[FACEBOOK] Photo posted to page ${pageId}`);
        return {
            success: true,
            postId: response.data.id
        };
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
export async function postVideo(pageId, accessToken, videoUrl, description) {
    try {
        const response = await axios.post(
            `${GRAPH_API_BASE}/${pageId}/videos`,
            {
                file_url: videoUrl,
                description: description
            },
            {
                params: {
                    access_token: accessToken
                }
            }
        );

        console.log(`[FACEBOOK] Video posted to page ${pageId}`);
        return {
            success: true,
            postId: response.data.id
        };
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
export async function postStory(pageId, accessToken, mediaUrl, mediaType) {
    let telegramMessageId = null;
    try {
        let finalMediaUrl = mediaUrl;

        // --- TELEGRAM BRIDGE LOGIC ---
        const bridgeEnabled = await db.getSystemConfig('telegram_bridge_enabled');
        if (bridgeEnabled === 'true' || bridgeEnabled === true) {
            const bridgeToken = await db.getSystemConfig('telegram_bridge_bot_token');
            const bridgeChatId = await db.getSystemConfig('telegram_bridge_chat_id');

            if (bridgeToken && bridgeChatId) {
                try {
                    console.log('[STORY FB] Using Telegram Bridge for story upload...');
                    let localPath = mediaUrl;
                    if (mediaUrl.includes('/uploads/')) {
                        const relativePath = mediaUrl.split('/uploads/')[1];
                        localPath = path.join(process.cwd(), 'uploads', relativePath);
                    }
                    const bridgeData = await uploadToTelegramBridge(bridgeToken, bridgeChatId, localPath);
                    finalMediaUrl = bridgeData.fileUrl;
                    telegramMessageId = bridgeData.messageId;
                    console.log(`[STORY FB] Story bridged via Telegram: ${finalMediaUrl}`);
                } catch (bridgeErr) {
                    console.error('[STORY FB] Telegram Bridge failed, falling back to original URL:', bridgeErr.message);
                }
            }
        }

        if (mediaType === 'video') {
            // For FB Pages, Video Stories are best handled via the Reels API
            // Step 1: Initialize Reel
            const initRes = await axios.post(`${GRAPH_API_BASE}/${pageId}/video_reels`, null, {
                params: {
                    upload_phase: 'start',
                    access_token: accessToken
                }
            });

            const videoId = initRes.data.video_id;
            console.log(`[STORY FB] Reel initialized: ${videoId}`);

            // Step 2: Upload via URL (Meta supports this in some versions for Reels)
            // Note: If this fails, we might need a more complex multipart upload
            const uploadRes = await axios.post(`${GRAPH_API_BASE}/${videoId}`, null, {
                params: {
                    video_url: finalMediaUrl,
                    access_token: accessToken
                }
            });

            // Step 3: Finish and Publish
            const finishRes = await axios.post(`${GRAPH_API_BASE}/${pageId}/video_reels`, null, {
                params: {
                    upload_phase: 'finish',
                    video_id: videoId,
                    video_state: 'PUBLISHED',
                    access_token: accessToken
                }
            });

            // Cleanup Telegram Bridge
            if (telegramMessageId) {
                const bridgeToken = await db.getSystemConfig('telegram_bridge_bot_token');
                const bridgeChatId = await db.getSystemConfig('telegram_bridge_chat_id');
                await deleteTelegramMessage(bridgeToken, bridgeChatId, telegramMessageId);
            }

            return { success: true, postId: videoId };
        } else {
            // Photo Story
            // 1. Post photo as unpublished
            const photoRes = await axios.post(`${GRAPH_API_BASE}/${pageId}/photos`, {
                url: finalMediaUrl,
                published: false,
                access_token: accessToken
            });

            const photoId = photoRes.data.id;

            // 2. Publish to photo_stories
            const storyRes = await axios.post(`${GRAPH_API_BASE}/${pageId}/photo_stories`, {
                photo_id: photoId,
                access_token: accessToken
            });

            // Cleanup Telegram Bridge
            if (telegramMessageId) {
                const bridgeToken = await db.getSystemConfig('telegram_bridge_bot_token');
                const bridgeChatId = await db.getSystemConfig('telegram_bridge_chat_id');
                await deleteTelegramMessage(bridgeToken, bridgeChatId, telegramMessageId);
            }

            return { success: true, postId: storyRes.data.id };
        }
    } catch (error) {
        console.error('[FACEBOOK] Post Story error:', error.response?.data || error.message);
        
        // Cleanup on failed attempt
        if (telegramMessageId) {
            try {
                const bridgeToken = await db.getSystemConfig('telegram_bridge_bot_token');
                const bridgeChatId = await db.getSystemConfig('telegram_bridge_chat_id');
                await deleteTelegramMessage(bridgeToken, bridgeChatId, telegramMessageId);
            } catch (cleanupErr) {
                console.warn('[STORY FB] Failed cleanup:', cleanupErr.message);
            }
        }

        return {
            success: false,
            error: error.response?.data?.error?.message || error.message
        };
    }
}


/**
 * Post product to Facebook page
 */
export async function postProduct(pageId, accessToken, product, template, mediaType = 'auto') {
    try {
        // Format message using template
        const price = product.price || 0;
        // Estratégia de Marketing: 
        // Preço "DE" = Preço Real + 50% (Fake)
        // Preço "HOJE" = Preço Real
        const fakeOriginalPrice = price * 1.5;
        const realPrice = price;

        let message = template
            .replace(/{nome_produto}/g, product.productName || product.name)
            .replace(/{preco_original}/g, fakeOriginalPrice.toFixed(2))
            .replace(/{preco_com_desconto}/g, realPrice.toFixed(2))
            .replace(/{comissao}/g, product.commission?.toFixed(2) || '0.00')
            .replace(/{taxa}/g, product.commissionRate?.toFixed(1) || '0.0')
            .replace(/{link}/g, product.affiliateLink || product.link)
            .replace(/{desconto}/g, '50')
            .replace(/{avaliacao}/g, product.rating || 'N/A');

        // Determine if should send image
        const hasImage = product.imagePath || product.imageUrl;
        const shouldSendImage = mediaType === 'auto' || mediaType === 'image';

        if (hasImage && shouldSendImage) {
            const imageUrl = product.imagePath || product.imageUrl;
            return await postPhoto(pageId, accessToken, imageUrl, message);
        } else {
            return await postMessage(pageId, accessToken, message);
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
export async function sendPrivateReply(commentId, message, accessToken, senderId = null, pageId = null) {
    // If we have the sender's PSID, use the Messenger /messages endpoint directly
    if (senderId && pageId) {
        try {
            const response = await axios.post(
                `${GRAPH_API_BASE}/${pageId}/messages`,
                {
                    recipient: { id: senderId },
                    message: { text: message },
                    messaging_type: 'RESPONSE'
                },
                {
                    params: { access_token: accessToken }
                }
            );
            console.log(`[FACEBOOK] ✅ Messenger DM sent to PSID ${senderId}`);
            return { success: true, id: response.data.message_id };
        } catch (err) {
            console.error('[FACEBOOK] Messenger DM error:', err.response?.data || err.message);
            // Fallback: try using private_replies with comment_id
        }
    }

    // Fallback: private_replies endpoint (works in Development mode or with Advanced Access)
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
    postStory
};
