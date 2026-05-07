import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import * as db from './database.js';

const execFileAsync = promisify(execFile);
const YTDLP_BIN_WIN = path.join(process.cwd(), 'bin', 'yt-dlp.exe');
const YTDLP_BIN_LINUX = path.join(process.cwd(), 'bin', 'yt-dlp');

function getYtDlpExecutable() {
    if (process.platform === 'win32') {
        return fs.existsSync(YTDLP_BIN_WIN) ? YTDLP_BIN_WIN : 'yt-dlp';
    } else {
        return fs.existsSync(YTDLP_BIN_LINUX) ? YTDLP_BIN_LINUX : 'yt-dlp';
    }
}

function cleanFbTitle(text) {
    if (!text) return 'Sem título';
    const regex = /^[\d.,]+[KMBkmb]?\s+views?\s*(?:·|-|\|)\s*(?:[\d.,]+[KMBkmb]?\s+(?:reactions?|likes?)\s*\|\s*)?/i;
    return text.replace(regex, '').trim() || 'Sem título';
}

/**
 * Main service for extracting media info and downloading from various platforms
 */

/**
 * Extracts direct media URL and metadata using yt-dlp
 */
export async function fetchMediaInfo(url) {
    // Normaliza links do Kwai que vêm da busca (yt-dlp não suporta /search/)
    if (url && url.includes('kwai.com/search/')) {
        url = url.replace(/\/search\/([^\/]+)\/video\//, '/@$1/video/');
    }

    try {
        let executable = getYtDlpExecutable();

        console.log(`[DOWNLOADER] Analisando URL: ${url}`);
        
        const { stdout } = await execFileAsync(executable, [
            url,
            '--dump-json',
            '--no-playlist',
            '--no-warnings',
            '--format', 'b[ext=mp4]/b',
            '--add-header', 'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        ], { timeout: 60000 });

        const info = JSON.parse(stdout);
        
        // Tenta encontrar o melhor link de vídeo direto (MP4) que contenha ÁUDIO
        let bestVideoUrl = null;
        const formats = info.formats || [];

        // 1. Procurar formatos explícitos com áudio e vídeo juntos (pre-mesclados)
        const bestMp4WithAudio = [...formats].reverse().find(f => 
            f.ext === 'mp4' && f.vcodec !== 'none' && f.acodec !== 'none' && f.url && !f.url.includes('manifest') && !f.url.includes('m3u8')
        );

        if (bestMp4WithAudio) {
            bestVideoUrl = bestMp4WithAudio.url;
        }

        // 2. Fallback: Se info.url estiver presente e aparentar ter áudio
        if (!bestVideoUrl && info.url && !info.url.includes('manifest') && !info.url.includes('m3u8')) {
            if (info.acodec !== 'none') {
                bestVideoUrl = info.url;
            }
        }

        // 3. Fallback: Qualquer outro formato MP4 (melhor que falhar)
        if (!bestVideoUrl) {
            const anyMp4 = [...formats].reverse().find(f => f.ext === 'mp4' && f.url && !f.url.includes('manifest') && !f.url.includes('m3u8'));
            if (anyMp4) bestVideoUrl = anyMp4.url;
        }

        // 4. Último recurso absoluto
        if (!bestVideoUrl) bestVideoUrl = info.url;

        // EXTRAÇÃO DE THUMBNAIL ELITE
        let bestThumb = info.thumbnail;
        if (info.thumbnails && info.thumbnails.length > 0) {
            const sortedThumbs = [...info.thumbnails].sort((a, b) => (b.width || 0) - (a.width || 0));
            const filteredThumbs = sortedThumbs.filter(t => t.url && !t.url.includes('placeholder'));
            if (filteredThumbs.length > 0) bestThumb = filteredThumbs[0].url;
        }

        return {
            title: cleanFbTitle(info.title || info.description?.substring(0, 50)),
            mediaUrl: bestVideoUrl, 
            thumbnailUrl: bestThumb,
            duration: info.duration,
            type: 'video',
            platform: info.extractor_key?.toLowerCase() || 'video',
            sourceUrl: url
        };
    } catch (error) {
        console.error('[DOWNLOADER] fetchMediaInfo error:', error.message);
        
        // Se falhar com headers, tentamos uma última vez SEM headers (às vezes o yt-dlp padrão é melhor)
        try {
            console.log(`[DOWNLOADER] Tentativa de emergência sem headers para: ${url}`);
            let executable = getYtDlpExecutable();
            
            const { stdout } = await execFileAsync(executable, [
                url,
                '--dump-json',
                '--no-playlist',
                '--no-warnings',
                '--format', 'b[ext=mp4]/b'
            ], { timeout: 30000 });

            const info = JSON.parse(stdout);
            
            // Tenta encontrar o melhor link de vídeo direto (MP4) que contenha ÁUDIO
            let bestVideoUrl = null;
            const formats = info.formats || [];

            // 1. Procurar formatos explícitos com áudio e vídeo juntos (pre-mesclados)
            const bestMp4WithAudio = [...formats].reverse().find(f => 
                f.ext === 'mp4' && f.vcodec !== 'none' && f.acodec !== 'none' && f.url && !f.url.includes('manifest') && !f.url.includes('m3u8')
            );

            if (bestMp4WithAudio) {
                bestVideoUrl = bestMp4WithAudio.url;
            }

            // 2. Fallback: Se info.url estiver presente e aparentar ter áudio
            if (!bestVideoUrl && info.url && !info.url.includes('manifest') && !info.url.includes('m3u8')) {
                if (info.acodec !== 'none') {
                    bestVideoUrl = info.url;
                }
            }

            // 3. Fallback: Qualquer outro formato MP4 (melhor que falhar)
            if (!bestVideoUrl) {
                const anyMp4 = [...formats].reverse().find(f => f.ext === 'mp4' && f.url && !f.url.includes('manifest') && !f.url.includes('m3u8'));
                if (anyMp4) bestVideoUrl = anyMp4.url;
            }

            // 4. Último recurso absoluto
            if (!bestVideoUrl) bestVideoUrl = info.url;

            // EXTRAÇÃO DE THUMBNAIL ELITE
            // Buscamos a maior imagem possível e evitamos placeholders cinzas
            let bestThumb = info.thumbnail;
            if (info.thumbnails && info.thumbnails.length > 0) {
                // Ordenar por largura/altura se disponível, ou pegar a última (geralmente maior)
                const sortedThumbs = [...info.thumbnails].sort((a, b) => (b.width || 0) - (a.width || 0));
                const filteredThumbs = sortedThumbs.filter(t => t.url && !t.url.includes('placeholder'));
                if (filteredThumbs.length > 0) bestThumb = filteredThumbs[0].url;
            }

            return {
                title: cleanFbTitle(info.title || info.description?.substring(0, 50)),
                mediaUrl: bestVideoUrl, 
                thumbnailUrl: bestThumb,
                duration: info.duration,
                type: 'video',
                platform: info.extractor_key?.toLowerCase() || 'video',
                sourceUrl: url
            };
        } catch (e2) {
            // Fallback final para URLs diretas
            if (url.includes('.mp4') || url.includes('.mov')) {
                return { title: 'Vídeo Direto', mediaUrl: url, platform: 'video', sourceUrl: url };
            }
            throw new Error(`Não foi possível analisar o link: ${error.message}`);
        }
    }
}

/**
 * Internal helper to download media to local storage for stable posting
 */
export async function downloadToLocal(url, sourcePlatform = 'video', sourceUrl = null) {
    try {
        let success = false;
        const filename = `${sourcePlatform || 'media'}_${crypto.randomUUID()}.mp4`;
        const dir = path.join(process.cwd(), 'uploads', 'downloads');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const localPath = path.join(dir, filename);

        // ESTRATÉGIA ÚNICA E SIMPLES (Igual ao modo manual que funciona)
        // Tentamos baixar o link fornecido diretamente via Axios primeiro.
        if (url && url.startsWith('http') && url !== 'DEFERRED') {
            console.log(`[DOWNLOADER] 📥 Download direto (Método Manual): ${url.substring(0, 50)}...`);
            try {
                const response = await axios({
                    url,
                    method: 'GET',
                    responseType: 'stream',
                    timeout: 60000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                        'Referer': 'https://www.instagram.com/',
                        'Accept': '*/*',
                    }
                });

                const writer = fs.createWriteStream(localPath);
                response.data.pipe(writer);

                await new Promise((resolve, reject) => {
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                });

                const stats = fs.statSync(localPath);
                if (stats.size > 1024 * 50) { 
                    success = true;
                    console.log(`[DOWNLOADER] ✅ Download concluído com sucesso (Axios).`);
                }
            } catch (axiosErr) {
                console.warn(`[DOWNLOADER] ⚠️ Falha no download direto: ${axiosErr.message}`);
            }
        }

        // FALLBACK: Só usa yt-dlp se o de cima falhar OU se for um link de postagem (DEFERRED)
        if (!success && sourceUrl) {
            let executable = getYtDlpExecutable();
            console.log(`[DOWNLOADER] 🔄 Tentando extração profunda via yt-dlp: ${sourceUrl}`);
            
            try {
                await execFileAsync(executable, [
                    sourceUrl,
                    '-o', localPath,
                    '--no-playlist',
                    '--no-warnings',
                    '--format', 'b[ext=mp4]/b',
                    '--add-header', 'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
                ], { timeout: 120000 });

                if (fs.existsSync(localPath)) {
                    const stats = fs.statSync(localPath);
                    if (stats.size > 1024 * 10) success = true;
                }
            } catch (ytErr) {
                console.error(`[DOWNLOADER] ❌ Falha total no download: ${ytErr.message}`);
            }
        }

        if (success && fs.existsSync(localPath)) {
            // REMOVIDO: Normalização por FFmpeg (pode estar falhando se não estiver no PATH)
            // Vamos apenas retornar o arquivo original que foi baixado com sucesso.
            return { success: true, absolutePath: localPath, filename };
        }

        return { success: false, error: 'Download falhou ou arquivo inválido' };
    } catch (error) {
        console.error('[DOWNLOADER] ❌ Falha no download:', error.message);
        return { success: false, error: error.message };
    }
}

/**
export async function ensureYtDlp() {
    try {
        const binDir = path.join(process.cwd(), 'bin');
        if (!fs.existsSync(binDir)) {
            fs.mkdirSync(binDir, { recursive: true });
        }

        const isWin = process.platform === 'win32';
        const binPath = isWin ? YTDLP_BIN_WIN : YTDLP_BIN_LINUX;

        if (fs.existsSync(binPath)) {
            console.log(`[DOWNLOADER] yt-dlp binary found at ${binPath}.`);
            return true;
        }

        console.log(`[DOWNLOADER] yt-dlp binary not found. Downloading for ${process.platform} from GitHub...`);
        
        const url = isWin 
            ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
            : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

        const writer = fs.createWriteStream(binPath);
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream',
            timeout: 60000
        });

        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        if (!isWin) {
            fs.chmodSync(binPath, 0o755);
        }

        console.log(`[DOWNLOADER] yt-dlp successfully downloaded to ${binPath}`);
        return true;
    } catch (e) {
        console.error('[DOWNLOADER] Error downloading yt-dlp:', e.message);
        return false;
    }
}