CREATE TABLE IF NOT EXISTS private_accounts (
  owner TEXT PRIMARY KEY NOT NULL,
  slot TEXT NOT NULL UNIQUE CHECK (slot IN ('partner')),
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  session_version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TRIGGER IF NOT EXISTS variants_owner_guard BEFORE INSERT ON variants
WHEN NOT EXISTS (SELECT 1 FROM exercises WHERE id = NEW.exercise_id AND owner = NEW.owner)
BEGIN SELECT RAISE(ABORT, 'Exercise ownership mismatch'); END;

CREATE TRIGGER IF NOT EXISTS sets_owner_guard BEFORE INSERT ON sets
WHEN NOT EXISTS (SELECT 1 FROM sessions WHERE id = NEW.session_id AND owner = NEW.owner)
OR NOT EXISTS (SELECT 1 FROM variants WHERE id = NEW.variant_id AND owner = NEW.owner)
BEGIN SELECT RAISE(ABORT, 'Set ownership mismatch'); END;

CREATE TRIGGER IF NOT EXISTS progressions_owner_guard BEFORE INSERT ON progressions
WHEN NOT EXISTS (SELECT 1 FROM sets WHERE id = NEW.set_id AND owner = NEW.owner AND session_id = NEW.session_id AND variant_id = NEW.variant_id)
BEGIN SELECT RAISE(ABORT, 'Progression ownership mismatch'); END;

CREATE TRIGGER IF NOT EXISTS coach_messages_owner_guard BEFORE INSERT ON coach_messages
WHEN NOT EXISTS (SELECT 1 FROM sessions WHERE id = NEW.session_id AND owner = NEW.owner)
BEGIN SELECT RAISE(ABORT, 'Message ownership mismatch'); END;
