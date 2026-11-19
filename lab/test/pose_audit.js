// 자세 점검(v0.15.0): 여러 조작을 돌리며 "사람이 하기 어려운 자세"가 얼마나 나오는지 숫자로 잰다. 오차 없는 고정 입력(사람 결과 아님). 사용: node test/pose_audit.js [src 폴더]
//  곧은 다리 벌림: 디딘 다리가 거의 펴진 채(무릎 굽힘 15° 미만) 몸통 아래 방향에서 옆으로 벌어진 최대 각도. 사람은 선 자세에서 45~60°쯤이 한계다(옆으로 다리 찢기는 그 이상)
//  58° 넘은 시간: 거의 편 다리(굽힘 20° 미만)가 58° 넘게 벌어진 채 디디고 있던 시간
//  몸통 기울기: 몸통(엉덩이→가슴)이 곧추선 방향에서 기운 최대 각도
//  팔 교차: 두 손이 붙은 채 왼손이 오른손보다 16px 넘게 오른쪽에 있던 시간(초)
'use strict';
const path = require('path'), LAB = (process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..', 'src')) + '/';
global.PH = require(LAB + 'physics.js'); global.CTRL = require(LAB + 'controls.js'); const LESSON = require(LAB + 'lessons.js');
const PH = global.PH, CTRL = global.CTRL, C = PH.C; PH.setBody('joint'); Object.assign(CTRL.OPT, LESSON.BASE.opt);
const hold = (id, a, b) => [[a, 'down', id], [b, 'up', id]];
function run(name, st, steps, T, extra) {
  const world = PH.makeWorld(); for (const r of extra || []) world.push(PH.rect(...r)); const s = PH.create(world, st), ctl = CTRL.make('intent'), pl = LESSON.player({ steps: steps.slice().sort((a, b) => a[0] - b[0]) });
  const m = { split: 0, splitT: 0, tilt: 0, cross: 0, hipOver: 0, wide: 0 };
  while (s.t < T && !s.dead) { PH.step(s, ctl.step(s, pl.step(s.t), 1 / 120), 1 / 120); const c = s.p[0], hp = s.p[1], ax = (c.x - hp.x) / C.T, ay = (c.y - hp.y) / C.T;
    m.tilt = Math.max(m.tilt, Math.abs(Math.atan2(c.x - hp.x, hp.y - c.y)) * 57.3);
    for (const i of [2, 3]) { const lb = s.limb[i]; if (lb.mode !== 'plant') continue; const hj = PH.rootPos(s, i), e = s.p[2 + i], h = PH.hipAngle(ax, ay, lb, e.x - hj.x, e.y - hj.y);
      if (h.bend < 15 && Math.abs(h.line) > m.split) { m.split = Math.abs(h.line); m.splitT = s.t; } if (h.bend < 20 && Math.abs(h.line) > 58) m.wide += 1 / 120; if (Math.hypot(hp.vx, hp.vy) < 150) m.hipOver = Math.max(m.hipOver, h.over); }
    if (s.limb[0].mode === 'grip' && s.limb[1].mode === 'grip' && s.p[2].x > s.p[3].x + 16) m.cross += 1 / 120; }
  console.log(`${name.padEnd(34)} 곧은 다리 벌림 ${m.split.toFixed(0).padStart(3)}°(58° 넘은 시간 ${m.wide.toFixed(2)}초) · 고관절 초과 ${Math.max(0, m.hipOver).toFixed(0)}° · 몸통 기울기 ${m.tilt.toFixed(0)}° · 팔 교차 ${m.cross.toFixed(1)}초${s.dead ? ' · 떨어짐' : ''}`); return m;
}
const out = [];
for (const l of LESSON.LIST) out.push(run(`시범: ${l.name}`, l.station, l.steps, l.T, l.extra));
out.push(run('발판 위에서 D 2초(오른쪽으로)', 3, hold('moveRight', 0.3, 2.3), 3));
out.push(run('발판 위에서 A 2초(왼쪽으로)', 3, hold('moveLeft', 0.3, 2.3), 3));
out.push(run('발판 위에서 W 2초', 3, hold('moveUp', 0.3, 2.3), 3));
out.push(run('발판 위에서 S 1초 → W+D 2초', 3, [...hold('moveDown', 0.3, 1.3), ...hold('moveUp', 1.4, 3.4), ...hold('moveRight', 1.4, 3.4)], 4));
out.push(run('발판 위: 오른손을 저그로 보내고 D 2초', 3, [[0.2, 'aim', 415, 350], [0.4, 'press', 'sendR'], ...hold('moveRight', 1.6, 3.6)], 4.5));
out.push(run('발판 위: 오른손 저그, D 4초(오래)', 3, [[0.2, 'aim', 415, 350], [0.4, 'press', 'sendR'], ...hold('moveRight', 1.6, 5.6)], 6.5));
out.push(run('건너편 턱 한 손: 오른손을 바위로, D 2초', { name: 'u', c: [612, 417], hands: [[612, 345], null] }, [[0.2, 'aim', 690, 380], [0.5, 'press', 'sendR'], ...hold('moveRight', 2.5, 4.5)], 5.5));
const worst = Math.max(...out.map(m => m.split));
console.log(`\n가장 크게 벌어진 곧은 다리: ${worst.toFixed(0)}°`);
