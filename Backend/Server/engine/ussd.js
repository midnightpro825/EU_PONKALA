// engine/ussd.js - Mock USSD menu (Part H7)
const { run, get, all } = require('./db');
const orders = require('./orders');
const wallet = require('./wallet');
const matching = require('./matching');

const MAIN_MENU = [
    'EU PONKALA',
    '1. My Jobs',
    '2. Accept Job',
    '3. My Availability',
    '4. Wallet',
    '5. Top Up',
    '6. Job History',
    '7. My Services',
    '8. Help',
    '9. Logout'
].join('\n');

async function findProviderByPhone(phone) {
    return get(`SELECT * FROM providers WHERE phone = ? LIMIT 1`, [phone]);
}

async function getSession(sessionId, phone) {
    let s = await get(`SELECT * FROM ussd_sessions WHERE session_id = ?`, [sessionId]);
    if (!s) {
        await run(
            `INSERT INTO ussd_sessions (session_id, phone, current_menu, state, started_at, last_activity)
             VALUES (?, ?, 'main', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [sessionId, phone]
        );
        s = await get(`SELECT * FROM ussd_sessions WHERE session_id = ?`, [sessionId]);
    }
    return s;
}

function parseState(s) {
    try { return JSON.parse(s.state || '{}'); } catch { return {}; }
}

async function updateSession(sessionId, menu, state) {
    await run(
        `UPDATE ussd_sessions SET current_menu = ?, state = ?, last_activity = CURRENT_TIMESTAMP WHERE session_id = ?`,
        [menu, JSON.stringify(state || {}), sessionId]
    );
}

async function closeSession(sessionId) {
    await run(
        `UPDATE ussd_sessions SET ended_at = CURRENT_TIMESTAMP, last_activity = CURRENT_TIMESTAMP WHERE session_id = ?`,
        [sessionId]
    );
}

// Build a fresh "main menu" response and persist the state
async function goMain(sessionId) {
    await updateSession(sessionId, 'main', {});
    return { text: MAIN_MENU, menu: 'main', end: false };
}

async function goBack(sessionId) {
    return goMain(sessionId);
}

async function handleUssd(phone, sessionId, input) {
    const provider = await findProviderByPhone(phone);
    const session = await getSession(sessionId, phone);
    const currentMenu = session.current_menu || 'main';
    const choice = String(input || '').trim();

    if (session.ended_at) {
        await updateSession(sessionId, 'main', {});
        return { text: MAIN_MENU, menu: 'main', end: false };
    }

    if (!provider) {
        if (choice === '8') return { text: 'Reply REG to register as provider.\n0. Back', menu: 'main', end: false };
        if (choice === '9') { await closeSession(sessionId); return { text: 'Goodbye.', menu: 'ended', end: true }; }
        return { text: 'Not registered.\n8. Help\n9. Exit', menu: 'main', end: false };
    }

    // ----- MAIN MENU -----
    if (currentMenu === 'main') {
        if (choice === '1') return await menuMyJobs(sessionId, provider);
        if (choice === '2') return await menuAcceptJob(sessionId, provider);
        if (choice === '3') return await menuAvailability(sessionId, provider);
        if (choice === '4') return await menuWallet(sessionId, provider);
        if (choice === '5') return await menuTopUp(sessionId, provider);
        if (choice === '6') return await menuJobHistory(sessionId, provider);
        if (choice === '7') return await menuMyServices(sessionId, provider);
        if (choice === '8') return { text: 'Reply YES <JobID> to accept, DONE <JobID> when finished, BAL for wallet.\n\n' + MAIN_MENU, menu: 'main', end: false };
        if (choice === '9') { await closeSession(sessionId); return { text: 'Goodbye. You are logged out.', menu: 'ended', end: true }; }
        return await goMain(sessionId);
    }

    // ----- ACCEPT JOB -----
    if (currentMenu === 'accept_job') {
        if (choice === '0') return await goBack(sessionId);
        const order = await orders.getOrderById(Number(choice));
        if (!order) return { text: 'Job not found.\n0. Back', menu: 'accept_job', end: false };
        if (order.provider_id !== provider.id) return { text: 'Not your job.\n0. Back', menu: 'accept_job', end: false };
        if (order.order_status !== 'PROVIDER_ASSIGNED') return { text: 'Job already ' + order.order_status + '.\n0. Back', menu: 'accept_job', end: false };
        await orders.transition(order.id, 'PROVIDER_CONTACTED', 'USSD', 'Accepted via USSD');
        await updateSession(sessionId, 'main', {});
        return { text: `Job ${order.order_code} accepted.\n0. Back`, menu: 'main', end: false };
    }

    // ----- AVAILABILITY -----
    if (currentMenu === 'availability') {
        if (choice === '0') return await goBack(sessionId);
        if (choice === '1') { await matching.setAvailability(provider.id, 'LAUNDRY', 'AVAILABLE'); return await menuAvailability(sessionId, provider); }
        if (choice === '2') { await matching.setAvailability(provider.id, 'LAUNDRY', 'OFFLINE');   return await menuAvailability(sessionId, provider); }
        if (choice === '3') { await matching.setAvailability(provider.id, 'WHEELBARROW', 'AVAILABLE'); return await menuAvailability(sessionId, provider); }
        if (choice === '4') { await matching.setAvailability(provider.id, 'WHEELBARROW', 'OFFLINE');   return await menuAvailability(sessionId, provider); }
        return await menuAvailability(sessionId, provider);
    }

    // ----- TOP UP -----
    if (currentMenu === 'topup') {
        if (choice === '0') return await goBack(sessionId);
        const amts = { '1': 50, '2': 100, '3': 200, '4': 500 };
        if (!amts[choice]) return await menuTopUp(sessionId, provider);
        const amt = amts[choice];
        await wallet.topUpFloat(provider.id, 'LAUNDRY', amt, 'USSD-' + Date.now(), 'Via USSD mock');
        await updateSession(sessionId, 'main', {});
        return { text: `K${amt} credited (mock). Total wallet now shown under 4. Wallet.\n\n` + MAIN_MENU, menu: 'main', end: false };
    }

    // Fallback
    return await goMain(sessionId);
}

async function menuMyJobs(sessionId, provider) {
    const rows = await all(
        `SELECT id, order_code, order_status, price FROM service_orders
         WHERE provider_id = ? AND order_status NOT IN ('COMPLETED','CANCELLED','DISPUTED')
         ORDER BY created_at DESC LIMIT 5`,
        [provider.id]
    );
    await updateSession(sessionId, 'main', {});
    if (!rows.length) return { text: 'No active jobs.\n0. Back\n\n' + MAIN_MENU, menu: 'main', end: false };
    const body = rows.map(r => `${r.order_code}  ${r.order_status}  K${r.price}`).join('\n');
    return { text: 'My Jobs:\n' + body + '\n\n0. Back', menu: 'main', end: false };
}

async function menuAcceptJob(sessionId, provider) {
    const rows = await all(
        `SELECT id, order_code, price, commission FROM service_orders
         WHERE provider_id = ? AND order_status = 'PROVIDER_ASSIGNED'
         ORDER BY created_at DESC LIMIT 5`,
        [provider.id]
    );
    if (!rows.length) { await updateSession(sessionId, 'main', {}); return { text: 'No jobs awaiting acceptance.\n0. Back\n\n' + MAIN_MENU, menu: 'main', end: false }; }
    const lines = rows.map(r => `${r.id}. ${r.order_code}  K${r.price}`);
    await updateSession(sessionId, 'accept_job', {});
    return { text: 'Accept which job?\n' + lines.join('\n') + '\n0. Back', menu: 'accept_job', end: false };
}

async function menuAvailability(sessionId, provider) {
    const av = await matching.getAvailability(provider.id);
    const laundry = (av.find(a => a.service_type === 'LAUNDRY') || {}).status || 'OFFLINE';
    const wheel   = (av.find(a => a.service_type === 'WHEELBARROW') || {}).status || 'OFFLINE';
    await updateSession(sessionId, 'availability', {});
    return {
        text: `Availability:\nLaundry: ${laundry}\nWheelbarrow: ${wheel}\n\n1. Laundry ON\n2. Laundry OFF\n3. Wheelbarrow ON\n4. Wheelbarrow OFF\n0. Back`,
        menu: 'availability', end: false
    };
}

async function menuWallet(sessionId, provider) {
    const l = await wallet.getWalletState(provider.id, 'LAUNDRY');
    const w = await wallet.getWalletState(provider.id, 'WHEELBARROW');
    await updateSession(sessionId, 'main', {});
    return {
        text: `Wallet:\nLaundry: K${l.available} (held K${l.held})\nWheelbarrow: K${w.available} (held K${w.held})\nTotal: K${l.total + w.total}\n0. Back`,
        menu: 'main', end: false
    };
}

async function menuTopUp(sessionId, provider) {
    await updateSession(sessionId, 'topup', {});
    return { text: 'Top up how much?\n1. K50\n2. K100\n3. K200\n4. K500\n0. Back', menu: 'topup', end: false };
}

async function menuJobHistory(sessionId, provider) {
    const rows = await all(
        `SELECT order_code, order_status, price FROM service_orders
         WHERE provider_id = ? AND order_status = 'COMPLETED'
         ORDER BY completed_at DESC LIMIT 5`,
        [provider.id]
    );
    await updateSession(sessionId, 'main', {});
    if (!rows.length) return { text: 'No completed jobs yet.\n0. Back\n\n' + MAIN_MENU, menu: 'main', end: false };
    const body = rows.map(r => `${r.order_code}  K${r.price}`).join('\n');
    return { text: 'Last jobs:\n' + body + '\n0. Back', menu: 'main', end: false };
}

async function menuMyServices(sessionId, provider) {
    const av = await matching.getAvailability(provider.id);
    await updateSession(sessionId, 'main', {});
    if (!av.length) return { text: 'No services enabled.\n0. Back\n\n' + MAIN_MENU, menu: 'main', end: false };
    const body = av.map(a => `${a.service_type}: ${a.status}`).join('\n');
    return { text: 'My Services:\n' + body + '\n0. Back', menu: 'main', end: false };
}

module.exports = { handleUssd, MAIN_MENU };
