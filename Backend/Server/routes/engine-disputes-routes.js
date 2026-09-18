const disp = require('../engine/disputes');

module.exports = function mountDisputeRoutes(app) {
    app.post('/api/engine/disputes/order/:orderId', async (req, res) => {
        try {
            const { raised_by, reason, description } = req.body || {};
            const r = await disp.raiseDispute(Number(req.params.orderId), raised_by, reason, description);
            res.json({ status: 'success', data: r });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    app.post('/api/engine/disputes/:disputeId/review', async (req, res) => {
        try {
            const { admin_user_id, notes } = req.body || {};
            const r = await disp.reviewDispute(Number(req.params.disputeId), admin_user_id, notes);
            res.json({ status: 'success', data: r });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    app.post('/api/engine/disputes/:disputeId/resolve', async (req, res) => {
        try {
            const { admin_user_id, resolution, notes } = req.body || {};
            const r = await disp.resolveDispute(Number(req.params.disputeId), admin_user_id, resolution, notes);
            res.json({ status: 'success', data: r });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    app.get('/api/engine/disputes/open', async (req, res) => {
        try {
            const r = await disp.listOpenDisputes();
            res.json({ status: 'success', data: r });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    app.get('/api/engine/disputes/order/:orderId', async (req, res) => {
        try {
            const r = await disp.getDisputesForOrder(Number(req.params.orderId));
            res.json({ status: 'success', data: r });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    console.log('  Engine disputes routes loaded');
};
