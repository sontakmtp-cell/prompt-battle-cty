import type { Vec2 } from "@prompt-chien/contracts";
import type { ProjectedFrame, ProjectedTriangle, ViewerInput } from "./types.js";
import { projectViewer } from "./view.js";

const ARENA = 40000;

export function drawViewer(canvas: HTMLCanvasElement, input: ViewerInput): ProjectedFrame {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0B0F17";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const model = projectViewer(input);
  if (input.organic) for (const back of [6, 4, 2]) {
    const tick = input.previous.tick - back;
    const frame = input.frames[tick];
    if (!frame || frame.tick !== tick) continue;
    const moved = poseDistance(input.previous, frame);
    if (moved < 160) continue;
    const trail = projectViewer({ ...input, previous: frame, next: frame, alpha: 0, organic: false, events: [], showDamage: false });
    paint(ctx, canvas, trail, 0.07, false);
  }
  paint(ctx, canvas, model, 1, true);
  if (input.showDamage) paintLegend(ctx, canvas.width, canvas.height);
  return model;
}

function poseDistance(current: ViewerInput["previous"], previous: ViewerInput["previous"]): number {
  let furthest = 0;
  for (const team of ["A", "B"] as const) {
    const a = current.bots[team].position, b = previous.bots[team].position;
    furthest = Math.max(furthest, Math.hypot(a.x - b.x, a.y - b.y));
  }
  return furthest;
}

function paint(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, model: ProjectedFrame, opacity: number, detail: boolean): void {
  const scale = camera(ctx, canvas);
  const pixel = 1 / scale;
  ctx.globalAlpha = opacity;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (detail) {
    ctx.save();
    ctx.strokeStyle = "rgba(56, 189, 248, 0.06)";
    ctx.lineWidth = 1 * pixel;
    const step = 4000;
    ctx.beginPath();
    for (let x = step; x < ARENA; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, ARENA);
    }
    for (let y = step; y < ARENA; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(ARENA, y);
    }
    ctx.stroke();

    const cx = ARENA / 2, cy = ARENA / 2;
    ctx.strokeStyle = "rgba(56, 189, 248, 0.16)";
    ctx.lineWidth = 1.6 * pixel;
    ctx.beginPath();
    ctx.moveTo(cx - 800, cy); ctx.lineTo(cx + 800, cy);
    ctx.moveTo(cx, cy - 800); ctx.lineTo(cx, cy + 800);
    ctx.stroke();
    ctx.restore();
  }
  if (detail && model.ring && model.ring.alpha > 0) {
    ctx.save();
    ctx.globalAlpha = opacity * model.ring.alpha;
    ctx.strokeStyle = "#F43F5E";
    ctx.lineWidth = 2.4 * pixel;
    ctx.setLineDash([180, 140]);
    ctx.beginPath();
    ctx.arc(ARENA / 2, ARENA / 2, model.ring.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  for (const ghost of model.ghosts) {
    ctx.globalAlpha = opacity * ghost.alpha;
    trace(ctx, ghost.world);
    ctx.fillStyle = ghost.fill;
    ctx.fill();
  }
  ctx.globalAlpha = opacity;
  for (const triangle of model.triangles) {
    trace(ctx, expand(triangle.world, triangle.center, 70));
    ctx.fillStyle = "#020617";
    ctx.fill();
  }
  for (const triangle of model.triangles) {
    trace(ctx, triangle.world);
    ctx.save();
    if (triangle.type === "paper") ctx.globalAlpha = opacity * 0.72;
    ctx.fillStyle = triangle.fill;
    ctx.fill();
    if (triangle.type === "paper") dots(ctx, triangle, pixel);
    ctx.restore();
    ctx.strokeStyle = triangle.stroke;
    ctx.lineWidth = (triangle.thick ? 2.6 : 1.15) * pixel;
    ctx.setLineDash(triangle.dashed ? [90, 70] : []);
    ctx.stroke();
    ctx.setLineDash([]);
    if (detail && triangle.crack && triangle.world[0]) {
      ctx.strokeStyle = "rgba(255,255,255,0.75)";
      ctx.lineWidth = 1.4 * pixel;
      ctx.beginPath();
      ctx.moveTo(triangle.center.x, triangle.center.y);
      ctx.lineTo(triangle.world[0].x, triangle.world[0].y);
      ctx.stroke();
    }
  }
  if (!detail) { ctx.globalAlpha = 1; return; }
  for (const badge of model.badges) {
    const radius = 340 * badge.pulse;
    ctx.strokeStyle = badge.team === "A" ? "#F43F5E" : "#38BDF8";
    ctx.lineWidth = 2.4 * pixel;
    ctx.setLineDash([]);
    for (const [start, end] of badge.arcs) {
      ctx.beginPath();
      ctx.arc(badge.x, badge.y, radius, start, end);
      ctx.stroke();
    }
    ctx.strokeStyle = badge.hpRatio < 0.3 ? "#EF4444" : (badge.team === "A" ? "rgba(244, 63, 94, 0.7)" : "rgba(56, 189, 248, 0.7)");
    ctx.lineWidth = 3 * pixel;
    ctx.beginPath();
    ctx.arc(badge.x, badge.y, radius + 70, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * badge.hpRatio);
    ctx.stroke();
  }
  for (const spark of model.sparks) {
    ctx.globalAlpha = opacity * spark.alpha;
    ctx.fillStyle = spark.color;
    ctx.beginPath();
    ctx.arc(spark.x, spark.y, spark.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function paintLegend(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const colors = ["#0F172A", "#FAC775", "#EF9F27", "#D85A30", "#A32D2D"];
  const x = 16, y = height - 28;
  colors.forEach((color, index) => {
    ctx.fillStyle = color;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 1;
    ctx.fillRect(x + index * 22, y, 20, 12);
    ctx.strokeRect(x + index * 22, y, 20, 12);
  });
}

function camera(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): number {
  const pad = 36;
  const scale = Math.min((canvas.width - pad * 2) / ARENA, (canvas.height - pad * 2) / ARENA);
  const originX = (canvas.width - ARENA * scale) / 2;
  const originY = (canvas.height + ARENA * scale) / 2;
  ctx.setTransform(scale, 0, 0, -scale, originX, originY);
  return scale;
}

function trace(ctx: CanvasRenderingContext2D, points: readonly Vec2[]): void {
  const first = points[0];
  if (!first) return;
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.closePath();
}

function expand(points: readonly Vec2[], center: Vec2, amount: number): Vec2[] {
  return points.map(point => {
    const dx = point.x - center.x, dy = point.y - center.y;
    const length = Math.hypot(dx, dy) || 1;
    return { x: point.x + dx / length * amount, y: point.y + dy / length * amount };
  });
}

function dots(ctx: CanvasRenderingContext2D, triangle: ProjectedTriangle, pixel: number): void {
  ctx.clip();
  ctx.fillStyle = triangle.stroke;
  const step = 180;
  const xs = triangle.world.map(point => point.x), ys = triangle.world.map(point => point.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  for (let y = minY; y <= maxY; y += step) for (let x = minX; x <= maxX; x += step) {
    ctx.beginPath();
    ctx.arc(x, y, 18 + pixel, 0, Math.PI * 2);
    ctx.fill();
  }
}
