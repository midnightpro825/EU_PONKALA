// =============================================
// EU PONKALA — Seed sample data
// =============================================
const bcrypt = require('bcryptjs');
const { run, get, all, init } = require('./db');

async function seed() {
    await init();

    const existing = await get('SELECT COUNT(*) AS c FROM users');
    if (existing.c > 0) {
        console.log('ℹ️  Database already has users — skipping seed');
        return;
    }

    console.log('🌱 Seeding database...');

    const pw = await bcrypt.hash('password123', 10);

    // ─── Users ───
    const admin = await run(
        `INSERT INTO users (full_name, email, phone, password_hash, user_type) VALUES (?, ?, ?, ?, ?)`,
        ['Admin User', 'admin@euponkala.com', '+260971000000', pw, 'admin']
    );

    const studentUser = await run(
        `INSERT INTO users (full_name, email, phone, password_hash, user_type) VALUES (?, ?, ?, ?, ?)`,
        ['Francis Chilsa', 'francis@example.com', '+260975123456', pw, 'student']
    );

    const landlordUser = await run(
        `INSERT INTO users (full_name, email, phone, password_hash, user_type) VALUES (?, ?, ?, ?, ?)`,
        ['Mr. Banda', 'banda@euponkala.com', '+260971234567', pw, 'landlord']
    );

    // ─── Profiles ───
    await run(
        `INSERT INTO students (user_id, university_id, course, year_of_study) VALUES (?, ?, ?, ?)`,
        [studentUser.lastID, 1, 'Computer Science', 2]
    );

    const landlord = await run(
        `INSERT INTO landlords (user_id, business_name, is_verified, whatsapp_number, verified_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [landlordUser.lastID, 'Banda Properties', 1, '+260971234567']
    );

    // ─── Properties ───
    const p1 = await run(
        `INSERT INTO properties (landlord_id, property_name, description, address, area, city, university_id, latitude, longitude, monthly_price, deposit, is_verified, verification_status, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [landlord.lastID, 'Zeworld Boarding House',
         'Spacious boarding house near Eden University with modern amenities',
         '123 Great East Road', 'Chelstone', 'Lusaka', 1,
         -15.38, 28.33, 1500, 500, 1, 'verified', 1]
    );

    const p2 = await run(
        `INSERT INTO properties (landlord_id, property_name, description, address, area, city, university_id, latitude, longitude, monthly_price, deposit, is_verified, verification_status, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [landlord.lastID, 'Big Brother Boarding House',
         'Comfortable accommodation with great community atmosphere',
         '456 Los Angeles Road', 'Kabulonga', 'Lusaka', 1,
         -15.39, 28.32, 1300, 400, 1, 'verified', 1]
    );

    const p3 = await run(
        `INSERT INTO properties (landlord_id, property_name, description, address, area, city, university_id, latitude, longitude, monthly_price, deposit, is_verified, verification_status, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [landlord.lastID, 'Muzdikazi Boarding House',
         'Affordable housing close to campus',
         '789 Makeni Road', 'Makeni', 'Lusaka', 1,
         -15.37, 28.35, 1400, 0, 0, 'pending', 1]
    );

    // ─── Rooms ───
    const roomData = [
        [p1.lastID, 'Room 1', 'double', 2, 1, 1, 0, 1500, 1],
        [p1.lastID, 'Room 2', 'double', 2, 2, 0, 0, 1500, 1],
        [p1.lastID, 'Room 3', 'shared', 2, 0, 2, 0, 1300, 0],
        [p1.lastID, 'Room 4', 'single', 1, 0, 1, 0, 1800, 1],
        [p2.lastID, 'Room 1', 'double', 2, 2, 0, 0, 1300, 1],
        [p2.lastID, 'Room 2', 'double', 2, 2, 0, 0, 1300, 1],
        [p3.lastID, 'Room 1', 'single', 1, 0, 1, 0, 1400, 0],
        [p3.lastID, 'Room 2', 'shared', 2, 1, 1, 0, 1200, 1]
    ];

    for (const r of roomData) {
        await run(
            `INSERT INTO rooms (property_id, room_name, room_type, capacity, occupied, available, pending, price, has_bathroom, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [...r, r[5] === 0 ? 'full' : 'available']
        );
    }

    // ─── Facilities (attach to properties) ───
    const facilityMap = { 1: [1, 2, 3, 4, 5, 7], 2: [1, 2, 3], 3: [1, 2, 3, 4, 5] };
    for (const [pid, fids] of Object.entries(facilityMap)) {
        for (const fid of fids) {
            await run('INSERT OR IGNORE INTO property_facilities (property_id, facility_id) VALUES (?, ?)', [pid, fid]);
        }
    }

    // ─── Photos (placeholder URLs — real uploads come in Phase 2) ───
    const photoData = [
        [p1.lastID, null, 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=800', 'exterior', 1],
        [p1.lastID, null, 'https://images.unsplash.com/photo-1540518614846-7eded433c457?w=800', 'bedroom', 0],
        [p1.lastID, null, 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=800', 'bathroom', 0],
        [p1.lastID, null, 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800', 'kitchen', 0],
        [p2.lastID, null, 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800', 'exterior', 1],
        [p3.lastID, null, 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800', 'exterior', 1]
    ];
    for (const ph of photoData) {
        await run(
            `INSERT INTO photos (property_id, room_id, url, category, is_primary) VALUES (?, ?, ?, ?, ?)`,
            ph
        );
    }

    // ─── Favourites ───
    await run('INSERT INTO favourites (student_id, property_id) VALUES (?, ?)', [1, p1.lastID]);
    await run('INSERT INTO favourites (student_id, property_id) VALUES (?, ?)', [1, p2.lastID]);

    // ─── Subscription ───
    await run(
        `INSERT INTO subscriptions (landlord_id, plan_id, expiry_date, status) VALUES (?, ?, datetime('now', '+90 days'), 'active')`,
        [landlord.lastID, 1]
    );

    console.log('✅ Seed complete');
    console.log('   Admin:    admin@euponkala.com / password123');
    console.log('   Student:  francis@example.com / password123');
    console.log('   Landlord: banda@euponkala.com / password123');
}

seed().catch(err => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
}).then(() => process.exit(0));