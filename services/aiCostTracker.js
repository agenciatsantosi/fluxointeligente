/**
 * ═══════════════════════════════════════════════════════════════════════
 * 💰 AI COST TRACKER — Calcula e registra custos de geração de imagens
 * ═══════════════════════════════════════════════════════════════════════
 */

import { query } from './database.js';

/**
 * Busca o preço configurado para um provedor/modelo
 */
export async function getPricing(provider, model) {
    try {
        const res = await query(`
            SELECT pricing_type, input_price_usd, output_price_usd
            FROM ai_pricing
            WHERE provider = $1 AND model = $2 AND is_active = TRUE
        `, [provider, model]);
        if (res.rows.length > 0) return res.rows[0];
    } catch (e) {
        console.warn('[CostTracker] Erro ao buscar pricing:', e.message);
    }
    return null;
}

/**
 * Calcula custo estimado baseado no tipo de pricing
 */
export function calculateCost(pricing, params = {}) {
    if (!pricing) return { cost: 0, breakdown: 'sem pricing configurado' };

    const { pricing_type, input_price_usd = 0, output_price_usd = 0 } = pricing;
    let cost = 0;
    let breakdown = '';

    switch (pricing_type) {
        case 'per_image':
            cost = output_price_usd || input_price_usd || 0;
            breakdown = `$${cost.toFixed(6)}/imagem`;
            break;

        case 'per_megapixel':
            const megapixels = params.megapixels || (params.width * params.height / 1_000_000);
            cost = megapixels * (input_price_usd || 0);
            breakdown = `${megapixels.toFixed(2)}MP × $${input_price_usd}/MP`;
            break;

        case 'per_step':
            const steps = params.steps || 30;
            cost = steps * (input_price_usd || 0);
            breakdown = `${steps} steps × $${input_price_usd}/step`;
            break;

        case 'per_token':
            const inputTokens = params.prompt_tokens || 0;
            const outputTokens = params.completion_tokens || 0;
            cost = (inputTokens * (input_price_usd || 0)) + (outputTokens * (output_price_usd || 0));
            breakdown = `${inputTokens} prompt + ${outputTokens} completion tokens`;
            break;

        case 'free':
        default:
            cost = 0;
            breakdown = 'gratuito';
            break;
    }

    return { cost: Math.round(cost * 1_000_000) / 1_000_000, breakdown };
}

/**
 * Normaliza nome do modelo para buscar no pricing
 */
function normalizeModelName(provider, model) {
    const m = String(model || '').toLowerCase().trim();

    // OpenAI
    if (provider === 'openai') {
        if (m.includes('gpt-image-1-mini')) return 'gpt-image-1-mini';
        if (m.includes('gpt-image-1')) return 'gpt-image-1';
        if (m.includes('dall-e-3')) return 'dall-e-3';
        if (m.includes('dall-e-2')) return 'dall-e-2';
        return 'gpt-image-1';
    }

    // Hugging Face
    if (provider === 'huggingface') {
        if (m.includes('flux.1-klein') || m.includes('flux-1-klein')) return 'FLUX.1-klein';
        if (m.includes('flux.1-schnell') || m.includes('flux-1-schnell')) return 'FLUX.1-schnell';
        if (m.includes('flux.1-dev') || m.includes('flux-1-dev')) return 'FLUX.1-dev';
        if (m.includes('sdxl-turbo')) return 'sdxl-turbo';
        if (m.includes('ssd-1b')) return 'SSD-1B';
        if (m.includes('stable-diffusion-v1-5')) return 'stable-diffusion-v1-5';
        if (m.includes('stable-diffusion-v1-4')) return 'stable-diffusion-v1-4';
        if (m.includes('openjourney')) return 'openjourney-v4';
        if (m.includes('stable-diffusion-xl') || m.includes('sdxl')) return 'stable-diffusion-xl-base-1.0';
        if (m.includes('stable-diffusion-3')) return 'stable-diffusion-3-medium';
        return 'FLUX.1-dev';
    }

    // Cloudflare
    if (provider === 'cloudflare') {
        if (m.includes('flux')) return 'flux-1-schnell';
        if (m.includes('stable-diffusion') || m.includes('sdxl')) return 'stable-diffusion-xl-base-1.0';
        return 'flux-1-schnell';
    }

    // Pollinations
    if (provider === 'pollinations') {
        if (m.includes('klein')) return 'flux-klein';
        if (m.includes('realism')) return 'flux-realism';
        if (m.includes('anime')) return 'flux-anime';
        if (m.includes('3d')) return 'flux-3d';
        if (m.includes('gptimage')) return 'gptimage';
        if (m.includes('midjourney')) return 'midjourney';
        return 'flux';
    }

    // 9Router
    if (provider === 'ninerouter') {
        if (m.includes('gpt-image-1-mini')) return 'gpt-image-1-mini';
        if (m.includes('gpt-image-1')) return 'gpt-image-1';
        if (m.includes('dall-e-3')) return 'dall-e-3';
        return 'gpt-image-1';
    }

    // Gemini
    if (provider === 'gemini') {
        if (m.includes('pro')) return 'gemini-1.5-pro';
        return 'gemini-1.5-flash';
    }

    // Google (geração de imagem via Gemini)
    if (provider === 'google') {
        if (m.includes('2.5-flash-image') || m.includes('flash-image')) return 'gemini-2.5-flash-image';
        if (m.includes('2.0-flash-preview-image') || m.includes('preview-image')) return 'gemini-2.0-flash-preview-image-generation';
        if (m.includes('imagen')) return m;
        return 'gemini-2.5-flash-image';
    }

    return model;
}

/**
 * Registra custo de geração de imagem no post
 */
export async function trackImageGenerationCost(postId, data) {
    const {
        provider,
        model,
        width,
        height,
        steps,
        prompt_tokens,
        completion_tokens,
        actual_cost_usd
    } = data;

    const normModel = normalizeModelName(provider, model);
    const pricing = await getPricing(provider, normModel);

    let cost = 0;
    let breakdown = 'não calculado';

    if (actual_cost_usd !== undefined && actual_cost_usd !== null) {
        // Custo real retornado pela API (ex: OpenAI retorna no response)
        cost = actual_cost_usd;
        breakdown = `real: $${cost.toFixed(6)}`;
    } else {
        // Calcula estimado
        const params = { width, height, steps, prompt_tokens, completion_tokens };
        const calc = calculateCost(pricing, params);
        cost = calc.cost;
        breakdown = `estimado (${pricing?.pricing_type || 'desconhecido'}): ${calc.breakdown}`;
    }

    try {
        await query(`
            UPDATE automation_posts
            SET image_provider = $1,
                image_model = $2,
                image_cost_usd = $3,
                prompt_tokens = $4,
                completion_tokens = $5
            WHERE id = $6
        `, [provider, normModel, cost, prompt_tokens || 0, completion_tokens || 0, postId]);

        console.log(`[CostTracker] Post ${postId}: ${provider}/${normModel} = $${cost.toFixed(6)} (${breakdown})`);
    } catch (e) {
        console.warn('[CostTracker] Erro ao salvar custo:', e.message);
    }

    return { cost, breakdown, pricing_used: pricing };
}

/**
 * Registra custo de geração de prompt via LLM (Gemini/OpenAI/9Router)
 */
export async function trackPromptGenerationCost(postId, data) {
    const { provider, model, prompt_tokens, completion_tokens } = data;

    const normModel = normalizeModelName(provider, model);
    const pricing = await getPricing(provider, normModel);

    let cost = 0;
    if (pricing && pricing.pricing_type === 'per_token') {
        cost = (prompt_tokens * (pricing.input_price_usd || 0)) +
               (completion_tokens * (pricing.output_price_usd || 0));
    }

    // Atualiza tokens no post (soma com tokens de imagem se houver)
    try {
        await query(`
            UPDATE automation_posts
            SET prompt_tokens = prompt_tokens + $1,
                completion_tokens = completion_tokens + $2,
                image_cost_usd = image_cost_usd + $3
            WHERE id = $4
        `, [prompt_tokens || 0, completion_tokens || 0, cost, postId]);

        if (cost > 0) {
            console.log(`[CostTracker] Prompt LLM ${provider}/${normModel}: ${prompt_tokens}+${completion_tokens} tokens = $${cost.toFixed(6)}`);
        }
    } catch (e) {
        console.warn('[CostTracker] Erro ao salvar custo prompt:', e.message);
    }

    return { cost };
}

/**
 * Busca resumo de custos por usuário/período
 */
export async function getCostSummary(userId, options = {}) {
    const { startDate, endDate, automationId } = options;

    let where = 'WHERE a.user_id = $1';
    const params = [userId];
    let paramIdx = 2;

    if (startDate) {
        where += ` AND ap.created_at >= $${paramIdx++}`;
        params.push(startDate);
    }
    if (endDate) {
        where += ` AND ap.created_at <= $${paramIdx++}`;
        params.push(endDate);
    }
    if (automationId) {
        where += ` AND ap.automation_id = $${paramIdx++}`;
        params.push(automationId);
    }

    const res = await query(`
        SELECT
            COUNT(*) as total_posts,
            COUNT(CASE WHEN ap.image_cost_usd > 0 THEN 1 END) as posts_com_custo,
            COALESCE(SUM(ap.image_cost_usd), 0) as total_cost_usd,
            COALESCE(SUM(ap.prompt_tokens), 0) as total_prompt_tokens,
            COALESCE(SUM(ap.completion_tokens), 0) as total_completion_tokens,
            COALESCE(AVG(ap.image_cost_usd), 0) as avg_cost_per_image,
            COALESCE(MAX(ap.image_cost_usd), 0) as max_cost_per_image,
            COALESCE(MIN(ap.image_cost_usd), 0) as min_cost_per_image
        FROM automation_posts ap
        JOIN automations a ON ap.automation_id = a.id
        ${where}
    `, params);

    // Custo por provedor
    const byProvider = await query(`
        SELECT
            ap.image_provider as provider,
            ap.image_model as model,
            COUNT(*) as count,
            COALESCE(SUM(ap.image_cost_usd), 0) as total_cost_usd,
            COALESCE(AVG(ap.image_cost_usd), 0) as avg_cost_usd
        FROM automation_posts ap
        JOIN automations a ON ap.automation_id = a.id
        ${where} AND ap.image_provider IS NOT NULL
        GROUP BY ap.image_provider, ap.image_model
        ORDER BY total_cost_usd DESC
    `, params);

    // Custo por automação
    const byAutomation = await query(`
        SELECT
            a.id as automation_id,
            a.name as automation_name,
            COUNT(ap.id) as posts,
            COALESCE(SUM(ap.image_cost_usd), 0) as total_cost_usd
        FROM automation_posts ap
        JOIN automations a ON ap.automation_id = a.id
        ${where}
        GROUP BY a.id, a.name
        ORDER BY total_cost_usd DESC
    `, params);

    return {
        summary: res.rows[0],
        byProvider: byProvider.rows,
        byAutomation: byAutomation.rows
    };
}

/**
 * Busca custos detalhados (para tabela/logs)
 */
export async function getCostDetails(userId, options = {}) {
    const { startDate, endDate, automationId, limit = 100, offset = 0 } = options;

    let where = 'WHERE a.user_id = $1';
    const params = [userId];
    let paramIdx = 2;

    if (startDate) {
        where += ` AND ap.created_at >= $${paramIdx++}`;
        params.push(startDate);
    }
    if (endDate) {
        where += ` AND ap.created_at <= $${paramIdx++}`;
        params.push(endDate);
    }
    if (automationId) {
        where += ` AND ap.automation_id = $${paramIdx++}`;
        params.push(automationId);
    }

    params.push(limit, offset);

    const res = await query(`
        SELECT
            ap.id,
            ap.automation_id,
            a.name as automation_name,
            ap.title,
            ap.image_provider,
            ap.image_model,
            ap.image_cost_usd,
            ap.prompt_tokens,
            ap.completion_tokens,
            ap.created_at,
            ap.status
        FROM automation_posts ap
        LEFT JOIN automations a ON ap.automation_id = a.id
        ${where}
        ORDER BY ap.created_at DESC
        LIMIT $${paramIdx++} OFFSET $${paramIdx}
    `, params);

    return res.rows;
}

/**
 * Atualiza pricing manualmente (admin)
 */
export async function updatePricing(data) {
    const { provider, model, pricing_type, input_price_usd, output_price_usd, currency = 'USD', is_active = true } = data;

    const res = await query(`
        INSERT INTO ai_pricing (provider, model, pricing_type, input_price_usd, output_price_usd, currency, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (provider, model) DO UPDATE SET
            pricing_type = EXCLUDED.pricing_type,
            input_price_usd = EXCLUDED.input_price_usd,
            output_price_usd = EXCLUDED.output_price_usd,
            currency = EXCLUDED.currency,
            is_active = EXCLUDED.is_active,
            updated_at = CURRENT_TIMESTAMP
        RETURNING *
    `, [provider, model, pricing_type, input_price_usd, output_price_usd, currency, is_active]);

    return res.rows[0];
}

/**
 * Lista todos os pricings
 */
export async function listPricings() {
    const res = await query(`
        SELECT * FROM ai_pricing ORDER BY provider, model
    `);
    return res.rows;
}

export default {
    getPricing,
    calculateCost,
    trackImageGenerationCost,
    trackPromptGenerationCost,
    getCostSummary,
    getCostDetails,
    updatePricing,
    listPricings
};