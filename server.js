
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { testTelegramConnection, postToTelegramGroup, getChatInfo, getBotGroups } from './services/telegramService.js';
import { prepareProductsForPosting } from './services/automationService.js';
import * as db from './services/database.js';
import * as whatsapp from './services/whatsappService.js';
import * as facebook from './services/facebookService.js';
import * as scheduler from './services/schedulerService.js';
import * as instagram from './services/instagramService.js';
import * as instagramGraph from './services/instagramGraphService.js';
import * as gemini from './services/geminiService.js';
import * as pinterest from './services/pinterestService.js';
import * as pinterestScraper from './services/pinterestScraper.js';
import * as shopeeScraper from './services/shopeeScraper.js';
import * as auth from './services/authService.js';

// Helper para delay aleatório (evitar banimento)
const randomDelay = (min, max) => {
    const delay = Math.floor(Math.random() * (max - min + 1) + min);
    console.log(`[DELAY] Aguardando ${delay / 1000}s...`);
    return new Promise(resolve => setTimeout(resolve, delay));
};

const app = express();
const PORT = 3001;

// Configuração do Middleware
app.use(cors());
// Aumenta o limite para aceitar payloads grandes (ex: imagens em base64 ou listas grandes de produtos)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Configuração do Multer para upload de vídeos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = './uploads/instagram';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'video-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /mp4|mov|avi/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (extname && mimetype) {
            return cb(null, true);
        } else {
            cb(new Error('Apenas vídeos MP4, MOV ou AVI são permitidos!'));
        }
    }
});

// URLs Base
const ML_API_BASE = 'https://api.mercadolibre.com';
const SHOPEE_SELLER_API_BASE = 'https://partner.shopeemobile.com/api/v2';
const SHOPEE_AFFILIATE_API_URL = 'https://open-api.affiliate.shopee.com.br/graphql';

// Rota de Saúde (Health Check)
app.get('/', (req, res) => {
    res.send('✅ MeliFlow Backend está rodando corretamente!');
});

// --- 📦 MERCADO LIVRE PROXY ---

app.post('/api/ml/proxy', async (req, res) => {
    const { endpoint, method, data, token } = req.body;

    console.log(`[ML] ${method} ${endpoint}`);

    try {
        const response = await axios({
            url: `${ML_API_BASE}${endpoint}`,
            method: method || 'GET',
            data: data,
            headers: token ? { 'Authorization': `Bearer ${token.trim()}` } : {}
        });
        res.json(response.data);
    } catch (error) {
        console.error(`[ML ERROR] ${endpoint}:`, error.response?.data || error.message);
        res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
});

// --- 🛍️ SHOPEE SELLER PROXY ---

app.post('/api/shopee/seller/proxy', async (req, res) => {
    const { path, body, partnerId, partnerKey, shopId, accessToken } = req.body;

    const timestamp = Math.floor(Date.now() / 1000);

    // Limpeza de inputs
    const pKey = partnerKey ? partnerKey.trim() : '';
    const aToken = accessToken ? accessToken.trim() : '';

    // Lógica de Assinatura V2 Shopee Seller (HMAC-SHA256)
    // Base: partner_id + path + timestamp + access_token + shop_id

    let baseString = `${partnerId}${path}${timestamp}`;
    if (aToken) baseString += aToken;
    if (shopId) baseString += shopId;

    const sign = crypto.createHmac('sha256', pKey).update(baseString).digest('hex');

    // Constrói URL com Query Params obrigatórios
    let url = `${SHOPEE_SELLER_API_BASE}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}`;
    if (aToken) url += `&access_token=${aToken}`;
    if (shopId) url += `&shop_id=${shopId}`;

    console.log(`[SHOPEE SELLER] POST ${path}`);

    try {
        const response = await axios.post(url, body, {
            headers: { 'Content-Type': 'application/json' }
        });
        res.json(response.data);
    } catch (error) {
        console.error(`[SHOPEE SELLER ERROR] ${path}:`, error.response?.data || error.message);
        res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
});

app.post('/api/shopee/seller/auth-link', (req, res) => {
    const { partnerId, partnerKey } = req.body;
    const path = '/api/v2/shop/auth_partner';
    const timestamp = Math.floor(Date.now() / 1000);

    const pKey = partnerKey ? partnerKey.trim() : '';

    // Assinatura para Link de Auth
    const baseString = `${partnerId}${path}${timestamp}`;
    const sign = crypto.createHmac('sha256', pKey).update(baseString).digest('hex');

    // URL de redirecionamento (pode ajustar para sua URL real)
    const redirect = 'http://localhost:5173/';

    const url = `https://partner.shopeemobile.com${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}&redirect=${encodeURIComponent(redirect)}`;

    console.log(`[SHOPEE AUTH] Gerando link para Partner ${partnerId}`);
    res.json({ url });
});

// --- 💰 SHOPEE AFFILIATE PROXY ---

app.post('/api/shopee/affiliate/proxy', async (req, res) => {
    const { query, appId, password } = req.body;

    // Use timestamp from request if provided (for debugging consistency) or generate new
    // But for security, usually we generate server-side. 
    // Let's stick to server-side but log it.
    const timestamp = Math.floor(Date.now() / 1000);

    // IMPORTANTE: Sanitização de credenciais para evitar erro 10020 Invalid Credential
    const cleanAppId = appId ? String(appId).trim() : '';
    const cleanPassword = password ? String(password).trim() : '';

    // CRÍTICO: Para a assinatura funcionar, o payload usado no hash DEVE ser idêntico
    // ao payload enviado no corpo da requisição.
    const payloadObj = { query };
    // Remove quebras de linha que podem causar divergência na assinatura
    const payloadString = JSON.stringify(payloadObj).replace(/\n/g, '');

    // Assinatura Shopee Affiliate: SHA256(appId + timestamp + payload + secret)
    const signatureBase = cleanAppId + timestamp + payloadString + cleanPassword;
    const signature = crypto.createHash('sha256').update(signatureBase).digest('hex');

    console.log(`[SHOPEE AFFILIATE] Request:`);
    console.log(`- AppID: '${cleanAppId}'`);
    console.log(`- Timestamp: ${timestamp}`);
    console.log(`- Payload Length: ${payloadString.length}`);
    console.log(`- Signature Base (partial): ${cleanAppId}${timestamp}{...}${cleanPassword.slice(-3)}`);
    console.log(`- Generated Signature: ${signature}`);

    try {
        const response = await axios.post(SHOPEE_AFFILIATE_API_URL, payloadString, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `SHA256 Credential=${cleanAppId},Timestamp=${timestamp},Signature=${signature}`
            }
        });
        res.json(response.data);
    } catch (error) {
        console.error("[SHOPEE AFFILIATE ERROR]:", error.response?.data || error.message);
        // Log more details on error
        if (error.response?.data) {
            console.error("Shopee Response Data:", JSON.stringify(error.response.data, null, 2));
        }
        res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
});

// --- 📱 TELEGRAM AUTOMATION ROUTES ---

// Testar conexão do bot
app.post('/api/telegram/test', async (req, res) => {
    const { botToken } = req.body;
    const result = await testTelegramConnection(botToken);
    res.json(result);
});

// Obter informações de um chat/grupo
app.post('/api/telegram/chat-info', async (req, res) => {
    const { chatId, botToken } = req.body;
    try {
        const chatInfo = await getChatInfo(chatId, botToken);
        res.json({ success: true, chatInfo });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Postar produtos agora (automação manual)
app.post('/api/telegram/post-now', async (req, res) => {
    const { botToken, groups, productCount, shopeeSettings, filters, mediaType, messageTemplate, enableRotation } = req.body;

    try {
        console.log('[POST-NOW] Iniciando automação...');
        console.log('[POST-NOW] Tipo de Mídia:', mediaType);
        console.log('[POST-NOW] Rotação de produtos:', enableRotation ? 'ATIVA' : 'DESATIVADA');

        // 1. Buscar produtos e gerar links
        const products = await prepareProductsForPosting(shopeeSettings, productCount, filters, enableRotation);

        // Filtragem baseada no tipo de mídia (opcional, mas bom para "Apenas Vídeo")
        let productsToPost = products;
        if (mediaType === 'video') {
            // Se o usuário quer APENAS vídeo, poderíamos filtrar aqui, mas vamos deixar o telegramService decidir o fallback
            // Ou podemos priorizar produtos com vídeo
            productsToPost = products.sort((a, b) => (b.videoUrl ? 1 : 0) - (a.videoUrl ? 1 : 0));
        }

        console.log(`[POST-NOW] ${productsToPost.length} produtos preparados`);

        // 2. Enviar para cada grupo
        const results = {
            success: 0,
            failed: 0,
            skipped: 0,
            errors: []
        };

        for (const group of groups) {
            for (const product of productsToPost) {
                try {
                    const result = await postToTelegramGroup(group.id, product, botToken, messageTemplate, mediaType);
                    if (result.success) {
                        results.success++;
                        const type = result.type || 'unknown';
                        results.sentTypes = results.sentTypes || { video: 0, image: 0, text: 0, unknown: 0 };
                        results.sentTypes[type] = (results.sentTypes[type] || 0) + 1;

                        // Log to database
                        try {
                            db.logSentProduct({
                                productId: product.id || product.productId,
                                productName: product.productName || product.name,
                                price: product.price,
                                commission: product.commission,
                                groupId: group.id,
                                groupName: group.name,
                                mediaType: type,
                                category: product.category || null
                            });

                            db.logEvent('send', {
                                productId: product.id || product.productId,
                                groupId: group.id,
                                success: true
                            });
                        } catch (dbError) {
                            console.error('[DB] Error logging product:', dbError);
                        }
                    } else {
                        if (result.error && result.error.includes('(Ignorado)')) {
                            results.skipped++;
                            console.log(`[POST-NOW] Ignorado no grupo ${group.name}: ${result.error}`);

                            // Log skipped event
                            try {
                                db.logEvent('skip', {
                                    productId: product.id || product.productId,
                                    groupId: group.id,
                                    success: false,
                                    errorMessage: result.error
                                });
                            } catch (dbError) {
                                console.error('[DB] Error logging skip:', dbError);
                            }
                        } else {
                            throw new Error(result.error || 'Erro desconhecido');
                        }
                    }

                    // Delay entre postagens (Telegram: 10s a 20s)
                    await randomDelay(10000, 20000);
                } catch (error) {
                    results.failed++;
                    results.errors.push(`${group.name}: ${error.message}`);
                    console.error(`[POST-NOW] Erro no grupo ${group.name}:`, error);

                    // Log failed event
                    try {
                        db.logEvent('send', {
                            productId: product.id || product.productId,
                            groupId: group.id,
                            success: false,
                            errorMessage: error.message
                        });
                    } catch (dbError) {
                        console.error('[DB] Error logging failure:', dbError);
                    }
                }
            }
        }

        console.log('[POST-NOW] Concluído:', results);
        res.json({
            success: true,
            message: `${results.success} enviados, ${results.skipped} ignorados, ${results.failed} falhas`,
            details: results
        });

    } catch (error) {
        console.error('[POST-NOW] Erro:', error);
        res.json({ success: false, error: error.message });
    }
});

// Schedule Telegram automation
app.post('/api/telegram/schedule', (req, res) => {
    try {
        const config = req.body;
        console.log('[TELEGRAM SCHEDULE] Creating schedule:', config);

        // Save to database using scheduler service
        const result = scheduler.createSchedule('telegram', config);

        console.log('[TELEGRAM SCHEDULE] Schedule created:', result);
        res.json(result);
    } catch (error) {
        console.error('[TELEGRAM SCHEDULE] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get saved Telegram groups
app.get('/api/telegram/groups', (req, res) => {
    try {
        const groups = db.getTelegramGroups();
        res.json(groups);
    } catch (error) {
        console.error('[TELEGRAM] Error getting groups:', error);
        res.status(500).json({ error: error.message });
    }
});

// Status da automação (placeholder)
app.get('/api/telegram/status', (req, res) => {
    res.json({ active: false });
});

// --- 📊 ANALYTICS ENDPOINTS ---

// Get dashboard statistics
app.get('/api/analytics/dashboard', (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;
        const stats = db.getDashboardStats(days);
        const sendsOverTime = db.getSendsOverTime(days);

        res.json({
            success: true,
            stats,
            sendsOverTime
        });
    } catch (error) {
        console.error('[ANALYTICS] Error getting dashboard:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get top products
app.get('/api/analytics/top-products', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const days = parseInt(req.query.days) || 30;
        const topProducts = db.getTopProducts(limit, days);

        res.json({
            success: true,
            products: topProducts
        });
    } catch (error) {
        console.error('[ANALYTICS] Error getting top products:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get group performance
app.get('/api/analytics/group-performance', (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const groupStats = db.getGroupPerformance(days);

        res.json({
            success: true,
            groups: groupStats
        });
    } catch (error) {
        console.error('[ANALYTICS] Error getting group performance:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get products sent today (for rotation check)
app.get('/api/products/sent-today', (req, res) => {
    try {
        const productIds = db.getProductsSentInLastHours(24);

        res.json({
            success: true,
            productIds
        });
    } catch (error) {
        console.error('[PRODUCTS] Error getting sent products:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- 📱 WHATSAPP ENDPOINTS ---

// Initialize WhatsApp connection
app.post('/api/whatsapp/initialize', async (req, res) => {
    try {
        const result = await whatsapp.initializeWhatsApp();
        res.json(result);
    } catch (error) {
        console.error('[WHATSAPP API] Initialize error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get QR code for scanning
app.get('/api/whatsapp/qr', (req, res) => {
    try {
        const qr = whatsapp.getQRCode();
        res.json({ success: true, qr });
    } catch (error) {
        console.error('[WHATSAPP API] QR error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get connection status
app.get('/api/whatsapp/status', (req, res) => {
    try {
        const status = whatsapp.getConnectionStatus();
        res.json({ success: true, ...status });
    } catch (error) {
        console.error('[WHATSAPP API] Status error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get contacts
app.get('/api/whatsapp/contacts', (req, res) => {
    try {
        const contacts = whatsapp.getContacts();
        res.json({ success: true, contacts });
    } catch (error) {
        console.error('[WHATSAPP API] Contacts error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get groups
app.get('/api/whatsapp/groups', (req, res) => {
    try {
        const groups = whatsapp.getGroups();
        res.json({ success: true, groups });
    } catch (error) {
        console.error('[WHATSAPP API] Groups error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Send single message
app.post('/api/whatsapp/send', async (req, res) => {
    try {
        const { to, message, imageUrl } = req.body;

        let result;
        if (imageUrl) {
            result = await whatsapp.sendImage(to, imageUrl, message);
        } else {
            result = await whatsapp.sendMessage(to, message);
        }

        res.json(result);
    } catch (error) {
        console.error('[WHATSAPP API] Send error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Post products now (bulk send)
app.post('/api/whatsapp/post-now', async (req, res) => {
    const { recipients, productCount, shopeeSettings, filters, mediaType, messageTemplate, enableRotation, options, categoryType } = req.body;

    try {
        console.log('[WHATSAPP POST-NOW] Iniciando automação...');
        console.log('[WHATSAPP POST-NOW] Tipo de Mídia:', mediaType);
        console.log('[WHATSAPP POST-NOW] Rotação:', enableRotation ? 'ATIVA' : 'DESATIVADA');

        // Get products
        const products = await prepareProductsForPosting(shopeeSettings, productCount, filters, enableRotation, categoryType);
        console.log(`[WHATSAPP POST-NOW] ${products.length} produtos preparados`);

        const results = {
            success: 0,
            failed: 0,
            skipped: 0,
            errors: [],
            sentTypes: { image: 0, text: 0 }
        };

        // Send to each recipient
        for (const recipient of recipients) {
            for (const product of products) {
                try {
                    const result = await whatsapp.sendProductMessage(
                        recipient.id,
                        product,
                        messageTemplate,
                        mediaType,
                        options || {}
                    );

                    if (result.success) {
                        results.success++;
                        const type = product.imagePath || product.imageUrl ? 'image' : 'text';
                        results.sentTypes[type]++;

                        // Log to database
                        try {
                            db.logSentProduct({
                                productId: product.id || product.productId,
                                productName: product.productName || product.name,
                                price: product.price,
                                commission: product.commission,
                                groupId: recipient.id,
                                groupName: recipient.name,
                                mediaType: type,
                                category: product.category || null
                            });

                            db.logEvent('whatsapp_send', {
                                productId: product.id || product.productId,
                                groupId: recipient.id,
                                success: true
                            });
                        } catch (dbError) {
                            console.error('[DB] Error logging:', dbError);
                        }
                    } else {
                        throw new Error(result.error || 'Erro desconhecido');
                    }

                    // Rate limiting: 30s a 60s (WhatsApp é muito sensível)
                    await randomDelay(30000, 60000);
                } catch (error) {
                    results.failed++;
                    results.errors.push(`${recipient.name}: ${error.message}`);
                    console.error(`[WHATSAPP POST-NOW] Erro para ${recipient.name}:`, error);

                    // Log failure
                    try {
                        db.logEvent('whatsapp_send', {
                            productId: product.id || product.productId,
                            groupId: recipient.id,
                            success: false,
                            errorMessage: error.message
                        });
                    } catch (dbError) {
                        console.error('[DB] Error logging failure:', dbError);
                    }
                }
            }
        }

        console.log('[WHATSAPP POST-NOW] Concluído:', results);
        res.json({
            success: true,
            message: `${results.success} enviados, ${results.failed} falhas`,
            details: results
        });
    } catch (error) {
        console.error('[WHATSAPP POST-NOW] Erro:', error);
        res.json({ success: false, error: error.message });
    }
});

// Send Video
app.post('/api/whatsapp/send-video', async (req, res) => {
    try {
        const { to, videoUrl, caption } = req.body;
        const result = await whatsapp.sendVideo(to, videoUrl, caption);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Send Audio
app.post('/api/whatsapp/send-audio', async (req, res) => {
    try {
        const { to, audioUrl } = req.body;
        const result = await whatsapp.sendAudio(to, audioUrl);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Post to Status
app.post('/api/whatsapp/post-status', async (req, res) => {
    try {
        const { message, mediaUrl, mediaType } = req.body;
        const result = await whatsapp.postToStatus(message, mediaUrl, mediaType);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Join Group
app.post('/api/whatsapp/join-group', async (req, res) => {
    try {
        const { inviteLink } = req.body;
        const result = await whatsapp.joinGroup(inviteLink);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Disconnect WhatsApp
app.post('/api/whatsapp/disconnect', async (req, res) => {
    try {
        const result = await whatsapp.disconnectWhatsApp();
        res.json(result);
    } catch (error) {
        console.error('[WHATSAPP API] Disconnect error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- 📘 FACEBOOK ENDPOINTS ---

// Add Facebook page
app.post('/api/facebook/add-page', async (req, res) => {
    try {
        const { pageId, pageName, accessToken } = req.body;

        // Verify token first
        const verification = await facebook.verifyPageToken(pageId, accessToken);
        if (!verification.success) {
            return res.json(verification);
        }

        const result = facebook.addPage({
            pageId,
            pageName: pageName || verification.page.name,
            accessToken
        });

        res.json(result);
    } catch (error) {
        console.error('[FACEBOOK API] Add page error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get all pages
app.get('/api/facebook/pages', (req, res) => {
    try {
        const pages = facebook.getPages();
        res.json({ success: true, pages });
    } catch (error) {
        console.error('[FACEBOOK API] Get pages error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Remove page
app.delete('/api/facebook/page/:pageId', (req, res) => {
    try {
        const result = facebook.removePage(req.params.pageId);
        res.json(result);
    } catch (error) {
        console.error('[FACEBOOK API] Remove page error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Toggle page
app.post('/api/facebook/toggle-page/:pageId', (req, res) => {
    try {
        const result = facebook.togglePage(req.params.pageId);
        res.json(result);
    } catch (error) {
        console.error('[FACEBOOK API] Toggle page error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Post products now (bulk send)
app.post('/api/facebook/post-now', async (req, res) => {
    const { pages: selectedPages, productCount, shopeeSettings, filters, mediaType, messageTemplate, enableRotation } = req.body;

    try {
        console.log('[FACEBOOK POST-NOW] Iniciando automação...');
        console.log('[FACEBOOK POST-NOW] Tipo de Mídia:', mediaType);
        console.log('[FACEBOOK POST-NOW] Rotação:', enableRotation ? 'ATIVA' : 'DESATIVADA');

        // Get products
        const products = await prepareProductsForPosting(shopeeSettings, productCount, filters, enableRotation);
        console.log(`[FACEBOOK POST-NOW] ${products.length} produtos preparados`);

        const results = {
            success: 0,
            failed: 0,
            skipped: 0,
            errors: [],
            sentTypes: { image: 0, text: 0 }
        };

        // Send to each page
        for (const page of selectedPages) {
            for (const product of products) {
                try {
                    const result = await facebook.postProduct(
                        page.id,
                        page.accessToken,
                        product,
                        messageTemplate,
                        mediaType
                    );

                    if (result.success) {
                        results.success++;
                        const type = product.imagePath || product.imageUrl ? 'image' : 'text';
                        results.sentTypes[type]++;

                        // Log to database
                        try {
                            db.logSentProduct({
                                productId: product.id || product.productId,
                                productName: product.productName || product.name,
                                price: product.price,
                                commission: product.commission,
                                groupId: page.id,
                                groupName: page.name,
                                mediaType: type,
                                category: product.category || null
                            });

                            db.logEvent('facebook_send', {
                                productId: product.id || product.productId,
                                groupId: page.id,
                                success: true
                            });
                        } catch (dbError) {
                            console.error('[DB] Error logging:', dbError);
                        }
                    } else {
                        throw new Error(result.error || 'Erro desconhecido');
                    }

                    // Rate limiting: 45s a 90s (Facebook)
                    await randomDelay(45000, 90000);
                } catch (error) {
                    results.failed++;
                    results.errors.push(`${page.name}: ${error.message}`);
                    console.error(`[FACEBOOK POST-NOW] Erro para ${page.name}:`, error);

                    // Log failure
                    try {
                        db.logEvent('facebook_send', {
                            productId: product.id || product.productId,
                            groupId: page.id,
                            success: false,
                            errorMessage: error.message
                        });
                    } catch (dbError) {
                        console.error('[DB] Error logging failure:', dbError);
                    }
                }
            }
        }

        console.log('[FACEBOOK POST-NOW] Concluído:', results);
        res.json({
            success: true,
            message: `${results.success} enviados, ${results.failed} falhas`,
            details: results
        });
    } catch (error) {
        console.error('[FACEBOOK POST-NOW] Erro:', error);
        res.json({ success: false, error: error.message });
    }
});



// --- ⏰ SCHEDULER ENDPOINTS ---

// Schedule Facebook Automation
app.post('/api/facebook/schedule', (req, res) => {
    try {
        const config = req.body;
        // Validate config...
        const result = scheduler.createSchedule('facebook', config);
        res.json(result);
    } catch (error) {
        console.error('[SCHEDULER] Error scheduling Facebook:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Schedule WhatsApp Automation
app.post('/api/whatsapp/schedule', (req, res) => {
    try {
        const config = req.body;
        const result = scheduler.createSchedule('whatsapp', config);
        res.json(result);
    } catch (error) {
        console.error('[SCHEDULER] Error scheduling WhatsApp:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get all schedules
app.get('/api/schedules', (req, res) => {
    try {
        const schedules = db.getSchedules();
        res.json({ success: true, schedules });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete schedule
app.delete('/api/schedule/:id', (req, res) => {
    try {
        const result = scheduler.removeSchedule(req.params.id);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Toggle schedule
app.post('/api/schedule/toggle/:id', (req, res) => {
    try {
        const { active } = req.body;
        const result = scheduler.toggleSchedule(req.params.id, active);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- 📸 INSTAGRAM AUTOMATION (Biblioteca Não-Oficial) ---

app.post('/api/instagram/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        console.log(`[INSTAGRAM] Login request for ${username}`);

        const result = await instagram.login(username, password);
        res.json(result);
    } catch (error) {
        console.error('[INSTAGRAM] Login error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/instagram/logout', async (req, res) => {
    try {
        const result = await instagram.logout();
        res.json(result);
    } catch (error) {
        console.error('[INSTAGRAM] Logout error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/instagram/status', (req, res) => {
    try {
        const result = instagram.getStatus();
        res.json(result);
    } catch (error) {
        console.error('[INSTAGRAM] Status error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/instagram/account-info', async (req, res) => {
    try {
        const result = await instagram.getAccountInfo();
        res.json(result);
    } catch (error) {
        console.error('[INSTAGRAM] Account info error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/instagram/post-now', async (req, res) => {
    try {
        const { productCount, shopeeSettings, categoryType, messageTemplate, groupLink, customHashtags } = req.body;

        console.log(`[INSTAGRAM] Post now request - ${productCount} products`);

        // Prepare products
        const products = await prepareProductsForPosting(
            productCount,
            shopeeSettings,
            {},
            categoryType,
            true
        );

        if (!products || products.length === 0) {
            return res.json({ success: false, error: 'Nenhum produto encontrado' });
        }

        let success = 0;
        let failed = 0;

        for (const product of products) {
            try {
                // Random delay between posts (60-120s)
                if (success > 0) {
                    await randomDelay(60000, 120000);
                }

                const result = await instagram.postProduct(
                    product,
                    messageTemplate,
                    groupLink,
                    customHashtags || []
                );

                if (result.success) {
                    success++;
                    console.log(`[INSTAGRAM] ✅ Posted product: ${product.name}`);
                } else {
                    failed++;
                    console.error(`[INSTAGRAM] ❌ Failed to post: ${result.error}`);
                }
            } catch (error) {
                failed++;
                console.error(`[INSTAGRAM] ❌ Error posting product:`, error);
            }
        }

        res.json({
            success: true,
            details: { success, failed, total: products.length }
        });
    } catch (error) {
        console.error('[INSTAGRAM] Post now error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/instagram/schedule', async (req, res) => {
    try {
        const config = req.body;
        console.log('[INSTAGRAM] Creating schedule...');

        const result = await scheduler.createSchedule('instagram', config);
        res.json(result);
    } catch (error) {
        console.error('[INSTAGRAM] Schedule error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- 📸 INSTAGRAM GRAPH API (Oficial) ---

app.post('/api/instagram/graph/configure', (req, res) => {
    try {
        const { accessToken, accountId } = req.body;
        console.log('[INSTAGRAM GRAPH] Configuring API...');

        const result = instagramGraph.configureGraphAPI(accessToken, accountId);
        res.json(result);
    } catch (error) {
        console.error('[INSTAGRAM GRAPH] Configure error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/instagram/graph/status', (req, res) => {
    try {
        const result = instagramGraph.getGraphStatus();
        res.json(result);
    } catch (error) {
        console.error('[INSTAGRAM GRAPH] Status error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/instagram/graph/account-info', async (req, res) => {
    try {
        const result = await instagramGraph.getAccountInfoGraph();
        res.json(result);
    } catch (error) {
        console.error('[INSTAGRAM GRAPH] Account info error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/instagram/graph/post-now', async (req, res) => {
    try {
        const { productCount, shopeeSettings, categoryType, messageTemplate, groupLink, customHashtags } = req.body;

        console.log(`[INSTAGRAM GRAPH] Post now request - ${productCount} products`);

        // Prepare products
        const products = await prepareProductsForPosting(
            productCount,
            shopeeSettings,
            {},
            categoryType,
            true
        );

        if (!products || products.length === 0) {
            return res.json({ success: false, error: 'Nenhum produto encontrado' });
        }

        let success = 0;
        let failed = 0;

        for (const product of products) {
            try {
                // Random delay between posts (60-120s)
                if (success > 0) {
                    await randomDelay(60000, 120000);
                }

                const result = await instagramGraph.postProductGraph(
                    product,
                    messageTemplate,
                    groupLink,
                    customHashtags || []
                );

                if (result.success) {
                    success++;
                    console.log(`[INSTAGRAM GRAPH] ✅ Posted product: ${product.name}`);
                } else {
                    failed++;
                    console.error(`[INSTAGRAM GRAPH] ❌ Failed to post: ${result.error}`);
                }
            } catch (error) {
                failed++;
                console.error(`[INSTAGRAM GRAPH] ❌ Error posting product:`, error);
            }
        }

        res.json({
            success: true,
            details: { success, failed, total: products.length }
        });
    } catch (error) {
        console.error('[INSTAGRAM GRAPH] Post now error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- 📸 INSTAGRAM VIDEO UPLOAD & QUEUE ---

// Upload video to queue
app.post('/api/instagram/upload', upload.single('video'), async (req, res) => {
    try {
        const { caption } = req.body;

        if (!req.file) {
            return res.status(400).json({ success: false, error: 'Nenhum vídeo enviado' });
        }

        console.log(`[INSTAGRAM] Video uploaded: ${req.file.filename}`);

        const result = db.addToInstagramQueue(req.file.path, caption || '');

        res.json({
            success: true,
            id: result.id,
            filename: req.file.filename,
            path: req.file.path
        });
    } catch (error) {
        console.error('[INSTAGRAM] Upload error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get video queue
app.get('/api/instagram/queue', (req, res) => {
    try {
        const { status } = req.query;
        const queue = db.getInstagramQueue(status);
        res.json({ success: true, queue });
    } catch (error) {
        console.error('[INSTAGRAM] Queue error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update video caption
app.put('/api/instagram/queue/:id', (req, res) => {
    try {
        const { caption } = req.body;
        db.updateInstagramCaption(req.params.id, caption);
        res.json({ success: true });
    } catch (error) {
        console.error('[INSTAGRAM] Update error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete video from queue
app.delete('/api/instagram/queue/:id', (req, res) => {
    try {
        // Get video info to delete file
        const queue = db.getInstagramQueue();
        const video = queue.find(v => v.id === parseInt(req.params.id));

        if (video && fs.existsSync(video.video_path)) {
            fs.unlinkSync(video.video_path);
        }

        db.deleteFromInstagramQueue(req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error('[INSTAGRAM] Delete error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Post video from queue (manual trigger)
app.post('/api/instagram/post-from-queue/:id', async (req, res) => {
    try {
        const queue = db.getInstagramQueue();
        const video = queue.find(v => v.id === parseInt(req.params.id));

        if (!video) {
            return res.status(404).json({ success: false, error: 'Vídeo não encontrado' });
        }

        console.log(`[INSTAGRAM] Posting video from queue: ${video.id}`);

        // Check if using Graph API or unofficial
        const { apiMethod } = req.body;

        let result;
        if (apiMethod === 'graph') {
            result = await instagramGraph.postVideoGraph(video.video_path, video.caption);
        } else {
            result = await instagram.postVideo(video.video_path, video.caption);
        }

        if (result.success) {
            db.markInstagramVideoPosted(video.id);

            // Delete video file after posting
            if (fs.existsSync(video.video_path)) {
                fs.unlinkSync(video.video_path);
            }

            res.json({ success: true });
        } else {
            db.markInstagramVideoFailed(video.id, result.error);
            res.json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('[INSTAGRAM] Post from queue error:', error);
        db.markInstagramVideoFailed(req.params.id, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Configure Instagram auto-posting schedule
app.post('/api/instagram/configure-schedule', (req, res) => {
    try {
        const { postsPerDay, times } = req.body;

        // This will be handled by the scheduler
        // For now, just save the configuration

        res.json({ success: true, message: 'Agendamento configurado' });
    } catch (error) {
        console.error('[INSTAGRAM] Schedule config error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- 🤖 GEMINI AI ---

// Configure Gemini API
app.post('/api/gemini/configure', (req, res) => {
    try {
        const { apiKey } = req.body;
        const result = gemini.configureGeminiAPI(apiKey);
        res.json(result);
    } catch (error) {
        console.error('[GEMINI] Configure error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Check if Gemini is configured
app.get('/api/gemini/status', (req, res) => {
    try {
        const configured = gemini.isConfigured();
        res.json({ success: true, configured });
    } catch (error) {
        console.error('[GEMINI] Status error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Generate Instagram caption
app.post('/api/gemini/generate-caption', async (req, res) => {
    try {
        const { videoTitle, context } = req.body;
        const result = await gemini.generateInstagramCaption(videoTitle, context);
        res.json(result);
    } catch (error) {
        console.error('[GEMINI] Generate caption error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Generate hashtags
app.post('/api/gemini/generate-hashtags', async (req, res) => {
    try {
        const { topic } = req.body;
        const result = await gemini.generateHashtags(topic);
        res.json(result);
    } catch (error) {
        console.error('[GEMINI] Generate hashtags error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- 📊 LOGS & AUDIT ---

app.get('/api/logs', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const logs = db.getEvents(limit);
        res.json({ success: true, logs });
    } catch (error) {
        console.error('[LOGS] Error fetching logs:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


// --- 🛍️ SHOPEE VIDEO DOWNLOAD ---

app.post('/api/shopee/download-media', async (req, res) => {
    try {
        const { productUrl } = req.body;
        if (!productUrl) return res.status(400).json({ success: false, error: 'Product URL is required' });

        console.log('[SHOPEE] Scraping product:', productUrl);
        const productData = await shopeeScraper.scrapeShopeeProduct(productUrl);

        console.log('[SHOPEE] Videos found:', productData.videos.length);

        if (!productData.videos || productData.videos.length === 0) {
            return res.json({
                success: false,
                error: 'Este produto não possui vídeo na página. Tente outro produto ou use a busca do Pinterest para encontrar vídeos relacionados.'
            });
        }

        console.log('[SHOPEE] Downloading media...');
        const result = await shopeeScraper.downloadProductMedia(productData);

        res.json({ success: true, data: result });
    } catch (error) {
        console.error('[SHOPEE] Download media error:', error);
        res.status(500).json({ success: false, error: 'Erro ao processar produto: ' + error.message });
    }
});

// --- 📌 PINTEREST AUTOMATION ---

app.post('/api/pinterest/auth', async (req, res) => {
    const { accessToken } = req.body;
    if (!accessToken) return res.status(400).json({ error: 'Access Token is required' });

    const result = await pinterest.validateToken(accessToken);
    if (result.success) {
        // Save to DB (simulated for now, or add to database.js)
        db.savePinterestConfig({ accessToken });
        res.json({ success: true, user: result.user });
    } else {
        res.status(401).json({ error: result.error });
    }
});

app.get('/api/pinterest/boards', async (req, res) => {
    const config = db.getPinterestConfig();
    if (!config || !config.accessToken) {
        return res.status(401).json({ error: 'Pinterest not configured' });
    }

    const result = await pinterest.getBoards(config.accessToken);
    if (result.success) {
        res.json({ success: true, boards: result.boards });
    } else {
        res.status(500).json({ error: result.error });
    }
});

app.post('/api/pinterest/post', async (req, res) => {
    const { boardId, title, description, link, imageUrl } = req.body;
    const config = db.getPinterestConfig();

    if (!config || !config.accessToken) {
        return res.status(401).json({ error: 'Pinterest not configured' });
    }

    const result = await pinterest.createPin(config.accessToken, boardId, title, description, link, imageUrl);
    if (result.success) {
        res.json({ success: true, pin: result.pin });
    } else {
        res.status(500).json({ error: result.error });
    }
});

app.post('/api/pinterest/schedule', async (req, res) => {
    const { boardId, schedule } = req.body;
    // Save schedule to DB
    try {
        db.savePinterestSchedule({ boardId, ...schedule });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/pinterest/search-video', async (req, res) => {
    const { keyword } = req.query;
    if (!keyword) return res.status(400).json({ error: 'Keyword is required' });

    try {
        const results = await pinterestScraper.searchPinterestVideos(keyword);
        res.json({ success: true, results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/pinterest/download-video', async (req, res) => {
    const { pinUrl } = req.body;
    if (!pinUrl) return res.status(400).json({ error: 'Pin URL is required' });

    try {
        const result = await pinterestScraper.downloadPinterestVideo(pinUrl);
        if (result) {
            res.json({ success: true, ...result });
        } else {
            res.status(404).json({ error: 'Video not found or download failed' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== AUTHENTICATION ROUTES ====================

// Register new user
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;
        const result = await auth.registerUser(email, password, name);

        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await auth.loginUser(email, password);

        if (result.success) {
            res.json(result);
        } else {
            res.status(401).json(result);
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        const result = auth.logoutUser(token);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Verify token
app.get('/api/auth/verify', (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        const result = auth.verifyToken(token);

        if (result.success) {
            res.json(result);
        } else {
            res.status(401).json(result);
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get current user
app.get('/api/auth/me', auth.requireAuth, (req, res) => {
    res.json({ success: true, user: req.user });
});

// Get all users (admin only)
app.get('/api/auth/users', auth.requireAuth, async (req, res) => {
    try {
        const users = await auth.getAllUsers();
        res.json({ success: true, users });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== INITIALIZATION ====================

// Initialize authentication
auth.initializeAuth();

// Inicialização
scheduler.initializeScheduler();



app.listen(PORT, () => {
    console.log(`✅ MeliFlow Backend rodando na porta ${PORT}`);
    console.log(`   - Proxy ML: http://localhost:${PORT}/api/ml/proxy`);
    console.log(`   - Proxy Shopee: http://localhost:${PORT}/api/shopee/...`);
});
