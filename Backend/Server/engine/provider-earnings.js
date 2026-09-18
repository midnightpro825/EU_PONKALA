// engine/provider-earnings.js
const db = require('./db');

async function getProviderEarnings(providerId, period) {
    const p = period || 'week';
    let since;
    if (p === 'day')   since = "datetime('now', '-1 day')";
    else if (p === 'week')  since = "datetime('now', '-7 days')";
    else if (p === 'month') since = "datetime('now', '-30 days')";
    else since = "'1970-01-01'";

    const orders = await db.all(
        `SELECT id, order_code, service_type, price, commission, completed_at
         FROM service_orders
         WHERE provider_id = ? AND order_status = 'COMPLETED'
           AND completed_at >= ${since}
         ORDER BY completed_at DESC`,
        [providerId]
    );

    const totalJobs = orders.length;
    const totalGross = orders.reduce((s, o) => s + (Number(o.price) || 0), 0);
    const totalCommission = orders.reduce((s, o) => s + (Number(o.commission) || 0), 0);
    const totalNet = totalGross - totalCommission;

    const laundry = await db.get(
        `SELECT COALESCE(SUM(CASE WHEN txn_type IN ('WELCOME_CREDIT','TOPUP','RELEASE','ADJUSTMENT') THEN amount WHEN txn_type IN ('COMMISSION','HOLD') THEN -amount ELSE 0 END), 0) AS bal
         FROM wallet_transactions WHERE provider_id = ? AND (LOWER(service_type) = 'laundry' OR service_type IS NULL)`,
        [providerId]
    );
    const wheel = await db.get(
        `SELECT COALESCE(SUM(CASE WHEN txn_type IN ('WELCOME_CREDIT','TOPUP','RELEASE','ADJUSTMENT') THEN amount WHEN txn_type IN ('COMMISSION','HOLD') THEN -amount ELSE 0 END), 0) AS bal
         FROM wallet_transactions WHERE provider_id = ? AND (LOWER(service_type) = 'wheelbarrow' OR service_type IS NULL)`,
        [providerId]
    );

    return {
        provider_id: providerId,
        period: p,
        total_jobs: totalJobs,
        total_gross: Number(totalGross.toFixed(2)),
        total_commission: Number(totalCommission.toFixed(2)),
        total_net: Number(totalNet.toFixed(2)),
        wallet: {
            laundry: Number((laundry.bal || 0).toFixed(2)),
            wheelbarrow: Number((wheel.bal || 0).toFixed(2)),
            total: Number(((laundry.bal || 0) + (wheel.bal || 0)).toFixed(2))
        },
        recent_orders: orders.slice(0, 20)
    };
}

async function getAllProvidersEarnings(period) {
    const p = period || 'week';
    let since;
    if (p === 'day')   since = "datetime('now', '-1 day')";
    else if (p === 'week')  since = "datetime('now', '-7 days')";
    else if (p === 'month') since = "datetime('now', '-30 days')";
    else since = "'1970-01-01'";

    const rows = await db.all(
        `SELECT p.id AS provider_id, p.provider_code, p.full_name,
                COUNT(o.id) AS jobs,
                COALESCE(SUM(o.price), 0) AS gross,
                COALESCE(SUM(o.commission), 0) AS commission
         FROM providers p
         LEFT JOIN service_orders o
           ON o.provider_id = p.id
          AND o.order_status = 'COMPLETED'
          AND o.completed_at >= ${since}
         GROUP BY p.id
         ORDER BY gross DESC
         LIMIT 100`
    );
    return rows.map(r => ({
        provider_id: r.provider_id,
        provider_code: r.provider_code,
        full_name: r.full_name,
        jobs: r.jobs || 0,
        gross: Number((r.gross || 0).toFixed(2)),
        commission: Number((r.commission || 0).toFixed(2)),
        net: Number(((r.gross || 0) - (r.commission || 0)).toFixed(2))
    }));
}

module.exports = { getProviderEarnings, getAllProvidersEarnings };
