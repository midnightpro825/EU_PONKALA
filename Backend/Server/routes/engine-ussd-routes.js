const ussd = require('../engine/ussd');

module.exports = function mountUssdRoutes(app) {
    app.post('/api/engine/ussd/session', async (req, res) => {
        try {
            const { phone, sessionId, input } = req.body || {};
            if (!phone || !sessionId) return res.status(400).json({ status: 'error', message: 'phone and sessionId required' });
            const result = await ussd.handleUssd(phone, sessionId, input || '');
            res.json({ status: 'success', data: result });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    app.get('/api/engine/ussd/sessions', async (req, res) => {
        try {
            const { all } = require('../engine/db');
            const rows = await all(`SELECT * FROM ussd_sessions WHERE ended_at IS NULL ORDER BY last_activity DESC LIMIT 50`);
            res.json({ status: 'success', data: rows });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    app.get('/api/engine/ussd/session/:sessionId', async (req, res) => {
        try {
            const { get } = require('../engine/db');
            const row = await get(`SELECT * FROM ussd_sessions WHERE session_id = ?`, [req.params.sessionId]);
            if (!row) return res.status(404).json({ status: 'error', message: 'session not found' });
            res.json({ status: 'success', data: row });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    console.log('  Engine USSD routes loaded');
};
