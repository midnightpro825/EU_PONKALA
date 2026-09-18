// engine/sms.js - Inbound SMS command parser (Part H6)
const { get, all } = require('./db');
const orders = require('./orders');
const wallet = require('./wallet');
const matching = require('./matching');
const completion = require('./completion');
const holds = require('./holds');
const notify = require('./notify');
const config = require('./config');

// Find the provider for an inbound phone number.
async function findProviderByPhone(phone) {
    return get(`SELECT * FROM providers WHERE phone = ? LIMIT 1`, [phone]);
}

// Find the student (user) for an inbound phone number.
async function findStudentByPhone(phone) {
    return get(`SELECT * FROM users WHERE phone = ? LIMIT 1`, [phone]);
}

// Log the inbound message.
async function logInbound(phone, body, providerId, orderId) {
    return notify.logSms('IN', phone, body, {
        provider_id: providerId,
        order_id: orderId,
        status: 'RECEIVED'
    });
}

// Main entrypoint: given phone + body, return reply text (or null).
async function handleInboundSms(phone, body) {
    const raw = String(body || '').trim();
    const upper = raw.toUpperCase();
    const parts = raw.split(/\s+/);
    const cmd = (parts[0] || '').toUpperCase();
    const arg = parts[1];

    const provider = await findProviderByPhone(phone);
    const student = await findStudentByPhone(phone);

    // Log inbound
    await logInbound(phone, raw, provider ? provider.id : null, null);

    // --- REG: start self-registration (basic info prompt) ---
    if (cmd === 'REG') {
        return 'Welcome to EU PONKALA! Reply with: FULLNAME <your name>. An agent will call you to verify.';
    }

    // --- YES <JobID>: accept job ---
    if (cmd === 'YES') {
        if (!provider) return 'You are not registered. Reply REG to begin.';
        if (!arg) return 'Format: YES <JobID>. Example: YES LD48291.';
        const order = await orders.getOrderByCode(arg);
        if (!order) return `Job ${arg} not found.`;
        if (order.provider_id !== provider.id) return `Job ${arg} is not assigned to you.`;
        if (order.order_status !== 'PROVIDER_ASSIGNED') return `Job ${arg} is already ${order.order_status}.`;

        // Move to PROVIDER_CONTACTED (provider acknowledged)
        await orders.transition(order.id, 'PROVIDER_CONTACTED', 'SMS', 'Provider accepted via SMS');
        return `Job ${arg} accepted. Contact student to arrange pickup.`;
    }

    // --- NO <JobID>: reject job ---
    if (cmd === 'NO') {
        if (!provider) return 'You are not registered. Reply REG to begin.';
        if (!arg) return 'Format: NO <JobID>.';
        const order = await orders.getOrderByCode(arg);
        if (!order) return `Job ${arg} not found.`;
        if (order.provider_id !== provider.id) return `Job ${arg} is not assigned to you.`;

        // Release the hold + clear provider, put order back to PROVIDER_SEARCHING
        await holds.releaseOnCancel(order.id).catch(() => {});
        await orders.transition(order.id, 'CANCELLED', 'SMS', 'Provider declined via SMS');
        return `Job ${arg} declined. A new provider will be assigned.`;
    }

    // --- DONE <JobID>: provider finished, issue code to student ---
    if (cmd === 'DONE') {
        if (!provider) return 'You are not registered.';
        if (!arg) return 'Format: DONE <JobID>.';
        const order = await orders.getOrderByCode(arg);
        if (!order) return `Job ${arg} not found.`;
        if (order.provider_id !== provider.id) return `Job ${arg} is not yours.`;

        // Move to COMPLETION_PENDING (if not already)
        if (order.order_status === 'WASHING' || order.order_status === 'TRANSPORTING' || order.order_status === 'ARRIVED_AT_DESTINATION') {
            await orders.transition(order.id, 'COMPLETION_PENDING', 'SMS', 'Provider marked DONE');
        }
        const gen = await completion.generateCode(order.id);
        await notify.notifyProviderCompletionCode(provider.id, order, gen.code);
        await notify.notifyStudent(order.customer_user_id, `Your order ${arg} is done. Completion code: ${gen.code}. Share with provider.`, order.id);
        return `Job ${arg} done. Code issued.`;
    }

    // --- NOCONFIRM <JobID>: student didn't confirm ---
    if (cmd === 'NOCONFIRM') {
        return `Noted. Auto-completion will proceed after timeout.`;
    }

    // --- LAUNDRY ON / OFF ---
    if (cmd === 'LAUNDRY') {
        if (!provider) return 'You are not registered.';
        const status = (arg || '').toUpperCase() === 'ON' ? 'AVAILABLE' : 'OFFLINE';
        await matching.setAvailability(provider.id, 'LAUNDRY', status);
        return `Laundry availability: ${status}.`;
    }

    // --- WHEELBARROW ON / OFF ---
    if (cmd === 'WHEELBARROW') {
        if (!provider) return 'You are not registered.';
        const status = (arg || '').toUpperCase() === 'ON' ? 'AVAILABLE' : 'OFFLINE';
        await matching.setAvailability(provider.id, 'WHEELBARROW', status);
        return `Wheelbarrow availability: ${status}.`;
    }

    // --- BAL: wallet balance ---
    if (cmd === 'BAL') {
        if (!provider) return 'You are not registered.';
        const laundry = await wallet.getWalletState(provider.id, 'LAUNDRY');
        const wheel = await wallet.getWalletState(provider.id, 'WHEELBARROW');
        return `Laundry: K${laundry.available} (held K${laundry.held}). Wheelbarrow: K${wheel.available}. Total: K${laundry.total + wheel.total}.`;
    }

    // --- TOPUP <amount> ---
    if (cmd === 'TOPUP') {
        if (!provider) return 'You are not registered.';
        const amt = Number(arg);
        if (!amt || amt < 10) return 'Minimum top-up is K10. Format: TOPUP 100.';
        // Mock: credit instantly
        await wallet.topUpFloat(provider.id, 'LAUNDRY', amt, 'MOCK-SMS-' + Date.now(), 'Via SMS mock');
        return `K${amt} credited to your Commission Wallet (mock).`;
    }

    // --- HELP ---
    if (cmd === 'HELP') {
        return 'EU PONKALA commands: REG, YES <JobID>, NO <JobID>, DONE <JobID>, LAUNDRY ON/OFF, WHEELBARROW ON/OFF, BAL, TOPUP <amt>, HELP.';
    }

    // Fallback
    return 'Unknown command. Reply HELP for options.';
}

// Route an inbound SMS through the engine AND reply back.
// Convenience for tests.
async function simulateInbound(phone, body) {
    const reply = await handleInboundSms(phone, body);
    if (reply) {
        await notify.logSms('OUT', phone, reply, { status: 'SENT' });
    }
    return reply;
}

module.exports = {
    handleInboundSms,
    simulateInbound,
    findProviderByPhone,
    findStudentByPhone
};
