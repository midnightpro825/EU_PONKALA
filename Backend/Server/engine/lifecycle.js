// engine/lifecycle.js - Wire engine modules together (Phase 1h)
const { get, run, all } = require('./db');
const orders = require('./orders');
const matching = require('./matching');
const completion = require('./completion');
const holds = require('./holds');
const autoComplete = require('./auto-complete');
const notify = require('./notify');
const wallet = require('./wallet');
const ratings = require('./ratings');
const notifications = require('./notifications');

// Triggered after matching assigns a provider to an order.
// Sends the "new job" SMS to the provider.
async function onOrderAssigned(orderId) {
    const order = await orders.getOrderById(orderId);
    if (!order || !order.provider_id) return null;
    return notify.notifyProviderNewJob(order.provider_id, order);
}

// Triggered when the provider signals DONE (order reaches COMPLETION_PENDING).
// Generates the completion code + sends it to the provider + notifies the student.
// Also schedules the auto-complete timeout.
async function onOrderCompletionPending(orderId, minutesToAutoComplete) {
    const order = await orders.getOrderById(orderId);
    if (!order) throw new Error('order not found');
    if (order.order_status !== 'COMPLETION_PENDING') {
        return { skipped: true, status: order.order_status };
    }

    const gen = await completion.generateCode(orderId);
    const provider = await get(`SELECT * FROM providers WHERE id = ?`, [order.provider_id]);
    const student = await get(`SELECT * FROM users WHERE user_id = ?`, [order.customer_user_id]);

    // Notify provider
    if (provider) {
        await notify.notifyProviderCompletionCode(provider.id, order, gen.code);
    }
    // Notify student
    if (student) {
        await notify.notifyStudent(order.customer_user_id,
            `Your order ${order.order_code} is done. Give the code ${gen.code} to the provider to complete.`,
            orderId);
    }
    // Schedule auto-complete
    await autoComplete.scheduleAutoComplete(orderId, minutesToAutoComplete);

    return { code: gen.code, provider_notified: !!provider, student_notified: !!student };
}

// Triggered when an order reaches COMPLETED (code verified or auto-completed).
// Settles holds + notifies both sides.
async function onOrderCompleted(orderId) {
    const order = await orders.getOrderById(orderId);
    if (!order) throw new Error('order not found');

    // Settle holds (consume commission)
    await holds.settleOnCompletion(orderId);

    // Notify student
    await notify.notifyStudent(order.customer_user_id,
        `Order ${order.order_code} completed. Thank you!`, orderId);

    // Notify provider (commission)
    if (order.provider_id) {
        const provider = await get(`SELECT * FROM providers WHERE id = ?`, [order.provider_id]);
        if (provider) {
            const state = await wallet.getWalletState(order.provider_id, order.service_type);
            const commission = Number(order.commission || 0);
            await notify.notifyProviderCommissionDeducted(
                order.provider_id, order, commission, state.available
            );
        }
    }

    // Prompt student to rate
    try { await ratings.promptStudentToRate(orderId); } catch (e) {}

    return { settled: true, order_code: order.order_code };
}

// Triggered when an order is cancelled.
async function onOrderCancelled(orderId, reason) {
    const order = await orders.getOrderById(orderId);
    if (!order) throw new Error('order not found');
    await holds.releaseOnCancel(orderId);

    await notify.notifyStudent(order.customer_user_id,
        `Order ${order.order_code} was cancelled. ${reason || ''}`, orderId);

    return { released: true };
}

// Full trace for an order
async function traceOrder(orderId) {
    const order = await orders.getOrderById(orderId);
    if (!order) throw new Error('order not found');

    const holdRows = await holds.getHoldsForOrder(orderId);
    const walletRows = await all(
        `SELECT id, txn_type, amount, balance_before, balance_after, reference, created_at
         FROM wallet_transactions WHERE order_id = ? ORDER BY id`,
        [orderId]
    );
    const smsRows = await all(
        `SELECT sms_id, direction, phone, body, status, created_at
         FROM sms_logs WHERE order_id = ? ORDER BY sms_id`,
        [orderId]
    );
    const codeRows = await all(
        `SELECT code_id, code, issued_at, used_at, is_used FROM completion_codes WHERE order_id = ? ORDER BY code_id`,
        [orderId]
    );
    const cancelRow = await get(
        `SELECT * FROM cancellations WHERE order_id = ? ORDER BY cancellation_id DESC LIMIT 1`,
        [orderId]
    );

    return {
        order: {
            id: order.id,
            order_code: order.order_code,
            service_type: order.service_type,
            customer_user_id: order.customer_user_id,
            provider_id: order.provider_id,
            order_status: order.order_status,
            student_state: orders.toStudentState(order.order_status),
            provider_state: orders.toProviderState(order.order_status),
            price: order.price,
            commission: order.commission,
            created_at: order.created_at,
            accepted_at: order.accepted_at,
            completed_at: order.completed_at,
            cancelled_at: order.cancelled_at,
            auto_complete_at: order.auto_complete_at
        },
        holds: holdRows,
        wallet_entries: walletRows,
        sms: smsRows,
        completion_codes: codeRows,
        cancellation: cancelRow
    };
}

module.exports = {
    onOrderAssigned,
    onOrderCompletionPending,
    onOrderCompleted,
    onOrderCancelled,
    traceOrder
};


