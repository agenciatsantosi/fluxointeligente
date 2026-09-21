import db from './services/database.js';

console.log('Checking database schema...');

try {
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='twitter_accounts'").get();
    if (table) {
        console.log('✅ Table twitter_accounts exists.');
        const columns = db.prepare("PRAGMA table_info(twitter_accounts)").all();
        console.log('Columns:', columns.map(c => c.name).join(', '));

        const accounts = db.prepare("SELECT * FROM twitter_accounts").all();
        console.log(`Found ${accounts.length} accounts.`);
        accounts.forEach(acc => console.log(`- @${acc.username} (ID: ${acc.id})`));
    } else {
        console.error('❌ Table twitter_accounts does NOT exist.');
    }
} catch (error) {
    console.error('Error checking DB:', error);
}
