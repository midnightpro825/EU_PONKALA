// engine/orders.js - Order state machine (Part G)
const { run, get, all } = require('./db');
const config = require('./config');

const LAUNDRY_STATES = [
    'REQUESTED', 'PAYMENT_PENDING', 'PAYMENT_CONFIRMED',
    'PROVIDER_SEARCHING', 'PROVIDER_ASSIGNED', 'PROVIDER_CONTACTED',
    'PROVIDER_ON_THE_WAY', 'PROVIDER_ARRIVED', 'WASHING',
    'COMPLETION_PENDING', 'COMPLETED'
];

const WHEELBARROW_STATES = [
    'REQUESTED', 'PAYMENT_PENDING', 'PAYMENT_CONFIRMED',
    'PROVIDER_SEARCHING', 'PROVIDER_ASSIGNED', 'PROVIDER_CONTACTED',
    'PROVIDER_ON_THE_WAY', 'PROVIDER_ARRIVED', 'LOADING',
    'TRANSPORTING', 'ARRIVED_AT_DESTINATION',
    'COMPLETION_PENDING', 'COMPLETED'
];

const TERMINAL_STATES = ['COMPLETED', 'CANCELLED', 'DISPUTED'];

const ALLOWED_TRANSITIONS = {
    REQUESTED:            ['PAYMENT_PENDING', 'PAYMENT_CONFIRMED', 'CANCELLED'],
    PAYMENT_PENDING:      ['PAYMENT_CONFIRMED', 'CANCELLED'],
    PAYMENT_CONFIRMED:    ['PROVIDER_SEARCHING', 'CANCELLED'],
    PROVIDER_SEARCHING:   ['PROVIDER_ASSIGNED', 'CANCELLED'],
    PROVIDER_ASSIGNED:    ['PROVIDER_CONTACTED', 'CANCELLED'],
    PROVIDER_CONTACTED:   ['PROVIDER_ON_THE_WAY', 'CANCELLED'],
    PROVIDER_ON_THE_WAY:  ['PROVIDER_ARRIVED', 'CANCELLED'],
    PROVIDER_ARRIVED:     ['WASHING', 'LOADING', 'CANCELLED'],
    WASHING:              ['COMPLETION_PENDING', 'DISPUTED'],
    LOADING:              ['TRANSPORTING', 'DISPUTED'],
    TRANSPORTING:         ['ARRIVED_AT_DESTINATION', 'DISPUTED'],
    ARRIVED_AT_DESTINATION: ['COMPLETION_PENDING', 'DISPUTED'],
    COMPLETION_PENDING:   ['COMPLETED', 'DISPUTED'],
    COMPLETED:            [],
    CANCELLED:            [],
    DISPUTED:             ['COMPLETED', 'CANCELLED']
};

function toStudentState(state) {
    switch (state) {
        case 'REQUESTED':
        case 'PAYMENT_PENDING':       return 'Waiting for payment';
        case 'PAYMENT_CONFIRMED':
        case 'PROVIDER_SEARCHING':    return 'Finding a provider';
        case 'PROVIDER_ASSIGNED':
        case 'PROVIDER_CONTACTED':    return 'Provider assigned';
        case 'PROVIDER_ON_THE_WAY':
        case 'PROVIDER_ARRIVED':      return 'Provider on the way';
        case 'WASHING':
        case 'LOADING':
        case 'TRANSPORTING':
        case 'ARRIVED_AT_DESTINATION': return 'Service in progress';
        case 'COMPLETION_PENDING':    return 'Enter completion code';
        case 'COMPLETED':             return 'Completed';
        case 'CANCELLED':             return 'Cancelled';
        case 'DISPUTED':              return 'Under review';
        default:                      return state;
    }
}

function toProviderState(state) {
    switch (state) {
        case 'REQUESTED':
        case 'PAYMENT_PENDING':
        case 'PAYMENT_CONFIRMED':
        case 'PROVIDER_SEARCHING':    return 'Waiting';
        case 'PROVIDER_ASSIGNED':
        case 'PROVIDER_CONTACTED':    return 'New job accepted';
        case 'PROVIDER_ON_THE_WAY':   return 'On the way';
        case 'PROVIDER_ARRIVED':      return 'Arrived';
        case 'WASHING':
        case 'LOADING':
        case 'TRANSPORTING':
        case 'ARRIVED_AT_DESTINATION': return 'In progress';
        case 'COMPLETION_PENDING':    return 'Give code to student';
        case 'COMPLETED':             return 'Completed';
        case 'CANCELLED':             return 'Cancelled';
        case 'DISPUTED':              return 'Under review';
        default:                      return state;
    }
}

async function generateOrderCode(serviceType) {
    const prefix = serviceType === 'LAUNDRY'
        ? config.order_prefix_laundry
        : config.order_prefix_wheelbarrow;
    const rand = Math.floor(10000 + Math.random() * 90000);
    const code = prefix + rand;
    const existing = await get(`SELECT id FROM service_orders WHERE order_code = ?`, [code]);
    if (existing) return generateOrderCode(serviceType);
    return code;
}

// Cash-only in V1: payment_status goes straight to CONFIRMED.
async function createOrder(input) {
    const {
        service_type, customer_user_id, price,
        pickup_zone_id, pickup_landmark_id,
        destination_zone_id, destination_landmark_id,
        pickup_address_text, destination_address_text, instructions,
        load_size, wheelbarrow_count
    } = input;

    if (!service_type || !customer_user_id) {
        throw new Error('service_type and customer_user_id required');
    }
    if (service_type !== 'LAUNDRY' && service_type !== 'WHEELBARROW') {
        throw new Error('service_type must be LAUNDRY or WHEELBARROW');
    }

    const code = await generateOrderCode(service_type);

    // Set both order_code (new) and order_number (legacy NOT NULL column) to the same value.
    const sql = `
        INSERT INTO service_orders
            (order_number, order_code, service_type, customer_user_id,
             payment_method, payment_status, order_status, price,
             pickup_zone_id, pickup_landmark_id,
             destination_zone_id, destination_landmark_id,
             pickup_address_text, destination_address_text, instructions,
             load_size, wheelbarrow_count,
             created_at, updated_at)
        VALUES (?, ?, ?, ?,
                'CASH', 'CONFIRMED', 'PAYMENT_CONFIRMED', ?,
                ?, ?, ?, ?, ?, ?, ?, ?, ?,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
    const result = await run(sql, [
        code, code, service_type, customer_user_id,
        price || 0,
        pickup_zone_id || null, pickup_landmark_id || null,
        destination_zone_id || null, destination_landmark_id || null,
        pickup_address_text || null, destination_address_text || null,
        instructions || null,
        load_size || null, wheelbarrow_count || null
    ]);

    return getOrderById(result.lastID);
}

async function transition(orderId, newState, actor, notes) {
    const order = await getOrderById(orderId);
    if (!order) throw new Error('order not found: ' + orderId);

    const currentState = order.order_status;
    if (TERMINAL_STATES.includes(currentState)) {
        throw new Error(`order is in terminal state "${currentState}"  cannot transition`);
    }

    const allowed = ALLOWED_TRANSITIONS[currentState] || [];
    if (!allowed.includes(newState)) {
        throw new Error(
            `illegal transition ${currentState}  ${newState}. Allowed: ${allowed.join(', ') || 'none'}`
        );
    }

    const updates = ['order_status = ?', 'updated_at = CURRENT_TIMESTAMP'];
    const values = [newState];

    if (newState === 'PROVIDER_ASSIGNED') { updates.push('accepted_at = CURRENT_TIMESTAMP'); }
    if (newState === 'COMPLETED')         { updates.push('completed_at = CURRENT_TIMESTAMP'); }
    if (newState === 'CANCELLED')         { updates.push('cancelled_at = CURRENT_TIMESTAMP'); }
    if (newState === 'DISPUTED' && notes) { updates.push('dispute_info = ?'); values.push(notes); }

    values.push(orderId);
    await run(`UPDATE service_orders SET ${updates.join(', ')} WHERE id = ?`, values);

    return getOrderById(orderId);
}

async function getOrderById(orderId) {
    return get(`SELECT * FROM service_orders WHERE id = ?`, [orderId]);
}

async function getOrderByCode(code) {
    return get(`SELECT * FROM service_orders WHERE order_code = ?`, [code]);
}

async function getOrdersForUser(userId, limit) {
    return all(
        `SELECT * FROM service_orders WHERE customer_user_id = ?
         ORDER BY created_at DESC LIMIT ?`,
        [userId, limit || 50]
    );
}

async function getOrdersForProvider(providerId, limit) {
    return all(
        `SELECT * FROM service_orders WHERE provider_id = ?
         ORDER BY created_at DESC LIMIT ?`,
        [providerId, limit || 50]
    );
}

async function assignProvider(orderId, providerId) {
    const order = await getOrderById(orderId);
    if (!order) throw new Error('order not found');
    if (order.order_status !== 'PROVIDER_SEARCHING') {
        throw new Error(`cannot assign provider: order is in state ${order.order_status}`);
    }
    await run(
        `UPDATE service_orders SET provider_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [providerId, orderId]
    );
    return transition(orderId, 'PROVIDER_ASSIGNED', 'SYSTEM');
}

module.exports = {
    LAUNDRY_STATES, WHEELBARROW_STATES, TERMINAL_STATES, ALLOWED_TRANSITIONS,
    toStudentState, toProviderState,
    createOrder, transition, assignProvider,
    getOrderById, getOrderByCode,
    getOrdersForUser, getOrdersForProvider,
    generateOrderCode
};

