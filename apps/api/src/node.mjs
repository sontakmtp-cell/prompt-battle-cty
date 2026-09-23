import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import worker from "./index.mjs";
import { handlePage } from "../../../scripts/web-static.mjs";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const databasePath = resolve(process.env.PROMPTCHIEN_DB_PATH ?? resolve(root, "data/promptchien.sqlite"));
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";

await mkdir(dirname(databasePath), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec("PRAGMA foreign_keys = ON");
db.exec(await readFile(new URL("../migrations/0001_m3.sql", import.meta.url), "utf8"));
db.exec(await readFile(new URL("../node-migrations/0002_queue.sql", import.meta.url), "utf8"));
if (db.prepare("PRAGMA user_version").get().user_version < 3) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(await readFile(new URL("../node-migrations/0003_google_admin.sql", import.meta.url), "utf8"));
    db.exec("PRAGMA user_version = 3; COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
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
  getByName() {
    return this;
  }

  enqueue(entry) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const existing = db.prepare("SELECT submission_id FROM waiting_submissions WHERE user_id = ? LIMIT 1").get(entry.userId);
      if (existing) throw new Error("QUEUE_ALREADY_WAITING");
      db.prepare("INSERT INTO waiting_submissions (submission_id, user_id, version_id, queued_at) VALUES (?, ?, ?, ?)").run(entry.submissionId, entry.userId, entry.versionId, entry.queuedAt);
      const rows = db.prepare("SELECT submission_id, user_id, version_id, queued_at FROM waiting_submissions ORDER BY queued_at, submission_id").all();
      for (let index = 0; index < rows.length; index += 1) {
        const first = rows[index];
        const second = rows.slice(index + 1).find(candidate => candidate.user_id !== first.user_id);
        if (!second) continue;
        db.prepare("DELETE FROM waiting_submissions WHERE submission_id IN (?, ?)").run(first.submission_id, second.submission_id);
        db.exec("COMMIT");
        return { status: "matched", pair: { A: first, B: second } };
      }
      db.exec("COMMIT");
      return { status: "queued", position: rows.length };
    } catch (error) {
      try { db.exec("ROLLBACK"); } catch { /* already rolled back */ }
      throw error;
    }
  }

  snapshot() {
    return db.prepare("SELECT submission_id, user_id, version_id, queued_at FROM waiting_submissions ORDER BY queued_at, submission_id").all();
  }

  cancelUser(userId) {
    db.prepare("DELETE FROM waiting_submissions WHERE user_id = ?").run(userId);
  }
}

const env = {
  DB: nodeDb,
  MATCH_QUEUE: new NodeMatchQueue(),
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

server.listen(port, host, () => console.log(`PROMPT CHIẾN Node API: http://${host}:${port}`));

function shutdown() {
  server.close(() => db.close());
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
