// engine/notifications.js
// Matches the existing notifications table:
//   notification_id, user_id, type, title, body, link, is_read, created_at
const db = require('./db');

async function enqueue(userId, type, title, body, deepLink) {
    if (!userId) return null;
    const r = await db.run(
        `INSERT INTO notifications (user_id, type, title, body, link)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, type || 'generic', title || '', body || null, deepLink || null]
    );
    return { notification_id: r.lastID };
}

async function markRead(notificationId) {
    await db.run(
        `UPDATE notifications SET is_read = 1 WHERE notification_id = ?`,
        [notificationId]
    );
    return { notification_id: notificationId, is_read: 1 };
}

async function markAllRead(userId) {
    await db.run(
        `UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`,
        [userId]
    );
    return { user_id: userId, all_read: true };
}

async function getUnread(userId, limit) {
    const rows = await db.all(
        `SELECT * FROM notifications WHERE user_id = ? AND is_read = 0
         ORDER BY created_at DESC LIMIT ?`,
        [userId, limit || 50]
    );
    // Normalize field names for callers expecting notification_type/deep_link
    return rows.map(r => ({ ...r, notification_type: r.type, deep_link: r.link }));
}

async function getAll(userId, limit) {
    const rows = await db.all(
        `SELECT * FROM notifications WHERE user_id = ?
         ORDER BY created_at DESC LIMIT ?`,
        [userId, limit || 100]
    );
    return rows.map(r => ({ ...r, notification_type: r.type, deep_link: r.link }));
}

async function countUnread(userId) {
    const r = await db.get(
        `SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0`,
        [userId]
    );
    return r ? r.n : 0;
}

module.exports = { enqueue, markRead, markAllRead, getUnread, getAll, countUnread };
