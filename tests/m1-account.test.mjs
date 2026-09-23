import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

const bot = JSON.parse(await readFile(new URL("../examples/bots/spear.json", import.meta.url), "utf8"));

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}

test("Google identities, web/MCP ownership and admin revocation share one SQLite account", { timeout: 30000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "promptchien-m1-"));
  const path = join(dir, "api.sqlite");
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const publicJwk = { ...await exportJWK(publicKey), kid: "test-key", alg: "RS256", use: "sig" };
  const jwks = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json", "cache-control": "max-age=60" });
    response.end(JSON.stringify({ keys: [publicJwk] }));
  });
  const jwksPort = await listen(jwks);
  const probe = createServer();
  const port = await listen(probe);
  probe.close();
  await once(probe, "close");
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["apps/api/src/node.mjs"], {
    env: { ...process.env, NODE_ENV: "test", PORT: String(port), PROMPTCHIEN_DB_PATH: path, GOOGLE_CLIENT_ID: "test-client", GOOGLE_JWKS_URL: `http://127.0.0.1:${jwksPort}/certs`, WEB_ORIGIN: base },
    stdio: "ignore",
  });
  async function token(sub, email, overrides = {}) {
    return new SignJWT({ email, name: sub, sub })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(overrides.iss ?? "https://accounts.google.com")
      .setAudience(overrides.aud ?? "test-client")
      .setIssuedAt()
      .setExpirationTime(overrides.exp ?? "1h")
      .sign(privateKey);
  }
  async function request(method, route, body, auth = {}) {
    const response = await fetch(base + route, {
      method,
      headers: { ...(body ? { "content-type": "application/json" } : {}), ...(auth.cookie ? { cookie: auth.cookie } : {}), ...(auth.bearer ? { authorization: `Bearer ${auth.bearer}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: "manual",
    });
    const raw = await response.text();
    let value;
    try { value = JSON.parse(raw); } catch { value = raw; }
    return { response, value };
  }
  try {
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base + "/healthz")).ok) break; } catch { /* starting */ }
      await new Promise(resolve => setTimeout(resolve, 100));
      if (i === 99) throw new Error("Node API did not start");
    }
    const signIn = async (sub, email) => {
      const result = await request("POST", "/api/auth/google", { credential: await token(sub, email) });
      assert.equal(result.response.status, 200, JSON.stringify(result.value));
      return { user: result.value.user, cookie: result.response.headers.get("set-cookie").split(";", 1)[0] };
    };
    const config = await fetch(base + "/api/auth/google-config", { headers: { origin: base } });
    assert.equal(config.headers.get("access-control-allow-origin"), base);
    assert.equal((await config.json()).clientId, "test-client");
    const deniedOrigin = await fetch(base + "/api/auth/google", { method: "POST", headers: { origin: "https://evil.test", "content-type": "application/json" }, body: JSON.stringify({ credential: await token("origin", "origin@example.test") }) });
    assert.equal(deniedOrigin.status, 403);
    const a = await signIn("google-a", "same@example.test");
    const aAgain = await signIn("google-a", "changed@example.test");
    const b = await signIn("google-b", "changed@example.test");
    assert.equal(a.user.id, aAgain.user.id);
    assert.notEqual(a.user.id, b.user.id);
    assert.equal(a.user.role, "player");
    assert.equal((await request("POST", "/api/auth/register", { email: "x@example.test" })).response.status, 410);
    for (const credential of ["fake.token", await token("bad-aud", "x@example.test", { aud: "other-client" }), await token("bad-iss", "x@example.test", { iss: "https://evil.test" }), await token("expired", "x@example.test", { exp: -20 })]) {
      assert.equal((await request("POST", "/api/auth/google", { credential })).response.status, 401);
    }

    const created = await request("POST", "/api/v1/bots", { bot }, a);
    assert.equal(created.response.status, 201);
    const botId = created.value.botId;
    assert.equal((await request("GET", "/api/v1/bots", null, a)).value.bots[0].botId, botId);
    assert.deepEqual((await request("GET", "/api/v1/bots", null, b)).value.bots, []);
    assert.equal((await request("GET", `/api/v1/bots/${botId}`, null, b)).response.status, 404);
    assert.equal((await request("POST", `/api/v1/bots/${botId}/edit`, { revision: 0, bot }, a)).response.status, 409);
    const valid = await request("POST", `/api/v1/bots/${botId}/validate`, {}, a);
    assert.equal(valid.value.report.valid, true);

    const client = await request("POST", "/oauth/register", { client_name: "M1 test", redirect_uris: ["http://127.0.0.1:9999/callback"] });
    const verifier = "m1-verifier-012345678901234567890123456789";
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    const challenge = Buffer.from(digest).toString("base64url");
    const params = { client_id: client.value.client_id, redirect_uri: "http://127.0.0.1:9999/callback", response_type: "code", scope: "promptchien", state: "m1", code_challenge: challenge, code_challenge_method: "S256" };
    const form = new URLSearchParams(params);
    const approve = await fetch(base + "/oauth/authorize", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", cookie: a.cookie }, body: form, redirect: "manual" });
    assert.equal(approve.status, 302);
    const code = new URL(approve.headers.get("location")).searchParams.get("code");
    const exchange = await fetch(base + "/oauth/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", client_id: params.client_id, redirect_uri: params.redirect_uri, code, code_verifier: verifier }) });
    const accessToken = (await exchange.json()).access_token;
    assert.equal((await request("GET", "/api/auth/me", null, { bearer: accessToken })).value.user.id, a.user.id);
    const mcp = await fetch(base + "/mcp", { method: "POST", headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json", "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": "tools/call", "Mcp-Name": "get_bot" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_bot", arguments: { botId } } }) });
    assert.equal((await mcp.json()).result.structuredContent.botId, botId);

    assert.equal((await request("GET", "/api/admin/users", null, a)).response.status, 403);
    execFileSync(process.execPath, ["scripts/promote-admin.mjs", "--sub", "google-a"], { env: { ...process.env, PROMPTCHIEN_DB_PATH: path }, stdio: "ignore" });
    const db = new DatabaseSync(path);
    const bMcpToken = "m1-b-mcp-token";
    db.prepare("INSERT INTO oauth_tokens (access_token_hash, user_id, client_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(createHash("sha256").update(bMcpToken).digest("hex"), b.user.id, params.client_id, Date.now() + 60000, Date.now());
    assert.equal((await request("GET", "/api/auth/me", null, { bearer: bMcpToken })).value.user.id, b.user.id);
    assert.equal((await request("GET", "/admin", null, b)).response.status, 403);
    assert.equal((await request("GET", "/admin", null, a)).response.status, 200);
    assert.equal((await request("GET", "/api/admin/users", null, a)).value.users.length, 2);
    assert.equal((await request("POST", `/api/admin/users/${b.user.id}/lock`, {}, a)).response.status, 200);
    assert.equal((await request("GET", "/api/auth/me", null, b)).response.status, 401);
    assert.equal((await request("GET", "/api/auth/me", null, { bearer: bMcpToken })).response.status, 401);
    assert.equal((await request("POST", "/api/auth/google", { credential: await token("google-b", "changed@example.test") })).response.status, 403);
    assert.equal((await request("GET", "/api/admin/audit", null, a)).value.items[0].action, "lock");
    assert.equal((await request("POST", "/api/auth/logout", {}, a)).response.status, 200);
    assert.equal((await request("GET", "/api/auth/me", null, a)).response.status, 401);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users").get().n, 2);
    db.close();
  } finally {
    child.kill();
    if (child.exitCode === null) await once(child, "exit");
    jwks.close();
    await once(jwks, "close");
    await rm(dir, { recursive: true, force: true });
  }
});
