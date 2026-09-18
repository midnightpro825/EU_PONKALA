// scripts/test-laundry.js - Full laundry lifecycle
const { get, all } = require('../engine/db');
const laundry = require('../engine/laundry');
const orders = require('../engine/orders');
const completion = require('../engine/completion');
const matching = require('../engine/matching');
const wallet = require('../engine/wallet');

const TEST_USER = 3; // Francis

async function ensureTestProvider() {
    const existing = await get(`SELECT * FROM providers WHERE full_name = 'Test Laundry Provider' LIMIT 1`);
    let id;
    if (existing) {
        await require('../engine/db').run(`UPDATE providers SET verification_status='verified', account_status='active' WHERE id = ?`, [existing.id]);
        id = existing.id;
    } else {
        const r = await require('../engine/db').run(
            `INSERT INTO providers (provider_code, full_name, phone, verification_status, account_status)
             VALUES (?, ?, ?, 'verified', 'active')`,
            ['PNK-LAUN' + Date.now().toString().slice(-4), 'Test Laundry Provider', '+260970000111']
        );
        id = r.lastID;
    }
    const state = await wallet.getWalletState(id, 'LAUNDRY');
    if (state.total < 50) await wallet.grantWelcomeCredit(id, 'LAUNDRY', 100, 'LAUNCH-' + Date.now());
    await matching.setAvailability(id, 'LAUNDRY', 'AVAILABLE', 1);
    return id;
}

async function walkToCompletion(orderId, providerId) {
    // Advance to PROVIDER_SEARCHING then assign + walk
    await orders.transition(orderId, 'PROVIDER_SEARCHING', 'TEST');
    await matching.autoAssign(orderId);
    for (const s of ['PROVIDER_CONTACTED','PROVIDER_ON_THE_WAY','PROVIDER_ARRIVED','WASHING','COMPLETION_PENDING']) {
        await orders.transition(orderId, s, 'TEST');
    }
    const gen = await completion.generateCode(orderId);
    await completion.consumeCode(orderId, gen.code);
}

(async () => {
    console.log('=== LAUNDRY MODULE TEST ===\n');
    try {
        // ---------- STEP 1: item catalog ----------
        const catalog = await laundry.listItems();
        console.log('1. Item catalog (' + catalog.length + ' items):');
        catalog.forEach(i => console.log('   ' + i.item_code.padEnd(12) + ' K' + i.unit_price));

        // ---------- STEP 2: check access before unlock ----------
        let access = await laundry.getAccessState(TEST_USER);
        console.log('\n2. Access BEFORE unlock:');
        console.log('   unlocked=' + access.unlocked + ' remaining=' + access.remaining + ' total=' + access.total);

        // ---------- STEP 3: unlock (mock K50) ----------
        access = await laundry.unlockAccess(TEST_USER, 'TEST-K50-' + Date.now());
        console.log('\n3. After unlock (K50):');
        console.log('   unlocked=' + access.unlocked + ' remaining=' + access.remaining + ' total=' + access.total);

        // ---------- STEP 4: calculate a cart price ----------
        const cart = [
            { item_code: 'T-SHIRT',  quantity: 5 },
            { item_code: 'TROUSERS', quantity: 2 },
            { item_code: 'JEANS',    quantity: 1 }
        ];
        const priced = await laundry.calculatePrice(cart);
        console.log('\n4. Cart price calc:');
        priced.lines.forEach(l => console.log('   ' + l.item_code + ' x' + l.quantity + ' @ K' + l.unit_price + ' = K' + l.line_total));
        console.log('   TOTAL: K' + priced.total);

        // ---------- STEP 5: create laundry order ----------
        const providerId = await ensureTestProvider();
        const created = await laundry.createLaundryOrder(TEST_USER, {
            items: cart,
            pickup_zone_id: 1,
            pickup_landmark_id: 1,
            instructions: 'Laundry test'
        });
        console.log('\n5. Order created: ' + created.order.order_code);
        console.log('   price=K' + created.total);
        console.log('   access: remaining=' + created.access.remaining +
                    ' held=' + created.access.held +
                    ' used=' + created.access.used);

        // ---------- STEP 6: complete the order  consume connection ----------
        await walkToCompletion(created.order.id, providerId);
        const afterComplete = await laundry.onLaundryOrderCompleted(created.order.id);
        console.log('\n6. Order completed.');
        console.log('   access: remaining=' + afterComplete.access.remaining +
                    ' held=' + afterComplete.access.held +
                    ' used=' + afterComplete.access.used);

        // ---------- STEP 7: consume 3 more to hit zero ----------
        console.log('\n7. Burn 3 more connections...');
        for (let i = 0; i < 3; i++) {
            const c = await laundry.createLaundryOrder(TEST_USER, {
                items: [{ item_code: 'T-SHIRT', quantity: 1 }],
                pickup_zone_id: 1,
                pickup_landmark_id: 1
            });
            await walkToCompletion(c.order.id, providerId);
            const acc = await laundry.onLaundryOrderCompleted(c.order.id);
            console.log('   Order ' + c.order.order_code + '  remaining=' + acc.access.remaining);
        }

        // ---------- STEP 8: try to create another  should fail ----------
        console.log('\n8. Try to create with 0 connections (should fail):');
        try {
            await laundry.createLaundryOrder(TEST_USER, {
                items: [{ item_code: 'T-SHIRT', quantity: 1 }],
                pickup_zone_id: 1,
                pickup_landmark_id: 1
            });
            console.log('   FAILED TO FAIL ');
        } catch (e) {
            console.log('   Correctly rejected: ' + e.message);
        }

        // ---------- STEP 9: final state ----------
        const finalState = await laundry.getAccessState(TEST_USER);
        console.log('\n9. Final access state:');
        console.log('   total=' + finalState.total + ' used=' + finalState.used +
                    ' held=' + finalState.held + ' remaining=' + finalState.remaining);

        console.log('\n=== TEST COMPLETE ===');
        process.exit(0);
    } catch (err) {
        console.error('TEST FAILED:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
})();
