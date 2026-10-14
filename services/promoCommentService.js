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

async function getPromoConfig(userId) {
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
        const pageName = await resolvePageName(task);
        const recent = await db.getRecentPromoTexts(task.user_id, task.platform, task.account_id, 5).catch(() => []);
        let text = null;
        let aiUsed = false;
        let templateId = null;

        if (cfg.mode === 'ai') {
            try {
                const { generatePromoComment } = await import('./ai_generator.js');
                const gen = await generatePromoComment({
                    videoTitle: task.caption?.slice(0, 200) || '',
                    videoCaption: '',
                    pageName,
                    link: cfg.link,
                    recentTexts: recent,
                }, task.user_id);
                if (gen?.text && validatePromoText(gen.text, cfg.link)) {
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
            text = buildPromoText(picked.text, cfg.link);
        }
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
