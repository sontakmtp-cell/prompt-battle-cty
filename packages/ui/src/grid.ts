import { RULESET } from "@prompt-chien/contracts";
import type { Vec2 } from "@prompt-chien/contracts";

export const EDITOR_Q = { min: -4, max: 10 } as const;
export const EDITOR_R = { min: -2, max: 11 } as const;

export type GridCell = { q: number; r: number; orientation: "up" | "down" };

export function cellVertices(q: number, r: number, orientation: "up" | "down"): [Vec2, Vec2, Vec2] {
  const half = RULESET.geometry.halfEdge, row = RULESET.geometry.rowHeight;
  const point = (cq: number, cr: number): Vec2 => ({ x: cq * half * 2 + cr * half, y: cr * row });
  return orientation === "up" ? [point(q, r), point(q + 1, r), point(q, r + 1)] : [point(q + 1, r), point(q + 1, r + 1), point(q, r + 1)];
}

export function cellsInView(): GridCell[] {
  const cells: GridCell[] = [];
  for (let r = EDITOR_R.min; r <= EDITOR_R.max; r++) for (let q = EDITOR_Q.min; q <= EDITOR_Q.max; q++) {
    cells.push({ q, r, orientation: "up" }, { q, r, orientation: "down" });
  }
  return cells;
}

function inside(point: Vec2, [a, b, c]: readonly [Vec2, Vec2, Vec2]): boolean {
  const sign = (p: Vec2, u: Vec2, v: Vec2) => (p.x - v.x) * (u.y - v.y) - (u.x - v.x) * (p.y - v.y);
  const d1 = sign(point, a, b), d2 = sign(point, b, c), d3 = sign(point, c, a);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0, hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

export function cellAt(point: Vec2): GridCell | null {
  let best: GridCell | null = null, bestDistance = Infinity;
  for (const cell of cellsInView()) {
    const vertices = cellVertices(cell.q, cell.r, cell.orientation);
    if (!inside(point, vertices)) continue;
    const center = { x: (vertices[0].x + vertices[1].x + vertices[2].x) / 3, y: (vertices[0].y + vertices[1].y + vertices[2].y) / 3 };
    const distance = (point.x - center.x) ** 2 + (point.y - center.y) ** 2;
    if (distance < bestDistance) { best = cell; bestDistance = distance; }
  }
  return best;
}
