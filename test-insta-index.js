import puppeteer from 'puppeteer';

async function testInstaIndex() {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    for (let i = 1; i <= 3; i++) {
        const url = `https://www.instagram.com/p/DYfh320lRQM/?img_index=${i}`;
        console.log(`Buscando ${url}...`);
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        
        const ogImage = await page.evaluate(() => {
            const meta = document.querySelector('meta[property="og:image"]');
            return meta ? meta.content : null;
        });
        
        console.log(`Index ${i} -> og:image:`, ogImage);
    }
    
    await browser.close();
}

testInstaIndex();
