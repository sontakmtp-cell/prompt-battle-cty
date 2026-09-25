import { createServer } from "node:http";
import { randomInt, randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import worker from "./index.mjs";
import { handlePage } from "../../../scripts/web-static.mjs";
import { runIsolated } from "../../../scripts/run-isolated.mjs";
import { VERSIONS } from "@prompt-chien/contracts";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const databasePath = resolve(process.env.PROMPTCHIEN_DB_PATH ?? resolve(root, "data/promptchien.sqlite"));
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";

await mkdir(dirname(databasePath), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec("PRAGMA foreign_keys = ON");

function transaction(operation) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* already rolled back */ }
    throw error;
  }
}

function backfillM2() {
  const waiting = db.prepare("SELECT submission_id, user_id, version_id, queued_at FROM waiting_submissions_m1_legacy ORDER BY queued_at, submission_id").all();
  const restore = db.prepare("INSERT OR IGNORE INTO submissions (id, user_id, version_id, status, match_id, created_at, updated_at) SELECT ?, ?, ?, 'queued', NULL, ?, ? WHERE EXISTS (SELECT 1 FROM bot_versions WHERE id = ? AND user_id = ?)");
  const markWaiting = db.prepare("UPDATE waiting_submissions_m1_legacy SET migration_status = ?, migration_error = ? WHERE submission_id = ?");
  for (const row of waiting) {
    const user = db.prepare("SELECT id FROM users WHERE id = ?").get(row.user_id);
    const version = db.prepare("SELECT id, user_id FROM bot_versions WHERE id = ?").get(row.version_id);
    let migrationStatus = "rejected", migrationError;
    if (!user) migrationError = "Referenced user does not exist; legacy queue row was preserved without restoring a submission.";
    else if (!version) migrationError = "Referenced bot version does not exist; legacy queue row was preserved without restoring a submission.";
    else if (version.user_id !== row.user_id) migrationError = "Referenced bot version belongs to a different user; legacy queue row was preserved without restoring a submission.";
    else {
      const existing = db.prepare("SELECT user_id, version_id, status FROM submissions WHERE id = ?").get(row.submission_id);
      if (existing) {
        if (existing.user_id === row.user_id && existing.version_id === row.version_id && existing.status === "queued") {
          migrationStatus = "restored";
          migrationError = null;
        } else migrationError = "Submission ID already exists with conflicting data or status; legacy queue row was preserved without changing it.";
      } else {
        restore.run(row.submission_id, row.user_id, row.version_id, row.queued_at, row.queued_at, row.version_id, row.user_id);
        const restored = db.prepare("SELECT user_id, version_id, status FROM submissions WHERE id = ?").get(row.submission_id);
        if (restored && restored.user_id === row.user_id && restored.version_id === row.version_id && restored.status === "queued") {
          migrationStatus = "restored";
          migrationError = null;
        } else migrationError = "Submission could not be restored without violating queue data; legacy queue row was preserved.";
      }
    }
    markWaiting.run(migrationStatus, migrationError, row.submission_id);
  }

  const matched = db.prepare("SELECT id, user_id, version_id, match_id, created_at FROM submissions WHERE status = 'matched' ORDER BY match_id, created_at, id").all();
  const groups = new Map();
  for (const row of matched) {
    const key = row.match_id ?? `orphan:${row.id}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  for (const [matchId, rows] of groups) {
    const replayRow = typeof matchId === "string" && !matchId.startsWith("orphan:")
      ? db.prepare("SELECT id, seed, replay_json, result_json, official, created_at FROM replays WHERE id = ? AND official = 1").get(matchId)
      : null;
    let replay = null;
    try { replay = replayRow ? JSON.parse(replayRow.replay_json) : null; } catch { /* legacy replay is corrupt */ }
    const a = rows[0], b = rows[1];
    const packages = replay?.manifest?.packages;
    let validPair = rows.length === 2 && a.user_id !== b.user_id && replayRow &&
      replay.manifest?.mode === "official" && replay.manifest?.replayId === matchId && replay.manifest?.seed === replayRow.seed &&
      typeof packages?.A?.packageHash === "string" && typeof packages?.B?.packageHash === "string" &&
      packages.A.definition && packages.B.definition;
    let versionA, versionB, sideA = a, sideB = b;
    if (validPair) {
      const versions = db.prepare("SELECT id, user_id, package_hash FROM bot_versions WHERE id IN (?, ?)").all(a.version_id, b.version_id);
      versionA = versions.find(version => version.id === a.version_id);
      versionB = versions.find(version => version.id === b.version_id);
      const direct = versionA?.user_id === a.user_id && versionB?.user_id === b.user_id &&
        versionA.package_hash === packages.A.packageHash && versionB.package_hash === packages.B.packageHash;
      const swapped = versionA?.user_id === a.user_id && versionB?.user_id === b.user_id &&
        versionA.package_hash === packages.B.packageHash && versionB.package_hash === packages.A.packageHash;
      validPair = Boolean(versionA && versionB && (direct || swapped));
      if (validPair && swapped && !direct) [sideA, sideB] = [b, a];
    }
    if (validPair) {
      const snapshot = {
        A: { submissionId: sideA.id, userId: sideA.user_id, versionId: sideA.version_id, packageHash: packages.A.packageHash, package: packages.A },
        B: { submissionId: sideB.id, userId: sideB.user_id, versionId: sideB.version_id, packageHash: packages.B.packageHash, package: packages.B },
      };
      db.prepare(`INSERT OR IGNORE INTO official_matches
        (id, submission_a_id, submission_b_id, user_a_id, user_b_id, version_a_id, version_b_id, snapshot_json, seed, engine_version, ruleset_version, status, attempts, result_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', 0, ?, ?, ?)`)
        .run(matchId, sideA.id, sideB.id, sideA.user_id, sideB.user_id, sideA.version_id, sideB.version_id, JSON.stringify(snapshot), replayRow.seed,
          replay.manifest.engineVersion ?? VERSIONS.engine, replay.manifest.rulesetVersion ?? VERSIONS.ruleset,
          replayRow.result_json, replayRow.created_at, replayRow.created_at);
      db.prepare("UPDATE submissions SET status = 'completed', updated_at = ? WHERE id IN (?, ?)").run(replayRow.created_at, a.id, b.id);
      continue;
    }
    const reason = "Legacy match could not be reconciled with two participants and an official replay.";
    const placeholders = rows.map(() => "?").join(",");
    db.prepare(`UPDATE submissions SET status = 'failed', error_code = 'MIGRATION_ORPHAN_MATCH', error_message = ?, updated_at = created_at WHERE id IN (${placeholders})`)
      .run(reason, ...rows.map(row => row.id));
  }

  const active = db.prepare("SELECT id, user_id, created_at FROM submissions WHERE status IN ('queued', 'matched', 'running') ORDER BY created_at, id").all();
  const firstByUser = new Set();
  for (const row of active) {
    if (!firstByUser.has(row.user_id)) { firstByUser.add(row.user_id); continue; }
    db.prepare("UPDATE submissions SET status = 'failed', error_code = 'MIGRATION_DUPLICATE_ACTIVE', error_message = 'Duplicate active legacy submission was closed during migration.', updated_at = ? WHERE id = ?")
      .run(Date.now(), row.id);
  }

  const oldKeys = db.prepare("SELECT user_id, idempotency_key, response_json FROM idempotency_keys WHERE tool_name = 'submit_bot'").all();
  const updateKey = db.prepare("UPDATE idempotency_keys SET request_hash = ?, submission_id = ? WHERE user_id = ? AND tool_name = 'submit_bot' AND idempotency_key = ?");
  for (const row of oldKeys) {
    let response = null;
    try { response = JSON.parse(row.response_json); } catch { /* keep the legacy key bound to no request */ }
    const version = response?.version;
    const submissionId = typeof response?.submissionId === "string" ? response.submissionId : null;
    const submission = submissionId && db.prepare("SELECT id FROM submissions WHERE id = ? AND user_id = ?").get(submissionId, row.user_id);
    const versionRow = version?.id && db.prepare("SELECT bot_id, revision FROM bot_versions WHERE id = ? AND user_id = ?").get(version.id, row.user_id);
    const requestHash = submission && versionRow && version.botId === versionRow.bot_id && version.revision === versionRow.revision
      ? JSON.stringify({ botId: versionRow.bot_id, revision: versionRow.revision })
      : `legacy-unbound:${row.idempotency_key}`;
    updateKey.run(requestHash, submission ? submission.id : null, row.user_id, row.idempotency_key);
  }
  db.exec("CREATE UNIQUE INDEX submissions_one_active_user ON submissions(user_id) WHERE status IN ('queued', 'matched', 'running')");
}

const userVersion = db.prepare("PRAGMA user_version").get().user_version;
if (userVersion < 1) {
  const sql = await readFile(new URL("../migrations/0001_m3.sql", import.meta.url), "utf8");
  transaction(() => { db.exec(sql); db.exec("PRAGMA user_version = 1"); });
}
if (userVersion < 2) {
  const sql = await readFile(new URL("../node-migrations/0002_queue.sql", import.meta.url), "utf8");
  transaction(() => { db.exec(sql); db.exec("PRAGMA user_version = 2"); });
}
if (userVersion < 3) {
  const sql = await readFile(new URL("../node-migrations/0003_google_admin.sql", import.meta.url), "utf8");
  transaction(() => { db.exec(sql); db.exec("PRAGMA user_version = 3"); });
}
if (userVersion < 4) {
  const sql = await readFile(new URL("../node-migrations/0004_official_matches.sql", import.meta.url), "utf8");
  transaction(() => {
    db.exec(sql);
    backfillM2();
    db.exec("PRAGMA user_version = 4");
  });
}

class NodeStatement {
  constructor(sql, values = []) {
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new NodeStatement(this.sql, values);
  }

  first() {
    return db.prepare(this.sql).get(...this.values) ?? null;
  }

  all() {
    return { results: db.prepare(this.sql).all(...this.values) };
  }

  run() {
    const result = db.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }
}

const nodeDb = { prepare: sql => new NodeStatement(sql) };

class NodeMatchQueue {
  constructor() {
    this.processor = null;
    this.pumping = false;
    this.stopping = false;
    this.pumpPromise = Promise.resolve();
  }

  getByName() {
    return this;
  }

  fail(message, status, code) {
    const error = new Error(message);
    error.status = status;
    error.data = { code };
    throw error;
  }

  view(row) {
    if (!row) return null;
    const match = row.match_id ? db.prepare("SELECT result_json FROM official_matches WHERE id = ?").get(row.match_id) : null;
    return {
      submissionId: row.id,
      status: row.status,
      createdAt: row.created_at,
      ...(row.error_code ? { errorCode: row.error_code } : {}),
      ...(row.error_message ? { errorMessage: row.error_message } : {}),
      ...(row.match_id ? { matchId: row.match_id } : {}),
      ...(row.status === "queued" ? { position: db.prepare("SELECT COUNT(*) AS n FROM submissions WHERE status = 'queued' AND (created_at < ? OR (created_at = ? AND id <= ?))").get(row.created_at, row.created_at, row.id).n } : {}),
      ...(row.status === "completed" && row.match_id ? { replayId: row.match_id } : {}),
      ...(row.status === "completed" && row.match_id ? { replayUrl: `/api/v1/replays/${encodeURIComponent(row.match_id)}` } : {}),
      ...(row.status === "completed" && match?.result_json ? { result: JSON.parse(match.result_json) } : {}),
    };
  }

  lookup(userId, idempotencyKey, requestHash) {
    const oldKey = db.prepare("SELECT request_hash, submission_id FROM idempotency_keys WHERE user_id = ? AND tool_name = 'submit_bot' AND idempotency_key = ?").get(userId, idempotencyKey);
    if (!oldKey) return null;
    if (oldKey.request_hash !== requestHash) this.fail("Idempotency key was already used for another bot revision.", 409, "IDEMPOTENCY_KEY_REUSED");
    const row = db.prepare("SELECT id, user_id, status, match_id, created_at, error_code, error_message FROM submissions WHERE id = ? AND user_id = ?").get(oldKey.submission_id, userId);
    if (!row) this.fail("The submission bound to this idempotency key is unavailable.", 409, "IDEMPOTENCY_SUBMISSION_MISSING");
    return this.view(row);
  }

  submit(entry) {
    const result = transaction(() => {
      const existing = this.lookup(entry.userId, entry.idempotencyKey, entry.requestHash);
      if (existing) return existing;
      const bot = db.prepare("SELECT revision FROM bots WHERE id = ? AND user_id = ?").get(entry.botId, entry.userId);
      if (!bot || bot.revision !== entry.revision) this.fail("Bot revision changed before submit.", 409, "VERSION_CHANGED");
      const active = db.prepare("SELECT id FROM submissions WHERE user_id = ? AND status IN ('queued', 'matched', 'running') LIMIT 1").get(entry.userId);
      if (active) this.fail("You already have an active submission.", 409, "SUBMISSION_ALREADY_ACTIVE");
      const version = db.prepare("SELECT bot_id, revision FROM bot_versions WHERE id = ? AND user_id = ?").get(entry.versionId, entry.userId);
      if (!version || version.bot_id !== entry.botId || version.revision !== entry.revision) this.fail("Validated bot version changed before submit.", 409, "VERSION_CHANGED");
      db.prepare("INSERT INTO submissions (id, user_id, version_id, status, created_at, updated_at) VALUES (?, ?, ?, 'queued', ?, ?)")
        .run(entry.submissionId, entry.userId, entry.versionId, entry.createdAt, entry.createdAt);
      db.prepare("INSERT INTO idempotency_keys (user_id, tool_name, idempotency_key, response_json, created_at, request_hash, submission_id) VALUES (?, 'submit_bot', ?, ?, ?, ?, ?)")
        .run(entry.userId, entry.idempotencyKey, JSON.stringify({ submissionId: entry.submissionId }), entry.createdAt, entry.requestHash, entry.submissionId);
      this.pairQueued(entry.createdAt, true);
      return this.view(db.prepare("SELECT id, user_id, status, match_id, created_at, error_code, error_message FROM submissions WHERE id = ?").get(entry.submissionId));
    });
    this.kick();
    return result;
  }

  pairQueued(timestamp = Date.now(), alreadyInTransaction = false) {
    let paired = 0;
    while (true) {
      const rows = db.prepare(`SELECT s.id, s.user_id, s.version_id, s.created_at, v.package_hash, v.package_json
        FROM submissions s JOIN bot_versions v ON v.id = s.version_id AND v.user_id = s.user_id
        WHERE s.status = 'queued' ORDER BY s.created_at, s.id`).all();
      if (rows.length < 2) return paired;
      const first = rows[0];
      const second = rows.find((row, index) => index > 0 && row.user_id !== first.user_id);
      if (!second) return paired;
      let packageA, packageB;
      try { packageA = JSON.parse(first.package_json); } catch { packageA = null; }
      if (!packageA || packageA.packageHash !== first.package_hash) {
        db.prepare("UPDATE submissions SET status = 'failed', error_code = 'INVALID_SNAPSHOT', error_message = 'A validated bot package could not be restored.', updated_at = ? WHERE id = ? AND status = 'queued'")
          .run(timestamp, first.id);
        continue;
      }
      try { packageB = JSON.parse(second.package_json); } catch { packageB = null; }
      if (!packageB || packageB.packageHash !== second.package_hash) {
        db.prepare("UPDATE submissions SET status = 'failed', error_code = 'INVALID_SNAPSHOT', error_message = 'A validated bot package could not be restored.', updated_at = ? WHERE id = ? AND status = 'queued'")
          .run(timestamp, second.id);
        continue;
      }
      const matchId = `match_${randomUUID()}`;
      const seed = randomInt(0, 0x100000000);
      const snapshot = {
        A: { submissionId: first.id, userId: first.user_id, versionId: first.version_id, packageHash: first.package_hash, package: packageA },
        B: { submissionId: second.id, userId: second.user_id, versionId: second.version_id, packageHash: second.package_hash, package: packageB },
      };
      const createMatch = () => {
        db.prepare("INSERT INTO official_matches (id, submission_a_id, submission_b_id, user_a_id, user_b_id, version_a_id, version_b_id, snapshot_json, seed, engine_version, ruleset_version, status, attempts, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'matched', 0, ?, ?)")
          .run(matchId, first.id, second.id, first.user_id, second.user_id, first.version_id, second.version_id, JSON.stringify(snapshot), seed, VERSIONS.engine, VERSIONS.ruleset, timestamp, timestamp);
        db.prepare("UPDATE submissions SET status = 'matched', match_id = ?, updated_at = ? WHERE id IN (?, ?) AND status = 'queued'")
          .run(matchId, timestamp, first.id, second.id);
      };
      if (alreadyInTransaction) createMatch(); else transaction(createMatch);
      paired += 1;
    }
  }

  submission(userId, submissionId) {
    const row = db.prepare("SELECT id, user_id, status, match_id, created_at, error_code, error_message FROM submissions WHERE id = ? AND user_id = ?").get(submissionId, userId);
    return row ? this.view(row) : null;
  }

  list(userId, cursor, limit) {
    const rows = db.prepare("SELECT id, user_id, status, match_id, created_at, error_code, error_message FROM submissions WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?")
      .all(userId, limit + 1, cursor);
    return { items: rows.slice(0, limit).map(row => this.view(row)), nextCursor: rows.length > limit ? cursor + limit : null };
  }

  cancel(userId, submissionId) {
    return transaction(() => {
      const row = db.prepare("SELECT id, user_id, status, match_id, created_at, error_code, error_message FROM submissions WHERE id = ? AND user_id = ?").get(submissionId, userId);
      if (!row) this.fail("Submission not found.", 404, "SUBMISSION_NOT_FOUND");
      if (row.status === "cancelled") return this.view(row);
      if (row.status !== "queued") this.fail("Only a queued submission can be cancelled.", 409, "SUBMISSION_NOT_QUEUED");
      db.prepare("UPDATE submissions SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'queued'").run(Date.now(), submissionId);
      return this.view(db.prepare("SELECT id, user_id, status, match_id, created_at, error_code, error_message FROM submissions WHERE id = ?").get(submissionId));
    });
  }

  match(userId, matchId) {
    const row = db.prepare("SELECT * FROM official_matches WHERE id = ? AND (user_a_id = ? OR user_b_id = ?)").get(matchId, userId, userId);
    if (!row) return null;
    const snapshot = JSON.parse(row.snapshot_json);
    return {
      matchId: row.id, status: row.status, createdAt: row.created_at, seed: row.seed,
      engineVersion: row.engine_version, rulesetVersion: row.ruleset_version,
      packageHashes: { A: snapshot.A.packageHash, B: snapshot.B.packageHash },
      ...(row.result_json ? { result: JSON.parse(row.result_json) } : {}),
      ...(row.status === "completed" ? { replayId: row.id } : {}),
    };
  }

  isParticipant(userId, matchId) {
    return Boolean(db.prepare("SELECT 1 FROM official_matches WHERE id = ? AND (user_a_id = ? OR user_b_id = ?)").get(matchId, userId, userId));
  }

  sharedReplay(matchId) {
    return Boolean(db.prepare("SELECT 1 FROM official_matches WHERE id = ? AND status = 'completed'").get(matchId));
  }

  cancelUser(userId) {
    transaction(() => db.prepare("UPDATE submissions SET status = 'cancelled', updated_at = ? WHERE user_id = ? AND status = 'queued'").run(Date.now(), userId));
  }

  claim() {
    return transaction(() => {
      db.prepare("UPDATE official_matches SET status = 'failed', error_code = 'RETRY_EXHAUSTED', error_message = 'The match could not be completed after retry.', updated_at = ? WHERE status IN ('matched', 'running') AND attempts >= 2")
        .run(Date.now());
      db.prepare("UPDATE submissions SET status = 'failed', error_code = 'RETRY_EXHAUSTED', error_message = 'The match could not be completed after retry.', updated_at = ? WHERE match_id IN (SELECT id FROM official_matches WHERE status = 'failed' AND error_code = 'RETRY_EXHAUSTED') AND status IN ('matched', 'running')")
        .run(Date.now());
      const row = db.prepare("SELECT * FROM official_matches WHERE status IN ('matched', 'running') ORDER BY created_at, id LIMIT 1").get();
      if (!row) return null;
      const nextAttempts = row.attempts + 1;
      db.prepare("UPDATE official_matches SET status = 'running', attempts = ?, updated_at = ? WHERE id = ?").run(nextAttempts, Date.now(), row.id);
      db.prepare("UPDATE submissions SET status = 'running', updated_at = ? WHERE match_id = ? AND status = 'matched'").run(Date.now(), row.id);
      return { ...row, status: "running", attempts: nextAttempts, snapshot: JSON.parse(row.snapshot_json) };
    });
  }

  complete(match, replay) {
    const replayJson = JSON.stringify(replay);
    if (Buffer.byteLength(replayJson) > 4 * 1024 * 1024) throw new Error("Replay exceeded the storage limit");
    transaction(() => {
      db.prepare("INSERT INTO replays (id, owner_user_id, status, seed, replay_json, result_json, official, created_at) VALUES (?, ?, 'completed', ?, ?, ?, 1, ?) ON CONFLICT(id) DO NOTHING")
        .run(match.id, match.user_a_id, match.seed, replayJson, JSON.stringify(replay.manifest.result), Date.now());
      db.prepare("UPDATE official_matches SET status = 'completed', result_json = ?, error_code = NULL, error_message = NULL, updated_at = ? WHERE id = ?")
        .run(JSON.stringify(replay.manifest.result), Date.now(), match.id);
      db.prepare("UPDATE submissions SET status = 'completed', error_code = NULL, error_message = NULL, updated_at = ? WHERE match_id = ? AND status IN ('matched', 'running')")
        .run(Date.now(), match.id);
    });
  }

  retryOrFail(match, error) {
    const exhausted = match.attempts >= 2;
    console.error(`Official match ${match.id} attempt ${match.attempts} failed:`, error);
    transaction(() => {
      db.prepare("UPDATE official_matches SET status = ?, error_code = ?, error_message = ?, updated_at = ? WHERE id = ?")
        .run(exhausted ? "failed" : "matched", exhausted ? "SIMULATION_FAILED" : null, exhausted ? "The match could not be completed after retry." : null, Date.now(), match.id);
      db.prepare("UPDATE submissions SET status = ?, error_code = ?, error_message = ?, updated_at = ? WHERE match_id = ? AND status IN ('matched', 'running')")
        .run(exhausted ? "failed" : "matched", exhausted ? "SIMULATION_FAILED" : null, exhausted ? "The match could not be completed after retry." : null, Date.now(), match.id);
    });
  }

  start(processor) {
    this.processor = processor;
    this.stopping = false;
    this.kick();
  }

  kick() {
    if (!this.processor || this.pumping || this.stopping) return;
    this.pumping = true;
    this.pumpPromise = (async () => {
      try {
        this.pairQueued();
        while (!this.stopping) {
          const match = this.claim();
          if (!match) break;
          try {
            const replay = await this.processor(match);
            this.complete(match, replay);
          } catch (error) {
            this.retryOrFail(match, error);
            if (process.env.NODE_ENV === "test" && match.attempts === 1 && Number(process.env.PROMPTCHIEN_TEST_RETRY_PAUSE_MS) > 0) {
              await new Promise(resolve => setTimeout(resolve, Math.min(Number(process.env.PROMPTCHIEN_TEST_RETRY_PAUSE_MS), 5000)));
            }
          }
          this.pairQueued();
        }
      } catch (error) {
        console.error("Official match worker stopped:", error);
      } finally {
        this.pumping = false;
      }
    })();
  }

  stop() {
    this.stopping = true;
    return this.pumpPromise;
  }
}

const matchQueue = new NodeMatchQueue();

const env = {
  DB: nodeDb,
  MATCH_QUEUE: matchQueue,
  WEB_ORIGIN: process.env.WEB_ORIGIN ?? "https://prompt-battle-cty.vercel.app,http://127.0.0.1:4174",
  REPLAY_SHARE_SECRET: process.env.REPLAY_SHARE_SECRET ?? "",
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? "268703770614-btcocg67p6r1f0hb9gh6i1sbm2h2sn36.apps.googleusercontent.com",
  GOOGLE_JWKS_URL: process.env.NODE_ENV === "test" ? process.env.GOOGLE_JWKS_URL : undefined,
};

function headersFrom(request) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  return headers;
}

async function toRequest(request, body) {
  const forwardedProto = String(request.headers["x-forwarded-proto"] ?? "http").split(",")[0].trim();
  const forwardedHost = String(request.headers["x-forwarded-host"] ?? request.headers.host ?? `127.0.0.1:${port}`);
  const init = { method: request.method, headers: headersFrom(request) };
  if (body.length && request.method !== "GET" && request.method !== "HEAD") {
    init.body = body;
    init.duplex = "half";
  }
  return new Request(`${forwardedProto}://${forwardedHost}${request.url}`, init);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `127.0.0.1:${port}`}`);
    if (request.method === "GET" && (url.pathname === "/panel" || url.pathname.startsWith("/panel/"))) {
      if (handlePage(response, url, "/panel")) return;
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const result = await worker.fetch(await toRequest(request, Buffer.concat(chunks)), env);
    response.statusCode = result.status;
    const setCookies = result.headers.getSetCookie?.() ?? [];
    for (const [key, value] of result.headers) if (key !== "set-cookie") response.setHeader(key, value);
    if (setCookies.length) response.setHeader("set-cookie", setCookies);
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch (error) {
    response.statusCode = 500;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
  }
});

matchQueue.start(async match => {
  if (process.env.NODE_ENV === "test" && Number(process.env.PROMPTCHIEN_TEST_SIM_DELAY_MS) > 0) {
    await new Promise(resolve => setTimeout(resolve, Number(process.env.PROMPTCHIEN_TEST_SIM_DELAY_MS)));
  }
  if (process.env.NODE_ENV === "test" && process.env.PROMPTCHIEN_TEST_SIM_FAILURE === "always") {
    throw new Error("test-injected-simulation-failure");
  }
  const output = await runIsolated({
    kind: "simulate",
    a: match.snapshot.A.package,
    b: match.snapshot.B.package,
    seed: match.seed,
  });
  const replay = output.replay;
  replay.manifest.mode = "official";
  replay.manifest.replayId = match.id;
  return replay;
});

server.listen(port, host, () => console.log(`PROMPT CHIẾN Node API: http://${host}:${port}`));

function shutdown() {
  matchQueue.stop();
  server.close(async () => { await matchQueue.stop(); db.close(); });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
