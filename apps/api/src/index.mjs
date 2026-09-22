import { inspectDefinition, validateBot } from "@prompt-chien/application";
import { RULESET, VERSIONS } from "@prompt-chien/contracts";
import { CONTRACT_SCHEMA } from "@prompt-chien/contracts/schema";
import { registerContractValidators } from "@prompt-chien/contracts/validation";
import { analyzeGeometry } from "@prompt-chien/core/geometry";
import { createReplay } from "@prompt-chien/core/replay";
import { packBot, verifyPackage } from "@prompt-chien/core/engine";
import { MatchQueue } from "./match-queue.mjs";
import { workerValidators } from "./worker-validation.mjs";
import { REFERENCE_DEFINITIONS, referencePackages } from "./catalog.mjs";
import {
  AGENT_MD,
  MCP_PROTOCOL_VERSION,
  TOOL_DEFINITIONS,
  mcpToolResult,
  rulesDocument,
  schemaFor,
  validateDefinition,
} from "./m3-contract.mjs";
import { M4_GAME_RESOURCE, M4_GAME_RESOURCE_META, M4_REPLAY_MIME, M4_REPLAY_RESOURCE, M4_REPLAY_RESOURCE_META } from "./m4-contract.mjs";
import { M4_WIDGET_HTML } from "./m4-widget.mjs";
import { M4_GAME_WIDGET_HTML } from "./m4-game-widget.mjs";

export { MatchQueue };

registerContractValidators(workerValidators);

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const SESSION_DAYS = 7;
const OAUTH_CODE_MINUTES = 5;
const ACCESS_TOKEN_DAYS = 30;
const encoder = new TextEncoder();

function httpError(message, status = 400, data = undefined) {
  const error = new Error(message);
  error.status = status;
  if (data !== undefined) error.data = data;
  return error;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function now() {
  return Date.now();
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomToken(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

async function hexDigest(value) {
  const input = typeof value === "string" ? encoder.encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", input);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function fromBase64url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function hmacDigest(secret, value) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

function replayShareSecret(env) {
  return String(env.REPLAY_SHARE_SECRET ?? env.INVITE_CODE ?? "");
}

async function issueReplayShare(env, replayId, ownerUserId) {
  const secret = replayShareSecret(env);
  if (!secret) return null;
  const payload = base64url(encoder.encode(JSON.stringify({ replayId, ownerUserId, expiresAt: now() + 86400000 })));
  return `${payload}.${await hmacDigest(secret, payload)}`;
}

async function verifyReplayShare(env, token, replayId) {
  const secret = replayShareSecret(env);
  if (!secret || typeof token !== "string") return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]+$/.test(signature)) return null;
  const expected = await hmacDigest(secret, payload);
  if (!sameSecret(expected, signature)) return null;
  try {
    const value = JSON.parse(new TextDecoder().decode(fromBase64url(payload)));
    if (value.replayId !== replayId || typeof value.ownerUserId !== "string" || !Number.isInteger(value.expiresAt) || value.expiresAt <= now()) return null;
    return value;
  } catch {
    return null;
  }
}

async function pkceChallenge(verifier) {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(verifier))));
}

function sameSecret(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: encoder.encode(salt), iterations: 100_000, hash: "SHA-256" },
    key,
    256,
  );
  return hexDigest(bits);
}

function allowedOrigins(env) {
  return String(env.WEB_ORIGIN ?? "").split(",").map(value => value.trim()).filter(Boolean);
}

function isAllowedOrigin(request, env) {
  const origin = request.headers.get("origin");
  return origin === new URL(request.url).origin || allowedOrigins(env).includes(origin) || origin === "https://web-sandbox.oaiusercontent.com" || origin?.endsWith(".web-sandbox.oaiusercontent.com") || (origin === "https://chatgpt.com" && new URL(request.url).pathname === "/mcp");
}

function allowsPublicDiscovery(request) {
  const origin = request.headers.get("origin");
  return origin === "https://chatgpt.com"
    || origin === "https://web-sandbox.oaiusercontent.com"
    || Boolean(origin?.endsWith(".web-sandbox.oaiusercontent.com"));
}

function oauthChallenge(request) {
  return {
    "www-authenticate": `Bearer realm="promptchien", resource_metadata="${originOf(request)}/.well-known/oauth-protected-resource"`,
  };
}

function corsHeaders(request, env) {
  const origin = request.headers.get("origin");
  const headers = { "cache-control": "no-store", vary: "Origin" };
  if (origin && isAllowedOrigin(request, env)) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-credentials"] = "true";
  }
  return headers;
}

function checkOrigin(request, env) {
  const origin = request.headers.get("origin");
  if (origin && !isAllowedOrigin(request, env)) throw httpError("Origin is not allowed.", 403);
}

function json(request, env, value, status = 200, extra = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...corsHeaders(request, env), "content-type": "application/json; charset=utf-8", ...extra },
  });
}

function text(request, env, value, contentType = "text/plain; charset=utf-8", status = 200, extra = {}) {
  return new Response(value, {
    status,
    headers: { ...corsHeaders(request, env), "content-type": contentType, ...extra },
  });
}

async function bodyText(request) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) throw httpError("Request body is too large.", 413);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_BODY_BYTES) throw httpError("Request body is too large.", 413);
  return new TextDecoder().decode(bytes);
}

async function bodyJson(request) {
  const raw = await bodyText(request);
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw httpError("Request body must be valid JSON.", 400);
  }
}

async function formBody(request) {
  return new URLSearchParams(await bodyText(request));
}

function objectBody(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw httpError("Request body must be a JSON object.", 400);
  return value;
}

function cookieValue(request, name) {
  const cookies = request.headers.get("cookie") ?? "";
  for (const part of cookies.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

function sessionCookie(token, request, maxAge = SESSION_DAYS * 86400) {
  const secure = new URL(request.url).protocol === "https:";
  return `pc_session=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=${secure ? "None" : "Lax"}${secure ? "; Secure" : ""}`;
}

function bearer(request) {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : null;
}

function bind(env, query, values) {
  const statement = env.DB.prepare(query);
  return values.length ? statement.bind(...values) : statement;
}

async function first(env, query, ...values) {
  return bind(env, query, values).first();
}

async function all(env, query, ...values) {
  const result = await bind(env, query, values).all();
  return result.results ?? [];
}

async function run(env, query, ...values) {
  return bind(env, query, values).run();
}

function publicUser(row) {
  return { id: row.id, email: row.email, displayName: row.display_name ?? row.displayName };
}

async function userForRequest(request, env) {
  const accessToken = bearer(request);
  const cookie = cookieValue(request, "pc_session");
  if (!accessToken && !cookie) return null;
  if (accessToken) {
    const row = await first(
      env,
      "SELECT u.id, u.email, u.display_name FROM oauth_tokens t JOIN users u ON u.id = t.user_id WHERE t.access_token_hash = ? AND t.expires_at > ?",
      await hexDigest(accessToken),
      now(),
    );
    return row ? publicUser(row) : null;
  }
  const row = await first(
    env,
    "SELECT u.id, u.email, u.display_name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.session_hash = ? AND s.expires_at > ?",
    await hexDigest(cookie),
    now(),
  );
  return row ? publicUser(row) : null;
}

async function requireUser(request, env) {
  const user = await userForRequest(request, env);
  if (!user) throw httpError("Authentication required.", 401);
  return user;
}

async function ownedBot(env, user, botId) {
  if (typeof botId !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(botId)) throw httpError("Invalid botId.", 400);
  const row = await first(env, "SELECT id, user_id, revision, payload_json, created_at, updated_at FROM bots WHERE id = ? AND user_id = ?", botId, user.id);
  if (!row) throw httpError("Bot not found.", 404);
  try {
    return { ...row, bot: JSON.parse(row.payload_json) };
  } catch {
    throw httpError("Stored bot JSON is invalid.", 500);
  }
}

async function insertOrUpdateVersion(env, user, botRow, validation) {
  if (!validation.report.valid || !validation.package) return null;
  const existing = await first(env, "SELECT id FROM bot_versions WHERE bot_id = ? AND revision = ?", botRow.id, botRow.revision);
  const versionId = existing?.id ?? id("version");
  await run(
    env,
    `INSERT INTO bot_versions (id, bot_id, user_id, revision, package_hash, package_json, validation_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(bot_id, revision) DO UPDATE SET package_hash = excluded.package_hash, package_json = excluded.package_json, validation_json = excluded.validation_json`,
    versionId,
    botRow.id,
    user.id,
    botRow.revision,
    validation.package.packageHash,
    JSON.stringify(validation.package),
    JSON.stringify(validation.report),
    now(),
  );
  return { id: versionId, botId: botRow.id, revision: botRow.revision, packageHash: validation.package.packageHash };
}

async function validateOwnedBot(env, user, botId) {
  const current = await ownedBot(env, user, botId);
  const validation = await validateDefinition(current.bot);
  const version = await insertOrUpdateVersion(env, user, current, validation);
  return { botId: current.id, revision: current.revision, ...validation, version };
}

async function createBot(env, user, bot) {
  objectBody(bot);
  const botId = id("bot");
  const timestamp = now();
  await run(env, "INSERT INTO bots (id, user_id, revision, payload_json, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)", botId, user.id, JSON.stringify(bot), timestamp, timestamp);
  return { botId, revision: 1, bot: clone(bot), inspection: inspectDefinition(bot) };
}

async function editBot(env, user, botId, revision, bot) {
  objectBody(bot);
  const current = await ownedBot(env, user, botId);
  if (!Number.isInteger(revision) || revision !== current.revision) throw httpError(`Revision conflict: expected ${current.revision}.`, 409);
  const nextRevision = current.revision + 1;
  const result = await run(
    env,
    "UPDATE bots SET revision = ?, payload_json = ?, updated_at = ? WHERE id = ? AND user_id = ? AND revision = ?",
    nextRevision,
    JSON.stringify(bot),
    now(),
    botId,
    user.id,
    current.revision,
  );
  if (!result.success) throw httpError("Revision conflict.", 409);
  return { botId, revision: nextRevision, bot: clone(bot), inspection: inspectDefinition(bot) };
}

async function getBot(env, user, botId) {
  if (REFERENCE_DEFINITIONS[botId]) return { botId, revision: 0, bot: clone(REFERENCE_DEFINITIONS[botId]), reference: true, versions: [] };
  const current = await ownedBot(env, user, botId);
  const versions = await all(env, "SELECT id, revision, package_hash, validation_json, created_at FROM bot_versions WHERE bot_id = ? AND user_id = ? ORDER BY revision DESC", botId, user.id);
  return {
    botId: current.id,
    revision: current.revision,
    bot: current.bot,
    createdAt: current.created_at,
    updatedAt: current.updated_at,
    versions: versions.map(version => ({ ...version, validation: JSON.parse(version.validation_json) })),
  };
}

async function packageFrom(value) {
  objectBody(value);
  if (typeof value.packageHash === "string") return verifyPackage(value);
  const validation = await validateDefinition(value);
  if (!validation.report.valid || !validation.package) throw httpError("Bot must pass validation.", 422, { validation });
  return validation.package;
}

async function makeReplay(botA, botB, seed, official = false) {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 4294967295) throw httpError("Seed must be an integer from 0 to 4294967295.", 400);
  const replay = await createReplay({ packages: { A: await packageFrom(botA), B: await packageFrom(botB) }, seed });
  replay.manifest.mode = official ? "official" : "test";
  return replay;
}

function jsonSize(value) {
  return encoder.encode(JSON.stringify(value)).byteLength;
}

async function saveReplay(env, ownerUserId, replay, official = false) {
  if (jsonSize(replay) > MAX_BODY_BYTES) throw httpError("Replay exceeds the 4 MiB demo storage limit.", 413);
  const replayId = id(official ? "match" : "replay");
  replay.manifest.replayId = replayId;
  await run(
    env,
    "INSERT INTO replays (id, owner_user_id, status, seed, replay_json, result_json, official, created_at) VALUES (?, ?, 'completed', ?, ?, ?, ?, ?)",
    replayId,
    ownerUserId,
    replay.manifest.seed,
    JSON.stringify(replay),
    JSON.stringify(replay.manifest.result),
    official ? 1 : 0,
    now(),
  );
  return { replayId, replay, result: replay.manifest.result, replayUrl: `/api/v1/replays/${replayId}` };
}

function simulationSummary(saved) {
  if (!saved.result) return saved;
  const { winner, reason, tick, scores } = saved.result;
  return { replayId: saved.replayId, status: "completed", winner, reason, tick, scores, replayUrl: saved.replayUrl };
}

async function getReplay(env, user, replayId) {
  const row = await first(env, "SELECT id, status, seed, replay_json, result_json, official, created_at FROM replays WHERE id = ? AND (owner_user_id = ? OR official = 1)", replayId, user.id);
  if (!row) throw httpError("Replay not found.", 404);
  return {
    replayId: row.id,
    status: row.status,
    seed: row.seed,
    official: Boolean(row.official),
    replay: JSON.parse(row.replay_json),
    result: JSON.parse(row.result_json),
    createdAt: row.created_at,
    replayUrl: `/api/v1/replays/${row.id}`,
  };
}

function replayViewerPayload(replay) {
  const packages = replay.manifest?.packages;
  if (!packages?.A?.definition || !packages?.B?.definition) throw httpError("Replay packages are incomplete.", 500);
  const { packages: _packages, ...manifest } = replay.manifest;
  return {
    replay: { ...replay, manifest },
    names: { A: packages.A.definition.name, B: packages.B.definition.name },
    shapes: { A: shapeOf(packages.A.definition).triangles, B: shapeOf(packages.B.definition).triangles },
  };
}

async function renderReplay(env, request, user, replayId) {
  const saved = await getReplay(env, user, replayId);
  const share = await issueReplayShare(env, saved.replayId, user.id);
  const fallback = share
    ? new URL(`/replays/${encodeURIComponent(saved.replayId)}?share=${encodeURIComponent(share)}`, request.url).toString()
    : new URL(saved.replayUrl, request.url).toString();
  return {
    replayId: saved.replayId,
    status: saved.status,
    seed: saved.seed,
    official: saved.official,
    result: saved.result,
    createdAt: saved.createdAt,
    replayUrl: fallback,
    fallbackUrl: fallback,
    apiReplayUrl: new URL(saved.replayUrl, request.url).toString(),
    viewer: { ...replayViewerPayload(saved.replay), official: saved.official },
  };
}

async function submitBot(env, request, user, botId, revision) {
  const current = await ownedBot(env, user, botId);
  if (!Number.isInteger(revision) || revision !== current.revision) throw httpError(`Revision conflict: expected ${current.revision}.`, 409);
  const validation = await validateDefinition(current.bot);
  if (!validation.report.valid || !validation.package) throw httpError("Bot must pass validation before submit.", 422, { validation });
  const version = await insertOrUpdateVersion(env, user, current, validation);
  const previous = await first(env, "SELECT id, status, match_id FROM submissions WHERE user_id = ? AND version_id = ? AND status IN ('queued', 'matched') ORDER BY created_at DESC LIMIT 1", user.id, version.id);
  if (previous) return { status: previous.status, submissionId: previous.id, version, matchId: previous.match_id };

  const submissionId = id("submission");
  await run(env, "INSERT INTO submissions (id, user_id, version_id, status, created_at) VALUES (?, ?, ?, 'queued', ?)", submissionId, user.id, version.id, now());
  try {
    const queue = await env.MATCH_QUEUE.getByName("official").enqueue({ submissionId, userId: user.id, versionId: version.id, queuedAt: now() });
    if (queue.status !== "matched") return { status: "queued", submissionId, version, position: queue.position };

    const left = await first(env, "SELECT id, user_id, version_id FROM submissions WHERE id = ?", queue.pair.A.submission_id);
    const right = await first(env, "SELECT id, user_id, version_id FROM submissions WHERE id = ?", queue.pair.B.submission_id);
    const leftVersion = await first(env, "SELECT package_json FROM bot_versions WHERE id = ?", left.version_id);
    const rightVersion = await first(env, "SELECT package_json FROM bot_versions WHERE id = ?", right.version_id);
    const seedBytes = new Uint32Array(1);
    crypto.getRandomValues(seedBytes);
    const replay = await makeReplay(JSON.parse(leftVersion.package_json), JSON.parse(rightVersion.package_json), seedBytes[0], true);
    const saved = await saveReplay(env, user.id, replay, true);
    await run(env, "UPDATE submissions SET status = 'matched', match_id = ? WHERE id IN (?, ?)", saved.replayId, left.id, right.id);
    return { status: "matched", submissionId, version, matchId: saved.replayId, result: saved.result, replayUrl: saved.replayUrl };
  } catch (error) {
    await run(env, "UPDATE submissions SET status = 'failed' WHERE id = ?", submissionId);
    throw error;
  }
}

async function withIdempotency(env, user, toolName, args, operation) {
  const key = typeof args?.idempotencyKey === "string" ? args.idempotencyKey : "";
  if (!key) return operation();
  if (!/^[A-Za-z0-9._~-]{8,128}$/.test(key)) throw httpError("idempotencyKey must be 8-128 safe characters.", 400);
  const existing = await first(env, "SELECT response_json FROM idempotency_keys WHERE user_id = ? AND tool_name = ? AND idempotency_key = ?", user.id, toolName, key);
  if (existing) return JSON.parse(existing.response_json);
  const response = await operation();
  try {
    await run(env, "INSERT INTO idempotency_keys (user_id, tool_name, idempotency_key, response_json, created_at) VALUES (?, ?, ?, ?, ?)", user.id, toolName, key, JSON.stringify(response), now());
    return response;
  } catch {
    const raced = await first(env, "SELECT response_json FROM idempotency_keys WHERE user_id = ? AND tool_name = ? AND idempotency_key = ?", user.id, toolName, key);
    return raced ? JSON.parse(raced.response_json) : response;
  }
}

async function callTool(name, args, env, request, user) {
  if (!TOOL_DEFINITIONS.some(tool => tool.name === name)) throw httpError(`Unknown tool: ${name}`, 404);
  const input = objectBody(args ?? {});
  switch (name) {
    case "open_game":
      return { webAppUrl: new URL("/panel/", request.url).toString() };
    case "get_rules":
      return { ...rulesDocument(), webAppUrl: allowedOrigins(env)[0] ?? null };
    case "create_bot":
      return withIdempotency(env, user, name, input, () => createBot(env, user, input.bot));
    case "get_bot":
      return getBot(env, user, input.botId);
    case "edit_bot":
      return withIdempotency(env, user, name, input, () => editBot(env, user, input.botId, input.revision, input.bot));
    case "validate_bot":
      return validateOwnedBot(env, user, input.botId);
    case "simulate_bot": {
      return simulationSummary(await withIdempotency(env, user, name, input, async () => {
        const current = await ownedBot(env, user, input.botId);
        const opponent = input.opponentBotId
          ? (await ownedBot(env, user, input.opponentBotId)).bot
          : REFERENCE_DEFINITIONS[input.opponent ?? "spear"] ?? REFERENCE_DEFINITIONS.spear;
        const replay = await makeReplay(current.bot, opponent, input.seed ?? 1234);
        return simulationSummary(await saveReplay(env, user.id, replay, false));
      }));
    }
    case "get_replay":
      return getReplay(env, user, input.replayId);
    case "render_replay":
      return renderReplay(env, request, user, input.replayId);
    case "submit_bot":
      return withIdempotency(env, user, name, input, () => submitBot(env, request, user, input.botId, input.revision));
    default:
      throw httpError(`Unknown tool: ${name}`, 404);
  }
}

function canonicalToolName(name) {
  return name.startsWith("play.") ? name.slice("play.".length) : name;
}

function rpcError(idValue, code, message) {
  return { jsonrpc: "2.0", id: idValue ?? null, error: { code, message } };
}

function validateMcpHeaders(request, body) {
  const version = request.headers.get("MCP-Protocol-Version");
  if (version && version !== MCP_PROTOCOL_VERSION && version !== "2025-03-26" && version !== "2025-06-18") throw httpError("Unsupported MCP protocol version.", 400);
  if (version !== MCP_PROTOCOL_VERSION) return;
  if (request.headers.get("Mcp-Method") !== body.method) throw httpError("Mcp-Method does not match the JSON-RPC method.", 400);
  if (body.method === "tools/call" && request.headers.get("Mcp-Name") !== body.params?.name) throw httpError("Mcp-Name does not match the called tool.", 400);
}

async function dispatchMcp(body, env, request, user) {
  const method = body.method;
  if (method === "initialize") {
    return {
      protocolVersion: "2025-06-18",
      capabilities: {
        tools: { listChanged: false },
        resources: { subscribe: false, listChanged: false },
        extensions: { "io.modelcontextprotocol/ui": { mimeTypes: [M4_REPLAY_MIME] } },
      },
      serverInfo: { name: "prompt-chien", version: VERSIONS.mcpApi },
      instructions: AGENT_MD,
    };
  }
  if (method === "notifications/initialized") return null;
  if (method === "server/discover") {
    return {
      supportedVersions: [MCP_PROTOCOL_VERSION],
      capabilities: {
        tools: { listChanged: false },
        resources: { subscribe: false, listChanged: false },
        extensions: { "io.modelcontextprotocol/ui": { mimeTypes: [M4_REPLAY_MIME] } },
      },
      instructions: AGENT_MD,
      ttlMs: 0,
      cacheScope: "private",
      _meta: { "io.modelcontextprotocol/serverInfo": { name: "prompt-chien", version: VERSIONS.mcpApi } },
    };
  }
  if (method === "tools/list") return { tools: TOOL_DEFINITIONS, ttlMs: 0, cacheScope: "private" };
  if (method === "resources/list") {
    const resource = (path, name, description, mimeType) => ({ uri: new URL(path, request.url).toString(), name, description, mimeType });
    return {
      resources: [
        resource("/agent.md", "PROMPT Chien agent guide", "Safe MCP workflow and onboarding guide.", "text/markdown"),
        resource("/rules", "PROMPT Chien rules", "Ruleset, tools, BotDefinition schema and valid example bot.", "application/json"),
        resource("/schema/bot.json", "BotDefinition schema", "Complete JSON Schema for bot definitions.", "application/schema+json"),
        resource("/schema/replay.json", "Replay schema", "Complete JSON Schema for replay data.", "application/schema+json"),
        {
          uri: M4_GAME_RESOURCE,
          name: "PROMPT Chien Game",
          description: "Bot editor, inspector, sandbox and queue.",
          mimeType: M4_REPLAY_MIME,
          _meta: M4_GAME_RESOURCE_META,
        },
        {
        uri: M4_REPLAY_RESOURCE,
        name: "PROMPT Chiến Replay Viewer",
        description: "Interactive replay viewer with play, pause, seek and damage heatmap controls.",
        mimeType: M4_REPLAY_MIME,
        _meta: M4_REPLAY_RESOURCE_META,
        },
      ],
      ttlMs: 0,
      cacheScope: "private",
    };
  }
  if (method === "resources/read") {
    const uri = body.params?.uri;
    if ([M4_GAME_RESOURCE, "ui://promptchien/game/v2.html", "ui://promptchien/game/v3.html", "ui://promptchien/game/v4.html", "ui://promptchien/game/v5.html"].includes(uri)) return {
      contents: [{ uri, mimeType: M4_REPLAY_MIME, text: M4_GAME_WIDGET_HTML, _meta: M4_GAME_RESOURCE_META }],
      ttlMs: 0,
      cacheScope: "private",
    };
    if (uri === M4_REPLAY_RESOURCE) return {
      contents: [{ uri: M4_REPLAY_RESOURCE, mimeType: M4_REPLAY_MIME, text: M4_WIDGET_HTML, _meta: M4_REPLAY_RESOURCE_META }],
      ttlMs: 0,
      cacheScope: "private",
    };
    let path;
    try { path = new URL(uri).pathname; } catch { path = uri; }
    const resources = {
      "/agent.md": ["text/markdown", AGENT_MD],
      "/rules": ["application/json", JSON.stringify(rulesDocument())],
      "/schema/bot.json": ["application/schema+json", JSON.stringify(schemaFor("bot"))],
      "/schema/replay.json": ["application/schema+json", JSON.stringify(schemaFor("replay"))],
    };
    if (!resources[path]) throw httpError("MCP resource not found.", 404);
    return {
      contents: [{ uri, mimeType: resources[path][0], text: resources[path][1] }],
      ttlMs: 0,
      cacheScope: "private",
    };
  }
  if (method === "tools/call") {
    if (typeof body.params?.name !== "string") throw httpError("tools/call requires params.name.", 400);
    try {
      const name = canonicalToolName(body.params.name);
      const value = await callTool(name, body.params.arguments ?? {}, env, request, user);
      if (name === "render_replay") {
        const { viewer, ...summary } = value;
        const result = mcpToolResult(summary, { "promptchien/replay": viewer });
        result.content = [{ type: "text", text: `Replay ${summary.replayId} is ready. Fallback link: ${summary.replayUrl}` }];
        return result;
      }
      return mcpToolResult(value);
    } catch (error) {
      return {
        ...mcpToolResult({ error: error instanceof Error ? error.message : String(error), ...(error?.data ?? {}) }),
        isError: true,
      };
    }
  }
  throw httpError(`MCP method not found: ${method}`, 404);
}

async function handleMcp(request, env) {
  if (request.method === "GET") {
    if (!bearer(request) && !allowsPublicDiscovery(request)) return json(request, env, { error: "Authentication required." }, 401, oauthChallenge(request));
    checkOrigin(request, env);
    return text(request, env, "MCP Streamable HTTP is stateless; send POST JSON-RPC requests.", "text/plain; charset=utf-8", 405, { allow: "POST" });
  }
  if (request.method !== "POST") return text(request, env, "Method not allowed.", "text/plain; charset=utf-8", 405, { allow: "POST" });
  const raw = await bodyText(request);
  if (!raw.trim()) {
    await requireUser(request, env);
    return json(request, env, rpcError(null, -32600, "Invalid JSON-RPC request."), 400);
  }
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw httpError("Request body must be valid JSON.", 400);
  }
  const bodies = Array.isArray(payload) ? payload : [payload];
  if (!bodies.length || bodies.some(body => !body || typeof body !== "object" || Array.isArray(body) || body.jsonrpc !== "2.0" || typeof body.method !== "string")) {
    return json(request, env, rpcError(null, -32600, "Invalid JSON-RPC request."), 400);
  }
  if (!bearer(request) && !allowsPublicDiscovery(request)) return json(request, env, { error: "Authentication required." }, 401, oauthChallenge(request));
  for (const body of bodies) validateMcpHeaders(request, body);
  checkOrigin(request, env);
  // ChatGPT Developer Mode discovers the app before it has an OAuth bearer token.
  // Keep discovery and static widget resources public; every tool call remains authenticated.
  const publicMethods = new Set(["initialize", "notifications/initialized", "server/discover", "tools/list", "resources/list", "resources/read"]);
  const user = bodies.every(body => publicMethods.has(body.method)) ? null : await requireUser(request, env);
  const replies = [];
  for (const body of bodies) {
    try {
      const result = await dispatchMcp(body, env, request, user);
      if (body.id !== undefined && result !== null) replies.push({ jsonrpc: "2.0", id: body.id, result });
    } catch (error) {
      const status = Number(error?.status) || 500;
      if (body.id !== undefined) replies.push(rpcError(body.id, status >= 500 ? -32603 : status === 404 ? -32601 : -32602, error instanceof Error ? error.message : String(error)));
    }
  }
  if (!replies.length) return new Response(null, { status: 202, headers: corsHeaders(request, env) });
  const version = bodies.some(body => body.method === "server/discover") ? MCP_PROTOCOL_VERSION : (request.headers.get("MCP-Protocol-Version") ?? "2025-06-18");
  return json(request, env, Array.isArray(payload) ? replies : replies[0], 200, { "MCP-Protocol-Version": version });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
}

async function register(env, request) {
  const body = objectBody(await bodyJson(request));
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const inviteCode = String(body.inviteCode ?? request.headers.get("x-invite-code") ?? "");
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8) throw httpError("A valid email and an 8+ character password are required.", 400);
  if (!env.INVITE_CODE || inviteCode !== env.INVITE_CODE) throw httpError("A valid inviteCode is required.", 403);
  if (await first(env, "SELECT id FROM users WHERE email = ?", email)) throw httpError("Email already exists.", 409);
  const userId = id("user");
  const salt = randomToken(16);
  const timestamp = now();
  await run(env, "INSERT INTO users (id, email, display_name, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)", userId, email, email.split("@")[0], salt, await passwordHash(password, salt), timestamp);
  const token = randomToken();
  await run(env, "INSERT INTO sessions (session_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)", await hexDigest(token), userId, timestamp + SESSION_DAYS * 86400000, timestamp);
  return json(request, env, { user: { id: userId, email, displayName: email.split("@")[0] } }, 201, { "set-cookie": sessionCookie(token, request) });
}

async function login(env, request) {
  const body = objectBody(await bodyJson(request));
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const row = await first(env, "SELECT id, email, display_name, password_salt, password_hash FROM users WHERE email = ?", email);
  if (!row || !sameSecret(await passwordHash(password, row.password_salt), row.password_hash)) throw httpError("Invalid credentials.", 401);
  const token = randomToken();
  const timestamp = now();
  await run(env, "INSERT INTO sessions (session_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)", await hexDigest(token), row.id, timestamp + SESSION_DAYS * 86400000, timestamp);
  return json(request, env, { user: publicUser(row) }, 200, { "set-cookie": sessionCookie(token, request) });
}

function originOf(request) {
  return new URL(request.url).origin;
}

function oauthMetadata(request) {
  const origin = originOf(request);
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["promptchien"],
  };
}

function validRedirectUri(value) {
  try {
    const url = new URL(value);
    if (url.hash) return false;
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

async function oauthRegister(env, request) {
  const body = objectBody(await bodyJson(request));
  const redirectUris = body.redirect_uris;
  console.info("[oauth/register]", { client_name: String(body.client_name ?? "MCP client").slice(0, 120), redirect_uris: redirectUris });
  if (!Array.isArray(redirectUris) || !redirectUris.length) throw httpError("redirect_uris must use HTTPS or a loopback HTTP address.", 400);
  const acceptedRedirectUris = redirectUris.filter(uri => typeof uri === "string" && validRedirectUri(uri));
  if (!acceptedRedirectUris.length) throw httpError("redirect_uris must use HTTPS or a loopback HTTP address.", 400);
  const clientId = id("client");
  const clientName = String(body.client_name ?? "MCP client").slice(0, 120);
  await run(env, "INSERT INTO oauth_clients (client_id, client_name, redirect_uris_json, created_at) VALUES (?, ?, ?, ?)", clientId, clientName, JSON.stringify(acceptedRedirectUris), now());
  return json(request, env, { client_id: clientId, client_name: clientName, redirect_uris: acceptedRedirectUris, grant_types: ["authorization_code"], response_types: ["code"] }, 201);
}

async function checkOAuthClient(env, clientId, redirectUri) {
  const registered = await first(env, "SELECT client_id, redirect_uris_json FROM oauth_clients WHERE client_id = ?", clientId);
  if (registered) {
    const uris = JSON.parse(registered.redirect_uris_json);
    if (uris.includes(redirectUri)) return;
    throw httpError("redirect_uri is not registered.", 400);
  }
  if (!/^https:\/\//.test(clientId)) throw httpError("client_id must be registered or an HTTPS CIMD URL.", 400);
  const response = await fetch(clientId);
  if (!response.ok) throw httpError("CIMD client metadata could not be fetched.", 400);
  const metadata = await response.json();
  if (!Array.isArray(metadata.redirect_uris) || !metadata.redirect_uris.includes(redirectUri) || !validRedirectUri(redirectUri)) throw httpError("CIMD redirect_uri mismatch.", 400);
}

async function oauthAuthorize(env, request) {
  const url = new URL(request.url);
  const params = request.method === "GET" ? url.searchParams : await formBody(request);
  const clientId = params.get("client_id") ?? "";
  const redirectUri = params.get("redirect_uri") ?? "";
  const challenge = params.get("code_challenge") ?? "";
  const method = params.get("code_challenge_method") ?? "";
  if (params.get("response_type") !== "code" || !clientId || !redirectUri || !challenge || method !== "S256") throw httpError("OAuth authorization requires code and S256 PKCE.", 400);
  await checkOAuthClient(env, clientId, redirectUri);
  if (request.method === "GET") {
    const hidden = ["client_id", "redirect_uri", "response_type", "scope", "state", "code_challenge", "code_challenge_method"].map(key => `<input type="hidden" name="${key}" value="${escapeHtml(params.get(key) ?? "")}">`).join("");
    return text(request, env, `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>PROMPT Chiến</title></head><body><main style="font:16px system-ui;max-width:420px;margin:8vh auto"><h1>PROMPT Chiến</h1><p>Sign in to authorize this MCP client.</p><form method="post">${hidden}<label>Email<br><input name="email" type="email" required></label><br><label>Password<br><input name="password" type="password" required></label><br><button>Authorize</button></form></main></body></html>`, "text/html; charset=utf-8");
  }
  const email = String(params.get("email") ?? "").trim().toLowerCase();
  const password = String(params.get("password") ?? "");
  const row = await first(env, "SELECT id, password_salt, password_hash FROM users WHERE email = ?", email);
  if (!row || !sameSecret(await passwordHash(password, row.password_salt), row.password_hash)) throw httpError("Invalid credentials.", 401);
  const code = randomToken(32);
  await run(env, "INSERT INTO oauth_codes (code_hash, client_id, redirect_uri, user_id, code_challenge, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", await hexDigest(code), clientId, redirectUri, row.id, challenge, now() + OAUTH_CODE_MINUTES * 60_000, now());
  const redirect = new URL(redirectUri);
  redirect.searchParams.set("code", code);
  if (params.get("state")) redirect.searchParams.set("state", params.get("state"));
  return Response.redirect(redirect.toString(), 302);
}

async function oauthToken(env, request) {
  const params = await formBody(request);
  if (params.get("grant_type") !== "authorization_code") throw httpError("Only authorization_code is supported.", 400);
  const clientId = params.get("client_id") ?? "";
  const redirectUri = params.get("redirect_uri") ?? "";
  const code = params.get("code") ?? "";
  const verifier = params.get("code_verifier") ?? "";
  const row = await first(env, "SELECT code_hash, user_id, code_challenge FROM oauth_codes WHERE code_hash = ? AND client_id = ? AND redirect_uri = ? AND expires_at > ?", await hexDigest(code), clientId, redirectUri, now());
  if (!row || !sameSecret(await pkceChallenge(verifier), row.code_challenge)) throw httpError("Invalid or expired authorization code.", 400);
  await run(env, "DELETE FROM oauth_codes WHERE code_hash = ?", row.code_hash);
  const token = randomToken();
  await run(env, "INSERT INTO oauth_tokens (access_token_hash, user_id, client_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)", await hexDigest(token), row.user_id, clientId, now() + ACCESS_TOKEN_DAYS * 86400000, now());
  return json(request, env, { access_token: token, token_type: "Bearer", expires_in: ACCESS_TOKEN_DAYS * 86400, scope: "promptchien" });
}

function shapeOf(definition) {
  const geometry = analyzeGeometry(definition.body);
  const counts = { hammer: 0, scissor: 0, paper: 0, motor: 0, total: geometry.triangles.length };
  const motors = { left: 0, center: 0, right: 0, nose: 0, tail: 0, mid: 0 };
  for (const triangle of geometry.triangles) {
    counts[triangle.type] += 1;
    if (triangle.type === "motor") {
      motors[triangle.center.x < -800 ? "left" : triangle.center.x > 800 ? "right" : "center"] += 1;
      motors[triangle.center.y > 800 ? "nose" : triangle.center.y < -800 ? "tail" : "mid"] += 1;
    }
  }
  return {
    ok: geometry.ok,
    counts,
    bounds: geometry.bounds,
    coreId: geometry.coreId,
    motors,
    triangles: geometry.triangles.map(triangle => ({ id: triangle.id, type: triangle.type, core: triangle.core, vertices: triangle.vertices, center: triangle.center })),
  };
}

async function publicValidate(bot) {
  const validation = await validateDefinition(bot);
  return { report: validation.report, package: validation.package, trials: validation.trials };
}

async function publicSimulate(body) {
  const left = body.a ?? body.botA;
  const right = body.b ?? body.botB;
  const [botA, botB] = await Promise.all([packageFrom(left), packageFrom(right)]);
  const replay = await makeReplay(botA, botB, body.seed ?? 1234, body.mode === "official");
  return {
    replay,
    shapes: { A: shapeOf(botA.definition).triangles, B: shapeOf(botB.definition).triangles },
  };
}

function standaloneReplayHtml(saved, fallbackUrl) {
  const payload = {
    ...replayViewerPayload(saved.replay),
    official: saved.official,
    fallbackUrl,
  };
  const serialized = JSON.stringify(payload).replace(/[<>&\u2028\u2029]/g, character => ({ "<": "\\u003c", ">": "\\u003e", "&": "\\u0026", "\u2028": "\\u2028", "\u2029": "\\u2029" }[character]));
  const shim = `globalThis.ExtApps.App=class{constructor(){this.ontoolresult=null;this.onhostcontextchanged=null;}async connect(){this.onhostcontextchanged?.({theme:"dark"});this.ontoolresult?.({_meta:{"promptchien/replay":${serialized}}});}getHostContext(){return{theme:"dark"};}openLink({url}){location.assign(url);return Promise.resolve({});}};`;
  return M4_WIDGET_HTML.replace("const { App, applyHostStyleVariables } = globalThis.ExtApps;", `${shim}\nconst { App, applyHostStyleVariables } = globalThis.ExtApps;`);
}

async function handleApi(request, env, url) {
  if (request.method === "GET" && url.pathname === "/api/references") return json(request, env, { bots: await referencePackages() });
  const replayPath = url.pathname.match(/^\/replays\/([^/]+)$/);
  if (request.method === "GET" && replayPath) {
    const replayId = decodeURIComponent(replayPath[1]);
    const share = await verifyReplayShare(env, url.searchParams.get("share"), replayId);
    if (!share) throw httpError("A valid replay share link is required.", 401);
    const saved = await getReplay(env, { id: share.ownerUserId }, replayId);
    return text(request, env, standaloneReplayHtml(saved, request.url), "text/html; charset=utf-8", 200, resourceHeaders());
  }
  if (request.method === "GET" && url.pathname === "/api/auth/me") {
    const user = await userForRequest(request, env);
    return user ? json(request, env, { authenticated: true, user }) : json(request, env, { authenticated: false }, 401, { "www-authenticate": 'Bearer realm="promptchien"' });
  }
  if (request.method === "POST" && url.pathname === "/api/auth/register") return register(env, request);
  if (request.method === "POST" && url.pathname === "/api/auth/login") return login(env, request);
  if (request.method === "POST" && url.pathname === "/api/auth/logout") return json(request, env, { ok: true }, 200, { "set-cookie": sessionCookie("", request, 0) });
  if (request.method === "POST" && url.pathname === "/api/inspect") {
    const body = objectBody(await bodyJson(request));
    const inspection = inspectDefinition(body.bot);
    return json(request, env, { inspection, shape: inspection.schema === "passed" ? shapeOf(body.bot) : null });
  }
  if (request.method === "POST" && url.pathname === "/api/validate") {
    const body = objectBody(await bodyJson(request));
    return json(request, env, await publicValidate(body.bot));
  }
  if (request.method === "POST" && url.pathname === "/api/simulate") return json(request, env, await publicSimulate(objectBody(await bodyJson(request))));

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "api" || parts[1] !== "v1") return null;
  const user = await requireUser(request, env);
  if (parts[2] === "bots" && parts.length === 3 && request.method === "POST") {
    const body = objectBody(await bodyJson(request));
    return json(request, env, await createBot(env, user, body.bot), 201);
  }
  if (parts[2] === "bots" && parts.length === 4 && request.method === "GET") return json(request, env, await getBot(env, user, parts[3]));
  if (parts[2] === "bots" && parts.length === 5 && request.method === "POST") {
    const body = objectBody(await bodyJson(request));
    if (parts[4] === "edit") return json(request, env, await editBot(env, user, parts[3], body.revision, body.bot));
    if (parts[4] === "validate") return json(request, env, await validateOwnedBot(env, user, parts[3]));
    if (parts[4] === "simulate") return json(request, env, await callTool("simulate_bot", { ...body, botId: parts[3] }, env, request, user));
    if (parts[4] === "submit") return json(request, env, await submitBot(env, request, user, parts[3], body.revision));
  }
  if (parts[2] === "replays" && parts.length === 4 && request.method === "GET") return json(request, env, await getReplay(env, user, parts[3]));
  return null;
}

function resourceHeaders() {
  return { "cache-control": "no-store" };
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...corsHeaders(request, env), "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "authorization,content-type,mcp-protocol-version,mcp-method,mcp-name", "access-control-max-age": "86400" } });
      if (url.pathname === "/healthz" && request.method === "GET") return json(request, env, { ok: true, service: "promptchien-api", mcpApi: VERSIONS.mcpApi });
      if (url.pathname === "/.well-known/oauth-authorization-server" && request.method === "GET") return json(request, env, oauthMetadata(request));
      if (["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp", "/mcp/.well-known/oauth-protected-resource"].includes(url.pathname) && request.method === "GET") return json(request, env, { resource: `${originOf(request)}/mcp`, authorization_servers: [originOf(request)], scopes_supported: ["promptchien"], bearer_methods_supported: ["header"] });
      if (url.pathname === "/oauth/register" && request.method === "POST") return await oauthRegister(env, request);
      if (url.pathname === "/oauth/authorize" && (request.method === "GET" || request.method === "POST")) return await oauthAuthorize(env, request);
      if (url.pathname === "/oauth/token" && request.method === "POST") return await oauthToken(env, request);
      if (url.pathname === "/mcp") return await handleMcp(request, env);
      if (url.pathname === "/agent.md" && request.method === "GET") return text(request, env, AGENT_MD, "text/markdown; charset=utf-8", 200, resourceHeaders());
      if (url.pathname === "/rules" && request.method === "GET") return json(request, env, rulesDocument());
      if (url.pathname === "/schema/contracts.json" && request.method === "GET") return json(request, env, CONTRACT_SCHEMA);
      if (url.pathname === "/schema/bot.json" && request.method === "GET") return json(request, env, schemaFor("bot"));
      if (url.pathname === "/schema/replay.json" && request.method === "GET") return json(request, env, schemaFor("replay"));
      const response = await handleApi(request, env, url);
      if (response) return response;
      return json(request, env, { error: "Not found." }, 404);
    } catch (error) {
      const status = Number(error?.status) || (error instanceof Error && error.message.includes("too large") ? 413 : 500);
      const payload = error?.data ? { error: error.message, ...error.data } : { error: error instanceof Error ? error.message : String(error) };
      const headers = status === 401 ? oauthChallenge(request) : {};
      return json(request, env, payload, status, headers);
    }
  },
};
