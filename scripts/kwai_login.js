import fs from 'fs';
import { PROFILES_DIR, profileDirFor, findChromeExecutable } from '../services/kwaiPaths.js';

/**
 * Login manual no Kwai Studio.
 *
 * O Kwai NÃO permite que os cookies do site (www.kwai.com) autentiquem o
 * Studio (studio.kwai.com) — são sessões separadas. Por isso, em vez de colar
 * cookies, abrimos um Chrome de verdade para você entrar na conta UMA vez. O
 * perfil fica salvo em ~/.fluxointeligente/kwai_profiles/profile_<id> e o
 * serviço de publicação reutiliza essa sessão nas próximas postagens.
 *
 * Uso:
 *   npm run kwai-login            (usa a conta #1)
 *   npm run kwai-login -- 3       (usa a conta #3)
 */

const accountId = (process.argv[2] || process.env.KWAI_ACCOUNT_ID || '1').toString();
const userDataDir = profileDirFor(accountId);
fs.mkdirSync(userDataDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('──────────────────────────────────────────────');
console.log(' Login no Kwai Studio');
console.log('──────────────────────────────────────────────');
console.log(' Conta (id):   ', accountId);
console.log(' Perfil:       ', userDataDir);
console.log(' Perfis (base):', PROFILES_DIR);
console.log('──────────────────────────────────────────────');
console.log(' Abrindo o Chrome. Entre na sua conta do Kwai na');
console.log(' janela que vai abrir. O login é detectado sozinho.');
console.log(' Não feche a janela antes de aparecer a tela de upload.');
console.log('──────────────────────────────────────────────\n');

const { default: puppeteerExtra } = await import('puppeteer-extra');
const { default: StealthPlugin } = await import('puppeteer-extra-plugin-stealth');
try { puppeteerExtra.use(StealthPlugin()); } catch {}

const executablePath = findChromeExecutable();
if (!executablePath) {
    console.warn('Aviso: Chrome não encontrado nos caminhos usuais — tentando o Chromium do Puppeteer.');
}

let browser;
try {
    browser = await puppeteerExtra.launch({
        headless: false,
        userDataDir,
        executablePath,
        ignoreHTTPSErrors: true,
        defaultViewport: null,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-infobars',
            '--start-maximized',
            '--lang=pt-BR,pt'
        ]
    });

    const pages = await browser.pages();
    const page = pages[0] || (await browser.newPage());
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await page.goto('https://studio.kwai.com/upload/publish', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});

    const DEADLINE = Date.now() + 15 * 60 * 1000; // 15 minutos
    let loggedIn = false;

    while (Date.now() < DEADLINE) {
        await sleep(3000);

        // Sinal forte: a tela de upload tem um input de arquivo.
        let hasFileInput = false;
        try {
            hasFileInput = !!(await page.$('input[type="file"]'));
            if (!hasFileInput) {
                for (const frame of page.frames()) {
                    try {
                        if (await frame.$('input[type="file"]')) { hasFileInput = true; break; }
                    } catch (_) {}
                }
            }
        } catch (_) {
            // navegação em andamento
        }

        if (hasFileInput) { loggedIn = true; break; }
    }

    console.log('');
    if (loggedIn) {
        console.log('✅ Login detectado! Sessão salva no perfil.');
        console.log('   Agora é só publicar pelo Downloader — o perfil será reutilizado.');
    } else {
        console.log('⚠️  Tempo esgotado sem detectar a tela de upload.');
        console.log('   Se você chegou a entrar na conta, o perfil foi salvo mesmo assim.');
        console.log('   Se não entrou, rode de novo: npm run kwai-login');
    }
} catch (error) {
    console.error('❌ Falha ao abrir o navegador:', error.message);
    process.exitCode = 1;
} finally {
    if (browser) {
        try { await browser.close(); } catch (_) {}
    }
    process.exit(process.exitCode || 0);
}
