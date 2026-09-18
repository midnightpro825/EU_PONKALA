// engine/notify.js - Notification dispatcher (mock SMS)
const { run, get, all } = require('./db');
const config = require('./config');

// Log an outbound SMS (writes to sms_logs table + prints to console).
async function logSms(direction, phone, body, opts) {
    const { provider_id, order_id, status } = opts || {};
    if (config.mock_sms) {
        console.log(`[SMS ${direction}] to=${phone} body="${body}"`);
    }
    const result = await run(
        `INSERT INTO sms_logs (direction, phone, body, provider_id, order_id, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [direction, phone, body, provider_id || null, order_id || null, status || 'SENT']
    );
    return { sms_id: result.lastID, direction, phone, body };
}

// Format a zone+landmark into human text: "Zone 5, behind Eden University"
async function formatLocation(zoneId, landmarkId) {
    if (!zoneId) return 'unknown';
    const zone = await get(`SELECT zone_code, zone_name FROM zones WHERE zone_id = ?`, [zoneId]);
    let text = zone ? `${zone.zone_code}, ${zone.zone_name}` : `zone ${zoneId}`;
    if (landmarkId) {
        const lm = await get(`SELECT name FROM landmarks WHERE landmark_id = ?`, [landmarkId]);
        if (lm) text = `${zone ? zone.zone_code : 'zone ' + zoneId}  ${lm.name}`;
    }
    return text;
}

// --- Provider: New job ---
async function notifyProviderNewJob(providerId, order) {
    const provider = await get(`SELECT * FROM providers WHERE id = ?`, [providerId]);
    if (!provider) return null;
    const student = await get(`SELECT full_name, phone FROM users WHERE user_id = ?`, [order.customer_user_id]);
    const location = await formatLocation(order.pickup_zone_id, order.pickup_landmark_id);

    const studentName = student ? student.full_name.split(' ')[0] : 'Student';
    const studentPhone = student ? student.phone : 'unknown';
    const commission = Number(order.commission || 0);

    const body = `New job ${order.order_code}. ${studentName}, ${studentPhone}. Pickup: ${location}. Cash K${order.price}. Commission K${commission}. Reply YES ${order.order_code} to accept.`;

    return logSms('OUT', provider.phone, body, {
        provider_id: providerId,
        order_id: order.id,
        status: 'SENT'
    });
}

// --- Provider: Completion code to give student ---
async function notifyProviderCompletionCode(providerId, order, code) {
    const provider = await get(`SELECT * FROM providers WHERE id = ?`, [providerId]);
    if (!provider) return null;
    const student = await get(`SELECT full_name FROM users WHERE user_id = ?`, [order.customer_user_id]);
    const studentName = student ? student.full_name.split(' ')[0] : 'Student';

    const body = `Job ${order.order_code} done. Give this code to ${studentName}: ${code}.`;
    return logSms('OUT', provider.phone, body, {
        provider_id: providerId, order_id: order.id, status: 'SENT'
    });
}

// --- Provider: Commission deducted ---
async function notifyProviderCommissionDeducted(providerId, order, amount, newBalance) {
    const provider = await get(`SELECT * FROM providers WHERE id = ?`, [providerId]);
    if (!provider) return null;
    const body = `Job ${order.order_code} completed. Commission K${amount} deducted. Wallet balance: K${newBalance}.`;
    return logSms('OUT', provider.phone, body, {
        provider_id: providerId, order_id: order.id, status: 'SENT'
    });
}

// --- Provider: Welcome credit exhausted ---
async function notifyProviderWelcomeExhausted(providerId) {
    const provider = await get(`SELECT * FROM providers WHERE id = ?`, [providerId]);
    if (!provider) return null;
    const body = `Your K60 Welcome Commission Credit has been fully used. Top up your Commission Wallet to continue receiving jobs.`;
    return logSms('OUT', provider.phone, body, { provider_id: providerId, status: 'SENT' });
}

// --- Student: Status updates ---
async function notifyStudent(userId, message, orderId) {
    const user = await get(`SELECT * FROM users WHERE user_id = ?`, [userId]);
    if (!user || !user.phone) return null;
    return logSms('OUT', user.phone, message, { order_id: orderId, status: 'SENT' });
}

async function notifyStudentProviderAssigned(userId, order, provider) {
    const msg = `Order ${order.order_code}: Provider assigned  ${provider.full_name} (${provider.phone}). They are verified.`;
    return notifyStudent(userId, msg, order.id);
}

async function notifyStudentCompleted(userId, order) {
    const msg = `Order ${order.order_code} completed. Thank you!`;
    return notifyStudent(userId, msg, order.id);
}

// --- Convenience: get log ---
async function getSmsLog(limit) {
    return all(`SELECT * FROM sms_logs ORDER BY sms_id DESC LIMIT ?`, [limit || 100]);
}

async function getSmsForPhone(phone, limit) {
    return all(`SELECT * FROM sms_logs WHERE phone = ? ORDER BY sms_id DESC LIMIT ?`, [phone, limit || 50]);
}

module.exports = {
    logSms,
    notifyProviderNewJob,
    notifyProviderCompletionCode,
    notifyProviderCommissionDeducted,
    notifyProviderWelcomeExhausted,
    notifyStudent,
    notifyStudentProviderAssigned,
    notifyStudentCompleted,
    getSmsLog,
    getSmsForPhone,
    formatLocation
};
