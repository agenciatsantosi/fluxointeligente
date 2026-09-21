import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'path';
import fs from 'fs';

puppeteerExtra.use(StealthPlugin());

function findChrome() {
    const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
    ];
    for (const p of chromePaths) {
        if (fs.existsSync(p)) return p;
    }
    return undefined;
}

async function checkSession(dirPath) {
    let browser;
    try {
        browser = await puppeteerExtra.launch({
            headless: true,
            userDataDir: dirPath,
            executablePath: findChrome(),
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-features=Crashpad',
                '--disable-crash-reporter'
            ]
        });

        const pages = await browser.pages();
        const page = pages[0] || await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        await page.goto('https://studio.kwai.com/upload/publish', { waitUntil: 'domcontentloaded', timeout: 15000 });
        await new Promise(r => setTimeout(r, 4000));

        const currentUrl = page.url();
        const isRedirected = currentUrl.includes('/login') || currentUrl.includes('/signin') || currentUrl.includes('/register');
        
        return !isRedirected && currentUrl.includes('studio.kwai.com');
    } catch (e) {
        return false;
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch (e) {}
        }
    }
}

async function run() {
    const profilesDir = path.join(process.cwd(), 'kwai_profiles');
    if (!fs.existsSync(profilesDir)) {
        console.log("Diretório kwai_profiles não existe.");
        return;
    }

    const items = fs.readdirSync(profilesDir);
    const tempFolders = items
        .filter(item => {
            const itemPath = path.join(profilesDir, item);
            return fs.statSync(itemPath).isDirectory() && (item.startsWith('temp_') || item.startsWith('profile_'));
        })
        .map(item => {
            const itemPath = path.join(profilesDir, item);
            return {
                name: item,
                mtime: fs.statSync(itemPath).mtimeMs
            };
        })
        .sort((a, b) => b.mtime - a.mtime)
        .map(x => x.name);

    console.log(`Encontradas ${tempFolders.length} pastas de perfil para analisar (ordenadas por mais recentes)...`);

    let foundFolder = null;
    for (const folder of tempFolders) {
        // Skip profile_341 if we are trying to recover into it, but we can test it anyway if there's no other.
        // Actually, we know profile_341 is invalid, so let's skip it during the search to avoid self-reference,
        // or check it anyway just in case. Let's skip it to find other candidate folders.
        if (folder === 'profile_341') continue;

        const fullPath = path.join(profilesDir, folder);
        console.log(`Testando: ${folder}...`);
        const isValid = await checkSession(fullPath);
        if (isValid) {
            console.log(`\n🎉 SESSÃO VÁLIDA ENCONTRADA EM: ${folder}\n`);
            foundFolder = fullPath;
            break;
        }
    }

    if (foundFolder) {
        const destDir = path.join(profilesDir, 'profile_341');
        console.log(`Restaurando sessão válida para: ${destDir}`);
        
        // Remove existing target if it exists
        if (fs.existsSync(destDir)) {
            try {
                fs.rmSync(destDir, { recursive: true, force: true });
            } catch (e) {
                console.log(`Aviso ao remover pasta antiga: ${e.message}`);
            }
        }
        
        // Copy/Rename source to target
        try {
            fs.renameSync(foundFolder, destDir);
            console.log(`✅ Sessão restaurada com sucesso! Agora a conta 341 está ativa e logada.`);
        } catch (e) {
            console.log(`Erro ao mover pasta: ${e.message}`);
        }
    } else {
        console.log("❌ Nenhuma sessão ativa válida foi encontrada nas pastas temporárias.");
    }
}

run();
