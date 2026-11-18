// 반동 연구: 어떤 자세·입력에서 반동이 이득인가. "오래 힘준 효과"와 "반동 타이밍 효과"를 나눠 본다.
// 출발: 3번 자세(왼손·두 발로 버팀), 오른손을 먼저 건너편 턱 쪽으로 보내 둔다. 마지막 던지기에서 왼손을 놓는다.
// 지표: 건너편 턱을 오른쪽으로 옮겨 가며(10px 간격) 오른손이 잡을 수 있었던 가장 먼 거리. 잡기 보조는 턱 전체(겨냥 정확도 영향을 빼기 위해).
// 사람 오차 없는 고정 입력이다(어디서 이득이 생기는지 찾기 위한 것).
'use strict';
const PH = require('../src/physics.js'), CTRL = require('../src/controls.js'), { run } = require('./intent.js');
const DX = []; for (let d = 0; d <= 200; d += 10) DX.push(d);
const BT = s => { const pl = s.world.find(p => p.id === 'B'); return [pl.pts[0][0], pl.pts[0][1]]; };
// 이륙 기록: 손을 뗀(Space를 뗀) 뒤 붙은 손발이 하나도 없게 된 첫 순간의 엉덩이 위치·속도(수평·수직)와 그때까지 걸린 시간
function noteTakeoff(s, m, rec) {
  if (m.relT === undefined || rec.off) return;
  if (!s.limb.some(l => l.mode === 'grip' || l.mode === 'plant')) { const h = s.p[1]; rec.off = { dt: s.t - m.relT, x: h.x, y: h.y, vx: h.vx, vy: h.vy }; }
}
// plan: 'none' (바로, hold초) | 'rock' (짧게 한 번 눌러 몸을 목표 쪽으로 흔든 뒤, 돌아오는 동안 모으고 뒤쪽 끝에서 돌아서는 순간 + off초에 뗀다)
// rec: 시도 하나의 기록(시도마다 새로 만든다). pose·v = 뗄 때 엉덩이 x·수평 속도, spT = 힘준 총시간, off = 이륙 기록
function policy(plan, hold, off, rec, tbFix) {
  return a => { const [bx, by] = BT(a.s); a.io.mx = bx + 60; a.io.my = by + 3; const s = a.s, m = a.m, t = s.t - 0.5, vx = s.p[1].vx;
    if (!m.r) { m.r = 1; a.click(1); m.spT = 0; m.st = 'wait'; }
    const sp = v => { if (v) m.spT += 1 / 120; a.space(v); };
    noteTakeoff(s, m, rec);
    if (t < 0) return;
    const release = () => { m.relT = s.t; rec.pose = s.p[1].x; rec.poseY = s.p[1].y; rec.v = s.p[1].vx; rec.vy = s.p[1].vy; };
    if (plan === 'none') { const on = t < hold; sp(on); if (on && !m.k && t >= 0.09) { a.click(0); m.k = 1; } if (!on && !m.rel) { m.rel = 1; release(); } return; }
    if (m.st === 'wait') { m.st = 'tap'; m.ts = t; }
    if (m.st === 'tap') { sp(t - m.ts < 0.15); if (t - m.ts >= 0.15) m.st = 'fwd'; return; }
    if (m.st === 'fwd') { sp(false); if (vx < 5) { m.st = 'charge'; m.ts = t; } return; }               // 앞쪽 끝: 모으기 시작
    if (m.st === 'charge') { sp(true); if (!m.k && t - m.ts >= 0.09) { a.click(0); m.k = 1; }
      if (m.tb === undefined && t - m.ts > 0.12 && vx > -5) { m.tb = t; rec.tb = t; }                    // 뒤쪽 끝에서 돌아서는 순간
      if (tbFix !== undefined) m.tb = tbFix;                                                              // 두 번째 실행: 미리 잰 시각 기준(돌아서기 전에 떼는 경우)
      if (m.tb !== undefined && t >= m.tb + off && m.k) { sp(false); m.st = 'done'; release(); rec.charge = t - m.ts; } return; }
    sp(false);
  };
}
// 거리마다 시도 기록을 따로 남기고, 가장 먼 성공 거리에는 그 시도의 기록을 붙인다(v0.6.3까지는 마지막으로 시험한 거리의 기록이 붙었다)
function farthest(plan, hold, off) {
  let best = -1, bestRec = null; const tries = []; let tbFix;
  if (plan === 'rock') { const pre = {}; run(3, policy('rock', 0, 9, pre), 2.5, { assistRange: 'ledge' }, 0); tbFix = pre.tb; } // 돌아서는 시각을 먼저 잰다(입력이 같으면 물리는 똑같이 흐른다)
  for (const dx of DX) { const rec = { dx }; const r = run(3, policy(plan, hold, off, rec, tbFix), 5, { assistRange: 'ledge' }, dx);
    rec.spT = r.m.spT; rec.ok = !r.s.dead && r.s.limb[1].mode === 'grip' && r.s.limb[1].anchor.poly === 'B'; tries.push(rec);
    if (rec.ok) { best = dx; bestRec = rec; } }
  return { best, rec: bestRec || tries[0], tries };
}
module.exports = { farthest };
if (require.main === module) {
  const M = 107, f2 = v => (v / M).toFixed(2);
  console.log('조건'.padEnd(40), '가장 먼 성공', '힘준 총시간', '뗄 때 엉덩이 x·vx', '  이륙: 뗀 뒤 · 엉덩이 x,y · 수평·수직 속도(m/s)');
  console.log('  (가장 먼 성공 거리 시도의 기록. 성공이 없으면 0px 시도의 기록)');
  const show = (n, r) => { const c = r.rec, o = c.off;
    console.log(n.padEnd(40), String(r.best).padStart(6) + 'px', ((c.spT ?? 0).toFixed(2) + '초').padStart(10), `   x ${Math.round(c.pose)} · vx ${Math.round(c.v)}`.padEnd(20),
      o ? `   ${o.dt.toFixed(3)}초 · ${Math.round(o.x)},${Math.round(o.y)} · ${f2(o.vx)}, ${f2(-o.vy)}` : '   이륙 없음'); };
  const base = {};
  for (const h of [0.2, 0.35, 0.5, 0.8, 1.2]) { base[h] = farthest('none', h, 0); show(`반동 없이 · ${h}초 누르고 뗌`, base[h]); }
  for (const off of [-0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4]) { const r = farthest('rock', 0, off);
    const same = farthest('none', r.rec.spT, 0);
    show(`반동 1번 · 뒤쪽 끝 ${off >= 0 ? '+' : ''}${off}초에 뗌`, r); show(`   ㄴ 같은 총시간 ${r.rec.spT.toFixed(2)}초, 반동 없이`, same); }
}
