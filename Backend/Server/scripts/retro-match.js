// scripts/retro-match.js - auto-match all stuck orders
const db = require('../engine/db');
const orders = require('../engine/orders');
const matching = require('../engine/matching');

(async () => {
    console.log('=== RETRO MATCH: assigning stuck orders ===\n');
    try {
        // Find all orders stuck in PAYMENT_CONFIRMED (ready to search)
        const stuck = await db.all(
            "SELECT id, order_code, service_type, pickup_zone_id, price FROM service_orders WHERE order_status = 'PAYMENT_CONFIRMED' ORDER BY id"
        );
        console.log('Found ' + stuck.length + ' stuck order(s)\n');

        for (const o of stuck) {
            try {
                await orders.transition(o.id, 'PROVIDER_SEARCHING', 'RETRO', 'Retroactive match');
                const asg = await matching.autoAssign(o.id);
                if (asg.assigned) {
                    console.log('  [' + o.order_code + '] -> assigned to provider ' + asg.result.provider_id);
                } else {
                    console.log('  [' + o.order_code + '] -> NO eligible provider (' + (asg.reason || 'unknown') + ')');
                }
            } catch (e) {
                console.log('  [' + o.order_code + '] -> error: ' + e.message);
            }
        }

        // Also advance all PROVIDER_SEARCHING to try again
        const searching = await db.all(
            "SELECT id, order_code FROM service_orders WHERE order_status = 'PROVIDER_SEARCHING'"
        );
        console.log('\nFound ' + searching.length + ' order(s) stuck in PROVIDER_SEARCHING\n');
        for (const o of searching) {
            try {
                const asg = await matching.autoAssign(o.id);
                if (asg.assigned) {
                    console.log('  [' + o.order_code + '] -> assigned to provider ' + asg.result.provider_id);
                } else {
                    console.log('  [' + o.order_code + '] -> still no provider');
                }
            } catch (e) {
                console.log('  [' + o.order_code + '] -> error: ' + e.message);
            }
        }

        console.log('\n=== DONE ===');
        process.exit(0);
    } catch (err) {
        console.error('FAILED:', err.message);
        process.exit(1);
    }
})();
