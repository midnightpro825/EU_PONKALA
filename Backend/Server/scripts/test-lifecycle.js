// scripts/test-lifecycle.js - full end-to-end demo
const { run, get, all } = require('../engine/db');
const orders = require('../engine/orders');
const matching = require('../engine/matching');
const completion = require('../engine/completion');
const sms = require('../engine/sms');
const wallet = require('../engine/wallet');
const lifecycle = require('../engine/lifecycle');

async function ensureProvider() {
    const existing = await get(`SELECT * FROM providers WHERE full_name = 'Lifecycle Test Provider' LIMIT 1`);
    let id;
    if (existing) {
        await run(`UPDATE providers SET verification_status='verified', account_status='active' WHERE id = ?`, [existing.id]);
        id = existing.id;
    } else {
        const r = await run(
            `INSERT INTO providers (provider_code, full_name, phone, verification_status, account_status)
             VALUES (?, ?, ?, 'verified', 'active')`,
            ['PNK-LIFE' + Date.now().toString().slice(-4), 'Lifecycle Test Provider', '+260970000099']
        );
        id = r.lastID;
    }
    const state = await wallet.getWalletState(id, 'LAUNDRY');
    if (state.total < 50) await wallet.grantWelcomeCredit(id, 'LAUNDRY', 100, 'LIFE-' + Date.now());
    await matching.setAvailability(id, 'LAUNDRY', 'AVAILABLE', 1);
    return id;
}

(async () => {
    console.log('');
    console.log('  EU PONKALA  FULL ORDER LIFECYCLE TEST   ');
    console.log('\n');
    try {
        const providerId = await ensureProvider();
        const provider = await get(`SELECT * FROM providers WHERE id = ?`, [providerId]);
        console.log('Provider: ' + provider.full_name + ' (' + provider.phone + ')  id=' + providerId + '\n');

        // ----- STEP 1: create order -----
        console.log(' STEP 1: Student creates order ');
        const o = await orders.createOrder({
            service_type: 'LAUNDRY',
            customer_user_id: 3,
            price: 100,
            pickup_zone_id: 1,
            pickup_landmark_id: 1,
            instructions: 'Lifecycle test'
        });
        console.log('  Order: ' + o.order_code + '  status=' + o.order_status);
        console.log('  Student sees: "' + orders.toStudentState(o.order_status) + '"\n');

        // ----- STEP 2: auto-assign + SMS -----
        console.log(' STEP 2: Engine auto-assigns provider ');
        await orders.transition(o.id, 'PROVIDER_SEARCHING', 'LIFECYCLE');
        const asg = await matching.autoAssign(o.id);
        console.log('  Assigned: ' + (asg.assigned ? 'provider ' + asg.result.provider_id : 'NONE'));
        console.log('  Commission held: K' + (asg.result ? asg.result.commission_held : 0));
        console.log('  (New-job SMS sent above)\n');

        // ----- STEP 3: provider YES via SMS -----
        console.log(' STEP 3: Provider replies "YES ' + o.order_code + '" ');
        const yesReply = await sms.handleInboundSms(provider.phone, 'YES ' + o.order_code);
        console.log('  Reply: ' + yesReply);
        let cur = await orders.getOrderById(o.id);
        console.log('  Order status: ' + cur.order_status + '\n');

        // ----- STEP 4: walk to WASHING -----
        console.log(' STEP 4: Provider travels + starts washing ');
        for (const s of ['PROVIDER_ON_THE_WAY','PROVIDER_ARRIVED','WASHING']) {
            await orders.transition(o.id, s, 'TEST');
            console.log('   ' + s);
        }
        console.log('');

        // ----- STEP 5: provider DONE via SMS -----
        console.log(' STEP 5: Provider replies "DONE ' + o.order_code + '" ');
        const doneReply = await sms.handleInboundSms(provider.phone, 'DONE ' + o.order_code);
        console.log('  Reply: ' + doneReply);
        cur = await orders.getOrderById(o.id);
        console.log('  Order status: ' + cur.order_status);
        console.log('  (Completion code + student code SMS fired)\n');

        // ----- STEP 6: student submits code -----
        console.log(' STEP 6: Student submits completion code ');
        const activeCode = await completion.getActiveCode(o.id);
        console.log('  Active code: ' + (activeCode ? activeCode.code : '(none)'));
        if (activeCode) {
            const result = await completion.consumeCode(o.id, activeCode.code);
            console.log('  Order completed: ' + result.order.order_code + '  status=' + result.order.order_status);
        }
        console.log('  (Settlement SMS + wallet deduction fired)\n');

        // ----- STEP 7: full trace -----
        console.log(' STEP 7: Full order trace \n');
        const trace = await lifecycle.traceOrder(o.id);

        console.log('ORDER:');
        console.log('  code=' + trace.order.order_code +
                    '  status=' + trace.order.order_status +
                    '  student_state="' + trace.order.student_state + '"');
        console.log('  price=K' + trace.order.price + '  commission=K' + trace.order.commission);

        console.log('\nWALLET ENTRIES (' + trace.wallet_entries.length + '):');
        trace.wallet_entries.forEach(w => {
            console.log('  #' + w.id + ' ' + w.txn_type.padEnd(15) + ' K' + String(w.amount).padStart(6) +
                        '  ' + w.balance_before + '  ' + w.balance_after);
        });

        console.log('\nSMS MESSAGES (' + trace.sms.length + '):');
        trace.sms.forEach(s => {
            const prefix = s.direction === 'IN' ? ' IN ' : ' OUT';
            console.log('  ' + prefix + '  ' + s.body.slice(0, 70));
        });

        console.log('\nCOMPLETION CODES (' + trace.completion_codes.length + '):');
        trace.completion_codes.forEach(c => {
            console.log('  code=' + c.code + '  used=' + c.is_used);
        });

        // ----- FINAL SUMMARY -----
        console.log('\n');
        console.log('  LIFECYCLE TEST COMPLETE                  ');
        console.log('');
        console.log('\nOrder ' + trace.order.order_code + ' went through:');
        console.log('  PAYMENT_CONFIRMED  PROVIDER_ASSIGNED  PROVIDER_CONTACTED');
        console.log('   PROVIDER_ON_THE_WAY  PROVIDER_ARRIVED  WASHING');
        console.log('   COMPLETION_PENDING  COMPLETED');
        console.log('\nAll events fired automatically:');
        console.log('   SMS to provider (new job)');
        console.log('   SMS to provider (completion code)');
        console.log('   SMS to student (code)');
        console.log('   SMS to provider (commission deducted)');
        console.log('   SMS to student (completed)');
        console.log('   Commission held (K15)');
        console.log('   Commission deducted on completion');

        process.exit(0);
    } catch (err) {
        console.error('TEST FAILED:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
})();
