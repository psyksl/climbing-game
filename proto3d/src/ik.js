// 뼈 방향 맞추기와 두 마디 IK. 모든 뼈의 쉬는 회전이 단위 회전이라, "쉬는 자세에서 뼈가 가리키는 축"을 원하는 세계 방향으로 돌리는 회전을 직접 만든다.
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();

// bone의 세계 회전을 정한다: 쉬는 자세에서 뼈가 가리키는 축(axis: 'down' = -y, 'up' = +y, 'side+'/'side-' = ±x)이 dir을 향하고, 뼈의 +z(앞)가 hint 쪽에 가깝게.
export function aimBone(bone, dir, hint, axis = 'down') {
  const d = _y.copy(dir).normalize();
  let main; // 뼈의 주축(쉬는 자세 기준)이 향할 세계 방향
  if (axis === 'down') main = d.clone().negate(); else if (axis === 'up') main = d.clone(); else main = null;
  if (main) { // 지역 y축 = main
    const z = _z.copy(hint).addScaledVector(main, -hint.dot(main)); if (z.lengthSq() < 1e-8) z.set(0, 0, 1).addScaledVector(main, -main.z); z.normalize();
    const x = _x.crossVectors(main, z).normalize(); z.crossVectors(x, main).normalize();
    _m.makeBasis(x, main, z);
  } else { // 지역 x축 = ±dir
    const xa = d.clone().multiplyScalar(axis === 'side+' ? 1 : -1);
    const z = _z.copy(hint).addScaledVector(xa, -hint.dot(xa)); if (z.lengthSq() < 1e-8) z.set(0, 0, 1); z.normalize();
    const y = _x.crossVectors(z, xa).normalize(); z.crossVectors(xa, y).normalize();
    _m.makeBasis(xa, y, z);
  }
  _q.setFromRotationMatrix(_m);
  setWorldQuat(bone, _q);
}
export function setWorldQuat(bone, qWorld) {
  bone.parent.updateWorldMatrix(true, false); bone.parent.getWorldQuaternion(_pq);
  bone.quaternion.copy(_pq.invert().multiply(qWorld)); bone.updateMatrixWorld(true);
}
export function worldPos(bone, out = new THREE.Vector3()) { bone.updateWorldMatrix(true, false); return out.setFromMatrixPosition(bone.matrixWorld); }

// 두 마디 IK: root(어깨·고관절) 위치 a, 목표 t, 길이 l1·l2, 굽는 쪽 pole(세계 방향). 가운데 관절 자리와 실제로 닿은 끝 자리를 돌려준다(닿지 않으면 뻗은 만큼만).
export function twoBone(a, t, l1, l2, pole, maxRatio = 0.999) {
  const at = new THREE.Vector3().subVectors(t, a); let dist = at.length(); const reach = (l1 + l2) * maxRatio, minD = Math.abs(l1 - l2) + 1e-4;
  const clamped = dist > reach; dist = THREE.MathUtils.clamp(dist, minD, reach);
  const u = at.lengthSq() > 1e-10 ? at.clone().normalize() : new THREE.Vector3(0, -1, 0);
  const cosA = THREE.MathUtils.clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  const p = pole.clone().addScaledVector(u, -pole.dot(u)); if (p.lengthSq() < 1e-8) p.set(0, 0, 1).addScaledVector(u, -u.z); p.normalize();
  const mid = a.clone().addScaledVector(u, l1 * cosA).addScaledVector(p, l1 * sinA);
  const end = a.clone().addScaledVector(u, dist);
  return { mid, end, clamped, ratio: at.length() / (l1 + l2) };
}
