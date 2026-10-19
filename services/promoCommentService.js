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
async function composePromoText({ task, userId, platform, accountId, link, mode, goal = 'subscribe' }) {
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
                goal,
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
        const picked = pickTemplate(recent, Math.random, goal);
        templateId = picked.id;
        text = buildPromoText(picked.text, link);
    }
    return { text, aiUsed, templateId };
}

/** Cria um link curto rastreavel (atribuido ao post) e devolve a URL cloakada. */
async function buildCloakedLink(userId, targetUrl, task, sourceType = 'downloader_schedule') {
    const systemPublicUrl = await db.getSystemConfig('system_public_url') || 'https://fluxointeligente.digital';
    const cleanSystemUrl = systemPublicUrl.replace(/https?:\/\//, '').replace(/\/$/, '');
    const isAlreadyShort = targetUrl.includes('?video=') || targetUrl.includes(cleanSystemUrl);
    if (isAlreadyShort) return targetUrl;
    const crypto = await import('crypto');
    const slug = crypto.randomBytes(4).toString('hex');
    await db.createShortLink(slug, targetUrl, userId, null, null, {
        sourceType,
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
export async function commentOnPost(task, cfg, { sourceType = 'downloader_schedule', goal = 'subscribe', customText = '' } = {}) {
    const isScheduled = sourceType === 'downloader_schedule';
    // O log de comentario promocional (task_id unico) so existe para os agendamentos.
    const logUpdate = (patch) => (isScheduled ? db.updatePromoLog(task.id, patch) : Promise.resolve());
    // Se a tentativa falhar, desfaz o link criado para o post voltar a ser elegivel.
    const cleanupLink = () => {
        if (!task?.id) return Promise.resolve();
        return db.deleteShortLinkBySource(task.user_id, sourceType, task.id).catch(() => {});
    };
    try {
        if (!task?.published_post_id) return { commented: false, error: 'Post sem ID publicado.' };
        const platform = task.platform;
        if (!PROMO_PLATFORMS.includes(platform)) {
            return { commented: false, error: `Plataforma sem suporte: ${platform}` };
        }

        // Trava anti-duplicidade 1: este post ja tem link atribuido.
        const alreadyLinked = await db.getLinkedSourceIds(task.user_id, sourceType, [task.id]);
        if (alreadyLinked.has(task.id)) return { commented: false, skipped: true, reason: 'ja_tem_link' };

        // Trava anti-duplicidade 2 (agendamentos): ja recebeu comentario automatico enviado.
        if (isScheduled) {
            const log = await db.createManualPromoLog(task.user_id, platform, task.account_id, task.id);
            if (!log) return { commented: false, skipped: true, reason: 'ja_comentado' };
        }

        // Link rastreavel (cloak) atribuido a este post.
        let link = cfg.link;
        try {
            link = await buildCloakedLink(task.user_id, cfg.link, task, sourceType);
        } catch (e) {
            console.warn('[PROMO COMMENT] Falha ao criar link curto, usando link direto:', e.message);
        }

        let text = null, aiUsed = false, templateId = null;
        const ct = (customText || '').trim();
        if (ct) {
            text = buildPromoText(ct, link);
            if (!validatePromoText(text, link)) {
                await logUpdate({ comment_text: text, subscription_link: cfg.link, ai_used: false, template_id: null, send_status: 'failed', error_message: 'Texto personalizado invalido.' });
                await cleanupLink();
                return { commented: false, error: 'Texto personalizado invalido (precisa conter {link} ou o link no texto).' };
            }
        } else {
            const composed = await composePromoText({ task, userId: task.user_id, platform, accountId: task.account_id, link, mode: cfg.mode, goal });
            text = composed.text; aiUsed = composed.aiUsed; templateId = composed.templateId;
            if (!validatePromoText(text, link)) {
                await logUpdate({ comment_text: text, subscription_link: cfg.link, ai_used: aiUsed, template_id: templateId, send_status: 'failed', error_message: 'Texto promocional invalido.' });
                await cleanupLink();
                return { commented: false, error: 'Texto promocional invalido.' };
            }
        }
        await logUpdate({ comment_text: text, subscription_link: cfg.link, ai_used: aiUsed, template_id: templateId, send_status: 'pending' });

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
                await logUpdate({ send_status: 'sent', attempts: attempt, comment_id: commentId, error_message: null });
                return { commented: true, commentId };
            } catch (err) {
                const msg = err?.response?.data?.error?.message || err?.message || 'Erro desconhecido';
                if (!shouldRetryPromo(err, attempt)) {
                    await logUpdate({ send_status: 'failed', attempts: attempt, error_message: msg });
                    await cleanupLink();
                    return { commented: false, error: msg };
                }
                await logUpdate({ attempts: attempt, error_message: msg });
                await sleep(retryDelayMs(attempt));
            }
        }
    } catch (err) {
        await cleanupLink();
        return { commented: false, error: err?.message || String(err) };
    }
}

/**
 * Monta candidatos (posts que ainda NAO tem link) das duas origens:
 * videos/imagens agendados e imagens da automacao.
 */
async function gatherWinnerCandidates(userId, { days = 30, pageFilter = null } = {}) {
    const out = [];

    const fbPages = await db.getFacebookPages(userId).catch(() => []);
    const igAccs = await db.getInstagramAccounts(userId).catch(() => []);
    const accName = (platform, accountId) => {
        const id = String(accountId);
        if (platform === 'instagram') {
            const a = igAccs.find(x => String(x.account_id || x.id) === id);
            return a?.username ? `@${a.username}` : (a?.name || null);
        }
        const p = fbPages.find(x => String(x.id) === id);
        return p?.name || null;
    };

    const matchesPage = (platform, accountId) => {
        if (!pageFilter) return true;
        return String(pageFilter.platform) === String(platform) && String(pageFilter.accountId) === String(accountId);
    };

    const sched = await db.getDownloaderSchedulesForMetrics(userId, { days, limit: 100 });
    const schedLogged = await db.getPromoLoggedTaskIds(sched.map(r => r.id));
    const schedLinked = await db.getLinkedSourceIds(userId, 'downloader_schedule', sched.map(r => r.id));
    for (const r of sched) {
        if (!r.published_post_id || !PROMO_PLATFORMS.includes(r.platform)) continue;
        if (!matchesPage(r.platform, r.account_id)) continue;
        if (schedLogged.has(r.id) || schedLinked.has(r.id)) continue;
        out.push({
            sourceType: 'downloader_schedule',
            score: (r.views || 0) + (r.likes || 0) * 3 + (r.comments || 0) * 5 + (r.shares || 0) * 8,
            task: {
                id: r.id, user_id: userId, platform: r.platform, account_id: r.account_id,
                published_post_id: r.published_post_id, caption: r.caption || '',
                account_name: accName(r.platform, r.account_id),
                views: r.views || 0, likes: r.likes || 0, comments: r.comments || 0, shares: r.shares || 0,
                media_type: r.media_type,
            },
        });
    }

    const auto = await db.getAutomationPostsForMetrics(userId, { days, limit: 100 });
    const autoLinked = await db.getLinkedSourceIds(userId, 'automation_posts', auto.map(r => r.id));
    for (const r of auto) {
        if (!r.published_post_id || !PROMO_PLATFORMS.includes(r.published_platform)) continue;
        if (!matchesPage(r.published_platform, r.published_page_id)) continue;
        if (autoLinked.has(r.id)) continue;
        out.push({
            sourceType: 'automation_posts',
            score: (r.views || 0) + (r.likes || 0) * 3 + (r.comments || 0) * 5 + (r.shares || 0) * 8,
            task: {
                id: r.id, user_id: userId, platform: r.published_platform, account_id: r.published_page_id,
                published_post_id: r.published_post_id,
                caption: [r.title, r.description].filter(Boolean).join(' ').trim(),
                account_name: accName(r.published_platform, r.published_page_id),
                views: r.views || 0, likes: r.likes || 0, comments: r.comments || 0, shares: r.shares || 0,
                media_type: r.media_type,
            },
        });
    }

    return out;
}

/**
 * Adiciona o link da oferta (comentario promocional) apenas nos posts que mais
 * performam, nos videos/imagens agendados e/ou nas imagens da automacao.
 * Seguro por padrao: lote pequeno, textos variados, sem duplicar e com intervalo.
 * @param source 'scheduled' | 'automation' | 'both'
 */
export async function linkTopWinners(userId, { days = 30, limit = 3, minViews = 0, dryRun = false, source = 'both', goal = 'subscribe', customText = '', pageFilter = null, customLink = '' } = {}) {
    const cfg = await getPromoConfig(userId);
    const effectiveLink = (customLink || '').trim() || cfg.link;
    const max = Math.min(Math.max(parseInt(limit) || 3, 1), 10);
    const src = ['scheduled', 'automation', 'both'].includes(source) ? source : 'both';

    let candidates = await gatherWinnerCandidates(userId, { days, pageFilter });
    if (src !== 'both') {
        const want = src === 'automation' ? 'automation_posts' : 'downloader_schedule';
        candidates = candidates.filter(c => c.sourceType === want);
    }
    candidates = candidates
        .filter(c => (c.task.views || 0) >= minViews)
        .sort((a, b) => b.score - a.score)
        .slice(0, max);

    const shape = (c) => ({
        id: c.task.id,
        source: c.sourceType === 'automation_posts' ? 'automation' : 'scheduled',
        platform: c.task.platform,
        account_name: c.task.account_name || null,
        account_id: c.task.account_id,
        views: c.task.views || 0,
        likes: c.task.likes || 0,
        comments: c.task.comments || 0,
        score: c.score,
    });

    // Previa (sem efeitos colaterais): mostra apenas quem seria escolhido.
    if (dryRun) {
        return { dry: true, candidates: candidates.length, sent: 0, skipped: 0, results: candidates.map(c => ({ ...shape(c), ok: null })) };
    }

    if (!effectiveLink) throw new Error('Defina o link da oferta nas configuracoes de comentario promocional antes de usar.');

    const results = [];
    for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        const r = await commentOnPost(c.task, { ...cfg, link: effectiveLink }, { sourceType: c.sourceType, goal, customText });
        results.push({ ...shape(c), ok: !!r.commented && !r.skipped, skipped: !!r.skipped, comment_id: r.commentId || null, error: r.error || null });
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
