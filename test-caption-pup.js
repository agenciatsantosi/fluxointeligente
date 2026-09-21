import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteerExtra.use(StealthPlugin());

async function test() {
    const browser = await puppeteerExtra.launch({ headless: 'new' });
    const page = await browser.newPage();
    await page.goto('https://www.instagram.com/p/DYfh320lRQM/', { waitUntil: 'networkidle2' });
    
    // Attempt 1: Title tag
    const title = await page.title();
    console.log("Title:", title);
    
    // Attempt 2: Meta description
    const metaDesc = await page.$eval('meta[name="description"]', el => el.content).catch(() => 'N/A');
    console.log("Meta desc:", metaDesc);
    
    // Attempt 3: og:title
    const ogTitle = await page.$eval('meta[property="og:title"]', el => el.content).catch(() => 'N/A');
    console.log("OG title:", ogTitle);
    
    // Attempt 4: DOM extraction for actual post text (h1 class that contains caption)
    const h1Texts = await page.$$eval('h1', els => els.map(e => e.innerText));
    console.log("H1 texts:", h1Texts);
    
    // Attempt 5: JSON-LD extraction
    const jsonLd = await page.$$eval('script[type="application/ld+json"]', els => els.map(e => e.innerText));
    console.log("JSON-LD found:", jsonLd.length);
    
    // Attempt 6: Look in window object
    const sharedData = await page.evaluate(() => {
        if (window._sharedData) return window._sharedData;
        return null;
    });
    console.log("Has sharedData:", !!sharedData);
    
    await browser.close();
}

test();
