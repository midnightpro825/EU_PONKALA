const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const serverDir = path.join(__dirname, '..');
const dbPath = path.join(serverDir, '..', 'Database', 'eu_ponkala.db');
const migFile = path.join(serverDir, 'migrations', '002_laundry.sql');
const backupPath = dbPath + '.pre-migration-002-' + Date.now();

console.log('=== EU PONKALA Migration 002 (Laundry) ===');
if (!fs.existsSync(dbPath)) { console.error('DB not found.'); process.exit(1); }
fs.copyFileSync(dbPath, backupPath);
console.log('Backup:', backupPath);

const sql = fs.readFileSync(migFile, 'utf8');
const db = new sqlite3.Database(dbPath);
db.exec(sql, (err) => {
    if (err) {
        console.error('MIGRATION 002 FAILED:', err.message);
        console.error('Restore: copy "' + backupPath + '" "' + dbPath + '"');
        process.exit(1);
    }
    console.log('SQL applied.');
    db.all(`SELECT COUNT(*) AS c FROM laundry_items`, [], (e, r) => {
        if (e) { console.error(e.message); process.exit(1); }
        console.log('  laundry_items ', r.c, 'rows');
        db.all(`SELECT COUNT(*) AS c FROM laundry_access`, [], (e2, r2) => {
            if (e2) { console.error(e2.message); process.exit(1); }
            console.log('  laundry_access ', r2.c, 'rows');
            console.log('\nMigration 002: SUCCESS');
            db.close();
        });
    });
});
