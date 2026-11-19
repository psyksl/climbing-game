// 임시 사람형 캐릭터(자작): 뼈대 + 스키닝 메시를 코드로 만든다. 외부 모델·모션 파일을 쓰지 않는다(이용조건 문제 없음).
// 단위 m, y = 위, 캐릭터 앞 = +z, 캐릭터의 왼쪽 = +x. 쉬는 자세 = 팔을 내린 선 자세(모든 뼈의 쉬는 회전 = 단위 회전).
// 뼈 이름은 흔한 사람형 뼈대(hips/spine/chest/neck/head, shoulder/upperArm/foreArm/hand, upLeg/leg/foot/toe)와 같은 계층이라 나중에 다른 모델·모션으로 바꾸기 쉽다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// 몸 치수(키 약 1.77m). 다리 = 넓적다리 0.43 + 정강이 0.41, 팔 = 위팔 0.30 + 아래팔 0.27
export const DIM = {
  hipY: 0.95, hipW: 0.09, hipDrop: 0.04, thigh: 0.43, shin: 0.41, ankleY: 0.07,
  spine: 0.10, chest: 0.18, neck: 0.22, head: 0.10, headR: 0.11,
  clavX: 0.06, clavY: 0.18, shoulderX: 0.13, upperArm: 0.30, foreArm: 0.27, hand: 0.17,
  toeZ: 0.15, heelZ: -0.06, ballZ: 0.105, // ballZ = 발볼(발가락 관절) 자리: 뒤꿈치를 들 때 발이 이 점을 축으로 돈다. 발가락 뼈가 여기서 시작한다
};
DIM.leg = DIM.thigh + DIM.shin;
DIM.arm = DIM.upperArm + DIM.foreArm;

// [이름, 부모, 쉬는 자세의 부모 기준 위치]
function boneDefs() {
  const d = DIM, L = [];
  L.push(['hips', null, [0, d.hipY, 0]]);
  L.push(['spine', 'hips', [0, d.spine, 0]]);
  L.push(['chest', 'spine', [0, d.chest, 0]]);
  L.push(['neck', 'chest', [0, d.neck, 0]]);
  L.push(['head', 'neck', [0, d.head, 0]]);
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    L.push([`shoulder.${s}`, 'chest', [sx * d.clavX, d.clavY, 0]]);
    L.push([`upperArm.${s}`, `shoulder.${s}`, [sx * d.shoulderX, 0, 0]]);
    L.push([`foreArm.${s}`, `upperArm.${s}`, [0, -d.upperArm, 0]]);
    L.push([`hand.${s}`, `foreArm.${s}`, [0, -d.foreArm, 0]]);
    L.push([`upLeg.${s}`, 'hips', [sx * d.hipW, -d.hipDrop, 0]]);
    L.push([`leg.${s}`, `upLeg.${s}`, [0, -d.thigh, 0]]);
    L.push([`foot.${s}`, `leg.${s}`, [0, -d.shin, 0]]);
    L.push([`toe.${s}`, `foot.${s}`, [0, -(d.ankleY - 0.02), d.ballZ]]);
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
  const mesh = new THREE.SkinnedMesh(geo, mat); mesh.castShadow = true;
  const skeleton = new THREE.Skeleton(list);
  mesh.add(bones.hips); mesh.bind(skeleton);
  const root = new THREE.Group(); root.add(mesh);
  return { root, mesh, skeleton, bones, list };
}
