CREATE TABLE IF NOT EXISTS zones (
    zone_id     SERIAL PRIMARY KEY,
    zone_code   TEXT UNIQUE NOT NULL,
    zone_name   TEXT NOT NULL,
    description TEXT,
    is_active   BOOLEAN DEFAULT TRUE,
    sort_order  INTEGER DEFAULT 0,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS landmarks (
    landmark_id SERIAL PRIMARY KEY,
    zone_id     INTEGER NOT NULL REFERENCES zones(zone_id) ON DELETE CASCADE,
    type        TEXT NOT NULL DEFAULT 'LANDMARK',
    name        TEXT NOT NULL,
    aliases     TEXT,
    is_active   BOOLEAN DEFAULT TRUE,
    sort_order  INTEGER DEFAULT 0,
    created_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_landmarks_zone ON landmarks(zone_id);

CREATE TABLE IF NOT EXISTS provider_availability (
    availability_id SERIAL PRIMARY KEY,
    provider_id     INTEGER NOT NULL,
    is_available    BOOLEAN DEFAULT TRUE,
    updated_at      TIMESTAMP DEFAULT NOW()
);
