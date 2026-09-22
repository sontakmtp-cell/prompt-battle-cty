import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
const arg=(name,fallback)=>process.argv.includes(name)?process.argv[process.argv.indexOf(name)+1]:fallback;
const bonus=Number(arg('--bonus','120')), count=Number(arg('--seeds','100')), out=arg('--out',`artifacts/m1/probes-${bonus}.json`);
const only=arg('--only',null);
assert.ok([0,80,120,160].includes(bonus)); assert.ok(Number.isInteger(count)&&count>=1&&count<=1000);
// Test-process-only ablation. The published ruleset and simulation workers are never mutated.
if(bonus!==120) registerHooks({load(url,context,next){const result=next(url,context);if(url.endsWith('/contracts/dist/ruleset.js')){const source=result.source.toString();assert.match(source,/bonusPerType: 120/);return {...result,source:source.replace('bonusPerType: 120',`bonusPerType: ${bonus}`)};}return result;}});
const { RULESET, VERSIONS }=await import('@prompt-chien/contracts');
const { IDLE_ACTION }=await import('@prompt-chien/core/brain');
const { analyzeGeometry }=await import('@prompt-chien/core/geometry');
const { createMatch, packBot, stepMatch, damageFor, mobility }=await import('@prompt-chien/core/engine');
const { referenceBots }=await import('./reference-bots.mjs');
const clone=x=>structuredClone(x), types=['hammer','scissor','paper'];
const base=clone(referenceBots().shield);base.name='Balanced';base.brain=clone(referenceBots().spear.brain);
let combat=0;base.body.triangles.forEach(t=>{if(t.type!=='motor')t.type=types[combat++%3];});
const mono=type=>{const b=clone(base);b.name=`Pure ${type}`;b.body.triangles.forEach(t=>{if(t.type!=='motor')t.type=type;});return b;};
const passive=clone(base); passive.name='Stationary'; passive.brain.states[0].rules[0].action={...IDLE_ACTION,turn:{mode:'faceEnemy',power:1000,offset:0}};
const noTurn=clone(base);noTurn.name='No turning';noTurn.brain.states[0].rules[0].action.turn={mode:'hold',power:0,offset:0};
const biased=clone(base);biased.name='32 hammer, 13 other';let n=0;biased.body.triangles.forEach(t=>{if(t.type!=='motor'){t.type=n<32?'hammer':types[1+n%2];n++;}});
const wide=clone(base);wide.name='Wide';const cells=[];
for(const [r,width] of [1,1,1,1,1,1,11,7,1,1,1,1,2].entries())for(let c=0;c<width;c++)for(const orientation of ['up','down'])cells.push({q:c-Math.floor(width/2),r,orientation});
assert.equal(cells.length,60);wide.body.triangles.forEach((t,i)=>Object.assign(t,cells[i]));assert.equal(analyzeGeometry(wide.body).ok,true);
const packages=new Map();
async function pkg(bot){if(!packages.has(bot))packages.set(bot,await packBot(bot));return packages.get(bot);}
async function duel(a,b,seed,limit=3600,firstContact=false){
  const swap=seed%2===1, pa=await pkg(a),pb=await pkg(b),s=await createMatch({packages:swap?{A:pb,B:pa}:{A:pa,B:pb},seed});
  let factor=0,hits=0,capacity={A:0,B:0},firstR=null;
  while(!s.result&&s.tick<limit){const events=stepMatch(s).events;for(const t of ['A','B'])capacity[t]+=s.bots[t].mobility.speed;
    for(const e of events)if(e.kind==='hit'){factor+=e.impactMul*e.orientMul;hits++;}
    const charger=s.bots[swap?'B':'A'];if(firstR===null&&charger.hitCount)firstR=charger.impactSum/charger.hitCount/1000;
    if(firstContact&&firstR!==null)break;
  }
  const aBot=s.bots[swap?'B':'A'],bBot=s.bots[swap?'A':'B'];
  return {seed,winner:s.result?(s.result.winner==='draw'?'draw':s.result.winner===(swap?'B':'A')?'a':'b'):null,reason:s.result?.reason??'probeLimit',ticks:s.tick,aDamage:aBot.damageDealt,bDamage:bBot.damageDealt,aMeanSpeed:aBot.speedSum/s.tick,bMeanSpeed:bBot.speedSum/s.tick,aMeanCapacity:capacity[swap?'B':'A']/s.tick,bMeanCapacity:capacity[swap?'A':'B']/s.tick,damageFactor:hits?factor/hits/1000000:null,firstR};
}
async function series(label,a,b,limit=3600){if(only&&only!==label)return null;const rows=[];for(let seed=0;seed<count;seed++)rows.push(await duel(a,b,seed,limit));const mean=key=>rows.reduce((sum,r)=>sum+(r[key]??0),0)/rows.length;
const summary={label,a:a.name,b:b.name,seeds:count,aWins:rows.filter(r=>r.winner==='a').length,bWins:rows.filter(r=>r.winner==='b').length,draws:rows.filter(r=>r.winner==='draw').length,aWinRate:rows.filter(r=>r.winner==='a').length/count,bWinRate:rows.filter(r=>r.winner==='b').length/count,aMeanSpeed:mean('aMeanSpeed'),bMeanSpeed:mean('bMeanSpeed'),aMeanCapacity:mean('aMeanCapacity'),bMeanCapacity:mean('bMeanCapacity'),damageFactor:mean('damageFactor'),damageRatio:mean('bDamage')?mean('aDamage')/mean('bDamage'):null,timeoutRate:rows.filter(r=>r.reason==='timeout').length/count,rows};console.log(JSON.stringify({...summary,rows:undefined}));return summary;}
const results=[];
for(const type of types)results.push(await series(`mixed-vs-${type}`,base,mono(type)));
let calibration=null,staticChecks=null;
if(bonus===120){
  results.push(await series('paper-vs-hammer',mono('paper'),mono('hammer')));
  results.push(await series('paper-mirror',mono('paper'),mono('paper')));
  results.push(await series('biased-vs-mixed',biased,base));
  results.push(await series('motor-hunter-vs-mixed',mono('hammer'),base));
  results.push(await series('turn-vs-no-turn',base,noTurn));
  results.push(await series('stationary-vs-charge-30s',passive,base,900));
  results.push(await series('compact-vs-wide',base,wide));
  calibration=await duel(base,passive,42,600,true);
  const overloaded=clone(base);let motor=0;overloaded.body.triangles.forEach(t=>{if(t.type==='motor'&&motor++>=5)t.type='hammer';});
  const loadState=await createMatch({packages:{A:await pkg(overloaded),B:await pkg(base)},seed:42});const old=loadState.bots.A.mobility.speed;
  loadState.bots.A.triangles.filter(t=>t.type!=='motor'&&!t.core).slice(0,40).forEach(t=>{t.alive=false;t.hp=0;});
  const after=mobility(loadState.bots.A).speed;
  staticChecks={rpsInvariant:types.every(t=>damageFor(t,RULESET.damage.beats[t],850,850)>damageFor(RULESET.damage.beats[t],t,1000,1000)),overloadedBodyLoss:{before:old,after,passed:after<=old},biasedWarnings:analyzeGeometry(biased.body).warnings,monoWarnings:analyzeGeometry(mono('paper').body).warnings,compactBounds:analyzeGeometry(base.body).bounds,wideBounds:analyzeGeometry(wide.body).bounds,orientationOnly:'All-up or all-down bodies cannot be edge-connected at budget > 1. This requested comparison is not constructible on the specified grid.'};
}
const report={versions:VERSIONS,experimental:bonus!==120,diversityBonus:bonus,cooldown:RULESET.damage.hitCooldownTicks,seeds:count,results:results.filter(Boolean),calibration,staticChecks};
mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({out,calibration,staticChecks}));
