// engine/auto-complete.js - Auto-completion on timeout (Part H2)
const { run, get, all } = require('./db');
const orders = require('./orders');
const holds = require('./holds');
const lifecycle = require('./lifecycle');
const config = require('./config');

// Schedule auto-complete for an order that just entered COMPLETION_PENDING.
// `minutesFromNow` defaults to config.auto_completion_timeout_min (120 = 2h).
async function scheduleAutoComplete(orderId, minutesFromNow) {
    const mins = minutesFromNow != null ? minutesFromNow : config.auto_completion_timeout_min;
    const order = await orders.getOrderById(orderId);
    if (!order) throw new Error('order not found');
    if (order.order_status !== 'COMPLETION_PENDING') {
        // Not an error, but no-op: don't schedule if order isn't ready
        return { scheduled: false, reason: 'order not in COMPLETION_PENDING', order_status: order.order_status };
    }

    // In SQLite: datetime('now', '+N minutes')
    await run(
        `UPDATE service_orders
         SET auto_complete_at = datetime('now', '+' || ? || ' minutes'), updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [mins, orderId]
    );

    const updated = await orders.getOrderById(orderId);
    return {
        scheduled: true,
        order_id: orderId,
        order_code: updated.order_code,
        auto_complete_at: updated.auto_complete_at,
        minutes_from_now: mins
    };
}

// Find orders whose auto_complete_at has passed and they are still COMPLETION_PENDING.
async function findPendingAutoCompletes() {
    return all(
        `SELECT * FROM service_orders
         WHERE order_status = 'COMPLETION_PENDING'
           AND auto_complete_at IS NOT NULL
           AND auto_complete_at <= CURRENT_TIMESTAMP`
    );
}

// Auto-complete a single order (bypasses code verification, per Part H2).
async function autoComplete(orderId) {
    const order = await orders.getOrderById(orderId);
    if (!order) throw new Error('order not found');
    if (order.order_status !== 'COMPLETION_PENDING') {
        return { completed: false, reason: 'order not in COMPLETION_PENDING', status: order.order_status };
    }

    // Mark completion_code_used (without a code)
    await run(
        `UPDATE service_orders
         SET completion_code_used = 1, dispute_info = COALESCE(dispute_info, '') || ' [auto-completed]',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [orderId]
    );

    // Transition: COMPLETION_PENDING  COMPLETED
    const updated = await orders.transition(orderId, 'COMPLETED', 'SYSTEM_AUTO', 'Auto-completed on timeout');

    // Fire lifecycle
    await lifecycle.onOrderCompleted(orderId).catch(e => console.error('onOrderCompleted (auto):', e.message));

    // Settle holds (consume commission)
    await holds.settleOnCompletion(orderId);

    return {
        completed: true,
        order_id: orderId,
        order_code: updated.order_code,
        order_status: updated.order_status,
        completed_at: updated.completed_at
    };
}

// Run a sweep: auto-complete all pending orders.
async function runSweep() {
    const pending = await findPendingAutoCompletes();
    const results = [];
    for (const o of pending) {
        try {
            results.push(await autoComplete(o.id));
        } catch (e) {
            results.push({ order_id: o.id, completed: false, reason: e.message });
        }
    }
    return { swept: results.length, results };
}

module.exports = {
    scheduleAutoComplete,
    findPendingAutoCompletes,
    autoComplete,
    runSweep
};

