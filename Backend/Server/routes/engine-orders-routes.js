// routes/engine-orders-routes.js - Order endpoints
const orders = require('../engine/orders');

module.exports = function mountOrderRoutes(app) {

    // Create order (cash-only)
    app.post('/api/engine/orders', async (req, res) => {
        try {
            const order = await orders.createOrder(req.body || {});
            res.json({
                status: 'success',
                data: {
                    order_id: order.id,
                    order_code: order.order_code,
                    order_status: order.order_status,
                    student_state: orders.toStudentState(order.order_status),
                    provider_state: orders.toProviderState(order.order_status)
                }
            });
        } catch (e) {
            res.status(400).json({ status: 'error', message: e.message });
        }
    });

    // Get one
    app.get('/api/engine/orders/:id', async (req, res) => {
        try {
            const o = await orders.getOrderById(Number(req.params.id));
            if (!o) return res.status(404).json({ status: 'error', message: 'order not found' });
            res.json({
                status: 'success',
                data: {
                    ...o,
                    student_state: orders.toStudentState(o.order_status),
                    provider_state: orders.toProviderState(o.order_status)
                }
            });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    // Transition
    app.post('/api/engine/orders/:id/transition', async (req, res) => {
        try {
            const { new_state, actor, notes } = req.body || {};
            if (!new_state) return res.status(400).json({ status: 'error', message: 'new_state required' });
            const o = await orders.transition(Number(req.params.id), new_state, actor || 'SYSTEM', notes);
            res.json({
                status: 'success',
                data: {
                    order_id: o.id,
                    order_code: o.order_code,
                    order_status: o.order_status,
                    student_state: orders.toStudentState(o.order_status),
                    provider_state: orders.toProviderState(o.order_status)
                }
            });
        } catch (e) {
            res.status(400).json({ status: 'error', message: e.message });
        }
    });

    // List by user
    app.get('/api/engine/orders/user/:userId', async (req, res) => {
        try {
            const list = await orders.getOrdersForUser(Number(req.params.userId));
            res.json({
                status: 'success',
                data: list.map(o => ({
                    ...o,
                    student_state: orders.toStudentState(o.order_status)
                }))
            });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    // List by provider
    app.get('/api/engine/orders/provider/:providerId', async (req, res) => {
        try {
            const list = await orders.getOrdersForProvider(Number(req.params.providerId));
            res.json({
                status: 'success',
                data: list.map(o => ({
                    ...o,
                    provider_state: orders.toProviderState(o.order_status)
                }))
            });
        } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
    });

    console.log('  Engine order routes loaded');
// ============================================================
// ENRICHED endpoints (Phase 6)  include provider phone + name
// ============================================================

// GET /api/engine/orders/user/:userId  enriched with provider details
app.get('/api/engine/orders/user-enriched/:userId', async (req, res) => {
    try {
        const db = require('../engine/db');
        const userId = Number(req.params.userId);
        const rows = await db.all(`
            SELECT o.*,
                   p.full_name  AS provider_name,
                   p.phone      AS provider_phone,
                   p.provider_code AS provider_code,
                   (SELECT AVG(rating) FROM provider_ratings WHERE provider_id = o.provider_id) AS provider_rating,
                   (SELECT COUNT(*) FROM provider_ratings WHERE provider_id = o.provider_id) AS provider_rating_count,
                   z1.zone_name AS pickup_zone_name,
                   z2.zone_name AS destination_zone_name,
                   l1.name AS pickup_landmark_name,
                   l2.name AS destination_landmark_name
            FROM service_orders o
            LEFT JOIN providers p ON o.provider_id = p.id
            LEFT JOIN zones z1 ON o.pickup_zone_id = z1.zone_id
            LEFT JOIN zones z2 ON o.destination_zone_id = z2.zone_id
            LEFT JOIN landmarks l1 ON o.pickup_landmark_id = l1.landmark_id
            LEFT JOIN landmarks l2 ON o.destination_landmark_id = l2.landmark_id
            WHERE o.customer_user_id = ?
            ORDER BY o.created_at DESC LIMIT 100
        `, [userId]);
        const orders = require('../engine/orders');
        const SAFE_STATES = ['PROVIDER_CONTACTED','PROVIDER_ON_THE_WAY','PROVIDER_ARRIVED','WASHING','LOADING','TRANSPORTING','ARRIVED_AT_DESTINATION','COMPLETION_PENDING','COMPLETED','DISPUTED','CANCELLED'];
        const enriched = rows.map(o => {
            const phoneVisible = SAFE_STATES.indexOf(o.order_status) >= 0;
            return {
                ...o,
                provider_phone: phoneVisible ? o.provider_phone : null,
                provider_phone_visible: phoneVisible,
                student_state: orders.toStudentState(o.order_status),
                provider_state: orders.toProviderState(o.order_status)
            };
        });
        res.json({ status: 'success', data: enriched });
    } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
});

// GET /api/engine/orders/single-enriched/:orderId  one order with everything
app.get('/api/engine/orders/single-enriched/:orderId', async (req, res) => {
    try {
        const db = require('../engine/db');
        const orderId = Number(req.params.orderId);
        const o = await db.get(`
            SELECT o.*,
                   p.full_name  AS provider_name,
                   p.phone      AS provider_phone,
                   p.provider_code AS provider_code,
                   (SELECT AVG(rating) FROM provider_ratings WHERE provider_id = o.provider_id) AS provider_rating,
                   (SELECT COUNT(*) FROM provider_ratings WHERE provider_id = o.provider_id) AS provider_rating_count,
                   z1.zone_name AS pickup_zone_name,
                   l1.name AS pickup_landmark_name
            FROM service_orders o
            LEFT JOIN providers p ON o.provider_id = p.id
            LEFT JOIN zones z1 ON o.pickup_zone_id = z1.zone_id
            LEFT JOIN landmarks l1 ON o.pickup_landmark_id = l1.landmark_id
            WHERE o.id = ?
        `, [orderId]);
        if (!o) return res.status(404).json({ status: 'error', message: 'order not found' });
        const orders = require('../engine/orders');
        const ratings = require('../engine/ratings');
        const existing = await ratings.getStudentRatingForOrder(orderId, o.customer_user_id);
        res.json({
            status: 'success',
            data: {
                ...o,
                student_state: orders.toStudentState(o.order_status),
                provider_state: orders.toProviderState(o.order_status),
                my_rating: existing
            }
        });
    } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
});

// GET /api/engine/orders/:orderId/items  items for an order
app.get('/api/engine/orders/:orderId/items', async (req, res) => {
    try {
        const db = require('../engine/db');
        const rows = await db.all(
            `SELECT * FROM order_items WHERE order_id = ? ORDER BY item_id`,
            [Number(req.params.orderId)]
        );
        res.json({ status: 'success', data: rows });
    } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
});

// ============================================================
// GET /api/engine/provider/available-jobs/:providerId
// Returns:
//   - Jobs assigned to this provider (their jobs to work on)
//   - PLUS unassigned jobs in their zone(s) that they can accept
// ============================================================
app.get('/api/engine/provider/available-jobs/:providerId', async (req, res) => {
    try {
        const db = require('../engine/db');
        const providerId = Number(req.params.providerId);

        // 1. Get provider
        const provider = await db.get(`SELECT * FROM providers WHERE id = ?`, [providerId]);
        if (!provider) return res.status(404).json({ status: 'error', message: 'provider not found' });

        // 2. Get provider availability
        const availability = await db.all(
            `SELECT * FROM provider_availability WHERE provider_id = ? AND status = 'AVAILABLE'`,
            [providerId]
        );
        const availableServices = availability.map(a => a.service_type);
        const availableZones = availability.map(a => a.zone_id).filter(z => z != null);
        const providerZone = availableZones.length ? availableZones[0] : 1;

        // 3. Assigned jobs (their work)
        const assigned = await db.all(`
            SELECT o.*,
                   u.full_name AS customer_name,
                   u.phone AS customer_phone,
                   z1.zone_name AS pickup_zone_name,
                   l1.name AS pickup_landmark_name
            FROM service_orders o
            LEFT JOIN users u ON o.customer_user_id = u.user_id
            LEFT JOIN zones z1 ON o.pickup_zone_id = z1.zone_id
            LEFT JOIN landmarks l1 ON o.pickup_landmark_id = l1.landmark_id
            WHERE o.provider_id = ?
              AND o.order_status NOT IN ('COMPLETED','CANCELLED','DISPUTED')
            ORDER BY o.created_at DESC
        `, [providerId]);

        // 4. Unassigned jobs matching services + zone (if provider is available)
        let unassigned = [];
        if (availableServices.length > 0) {
            const svcPlaceholders = availableServices.map(() => '?').join(',');
            unassigned = await db.all(`
                SELECT o.*,
                       u.full_name AS customer_name,
                       u.phone AS customer_phone,
                       z1.zone_name AS pickup_zone_name,
                       l1.name AS pickup_landmark_name
                FROM service_orders o
                LEFT JOIN users u ON o.customer_user_id = u.user_id
                LEFT JOIN zones z1 ON o.pickup_zone_id = z1.zone_id
                LEFT JOIN landmarks l1 ON o.pickup_landmark_id = l1.landmark_id
                WHERE o.provider_id IS NULL
                  AND o.order_status IN ('PAYMENT_CONFIRMED', 'PROVIDER_SEARCHING')
                  AND o.service_type IN (${svcPlaceholders})
                  
                ORDER BY o.created_at DESC
                LIMIT 20
            `, [...availableServices]);
        }

        res.json({
            status: 'success',
            data: {
                provider: { id: provider.id, name: provider.full_name, code: provider.provider_code },
                available_services: availableServices,
                provider_zone: providerZone,
                assigned: assigned || [],
                unassigned: unassigned || [],
                counts: {
                    assigned: (assigned || []).length,
                    unassigned: (unassigned || []).length
                }
            }
        });
    } catch (e) {
        res.status(500).json({ status: 'error', message: e.message });
    }
});
};




