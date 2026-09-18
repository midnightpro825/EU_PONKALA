// routes/engine-provider-routes.js
const reg = require('../engine/provider-registration');
const ver = require('../engine/provider-verification');

module.exports = function mountProviderRoutes(app) {
    // ---- Registration ----
    app.post('/api/engine/provider/register/start', async (req, res) => {
        try {
            const { phone, full_name } = req.body || {};
            const r = await reg.startRegistration(phone, full_name);
            res.json({ status: 'success', data: r });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    app.post('/api/engine/provider/register/verify-otp', async (req, res) => {
        try {
            const { provider_id, otp } = req.body || {};
            const r = await reg.verifyOtp(provider_id, otp);
            res.json({ status: 'success', data: r });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    app.post('/api/engine/provider/register/set-pin', async (req, res) => {
        try {
            const { provider_id, pin } = req.body || {};
            const r = await reg.setPin(provider_id, pin);
            res.json({ status: 'success', data: r });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    app.get('/api/engine/provider/register/state/:providerId', async (req, res) => {
        try {
            const r = await reg.getRegistrationState(Number(req.params.providerId));
            if (!r) return res.status(404).json({ status: 'error', message: 'provider not found' });
            res.json({ status: 'success', data: r });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    // ---- Verification ----
    app.post('/api/engine/provider/verify/submit/:providerId', async (req, res) => {
        try {
            const r = await ver.submitForVerification(Number(req.params.providerId), (req.body||{}).notes);
            res.json({ status: 'success', data: r });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    app.get('/api/engine/provider/verify/pending', async (req, res) => {
        try {
            const list = await ver.listPendingVerifications();
            res.json({ status: 'success', data: list });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    app.post('/api/engine/provider/verify/approve/:providerId', async (req, res) => {
        try {
            const { admin_user_id, notes } = req.body || {};
            const r = await ver.approveProvider(Number(req.params.providerId), admin_user_id, notes);
            res.json({ status: 'success', data: r });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    app.post('/api/engine/provider/verify/reject/:providerId', async (req, res) => {
        try {
            const { admin_user_id, reason } = req.body || {};
            const r = await ver.rejectProvider(Number(req.params.providerId), admin_user_id, reason);
            res.json({ status: 'success', data: r });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    console.log('  Engine provider routes loaded');
};
