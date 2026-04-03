import * as db from '../services/database.js';
import axios from 'axios';

async function migrateTokens() {
    console.log('[MIGRATION] Iniciando migração de tokens Meta para Auto-Recuperação...');
    
    try {
        // 1. Get all users who have Facebook pages using a raw query
        const res = await db.query('SELECT user_id as "userId", access_token as "accessToken" FROM facebook_pages');
        const pages = res.rows;
        
        if (!pages || pages.length === 0) {
            console.log('[MIGRATION] Nenhuma página encontrada para migrar.');
            return;
        }

        // Group by userId
        const users = [...new Set(pages.map(p => p.userId || p.user_id))];
        console.log(`[MIGRATION] Encontrados ${users.length} usuários com páginas.`);

        for (const userId of users) {
             // 2. Check if user already has a META_USER_ACCESS_TOKEN
             const existing = await db.getUserConfig(userId, 'META_USER_ACCESS_TOKEN');
             if (existing) {
                 console.log(`[MIGRATION] Usuário ${userId} já possui Master Token. Pulando...`);
                 continue;
             }

             // 3. Pick the first valid page token to promote as Master Token
             const userPages = pages.filter(p => (p.userId || p.user_id) === userId);
             console.log(`[MIGRATION] Migrando usuário ${userId} (${userPages.length} páginas)...`);

             for (const page of userPages) {
                 const token = page.accessToken || page.access_token;
                 if (!token) continue;

                 // 4. Validate token before promoting
                 try {
                     const response = await axios.get(`https://graph.facebook.com/v18.0/me`, {
                         params: { access_token: token }
                     });
                     
                     if (response.data && response.data.id) {
                         console.log(`[MIGRATION] Token válido encontrado para usuário ${userId}. Promovendo a Master Token...`);
                         await db.setUserConfig(userId, 'META_USER_ACCESS_TOKEN', token);
                         break; // Found one, move to next user
                     }
                 } catch (err) {
                     // Silently ignore invalid tokens during migration
                 }
             }
        }
        
        console.log('[MIGRATION] Migração concluída com sucesso.');
    } catch (error) {
        console.error('[MIGRATION] Erro crítico na migração:', error.message);
    }
}

migrateTokens().then(() => process.exit(0));
