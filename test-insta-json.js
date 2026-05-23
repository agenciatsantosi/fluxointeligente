import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function run() {
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    
    await page.goto('https://www.instagram.com/p/DYPWXpHFcrP/', { waitUntil: 'networkidle2' });
    
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
            console.log('JSON extracted items count:', arr.length);
            // Let's see what these items are
            arr.forEach((item, index) => {
                if (item.image_versions2 && item.image_versions2.candidates && item.image_versions2.candidates.length > 0) {
                    console.log(`Item ${index}:`, item.image_versions2.candidates[0].url);
                } else {
                    console.log(`Item ${index}: No image_versions2`);
                }
            });
        }
    }
    await browser.close();
}

run();
