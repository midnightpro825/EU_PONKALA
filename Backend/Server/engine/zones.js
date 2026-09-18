// engine/zones.js - Zone + landmark helpers
const { get, all } = require('./db');

async function getAllZones(includeInactive) {
    const sql = includeInactive
        ? `SELECT * FROM zones ORDER BY sort_order, zone_id`
        : `SELECT * FROM zones WHERE is_active = 1 ORDER BY sort_order, zone_id`;
    return all(sql);
}

async function getZoneById(zoneId) {
    return get(`SELECT * FROM zones WHERE zone_id = ?`, [zoneId]);
}

async function getZoneByCode(code) {
    return get(`SELECT * FROM zones WHERE zone_code = ?`, [code]);
}

async function getLandmarksInZone(zoneId, includeInactive) {
    const sql = includeInactive
        ? `SELECT * FROM landmarks WHERE zone_id = ? ORDER BY type, sort_order, landmark_id`
        : `SELECT * FROM landmarks WHERE zone_id = ? AND is_active = 1 ORDER BY type, sort_order, landmark_id`;
    return all(sql, [zoneId]);
}

async function getLandmarkById(landmarkId) {
    return get(`SELECT * FROM landmarks WHERE landmark_id = ?`, [landmarkId]);
}

// Validate that a landmark belongs to a zone (for order creation).
async function validateLandmarkInZone(zoneId, landmarkId) {
    if (!zoneId || !landmarkId) return false;
    const row = await get(
        `SELECT landmark_id FROM landmarks WHERE landmark_id = ? AND zone_id = ? AND is_active = 1`,
        [landmarkId, zoneId]
    );
    return !!row;
}

// ---------- Admin CRUD ----------
async function createZone({ zone_code, zone_name, description, sort_order }) {
    if (!zone_code || !zone_name) throw new Error('zone_code and zone_name required');
    const { run } = require('./db');
    const result = await run(
        `INSERT INTO zones (zone_code, zone_name, description, sort_order) VALUES (?, ?, ?, ?)`,
        [zone_code, zone_name, description || null, sort_order || 0]
    );
    return getZoneById(result.lastID);
}

async function updateZone(zoneId, fields) {
    const { run } = require('./db');
    const allowed = ['zone_code', 'zone_name', 'description', 'is_active', 'sort_order'];
    const sets = [], vals = [];
    for (const k of allowed) {
        if (fields[k] !== undefined) { sets.push(k + ' = ?'); vals.push(fields[k]); }
    }
    if (!sets.length) throw new Error('no fields to update');
    vals.push(zoneId);
    await run(`UPDATE zones SET ${sets.join(', ')} WHERE zone_id = ?`, vals);
    return getZoneById(zoneId);
}

async function deactivateZone(zoneId) {
    return updateZone(zoneId, { is_active: 0 });
}

async function createLandmark({ zone_id, type, name, aliases, sort_order }) {
    if (!zone_id || !name) throw new Error('zone_id and name required');
    const zone = await getZoneById(zone_id);
    if (!zone) throw new Error('zone not found');
    const { run } = require('./db');
    const result = await run(
        `INSERT INTO landmarks (zone_id, type, name, aliases, sort_order) VALUES (?, ?, ?, ?, ?)`,
        [zone_id, type || 'LANDMARK', name, aliases || null, sort_order || 0]
    );
    return getLandmarkById(result.lastID);
}

async function updateLandmark(landmarkId, fields) {
    const { run } = require('./db');
    const allowed = ['zone_id', 'type', 'name', 'aliases', 'is_active', 'sort_order'];
    const sets = [], vals = [];
    for (const k of allowed) {
        if (fields[k] !== undefined) { sets.push(k + ' = ?'); vals.push(fields[k]); }
    }
    if (!sets.length) throw new Error('no fields to update');
    vals.push(landmarkId);
    await run(`UPDATE landmarks SET ${sets.join(', ')} WHERE landmark_id = ?`, vals);
    return getLandmarkById(landmarkId);
}

async function deactivateLandmark(landmarkId) {
    return updateLandmark(landmarkId, { is_active: 0 });
}

module.exports = {
    getAllZones, getZoneById, getZoneByCode,
    getLandmarksInZone, getLandmarkById, validateLandmarkInZone,
    createZone, updateZone, deactivateZone,
    createLandmark, updateLandmark, deactivateLandmark
};
