const wallet = require('../engine/wallet');
const { all } = require('../engine/db');
const PROVIDER_ID = 1;
const SERVICE = 'laundry';

(async () => {
    console.log('=== WALLET LEDGER TEST ===\n');
    try {
        let state = await wallet.getWalletState(PROVIDER_ID, SERVICE);
        console.log('1. Initial:      available=' + state.available + ' held=' + state.held + ' total=' + state.total);

        await wallet.grantWelcomeCredit(PROVIDER_ID, SERVICE, 60, 'TEST-WELCOME-' + Date.now());
        state = await wallet.getWalletState(PROVIDER_ID, SERVICE);
        console.log('2. +K60 welcome: available=' + state.available + ' held=' + state.held + ' total=' + state.total);

        await wallet.topUpFloat(PROVIDER_ID, SERVICE, 100, 'TEST-TOPUP-' + Date.now());
        state = await wallet.getWalletState(PROVIDER_ID, SERVICE);
        console.log('3. +K100 float:  available=' + state.available + ' held=' + state.held + ' total=' + state.total);

        const orderId = 999, commission = 15;
        const ok = await wallet.canAcceptCashJob(PROVIDER_ID, SERVICE, commission);
        console.log('4. Can accept?   ' + ok);

        await wallet.holdCommission(PROVIDER_ID, SERVICE, orderId, commission);
        state = await wallet.getWalletState(PROVIDER_ID, SERVICE);
        console.log('   after HOLD:   available=' + state.available + ' held=' + state.held + ' total=' + state.total);

        await wallet.deductCommission(PROVIDER_ID, SERVICE, orderId, commission);
        state = await wallet.getWalletState(PROVIDER_ID, SERVICE);
        console.log('5. after COMM:   available=' + state.available + ' held=' + state.held + ' total=' + state.total);

        const rows = await all(
            `SELECT id, txn_type, amount, balance_before, balance_after, reference
             FROM wallet_transactions WHERE provider_id = ? ORDER BY id`, [PROVIDER_ID]);
        console.log('\n=== LEDGER ===');
        rows.forEach(r => console.log('  #' + r.id + ' ' + String(r.txn_type).padEnd(15) + ' ' +
            String(r.amount).padStart(6) + '  ' + String(r.balance_before).padStart(7) + ' -> ' +
            String(r.balance_after).padStart(7) + '   ' + (r.reference || '')));
        console.log('\n=== TEST COMPLETE ===');
        process.exit(0);
    } catch (err) {
        console.error('TEST FAILED:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
})();
