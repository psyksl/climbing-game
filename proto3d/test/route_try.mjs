// 사용자가 사진에 그린 경로(넓은 발판 → 턱 A → 턱 F → 턱 B → 턱 C → 턱 D → 턱 E)를 스크립트 입력으로 가 본다(p3d-0.12.4). 사람 손이 아니다.
// 화면 기본 설정과 같게: 새 자세(fb)·잡기 보정·자세 보조 켬, 손 조작 1. 발 보조·벽 딛기는 환경 변수로(FA=0|1, WR=0|1). 겨눈 곳(look)은 마지막으로 보낸 목표.
// 경로의 단계는 route_steps.mjs에 둔다(영상 도구가 같은 입력을 쓴다). 사용: [MODE=clip] [UPTO=n] node test/route_try.mjs
import { prov, provLine } from './provenance.mjs';
import fs from 'fs'; import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';
console.log(provLine(prov()));
const HERE = path.dirname(fileURLToPath(import.meta.url)), imp = f => import(pathToFileURL(path.join(HERE, '../src', f)).href);
const { buildCharacter } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js'), { limbState } = await imp('climb.js'), { ROUTE, ROUTE_START } = await import('./route_steps.mjs');
const CLIPS = process.env.MODE === 'clip' ? JSON.parse(fs.readFileSync(path.join(HERE, '../assets_local/clips.json'), 'utf8')) : null, rig = buildCharacter(), sim = makeSim(rig, makeWorld(), CLIPS);
sim.reset({ pos: ROUTE_START, yaw: Math.PI }); sim.opt.wallRest = process.env.WR === '1'; sim.opt.footAssist = process.env.FA !== '0'; sim.opt.grabAssist = true; sim.opt.poseAssist = true; sim.opt.posture = 'fb'; sim.opt.easy = process.env.EASY === '1';
let k = 0, look = null; const f2 = v => (+v).toFixed(2), upto = +(process.env.UPTO || 999);
const state = () => { const L = limbState(sim.climb), b = sim.body; return `몸 ${f2(b.pos.x)},${f2(b.pos.y)},${f2(b.pos.z)} 속도 ${f2(b.vel.length())} ${sim.climb.on ? '벽' : '지상'} · 손 ${L.hands.map(h => h.st + (h.st === 'hold' ? ':' + h.box + '@' + f2(h.grip[0]) + ' 하중 ' + f2(h.loadS) : '')).join(' / ')} · 발 ${L.feet.map(f => f.st + (f.st === 'plant' ? ':' + f.box + '@' + f2(f.p[0]) + ' 하중 ' + f2(f.loadS) : '')).join(' / ')}`; };
ROUTE.slice(0, upto).forEach(([name, segs], si) => { const ev = [];
  for (const [n, inp = {}, cmd = []] of segs) { for (const c of cmd) if (c.p) look = c.p; for (let i = 0; i < n; i++) { sim.step({ mx: 0, mz: 0, cxSign: 1, ...(look ? { look } : {}), ...inp, cmd: i ? [] : cmd }); k++; if (+process.env.TRACE === si + 1 && k % 30 === 0) { const K = sim.climb, T = K.T; console.log(`   ${(k / 120).toFixed(2)} ${state().slice(0, 34)} ref ${f2(K.ref.x)},${f2(K.ref.y)} jam ${K.hands.map(h => f2(h.jam || 0)).join('/')} 어깨–손 ${T ? K.hands.map(h => (h.st === 'hold' ? f2(T.sh[h.i].distanceTo(h.goal)) : '-')).join('/') : ''} 예약 ${K.hands.map(h => (h.arm ? f2(h.arm.short) : '-')).join('/')} ${inp.cy || ''}`); }
    for (const e of sim.climb.events) if (e.type !== 'try') ev.push(`${(k / 120).toFixed(2)} ${e.type}(${e.name || ''} ${e.why || ''})`); } }
  console.log(`[${si + 1}] ${name} — ${(k / 120).toFixed(2)}초\n    ${state()}\n    ${ev.join(' | ').slice(0, 900)}`); });
