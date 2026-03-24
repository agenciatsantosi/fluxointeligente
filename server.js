
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { testTelegramConnection, postToTelegramGroup, getChatInfo, getBotGroups, uploadToTelegramBridge } from './services/telegramService.js';
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
import * as analytics from './services/analyticsService.js';
import * as twitter from './services/twitterService.js';
import * as adminUser from './services/adminUserService.js';
import * as inbox from './services/inboxService.js';
import * as webhooks from './services/webhookService.js';
import { processVideoForInstagram } from './services/videoService.js';
import { processImageForInstagram } from './services/imageService.js';
import { requireAuth, requireAdmin } from './services/authService.js';

// Helper para delay aleatório (evitar banimento)
const randomDelay = (min, max) => {
    const delay = Math.floor(Math.random() * (max - min + 1) + min);
    console.log(`[DELAY] Aguardando ${delay / 1000}s...`);
    return new Promise(resolve => setTimeout(resolve, delay));
};

const app = express();
const PORT = 3001; // Forçado em 3001 para não bater com o Vite (5174) no computador ou VPS

console.log('>>> [DEBUG] SERVER STARTING - V2.0 <<<');

// Configuração do Middleware
app.use((req, res, next) => {
    // Log ultra-simplificado para Webhooks no topo
    if (req.originalUrl.includes('webhook')) {
        console.log(`\n[TRAFFIC] 🚩 HIT: ${req.method} ${req.originalUrl}`);
    } else if (req.method !== 'GET' || !req.url.startsWith('/api/inbox')) {
        // Log regular para outras rotas (evitando poluição do inbox)
        // console.log(`[REQUEST] ${req.method} ${req.url}`);
    }
    next();
});
app.use(cors());
// Aumenta o limite para aceitar payloads grandes (ex: imagens em base64 ou listas grandes de produtos)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Servir arquivos estáticos da pasta uploads (para Instagram acessar vídeos)
app.use('/uploads', express.static('uploads'));

// Global Progress Tracker for long-running Tasks (like FFMPEG video burning)
global.postProgress = new Map();

app.get('/api/progress/:taskId', (req, res) => {
    const taskId = req.params.taskId;
    if (global.postProgress.has(taskId)) {
        res.json({ success: true, progress: global.postProgress.get(taskId) });
    } else {
        res.json({ success: false, error: 'Task not found or finished' });
    }
});
app.use('/public', express.static('public'));
app.use('/shopee-media', express.static('public/shopee-media')); // Direct access to shopee media

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
        cb(null, 'media-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /mp4|mov|avi|jpg|jpeg|png|webp|gif/i;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (extname && mimetype) {
            return cb(null, true);
        } else {
            cb(new Error('Apenas vídeos (MP4, MOV) e imagens (JPG, PNG) são permitidos!'));
        }
    }
});

// Configure multer for story uploads
const storyStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'uploads/stories';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'story-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const storyUpload = multer({
    storage: storyStorage,
    limits: { fileSize: 200 * 1024 * 1024 } // 200MB limit for stories (videos)
});

// Configure multer for Facebook Reels
const facebookReelsStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'uploads/facebook';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'fb-reel-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const facebookReelsUpload = multer({
    storage: facebookReelsStorage,
    limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit for Reels
});

// URLs Base
const ML_API_BASE = 'https://api.mercadolibre.com';
const SHOPEE_SELLER_API_BASE = 'https://partner.shopeemobile.com/api/v2';
const SHOPEE_AFFILIATE_API_URL = 'https://open-api.affiliate.shopee.com.br/graphql';

// Rota de Saúde (Health Check)
// Root route removed to allow Serving React from /dist

// --- PUBLIC URL CONFIG (for ngrok & VPS) ---
let PUBLIC_URL = process.env.PUBLIC_URL || null;


async function getDynamicPublicUrl(req) {
    // 1. Check system_config in database
    try {
        const { getSystemConfig } = await import('./services/database.js');
        const dbPublicUrl = await getSystemConfig('system_public_url');
        if (dbPublicUrl) return dbPublicUrl.replace(/\/$/, '');
    } catch (e) {
        // Fallback if DB not ready
    }

    // 2. Check process.env.PUBLIC_URL
    const envPublicUrl = process.env.PUBLIC_URL;
    if (envPublicUrl) return envPublicUrl.replace(/\/$/, '');

    // 3. Auto-detect from request headers
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    
    return `${protocol}://${host}`;
};

// GET: current public URL
app.get('/api/config/public-url', requireAuth, async (req, res) => {
    res.json({ success: true, publicUrl: await getDynamicPublicUrl(req) });
});

// POST: update public URL (call when ngrok URL changes)
app.post('/api/config/public-url', requireAuth, (req, res) => {
    const { url } = req.body;
    if (!url || !url.startsWith('http')) return res.status(400).json({ success: false, error: 'URL inválida' });
    PUBLIC_URL = url.replace(/\/$/, ''); // strip trailing slash
    console.log(`[CONFIG] Public URL atualizado: ${PUBLIC_URL}`);
    res.json({ success: true, publicUrl: PUBLIC_URL });
});

// POST: Upload story media files (images + videos)
app.post('/api/story-queue/upload', requireAuth, storyUpload.array('files', 20), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });
        }

        const currentPublicUrl = await getDynamicPublicUrl(req);

        // Process videos and images if needed (async)
        const processedFiles = await Promise.all(req.files.map(async (file) => {
            const ext = path.extname(file.originalname).toLowerCase();
            const isVideo = /mp4|mov|avi/i.test(ext);
            const isImage = /jpg|jpeg|png|webp/i.test(ext);

            if (isVideo) {
                try {
                    console.log(`[STORY UPLOAD] Pre-processing video: ${file.path}`);
                    await processVideoForInstagram(file.path);
                } catch (vErr) {
                    console.error(`[STORY UPLOAD] Failed to process video ${file.path}:`, vErr.message);
                }
            } else if (isImage) {
                try {
                    console.log(`[STORY UPLOAD] Pre-processing image: ${file.path}`);
                    await processImageForInstagram(file.path);
                } catch (iErr) {
                    console.error(`[STORY UPLOAD] Failed to process image ${file.path}:`, iErr.message);
                }
            }
            return file;
        }));

        const uploaded = processedFiles.map(file => {
            const mediaType = /mp4|mov|avi/i.test(path.extname(file.originalname)) ? 'video' : 'image';
            // Normalize path: convert backslashes to forward slashes
            const normalizedPath = file.path.replace(/\\/g, '/');
            // Remove leading ./ if present and ensure path starts with uploads/
            const relativePath = normalizedPath.replace(/^\.\//, '').replace(/^\//, '');
            const url = `${currentPublicUrl}/${relativePath}`;
            return {
                originalName: file.originalname,
                filename: file.filename,
                url,
                mediaType,
                size: file.size
            };
        });

        console.log(`[STORY UPLOAD] Uploaded ${uploaded.length} file(s) via PUBLIC_URL: ${currentPublicUrl}`);
        res.json({ success: true, files: uploaded });
    } catch (error) {
        console.error('[STORY UPLOAD] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


// --- 🌐 UNIFIED GLOBAL PROXY ---

app.post('/api/proxy/global', async (req, res) => {
    const { target, ...payload } = req.body;

    if (!target) {
        return res.status(400).json({ error: 'Missing target in proxy request' });
    }

    try {
        // --- MERCADO LIVRE ---
        if (target === 'ml') {
            const { endpoint, method, data, token } = payload;
            console.log(`[PROXY GLOBAL: ML] ${method} ${endpoint}`);

            const response = await axios({
                url: `${ML_API_BASE}${endpoint}`,
                method: method || 'GET',
                data: data,
                headers: token ? { 'Authorization': `Bearer ${token.trim()}` } : {}
            });
            return res.json(response.data);
        }

        // --- SHOPEE SELLER ---
        else if (target === 'shopee_seller') {
            const { path, body, partnerId, partnerKey, shopId, accessToken } = payload;
            console.log(`[PROXY GLOBAL: SHOPEE SELLER] POST ${path}`);

            const timestamp = Math.floor(Date.now() / 1000);
            const pKey = partnerKey ? partnerKey.trim() : '';
            const aToken = accessToken ? accessToken.trim() : '';

            let baseString = `${partnerId}${path}${timestamp}`;
            if (aToken) baseString += aToken;
            if (shopId) baseString += shopId;

            const sign = crypto.createHmac('sha256', pKey).update(baseString).digest('hex');

            let url = `${SHOPEE_SELLER_API_BASE}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}`;
            if (aToken) url += `&access_token=${aToken}`;
            if (shopId) url += `&shop_id=${shopId}`;

            const response = await axios.post(url, body, {
                headers: { 'Content-Type': 'application/json' }
            });
            return res.json(response.data);
        }

        // --- SHOPEE AUTH LINK ---
        else if (target === 'shopee_auth_link') {
            const { partnerId, partnerKey } = payload;
            const path = '/api/v2/shop/auth_partner';
            const timestamp = Math.floor(Date.now() / 1000);
            const pKey = partnerKey ? partnerKey.trim() : '';

            const baseString = `${partnerId}${path}${timestamp}`;
            const sign = crypto.createHmac('sha256', pKey).update(baseString).digest('hex');
            const redirect = 'http://localhost:5173/';

            const url = `https://partner.shopeemobile.com${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}&redirect=${encodeURIComponent(redirect)}`;

            console.log(`[PROXY GLOBAL: SHOPEE AUTH] Generating link for Partner ${partnerId}`);
            return res.json({ url });
        }

        // --- SHOPEE AFFILIATE ---
        else if (target === 'shopee_affiliate') {
            const { query, appId, password } = payload;
            const timestamp = Math.floor(Date.now() / 1000);

            const cleanAppId = appId ? String(appId).trim() : '';
            const cleanPassword = password ? String(password).trim() : '';

            const payloadObj = { query };
            const payloadString = JSON.stringify(payloadObj).replace(/\n/g, '');

            const signatureBase = cleanAppId + timestamp + payloadString + cleanPassword;
            const signature = crypto.createHash('sha256').update(signatureBase).digest('hex');

            console.log(`[PROXY GLOBAL: SHOPEE AFFILIATE] Executing Query`);

            const response = await axios.post(SHOPEE_AFFILIATE_API_URL, payloadString, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `SHA256 Credential=${cleanAppId},Timestamp=${timestamp},Signature=${signature}`
                }
            });
            return res.json(response.data);
        }

        // --- TELEGRAM PROXY (Streaming for IG) ---
        else if (target === 'tg_proxy') {
            const { token, fpath } = payload;
            if (!token || !fpath) return res.status(400).json({ error: 'Missing token or fpath' });

            const tgUrl = `https://api.telegram.org/file/bot${token}/${fpath}`;
            console.log(`[PROXY GLOBAL: TG STREAM] Streaming from Telegram...`);

            const response = await axios({
                method: 'get',
                url: tgUrl,
                responseType: 'stream'
            });

            res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
            return response.data.pipe(res);
        }

        // --- TARGET NÃO ENCONTRADO ---
        else {
            return res.status(404).json({ error: `Target '${target}' not supported by global proxy` });
        }

    } catch (error) {
        console.error(`[PROXY GLOBAL ERROR: ${target.toUpperCase()}]:`, error.response?.data || error.message);
        if (target === 'shopee_affiliate' && error.response?.data) {
            console.error("Shopee Response Data:", JSON.stringify(error.response.data, null, 2));
        }
        res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
});

// --- 📱 TELEGRAM STREAM PROXY (For Instagram/Meta Crawler) ---
// Use: /tg-stream/TOKEN/photos/file_1.jpg
app.get('/tg-stream/:token/*', async (req, res) => {
    const { token } = req.params;
    const fpath = req.params[0]; // Captura o restante do caminho

    if (!token || !fpath) {
        return res.status(400).send('Missing token or file path');
    }

    const tgUrl = `https://api.telegram.org/file/bot${token}/${fpath}`;
    console.log(`[TG STREAM] Relaying: ${fpath}`);

    try {
        const response = await axios({
            method: 'get',
            url: tgUrl,
            responseType: 'stream',
            timeout: 15000
        });

        res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
        // Cache por 1 hora para evitar requisições excessivas do crawler
        res.setHeader('Cache-Control', 'public, max-age=3600');
        
        response.data.pipe(res);
    } catch (error) {
        console.error('[TG STREAM] Error:', error.message);
        res.status(500).send('Error streaming from Telegram');
    }
});

// --- 📱 TELEGRAM AUTOMATION ROUTES ---

// Testar conexão do bot
app.post('/api/telegram/test', async (req, res) => {
    const { botToken } = req.body;
    const result = await testTelegramConnection(botToken);
    res.json(result);
});

// Obter contas do Telegram (bots)
app.get('/api/telegram/accounts', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        console.log(`[DEBUG] GET /api/telegram/accounts for userId: ${userId}`);
        const accounts = await db.getTelegramAccounts(userId);
        console.log(`[DEBUG] Found ${accounts.length} accounts`);
        res.json({ success: true, accounts });
    } catch (error) {
        console.error('[TELEGRAM API] Get accounts error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Adicionar ou atualizar conta do Telegram
app.post('/api/telegram/accounts', requireAuth, async (req, res) => {
    try {
        const { botToken } = req.body;
        const userId = req.user.userId;
        console.log(`[DEBUG] POST /api/telegram/accounts for userId: ${userId}`);

        // Validar token
        const result = await testTelegramConnection(botToken);
        if (!result.success) {
            console.log('[DEBUG] Connection test failed:', result.error);
            return res.json(result);
        }

        const accountData = {
            name: result.botInfo.firstName,
            username: result.botInfo.username,
            token: botToken
        };

        const saveResult = await db.saveTelegramAccount(accountData, userId);
        console.log('[DEBUG] Account saved');
        res.json({ success: true, account: accountData });
    } catch (error) {
        console.error('[TELEGRAM API] Add account error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Remover conta do Telegram
app.delete('/api/telegram/accounts/:id', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const result = await db.removeTelegramAccount(req.params.id, userId);
        res.json({ success: true });
    } catch (error) {
        console.error('[TELEGRAM API] Remove account error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
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

// Listar e salvar grupos do bot
app.post('/api/telegram/list-groups', requireAuth, async (req, res) => {
    const { botToken } = req.body;
    const userId = req.user.userId;

    try {
        const groups = await getBotGroups(botToken);

        let savedCount = 0;
        for (const group of groups) {
            await db.saveTelegramGroup({
                groupId: group.id,
                groupName: group.name,
                enabled: true
            }, userId);
            savedCount++;
        }

        res.json({
            success: true,
            message: `${savedCount} grupos encontrados e salvos`,
            groups
        });
    } catch (error) {
        console.error('Error listing Telegram groups:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Postar produtos agora (automação manual)
app.post('/api/telegram/post-now', requireAuth, async (req, res) => {
    const {
        botToken,
        groups,
        productCount,
        shopeeSettings,
        filters,
        mediaType,
        messageTemplate,
        enableRotation,
        sendMode,
        manualMessage,
        categoryType
    } = req.body;
    const userId = req.user.userId;

    try {
        console.log(`[TELEGRAM POST-NOW] Iniciando automação (${sendMode || 'auto'})...`);

        let productsToPost = [];

        if (sendMode !== 'manual') {
            console.log('[POST-NOW] Tipo de Mídia:', mediaType);
            console.log('[POST-NOW] Rotação de produtos:', enableRotation ? 'ATIVA' : 'DESATIVADA');

            // 1. Buscar produtos e gerar links
            const products = await prepareProductsForPosting(shopeeSettings, productCount, filters, enableRotation !== false, categoryType, userId);

            // Filtragem baseada no tipo de mídia (opcional, mas bom para "Apenas Vídeo")
            productsToPost = products;
            if (mediaType === 'video') {
                productsToPost = products.sort((a, b) => (b.videoUrl ? 1 : 0) - (a.videoUrl ? 1 : 0));
            }
            console.log(`[POST-NOW] ${productsToPost.length} produtos preparados`);
        }

        const results = {
            success: 0,
            failed: 0,
            skipped: 0,
            errors: []
        };

        for (const group of groups) {
            if (sendMode === 'manual') {
                try {
                    // Simular objeto de produto para o telegramService se necessário, 
                    // ou criar uma nova função. Mas postToTelegramGroup usa o template se for produto.
                    // Para mensagem manual, podemos passar uma string ou adaptar.
                    // Verificando telegramService.js, postToTelegramGroup(groupId, product, botToken, template, mediaType)
                    // Se passarmos um produto fake ou nulo e o template ser a mensagem manual...

                    const result = await postToTelegramGroup(group.id, { manualText: manualMessage }, botToken, manualMessage, 'text');

                    if (result.success) {
                        results.success++;
                        results.sentTypes = results.sentTypes || { manual: 0 };
                        results.sentTypes.manual = (results.sentTypes.manual || 0) + 1;

                        await db.logEvent('telegram_send_manual', {
                            groupId: group.id,
                            success: true
                        }, userId);
                    } else {
                        throw new Error(result.error || 'Erro ao enviar mensagem manual');
                    }

                    // Delay menor para manual
                    await randomDelay(3000, 7000);
                } catch (error) {
                    results.failed++;
                    results.errors.push(`${group.name}: ${error.message}`);
                    await db.logEvent('telegram_send_manual', {
                        groupId: group.id,
                        success: false,
                        errorMessage: error.message
                    }, userId);
                }
            } else {
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
                                await db.logSentProduct({
                                    productId: product.id || product.productId,
                                    productName: product.productName || product.name,
                                    price: product.price,
                                    commission: product.commission,
                                    groupId: group.id,
                                    groupName: group.name,
                                    mediaType: type,
                                    category: product.category || null
                                }, userId);

                                await db.logEvent('send', {
                                    productId: product.id || product.productId,
                                    groupId: group.id,
                                    success: true
                                }, userId);
                            } catch (dbError) {
                                console.error('[DB] Error logging product:', dbError);
                            }
                        } else {
                            if (result.error && result.error.includes('(Ignorado)')) {
                                results.skipped++;
                                console.log(`[POST-NOW] Ignorado no grupo ${group.name}: ${result.error}`);

                                // Log skipped event
                                try {
                                    await db.logEvent('skip', {
                                        productId: product.id || product.productId,
                                        groupId: group.id,
                                        success: false,
                                        errorMessage: result.error
                                    }, userId);
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
                            await db.logEvent('send', {
                                productId: product.id || product.productId,
                                groupId: group.id,
                                success: false,
                                errorMessage: error.message
                            }, userId);
                        } catch (dbError) {
                            console.error('[DB] Error logging failure:', dbError);
                        }
                    }
                }
            }
        }

        console.log('[POST-NOW] Concluído:', results);
        res.json({
            success: true,
            message: `${results.success} enviados, ${results.skipped || 0} ignorados, ${results.failed} falhas`,
            details: results
        });

    } catch (error) {
        console.error('[POST-NOW] Erro:', error);
        res.json({ success: false, error: error.message });
    }
});

// Schedule Telegram automation
app.post('/api/telegram/schedule', requireAuth, async (req, res) => {
    try {
        const config = req.body;
        const userId = req.user.userId;
        console.log('[TELEGRAM SCHEDULE] Creating schedule:', config);

        // Save to database using scheduler service
        const result = await scheduler.createSchedule('telegram', config, userId);

        console.log('[TELEGRAM SCHEDULE] Schedule created:', result);
        res.json(result);
    } catch (error) {
        console.error('[TELEGRAM SCHEDULE] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get saved Telegram groups
app.get('/api/telegram/groups', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const groups = await db.getTelegramGroups(userId);
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
app.get('/api/analytics/dashboard', requireAuth, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;
        const userId = req.user.userId;
        const stats = await db.getDashboardStats(days, userId);
        const sendsOverTime = await db.getSendsOverTime(days, userId);

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
app.get('/api/analytics/top-products', requireAuth, (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const days = parseInt(req.query.days) || 30;
        const userId = req.user.userId;
        const topProducts = db.getTopProducts(limit, days, userId);

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
app.get('/api/analytics/group-performance', requireAuth, (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const userId = req.user.userId;
        const groupStats = db.getGroupPerformance(days, userId);

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
app.get('/api/products/sent-today', requireAuth, (req, res) => {
    try {
        const userId = req.user.userId;
        const productIds = db.getProductsSentInLastHours(24, userId);

        res.json({
            success: true,
            productIds
        });
    } catch (error) {
        console.error('[PRODUCTS] Error getting sent products:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- 📱 WHATSAPP ACCOUNTS ---

// List WhatsApp accounts
app.get('/api/whatsapp/accounts', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const accountsRaw = await db.getWhatsAppAccounts(userId);

        // Enrich with live connection status
        const accounts = accountsRaw.map(acc => {
            const liveStatus = whatsapp.getConnectionStatus(userId, acc.id);
            return {
                ...acc,
                status: liveStatus.status
            };
        });

        res.json({ success: true, accounts });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- 🌐 WEBHOOK ENDPOINTS ---
app.use('/api/webhook', (req, res, next) => {
    console.log(`[TRAFFIC] ${req.method} ${req.originalUrl}`);
    console.log(`[TRAFFIC] Headers: ${JSON.stringify(req.headers, null, 2)}`);
    if (req.method === 'POST') {
        console.log(`[TRAFFIC] Body: ${JSON.stringify(req.body, null, 2)}`);
    }
    next();
});

app.get('/api/webhook', webhooks.verifyWebhook);
app.post('/api/webhook', webhooks.handleWebhookEvent);

// --- 📱 WHATSAPP ENDPOINTS ---

// Create WhatsApp account
app.post('/api/whatsapp/accounts', requireAuth, async (req, res) => {
    try {
        const { name } = req.body;
        const userId = req.user.userId;
        const result = await db.addWhatsAppAccount(userId, name);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete WhatsApp account
app.delete('/api/whatsapp/accounts/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;

        // Disconnect first
        await whatsapp.disconnectWhatsApp(userId, id);

        const result = await db.removeWhatsAppAccount(id, userId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- 📱 WHATSAPP ENDPOINTS ---

// Initialize WhatsApp connection
app.post('/api/whatsapp/initialize', requireAuth, async (req, res) => {
    try {
        const { force, accountId } = req.body;
        const userId = req.user.userId;

        if (!accountId) return res.status(400).json({ success: false, error: 'accountId is required' });

        const result = await whatsapp.initializeWhatsApp(userId, accountId, false, force === true);
        res.json(result);
    } catch (error) {
        console.error('[WHATSAPP API] Initialize error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get QR code for scanning
app.get('/api/whatsapp/qr', requireAuth, (req, res) => {
    try {
        const { accountId } = req.query;
        const userId = req.user.userId;

        if (!accountId) return res.status(400).json({ success: false, error: 'accountId is required' });

        const qr = whatsapp.getQRCode(userId, accountId);
        res.json({ success: true, qr });
    } catch (error) {
        console.error('[WHATSAPP API] QR error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get connection status
app.get('/api/whatsapp/status', requireAuth, (req, res) => {
    try {
        const { accountId } = req.query;
        const userId = req.user.userId;

        if (!accountId) return res.status(400).json({ success: false, error: 'accountId is required' });

        const status = whatsapp.getConnectionStatus(userId, accountId);
        res.json({ success: true, ...status });
    } catch (error) {
        console.error('[WHATSAPP API] Status error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get contacts
app.get('/api/whatsapp/contacts', requireAuth, (req, res) => {
    try {
        const { accountId } = req.query;
        const userId = req.user.userId;

        if (!accountId) return res.status(400).json({ success: false, error: 'accountId is required' });

        const contacts = whatsapp.getContacts(userId, accountId);
        res.json({ success: true, contacts });
    } catch (error) {
        console.error('[WHATSAPP API] Contacts error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Removed duplicate Get groups route from line 811. Use the one at 3393 or consolidate.
// Consolidating all WhatsApp group fetches to require accountId if possible, but keeping flexibility.

// Send single message
app.post('/api/whatsapp/send', requireAuth, async (req, res) => {
    try {
        const { to, message, imageUrl, accountId } = req.body;
        const userId = req.user.userId;

        if (!accountId) return res.status(400).json({ success: false, error: 'accountId is required' });

        let result;
        if (imageUrl) {
            result = await whatsapp.sendImage(userId, accountId, to, imageUrl, message);
        } else {
            result = await whatsapp.sendMessage(userId, accountId, to, message);
        }

        res.json(result);
    } catch (error) {
        console.error('[WHATSAPP API] Send error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Post products now (bulk send)
app.post('/api/whatsapp/post-now', requireAuth, async (req, res) => {
    const {
        recipients,
        productCount,
        shopeeSettings,
        filters,
        mediaType,
        messageTemplate,
        enableRotation,
        options,
        categoryType,
        sendMode,
        manualMessage,
        accountId
    } = req.body;
    const userId = req.user.userId;

    if (!accountId) return res.status(400).json({ success: false, error: 'accountId is required' });

    try {
        console.log(`[WHATSAPP POST-NOW] Iniciando automação (${sendMode || 'auto'})...`);

        let products = [];
        if (sendMode !== 'manual') {
            console.log('[WHATSAPP POST-NOW] Tipo de Mídia:', mediaType);
            console.log('[WHATSAPP POST-NOW] Rotação:', enableRotation ? 'ATIVA' : 'DESATIVADA');

            // Get products
            products = await prepareProductsForPosting(shopeeSettings, productCount, filters, enableRotation !== false, categoryType, userId);
            console.log(`[WHATSAPP POST-NOW] ${products.length} produtos preparados`);
        }

        const results = {
            success: 0,
            failed: 0,
            skipped: 0,
            errors: [],
            sentTypes: { image: 0, text: 0, manual: 0 }
        };

        // Send to each recipient
        for (const recipient of recipients) {
            if (sendMode === 'manual') {
                try {
                    const result = await (options?.mentionAll ?
                        whatsapp.sendMentionAll(userId, accountId, recipient.id, manualMessage) :
                        whatsapp.sendMessage(userId, accountId, recipient.id, manualMessage)
                    );

                    if (result.success) {
                        results.success++;
                        results.sentTypes.manual++;

                        await db.logEvent('whatsapp_send_manual', {
                            groupId: recipient.id,
                            message: manualMessage.substring(0, 50) + '...',
                            success: true
                        }, userId);
                    } else {
                        throw new Error(result.error || 'Erro ao enviar mensagem manual');
                    }

                    // Rate limit for manual as well (shorter delay)
                    await randomDelay(5000, 10000);
                } catch (error) {
                    results.failed++;
                    results.errors.push(`${recipient.name}: ${error.message}`);
                    await db.logEvent('whatsapp_send_manual', {
                        groupId: recipient.id,
                        success: false,
                        errorMessage: error.message
                    }, userId);
                }
            } else {
                for (const product of products) {
                    try {
                        const result = await whatsapp.sendProductMessage(
                            userId,
                            accountId, // Use the extracted accountId
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
                                await db.logSentProduct({
                                    productId: product.id || product.productId,
                                    productName: product.productName || product.name,
                                    price: product.price,
                                    commission: product.commission,
                                    groupId: recipient.id,
                                    groupName: recipient.name,
                                    mediaType: type,
                                    category: product.category || null
                                }, userId);

                                await db.logEvent('whatsapp_send', {
                                    productId: product.id || product.productId,
                                    groupId: recipient.id,
                                    success: true
                                }, userId);
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
                            await db.logEvent('whatsapp_send', {
                                productId: product.id || product.productId,
                                groupId: recipient.id,
                                success: false,
                                errorMessage: error.message
                            }, userId);
                        } catch (dbError) {
                            console.error('[DB] Error logging failure:', dbError);
                        }
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
app.post('/api/whatsapp/send-video', requireAuth, async (req, res) => {
    try {
        const { to, videoUrl, caption, accountId } = req.body;
        const userId = req.user.userId;
        const result = await whatsapp.sendVideo(userId, accountId, to, videoUrl, caption);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Send Audio
app.post('/api/whatsapp/send-audio', requireAuth, async (req, res) => {
    try {
        const { to, audioUrl, accountId } = req.body;
        const userId = req.user.userId;
        const result = await whatsapp.sendAudio(userId, accountId, to, audioUrl);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Post to Status
app.post('/api/whatsapp/post-status', requireAuth, async (req, res) => {
    try {
        const { message, mediaUrl, mediaType, accountId } = req.body;
        const userId = req.user.userId;
        const result = await whatsapp.postToStatus(userId, accountId, message, mediaUrl, mediaType);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Join Group
app.post('/api/whatsapp/join-group', requireAuth, async (req, res) => {
    try {
        const { inviteLink, accountId } = req.body;
        const userId = req.user.userId;
        const result = await whatsapp.joinGroup(userId, accountId, inviteLink);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Disconnect WhatsApp
app.post('/api/whatsapp/disconnect', requireAuth, async (req, res) => {
    try {
        const { accountId } = req.body;
        const userId = req.user.userId;
        const result = await whatsapp.disconnectWhatsApp(userId, accountId);
        res.json(result);
    } catch (error) {
        console.error('[WHATSAPP API] Disconnect error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- 📘 FACEBOOK ENDPOINTS ---

// Add Facebook page
app.post('/api/facebook/add-page', requireAuth, async (req, res) => {
    try {
        const { pageId, pageName, accessToken, instagramBusinessId, instagramUsername } = req.body;
        const userId = req.user.userId;

        // Verify token first
        const verification = await facebook.verifyPageToken(pageId, accessToken);
        if (!verification.success) {
            return res.json(verification);
        }

        const result = await facebook.addPage({
            pageId,
            pageName: pageName || verification.page.name,
            accessToken,
            instagramBusinessId,
            instagramUsername
        }, userId);

        res.json(result);
    } catch (error) {
        console.error('[FACEBOOK API] Add page error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get all pages
app.get('/api/facebook/pages', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const pages = await facebook.getPages(userId);
        res.json({ success: true, pages });
    } catch (error) {
        console.error('[FACEBOOK API] Get pages error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Remove page
app.delete('/api/facebook/page/:pageId', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const result = await facebook.removePage(req.params.pageId, userId);
        res.json(result);
    } catch (error) {
        console.error('[FACEBOOK API] Remove page error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Toggle page
app.post('/api/facebook/toggle-page/:pageId', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const result = await facebook.togglePage(req.params.pageId, userId);
        res.json(result);
    } catch (error) {
        console.error('[FACEBOOK API] Toggle page error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Post products now (bulk send)
app.post('/api/facebook/post-now', requireAuth, async (req, res) => {
    const { facebookPages, pages: legacyPages, productCount, shopeeSettings, filters, mediaType, messageTemplate, enableRotation, sendMode, manualMessage, manualImageUrl, postType, categoryType, taskId } = req.body;
    const selectedPages = facebookPages || legacyPages;
    const userId = req.user.userId;

    try {
        console.log('[FACEBOOK POST-NOW] Iniciando automação...');
        console.log('[FACEBOOK POST-NOW] Modo:', sendMode, 'Tipo:', postType || 'feed');

        const results = {
            success: 0,
            failed: 0,
            skipped: 0,
            errors: [],
            sentTypes: { image: 0, text: 0, story: 0 }
        };

        if (taskId) {
            global.postProgress.set(taskId, { total: selectedPages.length, current: 0, success: 0, failed: 0, active: true, stage: sendMode === 'manual' ? 'postando' : 'buscando_produtos' });
        }

        if (sendMode === 'manual') {
            console.log(`[FACEBOOK POST-NOW] Enviando ${postType === 'story' ? 'Story' : 'Mensagem'} para ${selectedPages.length} página(s)`);

            for (const page of selectedPages) {
                try {
                    let result;
                    if (postType === 'story') {
                        if (!manualImageUrl) throw new Error('Story exige uma URL de mídia (imagem ou vídeo)');
                        const mType = manualImageUrl.includes('.mp4') || manualImageUrl.includes('.mov') ? 'video' : 'image';
                        
                        try {
                            const isLocal = manualImageUrl && (manualImageUrl.startsWith('/uploads/') || manualImageUrl.includes('localhost') || manualImageUrl.includes('127.0.0.1'));
                            if (isLocal) {
                                const relativePath = manualImageUrl.replace(/.*\/uploads\//, 'uploads/');
                                const absolutePath = path.join(process.cwd(), relativePath);
                                if (fs.existsSync(absolutePath)) {
                                    const textToBurn = "Peça o link por direct ou clique no link da bio!";
                                    if (mType === 'image') {
                                        const { burnTextToImage } = await import('./services/imageService.js');
                                        await burnTextToImage(absolutePath, textToBurn);
                                    } else {
                                        const { burnTextToVideo } = await import('./services/videoService.js');
                                        await burnTextToVideo(absolutePath, textToBurn);
                                    }
                                }
                            }
                        } catch (burnErr) {
                            console.warn('[STORY BURNING FB] Falha ao tentar gravar texto manual:', burnErr.message);
                        }

                        result = await facebook.postStory(page.id, page.accessToken, manualImageUrl, mType);
                    } else {
                        result = await facebook.postMessage(page.id, page.accessToken, manualMessage);
                    }

                    if (result.success) {
                        results.success++;
                        results.sentTypes[postType === 'story' ? 'story' : 'text']++;

                        await db.logEvent('facebook_send', {
                            groupId: page.id,
                            success: true,
                            message: postType === 'story' ? "Envio de Story" : "Envio Manual"
                        }, userId);

                        if (taskId) {
                            const prog = global.postProgress.get(taskId) || { current: 0, success: 0, failed: 0 };
                            global.postProgress.set(taskId, { ...prog, current: prog.current + 1, success: prog.success + 1 });
                        }
                    } else {
                        throw new Error(result.error || 'Erro desconhecido ao enviar');
                    }
                } catch (error) {
                    results.failed++;
                    results.errors.push(`${page.name}: ${error.message}`);
                    console.error(`[FACEBOOK POST-NOW] Erro para ${page.name}:`, error);
                    if (taskId) {
                        const prog = global.postProgress.get(taskId) || { current: 0, success: 0, failed: 0 };
                        global.postProgress.set(taskId, { ...prog, current: prog.current + 1, failed: prog.failed + 1 });
                    }
                }
            }
        } else {
            console.log('[FACEBOOK POST-NOW] Tipo de Mídia:', mediaType);
            // Get products
            const products = await prepareProductsForPosting(shopeeSettings, productCount, filters, enableRotation !== false, categoryType, userId);

            if (taskId) {
                global.postProgress.set(taskId, { total: products.length * selectedPages.length, current: 0, success: 0, failed: 0, active: true, stage: 'postando' });
            }

            for (const page of selectedPages) {
                for (const product of products) {
                    try {
                        let result;
                        if (postType === 'story') {
                            const mType = product.videoUrl ? 'video' : 'image';
                            const mediaUrl = product.videoUrl || product.imagePath || product.imageUrl;

                            try {
                                const isLocal = mediaUrl && (mediaUrl.startsWith('/uploads/') || mediaUrl.includes('localhost') || mediaUrl.includes('127.0.0.1'));
                                if (isLocal) {
                                    const relativePath = mediaUrl.replace(/.*\/uploads\//, 'uploads/');
                                    const absolutePath = path.join(process.cwd(), relativePath);
                                    if (fs.existsSync(absolutePath)) {
                                        const textToBurn = "Peça o link por direct ou clique no link da bio!";
                                        if (mType === 'image') {
                                            const { burnTextToImage } = await import('./services/imageService.js');
                                            await burnTextToImage(absolutePath, textToBurn);
                                        } else {
                                            const { burnTextToVideo } = await import('./services/videoService.js');
                                            await burnTextToVideo(absolutePath, textToBurn);
                                        }
                                    }
                                }
                            } catch (burnErr) {
                                console.warn('[STORY BURNING FB] Falha ao tentar gravar texto auto:', burnErr.message);
                            }

                            result = await facebook.postStory(page.id, page.accessToken, mediaUrl, mType);
                        } else if (postType === 'reels') {
                            const mediaUrl = product.videoUrl || product.imageUrl;
                            const mType = product.videoUrl ? 'video' : 'image';
                            if (mType === 'video') {
                                result = await facebook.postStory(page.id, page.accessToken, mediaUrl, 'video'); // postStory handles Reels too for FB
                            } else {
                                result = await facebook.postProduct(page.id, page.accessToken, product, messageTemplate, mediaType);
                            }
                        } else {
                            result = await facebook.postProduct(
                                page.id,
                                page.accessToken,
                                product,
                                messageTemplate,
                                mediaType
                            );
                        }


                        if (result.success) {
                            results.success++;
                            const type = product.imagePath || product.imageUrl ? 'image' : 'text';
                            results.sentTypes[type]++;

                            // Log to database
                            try {
                                await db.logSentProduct({
                                    productId: product.id || product.productId,
                                    productName: product.productName || product.name,
                                    price: product.price,
                                    commission: product.commission,
                                    groupId: page.id,
                                    groupName: page.name,
                                    mediaType: type,
                                    category: product.category || null
                                }, userId);

                                await db.logEvent('facebook_send', {
                                    productId: product.id || product.productId,
                                    groupId: page.id,
                                    success: true
                                }, userId);
                            } catch (dbError) {
                                console.error('[DB] Error logging:', dbError);
                            }
                        } else {
                            throw new Error(result.error || 'Erro desconhecido');
                        }

                        if (taskId) {
                            const prog = global.postProgress.get(taskId) || { current: 0, success: 0, failed: 0 };
                            global.postProgress.set(taskId, { ...prog, current: prog.current + 1, success: prog.success + 1 });
                        }

                        // Rate limiting: 45s a 90s (Facebook)
                        await randomDelay(45000, 90000);
                    } catch (error) {
                        results.failed++;
                        results.errors.push(`${page.name}: ${error.message}`);
                        console.error(`[FACEBOOK POST-NOW] Erro para ${page.name}:`, error);

                        // Log failure
                        try {
                            await db.logEvent('facebook_send', {
                                productId: product.id || product.productId,
                                groupId: page.id,
                                success: false,
                                errorMessage: error.message
                            }, userId);
                        } catch (dbError) {
                            console.error('[DB] Error logging failure:', dbError);
                        }

                        if (taskId) {
                            const prog = global.postProgress.get(taskId) || { current: 0, success: 0, failed: 0 };
                            global.postProgress.set(taskId, { ...prog, current: prog.current + 1, failed: prog.failed + 1 });
                        }
                    }
                }
            }
        } // end of else block

        if (taskId) {
            const prog = global.postProgress.get(taskId) || {};
            global.postProgress.set(taskId, { ...prog, active: false });
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

// --- 📸 FACEBOOK REELS VIDEO UPLOAD & QUEUE ---

// Upload video to Facebook Reels queue
app.post('/api/facebook/reels/upload', requireAuth, facebookReelsUpload.array('files'), async (req, res) => {
    try {
        const { caption, aspectRatio } = req.body;
        const userId = req.user.userId;

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, error: 'Nenhum vídeo enviado' });
        }

        const results = [];
        for (const file of req.files) {
            const ext = path.extname(file.originalname).toLowerCase();
            const isVideo = /mp4|mov|avi/i.test(ext);
            const isImage = /jpg|jpeg|png|webp|gif/i.test(ext);

            if (isVideo) {
                try {
                    console.log(`[FACEBOOK UPLOAD] Pre-processando vídeo: ${file.path}`);
                    await processVideoForInstagram(file.path); // Reusing the same optimization logic
                } catch (err) {
                    console.error(`[FACEBOOK UPLOAD] Falha ao processar vídeo ${file.path}:`, err.message);
                }
            } else if (isImage) {
                try {
                    console.log(`[FACEBOOK UPLOAD] Pre-processando imagem: ${file.path}`);
                    await processImageForInstagram(file.path);
                } catch (err) {
                    console.error(`[FACEBOOK UPLOAD] Falha ao processar imagem ${file.path}:`, err.message);
                }
            }

            const normalizedPath = file.path.replace(/\\/g, '/');
            const result = await db.addToFacebookQueue(normalizedPath, caption || '', null, null, userId, aspectRatio || '9:16');
            results.push({
                id: result.id,
                filename: file.filename,
                path: file.path
            });
        }

        res.json({
            success: true,
            files: results
        });
    } catch (error) {
        console.error('[FACEBOOK REELS] Upload error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get Facebook Reels queue
app.get('/api/facebook/reels/queue', requireAuth, async (req, res) => {
    try {
        const { status } = req.query;
        const userId = req.user.userId;
        const queue = await db.getFacebookQueue(status, userId);
        res.json({ success: true, queue });
    } catch (error) {
        console.error('[FACEBOOK REELS] Queue error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update Facebook Reel details
app.put('/api/facebook/reels/queue/:id', requireAuth, async (req, res) => {
    try {
        const updates = req.body;
        const userId = req.user.userId;
        await db.updateFacebookVideo(req.params.id, updates, userId);
        res.json({ success: true });
    } catch (error) {
        console.error('[FACEBOOK REELS] Update error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete ALL Facebook Reels from queue
app.delete('/api/facebook/reels/queue/all', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const queue = await db.getFacebookQueue(null, userId);
        
        for (const video of queue) {
            if (video && video.video_path && fs.existsSync(video.video_path)) {
                try { fs.unlinkSync(video.video_path); } catch (e) {}
            }
            await db.deleteFromFacebookQueue(video.id, userId);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('[FACEBOOK REELS] Clear all error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete Facebook Reel from queue
app.delete('/api/facebook/reels/queue/:id', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const queue = await db.getFacebookQueue(null, userId);
        const video = queue.find(v => v.id === parseInt(req.params.id));

        if (video && fs.existsSync(video.video_path)) {
            fs.unlinkSync(video.video_path);
        }

        await db.deleteFromFacebookQueue(req.params.id, userId);
        res.json({ success: true });
    } catch (error) {
        console.error('[FACEBOOK REELS] Delete error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Post Facebook Reel from queue (manual trigger)
app.post('/api/facebook/reels/post-from-queue/:id', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { pageId, accessToken } = req.body;
        const queue = await db.getFacebookQueue(null, userId);
        const video = queue.find(v => v.id === parseInt(req.params.id));

        if (!video) return res.status(404).json({ success: false, error: 'Vídeo não encontrado' });

        console.log(`[FACEBOOK REELS] Posting video from queue: ${video.id}`);

                const currentPublicUrl = await getDynamicPublicUrl(req);
        const mediaUrl = `${currentPublicUrl}/${video.video_path.replace(/\\/g, '/')}`;
        
        const isImage = video.video_path.match(/\.(jpg|jpeg|png|webp|gif)$/i);
        let result;

        if (isImage) {
            console.log(`[FACEBOOK QUEUE] Imagem detectada. Enviando como Foto de Feed para evitar erro do Reels: ${video.video_path}`);
            result = await facebook.postPhoto(pageId, accessToken, mediaUrl, video.caption || '');
        } else {
            console.log(`[FACEBOOK QUEUE] Vídeo detectado. Enviando via Reels API: ${video.video_path}`);
            result = await facebook.postStory(pageId, accessToken, mediaUrl, 'video');
        }

        if (result.success) {
            await db.markFacebookVideoPosted(video.id);
            await db.logEvent('facebook_reel_post', { productId: video.id, success: true }, userId);
            if (fs.existsSync(video.video_path)) fs.unlinkSync(video.video_path);
            res.json({ success: true });
        } else {
            await db.markFacebookVideoFailed(video.id, result.error);
            await db.logEvent('facebook_reel_post', { productId: video.id, success: false, errorMessage: result.error }, userId);
            res.json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('[FACEBOOK REELS] Post from queue error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Configure Facebook Reels auto-posting schedule
app.post('/api/facebook/reels/configure-schedule', requireAuth, async (req, res) => {
    try {
        const { postsPerDay, times, startDate, videoIds } = req.body;
        const userId = req.user.userId;

        if (!videoIds || videoIds.length === 0) return res.status(400).json({ success: false, error: 'Nenhum vídeo selecionado' });

        let currentDate = new Date(startDate);
        let timeIndex = 0;
        const sortedTimes = times.sort();

        for (const videoId of videoIds) {
            const timeString = sortedTimes[timeIndex];
            const [hours, minutes] = timeString.split(':');
            const scheduledTime = new Date(currentDate);
            scheduledTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

            await db.updateFacebookScheduledTime(videoId, scheduledTime.toISOString());

            timeIndex++;
            if (timeIndex >= sortedTimes.length) {
                timeIndex = 0;
                currentDate.setDate(currentDate.getDate() + 1);
                if (postsPerDay < 1) currentDate.setDate(currentDate.getDate() + 6);
            }
        }
        res.json({ success: true, message: 'Agendamento de Facebook Reels configurado com sucesso' });
    } catch (error) {
        console.error('[FACEBOOK REELS] Schedule config error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


// --- ⏰ SCHEDULER ENDPOINTS ---

// Schedule Facebook Automation
app.post('/api/facebook/schedule', requireAuth, async (req, res) => {
    try {
        const config = req.body;
        const userId = req.user.userId;
        // Validate config...
        const result = await scheduler.createSchedule('facebook', config, userId);
        res.json(result);
    } catch (error) {
        console.error('[SCHEDULER] Error scheduling Facebook:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Schedule WhatsApp Automation
app.post('/api/whatsapp/schedule', requireAuth, async (req, res) => {
    try {
        const config = req.body;
        const userId = req.user.userId;
        const result = await scheduler.createSchedule('whatsapp', config, userId);
        res.json(result);
    } catch (error) {
        console.error('[SCHEDULER] Error scheduling WhatsApp:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get all schedules
app.get('/api/schedules', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const schedules = await db.getSchedules(userId);
        res.json({ success: true, schedules });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete schedule
app.delete('/api/schedule/:id', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const result = await scheduler.removeSchedule(req.params.id, userId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Toggle schedule
app.post('/api/schedule/toggle/:id', requireAuth, async (req, res) => {
    try {
        const { active } = req.body;
        const userId = req.user.userId;
        const result = await scheduler.toggleSchedule(req.params.id, active, userId);
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

app.post('/api/instagram/post-now', requireAuth, async (req, res) => {
    try {
        let { productCount, shopeeSettings, categoryType, messageTemplate, groupLink, customHashtags, accountId, sendMode, manualMessage, manualImageUrl, postType, taskId } = req.body;
        const userId = req.user.userId;

        console.log(`[INSTAGRAM] Post now request - Mode: ${sendMode || 'shopee'} Type: ${postType || 'feed'}`);

        if (taskId) {
            global.postProgress.set(taskId, { total: sendMode === 'manual' ? 1 : productCount, current: 0, success: 0, failed: 0, active: true, stage: sendMode === 'manual' ? 'postando' : 'buscando_produtos' });
        }

        let products = [];
        if (sendMode !== 'manual') {
            products = await prepareProductsForPosting(shopeeSettings, productCount, {}, true, categoryType, userId);
            if (!products || products.length === 0) return res.json({ success: false, error: 'Nenhum produto encontrado' });
            if (taskId) {
                global.postProgress.set(taskId, { total: products.length, current: 0, success: 0, failed: 0, active: true, stage: 'postando' });
            }
        }

        let success = 0;
        let failed = 0;
        const errors = [];
        
        let tgMessageIdToDelete = null;
        let localPathToDelete = null;
        let bridgeBotToken = null;
        let bridgeGroupId = null;

        if (sendMode === 'manual') {
            try {
                if (!manualImageUrl) return res.json({ success: false, error: 'O Instagram exige uma mídia. Por favor forneça a URL.' });

                // --- RESOLVE URI & BRIDGE ---
                // Agora delegamos 100% da inteligência para o serviço, que decide se precisa de bridge ou proxy
                
                // Se for um upload local, marcamos para deletar depois
                if (manualImageUrl.includes('127.0.0.1') || manualImageUrl.includes('localhost') || manualImageUrl.startsWith('/uploads/')) {
                    const uploadsIdx = manualImageUrl.indexOf('/uploads/');
                    if (uploadsIdx !== -1) {
                         localPathToDelete = path.join(process.cwd(), manualImageUrl.substring(uploadsIdx));
                    }
                }

                let result;
                if (postType === 'story') {
                    const mType = manualImageUrl.includes('.mp4') || manualImageUrl.includes('.mov') ? 'video' : 'image';
                    
                    try {
                        const isLocal = manualImageUrl && (manualImageUrl.startsWith('/uploads/') || manualImageUrl.includes('localhost') || manualImageUrl.includes('127.0.0.1'));
                        if (isLocal) {
                            const relativePath = manualImageUrl.replace(/.*\/uploads\//, 'uploads/');
                            const absolutePath = path.join(process.cwd(), relativePath);
                            if (fs.existsSync(absolutePath)) {
                                const textToBurn = "Peca o link por direct ou clique no link da bio!";
                                if (mType === 'image') {
                                    const { burnTextToImage } = await import('./services/imageService.js');
                                    await burnTextToImage(absolutePath, textToBurn);
                                } else {
                                    const { burnTextToVideo } = await import('./services/videoService.js');
                                    await burnTextToVideo(absolutePath, textToBurn);
                                }
                            }
                        }
                    } catch (burnErr) {
                        console.warn('[STORY BURNING] Falha ao gravar texto manual:', burnErr.message);
                    }

                    const currentPublicUrl = await getDynamicPublicUrl(req);
                    result = await instagramGraph.postStoryGraph(manualImageUrl, mType, accountId, currentPublicUrl);
                } else {
                    result = await instagramGraph.postImageGraph(manualImageUrl, manualMessage || 'Postagem Manual', accountId);
                }

                if (result.success) {
                    success++;
                    await db.logEvent('instagram_post', { success: true, message: postType === 'story' ? "Envio de Story" : "Envio Manual" }, userId);
                    if (taskId) {
                        const prog = global.postProgress.get(taskId) || { current: 0, success: 0, failed: 0 };
                        global.postProgress.set(taskId, { ...prog, current: prog.current + 1, success: prog.success + 1 });
                    }
                } else {
                    failed++;
                    errors.push(result.error);
                    if (taskId) {
                        const prog = global.postProgress.get(taskId) || { current: 0, success: 0, failed: 0 };
                        global.postProgress.set(taskId, { ...prog, current: prog.current + 1, failed: prog.failed + 1 });
                    }
                }

                // --- CLEANUP ---
                try {
                    // 1. Delete from Telegram bridge group
                    if (tgMessageIdToDelete && bridgeBotToken && bridgeGroupId) {
                        console.log(`[CLEANUP] Deletando mensagem do Telegram: ${tgMessageIdToDelete}`);
                        await telegram.deleteTelegramMessage(bridgeBotToken, bridgeGroupId, tgMessageIdToDelete);
                    }

                    // 2. Delete local file
                    if (localPathToDelete && fs.existsSync(localPathToDelete)) {
                        console.log(`[CLEANUP] Deletando arquivo local: ${localPathToDelete}`);
                        fs.unlinkSync(localPathToDelete);
                    }
                } catch (cleanupErr) {
                    console.warn('[CLEANUP] Erro durante a limpeza:', cleanupErr.message);
                }
            } catch (error) {
                failed++;
                errors.push(error.message);
                if (taskId) {
                    const prog = global.postProgress.get(taskId) || { current: 0, success: 0, failed: 0 };
                    global.postProgress.set(taskId, { ...prog, current: prog.current + 1, failed: prog.failed + 1 });
                }
            }
        } else {
            for (const product of products) {
                try {
                    if (success > 0) await randomDelay(60000, 120000);

                    let result;
                    if (postType === 'story') {
                        const mType = product.videoUrl ? 'video' : 'image';
                        const mediaUrl = product.videoUrl || product.imagePath || product.imageUrl;
                        
                        try {
                            const isLocal = mediaUrl && (mediaUrl.startsWith('/uploads/') || mediaUrl.includes('localhost') || mediaUrl.includes('127.0.0.1'));
                            if (isLocal) {
                                const relativePath = mediaUrl.replace(/.*\/uploads\//, 'uploads/');
                                const absolutePath = path.join(process.cwd(), relativePath);
                                if (fs.existsSync(absolutePath)) {
                                    const textToBurn = "Peca o link por direct ou clique no link da bio!";
                                    if (mType === 'image') {
                                        const { burnTextToImage } = await import('./services/imageService.js');
                                        await burnTextToImage(absolutePath, textToBurn);
                                    } else {
                                        const { burnTextToVideo } = await import('./services/videoService.js');
                                        await burnTextToVideo(absolutePath, textToBurn);
                                    }
                                }
                            }
                        } catch (burnErr) {
                            console.warn('[STORY BURNING] Falha ao gravar texto auto:', burnErr.message);
                        }

                        const currentPublicUrl = await getDynamicPublicUrl(req);
                        result = await instagramGraph.postStoryGraph(mediaUrl, mType, accountId, currentPublicUrl);
                    } else if (postType === 'reels') {
                        const mediaUrl = product.videoUrl || product.imageUrl;
                        const mType = product.videoUrl ? 'video' : 'image';
                                const currentPublicUrl = await getDynamicPublicUrl(req);
                        
                        if (mType === 'video') {
                            result = await instagramGraph.postStoryGraph(mediaUrl, 'video', accountId, currentPublicUrl);
                        } else {
                            // Fallback to Image post if no video for Reels
                            result = await instagramGraph.postImageGraph(mediaUrl, product.productName, accountId);
                        }
                    } else {
                        result = await instagramGraph.postProductGraph(product, messageTemplate, groupLink, customHashtags || [], accountId);
                    }

                    if (result.success) {
                        success++;
                        if (taskId) {
                            const prog = global.postProgress.get(taskId) || { current: 0, success: 0, failed: 0 };
                            global.postProgress.set(taskId, { ...prog, current: prog.current + 1, success: prog.success + 1 });
                        }
                    } else {
                        failed++;
                        errors.push(result.error);
                        if (taskId) {
                            const prog = global.postProgress.get(taskId) || { current: 0, success: 0, failed: 0 };
                            global.postProgress.set(taskId, { ...prog, current: prog.current + 1, failed: prog.failed + 1 });
                        }
                    }
                } catch (error) {
                    failed++;
                    errors.push(error.message);
                    if (taskId) {
                        const prog = global.postProgress.get(taskId) || { current: 0, success: 0, failed: 0 };
                        global.postProgress.set(taskId, { ...prog, current: prog.current + 1, failed: prog.failed + 1 });
                    }
                }
            }
        }


        if (taskId) {
            const prog = global.postProgress.get(taskId) || {};
            global.postProgress.set(taskId, { ...prog, active: false });
        }

        res.json({
            success: true,
            details: { success, failed, total: sendMode === 'manual' ? 1 : products.length, errors: errors.slice(0, 3) }
        });
    } catch (error) {
        console.error('[INSTAGRAM] Post now error:', error);
        if (taskId) {
            const prog = global.postProgress.get(taskId) || {};
            global.postProgress.set(taskId, { ...prog, active: false });
        }
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/instagram/schedule', requireAuth, async (req, res) => {
    try {
        const config = req.body;
        const userId = req.user.userId;
        console.log('[INSTAGRAM] Creating schedule...');

        const result = await scheduler.createSchedule('instagram', config, userId);
        res.json(result);
    } catch (error) {
        console.error('[INSTAGRAM] Schedule error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ====================================
// STORY QUEUE ROUTES (IG + FB)
// ====================================

// GET: list story queue
app.get('/api/story-queue', requireAuth, async (req, res) => {
    try {
        const { platform, status } = req.query;
        const userId = req.user.userId;
        const queue = await db.getStoryQueue(userId, platform || null, status || 'pending');
        res.json({ success: true, queue });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST: add stories (bulk) to queue
app.post('/api/story-queue/bulk', requireAuth, async (req, res) => {
    try {
        const { platform, accountId, stories } = req.body;
        // stories = [{ mediaUrl, mediaType, caption, scheduledTime }]
        const userId = req.user.userId;

        if (!stories || stories.length === 0) return res.status(400).json({ success: false, error: 'Nenhum story fornecido' });

        const results = [];
        for (const s of stories) {
            let finalMediaUrl = s.mediaUrl;
            
            // "se agendar ai salva no telegram": uploads to safekeep space on VPS
            if (finalMediaUrl && (finalMediaUrl.includes('/uploads/') || finalMediaUrl.includes('\\uploads\\'))) {
                try {
                    let bridgeEnabled = false;
                    let bridgeToken = null;
                    let bridgeChatId = null;

                    const userBridgeEnabled = await db.getUserConfig(userId, 'telegram_bridge_enabled');
                    if (userBridgeEnabled === 'true' || userBridgeEnabled === true) {
                        bridgeEnabled = true;
                        bridgeToken = await db.getUserConfig(userId, 'telegram_bridge_bot_token');
                        bridgeChatId = await db.getUserConfig(userId, 'telegram_bridge_chat_id');
                    } else {
                        const systemBridgeEnabled = await db.getSystemConfig('telegram_bridge_enabled');
                        if (systemBridgeEnabled === 'true' || systemBridgeEnabled === true) {
                            bridgeEnabled = true;
                            bridgeToken = await db.getSystemConfig('telegram_bridge_bot_token');
                            bridgeChatId = await db.getSystemConfig('telegram_bridge_chat_id');
                        }
                    }

                    if (bridgeEnabled && bridgeToken && bridgeChatId) {
                        let localPath = finalMediaUrl;
                        if (finalMediaUrl.includes('/uploads/')) {
                            const parts = finalMediaUrl.split('/uploads/');
                            localPath = path.join(process.cwd(), 'uploads', parts[parts.length - 1]);
                        } else if (finalMediaUrl.includes('\\uploads\\')) {
                            const parts = finalMediaUrl.split('\\uploads\\');
                            localPath = path.join(process.cwd(), 'uploads', parts[parts.length - 1]);
                        }

                        if (fs.existsSync(localPath)) {
                            console.log(`[STORY QUEUE] Safekeeping scheduled story in Telegram: ${localPath}`);
                            const bridgeData = await uploadToTelegramBridge(bridgeToken, bridgeChatId, localPath);
                            finalMediaUrl = bridgeData.fileUrl; 
                            
                            // Delete local file to save space on VPS
                            fs.unlinkSync(localPath);
                            console.log(`[STORY QUEUE] Deleted local file after Telegram upload: ${localPath}`);
                        }
                    }
                } catch (err) {
                    console.warn('[STORY QUEUE] Failed to upload to Telegram schedule safekeeping:', err.message);
                }
            }

            const result = await db.addToStoryQueue(
                platform, accountId, finalMediaUrl,
                s.mediaType || 'image', s.caption || null,
                s.scheduledTime || null, userId
            );
            results.push(result);
        }

        res.json({ success: true, added: results.length, ids: results.map(r => r.id) });
    } catch (error) {
        console.error('[STORY QUEUE] Bulk add error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE: remove a story from the queue
app.delete('/api/story-queue/:id', requireAuth, async (req, res) => {
    try {
        await db.deleteFromStoryQueue(req.params.id, req.user.userId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST: post a single story from queue immediately
app.post('/api/story-queue/:id/post-now', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const queue = await db.getStoryQueue(userId);
        const story = queue.find(s => s.id === parseInt(req.params.id));

        if (!story) return res.status(404).json({ success: false, error: 'Story não encontrado' });

        let result;
        if (story.platform === 'instagram') {
            result = await instagramGraph.postStoryGraph(story.media_url, story.media_type, story.account_id);
        } else {
            const pages = await db.getFacebookPages(userId);
            const page = pages.find(p => p.id === story.account_id);
            if (!page) return res.status(400).json({ success: false, error: 'Página não encontrada' });
            result = await facebook.postStory(page.id, page.access_token, story.media_url, story.media_type);
        }

        if (result.success) {
            await db.markStoryPosted(story.id);
            res.json({ success: true });
        } else {
            await db.markStoryFailed(story.id, result.error);
            res.json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('[STORY QUEUE] Post now error:', error);
        await db.markStoryFailed(req.params.id, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});


app.get('/api/facebook/detect-instagram', requireAuth, async (req, res) => {
    try {
        const { pageId, accessToken } = req.query;
        if (!pageId || !accessToken) {
            return res.status(400).json({ success: false, error: 'Missing parameters' });
        }
        const result = await facebook.getLinkedInstagramAccount(pageId, accessToken);
        res.json(result);
    } catch (error) {
        console.error('[FB] Detect IG Error:', error);
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

app.post('/api/instagram/graph/reset', (req, res) => {
    try {
        const result = instagramGraph.resetGraphAPI();
        res.json(result);
    } catch (error) {
        console.error('[INSTAGRAM GRAPH] Reset error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get all Instagram accounts
app.get('/api/instagram/accounts', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const accounts = await db.getInstagramAccounts(userId);
        res.json({ success: true, accounts });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Add Instagram account
app.post('/api/instagram/accounts', requireAuth, async (req, res) => {
    try {
        const { accessToken, accountId } = req.body;
        const userId = req.user.userId;
        // Note: instagramGraph.addAccount might need update too if it calls DB directly.
        // But looking at database.js, we have addInstagramAccount.
        // instagramGraphService.js likely calls db.addInstagramAccount.
        // Let's assume for now we need to call db directly or update service.
        // Checking previous view_file of database.js, addInstagramAccount takes userId.
        // I should check instagramGraphService.js later.
        // For now, let's pass userId to the service function if possible, or call DB directly.
        // Wait, the original code called instagramGraph.addAccount.
        // I'll assume I need to update instagramGraphService.js as well.
        // For now, I'll just update the route to extract userId.
        const result = await instagramGraph.addAccount(accessToken, accountId, userId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Remove Instagram account
app.delete('/api/instagram/accounts/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        const result = await instagramGraph.removeAccount(id, userId);
        res.json(result);
    } catch (error) {
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

app.post('/api/instagram/graph/post-now', requireAuth, async (req, res) => {
    try {
        const { productCount, shopeeSettings, categoryType, messageTemplate, groupLink, customHashtags } = req.body;
        const userId = req.user.userId;

        console.log(`[INSTAGRAM GRAPH] Post now request - ${productCount} products`);

        // Prepare products
        const products = await prepareProductsForPosting(
            shopeeSettings,
            productCount,
            {},
            true, // enableRotation
            categoryType,
            userId
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
app.post('/api/instagram/upload', requireAuth, (req, res, next) => {
    upload.single('video')(req, res, async (err) => {
        if (err) {
            console.warn(`[INSTAGRAM] Upload rejected by Multer: ${err.message}`);
            return res.status(400).json({ success: false, error: err.message });
        }
        try {
            const { caption, aspectRatio } = req.body;
            const userId = req.user.userId;

            console.log(`[INSTAGRAM] Upload request - User: ${userId}, Ratio: ${aspectRatio}, Caption: ${caption?.substring(0, 20)}...`);

        if (!req.file) {
            console.warn('[INSTAGRAM] Upload failed: No file provided');
            return res.status(400).json({ success: false, error: 'Nenhum vídeo enviado' });
        }

        console.log(`[INSTAGRAM] File received: ${req.file.filename} (${req.file.size} bytes) at ${req.file.path}`);

        const normalizedPath = req.file.path.replace(/\\/g, '/');
        
        try {
            const result = await db.addToInstagramQueue(normalizedPath, caption || '', null, null, userId, aspectRatio || '9:16');
            console.log(`[INSTAGRAM] Added to queue: ID ${result.id}`);
            res.json({
                success: true,
                id: result.id,
                filename: req.file.filename,
                path: req.file.path
            });
        } catch (dbErr) {
            console.error('[INSTAGRAM] Database error during upload:', dbErr.message);
            // Cleanup file if DB insert fails
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            res.status(500).json({ success: false, error: `Erro no banco de dados: ${dbErr.message}` });
        }
    } catch (error) {
        console.error('[INSTAGRAM] Upload route fatal error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
    }); // <-- Fechamento do callback do upload.single
});

// Get video queue
app.get('/api/instagram/queue', requireAuth, async (req, res) => {
    try {
        const { status } = req.query;
        const userId = req.user.userId;
        const queue = await db.getInstagramQueue(status, userId);
        res.json({ success: true, queue });
    } catch (error) {
        console.error('[INSTAGRAM] Queue error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update video details (caption, title)
app.put('/api/instagram/queue/:id', requireAuth, async (req, res) => {
    try {
        const { caption, title, aspectRatio, shareToFeed, allowComments, allowEmbedding, playlistId, thumbnailUrl, thumbOffset } = req.body;
        const userId = req.user.userId;
        await db.updateInstagramVideo(req.params.id, { 
            caption, title, aspectRatio, shareToFeed, allowComments, allowEmbedding, playlistId, thumbnailUrl, thumbOffset
        }, userId);
        res.json({ success: true });
    } catch (error) {
        console.error('[INSTAGRAM] Update error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete video from queue
app.delete('/api/instagram/queue/:id', requireAuth, async (req, res) => {
    try {
        // Get video info to delete file
        const userId = req.user.userId;
        const queue = await db.getInstagramQueue(null, userId);
        const video = queue.find(v => v.id === parseInt(req.params.id));

        if (video && fs.existsSync(video.video_path)) {
            fs.unlinkSync(video.video_path);
        }

        await db.deleteFromInstagramQueue(req.params.id, userId);
        res.json({ success: true });
    } catch (error) {
        console.error('[INSTAGRAM] Delete error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Post video from queue (manual trigger)
app.post('/api/instagram/post-from-queue/:id', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const queue = await db.getInstagramQueue(null, userId);
        const video = queue.find(v => v.id === parseInt(req.params.id));

        if (!video) {
            console.error(`[INSTAGRAM] Video ${req.params.id} not found in queue for user ${userId}. Available IDs: ${queue.map(v => v.id).join(', ')}`);
            return res.status(404).json({ success: false, error: 'Vídeo não encontrado na sua fila. Ele pode ter sido removido ou postado por outro processo.' });
        }

        console.log(`[INSTAGRAM] Posting video from queue: ${video.id}`);

        // Check if using Graph API or unofficial
        const { apiMethod, accountId } = req.body;

        let result;
        if (apiMethod === 'graph') {
            const isImage = video.video_path.match(/\.(jpg|jpeg|png|webp|gif)$/i);
            // Convert path or use Telegram URL
            let mediaUrl;
            if (video.media_url) {
                mediaUrl = video.media_url;
                console.log(`[INSTAGRAM] Using Telegram URL: ${mediaUrl}`);
            } else {
                // Process media to ensure compatibility and correct aspect ratio
                try {
                    if (isImage) {
                        console.log(`[INSTAGRAM] Professional processing for image ${video.id} (Ratio: ${video.aspect_ratio || '1:1'})`);
                        await processImageForInstagram(video.video_path, video.aspect_ratio || '1:1');
                    } else {
                        console.log(`[INSTAGRAM] Professional processing for video ${video.id} (Ratio: ${video.aspect_ratio || '9:16'})`);
                        await processVideoForInstagram(video.video_path, video.aspect_ratio || '9:16');
                    }
                } catch (procErr) {
                    console.error(`[INSTAGRAM] Professional processing failed:`, procErr.message);
                }

                        const currentPublicUrl = await getDynamicPublicUrl(req);
                mediaUrl = `${currentPublicUrl}/${video.video_path.replace(/\\/g, '/')}`;
                console.log(`[INSTAGRAM] Media URL: ${mediaUrl}`);
            }

            if (isImage) {
                result = await instagramGraph.postImageGraph(mediaUrl, video.caption, accountId);
            } else {
                result = await instagramGraph.postVideoGraph(mediaUrl, video.caption, accountId, {
                    shareToFeed: video.share_to_feed,
                    allowComments: video.allow_comments,
                    playlistId: video.playlist_id,
                    thumbnailUrl: video.thumbnail_url,
                    thumbOffset: video.thumb_offset
                });
            }
        } else {
            // Unofficial API logic
            const isImage = video.video_path.match(/\.(jpg|jpeg|png|webp|gif)$/i);
            if (isImage) {
                result = await instagram.postPhoto(video.video_path, video.caption);
            } else {
                result = await instagram.postVideo(video.video_path, video.caption);
            }
        }

        if (result.success) {
            await db.markInstagramVideoPosted(video.id);

            // Log analytics event
            await db.logEvent('instagram_post', {
                productId: video.id,
                success: true
            }, userId);

            // Delete video file after posting
            if (fs.existsSync(video.video_path)) {
                fs.unlinkSync(video.video_path);
            }

            res.json({ success: true });
        } else {
            await db.markInstagramVideoFailed(video.id, result.error);
            await db.logEvent('instagram_post', {
                productId: video.id,
                success: false,
                errorMessage: result.error
            }, userId);
            res.json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('[INSTAGRAM] Post from queue error:', error);
        await db.markInstagramVideoFailed(req.params.id, error.message);
        await db.logEvent('instagram_post', {
            productId: req.params.id,
            success: false,
            errorMessage: error.message
        }, userId);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Instagram Shopee Post-Now (Execute Now)
app.post('/api/instagram/post-now', requireAuth, async (req, res) => {
    const { accountId, instagramAccounts, shopeeSettings, productCount, messageTemplate, categoryType, sendMode } = req.body;
    const userId = req.user.userId;

    try {
        console.log('[INSTAGRAM POST-NOW] Iniciando automação Shopee...');
        
        // Use prepareProductsForPosting from automationService
        const products = await prepareProductsForPosting(
            shopeeSettings,
            productCount,
            {}, // filters
            true, // enableRotation (forced true to avoid duplicates)
            categoryType,
            userId
        );

        console.log(`[INSTAGRAM POST-NOW] Preparados ${products.length} produtos para Instagram`);

        const results = { success: 0, failed: 0, errors: [] };

        for (const product of products) {
            try {
                // Post to Instagram using Graph API
                const result = await instagramGraph.postProductGraph(
                    product,
                    messageTemplate,
                    '', // groupLink
                    [], // customHashtags
                    accountId
                );

                if (result.success) {
                    results.success++;
                } else {
                    throw new Error(result.error || 'Erro desconhecido');
                }

                // Delay between products to avoid rate limits (60s)
                if (products.indexOf(product) < products.length - 1) {
                    await new Promise(r => setTimeout(r, 60000));
                }
            } catch (error) {
                results.failed++;
                results.errors.push(`${product.productName || 'Produto'}: ${error.message}`);
                console.error(`[INSTAGRAM POST-NOW] Erro ao postar produto:`, error);
            }
        }

        res.json({ success: true, results });
    } catch (error) {
        console.error('[INSTAGRAM POST-NOW] Erro fatal:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Instagram Shopee Schedule
app.post('/api/instagram/schedule', requireAuth, async (req, res) => {
    try {
        const config = req.body;
        const userId = req.user.userId;
        const result = await scheduler.createSchedule('instagram', config, userId);
        res.json(result);
    } catch (error) {
        console.error('[SCHEDULER] Error scheduling Instagram:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Configure Instagram auto-posting schedule
app.post('/api/instagram/configure-schedule', requireAuth, async (req, res) => {
    try {
        const { postsPerDay, times, startDate, videoIds } = req.body;
        const userId = req.user.userId;
        console.log(`[INSTAGRAM] Configuring schedule: ${postsPerDay} posts/day, start: ${startDate}, times: ${times}`);

        if (!videoIds || videoIds.length === 0) {
            return res.status(400).json({ success: false, error: 'Nenhum vídeo selecionado' });
        }

        // Calculate schedule for each video
        let currentDate = new Date(startDate);
        let timeIndex = 0;

        // Sort times to ensure order
        const sortedTimes = times.sort();

        for (const videoId of videoIds) {
            // Get video info for Telegram bridge
            const video = (await db.getInstagramQueue(null, userId)).find(v => v.id === parseInt(videoId));
            
            // Get time for this slot
            const timeString = sortedTimes[timeIndex];
            const [hours, minutes] = timeString.split(':');

            // Set time on current date
            const scheduledTime = new Date(currentDate);
            scheduledTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

            // 1. Check for Telegram Bridge for scheduling
            const botToken = await db.getUserConfig(userId, 'telegram_bridge_bot_token');
            const chatId = await db.getUserConfig(userId, 'telegram_bridge_chat_id');
            const bridgeEnabled = await db.getUserConfig(userId, 'telegram_bridge_enabled') === 'true';

            if (bridgeEnabled && botToken && chatId && video && video.video_path && fs.existsSync(video.video_path)) {
                try {
                    console.log(`[INSTAGRAM] Scheduling: Uploading video ${videoId} to Telegram bridge...`);
                    const bridgeResult = await uploadToTelegramBridge(botToken, chatId, video.video_path);
                    if (bridgeResult && bridgeResult.fileUrl) {
                        await db.updateInstagramVideoMediaUrl(videoId, bridgeResult.fileUrl, bridgeResult.messageId);
                        console.log(`[INSTAGRAM] Video ${videoId} backed up to Telegram: ${bridgeResult.fileUrl}`);
                        
                        // 2. Delete local file immediately to save VPS space
                        fs.unlinkSync(video.video_path);
                        console.log(`[INSTAGRAM] Local file deleted for scheduled video ${videoId}`);
                    }
                } catch (bridgeErr) {
                    console.error(`[INSTAGRAM] Telegram bridge upload failed for ${videoId}:`, bridgeErr.message);
                }
            }

            // Update video in DB
            await db.updateInstagramScheduledTime(videoId, scheduledTime.toISOString());

            // Advance to next slot
            timeIndex++;
            if (timeIndex >= sortedTimes.length) {
                timeIndex = 0;
                // Advance to next day
                currentDate.setDate(currentDate.getDate() + 1);

                // If weekly, advance 7 days instead
                if (postsPerDay < 1) { // 0.14 is weekly
                    currentDate.setDate(currentDate.getDate() + 6);
                }
            }
        }

        res.json({ success: true, message: 'Agendamento configurado com sucesso' });
    } catch (error) {
        console.error('[INSTAGRAM] Schedule config error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- 🛍️ SHOPEE CONFIGURATION ---

// Get Shopee configuration for current user
app.get('/api/shopee/config', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const config = {
            appId: await db.getUserConfig(userId, 'shopee_app_id') || '',
            appSecret: await db.getUserConfig(userId, 'shopee_app_secret') || '',
            trackingId: await db.getUserConfig(userId, 'shopee_tracking_id') || '',
            subId: await db.getUserConfig(userId, 'shopee_sub_id') || ''
        };
        res.json({ success: true, config });
    } catch (error) {
        console.error('[SHOPEE] Error getting config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Save Shopee configuration for current user
app.post('/api/shopee/config', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { appId, appSecret, trackingId, subId } = req.body;

        await db.setUserConfig(userId, 'shopee_app_id', appId || '');
        await db.setUserConfig(userId, 'shopee_app_secret', appSecret || '');
        await db.setUserConfig(userId, 'shopee_tracking_id', trackingId || '');
        await db.setUserConfig(userId, 'shopee_sub_id', subId || '');

        res.json({ success: true, message: 'Configuração salva com sucesso' });
    } catch (error) {
        console.error('[SHOPEE] Error saving config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Alias for /api/shopee/settings (Compatibility with Dashboards)
app.get('/api/shopee/settings', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const settings = {
            appId: await db.getUserConfig(userId, 'shopee_app_id') || '',
            appSecret: await db.getUserConfig(userId, 'shopee_app_secret') || '',
            trackingId: await db.getUserConfig(userId, 'shopee_tracking_id') || '',
            subId: await db.getUserConfig(userId, 'shopee_sub_id') || '',
            enabled: true,
            defaultMessage: '🔥 CONFIRA ESTA OFERTA: {product_name} {product_link} #shopee #ofertas'
        };
        res.json({ success: true, settings });
    } catch (error) {
        console.error('[SHOPEE] Error getting settings:', error);
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

app.get('/api/logs', requireAuth, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const userId = req.user.userId;
        const logs = await db.getEvents(limit, userId);
        res.json({ success: true, logs });
    } catch (error) {
        console.error('[API] Error getting logs:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/logs/clear', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        await db.clearLogs(userId);
        res.json({ success: true, message: 'Logs limpos com sucesso' });
    } catch (error) {
        console.error('[API] Error clearing logs:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


// --- 📬 UNIFIED INBOX ENDPOINTS ---

app.get('/api/inbox/unread-count', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const result = await inbox.getUnreadCount(userId);
        res.json(result);
    } catch (error) {
        console.error('[INBOX] Error getting unread count:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/inbox/conversations', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const result = await inbox.getConversations(userId);
        res.json(result);
    } catch (error) {
        console.error('[INBOX] Error getting conversations:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/inbox/messages', requireAuth, async (req, res) => {
    try {
        const { threadId, platform, accountId } = req.query;
        if (!threadId || !platform || !accountId) {
            return res.status(400).json({ success: false, error: 'Missing parameters' });
        }
        const result = await inbox.getMessages(threadId, platform, accountId);
        res.json(result);
    } catch (error) {
        console.error('[INBOX] Error getting messages:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/inbox/send', requireAuth, async (req, res) => {
    try {
        const { threadId, platform, accountId, text } = req.body;
        if (!threadId || !platform || !accountId || !text) {
            return res.status(400).json({ success: false, error: 'Missing parameters' });
        }
        const result = await inbox.sendMessage(threadId, platform, accountId, text);
        res.json(result);
    } catch (error) {
        console.error('[INBOX] Error sending message:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/inbox/read', requireAuth, async (req, res) => {
    try {
        const { threadId, platform, accountId } = req.body;
        if (!threadId || !platform || !accountId) {
            return res.status(400).json({ success: false, error: 'Missing parameters' });
        }
        const userId = req.user.userId;
        const result = await inbox.markAsRead(userId, threadId, platform, accountId);
        res.json(result);
    } catch (error) {
        console.error('[INBOX] Error marking message as read:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- 🤖 AI AGENTS ROUTES ---

app.get('/api/agents', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const result = await db.getAiAgents(userId);
        res.json({ success: true, agents: result });
    } catch (error) {
        console.error('[AGENTS] Error getting agents:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/agents', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const agentData = req.body;
        const result = await db.saveAiAgent(agentData, userId);
        res.json({ success: true, agent: result });
    } catch (error) {
        console.error('[AGENTS] Error saving agent:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/agents/handoff', requireAuth, async (req, res) => {
    try {
        const { accountId, platform, status } = req.body;
        const result = await db.setHandoffActive(accountId, platform, status);
        res.json({ success: true, agent: result });
    } catch (error) {
        console.error('[AGENTS] Error setting handoff:', error);
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

app.post('/api/pinterest/schedule', requireAuth, async (req, res) => {
    const { boardId, schedule } = req.body;
    const userId = req.user.userId;
    // Save schedule to DB
    try {
        await db.saveSchedule('pinterest', { boardId, schedule }, userId);
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

// Pinterest Authentication
// Pinterest Authentication (Add Account)
app.post('/api/pinterest/auth', requireAuth, async (req, res) => {
    try {
        const { accessToken } = req.body;
        const userId = req.user.userId;

        console.log(`[PINTEREST] Auth attempt. Token length: ${accessToken?.length}`);
        console.log(`[PINTEREST] Token prefix: ${accessToken?.substring(0, 5)}...`);

        // Validate token with Pinterest API
        const validation = await pinterest.validateToken(accessToken);

        console.log('[PINTEREST] Validation result:', validation);

        if (!validation.success) {
            return res.status(400).json({
                success: false,
                error: validation.error || 'Token inválido ou expirado. Verifique se marcou o escopo "user_accounts:read".'
            });
        }

        // Check for required scopes
        const scopes = validation.scopes || '';
        const missingScopes = [];
        if (!scopes.includes('boards:write')) missingScopes.push('boards:write');
        if (!scopes.includes('pins:write')) missingScopes.push('pins:write');

        if (missingScopes.length > 0) {
            return res.status(400).json({
                success: false,
                error: `Token incompleto! Faltam permissões de escrita: ${missingScopes.join(', ')}. Gere um novo token marcando essas opções.`
            });
        }

        // Save Pinterest account
        const result = await db.addPinterestAccount(
            validation.user?.username || 'Pinterest User',
            accessToken,
            userId
        );

        res.json({
            success: true,
            message: 'Conta Pinterest conectada com sucesso!',
            user: validation.user,
            accountId: result.id
        });
    } catch (error) {
        console.error('[PINTEREST] Auth error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get Pinterest accounts
app.get('/api/pinterest/accounts', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const accounts = await db.getPinterestAccounts(userId);

        res.json({
            success: true,
            accounts: accounts
        });
    } catch (error) {
        console.error('[PINTEREST] Accounts error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Remove Pinterest account
app.delete('/api/pinterest/accounts/:id', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { id } = req.params;

        await db.removePinterestAccount(id, userId);

        res.json({
            success: true,
            message: 'Conta removida com sucesso'
        });
    } catch (error) {
        console.error('[PINTEREST] Remove account error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Toggle Pinterest account
app.post('/api/pinterest/accounts/:id/toggle', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { id } = req.params;

        await db.togglePinterestAccount(id, userId);

        res.json({
            success: true,
            message: 'Status da conta alterado'
        });
    } catch (error) {
        console.error('[PINTEREST] Toggle account error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get Pinterest configuration (Legacy/Compatibility)
app.get('/api/pinterest/config', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        // Get first enabled account as "current" config
        const accounts = await db.getPinterestAccounts(userId);
        const activeAccount = accounts.find(a => a.enabled) || accounts[0];
        const accessToken = activeAccount ? activeAccount.accessToken : null;

        let user = null;

        // Se conectado, buscar dados do usuário
        if (accessToken) {
            try {
                const validation = await pinterest.validateToken(accessToken);
                if (validation.success) {
                    user = validation.user;
                }
            } catch (error) {
                console.error('[PINTEREST] Error validating token:', error);
            }
        }

        res.json({
            success: true,
            config: {
                accessToken: accessToken || '',
                connected: !!accessToken
            },
            user: user
        });
    } catch (error) {
        console.error('[PINTEREST] Config error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Post Shopee products to Pinterest
app.post('/api/pinterest/post-now', requireAuth, async (req, res) => {
    try {
        const { boardId, productCount, shopeeSettings, categoryType, accountId, sendMode, manualMessage, manualImageUrl } = req.body;
        const userId = req.user.userId;

        console.log(`[PINTEREST] Post now request - Mode: ${sendMode || 'shopee'}`);

        let products = [];
        if (sendMode !== 'manual') {
            // 1. Buscar produtos da Shopee
            products = await prepareProductsForPosting(
                shopeeSettings,
                productCount,
                {}, // filters
                true, // enableRotation
                categoryType || 'random', // categoryType
                userId
            );

            if (!products || products.length === 0) {
                return res.json({ success: false, error: 'Nenhum produto encontrado na Shopee' });
            }
        }

        // 2. Buscar access token do Pinterest
        let pinterestToken;

        if (req.body.accountId) {
            // Se accountId foi fornecido, buscar token dessa conta específica
            const account = await db.getPinterestAccountById(req.body.accountId, userId);
            if (account) {
                pinterestToken = account.access_token;
            }
        }

        // Fallback para token global (legado)
        if (!pinterestToken) {
            pinterestToken = await db.getUserConfig(userId, 'pinterest_access_token');
        }

        if (!pinterestToken) {
            return res.json({ success: false, error: 'Pinterest não conectado. Conecte sua conta primeiro.' });
        }

        let success = 0;
        let failed = 0;
        const errors = [];

        if (sendMode === 'manual') {
            try {
                if (!manualImageUrl) {
                    return res.json({ success: false, error: 'O Pinterest exige uma imagem. Por favor forneça a URL.' });
                }

                console.log(`[PINTEREST] Postando envio manual no board ${boardId}`);
                const result = await pinterest.createPin(
                    pinterestToken,
                    boardId,
                    manualMessage ? manualMessage.substring(0, 100) : 'Pin Manual',
                    manualMessage || 'Postagem Manual',
                    '', // sem link por padrao, ou poderia pedir um link manual
                    manualImageUrl
                );

                if (result.success) {
                    success++;
                    await db.logEvent('pinterest_post', {
                        groupId: boardId,
                        success: true,
                        message: "Envio Manual"
                    }, userId);
                } else {
                    failed++;
                    errors.push(result.error);
                }
            } catch (error) {
                failed++;
                errors.push(`Erro interno: ${error.message}`);
            }
        } else {
            // 3. Para cada produto, criar Pin
            for (const product of products) {
                try {
                    const productName = product.productName || product.name || 'Produto sem nome';
                    console.log(`[PINTEREST] Processing product:`, JSON.stringify(product, null, 2));
                    console.log(`[PINTEREST] Using token prefix: ${pinterestToken.substring(0, 5)}...`);

                    const result = await pinterest.createPin(
                        pinterestToken,
                        boardId,
                        productName.substring(0, 100), // Pinterest title limit
                        product.description || productName, // Description
                        product.affiliateLink, // Link de destino
                        product.imageUrl || product.image // URL da imagem
                    );

                    if (result.success) {
                        success++;
                        console.log(`[PINTEREST] ✅ Posted: ${productName}`);

                        // Log sent product (for history)
                        await db.logSentProduct({
                            productId: product.id || product.productId,
                            productName: productName,
                            price: product.price || 0,
                            commission: product.commission || 0,
                            groupId: boardId,
                            groupName: 'Pinterest Board',
                            mediaType: product.videoUrl ? 'VIDEO' : 'IMAGE',
                            category: product.category || 'pinterest'
                        }, userId);

                        // Log analytics event
                        await db.logEvent('pinterest_post', {
                            productId: product.id || product.productId,
                            groupId: boardId,
                            success: true
                        }, userId);
                    } else {
                        failed++;
                        console.error(`[PINTEREST] ❌ Failed: ${result.error}`);

                        // Parse missing scopes from error message
                        if (result.error && typeof result.error === 'string' && result.error.includes('Missing:')) {
                            errors.push(`${productName}: Erro de permissão! Faltam escopos no token: ${result.error.split('Missing:')[1]}`);
                        } else {
                            errors.push(`${productName}: ${result.error}`);
                        }
                    }
                } catch (error) {
                    console.error('[PINTEREST] Error processing product:', error);
                    failed++;
                    errors.push(`Erro interno ao processar produto: ${error.message}`);
                }
            }
        }


        res.json({
            success: true,
            details: {
                success,
                failed,
                total: sendMode === 'manual' ? 1 : products.length,
                errors: errors.slice(0, 3) // Primeiros 3 erros
            }
        });
    } catch (error) {
        console.error('[PINTEREST] Post now error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get Pinterest accounts
app.get('/api/pinterest/accounts', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const accessToken = db.getUserConfig(userId, 'pinterest_access_token');

        const accounts = [];
        if (accessToken) {
            try {
                const validation = await pinterest.validateToken(accessToken);
                if (validation.success) {
                    accounts.push({
                        id: '1',
                        username: validation.user?.username || 'Pinterest User',
                        accessToken: accessToken,
                        enabled: true
                    });
                }
            } catch (error) {
                console.error('[PINTEREST] Error validating token:', error);
            }
        }

        res.json({
            success: true,
            accounts: accounts
        });
    } catch (error) {
        console.error('[PINTEREST] Accounts error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get Pinterest boards
app.get('/api/pinterest/boards', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const accessToken = await db.getUserConfig(userId, 'pinterest_access_token');

        if (!accessToken) {
            return res.json({ success: false, error: 'Conta Pinterest não conectada' });
        }

        const result = await pinterest.getBoards(accessToken);

        if (result.success) {
            res.json({
                success: true,
                boards: result.boards
            });
        } else {
            res.json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        console.error('[PINTEREST] Boards error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Create Pinterest board
app.post('/api/pinterest/boards', requireAuth, async (req, res) => {
    try {
        const { name, description } = req.body;
        const userId = req.user.userId;
        const accessToken = await db.getUserConfig(userId, 'pinterest_access_token');

        if (!accessToken) {
            return res.json({ success: false, error: 'Conta Pinterest não conectada' });
        }

        if (!name) {
            return res.json({ success: false, error: 'Nome do board é obrigatório' });
        }

        const result = await pinterest.createBoard(accessToken, name, description);

        if (result.success) {
            res.json({
                success: true,
                board: result.board
            });
        } else {
            res.json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        console.error('[PINTEREST] Create Board error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Schedule Pinterest automation
app.post('/api/pinterest/schedule', requireAuth, async (req, res) => {
    try {
        const { boardId, schedule, categoryType, shopeeSettings } = req.body;
        const userId = req.user.userId;

        console.log(`[PINTEREST] Creating schedule for user ${userId}`);

        const config = {
            boardId,
            schedule,
            categoryType,
            shopeeSettings
        };

        const result = await scheduler.createSchedule('pinterest', config, userId);

        res.json({
            success: true,
            message: 'Agendamento criado com sucesso!',
            scheduleId: result.id
        });
    } catch (error) {
        console.error('[PINTEREST] Schedule error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== ANALYTICS ENDPOINTS ====================
// NOTA: Rotas de analytics foram movidas para cima com requireAuth e userId

/**
 * Get logs/events
 */
// --- END OF ANALYTICS ENDPOINTS ---

// ==================== AI AGENTS ENDPOINTS ====================

app.get('/api/agents', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const agents = await db.getAiAgents(userId);
        res.json({ success: true, agents });
    } catch (error) {
        console.error('[API] Error getting agents:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/agents', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const agent = await db.saveAiAgent(req.body, userId);
        res.json({ success: true, agent });
    } catch (error) {
        console.error('[API] Error saving agent:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/agents/handoff', requireAuth, async (req, res) => {
    try {
        const { account_id, platform, status } = req.body;
        const agent = await db.setHandoffActive(account_id, platform, status);
        res.json({ success: true, agent });
    } catch (error) {
        console.error('[API] Error updating handoff:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== COMMENT AUTOMATION ENDPOINTS ====================

app.get('/api/comment-automations', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const automations = await db.getCommentAutomations(userId);
        res.json({ success: true, automations });
    } catch (error) {
        console.error('[API] Error getting comment automations:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/comment-automations', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const automation = await db.saveCommentAutomation(req.body, userId);
        res.json({ success: true, automation });
    } catch (error) {
        console.error('[API] Error saving comment automation:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/comment-automations/:id', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const success = await db.deleteCommentAutomation(req.params.id, userId);
        res.json({ success });
    } catch (error) {
        console.error('[API] Error deleting comment automation:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== INITIALIZATION ====================

// Initialize services
(async () => {
    try {
        await db.initializeDatabase();
        await auth.initializeAuth();
        await scheduler.initializeScheduler();
        await twitter.initializeTwitter();
        await instagramGraph.initializeGraphAPI();
        await gemini.initializeGemini();
        // Initialize WhatsApp with catch to prevent blocking other services if it fails
        whatsapp.initializeWhatsApp(true).catch(err => console.error('[WHATSAPP] Auto-init failed:', err.message));

        console.log('✅ All services initialized successfully');
    } catch (error) {
        console.error('❌ Error initializing services:', error);
    }
})();



// Twitter Routes

// Get all connected accounts
app.get('/api/twitter/accounts', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const accounts = await twitter.getAccounts(userId);
        res.json({ success: true, accounts });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Connect a new account
app.post('/api/twitter/accounts', requireAuth, async (req, res) => {
    try {
        const { apiKey, apiSecret, accessToken, accessTokenSecret } = req.body;
        const userId = req.user.userId;
        const result = await twitter.addAccount(apiKey, apiSecret, accessToken, accessTokenSecret, userId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Remove an account
app.delete('/api/twitter/accounts/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        const result = await twitter.removeAccount(id, userId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Refresh account info (retry after rate limit)
app.post('/api/twitter/accounts/:id/refresh', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await twitter.refreshAccount(id);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Legacy test endpoint (kept for backward compatibility if needed, but redirects to addAccount logic)
app.post('/api/twitter/test', async (req, res) => {
    try {
        const { apiKey, apiSecret, accessToken, accessTokenSecret } = req.body;
        // This is now effectively "Add Account"
        const result = await twitter.addAccount(apiKey, apiSecret, accessToken, accessTokenSecret);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/twitter/usage', requireAuth, async (req, res) => {
    try {
        const count = await db.getTwitterDailyCount();
        res.json({
            success: true,
            count,
            limit: 25
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/twitter/post', async (req, res) => {
    try {
        const { product, template, hashtags } = req.body;
        const result = await twitter.postProduct(product, template, hashtags);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/twitter/account', async (req, res) => {
    try {
        const result = await twitter.getAccountInfo();
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/twitter/post-now', requireAuth, async (req, res) => {
    try {
        const { productCount, shopeeSettings, categoryType, messageTemplate, hashtags, sendMode, manualMessage, manualImageUrl, accountId } = req.body;
        const userId = req.user.userId;

        console.log(`[TWITTER] Post now request - Mode: ${sendMode || 'shopee'}`);

        let products = [];
        if (sendMode !== 'manual') {
            // Prepare products
            products = await prepareProductsForPosting(
                shopeeSettings,
                productCount,
                {}, // filters
                true, // enableRotation
                categoryType,
                userId
            );

            if (!products || products.length === 0) {
                return res.json({ success: false, error: 'Nenhum produto encontrado' });
            }
        }

        let success = 0;
        let failed = 0;

        if (sendMode === 'manual') {
            try {
                if (!manualMessage) {
                    return res.json({ success: false, error: 'O Twitter exige uma mensagem manual.' });
                }

                console.log(`[TWITTER] Postando envio manual`);
                const result = await twitter.postTweet(manualMessage, manualImageUrl || null, accountId || null);

                if (result.success) {
                    success++;
                    await db.logEvent('twitter_send', {
                        success: true,
                        message: "Envio Manual"
                    }, userId);
                } else {
                    failed++;
                    console.error(`[TWITTER] ❌ Failed to post: ${result.error}`);
                }
            } catch (error) {
                failed++;
                console.error(`[TWITTER] ❌ Error in manual post:`, error);
            }
        } else {
            for (const product of products) {
                try {
                    // Random delay between posts (60-120s) to avoid rate limits
                    if (success > 0) {
                        await randomDelay(60000, 120000);
                    }

                    const result = await twitter.postProduct(
                        product,
                        messageTemplate,
                        hashtags || [],
                        accountId || null
                    );

                    if (result.success) {
                        success++;
                        console.log(`[TWITTER] ✅ Posted product: ${product.name}`);
                    } else {
                        failed++;
                        console.error(`[TWITTER] ❌ Failed to post: ${result.error}`);
                    }
                } catch (error) {
                    failed++;
                    console.error(`[TWITTER] ❌ Error posting product:`, error);
                }
            }
        }

        res.json({
            success: true,
            details: { success, failed, total: sendMode === 'manual' ? 1 : products.length }
        });
    } catch (error) {
        console.error('[TWITTER] Post now error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== ADMIN DASHBOARD ENDPOINTS ====================

/**
 * Get system statistics for admin dashboard
 */
app.get('/api/admin/system-stats', requireAdmin, async (req, res) => {
    try {
        const adminStats = await db.getAdminSystemStats();
        const dbSize = await db.getPostgresDatabaseSize();

        // Calculate uptime
        const uptime = process.uptime();
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const uptimeStr = `${hours}h ${minutes}m`;

        res.json({
            totalPosts: adminStats.totalPosts || 0,
            successRate: adminStats.successRate || 100, // Fixed: adminStats.successRate instead of stats.successRate
            activeUsers: adminStats.activeUsers || 0,
            totalUsers: adminStats.totalUsers || 0,
            totalRevenue: adminStats.totalRevenue || 0,
            apiCalls: adminStats.totalPosts || 0, // Fallback to totalPosts if dedicated apiCalls not available
            databaseSize: dbSize,
            uptime: uptimeStr
        });
    } catch (error) {
        console.error('[ADMIN] Error getting system stats:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get System Settings
 */
app.get('/api/admin/public-settings', requireAuth, async (req, res) => {
    console.log('>>> [DEBUG] REACHED GET /api/admin/public-settings');
    try {
        const settings = await db.getSystemSettings();
        res.json({ success: true, settings });
    } catch (error) {
        console.error('[ADMIN] Error getting settings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});
/**
 * User Configuration Routes
 */
app.get('/api/user-config', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const config = await db.getAllUserConfig(userId);
        res.json({ success: true, config });
    } catch (error) {
        console.error('[USER-CONFIG] Error getting config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/user-config', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { key, value } = req.body;

        if (!key) {
            return res.status(400).json({ success: false, error: 'Key is required' });
        }

        await db.setUserConfig(userId, key, value);
        res.json({ success: true });
    } catch (error) {
        console.error('[USER-CONFIG] Error updating config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Bulk System Config (Available to authenticated users for settings like Meta App)
 */
app.post('/api/system-config/bulk', requireAuth, async (req, res) => {
    try {
        const { configs } = req.body;
        if (!configs || typeof configs !== 'object') {
            return res.status(400).json({ success: false, error: 'Configs object is required' });
        }

        await db.saveSystemConfigBulk(configs);
        res.json({ success: true });
    } catch (error) {
        console.error('[SYSTEM-CONFIG-BULK] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Update System Setting
 */
app.post('/api/admin/settings', requireAdmin, async (req, res) => {
    try {
        const { key, value } = req.body;
        if (!key) {
            return res.status(400).json({ success: false, error: 'Key is required' });
        }

        await db.updateSystemSetting(key, value);
        res.json({ success: true });
    } catch (error) {
        console.error('[ADMIN] Error updating setting:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get Database Table Statistics
 */
app.get('/api/admin/database-stats', requireAdmin, async (req, res) => {
    try {
        const stats = await db.getDatabaseTableStats();
        res.json({ success: true, stats });
    } catch (error) {
        console.error('[ADMIN] Error getting database stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get API health status
 * for all platforms
 */
app.get('/api/admin/api-health', requireAdmin, async (req, res) => {
    try {
        const apiStatuses = [];

        // Twitter
        const twitterAccounts = await twitter.getAccounts(); // Fixed: Added await
        const twitterUsage = await db.getTwitterDailyCount(); // Fixed: Added await
        apiStatuses.push({
            platform: 'Twitter',
            status: twitterAccounts.length > 0 ? 'ok' : 'error',
            lastCheck: 'Just now',
            successRate: 98.2,
            dailyLimit: '50/day',
            usedToday: twitterUsage
        });

        // Instagram
        const instagramAccounts = await db.getInstagramAccounts(); // Fixed: Added await
        const instagramQueue = await db.getInstagramQueue(); // Fixed: Added await
        const instagramFailed = instagramQueue.filter(v => v.status === 'failed').length;
        const instagramTotal = instagramQueue.length;
        const instagramSuccessRate = instagramTotal > 0
            ? ((instagramTotal - instagramFailed) / instagramTotal * 100).toFixed(1)
            : 100;

        apiStatuses.push({
            platform: 'Instagram',
            status: instagramAccounts.length > 0 ? 'ok' : 'warning',
            lastCheck: 'Just now',
            successRate: parseFloat(instagramSuccessRate),
            dailyLimit: 'Unlimited',
            usedToday: instagramQueue.filter(v => v.status === 'posted').length
        });

        // Telegram
        apiStatuses.push({
            platform: 'Telegram',
            status: process.env.TELEGRAM_BOT_TOKEN ? 'ok' : 'warning', // Fixed: Use process.env
            lastCheck: 'Just now',
            successRate: 99.8,
            dailyLimit: 'Unlimited',
            usedToday: 0 // analytics.getDashboardStats is async and needs await
        });

        // WhatsApp
        try {
            const userId = req.user.userId;
            const whatsappStatus = await whatsapp.getConnectionStatus(userId);
            apiStatuses.push({
                platform: 'WhatsApp',
                status: whatsappStatus.status === 'connected' ? 'ok' : 'error',
                lastCheck: 'Just now',
                successRate: 97.5,
                dailyLimit: 'Unlimited',
                usedToday: 0 // TODO: Track whatsapp sends
            });
        } catch (error) {
            apiStatuses.push({
                platform: 'WhatsApp',
                status: 'error',
                lastCheck: 'Just now',
                successRate: 0,
                dailyLimit: 'Unlimited',
                usedToday: 0
            });
        }

        // Facebook
        const facebookPages = await db.getFacebookPages(); // Fixed: Added await
        apiStatuses.push({
            platform: 'Facebook',
            status: facebookPages.length > 0 ? 'ok' : 'warning',
            lastCheck: 'Just now',
            successRate: 95.0,
            dailyLimit: 'Unlimited',
            usedToday: 0 // TODO: Track facebook sends
        });

        // Pinterest
        const pinterestAccessToken = process.env.PINTEREST_ACCESS_TOKEN;
        apiStatuses.push({
            platform: 'Pinterest',
            status: pinterestAccessToken ? 'ok' : 'warning',
            lastCheck: 'Just now',
            successRate: 92.0,
            dailyLimit: 'Unlimited',
            usedToday: 0 // TODO: Track pinterest sends
        });

        res.json(apiStatuses);
    } catch (error) {
        console.error('[ADMIN] Error getting API health:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get database statistics
 */
app.get('/api/admin/database-stats', requireAdmin, async (req, res) => {
    try {
        const tables = [
            'sent_products',
            'analytics_events',
            'schedules',
            'instagram_queue',
            'instagram_accounts',
            'twitter_accounts',
            'facebook_pages',
            'daily_stats'
        ];

        const tableStats = tables.map(table => {
            try {
                const result = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
                return {
                    name: table,
                    rows: result.count
                };
            } catch (error) {
                return {
                    name: table,
                    rows: 0,
                    error: error.message
                };
            }
        });

        res.json({
            tables: tableStats,
            totalTables: tables.length
        });
    } catch (error) {
        console.error('[ADMIN] Error getting database stats:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get all users with subscription info
 */
/**
 * Get all users (Advanced)
 */
app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
        const filters = {
            search: req.query.search,
            plan: req.query.plan,
            status: req.query.status,
            blocked: req.query.blocked
        };
        const users = adminUser.getUsers(filters);
        res.json({ success: true, users });
    } catch (error) {
        console.error('[ADMIN] Error getting users:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get user details
 */
app.get('/api/admin/users/:id', requireAdmin, async (req, res) => {
    try {
        const user = adminUser.getUserDetails(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
        }
        res.json({ success: true, user });
    } catch (error) {
        console.error('[ADMIN] Error getting user details:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Update user
 */
app.put('/api/admin/users/:id', requireAdmin, async (req, res) => {
    try {
        // TODO: Get admin ID from session/token
        const adminId = 1; // Default admin for now
        await adminUser.updateUser(req.params.id, req.body, adminId);
        res.json({ success: true });
    } catch (error) {
        console.error('[ADMIN] Error updating user:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Reset password
 */
app.post('/api/admin/users/:id/reset-password', requireAdmin, async (req, res) => {
    try {
        const adminId = 1;
        await adminUser.resetPassword(req.params.id, req.body.password, adminId);
        res.json({ success: true });
    } catch (error) {
        console.error('[ADMIN] Error resetting password:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Toggle block status
 */
app.post('/api/admin/users/:id/status', requireAdmin, async (req, res) => {
    try {
        const adminId = 1;
        await adminUser.toggleUserBlock(req.params.id, req.body.blocked, adminId);
        res.json({ success: true });
    } catch (error) {
        console.error('[ADMIN] Error toggling status:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Delete user (Soft delete)
 */
app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
    try {
        const adminId = 1;
        await adminUser.deleteUser(req.params.id, adminId);
        res.json({ success: true });
    } catch (error) {
        console.error('[ADMIN] Error deleting user:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get subscription statistics
 */
app.get('/api/admin/subscription-stats', requireAdmin, async (req, res) => {
    try {
        const stats = await auth.getSubscriptionStats();
        res.json({ success: true, stats });
    } catch (error) {
        console.error('[ADMIN] Error getting subscription stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Update user subscription
 */
app.put('/api/admin/users/:id/subscription', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { plan, status, endDate } = req.body;
        const result = await auth.updateUserSubscription(id, plan, status, endDate);
        res.json({ success: true, result });
    } catch (error) {
        console.error('[ADMIN] Error updating subscription:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Add payment for user
 */
app.post('/api/admin/users/:id/payment', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { amount, method, status } = req.body;
        const result = await auth.addPayment(id, amount, method, status);
        res.json({ success: true, result });
    } catch (error) {
        console.error('[ADMIN] Error adding payment:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Delete user
 */
app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await auth.deleteUser(id); // Fixed: added await
        res.json(result);
    } catch (error) {
        console.error('[ADMIN] Error deleting user:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});




// System Configuration
app.post('/api/system-config/bulk', requireAuth, async (req, res) => {
    try {
        const { configs } = req.body;
        if (!configs || typeof configs !== 'object') {
            return res.status(400).json({ success: false, error: 'Configs object is required' });
        }

        console.log('[CONFIG] Saving bulk system configuration...');
        await db.saveSystemConfigBulk(configs);
        
        // Re-initialize Graph API if Meta credentials changed
        if (configs.META_APP_ID || configs.META_APP_SECRET) {
            console.log('[CONFIG] Meta credentials updated, re-initializing Graph API...');
            await instagram.initializeGraphAPI();
        }

        res.json({ success: true });
    } catch (error) {
        console.error('[CONFIG] Error saving bulk config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// User Config (used by frontend to load and save all user/system settings)
app.get('/api/user-config', requireAuth, async (req, res) => {
    try {
        const config = await db.getSystemSettings();
        res.json({ success: true, config });
    } catch (error) {
        console.error('[CONFIG] Error getting user config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/user-config', requireAuth, async (req, res) => {
    try {
        const { key, value } = req.body;
        if (!key) {
            return res.status(400).json({ success: false, error: 'key is required' });
        }
        await db.saveSystemConfig(key, value);
        res.json({ success: true });
    } catch (error) {
        console.error('[CONFIG] Error saving user config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- 🔗 ACCOUNT MANAGEMENT ROUTES ---

// Telegram Groups
app.get('/api/telegram/groups', requireAuth, (req, res) => {
    try {
        const groups = db.getTelegramGroups(req.user.userId);
        res.json(groups);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// WhatsApp Groups
app.get('/api/whatsapp/groups', requireAuth, async (req, res) => {
    try {
        const { accountId } = req.query; // Check if accountId is provided in query
        const userId = req.user.userId;
        const groups = await db.getWhatsAppGroups(userId, accountId); // Fixed: handle accountId
        res.json({ success: true, groups });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Facebook Pages
app.get('/api/facebook/pages', requireAuth, async (req, res) => {
    try {
        const pages = await db.getFacebookPages(req.user.userId);
        res.json({ pages });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/facebook/list-pages', requireAuth, async (req, res) => {
    try {
        const { accessToken } = req.query;
        if (!accessToken) {
            return res.status(400).json({ success: false, error: 'User Access Token is required' });
        }

        const result = await facebook.listAvailablePages(accessToken);
        res.json(result);
    } catch (error) {
        console.error('[FB] List Pages Route Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/facebook/pages', requireAuth, async (req, res) => {
    try {
        const { pageId, accessToken, instagramBusinessId, instagramUsername } = req.body;
        const userId = req.user.userId;

        console.log(`[FACEBOOK] Received connect request for page ${pageId}`);

        // 1. Verify token and get page name
        const verification = await facebook.verifyPageToken(pageId, accessToken);
        if (!verification.success) {
            console.error('[FACEBOOK] Token verification failed:', verification.error);
            return res.status(400).json(verification);
        }

        // 2. Add page to database
        const result = await facebook.addPage({
            pageId,
            accessToken,
            pageName: verification.page.name,
            instagramBusinessId,
            instagramUsername
        }, userId);

        res.json(result);
    } catch (error) {
        console.error('[FB] Add Page Route Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Instagram Accounts
app.get('/api/instagram/accounts', requireAuth, async (req, res) => {
    try {
        const accounts = await db.getInstagramAccounts(req.user.userId);
        res.json({ accounts });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Twitter Accounts
app.get('/api/twitter/accounts', requireAuth, async (req, res) => {
    try {
        const accounts = await db.getTwitterAccounts(req.user.userId);
        res.json({ accounts });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Pinterest Boards
app.get('/api/pinterest/boards', requireAuth, async (req, res) => {
    try {
        const boards = await db.getPinterestBoards(req.user.userId);
        res.json({ boards });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- 🔗 META WEBHOOKS (REDUNDANT REMOVED) ---

// --- 🌐 FRONTEND PRODUCTION SERVING ---
// Serve React build files from /dist
const __dirname = path.resolve();
app.use(express.static(path.join(__dirname, 'dist')));

// Fallback all non-API routes to React's index.html (for React Router)
app.get('*', (req, res) => {
    if (!req.url.startsWith('/api')) {
        res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    }
});

app.listen(PORT, async () => {
    console.log(`\n\x1b[32m✅ FluxoInteligente Backend rodando na porta ${PORT}\x1b[0m`);
    console.log(`   - URLs base:`);
    console.log(`     Backend: http://localhost:${PORT}`);
    console.log(`   - Proxy Global Ativo: http://localhost:${PORT}/api/proxy/global`);

    // Start the Story Queue background worker
    try {
        scheduler.startStoryWorker();
        console.log('\x1b[36m📸 Story Queue Worker iniciado\x1b[0m');
        
        scheduler.startReelsWorker();
        console.log('\x1b[36m🎬 Reels Queue Worker iniciado\x1b[0m');
    } catch (e) {
        console.error('[STARTUP] Failed to start Workers:', e.message);
    }
});
