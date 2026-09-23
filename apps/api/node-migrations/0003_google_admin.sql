ALTER TABLE users ADD COLUMN google_sub TEXT;
ALTER TABLE users ADD COLUMN google_email TEXT;
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'admin'));
ALTER TABLE users ADD COLUMN disabled_at INTEGER;
CREATE UNIQUE INDEX users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL;

CREATE TABLE admin_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_user_id TEXT NOT NULL REFERENCES users(id),
  target_user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  result TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX admin_audit_target ON admin_audit(target_user_id, created_at DESC);
