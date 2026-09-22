import { readFile } from "node:fs/promises";

const base = (process.env.M3_API_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const inviteCode = process.env.M3_INVITE_CODE ?? "local-demo-invite";
const bot = JSON.parse(await readFile(new URL("../examples/bots/spear.json", import.meta.url), "utf8"));
const opponent = JSON.parse(await readFile(new URL("../examples/bots/shield.json", import.meta.url), "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, init = {}) {
  const response = await fetch(`${base}${path}`, init);
  const raw = await response.text();
  let value;
  try { value = raw ? JSON.parse(raw) : null; } catch { value = raw; }
  const redirectResponse = init.redirect === "manual" && response.status >= 300 && response.status < 400;
  if (!response.ok && !redirectResponse) throw new Error(`${init.method ?? "GET"} ${path}: ${response.status} ${raw.slice(0, 500)}`);
  return { response, value };
}

function cookieFrom(response) {
  const values = response.headers.getSetCookie?.() ?? [];
  const value = values[0] ?? response.headers.get("set-cookie") ?? "";
  return value.split(";", 1)[0];
}

async function register(suffix) {
  const email = `m3-${Date.now()}-${suffix}@example.test`;
  const password = "local-demo-password";
  const result = await request("/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, inviteCode }),
  });
  return { email, password, cookie: cookieFrom(result.response), user: result.value.user };
}

async function form(path, values, redirect = "follow", cookie = "") {
  return request(path, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", ...(cookie ? { cookie } : {}) }, body: new URLSearchParams(values), redirect });
}

const health = await request("/healthz");
assert(health.value.ok && health.value.mcpApi === "1.0.0", "healthz did not report the M3 MCP version");
const agent = await fetch(`${base}/agent.md`).then(response => response.text());
assert(agent.includes("validate_bot") && agent.includes("S256 PKCE"), "agent onboarding resource is incomplete");
const rules = await request("/rules");
assert(rules.value.toolNames.length === 10 && rules.value.toolNames.includes("open_game") && rules.value.toolNames.includes("render_replay") && rules.value.versions.mcpApi === "1.0.0", "rules resource does not expose the M3 tools and M4 apps");
assert(!rules.value.tools && !rules.value.botSchema.$defs.ReplayData, "rules resource contains unrelated schema or duplicate tool definitions");
const schema = await request("/schema/bot.json");
assert(schema.value.$ref === "#/$defs/BotDefinition" && schema.value.$defs.BotDefinition, "bot schema is not self-contained");
const references = await request("/api/references");
assert(references.value.bots.length >= 5, "reference bot catalog is incomplete");

const first = await register("a");
const second = await register("b");
const me = await request("/api/auth/me", { headers: { cookie: first.cookie } });
assert(me.value.authenticated && me.value.user.id === first.user.id, "session cookie authentication failed");

const firstBot = await request("/api/v1/bots", { method: "POST", headers: { "content-type": "application/json", cookie: first.cookie }, body: JSON.stringify({ bot }) });
const botId = firstBot.value.botId;
const firstValidation = await request(`/api/v1/bots/${botId}/validate`, { method: "POST", headers: { cookie: first.cookie } });
assert(firstValidation.value.report.valid && firstValidation.value.version.packageHash, "server-side validation did not produce a package version");

const oauthClient = await request("/oauth/register", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ client_name: "M3 smoke client", redirect_uris: ["http://127.0.0.1:9999/callback"] }),
});
const clientId = oauthClient.value.client_id;
const verifier = "m3-local-verifier-012345678901234567890123456789";
const challenge = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))).toString("base64url");
const oauthParams = {
  client_id: clientId,
  redirect_uri: "http://127.0.0.1:9999/callback",
  response_type: "code",
  scope: "promptchien",
  state: "m3-state",
  code_challenge: challenge,
  code_challenge_method: "S256",
};
const authorizePage = await request(`/oauth/authorize?${new URLSearchParams(oauthParams)}`);
assert(typeof authorizePage.value === "string" && authorizePage.value.includes("Authorize"), "OAuth authorize page did not render");
const authorized = await form("/oauth/authorize", { ...oauthParams, email: first.email, password: first.password }, "manual", first.cookie);
assert(authorized.response.status === 302, "OAuth authorization did not redirect");
const code = new URL(authorized.response.headers.get("location")).searchParams.get("code");
const token = await form("/oauth/token", { grant_type: "authorization_code", client_id: clientId, redirect_uri: oauthParams.redirect_uri, code, code_verifier: verifier });
assert(token.value.token_type === "Bearer" && token.value.access_token, "OAuth token exchange failed");

const batchResponse = await fetch(`${base}/mcp`, {
  method: "POST",
  headers: { "content-type": "application/json", "MCP-Protocol-Version": "2025-06-18" },
  body: JSON.stringify([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "openai-mcp", version: "1" } } },
    { jsonrpc: "2.0", method: "notifications/initialized", params: {} },
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
  ]),
});
const batch = await batchResponse.json();
assert(batchResponse.ok && Array.isArray(batch) && batch.length === 2 && batch[1].result.tools.length === 10, "ChatGPT-style MCP batch discovery failed");

async function publicMcp(method, params = {}) {
  const response = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://chatgpt.com", "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": method },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  const value = await response.json();
  assert(response.ok && !value.error, `${method} discovery failed: ${JSON.stringify(value)}`);
  return value.result;
}

const publicDiscovery = await publicMcp("server/discover");
assert(publicDiscovery.supportedVersions.includes("2026-07-28"), "public MCP discovery used the wrong protocol version");
const publicTools = await publicMcp("tools/list");
assert(publicTools.tools.length === 10 && publicTools.tools.every(tool => tool.inputSchema), "public MCP tools/list is incomplete");
const unauthorizedCall = await fetch(`${base}/mcp`, {
  method: "POST",
  headers: { "content-type": "application/json", "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": "tools/call", "Mcp-Name": "get_rules" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_rules", arguments: {} } }),
});
assert(unauthorizedCall.status === 401 && unauthorizedCall.headers.get("www-authenticate")?.includes("oauth-protected-resource"), "MCP tool calls must remain authenticated");

async function mcp(method, params = {}) {
  const headers = {
    authorization: `Bearer ${token.value.access_token}`,
    "content-type": "application/json",
    "MCP-Protocol-Version": "2026-07-28",
    "Mcp-Method": method,
  };
  if (method === "tools/call") headers["Mcp-Name"] = params.name;
  const result = await request("/mcp", { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }) });
  assert(!result.value.error, `${method} returned JSON-RPC error: ${JSON.stringify(result.value.error)}`);
  return result.value.result;
}

const discover = await mcp("server/discover");
assert(discover.supportedVersions.includes("2026-07-28"), "MCP modern discovery used the wrong protocol version");
const toolList = await mcp("tools/list");
assert(toolList.tools.length === 10 && toolList.tools.every(tool => tool.inputSchema), "MCP tools/list is incomplete");
const openGame = toolList.tools.find(tool => tool.name === "open_game");
assert(openGame?._meta?.ui?.resourceUri === "ui://promptchien/game/v4.html", "open_game does not reference the game UI resource");
const listedResources = await mcp("resources/list");
const botSchemaResource = listedResources.resources.find(resource => resource.uri.endsWith("/schema/bot.json"));
assert(botSchemaResource, "MCP did not list the BotDefinition schema resource");
const readSchema = await mcp("resources/read", { uri: botSchemaResource.uri });
assert(JSON.parse(readSchema.contents[0].text).$defs.BotDefinition, "MCP could not read the BotDefinition schema resource");
const ruleResult = await mcp("tools/call", { name: "get_rules", arguments: {} });
assert(ruleResult.structuredContent.botSchema.$defs.BotDefinition && ruleResult.structuredContent.exampleBot.schemaVersion, "get_rules is not self-contained");
const namespacedRules = await mcp("tools/call", { name: "play.get_rules", arguments: {} });
assert(namespacedRules.structuredContent.versions.mcpApi === "1.0.0", "plugin-namespaced tool calls are not accepted");
const invalid = await mcp("tools/call", { name: "create_bot", arguments: { bot: {}, idempotencyKey: "m3-invalid-key" } });
assert(invalid.structuredContent.inspection.issues.some(issue => issue.path === "/schemaVersion"), "invalid drafts need field-level validation errors");
const reference = await mcp("tools/call", { name: "get_bot", arguments: { botId: "spear" } });
assert(reference.structuredContent.reference && reference.structuredContent.bot.schemaVersion, "get_bot could not read a reference bot");
const created = await mcp("tools/call", { name: "create_bot", arguments: { bot, idempotencyKey: "m3-create-key" } });
const createdValue = created.structuredContent;
assert(createdValue.botId && createdValue.revision === 1, "MCP create_bot failed");
const validated = await mcp("tools/call", { name: "validate_bot", arguments: { botId: createdValue.botId } });
assert(validated.structuredContent.report.valid, "MCP validate_bot failed");
const simulated = await mcp("tools/call", { name: "simulate_bot", arguments: { botId: createdValue.botId, opponent: "shield", seed: 42, idempotencyKey: "m3-simulate-key" } });
assert(simulated.structuredContent.replayId, "MCP simulate_bot did not save a replay");
assert(simulated.structuredContent.winner && !simulated.structuredContent.replay && JSON.stringify(simulated).length < 2000, "MCP simulate_bot did not return a compact summary");
const replay = await mcp("tools/call", { name: "get_replay", arguments: { replayId: simulated.structuredContent.replayId } });
assert(replay.structuredContent.replay.manifest.dataHash, "MCP get_replay returned no deterministic hash");
const edited = await mcp("tools/call", { name: "edit_bot", arguments: { botId: createdValue.botId, revision: createdValue.revision, bot: { ...bot, name: "M3 smoke edited" }, idempotencyKey: "m3-edit-key" } });
assert(edited.structuredContent.revision === 2, "MCP edit_bot revision guard failed");
const submitted = await mcp("tools/call", { name: "submit_bot", arguments: { botId: createdValue.botId, revision: edited.structuredContent.revision, idempotencyKey: "m3-submit-key" } });
assert(submitted.structuredContent.status === "queued", "first MCP submit should wait for another account");

const secondBot = await request("/api/v1/bots", { method: "POST", headers: { "content-type": "application/json", cookie: second.cookie }, body: JSON.stringify({ bot: opponent }) });
await request(`/api/v1/bots/${secondBot.value.botId}/validate`, { method: "POST", headers: { cookie: second.cookie } });
const matched = await request(`/api/v1/bots/${secondBot.value.botId}/submit`, { method: "POST", headers: { "content-type": "application/json", cookie: second.cookie }, body: JSON.stringify({ revision: 1 }) });
assert(matched.value.status === "matched" && matched.value.matchId, "Durable Object FIFO matchmaking did not pair two accounts");
const official = await mcp("tools/call", { name: "get_replay", arguments: { replayId: matched.value.matchId } });
assert(official.structuredContent.official && official.structuredContent.replay.manifest.mode === "official", "official replay was not visible to the first account");

console.log("M3 SMOKE PASSED: resources, account, OAuth PKCE, modern MCP, CRUD, validation, replay and two-account FIFO matchmaking");
