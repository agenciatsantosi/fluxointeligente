import db from './database.js';

export default db;

// ==================== WhatsApp Groups Functions ====================

export async function getWhatsAppGroups(userId) {
    const res = await db.query(`
        SELECT group_id as "groupId", group_name as "groupName", enabled, added_at as "addedAt" 
        FROM whatsapp_groups 
        WHERE user_id = $1 
        ORDER BY added_at DESC
    `, [userId]);
    return res.rows.map(row => ({ ...row, enabled: Boolean(row.enabled) }));
}

export async function addWhatsAppGroup(groupId, groupName, userId) {
    const queryText = `
        INSERT INTO whatsapp_groups (group_id, group_name, user_id) 
        VALUES ($1, $2, $3)
        ON CONFLICT (group_id) DO UPDATE SET 
            group_name = EXCLUDED.group_name,
            user_id = EXCLUDED.user_id,
            added_at = CURRENT_TIMESTAMP
    `;
    return await db.query(queryText, [groupId, groupName, userId]);
}

export async function removeWhatsAppGroup(groupId, userId) {
    return await db.query('DELETE FROM whatsapp_groups WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
}

export async function toggleWhatsAppGroup(groupId, userId) {
    return await db.query('UPDATE whatsapp_groups SET enabled = NOT enabled WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
}

// ==================== Pinterest Boards Functions ====================

export async function getPinterestBoards(userId) {
    const res = await db.query(`
        SELECT board_id as "boardId", board_name as "boardName", enabled, added_at as "addedAt" 
        FROM pinterest_boards 
        WHERE user_id = $1 
        ORDER BY added_at DESC
    `, [userId]);
    return res.rows.map(row => ({ ...row, enabled: Boolean(row.enabled) }));
}

export async function addPinterestBoard(boardId, boardName, userId) {
    const queryText = `
        INSERT INTO pinterest_boards (board_id, board_name, user_id) 
        VALUES ($1, $2, $3)
        ON CONFLICT (board_id) DO UPDATE SET 
            board_name = EXCLUDED.board_name,
            user_id = EXCLUDED.user_id,
            added_at = CURRENT_TIMESTAMP
    `;
    return await db.query(queryText, [boardId, boardName, userId]);
}

export async function removePinterestBoard(boardId, userId) {
    return await db.query('DELETE FROM pinterest_boards WHERE board_id = $1 AND user_id = $2', [boardId, userId]);
}

export async function togglePinterestBoard(boardId, userId) {
    return await db.query('UPDATE pinterest_boards SET enabled = NOT enabled WHERE board_id = $1 AND user_id = $2', [boardId, userId]);
}

// ==================== User Config Functions ====================

export async function getUserConfig(userId, key) {
    const res = await db.query('SELECT value FROM user_config WHERE user_id = $1 AND key = $2', [userId, key]);
    return res.rows[0] ? res.rows[0].value : null;
}

export async function setUserConfig(userId, key, value) {
    const queryText = `
        INSERT INTO user_config (user_id, key, value, updated_at) 
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP) 
        ON CONFLICT(user_id, key) DO UPDATE SET 
            value = EXCLUDED.value, 
            updated_at = CURRENT_TIMESTAMP
    `;
    return await db.query(queryText, [userId, key, value]);
}

export async function getAllUserConfig(userId) {
    const res = await db.query('SELECT key, value FROM user_config WHERE user_id = $1', [userId]);
    const config = {};
    res.rows.forEach(row => {
        config[row.key] = row.value;
    });
    return config;
}

export async function deleteUserConfig(userId, key) {
    return await db.query('DELETE FROM user_config WHERE user_id = $1 AND key = $2', [userId, key]);
}
