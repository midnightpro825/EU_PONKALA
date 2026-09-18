// scripts/run-migration.js
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const serverDir  = path.join(__dirname, '..');
const dbPath     = path.join(serverDir, '..', 'Database', 'eu_ponkala.db');
const migFile    = path.join(serverDir, 'migrations', '001_core.sql');
const backupPath = dbPath + '.pre-migration-' + Date.now();

console.log('=== EU PONKALA Migration 001 ===');
console.log('DB   :', dbPath);

if (!fs.existsSync(dbPath)) { console.error('DB not found.'); process.exit(1); }
fs.copyFileSync(dbPath, backupPath);
console.log('Backup:', backupPath);

const db = new sqlite3.Database(dbPath);

// Columns to add to existing service_orders
const newColumns = [
    ['order_code',              'TEXT'],
    ['pickup_zone_id',          'INTEGER'],
    ['pickup_landmark_id',      'INTEGER'],
    ['destination_zone_id',     'INTEGER'],
    ['destination_landmark_id', 'INTEGER'],
    ['pickup_gps_lat',          'REAL'],
    ['pickup_gps_lng',          'REAL'],
    ['destination_gps_lat',     'REAL'],
    ['destination_gps_lng',     'REAL'],
    ['pickup_address_text',     'TEXT'],
    ['destination_address_text','TEXT'],
    ['instructions',            'TEXT'],
    ['completion_code_used',    'INTEGER DEFAULT 0'],
    ['connection_held',         'INTEGER DEFAULT 0'],
    ['commission_held',         'INTEGER DEFAULT 0'],
    ['commission_deducted',     'INTEGER DEFAULT 0'],
    ['accepted_at',             'DATETIME'],
    ['completed_at',            'DATETIME'],
    ['cancelled_at',            'DATETIME'],
    ['auto_complete_at',        'DATETIME'],
    ['dispute_info',            'TEXT']
];

db.serialize(() => {
    const sql = fs.readFileSync(migFile, 'utf8');
    db.exec(sql, (err) => {
        if (err) {
            console.error('MAIN MIGRATION FAILED:', err.message);
            console.error('Restore: copy "' + backupPath + '" "' + dbPath + '"');
            process.exit(1);
        }
        console.log('Main SQL applied.');

        let i = 0, added = 0, skipped = 0;
        const nextCol = () => {
            if (i >= newColumns.length) return verify();
            const [name, type] = newColumns[i++];
            db.run(`ALTER TABLE service_orders ADD COLUMN ${name} ${type}`, (e) => {
                if (e) {
                    if (/duplicate column/i.test(e.message)) skipped++;
                    else console.log(`  ALTER ${name}: ERROR ${e.message}`);
                } else {
                    added++;
                    console.log(`  ALTER service_orders.${name}: added`);
                }
                nextCol();
            });
        };
        nextCol();

        function verify() {
            console.log(`\nALTER results: ${added} added, ${skipped} already-present`);
            console.log('\n=== VERIFYING ===');
            const checks = [
                ['zones',                 'SELECT COUNT(*) AS c FROM zones'],
                ['landmarks',             'SELECT COUNT(*) AS c FROM landmarks'],
                ['provider_availability', 'SELECT COUNT(*) AS c FROM provider_availability'],
                ['order_items',           'SELECT COUNT(*) AS c FROM order_items'],
                ['order_holds',           'SELECT COUNT(*) AS c FROM order_holds'],
                ['completion_codes',      'SELECT COUNT(*) AS c FROM completion_codes'],
                ['sms_logs',              'SELECT COUNT(*) AS c FROM sms_logs'],
                ['engine_config',         'SELECT COUNT(*) AS c FROM engine_config']
            ];
            let j = 0;
            const nextCheck = () => {
                if (j >= checks.length) {
                    db.all(`PRAGMA table_info(service_orders)`, [], (e, cols) => {
                        if (!e) {
                            const names = cols.map(c => c.name);
                            const wanted = ['order_code','pickup_zone_id','completion_code_used','connection_held','commission_held','commission_deducted'];
                            const missing = wanted.filter(w => !names.includes(w));
                            console.log('\n  service_orders new columns: ' + (missing.length ? 'MISSING ' + missing.join(', ') : 'all present'));
                        }
                        console.log('\nMigration 001: SUCCESS');
                        db.close();
                    });
                    return;
                }
                const [label, q] = checks[j++];
                db.get(q, [], (e, r) => {
                    if (e) console.log(`  ${label} → ERROR: ${e.message}`);
                    else    console.log(`  ${label} → ${r.c} rows`);
                    nextCheck();
                });
            };
            nextCheck();
        }
    });
});