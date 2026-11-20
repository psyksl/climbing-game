// B4 확인: 뻗는 손·팔이 벽·턱을 지나가지 않는가(스크립트 입력, 사람 손 아님). 손 조작 2(누르는 동안 뻗기)와 1(눌러 보내기)을 여러 자세·움직이는 몸에서 본다.
// 재는 것(대리 형상. p3d-0.8.3: 그려지는 팔의 굵기로 — 팔뚝 4.5 → 3.6cm, 위팔 5.5 → 4.5cm. 모서리는 둥글게 잰다): 손목 = 가운데 점, 팔뚝 = 팔꿈치~손목의 여섯 점, 위팔 = 팔꿈치 쪽 세 점.
//   **실제 표면은 test/arm_mesh.mjs가 메시 정점으로 잰다.** 이 시험은 빠른 대리 검사다.
//   그림의 뼈 자리로 잰다(물리의 손목 자리와 그림이 어긋나면 그것도 잡힌다).
//   지형 안에 들어가 있던 걸음 수와 가장 깊이, 한 걸음 사이에 손목이 지형을 건너뛴 횟수. 잡은 손의 손목은 턱에 닿아 있으므로 뻗는 손(reach)만 잰다.
// 사용: node test/reach_sweep.mjs [src가 있는 폴더(기본 = 이 저장소의 proto3d)]   고치기 전과 견줄 때 옛 src 폴더를 준다
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import * as THREE from 'three';
const P3 = process.argv[2] || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), imp = f => import(pathToFileURL(path.join(P3, 'src', f)).href);
const { buildCharacter } = await imp('rig.js'), { makeWorld, rayHit } = await imp('world.js'), { makeSim } = await imp('sim.js');
const rig = buildCharacter(); let sim, W, fail = 0, pass = 0;
const start = () => { sim = makeSim(rig, makeWorld(), null); W = sim.world; sim.reset({ pos: [-0.9, 0, -2.58], yaw: Math.PI }); };
const run = (n, inp = {}, cmd = null) => { for (let i = 0; i < n; i++) sim.step({ mx: 0, mz: 0, ...inp, cmd: i === 0 && cmd ? cmd : [] }); };
// 공(반지름 r)이 상자에 겹친 깊이. 모서리는 둥글게 잰다(게임의 sphereBox와 같은 식)
const depth = (q, r) => { let d = 0; for (const x of W.boxes) { if (x.kind === 'floor') continue; const cx = Math.min(Math.max(q.x, x.min.x), x.max.x), cy = Math.min(Math.max(q.y, x.min.y), x.max.y), cz = Math.min(Math.max(q.z, x.min.z), x.max.z), o = Math.hypot(q.x - cx, q.y - cy, q.z - cz);
  const m = o > 1e-9 ? r - o : Math.min(q.x - x.min.x, x.max.x - q.x, q.y - x.min.y, x.max.y - q.y, q.z - x.min.z, x.max.z - q.z) + r; if (m > d) d = m; } return d; };
const wp = n => rig.bones[n].getWorldPosition(new THREE.Vector3());
// 한 장면: setup() 뒤 steps걸음 동안 매 걸음 step(k)가 입력을 주고, 뻗는 손(들)을 잰다
function scene(name, setup, step, steps, need = 0.5) {
  start(); setup(); const M = { n: 0, wrist: 0, fore: 0, upper: 0, dW: 0, dF: 0, dU: 0, tunnel: 0 }, prev = [null, null];
  for (let k = 0; k < steps; k++) { const s = step(k) || {}; run(1, s.inp || {}, s.cmd || null);
    sim.climb.hands.forEach((h, i) => { if (h.st !== 'reach') { prev[i] = null; return; } M.n++; const sd = i ? 'R' : 'L', sh = wp('upperArm.' + sd), e = wp('foreArm.' + sd), w = wp('hand.' + sd);
      const dw = depth(h.w, 0), df = Math.max(...[0.1, 0.25, 0.4, 0.55, 0.7, 0.85].map(t => depth(e.clone().lerp(w, t), 0.045 - 0.009 * t)), depth(w, 0)), du = Math.max(...[0.5, 0.7, 0.9].map(t => depth(sh.clone().lerp(e, t), 0.055 - 0.01 * t)));
      if (dw > 0.002) { M.wrist++; M.dW = Math.max(M.dW, dw); } if (df > 0.002) { M.fore++; M.dF = Math.max(M.dF, df); } if (du > 0.002) { M.upper++; M.dU = Math.max(M.dU, du); }
      if (prev[i] && rayHit(W, prev[i], h.w) < 1 && depth(prev[i], 0) <= 0.002 && dw <= 0.002) M.tunnel++; prev[i] = h.w.clone(); }); }
  const ok = M.n >= steps * need && M.wrist === 0 && M.fore === 0 && M.upper === 0 && M.tunnel === 0; if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} · 뻗은 걸음 ${M.n}/${steps} · 손목 ${M.wrist}걸음(${(M.dW * 100).toFixed(1)}cm) · 팔뚝 ${M.fore}걸음(${(M.dF * 100).toFixed(1)}cm) · 위팔 ${M.upper}걸음(${(M.dU * 100).toFixed(1)}cm) · 건너뜀 ${M.tunnel}`);
  return M;
}
const AL = [-1.1, 1.92, -2.84], AR = [-0.7, 1.92, -2.84];
const pts = [[-0.78, 1.55, -3.0], [-0.78, 2.25, -3.0], [-0.95, 1.5, -3.0], [-0.6, 2.3, -3.0], [-0.78, 2.03, -3.0], [-0.5, 1.6, -3.0], [-0.72, 2.06, -3.0]], P = k => pts[Math.floor(k / 60) % pts.length];
const holdL = () => { run(30); run(150, {}, [{ type: 'hand', i: 0, p: AL }]); }, both = () => { holdL(); run(150, {}, [{ type: 'hand', i: 1, p: AR }]); };
const drag = (i, p) => [{ type: 'hand', i, p, hold: true }], R = (i, p) => (i ? [null, p] : [p, null]);
// ① 0.8.1의 재현 조건: 왼손으로 턱 A를 잡고 서서, 오른손을 턱의 아래·위 벽면으로 번갈아 뻗는다
scene('① 서서 한 손 잡고, 다른 손을 턱 아래·위로(0.8.1의 조건)', holdL, k => ({ inp: { reach: R(1, P(k)) }, cmd: k === 0 ? drag(1, P(0)) : null }), 840, 0.7);
// ② 몸이 움직이는 중: 같은 뻗기를 하면서 몸을 위·아래·왼쪽·오른쪽으로 0.4초씩 옮긴다
scene('② 같은 뻗기 + 몸 옮기기(위·아래·왼쪽·오른쪽 0.4초씩)', holdL, k => ({ inp: { reach: R(1, P(k)), cy: [1, -1, 0, 0][Math.floor(k / 48) % 4], cx: [0, 0, -1, 1][Math.floor(k / 48) % 4] }, cmd: k === 0 ? drag(1, P(0)) : null }), 840, 0.7);
// ③ 당겨 올라간 높은 자세(가슴이 턱 가까이): 두 손으로 잡고 W로 올라간 뒤 오른손을 놓고 턱의 아래·위로 뻗는다
scene('③ 당겨 올라간 자세에서 한 손을 턱 아래·위로', () => { both(); run(150, { cy: 1 }); }, k => ({ inp: { reach: R(1, P(k)), cy: 1 }, cmd: k === 0 ? drag(1, P(0)) : null }), 600, 0.5);
// ④ 왼손으로 뻗기(좌우를 바꿔서)
scene('④ 오른손으로 잡고 왼손을 턱 아래·위로 + 몸 옮기기', () => { run(30); run(150, {}, [{ type: 'hand', i: 1, p: AR }]); }, k => { const p = P(k).slice(); p[0] = -1.8 - p[0]; return { inp: { reach: R(0, p), cy: [1, -1, 0, 0][Math.floor(k / 48) % 4], cx: [0, 0, 1, -1][Math.floor(k / 48) % 4] }, cmd: k === 0 ? drag(0, p) : null }; }, 840, 0.7);
// ⑤ 매달려 흔들리는 중(발이 떠 있음): 두 손으로 올라가 발을 띄운 뒤 한 손으로 흔들며 다른 손을 뻗는다
scene('⑤ 한 손 매달려 흔들며 다른 손을 턱 아래·위로', () => { both(); run(200, { cy: 1 }); run(1, {}, [{ type: 'release', limb: 'hand', i: 1 }]); run(40); }, k => ({ inp: { reach: R(1, P(k)), cx: sim.body.vel.x > 0 ? 1 : -1 }, cmd: k === 0 ? drag(1, P(0)) : null }), 600, 0.4);
// ⑥ 손 조작 1(눌러 보내기): 잡은 손 반대쪽 손을 여러 턱·벽면으로 0.5초마다 보낸다(닿지 않는 곳·턱 너머 포함). 몸도 옮긴다
{ const tg = [[-0.7, 1.92, -2.84], [-0.78, 2.25, -3.0], [-0.3, 2.12, -2.86], [-0.6, 1.5, -3.0], [-0.5, 2.78, -2.86], [-0.7, 1.92, -2.84]];
  scene('⑥ 손 조작 1: 한 손 잡고 다른 손을 0.5초마다 여러 곳으로 + 몸 옮기기', holdL, k => ({ inp: { cy: [1, -1, 0, 0][Math.floor(k / 48) % 4], cx: [0, 0, -1, 1][Math.floor(k / 48) % 4] }, cmd: k % 60 === 0 ? [{ type: 'release', limb: 'hand', i: 1 }, { type: 'hand', i: 1, p: tg[(k / 60) % tg.length] }] : null }), 720, 0.1); }
// ⑦ 땅에서 뛰어오르며 뻗기: 턱 아래에서 뛰는 동안 왼손을 턱 위 벽면으로 뻗는다(손이 턱을 아래에서 위로 지난다)
scene('⑦ 땅에서 뛰며 한 손을 턱 위 벽면으로(아래에서 위로 지나감)', () => run(30), k => ({ inp: { jump: k < 40, reach: R(0, [-1.0, 2.3, -3.0]) }, cmd: k === 10 ? drag(0, [-1.0, 2.3, -3.0]) : null }), 150, 0.2);
console.log(`통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
