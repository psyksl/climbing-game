// 사람형 몸(p3d-0.10.0): Quaternius UAL2 남성 마네킹(CC0)의 메시·65개 뼈를 읽어, 제어 뼈대(rig.js의 21개 뼈)의 자세를 그대로 옮겨 그린다.
// 물리·접촉·자세 계산은 제어 뼈대가 한다(climb.js·motion.js). 이 파일은 그 확정된 자세를 새 몸에 옮기기만 한다 — 계산 상태를 바꾸지 않는다.
//   ① 몸통·쇄골·머리: 제어 뼈의 세계 회전 × 쉬는 자세의 차이(C). 쉬는 자세에서 두 뼈대의 관절 자리가 같도록 rig.js의 BODY_HUMAN 치수를 쟀다
//   ② 팔·다리: 제어 뼈대의 손목·발목 자리로 두 마디 IK(새 몸의 길이). 비틀림(팔꿈치·무릎이 향하는 쪽)은 제어 뼈의 앞(+z) 축을 따른다
//   ③ 손·발: 제어 뼈의 회전을 옮긴다(손 = 손가락 쪽 −y·손바닥 +z, 발 = 발볼 쪽·위). 손목의 비틀림은 아래팔과 절반씩 나눈다
//   ④ 손가락: 제어 뼈대에 없다. sim이 계산 걸음마다 정하는 굽힘 값(S.fing)을 읽어 굽힌다
import * as THREE from 'three';
import DATA from './human_data.json' with { type: 'json' };
import { DIM } from './rig.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), Q = () => new THREE.Quaternion();
const UP = V(0, 1, 0), FWD = V(0, 0, 1);
const dec = b64 => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; };
// 임시 색(그래픽은 GPT 담당): 몸 = 밝은 회색, 관절 = 짙은 회색, 왼손·왼발 = 붉은 쪽, 오른손·오른발 = 푸른 쪽(누가 어느 쪽인지 보이게. 지난 몸과 같은 뜻)
const COL = { main: new THREE.Color('#c9c3b8'), joint: new THREE.Color('#5d636b'), L: new THREE.Color('#e0705c'), R: new THREE.Color('#4f9be0') };
const SIDE_OF = n => /_(l)$|_l$/.test(n) ? 'L' : /_(r)$|_r$/.test(n) ? 'R' : '';
const TINT = /^(hand|index|middle|ring|pinky|thumb|foot|ball)/;

export function buildHuman() {
  const bones = {}, list = [];
  for (const d of DATA.bones) { const b = new THREE.Bone(); b.name = d.name; b.position.fromArray(d.t); b.quaternion.fromArray(d.q); b.scale.fromArray(d.s); bones[d.name] = b; list.push(b); }
  const root = new THREE.Group(); root.name = 'human';
  for (const d of DATA.bones) (d.parent ? bones[d.parent] : root).add(bones[d.name]);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(list), meshes = [];
  for (const m of DATA.meshes) {
    const g = new THREE.BufferGeometry(), qp = new Uint16Array(dec(m.pos)), qn = new Int8Array(dec(m.nor)), n = m.n, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
    for (let k = 0; k < n * 3; k++) { pos[k] = m.lo[k % 3] + qp[k] / 65535 * m.sz[k % 3]; nor[k] = qn[k] / 127; }
    const si = new Uint8Array(dec(m.si)), sw = new Uint8Array(dec(m.sw)), w = new Float32Array(n * 4); for (let k = 0; k < n * 4; k++) w[k] = sw[k] / 255;
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Array.from(si), 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(w, 4));
    if (m.idx) g.setIndex(new THREE.BufferAttribute(m.idx32 ? new Uint32Array(dec(m.idx)) : new Uint16Array(dec(m.idx)), 1));
    const joint = m.mat === 'M_Joints', col = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) { let bi = 0, bw = -1; for (let j = 0; j < 4; j++) if (w[k * 4 + j] > bw) { bw = w[k * 4 + j]; bi = si[k * 4 + j]; }
      const nm = list[bi].name, s = SIDE_OF(nm), c = s && TINT.test(nm) ? COL[s] : joint ? COL.joint : COL.main; col.set([c.r, c.g, c.b], k * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mesh = new THREE.SkinnedMesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 }));
    mesh.castShadow = true; mesh.frustumCulled = false; mesh.name = m.name; root.add(mesh); mesh.bind(skeleton, new THREE.Matrix4()); meshes.push(mesh);
  }
  // 쉬는 자세(= bind 자세)의 세계 회전·자리
  const bindQ = {}, bindP = {}, bindL = {};
  for (const b of list) { bindQ[b.name] = b.getWorldQuaternion(Q()); bindP[b.name] = b.getWorldPosition(V()); bindL[b.name] = b.quaternion.clone(); }
  return { root, meshes, skeleton, bones, list, bindQ, bindP, bindL, clips: DATA.clips.map(decodeClip), source: DATA.source };
}
// 어깨 둘레의 국소 무게 편집(p3d-0.10.2 실험, 기본 끔 — test/shoulder_check.mjs가 견준다): 쇄골·위팔·가슴(spine_03) 무게가 섞인 정점에서 그 세 뼈의 무게만 메시 이웃(같은 자리 정점 포함)의 평균 쪽으로 n번 끌어온다.
//   세 뼈 무게의 합과 다른 뼈의 무게는 그대로. 0.10.1의 SHOULDER=1(팔 축을 따라 다시 나눔)과 다른 방법이다
export function smoothShoulder(H, n = 3, k = 0.5) { for (const m of H.meshes) { const g = m.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, N = si.count, idx = g.index.array, P = g.attributes.position;
  for (const s of ['l', 'r']) { const ids = [`clavicle_${s}`, `upperarm_${s}`, 'spine_03'].map(nm => H.list.findIndex(b => b.name === nm)), W = new Float32Array(N * 3), mix = new Uint8Array(N);
    for (let v = 0; v < N; v++) { let c = 0; for (let j = 0; j < 4; j++) { const t = ids.indexOf(si.getComponent(v, j)); if (t >= 0) { W[v * 3 + t] = sw.getComponent(v, j); if (sw.getComponent(v, j) > 0.05) c++; } } if (c >= 2) mix[v] = 1; }
    const nb = Array.from({ length: N }, () => new Set()); for (let t = 0; t < idx.length; t += 3) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (a !== b) nb[idx[t + a]].add(idx[t + b]);
    const key = v => `${P.getX(v).toFixed(4)},${P.getY(v).toFixed(4)},${P.getZ(v).toFixed(4)}`, same = new Map(); for (let v = 0; v < N; v++) { if (!mix[v]) continue; const kk = key(v); if (!same.has(kk)) same.set(kk, []); same.get(kk).push(v); }
    for (const grp of same.values()) for (const v of grp) for (const u of grp) if (u !== v) nb[v].add(u);
    for (let it = 0; it < n; it++) { const W2 = W.slice(); for (let v = 0; v < N; v++) { if (!mix[v]) continue; const tot = W[v * 3] + W[v * 3 + 1] + W[v * 3 + 2]; if (tot < 1e-6) continue; const av = [0, 0, 0]; let c = 0;
        for (const u of nb[v]) { const tu = W[u * 3] + W[u * 3 + 1] + W[u * 3 + 2]; if (tu < 1e-6) continue; for (let t = 0; t < 3; t++) av[t] += W[u * 3 + t] / tu; c++; } if (!c) continue;
        for (let t = 0; t < 3; t++) W2[v * 3 + t] = tot * ((1 - k) * W[v * 3 + t] / tot + k * av[t] / c); } W.set(W2); }
    for (let v = 0; v < N; v++) { if (!mix[v]) continue; for (let t = 0; t < 3; t++) { let j = -1; for (let q = 0; q < 4; q++) if (si.getComponent(v, q) === ids[t]) j = q; if (j < 0 && W[v * 3 + t] > 1e-4) { for (let q = 0; q < 4; q++) if (sw.getComponent(v, q) < 1e-4) { j = q; si.setComponent(v, q, ids[t]); break; } } if (j >= 0) sw.setComponent(v, j, W[v * 3 + t]); } }
  } si.needsUpdate = true; sw.needsUpdate = true; } }
function decodeClip(c) { const r = new Int16Array(dec(c.rot)), nb = DATA.bones.length; return { ...c, nb, q: (f, i, out) => out.set(r[(f * nb + i) * 4] / 32767, r[(f * nb + i) * 4 + 1] / 32767, r[(f * nb + i) * 4 + 2] / 32767, r[(f * nb + i) * 4 + 3] / 32767).normalize() }; }

// 원본 동작을 새 몸에 그대로 튼다(비교용, 물리 없음). t = 초. 뿌리·골반의 자리도 원본 그대로(RM 동작이면 몸이 원본 이동만큼 간다)
export function playClip(H, clip, t, at = V(), yaw = 0) {
  const ff = Math.min(clip.nf - 1, Math.max(0, t * clip.fps)), f0 = Math.floor(ff), f1 = Math.min(clip.nf - 1, f0 + 1), a = ff - f0, q0 = Q(), q1 = Q();
  H.list.forEach((b, i) => { clip.q(f0, i, q0); clip.q(f1, i, q1); b.quaternion.copy(q0).slerp(q1, a); });
  for (const k of ['pelvis', 'root']) { const p = clip.pos[k], b = H.bones[k]; b.position.set(p[f0 * 3] + (p[f1 * 3] - p[f0 * 3]) * a, p[f0 * 3 + 1] + (p[f1 * 3 + 1] - p[f0 * 3 + 1]) * a, p[f0 * 3 + 2] + (p[f1 * 3 + 2] - p[f0 * 3 + 2]) * a); }
  H.root.position.copy(at); H.root.quaternion.setFromAxisAngle(UP, yaw); H.root.updateMatrixWorld(true);
}
export function restPose(H) { for (const b of H.list) { const d = DATA.bones.find(x => x.name === b.name); b.position.fromArray(d.t); b.quaternion.fromArray(d.q); } H.root.position.set(0, 0, 0); H.root.quaternion.identity(); H.root.updateMatrixWorld(true); }

// 축 둘(주축 a, 보조 s)을 맞추는 회전: R·aL = aW, R·sL ≈ sW
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
function basis(a, s, m) { const x = a.clone().normalize(), y = s.clone().addScaledVector(x, -s.dot(x)); if (y.lengthSq() < 1e-10) y.copy(Math.abs(x.y) < 0.9 ? UP : FWD).addScaledVector(x, -(Math.abs(x.y) < 0.9 ? x.y : x.z)); y.normalize(); const z = x.clone().cross(y); return m.makeBasis(x, y, z); }
function alignQ(aL, sL, aW, sW) { basis(aW, sW, _m1); basis(aL, sL, _m2); return Q().setFromRotationMatrix(_m1.multiply(_m2.transpose())); }
function setWorld(b, q, p = null) { const pq = b.parent.getWorldQuaternion(Q()); b.quaternion.copy(pq.invert().multiply(q)); if (p) b.position.copy(b.parent.worldToLocal(p.clone())); b.updateMatrixWorld(true); }
const wq = b => b.getWorldQuaternion(Q()), wp = b => b.getWorldPosition(V());

// 제어 뼈대 → 새 몸 연결표. [제어 뼈, 새 뼈, 제어 뼈의 주축·보조축(지역), 새 뼈의 주축·보조축(쉬는 자세의 세계 방향 또는 자식 뼈 쪽)]
const MAP = [];
const T = (o, h) => MAP.push({ o, h, aO: UP, sO: FWD, aH: 'up', sH: 'fwd' });
T('hips', 'pelvis'); T('spine', 'spine_01'); T('chest', 'spine_03'); T('neck', 'neck_01'); T('head', 'Head');
for (const [s, h] of [['L', 'l'], ['R', 'r']]) {
  T(`shoulder.${s}`, `clavicle_${h}`);
  MAP.push({ o: `upperArm.${s}`, h: `upperarm_${h}`, aO: V(0, -1, 0), sO: FWD, aH: `lowerarm_${h}`, sH: 'fwd', limb: 'arm', side: s });
  MAP.push({ o: `foreArm.${s}`, h: `lowerarm_${h}`, aO: V(0, -1, 0), sO: FWD, aH: `hand_${h}`, sH: 'fwd' });
  MAP.push({ o: `hand.${s}`, h: `hand_${h}`, aO: V(0, -1, 0), sO: FWD, aH: `middle_01_${h}`, sH: 'down' }); // 손바닥: 새 몸의 쉬는 자세(T자)에서 손바닥은 아래(−y)
  MAP.push({ o: `upLeg.${s}`, h: `thigh_${h}`, aO: V(0, -1, 0), sO: FWD, aH: `calf_${h}`, sH: 'fwd', limb: 'leg', side: s });
  MAP.push({ o: `leg.${s}`, h: `calf_${h}`, aO: V(0, -1, 0), sO: FWD, aH: `foot_${h}`, sH: 'fwd' });
  MAP.push({ o: `foot.${s}`, h: `foot_${h}`, aO: 'toe', sO: UP, aH: `ball_${h}`, sH: 'up' });
  MAP.push({ o: `toe.${s}`, h: `ball_${h}`, aO: FWD, sO: UP, aH: `ball_leaf_${h}`, sH: 'up' });
}
// HAND_TILT = 잡은 손의 기울기: 물리의 손목 자리와 같은 접촉 틀(rig.js DIM.grip)
const FING_T = 1.5, FINGERS = ['index', 'middle', 'ring', 'pinky'], WRIST_MAX = (DIM.grip && DIM.grip.wristMax ? DIM.grip.wristMax : 70) * Math.PI / 180, HAND_TILT = (DIM.grip ? DIM.grip.tilt : 14) * Math.PI / 180, FINGER_R = 0.009, FINGER_RH = 0.012, SH_R = 0.075, PRON = 80 * Math.PI / 180, SCAP_UP = 28 * Math.PI / 180, SCAP_FWD = 10 * Math.PI / 180;

// 연결기를 만든다. ctrl = rig.js의 제어 뼈대(쉬는 자세에서 만들어야 한다 — 모든 뼈의 쉬는 회전이 단위 회전)
export function makeRetarget(ctrl, H) {
  const dirW = (spec, name) => spec === 'up' ? UP.clone() : spec === 'fwd' ? FWD.clone() : spec === 'down' ? V(0, -1, 0) : H.bindP[spec].clone().sub(H.bindP[name]).normalize();
  for (const m of MAP) {
    const qi = H.bindQ[m.h].clone().invert();
    m.aHL = dirW(m.aH, m.h).applyQuaternion(qi); m.sHL = dirW(m.sH, m.h).applyQuaternion(qi);
    m.aOL = m.aO === 'toe' ? ctrl.bones[m.o].children[0].position.clone().normalize() : m.aO.clone(); m.sOL = m.sO.clone();
    m.len = m.limb ? [H.bindP[m.aH].distanceTo(H.bindP[m.h]), H.bindP[m.limb === 'arm' ? `hand_${m.h.slice(-1)}` : `foot_${m.h.slice(-1)}`].distanceTo(H.bindP[m.aH])] : null;
  }
  const by = Object.fromEntries(MAP.map(m => [m.h, m]));
  // 손가락의 굽는 축(지역): 손가락 방향 × 손바닥 쪽(쉬는 자세의 세계) → 각 마디의 지역 축
  const fingerAxis = {};
  for (const h of ['l', 'r']) for (const f of [...FINGERS, 'thumb']) for (let j = 1; j <= 3; j++) { const n = `${f}_0${j}_${h}`, c = `${f}_0${j + 1}${j === 3 ? '_leaf' : ''}_${h}`;
    const dir = H.bindP[c].clone().sub(H.bindP[n]).normalize(), palm = V(0, -1, 0), ax = f === 'thumb' ? dir.clone().cross(V(h === 'l' ? 0.6 : -0.6, -0.8, 0).normalize()) : dir.clone().cross(palm);
    fingerAxis[n] = ax.normalize().applyQuaternion(H.bindQ[n].clone().invert()); }
  const spine2Fix = H.bindQ.spine_01.clone().slerp(H.bindQ.spine_03, 0.5).invert().multiply(H.bindQ.spine_02);
  const tmp = { maxIKGap: 0 }, armPos0 = Object.fromEntries(['upperarm_l', 'upperarm_r'].map(n => [n, H.bones[n].position.clone()])); // 팔을 곧게 펴려고 옮긴 어깨 자리는 매번 원래 자리에서 다시 시작한다
  // 원본(T자) 자세로 돌려 둔 뒤 매번 다시 만든다 → 앞 장면의 값에 기대지 않는다(그리기 빈도와 무관)
  function apply(fing = [0.3, 0.3], pron = [0, 0], K = null, world = null, gwv = null) {
    ctrl.root.updateMatrixWorld(true);
    for (const b of H.list) b.quaternion.copy(H.bindL[b.name]);
    for (const n in armPos0) H.bones[n].position.copy(armPos0[n]);
    H.root.position.set(0, 0, 0); H.root.quaternion.identity(); H.root.updateMatrixWorld(true);
    const qO = n => wq(ctrl.bones[n]), mapQ = m => qO(m.o).multiply(alignQ(m.aHL, m.sHL, m.aOL, m.sOL));
    // ① 골반(자리 + 회전), 척추, 쇄골, 목·머리
    const hipsW = wp(ctrl.bones.hips);
    setWorld(H.bones.pelvis, mapQ(by.pelvis), hipsW); // 새 몸의 골반 = 제어 뼈대의 hips 자리
    setWorld(H.bones.spine_01, mapQ(by.spine_01));
    { const mid = mapQ(by.spine_01).slerp(mapQ(by.spine_03), 0.5); setWorld(H.bones.spine_02, mid.multiply(spine2Fix)); } // spine_02 = 둘의 가운데(쉬는 자세에서 원래 회전이 되도록 고친 값을 곱한다)
    setWorld(H.bones.spine_03, mapQ(by.spine_03)); setWorld(H.bones.neck_01, mapQ(by.neck_01)); setWorld(H.bones.Head, mapQ(by.Head));
    let gap = 0;
    for (const h of ['l', 'r']) {
      setWorld(H.bones[`clavicle_${h}`], mapQ(by[`clavicle_${h}`]));
      // 어깨뼈 리듬(그림만): 팔을 70°보다 높이 들면 쇄골의 바깥 끝을 들어 올린다(머리 위 180°에서 28°), 앞으로 뻗으면 조금 앞으로. 사람은 팔을 들 때 어깨뼈가 함께 돈다 — 없으면 머리 위로 든 팔에서 어깨가 구겨진다.
      //   어깨 관절의 자리가 제어 뼈대보다 몇 cm 올라가지만, 손목은 아래의 IK가 제어 뼈대의 손목 자리에 그대로 맞춘다(접촉은 바뀌지 않는다)
      { const s = h === 'l' ? 'L' : 'R', sx = h === 'l' ? 1 : -1, qc = qO('chest'), qi = qc.clone().invert(), ua = wp(ctrl.bones[`foreArm.${s}`]).sub(wp(ctrl.bones[`upperArm.${s}`])).normalize().applyQuaternion(qi);
        const e = Math.acos(THREE.MathUtils.clamp(-ua.y, -1, 1)) * 180 / Math.PI, up = THREE.MathUtils.clamp((e - 70) / 110, 0, 1) * SCAP_UP, fw = THREE.MathUtils.clamp(ua.z, 0, 1) * SCAP_FWD;
        if (up || fw) { const B = H.bones[`clavicle_${h}`], q0 = wq(B), put = k => setWorld(B, Q().setFromAxisAngle(V(0, 0, 1).applyQuaternion(qc), sx * up * k).multiply(Q().setFromAxisAngle(V(0, 1, 0).applyQuaternion(qc), -sx * fw * k)).multiply(q0));
          // 들린 어깨(어깨 관절 둘레 반지름 7.5cm)가 벽·턱에 들면 덜 든다(p3d-0.10.1, GPT 지적 "표시 쪽 쇄골 보정 뒤의 팔 형상도 충돌 검증에"): 1 → 0.66 → 0.33 → 0 가운데 들지 않는 가장 큰 것
          // p3d-0.11.2(사용자 지적: 한 손으로 매달린 팔이 "편 것도 굽힌 것도 아닌" 꺾인 모양): 어깨를 든 만큼 마네킹의 어깨–손목 거리가 짧아져, 계산 쪽 팔은 거의 다 폈는데(166~169°) 마네킹 팔은 117~139°로 굽고
          //   굽는 쪽의 기준이 없어 팔꿈치가 1초 사이에 바깥 → 반대쪽으로 넘어갔다. 마네킹 팔이 계산 쪽 팔보다 더 굽지 않는 만큼만 든다(펴진 비율이 계산 쪽보다 0.5% 넘게 작아지지 않는 가장 큰 들기. 2%로 두었을 때는 마네킹 팔이 155°로 아직 굽어 보였다)
          const ext = () => { if (globalThis.OLDSCAP) return true; const t = wp(ctrl.bones[`hand.${s}`]), [l1, l2] = by[`upperarm_${h}`].len, rc = wp(ctrl.bones[`upperArm.${s}`]).distanceTo(t) / (DIM.upperArm + DIM.foreArm); return wp(H.bones[`upperarm_${h}`]).distanceTo(t) / (l1 + l2) >= Math.min(rc, 0.995) - 0.005; };
          let kk = 1; put(1); for (let j = 9; j >= 0; j--) { if (ext()) break; kk = j / 10; put(kk); }
          if (world) { const nb = world.boxes.filter(bx => bx.kind !== 'floor'), hit = () => { const p = wp(H.bones[`upperarm_${h}`]); return nb.some(bx => inBox(p, bx, SH_R) > 0); };
            for (const k of [0.66, 0.33, 0].filter(k => k < kk)) { if (!hit()) break; put(k); } } } }
      // ② 팔: 어깨 → 제어 뼈대의 손목 자리로 IK. 굽는 쪽 = 제어 뼈대의 팔꿈치 쪽(팔이 거의 펴지면 제어 뼈의 앞 축이 정하는 쪽)
      for (const [up, lo, end] of [[`upperarm_${h}`, `lowerarm_${h}`, `hand_${h}`], [`thigh_${h}`, `calf_${h}`, `foot_${h}`]]) {
        const mU = by[up], mL = by[lo], s = mU.side, arm = mU.limb === 'arm', oU = ctrl.bones[mU.o], oL = ctrl.bones[mL.o], oE = ctrl.bones[arm ? `hand.${s}` : `foot.${s}`];
        const a = wp(H.bones[up]), t = wp(oE), [l1, l2] = mU.len, d0 = t.clone().sub(a), dist = d0.length(), u = d0.clone().normalize();
        const midO = wp(oL), pole = midO.clone().sub(wp(oU)); pole.addScaledVector(u, -pole.dot(u));
        const qU = mapQ(mU), fold = V().copy(mU.aHL).applyQuaternion(qU); // 회전만 옮겼을 때 위 마디가 향하는 쪽
        if (pole.lengthSq() < 1e-6) pole.copy(fold).addScaledVector(u, -fold.dot(u));
        if (pole.lengthSq() < 1e-8) pole.copy(V(0, 0, 1).applyQuaternion(qU)).addScaledVector(u, -V(0, 0, 1).applyQuaternion(qU).dot(u));
        pole.normalize();
        // p3d-0.11.2: 계산 쪽 팔이 98% 넘게 펴졌으면(매달린 팔) 그림에서는 곧게 편다 — 물리의 팔 길이 한계가 뼈 길이의 99.5%라 다 편 팔도 168°로 12° 굽어 보였다.
        //   손목 자리는 그대로 두고 마네킹 어깨를 팔을 따라 손목 쪽으로 모자란 만큼(최대 약 8mm) 옮긴다. 다리는 그대로(디딘 다리는 굽어 있는 것이 보통이다)
        if (arm && !globalThis.OLDSTRAIGHT) { const rc = wp(oU).distanceTo(t) / (DIM.upperArm + DIM.foreArm), w = THREE.MathUtils.clamp((rc - 0.98) / 0.015, 0, 1), want = (l1 + l2) * 0.9999;
          if (w > 0 && dist < want) { const shf = Math.min(want - dist, 0.012) * w; a.addScaledVector(u, -shf); H.bones[up].parent.updateMatrixWorld(true); setWorld(H.bones[up], wq(H.bones[up]), a); } }
        const d1 = t.clone().sub(a).length();
        const dd = THREE.MathUtils.clamp(d1, Math.abs(l1 - l2) + 1e-4, (l1 + l2) * 0.9999), ca = THREE.MathUtils.clamp((l1 * l1 + dd * dd - l2 * l2) / (2 * l1 * dd), -1, 1);
        const mid = a.clone().addScaledVector(u, l1 * ca).addScaledVector(pole, l1 * Math.sqrt(1 - ca * ca)), endP = a.clone().addScaledVector(u, dd);
        gap = Math.max(gap, Math.max(0, d1 - dd));
        setWorld(H.bones[up], alignQ(mU.aHL, mU.sHL, mid.clone().sub(a), V().copy(mU.sOL).applyQuaternion(qO(mU.o))));
        setWorld(H.bones[lo], alignQ(mL.aHL, mL.sHL, endP.clone().sub(mid), V().copy(mL.sOL).applyQuaternion(qO(mL.o))));
        // ③ 손·발: 제어 뼈의 회전을 옮긴다
        setWorld(H.bones[end], mapQ(by[end]));
        if (arm) { // 손목의 비틀림을 아래팔과 절반씩: 아래팔을 제 축으로 돌린다(손은 세계에서 그대로)
          // 잡은 손(p3d-0.10.1): 손바닥이 턱 앞면을 보게 세운다(손가락 쪽 = 위, 앞면을 따라). 손목은 아래팔에서 70°까지만 꺾는다. 0.10.0은 제어 뼈의 손(손목 → 턱 모서리 쪽)을 그대로 옮겨 두꺼운 손바닥이 턱에 3.5cm 들어갔다
          const Hd = K ? K.hands[h === 'l' ? 0 : 1] : null;
          // p3d-0.10.2: 놓은 손도(턱을 기억하고 세움 값이 남아 있으면) 같은 틀로 세운다 — 세움 값(S.gw)은 계산 걸음에서 턱과의 거리로 줄어든다
          if (Hd && Hd.edge && (Hd.st === 'hold' || Hd.st === 'reach' || (DIM.grip && gwv && gwv[h === 'l' ? 0 : 1] > 0.01))) { const n = Hd.n.clone().setY(0).normalize(), up = UP.clone().addScaledVector(n, -UP.dot(n)).normalize().multiplyScalar(Math.cos(HAND_TILT)).addScaledVector(n, -Math.sin(HAND_TILT)).normalize(), fa = V().copy(mL.aHL).applyQuaternion(wq(H.bones[lo])).normalize();
            let fd = up.clone(); const a = fd.angleTo(fa); if (a > WRIST_MAX) fd = fa.clone().lerp(fd, WRIST_MAX / a).normalize();
            // 세우는 정도는 손가락 굽힘 값(S.fing — 계산 걸음에서 0 → 1로 0.1초쯤에 오른다)을 따라간다. 한 걸음에 세우면 잡는 걸음에 아래팔이 크게 돌았다(6,674°/s — human_check로 찾음)
            const gw = gwv ? gwv[h === 'l' ? 0 : 1] : THREE.MathUtils.clamp((fing[h === 'l' ? 0 : 1] - 0.3) / 0.7, 0, 1); setWorld(H.bones[end], wq(H.bones[end]).slerp(alignQ(by[end].aHL, by[end].sHL, fd, n.clone().negate()), gw * gw * (3 - 2 * gw))); }
          const B = H.bones[lo], ax = V().copy(mL.aHL).applyQuaternion(wq(B)).normalize(), handQ = wq(H.bones[end]);
          const rel = wq(B).invert().multiply(handQ).multiply(H.bindQ[lo].clone().invert().multiply(H.bindQ[end]).invert()), tw = twistAbout(rel, mL.aHL); if (globalThis.__HTW) globalThis.__HTW.push([h, tw * 180 / Math.PI]);
          setWorld(B, Q().setFromAxisAngle(ax, tw * 0.5).multiply(wq(B))); setWorld(H.bones[end], handQ);
          // 놓인 손: 손바닥이 몸 쪽을 보게 아래팔째 돌린다(PRON). 손목 = 아래팔과 같은 만큼 → 비틀림이 손목에 몰리지 않는다
          const pr = pron[h === 'l' ? 0 : 1] * PRON * (h === 'l' ? 1 : -1);
          if (pr) { const tq = Q().setFromAxisAngle(ax, pr * 0.6); setWorld(B, tq.clone().multiply(wq(B))); setWorld(H.bones[end], Q().setFromAxisAngle(ax, pr).multiply(handQ)); }
        } else setWorld(H.bones[`ball_${h}`], mapQ(by[`ball_${h}`]));
      }
      // ④ 손가락
      const c = fing[h === 'l' ? 0 : 1], k = [70, 25, 12].map(x => x * Math.PI / 180), rel = [15, 22, 14].map(x => x * Math.PI / 180), open = [4, 6, 4].map(x => x * Math.PI / 180);
      const setF = (f, a1, a2, a3) => { [a1, a2, a3].forEach((ang, j) => { const n = `${f}_0${j + 1}_${h}`; H.bones[n].quaternion.copy(H.bindL[n]).multiply(Q().setFromAxisAngle(fingerAxis[n], ang)); }); H.bones[`${f}_01_${h}`].updateMatrixWorld(true); };
      const Hd = K ? K.hands[h === 'l' ? 0 : 1] : null, box = Hd && Hd.st === 'hold' && Hd.edge ? Hd.edge.box : null;
      for (const f of [...FINGERS, 'thumb']) {
        const ang = j => (c >= 0.3 ? rel[j] + (k[j] - rel[j]) * (c - 0.3) / 0.7 : open[j] + (rel[j] - open[j]) * c / 0.3) * (f === 'thumb' ? 0.5 : 1);
        if (!world) { setF(f, ang(0), ang(1), ang(2)); continue; }
        if (!box || f === 'thumb') { // 엄지는 잡은 손에서도 이 길(정한 굽힘에 가깝게, 들면 덜 드는 쪽) // 놓인·뻗는 손(p3d-0.10.1): 새 몸의 손이 제어 뼈대보다 6cm 길어 손가락이 벽에 들었다(9.9cm) → 정한 굽힘에서 들면 덜 드는 굽힘 가운데 정한 값에 가장 가까운 것
          setF(f, ang(0), ang(1), ang(2)); const hw0 = wp(H.bones[`hand_${h}`]), nb = world.boxes.filter(bx => bx.kind !== 'floor' && inBox(hw0, bx, 0.30) > 0); if (!nb.length) continue;
          const pts = () => [`${f}_02_${h}`, `${f}_03_${h}`, `${f}_04_leaf_${h}`].map(nm => wp(H.bones[nm])).concat(DIM.grip && f === 'thumb' ? [wp(H.bones[`${f}_01_${h}`]).lerp(wp(H.bones[`${f}_02_${h}`]), 0.5)] : []); // p3d-0.10.2: 엄지는 뿌리 마디(01) 가운데도 본다 — 잡은 손의 엄지 뿌리가 턱 앞면에 11mm 들었다(grip_check)
          const penAt = () => Math.max(0, ...pts().flatMap(p => nb.map(bx => inBox(p, bx, FINGER_R))));
          if (penAt() <= 1e-4) continue; const base = ang(0); let bst = null;
          // p3d-0.11.7(자세 정리 ⑪): 잡지 않은 손(뻗는 손·놓인 손·땅의 손)은 편 손가락이 든 깊이에 비례해 굽힌다(1.5cm에 110°까지 — 3cm·45°는 잡기 직전 손이 턱에 11~25mm, 2cm·90°는 놓은 뒤 10mm·다시 잡기 직전 20mm 들었다) — "들지 않는 가장 가까운 굽힘"은 손이 움직이면 답이 10° ↔ 120° 사이를 걸음마다 오가 손가락이 떨었다(reach1 5.48~5.53초, 0.1초에 오간 길 493°; 땅에서 늘어뜨린 손 u9 9.08초 453°). 깊이는 손 자리에 따라 이어서 바뀌므로 튀지 않는다. OLDFINGSM = 전처럼
          if (!globalThis.OLDFINGSM && !(Hd && Hd.st === 'hold')) { const p0 = penAt(), rP = base + Math.min(1, p0 / (globalThis.FING_PG ?? 0.015)) * (globalThis.FING_PMAX ?? 110) * Math.PI / 180; setF(f, rP, rP * 0.35, rP * 0.2); continue; }
          if (!globalThis.OLDFINGAV) { // p3d-0.11.6: 정한 굽힘에서 가장 조금 바꾼 들지 않는 굽힘(2°마다, 굽히는 쪽을 먼저. 턱으로 뻗는 손은 굽히는 쪽만 — 펴는 쪽과 번갈아 고르면 걸음마다 앞뒤로 떤다). 0.11.5까지는 10° 격자에서 "덜 듦 + 바꾼 양"의 값으로 골라 들기 직전의 두 끝(−20°와 110°)이 걸음마다 바뀌었다 — 뻗는 손의 손가락이 14,580°/s로 떨었다(test/hand_flip.mjs)
            const lo = -20 * Math.PI / 180, hi = 110 * Math.PI / 180, stp = 2 * Math.PI / 180;
            for (let dd = stp; dd <= hi - lo + 1e-6 && !bst; dd += stp) for (const r of (Hd && Hd.st === 'reach' && Hd.edge ? [base + dd] : [base + dd, base - dd])) { if (r < lo || r > hi) continue; setF(f, r, r * 0.35, r * 0.2); const pn = penAt(); if (pn <= 0.001) { bst = { r }; break; } if (!bst || pn < (bst.pn ?? 9)) bst = { r, pn, miss: true }; }
            if (bst && bst.miss) { let b2 = null; for (let a = -20; a <= 110; a += 2) { const r = a * Math.PI / 180; setF(f, r, r * 0.35, r * 0.2); const pn = penAt(), sc = pn * 1000 + Math.abs(r - base) * 2; if (!b2 || sc < b2.sc) b2 = { r, sc }; } bst = b2; } }
          else for (let a = -20; a <= 110; a += 10) { const r = a * Math.PI / 180; setF(f, r, r * 0.35, r * 0.2); const pn = penAt(), sc = pn * 1000 + Math.abs(r - base) * 2; if (!bst || sc < bst.sc) bst = { r, sc }; }
          setF(f, bst.r, bst.r * 0.35, bst.r * 0.2); continue; }
        // 잡은 손가락(p3d-0.10.1): 첫 마디를 0~110°(가운데·끝 마디는 0.35·0.2배)로 놓아 보고, 마디 자리가 턱 상자(손가락 굵기만큼 부풀림)에 들지 않는 가장 큰 굽힘을 고른다 — 손가락이 턱 윗면을 덮는다.
        //   모두 들면 가장 덜 드는 것. 0.10.0은 정해진 각(70°·25°·12°)으로 굽혀 손가락이 턱에 들었다
        let best = null; const hw = wp(H.bones[`hand_${h}`]), near = world ? world.boxes.filter(bx => bx.kind !== 'floor' && inBox(hw, bx, 0.30) > 0) : [box]; // 손목 30cm 안의 상자 모두(잡은 턱 뒤의 벽도)
        let cand = null;
        if (DIM.grip) { // p3d-0.10.2(사람형 몸, 접촉 틀): 첫 마디 굽힘(0~110°)과 가운데·끝 마디의 비(0~0.6)를 함께 찾아, 마디가 턱에 들지 않으면서 끝 마디 가운데(패드)가 잡은 턱의 겉에 가장 가까운 것을 고른다.
          //   0.10.1은 비를 0.35·0.2로 묶어 "들지 않는 가장 큰 굽힘"을 골랐다 — 첫 마디가 윗면 가까이 오면 끝 마디가 먼저 윗면에 닿아 손가락이 서 있는 채로 멈췄다(틈 6~24mm)
          //   마디 자리뿐 아니라 마디 사이의 가운데도 본다(마디 사이 메시가 윗면에 9mm 들었다). 마네킹 손가락의 굵기에 맞춰 반지름 FINGER_RH
          for (const rr of [0, 0.15, 0.3, 0.45, 0.6]) for (let a = 0; a <= 110; a += 5) { const r = a * Math.PI / 180; setF(f, r, r * rr, r * rr * 0.6); let pen = 0;
            const J = [`${f}_01_${h}`, `${f}_02_${h}`, `${f}_03_${h}`, `${f}_04_leaf_${h}`].map(nm => wp(H.bones[nm])), pts = [J[1], J[2], J[3], J[0].clone().lerp(J[1], 0.5), J[1].clone().lerp(J[2], 0.5), J[2].clone().lerp(J[3], 0.5)];
            for (const p of pts) for (const bx of near) pen = Math.max(pen, inBox(p, bx, FINGER_RH));
            const pad = wp(H.bones[`${f}_03_${h}`]).lerp(wp(H.bones[`${f}_04_leaf_${h}`]), 0.5), gap = Math.sqrt(Math.max(box.min.x - pad.x, 0, pad.x - box.max.x) ** 2 + Math.max(box.min.y - pad.y, 0, pad.y - box.max.y) ** 2 + Math.max(box.min.z - pad.z, 0, pad.z - box.max.z) ** 2) - FINGER_RH;
            const sc = pen * 4000 + Math.abs(gap - 0.003) * 1000 + Math.abs(rr - 0.3) * 2; if (!best || sc < best.sc) best = { a, rr, sc }; (cand || (cand = [])).push([a, rr, sc]); }
          // p3d-0.11.7(⑪): 격자의 가장 좋은 칸 하나가 아니라 가장 좋은 칸 둘레(값 차이 FING_T 안)의 무게 평균 — 손이 조금씩 움직일 때 가장 좋은 칸이 이웃 칸과 번갈아 바뀌어 손가락이 떨었다(h3 5.4초, 0.1초에 오간 길 83°). OLDFINGSM = 전처럼
          if (!globalThis.OLDFINGSM && cand) { let wS = 0, aS = 0, rS = 0; for (const [a, rr, sc] of cand) { const w = Math.exp(-(sc - best.sc) / FING_T); wS += w; aS += w * a; rS += w * rr; } best = { a: aS / wS, rr: rS / wS, sc: best.sc }; }
          // p3d-0.11.7(⑪): 잡는 순간 고른 굽힘으로 한 걸음에 가지 않고, 계산 걸음의 굽힘 값(S.fing — 잡은 뒤 0.07초쯤에 오름)을 따라 편 굽힘에서 옮겨 간다(잡는 걸음에 첫 마디가 110° 튀었다, u7 0.608초). OLDFINGSM = 전처럼
          const r = best.a * Math.PI / 180, wG = globalThis.OLDFINGSM ? 1 : THREE.MathUtils.clamp((c - 0.3) / 0.7, 0, 1), r0 = ang(0); setF(f, r0 + (r - r0) * wG, r0 * 0.35 + (r * best.rr - r0 * 0.35) * wG, r0 * 0.2 + (r * best.rr * 0.6 - r0 * 0.2) * wG); continue; }
        for (let a = 0; a <= 110; a += 10) { const r = a * Math.PI / 180; setF(f, r, r * 0.35, r * 0.2); let pen = 0;
          for (const nm of [`${f}_02_${h}`, `${f}_03_${h}`, `${f}_04_leaf_${h}`]) { const p = wp(H.bones[nm]); for (const bx of near) pen = Math.max(pen, inBox(p, bx, FINGER_R)); }
          if (!best || (pen <= 1e-4 && a >= best.a) || (best.pen > 1e-4 && pen < best.pen)) best = { a, pen }; }
        const r = best.a * Math.PI / 180; setF(f, r, r * 0.35, r * 0.2); }
    }
    H.root.updateMatrixWorld(true);
    tmp.maxIKGap = gap; return tmp;
  }
  return { apply, info: tmp };
}
// 점이 상자(r만큼 부풀림) 안에 든 깊이(가장 얕은 면까지). 밖이면 0
function inBox(p, b, r) { const d = Math.min(p.x - (b.min.x - r), b.max.x + r - p.x, p.y - (b.min.y - r), b.max.y + r - p.y, p.z - (b.min.z - r), b.max.z + r - p.z); return Math.max(0, d); }
// 회전 q(지역)를 축 a 둘레의 비틀림 각으로(스윙-트위스트 분해)
function twistAbout(q, a) { const n = a.clone().normalize(), p = V(q.x, q.y, q.z).dot(n), t = new THREE.Quaternion(n.x * p, n.y * p, n.z * p, q.w); if (t.lengthSq() < 1e-12) return 0; t.normalize(); let ang = 2 * Math.acos(THREE.MathUtils.clamp(t.w, -1, 1)); if (V(t.x, t.y, t.z).dot(n) < 0) ang = -ang; if (ang > Math.PI) ang -= 2 * Math.PI; if (ang < -Math.PI) ang += 2 * Math.PI; return ang; }
// 새 몸의 손바닥 자리(제어 뼈대의 CL.PALM과 같은 거리를 손가락 쪽으로)와 발볼·발끝 — 접촉 오차를 잴 때
export function humanPoints(H, palm = 0.08) {
  const out = {};
  for (const [s, h] of [['L', 'l'], ['R', 'r']]) { const w = wp(H.bones[`hand_${h}`]), m = wp(H.bones[`middle_01_${h}`]); out[`palm.${s}`] = w.clone().addScaledVector(m.sub(w).normalize(), palm); out[`ankle.${s}`] = wp(H.bones[`foot_${h}`]); out[`ball.${s}`] = wp(H.bones[`ball_${h}`]); }
  return out;
}
