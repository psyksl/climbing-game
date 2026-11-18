// 연습 과제의 시범 입력이 실제로 성공하는지, 그리고 입력 기록을 다시 재생하면 같은 결과가 나오는지 확인한다(관절 몸, 시범 기준 설정). 사용: node test/lessons_check.js
'use strict';
const PH = require('../src/physics.js'), CTRL = require('../src/controls.js'), LESSON = require('../src/lessons.js');
const dt = 1 / 120;
// 게임과 같은 순서: 조작층에 재생 입력을 넣고 물리를 한 걸음 계산한다. opt로 플레이어 쪽 보조 설정을 바꿔 볼 수 있다(기본은 시범 기준 설정)
function play(lesson, steps, opt) {
  PH.setBody(LESSON.BASE.body); Object.assign(CTRL.OPT, LESSON.BASE.opt, opt || {});
  const world = PH.makeWorld(); for (const r of lesson.extra || []) world.push(PH.rect(...r));
  const s = PH.create(world, lesson.station), ctl = CTRL.make('intent'), pl = LESSON.player(steps ? { ...lesson, steps } : lesson), mem = {}, rec = LESSON.recorder(); let doneT = null;
  while (s.t < lesson.T && !s.dead) { const io = pl.step(s.t), out = ctl.step(s, io, dt); rec.tick(s.t, io, ctl.st.sent, CTRL.OPT); PH.step(s, out, dt); if (doneT === null && lesson.done(s, mem)) doneT = s.t; }
  Object.assign(CTRL.OPT, LESSON.BASE.opt);
  return { ok: doneT !== null && !s.dead, doneT, s, rec };
}
const same = (a, b) => Math.max(...a.s.p.map((q, i) => Math.hypot(q.x - b.s.p[i].x, q.y - b.s.p[i].y)));
module.exports = { play };
if (require.main === module) {
  let fail = 0; const check = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`); if (!c) fail++; };
  check('시범을 찾은 물리 판과 지금 물리 판이 같다(다르면 시범을 다시 확인하고 LESSON.PHYS를 맞춘다)', PH.VERSION === LESSON.PHYS, `물리 ${PH.VERSION} · 시범 ${LESSON.PHYS} · 과제 묶음 ${LESSON.VERSION}판`);
  for (const l of LESSON.LIST) {
    const r = play(l); check(l.name, r.ok, r.ok ? `(${r.doneT.toFixed(2)}초에 성공)` : r.s.dead ? '떨어짐' : '성공 조건에 이르지 못함');
    // 기록(조준점이 바뀐 걸음 + 누름·뗌) → 재생 입력 → 다시 계산: 손발 위치가 완전히 같아야 한다
    const r2 = play(l, LESSON.toSteps(r.rec)), d = same(r, r2);
    check(`  기록을 다시 재생하면 같은 결과 (${l.id})`, r2.ok === r.ok && r2.doneT === r.doneT && d < 1e-9, `조준 ${r.rec.aim.length}개 · 입력 ${r.rec.ev.length}개 · 끝 자세 차이 ${d.toExponential(1)}px`);
  }
  // 발을 직접 보내는 입력(Shift + 손 입력)과 취소도 기록·재생된다
  const foot = { station: 1, T: 2.5, done: () => false, steps: [[0.2, 'aim', 340, 470], [0.5, 'press', 'sendL'], [0.5, 'pressShift', 'sendL'], [1.2, 'aim', 250, 300], [1.4, 'press', 'sendR'], [1.5, 'press', 'cancel'], [1.7, 'down', 'foot'], [1.8, 'press', 'sendR'], [2.0, 'up', 'foot']] };
  const f1 = play(foot), f2 = play(foot, LESSON.toSteps(f1.rec)), kinds = new Set(f1.rec.ev.map(e => e[1] + ':' + e[2]));
  check('  발 직접 보내기·취소도 기록되어 같은 결과로 재생된다', same(f1, f2) < 1e-9 && kinds.has('pressShift:sendL') && kinds.has('press:cancel') && kinds.has('down:foot') && f1.rec.taps.some(t => t.limb >= 2), `끝 자세 차이 ${same(f1, f2).toExponential(1)}px · 보낸 손발 ${f1.rec.taps.map(t => t.limb).join(',')}`);
  // 플레이어 쪽 보조 설정이 기준과 다르면 같은 입력이라도 결과가 달라질 수 있다(그래서 과제에 들어올 때 기준에 맞추고, 시범·유령은 따로 기준 설정으로 계산한다)
  const off = LESSON.LIST.map(l => play(l, null, { autoFeet: false }).ok ? 'O' : '.').join(' ');
  console.log(`참고  자동 발을 끄고 같은 시범 입력을 넣으면: ${off} (O = 성공)`);
  PH.setBody('base'); process.exit(fail ? 1 : 0);
}
