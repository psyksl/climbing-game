// 새 조작(A안·B안)을 "키 입력 수준"에서 검증한다: 가짜 키보드·마우스 → 조작 층 → 물리.
// 자동 조작기는 상태를 읽고 정확한 시점에 키를 누르므로, 사람이 할 만한지의 증거는 아니다.
'use strict';
const PH = require('../src/physics.js'), CTRL = require('../src/controls.js');
if (!process.env.V05) for (const k of ['MUSCLE', 'SMOOTH', 'SMOOTH_FOOT', 'LAT_LEG', 'LAT_ARM', 'PALM']) PH.C[k] = 0; // v0.4 물리 기준 측정(A·B·C안 비교용)
const dt = 1 / 120, d = (a, x, y) => Math.hypot(a.x - x, a.y - y);
function sim(mode, station, variant, policy, T = 12) {
  const s = PH.create(PH.makeWorld(variant), station), ctl = CTRL.make(mode), K = CTRL.KEYMAP[mode];
  const held = new Set(), io = { mx: 0, my: 0, lmb: false, rmb: false, lheld: false, rheld: false, key: c => held.has(c), pressed: c => pressedNow.has(c) };
  let pressedNow = new Set(); const m = { ph: 0 }, log = [];
  const api = { K, s, m, io, ctl, hold(k, on) { if (on && !held.has(K[k])) { held.add(K[k]); pressedNow.add(K[k]); } if (!on) held.delete(K[k]); }, tap(k) { pressedNow.add(K[k]); }, click() { io.lmb = true; },
    B: () => { const pl = s.world.find(p => p.id === 'B'); return [pl.pts[0][0] + 8, pl.pts[0][1]]; } };
  while (s.t < T && !s.dead && !m.done) {
    pressedNow = new Set(); io.lmb = false; io.rmb = false;
    policy(api);
    PH.step(s, ctl.step(s, io, dt), dt);
    for (const e of s.events) log.push(`${s.t.toFixed(2)} ${e.type}${e.limb ?? ''}${e.poly ? '@' + e.poly : ''}`);
  }
  return { s, m, log };
}
// B안: 방향키로 끝점을 목표로 몰고 간다(방향키만 사용)
function steer(a, side, i, tx, ty) {
  const e = a.s.p[2 + i], dx = tx - e.x, dy = ty - e.y, dz = 4;
  a.hold(side + 'Left', dx < -dz); a.hold(side + 'Right', dx > dz); a.hold(side + 'Up', dy < -dz); a.hold(side + 'Down', dy > dz);
}
const stop = (a, side) => { for (const k of ['Left', 'Right', 'Up', 'Down']) a.hold(side + k, false); };
const phiOf = (s, i) => { const a = s.limb[i].anchor, c = s.p[0]; return a ? Math.atan2(c.x - a.x, c.y - a.y) * 57.3 : 0; };

// ① 오른손으로 매달린 채 왼발을 발판으로 옮기기
const T1 = { pick(a) { const { s, m, io } = a; io.mx = 302; io.my = 465;
    if (m.ph === 0 && s.t > 0.3) { a.tap('lf'); m.ph = 1; }
    else if (m.ph === 1 && CTRL.inRange(s, 2) && d(s.p[4], 302, 465) < 12) { a.click(); m.ph = 2; m.t = s.t; }
    else if (m.ph === 2 && s.t - m.t > 1) m.done = true; },
  keys(a) { const { s, m } = a;
    if (m.ph === 0 && s.t > 0.3) { a.tap('lf'); m.ph = 1; }
    else if (m.ph === 1) { steer(a, 'l', 2, 302, 463); if (CTRL.inRange(s, 2) && d(s.p[4], 302, 463) < 12) { stop(a, 'l'); a.tap('lf'); m.ph = 2; m.t = s.t; } }
    else if (m.ph === 2 && s.t - m.t > 1) m.done = true; } };
// ② 양쪽을 서로 다른 방향으로 동시에 움직이기 (B안만 가능: 왼손은 왼쪽으로, 오른발은 오른쪽으로)
const T2 = { keys(a) { const { s, m } = a;
    if (m.ph === 0 && s.t > 0.3) { a.tap('lh'); a.tap('rf'); m.ph = 1; m.t = s.t; m.x0 = [s.p[2].x - s.p[0].x, s.p[5].x - s.p[1].x]; }
    else if (m.ph === 1) { a.hold('lLeft', true); a.hold('lUp', true); a.hold('rRight', true); if (s.t - m.t > 0.45) { m.dx = [s.p[2].x - s.p[0].x - m.x0[0], s.p[5].x - s.p[1].x - m.x0[1]]; m.done = true; } } } };
// ③ 발로 밀어 한 손으로 건너편 잡기 (발판 위 웅크린 자세에서). rel: 손 놓기가 밀기보다 늦은 시간
const T3 = rel => ({ pick(a) { const { s, m, io } = a, [tx, ty] = a.B(); io.mx = tx; io.my = ty;
    const t = s.t - 0.4;
    a.hold('power', t >= 0 && t < Math.max(0, rel) + 0.3);
    if (!m.rel && t >= rel) { a.tap('lh'); a.tap('rh'); m.rel = true; }
    if (m.rel && !m.got) for (const i of [0, 1]) if (s.limb[i].mode === 'reach' && CTRL.inRange(s, i) && d(s.p[2 + i], tx, ty) < 40) { a.click(); break; }
    for (const i of [0, 1]) if (s.limb[i].mode === 'grip' && s.limb[i].anchor.poly === 'B') { if (!m.got) m.got = s.t; }
    if (m.got && s.t - m.got > 1.2) m.done = true; },
  keys(a) { const { s, m } = a, [tx, ty] = a.B(), t = s.t - 0.4, pushing = t >= 0 && t < Math.max(0, rel) + 0.3;
    a.hold('power', pushing);
    if (!m.rel && t >= rel) { a.tap('lh'); a.tap('rh'); m.rel = true; }
    if (!m.rel || pushing) { a.hold('rRight', t >= 0); a.hold('rUp', t >= 0); if (m.rel) steer(a, 'l', 0, tx, ty); } // 미는 동안: 오른쪽 방향키로 힘 방향(오른쪽 위)
    else if (!m.got) { steer(a, 'l', 0, tx, ty); steer(a, 'r', 1, tx, ty); }
    if (m.rel && !m.got) for (const [i, k] of [[0, 'lh'], [1, 'rh']]) if (s.limb[i].mode === 'reach' && CTRL.inRange(s, i) && d(s.p[2 + i], tx, ty) < 40) a.tap(k);
    for (const i of [0, 1]) if (s.limb[i].mode === 'grip' && s.limb[i].anchor.poly === 'B') { if (!m.got) { m.got = s.t; stop(a, 'l'); stop(a, 'r'); } }
    if (m.got && s.t - m.got > 1.2) m.done = true; } });
// 스윙: 한 손(오른손)으로 매달려 반동 → 놓기 → 건너편 한 손 잡기. rel: 놓는 각도
const T4 = (rel, amp) => ({ pick(a) { const { s, m, io } = a, [tx, ty] = a.B(); io.mx = tx; io.my = ty;
    if (m.ph === 0) { const phi = phiOf(s, 1); m.max = Math.max(m.max || 0, Math.abs(phi));
      a.hold('swingL', s.t > 0.3 && phi > 0); a.hold('swingR', s.t <= 0.3 || phi <= 0);
      if (m.max > amp && phi < -10) m.ready = true;
      if (m.ready && phi > rel && s.p[0].vx > 0) { a.hold('swingL', false); a.hold('swingR', false); a.tap('rh'); a.tap('lh'); m.ph = 1; } return; }
    if (!m.got) for (const i of [0, 1]) if (s.limb[i].mode === 'reach' && CTRL.inRange(s, i) && d(s.p[2 + i], tx, ty) < 40) { a.click(); break; }
    for (const i of [0, 1]) if (s.limb[i].mode === 'grip' && s.limb[i].anchor && s.limb[i].anchor.poly === 'B') { if (!m.got) m.got = s.t; }
    if (m.got && s.t - m.got > 1.2) m.done = true; },
  keys(a) { const { s, m } = a, [tx, ty] = a.B();
    if (m.ph === 0) { if (s.t > 0.2 && !m.sel) { a.tap('lf'); a.tap('rf'); m.sel = true; }
      const phi = phiOf(s, 1); m.max = Math.max(m.max || 0, Math.abs(phi)); const left = s.t > 0.4 && phi > 0;
      for (const sd of ['l', 'r']) { a.hold(sd + 'Left', left); a.hold(sd + 'Right', !left); a.hold(sd + 'Down', false); a.hold(sd + 'Up', false); }
      if (m.max > amp && phi < -10) m.ready = true;
      if (m.ready && phi > rel && s.p[0].vx > 0) { stop(a, 'l'); stop(a, 'r'); a.tap('rh'); a.tap('lh'); m.ph = 1; } return; }
    if (!m.got) { steer(a, 'l', 0, tx, ty); steer(a, 'r', 1, tx, ty); for (const [i, k] of [[0, 'lh'], [1, 'rh']]) if (s.limb[i].mode === 'reach' && CTRL.inRange(s, i) && d(s.p[2 + i], tx, ty) < 40) a.tap(k); }
    for (const i of [0, 1]) if (s.limb[i].mode === 'grip' && s.limb[i].anchor && s.limb[i].anchor.poly === 'B') { if (!m.got) { m.got = s.t; stop(a, 'l'); stop(a, 'r'); } }
    if (m.got && s.t - m.got > 1.2) m.done = true; } });
const okCatch = r => !r.s.dead && !!r.m.got && [0, 1].some(i => r.s.limb[i].mode === 'grip' && r.s.limb[i].anchor.poly === 'B');
module.exports = { sim, T1, T2, T3, T4, okCatch };
if (require.main === module) {
  let fail = 0; const check = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`); if (!c) fail++; };
  for (const mode of ['pick', 'keys']) {
    const nm = mode === 'pick' ? 'A안' : 'B안';
    const r1 = sim(mode, 2, null, T1[mode]); check(`${nm} ① 오른손 매달린 채 왼발 옮기기`, !r1.s.dead && r1.s.limb[2].mode === 'plant' && r1.s.limb[1].mode === 'grip', `${r1.s.t.toFixed(1)}초`);
    if (T2[mode]) { const r2 = sim(mode, 2, null, T2[mode]); check(`${nm} ② 양쪽을 서로 다른 방향으로`, r2.m.dx && r2.m.dx[0] < -25 && r2.m.dx[1] > 25 && r2.s.limb[1].mode === 'grip', r2.m.dx ? `왼손 ${r2.m.dx[0].toFixed(0)}px, 오른발 +${r2.m.dx[1].toFixed(0)}px (0.45초)` : ''); }
    else console.log(`INFO  ${nm} ② 양쪽 동시 이동은 구조상 없음(커서 하나). 차례로 옮긴다`);
    const r3 = sim(mode, 3, null, T3(0.03)[mode]); check(`${nm} ③ 발로 밀어 한 손으로 건너편 잡기`, okCatch(r3), r3.log.slice(0, 6).join(', '));
    const v4 = mode === 'keys' ? 'near' : null, r4 = sim(mode, 2, v4, T4(45, 55)[mode], 16); check(`${nm} 스윙으로 건너편 잡기(${v4 ? '연습 배치' : '기존 벽'})`, okCatch(r4), r4.log.slice(-4).join(', '));
  }
  const rels = [-0.3, -0.2, -0.1, -0.05, 0, 0.03, 0.06, 0.09, 0.12, 0.15, 0.18, 0.21, 0.25, 0.3], angs = [20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70];
  const row = (label, xs, f) => console.log(label.padEnd(34), xs.map(x => (f(x) ? 'O' : '.')).join(' '));
  console.log('\n도약: 손 놓기가 밀기보다 늦은 시간(초)\n' + ' '.repeat(34), rels.join(' '));
  for (const mode of ['pick', 'keys']) for (const c of [0, 0.15]) { PH.C.COUPLE = c; row(`  ${mode === 'pick' ? 'A안' : 'B안'} · ${c ? '도약 연결 0.15초' : '즉시 밀기(기본)'}`, rels, rel => okCatch(sim(mode, 3, null, T3(rel)[mode]))); }
  PH.C.COUPLE = 0;
  console.log('\n스윙: 놓는 각도(°), 진폭 55°\n' + ' '.repeat(34), angs.join(' '));
  for (const mode of ['pick', 'keys']) for (const v of [null, 'near']) row(`  ${mode === 'pick' ? 'A안' : 'B안'} · ${v ? '연습 배치(18px 가깝게)' : '기존 벽'}`, angs, rel => okCatch(sim(mode, 2, v, T4(rel, 55)[mode], 16)));
  process.exit(fail ? 1 : 0);
}
