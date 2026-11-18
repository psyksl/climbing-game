// 모은 힘 전달 시험: 기본 조작(D안)에서 짧게·중간·길게 모은 힘이 (1) 조작층에서 정한 배율로 계산되고 (2) 물리 계산(PH.step)이 실제로 그 값을 받고
// (3) 이륙 속도가 그 순서대로 커지는지 확인한다. v0.6.1까지 배율 대입이 주석 안에 들어가 물리에 전달되지 않았던 오류를 다시 막기 위한 시험.
'use strict';
const PH = require('../src/physics.js'), CTRL = require('../src/controls.js'), { run } = require('./intent.js');
const P = CTRL.P, expected = hold => { const p = Math.max(0.15, Math.min(1, (hold - 0.04) / P.FULL_CHARGE)); return P.GAIN0 + (1 - P.GAIN0) * p; };
const expectedPt = pt => P.GAIN0 + (1 - P.GAIN0) * Math.max(0.15, Math.min(1, (pt - 0.04) / P.FULL_CHARGE)); // 실제로 모은 시간 기준
const realStep = PH.step;
function trial(hold) {
  const seen = []; let v = null, frames = 0, chargeT = null;
  PH.step = (s, inp, dt) => { if (inp.power && inp.gain !== undefined) seen.push(inp.gain); return realStep(s, inp, dt); }; // 물리가 받은 값을 엿본다
  try {
    run(3, a => { a.io.mx = 545; a.io.my = 348; const t = a.s.t - 0.4, on = t >= 0 && t < hold; a.space(on); if (a.ctl.st.phase === 'charge') chargeT = a.ctl.st.pt; if (!a.m.k && t >= 0.04) { a.click(0); a.click(1); a.m.k = 1; }
      const s = a.s; if (v === null && t > 0 && !s.limb.some(l => l.mode === 'plant' || l.mode === 'grip')) v = Math.hypot(s.p[1].vx, s.p[1].vy) / 107; }, 2.5, {});
  } finally { PH.step = realStep; }
  const got = seen.length ? Math.max(...seen) : null;
  return { hold, exp: expected(hold), expActual: chargeT === null ? null : expectedPt(chargeT), chargeT, got, v };
}
module.exports = { trial };
if (require.main === module) {
  let fail = 0; const check = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`); if (!c) fail++; };
  const r = [0.15, 0.35, 0.7].map(trial), names = ['짧게', '중간', '길게'];
  r.forEach((x, k) => {
    check(`${names[k]}(${x.hold}초): 물리가 받은 배율 = 실제로 모은 시간(${x.chargeT.toFixed(3)}초)으로 정한 배율`, x.got !== null && Math.abs(x.got - x.expActual) < 1e-9, `정한 ${x.expActual.toFixed(3)} · 받은 ${x.got === null ? '없음' : x.got.toFixed(3)} · 이륙 ${x.v ? x.v.toFixed(2) : '-'}m/s`);
    check(`${names[k]}: 명목 시간 기준 배율과 1프레임(약 0.012) 이내`, Math.abs(x.got - x.exp) <= 0.0125, `명목 ${x.exp.toFixed(3)}`);
  });
  check('배율이 짧게 < 중간 < 길게', r[0].got < r[1].got && r[1].got < r[2].got);
  check('이륙 속도가 짧게 < 중간 < 길게', r[0].v < r[1].v && r[1].v < r[2].v, r.map(x => x.v.toFixed(2)).join(' < '));
  process.exit(fail ? 1 : 0);
}
