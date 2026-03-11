import Database from 'better-sqlite3';

const db = new Database('./data/meliflow.db');

console.log('🔍 Contas Instagram atuais:');
const accounts = db.prepare('SELECT * FROM instagram_accounts').all();
console.table(accounts);

console.log('\n🗑️  Removendo todas as contas...');
db.prepare('DELETE FROM instagram_accounts').run();

console.log('✅ Todas as contas foram removidas!');
console.log('\nAgora você pode adicionar a nova conta com o token correto.');

db.close();
