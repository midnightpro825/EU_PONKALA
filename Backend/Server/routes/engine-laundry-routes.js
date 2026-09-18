// routes/engine-laundry-routes.js
const laundry = require('../engine/laundry');

module.exports = function mountLaundryRoutes(app) {

    // ---------- CATALOG ----------
    app.get('/api/engine/laundry/catalog', async (req, res) => {
        try {
            const list = await laundry.listItems(req.query.all === '1');
            res.json({ status: 'success', data: list });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    app.post('/api/engine/laundry/catalog/items', async (req, res) => {
        try {
            const item = await laundry.createItem(req.body || {});
            res.json({ status: 'success', data: item });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    app.put('/api/engine/laundry/catalog/items/:itemId', async (req, res) => {
        try {
            const item = await laundry.updateItem(Number(req.params.itemId), req.body || {});
            res.json({ status: 'success', data: item });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    // ---------- ACCESS ----------
    app.get('/api/engine/laundry/access/:userId', async (req, res) => {
        try {
            const state = await laundry.getAccessState(Number(req.params.userId));
            res.json({ status: 'success', data: state });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    app.post('/api/engine/laundry/access/unlock', async (req, res) => {
        try {
            const { user_id, reference } = req.body || {};
            if (!user_id) return res.status(400).json({ status: 'error', message: 'user_id required' });
            const state = await laundry.unlockAccess(Number(user_id), reference);
            res.json({ status: 'success', data: state });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    // ---------- PRICE CALC ----------
    app.post('/api/engine/laundry/price', async (req, res) => {
        try {
            const { items } = req.body || {};
            const result = await laundry.calculatePrice(items);
            res.json({ status: 'success', data: result });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    // ---------- CREATE ORDER ----------
    app.post('/api/engine/laundry/order', async (req, res) => {
        try {
            const { user_id, items, pickup_zone_id, pickup_landmark_id, pickup_address_text, instructions } = req.body || {};
            if (!user_id) return res.status(400).json({ status: 'error', message: 'user_id required' });
            const result = await laundry.createLaundryOrder(Number(user_id), {
                items, pickup_zone_id, pickup_landmark_id, pickup_address_text, instructions
            });
            res.json({
                status: 'success',
                data: {
                    order_id: result.order.id,
                    order_code: result.order.order_code,
                    order_status: result.order.order_status,
                    price: result.total,
                    items: result.items,
                    access: result.access
                }
            });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    // ---------- CONSUME / RELEASE ----------
    app.post('/api/engine/laundry/order/:orderId/consume-connection', async (req, res) => {
        try {
            const result = await laundry.onLaundryOrderCompleted(Number(req.params.orderId));
            res.json({ status: 'success', data: result });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    app.post('/api/engine/laundry/order/:orderId/release-connection', async (req, res) => {
        try {
            const result = await laundry.onLaundryOrderCancelled(Number(req.params.orderId));
            res.json({ status: 'success', data: result });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    console.log('  Engine laundry routes loaded');
};
