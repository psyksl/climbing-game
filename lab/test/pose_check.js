// 자세 점검(v0.7.1): 사용자 지적 "A를 누르면 다리를 펴며 엉덩이를 왼쪽으로 빼고 살짝 들려야 한다", "다리가 꼬인다", "W로 올라서다 멈춘다"를 지킨다.
// 두 몸(기존·새 비율) 모두. 오차 없는 고정 입력. 사용: node test/pose_check.js
'use strict';
const PH = require('../src/physics.js'), { run } = require('./intent.js');
let fail = 0; const check = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`); if (!c) fail++; };
for (const body of ['base', 'prop']) { PH.setBody(body); const B = body === 'base' ? '기존' : '새 비율';
  // 1) 매달린 자세에서 A/D: 엉덩이가 그쪽으로 가고(5px 이상), 조금 들리며(0~60px), 발은 디딘 채, 발이 꼬이지 않는다
  for (const st of [1, 3]) for (const [key, sg] of [['moveLeft', -1], ['moveRight', 1]]) { let h0, crossed = false;
    const r = run(st, a => { const s = a.s; if (s.p[4].x > s.p[5].x + 4 && s.limb[2].mode === 'plant' && s.limb[3].mode === 'plant') crossed = true; if (s.t < 1) { h0 = [s.p[1].x, s.p[1].y]; return; } a.hold(key, s.t < 2); }, 2.3, {});
    const s = r.s, dx = s.p[1].x - h0[0], up = h0[1] - s.p[1].y;
    check(`${B} · 자세 ${st} · ${key === 'moveLeft' ? 'A' : 'D'}: 엉덩이가 ${sg < 0 ? '왼' : '오른'}쪽으로, 조금 들림, 두 발 디딘 채, 꼬임 없음`, sg * dx >= 5 && up >= 0 && up <= 60 && s.limb[2].mode === 'plant' && s.limb[3].mode === 'plant' && !crossed && !s.dead,
      `옆 ${Math.round(dx)}px · 위 ${Math.round(up)}px · 발 ${s.limb[2].mode}/${s.limb[3].mode}${crossed ? ' · 꼬임' : ''}`); }
  // 2) 건너편 턱에 두 손 → W 3초: 가슴이 턱 위로 40px 이상, 턱 위에 디딘 발 1개 이상
  { const r = run({ c: [490, 417], hands: [[480, 345], [500, 345]] }, a => { a.io.mx = 560; a.io.my = 220; a.hold('moveUp', a.s.t < 3); }, 5, {});
    const onB = [2, 3].filter(i => r.s.limb[i].mode === 'plant' && r.s.limb[i].poly === 'B').length;
    check(`${B} · W로 턱 위에 올라서기`, !r.s.dead && 345 - r.s.p[0].y >= 40 && onB >= 1, `가슴 턱 위 ${Math.round(345 - r.s.p[0].y)}px · 턱 위 발 ${onB}개`); }
  // 3) 시작 자세 1~5에서 3초: 두 발이 디뎌져 있으면 왼발이 오른발보다 오른쪽에 있지 않다
  for (const st of [1, 2, 3, 4, 5]) { let crossed = false; run(st, a => { const s = a.s; if (s.limb[2].mode === 'plant' && s.limb[3].mode === 'plant' && s.p[4].x > s.p[5].x + 4) crossed = true; }, 3, {});
    check(`${B} · 자세 ${st}: 자동 발이 꼬이지 않음`, !crossed); }
}
PH.setBody('base'); process.exit(fail ? 1 : 0);
