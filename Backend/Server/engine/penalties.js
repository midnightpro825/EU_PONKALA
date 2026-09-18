// engine/penalties.js
const { run, get, all } = require('./db');

// Escalation: level 1 ??? warning, 2 ??? 7-day suspension, 3 ??? ban
function escalationFor(level) {
    if (level >= 3) return { suspended_until: null, is_banned: 1 };
    if (level === 2) {
        const until = new Date(Date.now() + 7*24*60*60*1000).toISOString();
        return { suspended_until: until, is_banned: 0 };
    }
    return { suspended_until: null, is_banned: 0 };
}

async function getStanding(subjectType, subjectId) {
    let s = await get(
        `SELECT * FROM engine_subject_standing WHERE subject_type = ? AND subject_id = ?`,
        [subjectType, subjectId]
    );
    if (!s) {
        const r = await run(
            `INSERT INTO engine_subject_standing (subject_type, subject_id, level, is_banned) VALUES (?, ?, 0, 0)`,
            [subjectType, subjectId]
        );
        s = await get(`SELECT * FROM engine_subject_standing WHERE standing_id = ?`, [r.lastID]);
    }
    return s;
}

async function recordOffense(subjectType, subjectId, offenseType, notes) {
    const current = await getStanding(subjectType, subjectId);
    const newLevel = Math.min(3, (current.level || 0) + 1);
    const esc = escalationFor(newLevel);

    const r = await run(
        `INSERT INTO engine_penalties (subject_type, subject_id, offense_type, level, notes, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [subjectType, subjectId, offenseType, newLevel, notes || null, esc.suspended_until]
    );

    await run(
        `UPDATE engine_subject_standing
         SET level = ?, suspended_until = ?, is_banned = ?, updated_at = CURRENT_TIMESTAMP
         WHERE subject_type = ? AND subject_id = ?`,
        [newLevel, esc.suspended_until, esc.is_banned, subjectType, subjectId]
    );

    return {
        penalty_id: r.lastID,
        subject_type: subjectType,
        subject_id: subjectId,
        offense_type: offenseType,
        new_level: newLevel,
        suspended_until: esc.suspended_until,
        is_banned: !!esc.is_banned
    };
}

async function isProviderSuspended(providerId) {
    const s = await getStanding('PROVIDER', providerId);
    if (s.is_banned) return { suspended: true, reason: 'banned', until: null };
    if (s.suspended_until && new Date(s.suspended_until) > new Date()) {
        return { suspended: true, reason: 'temporary', until: s.suspended_until };
    }
    return { suspended: false };
}

async function isStudentSuspended(userId) {
    const s = await getStanding('STUDENT', userId);
    if (s.is_banned) return { suspended: true, reason: 'banned', until: null };
    if (s.suspended_until && new Date(s.suspended_until) > new Date()) {
        return { suspended: true, reason: 'temporary', until: s.suspended_until };
    }
    return { suspended: false };
}

async function listRecentPenalties(limit) {
    return all(`SELECT * FROM engine_penalties ORDER BY penalty_id DESC LIMIT ?`, [limit || 100]);
}

async function listSuspended() {
    return all(
        `SELECT * FROM engine_subject_standing
         WHERE is_banned = 1 OR (suspended_until IS NOT NULL AND suspended_until > CURRENT_TIMESTAMP)
         ORDER BY updated_at DESC`
    );
}

async function clearPenalty(penaltyId, adminUserId) {
    const p = await get(`SELECT * FROM engine_penalties WHERE penalty_id = ?`, [penaltyId]);
    if (!p) throw new Error('penalty not found');
    await run(`DELETE FROM engine_penalties WHERE penalty_id = ?`, [penaltyId]);
    // Recompute standing from remaining penalties
    const remaining = await get(
        `SELECT COUNT(*) AS n, MAX(level) AS maxLevel FROM engine_penalties WHERE subject_type = ? AND subject_id = ?`,
        [p.subject_type, p.subject_id]
    );
    const newLevel = remaining.n > 0 ? (remaining.maxLevel || 1) : 0;
    const esc = escalationFor(newLevel);
    await run(
        `UPDATE engine_subject_standing
         SET level = ?, suspended_until = ?, is_banned = ?, updated_at = CURRENT_TIMESTAMP
         WHERE subject_type = ? AND subject_id = ?`,
        [newLevel, esc.suspended_until, esc.is_banned, p.subject_type, p.subject_id]
    );
    return { cleared: true, new_level: newLevel };
}

module.exports = {
    getStanding,
    recordOffense,
    isProviderSuspended,
    isStudentSuspended,
    listRecentPenalties,
    listSuspended,
    clearPenalty
};
