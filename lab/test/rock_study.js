// 반동 연구: 어떤 자세·입력에서 반동이 이득인가. "오래 힘준 효과"와 "반동 타이밍 효과"를 나눠 본다.
// 출발: 3번 자세(왼손·두 발로 버팀), 오른손을 먼저 건너편 턱 쪽으로 보내 둔다. 마지막 던지기에서 왼손을 놓는다.
// 지표: 건너편 턱을 오른쪽으로 옮겨 가며(10px 간격) 오른손이 잡을 수 있었던 가장 먼 거리. 잡기 보조는 턱 전체(겨냥 정확도 영향을 빼기 위해).
// 사람 오차 없는 고정 입력이다(어디서 이득이 생기는지 찾기 위한 것).
'use strict';
const PH = require('../src/physics.js'), CTRL = require('../src/controls.js'), { run } = require('./intent.js');
const DX = []; for (let d = 0; d <= 200; d += 10) DX.push(d);
const BT = s => { const pl = s.world.find(p => p.id === 'B'); return [pl.pts[0][0], pl.pts[0][1]]; };
// plan: 'none' (바로, hold초) | 'rock' (짧게 한 번 눌러 몸을 목표 쪽으로 흔든 뒤, 돌아오는 동안 모으고 뒤쪽 끝에서 돌아서는 순간 + off초에 뗀다)
function policy(plan, hold, off, rec, tbFix) {
  return a => { const [bx, by] = BT(a.s); a.io.mx = bx + 60; a.io.my = by + 3; const s = a.s, m = a.m, t = s.t - 0.5, vx = s.p[1].vx;
    if (!m.r) { m.r = 1; a.click(1); m.spT = 0; m.st = 'wait'; }
    const sp = v => { if (v) m.spT += 1 / 120; a.space(v); };
    if (t < 0) return;
    if (plan === 'none') { const on = t < hold; sp(on); if (on && !m.k && t >= 0.09) { a.click(0); m.k = 1; } if (!on && !m.rel) { m.rel = 1; rec.pose = s.p[1].x; rec.v = s.p[1].vx; } return; }
    if (m.st === 'wait') { m.st = 'tap'; m.ts = t; }
    if (m.st === 'tap') { sp(t - m.ts < 0.15); if (t - m.ts >= 0.15) m.st = 'fwd'; return; }
    if (m.st === 'fwd') { sp(false); if (vx < 5) { m.st = 'charge'; m.ts = t; } return; }               // 앞쪽 끝: 모으기 시작
    if (m.st === 'charge') { sp(true); if (!m.k && t - m.ts >= 0.09) { a.click(0); m.k = 1; }
      if (m.tb === undefined && t - m.ts > 0.12 && vx > -5) { m.tb = t; rec.tb = t; }                    // 뒤쪽 끝에서 돌아서는 순간
      if (tbFix !== undefined) m.tb = tbFix;                                                              // 두 번째 실행: 미리 잰 시각 기준(돌아서기 전에 떼는 경우)
      if (m.tb !== undefined && t >= m.tb + off && m.k) { sp(false); m.st = 'done'; rec.pose = s.p[1].x; rec.v = s.p[1].vx; rec.charge = t - m.ts; } return; }
    sp(false);
  };
}
function farthest(plan, hold, off) {
  let best = -1; const rec = {}; let tbFix;
  if (plan === 'rock') { const pre = {}; run(3, policy('rock', 0, 9, pre), 2.5, { assistRange: 'ledge' }, 0); tbFix = pre.tb; } // 돌아서는 시각을 먼저 잰다(입력이 같으면 물리는 똑같이 흐른다)
  for (const dx of DX) { const r = run(3, policy(plan, hold, off, rec, tbFix), 5, { assistRange: 'ledge' }, dx);
    if (!r.s.dead && r.s.limb[1].mode === 'grip' && r.s.limb[1].anchor.poly === 'B') best = dx; rec.spT = r.m.spT; }
  return { best, rec };
}
module.exports = { farthest };
if (require.main === module) {
  console.log('조건'.padEnd(46), '닿은 가장 먼 거리', ' 힘준 총시간', ' 뗄 때 엉덩이 x·속도');
  const show = (n, r) => console.log(n.padEnd(46), String(r.best).padStart(6) + 'px', ('  ' + (r.rec.spT ?? 0).toFixed(2) + '초').padStart(10), `   x ${Math.round(r.rec.pose)} · vx ${Math.round(r.rec.v)}`);
  const base = {};
  for (const h of [0.2, 0.35, 0.5, 0.8, 1.2]) { base[h] = farthest('none', h, 0); show(`반동 없이 · ${h}초 누르고 뗌`, base[h]); }
  const rocks = [];
  for (const off of [-0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4]) { const r = farthest('rock', 0, off); rocks.push([off, r]);
    const same = farthest('none', r.rec.spT, 0);
    show(`반동 1번 · 뒤쪽 끝 ${off >= 0 ? '+' : ''}${off}초에 뗌`, r); show(`   ㄴ 같은 총시간 ${r.rec.spT.toFixed(2)}초, 반동 없이`, same); }
}
