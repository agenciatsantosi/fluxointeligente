import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

puppeteerExtra.use(StealthPlugin());

/**
 * Extrai dados completos de um produto da Shopee (imagens e vídeos)
 * VERSÃO ULTRA-OTIMIZADA - Com Fallback Mobile e Persistência de Sessão
 */
export async function scrapeShopeeProduct(productUrl) {
    let result = null;
    let page = null;
    let interceptedData = {
        videos: new Set(),
        images: new Set(),
        productInfo: null
    };
    let shopId = null;
    let itemId = null;
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🚀 SHOPEE SCRAPER PRO - Iniciando extração`.padStart(50));
    console.log(`${'='.repeat(70)}\n`);

    // Diretório de sessão único em local temporário do sistema para evitar conflitos de simultaneidade
    // e impedir que o Nodemon reinicie o servidor ao detectar mudanças no diretório do projeto
    const uniqueId = Math.random().toString(36).substring(7);
    const userDataDir = path.join(os.tmpdir(), `shopee_session_${uniqueId}`);
    if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

    // Opção de modo visível para resolver Captchas
    const isHeadless = !process.argv.includes('--visible');

    const browser = await puppeteerExtra.launch({
        headless: isHeadless ? 'new' : false, 
        userDataDir,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        ignoreHTTPSErrors: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-infobars',
            '--disable-web-security',
            '--window-size=1366,768',
            '--lang=pt-BR,pt',
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-extensions'
        ]
    });

    try {
        let targetUrl = productUrl;
        
        // Resolver links encurtados para pegar os IDs reais
        const isShortLink = productUrl.includes('shp.ee') || 
                           productUrl.includes('s.shopee.com.br') || 
                           productUrl.includes('shope.ee') || 
                           productUrl.includes('shopee.com.br/m/');
                           
        if (isShortLink) {
            console.log('🔗 Resolvendo link encurtado...');
            try {
                const headRes = await axios.get(productUrl, { 
                    maxRedirects: 5,
                    timeout: 5000,
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36' }
                });
                targetUrl = headRes.request.res.responseUrl || headRes.config.url;
                console.log(`✅ Link resolvido: ${targetUrl}`);
            } catch (e) {
                console.warn('⚠️ Falha ao resolver link encurtado:', e.message);
            }
        }

        // ============ TENTATIVA DE EXTRAÇÃO DIRETA VIA API (BYPASS) ============
        const idMatch = targetUrl.match(/\.i\.(\d+)\.(\d+)/) || 
                       targetUrl.match(/product\/(\d+)\/(\d+)/) || 
                       targetUrl.match(/-i\.(\d+)\.(\d+)/) ||
                       targetUrl.match(/\/(\d+)\/(\d+)(?:\?|$)/); // Padrão: /shopId/itemId
        
        if (idMatch) {
            shopId = idMatch[1];
            itemId = idMatch[2];
            console.log(`📡 Tentando Extração Direta via API (Shop: ${shopId}, Item: ${itemId})...`);
            
            try {
                const apiRes = await axios.get(`https://shopee.com.br/api/v4/item/get?itemid=${itemId}&shopid=${shopId}`, {
                    timeout: 8000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
                        'Accept': 'application/json',
                        'x-shopee-language': 'pt-BR',
                        'Referer': productUrl
                    }
                });

                if (apiRes.data && apiRes.data.data) {
                    const d = apiRes.data.data;
                    console.log(`✅ Sucesso via API Direct! [${d.name}]`);
                    
                    const images = (d.images || []).map(id => `https://cf.shopee.com.br/file/${id}`);
                    const videos = [];
                    if (d.video_info_list && d.video_info_list.length > 0) {
                        d.video_info_list.forEach(v => {
                            if (v.video_url) videos.push(v.video_url);
                        });
                    }

                    if (videos.length > 0) {
                        return {
                            itemId: d.itemid?.toString() || itemId,
                            name: d.name,
                            price: d.price / 100000,
                            images,
                            videos,
                            localImages: [],
                            localVideos: []
                        };
                    }
                    console.log('⚠️ API Direct não retornou vídeos. Tentando via Navegador para garantir...');
                }
            } catch (apiErr) {
                console.warn(`⚠️ API Direct bloqueada (403/429). Seguindo para Navegador...`);
            }
        }

        page = await browser.newPage();
        
        // Dados coletados
        interceptedData = {
            videos: new Set(),
            images: new Set(),
            productInfo: null
        };

        // ============ INTERCEPTAÇÃO DE REDE TOTAL ============
        page.on('response', async (response) => {
            try {
                const url = response.url().toLowerCase();
                const contentType = response.headers()['content-type'] || '';

                // Captura Agressiva: Qualquer coisa que pareça vídeo ou venha de domínios de mídia
                const isVideo = url.includes('.mp4') || url.includes('.m3u8') || 
                               url.includes('video') || url.includes('vod.shopee') || 
                               url.includes('cv.shopee') || contentType.includes('video');

                if (isVideo) {
                    if (!url.includes('image') && !url.includes('.js') && !url.includes('.css') && !url.includes('.json')) {
                        interceptedData.videos.add(response.url());
                    }
                }

                if (url.includes('/api/v4/item/get') || url.includes('get_item')) {
                    const text = await response.text();
                    const json = JSON.parse(text);
                    const data = json.data || json.item;
                    if (data) {
                        if (!interceptedData.productInfo) interceptedData.productInfo = data;
                        // Busca profunda por IDs de vídeo
                        const str = JSON.stringify(data);
                        const idRegex = /"video_id"\s*:\s*"([a-f0-9]{32,})"/gi;
                        let m;
                        while ((m = idRegex.exec(str)) !== null) {
                            interceptedData.videos.add(`https://cv.shopee.com.br/file/${m[1]}`);
                        }
                    }
                }

                if (contentType.includes('image/') && (url.includes('cf.shopee') || url.includes('susercontent'))) {
                    interceptedData.images.add(response.url().split('_tn')[0].split('_thumbnail')[0]);
                }
            } catch (e) {}
        });

        // ============ INJEÇÃO DE BUSCA DE DADOS (BYPASS API) ============
        const fetchProductDataInternally = async (sId, iId) => {
            if (!sId || !iId) return false;
            try {
                console.log(`📡 Solicitando dados internos (Shop: ${sId}, Item: ${iId})...`);
                const data = await page.evaluate(async (s, i) => {
                    try {
                        const response = await fetch(`https://shopee.com.br/api/v4/item/get?itemid=${i}&shopid=${s}`);
                        return await response.json();
                    } catch (e) {
                        return { error: e.message };
                    }
                }, sId, iId);

                if (data && data.data) {
                    const d = data.data;
                    console.log(`✅ Dados recuperados internamente! [${d.name}]`);
                    if (d.video_info_list && d.video_info_list.length > 0) {
                        d.video_info_list.forEach(v => {
                            if (v.video_url) {
                                console.log(`🎥 Vídeo encontrado via API interna!`);
                                interceptedData.videos.add(v.video_url);
                            }
                        });
                    }
                    if (d.images && d.images.length > 0) {
                        d.images.forEach(imgId => {
                            interceptedData.images.add(`https://cf.shopee.com.br/file/${imgId}`);
                        });
                    }
                    return true;
                }
            } catch (e) {
                console.warn(`⚠️ Falha na busca interna: ${e.message}`);
            }
            return false;
        };

        // ============ NAVEGAÇÃO STEALTH ============
        const navigateAndScrape = async (targetUrl, isMobile = false) => {
            console.log(`🌐 Navegando (${isMobile ? 'MOBILE' : 'DESKTOP'})...`);
            
            const uas = [
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
            ];
            const mobileUas = [
                'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1',
                'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36'
            ];

            if (isMobile) {
                await page.setUserAgent(mobileUas[Math.floor(Math.random() * mobileUas.length)]);
                await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
            } else {
                await page.setUserAgent(uas[Math.floor(Math.random() * uas.length)]);
                await page.setViewport({ width: 1366, height: 768 });
            }

            // Headers mínimos para evitar detecção
            await page.setExtraHTTPHeaders({ 
                'Accept-Language': 'pt-BR,pt;q=0.9'
            });

            // ESTRATÉGIA DE AQUECIMENTO: Visitar a home primeiro para ganhar cookies e confiança
            console.log('🏠 Aquecendo navegação (Home Shopee)...');
            try {
                await page.goto('https://shopee.com.br/', { waitUntil: 'domcontentloaded', timeout: 20000 });
                await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));
            } catch (e) {
                console.warn('⚠️ Falha no aquecimento, prosseguindo direto...');
            }

            console.log(`🔗 Acessando produto: ${targetUrl.substring(0, 50)}...`);
            await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });
            
            // Tenta extração via API interna (Super Bypass)
            if (shopId && itemId) {
                await fetchProductDataInternally(shopId, itemId);
            }

            // Aguarda um pouco para estabilizar após redirects
            await new Promise(r => setTimeout(r, 3000));
            
            // Checar Bloqueio de Tráfego ou Captcha
            let challenge = false;
            try {
                challenge = await page.evaluate(() => {
                    return !!(document.querySelector('.shopee-verify, #shopee-captcha') || 
                              document.body.innerText.includes('captcha') ||
                              window.location.href.includes('verify/traffic/error'));
                });
            } catch (e) {}

            if (challenge) {
                console.warn('⚠️  Bloqueio ou Captcha detectado. Tentando recarregar uma vez...');
                await new Promise(r => setTimeout(r, 2000));
                await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await new Promise(r => setTimeout(r, 3000));
                
                // Re-checar desafio
                try {
                    challenge = await page.evaluate(() => {
                        return !!(document.querySelector('.shopee-verify, #shopee-captcha') || 
                                  document.body.innerText.includes('captcha') ||
                                  window.location.href.includes('verify/traffic/error'));
                    });
                } catch (e) {}
            }

            if (challenge) {
                console.warn('🛑 BLOQUEIO/CHALLENGE SUSPEITO - Tentando prosseguir assim mesmo...');
            }

            // Captura via DOM (Fallback)
            try {
                const domVid = await page.evaluate(() => {
                    const vid = document.querySelector('video source') || document.querySelector('video');
                    return vid ? vid.src : null;
                });
                if (domVid && domVid.startsWith('http')) interceptedData.videos.add(domVid);
            } catch (e) {}

            // Esperar por qualquer elemento que indique que a página carregou
            try {
                await page.waitForSelector('body', { timeout: 5000 });
                // Tenta esperar um pouco pelo container de produto, mas não morre se não achar
                await page.waitForSelector('[class*="product"], h1, [class*="price"]', { timeout: 5000 }).catch(() => {});
            } catch (e) {}

            // Interação Humana Rápida e Eficiente (Com proteção contra destruição de contexto)
            try {
                for(let i=0; i<4; i++) {
                    await page.mouse.move(Math.random() * 500, Math.random() * 500);
                    try {
                        await page.evaluate(() => window.scrollBy(0, 500));
                    } catch (e) {}
                    await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
                    
                    // Clicar na galeria (apenas os primeiros itens)
                    try {
                        await page.evaluate((idx) => {
                            const el = document.querySelectorAll('img, .shopee-image-manager__item')[idx];
                            if (el) el.click();
                        }, i);
                    } catch (e) {}
                }
            } catch (e) {}

            // Scroll Robusto para garantir carregamento de mídias (Lazy Load)
            try {
                await page.evaluate(async () => {
                    await new Promise((resolve) => {
                        let totalHeight = 0;
                        let distance = 300;
                        let timer = setInterval(() => {
                            let scrollHeight = document.body.scrollHeight;
                            window.scrollBy(0, distance);
                            totalHeight += distance;
                            if (totalHeight >= scrollHeight || totalHeight > 5000) {
                                clearInterval(timer);
                                resolve();
                            }
                        }, 200);
                    });
                }).catch(() => {});
            } catch (e) {}

            await new Promise(r => setTimeout(r, 6000));
        };

        await navigateAndScrape(targetUrl, true); // Tenta Mobile primeiro (mais leve)

        // Se falhou em pegar mídias, tenta Desktop como Fallback
        if (interceptedData.images.size === 0 && interceptedData.videos.size === 0) {
            console.log('⚠️  Nenhuma mídia capturada em Mobile. Tentando Fallback Desktop...');
            // Reset intercepted data for clean retry
            interceptedData.images.clear();
            interceptedData.videos.clear();
            await navigateAndScrape(targetUrl, false); // Tenta Desktop
        }

        // Extração Final
        const domData = await page.evaluate(() => {
            const name = document.querySelector('h1')?.textContent?.trim() || 
                         document.querySelector('.product-name')?.textContent?.trim() || 
                         document.querySelector('div[class*="product_name"]')?.textContent?.trim() ||
                         document.title.split('|')[0].trim();
            
            const priceText = document.querySelector('div[class*="price"]')?.textContent?.trim() || '0';
            
            // DOM Fallback para Imagens (Pega tudo que parece imagem de produto, incluindo lazy-loading)
            const domImages = Array.from(document.querySelectorAll('img'))
                .map(img => img.src || img.dataset.src || img.getAttribute('data-src') || img.srcset?.split(' ')[0])
                .filter(src => src && (src.includes('img') || src.includes('usercontent') || src.includes('cf.shopee')));
            
            // DOM Fallback para Vídeos (Pega tags video, source e atributos de mídia)
            const domVideos = Array.from(document.querySelectorAll('video, video source, [src*=".mp4"], [data-src*=".mp4"]'))
                .map(v => v.src || v.querySelector('source')?.src || v.getAttribute('src') || v.getAttribute('data-src'))
                .filter(src => src && (src.startsWith('http') || src.startsWith('blob:') || src.includes('.mp4')));

            return { 
                name, 
                price: parseFloat(priceText.replace(/[^\d,]/g, '').replace(',', '.')) || 0,
                domImages,
                domVideos
            };
        });

        result = {
            itemId: (page.url().match(/\.(\d+)\.(\d+)/) || [0,0,`shopee_${Date.now()}`])[2],
            name: (domData.name === 'Shopee Brasil' ? interceptedData.productInfo?.name : domData.name) || 'Produto Shopee',
            price: domData.price || (interceptedData.productInfo?.price / 100000) || 0,
            images: [...new Set([...Array.from(interceptedData.images), ...domData.domImages])].filter(i => i && i.startsWith('http')),
            videos: [...new Set([...Array.from(interceptedData.videos), ...domData.domVideos])].filter(v => v && v.startsWith('http')),
            localImages: [],
            localVideos: []
        };

        console.log(`\n✅ Extração concluída: ${result.name}`);
        console.log(`🖼️  Imagens: ${result.images.length} | 🎥 Vídeos: ${result.videos.length}\n`);

        return result;

    } catch (error) {
        console.error(`\n❌ Falha no Scraper: ${error.message}`);
        throw error;
    } finally {
        // Debug: Screenshot em caso de falha total
        try {
            if (page && !page.isClosed()) {
                // Se result não existe ou está vazio, tira screenshot
                // Se não achou VÍDEOS, tira screenshot e dump para análise
                const hasVideos = result && result.videos?.length > 0;
                if (!hasVideos) {
                    const ts = Date.now();
                    const debugPath = path.join(os.tmpdir(), `shopee_error_${ts}.png`);
                    const htmlPath = path.join(os.tmpdir(), `shopee_error_${ts}.html`);
                    
                    await page.screenshot({ path: debugPath });
                    const html = await page.content();
                    fs.writeFileSync(htmlPath, html);
                    
                    console.log(`📸 [DEBUG] Sem vídeo detectado. Screenshot: ${debugPath}`);
                    console.log(`📄 [DEBUG] HTML Dump: ${htmlPath}`);
                }
            }
        } catch (ssErr) {}

        if (browser) await browser.close();

        // Limpa o diretório de sessão temporário
        try {
            if (fs.existsSync(userDataDir)) {
                fs.rmSync(userDataDir, { recursive: true, force: true });
            }
        } catch (cleanErr) {}
    }
}

/**
 * Remove as mídias baixadas para economizar espaço
 */
export async function cleanupProductMedia(itemId) {
    try {
        const mediaDir = path.join(process.cwd(), 'public', 'shopee-media', itemId);
        if (fs.existsSync(mediaDir)) {
            fs.rmSync(mediaDir, { recursive: true, force: true });
            console.log(`[SCRAPER] 🧹 Limpeza concluída para o item: ${itemId}`);
        }
    } catch (e) {
        console.warn(`[SCRAPER] Erro ao limpar mídias do item ${itemId}:`, e.message);
    }
}

/**
 * Baixa as mídias para o servidor local
 */
export async function downloadProductMedia(productData) {
    const mediaDir = path.join(process.cwd(), 'public', 'shopee-media', productData.itemId);
    if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });

    const localImages = [];
    const localVideos = [];

    // Download Imagens
    for (let i = 0; i < Math.min(productData.images.length, 10); i++) {
        try {
            const filename = `img_${i + 1}.jpg`;
            const dest = path.join(mediaDir, filename);
            const res = await axios.get(productData.images[i], { responseType: 'arraybuffer', timeout: 15000 });
            fs.writeFileSync(dest, res.data);
            localImages.push(`/shopee-media/${productData.itemId}/${filename}`);
        } catch (e) {}
    }

    // Download Vídeos
    for (let i = 0; i < productData.videos.length; i++) {
        try {
            const filename = `vid_${i + 1}.mp4`;
            const dest = path.join(mediaDir, filename);
            const res = await axios.get(productData.videos[i], { responseType: 'arraybuffer', timeout: 30000 });
            fs.writeFileSync(dest, res.data);
            localVideos.push(`/shopee-media/${productData.itemId}/${filename}`);
        } catch (e) {}
    }

    return { ...productData, localImages, localVideos };
}

// Execução direta para testes
const isDirectRun = process.argv[1] && 
                   (path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url)));

if (isDirectRun) {
    const url = process.argv[2] || 'https://shopee.com.br/product/1448498368/23799115793';
    scrapeShopeeProduct(url)
        .then(d => downloadProductMedia(d))
        .then(r => console.log('\n✅ Teste Finalizado com Sucesso!'))
        .catch(err => console.error('❌ Erro no Teste:', err));
}