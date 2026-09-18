// engine/provider-verification.js
const { run, get, all } = require('./db');
const wallet = require('./wallet');
const notify = require('./notify');
const audit = require('./audit');

async function submitForVerification(providerId, notes) {
    const p = await get(`SELECT * FROM providers WHERE id = ?`, [providerId]);
    if (!p) throw new Error('provider not found');

    // Check registration complete
    if (!p.sim_verified_at || !p.pin_hash) {
        throw new Error('registration incomplete: verify OTP and set PIN first');
    }

    const r = await run(
        `INSERT INTO provider_pending_registrations (provider_id, decision, notes)
         VALUES (?, 'pending', ?)`,
        [providerId, notes || null]
    );

    await run(
        `UPDATE providers SET verification_status = 'submitted', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [providerId]
    );

    return { pending_id: r.lastID, provider_id: providerId, status: 'submitted' };
}

async function listPendingVerifications() {
    return all(
        `SELECT pp.*, p.provider_code, p.full_name, p.phone
         FROM provider_pending_registrations pp
         JOIN providers p ON pp.provider_id = p.id
         WHERE pp.decision = 'pending'
         ORDER BY pp.submitted_at ASC`
    );
}

async function approveProvider(providerId, adminUserId, notes) {
    const p = await get(`SELECT * FROM providers WHERE id = ?`, [providerId]);
    if (!p) throw new Error('provider not found');

    await run(
        `UPDATE providers SET verification_status = 'verified', account_status = 'active', approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [providerId]
    );
    await run(
        `UPDATE provider_pending_registrations
         SET decision = 'approved', reviewed_at = CURRENT_TIMESTAMP, reviewer_id = ?, notes = COALESCE(?, notes)
         WHERE provider_id = ? AND decision = 'pending'`,
        [adminUserId || null, notes || null, providerId]
    );

    // Grant welcome credit if not already credited
    const hasCredit = await get(
        `SELECT id FROM wallet_transactions WHERE provider_id = ? AND txn_type = 'WELCOME_CREDIT' LIMIT 1`,
        [providerId]
    );
    let welcomeResult = null;
    if (!hasCredit) {
        welcomeResult = await wallet.grantWelcomeCredit(providerId, 'LAUNDRY', 60, 'APPROVAL-' + providerId);
    }

    // Send approval SMS
    try {
        await notify.logSms('OUT', p.phone,
            `Welcome to EU PONKALA! You are verified. K60 welcome credit added. Reply LAUNDRY ON to start receiving laundry jobs.`,
            { provider_id: providerId });
    } catch (e) { /* non-fatal */ }

    await audit.log('APPROVE_PROVIDER', 'PROVIDER', providerId, null, { status: 'verified' }, adminUserId, notes);
    return { provider_id: providerId, status: 'verified', welcome_credit: welcomeResult ? 60 : 0 };
}

async function rejectProvider(providerId, adminUserId, reason) {
    await run(
        `UPDATE providers SET verification_status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [providerId]
    );
    await run(
        `UPDATE provider_pending_registrations
         SET decision = 'rejected', reviewed_at = CURRENT_TIMESTAMP, reviewer_id = ?, notes = ?
         WHERE provider_id = ? AND decision = 'pending'`,
        [adminUserId || null, reason || null, providerId]
    );
    const p = await get(`SELECT phone FROM providers WHERE id = ?`, [providerId]);
    if (p) {
        try { await notify.logSms('OUT', p.phone, 'Your EU PONKALA registration was not approved. Reason: ' + (reason || 'not specified'), { provider_id: providerId }); } catch(e) {}
    }
    await audit.log('REJECT_PROVIDER', 'PROVIDER', providerId, null, { status: 'rejected' }, adminUserId, reason);
    return { provider_id: providerId, status: 'rejected' };
}

module.exports = { submitForVerification, listPendingVerifications, approveProvider, rejectProvider };

