const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const axios = require('axios');

puppeteer.use(StealthPlugin());

async function esperar(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function baixarArquivo(url, nomeArquivo) {
    try {
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream',
            timeout: 0
        });

        const writer = fs.createWriteStream(nomeArquivo);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
    } catch (e) {
        console.log('❌ Erro ao baixar vídeo:', e.message);
    }
}

async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 700;

            const timer = setInterval(() => {
                window.scrollBy(0, distance);
                totalHeight += distance;

                if (totalHeight >= document.body.scrollHeight) {
                    clearInterval(timer);
                    resolve();
                }
            }, 400);
        });
    });
}

async function extractProduct(urlProduto) {
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        userDataDir: './profile_' + Date.now(), // PERFIL NOVO SEMPRE
        ignoreDefaultArgs: ['--restore-last-session'],
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-session-crashed-bubble',
            '--disable-infobars',
            '--disable-notifications',
            '--disable-extensions',
            '--disable-blink-features=AutomationControlled',
            '--start-maximized',
            '--no-first-run',
            '--no-default-browser-check'
        ]
    });

    const pages = await browser.pages();
    for (const p of pages) {
        await p.close();
    }

    const page = await browser.newPage();
    await page.goto('about:blank');

    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    let videosEncontrados = [];
    let imagensEncontradas = [];

    page.on('response', async (response) => {
        try {
            const reqUrl = response.url();

            if (
                reqUrl.includes('.mp4') ||
                reqUrl.includes('.m3u8') ||
                reqUrl.includes('video') ||
                reqUrl.includes('media')
            ) {
                if (!videosEncontrados.includes(reqUrl)) {
                    videosEncontrados.push(reqUrl);
                    console.log('🎥 VIDEO:', reqUrl);
                }
            }

            if (
                reqUrl.includes('.jpg') ||
                reqUrl.includes('.jpeg') ||
                reqUrl.includes('.png') ||
                reqUrl.includes('.webp')
            ) {
                if (!imagensEncontradas.includes(reqUrl)) {
                    imagensEncontradas.push(reqUrl);
                }
            }
        } catch (e) {}
    });

    console.log('🌍 INDO PARA:', urlProduto);

    await page.goto(urlProduto, {
        waitUntil: 'domcontentloaded',
        timeout: 0
    });

    await esperar(8000);

    await autoScroll(page);

    // tenta ativar videos html5
    try {
        const vids = await page.$$('video');
        for (const v of vids) {
            try {
                await page.evaluate(el => el.play(), v);
            } catch(e){}
        }
        await esperar(5000);
    } catch(e){}

    // parse html interno procurando midias
    const html = await page.content();

    const videosHtml = html.match(/https?:\/\/[^"' ]+\.(mp4|m3u8)/g);
    if (videosHtml) {
        videosHtml.forEach(v => {
            if (!videosEncontrados.includes(v)) videosEncontrados.push(v);
        });
    }

    const imagensHtml = html.match(/https?:\/\/[^"' ]+\.(jpg|jpeg|png|webp)/g);
    if (imagensHtml) {
        imagensHtml.forEach(v => {
            if (!imagensEncontradas.includes(v)) imagensEncontradas.push(v);
        });
    }

    const dados = await page.evaluate(() => {
        function pegar(lista) {
            for (let s of lista) {
                const el = document.querySelector(s);
                if (el && el.innerText.trim()) return el.innerText.trim();
            }
            return null;
        }

        return {
            titulo: pegar([
                '#productTitle',
                'h1',
                '.product-title-text',
                '.pdp-product-name',
                '.title--wrap--UUHae_g'
            ]),
            preco: pegar([
                '.a-price .a-offscreen',
                '.product-price-current',
                '.price--currentPriceText--V8_y_b5',
                '.uniform-banner-box-price',
                '.es--wrap--erdmPRe'
            ]),
            descricao: pegar([
                '#feature-bullets',
                '#productDescription',
                '.detail-desc-decorate-richtext',
                '.product-description',
                '.specification--list--GZuXzRX'
            ])
        };
    });

    if (videosEncontrados.length > 0) {
        console.log('⬇ Baixando video...');
        await baixarArquivo(videosEncontrados[0], 'video_produto.mp4');
    }

    const resultado = {
        url: urlProduto,
        titulo: dados.titulo,
        preco: dados.preco,
        descricao: dados.descricao,
        video: videosEncontrados[0] || null,
        imagens: imagensEncontradas.slice(0, 20)
    };

    fs.writeFileSync('produto_extraido.json', JSON.stringify(resultado, null, 2));

    console.log('\n==============================');
    console.log('✅ EXTRAÇÃO FINALIZADA');
    console.log(JSON.stringify(resultado, null, 2));
    console.log('==============================\n');

    await browser.close();
}



// ======================================
// COLE A URL DO PRODUTO AQUI
// ======================================

extractProduct('https://www.amazon.com.br/Bluetooth-JBL-PartyBox-Encore-Essential/dp/B0B34XSXHP/');