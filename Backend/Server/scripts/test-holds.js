// scripts/test-holds.js - Full anti-cheat test
const { run, get, all } = require('../engine/db');
const orders = require('../engine/orders');
const matching = require('../engine/matching');
const completion = require('../engine/completion');
const holds = require('../engine/holds');
const autoComplete = require('../engine/auto-complete');
const wallet = require('../engine/wallet');

async function ensureTestProvider() {
    const existing = await get(`SELECT * FROM providers WHERE full_name = 'Test Provider Holds' LIMIT 1`);
    let providerId;
    if (existing) {
        await run(
            `UPDATE providers SET verification_status='verified', account_status='active' WHERE id = ?`,
            [existing.id]
        );
        providerId = existing.id;
    } else {
        const r = await run(
            `INSERT INTO providers (provider_code, full_name, phone, verification_status, account_status)
             VALUES (?, ?, ?, 'verified', 'active')`,
            ['PNK-TESTH' + Date.now().toString().slice(-4), 'Test Provider Holds', '+260970000002']
        );
        providerId = r.lastID;
    }
    // Give wallet K100 welcome credit
    const state = await wallet.getWalletState(providerId, 'LAUNDRY');
    if (state.total < 50) {
        await wallet.grantWelcomeCredit(providerId, 'LAUNDRY', 100, 'HOLDS-TEST-' + Date.now());
    }
    // Availability
    await matching.setAvailability(providerId, 'LAUNDRY', 'AVAILABLE', 1);
    return providerId;
}

async function createReadyOrder(label) {
    const o = await orders.createOrder({
        service_type: 'LAUNDRY',
        customer_user_id: 3,
        price: 100,
        pickup_zone_id: 1,
        pickup_landmark_id: 1
    });
    await orders.transition(o.id, 'PROVIDER_SEARCHING', 'TEST');
    const asg = await matching.autoAssign(o.id);
    if (!asg.assigned) throw new Error('auto-assign failed: ' + asg.reason);
    console.log(`   [${label}] order ${o.order_code} assigned to provider ${asg.result.provider_id}`);
    return o;
}

(async () => {
    console.log('=== HOLDS + AUTO-COMPLETE TEST ===\n');
    try {
        const providerId = await ensureTestProvider();
        console.log('Test provider id:', providerId, '\n');

        // ---------- SCENARIO 1: normal completion  holds CONSUMED ----------
        console.log('SCENARIO 1: Normal completion');
        const o1 = await createReadyOrder('S1');
        for (const s of ['PROVIDER_CONTACTED','PROVIDER_ON_THE_WAY','PROVIDER_ARRIVED','WASHING','COMPLETION_PENDING']) {
            await orders.transition(o1.id, s, 'TEST');
        }
        const gen = await completion.generateCode(o1.id);
        console.log('   Code issued: ' + gen.code);
        await completion.consumeCode(o1.id, gen.code);
        await holds.settleOnCompletion(o1.id);
        const h1 = await holds.getHoldsForOrder(o1.id);
        console.log('   Holds state: ' + h1.map(h => h.hold_type + '=' + h.state).join(', '));
        const final1 = await orders.getOrderById(o1.id);
        console.log('   Order status: ' + final1.order_status + ', commission_deducted=' + final1.commission_deducted);

        // ---------- SCENARIO 2: cancel  holds RELEASED ----------
        console.log('\nSCENARIO 2: Cancel before service');
        const o2 = await createReadyOrder('S2');
        await orders.transition(o2.id, 'CANCELLED', 'TEST');
        await holds.releaseOnCancel(o2.id);
        const h2 = await holds.getHoldsForOrder(o2.id);
        console.log('   Holds state: ' + (h2.length ? h2.map(h => h.hold_type + '=' + h.state).join(', ') : '(no hold rows)'));

        // ---------- SCENARIO 3: auto-complete on timeout ----------
        console.log('\nSCENARIO 3: Provider DONE but student never confirms');
        const o3 = await createReadyOrder('S3');
        for (const s of ['PROVIDER_CONTACTED','PROVIDER_ON_THE_WAY','PROVIDER_ARRIVED','WASHING','COMPLETION_PENDING']) {
            await orders.transition(o3.id, s, 'TEST');
        }
        // Schedule with 0 minutes  already expired
        await autoComplete.scheduleAutoComplete(o3.id, 0);
        console.log('   Auto-complete scheduled (0 min)');

        // Run sweep
        const sweep = await autoComplete.runSweep();
        console.log('   Swept ' + sweep.swept + ' orders');
        const final3 = await orders.getOrderById(o3.id);
        console.log('   Order ' + final3.order_code + ' status: ' + final3.order_status);

        const h3 = await holds.getHoldsForOrder(o3.id);
        console.log('   Holds state: ' + h3.map(h => h.hold_type + '=' + h.state).join(', '));
        console.log('   commission_deducted=' + final3.commission_deducted);

        console.log('\n=== TEST COMPLETE ===');
        process.exit(0);
    } catch (err) {
        console.error('TEST FAILED:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
})();
