// scripts/test-wheelbarrow.js
const { get, run } = require('../engine/db');
const wheelbarrow = require('../engine/wheelbarrow');
const orders = require('../engine/orders');
const matching = require('../engine/matching');
const completion = require('../engine/completion');
const wallet = require('../engine/wallet');

const TEST_USER = 3;

async function ensureTestProvider() {
    const existing = await get(`SELECT * FROM providers WHERE full_name = 'Test Wheelbarrow Provider' LIMIT 1`);
    let id;
    if (existing) {
        await run(`UPDATE providers SET verification_status='verified', account_status='active' WHERE id = ?`, [existing.id]);
        id = existing.id;
    } else {
        const r = await run(
            `INSERT INTO providers (provider_code, full_name, phone, verification_status, account_status)
             VALUES (?, ?, ?, 'verified', 'active')`,
            ['PNK-WB' + Date.now().toString().slice(-4), 'Test Wheelbarrow Provider', '+260970000222']
        );
        id = r.lastID;
    }
    const state = await wallet.getWalletState(id, 'WHEELBARROW');
    if (state.total < 50) await wallet.grantWelcomeCredit(id, 'WHEELBARROW', 100, 'WB-' + Date.now());
    await matching.setAvailability(id, 'WHEELBARROW', 'AVAILABLE', 1);
    return id;
}

(async () => {
    console.log('=== WHEELBARROW MODULE TEST ===\n');
    try {
        // 1. Pricing rules
        const rules = await wheelbarrow.listPricingRules();
        console.log('1. Pricing rules (' + rules.length + '):');
        rules.forEach(r => console.log('   ' + r.rule_name + ': base=K' + r.base_price +
            ' per_zone=K' + r.per_zone_distance +
            ' per_wheelbarrow=K' + r.per_wheelbarrow));

        // 2. Quote  Zone 1 to Zone 5, medium load, 2 wheelbarrows
        const quote = await wheelbarrow.calculateQuote({
            pickup_zone_id: 1,
            destination_zone_id: 5,
            load_size: 'MEDIUM',
            wheelbarrow_count: 2
        });
        console.log('\n2. Quote (Z1  Z5, MEDIUM, 2 wheelbarrows):');
        console.log('   Zone hops:       ' + quote.zone_hops);
        console.log('   Base price:      K' + quote.breakdown.base_price);
        console.log('   Distance charge: K' + quote.breakdown.distance_charge);
        console.log('   Load multiplier: x' + quote.breakdown.load_multiplier);
        console.log('   Subtotal:        K' + quote.breakdown.subtotal_after_multiplier);
        console.log('   Wheelbarrows:    K' + quote.breakdown.wheelbarrow_charge);
        console.log('   TOTAL:           K' + quote.total);

        // 3. Create order
        await ensureTestProvider();
        const created = await wheelbarrow.createWheelbarrowOrder(TEST_USER, {
            pickup_zone_id: 1,
            destination_zone_id: 5,
            load_size: 'MEDIUM',
            wheelbarrow_count: 2,
            pickup_landmark_id: 1,
            destination_landmark_id: 15,
            instructions: 'Test transport'
        });
        console.log('\n3. Order created: ' + created.order.order_code);
        console.log('   price=K' + created.quote.total);
        console.log('   service_type=' + created.order.service_type);

        // 4. Walk to completion
        await orders.transition(created.order.id, 'PROVIDER_SEARCHING', 'TEST');
        const asg = await matching.autoAssign(created.order.id);
        console.log('\n4. Assigned provider ' + (asg.result ? asg.result.provider_id : 'NONE'));
        for (const s of ['PROVIDER_CONTACTED','PROVIDER_ON_THE_WAY','PROVIDER_ARRIVED','LOADING','TRANSPORTING','ARRIVED_AT_DESTINATION','COMPLETION_PENDING']) {
            await orders.transition(created.order.id, s, 'TEST');
        }
        console.log('   Walked to COMPLETION_PENDING');

        // 5. Complete
        const gen = await completion.generateCode(created.order.id);
        await completion.consumeCode(created.order.id, gen.code);
        console.log('\n5. Order completed with code ' + gen.code);

        // 6. Verify commission deducted
        const provider = await get(`SELECT * FROM providers WHERE full_name = 'Test Wheelbarrow Provider'`);
        const wState = await wallet.getWalletState(provider.id, 'WHEELBARROW');
        console.log('\n6. Provider wallet: available=K' + wState.available + ' held=K' + wState.held);
        console.log('   (Commission should have been deducted)');

        console.log('\n=== TEST COMPLETE ===');
        process.exit(0);
    } catch (err) {
        console.error('TEST FAILED:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
})();
