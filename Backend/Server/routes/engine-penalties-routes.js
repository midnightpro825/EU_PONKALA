const pen = require('../engine/penalties');

module.exports = function mountPenaltyRoutes(app) {
    app.get('/api/engine/penalties/recent', async (req, res) => {
        try {
            const r = await pen.listRecentPenalties(100);
            res.json({ status: 'success', data: r });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    app.get('/api/engine/penalties/standing/:subjectType/:subjectId', async (req, res) => {
        try {
            const r = await pen.getStanding(req.params.subjectType.toUpperCase(), Number(req.params.subjectId));
            res.json({ status: 'success', data: r });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    app.post('/api/engine/penalties/record', async (req, res) => {
        try {
            const { subject_type, subject_id, offense_type, notes } = req.body || {};
            if (!subject_type || !subject_id || !offense_type) {
                return res.status(400).json({ status: 'error', message: 'subject_type, subject_id, offense_type required' });
            }
            const r = await pen.recordOffense(subject_type.toUpperCase(), Number(subject_id), offense_type, notes);
            res.json({ status: 'success', data: r });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    app.post('/api/engine/penalties/:penaltyId/clear', async (req, res) => {
        try {
            const { admin_user_id } = req.body || {};
            const r = await pen.clearPenalty(Number(req.params.penaltyId), admin_user_id);
            res.json({ status: 'success', data: r });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    app.get('/api/engine/penalties/suspended', async (req, res) => {
        try {
            const r = await pen.listSuspended();
            res.json({ status: 'success', data: r });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    console.log('  Engine penalties routes loaded');
};
