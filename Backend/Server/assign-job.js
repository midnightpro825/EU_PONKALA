// =============================================
// EU PONKALA — Auto-assign background job
// Every 60 seconds: find orders needing a provider
// =============================================
const { run, get, all } = require('./db');
const engine = require('./service-engine');

let jobTimer = null;

async function runAssignCycle() {
    try {
        // Find laundry orders in provider_searching / payment_confirmed that have no provider
        const stuck = await all(`
            SELECT * FROM laundry_orders
            WHERE provider_id IS NULL
              AND order_status IN ('requested','payment_confirmed','provider_searching')
            ORDER BY created_at ASC
            LIMIT 10
        `);

        for (const order of stuck) {
            try {
                const provider = await engine.pickProvider('laundry', {
                    cash: order.payment_method === 'cash',
                    commission: order.commission_amount
                });
                if (!provider) continue;

                await run(
                    `UPDATE laundry_orders SET provider_id = ?, order_status = 'provider_assigned', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                    [provider.id, order.id]
                );
                await run(
                    `UPDATE provider_services SET availability_status = 'busy', updated_at = CURRENT_TIMESTAMP
                     WHERE provider_id = ? AND service_type = 'laundry'`,
                    [provider.id]
                );

                // SMS
                const student = await get(`
                    SELECT u.full_name, u.phone FROM students s
                    JOIN users u ON s.user_id = u.user_id WHERE s.student_id = ?
                `, [order.student_id]);

                await engine.sendSms(provider.phone,
                    `NEW LAUNDRY ORDER ${order.order_number}\n` +
                    `Student: ${student ? student.full_name : '—'}\n` +
                    `Phone: ${student ? student.phone : '—'}\n` +
                    `Location: ${order.location}\n` +
                    `Amount: K${order.total_amount} (${order.payment_method})`
                );

                await run(
                    `UPDATE laundry_orders SET order_status = 'provider_contacted', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                    [order.id]
                );

                console.log(`🔁 Auto-assigned laundry order ${order.order_number} → ${provider.provider_code || provider.full_name}`);
            } catch (e) {
                console.error('Auto-assign laundry failed for order', order.id, e.message);
            }
        }

        // Wheelbarrow orders
        const wheelStuck = await all(`
            SELECT * FROM service_orders
            WHERE provider_id IS NULL
              AND service_type = 'wheelbarrow'
              AND order_status IN ('requested','payment_confirmed','provider_searching')
            ORDER BY created_at ASC
            LIMIT 10
        `);

        for (const order of wheelStuck) {
            try {
                const provider = await engine.pickProvider('wheelbarrow', {
                    cash: order.payment_method === 'cash',
                    commission: order.commission
                });
                if (!provider) continue;

                await run(
                    `UPDATE service_orders SET provider_id = ?, order_status = 'provider_assigned', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                    [provider.id, order.id]
                );
                await run(
                    `UPDATE provider_services SET availability_status = 'busy', updated_at = CURRENT_TIMESTAMP
                     WHERE provider_id = ? AND service_type = 'wheelbarrow'`,
                    [provider.id]
                );

                await engine.sendSms(provider.phone,
                    `NEW WHEELBARROW JOB ${order.order_number}\n` +
                    `Pickup: ${order.pickup_location}\n` +
                    `Drop: ${order.destination}\n` +
                    `Price: K${order.price} (${order.payment_method})`
                );

                console.log(`🔁 Auto-assigned wheelbarrow order ${order.order_number} → ${provider.provider_code}`);
            } catch (e) {
                console.error('Auto-assign wheelbarrow failed for order', order.id, e.message);
            }
        }
    } catch (err) {
        console.error('Assign cycle error:', err.message);
    }
}

function startAssignJob() {
    if (jobTimer) return;
    console.log('⏱️  Auto-assign job started (60s cycle)');
    // First run after 10 seconds
    setTimeout(runAssignCycle, 10000);
    jobTimer = setInterval(runAssignCycle, 60000);
}

module.exports = { startAssignJob, runAssignCycle };