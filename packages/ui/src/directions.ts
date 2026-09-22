import type { Vec2 } from "@prompt-chien/contracts";

// Same rounded table as the simulation. tests/m2 checks these stay identical.
const COS = [1000,995,981,957,924,882,831,773,707,634,556,471,383,290,195,98,0,-98,-195,-290,-383,-471,-556,-634,-707,-773,-831,-882,-924,-957,-981,-995,-1000,-995,-981,-957,-924,-882,-831,-773,-707,-634,-556,-471,-383,-290,-195,-98,0,98,195,290,383,471,556,634,707,773,831,882,924,957,981,995];

export const DISPLAY_DIRECTIONS: readonly Vec2[] = Object.freeze(COS.map((x, i) => Object.freeze({ x, y: COS[(i + 48) % 64] ?? 0 })));

export function displayDirection(heading: number): Vec2 {
  const wrapped = ((heading % 64) + 64) % 64;
  const index = Math.floor(wrapped) % 64;
  const next = DISPLAY_DIRECTIONS[(index + 1) % 64] ?? DISPLAY_DIRECTIONS[0]!;
  const current = DISPLAY_DIRECTIONS[index] ?? next;
  const fraction = wrapped - index;
  if (fraction === 0) return current;
  return { x: current.x + (next.x - current.x) * fraction, y: current.y + (next.y - current.y) * fraction };
}
