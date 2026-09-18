const admin = require('../engine/admin-users');
const audit = require('../engine/audit');

module.exports = function mountAdminRoutes(app) {
    // Providers
    app.get('/api/engine/admin/providers', async (req, res) => {
        try {
            const list = await admin.listAllProviders({ status: req.query.status, verified: req.query.verified, limit: Number(req.query.limit) || 100 });
            res.json({ status: 'success', data: list });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    app.get('/api/engine/admin/providers/:id', async (req, res) => {
        try {
            const d = await admin.getProviderDetails(Number(req.params.id));
            if (!d) return res.status(404).json({ status: 'error', message: 'provider not found' });
            res.json({ status: 'success', data: d });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    app.post('/api/engine/admin/providers/:id/suspend', async (req, res) => {
        try {
            const { admin_user_id, reason } = req.body || {};
            const r = await admin.suspendProvider(Number(req.params.id), admin_user_id, reason);
            res.json({ status: 'success', data: r });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    app.post('/api/engine/admin/providers/:id/reactivate', async (req, res) => {
        try {
            const { admin_user_id, notes } = req.body || {};
            const r = await admin.reactivateProvider(Number(req.params.id), admin_user_id, notes);
            res.json({ status: 'success', data: r });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    // Users
    app.get('/api/engine/admin/users', async (req, res) => {
        try {
            const active = req.query.active === 'true' ? true : (req.query.active === 'false' ? false : undefined);
            const list = await admin.listAllUsers({ type: req.query.type, active, limit: Number(req.query.limit) || 100 });
            res.json({ status: 'success', data: list });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    app.post('/api/engine/admin/users/:id/suspend', async (req, res) => {
        try {
            const { admin_user_id, reason } = req.body || {};
            const r = await admin.suspendUser(Number(req.params.id), admin_user_id, reason);
            res.json({ status: 'success', data: r });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    app.post('/api/engine/admin/users/:id/reactivate', async (req, res) => {
        try {
            const { admin_user_id, notes } = req.body || {};
            const r = await admin.reactivateUser(Number(req.params.id), admin_user_id, notes);
            res.json({ status: 'success', data: r });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    // Audit logs
    app.get('/api/engine/admin/audit/recent', async (req, res) => {
        try {
            const list = await audit.listRecentLogs(Number(req.query.limit) || 100, {
                action: req.query.action, entity_type: req.query.entity_type, user_id: req.query.user_id
            });
            res.json({ status: 'success', data: list });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    app.get('/api/engine/admin/audit/entity/:entityType/:entityId', async (req, res) => {
        try {
            const list = await audit.getLogsForEntity(req.params.entityType.toUpperCase(), Number(req.params.entityId));
            res.json({ status: 'success', data: list });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    console.log('  Engine admin routes loaded');
};
