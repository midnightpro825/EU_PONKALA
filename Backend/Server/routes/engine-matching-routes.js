// routes/engine-matching-routes.js
const matching = require('../engine/matching');

module.exports = function mountMatchingRoutes(app) {

    // List eligible providers for an order
    app.get('/api/engine/matching/:orderId/candidates', async (req, res) => {
        try {
            const exclude = (req.query.exclude || '').split(',').filter(Boolean).map(Number);
            const list = await matching.findEligibleProviders(Number(req.params.orderId), exclude);
            res.json({ status: 'success', data: list, count: list.length });
        } catch (e) {
            res.status(400).json({ status: 'error', message: e.message });
        }
    });

    // Auto-assign top candidate
    app.post('/api/engine/matching/:orderId/assign', async (req, res) => {
        try {
            const exclude = (req.body && req.body.exclude) || [];
            const result = await matching.autoAssign(Number(req.params.orderId), exclude);
            if (!result.assigned) {
                return res.status(404).json({ status: 'error', message: result.reason });
            }
            res.json({ status: 'success', data: result.result });
        } catch (e) {
            res.status(400).json({ status: 'error', message: e.message });
        }
    });

    // Force-assign a specific provider (admin / retry)
    app.post('/api/engine/matching/:orderId/assign/:providerId', async (req, res) => {
        try {
            const result = await matching.assignProviderToOrder(
                Number(req.params.orderId),
                Number(req.params.providerId)
            );
            res.json({ status: 'success', data: result });
        } catch (e) {
            res.status(400).json({ status: 'error', message: e.message });
        }
    });

    // Set a provider's availability
    app.post('/api/engine/matching/availability', async (req, res) => {
        try {
            const { provider_id, service_type, status, zone_id } = req.body || {};
            if (!provider_id || !service_type || !status) {
                return res.status(400).json({ status: 'error', message: 'provider_id, service_type, status required' });
            }
            const row = await matching.setAvailability(provider_id, service_type, status, zone_id);
            res.json({ status: 'success', data: row });
        } catch (e) {
            res.status(400).json({ status: 'error', message: e.message });
        }
    });

    // Get a provider's availability
    app.get('/api/engine/matching/availability/:providerId', async (req, res) => {
        try {
            const rows = await matching.getAvailability(Number(req.params.providerId));
            res.json({ status: 'success', data: rows });
        } catch (e) {
            res.status(500).json({ status: 'error', message: e.message });
        }
    });

    console.log('  Engine matching routes loaded');
};
