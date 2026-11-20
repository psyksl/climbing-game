// B4 확인: 손 조작 2(누르는 동안 뻗기)로 턱의 아래·위 벽면을 번갈아 겨눠, 뻗는 손이 턱을 가로질러 가게 한다(스크립트 입력, 사람 손 아님).
// 재는 것: 손목(반지름 1.5cm 공)과 팔뚝(팔꿈치~손목의 세 점, 반지름 3cm)이 벽·턱 안에 들어가 있던 걸음 수와 가장 깊이, 한 걸음 사이에 손목이 지형을 건너뛴 횟수.
// 사용: node test/reach_sweep.mjs [src가 있는 폴더(기본 = 이 저장소의 proto3d)]   고치기 전과 견줄 때 옛 src 폴더를 준다
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import * as THREE from 'three';
const P3 = process.argv[2] || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), imp = f => import(pathToFileURL(path.join(P3, 'src', f)).href);
const { buildCharacter } = await imp('rig.js'), { makeWorld, rayHit } = await imp('world.js'), { makeSim } = await imp('sim.js');
const rig = buildCharacter(), sim = makeSim(rig, makeWorld(), null), W = sim.world; sim.reset({ pos: [-0.9, 0, -2.58], yaw: Math.PI });
const run = (n, inp = {}, cmd = null) => { for (let i = 0; i < n; i++) sim.step({ mx: 0, mz: 0, ...inp, cmd: i === 0 && cmd ? cmd : [] }); };
const depth = (q, r) => { let d = 0; for (const x of W.boxes) { if (x.kind === 'floor') continue; const m = Math.min(q.x - x.min.x, x.max.x - q.x, q.y - x.min.y, x.max.y - q.y, q.z - x.min.z, x.max.z - q.z) + r; if (m > d) d = m; } return d; };
run(30); run(150, {}, [{ type: 'hand', i: 0, p: [-1.1, 1.92, -2.84] }]);
const pts = [[-0.78, 1.55, -3.0], [-0.78, 2.25, -3.0], [-0.95, 1.5, -3.0], [-0.6, 2.3, -3.0], [-0.78, 2.03, -3.0], [-0.5, 1.6, -3.0], [-0.72, 2.06, -3.0]]; let wrist = 0, fore = 0, deepW = 0, deepF = 0, tunnel = 0, steps = 0, prev = null;
run(1, { reach: [null, pts[0]] }, [{ type: 'hand', i: 1, p: pts[0], hold: true }]);
for (let k = 0; k < 840; k++) { run(1, { reach: [null, pts[Math.floor(k / 60) % pts.length]] }); const h = sim.climb.hands[1]; if (h.st !== 'reach') break; steps++;
  const w = rig.bones['hand.R'].getWorldPosition(new THREE.Vector3()), e = rig.bones['foreArm.R'].getWorldPosition(new THREE.Vector3());
  const dw = depth(h.w, 0) , df = Math.max(...[0.2, 0.4, 0.6, 0.8].map(t => depth(e.clone().lerp(w, t), 0.03)));
  if (dw > 0.002) { wrist++; deepW = Math.max(deepW, dw); } if (df > 0.002) { fore++; deepF = Math.max(deepF, df); }
  if (prev && rayHit(W, prev, h.w) < 1 && depth(prev, 0) <= 0.002 && depth(h.w, 0) <= 0.002) tunnel++; prev = h.w.clone(); }
const ok = steps > 600 && wrist === 0 && fore === 0 && tunnel === 0 && sim.climb.hands[0].st === 'hold';
console.log(`${ok ? 'PASS' : 'FAIL'}  뻗는 손이 턱을 가로질러도 손목·팔뚝이 지형에 들어가지 않고 건너뛰지 않으며 잡고 있던 왼손은 그대로다 · 뻗은 걸음 ${steps} · 손목이 지형 안에 있던 걸음 ${wrist}(가장 깊이 ${(deepW * 100).toFixed(1)}cm) · 팔뚝(반지름 3cm)이 지형에 겹친 걸음 ${fore}(가장 깊이 ${(deepF * 100).toFixed(1)}cm) · 한 걸음에 지형을 건너뛴 횟수 ${tunnel} · 왼손 ${sim.climb.hands[0].st}`);

process.exit(ok ? 0 : 1);
