// 새 몸에서 실패로 바뀐 회귀 셋을 따라가 본다(p3d-0.10.1, GPT의 0.10.0 검토 "먼저 조사"). 진단 — 통과·실패를 세지 않는다. 스크립트 입력(사람 손 아님).
//   D1 몸을 옆으로 돌린 채(±90°) 턱을 잡을 때 팔이 머리를 지나감(wall_check 2)
//   D2 턱 F를 놓고 턱 A로 되돌려 잡기(wall_check 23 ③)
//   D3 두 손으로 턱 A를 잡고 오른발을 낮은 발판 → W 2초 → 오른손 턱 F(wall_check 16)
// 사용: node test/regress_diag.mjs [D1,D2,D3]   옛 몸: BODY=old   캡처: MODE=clip
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), imp = f => import(pathToFileURL(path.resolve(HERE, '../src', f)).href);
const THREE = await import('three');
const { buildCharacter, DIM } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js');
const clip = process.env.MODE === 'clip', clips = clip ? JSON.parse(fs.readFileSync(path.resolve(HERE, '../assets_local/clips.json'), 'utf8')) : null;
const rig = buildCharacter(), hand = (i, p) => ({ type: 'hand', i, p }), foot = (i, p) => ({ type: 'foot', i, p }), rel = (limb, i) => ({ type: 'release', limb, i });
const AL = [-0.72, 1.92, -2.84], AR = [-0.62, 1.92, -2.84], F = [-0.3, 2.15, -2.86], LOW = [-0.45, 0.5, -2.93], A = { L: [-1.1, 1.92, -2.84], R: [-0.7, 1.92, -2.84] };
let sim; const start = (p, yaw = Math.PI) => { sim = makeSim(rig, makeWorld(), clips); sim.reset({ pos: p, yaw }); sim.opt.wallRest = false; sim.opt.footAssist = false; if (process.env.VARIANT) sim.opt.posture = process.env.VARIANT; };
const run = (n, inp = {}, cmd = []) => { for (let i = 0; i < n; i++) sim.step({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd: i ? [] : cmd }); };
const logFrom = k => sim.climb.log.slice(k).filter(e => e.type !== 'try').map(e => `${(e.t ?? 0).toFixed(2)} ${e.type}${e.name ? ' ' + e.name : ''}${e.box ? ' ' + e.box : ''}${e.why ? ' · ' + e.why : ''}`);
const st = () => { const K = sim.climb; return `손 ${K.hands.map(h => h.st + (h.box ? ':' + h.box.name : '')).join('/')} · 발 ${K.feet.map(f => f.st + (f.box ? ':' + f.box.name : '')).join('/')} · 몸 ${sim.body.pos.toArray().map(v => v.toFixed(2)).join(',')}`; };
const ONLY = (process.argv[2] || 'D1,D2,D3').split(',');
console.log(`몸 ${process.env.BODY === 'old' ? '옛 몸' : '사람형'} · ${clip ? '캡처' : '자작'} · 팔 ${DIM.upperArm}+${DIM.foreArm} · 머리 반지름 ${DIM.headR}`);
if (ONLY.includes('D1')) for (const yaw of [Math.PI / 2, -Math.PI / 2]) for (const i of [0, 1]) {
  start([-0.9, 0, -2.70], yaw); const k0 = sim.climb.log.length; let worst = { d: 0 };
  for (let s = 0; s < 210; s++) { run(1, {}, s ? [] : [hand(i, [-0.9, 1.92, -2.84])]); const S2 = sim.climb.stats; if (S2.selfPen > worst.d) worst = { d: S2.selfPen, at: s, what: S2.penWhat }; }
  console.log(`D1 yaw ${Math.round(yaw * 57.3)} ${i ? '오른손' : '왼손'}: ${logFrom(k0).join(' | ')} | 제 몸 지나감 ${sim.climb.stats.selfPen}걸음 ${sim.climb.stats.penWhat} | ${st()}`);
}
if (ONLY.includes('D2')) { start([-0.62, 0, -2.58]); run(150, {}, [hand(0, AL)]); run(260, {}, [foot(0, LOW)]); run(120, { cy: 1 }); run(120);
  const k0 = sim.climb.log.length; run(240, {}, [hand(1, F)]); console.log('D2 잡기:', logFrom(k0).join(' | '), '|', st());
  const k1 = sim.climb.log.length; run(150, {}, [rel('hand', 1)]); const H = sim.climb.hands[1], trail = [];
  for (let s = 0; s < 300; s++) { run(1, {}, s ? [] : [hand(1, AR)]); if (s % 20 === 0 || H.st !== 'reach') trail.push(`${s}:${H.st}${H.st === 'reach' ? ' 남은 ' + (H.w.distanceTo(H.goal) * 100).toFixed(1) + 'cm 어깨→목표 ' + (sim.climb.T.sh[1].distanceTo(H.goal) * 100).toFixed(1) + (H.blockT > 0 ? ' 턱막힘' + H.blockT.toFixed(2) : '') + (H.selfBlock ? ' 몸' : '') + (H.armCross ? ' 팔' : '') + (H.headTouch ? ' 머리' : '') + (H.swivel ? ' 돔' : '') + ' wait' + (H.wait || 0).toFixed(2) : ''}`); if (H.st !== 'reach' && s > 2) break; }
  console.log('D2 되돌려 잡기:', logFrom(k1).join(' | '), '|', st()); console.log('   손의 길:', trail.join(' · ')); }
if (ONLY.includes('D3')) for (const w of [240, 120]) { start([-0.9, 0, -2.58]); run(150, {}, [hand(0, A.L)]); run(150, {}, [hand(1, A.R)]); const k0 = sim.climb.log.length; run(260, {}, [foot(1, [-0.3, 0.5, -2.93])]);
  const y0 = sim.body.pos.y; run(w, { cy: 1 }); const y1 = sim.body.pos.y, K = sim.climb, i = 1, leg = K.T.hj[i].distanceTo(K.feet[i].ank) / DIM.leg;
  const sh = K.T.sh[1].clone(), dF = sh.distanceTo(new THREE.Vector3(...F)); run(1, { cy: 1 }, [hand(1, F)]); for (let q = 0; q < 370; q++) run(1, q < 220 ? { cy: 1 } : {});
  console.log(`D3 W ${w}걸음: 오른 높이 ${((y1 - y0) * 100).toFixed(1)}cm · 디딘 다리 길이비 ${leg.toFixed(2)} · 오른 어깨→턱 F ${(dF * 100).toFixed(1)}cm(팔 ${((DIM.upperArm + DIM.foreArm) * 100).toFixed(1)} + 손바닥 8) | ${logFrom(k0).join(' | ')} | ${st()}`); }
