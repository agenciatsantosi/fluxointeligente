const fs = require('fs');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
    let browser;
    try {
        console.log('Launching browser...');
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        console.log('Navigating to kwai.com...');
        await page.goto('https://www.kwai.com/', { waitUntil: 'networkidle2', timeout: 30000 });
        
        console.log('Waiting 3s...');
        await new Promise(r => setTimeout(r, 3000));
        
        console.log('Finding login button...');
        const clicked = await page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('button, a, div'));
            const target = elements.find(el => {
                const text = el.innerText ? el.innerText.trim() : '';
                return text === 'Log in' || text === 'Entrar' || text === 'Sign In' || text === 'Fazer Login' || text === 'Log in/Sign up';
            });
            if (target) {
                target.click();
                return true;
            }
            return false;
        });
        
        console.log('Login button clicked:', clicked);
        await new Promise(r => setTimeout(r, 4000));
        
        console.log('Dumping modal HTML...');
        const modalHtml = await page.evaluate(() => {
            // Find any modal container or overlay
            const overlays = Array.from(document.querySelectorAll('div'));
            const loginModal = overlays.find(el => el.innerText && el.innerText.includes('Scan the QR Code'));
            return loginModal ? loginModal.outerHTML : document.body.innerHTML;
        });
        
        fs.writeFileSync('uploads/debug/modal_dump.html', modalHtml);
        console.log('Dumped to modal_dump.html successfully!');
    } catch (e) {
        console.error('Error:', e);
    } finally {
        if (browser) await browser.close();
    }
})();
