// 임시 사람형 캐릭터(자작): 뼈대 + 스키닝 메시를 코드로 만든다. 외부 모델·모션 파일을 쓰지 않는다(이용조건 문제 없음).
// 단위 m, y = 위, 캐릭터 앞 = +z, 캐릭터의 왼쪽 = +x. 쉬는 자세 = 팔을 내린 선 자세(모든 뼈의 쉬는 회전 = 단위 회전).
// 뼈 이름은 흔한 사람형 뼈대(hips/spine/chest/neck/head, shoulder/upperArm/foreArm/hand, upLeg/leg/foot/toe)와 같은 계층이라 나중에 다른 모델·모션으로 바꾸기 쉽다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// 몸 치수. 두 가지 몸이 있다(p3d-0.10.0):
//   human = 사람형 몸(Quaternius UAL2 남성 마네킹, CC0)의 뼈 자리를 잰 값. 키 1.83m. 기본
//   old   = p3d-0.9.1까지의 자작 몸(키 약 1.77m). 비교용: 주소에 ?body=old, node 시험은 BODY=old
// 물리·자세(climb.js·motion.js)는 아래 치수의 뼈대(제어 뼈대, 21개 뼈)로 계산하고, human 몸은 그 뼈대를 따라 65개 뼈의 모델을 움직인다(human.js).
// 벡터 값(o…)은 부모 뼈 기준의 자리(왼쪽 = +x, 오른쪽은 x를 뒤집는다). 쉬는 자세의 관절 자리가 새 모델의 관절 자리와 같도록 잰 값이다.
const BODY_OLD = {
  hipY: 0.95, hipW: 0.09, hipDrop: 0.04, thigh: 0.43, shin: 0.41, ankleY: 0.07,
  spine: 0.10, chest: 0.18, neck: 0.22, head: 0.10, headR: 0.11,
  clavX: 0.06, clavY: 0.18, shoulderX: 0.13, upperArm: 0.30, foreArm: 0.27, hand: 0.17,
  toeZ: 0.15, heelZ: -0.06, ballZ: 0.105, // ballZ = 발볼(발가락 관절) 자리: 뒤꿈치를 들 때 발이 이 점을 축으로 돈다. 발가락 뼈가 여기서 시작한다
};
// 재는 법: tools/quaternius_convert.mjs가 옮긴 쉬는 자세(src/human_data.json)에서 관절의 세계 자리를 읽어 뺐다(골반 = 제어 뼈대의 hips, spine_01 = spine, spine_03 = chest, clavicle = shoulder, upperarm = upperArm …).
// 팔다리 길이는 관절 사이의 곧은 거리. 발: 발목에서 발바닥까지 0.104, 발볼 0.149 앞, 발끝 0.241 앞, 뒤꿈치 0.062 뒤(메시의 끝).
const BODY_HUMAN = {
  hipY: 0.917, hipW: 0.089, hipDrop: -0.015, hipZ: 0.051, thigh: 0.400, shin: 0.429, ankleY: 0.104,
  spine: 0.134, chest: 0.264, neck: 0.173, head: 0.081, headR: 0.115,
  clavX: 0.019, clavY: 0.143, shoulderX: 0.173, upperArm: 0.274, foreArm: 0.273, hand: 0.232,
  toeZ: 0.241, heelZ: -0.062, ballZ: 0.149,
  oSpine: [0, 0.134, 0.034], oChest: [0, 0.264, 0.011], oClav: [0.019, 0.143, 0.076], oSh: [0.173, -0.017, -0.136], oNeck: [0, 0.173, -0.006], oHead: [0, 0.081, 0.016],
  headC: [0, 0.121, -0.002],
  // 제 몸 충돌의 상자(가슴 = chest 뼈 기준, 골반 = hips 뼈 기준): 중심과 반 크기. 마네킹 메시의 정점(그 뼈의 몫이 가장 큰 것)으로 잰 값
  boxChest: { c: [0, 0.035, -0.013], h: [0.165, 0.165, 0.14] }, boxHip: { c: [0, 0.096, 0.052], h: [0.135, 0.17, 0.12] },
  // 팔의 그려지는 굵기(어깨 쪽, 끝 쪽): 마네킹 메시에서 뼈 축까지의 거리
  armR: { upper: [0.075, 0.062], fore: [0.068, 0.05] },
  palm: 0.08, // 손목에서 잡는 점까지(물리). 새 손(손목 → 손가락 뿌리 12.1cm)에 맞춰 0.11로 해 봤으나 손이 턱 아래로 내려가 벽에 붙은 자세에서 팔이 '등 뒤로 돌아가는 방향'이 되어 손을 놓쳤다(p3d-0.10.1, foot2) → 옛 값. 손가락은 그림에서 맞춘다(human.js)
  boxCollide: true, // 몸통과 지형의 충돌을 위 두 상자(골반·가슴)로 한다(climb.js collide). 옛 몸은 몸 원점 둘레의 원기둥 하나
  kneeClr: 0.10, // 디딘 다리의 무릎 방향을 고를 때 무릎과 벽·턱 사이에 두려는 거리(climb.js legIK). 새 몸의 무릎 둘레 반지름(약 10cm)
};
const envBody = () => { try { if (typeof location !== 'undefined' && location.search) { const m = /[?&]body=(\w+)/.exec(location.search); if (m) return m[1]; } } catch (e) { /* 없음 */ } try { return globalThis.process?.env?.BODY || ''; } catch (e) { return ''; } };
export const BODY = envBody() === 'old' ? 'old' : 'human';
export const DIM = { ...(BODY === 'old' ? BODY_OLD : BODY_HUMAN) };
// 벡터 값이 없는 몸(old)은 숫자 값에서 만든다 — p3d-0.9.1과 같은 자리
DIM.hipZ ??= 0; DIM.oSpine ??= [0, DIM.spine, 0]; DIM.oChest ??= [0, DIM.chest, 0]; DIM.oClav ??= [DIM.clavX, DIM.clavY, 0]; DIM.oSh ??= [DIM.shoulderX, 0, 0]; DIM.oNeck ??= [0, DIM.neck, 0]; DIM.oHead ??= [0, DIM.head, 0];
DIM.oHip = [DIM.hipW, -DIM.hipDrop, DIM.hipZ]; DIM.oToe = [0, -(DIM.ankleY - 0.02), DIM.ballZ];
DIM.headCT = DIM.headC ?? [0, DIM.headR * 0.9, 0]; DIM.headC ??= [0, DIM.headR * 0.9, 0.01]; // headCT = 몸통 계산(torso)의 머리 중심. 옛 몸은 0.9.1까지 torso에서만 앞쪽 1cm를 빼고 썼다(그대로 둔다)
DIM.boxChest ??= { c: [0, 0.11, 0.005], h: [0.18, 0.12, 0.105] }; DIM.boxHip ??= { c: [0, 0.07, 0], h: [0.15, 0.17, 0.095] };
DIM.armR ??= { upper: [0.055, 0.045], fore: [0.045, 0.036] }; DIM.kneeClr ??= 0.06; DIM.palm ??= 0.08;
DIM.leg = DIM.thigh + DIM.shin;
DIM.arm = DIM.upperArm + DIM.foreArm;
// [이름, 부모, 쉬는 자세의 부모 기준 위치]
function boneDefs() {
  const d = DIM, L = [];
  const mx = (v, sx) => [sx * v[0], v[1], v[2]];
  L.push(['hips', null, [0, d.hipY, 0]]);
  L.push(['spine', 'hips', d.oSpine]);
  L.push(['chest', 'spine', d.oChest]);
  L.push(['neck', 'chest', d.oNeck]);
  L.push(['head', 'neck', d.oHead]);
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    L.push([`shoulder.${s}`, 'chest', mx(d.oClav, sx)]);
    L.push([`upperArm.${s}`, `shoulder.${s}`, mx(d.oSh, sx)]);
    L.push([`foreArm.${s}`, `upperArm.${s}`, [0, -d.upperArm, 0]]);
    L.push([`hand.${s}`, `foreArm.${s}`, [0, -d.foreArm, 0]]);
    L.push([`upLeg.${s}`, 'hips', mx(d.oHip, sx)]);
    L.push([`leg.${s}`, `upLeg.${s}`, [0, -d.thigh, 0]]);
    L.push([`foot.${s}`, `leg.${s}`, [0, -d.shin, 0]]);
    L.push([`toe.${s}`, `foot.${s}`, d.oToe]);
  }
  return L;
}

// 한 토막(두 점 사이의 둥근 원기둥). 정점 무게: 끝 쪽 blend 구간은 다음 뼈와 나눠 관절이 부드럽게 굽는다
function segment(a, b, r0, r1, bi, bj, color, blend = 0.18) {
  const len = a.distanceTo(b), g = new THREE.CylinderGeometry(r1, r0, len, 12, 6, false);
  g.translate(0, len / 2, 0); // 아래 끝 = a
  const cap0 = new THREE.SphereGeometry(r0, 12, 8); const cap1 = new THREE.SphereGeometry(r1, 12, 8); cap1.translate(0, len, 0);
  const parts = [g, cap0, cap1].map(x => x.toNonIndexed());
  const geo = mergeGeometries(parts.map(p => { p.deleteAttribute('uv'); return p; }));
  // 방향: +y → (b - a)
  const dir = new THREE.Vector3().subVectors(b, a).normalize(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const pos = geo.attributes.position, n = pos.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), col = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  for (let k = 0; k < n; k++) {
    v.fromBufferAttribute(pos, k); const t = THREE.MathUtils.clamp(v.y / len, 0, 1); // 0 = a 끝, 1 = b 끝
    let wj = bj === null ? 0 : THREE.MathUtils.clamp((t - (1 - blend)) / blend, 0, 1) * 0.5;
    si[k * 4] = bi; si[k * 4 + 1] = bj === null ? 0 : bj; sw[k * 4] = 1 - wj; sw[k * 4 + 1] = wj;
    v.applyQuaternion(q).add(a); pos.setXYZ(k, v.x, v.y, v.z); col.set([color.r, color.g, color.b], k * 3);
  }
  geo.computeVertexNormals();
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}
// 상자 모양(몸통·발)
function block(center, size, bi, color, bevelScale = 1) {
  const g = new THREE.BoxGeometry(size[0], size[1], size[2], 2, 2, 2).toNonIndexed(); g.deleteAttribute('uv');
  const pos = g.attributes.position, n = pos.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), col = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) { pos.setXYZ(k, pos.getX(k) * bevelScale + center[0], pos.getY(k) + center[1], pos.getZ(k) + center[2]); si[k * 4] = bi; sw[k * 4] = 1; col.set([color.r, color.g, color.b], k * 3); }
  g.computeVertexNormals();
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

export function buildCharacter() {
  const defs = boneDefs(), bones = {}, list = [];
  for (const [name, parent, p] of defs) { const b = new THREE.Bone(); b.name = name; b.position.set(...p); bones[name] = b; list.push(b); if (parent) bones[parent].add(b); }
  const idx = n => list.indexOf(bones[n]);
  // 쉬는 자세의 세계 위치
  bones.hips.updateMatrixWorld(true);
  const W = n => bones[n].getWorldPosition(new THREE.Vector3());
  const C = { shirt: new THREE.Color('#8a8f96'), pants: new THREE.Color('#2f3a56'), skin: new THREE.Color('#d9b49a'), shoe: new THREE.Color('#3a3a3a'), L: new THREE.Color('#e0705c'), R: new THREE.Color('#4f9be0') };
  const geos = [];
  // 몸통: 골반·배·가슴(앞뒤로 얇은 상자), 목, 머리
  geos.push(block([0, DIM.hipY - 0.02, 0], [0.30, 0.16, 0.19], idx('hips'), C.pants));
  geos.push(block([0, DIM.hipY + DIM.spine + 0.06, 0], [0.28, 0.16, 0.18], idx('spine'), C.shirt));
  geos.push(block([0, DIM.hipY + DIM.spine + DIM.chest + 0.11, 0.005], [0.36, 0.24, 0.21], idx('chest'), C.shirt));
  geos.push(segment(W('neck'), W('head'), 0.05, 0.05, idx('neck'), idx('head'), C.skin, 0.3));
  { const h = new THREE.SphereGeometry(DIM.headR, 16, 12).toNonIndexed(); h.deleteAttribute('uv'); h.scale(0.9, 1.05, 1); const c = W('head').add(new THREE.Vector3(0, DIM.headR * 0.9, 0.01)); h.translate(c.x, c.y, c.z);
    const n = h.attributes.position.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), col = new Float32Array(n * 3); for (let k = 0; k < n; k++) { si[k * 4] = idx('head'); sw[k * 4] = 1; col.set([C.skin.r, C.skin.g, C.skin.b], k * 3); }
    h.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); h.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4)); h.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geos.push(h);
    const nose = block([0, c.y - 0.01, c.z + DIM.headR * 0.95], [0.03, 0.04, 0.03], idx('head'), C.skin); geos.push(nose); } // 코 = 얼굴이 향한 쪽
  for (const s of ['L', 'R']) {
    const acc = C[s]; // 손목·발목 쪽의 작은 좌우 표시(최종 캐릭터의 색이 아니다)
    geos.push(segment(W(`shoulder.${s}`), W(`upperArm.${s}`), 0.055, 0.06, idx(`shoulder.${s}`), idx(`upperArm.${s}`), C.shirt, 0.4));
    geos.push(segment(W(`upperArm.${s}`), W(`foreArm.${s}`), 0.055, 0.045, idx(`upperArm.${s}`), idx(`foreArm.${s}`), C.shirt));
    geos.push(segment(W(`foreArm.${s}`), W(`hand.${s}`), 0.045, 0.036, idx(`foreArm.${s}`), idx(`hand.${s}`), C.skin));
    { const a = W(`hand.${s}`), b = a.clone().add(new THREE.Vector3(0, -DIM.hand, 0)); geos.push(segment(a, b, 0.038, 0.03, idx(`hand.${s}`), null, acc, 0)); }
    geos.push(segment(W(`upLeg.${s}`), W(`leg.${s}`), 0.085, 0.06, idx(`upLeg.${s}`), idx(`leg.${s}`), C.pants));
    geos.push(segment(W(`leg.${s}`), W(`foot.${s}`), 0.058, 0.045, idx(`leg.${s}`), idx(`foot.${s}`), C.pants));
    { const f = W(`foot.${s}`), z0 = DIM.heelZ - 0.01, z1 = DIM.ballZ, z2 = DIM.toeZ + 0.03; // 발 = 뒤쪽(발목 뼈) + 발가락 쪽(발가락 뼈). 겉모습은 전과 같은 한 덩어리이고, 발가락 뼈가 돌 때만 앞쪽이 따로 굽는다
      geos.push(block([f.x, 0.035, (z0 + z1) / 2], [0.095, 0.07, z1 - z0], idx(`foot.${s}`), C.shoe)); geos.push(block([f.x, 0.035, (z1 + z2) / 2], [0.095, 0.07, z2 - z1], idx(`toe.${s}`), C.shoe)); geos.push(block([f.x, f.y + 0.005, -0.02], [0.08, 0.03, 0.06], idx(`foot.${s}`), acc)); }
  }
  const geo = mergeGeometries(geos);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.0 });
  const mesh = new THREE.SkinnedMesh(geo, mat); mesh.castShadow = true; mesh.frustumCulled = false; // 뼈가 뿌리에서 멀리 가는 동작(동작 보기의 원본 이동)에서 화면 밖으로 잘못 걸러지지 않게
  const skeleton = new THREE.Skeleton(list);
  mesh.add(bones.hips); mesh.bind(skeleton);
  const root = new THREE.Group(); root.add(mesh);
  return { root, mesh, skeleton, bones, list };
}
