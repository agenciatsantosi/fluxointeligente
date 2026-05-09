import * as db from './services/database.js';
db.query('SELECT * FROM schedules WHERE platform=\'telegram\' ORDER BY id DESC LIMIT 1')
  .then(res => { console.log(JSON.stringify(res.rows, null, 2)); process.exit(0); })
  .catch(console.error);
