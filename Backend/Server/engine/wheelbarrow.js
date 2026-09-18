// engine/wheelbarrow.js - Wheelbarrow module (Part J)
const { run, get, all } = require('./db');
const config = require('./config');
const orders = require('./orders');
const holds = require('./holds');

// ---------------------------------------------------------------
// PRICING (Part J3 - admin-configurable)
// ---------------------------------------------------------------
async function listPricingRules(includeInactive) {
    const sql = includeInactive
        ? `SELECT * FROM engine_wheelbarrow_pricing ORDER BY rule_id`
        : `SELECT * FROM engine_wheelbarrow_pricing WHERE is_active = 1 ORDER BY rule_id`;
    return all(sql);
}

async function getPricingRuleByName(name) {
    return get(`SELECT * FROM engine_wheelbarrow_pricing WHERE rule_name = ? AND is_active = 1`, [name]);
}

async function updatePricingRule(ruleId, fields) {
    const allowed = [
        'rule_name', 'base_price', 'per_zone_distance', 'per_wheelbarrow',
        'load_multiplier_small', 'load_multiplier_medium', 'load_multiplier_large',
        'waiting_per_minute', 'is_active'
    ];
    const sets = [], vals = [];
    for (const k of allowed) {
        if (fields[k] !== undefined) { sets.push(k + ' = ?'); vals.push(fields[k]); }
    }
    if (!sets.length) throw new Error('no fields to update');
    sets.push('updated_at = CURRENT_TIMESTAMP');
    vals.push(ruleId);
    await run(`UPDATE engine_wheelbarrow_pricing SET ${sets.join(', ')} WHERE rule_id = ?`, vals);
    return get(`SELECT * FROM engine_wheelbarrow_pricing WHERE rule_id = ?`, [ruleId]);
}

// ---------------------------------------------------------------
// QUOTE CALCULATION
// ---------------------------------------------------------------
// Input:
//   pickup_zone_id, destination_zone_id  zone IDs (1..6)
//   load_size  'SMALL' | 'MEDIUM' | 'LARGE'
//   wheelbarrow_count  integer
//   waiting_minutes  optional
// Returns breakdown + total.
async function calculateQuote(input) {
    const rule = await getPricingRuleByName('DEFAULT');
    if (!rule) throw new Error('no default wheelbarrow pricing rule');

    const {
        pickup_zone_id, destination_zone_id,
        load_size, wheelbarrow_count, waiting_minutes
    } = input;

    if (!pickup_zone_id || !destination_zone_id) {
        throw new Error('pickup_zone_id and destination_zone_id required');
    }
    const zoneHops = Math.abs(Number(destination_zone_id) - Number(pickup_zone_id));
    const base = Number(rule.base_price);
    const distanceCharge = Number((zoneHops * Number(rule.per_zone_distance)).toFixed(2));

    const loadUpper = String(load_size || 'SMALL').toUpperCase();
    let loadMultiplier = 1.0;
    if (loadUpper === 'MEDIUM') loadMultiplier = Number(rule.load_multiplier_medium);
    if (loadUpper === 'LARGE')  loadMultiplier = Number(rule.load_multiplier_large);

    const wheelbarrows = Math.max(1, Number(wheelbarrow_count || 1));
    const wheelbarrowCharge = Number((wheelbarrows * Number(rule.per_wheelbarrow)).toFixed(2));

    // load_multiplier applies to (base + distance)
    const subtotal = (base + distanceCharge) * loadMultiplier;
    const subtotalRounded = Number(subtotal.toFixed(2));

    const waiting = Math.max(0, Number(waiting_minutes || 0));
    const waitingCharge = Number((waiting * Number(rule.waiting_per_minute)).toFixed(2));

    const total = Number((subtotalRounded + wheelbarrowCharge + waitingCharge).toFixed(2));

    return {
        pickup_zone_id: Number(pickup_zone_id),
        destination_zone_id: Number(destination_zone_id),
        zone_hops: zoneHops,
        load_size: loadUpper,
        wheelbarrow_count: wheelbarrows,
        waiting_minutes: waiting,
        breakdown: {
            base_price: base,
            distance_charge: distanceCharge,
            load_multiplier: loadMultiplier,
            subtotal_after_multiplier: subtotalRounded,
            wheelbarrow_charge: wheelbarrowCharge,
            waiting_charge: waitingCharge
        },
        total
    };
}

// ---------------------------------------------------------------
// CREATE WHEELBARROW ORDER
// ---------------------------------------------------------------
async function createWheelbarrowOrder(userId, payload) {
    const {
        pickup_zone_id, pickup_landmark_id,
        destination_zone_id, destination_landmark_id,
        load_size, wheelbarrow_count, waiting_minutes,
        pickup_address_text, destination_address_text,
        instructions
    } = payload;

    // Calculate price
    const quote = await calculateQuote({
        pickup_zone_id, destination_zone_id,
        load_size, wheelbarrow_count, waiting_minutes
    });

    // Create order with full destination fields + load info
    const order = await orders.createOrder({
        service_type: 'WHEELBARROW',
        customer_user_id: userId,
        price: quote.total,
        pickup_zone_id,
        pickup_landmark_id,
        destination_zone_id,
        destination_landmark_id,
        pickup_address_text,
        destination_address_text,
        instructions,
        load_size: quote.load_size,
        wheelbarrow_count: quote.wheelbarrow_count
    });

    return { order, quote };
}

// ---------------------------------------------------------------
// COMPLETION / CANCEL
// ---------------------------------------------------------------
// Wheelbarrow doesn't use connections, so on completion we just
// settle commission (handled by lifecycle.onOrderCompleted).
async function onWheelbarrowOrderCompleted(orderId) {
    const order = await orders.getOrderById(orderId);
    if (!order) throw new Error('order not found');
    if (order.service_type !== 'WHEELBARROW') return { skipped: true };
    // Lifecycle already handles commission settlement
    return { settled: true, order_id: orderId, order_code: order.order_code };
}

async function onWheelbarrowOrderCancelled(orderId) {
    const order = await orders.getOrderById(orderId);
    if (!order) throw new Error('order not found');
    if (order.service_type !== 'WHEELBARROW') return { skipped: true };
    await holds.releaseOnCancel(orderId);
    return { released: true, order_id: orderId };
}

module.exports = {
    listPricingRules, getPricingRuleByName, updatePricingRule,
    calculateQuote,
    createWheelbarrowOrder,
    onWheelbarrowOrderCompleted, onWheelbarrowOrderCancelled
};
