import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'data', 'fluxointeligente.db');

const db = new Database(dbPath);

try {
    const userId = 3; // thiago santosi 02
    const result = db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(userId);
    console.log(`Updated user ${userId} role to admin. Changes: ${result.changes}`);

    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    console.log('Updated User:', user);
} catch (error) {
    console.error('Error:', error);
}
