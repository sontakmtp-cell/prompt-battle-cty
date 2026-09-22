import { RULESET } from "@prompt-chien/contracts";
import type { ReplayCheckpoint, ReplayData, ReplayFrame, Team, TriType, Vec2, VfxEvent } from "@prompt-chien/contracts";
import { displayDirection } from "./directions.js";
import { TEAM_FILL, TEAM_INK, badgeArcs, heatFill, mixHex } from "./palette.js";
import type { DisplayTriangle, ProjectedBadge, ProjectedFrame, ProjectedGhost, ProjectedSpark, ProjectedTriangle, ViewerInput } from "./types.js";

const TEAMS = ["A", "B"] as const;

export function viewRingRadius(tick: number): number {
  const span = RULESET.match.maxTicks - RULESET.ring.startTick;
  const elapsed = Math.max(0, Math.min(tick - RULESET.ring.startTick, span));
  return RULESET.ring.startRadius - Math.trunc((RULESET.ring.startRadius - RULESET.ring.endRadius) * elapsed / span);
}

/** Display seek. Same steps as the simulation seek; tests/m2 compares the two. */
export function viewCheckpoint(replay: ReplayData, tick: number): ReplayCheckpoint {
  if (!Number.isInteger(tick) || tick < 0 || tick > replay.manifest.totalTicks) throw new Error("Seek tick out of range");
  const checkpoint = replay.checkpoints.findLast(item => item.tick <= tick);
  if (!checkpoint) throw new Error("Replay has no initial checkpoint");
  const snapshot = JSON.parse(JSON.stringify(checkpoint)) as ReplayCheckpoint;
  for (let current = checkpoint.tick + 1; current <= tick; current++) {
    const frame = replay.frames[current];
    if (!frame || frame.tick !== current) throw new Error(`Missing replay tick ${current}`);
    for (const team of TEAMS) {
      const source = frame.bots[team], target = snapshot.bots[team];
      target.position = { ...source.position };
      target.heading = source.heading;
      target.loadFactor = source.loadFactor;
      for (const changed of source.changes) {
        const index = target.triangles.findIndex(item => item.id === changed.id);
        if (index < 0) throw new Error(`Unknown triangle in replay: ${changed.id}`);
        target.triangles[index] = { ...changed };
      }
    }
  }
  snapshot.tick = tick;
  return snapshot;
}

export function captionEvent(event: VfxEvent): string {
  switch (event.kind) {
    case "hit": return `Nhịp ${event.tick}: cú đánh ${event.damage} máu, ${event.advantage === "adv" ? "lợi thế" : event.advantage === "disadv" ? "bất lợi" : "ngang sức"}`;
    case "destroy": return `Nhịp ${event.tick}: ${event.team} mất một ${label(event.type)}`;
    case "detach": return `Nhịp ${event.tick}: ${event.team} đứt ${event.tris.length} mảnh`;
    case "motorLost": return `Nhịp ${event.tick}: ${event.team} mất cụm Motor phía ${event.side === "left" ? "trái" : event.side === "right" ? "phải" : "giữa"}`;
    case "overload": return `Nhịp ${event.tick}: ${event.team} quá tải`;
    case "coreHit": return `Nhịp ${event.tick}: lõi ${event.team} còn ${Math.round(event.hpRatio / 10)}% máu`;
    case "coreDestroyed": return `Nhịp ${event.tick}: lõi ${event.team} vỡ`;
    case "ringStart": return `Nhịp ${event.tick}: vòng sân bắt đầu thu`;
    case "ringEnter": return `Nhịp ${event.tick}: lõi ${event.team} ra ngoài vòng`;
    case "ringExit": return `Nhịp ${event.tick}: lõi ${event.team} quay vào vòng`;
    case "matchEnd": return `Nhịp ${event.tick}: kết thúc, ${event.winner === "draw" ? "hòa" : `${event.winner} thắng`} (${event.reason})`;
    default: return "";
  }
}

function label(type: TriType): string {
  if (type === "hammer") return "Búa";
  if (type === "scissor") return "Kéo";
  if (type === "paper") return "Bao";
  return "Motor";
}

function mix32(seed: number, tick: number, index: number, salt: number): number {
  let hash = seed >>> 0;
  hash = Math.imul(hash ^ tick, 0x9e3779b1);
  hash = Math.imul(hash ^ index, 0x85ebca6b);
  hash = Math.imul(hash ^ salt, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function lerpHeading(from: number, to: number, amount: number): number {
  const delta = (((to - from + 96) % 64) + 64) % 64 - 32;
  return from + delta * amount;
}

function poseAt(frame: ReplayFrame, team: Team): { x: number; y: number; heading: number; load: number } {
  const bot = frame.bots[team];
  return { x: bot.position.x, y: bot.position.y, heading: bot.heading, load: bot.loadFactor };
}

function mixPose(from: ReturnType<typeof poseAt>, to: ReturnType<typeof poseAt>, amount: number) {
  return {
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
    heading: lerpHeading(from.heading, to.heading, amount),
    load: from.load + (to.load - from.load) * amount,
  };
}

function frameAt(frames: readonly ReplayFrame[], tick: number): ReplayFrame | null {
  if (tick < 0) return null;
  const direct = frames[tick];
  if (direct?.tick === tick) return direct;
  return frames.find(frame => frame.tick === tick) ?? null;
}

function localId(value: string): string {
  const split = value.indexOf(":");
  return split < 0 ? value : value.slice(split + 1);
}

function rotateToWorld(point: Vec2, heading: number, origin: Vec2): Vec2 {
  const direction = displayDirection((((heading + 48) % 64) + 64) % 64);
  const x = point.x * direction.x - point.y * direction.y;
  const y = point.x * direction.y + point.y * direction.x;
  const rotated = Number.isInteger(heading) ? { x: Math.trunc(x / 1000), y: Math.trunc(y / 1000) } : { x: x / 1000, y: y / 1000 };
  return { x: rotated.x + origin.x, y: rotated.y + origin.y };
}

function keyOf(point: Vec2): string {
  return `${point.x},${point.y}`;
}

function rimVertices(body: readonly DisplayTriangle[], alive: ReadonlySet<string>): Set<string> {
  const uses = new Map<string, number>();
  const edge = (a: Vec2, b: Vec2) => {
    const key = [keyOf(a), keyOf(b)].sort().join("|");
    uses.set(key, (uses.get(key) ?? 0) + 1);
  };
  for (const triangle of body) if (alive.has(triangle.id) && triangle.vertices.length === 3) {
    const [a, b, c] = triangle.vertices as [Vec2, Vec2, Vec2];
    edge(a, b); edge(b, c); edge(c, a);
  }
  const rim = new Set<string>();
  for (const [key, count] of uses) if (count === 1) for (const end of key.split("|")) rim.add(end);
  return rim;
}

export function projectViewer(input: ViewerInput): ProjectedFrame {
  const tick = input.previous.tick;
  const alpha = Math.max(0, Math.min(1, input.alpha));
  const time = (tick + alpha) / RULESET.match.tickRate;
  const damages = TEAMS.flatMap(team => input.checkpoint.bots[team].triangles.map(item => item.damageReceived));
  const maxDamage = Math.max(0, ...damages);
  const triangles: ProjectedTriangle[] = [];
  const badges: ProjectedBadge[] = [];
  const hud = {} as ProjectedFrame["hud"];

  for (const team of TEAMS) {
    const from = poseAt(input.previous, team);
    const to = poseAt(input.next, team);
    let pose = mixPose(from, to, input.next.tick === tick ? 0 : alpha);
    if (input.organic) {
      const past = frameAt(input.frames, tick - 4);
      if (past) pose = mixPose(poseAt(past, team), pose, 0.78);
    }
    const snap = new Map(input.checkpoint.bots[team].triangles.map(item => [item.id, item]));
    const body = input.bodies[team];
    const alive = new Set(body.filter(item => snap.get(item.id)?.alive !== false).map(item => item.id));
    const aliveCombat = body.filter(item => item.type !== "motor" && alive.has(item.id)).length;
    const totalCombat = body.filter(item => item.type !== "motor").length;
    const posture = pose.load > 2000 ? { scaleY: 0.9, drop: -180, breathHz: 0.28 }
      : pose.load > 1500 ? { scaleY: 0.94, drop: -110, breathHz: 0.4 }
      : pose.load > 1000 ? { scaleY: 0.98, drop: -40, breathHz: 0.55 }
      : { scaleY: 1, drop: 0, breathHz: 0.62 };
    const frantic = aliveCombat === 1 || (totalCombat > 0 && aliveCombat / totalCombat < 0.5);
    const tilt = input.organic ? motorTilt(body, alive) : 0;
    const heading = pose.heading + tilt;
    const placed = body.flatMap(triangle => {
      const state = snap.get(triangle.id);
      if (!state?.alive || triangle.vertices.length !== 3) return [];
      const local = triangle.vertices.map(point => deform(point, posture, time, input.organic));
      const world = local.map(point => rotateToWorld(point, heading, pose));
      const center = average(world);
      return [{ triangle, state, world, center, local: triangle.vertices }];
    });
    const centroid = average(placed.map(item => item.center));
    const squash = input.organic ? hitSquash(input.events, team, tick + alpha) : null;
    const rim = rimVertices(body, alive);
    const moved = new Map<string, Vec2>();
    for (const item of placed) for (let index = 0; index < item.world.length; index++) {
      const local = item.local[index];
      const current = item.world[index];
      if (!local || !current) continue;
      const id = keyOf(local);
      if (moved.has(id)) continue;
      let point = squash ? squashPoint(current, centroid, squash) : current;
      if (input.organic) {
        const amp = (rim.has(id) ? 30 : 8) * (pose.load > 2000 ? 0.25 : 1) * (frantic ? 2.2 : 1);
        const freq = frantic ? 3.4 : posture.breathHz > 0.5 ? 1.2 : 0.8;
        const phase = mix32(input.seed, 0, hashText(id), 3) / 4294967296 * Math.PI * 2;
        const offset = amp * Math.sin(time * freq * Math.PI * 2 + phase);
        const dx = point.x - centroid.x, dy = point.y - centroid.y;
        const length = Math.hypot(dx, dy) || 1;
        point = { x: point.x + dx / length * offset, y: point.y + dy / length * offset };
      }
      moved.set(id, point);
    }
    let aliveCount = 0, coreHp = 0, coreMax = 0;
    for (const item of placed) {
      const world = item.local.map(point => moved.get(keyOf(point)) ?? item.center);
      const center = average(world);
      const hpRatio = item.state.maxHp ? item.state.hp / item.state.maxHp : 0;
      const pale = hpRatio > 0.6 ? 0 : hpRatio > 0.4 ? 0.15 : hpRatio > 0.15 ? 0.32 : 0.55;
      const heat = maxDamage ? item.state.damageReceived / maxDamage : 0;
      const base = mixHex(TEAM_FILL[team][item.triangle.type], "#ffffff", pale);
      triangles.push({
        team, id: item.triangle.id, type: item.triangle.type, core: item.triangle.core,
        world, center, hpRatio, heat, fill: input.showDamage ? heatFill(base, heat) : base,
        stroke: TEAM_INK[team], thick: item.triangle.type === "hammer", dashed: item.triangle.type === "motor",
        crack: hpRatio > 0 && hpRatio < 0.4,
      });
      aliveCount += 1;
      if (item.triangle.core) {
        coreHp = item.state.hp; coreMax = item.state.maxHp;
        const pulse = 1 + 0.045 * Math.sin(time * (hpRatio < 0.3 ? 8 : 3.2));
        badges.push({ team, x: center.x, y: center.y, hpRatio, pulse: input.organic ? pulse : 1, arcs: badgeArcs(team) });
      }
    }
    hud[team] = { alive: aliveCount, total: body.length, coreHp, coreMax, load: pose.load };
  }

  return {
    triangles, badges, hud, ghosts: ghosts(input, tick + alpha), sparks: sparks(input, tick + alpha),
    ring: ring(tick, alpha), hottest: hottest(input),
  };
}

function deform(point: Vec2, posture: { scaleY: number; drop: number; breathHz: number }, time: number, organic: boolean): Vec2 {
  if (!organic) return point;
  const breath = 1 + 0.015 * Math.sin(time * posture.breathHz * Math.PI * 2);
  return { x: point.x * breath, y: point.y * breath * posture.scaleY + posture.drop };
}

function motorTilt(body: readonly DisplayTriangle[], alive: ReadonlySet<string>): number {
  const motors = body.filter(item => item.type === "motor");
  const living = motors.filter(item => alive.has(item.id));
  if (motors.length < 2 || !living.length || living.length === motors.length) return 0;
  const mean = (list: DisplayTriangle[]) => list.reduce((sum, item) => sum + item.center.x, 0) / list.length;
  return Math.max(-2, Math.min(2, (mean(living) - mean(motors)) / 1500));
}

function hitSquash(events: readonly VfxEvent[], team: Team, now: number): { nx: number; ny: number; scale: number } | null {
  let best: { nx: number; ny: number; scale: number; age: number } | null = null;
  for (const event of events) if (event.kind === "hit" && event.defender.startsWith(`${team}:`)) {
    const age = now - event.tick;
    if (age < 0 || age > 8) continue;
    const length = Math.hypot(event.normal.x, event.normal.y) || 1;
    const compress = 1 + 0.3 * (event.impactMul - 850) / 150;
    const scale = 1 - 0.18 * ((compress - 1) / 0.3) * (1 - age / 8);
    if (!best || age < best.age) best = { nx: event.normal.x / length, ny: event.normal.y / length, scale, age };
  }
  return best ? { nx: best.nx, ny: best.ny, scale: best.scale } : null;
}

function squashPoint(point: Vec2, centroid: Vec2, squash: { nx: number; ny: number; scale: number }): Vec2 {
  const dx = point.x - centroid.x, dy = point.y - centroid.y;
  const along = squash.nx * dx + squash.ny * dy;
  const px = -squash.ny, py = squash.nx;
  const across = px * dx + py * dy;
  const bulge = 1 + (1 - squash.scale) * 0.65;
  return {
    x: centroid.x + squash.nx * along * squash.scale + px * across * bulge,
    y: centroid.y + squash.ny * along * squash.scale + py * across * bulge,
  };
}

function average(points: readonly Vec2[]): Vec2 {
  if (!points.length) return { x: 0, y: 0 };
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function hashText(value: string): number {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function ghosts(input: ViewerInput, now: number): ProjectedGhost[] {
  const result: ProjectedGhost[] = [];
  for (const event of input.events) {
    if (event.kind !== "destroy" && event.kind !== "detach") continue;
    const life = event.kind === "destroy" ? 12 : 27;
    const age = now - event.tick;
    if (age < 0 || age > life) continue;
    const frame = frameAt(input.frames, event.tick);
    if (!frame) continue;
    const ids = event.kind === "destroy" ? [localId(event.tri)] : event.tris.map(localId);
    const team = event.team;
    const pose = poseAt(frame, team);
    for (const id of ids) {
      const triangle = input.bodies[team].find(item => item.id === id);
      if (!triangle) continue;
      const world = triangle.vertices.map(point => rotateToWorld(point, pose.heading, pose));
      const fill = event.kind === "destroy" && age < 2 ? "#ffffff" : event.kind === "detach" ? "#c5c8ce" : mixHex(TEAM_FILL[team][triangle.type], "#ffffff", 0.55);
      result.push({ world, fill, alpha: 1 - age / life });
    }
  }
  return result;
}

function sparks(input: ViewerInput, now: number): ProjectedSpark[] {
  if (!input.organic) return [];
  const result: ProjectedSpark[] = [];
  for (const event of input.events) if (event.kind === "hit") {
    const age = now - event.tick;
    if (age < 0 || age > 10) continue;
    const count = event.advantage === "adv" ? 8 : event.advantage === "neutral" ? 3 : 2;
    const length = Math.hypot(event.normal.x, event.normal.y) || 1;
    const nx = event.normal.x / length, ny = event.normal.y / length;
    const spread = 1.35 - (event.orientMul - 850) / 150 * 0.9;
    const team = event.attacker.startsWith("B:") ? "B" : "A";
    const color = event.advantage === "disadv" ? "#d9d3cb" : event.advantage === "neutral" ? "#f4f1ea" : TEAM_FILL[team].hammer;
    for (let index = 0; index < count; index++) {
      const roll = mix32(input.seed, event.tick, index, 9);
      const along = (0.35 + (roll % 100) / 100) * (1 + age) * 90;
      const side = (((roll >>> 8) % 100) / 100 - 0.5) * spread * (40 + age * 28);
      result.push({
        x: event.at.x + nx * along - ny * side, y: event.at.y + ny * along + nx * side,
        radius: 40 + (roll % 50), color, alpha: 1 - age / 10,
      });
    }
  }
  return result;
}

function ring(tick: number, alpha: number): { radius: number; alpha: number } | null {
  const announce = RULESET.ring.startTick - RULESET.ring.announceTicks;
  const now = tick + alpha;
  if (now < announce) return null;
  const fade = tick >= RULESET.ring.startTick ? 1 : (now - announce) / RULESET.ring.announceTicks;
  const next = viewRingRadius(tick + 1);
  const current = viewRingRadius(tick);
  return { radius: current + (next - current) * alpha, alpha: Math.max(0, Math.min(1, fade)) };
}

function hottest(input: ViewerInput): ProjectedFrame["hottest"] {
  const rows = TEAMS.flatMap(team => input.checkpoint.bots[team].triangles.map(item => ({ team, id: item.id, damage: item.damageReceived })));
  return rows.filter(item => item.damage > 0).sort((a, b) => b.damage - a.damage).slice(0, 3);
}
