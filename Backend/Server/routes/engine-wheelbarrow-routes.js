// routes/engine-wheelbarrow-routes.js
const wheelbarrow = require('../engine/wheelbarrow');

module.exports = function mountWheelbarrowRoutes(app) {

    // List pricing rules
    app.get('/api/engine/wheelbarrow/pricing', async (req, res) => {
        try {
            const list = await wheelbarrow.listPricingRules(req.query.all === '1');
            res.json({ status: 'success', data: list });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    // Update a pricing rule (admin)
    app.put('/api/engine/wheelbarrow/pricing/:ruleId', async (req, res) => {
        try {
            const updated = await wheelbarrow.updatePricingRule(Number(req.params.ruleId), req.body || {});
            res.json({ status: 'success', data: updated });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    // Get a quote (before creating order)
    app.post('/api/engine/wheelbarrow/quote', async (req, res) => {
        try {
            const quote = await wheelbarrow.calculateQuote(req.body || {});
            res.json({ status: 'success', data: quote });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    // Create order (uses quote internally)
    app.post('/api/engine/wheelbarrow/order', async (req, res) => {
        try {
            const { user_id, ...payload } = req.body || {};
            if (!user_id) return res.status(400).json({ status: 'error', message: 'user_id required' });
            const result = await wheelbarrow.createWheelbarrowOrder(Number(user_id), payload);
            res.json({
                status: 'success',
                data: {
                    order_id: result.order.id,
                    order_code: result.order.order_code,
                    order_status: result.order.order_status,
                    price: result.quote.total,
                    quote: result.quote
                }
            });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    // Complete + settle
    app.post('/api/engine/wheelbarrow/order/:orderId/complete', async (req, res) => {
        try {
            const result = await wheelbarrow.onWheelbarrowOrderCompleted(Number(req.params.orderId));
            res.json({ status: 'success', data: result });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    // Cancel + release
    app.post('/api/engine/wheelbarrow/order/:orderId/cancel', async (req, res) => {
        try {
            const result = await wheelbarrow.onWheelbarrowOrderCancelled(Number(req.params.orderId));
            res.json({ status: 'success', data: result });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    console.log('  Engine wheelbarrow routes loaded');
};
