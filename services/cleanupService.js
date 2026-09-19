import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

/**
 * Cleanup Service
 * Automatically removes old media files to save disk space
 */

const TARGET_DIRECTORIES = [
    'public/pinterest-media',
    'public/shopee-media',
    'uploads' // Incluindo uploads temporários também
];

const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 horas

export async function runCleanup() {
    console.log(`[CLEANUP] Iniciando limpeza de arquivos temporários...`);
    let deletedCount = 0;
    let errorCount = 0;

    for (const relDir of TARGET_DIRECTORIES) {
        const dirPath = path.join(ROOT_DIR, relDir);
        
        try {
            // Garantir que a pasta existe antes de ler
            await fs.access(dirPath).catch(async () => {
                await fs.mkdir(dirPath, { recursive: true });
            });

            const files = await fs.readdir(dirPath);
            const now = Date.now();

            for (const file of files) {
                // Pular arquivos ocultos (como .gitignore)
                if (file.startsWith('.')) continue;

                const filePath = path.join(dirPath, file);
                try {
                    const stats = await fs.stat(filePath);
                    const age = now - stats.mtimeMs;

                    if (age > MAX_AGE_MS) {
                        // Use recursive: true to handle directories
                        await fs.rm(filePath, { recursive: true, force: true });
                        deletedCount++;
                    }
                } catch (err) {
                    errorCount++;
                }
            }
        } catch (err) {
            console.error(`[CLEANUP] Erro ao acessar diretório ${relDir}:`, err.message);
        }
    }

    console.log(`[CLEANUP] Limpeza concluída. Arquivos removidos: ${deletedCount}, Erros: ${errorCount}`);
    return { deletedCount, errorCount };
}

export default {
    runCleanup
};
