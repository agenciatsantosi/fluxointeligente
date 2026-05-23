import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { getSystemConfig, saveTikTokAccount, getTikTokAccountById, query } from './database.js';

/**
 * TikTok Developer API Integration Service
 * Handles OAuth2 authentication, Token Refresh, Profile Sync, and Direct Video Uploads.
 */

// Permissions requested from the user during login
const SCOPES = [
    'user.info.basic',
    'video.upload',
    'video.publish'
].join(',');

/**
 * Helper to get TikTok App Credentials from Database
 */
async function getTikTokCredentials() {
    const clientKey = await getSystemConfig('TIKTOK_CLIENT_KEY');
    const clientSecret = await getSystemConfig('TIKTOK_CLIENT_SECRET');

    if (!clientKey || !clientSecret) {
        throw new Error('Configurações do TikTok (Client Key/Secret) não encontradas no sistema.');
    }

    return { clientKey, clientSecret };
}

/**
 * Generate TikTok OAuth2 Authorization URL
 * @param {string} redirectUri - HTTPS Redirect Callback URL
 * @param {string} state - Secure state context
 */
export async function getAuthUrl(redirectUri, state = '') {
    const { clientKey } = await getTikTokCredentials();
    
    const params = new URLSearchParams({
        client_key: clientKey,
        scope: SCOPES,
        response_type: 'code',
        redirect_uri: redirectUri,
        state: state
    });

    return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
}

/**
 * Exchange Authorization Code for Access & Refresh Tokens
 */
export async function getTokensFromCode(code, redirectUri, userId) {
    const { clientKey, clientSecret } = await getTikTokCredentials();

    try {
        console.log('[TIKTOK OAuth] Trocando authorization code por tokens...');
        const response = await axios.post('https://open.tiktokapis.com/v2/oauth/token/', 
            new URLSearchParams({
                client_key: clientKey,
                client_secret: clientSecret,
                code: code,
                grant_type: 'authorization_code',
                redirect_uri: redirectUri
            }).toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        const data = response.data;
        if (data.error) {
            throw new Error(data.error_description || data.error);
        }

        const { access_token, refresh_token, expires_in, refresh_expires_in, open_id } = data;

        // Calculate absolute expiry timestamps
        const expiresAt = new Date(Date.now() + (expires_in || 86400) * 1000).toISOString();
        const refreshExpiresAt = refresh_expires_in 
            ? new Date(Date.now() + refresh_expires_in * 1000).toISOString()
            : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // Default 30 days

        // Retrieve user info from TikTok
        console.log('[TIKTOK OAuth] Buscando informações do perfil...');
        const profile = await getUserInfo(access_token);

        const accountData = {
            channel_name: profile.display_name || profile.username || 'TikTok Account',
            username: profile.username || 'user',
            avatar_url: profile.avatar_url || '',
            access_token,
            refresh_token,
            expires_at: expiresAt,
            refresh_expires_at: refreshExpiresAt,
            open_id
        };

        return await saveTikTokAccount(accountData, userId);

    } catch (error) {
        console.error('[TIKTOK OAuth Error]:', error.response?.data || error.message);
        throw new Error(`Falha na autenticação do TikTok: ${error.message}`);
    }
}

/**
 * Retrieve User Profile Info
 */
export async function getUserInfo(accessToken) {
    try {
        const response = await axios.get('https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,username', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        const data = response.data;
        if (data.error) {
            throw new Error(data.error.message || 'Erro ao buscar perfil');
        }

        return data.data.user;
    } catch (error) {
        console.error('[TIKTOK API] Get User Info Error:', error.response?.data || error.message);
        throw error;
    }
}

/**
 * Refresh expired access token using the refresh token
 */
export async function refreshAccessToken(accountId, userId) {
    const account = await getTikTokAccountById(accountId, userId);
    if (!account) throw new Error('Conta do TikTok não encontrada no banco de dados.');

    const { clientKey, clientSecret } = await getTikTokCredentials();

    try {
        console.log(`[TIKTOK REFRESH] Renovando token para a conta @${account.username}...`);
        const response = await axios.post('https://open.tiktokapis.com/v2/oauth/token/',
            new URLSearchParams({
                client_key: clientKey,
                client_secret: clientSecret,
                grant_type: 'refresh_token',
                refresh_token: account.refresh_token
            }).toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        const data = response.data;
        if (data.error) {
            throw new Error(data.error_description || data.error);
        }

        const { access_token, refresh_token, expires_in, refresh_expires_in } = data;

        const expiresAt = new Date(Date.now() + (expires_in || 86400) * 1000).toISOString();
        const refreshExpiresAt = refresh_expires_in 
            ? new Date(Date.now() + refresh_expires_in * 1000).toISOString()
            : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        // Save updated tokens
        await query(`
            UPDATE tiktok_accounts 
            SET access_token = $1, refresh_token = $2, expires_at = $3, refresh_expires_at = $4 
            WHERE id = $5 AND user_id = $6
        `, [access_token, refresh_token || account.refresh_token, expiresAt, refreshExpiresAt, accountId, userId]);

        console.log(`[TIKTOK REFRESH] Token renovado com sucesso para a conta @${account.username}`);
        return access_token;

    } catch (error) {
        console.error(`[TIKTOK REFRESH ERROR] @${account.username}:`, error.response?.data || error.message);
        throw new Error(`Falha ao renovar token do TikTok: ${error.message}`);
    }
}

/**
 * Direct Publish Video to TikTok
 */
export async function publishVideo(mediaInput, title, dbAccountId, userId, options = {}) {
    try {
        let account = await getTikTokAccountById(dbAccountId, userId);
        if (!account) throw new Error('Conta do TikTok não encontrada.');

        const isSessionCookie = account.open_id?.startsWith('session_') || !account.access_token?.startsWith('clt');
        
        if (Array.isArray(mediaInput)) {
            if (!isSessionCookie) {
                throw new Error('A API Oficial do TikTok não suporta envio de Carrossel (Múltiplas Fotos). Por favor, reconecte sua conta do TikTok usando o método de Sessão/Cookie para usar esta função.');
            }
        }

        if (isSessionCookie) {
            console.log(`[TIKTOK PUBLISH] 🍪 Conta @${account.username} identificada como sessão/cookie. Usando upload via Puppeteer.`);
            return await publishVideoViaSessionCookie(mediaInput, title, account.access_token, account.username, options);
        }

        // --- THE REST OF THIS FUNCTION ONLY RUNS FOR OFFICIAL API (SINGLE FILE ONLY) ---
        const videoPath = mediaInput; // We know it's a single string here

        // Token Auto-refresh check (refresh if less than 5 minutes remain)
        const expiryTime = new Date(account.expires_at).getTime();
        const now = Date.now();
        let accessToken = account.access_token;

        if (expiryTime - now < 5 * 60 * 1000) {
            accessToken = await refreshAccessToken(dbAccountId, userId);
        }

        // Verify video file exists
        if (!fs.existsSync(videoPath)) {
            throw new Error(`Arquivo de vídeo não encontrado localmente: ${videoPath}`);
        }

        const fileSize = fs.statSync(videoPath).size;
        console.log(`[TIKTOK PUBLISH] Inicializando upload de vídeo: ${title} (${fileSize} bytes)`);

        // Step 1: Initialize Video Publish Request
        const initResponse = await axios.post(
            'https://open.tiktokapis.com/v2/post/publish/video/init/',
            {
                post_info: {
                    title: title.substring(0, 150), // TikTok character limit for captions
                    privacy_level: options.privacyLevel || 'PUBLIC_TO_EVERYONE',
                    disable_duet: options.disableDuet ?? false,
                    disable_stitch: options.disableStitch ?? false,
                    disable_comment: options.disableComment ?? false,
                    video_cover_timestamp_ms: 1000
                },
                source_info: {
                    source: 'FILE_UPLOAD',
                    video_size: fileSize
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const initData = initResponse.data;
        if (initData.error) {
            throw new Error(initData.error.message || 'Erro ao inicializar postagem no TikTok');
        }

        const { publish_id, upload_url } = initData.data;
        console.log(`[TIKTOK PUBLISH] Inicializado! ID: ${publish_id}. URL de Upload recebida.`);

        // Step 2: Upload Video File Content via PUT to pre-signed URL
        console.log(`[TIKTOK PUBLISH] Enviando vídeo...`);
        
        // Single chunk upload for max stability under TikTok limits
        const fileStream = fs.createReadStream(videoPath);
        await axios.put(upload_url, fileStream, {
            headers: {
                'Content-Type': 'video/mp4',
                'Content-Length': fileSize
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            onUploadProgress: (evt) => {
                const progress = (evt.loaded / fileSize) * 100;
                console.log(`[TIKTOK PUBLISH] Upload Progress: ${progress.toFixed(2)}%`);
                if (global.postProgress) {
                    global.postProgress.set(`tiktok-${dbAccountId}`, progress);
                }
            }
        });

        console.log(`[TIKTOK PUBLISH] Upload concluído! Vídeo enviado com sucesso para o TikTok.`);

        return {
            success: true,
            publishId: publish_id,
            url: `https://www.tiktok.com/@${account.username}` // Direct link to user profile
        };

    } catch (error) {
        console.error('[TIKTOK PUBLISH ERROR]:', error.response?.data || error.message);
        throw new Error(`Falha no upload para o TikTok: ${error.message}`);
    }
}

/**
 * Automate TikTok video/carousel upload via headless browser using session cookie
 */
async function publishVideoViaSessionCookie(mediaInput, title, sessionId, username, options = {}) {
    const isCarousel = Array.isArray(mediaInput);
    console.log(`[TIKTOK PUPPETEER] Iniciando upload ${isCarousel ? 'de Carrossel' : 'de Vídeo'} via Puppeteer para @${username}...`);
    
    // Import dynamically to avoid top-level issues
    const { default: puppeteerExtra } = await import('puppeteer-extra');
    const { default: StealthPlugin } = await import('puppeteer-extra-plugin-stealth');
    const { default: os } = await import('os');
    
    try {
        puppeteerExtra.use(StealthPlugin());
    } catch (e) {
        console.warn('[TIKTOK PUPPETEER] StealthPlugin already registered or failed to register:', e.message);
    }
    
    let browser;
    let userDataDir;
    try {
        // Create unique browser session directory
        const uniqueId = Math.random().toString(36).substring(7);
        userDataDir = path.join(os.tmpdir(), `tiktok_session_${uniqueId}`);
        if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

        // Find standard Chrome path on Windows if possible
        const chromePaths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
        ];
        let executablePath = undefined;
        for (const p of chromePaths) {
            if (fs.existsSync(p)) {
                executablePath = p;
                break;
            }
        }

        browser = await puppeteerExtra.launch({
            headless: "new",
            userDataDir,
            executablePath,
            ignoreHTTPSErrors: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-infobars',
                '--disable-web-security',
                '--window-size=1280,800',
                '--lang=pt-BR,pt',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-extensions'
            ]
        });
        
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        
        // 1. Set the sessionid and sessionid_ss cookies
        const cookies = [
            {
                name: 'sessionid',
                value: sessionId,
                domain: '.tiktok.com',
                path: '/',
                httpOnly: true,
                secure: true
            },
            {
                name: 'sessionid_ss',
                value: sessionId,
                domain: '.tiktok.com',
                path: '/',
                httpOnly: true,
                secure: true
            }
        ];
        await page.setCookie(...cookies);
        
        console.log(`[TIKTOK PUPPETEER] Cookies configurados. Navegando para página de upload...`);
        
        // 2. Go to upload page
        await page.goto('https://www.tiktok.com/creator-center/upload?lang=pt-BR', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        
        // 3. Find input type="file" inside frame or page
        console.log(`[TIKTOK PUPPETEER] Procurando input de arquivo...`);
        let fileInput = null;
        let frame = page;
        
        for (let attempt = 0; attempt < 10; attempt++) {
            fileInput = await page.$('input[type="file"]');
            if (fileInput) break;
            
            const frames = page.frames();
            for (const f of frames) {
                fileInput = await f.$('input[type="file"]');
                if (fileInput) {
                    frame = f;
                    break;
                }
            }
            if (fileInput) break;
            await new Promise(r => setTimeout(r, 2000));
        }
        
        if (!fileInput) {
            throw new Error('Não foi possível encontrar o campo de upload de vídeo na página do TikTok. A sessão pode ter expirado.');
        }
        
        // O TikTok Web NÃO suporta upload de múltiplas fotos nativamente (Modo Carrossel).
        // Se recebermos um array (Carrossel), vamos juntar todas as imagens em um vídeo (Slideshow)!
        let mediaPaths = [mediaInput];
        let isImageOrCarousel = false;

        if (isCarousel && Array.isArray(mediaInput)) {
            console.log(`[TIKTOK PUPPETEER] AVISO: O TikTok Web não suporta postar Carrossel nativamente. Juntando as ${mediaInput.length} imagens em um vídeo (Slideshow) automático...`);
            isImageOrCarousel = true;
            try {
                const { convertImagesToSlideshow } = await import('./videoService.js');
                const slideshowPath = await convertImagesToSlideshow(mediaInput);
                mediaPaths = [slideshowPath];
            } catch (e) {
                console.warn('[TIKTOK PUPPETEER] Falha ao criar slideshow, tentando enviar apenas a 1ª imagem (vai falhar no TikTok Web):', e.message);
                mediaPaths = [mediaInput[0]];
            }
        } else if (Array.isArray(mediaInput)) {
            mediaPaths = [mediaInput[0]];
        }
        
        // Convert a single file to an mp4 if it's an image, because TikTok Web only accepts videos
        if (!isImageOrCarousel && mediaPaths[0] && (mediaPaths[0].toLowerCase().endsWith('.jpg') || mediaPaths[0].toLowerCase().endsWith('.png') || mediaPaths[0].toLowerCase().endsWith('.jpeg') || mediaPaths[0].toLowerCase().endsWith('.webp'))) {
            console.log(`[TIKTOK PUPPETEER] Convertendo imagem única para vídeo MP4 de 5s para aceitação no TikTok Web...`);
            try {
                const { convertImageToVideo } = await import('./videoService.js');
                mediaPaths[0] = await convertImageToVideo(mediaPaths[0]);
            } catch (e) {
                console.warn('[TIKTOK PUPPETEER] Falha na conversão de vídeo, tentando enviar a imagem mesmo assim (vai falhar no TikTok Web):', e.message);
            }
        }
        
        console.log(`[TIKTOK PUPPETEER] Selecionando ${mediaPaths.length} arquivo(s): ${mediaPaths[0]}`);
        await fileInput.uploadFile(...mediaPaths);
        
        // 4. Wait for video uploading progress
        console.log(`[TIKTOK PUPPETEER] Mídia(s) enviada(s)! Aguardando o processamento do upload...`);
        
        // Wait for caption editor to appear to type the caption
        let captionInput = null;
        const selectors = 'div[contenteditable="true"], [data-e2e="post-desc"], .public-DraftEditor-editor, .DraftEditor-editorContainer > div, [data-contents="true"], textarea, input[placeholder*="legenda"], input[placeholder*="caption"]';
        
        for (let attempt = 0; attempt < 30; attempt++) {
            try {
                // Tenta na página principal
                captionInput = await page.$(selectors);
                if (captionInput) {
                    frame = page;
                    break;
                }
                
                // Tenta em todos os iframes ativos
                const frames = page.frames();
                for (const f of frames) {
                    captionInput = await f.$(selectors).catch(() => null);
                    if (captionInput) {
                        frame = f;
                        break;
                    }
                }
                
                if (captionInput) break;
            } catch (e) {}
            await new Promise(r => setTimeout(r, 2000));
        }
        
        if (!captionInput) {
            throw new Error('Não foi possível encontrar o campo de legenda/caption.');
        }
        
        console.log(`[TIKTOK PUPPETEER] Configurando legenda: "${title}"`);
        // Click to focus and activate Draft.js selection state
        await frame.evaluate(el => el.click(), captionInput).catch(() => {});
        await new Promise(r => setTimeout(r, 1000));
        await captionInput.focus().catch(() => {});
        await new Promise(r => setTimeout(r, 500));
        
        // Select all existing text (including any pre-filled filename) and delete it
        await page.keyboard.down('Control');
        await page.keyboard.press('A');
        await page.keyboard.up('Control');
        await page.keyboard.press('Backspace');
        await new Promise(r => setTimeout(r, 500));
        
        // Type characters sequentially and handle hashtags specifically to trigger TikTok's blue pills
        const segments = title.split(/(#[^\s#]+)/);
        for (const segment of segments) {
            if (!segment) continue;
            
            if (segment.startsWith('#')) {
                // Type the hashtag
                await page.keyboard.type(segment, { delay: 60 });
                // Wait for TikTok's hashtag autocomplete dropdown to appear
                await new Promise(r => setTimeout(r, 1500));
                // Press Enter to select the first suggestion and convert it to a blue tag
                await page.keyboard.press('Enter');
                await new Promise(r => setTimeout(r, 500));
            } else {
                // Normal text
                await page.keyboard.type(segment, { delay: 20 });
            }
        }
        await new Promise(r => setTimeout(r, 1000));
        
        // 4.5 Configure Privacy Setting
        const privacyLevel = (options.privacyLevel || 'PUBLIC_TO_EVERYONE').toUpperCase();
        console.log(`[TIKTOK PUPPETEER] Configurando nível de privacidade: ${privacyLevel}`);
        
        try {
            // Map database privacy keys to localized button texts
            let targetTexts = [];
            if (privacyLevel.includes('PUBLIC') || privacyLevel.includes('EVERYONE')) {
                targetTexts = ['everyone', 'público', 'todos', 'todo mundo'];
            } else if (privacyLevel.includes('FRIEND') || privacyLevel.includes('MUTUAL')) {
                targetTexts = ['friends', 'amigos'];
            } else if (privacyLevel.includes('PRIVATE') || privacyLevel.includes('SELF')) {
                targetTexts = ['private', 'privado', 'somente eu'];
            }
            
            if (targetTexts.length > 0) {
                const dropdownTrigger = await frame.evaluateHandle(() => {
                    const headers = document.querySelectorAll('div, span, p');
                    let sectionContainer = null;
                    for (const el of headers) {
                        const txt = el.innerText.toLowerCase();
                        if (txt.includes('who can see this post') || txt.includes('quem pode assistir') || txt.includes('quem pode ver')) {
                            sectionContainer = el.closest('div[class*="setting"], div[class*="container"], div');
                            if (sectionContainer && sectionContainer.querySelector('div[class*="select"], div[class*="dropdown"], [role="button"], div[class*="select-value-container"]')) {
                                break;
                            }
                        }
                    }
                    
                    const root = sectionContainer || document.body;
                    return root.querySelector('div[class*="select"], div[class*="dropdown"], [role="button"], div[class*="select-value-container"]');
                });
                
                if (dropdownTrigger && dropdownTrigger.asElement()) {
                    console.log(`[TIKTOK PUPPETEER] Dropdown de privacidade encontrado! Clicando para abrir...`);
                    const dt = dropdownTrigger.asElement();
                    await frame.evaluate(el => el.scrollIntoView({ block: 'center' }), dt);
                    await new Promise(r => setTimeout(r, 500));
                    try {
                        await dt.click();
                        console.log(`[TIKTOK PUPPETEER] Clicou no dropdown de privacidade via Puppeteer nativo!`);
                    } catch (clickErr) {
                        console.warn(`[TIKTOK PUPPETEER] Falha no clique nativo do dropdown, tentando JS fallback...`, clickErr.message);
                        await frame.evaluate(el => el.click(), dt);
                    }
                    await new Promise(r => setTimeout(r, 1500)); // Wait for option items
                    
                    const optionHandle = await frame.evaluateHandle((texts) => {
                        const options = document.querySelectorAll('div[class*="option"], li, [role="option"], span, div');
                        for (const opt of options) {
                            const txt = opt.innerText.toLowerCase().trim();
                            if (texts.includes(txt)) {
                                return opt;
                            }
                        }
                        return null;
                    }, targetTexts);
                    
                    const optionElement = optionHandle ? optionHandle.asElement() : null;
                    if (optionElement) {
                        console.log(`[TIKTOK PUPPETEER] Opção de privacidade correspondente encontrada! Clicando...`);
                        await frame.evaluate(el => el.scrollIntoView({ block: 'center' }), optionElement);
                        await new Promise(r => setTimeout(r, 500));
                        try {
                            await optionElement.click();
                            console.log(`[TIKTOK PUPPETEER] Clicou na opção de privacidade via Puppeteer nativo!`);
                        } catch (clickErr) {
                            console.warn(`[TIKTOK PUPPETEER] Falha no clique nativo da opção, tentando JS fallback...`, clickErr.message);
                            await frame.evaluate(el => el.click(), optionElement);
                        }
                        console.log(`[TIKTOK PUPPETEER] Nível de privacidade selecionado com sucesso!`);
                    } else {
                        console.warn(`[TIKTOK PUPPETEER] Opção de privacidade correspondente não encontrada no menu aberto.`);
                    }
                } else {
                    console.warn(`[TIKTOK PUPPETEER] Dropdown de privacidade não pôde ser localizado.`);
                }
            }
        } catch (privErr) {
            console.warn(`[TIKTOK PUPPETEER] Erro ao configurar privacidade:`, privErr.message);
        }
        await new Promise(r => setTimeout(r, 1000));
        
        // 5. Wait for the Post button to become enabled and clickable
        console.log(`[TIKTOK PUPPETEER] Aguardando o botão de Publicar ficar ativo...`);
        let postButtonHandle = null;
        for (let attempt = 0; attempt < 30; attempt++) {
            postButtonHandle = await frame.evaluateHandle(() => {
                const buttons = document.querySelectorAll('button');
                for (const btn of buttons) {
                    const text = btn.innerText.toLowerCase().trim();
                    // Match exact button text for publication
                    if (text === 'post' || text === 'publicar') {
                        const isDisabled = btn.hasAttribute('disabled') || btn.getAttribute('aria-disabled') === 'true' || btn.classList.contains('disabled');
                        if (!isDisabled) {
                            return btn;
                        }
                    }
                }
                return null;
            });
            
            if (postButtonHandle && postButtonHandle.asElement()) {
                break;
            }
            await new Promise(r => setTimeout(r, 2000));
        }
        
        const postButton = postButtonHandle ? postButtonHandle.asElement() : null;
        if (!postButton) {
            throw new Error('Botão de Publicar não ficou ativo após o tempo limite de processamento do vídeo.');
        }
        
        console.log(`[TIKTOK PUPPETEER] Clicando no botão de Publicar...`);
        await frame.evaluate(btn => btn.scrollIntoView({ block: 'center' }), postButton);
        await new Promise(r => setTimeout(r, 500));
        try {
            await postButton.click();
            console.log(`[TIKTOK PUPPETEER] Clicou no botão de Publicar via Puppeteer nativo!`);
        } catch (clickErr) {
            console.warn(`[TIKTOK PUPPETEER] Falha no clique nativo Puppeteer, tentando JS fallback...`, clickErr.message);
            await frame.evaluate(btn => btn.click(), postButton);
        }
        
        // 6. Wait for success message, page redirect, or confirmation modal dynamically
        console.log(`[TIKTOK PUPPETEER] Aguardando confirmação de publicação...`);
        let publishedSuccess = false;
        const startTime = Date.now();
        const timeoutMs = 45000;
        
        while (Date.now() - startTime < timeoutMs) {
            // 6.1 Check if page redirected (definitive success)
            const currentUrl = page.url().toLowerCase();
            if (currentUrl.includes('content') || currentUrl.includes('manager') || currentUrl.includes('posts')) {
                console.log(`[TIKTOK PUPPETEER] Redirecionamento de sucesso detectado: ${page.url()}`);
                publishedSuccess = true;
                break;
            }
            
            // 6.2 Check if a success toast/overlay is present
            const hasSuccessToast = await frame.evaluate(() => {
                const overlays = document.querySelectorAll('[role="dialog"], div[class*="modal"], div[class*="toast"], div[class*="popup"], div[class*="dialog"], div[class*="message"]');
                for (const overlay of overlays) {
                    const text = overlay.innerText.toLowerCase();
                    if (text.includes('copyright') || text.includes('checks')) continue;
                    if (
                        text.includes('sucesso') || 
                        text.includes('success') || 
                        text.includes('publicado') || 
                        text.includes('published') || 
                        text.includes('carregado') || 
                        text.includes('uploaded') ||
                        text.includes('concluído') ||
                        text.includes('completed')
                    ) {
                        return true;
                    }
                }
                return false;
            });
            
            if (hasSuccessToast) {
                console.log(`[TIKTOK PUPPETEER] Confirmação detectada via mensagem/toast na página!`);
                publishedSuccess = true;
                break;
            }
            
            // 6.3 Check for any confirmation modal (e.g. copyright, warning, duplicate checks)
            const modalButton = await frame.evaluateHandle(() => {
                const modalContainers = document.querySelectorAll('[role="dialog"], div[class*="modal"], div[class*="popup"], div[class*="dialog"]');
                for (const container of modalContainers) {
                    const buttons = container.querySelectorAll('button');
                    for (const btn of buttons) {
                        const text = btn.innerText.toLowerCase();
                        if (
                            text.includes('turn on') || 
                            text.includes('ativar') || 
                            text.includes('permitir') || 
                            text.includes('continuar') || 
                            text.includes('confirmar') || 
                            text.includes('sim') ||
                            text.includes('ok') ||
                            text.includes('publicar') ||
                            text.includes('post')
                        ) {
                            return btn;
                        }
                    }
                }
                return null;
            });
            
            if (modalButton && modalButton.asElement()) {
                console.log(`[TIKTOK PUPPETEER] Modal de confirmação detectado! Clicando no botão de confirmação...`);
                const mb = modalButton.asElement();
                await frame.evaluate(btn => btn.scrollIntoView({ block: 'center' }), mb);
                await new Promise(r => setTimeout(r, 500));
                try {
                    await mb.click();
                    console.log(`[TIKTOK PUPPETEER] Clicou no botão do modal via Puppeteer nativo!`);
                } catch (clickErr) {
                    console.warn(`[TIKTOK PUPPETEER] Falha no clique nativo Puppeteer do modal, tentando JS fallback...`, clickErr.message);
                    try { await frame.evaluate(btn => btn.click(), mb); } catch(e){}
                }
                
                await new Promise(r => setTimeout(r, 3000)); // Wait for modal action to settle
                
                // Click the main "Publicar" button again to finalize
                console.log(`[TIKTOK PUPPETEER] Clicando no botão de Publicar novamente para enviar...`);
                try {
                    await postButton.click();
                    console.log(`[TIKTOK PUPPETEER] Clicou no botão de Publicar novamente via Puppeteer nativo!`);
                } catch (clickErr) {
                    console.warn(`[TIKTOK PUPPETEER] Falha no clique nativo Puppeteer, tentando JS fallback...`, clickErr.message);
                    try { 
                        await frame.evaluate(btn => btn.click(), postButton); 
                    } catch(e) {
                        if (e.message.includes('detached') || e.message.includes('Execution context was destroyed')) {
                            console.log(`[TIKTOK PUPPETEER] O botão desapareceu! A página recarregou após a publicação. Tratando como SUCESSO.`);
                            publishedSuccess = true;
                            break;
                        }
                    }
                }
                await new Promise(r => setTimeout(r, 2000));
            } else {
                // Periodic re-click of the Publish button
                // If the first click was ignored because the video was still uploading, we re-click it.
                try {
                    const btnStatus = await frame.evaluate(btn => {
                        return {
                            exists: !!btn,
                            disabled: btn.hasAttribute('disabled') || btn.getAttribute('aria-disabled') === 'true' || btn.classList.contains('disabled')
                        };
                    }, postButton);
                    
                    if (btnStatus.exists && !btnStatus.disabled) {
                        console.log(`[TIKTOK PUPPETEER] Botão de Publicar ainda está ativo. Tentando clicar novamente...`);
                        await frame.evaluate(btn => btn.click(), postButton);
                    }
                } catch (e) {
                    // Ignore if element is detached
                }
            }
            
            await new Promise(r => setTimeout(r, 2000));
        }
        
        if (!publishedSuccess) {
            console.log(`[TIKTOK PUPPETEER] Timeout expirou sem detectar sucesso explícito. Fazendo verificação alternativa...`);
            
            // Success fallback 1: Check if page redirected or is in content manager
            const currentUrl = page.url().toLowerCase();
            if (currentUrl.includes('content') || currentUrl.includes('manager') || currentUrl.includes('posts')) {
                console.log(`[TIKTOK PUPPETEER] URL atual indica redirecionamento pós-publicação: ${page.url()}. Tratando como SUCESSO.`);
            } else {
                // Success fallback 2: Check if the Publish button has disappeared or is permanently disabled
                const stillHasButton = await frame.evaluateHandle(() => {
                    const buttons = document.querySelectorAll('button');
                    for (const btn of buttons) {
                        const text = btn.innerText.toLowerCase().trim();
                        if (text === 'post' || text === 'publicar') {
                            return btn;
                        }
                    }
                    return null;
                });
                
                const btnElement = stillHasButton ? stillHasButton.asElement() : null;
                if (btnElement) {
                    const isDisabled = await frame.evaluate(btn => btn.hasAttribute('disabled') || btn.getAttribute('aria-disabled') === 'true' || btn.classList.contains('disabled'), btnElement);
                    if (!isDisabled) {
                        throw new Error('O botão de publicar continua ativo e habilitado. A publicação pode ter falhado.');
                    }
                    console.log(`[TIKTOK PUPPETEER] Botão de publicar está desabilitado (processando envio). Tratando como SUCESSO.`);
                } else {
                    console.log(`[TIKTOK PUPPETEER] Botão de publicar sumiu da página. Tratando como SUCESSO.`);
                }
            }
        }
        
        console.log(`[TIKTOK PUPPETEER] Aguardando 6 segundos de segurança para conclusão do request no TikTok...`);
        await new Promise(r => setTimeout(r, 6000));
        
        console.log(`[TIKTOK PUPPETEER] ✅ Vídeo publicado com sucesso via Puppeteer!`);
        await browser.close();

        // Cleanup browser user directory
        try {
            if (fs.existsSync(userDataDir)) {
                fs.rmSync(userDataDir, { recursive: true, force: true });
            }
        } catch (e) {}
        
        return {
            success: true,
            publishId: `session_pub_${Date.now()}`,
            url: `https://www.tiktok.com/@${username}`
        };
        
    } catch (err) {
        console.error('[TIKTOK PUPPETEER ERROR]:', err.message);
        if (browser) {
            try {
                const debugDir = path.join(process.cwd(), 'uploads', 'debug');
                if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
                const screenshotPath = path.join(debugDir, `tiktok_error_${Date.now()}.png`);
                const pages = await browser.pages();
                if (pages.length > 0) {
                    await pages[0].screenshot({ path: screenshotPath, fullPage: true });
                    console.log(`[TIKTOK PUPPETEER DEBUG] Screenshot de erro salvo em: ${screenshotPath}`);
                }
            } catch (snapErr) {
                console.warn(`[TIKTOK PUPPETEER DEBUG] Falha ao capturar screenshot de erro:`, snapErr.message);
            }
            await browser.close();
        }
        try {
            if (userDataDir && fs.existsSync(userDataDir)) {
                fs.rmSync(userDataDir, { recursive: true, force: true });
            }
        } catch (e) {}
        throw new Error(`Falha no upload via Sessão TikTok: ${err.message}`);
    }
}
