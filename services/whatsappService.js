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
import * as db from './database.js';

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
                const sessionExists = fs.existsSync(accountSessionDir) && fs.readdirSync(accountSessionDir).length > 0;
                
                // Só deletamos se for FORCE ou se explicitamente pediram um novo login E não existe sessão
                // Se isReconnect for false mas a sessão existir, vamos tentar usá-la primeiro (comportamento de 'Connect' em conta existente)
                if (force || (!isReconnect && !sessionExists)) {
                    if (fs.existsSync(accountSessionDir)) {
                        console.log(`[WHATSAPP] Limpando sessão para novo login: ${accountSessionDir}`);
                        fs.rmSync(accountSessionDir, { recursive: true, force: true });
                        fs.mkdirSync(accountSessionDir, { recursive: true });
                    }
                }
            } catch (e) { 
                console.error(`[WHATSAPP] Erro ao preparar diretório de sessão:`, e.message);
            }
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
            browser: ['FluxoInteligente', 'Chrome', '1.0.0'],
            connectTimeoutMs: 60000,
        });

        instance.sock = sock;

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            // Safe logging of the update
            const errorMsg = lastDisconnect?.error?.message || 
                            (lastDisconnect?.error?.output?.payload?.message) || 
                            'None';

            console.log(`[WHATSAPP] Update for account ${accountId}:`, {
                connection: connection || 'STATE_UNCHANGED',
                hasQR: !!qr,
                hasError: !!lastDisconnect,
                error: errorMsg
            });

            if (qr) {
                console.log(`[WHATSAPP] New QR Code generated for account ${accountId}`);
                instance.qrCode = qr;
                instance.connectionStatus = 'qr_ready';
                instance.isInitializing = false;
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode || 500;
                const isLoggedOut = statusCode === DisconnectReason.loggedOut;
                const shouldReconnect = !isLoggedOut && statusCode !== 401;
                
                console.log(`[WHATSAPP] Connection CLOSED for account ${accountId}. Reason: ${statusCode}. Reconnecting: ${shouldReconnect}`);
                
                instance.connectionStatus = 'disconnected';
                instance.qrCode = null;
                instance.isInitializing = false;

                if (shouldReconnect) {
                    const delay = Math.min(1000 * Math.pow(2, instance.retryCount || 0), 30000);
                    instance.retryCount = (instance.retryCount || 0) + 1;
                    
                    console.log(`[WHATSAPP] Retrying connection for account ${accountId} in ${delay/1000}s (Attempt ${instance.retryCount}/5)...`);
                    setTimeout(() => initializeWhatsApp(userId, accountId, true), delay);
                } else {
                    console.log(`[WHATSAPP] Session invalid or logged out (401) for account ${accountId}. Clearing session...`);
                    await db.updateWhatsAppAccountStatus(accountId, userId, 'disconnected').catch(() => {});
                    
                    // Crucial: Deletar a pasta da sessão para permitir novo login
                    const accountSessionDir = path.join(sessionBaseDir, `user_${userId}`, `acc_${accountId}`);
                    if (fs.existsSync(accountSessionDir)) {
                        try {
                            fs.rmSync(accountSessionDir, { recursive: true, force: true });
                            console.log(`[WHATSAPP] Session directory cleared for account ${accountId}`);
                        } catch (e) {
                            console.error(`[WHATSAPP] Error clearing session directory:`, e.message);
                        }
                    }
                    
                    instance.retryCount = 0;
                    // Forçar a geração de um novo QR Code na próxima solicitação
                    instance.sock = null;
                }
            } else if (connection === 'open') {
                console.log(`[WHATSAPP] Connection successfully OPENED for account ${accountId}!`);
                instance.connectionStatus = 'connected';
                instance.qrCode = null;
                instance.isInitializing = false;
                instance.retryCount = 0;
                
                const phone = sock.user?.id?.split(':')[0] || sock.user?.id?.split('@')[0];
                await db.updateWhatsAppAccountStatus(accountId, userId, 'connected', phone).catch(() => {});

                loadContactsAndGroups(userId, accountId);
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

async function loadContactsAndGroups(userId, accountId, retries = 3) {
    const instance = getOrCreateInstance(userId, accountId);
    if (!instance || !instance.sock) return;

    try {
        console.log(`[WHATSAPP] Buscando grupos para usuário ${userId}, conta ${accountId} (Tentativa ${4 - retries}/3)...`);
        
        // Pequeno delay para garantir que o socket sincronizou as conversas
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const groupsData = await instance.sock.groupFetchAllParticipating();
        const groups = Object.values(groupsData).map(g => ({
            id: g.id,
            name: g.subject,
            participants: g.participants?.length || 0
        }));
        
        if (groups.length === 0 && retries > 0) {
            console.log(`[WHATSAPP] Nenhum grupo retornado para conta ${accountId}. Tentando novamente em breve...`);
            setTimeout(() => loadContactsAndGroups(userId, accountId, retries - 1), 5000);
            return;
        }

        instance.groups = groups;
        console.log(`[WHATSAPP] ${groups.length} grupos encontrados para conta ${accountId}. Sincronizando com banco de dados...`);

        // Sincroniza cada grupo com o banco de dados
        for (const group of groups) {
            try {
                await db.addWhatsAppGroup(group.id, group.name, userId, accountId);
            } catch (err) {
                console.error(`[WHATSAPP] Erro ao sincronizar grupo ${group.id}:`, err.message);
            }
        }
        
        console.log(`[WHATSAPP] Sincronização concluída para conta ${accountId}.`);
    } catch (error) {
        console.error(`[WHATSAPP] Error loading groups for account ${accountId}:`, error.message);
        if (retries > 0) {
            setTimeout(() => loadContactsAndGroups(userId, accountId, retries - 1), 5000);
        }
    }
}

export async function refreshGroups(userId, accountId) {
    await loadContactsAndGroups(userId, accountId);
    return getGroups(userId, accountId);
}

export function getQRCode(userId, accountId) {
    const instance = getOrCreateInstance(userId, accountId);
    return instance?.qrCode;
}

export function getConnectionStatus(userId, accountId) {
    const key = getInstanceKey(userId, accountId);
    let instance = instances.get(key);
    
    // Se não existe instância em memória, mas existe pasta de sessão, 
    // vamos tentar inicializar silenciosamente ao pedirem o status
    if (!instance || (instance.connectionStatus === 'disconnected' && !instance.isInitializing)) {
        const sessionPath = path.join(sessionBaseDir, `user_${userId}`, `acc_${accountId}`);
        const sessionExists = fs.existsSync(sessionPath) && fs.readdirSync(sessionPath).length > 0;
        
        if (sessionExists) {
            console.log(`[WHATSAPP] Status solicitado para conta ${accountId} com sessão existente. Auto-inicializando...`);
            // Dispara inicialização em background
            initializeWhatsApp(userId, accountId, true).catch(() => {});
            
            // Retorna um estado temporário de connecting
            return {
                status: 'connecting',
                hasQR: false,
                groupsCount: 0,
                isInitializing: true
            };
        }
    }

    if (!instance) instance = getOrCreateInstance(userId, accountId);
    
    let currentStatus = instance.connectionStatus;
    
    if (instance.isInitializing && currentStatus === 'disconnected') {
        currentStatus = 'connecting';
    }

    return {
        status: currentStatus,
        hasQR: !!instance.qrCode,
        groupsCount: instance.groups.length || 0,
        isInitializing: !!instance.isInitializing
    };
}

export function getGroups(userId, accountId) {
    const instance = getOrCreateInstance(userId, accountId);
    return instance?.groups || [];
}

export function getContacts(userId, accountId) {
    const instance = getOrCreateInstance(userId, accountId);
    return instance?.contacts || [];
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
        .replace(/{preco_com_desconto}|{price}|{valor}/g, price.toFixed(2))
        .replace(/{link}|{product_link}|{link_shopee}/g, product.affiliateLink || product.link || '');

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

    // Prioridade absoluta: Vídeo -> Imagem -> Texto
    if (hasVideo && mediaType !== 'image') {
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

export async function autoInitializeAll() {
    try {
        console.log('[WHATSAPP] Iniciando auto-reconexão de contas ativas...');
        
        // Busca todas as contas. Vamos tentar inicializar as que estão 'connected' 
        // e também as que estão 'disconnected' mas que podem ter uma sessão válida.
        const res = await db.query('SELECT id, user_id, status FROM whatsapp_accounts');
        const accounts = res.rows;
        
        const accountsToReconnect = accounts.filter(acc => acc.status === 'connected');
        console.log(`[WHATSAPP] Encontradas ${accountsToReconnect.length} contas marcadas como conectadas no banco.`);
        
        // Se não houver nenhuma 'connected', podemos tentar as 'disconnected' que foram adicionadas recentemente
        // ou simplesmente todas as contas para garantir que nada ficou pra trás após um restart forçado.
        const listToProcess = accountsToReconnect.length > 0 ? accountsToReconnect : accounts;

        for (const acc of listToProcess) {
            // Verifica se a pasta da sessão existe para não tentar inicializar contas sem sessão
            const sessionPath = path.join(sessionBaseDir, `user_${acc.user_id}`, `acc_${acc.id}`);
            if (fs.existsSync(sessionPath)) {
                setTimeout(() => {
                    console.log(`[WHATSAPP] Tentando auto-inicializar conta ${acc.id} (Status DB: ${acc.status})...`);
                    initializeWhatsApp(acc.user_id, acc.id, true).catch(err => {
                        console.error(`[WHATSAPP] Falha na auto-inicialização da conta ${acc.id}:`, err.message);
                    });
                }, Math.random() * 5000);
            }
        }
    } catch (error) {
        console.error('[WHATSAPP] Erro no autoInitializeAll:', error.message);
    }
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
    disconnectWhatsApp,
    getContacts,
    refreshGroups,
    autoInitializeAll
};
