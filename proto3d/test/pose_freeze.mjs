// 굳은 정도 점검(진단용. 통과·실패를 가르지 않는다). 스크립트 입력이며 사람 손이 아니다.
// 벽 장면마다 뼈의 제자리 회전이 처음 자세에서 얼마나 변하는지(도)와, 한 걸음에 가장 크게 변한 양을 적는다.
// 0에 가까운 뼈 = 그 장면에서 굳어 있는 뼈. 이 숫자는 자연스러움의 증거가 아니라 "무엇이 전혀 움직이지 않는가"를 보는 도구다. 모든 뼈가 움직여야 한다는 기준이 아니다(제자리 회전이 0이어도 부모를 따라 세계에서는 움직인다).
// 사용: node test/pose_freeze.mjs   캡처 동작으로: MODE=clip (assets_local/clips.json이 있을 때)
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import * as THREE from 'three';
const HERE = path.dirname(fileURLToPath(import.meta.url)), P3 = path.resolve(HERE, '..'), imp = f => import(pathToFileURL(path.join(P3, 'src', f)).href);
const { buildCharacter } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js'), { limbState } = await imp('climb.js');
const CLP = path.join(P3, 'assets_local/clips.json'), useClip = process.env.MODE === 'clip' && fs.existsSync(CLP), clips = useClip ? JSON.parse(fs.readFileSync(CLP, 'utf8')) : null;
const rig = buildCharacter(); let sim, track = null;
const start = pos => { sim = makeSim(rig, makeWorld(), clips); sim.reset({ pos, yaw: Math.PI }); run(30); };
function run(n, inp = {}, cmd = null) { for (let i = 0; i < n; i++) { sim.step({ mx: 0, mz: 0, ...inp, cmd: i === 0 && cmd ? cmd : [] }); if (track) track(); } }
const hand = (i, p) => ({ type: 'hand', i, p }), foot = (i, p) => ({ type: 'foot', i, p }), rel = (limb, i) => ({ type: 'release', limb, i });
const A = { L: [-1.1, 1.92, -2.84], R: [-0.7, 1.92, -2.84] }, B = { L: [0.5, 2.32, -2.86], R: [0.9, 2.32, -2.86] };
const hangB = () => { start([0.7, 0, -2.65]); run(1, { jump: true }, [hand(0, B.L), hand(1, B.R)]); run(59, { jump: true }); run(400); };
function measure(name, fn) {
  const ref = new Map(), max = new Map(), prev = new Map(), step = new Map(); let tiltMax = 0, n = 0; const up = new THREE.Vector3(0, 1, 0);
  // 제자리(국소) 회전과 따로: 뼈가 세계에서 가리키는 방향의 한 걸음 변화(비틀림 제외)와 손발 끝점의 한 걸음 이동, 접촉 오차(GPT 6.3: 국소 회전·세계 방향·끝점·접촉 오차를 구분)
  const dirP = new Map(), posP = new Map(); let dirMax = 0, dirWho = '', endMax = 0, endWho = ''; sim.climb.stats.palmErr = 0; sim.climb.stats.footErr = 0;
  track = () => { n++; for (const b of rig.list) { if (!ref.has(b.name)) { ref.set(b.name, b.quaternion.clone()); prev.set(b.name, b.quaternion.clone()); max.set(b.name, 0); step.set(b.name, 0); } else { max.set(b.name, Math.max(max.get(b.name), ref.get(b.name).angleTo(b.quaternion) * 180 / Math.PI)); step.set(b.name, Math.max(step.get(b.name), prev.get(b.name).angleTo(b.quaternion) * 180 / Math.PI)); prev.get(b.name).copy(b.quaternion); } }
    for (const b of rig.list) { const d = new THREE.Vector3(0, 1, 0).applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion())); if (dirP.has(b.name)) { const a = dirP.get(b.name).angleTo(d) * 180 / Math.PI; if (a > dirMax) { dirMax = a; dirWho = b.name; } } dirP.set(b.name, d); }
    for (const nm of ['hand.L', 'hand.R', 'foot.L', 'foot.R']) { const p = rig.bones[nm].getWorldPosition(new THREE.Vector3()); if (posP.has(nm)) { const a = posP.get(nm).distanceTo(p); if (a > endMax) { endMax = a; endWho = nm; } } posP.set(nm, p); }
    const q = rig.bones.hips.getWorldQuaternion(new THREE.Quaternion()); tiltMax = Math.max(tiltMax, new THREE.Vector3(0, 1, 0).applyQuaternion(q).angleTo(up) * 180 / Math.PI); };
  fn(); track = null;
  const rows = [...max.entries()].map(([k, v]) => [k, +v.toFixed(1)]);
  console.log(`\n== ${name} (${(n / 120).toFixed(2)}초) · 골반이 세로에서 기운 최대 ${tiltMax.toFixed(1)}°`);
  console.log('  변함(>3°): ' + rows.filter(r => r[1] > 3).map(r => `${r[0]} ${r[1]}`).join(', '));
  console.log('  거의 굳음(≤3°): ' + rows.filter(r => r[1] <= 3).map(r => `${r[0]} ${r[1]}`).join(', '));
  console.log(`  한 걸음 최대 — 세계 방향 ${dirMax.toFixed(1)}°(${dirWho}) · 손발 끝점 ${(endMax * 100).toFixed(1)}cm(${endWho}) · 접촉 오차: 손바닥 ${(sim.climb.stats.palmErr * 1000).toFixed(2)}mm, 발 ${(sim.climb.stats.footErr * 1000).toFixed(2)}mm`);
  const pops = [...step.entries()].filter(r => r[1] > 20).map(r => `${r[0]} ${r[1].toFixed(0)}`);
  if (pops.length) console.log('  한 걸음(1/120초)에 20° 넘게 돈 뼈: ' + pops.join(', '));
}
console.log('모션 = ' + (useClip ? '캡처' : '자작') + ' · 뼈 ' + rig.list.length + '개: ' + rig.list.map(b => b.name).join(' '));
hangB(); measure('두 손 매달려 제때 흔들기 4초', () => { for (let k = 0; k < 480; k++) { const vx = sim.body.vel.x; run(1, { cxSign: 1, cx: vx > 0.003 ? 1 : vx < -0.003 ? -1 : 1 }); } });
hangB(); measure('매달린 채 뛰기(Space 1.25초)', () => run(150, { jump: true }));
start([-0.9, 0, -2.58]); run(150, {}, [hand(0, A.L)]); run(150, {}, [hand(1, A.R)]); run(200, {}, [foot(1, [-0.30, 0.5, -2.93])]); run(240);
measure('발판을 디디고 뛰기(1.25초)', () => run(150, { jump: true }));
start([-0.9, 0, -2.58]); run(150, {}, [hand(0, A.L)]); run(150, {}, [hand(1, A.R)]);
measure('두 발 바닥 · 두 손 턱 A에서 몸 왼쪽 1초 → 오른쪽 1초', () => { run(120, { cxSign: 1, cx: -1 }); run(120, { cxSign: 1, cx: 1 }); });
hangB(); measure('두 손을 놓고 떨어져 내려섬(1.5초)', () => { run(1, {}, [rel('hand', 0), rel('hand', 1)]); run(180); });
hangB(); measure('한 손을 놓고 매달림(2초)', () => { run(1, {}, [rel('hand', 0)]); run(240); });
start([-0.9, 0, -2.58]); measure('서서 왼손으로 턱 A 잡기(1.25초)', () => run(150, {}, [hand(0, A.L)]));
