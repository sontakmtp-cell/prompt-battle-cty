import { RULESET, VERSIONS } from "@prompt-chien/contracts";
import type { BotDefinition, BotPackage, CheckStatus, Issue, Team, ValidationReport } from "@prompt-chien/contracts";
import { checkSchema } from "@prompt-chien/contracts/validation";
import { IDLE_ACTION, validateBrain } from "@prompt-chien/core/brain";
import { analyzeGeometry, distanceSquared } from "@prompt-chien/core/geometry";
import { createMatch, packBot, stepMatch } from "@prompt-chien/core/engine";

export type BotDraft = { id: string; ownerId: string; revision: number; definition: BotDefinition };
export type DraftEdit = { botId: string; expectedRevision: number; definition: BotDefinition };
export type DefinitionInspection = {
  schema: "passed" | "failed";
  brain: "pending" | "passed" | "failed";
  geometry: "pending" | "passed" | "failed";
  issues: Issue[];
  warnings: Issue[];
  pending: readonly ["sandbox"];
  readyForSubmission: false;
};

/** Shared static inspection; sandbox validation is still required before submission. */
export function inspectDefinition(input: unknown): DefinitionInspection {
  const schema = checkSchema("BotDefinition", input);
  const pending = ["sandbox"] as const;
  if (!schema.ok) return { schema: "failed", geometry: "pending", brain: "pending", issues: schema.issues, warnings: [], pending, readyForSubmission: false };
  const brain = validateBrain(schema.value.brain);
  const geometry = analyzeGeometry(schema.value.body);
  return {
    schema: "passed", brain: brain.ok ? "passed" : "failed",
    geometry: geometry.ok ? "passed" : "failed",
    issues: [...geometry.issues, ...brain.issues.map(issue => ({ ...issue, path: `/brain${issue.path}` }))], warnings: geometry.warnings,
    pending, readyForSubmission: false,
  };
}

export async function validateBot(input: unknown): Promise<{ report: ValidationReport; package: BotPackage | null; trials: { seed: number; team: Team; ticks: number; moved: boolean; approached: boolean; engaged: boolean }[] }> {
  const inspection = inspectDefinition(input), trials: { seed: number; team: Team; ticks: number; moved: boolean; approached: boolean; engaged: boolean }[] = [];
  const checks: Record<"schema" | "geometry" | "brain" | "sandbox", CheckStatus> = { schema: inspection.schema, geometry: inspection.geometry, brain: inspection.brain, sandbox: "pending" };
  const report: ValidationReport = { packageHash: "0".repeat(64), rulesetVersion: VERSIONS.ruleset, engineVersion: VERSIONS.engine, valid: false, checks, errors: inspection.issues, warnings: inspection.warnings };
  if (inspection.issues.length) return { report, package: null, trials };
  const pkg = await packBot(input); report.packageHash = pkg.packageHash;
  const dummy = JSON.parse(JSON.stringify(pkg.definition)) as BotDefinition;
  dummy.name = "Sandbox dummy";
  dummy.brain = { apiVersion: VERSIONS.brainApi, initialState: "idle", variables: [], states: [{ name: "idle", rules: [{ when: { op: "always" }, action: IDLE_ACTION }] }] };
  const target = await packBot(dummy);
  for (const seed of [7, 42, 2026]) for (const team of ["A", "B"] as const) {
    const state = await createMatch({ packages: team === "A" ? { A: pkg, B: target } : { A: target, B: pkg }, seed });
    const bot = state.bots[team], enemy = state.bots[team === "A" ? "B" : "A"];
    const initial = { ...bot.position }, initialDistance = distanceSquared(bot.position, enemy.position);
    let moved = false, approached = false;
    while (!state.result && state.tick < RULESET.match.tickRate * 20 && bot.hitCount === 0) {
      stepMatch(state);
      moved ||= distanceSquared(bot.position, initial) >= 500 ** 2;
      approached ||= distanceSquared(bot.position, enemy.position) < initialDistance - 1000 ** 2;
    }
    trials.push({ seed, team, ticks: state.tick, moved, approached, engaged: bot.hitCount > 0 });
  }
  checks.sandbox = trials.every(t => t.moved && t.approached && t.engaged) ? "passed" : "failed";
  if (checks.sandbox === "failed") report.errors.push({ code: "PASSIVE_BRAIN", path: "/brain", message: "Bot must move, approach and hit the dummy within 20 seconds in all six trials." });
  report.valid = checks.sandbox === "passed";
  // Hash is bound to the exact definition above; callers still enforce ownership/revision at submit time.
  return { report, package: report.valid ? pkg : null, trials };
}
