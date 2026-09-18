// engine/completion.js - Completion code generation + validation (Part I, H2)
const { run, get, all } = require('./db');
const orders = require('./orders');
const lifecycle = require('./lifecycle');

// Generate a fresh 4-digit code for an order.
// The order must be in COMPLETION_PENDING to issue.
async function generateCode(orderId) {
    const order = await orders.getOrderById(orderId);
    if (!order) throw new Error('order not found: ' + orderId);
    if (order.order_status !== 'COMPLETION_PENDING') {
        throw new Error(`cannot issue code: order status is ${order.order_status}, must be COMPLETION_PENDING`);
    }

    // Retire any existing unused codes for this order
    await run(
        `UPDATE completion_codes SET is_used = 1, used_at = CURRENT_TIMESTAMP
         WHERE order_id = ? AND is_used = 0`,
        [orderId]
    );

    // Generate unique 4-digit code (retry on collision within active codes)
    let code;
    for (let attempt = 0; attempt < 10; attempt++) {
        code = String(Math.floor(1000 + Math.random() * 9000));
        const clash = await get(
            `SELECT code_id FROM completion_codes WHERE code = ? AND is_used = 0`,
            [code]
        );
        if (!clash) break;
        code = null;
    }
    if (!code) throw new Error('could not generate unique code after 10 attempts');

    // Insert
    const result = await run(
        `INSERT INTO completion_codes (order_id, code, issued_at, is_used) VALUES (?, ?, CURRENT_TIMESTAMP, 0)`,
        [orderId, code]
    );

    // Also mirror onto the order row (legacy column)
    await run(
        `UPDATE service_orders SET completion_code = ?, completion_code_used = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [code, orderId]
    );

    return {
        code_id: result.lastID,
        order_id: orderId,
        code: code,
        issued_at: new Date().toISOString()
    };
}

// Look up active (unused) code for an order.
async function getActiveCode(orderId) {
    return get(
        `SELECT * FROM completion_codes WHERE order_id = ? AND is_used = 0 ORDER BY issued_at DESC LIMIT 1`,
        [orderId]
    );
}

// Validate a submitted code.
// Returns { valid: true, code_row } or throws with reason.
async function validateCode(orderId, code) {
    const order = await orders.getOrderById(orderId);
    if (!order) throw new Error('order not found');
    if (order.order_status === 'COMPLETED') throw new Error('order already completed');
    if (order.order_status !== 'COMPLETION_PENDING') {
        throw new Error(`order is in state ${order.order_status}, must be COMPLETION_PENDING`);
    }

    const row = await getActiveCode(orderId);
    if (!row) throw new Error('no active completion code for this order');
    if (row.code !== String(code)) throw new Error('invalid completion code');

    return { valid: true, code_row: row };
}

// Consume a code: mark it used, transition the order to COMPLETED.
// Idempotent: a second call with the same code fails.
async function consumeCode(orderId, code) {
    const { code_row } = await validateCode(orderId, code);

    // Mark used
    await run(
        `UPDATE completion_codes SET is_used = 1, used_at = CURRENT_TIMESTAMP WHERE code_id = ?`,
        [code_row.code_id]
    );

    // Mirror on order
    await run(
        `UPDATE service_orders SET completion_code_used = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [orderId]
    );

    // Transition order
    const updated = await orders.transition(orderId, 'COMPLETED', 'STUDENT_CODE', 'Completion code verified');

    // Fire completion lifecycle (settles holds, notifies)
    await lifecycle.onOrderCompleted(orderId).catch(e => console.error('onOrderCompleted:', e.message));

    return {
        order: updated,
        code_consumed: true,
        order_code: updated.order_code,
        order_status: updated.order_status
    };
}

// Admin / debug: list all codes for an order
async function listCodes(orderId) {
    return all(
        `SELECT * FROM completion_codes WHERE order_id = ? ORDER BY issued_at DESC`,
        [orderId]
    );
}

module.exports = {
    generateCode,
    getActiveCode,
    validateCode,
    consumeCode,
    listCodes
};

