// =============================================
// EU PONKALA  Laundry REST routes
// Required from server.js to keep it clean
// =============================================
const path = require('path');
const { run, get, all } = require('./db');
const laundryHelper = require('./laundry');

module.exports = function registerLaundryRoutes(app, { getStudentId }) {
    // PUBLIC
    app.get('/api/laundry/items', async (req, res) => {
        try {
            const items = await all('SELECT * FROM laundry_items WHERE is_active = 1 ORDER BY display_name');
            res.json({ status: 'success', data: items });
        } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
    });

    // ACCESS
    app.get('/api/laundry/access/:userId', async (req, res) => {
        try {
            const studentId = await getStudentId(req.params.userId);
            if (!studentId) return res.status(404).json({ status: 'error', message: 'Student not found' });
            const active = await get(
                `SELECT * FROM laundry_access_subscriptions
                 WHERE student_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1`, [studentId]
            );
            const price = await laundryHelper.getSetting('access_package_price', '50');
            const connections = await laundryHelper.getSetting('access_package_connections', '4');
            res.json({
                status: 'success',
                data: {
                    unlocked: !!(active && active.connections_remaining > 0),
                    connections_remaining: active ? active.connections_remaining : 0,
                    subscription: active || null,
                    package_price: parseFloat(price),
                    package_connections: parseInt(connections)
                }
            });
        } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
    });

    // UNLOCK
    app.post('/api/laundry/unlock', async (req, res) => {
        try {
            const { student_user_id, payment_method, payment_reference } = req.body;
            const studentId = await getStudentId(student_user_id);
            if (!studentId) return res.status(404).json({ status: 'error', message: 'Student not found' });
            const price = parseFloat(await laundryHelper.getSetting('access_package_price', '50'));
            const conns = parseInt(await laundryHelper.getSetting('access_package_connections', '4'));
            const existing = await get(
                `SELECT * FROM laundry_access_subscriptions
                 WHERE student_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1`, [studentId]
            );
            if (existing) {
                await run(
                    `UPDATE laundry_access_subscriptions SET
                        connections_remaining = connections_remaining + ?,
                        connections_purchased = connections_purchased + ?
                     WHERE id = ?`, [conns, conns, existing.id]
                );
                const updated = await get('SELECT * FROM laundry_access_subscriptions WHERE id = ?', [existing.id]);
                return res.json({ status: 'success', message: 'Connections topped up', data: updated });
            }
            const r = await run(
                `INSERT INTO laundry_access_subscriptions
                 (student_id, package_price, connections_purchased, connections_remaining, status, payment_method, payment_reference)
                 VALUES (?, ?, ?, ?, 'active', ?, ?)`,
                [studentId, price, conns, conns, payment_method || 'mock', payment_reference || null]
            );
            const sub = await get('SELECT * FROM laundry_access_subscriptions WHERE id = ?', [r.lastID]);
            res.status(201).json({ status: 'success', message: 'Laundry unlocked', data: sub });
        } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
    });

    // CREATE ORDER
    app.post('/api/laundry/orders', async (req, res) => {
        try {
            const { student_user_id, items, payment_method, location, location_lat, location_lng, notes } = req.body;
            const studentId = await getStudentId(student_user_id);
            if (!studentId) return res.status(404).json({ status: 'error', message: 'Student not found' });

            const sub = await get(
                `SELECT * FROM laundry_access_subscriptions
                 WHERE student_id = ? AND status = 'active' AND connections_remaining > 0
                 ORDER BY id DESC LIMIT 1`, [studentId]
            );
            if (!sub) return res.status(403).json({ status: 'error', message: 'Laundry not unlocked' });

            const { subtotal, lineItems } = await laundryHelper.calculateOrderSubtotal(items);
            const rate = await laundryHelper.getCommissionRate();
            const commission = +(subtotal * rate).toFixed(2);
            const providerAmount = +(subtotal - commission).toFixed(2);

            if (payment_method === 'cash') {
                const cashEnabled = await laundryHelper.getSetting('cash_enabled', '1');
                if (cashEnabled !== '1') return res.status(400).json({ status: 'error', message: 'Cash disabled' });
                const maxCash = parseFloat(await laundryHelper.getSetting('max_cash_order_amount', '500'));
                if (subtotal > maxCash) return res.status(400).json({ status: 'error', message: 'Cash order exceeds max' });
            }

            const orderNumber = laundryHelper.generateOrderNumber();
            const completionCode = laundryHelper.generateCompletionCode();

            const r = await run(
                `INSERT INTO laundry_orders
                 (order_number, student_id, payment_method, order_status, payment_status,
                  subtotal, total_amount, commission_amount, provider_amount,
                  location, location_lat, location_lng, completion_code, notes)
                 VALUES (?, ?, ?, 'requested', 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [orderNumber, studentId, payment_method || 'mobile_money',
                 subtotal, subtotal, commission, providerAmount,
                 location || null, location_lat || null, location_lng || null,
                 completionCode, notes || null]
            );
            const orderId = r.lastID;
            for (const li of lineItems) {
                await run(
                    `INSERT INTO laundry_order_items (order_id, item_type, quantity, unit_price, subtotal)
                     VALUES (?, ?, ?, ?, ?)`,
                    [orderId, li.item_type, li.quantity, li.unit_price, li.subtotal]
                );
            }
            const order = await get('SELECT * FROM laundry_orders WHERE id = ?', [orderId]);
            res.status(201).json({ status: 'success', message: 'Order created', data: order });
        } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
    });

    // PAY
    app.post('/api/laundry/orders/:id/pay', async (req, res) => {
        try {
            const { method, external_transaction_id } = req.body;
            const order = await get('SELECT * FROM laundry_orders WHERE id = ?', [req.params.id]);
            if (!order) return res.status(404).json({ status: 'error', message: 'Order not found' });
            if (order.payment_status === 'confirmed') return res.status(400).json({ status: 'error', message: 'Already paid' });

            await run(
                `INSERT INTO laundry_payments (order_id, student_id, amount, method, external_transaction_id, status)
                 VALUES (?, ?, ?, ?, ?, 'pending')`,
                [order.id, order.student_id, order.total_amount, method, external_transaction_id || null]
            );

            if (method === 'mobile_money') {
                await run(`UPDATE laundry_orders SET payment_status = 'confirmed', order_status = 'payment_confirmed',
                           payment_method = 'mobile_money', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [order.id]);
                res.json({ status: 'success', message: 'Payment confirmed (mock)',
                           data: await get('SELECT * FROM laundry_orders WHERE id = ?', [order.id]) });
            } else if (method === 'cash') {
                await run(`UPDATE laundry_orders SET payment_method = 'cash', order_status = 'payment_confirmed',
                           payment_status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [order.id]);
                res.json({ status: 'success', message: 'Cash order placed',
                           data: await get('SELECT * FROM laundry_orders WHERE id = ?', [order.id]) });
            } else {
                res.status(400).json({ status: 'error', message: 'Unknown payment method' });
            }
        } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
    });

    // ASSIGN PROVIDER
    app.post('/api/laundry/orders/:id/assign', async (req, res) => {
        try {
            const order = await get('SELECT * FROM laundry_orders WHERE id = ?', [req.params.id]);
            if (!order) return res.status(404).json({ status: 'error', message: 'Order not found' });
            if (order.provider_id) return res.status(400).json({ status: 'error', message: 'Already assigned' });

            await laundryHelper.setOrderState(order.id, 'provider_searching');
            const provider = await laundryHelper.pickProviderForOrder(order);
            if (!provider) return res.status(404).json({ status: 'error', message: 'No available provider' });

            await run(`UPDATE laundry_orders SET provider_id = ?, order_status = 'provider_assigned',
                       updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [provider.id, order.id]);
            await run(`UPDATE laundry_providers SET availability_status = 'busy',
                       updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [provider.id]);

            const student = await get(`
                SELECT u.full_name, u.phone FROM students s
                JOIN users u ON s.user_id = u.user_id WHERE s.student_id = ?
            `, [order.student_id]);

            const items = await all('SELECT item_type, quantity FROM laundry_order_items WHERE order_id = ?', [order.id]);
            const itemsText = items.map(i => i.quantity + 'x ' + i.item_type).join(', ');

            await laundryHelper.sendSms(provider.phone,
                'NEW EU PONKALA ORDER ' + order.order_number + '\n' +
                'Student: ' + student.full_name + '\n' +
                'Phone: ' + student.phone + '\n' +
                'Location: ' + order.location + '\n' +
                'Items: ' + itemsText + '\n' +
                'Amount: K' + order.total_amount + ' (' + order.payment_method + ')\n' +
                'Please call the student to confirm arrival.');

            await laundryHelper.setOrderState(order.id, 'provider_contacted');

            res.json({
                status: 'success',
                message: 'Provider assigned',
                data: {
                    order: await get('SELECT * FROM laundry_orders WHERE id = ?', [order.id]),
                    provider: {
                        id: provider.id, name: provider.name, phone: provider.phone,
                        whatsapp: provider.mobile_money_number || provider.phone,
                        verification_status: provider.verification_status,
                        availability_status: 'busy', service_area: provider.service_area
                    },
                    student: { name: student.full_name, phone: student.phone }
                }
            });
        } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
    });

    // UPDATE STATE
    app.put('/api/laundry/orders/:id/state', async (req, res) => {
        try {
            const order = await get('SELECT * FROM laundry_orders WHERE id = ?', [req.params.id]);
            if (!order) return res.status(404).json({ status: 'error', message: 'Order not found' });
            await laundryHelper.setOrderState(order.id, req.body.state);
            res.json({ status: 'success', data: await get('SELECT * FROM laundry_orders WHERE id = ?', [order.id]) });
        } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
    });

    // GET SINGLE ORDER
    app.get('/api/laundry/orders/order/:id', async (req, res) => {
        try {
            const order = await get('SELECT * FROM laundry_orders WHERE id = ?', [req.params.id]);
            if (!order) return res.status(404).json({ status: 'error', message: 'Order not found' });
            order.items = await all('SELECT * FROM laundry_order_items WHERE order_id = ?', [order.id]);
            if (order.provider_id) {
                order.provider = await get(
                    'SELECT id, name, phone, mobile_money_number, verification_status, availability_status, service_area FROM laundry_providers WHERE id = ?',
                    [order.provider_id]);
            }
            res.json({ status: 'success', data: order });
        } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
    });

    // ORDER HISTORY
    app.get('/api/laundry/orders/:userId', async (req, res) => {
        try {
            const studentId = await getStudentId(req.params.userId);
            if (!studentId) return res.status(404).json({ status: 'error', message: 'Student not found' });
            const orders = await all('SELECT * FROM laundry_orders WHERE student_id = ? ORDER BY created_at DESC', [studentId]);
            res.json({ status: 'success', data: orders });
        } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
    });

    // COMPLETE
    app.put('/api/laundry/orders/:id/complete', async (req, res) => {
        try {
            const updated = await laundryHelper.completeOrder(req.params.id, req.body.code);
            res.json({ status: 'success', message: 'Order completed', data: updated });
        } catch (err) { res.status(400).json({ status: 'error', message: err.message }); }
    });

    // PROVIDERS (admin)
    app.get('/api/laundry/providers', async (req, res) => {
        try {
            const rows = await all('SELECT * FROM laundry_providers ORDER BY created_at DESC');
            res.json({ status: 'success', data: rows });
        } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
    });
    app.post('/api/laundry/providers', async (req, res) => {
        try {
            const { name, phone, mobile_money_number, location, service_area, cash_eligible } = req.body;
            if (!name || !phone) return res.status(400).json({ status: 'error', message: 'Name and phone required' });
            const r = await run(
                `INSERT INTO laundry_providers
                 (name, phone, mobile_money_number, location, service_area, cash_eligible, verification_status, availability_status)
                 VALUES (?, ?, ?, ?, ?, ?, 'pending', 'offline')`,
                [name, phone, mobile_money_number || null, location || null, service_area || null, cash_eligible ? 1 : 0]);
            res.status(201).json({ status: 'success', data: await get('SELECT * FROM laundry_providers WHERE id = ?', [r.lastID]) });
        } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
    });
    app.put('/api/laundry/providers/:id', async (req, res) => {
        try {
            const { verification_status, availability_status, cash_eligible, service_area, wallet_balance, notes } = req.body;
            const fields = []; const values = [];
            if (verification_status) { fields.push('verification_status = ?'); values.push(verification_status); }
            if (availability_status) { fields.push('availability_status = ?'); values.push(availability_status); }
            if (cash_eligible !== undefined) { fields.push('cash_eligible = ?'); values.push(cash_eligible ? 1 : 0); }
            if (service_area) { fields.push('service_area = ?'); values.push(service_area); }
            if (wallet_balance !== undefined) { fields.push('wallet_balance = ?'); values.push(wallet_balance); }
            if (notes !== undefined) { fields.push('notes = ?'); values.push(notes); }
            if (!fields.length) return res.status(400).json({ status: 'error', message: 'No fields' });
            values.push(req.params.id);
            await run(`UPDATE laundry_providers SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, values);
            res.json({ status: 'success', data: await get('SELECT * FROM laundry_providers WHERE id = ?', [req.params.id]) });
        } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
    });

    // PRICING (admin)
    app.put('/api/laundry/admin/pricing/:itemId', async (req, res) => {
        try {
            await run(`UPDATE laundry_items SET unit_price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                      [req.body.unit_price, req.params.itemId]);
            res.json({ status: 'success', data: await get('SELECT * FROM laundry_items WHERE id = ?', [req.params.itemId]) });
        } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
    });

    // SETTINGS (admin)
    app.get('/api/laundry/admin/settings', async (req, res) => {
        try {
            const rows = await all('SELECT * FROM laundry_settings ORDER BY key');
            const obj = {};
            rows.forEach(r => obj[r.key] = r.value);
            res.json({ status: 'success', data: obj });
        } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
    });
    app.put('/api/laundry/admin/settings', async (req, res) => {
        try {
            for (const [k, v] of Object.entries(req.body)) await laundryHelper.setSetting(k, v);
            res.json({ status: 'success', message: 'Settings updated' });
        } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
    });

    // DASHBOARD (admin)
    app.get('/api/laundry/admin/dashboard', async (req, res) => {
        try {
            const total = (await get('SELECT COUNT(*) c FROM laundry_orders')).c;
            const active = (await get('SELECT COUNT(*) c FROM laundry_orders WHERE order_status NOT IN ("completed","cancelled")')).c;
            const completed = (await get('SELECT COUNT(*) c FROM laundry_orders WHERE order_status = "completed"')).c;
            const cancelled = (await get('SELECT COUNT(*) c FROM laundry_orders WHERE order_status = "cancelled"')).c;
            const revenue = (await get('SELECT COALESCE(SUM(total_amount),0) s FROM laundry_orders WHERE order_status = "completed"')).s;
            const commission = (await get('SELECT COALESCE(SUM(commission_amount),0) s FROM laundry_orders WHERE order_status = "completed"')).s;
            const providers = (await get('SELECT COUNT(*) c FROM laundry_providers')).c;
            const availableProviders = (await get('SELECT COUNT(*) c FROM laundry_providers WHERE verification_status = "verified" AND availability_status = "available"')).c;
            const cashOrders = (await get('SELECT COUNT(*) c FROM laundry_orders WHERE payment_method = "cash"')).c;
            const momoOrders = (await get('SELECT COUNT(*) c FROM laundry_orders WHERE payment_method = "mobile_money"')).c;
            const walletTotal = (await get('SELECT COALESCE(SUM(wallet_balance),0) s FROM laundry_providers')).s;
            res.json({
                status: 'success',
                data: {
                    orders: { total, active, completed, cancelled },
                    revenue: { gmv: revenue, commission },
                    providers: { total: providers, available: availableProviders, wallet_total: walletTotal },
                    methods: { cash: cashOrders, mobile_money: momoOrders }
                }
            });
        } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
    });

    // WALLET LEDGER (admin)
    app.get('/api/laundry/admin/wallet/:providerId', async (req, res) => {
        try {
            const provider = await get('SELECT * FROM laundry_providers WHERE id = ?', [req.params.providerId]);
            if (!provider) return res.status(404).json({ status: 'error', message: 'Provider not found' });
            const ledger = await all(
                'SELECT * FROM commission_wallet_transactions WHERE provider_id = ? ORDER BY id DESC LIMIT 200',
                [req.params.providerId]);
            res.json({ status: 'success', data: { provider, ledger } });
        } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
    });

    // SMS OUTBOX (admin)
    app.get('/api/laundry/admin/sms', async (req, res) => {
        try {
            const rows = await all('SELECT * FROM laundry_sms_outbox ORDER BY id DESC LIMIT 100');
            res.json({ status: 'success', data: rows });
        } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
    });
};



