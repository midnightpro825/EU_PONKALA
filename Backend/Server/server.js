// =============================================
// EU PONKALA — Server v2.2 (SQLite + Uploads + Chat)
// =============================================
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const { run, get, all, init } = require('./db');
const { upload } = require('./uploads');
const { initSocket } = require('./socket');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Middleware ───
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// --- Legacy redirect shims (M1) ---
require('./routes/legacy-redirects')(app);

// ─── MIME types ───
express.static.mime.define({
    'text/css': ['css'],
    'application/javascript': ['js'],
    'image/svg+xml': ['svg']
});

// ─── Static serving ───
// ── Student sub-routes (must come BEFORE static handlers) ──
app.get('/search',  (req, res) => res.sendFile(path.join(__dirname, '../../Frontend/Student/search.html')));
app.get('/laundry', (req, res) => res.sendFile(path.join(__dirname, '../../Frontend/Student/laundry.html')));
app.get('/wheelbarrow', (req, res) => res.sendFile(path.join(__dirname, '../../Frontend/Student/wheelbarrow.html')));
app.get('/washer', (req, res) => res.sendFile(path.join(__dirname, '../../Frontend/Washer/index.html')));
app.get('/provider', (req, res) => res.sendFile(path.join(__dirname, '../../Frontend/Provider/index.html')));
app.get('/provider/register', (req, res) => res.sendFile(path.join(__dirname, '../../Frontend/Provider/register.html')));
app.get('/provider/topup', (req, res) => res.sendFile(path.join(__dirname, '../../Frontend/Provider/topup.html')));
app.get('/washer/register', (req, res) => res.sendFile(path.join(__dirname, '../../Frontend/Washer/register.html')));
app.get('/saved',   (req, res) => res.sendFile(path.join(__dirname, '../../Frontend/Student/saved.html')));
app.get('/profile', (req, res) => res.sendFile(path.join(__dirname, '../../Frontend/Student/profile.html')));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/images',  express.static(path.join(__dirname, '../../Frontend/public/images')));
app.use(express.static(path.join(__dirname, '../../')));
app.use('/pages', express.static(path.join(__dirname, '../../Frontend/pages'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.css')) res.setHeader('Content-Type', 'text/css; charset=UTF-8');
        if (filePath.endsWith('.js'))  res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
    }
}));
app.use('/shared', express.static(path.join(__dirname, '../../Frontend/shared')));

// LAUNDRY MODULE ROUTES (Batch 1)
// ═══════════════════════════════════════════════
const laundryHelper = require('./laundry');

// ---- Public: item price list ----
app.get('/api/laundry/items', async (req, res) => {
    try {
        const items = await all('SELECT * FROM laundry_items WHERE is_active = 1 ORDER BY display_name');
        res.json({ status: 'success', data: items });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// ---- Access: check student's connection balance ----
app.get('/api/laundry/access/:userId', async (req, res) => {
    try {
        const studentId = await getStudentId(req.params.userId);
        if (!studentId) return res.status(404).json({ status: 'error', message: 'Student not found' });

        const active = await get(
            `SELECT * FROM laundry_access_subscriptions
             WHERE student_id = ? AND status = 'active'
             ORDER BY id DESC LIMIT 1`,
            [studentId]
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
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// ---- Unlock access (buy K50 = 4 connections) ----
app.post('/api/laundry/unlock', async (req, res) => {
    try {
        const { student_user_id, payment_method, payment_reference } = req.body;
        const studentId = await getStudentId(student_user_id);
        if (!studentId) return res.status(404).json({ status: 'error', message: 'Student not found' });

        const price = parseFloat(await laundryHelper.getSetting('access_package_price', '50'));
        const conns = parseInt(await laundryHelper.getSetting('access_package_connections', '4'));

        // Optionally stack onto existing active subscription
        const existing = await get(
            `SELECT * FROM laundry_access_subscriptions
             WHERE student_id = ? AND status = 'active'
             ORDER BY id DESC LIMIT 1`,
            [studentId]
        );

        if (existing) {
            await run(
                `UPDATE laundry_access_subscriptions
                 SET connections_remaining = connections_remaining + ?, connections_purchased = connections_purchased + ?
                 WHERE id = ?`,
                [conns, conns, existing.id]
            );
            const updated = await get('SELECT * FROM laundry_access_subscriptions WHERE id = ?', [existing.id]);
            return res.json({ status: 'success', message: 'Connections topped up', data: updated });
        }

        const result = await run(
            `INSERT INTO laundry_access_subscriptions
             (student_id, package_price, connections_purchased, connections_remaining, status, payment_method, payment_reference)
             VALUES (?, ?, ?, ?, 'active', ?, ?)`,
            [studentId, price, conns, conns, payment_method || 'mock', payment_reference || null]
        );
        const sub = await get('SELECT * FROM laundry_access_subscriptions WHERE id = ?', [result.lastID]);
        res.status(201).json({ status: 'success', message: 'Laundry unlocked', data: sub });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// ---- Create a laundry order ----
app.post('/api/laundry/orders', async (req, res) => {
    try {
        const { student_user_id, items, payment_method, location, location_lat, location_lng, notes } = req.body;
        const studentId = await getStudentId(student_user_id);
        if (!studentId) return res.status(404).json({ status: 'error', message: 'Student not found' });

        // Check access
        const sub = await get(
            `SELECT * FROM laundry_access_subscriptions
             WHERE student_id = ? AND status = 'active' AND connections_remaining > 0
             ORDER BY id DESC LIMIT 1`,
            [studentId]
        );
        if (!sub) return res.status(403).json({ status: 'error', message: 'Laundry not unlocked. Purchase the K50 package first.' });

        // Server-side price calculation
        const { subtotal, lineItems } = await laundryHelper.calculateOrderSubtotal(items);

        // Commission
        const rate = await laundryHelper.getCommissionRate();
        const commission = +(subtotal * rate).toFixed(2);
        const providerAmount = +(subtotal - commission).toFixed(2);

        // Cash order limit check
        if (payment_method === 'cash') {
            const cashEnabled = await laundryHelper.getSetting('cash_enabled', '1');
            if (cashEnabled !== '1') return res.status(400).json({ status: 'error', message: 'Cash payments are currently disabled' });
            const maxCash = parseFloat(await laundryHelper.getSetting('max_cash_order_amount', '500'));
            if (subtotal > maxCash) return res.status(400).json({ status: 'error', message: 'Cash order exceeds maximum of K' + maxCash });
        }

        // Generate numbers
        const orderNumber = laundryHelper.generateOrderNumber();
        const completionCode = laundryHelper.generateCompletionCode();

        // Insert order
        const result = await run(
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
        const orderId = result.lastID;

        // Insert line items
        for (const li of lineItems) {
            await run(
                `INSERT INTO laundry_order_items (order_id, item_type, quantity, unit_price, subtotal)
                 VALUES (?, ?, ?, ?, ?)`,
                [orderId, li.item_type, li.quantity, li.unit_price, li.subtotal]
            );
        }

        const order = await get('SELECT * FROM laundry_orders WHERE id = ?', [orderId]);
        res.status(201).json({ status: 'success', message: 'Order created', data: order });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// ---- Pay for an order (momo or cash) ----
app.post('/api/laundry/orders/:id/pay', async (req, res) => {
    try {
        const { method, external_transaction_id } = req.body;
        const order = await get('SELECT * FROM laundry_orders WHERE id = ?', [req.params.id]);
        if (!order) return res.status(404).json({ status: 'error', message: 'Order not found' });
        if (order.payment_status === 'confirmed') return res.status(400).json({ status: 'error', message: 'Already paid' });

        // Record payment
        await run(
            `INSERT INTO laundry_payments
             (order_id, student_id, amount, method, external_transaction_id, status)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [order.id, order.student_id, order.total_amount, method, external_transaction_id || null,
             method === 'cash' ? 'pending' : 'pending']
        );

        if (method === 'mobile_money') {
            // V1: mark confirmed immediately (real integration swaps this for a webhook)
            await run(
                `UPDATE laundry_orders SET payment_status = 'confirmed', order_status = 'payment_confirmed', payment_method = 'mobile_money', updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [order.id]
            );
            res.json({ status: 'success', message: 'Payment confirmed (mock)', data: await get('SELECT * FROM laundry_orders WHERE id = ?', [order.id]) });
        } else if (method === 'cash') {
            // Cash: still needs provider to accept
            await run(
                `UPDATE laundry_orders SET payment_method = 'cash', order_status = 'payment_confirmed', payment_status = 'pending', updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [order.id]
            );
            res.json({ status: 'success', message: 'Cash order placed — provider will collect payment', data: await get('SELECT * FROM laundry_orders WHERE id = ?', [order.id]) });
        } else {
            res.status(400).json({ status: 'error', message: 'Unknown payment method' });
        }
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// ---- Assign provider to order ----

// ---- Get single order ----
app.get('/api/laundry/orders/order/:id', async (req, res) => {
    try {
        const order = await get('SELECT * FROM laundry_orders WHERE id = ?', [req.params.id]);
        if (!order) return res.status(404).json({ status: 'error', message: 'Order not found' });
        order.items = await all('SELECT * FROM laundry_order_items WHERE order_id = ?', [order.id]);
        if (order.provider_id) {
            order.provider = await get('SELECT id, name, phone, verification_status, availability_status FROM laundry_providers WHERE id = ?', [order.provider_id]);
        }
        res.json({ status: 'success', data: order });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// ---- Order history for a student ----
app.get('/api/laundry/orders/:userId', async (req, res) => {
    try {
        const studentId = await getStudentId(req.params.userId);
        if (!studentId) return res.status(404).json({ status: 'error', message: 'Student not found' });
        const orders = await all(
            `SELECT * FROM laundry_orders WHERE student_id = ? ORDER BY created_at DESC`,
            [studentId]
        );
        res.json({ status: 'success', data: orders });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// ---- Complete order via code (transaction-safe connection deduction) ----
app.put('/api/laundry/orders/:id/complete', async (req, res) => {
    try {
        const { code } = req.body;
        const order = await get('SELECT * FROM laundry_orders WHERE id = ?', [req.params.id]);
        if (!order) return res.status(404).json({ status: 'error', message: 'Order not found' });

        if (order.order_status === 'completed') {
            return res.status(400).json({ status: 'error', message: 'Order already completed' });
        }
        if (order.completion_code_status === 'used') {
            return res.status(400).json({ status: 'error', message: 'Completion code already used' });
        }
        if (String(order.completion_code) !== String(code)) {
            return res.status(400).json({ status: 'error', message: 'Invalid completion code' });
        }
        if (order.connection_consumed === 1) {
            return res.status(400).json({ status: 'error', message: 'Connection already consumed' });
        }

        // Transaction-safe deduction: only deduct if connection_consumed flips 0 -> 1
        const update = await run(
            `UPDATE laundry_orders SET
                order_status = 'completed',
                payment_status = CASE WHEN payment_method = 'cash' THEN 'confirmed' ELSE payment_status END,
                completion_code_status = 'used',
                connection_consumed = 1,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND connection_consumed = 0`,
            [order.id]
        );

        if (update.changes === 0) {
            return res.status(400).json({ status: 'error', message: 'Connection already consumed (duplicate)' });
        }

        // Deduct one connection from the student's active subscription
        await run(
            `UPDATE laundry_access_subscriptions
             SET connections_remaining = MAX(0, connections_remaining - 1),
                 status = CASE WHEN connections_remaining - 1 <= 0 THEN 'exhausted' ELSE status END
             WHERE id = (
                SELECT id FROM laundry_access_subscriptions
                WHERE student_id = ? AND status = 'active'
                ORDER BY id DESC LIMIT 1
             )`,
            [order.student_id]
        );

        // Cash: deduct 15% commission from provider wallet
        if (order.payment_method === 'cash' && order.provider_id) {
            await laundryHelper.walletTransaction(
                order.provider_id, order.id, 'commission',
                -Math.abs(order.commission_amount),
                'Commission for ' + order.order_number
            );
        }

        // Payment record finalize
        await run(
            `UPDATE laundry_payments SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP WHERE order_id = ?`,
            [order.id]
        );

        const updated = await get('SELECT * FROM laundry_orders WHERE id = ?', [order.id]);
        res.json({ status: 'success', message: 'Order completed', data: updated });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// ---- Admin: providers ----
app.get('/api/laundry/providers', async (req, res) => {
    try {
        const rows = await all('SELECT * FROM laundry_providers ORDER BY created_at DESC');
        res.json({ status: 'success', data: rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.post('/api/laundry/providers', async (req, res) => {
    try {
        const { name, phone, mobile_money_number, location, service_area, cash_eligible } = req.body;
        if (!name || !phone) return res.status(400).json({ status: 'error', message: 'Name and phone required' });
        const result = await run(
            `INSERT INTO laundry_providers
             (name, phone, mobile_money_number, location, service_area, cash_eligible, verification_status, availability_status)
             VALUES (?, ?, ?, ?, ?, ?, 'pending', 'offline')`,
            [name, phone, mobile_money_number || null, location || null, service_area || null, cash_eligible ? 1 : 0]
        );
        const provider = await get('SELECT * FROM laundry_providers WHERE id = ?', [result.lastID]);
        res.status(201).json({ status: 'success', data: provider });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.put('/api/laundry/providers/:id', async (req, res) => {
    try {
        const { verification_status, availability_status, cash_eligible, service_area, wallet_balance, notes } = req.body;
        const p = await get('SELECT * FROM laundry_providers WHERE id = ?', [req.params.id]);
        if (!p) return res.status(404).json({ status: 'error', message: 'Provider not found' });

        const fields = [];
        const values = [];
        if (verification_status) { fields.push('verification_status = ?'); values.push(verification_status); }
        if (availability_status) { fields.push('availability_status = ?'); values.push(availability_status); }
        if (cash_eligible !== undefined) { fields.push('cash_eligible = ?'); values.push(cash_eligible ? 1 : 0); }
        if (service_area) { fields.push('service_area = ?'); values.push(service_area); }
        if (wallet_balance !== undefined) { fields.push('wallet_balance = ?'); values.push(wallet_balance); }
        if (notes !== undefined) { fields.push('notes = ?'); values.push(notes); }
        if (!fields.length) return res.status(400).json({ status: 'error', message: 'No fields to update' });

        values.push(req.params.id);
        await run(`UPDATE laundry_providers SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, values);
        const updated = await get('SELECT * FROM laundry_providers WHERE id = ?', [req.params.id]);
        res.json({ status: 'success', data: updated });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// ---- Admin: pricing management ----
app.put('/api/laundry/admin/pricing/:itemId', async (req, res) => {
    try {
        const { unit_price } = req.body;
        await run(
            `UPDATE laundry_items SET unit_price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [unit_price, req.params.itemId]
        );
        res.json({ status: 'success', data: await get('SELECT * FROM laundry_items WHERE id = ?', [req.params.itemId]) });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// ---- Admin: settings ----
app.get('/api/laundry/admin/settings', async (req, res) => {
    try {
        const rows = await all('SELECT * FROM laundry_settings ORDER BY key');
        const obj = {};
        rows.forEach(r => obj[r.key] = r.value);
        res.json({ status: 'success', data: obj });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.put('/api/laundry/admin/settings', async (req, res) => {
    try {
        for (const [k, v] of Object.entries(req.body)) {
            await laundryHelper.setSetting(k, v);
        }
        res.json({ status: 'success', message: 'Settings updated' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// ---- Admin: dashboard metrics ----
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

        res.json({
            status: 'success',
            data: {
                orders: { total, active, completed, cancelled },
                revenue: { gmv: revenue, commission },
                providers: { total: providers, available: availableProviders },
                methods: { cash: cashOrders, mobile_money: momoOrders }
            }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// ---- Admin: wallet ledger for a provider ----
app.get('/api/laundry/admin/wallet/:providerId', async (req, res) => {
    try {
        const provider = await get('SELECT * FROM laundry_providers WHERE id = ?', [req.params.providerId]);
        if (!provider) return res.status(404).json({ status: 'error', message: 'Provider not found' });
        const ledger = await all(
            'SELECT * FROM commission_wallet_transactions WHERE provider_id = ? ORDER BY id DESC LIMIT 100',
            [req.params.providerId]
        );
        res.json({ status: 'success', data: { provider, ledger } });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// ---- SMS outbox (admin view) ----
app.get('/api/laundry/admin/sms', async (req, res) => {
    try {
        const rows = await all('SELECT * FROM laundry_sms_outbox ORDER BY id DESC LIMIT 100');
        res.json({ status: 'success', data: rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

console.log('🧺 Laundry routes loaded');


// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════
const safeUser = (u) => {
    if (!u) return null;
    const { password_hash, ...rest } = u;
    return rest;
};

const getStudentId = async (userId) => {
    const row = await get('SELECT student_id FROM students WHERE user_id = ?', [userId]);
    return row ? row.student_id : null;
};

const getLandlordId = async (userId) => {
    const row = await get('SELECT landlord_id FROM landlords WHERE user_id = ?', [userId]);
    return row ? row.landlord_id : null;
};

//  LAUNDRY MODULE (full flow) 
const registerLaundryRoutes = require('./laundry-routes');
const registerLaundryCancel = require('./laundry-cancel-route');
const registerServicesRoutes = require('./services-routes');
const assignJob = require('./assign-job');
registerLaundryRoutes(app, { getStudentId });
registerLaundryCancel(app);
registerServicesRoutes(app, { getStudentId });
assignJob.startAssignJob();


// ═══════════════════════════════════════════════
// FRONTEND ROUTES
// ═══════════════════════════════════════════════
app.get('/',         (req, res) => res.sendFile(path.join(__dirname, '../../index.html')));
app.get('/login',    (req, res) => res.sendFile(path.join(__dirname, '../../Frontend/login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, '../../Frontend/register.html')));
app.get('/student',  (req, res) => res.sendFile(path.join(__dirname, '../../Frontend/Student/index.html')));
app.get('/student/property', (req, res) => res.sendFile(path.join(__dirname, '../../Frontend/Student/property-detail.html')));
app.get('/landlord', (req, res) => res.sendFile(path.join(__dirname, '../../Frontend/Landlord/index.html')));
app.get('/admin',    (req, res) => res.sendFile(path.join(__dirname, '../../Frontend/Admin/index.html')));

const staticPages = [
    'platform','features','support','help-center','faq',
    'contact-us','report-an-issue','about-us',
    'terms-of-service','privacy-policy','cookie-policy',
    'student-dashboard','landlord-dashboard','admin-dashboard',
    'gallery'
];
staticPages.forEach(page => {
    app.get('/pages/' + page,        (req, res) => res.sendFile(path.join(__dirname, `../../Frontend/pages/${page}.html`)));
    app.get('/pages/' + page + '.html', (req, res) => res.sendFile(path.join(__dirname, `../../Frontend/pages/${page}.html`)));
});

// ═══════════════════════════════════════════════
// API: HEALTH
// ═══════════════════════════════════════════════
app.get('/api/health', async (req, res) => {
    try {
        const users = await get('SELECT COUNT(*) AS c FROM users');
        const props = await get('SELECT COUNT(*) AS c FROM properties');
        const rooms = await get('SELECT COUNT(*) AS c FROM rooms');
        const photos = await get('SELECT COUNT(*) AS c FROM photos');
        const convs = await get('SELECT COUNT(*) AS c FROM conversations');
        const msgs  = await get('SELECT COUNT(*) AS c FROM messages');
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: '2.2.0',
            users_count: users.c,
            properties_count: props.c,
            rooms_count: rooms.c,
            photos_count: photos.c,
            conversations_count: convs.c,
            messages_count: msgs.c
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// ═══════════════════════════════════════════════
// API: AUTH
// ═══════════════════════════════════════════════
app.post('/api/auth/register', async (req, res) => {
    try {
        const { full_name, phone, email, password, user_type, university_id, course, year_of_study, business_name, whatsapp } = req.body;
        if (!full_name || !email || !password || !user_type) {
            return res.status(400).json({ status: 'error', message: 'All required fields must be provided' });
        }

        const existing = await get('SELECT user_id FROM users WHERE email = ?', [email]);
        if (existing) return res.status(400).json({ status: 'error', message: 'User with this email already exists' });

        const hash = await bcrypt.hash(password, 10);
        const result = await run(
            `INSERT INTO users (full_name, email, phone, password_hash, user_type) VALUES (?, ?, ?, ?, ?)`,
            [full_name, email, phone || '', hash, user_type]
        );
        const userId = result.lastID;

        if (user_type === 'student') {
            await run(
                `INSERT INTO students (user_id, university_id, course, year_of_study) VALUES (?, ?, ?, ?)`,
                [userId, university_id || 1, course || '', year_of_study || 1]
            );
        } else if (user_type === 'landlord') {
            await run(
                `INSERT INTO landlords (user_id, business_name, whatsapp_number) VALUES (?, ?, ?)`,
                [userId, business_name || '', whatsapp || phone || '']
            );
        }

        const user = await get('SELECT * FROM users WHERE user_id = ?', [userId]);
        res.status(201).json({
            status: 'success',
            message: 'User registered successfully',
            data: { token: 'token_' + Date.now(), user: safeUser(user) }
        });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ status: 'error', message: 'Email and password are required' });
        }
        const user = await get('SELECT * FROM users WHERE email = ?', [email]);
        if (!user) return res.status(401).json({ status: 'error', message: 'Invalid email or password' });

        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) return res.status(401).json({ status: 'error', message: 'Invalid email or password' });

        let profile = null;
        if (user.user_type === 'student') profile = await get('SELECT * FROM students WHERE user_id = ?', [user.user_id]);
        if (user.user_type === 'landlord') profile = await get('SELECT * FROM landlords WHERE user_id = ?', [user.user_id]);

        res.json({
            status: 'success',
            message: 'Login successful',
            data: { token: 'token_' + Date.now(), user: { ...safeUser(user), profile } }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// ═══════════════════════════════════════════════
// API: PROPERTIES
// ═══════════════════════════════════════════════
app.get('/api/properties', async (req, res) => {
    try {
        const props = await all(`
            SELECT p.*,
                   u.user_id   AS landlord_user_id,
                   u.full_name AS landlord_name,
                   u.phone AS landlord_phone,
                   u.email AS landlord_email,
                   l.whatsapp_number,
                   l.business_name,
                   (SELECT COUNT(*) FROM rooms WHERE property_id = p.property_id) AS total_rooms,
                   (SELECT COALESCE(SUM(available),0) FROM rooms WHERE property_id = p.property_id) AS available_spaces,
                   (SELECT COALESCE(SUM(occupied),0) FROM rooms WHERE property_id = p.property_id) AS occupied_beds
            FROM properties p
            LEFT JOIN landlords l ON p.landlord_id = l.landlord_id
            LEFT JOIN users u ON l.user_id = u.user_id
            WHERE p.is_active = 1
            ORDER BY p.is_verified DESC, p.created_at DESC
        `);

        for (const p of props) {
            p.rooms = await all('SELECT * FROM rooms WHERE property_id = ? ORDER BY room_id', [p.property_id]);
            p.photos = await all('SELECT * FROM photos WHERE property_id = ? ORDER BY is_primary DESC, photo_id', [p.property_id]);
            p.facilities = (await all(`
                SELECT f.facility_name FROM property_facilities pf
                JOIN facilities f ON pf.facility_id = f.facility_id
                WHERE pf.property_id = ?
            `, [p.property_id])).map(r => r.facility_name);
            p.landlord = {
                name: p.landlord_name,
                phone: p.landlord_phone,
                email: p.landlord_email,
                whatsapp: p.whatsapp_number,
                business_name: p.business_name,
                user_id: p.landlord_user_id
            };
            p.status = p.is_full ? 'full' : (p.available_spaces > 0 ? 'available' : 'pending');
        }

        res.json({ status: 'success', data: props, count: props.length });
    } catch (err) {
        console.error('Get properties error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.get('/api/properties/search', async (req, res) => {
    try {
        const q = '%' + (req.query.q || '').toLowerCase() + '%';
        const rows = await all(`
            SELECT p.*, u.full_name AS landlord_name
            FROM properties p
            LEFT JOIN landlords l ON p.landlord_id = l.landlord_id
            LEFT JOIN users u ON l.user_id = u.user_id
            WHERE p.is_active = 1
              AND (LOWER(p.property_name) LIKE ? OR LOWER(p.area) LIKE ? OR LOWER(p.address) LIKE ?)
        `, [q, q, q]);
        res.json({ status: 'success', data: rows, query: req.query.q });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.get('/api/properties/:id', async (req, res) => {
    try {
        const p = await get(`
            SELECT p.*,
                   u.user_id AS landlord_user_id,
                   u.full_name AS landlord_name,
                   u.phone AS landlord_phone,
                   u.email AS landlord_email,
                   l.whatsapp_number,
                   l.business_name
            FROM properties p
            LEFT JOIN landlords l ON p.landlord_id = l.landlord_id
            LEFT JOIN users u ON l.user_id = u.user_id
            WHERE p.property_id = ?
        `, [req.params.id]);
        if (!p) return res.status(404).json({ status: 'error', message: 'Property not found' });

        p.rooms = await all('SELECT * FROM rooms WHERE property_id = ?', [p.property_id]);
        for (const r of p.rooms) {
            r.photos = await all('SELECT * FROM photos WHERE room_id = ? ORDER BY is_primary DESC, photo_id DESC', [r.room_id]);
        }
        p.photos = await all('SELECT * FROM photos WHERE property_id = ? ORDER BY is_primary DESC, photo_id DESC', [p.property_id]);
        p.facilities = (await all(`
            SELECT f.facility_name FROM property_facilities pf
            JOIN facilities f ON pf.facility_id = f.facility_id
            WHERE pf.property_id = ?
        `, [p.property_id])).map(r => r.facility_name);
        p.landlord = {
            name: p.landlord_name,
            phone: p.landlord_phone,
            email: p.landlord_email,
            whatsapp: p.whatsapp_number,
            user_id: p.landlord_user_id
        };

        res.json({ status: 'success', data: p });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.post('/api/properties', async (req, res) => {
    try {
        const { landlord_user_id, property_name, description, address, area, monthly_price, deposit, latitude, longitude } = req.body;
        const landlordId = await getLandlordId(landlord_user_id) || 1;
        const result = await run(`
            INSERT INTO properties (landlord_id, property_name, description, address, area, monthly_price, deposit, latitude, longitude)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [landlordId, property_name, description || '', address, area || 'Lusaka', monthly_price, deposit || 0, latitude || null, longitude || null]);

        res.status(201).json({ status: 'success', message: 'Property created', data: { property_id: result.lastID } });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.put('/api/properties/:id', async (req, res) => {
    try {
        const fields = [];
        const values = [];
        const allowed = ['property_name','description','address','area','monthly_price','deposit','latitude','longitude','is_full','is_active','verification_status','is_verified'];
        for (const [k, v] of Object.entries(req.body)) {
            if (allowed.includes(k)) {
                fields.push(`${k} = ?`);
                values.push(v);
            }
        }
        if (!fields.length) return res.status(400).json({ status: 'error', message: 'No valid fields' });
        values.push(req.params.id);
        await run(`UPDATE properties SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE property_id = ?`, values);
        res.json({ status: 'success', message: 'Property updated' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.delete('/api/properties/:id', async (req, res) => {
    try {
        await run('UPDATE properties SET is_active = 0 WHERE property_id = ?', [req.params.id]);
        res.json({ status: 'success', message: 'Property deleted' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// Full / Vacant toggle
app.put('/api/properties/:id/toggle-full', async (req, res) => {
    try {
        const prop = await get('SELECT is_full FROM properties WHERE property_id = ?', [req.params.id]);
        if (!prop) return res.status(404).json({ status: 'error', message: 'Property not found' });

        const newFull = prop.is_full ? 0 : 1;
        await run('UPDATE properties SET is_full = ?, updated_at = CURRENT_TIMESTAMP WHERE property_id = ?', [newFull, req.params.id]);

        if (newFull === 1) {
            await run(`UPDATE rooms SET occupied = capacity, available = 0, status = 'full' WHERE property_id = ?`, [req.params.id]);
        }

        res.json({
            status: 'success',
            is_full: newFull,
            message: newFull ? 'Property marked as FULL' : 'Property marked as VACANT'
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// ═══════════════════════════════════════════════
// API: PHOTOS
// ═══════════════════════════════════════════════
app.post('/api/photos/upload', upload.array('photos', 10), async (req, res) => {
    try {
        const { property_id, room_id, category, caption } = req.body;
        if (!property_id) return res.status(400).json({ status: 'error', message: 'property_id is required' });
        if (!req.files || !req.files.length) return res.status(400).json({ status: 'error', message: 'No files uploaded' });

        const inserted = [];
        for (const f of req.files) {
            const sub = room_id ? 'rooms' : 'properties';
            const url = '/uploads/' + sub + '/' + f.filename;
            const r = await run(
                `INSERT INTO photos (property_id, room_id, url, category, caption, is_primary)
                 VALUES (?, ?, ?, ?, ?, 0)`,
                [property_id, room_id || null, url, category || 'other', caption || '']
            );
            inserted.push({ photo_id: r.lastID, url, category: category || 'other', room_id: room_id || null });
        }

        res.status(201).json({
            status: 'success',
            message: inserted.length + ' photo(s) uploaded',
            data: inserted
        });
    } catch (err) {
        console.error('Upload error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.get('/api/photos', async (req, res) => {
    try {
        const { property_id, room_id, category } = req.query;
        let sql = 'SELECT * FROM photos WHERE 1=1';
        const params = [];
        if (property_id) { sql += ' AND property_id = ?'; params.push(property_id); }
        if (room_id)     { sql += ' AND room_id = ?';     params.push(room_id); }
        if (category)    { sql += ' AND category = ?';    params.push(category); }
        sql += ' ORDER BY is_primary DESC, photo_id DESC';
        const rows = await all(sql, params);
        res.json({ status: 'success', data: rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.put('/api/photos/:id/primary', async (req, res) => {
    try {
        const photo = await get('SELECT property_id, room_id FROM photos WHERE photo_id = ?', [req.params.id]);
        if (!photo) return res.status(404).json({ status: 'error', message: 'Photo not found' });

        if (photo.room_id) {
            await run('UPDATE photos SET is_primary = 0 WHERE room_id = ?', [photo.room_id]);
        } else {
            await run('UPDATE photos SET is_primary = 0 WHERE property_id = ? AND room_id IS NULL', [photo.property_id]);
        }
        await run('UPDATE photos SET is_primary = 1 WHERE photo_id = ?', [req.params.id]);
        res.json({ status: 'success', message: 'Cover photo updated' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.delete('/api/photos/:id', async (req, res) => {
    try {
        const photo = await get('SELECT url FROM photos WHERE photo_id = ?', [req.params.id]);
        if (!photo) return res.status(404).json({ status: 'error', message: 'Photo not found' });

        const filePath = path.join(__dirname, photo.url);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        await run('DELETE FROM photos WHERE photo_id = ?', [req.params.id]);
        res.json({ status: 'success', message: 'Photo deleted' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// ═══════════════════════════════════════════════
// API: ROOMS
// ═══════════════════════════════════════════════
app.post('/api/rooms', async (req, res) => {
    try {
        const { property_id, room_name, room_type, capacity, price, has_bathroom, notes } = req.body;
        if (!property_id || !room_name) {
            return res.status(400).json({ status: 'error', message: 'property_id and room_name required' });
        }
        const cap = parseInt(capacity) || 2;
        const r = await run(
            `INSERT INTO rooms (property_id, room_name, room_type, capacity, occupied, available, pending, price, has_bathroom, notes, status)
             VALUES (?, ?, ?, ?, 0, ?, 0, ?, ?, ?, 'available')`,
            [property_id, room_name, room_type || 'double', cap, cap, price || 0, has_bathroom ? 1 : 0, notes || '']
        );
        const room = await get('SELECT * FROM rooms WHERE room_id = ?', [r.lastID]);
        res.status(201).json({ status: 'success', message: 'Room added', data: room });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.get('/api/rooms/:propertyId', async (req, res) => {
    try {
        const rooms = await all('SELECT * FROM rooms WHERE property_id = ? ORDER BY room_id', [req.params.propertyId]);
        for (const r of rooms) {
            r.photos = await all('SELECT * FROM photos WHERE room_id = ? ORDER BY is_primary DESC, photo_id DESC', [r.room_id]);
        }
        res.json({ status: 'success', data: rooms });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.put('/api/rooms/:id', async (req, res) => {
    try {
        const { room_name, room_type, capacity, occupied, price, has_bathroom, notes, status } = req.body;
        const room = await get('SELECT * FROM rooms WHERE room_id = ?', [req.params.id]);
        if (!room) return res.status(404).json({ status: 'error', message: 'Room not found' });

        const newCap = capacity !== undefined ? parseInt(capacity) : room.capacity;
        const newOcc = occupied !== undefined ? parseInt(occupied) : room.occupied;

        if (newOcc > newCap) {
            return res.status(400).json({ status: 'error', message: 'Occupied cannot exceed capacity' });
        }

        const newAvailable = Math.max(0, newCap - newOcc);
        let newStatus = status || room.status;
        if (newAvailable === 0) newStatus = 'full';
        else if (newAvailable > 0 && newStatus === 'full') newStatus = 'available';

        await run(
            `UPDATE rooms SET
                room_name = COALESCE(?, room_name),
                room_type = COALESCE(?, room_type),
                capacity = ?,
                occupied = ?,
                available = ?,
                price = COALESCE(?, price),
                has_bathroom = COALESCE(?, has_bathroom),
                notes = COALESCE(?, notes),
                status = ?,
                last_updated = CURRENT_TIMESTAMP
             WHERE room_id = ?`,
            [room_name, room_type, newCap, newOcc, newAvailable, price, has_bathroom, notes, newStatus, req.params.id]
        );

        const updated = await get('SELECT * FROM rooms WHERE room_id = ?', [req.params.id]);
        res.json({ status: 'success', message: 'Room updated', data: updated });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.delete('/api/rooms/:id', async (req, res) => {
    try {
        await run('DELETE FROM rooms WHERE room_id = ?', [req.params.id]);
        res.json({ status: 'success', message: 'Room deleted' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.put('/api/rooms/:id/occupy', async (req, res) => {
    try {
        const { action } = req.body;
        const room = await get('SELECT * FROM rooms WHERE room_id = ?', [req.params.id]);
        if (!room) return res.status(404).json({ status: 'error', message: 'Room not found' });

        let newOcc = room.occupied;
        if (action === 'occupy') newOcc = Math.min(room.capacity, room.occupied + 1);
        else if (action === 'vacate') newOcc = Math.max(0, room.occupied - 1);

        const newAvail = Math.max(0, room.capacity - newOcc);
        const newStatus = newAvail === 0 ? 'full' : 'available';

        await run(
            `UPDATE rooms SET occupied = ?, available = ?, status = ?, last_updated = CURRENT_TIMESTAMP WHERE room_id = ?`,
            [newOcc, newAvail, newStatus, req.params.id]
        );

        const updated = await get('SELECT * FROM rooms WHERE room_id = ?', [req.params.id]);
        res.json({ status: 'success', message: 'Room ' + action + 'd', data: updated });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// ═══════════════════════════════════════════════
// API: UNIVERSITIES
// ═══════════════════════════════════════════════
app.get('/api/universities', async (req, res) => {
    const rows = await all('SELECT * FROM universities WHERE is_active = 1');
    res.json({ status: 'success', data: rows });
});

// ═══════════════════════════════════════════════
// API: CONVERSATIONS & MESSAGES (Chat)
// ═══════════════════════════════════════════════

// List conversations for a user
app.get('/api/conversations/:userId', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const user = await get('SELECT user_type FROM users WHERE user_id = ?', [userId]);
        if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });

        let rows;
        if (user.user_type === 'student') {
            const s = await get('SELECT student_id FROM students WHERE user_id = ?', [userId]);
            rows = await all(`
                SELECT c.*,
                       u.full_name AS other_name,
                       u.user_id   AS other_user_id,
                       p.property_name,
                       (SELECT body FROM messages WHERE conversation_id = c.conversation_id ORDER BY message_id DESC LIMIT 1) AS last_message,
                       (SELECT COUNT(*) FROM messages WHERE conversation_id = c.conversation_id AND sender_user_id != ? AND is_read = 0) AS unread
                FROM conversations c
                JOIN landlords l ON c.landlord_id = l.landlord_id
                JOIN users u ON l.user_id = u.user_id
                LEFT JOIN properties p ON c.property_id = p.property_id
                WHERE c.student_id = ?
                ORDER BY c.last_message_at DESC
            `, [userId, s.student_id]);
        } else if (user.user_type === 'landlord') {
            const l = await get('SELECT landlord_id FROM landlords WHERE user_id = ?', [userId]);
            rows = await all(`
                SELECT c.*,
                       u.full_name AS other_name,
                       u.user_id   AS other_user_id,
                       p.property_name,
                       (SELECT body FROM messages WHERE conversation_id = c.conversation_id ORDER BY message_id DESC LIMIT 1) AS last_message,
                       (SELECT COUNT(*) FROM messages WHERE conversation_id = c.conversation_id AND sender_user_id != ? AND is_read = 0) AS unread
                FROM conversations c
                JOIN students s ON c.student_id = s.student_id
                JOIN users u ON s.user_id = u.user_id
                LEFT JOIN properties p ON c.property_id = p.property_id
                WHERE c.landlord_id = ?
                ORDER BY c.last_message_at DESC
            `, [userId, l.landlord_id]);
        } else {
            rows = await all(`
                SELECT c.*,
                       'Admin view' AS other_name,
                       0 AS other_user_id,
                       p.property_name,
                       (SELECT body FROM messages WHERE conversation_id = c.conversation_id ORDER BY message_id DESC LIMIT 1) AS last_message,
                       0 AS unread
                FROM conversations c
                LEFT JOIN properties p ON c.property_id = p.property_id
                ORDER BY c.last_message_at DESC
            `);
        }
        res.json({ status: 'success', data: rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// Get messages in a conversation
app.get('/api/conversations/:id/messages', async (req, res) => {
    try {
        const rows = await all(`
            SELECT m.*, u.full_name AS sender_name
            FROM messages m
            JOIN users u ON m.sender_user_id = u.user_id
            WHERE m.conversation_id = ?
            ORDER BY m.message_id ASC
        `, [req.params.id]);
        res.json({ status: 'success', data: rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// Create or get a conversation
app.post('/api/conversations', async (req, res) => {
    try {
        const { student_user_id, landlord_user_id, property_id, subject } = req.body;
        if (!student_user_id || !landlord_user_id) {
            return res.status(400).json({ status: 'error', message: 'student_user_id and landlord_user_id required' });
        }

        const s = await get('SELECT student_id FROM students WHERE user_id = ?', [student_user_id]);
        const l = await get('SELECT landlord_id FROM landlords WHERE user_id = ?', [landlord_user_id]);
        if (!s || !l) return res.status(404).json({ status: 'error', message: 'Student or landlord not found' });

        let conv = await get(
            `SELECT * FROM conversations WHERE student_id = ? AND landlord_id = ? AND (property_id = ? OR (property_id IS NULL AND ? IS NULL))`,
            [s.student_id, l.landlord_id, property_id || null, property_id || null]
        );

        if (!conv) {
            const result = await run(
                `INSERT INTO conversations (student_id, landlord_id, property_id, subject)
                 VALUES (?, ?, ?, ?)`,
                [s.student_id, l.landlord_id, property_id || null, subject || 'Accommodation inquiry']
            );
            conv = await get('SELECT * FROM conversations WHERE conversation_id = ?', [result.lastID]);
        }

        res.status(201).json({ status: 'success', data: conv });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// Send message (REST fallback)
app.post('/api/conversations/:id/messages', async (req, res) => {
    try {
        const { sender_user_id, body } = req.body;
        if (!sender_user_id || !body) {
            return res.status(400).json({ status: 'error', message: 'sender_user_id and body required' });
        }

        const result = await run(
            `INSERT INTO messages (conversation_id, sender_user_id, body) VALUES (?, ?, ?)`,
            [req.params.id, sender_user_id, body]
        );
        await run(
            `UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE conversation_id = ?`,
            [req.params.id]
        );

        const message = await get('SELECT * FROM messages WHERE message_id = ?', [result.lastID]);

        const io = req.app.get('io');
        if (io) io.emit('new-message', message);

        res.status(201).json({ status: 'success', data: message });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// Unread count for the badge
app.get('/api/messages/unread/:userId', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const row = await get(
            `SELECT COUNT(*) AS c FROM messages WHERE sender_user_id != ? AND is_read = 0
             AND conversation_id IN (
                SELECT conversation_id FROM conversations c
                LEFT JOIN students s ON c.student_id = s.student_id
                LEFT JOIN landlords l ON c.landlord_id = l.landlord_id
                WHERE s.user_id = ? OR l.user_id = ?
             )`,
            [userId, userId, userId]
        );
        res.json({ status: 'success', count: row.c });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// ═══════════════════════════════════════════════
// API: DASHBOARDS
// ═══════════════════════════════════════════════
app.get('/api/dashboard/student/:id', async (req, res) => {
    try {
        const student = await get(`
            SELECT s.*, u.full_name, u.email, u.phone, un.name AS university_name
            FROM students s
            JOIN users u ON s.user_id = u.user_id
            LEFT JOIN universities un ON s.university_id = un.university_id
            WHERE s.user_id = ?
        `, [req.params.id]);
        if (!student) return res.status(404).json({ status: 'error', message: 'Student not found' });

        const favourites = await all(`
            SELECT p.* FROM favourites f
            JOIN properties p ON f.property_id = p.property_id
            WHERE f.student_id = ?
        `, [student.student_id]);

        const inquiries = await all(`
            SELECT i.*, p.property_name FROM inquiries i
            JOIN properties p ON i.property_id = p.property_id
            WHERE i.student_id = ?
            ORDER BY i.created_at DESC
        `, [student.student_id]);

        res.json({
            status: 'success',
            data: { student, favourites, inquiries, favourite_count: favourites.length, inquiry_count: inquiries.length }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.get('/api/dashboard/landlord/:id', async (req, res) => {
    try {
        const landlordId = await getLandlordId(req.params.id);
        if (!landlordId) return res.status(404).json({ status: 'error', message: 'Landlord not found' });

        const properties = await all(`
            SELECT p.*,
                   (SELECT COUNT(*) FROM rooms WHERE property_id = p.property_id) AS total_rooms,
                   (SELECT COALESCE(SUM(available),0) FROM rooms WHERE property_id = p.property_id) AS available_spaces,
                   (SELECT COALESCE(SUM(occupied),0) FROM rooms WHERE property_id = p.property_id) AS occupied_beds
            FROM properties p
            WHERE p.landlord_id = ? AND p.is_active = 1
        `, [landlordId]);

        const stats = {
            totalProperties: properties.length,
            totalRooms: properties.reduce((s, p) => s + (p.total_rooms || 0), 0),
            totalAvailable: properties.reduce((s, p) => s + (p.available_spaces || 0), 0),
            totalOccupied: properties.reduce((s, p) => s + (p.occupied_beds || 0), 0),
            totalInquiries: 0,
            totalViews: properties.reduce((s, p) => s + (p.view_count || 0), 0)
        };

        const inquiries = await all(`
            SELECT i.*, u.full_name AS student_name, p.property_name
            FROM inquiries i
            JOIN students s ON i.student_id = s.student_id
            JOIN users u ON s.user_id = u.user_id
            JOIN properties p ON i.property_id = p.property_id
            WHERE i.landlord_id = ?
            ORDER BY i.created_at DESC
        `, [landlordId]);
        stats.totalInquiries = inquiries.length;

        res.json({
            status: 'success',
            data: { stats, properties, inquiries, landlord_id: landlordId }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.get('/api/admin/dashboard', async (req, res) => {
    try {
        const students = (await get('SELECT COUNT(*) AS c FROM students')).c;
        const landlords = (await get('SELECT COUNT(*) AS c FROM landlords')).c;
        const props = (await get('SELECT COUNT(*) AS c FROM properties WHERE is_active = 1')).c;
        const verified = (await get('SELECT COUNT(*) AS c FROM properties WHERE is_verified = 1')).c;
        const pending = (await get('SELECT COUNT(*) AS c FROM properties WHERE verification_status = "pending"')).c;
        const available = (await get('SELECT COALESCE(SUM(available),0) AS s FROM rooms')).s;

        res.json({
            status: 'success',
            data: {
                stats: {
                    totalStudents: students,
                    totalLandlords: landlords,
                    totalProperties: props,
                    verifiedProperties: verified,
                    pendingVerification: pending,
                    availableSpaces: available,
                    totalReports: 0,
                    activeSubscriptions: 1
                }
            }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// List favourites for a student
app.get('/api/favourites/:userId', async (req, res) => {
    try {
        const studentId = await getStudentId(req.params.userId);
        if (!studentId) return res.status(404).json({ status: 'error', message: 'Student not found' });

        const rows = await all(`
            SELECT p.*, u.full_name AS landlord_name, u.phone AS landlord_phone,
                   l.whatsapp_number,
                   (SELECT COUNT(*) FROM rooms WHERE property_id = p.property_id) AS total_rooms,
                   (SELECT COALESCE(SUM(available),0) FROM rooms WHERE property_id = p.property_id) AS available_spaces
            FROM favourites f
            JOIN properties p ON f.property_id = p.property_id
            LEFT JOIN landlords l ON p.landlord_id = l.landlord_id
            LEFT JOIN users u ON l.user_id = u.user_id
            WHERE f.student_id = ? AND p.is_active = 1
            ORDER BY f.saved_at DESC
        `, [studentId]);

        res.json({ status: 'success', data: rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});
// Update profile (name, phone, email)
app.put('/api/profile/:userId', async (req, res) => {
    try {
        const { full_name, phone, email } = req.body;
        const fields = [];
        const values = [];
        if (full_name) { fields.push('full_name = ?'); values.push(full_name); }
        if (phone)     { fields.push('phone = ?');     values.push(phone); }
        if (email)     { fields.push('email = ?');     values.push(email); }
        if (!fields.length) return res.status(400).json({ status: 'error', message: 'No fields to update' });
        values.push(req.params.userId);
        await run(`UPDATE users SET ${fields.join(', ')} WHERE user_id = ?`, values);
        const user = await get('SELECT user_id, full_name, email, phone, user_type FROM users WHERE user_id = ?', [req.params.userId]);
        res.json({ status: 'success', message: 'Profile updated', data: user });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});
// ═══════════════════════════════════════════════
// API: FAVOURITES
// ═══════════════════════════════════════════════
app.post('/api/favourites/toggle', async (req, res) => {
    try {
        const { student_user_id, property_id } = req.body;
        const studentId = await getStudentId(student_user_id) || 1;
        const existing = await get('SELECT favourite_id FROM favourites WHERE student_id = ? AND property_id = ?', [studentId, property_id]);
        if (existing) {
            await run('DELETE FROM favourites WHERE favourite_id = ?', [existing.favourite_id]);
            res.json({ status: 'success', action: 'removed', message: 'Removed from favourites' });
        } else {
            await run('INSERT INTO favourites (student_id, property_id) VALUES (?, ?)', [studentId, property_id]);
            res.json({ status: 'success', action: 'added', message: 'Added to favourites' });
        }
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// ═══════════════════════════════════════════════
// API: INQUIRIES
// ═══════════════════════════════════════════════
app.post('/api/inquiries', async (req, res) => {
    try {
        const { student_user_id, property_id, message } = req.body;
        if (!message) return res.status(400).json({ status: 'error', message: 'Message is required' });

        const studentId = await getStudentId(student_user_id) || 1;
        const prop = await get('SELECT landlord_id FROM properties WHERE property_id = ?', [property_id || 1]);
        if (!prop) return res.status(404).json({ status: 'error', message: 'Property not found' });

        const result = await run(
            `INSERT INTO inquiries (student_id, landlord_id, property_id, message) VALUES (?, ?, ?, ?)`,
            [studentId, prop.landlord_id, property_id || 1, message]
        );

        res.status(201).json({ status: 'success', message: 'Inquiry sent', data: { inquiry_id: result.lastID } });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.get('/api/inquiries', async (req, res) => {
    try {
        const rows = await all(`
            SELECT i.*, u.full_name AS student_name, p.property_name
            FROM inquiries i
            JOIN students s ON i.student_id = s.student_id
            JOIN users u ON s.user_id = u.user_id
            JOIN properties p ON i.property_id = p.property_id
            ORDER BY i.created_at DESC
        `);
        res.json({ status: 'success', data: rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// ═══════════════════════════════════════════════
// API: ADMIN ACTIONS
// ═══════════════════════════════════════════════
app.put('/api/admin/verify-property/:id', async (req, res) => {
    try {
        await run(`UPDATE properties SET is_verified = 1, verification_status = 'verified' WHERE property_id = ?`, [req.params.id]);
        res.json({ status: 'success', message: 'Property verified' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.put('/api/admin/suspend-property/:id', async (req, res) => {
    try {
        await run(`UPDATE properties SET verification_status = 'suspended', is_active = 0 WHERE property_id = ?`, [req.params.id]);
        res.json({ status: 'success', message: 'Property suspended' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// ═══════════════════════════════════════════════

// 
// WASHER PORTAL API
// 


// Public washer registration
app.post('/api/washer/register', async (req, res) => {
    try {
        const { name, phone, mobile_money_number, location, service_area, cash_eligible, notes } = req.body;
        if (!name || !phone) {
            return res.status(400).json({ status: 'error', message: 'Name and phone required' });
        }
        const existing = await get('SELECT id FROM laundry_providers WHERE phone = ?', [phone]);
        if (existing) return res.status(400).json({ status: 'error', message: 'Phone already registered' });

        const r = await run(
            `INSERT INTO laundry_providers
             (name, phone, mobile_money_number, location, service_area, cash_eligible,
              verification_status, availability_status, wallet_balance, notes)
             VALUES (?, ?, ?, ?, ?, ?, 'pending', 'offline', 0, ?)`,
            [name, phone, mobile_money_number || null, location || null,
             service_area || null, cash_eligible ? 1 : 0, notes || null]
        );
        const provider = await get('SELECT * FROM laundry_providers WHERE id = ?', [r.lastID]);
        res.status(201).json({
            status: 'success',
            message: 'Application submitted. An admin will verify your account.',
            data: provider
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});
// Login via phone (simple V1  no password)
app.post('/api/washer/login', async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ status: 'error', message: 'Phone required' });
        const provider = await get(
            'SELECT * FROM laundry_providers WHERE phone = ? OR mobile_money_number = ?',
            [phone, phone]
        );
        if (!provider) return res.status(404).json({ status: 'error', message: 'No provider with that phone' });
        if (provider.verification_status === 'suspended' || provider.verification_status === 'inactive') {
            return res.status(403).json({ status: 'error', message: 'Account is ' + provider.verification_status });
        }
        res.json({ status: 'success', data: provider });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// Current orders assigned to this washer
app.get('/api/washer/orders/:providerId', async (req, res) => {
    try {
        const orders = await all(`
            SELECT o.*,
                   u.full_name AS student_name,
                   u.phone AS student_phone
            FROM laundry_orders o
            JOIN students s ON o.student_id = s.student_id
            JOIN users u ON s.user_id = u.user_id
            WHERE o.provider_id = ?
            ORDER BY o.created_at DESC
            LIMIT 50
        `, [req.params.providerId]);
        res.json({ status: 'success', data: orders });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// Washer updates order state
app.put('/api/washer/orders/:id/state', async (req, res) => {
    try {
        const { state } = req.body;
        const order = await get('SELECT * FROM laundry_orders WHERE id = ?', [req.params.id]);
        if (!order) return res.status(404).json({ status: 'error', message: 'Order not found' });
        const allowed = ['provider_on_the_way', 'provider_arrived', 'washing', 'completion_pending'];
        if (!allowed.includes(state)) {
            return res.status(400).json({ status: 'error', message: 'Washer cannot set state: ' + state });
        }
        await run(`UPDATE laundry_orders SET order_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                  [state, order.id]);
        res.json({ status: 'success', data: await get('SELECT * FROM laundry_orders WHERE id = ?', [order.id]) });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// Washer toggles availability
app.put('/api/washer/:id/availability', async (req, res) => {
    try {
        const { availability_status } = req.body;
        if (!['available', 'busy', 'offline'].includes(availability_status)) {
            return res.status(400).json({ status: 'error', message: 'Invalid status' });
        }
        await run(`UPDATE laundry_providers SET availability_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                  [availability_status, req.params.id]);
        res.json({ status: 'success', data: await get('SELECT * FROM laundry_providers WHERE id = ?', [req.params.id]) });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// Washer's wallet ledger
app.get('/api/washer/:id/wallet', async (req, res) => {
    try {
        const provider = await get('SELECT * FROM laundry_providers WHERE id = ?', [req.params.id]);
        if (!provider) return res.status(404).json({ status: 'error', message: 'Provider not found' });
        const ledger = await all(
            'SELECT * FROM commission_wallet_transactions WHERE provider_id = ? ORDER BY id DESC LIMIT 100',
            [req.params.id]
        );
        res.json({ status: 'success', data: { provider, ledger } });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// Admin: all orders with completion codes visible
app.get('/api/laundry/admin/orders', async (req, res) => {
    try {
        const orders = await all(`
            SELECT o.*,
                   u.full_name AS student_name,
                   u.phone AS student_phone,
                   p.name AS provider_name,
                   p.phone AS provider_phone
            FROM laundry_orders o
            LEFT JOIN students s ON o.student_id = s.student_id
            LEFT JOIN users u ON s.user_id = u.user_id
            LEFT JOIN laundry_providers p ON o.provider_id = p.id
            ORDER BY o.created_at DESC
            LIMIT 200
        `);
        res.json({ status: 'success', data: orders });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});




// =============================================================
// =============================================================
// EU PONKALA - ADDITIONS v2 (schema-correct)
// Provider top-up + Provider registration + Admin service metrics
// =============================================================

// --- Provider top-up: initiate ---
app.post('/api/provider-topup/initiate', (req, res) => {
    const { provider_id, service_type, amount, phone_number } = req.body || {};
    if (!provider_id || !amount) {
        return res.status(400).json({ status: 'error', message: 'provider_id and amount required' });
    }
    const reference = 'TOPUP-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
    const sql = `INSERT INTO provider_topups
                 (provider_id, service_type, amount, method, phone_number, reference, status)
                 VALUES (?, ?, ?, 'mobile_money', ?, ?, 'pending')`;
    run(sql, [provider_id, service_type || 'laundry', amount, phone_number || null, reference], function (err) {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', data: { reference, topup_id: this.lastID, amount } });
    });
});

// --- Provider top-up: confirm ---
app.post('/api/provider-topup/confirm/:ref', (req, res) => {
    const ref = req.params.ref;
    get(`SELECT * FROM provider_topups WHERE reference = ?`, [ref], (err, row) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        if (!row) return res.status(404).json({ status: 'error', message: 'Reference not found' });
        if (row.status === 'completed') {
            return res.json({ status: 'success', data: row, note: 'already confirmed' });
        }
        run(`UPDATE provider_topups SET status = 'completed', credited_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [row.id], function (e2) {
                if (e2) return res.status(500).json({ status: 'error', message: e2.message });

                // Also credit the wallet ledger
                const txnSql = `INSERT INTO wallet_transactions
                    (provider_id, service_type, txn_type, amount, balance_before, balance_after, reference, created_at)
                    VALUES (?, ?, 'credit', ?, 0, ?, ?, CURRENT_TIMESTAMP)`;
                run(txnSql, [row.provider_id, row.service_type, row.amount, row.amount, ref], (e3) => {
                    if (e3) console.error('wallet_transactions insert error:', e3.message);
                    res.json({ status: 'success', data: { ...row, status: 'completed' } });
                });
            });
    });
});

// --- Provider top-up: history ---
app.get('/api/provider-topup/history/:providerId', (req, res) => {
    const providerId = req.params.providerId;
    all(`SELECT * FROM provider_topups WHERE provider_id = ? ORDER BY created_at DESC LIMIT 50`,
        [providerId], (err, rows) => {
            if (err) return res.status(500).json({ status: 'error', message: err.message });
            res.json({ status: 'success', data: rows || [] });
        });
});

// --- Provider registration (uses providers table) ---
app.post('/api/provider-register/start', (req, res) => {
    const { phone, full_name, business_name } = req.body || {};
    if (!phone) return res.status(400).json({ status: 'error', message: 'phone required' });

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const code = 'PROV-' + Date.now().toString(36).toUpperCase();

    // Check if phone already exists
    get(`SELECT * FROM providers WHERE phone = ?`, [phone], (err, existing) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });

        const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

        if (existing) {
            // Update OTP
            run(`UPDATE providers SET otp_code = ?, otp_expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [otp, expires, existing.id], (e) => {
                    if (e) return res.status(500).json({ status: 'error', message: e.message });
                    res.json({ status: 'success', data: { provider_id: existing.id, phone, otp_dev: otp } });
                });
        } else {
            const sql = `INSERT INTO providers
                (provider_code, full_name, phone, otp_code, otp_expires_at, verification_status, account_status)
                VALUES (?, ?, ?, ?, ?, 'pending', 'pending')`;
            run(sql, [code, full_name || 'New Provider', phone, otp, expires], function (e) {
                if (e) return res.status(500).json({ status: 'error', message: e.message });
                res.json({ status: 'success', data: { provider_id: this.lastID, phone, otp_dev: otp } });
            });
        }
    });
});

app.post('/api/provider-register/verify-otp', (req, res) => {
    const { provider_id, session_id, otp } = req.body || {};
    const id = provider_id || session_id;
    if (!id || !otp) return res.status(400).json({ status: 'error', message: 'provider_id and otp required' });

    get(`SELECT * FROM providers WHERE id = ?`, [id], (err, row) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        if (!row) return res.status(404).json({ status: 'error', message: 'provider not found' });
        if (row.otp_code !== otp) return res.status(400).json({ status: 'error', message: 'invalid OTP' });

        run(`UPDATE providers SET sim_verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [id], (e) => {
                if (e) return res.status(500).json({ status: 'error', message: e.message });
                res.json({ status: 'success', data: { provider_id: id } });
            });
    });
});

app.post('/api/provider-register/set-pin', (req, res) => {
    const { provider_id, session_id, pin } = req.body || {};
    const id = provider_id || session_id;
    if (!id || !pin) return res.status(400).json({ status: 'error', message: 'provider_id and pin required' });

    // Store the PIN (bcrypt hash would be better â€” this is a simple version)
    run(`UPDATE providers SET pin_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [String(pin), id], function (e) {
            if (e) return res.status(500).json({ status: 'error', message: e.message });
            res.json({ status: 'success', data: { provider_id: id } });
        });
});

// --- Admin service metrics ---
app.get('/api/admin/service-metrics', (req, res) => {
    const out = { laundry_orders: 0, service_orders: 0, providers: 0, topups: 0 };
    get(`SELECT COUNT(*) AS c FROM laundry_orders`, [], (e1, r1) => {
        out.laundry_orders = r1 ? r1.c : 0;
        get(`SELECT COUNT(*) AS c FROM service_orders`, [], (e2, r2) => {
            out.service_orders = r2 ? r2.c : 0;
            get(`SELECT COUNT(*) AS c FROM providers`, [], (e3, r3) => {
                out.providers = r3 ? r3.c : 0;
                get(`SELECT COUNT(*) AS c FROM provider_topups`, [], (e4, r4) => {
                    out.topups = r4 ? r4.c : 0;
                    res.json({ status: 'success', data: out });
                });
            });
        });
    });
});

app.get('/api/admin/service-providers', (req, res) => {
    all(`SELECT * FROM providers ORDER BY created_at DESC LIMIT 100`, [], (err, rows) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', data: rows || [] });
    });
});

app.get('/api/admin/service-orders', (req, res) => {
    all(`SELECT * FROM service_orders ORDER BY created_at DESC LIMIT 100`, [], (err, rows) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', data: rows || [] });
    });
});

// --- Ratings (provider_ratings table) ---
app.post('/api/ratings/submit', (req, res) => {
    const { provider_id, service_type, order_id, student_user_id, rating, comment } = req.body || {};
    if (!provider_id || !rating) return res.status(400).json({ status: 'error', message: 'provider_id and rating required' });
    const sql = `INSERT INTO provider_ratings
                 (provider_id, service_type, order_id, student_user_id, rating, comment)
                 VALUES (?, ?, ?, ?, ?, ?)`;
    run(sql, [provider_id, service_type || 'laundry', order_id || null, student_user_id || null, rating, comment || null],
        function (err) {
            if (err) return res.status(500).json({ status: 'error', message: err.message });
            res.json({ status: 'success', data: { rating_id: this.lastID } });
        });
});

app.get('/api/ratings/provider/:providerId', (req, res) => {
    all(`SELECT * FROM provider_ratings WHERE provider_id = ? ORDER BY created_at DESC`,
        [req.params.providerId], (err, rows) => {
            if (err) return res.status(500).json({ status: 'error', message: err.message });
            const avg = rows && rows.length
                ? rows.reduce((s, r) => s + (r.rating || 0), 0) / rows.length
                : 0;
            res.json({ status: 'success', data: rows || [], average: avg });
        });
});

// =============================================================
// END AUTO-GENERATED ADDITIONS
// =============================================================
// --- Engine routes (Phase 1b) ---
require('./routes/engine-routes')(app);

// --- Engine order routes (Phase 1c) ---
require('./routes/engine-orders-routes')(app);

// --- Engine completion routes (Phase 1d) ---
require('./routes/engine-completion-routes')(app);

// --- Engine matching routes (Phase 1e) ---
require('./routes/engine-matching-routes')(app);

// --- Engine holds + auto-complete routes (Phase 1f) ---
require('./routes/engine-holds-routes')(app);

// --- Engine SMS routes (Phase 1g) ---
require('./routes/engine-sms-routes')(app);

// --- Engine lifecycle routes (Phase 1h) ---
require('./routes/engine-lifecycle-routes')(app);

// --- Engine laundry routes (Phase 2) ---
require('./routes/engine-laundry-routes')(app);

// --- Engine wheelbarrow routes (Phase 3) ---
require('./routes/engine-wheelbarrow-routes')(app);

// --- Engine USSD routes (Phase 4) ---
require('./routes/engine-ussd-routes')(app);

// --- Engine provider routes (Phase 5a) ---
require('./routes/engine-provider-routes')(app);

// --- Engine ratings routes (Phase 5b) ---
require('./routes/engine-ratings-routes')(app);

// --- Engine cancellations routes (Phase 5c) ---
require('./routes/engine-cancellations-routes')(app);

// --- Engine disputes routes (Phase 5c) ---
require('./routes/engine-disputes-routes')(app);

// --- Engine penalties routes (Phase 5d) ---
require('./routes/engine-penalties-routes')(app);

// --- Engine admin routes (Phase 5e) ---
require('./routes/engine-admin-routes')(app);

// --- Engine config routes (Phase 5f) ---
require('./routes/engine-config-routes')(app);

// --- Engine earnings routes (Phase 5h) ---
require('./routes/engine-earnings-routes')(app);

// --- Engine recovery routes (Phase 5h) ---
require('./routes/engine-recovery-routes')(app);

// --- Engine top-up routes (M4) ---
require('./routes/engine-topup-routes')(app);

// --- Engine admin service-orders (fix) ---
require('./routes/engine-admin-service-orders')(app);

// --- Engine notifications routes ---
require('./routes/engine-notifications-routes')(app);

// --- Engine admin extras ---
require('./routes/engine-admin-extras')(app);

// API 404
// ═══════════════════════════════════════════════
app.use('/api', (req, res, next) => {
    if (req.path.startsWith('/laundry') || req.path.startsWith('/washer')) return next();


    res.status(404).json({ status: 'error', message: 'API endpoint not found: ' + req.path });
});

// ═══════════════════════════════════════════════
// CATCH-ALL
// ═══════════════════════════════════════════════
app.use((req, res) => {
    if (/\.[a-z0-9]+$/i.test(req.path)) return res.status(404).send('Not found');
    res.sendFile(path.join(__dirname, '../../index.html'));
});

// ═══════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════
(async () => {
    const created = await init();
      // Run migrations/*.sql (idempotent)
      try {
          const { runMigrations } = require('./db');
          await runMigrations();
      } catch (e) { console.warn('migrations failed:', e.message); }
    // Laundry module: apply schema additions if needed and ensure seed data
    const fs = require('fs');
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        const { db: rawDb } = require('./db');
        await new Promise((resolve) => rawDb.exec(schemaSql, () => resolve()));
    }
    await laundryHelper.ensureLaundrySeed();
    if (created) {
        console.log('ℹ️  Database was empty. Run `node seed.js` to add sample data.');
    }

    const server = http.createServer(app);
    const io = initSocket(server);
    app.set('io', io);

    // --- Start periodic scheduler (Phase 5g) ---
try { require('./engine/scheduler').startScheduler(60000); } catch (e) { console.error('scheduler:', e.message); }

server.listen(PORT, '0.0.0.0', () => {
        console.log('========================================');
        console.log('  EU PONKALA Server v2.2');
        console.log('  SQLite + Uploads + Real-Time Chat');
        console.log('  Running on http://localhost:' + PORT);
        console.log('========================================');
        console.log('  Test accounts:');
        console.log('    Student:  francis@example.com / password123');
        console.log('    Landlord: banda@euponkala.com / password123');
        console.log('    Admin:    admin@euponkala.com / password123');
        console.log('  Server ready!');
    });
})();

// ═══════════════════════════════════════════════


























// =============================================================




























