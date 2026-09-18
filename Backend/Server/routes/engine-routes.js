// routes/engine-routes.js
// Mounted from server.js before the 404 handler.
const zones = require('../engine/zones');

module.exports = function mountEngineRoutes(app) {

    // ---------- PUBLIC: read zones/landmarks ----------
    app.get('/api/engine/zones', async (req, res) => {
        try {
            const includeInactive = req.query.all === '1';
            res.json({ status: 'success', data: await zones.getAllZones(includeInactive) });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    app.get('/api/engine/zones/:id/landmarks', async (req, res) => {
        try {
            const includeInactive = req.query.all === '1';
            res.json({ status: 'success', data: await zones.getLandmarksInZone(Number(req.params.id), includeInactive) });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    app.get('/api/engine/landmarks/:id', async (req, res) => {
        try {
            const lm = await zones.getLandmarkById(Number(req.params.id));
            if (!lm) return res.status(404).json({ status: 'error', message: 'landmark not found' });
            res.json({ status: 'success', data: lm });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    // ---------- ADMIN: zones CRUD ----------
    app.post('/api/engine/admin/zones', async (req, res) => {
        try {
            const z = await zones.createZone(req.body || {});
            res.json({ status: 'success', data: z });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    app.put('/api/engine/admin/zones/:id', async (req, res) => {
        try {
            const z = await zones.updateZone(Number(req.params.id), req.body || {});
            res.json({ status: 'success', data: z });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    app.delete('/api/engine/admin/zones/:id', async (req, res) => {
        try {
            const z = await zones.deactivateZone(Number(req.params.id));
            res.json({ status: 'success', data: z });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    // ---------- ADMIN: landmarks CRUD ----------
    app.post('/api/engine/admin/landmarks', async (req, res) => {
        try {
            const lm = await zones.createLandmark(req.body || {});
            res.json({ status: 'success', data: lm });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    app.put('/api/engine/admin/landmarks/:id', async (req, res) => {
        try {
            const lm = await zones.updateLandmark(Number(req.params.id), req.body || {});
            res.json({ status: 'success', data: lm });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    app.delete('/api/engine/admin/landmarks/:id', async (req, res) => {
        try {
            const lm = await zones.deactivateLandmark(Number(req.params.id));
            res.json({ status: 'success', data: lm });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    console.log('  Engine routes loaded (zones + landmarks)');
};
