-- =============================================================
-- EU PONKALA - Migration 001 (extend-existing service_orders)
-- Safe: only CREATE ... IF NOT EXISTS + separate ALTER TABLE step
-- =============================================================

CREATE TABLE IF NOT EXISTS zones (
    zone_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    zone_code   TEXT UNIQUE NOT NULL,
    zone_name   TEXT NOT NULL,
    description TEXT,
    is_active   INTEGER DEFAULT 1,
    sort_order  INTEGER DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS landmarks (
    landmark_id INTEGER PRIMARY KEY AUTOINCREMENT,
    zone_id     INTEGER NOT NULL,
    type        TEXT NOT NULL DEFAULT 'LANDMARK',
    name        TEXT NOT NULL,
    aliases     TEXT,
    is_active   INTEGER DEFAULT 1,
    sort_order  INTEGER DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_landmarks_zone ON landmarks(zone_id);

CREATE TABLE IF NOT EXISTS provider_availability (
    availability_id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id     INTEGER NOT NULL,
    service_type    TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'OFFLINE',
    zone_id         INTEGER,
    last_change_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider_id, service_type)
);
CREATE INDEX IF NOT EXISTS idx_avail_service_status ON provider_availability(service_type, status);

CREATE TABLE IF NOT EXISTS order_items (
    item_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id    INTEGER NOT NULL,
    item_type   TEXT NOT NULL,
    item_label  TEXT,
    quantity    INTEGER NOT NULL DEFAULT 1,
    unit_price  REAL NOT NULL DEFAULT 0,
    line_total  REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS order_holds (
    hold_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id    INTEGER NOT NULL,
    provider_id INTEGER,
    hold_type   TEXT NOT NULL,
    amount      REAL NOT NULL DEFAULT 0,
    state       TEXT NOT NULL DEFAULT 'HELD',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME,
    notes       TEXT
);
CREATE INDEX IF NOT EXISTS idx_holds_order ON order_holds(order_id);
CREATE INDEX IF NOT EXISTS idx_holds_state ON order_holds(state);

CREATE TABLE IF NOT EXISTS completion_codes (
    code_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id  INTEGER NOT NULL,
    code      TEXT NOT NULL,
    issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    used_at   DATETIME,
    is_used   INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_codes_order ON completion_codes(order_id);

CREATE TABLE IF NOT EXISTS cancellations (
    cancellation_id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id        INTEGER NOT NULL,
    cancelled_by    TEXT NOT NULL,
    reason          TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS disputes (
    dispute_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id     INTEGER NOT NULL,
    raised_by    TEXT NOT NULL,
    raised_by_id INTEGER,
    reason       TEXT NOT NULL,
    description  TEXT,
    status       TEXT DEFAULT 'OPEN',
    resolution   TEXT,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at  DATETIME
);

CREATE TABLE IF NOT EXISTS sms_logs (
    sms_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    direction   TEXT NOT NULL,
    phone       TEXT NOT NULL,
    body        TEXT NOT NULL,
    provider_id INTEGER,
    order_id    INTEGER,
    status      TEXT DEFAULT 'SENT',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sms_phone ON sms_logs(phone);

CREATE TABLE IF NOT EXISTS ussd_sessions (
    session_id    TEXT PRIMARY KEY,
    phone         TEXT NOT NULL,
    provider_id   INTEGER,
    current_menu  TEXT,
    state         TEXT,
    started_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at      DATETIME
);

CREATE TABLE IF NOT EXISTS engine_config (
    config_key   TEXT PRIMARY KEY,
    config_value TEXT NOT NULL,
    description  TEXT,
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO engine_config (config_key, config_value, description) VALUES
    ('commission_rate', '0.15', 'Commission rate (15%)'),
    ('laundry_access_price', '50', 'Laundry access package price K'),
    ('laundry_access_connections', '4', 'Connections per K50 package'),
    ('welcome_credit_amount', '60', 'Welcome credit K'),
    ('provider_response_timeout_min', '5', 'Minutes for provider to reply YES'),
    ('auto_completion_timeout_min', '120', 'Auto-complete after provider DONE'),
    ('dispute_window_hours', '24', 'Dispute window after auto-complete');

INSERT OR IGNORE INTO zones (zone_code, zone_name, description, sort_order) VALUES
    ('Z1', 'Campus Core',                'Main Gate, Eden Gate, Eden Shop, Hostels, Library', 1),
    ('Z2', 'Main Gate - King George Corridor', 'Branching Point, Bluebell School, boarding houses on both branch roads', 2),
    ('Z3', 'King George & Diana Kaimba', 'King George, RCZ Church, Twikatane Grounds, Friday Market, Diana Kaimba road', 3),
    ('Z4', 'Twikatane Road - Mungwi Road', 'Twikatane Road, Mungwi Road, boarding houses along the way', 4),
    ('Z5', 'Eden Gate - Behind Campus - Unicos', 'Eden Gate, Eden Shop, behind Eden University, Unicos Hospital, connection to Mungwi Road', 5),
    ('Z6', 'Abu Dhabi - Last Don - Unicos University', 'Abu Dhabi, Armsgod Boarding House, Last Don, Gym, farms, Unicos University, Balastone School, Maplanga', 6);

INSERT OR IGNORE INTO landmarks (zone_id, type, name) VALUES
    (1, 'JUNCTION', 'Eden Main Gate'),
    (1, 'JUNCTION', 'Eden Gate'),
    (2, 'JUNCTION', 'Branching Point before King George'),
    (3, 'JUNCTION', 'King George'),
    (4, 'JUNCTION', 'Twikatane Road'),
    (4, 'JUNCTION', 'Mungwi Road'),
    (5, 'JUNCTION', 'Eden Gate'),
    (6, 'JUNCTION', 'Abu Dhabi');

INSERT OR IGNORE INTO landmarks (zone_id, type, name) VALUES
    (1, 'LANDMARK', 'Eden Shop'),
    (1, 'LANDMARK', 'Hostels'),
    (1, 'LANDMARK', 'Library'),
    (2, 'LANDMARK', 'Bluebell School'),
    (2, 'LANDMARK', 'Boarding houses on both branch roads'),
    (3, 'LANDMARK', 'RCZ Church'),
    (3, 'LANDMARK', 'Twikatane Grounds'),
    (3, 'LANDMARK', 'Friday Market'),
    (4, 'LANDMARK', 'Boarding houses along Twikatane Road'),
    (5, 'LANDMARK', 'Eden Shop'),
    (5, 'LANDMARK', 'Behind Eden University'),
    (5, 'LANDMARK', 'Unicos Hospital'),
    (6, 'LANDMARK', 'Armsgod Boarding House'),
    (6, 'LANDMARK', 'Last Don'),
    (6, 'LANDMARK', 'Gym'),
    (6, 'LANDMARK', 'Unicos University'),
    (6, 'LANDMARK', 'Balastone School'),
    (6, 'LANDMARK', 'Maplanga');

SELECT 'Migration 001 SQL complete' AS status;