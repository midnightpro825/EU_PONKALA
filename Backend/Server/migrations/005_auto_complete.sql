-- Migration 005: auto_complete_at column (now included in schema.sql, this is a no-op safeguard)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS auto_complete_at TIMESTAMP;
