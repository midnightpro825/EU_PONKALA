const { get } = require('../engine/db');
const admin = require('../engine/admin-users');
const audit = require('../engine/audit');

(async () => {
    console.log('=== ADMIN + AUDIT TEST ===\n');
    try {
        // Get any existing provider
        const p = await get(`SELECT * FROM providers LIMIT 1`);
        if (!p) { console.error('no providers in DB'); process.exit(1); }
        const providerId = p.id;
        console.log('Using provider id=' + providerId + ' (' + p.full_name + ')\n');

        // 1. Suspend
        console.log('1. Suspend provider');
        const susp = await admin.suspendProvider(providerId, 1, 'Test suspension');
        console.log('   status=' + susp.account_status);

        const afterSusp = await get(`SELECT account_status FROM providers WHERE id = ?`, [providerId]);
        console.log('   DB confirms: ' + afterSusp.account_status);

        // 2. Reactivate
        console.log('\n2. Reactivate provider');
        const react = await admin.reactivateProvider(providerId, 1, 'Test reactivation');
        console.log('   status=' + react.account_status);

        const afterReact = await get(`SELECT account_status FROM providers WHERE id = ?`, [providerId]);
        console.log('   DB confirms: ' + afterReact.account_status);

        // 3. Audit log for this provider
        console.log('\n3. Audit log for this provider');
        const logs = await audit.getLogsForEntity('PROVIDER', providerId);
        console.log('   ' + logs.length + ' log entries');
        logs.forEach(l => console.log('   [' + l.action + '] ' + (l.new_value || '')));

        // 4. Recent audit
        console.log('\n4. Recent audit (last 10)');
        const recent = await audit.listRecentLogs(10);
        recent.forEach(l => console.log('   #' + l.log_id + ' ' + l.action + ' on ' + l.entity_type + '#' + l.entity_id));

        // 5. List all providers
        console.log('\n5. List all providers');
        const list = await admin.listAllProviders({ limit: 5 });
        console.log('   ' + list.length + ' shown');

        // 6. Provider details
        console.log('\n6. Provider details');
        const details = await admin.getProviderDetails(providerId);
        console.log('   name=' + details.provider.full_name);
        console.log('   wallet laundry available=K' + details.wallet.laundry.available);
        console.log('   recent orders=' + details.recent_orders.length);
        console.log('   penalties=' + details.penalties.length);
        console.log('   audit logs=' + details.audit_log.length);

        console.log('\n=== TEST COMPLETE ===');
        process.exit(0);
    } catch (err) {
        console.error('TEST FAILED:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
})();
