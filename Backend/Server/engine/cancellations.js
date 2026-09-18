// engine/cancellations.js
const { run, get, all } = require('./db');
const orders = require('./orders');
const holds = require('./holds');
const notify = require('./notify');
const penalties = require('./penalties');

async function cancelOrder(orderId, cancelledBy, reason) {
    const order = await orders.getOrderById(orderId);
    if (!order) throw new Error('order not found');
    if (['COMPLETED','CANCELLED','DISPUTED'].includes(order.order_status)) {
        throw new Error('order is already ' + order.order_status);
    }

    const actor = (cancelledBy || 'SYSTEM').toUpperCase();

    // Record cancellation
    const r = await run(
        `INSERT INTO cancellations (order_id, cancelled_by, reason) VALUES (?, ?, ?)`,
        [orderId, actor, reason || null]
    );

    // Release any held funds
    try {
        await holds.releaseOnCancel(orderId);
    } catch (e) { console.error('releaseOnCancel:', e.message); }

    // Transition order to CANCELLED (bypass normal state checks)
    await run(
        `UPDATE service_orders SET order_status = 'CANCELLED', cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [orderId]
    );

    // Record penalty if provider cancelled
    if (actor === 'PROVIDER' && order.provider_id) {
        try { await penalties.recordOffense('PROVIDER', order.provider_id, 'PROVIDER_CANCEL', reason || null); }
        catch (e) { console.error('recordOffense:', e.message); }
    }

    // Notify both sides
    try {
        await notify.notifyStudent(order.customer_user_id,
            `Order ${order.order_code} was cancelled. ${reason || ''}`, orderId);
    } catch (e) {}
    if (order.provider_id) {
        const p = await get(`SELECT phone FROM providers WHERE id = ?`, [order.provider_id]);
        if (p) {
            try {
                await notify.logSms('OUT', p.phone,
                    `Job ${order.order_code} cancelled. ${reason || ''}`,
                    { provider_id: order.provider_id, order_id: orderId });
            } catch (e) {}
        }
    }

    return { cancellation_id: r.lastID, order_id: orderId, cancelled_by: actor };
}

async function getCancellationsForOrder(orderId) {
    return all(`SELECT * FROM cancellations WHERE order_id = ? ORDER BY cancellation_id`, [orderId]);
}

async function listRecentCancellations(limit) {
    return all(
        `SELECT c.*, o.order_code, o.service_type
         FROM cancellations c
         JOIN service_orders o ON c.order_id = o.id
         ORDER BY c.cancellation_id DESC LIMIT ?`,
        [limit || 50]
    );
}

module.exports = { cancelOrder, getCancellationsForOrder, listRecentCancellations };

