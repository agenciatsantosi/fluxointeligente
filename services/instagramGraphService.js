import axios from 'axios';

// Instagram Graph API configuration
let accessToken = null;
let instagramAccountId = null;

/**
 * Configure Instagram Graph API credentials
 */
export function configureGraphAPI(token, accountId) {
    accessToken = token;
    instagramAccountId = accountId;
    console.log('[INSTAGRAM GRAPH] API configured');
    return { success: true };
}

/**
 * Get current configuration status
 */
export function getGraphStatus() {
    return {
        success: true,
        configured: !!(accessToken && instagramAccountId),
        accountId: instagramAccountId
    };
}

/**
 * Upload video to Instagram via Graph API
 * Step 1: Create container
 * Step 2: Check status
 * Step 3: Publish
 */
export async function postVideoGraph(videoUrl, caption) {
    try {
        if (!accessToken || !instagramAccountId) {
            throw new Error('Graph API não configurada. Configure o Access Token primeiro.');
        }

        console.log('[INSTAGRAM GRAPH] Creating video container...');

        // Step 1: Create video container
        const containerResponse = await axios.post(
            `https://graph.facebook.com/v18.0/${instagramAccountId}/media`,
            {
                media_type: 'REELS',
                video_url: videoUrl,
                caption: caption,
                access_token: accessToken
            }
        );

        const containerId = containerResponse.data.id;
        console.log('[INSTAGRAM GRAPH] Container created:', containerId);

        // Step 2: Wait for video to be processed
        let status = 'IN_PROGRESS';
        let attempts = 0;
        const maxAttempts = 30; // 30 attempts * 2 seconds = 60 seconds max

        while (status === 'IN_PROGRESS' && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

            const statusResponse = await axios.get(
                `https://graph.facebook.com/v18.0/${containerId}`,
                {
                    params: {
                        fields: 'status_code',
                        access_token: accessToken
                    }
                }
            );

            status = statusResponse.data.status_code;
            attempts++;
            console.log(`[INSTAGRAM GRAPH] Processing status: ${status} (attempt ${attempts})`);
        }

        if (status !== 'FINISHED') {
            throw new Error(`Vídeo não foi processado corretamente. Status: ${status}`);
        }

        // Step 3: Publish the video
        console.log('[INSTAGRAM GRAPH] Publishing video...');
        const publishResponse = await axios.post(
            `https://graph.facebook.com/v18.0/${instagramAccountId}/media_publish`,
            {
                creation_id: containerId,
                access_token: accessToken
            }
        );

        const mediaId = publishResponse.data.id;
        console.log('[INSTAGRAM GRAPH] Video published successfully:', mediaId);

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
export async function postImageGraph(imageUrl, caption) {
    try {
        if (!accessToken || !instagramAccountId) {
            throw new Error('Graph API não configurada. Configure o Access Token primeiro.');
        }

        console.log('[INSTAGRAM GRAPH] Creating image container...');

        // Step 1: Create image container
        const containerResponse = await axios.post(
            `https://graph.facebook.com/v18.0/${instagramAccountId}/media`,
            {
                image_url: imageUrl,
                caption: caption,
                access_token: accessToken
            }
        );

        const containerId = containerResponse.data.id;
        console.log('[INSTAGRAM GRAPH] Container created:', containerId);

        // Step 2: Publish the image
        console.log('[INSTAGRAM GRAPH] Publishing image...');
        const publishResponse = await axios.post(
            `https://graph.facebook.com/v18.0/${instagramAccountId}/media_publish`,
            {
                creation_id: containerId,
                access_token: accessToken
            }
        );

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

    // Calculate fake discount (50% higher original price)
    const fakeOriginalPrice = (product.price * 1.5).toFixed(2);

    // Replace placeholders
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
        'achadinhos',
        'ofertas',
        'shopee',
        'promocao',
        'desconto',
        'compras',
        'economia',
        'ofertasdodia',
        'shopeebrasil',
        'produtosimportados'
    ];

    const allHashtags = [...new Set([...defaultHashtags, ...customHashtags])];
    return allHashtags.slice(0, 30).map(tag => `#${tag.replace('#', '')}`).join(' ');
}

/**
 * Post product to Instagram via Graph API
 */
export async function postProductGraph(product, messageTemplate, groupLink, customHashtags = []) {
    try {
        if (!accessToken || !instagramAccountId) {
            throw new Error('Graph API não configurada');
        }

        // Format caption
        let caption = formatInstagramCaption(product, messageTemplate, groupLink);

        // Add hashtags
        const hashtags = generateHashtags(product, customHashtags);
        caption += `\n\n${hashtags}`;

        // Get media URL (prioritize video over image)
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

        // Post based on media type
        if (isVideo) {
            return await postVideoGraph(mediaUrl, caption);
        } else {
            return await postImageGraph(mediaUrl, caption);
        }
    } catch (error) {
        console.error('[INSTAGRAM GRAPH] Post product error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get account info via Graph API
 */
export async function getAccountInfoGraph() {
    try {
        if (!accessToken || !instagramAccountId) {
            throw new Error('Graph API não configurada');
        }

        const response = await axios.get(
            `https://graph.facebook.com/v18.0/${instagramAccountId}`,
            {
                params: {
                    fields: 'username,name,biography,followers_count,follows_count,media_count',
                    access_token: accessToken
                }
            }
        );

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

export default {
    configureGraphAPI,
    getGraphStatus,
    postVideoGraph,
    postImageGraph,
    postProductGraph,
    getAccountInfoGraph
};
