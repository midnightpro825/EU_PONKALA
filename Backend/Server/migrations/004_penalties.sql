CREATE TABLE IF NOT EXISTS engine_penalties (
    penalty_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_type TEXT NOT NULL,   -- 'PROVIDER' | 'STUDENT'
    subject_id   INTEGER NOT NULL,
    offense_type TEXT NOT NULL,   -- 'PROVIDER_CANCEL' | 'STUDENT_NO_CONFIRM' | ...
    level        INTEGER NOT NULL DEFAULT 1,   -- 1=warning, 2=suspension, 3=ban
    notes        TEXT,
    applied_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at   DATETIME
);

CREATE INDEX IF NOT EXISTS idx_penalties_subject ON engine_penalties(subject_type, subject_id);

CREATE TABLE IF NOT EXISTS engine_subject_standing (
    standing_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_type    TEXT NOT NULL,
    subject_id      INTEGER NOT NULL,
    level           INTEGER NOT NULL DEFAULT 0,   -- 0=clean, 1=warned, 2=suspended, 3=banned
    suspended_until DATETIME,
    is_banned       INTEGER NOT NULL DEFAULT 0,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(subject_type, subject_id)
);
