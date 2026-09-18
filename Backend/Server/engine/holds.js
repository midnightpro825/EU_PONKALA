// engine/holds.js - Hold lifecycle (Part H2)
const { run, get, all } = require('./db');
const wallet = require('./wallet');
const config = require('./config');

// Get all holds for an order
async function getHoldsForOrder(orderId) {
    return all(
        `SELECT * FROM order_holds WHERE order_id = ? ORDER BY created_at`,
        [orderId]
    );
}

// On completion: settle all HELD holds  CONSUMED.
// For commission: releases the HOLD then records COMMISSION (spend).
async function settleOnCompletion(orderId) {
    const order = await get(
        `SELECT * FROM service_orders WHERE id = ?`, [orderId]
    );
    if (!order) throw new Error('order not found');

    // Mark hold rows as CONSUMED
    await run(
        `UPDATE order_holds
         SET state = 'CONSUMED', resolved_at = CURRENT_TIMESTAMP
         WHERE order_id = ? AND state = 'HELD'`,
        [orderId]
    );

    // If commission hasn't been deducted yet, deduct it now
    if (order.provider_id && !order.commission_deducted) {
        const commission = Number(order.commission || 0);
        if (commission > 0) {
            await wallet.deductCommission(
                order.provider_id,
                order.service_type,
                orderId,
                commission
            );
        }
        await run(
            `UPDATE service_orders SET commission_deducted = 1, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [orderId]
        );
    }

    return getHoldsForOrder(orderId);
}

// On cancel: release all HELD holds  RELEASED.
async function releaseOnCancel(orderId) {
    const order = await get(
        `SELECT * FROM service_orders WHERE id = ?`, [orderId]
    );
    if (!order) throw new Error('order not found');

    // Refund the held amount back to wallet (release entries)
    if (order.provider_id && order.commission_held && !order.commission_deducted) {
        const commission = Number(order.commission || 0);
        if (commission > 0) {
            await wallet.releaseHold(
                order.provider_id,
                order.service_type,
                orderId,
                commission
            );
        }
        await run(
            `UPDATE service_orders SET commission_held = 0, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [orderId]
        );
    }

    await run(
        `UPDATE order_holds
         SET state = 'RELEASED', resolved_at = CURRENT_TIMESTAMP
         WHERE order_id = ? AND state = 'HELD'`,
        [orderId]
    );

    return getHoldsForOrder(orderId);
}

// Record a hold row (called from matching when a provider is assigned)
async function recordHold(orderId, providerId, holdType, amount) {
    const result = await run(
        `INSERT INTO order_holds (order_id, provider_id, hold_type, amount, state)
         VALUES (?, ?, ?, ?, 'HELD')`,
        [orderId, providerId, holdType, amount]
    );
    return { hold_id: result.lastID, order_id: orderId, hold_type: holdType, amount };
}

module.exports = {
    getHoldsForOrder,
    settleOnCompletion,
    releaseOnCancel,
    recordHold
};
