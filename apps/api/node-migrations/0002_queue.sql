CREATE TABLE IF NOT EXISTS waiting_submissions (
  submission_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  queued_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS waiting_submissions_order ON waiting_submissions(queued_at, submission_id);
CREATE UNIQUE INDEX IF NOT EXISTS waiting_submissions_one_user ON waiting_submissions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS submissions_one_queued_user ON submissions(user_id) WHERE status = 'queued';
