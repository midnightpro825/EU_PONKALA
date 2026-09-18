const orders = require('../engine/orders');
const matching = require('../engine/matching');
const wallet = require('../engine/wallet');
const recovery = require('../engine/recovery');
const { get } = require('../engine/db');

async function ensureProvider() {
    const p = await get("SELECT * FROM providers WHERE verification_status='verified' AND account_status='active' LIMIT 1");
    if (!p) throw new Error('no verified active provider in DB');
    await matching.setAvailability(p.id, 'LAUNDRY', 'AVAILABLE', 1);
    const w = await wallet.getWalletState(p.id, 'LAUNDRY');
    if (w.total < 50) await wallet.grantWelcomeCredit(p.id, 'LAUNDRY', 100, 'RECOV-' + Date.now());
    return p;
}

(async () => {
    console.log('=== RECOVERY TEST ===\n');
    try {
        const p = await ensureProvider();
        console.log('Provider: ' + p.full_name + ' (id=' + p.id + ')\n');

        const o = await orders.createOrder({ service_type: 'LAUNDRY', customer_user_id: 3, price: 100, pickup_zone_id: 1, pickup_landmark_id: 1 });
        await orders.transition(o.id, 'PROVIDER_SEARCHING', 'TEST');
        await matching.assignProviderToOrder(o.id, p.id);
        for (const s of ['PROVIDER_CONTACTED','PROVIDER_ON_THE_WAY','PROVIDER_ARRIVED','WASHING']) {
            await orders.transition(o.id, s, 'TEST');
        }
        console.log('1. Order ' + o.order_code + ' stuck in WASHING');

        const w1 = await wallet.getWalletState(p.id, 'LAUNDRY');
        console.log('   Wallet BEFORE: available=K' + w1.available + ' held=K' + w1.held);

        console.log('\n2. Admin force-completes');
        const r = await recovery.forceComplete(o.id, 1, 'Stuck - forced by admin');
        console.log('   result=' + JSON.stringify(r));

        const after = await orders.getOrderById(o.id);
        console.log('\n3. Order status: ' + after.order_status);

        const w2 = await wallet.getWalletState(p.id, 'LAUNDRY');
        console.log('   Wallet AFTER: available=K' + w2.available + ' held=K' + w2.held);

        console.log('\n4. Admin adjusts wallet +K5');
        const adj = await recovery.adjustWallet(p.id, 5, 'Compensation for delay', 1);
        console.log('   new balance: K' + adj.new_balance);

        console.log('\n=== TEST COMPLETE ===');
        process.exit(0);
    } catch (err) {
        console.error('TEST FAILED:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
})();