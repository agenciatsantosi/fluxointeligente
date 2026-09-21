// shopee-video-extractor.js
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

const url = process.argv[2];
const downloadVideos = process.argv.includes('--download');

if (!url) {
    console.error('Por favor, forneça uma URL da Shopee como argumento.');
    console.error('Uso: node shopee-video-extractor.js <URL> [--download]');
    process.exit(1);
}

// Função para baixar vídeo
function downloadVideo(videoUrl, filename) {
    return new Promise((resolve, reject) => {
        const protocol = videoUrl.startsWith('https') ? https : http;
        const file = fs.createWriteStream(filename);

        protocol.get(videoUrl, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                // Seguir redirect
                downloadVideo(response.headers.location, filename)
                    .then(resolve)
                    .catch(reject);
                return;
            }

            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve(filename);
            });
        }).on('error', (err) => {
            fs.unlink(filename, () => { });
            reject(err);
        });
    });
}

async function extractShopeeVideo(url) {
    console.log(`\n🔍 Extraindo vídeos de: ${url}\n`);

    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--window-size=1920,1080'
        ]
    });

    const videoUrls = new Set();
    const allMediaUrls = new Set();

    try {
        const page = await browser.newPage();

        // Configura viewport
        await page.setViewport({ width: 1920, height: 1080 });

        // Configura User-Agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Headers extras
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
        });

        // Intercepta requisições de rede para capturar URLs de vídeo
        page.on('response', async (response) => {
            const responseUrl = response.url();
            const contentType = response.headers()['content-type'] || '';

            // Captura URLs de vídeo
            if (responseUrl.includes('.mp4') ||
                responseUrl.includes('.m3u8') ||
                responseUrl.includes('video') ||
                contentType.includes('video') ||
                responseUrl.includes('playback') ||
                responseUrl.includes('stream')) {

                // Filtra URLs válidas
                if (!responseUrl.includes('tracking') && !responseUrl.includes('analytics')) {
                    videoUrls.add(responseUrl);
                }
            }

            // Captura todas as mídias
            if (contentType.includes('video') || contentType.includes('audio')) {
                allMediaUrls.add(responseUrl);
            }
        });

        // Intercepta requisições
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            const reqUrl = request.url();

            // Captura requisições de vídeo
            if (reqUrl.includes('.mp4') ||
                reqUrl.includes('.m3u8') ||
                reqUrl.includes('video') ||
                reqUrl.includes('playback') ||
                reqUrl.includes('stream')) {

                if (!reqUrl.includes('tracking') && !reqUrl.includes('analytics')) {
                    videoUrls.add(reqUrl);
                }
            }

            // Bloqueia recursos desnecessários para acelerar
            const blockedTypes = ['image', 'stylesheet', 'font'];
            if (blockedTypes.includes(request.resourceType())) {
                request.abort();
            } else {
                request.continue();
            }
        });

        console.log('⏳ Carregando página...');

        // Navega para a URL
        await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        console.log('✓ Página carregada!');
        console.log('⏳ Procurando vídeos na página...');

        // Espera um pouco para carregar conteúdo dinâmico
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Tenta clicar no vídeo para iniciar o carregamento
        try {
            // Procura por elementos de vídeo ou botão de play
            const videoSelectors = [
                'video',
                '[class*="video"]',
                '[class*="Video"]',
                '[class*="player"]',
                '[class*="Player"]',
                '.product-video',
                '.video-container',
                '[data-video]',
                '.carousel video',
                '.media-player'
            ];

            for (const selector of videoSelectors) {
                const element = await page.$(selector);
                if (element) {
                    console.log(`✓ Encontrado elemento: ${selector}`);
                    try {
                        await element.click();
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    } catch (e) {
                        // Ignora erro de clique
                    }
                }
            }
        } catch (e) {
            // Ignora erros de interação
        }

        // Scroll na página para carregar mais conteúdo
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                const distance = 300;
                const timer = setInterval(() => {
                    const scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;
                    if (totalHeight >= scrollHeight || totalHeight > 3000) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 100);
            });
        });

        // Espera mais um pouco
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Extrai URLs de vídeo do HTML
        const htmlVideoUrls = await page.evaluate(() => {
            const urls = [];

            // Procura em tags video
            document.querySelectorAll('video').forEach(video => {
                if (video.src) urls.push(video.src);
                if (video.currentSrc) urls.push(video.currentSrc);

                // Procura em source
                video.querySelectorAll('source').forEach(source => {
                    if (source.src) urls.push(source.src);
                });
            });

            // Procura em iframes
            document.querySelectorAll('iframe').forEach(iframe => {
                if (iframe.src && iframe.src.includes('video')) {
                    urls.push(iframe.src);
                }
            });

            // Procura em data attributes
            document.querySelectorAll('[data-video-url], [data-src]').forEach(el => {
                const videoUrl = el.getAttribute('data-video-url') || el.getAttribute('data-src');
                if (videoUrl && (videoUrl.includes('.mp4') || videoUrl.includes('video'))) {
                    urls.push(videoUrl);
                }
            });

            // Procura em scripts por URLs de vídeo
            document.querySelectorAll('script').forEach(script => {
                const content = script.textContent || '';
                const matches = content.match(/https?:\/\/[^"'\s]+\.mp4[^"'\s]*/g);
                if (matches) {
                    urls.push(...matches);
                }

                // Procura por padrões de vídeo da Shopee
                const shopeeMatches = content.match(/https?:\/\/[^"'\s]*(?:video|playback|stream)[^"'\s]*/g);
                if (shopeeMatches) {
                    urls.push(...shopeeMatches);
                }
            });

            return urls;
        });

        // Adiciona URLs do HTML
        htmlVideoUrls.forEach(url => videoUrls.add(url));

        // Procura por dados JSON na página
        const jsonVideoUrls = await page.evaluate(() => {
            const urls = [];

            // Procura por variáveis globais comuns da Shopee
            const globalVars = [
                '__PRELOADED_STATE__',
                '__INITIAL_STATE__',
                '__APP_STATE__',
                'pageData',
                'productData'
            ];

            globalVars.forEach(varName => {
                try {
                    const data = window[varName];
                    if (data) {
                        const str = JSON.stringify(data);
                        const matches = str.match(/https?:\/\/[^"]+\.mp4[^"]*/g);
                        if (matches) {
                            urls.push(...matches);
                        }
                    }
                } catch (e) { }
            });

            return urls;
        });

        // Adiciona URLs do JSON
        jsonVideoUrls.forEach(url => videoUrls.add(url));

        // Filtra e limpa URLs
        const cleanUrls = Array.from(videoUrls)
            .filter(url => {
                return url &&
                    (url.includes('.mp4') || url.includes('.m3u8') || url.includes('video') || url.includes('playback')) &&
                    !url.includes('tracking') &&
                    !url.includes('analytics') &&
                    !url.includes('beacon') &&
                    url.startsWith('http');
            })
            .map(url => {
                // Remove parâmetros de tracking
                try {
                    const urlObj = new URL(url);
                    return urlObj.origin + urlObj.pathname;
                } catch {
                    return url;
                }
            });

        // Remove duplicatas
        const uniqueUrls = [...new Set(cleanUrls)];

        console.log('\n' + '='.repeat(60));
        console.log('📹 VÍDEOS ENCONTRADOS:');
        console.log('='.repeat(60));

        if (uniqueUrls.length === 0) {
            console.log('\n❌ Nenhum vídeo encontrado.');
            console.log('\nPossíveis razões:');
            console.log('  • O produto não possui vídeo');
            console.log('  • O vídeo está em um formato não suportado');
            console.log('  • A página usa proteção contra scraping');
        } else {
            uniqueUrls.forEach((url, index) => {
                console.log(`\n${index + 1}. ${url}`);
            });

            // Salva URLs em arquivo
            const outputFile = 'shopee_videos.txt';
            fs.writeFileSync(outputFile, uniqueUrls.join('\n'));
            console.log(`\n✓ URLs salvas em: ${outputFile}`);

            // Baixa vídeos se solicitado
            if (downloadVideos) {
                console.log('\n⏳ Baixando vídeos...');

                const downloadFolder = 'shopee_downloads';
                if (!fs.existsSync(downloadFolder)) {
                    fs.mkdirSync(downloadFolder);
                }

                for (let i = 0; i < uniqueUrls.length; i++) {
                    const videoUrl = uniqueUrls[i];
                    if (videoUrl.includes('.mp4')) {
                        const filename = path.join(downloadFolder, `video_${i + 1}.mp4`);
                        try {
                            console.log(`   Baixando ${i + 1}/${uniqueUrls.length}...`);
                            await downloadVideo(videoUrl, filename);
                            console.log(`   ✓ Salvo: ${filename}`);
                        } catch (err) {
                            console.log(`   ✗ Erro ao baixar: ${err.message}`);
                        }
                    }
                }
            }
        }

        console.log('\n' + '='.repeat(60));

    } catch (error) {
        console.error('\n❌ Erro:', error.message);

        if (error.message.includes('timeout')) {
            console.log('\nDica: A página demorou muito para carregar. Tente novamente.');
        }
    } finally {
        await browser.close();
    }
}

// Executa
extractShopeeVideo(url);
