// 2단계 ②③: 모으는 동안 A/D로 몸을 흔들다가 제때 떼면 이득인가. "오래 힘준 효과"와 "흔들기 타이밍 효과"를 나눠 본다.
// 출발: 3번 자세, 오른손을 먼저 건너편 턱 쪽으로 보내 두고 왼손·두 발로 버틴다. Space를 누른 채 왼손을 놓을 손으로 지정한다.
// 흔들기: Space를 누르고 0.05초 뒤 A(목표 반대쪽)를 tA초 → D(목표 쪽). 엉덩이가 돌아서 목표 쪽으로 움직이기 시작한 순간 + off초에 Space를 뗀다.
// 지표: 건너편 턱을 10px씩 옮기며 오른손이 잡은 가장 먼 거리, 그 시도의 뗄 때 엉덩이 속도와 이륙 위치·속도. 잡기 보조 턱 전체, 오차 없는 고정 입력.
// 사용: node test/sway_study.js [base|prop|joint] [noload]   (noload = 모을 때 자동 싣기 끔: Space는 아래로만, 좌우는 A/D)
'use strict';
const PH = require('../src/physics.js'), { run } = require('./intent.js');
const DX = []; for (let d = 0; d <= 240; d += 10) DX.push(d);
let OPT = { assistRange: 'ledge' }; // setOpt로 자동 싣기 켬·끔을 바꿔 잰다
const BT = s => { const pl = s.world.find(p => p.id === 'B'); return [pl.pts[0][0], pl.pts[0][1]]; };
const M = 107;
function policy(plan, o, rec) { // plan: 'none' {hold} | 'sway' {tA, off}
  return a => { const [bx, by] = BT(a.s); a.io.mx = bx + 60; a.io.my = by + 3; const s = a.s, m = a.m, h = s.p[1];
    if (!m.r) { m.r = 1; a.click(1); m.st = 'wait'; }
    if (m.relT !== undefined && !rec.off && !s.limb.some(l => l.mode === 'grip' || l.mode === 'plant')) rec.off = { dt: s.t - m.relT, x: h.x, y: h.y, vx: h.vx / M, vy: -h.vy / M };
    if (m.st === 'wait') { if (s.t < 0.5 || Math.abs(h.vx) > 8) return; m.st = 'go'; m.t0 = s.t; }
    const t = s.t - (m.t0 ?? s.t), release = () => { a.space(false); a.hold('moveLeft', false); a.hold('moveRight', false); m.st = 'done'; m.relT = s.t; rec.hold = t; rec.relVx = h.vx; rec.relX = h.x; };
    if (m.st === 'done') { a.space(false); return; }
    a.space(true); if (!m.k && t >= 0.09) { a.click(0); m.k = 1; }
    if (plan === 'none') { if (t >= o.hold) release(); return; }
    if (t < 0.05) return; // Space를 먼저 누르고(웅크림 시작), 이어서 A
    if (t < 0.05 + o.tA) { a.hold('moveLeft', true); return; }
    a.hold('moveLeft', false); a.hold('moveRight', true);
    if (m.turn === undefined && h.vx > 5) m.turn = t;                         // 돌아서서 목표 쪽으로 움직이기 시작한 순간
    if (o.fixT !== undefined) m.turn = o.fixT;                                 // 돌아서기 전에 떼는 경우: 미리 잰 시각 기준
    if (m.turn !== undefined && t >= m.turn + o.off && m.k) release();
    if (t > 3) release();
  };
}
function farthest(plan, o) {
  let best = -1, bestRec = null; const first = {};
  for (const dx of DX) { const rec = {}; const r = run(3, policy(plan, o, rec), 5, OPT, dx);
    if (dx === 0) Object.assign(first, rec);
    if (!r.s.dead && r.s.limb[1].mode === 'grip' && r.s.limb[1].anchor.poly === 'B') { best = dx; bestRec = rec; } }
  return { best, rec: bestRec || first };
}
module.exports = { farthest, setOpt: o => { OPT = { assistRange: 'ledge', ...o }; } };
if (require.main === module) {
  PH.setBody(PH.BODIES[process.argv[2]] ? process.argv[2] : 'base'); const load = process.argv[3] !== 'noload'; OPT = { assistRange: 'ledge', autoLoad: load };
  console.log(`몸: ${PH.BODIES[PH.getBody()].name} · 모을 때 자동 싣기 ${load ? '켬' : '끔'}`);
  const f = v => v === undefined ? '-' : v.toFixed(2);
  const show = (n, r) => { const c = r.rec, o = c.off; console.log(n.padEnd(36), String(r.best).padStart(5) + 'px', `  힘준 ${f(c.hold)}초`, `  뗄 때 엉덩이 vx ${c.relVx === undefined ? '-' : Math.round(c.relVx)}px/s`, o ? `  이륙 ${Math.round(o.x)},${Math.round(o.y)} · ${f(o.vx)}, ${f(o.vy)}m/s` : '  이륙 없음'); };
  const tA = 0.35, pre = {}; run(3, policy('sway', { tA, off: 9 }, pre), 4, OPT, 0); // 돌아서는 시각을 먼저 잰다
  const turnT = (() => { let tt; run(3, (p => a => { p(a); if (tt === undefined && a.m.turn !== undefined) tt = a.m.turn; })(policy('sway', { tA, off: 9 }, {})), 4, OPT, 0); return tt; })();
  console.log(`A ${tA}초 → D, 돌아서는 시각: Space 누르고 ${f(turnT)}초`);
  for (const off of [-0.15, -0.05, 0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.45]) {
    const r = farthest('sway', off < 0 ? { tA, off: 0, fixT: turnT + off } : { tA, off });
    show(`흔들기 · 돌아서고 ${off >= 0 ? '+' : ''}${off}초에 뗌`, r);
    show(`   ㄴ 같은 시간 ${f(r.rec.hold)}초, 흔들기 없이`, farthest('none', { hold: r.rec.hold }));
  }
}
