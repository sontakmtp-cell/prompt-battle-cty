import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { packBot } from "@prompt-chien/core/engine";
import { VERSIONS } from "@prompt-chien/contracts";
import test from "node:test";

const bot = JSON.parse(await readFile(new URL("../examples/bots/spear.json", import.meta.url), "utf8"));
const pkg = await packBot(bot);

async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  server.close();
  await once(server, "close");
  return port;
}

function startApi(port, path, testEnv = {}) {
  const child = spawn(process.execPath, ["apps/api/src/node.mjs"], {
    env: { ...process.env, NODE_ENV: "test", PORT: String(port), PROMPTCHIEN_DB_PATH: path, REPLAY_SHARE_SECRET: "m2-test-share-secret", ...testEnv },
    stdio: ["ignore", "ignore", "pipe"],
  });
  child.stderrText = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", chunk => { child.stderrText = (child.stderrText + chunk).slice(-4000); });
  return child;
}

async function stopApi(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await once(child, "exit");
}

async function killApi(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGKILL");
  await once(child, "exit");
}

async function waitReady(base, child) {
  for (let i = 0; i < 200; i += 1) {
    if (child.exitCode !== null) throw new Error(`Node API exited during startup (${child.exitCode})`);
    try { if ((await fetch(base + "/healthz")).ok) return; } catch { /* startup */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Node API did not start");
}

test("M2 migrates M1 rows and keeps official submissions durable, private and idempotent", { timeout: 120000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "promptchien-m2-"));
  const path = join(dir, "api.sqlite");
  const seed = new DatabaseSync(path);
  const v1 = await readFile(new URL("../apps/api/migrations/0001_m3.sql", import.meta.url), "utf8");
  const v2 = await readFile(new URL("../apps/api/node-migrations/0002_queue.sql", import.meta.url), "utf8");
  const v3 = await readFile(new URL("../apps/api/node-migrations/0003_google_admin.sql", import.meta.url), "utf8");
  seed.exec(v1);
  seed.exec(v2);
  seed.exec(v3);
  seed.exec("PRAGMA user_version = 3");

  const timestamp = Date.now();
  function addUser(id, email, token) {
    seed.prepare("INSERT INTO users (id, email, display_name, password_salt, password_hash, created_at, google_sub, google_email, role, disabled_at) VALUES (?, ?, ?, '', '', ?, ?, ?, 'player', NULL)")
      .run(id, email, id, timestamp, `sub-${id}`, email);
    if (token) seed.prepare("INSERT INTO sessions VALUES (?, ?, ?, ?)")
      .run(createHash("sha256").update(token).digest("hex"), id, timestamp + 86400000, timestamp);
  }
  function addVersion(userId, suffix, status = null) {
    const botId = `bot-${suffix}`, versionId = `version-${suffix}`;
    seed.prepare("INSERT INTO bots VALUES (?, ?, 1, ?, ?, ?)").run(botId, userId, JSON.stringify(bot), timestamp, timestamp);
    seed.prepare("INSERT INTO bot_versions VALUES (?, ?, ?, 1, ?, ?, ?, ?)")
      .run(versionId, botId, userId, pkg.packageHash, JSON.stringify(pkg), JSON.stringify({ valid: true }), timestamp);
    if (status) return { botId, versionId, submissionId: `submission-${suffix}` };
    return { botId, versionId };
  }
  addUser("legacy-a", "legacy-a@example.test");
  addUser("legacy-b", "legacy-b@example.test");
  addUser("legacy-q", "legacy-q@example.test", "session-legacy-q");
  addUser("legacy-bad-a", "legacy-bad-a@example.test");
  addUser("legacy-bad-b", "legacy-bad-b@example.test");
  addUser("legacy-missing", "legacy-missing@example.test");
  addUser("legacy-mismatch", "legacy-mismatch@example.test");
  addUser("api-b", "api-b@example.test", "session-api-b");
  addUser("api-c", "api-c@example.test", "session-api-c");
  addUser("api-outsider", "api-outsider@example.test", "session-outsider");
  const legacyA = addVersion("legacy-a", "legacy-a", true);
  const legacyB = addVersion("legacy-b", "legacy-b", true);
  const legacyQ = addVersion("legacy-q", "legacy-q", true);
  const badA = addVersion("legacy-bad-a", "legacy-bad-a", true);
  const badB = addVersion("legacy-bad-b", "legacy-bad-b", true);
  seed.prepare("UPDATE bot_versions SET package_json = ? WHERE id IN (?, ?)")
    .run(JSON.stringify({ ...pkg, packageHash: "wrong-package-hash" }), badA.versionId, badB.versionId);
  seed.prepare("INSERT INTO submissions (id, user_id, version_id, status, match_id, created_at) VALUES (?, ?, ?, 'matched', 'legacy-match', ?)")
    .run("submission-legacy-a", "legacy-a", legacyA.versionId, timestamp - 3000);
  seed.prepare("INSERT INTO submissions (id, user_id, version_id, status, match_id, created_at) VALUES (?, ?, ?, 'matched', 'legacy-match', ?)")
    .run("submission-legacy-b", "legacy-b", legacyB.versionId, timestamp - 2000);
  seed.prepare("INSERT INTO submissions (id, user_id, version_id, status, match_id, created_at) VALUES (?, ?, ?, 'queued', NULL, ?)")
    .run(legacyQ.submissionId, "legacy-q", legacyQ.versionId, timestamp - 1000);
  seed.prepare("INSERT INTO waiting_submissions VALUES (?, ?, ?, ?)").run(legacyQ.submissionId, "legacy-q", legacyQ.versionId, timestamp - 1000);
  seed.prepare("INSERT INTO submissions (id, user_id, version_id, status, match_id, created_at) VALUES (?, ?, ?, 'queued', NULL, ?)")
    .run(badA.submissionId, "legacy-bad-a", badA.versionId, timestamp - 1100);
  seed.prepare("INSERT INTO waiting_submissions VALUES (?, ?, ?, ?)").run(badA.submissionId, "legacy-bad-a", badA.versionId, timestamp - 1100);
  seed.prepare("INSERT INTO submissions (id, user_id, version_id, status, match_id, created_at) VALUES (?, ?, ?, 'queued', NULL, ?)")
    .run(badB.submissionId, "legacy-bad-b", badB.versionId, timestamp - 900);
  seed.prepare("INSERT INTO waiting_submissions VALUES (?, ?, ?, ?)").run(badB.submissionId, "legacy-bad-b", badB.versionId, timestamp - 900);
  seed.prepare("INSERT INTO waiting_submissions VALUES (?, ?, ?, ?)").run("submission-missing-version", "legacy-missing", "missing-version-id", timestamp - 800);
  seed.prepare("INSERT INTO waiting_submissions VALUES (?, ?, ?, ?)").run("submission-mismatched-version", "legacy-mismatch", legacyQ.versionId, timestamp - 700);
  seed.prepare("INSERT INTO submissions (id, user_id, version_id, status, match_id, created_at) VALUES ('orphan-match', 'legacy-a', ?, 'matched', 'missing-replay', ?)")
    .run(legacyA.versionId, timestamp - 500);
  for (const [id, userId, versionId, matchId, offset] of [
    ["bad-hash-a", "legacy-a", legacyA.versionId, "bad-hash-match", -450],
    ["bad-hash-b", "legacy-b", legacyB.versionId, "bad-hash-match", -440],
    ["bad-owner-a", "legacy-a", legacyA.versionId, "bad-owner-match", -430],
    ["bad-owner-b", "legacy-b", legacyA.versionId, "bad-owner-match", -420],
  ]) seed.prepare("INSERT INTO submissions (id, user_id, version_id, status, match_id, created_at) VALUES (?, ?, ?, 'matched', ?, ?)")
    .run(id, userId, versionId, matchId, timestamp + offset);
  const legacyReplay = {
    manifest: {
      replayId: "legacy-match", mode: "official", engineVersion: VERSIONS.engine, rulesetVersion: VERSIONS.ruleset,
      seed: 77, packages: { A: pkg, B: pkg }, result: { winner: "A", reason: "test", tick: 1, scores: { A: 1, B: 0 } },
    },
  };
  seed.prepare("INSERT INTO replays VALUES (?, ?, 'completed', ?, ?, ?, 1, ?)")
    .run("legacy-match", "legacy-a", 77, JSON.stringify(legacyReplay), JSON.stringify(legacyReplay.manifest.result), timestamp - 1500);
  for (const [matchId, replayPackages, seedValue] of [
    ["bad-hash-match", { A: { ...pkg, packageHash: "wrong-hash" }, B: pkg }, 78],
    ["bad-owner-match", { A: pkg, B: pkg }, 79],
  ]) {
    const replay = { manifest: { ...legacyReplay.manifest, replayId: matchId, seed: seedValue, packages: replayPackages } };
    seed.prepare("INSERT INTO replays VALUES (?, ?, 'completed', ?, ?, ?, 1, ?)")
      .run(matchId, "legacy-a", seedValue, JSON.stringify(replay), JSON.stringify(replay.manifest.result), timestamp + seedValue);
  }
  seed.prepare("INSERT INTO idempotency_keys (user_id, tool_name, idempotency_key, response_json, created_at) VALUES ('legacy-a', 'submit_bot', 'legacy-key-0001', ?, ?)")
    .run(JSON.stringify({ status: "queued", submissionId: "submission-legacy-a", version: { id: legacyA.versionId, botId: legacyA.botId, revision: 1 } }), timestamp);
  seed.close();

  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let child = startApi(port, path);
  async function call(url, { method = "GET", body, token, idempotencyKey } = {}) {
    const response = await fetch(base + url, {
      method,
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(token ? { cookie: `pc_session=${token}` } : {}),
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const contentType = response.headers.get("content-type") ?? "";
    return { response, value: contentType.includes("json") ? await response.json() : await response.text() };
  }
  try {
    await waitReady(base, child);
    let db = new DatabaseSync(path);
    try {
      assert.equal(db.prepare("PRAGMA user_version").get().user_version, 4);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users WHERE id LIKE 'legacy-%'").get().n, 7);
      assert.equal(db.prepare("SELECT status FROM submissions WHERE id = 'submission-legacy-a'").get().status, "completed");
      assert.equal(db.prepare("SELECT status FROM submissions WHERE id = 'submission-legacy-b'").get().status, "completed");
      assert.equal(db.prepare("SELECT status, error_code FROM submissions WHERE id = 'orphan-match'").get().status, "failed");
      assert.equal(db.prepare("SELECT error_code FROM submissions WHERE id IN ('bad-hash-a', 'bad-hash-b') AND status = 'failed' LIMIT 1").get().error_code, "MIGRATION_ORPHAN_MATCH");
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM submissions WHERE id IN ('bad-owner-a', 'bad-owner-b') AND status = 'failed'").get().n, 2);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM official_matches WHERE id IN ('bad-hash-match', 'bad-owner-match')").get().n, 0);
      assert.equal(db.prepare("SELECT error_code FROM submissions WHERE id = 'submission-legacy-bad-a'").get().error_code, "INVALID_SNAPSHOT");
      assert.equal(db.prepare("SELECT error_code FROM submissions WHERE id = 'submission-legacy-bad-b'").get().error_code, "INVALID_SNAPSHOT");
      assert.equal(db.prepare("SELECT submission_id FROM idempotency_keys WHERE idempotency_key = 'legacy-key-0001'").get().submission_id, "submission-legacy-a");
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM waiting_submissions_m1_legacy").get().n, 5);
      assert.equal(db.prepare("SELECT migration_status FROM waiting_submissions_m1_legacy WHERE submission_id = 'submission-legacy-q'").get().migration_status, "restored");
      const missingLegacy = db.prepare("SELECT migration_status, migration_error FROM waiting_submissions_m1_legacy WHERE submission_id = 'submission-missing-version'").get();
      assert.equal(missingLegacy.migration_status, "rejected");
      assert.match(missingLegacy.migration_error, /version does not exist/);
      const mismatchedLegacy = db.prepare("SELECT migration_status, migration_error FROM waiting_submissions_m1_legacy WHERE submission_id = 'submission-mismatched-version'").get();
      assert.equal(mismatchedLegacy.migration_status, "rejected");
      assert.match(mismatchedLegacy.migration_error, /belongs to a different user/);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM submissions WHERE id IN ('submission-missing-version', 'submission-mismatched-version')").get().n, 0);
      assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    } finally { db.close(); }

    const oldDetail = await call("/api/v1/submissions/submission-legacy-a", { token: "unused" });
    assert.equal(oldDetail.response.status, 401);

    // The restored queued M1 row survives a process restart with the same ID.
    await stopApi(child);
    child = startApi(port, path, { PROMPTCHIEN_TEST_SIM_DELAY_MS: "30000" });
    await waitReady(base, child);
    db = new DatabaseSync(path);
    const legacyQueue = db.prepare("SELECT id FROM submissions WHERE user_id = 'legacy-q' AND status = 'queued'").get();
    const preservedAudit = db.prepare("SELECT submission_id, migration_status FROM waiting_submissions_m1_legacy ORDER BY submission_id").all();
    db.close();
    assert.equal(legacyQueue.id, "submission-legacy-q");
    assert.deepEqual(preservedAudit.map(row => ({ ...row })), [
      { submission_id: "submission-legacy-bad-a", migration_status: "restored" },
      { submission_id: "submission-legacy-bad-b", migration_status: "restored" },
      { submission_id: "submission-legacy-q", migration_status: "restored" },
      { submission_id: "submission-mismatched-version", migration_status: "rejected" },
      { submission_id: "submission-missing-version", migration_status: "rejected" },
    ]);

    const created = await call("/api/v1/bots", { method: "POST", token: "session-api-b", body: { bot } });
    assert.equal(created.response.status, 201);
    const botId = created.value.botId;
    const validated = await call(`/api/v1/bots/${botId}/validate`, { method: "POST", token: "session-api-b", body: {} });
    assert.equal(validated.value.report.valid, true);

    const concurrent = await Promise.all(Array.from({ length: 20 }, () => call(`/api/v1/bots/${botId}/submit`, {
      method: "POST", token: "session-api-b", body: { revision: 1 }, idempotencyKey: "m2-concurrent-submit-0001",
    })));
    assert.ok(concurrent.every(result => result.response.status === 202));
    assert.equal(new Set(concurrent.map(result => result.value.submissionId)).size, 1);
    const secondView = await call(`/api/v1/submissions/${concurrent[0].value.submissionId}`, { token: "session-api-b" });
    assert.ok(["matched", "running", "completed"].includes(secondView.value.status));
    assert.ok(secondView.value.matchId);

    const edited = await call(`/api/v1/bots/${botId}/edit`, { method: "POST", token: "session-api-b", body: { revision: 1, bot: { ...bot, name: "Edited after submit" } } });
    assert.equal(edited.response.status, 200);
    assert.equal(edited.value.revision, 2);
    const retried = await call(`/api/v1/bots/${botId}/submit`, { method: "POST", token: "session-api-b", body: { revision: 1 }, idempotencyKey: "m2-concurrent-submit-0001" });
    assert.equal(retried.response.status, 202);
    assert.equal(retried.value.submissionId, concurrent[0].value.submissionId);

    let runningMatch;
    for (let i = 0; i < 100; i += 1) {
      db = new DatabaseSync(path);
      runningMatch = db.prepare("SELECT * FROM official_matches WHERE id = ?").get(secondView.value.matchId);
      db.close();
      if (runningMatch?.status === "running") break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(runningMatch.status, "running");
    assert.equal(runningMatch.attempts, 1);
    const liveSubmission = await call(`/api/v1/submissions/${concurrent[0].value.submissionId}`, { token: "session-api-b" });
    assert.equal(liveSubmission.value.status, "running");
    const originalSeed = runningMatch.seed;
    const originalSnapshot = runningMatch.snapshot_json;
    await killApi(child);
    db = new DatabaseSync(path);
    const stoppedMatch = db.prepare("SELECT status, attempts, seed, snapshot_json FROM official_matches WHERE id = ?").get(runningMatch.id);
    db.close();
    assert.equal(stoppedMatch.status, "running");
    assert.equal(stoppedMatch.attempts, 1);
    child = startApi(port, path);
    await waitReady(base, child);

    let result;
    for (let i = 0; i < 500; i += 1) {
      result = await call(`/api/v1/submissions/${concurrent[0].value.submissionId}`, { token: "session-api-b" });
      if (["completed", "failed"].includes(result.value.status)) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(result.value.status, "completed", JSON.stringify(result.value));
    assert.ok(result.value.matchId);
    const newMatchId = result.value.matchId;
    assert.notEqual(newMatchId, "legacy-match");
    assert.equal(result.value.replayId, newMatchId);
    assert.equal(result.value.replayUrl, `/api/v1/replays/${encodeURIComponent(newMatchId)}`);
    db = new DatabaseSync(path);
    const recoveredMatch = db.prepare("SELECT status, attempts, seed, snapshot_json FROM official_matches WHERE id = ?").get(newMatchId);
    db.close();
    assert.equal(recoveredMatch.status, "completed");
    assert.equal(recoveredMatch.attempts, 2);
    assert.equal(recoveredMatch.seed, originalSeed);
    assert.equal(recoveredMatch.snapshot_json, originalSnapshot);

    const outsiderDetail = await call(`/api/v1/submissions/${concurrent[0].value.submissionId}`, { token: "session-outsider" });
    const outsiderMatch = await call(`/api/v1/matches/${newMatchId}`, { token: "session-outsider" });
    const outsiderReplay = await call(`/api/v1/replays/${newMatchId}`, { token: "session-outsider" });
    assert.equal(outsiderDetail.response.status, 404);
    assert.equal(outsiderMatch.response.status, 404);
    assert.equal(outsiderReplay.response.status, 404);
    const participantReplay = await call(`/api/v1/replays/${newMatchId}`, { token: "session-api-b" });
    assert.equal(participantReplay.response.status, 200);
    const match = await call(`/api/v1/matches/${newMatchId}`, { token: "session-api-b" });
    assert.equal(match.value.status, "completed");
    assert.deepEqual(match.value.packageHashes, { A: pkg.packageHash, B: pkg.packageHash });
    assert.deepEqual(result.value.result, match.value.result);

    const share = await call(`/api/v1/replays/${newMatchId}/share`, { method: "POST", token: "session-api-b", body: {} });
    assert.equal(share.response.status, 200);
    assert.equal(new URL(share.value.shareUrl).searchParams.get("share").split(".").length, 2);
    const noShare = await call(new URL(share.value.shareUrl).pathname);
    assert.equal(noShare.response.status, 401);
    const shared = await call(new URL(share.value.shareUrl).pathname + new URL(share.value.shareUrl).search);
    assert.equal(shared.response.status, 200);
    assert.equal(shared.value.includes('<canvas id="arena"'), true);
    const shareUrl = new URL(share.value.shareUrl);
    const shareToken = shareUrl.searchParams.get("share");
    const tamperedToken = `${shareToken.slice(0, -1)}${shareToken.endsWith("A") ? "B" : "A"}`;
    const tampered = await call(`${shareUrl.pathname}?share=${encodeURIComponent(tamperedToken)}`);
    assert.equal(tampered.response.status, 401);
    const expiredPayload = Buffer.from(JSON.stringify({ replayId: newMatchId, expiresAt: Date.now() - 1000 })).toString("base64url");
    const expiredSignature = createHmac("sha256", "m2-test-share-secret").update(expiredPayload).digest("base64url");
    const expired = await call(`${shareUrl.pathname}?share=${expiredPayload}.${expiredSignature}`);
    assert.equal(expired.response.status, 401);

    // A committed matched row is resumed after a clean process restart.
    await stopApi(child);
    db = new DatabaseSync(path);
    const matchedAt = Date.now();
    const matchedSnapshot = {
      A: { submissionId: "restart-matched-a", userId: "legacy-q", versionId: legacyQ.versionId, packageHash: pkg.packageHash, package: pkg },
      B: { submissionId: "restart-matched-b", userId: "api-b", versionId: validated.value.version.id, packageHash: pkg.packageHash, package: pkg },
    };
    db.prepare("INSERT INTO submissions (id, user_id, version_id, status, match_id, created_at, updated_at) VALUES (?, ?, ?, 'matched', ?, ?, ?)")
      .run("restart-matched-a", "legacy-q", legacyQ.versionId, "restart-matched", matchedAt, matchedAt);
    db.prepare("INSERT INTO submissions (id, user_id, version_id, status, match_id, created_at, updated_at) VALUES (?, ?, ?, 'matched', ?, ?, ?)")
      .run("restart-matched-b", "api-b", validated.value.version.id, "restart-matched", matchedAt, matchedAt);
    db.prepare("INSERT INTO official_matches (id, submission_a_id, submission_b_id, user_a_id, user_b_id, version_a_id, version_b_id, snapshot_json, seed, engine_version, ruleset_version, status, attempts, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'matched', 0, ?, ?)")
      .run("restart-matched", "restart-matched-a", "restart-matched-b", "legacy-q", "api-b", legacyQ.versionId, validated.value.version.id, JSON.stringify(matchedSnapshot), 4321, VERSIONS.engine, VERSIONS.ruleset, matchedAt, matchedAt);
    db.close();
    child = startApi(port, path);
    await waitReady(base, child);
    let restarted;
    for (let i = 0; i < 500; i += 1) {
      restarted = await call("/api/v1/submissions/restart-matched-b", { token: "session-api-b" });
      if (["completed", "failed"].includes(restarted.value.status)) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(restarted.value.status, "completed", JSON.stringify(restarted.value));
    assert.equal(restarted.value.matchId, "restart-matched");
    db = new DatabaseSync(path);
    const resumed = db.prepare("SELECT status, attempts, seed, snapshot_json FROM official_matches WHERE id = 'restart-matched'").get();
    db.close();
    assert.equal(resumed.status, "completed");
    assert.equal(resumed.attempts, 1);
    assert.equal(resumed.seed, 4321);
    assert.equal(resumed.snapshot_json, JSON.stringify(matchedSnapshot));

    // Two failed attempts move both participants out of the active queue.
    await stopApi(child);
    db = new DatabaseSync(path);
    const failedAt = Date.now();
    const failedSnapshot = {
      A: { submissionId: "retry-fail-a", userId: "legacy-q", versionId: legacyQ.versionId, packageHash: pkg.packageHash, package: pkg },
      B: { submissionId: "retry-fail-b", userId: "api-b", versionId: validated.value.version.id, packageHash: pkg.packageHash, package: pkg },
    };
    db.prepare("INSERT INTO submissions (id, user_id, version_id, status, match_id, created_at, updated_at) VALUES (?, ?, ?, 'matched', ?, ?, ?)")
      .run("retry-fail-a", "legacy-q", legacyQ.versionId, "retry-exhaustion-test", failedAt, failedAt);
    db.prepare("INSERT INTO submissions (id, user_id, version_id, status, match_id, created_at, updated_at) VALUES (?, ?, ?, 'matched', ?, ?, ?)")
      .run("retry-fail-b", "api-b", validated.value.version.id, "retry-exhaustion-test", failedAt, failedAt);
    db.prepare("INSERT INTO official_matches (id, submission_a_id, submission_b_id, user_a_id, user_b_id, version_a_id, version_b_id, snapshot_json, seed, engine_version, ruleset_version, status, attempts, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'matched', 0, ?, ?)")
      .run("retry-exhaustion-test", "retry-fail-a", "retry-fail-b", "legacy-q", "api-b", legacyQ.versionId, validated.value.version.id, JSON.stringify(failedSnapshot), 4322, VERSIONS.engine, VERSIONS.ruleset, failedAt, failedAt);
    db.close();
    child = startApi(port, path, { PROMPTCHIEN_TEST_SIM_FAILURE: "always", PROMPTCHIEN_TEST_RETRY_PAUSE_MS: "1000" });
    await waitReady(base, child);
    let retryState;
    for (let i = 0; i < 100; i += 1) {
      db = new DatabaseSync(path);
      retryState = {
        match: db.prepare("SELECT status, attempts FROM official_matches WHERE id = 'retry-exhaustion-test'").get(),
        submissions: db.prepare("SELECT id, status FROM submissions WHERE id IN ('retry-fail-a', 'retry-fail-b') ORDER BY id").all(),
      };
      db.close();
      if (retryState.match?.status === "matched" && retryState.match.attempts === 1) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.deepEqual({ ...retryState.match }, { status: "matched", attempts: 1 });
    assert.deepEqual(retryState.submissions.map(row => ({ ...row })), [{ id: "retry-fail-a", status: "matched" }, { id: "retry-fail-b", status: "matched" }]);
    let failedA, failedB;
    for (let i = 0; i < 500; i += 1) {
      [failedA, failedB] = await Promise.all([
        call("/api/v1/submissions/retry-fail-a", { token: "session-legacy-q" }),
        call("/api/v1/submissions/retry-fail-b", { token: "session-api-b" }),
      ]);
      if (failedA.value.status === "failed" && failedB.value.status === "failed") break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(failedA.value.status, "failed");
    assert.equal(failedB.value.status, "failed");
    assert.equal(failedA.value.errorCode, "SIMULATION_FAILED");
    assert.equal(failedB.value.errorCode, "SIMULATION_FAILED");
    db = new DatabaseSync(path);
    const exhausted = db.prepare("SELECT status, attempts FROM official_matches WHERE id = 'retry-exhaustion-test'").get();
    assert.equal(exhausted.status, "failed");
    assert.equal(exhausted.attempts, 2);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM submissions WHERE user_id IN ('legacy-q', 'api-b') AND status IN ('queued', 'matched', 'running')").get().n, 0);
    db.close();
    await stopApi(child);
    child = startApi(port, path, { PROMPTCHIEN_TEST_SUBMIT_DELAY_KEY: "m2-stale-revision-0001", PROMPTCHIEN_TEST_SUBMIT_DELAY_MS: "1000" });
    await waitReady(base, child);

    const staleBot = await call("/api/v1/bots", { method: "POST", token: "session-api-c", body: { bot } });
    assert.equal(staleBot.response.status, 201, `stale-revision setup bot creation failed: ${JSON.stringify(staleBot.value)}; stderr: ${child.stderrText}`);
    assert.equal(typeof staleBot.value.botId, "string", `stale-revision setup returned no botId: ${JSON.stringify(staleBot.value)}`);
    let staleSubmitResult;
    const staleSubmitPromise = call(`/api/v1/bots/${staleBot.value.botId}/submit`, {
      method: "POST", token: "session-api-c", body: { revision: 1 }, idempotencyKey: "m2-stale-revision-0001",
    }).then(result => { staleSubmitResult = result; return result; });
    let staleVersion;
    // Bot validation runs in the API child while the full suite may be CPU-bound.
    // Wait on the persisted snapshot for a bounded 15s, and fail immediately if
    // the child exits, instead of racing a short 2s polling window.
    for (let i = 0; i < 150 && child.exitCode === null; i += 1) {
      db = new DatabaseSync(path);
      staleVersion = db.prepare("SELECT id FROM bot_versions WHERE bot_id = ? AND revision = 1").get(staleBot.value.botId);
      db.close();
      if (staleVersion) break;
      if (staleSubmitResult) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(staleVersion, `submit should validate and persist its snapshot before the injected pause (API exit code: ${child.exitCode ?? "still running"}; response: ${JSON.stringify(staleSubmitResult)}; stderr: ${child.stderrText})`);
    const concurrentEdit = await call(`/api/v1/bots/${staleBot.value.botId}/edit`, {
      method: "POST", token: "session-api-c", body: { revision: 1, bot: { ...bot, name: "Edited during submit" } },
    });
    assert.equal(concurrentEdit.response.status, 200);
    assert.equal(concurrentEdit.value.revision, 2);
    const staleSubmit = await staleSubmitPromise;
    assert.equal(staleSubmit.response.status, 409);
    assert.equal(staleSubmit.value.code, "VERSION_CHANGED");

    const botC = await call("/api/v1/bots", { method: "POST", token: "session-api-c", body: { bot } });
    const canceledSubmit = await call(`/api/v1/bots/${botC.value.botId}/submit`, { method: "POST", token: "session-api-c", body: { revision: 1 }, idempotencyKey: "m2-cancel-submit-0001" });
    assert.equal(canceledSubmit.response.status, 202);
    assert.equal(canceledSubmit.value.status, "queued");
    const botC2 = await call("/api/v1/bots", { method: "POST", token: "session-api-c", body: { bot: { ...bot, name: "Second bot" } } });
    const activeConflict = await call(`/api/v1/bots/${botC2.value.botId}/submit`, { method: "POST", token: "session-api-c", body: { revision: 1 }, idempotencyKey: "m2-other-bot-key-0001" });
    const keyConflict = await call(`/api/v1/bots/${botC2.value.botId}/submit`, { method: "POST", token: "session-api-c", body: { revision: 1 }, idempotencyKey: "m2-cancel-submit-0001" });
    assert.equal(activeConflict.response.status, 409);
    assert.equal(keyConflict.response.status, 409);
    const botOutsider = await call("/api/v1/bots", { method: "POST", token: "session-outsider", body: { bot } });
    const cancelRace = await Promise.all([
      call(`/api/v1/submissions/${canceledSubmit.value.submissionId}/cancel`, { method: "POST", token: "session-api-c" }),
      call(`/api/v1/bots/${botOutsider.value.botId}/submit`, { method: "POST", token: "session-outsider", body: { revision: 1 }, idempotencyKey: "m2-cancel-race-outsider-0001" }),
    ]);
    const raceCancel = cancelRace[0];
    const raceSubmit = cancelRace[1];
    assert.equal(raceSubmit.response.status, 202);
    if (raceCancel.response.status === 200) {
      assert.equal(raceCancel.value.status, "cancelled");
      assert.equal(raceSubmit.value.status, "queued");
      const cancelledAgain = await call(`/api/v1/submissions/${canceledSubmit.value.submissionId}/cancel`, { method: "POST", token: "session-api-c" });
      assert.equal(cancelledAgain.value.status, "cancelled");
      const cleanup = await call(`/api/v1/submissions/${raceSubmit.value.submissionId}/cancel`, { method: "POST", token: "session-outsider" });
      assert.equal(cleanup.value.status, "cancelled");
    } else {
      assert.equal(raceCancel.response.status, 409);
      const [cStatus, outsiderStatus] = await Promise.all([
        call(`/api/v1/submissions/${canceledSubmit.value.submissionId}`, { token: "session-api-c" }),
        call(`/api/v1/submissions/${raceSubmit.value.submissionId}`, { token: "session-outsider" }),
      ]);
      assert.ok(["matched", "running", "completed"].includes(cStatus.value.status));
      assert.equal(outsiderStatus.value.matchId, cStatus.value.matchId);
      let settled;
      for (let i = 0; i < 500; i += 1) {
        settled = await call(`/api/v1/submissions/${canceledSubmit.value.submissionId}`, { token: "session-api-c" });
        if (["completed", "failed"].includes(settled.value.status)) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      assert.equal(settled.value.status, "completed");
      assert.equal(settled.value.matchId, cStatus.value.matchId);
    }

    const simulated = await call("/api/simulate", { method: "POST", body: { a: pkg, b: pkg, seed: 42, mode: "official" } });
    assert.equal(simulated.response.status, 200);
    assert.equal(simulated.value.replay.manifest.mode, "test");

    db = new DatabaseSync(path);
    try {
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM idempotency_keys WHERE idempotency_key = 'm2-concurrent-submit-0001'").get().n, 1);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM submissions WHERE user_id = 'api-b'").get().n, 3);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM submissions WHERE user_id = 'api-b' AND status IN ('queued', 'matched', 'running')").get().n, 0);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM replays WHERE id = ?").get(newMatchId).n, 1);
      assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    } finally { db.close(); }
  } finally {
    await stopApi(child);
    await rm(dir, { recursive: true, force: true });
  }
});
