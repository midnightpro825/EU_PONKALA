// =============================================
// EU PONKALA  Shared Service Engine
// =============================================
const { run, get, all } = require('./db');

const rand = () => Math.floor(Math.random() * 9000 + 1000);

async function generateProviderCode(fullName) {
    const first = (fullName || 'USER').split(' ')[0].toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6) || 'USER';
    for (let i = 0; i < 10; i++) {
        const code = `PNK-${first}${rand()}`;
        const existing = await get('SELECT id FROM providers WHERE provider_code = ?', [code]);
        if (!existing) return code;
    }
    return `PNK-${first}${Date.now().toString().slice(-6)}`;
}

async function generateServiceOrderNumber(serviceType) {
    const prefix = serviceType === 'laundry' ? 'LD' : serviceType === 'wheelbarrow' ? 'TR' : 'SV';
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let suffix = '';
    for (let i = 0; i < 4; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
    return `${prefix}${rand()}${suffix}`;
}

async function generateCompletionCode() {
    return String(Math.floor(1000 + Math.random() * 9000));
}

async function sendSms(to, message) {
    console.log(' [SMS  ' + to + ']');
    console.log(message.split('\n').map(l => '   ' + l).join('\n'));
    return true;
}

// Grant K60 welcome credit to a new provider service
async function grantWelcomeCredit(providerId, serviceType, amount = 60) {
    const existing = await get(
        'SELECT id FROM welcome_credits WHERE provider_id = ? AND service_type = ?',
        [providerId, serviceType]
    );
    if (existing) return existing;

    const r = await run(
        `INSERT INTO welcome_credits (provider_id, service_type, amount, used, remaining)
         VALUES (?, ?, ?, 0, ?)`,
        [providerId, serviceType, amount, amount]
    );

    // Add to provider_services.welcome_credit
    await run(
        `UPDATE provider_services SET welcome_credit = welcome_credit + ?
         WHERE provider_id = ? AND service_type = ?`,
        [amount, providerId, serviceType]
    );

    return await get('SELECT * FROM welcome_credits WHERE id = ?', [r.lastID]);
}

// Deduct commission  uses welcome credit first, then purchased wallet
async function deductCommission(providerId, serviceType, amount, orderId, reference) {
    const svc = await get(
        'SELECT * FROM provider_services WHERE provider_id = ? AND service_type = ?',
        [providerId, serviceType]
    );
    if (!svc) throw new Error('Provider service not found');

    let remaining = amount;
    let welcomeUsed = 0;
    let walletUsed = 0;

    // Step 1: Use welcome credit first
    if (svc.welcome_credit > 0) {
        welcomeUsed = Math.min(svc.welcome_credit, remaining);
        remaining -= welcomeUsed;
    }

    // Step 2: Use purchased wallet for the rest
    if (remaining > 0) {
        walletUsed = Math.min(svc.wallet_balance, remaining);
        remaining -= walletUsed;
    }

    if (remaining > 0) {
        throw new Error('Insufficient wallet balance for commission');
    }

    // Apply deductions
    const newWelcome = svc.welcome_credit - welcomeUsed;
    const newWallet = svc.wallet_balance - walletUsed;

    await run(
        `UPDATE provider_services SET welcome_credit = ?, wallet_balance = ?, updated_at = CURRENT_TIMESTAMP
         WHERE provider_id = ? AND service_type = ?`,
        [newWelcome, newWallet, providerId, serviceType]
    );

    // Welcome credit ledger
    if (welcomeUsed > 0) {
        await run(
            `UPDATE welcome_credits SET used = used + ?, remaining = remaining - ?, updated_at = CURRENT_TIMESTAMP
             WHERE provider_id = ? AND service_type = ?`,
            [welcomeUsed, welcomeUsed, providerId, serviceType]
        );
    }

    // Wallet ledger entry
    await run(
        `INSERT INTO wallet_transactions
         (provider_id, service_type, order_id, txn_type, amount, balance_before, balance_after, reference)
         VALUES (?, ?, ?, 'commission', ?, ?, ?, ?)`,
        [providerId, serviceType, orderId, -amount, svc.wallet_balance, newWallet, reference || null]
    );

    return { welcomeUsed, walletUsed, newWelcome, newWallet };
}

// Check if provider can accept a cash order for the given commission
async function canProviderAcceptCash(providerId, serviceType, commission) {
    const svc = await get(
        'SELECT * FROM provider_services WHERE provider_id = ? AND service_type = ?',
        [providerId, serviceType]
    );
    if (!svc || !svc.cash_eligible) return false;
    const available = (svc.welcome_credit || 0) + (svc.wallet_balance || 0);
    return available >= commission;
}

// Fair-rotation provider matching
async function pickProvider(serviceType, { cash = false, commission = 0, area = null } = {}) {
    let sql = `
        SELECT p.*, ps.id AS service_id, ps.wallet_balance, ps.welcome_credit, ps.cash_eligible, ps.service_area
        FROM providers p
        JOIN provider_services ps ON ps.provider_id = p.id
        WHERE ps.service_type = ?
          AND ps.is_active = 1
          AND ps.availability_status = 'available'
          AND p.verification_status = 'verified'
          AND p.account_status = 'active'
    `;
    const params = [serviceType];

    if (cash) {
        sql += ` AND ps.cash_eligible = 1 AND (ps.wallet_balance + ps.welcome_credit) >= ?`;
        params.push(commission);
    }

    sql += `
        ORDER BY
            COALESCE((SELECT MAX(created_at) FROM service_orders
                      WHERE provider_id = p.id AND service_type = ?), '1970-01-01') ASC,
            RANDOM()
        LIMIT 1
    `;
    params.push(serviceType);

    return await get(sql, params);
}

module.exports = {
    generateProviderCode,
    generateServiceOrderNumber,
    generateCompletionCode,
    sendSms,
    grantWelcomeCredit,
    deductCommission,
    canProviderAcceptCash,
    pickProvider
};
