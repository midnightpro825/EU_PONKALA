const earnings = require('../engine/provider-earnings');
const orders = require('../engine/orders');
const matching = require('../engine/matching');
const completion = require('../engine/completion');
const { get } = require('../engine/db');

async function ensureProvider() {
    const p = await get("SELECT * FROM providers WHERE verification_status='verified' AND account_status='active' LIMIT 1");
    if (!p) throw new Error('no verified active provider in DB');
    await matching.setAvailability(p.id, 'LAUNDRY', 'AVAILABLE', 1);
    return p;
}

(async () => {
    console.log('=== PROVIDER EARNINGS TEST ===\n');
    try {
        const p = await ensureProvider();
        console.log('Provider: ' + p.full_name + ' (id=' + p.id + ')\n');

        for (let i = 0; i < 3; i++) {
            const o = await orders.createOrder({ service_type: 'LAUNDRY', customer_user_id: 3, price: 100, pickup_zone_id: 1, pickup_landmark_id: 1 });
            await orders.transition(o.id, 'PROVIDER_SEARCHING', 'TEST');
            await matching.assignProviderToOrder(o.id, p.id);
            for (const s of ['PROVIDER_CONTACTED','PROVIDER_ON_THE_WAY','PROVIDER_ARRIVED','WASHING','COMPLETION_PENDING']) {
                await orders.transition(o.id, s, 'TEST');
            }
            const gen = await completion.generateCode(o.id);
            await completion.consumeCode(o.id, gen.code);
            console.log('  Completed order ' + o.order_code + ' (K100)');
        }

        console.log('\nEarnings (week):');
        const e = await earnings.getProviderEarnings(p.id, 'week');
        console.log('  jobs=' + e.total_jobs);
        console.log('  gross=K' + e.total_gross);
        console.log('  commission=K' + e.total_commission);
        console.log('  net=K' + e.total_net);
        console.log('  wallet=K' + e.wallet.total);

        console.log('\nTop providers (week):');
        const all = await earnings.getAllProvidersEarnings('week');
        all.slice(0, 5).forEach(r => console.log('  ' + r.provider_code + ' ' + r.full_name + ' - K' + r.gross + ' (' + r.jobs + ' jobs)'));

        console.log('\n=== TEST COMPLETE ===');
        process.exit(0);
    } catch (err) {
        console.error('TEST FAILED:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
})();