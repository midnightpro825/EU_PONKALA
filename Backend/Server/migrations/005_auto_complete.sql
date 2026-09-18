-- =============================================================
-- EU PONKALA - Migration 005: add auto_complete_at to orders
-- Used by engine/auto-complete.js scheduler
-- =============================================================

-- SQLite doesn't support IF NOT EXISTS on ALTER TABLE ADD COLUMN,
-- so this will error silently on subsequent runs (tolerated by db.js).
ALTER TABLE orders ADD COLUMN auto_complete_at DATETIME;
