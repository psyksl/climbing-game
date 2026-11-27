// 사람형 몸(p3d-0.10.0)이 제어 뼈대·접촉과 맞는지 잰다. 장면은 scenes_foot.mjs(발 장면 9 + 한 손 뻗기 6)와 같다. 스크립트 입력(사람 손 아님).
// 걸음마다(1/120초) 계산 → 새 몸에 옮김(main.js의 그리기와 같은 함수) → 잰다:
//   ① 접촉: 잡은 손 = 새 몸의 손바닥 자리(손목에서 손가락 쪽으로 CL.PALM)와 제어 뼈대의 손바닥 자리, 디딘 발 = 새 몸의 발목과 제어 뼈대의 발목
//   ② IK가 닿지 못한 거리(새 몸의 어깨·고관절에서 제어 뼈대의 손목·발목까지가 팔다리 길이보다 먼 만큼)
//   ③ 새 몸의 뼈가 도는 빠르기: 붙은 팔다리(잡은 팔·디딘 다리) 초속 300°, 어떤 뼈든(손가락 제외) 초속 900° — motion_scan.mjs와 같은 잣대(개발 쪽 기준)
//   ④ 새 몸의 메시가 지형에 들어간 깊이(12걸음마다, 정점 전부). 손바닥·발바닥이 닿는 곳은 접촉이므로 손·손가락·발 정점은 따로 센다
// 통과·실패: ①이 1cm 안, ②가 5mm 안, ③의 붙은 팔다리 사건이 없다. ④는 기록(기준을 정하지 않았다).
// 사용: node test/human_check.mjs [JSON]   캡처 동작: MODE=clip   장면 고르기: ONLY=foot2,reach2
// 자세 규칙 비교: VARIANT=base|rule|ref(사람형 몸의 자세 규칙 — rule이 기본)
// 옛 몸과 견주기: BODY=old — 옛 몸의 메시(제어 뼈대에 바로 붙은 것)로 ③④만 잰다(①②는 옮기는 단계가 없어 0)
import { prov, provLine } from './provenance.mjs'; // 실행 출처(p3d-0.10.3) — 소스보다 먼저 불러와 설정 스위치를 켠다
// [실제 설정] 한 줄(p3d-0.15.5, GPT의 0.15.4 검토: 회귀 파일에 실제 설정이 없었다): 이 시험이 **처음** 만든 sim의 설정을 끝날 때 적는다(처음에는 마지막 sim을 적었는데, 벽 회귀의 마지막 장면은 옛 자세 방식과 견주는 장면이라 "자세 rule · 전신 연결 끔"이 찍혔다)(계산이 읽는 값 — provenance.mjs provOptLine)
import { provOptLine } from './provenance.mjs'; let lastSim__ = null; process.on('exit', () => { if (lastSim__) console.log(provOptLine(lastSim__)); });
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const __P = prov(); console.log(provLine(__P));
const HERE = path.dirname(fileURLToPath(import.meta.url)), imp = f => import(pathToFileURL(path.resolve(HERE, '../src', f)).href);
const THREE = await import('three');
const { buildCharacter } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js'), { CL } = await imp('climb.js'), { buildHuman, makeRetarget, humanPoints } = await imp('human.js');
const mkSim__ = (...a) => { const s = makeSim(...a); lastSim__ = lastSim__ || s; return s; };
const { SCENES_FOOT, SCENES, SCENES_H, SCENES_HV = [], START } = await import('./scenes_foot.mjs');
const clip = process.env.MODE === 'clip', clips = clip ? JSON.parse(fs.readFileSync(path.resolve(HERE, '../assets_local/clips.json'), 'utf8')) : null;
if (process.env.PO_FAST) globalThis.PO_FAST = 1; // 비교 스위치: 골반 층 0.15초
const OLD = process.env.BODY === 'old', rig = buildCharacter(), V = () => new THREE.Vector3();
// 옛 몸: 제어 뼈대와 그 메시를 그대로 잰다(뼈 이름을 새 몸 이름으로 맞춰 같은 잣대를 쓴다)
const H = OLD ? { meshes: [rig.mesh], list: rig.list } : buildHuman(), R = OLD ? { apply() { rig.root.updateMatrixWorld(true); }, info: { maxIKGap: 0 } } : makeRetarget(rig, H);
const ALIAS = { 'upLeg.L': 'thigh_l', 'leg.L': 'calf_l', 'upLeg.R': 'thigh_r', 'leg.R': 'calf_r', 'upperArm.L': 'upperarm_l', 'foreArm.L': 'lowerarm_l', 'upperArm.R': 'upperarm_r', 'foreArm.R': 'lowerarm_r', 'hand.L': 'hand_l', 'hand.R': 'hand_r', 'foot.L': 'foot_l', 'foot.R': 'foot_r', 'toe.L': 'ball_l', 'toe.R': 'ball_r', hips: 'pelvis' };
const nm0 = b => OLD ? (ALIAS[b.name] || b.name) : b.name;
const LIMB = { thigh_l: ['foot', 0], calf_l: ['foot', 0], thigh_r: ['foot', 1], calf_r: ['foot', 1], upperarm_l: ['hand', 0], lowerarm_l: ['hand', 0], upperarm_r: ['hand', 1], lowerarm_r: ['hand', 1] };
const FING = /^(index|middle|ring|pinky|thumb)/, CONTACT = /^(hand|index|middle|ring|pinky|thumb|foot|ball)/;
// 정점마다 가장 큰 몫의 뼈 이름(관통을 어느 부위가 했는지 적는다)
const vb = H.meshes.map(m => { const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight, out = []; for (let k = 0; k < si.count; k++) { let b = 0, w = -1; for (let j = 0; j < 4; j++) if (sw.getComponent(k, j) > w) { w = sw.getComponent(k, j); b = si.getComponent(k, j); } out.push(nm0(H.list[b])); } return out; });
const all = [...SCENES_FOOT.map((s, i) => ['foot' + (i + 1), ...s]), ...SCENES.map((s, i) => ['reach' + (i + 1), ...s]), ...SCENES_H.map(s => [s[0].split(' ')[0], ...s]), ...SCENES_HV.map(s => [s[0].split(' ')[0], ...s])].filter(s => !process.env.ONLY || process.env.ONLY.split(',').includes(s[0]));
// 메시 정점의 세계 자리(p3d-0.10.1, GPT 지적): getVertexPosition은 메시의 지역 좌표다. 옛 몸은 상위 root에 몸의 x/z 이동이 있어 0.10.0의 "옛 몸 관통 0cm"는 틀린 비교였다 → 메시의 세계 행렬을 곱한다
const worldVert = (m, j, v) => m.getVertexPosition(j, v).applyMatrix4(m.matrixWorld);
const PART = nm => /^(hand|index|middle|ring|pinky|thumb)/.test(nm) ? 'hand' : /^(foot|ball)/.test(nm) ? 'foot' : /^(thigh|calf)/.test(nm) ? 'leg' : /^(upperarm|lowerarm|clavicle)/.test(nm) ? 'arm' : /^(Head|neck)/.test(nm) ? 'head' : 'torso';
function penetration(world) { const out = {}, v = new THREE.Vector3(); H.meshes.forEach((m, mi) => { m.updateMatrixWorld(true); const n = m.geometry.attributes.position.count; for (let j = 0; j < n; j++) { worldVert(m, j, v);
  for (const bx of world.boxes) { if (v.x <= bx.min.x || v.x >= bx.max.x || v.y <= bx.min.y || v.y >= bx.max.y || v.z <= bx.min.z || v.z >= bx.max.z) continue;
    const d = Math.min(v.x - bx.min.x, bx.max.x - v.x, v.y - bx.min.y, bx.max.y - v.y, v.z - bx.min.z, bx.max.z - v.z), nm = vb[mi][j], pt = PART(nm), key = CONTACT.test(nm) ? 'contact' : pt;
    for (const kk of new Set([key, pt])) if (d > (out[kk]?.d ?? 0)) out[kk] = { d, bone: nm, box: bx.name }; } } }); return out; }
function centroid() { const c = new THREE.Vector3(), v = new THREE.Vector3(); let n = 0; for (const m of H.meshes) { m.updateMatrixWorld(true); const N = m.geometry.attributes.position.count; for (let j = 0; j < N; j += 7) { c.add(worldVert(m, j, v)); n++; } } return c.multiplyScalar(1 / n); }
const PEN_EVERY = +(process.env.PEN_EVERY || 6);
const ATTD = {};
const out = { mode: clip ? 'clip' : 'proc', body: OLD ? 'old' : 'human', scenes: {} }, tot = { palm: 0, ankle: 0, gap: 0, att: [], fast: [], penBody: { d: 0 }, penContact: { d: 0 }, part: {}, coord: 0 };
for (const [id, title, fn, assist, mode, st0] of all) {
  const world = makeWorld(), sim = mkSim__(rig, world, clips); sim.reset({ pos: st0 || START, yaw: Math.PI }); sim.opt.wallRest = false; sim.opt.footAssist = !!assist;
  if (process.env.VARIANT) { sim.opt.posture = process.env.VARIANT; if (process.env.VARIANT === 'ref') sim.ref = JSON.parse(fs.readFileSync(path.resolve(HERE, '../assets_local/ref_index.json'), 'utf8')); }
  const inputs = [], put = (inp = {}, cmd = []) => inputs.push({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd }), rep = (n, inp, cmd) => { for (let i = 0; i < n; i++) put(inp, i ? [] : cmd); };
  fn(sim, put, rep);
  const prev = new Map(), r = { palm: 0, ankle: 0, gap: 0, att: [], fast: [], penBody: { d: 0 }, penContact: { d: 0 }, part: {}, tr: {}, coord: null, holdN: 0, tipN: 0 }, v = V();
  for (let k = 0; k < inputs.length; k++) {
    sim.step(inputs[k]); R.apply(sim.fing, sim.pron, sim.climb, world, sim.gw); const K = sim.climb, t = (k + 1) / 120, P = OLD ? null : humanPoints(H, CL.PALM);
    r.gap = Math.max(r.gap, R.info.maxIKGap);
    if (K.on && !OLD) for (let i = 0; i < 2; i++) { const s = i ? 'R' : 'L';
      // p3d-0.10.1: 잡은 손은 손바닥이 턱 앞면을 보게 세우므로(human.js) 손바닥 자리는 제어 뼈대의 손바닥 자리와 다르다(기록만). 접촉의 맞음은 손목 자리 + 손·손가락 메시의 관통·닿음으로 본다
      if (K.hands[i].st === 'hold') { r.palm = Math.max(r.palm, H.bones[`hand_${i ? 'r' : 'l'}`].getWorldPosition(V()).distanceTo(rig.bones[`hand.${s}`].getWorldPosition(V())));
        r.palmPt = Math.max(r.palmPt || 0, P[`palm.${s}`].distanceTo(rig.bones[`hand.${s}`].localToWorld(V().set(0, -CL.PALM, 0))));
        const bx = K.hands[i].edge.box, tips = ['index', 'middle', 'ring', 'pinky'].map(f => H.bones[`${f}_04_leaf_${i ? 'r' : 'l'}`].getWorldPosition(V())), gap = Math.min(...tips.map(p => Math.max(bx.min.x - p.x, 0, p.x - bx.max.x) ** 2 + Math.max(bx.min.y - p.y, 0, p.y - bx.max.y) ** 2 + Math.max(bx.min.z - p.z, 0, p.z - bx.max.z) ** 2).map(Math.sqrt));
        r.holdN++; if (sim.gw[i] >= 0.9) { r.tipN++; r.tipGap = Math.max(r.tipGap || 0, gap); } } // 손끝–턱은 손을 다 세운 뒤(세우는 정도 0.9 넘음)만 잰다
      if (K.feet[i].st === 'plant') r.ankle = Math.max(r.ankle, P[`ankle.${s}`].distanceTo(rig.bones[`foot.${s}`].getWorldPosition(V()))); }
    for (const b of H.list) { const bn = nm0(b); if (FING.test(bn) || /leaf/.test(bn)) continue; const q = b.getWorldQuaternion(new THREE.Quaternion()), p = prev.get(bn); prev.set(bn, q); if (!p || k < 2) continue;
      const w = p.angleTo(q) * 180 / Math.PI * 120, L = LIMB[bn], att = L && K.on && (L[0] === 'foot' ? K.feet[L[1]].st === 'plant' : K.hands[L[1]].st === 'hold');
      if (att && w > 300) r.att.push(`${t.toFixed(3)}초 ${bn} ${Math.round(w)}°/s`); else if (w > 900) r.fast.push(`${t.toFixed(3)}초 ${bn} ${Math.round(w)}°/s`); }
    // p3d-0.10.2(GPT의 0.10.1 검토 7절): 몸통·팔다리 합계에는 torso·leg·arm·head만 넣는다(전에는 contact 밖의 모든 키 — hand·foot도 — 몸 항목에 섞였다). 손발은 contact 합계에.
    //   전환(잡기·놓기·디딤·뗌 뒤 0.3초) 중의 관통은 따로 적는다. 전환 구간에서는 매 걸음 잰다
    for (const e of K.events) if (['grab', 'release', 'slip', 'step', 'plant', 'lift', 'reject'].includes(e.type)) r.trans = k + 36;
    const inTr = r.trans !== undefined && k <= r.trans;
    if (k % PEN_EVERY === 0 || inTr) { const pen = penetration(world); for (const k2 of Object.keys(pen)) { const x = pen[k2], slot = k2 === 'contact' ? r.penContact : ['torso', 'leg', 'arm', 'head'].includes(k2) ? r.penBody : null; if (slot && x.d > slot.d) Object.assign(slot, { ...x, t: +t.toFixed(3) }); if (x.d > (r.part[k2]?.d ?? 0)) r.part[k2] = { ...x, t: +t.toFixed(3) }; if (inTr && k2 !== 'contact' && x.d > (r.tr[k2]?.d ?? 0)) r.tr[k2] = { ...x, t: +t.toFixed(3) }; }
      if (k === 0) { const c = centroid(); r.coord = +Math.hypot(c.x - sim.body.pos.x, c.z - sim.body.pos.z).toFixed(3); } }
  }
  const R2 = { 제목: title, 손목_어긋남_mm: +(r.palm * 1000).toFixed(2), 손가락끝_턱까지_mm: r.tipN ? +((r.tipGap || 0) * 1000).toFixed(1) : r.holdN ? '표본 없음(잡았지만 손을 다 세운 걸음 없음)' : '해당 없음(잡은 손 없음)', 손가락_표본: r.tipN, 잡은_손_걸음: r.holdN, 전환_중_관통_cm: Object.fromEntries(Object.entries(r.tr).map(([k2, x]) => [k2, `${(x.d * 100).toFixed(1)} (${x.t}초 ${x.bone} → ${x.box})`])), 발목_어긋남_mm: +(r.ankle * 1000).toFixed(2), IK_못_닿음_mm: +(r.gap * 1000).toFixed(2), 붙은_팔다리_300도_넘음: r.att.length, 그_목록: r.att.slice(0, 6), 뼈_900도_넘음: r.fast.length, 빠른_목록: r.fast.slice(0, 6),
    메시_관통_몸통팔다리_cm: +(r.penBody.d * 100).toFixed(1), 그때: r.penBody.bone ? `${r.penBody.t}초 ${r.penBody.bone} → ${r.penBody.box}` : '', 메시_관통_손발_cm: +(r.penContact.d * 100).toFixed(1), 그때_손발: r.penContact.bone ? `${r.penContact.t}초 ${r.penContact.bone} → ${r.penContact.box}` : '' };
  R2.부위별_관통_cm = Object.fromEntries(Object.entries(r.part).map(([k2, x]) => [k2, `${(x.d * 100).toFixed(1)} (${x.t}초 ${x.bone} → ${x.box})`])); R2.메시_중심과_몸_원점_수평_m = r.coord;
  for (const [k2, x] of Object.entries(r.part)) if (x.d > (tot.part[k2]?.d ?? 0)) tot.part[k2] = { ...x, id }; tot.coord = Math.max(tot.coord, r.coord ?? 0);
  ATTD[id] = r.att; out.scenes[id] = R2; tot.palm = Math.max(tot.palm, r.palm); tot.tipGap = Math.max(tot.tipGap || 0, r.tipGap || 0); tot.palmPt = Math.max(tot.palmPt || 0, r.palmPt || 0); tot.ankle = Math.max(tot.ankle, r.ankle); tot.gap = Math.max(tot.gap, r.gap); tot.att.push(...r.att.map(x => id + ' ' + x)); tot.fast.push(...r.fast.map(x => id + ' ' + x));
  for (const k of ['penBody', 'penContact']) if (r[k].d > tot[k].d) tot[k] = { ...r[k], id };
  tot.tr = tot.tr || {}; for (const [k2, x] of Object.entries(r.tr)) if (x.d > (tot.tr[k2]?.d ?? 0)) tot.tr[k2] = { ...x, id }; if (r.holdN && !r.tipN) (tot.noTip = tot.noTip || []).push(id); tot.tipScenes = (tot.tipScenes || 0) + (r.tipN ? 1 : 0);
  console.log(`■ ${id} ${title.slice(0, 40)}… 손목 ${R2.손목_어긋남_mm}mm · 손끝–턱 ${R2.손가락끝_턱까지_mm}mm · 발목 ${R2.발목_어긋남_mm}mm · IK 못 닿음 ${R2.IK_못_닿음_mm}mm · 붙은 팔다리 300°/s 넘음 ${r.att.length} · 900°/s 넘음 ${r.fast.length} · 관통 몸 ${R2.메시_관통_몸통팔다리_cm}cm(${R2.그때}) 손발 ${R2.메시_관통_손발_cm}cm(${R2.그때_손발})`);
}
let nFail = 0; const ok = (c, m) => { if (!c) nFail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); };
console.log(`\n[${out.mode} · ${out.body}] 장면 ${all.length}개`);
ok(tot.palm < 0.01, `잡은 손: 새 몸의 손목이 제어 뼈대의 손목에서 1cm 안 — 가장 큰 ${(tot.palm * 1000).toFixed(2)}mm`);
if (OLD) console.log('해당 없음  잡은 손의 손가락 끝(옛 몸에는 손가락이 없다)'); else ok(!(tot.noTip || []).length && tot.tipScenes > 0 && tot.tipGap < 0.02, `잡은 손: 손가락 끝(넷 중 가장 가까운 것)이 잡은 턱에서 2cm 안(표본 있는 장면 ${tot.tipScenes || 0}개, 잡았는데 표본 없는 장면 ${(tot.noTip || []).join(',') || '없음'}) — 가장 먼 ${((tot.tipGap || 0) * 1000).toFixed(1)}mm · (기록) 손바닥 자리가 제어 뼈대의 손바닥 자리와 다른 거리 ${(tot.palmPt * 1000).toFixed(1)}mm`);
ok(tot.ankle < 0.01, `디딘 발: 새 몸의 발목이 제어 뼈대의 발목에서 1cm 안 — 가장 큰 ${(tot.ankle * 1000).toFixed(2)}mm`);
ok(tot.gap < 0.005, `새 몸의 팔다리가 제어 뼈대의 손목·발목에 닿는다(못 닿은 거리 5mm 안) — 가장 큰 ${(tot.gap * 1000).toFixed(2)}mm`);
ok(!tot.att.length, `새 몸의 붙은 팔다리(잡은 팔·디딘 다리)가 초속 300°를 넘지 않는다 — ${tot.att.length}번 ${tot.att.slice(0, 4).join(' · ')}`);
console.log(`기록  새 몸의 뼈(손가락 제외)가 초속 900°를 넘은 걸음 ${tot.fast.length}번 ${tot.fast.slice(0, 4).join(' · ')}`);
console.log(`기록  새 몸의 메시가 지형에 들어간 가장 깊은 곳: 몸통·팔다리 ${(tot.penBody.d * 100).toFixed(1)}cm(${tot.penBody.id || ''} ${tot.penBody.t ?? ''}초 ${tot.penBody.bone || ''} → ${tot.penBody.box || ''}) · 손·발 ${(tot.penContact.d * 100).toFixed(1)}cm(${tot.penContact.id || ''} ${tot.penContact.bone || ''} → ${tot.penContact.box || ''}) — 12걸음마다 정점 전부`);
console.log(`기록  부위별 가장 깊은 관통(${PEN_EVERY}걸음마다 정점 전부, 세계 좌표): ` + ['torso', 'leg', 'arm', 'head', 'hand', 'foot'].map(k2 => { const x = tot.part[k2]; return `${k2} ${x ? (x.d * 100).toFixed(1) + 'cm(' + x.id + ' ' + x.t + '초 ' + x.bone + ' → ' + x.box + ')' : '0'}`; }).join(' · '));
console.log(`기록  전환(잡기·놓기·디딤·뗌 뒤 0.3초, 매 걸음) 중의 가장 깊은 관통: ` + ['torso', 'leg', 'arm', 'head', 'hand', 'foot'].map(k2 => { const x = (tot.tr || {})[k2]; return `${k2} ${x ? (x.d * 100).toFixed(1) + 'cm(' + x.id + ' ' + x.t + '초 ' + x.bone + ' → ' + x.box + ')' : '0'}`; }).join(' · '));
// 좌표 확인: 정점의 세계 자리가 몸 근처에 있는가(0.10.0처럼 지역 좌표로 재면 옛 몸은 2.65m 떨어진다)
ok(tot.coord < 0.4, `메시 정점을 세계 좌표로 잰다: 첫 걸음의 메시 중심이 몸 원점에서 수평 ${tot.coord.toFixed(3)}m(0.4m 안)`);
// 변환 확인(새 몸만): 새 몸 전체를 다른 부모(옮기고 돌린 것) 아래에 두고 다시 옮겨도 정점의 세계 자리가 같아야 한다
if (!OLD) { const world = makeWorld(), sim = mkSim__(rig, world, clips); sim.reset({ pos: START, yaw: Math.PI }); sim.opt.wallRest = false; for (let k = 0; k < 400; k++) sim.step({ mx: 0, mz: 0, cxSign: 1, cmd: k === 60 ? [{ type: 'hand', i: 0, p: [-0.72, 1.92, -2.84] }] : [] });
  R.apply(sim.fing, sim.pron); const snap = () => H.meshes.flatMap(m => { m.updateMatrixWorld(true); const v = new THREE.Vector3(), o = []; for (let j = 0; j < m.geometry.attributes.position.count; j += 11) o.push(worldVert(m, j, v).clone()); return o; });
  const a = snap(), par = new THREE.Group(); par.position.set(1.3, 0.4, -2.1); par.rotation.set(0.2, 0.9, -0.1); par.add(H.root); par.updateMatrixWorld(true); R.apply(sim.fing, sim.pron); const b = snap(); par.remove(H.root); R.apply(sim.fing, sim.pron);
  const dmax = Math.max(...a.map((p, i) => p.distanceTo(b[i])));
  ok(dmax < 1e-4, `새 몸을 옮기고 돌린 부모 아래에 두어도 정점의 세계 자리가 같다 — 가장 큰 차이 ${(dmax * 1000).toFixed(4)}mm`); }
out.합계 = { 손바닥_mm: tot.palm * 1000, 발목_mm: tot.ankle * 1000, IK_mm: tot.gap * 1000, 붙은_팔다리: tot.att, 빠른_뼈: tot.fast.length, 관통_몸: tot.penBody, 관통_손발: tot.penContact, 부위별: tot.part, 좌표_확인_m: tot.coord };
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ 실행_출처: __P, ...out }, null, 1)); if (process.env.ATTDUMP) fs.writeFileSync(process.env.ATTDUMP, JSON.stringify(ATTD));
if (nFail) process.exitCode = 1;
