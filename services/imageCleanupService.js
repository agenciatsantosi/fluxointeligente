import fs from 'fs';
import path from 'path';
import cron from 'node-cron';
import { query } from './database.js';

/**
 * Limpeza automática de imagens geradas por IA.
 *
 * Regras:
 *  - Imagens de posts JÁ PUBLICADOS são removidas após 24h (já estão no Facebook/Instagram)
 *  - Imagens de posts com erro são mantidas por 3 dias (para debug/reprocessamento)
 *  - Posts pendentes/scheduled NUNCA têm imagens removidas
 *  - Arquivos órfãos (sem referência no banco) são removidos após 48h
 */

const RETENTION_HOURS = {
    published: 24,
    error: 72,
    orphan: 48
};

const DEFAULT_INTERVAL_HOURS = 6;

/** Resolve um valor de config que pode ser string numérica ("24") ou número. */
function toHours(value, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function getConfig(key, fallback) {
    try {
        const rows = await query(
            'SELECT value FROM system_config WHERE key = $1 LIMIT 1',
            [key]
        );
        if (rows.rows.length > 0) return toHours(rows.rows[0].value, fallback);
    } catch (err) {
        console.warn(`[IMAGE CLEANUP] Falha ao ler ${key}: ${err.message}`);
    }
    return fallback;
}

function hoursAgoIso(hours) {
    return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}

/**
 * Remove um arquivo e zera o image_url no banco (para não deixar referência quebrada).
 */
async function removeFileAndClear(filePath, log) {
    try {
        const absolute = path.isAbsolute(filePath)
            ? filePath
            : path.join(process.cwd(), filePath.replace(/^[/\\]+/, ''));

        if (fs.existsSync(absolute)) {
            fs.unlinkSync(absolute);
            log.removed++;
        }

        // Normaliza para o formato salvo no banco (/uploads/...)
        const dbPath = absolute
            .replace(/\\/g, '/')
            .replace(/^.*?\/(uploads\/)/, '/$1');

        const res = await query(
            'UPDATE automation_posts SET image_url = NULL WHERE image_url = $1 OR image_url = $2 OR image_url = $3',
            [filePath, dbPath, absolute.replace(/\\/g, '/')]
        );
        log.cleared += res.rowCount || 0;
    } catch (err) {
        log.errors++;
        console.warn(`[IMAGE CLEANUP] Erro ao remover ${filePath}: ${err.message}`);
    }
}

/**
 * Executa uma rodada de limpeza.
 */
export async function runImageCleanup() {
    const startedAt = Date.now();
    const log = { scanned: 0, removed: 0, cleared: 0, errors: 0, kept: 0 };

    try {
        const uploadsDir = path.join(process.cwd(), 'uploads', 'automations');
        if (!fs.existsSync(uploadsDir)) {
            console.log('[IMAGE CLEANUP] Pasta uploads/automations não existe ainda.');
            return log;
        }

        const publishedHours = await getConfig('image_cleanup_published_hours', RETENTION_HOURS.published);
        const errorHours = await getConfig('image_cleanup_error_hours', RETENTION_HOURS.error);
        const orphanHours = await getConfig('image_cleanup_orphan_hours', RETENTION_HOURS.orphan);

        const files = fs.readdirSync(uploadsDir).filter(f => /\.(png|jpe?g|webp)$/i.test(f));

        // 1. Coleta todas as URLs referenciadas no banco
        const referenced = new Map(); // url -> row
        const allRows = await query(
            `SELECT id, image_url, status, published_date, updated_at, created_at
             FROM automation_posts
             WHERE image_url IS NOT NULL`
        );

        for (const row of allRows.rows) {
            referenced.set(String(row.image_url), row);
        }

        // 2. Coleta imagens referenciadas por posts em estados protegidos (nunca remover)
        const protectedRefs = new Set();
        for (const row of allRows.rows) {
            const st = String(row.status || '').toLowerCase();
            if (['pending', 'generating', 'generated', 'scheduled', 'publishing'].includes(st)) {
                protectedRefs.add(String(row.image_url));
            }
        }

        // 3. Remove imagens de posts publicados/erro mais velhos que a retenção
        for (const [url, row] of referenced.entries()) {
            const st = String(row.status || '').toLowerCase();

            if (protectedRefs.has(url)) continue;

            const baseTime = row.published_date || row.updated_at || row.created_at;
            if (!baseTime) continue;

            const ageHours = (Date.now() - new Date(baseTime).getTime()) / 3600000;
            log.scanned++;

            if (st === 'published' && ageHours >= publishedHours) {
                await removeFileAndClear(url, log);
            } else if (st === 'error' && ageHours >= errorHours) {
                await removeFileAndClear(url, log);
            } else {
                log.kept++;
            }
        }

        // 4. Remove arquivos órfãos (no disco mas sem referência no banco)
        const referencedFiles = new Set();
        for (const url of referenced.keys()) {
            const name = String(url).split('/').pop();
            if (name) referencedFiles.add(name);
        }

        for (const fileName of files) {
            if (referencedFiles.has(fileName)) continue;

            const filePath = path.join(uploadsDir, fileName);
            try {
                const stat = fs.statSync(filePath);
                const ageHours = (Date.now() - stat.mtimeMs) / 3600000;

                if (ageHours >= orphanHours) {
                    fs.unlinkSync(filePath);
                    log.removed++;
                } else {
                    log.kept++;
                }
            } catch (err) {
                log.errors++;
            }
        }

        const duration = ((Date.now() - startedAt) / 1000).toFixed(2);
        if (log.removed > 0 || log.errors > 0) {
            console.log(
                `[IMAGE CLEANUP] ✅ Removidos: ${log.removed} | Referências limpas: ${log.cleared} | ` +
                `Mantidos: ${log.kept} | Erros: ${log.errors} | Tempo: ${duration}s`
            );
        } else {
            console.log(`[IMAGE CLEANUP] Nada a limpar (${log.kept} mantidos) em ${duration}s`);
        }
    } catch (error) {
        console.error('[IMAGE CLEANUP] Erro geral:', error.message);
    }

    return log;
}

/**
 * Inicia o agendador de limpeza (a cada 6 horas por padrão).
 */
export function initImageCleanupCron() {
    const intervalHours = Number(process.env.IMAGE_CLEANUP_INTERVAL_HOURS) || DEFAULT_INTERVAL_HOURS;
    const expression = `0 */${intervalHours} * * *`;

    try {
        cron.schedule(expression, () => {
            runImageCleanup();
        });
        console.log(`[IMAGE CLEANUP] Agendador ativo (a cada ${intervalHours}h). Retenção: publicados=${RETENTION_HOURS.published}h, erros=${RETENTION_HOURS.error}h, órfãos=${RETENTION_HOURS.orphan}h`);
    } catch (err) {
        console.warn('[IMAGE CLEANUP] Falha ao agendar:', err.message);
    }

    // Primeira execução 30s após o boot (não bloqueia o startup)
    setTimeout(() => runImageCleanup(), 30000);
}