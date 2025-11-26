import { IgApiClient } from 'instagram-private-api';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import * as analytics from './analyticsService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Instagram client instance
let ig = null;
let connectionStatus = 'disconnected'; // disconnected, connecting, connected
let currentUsername = null;

/**
 * Initialize Instagram client
 */
export async function initializeInstagram() {
    try {
        ig = new IgApiClient();
        console.log('[INSTAGRAM] Client initialized');
        return { success: true };
    } catch (error) {
        console.error('[INSTAGRAM] Initialization error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Login to Instagram
 */
export async function login(username, password) {
    try {
        if (!ig) {
            await initializeInstagram();
        }

        connectionStatus = 'connecting';
        console.log(`[INSTAGRAM] Attempting login for ${username}...`);

        ig.state.generateDevice(username);

        // Simulate pre-login flow
        await ig.simulate.preLoginFlow();

        // Perform login
        const auth = await ig.account.login(username, password);

        connectionStatus = 'connected';
        currentUsername = username;

        console.log(`[INSTAGRAM] Successfully logged in as ${username}`);

        return {
            success: true,
            username: auth.username,
            userId: auth.pk
        };
    } catch (error) {
        connectionStatus = 'disconnected';
        console.error('[INSTAGRAM] Login error:', error);

        let errorMessage = 'Erro ao fazer login';
        if (error.message.includes('challenge_required')) {
            errorMessage = 'Verificação de segurança necessária. Faça login pelo app do Instagram primeiro.';
        } else if (error.message.includes('bad_password')) {
            errorMessage = 'Senha incorreta';
        } else if (error.message.includes('invalid_user')) {
            errorMessage = 'Usuário não encontrado';
        }

        return { success: false, error: errorMessage };
    }
}

/**
 * Logout from Instagram
 */
export async function logout() {
    try {
        if (ig) {
            await ig.account.logout();
            connectionStatus = 'disconnected';
            currentUsername = null;
            console.log('[INSTAGRAM] Logged out successfully');
        }
        return { success: true };
    } catch (error) {
        console.error('[INSTAGRAM] Logout error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get connection status
 */
export function getStatus() {
    return {
        success: true,
        status: connectionStatus,
        username: currentUsername
    };
}

/**
 * Download video from URL
 */
async function downloadVideo(videoUrl, outputPath) {
    try {
        const response = await axios({
            method: 'GET',
            url: videoUrl,
            responseType: 'stream'
        });

        const writer = fs.createWriteStream(outputPath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve(outputPath));
            writer.on('error', reject);
        });
    } catch (error) {
        console.error('[INSTAGRAM] Video download error:', error);
        throw error;
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
 * Post video to Instagram
 */
export async function postVideo(videoUrl, caption, coverImageUrl = null) {
    try {
        if (!ig || connectionStatus !== 'connected') {
            throw new Error('Instagram não está conectado');
        }

        console.log('[INSTAGRAM] Preparing to post video...');

        // Download video to temporary location
        const tempDir = path.join(__dirname, '../temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const videoPath = path.join(tempDir, `video_${Date.now()}.mp4`);
        await downloadVideo(videoUrl, videoPath);

        console.log('[INSTAGRAM] Video downloaded, uploading to Instagram...');

        // Read video buffer
        const videoBuffer = fs.readFileSync(videoPath);

        // Upload video
        const publishResult = await ig.publish.video({
            video: videoBuffer,
            caption: caption,
            // coverImage can be added if needed
        });

        // Clean up temp file
        fs.unlinkSync(videoPath);

        console.log('[INSTAGRAM] Video posted successfully');

        return {
            success: true,
            mediaId: publishResult.media.id,
            code: publishResult.media.code
        };
    } catch (error) {
        console.error('[INSTAGRAM] Post video error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Post product to Instagram
 */
export async function postProduct(product, messageTemplate, groupLink, customHashtags = []) {
    try {
        if (!ig || connectionStatus !== 'connected') {
            throw new Error('Instagram não está conectado');
        }

        // Format caption
        let caption = formatInstagramCaption(product, messageTemplate, groupLink);

        // Add hashtags
        const hashtags = generateHashtags(product, customHashtags);
        caption += `\n\n${hashtags}`;

        // Get video URL (prioritize video over image)
        let mediaUrl = null;
        if (product.videos && product.videos.length > 0) {
            mediaUrl = product.videos[0];
        } else if (product.images && product.images.length > 0) {
            mediaUrl = product.images[0];
        }

        if (!mediaUrl) {
            throw new Error('Produto não tem mídia disponível');
        }

        // Check if it's a video
        const isVideo = mediaUrl.includes('.mp4') || (product.videos && product.videos.length > 0);

        let result;
        if (isVideo) {
            result = await postVideo(mediaUrl, caption);
        } else {
            // Post image
            result = await postImage(mediaUrl, caption);
        }

        // Log success event
        if (result.success) {
            analytics.logEvent('instagram_send', {
                productId: product.productId || product.id,
                success: true
            });
        }

        return result;
    } catch (error) {
        console.error('[INSTAGRAM] Post product error:', error);

        // Log failure event
        analytics.logEvent('instagram_send', {
            productId: product?.productId || product?.id,
            success: false,
            errorMessage: error.message
        });

        return { success: false, error: error.message };
    }
}

/**
 * Post image to Instagram
 */
export async function postImage(imageUrl, caption) {
    try {
        if (!ig || connectionStatus !== 'connected') {
            throw new Error('Instagram não está conectado');
        }

        console.log('[INSTAGRAM] Preparing to post image...');

        // Download image to temporary location
        const tempDir = path.join(__dirname, '../temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const imagePath = path.join(tempDir, `image_${Date.now()}.jpg`);
        await downloadVideo(imageUrl, imagePath); // Same download function works for images

        console.log('[INSTAGRAM] Image downloaded, uploading to Instagram...');

        // Read image buffer
        const imageBuffer = fs.readFileSync(imagePath);

        // Upload image
        const publishResult = await ig.publish.photo({
            file: imageBuffer,
            caption: caption
        });

        // Clean up temp file
        fs.unlinkSync(imagePath);

        console.log('[INSTAGRAM] Image posted successfully');

        return {
            success: true,
            mediaId: publishResult.media.id,
            code: publishResult.media.code
        };
    } catch (error) {
        console.error('[INSTAGRAM] Post image error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get account info
 */
export async function getAccountInfo() {
    try {
        if (!ig || connectionStatus !== 'connected') {
            throw new Error('Instagram não está conectado');
        }

        const userInfo = await ig.account.currentUser();

        return {
            success: true,
            user: {
                username: userInfo.username,
                fullName: userInfo.full_name,
                biography: userInfo.biography,
                followerCount: userInfo.follower_count,
                followingCount: userInfo.following_count,
                mediaCount: userInfo.media_count
            }
        };
    } catch (error) {
        console.error('[INSTAGRAM] Get account info error:', error);
        return { success: false, error: error.message };
    }
}

export default {
    initializeInstagram,
    login,
    logout,
    getStatus,
    postVideo,
    postImage,
    postProduct,
    getAccountInfo
};
