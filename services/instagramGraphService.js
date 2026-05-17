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
import { wrapMetaAction } from './facebookService.js';

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
async function shortenUrl(url, force = false) {
    if (!url) return url;
    // NEVER shorten Meta's own domains
    if (url.includes('fbcdn.net') || url.includes('facebook.com') || url.includes('instagram.com')) {
        return url;
    }
    
    // Always shorten if forced (e.g. for Instagram) or if it's a known blocked domain
    const needsShortening = force || 
                           url.includes('api.telegram.org') || 
                           url.includes('easypanel.host') || 
                           url.includes('hstgr.cloud') ||
                           url.includes('tiktok.com');
    
    if (!needsShortening) return url;
    
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
            console.error(`[INSTAGRAM-GRAPH] Account with identifier ${dbAccountId} not found in database.`);
            throw new Error(`Conta Instagram ${dbAccountId} não encontrada no banco de dados. Por favor, reconecte a conta.`);
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
 * Anonymous public bridge using Catbox.moe (Reliable for Meta crawler)
 * Supports both local files and memory buffers
 */
async function uploadToCatbox(input, isBuffer = false) {
    try {
        const FormData = (await import('form-data')).default;
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        
        if (isBuffer) {
            form.append('fileToUpload', input, { filename: 'video.mp4', contentType: 'video/mp4' });
        } else {
            form.append('fileToUpload', fs.createReadStream(input));
        }

        console.log(`[INSTAGRAM BRIDGE] Relaying media via universal bridge (Memory Mode)...`);
        const response = await axios.post('https://catbox.moe/user/api.php', form, {
            headers: { ...form.getHeaders() },
            timeout: 60000
        });

        if (typeof response.data === 'string' && response.data.startsWith('http')) {
            console.log(`[INSTAGRAM BRIDGE] Universal bridge URL: ${response.data.trim()}`);
            return response.data.trim();
        }
        throw new Error('Invalid response from Catbox');
    } catch (err) {
        console.error('[INSTAGRAM BRIDGE] Catbox upload failed:', err.message);
        return null;
    }
}

/**
 * Smart Bridge: Detect problematic URLs and relay them via memory
 */
export async function maybeBridgeMedia(mediaUrl, userId = null) {
    const cleanMediaUrl = String(mediaUrl).trim();
    
    // Check if it's a local file or a problematic external URL
    const isLocal = cleanMediaUrl.includes('localhost') || 
                    cleanMediaUrl.includes('127.0.0.1') || 
                    cleanMediaUrl.includes('uploads') || 
                    cleanMediaUrl.includes('shopee-media') ||
                    cleanMediaUrl.includes(':\\') || 
                    cleanMediaUrl.startsWith('/') || 
                    cleanMediaUrl.startsWith('./');

    const isProblematic = cleanMediaUrl.includes('fbcdn.net') || 
                         cleanMediaUrl.includes('tiktok.com') ||
                         cleanMediaUrl.includes('api.telegram.org');

    const isShopeeDirect = cleanMediaUrl.includes('susercontent.com') || cleanMediaUrl.includes('cf.shopee.com.br');

    // 1. URLs que funcionam direto (Shopee por exemplo)
    if (isShopeeDirect && !isLocal) {
        console.log(`[INSTAGRAM BRIDGE] Trusted public URL detected, skipping bridge.`);
        return { url: cleanMediaUrl, messageId: null };
    }

    // 2. Se for local, usa o arquivo do disco
    if (isLocal) {
        console.log(`[INSTAGRAM BRIDGE] Local media detected, checking public URL...`);
        let localPath = cleanMediaUrl;
        let relativePath = '';
        if (cleanMediaUrl.includes('/uploads/')) {
            const parts = cleanMediaUrl.split('/uploads/');
            relativePath = parts[parts.length - 1];
            localPath = path.join(process.cwd(), 'uploads', relativePath);
        }

        // Tenta usar a URL do sistema em vez do Catbox (muito mais rápido e sem bloqueio)
        try {
            let systemUrlConfig = await getSystemConfig('system_public_url');
            
            // Fallback automático caso não exista o campo no painel do cliente ou seja localhost
            if (!systemUrlConfig || systemUrlConfig.includes('localhost') || systemUrlConfig.includes('127.0.0.1')) {
                systemUrlConfig = 'https://fluxointeligente.digital';
            }

            if (systemUrlConfig && systemUrlConfig.startsWith('http') && relativePath) {
                const baseUrl = systemUrlConfig.endsWith('/') ? systemUrlConfig.slice(0, -1) : systemUrlConfig;
                const publicUrl = `${baseUrl}/uploads/${relativePath}`;
                console.log(`[INSTAGRAM BRIDGE] System Public URL configured, bypassing Catbox: ${publicUrl}`);
                return { url: publicUrl };
            }
        } catch (e) {
            console.warn('[INSTAGRAM BRIDGE] Error checking system_public_url:', e.message);
        }

        console.log(`[INSTAGRAM BRIDGE] No public URL, relying on Catbox...`);
        const catboxUrl = await uploadToCatbox(localPath, false);
        return { url: catboxUrl || cleanMediaUrl };
    }

    // 3. Se for problemática (FB/TikTok), faz o relay via MEMÓRIA (Sem salvar no disco)
    if (isProblematic) {
        console.log(`[INSTAGRAM BRIDGE] Problematic URL detected (${cleanMediaUrl.substring(0, 30)}...), relaying via memory...`);
        try {
            const res = await axios.get(cleanMediaUrl, { responseType: 'arraybuffer', timeout: 30000 });
            const catboxUrl = await uploadToCatbox(Buffer.from(res.data), true);
            return { url: catboxUrl || cleanMediaUrl };
        } catch (err) {
            console.warn(`[INSTAGRAM BRIDGE] Memory relay failed: ${err.message}`);
        }
    }

    return { url: cleanMediaUrl };
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
            console.error('[INSTAGRAM GRAPH] Processing failed details:', statusResponse.data);
            throw new Error(processingError || `Falha no processamento da mídia pelo Instagram (Status: ${status})`);
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
    // Get credentials first to have userId for wrapMetaAction
    const { token, id, userId } = await getCredentials(dbAccountId);
    
    const action = async () => {
        if (!token || !id) {
            throw new Error('Graph API não configurada. Adicione uma conta primeiro.');
        }

        console.log(`[INSTAGRAM GRAPH] Starting video upload for account ${id}...`);

        let finalVideoUrl = videoUrl;
        let telegramMessageId = null;
        let bridgeBotToken = null;
        let bridgeBotChatId = null;

        const bridgeResult = await maybeBridgeMedia(videoUrl, userId);
        finalVideoUrl = await shortenUrl(bridgeResult.url, true);
        
        // Final cleaning: Remove byte-range parameters that cause Meta rejection
        finalVideoUrl = finalVideoUrl.split('&bytestart=')[0].split('?bytestart=')[0];
        finalVideoUrl = finalVideoUrl.split('&byteend=')[0].split('?byteend=')[0];

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

        // Trial Reels (Modo Teste A/B) Support
        if (options.isTrial) {
            console.log(`[INSTAGRAM GRAPH] 🧪 Ativando MODO TESTE (Trial Reels)`);
            payload.trial_params = {
                graduation_strategy: "MANUAL"
            };
        }
        
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
    };

    return await wrapMetaAction(userId, action, 'instagram', id);
}

/**
 * Upload image to Instagram via Graph API
 */
export async function postImageGraph(imageUrl, caption, dbAccountId = null, options = {}) {
    const { token, id, userId } = await getCredentials(dbAccountId);
    
    const action = async () => {
        if (!token || !id) {
            throw new Error('Graph API não configurada. Adicione uma conta primeiro.');
        }

        console.log(`[INSTAGRAM GRAPH] Creating image container for account ${id}...`);

        const bridgeResult = await maybeBridgeMedia(imageUrl, userId); 
        const finalImageUrl = await shortenUrl(bridgeResult.url, true);

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
    };

    return await wrapMetaAction(userId, action, 'instagram', id);
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
    const { token, id, userId } = await getCredentials(dbAccountId);
    
    // We need to declare localFileToDelete outside action to cleanup on catch
    let localFileToDelete = null;

    const action = async () => {
        if (!token || !id) {
            throw new Error('Graph API não configurada. Adicione uma conta primeiro.');
        }

        console.log(`[STORY IG] Starting Story post (${mediaType}) for account ${id}...`);
        
        // --- NEW RULES PREVENT TG PROXY ERROR 9004 ---
        let finalMediaUrl = String(mediaUrl).trim();

        const isLocal = finalMediaUrl.includes('localhost') || 
                        finalMediaUrl.includes('127.0.0.1') || 
                        finalMediaUrl.includes('uploads') || 
                        finalMediaUrl.includes('shopee-media') ||
                        finalMediaUrl.includes(':\\') || 
                        finalMediaUrl.startsWith('/') || 
                        finalMediaUrl.startsWith('./');

        const isTelegram = finalMediaUrl.includes('api.telegram.org');
        let systemUrl = dynamicSystemUrl || await getSystemConfig('system_public_url');
        if (!systemUrl || systemUrl.includes('localhost') || systemUrl.includes('127.0.0.1')) {
            systemUrl = 'https://fluxointeligente.digital';
        }

        // Se for um link da Shopee susercontent ou cf.shopee, tentamos usar direto como o usuário pediu
        const isShopeeDirect = finalMediaUrl.includes('susercontent.com') || finalMediaUrl.includes('cf.shopee.com.br');

        if (isShopeeDirect) {
            console.log(`[STORY IG] Using Shopee direct URL: ${finalMediaUrl}`);
            // Mas ainda passamos pelo shortenUrl para garantir conformidade
            finalMediaUrl = await shortenUrl(finalMediaUrl, true);
        } else if (isLocal || isTelegram) {
            console.log(`[STORY IG] Local or Telegram media detected, bridging...`);
            const bridgeResult = await maybeBridgeMedia(finalMediaUrl, userId);
            finalMediaUrl = bridgeResult.url;
            // No IG Stories do Graph API, se for vídeo vindo do Bridge, as vezes precisamos baixar localmente 
            // no VPS se o bridge não retornar uma URL pública direta compatível.
            // Mas o maybeBridgeMedia já tenta retornar uma URL pública.
        } else {
            finalMediaUrl = await shortenUrl(finalMediaUrl, true);
            console.log(`[STORY IG] Direct public URL detected: ${finalMediaUrl}`);
        }

        // Final safety check: Always shorten if it's the blocked domain
        finalMediaUrl = await shortenUrl(finalMediaUrl, true);

        let containerId;
        const maxAttempts = 3;
        let attempt = 0;

        while (attempt < maxAttempts) {
            try {
                // CLEAN: Pure URL only
                const cleanMediaUrl = String(finalMediaUrl).replace(/["'`\s]/g, '').trim();

                console.log(`[STORY IG] Attempt ${attempt + 1} finalized URL: ${cleanMediaUrl}`);

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
                attempt++;
                if (attempt < maxAttempts) {
                    await new Promise(r => setTimeout(r, 5000));
                } else {
                    throw err;
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
    };

    try {
        return await wrapMetaAction(userId, action, 'instagram', id);
    } catch (error) {
        // Cleanup local file on error too
        if (localFileToDelete && fs.existsSync(localFileToDelete)) {
            fs.unlinkSync(localFileToDelete);
        }
        throw error;
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
export async function postProductGraph(product, messageTemplate, groupLink, customHashtags = [], dbAccountId = null, options = {}) {
    const { token, id, userId } = await getCredentials(dbAccountId);
    
    const action = async () => {
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

        if (isVideo && mediaType !== 'image') {
            try {
                return await postVideoGraph(mediaUrl, caption, dbAccountId, options);
            } catch (err) {
                console.warn(`[INSTAGRAM GRAPH] Falha ao postar vídeo, tentando fallback para imagem:`, err.message);
                // Fallback to image if possible
                if (product.images && product.images.length > 0) {
                    return await postImageGraph(product.images[0], caption, dbAccountId);
                } else if (product.imageUrl || product.imagePath) {
                    return await postImageGraph(product.imageUrl || product.imagePath, caption, dbAccountId);
                }
                throw err; // Re-throw if no image fallback available
            }
        } else {
            const imageToPost = (product.images && product.images.length > 0) ? product.images[0] : (product.imageUrl || product.imagePath || mediaUrl);
            return await postImageGraph(imageToPost, caption, dbAccountId);
        }
    };

    return await wrapMetaAction(userId, action, 'instagram', id);
}

/**
 * Get account info via Graph API
 */
export async function getAccountInfoGraph(dbAccountId = null) {
    const { token, id, userId } = await getCredentials(dbAccountId);

    const action = async () => {
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
    };

    return await wrapMetaAction(userId, action, 'instagram', id);
}

/**
 * Get detailed account insights (Impressions, Reach, etc.)
 */
export async function getAccountInsights(dbAccountId = null, days = 7) {
    const { token, id, userId } = await getCredentials(dbAccountId);

    const action = async () => {
        if (!token || !id) {
            throw new Error('Graph API não configurada');
        }

        const until = Math.floor(Date.now() / 1000);
        const since = until - (days * 24 * 60 * 60);

        // Fetch insights using valid Meta Graph API v19+ metrics
        const url = `https://graph.facebook.com/v19.0/${id}/insights`;
        const response = await axios.get(url, {
            params: {
                metric: 'reach,profile_views,website_clicks,accounts_engaged,total_interactions,views',
                period: 'day',
                metric_type: 'total_value',
                since,
                until,
                access_token: token
            }
        });

        const insights = response.data.data || [];
        const stats = {
            impressions: 0,   // mapped from 'views' (Visualizações)
            reach: 0,
            profile_views: 0,
            website_clicks: 0,
            best_hours: ["18:00", "19:00", "20:00", "21:00", "12:00"] // Default fallback
        };

        insights.forEach((item) => {
            const total = item.total_value ? (item.total_value.value || 0) : (item.values || []).reduce((acc, v) => acc + (v.value || 0), 0);
            if (item.name === 'reach') stats.reach = total;
            else if (item.name === 'profile_views') stats.profile_views = total;
            else if (item.name === 'website_clicks') stats.website_clicks = total;
            else if (item.name === 'views') stats.impressions = total; // Map 'views' to UI's impressions
        });

        // Try fetching online_followers for best times
        try {
            const onlineRes = await axios.get(url, {
                params: {
                    metric: 'online_followers',
                    period: 'lifetime',
                    access_token: token
                }
            });
            const onlineData = onlineRes.data.data || [];
            if (onlineData.length > 0 && onlineData[0].values && onlineData[0].values.length > 0) {
                const hourValues = onlineData[0].values[0].value || {};
                const sortedHours = Object.entries(hourValues)
                    .sort(([, countA], [, countB]) => Number(countB) - Number(countA))
                    .map(([hour]) => {
                        const hr = parseInt(hour, 10);
                        return `${hr.toString().padStart(2, '0')}:00`;
                    });
                
                if (sortedHours.length >= 5) {
                    stats.best_hours = sortedHours.slice(0, 5);
                }
            }
        } catch (onlineErr) {
            console.log('[INSTAGRAM] Could not fetch online_followers, using fallback best_hours.', onlineErr.message);
        }

        return {
            success: true,
            insights: stats
        };
    };

    return await wrapMetaAction(userId, action, 'instagram', id);
}


/**
 * Get recent media (posts/reels) for an account
 */
export async function getAccountMedia(dbAccountId = null, limit = 20) {
    try {
        const { token, id } = await getCredentials(dbAccountId);

        if (!token || !id) {
            throw new Error('Graph API não configurada');
        }

        console.log(`[INSTAGRAM GRAPH] Fetching media for account ${id}...`);
        
        const url = `https://graph.facebook.com/v19.0/${id}/media`;
        const response = await axios.get(url, {
            params: {
                fields: 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp',
                access_token: token,
                limit: limit
            }
        });

        return {
            success: true,
            media: response.data.data || []
        };
    } catch (error) {
        console.error('[INSTAGRAM GRAPH] Get account media error:', error.response?.data || error.message);
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

export async function sendPrivateReply(commentId, message, dbAccountId = null, button = null) {
    try {
        const { token, id } = await getCredentials(dbAccountId);

        if (!token) {
            throw new Error('Graph API não configurada');
        }

        let useToken = token;
        
        // Tenta achar o token da Página conectada a este IG (obrigatório para Messaging API)
        try {
            const pageRes = await query('SELECT access_token FROM facebook_pages WHERE instagram_business_id = $1', [id]);
            if (pageRes.rows[0]) {
                useToken = pageRes.rows[0].access_token;
            }
        } catch(e) {}

        let messageData = { text: message };

        // If button provided, use Generic Template (the most compatible for IG buttons)
        if (button && button.text && button.url) {
            console.log(`[INSTAGRAM GRAPH] Preparing Button Template for IG comment ${commentId}: ${button.text}`);
            messageData = {
                attachment: {
                    type: 'template',
                    payload: {
                        template_type: 'generic',
                        elements: [
                            {
                                title: button.text,
                                subtitle: message,
                                buttons: [
                                    {
                                        type: 'web_url',
                                        url: button.url,
                                        title: button.text.substring(0, 20)
                                    }
                                ]
                            }
                        ]
                    }
                }
            };
        }

        // Meta Docs for Instagram Messaging API: Use /me/messages with recipient={comment_id}
        const response = await axios.post(
            `https://graph.facebook.com/v19.0/me/messages`,
            { 
                recipient: { comment_id: commentId },
                message: messageData 
            },
            { 
                params: { 
                    access_token: useToken,
                    platform: 'instagram'
                } 
            }
        );

        console.log(`[INSTAGRAM GRAPH] ✅ DM sent ${button ? 'with button' : '(text only)'} to comment ${commentId}`);
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
    getAccountMedia,
    replyToComment,
    sendPrivateReply
};
