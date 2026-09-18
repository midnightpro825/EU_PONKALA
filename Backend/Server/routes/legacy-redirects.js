// routes/legacy-redirects.js
// Maps old endpoints to the new engine. Lets legacy pages keep working
// while we rebuild them one by one.

module.exports = function mountLegacyRedirects(app) {

    // ---------- Laundry legacy  engine ----------
    app.get('/api/laundry/items', (req, res) => res.redirect(307, '/api/engine/laundry/catalog'));
    app.get('/api/laundry/access/:userId', (req, res) => res.redirect(307, '/api/engine/laundry/access/' + req.params.userId));
    app.post('/api/laundry/unlock', (req, res) => res.redirect(307, '/api/engine/laundry/access/unlock'));
    app.post('/api/laundry/orders', (req, res) => res.redirect(307, '/api/engine/laundry/order'));
    app.get('/api/laundry/orders/:userId', (req, res) => res.redirect(307, '/api/engine/orders/user-enriched/' + req.params.userId));

    // ---------- Provider legacy  engine ----------
    app.post('/api/providers/login', async (req, res) => {
        try {
            const { phone, pin } = req.body || {};
            if (!phone) return res.status(400).json({ status: 'error', message: 'phone required' });
            const db = require('../engine/db');
            const bcrypt = require('bcryptjs');
            const p = await db.get('SELECT * FROM providers WHERE phone = ?', [phone]);
            if (!p) return res.status(404).json({ status: 'error', message: 'provider not found' });
            if (pin && p.pin_hash) {
                const ok = await bcrypt.compare(String(pin), p.pin_hash);
                if (!ok) return res.status(401).json({ status: 'error', message: 'invalid PIN' });
            }
            res.json({ status: 'success', data: {
                id: p.id, provider_id: p.id,
                full_name: p.full_name, phone: p.phone,
                provider_code: p.provider_code,
                verification_status: p.verification_status,
                account_status: p.account_status
            }});
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    app.get('/api/washer/:id/wallet', (req, res) => res.redirect(307, '/api/engine/provider/earnings/' + req.params.id + '?period=week'));
    app.get('/api/washer/orders/:providerId', (req, res) => res.redirect(307, '/api/engine/orders/provider/' + req.params.providerId));

    // ---------- Wheelbarrow legacy  engine ----------
    app.post('/api/wheelbarrow/quote', (req, res) => res.redirect(307, '/api/engine/wheelbarrow/quote'));
    app.post('/api/wheelbarrow/orders', (req, res) => res.redirect(307, '/api/engine/wheelbarrow/order'));
    app.get('/api/wheelbarrow/orders/:userId', (req, res) => res.redirect(307, '/api/engine/orders/user-enriched/' + req.params.userId));

    console.log('  Legacy redirect shims loaded (M1)');
};
