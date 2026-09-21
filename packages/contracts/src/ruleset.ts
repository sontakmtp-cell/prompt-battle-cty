import { VERSIONS } from "./versions.js";

// Source: Docs/can_bang.md; load bands: Docs/gameplay.md 3.4.1.
// All multipliers, distances and speeds use integers in units of 1/1000.
const ruleset = {
  version: VERSIONS.ruleset,
  scale: 1000,
  triangles: {
    hammer: { hp: 70, damage: 24 },
    scissor: { hp: 105, damage: 16 },
    paper: { hp: 168, damage: 10 },
    motor: { hp: 80, damage: 0 },
  },
  geometry: { maxTriangles: 60, maxWidth: 12000, maxHeight: 12000, coreCount: 1, coreOnMotor: false, halfEdge: 500, rowHeight: 866 },
  arena: { width: 40000, height: 40000, center: { x: 20000, y: 20000 } },
  match: { tickRate: 30, maxTicks: 3600, incapTicks: 300 },
  damage: {
    advantage: 2000, neutral: 1000, disadvantage: 500, motorMultiplier: 1000,
    beats: { hammer: "scissor", scissor: "paper", paper: "hammer" },
    impactRefSpeed: 4000,
    impactBase: 850, impactRange: 150, impactRatioMax: 1000,
    orientBase: 850, orientRange: 150, orientSteps: 64,
    // Index is the unsigned shortest angle (0..32), NOT the bot's absolute heading.
    orientLut: [1000, 999, 997, 994, 989, 982, 975, 966, 956,
      945, 933, 921, 907, 894, 879, 865, 850, ...Array<number>(47).fill(850)],
    hitCooldownTicks: 12, hitCooldownScope: "perTriangleDefender",
  },
  diversity: { bonusPerType: 120, maxCombatTypes: 3, countMotor: false, applyTo: "maxHp", recalcOn: "structureChange" },
  monoculture: { warnAbove: 650, blockAbove: 800, blockEnabled: false },
  motor: {
    pullPerMotor: 4, floorAtInitialLoad: true, noMotorSpeed: 0, noMotorLoad: 2147483647,
    // Above 1000: linear interpolation to the next anchor. Above 2000: 150.
    loadBands: [
      { through: 500, speed: 1150 }, { through: 1000, speed: 1000 },
      { through: 1500, speed: 700 }, { through: 2000, speed: 400 },
    ],
    overloadSpeed: 150,
  },
  ring: { startTick: 1800, startRadius: 28300, endRadius: 4000, announceTicks: 45, drainPerTick: 15 },
  movement: { maxSpeed: 4000, acceleration: 8000, drag: 900, turnStepsPerSecond: 8, maxSubstep: 150, contactSkin: 10 },
  score: { damage: 350, core: 300, combat: 200, motor: 150, damageNormalization: "opponentMaximum" },
  brain: { maxNodes: 256, maxDepth: 16, maxVariables: 32, stepsPerTick: 1000, violationTicks: 30 },
  replay: { checkpointIntervalTicks: 30 },
} as const;

// Freeze nested data as well: shared balance must not change halfway through a match.
export function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
export const RULESET = freeze(ruleset);
