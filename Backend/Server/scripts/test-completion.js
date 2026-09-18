// scripts/test-completion.js
const orders = require('../engine/orders');
const completion = require('../engine/completion');

(async () => {
    console.log('=== COMPLETION CODE TEST ===\n');
    try {
        // 1. Create a fresh order
        const o = await orders.createOrder({
            service_type: 'LAUNDRY',
            customer_user_id: 3,
            price: 100,
            pickup_zone_id: 1,
            pickup_landmark_id: 1
        });
        console.log('1. Created: ' + o.order_code + ' (id=' + o.id + ')');

        // 2. Try to generate code too early (should fail)
        try {
            await completion.generateCode(o.id);
            console.log('2. Generate-too-early: FAILED TO FAIL');
        } catch (e) {
            console.log('2. Generate-too-early correctly rejected: ' + e.message);
        }

        // 3. Walk to COMPLETION_PENDING
        for (const s of [
            'PROVIDER_SEARCHING', 'PROVIDER_ASSIGNED', 'PROVIDER_CONTACTED',
            'PROVIDER_ON_THE_WAY', 'PROVIDER_ARRIVED', 'WASHING', 'COMPLETION_PENDING'
        ]) {
            await orders.transition(o.id, s, 'TEST');
        }
        console.log('3. Order now at: COMPLETION_PENDING');

        // 4. Generate the code
        const gen = await completion.generateCode(o.id);
        console.log('4. Generated code: ' + gen.code);

        // 5. Try wrong code (should fail)
        try {
            await completion.consumeCode(o.id, '0000');
            console.log('5. Wrong code: FAILED TO FAIL');
        } catch (e) {
            console.log('5. Wrong code correctly rejected: ' + e.message);
        }

        // 6. Consume the right code  order completes
        const result = await completion.consumeCode(o.id, gen.code);
        console.log('6. Correct code accepted. Order status: ' + result.order.order_status);

        // 7. Try the same code again (should fail  already used)
        try {
            await completion.consumeCode(o.id, gen.code);
            console.log('7. Reuse: FAILED TO FAIL');
        } catch (e) {
            console.log('7. Reuse correctly rejected: ' + e.message);
        }

        // 8. List all codes for this order
        const codes = await completion.listCodes(o.id);
        console.log('\n8. All codes for this order:');
        codes.forEach(c => console.log('   code=' + c.code + ' used=' + c.is_used + ' at=' + (c.used_at || 'never')));

        console.log('\n=== TEST COMPLETE ===');
        process.exit(0);
    } catch (err) {
        console.error('TEST FAILED:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
})();
