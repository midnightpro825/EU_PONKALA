const canc = require('../engine/cancellations');

module.exports = function mountCancellationRoutes(app) {
    app.post('/api/engine/cancellations/order/:orderId', async (req, res) => {
        try {
            const { cancelled_by, reason } = req.body || {};
            const r = await canc.cancelOrder(Number(req.params.orderId), cancelled_by, reason);
            res.json({ status: 'success', data: r });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    app.get('/api/engine/cancellations/order/:orderId', async (req, res) => {
        try {
            const r = await canc.getCancellationsForOrder(Number(req.params.orderId));
            res.json({ status: 'success', data: r });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    app.get('/api/engine/cancellations/recent', async (req, res) => {
        try {
            const r = await canc.listRecentCancellations(50);
            res.json({ status: 'success', data: r });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    console.log('  Engine cancellations routes loaded');
};
