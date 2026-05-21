import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import * as db from './database.js';
import puppeteer from 'puppeteer';

const execFileAsync = promisify(execFile);
const YTDLP_BIN_WIN = path.join(process.cwd(), 'bin', 'yt-dlp.exe');
const YTDLP_BIN_LINUX = path.join(process.cwd(), 'bin', 'yt-dlp');

// Global semaphore to prevent multiple concurrent yt-dlp processes
let ytdlpLock = false;
const queue = [];

async function acquireLock() {
    if (!ytdlpLock) {
        ytdlpLock = true;
        return;
    }
    return new Promise(resolve => queue.push(resolve));
}

function releaseLock() {
    if (queue.length > 0) {
        const next = queue.shift();
        next();
    } else {
        ytdlpLock = false;
    }
}

function getYtDlpExecutable() {
    if (process.platform === 'win32') {
        return fs.existsSync(YTDLP_BIN_WIN) ? YTDLP_BIN_WIN : 'yt-dlp';
    } else {
        return fs.existsSync(YTDLP_BIN_LINUX) ? YTDLP_BIN_LINUX : 'yt-dlp';
    }
}

function getCookiesArgument() {
    const rootCookies = path.join(process.cwd(), 'cookies.txt');
    const binCookies = path.join(process.cwd(), 'bin', 'cookies.txt');
    
    if (fs.existsSync(rootCookies)) {
        return ['--cookies', rootCookies];
    }
    if (fs.existsSync(binCookies)) {
        return ['--cookies', binCookies];
    }
    return [];
}

function cleanFbTitle(text) {
    if (!text) return 'Sem título';
    const regex = /^[\d.,]+[KMBkmb]?\s+views?\s*(?:·|-|\|)\s*(?:[\d.,]+[KMBkmb]?\s+(?:reactions?|likes?)\s*\|\s*)?/i;
    return text.replace(regex, '').trim() || 'Sem título';
}

/**
 * Unified Puppeteer extractor for Facebook and Instagram.
 * Intercepts video/image CDN requests and reads og:image/og:video meta tags.
 * Works as a robust fallback for both photos and videos.
 */
async function fetchSocialMediaWithPuppeteer(url) {
    console.log(`[DOWNLOADER] 🤖 Puppeteer extractor ativado para URL: ${url}`);
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
        });
        const page = await browser.newPage();

        let capturedVideoUrl = null;
        let capturedImageUrl = null;

        // Intercept network requests to capture CDN media URLs
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const reqUrl = req.url();
            
            // Capture Video URLs
            if (!capturedVideoUrl &&
                (reqUrl.includes('fbcdn.net') || reqUrl.includes('cdninstagram.com')) &&
                (reqUrl.includes('.mp4') || reqUrl.includes('video') || reqUrl.includes('v19') || reqUrl.includes('v16'))
            ) {
                capturedVideoUrl = reqUrl;
                console.log(`[DOWNLOADER] 🎯 Puppeteer interceptou URL do vídeo: ${reqUrl.substring(0, 80)}...`);
            }
            
            // Capture Image URLs (High Res)
            if (!capturedImageUrl &&
                (reqUrl.includes('fbcdn.net') || reqUrl.includes('cdninstagram.com')) &&
                (reqUrl.includes('.jpg') || reqUrl.includes('.jpeg') || reqUrl.includes('.png') || reqUrl.includes('_n.jpg') || reqUrl.includes('p720x720') || reqUrl.includes('e35'))
            ) {
                capturedImageUrl = reqUrl;
            }
            req.continue();
        });

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

        try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        } catch (navErr) {
            console.warn(`[DOWNLOADER] Puppeteer nav timeout (continuando): ${navErr.message}`);
        }

        // Wait a bit for lazy-loading if no video captured yet
        if (!capturedVideoUrl) {
            await new Promise(r => setTimeout(r, 3000));
        }

        // Extract OpenGraph tags and descriptions
        const ogData = await page.evaluate(() => {
            const ogVideo = document.querySelector('meta[property="og:video"]');
            const ogImage = document.querySelector('meta[property="og:image"]');
            const twImage = document.querySelector('meta[name="twitter:image"]');
            
            // Text extractors: Meta tags often truncate text. Let's try to get the full text from JSON-LD or DOM first.
            let fullText = null;

            try {
                // Try JSON-LD (Schema.org) which often contains the full un-truncated text
                const scripts = document.querySelectorAll('script[type="application/ld+json"]');
                for (const script of scripts) {
                    const data = JSON.parse(script.textContent);
                    if (data && Array.isArray(data)) {
                        for (const item of data) {
                            if (item.articleBody) fullText = item.articleBody;
                            else if (item.caption) fullText = item.caption;
                            else if (item.text) fullText = item.text;
                        }
                    } else if (data) {
                        if (data.articleBody) fullText = data.articleBody;
                        else if (data.caption) fullText = data.caption;
                        else if (data.text) fullText = data.text;
                    }
                    if (fullText) break;
                }
            } catch (e) {}

            // Try Instagram specific DOM (the caption is usually inside the single h1 on the post page)
            if (!fullText && window.location.href.includes('instagram.com')) {
                const h1 = document.querySelector('h1');
                if (h1 && h1.innerText && h1.innerText.length > 20) {
                    fullText = h1.innerText;
                } else {
                    // Fallback to searching spans with many words
                    const spans = Array.from(document.querySelectorAll('span')).filter(s => s.innerText && s.innerText.length > 50);
                    if (spans.length > 0) fullText = spans[0].innerText;
                }
            }

            // Try Facebook specific DOM
            if (!fullText && window.location.href.includes('facebook.com')) {
                // Helper to preserve line breaks
                const extractTextWithFormatting = (el) => {
                    if (!el) return '';
                    let text = '';
                    const walk = (node) => {
                        if (node.nodeType === 3) { // Text node
                            text += node.nodeValue;
                        } else if (node.nodeType === 1) { // Element
                            const tag = node.tagName.toLowerCase();
                            if (tag === 'br') text += '\n';
                            else if (tag === 'div' || tag === 'p') {
                                if (text.length > 0 && !text.endsWith('\n')) text += '\n';
                                node.childNodes.forEach(walk);
                                if (!text.endsWith('\n')) text += '\n';
                            } else {
                                node.childNodes.forEach(walk);
                            }
                        }
                    };
                    walk(el);
                    return text.replace(/\n{3,}/g, '\n\n').trim();
                };

                const messageDiv = document.querySelector('[data-ad-comet-preview="message"]') || document.querySelector('[data-testid="post_message"]');
                if (messageDiv) {
                    fullText = extractTextWithFormatting(messageDiv);
                } else {
                    // Alternative for photo.php: Find the container with the most text that isn't the whole page
                    const autoElements = Array.from(document.querySelectorAll('span[dir="auto"], div[dir="auto"]'));
                    
                    // Em photo.php, o texto geralmente é quebrado em vários divs/spans irmãos.
                    // Vamos tentar achar o elemento "pai" que contém mais blocos dir="auto"
                    let bestParent = null;
                    let maxChars = 0;
                    
                    for (const el of autoElements) {
                        const parent = el.parentElement;
                        if (!parent) continue;
                        const txt = parent.innerText || '';
                        if (txt.length > maxChars && txt.length > 50 && !txt.includes('Comentar como')) {
                            maxChars = txt.length;
                            bestParent = parent;
                        }
                    }
                    
                    if (bestParent) {
                        fullText = extractTextWithFormatting(bestParent);
                    }
                }
            }

            // Fallback to Meta Tags if DOM fails (might be truncated)
            const ogDesc = document.querySelector('meta[property="og:description"]');
            const metaDesc = document.querySelector('meta[name="description"]');
            const ogTitle = document.querySelector('meta[property="og:title"]');
            
            let rawTitle = fullText;
            if (!rawTitle && ogDesc && ogDesc.content) rawTitle = ogDesc.content;
            if (!rawTitle && metaDesc && metaDesc.content) rawTitle = metaDesc.content;
            if (!rawTitle && ogTitle && ogTitle.content) rawTitle = ogTitle.content;
            if (!rawTitle) rawTitle = 'Mídia Social';

            // Clean Instagram default prefixes like "Nome on Instagram: \"texto\""
            let cleanTitle = rawTitle;
            if (!fullText) { // Only clean if it came from meta tags
                const igMatch = cleanTitle.match(/on Instagram:\s*"(.*)"/s);
                if (igMatch && igMatch[1]) {
                    cleanTitle = igMatch[1];
                } else {
                    cleanTitle = cleanTitle.replace(/ - Instagram$/, '').replace(/^.*? on Instagram: /, '');
                }
            }
            
            // Clean Facebook title if it contains " - Facebook" or similar
            cleanTitle = cleanTitle.replace(/ \| Facebook$/, '').replace(/ - Facebook$/, '').replace(/^.*? no Facebook: /, '');
            
            return {
                video: ogVideo ? ogVideo.content : null,
                image: ogImage ? ogImage.content : (twImage ? twImage.content : null),
                title: cleanTitle.trim() || 'Sem título'
            };
        });

        const platform = url.includes('instagram.com') ? 'instagram' : 'facebook';

        // 1. Prioritize Video
        const finalVideoUrl = capturedVideoUrl || ogData.video;
        if (finalVideoUrl) {
            console.log(`[DOWNLOADER] 🎯 Puppeteer capturou VÍDEO do ${platform}`);
            return {
                title: ogData.title,
                mediaUrl: finalVideoUrl,
                thumbnailUrl: ogData.image,
                duration: null,
                type: 'video',
                platform,
                sourceUrl: url
            };
        }

        // 2. Fallback to Image
        const finalImageUrl = ogData.image || capturedImageUrl;
        if (finalImageUrl) {
            console.log(`[DOWNLOADER] 🎯 Puppeteer capturou IMAGEM do ${platform}`);
            return {
                title: ogData.title,
                mediaUrl: finalImageUrl,
                thumbnailUrl: finalImageUrl,
                duration: null,
                type: 'image',
                platform,
                sourceUrl: url
            };
        }

        console.warn(`[DOWNLOADER] Puppeteer não encontrou mídia na página do ${platform}.`);
        return null;
    } catch (err) {
        console.error(`[DOWNLOADER] Puppeteer extractor falhou: ${err.message}`);
        return null;
    } finally {
        if (browser) {
            try { await browser.close(); } catch (_) {}
        }
    }
}

/**
 * Main service for extracting media info and downloading from various platforms
 */

/**
 * Extracts direct media URL and metadata using yt-dlp
 */
export async function fetchMediaInfo(url) {
    // Normaliza links do Kwai que vêm da busca (yt-dlp não suporta /search/)
    if (url && url.includes('kwai.com/search/')) {
        url = url.replace(/\/search\/([^\/]+)\/video\//, '/@$1/video/');
    }

    // ⚡ ATALHO: Links diretos de foto (Facebook ou Instagram) -> Vai direto pro Puppeteer
    const isPhotoUrl = url && (
        url.includes('facebook.com/photo') ||
        (url.includes('facebook.com') && url.includes('fbid=')) ||
        (url.includes('instagram.com/p/') && !url.includes('reel')) // Posts de imagem do Insta
    );
    if (isPhotoUrl) {
        console.log('[DOWNLOADER] 🖼️ URL de foto detectada — usando extrator via Puppeteer...');
        const imgResult = await fetchSocialMediaWithPuppeteer(url);
        if (imgResult && imgResult.mediaUrl) return imgResult;
        console.warn('[DOWNLOADER] Extrator de imagem falhou, tentando yt-dlp...');
    }

    await acquireLock();
    try {
        let executable = getYtDlpExecutable();
        console.log(`[DOWNLOADER] Analisando URL: ${url}`);
        
        let stdout;
        let success = false;
        let lastError = null;

        // Tentativa 1: Headers normais + cookies.txt (se existir)
        const args1 = [
            url,
            '--dump-json',
            '--no-playlist',
            '--no-warnings',
            '--format', 'b[ext=mp4]/b',
            '--add-header', 'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        ];
        const cookiesArg = getCookiesArgument();
        if (cookiesArg.length > 0) {
            args1.push(...cookiesArg);
            console.log(`[DOWNLOADER] 🍪 Utilizando cookies.txt para análise`);
        }

        try {
            const res = await execFileAsync(executable, args1, { timeout: 60000 });
            stdout = res.stdout;
            success = true;
        } catch (err) {
            lastError = err;
        }

        // Tentativa 2: Sem headers / Sem cookies (caso seja bloqueio de User-Agent)
        if (!success) {
            console.log(`[DOWNLOADER] 🔄 Tentando análise sem headers ou cookies...`);
            try {
                const res = await execFileAsync(executable, [
                    url,
                    '--dump-json',
                    '--no-playlist',
                    '--no-warnings',
                    '--format', 'b[ext=mp4]/b'
                ], { timeout: 30000 });
                stdout = res.stdout;
                success = true;
            } catch (err) {
                lastError = err;
            }
        }

        // Tentativa 3: Browser Cookies (Edge / Firefox) para TikTok / Instagram
        // NOTA: Chrome é omitido pois falha quando o Chrome está aberto (DB locked no Windows)
        if (!success) {
            console.log(`[DOWNLOADER] 🍪 Tentando análise com cookies do Edge...`);
            try {
                const res = await execFileAsync(executable, [
                    url,
                    '--dump-json',
                    '--no-playlist',
                    '--no-warnings',
                    '--format', 'b[ext=mp4]/b',
                    '--cookies-from-browser', 'edge'
                ], { timeout: 45000 });
                stdout = res.stdout;
                success = true;
            } catch (edgeErr) {
                // Tenta Firefox como alternativa
                console.log(`[DOWNLOADER] 🍪 Edge falhou, tentando Firefox...`);
                try {
                    const res2 = await execFileAsync(executable, [
                        url,
                        '--dump-json',
                        '--no-playlist',
                        '--no-warnings',
                        '--format', 'b[ext=mp4]/b',
                        '--cookies-from-browser', 'firefox'
                    ], { timeout: 45000 });
                    stdout = res2.stdout;
                    success = true;
                } catch (firefoxErr) {
                    lastError = firefoxErr;
                }
            }
        }

        // Tentativa 4: Puppeteer genérico para Instagram e Facebook caso yt-dlp falhe (fotos/vídeos difíceis)
        if (!success && (url.includes('facebook.com') || url.includes('fb.com') || url.includes('instagram.com'))) {
            console.log(`[DOWNLOADER] 🤖 yt-dlp falhou na rede social — tentando Puppeteer...`);
            releaseLock();
            const puppeteerResult = await fetchSocialMediaWithPuppeteer(url);
            if (puppeteerResult && puppeteerResult.mediaUrl) {
                return puppeteerResult;
            }
            // Re-acquire lock para o bloco finally
            await acquireLock();
        }

        if (!success) {
            if (url.includes('.mp4') || url.includes('.mov')) {
                return { title: 'Vídeo Direto', mediaUrl: url, platform: 'video', sourceUrl: url };
            }
            throw new Error(`Não foi possível analisar o link: ${lastError ? lastError.message : 'Todas as tentativas de análise falharam'}`);
        }

        const info = JSON.parse(stdout);
        
        // Tenta encontrar o melhor link de vídeo direto (MP4) que contenha ÁUDIO
        let bestVideoUrl = null;
        const formats = info.formats || [];

        // 1. Procurar formatos explícitos com áudio e vídeo juntos (pre-mesclados)
        const bestMp4WithAudio = [...formats].reverse().find(f => 
            f.ext === 'mp4' && f.vcodec !== 'none' && f.acodec !== 'none' && f.url && !f.url.includes('manifest') && !f.url.includes('m3u8')
        );

        if (bestMp4WithAudio) {
            bestVideoUrl = bestMp4WithAudio.url;
        }

        // 2. Fallback: Se info.url estiver presente e aparentar ter áudio
        if (!bestVideoUrl && info.url && !info.url.includes('manifest') && !info.url.includes('m3u8')) {
            if (info.acodec !== 'none') {
                bestVideoUrl = info.url;
            }
        }

        // 3. Fallback: Qualquer outro formato MP4 (melhor que falhar)
        if (!bestVideoUrl) {
            const anyMp4 = [...formats].reverse().find(f => f.ext === 'mp4' && f.url && !f.url.includes('manifest') && !f.url.includes('m3u8'));
            if (anyMp4) bestVideoUrl = anyMp4.url;
        }

        // 4. Último recurso absoluto
        if (!bestVideoUrl) bestVideoUrl = info.url;

        // EXTRAÇÃO DE THUMBNAIL ELITE
        let bestThumb = info.thumbnail;
        if (info.thumbnails && info.thumbnails.length > 0) {
            const sortedThumbs = [...info.thumbnails].sort((a, b) => (b.width || 0) - (a.width || 0));
            const filteredThumbs = sortedThumbs.filter(t => t.url && !t.url.includes('placeholder'));
            if (filteredThumbs.length > 0) bestThumb = filteredThumbs[0].url;
        }

        return {
            title: cleanFbTitle(info.description || info.title || 'Sem título'),
            mediaUrl: bestVideoUrl, 
            thumbnailUrl: bestThumb,
            duration: info.duration,
            type: 'video',
            platform: info.extractor_key?.toLowerCase() || 'video',
            sourceUrl: url
        };
    } finally {
        releaseLock();
    }
}

/**
 * Internal helper to download media to local storage for stable posting
 */
export async function downloadToLocal(url, sourcePlatform = 'video', sourceUrl = null) {
    try {
        let success = false;
        const filename = `${sourcePlatform || 'media'}_${crypto.randomUUID()}.mp4`;
        const dir = path.join(process.cwd(), 'uploads', 'downloads');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const localPath = path.join(dir, filename);

        // ESTRATÉGIA ÚNICA E SIMPLES (Igual ao modo manual que funciona)
        // Tentamos baixar o link fornecido diretamente via Axios primeiro.
        if (url && url.startsWith('http') && url !== 'DEFERRED') {
            console.log(`[DOWNLOADER] 📥 Download direto (Método Manual): ${url.substring(0, 50)}...`);
            try {
                const response = await axios({
                    url,
                    method: 'GET',
                    responseType: 'stream',
                    timeout: 60000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                        'Referer': 'https://www.instagram.com/',
                        'Accept': '*/*',
                    }
                });

                const writer = fs.createWriteStream(localPath);
                response.data.pipe(writer);

                await new Promise((resolve, reject) => {
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                });

                const stats = fs.statSync(localPath);
                if (stats.size > 1024 * 50) { 
                    success = true;
                    console.log(`[DOWNLOADER] ✅ Download concluído com sucesso (Axios).`);
                }
            } catch (axiosErr) {
                console.warn(`[DOWNLOADER] ⚠️ Falha no download direto: ${axiosErr.message}`);
            }
        }

        // FALLBACK: Só usa yt-dlp se o de cima falhar OU se for um link de postagem (DEFERRED)
        if (!success && sourceUrl) {
            let executable = getYtDlpExecutable();
            console.log(`[DOWNLOADER] 🔄 Extraindo mídia via yt-dlp: ${sourceUrl}`);
            
            await acquireLock();
            try {
                const dlArgs = [
                    sourceUrl,
                    '-o', localPath,
                    '--no-playlist',
                    '--no-warnings',
                    '--format', 'b[ext=mp4]/b',
                    '--add-header', 'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
                ];
                
                const cookiesArg = getCookiesArgument();
                if (cookiesArg.length > 0) {
                    dlArgs.push(...cookiesArg);
                    console.log(`[DOWNLOADER] 🍪 Utilizando cookies.txt para download`);
                }

                try {
                    await execFileAsync(executable, dlArgs, { timeout: 120000 });
                } catch (ytErr1) {
                    console.warn(`[DOWNLOADER] Falha no yt-dlp padrão. Tentando com cookies do Edge...`);
                    try {
                        const edgeArgs = [
                            sourceUrl, '-o', localPath, '--no-playlist', '--no-warnings',
                            '--format', 'b[ext=mp4]/b', '--cookies-from-browser', 'edge'
                        ];
                        await execFileAsync(executable, edgeArgs, { timeout: 120000 });
                    } catch (ytErr2) {
                        console.warn(`[DOWNLOADER] Falha com Edge. Tentando com Chrome...`);
                        const chromeArgs = [
                            sourceUrl, '-o', localPath, '--no-playlist', '--no-warnings',
                            '--format', 'b[ext=mp4]/b', '--cookies-from-browser', 'chrome'
                        ];
                        await execFileAsync(executable, chromeArgs, { timeout: 120000 });
                    }
                }

                if (fs.existsSync(localPath) && fs.statSync(localPath).size > 1024 * 10) {
                    success = true;
                }
            } catch (ytErr) {
                console.error(`[DOWNLOADER] ❌ Falha no download via yt-dlp: ${ytErr.message}`);
            } finally {
                releaseLock();
            }
        }

        if (success && fs.existsSync(localPath)) {
            // REMOVIDO: Normalização por FFmpeg (pode estar falhando se não estiver no PATH)
            // Vamos apenas retornar o arquivo original que foi baixado com sucesso.
            return { success: true, absolutePath: localPath, filename };
        }

        return { success: false, error: 'Download falhou ou arquivo inválido' };
    } catch (error) {
        console.error('[DOWNLOADER] ❌ Falha no download:', error.message);
        return { success: false, error: error.message };
    }
}
/**
 * Ensures yt-dlp binary exists or provides fallback info
 */
export async function ensureYtDlp() {
    try {
        const binDir = path.join(process.cwd(), 'bin');
        if (!fs.existsSync(binDir)) {
            fs.mkdirSync(binDir, { recursive: true });
        }

        const isWin = process.platform === 'win32';
        const binPath = isWin ? YTDLP_BIN_WIN : YTDLP_BIN_LINUX;

        if (fs.existsSync(binPath)) {
            console.log(`[DOWNLOADER] yt-dlp binary found at ${binPath}.`);
            return true;
        }

        console.log(`[DOWNLOADER] yt-dlp binary not found. Downloading for ${process.platform} from GitHub...`);
        
        const url = isWin 
            ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
            : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';

        const writer = fs.createWriteStream(binPath);
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream',
            timeout: 60000
        });

        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        if (!isWin) {
            fs.chmodSync(binPath, 0o755);
        }

        console.log(`[DOWNLOADER] yt-dlp successfully downloaded to ${binPath}`);
        return true;
    } catch (e) {
        console.error('[DOWNLOADER] Error downloading yt-dlp:', e.message);
        return false;
    }
}