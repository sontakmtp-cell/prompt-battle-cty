import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RULESET, VERSIONS } from "@prompt-chien/contracts";

// Shape examples only; the placeholder hashes and replay are NOT engine verification evidence.
const bot = JSON.parse(readFileSync(new URL("bot-basic.json", import.meta.url), "utf8"));
const brain = JSON.parse(readFileSync(new URL("brain-flanker.json", import.meta.url), "utf8"));
const hash = "0".repeat(64);
const botPackage = { packageHash: hash, versions: VERSIONS, definition: bot };
const result = { winner: "draw", reason: "timeout", tick: 3600, scores: { A: 650, B: 650 } };
const manifest = {
  replayId: "m0-shape-example", replayVersion: VERSIONS.replay, engineVersion: VERSIONS.engine,
  rulesetVersion: VERSIONS.ruleset, mode: "test", seed: 42,
  packages: { A: botPackage, B: botPackage }, tickRate: 30, totalTicks: 3600,
  checkpointIntervalTicks: 30, dataHash: hash, result,
};
const pose = { position: { x: 10000, y: 20000 }, heading: 0 };
const snapshot = {
  ...pose, loadFactor: 1000,
  triangles: bot.body.triangles.map(triangle => ({
    id: triangle.id, hp: RULESET.triangles[triangle.type].hp, maxHp: RULESET.triangles[triangle.type].hp,
    alive: true, damageReceived: 0,
  })),
};
export const examples = JSON.parse(JSON.stringify({
  BotDefinition: bot,
  BrainProgram: brain,
  BotPackage: botPackage,
  ValidationReport: {
    packageHash: hash, rulesetVersion: VERSIONS.ruleset, engineVersion: VERSIONS.engine, valid: false,
    checks: { schema: "passed", brain: "passed", geometry: "pending", sandbox: "pending" }, errors: [], warnings: [],
  },
  SimulationJob: {
    jobId: "m0-job-example", mode: "test", seed: 42, packageHashes: { A: hash, B: hash },
    engineVersion: VERSIONS.engine, rulesetVersion: VERSIONS.ruleset, status: "queued",
  },
  MatchResult: result,
  ReplayManifest: manifest,
  ReplayData: {
    manifest,
    frames: [{ tick: 0, bots: { A: { ...pose, loadFactor: 1000, changes: [] }, B: { ...pose, loadFactor: 1000, changes: [] } } }],
    checkpoints: [{ tick: 0, bots: { A: snapshot, B: snapshot } }],
    events: [{ kind: "matchEnd", tick: 3600, winner: "draw", reason: "timeout" }],
  },
  VfxEvent: {
    kind: "hit", tick: 120, at: { x: 20000, y: 20000 }, normal: { x: 1000, y: 0 },
    attacker: "A:t1", defender: "B:t2", damage: 48, advantage: "adv", impactMul: 1000, orientMul: 1000,
  },
}));

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(examples, null, 2));
