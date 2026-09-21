import type { Vec2 } from "@prompt-chien/contracts";

// Rounded offline, never generated with floating-point trigonometry at runtime.
const COS = [1000,995,981,957,924,882,831,773,707,634,556,471,383,290,195,98,0,-98,-195,-290,-383,-471,-556,-634,-707,-773,-831,-882,-924,-957,-981,-995,-1000,-995,-981,-957,-924,-882,-831,-773,-707,-634,-556,-471,-383,-290,-195,-98,0,98,195,290,383,471,556,634,707,773,831,882,924,957,981,995];
export const DIRECTIONS: readonly Vec2[] = Object.freeze(COS.map((x, i) => Object.freeze({ x, y: COS[(i + 48) % 64]! })));
export const div = (a: number, b: number): number => Math.trunc(a / b);
export const clamp = (n: number, low: number, high: number): number => Math.max(low, Math.min(high, n));
export const angleDelta = (target: number, current: number): number => ((target - current + 96) % 64) - 32;
export const distanceSquared = (a: Vec2, b: Vec2): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export function isqrt(n: number): number {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error("isqrt requires a nonnegative safe integer");
  let low = 0, high = Math.min(n, 94906265), answer = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (middle * middle <= n) { answer = middle; low = middle + 1; } else high = middle - 1;
  }
  return answer;
}
export function headingOf(vector: Vec2): number {
  let best = 0, score = -Infinity;
  for (let i = 0; i < 64; i++) {
    const d = DIRECTIONS[i]!;
    const dot = d.x * vector.x + d.y * vector.y;
    if (dot > score) { best = i; score = dot; }
  }
  return best;
}
export function rotate(point: Vec2, heading: number): Vec2 {
  const d = DIRECTIONS[(heading + 64) % 64]!;
  return { x: div(point.x * d.x - point.y * d.y, 1000), y: div(point.x * d.y + point.y * d.x, 1000) };
}

export type Polygon = readonly Vec2[];
/** Integer monotone chain for the swept hull of a triangle's two poses. */
export function convexHull(points: Polygon): Vec2[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (a: Vec2, b: Vec2, c: Vec2) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const half = (input: Vec2[]) => {
    const result: Vec2[] = [];
    for (const p of input) {
      while (result.length >= 2 && cross(result[result.length-2]!, result[result.length-1]!, p) <= 0) result.pop();
      result.push(p);
    }
    return result.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}
export type Bounds = { minX: number; maxX: number; minY: number; maxY: number };
export function bounds(points: Polygon): Bounds {
  return { minX: Math.min(...points.map(p => p.x)), maxX: Math.max(...points.map(p => p.x)), minY: Math.min(...points.map(p => p.y)), maxY: Math.max(...points.map(p => p.y)) };
}
export function boundsOverlap(a: Bounds, b: Bounds, skin = 0): boolean {
  return a.maxX + skin >= b.minX && b.maxX + skin >= a.minX && a.maxY + skin >= b.minY && b.maxY + skin >= a.minY;
}
/** Convex SAT, with an integer normal from A to B and penetration in world units. */
export function contact(a: Polygon, b: Polygon, skin = 0): { normal: Vec2; depth: number } | null {
  if (!boundsOverlap(bounds(a), bounds(b), skin)) return null;
  let depth = Infinity;
  let normal = { x: 0, y: 0 };
  for (const polygon of [a, b]) for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]!, q = polygon[(i + 1) % polygon.length]!;
    const axis = { x: p.y - q.y, y: q.x - p.x };
    const length = isqrt(axis.x * axis.x + axis.y * axis.y);
    if (!length) continue;
    let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
    for (const v of a) { const n = v.x * axis.x + v.y * axis.y; minA = Math.min(minA, n); maxA = Math.max(maxA, n); }
    for (const v of b) { const n = v.x * axis.x + v.y * axis.y; minB = Math.min(minB, n); maxB = Math.max(maxB, n); }
    const overlap = Math.min(maxA - minB, maxB - minA);
    if (overlap < -skin * length) return null;
    const candidate = Math.max(0, Math.ceil(overlap / length));
    if (candidate < depth) {
      const sign = minA + maxA <= minB + maxB ? 1 : -1;
      normal = { x: div(axis.x * 1000 * sign, length), y: div(axis.y * 1000 * sign, length) };
      depth = candidate;
    }
  }
  return { normal, depth };
}
