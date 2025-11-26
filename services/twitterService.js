import { TwitterApi } from 'twitter-api-v2';
import axios from 'axios';
import * as analytics from './analyticsService.js';

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

        return {
            success: true,
            account: accountInfo
        };
    } catch (error) {
        console.error('[TWITTER] Connection test failed:', error);
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
        return {
            success: false,
            error: error.message
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
