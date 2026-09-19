import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function run() {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    
    console.log('Navigating to Instagram...');
    await page.goto('https://www.instagram.com/p/DYPWXpHFcrP/', { waitUntil: 'networkidle2' });
    
    console.log('Waiting for article...');
    await page.waitForSelector('article', { timeout: 10000 }).catch(() => console.log('No article found'));
    
    // Check ESTRATÉGIA 1
    const html = await page.content();
    console.log('JSON extraction:', html.includes('"carousel_media":['));

    // Check ESTRATÉGIA 2
    const allImgs = await page.$$eval('img', imgs => imgs.map(i => i.src));
    console.log('All imgs on page:', allImgs.length);
    
    const articleImgs = await page.$$eval('article img', imgs => imgs.map(i => i.src));
    console.log('Imgs inside article:', articleImgs.length);
    
    await browser.close();
}

run();
