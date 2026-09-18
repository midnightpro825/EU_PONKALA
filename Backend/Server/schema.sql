-- ═══════════════════════════════════════════════════════
--  EU PONKALA — Database Schema v2
-- ═══════════════════════════════════════════════════════

-- ─── Users ───
CREATE TABLE IF NOT EXISTS users (
    user_id       SERIAL PRIMARY KEY,
    full_name     TEXT NOT NULL,
    email         TEXT UNIQUE NOT NULL,
    phone         TEXT,
    password_hash TEXT NOT NULL,
    user_type     TEXT CHECK(user_type IN ('student','landlord','admin')) NOT NULL,
    profile_photo TEXT,
    is_active     BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMP DEFAULT NOW()
);

-- ─── Student profiles ───
CREATE TABLE IF NOT EXISTS students (
    student_id     SERIAL PRIMARY KEY,
    user_id        INTEGER UNIQUE NOT NULL,
    university_id  INTEGER,
    course         TEXT,
    year_of_study  INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- ─── Landlord profiles ───
CREATE TABLE IF NOT EXISTS landlords (
    landlord_id     SERIAL PRIMARY KEY,
    user_id         INTEGER UNIQUE NOT NULL,
    business_name   TEXT,
    tin_number      TEXT,
    is_verified     BOOLEAN DEFAULT FALSE,
    whatsapp_number TEXT,
    verified_at     TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- ─── Universities ───
CREATE TABLE IF NOT EXISTS universities (
    university_id SERIAL PRIMARY KEY,
    name          TEXT NOT NULL,
    code          TEXT UNIQUE,
    city          TEXT,
    country       TEXT DEFAULT 'Zambia',
    latitude      NUMERIC(12,2),
    longitude     NUMERIC(12,2),
    is_active     BOOLEAN DEFAULT TRUE
);

-- ─── Properties ───
CREATE TABLE IF NOT EXISTS properties (
    property_id         SERIAL PRIMARY KEY,
    landlord_id         INTEGER NOT NULL,
    property_name       TEXT NOT NULL,
    description         TEXT,
    property_type       TEXT DEFAULT 'boarding_house',
    address             TEXT NOT NULL,
    area                TEXT,
    city                TEXT DEFAULT 'Lusaka',
    university_id       INTEGER,
    latitude            NUMERIC(12,2),
    longitude           NUMERIC(12,2),
    monthly_price       NUMERIC(12,2) NOT NULL,
    semester_price      NUMERIC(12,2),
    deposit             NUMERIC(12,2) DEFAULT 0,
    other_charges       TEXT,
    is_verified         BOOLEAN DEFAULT FALSE,
    verification_status TEXT DEFAULT 'pending',
    is_active           BOOLEAN DEFAULT TRUE,
    is_full             BOOLEAN DEFAULT FALSE,
    view_count          BOOLEAN DEFAULT FALSE,
    save_count          BOOLEAN DEFAULT FALSE,
    inquiry_count       BOOLEAN DEFAULT FALSE,
    created_at          TIMESTAMP DEFAULT NOW(),
    updated_at          TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (landlord_id) REFERENCES landlords(landlord_id) ON DELETE CASCADE,
    FOREIGN KEY (university_id) REFERENCES universities(university_id)
);

-- ─── Rooms ───
CREATE TABLE IF NOT EXISTS rooms (
    room_id       SERIAL PRIMARY KEY,
    property_id   INTEGER NOT NULL,
    room_name     TEXT NOT NULL,
    room_type     TEXT CHECK(room_type IN ('single','double','shared')) DEFAULT 'double',
    capacity      INTEGER DEFAULT 2,
    occupied      BOOLEAN DEFAULT FALSE,
    available     INTEGER DEFAULT 2,
    pending       BOOLEAN DEFAULT FALSE,
    price         NUMERIC(12,2) DEFAULT 0,
    has_bathroom  BOOLEAN DEFAULT FALSE,
    notes         TEXT,
    status        TEXT CHECK(status IN ('available','pending','full','inactive')) DEFAULT 'available',
    last_updated  TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (property_id) REFERENCES properties(property_id) ON DELETE CASCADE
);

-- ─── Facilities (master) ───
CREATE TABLE IF NOT EXISTS facilities (
    facility_id   SERIAL PRIMARY KEY,
    facility_name TEXT UNIQUE NOT NULL,
    icon          TEXT
);

-- ─── Property ↔ Facilities ───
CREATE TABLE IF NOT EXISTS property_facilities (
    property_id INTEGER NOT NULL,
    facility_id INTEGER NOT NULL,
    PRIMARY KEY (property_id, facility_id),
    FOREIGN KEY (property_id) REFERENCES properties(property_id) ON DELETE CASCADE,
    FOREIGN KEY (facility_id) REFERENCES facilities(facility_id) ON DELETE CASCADE
);

-- ─── Photos (property-level + room-level + category) ───
CREATE TABLE IF NOT EXISTS photos (
    photo_id    SERIAL PRIMARY KEY,
    property_id INTEGER NOT NULL,
    room_id     INTEGER,
    url         TEXT NOT NULL,
    category    TEXT DEFAULT 'other',
    caption     TEXT,
    is_primary  BOOLEAN DEFAULT FALSE,
    uploaded_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (property_id) REFERENCES properties(property_id) ON DELETE CASCADE,
    FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE
);

-- ─── Favourites ───
CREATE TABLE IF NOT EXISTS favourites (
    favourite_id SERIAL PRIMARY KEY,
    student_id   INTEGER NOT NULL,
    property_id  INTEGER NOT NULL,
    saved_at     TIMESTAMP DEFAULT NOW(),
    UNIQUE(student_id, property_id),
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
    FOREIGN KEY (property_id) REFERENCES properties(property_id) ON DELETE CASCADE
);

-- ─── Conversations ───
CREATE TABLE IF NOT EXISTS conversations (
    conversation_id SERIAL PRIMARY KEY,
    student_id      INTEGER NOT NULL,
    landlord_id     INTEGER NOT NULL,
    property_id     INTEGER,
    subject         TEXT,
    created_at      TIMESTAMP DEFAULT NOW(),
    last_message_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
    FOREIGN KEY (landlord_id) REFERENCES landlords(landlord_id) ON DELETE CASCADE,
    FOREIGN KEY (property_id) REFERENCES properties(property_id) ON DELETE SET NULL
);

-- ─── Messages ───
CREATE TABLE IF NOT EXISTS messages (
    message_id      SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL,
    sender_user_id  INTEGER NOT NULL,
    body            TEXT NOT NULL,
    is_read         BOOLEAN DEFAULT FALSE,
    sent_at         TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id) ON DELETE CASCADE,
    FOREIGN KEY (sender_user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- ─── Inquiries (lightweight, from property card "Contact") ───
CREATE TABLE IF NOT EXISTS inquiries (
    inquiry_id   SERIAL PRIMARY KEY,
    student_id   INTEGER NOT NULL,
    landlord_id  INTEGER NOT NULL,
    property_id  INTEGER NOT NULL,
    message      TEXT NOT NULL,
    status       TEXT DEFAULT 'new',
    created_at   TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
    FOREIGN KEY (landlord_id) REFERENCES landlords(landlord_id) ON DELETE CASCADE,
    FOREIGN KEY (property_id) REFERENCES properties(property_id) ON DELETE CASCADE
);

-- ─── Subscription plans ───
CREATE TABLE IF NOT EXISTS subscription_plans (
    plan_id       SERIAL PRIMARY KEY,
    plan_name     TEXT NOT NULL,
    plan_type     TEXT DEFAULT 'standard',
    price         NUMERIC(12,2) NOT NULL,
    duration_days INTEGER NOT NULL,
    features      TEXT
);

-- ─── Subscriptions ───
CREATE TABLE IF NOT EXISTS subscriptions (
    subscription_id SERIAL PRIMARY KEY,
    landlord_id     INTEGER NOT NULL,
    plan_id         INTEGER NOT NULL,
    start_date      TIMESTAMP DEFAULT NOW(),
    expiry_date     TIMESTAMP NOT NULL,
    status          TEXT DEFAULT 'active',
    auto_renew      BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (landlord_id) REFERENCES landlords(landlord_id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES subscription_plans(plan_id)
);

-- ─── Payments ───
CREATE TABLE IF NOT EXISTS payments (
    payment_id      SERIAL PRIMARY KEY,
    subscription_id INTEGER NOT NULL,
    transaction_id  TEXT UNIQUE,
    amount          NUMERIC(12,2) NOT NULL,
    currency        TEXT DEFAULT 'ZMW',
    provider        TEXT,
    payment_status  TEXT DEFAULT 'pending',
    payment_date    TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(subscription_id) ON DELETE CASCADE
);

-- ─── Notifications ───
CREATE TABLE IF NOT EXISTS notifications (
    notification_id SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL,
    type            TEXT,
    title           TEXT,
    body            TEXT,
    link            TEXT,
    is_read         BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- ─── Reports ───
CREATE TABLE IF NOT EXISTS reports (
    report_id   SERIAL PRIMARY KEY,
    reporter_id INTEGER NOT NULL,
    property_id INTEGER,
    landlord_id INTEGER,
    type        TEXT,
    description TEXT,
    status      TEXT DEFAULT 'pending',
    created_at  TIMESTAMP DEFAULT NOW(),
    resolved_at TIMESTAMP,
    FOREIGN KEY (reporter_id) REFERENCES users(user_id),
    FOREIGN KEY (property_id) REFERENCES properties(property_id)
);

-- ─── Audit log ───
CREATE TABLE IF NOT EXISTS audit_logs (
    log_id      SERIAL PRIMARY KEY,
    user_id     INTEGER,
    action      TEXT NOT NULL,
    entity_type TEXT,
    entity_id   INTEGER,
    details     TEXT,
    created_at  TIMESTAMP DEFAULT NOW()
);

-- ─── Reviews ───
CREATE TABLE IF NOT EXISTS reviews (
    review_id   SERIAL PRIMARY KEY,
    student_id  INTEGER NOT NULL,
    property_id INTEGER NOT NULL,
    rating      INTEGER CHECK(rating BETWEEN 1 AND 5),
    comment     TEXT,
    created_at  TIMESTAMP DEFAULT NOW(),
    UNIQUE(student_id, property_id),
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
    FOREIGN KEY (property_id) REFERENCES properties(property_id) ON DELETE CASCADE
);

-- ─── Indexes for performance ───
CREATE INDEX IF NOT EXISTS idx_prop_landlord   ON properties(landlord_id);
CREATE INDEX IF NOT EXISTS idx_prop_university ON properties(university_id);
CREATE INDEX IF NOT EXISTS idx_prop_status     ON properties(verification_status);
CREATE INDEX IF NOT EXISTS idx_rooms_prop      ON rooms(property_id);
CREATE INDEX IF NOT EXISTS idx_photos_prop     ON photos(property_id);
CREATE INDEX IF NOT EXISTS idx_photos_room     ON photos(room_id);
CREATE INDEX IF NOT EXISTS idx_msg_conv        ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_student    ON conversations(student_id);
CREATE INDEX IF NOT EXISTS idx_conv_landlord   ON conversations(landlord_id);
CREATE INDEX IF NOT EXISTS idx_notif_user      ON notifications(user_id);

-- ─── Seed: Universities ───
INSERT INTO universities (university_id, name, code, city, country, latitude, longitude)
VALUES (1, 'Eden University', 'EDEN', 'Lusaka', 'Zambia', -15.3875, 28.3228);

-- ─── Seed: Facilities ───
INSERT INTO facilities (facility_name, icon) VALUES
    ('Wi-Fi', 'wifi'),
    ('Electricity', 'bolt'),
    ('Water', 'water'),
    ('Security', 'shield-alt'),
    ('Kitchen', 'utensils'),
    ('Laundry', 'tshirt'),
    ('Parking', 'parking'),
    ('Furnished', 'bed'),
    ('Study Area', 'book'),
    ('Generator', 'plug'),
    ('Borehole', 'tint');

-- ─── Seed: Subscription plans ───
INSERT INTO subscription_plans (plan_name, plan_type, price, duration_days, features)
VALUES
    ('Landlord Standard', 'standard', 300, 90, 'List up to 10 properties, basic analytics, inquiries'),
    ('Landlord Premium', 'premium', 500, 90, 'Featured listings, advanced analytics, priority support');
-- ═══════════════════════════════════════════════════════
--  LAUNDRY MODULE (added Batch 1)
-- ═══════════════════════════════════════════════════════

-- Laundry providers
CREATE TABLE IF NOT EXISTS laundry_providers (
    id                      SERIAL PRIMARY KEY,
    user_id                 INTEGER,
    name                    TEXT NOT NULL,
    phone                   TEXT NOT NULL,
    mobile_money_number     TEXT,
    location                TEXT,
    service_area            TEXT,
    verification_status     TEXT DEFAULT 'pending',   -- pending | verified | suspended | inactive
    availability_status     TEXT DEFAULT 'offline',   -- available | busy | offline
    cash_eligible           BOOLEAN DEFAULT FALSE,
    wallet_balance          NUMERIC(12,2) DEFAULT 0,
    notes                   TEXT,
    created_at              TIMESTAMP DEFAULT NOW(),
    updated_at              TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
);

-- Student access subscriptions (K50 = 4 connections)
CREATE TABLE IF NOT EXISTS laundry_access_subscriptions (
    id                     SERIAL PRIMARY KEY,
    student_id             INTEGER NOT NULL,
    package_price          NUMERIC(12,2) NOT NULL DEFAULT 50,
    connections_purchased  INTEGER NOT NULL DEFAULT 4,
    connections_remaining  INTEGER NOT NULL DEFAULT 4,
    status                 TEXT DEFAULT 'active',     -- active | exhausted | expired
    payment_method         TEXT,
    payment_reference      TEXT,
    purchased_at           TIMESTAMP DEFAULT NOW(),
    expires_at             TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE
);

-- Laundry orders
CREATE TABLE IF NOT EXISTS laundry_orders (
    id                      SERIAL PRIMARY KEY,
    order_number            TEXT UNIQUE NOT NULL,
    student_id              INTEGER NOT NULL,
    provider_id             INTEGER,
    payment_method          TEXT,                     -- mobile_money | cash
    payment_status          TEXT DEFAULT 'pending',   -- pending | confirmed | failed | refunded
    order_status            TEXT DEFAULT 'requested', -- see spec section 23
    subtotal                NUMERIC(12,2) DEFAULT 0,
    total_amount            NUMERIC(12,2) DEFAULT 0,
    commission_amount       NUMERIC(12,2) DEFAULT 0,
    provider_amount         NUMERIC(12,2) DEFAULT 0,
    location                TEXT,
    location_lat            NUMERIC(12,2),
    location_lng            NUMERIC(12,2),
    completion_code         TEXT,
    completion_code_status  TEXT DEFAULT 'unused',    -- unused | used | expired
    connection_consumed     BOOLEAN DEFAULT FALSE,
    notes                   TEXT,
    created_at              TIMESTAMP DEFAULT NOW(),
    updated_at              TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
    FOREIGN KEY (provider_id) REFERENCES laundry_providers(id) ON DELETE SET NULL
);

-- Order line items
CREATE TABLE IF NOT EXISTS laundry_order_items (
    id          SERIAL PRIMARY KEY,
    order_id    INTEGER NOT NULL,
    item_type   TEXT NOT NULL,
    quantity    INTEGER NOT NULL DEFAULT 1,
    unit_price  NUMERIC(12,2) NOT NULL,
    subtotal    NUMERIC(12,2) NOT NULL,
    FOREIGN KEY (order_id) REFERENCES laundry_orders(id) ON DELETE CASCADE
);

-- Configurable item prices
CREATE TABLE IF NOT EXISTS laundry_items (
    id          SERIAL PRIMARY KEY,
    item_type   TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    unit_price  NUMERIC(12,2) NOT NULL,
    is_active   BOOLEAN DEFAULT TRUE,
    updated_at  TIMESTAMP DEFAULT NOW()
);

-- Commission wallet ledger (append-only)
CREATE TABLE IF NOT EXISTS commission_wallet_transactions (
    id              SERIAL PRIMARY KEY,
    provider_id     INTEGER NOT NULL,
    order_id        INTEGER,
    transaction_type TEXT NOT NULL,                    -- topup | commission | adjustment | refund
    amount          NUMERIC(12,2) NOT NULL,
    balance_before  NUMERIC(12,2) NOT NULL,
    balance_after   NUMERIC(12,2) NOT NULL,
    reference       TEXT,
    created_at      TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (provider_id) REFERENCES laundry_providers(id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES laundry_orders(id) ON DELETE SET NULL
);

-- Laundry payment records
CREATE TABLE IF NOT EXISTS laundry_payments (
    id                      SERIAL PRIMARY KEY,
    order_id                INTEGER NOT NULL,
    student_id              INTEGER NOT NULL,
    provider_id             INTEGER,
    amount                  NUMERIC(12,2) NOT NULL,
    method                  TEXT NOT NULL,
    external_transaction_id TEXT,
    status                  TEXT DEFAULT 'pending',
    notes                   TEXT,
    created_at              TIMESTAMP DEFAULT NOW(),
    updated_at              TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (order_id) REFERENCES laundry_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE
);

-- Admin-configurable settings
CREATE TABLE IF NOT EXISTS laundry_settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TIMESTAMP DEFAULT NOW()
);

-- SMS outbox (basic-phone providers)
CREATE TABLE IF NOT EXISTS laundry_sms_outbox (
    id          SERIAL PRIMARY KEY,
    recipient   TEXT NOT NULL,
    message     TEXT NOT NULL,
    status      TEXT DEFAULT 'queued',                 -- queued | sent | failed
    provider    TEXT DEFAULT 'stub',
    created_at  TIMESTAMP DEFAULT NOW(),
    sent_at     TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_laundry_orders_student  ON laundry_orders(student_id);
CREATE INDEX IF NOT EXISTS idx_laundry_orders_provider ON laundry_orders(provider_id);
CREATE INDEX IF NOT EXISTS idx_laundry_orders_status   ON laundry_orders(order_status);
CREATE INDEX IF NOT EXISTS idx_laundry_access_student  ON laundry_access_subscriptions(student_id);
CREATE INDEX IF NOT EXISTS idx_laundry_wallet_provider ON commission_wallet_transactions(provider_id);

-- 
--  SHARED SERVICE PROVIDER ENGINE
-- 

-- Master provider account
CREATE TABLE IF NOT EXISTS providers (
    id                  SERIAL PRIMARY KEY,
    provider_code       TEXT UNIQUE NOT NULL,
    full_name           TEXT NOT NULL,
    nrc                 TEXT,
    phone               TEXT UNIQUE NOT NULL,
    mobile_money_number TEXT,
    pin_hash            TEXT,
    phone_type          TEXT DEFAULT 'smartphone',
    verification_status TEXT DEFAULT 'pending',
    account_status      TEXT DEFAULT 'pending',
    otp_code            TEXT,
    otp_expires_at      TIMESTAMP,
    sim_verified_at     TIMESTAMP,
    approved_at         TIMESTAMP,
    location            TEXT,
    latitude            NUMERIC(12,2),
    longitude           NUMERIC(12,2),
    notes               TEXT,
    created_at          TIMESTAMP DEFAULT NOW(),
    updated_at          TIMESTAMP DEFAULT NOW()
);

-- Services each provider offers (with per-service availability + wallet)
CREATE TABLE IF NOT EXISTS provider_services (
    id                  SERIAL PRIMARY KEY,
    provider_id         INTEGER NOT NULL,
    service_type        TEXT NOT NULL,
    availability_status TEXT DEFAULT 'offline',
    cash_eligible       BOOLEAN DEFAULT FALSE,
    wallet_balance      NUMERIC(12,2) DEFAULT 0,
    welcome_credit      NUMERIC(12,2) DEFAULT 0,
    welcome_credit_used NUMERIC(12,2) DEFAULT 0,
    service_area        TEXT,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT NOW(),
    updated_at          TIMESTAMP DEFAULT NOW(),
    UNIQUE(provider_id, service_type),
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
);

-- Welcome credit ledger
CREATE TABLE IF NOT EXISTS welcome_credits (
    id              SERIAL PRIMARY KEY,
    provider_id     INTEGER NOT NULL,
    service_type    TEXT NOT NULL,
    amount          NUMERIC(12,2) NOT NULL,
    used            NUMERIC(12,2) DEFAULT 0,
    remaining       NUMERIC(12,2) NOT NULL,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
);

-- Wallet transactions ledger
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id              SERIAL PRIMARY KEY,
    provider_id     INTEGER NOT NULL,
    service_type    TEXT NOT NULL,
    order_id        INTEGER,
    txn_type        TEXT NOT NULL,
    amount          NUMERIC(12,2) NOT NULL,
    balance_before  NUMERIC(12,2) NOT NULL,
    balance_after   NUMERIC(12,2) NOT NULL,
    reference       TEXT,
    created_at      TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
);

-- Generic orders table (works for laundry, wheelbarrow, future services)
CREATE TABLE IF NOT EXISTS service_orders (
    id                  SERIAL PRIMARY KEY,
    order_number        TEXT UNIQUE NOT NULL,
    service_type        TEXT NOT NULL,
    customer_user_id    INTEGER NOT NULL,
    provider_id         INTEGER,
    payment_method      TEXT DEFAULT 'mobile_money',
    payment_status      TEXT DEFAULT 'pending',
    order_status        TEXT DEFAULT 'requested',
    price               NUMERIC(12,2) DEFAULT 0,
    commission          NUMERIC(12,2) DEFAULT 0,
    provider_amount     NUMERIC(12,2) DEFAULT 0,
    pickup_location     TEXT,
    destination         TEXT,
    load_size           TEXT,
    wheelbarrow_count   BOOLEAN DEFAULT TRUE,
    special_instructions TEXT,
    completion_code     TEXT,
    completion_status   TEXT DEFAULT 'unused',
    connection_consumed BOOLEAN DEFAULT FALSE,
    created_at          TIMESTAMP DEFAULT NOW(),
    updated_at          TIMESTAMP DEFAULT NOW()
);

-- Wheelbarrow pricing (admin-configurable)
CREATE TABLE IF NOT EXISTS wheelbarrow_pricing (
    id                    SERIAL PRIMARY KEY CHECK (id = 1),
    base_price            NUMERIC(12,2) DEFAULT 15,
    per_km_price          NUMERIC(12,2) DEFAULT 5,
    per_wheelbarrow_price NUMERIC(12,2) DEFAULT 10,
    heavy_load_surcharge  NUMERIC(12,2) DEFAULT 5,
    waiting_per_min       NUMERIC(12,2) DEFAULT 2,
    free_waiting_minutes  INTEGER DEFAULT 10,
    updated_at            TIMESTAMP DEFAULT NOW()
);

INSERT INTO wheelbarrow_pricing (id) VALUES (1);

-- 
--  PROVIDER REGISTRATION + RATINGS + TOP-UPS
-- 

-- Provider ratings (one per completed order, per student)
CREATE TABLE IF NOT EXISTS provider_ratings (
    id              SERIAL PRIMARY KEY,
    provider_id     INTEGER NOT NULL,
    service_type    TEXT NOT NULL,
    order_id        INTEGER,
    student_user_id INTEGER NOT NULL,
    rating          INTEGER CHECK(rating BETWEEN 1 AND 5),
    comment         TEXT,
    created_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE(provider_id, order_id, student_user_id),
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
);

-- Provider top-up history (before wallet credit)
CREATE TABLE IF NOT EXISTS provider_topups (
    id                  SERIAL PRIMARY KEY,
    provider_id         INTEGER NOT NULL,
    service_type        TEXT NOT NULL,
    amount              NUMERIC(12,2) NOT NULL,
    method              TEXT DEFAULT 'mobile_money',
    phone_number        TEXT,
    reference           TEXT UNIQUE,
    status              TEXT DEFAULT 'pending',
    credited_at         TIMESTAMP,
    created_at          TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
);

-- Notification queue (for future SMS/push)
CREATE TABLE IF NOT EXISTS notifications_queue (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER,
    channel     TEXT DEFAULT 'in_app',
    title       TEXT,
    body        TEXT,
    payload     TEXT,
    status      TEXT DEFAULT 'pending',
    created_at  TIMESTAMP DEFAULT NOW()
);

-- Provider wallet top-up requests from student side (verification)
CREATE TABLE IF NOT EXISTS provider_pending_registrations (
    id              SERIAL PRIMARY KEY,
    provider_id     INTEGER NOT NULL,
    submitted_at    TIMESTAMP DEFAULT NOW(),
    reviewed_at     TIMESTAMP,
    reviewer_id     INTEGER,
    decision        TEXT DEFAULT 'pending',
    notes           TEXT,
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
);

-- Index for fast rating lookups
CREATE INDEX IF NOT EXISTS idx_ratings_provider ON provider_ratings(provider_id);
CREATE INDEX IF NOT EXISTS idx_ratings_service ON provider_ratings(provider_id, service_type);
CREATE INDEX IF NOT EXISTS idx_topups_provider ON provider_topups(provider_id);

-- =============================================================
-- EU PONKALA - ADDITIONS (auto-generated)
-- Wallet top-ups + Provider registration + Ratings
-- =============================================================

CREATE TABLE IF NOT EXISTS wallet_transactions (
    tx_id           SERIAL PRIMARY KEY,
    provider_id     INTEGER NOT NULL,
    service_type    TEXT,
    amount          NUMERIC(12,2) NOT NULL,
    currency        TEXT DEFAULT 'ZMW',
    phone_number    TEXT,
    reference       TEXT UNIQUE,
    status          TEXT DEFAULT 'pending',
    created_at      TIMESTAMP DEFAULT NOW(),
    confirmed_at    TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_provider ON wallet_transactions(provider_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_ref ON wallet_transactions(reference);

CREATE TABLE IF NOT EXISTS provider_register_sessions (
    session_id      SERIAL PRIMARY KEY,
    phone           TEXT NOT NULL,
    otp             TEXT,
    otp_expires_at  TIMESTAMP,
    pin_hash        TEXT,
    full_name       TEXT,
    business_name   TEXT,
    status          TEXT DEFAULT 'started',
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prs_phone ON provider_register_sessions(phone);

CREATE TABLE IF NOT EXISTS ratings (
    rating_id       SERIAL PRIMARY KEY,
    student_id      INTEGER NOT NULL,
    provider_id     INTEGER NOT NULL,
    service_type    TEXT,
    order_id        INTEGER,
    stars           INTEGER CHECK(stars BETWEEN 1 AND 5),
    comment         TEXT,
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ratings_provider ON ratings(provider_id);
CREATE INDEX IF NOT EXISTS idx_ratings_student ON ratings(student_id);
