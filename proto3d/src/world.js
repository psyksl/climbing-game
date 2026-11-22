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
    // p3d-0.7.0: 뛰어 잡기·반동 확인용. 턱 D = 턱 B에 매달려 위로 뛰어야 닿는 높이, 턱 E = 턱 B에서 옆으로(흔들어야 닿는 거리)
    B('턱 D', [0.85, 2.41, -3.0], [1.45, 2.48, -2.86], 'ledge'),
    B('턱 E', [1.75, 1.83, -3.0], [2.35, 1.90, -2.86], 'ledge'),
    // p3d-0.8.1(GPT의 첫 몸 동작 비교 장면): 턱 A를 두 손으로 잡은 채 오른손으로 닿으려면 낮은 발판을 디디고 다리로 올라서야 하는 자리. 바닥에 선 채로도, 넓은 발판(왼쪽 아래)을 디뎌도 닿지 않는다
    B('턱 F', [-0.45, 2.08, -3.0], [-0.15, 2.15, -2.86], 'ledge'),
    B('낮은 발판', [-0.6, 0.45, -3.0], [-0.1, 0.50, -2.86], 'foothold'),
    B('넓은 발판', [-1.75, 0, -3.0], [-1.25, 0.30, -2.60], 'foothold'), // W2: 깊이 40cm, 올라설 수 있는 낮은 발판(무게중심을 그 위에 둘 수 있다). 낮은 발판(깊이 14cm)과 견준다
    B('모서리 벽', [3, 0, -4.0], [4.0, 3.0, -1.5], 'wall'),
  ];
  return { boxes };
}

// 다른 벽으로 옮겨 가기 시험용 지형(p3d-0.10.4, GPT의 0.10.3 검토 "다른 벽으로 이동하는 시험용 조각은 바로 만든다 — 기존 코스는 그대로").
// 기본 지형(makeWorld)과 따로 쓴다(화면: ?world=corner, 시험: test/corner_check.mjs). 벽 A의 앞면(+z)과 오른쪽 옆면(+x = 벽 B)이 바깥 모서리(x = 0, z = −3)에서 만난다.
//   face = 그 상자가 붙은 벽이 보는 쪽(지정하면 몸 방향 계산이 이것을 쓴다 — 걸친 턱처럼 열린 면만으로 정하기 어려운 곳)
export function makeFixtureWorld() {
  const B = (name, min, max, kind = 'block', face) => ({ name, min: new THREE.Vector3(...min), max: new THREE.Vector3(...max), kind, ...(face ? { face: new THREE.Vector3(...face) } : {}) });
  const boxes = [
    B('바닥', [-30, -1, -30], [30, 0, 30], 'floor'),
    B('벽 A', [-3, 0, -6], [0, 4.0, -3.0], 'wall'),                       // 앞면 z = −3(+z), 오른쪽 옆면 x = 0(+x) = 벽 B
    B('A1', [-1.2, 1.85, -3.0], [-0.4, 1.92, -2.84], 'ledge'),            // 벽 A 앞면의 턱
    B('A2 모서리 턱', [-0.35, 1.85, -3.0], [0.0, 1.92, -2.84], 'ledge'),    // 벽 A 앞면, 오른쪽 끝(옆면)이 벽 B 면과 같은 x = 0
    B('B1', [0.0, 1.85, -3.30], [0.16, 1.92, -3.02], 'ledge'),            // 벽 B(+x 면)의 턱, 모서리 바로 뒤
    B('B2', [0.0, 2.12, -3.95], [0.16, 2.19, -3.45], 'ledge'),            // 벽 B의 더 높고 먼 턱
    B('A 발판', [-0.9, 0.45, -3.0], [-0.4, 0.50, -2.86], 'foothold'),
    B('B 발판', [0.0, 0.45, -3.40], [0.14, 0.50, -3.02], 'foothold'),
    B('A3 걸친 턱', [-0.25, 2.30, -3.0], [0.35, 2.37, -2.84], 'ledge'),      // 반은 벽 A 앞, 반은 모서리 밖(방향 지정 없음)
    B('A4 걸친 턱(방향 지정)', [-0.25, 2.62, -3.0], [0.35, 2.69, -2.84], 'ledge', [0, 0, 1]),
    B('C 혼자 선 긴 턱', [2.0, 1.60, -1.04], [3.2, 1.70, -0.90], 'ledge'),   // 붙은 벽 없음(네 면이 열림). 깊이 14cm(끝 옆면도 잡을 수 있는 길이 — 12cm 아래 모서리는 잡지 않는다)
    B('D 양면 벽', [4.0, 0, -1.05], [6.0, 1.88, -0.95], 'wall'),            // 앞뒤가 모두 열린 얇은 벽
    B('E 벽', [7.5, 0, -4.0], [9.0, 4.0, -3.0], 'wall'),                    // 손이 들어갈 자리 시험: 턱 E의 오른쪽 끝 옆 3cm에 기둥
    B('E 턱', [7.9, 1.85, -3.0], [8.3, 1.92, -2.84], 'ledge'),
    B('E 옆 기둥', [8.33, 1.6, -3.0], [8.5, 2.4, -2.7], 'block'),
  ];
  return { boxes, fixture: 'corner' };
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

// 선분(a → b)이 처음 닿는 상자까지의 비율(0~1). 닿지 않으면 1. 카메라가 벽을 지나가지 않게 쓴다
export function rayHit(world, a, b, skipFloor = false) {
  let best = 1; const d = new THREE.Vector3().subVectors(b, a);
  for (const bx of world.boxes) {
    if (skipFloor && bx.kind === 'floor') continue;
    let t0 = 0, t1 = 1, ok = true;
    for (const ax of ['x', 'y', 'z']) {
      if (Math.abs(d[ax]) < 1e-9) { if (a[ax] < bx.min[ax] || a[ax] > bx.max[ax]) { ok = false; break; } continue; }
      let u = (bx.min[ax] - a[ax]) / d[ax], v = (bx.max[ax] - a[ax]) / d[ax]; if (u > v) [u, v] = [v, u];
      t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) { ok = false; break; }
    }
    if (ok && t0 > 0 && t0 < best) best = t0;
  }
  return best;
}
