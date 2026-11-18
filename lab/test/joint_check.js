// 3단계 관절 몸 점검: 다섯 동작(매달리기·좌우 체중 이동·손 교차·도약 후 한 손 잡기·팔 힘으로 허리까지 올라가기)을 돌리며
// 관절 뒤집힘·과도한 늘어남·관통을 센다. 오차 없는 고정 입력(사람 결과 아님). 사용: node test/joint_check.js [-v]
'use strict';
const PH = require('../src/physics.js'), { run } = require('./intent.js');
const V = process.argv.includes('-v'), C = PH.C;
let fail = 0; const check = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`); if (!c) fail++; };
// 매 프레임 관절 상태를 살핀다
//  뒤집힘: 관절(팔꿈치·무릎)이 한 프레임에 연결점·끝이 움직인 것보다 6px 넘게 더 튄 횟수
//  늘어남: 연결점–끝 거리가 최대 길이를 넘은 최댓값(px), 최소 길이보다 짧아진 최댓값(px)
//  관통: 디딘 발이 자기 몸통(어깨–골반 사다리꼴) 안에 들어가 있는 프레임 수. 다리가 몸 중심선을 넘는 것(교차) 자체는 고관절 범위 안이면 가능한 자세로 본다
//  고관절: 디딘 다리가 고관절 가동 범위를 넘은 최대 각도(°). 버티고 있을 때의 값(판정에 씀)과, 밀고 뜨는 순간의 값(참고)을 나눈다
function monitor() {
  const m = { flips: 0, over: 0, under: 0, pen: 0, hip: 0, hipDyn: 0, tilt: 0, prev: null, flipLog: [] };
  m.tick = s => {
    const c = s.p[0], hp = s.p[1], ax = (c.x - hp.x) / C.T, ay = (c.y - hp.y) / C.T, cur = [];
    m.tilt = Math.max(m.tilt, Math.abs(Math.atan2(c.x - hp.x, hp.y - c.y)) * 57.3);
    for (let i = 0; i < 4; i++) { const lb = s.limb[i], j = PH.jointPos(s, i), e = s.p[lb.end]; cur.push({ jx: j.x, jy: j.y, rx: j.rx, ry: j.ry, ex: e.x, ey: e.y, mode: lb.mode });
      m.over = Math.max(m.over, j.len - lb.max - lb.ext); if (lb.mode === 'grip' || lb.mode === 'plant') m.under = Math.max(m.under, lb.min - lb.cmp - j.len); // 잡거나 디딘 직후의 느슨함(ext·cmp)은 의도된 것이라 뺀다
      if (m.prev) { const q = m.prev[i], dj = Math.hypot(j.x - q.jx, j.y - q.jy), dr = Math.hypot(j.rx - q.rx, j.ry - q.ry), de = Math.hypot(e.x - q.ex, e.y - q.ey);
        if (q.mode === lb.mode && dj > dr + de + 6) { m.flips++; m.flipLog.push(`${s.t.toFixed(2)}초 ${['왼팔', '오른팔', '왼다리', '오른다리'][i]}(${lb.mode}) 관절 ${dj.toFixed(0)}px, 길이 ${j.len.toFixed(0)}`); } }
      if (!lb.arm && lb.mode === 'plant') {
        const ov = PH.hipAngle(ax, ay, lb, e.x - j.rx, e.y - j.ry).over; // 버티고 있을 때(엉덩이 빠르기 150px/s 미만)와 밀고 뜨는 순간을 나눠 적는다
        if (Math.hypot(hp.vx, hp.vy) < 150) m.hip = Math.max(m.hip, ov); else m.hipDyn = Math.max(m.hipDyn, ov);
        // 디딘 발이 몸통(어깨–골반 사다리꼴) 안쪽 4px보다 깊이 들어가 있는가: 몸통 축 방향으로 골반과 어깨 사이, 옆으로는 몸통 폭 안
        const up = (e.x - hp.x) * ax + (e.y - hp.y) * ay, lat = (e.x - hp.x) * -ay + (e.y - hp.y) * ax, w = C.HW + (C.SW - C.HW) * Math.max(0, Math.min(1, up / C.T));
        if (up > 4 && up < C.T - 4 && Math.abs(lat) < w - 4) m.pen++; } }
    m.prev = cur;
  };
  m.text = () => `뒤집힘 ${m.flips} · 늘어남 +${Math.max(0, m.over).toFixed(1)}px · 눌림 ${Math.max(0, m.under).toFixed(1)}px · 관통 ${m.pen}프레임 · 고관절 초과 ${Math.max(0, m.hip).toFixed(0)}°(미는 순간 ${Math.max(0, m.hipDyn).toFixed(0)}°) · 몸통 기울기 최대 ${m.tilt.toFixed(0)}°`;
  m.clean = () => m.flips === 0 && m.over < 2 && m.under < 2 && m.pen === 0 && m.hip < 3;
  return m;
}
const modes = s => s.limb.map(l => l.mode[0] + (l.anchor ? l.anchor.poly : l.mode === 'plant' ? l.poly : '')).join(' ');
const O = { autoLoad: false };
function go(st, policy, T, opt = O, variant) { const m = monitor(); const r = run(st, a => { m.tick(a.s); policy(a); }, T, opt, variant); r.mon = m; return r; }
const SC = {
  hang: st => go(st, () => {}, 3),
  shift: (st, key) => { let h0; const r = go(st, a => { if (a.s.t < 1) { h0 = [a.s.p[1].x, a.s.p[1].y]; return; } a.hold(key, a.s.t < 2); }, 2.4); r.dx = r.s.p[1].x - h0[0]; r.up = h0[1] - r.s.p[1].y; return r; },
  // 손 교차: 두 손 매달림(왼손 296, 오른손 318)에서 오른손을 왼손 너머 왼쪽(250 근처)으로 보내 잡고, 이어서 왼손을 더 왼쪽(210 근처)으로 보내 푼다
  cross: () => go(1, a => { const s = a.s; a.io.my = 298;
    if (s.t < 0.6) { a.io.mx = 250; return; }
    if (!a.m.a) { a.io.mx = 250; a.click(1); a.m.a = 1; return; }
    if (!a.m.b) { a.io.mx = 250; if (s.limb[1].mode === 'grip' && s.t > 1.2) { a.m.crossed = s.p[3].x < s.p[2].x - 10; a.m.cx = [s.p[2].x, s.p[3].x]; a.m.b = s.t; } if (s.t > 3) a.m.b = -1; return; }
    if (a.m.b > 0 && !a.m.c && s.t > a.m.b + 0.5) { a.io.mx = 210; a.click(0); a.m.c = 1; return; }
    a.io.mx = a.m.c ? 210 : 250; }, 5),
  // 도약 후 한 손 잡기: 오른손을 건너편 턱으로 먼저 보내고(세 점), Space를 hold초 모으며 왼손 지정 → 떼기. 잡은 뒤 1.5초 버티는지 본다
  jump: (hold, dxAim = 60, variant) => go(3, a => { const s = a.s, pl = s.world.find(p => p.id === 'B'); a.io.mx = pl.pts[0][0] + dxAim; a.io.my = pl.pts[0][1] + 3;
    if (!a.m.r) { a.m.r = 1; a.click(1); return; }
    if (a.m.t0 === undefined) { if (s.t < 0.5 || Math.abs(s.p[1].vx) > 8) return; a.m.t0 = s.t; }
    const t = s.t - a.m.t0; a.space(t < hold); if (!a.m.k && t >= 0.09) { a.click(0); a.m.k = 1; }
    if (a.m.catchT === undefined && s.limb[1].mode === 'grip') a.m.catchT = s.t; }, 5.5, { ...O, assistRange: 'ledge' }, variant),
  // 위로 뛰어 잡기: 3번 자세에서 머리 위 h px 높이에 시험용 턱 H를 두고 겨눈다. mode 'two' = 두 손을 다 놓고 뻗음, 'one' = 오른손을 먼저 위로 보내고 왼손만 놓음(한 팔 도약)
  // kind 'space' = Space만, 'w' = 떼기 직전부터 W(팔로 끌어 올림), 'sw' = 모으는 동안 S로 가라앉았다가 W
  up: (mode, kind, h, hold = 0.7) => { const res = {};
    const r = run(3, a => { const s = a.s, t = s.t - 1.1; a.io.mx = s.p[0].x; a.io.my = 300 - h + 3;
      if (mode === 'one' && !a.m.r && s.t > 0.1) { a.m.r = 1; a.click(1); return; }
      if (t < 0) return; a.space(t < hold); if (!a.m.k && t >= 0.09) { a.click(0); if (mode === 'two') a.click(1); a.m.k = 1; }
      if (kind === 'sw') a.hold('moveDown', t >= 0.1 && t < hold - 0.03);
      if (kind !== 'space') a.hold('moveUp', t >= hold - 0.03 && t < hold + 0.6);
      if (t > hold) res.top = Math.min(res.top ?? 1e9, s.p[2].y, s.p[3].y);
    }, 4.5, { ...O, assistRange: 'ledge' }, undefined, [['H', 'ledge', 247, 300 - h, 120, 12]]);
    res.ok = !r.s.dead && [0, 1].some(i => r.s.limb[i].mode === 'grip' && r.s.limb[i].anchor.poly === 'H'); return res; },
  mantle: () => go({ c: [490, 417], hands: [[480, 345], [500, 345]] }, a => { a.io.mx = 560; a.io.my = 220; a.hold('moveUp', a.s.t < 3); }, 5),
};
module.exports = { SC, monitor, go };
if (require.main === module) {
  PH.setBody('joint'); console.log(`몸: ${PH.BODIES.joint.name} · 모을 때 자동 싣기 끔(Space = 아래로 웅크림, 좌우 = A/D)\n`);
  console.log('1) 매달리기 (입력 없이 3초)');
  for (const st of [1, 2, 5]) { const r = SC.hang(st); check(`자세 ${st} 버팀, 관절 이상 없음`, !r.s.dead && r.s.limb.some(l => l.mode === 'grip') && r.mon.clean(), `${modes(r.s)} · ${r.mon.text()}`); }
  console.log('2) 좌우 체중 이동 (A/D 1초)');
  for (const st of [1, 3]) for (const [key, sg, nm] of [['moveLeft', -1, 'A'], ['moveRight', 1, 'D']]) { const r = SC.shift(st, key);
    check(`자세 ${st} · ${nm}: 엉덩이가 그쪽으로 8px 이상, 두 발 디딘 채`, !r.s.dead && sg * r.dx >= 8 && r.s.limb[2].mode === 'plant' && r.s.limb[3].mode === 'plant' && r.mon.clean(), `옆 ${Math.round(r.dx)}px · 위 ${Math.round(r.up)}px · ${r.mon.text()}`); }
  console.log('3) 손 교차 (오른손을 왼손 너머로 → 왼손을 더 왼쪽으로)');
  { const r = SC.cross(), s = r.s; check('교차해 잡고, 이어서 풀어 잡음', !s.dead && r.m.crossed === true && s.limb[0].mode === 'grip' && s.limb[1].mode === 'grip' && s.p[2].x < s.p[3].x && r.mon.clean(), `교차 ${r.m.crossed ? '됨' : '안 됨'}${r.m.cx ? ` (왼손 ${Math.round(r.m.cx[0])}, 오른손 ${Math.round(r.m.cx[1])})` : ''} · 끝 자세 손 x ${Math.round(s.p[2].x)}/${Math.round(s.p[3].x)} · ${modes(s)} · ${r.mon.text()}`); }
  console.log('4) 발판에서 웅크리고 밀어 한 손으로 잡기 (모은 시간별)');
  { const rows = []; let best = null;
    for (const hold of [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1.0]) { const r = SC.jump(hold), s = r.s, ok = !s.dead && s.limb[1].mode === 'grip' && s.limb[1].anchor.poly === 'B';
      rows.push(`${hold}초 ${ok ? '잡음' : s.dead ? '떨어짐' : '못 잡음'}`); if (ok && (!best || hold === 0.7)) best = r; }
    console.log('   ' + rows.join(' · '));
    check('잡고 1.5초 넘게 버티는 모은 시간이 있음, 관절 이상 없음', !!best && best.mon.clean(), best ? `${modes(best.s)} · ${best.mon.text()}` : ''); }
  console.log('5) 잡은 턱에서 팔 힘으로 허리까지 올라가 버티기 (W 3초). 손으로 잡은 턱에 발을 올려 서지는 않는다');
  { const r = SC.mantle(), s = r.s, onB = [2, 3].filter(i => s.limb[i].mode === 'plant' && s.limb[i].poly === 'B').length;
    check('가슴이 턱 위 40px 이상, 두 손 잡은 채, 잡은 턱 위에 발 없음', !s.dead && 345 - s.p[0].y >= 40 && onB === 0 && s.limb[0].mode === 'grip' && s.limb[1].mode === 'grip' && r.mon.clean(), `가슴 턱 위 ${Math.round(345 - s.p[0].y)}px · 엉덩이 턱 위 ${Math.round(345 - s.p[1].y)}px · ${modes(s)} · ${r.mon.text()}`); }
  console.log('6) 위로 뛰어 잡기: 한 팔과 두 팔, Space만과 W(팔로 끌어 올리기) 비교 — 잡은 가장 높은 턱(잡고 있던 턱에서 위로 px, 5px 간격)');
  { const best = (mode, kind) => { let b = 0; for (let h = 150; h <= 250; h += 5) if (SC.up(mode, kind, h).ok) b = h; return b; };
    const t = {}; for (const m of ['two', 'one']) for (const k of ['space', 'w', 'sw']) t[m + k] = best(m, k);
    console.log(`   두 팔: Space만 +${t.twospace} · Space+W +${t.twow} · Space+S→W +${t.twosw}   |   한 팔: Space만 +${t.onespace} · Space+W +${t.onew} · Space+S→W +${t.onesw}`);
    check('한 팔 도약이 두 팔 도약보다 높은 턱을 잡는다(Space만, 5px 이상)', t.onespace >= t.twospace + 5, `+${t.onespace} vs +${t.twospace}`);
    check('W를 누르며 뛰면(팔로 끌어 올림) Space만보다 10px 이상 높은 턱을 잡는다 — 두 팔', t.twow >= t.twospace + 10, `+${t.twow} vs +${t.twospace}`);
    check('W를 누르며 뛰면 Space만보다 10px 이상 높은 턱을 잡는다 — 한 팔', t.onew >= t.onespace + 10, `+${t.onew} vs +${t.onespace}`);
    check('S로 가라앉았다가 W를 눌러도 Space만보다 낮아지지 않는다', t.twosw >= t.twospace && t.onesw >= t.onespace, `두 팔 +${t.twosw}, 한 팔 +${t.onesw}`); }
  PH.setBody('base'); process.exit(fail ? 1 : 0);
}
