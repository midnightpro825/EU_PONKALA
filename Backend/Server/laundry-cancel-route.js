// =============================================
// EU PONKALA  Laundry cancel route
// =============================================
const { run, get } = require('./db');

module.exports = function registerLaundryCancel(app) {
    app.put('/api/laundry/orders/:id/cancel', async (req, res) => {
        try {
            const order = await get('SELECT * FROM laundry_orders WHERE id = ?', [req.params.id]);
            if (!order) return res.status(404).json({ status: 'error', message: 'Order not found' });
            if (order.order_status === 'completed') {
                return res.status(400).json({ status: 'error', message: 'Cannot cancel completed order' });
            }
            if (order.order_status === 'cancelled') {
                return res.status(400).json({ status: 'error', message: 'Already cancelled' });
            }
            if (order.provider_id) {
                await run(
                    "UPDATE laundry_providers SET availability_status = 'available', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    [order.provider_id]
                );
            }
            await run(
                "UPDATE laundry_orders SET order_status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                [order.id]
            );
            res.json({ status: 'success', message: 'Order cancelled' });
        } catch (err) {
            res.status(500).json({ status: 'error', message: err.message });
        }
    });
};
