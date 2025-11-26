import puppeteer from 'puppeteer';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

/**
 * Extrai dados completos de um produto da Shopee (imagens e vídeos)
 */
export async function scrapeShopeeProduct(productUrl) {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();

        // User agent para evitar detecção
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        await page.goto(productUrl, { waitUntil: 'networkidle2', timeout: 30000 });

        // Aguardar carregamento do conteúdo
        try {
            await page.waitForSelector('div[class*="product"]', { timeout: 10000 });
        } catch (e) {
            console.log('Timeout waiting for product selector, trying to proceed anyway...');
        }

        // Extrair dados do produto
        const productData = await page.evaluate(() => {
            // Tentar extrair do JSON-LD (dados estruturados)
            const scriptTag = document.querySelector('script[type="application/ld+json"]');
            if (scriptTag) {
                try {
                    const data = JSON.parse(scriptTag.textContent || '');
                    return {
                        name: data.name || '',
                        price: parseFloat(data.offers?.price || '0'),
                        images: data.image ? (Array.isArray(data.image) ? data.image : [data.image]) : []
                    };
                } catch (e) {
                    console.error('Error parsing JSON-LD:', e);
                }
            }

            // Fallback: extrair manualmente
            const name = document.querySelector('div[class*="product-name"]')?.textContent?.trim() ||
                document.querySelector('h1')?.textContent?.trim() || '';

            const priceText = document.querySelector('div[class*="product-price"]')?.textContent?.trim() || '0';
            const price = parseFloat(priceText.replace(/[^\d.,]/g, '').replace(',', '.'));

            // Extrair imagens
            const images = [];
            document.querySelectorAll('img[class*="product-image"], img[class*="gallery"]').forEach(img => {
                const src = img.src;
                if (src && !src.includes('placeholder')) {
                    images.push(src);
                }
            });

            return { name, price, images };
        });

        // Extrair vídeos (normalmente estão em tags video ou em dados do player)
        const videos = await page.evaluate(() => {
            const videoUrls = [];

            // Buscar tags video
            document.querySelectorAll('video source').forEach(source => {
                const src = source.src;
                if (src) videoUrls.push(src);
            });

            document.querySelectorAll('video').forEach(video => {
                if (video.src) videoUrls.push(video.src);
            });

            // Buscar em atributos data-video ou similares
            document.querySelectorAll('[data-video-url], [data-src*="video"]').forEach(el => {
                const videoUrl = el.getAttribute('data-video-url') || el.getAttribute('data-src');
                if (videoUrl) videoUrls.push(videoUrl);
            });

            return videoUrls;
        });

        // Extrair itemId da URL
        const itemIdMatch = productUrl.match(/\.(\d+)\.(\d+)$/);
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
