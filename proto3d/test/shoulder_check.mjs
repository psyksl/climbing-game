// 어깨 덮개의 구겨짐을 최소 자세로 나눠 잰다(p3d-0.10.2, GPT의 0.10.1 검토 6절: "원본 리그의 같은 위팔 각, 쇄골/어깨뼈 움직임, 리타게팅, 렌더 스키닝을 분리한 비교 → 최소 재현 자세에서만 정점 무게를 국소 편집").
// 자세(왼팔, 팔을 편 채 위팔 방향만): 내림 · 앞 90° · 옆 90° · 머리 위 · 가슴 앞 교차. 조건:
//   A 원본 리그에 위팔만 돌림(쇄골 그대로) · B A + 쇄골 보정(리타게팅의 어깨뼈 리듬과 같은 식) · W 무게 편집(어깨 둘레만, 아래 방법)을 B에
//   R 실제 장면의 리타게팅 결과(h1·reach3·m1의 몇 순간)
// 잰 값(어깨 둘레 삼각형: 쇄골·위팔·가슴 뼈의 무게가 섞인 정점과 그 이웃): 넓이가 쉬는 자세의 35% 아래로 줄어든 삼각형(찌그러짐), 법선이 뒤집힌 삼각형(접힘), 가장 작은 넓이 비.
//   이 수치는 개발 쪽 진단값이며 그림의 품질 판정이 아니다(사람이 보기에 구겨져 보이는지는 그림으로 따로 본다).
// 무게 편집(국소): 어깨 둘레 정점의 쇄골·위팔·가슴 무게를 메시 이웃의 평균 쪽으로 몇 번 끌어온다(합은 그대로, 다른 뼈의 무게는 건드리지 않음). 사용: node test/shoulder_check.mjs [JSON]   반복 수: SMOOTH=3
import { prov, provLine } from './provenance.mjs'; // 실행 출처(p3d-0.10.3) — 소스보다 먼저 불러와 설정 스위치를 켠다
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const __P = prov(); console.log(provLine(__P));
const HERE = path.dirname(fileURLToPath(import.meta.url)), SRC = path.resolve(HERE, '../src'), imp = f => import(pathToFileURL(path.join(SRC, f)).href);
const THREE = await import('three');
const { buildHuman, makeRetarget, smoothShoulder } = await imp('human.js'), { buildCharacter } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js');
const { SCENES, SCENES_H, SCENES_HV, START } = await import('./scenes_foot.mjs');
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), Q = () => new THREE.Quaternion();
const SET = new Set(['clavicle_l', 'upperarm_l', 'spine_03']);
function region(H) { const out = []; H.meshes.forEach((m, mi) => { const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight, n = si.count, inR = new Uint8Array(n);
  for (let k = 0; k < n; k++) { let s = 0, c = 0; for (let j = 0; j < 4; j++) { const nm = H.list[si.getComponent(k, j)].name, w = sw.getComponent(k, j); if (SET.has(nm) && w > 0.08) { s += w; c++; } } if (c >= 2) inR[k] = 1; }
  const idx = m.geometry.index.array, tris = [], dom = []; for (let t = 0; t < idx.length; t += 3) if (inR[idx[t]] || inR[idx[t + 1]] || inR[idx[t + 2]]) { tris.push(t); const k = idx[t]; let b = 0, w = -1; for (let j = 0; j < 4; j++) if (sw.getComponent(k, j) > w) { w = sw.getComponent(k, j); b = si.getComponent(k, j); } dom.push(H.list[b]); }
  out.push({ m, mi, tris, inR, dom }); }); return out; }
// 접힘: 삼각형의 주된 뼈가 쉬는 자세에서 돈 만큼 쉬는 자세의 법선을 돌린 것과 지금 법선이 반대(내적 < 0)면 접힌 것으로 센다(팔과 함께 돈 것은 세지 않는다)
function domRot(H, R) { return R.map(({ dom }) => dom.map(b => b.getWorldQuaternion(Q()).multiply(H.bindQ[b.name].clone().invert()))); }
function snap(R) { return R.map(({ m, tris }) => { m.updateMatrixWorld(true); const idx = m.geometry.index.array, v = [V(), V(), V()]; return tris.map(t => { for (let j = 0; j < 3; j++) m.getVertexPosition(idx[t + j], v[j]); const e1 = v[1].clone().sub(v[0]), e2 = v[2].clone().sub(v[0]), c = e1.cross(e2); return { a: c.length() / 2, n: c.normalize() }; }); }); }
function score(bind, now, rot) { let col = 0, flip = 0, minR = 9, n = 0; bind.forEach((B, i) => B.forEach((b, j) => { const c = now[i][j]; if (b.a < 1e-8) return; n++; const r = c.a / b.a; minR = Math.min(minR, r); if (r < 0.35) col++; if (b.n.clone().applyQuaternion(rot[i][j]).dot(c.n) < 0) flip++; })); return { 삼각형: n, 찌그러짐: col, 접힘: flip, 가장_작은_넓이비: +minR.toFixed(3) }; }
function poseArm(H, dir, clav) { for (const b of H.list) b.quaternion.copy(H.bindL[b.name]); H.root.updateMatrixWorld(true);
  const wq = b => b.getWorldQuaternion(Q()), wp = b => b.getWorldPosition(V()), setW = (b, q) => { const pq = b.parent.getWorldQuaternion(Q()); b.quaternion.copy(pq.invert().multiply(q)); b.updateMatrixWorld(true); };
  const C = H.bones.clavicle_l, U = H.bones.upperarm_l, L = H.bones.lowerarm_l, qc = wq(H.bones.spine_03), d = dir.clone().normalize();
  if (clav) { const e = Math.acos(Math.max(-1, Math.min(1, -d.y))) * 180 / Math.PI, up = Math.max(0, Math.min(1, (e - 70) / 110)) * 28 * Math.PI / 180, fw = (Math.max(0, Math.min(1, d.z)) * 10 + (globalThis.SCAP_X ?? 0) * Math.max(0, Math.min(1, -d.x))) * Math.PI / 180; // SCAP_X = 팔이 가슴 앞을 건너갈 때 더 내미는 각(시험)
    setW(C, Q().setFromAxisAngle(V(0, 0, 1).applyQuaternion(qc), up).multiply(Q().setFromAxisAngle(V(0, 1, 0).applyQuaternion(qc), -fw)).multiply(wq(C))); }
  const cur = wp(L).sub(wp(U)).normalize(); setW(U, Q().setFromUnitVectors(cur, d).multiply(wq(U))); H.root.updateMatrixWorld(true); }
const POSES = [['내림', V(0.08, -1, 0)], ['앞 90°', V(0.1, 0, 1)], ['옆 90°', V(1, 0, 0)], ['머리 위', V(0.25, 1, 0.1)], ['가슴 앞 교차', V(-0.6, -0.1, 0.8)]];
const out = { 조건: {}, 장면: {} };
async function run(label, H) { const R = region(H); for (const b of H.list) b.quaternion.copy(H.bindL[b.name]); H.root.updateMatrixWorld(true); const bind = snap(R); const res = {};
  for (const clav of [false, true]) for (const [pn, d] of POSES) { poseArm(H, d, clav); res[`${clav ? 'B' : 'A'} ${pn}`] = score(bind, snap(R), domRot(H, R)); }
  out.조건[label] = res; console.log(`\n■ ${label} (어깨 둘레 삼각형 ${Object.values(res)[0].삼각형}개)`); for (const [k, v] of Object.entries(res)) console.log(`  ${k.padEnd(12)} 찌그러짐 ${String(v.찌그러짐).padStart(3)} · 접힘 ${String(v.접힘).padStart(3)} · 가장 작은 넓이비 ${v.가장_작은_넓이비}`);
  // 실제 장면(리타게팅)
  const rig = buildCharacter(), Rt = makeRetarget(rig, H), picks = [['h1', [1.0, 3.5, 6.8]], ['reach3', [1.5, 7.0]], ['m1', [1.5, 6.6]]], all = [...SCENES.map((s, i) => ['reach' + (i + 1), ...s]), ...SCENES_H.map(s => [s[0].split(' ')[0], ...s]), ...SCENES_HV.map(s => [s[0].split(' ')[0], ...s])];
  for (const [id, ts] of picks) { const sc = all.find(s => s[0] === id), world = makeWorld(), sim = makeSim(rig, world, null); sim.reset({ pos: sc[5] || START, yaw: Math.PI }); sim.opt.wallRest = false;
    const inputs = [], put = (inp = {}, cmd = []) => inputs.push({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd }), rep = (n, inp, cmd) => { for (let i = 0; i < n; i++) put(inp, i ? [] : cmd); }; sc[2](sim, put, rep);
    for (let k = 0; k < inputs.length; k++) { sim.step(inputs[k]); const t = (k + 1) / 120; if (!ts.some(x => Math.abs(x - t) < 1e-3)) continue; Rt.apply(sim.fing, sim.pron, sim.climb, world, sim.gw); H.root.position.set(0, 0, 0); H.root.updateMatrixWorld(true);
      const s = score(bind, snap(R), domRot(H, R)); (out.장면[label] = out.장면[label] || {})[`${id} ${t}초`] = s; console.log(`  R ${id} ${t}초`.padEnd(16) + ` 찌그러짐 ${String(s.찌그러짐).padStart(3)} · 접힘 ${String(s.접힘).padStart(3)} · 가장 작은 넓이비 ${s.가장_작은_넓이비}`); } } }
await run('지금 무게', buildHuman());
if (smoothShoulder) { const H2 = buildHuman(); smoothShoulder(H2, +(process.env.SMOOTH || 3)); await run(`W 무게 편집(어깨 둘레 이웃 평균 ${process.env.SMOOTH || 3}번)`, H2); }
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ 실행_출처: __P, ...out }, null, 1));
