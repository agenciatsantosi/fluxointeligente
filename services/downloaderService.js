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
 * Desde a versão 2025.11.12 o yt-dlp precisa de um runtime JavaScript externo
 * (deno/node/quickjs) para resolver os desafios do YouTube. Binário antigo simplesmente
 * rejeita a flag `--js-runtimes` e TODAS as tentativas falham com "unrecognized option".
 * Passamos o caminho exato do Node que roda o app para não depender do PATH do servidor.
 */
function getJsRuntimeArgs() {
    const major = Number(String(process.versions?.node || '0').split('.')[0]);
    if (major >= 20) {
        return ['--js-runtimes', `node:${process.execPath}`];
    }
    console.warn('[DOWNLOADER] ⚠️ Node < 20: yt-dlp não conseguirá usar o runtime JS para o YouTube.');
    return [];
}

/**
 * Seletores de formato do yt-dlp, em ordem de preferência.
 *
 * Antes era um seletor único e fixo: `b[ext=mp4]/b`, que exige um MP4 progressivo
 * com áudio e vídeo juntos (itags 18/22). O YouTube vem removendo esses formatos e,
 * sem eles, o yt-dlp aborta com "Requested format is not available" — derrubava boa
 * parte dos vídeos e praticamente todos os Shorts.
 *
 * Ordem atual:
 *  1. vídeo + áudio separados (melhor qualidade, precisa do ffmpeg para mesclar)
 *  2. MP4 progressivo (áudio e vídeo juntos, funciona sem ffmpeg)
 *  3. qualquer formato que dê para juntar
 *
 * Se o ffmpeg faltar, a opção 1 baixa arquivos soltos e nunca gera o .mp4 final —
 * por isso o download tenta as opções em sequência até uma dar certo.
 */
const YTDLP_FORMATS = [
    'bv*[ext=mp4][height<=1080]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b',
    'b[ext=mp4]/b',
    'bv*+ba/b'
];

/**
 * Navegadores cujos perfis existem de fato neste servidor.
 * No VPS não há Chrome/Edge/Firefox: cada tentativa com `--cookies-from-browser`
 * gastava até 45s só para falhar e a mensagem de erro final acabava enganando.
 */
function getInstalledBrowsers() {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    if (!home) return [];

    const candidates = [
        { name: 'edge', paths: [
            path.join(home, 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data'),
            path.join(home, 'Microsoft', 'Edge', 'User Data')
        ]},
        { name: 'chrome', paths: [
            path.join(home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data'),
            path.join(home, '.config', 'google-chrome')
        ]},
        { name: 'firefox', paths: [
            path.join(home, 'AppData', 'Roaming', 'Mozilla', 'Firefox', 'Profiles'),
            path.join(home, '.mozilla', 'firefox')
        ]}
    ];

    return candidates.filter(c => c.paths.some(p => fs.existsSync(p))).map(c => c.name);
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
 * Instâncias públicas do Piped (API alternativa ao YouTube).
 * A lista é curta de propósito: instâncias desses projetos caem com frequência,
 * por isso o Piped vem antes do Invidious (que é bem mais lento).
 */
const PIPED_INSTANCES = [
    'https://api.piped.private.coffee',
    'https://pipedapi.adminforge.de',
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.drgns.space',
    'https://pipedapi.smnz.de',
    'https://pipedapi.reallyaweso.me'
];

// Usadas só se a lista oficial do Invidious estiver fora do ar
const INVIDIOUS_FALLBACK_INSTANCES = [
    'https://invidious.f5.si',
    'https://invidious.flokinet.to'
];

let invidiousInstancesCache = null;
let invidiousInstancesFetchedAt = 0;
const INVIDIOUS_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 horas

/**
 * Busca a lista oficial de instâncias do Invidious com API pública.
 * A lista fixa da app ficou quase toda morta (403/401/DNS), então agora a lista
 * é descoberta em tempo de execução e guardada por 6 horas.
 */
async function getInvidiousInstances() {
    const now = Date.now();
    if (invidiousInstancesCache && (now - invidiousInstancesFetchedAt) < INVIDIOUS_CACHE_TTL_MS) {
        return invidiousInstancesCache;
    }

    try {
        const res = await axios.get('https://api.invidious.io/instances.json?sort_by=type,users', { timeout: 10000 });
        const instances = (Array.isArray(res.data) ? res.data : [])
            .filter(([, meta]) => meta && meta.api === true && meta.type === 'https' && meta.uri)
            .map(([, meta]) => String(meta.uri).replace(/\/$/, ''));

        invidiousInstancesCache = [...new Set([...instances, ...INVIDIOUS_FALLBACK_INSTANCES])];
        console.log(`[DOWNLOADER] 📋 ${invidiousInstancesCache.length} instâncias Invidious disponíveis.`);
    } catch (err) {
        console.warn('[DOWNLOADER] ⚠️ Lista de instâncias Invidious indisponível, usando fallback:', err.message);
        invidiousInstancesCache = INVIDIOUS_FALLBACK_INSTANCES;
    }

    invidiousInstancesFetchedAt = now;
    return invidiousInstancesCache;
}

/**
 * Extrai o vídeo via API do Piped.
 * Diferente do Invidious, os links devolvidos já vêm pelo proxy da instância
 * (proxy.piped.private.coffee/...), então o download funciona de qualquer IP.
 */
async function fetchYouTubeWithPiped(url) {
    const videoId = extractYoutubeId(url);
    if (!videoId) return null;

    for (const instance of PIPED_INSTANCES) {
        console.log(`[DOWNLOADER] 🔄 Tentando API Piped (${instance}) para YouTube...`);
        try {
            const response = await axios.get(`${instance}/streams/${videoId}`, { timeout: 12000 });

            // Prioriza MP4 progressivo (áudio + vídeo juntos) para não depender do ffmpeg
            const streams = (response.data?.videoStreams || [])
                .filter(s => s && s.url && !s.videoOnly && s.format !== 'HLS')
                .sort((a, b) => (b.height || 0) - (a.height || 0));
            const mp4Stream = streams.find(s => s.format === 'MPEG_4') || streams[0];

            if (mp4Stream && mp4Stream.url) {
                console.log(`[DOWNLOADER] 🎯 API Piped (${instance}) retornou link com sucesso!`);
                return {
                    title: response.data.title || 'YouTube Video',
                    mediaUrl: mp4Stream.url,
                    thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
                    duration: response.data.duration || null,
                    type: 'video',
                    platform: 'youtube',
                    sourceUrl: url
                };
            }
        } catch (err) {
            console.warn(`[DOWNLOADER] ⚠️ Piped (${instance}) falhou: ${err.message}`);
        }
    }

    return null;
}

/**
 * Extrai o vídeo via API do Invidious.
 *
 * IMPORTANTE: a URL crua do formato (googlevideo.com) vem amarrada ao IP da
 * instância (parâmetro `ip=` na query). Baixar ela direto do servidor sempre
 * retorna 403. Por isso usamos o endpoint /latest_version com local=true, que
 * retransmite o arquivo pelo próprio Invidious — funciona de qualquer IP, bem
 * mais devagar.
 */
async function fetchYouTubeWithInvidious(url) {
    const videoId = extractYoutubeId(url);
    if (!videoId) return null;

    const instances = await getInvidiousInstances();

    for (const instance of instances) {
        console.log(`[DOWNLOADER] 🔄 Tentando API Invidious (${instance}) para YouTube...`);
        try {
            const response = await axios.get(`${instance}/api/v1/videos/${videoId}`, { timeout: 10000 });
            const streams = response.data?.formatStreams || [];
            const mp4Stream = streams.find(s => s.container === 'mp4' && s.url) || streams[0];

            if (mp4Stream && mp4Stream.itag) {
                const proxiedUrl = `${instance}/latest_version?id=${videoId}&itag=${mp4Stream.itag}&local=true`;
                console.log(`[DOWNLOADER] 🎯 API Invidious (${instance}) retornou link com sucesso!`);
                return {
                    title: response.data.title || 'YouTube Video',
                    mediaUrl: proxiedUrl,
                    thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
                    duration: response.data.lengthSeconds || null,
                    type: 'video',
                    platform: 'youtube',
                    sourceUrl: url
                };
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
            ...getJsRuntimeArgs(),
            '--format', YTDLP_FORMATS[0],
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
                    '--format', YTDLP_FORMATS[0]
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

        // Só tenta cookies de navegador se o perfil existir de fato neste servidor.
        // No VPS nenhum navegador está instalado: antes gastávamos ~2 minutos em
        // tentativas que nunca poderiam dar certo.
        const installedBrowsers = getInstalledBrowsers();
        if (!success && installedBrowsers.length > 0) {
            for (const browser of installedBrowsers) {
                console.log(`[DOWNLOADER] 🍪 Tentando análise com cookies do ${browser}...`);
                try {
                    const res = await execFileAsync(executable, [
                        url,
                        '--dump-json',
                        '--playlist-end', '15',
                        '--no-warnings',
                        ...getJsRuntimeArgs(),
                        '--format', YTDLP_FORMATS[0],
                        '--cookies-from-browser', browser
                    ], { timeout: 45000 });
                    if (res.stdout && res.stdout.trim() !== '') {
                        stdout = res.stdout;
                        success = true;
                        break;
                    }
                    lastError = new Error(`yt-dlp retornou vazio usando cookies do ${browser}`);
                } catch (err) {
                    lastError = err;
                }
            }
        } else if (!success) {
            console.log(`[DOWNLOADER] 🍪 Nenhum navegador instalado neste servidor — pulando leitura de cookies.`);
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

            // Verificado antes do bloco do YouTube: esse erro genérico engolia a
            // dica que resolve a maioria dos casos de vídeo privado.
            if (lastError && lastError.message && lastError.message.includes('Could not copy Chrome cookie database')) {
                throw new Error('Feche o Google Chrome! O vídeo é privado ou requer login, e o navegador bloqueou o acesso aos cookies.');
            }

            // Fallback para YouTube em VPS (onde yt-dlp costuma ser bloqueado por IP de datacenter)
            if (url.includes('youtube.com') || url.includes('youtu.be')) {
                console.log(`[DOWNLOADER] 🛡️ yt-dlp falhou — tentando extratores externos de YouTube (Piped/Invidious)...`);

                // Fallback 1: Piped — o link já vem pelo proxy da instância (não depende de IP)
                const pipedFallback = await fetchYouTubeWithPiped(url);
                if (pipedFallback) return pipedFallback;

                // Fallback 2: Invidious — usa o endpoint de proxy /latest_version
                const invidiousFallback = await fetchYouTubeWithInvidious(url);
                if (invidiousFallback) return invidiousFallback;

                throw new Error(
                    'Não foi possível extrair o vídeo do YouTube: o yt-dlp e as APIs externas (Piped/Invidious) falharam. ' +
                    'Confira se o yt-dlp está atualizado em /bin. ' +
                    `Detalhe: ${lastError ? lastError.message : 'sem retorno'}`
                );
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

        // No YouTube o `description` é o texto longo do vídeo: usá-lo como título
        // faria o app postar a descrição inteira na legenda. Lá o certo é o title.
        const isYoutube = /youtube\.com|youtu\.be/.test(url) || String(info.extractor_key || '').toLowerCase() === 'youtube';
        const rawTitle = isYoutube
            ? (info.title || 'YouTube Video')
            : (info.description || info.title || 'Sem título');
        const title = cleanFbTitle(rawTitle).slice(0, 220).trim() || 'Sem título';

        return {
            title: title,
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

        // YouTube: o `url` vindo do fetchMediaInfo é um link de googlevideo.com
        // assinado e amarrado ao IP de quem extraiu. Baixá-lo direto com axios
        // quase sempre dá 403 (e expira em ~6h), então gastávamos um timeout
        // inteiro garantido. Nesse caso quem baixa é o yt-dlp, direto do link
        // original — que é o caminho que funciona.
        const isYoutubeSource = !!(sourceUrl && /youtube\.com|youtu\.be/.test(sourceUrl));
        if (isYoutubeSource) {
            console.log(`[DOWNLOADER] 📥 Link do YouTube: baixando via yt-dlp (link direto não funciona).`);
        }

        if (url && url.startsWith('http') && url !== 'DEFERRED' && !isYoutubeSource) {
            console.log(`[DOWNLOADER] 📥 Download direto (Método Manual): ${url.substring(0, 50)}...`);
            try {
                const response = await axios({
                    url,
                    method: 'GET',
                    responseType: 'stream',
                    // Generoso de propósito: links proxied do Piped/Invidious podem
                    // demorar dezenas de segundos só para começar a responder.
                    timeout: 120000,
                    maxRedirects: 5,
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
            const executable = getYtDlpExecutable();
            console.log(`[DOWNLOADER] 🔄 Baixando mídia via yt-dlp: ${sourceUrl}`);

            await acquireLock();
            try {
                const cookiesArg = getCookiesArgument();
                if (cookiesArg.length > 0) {
                    console.log(`[DOWNLOADER] 🍪 Utilizando cookies.txt para download`);
                }

                const browserList = getInstalledBrowsers();
                // Cada tentativa = (formato x origem dos cookies). Formatos primeiro
                // porque so o primeiro precisa de ffmpeg para mesclar as faixas.
                const attempts = [
                    ...YTDLP_FORMATS.map(format => ({ format, cookies: cookiesArg, browser: null })),
                    ...browserList.flatMap(browser =>
                        YTDLP_FORMATS.map(format => ({ format, cookies: ['--cookies-from-browser', browser], browser }))
                    )
                ];

                // Erro sem navegador e o que explica o caso comum (formato/ffmpeg).
                // O erro de cookies do Chrome so vale a mensagem se nao houver outro.
                let primaryErr = null;
                let lastYtErr = null;

                // O yt-dlp deixa lixo quando tenta mesclar sem ffmpeg (arquivos .f140.m4a,
                // .f399.mp4 soltos na pasta). Limpa antes de cada tentativa.
                const cleanupFragments = () => {
                    try {
                        const base = path.basename(localPath).replace(/\.[^.]+$/, '');
                        for (const f of fs.readdirSync(dir)) {
                            if (f !== path.basename(localPath) && f.startsWith(base)) {
                                try { fs.unlinkSync(path.join(dir, f)); } catch (_) {}
                            }
                        }
                    } catch (_) {}
                };

                for (const attempt of attempts) {
                    cleanupFragments();
                    try {
                        await execFileAsync(executable, [
                            sourceUrl,
                            '-o', localPath,
                            '--no-playlist',
                            '--no-warnings',
                            ...getJsRuntimeArgs(),
                            '--format', attempt.format,
                            ...attempt.cookies,
                            '--add-header', 'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
                        ], { timeout: 180000 });

                        if (fs.existsSync(localPath) && fs.statSync(localPath).size > 1024 * 10) {
                            success = true;
                            lastYtErr = null;
                            break;
                        }

                        const mergeErr = new Error('yt-dlp baixou as faixas separadas mas nao gerou o .mp4 final (ffmpeg ausente no servidor)');
                        lastYtErr = mergeErr;
                        if (!attempt.browser) primaryErr = mergeErr;
                    } catch (err) {
                        lastYtErr = err;
                        if (!attempt.browser && !primaryErr) primaryErr = err;
                        const reason = String(err.message || '').split('\n').map(s => s.trim()).filter(Boolean).pop() || err.message;
                        console.warn(`[DOWNLOADER] ⚠️ Falhou (formato "${attempt.format}"${attempt.browser ? `, cookies do ${attempt.browser}` : ''}): ${reason}`);
                    }
                }

                if (!success) {
                    cleanupFragments();
                }

                if (!success && lastYtErr) {
                    throw primaryErr || lastYtErr;
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
 * Le a data da versao do yt-dlp (`--version` -> "2026.09.27.232945").
 * Retorna null se nao der para determinar (ex.: binario corrompido).
 */
async function getYtDlpVersionDate(executable) {
    try {
        const { stdout } = await execFileAsync(executable, ['--version'], { timeout: 30000 });
        const match = String(stdout).match(/(\d{4})\.(\d{2})\.(\d{2})/);
        if (!match) return null;
        return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    } catch (e) {
        console.warn(`[DOWNLOADER] ⚠️ Não foi possível ler a versão do yt-dlp: ${e.message}`);
        return null;
    }
}

/**
 * YouTube muda de extractor com frequencia; binarios velhos simplesmente param de
 * extrair, sem erro claro. 14 dias e folgado o bastante para nao atualizar a cada boot.
 */
const YTDLP_MAX_AGE_DAYS = 14;

function isYtDlpOutdated(versionDate) {
    if (!versionDate) return true;
    return (Date.now() - versionDate.getTime()) > YTDLP_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

function describeYtDlpAge(versionDate) {
    if (!versionDate) return 'versão desconhecida';
    const days = Math.floor((Date.now() - versionDate.getTime()) / (24 * 60 * 60 * 1000));
    return days <= 0 ? 'atualizado hoje' : `v${versionDate.toISOString().slice(0, 10)} (${days}d atrás)`;
}

/**
 * Garante que o binario do yt-dlp exista e esteja atualizado.
 *
 * Antes o binario era baixado uma unica vez e nunca mais verificado. Com o
 * yt-dlp >= 2025.11.12 o YouTube passou a exigir runtime JS, e um binario antigo
 * rejeita a flag `--js-runtimes` derrubando TODAS as extracoes. Por isso agora a
 * versao e conferida no boot e o binario e atualizado quando necessario.
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
            const executable = getYtDlpExecutable();
            const versionDate = await getYtDlpVersionDate(executable);
            console.log(`[DOWNLOADER] yt-dlp encontrado em ${binPath} — ${describeYtDlpAge(versionDate)}.`);

            if (!isYtDlpOutdated(versionDate)) {
                return true;
            }

            console.log('[DOWNLOADER] ⬆️ yt-dlp desatualizado. Tentando auto-update (-U)...');
            try {
                await execFileAsync(executable, ['-U', '--no-warnings'], { timeout: 120000 });
            } catch (updateErr) {
                console.warn(`[DOWNLOADER] ⚠️ Auto-update falhou (${updateErr.message}). Baixando do GitHub...`);
            }

            const updatedDate = await getYtDlpVersionDate(getYtDlpExecutable());
            if (!isYtDlpOutdated(updatedDate)) {
                console.log(`[DOWNLOADER] ✅ yt-dlp atualizado para ${describeYtDlpAge(updatedDate)}.`);
                return true;
            }

            console.warn('[DOWNLOADER] ⚠️ Auto-update não resolveu. Baixando a última release do GitHub...');
        } else {
            console.log(`[DOWNLOADER] yt-dlp não encontrado. Baixando para ${process.platform} do GitHub...`);
        }

        const url = isWin 
            ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
            : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';

        // Baixa para .tmp e só então substitui: se cair no meio do download o
        // servidor continua com um binario funcional em vez de um arquivo pela metade.
        const tmpPath = `${binPath}.download`;
        const writer = fs.createWriteStream(tmpPath);
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream',
            timeout: 120000
        });

        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        if (fs.existsSync(binPath)) {
            try { fs.unlinkSync(binPath); } catch (_) {}
        }
        fs.renameSync(tmpPath, binPath);

        if (!isWin) {
            fs.chmodSync(binPath, 0o755);
        }

        console.log(`[DOWNLOADER] yt-dlp baixado com sucesso em ${binPath}`);
        return true;
    } catch (e) {
        console.error('[DOWNLOADER] Erro ao baixar o yt-dlp:', e.message);
        return false;
    }
}