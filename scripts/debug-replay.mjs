import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { analyzeGeometry, DIRECTIONS } from '@prompt-chien/core/geometry';
import { ringRadius } from '@prompt-chien/core/engine';
import { seekReplay } from '@prompt-chien/core/replay';
import { runIsolated } from './run-isolated.mjs';

const input=process.argv[2];
if(!input) throw new Error('Usage: node scripts/debug-replay.mjs replay.json [--serve]');
if(statSync(input).size>64*1024*1024) throw new Error('Replay exceeds 64 MiB');
const replay=JSON.parse(readFileSync(input,'utf8')); await runIsolated({kind:'verify',replay});
const data={replay,shapes:Object.fromEntries(['A','B'].map(t=>[t,analyzeGeometry(replay.manifest.packages[t].definition.body).triangles])),directions:DIRECTIONS,radii:replay.frames.map(f=>ringRadius(f.tick))};
const json=JSON.stringify(data).replaceAll('<','\\u003c');
const html=`<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PROMPT CHIẾN · M1</title>
<style>body{font:16px system-ui;margin:20px auto;padding:0 16px;max-width:850px;background:#f4f5f6;color:#17212a}h1{font-size:24px}canvas{display:block;background:white;width:min(100%,68vh);margin:12px auto;border:1px solid #ccd2d9}button,select,input{font:inherit;padding:8px}nav{display:flex;gap:8px;flex-wrap:wrap;align-items:center}input[type=range]{flex:1;min-width:120px}output{display:block;margin:12px 0}small{display:block;overflow-wrap:anywhere}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #087e8b}</style>
<h1>PROMPT CHIẾN · M1</h1><p id="names"></p><canvas id="arena" width="800" height="800" aria-label="Sân đấu: tam giác màu phẳng, Core khoanh tròn"></canvas>
<nav><button id="play">Phát</button><button id="back" aria-label="Lùi một nhịp">−1</button><button id="next" aria-label="Tiến một nhịp">+1</button><input id="seek" type="range" min="0" value="0" aria-label="Nhịp phát lại"><label>Tốc độ <select id="speed"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></label></nav>
<output id="status" aria-live="polite"></output><p>Búa: đỏ · Kéo: xanh · Bao: vàng · Motor: xám. Viền A: xanh dương · B: tím.</p><small id="hash"></small>
<script type="application/json" id="data">${json}</script><script>
const {replay,shapes,directions,radii}=JSON.parse(document.getElementById('data').textContent);
const seekReplay=${seekReplay.toString()};
const canvas=document.getElementById('arena'),ctx=canvas.getContext('2d'),slider=document.getElementById('seek'),play=document.getElementById('play'),status=document.getElementById('status');
const colors={hammer:'#e66c5a',scissor:'#52b99a',paper:'#eac66b',motor:'#b6bdc6'};
let tick=0,playing=false,last=0,carry=0;
slider.max=replay.manifest.totalTicks;
document.getElementById('names').textContent='A · '+replay.manifest.packages.A.definition.name+'   vs   B · '+replay.manifest.packages.B.definition.name;
document.getElementById('hash').textContent='Replay đã kiểm chứng: '+replay.manifest.dataHash;
function draw(){const state=seekReplay(replay,tick);ctx.clearRect(0,0,800,800);ctx.save();ctx.translate(0,800);ctx.scale(.02,-.02);ctx.lineWidth=70;
if(tick>=1800){ctx.strokeStyle='#ef8058';ctx.beginPath();ctx.arc(20000,20000,radii[tick],0,Math.PI*2);ctx.stroke();}
const info=[];
for(const team of ['A','B']){const bot=state.bots[team],d=directions[(bot.heading+48)%64];const point=p=>({x:bot.position.x+Math.trunc((p.x*d.x-p.y*d.y)/1000),y:bot.position.y+Math.trunc((p.x*d.y+p.y*d.x)/1000)});
for(const t of shapes[team]){const hp=bot.triangles.find(s=>s.id===t.id);if(!hp.alive)continue;const vs=t.vertices.map(point);ctx.fillStyle=colors[t.type];ctx.strokeStyle=team==='A'?'#2160aa':'#8c3aa5';ctx.beginPath();ctx.moveTo(vs[0].x,vs[0].y);for(const p of vs.slice(1))ctx.lineTo(p.x,p.y);ctx.closePath();ctx.fill();ctx.stroke();if(t.core){const c=point(t.center);ctx.strokeStyle='#111';ctx.lineWidth=110;ctx.beginPath();ctx.arc(c.x,c.y,220,0,Math.PI*2);ctx.stroke();ctx.lineWidth=70;}}
const c=bot.triangles.find(s=>s.id===shapes[team].find(t=>t.core).id);info.push(team+': Core '+c.hp+'/'+c.maxHp+' · '+bot.triangles.filter(t=>t.alive).length+' mảnh');}
ctx.restore();slider.value=tick;const end=replay.manifest.result;status.textContent=(tick/30).toFixed(2)+' giây · nhịp '+tick+'/'+slider.max+' | '+info.join(' | ')+(tick===end.tick?' | Kết quả: '+end.winner+' ('+end.reason+')':'');}
function pause(){playing=false;play.textContent='Phát';}
slider.oninput=()=>{pause();tick=Number(slider.value);draw();};
document.getElementById('back').onclick=()=>{pause();tick=Math.max(0,tick-1);draw();};
document.getElementById('next').onclick=()=>{pause();tick=Math.min(Number(slider.max),tick+1);draw();};
play.onclick=()=>{if(playing){pause();return;}if(tick===Number(slider.max))tick=0;playing=true;last=0;carry=0;play.textContent='Tạm dừng';};
function animate(time){if(playing){if(last)carry+=Math.min(time-last,100)*30*Number(document.getElementById('speed').value)/1000;last=time;const steps=Math.floor(carry);if(steps){carry-=steps;tick=Math.min(Number(slider.max),tick+steps);draw();if(tick===Number(slider.max))pause();}}requestAnimationFrame(animate);}draw();requestAnimationFrame(animate);
</script></html>`;
const output=resolve(input.replace(/\.json$/i,'')+'.html');writeFileSync(output,html);console.log(output);
if(process.argv.includes('--serve'))createServer((req,res)=>{if(req.url!=='/'&&req.url!=='/index.html'){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}).end(readFileSync(output));}).listen(4173,'127.0.0.1',()=>console.log('Debug replay: http://127.0.0.1:4173'));
