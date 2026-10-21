/**
 * championMonitorService — Link nos Campeões Inteligente.
 *
 * Monitora continuamente o desempenho das publicações das páginas/contas
 * conectadas. Quando uma publicação ultrapassa o limite de views configurado
 * (padrão 1.000), ela é classificada como "campeã" e encaminhada para o
 * processo automático de inserção do comentário com link de conversão.
 *
 * Reutiliza: promoCommentService.commentOnPost (IA + templates + link
 * rastreável + idempotência + retry), postInsightsService (métricas) e o
 * padrão de cron do projeto (node-cron).
 *
 * O processamento roda NO BACKEND, mesmo com o usuário fora da página.
 */
import cron from 'node-cron';
import * as db from './database.js';
import { commentOnPost } from './promoCommentService.js';
import * as postInsights from './postInsightsService.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** Limite padrão de views para considerar um post "campeão". */
const DEFAULT_THRESHOLD = 1000;

let running = false;

/** Lê a config global (limite de views + ativação) do usuário. */
export async function getGlobalSettings(userId) {
    const [thresholdRaw, enabledRaw] = await Promise.all([
        db.getUserConfig(userId, 'champion_threshold_views'),
        db.getUserConfig(userId, 'champion_monitor_enabled'),
    ]);
    const threshold = Math.max(parseInt(thresholdRaw) || DEFAULT_THRESHOLD, 100);
    const enabled = enabledRaw !== 'false'; // padrão: ligado
    return { threshold, enabled };
}

export async function setGlobalSettings(userId, { threshold, enabled } = {}) {
    if (threshold !== undefined) {
        await db.setUserConfig(userId, 'champion_threshold_views', String(Math.max(parseInt(threshold) || DEFAULT_THRESHOLD, 100)));
    }
    if (enabled !== undefined) {
        await db.setUserConfig(userId, 'champion_monitor_enabled', enabled ? 'true' : 'false');
    }
    return getGlobalSettings(userId);
}

/**
 * Lê os posts publicados recentes (agendamentos + automação) com views já
 * persistidas, sem bater na API de novo. É a fonte barata de monitoramento.
 */
async function loadRecentPosts(userId, days = 30) {
    const [sched, auto] = await Promise.all([
        db.getDownloaderSchedulesForMetrics(userId, { days, limit: 200 }).catch(() => []),
        db.getAutomationPostsForMetrics(userId, { days, limit: 200 }).catch(() => []),
    ]);
    const posts = [];
    for (const r of sched) {
        posts.push({
            sourceType: 'downloader_schedule', sourceId: r.id,
            platform: r.platform, accountId: r.account_id, postId: r.published_post_id,
            caption: r.caption || '', views: r.views || 0, mediaType: r.media_type,
            task: r,
        });
    }
    for (const r of auto) {
        posts.push({
            sourceType: 'automation_posts', sourceId: r.id,
            platform: r.published_platform, accountId: r.published_page_id, postId: r.published_post_id,
            caption: [r.title, r.description].filter(Boolean).join(' ').trim(), views: r.views || 0, mediaType: r.media_type,
            task: r,
        });
    }
    return posts;
}

/**
 * Fase 1 — DETECÇÃO: atualiza views (quando necessário) e registra os posts
 * que cruzaram o limite como campeões. Idempotente (upsert).
 */
export async function detectChampions(userId, { days = 30, refreshStaleMinutes = 60, maxApiRefresh = 25 } = {}) {
    const { threshold } = await getGlobalSettings(userId);
    const posts = await loadRecentPosts(userId, days);
    let detected = 0;
    let refreshed = 0;
    const staleCutoff = Date.now() - refreshStaleMinutes * 60 * 1000;
    // Candidatos "monitorando": posts já com metade do limite entram no painel
    // antes de virarem campeões (status Monitorando → Campeão identificado).
    const candidateFloor = Math.floor(threshold / 2);

    for (const p of posts) {
        if (!p.postId || !['facebook', 'instagram'].includes(p.platform)) continue;
        if (p.views < candidateFloor && refreshed >= maxApiRefresh) continue;

        // Atualiza views na plataforma se o post ainda não tem métrica ou está velha.
        const metricsFresh = p.task.metrics_updated_at && new Date(p.task.metrics_updated_at).getTime() > staleCutoff;
        if (!metricsFresh && refreshed < maxApiRefresh) {
            refreshed++;
            try {
                if (p.sourceType === 'downloader_schedule') {
                    const r = await postInsights.refreshDownloaderTaskMetrics(userId, p.sourceId);
                    p.views = r?.metrics?.views || p.views;
                } else {
                    const r = await postInsights.refreshPostMetrics(userId, p.sourceId);
                    p.views = r?.metrics?.views || p.views;
                }
                await sleep(350); // respeita rate limit da API
            } catch { /* segue com a views antiga */ }
        }

        if (p.views < candidateFloor) continue;

        const champ = await db.upsertChampionPost(userId, {
            sourceType: p.sourceType, sourceId: p.sourceId, platform: p.platform,
            accountId: p.accountId, postId: p.postId, caption: p.caption,
            views: p.views, threshold,
        });
        if (champ && champ.status === 'identified') detected++;
    }
    return { threshold, candidates: posts.length, detected, refreshed };
}

/**
 * Fase 2 — MONETIZAÇÃO: para cada campeão "identified", valida as regras da
 * página (links, limites, intervalo) e publica o comentário via
 * promoCommentService (que já cuida de idempotência, link rastreável e retry).
 */
export async function processChampions(userId, { maxCommentsPerRun = 5 } = {}) {
    // Reavaliáveis: identified + statuses corrigíveis (config ausente, limite,
    // intervalo, desativada, falha com tentativas restantes). Assim, quando o
    // usuário salva os links ou reativa a página, a próxima varredura retoma.
    const all = await db.getChampionPosts(userId, { limit: 200 });
    const champions = all.filter(c =>
        c.status === 'identified' ||
        (['awaiting_config', 'awaiting_interval', 'disabled'].includes(c.status)) ||
        (c.status === 'failed' && (c.attempts || 0) < 5)
    );
    const results = [];
    let commentsThisRun = 0;
    for (const c of champions) {
        // Teto por ciclo: controle global de frequência (antispam).
        if (commentsThisRun >= maxCommentsPerRun && c.status === 'identified') break;
        const r = await processOne(userId, c);
        results.push(r);
        // Intervalo 8–20s somente entre tentativas REAIS de publicação.
        if (r.attempted) {
            commentsThisRun++;
            if (results.length < champions.length) {
                await sleep(8000 + Math.floor(Math.random() * 12000));
            }
        }
    }
    return results;
}

async function processOne(userId, c) {
    // 1) Config da página — se ausente, marca "aguardando configuração".
    const cfg = await db.getChampionPageConfig(userId, c.platform, c.account_id);
    if (!cfg) {
        await db.updateChampionPostStatus(userId, c.id, 'awaiting_config', {
            error_message: 'Configure os links desta página antes de monetizar.',
        });
        return { id: c.id, ok: false, reason: 'awaiting_config' };
    }
    if (!cfg.auto_monetization_enabled) {
        await db.updateChampionPostStatus(userId, c.id, 'disabled', {
            error_message: 'Automação desativada para esta página.',
        });
        return { id: c.id, ok: false, reason: 'disabled' };
    }

    // 2) Escolha da oferta (assinatura × produto) pela prioridade da página.
    const goal = cfg.priority_offer === 'product' ? 'sell' : 'subscribe';
    const chosenLink = (goal === 'sell' ? cfg.product_link : cfg.subscription_link) || '';
    if (!chosenLink.trim()) {
        await db.updateChampionPostStatus(userId, c.id, 'awaiting_config', {
            error_message: `Link de ${goal === 'sell' ? 'produto' : 'assinatura'} não configurado para esta página.`,
        });
        return { id: c.id, ok: false, reason: 'missing_link' };
    }

    // 3) Limites de frequência (máx. por período + intervalo mínimo).
    const recentCount = await db.countRecentPromoComments(userId, c.platform, c.account_id, cfg.period_minutes);
    if (recentCount >= cfg.max_comments_per_period) {
        await db.updateChampionPostStatus(userId, c.id, 'awaiting_interval', {
            error_message: `Limite de ${cfg.max_comments_per_period} comentários por período atingido.`,
        });
        return { id: c.id, ok: false, reason: 'rate_limited' };
    }
    const lastAt = await db.getLastPromoCommentAt(userId, c.platform, c.account_id);
    if (lastAt) {
        const diffMin = (Date.now() - new Date(lastAt).getTime()) / 60000;
        if (diffMin < cfg.min_interval_minutes) {
            await db.updateChampionPostStatus(userId, c.id, 'awaiting_interval', {
                error_message: `Aguarde ${Math.ceil(cfg.min_interval_minutes - diffMin)} min desde o último comentário.`,
            });
            return { id: c.id, ok: false, reason: 'waiting_interval' };
        }
    }

    // 4) Monta a "task" no formato que commentOnPost espera.
    const task = {
        id: c.source_id,
        user_id: userId,
        platform: c.platform,
        account_id: c.account_id,
        published_post_id: c.post_id,
        caption: c.caption || '',
        media_type: c.media_type || (c.source_type === 'automation_posts' ? 'image' : 'video'),
    };

    // 5) Texto: usa a mensagem padrão da página (se houver) senão IA/templates.
    const customText = (cfg.default_message || '').trim();

    // 6) Publica (reusa idempotência + link rastreável + retry do promoCommentService).
    const r = await commentOnPost(task, { ...cfg, link: chosenLink, mode: 'ai' }, {
        sourceType: c.source_type, goal, customText,
    });

    if (r.commented) {
        await db.updateChampionPostStatus(userId, c.id, 'commented', {
            offer_type: goal, link_used: chosenLink, comment_status: 'sent',
            attempts: (c.attempts || 0) + 1, error_message: null,
        });
        return { id: c.id, ok: true, attempted: true };
    }
    if (r.skipped) {
        // Já tem link / já comentado — não é erro, apenas encerra.
        await db.updateChampionPostStatus(userId, c.id, 'commented', {
            offer_type: goal, link_used: chosenLink, comment_status: 'skipped',
            attempts: (c.attempts || 0) + 1, error_message: r.reason || null,
        });
        return { id: c.id, ok: true, skipped: true, attempted: true };
    }
    await db.updateChampionPostStatus(userId, c.id, 'failed', {
        attempts: (c.attempts || 0) + 1, error_message: r.error || 'Falha ao publicar comentário.',
    });
    return { id: c.id, ok: false, error: r.error, attempted: true };
}

/**
 * Ciclo completo: detecção + monetização. Protegido por flag para não
 * sobrepor execuções (múltiplos workers/processos não duplicam comentários
 * — a idempotência extra vem das travas de banco do promoCommentService).
 */
export async function runChampionCycle(userId) {
    if (running) return { skipped: true, reason: 'already_running' };
    running = true;
    try {
        const detection = await detectChampions(userId);
        const processed = await processChampions(userId);
        const commented = processed.filter(x => x.ok).length;
        const failed = processed.filter(x => !x.ok && x.error).length;
        console.log(`[CHAMPION] user ${userId}: ${detection.candidates} posts, ${detection.detected} campeões, ${commented} comentados, ${failed} falhas`);
        return { detection, processed: processed.length, commented, failed };
    } catch (e) {
        console.error('[CHAMPION] Erro no ciclo:', e.message);
        return { error: e.message };
    } finally {
        running = false;
    }
}

/** Varre todos os usuários com monitoramento ligado (usado pelo cron). */
async function runForAllUsers() {
    const res = await db.query(`
        SELECT DISTINCT user_id FROM facebook_pages
        UNION
        SELECT DISTINCT user_id FROM instagram_accounts
        UNION
        SELECT DISTINCT user_id FROM downloader_schedule WHERE status = 'completed'
    `).catch(() => ({ rows: [] }));
    for (const row of res.rows || []) {
        const { enabled } = await getGlobalSettings(row.user_id);
        if (!enabled) continue;
        await runChampionCycle(row.user_id);
    }
}

/**
 * Inicializa o cron de monitoramento. Roda a cada 15 minutos no backend,
 * mesmo com o usuário fora da página. Respeita limites de API (pausas +
 * atualização apenas de métricas velhas).
 */
export function initChampionMonitorCron() {
    cron.schedule('*/15 * * * *', async () => {
        if (running) return;
        try {
            await runForAllUsers();
        } catch (e) {
            console.error('[CHAMPION CRON] Erro:', e.message);
        }
    });
    console.log('[CHAMPION] Monitor de campeões inicializado (a cada 15 min)');
}
