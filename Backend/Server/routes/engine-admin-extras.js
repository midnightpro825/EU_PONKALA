const db = require('../engine/db');

module.exports = function mountAdminExtras(app) {

    // Admin: Inquiries
    app.get('/api/engine/admin/inquiries', async (req, res) => {
        try {
            const rows = await db.all(`
                SELECT i.*,
                       u.full_name AS student_name, u.phone AS student_phone,
                       p.property_name, l.business_name AS landlord_business
                FROM inquiries i
                LEFT JOIN users u ON i.student_id = u.user_id
                LEFT JOIN properties p ON i.property_id = p.property_id
                LEFT JOIN landlords l ON i.landlord_id = l.landlord_id
                ORDER BY i.inquiry_id DESC LIMIT 100
            `);
            res.json({ status: 'success', data: rows || [] });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    // Admin: Topups
    app.get('/api/engine/admin/topups', async (req, res) => {
        try {
            const rows = await db.all(`
                SELECT t.*, p.provider_code, p.full_name AS provider_name, p.phone AS provider_phone
                FROM provider_topups t
                LEFT JOIN providers p ON t.provider_id = p.id
                ORDER BY t.created_at DESC LIMIT 200
            `);
            res.json({ status: 'success', data: rows || [] });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    // Admin: SMS Log
    app.get('/api/engine/admin/sms-log', async (req, res) => {
        try {
            const rows = await db.all(`
                SELECT s.*, p.provider_code, p.full_name AS provider_name
                FROM sms_logs s
                LEFT JOIN providers p ON s.provider_id = p.id
                ORDER BY s.sms_id DESC LIMIT 200
            `);
            res.json({ status: 'success', data: rows || [] });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    // Admin: All Users (combined)
    app.get('/api/engine/admin/all-users', async (req, res) => {
        try {
            const users = await db.all('SELECT user_id, full_name, email, phone, user_type, is_active, created_at FROM users ORDER BY user_id');
            const providers = await db.all('SELECT id, provider_code, full_name, phone, verification_status, account_status, created_at FROM providers ORDER BY id');
            const landlords = await db.all('SELECT l.*, u.full_name, u.email, u.phone FROM landlords l LEFT JOIN users u ON l.user_id = u.user_id');
            const students = await db.all('SELECT s.*, u.full_name, u.email, u.phone FROM students s LEFT JOIN users u ON s.user_id = u.user_id');
            res.json({ status: 'success', data: { users, providers, landlords, students } });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    console.log('  Engine admin extras routes loaded (inquiries, topups, sms-log, all-users)');
};
