import { RULESET } from "./ruleset.js";
import { VERSIONS } from "./versions.js";
import { SENSORS } from "./types.js";

type Schema = Record<string, unknown>;
const object = (properties: Record<string, Schema>, required = Object.keys(properties)): Schema =>
  ({ type: "object", properties, required, additionalProperties: false });
const integer = (minimum = -2147483648, maximum = 2147483647): Schema => ({ type: "integer", minimum, maximum });
const choice = (...values: string[]): Schema => ({ type: "string", enum: values });
const text = (maxLength: number): Schema => ({ type: "string", minLength: 1, maxLength });
const literal = (value: string | number | boolean): Schema => ({ const: value });
const array = (items: Schema, minItems = 0, maxItems = 256): Schema => ({ type: "array", items, minItems, maxItems });
const ref = (name: string): Schema => ({ $ref: `#/$defs/${name}` });
const teams = (schema: Schema): Schema => object({ A: schema, B: schema });
const id = { ...text(48), pattern: "^[A-Za-z][A-Za-z0-9_-]*$" };
const triId = { ...text(50), pattern: "^[AB]:[A-Za-z][A-Za-z0-9_-]*$" };
const hash = { type: "string", pattern: "^[a-f0-9]{64}$" };
const version = { ...text(32), pattern: "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$" };
const tick = integer(0, RULESET.match.maxTicks);
const ratio = integer(0, RULESET.scale);
const team = choice("A", "B");
const winner = choice("A", "B", "draw");
const reason = choice("core", "incap", "timeout", "brainBudget");
const vec2 = object({ x: integer(), y: integer() });
const triType = choice("hammer", "scissor", "paper", "motor");
const event = (kind: string, properties: Record<string, Schema>): Schema =>
  object({ kind: literal(kind), tick, ...properties });
const versions = object({
  engine: version, ruleset: version, botSchema: literal(VERSIONS.botSchema),
  brainApi: literal(VERSIONS.brainApi), replay: version, mcpApi: version,
});
const jobBase = {
  jobId: id, mode: choice("test", "official"), seed: integer(0, 4294967295),
  packageHashes: teams(hash), engineVersion: version, rulesetVersion: version,
};

// A single source for portable JSON Schemas. No code execution or engine dependencies.
export const CONTRACT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://promptchien.local/schema/1/contracts.json",
  $defs: {
    IntExpression: { oneOf: [
      object({ kind: literal("constant"), value: integer() }),
      object({ kind: literal("sensor"), name: choice(...SENSORS) }),
      object({ kind: literal("variable"), name: id }),
      object({ kind: literal("math"), op: choice("add", "subtract", "min", "max"), left: ref("IntExpression"), right: ref("IntExpression") }),
    ] },
    Condition: { oneOf: [
      object({ op: literal("always") }),
      object({ op: literal("compare"), cmp: choice("eq", "ne", "lt", "lte", "gt", "gte"), left: ref("IntExpression"), right: ref("IntExpression") }),
      object({ op: choice("all", "any"), args: array(ref("Condition"), 1) }),
      object({ op: literal("not"), arg: ref("Condition") }),
    ] },
    BrainAction: object({
      move: object({ mode: choice("stop", "forward", "backward", "towardEnemy", "awayFromEnemy", "orbitLeft", "orbitRight"), power: ratio }),
      turn: object({ mode: choice("hold", "left", "right", "faceEnemy", "faceAway"), power: ratio, offset: integer(-32, 31) }),
    }),
    BrainRule: object({
      when: ref("Condition"), action: ref("BrainAction"),
      set: array(object({ name: id, value: ref("IntExpression") }), 0, RULESET.brain.maxVariables), nextState: id,
    }, ["when", "action"]),
    BrainProgram: object({
      apiVersion: literal(VERSIONS.brainApi), initialState: id,
      variables: array(object({ name: id, initial: integer() }), 0, RULESET.brain.maxVariables),
      states: array(object({ name: id, rules: array(ref("BrainRule"), 1, RULESET.brain.maxNodes) }), 1, RULESET.brain.maxNodes),
    }),
    Triangle: { oneOf: [
      object({ id, q: integer(), r: integer(), orientation: choice("up", "down"), type: choice("hammer", "scissor", "paper"), core: { type: "boolean" } }),
      object({ id, q: integer(), r: integer(), orientation: choice("up", "down"), type: literal("motor"), core: literal(false) }),
    ] },
    BotDefinition: object({
      schemaVersion: literal(VERSIONS.botSchema), name: { ...text(80), pattern: "\\S" },
      body: object({ triangles: {
        ...array(ref("Triangle"), 1, RULESET.geometry.maxTriangles),
        contains: { type: "object", properties: { core: literal(true) }, required: ["core"] },
        minContains: RULESET.geometry.coreCount, maxContains: RULESET.geometry.coreCount,
      } }),
      brain: ref("BrainProgram"),
    }),
    BotPackage: object({ packageHash: hash, versions, definition: ref("BotDefinition") }),
    Issue: object({ code: id, path: { type: "string", maxLength: 512 }, message: text(1000) }),
    ValidationReport: {
      ...object({
        packageHash: hash, rulesetVersion: version, engineVersion: version,
        valid: { type: "boolean" },
        checks: object(Object.fromEntries(["schema", "geometry", "brain", "sandbox"].map(name => [name, choice("pending", "passed", "failed")]))),
        errors: array(ref("Issue")), warnings: array(ref("Issue")),
      }),
      if: { properties: { valid: literal(true) }, required: ["valid"] },
      then: { properties: {
        checks: object(Object.fromEntries(["schema", "geometry", "brain", "sandbox"].map(name => [name, literal("passed")]))),
        errors: { type: "array", maxItems: 0 },
      } },
    },
    SimulationJob: { oneOf: [
      object({ ...jobBase, status: choice("queued", "running") }),
      object({ ...jobBase, status: literal("completed"), replayId: id }),
      object({ ...jobBase, status: literal("failed"), error: ref("Issue") }),
    ] },
    MatchResult: object({ winner, reason, tick, scores: teams(ratio) }),
    VfxEvent: { oneOf: [
      event("hit", { at: vec2, normal: vec2, attacker: triId, defender: triId, damage: integer(1), advantage: choice("adv", "neutral", "disadv"), impactMul: integer(RULESET.damage.impactBase, RULESET.damage.impactBase + RULESET.damage.impactRange), orientMul: integer(RULESET.damage.orientBase, RULESET.damage.orientBase + RULESET.damage.orientRange) }),
      event("destroy", { at: vec2, tri: triId, type: triType, team, by: { anyOf: [triId, { type: "null" }] } }),
      event("detach", { team, tris: { ...array(triId, 1, RULESET.geometry.maxTriangles), uniqueItems: true } }),
      event("motorLost", { team, side: choice("left", "right", "center"), count: integer(1, RULESET.geometry.maxTriangles) }),
      event("overload", { team, loadFactor: integer(0) }),
      event("coreHit", { team, hpRatio: ratio }),
      event("coreDestroyed", { team, at: vec2 }),
      event("ringStart", { radius: integer(0, RULESET.ring.startRadius) }),
      event("ringEnter", { team }), event("ringExit", { team }),
      event("matchEnd", { winner, reason }),
    ] },
    Pose: object({ position: vec2, heading: integer(0, 63) }),
    TriangleSnapshot: object({ id, hp: integer(0), maxHp: integer(1), alive: { type: "boolean" }, damageReceived: integer(0) }),
    BotSnapshot: object({
      position: vec2, heading: integer(0, 63), loadFactor: integer(0),
      triangles: array(ref("TriangleSnapshot"), 1, RULESET.geometry.maxTriangles),
    }),
    ReplayFrame: object({ tick, bots: teams(object({ position: vec2, heading: integer(0, 63), loadFactor: integer(0), changes: array(ref("TriangleSnapshot"), 0, RULESET.geometry.maxTriangles) })) }),
    ReplayCheckpoint: object({ tick, bots: teams(ref("BotSnapshot")) }),
    ReplayManifest: object({
      replayId: id, replayVersion: literal(VERSIONS.replay), engineVersion: version, rulesetVersion: version,
      mode: choice("test", "official"), seed: integer(0, 4294967295), packages: teams(ref("BotPackage")),
      tickRate: literal(RULESET.match.tickRate), totalTicks: tick, checkpointIntervalTicks: literal(RULESET.replay.checkpointIntervalTicks),
      dataHash: hash, result: ref("MatchResult"),
    }),
    ReplayData: object({
      manifest: ref("ReplayManifest"),
      frames: array(ref("ReplayFrame"), 1, RULESET.match.maxTicks + 1),
      checkpoints: array(ref("ReplayCheckpoint"), 1, RULESET.match.maxTicks / RULESET.match.tickRate + 2),
      events: array(ref("VfxEvent"), 0, 1000000),
    }),
  },
} as const;

export const SCHEMA_FILES = {
  "bot.json": "BotDefinition", "brain.json": "BrainProgram", "package.json": "BotPackage",
  "validation.json": "ValidationReport", "simulation.json": "SimulationJob", "result.json": "MatchResult",
  "replay-manifest.json": "ReplayManifest", "replay.json": "ReplayData", "event.json": "VfxEvent",
} as const;
