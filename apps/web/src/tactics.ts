import { VERSIONS } from "@prompt-chien/contracts";
import type { BrainAction, BrainProgram, BrainRule, Condition } from "@prompt-chien/contracts";

export type TacticStyle = "charge" | "flank" | "kite" | "hold";
export type Tactic = {
  style: TacticStyle;
  power: number;
  engage: number;
  retreatHp: number;
  orbit: "orbitLeft" | "orbitRight";
};

export const DEFAULT_TACTIC: Tactic = { style: "charge", power: 1000, engage: 6000, retreatHp: 350, orbit: "orbitLeft" };

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, Math.round(value)));

function action(mode: BrainAction["move"]["mode"], power: number, offset = 0): BrainAction {
  return { move: { mode, power }, turn: { mode: "faceEnemy", power: 1000, offset } };
}

function when(sensor: "enemy.distance" | "self.coreHpRatio" | "stateTicks", cmp: "lt" | "gte", value: number): Condition {
  return { op: "compare", cmp, left: { kind: "sensor", name: sensor }, right: { kind: "constant", value } };
}

function always(move: BrainAction): BrainRule {
  return { when: { op: "always" }, action: move };
}

/** Sample tactics a player can tune without writing Brain JSON. */
export function tacticBrain(tactic: Tactic): BrainProgram {
  const power = clamp(tactic.power, 0, 1000);
  const engage = clamp(tactic.engage, 0, 40000);
  const retreatHp = clamp(tactic.retreatHp, 0, 1000);
  const offset = tactic.orbit === "orbitLeft" ? 16 : -16;
  const program = (initialState: string, states: BrainProgram["states"]): BrainProgram => ({
    apiVersion: VERSIONS.brainApi, initialState, variables: [], states,
  });
  if (tactic.style === "flank") {
    const orbit = action(tactic.orbit, power, offset);
    return program("approach", [
      { name: "approach", rules: [{ when: when("enemy.distance", "lt", engage), action: orbit, nextState: "flank" }, always(action("towardEnemy", power))] },
      { name: "flank", rules: [{ when: when("stateTicks", "gte", 40), action: action("towardEnemy", power), nextState: "approach" }, always(orbit)] },
    ]);
  }
  if (tactic.style === "kite") {
    return program("fight", [{ name: "fight", rules: [
      { when: when("self.coreHpRatio", "lt", retreatHp), action: action("awayFromEnemy", power) },
      always(action("towardEnemy", power)),
    ] }]);
  }
  if (tactic.style === "hold") {
    return program("fight", [{ name: "fight", rules: [
      { when: when("enemy.distance", "gte", engage), action: action("stop", 0) },
      always(action("towardEnemy", power)),
    ] }]);
  }
  return program("fight", [{ name: "fight", rules: [always(action("towardEnemy", power))] }]);
}
