import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { getSystemConfig, saveYoutubeAccount, getYoutubeAccountById, query } from './database.js';

/**
 * YouTube Shorts Service
 * Handles OAuth2 and Video Uploads
 */

const SCOPES = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/userinfo.profile'
];

/**
 * Get OAuth2 Client
 */
async function getOAuth2Client(redirectUri) {
    const clientId = await getSystemConfig('YOUTUBE_CLIENT_ID');
    const clientSecret = await getSystemConfig('YOUTUBE_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
        throw new Error('Configurações do YouTube (Client ID/Secret) não encontradas no sistema.');
    }

    return new google.auth.OAuth2(
        clientId,
        clientSecret,
        redirectUri
    );
}

/**
 * Generate Auth URL
 */
export async function getAuthUrl(redirectUri, state = '') {
    const oauth2Client = await getOAuth2Client(redirectUri);
    return oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
        state: state
    });
}

/**
 * Get Tokens from Code
 */
export async function getTokensFromCode(code, redirectUri, userId) {
    const oauth2Client = await getOAuth2Client(redirectUri);
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get channel info
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const response = await youtube.channels.list({
        part: 'snippet,contentDetails',
        mine: true
    });

    const channel = response.data.items[0];
    if (!channel) throw new Error('Nenhum canal do YouTube encontrado para esta conta.');

    const accountData = {
        channel_name: channel.snippet.title,
        channel_id: channel.id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || tokens.access_token, // Fallback if no refresh token (though prompt:consent should fix this)
        profile_picture_url: channel.snippet.thumbnails.default.url
    };

    return await saveYoutubeAccount(accountData, userId);
}

/**
 * Upload Video to YouTube Shorts
 */
export async function uploadShorts(videoPath, title, description, dbAccountId, userId) {
    try {
        const account = await getYoutubeAccountById(dbAccountId, userId);
        if (!account) throw new Error('Conta do YouTube não encontrada.');

        const oauth2Client = await getOAuth2Client();
        oauth2Client.setCredentials({
            access_token: account.access_token,
            refresh_token: account.refresh_token
        });

        // Auto-refresh token if needed
        oauth2Client.on('tokens', async (tokens) => {
            if (tokens.access_token) {
                console.log('[YOUTUBE] Access token refreshed automatically.');
                await query('UPDATE youtube_accounts SET access_token = $1 WHERE id = $2', [tokens.access_token, dbAccountId]);
            }
        });

        const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

        // Check if file exists
        if (!fs.existsSync(videoPath)) {
            throw new Error(`Arquivo de vídeo não encontrado: ${videoPath}`);
        }

        const fileSize = fs.statSync(videoPath).size;

        console.log(`[YOUTUBE] Iniciando upload de Shorts: ${title} (${fileSize} bytes)`);

        const response = await youtube.videos.insert({
            part: 'snippet,status',
            requestBody: {
                snippet: {
                    title: title.substring(0, 100), // YouTube limit
                    description: `${description}\n\n#Shorts #Shopee #Achadinhos`,
                    categoryId: '22' // People & Blogs
                },
                status: {
                    privacyStatus: 'public', // or 'unlisted' for testing
                    selfDeclaredMadeForKids: false
                }
            },
            media: {
                body: fs.createReadStream(videoPath)
            }
        }, {
            // Resumable upload for better stability
            onUploadProgress: (evt) => {
                const progress = (evt.bytesRead / fileSize) * 100;
                console.log(`[YOUTUBE] Upload Progress: ${progress.toFixed(2)}%`);
                if (global.postProgress) {
                    global.postProgress.set(`yt-${dbAccountId}`, progress);
                }
            }
        });

        console.log(`[YOUTUBE] Upload concluído! ID: ${response.data.id}`);

        return {
            success: true,
            mediaId: response.data.id,
            url: `https://youtube.com/shorts/${response.data.id}`
        };

    } catch (error) {
        console.error('[YOUTUBE UPLOAD ERROR]:', error.response?.data || error.message);
        throw new Error(`Falha no upload para o YouTube: ${error.message}`);
    }
}
