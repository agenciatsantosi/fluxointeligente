import puppeteer from 'puppeteer';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

/**
 * Search for videos on Pinterest
 */
export async function searchPinterestVideos(keyword) {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        // Use mobile UA to potentially get a simpler version or bypass some checks
        await page.setUserAgent('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36');

        // Remove specific params to be more generic
        const searchUrl = `https://br.pinterest.com/search/pins/?q=${encodeURIComponent(keyword + ' video')}`;

        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });

        // Scroll to trigger lazy loading
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                const distance = 100;
                const timer = setInterval(() => {
                    const scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;

                    if (totalHeight >= scrollHeight || totalHeight > 3000) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 100);
            });
        });

        // Wait a bit after scrolling
        await new Promise(r => setTimeout(r, 2000));

        const pins = await page.evaluate(() => {
            const results = [];
            // Broad selector: Any link containing /pin/
            const pinLinks = document.querySelectorAll('a[href*="/pin/"]');

            pinLinks.forEach((linkEl) => {
                // Check if it looks like a pin card (has an image inside)
                const imgEl = linkEl.querySelector('img');

                if (imgEl) {
                    const pinId = linkEl.href.split('/pin/')[1]?.replace('/', '') || '';

                    // Basic deduplication
                    if (pinId && !results.find(r => r.id === pinId)) {
                        // Try to detect video duration indicator
                        const container = linkEl.closest('div[role="listitem"]') || linkEl.parentElement;
                        const hasVideoIndicator = container?.innerText.match(/\d+:\d+/) ||
                            container?.querySelector('div[data-test-id="video-snippet"]');

                        results.push({
                            id: pinId,
                            description: imgEl.alt || 'Sem descrição',
                            imageUrl: imgEl.src,
                            pinUrl: linkEl.href,
                            videoUrl: '',
                            isVideo: !!hasVideoIndicator
                        });
                    }
                }
            });
            return results.slice(0, 20);
        });

        return pins;

    } catch (error) {
        console.error('Pinterest Search Error:', error);
        return [];
    } finally {
        await browser.close();
    }
}

/**
 * Extract and Download Video from a specific Pin
 */
export async function downloadPinterestVideo(pinUrl) {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36');

        await page.goto(pinUrl, { waitUntil: 'networkidle2', timeout: 30000 });

        const videoUrl = await page.evaluate(() => {
            const videoEl = document.querySelector('video');
            if (videoEl && videoEl.src) return videoEl.src;

            const sourceEl = document.querySelector('video source');
            if (sourceEl && sourceEl.src) return sourceEl.src;

            return null;
        });

        if (!videoUrl) {
            throw new Error('Video URL not found');
        }

        let finalVideoUrl = videoUrl;
        if (videoUrl.includes('blob:') || videoUrl.includes('.m3u8')) {
            const extractedUrl = await page.evaluate(() => {
                const scripts = document.querySelectorAll('script');
                for (const script of scripts) {
                    if (script.textContent && script.textContent.includes('.mp4')) {
                        const match = script.textContent.match(/https?:\/\/[^"]+\.mp4/);
                        if (match) return match[0];
                    }
                }
                return null;
            });
            if (extractedUrl) finalVideoUrl = extractedUrl;
        }

        console.log('Downloading video from:', finalVideoUrl);

        const mediaDir = path.join(process.cwd(), 'public', 'pinterest-media');
        if (!fs.existsSync(mediaDir)) {
            fs.mkdirSync(mediaDir, { recursive: true });
        }

        const filename = `pinterest_${Date.now()}.mp4`;
        const localPath = path.join(mediaDir, filename);

        const response = await axios.get(finalVideoUrl, { responseType: 'arraybuffer' });
        fs.writeFileSync(localPath, response.data);

        return { localPath: `/pinterest-media/${filename}`, filename };

    } catch (error) {
        console.error('Pinterest Download Error:', error);
        return null;
    } finally {
        await browser.close();
    }
}
