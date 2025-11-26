import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as analytics from './analyticsService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Session directory
const sessionDir = path.join(__dirname, '..', 'data', 'whatsapp-session');
if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
}

// Global state
let sock = null;
let qrCode = null;
let connectionStatus = 'disconnected'; // disconnected, connecting, connected, qr_ready
let contacts = [];
let groups = [];

// Logger
const logger = pino({ level: 'silent' }); // Set to 'debug' for debugging

/**
 * Initialize WhatsApp connection
 */
export async function initializeWhatsApp() {
    try {
        console.log('[WHATSAPP] Initializing connection...');

        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version } = await fetchLatestBaileysVersion();

        sock = makeWASocket({
            version,
            logger,
            printQRInTerminal: false, // We'll handle QR ourselves
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger)
            },
            browser: ['MeliFlow', 'Chrome', '1.0.0']
        });

        // Connection update handler
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                qrCode = qr;
                connectionStatus = 'qr_ready';
                console.log('[WHATSAPP] QR Code ready for scanning');
            }

            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error instanceof Boom)
                    ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
                    : true;

                console.log('[WHATSAPP] Connection closed. Reconnect:', shouldReconnect);
                connectionStatus = 'disconnected';
                qrCode = null;

                if (shouldReconnect) {
                    setTimeout(() => initializeWhatsApp(), 3000);
                }
            } else if (connection === 'open') {
                console.log('[WHATSAPP] ✅ Connected successfully!');
                connectionStatus = 'connected';
                qrCode = null;

                // Load contacts and groups
                await loadContactsAndGroups();
            } else if (connection === 'connecting') {
                connectionStatus = 'connecting';
                console.log('[WHATSAPP] Connecting...');
            }
        });

        // Save credentials on update
        sock.ev.on('creds.update', saveCreds);

        // Messages update (Auto-Reply) - DISABLED to prevent unwanted messages
        // sock.ev.on('messages.upsert', async (msg) => {
        //     await handleIncomingMessage(msg);
        // });

        return { success: true, status: connectionStatus };
    } catch (error) {
        console.error('[WHATSAPP] Initialization error:', error);
        connectionStatus = 'disconnected';
        return { success: false, error: error.message };
    }
}

/**
 * Load contacts and groups
 */
async function loadContactsAndGroups() {
    try {
        if (!sock) return;

        // Get contacts
        const contactsObj = await sock.store?.contacts || {};
        contacts = Object.values(contactsObj).filter(c => c.id && !c.id.includes('@g.us'));

        // Get groups
        const groupsData = await sock.groupFetchAllParticipating();
        groups = Object.values(groupsData).map(g => ({
            id: g.id,
            name: g.subject,
            participants: g.participants.length
        }));

        console.log(`[WHATSAPP] Loaded ${contacts.length} contacts and ${groups.length} groups`);
    } catch (error) {
        console.error('[WHATSAPP] Error loading contacts/groups:', error);
    }
}

/**
 * Get current QR code
 */
export function getQRCode() {
    return qrCode;
}

/**
 * Get connection status
 */
export function getConnectionStatus() {
    return {
        status: connectionStatus,
        hasQR: qrCode !== null,
        contactsCount: contacts.length,
        groupsCount: groups.length
    };
}

/**
 * Get contacts list
 */
export function getContacts() {
    return contacts.slice(0, 100); // Limit to 100 for performance
}

/**
 * Get groups list
 */
export function getGroups() {
    return groups;
}

/**
 * Send text message
 */
export async function sendMessage(to, message) {
    try {
        if (!sock || connectionStatus !== 'connected') {
            throw new Error('WhatsApp not connected');
        }

        // Ensure number has @s.whatsapp.net suffix
        const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;

        await sock.sendMessage(jid, { text: message });

        console.log(`[WHATSAPP] Message sent to ${to}`);
        return { success: true };
    } catch (error) {
        console.error('[WHATSAPP] Send message error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send image with caption
 */
export async function sendImage(to, imageUrl, caption) {
    try {
        if (!sock || connectionStatus !== 'connected') {
            throw new Error('WhatsApp not connected');
        }

        const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;

        // Download image
        const response = await fetch(imageUrl);
        const buffer = await response.arrayBuffer();

        await sock.sendMessage(jid, {
            image: Buffer.from(buffer),
            caption: caption
        });

        console.log(`[WHATSAPP] Image sent to ${to}`);
        return { success: true };
    } catch (error) {
        console.error('[WHATSAPP] Send image error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send video with caption
 */
export async function sendVideo(to, videoUrl, caption) {
    try {
        if (!sock || connectionStatus !== 'connected') {
            throw new Error('WhatsApp not connected');
        }

        const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;

        console.log(`[WHATSAPP] Sending video to ${to}...`);

        // Download video
        const response = await fetch(videoUrl);
        const buffer = await response.arrayBuffer();

        await sock.sendMessage(jid, {
            video: Buffer.from(buffer),
            caption: caption,
            gifPlayback: false
        });

        console.log(`[WHATSAPP] Video sent to ${to}`);
        return { success: true };
    } catch (error) {
        console.error('[WHATSAPP] Send video error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send audio (PTT - Push To Talk)
 */
export async function sendAudio(to, audioUrl) {
    try {
        if (!sock || connectionStatus !== 'connected') {
            throw new Error('WhatsApp not connected');
        }

        const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;

        // Download audio
        const response = await fetch(audioUrl);
        const buffer = await response.arrayBuffer();

        await sock.sendMessage(jid, {
            audio: Buffer.from(buffer),
            mimetype: 'audio/mp4',
            ptt: true // Sends as voice note
        });

        console.log(`[WHATSAPP] Audio sent to ${to}`);
        return { success: true };
    } catch (error) {
        console.error('[WHATSAPP] Send audio error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Simulate typing or recording
 */
export async function sendPresenceUpdate(to, type = 'composing') {
    try {
        if (!sock || connectionStatus !== 'connected') return;
        const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
        await sock.sendPresenceUpdate(type, jid);
    } catch (error) {
        console.error('[WHATSAPP] Presence update error:', error);
    }
}

/**
 * Post to Status/Stories
 */
export async function postToStatus(message, mediaUrl = null, mediaType = 'text') {
    try {
        console.log('[WHATSAPP] Attempting to post to Status...');
        console.log('[WHATSAPP] Media Type:', mediaType);
        console.log('[WHATSAPP] Media URL:', mediaUrl ? 'Yes' : 'No');

        if (!sock || connectionStatus !== 'connected') {
            const error = 'WhatsApp not connected';
            console.error('[WHATSAPP] Post status error:', error);
            throw new Error(error);
        }

        const statusJid = 'status@broadcast';

        if (mediaType === 'image' && mediaUrl) {
            console.log('[WHATSAPP] Posting image to Status...');
            const response = await fetch(mediaUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch image: ${response.statusText}`);
            }
            const buffer = await response.arrayBuffer();
            await sock.sendMessage(statusJid, { image: Buffer.from(buffer), caption: message });
            console.log('[WHATSAPP] ✅ Image posted to Status successfully');
        } else if (mediaType === 'video' && mediaUrl) {
            console.log('[WHATSAPP] Posting video to Status...');
            const response = await fetch(mediaUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch video: ${response.statusText}`);
            }
            const buffer = await response.arrayBuffer();
            await sock.sendMessage(statusJid, { video: Buffer.from(buffer), caption: message });
            console.log('[WHATSAPP] ✅ Video posted to Status successfully');
        } else {
            console.log('[WHATSAPP] Posting text to Status...');
            await sock.sendMessage(statusJid, { text: message, backgroundColor: '#315558' });
            console.log('[WHATSAPP] ✅ Text posted to Status successfully');
        }

        console.log('[WHATSAPP] Posted to Status');
        return { success: true };
    } catch (error) {
        console.error('[WHATSAPP] Post status error:', error);
        console.error('[WHATSAPP] Error details:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Join group via invite link
 */
export async function joinGroup(inviteLink) {
    try {
        if (!sock || connectionStatus !== 'connected') {
            throw new Error('WhatsApp not connected');
        }

        // Extract code from link (https://chat.whatsapp.com/Code)
        const code = inviteLink.split('chat.whatsapp.com/')[1];
        if (!code) throw new Error('Invalid invite link');

        const response = await sock.groupAcceptInvite(code);
        console.log('[WHATSAPP] Joined group:', response);
        return { success: true, groupId: response };
    } catch (error) {
        console.error('[WHATSAPP] Join group error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send message mentioning everyone
 */
export async function sendMentionAll(to, message) {
    try {
        if (!sock || connectionStatus !== 'connected') {
            throw new Error('WhatsApp not connected');
        }

        const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;

        // Get group metadata to find participants
        const groupMetadata = await sock.groupMetadata(jid);
        const participants = groupMetadata.participants.map(p => p.id);

        await sock.sendMessage(jid, {
            text: message,
            mentions: participants
        });

        console.log(`[WHATSAPP] Mention all sent to ${to}`);
        return { success: true };
    } catch (error) {
        console.error('[WHATSAPP] Mention all error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send product message (text, image, or video)
 */
export async function sendProductMessage(to, product, template, mediaType = 'auto', options = {}) {
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

        // Simulate typing if requested
        if (options.simulateTyping) {
            await sendPresenceUpdate(to, 'composing');
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s
        }

        // Handle Mentions
        let mentions = [];
        if (options.mentionAll && to.includes('@g.us')) {
            try {
                const groupMetadata = await sock.groupMetadata(to);
                mentions = groupMetadata.participants.map(p => p.id);
            } catch (e) {
                console.warn('[WHATSAPP] Failed to get participants for mention:', e);
            }
        }

        const hasImage = product.imagePath || product.imageUrl;
        const hasVideo = product.videoUrl;

        if (mediaType === 'video' && hasVideo) {
            await sendVideo(to, product.videoUrl, message);
        } else if ((mediaType === 'auto' || mediaType === 'image') && hasImage) {
            const imageUrl = product.imagePath || product.imageUrl;

            // If mention all, we need to use sendMessage with image and mentions
            if (mentions.length > 0) {
                const response = await fetch(imageUrl);
                const buffer = await response.arrayBuffer();
                await sock.sendMessage(to, {
                    image: Buffer.from(buffer),
                    caption: message,
                    mentions: mentions
                });
            } else {
                await sendImage(to, imageUrl, message);
            }
        } else {
            if (mentions.length > 0) {
                await sock.sendMessage(to, { text: message, mentions: mentions });
            } else {
                await sendMessage(to, message);
            }
        }

        // Post to status if requested
        if (options.postToStatus) {
            const mediaUrl = (mediaType === 'video' && hasVideo) ? product.videoUrl : (hasImage ? (product.imagePath || product.imageUrl) : null);
            const type = (mediaType === 'video' && hasVideo) ? 'video' : (hasImage ? 'image' : 'text');
            await postToStatus(message, mediaUrl, type);
        }

        // Log success event
        analytics.logEvent('whatsapp_send', {
            productId: product.productId || product.id,
            groupId: to,
            success: true
        });

        return { success: true };
    } catch (error) {
        console.error('[WHATSAPP] Send product error:', error);

        // Log failure event
        analytics.logEvent('whatsapp_send', {
            productId: product?.productId || product?.id,
            groupId: to,
            success: false,
            errorMessage: error.message
        });

        return { success: false, error: error.message };
    }
}

/**
 * Disconnect WhatsApp
 */
export async function disconnectWhatsApp() {
    try {
        if (sock) {
            await sock.logout();
            sock = null;
            connectionStatus = 'disconnected';
            qrCode = null;
            contacts = [];
            groups = [];

            // Clear session
            if (fs.existsSync(sessionDir)) {
                fs.rmSync(sessionDir, { recursive: true, force: true });
                fs.mkdirSync(sessionDir, { recursive: true });
            }

            console.log('[WHATSAPP] Disconnected and session cleared');
        }
        return { success: true };
    } catch (error) {
        console.error('[WHATSAPP] Disconnect error:', error);
        return { success: false, error: error.message };
    }
}

export default {
    initializeWhatsApp,
    getQRCode,
    getConnectionStatus,
    getContacts,
    getGroups,
    sendMessage,
    sendImage,
    sendProductMessage,
    sendVideo,
    sendAudio,
    sendPresenceUpdate,
    postToStatus,
    joinGroup,
    sendMentionAll,
    disconnectWhatsApp
};
