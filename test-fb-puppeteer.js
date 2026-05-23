import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function run() {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    
    // Intercept
    page.on('request', req => {
        if (req.url().includes('fbcdn.net') || req.url().includes('cdninstagram.com')) {
            console.log('Intercepted:', req.resourceType(), req.url().substring(0, 80));
        }
        req.continue();
    });
    
    await page.setRequestInterception(true);
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    
    console.log('Navigating...');
    await page.goto('https://www.facebook.com/photo.php?fbid=122189810390766792&set=pb.61573003761253.-2207520000&type=3', { waitUntil: 'networkidle2' });
    
    const ogImage = await page.$eval('meta[property="og:image"]', el => el.content).catch(() => null);
    console.log('og:image:', ogImage);
    
    const html = await page.content();
    console.log('Page title:', await page.title());
    console.log('Is login page?', html.includes('login_form'));
    
    await browser.close();
}

run();
