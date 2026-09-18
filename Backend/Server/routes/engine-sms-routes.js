// routes/engine-sms-routes.js
const sms = require('../engine/sms');
const notify = require('../engine/notify');
const orders = require('../engine/orders');

module.exports = function mountSmsRoutes(app) {

    // Simulate an inbound SMS
    app.post('/api/engine/sms/inbound', async (req, res) => {
        try {
            const { phone, body } = req.body || {};
            if (!phone || !body) return res.status(400).json({ status: 'error', message: 'phone and body required' });
            const reply = await sms.handleInboundSms(phone, body);
            res.json({ status: 'success', data: { reply } });
        } catch (e) {
            res.status(500).json({ status: 'error', message: e.message });
        }
    });

    // Get SMS log
    app.get('/api/engine/sms/log', async (req, res) => {
        try {
            const limit = Number(req.query.limit) || 100;
            const rows = await notify.getSmsLog(limit);
            res.json({ status: 'success', data: rows });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    // SMS for a phone
    app.get('/api/engine/sms/log/phone/:phone', async (req, res) => {
        try {
            const rows = await notify.getSmsForPhone(req.params.phone, 50);
            res.json({ status: 'success', data: rows });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    // Manually trigger new-job SMS for an order
    app.post('/api/engine/sms/test/new-job/:orderId', async (req, res) => {
        try {
            const order = await orders.getOrderById(Number(req.params.orderId));
            if (!order) return res.status(404).json({ status: 'error', message: 'order not found' });
            if (!order.provider_id) return res.status(400).json({ status: 'error', message: 'order has no provider assigned' });
            const result = await notify.notifyProviderNewJob(order.provider_id, order);
            res.json({ status: 'success', data: result });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    console.log('  Engine SMS routes loaded');
};
