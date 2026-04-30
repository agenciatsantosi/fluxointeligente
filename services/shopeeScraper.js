import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

puppeteerExtra.use(StealthPlugin());

/**
 * Extrai dados completos de um produto da Shopee (imagens e vídeos)
 */
export async function scrapeShopeeProduct(productUrl) {
    const browser = await puppeteerExtra.launch({
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

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        // User agent para evitar detecção
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
        
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8'
        });

        console.log(`[SHOPEE SCRAPER] Navigating to: ${productUrl}`);
        await page.goto(productUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        // Scroll para carregar mídias lazy-load
        await page.evaluate(async () => {
            await new Promise(resolve => {
                let totalHeight = 0;
                let distance = 100;
                let timer = setInterval(() => {
                    let scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;
                    if (totalHeight >= scrollHeight || totalHeight > 3000) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 100);
            });
        });

        await new Promise(r => setTimeout(r, 2000));

        // Extrair dados do produto
        const productData = await page.evaluate(() => {
            const getMeta = n => document.querySelector(`meta[property="${n}"]`)?.getAttribute('content') ||
                                 document.querySelector(`meta[name="${n}"]`)?.getAttribute('content');

            const name = getMeta('og:title') || 
                        document.querySelector('div[class*="product-name"]')?.textContent?.trim() ||
                        document.querySelector('h1')?.textContent?.trim() || '';

            const priceText = document.querySelector('div[class*="product-price"]')?.textContent?.trim() || '0';
            const price = parseFloat(priceText.replace(/[^\d.,]/g, '').replace(',', '.'));

            // Extrair imagens do carrossel/galeria
            const images = [];
            // Priorizar OG Image
            const ogImg = getMeta('og:image');
            if (ogImg) images.push(ogImg);

            document.querySelectorAll('img').forEach(img => {
                const src = img.src;
                if (src && src.includes('cf.shopee.com.br/file/') && !images.includes(src)) {
                    images.push(src);
                }
            });

            return { name, price, images };
        });

        // Extrair vídeos com seletores mais abrangentes
        const videos = await page.evaluate(() => {
            const videoUrls = new Set();

            // 1. Procurar em tags <video>
            document.querySelectorAll('video source').forEach(source => {
                if (source.src && source.src.startsWith('http')) videoUrls.add(source.src);
            });

            document.querySelectorAll('video').forEach(video => {
                if (video.src && video.src.startsWith('http')) videoUrls.add(video.src);
            });

            // 2. Procurar em scripts ou objetos de dados (Shopee costuma guardar a URL no window.__INITIAL_STATE__ ou similar)
            // Mas para simplificar, vamos buscar por strings de vídeo na página
            const html = document.documentElement.innerHTML;
            const videoRegex = /https?:\/\/[^"']+\.(?:mp4|m3u8|webm)(?:[^"']*)/g;
            const matches = html.match(videoRegex);
            if (matches) {
                matches.forEach(url => {
                    if (url.includes('cv.shopee.com.br') || url.includes('video')) {
                        videoUrls.add(url.replace(/\\u002F/g, '/'));
                    }
                });
            }

            return Array.from(videoUrls);
        });

        // Extrair itemId da URL final (caso tenha havido redirecionamento)
        const finalUrl = page.url();
        const itemIdMatch = finalUrl.match(/\.(\d+)\.(\d+)$/) || productUrl.match(/\.(\d+)\.(\d+)$/);
        const itemId = itemIdMatch ? itemIdMatch[2] : Date.now().toString();

        return {
            itemId,
            name: productData.name,
            price: productData.price,
            images: productData.images,
            videos,
            localImages: [],
            localVideos: []
        };

    } catch (error) {
        console.error('Shopee Scrape Error:', error);
        throw error;
    } finally {
        await browser.close();
    }
}

/**
 * Baixa mídias do produto
 */
export async function downloadProductMedia(productData) {
    const mediaDir = path.join(process.cwd(), 'public', 'shopee-media', productData.itemId);

    if (!fs.existsSync(mediaDir)) {
        fs.mkdirSync(mediaDir, { recursive: true });
    }

    const localVideos = [];

    // Baixar Vídeos
    for (let i = 0; i < productData.videos.length; i++) {
        try {
            const videoUrl = productData.videos[i];
            const filename = `video_${i + 1}.mp4`;
            const localPath = path.join(mediaDir, filename);

            const response = await axios.get(videoUrl, { responseType: 'arraybuffer' });
            fs.writeFileSync(localPath, response.data);

            localVideos.push(`/shopee-media/${productData.itemId}/${filename}`);
        } catch (e) {
            console.error('Error downloading video:', e);
        }
    }

    return { ...productData, localVideos };
}
