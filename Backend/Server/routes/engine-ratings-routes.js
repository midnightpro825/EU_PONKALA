// routes/engine-ratings-routes.js
const ratings = require('../engine/ratings');

module.exports = function mountRatingsRoutes(app) {
    // Submit a rating for an order
    app.post('/api/engine/ratings/order/:orderId', async (req, res) => {
        try {
            const { student_user_id, stars, comment } = req.body || {};
            if (!student_user_id || !stars) return res.status(400).json({ status: 'error', message: 'student_user_id and stars required' });
            const r = await ratings.submitRating(Number(req.params.orderId), Number(student_user_id), stars, comment);
            res.json({ status: 'success', data: r });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    // Get rating for a specific order
    app.get('/api/engine/ratings/order/:orderId', async (req, res) => {
        try {
            const { student_user_id } = req.query;
            const r = await ratings.getStudentRatingForOrder(Number(req.params.orderId), Number(student_user_id));
            res.json({ status: 'success', data: r || null });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    // Provider rating list + summary
    app.get('/api/engine/ratings/provider/:providerId', async (req, res) => {
        try {
            const list = await ratings.getProviderRatings(Number(req.params.providerId), 50);
            const summary = await ratings.getProviderRatingSummary(Number(req.params.providerId));
            res.json({ status: 'success', data: { summary, ratings: list } });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    // Provider composite score for matching
    app.get('/api/engine/ratings/provider/:providerId/score', async (req, res) => {
        try {
            const score = await ratings.getProviderScore(Number(req.params.providerId));
            res.json({ status: 'success', data: score });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    console.log('  Engine ratings routes loaded');
};
