// 사람형 몸(p3d-0.10.0)이 제어 뼈대·접촉과 맞는지 잰다. 장면은 scenes_foot.mjs(발 장면 9 + 한 손 뻗기 6)와 같다. 스크립트 입력(사람 손 아님).
// 걸음마다(1/120초) 계산 → 새 몸에 옮김(main.js의 그리기와 같은 함수) → 잰다:
//   ① 접촉: 잡은 손 = 새 몸의 손바닥 자리(손목에서 손가락 쪽으로 CL.PALM)와 제어 뼈대의 손바닥 자리, 디딘 발 = 새 몸의 발목과 제어 뼈대의 발목
//   ② IK가 닿지 못한 거리(새 몸의 어깨·고관절에서 제어 뼈대의 손목·발목까지가 팔다리 길이보다 먼 만큼)
//   ③ 새 몸의 뼈가 도는 빠르기: 붙은 팔다리(잡은 팔·디딘 다리) 초속 300°, 어떤 뼈든(손가락 제외) 초속 900° — motion_scan.mjs와 같은 잣대(개발 쪽 기준)
//   ④ 새 몸의 메시가 지형에 들어간 깊이(12걸음마다, 정점 전부). 손바닥·발바닥이 닿는 곳은 접촉이므로 손·손가락·발 정점은 따로 센다
// 통과·실패: ①이 1cm 안, ②가 5mm 안, ③의 붙은 팔다리 사건이 없다. ④는 기록(기준을 정하지 않았다).
// 사용: node test/human_check.mjs [JSON]   캡처 동작: MODE=clip   장면 고르기: ONLY=foot2,reach2
// 옛 몸과 견주기: BODY=old — 옛 몸의 메시(제어 뼈대에 바로 붙은 것)로 ③④만 잰다(①②는 옮기는 단계가 없어 0)
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), imp = f => import(pathToFileURL(path.resolve(HERE, '../src', f)).href);
const THREE = await import('three');
const { buildCharacter } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js'), { CL } = await imp('climb.js'), { buildHuman, makeRetarget, humanPoints } = await imp('human.js');
const { SCENES_FOOT, SCENES, START } = await import('./scenes_foot.mjs');
const clip = process.env.MODE === 'clip', clips = clip ? JSON.parse(fs.readFileSync(path.resolve(HERE, '../assets_local/clips.json'), 'utf8')) : null;
const OLD = process.env.BODY === 'old', rig = buildCharacter(), V = () => new THREE.Vector3();
// 옛 몸: 제어 뼈대와 그 메시를 그대로 잰다(뼈 이름을 새 몸 이름으로 맞춰 같은 잣대를 쓴다)
const H = OLD ? { meshes: [rig.mesh], list: rig.list } : buildHuman(), R = OLD ? { apply() { rig.root.updateMatrixWorld(true); }, info: { maxIKGap: 0 } } : makeRetarget(rig, H);
const ALIAS = { 'upLeg.L': 'thigh_l', 'leg.L': 'calf_l', 'upLeg.R': 'thigh_r', 'leg.R': 'calf_r', 'upperArm.L': 'upperarm_l', 'foreArm.L': 'lowerarm_l', 'upperArm.R': 'upperarm_r', 'foreArm.R': 'lowerarm_r', 'hand.L': 'hand_l', 'hand.R': 'hand_r', 'foot.L': 'foot_l', 'foot.R': 'foot_r', 'toe.L': 'ball_l', 'toe.R': 'ball_r', hips: 'pelvis' };
const nm0 = b => OLD ? (ALIAS[b.name] || b.name) : b.name;
const LIMB = { thigh_l: ['foot', 0], calf_l: ['foot', 0], thigh_r: ['foot', 1], calf_r: ['foot', 1], upperarm_l: ['hand', 0], lowerarm_l: ['hand', 0], upperarm_r: ['hand', 1], lowerarm_r: ['hand', 1] };
const FING = /^(index|middle|ring|pinky|thumb)/, CONTACT = /^(hand|index|middle|ring|pinky|thumb|foot|ball)/;
// 정점마다 가장 큰 몫의 뼈 이름(관통을 어느 부위가 했는지 적는다)
const vb = H.meshes.map(m => { const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight, out = []; for (let k = 0; k < si.count; k++) { let b = 0, w = -1; for (let j = 0; j < 4; j++) if (sw.getComponent(k, j) > w) { w = sw.getComponent(k, j); b = si.getComponent(k, j); } out.push(nm0(H.list[b])); } return out; });
const all = [...SCENES_FOOT.map((s, i) => ['foot' + (i + 1), ...s]), ...SCENES.map((s, i) => ['reach' + (i + 1), ...s])].filter(s => !process.env.ONLY || process.env.ONLY.split(',').includes(s[0]));
const out = { mode: clip ? 'clip' : 'proc', body: OLD ? 'old' : 'human', scenes: {} }, tot = { palm: 0, ankle: 0, gap: 0, att: [], fast: [], penBody: { d: 0 }, penContact: { d: 0 } };
for (const [id, title, fn, assist, mode, st0] of all) {
  const world = makeWorld(), sim = makeSim(rig, world, clips); sim.reset({ pos: st0 || START, yaw: Math.PI }); sim.opt.wallRest = false; sim.opt.footAssist = !!assist;
  const inputs = [], put = (inp = {}, cmd = []) => inputs.push({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd }), rep = (n, inp, cmd) => { for (let i = 0; i < n; i++) put(inp, i ? [] : cmd); };
  fn(sim, put, rep);
  const prev = new Map(), r = { palm: 0, ankle: 0, gap: 0, att: [], fast: [], penBody: { d: 0 }, penContact: { d: 0 } }, v = V();
  for (let k = 0; k < inputs.length; k++) {
    sim.step(inputs[k]); R.apply(sim.fing, sim.pron); const K = sim.climb, t = (k + 1) / 120, P = OLD ? null : humanPoints(H, CL.PALM);
    r.gap = Math.max(r.gap, R.info.maxIKGap);
    if (K.on && !OLD) for (let i = 0; i < 2; i++) { const s = i ? 'R' : 'L';
      if (K.hands[i].st === 'hold') r.palm = Math.max(r.palm, P[`palm.${s}`].distanceTo(rig.bones[`hand.${s}`].localToWorld(V().set(0, -CL.PALM, 0))));
      if (K.feet[i].st === 'plant') r.ankle = Math.max(r.ankle, P[`ankle.${s}`].distanceTo(rig.bones[`foot.${s}`].getWorldPosition(V()))); }
    for (const b of H.list) { const bn = nm0(b); if (FING.test(bn) || /leaf/.test(bn)) continue; const q = b.getWorldQuaternion(new THREE.Quaternion()), p = prev.get(bn); prev.set(bn, q); if (!p || k < 2) continue;
      const w = p.angleTo(q) * 180 / Math.PI * 120, L = LIMB[bn], att = L && K.on && (L[0] === 'foot' ? K.feet[L[1]].st === 'plant' : K.hands[L[1]].st === 'hold');
      if (att && w > 300) r.att.push(`${t.toFixed(3)}초 ${bn} ${Math.round(w)}°/s`); else if (w > 900) r.fast.push(`${t.toFixed(3)}초 ${bn} ${Math.round(w)}°/s`); }
    if (k % 12 === 0) H.meshes.forEach((m, mi) => { const n = m.geometry.attributes.position.count; for (let j = 0; j < n; j++) { m.getVertexPosition(j, v);
      for (const bx of world.boxes) { if (v.x <= bx.min.x || v.x >= bx.max.x || v.y <= bx.min.y || v.y >= bx.max.y || v.z <= bx.min.z || v.z >= bx.max.z) continue;
        const d = Math.min(v.x - bx.min.x, bx.max.x - v.x, v.y - bx.min.y, bx.max.y - v.y, v.z - bx.min.z, bx.max.z - v.z), nm = vb[mi][j], slot = CONTACT.test(nm) ? r.penContact : r.penBody;
        if (d > slot.d) Object.assign(slot, { d, bone: nm, box: bx.name, t: +t.toFixed(3) }); } } });
  }
  const R2 = { 제목: title, 손바닥_어긋남_mm: +(r.palm * 1000).toFixed(2), 발목_어긋남_mm: +(r.ankle * 1000).toFixed(2), IK_못_닿음_mm: +(r.gap * 1000).toFixed(2), 붙은_팔다리_300도_넘음: r.att.length, 그_목록: r.att.slice(0, 6), 뼈_900도_넘음: r.fast.length, 빠른_목록: r.fast.slice(0, 6),
    메시_관통_몸통팔다리_cm: +(r.penBody.d * 100).toFixed(1), 그때: r.penBody.bone ? `${r.penBody.t}초 ${r.penBody.bone} → ${r.penBody.box}` : '', 메시_관통_손발_cm: +(r.penContact.d * 100).toFixed(1), 그때_손발: r.penContact.bone ? `${r.penContact.t}초 ${r.penContact.bone} → ${r.penContact.box}` : '' };
  out.scenes[id] = R2; tot.palm = Math.max(tot.palm, r.palm); tot.ankle = Math.max(tot.ankle, r.ankle); tot.gap = Math.max(tot.gap, r.gap); tot.att.push(...r.att.map(x => id + ' ' + x)); tot.fast.push(...r.fast.map(x => id + ' ' + x));
  for (const k of ['penBody', 'penContact']) if (r[k].d > tot[k].d) tot[k] = { ...r[k], id };
  console.log(`■ ${id} ${title.slice(0, 40)}… 손바닥 ${R2.손바닥_어긋남_mm}mm · 발목 ${R2.발목_어긋남_mm}mm · IK 못 닿음 ${R2.IK_못_닿음_mm}mm · 붙은 팔다리 300°/s 넘음 ${r.att.length} · 900°/s 넘음 ${r.fast.length} · 관통 몸 ${R2.메시_관통_몸통팔다리_cm}cm(${R2.그때}) 손발 ${R2.메시_관통_손발_cm}cm(${R2.그때_손발})`);
}
const ok = (c, m) => console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`);
console.log(`\n[${out.mode} · ${out.body}] 장면 ${all.length}개`);
ok(tot.palm < 0.01, `잡은 손: 새 몸의 손바닥 자리가 제어 뼈대의 손바닥 자리에서 1cm 안 — 가장 큰 ${(tot.palm * 1000).toFixed(2)}mm`);
ok(tot.ankle < 0.01, `디딘 발: 새 몸의 발목이 제어 뼈대의 발목에서 1cm 안 — 가장 큰 ${(tot.ankle * 1000).toFixed(2)}mm`);
ok(tot.gap < 0.005, `새 몸의 팔다리가 제어 뼈대의 손목·발목에 닿는다(못 닿은 거리 5mm 안) — 가장 큰 ${(tot.gap * 1000).toFixed(2)}mm`);
ok(!tot.att.length, `새 몸의 붙은 팔다리(잡은 팔·디딘 다리)가 초속 300°를 넘지 않는다 — ${tot.att.length}번 ${tot.att.slice(0, 4).join(' · ')}`);
console.log(`기록  새 몸의 뼈(손가락 제외)가 초속 900°를 넘은 걸음 ${tot.fast.length}번 ${tot.fast.slice(0, 4).join(' · ')}`);
console.log(`기록  새 몸의 메시가 지형에 들어간 가장 깊은 곳: 몸통·팔다리 ${(tot.penBody.d * 100).toFixed(1)}cm(${tot.penBody.id || ''} ${tot.penBody.t ?? ''}초 ${tot.penBody.bone || ''} → ${tot.penBody.box || ''}) · 손·발 ${(tot.penContact.d * 100).toFixed(1)}cm(${tot.penContact.id || ''} ${tot.penContact.bone || ''} → ${tot.penContact.box || ''}) — 12걸음마다 정점 전부`);
out.합계 = { 손바닥_mm: tot.palm * 1000, 발목_mm: tot.ankle * 1000, IK_mm: tot.gap * 1000, 붙은_팔다리: tot.att, 빠른_뼈: tot.fast.length, 관통_몸: tot.penBody, 관통_손발: tot.penContact };
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
