// engine/ratings.js
const { run, get, all } = require('./db');
const notify = require('./notify');
const orders = require('./orders');

// Submit a rating. Only allowed once per order.
async function submitRating(orderId, studentUserId, stars, comment) {
    const order = await orders.getOrderById(orderId);
    if (!order) throw new Error('order not found');
    if (order.customer_user_id !== studentUserId) throw new Error('not your order');
    if (order.order_status !== 'COMPLETED') throw new Error('order must be COMPLETED to rate');
    if (!order.provider_id) throw new Error('order has no provider');

    const s = Number(stars);
    if (!s || s < 1 || s > 5) throw new Error('stars must be 1-5');

    const existing = await get(
        `SELECT id FROM provider_ratings WHERE order_id = ? AND student_user_id = ?`,
        [orderId, studentUserId]
    );
    if (existing) throw new Error('already rated this order');

    const r = await run(
        `INSERT INTO provider_ratings (provider_id, service_type, order_id, student_user_id, rating, comment)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [order.provider_id, order.service_type, orderId, studentUserId, s, comment || null]
    );
    return { rating_id: r.lastID, provider_id: order.provider_id, stars: s };
}

async function getProviderRatings(providerId, limit) {
    return all(
        `SELECT * FROM provider_ratings WHERE provider_id = ?
         ORDER BY created_at DESC LIMIT ?`,
        [providerId, limit || 50]
    );
}

async function getProviderRatingSummary(providerId) {
    const row = await get(
        `SELECT COUNT(*) AS total, AVG(rating) AS avg
         FROM provider_ratings WHERE provider_id = ?`,
        [providerId]
    );
    return {
        provider_id: providerId,
        total_ratings: row.total || 0,
        average: row.avg ? Number(row.avg.toFixed(2)) : null
    };
}

// Composite score for matching: 70% rating + 30% completion rate.
// Higher is better. New providers with no history get 3.5 (neutral).
async function getProviderScore(providerId) {
    const r = await get(
        `SELECT AVG(rating) AS avg, COUNT(*) AS n FROM provider_ratings WHERE provider_id = ?`,
        [providerId]
    );
    const rating = r.avg ? Number(r.avg) : 3.5;

    const c = await get(
        `SELECT
            SUM(CASE WHEN order_status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed,
            SUM(CASE WHEN order_status IN ('COMPLETED','CANCELLED') THEN 1 ELSE 0 END) AS finished
         FROM service_orders WHERE provider_id = ?`,
        [providerId]
    );
    const completionRate = (c.finished && c.finished > 0) ? (c.completed / c.finished) : 1.0;

    const score = Number(((rating * 0.7 + completionRate * 5 * 0.3)).toFixed(3));
    return {
        provider_id: providerId,
        rating: Number(rating.toFixed(2)),
        total_ratings: r.n || 0,
        completion_rate: Number(completionRate.toFixed(3)),
        score
    };
}

async function getStudentRatingForOrder(orderId, studentUserId) {
    return get(
        `SELECT * FROM provider_ratings WHERE order_id = ? AND student_user_id = ?`,
        [orderId, studentUserId]
    );
}

// Prompt the student to rate after completion. Called from lifecycle.
async function promptStudentToRate(orderId) {
    const order = await orders.getOrderById(orderId);
    if (!order) return null;
    try {
        await notify.notifyStudent(order.customer_user_id,
            `How was your EU PONKALA order ${order.order_code}? Rate 1-5 stars at /rate/${orderId}`,
            orderId);
    } catch (e) { /* non-fatal */ }
    return { prompted: true, order_id: orderId };
}

module.exports = {
    submitRating,
    getProviderRatings,
    getProviderRatingSummary,
    getProviderScore,
    getStudentRatingForOrder,
    promptStudentToRate
};
