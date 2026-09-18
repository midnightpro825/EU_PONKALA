const cfg = require('../engine/config-store');
const { get } = require('../engine/db');

(async () => {
    console.log('=== CONFIG STORE TEST ===\n');
    try {
        // 1. Read all
        console.log('1. Current config:');
        const all = await cfg.getAll();
        const keys = ['commission_rate','laundry_access_price','laundry_access_connections','welcome_credit_amount','auto_completion_timeout_min'];
        keys.forEach(k => console.log('   ' + k.padEnd(35) + ' = ' + JSON.stringify(all[k])));

        // 2. Change commission rate
        console.log('\n2. Change commission_rate to 0.20');
        await cfg.set('commission_rate', 0.20, 1);
        const after = await cfg.get('commission_rate');
        console.log('   commission_rate now = ' + after);

        // 3. Verify DB reflects it
        const dbRow = await get(`SELECT config_value FROM engine_config WHERE config_key = 'commission_rate'`);
        console.log('   DB row = ' + dbRow.config_value);

        // 4. Bulk update
        console.log('\n3. Bulk update (laundry_access_price=75, welcome_credit_amount=100)');
        await cfg.bulkSet({ laundry_access_price: 75, welcome_credit_amount: 100 }, 1);
        console.log('   laundry_access_price = ' + await cfg.get('laundry_access_price'));
        console.log('   welcome_credit_amount = ' + await cfg.get('welcome_credit_amount'));

        // 5. Reset to defaults
        console.log('\n4. Reset to defaults');
        await cfg.reset(1);
        console.log('   commission_rate = ' + await cfg.get('commission_rate'));
        console.log('   laundry_access_price = ' + await cfg.get('laundry_access_price'));

        console.log('\n=== TEST COMPLETE ===');
        process.exit(0);
    } catch (err) {
        console.error('TEST FAILED:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
})();
