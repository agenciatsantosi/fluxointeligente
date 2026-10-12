import cron from 'node-cron';
import { query, getFacebookPages, getInstagramAccounts } from './database.js';
import { generateImage, generateCaptionAndHashtags } from './ai_generator.js';
import * as facebookService from './facebookService.js';
import * as instagramGraph from './instagramGraphService.js';

let generationRunning = false;
let publishingRunning = false;

// Initialize Cron Jobs
export function initAutomationCron() {
    // 1. Generation Job: Runs every 5 minutes to generate content for pending posts
    cron.schedule('*/5 * * * *', async () => {
        if (generationRunning) return;
        generationRunning = true;
        try {
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
    // Find up to 5 pending posts
    const result = await query(`
        SELECT p.*, a.visual_identity, a.auto_approve, a.schedule_times, a.page_ids, a.user_id 
        FROM automation_posts p
        JOIN automations a ON p.automation_id = a.id
        WHERE p.status = 'pending' AND a.status = 'active'
        ORDER BY p.created_at ASC
        LIMIT 5
    `);
    
    if (result.rows.length === 0) return 0;

    console.log(`[AutomationCron] Processing ${result.rows.length} pending posts (schedule/LGTM only)...`);

    for (const post of result.rows) {
        try {
            // Update status to generating
            await query('UPDATE automation_posts SET status = $1 WHERE id = $2', ['generating', post.id]);
            
            const isNow = post.schedule_times && (post.schedule_times.mode === 'now' || post.schedule_times === 'now');
            
            if (isNow) {
                // Modo "Postar Agora": gera imagem AGORA e publica imediatamente
                const imageUrl = await generateImage(post.title, post.visual_identity, post.user_id);
                const textData = await generateCaptionAndHashtags(post.title, post.user_id);
                
                await query(`
                    UPDATE automation_posts 
                    SET image_url = $1, description = $2, hashtags = $3, status = 'scheduled', scheduled_date = NOW(), updated_at = NOW()
                    WHERE id = $4
                `, [imageUrl, textData.description, textData.hashtags, post.id]);
                
                console.log(`[AutomationCron] Post ${post.id} gerado e marcado para publicar AGORA`);
            } else if (post.auto_approve) {
                // Modo AGENDADO com auto-approve: NÃO gera imagem agora
                // Apenas calcula a data e marca como scheduled (sem imagem)
                // A imagem será gerada no momento da publicação (JIT)
                const scheduledDate = await calculateScheduledDate(post, post.schedule_times);
                
                await query(`
                    UPDATE automation_posts 
                    SET status = 'scheduled', scheduled_date = $1, updated_at = NOW()
                    WHERE id = $2
                `, [scheduledDate, post.id]);
                
                console.log(`[AutomationCron] Post ${post.id} agendado para ${scheduledDate} - imagem será gerada na publicação (JIT)`);
            } else {
                // Modo sem auto-approve: gera imagem agora para aprovação manual
                const imageUrl = await generateImage(post.title, post.visual_identity, post.user_id);
                const textData = await generateCaptionAndHashtags(post.title, post.user_id);
                
                await query(`
                    UPDATE automation_posts 
                    SET image_url = $1, description = $2, hashtags = $3, status = 'generated', updated_at = NOW()
                    WHERE id = $4
                `, [imageUrl, textData.description, textData.hashtags, post.id]);
                
                console.log(`[AutomationCron] Post ${post.id} gerado para aprovação manual`);
            }
        } catch (error) {
            console.error(`[AutomationCron] Failed to process post ${post.id}:`, error);
            await query('UPDATE automation_posts SET status = $1, error_message = $2 WHERE id = $3', ['error', error.message, post.id]);
        }
    }
    return result.rows.length;
}

// Process posts that are ready to be published
async function processScheduledPublishing() {
    // Find scheduled posts that are due
    // JIT (Just-In-Time): Se o post ainda não tem imagem, gera agora (na hora de publicar)
    const result = await query(`
        SELECT p.*, a.page_ids as automation_page_ids, a.user_id, a.visual_identity, a.auto_approve, a.schedule_times
        FROM automation_posts p
        JOIN automations a ON p.automation_id = a.id
        WHERE p.status = 'scheduled' AND a.status = 'active' AND (p.scheduled_date IS NULL OR p.scheduled_date <= NOW())
        ORDER BY p.scheduled_date ASC
        LIMIT 5
    `);
    
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
                    const imageUrl = await generateImage(post.title, post.visual_identity, post.user_id, targetPlatform);

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
                    // Em vez de morrer em erro de vez, tenta novamente com backoff (até 5 tentativas)
                    const attempts = (post.publish_attempts || 0) + 1;
                    const message = `Falha ao gerar imagem (tentativa ${attempts}/5): ${genErr.message}`;
                    if (attempts >= 5) {
                        await query('UPDATE automation_posts SET status = $1, error_message = $2, publish_attempts = $3 WHERE id = $4', ['error', message, attempts, post.id]);
                    } else {
                        await query(`
                            UPDATE automation_posts 
                            SET status = 'scheduled', error_message = $1, publish_attempts = $2,
                                scheduled_date = NOW() + INTERVAL '3 minutes', updated_at = NOW()
                            WHERE id = $3
                        `, [message, attempts, post.id]);
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
                        'UPDATE automation_posts SET status = $1, published_date = NOW(), published_page_id = $2, published_platform = $3 WHERE id = $4',
                        ['published', publishedPageId, publishedPlatform, post.id]
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
