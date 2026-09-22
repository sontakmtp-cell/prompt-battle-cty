import type { ReplayCheckpoint, ReplayFrame, Team, TriType, Vec2, VfxEvent } from "@prompt-chien/contracts";

export type DisplayTriangle = {
  id: string; type: TriType; core: boolean; vertices: Vec2[]; center: Vec2;
};

export type ViewerInput = {
  previous: ReplayFrame;
  next: ReplayFrame;
  checkpoint: ReplayCheckpoint;
  events: readonly VfxEvent[];
  alpha: number;
  seed: number;
  bodies: Record<Team, readonly DisplayTriangle[]>;
  frames: readonly ReplayFrame[];
  showDamage: boolean;
  organic: boolean;
};

export type ProjectedTriangle = {
  team: Team; id: string; type: TriType; core: boolean;
  world: Vec2[]; center: Vec2; hpRatio: number; heat: number;
  fill: string; stroke: string; thick: boolean; dashed: boolean; crack: boolean;
};

export type ProjectedGhost = { world: Vec2[]; fill: string; alpha: number };
export type ProjectedSpark = { x: number; y: number; radius: number; color: string; alpha: number };
export type ProjectedBadge = {
  team: Team; x: number; y: number; hpRatio: number; pulse: number;
  arcs: ReadonlyArray<readonly [number, number]>;
};
export type ProjectedFrame = {
  triangles: ProjectedTriangle[];
  ghosts: ProjectedGhost[];
  sparks: ProjectedSpark[];
  badges: ProjectedBadge[];
  ring: { radius: number; alpha: number } | null;
  hud: Record<Team, { alive: number; total: number; coreHp: number; coreMax: number; load: number }>;
  hottest: { team: Team; id: string; damage: number }[];
};
