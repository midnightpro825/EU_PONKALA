-- Migration 005: add auto_complete_at to service_orders (Postgres)
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS auto_complete_at TIMESTAMP;
