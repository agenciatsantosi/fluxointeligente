import { fetchMediaInfo } from './services/downloaderService.js';

async function test() {
    try {
        console.log("Iniciando extração via Puppeteer/Regex...");
        const result = await fetchMediaInfo('https://www.instagram.com/p/DYfh320lRQM/');
        console.log("RESULTADO FINAL:");
        console.log(JSON.stringify(result, null, 2));
    } catch (e) {
        console.error("Erro no script:", e);
    }
    process.exit(0);
}

test();
