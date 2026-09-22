import assert from 'node:assert/strict';
import test from 'node:test';
import { RULESET, VERSIONS, canonicalJson, hashJson } from '@prompt-chien/contracts';
import { checkSchema } from '@prompt-chien/contracts/validation';
import { analyzeGeometry, contact, convexHull, isqrt } from '@prompt-chien/core/geometry';
import { IDLE_ACTION, initialMemory, tickBrain } from '@prompt-chien/core/brain';
import { contacts, createMatch, damageFor, loadSpeed, mobility, packBot, recomputeDiversity, scoreMatch, sense, simulateMatch, snapshotMatch, stepMatch, updateStructure, verifyPackage, ringRadius } from '@prompt-chien/core/engine';
import { createReplay, replayPayload, seekReplay, verifyReplay } from '@prompt-chien/core/replay';
import { validateBot } from '@prompt-chien/application';
import { referenceBots } from '../scripts/reference-bots.mjs';
import { runIsolated } from '../scripts/run-isolated.mjs';

const clone = x => structuredClone(x);
const action = (move = 'towardEnemy', turn = 'faceEnemy') => ({ move: { mode: move, power: 1000 }, turn: { mode: turn, power: 1000, offset: 0 } });
const brain = (a = action()) => ({ apiVersion: VERSIONS.brainApi, initialState: 'fight', variables: [], states: [{ name: 'fight', rules: [{ when: { op: 'always' }, action: a }] }] });
const triangle = (id, q, r, orientation, type = 'paper', core = false) => ({ id, q, r, orientation, type, core });
const small = () => ({ schemaVersion: VERSIONS.botSchema, name: 'Small', brain: brain(), body: { triangles: [triangle('core', 0,0,'up','paper',true), triangle('motor',0,0,'down','motor')] } });
const match = async (a = small(), b = a, seed = 42) => createMatch({ packages: { A: await packBot(a), B: await packBot(b) }, seed });

test('geometry uses edges, rejects duplicate/oversize/disconnected bodies, and reports load/monoculture', () => {
  const bot = small();
  assert.equal(analyzeGeometry(bot.body).ok, true);
  const g = analyzeGeometry(bot.body);
  assert.deepEqual(g.neighbors.core, ['motor']);
  assert.ok(g.warnings.some(w => w.code === 'MONOCULTURE'));
  for (const mutate of [
    b => { b.triangles[1].q = 1; }, // corner-only
    b => { b.triangles[1].q = 100; },
    b => { b.triangles[1].id = 'core'; },
    b => { b.triangles[1].orientation = 'up'; },
    b => { b.triangles[1].type = 'paper'; },
    b => { b.triangles[0].core = false; },
    b => { b.triangles[0].type = 'motor'; },
  ]) { const body = clone(bot.body); mutate(body); assert.equal(analyzeGeometry(body).ok, false, mutate.toString()); }
  for (const b of Object.values(referenceBots())) assert.equal(analyzeGeometry(b.body).ok, true, b.name);
  const shifted = clone(bot); shifted.body.triangles.forEach(t => { t.q += 999; t.r -= 888; });
  assert.deepEqual(analyzeGeometry(shifted.body).triangles.map(t=>t.vertices), g.triangles.map(t=>t.vertices));
  for (const n of [0,1,2,3,4,99999,1600000000,Number.MAX_SAFE_INTEGER]) {
    const s = isqrt(n); assert.ok(s*s<=n && (s+1)*(s+1)>n);
  }
  const p = [{x:0,y:0},{x:1000,y:0},{x:500,y:866}];
  assert.equal(contact(p,p.map(v=>({x:v.x+2000,y:v.y}))), null);
  assert.ok(contact(convexHull([...p,...p.map(v=>({x:v.x+3000,y:v.y}))]), p.map(v=>({x:v.x+1500,y:v.y}))));
});

test('Brain first-match, atomic assignments, saturation, state transitions, short-circuit and budget rollback', async () => {
  const state = await match(), sensors = sense(state,'A'), p = brain();
  p.variables = [{name:'x',initial:2147483647},{name:'y',initial:0}];
  p.states[0].rules[0].set = [
    { name:'x', value:{kind:'math',op:'add',left:{kind:'variable',name:'x'},right:{kind:'constant',value:10}} },
    { name:'y', value:{kind:'variable',name:'x'} },
  ];
  p.states[0].rules[0].nextState = 'wait';
  p.states.push({name:'wait',rules:[{when:{op:'not',arg:{op:'always'}},action:action()}]});
  const memory=initialMemory(p), before=clone(memory), result=tickBrain(p,memory,sensors);
  assert.deepEqual(memory,before);
  assert.deepEqual(result.memory.variables,{x:2147483647,y:2147483647});
  assert.equal(result.memory.state,'wait'); assert.equal(result.memory.stateTicks,0);
  assert.deepEqual(tickBrain(p,result.memory,sensors).action,IDLE_ACTION);
  let exceeded=memory;
  for(let i=0;i<30;i++) {
    const r=tickBrain(p,exceeded,sensors,result.steps-1); exceeded=r.memory;
    assert.equal(r.exceeded,true); assert.deepEqual(r.action,IDLE_ACTION);
    assert.deepEqual(exceeded.variables,memory.variables); assert.equal(exceeded.state,memory.state);
  }
  assert.equal(exceeded.violations,30);
  assert.equal(tickBrain(p,exceeded,sensors).memory.violations,0);
  const short=brain(); short.states[0].rules[0].when={op:'any',args:[{op:'always'},{op:'not',arg:{op:'always'}}]};
  assert.equal(tickBrain(short,initialMemory(short),sensors).steps,5);
  const hostile=brain(); hostile.states[0].rules=Array.from({length:1100},()=>({when:{op:'not',arg:{op:'always'}},action:IDLE_ACTION}));
  state.bots.A.package={...state.bots.A.package,definition:{...small(),brain:hostile}};
  for(let i=0;i<30;i++) stepMatch(state);
  assert.equal(state.result.reason,'brainBudget'); assert.equal(state.result.winner,'B');
});

test('diversity recalculates without healing; bridges detach; motor loss affects load and asymmetric steering', async () => {
  const body={triangles:[triangle('c',0,0,'up','hammer',true), triangle('s',0,0,'down','scissor'), triangle('p',1,0,'up','paper'),triangle('m',0,1,'up','motor')]};
  const s=await match({...small(),body}), b=s.bots.A, c=b.triangles.find(t=>t.id==='s'), m=b.triangles.find(t=>t.type==='motor');
  assert.equal(c.maxHp,Math.floor(105*1.24));
  assert.equal(m.maxHp,80,'one adjacent combat type gives no extra type');
  c.hp=20; b.triangles.find(t=>t.id==='p').alive=false; recomputeDiversity(b);
  assert.equal(c.maxHp,117); assert.equal(c.hp,20);
  const events=[]; c.hp=0; updateStructure(b,1,events);
  assert.equal(m.alive,false); assert.ok(events.some(e=>e.kind==='detach'));
  assert.equal(b.mobility.speed,0);
  const bot=referenceBots().spear; const state=await match(bot); const a=state.bots.A, initial=a.mobility.speed;
  a.triangles.filter(t=>t.type!=='motor').slice(0,35).forEach(t=>{t.alive=false;});
  assert.ok(mobility(a).speed<=initial);
  a.triangles.filter(t=>t.type==='motor').slice(0,10).forEach(t=>{t.alive=false;});
  assert.ok(mobility(a).left<a.mobility.left);
  assert.notEqual(mobility(a).left,mobility(a).right);
  assert.deepEqual([500,501,1000,1250,1500,1750,2000,2001].map(loadSpeed),[1150,1000,1000,850,700,550,400,150]);
});

test('simultaneous core kills draw, incap waits 300 ticks, timeout weights and ring percentage are exact', async () => {
  const idle=small(); idle.brain=brain(IDLE_ACTION);
  const s=await match(idle); s.bots.B.position={...s.bots.A.position}; s.bots.B.heading=s.bots.A.heading;
  for(const b of Object.values(s.bots)) b.triangles[b.core].hp=1;
  const events=stepMatch(s).events;
  assert.equal(s.result.reason,'core'); assert.equal(s.result.winner,'draw');
  assert.equal(events.filter(e=>e.kind==='coreDestroyed').length,2);
  const incap=await match(idle);
  for(const b of Object.values(incap.bots)) { b.triangles.find(t=>t.type==='motor').hp=0; updateStructure(b,0,[]); }
  for(let i=0;i<299;i++) stepMatch(incap);
  assert.equal(incap.result,null); stepMatch(incap); assert.equal(incap.result.reason,'incap'); assert.equal(incap.result.winner,'draw');
  const timeout=await match(idle); timeout.bots.A.position={x:18000,y:20000}; timeout.bots.B.position={x:22000,y:20000};
  assert.deepEqual(scoreMatch(timeout),{A:650,B:650});
  timeout.bots.A.damageDealt=2000; timeout.bots.B.damageDealt=1500;
  assert.deepEqual(scoreMatch(timeout),{A:1000,B:912});
  timeout.tick=3599; stepMatch(timeout); assert.equal(timeout.result.reason,'timeout'); assert.equal(timeout.result.winner,'A');
  assert.deepEqual([0,1800,2700,3600].map(ringRadius),[28300,28300,16150,4000]);
  const announce=await match(idle); announce.tick=1754; assert.ok(stepMatch(announce).events.some(e=>e.kind==='ringStart'));
  for(const type of ['hammer','scissor','paper']) {
    const bot=clone(idle); bot.body.triangles[0].type=type;
    const ring=await match(bot); ring.tick=3400; ring.bots.A.position={x:2000,y:2000}; ring.bots.B.position={x:38000,y:38000};
    for(let i=0;i<66;i++) stepMatch(ring);
    assert.equal(ring.result,null, type); stepMatch(ring); assert.equal(ring.result.reason,'core'); assert.equal(ring.result.winner,'draw');
  }
});

test('defender cooldown cannot multiply hits and swept movement never crosses an intact opponent', async () => {
  const s=await match(); s.bots.A.position={x:19500,y:20000}; s.bots.B.position={x:20500,y:20000};
  const beforeOrder=Math.sign(s.bots.B.position.x-s.bots.A.position.x), history=new Map(); let hits=0;
  for(let i=0;i<60&&!s.result;i++) {
    const out=stepMatch(s);
    for(const e of out.events.filter(e=>e.kind==='hit')) {
      assert.ok(e.tick-(history.get(e.defender)??-1000)>=RULESET.damage.hitCooldownTicks);
      history.set(e.defender,e.tick); hits++;
    }
    if(!s.result) assert.equal(Math.sign(s.bots.B.position.x-s.bots.A.position.x),beforeOrder);
  }
  assert.ok(hits>0);
  const far=await match(); const old={A:{position:{x:10000,y:20000},heading:0},B:{position:{x:20000,y:20000},heading:32}};
  far.bots.A.position={x:30000,y:20000}; far.bots.B.position=old.B.position;
  assert.equal(contacts(far.bots.A,far.bots.B).length,0);
  assert.ok(contacts(far.bots.A,far.bots.B,old).length>0,'swept path catches disjoint endpoints');
  for(const a of ['hammer','scissor','paper']) assert.ok(damageFor(a,RULESET.damage.beats[a],850,850)>damageFor(RULESET.damage.beats[a],a,1000,1000));
});

test('immutable packages, canonical hashes, replay seek and rerun reject tampering and ignore operational IDs', async () => {
  const a=await packBot(referenceBots().spear), b=await packBot(referenceBots().flanker), input={packages:{A:a,B:b},seed:42};
  assert.equal(Object.isFrozen(a.definition.body.triangles[0]),true);
  assert.equal(canonicalJson({z:1,a:2}),canonicalJson({a:2,z:1}));
  assert.throws(()=>canonicalJson({n:0.5}));
  const changed=clone(a); changed.definition.name='Changed'; await assert.rejects(verifyPackage(changed),/hash mismatch/);
  changed.versions.engine='9.0.0'; await assert.rejects(verifyPackage(changed),/Unsupported engine/);
  const run=await simulateMatch(input), replay=await createReplay(input,run);
  assert.equal(checkSchema('ReplayData',replay).ok,true,'shared JSON nodes are not cycles');
  assert.equal((await verifyReplay(replay)).verified,true);
  const reverse=await createReplay(input,await simulateMatch(input,{order:'BA'}));
  assert.equal(reverse.manifest.dataHash,replay.manifest.dataHash);
  const cursor=await createMatch(input);
  while(!cursor.result) { stepMatch(cursor); if(cursor.tick%47===0||cursor.result) assert.deepEqual(seekReplay(replay,cursor.tick),snapshotMatch(cursor)); }
  replay.manifest.replayId='another-job-id'; assert.equal(await hashJson(replayPayload(replay)),replay.manifest.dataHash);
  assert.equal((await verifyReplay(replay)).verified,true);
  replay.frames[1].bots.A.position.x++; await assert.rejects(verifyReplay(replay),/hash mismatch/);
  assert.throws(()=>seekReplay(replay,-1),/out of range/);
  const cyclic=small(); cyclic.brain=cyclic; assert.equal(checkSchema('BotDefinition',cyclic).ok,false);
});

test('stationary retaliation stays below 80 percent of charging damage without breaking RPS', async () => {
  let stationaryDamage=0,chargeDamage=0;
  for(const seed of [0,1,7,42,2026]) {
    const moving=referenceBots().shield; moving.brain=referenceBots().spear.brain;
    let i=0; moving.body.triangles.forEach(t=>{if(t.type!=='motor')t.type=['hammer','scissor','paper'][i++%3];});
    const stationary=clone(moving); stationary.brain.states[0].rules[0].action.move=IDLE_ACTION.move;
    const swapped=seed%2===1, state=await match(swapped?moving:stationary,swapped?stationary:moving,seed);
    while(!state.result&&state.tick<900)stepMatch(state);
    stationaryDamage+=state.bots[swapped?'B':'A'].damageDealt;
    chargeDamage+=state.bots[swapped?'A':'B'].damageDealt;
  }
  assert.ok(stationaryDamage/chargeDamage<0.8,`${stationaryDamage}/${chargeDamage}`);
});

test('all five bots actively engage, passive bots fail and worker timeout is a failed job', async () => {
  for(const bot of Object.values(referenceBots())) {
    const {report,trials}=await validateBot(bot);
    assert.equal(report.valid,true,`${bot.name}: ${JSON.stringify(trials)}`);
    assert.equal(checkSchema('ValidationReport',report).ok,true);
  }
  const passive=small(); passive.brain=brain(IDLE_ACTION);
  assert.equal((await validateBot(passive)).report.checks.sandbox,'failed');
  const heavy=referenceBots().spear; let motors=0;
  heavy.body.triangles.forEach(t=>{if(t.type==='motor'&&motors++>=5)t.type='hammer';});
  const heavyResult=await validateBot(heavy);
  assert.equal(heavyResult.report.valid,true,JSON.stringify(heavyResult.trials));
  assert.ok(heavyResult.trials.some(t=>t.ticks>600),'slow legal bodies must not be mislabeled passive after 20 seconds');
  const worker=await runIsolated({kind:'validate',bot:referenceBots().spear}); assert.equal(worker.report.valid,true);
  await assert.rejects(runIsolated({kind:'validate',bot:small()},{timeoutMs:1}),/job failed: timeout/);
});
