import type { ReplayCheckpoint, ReplayFrame, VfxEvent } from "@prompt-chien/contracts";

// M2 will render these inputs with Canvas 2D + DOM. UI never returns simulation state.
export type ViewerInput = {
  previous: ReplayFrame;
  next: ReplayFrame;
  checkpoint: ReplayCheckpoint;
  events: readonly VfxEvent[];
  alpha: number;
  seed: number;
};
