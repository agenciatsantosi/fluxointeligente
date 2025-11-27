import { TwitterApi } from 'twitter-api-v2';
import axios from 'axios';
import * as analytics from './analyticsService.js';
import db, { getTwitterConfig, getTwitterDailyCount } from './database.js';

const TWITTER_DAILY_LIMIT = 25;

// Twitter client instance
let client = null;
let credentials = null;
let connectionStatus = 'disconnected'; // disconnected, connecting, connected
let accountInfo = null;

/**
 * Initialize Twitter client with credentials
 */
export function initializeTwitter(apiKey, apiSecret, accessToken, accessTokenSecret) {
    try {
        credentials = {
            appKey: apiKey,
            appSecret: apiSecret,
            accessToken: accessToken,
            accessSecret: accessTokenSecret
        };

        client = new TwitterApi(credentials);
        connectionStatus = 'connected';

        console.log('[TWITTER] Client initialized successfully');
        return { success: true };
    } catch (error) {
        console.error('[TWITTER] Initialization error:', error);
        connectionStatus = 'disconnected';
        return { success: false, error: error.message };
    }
}

/**
 * Test connection and get account info
 */
export async function testConnection(apiKey, apiSecret, accessToken, accessTokenSecret) {
    try {
        const testClient = new TwitterApi({
            appKey: apiKey,
            appSecret: apiSecret,
            accessToken: accessToken,
            accessSecret: accessTokenSecret
        });

        // Get authenticated user info
        const user = await testClient.v2.me({
            'user.fields': ['public_metrics', 'description', 'profile_image_url']
        });

        accountInfo = {
            id: user.data.id,
            username: user.data.username,
            name: user.data.name,
            description: user.data.description,
            followersCount: user.data.public_metrics.followers_count,
            followingCount: user.data.public_metrics.following_count,
            tweetCount: user.data.public_metrics.tweet_count,
            profileImage: user.data.profile_image_url
        };

        console.log(`[TWITTER] Connected as @${accountInfo.username}`);

        // --- VERIFY WRITE PERMISSIONS ---
        try {
            console.log('[TWITTER] Verifying write permissions...');
            const testTweet = await testClient.v2.tweet(`[MeliFlow] Verificando permissões de escrita... ${Date.now()}`);
            if (testTweet.data && testTweet.data.id) {
                await testClient.v2.deleteTweet(testTweet.data.id);
                console.log('[TWITTER] Write permissions verified!');
            }
        } catch (writeError) {
            console.error('[TWITTER] Write permission check failed:', writeError);
            if (writeError.code === 403 || (writeError.data && writeError.data.status === 403)) {
                return {
                    success: false,
                    error: "Sua conta tem apenas permissão de LEITURA. Vá no Twitter Developer Portal > User authentication settings > Mude para 'Read and Write' > E REGERE (Regenerate) os tokens."
                };
            }
            // Other errors (like rate limit) we might warn but allow
            console.warn('[TWITTER] Could not verify write permissions, but read is okay.');
        }

        return {
            success: true,
            account: accountInfo
        };
    } catch (error) {
        console.error('[TWITTER] Connection test failed:', error);

        // Handle Rate Limit (429) - Allow saving credentials even if limited
        if (error.code === 429 || (error.data && error.data.status === 429)) {
            console.warn('[TWITTER] Rate limit hit during connection test. Assuming valid credentials.');

            // Try to get stored config for profile image
            const storedConfig = getTwitterConfig();

            // Use placeholder info if we can't get it
            accountInfo = {
                id: 'rate_limited',
                username: storedConfig?.username || 'Usuario (Limite Atingido)',
                name: 'Conta Conectada',
                description: 'Limite da API atingido. Volte amanhã.',
                followersCount: 0,
                followingCount: 0,
                tweetCount: 0,
                profileImage: storedConfig?.profileImage || null
            };

            return {
                success: true,
                account: accountInfo,
                warning: 'Limite de requisições atingido. Suas credenciais foram salvas, mas algumas informações podem não aparecer até amanhã.'
            };
        }

        return {
            success: false,
            error: error.message || 'Failed to connect to Twitter API'
        };
    }
}

/**
 * Get current connection status
 */
export function getStatus() {
    return {
        status: connectionStatus,
        account: accountInfo
    };
}

/**
 * Upload media (image or video) to Twitter
 */
async function uploadMedia(mediaUrl) {
    try {
        if (!client) {
            throw new Error('Twitter client not initialized');
        }

        console.log(`[TWITTER] Downloading media from ${mediaUrl}...`);

        // Download media
        const response = await axios.get(mediaUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data);

        console.log('[TWITTER] Uploading media to Twitter...');

        // Upload to Twitter
        const mediaId = await client.v1.uploadMedia(buffer, {
            mimeType: response.headers['content-type']
        });

        console.log(`[TWITTER] Media uploaded successfully: ${mediaId}`);
        return mediaId;
    } catch (error) {
        console.error('[TWITTER] Media upload error:', error);
        if (error.code === 403 || (error.data && error.data.status === 403)) {
            throw new Error("Permissão negada para upload de mídia. Verifique se seu App no Twitter Developer Portal tem permissões de 'Read and Write' e se você REGEROU os tokens de acesso.");
        }
        throw error;
    }
}

/**
 * Post a tweet
 */
export async function postTweet(text, mediaUrl = null, mediaType = 'auto') {
    try {
        if (!client || connectionStatus !== 'connected') {
            throw new Error('Twitter not connected');
        }

        console.log('[TWITTER] Preparing to post tweet...');

        let tweetData = { text };

        // Upload media if provided
        if (mediaUrl) {
            try {
                const mediaId = await uploadMedia(mediaUrl);
                tweetData.media = { media_ids: [mediaId] };
                console.log('[TWITTER] Tweet will include media');
            } catch (mediaError) {
                console.warn('[TWITTER] Failed to upload media, posting text only:', mediaError);
            }
        }

        // Post tweet
        const tweet = await client.v2.tweet(tweetData);

        console.log(`[TWITTER] Tweet posted successfully: ${tweet.data.id}`);

        return {
            success: true,
            tweetId: tweet.data.id,
            text: tweet.data.text
        };
    } catch (error) {
        console.error('[TWITTER] Post tweet error:', error);

        let errorMessage = error.message;
        if (error.code === 403 || (error.data && error.data.status === 403)) {
            errorMessage = "Permissão negada (403). Verifique se seu App no Twitter Developer Portal tem permissões de 'Read and Write' e se você REGEROU os tokens após mudar isso.";
        }

        return {
            success: false,
            error: errorMessage
        };
    }
}

/**
 * Format product message for Twitter
 */
function formatTwitterMessage(product, template, hashtags = []) {
    let message = template;

    // Calculate fake discount (50% higher original price)
    const fakeOriginalPrice = (product.price * 1.5).toFixed(2);
    const realPrice = product.price.toFixed(2);

    // Replace placeholders
    message = message.replace(/{nome_produto}/g, product.name || product.productName);
    message = message.replace(/{preco_original}/g, fakeOriginalPrice);
    message = message.replace(/{preco_com_desconto}/g, realPrice);
    message = message.replace(/{link}/g, product.affiliateLink || product.link);
    message = message.replace(/{avaliacao}/g, product.rating ? product.rating.toFixed(1) : 'N/A');

    // Add hashtags
    if (hashtags && hashtags.length > 0) {
        const hashtagString = hashtags.map(tag => tag.startsWith('#') ? tag : `#${tag}`).join(' ');
        message += `\n\n${hashtagString}`;
    }

    // Twitter has 280 character limit
    if (message.length > 280) {
        console.warn(`[TWITTER] Message too long (${message.length} chars), truncating...`);
        message = message.substring(0, 277) + '...';
    }

    return message;
}

/**
 * Post product to Twitter
 */
export async function postProduct(product, messageTemplate, hashtags = []) {
    try {
        if (!client || connectionStatus !== 'connected') {
            throw new Error('Twitter not connected');
        }

        // Check daily limit
        const dailyCount = getTwitterDailyCount();
        if (dailyCount >= TWITTER_DAILY_LIMIT) {
            throw new Error(`Limite diário de ${TWITTER_DAILY_LIMIT} tweets atingido. Tente novamente amanhã (Limitação da API Gratuita).`);
        }

        // Format message
        const message = formatTwitterMessage(product, messageTemplate, hashtags);

        // Get media URL (prioritize image)
        let mediaUrl = null;
        if (product.images && product.images.length > 0) {
            mediaUrl = product.images[0];
        } else if (product.imagePath) {
            mediaUrl = product.imagePath;
        } else if (product.imageUrl) {
            mediaUrl = product.imageUrl;
        }

        // Post tweet
        const result = await postTweet(message, mediaUrl);

        // Log analytics event
        if (result.success) {
            analytics.logEvent('twitter_send', {
                productId: product.productId || product.id,
                success: true
            });
        } else {
            analytics.logEvent('twitter_send', {
                productId: product?.productId || product?.id,
                success: false,
                errorMessage: result.error
            });
        }

        return result;
    } catch (error) {
        console.error('[TWITTER] Post product error:', error);

        // Log failure
        analytics.logEvent('twitter_send', {
            productId: product?.productId || product?.id,
            success: false,
            errorMessage: error.message
        });

        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Get account information
 */
export async function getAccountInfo() {
    try {
        if (!client || connectionStatus !== 'connected') {
            throw new Error('Twitter not connected');
        }

        const user = await client.v2.me({
            'user.fields': ['public_metrics', 'description', 'profile_image_url']
        });

        return {
            success: true,
            account: {
                id: user.data.id,
                username: user.data.username,
                name: user.data.name,
                description: user.data.description,
                followersCount: user.data.public_metrics.followers_count,
                followingCount: user.data.public_metrics.following_count,
                tweetCount: user.data.public_metrics.tweet_count,
                profileImage: user.data.profile_image_url
            }
        };
    } catch (error) {
        console.error('[TWITTER] Get account info error:', error);

        // Return cached info on rate limit
        if (error.code === 429 || (error.data && error.data.status === 429)) {
            console.warn('[TWITTER] Rate limit hit in getAccountInfo. Returning placeholder.');

            if (!accountInfo) {
                // Try to get stored config for profile image
                const storedConfig = getTwitterConfig();

                accountInfo = {
                    id: 'rate_limited',
                    username: storedConfig?.username || 'Usuario (Limite Atingido)',
                    name: 'Conta Conectada',
                    description: 'Limite da API atingido. Volte amanhã.',
                    followersCount: 0,
                    followingCount: 0,
                    tweetCount: 0,
                    profileImage: storedConfig?.profileImage || null
                };
            }

            return {
                success: true,
                account: accountInfo,
                rateLimited: true
            };
        }

        return {
            success: false,
            error: error.message
        };
    }
}

export default {
    initializeTwitter,
    testConnection,
    getStatus,
    postTweet,
    postProduct,
    getAccountInfo
};
