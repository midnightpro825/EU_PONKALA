// =============================================
// EU PONKALA  Services routes (Wheelbarrow + shared)
// =============================================
const { run, get, all } = require('./db');
const engine = require('./service-engine');

module.exports = function registerServicesRoutes(app, { getStudentId }) {

    //  Public: services list 
    app.get('/api/services', async (req, res) => {
        res.json({
            status: 'success',
            data: [
                { id: 'accommodation', name: 'Accommodation', icon: '', enabled: true },
                { id: 'laundry',       name: 'Laundry',       icon: '', enabled: true },
                { id: 'wheelbarrow',   name: 'Wheelbarrow',   icon: '', enabled: true }
            ]
        });
    });

    //  Wheelbarrow pricing 
    app.get('/api/wheelbarrow/pricing', async (req, res) => {
        const row = await get('SELECT * FROM wheelbarrow_pricing WHERE id = 1');
        res.json({ status: 'success', data: row });
    });

    //  Compute wheelbarrow price 
    app.post('/api/wheelbarrow/quote', async (req, res) => {
        try {
            const { distance_km, wheelbarrow_count, load_size, waiting_min } = req.body;
            const p = await get('SELECT * FROM wheelbarrow_pricing WHERE id = 1');
            let price = p.base_price;
            if (distance_km > 0.5) price += (distance_km - 0.5) * p.per_km_price;
            if (wheelbarrow_count > 1) price += (wheelbarrow_count - 1) * p.per_wheelbarrow_price;
            if (load_size === 'heavy') price += p.heavy_load_surcharge;
            if (waiting_min > p.free_waiting_minutes) {
                price += (waiting_min - p.free_waiting_minutes) * p.waiting_per_min;
            }
            price = +price.toFixed(2);
            res.json({
                status: 'success',
                data: {
                    price,
                    breakdown: {
                        base: p.base_price,
                        distance_charge: distance_km > 0.5 ? +((distance_km - 0.5) * p.per_km_price).toFixed(2) : 0,
                        extra_wheelbarrows: wheelbarrow_count > 1 ? +((wheelbarrow_count - 1) * p.per_wheelbarrow_price).toFixed(2) : 0,
                        heavy_load: load_size === 'heavy' ? p.heavy_load_surcharge : 0,
                        waiting: waiting_min > p.free_waiting_minutes ? +((waiting_min - p.free_waiting_minutes) * p.waiting_per_min).toFixed(2) : 0
                    }
                }
            });
        } catch (err) {
            res.status(500).json({ status: 'error', message: err.message });
        }
    });

    //  Create wheelbarrow order 
    app.post('/api/wheelbarrow/orders', async (req, res) => {
        try {
            const {
                student_user_id, pickup_location, destination,
                load_size, wheelbarrow_count, payment_method,
                distance_km, special_instructions
            } = req.body;

            const studentId = await getStudentId(student_user_id);
            if (!studentId) return res.status(404).json({ status: 'error', message: 'Student not found' });

            const p = await get('SELECT * FROM wheelbarrow_pricing WHERE id = 1');
            let price = p.base_price;
            if (distance_km > 0.5) price += (distance_km - 0.5) * p.per_km_price;
            const wb = wheelbarrow_count || 1;
            if (wb > 1) price += (wb - 1) * p.per_wheelbarrow_price;
            if (load_size === 'heavy') price += p.heavy_load_surcharge;
            price = +price.toFixed(2);

            const rate = 0.20;
            const commission = +(price * rate).toFixed(2);
            const providerAmount = +(price - commission).toFixed(2);

            const orderNumber = await engine.generateServiceOrderNumber('wheelbarrow');
            const completionCode = await engine.generateCompletionCode();

            const r = await run(
                `INSERT INTO service_orders
                 (order_number, service_type, customer_user_id, payment_method, payment_status, order_status,
                  price, commission, provider_amount, pickup_location, destination, load_size,
                  wheelbarrow_count, special_instructions, completion_code)
                 VALUES (?, 'wheelbarrow', ?, ?, 'pending', 'requested', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [orderNumber, studentId, payment_method || 'cash',
                 price, commission, providerAmount,
                 pickup_location, destination, load_size || 'normal',
                 wb, special_instructions || null, completionCode]
            );

            res.status(201).json({
                status: 'success',
                data: await get('SELECT * FROM service_orders WHERE id = ?', [r.lastID])
            });
        } catch (err) {
            res.status(500).json({ status: 'error', message: err.message });
        }
    });

    //  Assign wheelbarrow provider 
    app.post('/api/wheelbarrow/orders/:id/assign', async (req, res) => {
        try {
            const order = await get('SELECT * FROM service_orders WHERE id = ?', [req.params.id]);
            if (!order) return res.status(404).json({ status: 'error', message: 'Order not found' });
            if (order.provider_id) return res.status(400).json({ status: 'error', message: 'Already assigned' });

            const cash = order.payment_method === 'cash';
            const provider = await engine.pickProvider('wheelbarrow', { cash, commission: order.commission });
            if (!provider) return res.status(404).json({ status: 'error', message: 'No available wheelbarrow operators' });

            await run(
                `UPDATE service_orders SET provider_id = ?, order_status = 'provider_assigned', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [provider.id, order.id]
            );
            await run(
                `UPDATE provider_services SET availability_status = 'busy', updated_at = CURRENT_TIMESTAMP
                 WHERE provider_id = ? AND service_type = 'wheelbarrow'`,
                [provider.id]
            );

            // SMS to provider
            await engine.sendSms(provider.phone,
                `NEW WHEELBARROW JOB ${order.order_number}\n` +
                `Pickup: ${order.pickup_location}\n` +
                `Drop: ${order.destination}\n` +
                `Price: K${order.price} (${order.payment_method})\n` +
                `Please contact the student.`
            );

            res.json({
                status: 'success',
                data: {
                    order: await get('SELECT * FROM service_orders WHERE id = ?', [order.id]),
                    provider: {
                        id: provider.id,
                        provider_code: provider.provider_code,
                        name: provider.full_name,
                        phone: provider.phone
                    }
                }
            });
        } catch (err) {
            res.status(500).json({ status: 'error', message: err.message });
        }
    });

    //  Complete wheelbarrow order 
    app.put('/api/wheelbarrow/orders/:id/complete', async (req, res) => {
        try {
            const { code } = req.body;
            const order = await get('SELECT * FROM service_orders WHERE id = ?', [req.params.id]);
            if (!order) return res.status(404).json({ status: 'error', message: 'Order not found' });
            if (order.order_status === 'completed') return res.status(400).json({ status: 'error', message: 'Already completed' });
            if (String(order.completion_code) !== String(code)) return res.status(400).json({ status: 'error', message: 'Invalid code' });

            await run(
                `UPDATE service_orders SET order_status = 'completed', completion_status = 'used',
                 payment_status = CASE WHEN payment_method = 'cash' THEN 'confirmed' ELSE payment_status END,
                 updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [order.id]
            );

            if (order.provider_id && order.payment_method === 'cash') {
                await engine.deductCommission(order.provider_id, 'wheelbarrow', order.commission, order.id, 'Wheelbarrow cash ' + order.order_number);
            }

            if (order.provider_id) {
                await run(
                    `UPDATE provider_services SET availability_status = 'available', updated_at = CURRENT_TIMESTAMP
                     WHERE provider_id = ? AND service_type = 'wheelbarrow'`,
                    [order.provider_id]
                );
            }

            res.json({ status: 'success', message: 'Wheelbarrow order completed',
                       data: await get('SELECT * FROM service_orders WHERE id = ?', [order.id]) });
        } catch (err) {
            res.status(500).json({ status: 'error', message: err.message });
        }
    });

    //  Student: my wheelbarrow orders 
    app.get('/api/wheelbarrow/orders/:userId', async (req, res) => {
        try {
            const studentId = await getStudentId(req.params.userId);
            if (!studentId) return res.status(404).json({ status: 'error', message: 'Student not found' });
            const orders = await all(
                `SELECT * FROM service_orders WHERE customer_user_id = ? AND service_type = 'wheelbarrow'
                 ORDER BY created_at DESC`,
                [studentId]
            );
            res.json({ status: 'success', data: orders });
        } catch (err) {
            res.status(500).json({ status: 'error', message: err.message });
        }
    });

    //  Admin: wheelbarrow pricing 
    app.put('/api/admin/wheelbarrow/pricing', async (req, res) => {
        try {
            const fields = ['base_price','per_km_price','per_wheelbarrow_price','heavy_load_surcharge','waiting_per_min','free_waiting_minutes'];
            const updates = [];
            const params = [];
            for (const f of fields) {
                if (req.body[f] !== undefined) {
                    updates.push(f + ' = ?');
                    params.push(req.body[f]);
                }
            }
            if (!updates.length) return res.status(400).json({ status: 'error', message: 'No fields' });
            params.push(1);
            await run(`UPDATE wheelbarrow_pricing SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params);
            res.json({ status: 'success', data: await get('SELECT * FROM wheelbarrow_pricing WHERE id = 1') });
        } catch (err) {
            res.status(500).json({ status: 'error', message: err.message });
        }
    });

    //  Admin: providers registry 
    app.get('/api/admin/providers', async (req, res) => {
        try {
            const providers = await all('SELECT * FROM providers ORDER BY created_at DESC');
            for (const p of providers) {
                p.services = await all('SELECT * FROM provider_services WHERE provider_id = ?', [p.id]);
            }
            res.json({ status: 'success', data: providers });
        } catch (err) {
            res.status(500).json({ status: 'error', message: err.message });
        }
    });

    //  Provider registration (shared engine) 
    app.post('/api/providers/register', async (req, res) => {
        try {
            const { full_name, nrc, phone, mobile_money_number, phone_type, services, service_area, location } = req.body;
            if (!full_name || !phone || !services || !services.length) {
                return res.status(400).json({ status: 'error', message: 'Name, phone and at least one service required' });
            }

            const existing = await get('SELECT id FROM providers WHERE phone = ?', [phone]);
            if (existing) return res.status(400).json({ status: 'error', message: 'Phone already registered' });

            const provider_code = await engine.generateProviderCode(full_name);
            const otp = String(Math.floor(100000 + Math.random() * 900000));
            const otpExpires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

            const r = await run(
                `INSERT INTO providers
                 (provider_code, full_name, nrc, phone, mobile_money_number, phone_type,
                  otp_code, otp_expires_at, location, verification_status, account_status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending')`,
                [provider_code, full_name, nrc || null, phone, mobile_money_number || phone,
                 phone_type || 'smartphone', otp, otpExpires, location || null]
            );
            const providerId = r.lastID;

            // Add each service
            for (const svc of services) {
                await run(
                    `INSERT INTO provider_services
                     (provider_id, service_type, availability_status, cash_eligible, service_area)
                     VALUES (?, ?, 'offline', 1, ?)`,
                    [providerId, svc, service_area || location || null]
                );
                await engine.grantWelcomeCredit(providerId, svc, 60);
            }

            // Send OTP via SMS
            await engine.sendSms(phone, `EU PONKALA verification code: ${otp}\nValid for 10 minutes. Do not share.`);

            res.status(201).json({
                status: 'success',
                message: 'Registered. Check SMS for OTP.',
                data: { provider_id: providerId, provider_code, phone }
            });
        } catch (err) {
            res.status(500).json({ status: 'error', message: err.message });
        }
    });

    //  Provider OTP verify 
    app.post('/api/providers/verify-otp', async (req, res) => {
        try {
            const { provider_id, otp } = req.body;
            const p = await get('SELECT * FROM providers WHERE id = ?', [provider_id]);
            if (!p) return res.status(404).json({ status: 'error', message: 'Provider not found' });
            if (p.otp_code !== otp) return res.status(400).json({ status: 'error', message: 'Invalid OTP' });
            if (new Date(p.otp_expires_at) < new Date()) return res.status(400).json({ status: 'error', message: 'OTP expired' });

            await run(
                `UPDATE providers SET sim_verified_at = CURRENT_TIMESTAMP, otp_code = NULL, otp_expires_at = NULL,
                 verification_status = 'verified', account_status = 'active', approved_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [provider_id]
            );

            res.json({ status: 'success', message: 'SIM verified. Set your PIN to complete registration.',
                       data: { next_step: 'set_pin', provider_id } });
        } catch (err) {
            res.status(500).json({ status: 'error', message: err.message });
        }
    });

    //  Provider set PIN 
    app.post('/api/providers/set-pin', async (req, res) => {
        try {
            const { provider_id, pin } = req.body;
            if (!pin || pin.length < 4) return res.status(400).json({ status: 'error', message: 'PIN must be  4 digits' });
            await run('UPDATE providers SET pin_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [pin, provider_id]);
            res.json({ status: 'success', message: 'PIN set. You can now log in.' });
        } catch (err) {
            res.status(500).json({ status: 'error', message: err.message });
        }
    });

    //  Provider login (phone + PIN) 
    app.post('/api/providers/login', async (req, res) => {
        try {
            const { phone, pin } = req.body;
            const p = await get('SELECT * FROM providers WHERE phone = ?', [phone]);
            if (!p) return res.status(404).json({ status: 'error', message: 'No provider with that phone' });
            if (p.pin_hash !== pin) return res.status(401).json({ status: 'error', message: 'Invalid PIN' });
            if (p.account_status !== 'active') return res.status(403).json({ status: 'error', message: 'Account not active' });

            const services = await all('SELECT * FROM provider_services WHERE provider_id = ?', [p.id]);
            res.json({ status: 'success', data: { ...p, services } });
        } catch (err) {
            res.status(500).json({ status: 'error', message: err.message });
        }
    });

    //  Provider: set service availability 
    app.put('/api/providers/:id/services/:serviceType/availability', async (req, res) => {
        try {
            const { id, serviceType } = req.params;
            const { availability_status, cash_eligible } = req.body;
            const fields = [];
            const params = [];
            if (availability_status) { fields.push('availability_status = ?'); params.push(availability_status); }
            if (cash_eligible !== undefined) { fields.push('cash_eligible = ?'); params.push(cash_eligible ? 1 : 0); }
            if (!fields.length) return res.status(400).json({ status: 'error', message: 'No fields' });
            params.push(id, serviceType);
            await run(
                `UPDATE provider_services SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
                 WHERE provider_id = ? AND service_type = ?`,
                params
            );
            res.json({ status: 'success', data: await get('SELECT * FROM provider_services WHERE provider_id = ? AND service_type = ?', [id, serviceType]) });
        } catch (err) {
            res.status(500).json({ status: 'error', message: err.message });
        }
    });

    console.log('  Services routes loaded (Wheelbarrow + Provider engine)');
};
