/**
 * promoCommentService — orquestra o comentário promocional de assinatura
 * (alternância 1 sim / 1 não por página) após a publicação de vídeos.
 *
 * - Reaproveita: downloader_schedule, postComment (IG/FB/Threads), IA existente.
 * - Nunca lança exceção e nunca altera o status do vídeo.
 */
import * as db from './database.js';
import {
    PROMO_PLATFORMS,
    pickTemplate,
    buildPromoText,
    validatePromoText,
    shouldRetryPromo,
    retryDelayMs,
} from './promoCommentPolicy.js';
import * as facebookService from './facebookService.js';
import * as instagramGraph from './instagramGraphService.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export async function getPromoConfig(userId) {
    const [enabled, link, frequency, mode] = await Promise.all([
        db.getUserConfig(userId, 'promo_comments_enabled'),
        db.getUserConfig(userId, 'subscription_link'),
        db.getUserConfig(userId, 'promo_frequency'),
        db.getUserConfig(userId, 'promo_mode'),
    ]);
    return {
        enabled: enabled !== 'false', // padrão: ligado (só comenta se houver link)
        link: String(link || '').trim(),
        frequency: Math.min(Math.max(parseInt(frequency) || 2, 1), 10),
        mode: mode === 'templates' ? 'templates' : 'ai',
    };
}

async function resolvePageName(task) {
    try {
        if (task.platform === 'facebook') {
            const pages = await db.getFacebookPages(task.user_id);
            const page = pages.find(p => String(p.id) === String(task.account_id));
            if (page?.name) return page.name;
        } else if (task.platform === 'instagram') {
            const accs = await db.getInstagramAccounts(task.user_id);
            const acc = accs.find(a => String(a.account_id || a.id) === String(task.account_id));
            if (acc) return acc.username ? `@${acc.username}` : (acc.name || String(task.account_id));
        }
    } catch {}
    return String(task.account_id || task.platform);
}

async function sendPromoComment(task, result, text) {
    const platform = task.platform;
    const accountId = task.account_id;
    if (platform === 'instagram' && result?.mediaId) {
        return await instagramGraph.postComment(result.mediaId, text, accountId);
    }
    if (platform === 'facebook' && result?.postId) {
        const pages = await db.getFacebookPages(task.user_id);
        const page = pages.find(p => String(p.id) === String(accountId));
        if (!page) throw new Error('Página do Facebook não encontrada para comentar.');
        const token = page.accessToken || page.access_token;
        return await facebookService.postComment(page.id, token, result.postId, text, null, task.user_id);
    }
    if (platform === 'threads' && result?.mediaId) {
        const threadsSvc = await import('./threadsService.js');
        return await threadsSvc.replyToThread(result.mediaId, text, accountId, task.user_id);
    }
    throw new Error(`Plataforma sem suporte a comentário promocional: ${platform}`);
}

function extractCommentId(sendResult) {
    if (!sendResult || typeof sendResult !== 'object') return null;
    const cand = sendResult.id || sendResult.comment_id || sendResult.commentId || sendResult.data?.id;
    return cand ? String(cand) : null;
}

/** Gera o texto do comentario (IA com fallback em templates), evitando repeticoes. */
async function composePromoText({ task, userId, platform, accountId, link, mode }) {
    const pageName = await resolvePageName(task);
    const recent = await db.getRecentPromoTexts(userId, platform, accountId, 5).catch(() => []);
    let text = null;
    let aiUsed = false;
    let templateId = null;

    if (mode === 'ai') {
        try {
            const { generatePromoComment } = await import('./ai_generator.js');
            const gen = await generatePromoComment({
                videoTitle: task.caption?.slice(0, 200) || '',
                videoCaption: '',
                pageName,
                link,
                recentTexts: recent,
            }, userId);
            if (gen?.text && validatePromoText(gen.text, link)) {
                text = gen.text;
                aiUsed = true;
            }
        } catch (e) {
            console.warn('[PROMO COMMENT] IA falhou, usando fallback:', e.message);
        }
    }
    if (!text) {
        const picked = pickTemplate(recent);
        templateId = picked.id;
        text = buildPromoText(picked.text, link);
    }
    return { text, aiUsed, templateId };
}

/** Cria um link curto rastreavel (atribuido ao post) e devolve a URL cloakada. */
async function buildCloakedLink(userId, targetUrl, task) {
    const systemPublicUrl = await db.getSystemConfig('system_public_url') || 'https://fluxointeligente.digital';
    const cleanSystemUrl = systemPublicUrl.replace(/https?:\/\//, '').replace(/\/$/, '');
    const isAlreadyShort = targetUrl.includes('?video=') || targetUrl.includes(cleanSystemUrl);
    if (isAlreadyShort) return targetUrl;
    const crypto = await import('crypto');
    const slug = crypto.randomBytes(4).toString('hex');
    await db.createShortLink(slug, targetUrl, userId, null, null, {
        sourceType: 'downloader_schedule',
        sourceId: task.id,
        platform: task.platform,
        accountId: task.account_id,
    });
    return `${systemPublicUrl.replace(/\/$/, '')}/?video=${slug}`;
}

/**
 * Ponto de entrada: chamar APÓS publicação bem-sucedida do vídeo.
 * @returns { commented: boolean, decision, position }
 */
export async function maybePostPromoComment(task, result) {
    const noop = { commented: false, decision: 'skip', position: null };
    try {
        if (!task || !result?.success) return noop;
        if (!PROMO_PLATFORMS.includes(task.platform)) return noop;
        if (task.media_type !== 'video') return noop;

        const cfg = await getPromoConfig(task.user_id);
        if (!cfg.enabled || !cfg.link) return noop;

        // Decisão durável + idempotente (não consome posição em retries).
        const { decision, position } = await db.decidePromoComment(
            task.user_id, task.platform, task.account_id, task.id, cfg.frequency
        );
        if (decision !== 'comment') return { commented: false, decision, position };

        // Monta o texto: IA (com fallback) ou só templates, evitando repetições.
        const { text, aiUsed, templateId } = await composePromoText({
            task, userId: task.user_id, platform: task.platform, accountId: task.account_id, link: cfg.link, mode: cfg.mode,
        });
        if (!validatePromoText(text, cfg.link)) {
            await db.updatePromoLog(task.id, { comment_text: text, subscription_link: cfg.link, ai_used: aiUsed, template_id: templateId, send_status: 'failed', attempts: 0, error_message: 'Texto promocional inválido na validação.' });
            return { commented: false, decision, position };
        }

        await db.updatePromoLog(task.id, { comment_text: text, subscription_link: cfg.link, ai_used: aiUsed, template_id: templateId, send_status: 'pending', attempts: 0 });

        // Envio com retry controlado (não quebra a publicação em caso de falha).
        let attempt = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
            attempt += 1;
            try {
                const sendResult = await sendPromoComment(task, result, text);
                await db.updatePromoLog(task.id, { send_status: 'sent', attempts: attempt, comment_id: extractCommentId(sendResult), error_message: null });
                console.log(`[PROMO COMMENT] ✅ Comentário promocional publicado (task ${task.id}, posição ${position}).`);
                return { commented: true, decision, position };
            } catch (err) {
                const msg = err?.response?.data?.error?.message || err?.message || 'Erro desconhecido';
                console.warn(`[PROMO COMMENT] Tentativa ${attempt} falhou (task ${task.id}): ${msg}`);
                if (!shouldRetryPromo(err, attempt)) {
                    await db.updatePromoLog(task.id, { send_status: 'failed', attempts: attempt, error_message: msg });
                    return { commented: false, decision, position };
                }
                await db.updatePromoLog(task.id, { attempts: attempt, error_message: msg });
                await sleep(retryDelayMs(attempt));
            }
        }
    } catch (err) {
        console.warn('[PROMO COMMENT] Erro inesperado (vídeo preservado):', err?.message || err);
        return noop;
    }
}

/**
 * Posta o comentario promocional em um post JA publicado (usado nos campeoes).
 * Nunca lanca excecao. Idempotente: nao comenta duas vezes no mesmo post.
 */
export async function commentOnPost(task, cfg) {
    // Se a tentativa falhar, desfaz o link criado para o post voltar a ser elegivel.
    const cleanupLink = () => {
        if (!task?.id) return Promise.resolve();
        return db.deleteShortLinkBySource(task.user_id, 'downloader_schedule', task.id).catch(() => {});
    };
    try {
        if (!task?.published_post_id) return { commented: false, error: 'Post sem ID publicado.' };
        const platform = task.platform;
        if (!PROMO_PLATFORMS.includes(platform)) {
            return { commented: false, error: `Plataforma sem suporte: ${platform}` };
        }

        // Trava anti-duplicidade: se ja foi enviado, nao repete.
        const log = await db.createManualPromoLog(task.user_id, platform, task.account_id, task.id);
        if (!log) return { commented: false, skipped: true, reason: 'ja_comentado' };

        // Link rastreavel (cloak) atribuido a este post.
        let link = cfg.link;
        try {
            link = await buildCloakedLink(task.user_id, cfg.link, task);
        } catch (e) {
            console.warn('[PROMO COMMENT] Falha ao criar link curto, usando link direto:', e.message);
        }

        const { text, aiUsed, templateId } = await composePromoText({
            task, userId: task.user_id, platform, accountId: task.account_id, link, mode: cfg.mode,
        });
        if (!validatePromoText(text, link)) {
            await db.updatePromoLog(task.id, { comment_text: text, subscription_link: cfg.link, ai_used: aiUsed, template_id: templateId, send_status: 'failed', error_message: 'Texto promocional invalido.' });
            await cleanupLink();
            return { commented: false, error: 'Texto promocional invalido.' };
        }
        await db.updatePromoLog(task.id, { comment_text: text, subscription_link: cfg.link, ai_used: aiUsed, template_id: templateId, send_status: 'pending' });

        const target = platform === 'instagram'
            ? { mediaId: task.published_post_id }
            : { postId: task.published_post_id };

        let attempt = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
            attempt += 1;
            try {
                const sendResult = await sendPromoComment(task, target, text);
                const commentId = extractCommentId(sendResult);
                await db.updatePromoLog(task.id, { send_status: 'sent', attempts: attempt, comment_id: commentId, error_message: null });
                return { commented: true, commentId };
            } catch (err) {
                const msg = err?.response?.data?.error?.message || err?.message || 'Erro desconhecido';
                if (!shouldRetryPromo(err, attempt)) {
                    await db.updatePromoLog(task.id, { send_status: 'failed', attempts: attempt, error_message: msg });
                    await cleanupLink();
                    return { commented: false, error: msg };
                }
                await db.updatePromoLog(task.id, { attempts: attempt, error_message: msg });
                await sleep(retryDelayMs(attempt));
            }
        }
    } catch (err) {
        await cleanupLink();
        return { commented: false, error: err?.message || String(err) };
    }
}

/**
 * Adiciona o link da oferta (comentario promocional) apenas nos posts que mais
 * performam. Seguro por padrao: lote pequeno, textos variados, sem duplicar e
 * com intervalo entre os envios (menor sinal de spam).
 * @returns { candidates, sent, skipped, results }
 */
export async function linkTopWinners(userId, { days = 30, limit = 3, minViews = 0, dryRun = false } = {}) {
    const cfg = await getPromoConfig(userId);

    const max = Math.min(Math.max(parseInt(limit) || 3, 1), 10);
    const rows = await db.getDownloaderSchedulesForMetrics(userId, { days, limit: 100 });
    const logged = await db.getPromoLoggedTaskIds(rows.map(r => r.id));
    const linked = await db.getLinkedSourceIds(userId, 'downloader_schedule', rows.map(r => r.id));

    const candidates = rows
        .filter(r => r.published_post_id && !logged.has(r.id) && !linked.has(r.id) && (r.views || 0) >= minViews)
        .slice(0, max);

    // Previa (sem efeitos colaterais): mostra apenas quem seria escolhido.
    if (dryRun) {
        return {
            dry: true,
            candidates: candidates.length,
            sent: 0,
            skipped: 0,
            results: candidates.map(t => ({
                id: t.id,
                platform: t.platform,
                account_id: t.account_id,
                views: t.views || 0,
                likes: t.likes || 0,
                comments: t.comments || 0,
                ok: null,
            })),
        };
    }

    if (!cfg.link) throw new Error('Defina o link da oferta nas configuracoes de comentario promocional antes de usar.');

    const results = [];
    for (let i = 0; i < candidates.length; i++) {
        const task = candidates[i];
        const r = await commentOnPost(task, cfg);
        results.push({
            id: task.id,
            platform: task.platform,
            account_id: task.account_id,
            views: task.views || 0,
            likes: task.likes || 0,
            comments: task.comments || 0,
            score: (task.views || 0) + (task.likes || 0) * 3 + (task.comments || 0) * 5 + (task.shares || 0) * 8,
            ok: !!r.commented && !r.skipped,
            skipped: !!r.skipped,
            comment_id: r.commentId || null,
            error: r.error || null,
        });
        // Intervalo com variacao entre posts (evita padrao robotico).
        if (i < candidates.length - 1) await sleep(8000 + Math.floor(Math.random() * 12000));
    }

    return {
        candidates: candidates.length,
        sent: results.filter(r => r.ok).length,
        skipped: results.filter(r => r.skipped).length,
        results,
    };
}
