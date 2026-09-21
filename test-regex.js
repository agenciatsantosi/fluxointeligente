import puppeteer from 'puppeteer';

async function test() {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto('https://www.instagram.com/p/DYfh320lRQM/', { waitUntil: 'networkidle2' });
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
            try {
                const arr = JSON.parse(jsonStr);
                console.log("TAMANHO DO CAROUSEL_MEDIA PARSEADO NATIVAMENTE:", arr.length);
            } catch (e) {
                console.log("ERRO PARSE", e);
            }
        }
    }
    await browser.close();
    process.exit(0);
}
test();
