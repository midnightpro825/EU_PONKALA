// routes/engine-lifecycle-routes.js
const lifecycle = require('../engine/lifecycle');
const orders = require('../engine/orders');
const matching = require('../engine/matching');

module.exports = function mountLifecycleRoutes(app) {

    // One-shot: put order into PROVIDER_SEARCHING, auto-assign, fire SMS
    app.post('/api/engine/lifecycle/order/:orderId/assign', async (req, res) => {
        try {
            const orderId = Number(req.params.orderId);
            const order = await orders.getOrderById(orderId);
            if (!order) return res.status(404).json({ status: 'error', message: 'order not found' });

            // Ensure state is PROVIDER_SEARCHING
            if (order.order_status === 'PAYMENT_CONFIRMED') {
                await orders.transition(orderId, 'PROVIDER_SEARCHING', 'LIFECYCLE');
            }
            const asg = await matching.autoAssign(orderId);

            // Fire the new-job SMS now that assignment is done
            if (asg.assigned) {
                try {
                    await lifecycle.onOrderAssigned(orderId);
                    asg.sms_sent = true;
                } catch (e) {
                    console.error('onOrderAssigned:', e.message);
                    asg.sms_sent = false;
                    asg.sms_error = e.message;
                }
            }

            res.json({ status: 'success', data: asg });
        } catch (e) {
            res.status(400).json({ status: 'error', message: e.message });
        }
    });

    // Force-settle an order
    app.post('/api/engine/lifecycle/order/:orderId/complete', async (req, res) => {
        try {
            const r = await lifecycle.onOrderCompleted(Number(req.params.orderId));
            res.json({ status: 'success', data: r });
        } catch (e) {
            res.status(400).json({ status: 'error', message: e.message });
        }
    });

    // Full trace
    app.get('/api/engine/lifecycle/order/:orderId/trace', async (req, res) => {
        try {
            const t = await lifecycle.traceOrder(Number(req.params.orderId));
            res.json({ status: 'success', data: t });
        } catch (e) {
            res.status(500).json({ status: 'error', message: e.message });
        }
    });

    console.log('  Engine lifecycle routes loaded');
};

