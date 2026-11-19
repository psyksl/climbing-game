// 동작 이름표: 화면에 쓰는 동작 이름과 역할 색을 한곳에 둔다. 어떤 키가 그 동작에 배정됐는지는 BIND(bind.js), 키캡에 쓰는 글자는 입력 도감(input-catalog.js)이 따로 맡는다.
// 그래서 키를 다시 지정해도 이름은 그대로이고, 이름을 고쳐도 키 표시는 그대로다.
// 이름 규칙: 짧게, 같은 종류는 같은 꼴로. 손발 = "~ 보내기", 몸 = "몸 ~", 조준 = "조준 ~", 켜고 끄는 것 = 그 기능의 이름
'use strict';
const ACT = (() => {
  // 동작 id → 짧은 이름(키 안내·설정 화면에 쓴다)
  const name = {
    sendL: '왼손 보내기', sendR: '오른손 보내기', sendBest: '추천 손 보내기', sendOther: '다른 손 보내기', foot: '발 조종',
    power: '모으기', cancel: '취소', moveUp: '몸 위로', moveDown: '몸 아래로', moveLeft: '몸 왼쪽', moveRight: '몸 오른쪽',
    aimUp: '조준 위', aimDown: '조준 아래', aimLeft: '조준 왼쪽', aimRight: '조준 오른쪽', aimSlow: '조준 천천히',
    handMode: '손 선택 방식', assistRange: '잡기 범위', assist: '닿으면 잡기', autoFeet: '자동 발', autoShift: '자동 체중 이동', autoLoad: '자동 싣기', log: '로그',
    demo: '시범', lessonNext: '다음 과제', chart: '입력 타임라인', dock: '차트 자리', guide: '키 안내', viewFit: '화면 맞춤', viewMenu: '보기 설정', chartLeft: '시간축 앞으로', chartRight: '시간축 뒤로', chartZoomOut: '시간축 축소', chartZoomIn: '시간축 확대', chartFit: '전체 보기', ghost: '시범 유령',
    replay: '리플레이', rpPlay: '재생·멈춤', rpBack: '뒤로', rpFwd: '앞으로', rpSpeed: '재생 속도',
    reset: '다시', scheme: '조작 방식', st1: '시작 자세 1', st2: '시작 자세 2', st3: '시작 자세 3', st4: '시작 자세 4', st5: '시작 자세 5',
    slow: '절반 속도', couple: '도약 연결', layout: '연습 배치', phys: '물리 판', body: '몸 바꾸기', settings: '키 설정',
  };
  // 동작 id → 역할 색(input-catalog.js의 roles). 없으면 neutral
  const role = { sendL: 'left', sendR: 'right', sendBest: 'any', sendOther: 'any', foot: 'foot', power: 'power', moveUp: 'body', moveDown: 'body', moveLeft: 'body', moveRight: 'body' };
  // 실제로 수행된 동작(타임차트의 줄): 손발은 "결정된 팔다리", 몸은 누르고 있던 동작
  const LIMB = [{ name: '왼손', role: 'left' }, { name: '오른손', role: 'right' }, { name: '왼발', role: 'foot' }, { name: '오른발', role: 'foot' }];
  const HOLD = { power: { name: '모으기', role: 'power' }, moveUp: { name: '몸 위로', role: 'body' }, moveDown: { name: '몸 아래로', role: 'body' }, moveLeft: { name: '몸 왼쪽', role: 'body' }, moveRight: { name: '몸 오른쪽', role: 'body' } };
  const PRESS = { cancel: { name: '취소', role: 'neutral' } }; // 한 번 누르는 동작 가운데 차트에 줄로 나오는 것
  return { name, role, LIMB, HOLD, PRESS, roleOf: id => role[id] || 'neutral' };
})();
if (typeof module !== 'undefined') module.exports = ACT;
