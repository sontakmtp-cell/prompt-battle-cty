import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { VERSIONS, hashJson } from "@prompt-chien/contracts";
import { DIRECTIONS } from "@prompt-chien/core/geometry";
import { validateBrain } from "@prompt-chien/core/brain";
import { createMatch, packBot, ringRadius, snapshotMatch, stepMatch } from "@prompt-chien/core/engine";
import { seekReplay } from "@prompt-chien/core/replay";
import {
  emptyStore, enqueueOpponent, finishPair, matchSeed, recordVersion, releasePair, submitOwn, takePair, writeDraft,
} from "@prompt-chien/application/lab";
import { DISPLAY_DIRECTIONS, TEAM_FILL, TEAM_INK, badgeArcs, cellAt, cellVertices, contrast, projectViewer, viewCheckpoint, viewRingRadius } from "@prompt-chien/ui";
import { starterDefinition } from "../apps/web/dist/starter.js";
import { tacticBrain } from "../apps/web/dist/tactics.js";
import { startLab } from "../scripts/web.mjs";

const sources = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? sources(path) : path.endsWith(".ts") ? [path] : [];
});

test("the browser lab does not import the simulation core", () => {
  const forbidden = sources("apps/web/src").filter(path => {
    const text = readFileSync(path, "utf8");
    return /@prompt-chien\/core/.test(text) || /@prompt-chien\/application(?!\/lab)/.test(text);
  });
  assert.deepEqual(forbidden, []);
});

test("draft revisions, validated versions and the local FIFO queue", async () => {
  const definition = starterDefinition();
  const other = starterDefinition("Người kia");
  let store = emptyStore();
  const created = writeDraft(store, { id: "dMine", ownerId: "nguoi-ban", expectedRevision: 0, definition });
  assert.equal(created.ok, true);
  store = created.store;
  assert.equal(writeDraft(store, { id: "dMine", ownerId: "nguoi-ban", expectedRevision: 0, definition }).code, "REVISION_CONFLICT");
  const edited = writeDraft(store, { id: "dMine", ownerId: "nguoi-ban", expectedRevision: 1, definition: { ...definition, name: "Đã sửa" } });
  assert.equal(edited.ok, true);
  assert.equal(edited.draft.revision, 2);
  assert.equal(submitOwn(edited.store, { id: "q1", ownerId: "nguoi-ban", packageHash: "ab" }).ok, false);

  const pkg = await packBot(edited.draft.definition);
  const recorded = await recordVersion(edited.store, { draftId: "dMine", ownerId: "nguoi-ban", expectedRevision: 2, package: pkg });
  assert.equal(recorded.ok, true);
  store = recorded.store;
  const queued = submitOwn(store, { id: "qMine", ownerId: "nguoi-ban", packageHash: pkg.packageHash });
  assert.equal(queued.ok, true);
  assert.equal(submitOwn(queued.store, { id: "qAgain", ownerId: "nguoi-ban", packageHash: pkg.packageHash }).code, "ALREADY_QUEUED");

  const rivalDefinition = starterDefinition("Đối thủ");
  const rival = await packBot(rivalDefinition);
  const rivalDraft = writeDraft(queued.store, { id: "dRival", ownerId: "nguoi-khac", expectedRevision: 0, definition: rivalDefinition });
  const rivalVersion = await recordVersion(rivalDraft.store, { draftId: "dRival", ownerId: "nguoi-khac", expectedRevision: 1, package: rival });
  const rivalQueue = submitOwn(rivalVersion.store, { id: "qRival", ownerId: "nguoi-khac", packageHash: rival.packageHash });
  const paired = takePair(rivalQueue.store);
  assert.equal(paired.pair.a.ownerId, "nguoi-ban");
  assert.equal(paired.pair.b.ownerId, "nguoi-khac");
  assert.equal(takePair(paired.store).pair, null);
  const done = finishPair(paired.store, paired.pair.a.id, paired.pair.b.id, "replay-local");
  assert.equal(done.ok, true);
  assert.equal(done.store.queue.every(entry => entry.status === "done"), true);

  const released = releasePair(paired.store, paired.pair.a.id, paired.pair.b.id);
  assert.equal(released.ok, true);
  assert.equal(released.store.queue.every(entry => entry.status === "waiting"), true);
  assert.equal(matchSeed(pkg.packageHash, rival.packageHash), matchSeed(pkg.packageHash, rival.packageHash));

  const oldVersions = { ...VERSIONS, engine: "9.9.9" };
  const oldHash = await hashJson({ versions: oldVersions, definition: other });
  const foreign = await enqueueOpponent(emptyStore(), { id: "qOld", ownerId: "nguoi-cu", package: { packageHash: oldHash, versions: oldVersions, definition: other } });
  const current = await enqueueOpponent(foreign.store, { id: "qNew", ownerId: "nguoi-moi", package: pkg });
  const third = await enqueueOpponent(current.store, { id: "qThird", ownerId: "nguoi-ba", package: rival });
  const skipped = takePair(third.store);
  assert.deepEqual([skipped.pair.a.ownerId, skipped.pair.b.ownerId], ["nguoi-moi", "nguoi-ba"]);
  assert.equal(skipped.store.queue.find(entry => entry.id === "qOld").status, "waiting");

  const sameOwner = emptyStore();
  sameOwner.queue = [
    { id: "qa", ownerId: "nguoi-ban", package: pkg, status: "waiting", order: 1, replayId: null },
    { id: "qb", ownerId: "nguoi-ban", package: rival, status: "waiting", order: 2, replayId: null },
    { id: "qc", ownerId: "nguoi-khac", package: rival, status: "waiting", order: 3, replayId: null },
  ];
  const mixed = takePair(sameOwner);
  assert.equal(mixed.pair.a.id, "qa");
  assert.equal(mixed.pair.b.id, "qc");
});

test("viewer geometry, palette and seek follow the simulation", async () => {
  assert.deepEqual(DISPLAY_DIRECTIONS, DIRECTIONS);
  for (const team of ["A", "B"]) for (const type of ["hammer", "scissor", "paper"]) assert.ok(contrast(TEAM_FILL[team][type]) >= 3, `${team} ${type}`);
  for (const team of ["A", "B"]) assert.ok(contrast(TEAM_INK[team]) >= 3);
  assert.equal(badgeArcs("A").length, 1);
  assert.equal(badgeArcs("B").length, 4);
  assert.ok(badgeArcs("B").every(([, end], index) => end - badgeArcs("B")[index][0] < Math.PI / 2));

  const down = cellVertices(2, 3, "down");
  const center = { x: (down[0].x + down[1].x + down[2].x) / 3, y: (down[0].y + down[1].y + down[2].y) / 3 };
  assert.deepEqual(cellAt(center), { q: 2, r: 3, orientation: "down" });
  for (const tick of [0, 1800, 2700, 3600]) assert.equal(viewRingRadius(tick), ringRadius(tick));
  for (const style of ["charge", "flank", "kite", "hold"]) assert.equal(validateBrain(tacticBrain({ style, power: 1000, engage: 6000, retreatHp: 350, orbit: "orbitLeft" })).ok, true);

  const definition = starterDefinition();
  const packages = { A: await packBot(definition), B: await packBot(starterDefinition("Kia")) };
  const cursor = await createMatch({ packages, seed: 3 });
  const built = [snapshotMatch(cursor)];
  const replayFrames = [frameFrom(cursor)];
  for (let step = 0; step < 40; step++) {
    stepMatch(cursor);
    replayFrames.push(frameFrom(cursor));
    if (cursor.tick % 30 === 0) built.push(snapshotMatch(cursor));
  }
  const replay = { manifest: { totalTicks: cursor.tick }, frames: replayFrames, checkpoints: built };
  assert.deepEqual(viewCheckpoint(replay, 17), seekReplay(replay, 17));
  assert.deepEqual(viewCheckpoint(replay, 40), seekReplay(replay, 40));

  const bodies = {
    A: built[0].bots.A.triangles.map(triangle => bodyTriangle(packages.A, triangle.id)),
    B: built[0].bots.B.triangles.map(triangle => bodyTriangle(packages.B, triangle.id)),
  };
  const view = projectViewer({
    previous: replayFrames[0], next: replayFrames[1], checkpoint: built[0], events: [], alpha: 0.5, seed: 3,
    bodies, frames: replayFrames, showDamage: false, organic: false,
  });
  assert.equal(view.badges.find(badge => badge.team === "A").arcs.length, 1);
  assert.equal(view.badges.find(badge => badge.team === "B").arcs.length, 4);
  assert.equal(view.triangles.length, bodies.A.length + bodies.B.length);
  const ax = view.triangles.find(triangle => triangle.team === "A").center.x;
  const expected = (replayFrames[0].bots.A.position.x + replayFrames[1].bots.A.position.x) / 2;
  assert.ok(Math.abs(ax - expected) < 800);
});

function frameFrom(state) {
  const snap = snapshotMatch(state);
  const bot = team => ({ position: { ...snap.bots[team].position }, heading: snap.bots[team].heading, loadFactor: snap.bots[team].loadFactor, changes: snap.bots[team].triangles.map(triangle => ({ ...triangle })) });
  return { tick: snap.tick, bots: { A: bot("A"), B: bot("B") } };
}

function bodyTriangle(pkg, id) {
  const triangle = pkg.definition.body.triangles.find(item => item.id === id);
  return { id, type: triangle.type, core: triangle.core, vertices: [{ x: 0, y: 400 }, { x: 500, y: -200 }, { x: -500, y: -200 }], center: { x: 0, y: 0 } };
}

test("local lab serves inspect, validate and a short match", async () => {
  const server = await startLab(0);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /PROMPT CHIẾN/);
    const bot = starterDefinition();
    const inspected = await fetch(`${base}/api/inspect`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ bot }) }).then(response => response.json());
    assert.equal(inspected.inspection.geometry, "passed");
    assert.equal(inspected.shape.counts.total, 8);
    assert.equal(inspected.shape.motors.tail > 0, true);
    const validated = await fetch(`${base}/api/validate`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ bot }) }).then(response => response.json());
    assert.equal(validated.report.valid, true, JSON.stringify(validated.report.errors));
    const simulated = await fetch(`${base}/api/simulate`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ a: validated.package, b: validated.package, seed: 5, mode: "test" }) }).then(response => response.json());
    assert.equal(simulated.replay.manifest.mode, "test");
    assert.equal(simulated.replay.frames.length, simulated.replay.manifest.totalTicks + 1);
    assert.equal(simulated.shapes.A.length, 8);
    const references = await fetch(`${base}/api/references`).then(response => response.json());
    assert.equal(references.bots.length, 5);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
