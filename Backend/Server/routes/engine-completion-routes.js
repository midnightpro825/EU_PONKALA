// routes/engine-completion-routes.js
const completion = require('../engine/completion');

module.exports = function mountCompletionRoutes(app) {

    // Issue a new code (called when order enters COMPLETION_PENDING)
    app.post('/api/engine/completion/:orderId/generate', async (req, res) => {
        try {
            const result = await completion.generateCode(Number(req.params.orderId));
            res.json({ status: 'success', data: result });
        } catch (e) {
            res.status(400).json({ status: 'error', message: e.message });
        }
    });

    // Verify + consume (student or provider submits)
    app.post('/api/engine/completion/:orderId/verify', async (req, res) => {
        try {
            const { code } = req.body || {};
            if (!code) return res.status(400).json({ status: 'error', message: 'code required' });
            const result = await completion.consumeCode(Number(req.params.orderId), code);
            res.json({ status: 'success', data: result });
        } catch (e) {
            res.status(400).json({ status: 'error', message: e.message });
        }
    });

    // Get active code (for provider SMS)
    app.get('/api/engine/completion/:orderId/code', async (req, res) => {
        try {
            const row = await completion.getActiveCode(Number(req.params.orderId));
            if (!row) return res.status(404).json({ status: 'error', message: 'no active code' });
            res.json({ status: 'success', data: row });
        } catch (e) {
            res.status(500).json({ status: 'error', message: e.message });
        }
    });

    // Status (has an active code?)
    app.get('/api/engine/completion/:orderId/status', async (req, res) => {
        try {
            const row = await completion.getActiveCode(Number(req.params.orderId));
            res.json({
                status: 'success',
                data: { has_active_code: !!row, order_id: Number(req.params.orderId) }
            });
        } catch (e) {
            res.status(500).json({ status: 'error', message: e.message });
        }
    });

    // Debug: list all codes
    app.get('/api/engine/completion/:orderId/list', async (req, res) => {
        try {
            const rows = await completion.listCodes(Number(req.params.orderId));
            res.json({ status: 'success', data: rows });
        } catch (e) {
            res.status(500).json({ status: 'error', message: e.message });
        }
    });

    console.log('  Engine completion routes loaded');
};
