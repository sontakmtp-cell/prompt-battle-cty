import { VERSIONS } from "@prompt-chien/contracts";
import type { BotDefinition, Triangle } from "@prompt-chien/contracts";
import { DEFAULT_TACTIC, tacticBrain } from "./tactics.js";

const cell = (id: string, q: number, r: number, orientation: "up" | "down", type: Triangle["type"], core = false): Triangle => (
  type === "motor" ? { id, q, r, orientation, type, core: false } : { id, q, r, orientation, type, core }
);

/** A short spear: motors at the tail, core on paper, hammers toward the nose. */
export function starterTriangles(): Triangle[] {
  return [
    cell("a0", 0, 0, "up", "motor"),
    cell("a1", 0, 0, "down", "motor"),
    cell("a2", 0, 1, "up", "paper", true),
    cell("a3", 0, 1, "down", "paper"),
    cell("a4", 0, 2, "up", "hammer"),
    cell("a5", 0, 2, "down", "hammer"),
    cell("a6", 0, 3, "up", "hammer"),
    cell("a7", 0, 3, "down", "scissor"),
  ];
}

export function starterDefinition(name = "Bot mới"): BotDefinition {
  return { schemaVersion: VERSIONS.botSchema, name, body: { triangles: starterTriangles() }, brain: tacticBrain(DEFAULT_TACTIC) };
}
