import * as db from '../services/database.js';

function maskUrl(raw) {
    if (!raw) return '(não definida)';
    return raw.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
}

async function main() {
    console.log('==============================================');
    console.log('🔍 STATUS DO BANCO DE DADOS');
    console.log('==============================================');
    console.log('📍', maskUrl(process.env.DATABASE_URL));

    // 1. Conectividade
    const now = await db.query('SELECT NOW() AS now, current_database() AS db, current_user AS usr, version() AS version');
    const info = now.rows[0];
    console.log(`\n[1/4] ✅ Conectado ao banco "${info.db}" como "${info.usr}"`);
    console.log(`      Servidor: ${String(info.version).split(',')[0]}`);
    console.log(`      Horário:  ${info.now}`);

    // 2. Tabelas do schema público
    const tables = await db.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
    `);
    console.log(`\n[2/4] 📊 Tabelas encontradas: ${tables.rows.length}`);

    // 3. Tabelas esperadas pelo código do app
    const expected = [...new Set(
        [...(await import('node:fs')).readFileSync(new URL('../services/database.js', import.meta.url), 'utf8')
            .matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)/g)].map(m => m[1])
    )].sort();
    const existing = new Set(tables.rows.map(r => r.table_name));
    const missing = expected.filter(t => !existing.has(t));

    if (missing.length === 0) {
        console.log(`      ✅ Todas as ${expected.length} tabelas esperadas existem.`);
    } else {
        console.log(`      ❌ Faltando ${missing.length} tabela(s): ${missing.join(', ')}`);
        console.log('      Rode "npm run db:setup" para criar.');
    }

    // 4. Resumo de dados
    const counts = {};
    for (const t of ['users', 'facebook_pages', 'instagram_accounts', 'schedules', 'notifications']) {
        if (existing.has(t)) {
            const r = await db.query(`SELECT COUNT(*)::int AS n FROM ${t}`);
            counts[t] = r.rows[0].n;
        }
    }
    console.log('\n[3/4] 📈 Registros:');
    Object.entries(counts).forEach(([t, n]) => console.log(`      ${t.padEnd(22)} ${n}`));

    console.log('\n[4/4] ' + (missing.length === 0 ? '🎉 Banco de dados pronto para uso.' : '⚠️  Ação necessária: execute a migração.'));
    process.exit(missing.length === 0 ? 0 : 1);
}

main().catch(err => {
    console.error('\n❌ Falha ao consultar o banco:', err.message);
    process.exit(1);
});
