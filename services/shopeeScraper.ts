import puppeteer from 'puppeteer';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

export interface ShopeeProductMedia {
    itemId: string;
    name: string;
    price: number;
    images: string[]; // URLs das imagens
    videos: string[]; // URLs dos vídeos
    localImages: string[]; // Caminhos locais das imagens baixadas
    localVideos: string[]; // Caminhos locais dos vídeos baixados
}

/**
 * Extrai dados completos de um produto da Shopee (imagens e vídeos)
 */
export async function scrapeShopeeProduct(productUrl: string): Promise<ShopeeProductMedia> {
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
        await page.waitForSelector('div[class*="product"]', { timeout: 10000 });

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
            const images: string[] = [];
            document.querySelectorAll('img[class*="product-image"], img[class*="gallery"]').forEach(img => {
                const src = (img as HTMLImageElement).src;
                if (src && !src.includes('placeholder')) {
                    images.push(src);
                }
            });

            return { name, price, images };
        });

        // Extrair vídeos (normalmente estão em tags video ou em dados do player)
        const videos = await page.evaluate(() => {
            const videoUrls: string[] = [];

            // Buscar tags video
            document.querySelectorAll('video source').forEach(source => {
                const src = (source as HTMLSourceElement).src;
                if (src) videoUrls.push(src);
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

    } finally {
        await browser.close();
    }
}

/**
 * Baixa mídias (imagens e vídeos) para o servidor
 */
export async function downloadProductMedia(productMedia: ShopeeProductMedia): Promise<ShopeeProductMedia> {
    const mediaDir = path.join(process.cwd(), 'public', 'shopee-media', productMedia.itemId);

    // Criar diretório se não existir
    if (!fs.existsSync(mediaDir)) {
        fs.mkdirSync(mediaDir, { recursive: true });
    }

    const localImages: string[] = [];
    const localVideos: string[] = [];

    // Download de imagens
    for (let i = 0; i < productMedia.images.length; i++) {
        try {
            const imageUrl = productMedia.images[i];
            const ext = path.extname(new URL(imageUrl).pathname) || '.jpg';
            const filename = `image_${i}${ext}`;
            const filepath = path.join(mediaDir, filename);

            const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
            fs.writeFileSync(filepath, response.data);

            localImages.push(`/shopee-media/${productMedia.itemId}/${filename}`);
        } catch (error) {
            console.error(`Error downloading image ${i}:`, error);
        }
    }

    // Download de vídeos
    for (let i = 0; i < productMedia.videos.length; i++) {
        try {
            const videoUrl = productMedia.videos[i];
            const ext = path.extname(new URL(videoUrl).pathname) || '.mp4';
            const filename = `video_${i}${ext}`;
            const filepath = path.join(mediaDir, filename);

            const response = await axios.get(videoUrl, { responseType: 'arraybuffer' });
            fs.writeFileSync(filepath, response.data);

            localVideos.push(`/shopee-media/${productMedia.itemId}/${filename}`);
        } catch (error) {
            console.error(`Error downloading video ${i}:`, error);
        }
    }

    return {
        ...productMedia,
        localImages,
        localVideos
    };
}

/**
 * Função completa: scraping + download
 */
export async function getProductWithMedia(productUrl: string): Promise<ShopeeProductMedia> {
    const productData = await scrapeShopeeProduct(productUrl);
    const productWithMedia = await downloadProductMedia(productData);
    return productWithMedia;
}
