const { get } = require('../engine/db');
const pen = require('../engine/penalties');

(async () => {
    console.log('=== PENALTIES TEST ===\n');
    try {
        const providerId = 9999 + Math.floor(Math.random()*1000);
        console.log('Test provider id: ' + providerId);

        // 1. Initial standing
        let s = await pen.getStanding('PROVIDER', providerId);
        console.log('\n1. Initial standing: level=' + s.level + ' banned=' + s.is_banned);

        // 2. First offense ??? warning
        console.log('\n2. First offense (provider cancelled)');
        const r1 = await pen.recordOffense('PROVIDER', providerId, 'PROVIDER_CANCEL', 'Cancelled order A');
        console.log('   level=' + r1.new_level + ' suspended_until=' + r1.suspended_until);

        // 3. Second offense ??? 7-day suspension
        console.log('\n3. Second offense');
        const r2 = await pen.recordOffense('PROVIDER', providerId, 'PROVIDER_CANCEL', 'Cancelled order B');
        console.log('   level=' + r2.new_level);
        console.log('   suspended_until=' + r2.suspended_until);

        // 4. Check suspension
        const susp = await pen.isProviderSuspended(providerId);
        console.log('\n4. isProviderSuspended: ' + JSON.stringify(susp));

        // 5. Third offense ??? ban
        console.log('\n5. Third offense');
        const r3 = await pen.recordOffense('PROVIDER', providerId, 'PROVIDER_CANCEL', 'Cancelled order C');
        console.log('   level=' + r3.new_level + ' banned=' + r3.is_banned);

        const susp2 = await pen.isProviderSuspended(providerId);
        console.log('   isProviderSuspended: ' + JSON.stringify(susp2));

        // 6. List suspended
        console.log('\n6. List suspended:');
        const suspended = await pen.listSuspended();
        console.log('   ' + suspended.length + ' subjects suspended');

        // 7. Clear a penalty
        console.log('\n7. Clear the first penalty');
        const cleared = await pen.clearPenalty(r1.penalty_id, 1);
        console.log('   new_level=' + cleared.new_level);

        console.log('\n=== TEST COMPLETE ===');
        process.exit(0);
    } catch (err) {
        console.error('TEST FAILED:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
})();
