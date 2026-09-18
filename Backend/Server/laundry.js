// EU PONKALA  Laundry module helper (full flow)
const { run, get, all } = require('./db');

const ORDER_STATES = [
    'requested', 'payment_pending', 'payment_confirmed',
    'provider_searching', 'provider_assigned', 'provider_contacted',
    'provider_on_the_way', 'provider_arrived', 'washing',
    'completion_pending', 'completed'
];
const EXCEPTION_STATES = ['cancelled', 'disputed'];

function generateOrderNumber() {
    return 'PNK' + Math.floor(1000 + Math.random() * 9000);
}
function generateCompletionCode() {
    return String(Math.floor(1000 + Math.random() * 9000));
}
async function getSetting(key, fallback = null) {
    const row = await get('SELECT value FROM laundry_settings WHERE key = ?', [key]);
    return row ? row.value : fallback;
}
async function setSetting(key, value) {
    await run(
        `INSERT INTO laundry_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
        [key, String(value)]
    );
}
async function getCommissionRate() {
    const v = await getSetting('commission_rate', '0.15');
    return parseFloat(v);
}
async function calculateOrderSubtotal(items) {
    let subtotal = 0;
    const lineItems = [];
    for (const it of items) {
        const menuItem = await get('SELECT * FROM laundry_items WHERE item_type = ? AND is_active = 1', [it.item_type]);
        if (!menuItem) throw new Error('Unknown item: ' + it.item_type);
        const qty = parseInt(it.quantity) || 0;
        if (qty < 1) throw new Error('Quantity must be >= 1');
        const line = qty * menuItem.unit_price;
        subtotal += line;
        lineItems.push({ item_type: menuItem.item_type, quantity: qty, unit_price: menuItem.unit_price, subtotal: line });
    }
    return { subtotal, lineItems };
}
async function sendSms(recipient, message) {
    await run('INSERT INTO laundry_sms_outbox (recipient, message, status) VALUES (?, ?, ?)',
              [recipient, message, 'queued']);
    console.log('SMS -> ' + recipient);
    console.log(message.split('\n').map(l => '   ' + l).join('\n'));
    return true;
}
async function pickProviderForOrder(order) {
    const cash = order.payment_method === 'cash';
    let sql = `SELECT * FROM laundry_providers WHERE verification_status = 'verified' AND availability_status = 'available'`;
    const params = [];
    if (cash) {
        sql += ' AND cash_eligible = 1';
        const minBal = parseFloat(await getSetting('min_wallet_balance', '10'));
        sql += ' AND wallet_balance >= ?';
        params.push(minBal);
    }
    sql += ` ORDER BY COALESCE((SELECT MAX(created_at) FROM laundry_orders WHERE provider_id = laundry_providers.id), '1970-01-01') ASC, RANDOM() LIMIT 1`;
    return await get(sql, params);
}
async function walletTransaction(providerId, orderId, type, amount, reference) {
    const p = await get('SELECT wallet_balance FROM laundry_providers WHERE id = ?', [providerId]);
    if (!p) throw new Error('Provider not found');
    const before = p.wallet_balance || 0;
    const after = +(before + amount).toFixed(2);
    await run('UPDATE laundry_providers SET wallet_balance = ? WHERE id = ?', [after, providerId]);
    await run(`INSERT INTO commission_wallet_transactions
               (provider_id, order_id, transaction_type, amount, balance_before, balance_after, reference)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [providerId, orderId, type, amount, before, after, reference || null]);
    return { before, after };
}
async function setOrderState(orderId, newState) {
    if (!ORDER_STATES.includes(newState) && !EXCEPTION_STATES.includes(newState))
        throw new Error('Invalid order state: ' + newState);
    await run(`UPDATE laundry_orders SET order_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
              [newState, orderId]);
}
async function completeOrder(orderId, code) {
    const order = await get('SELECT * FROM laundry_orders WHERE id = ?', [orderId]);
    if (!order) throw new Error('Order not found');
    if (order.order_status === 'completed') throw new Error('Already completed');
    if (order.completion_code_status === 'used') throw new Error('Code already used');
    if (String(order.completion_code) !== String(code)) throw new Error('Invalid completion code');

    const r = await run(
        `UPDATE laundry_orders SET
            order_status = 'completed',
            payment_status = CASE WHEN payment_method = 'cash' THEN 'confirmed' ELSE payment_status END,
            completion_code_status = 'used',
            connection_consumed = 1,
            updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND connection_consumed = 0`, [orderId]
    );
    if (r.changes === 0) throw new Error('Connection already consumed');

    await run(
        `UPDATE laundry_access_subscriptions SET
            connections_remaining = MAX(0, connections_remaining - 1),
            status = CASE WHEN connections_remaining - 1 <= 0 THEN 'exhausted' ELSE status END
         WHERE id = (SELECT id FROM laundry_access_subscriptions
                     WHERE student_id = ? AND status = 'active'
                     ORDER BY id DESC LIMIT 1)`, [order.student_id]
    );

    if (order.payment_method === 'cash' && order.provider_id) {
        await walletTransaction(order.provider_id, order.id, 'commission',
            -Math.abs(order.commission_amount), 'Cash commission for ' + order.order_number);
    }
    if (order.payment_method === 'mobile_money' && order.provider_id) {
        await run(`INSERT INTO commission_wallet_transactions
                   (provider_id, order_id, transaction_type, amount, balance_before, balance_after, reference)
                   SELECT id, ?, 'settlement', ?, wallet_balance, wallet_balance, ?
                   FROM laundry_providers WHERE id = ?`,
                  [orderId, order.provider_amount, 'Momo settlement ' + order.order_number, order.provider_id]);
    }
    await run(`UPDATE laundry_payments SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP WHERE order_id = ?`, [orderId]);

    if (order.provider_id) {
        await run(`UPDATE laundry_providers SET availability_status = 'available', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [order.provider_id]);
        const p = await get('SELECT phone FROM laundry_providers WHERE id = ?', [order.provider_id]);
        if (p) await sendSms(p.phone, 'Order ' + order.order_number + ' completed. Commission K' + order.commission_amount + ' recorded.');
    }
    return await get('SELECT * FROM laundry_orders WHERE id = ?', [orderId]);
}
async function ensureLaundrySeed() {
    const menu = [
        ['tshirt','T-Shirt',10],['trousers','Trousers',15],['jeans','Jeans',20],
        ['skirt','Skirt',12],['dress','Dress',25],['shirt','Shirt',12],
        ['blouse','Blouse',15],['jacket','Jacket',30],['sweater','Sweater',22],
        ['shorts','Shorts',10],['socks','Socks (pair)',5],['bedding','Bedding set',40],
        ['towel','Towel',10],['other','Other',10]
    ];
    for (const [type, name, price] of menu) {
        await run(`INSERT OR IGNORE INTO laundry_items (item_type, display_name, unit_price) VALUES (?, ?, ?)`, [type, name, price]);
    }
    const defaults = [
        ['commission_rate','0.15'],['access_package_price','50'],['access_package_connections','4'],
        ['cash_enabled','1'],['min_wallet_balance','10'],['wallet_warning_threshold','25'],
        ['max_cash_order_amount','500'],['provider_response_window_min','3'],['service_active','1']
    ];
    for (const [k, v] of defaults) {
        const existing = await get('SELECT key FROM laundry_settings WHERE key = ?', [k]);
        if (!existing) await setSetting(k, v);
    }
}

module.exports = {
    ORDER_STATES, EXCEPTION_STATES,
    generateOrderNumber, generateCompletionCode,
    getSetting, setSetting, getCommissionRate,
    calculateOrderSubtotal, sendSms,
    pickProviderForOrder, walletTransaction,
    setOrderState, completeOrder, ensureLaundrySeed
};





