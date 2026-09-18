// scripts/test-ratings.js
const { get, run } = require('../engine/db');
const orders = require('../engine/orders');
const matching = require('../engine/matching');
const completion = require('../engine/completion');
const ratings = require('../engine/ratings');
const wallet = require('../engine/wallet');

async function ensureProvider() {
    const existing = await get(`SELECT * FROM providers WHERE full_name = 'Rating Test Provider' LIMIT 1`);
    let id;
    if (existing) {
        await run(`UPDATE providers SET verification_status='verified', account_status='active' WHERE id = ?`, [existing.id]);
        id = existing.id;
    } else {
        const r = await run(
            `INSERT INTO providers (provider_code, full_name, phone, verification_status, account_status)
             VALUES (?, ?, ?, 'verified', 'active')`,
            ['PNK-RATE' + Date.now().toString().slice(-4), 'Rating Test Provider', '+260970000333']
        );
        id = r.lastID;
    }
    const w = await wallet.getWalletState(id, 'LAUNDRY');
    if (w.total < 50) await wallet.grantWelcomeCredit(id, 'LAUNDRY', 100, 'RATE-' + Date.now());
    await matching.setAvailability(id, 'LAUNDRY', 'AVAILABLE', 1);
    return id;
}

(async () => {
    console.log('=== RATINGS TEST ===\n');
    try {
        const providerId = await ensureProvider();
        console.log('Provider id=' + providerId);

        // 1. Create + complete an order
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
        console.log('\n1. Order ' + o.order_code + ' completed');

        // 2. Submit rating
        console.log('\n2. Student rates 5 stars');
        const r = await ratings.submitRating(o.id, 3, 5, 'Excellent service!');
        console.log('   rating_id=' + r.rating_id + ' stars=' + r.stars);

        // 3. Try duplicate rating
        console.log('\n3. Try duplicate rating');
        try {
            await ratings.submitRating(o.id, 3, 4, 'Second attempt');
            console.log('   FAILED TO FAIL');
        } catch (e) {
            console.log('   Correctly rejected: ' + e.message);
        }

        // 4. Provider summary
        console.log('\n4. Provider rating summary');
        const summary = await ratings.getProviderRatingSummary(providerId);
        console.log('   total=' + summary.total_ratings + ' average=' + summary.average);

        // 5. Composite score
        console.log('\n5. Provider composite score');
        const score = await ratings.getProviderScore(providerId);
        console.log('   rating=' + score.rating);
        console.log('   completion_rate=' + score.completion_rate);
        console.log('   score=' + score.score);

        console.log('\n=== TEST COMPLETE ===');
        process.exit(0);
    } catch (err) {
        console.error('TEST FAILED:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
})();
