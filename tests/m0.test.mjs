import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { RULESET, VERSIONS } from "@prompt-chien/contracts";
import { CONTRACT_SCHEMA, SCHEMA_FILES } from "@prompt-chien/contracts/schema";
import { checkSchema } from "@prompt-chien/contracts/validation";
import { validateBrain } from "@prompt-chien/core/brain";
import { TICK_PHASES } from "@prompt-chien/core/engine";
import { inspectDefinition } from "@prompt-chien/application";
import { examples } from "../examples/catalog.mjs";
import { checkBoundaries } from "../scripts/check-boundaries.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const clone = value => JSON.parse(JSON.stringify(value));

test("all exported JSON schemas compile and their example payloads validate", () => {
  assert.deepEqual(JSON.parse(readFileSync(join(root, "schemas/contracts.json"), "utf8")), CONTRACT_SCHEMA);
  for (const [filename, name] of Object.entries(SCHEMA_FILES)) {
    const disk = JSON.parse(readFileSync(join(root, "schemas", filename), "utf8"));
    assert.equal(new URL(disk.$ref, disk.$id).href, `${CONTRACT_SCHEMA.$id}#/$defs/${name}`);
    const check = checkSchema(name, examples[name]);
    assert.equal(check.ok, true, `${name}: ${JSON.stringify(check.issues)}`);
    assert.equal(checkSchema(name, {}).ok, false, `${name} accepted an empty object`);
  }
  assert.deepEqual(Object.keys(VERSIONS).sort(), ["botSchema", "brainApi", "engine", "mcpApi", "replay", "ruleset"]);
  const archived = clone(examples.BotPackage);
  archived.versions.engine = "1.2.3";
  archived.versions.ruleset = "2.0.0";
  assert.equal(checkSchema("BotPackage", archived).ok, true, "Engine/ruleset versions must be independent of the bot schema");
  archived.versions.engine = "latest";
  assert.equal(checkSchema("BotPackage", archived).ok, false);
});

test("bot schema rejects bad Core, budget, versions, units and extra fields without mutating input", () => {
  const mutations = [
    bot => { bot.body.triangles[0].type = "motor"; },
    bot => { bot.body.triangles[0].core = false; },
    bot => { bot.body.triangles[1].core = true; },
    bot => { bot.body.triangles = Array.from({ length: 61 }, (_, i) => ({ ...bot.body.triangles[i % 8], id: `t${i}`, core: i === 0 })); },
    bot => { bot.body.triangles[0].q = 0.5; },
    bot => { bot.body.triangles[0].orientation = "sideways"; },
    bot => { bot.name = "   "; },
    bot => { bot.schemaVersion = "999.0.0"; },
    bot => { bot.brain.apiVersion = "999.0.0"; },
    bot => { bot.brain.states[0].rules[0].action.move.power = 1001; },
    bot => { bot.ownerId = "injected-owner"; },
    bot => { bot.brain.code = "fetch('https://example.org')"; },
  ];
  for (const mutate of mutations) {
    const bot = clone(examples.BotDefinition);
    mutate(bot);
    const before = clone(bot);
    assert.equal(checkSchema("BotDefinition", bot).ok, false, mutate.toString());
    assert.deepEqual(bot, before);
  }
  const cycle = {}; cycle.child = cycle;
  assert.equal(checkSchema("BotDefinition", cycle).ok, false);
  assert.equal(checkSchema("BotDefinition", { n: Infinity }).ok, false);
  assert.equal(checkSchema("BotDefinition", new Date()).ok, false);
  assert.equal(checkSchema("BotDefinition", { n: () => 1 }).ok, false);
});

test("Brain static validation enforces references, 256 nodes, depth 16, and 32 variables", () => {
  assert.equal(validateBrain(examples.BotDefinition.brain).ok, true);
  assert.equal(validateBrain(examples.BrainProgram).ok, true);
  const mutations = [
    brain => { brain.initialState = "missing"; },
    brain => { brain.states[0].rules[0].nextState = "missing"; },
    brain => { brain.states.push(clone(brain.states[0])); },
    brain => { brain.variables = [{ name: "x", initial: 0 }, { name: "x", initial: 1 }]; },
    brain => { brain.states[0].rules[0].set = [{ name: "missing", value: { kind: "constant", value: 1 } }]; },
    brain => { brain.states[0].rules[0].when = { op: "compare", cmp: "eq", left: { kind: "variable", name: "missing" }, right: { kind: "constant", value: 0 } }; },
    brain => { brain.states[0].rules[0].when = { op: "compare", cmp: "eq", left: { kind: "sensor", name: "enemy.brain" }, right: { kind: "constant", value: 0 } }; },
    brain => { brain.states[0].rules[0].action.move.mode = "teleport"; },
    brain => { brain.states[0].rules[0].when = { op: "javascript", code: "return true" }; },
    brain => {
      brain.variables = [{ name: "x", initial: 0 }];
      brain.states[0].rules[0].set = [0, 1].map(value => ({ name: "x", value: { kind: "constant", value } }));
    },
  ];
  for (const mutate of mutations) {
    const brain = clone(examples.BotDefinition.brain); mutate(brain);
    assert.equal(validateBrain(brain).ok, false, mutate.toString());
  }
  const brain = clone(examples.BotDefinition.brain);
  brain.variables = Array.from({ length: 32 }, (_, i) => ({ name: `v${i}`, initial: 0 }));
  assert.equal(validateBrain(brain).ok, true);
  brain.variables.push({ name: "extra", initial: 0 });
  assert.equal(validateBrain(brain).ok, false);

  const wide = clone(examples.BotDefinition.brain);
  wide.variables = Array.from({ length: 4 }, (_, i) => ({ name: `v${i}`, initial: 0 }));
  wide.states[0].rules = Array.from({ length: 50 }, () => clone(wide.states[0].rules[0]));
  assert.deepEqual([validateBrain(wide).ok, validateBrain(wide).nodes], [true, 256]);
  wide.variables.push({ name: "extra", initial: 0 });
  assert.equal(validateBrain(wide).ok, false);

  const deep = clone(examples.BotDefinition.brain);
  for (let i = 0; i < 12; i++) deep.states[0].rules[0].when = { op: "not", arg: deep.states[0].rules[0].when };
  assert.deepEqual([validateBrain(deep).ok, validateBrain(deep).depth], [true, 16]);
  deep.states[0].rules[0].when = { op: "not", arg: deep.states[0].rules[0].when };
  assert.equal(validateBrain(deep).ok, false);
});

test("initial ruleset preserves the damage matrix and RPS invariant after integer rounding", () => {
  function checkIntegers(value) {
    for (const child of Object.values(value)) {
      if (typeof child === "number") assert.equal(Number.isInteger(child), true);
      else if (child && typeof child === "object") checkIntegers(child);
    }
  }
  checkIntegers(RULESET);
  const { triangles, damage: d } = RULESET;
  const combat = ["hammer", "scissor", "paper"];
  const expected = [[24, 48, 12, 24], [8, 16, 32, 16], [20, 5, 10, 10]];
  const damage = (attacker, multiplier, impact = 1000, orientation = 1000) =>
    Number(BigInt(triangles[attacker].damage) * BigInt(multiplier) * BigInt(impact) * BigInt(orientation) / 1000000000n);
  for (const [i, attacker] of combat.entries()) {
    assert.equal(triangles[attacker].hp * triangles[attacker].damage, 1680);
    for (const [j, defender] of [...combat, "motor"].entries()) {
      const multiplier = defender === "motor" ? d.motorMultiplier : attacker === defender ? d.neutral : d.beats[attacker] === defender ? d.advantage : d.disadvantage;
      assert.equal(damage(attacker, multiplier), expected[i][j]);
    }
    assert.ok(damage(attacker, d.advantage, d.impactBase, d.orientBase) > damage(d.beats[attacker], d.disadvantage));
  }
  assert.equal(damage("motor", d.neutral), 0);
  assert.equal(d.orientLut.length, 64);
  assert.deepEqual(d.orientLut.slice(0, 17), [1000, 999, 997, 994, 989, 982, 975, 966, 956, 945, 933, 921, 907, 894, 879, 865, 850]);
  assert.ok(d.orientLut.slice(17).every(value => value === 850));
  assert.equal(RULESET.score.damage + RULESET.score.core + RULESET.score.combat + RULESET.score.motor, 1000);
  assert.equal(RULESET.monoculture.blockEnabled, false);
  assert.equal(RULESET.motor.floorAtInitialLoad, true);
  assert.equal(d.hitCooldownScope, "perTriangleDefender");
  assert.equal(RULESET.geometry.coreOnMotor, false);
  assert.equal(RULESET.ring.startTick, 60 * RULESET.match.tickRate);
  assert.equal(RULESET.match.maxTicks, 120 * RULESET.match.tickRate);
  assert.equal(RULESET.brain.stepsPerTick, 1000);
  assert.equal(RULESET.brain.violationTicks, 30);
  assert.equal(RULESET.diversity.countMotor, false);
  assert.throws(() => { RULESET.triangles.hammer.hp = 0; }, TypeError);
  assert.throws(() => { d.orientLut[0] = 0; }, TypeError);
  assert.deepEqual(TICK_PHASES, ["sense", "think", "intent", "moveRotate", "collision", "damage", "structure", "winCheck", "eventLog"]);
});

test("jobs, replay events and static inspection never claim unrun simulation checks passed", () => {
  const inspection = inspectDefinition(examples.BotDefinition);
  assert.equal(inspection.schema, "passed");
  assert.equal(inspection.geometry, "passed");
  assert.equal(inspection.brain, "passed");
  assert.deepEqual(inspection.issues, []);
  assert.deepEqual(inspection.pending, ["sandbox"]);
  assert.equal(inspection.readyForSubmission, false);
  const bad = clone(examples.BotDefinition); bad.brain.initialState = "missing";
  assert.equal(inspectDefinition(bad).brain, "failed");
  assert.equal(inspectDefinition({}).schema, "failed");
  const report = clone(examples.ValidationReport); report.valid = true;
  assert.equal(checkSchema("ValidationReport", report).ok, false);
  report.checks = { schema: "passed", brain: "passed", geometry: "passed", sandbox: "passed" };
  assert.equal(checkSchema("ValidationReport", report).ok, true);
  report.errors = [{ code: "BAD", path: "", message: "failure" }];
  assert.equal(checkSchema("ValidationReport", report).ok, false);
  const job = clone(examples.SimulationJob); job.status = "completed";
  assert.equal(checkSchema("SimulationJob", job).ok, false);
  job.replayId = "replay-example";
  assert.equal(checkSchema("SimulationJob", job).ok, true);
  const hit = clone(examples.VfxEvent); hit.impactMul = 0.85;
  assert.equal(checkSchema("VfxEvent", hit).ok, false);
  hit.impactMul = 1000; hit.attacker = "t1";
  assert.equal(checkSchema("VfxEvent", hit).ok, false);
  const replay = clone(examples.ReplayData); replay.checkpoints[0].bots.A.triangles[0].damageReceived = -1;
  assert.equal(checkSchema("ReplayData", replay).ok, false);
});

test("dependency gate detects forbidden packages, internals, cycles and nondeterministic core code", () => {
  assert.deepEqual(checkBoundaries(root), []);
  const temporary = mkdtempSync(join(tmpdir(), "promptchien-boundaries-"));
  const write = (path, content) => { mkdirSync(dirname(join(temporary, path)), { recursive: true }); writeFileSync(join(temporary, path), content); };
  try {
    for (const name of ["contracts", "core", "application", "ui"]) {
      write(`packages/${name}/package.json`, readFileSync(join(root, `packages/${name}/package.json`)));
      if (name !== "core") write(`packages/${name}/src/index.ts`, "export {};");
    }
    for (const name of ["geometry", "brain", "engine", "replay"]) write(`packages/core/src/${name}/index.ts`, "export {};");
    write("packages/core/src/brain/private.ts", "export {};");
    assert.deepEqual(checkBoundaries(temporary), []);
    const invalid = [
      ["packages/core/src/brain/index.ts", "import '@prompt-chien/application';", /Forbidden package import/],
      ["packages/core/src/engine/index.ts", "import '../brain/private.js';", /Forbidden core import/],
      ["packages/application/src/index.ts", "import type {} from '@prompt-chien/contracts/dist/types.js';", /Private package import/],
      ["packages/core/src/geometry/index.ts", "import 'node:fs';", /Forbidden external import/],
      ["packages/contracts/src/index.ts", "export * from '../../core/src/brain/index.js';", /Cross-package relative/],
      ["packages/core/src/brain/index.ts", "export const roll = Math.random();", /seeded RNG/],
      ["packages/core/src/brain/index.ts", "export const now = Date.now();", /Forbidden simulation global/],
      ["packages/core/src/brain/index.ts", "const path = 'x'; import(path);", /Computed import/],
    ];
    for (const [path, code, expected] of invalid) {
      write(path, code);
      assert.match(checkBoundaries(temporary).join("\n"), expected);
      write(path, "export {};");
    }
    write("packages/core/src/brain/a.ts", "import './b.js';");
    write("packages/core/src/brain/b.ts", "import './a.js';");
    assert.match(checkBoundaries(temporary).join("\n"), /Dependency cycle/);
    write("packages/core/src/brain/a.ts", "export {};");
    write("packages/core/src/brain/b.ts", "export {};");
    const manifest = JSON.parse(readFileSync(join(temporary, "packages/contracts/package.json"), "utf8"));
    manifest.dependencies["@prompt-chien/core"] = "workspace:*";
    write("packages/contracts/package.json", JSON.stringify(manifest));
    assert.match(checkBoundaries(temporary).join("\n"), /Dependency cycle/);
  } finally {
    assert.equal(dirname(resolve(temporary)), resolve(tmpdir()));
    assert.ok(basename(temporary).startsWith("promptchien-boundaries-"));
    rmSync(temporary, { recursive: true });
  }
});
