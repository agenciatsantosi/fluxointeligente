import db from './database.js';

/**
 * Initialize site settings table
 */
export async function initializeSiteSettings() {
    // Default settings
    const defaults = [
        {
            key: 'instagram_public_url',
            value: 'http://localhost:3001',
            description: 'URL pública para upload de vídeos no Instagram (use ngrok ou seu domínio)',
            active: true
        },
        {
            key: 'social_instagram',
            value: '',
            description: 'Link do Instagram do MeliFlow',
            active: false
        },
        {
            key: 'social_facebook',
            value: '',
            description: 'Link do Facebook do MeliFlow',
            active: false
        },
        {
            key: 'social_twitter',
            value: '',
            description: 'Link do Twitter/X do MeliFlow',
            active: false
        },
        {
            key: 'social_youtube',
            value: '',
            description: 'Link do YouTube do MeliFlow',
            active: false
        },
        {
            key: 'social_tiktok',
            value: '',
            description: 'Link do TikTok do MeliFlow',
            active: false
        },
        {
            key: 'social_linkedin',
            value: '',
            description: 'Link do LinkedIn do MeliFlow',
            active: false
        }
    ];

    for (const { key, value, description, active } of defaults) {
        const res = await db.query('SELECT * FROM site_settings WHERE setting_key = $1', [key]);
        if (res.rows.length === 0) {
            await db.query(`
                INSERT INTO site_settings (setting_key, setting_value, description, is_active) 
                VALUES ($1, $2, $3, $4)
            `, [key, value, description, active]);
        }
    }

    console.log('✅ Site settings initialized');
}

/**
 * Get a single setting value
 */
export async function getSetting(key) {
    const res = await db.query('SELECT setting_value FROM site_settings WHERE setting_key = $1', [key]);
    return res.rows[0] ? res.rows[0].setting_value : null;
}

/**
 * Get all settings
 */
export async function getAllSettings() {
    const res = await db.query('SELECT * FROM site_settings ORDER BY setting_key');
    return res.rows;
}

/**
 * Update a setting
 */
export async function updateSetting(key, value, isActive = null) {
    try {
        if (isActive !== null) {
            await db.query(`
                UPDATE site_settings 
                SET setting_value = $1, is_active = $2, updated_at = CURRENT_TIMESTAMP 
                WHERE setting_key = $3
            `, [value, isActive, key]);
        } else {
            await db.query(`
                UPDATE site_settings 
                SET setting_value = $1, updated_at = CURRENT_TIMESTAMP 
                WHERE setting_key = $2
            `, [value, key]);
        }
        return { success: true, message: 'Configuração atualizada com sucesso' };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Get all active social media links (for public use)
 */
export async function getActiveSocialLinks() {
    const res = await db.query(`
        SELECT setting_key, setting_value 
        FROM site_settings 
        WHERE setting_key LIKE 'social_%' AND is_active = true AND setting_value != ''
    `);

    const result = {};
    res.rows.forEach(({ setting_key, setting_value }) => {
        const platform = setting_key.replace('social_', '');
        result[platform] = setting_value;
    });

    return result;
}

/**
 * Get Instagram public URL
 */
export async function getInstagramPublicUrl() {
    return (await getSetting('instagram_public_url')) || 'http://localhost:3001';
}

export default {
    initializeSiteSettings,
    getSetting,
    getAllSettings,
    updateSetting,
    getActiveSocialLinks,
    getInstagramPublicUrl
};
