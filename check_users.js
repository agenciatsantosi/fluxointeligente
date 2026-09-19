import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'data', 'fluxointeligente.db');

const db = new Database(dbPath);

try {
    const tableInfo = db.prepare("PRAGMA table_info(users)").all();
    console.log('Users Table Columns:', tableInfo.map(c => c.name));

    const users = db.prepare("SELECT * FROM users").all();
    console.log('Users:', users);
} catch (error) {
    console.error('Error:', error);
}
