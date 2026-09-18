-- =============================================================
-- EU PONKALA — Postgres schema
-- Converted from SQLite. Uses SERIAL/TIMESTAMP/NUMERIC.
-- =============================================================

CREATE TABLE IF NOT EXISTS users (
    user_id       SERIAL PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name     TEXT,
    phone         TEXT,
    role          TEXT NOT NULL DEFAULT 'STUDENT',
    created_at    TIMESTAMP DEFAULT NOW(),
    updated_at    TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS properties (
    property_id  SERIAL PRIMARY KEY,
    landlord_id  INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    description  TEXT,
    address      TEXT,
    city         TEXT,
    zone_id      INTEGER,
    rent_amount  NUMERIC(12,2),
    status       TEXT DEFAULT 'AVAILABLE',
    created_at   TIMESTAMP DEFAULT NOW(),
    updated_at   TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_properties_landlord ON properties(landlord_id);
CREATE INDEX IF NOT EXISTS idx_properties_city ON properties(city);

CREATE TABLE IF NOT EXISTS rooms (
    room_id      SERIAL PRIMARY KEY,
    property_id  INTEGER REFERENCES properties(property_id) ON DELETE CASCADE,
    room_label   TEXT,
    capacity     INTEGER DEFAULT 1,
    rent_amount  NUMERIC(12,2),
    status       TEXT DEFAULT 'AVAILABLE',
    created_at   TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rooms_property ON rooms(property_id);

CREATE TABLE IF NOT EXISTS photos (
    photo_id     SERIAL PRIMARY KEY,
    room_id      INTEGER REFERENCES rooms(room_id) ON DELETE CASCADE,
    url          TEXT NOT NULL,
    is_primary   BOOLEAN DEFAULT FALSE,
    created_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS favourites (
    favourite_id SERIAL PRIMARY KEY,
    student_id   INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
    property_id  INTEGER REFERENCES properties(property_id) ON DELETE CASCADE,
    created_at   TIMESTAMP DEFAULT NOW(),
    UNIQUE(student_id, property_id)
);

CREATE TABLE IF NOT EXISTS inquiries (
    inquiry_id   SERIAL PRIMARY KEY,
    student_id   INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
    property_id  INTEGER REFERENCES properties(property_id) ON DELETE CASCADE,
    message      TEXT,
    status       TEXT DEFAULT 'NEW',
    created_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversations (
    conversation_id SERIAL PRIMARY KEY,
    user_a_id       INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
    user_b_id       INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
    property_id     INTEGER,
    created_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_a_id, user_b_id, property_id)
);

CREATE TABLE IF NOT EXISTS messages (
    message_id      SERIAL PRIMARY KEY,
    conversation_id INTEGER REFERENCES conversations(conversation_id) ON DELETE CASCADE,
    sender_id       INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
    body            TEXT,
    created_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);

CREATE TABLE IF NOT EXISTS laundry_items (
    id           SERIAL PRIMARY KEY,
    display_name TEXT NOT NULL,
    unit_price   NUMERIC(10,2) NOT NULL DEFAULT 0,
    is_active    BOOLEAN DEFAULT TRUE,
    created_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS laundry_access_subscriptions (
    id                     SERIAL PRIMARY KEY,
    student_id             INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
    package_price          NUMERIC(10,2),
    connections_purchased  INTEGER NOT NULL DEFAULT 0,
    connections_remaining  INTEGER NOT NULL DEFAULT 0,
    status                 TEXT DEFAULT 'active',
    payment_method         TEXT,
    payment_reference      TEXT,
    created_at             TIMESTAMP DEFAULT NOW(),
    updated_at             TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_laundry_subs_student ON laundry_access_subscriptions(student_id);

CREATE TABLE IF NOT EXISTS orders (
    order_id            SERIAL PRIMARY KEY,
    student_id          INTEGER REFERENCES users(user_id),
    provider_id         INTEGER,
    service_type        TEXT,
    status              TEXT DEFAULT 'PENDING',
    total_amount        NUMERIC(12,2) DEFAULT 0,
    notes               TEXT,
    created_at          TIMESTAMP DEFAULT NOW(),
    updated_at          TIMESTAMP DEFAULT NOW(),
    completed_at        TIMESTAMP,
    auto_complete_at    TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
    log_id      SERIAL PRIMARY KEY,
    actor_id    INTEGER,
    action      TEXT NOT NULL,
    details     TEXT,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_ledger (
    entry_id    SERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES users(user_id),
    amount      NUMERIC(12,2) NOT NULL,
    direction   TEXT,
    reason      TEXT,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
    notification_id SERIAL PRIMARY KEY,
    user_id         INTEGER REFERENCES users(user_id),
    title           TEXT,
    body            TEXT,
    is_read         BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- Add any remaining legacy tables here as needed
