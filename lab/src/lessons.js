// 연습 과제와 시범: 과제마다 시작 자세, (필요하면) 벽에 더할 연습용 턱, 성공 조건, 그리고 "시범 입력"이 있다.
// 시범 입력은 [시각(초), 종류, 값…]의 목록이다. 게임은 초당 120번 고정 간격으로 계산하므로 같은 입력을 같은 시각에 넣으면 늘 같은 결과가 나온다.
//   ['aim', x, y] 조준점을 옮김 · ['press', 동작] 한 번 누름(클릭) · ['down', 동작] 누르기 시작 · ['up', 동작] 떼기
// 시범은 사람이 한 것이 아니라 시뮬레이션에서 되는 값을 찾아 적어 둔 스크립트 입력이다(test/lessons_check.js가 모두 성공하는지 확인한다).
'use strict';
const LESSON = (() => {
  const VERSION = 2;       // 과제·시범 묶음의 판 번호: 시범 입력, 연습용 턱, 성공 조건, 기준 설정을 바꾸면 올린다
  const PHYS = 'v0.8.2';   // 이 시범 시각을 찾았을 때의 물리 판(PH.VERSION). 물리 판이 달라지면 시범을 다시 확인하고 이 값을 맞춘다(test/lessons_check.js가 확인)
  // 시범의 기준 설정: 시범과 유령은 플레이어 설정과 상관없이 늘 이 설정으로 계산한다
  const BASE = { opt: { autoFeet: true, autoShift: true, assist: true, handMode: 1, assistRange: 'near', autoLoad: false }, body: 'joint', mode: 'intent', layout: null, physOn: true, couple: 0 };
  // 같은 입력이라도 결과를 바꾸는 보조 설정: 과제에 들어올 때 기준에 맞추고 나갈 때 되돌린다. 손 선택 방식(handMode)은 입력 방법일 뿐이라 플레이어 것을 그대로 둔다
  const TUNED = ['autoFeet', 'autoShift', 'assist', 'assistRange', 'autoLoad'];
  const B = s => s.world.find(p => p.id === 'B');
  const grips = (s, i, poly) => s.limb[i].mode === 'grip' && s.limb[i].anchor.poly === poly;
  const LIST = [
    { id: 'pullup', name: '팔 힘으로 허리까지 올라가기', station: 1,
      goal: '두 손으로 잡은 턱에서 W를 누르고 있어 가슴이 턱 위로 올라가게 한다',
      tips: ['W를 계속 누르고 있는다(약 2초)', '허리가 턱 높이에 오면 팔로 버틴다. 턱 위에 올라서지는 않는다'],
      steps: [[0.3, 'aim', 430, 420], [0.8, 'down', 'moveUp'], [3.2, 'up', 'moveUp']], T: 4.2,
      done: s => 300 - s.p[0].y >= 45 && grips(s, 0, 'A') && grips(s, 1, 'A') },
    { id: 'shift', name: '좌우 체중 이동', station: 1,
      goal: 'A로 엉덩이를 왼쪽에, D로 오른쪽에 실어 본다(두 발은 디딘 채)',
      tips: ['A를 누르면 다리가 펴지며 엉덩이가 왼쪽으로 빠지고 조금 들린다', '떼면 그 자리에서 버틴다'],
      steps: [[0.3, 'aim', 430, 420], [0.8, 'down', 'moveLeft'], [1.6, 'up', 'moveLeft'], [2.0, 'down', 'moveRight'], [3.3, 'up', 'moveRight']], T: 4.2,
      done: (s, m) => { m.x0 = m.x0 ?? s.p[1].x; if (s.p[1].x < m.x0 - 15) m.left = true; return !!m.left && s.p[1].x > m.x0 + 15 && s.limb[2].mode === 'plant' && s.limb[3].mode === 'plant'; } },
    { id: 'cross', name: '손 교차해 옮겨 잡기', station: 1,
      goal: '오른손을 왼손 너머 왼쪽에 잡고, 이어서 왼손을 더 왼쪽으로 옮긴다',
      tips: ['조준점을 왼손보다 왼쪽에 두고 우클릭', '몸이 손을 따라 왼쪽으로 기운다', '잡으면 조준점을 더 왼쪽으로 옮기고 좌클릭'],
      steps: [[0.3, 'aim', 250, 298], [0.8, 'press', 'sendR'], [2.3, 'aim', 210, 298], [2.5, 'press', 'sendL']], T: 4.5,
      done: (s, m) => { if (grips(s, 1, 'A') && s.p[3].x < s.p[2].x - 8 && grips(s, 0, 'A')) m.crossed = true; return !!m.crossed && grips(s, 0, 'A') && grips(s, 1, 'A') && s.p[2].x < s.p[3].x - 8; } },
    { id: 'jump1', name: '세 점에서 한 손으로 뛰어 잡기', station: 3,
      goal: '오른손을 먼저 보내고, Space를 0.5초 모았다 떼어 건너편 턱을 오른손으로 잡는다',
      tips: ['건너편 턱을 겨누고 우클릭 → 오른손이 먼저 뻗는다', 'Space를 누른 채 좌클릭 → 왼손이 "놓을 손"이 된다', 'Space를 0.5초쯤에 뗀다. 덜 모으면 못 미치고 더 모으면 지나친다'],
      steps: [[0.3, 'aim', 545, 348], [0.7, 'press', 'sendR'], [1.7, 'down', 'power'], [1.82, 'press', 'sendL'], [2.2, 'up', 'power']], T: 4.2,
      done: s => grips(s, 1, 'B'), mark: ['B', '과제 목표: 오른손으로 잡기'] },
    { id: 'onearm', name: '한 팔로 높이 뛰어 잡기', station: 3, view: 40, extra: [['H', 'ledge', 247, 105, 120, 12]],
      goal: '머리 위 높은 턱을 한 팔로 잡는다. 두 손을 다 놓고 뛰면 닿지 않는 높이다',
      tips: ['높은 턱을 겨누고 우클릭 → 오른손을 먼저 올린다', 'Space를 누른 채 좌클릭(왼손만 놓음), 0.8초 모았다 뗀다', '한 팔만 뻗으면 어깨가 올라가 더 높이 닿는다'],
      steps: [[0.3, 'aim', 307, 108], [0.7, 'press', 'sendR'], [1.7, 'down', 'power'], [1.82, 'press', 'sendL'], [2.5, 'up', 'power']], T: 4.5,
      done: s => grips(s, 1, 'H'), mark: ['H', '과제 목표: 한 팔로 잡기'] },
    { id: 'wjump', name: '온몸 도약: 떼면서 W', station: 3, view: 40, extra: [['H', 'ledge', 247, 95, 120, 12]],
      goal: '더 높은 턱. Space를 떼는 순간 W를 누르고 있어 팔로도 몸을 끌어 올린다',
      tips: ['한 팔 도약과 같은 순서로 준비한다', 'Space를 떼기 직전에 W를 누르고, 뜬 뒤까지 누르고 있는다', '왼팔이 끝까지 당기고 밀어 준 뒤 놓인다'],
      steps: [[0.3, 'aim', 307, 98], [0.7, 'press', 'sendR'], [1.7, 'down', 'power'], [1.82, 'press', 'sendL'], [2.47, 'down', 'moveUp'], [2.5, 'up', 'power'], [3.1, 'up', 'moveUp']], T: 4.5,
      done: s => grips(s, 1, 'H'), mark: ['H', '과제 목표: 한 팔로 잡기'] },
  ];
  // 시범 입력을 조작층이 읽는 입력(io)으로 바꿔 주는 재생기. step(t)는 지난 호출 뒤부터 t까지의 입력을 반영한다
  function player(lesson) {
    const held = new Set(); let k = 0, pressed = new Set(), pshift = new Set(), mx = 0, my = 0;
    const io = { get mx() { return mx; }, get my() { return my; }, down: id => held.has(id), pressed: id => pressed.has(id), pressedShift: id => pshift.has(id) };
    return { io, step(t) { pressed = new Set(); pshift = new Set();
      while (k < lesson.steps.length && lesson.steps[k][0] <= t + 1e-9) { const [, kind, a, b] = lesson.steps[k++];
        if (kind === 'aim') { mx = a; my = b; } else if (kind === 'press') pressed.add(a); else if (kind === 'pressShift') pshift.add(a); else if (kind === 'down') held.add(a); else if (kind === 'up') held.delete(a); }
      return io; } };
  }
  // 입력 기록: 차트에 그릴 수 있게 "누르고 있던 구간"(bars)과 "손발을 보낸 순간"(taps)을 모은다. 시범도 사람 입력도 같은 방법으로 기록한다.
  // 다시 재생할 수 있게 날것의 입력도 계산 걸음 번호(초당 120걸음)와 함께 남긴다: ev = 누름·뗌, aim = 조준점이 바뀐 걸음, optLog = 보조 설정이 바뀐 걸음. meta = 출발 상태·설정·판 번호(게임이 채운다)
  const HOLD = ['power', 'moveUp', 'moveDown', 'moveLeft', 'moveRight', 'foot'], TAP = ['sendL', 'sendR', 'sendBest', 'sendOther', 'cancel', 'foot'];
  function recorder(meta) {
    const rec = { bars: [], taps: [], presses: [], open: {}, t0: null, end: 0, meta: meta || null, ev: [], aim: [], optLog: [] }; let ax = null, ay = null, ok = '';
    // codeOf: 그 동작에 지금 실제로 쓰인 입력(주·보조 가운데 누른 쪽). 시범처럼 적어 둔 입력에는 없다(null)
    const codeOf = (io, id) => io.code ? io.code(id) : null, openCode = {};
    rec.tick = (t, io, sent, opt) => { rec.end = t; const f = Math.round(t * 120);
      if (io.mx !== ax || io.my !== ay) { ax = io.mx; ay = io.my; rec.aim.push([f, ax, ay]); }
      if (opt) { const k = JSON.stringify(opt); if (k !== ok) { ok = k; rec.optLog.push([f, JSON.parse(k)]); } }
      for (const id of HOLD) { const on = io.down(id);
        if (on && rec.open[id] === undefined) { rec.open[id] = t; openCode[id] = codeOf(io, id); rec.ev.push([f, 'down', id]); if (rec.t0 === null) rec.t0 = t; }
        if (!on && rec.open[id] !== undefined) { rec.bars.push({ id, a: rec.open[id], b: t, code: openCode[id] }); rec.ev.push([f, 'up', id]); delete rec.open[id]; } }
      if (io.pressed('cancel')) { rec.presses.push({ id: 'cancel', t, code: codeOf(io, 'cancel') }); if (rec.t0 === null) rec.t0 = t; } // 취소: 차트의 한 줄로 나온다(그때 누른 키와 함께)
      for (const id of TAP) { if (io.pressed(id)) rec.ev.push([f, 'press', id]); if (id.startsWith('send') && io.pressedShift(id)) rec.ev.push([f, 'pressShift', id]); }
      // 손발 보내기: 결정된 팔다리(limb), 쓴 동작(id: 손 선택 2번이면 sendBest·sendOther), 실제 누른 입력(code), 발이면 함께 누른 수정 키(mod)
      for (const sd of sent || []) { rec.taps.push({ limb: sd.i, t, phase: sd.phase, id: sd.id, code: codeOf(io, sd.id), mod: sd.i >= 2 ? codeOf(io, 'foot') : null }); if (rec.t0 === null) rec.t0 = t; } };
    rec.all = () => rec.bars.concat(Object.keys(rec.open).map(id => ({ id, a: rec.open[id], b: rec.end, live: true, code: openCode[id] })));
    rec.zero = () => rec.t0 ?? 0; // 차트의 0초 = 첫 입력(키를 누르거나 손을 보낸 순간)
    return rec;
  }
  // 기록 → 재생 입력: 같은 출발 상태·설정·물리에서 이 입력을 넣으면 같은 결과가 나온다(test/lessons_check.js가 확인). 같은 걸음에서는 조준점을 먼저 옮긴다
  function toSteps(rec) {
    const out = rec.aim.map(([f, x, y]) => [f / 120, 'aim', x, y]).concat(rec.ev.map(([f, kind, id]) => [f / 120, kind, id]));
    return out.map((st, k) => [st, k]).sort((a, b) => a[0][0] - b[0][0] || (a[0][1] === 'aim' ? 0 : 1) - (b[0][1] === 'aim' ? 0 : 1) || a[1] - b[1]).map(q => q[0]);
  }
  // 시범에서 조준점 옮기기를 뺀 첫 입력의 시각(유령을 내 첫 입력에 맞춰 출발시킬 때 쓴다)
  const firstInput = lesson => (lesson.steps.find(st => st[1] !== 'aim') || [0])[0];
  return { LIST, player, recorder, toSteps, HOLD, firstInput, VERSION, PHYS, BASE, TUNED };
})();
if (typeof module !== 'undefined') module.exports = LESSON;
