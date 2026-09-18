const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const serverDir = path.join(__dirname, '..');
const dbPath = path.join(serverDir, '..', 'Database', 'eu_ponkala.db');
const migFile = path.join(serverDir, 'migrations', '004_penalties.sql');
const backupPath = dbPath + '.pre-migration-004-' + Date.now();
console.log('=== Migration 004 (Penalties) ===');
if (!fs.existsSync(dbPath)) { console.error('DB not found.'); process.exit(1); }
fs.copyFileSync(dbPath, backupPath);
console.log('Backup:', backupPath);
const sql = fs.readFileSync(migFile, 'utf8');
const db = new sqlite3.Database(dbPath);
db.exec(sql, (err) => {
    if (err) { console.error('FAILED:', err.message); process.exit(1); }
    console.log('SQL applied.');
    db.all(`SELECT COUNT(*) AS c FROM engine_penalties`, [], (e, r) => {
        if (e) { console.error(e.message); process.exit(1); }
        console.log('  engine_penalties ???', r.c, 'rows');
        db.all(`SELECT COUNT(*) AS c FROM engine_subject_standing`, [], (e2, r2) => {
            if (e2) { console.error(e2.message); process.exit(1); }
            console.log('  engine_subject_standing ???', r2.c, 'rows');
            console.log('\nMigration 004: SUCCESS');
            db.close();
        });
    });
});
