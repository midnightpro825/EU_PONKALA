// scripts/test-zones.js - uses timestamped codes so it can run repeatedly
const zones = require('../engine/zones');

(async () => {
    console.log('=== ZONES + LANDMARKS TEST ===\n');
    const stamp = Date.now().toString().slice(-6);
    const testZoneCode = 'T' + stamp;
    const testZoneName = 'TEST Zone ' + stamp;

    try {
        // 1. List all zones
        const all = await zones.getAllZones();
        console.log('1. Zones (' + all.length + ' total):');
        all.forEach(z => console.log('   [' + z.zone_code + '] ' + z.zone_name));

        // 2. Get landmarks in zone 1
        const z1Id = all[0].zone_id;
        const lms = await zones.getLandmarksInZone(z1Id);
        console.log('\n2. Landmarks in Zone ' + all[0].zone_code + ' (' + lms.length + '):');
        lms.forEach(l => console.log('   [' + l.type + '] ' + l.name));

        // 3. Create a new zone with unique code
        const newZone = await zones.createZone({
            zone_code: testZoneCode,
            zone_name: testZoneName,
            description: 'Created by test script',
            sort_order: 99
        });
        console.log('\n3. Created zone: ' + newZone.zone_code + ' (id=' + newZone.zone_id + ')');

        // 4. Create a landmark in it
        const newLm = await zones.createLandmark({
            zone_id: newZone.zone_id,
            type: 'LANDMARK',
            name: 'Test Landmark ' + stamp
        });
        console.log('4. Created landmark: ' + newLm.name + ' (id=' + newLm.landmark_id + ')');

        // 5. Validate
        const valid = await zones.validateLandmarkInZone(newZone.zone_id, newLm.landmark_id);
        console.log('5. validateLandmarkInZone: ' + valid);

        // 6. Update
        const updated = await zones.updateZone(newZone.zone_id, { zone_name: testZoneName + ' (renamed)' });
        console.log('6. Renamed to: ' + updated.zone_name);

        // 7. Deactivate
        await zones.deactivateZone(newZone.zone_id);
        await zones.deactivateLandmark(newLm.landmark_id);
        const active = await zones.getAllZones();
        console.log('7. After deactivate, active zones: ' + active.length + ' (should still be 6)');

        console.log('\n=== TEST COMPLETE ===');
        process.exit(0);
    } catch (err) {
        console.error('TEST FAILED:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
})();
