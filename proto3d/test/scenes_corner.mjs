// 다른 벽 시험 지형(src/world.js makeFixtureWorld)의 장면(p3d-0.10.4). test/corner_check.mjs와 같은 입력을 put/rep 꼴로 — 걸음 재기(motion_scan·arm_path_check)·손 확대(hand_frame_check)·영상(record_reach SET=corner)이 같은 입력을 쓴다.
// 꼴: [id, 제목, (sim, put, rep) => {...}, 발 보조, 모드, 시작 자리, 시작 방향(rad)]. 스크립트 입력(사람 손 아님)
const hand = (i, p) => ({ type: 'hand', i, p }), foot = (i, p) => ({ type: 'foot', i, p }), rel = (limb, i) => ({ type: 'release', limb, i });
// 계획 한 줄: ['h', 손, 자리, 걸음] · ['f', 발, 자리, 걸음] · ['w', 걸음] · ['d', 걸음, 좌우] · ['n', 걸음] · ['r', 손, , 걸음] · ['c', 손] · ['hd', 손, 자리, 걸음]
export const play = (rep, plan) => { rep(30); for (const [what, a, b, n] of plan) {
  if (what === 'h') rep(n || 180, {}, [hand(a, b)]); else if (what === 'f') rep(n || 260, {}, [foot(a, b)]); else if (what === 'w') rep(a, { cy: 1 }); else if (what === 'd') rep(a, { cx: b });
  else if (what === 'r') rep(n || 60, {}, [rel('hand', a)]); else if (what === 'c') rep(n || 60, {}, [{ type: 'handCancel', i: a }]); else if (what === 'hd') rep(n || 30, { reach: a ? [null, b] : [b, null] }, [{ ...hand(a, b), hold: true }]); else rep(a); } };
export const AtoB = [['h', 0, [-0.55, 1.92, -2.84]], ['h', 1, [-0.15, 1.92, -2.84]], ['f', 1, [-0.6, 0.5, -2.93]], ['w', 60],
  ['h', 1, [0.01, 1.91, -2.92]], ['d', 90, 1], ['n', 30], ['h', 1, [0.17, 1.91, -3.12]], ['n', 60], ['h', 0, [0.01, 1.91, -2.92]], ['n', 60], ['d', 90, 1], ['f', 0, [0.07, 0.5, -3.15]], ['n', 30], ['d', 90, 1], ['h', 1, [0.17, 1.91, -3.27]], ['n', 60], ['h', 0, [0.17, 1.91, -3.05]], ['n', 120]];
export const BACK = [['h', 0, [-0.22, 1.92, -2.84]], ['n', 60], ['d', 90, -1], ['h', 1, [0.01, 1.91, -2.92]], ['n', 60], ['d', 60, -1], ['f', 0, [-0.75, 0.5, -2.93]], ['n', 60], ['h', 0, [-0.6, 1.92, -2.84]], ['n', 60], ['h', 1, [-0.2, 1.92, -2.84]], ['n', 120]];
export const REVERSE = [['h', 1, [0.17, 1.91, -3.27]], ['h', 0, [0.17, 1.91, -3.05]], ['f', 0, [0.07, 0.5, -3.15]], ['w', 60], ['h', 0, [0.01, 1.91, -2.92]], ['n', 60], ['d', 90, -1], ['n', 30], ['h', 1, [0.01, 1.91, -2.95]], ['n', 60], ['h', 1, [-0.2, 1.92, -2.84]], ['n', 120]];
export const PRE = AtoB.slice(0, 7);
export const CSTART = [-0.45, 0, -2.58];
export const SCENES_C = [
  ['c1', '벽 A → 벽 B(바깥 모서리) → 다시 벽 A', (sim, put, rep) => play(rep, [...AtoB, ...BACK]), false, 1, CSTART, Math.PI],
  ['c2', '반대 방향: 벽 B를 보고 시작 → 벽 A', (sim, put, rep) => play(rep, REVERSE), false, 1, [0.4, 0, -3.15], -Math.PI / 2],
  ['c3', '취소: 벽 B로 뻗다가 거둠(손 조작 2)', (sim, put, rep) => play(rep, [...PRE, ['hd', 1, [0.17, 1.91, -3.12], 20], ['c', 1], ['n', 60]]), false, 1, CSTART, Math.PI],
  ['c4', '바꾸기: 벽 B로 보낸 손을 0.1초 만에 벽 A로', (sim, put, rep) => play(rep, [...PRE, ['h', 1, [0.17, 1.91, -3.12], 12], ['h', 1, [-0.12, 1.92, -2.84]], ['n', 60]]), false, 1, CSTART, Math.PI],
  ['c5', '놓기 → 다시 잡기: 벽 B', (sim, put, rep) => play(rep, [...PRE, ['h', 1, [0.17, 1.91, -3.12]], ['n', 30], ['r', 1, null, 60], ['h', 1, [0.17, 1.91, -3.12]], ['n', 60]]), false, 1, CSTART, Math.PI],
  ['c6', '혼자 선 긴 턱 C: 끝 쪽에 서서 끝 옆면', (sim, put, rep) => play(rep, [['h', 1, [3.21, 1.69, -1.0]], ['n', 60], ['h', 0, [3.21, 1.69, -0.92]], ['n', 60]]), false, 1, [3.55, 0, -0.97], -Math.PI / 2],
  ['c7', '혼자 선 긴 턱 C: 뒤에서(뒷면 모서리)', (sim, put, rep) => play(rep, [['h', 1, [2.4, 1.70, -1.04]], ['h', 0, [2.8, 1.70, -1.04]], ['n', 60]]), false, 1, [2.6, 0, -1.45], 0],
  ['c8', '양면 벽 D: 앞에서', (sim, put, rep) => play(rep, [['h', 0, [4.8, 1.88, -0.95]], ['h', 1, [5.2, 1.88, -0.95]], ['n', 60]]), false, 1, [5.0, 0, -0.55], Math.PI],
];
