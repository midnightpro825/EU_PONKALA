// routes/engine-holds-routes.js
const holds = require('../engine/holds');
const autoComplete = require('../engine/auto-complete');

module.exports = function mountHoldsRoutes(app) {

    // ---------- Holds ----------
    app.get('/api/engine/holds/order/:orderId', async (req, res) => {
        try {
            const rows = await holds.getHoldsForOrder(Number(req.params.orderId));
            res.json({ status: 'success', data: rows });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    app.post('/api/engine/holds/order/:orderId/settle', async (req, res) => {
        try {
            const rows = await holds.settleOnCompletion(Number(req.params.orderId));
            res.json({ status: 'success', data: rows });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    app.post('/api/engine/holds/order/:orderId/release', async (req, res) => {
        try {
            const rows = await holds.releaseOnCancel(Number(req.params.orderId));
            res.json({ status: 'success', data: rows });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    // ---------- Auto-complete ----------
    app.post('/api/engine/auto-complete/order/:orderId/schedule', async (req, res) => {
        try {
            const mins = req.body && req.body.minutes;
            const result = await autoComplete.scheduleAutoComplete(Number(req.params.orderId), mins);
            res.json({ status: 'success', data: result });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    app.post('/api/engine/auto-complete/sweep', async (req, res) => {
        try {
            const result = await autoComplete.runSweep();
            res.json({ status: 'success', data: result });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    app.get('/api/engine/auto-complete/pending', async (req, res) => {
        try {
            const rows = await autoComplete.findPendingAutoCompletes();
            res.json({ status: 'success', data: rows });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    console.log('  Engine holds + auto-complete routes loaded');
};
