// 사람형 몸(p3d-0.10.0): Quaternius UAL2 남성 마네킹(CC0)의 메시·65개 뼈를 읽어, 제어 뼈대(rig.js의 21개 뼈)의 자세를 그대로 옮겨 그린다.
// 물리·접촉·자세 계산은 제어 뼈대가 한다(climb.js·motion.js). 이 파일은 그 확정된 자세를 새 몸에 옮기기만 한다 — 계산 상태를 바꾸지 않는다.
//   ① 몸통·쇄골·머리: 제어 뼈의 세계 회전 × 쉬는 자세의 차이(C). 쉬는 자세에서 두 뼈대의 관절 자리가 같도록 rig.js의 BODY_HUMAN 치수를 쟀다
//   ② 팔·다리: 제어 뼈대의 손목·발목 자리로 두 마디 IK(새 몸의 길이). 비틀림(팔꿈치·무릎이 향하는 쪽)은 제어 뼈의 앞(+z) 축을 따른다
//   ③ 손·발: 제어 뼈의 회전을 옮긴다(손 = 손가락 쪽 −y·손바닥 +z, 발 = 발볼 쪽·위). 손목의 비틀림은 아래팔과 절반씩 나눈다
//   ④ 손가락: 제어 뼈대에 없다. sim이 계산 걸음마다 정하는 굽힘 값(S.fing)을 읽어 굽힌다
import * as THREE from 'three';
import DATA from './human_data.json' with { type: 'json' };

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
const FINGERS = ['index', 'middle', 'ring', 'pinky'], PRON = 80 * Math.PI / 180, SCAP_UP = 28 * Math.PI / 180, SCAP_FWD = 10 * Math.PI / 180;

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
  const tmp = { maxIKGap: 0 };
  // 원본(T자) 자세로 돌려 둔 뒤 매번 다시 만든다 → 앞 장면의 값에 기대지 않는다(그리기 빈도와 무관)
  function apply(fing = [0.3, 0.3], pron = [0, 0]) {
    ctrl.root.updateMatrixWorld(true);
    for (const b of H.list) b.quaternion.copy(H.bindL[b.name]);
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
        if (up || fw) { const B = H.bones[`clavicle_${h}`], r = Q().setFromAxisAngle(V(0, 0, 1).applyQuaternion(qc), sx * up).multiply(Q().setFromAxisAngle(V(0, 1, 0).applyQuaternion(qc), -sx * fw)); setWorld(B, r.multiply(wq(B))); } }
      // ② 팔: 어깨 → 제어 뼈대의 손목 자리로 IK. 굽는 쪽 = 제어 뼈대의 팔꿈치 쪽(팔이 거의 펴지면 제어 뼈의 앞 축이 정하는 쪽)
      for (const [up, lo, end] of [[`upperarm_${h}`, `lowerarm_${h}`, `hand_${h}`], [`thigh_${h}`, `calf_${h}`, `foot_${h}`]]) {
        const mU = by[up], mL = by[lo], s = mU.side, arm = mU.limb === 'arm', oU = ctrl.bones[mU.o], oL = ctrl.bones[mL.o], oE = ctrl.bones[arm ? `hand.${s}` : `foot.${s}`];
        const a = wp(H.bones[up]), t = wp(oE), [l1, l2] = mU.len, d0 = t.clone().sub(a), dist = d0.length(), u = d0.clone().normalize();
        const midO = wp(oL), pole = midO.clone().sub(wp(oU)); pole.addScaledVector(u, -pole.dot(u));
        const qU = mapQ(mU), fold = V().copy(mU.aHL).applyQuaternion(qU); // 회전만 옮겼을 때 위 마디가 향하는 쪽
        if (pole.lengthSq() < 1e-6) pole.copy(fold).addScaledVector(u, -fold.dot(u));
        if (pole.lengthSq() < 1e-8) pole.copy(V(0, 0, 1).applyQuaternion(qU)).addScaledVector(u, -V(0, 0, 1).applyQuaternion(qU).dot(u));
        pole.normalize();
        const dd = THREE.MathUtils.clamp(dist, Math.abs(l1 - l2) + 1e-4, (l1 + l2) * 0.9999), ca = THREE.MathUtils.clamp((l1 * l1 + dd * dd - l2 * l2) / (2 * l1 * dd), -1, 1);
        const mid = a.clone().addScaledVector(u, l1 * ca).addScaledVector(pole, l1 * Math.sqrt(1 - ca * ca)), endP = a.clone().addScaledVector(u, dd);
        gap = Math.max(gap, Math.max(0, dist - dd));
        setWorld(H.bones[up], alignQ(mU.aHL, mU.sHL, mid.clone().sub(a), V().copy(mU.sOL).applyQuaternion(qO(mU.o))));
        setWorld(H.bones[lo], alignQ(mL.aHL, mL.sHL, endP.clone().sub(mid), V().copy(mL.sOL).applyQuaternion(qO(mL.o))));
        // ③ 손·발: 제어 뼈의 회전을 옮긴다
        setWorld(H.bones[end], mapQ(by[end]));
        if (arm) { // 손목의 비틀림을 아래팔과 절반씩: 아래팔을 제 축으로 돌린다(손은 세계에서 그대로)
          const B = H.bones[lo], ax = V().copy(mL.aHL).applyQuaternion(wq(B)).normalize(), handQ = wq(H.bones[end]);
          const rel = wq(B).invert().multiply(handQ).multiply(H.bindQ[lo].clone().invert().multiply(H.bindQ[end]).invert()), tw = twistAbout(rel, mL.aHL);
          setWorld(B, Q().setFromAxisAngle(ax, tw * 0.5).multiply(wq(B))); setWorld(H.bones[end], handQ);
          // 놓인 손: 손바닥이 몸 쪽을 보게 아래팔째 돌린다(PRON). 손목 = 아래팔과 같은 만큼 → 비틀림이 손목에 몰리지 않는다
          const pr = pron[h === 'l' ? 0 : 1] * PRON * (h === 'l' ? 1 : -1);
          if (pr) { const tq = Q().setFromAxisAngle(ax, pr * 0.6); setWorld(B, tq.clone().multiply(wq(B))); setWorld(H.bones[end], Q().setFromAxisAngle(ax, pr).multiply(handQ)); }
        } else setWorld(H.bones[`ball_${h}`], mapQ(by[`ball_${h}`]));
      }
      // ④ 손가락
      const c = fing[h === 'l' ? 0 : 1], k = [70, 25, 12].map(x => x * Math.PI / 180), rel = [15, 22, 14].map(x => x * Math.PI / 180), open = [4, 6, 4].map(x => x * Math.PI / 180);
      for (const f of [...FINGERS, 'thumb']) for (let j = 1; j <= 3; j++) { const n = `${f}_0${j}_${h}`, B = H.bones[n];
        const ang = c >= 0.3 ? rel[j - 1] + (k[j - 1] - rel[j - 1]) * (c - 0.3) / 0.7 : open[j - 1] + (rel[j - 1] - open[j - 1]) * c / 0.3;
        B.quaternion.copy(H.bindL[n]).multiply(Q().setFromAxisAngle(fingerAxis[n], ang * (f === 'thumb' ? 0.5 : 1))); }
    }
    H.root.updateMatrixWorld(true);
    tmp.maxIKGap = gap; return tmp;
  }
  return { apply, info: tmp };
}
// 회전 q(지역)를 축 a 둘레의 비틀림 각으로(스윙-트위스트 분해)
function twistAbout(q, a) { const n = a.clone().normalize(), p = V(q.x, q.y, q.z).dot(n), t = new THREE.Quaternion(n.x * p, n.y * p, n.z * p, q.w); if (t.lengthSq() < 1e-12) return 0; t.normalize(); let ang = 2 * Math.acos(THREE.MathUtils.clamp(t.w, -1, 1)); if (V(t.x, t.y, t.z).dot(n) < 0) ang = -ang; if (ang > Math.PI) ang -= 2 * Math.PI; if (ang < -Math.PI) ang += 2 * Math.PI; return ang; }
// 새 몸의 손바닥 자리(제어 뼈대의 CL.PALM과 같은 거리를 손가락 쪽으로)와 발볼·발끝 — 접촉 오차를 잴 때
export function humanPoints(H, palm = 0.08) {
  const out = {};
  for (const [s, h] of [['L', 'l'], ['R', 'r']]) { const w = wp(H.bones[`hand_${h}`]), m = wp(H.bones[`middle_01_${h}`]); out[`palm.${s}`] = w.clone().addScaledVector(m.sub(w).normalize(), palm); out[`ankle.${s}`] = wp(H.bones[`foot_${h}`]); out[`ball.${s}`] = wp(H.bones[`ball_${h}`]); }
  return out;
}
