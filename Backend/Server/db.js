// =============================================
// EU PONKALA — SQLite Helper (promise-based)
// =============================================
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.join(__dirname, '..', 'Database', 'eu_ponkala.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

// Ensure Database directory exists
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new sqlite3.Database(DB_PATH);

// Enable foreign keys
db.run('PRAGMA foreign_keys = ON');

// ─── Promise wrappers ───
const run = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
    });
});

const get = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
    });
});

const all = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
    });
});

// ─── Init: run schema if tables don't exist ───
const init = () => new Promise((resolve, reject) => {
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='users'", (err, row) => {
        if (err) return reject(err);
        if (row) return resolve(false); // already initialized

        console.log('📦 Initializing database from schema.sql...');
        const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
        db.exec(schema, (err) => {
            if (err) return reject(err);
            console.log('✅ Database schema created');
            resolve(true);
        });
    });
});

// ─── Run migrations/*.sql on startup (idempotent) ───
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const runMigrations = () => new Promise((resolve) => {
    if (!fs.existsSync(MIGRATIONS_DIR)) return resolve(false);

    const files = fs.readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith('.sql'))
        .sort();

    if (files.length === 0) return resolve(false);

    console.log(`📦 Running ${files.length} migration(s)...`);
    let pending = files.length;
    let applied = 0;

    files.forEach(f => {
        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
        db.exec(sql, (err) => {
            if (err) {
                // Tolerate common idempotency errors
                if (/duplicate column|already exists/i.test(err.message)) {
                    console.log(`  ⏭️  ${f} (already applied)`);
                } else {
                    console.warn(`  ⚠️  ${f} failed: ${err.message}`);
                }
            } else {
                console.log(`  ✅ ${f}`);
                applied++;
            }
            if (--pending === 0) resolve(applied);
        });
    });
});

module.exports = { db, run, get, all, init, runMigrations, DB_PATH };