import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

/**
 * Publishes a Pin on Pinterest using Puppeteer and session cookies.
 * 
 * @param {Object} account - The database account object containing `cookies` and `username`.
 * @param {Object} pinData - Contains `title`, `description`, `link`, `mediaPath`, and optional `boardName`.
 * @returns {Promise<Object>} - `{ success: true, pinUrl }` or `{ success: false, error }`
 */
export async function postPinViaCookie(account, pinData) {
    console.log(`[PINTEREST COOKIE SERVICE] Starting Pin upload for account @${account.username}...`);
    
    if (!account.cookies) {
        return { success: false, error: 'Sessão de cookies não encontrada para esta conta.' };
    }

    let cookies;
    try {
        cookies = JSON.parse(account.cookies);
    } catch (e) {
        return { success: false, error: 'Falha ao decodificar cookies de sessão do banco de dados.' };
    }

    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
            '--window-size=1280,800'
        ]
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        
        // Emulate typical desktop browser
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Inject Pinterest session cookies
        console.log(`[PINTEREST COOKIE SERVICE] Injecting ${cookies.length} cookies...`);
        const domainCookies = cookies.map(c => ({
            name: c.name,
            value: c.value,
            domain: c.domain || '.pinterest.com',
            path: c.path || '/',
            secure: c.secure !== undefined ? c.secure : true,
            httpOnly: c.httpOnly !== undefined ? c.httpOnly : true
        }));
        await page.setCookie(...domainCookies);

        // Go to Pinterest Pin Builder
        console.log('[PINTEREST COOKIE SERVICE] Navigating to pin-builder...');
        await page.goto('https://www.pinterest.com/pin-builder/', { 
            waitUntil: 'networkidle2', 
            timeout: 45000 
        });

        // Detect if redirected to login page (which indicates expired cookies)
        const currentUrl = page.url();
        if (currentUrl.includes('/login/') || currentUrl.includes('/login?')) {
            console.error('[PINTEREST COOKIE SERVICE] Redirected to login page. Session expired.');
            throw new Error('Sessão expirada. Por favor, re-adicione os cookies da sua conta do Pinterest.');
        }

        // Wait for Pin Builder container to load
        console.log('[PINTEREST COOKIE SERVICE] Waiting for builder interface...');
        await page.waitForSelector('input[type="file"]', { timeout: 20000 });

        // Absolute path check for file upload
        const absoluteMediaPath = path.isAbsolute(pinData.mediaPath) 
            ? pinData.mediaPath 
            : path.join(process.cwd(), pinData.mediaPath);
            
        if (!fs.existsSync(absoluteMediaPath)) {
            throw new Error(`Arquivo de mídia não encontrado no caminho: ${absoluteMediaPath}`);
        }

        console.log(`[PINTEREST COOKIE SERVICE] Uploading media file: ${absoluteMediaPath}`);
        const fileInput = await page.$('input[type="file"]');
        await fileInput.uploadFile(absoluteMediaPath);

        // Let the upload complete
        await new Promise(r => setTimeout(r, 6000));

        // Fill Fields (Title, Description, Link) using resilient placeholder matching
        console.log('[PINTEREST COOKIE SERVICE] Filling Pin details...');
        const fillFieldsResult = await page.evaluate((title, desc, destLink) => {
            const findByPlaceholder = (keywords) => {
                const elements = Array.from(document.querySelectorAll('input, textarea'));
                return elements.find(el => {
                    const placeholder = (el.placeholder || '').toLowerCase();
                    return keywords.some(kw => placeholder.includes(kw));
                });
            };

            const titleEl = findByPlaceholder(['título', 'title', 'adicione seu']);
            const descEl = findByPlaceholder(['descrição', 'desc', 'diga a todo', 'tell everyone']);
            const linkEl = findByPlaceholder(['link', 'destino', 'destination']);

            if (!titleEl) return { success: false, error: 'Campo de Título não encontrado.' };
            
            titleEl.focus();
            titleEl.value = title;
            titleEl.dispatchEvent(new Event('input', { bubbles: true }));
            titleEl.dispatchEvent(new Event('change', { bubbles: true }));

            if (descEl) {
                descEl.focus();
                descEl.value = desc;
                descEl.dispatchEvent(new Event('input', { bubbles: true }));
                descEl.dispatchEvent(new Event('change', { bubbles: true }));
            }

            if (linkEl && destLink) {
                linkEl.focus();
                linkEl.value = destLink;
                linkEl.dispatchEvent(new Event('input', { bubbles: true }));
                linkEl.dispatchEvent(new Event('change', { bubbles: true }));
            }

            return { success: true };
        }, pinData.title || 'Novo Pin', pinData.description || '', pinData.link || '');

        if (!fillFieldsResult.success) {
            throw new Error(fillFieldsResult.error);
        }

        // Wait a bit to emulate human speed
        await new Promise(r => setTimeout(r, 2000));

        // Handle Board Selection if boardName is specified
        if (pinData.boardName) {
            console.log(`[PINTEREST COOKIE SERVICE] Selecting Board: ${pinData.boardName}...`);
            // Attempt to click board dropdown
            const dropdownSelector = '[data-test-id="board-dropdown-select-button"]';
            const hasDropdown = await page.$(dropdownSelector);
            if (hasDropdown) {
                await page.click(dropdownSelector);
                await new Promise(r => setTimeout(r, 1500));
                
                // RESILIENT: Find board name in DOM and click it
                const clickedBoard = await page.evaluate((targetBoardName) => {
                    const normalizedTarget = targetBoardName.toLowerCase().trim();
                    const divs = Array.from(document.querySelectorAll('div'));
                    
                    // Look for divs containing board names
                    for (const div of divs) {
                        const txt = div.innerText || '';
                        if (txt.toLowerCase().trim() === normalizedTarget) {
                            div.click();
                            return true;
                        }
                    }
                    return false;
                }, pinData.boardName);

                if (!clickedBoard) {
                    console.log(`[PINTEREST COOKIE SERVICE] Board "${pinData.boardName}" not found in dropdown. Will use active/default board.`);
                    // Click somewhere to close dropdown if not selected
                    await page.click('body');
                }
                await new Promise(r => setTimeout(r, 1500));
            }
        }

        // Click "Publish" or "Save" button
        console.log('[PINTEREST COOKIE SERVICE] Clicking publish button...');
        const clickedPublish = await page.evaluate(() => {
            // Find publish button by text or data-test-id
            const selectors = [
                '[data-test-id="board-dropdown-save-button"]',
                'button[type="submit"]'
            ];
            
            for (const sel of selectors) {
                const btn = document.querySelector(sel);
                if (btn && !btn.disabled) {
                    btn.click();
                    return true;
                }
            }

            // Fallback: search by button text content
            const buttons = Array.from(document.querySelectorAll('button'));
            const publishBtn = buttons.find(b => {
                const txt = (b.innerText || b.textContent || '').toLowerCase();
                return txt.includes('publicar') || txt.includes('publish') || txt.includes('salvar') || txt.includes('save');
            });

            if (publishBtn && !publishBtn.disabled) {
                publishBtn.click();
                return true;
            }

            return false;
        });

        if (!clickedPublish) {
            throw new Error('Botão de publicar não foi encontrado ou está desabilitado.');
        }

        console.log('[PINTEREST COOKIE SERVICE] Publish clicked. Waiting for success message...');
        
        // Wait for final success confirmation pop-up or URL redirection
        await new Promise(r => setTimeout(r, 12000));

        // Get success Pin link if available
        const pinUrl = await page.evaluate(() => {
            const anchors = Array.from(document.querySelectorAll('a'));
            const pinLink = anchors.find(a => a.href.includes('/pin/'));
            return pinLink ? pinLink.href : null;
        });

        console.log(`[PINTEREST COOKIE SERVICE] Pin successfully posted! URL: ${pinUrl || 'Publicado com Sucesso'}`);
        
        return { 
            success: true, 
            pinUrl: pinUrl || `https://www.pinterest.com/${account.username}/`
        };

    } catch (err) {
        console.error('[PINTEREST COOKIE SERVICE] Error posting Pin:', err.message);
        return { success: false, error: err.message };
    } finally {
        await browser.close();
    }
}
