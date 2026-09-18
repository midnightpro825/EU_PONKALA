CREATE TABLE IF NOT EXISTS engine_wheelbarrow_pricing (
    rule_id              SERIAL PRIMARY KEY,
    rule_name            TEXT UNIQUE NOT NULL,
    base_price           NUMERIC(10,2) NOT NULL DEFAULT 20,
    per_zone_distance    NUMERIC(10,2) NOT NULL DEFAULT 10,
    per_wheelbarrow      NUMERIC(10,2) NOT NULL DEFAULT 5,
    load_multiplier_small  NUMERIC(4,2) DEFAULT 1.0,
    load_multiplier_medium NUMERIC(4,2) DEFAULT 1.5,
    load_multiplier_large  NUMERIC(4,2) DEFAULT 2.0,
    waiting_per_minute   NUMERIC(10,2) NOT NULL DEFAULT 1,
    is_active            BOOLEAN DEFAULT TRUE,
    created_at           TIMESTAMP DEFAULT NOW(),
    updated_at           TIMESTAMP DEFAULT NOW()
);

INSERT INTO engine_wheelbarrow_pricing
    (rule_name, base_price, per_zone_distance, per_wheelbarrow, waiting_per_minute)
    VALUES ('DEFAULT', 20, 10, 5, 1)
ON CONFLICT (rule_name) DO NOTHING;
