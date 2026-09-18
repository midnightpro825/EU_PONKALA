const { get } = require('../engine/db');
const orders = require('../engine/orders');
const matching = require('../engine/matching');
const canc = require('../engine/cancellations');
const wallet = require('../engine/wallet');

(async () => {
    console.log('=== CANCELLATION TEST ===\n');
    try {
        // Create + assign an order
        const o = await orders.createOrder({
            service_type: 'LAUNDRY', customer_user_id: 3, price: 100,
            pickup_zone_id: 1, pickup_landmark_id: 1
        });
        await orders.transition(o.id, 'PROVIDER_SEARCHING', 'TEST');
        const asg = await matching.autoAssign(o.id);
        console.log('1. Order ' + o.order_code + ' assigned to provider ' + (asg.result ? asg.result.provider_id : 'NONE'));

        // Check wallet has HOLD
        const providerId = asg.result ? asg.result.provider_id : null;
        if (providerId) {
            const w1 = await wallet.getWalletState(providerId, 'LAUNDRY');
            console.log('   Wallet before cancel: available=K' + w1.available + ' held=K' + w1.held);
        }

        // Cancel
        console.log('\n2. Student cancels order');
        const r = await canc.cancelOrder(o.id, 'STUDENT', 'Changed my mind');
        console.log('   cancellation_id=' + r.cancellation_id);

        // Verify order
        const after = await orders.getOrderById(o.id);
        console.log('\n3. Order status now: ' + after.order_status);

        // Verify wallet released
        if (providerId) {
            const w2 = await wallet.getWalletState(providerId, 'LAUNDRY');
            console.log('   Wallet after cancel: available=K' + w2.available + ' held=K' + w2.held);
        }

        // Verify cancellation record
        const cancRows = await canc.getCancellationsForOrder(o.id);
        console.log('\n4. Cancellation records: ' + cancRows.length);
        cancRows.forEach(c => console.log('   #' + c.cancellation_id + ' by=' + c.cancelled_by + ' reason=' + c.reason));

        console.log('\n=== TEST COMPLETE ===');
        process.exit(0);
    } catch (err) {
        console.error('TEST FAILED:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
})();
