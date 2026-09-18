// routes/engine-config-routes.js
const cfg = require('../engine/config-store');

module.exports = function mountConfigRoutes(app) {

    app.get('/api/engine/config', async (req, res) => {
        try { res.json({ status: 'success', data: await cfg.getAll() }); }
        catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    app.get('/api/engine/config/:key', async (req, res) => {
        try {
            const v = await cfg.get(req.params.key);
            if (v === undefined) return res.status(404).json({ status: 'error', message: 'unknown key' });
            res.json({ status: 'success', data: { key: req.params.key, value: v } });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    app.put('/api/engine/config/:key', async (req, res) => {
        try {
            const { value, admin_user_id } = req.body || {};
            if (value === undefined) return res.status(400).json({ status: 'error', message: 'value required' });
            const r = await cfg.set(req.params.key, value, admin_user_id);
            res.json({ status: 'success', data: r });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    app.put('/api/engine/config', async (req, res) => {
        try {
            const { admin_user_id, ...obj } = req.body || {};
            const results = await cfg.bulkSet(obj, admin_user_id);
            res.json({ status: 'success', data: results });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    app.post('/api/engine/config/reset', async (req, res) => {
        try {
            const { admin_user_id } = req.body || {};
            const r = await cfg.reset(admin_user_id);
            res.json({ status: 'success', data: r });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    console.log('  Engine config routes loaded');
};
