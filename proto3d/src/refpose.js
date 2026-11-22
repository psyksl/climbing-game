// 참고 자세(p3d-0.10.1): 손발 배치가 비슷한 참고 장면을 찾아 그때의 골반·가슴 각, 무릎·팔꿈치 방향을 돌려준다(tools/ref_pose.mjs가 만든 색인).
// 색인(Mixamo에서 뽑은 값)은 저장소에 넣지 않는다 — 이 파일은 재는 법과 찾는 법만 갖는다. 색인이 없으면(자작 빌드) 아무것도 하지 않는다.
// 재는 틀: 몸이 벽을 보는 쪽 = +z(동작 쪽의 틀). 게임 몸은 body.yaw로 돌려 맞춘다. 각은 도 단위.
import * as THREE from 'three';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), UP = V(0, 1, 0), deg = r => r * 180 / Math.PI;
const wp = b => b.getWorldPosition(V()), wq = b => b.getWorldQuaternion(new THREE.Quaternion());

// 제어 뼈대의 지금 자세를 재는 값(ref_pose.mjs와 같은 식). yaw = 몸이 보는 쪽(게임: 벽을 볼 때 π)
export function poseMetrics(rig, yaw) {
  const B = rig.bones, qY = new THREE.Quaternion().setFromAxisAngle(UP, -yaw), toB = v => v.clone().applyQuaternion(qY);
  const qH = qY.clone().multiply(wq(B.hips)), qC = qY.clone().multiply(wq(B.chest));
  const ang = q => { const f = V(0, 0, 1).applyQuaternion(q), u = V(0, 1, 0).applyQuaternion(q); return { yaw: deg(Math.atan2(f.x, f.z)), pitch: deg(Math.asin(THREE.MathUtils.clamp(-f.y, -1, 1))), roll: deg(Math.atan2(u.x, u.y)) }; };
  const P = ang(qH), C = ang(qC);
  const pole = (a, m, e, sx) => { const A = toB(wp(B[a])), M = toB(wp(B[m])), E = toB(wp(B[e])), u = E.clone().sub(A).normalize(), p = M.clone().sub(A); p.addScaledVector(u, -p.dot(u)); return p.length() < 0.01 ? null : deg(Math.atan2(sx * p.x, p.z)); };
  return { pelvis: { yaw: P.yaw, pitch: P.pitch, roll: P.roll }, chest: { yaw: C.yaw - P.yaw, pitch: C.pitch - P.pitch, roll: C.roll - P.roll },
    knee: [pole('upLeg.L', 'leg.L', 'foot.L', 1), pole('upLeg.R', 'leg.R', 'foot.R', -1)], elbow: [pole('upperArm.L', 'foreArm.L', 'hand.L', 1), pole('upperArm.R', 'foreArm.R', 'hand.R', -1)] };
}
// 손발 배치(색인과 같은 순서: 손바닥 L·R, 발목 L·R — 골반 기준, 몸의 틀). pts = 세계 자리 넷, hip = 골반 뼈의 세계 자리
export function featOf(pts, hip, yaw) { const qY = new THREE.Quaternion().setFromAxisAngle(UP, -yaw); return pts.flatMap(p => p.clone().sub(hip).applyQuaternion(qY).toArray()); }
// 가까운 k장면의 무게 평균(거리의 역수). con = 지금 닿아 있는 손발(닿은 것끼리의 자리를 두 배로 본다)
export function lookup(index, feat, con, k = 8) {
  if (!index || !index.frames || !index.frames.length) return null;
  const w = [0, 1, 2, 3].map(e => (con[e] ? 2 : 1)), best = [];
  for (const fr of index.frames) { let d = 0; for (let e = 0; e < 4; e++) { const a = e * 3, dx = fr.feat[a] - feat[a], dy = fr.feat[a + 1] - feat[a + 1], dz = fr.feat[a + 2] - feat[a + 2]; d += w[e] * (dx * dx + dy * dy + dz * dz); }
    if (best.length < k || d < best[best.length - 1].d) { best.push({ d, fr }); best.sort((x, y) => x.d - y.d); if (best.length > k) best.pop(); } }
  let W = 0; const acc = { pelvis: { yaw: 0, pitch: 0, roll: 0 }, chest: { yaw: 0, pitch: 0, roll: 0 }, knee: [[0, 0], [0, 0]], elbow: [[0, 0], [0, 0]] };
  for (const { d, fr } of best) { const ww = 1 / (Math.sqrt(d) + 0.02); W += ww;
    for (const g of ['pelvis', 'chest']) for (const a of ['yaw', 'pitch', 'roll']) acc[g][a] += fr[g][a] * ww;
    for (const g of ['knee', 'elbow']) for (let i = 0; i < 2; i++) if (fr[g][i] !== null) { acc[g][i][0] += fr[g][i] * ww; acc[g][i][1] += ww; } }
  for (const g of ['pelvis', 'chest']) for (const a of ['yaw', 'pitch', 'roll']) acc[g][a] /= W;
  return { pelvis: acc.pelvis, chest: acc.chest, knee: acc.knee.map(([s, n]) => (n ? s / n : null)), elbow: acc.elbow.map(([s, n]) => (n ? s / n : null)), dist: Math.sqrt(best[0].d), clips: [...new Set(best.map(b => b.fr.clip))].slice(0, 3) };
}
