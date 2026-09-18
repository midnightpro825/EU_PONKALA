// scripts/test-sms.js
const { run, get, all } = require('../engine/db');
const orders = require('../engine/orders');
const matching = require('../engine/matching');
const notify = require('../engine/notify');
const sms = require('../engine/sms');
const wallet = require('../engine/wallet');

async function ensureTestProvider() {
    const existing = await get(`SELECT * FROM providers WHERE full_name = 'Test Provider SMS' LIMIT 1`);
    let providerId;
    if (existing) {
        await run(`UPDATE providers SET verification_status='verified', account_status='active' WHERE id = ?`, [existing.id]);
        providerId = existing.id;
    } else {
        const r = await run(
            `INSERT INTO providers (provider_code, full_name, phone, verification_status, account_status)
             VALUES (?, ?, ?, 'verified', 'active')`,
            ['PNK-TESTS' + Date.now().toString().slice(-4), 'Test Provider SMS', '+260970000003']
        );
        providerId = r.lastID;
    }
    const state = await wallet.getWalletState(providerId, 'LAUNDRY');
    if (state.total < 50) await wallet.grantWelcomeCredit(providerId, 'LAUNDRY', 100, 'SMS-TEST-' + Date.now());
    await matching.setAvailability(providerId, 'LAUNDRY', 'AVAILABLE', 1);
    return providerId;
}

(async () => {
    console.log('=== SMS ENGINE TEST ===\n');
    try {
        const providerId = await ensureTestProvider();
        const provider = await get(`SELECT * FROM providers WHERE id = ?`, [providerId]);
        console.log('Provider id=' + providerId + ' phone=' + provider.phone + '\n');

        // 1. Create order + assign
        const o = await orders.createOrder({
            service_type: 'LAUNDRY',
            customer_user_id: 3,
            price: 100,
            pickup_zone_id: 1,
            pickup_landmark_id: 1
        });
        await orders.transition(o.id, 'PROVIDER_SEARCHING', 'TEST');
        const asg = await matching.autoAssign(o.id);
        console.log('1. Order ' + o.order_code + ' assigned to provider ' + asg.result.provider_id);

        // 2. Send new-job SMS
        const fresh = await orders.getOrderById(o.id);
        const smsOut = await notify.notifyProviderNewJob(providerId, fresh);
        console.log('2. New-job SMS sent to ' + provider.phone + ' (sms_id=' + smsOut.sms_id + ')\n');

        // 3. Provider replies YES <order_code>
        const reply1 = await sms.handleInboundSms(provider.phone, 'YES ' + o.order_code);
        console.log('3. Provider sends "YES ' + o.order_code + '"');
        console.log('   Reply: ' + reply1);
        const afterYes = await orders.getOrderById(o.id);
        console.log('   Order status now: ' + afterYes.order_status + '\n');

        // 4. Provider asks BAL
        const reply2 = await sms.handleInboundSms(provider.phone, 'BAL');
        console.log('4. Provider sends "BAL"');
        console.log('   Reply: ' + reply2 + '\n');

        // 5. Provider sends LAUNDRY OFF
        const reply3 = await sms.handleInboundSms(provider.phone, 'LAUNDRY OFF');
        console.log('5. Provider sends "LAUNDRY OFF"');
        console.log('   Reply: ' + reply3 + '\n');

        // 6. Provider sends LAUNDRY ON
        const reply4 = await sms.handleInboundSms(provider.phone, 'LAUNDRY ON');
        console.log('6. Provider sends "LAUNDRY ON"');
        console.log('   Reply: ' + reply4 + '\n');

        // 7. Provider sends DONE
        await orders.transition(o.id, 'PROVIDER_CONTACTED', 'TEST');
        await orders.transition(o.id, 'PROVIDER_ON_THE_WAY', 'TEST');
        await orders.transition(o.id, 'PROVIDER_ARRIVED', 'TEST');
        await orders.transition(o.id, 'WASHING', 'TEST');
        const reply5 = await sms.handleInboundSms(provider.phone, 'DONE ' + o.order_code);
        console.log('7. Provider sends "DONE ' + o.order_code + '"');
        console.log('   Reply: ' + reply5);
        const afterDone = await orders.getOrderById(o.id);
        console.log('   Order status now: ' + afterDone.order_status);

        // 8. Show the SMS log for this phone
        const log = await notify.getSmsForPhone(provider.phone, 20);
        console.log('\n8. SMS log for ' + provider.phone + ':');
        log.reverse().forEach(r => {
            const prefix = r.direction === 'IN' ? ' IN ' : ' OUT';
            console.log('   ' + prefix + '  ' + r.body.slice(0, 80));
        });

        console.log('\n=== TEST COMPLETE ===');
        process.exit(0);
    } catch (err) {
        console.error('TEST FAILED:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
})();
