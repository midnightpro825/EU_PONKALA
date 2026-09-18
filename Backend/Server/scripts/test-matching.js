// scripts/test-matching.js
// Seeds a test provider + availability + wallet, then matches an order.
const { run, get, all } = require('../engine/db');
const orders = require('../engine/orders');
const matching = require('../engine/matching');
const wallet = require('../engine/wallet');

async function ensureTestProvider() {
    // Find or create a provider named "Test Provider Match"
    const existing = await get(`SELECT * FROM providers WHERE full_name = 'Test Provider Match' LIMIT 1`);
    if (existing) {
        // ensure it's active + verified
        await run(
            `UPDATE providers SET verification_status='verified', account_status='active' WHERE id = ?`,
            [existing.id]
        );
        return existing.id;
    }
    const r = await run(
        `INSERT INTO providers (provider_code, full_name, phone, verification_status, account_status)
         VALUES (?, ?, ?, 'verified', 'active')`,
        ['PNK-TEST' + Date.now().toString().slice(-5), 'Test Provider Match', '+260970000001']
    );
    return r.lastID;
}

(async () => {
    console.log('=== MATCHING ENGINE TEST ===\n');
    try {
        // 1. Ensure a provider exists
        const providerId = await ensureTestProvider();
        console.log('1. Test provider id:', providerId);

        // 2. Give the provider K100 welcome credit (so they can pay commission)
        const existingWallet = await wallet.getWalletState(providerId, 'LAUNDRY');
        if (existingWallet.total < 50) {
            await wallet.grantWelcomeCredit(providerId, 'LAUNDRY', 100, 'MATCH-TEST-' + Date.now());
            console.log('   Granted K100 welcome credit to test provider');
        }

        // 3. Set availability
        await matching.setAvailability(providerId, 'LAUNDRY', 'AVAILABLE', 1);
        console.log('2. Availability: LAUNDRY AVAILABLE in zone 1');

        // 4. Create an order that needs matching
        const o = await orders.createOrder({
            service_type: 'LAUNDRY',
            customer_user_id: 3,
            price: 100,
            pickup_zone_id: 1,
            pickup_landmark_id: 1
        });
        console.log('\n3. Order created:', o.order_code, '(id=' + o.id + ')');

        // 5. Advance to PROVIDER_SEARCHING
        await orders.transition(o.id, 'PROVIDER_SEARCHING', 'TEST');
        console.log('   Order moved to PROVIDER_SEARCHING');

        // 6. List candidates
        const candidates = await matching.findEligibleProviders(o.id);
        console.log('\n4. Eligible candidates: ' + candidates.length);
        candidates.slice(0, 5).forEach(c => {
            console.log('   [' + c.provider_code + '] ' + c.full_name +
                '  zone=' + c.provider_zone_id +
                '  wallet_total=' + c.wallet_total +
                '  commission=' + c.expected_commission);
        });

        // 7. Auto-assign
        const assignment = await matching.autoAssign(o.id);
        console.log('\n5. Auto-assign result: ' + (assignment.assigned ? 'ASSIGNED' : 'FAILED  ' + assignment.reason));
        if (assignment.assigned) {
            console.log('   Provider:', assignment.result.provider_id);
            console.log('   Commission held: K' + assignment.result.commission_held);
        }

        // 8. Check wallet got a HOLD
        const ledger = await all(
            `SELECT id, txn_type, amount, balance_before, balance_after, reference
             FROM wallet_transactions WHERE provider_id = ? AND order_id = ?
             ORDER BY id DESC LIMIT 5`,
            [providerId, o.id]
        );
        console.log('\n6. Wallet ledger for this order:');
        ledger.forEach(r => console.log('   #' + r.id + ' ' + r.txn_type + ' ' + r.amount + ' (' + r.reference + ')'));

        console.log('\n=== TEST COMPLETE ===');
        process.exit(0);
    } catch (err) {
        console.error('TEST FAILED:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
})();
