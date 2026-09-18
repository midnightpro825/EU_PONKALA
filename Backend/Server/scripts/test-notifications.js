const notif = require('../engine/notifications');
const scheduler = require('../engine/scheduler');

(async () => {
    console.log('=== NOTIFICATIONS + SCHEDULER TEST ===\n');
    try {
        // 1. Enqueue 3 notifications for user 3
        console.log('1. Enqueue 3 notifications for user 3');
        await notif.enqueue(3, 'test', 'Test 1', 'First test notification', '/x');
        await notif.enqueue(3, 'test', 'Test 2', 'Second notification', '/y');
        await notif.enqueue(3, 'order', 'Order update', 'Your order was assigned', '/order/1');

        // 2. Count unread
        const unread = await notif.countUnread(3);
        console.log('   Unread count: ' + unread);

        // 3. List
        const list = await notif.getUnread(3);
        console.log('   Fetched ' + list.length + ' items');
        list.forEach(n => console.log('   #' + n.notification_id + ' [' + n.notification_type + '] ' + n.title));

        // 4. Mark one read
        console.log('\n2. Mark first as read');
        await notif.markRead(list[0].notification_id);
        console.log('   Unread now: ' + await notif.countUnread(3));

        // 5. Mark all read
        console.log('\n3. Mark all read');
        await notif.markAllRead(3);
        console.log('   Unread now: ' + await notif.countUnread(3));

        // 6. Scheduler tick manually
        console.log('\n4. Run scheduler tick manually');
        await scheduler.tick();
        console.log('   Status: ' + JSON.stringify(scheduler.status()));

        console.log('\n=== TEST COMPLETE ===');
        process.exit(0);
    } catch (err) {
        console.error('TEST FAILED:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
})();
