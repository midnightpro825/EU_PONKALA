// scripts/test-orders.js
const orders = require('../engine/orders');

(async () => {
    console.log('=== ORDER STATE MACHINE TEST ===\n');
    try {
        // 1. Create a laundry order (uses user_id=3 = Francis)
        const o = await orders.createOrder({
            service_type: 'LAUNDRY',
            customer_user_id: 3,
            price: 100,
            pickup_zone_id: 1,
            pickup_landmark_id: 1,
            instructions: 'Test order from script'
        });
        console.log('1. Created: ' + o.order_code + ' (id=' + o.id + ')');
        console.log('   status=' + o.order_status + '  student="' + orders.toStudentState(o.order_status) + '"');

        // 2. Walk it forward
        const steps = [
            'PROVIDER_SEARCHING',
            'PROVIDER_ASSIGNED',
            'PROVIDER_CONTACTED',
            'PROVIDER_ON_THE_WAY',
            'PROVIDER_ARRIVED',
            'WASHING',
            'COMPLETION_PENDING',
            'COMPLETED'
        ];
        for (const s of steps) {
            const next = await orders.transition(o.id, s, 'TEST');
            console.log('    ' + next.order_status + '   "' + orders.toStudentState(next.order_status) + '"');
        }

        // 3. Try illegal transition (should fail)
        try {
            await orders.transition(o.id, 'WASHING', 'TEST');
            console.log('\n3. Illegal transition: FAILED TO FAIL ');
        } catch (e) {
            console.log('\n3. Illegal transition correctly rejected: ' + e.message);
        }

        // 4. Try backwards transition from completed
        try {
            await orders.transition(o.id, 'PROVIDER_ASSIGNED', 'TEST');
            console.log('4. Backwards transition: FAILED TO FAIL ');
        } catch (e) {
            console.log('4. Backwards transition correctly rejected: ' + e.message);
        }

        // 5. Test wheelbarrow states
        const w = await orders.createOrder({
            service_type: 'WHEELBARROW',
            customer_user_id: 3,
            price: 50,
            pickup_zone_id: 5,
            destination_zone_id: 6
        });
        console.log('\n5. Wheelbarrow order: ' + w.order_code);
        console.log('   status=' + w.order_status);
        for (const s of ['PROVIDER_SEARCHING', 'PROVIDER_ASSIGNED', 'PROVIDER_CONTACTED', 'PROVIDER_ON_THE_WAY', 'PROVIDER_ARRIVED', 'LOADING', 'TRANSPORTING', 'ARRIVED_AT_DESTINATION', 'COMPLETION_PENDING', 'COMPLETED']) {
            await orders.transition(w.id, s, 'TEST');
        }
        const wFinal = await orders.getOrderById(w.id);
        console.log('   final status=' + wFinal.order_status + '  student="' + orders.toStudentState(wFinal.order_status) + '"');

        console.log('\n=== TEST COMPLETE ===');
        process.exit(0);
    } catch (err) {
        console.error('TEST FAILED:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
})();
