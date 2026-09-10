CREATE TABLE IF NOT EXISTS coach_requests (
  owner TEXT NOT NULL,
  id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing','proposed','applied','failed')),
  proposal TEXT,
  PRIMARY KEY (owner,id)
);
CREATE INDEX IF NOT EXISTS coach_requests_recent ON coach_requests(owner,created_at);
