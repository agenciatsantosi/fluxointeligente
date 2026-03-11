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

console.log('>>> [DEBUG] WHATSAPP SERVICE v2.0 LOADED <<<');

// Session directory base
const sessionBaseDir = path.join(__dirname, '..', 'data', 'sessions');
if (!fs.existsSync(sessionBaseDir)) {
    fs.mkdirSync(sessionBaseDir, { recursive: true });
}

const instances = new Map();
const logger = pino({ level: 'silent' });
const MAX_RETRIES = 5;

// Helper to generate a unique key for an account
const getInstanceKey = (userId, accountId) => `user_${userId}_acc_${accountId}`;

/**
 * Get or create instance data for a user's specific account
 */
function getOrCreateInstance(userId, accountId) {
    if (!accountId) throw new Error('AccountId is required to get/create instance');
    const key = getInstanceKey(userId, accountId);
    if (!instances.has(key)) {
        instances.set(key, {
            sock: null,
            qrCode: null,
            connectionStatus: 'disconnected',
            contacts: [],
            groups: [],
            retryCount: 0,
            isInitializing: false
        });
    }
    return instances.get(key);
}

/**
 * Initialize WhatsApp connection for a specific account
 */
export async function initializeWhatsApp(userId, accountId, isReconnect = false, force = false) {
    if (!userId || !accountId) {
        return { success: false, error: 'User ID and Account ID are required' };
    }

    const instance = getOrCreateInstance(userId, accountId);

    if (instance.isInitializing) {
        console.log(`[WHATSAPP][User ${userId}][Acc ${accountId}] Initialization already in progress.`);
        return { success: false, error: 'Initialization in progress' };
    }

    if (instance.connectionStatus === 'connected' && !force) {
        return { success: true, status: instance.connectionStatus };
    }

    const accountSessionDir = path.join(sessionBaseDir, `user_${userId}`, `acc_${accountId}`);
    if (!fs.existsSync(accountSessionDir)) {
        fs.mkdirSync(accountSessionDir, { recursive: true });
    }

    if (force) {
        instance.connectionStatus = 'connecting';
        instance.qrCode = null;
        instance.retryCount = 0;
    }

    instance.isInitializing = true;

    try {
        console.log(`[WHATSAPP][User ${userId}][Acc ${accountId}] Initializing...`);

        if (instance.sock) {
            try {
                instance.sock.ev.removeAllListeners('connection.update');
                instance.sock.ev.removeAllListeners('creds.update');
                instance.sock.end(undefined);
            } catch (e) { }
            instance.sock = null;
        }

        if (!isReconnect || force) {
            try {
                if (fs.existsSync(accountSessionDir)) {
                    fs.rmSync(accountSessionDir, { recursive: true, force: true });
                    fs.mkdirSync(accountSessionDir, { recursive: true });
                }
            } catch (e) { }
        }

        const { state, saveCreds } = await useMultiFileAuthState(accountSessionDir);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            logger,
            printQRInTerminal: false,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger)
            },
            browser: ['MeliFlow', 'Chrome', '1.0.0'],
            connectTimeoutMs: 60000,
        });

        instance.sock = sock;

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                instance.qrCode = qr;
                instance.connectionStatus = 'qr_ready';
            }

            if (connection === 'close') {
                const isLoggedOut = (lastDisconnect?.error instanceof Boom)
                    ? lastDisconnect.error.output.statusCode === DisconnectReason.loggedOut
                    : false;

                const shouldReconnect = !isLoggedOut && instance.retryCount < MAX_RETRIES;
                instance.connectionStatus = 'disconnected';
                instance.qrCode = null;

                if (shouldReconnect) {
                    instance.retryCount++;
                    instance.connectionStatus = 'connecting';
                    setTimeout(() => {
                        instance.isInitializing = false;
                        initializeWhatsApp(userId, accountId, true);
                    }, 5000);
                } else {
                    instance.retryCount = 0;
                    instance.isInitializing = false;
                    if (isLoggedOut) {
                        await disconnectWhatsApp(userId, accountId);
                    }
                }
            } else if (connection === 'open') {
                instance.connectionStatus = 'connected';
                instance.qrCode = null;
                instance.retryCount = 0;
                instance.isInitializing = false;
                await loadContactsAndGroups(userId, accountId);
                analytics.logEvent('whatsapp_connected', { userId, accountId }, userId);
            } else if (connection === 'connecting') {
                instance.connectionStatus = 'connecting';
            }
        });

        return { success: true, status: instance.connectionStatus };
    } catch (error) {
        instance.connectionStatus = 'disconnected';
        instance.isInitializing = false;
        console.error(`[WHATSAPP][User ${userId}][Acc ${accountId}] Init error:`, error);
        return { success: false, error: error.message };
    }
}

async function loadContactsAndGroups(userId, accountId) {
    const instance = getOrCreateInstance(userId, accountId);
    if (!instance || !instance.sock) return;

    try {
        const groupsData = await instance.sock.groupFetchAllParticipating();
        instance.groups = Object.values(groupsData).map(g => ({
            id: g.id,
            name: g.subject,
            participants: g.participants.length
        }));
    } catch (error) {
        console.error('[WHATSAPP] Error loading groups:', error);
    }
}

export function getQRCode(userId, accountId) {
    const instance = getOrCreateInstance(userId, accountId);
    return instance?.qrCode;
}

export function getConnectionStatus(userId, accountId) {
    const instance = getOrCreateInstance(userId, accountId);
    return {
        status: instance?.connectionStatus || 'disconnected',
        hasQR: !!instance?.qrCode,
        groupsCount: instance?.groups.length || 0,
        isInitializing: !!instance?.isInitializing
    };
}

export function getGroups(userId, accountId) {
    const instance = getOrCreateInstance(userId, accountId);
    return instance?.groups || [];
}

export async function sendMessage(userId, accountId, to, message) {
    const instance = getOrCreateInstance(userId, accountId);
    if (!instance?.sock || instance.connectionStatus !== 'connected') throw new Error('WhatsApp not connected');
    const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
    await instance.sock.sendMessage(jid, { text: message });
    return { success: true };
}

export async function sendImage(userId, accountId, to, imageUrl, caption) {
    const instance = getOrCreateInstance(userId, accountId);
    if (!instance?.sock || instance.connectionStatus !== 'connected') throw new Error('WhatsApp not connected');
    const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
    await instance.sock.sendMessage(jid, { image: { url: imageUrl }, caption });
    return { success: true };
}

export async function sendVideo(userId, accountId, to, videoUrl, caption) {
    const instance = getOrCreateInstance(userId, accountId);
    if (!instance?.sock || instance.connectionStatus !== 'connected') throw new Error('WhatsApp not connected');
    const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
    await instance.sock.sendMessage(jid, { video: { url: videoUrl }, caption });
    return { success: true };
}

export async function sendMentionAll(userId, accountId, to, message) {
    const instance = getOrCreateInstance(userId, accountId);
    if (!instance?.sock || instance.connectionStatus !== 'connected') throw new Error('WhatsApp not connected');
    const groupMetadata = await instance.sock.groupMetadata(to);
    const mentions = groupMetadata.participants.map(p => p.id);
    await instance.sock.sendMessage(to, { text: message, mentions });
    return { success: true };
}

export async function sendPresenceUpdate(userId, accountId, to, type = 'composing') {
    const instance = getOrCreateInstance(userId, accountId);
    if (!instance?.sock || instance.connectionStatus !== 'connected') return;
    await instance.sock.sendPresenceUpdate(type, to);
}

export async function postToStatus(userId, accountId, message, mediaUrl = null, mediaType = 'text') {
    const instance = getOrCreateInstance(userId, accountId);
    if (!instance?.sock || instance.connectionStatus !== 'connected') throw new Error('WhatsApp not connected');
    const statusJid = 'status@broadcast';
    if (mediaType === 'image' && mediaUrl) {
        await instance.sock.sendMessage(statusJid, { image: { url: mediaUrl }, caption: message });
    } else if (mediaType === 'video' && mediaUrl) {
        await instance.sock.sendMessage(statusJid, { video: { url: mediaUrl }, caption: message });
    } else {
        await instance.sock.sendMessage(statusJid, { text: message });
    }
    return { success: true };
}

export async function sendProductMessage(userId, accountId, to, product, template, mediaType = 'auto', options = {}) {
    const instance = getOrCreateInstance(userId, accountId);
    if (!instance?.sock || instance.connectionStatus !== 'connected') throw new Error('WhatsApp not connected');

    const price = product.price || 0;
    const fakeOriginalPrice = price * 1.5;
    const message = template
        .replace(/{nome_produto}/g, product.productName || product.name || '')
        .replace(/{preco_original}/g, fakeOriginalPrice.toFixed(2))
        .replace(/{preco_com_desconto}/g, price.toFixed(2))
        .replace(/{link}/g, product.affiliateLink || product.link || '');

    if (options.simulateTyping) {
        await sendPresenceUpdate(userId, accountId, to, 'composing');
        await new Promise(r => setTimeout(r, 2000));
    }

    let mentions = [];
    if (options.mentionAll && to.includes('@g.us')) {
        try {
            const metadata = await instance.sock.groupMetadata(to);
            mentions = metadata.participants.map(p => p.id);
        } catch (e) { }
    }

    const hasImage = product.imagePath || product.imageUrl;
    const hasVideo = product.videoUrl;

    if (mediaType === 'video' && hasVideo) {
        await instance.sock.sendMessage(to, { video: { url: product.videoUrl }, caption: message, mentions });
    } else if (hasImage) {
        await instance.sock.sendMessage(to, { image: { url: product.imagePath || product.imageUrl }, caption: message, mentions });
    } else {
        await instance.sock.sendMessage(to, { text: message, mentions });
    }

    if (options.postToStatus) {
        const mediaUrl = (mediaType === 'video' && hasVideo) ? product.videoUrl : (hasImage ? (product.imagePath || product.imageUrl) : null);
        const type = (mediaType === 'video' && hasVideo) ? 'video' : (hasImage ? 'image' : 'text');
        await postToStatus(userId, accountId, message, mediaUrl, type);
    }

    return { success: true };
}

export async function disconnectWhatsApp(userId, accountId) {
    const key = getInstanceKey(userId, accountId);
    const instance = instances.get(key);
    if (instance?.sock) {
        try { await instance.sock.logout(); } catch (e) { }
        instance.sock = null;
    }
    instances.delete(key);
    const sessionDir = path.join(sessionBaseDir, `user_${userId}`, `acc_${accountId}`);
    if (fs.existsSync(sessionDir)) {
        try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch (e) { }
    }
    return { success: true };
}

export default {
    initializeWhatsApp,
    getQRCode,
    getConnectionStatus,
    getGroups,
    sendMessage,
    sendImage,
    sendProductMessage,
    sendVideo,
    sendPresenceUpdate,
    postToStatus,
    sendMentionAll,
    disconnectWhatsApp
};
