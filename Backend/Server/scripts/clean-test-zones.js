const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '..', '..', 'Database', 'eu_ponkala.db');
const db = new sqlite3.Database(dbPath);
db.serialize(() => {
    db.run(`DELETE FROM landmarks WHERE name = 'Test Landmark' OR name LIKE 'Test Landmark%'`, function(e1) {
        if (e1) console.error('landmarks:', e1.message);
        else console.log('  Deleted ' + this.changes + ' test landmarks');
        db.run(`DELETE FROM zones WHERE zone_code LIKE 'Z9%' OR zone_code = 'Z7' OR zone_name LIKE 'TEST Zone%'`, function(e2) {
            if (e2) console.error('zones:', e2.message);
            else console.log('  Deleted ' + this.changes + ' test zones');
            db.close();
        });
    });
});
