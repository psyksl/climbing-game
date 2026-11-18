// 연습 과제의 시범 입력이 실제로 성공하는지 확인한다(관절 몸, 게임과 같은 설정). 사용: node test/lessons_check.js [-v]
'use strict';
const PH = require('../src/physics.js'), CTRL = require('../src/controls.js'), LESSON = require('../src/lessons.js');
const dt = 1 / 120, V = process.argv.includes('-v');
function play(lesson, steps) { // 게임과 같은 순서: 조작층에 재생 입력을 넣고 물리를 한 걸음 계산한다
  PH.setBody('joint'); Object.assign(CTRL.OPT, { autoFeet: true, autoShift: true, assist: true, handMode: 1, assistRange: 'near', autoLoad: false });
  const world = PH.makeWorld(); for (const r of lesson.extra || []) world.push(PH.rect(...r));
  const s = PH.create(world, lesson.station), ctl = CTRL.make('intent'), pl = LESSON.player(steps ? { ...lesson, steps } : lesson), mem = {}; let doneT = null;
  while (s.t < lesson.T && !s.dead) { const io = pl.step(s.t); PH.step(s, ctl.step(s, io, dt), dt); if (doneT === null && lesson.done(s, mem)) doneT = s.t; }
  return { ok: doneT !== null && !s.dead, doneT, s };
}
module.exports = { play };
if (require.main === module) {
  let fail = 0;
  for (const l of LESSON.LIST) { const r = play(l); console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${l.name} ${r.ok ? `(${r.doneT.toFixed(2)}초에 성공)` : r.s.dead ? '떨어짐' : '성공 조건에 이르지 못함'}`); if (!r.ok) fail++; }
  PH.setBody('base'); process.exit(fail ? 1 : 0);
}
