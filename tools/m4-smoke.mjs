import { readFile } from "node:fs/promises";

const base = (process.env.M4_API_URL ?? process.env.M3_API_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const inviteCode = process.env.M4_INVITE_CODE ?? process.env.M3_INVITE_CODE ?? "local-demo-invite";
const bot = JSON.parse(await readFile(new URL("../examples/bots/spear.json", import.meta.url), "utf8"));
let sequence = 0;

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
  return (values[0] ?? response.headers.get("set-cookie") ?? "").split(";", 1)[0];
}

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `m4-${suffix}@example.test`;
const password = "local-demo-password";
const registered = await request("/api/auth/register", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password, inviteCode }),
});
const cookie = cookieFrom(registered.response);
assert(cookie, "M4 smoke did not receive a session cookie");

const oauthClient = await request("/oauth/register", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ client_name: "M4 smoke client", redirect_uris: ["http://127.0.0.1:9998/callback"] }),
});
const clientId = oauthClient.value.client_id;
const verifier = `m4-verifier-${suffix}-012345678901234567890123456789`;
const challenge = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))).toString("base64url");
const oauthParams = {
  client_id: clientId,
  redirect_uri: "http://127.0.0.1:9998/callback",
  response_type: "code",
  scope: "promptchien",
  state: "m4-state",
  code_challenge: challenge,
  code_challenge_method: "S256",
};
const authorized = await request("/oauth/authorize", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded", cookie },
  body: new URLSearchParams({ ...oauthParams, email, password }),
  redirect: "manual",
});
assert(authorized.response.status === 302, "M4 OAuth authorization did not redirect");
const code = new URL(authorized.response.headers.get("location")).searchParams.get("code");
const token = await request("/oauth/token", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, redirect_uri: oauthParams.redirect_uri, code, code_verifier: verifier }),
});
assert(token.value.access_token, "M4 OAuth token exchange failed");

async function mcp(method, params = {}) {
  const headers = {
    authorization: `Bearer ${token.value.access_token}`,
    "content-type": "application/json",
    "MCP-Protocol-Version": "2026-07-28",
    "Mcp-Method": method,
  };
  if (method === "tools/call") headers["Mcp-Name"] = params.name;
  const result = await request("/mcp", { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: ++sequence, method, params }) });
  assert(!result.value.error, `${method} returned JSON-RPC error: ${JSON.stringify(result.value.error)}`);
  return result.value.result;
}

const initialized = await mcp("initialize", { protocolVersion: "2026-07-28", capabilities: {}, clientInfo: { name: "m4-smoke", version: "1" } });
assert(initialized.capabilities.resources && initialized.capabilities.extensions?.["io.modelcontextprotocol/ui"], "MCP Apps capability negotiation is missing");
const tools = await mcp("tools/list");
const renderTool = tools.tools.find(tool => tool.name === "render_replay");
assert(renderTool?._meta?.ui?.resourceUri === "ui://promptchien/replay-viewer/v1.html", "render_replay does not reference the UI resource");
const listed = await mcp("resources/list");
assert(listed.resources.some(resource => resource.uri === renderTool._meta.ui.resourceUri && resource.mimeType === "text/html;profile=mcp-app"), "MCP Apps resource is not listed");
const resource = await mcp("resources/read", { uri: renderTool._meta.ui.resourceUri });
const html = resource.contents[0]?.text ?? "";
assert(resource.contents[0]?.mimeType === "text/html;profile=mcp-app" && html.includes("globalThis.ExtApps") && html.includes("PromptChienReplayViewer") && html.includes("viewCheckpoint"), "MCP Apps HTML resource is incomplete");

const created = await mcp("tools/call", { name: "create_bot", arguments: { bot, idempotencyKey: `m4-create-${suffix}` } });
const createdValue = created.structuredContent;
assert(createdValue.botId, "M4 smoke could not create a bot");
const simulated = await mcp("tools/call", { name: "simulate_bot", arguments: { botId: createdValue.botId, opponent: "shield", seed: 42, idempotencyKey: `m4-sim-${suffix}` } });
const replayId = simulated.structuredContent.replayId;
assert(replayId, "M4 smoke did not save a replay");
const rendered = await mcp("tools/call", { name: "render_replay", arguments: { replayId } });
const viewer = rendered._meta?.["promptchien/replay"];
assert(rendered.structuredContent.replayUrl?.startsWith(`${base}/replays/`) && rendered.structuredContent.replayUrl.includes("?share="), "render_replay did not return a signed web fallback URL");
assert(viewer?.replay?.manifest?.totalTicks > 0 && viewer.shapes?.A?.length && viewer.shapes?.B?.length, "render_replay did not return viewer payload");
assert(!viewer.replay.manifest.packages, "M4 viewer payload duplicated package definitions");
assert(rendered.content?.[0]?.text.includes("Fallback link:"), "tools-only fallback text is missing");
const fallback = await request(new URL(rendered.structuredContent.replayUrl).pathname + new URL(rendered.structuredContent.replayUrl).search);
assert(fallback.response.headers.get("content-type")?.includes("text/html") && fallback.value.includes("PromptChienReplayViewer"), "signed fallback link did not serve the standalone viewer");

console.log(`M4 SMOKE PASSED: MCP Apps negotiation, resource HTML, shared viewer payload and tools-only fallback (${replayId})`);
