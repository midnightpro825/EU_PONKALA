// engine/laundry.js - Laundry module (Part I)
const { run, get, all } = require('./db');
const config = require('./config');
const orders = require('./orders');
const holds = require('./holds');
const wallet = require('./wallet');
const matching = require('./matching');

// ---------------------------------------------------------------
// ITEM CATALOG (Part I4 - admin editable)
// ---------------------------------------------------------------
async function listItems(includeInactive) {
    const sql = includeInactive
        ? `SELECT * FROM engine_laundry_items ORDER BY sort_order, item_id`
        : `SELECT * FROM engine_laundry_items WHERE is_active = 1 ORDER BY sort_order, item_id`;
    return all(sql);
}

async function getItemByCode(code) {
    return get(`SELECT * FROM engine_laundry_items WHERE item_code = ?`, [String(code).toUpperCase()]);
}

async function createItem({ item_code, item_label, unit_price, sort_order }) {
    if (!item_code || !item_label) throw new Error('item_code and item_label required');
    const r = await run(
        `INSERT INTO engine_laundry_items (item_code, item_label, unit_price, sort_order) VALUES (?, ?, ?, ?)`,
        [item_code.toUpperCase(), item_label, unit_price || 0, sort_order || 0]
    );
    return get(`SELECT * FROM engine_laundry_items WHERE item_id = ?`, [r.lastID]);
}

async function updateItem(itemId, fields) {
    const allowed = ['item_label', 'unit_price', 'is_active', 'sort_order'];
    const sets = [], vals = [];
    for (const k of allowed) {
        if (fields[k] !== undefined) { sets.push(k + ' = ?'); vals.push(fields[k]); }
    }
    if (!sets.length) throw new Error('no fields to update');
    sets.push('updated_at = CURRENT_TIMESTAMP');
    vals.push(itemId);
    await run(`UPDATE engine_laundry_items SET ${sets.join(', ')} WHERE item_id = ?`, vals);
    return get(`SELECT * FROM engine_laundry_items WHERE item_id = ?`, [itemId]);
}

// ---------------------------------------------------------------
// PRICING (Part I4)
// ---------------------------------------------------------------
// items = [{ item_code, quantity }, ...]
// Returns { lines: [{ item_code, item_label, quantity, unit_price, line_total }], total }
async function calculatePrice(items) {
    if (!Array.isArray(items) || !items.length) throw new Error('items must be a non-empty array');
    const lines = [];
    let total = 0;
    for (const it of items) {
        const code = String(it.item_code || '').toUpperCase();
        if (!code) throw new Error('item_code required for each line');
        const qty = Number(it.quantity || 0);
        if (qty <= 0) throw new Error('quantity must be > 0 for ' + code);
        const catalog = await getItemByCode(code);
        if (!catalog) throw new Error('unknown item: ' + code);
        const line_total = Number((catalog.unit_price * qty).toFixed(2));
        total += line_total;
        lines.push({
            item_code: code,
            item_label: catalog.item_label,
            quantity: qty,
            unit_price: catalog.unit_price,
            line_total
        });
    }
    total = Number(total.toFixed(2));
    return { lines, total };
}

// ---------------------------------------------------------------
// ACCESS PACKAGE (K50 = 4 connections) - Part I2
// ---------------------------------------------------------------

// Get or create the access row for a user.
async function getAccessRow(userId) {
    let row = await get(`SELECT * FROM engine_laundry_access WHERE user_id = ?`, [userId]);
    if (!row) {
        const r = await run(
            `INSERT INTO engine_laundry_access (user_id, connections_total, connections_used, connections_held)
             VALUES (?, 0, 0, 0)`,
            [userId]
        );
        row = await get(`SELECT * FROM engine_laundry_access WHERE access_id = ?`, [r.lastID]);
    }
    return row;
}

// Public: what the student sees on the laundry screen.
//   { unlocked: bool, remaining: N, total: N, used: N, held: N }
async function getAccessState(userId) {
    const row = await getAccessRow(userId);
    const remaining = Math.max(0, row.connections_total - row.connections_used - row.connections_held);
    return {
        user_id: userId,
        unlocked: row.connections_total > 0,
        remaining,
        total: row.connections_total,
        used: row.connections_used,
        held: row.connections_held,
        last_unlock_at: row.last_unlock_at
    };
}

// Student pays K50 (mock)  grant 4 connections.
async function unlockAccess(userId, mockReference) {
    const price = config.laundry_access_price;
    const connections = config.laundry_access_connections;

    // Ensure row exists
    await getAccessRow(userId);

    // Grant connections
    await run(
        `UPDATE engine_laundry_access
         SET connections_total = connections_total + ?,
             last_unlock_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ?`,
        [connections, userId]
    );

    // Record payment (mock)  write to payments table if it exists
    try {
        await run(
            `INSERT INTO payments (subscription_id, transaction_id, amount, currency, provider, payment_status)
             VALUES (NULL, ?, ?, 'ZMW', 'MOCK', 'successful')`,
            [mockReference || ('MOCK-K50-' + Date.now()), price]
        );
    } catch (e) {
        // payments table may have a different shape; ignore
    }

    return getAccessState(userId);
}

// Hold a connection when order is accepted.
async function holdConnection(userId) {
    const row = await getAccessRow(userId);
    const remaining = row.connections_total - row.connections_used - row.connections_held;
    if (remaining <= 0) throw new Error('no connections available. Unlock laundry first (K50).');
    await run(
        `UPDATE engine_laundry_access
         SET connections_held = connections_held + 1, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ?`,
        [userId]
    );
    return getAccessState(userId);
}

// Consume a held connection (called on order completion).
async function consumeConnection(userId) {
    const row = await getAccessRow(userId);
    if (row.connections_held <= 0) throw new Error('no connection held to consume');
    await run(
        `UPDATE engine_laundry_access
         SET connections_held = connections_held - 1,
             connections_used = connections_used + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ?`,
        [userId]
    );
    return getAccessState(userId);
}

// Release a held connection (called on cancel).
async function releaseConnection(userId) {
    const row = await getAccessRow(userId);
    if (row.connections_held <= 0) return getAccessState(userId);
    await run(
        `UPDATE engine_laundry_access
         SET connections_held = connections_held - 1, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ?`,
        [userId]
    );
    return getAccessState(userId);
}

// ---------------------------------------------------------------
// CREATE LAUNDRY ORDER (Part I1)
// ---------------------------------------------------------------
// Checks access + calculates price + creates order in one shot.
// Cash-only V1: order goes straight to PAYMENT_CONFIRMED.
async function createLaundryOrder(userId, { items, pickup_zone_id, pickup_landmark_id, pickup_address_text, instructions }) {
    // 1. Check access
    const state = await getAccessState(userId);
    if (state.remaining <= 0) {
        throw new Error('laundry is locked. Unlock with K50 for 4 connections.');
    }

    // 2. Calculate price from items
    const { lines, total } = await calculatePrice(items);

    // 3. Create the order (goes to PAYMENT_CONFIRMED cash-only)
    const order = await orders.createOrder({
        service_type: 'LAUNDRY',
        customer_user_id: userId,
        price: total,
        pickup_zone_id,
        pickup_landmark_id,
        pickup_address_text,
        instructions
    });

    // 4. Save item lines
    for (const line of lines) {
        await run(
            `INSERT INTO order_items (order_id, item_type, item_label, quantity, unit_price, line_total)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [order.id, line.item_code, line.item_label, line.quantity, line.unit_price, line.line_total]
        );
    }

    // 5. Hold a connection on the order
    await run(
        `UPDATE service_orders SET connection_held = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [order.id]
    );
    await holdConnection(userId);

    // Auto-trigger matching (fire-and-forget; order already created)
    try {
        await orders.transition(order.id, 'PROVIDER_SEARCHING', 'SYSTEM', 'Auto after creation');
        const asg = await matching.autoAssign(order.id);
        if (asg.assigned) {
            console.log('[laundry] auto-assigned order ' + order.order_code + ' to provider ' + asg.result.provider_id);
        } else {
            console.log('[laundry] no eligible provider for ' + order.order_code);
        }
    } catch (e) {
        console.error('[laundry] auto-assign failed:', e.message);
    }

    return {
        order,
        items: lines,
        total,
        access: await getAccessState(userId)
    };
}

// Called when a laundry order completes  consume the connection.
async function onLaundryOrderCompleted(orderId) {
    const order = await orders.getOrderById(orderId);
    if (!order) throw new Error('order not found');
    if (order.service_type !== 'LAUNDRY') return { skipped: true };

    if (order.connection_consumed) return { skipped: true, reason: 'already consumed' };

    // Consume on access row
    try {
        await consumeConnection(order.customer_user_id);
    } catch (e) {
        console.error('consumeConnection:', e.message);
    }

    // Mark on order
    await run(
        `UPDATE service_orders
         SET connection_consumed = 1, connection_held = 0, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [orderId]
    );

    return { consumed: true, order_id: orderId, access: await getAccessState(order.customer_user_id) };
}

// Called when a laundry order cancels  release the hold.
async function onLaundryOrderCancelled(orderId) {
    const order = await orders.getOrderById(orderId);
    if (!order) throw new Error('order not found');
    if (order.service_type !== 'LAUNDRY') return { skipped: true };
    if (order.connection_consumed) return { skipped: true, reason: 'already consumed' };

    try {
        await releaseConnection(order.customer_user_id);
    } catch (e) {
        console.error('releaseConnection:', e.message);
    }
    await run(
        `UPDATE service_orders SET connection_held = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [orderId]
    );
    return { released: true, order_id: orderId, access: await getAccessState(order.customer_user_id) };
}

module.exports = {
    // Catalog
    listItems, getItemByCode, createItem, updateItem,
    // Pricing
    calculatePrice,
    // Access
    getAccessState, unlockAccess, holdConnection, consumeConnection, releaseConnection,
    // Orders
    createLaundryOrder, onLaundryOrderCompleted, onLaundryOrderCancelled
};


