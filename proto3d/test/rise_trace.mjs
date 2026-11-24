// 몸 위로(W) 동안 엉덩이가 오르는 빠르기를 무엇이 막는가: 걸음마다 기준 자리(ref)와 몸의 차, 몸의 오르는 빠르기, 손발의 수직 힘(몸무게 배), 다리 펴짐(고관절–발목 / 다리 길이), 손 하중
// 사용: node test/rise_trace.mjs [장면 번호들: f1,f2,h1]  (POSTURE=fb 화면 기본). 진단 — 통과·실패 없음. 스크립트 입력(사람 손 아님)
import { prov, provLine } from './provenance.mjs';
const __P = prov(); console.log(provLine(__P));
const R = new URL('../', import.meta.url).pathname, THREE = await import('three');
const { buildCharacter, DIM } = await import(R + 'src/rig.js'), { makeWorld } = await import(R + 'src/world.js'), { makeSim } = await import(R + 'src/sim.js'), { CL } = await import(R + 'src/climb.js');
const { SCENES_FOOT, SCENES_H, START } = await import('./scenes_foot.mjs');
const pick = { f1: SCENES_FOOT[0], f2: SCENES_FOOT[1], h1: SCENES_H[0] }, ids = (process.argv[2] || 'f1,f2,h1').split(','), V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const out = {};
for (const id of ids) { const [title, fn, assist, , st0] = pick[id];
  const rig = buildCharacter(), sim = makeSim(rig, makeWorld(), null); sim.reset({ pos: st0 || START, yaw: Math.PI }); sim.opt.wallRest = false; sim.opt.footAssist = !!assist; if (process.env.VARIANT) sim.opt.posture = process.env.VARIANT;
  const inputs = [], put = (inp = {}, cmd = []) => inputs.push({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd }), rep = (n, inp, cmd) => { for (let i = 0; i < n; i++) put(inp, i ? [] : cmd); }; fn(sim, put, rep);
  const w0 = inputs.findIndex(x => x.cy > 0); let w1 = w0; while (w1 < inputs.length && inputs[w1].cy > 0) w1++;
  console.log(`\n■ ${id} ${title.slice(0, 50)} · W ${((w1 - w0) / 120).toFixed(2)}초 (걸음 ${w0}~${w1})`);
  console.log('   시각   몸y   몸vy  ref−몸y  엉덩이vy | 손 수직힘(배)  발 수직힘(배)  | 다리 펴짐(L,R)  발 상태');
  const BW = 9.81 * (CL.MASS || 70); let prevHip = null; const rows = [];
  for (let k = 0; k < Math.min(inputs.length, w1 + 60); k++) { sim.step(inputs[k]); rig.root.updateMatrixWorld(true); const K = sim.climb, b = sim.body;
    const hip = rig.bones.hips.getWorldPosition(V()), hv = prevHip ? (hip.y - prevHip) * 120 : 0; prevHip = hip.y;
    if (k < w0 - 12 || !K.on) continue;
    const hf = K.hands.map(h => (h.st === 'hold' && h.F ? h.F.y : 0)), ff = K.feet.map(f => (f.st === 'plant' && f.F ? f.F.y : 0));
    const ext = K.feet.map((f, i) => (f.st === 'plant' && K.T && f.ank ? (K.T.hj[i].distanceTo(f.ank) / CL.LEG) : null));
    const r = { t: (k - w0) / 120, y: b.pos.y, vy: b.vel.y, e: K.ref.y - b.pos.y, hv, hf, ff, ext, fs: K.feet.map(f => f.st + (f.box ? ':' + f.box.kind : '')) }; rows.push(r);
    if ((k - w0) % 6 === 0) console.log(`  ${r.t.toFixed(2).padStart(5)}  ${r.y.toFixed(3)}  ${r.vy.toFixed(2).padStart(5)}  ${r.e.toFixed(3).padStart(6)}  ${hv.toFixed(2).padStart(6)} | ${hf.map(x => (x / BW).toFixed(2)).join(' ')}   ${ff.map(x => (x / BW).toFixed(2)).join(' ')}  | ${ext.map(x => (x === null ? '  -  ' : x.toFixed(3))).join(' ')}  ${r.fs.join(' ')}`);
  }
  const win = rows.filter(r => r.t >= 0 && r.t <= (w1 - w0) / 120);
  out[id] = { 몸_최고_vy: Math.max(...win.map(r => r.vy)), 엉덩이_최고_vy: Math.max(...win.map(r => r.hv)), 오른_높이: win[win.length - 1].y - win[0].y };
  console.log(`  → W 동안 몸 최고 초속 ${out[id].몸_최고_vy.toFixed(2)}m · 엉덩이 뼈 최고 ${out[id].엉덩이_최고_vy.toFixed(2)}m · 오른 높이 ${out[id].오른_높이.toFixed(3)}m`);
}
