// engine/admin-users.js
const { run, get, all } = require('./db');
const notify = require('./notify');
const audit = require('./audit');

async function suspendProvider(providerId, adminUserId, reason) {
    const p = await get(`SELECT * FROM providers WHERE id = ?`, [providerId]);
    if (!p) throw new Error('provider not found');
    const prev = { account_status: p.account_status };
    await run(
        `UPDATE providers SET account_status = 'suspended', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [providerId]
    );
    await audit.log('SUSPEND_PROVIDER', 'PROVIDER', providerId, prev, { account_status: 'suspended' }, adminUserId, reason);
    try {
        await notify.logSms('OUT', p.phone,
            `Your EU PONKALA account is SUSPENDED. Reason: ${reason || 'not specified'}. Contact support.`,
            { provider_id: providerId });
    } catch (e) {}
    return { provider_id: providerId, account_status: 'suspended' };
}

async function reactivateProvider(providerId, adminUserId, notes) {
    const p = await get(`SELECT * FROM providers WHERE id = ?`, [providerId]);
    if (!p) throw new Error('provider not found');
    const prev = { account_status: p.account_status };
    await run(
        `UPDATE providers SET account_status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [providerId]
    );
    await audit.log('REACTIVATE_PROVIDER', 'PROVIDER', providerId, prev, { account_status: 'active' }, adminUserId, notes);
    try {
        await notify.logSms('OUT', p.phone,
            `Your EU PONKALA account is ACTIVE again. Reply LAUNDRY ON to receive jobs.`,
            { provider_id: providerId });
    } catch (e) {}
    return { provider_id: providerId, account_status: 'active' };
}

async function suspendUser(userId, adminUserId, reason) {
    const u = await get(`SELECT * FROM users WHERE user_id = ?`, [userId]);
    if (!u) throw new Error('user not found');
    const prev = { is_active: u.is_active };
    await run(`UPDATE users SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`, [userId]);
    await audit.log('SUSPEND_USER', 'USER', userId, prev, { is_active: 0 }, adminUserId, reason);
    try {
        if (u.phone) await notify.logSms('OUT', u.phone,
            `Your EU PONKALA account is SUSPENDED. Reason: ${reason || 'not specified'}.`, {});
    } catch (e) {}
    return { user_id: userId, is_active: 0 };
}

async function reactivateUser(userId, adminUserId, notes) {
    const u = await get(`SELECT * FROM users WHERE user_id = ?`, [userId]);
    if (!u) throw new Error('user not found');
    const prev = { is_active: u.is_active };
    await run(`UPDATE users SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`, [userId]);
    await audit.log('REACTIVATE_USER', 'USER', userId, prev, { is_active: 1 }, adminUserId, notes);
    return { user_id: userId, is_active: 1 };
}

async function listAllProviders(filters) {
    const f = filters || {};
    const where = [];
    const params = [];
    if (f.status)   { where.push('account_status = ?');      params.push(f.status); }
    if (f.verified) { where.push('verification_status = ?'); params.push(f.verified); }
    const sql = `SELECT id, provider_code, full_name, phone, verification_status, account_status, created_at
                 FROM providers
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY created_at DESC LIMIT ?`;
    params.push(f.limit || 100);
    return all(sql, params);
}

async function listAllUsers(filters) {
    const f = filters || {};
    const where = [];
    const params = [];
    if (f.type)   { where.push('user_type = ?'); params.push(f.type); }
    if (f.active !== undefined) { where.push('is_active = ?'); params.push(f.active ? 1 : 0); }
    const sql = `SELECT user_id, full_name, email, phone, user_type, is_active, created_at
                 FROM users
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY created_at DESC LIMIT ?`;
    params.push(f.limit || 100);
    return all(sql, params);
}

async function getProviderDetails(providerId) {
    const provider = await get(`SELECT * FROM providers WHERE id = ?`, [providerId]);
    if (!provider) return null;
    const logs = await audit.getLogsForEntity('PROVIDER', providerId);
    const walletLaundry = await require('./wallet').getWalletState(providerId, 'LAUNDRY');
    const walletWheel   = await require('./wallet').getWalletState(providerId, 'WHEELBARROW');
    const orders = await all(`SELECT id, order_code, order_status, price, created_at FROM service_orders WHERE provider_id = ? ORDER BY created_at DESC LIMIT 20`, [providerId]);
    const penalties = await all(`SELECT * FROM engine_penalties WHERE subject_type='PROVIDER' AND subject_id=? ORDER BY penalty_id DESC LIMIT 20`, [providerId]);
    return { provider, wallet: { laundry: walletLaundry, wheelbarrow: walletWheel }, recent_orders: orders, penalties, audit_log: logs };
}

module.exports = {
    suspendProvider, reactivateProvider,
    suspendUser, reactivateUser,
    listAllProviders, listAllUsers, getProviderDetails
};
