CREATE TABLE IF NOT EXISTS engine_penalties (
    penalty_id   SERIAL PRIMARY KEY,
    subject_type TEXT NOT NULL,
    subject_id   INTEGER NOT NULL,
    offense_type TEXT NOT NULL,
    level        INTEGER NOT NULL DEFAULT 1,
    notes        TEXT,
    applied_at   TIMESTAMP DEFAULT NOW(),
    expires_at   TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_penalties_subject ON engine_penalties(subject_type, subject_id);

CREATE TABLE IF NOT EXISTS engine_subject_standing (
    standing_id     SERIAL PRIMARY KEY,
    subject_type    TEXT NOT NULL,
    subject_id      INTEGER NOT NULL,
    level           INTEGER NOT NULL DEFAULT 0,
    suspended_until TIMESTAMP,
    is_banned       BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE(subject_type, subject_id)
);
