// engine/matching.js - Provider selection (Part K)
const { run, get, all } = require('./db');
const config = require('./config');
const orders = require('./orders');
const wallet = require('./wallet');
const penalties = require('./penalties');

// ---------------------------------------------------------------
// ELIGIBILITY QUERY
// ---------------------------------------------------------------
// Returns providers that:
//   1. providers.verification_status = 'verified'
//   2. providers.account_status = 'active'
//   3. provider_availability.status = 'AVAILABLE' for this service
//   4. provider_availability.zone_id matches order pickup_zone_id (or IS NULL  "covers all")
//   5. Not in excluded list
//
// Fair rotation: order by provider_availability.updated_at ASC (least recently used)
async function findEligibleProviders(orderId, excludeIds) {
    const order = await orders.getOrderById(orderId);
    if (!order) throw new Error('order not found: ' + orderId);

    const serviceType = order.service_type;   // 'LAUNDRY' | 'WHEELBARROW'
    const pickupZone = order.pickup_zone_id;
    const exclude = excludeIds || [];
    const excludePlaceholders = exclude.length ? `AND p.id NOT IN (${exclude.map(() => '?').join(',')})` : '';

    const sql = `
        SELECT
            p.id                    AS provider_id,
            p.provider_code,
            p.full_name,
            p.phone,
            pa.service_type,
            pa.status               AS availability_status,
            pa.zone_id              AS provider_zone_id,
            pa.updated_at           AS availability_updated_at
        FROM providers p
        JOIN provider_availability pa ON pa.provider_id = p.id
        WHERE p.verification_status = 'verified'
          AND p.account_status     = 'active'
          AND pa.service_type      = ?
          AND pa.status            = 'AVAILABLE'
          AND (pa.zone_id = ? OR pa.zone_id IS NULL)
          ${excludePlaceholders}
        ORDER BY pa.updated_at ASC
    `;

    const params = [serviceType, pickupZone, ...exclude];
    const rows = await all(sql, params);

    // For each candidate, check cash eligibility (wallet can cover commission).
    // Expected commission = order.price * commission_rate.
    const expectedCommission = Number(((order.price || 0) * config.commission_rate).toFixed(2));
    const eligible = [];
    for (const r of rows) {
        const ok = await wallet.canAcceptCashJob(r.provider_id, serviceType, expectedCommission);
        if (ok) {
            const state = await wallet.getWalletState(r.provider_id, serviceType);
            eligible.push({
                ...r,
                expected_commission: expectedCommission,
                wallet_total: state.total,
                wallet_available: state.available
            });
        }
    }
    return eligible;
}

// Return the single best candidate, or null.
async function findNextProvider(orderId, excludeIds) {
    const list = await findEligibleProviders(orderId, excludeIds);
    return list.length ? list[0] : null;
}

// ---------------------------------------------------------------
// ASSIGN
// ---------------------------------------------------------------
// Assign a specific provider to an order. Holds commission from wallet.
async function assignProviderToOrder(orderId, providerId) {
    const order = await orders.getOrderById(orderId);
    if (!order) throw new Error('order not found');
    if (order.order_status !== 'PROVIDER_SEARCHING') {
        throw new Error(`cannot assign: order is in state ${order.order_status}, must be PROVIDER_SEARCHING`);
    }

    const expectedCommission = Number(((order.price || 0) * config.commission_rate).toFixed(2));

    // 1. Verify cash eligibility
    const ok = await wallet.canAcceptCashJob(providerId, order.service_type, expectedCommission);
    if (!ok) throw new Error('provider not cash-eligible for this order');

    // 2. Assign provider + transition
    await orders.assignProvider(orderId, providerId);   // sets provider_id + PROVIDER_ASSIGNED

    // 3. Hold commission
    await wallet.holdCommission(providerId, order.service_type, orderId, expectedCommission);

    // 4. Update order row's commission + hold flag
    await run(
        `UPDATE service_orders
         SET commission = ?, commission_held = 1, connection_held = 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [expectedCommission, orderId]
    );

    // 5. Bump availability "last used" so fair-rotation cycles others in next time
    await run(
        `UPDATE provider_availability SET updated_at = CURRENT_TIMESTAMP
         WHERE provider_id = ? AND service_type = ?`,
        [providerId, order.service_type]
    );

        // 6. Fire new-job SMS via lifecycle
    
    try {
            } catch (e) {
        console.error('lifecycle.onOrderAssigned:', e.message);
    }

    return {
        order_id: orderId,
        order_code: order.order_code,
        provider_id: providerId,
        commission_held: expectedCommission,
        status: 'ASSIGNED'
    };
}

// Auto-assign: pick top eligible provider, assign them.
async function autoAssign(orderId, excludeIds) {
    const candidate = await findNextProvider(orderId, excludeIds);
    if (!candidate) return { assigned: false, reason: 'no eligible provider' };
    const result = await assignProviderToOrder(orderId, candidate.provider_id);
    return { assigned: true, candidate, result };
}

// ---------------------------------------------------------------
// AVAILABILITY helpers (used by matching + admin)
// ---------------------------------------------------------------

// Upsert availability for (provider, service). Creates or updates row.
async function setAvailability(providerId, serviceType, status, zoneId) {
    if (!['AVAILABLE', 'BUSY', 'OFFLINE', 'SUSPENDED'].includes(status)) {
        throw new Error('status must be AVAILABLE | BUSY | OFFLINE | SUSPENDED');
    }
    const existing = await get(
        `SELECT availability_id FROM provider_availability WHERE provider_id = ? AND service_type = ?`,
        [providerId, serviceType]
    );
    if (existing) {
        await run(
            `UPDATE provider_availability
             SET status = ?, zone_id = COALESCE(?, zone_id), last_change_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE availability_id = ?`,
            [status, zoneId || null, existing.availability_id]
        );
    } else {
        await run(
            `INSERT INTO provider_availability (provider_id, service_type, status, zone_id, last_change_at, updated_at)
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [providerId, serviceType, status, zoneId || null]
        );
    }
    return get(
        `SELECT * FROM provider_availability WHERE provider_id = ? AND service_type = ?`,
        [providerId, serviceType]
    );
}

async function getAvailability(providerId) {
    return all(
        `SELECT * FROM provider_availability WHERE provider_id = ? ORDER BY service_type`,
        [providerId]
    );
}

module.exports = {
    findEligibleProviders,
    findNextProvider,
    assignProviderToOrder,
    autoAssign,
    setAvailability,
    getAvailability
};





