const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '..', '..', 'Database', 'eu_ponkala.db');
const db = new sqlite3.Database(dbPath);

const tables = [
    'service_orders',
    'laundry_order_details',
    'wheelchair_order_details',
    'order_items',
    'order_holds',
    'completion_codes',
    'zones',
    'landmarks',
    'provider_availability',
    'engine_config'
];

db.serialize(() => {
    let i = 0;
    const next = () => {
        if (i >= tables.length) { db.close(); return; }
        const t = tables[i++];
        db.all(`PRAGMA table_info(${t})`, [], (err, cols) => {
            console.log(`\n=== ${t} ===`);
            if (err || !cols.length) { console.log('  (does not exist)'); next(); return; }
            cols.forEach(c => console.log(`  ${c.name}  ${c.type}`));
            next();
        });
    };
    next();
});