import cron from 'node-cron';
import { query, withTransaction, getFacebookPages, getInstagramAccounts } from './database.js';
import { generateImage, generateCaptionAndHashtags } from './ai_generator.js';
import * as facebookService from './facebookService.js';
import * as instagramGraph from './instagramGraphService.js';

let generationRunning = false;
let publishingRunning = false;

// Detecta o tipo de midia (image/video) a partir da URL do arquivo
function detectMediaType(url) {
    const u = String(url || '').toLowerCase();
    if (/\.(mp4|webm|mov|avi|mkv)(\?|$)/.test(u)) return 'video';
    if (u.includes('video')) return 'video';
    return 'image';
}

// Helper para identificar a plataforma alvo (facebook, instagram) das páginas vinculadas ao post
export async function resolveTargetPlatform(post) {
    try {
        let ids = typeof post.automation_page_ids === 'string' ? JSON.parse(post.automation_page_ids) : (post.automation_page_ids || []);
        if (!Array.isArray(ids) || ids.length === 0) return null;
        const [fbs, igs] = await Promise.all([
            getFacebookPages(post.user_id).catch(() => []),
            getInstagramAccounts(post.user_id).catch(() => [])
        ]);
        for (const t of ids) {
            if (fbs.find(p => String(p.id) === String(t))) return 'facebook';
            if (igs.find(a => String(a.id) === String(t) || String(a.accountId) === String(t) || String(a.username) === String(t))) return 'instagram';
        }
    } catch (_) {}
    return null;
}

// Retentativas de geração de imagem (Cloudflare etc. falha às vezes):
// o sistema pula para os próximos posts e VOLTA nos que falharam, com
// intervalo crescente entre tentativas. Só desiste depois de muitas horas.
const MAX_IMAGE_ATTEMPTS = 20;
function retryBackoffMinutes(attempts) {
    // 1->3min, 2->6, 3->12, 4->24, 5->48, 6+->60
    return Math.min(3 * Math.pow(2, Math.max(0, attempts - 1)), 60);
}
function retryErrorMessage(what, attempts, backoffMin) {
    return `${what} (tentativa ${attempts}/${MAX_IMAGE_ATTEMPTS}). Nova tentativa automática em ~${backoffMin}min — os demais posts seguem normalmente.`;
}

// Recupera posts travados em 'generating' (ex.: servidor reiniciou no meio da geração)
async function recoverStalePosts() {
    try {
        const r = await query(`
            UPDATE automation_posts
            SET status = 'pending', retry_at = NOW() + INTERVAL '2 minutes',
                error_message = 'Recuperado: geração interrompida foi reiniciada.',
                updated_at = NOW()
            WHERE status = 'generating' AND updated_at < NOW() - INTERVAL '30 minutes'
        `);
        if (r.rowCount > 0) console.log(`[AutomationCron] ${r.rowCount} post(s) travado(s) em 'generating' devolvido(s) para a fila`);
    } catch (e) {
        console.error('[AutomationCron] recoverStalePosts:', e.message);
    }
}

// Initialize Cron Jobs
export function initAutomationCron() {
    // 1. Generation Job: Runs every 5 minutes to generate content for pending posts
    cron.schedule('*/5 * * * *', async () => {
        if (generationRunning) return;
        generationRunning = true;
        try {
            await recoverStalePosts();
            await processPendingGenerations();
        } catch (error) {
            console.error('[AutomationCron] Error in generation job:', error);
        } finally {
            generationRunning = false;
        }
    });

    // 2. Publishing Job: Runs every 1 minute to publish scheduled posts
    cron.schedule('* * * * *', async () => {
        if (publishingRunning) return;
        publishingRunning = true;
        try {
            await processScheduledPublishing();
        } catch (error) {
            console.error('[AutomationCron] Error in publishing job:', error);
        } finally {
            publishingRunning = false;
        }
    });
    
    console.log('[AutomationCron] Cron jobs initialized successfully');
}

/**
 * Calcula a data agendada para um post baseado na configuração de horários da automação.
 * Distribui os posts nos horários configurados em ordem cronológica, começando pelo
 * PRIMEIRO horário de HOJE que ainda não passou. Só passa para o dia seguinte quando
 * os horários de hoje acabam (ex: 5 posts/dia -> 5 hoje, 5 amanhã, ...).
 */
async function calculateScheduledDate(post, scheduleTimes) {
    if (!scheduleTimes || !scheduleTimes.times || !scheduleTimes.times.length) {
        // Fallback: 5 minutos no futuro
        const date = new Date();
        date.setMinutes(date.getMinutes() + 5);
        return date.toISOString();
    }

    // Ordena os horários do dia (ex: ['09:00', '14:00', '19:00'])
    const times = [...scheduleTimes.times].sort();
    const now = new Date();

    // Verificar quantos posts desta automação já foram processados (pending/generating/generated/scheduled/published)
    const countResult = await query(`
        SELECT COUNT(*) as cnt
        FROM automation_posts
        WHERE automation_id = $1
        AND id <= $2
        AND status IN ('pending', 'generating', 'generated', 'scheduled', 'published', 'publishing', 'error')
    `, [post.automation_id, post.id]);

    const postIndex = Math.max(0, parseInt(countResult.rows[0].cnt) - 1); // 0 = primeiro post

    console.log(`[AutomationCron] Post ${post.id} é o índice ${postIndex} (total ${countResult.rows[0].cnt}) na automação ${post.automation_id}`);

    // Quantos horários de HOJE ainda estão no futuro (usando os horários ordenados)
    let freeToday = 0;
    for (const t of times) {
        const [h, m] = t.split(':').map(Number);
        const d = new Date(now);
        d.setHours(h, m, 0, 0);
        if (d > now) freeToday++;
    }
    const slotsToday = Math.min(freeToday, times.length);

    const len = times.length;
    let dayOffset;
    let timeIndex;

    if (postIndex < slotsToday) {
        // Ainda há horários livres HOJE -> usa o horário correspondente
        dayOffset = 0;
        timeIndex = (len - slotsToday) + postIndex;
    } else {
        // Acabou os horários de hoje -> começa AMANHÃ e segue dia a dia
        const rest = postIndex - slotsToday;
        dayOffset = 1 + Math.floor(rest / len);
        timeIndex = rest % len;
    }

    const scheduledDate = new Date(now);
    scheduledDate.setDate(scheduledDate.getDate() + dayOffset);

    const [hours, minutes] = times[timeIndex].split(':').map(Number);
    scheduledDate.setHours(hours, minutes, 0, 0);

    // Se por segurança o horário calculado já passou, empurra um dia
    if (scheduledDate <= now) {
        scheduledDate.setDate(scheduledDate.getDate() + 1);
    }

    console.log(`[AutomationCron] Post índice ${postIndex} agendado para: ${scheduledDate.toISOString()} (dia +${dayOffset}, horário ${times[timeIndex]}, slots livres hoje: ${slotsToday})`);
    return scheduledDate.toISOString();
}

// Dispara o processamento imediatamente sem esperar o tempo do cron (útil para "Postar Agora" ou Aprovações)
export function triggerAutomationProcessing() {
    console.log('[AutomationCron] triggerAutomationProcessing called');
    // Usa Promise.resolve para garantir execução assíncrona imediata no event loop
    Promise.resolve().then(async () => {
        let maxLoops = 20; // até 20 ciclos de 5 itens para processar lotes maiores sem parar
        while (maxLoops > 0) {
            let processedGenerations = 0;
            let processedPubs = 0;

            if (!generationRunning) {
                generationRunning = true;
                try {
                    processedGenerations = await processPendingGenerations();
                } catch (error) {
                    console.error('[AutomationCron] Error in triggered generation job:', error);
                } finally {
                    generationRunning = false;
                }
            }

            if (!publishingRunning) {
                publishingRunning = true;
                try {
                    processedPubs = await processScheduledPublishing();
                } catch (error) {
                    console.error('[AutomationCron] Error in triggered publishing job:', error);
                } finally {
                    publishingRunning = false;
                }
            }

            if ((!processedGenerations || processedGenerations === 0) && (!processedPubs || processedPubs === 0)) {
                break;
            }
            maxLoops--;
        }
    });
}

// Process pending posts (Generate Image and Text)
// OTIMIZADO: Em modo agendado, NÃO gera imagens agora - apenas calcula as datas.
// As imagens são geradas JIT (just-in-time) no momento da publicação.
async function processPendingGenerations() {
    // Claim atômico: reserva até 5 posts pendentes (SELECT ... FOR UPDATE SKIP LOCKED
    // + marcação 'generating' na MESMA transação) para que dois workers nunca
    // peguem o mesmo post — mesmo que outro backend esteja no mesmo banco.
    const claimed = await withTransaction(async (client) => {
        const sel = await client.query(`
            SELECT p.*, a.visual_identity, a.auto_approve, a.schedule_times, a.page_ids, a.user_id 
            FROM automation_posts p
            JOIN automations a ON p.automation_id = a.id
            WHERE p.status = 'pending' AND a.status = 'active'
              AND (p.retry_at IS NULL OR p.retry_at <= NOW())
            ORDER BY p.created_at ASC
            LIMIT 5
            FOR UPDATE OF p SKIP LOCKED
        `);
        const ids = sel.rows.map(r => r.id);
        if (ids.length > 0) {
            await client.query(`UPDATE automation_posts SET status = 'generating', updated_at = NOW() WHERE id = ANY($1)`, [ids]);
        }
        return sel.rows;
    });
    const result = { rows: claimed };
    
    if (result.rows.length === 0) return 0;

    console.log(`[AutomationCron] Processing ${result.rows.length} pending posts (schedule/LGTM only)...`);

    for (const post of result.rows) {
        let phase = 'schedule';
        try {
            // Update status to generating
            await query('UPDATE automation_posts SET status = $1 WHERE id = $2', ['generating', post.id]);
            
            const isNow = post.schedule_times && (post.schedule_times.mode === 'now' || post.schedule_times === 'now');
            
            if (isNow) {
                phase = 'now';
                const targetPlat = await resolveTargetPlatform(post);
                const imageUrl = await generateImage(post.title, post.visual_identity, post.user_id, targetPlat, post.id);
                const textData = await generateCaptionAndHashtags(post.title, post.user_id);
                
                await query(`
                    UPDATE automation_posts 
                    SET image_url = $1, description = $2, hashtags = $3, status = 'scheduled',
                        scheduled_date = NOW(), publish_attempts = 0, retry_at = NULL,
                        error_message = NULL, updated_at = NOW()
                    WHERE id = $4
                `, [imageUrl, textData.description, textData.hashtags, post.id]);
                
                console.log(`[AutomationCron] Post ${post.id} gerado e marcado para publicar AGORA`);
            } else if (post.auto_approve) {
                phase = 'schedule';
                // Modo AGENDADO com auto-approve: NÃO gera imagem agora
                // Apenas calcula a data e marca como scheduled (sem imagem)
                // A imagem será gerada no momento da publicação (JIT)
                const scheduledDate = await calculateScheduledDate(post, post.schedule_times);
                
                await query(`
                    UPDATE automation_posts 
                    SET status = 'scheduled', scheduled_date = $1,
                        publish_attempts = 0, retry_at = NULL, updated_at = NOW()
                    WHERE id = $2
                `, [scheduledDate, post.id]);
                
                console.log(`[AutomationCron] Post ${post.id} agendado para ${scheduledDate} - imagem será gerada na publicação (JIT)`);
            } else {
                phase = 'manual';
                const targetPlat = await resolveTargetPlatform(post);
                const imageUrl = await generateImage(post.title, post.visual_identity, post.user_id, targetPlat, post.id);
                const textData = await generateCaptionAndHashtags(post.title, post.user_id);
                
                await query(`
                    UPDATE automation_posts 
                    SET image_url = $1, description = $2, hashtags = $3, status = 'generated',
                        publish_attempts = 0, retry_at = NULL, error_message = NULL, updated_at = NOW()
                    WHERE id = $4
                `, [imageUrl, textData.description, textData.hashtags, post.id]);
                
                console.log(`[AutomationCron] Post ${post.id} gerado para aprovação manual`);
            }
        } catch (error) {
            console.error(`[AutomationCron] Failed to process post ${post.id}:`, error.message);
            // Falha transitória (ex.: Cloudflare fora): NÃO trava em erro.
            // Volta para a fila com retentativa espaçada e o sistema segue nos próximos.
            const attempts = (post.publish_attempts || 0) + 1;
            if (attempts >= MAX_IMAGE_ATTEMPTS) {
                const message = `Desistido após ${MAX_IMAGE_ATTEMPTS} tentativas: ${error.message}. Edite o horário do post para reativar.`;
                await query('UPDATE automation_posts SET status = $1, error_message = $2, publish_attempts = $3 WHERE id = $4', ['error', message, attempts, post.id]);
            } else {
                const backoff = retryBackoffMinutes(attempts);
                const message = retryErrorMessage(`Falha ao gerar imagem: ${error.message}`, attempts, backoff);
                if (phase === 'now') {
                    // "Postar agora" que falhou vira agendado imediato com retentativa
                    await query(`
                        UPDATE automation_posts
                        SET status = 'scheduled', scheduled_date = NOW(),
                            error_message = $1, publish_attempts = $2,
                            retry_at = NOW() + ($3 || ' minutes')::interval, updated_at = NOW()
                        WHERE id = $4
                    `, [message, attempts, String(backoff), post.id]);
                } else {
                    await query(`
                        UPDATE automation_posts
                        SET status = 'pending', error_message = $1, publish_attempts = $2,
                            retry_at = NOW() + ($3 || ' minutes')::interval, updated_at = NOW()
                        WHERE id = $4
                    `, [message, attempts, String(backoff), post.id]);
                }
            }
        }
    }
    return result.rows.length;
}

// Process posts that are ready to be published
async function processScheduledPublishing() {
    // Find scheduled posts that are due (pulando os que estão em espera de retentativa,
    // para que os próximos da fila publiquem normalmente e o sistema volte nos que falharam)
    // JIT (Just-In-Time): Se o post ainda não tem imagem, gera agora (na hora de publicar)
    // Claim atômico: reserva até 5 posts devidos (SELECT ... FOR UPDATE SKIP LOCKED
    // + marcação 'publishing' na MESMA transação) para que dois workers nunca
    // peguem o mesmo post — mesmo que outro backend esteja no mesmo banco.
    // JIT (Just-In-Time): Se o post ainda não tem imagem, gera agora (na hora de publicar)
    const claimed = await withTransaction(async (client) => {
        const sel = await client.query(`
            SELECT p.*, a.page_ids as automation_page_ids, a.user_id, a.visual_identity, a.auto_approve, a.schedule_times
            FROM automation_posts p
            JOIN automations a ON p.automation_id = a.id
            WHERE p.status = 'scheduled' AND a.status = 'active' AND (p.scheduled_date IS NULL OR p.scheduled_date <= NOW())
              AND (p.retry_at IS NULL OR p.retry_at <= NOW())
            ORDER BY p.scheduled_date ASC
            LIMIT 5
            FOR UPDATE OF p SKIP LOCKED
        `);
        const ids = sel.rows.map(r => r.id);
        if (ids.length > 0) {
            await client.query(`UPDATE automation_posts SET status = 'publishing', updated_at = NOW() WHERE id = ANY($1)`, [ids]);
        }
        return sel.rows;
    });
    const result = { rows: claimed };
    
    if (result.rows.length === 0) return 0;

    console.log(`[AutomationCron] Processing ${result.rows.length} scheduled publications...`);

    for (const post of result.rows) {
        let anyPublished = false;
        let lastError = null;
        try {
            await query('UPDATE automation_posts SET status = $1 WHERE id = $2', ['publishing', post.id]);

            // JIT: Gerar imagem+legenda AGORA se ainda não existir (modo agendado otimizado)
            if (!post.image_url) {
                // Detectar plataforma alvo para gerar no tamanho correto (Instagram 4:5, Facebook paisagem)
                let targetPlatform = null;
                try {
                    let ids = typeof post.automation_page_ids === 'string' ? JSON.parse(post.automation_page_ids) : (post.automation_page_ids || []);
                    const fbs = await getFacebookPages(post.user_id);
                    const igs = await getInstagramAccounts(post.user_id);
                    for (const t of ids) {
                        if (fbs.find(p => String(p.id) === String(t))) { targetPlatform = 'facebook'; break; }
                        if (igs.find(a => String(a.id) === String(t) || String(a.accountId) === String(t) || String(a.username) === String(t))) { targetPlatform = 'instagram'; break; }
                    }
                } catch {}
                
                console.log(`[AutomationCron] JIT: Gerando imagem para post ${post.id} (plataforma: ${targetPlatform || 'padrão'})...`);
                try {
                    const imageUrl = await generateImage(post.title, post.visual_identity, post.user_id, targetPlatform, post.id);

                    // Só gera legenda/hashtags pela IA se ainda não existirem —
                    // assim respeita a frase/hashtags que o usuário editou manualmente.
                    let finalDescription = post.description;
                    let finalHashtags = post.hashtags;
                    if (!finalDescription || !finalHashtags) {
                        const textData = await generateCaptionAndHashtags(post.title, post.user_id);
                        finalDescription = finalDescription || textData.description || '';
                        finalHashtags = finalHashtags || textData.hashtags || '';
                    }

                    if (imageUrl) {
                        post.image_url = imageUrl;
                        post.description = finalDescription;
                        post.hashtags = finalHashtags;

                        await query(`
                            UPDATE automation_posts 
                            SET image_url = $1, description = $2, hashtags = $3, updated_at = NOW()
                            WHERE id = $4
                        `, [imageUrl, finalDescription, finalHashtags, post.id]);

                        console.log(`[AutomationCron] JIT: Imagem gerada com sucesso para post ${post.id}`);
                    } else {
                        throw new Error('generateImage retornou null');
                    }
                } catch (genErr) {
                    console.error(`[AutomationCron] JIT: Falha ao gerar imagem para post ${post.id}:`, genErr.message);
                    // Em vez de travar em erro, volta para a fila com retentativa espaçada:
                    // o sistema segue publicando os próximos e volta neste depois.
                    const attempts = (post.publish_attempts || 0) + 1;
                    if (attempts >= MAX_IMAGE_ATTEMPTS) {
                        const message = `Desistido após ${MAX_IMAGE_ATTEMPTS} tentativas: Falha ao gerar imagem: ${genErr.message}. Edite o horário do post para reativar.`;
                        await query('UPDATE automation_posts SET status = $1, error_message = $2, publish_attempts = $3 WHERE id = $4', ['error', message, attempts, post.id]);
                    } else {
                        const backoff = retryBackoffMinutes(attempts);
                        const message = retryErrorMessage(`Falha ao gerar imagem: ${genErr.message}`, attempts, backoff);
                        await query(`
                            UPDATE automation_posts 
                            SET status = 'scheduled', error_message = $1, publish_attempts = $2,
                                retry_at = NOW() + ($3 || ' minutes')::interval, updated_at = NOW()
                            WHERE id = $4
                        `, [message, attempts, String(backoff), post.id]);
                    }
                    continue;
                }
            }

            const caption = `${post.description || ''}\n\n${post.hashtags || ''}`.trim();
            
            // Obter page_ids da automação (vem do JOIN como automation_page_ids)
            let pageIds = [];
            const rawPageIds = post.automation_page_ids || post.page_ids;
            try {
                pageIds = typeof rawPageIds === 'string' ? JSON.parse(rawPageIds) : (rawPageIds || []);
            } catch (e) {
                pageIds = Array.isArray(rawPageIds) ? rawPageIds : [rawPageIds].filter(Boolean);
            }

            console.log(`[AutomationCron] Post ${post.id} - page_ids da automação:`, pageIds);

            if (pageIds.length === 0) {
                lastError = 'Automação não tem páginas/contas configuradas.';
                console.warn(`[AutomationCron] ${lastError} para post ${post.id}`);
            }

            if (pageIds.length > 0) {
                const fbPages = await getFacebookPages(post.user_id);
                const igAccounts = await getInstagramAccounts(post.user_id);

                let publishedPageId = null;
                let publishedPlatform = null;
                let publishedPostId = null;
                let publishedMediaType = null;
                for (const targetId of pageIds) {
                    try {
                        // Tenta encontrar em Páginas do Facebook
                        const fbPage = fbPages.find(p => String(p.id) === String(targetId));
                        if (fbPage) {
                            const token = fbPage.accessToken || fbPage.access_token;
                            const result = await facebookService.postPhoto(fbPage.id, token, post.image_url, caption, post.user_id);
                            if (result.success) {
                                console.log(`[AutomationCron] Sucesso ao publicar no Facebook (Página: ${fbPage.name || fbPage.id})`);
                                anyPublished = true;
                                publishedPageId = fbPage.id;
                                publishedPlatform = 'facebook';
                                publishedPostId = result.postId || result.id || publishedPostId;
                                publishedMediaType = detectMediaType(post.image_url);
                            } else {
                                lastError = `Facebook: ${result.error}`;
                                console.error(`[AutomationCron] Falha ao publicar no Facebook (${fbPage.name || fbPage.id}):`, result.error);
                            }
                            continue;
                        }

                        // Tenta encontrar em Contas do Instagram
                        const igAcc = igAccounts.find(a => String(a.id) === String(targetId) || String(a.accountId) === String(targetId) || String(a.username) === String(targetId));
                        if (igAcc) {
                            const result = await instagramGraph.postImageGraph(post.image_url, caption, igAcc.id);
                            if (result.success) {
                                console.log(`[AutomationCron] Sucesso ao publicar no Instagram (${igAcc.username || igAcc.id})`);
                                anyPublished = true;
                                publishedPageId = igAcc.id;
                                publishedPlatform = 'instagram';
                                publishedPostId = result.mediaId || result.id || publishedPostId;
                                publishedMediaType = detectMediaType(post.image_url);
                            } else {
                                lastError = `Instagram: ${result.error}`;
                                console.error(`[AutomationCron] Falha ao publicar no Instagram (${igAcc.username || igAcc.id}):`, result.error);
                            }
                            continue;
                        }

                        console.warn(`[AutomationCron] Conta/Página ID ${targetId} não foi encontrada no banco para o usuário ${post.user_id}`);
                        lastError = `Conta/Página ID ${targetId} não encontrada`;
                    } catch (pubErr) {
                        lastError = pubErr.message;
                        console.error(`[AutomationCron] Erro ao publicar para ID ${targetId}:`, pubErr.message);
                    }
                }

                if (anyPublished) {
                    await query(
                        'UPDATE automation_posts SET status = $1, published_date = NOW(), published_page_id = $2, published_platform = $3, published_post_id = $4, media_type = $5, publish_attempts = 0, retry_at = NULL, error_message = NULL WHERE id = $6',
                        ['published', publishedPageId, publishedPlatform, publishedPostId, publishedMediaType, post.id]
                    );
                } else {
                    await query('UPDATE automation_posts SET status = $1, error_message = $2 WHERE id = $3', ['error', lastError || 'Nenhuma conta/página encontrada para publicar.', post.id]);
                }
            }
        } catch (error) {
            console.error(`[AutomationCron] Failed to publish post ${post.id}:`, error);
            await query('UPDATE automation_posts SET status = $1, error_message = $2 WHERE id = $3', ['error', error.message, post.id]);
        }
    }
    return result.rows.length;
}
