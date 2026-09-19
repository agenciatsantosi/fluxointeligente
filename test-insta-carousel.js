import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteerExtra.use(StealthPlugin());

async function testInsta() {
    const browser = await puppeteerExtra.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.goto('https://www.instagram.com/p/DYfh320lRQM/', { waitUntil: 'networkidle2', timeout: 15000 }).catch(e => console.log(e));
    
    await new Promise(r => setTimeout(r, 3000));
    
    const html = await page.content();
    
    const matches = html.match(/img_index=(\d+)/g);
    if (matches) {
        console.log("Encontrados no HTML inteiro:", matches);
    } else {
        console.log("Nenhum img_index= encontrado no HTML.");
    }
    
    // Procura em tags A, IMG, DIV
    const elements = await page.$$eval('*', els => {
        const found = [];
        for (const el of els) {
            for (const attr of el.attributes) {
                if (attr.value.includes('img_index=')) {
                    found.push({ tag: el.tagName, attr: attr.name, val: attr.value });
                }
            }
        }
        return found;
    });
    
    console.log("Elementos com img_index= nos atributos:", elements);
    
    await browser.close();
}

testInsta();
