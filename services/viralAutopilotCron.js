import cron from 'node-cron';
import { query, getFacebookPages, getInstagramAccounts } from './database.js';
import { searchViralImages } from './viralImageHunterService.js';
import { analyzeViralImage } from './visionAnalysisService.js';
import { createViralRemix } from './viralCreativeService.js';
import * as facebookService from './facebookService.js';
import * as instagramGraph from './instagramGraphService.js';

let isAutopilotRunning = false;

/**
 * Publica um post viral remodelado em uma ou mais contas conectadas
 */
export async function publishViralPost(postId, targetPageIds = null) {
    const postRes = await query(`
        SELECT p.*, a.user_id as auto_user_id
        FROM viral_recreated_posts p
        LEFT JOIN viral_image_automations a ON a.id = p.automation_id
        WHERE p.id = $1
    `, [postId]);

    if (postRes.rows.length === 0) {
        throw new Error('Post viral não encontrado.');
    }

    const post = postRes.rows[0];
    const userId = post.user_id || post.auto_user_id;
    let pageIds = targetPageIds || post.page_ids || [];
    if (typeof pageIds === 'string') {
        try { pageIds = JSON.parse(pageIds); } catch { pageIds = []; }
    }

    if (!Array.isArray(pageIds) || pageIds.length === 0) {
        throw new Error('Nenhuma página ou conta selecionada para publicação.');
    }

    const [fbPages, igAccounts] = await Promise.all([
        getFacebookPages(userId).catch(() => []),
        getInstagramAccounts(userId).catch(() => [])
    ]);

    const fullCaption = `${post.caption || ''}\n\n${post.hashtags || ''}`.trim();
    const publishedTargets = [];
    const errors = [];

    for (const pid of pageIds) {
        const idStr = String(pid);

        // 1. Tenta como Facebook Page
        const fbPage = fbPages.find(p => String(p.id) === idStr);
        if (fbPage) {
            try {
                const token = fbPage.access_token || fbPage.page_token;
                console.log(`[AutoPublisher] Publicando imagem na página Facebook "${fbPage.name}"...`);
                const fbRes = await facebookService.postPhoto(fbPage.id, token, post.recreated_image_url, fullCaption, userId);
                publishedTargets.push(`Facebook: ${fbPage.name}`);
                console.log(`[AutoPublisher] ✅ Publicado com sucesso no Facebook: ${fbPage.name}`);
            } catch (err) {
                console.error(`[AutoPublisher] Erro ao postar no Facebook (${fbPage.name}):`, err.message);
                errors.push(`Facebook (${fbPage.name}): ${err.message}`);
            }
            continue;
        }

        // 2. Tenta como Instagram Account
        const igAcc = igAccounts.find(a => String(a.id) === idStr || String(a.accountId) === idStr || String(a.username) === idStr);
        if (igAcc) {
            try {
                console.log(`[AutoPublisher] Publicando imagem na conta Instagram "@${igAcc.username || igAcc.name}"...`);
                await instagramGraph.postImageGraph(post.recreated_image_url, fullCaption, igAcc.id);
                publishedTargets.push(`Instagram: @${igAcc.username || igAcc.name}`);
                console.log(`[AutoPublisher] ✅ Publicado com sucesso no Instagram: @${igAcc.username || igAcc.name}`);
            } catch (err) {
                console.error(`[AutoPublisher] Erro ao postar no Instagram (@${igAcc.username}):`, err.message);
                errors.push(`Instagram (@${igAcc.username}): ${err.message}`);
            }
        }
    }

    if (publishedTargets.length === 0 && errors.length > 0) {
        await query('UPDATE viral_recreated_posts SET status = $1, error_message = $2, updated_at = NOW() WHERE id = $3', ['error', errors.join('; '), postId]);
        throw new Error(errors.join('; '));
    }

    await query(`
        UPDATE viral_recreated_posts 
        SET status = 'published', published_at = NOW(), error_message = NULL, updated_at = NOW() 
        WHERE id = $1
    `, [postId]);

    return { success: true, publishedTargets, errors };
}

/**
 * Executa um ciclo do Piloto Automático para automações ativas
 */
export async function runAutopilotCycle(forcedAutomationId = null) {
    if (isAutopilotRunning && !forcedAutomationId) {
        console.log('[AutopilotCron] Ciclo anterior ainda em execução, ignorando...');
        return;
    }

    isAutopilotRunning = true;
    try {
        let sql = `SELECT * FROM viral_image_automations WHERE status = 'active'`;
        const params = [];
        if (forcedAutomationId) {
            sql += ` AND id = $1`;
            params.push(forcedAutomationId);
        } else {
            sql += ` AND (next_run_at <= NOW() OR next_run_at IS NULL)`;
        }

        const autos = await query(sql, params);
        if (autos.rows.length === 0) return;

        console.log(`[AutopilotCron] Processando ${autos.rows.length} automação(ões) ativa(s)...`);

        for (const auto of autos.rows) {
            try {
                let sources = auto.sources || ['instagram', 'reddit'];
                if (typeof sources === 'string') {
                    try { sources = JSON.parse(sources); } catch { sources = ['instagram', 'reddit']; }
                }

                const searchRes = await searchViralImages({
                    query: auto.query,
                    userId: auto.user_id,
                    sources,
                    sortBy: 'virality',
                    limit: 15
                });

                const viralItems = searchRes.items.filter(it => it.viralScore >= (auto.viral_threshold || 70));
                console.log(`[AutopilotCron] Automação "${auto.name}": ${searchRes.items.length} encontrados, ${viralItems.length} acima do threshold (${auto.viral_threshold})`);

                const maxToCreate = Math.max(1, Math.min(auto.posts_per_day || 2, 4));
                let createdCount = 0;

                for (const item of viralItems) {
                    if (createdCount >= maxToCreate) break;

                    // Verifica se já processamos esta imagem recentemente (deduplicação)
                    const check = await query(`
                        SELECT id FROM viral_image_items 
                        WHERE user_id = $1 AND (external_id = $2 OR image_url = $3)
                        LIMIT 1
                    `, [auto.user_id, item.externalId, item.imageUrl]);

                    if (check.rows.length > 0) continue; // Já processado

                    // Salva a referência encontrada
                    const itemInsert = await query(`
                        INSERT INTO viral_image_items (
                            user_id, automation_id, platform, external_id, title,
                            image_url, permalink, likes, comments, viral_score, channel, published_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                        RETURNING id
                    `, [
                        auto.user_id, auto.id, item.platform, item.externalId, item.title,
                        item.imageUrl, item.permalink, item.likes, item.comments, item.viralScore,
                        item.channel, item.publishedAt
                    ]);
                    const refId = itemInsert.rows[0]?.id;

                    // Agente 2: Vision Analysis
                    const visionAnalysis = await analyzeViralImage(item.imageUrl, item.title, auto.user_id);

                    // Agente 3: Viral Creative Studio
                    const remix = await createViralRemix({
                        referenceId: refId,
                        referenceTitle: item.title,
                        referenceImageUrl: item.imageUrl,
                        analysis: visionAnalysis,
                        visualStyle: auto.visual_style || 'umbanda_cuiaba',
                        format: 'feed_vertical',
                        tone: 'religioso',
                        userId: auto.user_id
                    });

                    // Agente 4: Publicação Direta ou Fila de Aprovação
                    let targetPageIds = auto.target_page_ids || [];
                    if (typeof targetPageIds === 'string') {
                        try { targetPageIds = JSON.parse(targetPageIds); } catch { targetPageIds = []; }
                    }

                    if (auto.auto_approve && targetPageIds.length > 0 && remix.id) {
                        try {
                            await publishViralPost(remix.id, targetPageIds);
                            console.log(`[AutopilotCron] Post ${remix.id} publicado direto no piloto automático!`);
                        } catch (pubErr) {
                            console.warn(`[AutopilotCron] Falha ao publicar direto post ${remix.id}:`, pubErr.message);
                        }
                    } else if (remix.id) {
                        await query(`UPDATE viral_recreated_posts SET status = 'pending_approval', page_ids = $1 WHERE id = $2`, [JSON.stringify(targetPageIds), remix.id]);
                        console.log(`[AutopilotCron] Post ${remix.id} gerado e salvo na fila de aprovação`);
                    }

                    createdCount++;
                }

                // Atualiza estatísticas e próximo agendamento
                const hours = auto.frequency_hours || 6;
                await query(`
                    UPDATE viral_image_automations
                    SET last_run_at = NOW(),
                        next_run_at = NOW() + INTERVAL '${hours} hours',
                        stats = jsonb_set(
                            jsonb_set(
                                jsonb_set(COALESCE(stats, '{}'::jsonb), '{found}', (COALESCE((stats->>'found')::int, 0) + ${searchRes.items.length})::text::jsonb),
                                '{analyzed}', (COALESCE((stats->>'analyzed')::int, 0) + ${createdCount})::text::jsonb
                            ),
                            '{generated}', (COALESCE((stats->>'generated')::int, 0) + ${createdCount})::text::jsonb
                        ),
                        updated_at = NOW()
                    WHERE id = $1
                `, [auto.id]);

            } catch (err) {
                console.error(`[AutopilotCron] Erro na automação ${auto.id} (${auto.name}):`, err.message);
            }
        }
    } finally {
        isAutopilotRunning = false;
    }
}

/**
 * Inicia o cron do Piloto Automático no servidor (roda a cada 15 minutos)
 */
export function startViralAutopilotCron() {
    console.log('[AutopilotCron] 🚀 Agendador 24h de Imagens Virais ativado (checagem a cada 15 min)...');
    cron.schedule('*/15 * * * *', async () => {
        try {
            await runAutopilotCycle();
        } catch (e) {
            console.error('[AutopilotCron] Erro no ciclo de 15 min:', e.message);
        }
    });
}
