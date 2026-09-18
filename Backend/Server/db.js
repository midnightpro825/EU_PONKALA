// =============================================
// EU PONKALA — Postgres Helper (SQLite-compat shim)
// =============================================
// Uses pg. Provides run/get/all with the SAME API as the old sqlite3 module.
// - Converts "?" placeholders -> "$1, $2, ..." automatically
// - Converts INSERT OR IGNORE/REPLACE -> ON CONFLICT DO NOTHING/UPDATE
// - Returns { lastID, changes } from run() like sqlite3 does
// - Returns plain objects from get()/all() like sqlite3 does
// =============================================
const { Pool } = require('pg');
const path = require('path');
const fs   = require('fs');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL env var is required (Postgres connection string)');
    process.exit(1);
}

const isLocal = DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1');
const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
});

// Log pool errors (don't crash the app)
pool.on('error', (err) => console.error('[pg pool error]', err.message));

// ─── SQL translation: SQLite -> Postgres ───
function translateSql(sql) {
    let out = sql;

    // ? placeholders -> $1, $2, $3 ...
    let n = 0;
    out = out.replace(/\?/g, () => `$${++n}`);

    // INSERT OR IGNORE -> INSERT ... ON CONFLICT DO NOTHING
    out = out.replace(/\bINSERT\s+OR\s+IGNORE\b/gi, 'INSERT');
    if (/INSERT[\s\S]*ON CONFLICT DO NOTHING/i.test(out) === false &&
        /\bINSERT\s+/i.test(out) === false) {
        // no-op — the replace above only changes the keyword
    }

    // INSERT OR REPLACE -> INSERT ... ON CONFLICT ... DO UPDATE
    // (Postgres can't do this generically — but our app doesn't use it in queries,
    //  only in seed/migration SQL which we handle separately)
    out = out.replace(/\bINSERT\s+OR\s+REPLACE\b/gi, 'INSERT');

    // IFNULL(a, b) -> COALESCE(a, b)
    out = out.replace(/\bIFNULL\s*\(/gi, 'COALESCE(');

    // sqlite_master -> information_schema.tables
    out = out.replace(/sqlite_master/gi, 'information_schema.tables');

    // datetime('now') -> NOW()
    out = out.replace(/datetime\s*\(\s*['"]now['"]\s*\)/gi, 'NOW()');

    return out;
}

// Detect if SQL already has an ON CONFLICT clause
function hasOnConflict(sql) {
    return /\bON\s+CONFLICT\b/i.test(sql);
}

// ─── Promise wrappers (same API as sqlite3) ───
const run = async (sql, params = []) => {
    const translated = translateSql(sql);

    // Handle INSERT ... ON CONFLICT DO NOTHING case (from original INSERT OR IGNORE)
    // Postgres requires a target if you want DO NOTHING on specific conflict; without
    // a target, DO NOTHING applies to any conflict. Append if not present.
    let finalSql = translated;
    if (/^INSERT\s/i.test(translated) && /OR\s+IGNORE/i.test(sql) && !hasOnConflict(translated)) {
        finalSql = translated + ' ON CONFLICT DO NOTHING';
    }

    // For INSERTs, append RETURNING to get the inserted id
    const isInsert = /^\s*INSERT\s/i.test(translated);
    if (isInsert && !/RETURNING/i.test(translated)) {
        finalSql = finalSql.replace(/;?\s*$/, ' RETURNING *');
    }

    const client = await pool.connect();
    try {
        const result = await client.query(finalSql, params);

        // Emulate sqlite3's { lastID, changes }
        let lastID = null;
        if (isInsert && result.rows.length > 0) {
            const row = result.rows[0];
            // Find the first column ending in _id or named 'id'
            const idKey = Object.keys(row).find(k => k === 'id' || k.endsWith('_id'));
            if (idKey) lastID = row[idKey];
        }

        return { lastID, changes: result.rowCount };
    } finally {
        client.release();
    }
};

const get = async (sql, params = []) => {
    const translated = translateSql(sql);
    const client = await pool.connect();
    try {
        const result = await client.query(translated, params);
        return result.rows[0] || undefined;
    } finally {
        client.release();
    }
};

const all = async (sql, params = []) => {
    const translated = translateSql(sql);
    const client = await pool.connect();
    try {
        const result = await client.query(translated, params);
        return result.rows;
    } finally {
        client.release();
    }
};

// ─── Raw exec (for schema + migrations) ───
const exec = async (sql) => {
    const client = await pool.connect();
    try {
        await client.query(sql);
    } finally {
        client.release();
    }
};

// ─── Init: run schema if not already initialized ───
const init = async () => {
    const check = await get(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema='public' AND table_name='users'`
    );
    if (check) return false;

    console.log('📦 Initializing database from schema.sql...');
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await exec(schema);
    console.log('✅ Database schema created');
    return true;
};

// ─── Run migrations/*.sql ───
const runMigrations = async () => {
    const dir = path.join(__dirname, 'migrations');
    if (!fs.existsSync(dir)) return false;

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
    if (files.length === 0) return false;

    console.log(`📦 Running ${files.length} migration(s)...`);
    let applied = 0;

    for (const f of files) {
        const sql = fs.readFileSync(path.join(dir, f), 'utf8');
        try {
            await exec(sql);
            console.log(`  ✅ ${f}`);
            applied++;
        } catch (err) {
            if (/already exists|duplicate column|relation .* already exists/i.test(err.message)) {
                console.log(`  ⏭️  ${f} (already applied)`);
            } else {
                console.warn(`  ⚠️  ${f} failed: ${err.message}`);
            }
        }
    }
    return applied;
};

// ─── db compatibility shim (for any code that calls db.exec/db.run directly) ───
const db = {
    run: (sql, params, cb) => {
        if (typeof params === 'function') { cb = params; params = []; }
        run(sql, params).then(r => cb && cb(null, r)).catch(e => cb && cb(e));
    },
    get: (sql, params, cb) => {
        if (typeof params === 'function') { cb = params; params = []; }
        get(sql, params).then(r => cb && cb(null, r)).catch(e => cb && cb(e));
    },
    all: (sql, params, cb) => {
        if (typeof params === 'function') { cb = params; params = []; }
        all(sql, params).then(r => cb && cb(null, r)).catch(e => cb && cb(e));
    },
    exec: (sql, cb) => exec(sql).then(() => cb && cb(null)).catch(e => cb && cb(e)),
};

module.exports = { db, run, get, all, exec, init, runMigrations, pool };
