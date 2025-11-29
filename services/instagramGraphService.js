import axios from 'axios';
import {
    saveSystemConfig,
    getSystemConfig,
    addInstagramAccount,
    getInstagramAccounts,
    getInstagramAccountById,
    removeInstagramAccount
} from './database.js';

// Instagram Graph API configuration
let globalAccessToken = null;
let globalAccountId = null;

/**
 * Initialize Graph API from database
 */
export function initializeGraphAPI() {
    try {
        const accounts = getInstagramAccounts();
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
 * Add a new Instagram account
 */
export async function addAccount(token, accountId) {
    const cleanToken = token.trim();
    const cleanId = accountId.trim();

    try {
        const response = await axios.get(
            `https://graph.facebook.com/v18.0/${cleanId}?fields=username,name,profile_picture_url&access_token=${cleanToken}`
        );

        const { username, name, profile_picture_url } = response.data;

        const result = addInstagramAccount(
            name || username || 'Instagram Account',
            cleanToken,
            cleanId,
            username,
            profile_picture_url
        );

        if (!globalAccessToken) {
            globalAccessToken = cleanToken;
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
 * Get credentials for a specific account or use global defaults
 */
function getCredentials(dbAccountId = null) {
    if (dbAccountId) {
        const account = getInstagramAccountById(dbAccountId);
        if (!account) {
            throw new Error(`Account with ID ${dbAccountId} not found`);
        }
        return {
            token: account.access_token.trim(),
            id: account.account_id.trim()
        };
    }

    if (globalAccessToken && globalAccountId) {
        return {
            token: globalAccessToken.trim(),
            id: globalAccountId.trim()
        };
    }

    const accounts = getInstagramAccounts();
    if (accounts.length > 0) {
        return {
            token: accounts[0].access_token.trim(),
            id: accounts[0].account_id.trim()
        };
    }

    throw new Error('No Instagram account configured');
}

/**
 * Upload video (Reels) to Instagram via Graph API
 */
export async function postVideoGraph(videoUrl, caption, dbAccountId = null) {
    try {
        const { token, id } = getCredentials(dbAccountId);

        if (!token || !id) {
            throw new Error('Graph API não configurada. Adicione uma conta primeiro.');
        }

        console.log(`[INSTAGRAM GRAPH] Starting video upload for account ${id}...`);

        // DEBUG: Log token and URL details
        console.log(`[DEBUG] Token length: ${token.length}`);
        console.log(`[DEBUG] Token first 20 chars: ${token.substring(0, 20)}...`);
        console.log(`[DEBUG] Account ID: ${id}`);

        // 1. Create Media Container - Using URL parameters (Instagram Content Publishing API standard)
        const createUrl = `https://graph.facebook.com/v18.0/${id}/media?media_type=REELS&video_url=${encodeURIComponent(videoUrl)}&caption=${encodeURIComponent(caption)}&access_token=${token}`;

        console.log(`[DEBUG] Full URL (token masked): ${createUrl.replace(/access_token=[^&]+/, 'access_token=***MASKED***')}`);

        const containerResponse = await axios.post(createUrl);

        const containerId = containerResponse.data.id;
        console.log(`[INSTAGRAM GRAPH] Container created: ${containerId}`);

        // 2. Wait for processing
        let status = 'IN_PROGRESS';
        let attempts = 0;

        while (status !== 'FINISHED' && attempts < 60) {
            await new Promise(resolve => setTimeout(resolve, 5000));

            const statusUrl = `https://graph.facebook.com/v18.0/${containerId}?fields=status_code,status&access_token=${token}`;
            const statusResponse = await axios.get(statusUrl);

            status = statusResponse.data.status;
            console.log(`[INSTAGRAM GRAPH] Processing status: ${status}`);

            if (status === 'ERROR') {
                throw new Error('Erro no processamento do vídeo pelo Instagram');
            }

            attempts++;
        }

        if (status !== 'FINISHED') {
            throw new Error('Timeout waiting for video processing');
        }

        // 3. Publish Media
        const publishUrl = `https://graph.facebook.com/v18.0/${id}/media_publish?creation_id=${containerId}&access_token=${token}`;
        const publishResponse = await axios.post(publishUrl);

        const mediaId = publishResponse.data.id;
        console.log(`[INSTAGRAM GRAPH] Published successfully: ${mediaId}`);

        return {
            success: true,
            mediaId: mediaId
        };
    } catch (error) {
        console.error('[INSTAGRAM GRAPH] Post video error:', error.response?.data || error.message);

        let errorMessage = 'Erro ao postar vídeo via Graph API';
        if (error.response?.data?.error?.message) {
            errorMessage = error.response.data.error.message;
        }

        return { success: false, error: errorMessage };
    }
}

/**
 * Upload image to Instagram via Graph API
 */
export async function postImageGraph(imageUrl, caption, dbAccountId = null) {
    try {
        const { token, id } = getCredentials(dbAccountId);

        if (!token || !id) {
            throw new Error('Graph API não configurada. Adicione uma conta primeiro.');
        }

        console.log(`[INSTAGRAM GRAPH] Creating image container for account ${id}...`);

        // Create image container
        const createUrl = `https://graph.facebook.com/v18.0/${id}/media?image_url=${encodeURIComponent(imageUrl)}&caption=${encodeURIComponent(caption)}&access_token=${token}`;
        const containerResponse = await axios.post(createUrl);

        const containerId = containerResponse.data.id;
        console.log('[INSTAGRAM GRAPH] Container created:', containerId);

        // Publish the image
        const publishUrl = `https://graph.facebook.com/v18.0/${id}/media_publish?creation_id=${containerId}&access_token=${token}`;
        const publishResponse = await axios.post(publishUrl);

        const mediaId = publishResponse.data.id;
        console.log('[INSTAGRAM GRAPH] Image published successfully:', mediaId);

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

/**
 * Format product message for Instagram
 */
function formatInstagramCaption(product, template, groupLink) {
    let caption = template;
    const fakeOriginalPrice = (product.price * 1.5).toFixed(2);

    caption = caption.replace(/{nome_produto}/g, product.name || product.title);
    caption = caption.replace(/{preco_original}/g, fakeOriginalPrice);
    caption = caption.replace(/{preco_com_desconto}/g, product.price.toFixed(2));
    caption = caption.replace(/{link}/g, product.affiliate_link || product.link);
    caption = caption.replace(/\[LINK_DO_GRUPO\]/g, groupLink || '');

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

    const allHashtags = [...new Set([...defaultHashtags, ...customHashtags])];
    return allHashtags.slice(0, 30).map(tag => `#${tag.replace('#', '')}`).join(' ');
}

/**
 * Post product to Instagram via Graph API
 */
export async function postProductGraph(product, messageTemplate, groupLink, customHashtags = [], dbAccountId = null) {
    try {
        const { token, id } = getCredentials(dbAccountId);

        if (!token || !id) {
            throw new Error('Graph API não configurada');
        }

        let caption = formatInstagramCaption(product, messageTemplate, groupLink);
        const hashtags = generateHashtags(product, customHashtags);
        caption += `\n\n${hashtags}`;

        let mediaUrl = null;
        let isVideo = false;

        if (product.videos && product.videos.length > 0) {
            mediaUrl = product.videos[0];
            isVideo = true;
        } else if (product.images && product.images.length > 0) {
            mediaUrl = product.images[0];
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
        const { token, id } = getCredentials(dbAccountId);

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
export function getAccounts() {
    return getInstagramAccounts();
}

/**
 * Remove an Instagram account
 */
export function removeAccount(id) {
    return removeInstagramAccount(id);
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
export function getGraphStatus() {
    const accounts = getInstagramAccounts();
    return {
        configured: accounts.length > 0,
        accountCount: accounts.length
    };
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
    getAccountInfoGraph
};
