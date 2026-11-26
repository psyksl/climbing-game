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

// ── 클라이밍장(p3d-0.14.0, 사용자: "실제 클라이밍 연습장처럼 크게 만들어서 색별로 코스를 여러 개. 기존 연습장은 이제 안 쓴다" → 실제 암장 사진 3장 "이런 느낌으로") ──
// 화면의 기본 지형이다. 옛 작은 벽(makeWorld)은 화면에서 쓰지 않고(?world=old) 회귀 시험의 기준 장면으로만 남긴다.
// 벽: 볼더링 벽(높이 4.5m, 1.2m 튀어나온 기둥 — 바깥 모서리 둘, 안쪽 모서리 둘)과 리드 벽(높이 12m, 1.4m 튀어나온 기둥), 왼쪽 옆 벽(볼더링).
//   지형은 여전히 축에 나란한 상자뿐이다 — 기운 벽(슬랩·오버행)과 기운 면의 볼륨은 만들 수 없다(엔진 쪽 일). 벽의 큰 색 띠(삼각형)는 그림만이다(칠이라 물리에 없다).
// 코스 = 같은 색의 손 홀드(턱, kind 'ledge')와 발 홀드(발판, kind 'foothold'). 코스끼리 섞여 있다(실제 암장처럼 — 겨눈 곳 둘레의 다른 색 홀드도 잡힌다. 색은 규칙일 뿐).
//   손 홀드 = [u, grip 높이 y(윗면), 폭 w, 역할(start | hand | top), 'jump'(뛰어 잡기)], 발 홀드 = [u, 윗면 높이, 폭]. u = 그 면을 보고 오른쪽으로 잰 거리(면 가운데 기준).
//   손 홀드의 순서 = 오르는 손의 차례(베타. 시험 봇이 쓴다). 사다리꼴 코스는 gen(만드는 규칙)으로 만든다 — 같은 씨앗이면 늘 같은 자리.
//   볼륨(kind 'block', 색 있음): 벽에 붙은 큰 상자. 윗면은 디딜 수 있고 윗모서리는 잡힌다(어느 코스에도 속하지 않는다).
// 코스의 모양·색·이름·난이도는 임시(그래픽·기획은 GPT·사용자 결정). 간격은 시험 봇으로 재어 정한 실험값이다(지금 몸이 오를 수 있는 손 사이 ≈ 32cm — 쉬운 코스는 그 안, 어려운 코스는 그 밖)
export const GYM_FACES = {
  main: { o: [0, 0, -7], t: [1, 0, 0], n: [0, 0, 1], u: [-8.5, 8.5], h: 12 },          // 정면(볼더링 x −8.5~−1 높이 4.5 · 리드 x −1~8.5 높이 12)
  bPillar: { o: [-4.3, 0, -5.8], t: [1, 0, 0], n: [0, 0, 1], u: [-0.7, 0.7], h: 4.5 },  // 볼더링 기둥의 앞면
  bPillarR: { o: [-3.6, 0, -6.4], t: [0, 0, -1], n: [1, 0, 0], u: [-0.6, 0.6], h: 4.5 }, // 볼더링 기둥의 오른쪽 옆면(폭 1.2m)
  lPillar: { o: [3.2, 0, -5.6], t: [1, 0, 0], n: [0, 0, 1], u: [-1.2, 1.2], h: 12 },     // 리드 기둥의 앞면
  lPillarR: { o: [4.4, 0, -6.3], t: [0, 0, -1], n: [1, 0, 0], u: [-0.7, 0.7], h: 12 },   // 리드 기둥의 오른쪽 옆면(폭 1.4m)
  left: { o: [-8.5, 0, -2.5], t: [0, 0, -1], n: [1, 0, 0], u: [-0.9, 4.5], h: 4.5 },      // 왼쪽 옆 벽(슬랩 오른쪽)
  // 기운 면(p3d-0.15.0, 사용자 사진의 오버행·슬랩): tilt = 기운 각(도, + = 오버행: 위로 갈수록 방 쪽으로 나옴, − = 슬랩: 위로 갈수록 물러남). 엔진의 지형은 축에 나란한 상자뿐이라
  //   높이 step(15cm)의 얇은 벽 조각을 계단처럼 쌓아 만든다(조각마다 step·tan(tilt)씩 어긋남 — 15°면 4cm, 8°면 2.1cm). 그림은 조각들의 가운데를 지나는 매끈한 면으로 그린다(물리와 그림의 차 = 어긋남의 반, 2cm 안).
  //   조각의 윗모서리는 잡히지 않고(위 조각에 덮이거나 3cm보다 얕다) 윗면은 디딜 수 없다(world의 stair 표시 — 발은 발판을 디디거나 면에 댄다)
  over: { o: [8.5, 0, -4.2], t: [0, 0, 1], n: [-1, 0, 0], u: [-2.0, 2.0], h: 4.5, tilt: 15, step: 0.15 },   // 오른쪽 벽의 오버행 15°(폭 4m)
  slab: { o: [-8.5, 0, 0.3], t: [0, 0, -1], n: [1, 0, 0], u: [-1.6, 1.6], h: 4.5, tilt: -8, step: 0.15 },   // 왼쪽 벽의 슬랩 8°(폭 3.2m)
};
// gen = { y0: 시작 높이, top: 완등 높이, step: 손 사이 높이, side: 번갈아 옆으로, drift: 위로 가며 옆으로 흐르는 정도, w: 홀드 폭, start2: 시작 홀드 둘, fstep: 발 사이 높이, foot: 발의 옆 자리, jit: 높이·옆 흔들림(비율) }
export const GYM_COURSES = [
  { id: 'green', name: '초록', grade: '입문', color: '#3fa34d', face: 'main', at: -7.3, gen: { y0: 1.50, top: 3.90, step: 0.26, side: 0.16, w: 0.26, start2: true, fstep: 0.28, foot: 0.42, jit: 0.04 } },
  { id: 'yellow', name: '노랑', grade: '쉬움 · 기둥', color: '#e8c21e', face: 'bPillar', at: 0.0, gen: { y0: 1.55, top: 4.05, step: 0.28, side: 0.22, w: 0.24, fstep: 0.28, foot: 0.44, jit: 0.04 } },
  { id: 'pink', name: '분홍', grade: '쉬움 · 모서리', color: '#e36fa8', face: 'bPillarR', at: -0.15, gen: { y0: 1.55, top: 3.95, step: 0.28, side: 0.10, w: 0.20, fstep: 0.28, foot: 0.20, fw: 0.16, jit: 0.04 } },
  { id: 'blue', name: '파랑', grade: '보통 · 옆으로', color: '#2f6fd0', face: 'main', at: -2.1,
    hands: [[-1.10, 1.70, 0.40, 'start'], [-0.68, 1.82, 0.30], [-0.26, 1.74, 0.30], [0.16, 1.86, 0.30], [0.58, 1.78, 0.30], [0.98, 2.05, 0.30], [0.70, 2.36, 0.30], [1.02, 2.66, 0.30], [0.72, 2.96, 0.30], [0.96, 3.26, 0.30], [0.80, 3.56, 0.45, 'top']],
    feet: [[-1.20, 0.40, 0.20], [-0.85, 0.35, 0.20], [-0.45, 0.45, 0.20], [-0.02, 0.40, 0.20], [0.40, 0.50, 0.20], [0.82, 0.45, 0.20], [1.20, 0.80, 0.20], [0.46, 1.10, 0.20], [1.24, 1.40, 0.20], [0.50, 1.70, 0.20]] },
  { id: 'purple', name: '보라', grade: '쉬움 · 옆 벽', color: '#8a4fc4', face: 'left', at: 0.5, gen: { y0: 1.55, top: 3.95, step: 0.28, side: 0.22, w: 0.26, fstep: 0.28, foot: 0.40, jit: 0.04 } },
  { id: 'red', name: '빨강', grade: '어려움', color: '#d23a32', face: 'main', at: -6.0, gen: { y0: 1.60, top: 4.10, step: 0.42, side: 0.30, w: 0.20, fstep: 0.40, foot: 0.44, fw: 0.15, seed: 7 } },
  { id: 'orange', name: '주황', grade: '쉬움 · 리드 12m', color: '#ee7d21', face: 'main', at: 0.2, gen: { y0: 1.50, top: 11.2, step: 0.26, side: 0.16, w: 0.26, start2: true, fstep: 0.28, foot: 0.42, drift: 0.04, jit: 0.04 } },
  { id: 'sky', name: '하늘', grade: '보통 · 리드 기둥', color: '#45b8e0', face: 'lPillar', at: -0.3, gen: { y0: 1.55, top: 11.0, step: 0.28, side: 0.22, w: 0.24, fstep: 0.28, foot: 0.46, drift: 0.04, jit: 0.04 } },
  { id: 'black', name: '검정', grade: '매우 어려움 · 뛰어 잡기', color: '#2a2a2e', face: 'main', at: 6.4,
    hands: [[-0.15, 1.70, 0.40, 'start'], [0.22, 2.00, 0.22], [-0.05, 2.30, 0.45], [0.05, 2.80, 0.50, 'hand', 'jump'], [0.30, 3.12, 0.22], [-0.10, 3.44, 0.22], [0.25, 3.76, 0.22], [0.0, 4.08, 0.40, 'top']],
    feet: [[-0.38, 0.50, 0.16], [0.40, 0.80, 0.16], [-0.42, 1.10, 0.16], [0.44, 1.40, 0.16], [-0.40, 1.75, 0.16], [0.42, 2.05, 0.16]] },
  { id: 'lime', name: '연두', grade: '보통 · 오버행 15°', color: '#9bd13c', face: 'over', at: -0.9, gen: { y0: 1.50, top: 4.0, step: 0.27, side: 0.16, w: 0.28, start2: true, fstep: 0.27, foot: 0.40, jit: 0.04 } },
  { id: 'brown', name: '갈색', grade: '어려움 · 오버행 15°', color: '#8b5a2b', face: 'over', at: 0.9, gen: { y0: 1.60, top: 4.0, step: 0.36, side: 0.24, w: 0.22, fstep: 0.34, foot: 0.42, fw: 0.16, jit: 0.05, seed: 5 } },
  { id: 'mint', name: '민트', grade: '쉬움 · 슬랩 8°', color: '#3fc1a0', face: 'slab', at: 0.0, gen: { y0: 1.50, top: 4.0, step: 0.28, side: 0.20, w: 0.24, fstep: 0.28, foot: 0.40, jit: 0.04 } },
  { id: 'white', name: '하양', grade: '어려움 · 리드 옆면', color: '#f4f2ea', face: 'lPillarR', at: -0.2, gen: { y0: 1.60, top: 10.8, step: 0.40, side: 0.14, w: 0.18, fstep: 0.38, foot: 0.26, fw: 0.14, seed: 3 } },
];
// 볼륨(어느 코스에도 속하지 않는 큰 상자): [면, u, 아래 높이, 폭, 높이, 깊이, 색]
export const GYM_VOLUMES = [['main', -2.6, 3.9, 0.5, 0.4, 0.24, '#e8c21e'], ['main', 1.6, 3.4, 0.6, 0.5, 0.26, '#2f6fd0'], ['main', -0.8, 6.0, 0.7, 0.5, 0.28, '#e8c21e'], ['main', 1.4, 8.3, 0.6, 0.55, 0.26, '#2f6fd0'],
  ['lPillar', 0.75, 4.6, 0.5, 0.45, 0.24, '#e8c21e'], ['lPillar', -0.85, 7.2, 0.55, 0.45, 0.24, '#d23a32'], ['main', 7.4, 5.0, 0.6, 0.5, 0.26, '#2f6fd0'], ['main', 6.0, 9.4, 0.55, 0.45, 0.24, '#e8c21e']];
// 기운 면의 겉이 높이 y에서 면 틀(o·n)보다 나온 거리(계단 조각의 값)
export function surfOff(F, y) { if (!F.tilt) return 0; const k = Math.max(0, Math.min(Math.ceil(F.h / F.step) - 1, Math.floor(y / F.step))), tn = Math.tan(Math.abs(F.tilt) * Math.PI / 180); return F.tilt > 0 ? k * F.step * tn : Math.max(0, F.h - (k + 1) * F.step) * tn; }
export function makeGym(opt = {}) { const COURSES = opt.courses || GYM_COURSES; // opt.courses = 시험이 넣는 코스(같은 틀·같은 벽)
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z), boxes = [], courses = [];
  const B = (name, min, max, kind = 'block', extra = {}) => { const b = { name, min: V3(...min), max: V3(...max), kind, ...extra }; boxes.push(b); return b; };
  // 면 틀에서의 상자: u = 옆(오른쪽 +), y = 높이, d = 면(기운 면이면 그 높이의 조각 겉)에서 나온 깊이
  const boxOn = (F, u0, u1, y0, y1, d0, d1) => { const o = V3(...F.o), t = V3(...F.t), n = V3(...F.n), pts = [], sf = F.tilt ? Math.max(surfOff(F, y0 + 1e-4), surfOff(F, y1 - 1e-4)) : 0; d0 += sf; d1 += sf;
    for (const u of [u0, u1]) for (const d of [d0, d1]) pts.push(o.clone().addScaledVector(t, u).addScaledVector(n, d));
    return [V3(Math.min(...pts.map(p => p.x)), y0, Math.min(...pts.map(p => p.z))), V3(Math.max(...pts.map(p => p.x)), y1, Math.max(...pts.map(p => p.z)))]; };
  const hit = (mn, mx, gap) => boxes.some(b => b.kind !== 'floor' && b.kind !== 'wall' && mn.x < b.max.x + gap && b.min.x < mx.x + gap && mn.y < b.max.y + gap && b.min.y < mx.y + gap && mn.z < b.max.z + gap && b.min.z < mx.z + gap);
  B('바닥', [-30, -1, -30], [30, 0, 30], 'floor');
  B('볼더링 벽', [-8.5, 0, -8.0], [-1.0, 4.5, -7.0], 'wall'); B('리드 벽', [-1.0, 0, -8.0], [8.5, 12.0, -7.0], 'wall');
  B('볼더링 기둥', [-5.0, 0, -7.0], [-3.6, 4.5, -5.8], 'wall'); B('리드 기둥', [2.0, 0, -7.0], [4.4, 12.0, -5.6], 'wall');
  B('왼쪽 벽', [-9.5, 0, -8.0], [-8.5, 4.5, 2.0], 'wall'); B('오른쪽 벽', [8.5, 0, -8.0], [9.5, 12.0, 2.0], 'wall');
  // 기운 면의 계단 조각(kind 'wall', stair = 윗면을 디디지 않는다, hidden = 그리지 않는다 — 매끈한 면을 따로 그린다)
  for (const [fn, F] of Object.entries(GYM_FACES)) if (F.tilt) for (let k = 0; k * F.step < F.h - 1e-6; k++) { const d = surfOff(F, k * F.step + 1e-4); if (d < 1e-4) continue; const o = V3(...F.o), t = V3(...F.t), n = V3(...F.n), pts = [];
    for (const u of F.u) for (const dd of [0, d]) pts.push(o.clone().addScaledVector(t, u).addScaledVector(n, dd)); B(`${F.tilt > 0 ? '오버행' : '슬랩'} 벽`, [Math.min(...pts.map(q => q.x)), k * F.step, Math.min(...pts.map(q => q.z))], [Math.max(...pts.map(q => q.x)), Math.min(F.h, (k + 1) * F.step), Math.max(...pts.map(q => q.z))], 'wall', { stair: true, hidden: true, face: n, panel: fn }); }
  for (const [f, u, y, w, h, d, color] of GYM_VOLUMES) { const [mn, mx] = boxOn(GYM_FACES[f], u - w / 2, u + w / 2, y, y + h, 0, d); B(`볼륨 ${boxes.length}`, mn.toArray(), mx.toArray(), 'block', { color, volume: true, face: V3(...GYM_FACES[f].n) }); }
  // 사다리꼴 코스 만들기: 손은 번갈아 옆으로(±side), 위로 step씩(±6% 흔들림), 다른 홀드·볼륨과 4cm 넘게 떨어진 자리를 옆·위로 옮겨 가며 찾는다. 발은 fstep씩 번갈아(±foot)
  const genCourse = C => { const G = C.gen, F = GYM_FACES[C.face]; let a = (G.seed || 1) * 9301 + C.id.length * 49297; const r = () => ((a = (a * 233280 + 49297) % 2147483647) / 2147483647);
    const fit = (u, y, w, th, d) => { const lim = (F.u[1] - F.u[0]) / 2 - w / 2 - 0.02; for (const du of [0, 0.06, -0.06, 0.12, -0.12, 0.18, -0.18]) for (const dy of [0, 0.03, -0.03, 0.06]) { const uu = Math.max(-lim, Math.min(lim, C.at + u + du)) - C.at, [mn, mx] = boxOn(F, C.at + uu - w / 2, C.at + uu + w / 2, y + dy - th, y + dy, 0, d); if (!hit(mn, mx, 0.04)) return [uu, +(y + dy).toFixed(3)]; } return null; };
    const hands = [], feet = []; const put = (u, y, w, role, th = 0.07) => { const q = fit(u, y, w, th, 0.14); if (!q) return false; const [mn, mx] = boxOn(F, C.at + q[0] - w / 2, C.at + q[0] + w / 2, q[1] - th, q[1], 0, 0.14); boxes.push({ name: '_', min: mn, max: mx, kind: 'tmp' }); hands.push([q[0], q[1], w, role]); return true; };
    if (G.start2) { put(-G.side, G.y0, G.w, 'start'); put(G.side, G.y0, G.w, 'start'); } else put(0, G.y0, Math.max(0.40, G.w), 'start');
    let y = G.y0, k = 0, drift = 0; while (y + G.step < G.top - 0.05) { y += G.step * (1 + (r() - 0.5) * 2 * (G.jit ?? 0.06)); drift += (G.drift || 0) * (r() - 0.3); put((k % 2 ? G.side : -G.side) * (1 + (r() - 0.5) * 2 * (G.jit ?? 0.15)) + drift, +y.toFixed(3), G.w, 'hand'); k++; }
    if (!put(drift * 0.5, +(y + G.step).toFixed(3), 0.45, 'top') && !put(drift * 0.5, +(y + G.step * 0.8).toFixed(3), 0.40, 'top')) throw new Error(`${C.name}: 완등 홀드를 놓을 자리가 없음`);
    for (let fy = 0.30, j = 0; fy < y - 1.25; fy += G.fstep * (1 + (r() - 0.5) * 0.1), j++) { const w = G.fw || 0.20, q = fit((j % 2 ? G.foot : -G.foot) + drift * Math.min(1, fy / Math.max(y, 1)), +fy.toFixed(3), w, 0.05, 0.14); if (!q) continue; const [mn, mx] = boxOn(F, C.at + q[0] - w / 2, C.at + q[0] + w / 2, q[1] - 0.05, q[1], 0, 0.14); boxes.push({ name: '_', min: mn, max: mx, kind: 'tmp' }); feet.push([q[0], q[1], w]); }
    return { hands, feet }; };
  const specs = COURSES.map(C => (C.gen ? { ...C, ...genCourse(C) } : C));
  for (let k = boxes.length - 1; k >= 0; k--) if (boxes[k].kind === 'tmp') boxes.splice(k, 1);
  for (const C of specs) { const F = GYM_FACES[C.face || C.wall === 'left' ? C.face || 'left' : 'main'] || GYM_FACES.main, cs = { ...C, holds: [], footholds: [], frame: F }; courses.push(cs); const nF = V3(...F.n);
    const nStart = C.hands.filter(h => h[3] === 'start').length;
    C.hands.forEach(([u, y, w, role = 'hand', how], i) => { const nm = role === 'start' ? `${C.name} 시작${nStart > 1 ? i + 1 : ''}` : role === 'top' ? `${C.name} 완등` : `${C.name} ${i + 1}`, [mn, mx] = boxOn(F, C.at + u - w / 2, C.at + u + w / 2, y - 0.07, y, 0, 0.14);
      cs.holds.push(B(nm, mn.toArray(), mx.toArray(), 'ledge', { course: C.id, role, seq: i, color: C.color, jump: how === 'jump', face: nF, tilt: F.tilt || 0 })); });
    C.feet.forEach(([u, y, w], i) => { const [mn, mx] = boxOn(F, C.at + u - w / 2, C.at + u + w / 2, y - 0.05, y, 0, 0.14); cs.footholds.push(B(`${C.name} 발${i + 1}`, mn.toArray(), mx.toArray(), 'foothold', { course: C.id, role: 'foot', seq: i, color: C.color, face: nF })); }); }
  // 코스에 속하지 않은 홀드(실제 암장처럼 벽에 홀드가 빼곡하게 — 색은 여러 가지, 어느 코스의 규칙에도 들지 않는다. 잡을 수는 있다): 면마다 1㎡에 약 1.6개, 코스 홀드·볼륨과 15cm 넘게 떨어진 자리만. 코스 홀드보다 얕게(5~8cm) — 팔·손이 지나는 길을 덜 막게(실제 홀드는 팔이 넘어가는 둥근 혹이다).
  //   opt.free === false면 넣지 않는다(시험이 코스만으로 잴 때). 같은 씨앗이면 늘 같은 자리
  if (opt.free !== false) { let a = 777; const r = () => ((a = (a * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff), PAL = ['#d23a32', '#2f6fd0', '#e8c21e', '#3fa34d', '#8a4fc4', '#ee7d21', '#e36fa8', '#45b8e0', '#2a2a2e', '#f4f2ea', '#8b5a2b'];
    const area = { main: [[-8.4, -1.1, 0.2, 4.3], [-0.9, 1.9, 0.2, 11.8], [4.5, 8.4, 0.2, 11.8]], bPillar: [[-0.6, 0.6, 0.2, 4.3]], lPillar: [[-1.1, 1.1, 0.2, 11.8]], left: [[-0.8, 4.4, 0.2, 4.3]], over: [[-1.9, 1.9, 0.3, 4.3]], slab: [[-1.5, 1.5, 0.3, 4.3]], bPillarR: [[-0.5, 0.5, 0.2, 4.3]], lPillarR: [[-0.6, 0.6, 0.2, 11.8]] };
    let k = 0; for (const [f, rects] of Object.entries(area)) { const F = GYM_FACES[f]; for (const [u0, u1, y0, y1] of rects) { const n = Math.round((u1 - u0) * (y1 - y0) * 1.6);
      for (let j = 0; j < n; j++) { const w = 0.10 + r() * 0.12, th = 0.05 + r() * 0.04, u = u0 + w / 2 + r() * (u1 - u0 - w), y = y0 + th + r() * (y1 - y0 - th), d = 0.05 + r() * 0.03, [mn, mx] = boxOn(F, u - w / 2, u + w / 2, y - th, y, 0, d);
        if (!hit(mn, mx, 0.15) && !boxes.some(b => b.kind === 'wall' && mn.x < b.max.x - 1e-6 && b.min.x < mx.x - 1e-6 && mn.y < b.max.y && b.min.y < mx.y && mn.z < b.max.z - 1e-6 && b.min.z < mx.z - 1e-6)) B(`홀드 ${++k}`, mn.toArray(), mx.toArray(), 'ledge', { color: PAL[Math.floor(r() * PAL.length)], free: true, face: V3(...F.n), tilt: F.tilt || 0 }); } } } }
  // 코스마다 시작 자리: 시작 홀드들의 가운데 아래, 그 면에서 0.42m 앞, 면을 본다(main.js의 T, 시험 봇)
  //   슬랩은 발치가 나와 있어 손 홀드가 멀다 → 발치에서 0.24m(벽에 바짝)
  for (const cs of courses) { const F = cs.frame, st = cs.holds.filter(h => h.role === 'start'), c = st.reduce((a, h) => a.add(h.min.clone().add(h.max).multiplyScalar(0.5)), V3(0, 0, 0)).multiplyScalar(1 / st.length), n = V3(...F.n);
    const p = c.clone().addScaledVector(n, -c.clone().sub(V3(...F.o)).dot(n) + surfOff(F, 0.1) + (F.tilt < 0 ? 0.24 : 0.42)); p.y = 0; cs.startPos = p.toArray(); cs.startYaw = Math.atan2(-n.x, -n.z); }
  // opt.filler = 재기용: 정면 벽 오른쪽(x 0.5~8)에 작은 홀드 n개를 흩어 둔다(상자 수에 따른 계산 빠르기 재기)
  if (opt.filler) { let a = 12345; const r = () => ((a = (a * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); for (let k = 0; k < opt.filler; k++) { const x = 0.5 + r() * 7.5, y = 0.3 + r() * 3.7; B(`채움 ${k}`, [x, y - 0.05, -7], [x + 0.14, y, -6.88], 'ledge'); } }
  return { boxes, courses, gym: true, faces: GYM_FACES, spawn: { pos: [-2.0, 0, 0.5], yaw: Math.PI } };
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
  for (const b of world.boxes) { if (b.hidden) continue;
    const s = new THREE.Vector3().subVectors(b.max, b.min), c = new THREE.Vector3().addVectors(b.max, b.min).multiplyScalar(0.5);
    const m = new THREE.Mesh(new THREE.BoxGeometry(s.x, s.y, s.z), new THREE.MeshStandardMaterial({ color: b.color || col[b.kind] || '#bbb', roughness: b.course ? 0.7 : 0.95 }));
    m.position.copy(c); m.receiveShadow = true; m.castShadow = b.kind !== 'floor'; scene.add(m);
  }
  if (!world.gym) { const grid = new THREE.GridHelper(60, 120, 0x6f7766, 0x86907c); grid.position.y = 0.002; scene.add(grid); return; }
  // 클라이밍장의 그림만 하는 것(물리에 없다 — 상자 목록에 넣지 않는다): 매트, 벽의 색 띠(삼각형 칠), 시작·완등 테이프, 코스 이름표. 모양은 임시(GPT 디자인 요청)
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const flat = (w, d, color, x, y, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color, roughness: 1 })); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; scene.add(m); };
  flat(7.5, 2.6, '#2c3e63', -4.75, 0.004, -5.0); flat(2.6, 8.6, '#2c3e63', -7.2, 0.005, -2.3); flat(9.5, 1.6, '#4a4f58', 3.75, 0.004, -5.9);
  // 면 위의 칠: 면 틀(o, t, n)에서 (u, y) 꼭짓점들을 면보다 3mm 앞에 칠한다
  const paint = (F, pts, color, off = 0.003) => { const o = V3(...F.o), t = V3(...F.t), n = V3(...F.n), g = new THREE.BufferGeometry(), P = [];
    for (let k = 1; k + 1 < pts.length; k++) for (const [u, y] of [pts[0], pts[k], pts[k + 1]]) { const p = o.clone().addScaledVector(t, u).addScaledVector(n, off).setY(y); P.push(p.x, p.y, p.z); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.computeVertexNormals(); const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide })); m.receiveShadow = true; scene.add(m); };
  const FS = world.faces || {}, R = '#c8372d', Bl = '#2a64c4', Y = '#e8c21e', G = '#7b7f86';
  if (FS.main) { const M = FS.main; paint(M, [[-1.0, 0], [1.2, 0], [0.2, 4.5]], Bl); paint(M, [[1.2, 0], [2.0, 0], [2.0, 6.5], [0.8, 9.0]], R); paint(M, [[-0.9, 4.6], [0.6, 7.2], [-0.9, 11.8]], Y); paint(M, [[4.4, 0], [6.2, 0], [4.4, 5.5]], Bl); paint(M, [[4.4, 6.0], [8.5, 3.0], [8.5, 8.0], [4.4, 11.5]], Bl);
    paint(M, [[6.0, 0], [8.5, 0], [8.5, 2.6]], R); paint(M, [[-8.5, 0], [-7.6, 0], [-8.5, 3.0]], R); paint(M, [[-3.6, 0], [-2.6, 0], [-3.1, 4.5], [-3.6, 4.5]], G); paint(M, [[-6.2, 4.5], [-5.0, 2.4], [-5.0, 4.5]], Bl);
    paint(M, [[-8.5, 4.42], [-1.0, 4.42], [-1.0, 4.5], [-8.5, 4.5]], '#55595f'); }
  if (FS.lPillar) { const P = FS.lPillar; paint(P, [[-1.2, 0], [1.2, 2.0], [1.2, 3.8], [-1.2, 6.4]], R); paint(P, [[-1.2, 7.0], [1.2, 9.2], [-0.2, 12]], Bl); }
  if (FS.bPillar) paint(FS.bPillar, [[-0.7, 0], [0.7, 0], [0.7, 1.4], [-0.7, 3.2]], Y);
  // 기운 면: 계단 조각의 가운데를 지나는 매끈한 면(앞면·두 옆면·윗면)과 그 위의 칠
  for (const F of Object.values(FS)) if (F.tilt) { const o = V3(...F.o), t = V3(...F.t), n = V3(...F.n), tn = Math.tan(Math.abs(F.tilt) * Math.PI / 180), dOf = y => (F.tilt > 0 ? y : F.h - y) * tn, P = (u, y, d) => o.clone().addScaledVector(t, u).addScaledVector(n, d).setY(y), [u0, u1] = F.u;
    const quad = (a, b, c, d, color) => { const g = new THREE.BufferGeometry(), A = []; for (const q of [a, b, c, a, c, d]) A.push(q.x, q.y, q.z); g.setAttribute('position', new THREE.Float32BufferAttribute(A, 3)); g.computeVertexNormals(); const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.95, side: THREE.DoubleSide })); m.receiveShadow = true; m.castShadow = true; scene.add(m); };
    quad(P(u0, 0, dOf(0)), P(u1, 0, dOf(0)), P(u1, F.h, dOf(F.h)), P(u0, F.h, dOf(F.h)), '#cfc8b8');
    for (const u of [u0, u1]) quad(P(u, 0, 0), P(u, 0, dOf(0)), P(u, F.h, dOf(F.h)), P(u, F.h, 0), '#b8b1a2');
    quad(P(u0, F.h, 0), P(u1, F.h, 0), P(u1, F.h, dOf(F.h)), P(u0, F.h, dOf(F.h)), '#b8b1a2');
    // 칠(면 위 4mm): 면의 기울기를 따라
    const tri = (pts, color) => { const g = new THREE.BufferGeometry(), A = []; for (let k = 1; k + 1 < pts.length; k++) for (const [u, y] of [pts[0], pts[k], pts[k + 1]]) { const q = P(u, y, dOf(y) + 0.004); A.push(q.x, q.y, q.z); } g.setAttribute('position', new THREE.Float32BufferAttribute(A, 3)); g.computeVertexNormals(); scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide }))); };
    if (F.tilt > 0) { tri([[u0, 0], [u0 + 1.6, 0], [u0, 3.4]], R); tri([[u1, 4.5], [u1 - 2.2, 4.5], [u1, 1.2]], Bl); } else tri([[u0, 4.5], [u1, 4.5], [u1, 2.6]], Y); }
  if (typeof document === 'undefined') return;
  const tape = (h, color, below) => { const n = h.face || V3(0, 0, 1), c = h.min.clone().add(h.max).multiplyScalar(0.5), back = c.clone().addScaledVector(n, -((n.x ? h.max.x - h.min.x : h.max.z - h.min.z) / 2 - 0.003));
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.10, 0.10), new THREE.MeshStandardMaterial({ color, roughness: 1 })); m.position.copy(back).setY(h.min.y - below); m.lookAt(m.position.clone().add(n)); scene.add(m); };
  const tag = (C, h) => { const cv = document.createElement('canvas'); cv.width = 256; cv.height = 80; const g = cv.getContext('2d'); g.fillStyle = C.color; g.fillRect(0, 0, 256, 80); g.fillStyle = ['#e8c21e', '#f4f2ea', '#45b8e0', '#ee7d21', '#e36fa8'].includes(C.color) ? '#222' : '#fff';
    g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.fillText(C.name, 128, 36); g.font = '21px sans-serif'; g.fillText(C.grade, 128, 66);
    const n = h.face || V3(0, 0, 1), c = h.min.clone().add(h.max).multiplyScalar(0.5), back = c.clone().addScaledVector(n, -((n.x ? h.max.x - h.min.x : h.max.z - h.min.z) / 2 - 0.004));
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.13), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv) })); m.position.copy(back).setY(h.min.y - 0.30); m.lookAt(m.position.clone().add(n)); scene.add(m); };
  for (const C of world.courses) { const st = C.holds.filter(h => h.role === 'start'); for (const h of C.holds) if (h.role === 'start') tape(h, '#ffffff', 0.07); else if (h.role === 'top') { tape(h, '#ffffff', 0.07); tape(h, '#111111', 0.18); } tag(C, st[st.length - 1]); }
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
