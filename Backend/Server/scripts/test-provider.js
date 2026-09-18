// scripts/test-provider.js
const reg = require('../engine/provider-registration');
const ver = require('../engine/provider-verification');
const { get } = require('../engine/db');

(async () => {
    console.log('=== PROVIDER REGISTRATION + VERIFICATION TEST ===\n');
    try {
        const phone = '+260977' + Math.floor(100000 + Math.random() * 900000);

        // 1. Start
        console.log('1. Start registration for ' + phone);
        const s = await reg.startRegistration(phone, 'Test New Provider');
        console.log('   provider_id=' + s.provider_id);
        console.log('   OTP (dev): ' + s.otp_dev);

        // 2. Verify OTP
        console.log('\n2. Verify OTP');
        const v = await reg.verifyOtp(s.provider_id, s.otp_dev);
        console.log('   sim_verified=' + v.sim_verified);

        // 3. Set PIN
        console.log('\n3. Set PIN');
        const p = await reg.setPin(s.provider_id, '1234');
        console.log('   pin_set=' + p.pin_set);

        // 4. State
        console.log('\n4. Registration state');
        const state = await reg.getRegistrationState(s.provider_id);
        console.log('   otp_verified=' + state.otp_verified);
        console.log('   pin_set=' + state.pin_set);
        console.log('   complete=' + state.complete);

        // 5. Submit for verification
        console.log('\n5. Submit for admin verification');
        const sub = await ver.submitForVerification(s.provider_id, 'Test submission');
        console.log('   pending_id=' + sub.pending_id);

        // 6. Admin approves
        console.log('\n6. Admin approves');
        const app = await ver.approveProvider(s.provider_id, 1, 'Looks good');
        console.log('   status=' + app.status);
        console.log('   welcome_credit=K' + app.welcome_credit);

        // 7. Final check
        const final = await get(`SELECT verification_status, account_status, approved_at FROM providers WHERE id = ?`, [s.provider_id]);
        console.log('\n7. Final provider state:');
        console.log('   verification_status=' + final.verification_status);
        console.log('   account_status=' + final.account_status);
        console.log('   approved_at=' + final.approved_at);

        console.log('\n=== TEST COMPLETE ===');
        process.exit(0);
    } catch (err) {
        console.error('TEST FAILED:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
})();
