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
  ['u5 보통: 오른발을 낮은 발판에 → 몸 위로 → 왼발을 무릎 높이 벽면에', (sim, put, rep) => { ustart(rep); rep(200, {}, [foot(1, [-0.45, 0.5, -2.93])]); rep(120, { cy: 1 }); rep(200, {}, [foot(0, [-1.2, 0.75, -3.0])]); rep(120); }, false, 1, UST],
];
