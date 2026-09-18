// engine/audit.js
const { run, get, all } = require('./db');

// log(action, entityType, entityId, previousValue, newValue, actorUserId, notes)
// The existing audit_logs table has a `details` column instead of
// separate previous_value/new_value columns. We serialize everything
// into `details` as JSON so the doc's data is preserved.
async function log(action, entityType, entityId, previousValue, newValue, actorUserId, notes) {
    const payload = {
        previous: previousValue || null,
        new: newValue || null,
        notes: notes || null,
        at: new Date().toISOString()
    };
    const details = JSON.stringify(payload);

    const r = await run(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
         VALUES (?, ?, ?, ?, ?)`,
        [actorUserId || null, action, entityType || null, entityId || null, details]
    );
    return { log_id: r.lastID };
}

async function listRecentLogs(limit, filters) {
    const f = filters || {};
    const where = [];
    const params = [];
    if (f.action)      { where.push('action = ?');      params.push(f.action); }
    if (f.entity_type) { where.push('entity_type = ?'); params.push(f.entity_type); }
    if (f.user_id)     { where.push('user_id = ?');     params.push(f.user_id); }
    const sql = `SELECT * FROM audit_logs
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY log_id DESC LIMIT ?`;
    params.push(limit || 100);

    const rows = await all(sql, params);
    // Parse details JSON for convenience
    return rows.map(r => {
        let parsed = {};
        try { parsed = JSON.parse(r.details || '{}'); } catch (e) {}
        return { ...r, previous_value: parsed.previous, new_value: parsed.new, notes: parsed.notes };
    });
}

async function getLogsForEntity(entityType, entityId) {
    const rows = await all(
        `SELECT * FROM audit_logs WHERE entity_type = ? AND entity_id = ?
         ORDER BY log_id DESC`,
        [entityType, entityId]
    );
    return rows.map(r => {
        let parsed = {};
        try { parsed = JSON.parse(r.details || '{}'); } catch (e) {}
        return { ...r, previous_value: parsed.previous, new_value: parsed.new, notes: parsed.notes };
    });
}

module.exports = { log, listRecentLogs, getLogsForEntity };
