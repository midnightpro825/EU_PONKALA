-- =============================================================
-- EU PONKALA - Migration 002 (corrected): Laundry module tables
-- Uses engine_ prefix to avoid collision with legacy tables.
-- =============================================================

CREATE TABLE IF NOT EXISTS engine_laundry_items (
    item_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    item_code   TEXT UNIQUE NOT NULL,
    item_label  TEXT NOT NULL,
    unit_price  REAL NOT NULL DEFAULT 0,
    is_active   INTEGER DEFAULT 1,
    sort_order  INTEGER DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO engine_laundry_items (item_code, item_label, unit_price, sort_order) VALUES
    ('T-SHIRT',  'T-shirt',  5.00,  1),
    ('TROUSERS', 'Trousers', 7.00,  2),
    ('JEANS',    'Jeans',    10.00, 3),
    ('SKIRT',    'Skirt',    7.00,  4),
    ('DRESS',    'Dress',    12.00, 5),
    ('OTHER',    'Other',    5.00,  99);

CREATE TABLE IF NOT EXISTS engine_laundry_access (
    access_id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id             INTEGER UNIQUE NOT NULL,
    connections_total   INTEGER NOT NULL DEFAULT 0,
    connections_used    INTEGER NOT NULL DEFAULT 0,
    connections_held    INTEGER NOT NULL DEFAULT 0,
    last_unlock_at      DATETIME,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_engine_laundry_access_user ON engine_laundry_access(user_id);
