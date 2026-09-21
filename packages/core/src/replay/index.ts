import { hashJson, RULESET, VERSIONS } from "@prompt-chien/contracts";
import type { ReplayCheckpoint, ReplayData } from "@prompt-chien/contracts";
import { checkSchema } from "@prompt-chien/contracts/validation";
import { simulateMatch } from "../engine/index.js";
import type { MatchInput, Simulation } from "../engine/index.js";

// The deterministic payload excludes operational IDs and timestamps.
export type ReplayHashInput = {
  engineVersion: string; rulesetVersion: string; replayVersion: string;
  seed: number; packageHashes: { A: string; B: string };
  frames: ReplayData["frames"]; checkpoints: ReplayData["checkpoints"];
  events: ReplayData["events"]; result: ReplayData["manifest"]["result"];
};

export function replayPayload(replay: ReplayData): ReplayHashInput {
  const m = replay.manifest;
  return { engineVersion: m.engineVersion, rulesetVersion: m.rulesetVersion, replayVersion: m.replayVersion,
    seed: m.seed, packageHashes: { A: m.packages.A.packageHash, B: m.packages.B.packageHash },
    frames: replay.frames, checkpoints: replay.checkpoints, events: replay.events, result: m.result };
}

export async function createReplay(input: MatchInput, simulation?: Simulation): Promise<ReplayData> {
  const data = simulation ?? await simulateMatch(input);
  if (!data.frames.length) throw new Error("Replay requires a recorded simulation");
  const replay: ReplayData = {
    manifest: { replayId: "pending", replayVersion: VERSIONS.replay, engineVersion: VERSIONS.engine,
      rulesetVersion: VERSIONS.ruleset, mode: "test", seed: input.seed,
      packages: JSON.parse(JSON.stringify(input.packages)) as MatchInput["packages"], tickRate: RULESET.match.tickRate,
      totalTicks: data.result.tick, checkpointIntervalTicks: RULESET.replay.checkpointIntervalTicks, dataHash: "", result: data.result },
    frames: data.frames, checkpoints: data.checkpoints, events: data.events,
  };
  replay.manifest.dataHash = await hashJson(replayPayload(replay));
  replay.manifest.replayId = `replay-${replay.manifest.dataHash.slice(0, 24)}`;
  return replay;
}

export function seekReplay(replay: ReplayData, tick: number): ReplayCheckpoint {
  if (!Number.isInteger(tick) || tick < 0 || tick > replay.manifest.totalTicks) throw new Error("Seek tick out of range");
  const checkpoint = replay.checkpoints.findLast(c => c.tick <= tick);
  if (!checkpoint) throw new Error("Replay has no initial checkpoint");
  const snapshot = JSON.parse(JSON.stringify(checkpoint)) as ReplayCheckpoint;
  for (let current = checkpoint.tick + 1; current <= tick; current++) {
    const frame = replay.frames[current];
    if (!frame || frame.tick !== current) throw new Error(`Missing replay tick ${current}`);
    for (const team of ["A", "B"] as const) {
      const source = frame.bots[team], target = snapshot.bots[team];
      target.position = { ...source.position }; target.heading = source.heading; target.loadFactor = source.loadFactor;
      for (const changed of source.changes) {
        const index = target.triangles.findIndex(t => t.id === changed.id);
        if (index < 0) throw new Error(`Unknown triangle in replay: ${changed.id}`);
        target.triangles[index] = { ...changed };
      }
    }
  }
  snapshot.tick = tick;
  return snapshot;
}

export async function verifyReplay(input: unknown): Promise<{ verified: true; hash: string; ticks: number }> {
  const checked = checkSchema("ReplayData", input);
  if (!checked.ok) throw new Error(`Replay schema: ${JSON.stringify(checked.issues)}`);
  const replay = checked.value, m = replay.manifest;
  if (m.engineVersion !== VERSIONS.engine || m.rulesetVersion !== VERSIONS.ruleset || m.replayVersion !== VERSIONS.replay) throw new Error("Replay needs a different archived engine/ruleset");
  if (m.totalTicks !== m.result.tick || replay.frames.length !== m.totalTicks + 1) throw new Error("Incomplete replay timeline");
  if (await hashJson(replayPayload(replay)) !== m.dataHash) throw new Error("Replay hash mismatch");
  const rerun = await createReplay({ packages: m.packages, seed: m.seed });
  if (rerun.manifest.dataHash !== m.dataHash) throw new Error("Replay differs from deterministic simulation");
  return { verified: true, hash: m.dataHash, ticks: m.totalTicks };
}
