import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { VERSIONS, hashJson } from '@prompt-chien/contracts';
import { packBot, simulateMatch } from '@prompt-chien/core/engine';
import { createReplay, verifyReplay } from '@prompt-chien/core/replay';
import { referenceBots } from './reference-bots.mjs';

const args=process.argv.slice(2), option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const out=option('--out',`artifacts/m1/${process.platform}.json`);
const save=report=>{mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(report,null,2)+'\n');};
if(args.includes('--compare')) {
  const i=args.indexOf('--compare'), a=JSON.parse(readFileSync(args[i+1],'utf8')), b=JSON.parse(readFileSync(args[i+2],'utf8'));
  assert.deepEqual([a.platform,b.platform].sort(),['linux','win32']);
  assert.equal(a.node,'v22.23.1'); assert.equal(b.node,a.node);
  assert.equal(a.records.length,100); assert.deepEqual(a.versions,b.versions); assert.deepEqual(a.records,b.records);
  assert.equal(await hashJson(a.records),a.digest); assert.equal(a.digest,b.digest);
  const report={passed:true,seeds:100,platforms:[a.platform,b.platform],node:a.node,versions:a.versions,digest:a.digest};
  save(report); console.log(JSON.stringify(report));
} else {
  assert.equal(process.version,'v22.23.1','Use the pinned runtime for cross-platform evidence');
  const packages=await Promise.all(Object.entries(referenceBots()).map(async([name,bot])=>[name,await packBot(bot)]));
  const pairs=[]; for(let a=0;a<packages.length;a++) for(let b=a+1;b<packages.length;b++) pairs.push([a,b]);
  const records=[];
  for(let seed=0;seed<100;seed++) {
    const pair=pairs[seed%pairs.length], swap=Math.floor(seed/pairs.length)%2===1;
    const [a,A]=packages[pair[swap?1:0]], [b,B]=packages[pair[swap?0:1]], input={packages:{A,B},seed};
    const replay=await createReplay(input);
    await verifyReplay(replay);
    const reverse=await createReplay(input,await simulateMatch(input,{order:'BA'}));
    assert.equal(reverse.manifest.dataHash,replay.manifest.dataHash,`Team update order changed seed ${seed}`);
    records.push({seed,a,b,hash:replay.manifest.dataHash,result:replay.manifest.result});
    if(seed%10===9) console.log(`${process.platform}: ${seed+1}/100 deterministic replays`);
  }
  const report={platform:process.platform,node:process.version,versions:VERSIONS,records,digest:await hashJson(records)};
  save(report); console.log(JSON.stringify({out,digest:report.digest,seeds:records.length}));
}
