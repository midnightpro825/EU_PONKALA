// routes/engine-admin-service-orders.js
const db = require('../engine/db');

module.exports = function mountAdminServiceOrders(app) {
    app.get('/api/engine/admin/service-orders', async (req, res) => {
        try {
            const rows = await db.all(`
                SELECT o.*,
                       p.full_name AS provider_name,
                       p.phone AS provider_phone,
                       z1.zone_name AS pickup_zone_name,
                       z2.zone_name AS destination_zone_name
                FROM service_orders o
                LEFT JOIN providers p ON o.provider_id = p.id
                LEFT JOIN zones z1 ON o.pickup_zone_id = z1.zone_id
                LEFT JOIN zones z2 ON o.destination_zone_id = z2.zone_id
                ORDER BY o.created_at DESC
                LIMIT 200
            `);
            res.json({ status: 'success', data: rows || [] });
        } catch (e) {
            res.status(500).json({ status: 'error', message: e.message });
        }
    });

    app.get('/api/engine/admin/service-metrics', async (req, res) => {
        try {
            const out = { laundry_orders: 0, service_orders: 0, providers: 0, topups: 0 };
            const r1 = await db.get(`SELECT COUNT(*) AS c FROM service_orders WHERE service_type='LAUNDRY'`);
            out.laundry_orders = r1 ? r1.c : 0;
            const r2 = await db.get(`SELECT COUNT(*) AS c FROM service_orders`);
            out.service_orders = r2 ? r2.c : 0;
            const r3 = await db.get(`SELECT COUNT(*) AS c FROM providers`);
            out.providers = r3 ? r3.c : 0;
            const r4 = await db.get(`SELECT COUNT(*) AS c FROM provider_topups`).catch(function(){ return {c:0}; });
            out.topups = r4 ? r4.c : 0;
            res.json({ status: 'success', data: out });
        } catch (e) {
            res.status(500).json({ status: 'error', message: e.message });
        }
    });

    app.get('/api/engine/admin/service-providers', async (req, res) => {
        try {
            const rows = await db.all(`SELECT * FROM providers ORDER BY created_at DESC LIMIT 200`);
            res.json({ status: 'success', data: rows || [] });
        } catch (e) {
            res.status(500).json({ status: 'error', message: e.message });
        }
    });

    console.log('  Engine admin service-orders routes loaded');


// ============================================================
// Admin: Inquiries list
// ============================================================
app.get('/api/engine/admin/inquiries', async (req, res) => {
    try {
        const rows = await db.all(`
            SELECT i.*,
                   u.full_name AS student_name, u.phone AS student_phone, u.email AS student_email,
                   p.property_name, p.monthly_price,
                   l.business_name AS landlord_business
            FROM inquiries i
            LEFT JOIN users u ON i.student_id = u.user_id
            LEFT JOIN properties p ON i.property_id = p.property_id
            LEFT JOIN landlords l ON i.landlord_id = l.landlord_id
            ORDER BY i.created_at DESC
            LIMIT 100
        `);
        res.json({ status: 'success', data: rows || [] });
    } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
});

// ============================================================
// Admin: Topups history
// ============================================================
app.get('/api/engine/admin/topups', async (req, res) => {
    try {
        const rows = await db.all(`
            SELECT t.*,
                   p.provider_code, p.full_name AS provider_name, p.phone AS provider_phone
            FROM provider_topups t
            LEFT JOIN providers p ON t.provider_id = p.id
            ORDER BY t.created_at DESC
            LIMIT 200
        `);
        res.json({ status: 'success', data: rows || [] });
    } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
});

// ============================================================
// Admin: SMS log
// ============================================================
app.get('/api/engine/admin/sms-log', async (req, res) => {
    try {
        const rows = await db.all(`
            SELECT s.*,
                   p.provider_code, p.full_name AS provider_name
            FROM sms_logs s
            LEFT JOIN providers p ON s.provider_id = p.id
            ORDER BY s.sms_id DESC
            LIMIT 200
        `);
        res.json({ status: 'success', data: rows || [] });
    } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
});

// ============================================================
// Admin: All users (combined view)
// ============================================================
app.get('/api/engine/admin/all-users', async (req, res) => {
    try {
        const users = await db.all('SELECT user_id, full_name, email, phone, user_type, is_active, created_at FROM users ORDER BY user_id');
        const providers = await db.all('SELECT id, provider_code, full_name, phone, verification_status, account_status, created_at FROM providers ORDER BY id');
        const landlords = await db.all('SELECT l.*, u.full_name, u.email, u.phone FROM landlords l LEFT JOIN users u ON l.user_id = u.user_id');
        const students = await db.all('SELECT s.*, u.full_name, u.email, u.phone FROM students s LEFT JOIN users u ON s.user_id = u.user_id');
        res.json({ status: 'success', data: { users, providers, landlords, students } });
    } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
});
};
