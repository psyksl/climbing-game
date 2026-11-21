// 뻗는 팔뚝의 중심선이 제 머리·가슴에 드는 걸음을 장면별로 적는다(진단용 — 통과·실패 없음. p3d-0.8.5). 스크립트 입력이며 사람 손이 아니다
//   어디가 드는지(팔뚝의 어느 몫, 머리/가슴), 그때의 손목·팔꿈치·어깨·몸 자리, 손목 자체가 몸 안인지를 적는다.   사용: node test/self_diag.mjs
import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url'; import fs from 'fs'; import * as THREE from 'three';
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src'), imp = f => import(pathToFileURL(path.join(SRC, f)).href);
const { buildCharacter, DIM } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js'), { _dbg } = await imp('climb.js'), { twoBone } = await imp('ik.js');
const rig = buildCharacter(), HR = DIM.headR; let sim;
const run = (n, inp = {}, cmd = null) => { for (let i = 0; i < n; i++) sim.step({ mx: 0, mz: 0, ...inp, cmd: i === 0 && cmd ? cmd : [] }); };
const AL = [-1.1, 1.92, -2.84], AR = [-0.7, 1.92, -2.84], pts = [[-0.78, 1.55, -3.0], [-0.78, 2.25, -3.0], [-0.95, 1.5, -3.0], [-0.6, 2.3, -3.0], [-0.78, 2.03, -3.0], [-0.5, 1.6, -3.0], [-0.72, 2.06, -3.0]], P = k => pts[Math.floor(k / 60) % pts.length];
const holdL = () => { run(30); run(150, {}, [{ type: 'hand', i: 0, p: AL }]); }, both = () => { holdL(); run(150, {}, [{ type: 'hand', i: 1, p: AR }]); };
const inv = new THREE.Matrix4(), f = v => v.toArray().map(x => (x * 100).toFixed(0)).join(',');
const loc = (p, bone, c) => p.clone().applyMatrix4(inv.copy(rig.bones[bone].matrixWorld).invert()).sub(new THREE.Vector3(...c));
const dHead = p => { const l = loc(p, 'head', [0, HR * 0.9, 0.01]); return (1 - Math.hypot(l.x / (HR * 0.9), l.y / (HR * 1.05), l.z / HR)) * HR * 0.9; };
const dChest = p => { const l = loc(p, 'chest', [0, 0.11, 0.005]); return Math.min(0.18 - Math.abs(l.x), 0.12 - Math.abs(l.y), 0.105 - Math.abs(l.z)); };
function scene(name, setup, step, steps) { sim = makeSim(rig, makeWorld(), null); sim.reset({ pos: [-0.9, 0, -2.58], yaw: Math.PI }); setup(); let last = -99, n = 0;
  for (let k = 0; k < steps; k++) { const s = step(k); run(1, s.inp, s.cmd); const H = sim.climb.hands[1]; if (H.st !== 'reach') continue; rig.root.updateMatrixWorld(true);
    const a = rig.bones['foreArm.R'].getWorldPosition(new THREE.Vector3()), w = rig.bones['hand.R'].getWorldPosition(new THREE.Vector3()); let worst = 0, what = '', wt = 0;
    for (let j = 0; j <= 8; j++) { const p = a.clone().lerp(w, j / 8), h = dHead(p), c = dChest(p); if (h > worst) { worst = h; what = '머리'; wt = j / 8; } if (c > worst) { worst = c; what = '가슴'; wt = j / 8; } }
    if (worst > 0.001) { n++; if (k - last > 25) { last = k; const T = sim.climb.T; if (process.env.RING) { const sh = T.sh[1], tg = H.w, u = tg.clone().sub(sh).normalize(), e0 = new THREE.Vector3(0, 1, 0).addScaledVector(u, -u.y).normalize(), e1 = u.clone().cross(e0), row = [];
        for (let j = 0; j < 12; j++) { const a2 = j * Math.PI / 6, pl = e0.clone().multiplyScalar(Math.cos(a2)).addScaledVector(e1, Math.sin(a2)), ik = twoBone(sh, tg, DIM.upperArm, DIM.foreArm, pl), th = _dbg.armHit(sim.world, sh, ik, null); let sd = 0; for (let q = 0; q <= 8; q++) { const pp = ik.mid.clone().lerp(ik.end, q / 8); sd = Math.max(sd, dHead(pp), dChest(pp)); }
          row.push(`${j * 30}°(${f(ik.mid)}) 지형 ${th ? (th.d * 100).toFixed(1) : 0}${th && th.f ? 'f' : th ? 'u' : ''} 몸 ${(Math.max(0, sd) * 100).toFixed(1)}`); }
        console.log('     어깨–손목 ' + (sh.distanceTo(tg) * 100).toFixed(0) + 'cm · 팔꿈치 고리(위에서부터 30°씩): ' + row.join(' | ')); } console.log(`  ${name} k${k} 목표 ${P(k).map(v => (v * 100).toFixed(0)).join(',')} ${what} ${(worst * 100).toFixed(1)}cm @팔뚝 ${wt} | 손목 ${f(w)} 팔꿈치 ${f(a)} 어깨 ${f(T.sh[1])} 가슴 ${f(T.chest)} 머리 ${f(T.head)} 몸 ${f(sim.body.pos)} | 손목의 머리 ${(dHead(w) * 100).toFixed(0)} 가슴 ${(dChest(w) * 100).toFixed(0)} 팔꿈치의 가슴 ${(dChest(a) * 100).toFixed(0)} 입력 ${JSON.stringify(s.inp.cy !== undefined ? [s.inp.cy, s.inp.cx] : s.inp.cx)}`); } } }
  console.log(`${name}: 들어간 걸음 ${n}`); }
const drag = (i, p) => [{ type: 'hand', i, p, hold: true }], R = (i, p) => (i ? [null, p] : [p, null]);
scene('③', holdL, k => ({ inp: { reach: R(1, P(k)), cy: [1, -1, 0, 0][Math.floor(k / 48) % 4], cx: [0, 0, -1, 1][Math.floor(k / 48) % 4] }, cmd: k === 0 ? drag(1, P(0)) : null }), 840);
scene('⑥', () => { both(); run(200, { cy: 1 }); run(1, {}, [{ type: 'release', limb: 'hand', i: 1 }]); run(40); }, k => ({ inp: { reach: R(1, P(k)), cx: sim.body.vel.x > 0 ? 1 : -1 }, cmd: k === 0 ? drag(1, P(0)) : null }), 600);
scene('②', holdL, k => ({ inp: { reach: R(1, P(k)) }, cmd: k === 0 ? drag(1, P(0)) : null }), 840);
scene('④', () => { both(); run(150, { cy: 1 }); }, k => ({ inp: { reach: R(1, P(k)), cy: 1 }, cmd: k === 0 ? drag(1, P(0)) : null }), 600);

// ── 팔 교차·몸 앞을 가로지르는 길(손 조작 1, p3d-0.8.5): 결과(잡음/거부와 까닭), 팔뚝 줄기가 몸에 든 걸음, 손목 표면(반지름 3.6cm)이 머리·가슴에 든 가장 깊은 깊이, 두 팔뚝 줄기 사이의 가장 가까운 거리
const segDist = (a0, a1, b0, b1) => { let m = 9; for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) m = Math.min(m, a0.clone().lerp(a1, i / 8).distanceTo(b0.clone().lerp(b1, j / 8))); return m; };
function cross(name, setup, cmds, i) { sim = makeSim(rig, makeWorld(), null); sim.reset({ pos: [-0.9, 0, -2.58], yaw: Math.PI }); setup(); const out = []; const sd = i ? 'R' : 'L', od = i ? 'L' : 'R';
  for (const [p, n] of cmds) { const k0 = sim.climb.log.length; let self = 0, wrist = 0, arms = 9, seen = 0, deep = 0, what = '', near = 0;
    for (let k = 0; k < n; k++) { run(1, {}, k === 0 ? [{ type: 'hand', i, p }] : null); if (sim.climb.hands[i].st !== 'reach') continue; seen++; rig.root.updateMatrixWorld(true);
      const a = rig.bones[`foreArm.${sd}`].getWorldPosition(new THREE.Vector3()), w = rig.bones[`hand.${sd}`].getWorldPosition(new THREE.Vector3()), a2 = rig.bones[`foreArm.${od}`].getWorldPosition(new THREE.Vector3()), w2 = rig.bones[`hand.${od}`].getWorldPosition(new THREE.Vector3());
      let worst = 0; for (let j = 0; j <= 8; j++) { const q = a.clone().lerp(w, j / 8), h = dHead(q), c = dChest(q); if (h > worst) { worst = h; what = '머리'; } if (c > worst) { worst = c; what = '가슴'; } } if (worst > 0.001) { self++; deep = Math.max(deep, worst); }
      wrist = Math.max(wrist, dHead(w) + 0.036, dChest(w) + 0.036); { const sdist = segDist(a, w, a2, w2); arms = Math.min(arms, sdist); if (sdist < 0.04) near++; } }
    const ev = sim.climb.log.slice(k0).filter(e => e.limb === 'hand' && e.i === i && e.type !== 'try').map(e => e.type + (e.why ? '(' + e.why + ')' : '') + (e.box ? ' ' + e.box : '')).join(' → ');
    let heldGap = ''; if (sim.climb.hands.every(h => h.st === 'hold')) { rig.root.updateMatrixWorld(true); const g = n => rig.bones[n].getWorldPosition(new THREE.Vector3()); heldGap = ` · 잡은 채 두 팔뚝 줄기 사이 ${(segDist(g('foreArm.L'), g('hand.L'), g('foreArm.R'), g('hand.R')) * 100).toFixed(1)}cm`; }
    out.push(`[${p.map(v => (v * 100).toFixed(0)).join(',')}] ${ev || '사건 없음'} · 뻗은 걸음 ${seen} · 팔뚝 줄기가 몸에 든 걸음 ${self}${self ? `(${what} ${(deep * 100).toFixed(1)}cm)` : ''} · 손목 표면–몸 ${wrist > 0 ? (wrist * 100).toFixed(1) + 'cm 겹침' : '겹치지 않음'} · 두 팔뚝 줄기 사이 가장 가까이 ${(arms * 100).toFixed(1)}cm(4cm 안 ${near}걸음)${heldGap}`); }
  console.log(`${name}\n   ` + out.join('\n   ')); }
const XL = [-1.38, 1.92, -2.84], XR = [-0.72, 1.92, -2.84], FF = [-0.3, 2.15, -2.86];
cross('X5 두 손으로 턱 A → 오른손을 왼손 15cm 너머로(가까운 교차) → 되돌리기', both, [[[-1.25, 1.92, -2.84], 260], [AR, 200]], 1);
cross('X6 오른손만 잡고 선 채 → 왼손을 오른손 15cm 너머로(가까운 교차) → 되돌리기', () => { run(30); run(150, {}, [{ type: 'hand', i: 1, p: [-0.95, 1.92, -2.84] }]); }, [[[-0.80, 1.92, -2.84], 260], [[-1.2, 1.92, -2.84], 200]], 0);
cross('X7 당겨 올라가 오른손을 놓고(한 손 매달림) → 오른손을 왼손 15cm 너머로 → 되돌리기', () => { both(); run(200, { cy: 1 }); run(60, {}, [{ type: 'release', limb: 'hand', i: 1 }]); }, [[[-1.25, 1.92, -2.84], 260], [AR, 200]], 1);
cross('X1 두 손으로 턱 A → 오른손을 왼손 너머로(교차) → 되돌리기', both, [[XL, 200], [AR, 200]], 1);
cross('X2 왼손만 잡고 선 채(오른손은 늘어뜨림) → 오른손을 왼손 너머로 → 되돌리기', holdL, [[XL, 200], [AR, 200]], 1);
cross('X3 당겨 올라가 오른손을 놓고(한 손 매달림) → 오른손을 왼손 너머로 → 턱 A 오른쪽으로', () => { both(); run(200, { cy: 1 }); run(60, {}, [{ type: 'release', limb: 'hand', i: 1 }]); }, [[XL, 200], [AR, 200]], 1);
cross('X4 오른손만 잡고 선 채 → 왼손을 오른손 너머로(교차) → 되돌리기', () => { run(30); run(150, {}, [{ type: 'hand', i: 1, p: [-0.95, 1.92, -2.84] }]); }, [[[-0.68, 1.92, -2.84], 200], [[-1.2, 1.92, -2.84], 200]], 0);
