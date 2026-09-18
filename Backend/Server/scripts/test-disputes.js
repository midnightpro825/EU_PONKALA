const orders = require('../engine/orders');
const matching = require('../engine/matching');
const completion = require('../engine/completion');
const disp = require('../engine/disputes');

(async () => {
    console.log('=== DISPUTES TEST ===\n');
    try {
        // Create + complete an order
        const o = await orders.createOrder({
            service_type: 'LAUNDRY', customer_user_id: 3, price: 100,
            pickup_zone_id: 1, pickup_landmark_id: 1
        });
        await orders.transition(o.id, 'PROVIDER_SEARCHING', 'TEST');
        await matching.autoAssign(o.id);
        for (const s of ['PROVIDER_CONTACTED','PROVIDER_ON_THE_WAY','PROVIDER_ARRIVED','WASHING','COMPLETION_PENDING']) {
            await orders.transition(o.id, s, 'TEST');
        }
        const gen = await completion.generateCode(o.id);
        await completion.consumeCode(o.id, gen.code);
        console.log('1. Order ' + o.order_code + ' completed');

        // Raise dispute
        console.log('\n2. Student raises dispute');
        const r = await disp.raiseDispute(o.id, 'STUDENT', 'INCOMPLETE_WORK', 'Shirt had stain left');
        console.log('   dispute_id=' + r.dispute_id);

        const afterRaise = await orders.getOrderById(o.id);
        console.log('   Order status: ' + afterRaise.order_status);

        // List open disputes
        console.log('\n3. Open disputes');
        const open = await disp.listOpenDisputes();
        console.log('   ' + open.length + ' open');

        // Admin reviews
        console.log('\n4. Admin reviews');
        const rev = await disp.reviewDispute(r.dispute_id, 1, 'Investigating');
        console.log('   status=' + rev.status);

        // Admin resolves ??? refund student
        console.log('\n5. Admin resolves: REFUND_STUDENT');
        const res = await disp.resolveDispute(r.dispute_id, 1, 'REFUND_STUDENT', 'Provider was at fault');
        console.log('   resolution=' + res.resolution);
        console.log('   outcome=' + JSON.stringify(res.outcome));

        const final = await orders.getOrderById(o.id);
        console.log('\n6. Final order status: ' + final.order_status);

        console.log('\n=== TEST COMPLETE ===');
        process.exit(0);
    } catch (err) {
        console.error('TEST FAILED:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
})();
