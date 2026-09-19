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
        const res = await pool.query('SELECT cookies FROM kwai_accounts WHERE id = 335');
        if (res.rows.length === 0) {
            console.log('Account 335 not found');
            process.exit(1);
        }

        const cookiesStr = res.rows[0].cookies;
        const dbCookies = JSON.parse(cookiesStr);
        
        console.log(`[REPAIR] Found ${dbCookies.length} cookies in DB for account 335.`);

        const persistentCookies = dbCookies.map(c => {
            const newCookie = { ...c };
            if (newCookie.session || newCookie.expires === -1 || !newCookie.expires) {
                newCookie.expires = Math.floor(Date.now() / 1000) + 31536000;
                delete newCookie.session;
            }
            delete newCookie.size;
            if (!newCookie.domain && !newCookie.url) {
                newCookie.domain = '.kwai.com';
            }
            return newCookie;
        });

        const userDataDir = path.join(process.cwd(), 'kwai_profiles', 'profile_335');
        console.log(`[REPAIR] Launching Puppeteer for ${userDataDir}`);
        
        const browser = await puppeteerExtra.launch({
            headless: "new",
            userDataDir,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        
        try {
            await page.setCookie(...persistentCookies);
            console.log(`[REPAIR] Successfully injected ${persistentCookies.length} persistent cookies.`);
        } catch (e) {
            console.log(`[REPAIR ERROR] Failed to set cookies: ${e.message}`);
        }

        await browser.close();
        console.log(`[REPAIR] Profile 335 repaired successfully!`);

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
})();
