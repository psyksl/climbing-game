// 1단계 측정: 사람 자료와 비교할 움직임 수치. 사용: node test/stage1.js   (v0.4 물리로 비교: node test/stage1.js v04)
'use strict';
const PH = require('../src/physics.js'), { run, SC } = require('./intent.js');
const dt = 1 / 120, PXM = 107, idle = () => ({ cx: 0, cy: 0, hand: [false, false], foot: [false, false], power: false });
if (process.argv[2] === 'v04') for (const k of ['MUSCLE', 'SMOOTH', 'SMOOTH_FOOT', 'LAT_LEG', 'LAT_ARM']) PH.C[k] = 0;
// 1) 손 뻗기: 두 손 매달림에서 오른손을 60px 옮길 때(가슴 기준 상대 위치로 측정)
{ const s = PH.create(PH.makeWorld(), 1); for (let i = 0; i < 60; i++) PH.step(s, idle(), dt);
  const h = s.p[3], c = s.p[0], gx = h.x + 45 - c.x, gy = h.y + 40 - c.y, tx = h.x + 45, ty = h.y + 40; let vmax = 0, sum = 0, n = 0, tArr = null, c0 = [c.x, c.y], cmax = 0;
  for (let i = 0; i < 120; i++) { const inp = idle(); inp.hand[1] = true; inp.cx = tx; inp.cy = ty; PH.step(s, inp, dt);
    const v = Math.hypot(h.vx - c.vx, h.vy - c.vy); vmax = Math.max(vmax, v); cmax = Math.max(cmax, Math.hypot(c.x - c0[0], c.y - c0[1]));
    if (tArr === null) { sum += v; n++; if (Math.hypot(h.x - c.x - gx, h.y - c.y - gy) < 4) tArr = (i + 1) * dt; } }
  console.log(`손 뻗기 0.56m: 도착 ${tArr ? tArr.toFixed(2) : '-'}초 (사람 약 0.4~0.6초), 최고 속도 ${(vmax / PXM).toFixed(1)}m/s, 최고/평균 ${(vmax / (sum / n)).toFixed(2)} (사람 약 1.87), 그동안 가슴 흔들림 ${cmax.toFixed(0)}px`); }
// 2) 도약: 바로 밀기와 0.15·0.4초 모은 뒤 밀기의 이륙 속도
function jump(charge) { const s = PH.create(PH.makeWorld(), 3); for (let i = 0; i < 60; i++) PH.step(s, idle(), dt); const t0 = s.t; let off = null, F = [], tOff = null;
  while (s.t < t0 + charge + 1.5 && !s.dead) { const t = s.t - t0, inp = idle();
    if (t < charge) { inp.power = true; inp.cx = s.p[0].x - 25; inp.cy = s.p[0].y + 40; }
    else if (t < charge + 0.35) { inp.power = true; inp.cx = s.p[0].x + 120; inp.cy = s.p[0].y - 130; if (t >= charge + 0.03) inp.hand = [true, true]; }
    else inp.hand = [true, true];
    PH.step(s, inp, dt); if (t >= charge && !off) F.push(-(s.limb[2].force + s.limb[3].force) / PH.W);
    if (!off && t >= charge && !s.limb.some(l => l.mode === 'plant' || l.mode === 'grip')) { off = Math.hypot(s.p[1].vx, s.p[1].vy) / PXM; tOff = t - charge; } }
  const pk = Math.max(...F), i90 = F.findIndex(f => f >= 0.9 * pk); return { v: off || 0, push: tOff }; }
{ const a = jump(0), b = jump(0.15), c = jump(0.4), h = v => v * v;
  console.log(`도약 이륙 속도: 바로 ${a.v.toFixed(2)}m/s · 0.15초 모으고 ${b.v.toFixed(2)} · 0.4초 모으고 ${c.v.toFixed(2)}  → 모으기 이득: 속도 +${((c.v / a.v - 1) * 100).toFixed(0)}%, 높이(속도²) +${((h(c.v) / h(a.v) - 1) * 100).toFixed(0)}% (사람 반동 뛰기 +18~30%)`);
  console.log(`미는 시간(밀기 시작 → 발이 떨어짐): 바로 ${(a.push * 1000).toFixed(0)}ms, 모은 뒤 ${(c.push * 1000).toFixed(0)}ms · 근육 활성도가 90%에 이르는 시간 ${PH.C.MUSCLE ? (PH.C.TA * Math.log(10) * 1000).toFixed(0) + 'ms' : '즉시(v0.4)'}`); }
// 3) 거리별 성공률(사람 수준 조작기, 40회씩)
{ const dxs = [0, 30, 60, 90, 120, 150]; const rate = (mk, dx) => { let ok = 0; for (let k = 0; k < 40; k++) { const sc = mk(); if (sc.ok(run(sc.station, sc.policy, sc.T, sc.opt, dx))) ok++; } return Math.round(ok / 40 * 100); };
  console.log('\n건너편 턱을 오른쪽으로 옮긴 거리(px):', dxs.join(' '));
  for (const [n, mk] of [['두 손 다이노', () => SC.dyno()], ['세 점 → 오른손, 반동 없이', () => SC.reach3({ rocks: 0 })], ['세 점 → 오른손, 반동 1번', () => SC.reach3({ rocks: 1 })], ['세 점 → 오른손, 반동 2번', () => SC.reach3({ rocks: 2 })]])
    console.log('  ' + n.padEnd(22), dxs.map(dx => String(rate(mk, dx)).padStart(4) + '%').join('')); }
// 4) 자동 체중 이동: 넓게 매달린 자세에서 오른손을 보낼 때 남은 손 아래 흔들림
{ const st = { c: [285, 360], hands: [[252, 300], [318, 300]] };
  for (const autoShift of [false, true]) { let amp = 0, delay = null; run(st, a => { a.io.mx = 400; a.io.my = 230; if (!a.m.c && a.s.t > 0.5) { a.click(1); a.m.c = 1; a.m.t = a.s.t; } const s = a.s;
      if (a.m.c && delay === null && s.limb[1].mode !== 'grip') delay = s.t - a.m.t;
      if (a.m.c && s.limb[1].mode !== 'grip' && s.limb[0].mode === 'grip') { const h = s.limb[0].anchor; amp = Math.max(amp, Math.abs(Math.atan2(s.p[0].x - h.x, s.p[0].y - h.y)) * 57.3); } }, 3.5, { autoShift, autoFeet: false });
    console.log(`자동 체중 이동 ${autoShift ? '켬' : '끔'}: 클릭 뒤 손이 떨어지기까지 ${(delay * 1000).toFixed(0)}ms, 남은 손 아래 흔들림 ${amp.toFixed(0)}°`); } }
