const earnings = require('../engine/provider-earnings');

module.exports = function mountEarningsRoutes(app) {
    app.get('/api/engine/provider/earnings/:providerId', async (req, res) => {
        try {
            const period = req.query.period || 'week';
            const r = await earnings.getProviderEarnings(Number(req.params.providerId), period);
            res.json({ status: 'success', data: r });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    app.get('/api/engine/admin/earnings', async (req, res) => {
        try {
            const period = req.query.period || 'week';
            const r = await earnings.getAllProvidersEarnings(period);
            res.json({ status: 'success', data: r });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    console.log('  Engine earnings routes loaded');
};