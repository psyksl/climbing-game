// 자동 시연·자동 시험용 조작기. 사람과 똑같은 입력(커서 위치, 손 버튼 2개, 발 키 2개, 힘주기)만 낸다.
'use strict';
const BOTS = (() => {
  const idle = () => ({ cx: 0, cy: 0, hand: [false, false], foot: [false, false], power: false });
  const d = (a, x, y) => Math.hypot(a.x - x, a.y - y);
  const PHX = typeof PH !== 'undefined' ? PH : require('./physics.js');
  const BX = 470, BY = 330, JX = 415, JY = 350;
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
    inp.foot[i - 2] = !(lb.mode === 'reach' && d(s.p[2 + i], x, y) < 6);
    return false;
  }
  // 건너편 턱(B)에 한 손이 걸린 뒤: 다른 손, 그다음 발로 안정시킨다
  function stabilize(s, m, inp) {
    const first = m.first, other = 1 - first, a = s.limb[first].anchor;
    if (!a) return;
    if (!m.second) { if (s.t - m.tc > 0.25 && catchWith(s, inp, other, a.x + (a.x < BX + 25 ? 22 : -22), BY)) m.second = s.t; return; }
    if (!m.foot) { if (s.t - m.second > 0.3 && plantFoot(s, inp, 3, Math.max(BX + 46, Math.min(BX + 74, s.p[1].x)), BY + 108)) m.foot = s.t; return; }
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
  const defs = {
    // 방법 1: 한 손으로 매달려 다리로 반동을 키운 뒤 놓고 건너편 턱을 잡는다
    swing: { station: 2, title: '방법 1 · 한 손 반동 → 놓기 → 한 손 잡기 → 안정', p: { rel: 48, amp: 60 },
      run(s, m, p) {
        const inp = idle(), c = s.p[0], hp = s.p[1];
        if (m.ph === 0) {
          const a = s.limb[1].anchor; if (!a) return inp;
          const phi = Math.atan2(c.x - a.x, c.y - a.y) * 180 / Math.PI;
          m.amp = Math.max(m.amp || 0, Math.abs(phi)); m.maxAmp = Math.max(m.maxAmp || 0, Math.abs(phi));
          inp.foot = [true, true]; inp.cx = hp.x + (s.t < 0.3 || phi < 0 ? 70 : -70); inp.cy = hp.y + 45;
          if (m.maxAmp > p.amp && phi < -10) m.ready = true;
          if (m.ready && phi > p.rel && c.vx > 0) { m.ph = 1; m.t1 = s.t; }
          return inp;
        }
        if (m.ph === 1) { if (flyCatch(s, m, inp, BX + 8, BY)) m.ph = 2; return inp; }
        stabilize(s, m, inp); return inp;
      } },
    // 방법 2: 발판을 디디고 웅크렸다가 다리로 밀며 두 손을 놓는다
    jump: { station: 3, title: '방법 2 · 웅크리기 → 발로 밀기 → 손 놓기 → 잡기 → 안정', p: { lean: 0.5, rel: 0.02, pw: 0.25 },
      run(s, m, p) {
        const inp = idle();
        if (m.ph === 0) {
          if (s.t < 0.5) return inp;
          const t = s.t - 0.5; inp.power = true;
          if (t < p.lean) { inp.cx = 352; inp.cy = 362; return inp; }
          inp.cx = 450; inp.cy = 200;
          if (t > p.lean + p.rel) inp.hand = [true, true];
          if (t > p.lean + p.pw) m.ph = 1;
          return inp;
        }
        if (m.ph === 1) { if (flyCatch(s, m, inp, BX + 8, BY)) m.ph = 2; return inp; }
        stabilize(s, m, inp); return inp;
      } },
    // 방법 3: 작은 반동으로 중간 저그를 잡고, 당겨 올라가 건너편 턱으로 손을 옮긴다
    jug: { station: 2, title: '방법 3 · 작은 반동 → 저그 → 당겨 올라 손 옮기기', p: { rel: 30 },
      run(s, m, p) {
        const inp = idle(), c = s.p[0], hp = s.p[1];
        if (m.ph === 0) {
          const a = s.limb[1].anchor; if (!a) return inp;
          const phi = Math.atan2(c.x - a.x, c.y - a.y) * 180 / Math.PI;
          inp.foot = [true, true]; inp.cx = hp.x + (s.t < 0.3 || phi < 0 ? 70 : -70); inp.cy = hp.y + 45;
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
        if (m.ph === 4) { inp.power = true; if (catchWith(s, inp, 1, BX + 8, BY)) { m.ph = 5; m.first = 1; m.tc = s.t; } return inp; }
        stabilize(s, m, inp); return inp;
      } },
    // 마무리: 건너편에서 두 손·한 발로 자리 잡고, 발로 밀어 일어서며 목표 턱을 잡는다
    top: { station: 4, title: '마무리 · 발 딛고 일어서며 목표 턱 잡기', p: {}, win: true,
      run(s, m) {
        const inp = idle(), c = s.p[0];
        if (m.ph === 0) { if (s.t < 0.4) return inp; inp.power = true; if (catchWith(s, inp, 1, BX + 24, BY)) m.ph = 1; return inp; }
        if (m.ph === 1) { if (plantFoot(s, inp, 3, BX + 58, BY + 108)) { m.ph = 2; m.t2 = s.t; } return inp; }
        if (m.ph === 2) { inp.power = true; inp.cx = BX + 62; inp.cy = BY - 45; if (c.y < BY - 28 || s.t - m.t2 > 1.6) m.ph = 3; return inp; }
        if (m.ph === 3) { inp.power = true; if (catchWith(s, inp, 0, BX + 66, BY - 90)) m.ph = 4; return inp; }
        if (m.ph === 4) { if (catchWith(s, inp, 1, BX + 88, BY - 90)) m.ph = 5; return inp; }
        if (s.won) m.done = true; return inp;
      } },
    // 실패 예: 반동이 모자란 채 일찍 놓는다
    early: { station: 2, title: '실패 예 · 반동이 모자란 채 놓기', p: { rel: 20, amp: 25 }, expectFail: true, run(s, m, p) { return defs.swing.run(s, m, p); } },
    // 실패 예: 도약 중 손을 떼는 것이 늦다
    late: { station: 3, title: '실패 예 · 발로 밀었지만 손을 늦게 놓기', p: { lean: 0.5, rel: 0.3, pw: 0.35 }, expectFail: true, run(s, m, p) { return defs.jump.run(s, m, p); } },
  };
  function make(name, over) {
    const def = defs[name], m = { ph: 0 }, p = { ...def.p, ...over };
    return { def, m, step: s => def.run(s, m, p) };
  }
  return { defs, make, idle };
})();
if (typeof module !== 'undefined') module.exports = BOTS;
