import { RULESET } from "@prompt-chien/contracts";
import type { BotDefinition, Issue, Triangle, Vec2 } from "@prompt-chien/contracts";
import { bounds, div, rotate } from "./math.js";
export * from "./math.js";

export type GeometryInput = BotDefinition["body"];
export type LocalTriangle = Triangle & { vertices: Vec2[]; center: Vec2; neighbors: number[] };
export type GeometryAnalysis = {
  ok: boolean; issues: Issue[]; warnings: Issue[];
  neighbors: Record<string, string[]>; bounds: { width: number; height: number };
  coreId: string; triangles: LocalTriangle[];
};

/** Input must first pass BotDefinition schema validation. */
export function analyzeGeometry(body: GeometryInput): GeometryAnalysis {
  const issues: Issue[] = [], warnings: Issue[] = [];
  const fail = (code: string, message: string) => issues.push({ code, path: "/body/triangles", message });
  const result: GeometryAnalysis = { ok: false, issues, warnings, neighbors: {}, bounds: { width: 0, height: 0 }, coreId: "", triangles: [] };
  if (!body.triangles.length || body.triangles.length > RULESET.geometry.maxTriangles) { fail("GEOMETRY_BUDGET", "Body must contain 1..60 triangles."); return result; }
  const cells = new Map<string, number>(), ids = new Set<string>();
  const sorted = [...body.triangles].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const first = sorted[0]!;
  const key = (q: number, r: number, orientation: string) => `${q},${r},${orientation}`;
  const grid = (q: number, r: number): Vec2 => ({ x: (q - first.q) * 1000 + (r - first.r) * RULESET.geometry.halfEdge, y: (r - first.r) * RULESET.geometry.rowHeight });
  let cores = 0, motors = 0;
  for (const [index, triangle] of sorted.entries()) {
    const cell = key(triangle.q, triangle.r, triangle.orientation);
    if (cells.has(cell)) fail("DUPLICATE_CELL", `Duplicate cell: ${cell}`);
    if (ids.has(triangle.id)) fail("DUPLICATE_ID", `Duplicate triangle id: ${triangle.id}`);
    cells.set(cell, index); ids.add(triangle.id);
    if (triangle.core) { cores++; result.coreId = triangle.id; if (triangle.type === ("motor" as string)) fail("CORE_ON_MOTOR", "Core must be on combat."); }
    if (triangle.type === "motor") motors++;
    const { q, r } = triangle;
    const vertices = triangle.orientation === "up" ? [grid(q, r), grid(q + 1, r), grid(q, r + 1)] : [grid(q + 1, r), grid(q + 1, r + 1), grid(q, r + 1)];
    result.triangles.push({ ...triangle, vertices, center: { x: div(vertices.reduce((sum, p) => sum + p.x, 0), 3), y: div(vertices.reduce((sum, p) => sum + p.y, 0), 3) }, neighbors: [] });
  }
  if (cores !== 1) fail("CORE_COUNT", "Exactly one Core is required.");
  if (!motors) fail("NO_MOTOR", "At least one Motor is required.");
  const box = bounds(result.triangles.flatMap(t => t.vertices));
  result.bounds = { width: box.maxX - box.minX, height: box.maxY - box.minY };
  if (result.bounds.width > RULESET.geometry.maxWidth || result.bounds.height > RULESET.geometry.maxHeight) fail("BODY_TOO_LARGE", "Body exceeds 12 x 12 units.");
  if (issues.length) return result;
  const origin = { x: div(result.triangles.reduce((sum, t) => sum + t.center.x, 0), sorted.length), y: div(result.triangles.reduce((sum, t) => sum + t.center.y, 0), sorted.length) };
  for (const triangle of result.triangles) {
    const { q, r, orientation } = triangle;
    const adjacent: [number, number, string][] = orientation === "up" ? [[q,r,"down"], [q-1,r,"down"], [q,r-1,"down"]] : [[q,r,"up"], [q+1,r,"up"], [q,r+1,"up"]];
    triangle.neighbors = adjacent.map(([a,b,o]) => cells.get(key(a,b,o))).filter((n): n is number => n !== undefined);
    result.neighbors[triangle.id] = triangle.neighbors.map(n => sorted[n]!.id);
    triangle.vertices = triangle.vertices.map(p => ({ x: p.x - origin.x, y: p.y - origin.y }));
    triangle.center = { x: triangle.center.x - origin.x, y: triangle.center.y - origin.y };
  }
  const connected = new Set<number>(), queue = [sorted.findIndex(t => t.core)];
  while (queue.length) {
    const i = queue.pop()!;
    if (connected.has(i)) continue;
    connected.add(i); queue.push(...result.triangles[i]!.neighbors);
  }
  if (connected.size !== sorted.length) fail("DISCONNECTED", "All triangles must connect to Core through edges, not corners.");
  const combat = sorted.length - motors;
  const warn = (code: string, message: string) => warnings.push({ code, path: "/body/triangles", message });
  if (combat < 5) warn("LOW_COMBAT", "Fewer than five combat triangles.");
  if (sorted.length > motors * RULESET.motor.pullPerMotor) warn("OVERLOADED", "Motor load exceeds 100%.");
  for (const type of ["hammer", "scissor", "paper"]) {
    const ratio = div(sorted.filter(t => t.type === type).length * 1000, combat);
    if (ratio > RULESET.monoculture.warnAbove) warn("MONOCULTURE", `${type} exceeds 65% of combat triangles.`);
    if (RULESET.monoculture.blockEnabled && ratio > RULESET.monoculture.blockAbove) fail("MONOCULTURE_BLOCK", `${type} exceeds the hard limit.`);
  }
  result.ok = !issues.length;
  return result;
}

/** Local +Y is the nose; heading 0 points it along world +X. */
export function worldPoint(point: Vec2, position: Vec2, heading: number): Vec2 {
  const rotated = rotate(point, (heading + 48) % 64);
  return { x: rotated.x + position.x, y: rotated.y + position.y };
}
