import db from './services/database.js';

const schedules = db.prepare('SELECT * FROM schedules').all();
console.log(JSON.stringify(schedules, null, 2));
