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
