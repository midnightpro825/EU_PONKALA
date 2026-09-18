const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const serverDir = path.join(__dirname, '..');
const dbPath = path.join(serverDir, '..', 'Database', 'eu_ponkala.db');
const migFile = path.join(serverDir, 'migrations', '003_wheelbarrow.sql');
const backupPath = dbPath + '.pre-migration-003-' + Date.now();

console.log('=== EU PONKALA Migration 003 (Wheelbarrow) ===');
if (!fs.existsSync(dbPath)) { console.error('DB not found.'); process.exit(1); }
fs.copyFileSync(dbPath, backupPath);
console.log('Backup:', backupPath);

const sql = fs.readFileSync(migFile, 'utf8');
const db = new sqlite3.Database(dbPath);
db.exec(sql, (err) => {
    if (err) {
        console.error('MIGRATION 003 FAILED:', err.message);
        console.error('Restore: copy "' + backupPath + '" "' + dbPath + '"');
        process.exit(1);
    }
    console.log('SQL applied.');
    db.all(`SELECT COUNT(*) AS c FROM engine_wheelbarrow_pricing`, [], (e, r) => {
        if (e) { console.error(e.message); process.exit(1); }
        console.log('  engine_wheelbarrow_pricing ', r.c, 'row(s)');
        console.log('\nMigration 003: SUCCESS');
        db.close();
    });
});
