import fs from 'fs';
import path from 'path';
import { getKwaiAccountById } from './database.js';
import { PROFILES_DIR, profileDirFor, findChromeExecutable } from './kwaiPaths.js';

/**
 * Serviço de publicação no Kwai (Kwai Studio).
 *
 * IMPORTANTE — POR QUE É PUPPETEER E NÃO API:
 * O Kwai não possui API pública de upload para terceiros (diferente do TikTok,
 * que tem a Content Posting API). A única via de automação é o navegador no
 * Kwai Studio (studio.kwai.com). Por isso este serviço segue o mesmo padrão do
 * TikTok via cookie (`tiktokService.js`), com Puppeteer + Stealth.
 *
 * CONSEQUÊNCIAS DESSA ESCOLHA (leia antes de usar em produção):
 *  - O seletor/IDs do Studio podem mudar sem aviso, quebrando a automação.
 *  - Automatizar publicação pode violar os termos de uso do Kwai.
 *  - Depende de uma conta logada; se a sessão cair, o post falha e a conta
 *    precisa ser reconectada.
 *
 * Por isso este módulo é propositalmente defensivo: tenta vários seletores,
 * registra log de cada etapa e devolve erro claro quando algo não é encontrado.
 */

const STUDIO_UPLOAD_URL = 'https://studio.kwai.com/upload/publish';

/** Tempo padrão de espera entre etapas (ms). */
const STEP_DELAY = 1500;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Normaliza os cookies salvos no banco para o formato aceito pelo Puppeteer.
 * Aceita tanto um array JSON quanto uma string de cookies Netscape (cookies.txt).
 */
function normalizeCookies(rawCookies) {
    if (!rawCookies) return [];

    let parsed = rawCookies;
    if (typeof rawCookies === 'string') {
        const trimmed = rawCookies.trim();
        if (!trimmed) return [];
        try {
            parsed = JSON.parse(trimmed);
        } catch (_) {
            // Não é JSON: tenta interpretar como cookies.txt (Netscape)
            return parseNetscapeCookies(trimmed);
        }
    }

    const list = Array.isArray(parsed) ? parsed : [parsed];
    const cookies = [];

    for (const cookie of list) {
        if (!cookie || !cookie.name) continue;

        const item = {
            name: cookie.name,
            value: String(cookie.value ?? ''),
            path: cookie.path || '/'
        };

        if (cookie.domain) {
            item.domain = cookie.domain.startsWith('.') ? cookie.domain : `.${cookie.domain}`;
        } else if (cookie.url) {
            item.url = cookie.url;
        } else {
            item.domain = '.kwai.com';
        }

        // Cookies de sessão (sem expires) vêm com -1 e o Puppeteer rejeita.
        // Damos validade longa para a sessão sobreviver a reinícios do servidor.
        if (cookie.expires && Number(cookie.expires) > 0) {
            item.expires = Number(cookie.expires);
        } else {
            item.expires = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;
        }

        delete item.session;
        delete item.size;

        cookies.push(item);
    }

    return cookies;
}

/** Converte cookies no formato Netscape (cookies.txt) para o formato Puppeteer. */
function parseNetscapeCookies(content) {
    const cookies = [];
    for (const line of content.split(/\r?\n/)) {
        if (!line.trim() || line.startsWith('#')) continue;

        const parts = line.split('\t').map(s => s.trim());
        if (parts.length < 7) continue;

        const [domain, , cookiePath, secure, , name, value] = parts;
        if (!name || !value) continue;
        if (!domain.includes('kwai.com')) continue;

        cookies.push({
            name,
            value,
            domain: domain.startsWith('.') ? domain : `.${domain}`,
            path: cookiePath || '/',
            expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
            secure: secure === 'TRUE'
        });
    }
    return cookies;
}

/**
 * Procura um elemento dentro da página e de todos os iframes.
 * O Kwai Studio monta a tela de upload com React e pode usar iframe.
 */
async function findBySelectors(page, selectors) {
    for (const selector of selectors) {
        const found = await page.$(selector);
        if (found) return { handle: found, context: page };
    }

    for (const frame of page.frames()) {
        if (frame === page.mainFrame()) continue;
        for (const selector of selectors) {
            try {
                const found = await frame.$(selector);
                if (found) return { handle: found, context: frame };
            } catch (_) {
                // frame pode ter sido destruído durante a navegação
            }
        }
    }

    return null;
}

/** Clica em um elemento usando JS, para sobreviver a overlays que bloqueiam clique nativo. */
async function safeClick(target, handle) {
    try {
        await target.evaluate(el => el.scrollIntoView({ block: 'center' }), handle);
        await sleep(300);
        await handle.click();
        return true;
    } catch (_) {
        try {
            await target.evaluate(el => el.click(), handle);
            return true;
        } catch (err) {
            console.warn(`[KWAI] Não foi possível clicar no elemento: ${err.message}`);
            return false;
        }
    }
}

/**
 * Publica um vídeo no Kwai.
 *
 * @param {string|number} dbAccountId - id da conta em kwai_accounts
 * @param {string} videoPath - caminho local do arquivo .mp4
 * @param {string} caption - legenda do post
 * @param {object} [options] - { userId, headless }
 * @returns {Promise<{success: boolean, mediaId?: string, error?: string, url?: string}>}
 */
export async function publishVideo(dbAccountId, videoPath, caption, options = {}) {
    const userId = options.userId;
    const account = await getKwaiAccountById(dbAccountId, userId);

    if (!account) {
        return { success: false, error: 'Conta do Kwai não encontrada para este usuário.' };
    }
    if (!videoPath || !fs.existsSync(videoPath)) {
        return { success: false, error: `Arquivo de vídeo não encontrado: ${videoPath}` };
    }

    const label = account.channel_name || account.username || `#${dbAccountId}`;
    console.log(`[KWAI] Iniciando publicação na conta ${label} (${(fs.statSync(videoPath).size / 1024 / 1024).toFixed(1)} MB)`);

    const { default: puppeteerExtra } = await import('puppeteer-extra');
    const { default: StealthPlugin } = await import('puppeteer-extra-plugin-stealth');

    try {
        puppeteerExtra.use(StealthPlugin());
    } catch (e) {
        // Stealth já registrado — seguir sem ele
    }

    // Usa o perfil persistente da conta quando existir, para aproveitar a sessão.
    const persistentDir = profileDirFor(dbAccountId);
    let userDataDir = persistentDir;
    let usingTemporaryProfile = false;

    if (fs.existsSync(persistentDir)) {
        console.log(`[KWAI] Usando perfil persistente da conta: ${persistentDir}`);
    } else {
        console.log('[KWAI] Perfil persistente não encontrado — criando sessão temporária com os cookies do banco.');
        userDataDir = path.join(PROFILES_DIR, `temp_${dbAccountId}_${Date.now()}`);
        usingTemporaryProfile = true;
    }
    if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

    const executablePath = findChromeExecutable();
    if (!executablePath) {
        console.warn('[KWAI] Chrome não localizado — usando o Chromium empacotado com o Puppeteer (pode não estar instalado no VPS).');
    }

    let browser;
    try {
        browser = await puppeteerExtra.launch({
            headless: options.headless === false ? false : 'new',
            userDataDir,
            executablePath,
            ignoreHTTPSErrors: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-infobars',
                '--window-size=1280,900',
                '--lang=pt-BR,pt',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-extensions'
            ]
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 900 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"'
        });

        // Só injeta cookies quando NÃO há perfil persistente (sessão temporária).
        if (usingTemporaryProfile) {
            const cookies = normalizeCookies(account.cookies);
            if (cookies.length === 0) {
                return { success: false, error: 'A conta do Kwai não tem sessão válida. Use "Fazer login no navegador" na aba Automação Kwai (ou cole cookies do studio.kwai.com).' };
            }
            try {
                await page.setCookie(...cookies);
                console.log(`[KWAI] ${cookies.length} cookies injetados na sessão temporária.`);
            } catch (e) {
                return { success: false, error: `Falha ao injetar os cookies do Kwai: ${e.message}. Reconecte a conta.` };
            }
        }

        // 1. Abrir o Studio de upload
        console.log(`[KWAI] Abrindo ${STUDIO_UPLOAD_URL}`);
        await page.goto(STUDIO_UPLOAD_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await sleep(4000);

        const currentUrl = page.url();
        if (/login|signin|register|passport/i.test(currentUrl)) {
            return {
                success: false,
                error: 'A sessão do Kwai expirou (redirecionado para o login). Use "Fazer login no navegador" na aba Automação Kwai.'
            };
        }

        // 2. Campo de arquivo
        let fileInput = null;
        for (let attempt = 0; attempt < 20 && !fileInput; attempt++) {
            fileInput = await page.$('input[type="file"]');
            if (!fileInput) {
                for (const frame of page.frames()) {
                    try {
                        fileInput = await frame.$('input[type="file"]');
                        if (fileInput) break;
                    } catch (_) {}
                }
            }
            if (!fileInput) await sleep(2000);
        }

        if (!fileInput) {
            return {
                success: false,
                error: 'Campo de upload não encontrado no Kwai Studio. O layout pode ter mudado ou a sessão expirou.'
            };
        }

        console.log(`[KWAI] Enviando arquivo: ${path.basename(videoPath)}`);
        await fileInput.uploadFile(videoPath);

        // 3. Aguardar o processamento do vídeo pelo Studio
        console.log('[KWAI] Aguardando o processamento do vídeo...');
        let captionInput = null;
        let captionContext = page;

        // O campo de legenda só aparece quando o upload termina.
        for (let attempt = 0; attempt < 60 && !captionInput; attempt++) {
            const found = await findBySelectors(page, [
                'div[contenteditable="true"]',
                '[data-e2e="caption"]',
                '[data-e2e="video-desc"]',
                'textarea[placeholder*="descri"]',
                'textarea[placeholder*="legenda"]',
                'textarea[placeholder*="caption"]',
                'textarea'
            ]);
            if (found) {
                captionInput = found.handle;
                captionContext = found.context;
                break;
            }
            await sleep(2500);
        }

        if (!captionInput) {
            return {
                success: false,
                error: 'Campo de legenda não apareceu. O Kwai pode não ter aceitado o vídeo (formato/tamanho) ou o layout mudou.'
            };
        }

        // 4. Legenda
        console.log(`[KWAI] Escrevendo legenda (${caption ? caption.length : 0} caracteres)`);
        try {
            await captionInput.click();
        } catch (_) {}
        await sleep(STEP_DELAY);

        // Limpa conteúdo pré-preenchido
        try {
            await page.keyboard.down('Control');
            await page.keyboard.press('A');
            await page.keyboard.up('Control');
            await page.keyboard.press('Backspace');
        } catch (_) {}
        await sleep(500);

        await page.keyboard.type(caption || '', { delay: 25 });
        await sleep(STEP_DELAY);

        // 5. Botão de publicar — texto varia entre pt-BR, en e zh
        let publishButton = null;
        let publishContext = page;

        for (let attempt = 0; attempt < 40 && !publishButton; attempt++) {
            const found = await findBySelectors(page, [
                'button[class*="publish"]:not([disabled])',
                '[data-e2e="publish"]:not([disabled])',
                '[class*="publish-btn"]:not([disabled])'
            ]);
            if (found) {
                publishButton = found.handle;
                publishContext = found.context;
                break;
            }

            const byText = await page.evaluateHandle(() => {
                const wanted = ['publicar', 'publicar vídeo', 'postar', 'publish', 'post', '发布', '提交'];
                for (const btn of document.querySelectorAll('button, div[role="button"], a')) {
                    const text = (btn.innerText || '').toLowerCase().trim();
                    if (!text || text.length > 30) continue;
                    if (!wanted.some(w => text === w || text.includes(w))) continue;

                    const disabled = btn.hasAttribute('disabled')
                        || btn.getAttribute('aria-disabled') === 'true'
                        || btn.className?.toString().includes('disabled');
                    if (!disabled) return btn;
                }
                return null;
            });

            if (byText && byText.asElement()) {
                publishButton = byText.asElement();
                publishContext = page;
                break;
            }

            await sleep(2500);
        }

        if (!publishButton) {
            return {
                success: false,
                error: 'Botão de publicar não ficou ativo. O vídeo pode ainda estar processando ou o layout do Studio mudou.'
            };
        }

        console.log('[KWAI] Clicando em publicar...');
        await safeClick(publishContext, publishButton);

        // 6. Confirmação — o Kwai pode mostrar um modal pedindo confirmação
        for (const confirmText of ['confirmar', 'sim', 'ok', 'confirm', '确定']) {
            try {
                const confirmBtn = await page.evaluateHandle((wanted) => {
                    for (const btn of document.querySelectorAll('button, div[role="button"]')) {
                        const text = (btn.innerText || '').toLowerCase().trim();
                        if (text && wanted.includes(text)) return btn;
                    }
                    return null;
                }, [confirmText]);
                const element = confirmBtn?.asElement();
                if (element) {
                    await safeClick(page, element);
                    console.log(`[KWAI] Confirmação "${confirmText}" clicada.`);
                    break;
                }
            } catch (_) {}
        }

        // 7. Aguardar retorno de sucesso
        let published = false;
        const startedAt = Date.now();
        const successTimeoutMs = 120000;

        while (Date.now() - startedAt < successTimeoutMs) {
            const url = page.url().toLowerCase();

            // Saiu da tela de upload = sinal forte de que o post foi aceito
            if (!url.includes('/upload') && (url.includes('studio.kwai.com') || url.includes('kwai.com'))) {
                published = true;
                break;
            }

            const successText = await page.evaluate(() => {
                const body = (document.body?.innerText || '').toLowerCase();
                const hits = ['publicado com sucesso', 'post publicado', 'successfully published', '发布成功', '上传成功'];
                return hits.some(h => body.includes(h));
            }).catch(() => false);

            const errorText = await page.evaluate(() => {
                const body = (document.body?.innerText || '').toLowerCase();
                return body.includes('falha ao publicar')
                    || body.includes('erro ao publicar')
                    || body.includes('publish failed')
                    || body.includes('上传失败');
            }).catch(() => false);

            if (errorText) {
                return { success: false, error: 'O Kwai Studio recusou a publicação. Veja o log do servidor.' };
            }
            if (successText) {
                published = true;
                break;
            }

            await sleep(3000);
        }

        if (!published) {
            // Não confirmou, mas também não deu erro: pode ter sido publicado.
            console.warn('[KWAI] Não houve confirmação explícita no tempo limite.');
            return {
                success: false,
                error: 'Tempo esgotado aguardando a confirmação do Kwai. Verifique no Studio se o vídeo foi publicado antes de tentar de novo (para não duplicar o post).'
            };
        }

        console.log(`[KWAI] ✅ Vídeo publicado na conta ${label}`);
        return {
            success: true,
            mediaId: `kwai_${dbAccountId}_${Date.now()}`,
            url: page.url()
        };

    } catch (error) {
        console.error(`[KWAI] Erro ao publicar: ${error.message}`);
        return { success: false, error: error.message };
    } finally {
        if (browser) {
            try { await browser.close(); } catch (_) {}
        }
        // Perfil temporário não serve para nada depois do post: apaga para não
        // acumular lixo em disco a cada publicação.
        if (usingTemporaryProfile) {
            try {
                fs.rmSync(userDataDir, { recursive: true, force: true });
            } catch (_) {}
        }
    }
}

/**
 * Verifica se a sessão de uma conta do Kwai ainda é válida.
 * Útil para reconexão antes de uma publicação agendada em lote.
 */
export async function verifySession(dbAccountId, userId) {
    const account = await getKwaiAccountById(dbAccountId, userId);
    if (!account) return { valid: false, error: 'Conta não encontrada' };

    // Prefere o perfil persistente (fluxo de login no navegador). Só usa cookies
    // do banco quando não existe perfil.
    const persistentDir = profileDirFor(dbAccountId);
    const usePersistent = fs.existsSync(persistentDir);
    const cookies = usePersistent ? [] : normalizeCookies(account.cookies);

    if (!usePersistent && cookies.length === 0) {
        return { valid: false, error: 'Conta sem sessão. Use "Login no navegador" para conectar.' };
    }

    const { default: puppeteerExtra } = await import('puppeteer-extra');
    const { default: StealthPlugin } = await import('puppeteer-extra-plugin-stealth');

    try {
        puppeteerExtra.use(StealthPlugin());
    } catch (_) {}

    const userDataDir = usePersistent
        ? persistentDir
        : path.join(PROFILES_DIR, `verify_${dbAccountId}_${Date.now()}`);
    if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

    let browser;
    try {
        browser = await puppeteerExtra.launch({
            headless: 'new',
            userDataDir,
            executablePath: findChromeExecutable(),
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
        if (cookies.length > 0) await page.setCookie(...cookies);

        await page.goto('https://studio.kwai.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
        await sleep(3000);

        const redirectedToLogin = /login|signin|register|passport/i.test(page.url());
        return {
            valid: !redirectedToLogin,
            username: account.username,
            error: redirectedToLogin ? 'Sessão expirada — reconecte a conta' : null
        };
    } catch (error) {
        return { valid: false, error: error.message };
    } finally {
        if (browser) {
            try { await browser.close(); } catch (_) {}
        }
        // Perfil temporário de verificação é descartável; o persistente nunca é apagado.
        if (!usePersistent) {
            try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (_) {}
        }
    }
}
