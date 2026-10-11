import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Caminhos e utilitários compartilhados do Kwai (usados pelo serviço de
 * publicação e pelo fluxo de login).
 */

// Perfis persistentes por conta: mantêm a sessão do Kwai Studio viva entre
// publicações, então não é preciso reinjetar cookies a cada post.
//
// Ficam FORA da pasta do projeto de propósito: o Chrome trava o arquivo interno
// `Default/Network/Cookies`, e um watcher (Vite/nodemon) ou sincronizador
// (OneDrive) que tente observar esse arquivo derruba o processo com EBUSY.
// Pode ser trocado via KWAI_PROFILES_DIR.
export const PROFILES_DIR = process.env.KWAI_PROFILES_DIR
    ? path.resolve(process.env.KWAI_PROFILES_DIR)
    : path.join(os.homedir(), '.fluxointeligente', 'kwai_profiles');

/** Diretório do perfil persistente de uma conta. */
export function profileDirFor(dbAccountId) {
    return path.join(PROFILES_DIR, `profile_${dbAccountId}`);
}

/**
 * Localiza um executável do Chrome/Chromium.
 * No Windows costuma estar em Program Files; no VPS, em /usr/bin.
 */
export function findChromeExecutable() {
    const candidates = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        process.env.PUPPETEER_EXECUTABLE_PATH
    ].filter(Boolean);

    for (const candidate of candidates) {
        try {
            if (fs.existsSync(candidate)) return candidate;
        } catch (_) {
            // caminho com formato inválido para o SO atual — segue o próximo
        }
    }
    return undefined;
}
