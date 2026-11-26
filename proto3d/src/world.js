// 검증용 지형(옛 작은 벽. p3d-0.14.0부터 화면에서는 쓰지 않는다 — 회귀 시험의 기준 장면): 축에 나란한 상자들(정식 스테이지의 미술과 분리). 위를 향한 면 = 올라설 수 있는 면, 옆면 = 막힘.
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

// ── 클라이밍장(p3d-0.14.0, 사용자: "실제 클라이밍 연습장처럼 크게 만들어서 색별로 코스를 여러 개. 기존 연습장은 이제 안 쓴다") ──
// 화면의 기본 지형이다. 옛 작은 벽(makeWorld)은 화면에서 쓰지 않고(?world=old) 회귀 시험의 기준 장면으로만 남긴다.
// 벽은 정면(z = −7, 앞 = +z, 폭 17m·높이 4.2m)과 왼쪽 옆 벽(x = −8.5, 앞 = +x). 지형은 여전히 축에 나란한 상자뿐이다(기운 벽·오버행 없음).
// 코스 = 같은 색의 손 홀드(턱, kind 'ledge')와 발 홀드(발판, kind 'foothold'). 손 홀드는 grip 높이 y(윗면)·폭 w로, 발 홀드는 윗면 높이로 적는다.
//   역할: start(시작 — 두 손을 여기에 두고 시작), hand, top(완등 — 두 손이 함께 잡으면 완등), foot. 손 홀드의 순서 = 그 코스를 오르는 손의 차례(베타. 시험 봇이 쓴다)
//   u = 코스 가운데에서 벽을 보고 오른쪽으로 잰 거리. jump = 그 손은 뛰며 잡는다(다이노)
// 코스의 모양·색·이름·난이도는 임시(개발이 먼저 놓은 것. 그래픽·기획은 GPT·사용자 결정). 값은 시험 봇으로 오를 수 있는지 보며 고친 실험값이다
export const GYM_COURSES = [
  { id: 'green', name: '초록', grade: '입문', color: '#3fa34d', wall: 'main', at: -6.6,
    hands: [[-0.16, 1.50, 0.26, 'start'], [0.16, 1.50, 0.26, 'start'], [-0.16, 1.80, 0.26], [0.16, 2.10, 0.26], [-0.16, 2.40, 0.26], [0.16, 2.70, 0.26], [-0.16, 3.00, 0.26], [0.16, 3.30, 0.26], [0.0, 3.60, 0.60, 'top']],
    feet: [[-0.44, 0.30, 0.20], [0.44, 0.30, 0.20], [-0.44, 0.60, 0.20], [0.44, 0.90, 0.20], [-0.44, 1.20, 0.20], [0.44, 1.50, 0.20], [-0.44, 1.80, 0.20]] },
  { id: 'yellow', name: '노랑', grade: '쉬움', color: '#e2c233', wall: 'main', at: -3.4,
    hands: [[0.0, 1.55, 0.50, 'start'], [-0.28, 1.87, 0.26], [0.26, 2.19, 0.26], [-0.24, 2.51, 0.26], [0.28, 2.83, 0.26], [-0.20, 3.15, 0.26], [0.05, 3.47, 0.50, 'top']],
    feet: [[-0.32, 0.35, 0.20], [0.36, 0.55, 0.20], [-0.48, 0.85, 0.20], [0.50, 1.15, 0.20], [-0.50, 1.45, 0.20]] },
  { id: 'blue', name: '파랑', grade: '보통 · 옆으로', color: '#2f6fd0', wall: 'main', at: -0.6,
    hands: [[-1.20, 1.70, 0.40, 'start'], [-0.78, 1.82, 0.30], [-0.36, 1.74, 0.30], [0.06, 1.86, 0.30], [0.48, 1.78, 0.30], [0.90, 2.05, 0.30], [0.62, 2.38, 0.30], [0.98, 2.70, 0.30], [0.66, 3.02, 0.30], [0.85, 3.34, 0.45, 'top']],
    feet: [[-1.30, 0.40, 0.20], [-0.95, 0.35, 0.20], [-0.55, 0.45, 0.20], [-0.12, 0.40, 0.20], [0.30, 0.50, 0.20], [0.72, 0.45, 0.20], [1.20, 0.80, 0.20], [0.40, 1.10, 0.20], [1.25, 1.40, 0.20]] },
  { id: 'red', name: '빨강', grade: '어려움', color: '#d23a32', wall: 'main', at: 3.2,
    hands: [[0.0, 1.60, 0.45, 'start'], [-0.32, 2.02, 0.22], [0.30, 2.44, 0.22], [-0.26, 2.86, 0.22], [0.24, 3.28, 0.22], [0.0, 3.70, 0.40, 'top']],
    feet: [[-0.38, 0.45, 0.16], [0.40, 0.80, 0.16], [-0.44, 1.20, 0.16], [0.44, 1.60, 0.16]] },
  { id: 'black', name: '검정', grade: '매우 어려움 · 뛰어 잡기', color: '#2a2a2e', wall: 'main', at: 6.6,
    hands: [[-0.15, 1.70, 0.40, 'start'], [0.22, 2.00, 0.22], [-0.05, 2.30, 0.45], [0.05, 2.80, 0.50, 'hand', 'jump'], [0.30, 3.12, 0.22], [0.0, 3.44, 0.40, 'top']],
    feet: [[-0.38, 0.50, 0.16], [0.40, 0.80, 0.16], [-0.42, 1.10, 0.16], [0.44, 1.40, 0.16]] },
  { id: 'purple', name: '보라', grade: '쉬움 · 옆 벽', color: '#8a4fc4', wall: 'left', at: 2.0,
    hands: [[0.0, 1.55, 0.50, 'start'], [-0.22, 1.87, 0.26], [0.22, 2.19, 0.26], [-0.22, 2.51, 0.26], [0.22, 2.83, 0.26], [-0.18, 3.15, 0.26], [0.0, 3.47, 0.50, 'top']],
    feet: [[-0.38, 0.35, 0.20], [0.38, 0.65, 0.20], [-0.40, 0.95, 0.20], [0.40, 1.25, 0.20], [-0.42, 1.55, 0.20]] },
];
// 벽의 틀: o = 벽면 위의 기준점(바닥 높이), t = 벽을 보고 오른쪽, n = 벽이 보는 쪽(벽에서 나오는 쪽)
export const GYM_WALLS = { main: { o: [0, 0, -7], t: [1, 0, 0], n: [0, 0, 1] }, left: { o: [-8.5, 0, 0], t: [0, 0, -1], n: [1, 0, 0] } };
export function makeGym(opt = {}) { const COURSES = opt.courses || GYM_COURSES; // opt.courses = 시험이 넣는 코스(같은 틀·같은 벽)
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z), boxes = [], courses = [];
  const B = (name, min, max, kind = 'block', extra = {}) => { const b = { name, min: V3(...min), max: V3(...max), kind, ...extra }; boxes.push(b); return b; };
  // 벽 틀에서의 상자: u = 옆(오른쪽 +), y = 높이, d = 벽면에서 나온 깊이
  const onWall = (W, name, u0, u1, y0, y1, d0, d1, kind, extra) => { const o = V3(...W.o), t = V3(...W.t), n = V3(...W.n), pts = [];
    for (const u of [u0, u1]) for (const d of [d0, d1]) pts.push(o.clone().addScaledVector(t, u).addScaledVector(n, d));
    const mn = V3(Math.min(...pts.map(p => p.x)), y0, Math.min(...pts.map(p => p.z))), mx = V3(Math.max(...pts.map(p => p.x)), y1, Math.max(...pts.map(p => p.z)));
    return B(name, mn.toArray(), mx.toArray(), kind, extra); };
  B('바닥', [-30, -1, -30], [30, 0, 30], 'floor');
  B('정면 벽', [-8.5, 0, -8.0], [8.5, 4.2, -7.0], 'wall');
  B('왼쪽 벽', [-9.5, 0, -8.0], [-8.5, 4.2, 2.0], 'wall');
  B('오른쪽 벽', [8.5, 0, -8.0], [9.5, 4.2, 2.0], 'wall');
  for (const C of COURSES) { const W = GYM_WALLS[C.wall], cs = { ...C, holds: [], footholds: [], frame: W }; courses.push(cs);
    C.hands.forEach(([u, y, w, role = 'hand', how], i) => { const nm = role === 'start' ? `${C.name} 시작${C.hands.filter(h => h[3] === 'start').length > 1 ? i + 1 : ''}` : role === 'top' ? `${C.name} 완등` : `${C.name} ${i + 1}`;
      cs.holds.push(onWall(W, nm, C.at + u - w / 2, C.at + u + w / 2, y - 0.07, y, 0, 0.14, 'ledge', { course: C.id, role, seq: i, color: C.color, jump: how === 'jump' })); });
    C.feet.forEach(([u, y, w], i) => cs.footholds.push(onWall(W, `${C.name} 발${i + 1}`, C.at + u - w / 2, C.at + u + w / 2, y - 0.05, y, 0, 0.14, 'foothold', { course: C.id, role: 'foot', seq: i, color: C.color }))); }
  // 코스마다 시작 자리: 시작 홀드들의 가운데 아래, 벽에서 0.42m 앞, 벽을 본다(main.js의 T, 시험 봇)
  for (const cs of courses) { const W = cs.frame, st = cs.holds.filter(h => h.role === 'start'), c = st.reduce((a, h) => a.add(h.min.clone().add(h.max).multiplyScalar(0.5)), V3(0, 0, 0)).multiplyScalar(1 / st.length), n = V3(...W.n);
    const p = c.clone().addScaledVector(n, -c.clone().sub(V3(...W.o)).dot(n) + 0.42); p.y = 0; cs.startPos = p.toArray(); cs.startYaw = Math.atan2(-n.x, -n.z); }
  return { boxes, courses, gym: true, spawn: { pos: [0, 0, 1.0], yaw: Math.PI } };
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
  const col = world.gym ? { floor: '#8d8a84', block: '#b9b2a2', wall: '#d8d2c4', ledge: '#c98a4a', foothold: '#c9a04a' } : { floor: '#9aa28f', block: '#b9b2a2', wall: '#a39a8a', ledge: '#c98a4a', foothold: '#c9a04a' };
  for (const b of world.boxes) {
    const s = new THREE.Vector3().subVectors(b.max, b.min), c = new THREE.Vector3().addVectors(b.max, b.min).multiplyScalar(0.5);
    const m = new THREE.Mesh(new THREE.BoxGeometry(s.x, s.y, s.z), new THREE.MeshStandardMaterial({ color: b.color || col[b.kind] || '#bbb', roughness: b.course ? 0.7 : 0.95 }));
    m.position.copy(c); m.receiveShadow = true; m.castShadow = b.kind !== 'floor'; scene.add(m);
  }
  if (!world.gym) { const grid = new THREE.GridHelper(60, 120, 0x6f7766, 0x86907c); grid.position.y = 0.002; scene.add(grid); return; }
  // 클라이밍장의 그림만 하는 것(물리에 없다 — 상자 목록에 넣지 않는다): 매트, 시작·완등 테이프, 코스 이름판. 모양은 임시(GPT 디자인 요청)
  const flat = (w, d, color, x, y, z, ry = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color, roughness: 1 })); m.rotation.x = -Math.PI / 2; m.rotation.z = ry; m.position.set(x, y, z); m.receiveShadow = true; scene.add(m); };
  flat(17.0, 2.4, '#2c3e63', 0, 0.004, -5.8); flat(2.4, 8.6, '#2c3e63', -7.3, 0.005, -2.3);
  const tape = (h, color, below) => { const W = new THREE.Vector3(0, 0, 0), n = h.max.z - h.min.z < h.max.x - h.min.x ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0), c = h.min.clone().add(h.max).multiplyScalar(0.5);
    const along = n.z ? h.max.x - h.min.x : h.max.z - h.min.z, m = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(0.10, along * 0.4), 0.10), new THREE.MeshStandardMaterial({ color, roughness: 1 }));
    const face = n.z ? h.min.z + 0.002 : h.min.x + 0.002; m.position.set(n.z ? c.x : face, h.min.y - below, n.z ? face : c.z); if (!n.z) m.rotation.y = Math.PI / 2; scene.add(m); return W; };
  const sign = (text, sub, color, pos, n) => { const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96; const g = cv.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, 256, 96); g.fillStyle = color === '#2a2a2e' || color === '#2f6fd0' || color === '#8a4fc4' || color === '#d23a32' || color === '#3fa34d' ? '#fff' : '#222';
    g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.fillText(text, 128, 46); g.font = '24px sans-serif'; g.fillText(sub, 128, 82);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.3), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv) })); m.position.copy(pos); m.lookAt(pos.clone().add(n)); scene.add(m); };
  if (typeof document === 'undefined') return;
  for (const C of world.courses) { const W = C.frame, n = new THREE.Vector3(...W.n), o = new THREE.Vector3(...W.o), t = new THREE.Vector3(...W.t);
    for (const h of C.holds) if (h.role === 'start') tape(h, '#ffffff', 0.06); else if (h.role === 'top') { tape(h, '#ffffff', 0.06); tape(h, '#111111', 0.17); }
    sign(C.name, C.grade, C.color, o.clone().addScaledVector(t, C.at).addScaledVector(n, 0.01).setY(0.55), n); }
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
