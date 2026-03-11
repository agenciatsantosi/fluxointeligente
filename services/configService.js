import db from './database.js';

/**
 * Initialize system configuration table
 */
export async function initializeConfig() {
    // Schema handled in database.js

    // Insert default configurations if they don't exist
    const defaults = [
        { key: 'domain_instagram', value: '', description: 'Domínio personalizado para links do Instagram' },
        { key: 'domain_twitter', value: '', description: 'Domínio personalizado para links do Twitter' },
        { key: 'domain_facebook', value: '', description: 'Domínio personalizado para links do Facebook' },
        { key: 'domain_telegram', value: '', description: 'Domínio personalizado para links do Telegram' },
        { key: 'domain_whatsapp', value: '', description: 'Domínio personalizado para links do WhatsApp' },
        { key: 'plan_free_limit', value: '10', description: 'Limite de posts diários para plano Free' },
        { key: 'plan_pro_limit', value: '100', description: 'Limite de posts diários para plano Pro' },
        { key: 'plan_enterprise_limit', value: '999999', description: 'Limite de posts diários para plano Enterprise' },
        { key: 'plan_free_price', value: '0', description: 'Preço do plano Free' },
        { key: 'plan_pro_price', value: '97', description: 'Preço do plano Pro' },
        { key: 'plan_enterprise_price', value: '297', description: 'Preço do plano Enterprise' }
    ];

    for (const { key, value, description } of defaults) {
        const res = await db.query('SELECT * FROM system_config WHERE config_key = $1', [key]);
        if (res.rows.length === 0) {
            await db.query('INSERT INTO system_config (config_key, config_value, description) VALUES ($1, $2, $3)', [key, value, description]);
        }
    }

    console.log('✅ System configuration initialized');
}

/**
 * Get configuration value
 */
export async function getConfig(key) {
    const res = await db.query('SELECT config_value FROM system_config WHERE config_key = $1', [key]);
    return res.rows[0] ? res.rows[0].config_value : null;
}

/**
 * Get all configurations
 */
export async function getAllConfigs() {
    const res = await db.query('SELECT * FROM system_config ORDER BY config_key');
    return res.rows;
}

/**
 * Set configuration value
 */
export async function setConfig(key, value) {
    try {
        await db.query(`
            UPDATE system_config 
            SET config_value = $1, updated_at = CURRENT_TIMESTAMP 
            WHERE config_key = $2
        `, [value, key]);
        return { success: true, message: 'Configuração atualizada com sucesso' };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Set multiple configurations at once
 */
export async function setMultipleConfigs(configs) {
    try {
        // In PostgreSQL, we don't have a direct transaction shim like better-sqlite3
        // We can just run multiple queries or use a single transaction manually
        await db.query('BEGIN');
        try {
            for (const { key, value } of configs) {
                await db.query(`
                    UPDATE system_config 
                    SET config_value = $1, updated_at = CURRENT_TIMESTAMP 
                    WHERE config_key = $2
                `, [value, key]);
            }
            await db.query('COMMIT');
            return { success: true, message: 'Configurações atualizadas com sucesso' };
        } catch (error) {
            await db.query('ROLLBACK');
            throw error;
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Get domain configurations
 */
export async function getDomainConfigs() {
    const res = await db.query(`
        SELECT config_key, config_value 
        FROM system_config 
        WHERE config_key LIKE 'domain_%'
    `);

    const result = {};
    res.rows.forEach(({ config_key, config_value }) => {
        const platform = config_key.replace('domain_', '');
        result[platform] = config_value || '';
    });

    return result;
}

/**
 * Get plan limits
 */
export async function getPlanLimits() {
    const res = await db.query(`
        SELECT config_key, config_value 
        FROM system_config 
        WHERE config_key LIKE 'plan_%_limit'
    `);

    const result = {};
    res.rows.forEach(({ config_key, config_value }) => {
        const plan = config_key.replace('plan_', '').replace('_limit', '');
        result[plan] = parseInt(config_value) || 0;
    });

    return result;
}

/**
 * Get plan prices
 */
export async function getPlanPrices() {
    const res = await db.query(`
        SELECT config_key, config_value 
        FROM system_config 
        WHERE config_key LIKE 'plan_%_price'
    `);

    const result = {};
    res.rows.forEach(({ config_key, config_value }) => {
        const plan = config_key.replace('plan_', '').replace('_price', '');
        result[plan] = parseFloat(config_value) || 0;
    });

    return result;
}

export default {
    initializeConfig,
    getConfig,
    getAllConfigs,
    setConfig,
    setMultipleConfigs,
    getDomainConfigs,
    getPlanLimits,
    getPlanPrices
};
