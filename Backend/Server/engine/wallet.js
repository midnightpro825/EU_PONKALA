// engine/wallet.js - Wallet ledger (async/await)
const { run, get, all } = require('./db');
const config = require('./config');

async function getWalletState(providerId, serviceType) {
    const sql = `
        SELECT
            COALESCE(SUM(CASE WHEN txn_type = 'WELCOME_CREDIT' THEN amount ELSE 0 END), 0) AS welcome_credited,
            COALESCE(SUM(CASE WHEN txn_type = 'TOPUP'          THEN amount ELSE 0 END), 0) AS float_credited,
            COALESCE(SUM(CASE WHEN txn_type = 'COMMISSION'     THEN amount ELSE 0 END), 0) AS commission_paid,
            COALESCE(SUM(CASE WHEN txn_type = 'HOLD'           THEN amount ELSE 0 END), 0) AS currently_held,
            COALESCE(SUM(CASE WHEN txn_type = 'RELEASE'        THEN amount ELSE 0 END), 0) AS released,
            COALESCE(SUM(CASE WHEN txn_type = 'ADJUSTMENT'     THEN amount ELSE 0 END), 0) AS adjustments
        FROM wallet_transactions
        WHERE provider_id = ? AND (LOWER(service_type) = LOWER(?) OR service_type IS NULL)
    `;
    const row = await get(sql, [providerId, serviceType || null]);
    const welcome = Number(row.welcome_credited) || 0;
    const float   = Number(row.float_credited)   || 0;
    const spent   = Number(row.commission_paid)  || 0;
    const held    = Number(row.currently_held)   || 0;
    const rel     = Number(row.released)         || 0;
    const adj     = Number(row.adjustments)      || 0;
    const welcomeUsed      = Math.min(welcome, spent);
    const welcomeRemaining = welcome - welcomeUsed;
    const floatSpent       = Math.max(0, spent - welcome);
    const floatRemaining   = Math.max(0, float - floatSpent + adj);
    const heldAmount   = Math.max(0, held - rel);
    const grossBalance = welcomeRemaining + floatRemaining;
    const available    = Math.max(0, grossBalance - heldAmount);
    return {
        available,
        held: heldAmount,
        total: available + heldAmount,
        welcome_available: welcomeRemaining,
        float_available: floatRemaining,
        total_credited: welcome + float,
        total_commission_paid: spent
    };
}

async function getCurrentBalance(providerId, serviceType) {
    const sql = `
        SELECT COALESCE(SUM(
            CASE
                WHEN txn_type IN ('WELCOME_CREDIT','TOPUP','RELEASE','ADJUSTMENT') THEN amount
                WHEN txn_type IN ('COMMISSION','HOLD') THEN -amount
                ELSE 0
            END
        ), 0) AS balance
        FROM wallet_transactions
        WHERE provider_id = ? AND (LOWER(service_type) = LOWER(?) OR service_type IS NULL)
    `;
    const row = await get(sql, [providerId, serviceType || null]);
    return Number(row.balance) || 0;
}

async function recordTransaction(providerId, serviceType, orderId, txnType, amount, reference, notes) {
    const balanceBefore = await getCurrentBalance(providerId, serviceType);
    let signed;
    switch (txnType) {
        case 'WELCOME_CREDIT':
        case 'TOPUP':
        case 'RELEASE':
        case 'ADJUSTMENT':
            signed = Math.abs(amount); break;
        case 'COMMISSION':
        case 'HOLD':
            signed = -Math.abs(amount); break;
        default:
            throw new Error('Unknown txn_type: ' + txnType);
    }
    const balanceAfter = balanceBefore + signed;
    const sql = `
        INSERT INTO wallet_transactions
            (provider_id, service_type, order_id, txn_type, amount,
             balance_before, balance_after, reference, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;
    const result = await run(sql, [
        providerId, serviceType || null, orderId || null, txnType,
        Math.abs(amount), balanceBefore, balanceAfter, reference || null
    ]);
    return {
        tx_id: result.lastID,
        provider_id: providerId,
        service_type: serviceType,
        order_id: orderId || null,
        txn_type: txnType,
        amount: Math.abs(amount),
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        reference, notes
    };
}

async function grantWelcomeCredit(providerId, serviceType, amount, reference) {
    const amt = amount != null ? amount : config.welcome_credit_amount;
    return recordTransaction(providerId, serviceType, null, 'WELCOME_CREDIT', amt,
        reference || ('WELCOME-' + providerId + '-' + Date.now()),
        'Signup welcome credit');
}

async function topUpFloat(providerId, serviceType, amount, reference, notes) {
    return recordTransaction(providerId, serviceType, null, 'TOPUP', amount,
        reference || ('TOPUP-' + Date.now()),
        notes || 'Purchased float top-up');
}

async function holdCommission(providerId, serviceType, orderId, amount) {
    return recordTransaction(providerId, serviceType, orderId, 'HOLD', amount,
        'HOLD-' + orderId, 'Commission held at acceptance');
}

async function releaseHold(providerId, serviceType, orderId, amount) {
    return recordTransaction(providerId, serviceType, orderId, 'RELEASE', amount,
        'RELEASE-' + orderId, 'Hold released');
}

async function deductCommission(providerId, serviceType, orderId, amount) {
    await releaseHold(providerId, serviceType, orderId, amount);
    return recordTransaction(providerId, serviceType, orderId, 'COMMISSION', amount,
        'COMM-' + orderId, 'Commission deducted at completion');
}

async function canAcceptCashJob(providerId, serviceType, expectedCommission) {
    const state = await getWalletState(providerId, serviceType);
    return state.total >= expectedCommission;
}

module.exports = {
    getWalletState, getCurrentBalance, canAcceptCashJob,
    grantWelcomeCredit, topUpFloat, holdCommission, releaseHold,
    deductCommission, recordTransaction,
    COMMISSION_RATE: config.commission_rate,
    WELCOME_CREDIT: config.welcome_credit_amount
};

