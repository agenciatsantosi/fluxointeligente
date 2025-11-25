import axios from 'axios';
import * as db from './database.js';

// Facebook Graph API configuration
const GRAPH_API_VERSION = 'v18.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Add a Facebook page
 */
export function addPage(pageData) {
    const page = {
        id: pageData.pageId.trim(),
        name: pageData.pageName || 'Unnamed Page',
        accessToken: pageData.accessToken.trim(),
        enabled: true,
        addedAt: new Date().toISOString()
    };

    // Save to database
    db.saveFacebookPage(page);

    console.log(`[FACEBOOK] Page added: ${page.name} (${page.id})`);
    return { success: true, page };
}

/**
 * Get all configured pages
 */
export function getPages() {
    return db.getFacebookPages();
}

/**
 * Remove a page
 */
export function removePage(pageId) {
    const result = db.removeFacebookPage(pageId);

    if (result.changes > 0) {
        console.log(`[FACEBOOK] Page removed: ${pageId}`);
        return { success: true };
    }

    return { success: false, error: 'Page not found' };
}

/**
 * Toggle page enabled status
 */
export function togglePage(pageId) {
    return db.toggleFacebookPage(pageId);
}

/**
 * Verify page access token
 */
export async function verifyPageToken(pageId, accessToken) {
    try {
        // First, try to get page info
        const response = await axios.get(`${GRAPH_API_BASE}/${pageId}`, {
            params: {
                fields: 'id,name',
                access_token: accessToken
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
        console.error('[FACEBOOK] Token verification error:', error.response?.data || error.message);

        // Provide helpful error messages
        let errorMessage = 'Erro ao verificar token';

        if (error.response?.data?.error) {
            const fbError = error.response.data.error;

            if (fbError.message.includes('does not exist')) {
                errorMessage = '❌ Page ID incorreto ou você não tem acesso a esta página.\\n\\n💡 Dica: Verifique se:\\n- O Page ID está correto\\n- Você é administrador da página\\n- O token foi gerado para esta página específica';
            } else if (fbError.message.includes('permissions') || fbError.message.includes('missing')) {
                errorMessage = '❌ Token sem permissões necessárias.\\n\\n💡 Solução:\\n1. Vá em Graph API Explorer\\n2. Gere um novo token\\n3. Marque as permissões: pages_manage_posts, pages_read_engagement\\n4. Certifique-se de selecionar SUA PÁGINA (não seu perfil)';
            } else if (fbError.code === 190) {
                errorMessage = '❌ Token inválido ou expirado.\\n\\n💡 Solução: Gere um novo Access Token no Facebook Developers';
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
 * Get page insights (analytics)
 */
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

export default {
    addPage,
    getPages,
    removePage,
    togglePage,
    verifyPageToken,
    postMessage,
    postPhoto,
    postProduct,
    getPageInsights
};
