import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

const subIndex = process.argv.indexOf("--sub");
const sub = subIndex >= 0 ? process.argv[subIndex + 1] : null;
if (!sub || sub.startsWith("--")) throw new Error("Usage: node scripts/promote-admin.mjs --sub GOOGLE_SUB (run on VPS after verifying the account)");
const db = new DatabaseSync(resolve(process.env.PROMPTCHIEN_DB_PATH ?? "data/promptchien.sqlite"));
try {
  const user = db.prepare("SELECT id, google_email, role FROM users WHERE google_sub = ? AND disabled_at IS NULL").get(sub);
  if (!user) throw new Error("No active Google account with that sub.");
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(user.id);
    db.prepare("INSERT INTO admin_audit (admin_user_id, target_user_id, action, result, created_at) VALUES (?, ?, 'bootstrap-admin', 'success', ?)").run(user.id, user.id, Date.now());
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  console.log(`Admin enabled for ${user.id} (${user.google_email}).`);
} finally {
  db.close();
}
