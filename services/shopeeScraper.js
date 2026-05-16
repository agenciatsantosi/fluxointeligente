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
 
// Limite de concorrência para o Puppeteer (evita travar o servidor)
let activePuppeteerInstances = 0;
const MAX_CONCURRENT_PUPPETEER = 2;
const puppeteerQueue = [];
 
async function acquirePuppeteerLock() {
    if (activePuppeteerInstances < MAX_CONCURRENT_PUPPETEER) {
        activePuppeteerInstances++;
        return;
    }
    return new Promise(resolve => puppeteerQueue.push(resolve));
}
 
function releasePuppeteerLock() {
    if (puppeteerQueue.length > 0) {
        const next = puppeteerQueue.shift();
        next();
    } else {
        activePuppeteerInstances = Math.max(0, activePuppeteerInstances - 1);
    }
}

/**
 * Extrai dados completos de um produto da Shopee (imagens e vídeos)
 * VERSÃO ULTRA-OTIMIZADA - Com Fallback Mobile e Persistência de Sessão
 */
export async function scrapeShopeeProduct(productUrl, options = {}) {
    await acquirePuppeteerLock();
    let browser = null;
    let page = null;
    let userDataDir = null;
    let result = null;

    try {
        const { mediaType = 'auto' } = options;
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
        userDataDir = path.join(os.tmpdir(), `shopee_session_${uniqueId}`);
        if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

        // Opção de modo visível para resolver Captchas
        const isHeadless = !process.argv.includes('--visible');

        browser = await puppeteerExtra.launch({
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

        // Limpar e reconstruir link no formato clássico (o que funciona no terminal)
        try {
            const idMatch = targetUrl.match(/\.i\.(\d+)\.(\d+)/) || 
                           targetUrl.match(/product\/(\d+)\/(\d+)/) || 
                           targetUrl.match(/-i\.(\d+)\.(\d+)/) ||
                           targetUrl.match(/\/(\d+)\/(\d+)(?:\?|$)/);

            if (idMatch) {
                shopId = idMatch[1];
                itemId = idMatch[2];
                targetUrl = `https://shopee.com.br/product-i.${shopId}.${itemId}`;
                console.log(`🧹 Link reconstruído (Formato Terminal): ${targetUrl}`);
            } else {
                const urlObj = new URL(targetUrl);
                targetUrl = `${urlObj.origin}${urlObj.pathname}`;
            }
        } catch (e) {}

        // ============ TENTATIVA DE EXTRAÇÃO DIRETA VIA API (BYPASS) ============
        if (shopId && itemId) {
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
                            if (v.video_url) {
                                let vUrl = v.video_url;
                                if (vUrl.startsWith('//')) vUrl = 'https:' + vUrl;
                                videos.push(vUrl);
                            }
                        });
                    }

                    // Se temos o que o usuário pediu (ou qualquer coisa no modo 'auto'), retornamos agora
                    const hasRequestedMedia = (mediaType === 'video' && videos.length > 0) || 
                                            (mediaType === 'image' && images.length > 0) || 
                                            (mediaType === 'auto' && (videos.length > 0 || images.length > 0));

                    if (hasRequestedMedia) {
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
                    console.log('⚠️ API Direct não retornou a mídia desejada. Tentando via Navegador...');
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
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
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
                const internalData = await fetchProductDataInternally(shopId, itemId);
                if (internalData && internalData.videos && internalData.videos.length > 0) {
                    console.log(`✅ Vídeo capturado via Bypass Interno!`);
                    internalData.videos.forEach(v => interceptedData.videos.add(v));
                }
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
                let foundGallery = false;
                for(let i=0; i<4; i++) {
                    await page.mouse.move(Math.random() * 500, Math.random() * 500);
                    // Aguarda o carregamento de pelo menos uma imagem da galeria ou container principal
                    try {
                        await page.waitForSelector('.swiper-slide img, .product-gallery img, [class*="gallery"] img', { timeout: 3000 });
                        foundGallery = true;
                    } catch(e) {
                        console.warn(`[SCRAPER] ⚠️ Galeria de imagens não detectada no DOM (Tentativa ${i+1}).`);
                        if (challenge || !foundGallery) break; // Se tem captcha ou falhou na primeira, não insiste 4 vezes.
                    }
                    
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

            // Captura via DOM Final (Fallback agressivo)
            try {
                const domVids = await page.evaluate(() => {
                    const vids = [];
                    document.querySelectorAll('video source, video').forEach(v => {
                        if (v.src && v.src.startsWith('http')) vids.push(v.src);
                    });
                    const html = document.body.innerHTML;
                    const regex = /"(https:\/\/cv\.shopee\.com\.br\/file\/[^"]+)"/g;
                    let m;
                    while ((m = regex.exec(html)) !== null) { vids.push(m[1]); }
                    return vids;
                });
                domVids.forEach(v => interceptedData.videos.add(v));
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

        // Aguarda o carregamento de pelo menos uma imagem da galeria no DOM final
        await page.waitForSelector('.swiper-slide img, .product-gallery img, [class*="gallery"] img', { timeout: 2000 }).catch(() => {
            console.warn('[SCRAPER] ⚠️ Galeria não detectada no DOM final. Prosseguindo com dados interceptados.');
        });

        // Extração Final
        const domData = await page.evaluate(() => {
            const name = document.querySelector('h1')?.textContent?.trim() || 
                         document.querySelector('.product-name')?.textContent?.trim() || 
                         document.querySelector('div[class*="product_name"]')?.textContent?.trim() ||
                         document.title.split('|')[0].trim();
            
            const priceText = document.querySelector('div[class*="price"]')?.textContent?.trim() || '0';
            
            // DOM Fallback para Imagens (Filtro agressivo contra propaganda)
            const imagesFound = Array.from(document.querySelectorAll('img'))
                .map(img => {
                    const src = img.src || img.dataset.src || img.getAttribute('data-src') || img.srcset?.split(' ')[0];
                    const parent = img.closest('.swiper-slide, [class*="gallery"], [class*="carousel"], [class*="product-image"], .product-gallery');
                    // Bloqueio de Logos e Seções de Vendedor
                    const isShopLogo = !!img.closest('[class*="shop"], [class*="seller"], [class*="store"]');
                    if (isShopLogo && !parent) return null;
                    
                    return { 
                        src, 
                        isGallery: !!parent && !isShopLogo,
                        width: img.naturalWidth || 0,
                        height: img.naturalHeight || 0
                    };
                })
                .filter(img => img && img.src && img.isGallery)
                .filter(img => {
                    if (!img.src || !img.src.startsWith('http')) return false;
                    const s = img.src.toLowerCase();
                    
                    // Blacklist pesada
                    const blacklist = [
                        'banner', 'promo', 'voucher', 'giveaway', 'universo', 'geek', 'bg', 'overlay', 'icon', 'logo', 
                        '5.5', '6.6', '7.7', '8.8', '9.9', '10.10', '11.11', '12.12', 'shopee', 'torcida', 'compre', 'agora', 'ganhe', 'oferta',
                        'principia', 'oficiais', 'melhores-ofertas', 'selo', 'lojas', 'principais-ofertas', 'frete-gratis', 'cupom', 'universal', 'playstation', 'funko'
                    ];
                    
                    if (blacklist.some(word => s.includes(word))) return false;
                    
                    // Filtra por tamanho/proporção: prioriza 1:1 (quadrado)
                    if (img.width > 0 && img.height > 0) {
                        const ratio = img.width / img.height;
                        // Banners costumam ser muito largos (ratio > 1.3) ou muito altos
                        if (ratio > 1.2 || ratio < 0.8) return false;
                        if (img.width < 300 || img.height < 300) return false;
                    }
                    
                    return true;
                });
            
            // Prioriza imagens que estão dentro da galeria/carrossel do produto
            const domImages = [
                ...imagesFound.filter(i => i.isGallery).map(i => i.src),
                ...imagesFound.filter(i => !i.isGallery && i.src.includes('cf.shopee.com.br/file/')).map(i => i.src)
            ];
            
            // DOM Fallback para Vídeos (Filtro agressivo e busca profunda)
            const domVideos = Array.from(document.querySelectorAll('video, video source, [src*=".mp4"], [data-src*=".mp4"], .swiper-slide video'))
                .map(v => v.src || v.querySelector('source')?.src || v.getAttribute('src') || v.getAttribute('data-src'))
                .filter(src => src && (src.startsWith('http') || src.startsWith('blob:')) && (src.includes('.mp4') || src.includes('video')));

            return { 
                name, 
                price: parseFloat(priceText.replace(/[^\d,]/g, '').replace(',', '.')) || 0,
                domImages,
                domVideos
            };
        });

        // --- FAXINA FINAL NAS IMAGENS (Audit de Segurança) ---
        // Prioriza imagens encontradas no DOM (que já passaram por filtros de galeria e tamanho)
        const rawImages = [...new Set([...domData.domImages, ...Array.from(interceptedData.images)])];
        
        const finalImagesList = rawImages.filter(src => {
            if (!src || !src.startsWith('http')) return false;
            const s = src.toLowerCase();
            const blacklist = [
                'banner', 'promo', 'voucher', 'giveaway', 'universo', 'geek', 'bg', 'overlay', 'icon', 'logo', 
                '5.5', '6.6', '7.7', '8.8', '9.9', '10.10', '11.11', '12.12', 'coupon', 'shopee_logo', 'shopee_icon',
                'principia', 'oficiais', 'melhores-ofertas', 'selo', 'lojas', 'principais-ofertas', 'frete-gratis', 'cupom', 'universal',
                'shopee_ss', 'marketing', 'event', 'sale', 'torcida', 'shopee-br', 'compra-garantida', 'envio-imediato', 'venda-quente',
                'loja_oficial', 'official_store', 'frete_gratis', 'lojas_oficiais', 'tetri', 'melhores_ofertas',
                'overlay', 'background', 'invite', 'share', 'campaign', 'event', 'produtos_oficiais',
                'coins', 'moedas', 'wallet', 'shopee_icon', 'app_icon', 'search_icon', 'star_icon',
                'shop_logo', 'seller_logo', 'store_logo', 'profile', 'avatar', 'profile_image'
            ];
            
            const isBlacklisted = blacklist.some(word => s.includes(word));
            if (isBlacklisted) return false;

            // Filtro de Hash Real (Produtos Shopee reais têm hashes longos e sem hifens estranhos no meio)
            // Imagens de propaganda/ícones costumam ter hifens como 'br-11134258-81z1k-mi1q'
            const urlParts = s.split('/');
            const filename = urlParts[urlParts.length - 1];
            const hash = filename.split('.')[0];
            
            // PADRÃO DE LOGO/AVATAR DA SHOPEE: Começa com 'br-' ou 'sg-' seguido de muitos números e hifens
            if (hash.startsWith('br-') || hash.startsWith('sg-') || hash.startsWith('my-') || hash.startsWith('id-') || hash.startsWith('vn-')) {
                console.log(`[SCRAPER] 🚫 Imagem descartada por padrão de LOGO/AVATAR detectado: ${hash}`);
                return false;
            }

            // Se o hash for curto ou tiver muitos hifens, é suspeito (normalmente propaganda ou ativos do site)
            if (hash.length < 20 || (hash.match(/-/g) || []).length > 1) {
                console.log(`[SCRAPER] 🚫 Imagem descartada por padrão de hash suspeito/curto: ${hash}`);
                return false;
            }

            return true;
        });

        // Priorizar imagens que têm o padrão de HASH de produto da Shopee (32 caracteres hexadecimais no final ou no path)
        // Exemplo: https://cf.shopee.com.br/file/7d23f39a031e42867073282b993c1d04
        const prioritizedImages = [
            ...finalImagesList.filter(img => img.includes('cf.shopee.com.br/file/') && !img.includes('_tn')),
            ...finalImagesList.filter(img => !img.includes('cf.shopee.com.br/file/'))
        ];

        if (prioritizedImages.length > 0) {
            console.log(`[SCRAPER] ✅ Imagem principal selecionada: ${prioritizedImages[0].substring(0, 80)}...`);
        } else {
            console.warn(`[SCRAPER] ⚠️ Todas as imagens foram filtradas ou são banners. O produto pode ficar sem imagem para evitar postagem de propaganda.`);
        }

        result = {
            itemId: (page.url().match(/\.(\d+)\.(\d+)/) || [0,0,`shopee_${Date.now()}`])[2],
            name: (domData.name === 'Shopee Brasil' ? interceptedData.productInfo?.name : domData.name) || 'Produto Shopee',
            price: domData.price || (interceptedData.productInfo?.price / 100000) || 0,
            images: prioritizedImages,
            videos: [...new Set([...domData.domVideos, ...Array.from(interceptedData.videos)])].filter(v => v && v.startsWith('http')),
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
        releasePuppeteerLock();

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
            let imgUrl = productData.images[i];
            if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
            
            const filename = `img_${i + 1}.jpg`;
            const dest = path.join(mediaDir, filename);
            
            if (i === 0) console.log(`[SCRAPER] ⬇️ Baixando imagem principal: ${imgUrl.substring(0, 80)}...`);
            const res = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 15000 });
            fs.writeFileSync(dest, res.data);
            localImages.push(`/shopee-media/${productData.itemId}/${filename}`);
        } catch (e) {
            console.warn(`[SCRAPER] Erro ao baixar imagem ${i + 1}:`, e.message);
        }
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