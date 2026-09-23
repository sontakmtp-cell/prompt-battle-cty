import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const bot = JSON.parse(await readFile(new URL("../examples/bots/spear.json", import.meta.url), "utf8"));

async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  server.close();
  await once(server, "close");
  return port;
}

test("Node queue migration preserves old data and a failed pair releases both players", { timeout: 30000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "promptchien-queue-"));
  const path = join(dir, "api.sqlite");
  const seed = new DatabaseSync(path);
  seed.exec(await readFile(new URL("../apps/api/migrations/0001_m3.sql", import.meta.url), "utf8"));
  seed.prepare("INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)").run("legacy", "legacy@example.test", "Legacy", "salt", "hash", 1);
  seed.prepare("INSERT INTO bots VALUES (?, ?, ?, ?, ?, ?)").run("legacy-bot", "legacy", 1, JSON.stringify(bot), 1, 1);
  seed.close();

  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["apps/api/src/node.mjs"], {
    env: { ...process.env, PORT: String(port), PROMPTCHIEN_DB_PATH: path },
    stdio: "ignore",
  });
  async function post(url, body, cookie) {
    const response = await fetch(base + url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    });
    return { response, value: await response.json() };
  }
  try {
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base + "/healthz")).ok) break; } catch { /* starting */ }
      await new Promise(resolve => setTimeout(resolve, 100));
      if (i === 99) throw new Error("Node API did not start");
    }
    const db = new DatabaseSync(path);
    try {
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users WHERE id = 'legacy'").get().n, 1);
      assert.deepEqual({ ...db.prepare("SELECT password_salt, password_hash, google_sub, role FROM users WHERE id = 'legacy'").get() }, { password_salt: "salt", password_hash: "hash", google_sub: null, role: "player" });
      assert.deepEqual(JSON.parse(db.prepare("SELECT payload_json FROM bots WHERE id = 'legacy-bot'").get().payload_json), bot);
      assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = 'submissions_one_queued_user'").get());

      async function player(suffix) {
        const userId = `user-${suffix}`;
        const token = `session-${suffix}`;
        db.prepare("INSERT INTO users (id, email, display_name, password_salt, password_hash, created_at, google_sub, google_email) VALUES (?, ?, ?, '', '', ?, ?, ?)").run(userId, `${suffix}@example.test`, suffix, Date.now(), suffix, `${suffix}@example.test`);
        db.prepare("INSERT INTO sessions VALUES (?, ?, ?, ?)").run(createHash("sha256").update(token).digest("hex"), userId, Date.now() + 60000, Date.now());
        const cookie = `pc_session=${token}`;
        const created = await post("/api/v1/bots", { bot }, cookie);
        assert.equal(created.response.status, 201);
        const validated = await post(`/api/v1/bots/${created.value.botId}/validate`, {}, cookie);
        assert.equal(validated.value.report.valid, true);
        return { userId, botId: created.value.botId, versionId: validated.value.version.id, cookie };
      }
      const a = await player("queue-a");
      const b = await player("queue-b");
      const first = await post(`/api/v1/bots/${a.botId}/submit`, { revision: 1 }, a.cookie);
      assert.equal(first.value.status, "queued");
      assert.throws(() => db.prepare("INSERT INTO submissions VALUES (?, ?, ?, 'queued', NULL, ?)").run("duplicate", a.userId, a.versionId, 2), /UNIQUE constraint/);

      // Corrupt one stored package to force a failure after FIFO has paired both players.
      db.prepare("UPDATE bot_versions SET package_json = ? WHERE id = ?").run("{", a.versionId);
      const second = await post(`/api/v1/bots/${b.botId}/submit`, { revision: 1 }, b.cookie);
      assert.equal(second.response.status, 500);
      assert.deepEqual(db.prepare("SELECT status FROM submissions WHERE user_id IN (?, ?) ORDER BY user_id").all(a.userId, b.userId).map(row => row.status), ["failed", "failed"]);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM waiting_submissions").get().n, 0);
    } finally {
      db.close();
    }
  } finally {
    child.kill();
    if (child.exitCode === null) await once(child, "exit");
    await rm(dir, { recursive: true, force: true });
  }
});
