// 검증용 지형: 축에 나란한 상자들(정식 스테이지의 미술과 분리). 위를 향한 면 = 올라설 수 있는 면, 옆면 = 막힘.
// W1(기본 이동)용 바닥·낮은 단·계단과, W2(작은 벽 등반)용 벽·턱·모서리·낮은 발판을 함께 둔다(W2 접촉은 다음 판).
import * as THREE from 'three';

export function makeWorld() {
  const B = (name, min, max, kind = 'block') => ({ name, min: new THREE.Vector3(...min), max: new THREE.Vector3(...max), kind });
  const boxes = [
    B('바닥', [-30, -1, -30], [30, 0, 30], 'floor'),
    B('낮은 단', [2.5, 0, 1.0], [4.5, 0.25, 3.0]),        // 걸어 올라설 수 있는 높이(0.25m)
    B('높은 단', [5.0, 0, 1.0], [7.0, 0.55, 3.0]),        // 뛰어 올라야 하는 높이(0.55m)
    B('계단1', [-4.5, 0, 1.5], [-3.5, 0.15, 3.5]), B('계단2', [-5.5, 0, 1.5], [-4.5, 0.30, 3.5]), B('계단3', [-6.5, 0, 1.5], [-5.5, 0.45, 3.5]),
    // 작은 벽(W2 준비): 벽면은 z = -3.0(앞 = +z). 턱·모서리·낮은 발판
    B('벽', [-3, 0, -4.0], [3, 4.0, -3.0], 'wall'),
    B('턱 A', [-1.6, 1.85, -3.0], [-0.6, 1.92, -2.84], 'ledge'),
    B('턱 B', [0.2, 2.25, -3.0], [1.2, 2.32, -2.86], 'ledge'),
    B('턱 C', [-0.9, 2.75, -3.0], [0.1, 2.82, -2.86], 'ledge'),
    B('낮은 발판', [-0.8, 0.45, -3.0], [-0.3, 0.50, -2.86], 'foothold'),
    B('모서리 벽', [3, 0, -4.0], [4.0, 3.0, -1.5], 'wall'),
  ];
  return { boxes };
}

// (x, z)에서 y 아래로 가장 높은 윗면(위로 stepUp까지 허용). 없으면 -Infinity
export function groundAt(world, x, z, y, stepUp = 0.32, r = 0.12) {
  let best = -Infinity, hit = null;
  for (const b of world.boxes) {
    if (x < b.min.x - r || x > b.max.x + r || z < b.min.z - r || z > b.max.z + r) continue;
    if (b.max.y <= y + stepUp + 1e-6 && b.max.y > best) { best = b.max.y; hit = b; }
  }
  return { y: best, box: hit };
}

// 원기둥 몸(반지름 r, 발 y0 ~ 머리 y1)이 상자 옆면에 들어가 있으면 바깥으로 민다. 디딜 수 있는 낮은 상자(stepUp 이하)는 막지 않는다
export function pushOut(world, pos, r, y0, y1, stepUp = 0.32) {
  let hitAny = null;
  for (const b of world.boxes) {
    if (b.kind === 'floor') continue;
    if (b.max.y <= y0 + stepUp || b.min.y >= y1) continue;
    const cx = THREE.MathUtils.clamp(pos.x, b.min.x, b.max.x), cz = THREE.MathUtils.clamp(pos.z, b.min.z, b.max.z);
    const dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-10) { const d = Math.sqrt(d2), k = (r - d) / d; pos.x += dx * k; pos.z += dz * k; hitAny = { box: b, nx: dx / d, nz: dz / d }; }
    else { // 중심이 상자 안: 가장 가까운 옆면으로
      const opts = [[pos.x - b.min.x + r, -1, 0], [b.max.x - pos.x + r, 1, 0], [pos.z - b.min.z + r, 0, -1], [b.max.z - pos.z + r, 0, 1]].sort((a, c) => a[0] - c[0]);
      const [m, nx, nz] = opts[0]; pos.x += nx * m; pos.z += nz * m; hitAny = { box: b, nx, nz };
    }
  }
  return hitAny;
}

export function buildWorldMeshes(world, scene) {
  const col = { floor: '#9aa28f', block: '#b9b2a2', wall: '#a39a8a', ledge: '#c98a4a', foothold: '#c9a04a' };
  for (const b of world.boxes) {
    const s = new THREE.Vector3().subVectors(b.max, b.min), c = new THREE.Vector3().addVectors(b.max, b.min).multiplyScalar(0.5);
    const m = new THREE.Mesh(new THREE.BoxGeometry(s.x, s.y, s.z), new THREE.MeshStandardMaterial({ color: col[b.kind] || '#bbb', roughness: 0.95 }));
    m.position.copy(c); m.receiveShadow = true; m.castShadow = b.kind !== 'floor'; scene.add(m);
  }
  const grid = new THREE.GridHelper(60, 120, 0x6f7766, 0x86907c); grid.position.y = 0.002; scene.add(grid);
}
