// engine/provider-registration.js
const { run, get } = require('./db');
const config = require('./config');
const bcrypt = require('bcryptjs');

// Start registration: phone + name -> provider row with OTP
async function startRegistration(phone, fullName) {
    if (!phone) throw new Error('phone required');
    const existing = await get(`SELECT * FROM providers WHERE phone = ?`, [phone]);
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expires = new Date(Date.now() + 10*60*1000).toISOString();

    if (existing) {
        await run(
            `UPDATE providers SET otp_code = ?, otp_expires_at = ?, full_name = COALESCE(?, full_name), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [otp, expires, fullName || null, existing.id]
        );
        return { provider_id: existing.id, phone, otp_dev: otp, is_returning: true };
    }

    const code = 'PNK-' + phone.slice(-6).toUpperCase();
    const r = await run(
        `INSERT INTO providers (provider_code, full_name, phone, otp_code, otp_expires_at, verification_status, account_status)
         VALUES (?, ?, ?, ?, ?, 'pending', 'pending')`,
        [code, fullName || 'New Provider', phone, otp, expires]
    );
    return { provider_id: r.lastID, phone, otp_dev: otp, is_returning: false };
}

async function verifyOtp(providerId, otp) {
    const p = await get(`SELECT * FROM providers WHERE id = ?`, [providerId]);
    if (!p) throw new Error('provider not found');
    if (!p.otp_code) throw new Error('no OTP pending');
    if (p.otp_code !== String(otp)) throw new Error('invalid OTP');
    await run(
        `UPDATE providers SET sim_verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [providerId]
    );
    return { provider_id: providerId, sim_verified: true };
}

async function setPin(providerId, pin) {
    if (!pin || String(pin).length < 4) throw new Error('pin must be at least 4 digits');
    const hash = await bcrypt.hash(String(pin), 10);
    await run(
        `UPDATE providers SET pin_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [hash, providerId]
    );
    return { provider_id: providerId, pin_set: true };
}

async function getRegistrationState(providerId) {
    const p = await get(
        `SELECT id, provider_code, phone, full_name, sim_verified_at, pin_hash, verification_status, account_status
         FROM providers WHERE id = ?`,
        [providerId]
    );
    if (!p) return null;
    return {
        provider_id: p.id,
        provider_code: p.provider_code,
        phone: p.phone,
        full_name: p.full_name,
        otp_verified: !!p.sim_verified_at,
        pin_set: !!p.pin_hash,
        verification_status: p.verification_status,
        account_status: p.account_status,
        complete: !!p.sim_verified_at && !!p.pin_hash
    };
}

module.exports = { startRegistration, verifyOtp, setPin, getRegistrationState };
