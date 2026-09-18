// engine/config-store.js
// Reads config from engine_config table, falls back to config.js defaults.
// Writes are audited. In-memory cache refreshed on write.
const db = require('./db');
const defaults = require('./config');
const audit = require('./audit');

let cache = null;
let cacheLoaded = false;

async function load() {
    const rows = await db.all(`SELECT config_key, config_value FROM engine_config`);
    const map = {};
    Object.keys(defaults).forEach(k => { map[k] = defaults[k]; });
    for (const r of rows) {
        let v = r.config_value;
        if (v === 'true') v = true;
        else if (v === 'false') v = false;
        else if (!isNaN(v) && v !== '') v = Number(v);
        map[r.config_key] = v;
    }
    cache = map;
    cacheLoaded = true;
    return cache;
}

async function readConfig(key) {
    if (!cacheLoaded) await load();
    return cache[key];
}

async function readAllConfig() {
    if (!cacheLoaded) await load();
    return { ...cache };
}

function serialize(v) {
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'object' && v !== null) return JSON.stringify(v);
    return String(v);
}

async function writeConfig(key, value, adminUserId) {
    if (!cacheLoaded) await load();
    const before = cache[key];
    const serialized = serialize(value);

    const existing = await db.get(`SELECT config_key FROM engine_config WHERE config_key = ?`, [key]);
    if (existing) {
        await db.run(
            `UPDATE engine_config SET config_value = ?, updated_at = CURRENT_TIMESTAMP WHERE config_key = ?`,
            [serialized, key]
        );
    } else {
        await db.run(
            `INSERT INTO engine_config (config_key, config_value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`,
            [key, serialized]
        );
    }

    cache[key] = value;
    await audit.log('UPDATE_CONFIG', 'CONFIG', null, { [key]: before }, { [key]: value }, adminUserId, 'Changed ' + key);
    return { key, value };
}

async function bulkSet(obj, adminUserId) {
    const results = [];
    for (const k of Object.keys(obj)) {
        results.push(await writeConfig(k, obj[k], adminUserId));
    }
    return results;
}

async function resetAll(adminUserId) {
    const keys = Object.keys(defaults);
    for (const k of keys) {
        await writeConfig(k, defaults[k], adminUserId);
    }
    return { reset: true, keys: keys.length };
}

module.exports = {
    load,
    get: readConfig,
    getAll: readAllConfig,
    set: writeConfig,
    bulkSet,
    reset: resetAll
};
