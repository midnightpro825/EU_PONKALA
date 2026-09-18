-- =============================================================
-- EU PONKALA - Migration 003: Wheelbarrow pricing
-- =============================================================
-- Simple pricing model for pilot:
--   base_price           flat fee for any trip
--   per_zone_distance    per zone-to-zone distance unit
--   per_wheelbarrow      per wheelbarrow used
--   load_multiplier      SMALL=1.0, MEDIUM=1.5, LARGE=2.0
--   waiting_per_minute   charge for waiting time
-- =============================================================

CREATE TABLE IF NOT EXISTS engine_wheelbarrow_pricing (
    rule_id             INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_name           TEXT UNIQUE NOT NULL,
    base_price          REAL NOT NULL DEFAULT 20,
    per_zone_distance   REAL NOT NULL DEFAULT 10,   -- per zone hop
    per_wheelbarrow     REAL NOT NULL DEFAULT 5,
    load_multiplier_small   REAL DEFAULT 1.0,
    load_multiplier_medium  REAL DEFAULT 1.5,
    load_multiplier_large   REAL DEFAULT 2.0,
    waiting_per_minute  REAL NOT NULL DEFAULT 1,
    is_active           INTEGER DEFAULT 1,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO engine_wheelbarrow_pricing
    (rule_name, base_price, per_zone_distance, per_wheelbarrow, waiting_per_minute)
    VALUES ('DEFAULT', 20, 10, 5, 1);

-- Zone-to-zone distance in hops (0=same zone, 1=adjacent, etc.)
-- For simplicity, we compute distance as abs(zone_pickup - zone_dest) from zone_id
-- (Z1Z5 = 4 hops).
