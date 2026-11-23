// 발 장면 묶음(p3d-0.9.0): 발 올리기 → 디딤 → 몸 올리기 → 손 뻗기. record_reach.mjs(영상)·motion_scan.mjs(걸음마다 재기)·dense_strip.mjs(빠짐없는 장면 그림)가 같은 입력을 쓴다
// 장면 = [제목, (sim, put, rep) => 입력을 쌓는 함수, 발 보조 켬, 손 조작(1·2), 출발 자리]. 스크립트 입력(사람 손 아님)
const hand = (i, p) => ({ type: 'hand', i, p }), foot = (i, p) => ({ type: 'foot', i, p }), rel = (limb, i) => ({ type: 'release', limb, i });
export const START = [-0.62, 0, -2.58], F = [-0.3, 2.15, -2.86], AL = [-0.72, 1.92, -2.84], AR = [-0.62, 1.92, -2.84], LOW = [-0.45, 0.5, -2.93];
const A2 = [-1.15, 1.92, -2.84], K1 = [-0.40, 0.5, -2.93], grabA = rep => { rep(60); rep(150, {}, [hand(0, AL)]); };
export const SCENES_FOOT = [
  ['① 낮은 발판(30cm)에 왼발 → 몸 위로(W) 1초', (sim, put, rep) => { rep(60); rep(150, {}, [hand(0, A2)]); rep(150, {}, [foot(0, [-1.35, 0.30, -2.72])]); rep(120, { cy: 1 }); rep(150); }, false, 1, [-1.05, 0, -2.58]],
  ['② 무릎 높이 발판(50cm)에 오른발(같은 쪽) → 몸 위로(W) 1초 → 오른손을 턱 F로', (sim, put, rep) => { grabA(rep); rep(180, {}, [foot(1, K1)]); rep(120, { cy: 1 }); rep(60); rep(300, {}, [hand(1, F)]); }, false],
  ['③ 같은 발판에 왼발(교차 — 사용자가 짚은 장면) → 몸 위로(W) 1초 → 오른손을 턱 F로', (sim, put, rep) => { grabA(rep); rep(180, {}, [foot(0, LOW)]); rep(120, { cy: 1 }); rep(60); rep(300, {}, [hand(1, F)]); }, false],
  ['④ 옆 발판: 오른발을 47cm 옆으로 → 몸 위로(W) 1초', (sim, put, rep) => { grabA(rep); rep(180, {}, [foot(1, [-0.15, 0.5, -2.93])]); rep(120, { cy: 1 }); rep(150); }, false],
  ['⑤ 가는 중에 취소: 오른발을 보내고 0.2초 뒤 그 발을 놓음 → 1초 뒤 다시 보냄', (sim, put, rep) => { grabA(rep); rep(24, {}, [foot(1, K1)]); rep(120, {}, [rel('foot', 1)]); rep(240, {}, [foot(1, K1)]); }, false],
  ['⑥ 닿지 않는 발판: 왼쪽에 서서 오른발을 멀리(6cm쯤 모자란다) → 거부 → 돌아옴', (sim, put, rep) => { rep(60); rep(150, {}, [hand(0, A2)]); rep(330, {}, [foot(1, [-0.12, 0.5, -2.93])]); }, false, 1, [-1.0, 0, -2.58]],
  ['⑦ 손이 닿지 않는 높이: 오른발을 올리고 W를 0.12초만 → 오른손을 턱 F로 → 거부 → 팔이 돌아옴', (sim, put, rep) => { grabA(rep); rep(180, {}, [foot(1, K1)]); rep(15, { cy: 1 }); rep(90); rep(300, {}, [hand(1, F)]); }, false],
  ['⑧ 손 조작 2로 ②와 같은 흐름(오른손은 누르는 동안 뻗고 떼면 잡기)', (sim, put, rep) => { grabA(rep); rep(180, {}, [foot(1, K1)]); rep(120, { cy: 1 }); rep(60); rep(100, { reach: [null, F] }, [{ ...hand(1, F), hold: true }]); rep(240, {}, [{ type: 'handUp', i: 1 }]); }, false, 2],
  ['⑨ 발 보조 켬: 왼손으로 턱 A를 잡고 몸 위로(W) 1.5초(올라가는 동안 보조가 발을 발판으로 보낸다) → 오른손을 턱 F로', (sim, put, rep) => { grabA(rep); rep(180, { cy: 1 }); rep(150); rep(300, {}, [hand(1, F)]); }, true],
];

// 한 손 뻗기 묶음(p3d-0.8.8): 지지 발을 둔 채 한 손 뻗기 → 잡기 또는 막힘 → 복귀
// 앞 조건: 왼손으로 턱 A를 잡고 왼발을 낮은 발판에 올린다(오른발은 놓여 있다)
const setup = rep => { rep(60); rep(150, {}, [hand(0, AL)]); rep(260, {}, [foot(0, LOW)]); };
export const SCENES = [
  ['① 막힘 → 복귀: 올라서다 만 자리에서 오른손을 턱 F로(닿지 않는다) → 거부 → 팔이 돌아옴. 두 번', (sim, put, rep) => { setup(rep); rep(45, { cy: 1 }); rep(120); rep(300, {}, [hand(1, F)]); rep(300, {}, [hand(1, F)]); }, false],
  ['② 잡기: 왼발로 올라선 뒤 오른손을 턱 F로 → 잡음 → 2초', (sim, put, rep) => { setup(rep); rep(120, { cy: 1 }); rep(120); rep(360, {}, [hand(1, F)]); }, false],
  ['③ 잡기 → 놓고 되돌리기: 턱 F를 잡았다가 놓고(오른손) 턱 A로 다시', (sim, put, rep) => { setup(rep); rep(120, { cy: 1 }); rep(120); rep(240, {}, [hand(1, F)]); rep(150, {}, [rel('hand', 1)]); rep(300, {}, [hand(1, AR)]); }, false],
  ['④ 올라서며 뻗기: 몸 위로(W)를 누른 채 오른손을 턱 F로 → 잡음', (sim, put, rep) => { setup(rep); rep(40, { cy: 1 }); rep(1, { cy: 1 }, [hand(1, F)]); rep(200, { cy: 1 }); rep(200); }, false],
  ['⑤ 사용자 플레이와 같은 설정(발 보조 켬): 막힘 → 복귀 → 다시 뻗기', (sim, put, rep) => { setup(rep); rep(45, { cy: 1 }); rep(120); rep(300, {}, [hand(1, F)]); rep(60, { cy: 1 }); rep(360, {}, [hand(1, F)]); }, true],
  ['⑥ 손 조작 2(누르는 동안 뻗고 떼면 잡기): 닿지 않는 자리에서 0.9초 누르다 뗌 → 올라선 뒤 다시 눌러 닿으면 뗌', (sim, put, rep) => { setup(rep); rep(45, { cy: 1 }); rep(120); rep(110, { reach: [null, F] }, [{ ...hand(1, F), hold: true }]); rep(200, {}, [{ type: 'handUp', i: 1 }]); rep(75, { cy: 1 }); rep(60); rep(100, { reach: [null, F] }, [{ ...hand(1, F), hold: true }]); rep(260, {}, [{ type: 'handUp', i: 1 }]); }, false, 2],
];

// 새 몸의 대표 장면(p3d-0.10.1, GPT의 0.10.0 검토: 원래 장면은 그대로 두고 새 몸에서도 할 수 있는 대표 장면을 따로). 왼손 턱 A → 왼발 낮은 발판(교차) → W → 오른손 다음 턱
// 같은 시작: 왼손으로 턱 A(−0.72)를 잡고 왼발을 낮은 발판에 올린다. 스크립트 입력(사람 손 아님)
const AEND = [-0.6, 1.92, -2.84], hstart = rep => { rep(60); rep(150, {}, [hand(0, AL)]); rep(260, {}, [foot(0, LOW)]); };
export const SCENES_H = [
  ['h1 성공: 발판에 올라 W 1초(체중 이동·몸 올리기) → 오른손을 턱 F로 → 잡음', (sim, put, rep) => { hstart(rep); rep(120, { cy: 1 }); rep(120); rep(360, {}, [hand(1, F)]); }, false],
  ['h2 중간 취소 후 다시: 왼발을 보내고 0.2초 뒤 놓음 → 다시 보냄 → W 1초 → 오른손 턱 F', (sim, put, rep) => { rep(60); rep(150, {}, [hand(0, AL)]); rep(24, {}, [foot(0, LOW)]); rep(120, {}, [rel('foot', 0)]); rep(260, {}, [foot(0, LOW)]); rep(120, { cy: 1 }); rep(60); rep(360, {}, [hand(1, F)]); }, false],
  ['h3 막혀 실패 → 다른 목표: W 0.12초만 → 오른손 턱 F(닿지 않음) → 오른손을 턱 A의 오른쪽 끝으로', (sim, put, rep) => { hstart(rep); rep(15, { cy: 1 }); rep(90); rep(300, {}, [hand(1, F)]); rep(300, {}, [hand(1, AEND)]); }, false],
  ['h4 막혀 실패 → 몸을 올려 다시: W 0.12초 → 턱 F(닿지 않음) → W 0.8초 → 턱 F 다시', (sim, put, rep) => { hstart(rep); rep(15, { cy: 1 }); rep(90); rep(300, {}, [hand(1, F)]); rep(100, { cy: 1 }); rep(60); rep(300, {}, [hand(1, F)]); }, false],
  ['h5 다시 잡기: 턱 F를 잡았다가 놓고 1초 뒤 같은 턱 F를 다시 잡음', (sim, put, rep) => { hstart(rep); rep(120, { cy: 1 }); rep(120); rep(300, {}, [hand(1, F)]); rep(120, {}, [rel('hand', 1)]); rep(300, {}, [hand(1, F)]); }, false],
];

// 대표 장면의 변형(p3d-0.10.2, GPT의 0.10.1 검토 1번: "h3만 되는 맞춤 예외가 아니라 h1~h5, 좌우 반전, 조금 다른 시작점·발 높이·입력 길이에서 확인"). 원래 장면(SCENES_H)은 옮기지 않았다. 스크립트 입력(사람 손 아님)
//   좌우 반전: 벽이 좌우 대칭이 아니라 같은 자리를 거울로 옮길 수 없다 → 손발을 바꾸고 턱 A의 왼쪽을 쓴다(오른손 턱 A → 오른발을 넓은 발판으로 엇갈려 → W → 왼손을 턱 A의 왼쪽 끝 옆면으로).
const AR2 = [-1.05, 1.92, -2.84], WIDE = [-1.50, 0.30, -2.72], ALEND = [-1.6, 1.92, -2.84], mstart = rep => { rep(60); rep(150, {}, [hand(1, AR2)]); rep(260, {}, [foot(1, WIDE)]); }, MSTART = [-1.10, 0, -2.58];
const hst = (rep, low = LOW, a = AL) => { rep(60); rep(150, {}, [hand(0, a)]); rep(260, {}, [foot(0, low)]); };
export const SCENES_HV = [
  ['v1 h1의 시작점 +5cm(오른쪽)', (sim, put, rep) => { hst(rep); rep(120, { cy: 1 }); rep(120); rep(360, {}, [hand(1, F)]); }, false, 1, [-0.57, 0, -2.58]],
  ['v2 h1의 시작점 −5cm(왼쪽)', (sim, put, rep) => { hst(rep); rep(120, { cy: 1 }); rep(120); rep(360, {}, [hand(1, F)]); }, false, 1, [-0.67, 0, -2.58]],
  ['v3 h1의 발 자리를 바꿈(낮은 발판 −0.35)', (sim, put, rep) => { hst(rep, [-0.35, 0.5, -2.93]); rep(120, { cy: 1 }); rep(120); rep(360, {}, [hand(1, F)]); }, false],
  ['v4 h1의 W 0.8초', (sim, put, rep) => { hst(rep); rep(96, { cy: 1 }); rep(144); rep(360, {}, [hand(1, F)]); }, false],
  ['v5 h1의 W 1.3초', (sim, put, rep) => { hst(rep); rep(156, { cy: 1 }); rep(84); rep(360, {}, [hand(1, F)]); }, false],
  ['v6 h3의 다른 목표를 턱 A의 끝 옆면 대신 앞면(−0.65)으로', (sim, put, rep) => { hst(rep); rep(15, { cy: 1 }); rep(90); rep(300, {}, [hand(1, F)]); rep(300, {}, [hand(1, [-0.65, 1.92, -2.84])]); }, false],
  ['v7 h3의 W 0.2초', (sim, put, rep) => { hst(rep); rep(24, { cy: 1 }); rep(81); rep(300, {}, [hand(1, F)]); rep(300, {}, [hand(1, AEND)]); }, false],
  ['m1 좌우 반전 h1: 오른손 턱 A → 오른발 넓은 발판(엇갈림) → W 1초 → 왼손 턱 A의 왼쪽 끝(옆면)', (sim, put, rep) => { mstart(rep); rep(120, { cy: 1 }); rep(120); rep(300, {}, [hand(0, ALEND)]); }, false, 1, MSTART],
  ['m3 좌우 반전 h3: W 0.12초 → 왼손 턱 A의 왼쪽 끝(옆면)', (sim, put, rep) => { mstart(rep); rep(15, { cy: 1 }); rep(90); rep(300, {}, [hand(0, ALEND)]); }, false, 1, MSTART],
  ['m5 좌우 반전 h5: 왼손으로 턱 A 왼쪽 끝을 잡았다가 놓고 다시', (sim, put, rep) => { mstart(rep); rep(120, { cy: 1 }); rep(120); rep(240, {}, [hand(0, ALEND)]); rep(120, {}, [rel('hand', 0)]); rep(300, {}, [hand(0, ALEND)]); }, false, 1, MSTART],
];

// 매달리기·흔들기·당겨 오르기(p3d-0.11.0, 전신 자세 풀이를 눈으로 보는 데 쓴다): 턱 B 앞에서 뛰어 두 손으로 잡는다 → 2초 매달림 → 흔들기(오른쪽 0.5초·왼쪽 0.5초 두 번) → W 1초 → 오른손 놓고 1초 → 다시 잡기
const BL = [0.5, 2.32, -2.86], BR = [0.9, 2.32, -2.86], JSTART = [0.7, 0, -2.65];
export const SCENES_J = [
  ['j1 뛰어 잡기 → 매달림 → 흔들기 → 당겨 오르기 → 한 손 놓고 다시', (sim, put, rep) => { rep(30); rep(1, { jump: true }, [hand(0, BL), hand(1, BR)]); rep(59, { jump: true }); rep(240); for (let i = 0; i < 2; i++) { rep(60, { cx: 1 }); rep(60, { cx: -1 }); } rep(180); rep(120, { cy: 1 }); rep(60); rep(120, {}, [rel('hand', 1)]); rep(240, {}, [hand(1, BR)]); }, false, 1, JSTART],
];

// 사용자 플레이(0.11.0)의 화면 캡처를 다시 만든 장면(p3d-0.11.1): 턱 A를 두 손으로 잡고 발을 말이 안 되는 자리로 보낸다. 0.11.0에서는 그대로 디뎠다. 스크립트 입력(사람 손 아님)
const UST = [-0.9, 0, -2.58], ustart = rep => { rep(30); rep(150, {}, [hand(0, [-1.1, 1.92, -2.84])]); rep(150, {}, [hand(1, [-0.7, 1.92, -2.84])]); };
export const SCENES_U = [
  ['u1 캡처 1: 오른발을 어깨 높이의 벽면에(옆으로) → 몸 왼쪽으로', (sim, put, rep) => { ustart(rep); rep(200, {}, [foot(1, [-0.30, 1.30, -3.0])]); rep(120, { cx: -1 }); rep(120); }, false, 1, UST],
  ['u2 캡처 mocap 2: 두 발을 양옆 엉덩이 높이의 벽면에', (sim, put, rep) => { ustart(rep); rep(200, {}, [foot(0, [-1.55, 0.95, -3.0])]); rep(200, {}, [foot(1, [-0.25, 0.95, -3.0])]); rep(120); }, false, 1, UST],
  ['u3 캡처 4: 왼발을 몸 건너편 엉덩이 높이에 → 오른발을 오른쪽 멀리 → 몸 아래로', (sim, put, rep) => { ustart(rep); rep(200, {}, [foot(0, [-0.25, 0.95, -3.0])]); rep(200, {}, [foot(1, [-0.05, 0.60, -3.0])]); rep(120, { cy: -1 }); rep(120); }, false, 1, UST],
  ['u4 캡처 mocap 1: 오른발을 머리 높이의 벽면에 → 오른손을 놓음', (sim, put, rep) => { ustart(rep); rep(200, {}, [foot(1, [-0.45, 1.55, -3.0])]); rep(200, {}, [rel('hand', 1)]); }, false, 1, UST],
  ['u6 손 모으기(사용자 영상 0.11.1 v6): 오른손만 뛰어 잡아 턱 B에 매달림 → 왼손을 오른손 15cm 옆에', (sim, put, rep) => { rep(30); put({ jump: true }, [hand(1, [0.9, 2.32, -2.86])]); rep(59, { jump: true }); rep(180); rep(240, {}, [hand(0, [0.75, 2.32, -2.86])]); }, false, 1, [0.62, 0, -2.65]],
  ['u7 발 없이 두 손 매달림(사용자 영상 0.11.1 v3: 다리가 O자로 벌어짐)', (sim, put, rep) => { rep(30); put({ jump: true }, [hand(0, [0.5, 2.32, -2.86]), hand(1, [0.9, 2.32, -2.86])]); rep(59, { jump: true }); rep(300); }, false, 1, [0.7, 0, -2.65]],
  ['u8 점프하고 0.25초 뒤 왼손을 턱 B로(사용자 영상 0.11.1 v3·v5: 점프 잡기)', (sim, put, rep) => { rep(30); rep(30, { jump: true }); put({ jump: true }, [hand(0, [0.5, 2.32, -2.86])]); rep(29, { jump: true }); rep(200); }, false, 1, [0.62, 0, -2.65]],
  ['u9 사용자 영상 0.11.3 v2 29.9초·v3 45초: 오른손 턱 F 한 손 매달림 + 두 발을 낮은 발판에 모음 → 몸 위로(W) 1초(팔이 머리 위로 접힘)', (sim, put, rep) => { rep(60); rep(150, {}, [hand(0, AL)]); rep(260, {}, [foot(0, LOW)]); rep(120, { cy: 1 }); rep(120); rep(360, {}, [hand(1, F)]); rep(120, {}, [rel('hand', 0)]); rep(300, {}, [foot(1, [-0.30, 0.5, -2.93])]); rep(200); rep(120, { cy: 1 }); rep(200); }, false],
  ['u10 사용자 영상 0.11.3 v3 49초·v2 42.7초: 한 손 매달림에서 손을 놓고 떨어짐 → 착지', (sim, put, rep) => { rep(60); rep(150, {}, [hand(0, AL)]); rep(260, {}, [foot(0, LOW)]); rep(120, { cy: 1 }); rep(120); rep(360, {}, [hand(1, F)]); rep(120, {}, [rel('hand', 0)]); rep(120, {}, [rel('foot', 0)]); rep(30, {}, [rel('hand', 1)]); rep(200); }, false],
  ['u11 두 손 매달림(턱 B)에서 두 손을 놓고 떨어짐 → 착지(사용자 영상 0.11.3 v3 49초 "스파이더맨 같은 점프")', (sim, put, rep) => { rep(30); put({ jump: true }, [hand(0, [0.5, 2.32, -2.86]), hand(1, [0.9, 2.32, -2.86])]); rep(59, { jump: true }); rep(200); put({}, [rel('hand', 0), rel('hand', 1)]); rep(200); }, false, 1, [0.7, 0, -2.65]],
  ['u12 사용자 스크린샷(0.11.4, 그림 25): 왼손 턱 A·오른손 턱 F, 두 발을 낮은 발판에 모아 섬(왼팔이 머리 위로 접힘)', (sim, put, rep) => { rep(60); rep(150, {}, [hand(0, AL)]); rep(260, {}, [foot(0, LOW)]); rep(120, { cy: 1 }); rep(120); rep(360, {}, [hand(1, F)]); rep(300, {}, [foot(1, [-0.30, 0.5, -2.93])]); rep(200); rep(120, { cy: 1 }); rep(240); }, false],
  ['u5 보통: 오른발을 낮은 발판에 → 몸 위로 → 왼발을 무릎 높이 벽면에', (sim, put, rep) => { ustart(rep); rep(200, {}, [foot(1, [-0.45, 0.5, -2.93])]); rep(120, { cy: 1 }); rep(200, {}, [foot(0, [-1.2, 0.75, -3.0])]); rep(120); }, false, 1, UST],
];

// p3d-0.11.5 확인 영상(사용자: "지금은 플레이해 볼 수 없으니 영상을 찍어 보내 달라"). 화면 기본 설정(전신 자세 풀이·잡기 보정 켬)으로 본다. 스크립트 입력(사람 손 아님)
//   흔들기 장면은 입력을 만드는 계산(sim)의 빠르기를 보고 뻗는 때를 정한다 — 화면도 같은 계산이라 같은 때가 된다
const swingThen = (sim, rep, put, goal) => { let vmax = 0; for (let k = 0; k < 600; k++) { const v = sim.body.vel.x; vmax = Math.max(vmax, Math.abs(v)); if (k > 200 && v > 0.8 * vmax && v > 0.25) { put({}, [hand(1, goal)]); return; } rep(1, { cx: Math.floor(k / 45) % 2 ? 1 : -1 }); } };
export const SCENES_V115 = [
  ['A 한 손 + 두 발 벽면에서 벽 점프(Space 0.3초) — 0.11.4: 7cm, 0.11.5: 33cm', (sim, put, rep) => { rep(30); put({ jump: true }, [hand(0, [0.5, 2.32, -2.86]), hand(1, [0.9, 2.32, -2.86])]); rep(59, { jump: true }); rep(200); rep(240, {}, [foot(0, [0.45, 0.8, -3.0])]); rep(240, {}, [foot(1, [0.95, 0.8, -3.0])]); rep(120, {}, [rel('hand', 0)]); rep(120); rep(36, { jump: true }); rep(200); }, false, 1, [0.7, 0, -2.65]],
  ['B 같은 자세(왼손만 턱 B)에서 벽 점프하며 오른손을 턱 D로(잡기 보정·반동)', (sim, put, rep) => { rep(30); put({ jump: true }, [hand(0, [0.5, 2.32, -2.86]), hand(1, [0.9, 2.32, -2.86])]); rep(59, { jump: true }); rep(200); rep(240, {}, [foot(0, [0.45, 0.8, -3.0])]); rep(240, {}, [foot(1, [0.95, 0.8, -3.0])]); rep(120, {}, [rel('hand', 1)]); rep(120); rep(8, { jump: true }); put({ jump: true }, [hand(1, [1.0, 2.48, -2.86])]); rep(27, { jump: true }); rep(260); }, false, 1, [0.7, 0, -2.65]],
  ['C 한 손 매달림(턱 B)에서 흔들어 오른쪽 아래의 턱 E로(가만히는 23cm 모자람)', (sim, put, rep) => { rep(30); put({ jump: true }, [hand(0, [0.8, 2.32, -2.86])]); rep(59, { jump: true }); rep(200); for (let k = 0; k < 900 && sim.body.vel.length() > 0.08; k++) rep(1); swingThen(sim, rep, put, [1.80, 1.90, -2.86]); rep(300); }, false, 1, [0.95, 0, -2.65]],
  ['D 땅에서 턱 A로 손 — 2cm 모자란 자리(잡기 보정으로 잡음)', (sim, put, rep) => { rep(30); rep(260, {}, [hand(1, [-0.65, 1.92, -2.84])]); rep(120); }, false, 1, [-1.10, 0, -2.58]],
  ['E 턱 F 바로 밑에서 점프하며 왼손(0.11.4까지 "충격이 커서 놓침")', (sim, put, rep) => { rep(60); rep(6, { jump: true }); put({ jump: true }, [hand(0, [-0.3, 2.15, -2.86])]); rep(53, { jump: true }); rep(300); }, false, 1, [-0.3, 0, -2.62]],
  ['F 그림 25 재현: 왼손 턱 A·오른손 턱 F, 두 발을 낮은 발판에 → 몸 위로(W)', (sim, put, rep) => { rep(60); rep(150, {}, [hand(0, AL)]); rep(260, {}, [foot(0, LOW)]); rep(120, { cy: 1 }); rep(120); rep(360, {}, [hand(1, F)]); rep(300, {}, [foot(1, [-0.30, 0.5, -2.93])]); rep(200); rep(120, { cy: 1 }); rep(240); }, false],
  ['G 두 손 매달림에서 두 손을 놓고 떨어짐 → 착지(0.11.3의 "스파이더맨" 자세)', (sim, put, rep) => { rep(30); put({ jump: true }, [hand(0, [0.5, 2.32, -2.86]), hand(1, [0.9, 2.32, -2.86])]); rep(59, { jump: true }); rep(200); put({}, [rel('hand', 0), rel('hand', 1)]); rep(240); }, false, 1, [0.7, 0, -2.65]],
];
// p3d-0.11.6 확인 영상 장면(사용자 0.11.5 영상 의견 네 가지). 0.11.5의 장면을 다시 쓰고, 제자리 점프·팔 확인 장면을 더한다. 스크립트 입력(사람 손 아님)
export const SCENES_V116 = [
  ['① F: 왼발을 낮은 발판에(엇갈림) → 몸 위로 → 오른발도 낮은 발판에(0.11.5 영상 57초~1분: 오른발이 왼발을 지나감)', ...SCENES_V115[5].slice(1)],
  ['② 제자리 점프(Space 0.25초) → 착지(0.11.5: 꼭대기에서 무릎을 가슴까지 당기는 자세)', (sim, put, rep) => { rep(40); rep(30, { jump: true }); rep(180); }, false],
  ['② 점프하고 0.25초 뒤 왼손을 턱 B로(점프 잡기)', ...SCENES_U.find(s => s[0].startsWith('u8')).slice(1)],
  ['② 턱 F 바로 밑에서 점프하며 왼손', ...SCENES_V115[4].slice(1)],
  ['③ 팔 확인: 발판에 올라 W 1초 → 오른손을 턱 F로(뻗는 팔이 위로 돌아가는 길 — 0.11.5는 어깨 범위를 49°까지 넘었다)', ...SCENES_H[0].slice(1)],
  ['③ 팔 확인: 뛰어 잡기 → 매달림 → 흔들기 → 당겨 오르기 → 한 손 놓고 다시', ...SCENES_J[0].slice(1)],
  ['④ 땅에서 턱 A로 손(손목·손등·손가락 — 0.11.5는 손바닥이 화면 쪽으로 돌았다)', ...SCENES_V115[3].slice(1)],
];
// p3d-0.11.7 자세 정리 ④(사용자 그림 26·27: 땅에서 손을 뻗는 동안 두 발이 앞뒤로 크게 벌어지거나 엇갈림): 걸으며·옆으로 걸으며 손을 보낸다. 스크립트 입력(사람 손 아님)
export const SCENES_GW = [
  ['g1 벽 쪽으로 걸어가며(1초) 0.5초에 오른손을 턱 A로', (sim, put, rep) => { rep(20); rep(60, { mz: -1 }); put({ mz: -1 }, [{ type: 'hand', i: 1, p: [-0.62, 1.92, -2.84] }]); rep(59, { mz: -1 }); rep(200); }, false, 1, [-0.62, 0, -1.4]],
  ['g2 벽을 따라 오른쪽으로 걸으며(1.2초) 왼손을 턱 A로', (sim, put, rep) => { rep(20); rep(40, { mx: 1 }); put({ mx: 1 }, [{ type: 'hand', i: 0, p: [-0.72, 1.92, -2.84] }]); rep(100, { mx: 1 }); rep(200); }, false, 1, [-1.4, 0, -2.5]],
  ['g3 벽 쪽으로 걸어가 멈춘 직후(0.1초) 오른손을 턱 A로', (sim, put, rep) => { rep(20); rep(110, { mz: -1 }); rep(12); rep(1, {}, [{ type: 'hand', i: 1, p: [-0.62, 1.92, -2.84] }]); rep(240); }, false, 1, [-0.62, 0, -1.4]],
  ['g4 벽 앞에서 비스듬히(오른쪽 앞) 0.3초 걷다 멈추며 왼손을 턱 A로 — 몸이 비스듬한 채 잡혀 한 발이 1cm 들림(자세 정리 ④에서 찾음)', (sim, put, rep) => { rep(20); rep(36, { mx: 1, mz: -1 }); rep(1, {}, [{ type: 'hand', i: 0, p: [-0.72, 1.92, -2.84] }]); rep(240); }, false, 1, [-0.62, 0, -2.2]],
  ['gj1 제자리 점프(Space 0.25초) → 착지(자세 정리 ⑩: 팔을 옆으로 크게 벌림)', (sim, put, rep) => { rep(40); rep(30, { jump: true }); rep(150); }, false, 1, [-0.62, 0, -1.6]],
  ['gj2 걸으며 점프(1초 걷다 Space 0.25초) → 착지', (sim, put, rep) => { rep(20); rep(120, { mz: 1 }); rep(30, { mz: 1, jump: true }); rep(60, { mz: 1 }); rep(90); }, false, 1, [-0.62, 0, -2.2]],
];
