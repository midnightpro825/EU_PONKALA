const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '..', '..', 'Database', 'eu_ponkala.db');
const db = new sqlite3.Database(dbPath);
db.run(`DELETE FROM wallet_transactions
        WHERE reference LIKE 'TEST-%' OR reference LIKE 'HOLD-999%'
        OR reference LIKE 'RELEASE-999%' OR reference LIKE 'COMM-999%'`, function (err) {
    if (err) { console.error(err); process.exit(1); }
    console.log('Deleted ' + this.changes + ' test rows.');
    db.close();
});
