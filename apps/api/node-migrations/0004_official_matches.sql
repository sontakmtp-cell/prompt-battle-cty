ALTER TABLE submissions ADD COLUMN error_code TEXT;
ALTER TABLE submissions ADD COLUMN error_message TEXT;
ALTER TABLE submissions ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
UPDATE submissions SET updated_at = created_at WHERE updated_at = 0;

ALTER TABLE idempotency_keys ADD COLUMN request_hash TEXT;
ALTER TABLE idempotency_keys ADD COLUMN submission_id TEXT;

CREATE TABLE official_matches (
  id TEXT PRIMARY KEY,
  submission_a_id TEXT NOT NULL UNIQUE REFERENCES submissions(id),
  submission_b_id TEXT NOT NULL UNIQUE REFERENCES submissions(id),
  user_a_id TEXT NOT NULL REFERENCES users(id),
  user_b_id TEXT NOT NULL REFERENCES users(id),
  version_a_id TEXT NOT NULL REFERENCES bot_versions(id),
  version_b_id TEXT NOT NULL REFERENCES bot_versions(id),
  snapshot_json TEXT NOT NULL,
  seed INTEGER NOT NULL CHECK (seed >= 0 AND seed <= 4294967295),
  engine_version TEXT NOT NULL,
  ruleset_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('matched', 'running', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 2),
  error_code TEXT,
  error_message TEXT,
  result_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (user_a_id <> user_b_id)
);
CREATE INDEX official_matches_work ON official_matches(status, created_at, id);

DROP INDEX IF EXISTS submissions_one_queued_user;
DROP INDEX IF EXISTS waiting_submissions_order;
DROP INDEX IF EXISTS waiting_submissions_one_user;
ALTER TABLE waiting_submissions RENAME TO waiting_submissions_m1_legacy;
ALTER TABLE waiting_submissions_m1_legacy ADD COLUMN migration_status TEXT NOT NULL DEFAULT 'pending' CHECK (migration_status IN ('pending', 'restored', 'rejected'));
ALTER TABLE waiting_submissions_m1_legacy ADD COLUMN migration_error TEXT;

CREATE INDEX submissions_queue_order ON submissions(status, created_at, id);
CREATE INDEX submissions_match_id ON submissions(match_id);
CREATE INDEX idempotency_submissions ON idempotency_keys(user_id, tool_name, submission_id);
