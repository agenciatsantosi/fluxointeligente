
import * as downloader from './services/downloaderService.js';
import fs from 'fs';

const testUrl = 'https://www.tiktok.com/@achadinhos.deaxe/video/7481000666174065926';

async function test() {
    console.log('--- TESTE DE DOWNLOAD LOCAL ---');
    console.log('URL:', testUrl);
    
    try {
        const res = await downloader.downloadToLocal(testUrl, 'facebook');
        console.log('Resultado:', JSON.stringify(res, null, 2));
        
        if (res.success && res.absolutePath) {
            if (fs.existsSync(res.absolutePath)) {
                console.log('✅ SUCESSO: Arquivo baixado em:', res.absolutePath);
                console.log('Tamanho:', fs.statSync(res.absolutePath).size, 'bytes');
                // Don't delete yet to verify manually
            } else {
                console.log('❌ FALHA: res.success era true, mas o arquivo não existe em:', res.absolutePath);
            }
        } else {
            console.log('❌ FALHA: Download não retornou sucesso.');
        }
    } catch (err) {
        console.error('❌ ERRO CRÍTICO NO TESTE:', err);
    }
}

test();
