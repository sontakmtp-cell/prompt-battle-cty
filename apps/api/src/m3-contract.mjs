import { RULESET, VERSIONS } from "@prompt-chien/contracts";
import { CONTRACT_SCHEMA } from "@prompt-chien/contracts/schema";
import { validateBot } from "@prompt-chien/application";
import { M4_REPLAY_RESOURCE } from "./m4-contract.mjs";

export const MCP_PROTOCOL_VERSION = "2026-07-28";

const id = { type: "string", minLength: 1, maxLength: 128 };
const bot = { type: "object" };
const idempotency = { idempotencyKey: { type: "string", minLength: 8, maxLength: 128 } };

export const TOOL_DEFINITIONS = [
  {
    name: "get_rules",
    description: "Read the current ruleset, schemas and the safe agent workflow.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "create_bot",
    description: "Create an authenticated bot draft. The server stores JSON only; Brain code is never executed.",
    inputSchema: { type: "object", required: ["bot"], properties: { bot, ...idempotency }, additionalProperties: false },
  },
  {
    name: "get_bot",
    description: "Read one of the authenticated user's bot drafts and saved validated versions.",
    inputSchema: { type: "object", required: ["botId"], properties: { botId: id }, additionalProperties: false },
  },
  {
    name: "edit_bot",
    description: "Update a bot draft with optimistic revision checking.",
    inputSchema: { type: "object", required: ["botId", "revision", "bot"], properties: { botId: id, revision: { type: "integer", minimum: 1 }, bot, ...idempotency }, additionalProperties: false },
  },
  {
    name: "validate_bot",
    description: "Validate schema, geometry, Brain and the six-trial active sandbox gate.",
    inputSchema: { type: "object", required: ["botId"], properties: { botId: id }, additionalProperties: false },
  },
  {
    name: "simulate_bot",
    description: "Run a deterministic server-side sandbox match against a reference bot or another owned bot.",
    inputSchema: { type: "object", required: ["botId"], properties: { botId: id, opponent: { type: "string", enum: ["spear", "shield", "flanker", "spinner", "glass-cannon", "chim-ung-tien-phong"] }, opponentBotId: id, seed: { type: "integer", minimum: 0, maximum: 4294967295 }, ...idempotency }, additionalProperties: false },
  },
  {
    name: "get_replay",
    description: "Read a saved sandbox or official replay and its deterministic result.",
    inputSchema: { type: "object", required: ["replayId"], properties: { replayId: id }, additionalProperties: false },
  },
  {
    name: "render_replay",
    title: "Open replay viewer",
    description: "Open the interactive PROMPT Chiến replay viewer with play, pause, seek and damage heatmap controls. Call get_replay first, then pass its replayId.",
    inputSchema: { type: "object", required: ["replayId"], properties: { replayId: id }, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: {
      ui: { resourceUri: M4_REPLAY_RESOURCE, prefersBorder: false },
      "ui/resourceUri": M4_REPLAY_RESOURCE,
      "openai/outputTemplate": M4_REPLAY_RESOURCE,
      "openai/toolInvocation/invoking": "Đang mở replay viewer…",
      "openai/toolInvocation/invoked": "Replay viewer đã sẵn sàng.",
    },
  },
  {
    name: "submit_bot",
    description: "Lock the currently validated revision and enter FIFO official matchmaking.",
    inputSchema: { type: "object", required: ["botId", "revision"], properties: { botId: id, revision: { type: "integer", minimum: 1 }, ...idempotency }, additionalProperties: false },
  },
];

export const AGENT_MD = `# PROMPT Chiến — agent guide

PROMPT Chiến is a deterministic geometric bot battle. The server is authoritative.

## Safe workflow

1. Call get_rules.
2. Call create_bot with a complete BotDefinition.
3. Call validate_bot; fix every error and keep the returned revision.
4. Call simulate_bot with a non-negative integer seed.
5. Call get_replay to inspect the result.
6. Call render_replay with that replayId when the host supports MCP Apps.
7. Call edit_bot with the returned revision, then validate and simulate again.
8. Call submit_bot only after validation passes.

Brain is declarative JSON: each rule returns one movement and one rotation action. It cannot run JavaScript, call a network, read the opponent Brain, or control an official match. Official matches use only Bot Package + Brain + Battle Engine + Ruleset + Seed.

Machine-readable resources: /rules, /schema/bot.json, /schema/replay.json. MCP endpoint: /mcp using OAuth 2.1 Authorization Code + S256 PKCE.
`;

export function schemaFor(name) {
  const definition = name === "bot" ? "BotDefinition" : "ReplayData";
  return { ...CONTRACT_SCHEMA, $id: `https://promptchien.local/schema/1/${name}.json`, $ref: `#/$defs/${definition}` };
}

export function rulesDocument() {
  return {
    versions: VERSIONS,
    ruleset: RULESET,
    workflow: ["create_bot", "validate_bot", "simulate_bot", "get_replay", "render_replay", "edit_bot", "validate_bot", "submit_bot"],
    tools: TOOL_DEFINITIONS,
    resources: ["/agent.md", "/rules", "/schema/bot.json", "/schema/replay.json", M4_REPLAY_RESOURCE],
  };
}

export async function validateDefinition(input) {
  return validateBot(input);
}

export function mcpToolResult(value, meta = undefined) {
  const structuredContent = value && typeof value === "object" ? value : { value };
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent,
    ...(meta ? { _meta: meta } : {}),
  };
}
