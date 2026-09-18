const notif = require('../engine/notifications');

module.exports = function mountNotificationRoutes(app) {
    app.get('/api/engine/notifications/:userId', async (req, res) => {
        try {
            const all = req.query.all === '1';
            const list = all ? await notif.getAll(Number(req.params.userId)) : await notif.getUnread(Number(req.params.userId));
            const unread = await notif.countUnread(Number(req.params.userId));
            res.json({ status: 'success', data: { unread, items: list } });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    app.post('/api/engine/notifications/:id/read', async (req, res) => {
        try {
            const r = await notif.markRead(Number(req.params.id));
            res.json({ status: 'success', data: r });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    app.post('/api/engine/notifications/:userId/read-all', async (req, res) => {
        try {
            const r = await notif.markAllRead(Number(req.params.userId));
            res.json({ status: 'success', data: r });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    app.post('/api/engine/notifications/:userId/enqueue', async (req, res) => {
        try {
            const { type, title, body, deep_link } = req.body || {};
            const r = await notif.enqueue(Number(req.params.userId), type, title, body, deep_link);
            res.json({ status: 'success', data: r });
        } catch (e) { res.status(400).json({ status: 'error', message: e.message }); }
    });

    console.log('  Engine notifications routes loaded');
};
