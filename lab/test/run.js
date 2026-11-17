// 자동 시험: 물리 계산부만으로 각 방법을 끝까지 돌려 본다. 화면·재미와는 무관한 "성립 여부" 검사다.
'use strict';
const PH = require('../src/physics.js'), BOTS = require('../src/bots.js');
const dt = 1 / 120;
function play(name, over, T = 14) {
  const s = PH.create(PH.makeWorld(), BOTS.defs[name].station), b = BOTS.make(name, over), log = [];
  let stableT = 0;
  while (s.t < T && !s.dead) {
    PH.step(s, b.step(s), dt);
    for (const e of s.events) log.push(`${s.t.toFixed(2)} ${e.type}${e.limb ?? ''}${e.poly ? '@' + e.poly : ''}`);
    if (b.m.done) { stableT += dt; if (stableT > 2.5) break; }
  }
  const sp = Math.max(...s.p.map(q => Math.hypot(q.vx, q.vy)));
  const onB = [0, 1].filter(i => s.limb[i].mode === 'grip' && s.limb[i].anchor.poly === 'B').length;
  return { ok: BOTS.defs[name].win ? s.won : !s.dead && !!b.m.done && onB === 2 && s.limb[3].mode === 'plant' && sp < 80, s, b, log, sp, onB };
}
module.exports = { play };
if (require.main === module) {
  let fail = 0;
  const check = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name} ${extra}`); if (!cond) fail++; };
  // 1) 가만히 두면 가만히 있다
  for (const st of [1, 2, 3, 4]) { const s = PH.create(PH.makeWorld(), st); for (let i = 0; i < 360; i++) PH.step(s, BOTS.idle(), dt); check(`정지 유지: ${PH.STATIONS[st].name}`, !s.dead && Math.max(...s.p.map(q => Math.hypot(q.vx, q.vy))) < 5); }
  // 2) 한 손 매달려 다리만으로 흔들기: 진폭이 커진다
  { const s = PH.create(PH.makeWorld(), 2), b = BOTS.make('swing', { amp: 999 }); let a1 = 0, a2 = 0;
    while (s.t < 6) { PH.step(s, b.step(s), dt); const c = s.p[0], a = s.limb[1].anchor; if (!a) break; const phi = Math.abs(Math.atan2(c.x - a.x, c.y - a.y)) * 57.3; if (s.t < 1.5) a1 = Math.max(a1, phi); else a2 = Math.max(a2, phi); }
    check('한 손 매달려 흔들기(다리 반동)', a2 > a1 + 20 && a2 > 45, `처음 ${a1.toFixed(0)}° → 최대 ${a2.toFixed(0)}°`); }
  // 3) 공중에서는 입력이 있어도 운동량·각운동량이 보존된다(끌어 주는 힘 없음)
  { const s = PH.create(PH.makeWorld(), 2); for (let i = 0; i < 20; i++) PH.step(s, BOTS.idle(), dt);
    const inp = BOTS.idle(); inp.hand = [true, true]; inp.foot = [true, true]; let d0 = null, worst = 0, worstP = 0;
    for (let i = 0; i < 40; i++) { inp.cx = s.p[1].x + (i < 20 ? 80 : -80); inp.cy = s.p[1].y + 30; PH.step(s, inp, dt); const g = PH.diag(s); if (i === 2) d0 = g; if (d0) { worst = Math.max(worst, Math.abs(g.L - d0.L)); worstP = Math.max(worstP, Math.abs(g.px - d0.px)); } }
    check('공중에서 수평 운동량 보존', worstP < 50, `오차 ${worstP.toFixed(1)}`);
    console.log(`INFO  공중 각운동량 변화 ${worst.toFixed(0)} (손을 뻗는 힘은 작게 남는 오차로 허용)`); }
  // 4) 세 가지 방법 + 실패 예
  for (const name of Object.keys(BOTS.defs)) {
    const r = play(name), def = BOTS.defs[name];
    check(def.title, def.expectFail ? r.s.dead : r.ok, def.expectFail ? '(실패해야 정상)' : `t=${r.s.t.toFixed(1)}s`);
    if (process.argv.includes('-v') || (!def.expectFail && !r.ok)) console.log('   ', r.log.join(', '));
  }
  process.exit(fail ? 1 : 0);
}
