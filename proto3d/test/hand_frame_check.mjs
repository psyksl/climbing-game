// 잡은 손의 접촉 틀 점검(p3d-0.10.4, GPT의 0.10.3 검토 "손 접촉 정의는 미완료 — 앞면·끝 옆면에서 손이 공중에 서거나 벌어진다. 윗면 네 모서리를 같은 틀로").
// 모서리의 틀: t = 모서리 방향, n = 잡은 면의 바깥(수평), u = 위. 바라는 손: 손가락 쪽 = u를 −n 쪽으로 HAND_TILT만큼 기울인 방향, 손바닥 = −n(면을 본다).
// 잡는 단계마다(잡은 직후 · 0.1초 · 0.5초 · 놓은 직후) 마네킹 메시로 잰다(스크립트 입력, 사람 손 아님. 기준은 개발 쪽 진단선):
//   손가락 틀 어긋남(°) = 그려진 손(손목 → 가운뎃손가락 뿌리)과 바라는 손가락 쪽의 각 · 손목 꺾임(°) = 아래팔 축과 손 축의 각(한계 70°)
//   손바닥 ↔ 면(mm) = 손바닥 가운데가 잡은 면에서 떨어진 거리(공중에 선 손이면 큼) · 덮은 손가락 = 끝·가운데 마디가 윗면에서 −3~+4mm인 손가락 수 · 손 관통(mm)
// 장면: 기본 지형 h1·h3·h5·m1·m3·m5 + 다른 벽 시험 지형 c1~c8(test/scenes_corner.mjs)   사용: node test/hand_frame_check.mjs [JSON]   ONLY=
import { prov, provLine } from './provenance.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const __P = prov(); console.log(provLine(__P));
const HERE = path.dirname(fileURLToPath(import.meta.url)), SRC = process.env.SRC ? path.resolve(process.env.SRC) : path.resolve(HERE, '../src'), imp = f => import(pathToFileURL(path.join(SRC, f)).href);
const THREE = await import('three');
const { buildCharacter, DIM } = await imp('rig.js'), W = await imp('world.js'), { makeSim } = await imp('sim.js'), { buildHuman, makeRetarget } = await imp('human.js');
const { SCENES_H, SCENES_HV = [], START } = await import('./scenes_foot.mjs'), { SCENES_C = [] } = await import('./scenes_corner.mjs');
const all = [...SCENES_H.map(s => [s[0].split(' ')[0], s[0], s[1], s[2], s[3], s[4], null, 'main']), ...SCENES_HV.filter(s => /^m/.test(s[0])).map(s => [s[0].split(' ')[0], s[0], s[1], s[2], s[3], s[4], null, 'main']), ...SCENES_C.map(s => [...s, 'corner'])].filter(s => !process.env.ONLY || process.env.ONLY.split(',').includes(s[0]));
const rig = buildCharacter(), H = buildHuman(), R = makeRetarget(rig, H), V = (...a) => new THREE.Vector3(...a), wp = n => H.bones[n].getWorldPosition(V()), deg = 180 / Math.PI, TILT = (DIM.grip ? DIM.grip.tilt : 14) / deg;
const FING = ['index', 'middle', 'ring', 'pinky'];
const vb = H.meshes.map(m => { const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight, o = []; for (let k = 0; k < si.count; k++) { let b = 0, w = -1; for (let j = 0; j < 4; j++) if (sw.getComponent(k, j) > w) { w = sw.getComponent(k, j); b = si.getComponent(k, j); } o.push(H.list[b].name); } return o; });
const inside = (v, bx) => Math.min(v.x - bx.min.x, bx.max.x - v.x, v.y - bx.min.y, bx.max.y - v.y, v.z - bx.min.z, bx.max.z - v.z);
const face = n => (n.x > 0.5 ? '+x면' : n.x < -0.5 ? '−x면' : n.z > 0.5 ? '앞면' : '뒷면');
function measure(sim, world, i) { const Hd = sim.climb.hands[i], h = i ? 'r' : 'l', bx = Hd.edge ? Hd.edge.box : null; if (!bx) return null;
  const n = Hd.n.clone().setY(0).normalize(), up = V(0, 1, 0), fdW = up.clone().multiplyScalar(Math.cos(TILT)).addScaledVector(n, -Math.sin(TILT)).normalize();
  const w = wp(`hand_${h}`), m1 = wp(`middle_01_${h}`), la = wp(`lowerarm_${h}`), fd = m1.clone().sub(w).normalize(), fa = w.clone().sub(la).normalize();
  const palmC = w.clone().lerp(m1, 0.5), palmOff = palmC.clone().sub(Hd.grip).dot(n), top = bx.max.y;
  let cover = 0; for (const f of FING) { const re = new RegExp(`^${f}_0[23]_${h}$`), v = V(); let gap = 9;
    H.meshes.forEach((m, mi) => { const N = m.geometry.attributes.position.count; for (let j = 0; j < N; j++) { if (!re.test(vb[mi][j])) continue; m.getVertexPosition(j, v).applyMatrix4(m.matrixWorld); const bh = -v.clone().sub(Hd.grip).dot(n); if (bh > 0.005 && v.x > bx.min.x - 0.002 && v.x < bx.max.x + 0.002 && v.z > bx.min.z - 0.002 && v.z < bx.max.z + 0.002) gap = Math.min(gap, v.y - top); } });
    if (gap > -0.003 && gap < 0.004) cover++; }
  let pen = 0; const reH = new RegExp(`^(hand|index|middle|ring|pinky|thumb)\\w*_${h}$`), v = V();
  H.meshes.forEach((m, mi) => { const N = m.geometry.attributes.position.count; for (let j = 0; j < N; j++) { if (!reH.test(vb[mi][j])) continue; m.getVertexPosition(j, v).applyMatrix4(m.matrixWorld); for (const b of world.boxes) { if (b.kind === 'floor') continue; const d = inside(v, b); if (d > pen) pen = d; } } });
  return { 면: face(n), 손가락_틀_어긋남_도: +(fd.angleTo(fdW) * deg).toFixed(1), 손목_꺾임_도: +(fd.angleTo(fa) * deg).toFixed(1), 바라는_손목_꺾임_도: +(fdW.angleTo(fa) * deg).toFixed(1), 손바닥_면_mm: +(palmOff * 1000).toFixed(1), 덮은_손가락: cover, 손_관통_mm: +(pen * 1000).toFixed(1), 세움: +sim.gw[i].toFixed(2) }; }
const out = { scenes: {} }, sum = [];
for (const [id, title, fn, assist, , st0, yaw0, wname] of all) {
  const mk = () => (wname === 'corner' ? W.makeFixtureWorld() : W.makeWorld()), world = mk(), sim = makeSim(rig, world, null), y = yaw0 ?? Math.PI;
  sim.reset({ pos: st0 || START, yaw: y }); sim.opt.wallRest = false; sim.opt.footAssist = !!assist; if (process.env.VARIANT) sim.opt.posture = process.env.VARIANT;
  const inputs = [], put = (inp = {}, cmd = []) => inputs.push({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd }), rep = (n, inp, cmd) => { for (let i = 0; i < n; i++) put(inp, i ? [] : cmd); }; fn(sim, put, rep);
  const evs = []; { const s2 = makeSim(buildCharacter(), mk(), null); s2.reset({ pos: st0 || START, yaw: y }); s2.opt.wallRest = false; s2.opt.footAssist = !!assist; for (let k = 0; k < inputs.length; k++) { s2.step(inputs[k]); for (const e of s2.climb.events) if (e.limb === 'hand' && ['grab', 'release', 'slip'].includes(e.type)) evs.push({ k, type: e.type, i: e.i }); } }
  const marks = new Map(), add = (k, v) => marks.set(k, [...(marks.get(k) || []), v]);
  for (const e of evs) { if (e.type === 'grab') { add(e.k + 1, [e.i, '잡은 직후']); add(e.k + 12, [e.i, '잡고 0.1초']); add(e.k + 60, [e.i, '잡고 0.5초']); } else add(e.k + 1, [e.i, e.type === 'slip' ? '미끄러진 직후' : '놓은 직후']); }
  const rows = [];
  for (let k = 0; k < inputs.length; k++) { sim.step(inputs[k]); R.apply(sim.fing, sim.pron, sim.climb, world, sim.gw); H.root.updateMatrixWorld(true);
    for (const [i, tag] of marks.get(k) || []) { const Hd = sim.climb.hands[i]; if (Hd.st !== 'hold' && !/직후/.test(tag)) continue; const m = Hd.edge ? measure(sim, world, i) : null; if (!m) continue; rows.push({ 초: +((k + 1) / 120).toFixed(3), 손: i ? '오른손' : '왼손', 순간: tag, 턱: Hd.edge.box.name, ...m }); } }
  out.scenes[id] = { 제목: title, rows }; console.log(`\n■ ${id} ${title.slice(0, 40)}`);
  for (const r of rows) { console.log(`  ${String(r.초).padEnd(6)} ${r.손} ${r.순간.padEnd(7)} ${r.턱.split(' ')[0]}(${r.면}) 틀 어긋남 ${r.손가락_틀_어긋남_도}° · 손목 ${r.손목_꺾임_도}°(바람 ${r.바라는_손목_꺾임_도}°) · 손바닥↔면 ${r.손바닥_면_mm}mm · 덮음 ${r.덮은_손가락}/4 · 관통 ${r.손_관통_mm}mm`); if (r.순간 === '잡고 0.5초') sum.push({ id, ...r }); } }
const byFace = {}; for (const r of sum) { const b = byFace[r.면] || (byFace[r.면] = { 수: 0, 틀_어긋남_최대: 0, 손바닥_면_최대: 0, 덮음_최소: 4, 관통_최대: 0 }); b.수++; b.틀_어긋남_최대 = Math.max(b.틀_어긋남_최대, r.손가락_틀_어긋남_도); b.손바닥_면_최대 = Math.max(b.손바닥_면_최대, r.손바닥_면_mm); b.덮음_최소 = Math.min(b.덮음_최소, r.덮은_손가락); b.관통_최대 = Math.max(b.관통_최대, r.손_관통_mm); }
console.log('\n잡고 0.5초, 면별:', JSON.stringify(byFace)); out.면별_잡고_0_5초 = byFace;
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ 실행_출처: __P, ...out }, null, 1));
