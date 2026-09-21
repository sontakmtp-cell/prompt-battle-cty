import { RULESET, VERSIONS, freezeData, hashJson } from "@prompt-chien/contracts";
import type { BotDefinition, BotPackage, BrainAction, MatchResult, Pose, ReplayCheckpoint, ReplayFrame, Sensor, Team, TriangleSnapshot, TriType, Vec2, VfxEvent } from "@prompt-chien/contracts";
import { checkSchema } from "@prompt-chien/contracts/validation";
import { initialMemory, tickBrain, validateBrain } from "../brain/index.js";
import type { BrainMemory } from "../brain/index.js";
import { analyzeGeometry, angleDelta, bounds, boundsOverlap, clamp, contact, convexHull, DIRECTIONS, distanceSquared, div, headingOf, isqrt, rotate, worldPoint } from "../geometry/index.js";
import type { LocalTriangle } from "../geometry/index.js";

export const TICK_PHASES = Object.freeze([
  "sense", "think", "intent", "moveRotate", "collision", "damage", "structure", "winCheck", "eventLog",
] as const);

export type MatchInput = { packages: Record<Team, BotPackage>; seed: number };
export type TickOutput = { events: VfxEvent[]; result: MatchResult | null };
export type LiveTriangle = LocalTriangle & TriangleSnapshot & { lastHit: number };
export type Mobility = { load: number; speed: number; forward: number; reverse: number; left: number; right: number; drift: number };
export type LiveBot = {
  team: Team; package: BotPackage; triangles: LiveTriangle[]; core: number;
  position: Vec2; velocity: Vec2; heading: number; memory: BrainMemory;
  initialLoad: number; initialMotors: number; initialCombat: number; initialCoreHp: number;
  mobility: Mobility; turnCarry: number; moveCarry: Vec2; incapTicks: number; ringCarry: number; outside: boolean;
  damageDealt: number; speedSum: number; hitCount: number; impactSum: number;
  rotations: Vec2[][][];
};
export type MatchState = { tick: number; seed: number; bots: Record<Team, LiveBot>; result: MatchResult | null };
export type Simulation = { frames: ReplayFrame[]; checkpoints: ReplayCheckpoint[]; events: VfxEvent[]; result: MatchResult; stats: Record<Team, { damageDealt: number; meanSpeed: number; hitCount: number; meanImpactRatio: number }> };
const TEAMS: readonly Team[] = ["A", "B"];
const other = (team: Team): Team => team === "A" ? "B" : "A";
const ratio = (n: number, d: number) => d > 0 ? clamp(div(n * 1000, d), 0, 1000) : 0;
const alive = (bot: LiveBot) => bot.triangles.filter(t => t.alive);
const core = (bot: LiveBot) => bot.triangles[bot.core]!;

export async function packBot(input: unknown): Promise<BotPackage> {
  const checked = checkSchema("BotDefinition", input);
  if (!checked.ok) throw new Error(`Bot schema: ${JSON.stringify(checked.issues)}`);
  const geometry = analyzeGeometry(checked.value.body), brain = validateBrain(checked.value.brain);
  if (!geometry.ok || !brain.ok) throw new Error(`Bot invalid: ${JSON.stringify([...geometry.issues, ...brain.issues])}`);
  const definition = JSON.parse(JSON.stringify(checked.value)) as BotDefinition;
  const versions = { ...VERSIONS };
  return freezeData({ definition, versions, packageHash: await hashJson({ versions, definition }) });
}

export async function verifyPackage(input: unknown): Promise<BotPackage> {
  const checked = checkSchema("BotPackage", input);
  if (!checked.ok) throw new Error(`Package schema: ${JSON.stringify(checked.issues)}`);
  const candidate = JSON.parse(JSON.stringify(checked.value)) as BotPackage;
  for (const version of ["engine", "ruleset", "botSchema", "brainApi", "replay"] as const) {
    if (candidate.versions[version] !== VERSIONS[version]) throw new Error(`Unsupported ${version}: ${candidate.versions[version]}`);
  }
  const geometry = analyzeGeometry(candidate.definition.body), brain = validateBrain(candidate.definition.brain);
  if (!geometry.ok || !brain.ok) throw new Error("Package contains invalid geometry or Brain");
  if (await hashJson({ versions: candidate.versions, definition: candidate.definition }) !== candidate.packageHash) throw new Error("Package hash mismatch");
  return freezeData(candidate);
}

export function loadSpeed(load: number): number {
  for (const [i, band] of RULESET.motor.loadBands.entries()) if (load <= band.through) {
    if (i < 2) return band.speed;
    const previous = RULESET.motor.loadBands[i - 1]!;
    return previous.speed + div((load - previous.through) * (band.speed - previous.speed), band.through - previous.through);
  }
  return RULESET.motor.overloadSpeed;
}

export function mobility(bot: LiveBot): Mobility {
  const live = alive(bot), motors = live.filter(t => t.type === "motor");
  if (!motors.length) return { load: RULESET.motor.noMotorLoad, speed: 0, forward: 0, reverse: 0, left: 0, right: 0, drift: 0 };
  const load = Math.max(bot.initialLoad, Math.ceil(live.length * 1000 / (motors.length * RULESET.motor.pullPerMotor)));
  const speedFactor = loadSpeed(load);
  const forward = div(motors.reduce((sum, t) => sum + (t.center.y < 0 ? 1200 : 800), 0), motors.length);
  const reverse = 2000 - forward;
  const left = div(motors.reduce((sum, t) => sum + 1000 + div(Math.abs(t.center.x), 3) + clamp(div(t.center.x, 4), -500, 500), 0), bot.initialMotors);
  const right = div(motors.reduce((sum, t) => sum + 1000 + div(Math.abs(t.center.x), 3) - clamp(div(t.center.x, 4), -500, 500), 0), bot.initialMotors);
  const drift = clamp(div(motors.reduce((sum, t) => sum + t.center.x, 0), bot.initialMotors), -2000, 2000);
  return { load, speed: div(RULESET.movement.maxSpeed * speedFactor, 1000), forward, reverse,
    left: div(RULESET.movement.turnStepsPerSecond * left * speedFactor, 1000),
    right: div(RULESET.movement.turnStepsPerSecond * right * speedFactor, 1000), drift };
}

export function recomputeDiversity(bot: LiveBot, initial = false): void {
  for (const triangle of bot.triangles) if (triangle.alive) {
    const types = new Set([triangle, ...triangle.neighbors.map(i => bot.triangles[i]!)].filter(t => t.alive && t.type !== "motor").map(t => t.type));
    const bonus = RULESET.diversity.bonusPerType * Math.max(0, types.size - 1);
    triangle.maxHp = div(RULESET.triangles[triangle.type].hp * (1000 + bonus), 1000);
    triangle.hp = initial ? triangle.maxHp : Math.min(triangle.hp, triangle.maxHp);
  }
}

export async function createMatch(input: MatchInput): Promise<MatchState> {
  if (!Number.isInteger(input.seed) || input.seed < 0 || input.seed > 4294967295) throw new Error("Seed must be uint32");
  const packages = { A: await verifyPackage(input.packages.A), B: await verifyPackage(input.packages.B) };
  let seed = input.seed || 0x9e3779b9;
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
  const make = (team: Team): LiveBot => {
    const pkg = packages[team], geometry = analyzeGeometry(pkg.definition.body);
    const triangles = geometry.triangles.map(t => ({ ...t, hp: 1, maxHp: 1, alive: true, damageReceived: 0, lastHit: -RULESET.damage.hitCooldownTicks }));
    const motors = triangles.filter(t => t.type === "motor").length;
    const bot: LiveBot = {
      team, package: pkg, triangles, core: triangles.findIndex(t => t.core),
      position: { x: team === "A" ? 10000 : 30000, y: 18000 + random() % 4001 },
      velocity: { x: 0, y: 0 }, heading: (team === "A" ? 0 : 32), memory: initialMemory(pkg.definition.brain),
      initialLoad: Math.ceil(triangles.length * 1000 / (motors * RULESET.motor.pullPerMotor)), initialMotors: motors,
      initialCombat: triangles.length - motors, initialCoreHp: 0, mobility: {} as Mobility,
      turnCarry: 0, moveCarry: { x: 0, y: 0 }, incapTicks: 0, ringCarry: 0, outside: false,
      damageDealt: 0, speedSum: 0, hitCount: 0, impactSum: 0,
      rotations: Array.from({ length: 64 }, (_, heading) => triangles.map(t => t.vertices.map(p => rotate(p, (heading + 48) % 64)))),
    };
    recomputeDiversity(bot, true); bot.initialCoreHp = core(bot).maxHp; bot.mobility = mobility(bot);
    return bot;
  };
  return { tick: 0, seed: input.seed, bots: { A: make("A"), B: make("B") }, result: null };
}

export function ringRadius(tick: number): number {
  const elapsed = clamp(tick - RULESET.ring.startTick, 0, RULESET.match.maxTicks - RULESET.ring.startTick);
  return RULESET.ring.startRadius - div((RULESET.ring.startRadius - RULESET.ring.endRadius) * elapsed, RULESET.match.maxTicks - RULESET.ring.startTick);
}

export function sense(state: MatchState, team: Team): Record<Sensor, number> {
  const self = state.bots[team], enemy = state.bots[other(team)];
  const direction = { x: enemy.position.x - self.position.x, y: enemy.position.y - self.position.y };
  const selfLive = alive(self), enemyLive = alive(enemy);
  return {
    tick: state.tick, stateTicks: self.memory.stateTicks,
    "self.x": self.position.x, "self.y": self.position.y, "self.heading": self.heading,
    "self.coreHpRatio": ratio(core(self).hp, core(self).maxHp), "self.combatCount": selfLive.filter(t => t.type !== "motor").length,
    "self.motorCount": selfLive.filter(t => t.type === "motor").length, "self.loadFactor": self.mobility.load,
    "self.speed": isqrt(self.velocity.x ** 2 + self.velocity.y ** 2), "enemy.distance": isqrt(direction.x ** 2 + direction.y ** 2),
    "enemy.bearing": angleDelta(headingOf(direction), self.heading), "enemy.heading": enemy.heading,
    "enemy.coreHpRatio": ratio(core(enemy).hp, core(enemy).maxHp), "enemy.combatCount": enemyLive.filter(t => t.type !== "motor").length,
    "enemy.motorCount": enemyLive.filter(t => t.type === "motor").length,
    "ring.radius": ringRadius(state.tick), "self.outsideRing": self.outside ? 1 : 0,
  };
}

function moveIntent(bot: LiveBot, enemy: LiveBot, action: BrainAction): { position: Vec2; heading: number } {
  const toward = { x: enemy.position.x - bot.position.x, y: enemy.position.y - bot.position.y };
  const bearing = headingOf(toward), coincident = toward.x === 0 && toward.y === 0;
  const direction = { stop: bot.heading, forward: bot.heading, backward: bot.heading + 32, towardEnemy: bearing, awayFromEnemy: bearing + 32, orbitLeft: bearing + 16, orbitRight: bearing + 48 }[action.move.mode] % 64;
  const dependent = !["stop", "forward", "backward"].includes(action.move.mode);
  const power = action.move.mode === "stop" || (coincident && dependent) ? 0 : action.move.power;
  const d = DIRECTIONS[direction]!;
  const speed = div(bot.mobility.speed * power, 1000);
  const target = { x: div(d.x * speed, 1000), y: div(d.y * speed, 1000) };
  const force = action.move.mode === "backward" ? bot.mobility.reverse : bot.mobility.forward;
  const acceleration = div(RULESET.movement.acceleration * force, 1000 * RULESET.match.tickRate);
  for (const axis of ["x", "y"] as const) {
    bot.velocity[axis] = power ? bot.velocity[axis] + clamp(target[axis] - bot.velocity[axis], -acceleration, acceleration) : div(bot.velocity[axis] * RULESET.movement.drag, 1000);
  }
  const magnitude = isqrt(bot.velocity.x ** 2 + bot.velocity.y ** 2);
  if (magnitude > bot.mobility.speed) for (const axis of ["x", "y"] as const) bot.velocity[axis] = div(bot.velocity[axis] * bot.mobility.speed, magnitude);
  const position = { ...bot.position };
  for (const axis of ["x", "y"] as const) { bot.moveCarry[axis] += bot.velocity[axis]; position[axis] += div(bot.moveCarry[axis], RULESET.match.tickRate); bot.moveCarry[axis] %= RULESET.match.tickRate; }
  let turn = 0;
  if (action.turn.mode === "left") turn = 1;
  if (action.turn.mode === "right") turn = -1;
  if (!coincident && (action.turn.mode === "faceEnemy" || action.turn.mode === "faceAway")) turn = Math.sign(angleDelta((bearing + action.turn.offset + (action.turn.mode === "faceAway" ? 32 : 0) + 64) % 64, bot.heading));
  bot.turnCarry += div((turn > 0 ? bot.mobility.left : bot.mobility.right) * turn * action.turn.power, 1000) + (power ? bot.mobility.drift : 0);
  const step = clamp(div(bot.turnCarry, RULESET.match.tickRate * 1000), -1, 1);
  bot.turnCarry -= step * RULESET.match.tickRate * 1000;
  return { position, heading: (bot.heading + step + 64) % 64 };
}

function worldTriangles(bot: LiveBot, before?: Pose) {
  return bot.triangles.flatMap((triangle, index) => {
    if (!triangle.alive) return [];
    const vertices = bot.rotations[bot.heading]![index]!.map(p => ({ x: p.x + bot.position.x, y: p.y + bot.position.y }));
    const swept = before ? convexHull([...vertices, ...bot.rotations[before.heading]![index]!.map(p => ({ x: p.x + before.position.x, y: p.y + before.position.y }))]) : vertices;
    return [{ index, vertices, swept, bounds: bounds(swept), center: worldPoint(triangle.center, bot.position, bot.heading) }];
  });
}
type Collision = { a: number; b: number; normal: Vec2; depth: number; at: Vec2 };
export function contacts(a: LiveBot, b: LiveBot, before?: Record<Team, Pose>): Collision[] {
  const aa = worldTriangles(a, before?.A), bb = worldTriangles(b, before?.B);
  if (!aa.length || !bb.length || !boundsOverlap(bounds(aa.flatMap(t => t.swept)), bounds(bb.flatMap(t => t.swept)), RULESET.movement.contactSkin)) return [];
  const result: Collision[] = [];
  // ponytail: at most 60 x 60 AABB checks; use a spatial grid if measured match throughput requires it.
  for (const x of aa) for (const y of bb) if (boundsOverlap(x.bounds, y.bounds, RULESET.movement.contactSkin)) {
    const endpoint = contact(x.vertices, y.vertices, RULESET.movement.contactSkin);
    const swept = before && !endpoint ? contact(x.swept, y.swept) : null;
    const hit = endpoint ?? (swept && swept.depth > 0 ? swept : null);
    if (hit) result.push({ a: x.index, b: y.index, ...hit, at: { x: div(x.center.x+y.center.x,2), y: div(x.center.y+y.center.y,2) } });
  }
  return result;
}

function confine(bot: LiveBot): void {
  const points = worldTriangles(bot).flatMap(t => t.vertices);
  if (!points.length) return;
  const box = bounds(points);
  bot.position.x += Math.max(0, -box.minX) - Math.max(0, box.maxX - RULESET.arena.width);
  bot.position.y += Math.max(0, -box.minY) - Math.max(0, box.maxY - RULESET.arena.height);
}

export function damageFor(attacker: TriType, defender: TriType, impact: number, orientation: number): number {
  if (attacker === "motor") return 0;
  const multiplier = defender === "motor" ? RULESET.damage.motorMultiplier : attacker === defender ? RULESET.damage.neutral : RULESET.damage.beats[attacker] === defender ? RULESET.damage.advantage : RULESET.damage.disadvantage;
  return Math.floor(RULESET.triangles[attacker].damage * multiplier * impact * orientation / 1000000000);
}

function applyContacts(state: MatchState, collisions: Collision[], events: VfxEvent[]): void {
  type Hit = { attacker: Team; source: number; target: number; damage: number; impact: number; orientation: number; r: number; normal: Vec2; at: Vec2 };
  const hits = new Map<string, Hit>();
  for (const collision of collisions) for (const team of TEAMS) {
    const attacker = state.bots[team], defender = state.bots[other(team)];
    const source = team === "A" ? collision.a : collision.b, target = team === "A" ? collision.b : collision.a;
    const a = attacker.triangles[source]!, b = defender.triangles[target]!;
    if (!a.alive || !b.alive || a.type === "motor" || state.tick - b.lastHit < RULESET.damage.hitCooldownTicks) continue;
    const sign = team === "A" ? 1 : -1;
    const normal = { x: collision.normal.x * sign, y: collision.normal.y * sign };
    const approach = Math.max(0, div(attacker.velocity.x * normal.x + attacker.velocity.y * normal.y, 1000));
    const r = div(approach * 1000, RULESET.damage.impactRefSpeed);
    const impact = RULESET.damage.impactBase + div(RULESET.damage.impactRange * Math.min(r, 1000), 1000);
    const ac = worldPoint(a.center, attacker.position, attacker.heading), bc = worldPoint(b.center, defender.position, defender.heading);
    const bearing = headingOf({ x: bc.x - ac.x, y: bc.y - ac.y });
    const orientation = RULESET.damage.orientLut[Math.abs(angleDelta(bearing, (attacker.heading + (a.orientation === "down" ? 32 : 0)) % 64))]!;
    const damage = damageFor(a.type, b.type, impact, orientation);
    const key = `${other(team)}:${target}`, previous = hits.get(key);
    if (!previous || damage > previous.damage || (damage === previous.damage && a.id < attacker.triangles[previous.source]!.id)) hits.set(key, { attacker: team, source, target, damage, impact, orientation, r, normal, at: collision.at });
  }
  // Both sides' candidates are fixed before any HP changes. Sorting controls logging only.
  for (const [key, hit] of [...hits].sort(([a],[b]) => a < b ? -1 : 1)) {
    const attacker = state.bots[hit.attacker], defender = state.bots[other(hit.attacker)];
    const a = attacker.triangles[hit.source]!, b = defender.triangles[hit.target]!;
    const damage = Math.min(b.hp, hit.damage);
    b.hp -= damage; b.damageReceived += damage; b.lastHit = state.tick;
    attacker.damageDealt += damage; attacker.hitCount++; attacker.impactSum += hit.r;
    const advantage = a.type !== "motor" && b.type !== "motor" && a.type !== b.type ? RULESET.damage.beats[a.type] === b.type ? "adv" : "disadv" : "neutral";
    events.push({ kind: "hit", tick: state.tick, at: hit.at, normal: hit.normal, attacker: `${hit.attacker}:${a.id}`, defender: `${other(hit.attacker)}:${b.id}`, damage, advantage, impactMul: hit.impact, orientMul: hit.orientation });
    if (!b.hp) events.push({ kind: "destroy", tick: state.tick, at: worldPoint(b.center, defender.position, defender.heading), tri: `${defender.team}:${b.id}`, type: b.type, team: defender.team, by: `${attacker.team}:${a.id}` });
  }
}

export function updateStructure(bot: LiveBot, tick: number, events: VfxEvent[]): void {
  const oldMotors = bot.triangles.filter(t => t.alive && t.type === "motor"), previousLoad = bot.mobility.load;
  let changed = false;
  for (const triangle of bot.triangles) if (triangle.alive && triangle.hp <= 0) { triangle.alive = false; changed = true; }
  if (!changed) return;
  const connected = new Set<number>(), queue = core(bot).alive ? [bot.core] : [];
  while (queue.length) {
    const i = queue.pop()!;
    if (connected.has(i) || !bot.triangles[i]!.alive) continue;
    connected.add(i); queue.push(...bot.triangles[i]!.neighbors);
  }
  const detached: `A:${string}`[] | `B:${string}`[] = [];
  for (const [index, triangle] of bot.triangles.entries()) if (triangle.alive && !connected.has(index)) {
    triangle.alive = false; triangle.hp = 0; detached.push(`${bot.team}:${triangle.id}` as never);
  }
  if (detached.length) events.push({ kind: "detach", tick, team: bot.team, tris: detached });
  for (const side of ["left", "right", "center"] as const) {
    const count = oldMotors.filter(t => !t.alive && (t.center.x < -250 ? "left" : t.center.x > 250 ? "right" : "center") === side).length;
    if (count) events.push({ kind: "motorLost", tick, team: bot.team, side, count });
  }
  recomputeDiversity(bot); bot.mobility = mobility(bot);
  if (bot.mobility.load > 2000 && previousLoad <= 2000) events.push({ kind: "overload", tick, team: bot.team, loadFactor: bot.mobility.load });
  if (!core(bot).alive) events.push({ kind: "coreDestroyed", tick, team: bot.team, at: worldPoint(core(bot).center, bot.position, bot.heading) });
}

export function scoreMatch(state: MatchState): Record<Team, number> {
  const maximumDamage = Math.max(state.bots.A.damageDealt, state.bots.B.damageDealt);
  const score = (bot: LiveBot) => div(
    RULESET.score.damage * ratio(bot.damageDealt, maximumDamage) + RULESET.score.core * ratio(core(bot).hp, bot.initialCoreHp) +
    RULESET.score.combat * ratio(alive(bot).filter(t => t.type !== "motor").length, bot.initialCombat) +
    RULESET.score.motor * ratio(alive(bot).filter(t => t.type === "motor").length, bot.initialMotors), 1000);
  return { A: score(state.bots.A), B: score(state.bots.B) };
}

export function stepMatch(state: MatchState, order: "AB" | "BA" = "AB"): TickOutput {
  if (state.result) return { events: [], result: state.result };
  const events: VfxEvent[] = [], bots = state.bots;
  const sensors = { A: sense(state, "A"), B: sense(state, "B") };
  const thinking = { A: tickBrain(bots.A.package.definition.brain, bots.A.memory, sensors.A), B: tickBrain(bots.B.package.definition.brain, bots.B.memory, sensors.B) };
  const before = { A: { position: { ...bots.A.position }, heading: bots.A.heading }, B: { position: { ...bots.B.position }, heading: bots.B.heading } };
  const intents = { A: moveIntent(bots.A, bots.B, thinking.A.action), B: moveIntent(bots.B, bots.A, thinking.B.action) };
  for (const team of TEAMS) bots[team].memory = thinking[team].memory;
  state.tick++;
  const subdivisions = Math.max(1, ...TEAMS.map(team => Math.ceil(Math.max(Math.abs(intents[team].position.x - before[team].position.x), Math.abs(intents[team].position.y - before[team].position.y)) / RULESET.movement.maxSubstep)));
  for (let substep = 1; substep <= subdivisions; substep++) {
    const previous = { A: { position: { ...bots.A.position }, heading: bots.A.heading }, B: { position: { ...bots.B.position }, heading: bots.B.heading } };
    for (const team of (order === "AB" ? TEAMS : ["B", "A"] as const)) {
      const bot = bots[team], intent = intents[team], old = before[team];
      for (const axis of ["x", "y"] as const) bot.position[axis] += div((intent.position[axis] - old.position[axis]) * substep, subdivisions) - div((intent.position[axis] - old.position[axis]) * (substep - 1), subdivisions);
      bot.heading = intent.heading; confine(bot);
    }
    const collisions = contacts(bots.A, bots.B, previous);
    applyContacts(state, collisions, events);
    const deepest = collisions.reduce<Collision | null>((best, hit) => !best || hit.depth > best.depth ? hit : best, null);
    if (deepest && deepest.depth > 0) {
      // ponytail: conservative swept-hull stop, no rigid-body impulses. Add a TOI solver only if playtests need sliding contacts.
      for (const team of TEAMS) {
        const sign = team === "A" ? -1 : 1, bot = bots[team];
        bot.position = previous[team].position; bot.heading = previous[team].heading;
        const inward = div(bot.velocity.x * deepest.normal.x * -sign + bot.velocity.y * deepest.normal.y * -sign, 1000);
        if (inward > 0) { bot.velocity.x += div(deepest.normal.x * inward * sign, 1000); bot.velocity.y += div(deepest.normal.y * inward * sign, 1000); }
        confine(bot);
      }
    }
  }
  if (state.tick === RULESET.ring.startTick - RULESET.ring.announceTicks) events.push({ kind: "ringStart", tick: state.tick, radius: RULESET.ring.startRadius });
  for (const team of TEAMS) {
    const bot = bots[team], c = core(bot);
    const outside = state.tick >= RULESET.ring.startTick && distanceSquared(worldPoint(c.center, bot.position, bot.heading), RULESET.arena.center) > ringRadius(state.tick) ** 2;
    if (outside !== bot.outside) events.push({ kind: outside ? "ringEnter" : "ringExit", tick: state.tick, team });
    bot.outside = outside;
    if (outside && c.hp > 0) {
      bot.ringCarry += c.maxHp * RULESET.ring.drainPerTick;
      const damage = Math.min(c.hp, div(bot.ringCarry, 1000)); bot.ringCarry %= 1000;
      c.hp -= damage; c.damageReceived += damage;
      if (!c.hp) events.push({ kind: "destroy", tick: state.tick, at: worldPoint(c.center, bot.position, bot.heading), tri: `${team}:${c.id}`, type: c.type, team, by: null });
    }
    updateStructure(bot, state.tick, events);
    if (outside || events.some(e => e.kind === "hit" && e.defender === `${team}:${c.id}`)) events.push({ kind: "coreHit", tick: state.tick, team, hpRatio: ratio(c.hp, c.maxHp) });
    const live = alive(bot);
    bot.incapTicks = !live.some(t => t.type === "motor") || !live.some(t => t.type !== "motor") ? bot.incapTicks + 1 : 0;
    bot.speedSum += isqrt(bot.velocity.x ** 2 + bot.velocity.y ** 2);
  }
  const reasons = [
    ["core", (bot: LiveBot) => !core(bot).alive],
    ["brainBudget", (bot: LiveBot) => bot.memory.violations >= RULESET.brain.violationTicks],
    ["incap", (bot: LiveBot) => bot.incapTicks >= RULESET.match.incapTicks],
  ] as const;
  for (const [reason, lost] of reasons) {
    const a = lost(bots.A), b = lost(bots.B);
    if (a || b) { state.result = { winner: a && b ? "draw" : a ? "B" : "A", reason, tick: state.tick, scores: scoreMatch(state) }; break; }
  }
  if (!state.result && state.tick >= RULESET.match.maxTicks) {
    const scores = scoreMatch(state);
    state.result = { winner: scores.A === scores.B ? "draw" : scores.A > scores.B ? "A" : "B", reason: "timeout", tick: state.tick, scores };
  }
  if (state.result) events.push({ kind: "matchEnd", tick: state.result.tick, winner: state.result.winner, reason: state.result.reason });
  return { events, result: state.result };
}

export function snapshotMatch(state: MatchState): ReplayCheckpoint {
  const snapshot = (bot: LiveBot) => ({ position: { ...bot.position }, heading: bot.heading, loadFactor: bot.mobility.load,
    triangles: bot.triangles.map(({ id, hp, maxHp, alive, damageReceived }) => ({ id, hp, maxHp, alive, damageReceived })) });
  return { tick: state.tick, bots: { A: snapshot(state.bots.A), B: snapshot(state.bots.B) } };
}

export async function simulateMatch(input: MatchInput, options: { record?: boolean; order?: "AB" | "BA" } = {}): Promise<Simulation> {
  const state = await createMatch(input), record = options.record !== false;
  const frames: ReplayFrame[] = [], checkpoints: ReplayCheckpoint[] = [], events: VfxEvent[] = [];
  let previous = snapshotMatch(state);
  const frame = (snapshot: ReplayCheckpoint, first = false): ReplayFrame => {
    const bot = (team: Team) => ({ position: snapshot.bots[team].position, heading: snapshot.bots[team].heading, loadFactor: snapshot.bots[team].loadFactor,
      changes: snapshot.bots[team].triangles.filter((t, i) => { const old = previous.bots[team].triangles[i]!; return first || t.hp !== old.hp || t.maxHp !== old.maxHp || t.alive !== old.alive || t.damageReceived !== old.damageReceived; }) });
    return { tick: snapshot.tick, bots: { A: bot("A"), B: bot("B") } };
  };
  if (record) { checkpoints.push(previous); frames.push(frame(previous, true)); }
  while (!state.result) {
    const output = stepMatch(state, options.order);
    if (record) {
      events.push(...output.events);
      const snapshot = snapshotMatch(state);
      frames.push(frame(snapshot));
      if (state.tick % RULESET.replay.checkpointIntervalTicks === 0 || state.result) checkpoints.push(snapshot);
      previous = snapshot;
    }
  }
  const stats = (bot: LiveBot) => ({ damageDealt: bot.damageDealt, meanSpeed: div(bot.speedSum, state.tick), hitCount: bot.hitCount, meanImpactRatio: bot.hitCount ? div(bot.impactSum, bot.hitCount) : 0 });
  return { frames, checkpoints, events, result: state.result, stats: { A: stats(state.bots.A), B: stats(state.bots.B) } };
}
