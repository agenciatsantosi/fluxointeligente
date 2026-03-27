import axios from 'axios';
import path from 'path';
import fs from 'fs';
import {
    saveSystemConfig,
    getSystemConfig,
    addInstagramAccount,
    getInstagramAccounts,
    getInstagramAccountById,
    removeInstagramAccount,
    getUserConfig,
    query
} from './database.js';
import { uploadToTelegramBridge, deleteTelegramMessage } from './telegramService.js';
import { generateSmartTags } from './smartTags.js';

// Instagram Graph API configuration
let globalAccessToken = null;
let globalAccountId = null;

/**
 * Initialize Graph API from database
 */
export async function initializeGraphAPI() {
    try {
        const accounts = await getInstagramAccounts();
        if (accounts.length > 0) {
            const defaultAccount = accounts[0];
            globalAccessToken = defaultAccount.access_token;
            globalAccountId = defaultAccount.account_id;
            console.log(`[INSTAGRAM GRAPH] Initialized default account: ${defaultAccount.name}`);
            return true;
        }
    } catch (error) {
        console.error('[INSTAGRAM GRAPH] Initialization error:', error);
    }
    return false;
}

/**
 * Exchange short-lived token for long-lived token (60 days)
 */
export async function exchangeForLongLivedToken(shortLivedToken) {
    try {
        const appId = await getSystemConfig('META_APP_ID');
        const appSecret = await getSystemConfig('META_APP_SECRET');

        if (appId && appSecret) {
            // Try to exchange for a fresh long-lived token
            console.log('[INSTAGRAM GRAPH] Exchanging for long-lived token...');
            try {
                const response = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
                    params: {
                        grant_type: 'fb_exchange_token',
                        client_id: appId,
                        client_secret: appSecret,
                        fb_exchange_token: shortLivedToken
                    }
                });

                if (response.data && response.data.access_token) {
                    const longLivedToken = response.data.access_token;
                    const expiresIn = response.data.expires_in || 5184000; // default 60 days
                    const expiresAt = new Date(Date.now() + expiresIn * 1000);
                    console.log('[INSTAGRAM GRAPH] Long-lived token acquired via exchange.');
                    return { token: longLivedToken, type: 'long_lived', expiresAt: expiresAt.toISOString() };
                }
            } catch (exchangeErr) {
                console.warn('[INSTAGRAM GRAPH] Exchange failed, will probe token directly:', exchangeErr.response?.data?.error?.message || exchangeErr.message);
            }
        }

        // No App ID/Secret or exchange failed — probe the token to detect if it's already long-lived
        console.log('[INSTAGRAM GRAPH] Probing token expiry via Meta API...');
        try {
            const debugRes = await axios.get(`https://graph.facebook.com/v18.0/me`, {
                params: { fields: 'id', access_token: shortLivedToken },
                timeout: 8000
            });

            if (debugRes.data && debugRes.data.id) {
                // Token works. Try to get expiry from token debug endpoint (needs app token) — 
                // if we can't, default to 60 days since the user is pasting a long-lived token.
                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + 60);
                console.log('[INSTAGRAM GRAPH] Token is valid. Treating as long-lived (60d default).');
                return { token: shortLivedToken, type: 'long_lived', expiresAt: expiresAt.toISOString() };
            }
        } catch (probeErr) {
            console.warn('[INSTAGRAM GRAPH] Token probe failed:', probeErr.response?.data?.error?.message || probeErr.message);
        }

    } catch (error) {
        console.error('[INSTAGRAM GRAPH] Token exchange error:', error.response?.data || error.message);
    }
    
    return { token: shortLivedToken, type: 'short_lived', expiresAt: null };
}

/**
 * Add a new Instagram account
 */
export async function addAccount(token, accountId, userId) {
    const cleanToken = token.trim();
    const cleanId = accountId.trim();

    try {
        // First, check basic info to validate the provided token
        const infoResponse = await axios.get(
            `https://graph.facebook.com/v18.0/${cleanId}?fields=username,name,profile_picture_url&access_token=${cleanToken}`
        );

        const { username, name, profile_picture_url } = infoResponse.data;

        // Try to exchange for long-lived token
        const exchangeResult = await exchangeForLongLivedToken(cleanToken);

        const result = await addInstagramAccount(
            name || username || 'Instagram Account',
            exchangeResult.token,
            cleanId,
            username,
            profile_picture_url,
            userId,
            exchangeResult.expiresAt,
            exchangeResult.type
        );

        if (!globalAccessToken) {
            globalAccessToken = exchangeResult.token;
            globalAccountId = cleanId;
        }

        return { success: true, account: result };
    } catch (error) {
        console.error('[INSTAGRAM GRAPH] Add account error:', error.response?.data || error.message);
        return { success: false, error: error.response?.data?.error?.message || error.message };
    }
}

/**
 * Configure Instagram Graph API credentials (Legacy wrapper)
 */
export function configureGraphAPI(token, accountId) {
    return addAccount(token, accountId);
}

/**
 * Helper to shorten URL using is.gd (Trusted by Meta crawler)
 * This bypasses domain blocks on easypanel.host/hostinger
 */
async function shortenUrl(url) {
    if (!url || (!url.includes('easypanel.host') && !url.includes('hstgr.cloud'))) return url;
    try {
        console.log(`[INSTAGRAM] Domain block probable, shortening URL via is.gd: ${url}`);
        const response = await axios.get(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`, { timeout: 5000 });
        if (response.data && response.data.startsWith('http')) {
            const shortUrl = response.data.trim();
            console.log(`[INSTAGRAM] Short URL generated: ${shortUrl}`);
            return shortUrl;
        }
    } catch (err) {
        console.warn(`[INSTAGRAM] URL Shortener failed: ${err.message}. Sending original URL.`);
    }
    return url;
}

/**
 * Get credentials for a specific account or use global defaults
 */
async function getCredentials(dbAccountId = null) {
    if (dbAccountId) {
        // Handle both integer ID (internal) and string ID (Meta Account ID)
        let res;
        // Meta IDs are long numeric strings. Internal IDs are smaller integers.
        // If it's a string longer than 10 digits, it's definitely a Meta ID.
        // Also, isNaN is not enough for strings like "1784..." which can be cast to numbers.
        const idStr = String(dbAccountId);
        if (idStr.length > 10 || isNaN(Number(dbAccountId))) {
            // It's likely the Meta Account ID (string)
            res = await query('SELECT * FROM instagram_accounts WHERE account_id = $1', [idStr]);
        } else {
            // It's likely the internal database ID (integer)
            res = await query('SELECT * FROM instagram_accounts WHERE id = $1', [parseInt(dbAccountId)]);
        }

        const account = res.rows[0];

        if (!account) {
            throw new Error(`Account with identifier ${dbAccountId} not found`);
        }
        return {
            token: account.access_token.trim(),
            id: account.account_id.trim(),
            userId: account.user_id
        };
    }

    if (globalAccessToken && globalAccountId) {
        const res = await query('SELECT user_id FROM instagram_accounts WHERE account_id = $1', [globalAccountId]);
        return {
            token: globalAccessToken.trim(),
            id: globalAccountId.trim(),
            userId: res.rows[0]?.user_id || null
        };
    }

    const res = await query('SELECT * FROM instagram_accounts LIMIT 1');
    const accounts = res.rows;
    if (accounts.length > 0) {
        return {
            token: accounts[0].access_token.trim(),
            id: accounts[0].account_id.trim(),
            userId: accounts[0].user_id
        };
    }

    throw new Error('No Instagram account configured');
}

/**
 * Helper to bridge media via Telegram if enabled
 */
async function maybeBridgeMedia(mediaUrl, userId) {
    const cleanMediaUrl = String(mediaUrl).trim();
    const isLocal = cleanMediaUrl.includes('localhost') || cleanMediaUrl.includes('127.0.0.1') || cleanMediaUrl.startsWith('/uploads/');
    const isTelegram = cleanMediaUrl.includes('api.telegram.org');

    // 1. Se for uma URL pública direta (não local e não telegram), usa diretamente
    if (!isLocal && !isTelegram && (cleanMediaUrl.startsWith('http://') || cleanMediaUrl.startsWith('https://'))) {
        console.log(`[INSTAGRAM BRIDGE] Direct public URL detected, skipping bridge: ${cleanMediaUrl}`);
        return { url: cleanMediaUrl, messageId: null };
    }

    // 2. Se for uma URL do Telegram, obrigatoriamente usamos o nosso PROXY (para contornar erro 9004)
    if (isTelegram) {
        console.log(`[INSTAGRAM BRIDGE] Telegram URL detected, applying proxy...`);
        try {
            const systemPublicUrl = await getSystemConfig('system_public_url');
            if (systemPublicUrl) {
                // Tenta extrair o token e o path da URL do Telegram
                const match = cleanMediaUrl.match(/bot([^/]+)\/(.+)$/);
                if (match) {
                    const token = match[1];
                    const fpath = match[2];
                    const proxyUrl = `${systemPublicUrl.replace(/\/$/, '')}/tg-stream/${token}/${fpath}`;
                    console.log(`[INSTAGRAM BRIDGE] Using PROXY URL for Telegram media: ${proxyUrl}`);
                    return { url: proxyUrl, messageId: null };
                }
            }
        } catch (err) {
            console.warn('[INSTAGRAM BRIDGE] Failed to apply proxy to Telegram URL:', err.message);
        }
    }

    // 3. Tentar usar PUBLIC_URL do sistema se a mídia for local
    if (isLocal) {
        try {
            const systemPublicUrl = await getSystemConfig('system_public_url');
            if (systemPublicUrl && !systemPublicUrl.includes('localhost') && !systemPublicUrl.includes('127.0.0.1')) {
                let relativePath = cleanMediaUrl;
                if (cleanMediaUrl.includes('/uploads/')) {
                    const parts = cleanMediaUrl.split('/uploads/');
                    relativePath = parts[parts.length - 1];
                    const cleanUrl = `${systemPublicUrl.replace(/\/$/, '')}/uploads/${relativePath}`;
                    console.log(`[INSTAGRAM BRIDGE] Local media resolved via PUBLIC_URL: ${cleanUrl}`);
                    return { url: cleanUrl, messageId: null };
                }
            }
        } catch (configErr) {
            console.warn('[INSTAGRAM BRIDGE] Failed to fetch system_public_url:', configErr.message);
        }
    }

    // 4. Último recurso: Fazer o Bridge via Telegram (se configurado)
    let bridgeEnabled = false;
    let bridgeToken = null;
    let bridgeChatId = null;

    if (userId) {
        const userBridgeEnabled = await getUserConfig(userId, 'telegram_bridge_enabled');
        if (userBridgeEnabled === 'true' || userBridgeEnabled === true) {
            bridgeEnabled = true;
            bridgeToken = await getUserConfig(userId, 'telegram_bridge_bot_token');
            bridgeChatId = await getUserConfig(userId, 'telegram_bridge_chat_id');
        }
    }

    if (!bridgeEnabled) {
        const systemBridgeEnabled = await getSystemConfig('telegram_bridge_enabled');
        if (systemBridgeEnabled === 'true' || systemBridgeEnabled === true) {
            bridgeEnabled = true;
            bridgeToken = await getSystemConfig('telegram_bridge_bot_token');
            bridgeChatId = await getSystemConfig('telegram_bridge_chat_id');
        }
    }

    if (bridgeEnabled && bridgeToken && bridgeChatId) {
        try {
            console.log(`[INSTAGRAM BRIDGE] Relaying local media via Telegram Bridge...`);
            let localPath = cleanMediaUrl;
            if (cleanMediaUrl.includes('/uploads/')) {
                const parts = cleanMediaUrl.split('/uploads/');
                localPath = path.join(process.cwd(), 'uploads', parts[parts.length - 1]);
            }

            const bridgeData = await uploadToTelegramBridge(bridgeToken, bridgeChatId, localPath);
            const systemPublicUrl = await getSystemConfig('system_public_url');
            let finalUrl = bridgeData.fileUrl;

            if (systemPublicUrl) {
                finalUrl = `${systemPublicUrl.replace(/\/$/, '')}/tg-stream/${bridgeToken}/${bridgeData.filePath}`;
            }

            return { url: finalUrl, messageId: bridgeData.messageId, token: bridgeToken, chatId: bridgeChatId };
        } catch (err) {
            console.error('[INSTAGRAM BRIDGE] Bridge fallback failed:', err.message);
        }
    }

    return { url: cleanMediaUrl, messageId: null };
}

/**
 * Helper to wait for Meta Graph API to finish processing a media container
 */
async function waitForMediaProcessing(containerId, token, maxAttempts = 40) {
    let status = 'IN_PROGRESS';
    let attempts = 0;
    let processingError = null;

    console.log(`[INSTAGRAM GRAPH] Polling status for container ${containerId}...`);

    while (status !== 'FINISHED' && status !== 'COMPLETED' && status !== '1' && attempts < maxAttempts) {
        // Wait 5s between checks (Meta recommendation)
        await new Promise(resolve => setTimeout(resolve, 5000));

        const statusUrl = `https://graph.facebook.com/v18.0/${containerId}?fields=status_code,status&access_token=${token}`;
        const statusResponse = await axios.get(statusUrl);

        // Status field names vary depending on version and type
        status = statusResponse.data.status_code || statusResponse.data.status || '';
        processingError = statusResponse.data.error_message || statusResponse.data.error?.message || null;

        console.log(`[INSTAGRAM GRAPH] Container ${containerId} status: ${status} (Attempt ${attempts + 1}/${maxAttempts})${processingError ? ' - Error: ' + processingError : ''}`);

        if (status === 'ERROR' || status === 'FAILED' || status === 'EXPIRED') {
            throw new Error(processingError || 'Falha no processamento da mídia pelo Instagram (Rejeitado)');
        }

        attempts++;
    }

    if (status !== 'FINISHED' && status !== 'COMPLETED' && status !== '1' && status !== 'PUBLISHED') {
        throw new Error(`Timeout aguardando processamento da mídia (Status final: ${status})`);
    }

    return true;
}

/**
 * Upload video (Reels) to Instagram via Graph API
 */
export async function postVideoGraph(videoUrl, caption, dbAccountId = null, options = {}) {
    try {
        const { token, id, userId } = await getCredentials(dbAccountId);

        if (!token || !id) {
            throw new Error('Graph API não configurada. Adicione uma conta primeiro.');
        }

        console.log(`[INSTAGRAM GRAPH] Starting video upload for account ${id}...`);

        let finalVideoUrl = videoUrl;
        let telegramMessageId = null;
        let bridgeBotToken = null;
        let bridgeBotChatId = null;

        const bridgeResult = await maybeBridgeMedia(videoUrl, userId);
        finalVideoUrl = await shortenUrl(bridgeResult.url);
        telegramMessageId = bridgeResult.messageId;
        bridgeBotToken = bridgeResult.token;
        bridgeBotChatId = bridgeResult.chatId;

        // Validar URL pública antes de enviar ao Meta
        if (!finalVideoUrl.startsWith('http') || finalVideoUrl.includes('127.0.0.1') || finalVideoUrl.includes('localhost')) {
            throw new Error('Falha no Envio: A URL da mídia é local. Configure a "URL Pública do Sistema" ou ative o Telegram Bridge para converter uploads.');
        }

        // 1. Create Media Container - Using POST payload for robustness
        const createUrl = `https://graph.facebook.com/v18.0/${id}/media`;
        
        const payload = {
            media_type: 'REELS',
            video_url: finalVideoUrl,
            caption: caption,
            access_token: token,
            // Distribution and professional options
            share_to_feed: options.shareToFeed !== undefined ? options.shareToFeed : true,
            allow_comments: options.allowComments !== undefined ? options.allowComments : true,
            // Thumbnail options
            cover_url: options.thumbnailUrl || undefined,
            thumb_offset: options.thumbOffset || undefined
        };
        
        // Add more options if present in Meta API
        // Note: allow_embedding is for FB but Meta Graph Reels has specific fields
        
        console.log(`[INSTAGRAM GRAPH] Creating video container...`);
        const containerResponse = await axios.post(createUrl, payload);
        const containerId = containerResponse.data.id;
        console.log(`[INSTAGRAM GRAPH] Container created: ${containerId}`);

        // 2. Wait for processing (Polling)
        await waitForMediaProcessing(containerId, token, 60);

        // 3. Publish Media
        const publishUrl = `https://graph.facebook.com/v18.0/${id}/media_publish?creation_id=${containerId}&access_token=${token}`;
        const publishResponse = await axios.post(publishUrl);

        const mediaId = publishResponse.data.id;
        console.log(`[INSTAGRAM GRAPH] Published successfully: ${mediaId}`);

        // Cleanup Telegram Bridge if used
        if (telegramMessageId && bridgeBotToken && bridgeBotChatId) {
            await deleteTelegramMessage(bridgeBotToken, bridgeBotChatId, telegramMessageId);
        }

        return {
            success: true,
            mediaId: mediaId
        };
    } catch (error) {
        console.error('[INSTAGRAM GRAPH] Post video error:', error.response?.data || error.message);

        let errorMessage = 'Erro ao postar vídeo via Graph API';
        if (error.response?.data?.error?.error_user_title || error.response?.data?.error?.error_user_msg) {
            errorMessage = `${error.response.data.error.error_user_title || 'Erro'}: ${error.response.data.error.error_user_msg}`;
        } else if (error.response?.data?.error?.message) {
            errorMessage = error.response.data.error.message;
        } else if (error.message) {
            errorMessage = error.message;
        }

        return { success: false, error: errorMessage };
    }
}

/**
 * Upload image to Instagram via Graph API
 */
export async function postImageGraph(imageUrl, caption, dbAccountId = null) {
    try {
        const { token, id, userId } = await getCredentials(dbAccountId);

        if (!token || !id) {
            throw new Error('Graph API não configurada. Adicione uma conta primeiro.');
        }

        console.log(`[INSTAGRAM GRAPH] Creating image container for account ${id}...`);

        const bridgeResult = await maybeBridgeMedia(imageUrl, userId); 
        const finalImageUrl = await shortenUrl(bridgeResult.url);

        // Validar URL pública antes de enviar ao Meta
        if (!finalImageUrl.startsWith('http') || finalImageUrl.includes('127.0.0.1') || finalImageUrl.includes('localhost')) {
            throw new Error('Falha no Envio: A URL da imagem é local. Configure a "URL Pública do Sistema" ou ative o Telegram Bridge para converter uploads.');
        }

        // Create image container using POST payload
        const createUrl = `https://graph.facebook.com/v18.0/${id}/media`;
        const payload = {
            image_url: finalImageUrl,
            caption: caption,
            access_token: token
        };

        const containerResponse = await axios.post(createUrl, payload);

        const containerId = containerResponse.data.id;
        console.log('[INSTAGRAM GRAPH] Container created:', containerId);

        // Wait for processing (New: Polling for images too to avoid race conditions)
        await waitForMediaProcessing(containerId, token, 20);

        // Publish the image
        const publishUrl = `https://graph.facebook.com/v18.0/${id}/media_publish?creation_id=${containerId}&access_token=${token}`;
        const publishResponse = await axios.post(publishUrl);

        const mediaId = publishResponse.data.id;
        console.log('[INSTAGRAM GRAPH] Image published successfully:', mediaId);

        // Cleanup Bridge
        if (bridgeResult.messageId && bridgeResult.token && bridgeResult.chatId) {
            await deleteTelegramMessage(bridgeResult.token, bridgeResult.chatId, bridgeResult.messageId);
        }

        return {
            success: true,
            mediaId: mediaId
        };
    } catch (error) {
        console.error('[INSTAGRAM GRAPH] Post image error:', error.response?.data || error.message);

        let errorMessage = 'Erro ao postar imagem via Graph API';
        if (error.response?.data?.error?.message) {
            errorMessage = error.response.data.error.message;
        }

        return { success: false, error: errorMessage };
    }
}

async function downloadFile(url, destPath) {
    const writer = fs.createWriteStream(destPath);
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream'
    });

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

/**
 * Post Story (Image or Video) to Instagram via Graph API
 * Uses media_type=STORIES for image stories.
 * For video stories, uses REELS as Stories endpoint requires specific app permissions.
 */
export async function postStoryGraph(mediaUrl, mediaType, dbAccountId = null, dynamicSystemUrl = null) {
    try {
        const { token, id, userId } = await getCredentials(dbAccountId);

        if (!token || !id) {
            throw new Error('Graph API não configurada. Adicione uma conta primeiro.');
        }

        console.log(`[STORY IG] Starting Story post (${mediaType}) for account ${id}...`);
        
        // --- NEW RULES PREVENT TG PROXY ERROR 9004 ---
        let finalMediaUrl = String(mediaUrl).trim();
        let localFileToDelete = null;
        let telegramMessageId = null;

        const isLocal = finalMediaUrl.includes('localhost') || finalMediaUrl.includes('127.0.0.1') || finalMediaUrl.includes('uploads');
        const isTelegram = finalMediaUrl.includes('api.telegram.org');
        const systemUrl = dynamicSystemUrl || await getSystemConfig('system_public_url');

        if (isLocal) {
            if (systemUrl) {
                let relativePath = finalMediaUrl.replace(/\\/g, '/');
                if (relativePath.includes('/uploads/')) {
                    const parts = relativePath.split('/uploads/');
                    relativePath = parts[parts.length - 1];
                } else if (relativePath.includes('uploads/')) {
                    const parts = relativePath.split('uploads/');
                    relativePath = parts[parts.length - 1];
                }
                finalMediaUrl = `${systemUrl.replace(/\/$/, '')}/uploads/${relativePath}`;
                console.log(`[STORY IG] Local media resolved via system PUBLIC_URL: ${finalMediaUrl}`);
            } else {
                throw new Error("Falha no Upload do Story: Configure a 'URL Pública do Sistema' ou ative o Telegram Bridge para processar uploads de arquivos locais.");
            }
        } else if (isTelegram) {
            if (!systemUrl) {
                throw new Error("Falha no Upload do Story: A 'URL Pública do Sistema' é obrigatória ao usar o Telegram Bridge para o Instagram Graph.");
            }
            const fileName = `story_dl_${Date.now()}_${Math.floor(Math.random() * 1000)}.${mediaType === 'video' ? 'mp4' : 'jpg'}`;
            const localDir = path.join(process.cwd(), 'uploads', 'stories');
            if (!fs.existsSync(localDir)) {
                fs.mkdirSync(localDir, { recursive: true });
            }
            const localPath = path.join(localDir, fileName);
            
            console.log(`[STORY IG] Downloading Telegram media to VPS: ${localPath}`);
            await downloadFile(finalMediaUrl, localPath);
            
            finalMediaUrl = `${systemUrl.replace(/\/$/, '')}/uploads/stories/${fileName}`;
            localFileToDelete = localPath;
        } else {
            finalMediaUrl = await shortenUrl(finalMediaUrl);
            console.log(`[STORY IG] Direct public URL detected: ${finalMediaUrl}`);
        }

        // Final safety check: Always shorten if it's the blocked domain
        finalMediaUrl = await shortenUrl(finalMediaUrl);

        let containerId;

        const maxAttempts = 3;
        let attempt = 0;
        let lastError = null;

        while (attempt < maxAttempts) {
            try {
                // CLEAN: Pure URL only
                const cleanMediaUrl = String(finalMediaUrl).replace(/["'`\s]/g, '').trim();

                console.log(`[STORY IG] Attempt ${attempt + 1} finalized URL: ${cleanMediaUrl}`);
                if (cleanMediaUrl.includes('api.telegram.org')) {
                    console.warn('[STORY IG] WARNING: Using Telegram URL, this often fails with Meta Error 9004.');
                }

                // Standard Meta config for Stories
                let createUrl = `https://graph.facebook.com/v18.0/${id}/media`;
                
                const payload = {
                    media_type: 'STORIES',
                    access_token: token
                };

                if (mediaType === 'video') {
                    payload.video_url = cleanMediaUrl;
                } else {
                    payload.image_url = cleanMediaUrl;
                }

                // POST to Meta
                const createRes = await axios.post(createUrl, payload);
                
                containerId = createRes.data.id;
                console.log(`[STORY IG] Container created: ${containerId}`);

                // Wait for processing (Polling via unified helper)
                await waitForMediaProcessing(containerId, token, mediaType === 'video' ? 60 : 20);
                
                break;
            } catch (err) {
                lastError = err;
                attempt++;
                const errData = err.response?.data?.error;
                console.warn(`[STORY IG] Attempt ${attempt} error: ${errData?.message || err.message}`);
                
                if (attempt < maxAttempts) {
                    await new Promise(r => setTimeout(r, 5000));
                } else {
                    throw lastError;
                }
            }
        }

        // Publish
        console.log(`[STORY IG] Publishing container ${containerId}...`);
        const publishUrl = `https://graph.facebook.com/v18.0/${id}/media_publish?creation_id=${containerId}&access_token=${token}`;
        const publishRes = await axios.post(publishUrl);

        console.log(`[STORY IG] ✅ Success! Media ID: ${publishRes.data.id}`);
        
        // Cleanup local file if it was downloaded from Telegram
        if (localFileToDelete && fs.existsSync(localFileToDelete)) {
            console.log(`[CLEANUP] Deleting Telegram downloaded file: ${localFileToDelete}`);
            fs.unlinkSync(localFileToDelete);
        }

        return { success: true, mediaId: publishRes.data.id };
    } catch (error) {
        // Cleanup local file on error too
        if (typeof localFileToDelete !== 'undefined' && localFileToDelete && fs.existsSync(localFileToDelete)) {
            fs.unlinkSync(localFileToDelete);
        }
        const errData = error.response?.data;
        console.error('[STORY IG] ❌ UNRECOVERABLE ERROR:');
        console.error('[STORY IG] Full Trace:', JSON.stringify(errData));

        return { 
            success: false, 
            error: errData?.error?.message || errData?.error?.error_user_msg || error.message 
        };
    }
}



/**
 * Format product message for Instagram
 */
function formatInstagramCaption(product, template, groupLink) {
    const price = product.price || 0;
    const fakeOriginalPrice = (price * 1.5).toFixed(2);
    const realPrice = price.toFixed(2);
    const commission = (product.commission || 0).toFixed(2);
    const commissionRate = (product.commissionRate || 0).toFixed(1);
    const rating = product.rating ? product.rating.toFixed(1) : 'N/A';

    let caption = template
        .replace(/{nome_produto}/g, product.productName || product.name || '')
        .replace(/{product_name}/g, product.productName || product.name || '')
        .replace(/{preco_original}/g, fakeOriginalPrice)
        .replace(/{preco_com_desconto}/g, realPrice)
        .replace(/{comissao}/g, commission)
        .replace(/{taxa}/g, commissionRate)
        .replace(/{product_link}/g, product.affiliateLink || product.link || '')
        .replace(/{link}/g, product.affiliateLink || product.link || '')
        .replace(/{desconto}/g, '50')
        .replace(/{avaliacao}/g, rating)
        .replace(/\[LINK_DO_GRUPO\]/g, groupLink || '');

    return caption;
}

/**
 * Generate hashtags based on product
 */
function generateHashtags(product, customHashtags = []) {
    const defaultHashtags = [
        'achadinhos', 'ofertas', 'shopee', 'promocao', 'desconto',
        'compras', 'economia', 'ofertasdodia', 'shopeebrasil', 'produtosimportados'
    ];

    const productName = product.productName || product.title || product.name || '';
    const smartTagsStr = generateSmartTags(productName);
    const smartTagsArray = smartTagsStr ? smartTagsStr.split(' ') : [];

    const allHashtags = [...new Set([...defaultHashtags, ...customHashtags, ...smartTagsArray])];
    return allHashtags.slice(0, 30).map(tag => `#${tag.replace('#', '')}`).join(' ');
}

/**
 * Post product to Instagram via Graph API
 */
export async function postProductGraph(product, messageTemplate, groupLink, customHashtags = [], dbAccountId = null) {
    try {
        const { token, id } = await getCredentials(dbAccountId);

        if (!token || !id) {
            throw new Error('Graph API não configurada');
        }

        let caption = formatInstagramCaption(product, messageTemplate, groupLink);
        const hashtags = generateHashtags(product, customHashtags);
        caption += `\n\n${hashtags}`;

        let mediaUrl = null;
        let isVideo = false;

        // Suporte tanto para arrays (plural) quanto para strings de URL (singular)
        if (product.videos && product.videos.length > 0) {
            mediaUrl = product.videos[0];
            isVideo = true;
        } else if (product.videoUrl) {
            mediaUrl = product.videoUrl;
            isVideo = true;
        } else if (product.images && product.images.length > 0) {
            mediaUrl = product.images[0];
            isVideo = false;
        } else if (product.imageUrl) {
            mediaUrl = product.imageUrl;
            isVideo = false;
        } else if (product.imagePath) {
            mediaUrl = product.imagePath;
            isVideo = false;
        }

        if (!mediaUrl) {
            throw new Error('Produto não tem mídia disponível');
        }

        if (isVideo) {
            return await postVideoGraph(mediaUrl, caption, dbAccountId);
        } else {
            return await postImageGraph(mediaUrl, caption, dbAccountId);
        }
    } catch (error) {
        console.error('[INSTAGRAM GRAPH] Post product error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get account info via Graph API
 */
export async function getAccountInfoGraph(dbAccountId = null) {
    try {
        const { token, id } = await getCredentials(dbAccountId);

        if (!token || !id) {
            throw new Error('Graph API não configurada');
        }

        const url = `https://graph.facebook.com/v18.0/${id}?fields=username,name,biography,followers_count,follows_count,media_count&access_token=${token}`;
        const response = await axios.get(url);

        return {
            success: true,
            user: {
                username: response.data.username,
                fullName: response.data.name,
                biography: response.data.biography,
                followerCount: response.data.followers_count,
                followingCount: response.data.follows_count,
                mediaCount: response.data.media_count
            }
        };
    } catch (error) {
        console.error('[INSTAGRAM GRAPH] Get account info error:', error.response?.data || error.message);
        return { success: false, error: error.response?.data?.error?.message || error.message };
    }
}

/**
 * Get all Instagram accounts
 */
export async function getAccounts(userId) {
    return await getInstagramAccounts(userId);
}

/**
 * Remove an Instagram account
 */
export async function removeAccount(id, userId) {
    return await removeInstagramAccount(id, userId);
}

/**
 * Reset Graph API credentials
 */
export function resetGraphAPI() {
    globalAccessToken = null;
    globalAccountId = null;
    return { success: true };
}

/**
 * Get current Graph API configuration status
 */
export async function getGraphStatus(userId) {
    const accounts = await getInstagramAccounts(userId);
    return {
        configured: accounts.length > 0,
        accountCount: accounts.length
    };
}

/**
 * Reply to a specific Instagram comment
 */
export async function replyToComment(commentId, message, dbAccountId = null) {
    try {
        const { token } = await getCredentials(dbAccountId);

        if (!token) {
            throw new Error('Graph API não configurada');
        }

        const response = await axios.post(
            `https://graph.facebook.com/v18.0/${commentId}/replies`,
            { message: message },
            { params: { access_token: token } }
        );
        return { success: true, id: response.data.id };
    } catch (error) {
        console.error('[INSTAGRAM GRAPH] Reply comment error:', error.response?.data || error.message);
        return { success: false, error: error.response?.data?.error?.message || error.message };
    }
}

/**
 * Send a private reply (DM) to an Instagram comment
 */
export async function sendPrivateReply(commentId, message, dbAccountId = null) {
    try {
        const { token, id } = await getCredentials(dbAccountId);

        if (!token) {
            throw new Error('Graph API não configurada');
        }

        // Meta Docs for Instagram: Use /{ig-user-id}/messages with recipient={comment_id}
        const response = await axios.post(
            `https://graph.facebook.com/v18.0/${id}/messages`,
            { 
                recipient: { comment_id: commentId },
                message: { text: message } 
            },
            { params: { access_token: token } }
        );

        return { success: true, id: response.data.message_id };

    } catch (error) {
        console.error('[INSTAGRAM GRAPH] Private reply error:', error.response?.data || error.message);
        return { success: false, error: error.response?.data?.error?.message || error.message };
    }
}

export default {
    configureGraphAPI,
    initializeGraphAPI,
    resetGraphAPI,
    getGraphStatus,
    getAccounts,
    removeAccount,
    addAccount,
    postVideoGraph,
    postImageGraph,
    postProductGraph,
    getAccountInfoGraph,
    replyToComment,
    sendPrivateReply
};
