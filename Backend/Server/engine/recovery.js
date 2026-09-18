// engine/recovery.js
const db = require('./db');
const orders = require('./orders');
const holds = require('./holds');
const wallet = require('./wallet');
const notify = require('./notify');
const audit = require('./audit');

async function forceComplete(orderId, adminUserId, notes) {
    const order = await orders.getOrderById(orderId);
    if (!order) throw new Error('order not found');
    const prev = { order_status: order.order_status };
    await db.run(
        "UPDATE service_orders SET order_status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [orderId]
    );
    try { await holds.settleOnCompletion(orderId); } catch (e) { console.error('settle:', e.message); }
    await audit.log('FORCE_COMPLETE', 'ORDER', orderId, prev, { order_status: 'COMPLETED' }, adminUserId, notes);
    return { order_id: orderId, order_status: 'COMPLETED', forced: true };
}

async function forceCancel(orderId, adminUserId, reason) {
    const order = await orders.getOrderById(orderId);
    if (!order) throw new Error('order not found');
    const prev = { order_status: order.order_status };
    await db.run(
        "UPDATE service_orders SET order_status = 'CANCELLED', cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [orderId]
    );
    try { await holds.releaseOnCancel(orderId); } catch (e) { console.error('release:', e.message); }
    await audit.log('FORCE_CANCEL', 'ORDER', orderId, prev, { order_status: 'CANCELLED' }, adminUserId, reason);
    return { order_id: orderId, order_status: 'CANCELLED', forced: true };
}

async function adjustWallet(providerId, amount, reason, adminUserId) {
    const amt = Number(amount);
    if (!amt || isNaN(amt)) throw new Error('amount required');
    const r = await wallet.recordTransaction(
        providerId, 'LAUNDRY', null, 'ADJUSTMENT', Math.abs(amt),
        'ADJ-' + Date.now(), reason || 'Manual adjustment'
    );
    await audit.log('ADJUST_WALLET', 'PROVIDER', providerId, null,
        { amount: amt, txn_id: r.tx_id, reason: reason }, adminUserId, reason);
    return { provider_id: providerId, txn_id: r.tx_id, amount: amt, new_balance: r.balance_after };
}

async function reassignOrder(orderId, newProviderId, adminUserId, notes) {
    const order = await orders.getOrderById(orderId);
    if (!order) throw new Error('order not found');
    const prev = { provider_id: order.provider_id };

    if (order.provider_id) {
        try { await holds.releaseOnCancel(orderId); } catch (e) {}
    }

    await db.run(
        "UPDATE service_orders SET provider_id = ?, order_status = 'PROVIDER_ASSIGNED', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [newProviderId, orderId]
    );

    const expectedCommission = Number(order.commission || (order.price * 0.15));
    try { await wallet.holdCommission(newProviderId, order.service_type, orderId, expectedCommission); } catch (e) {}

    await audit.log('REASSIGN_ORDER', 'ORDER', orderId, prev, { provider_id: newProviderId }, adminUserId, notes);
    return { order_id: orderId, new_provider_id: newProviderId };
}

module.exports = { forceComplete, forceCancel, adjustWallet, reassignOrder };