const rec = require('../engine/recovery');

module.exports = function mountRecoveryRoutes(app) {
    app.post('/api/engine/admin/recovery/order/:id/complete', async (req, res) => {
        try {
            const { admin_user_id, notes } = req.body || {};
            const r = await rec.forceComplete(Number(req.params.id), admin_user_id, notes);
            res.json({ status: 'success', data: r });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    app.post('/api/engine/admin/recovery/order/:id/cancel', async (req, res) => {
        try {
            const { admin_user_id, reason } = req.body || {};
            const r = await rec.forceCancel(Number(req.params.id), admin_user_id, reason);
            res.json({ status: 'success', data: r });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    app.post('/api/engine/admin/recovery/wallet/adjust', async (req, res) => {
        try {
            const { provider_id, amount, reason, admin_user_id } = req.body || {};
            const r = await rec.adjustWallet(provider_id, amount, reason, admin_user_id);
            res.json({ status: 'success', data: r });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    app.post('/api/engine/admin/recovery/order/:id/reassign', async (req, res) => {
        try {
            const { new_provider_id, admin_user_id, notes } = req.body || {};
            const r = await rec.reassignOrder(Number(req.params.id), new_provider_id, admin_user_id, notes);
            res.json({ status: 'success', data: r });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    console.log('  Engine recovery routes loaded');
};