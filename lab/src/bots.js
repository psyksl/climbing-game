// 자동 시연·자동 시험용 조작기. 사람과 똑같은 입력(커서 위치, 손 버튼 2개, 발 키 2개, 힘주기)만 낸다.
'use strict';
const BOTS = (() => {
  const idle = () => ({ cx: 0, cy: 0, hand: [false, false], foot: [false, false], power: false });
  const d = (a, x, y) => Math.hypot(a.x - x, a.y - y);
  const PHX = typeof PH !== 'undefined' ? PH : require('./physics.js');
  const BX0 = 470, BY = 345, JX = 415, JY = 350;
  const bx = s => s.world.find(pl => pl.id === 'B').pts[0][0];
  const near = (s, i) => { const g = PHX.nearestGrip(s.world, s.p[2 + i].x, s.p[2 + i].y); return g ? g.d : 999; };
  // 손 i를 (x,y)로 뻗어, 닿으면 버튼을 떼어 잡는다. 잡았으면 true
  function catchWith(s, inp, i, x, y) {
    const lb = s.limb[i];
    if (lb.mode === 'grip' && d(lb.anchor, x, y) < 20) return true;
    inp.cx = x; inp.cy = y;
    inp.hand[i] = !(lb.mode === 'reach' && d(s.p[2 + i], x, y) < 9);
    return false;
  }
  function plantFoot(s, inp, i, x, y) {
    const lb = s.limb[i];
    if (lb.mode === 'plant') return true;
    inp.cx = x; inp.cy = y;
    const f = s.p[2 + i], q = PHX.nearestSurface(s.world, f.x, f.y);
    inp.foot[i - 2] = !(lb.mode === 'reach' && q.d < 7 && d(f, x, y) < 22);
    return false;
  }
  // 건너편 턱(B)에 한 손이 걸린 뒤: 다른 손, 그다음 발로 안정시킨다
  function stabilize(s, m, inp) {
    const first = m.first, other = 1 - first, a = s.limb[first].anchor;
    if (!a) return;
    if (!m.second) { if (s.t - m.tc > 0.25 && catchWith(s, inp, other, a.x + (a.x < bx(s) + 25 ? 22 : -22), BY)) m.second = s.t; return; }
    if (!m.foot) { if (s.t - m.second > 0.3 && plantFoot(s, inp, 3, Math.max(bx(s) + 10, Math.min(bx(s) + 42, s.p[1].x + 6)), BY + 173)) m.foot = s.t; return; }
    m.done = true;
  }
  function flyCatch(s, m, inp, tx, ty) { // 공중: 두 손을 뻗어 먼저 닿는 손으로 잡는다
    for (const i of [0, 1]) {
      const lb = s.limb[i];
      if (lb.mode === 'grip' && lb.anchor.poly === 'B') { m.first = i; m.tc = s.t; return true; }
    }
    inp.cx = tx; inp.cy = ty;
    for (const i of [0, 1]) inp.hand[i] = !(s.limb[i].mode === 'reach' && near(s, i) < 9 && d(s.p[2 + i], tx, ty) < 40);
    return false;
  }
  // 같은 출발점(두 손 매달리기)에서 시작하기 위한 준비 동작들
  function dropLeft(s, m, inp) { // 왼손을 일부러 놓아 한 손 매달리기로
    const lb = s.limb[0], c = s.p[0];
    if (s.t < 0.4) return false;
    if (lb.mode === 'grip' && !m.dropped) { inp.hand[0] = true; inp.cx = c.x - 20; inp.cy = c.y + 50; m.td = s.t; return false; }
    m.dropped = true;
    if (lb.mode === 'reach') { inp.cx = c.x - 20; inp.cy = c.y + 50; inp.hand[0] = s.t - m.td < 0.2; return false; }
    return true;
  }
  function stepOnBlock(s, m, inp, fx) { // 발판을 찾아 두 발을 올린다
    if (s.t < 0.4) return false;
    if (!m.f1) { if (plantFoot(s, inp, 3, fx, 465)) m.f1 = s.t; return false; }
    if (!m.f2) { if (s.t - m.f1 > 0.15 && plantFoot(s, inp, 2, fx - 14, 465)) m.f2 = s.t; return false; }
    return s.t - m.f2 > 0.2;
  }
  const defs = {
    // 방법 1: 한 손으로 매달려 다리로 반동을 키운 뒤 놓고 건너편 턱을 잡는다
    swing: { station: 1, title: '방법 1 · 한 손 반동 → 놓기 → 한 손 잡기 → 안정', p: { rel: 48, amp: 60 },
      run(s, m, p) {
        const inp = idle(), c = s.p[0], hp = s.p[1];
        if (m.ph === 0 && !m.pre) { if (dropLeft(s, m, inp)) { m.pre = true; m.t0 = s.t; } return inp; }
        if (m.ph === 0) {
          const a = s.limb[1].anchor; if (!a) return inp;
          const phi = Math.atan2(c.x - a.x, c.y - a.y) * 180 / Math.PI;
          m.amp = Math.max(m.amp || 0, Math.abs(phi)); m.maxAmp = Math.max(m.maxAmp || 0, Math.abs(phi));
          inp.foot = [true, true]; inp.cx = hp.x + (s.t - m.t0 < 0.3 || phi < 0 ? 70 : -70); inp.cy = hp.y + 45;
          if (m.maxAmp > p.amp && phi < -10) m.ready = true;
          if (m.ready && phi > p.rel && c.vx > 0) { m.ph = 1; m.t1 = s.t; }
          return inp;
        }
        if (m.ph === 1) { if (flyCatch(s, m, inp, bx(s) + 8, BY)) m.ph = 2; return inp; }
        stabilize(s, m, inp); return inp;
      } },
    // 방법 2: 발판을 디디고 웅크렸다가 다리로 밀며 두 손을 놓는다
    jump: { station: 1, title: '방법 2 · 발판 찾아 딛기 → 웅크리기 → 발로 밀며 손 놓기 → 잡기 → 안정', p: { fx: 286, lx: 330, ly: 372, lean: 0.05, rel: 0.05, pw: 0.3, ex: 450, ey: 200, aimT: false },
      run(s, m, p) {
        const inp = idle();
        if (m.ph === 0 && !m.pre) { if (stepOnBlock(s, m, inp, p.fx)) { m.pre = true; m.t0 = s.t; } return inp; }
        if (m.ph === 0) {
          // t: 밀기(스페이스로 위를 향함)를 시작한 시각 기준. rel: 손 놓기가 밀기보다 얼마나 늦은가(음수면 먼저 놓음)
          const t = s.t - m.t0 - p.lean, rel = p.rel;
          inp.power = t >= Math.min(0, rel) - 0.001 || t < 0 ? true : true;
          if (t < 0 && t < rel) { inp.cx = p.lx; inp.cy = p.ly; return inp; }  // 웅크리기
          const pushing = t >= 0, released = t >= rel;
          inp.power = pushing || t < 0;
          if (!pushing) { inp.cx = p.lx; inp.cy = p.ly; }        // 손을 먼저 놓은 경우: 아직 웅크린 채
          else if (released && p.aimT) { inp.cx = bx(s) + 8; inp.cy = BY; } // 놓자마자 다음 턱을 조준(사람이 흔히 하는 방식)
          else { inp.cx = p.ex; inp.cy = p.ey; }
          if (released) inp.hand = [true, true];
          if (t > Math.max(0, rel) + p.pw) m.ph = 1;
          return inp;
        }
        if (m.ph === 1) { if (flyCatch(s, m, inp, bx(s) + 8, BY)) m.ph = 2; return inp; }
        stabilize(s, m, inp); return inp;
      } },
    // 방법 3: 작은 반동으로 중간 저그를 잡고, 당겨 올라가 건너편 턱으로 손을 옮긴다
    jug: { station: 1, title: '방법 3 · 작은 반동 → 저그 → 당겨 올라 손 옮기기', p: { rel: 30 },
      run(s, m, p) {
        const inp = idle(), c = s.p[0], hp = s.p[1];
        if (m.ph === 0 && !m.pre) { if (dropLeft(s, m, inp)) { m.pre = true; m.t0 = s.t; } return inp; }
        if (m.ph === 0) {
          const a = s.limb[1].anchor; if (!a) return inp;
          const phi = Math.atan2(c.x - a.x, c.y - a.y) * 180 / Math.PI;
          inp.foot = [true, true]; inp.cx = hp.x + (s.t - m.t0 < 0.3 || phi < 0 ? 70 : -70); inp.cy = hp.y + 45;
          if (phi > p.rel && c.vx > 0 && d(c, JX, JY) < 80) m.ph = 1;
          return inp;
        }
        if (m.ph === 1) { if (catchWith(s, inp, 0, JX, JY - 8)) { m.ph = 2; m.t2 = s.t; } return inp; }
        if (m.ph === 2) { // 오른손도 저그로 옮겨 두 손으로 버틴다
          if (s.t - m.t2 < 0.3) return inp;
          if (catchWith(s, inp, 1, JX + 6, JY - 6)) { m.ph = 3; m.t2 = s.t; } return inp;
        }
        if (m.ph === 3) { // 당겨 올라가기
          inp.power = true; inp.cx = JX + 8; inp.cy = JY + 6;
          if (c.y < 345 || s.t - m.t2 > 1.5) { m.ph = 4; m.t2 = s.t; }
          return inp;
        }
        if (m.ph === 4) { inp.power = true; if (catchWith(s, inp, 1, bx(s) + 8, BY)) { m.ph = 5; m.first = 1; m.tc = s.t; } return inp; }
        stabilize(s, m, inp); return inp;
      } },
    // 마무리: 건너편에서 두 손·한 발로 자리 잡고, 발로 밀어 일어서며 목표 턱을 잡는다
    top: { station: 4, title: '마무리 · 발 딛고 일어서며 목표 턱 잡기', p: {}, win: true,
      run(s, m) {
        const inp = idle(), c = s.p[0];
        if (m.ph === 0) { if (s.t < 0.4) return inp; inp.power = true; if (catchWith(s, inp, 1, bx(s) + 24, BY)) m.ph = 1; return inp; }
        if (m.ph === 1) { if (plantFoot(s, inp, 3, bx(s) + 58, BY + 108)) { m.ph = 2; m.t2 = s.t; } return inp; }
        if (m.ph === 2) { inp.power = true; inp.cx = bx(s) + 62; inp.cy = BY - 45; if (c.y < BY - 28 || s.t - m.t2 > 1.6) m.ph = 3; return inp; }
        if (m.ph === 3) { inp.power = true; if (catchWith(s, inp, 0, bx(s) + 66, BY - 93)) m.ph = 4; return inp; }
        if (m.ph === 4) { if (catchWith(s, inp, 1, bx(s) + 88, BY - 93)) m.ph = 5; return inp; }
        if (s.won) m.done = true; return inp;
      } },
    // 실패 예: 반동이 모자란 채 일찍 놓는다
    early: { base: 'swing', station: 1, title: '실패 예 · 반동이 모자란 채 놓기', p: { rel: 20, amp: 25 }, expectFail: true, run(s, m, p) { return defs.swing.run(s, m, p); } },
    // 실패 예: 도약 중 손을 떼는 것이 늦다
    footpos: { base: 'jump', station: 1, title: '실패 예 · 같은 도약인데 발을 엉덩이 앞쪽에 디딤', p: { fx: 312 }, expectFail: true, run(s, m, p) { return defs.jump.run(s, m, p); } },
    late: { base: 'jump', station: 1, title: '실패 예 · 발로 밀었지만 손을 늦게 놓기', p: { rel: 0.4 }, expectFail: true, run(s, m, p) { return defs.jump.run(s, m, p); } },
  };
  function make(name, over) {
    const def = defs[name], m = { ph: 0 }, p = { ...(def.base ? defs[def.base].p : {}), ...def.p, ...over };
    return { def, m, step: s => def.run(s, m, p) };
  }
  return { defs, make, idle };
})();
if (typeof module !== 'undefined') module.exports = BOTS;
