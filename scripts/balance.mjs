import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { RULESET, VERSIONS } from '@prompt-chien/contracts';
import { packBot, simulateMatch } from '@prompt-chien/core/engine';
import { referenceBots } from './reference-bots.mjs';

const arg = (name, fallback) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name)+1] : fallback;
const seeds = Number(arg('--seeds','100')), out=arg('--out','artifacts/m1-balance.json');
if(!Number.isInteger(seeds)||seeds<1||seeds>1000) throw new Error('Invalid seed count');
const entries=Object.entries(referenceBots()), packages=await Promise.all(entries.map(async([name,bot])=>[name,await packBot(bot)]));
const rows=[], pairs=[], wins=Object.fromEntries(entries.map(([n])=>[n,0]));
const quantiles = values => { const sorted=[...values].sort((a,b)=>a-b); return Object.fromEntries([10,50,90].map(p=>[`p${p}`,sorted[Math.floor((sorted.length-1)*p/100)]])); };
for(let a=0;a<packages.length;a++) for(let b=a+1;b<packages.length;b++) {
  const [aName,aPkg]=packages[a], [bName,bPkg]=packages[b], pair=[];
  for(let seed=0;seed<seeds;seed++) {
    const swap=seed%2===1, teams=swap?{A:bName,B:aName}:{A:aName,B:bName};
    const run=await simulateMatch({packages:swap?{A:bPkg,B:aPkg}:{A:aPkg,B:bPkg},seed},{record:false});
    const winner=run.result.winner==='draw'?'draw':teams[run.result.winner]; if(winner!=='draw') wins[winner]++;
    const row={a:aName,b:bName,seed,swapped:swap,winner,reason:run.result.reason,seconds:run.result.tick/RULESET.match.tickRate,stats:run.stats};
    pair.push(row); rows.push(row);
  }
  const summary={a:aName,b:bName,games:seeds,aWins:pair.filter(r=>r.winner===aName).length,bWins:pair.filter(r=>r.winner===bName).length,draws:pair.filter(r=>r.winner==='draw').length,duration:quantiles(pair.map(r=>r.seconds))};
  pairs.push(summary); console.log(JSON.stringify(summary));
}
const duration=quantiles(rows.map(r=>r.seconds));
const report={versions:VERSIONS,node:process.version,platform:process.platform,seedCount:seeds,matches:rows.length,cooldown:RULESET.damage.hitCooldownTicks,duration,wins,pairs,checks:{median40to80:duration.p50>=40&&duration.p50<=80,flanker40percent:wins.flanker/(seeds*4)>=0.4,flankerBeatsSpear10percent:rows.filter(r=>r.a==='spear'&&r.b==='flanker'&&r.winner==='flanker').length/seeds>=0.1},rows};
mkdirSync(dirname(out),{recursive:true}); writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({out,duration,wins,checks:report.checks}));
