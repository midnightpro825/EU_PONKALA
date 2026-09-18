// engine/disputes.js
const { run, get, all } = require('./db');
const orders = require('./orders');
const wallet = require('./wallet');
const holds = require('./holds');
const notify = require('./notify');

// Raise a dispute: student or provider contests a completed order.
async function raiseDispute(orderId, raisedBy, reason, description) {
    const order = await orders.getOrderById(orderId);
    if (!order) throw new Error('order not found');
    if (!['COMPLETED','COMPLETION_PENDING'].includes(order.order_status)) {
        throw new Error('can only dispute COMPLETED or COMPLETION_PENDING orders (currently ' + order.order_status + ')');
    }

    const actor = (raisedBy || 'STUDENT').toUpperCase();
    const r = await run(
        `INSERT INTO disputes (order_id, raised_by, raised_by_id, reason, description, status)
         VALUES (?, ?, ?, ?, ?, 'OPEN')`,
        [orderId, actor,
         actor === 'STUDENT' ? order.customer_user_id : order.provider_id,
         reason, description || null]
    );

    await run(
        `UPDATE service_orders SET order_status = 'DISPUTED', dispute_info = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [reason + ': ' + (description || ''), orderId]
    );

    return { dispute_id: r.lastID, order_id: orderId, status: 'OPEN' };
}

async function reviewDispute(disputeId, adminUserId, notes) {
    const d = await get(`SELECT * FROM disputes WHERE dispute_id = ?`, [disputeId]);
    if (!d) throw new Error('dispute not found');
    if (d.status !== 'OPEN') throw new Error('dispute already ' + d.status);
    await run(
        `UPDATE disputes SET status = 'REVIEWING', resolution = COALESCE(?, resolution) WHERE dispute_id = ?`,
        [notes || null, disputeId]
    );
    return { dispute_id: disputeId, status: 'REVIEWING' };
}

// Resolve a dispute:
//   resolution = 'PAY_PROVIDER' ??? consume commission, complete order
//   resolution = 'REFUND_STUDENT' ??? release commission + notify
//   resolution = 'SPLIT' ??? partial (not implemented in V1)
async function resolveDispute(disputeId, adminUserId, resolution, notes) {
    const d = await get(`SELECT * FROM disputes WHERE dispute_id = ?`, [disputeId]);
    if (!d) throw new Error('dispute not found');
    if (d.status === 'RESOLVED') throw new Error('already resolved');

    const order = await orders.getOrderById(d.order_id);
    if (!order) throw new Error('order not found');

    let outcome;
    if (resolution === 'PAY_PROVIDER') {
        // Consume the hold ??? commission gets deducted
        await holds.settleOnCompletion(order.id);
        await run(`UPDATE service_orders SET order_status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [order.id]);
        outcome = { status: 'COMPLETED', action: 'PAY_PROVIDER' };
    } else if (resolution === 'REFUND_STUDENT') {
        // Release the hold ??? provider keeps wallet
        await holds.releaseOnCancel(order.id);
        await run(`UPDATE service_orders SET order_status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [order.id]);
        outcome = { status: 'CANCELLED', action: 'REFUND_STUDENT' };
    } else {
        throw new Error('resolution must be PAY_PROVIDER or REFUND_STUDENT');
    }

    await run(
        `UPDATE disputes SET status = 'RESOLVED', resolved_at = CURRENT_TIMESTAMP, resolution = ?
         WHERE dispute_id = ?`,
        [(resolution + (notes ? ' ??? ' + notes : '')), disputeId]
    );

    return { dispute_id: disputeId, resolution, outcome };
}

async function listOpenDisputes() {
    return all(
        `SELECT d.*, o.order_code, o.service_type, o.price
         FROM disputes d
         JOIN service_orders o ON d.order_id = o.id
         WHERE d.status IN ('OPEN','REVIEWING')
         ORDER BY d.dispute_id ASC`
    );
}

async function getDisputesForOrder(orderId) {
    return all(`SELECT * FROM disputes WHERE order_id = ? ORDER BY dispute_id`, [orderId]);
}

module.exports = { raiseDispute, reviewDispute, resolveDispute, listOpenDisputes, getDisputesForOrder };
