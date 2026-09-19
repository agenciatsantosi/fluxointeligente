import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import * as db from './database.js';
import puppeteer from 'puppeteer';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteerExtra.use(StealthPlugin());

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
        browser = await puppeteerExtra.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
        });
        const page = await browser.newPage();

        let capturedVideoUrl = null;
        const capturedImageUrls = new Set();

        // Intercept network requests to capture CDN media URLs
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const reqUrl = req.url();
            
            // Capture Image URLs directly from network to bypass DOM obfuscation
            // Exclude Instagram here because its carousels are handled specifically later and we don't want profile pics.
            // Note: Instagram images are hosted on fbcdn.net too, so we MUST check url.includes('facebook.com')
            if (req.resourceType() === 'image' &&
                url.includes('facebook.com') &&
                reqUrl.includes('fbcdn.net') &&
                !reqUrl.includes('150x150') && !reqUrl.includes('profile') && !reqUrl.includes('avatar') && !reqUrl.includes('emoji') && !reqUrl.includes('static')
            ) {
                capturedImageUrls.add(reqUrl);
            }
            
            // Capture Video URLs
            if (!capturedVideoUrl &&
                (reqUrl.includes('fbcdn.net') || reqUrl.includes('cdninstagram.com')) &&
                (reqUrl.includes('.mp4') || reqUrl.includes('video') || reqUrl.includes('v19') || reqUrl.includes('v16'))
            ) {
                capturedVideoUrl = reqUrl;
                console.log(`[DOWNLOADER] 🎯 Puppeteer interceptou URL do vídeo: ${reqUrl.substring(0, 80)}...`);
            }
            req.continue();
        });

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

        try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        } catch (navErr) {
            console.warn(`[DOWNLOADER] Puppeteer nav timeout (continuando): ${navErr.message}`);
        }

        // Instagram carousel support - AVANÇA NO CARROSSEL
        if (url.includes('instagram.com')) {
            try {
                // ESTRATÉGIA 1: Extração nativa pelo JSON embutido (100% preciso, pega sem precisar clicar)
                const html = await page.content();
                const carouselIdx = html.indexOf('"carousel_media":[');
                if (carouselIdx !== -1) {
                    let bracketCount = 0;
                    let endIdx = -1;
                    const startIdx = carouselIdx + 17;
                    for (let i = startIdx; i < html.length; i++) {
                        if (html[i] === '[') bracketCount++;
                        else if (html[i] === ']') {
                            bracketCount--;
                            if (bracketCount === 0) {
                                endIdx = i;
                                break;
                            }
                        }
                    }
                    if (endIdx !== -1) {
                        const jsonStr = html.substring(startIdx, endIdx + 1);
                        const arr = JSON.parse(jsonStr);
                        arr.forEach(item => {
                            if (item.image_versions2 && item.image_versions2.candidates && item.image_versions2.candidates.length > 0) {
                                capturedImageUrls.add(item.image_versions2.candidates[0].url);
                            }
                        });
                        console.log(`[DOWNLOADER] 🎯 Encontradas ${arr.length} imagens no JSON nativo!`);
                    }
                }

                // ESTRATÉGIA 2: Fallback clicando no botão Next caso o JSON não funcione
                if (capturedImageUrls.size < 2) {
                    await page.waitForSelector('article', { timeout: 4000 }).catch(() => {});

                    for (let i = 0; i < 10; i++) {
                        // Only grab images from the article to avoid grid thumbnails (which are usually 13+ images)
                        let targetSelector = 'article img';
                        const hasArticle = await page.$('article');
                        if (!hasArticle) targetSelector = 'img'; // Fallback if no article

                        const imgsBefore = await page.$$eval(targetSelector, imgs => {
                            return imgs.map(img => {
                                const rect = img.getBoundingClientRect();
                                return {
                                    src: img.src,
                                    width: rect.width || img.width,
                                    height: rect.height || img.height
                                };
                            });
                        });
                        
                        imgsBefore.forEach(imgData => {
                            const img = imgData.src;
                            if (img.includes('cdninstagram.com') && !img.includes('150x150') && !img.includes('profile') && !img.includes('avatar') && !img.includes('static')) {
                                // Ignore small thumbnails (usually grid thumbnails are < 300px, main images are > 400px)
                                if (imgData.width > 300 || imgData.height > 300) {
                                    capturedImageUrls.add(img);
                                }
                            }
                        });

                        const nextButton = await page.$('button[aria-label="Next"]') || await page.$('button._afxw') || await page.$('svg[aria-label="Next"]');
                        if (!nextButton) break;

                        await nextButton.click().catch(() => {});
                        await new Promise(r => setTimeout(r, 1200));
                    }
                }
            } catch (e) {
                console.log('Carousel extraction failed:', e.message);
            }
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
                    // Fallback to searching spans with many words, but ignore login wall garbage
                    const spans = Array.from(document.querySelectorAll('span')).filter(s => {
                        const txt = s.innerText || '';
                        return txt.length > 50 && 
                               !txt.includes('Log In') && 
                               !txt.includes('Sign Up') &&
                               !txt.includes('By continuing, you agree') &&
                               !txt.includes('Ao continuar, você concorda') &&
                               !txt.includes('Terms of Use') &&
                               !txt.includes('Termos de Uso');
                    });
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

            // Fallback to Meta Tags if DOM fails
            const ogDesc = document.querySelector('meta[property="og:description"]');
            const metaDesc = document.querySelector('meta[name="description"]');
            const ogTitle = document.querySelector('meta[property="og:title"]');
            
            let rawTitle = fullText;
            if (!rawTitle && ogDesc && ogDesc.content) rawTitle = ogDesc.content;
            if (!rawTitle && metaDesc && metaDesc.content) rawTitle = metaDesc.content;
            if (!rawTitle && ogTitle && ogTitle.content) rawTitle = ogTitle.content;
            if (!rawTitle) rawTitle = 'Mídia Social';

            let cleanTitle = rawTitle;
            if (!fullText) { 
                // Handles both 'Username on Instagram: "Caption"' and 'Likes, comments - Username on Date: "Caption"'
                const igMatch = cleanTitle.match(/:\s*"(.*)"/s);
                if (igMatch && igMatch[1]) {
                    cleanTitle = igMatch[1];
                    // Clean trailing quotes or dots like '". '
                    cleanTitle = cleanTitle.replace(/"\.?\s*$/, '');
                } else {
                    cleanTitle = cleanTitle.replace(/ - Instagram$/, '').replace(/^.*? on Instagram: /, '');
                }
            }
            
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

        // Preserve query parameters for Instagram CDN signature, but remove them for others if needed.
        // Actually, it's safer to keep them for all modern CDNs (Tiktok, Facebook, Instagram)
        const finalImages = [...new Set(
            Array.from(capturedImageUrls)
        )];

        const fallbackImage = ogData.image || (finalImages.length > 0 ? finalImages[0] : null);

        if (finalImages.length >= 2 && platform === 'instagram') {
            console.log(`[DOWNLOADER] 🎯 Puppeteer capturou CARROSSEL (${finalImages.length} imagens) do ${platform}`);
            return {
                title: ogData.title,
                mediaUrl: finalImages[0], 
                mediaUrls: finalImages, 
                thumbnailUrl: fallbackImage,
                duration: null,
                type: 'carousel',
                platform,
                sourceUrl: url
            };
        } else if (fallbackImage || finalImages.length > 0) {
            console.log(`[DOWNLOADER] 🎯 Puppeteer capturou IMAGEM do ${platform}`);
            return {
                title: ogData.title,
                mediaUrl: finalImages.length > 0 ? finalImages[0] : fallbackImage,
                thumbnailUrl: fallbackImage,
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
 * Helper to fetch YouTube media info via external unblocking APIs (Cobalt & Publer)
 * useful when running on a VPS where datacenter IPs are blocked by YouTube.
 */
async function fetchYouTubeWithExternalApi(url) {
    const cobaltInstances = [
        'https://cobalt.hyper.lol/api/json',
        'https://cobalt.api.unblock.casa/api/json',
        'https://api.cobalt.tools/api/json',
        'https://cobalt.unblocker.cc/api/json'
    ];

    for (const apiEndpoint of cobaltInstances) {
        console.log(`[DOWNLOADER] 🔄 Tentando extrator de API Externa Cobalt (${apiEndpoint}) para YouTube...`);
        try {
            const response = await axios.post(apiEndpoint, {
                url: url,
                vCodec: 'h264',
                filenamePattern: 'classic'
            }, {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                timeout: 12000
            });

            if (response.data && response.data.url) {
                console.log(`[DOWNLOADER] 🎯 API Externa Cobalt (${apiEndpoint}) retornou link com sucesso!`);
                const videoId = extractYoutubeId(url);
                return {
                    title: 'YouTube Video',
                    mediaUrl: response.data.url,
                    thumbnailUrl: videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : '',
                    duration: null,
                    type: 'video',
                    platform: 'youtube',
                    sourceUrl: url
                };
            }
        } catch (err) {
            console.warn(`[DOWNLOADER] ⚠️ Cobalt (${apiEndpoint}) falhou: ${err.message}`);
        }
    }

    const publerEndpoints = [
        'https://publer.io/api/tools/media-downloader',
        'https://publer.io/api/v1/tools/media-downloader'
    ];

    for (const publerEndpoint of publerEndpoints) {
        try {
            console.log(`[DOWNLOADER] 🔄 Tentando API de Fallback (publer.io - ${publerEndpoint}) para YouTube...`);
            const publerRes = await axios.post(publerEndpoint, {
                url: url
            }, {
                timeout: 15000
            });
            if (publerRes.data && publerRes.data.payload && publerRes.data.payload.length > 0) {
                const videoData = publerRes.data.payload[0];
                const videoId = extractYoutubeId(url);
                return {
                    title: videoData.title || 'YouTube Video',
                    mediaUrl: videoData.path,
                    thumbnailUrl: videoData.thumbnail || (videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : ''),
                    duration: null,
                    type: 'video',
                    platform: 'youtube',
                    sourceUrl: url
                };
            }
        } catch (err) {
            console.warn(`[DOWNLOADER] ⚠️ API de Fallback (publer - ${publerEndpoint}) falhou: ${err.message}`);
        }
    }

    try {
        console.log(`[DOWNLOADER] 🔄 Tentando API de Fallback SaveFrom para YouTube: ${url}`);
        const sfRes = await axios.post('https://worker.savefrom.net/api/convert', {
            url: url
        }, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });

        if (sfRes.data && sfRes.data.url && sfRes.data.url.length > 0) {
            const bestFormat = sfRes.data.url.find(f => f.ext === 'mp4' && f.url) || sfRes.data.url[0];
            if (bestFormat && bestFormat.url) {
                console.log(`[DOWNLOADER] 🎯 API de Fallback SaveFrom retornou link com sucesso!`);
                const videoId = extractYoutubeId(url);
                return {
                    title: sfRes.data.meta?.title || 'YouTube Video',
                    mediaUrl: bestFormat.url,
                    thumbnailUrl: sfRes.data.thumb || (videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : ''),
                    duration: sfRes.data.meta?.duration || null,
                    type: 'video',
                    platform: 'youtube',
                    sourceUrl: url
                };
            }
        }
    } catch (err) {
        console.warn(`[DOWNLOADER] ⚠️ API de Fallback SaveFrom falhou: ${err.message}`);
    }

    return null;
}

async function fetchYouTubeWithInvidious(url) {
    const videoId = extractYoutubeId(url);
    if (!videoId) return null;

    const invidiousInstances = [
        'https://yewtu.be',
        'https://invidious.nerdvpn.de',
        'https://invidious.flokinet.to',
        'https://invidious.projectsegfau.lt',
        'https://invidious.privacydev.net'
    ];

    for (const instance of invidiousInstances) {
        console.log(`[DOWNLOADER] 🔄 Tentando API Invidious (${instance}) para Shorts: ${videoId}`);
        try {
            const response = await axios.get(`${instance}/api/v1/videos/${videoId}`, {
                timeout: 8000
            });

            if (response.data && response.data.formatStreams && response.data.formatStreams.length > 0) {
                const streams = response.data.formatStreams;
                const mp4Stream = streams.find(s => s.container === 'mp4' && s.url) || streams[0];
                
                if (mp4Stream && mp4Stream.url) {
                    console.log(`[DOWNLOADER] 🎯 API Invidious (${instance}) retornou link com sucesso!`);
                    return {
                        title: response.data.title || 'YouTube Video',
                        mediaUrl: mp4Stream.url,
                        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
                        duration: response.data.lengthSeconds || null,
                        type: 'video',
                        platform: 'youtube',
                        sourceUrl: url
                    };
                }
            }
        } catch (err) {
            console.warn(`[DOWNLOADER] ⚠️ Invidious (${instance}) falhou: ${err.message}`);
        }
    }
    return null;
}

function extractYoutubeId(url) {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

/**
 * Extracts direct media URL and metadata using yt-dlp
 */
export async function fetchMediaInfo(url) {
    if (url && url.includes('kwai.com/search/')) {
        url = url.replace(/\/search\/([^\/]+)\/video\//, '/@$1/video/');
    }

    const isPhotoUrl = url && (
        url.includes('facebook.com/photo') ||
        (url.includes('facebook.com') && url.includes('fbid=')) ||
        (url.includes('instagram.com/p/') && !url.includes('reel'))
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

        const args1 = [
            url,
            '--dump-json',
            '--playlist-end', '15',
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
            if (res.stdout && res.stdout.trim() !== '') {
                stdout = res.stdout;
                success = true;
            } else {
                lastError = new Error('yt-dlp retornou vazio na T1');
            }
        } catch (err) {
            lastError = err;
        }

        if (!success) {
            console.log(`[DOWNLOADER] 🔄 Tentando análise sem headers ou cookies...`);
            try {
                const res = await execFileAsync(executable, [
                    url,
                    '--dump-json',
                    '--playlist-end', '15',
                    '--no-warnings',
                    '--format', 'b[ext=mp4]/b'
                ], { timeout: 30000 });
                if (res.stdout && res.stdout.trim() !== '') {
                    stdout = res.stdout;
                    success = true;
                } else {
                    lastError = new Error('yt-dlp retornou vazio na T2');
                }
            } catch (err) {
                lastError = err;
            }
        }

        if (!success) {
            console.log(`[DOWNLOADER] 🍪 Tentando análise com cookies do Edge...`);
            try {
                const res = await execFileAsync(executable, [
                    url,
                    '--dump-json',
                    '--playlist-end', '15',
                    '--no-warnings',
                    '--format', 'b[ext=mp4]/b',
                    '--cookies-from-browser', 'edge'
                ], { timeout: 45000 });
                if (res.stdout && res.stdout.trim() !== '') {
                    stdout = res.stdout;
                    success = true;
                } else {
                    lastError = new Error('yt-dlp retornou vazio na T3 Edge');
                }
            } catch (err) {
                console.log(`[DOWNLOADER] 🍪 Edge falhou, tentando Firefox...`);
                try {
                    const res2 = await execFileAsync(executable, [
                        url,
                        '--dump-json',
                        '--playlist-end', '15',
                        '--no-warnings',
                        '--format', 'b[ext=mp4]/b',
                        '--cookies-from-browser', 'firefox'
                    ], { timeout: 45000 });
                    if (res2.stdout && res2.stdout.trim() !== '') {
                        stdout = res2.stdout;
                        success = true;
                    } else {
                        throw new Error('yt-dlp vazio no Firefox');
                    }
                } catch (firefoxErr) {
                    console.log(`[DOWNLOADER] 🍪 Firefox falhou, tentando Chrome...`);
                    try {
                        const res3 = await execFileAsync(executable, [
                            url,
                            '--dump-json',
                            '--playlist-end', '15',
                            '--no-warnings',
                            '--format', 'b[ext=mp4]/b',
                            '--cookies-from-browser', 'chrome'
                        ], { timeout: 45000 });
                        if (res3.stdout && res3.stdout.trim() !== '') {
                            stdout = res3.stdout;
                            success = true;
                        } else {
                            throw new Error('yt-dlp vazio no Chrome');
                        }
                    } catch (chromeErr) {
                        lastError = chromeErr;
                    }
                }
            }
        }

        if (!success && (url.includes('facebook.com') || url.includes('fb.com') || url.includes('instagram.com'))) {
            console.log(`[DOWNLOADER] 🤖 yt-dlp falhou na rede social — tentando Puppeteer...`);
            releaseLock();
            const puppeteerResult = await fetchSocialMediaWithPuppeteer(url);
            if (puppeteerResult && puppeteerResult.mediaUrl) {
                return puppeteerResult;
            }
            await acquireLock();
        }

        if (!success) {
            if (url.includes('.mp4') || url.includes('.mov')) {
                return { title: 'Vídeo Direto', mediaUrl: url, platform: 'video', sourceUrl: url };
            }
            
            // Fallback para YouTube em VPS (onde yt-dlp costuma ser bloqueado por IP de datacenter)
            if (url.includes('youtube.com') || url.includes('youtu.be')) {
                console.log(`[DOWNLOADER] 🛡️ Iniciando bypass de bloqueio do YouTube via Invidious/Cobalt...`);
                
                // Fallback 1: Invidious (Leve e altamente estável)
                const invFallback = await fetchYouTubeWithInvidious(url);
                if (invFallback) return invFallback;
                
                // Fallback 2: Cobalt/Publer/SaveFrom
                const ytFallback = await fetchYouTubeWithExternalApi(url);
                if (ytFallback) return ytFallback;
            }

            if (lastError && lastError.message && lastError.message.includes('Could not copy Chrome cookie database')) {
                throw new Error('Feche o Google Chrome! O vídeo é privado ou requer login, e o navegador bloqueou o acesso aos cookies.');
            }
            throw new Error(`Não foi possível analisar o link: ${lastError ? lastError.message : 'Todas as tentativas de análise falharam'}`);
        }

        if (!stdout || stdout.trim() === '') {
            throw new Error('O extrator yt-dlp não retornou dados (possível bloqueio de login do Instagram ou falta de cookies válidos).');
        }

        const jsonLines = stdout.trim().split('\n');
        const infos = jsonLines.map(line => {
            try {
                return JSON.parse(line);
            } catch (e) {
                return null;
            }
        }).filter(i => i !== null);

        if (infos.length === 0) {
            throw new Error('yt-dlp não retornou dados JSON válidos.');
        }

        const info = infos[0];

        if (infos.length > 1) {
            const mediaUrls = infos.map(i => i.url || i.thumbnail).filter(u => u);
            return {
                title: info.title || info.description || 'Mídia Social',
                mediaUrl: mediaUrls[0],
                mediaUrls: mediaUrls,
                thumbnailUrl: info.thumbnail || (mediaUrls.length > 0 ? mediaUrls[0] : null),
                type: 'carousel',
                platform: url.includes('instagram.com') ? 'instagram' : 'generic',
                sourceUrl: url
            };
        }

        let bestVideoUrl = null;
        const formats = info.formats || [];

        const bestMp4WithAudio = [...formats].reverse().find(f => 
            f.ext === 'mp4' && f.vcodec !== 'none' && f.acodec !== 'none' && f.url && !f.url.includes('manifest') && !f.url.includes('m3u8')
        );

        if (bestMp4WithAudio) {
            bestVideoUrl = bestMp4WithAudio.url;
        }

        if (!bestVideoUrl && info.url && !info.url.includes('manifest') && !info.url.includes('m3u8')) {
            if (info.acodec !== 'none') {
                bestVideoUrl = info.url;
            }
        }

        if (!bestVideoUrl) {
            const anyMp4 = [...formats].reverse().find(f => f.ext === 'mp4' && f.url && !f.url.includes('manifest') && !f.url.includes('m3u8'));
            if (anyMp4) bestVideoUrl = anyMp4.url;
        }

        if (!bestVideoUrl) bestVideoUrl = info.url;

        let bestThumb = info.thumbnail;
        if (info.thumbnails && info.thumbnails.length > 0) {
            const sortedThumbs = [...info.thumbnails].sort((a, b) => (b.width || 0) - (a.width || 0));
            const filteredThumbs = sortedThumbs.filter(t => t.url && !t.url.includes('placeholder'));
            if (filteredThumbs.length > 0) bestThumb = filteredThumbs[0].url;
        }

        let mediaType = 'video';
        if (
            (bestVideoUrl && (/\.(jpg|jpeg|png|webp)(\?.*)?$/i.test(bestVideoUrl))) ||
            (info.vcodec === 'none' && info.acodec === 'none' && info.ext !== 'mp4' && info.ext !== 'webm' && info.ext !== 'mov')
        ) {
            mediaType = 'image';
        }

        return {
            title: cleanFbTitle(info.description || info.title || 'Sem título'),
            mediaUrl: bestVideoUrl, 
            thumbnailUrl: bestThumb,
            duration: info.duration,
            type: mediaType,
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
export async function downloadToLocal(url, sourcePlatform = 'video', sourceUrl = null, mediaType = 'video') {
    try {
        let success = false;
        
        // Se a URL for DEFERRED, tenta extrair a URL real primeiro
        if (url === 'DEFERRED' && sourceUrl) {
            console.log(`[DOWNLOADER] 🔄 URL Diferida detectada. Extraindo link real da fonte: ${sourceUrl}`);
            const info = await fetchMediaInfo(sourceUrl);
            if (info && info.mediaUrl && info.mediaUrl !== 'DEFERRED') {
                url = info.mediaUrl;
                if (info.type === 'image') mediaType = 'image';
                if (info.type === 'carousel') mediaType = 'carousel';
            } else if (info && info.mediaUrls && info.mediaUrls.length > 0) {
                url = info.mediaUrls[0];
                mediaType = 'carousel';
            } else if (info && info.error) {
                // Se o fetchMediaInfo retornou um erro específico (ex: Feche o Chrome), repassar o erro!
                throw new Error(`Falha ao processar link: ${info.error}`);
            } else {
                throw new Error('Não foi possível extrair a mídia real deste link. Verifique se o post é público.');
            }
        }

        // Determina a extensão baseada no tipo de mídia
        let ext = 'mp4';
        if (mediaType === 'image' || url.includes('.jpg') || url.includes('.png')) ext = 'jpg';
        if (mediaType === 'carousel') ext = 'jpg'; // Carrossel baixa a primeira imagem por enquanto, ou tratar zip no futuro
        
        const filename = `${sourcePlatform || 'media'}_${crypto.randomUUID()}.${ext}`;
        const dir = path.join(process.cwd(), 'uploads', 'downloads');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const localPath = path.join(dir, filename);

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
                        'Referer': url.includes('instagram') ? 'https://www.instagram.com/' : (url.includes('facebook') || url.includes('fbcdn') ? 'https://www.facebook.com/' : 'https://www.google.com/'),
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    }
                });

                const contentType = response.headers['content-type'] || '';
                
                if (contentType.includes('text/html') || contentType.includes('application/json')) {
                    throw new Error(`Servidor retornou um erro ou página ao invés da mídia (Content-Type: ${contentType})`);
                }

                const writer = fs.createWriteStream(localPath);
                response.data.pipe(writer);

                await new Promise((resolve, reject) => {
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                });

                const stats = fs.statSync(localPath);
                
                if (stats.size > 0) { 
                    success = true;
                    console.log(`[DOWNLOADER] ✅ Download concluído com sucesso (Axios). Tamanho: ${Math.round(stats.size/1024)}KB, Tipo: ${contentType}`);
                } else {
                    console.warn(`[DOWNLOADER] ⚠️ Arquivo vazio (${stats.size} bytes).`);
                }
            } catch (axiosErr) {
                console.warn(`[DOWNLOADER] ⚠️ Falha no download direto: ${axiosErr.message}`);
            }
        }

        if (!success && sourceUrl && mediaType !== 'image' && mediaType !== 'carousel') {
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
                if (ytErr.message && ytErr.message.includes('Could not copy Chrome cookie database')) {
                    return { success: false, error: 'Por favor, FECHE O SEU GOOGLE CHROME. O yt-dlp não consegue ler os cookies para baixar o vídeo porque o Chrome está aberto e bloqueando o arquivo.' };
                }
            } finally {
                releaseLock();
            }
        }

        if (success && fs.existsSync(localPath)) {
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