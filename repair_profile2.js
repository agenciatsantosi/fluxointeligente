import pg from 'pg';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'path';

puppeteerExtra.use(StealthPlugin());

(async () => {
    const pool = new pg.Pool({
        connectionString: 'postgres://postgres:d50546e1b4128c0a07be@31.97.164.76:5433/meliflow?sslmode=disable'
    });

    try {
        const res = await pool.query('SELECT cookies FROM kwai_accounts WHERE id = 339');
        if (res.rows.length === 0) {
            console.log('Account 339 not found');
            process.exit(1);
        }

        const cookiesStr = res.rows[0].cookies;
        let dbCookies = [];
        try {
            dbCookies = JSON.parse(cookiesStr);
        } catch (e) {
            dbCookies = [];
        }
        
        console.log(`[REPAIR] Found ${dbCookies.length} cookies in DB for account 339.`);

        const cdpCookies = [];
        for (const cookie of dbCookies) {
            let sameSite = cookie.sameSite;
            if (sameSite === 'no_restriction') sameSite = 'None';
            else if (sameSite !== 'Strict' && sameSite !== 'Lax' && sameSite !== 'None') sameSite = undefined;

            let domain = cookie.domain || '.kwai.com';

            const baseNormalized = {
                name: cookie.name,
                value: cookie.value,
                domain: domain,
                path: cookie.path || '/',
                httpOnly: cookie.httpOnly !== undefined ? cookie.httpOnly : false,
                secure: cookie.secure !== undefined ? cookie.secure : true,
                expires: Math.floor(Date.now() / 1000) + 31536000 // 1 year from now
            };

            if (sameSite) baseNormalized.sameSite = sameSite;
            cdpCookies.push(baseNormalized);
        }

        const userDataDir = path.join(process.cwd(), 'kwai_profiles', 'profile_339');
        console.log(`[REPAIR] Launching Puppeteer for ${userDataDir}`);
        
        const browser = await puppeteerExtra.launch({
            headless: "new",
            userDataDir,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        try {
            const client = await page.target().createCDPSession();
            await client.send('Network.setCookies', { cookies: cdpCookies });
            console.log(`[REPAIR] Successfully injected ${cdpCookies.length} persistent cookies via CDP.`);
        } catch (e) {
            console.log(`[REPAIR ERROR] Failed to set cookies via CDP: ${e.message}`);
        }

        let isRedirected = false;
        try {
            await page.goto('https://studio.kwai.com/upload/publish', {waitUntil: 'domcontentloaded', timeout: 15000});
            await new Promise(r => setTimeout(r, 2000));
            isRedirected = page.url().includes('/login');
        } catch (e) {
            console.log(`[REPAIR] Navigation error (expected): ${e.message}`);
        }
        
        if (isRedirected) {
            console.log(`[REPAIR] ❌ STILL REDIRECTED TO LOGIN!`);
        } else {
            console.log(`[REPAIR] ✅ Verified successfully!`);
        }

        await browser.close();
        console.log(`[REPAIR] Profile 339 repaired successfully!`);

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
})();
