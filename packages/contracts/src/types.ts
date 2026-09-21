export type Team = "A" | "B";
export type TriType = "hammer" | "scissor" | "paper" | "motor";
export type CombatType = Exclude<TriType, "motor">;
export type TriId = `${Team}:${string}`;
export type Vec2 = { x: number; y: number };
export type Versions = {
  engine: string; ruleset: string; botSchema: string;
  brainApi: string; replay: string; mcpApi: string;
};
export type Triangle = {
  id: string; q: number; r: number; orientation: "up" | "down";
} & ({ type: CombatType; core: boolean } | { type: "motor"; core: false });

export const SENSORS = [
  "tick", "stateTicks", "self.x", "self.y", "self.heading", "self.coreHpRatio",
  "self.combatCount", "self.motorCount", "self.loadFactor", "self.speed",
  "enemy.distance", "enemy.bearing", "enemy.heading", "enemy.coreHpRatio",
  "enemy.combatCount", "enemy.motorCount", "ring.radius", "self.outsideRing",
] as const;
export type Sensor = typeof SENSORS[number];
export type IntExpression =
  | { kind: "constant"; value: number }
  | { kind: "sensor"; name: Sensor }
  | { kind: "variable"; name: string }
  | { kind: "math"; op: "add" | "subtract" | "min" | "max"; left: IntExpression; right: IntExpression };
export type Condition =
  | { op: "always" }
  | { op: "compare"; cmp: "eq" | "ne" | "lt" | "lte" | "gt" | "gte"; left: IntExpression; right: IntExpression }
  | { op: "all" | "any"; args: Condition[] }
  | { op: "not"; arg: Condition };
export type BrainAction = {
  move: { mode: "stop" | "forward" | "backward" | "towardEnemy" | "awayFromEnemy" | "orbitLeft" | "orbitRight"; power: number };
  turn: { mode: "hold" | "left" | "right" | "faceEnemy" | "faceAway"; power: number; offset: number };
};
export type BrainRule = {
  when: Condition; action: BrainAction;
  set?: { name: string; value: IntExpression }[];
  nextState?: string;
};
export type BrainProgram = {
  apiVersion: string;
  initialState: string;
  variables: { name: string; initial: number }[];
  states: { name: string; rules: BrainRule[] }[];
};
export type BotDefinition = {
  schemaVersion: string; name: string;
  body: { triangles: Triangle[] };
  brain: BrainProgram;
};
export type BotPackage = {
  packageHash: string;
  versions: Versions;
  definition: BotDefinition;
};
export type Issue = { code: string; path: string; message: string };
export type CheckStatus = "pending" | "passed" | "failed";
export type ValidationReport = {
  packageHash: string; rulesetVersion: string; engineVersion: string;
  valid: boolean;
  checks: { schema: CheckStatus; geometry: CheckStatus; brain: CheckStatus; sandbox: CheckStatus };
  errors: Issue[]; warnings: Issue[];
};
export type JobBase = {
  jobId: string; mode: "test" | "official"; seed: number;
  packageHashes: Record<Team, string>; engineVersion: string; rulesetVersion: string;
};
export type SimulationJob = JobBase & (
  | { status: "queued" | "running" }
  | { status: "completed"; replayId: string }
  | { status: "failed"; error: Issue }
);
export type MatchEndReason = "core" | "incap" | "timeout" | "brainBudget";
export type MatchResult = {
  winner: Team | "draw"; reason: MatchEndReason; tick: number;
  scores: Record<Team, number>;
};
export type VfxEvent =
  | { kind: "hit"; tick: number; at: Vec2; normal: Vec2; attacker: TriId; defender: TriId;
      damage: number; advantage: "adv" | "neutral" | "disadv"; impactMul: number; orientMul: number }
  | { kind: "destroy"; tick: number; at: Vec2; tri: TriId; type: TriType; team: Team; by: TriId | null }
  | { kind: "detach"; tick: number; team: Team; tris: TriId[] }
  | { kind: "motorLost"; tick: number; team: Team; side: "left" | "right" | "center"; count: number }
  | { kind: "overload"; tick: number; team: Team; loadFactor: number }
  | { kind: "coreHit"; tick: number; team: Team; hpRatio: number }
  | { kind: "coreDestroyed"; tick: number; team: Team; at: Vec2 }
  | { kind: "ringStart"; tick: number; radius: number }
  | { kind: "ringEnter" | "ringExit"; tick: number; team: Team }
  | { kind: "matchEnd"; tick: number; winner: Team | "draw"; reason: MatchEndReason };
export type Pose = { position: Vec2; heading: number };
export type TriangleSnapshot = {
  id: string; hp: number; maxHp: number; alive: boolean; damageReceived: number;
};
export type BotSnapshot = Pose & { triangles: TriangleSnapshot[]; loadFactor: number };
export type ReplayBotFrame = Pose & { loadFactor: number; changes: TriangleSnapshot[] };
export type ReplayFrame = { tick: number; bots: Record<Team, ReplayBotFrame> };
export type ReplayCheckpoint = { tick: number; bots: Record<Team, BotSnapshot> };
export type ReplayManifest = {
  replayId: string; replayVersion: string; engineVersion: string; rulesetVersion: string;
  mode: "test" | "official"; seed: number; packages: Record<Team, BotPackage>;
  tickRate: number; totalTicks: number; checkpointIntervalTicks: number;
  dataHash: string; result: MatchResult;
};
export type ReplayData = {
  manifest: ReplayManifest; frames: ReplayFrame[]; checkpoints: ReplayCheckpoint[]; events: VfxEvent[];
};
export type ContractMap = {
  BotDefinition: BotDefinition; BrainProgram: BrainProgram; BotPackage: BotPackage;
  ValidationReport: ValidationReport; SimulationJob: SimulationJob; MatchResult: MatchResult;
  ReplayManifest: ReplayManifest; ReplayData: ReplayData; VfxEvent: VfxEvent;
};
