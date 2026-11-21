// 엇갈려 잡은 끝 자세에서 두 팔의 팔꿈치 방향 576가지(24 × 24)를 다 돌려 보고, 지형·몸에 걸리지 않는 조합 가운데 팔–팔 겹침(굵기 기준)이 가장 작은 것을 찾는다(진단용 — p3d-0.8.6. 통과·실패 없음)
//   "길이 정말 없는가, 찾는 방법이 모자란가"를 가르는 데 쓴다. 멈춤 규칙을 끄고(NOARMSTOP) 끝 자세까지 간 뒤에 잰다.   사용: node test/cross_feasible.mjs   SC=2(한 손 매달림) · TX=-0.62(다 편 교차) · XTW=-1(가슴 비틀기 반대)
import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url'; import * as THREE from 'three';
const HERE = path.dirname(fileURLToPath(import.meta.url)), SRC = path.resolve(HERE, '../src'), imp = f => import(pathToFileURL(path.join(SRC, f)).href);
const { buildCharacter, DIM } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js'), { _dbg } = await imp('climb.js'), { twoBone } = await imp('ik.js');
globalThis.XTW = +(process.env.XTW || 1); globalThis.NOARMSTOP = 1;
const rig = buildCharacter(), sim = makeSim(rig, makeWorld(), null); sim.reset({ pos: [-0.9, 0, -2.58], yaw: Math.PI }); const f = v => v.toArray().map(x => (x * 100).toFixed(0)).join(',');
const run = (n, cmd = null) => { for (let i = 0; i < n; i++) sim.step({ mx: 0, mz: 0, cmd: i === 0 && cmd ? cmd : [] }); };
const tgt = [+(process.env.TX || -0.70), 1.92, -2.84];
run(30); if (process.env.SC === '2') { run(150, [{ type: 'hand', i: 0, p: [-1.1, 1.92, -2.84] }]); run(150, [{ type: 'hand', i: 1, p: [-0.7, 1.92, -2.84] }]); for (let i = 0; i < 200; i++) sim.step({ mx: 0, mz: 0, cy: 1, cmd: [] }); run(60, [{ type: 'release', limb: 'hand', i: 1 }]); run(400, [{ type: 'hand', i: 1, p: [-1.25, 1.92, -2.84] }]); }
else { run(220, [{ type: 'hand', i: 1, p: [-0.85, 1.92, -2.84] }]); run(400, [{ type: 'hand', i: 0, p: tgt }]); }
const K = sim.climb, T = K.T; console.log('손', K.hands.map(h => h.st).join('/'), 'twist', K.pz.twist.toFixed(2), '어깨 L', f(T.sh[0]), 'R', f(T.sh[1]), '손목 L', f(K.hands[0].goal), 'R', f(K.hands[1].goal), '어깨–손목 L', (T.sh[0].distanceTo(K.hands[0].goal) * 100).toFixed(0), 'R', (T.sh[1].distanceTo(K.hands[1].goal) * 100).toFixed(0));
if (K.hands.every(h => h.st === 'hold')) { const ring = (sh, g) => { const u = g.clone().sub(sh).normalize(), e0 = new THREE.Vector3(0, 1, 0).addScaledVector(u, -u.y).normalize(), e1 = u.clone().cross(e0); return Array.from({ length: 24 }, (_, j) => twoBone(sh, g, DIM.upperArm, DIM.foreArm, e0.clone().multiplyScalar(Math.cos(j * Math.PI / 12)).addScaledVector(e1, Math.sin(j * Math.PI / 12)))); };
  const RL = ring(T.sh[0], K.hands[0].goal), RR = ring(T.sh[1], K.hands[1].goal), B = _dbg.selfShapes(sim, -1);
  const cap = (a0, a1, ra0, ra1, b0, b1, rb0, rb1) => { let m = -9; for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) m = Math.max(m, ra0 + (ra1 - ra0) * i / 10 + rb0 + (rb1 - rb0) * j / 10 - a0.clone().lerp(a1, i / 10).distanceTo(b0.clone().lerp(b1, j / 10))); return m; };
  const ov = (L, R) => Math.max(cap(L.mid, L.end, .045, .036, R.mid, R.end, .045, .036), cap(L.mid, L.end, .045, .036, T.sh[1], R.mid, .055, .045), cap(R.mid, R.end, .045, .036, T.sh[0], L.mid, .055, .045));
  const bad = (ik, sh, box) => { const th = _dbg.armHit(sim.world, sh, ik, box), sf = _dbg.armSelf(B, ik, sh); return Math.max(th && th.f ? th.f.d : 0, sf && sf.body ? sf.body.d : 0); };
  let best = null, n0 = 0; RL.forEach((L, a) => RR.forEach((R, c) => { const o = ov(L, R), bl = bad(L, T.sh[0], K.hands[0].edge.box), br = bad(R, T.sh[1], K.hands[1].edge.box); if (bl < 0.004 && br < 0.004) { n0++; if (!best || o < best.o) best = { o, a, c, L, R }; } }));
  console.log(`지형·몸에 걸리지 않는 팔꿈치 조합 ${n0}/576 · 그 가운데 팔–팔 겹침이 가장 작은 것 ${(best.o * 100).toFixed(1)}cm (왼 ${best.a * 15}° 팔꿈치 ${f(best.L.mid)} · 오른 ${best.c * 15}° 팔꿈치 ${f(best.R.mid)})`);
  const wp = n => rig.bones[n].getWorldPosition(new THREE.Vector3()); console.log('지금 그려진 팔꿈치 L', f(wp('foreArm.L')), 'R', f(wp('foreArm.R')), '겹침', (ov({ mid: wp('foreArm.L'), end: wp('hand.L') }, { mid: wp('foreArm.R'), end: wp('hand.R') }) * 100).toFixed(1)); }
