// 이륙 기록: 두 손 다이노(3번 자세, 기본 조작)에서 모은 시간마다 뗄 때 자세, 손·발이 떨어진 시점, 이륙 위치와 수평·수직 속도를 나란히 본다.
// 모은 시간이 준비 자세(웅크림 깊이, 근육 활성도)도 바꾸므로, 총 이륙 속도 하나로는 세기 곡선을 판단하기 어렵다(GPT 검토, v0.6.3).
// 사람 오차 없는 고정 입력. 사용: node test/takeoff_study.js
'use strict';
const PH = require('../src/physics.js'), { run } = require('./intent.js');
const M = 107; // px = 1m
function trial(hold) {
  const r = { hold };
  run(3, a => { a.io.mx = 545; a.io.my = 348; const s = a.s, st = a.ctl.st, t = s.t - 0.4, on = t >= 0 && t < hold, h = s.p[1];
    a.space(on); if (!a.m.k && t >= 0.04) { a.click(0); a.click(1); a.m.k = 1; }
    if (st.phase === 'charge') { r.pt = st.pt; r.act = s.act; }
    if (t >= 0 && !on && r.relT === undefined) { r.relT = s.t; r.relX = h.x; r.relY = h.y; }
    if (r.relT !== undefined && r.gain === undefined && st.lastGain !== undefined) r.gain = st.lastGain; // 배율은 던지기가 시작된 프레임에 정해진다
    if (r.relT === undefined) return;
    const g = i => s.limb[i].mode === 'grip' || s.limb[i].mode === 'plant';
    if (r.handT === undefined && !g(0) && !g(1)) r.handT = s.t - r.relT;
    if (r.footT === undefined && !g(2) && !g(3)) r.footT = s.t - r.relT;
    if (r.off === undefined && ![0, 1, 2, 3].some(g)) r.off = { x: h.x, y: h.y, vx: h.vx / M, vy: -h.vy / M, v: Math.hypot(h.vx, h.vy) / M };
  }, 2.5, {});
  return r;
}
module.exports = { trial };
if (require.main === module) {
  const f = (v, d = 2) => v === undefined ? '-' : v.toFixed(d);
  console.log('모은 시간 | 실제 | 활성도 | 배율 | 뗄 때 엉덩이 x,y | 손 떨어짐 | 발 떨어짐(=이륙) | 이륙 엉덩이 x,y | 수평 | 수직 | 합 (m/s)');
  for (const hold of [0.08, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7]) { const r = trial(hold), o = r.off || {};
    console.log(`${f(hold)}초 | ${f(r.pt, 3)} | ${f(r.act)} | ${f(r.gain, 3)} | ${Math.round(r.relX)},${Math.round(r.relY)} | +${f(r.handT, 3)}초 | +${f(r.footT, 3)}초 | ${Math.round(o.x)},${Math.round(o.y)} | ${f(o.vx)} | ${f(o.vy)} | ${f(o.v)}`); }
}
