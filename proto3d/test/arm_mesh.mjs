// 뻗는 팔의 "실제로 그려지는 표면"이 지형 안에 들어가는지 본다(GPT의 p3d-0.8.2 검토 P1-B. 스크립트 입력, 사람 손 아님).
// 확정된 뼈 자세에 스키닝을 적용한 메시 정점을 CPU에서 계산해, 뻗는 팔의 팔뚝·위팔 뼈의 영향을 받는 정점이 벽·턱 안에 얼마나 들어가 있는지 잰다(손 뼈의 정점은 뺀다 — 손은 턱에 닿는 것이 정상).
// 대리 형상(armHit) 검사가 0이어도 표면이 들어갈 수 있다는 반례(GPT: tick 291, 약 2.03cm)를 지키는 시험이다. 정점 수는 표면의 표본 수이지 면적·부피가 아니다.
// 사용: node test/arm_mesh.mjs [src가 있는 폴더]   캡처 동작으로: MODE=clip
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import * as THREE from 'three';
const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), P3 = process.argv[2] ? path.resolve(process.argv[2]) : HERE, imp = f => import(pathToFileURL(path.join(P3, 'src', f)).href);
const { buildCharacter, DIM, headEll } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js');
const CLP = path.join(HERE, 'assets_local/clips.json'), useClip = process.env.MODE === 'clip' && fs.existsSync(CLP), clips = useClip ? JSON.parse(fs.readFileSync(CLP, 'utf8')) : null;
const rig = buildCharacter(), G = rig.mesh.geometry, pos = G.attributes.position, si = G.attributes.skinIndex, sw = G.attributes.skinWeight;
// 팔뚝·위팔 뼈의 영향을 조금이라도(1% 넘게) 받는 정점 = 팔 통의 표면 전체(손목 끝의 둥근 마감 포함. 이 부분은 손 뼈의 몫이 더 커서 "절반 넘게"로 고르면 빠진다 — GPT의 가장 깊은 정점이 여기였다)
const vertsOf = names => { const ids = names.map(n => rig.list.findIndex(b => b.name === n)), out = []; for (let i = 0; i < pos.count; i++) { let hit = false; for (let j = 0; j < 4; j++) if (ids.includes(si.getComponent(i, j)) && sw.getComponent(i, j) > 0.01) hit = true; if (hit) out.push(i); } return out; };
// 팔뚝(손목 끝 포함)과 위팔을 따로 잰다. 팔꿈치 둘레의 정점은 두 뼈의 영향을 함께 받아 양쪽에 다 든다
const FORE = { L: vertsOf(['foreArm.L']), R: vertsOf(['foreArm.R']) }, UPPER = { L: vertsOf(['upperArm.L']), R: vertsOf(['upperArm.R']) };
let sim, W, fail = 0, pass = 0; const tmp = new THREE.Vector3();
const start = () => { sim = makeSim(rig, makeWorld(), clips); if (useClip) sim.useClip = true; W = sim.world; sim.reset({ pos: [-0.9, 0, -2.58], yaw: Math.PI }); };
const run = (n, inp = {}, cmd = null) => { for (let i = 0; i < n; i++) sim.step({ mx: 0, mz: 0, ...inp, cmd: i === 0 && cmd ? cmd : [] }); };
// 뻗는 팔(들)의 표면이 지형 안에 든 가장 깊은 깊이와 들어간 정점 수
function meshDepth(st = 'reach', SET = FORE) { rig.root.updateMatrixWorld(true); rig.skeleton.update(); let deep = 0, n = 0, where = '';
  sim.climb.hands.forEach((h, i) => { if (h.st !== st) return; for (const v of SET[i ? 'R' : 'L']) { rig.mesh.getVertexPosition(v, tmp); rig.mesh.localToWorld(tmp);
    for (const b of W.boxes) { if (b.kind === 'floor') continue; const d = Math.min(tmp.x - b.min.x, b.max.x - tmp.x, tmp.y - b.min.y, b.max.y - tmp.y, tmp.z - b.min.z, b.max.z - tmp.z); if (d > 0.001) { n++; if (d > deep) { deep = d; where = b.name; } } } } });
  return { deep, n, where }; }
// 뻗는 팔뚝의 **중심선**(팔꿈치–손목, 아홉 점)이 제 머리·가슴 안에 든 깊이(p3d-0.8.4, GPT의 p3d-0.8.3 검토: 뻗는 동안의 팔–몸 겹침). 표면으로 재면 팔을 몸 옆에 붙인 보통 자세도 걸린다(팔 통과 가슴 상자가 어깨에서 맞닿게 그려져 있다) — 그래서 중심선이 들어간 것만 센다. 표면은 그보다 팔뚝 반지름(3.6~4.5cm)만큼 더 들어가 있다. 머리 = rig.js의 머리 타원체(반지름 0.11 × (0.9, 1.05, 1)), 가슴 = 가슴 상자(0.36 × 0.24 × 0.21) — 그리는 메시와 같은 치수
const inv = new THREE.Matrix4(), lp = new THREE.Vector3(), HR = DIM.headR;
function selfDepth() { rig.root.updateMatrixWorld(true); let deep = 0, where = ''; const a = new THREE.Vector3(), w = new THREE.Vector3();
  sim.climb.hands.forEach((h, i) => { if (h.st !== 'reach') return; const sd = i ? 'R' : 'L'; rig.bones[`foreArm.${sd}`].getWorldPosition(a); rig.bones[`hand.${sd}`].getWorldPosition(w);
    for (let k = 0; k <= 8; k++) { tmp.copy(a).lerp(w, k / 8);
    lp.copy(tmp).applyMatrix4(inv.copy(rig.bones.head.matrixWorld).invert()).sub(new THREE.Vector3(...headEll().c)); { const E = headEll(), r = Math.hypot(lp.x / E.r[0], lp.y / E.r[1], lp.z / E.r[2]), d = (1 - r) * E.r[0]; if (d > deep) { deep = d; where = '머리'; } }
    lp.copy(tmp).applyMatrix4(inv.copy(rig.bones.chest.matrixWorld).invert()).sub(new THREE.Vector3(0, 0.11, 0.005)); { const d = Math.min(0.18 - Math.abs(lp.x), 0.12 - Math.abs(lp.y), 0.105 - Math.abs(lp.z)); if (d > deep) { deep = d; where = '가슴'; } } } });
  return { deep, where }; }
let selfWorst = { deep: 0, where: '', at: '' }, selfBad = 0, selfSeen = 0;
let heldWorst = { deep: 0, where: '', at: '' }, upWorst = { deep: 0, where: '', at: '' }, upBad = 0;
function scene(name, setup, step, steps, every = 1) { start(); setup(); let worst = { deep: 0, n: 0, where: '', k: -1 }, bad = 0, seen = 0, up = { deep: 0, where: '', k: -1 }, upN = 0;
  for (let k = 0; k < steps; k++) { const s = step(k) || {}; run(1, s.inp || {}, s.cmd || null); if (k % every) continue; if (k % 8 === 0 && sim.climb.hands.some(h => h.st === 'hold')) { for (const SET of [FORE, UPPER]) { const m = meshDepth('hold', SET); if (m.deep > heldWorst.deep) heldWorst = { deep: m.deep, where: m.where + (SET === FORE ? ' · 팔뚝' : ' · 위팔'), at: name.slice(0, 1) + ' @' + sim.tick }; } } if (!sim.climb.hands.some(h => h.st === 'reach')) continue; seen++; const m = meshDepth(); if (m.n) bad++; if (m.deep > worst.deep) worst = { ...m, k: sim.tick }; { const sd = selfDepth(); selfSeen++; if (sd.deep > 0.001) { selfBad++; if (sd.deep > selfWorst.deep) selfWorst = { ...sd, at: name.slice(0, 1) + ' @' + sim.tick }; } } const u = meshDepth('reach', UPPER); if (u.n) upN++; if (u.deep > up.deep) up = { ...u, k: sim.tick }; }
  const ok = seen > 0 && worst.deep <= 0.001; if (ok) pass++; else fail++;
  if (up.deep > 0.001) { upBad++; if (up.deep > upWorst.deep) upWorst = { deep: up.deep, where: up.where, at: name.slice(0, 1) + ' @' + up.k }; }
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} · 본 걸음 ${seen} · 팔뚝 표면이 지형 안에 든 걸음 ${bad} · 가장 깊이 ${(worst.deep * 100).toFixed(2)}cm${worst.deep > 0.001 ? `(${worst.where} @${worst.k}, 정점 ${worst.n}개)` : ''} ‖ 위팔: ${upN}걸음 · ${(up.deep * 100).toFixed(2)}cm${up.deep > 0.001 ? `(${up.where} @${up.k})` : ''}`); }
const AL = [-1.1, 1.92, -2.84], AR = [-0.7, 1.92, -2.84], drag = (i, p) => [{ type: 'hand', i, p, hold: true }], R = (i, p) => (i ? [null, p] : [p, null]);
const holdL = () => { run(30); run(150, {}, [{ type: 'hand', i: 0, p: AL }]); }, both = () => { holdL(); run(150, {}, [{ type: 'hand', i: 1, p: AR }]); };
console.log(`모션 = ${useClip ? '캡처' : '자작'} · 정점 표본: 팔뚝 ${FORE.L.length}개, 위팔 ${UPPER.L.length}개(한 팔)`);
// ① GPT의 반례 그대로: 왼손으로 턱 A를 잡고, 오른손을 턱 바로 위 벽면 [-0.95, 2.05, -3]으로 누르는 동안 뻗는다(명령 1걸음 + 110걸음). tick 291 한 걸음만이 아니라 뻗는 내내 본다
{ const g = [-0.95, 2.05, -3]; scene('① GPT 반례: 한 손 잡고 다른 손을 턱 바로 위 벽면으로(뻗는 내내)', holdL, k => ({ inp: { reach: R(1, g) }, cmd: k === 0 ? drag(1, g) : null }), 111); }
// ②~ reach_sweep의 장면들을 표면으로 다시 본다(매 걸음)
const pts = [[-0.78, 1.55, -3.0], [-0.78, 2.25, -3.0], [-0.95, 1.5, -3.0], [-0.6, 2.3, -3.0], [-0.78, 2.03, -3.0], [-0.5, 1.6, -3.0], [-0.72, 2.06, -3.0]], P = k => pts[Math.floor(k / 60) % pts.length];
scene('② 서서 한 손 잡고 다른 손을 턱 아래·위로', holdL, k => ({ inp: { reach: R(1, P(k)) }, cmd: k === 0 ? drag(1, P(0)) : null }), 840, 1);
scene('③ 같은 뻗기 + 몸 옮기기', holdL, k => ({ inp: { reach: R(1, P(k)), cy: [1, -1, 0, 0][Math.floor(k / 48) % 4], cx: [0, 0, -1, 1][Math.floor(k / 48) % 4] }, cmd: k === 0 ? drag(1, P(0)) : null }), 840, 1);
scene('④ 당겨 올라간 자세에서', () => { both(); run(150, { cy: 1 }); }, k => ({ inp: { reach: R(1, P(k)), cy: 1 }, cmd: k === 0 ? drag(1, P(0)) : null }), 600, 1);
scene('⑤ 좌우를 바꿔서 + 몸 옮기기', () => { run(30); run(150, {}, [{ type: 'hand', i: 1, p: AR }]); }, k => { const p = P(k).slice(); p[0] = -1.8 - p[0]; return { inp: { reach: R(0, p), cy: [1, -1, 0, 0][Math.floor(k / 48) % 4], cx: [0, 0, 1, -1][Math.floor(k / 48) % 4] }, cmd: k === 0 ? drag(0, p) : null }; }, 840, 4);
scene('⑥ 한 손 매달려 흔들며', () => { both(); run(200, { cy: 1 }); run(1, {}, [{ type: 'release', limb: 'hand', i: 1 }]); run(40); }, k => ({ inp: { reach: R(1, P(k)), cx: sim.body.vel.x > 0 ? 1 : -1 }, cmd: k === 0 ? drag(1, P(0)) : null }), 600, 1);
{ const tg = [[-0.7, 1.92, -2.84], [-0.78, 2.25, -3.0], [-0.3, 2.12, -2.86], [-0.6, 1.5, -3.0], [-0.5, 2.78, -2.86], [-0.7, 1.92, -2.84]];
  scene('⑦ 손 조작 1: 0.5초마다 여러 곳으로 + 몸 옮기기', holdL, k => ({ inp: { cy: [1, -1, 0, 0][Math.floor(k / 48) % 4], cx: [0, 0, -1, 1][Math.floor(k / 48) % 4] }, cmd: k % 60 === 0 ? [{ type: 'release', limb: 'hand', i: 1 }, { type: 'hand', i: 1, p: tg[(k / 60) % tg.length] }] : null }), 720, 1); }
scene('⑧ 땅에서 뛰며 턱 위 벽면으로', () => run(30), k => ({ inp: { jump: k < 40, reach: R(0, [-1.0, 2.3, -3.0]) }, cmd: k === 10 ? drag(0, [-1.0, 2.3, -3.0]) : null }), 150, 1);
// ⑨ 턱 A → 턱 F(발 선택 장면의 성공 풀이): 오른발을 낮은 발판에 올리고 W로 올라선 뒤 오른손을 턱 F로. 어깨가 턱 A 바로 앞 아래에 있어 편 팔의 위팔이 턱 A의 끝을 지난다
scene('⑨ 턱 A → 턱 F로 오른손 보내기(발 선택 장면)', () => { both(); run(260, {}, [{ type: 'foot', i: 1, p: [-0.3, 0.5, -2.93] }]); run(240, { cy: 1 }); }, k => ({ inp: { cy: 1 }, cmd: k === 0 ? [{ type: 'hand', i: 1, p: [-0.3, 2.15, -2.86] }] : null }), 120);
// 위팔은 따로 센다: 손을 멈추는 데 쓰지 않으므로(굽는 쪽을 고르는 데만 쓴다) 겹침이 남을 수 있다. 남으면 실패로 적는다
{ const ok = upBad === 0; if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  위의 장면들에서 뻗는 팔의 위팔 표면이 지형에 들어가지 않는다 · 들어간 장면 ${upBad}개${upBad ? ` · 가장 깊이 ${(upWorst.deep * 100).toFixed(2)}cm(${upWorst.where}, 장면 ${upWorst.at})` : ''}`); }
// 뻗는 팔뚝이 제 머리·가슴을 지나가는가(p3d-0.8.4에 새로 잰다. 앞 판에는 이 검사가 없었다 — 뻗는 동안의 팔–몸 겹침은 물리 쪽에서 막지 않는다)
{ const ok = selfBad === 0; if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  위의 장면들에서 뻗는 팔뚝의 중심선이 제 머리·가슴 안에 들지 않는다(1mm 넘게. 표면은 반지름만큼 더 들어간다) · 본 걸음 ${selfSeen} · 들어간 걸음 ${selfBad}${selfBad ? ` · 가장 깊이 ${(selfWorst.deep * 100).toFixed(2)}cm(${selfWorst.where}, 장면 ${selfWorst.at})` : ''}`); }
// 잡고 있는 팔은 통과·실패로 보지 않고 적어만 둔다(잡은 팔은 팔꿈치 한 점만 검사한다. 팔뚝이 턱에 얹히는 자세가 있을 수 있다)
console.log(`(자료) 같은 장면들에서 잡고 있는 팔의 팔뚝·위팔 표면이 지형 안에 든 가장 깊은 깊이: ${(heldWorst.deep * 100).toFixed(2)}cm${heldWorst.deep > 0.001 ? `(${heldWorst.where}, 장면 ${heldWorst.at})` : ''}`);
console.log(`통과 ${pass} · 실패 ${fail}`); process.exit(fail ? 1 : 0);
