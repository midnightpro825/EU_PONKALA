CREATE TABLE IF NOT EXISTS engine_laundry_items (
    item_id     SERIAL PRIMARY KEY,
    item_code   TEXT UNIQUE NOT NULL,
    item_label  TEXT NOT NULL,
    unit_price  NUMERIC(10,2) NOT NULL DEFAULT 0,
    is_active   BOOLEAN DEFAULT TRUE,
    sort_order  INTEGER DEFAULT 0,
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW()
);

INSERT INTO engine_laundry_items (item_code, item_label, unit_price, sort_order) VALUES
    ('T-SHIRT',  'T-shirt',  5.00,  1),
    ('TROUSERS', 'Trousers', 7.00,  2),
    ('JEANS',    'Jeans',    10.00, 3),
    ('SKIRT',    'Skirt',    7.00,  4),
    ('DRESS',    'Dress',    12.00, 5),
    ('OTHER',    'Other',    5.00,  99)
ON CONFLICT (item_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS engine_laundry_access (
    access_id         SERIAL PRIMARY KEY,
    user_id           INTEGER UNIQUE NOT NULL,
    connections_total INTEGER NOT NULL DEFAULT 0,
    connections_used  INTEGER NOT NULL DEFAULT 0,
    connections_held  INTEGER NOT NULL DEFAULT 0,
    created_at        TIMESTAMP DEFAULT NOW(),
    updated_at        TIMESTAMP DEFAULT NOW()
);
