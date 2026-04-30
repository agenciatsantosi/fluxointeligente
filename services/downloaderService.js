import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

puppeteerExtra.use(StealthPlugin());

const execFileAsync = promisify(execFile);
const isWindows = process.platform === 'win32';
const YTDLP_BIN = isWindows 
    ? path.join(process.cwd(), 'bin', 'yt-dlp.exe') 
    : path.join(process.cwd(), 'bin', 'yt-dlp');

// ============================================================
// yt-dlp extractor (works great for TikTok/Facebook, needs cookies for Instagram)
// ============================================================

async function fetchViaYtDlp(url) {
    let executable = YTDLP_BIN;
    
    // Check if local binary exists, otherwise try global command
    if (!fs.existsSync(executable)) {
        console.log('[DOWNLOADER] Binário local não encontrado, tentando comando global "yt-dlp"...');
        executable = 'yt-dlp'; // Use system-wide command
    }

    console.log(`[DOWNLOADER] Extraindo via ${executable}...`);
    const { stdout } = await execFileAsync(executable, [
        url,
        '--dump-json',
        '--no-playlist',
        '--skip-download',
        '--no-warnings',
        '--quiet',
    ], { timeout: 45000, maxBuffer: 10 * 1024 * 1024 });

    const info = JSON.parse(stdout.trim());

    // Pick best direct video URL
    let mediaUrl = '';
    if (info.formats?.length > 0) {
        // Prefer direct mp4 with video codec
        const candidates = info.formats.filter(f =>
            f.url && !f.url.startsWith('blob:') &&
            f.vcodec && f.vcodec !== 'none'
        );
        if (candidates.length > 0) {
            candidates.sort((a, b) => (b.width || 0) - (a.width || 0));
            mediaUrl = candidates[0].url;
        } else {
            const anyUrl = info.formats.filter(f => f.url && !f.url.startsWith('blob:'));
            if (anyUrl.length > 0) mediaUrl = anyUrl[anyUrl.length - 1].url;
        }
    }
    if (!mediaUrl) mediaUrl = info.url || '';
    if (!mediaUrl || mediaUrl.startsWith('blob:')) throw new Error('yt-dlp: URL de mídia inválida');

    // Strip byte-range params
    try {
        const parsed = new URL(mediaUrl);
        parsed.searchParams.delete('bytestart');
        parsed.searchParams.delete('byteend');
        mediaUrl = parsed.toString();
    } catch {}

    const isVideo = !!(info.formats || []).some(f => f.vcodec && f.vcodec !== 'none') ||
                    ['mp4', 'webm', 'mov'].includes(info.ext);

    const platform = url.includes('instagram.com') ? 'instagram'
        : (url.includes('tiktok.com') || url.includes('vm.tiktok.com')) ? 'tiktok'
        : (url.includes('kwai.com') || url.includes('k.kwai.com') || url.includes('kwai-video.com')) ? 'kwai'
        : 'facebook';

    let rawTitle = info.description || info.title || '';
    
    // Limpar títulos lixo como "6.5K views · 71 reactions | Cenasfilmes on Reels"
    if (/views/i.test(rawTitle) && (/reactions/i.test(rawTitle) || /likes/i.test(rawTitle) || /comments/i.test(rawTitle))) {
        rawTitle = '';
    }
    // Limpar genéricos
    const gen = rawTitle.toLowerCase().trim();
    if (gen === 'post' || gen === 'reel' || gen === 'video' || gen.includes('on reels')) {
        rawTitle = '';
    }

    return {
        title: rawTitle,
        thumbnail: info.thumbnail || info.thumbnails?.[info.thumbnails.length - 1]?.url || '',
        mediaUrl,
        type: isVideo ? 'video' : 'image',
        platform,
    };
}

// ============================================================
// Puppeteer extractor (Instagram / Facebook fallback)
// ============================================================

async function fetchViaPuppeteer(url) {
    let browser;
    try {
        browser = await puppeteerExtra.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-infobars',
                '--disable-dev-shm-usage',
                '--window-size=1920,1080',
            ]
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        );
        await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8' });
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            window.chrome = { runtime: {} };
        });

        const capturedUrls = [];
        page.on('response', (response) => {
            const respUrl = response.url();
            const ct = response.headers()['content-type'] || '';
            const isVideo = ct.includes('video/') || respUrl.includes('.mp4');
            const isImage = (ct.includes('image/') || respUrl.includes('.jpg') || respUrl.includes('.webp')) && !ct.includes('svg');
            const isThumbnail = respUrl.includes('dst-jpg') || respUrl.includes('_15.jpg') || respUrl.includes('stp=dst-jpg');
            const isInstagramCDN = respUrl.includes('scontent.cdninstagram.com') || respUrl.includes('fbcdn.net');

            if (isInstagramCDN) {
                if (isVideo) capturedUrls.push({ url: respUrl, type: 'video' });
                else if (isImage && !isThumbnail) capturedUrls.push({ url: respUrl, type: 'image' });
            }
        });

        await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

        const pageUrl = page.url();
        if (pageUrl.includes('/accounts/login/')) {
            throw new Error('Instagram bloqueou o acesso temporariamente. Aguarde alguns minutos e tente novamente.');
        }

        const isInstagram = url.includes('instagram.com');
        const isReel = url.includes('/reel/') || url.includes('/reels/');

        if (isInstagram) {
            try {
                await page.evaluate(() => {
                    window.scrollBy(0, 500);
                    document.querySelectorAll('video').forEach(v => { v.muted = true; v.play().catch(() => {}); });
                });
            } catch {} // ignore context destroyed
            await new Promise(r => setTimeout(r, 6000));
        } else {
            // Let SPA settle after navigation
            await new Promise(r => setTimeout(r, 2000));
        }

        let metaInfo = { ogTitle: '', ogImage: '', ogVideo: '' };
        try {
            metaInfo = await page.evaluate(() => {
                const getMeta = n =>
                    document.querySelector(`meta[property="${n}"]`)?.getAttribute('content') ||
                    document.querySelector(`meta[name="${n}"]`)?.getAttribute('content');
                return {
                    ogTitle: getMeta('og:title') || document.title,
                    ogImage: getMeta('og:image') || getMeta('twitter:image'),
                    ogVideo: getMeta('og:video') || getMeta('og:video:url'),
                };
            });
        } catch (evalErr) {
            console.warn('[DOWNLOADER] page.evaluate falhou (redirect?):', evalErr.message);
        }

        const videoUrls = capturedUrls.filter(c => c.type === 'video');
        const imageUrls = capturedUrls.filter(c => c.type === 'image');
        let mediaUrl = '';
        let type = 'video';

        if (videoUrls.length > 0) {
            const full = videoUrls.filter(c => !c.url.includes('bytestart') && !c.url.includes('byteend'));
            mediaUrl = (full.length > 0 ? full[full.length - 1] : videoUrls[videoUrls.length - 1]).url;
            type = 'video';
        } else if (imageUrls.length > 0 && !isReel) {
            mediaUrl = imageUrls[imageUrls.length - 1].url;
            type = 'image';
        } else if (metaInfo.ogVideo && !metaInfo.ogVideo.startsWith('blob:')) {
            mediaUrl = metaInfo.ogVideo;
            type = 'video';
        }

        if (!mediaUrl || mediaUrl.startsWith('blob:')) {
            throw new Error('Não encontramos a mídia. Verifique se o link está correto e o perfil é público.');
        }

        let finalPuppeteerTitle = metaInfo.ogTitle || '';
        if (/views/i.test(finalPuppeteerTitle) && (/reactions/i.test(finalPuppeteerTitle) || /likes/i.test(finalPuppeteerTitle))) {
            finalPuppeteerTitle = '';
        }
        const pGen = finalPuppeteerTitle.toLowerCase().trim();
        if (pGen === 'post' || pGen === 'reel' || pGen === 'video' || pGen.includes('on reels')) {
            finalPuppeteerTitle = '';
        }

        return {
            title: finalPuppeteerTitle,
            thumbnail: metaInfo.ogImage || '',
            mediaUrl,
            type,
            platform: isInstagram ? 'instagram' : 'facebook',
        };

    } finally {
        if (browser) await browser.close();
    }
}

// ============================================================
// Main entry point - smart routing by platform
// ============================================================

export async function fetchMediaInfo(url) {
    console.log(`[DOWNLOADER] Fetching info for: ${url}`);

    const isTikTok = url.includes('tiktok.com') || url.includes('vm.tiktok.com');
    const isFacebook = url.includes('facebook.com') || url.includes('fb.watch');
    const isKwai = url.includes('kwai.com') || url.includes('k.kwai.com') || url.includes('kwai-video.com');

    // Platforms handled via yt-dlp
    if (isTikTok || isFacebook || isKwai) {
        if (fs.existsSync(YTDLP_BIN)) {
            try {
                const result = await fetchViaYtDlp(url);
                console.log(`[DOWNLOADER] ✅ yt-dlp OK: ${result.type}`);
                return result;
            } catch (ytErr) {
                console.warn(`[DOWNLOADER] yt-dlp falhou: ${ytErr.message}`);
                if (isTikTok) throw new Error(`Não foi possível extrair o vídeo do TikTok: ${ytErr.message}`);
                // Facebook falls through to Puppeteer
            }
        } else {
            console.warn('[DOWNLOADER] yt-dlp não encontrado, usando Puppeteer');
        }
    }

    // Instagram / Facebook fallback → Puppeteer
    return fetchViaPuppeteer(url);
}

export async function ensureYtDlp() { return fs.existsSync(YTDLP_BIN); }

// ============================================================
// Download to local file
// ============================================================

export async function downloadToLocal(url, platform = null, sourceUrl = null) {
    try {
        // Detect source platform from URL or parameter
        let sourcePlatform = platform;
        if (!sourcePlatform || sourcePlatform === 'facebook' || sourcePlatform === 'instagram') {
            const checkUrl = sourceUrl || url;
            if (checkUrl.includes('tiktok.com') || checkUrl.includes('vm.tiktok.com')) sourcePlatform = 'tiktok';
            else if (checkUrl.includes('instagram.com')) sourcePlatform = 'instagram';
            else if (checkUrl.includes('facebook.com') || checkUrl.includes('fb.watch')) sourcePlatform = 'facebook';
            else if (checkUrl.includes('kwai.com')) sourcePlatform = 'kwai';
        }

        const filename = `${sourcePlatform || 'media'}_${uuidv4()}.mp4`;
        const dir = path.join(process.cwd(), 'uploads', 'downloads');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const localPath = path.join(dir, filename);

        // STRATEGY 1: Download via yt-dlp (Stronger for TikTok/FB)
        // We use the sourceUrl (original post) instead of the direct media URL
        const useYtDlp = (sourcePlatform === 'tiktok' || sourcePlatform === 'facebook' || sourcePlatform === 'kwai') && sourceUrl;
        
        if (useYtDlp) {
            let executable = YTDLP_BIN;
            if (!fs.existsSync(executable)) executable = 'yt-dlp';

            console.log(`[DOWNLOADER] Realizando download preventivo via ${executable}: ${sourceUrl}`);
            try {
                await execFileAsync(executable, [
                    sourceUrl,
                    '-o', localPath,
                    '--no-playlist',
                    '--no-warnings',
                    '--quiet'
                ], { timeout: 120000 });
                
                if (fs.existsSync(localPath)) {
                    console.log(`[DOWNLOADER] ✅ Download preventivo (yt-dlp) concluído: ${filename}`);
                    return { success: true, filename, localPath: `/uploads/downloads/${filename}`, absolutePath: localPath };
                }
            } catch (ytErr) {
                console.warn(`[DOWNLOADER] Falha no download via yt-dlp, tentando via Axios: ${ytErr.message}`);
            }
        }

        // STRATEGY 2: Download via Axios (Fallback or for Instagram)
        console.log(`[DOWNLOADER] Realizando download preventivo via Axios: ${url.substring(0, 50)}...`);
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream',
            timeout: 60000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': sourcePlatform === 'instagram' ? 'https://www.instagram.com/' : sourcePlatform === 'tiktok' ? 'https://www.tiktok.com/' : 'https://www.facebook.com/',
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
            }
        });

        const writer = fs.createWriteStream(localPath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                console.log(`[DOWNLOADER] ✅ Download preventivo (Axios) concluído: ${filename}`);
                resolve({ 
                    success: true, 
                    filename, 
                    localPath: `/uploads/downloads/${filename}`, 
                    absolutePath: localPath 
                });
            });
            writer.on('error', (err) => {
                console.error(`[DOWNLOADER] ❌ Erro ao salvar arquivo (Axios): ${err.message}`);
                reject(err);
            });
        });
    } catch (error) {
        console.error('[DOWNLOADER] ❌ Falha no download preventivo:', error.message);
        throw error;
    }
}
