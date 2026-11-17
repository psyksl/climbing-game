// 조작 방식(비교용 세 가지). 키 입력 → 물리 입력으로 바꾸는 층이며 화면과 무관하다(노드에서 시험 가능).
// 키를 바꾸려면 아래 KEYMAP을 고치거나, 게임 안에서 F2로 다시 지정한다.
'use strict';
const CTRL = (() => {
  const PHX = typeof PH !== 'undefined' ? PH : require('./physics.js');
  const KEYMAP = {
    // A안 "집기와 붙이기 분리": 손발 키로 떼어 집고(누르고 있지 않아도 커서를 따라옴), 좌클릭으로 붙인다
    pick: { lh: 'KeyQ', rh: 'KeyE', lf: 'KeyA', rf: 'KeyD', swingL: 'KeyZ', tuck: 'KeyX', swingR: 'KeyC', power: 'Space' },
    // B안 "키보드 좌우 분담": 왼손은 왼쪽 팔다리, 오른손은 오른쪽 팔다리. 방향키로 끝점을 움직이고 같은 키로 접촉 시도
    keys: { lh: 'KeyQ', lf: 'KeyZ', lUp: 'KeyW', lLeft: 'KeyA', lDown: 'KeyS', lRight: 'KeyD', lDrop: 'KeyE',
            rh: 'KeyU', rf: 'KeyM', rUp: 'KeyI', rLeft: 'KeyJ', rDown: 'KeyK', rRight: 'KeyL', rDrop: 'KeyO', power: 'Space' },
    // C안(v0.3 방식): 누르고 있는 동안 커서를 따라오고, 떼는 순간 붙는다
    hold: { lh: 'KeyQ', rh: 'KeyE', lf: 'KeyA', rf: 'KeyD', power: 'Space' },
  };
  const LABEL = { lh: '왼손', rh: '오른손', lf: '왼발', rf: '오른발', swingL: '다리 왼쪽으로', tuck: '다리 접기', swingR: '다리 오른쪽으로', power: '힘주기',
    lUp: '왼쪽 ↑', lLeft: '왼쪽 ←', lDown: '왼쪽 ↓', lRight: '왼쪽 →', lDrop: '왼쪽 힘 빼기', rUp: '오른쪽 ↑', rLeft: '오른쪽 ←', rDown: '오른쪽 ↓', rRight: '오른쪽 →', rDrop: '오른쪽 힘 빼기' };
  const MODES = { pick: 'A안 · 집기와 붙이기 분리 (키로 집고, 클릭으로 붙임)', keys: 'B안 · 키보드 좌우 분담 (GPT 제안)', hold: 'C안 · 누르는 동안 이동, 떼면 붙음 (v0.3)' };
  const LIMB_OF = { lh: 0, rh: 1, lf: 2, rf: 3 };
  const KEY_SPEED = 260; // B안: 방향키로 끝점이 움직이는 속도(px/초)

  function inRange(s, i) { // 지금 붙이기를 시도하면 닿는 곳이 있는가
    const e = s.p[2 + i], C = PHX.C;
    if (i < 2) { const g = PHX.nearestGrip(s.world, e.x, e.y); return !!g && g.d <= C.GRAB_R; }
    const q = PHX.nearestSurface(s.world, e.x, e.y); return !!q && q.d <= C.PLANT_R;
  }
  function make(mode) {
    const st = { mode, act: [false, false, false, false], tryNow: [false, false, false, false], pend: [false, false, false, false], sw: [false, false, false, false],
      off: [[0, 0], [0, 0], [0, 0], [0, 0]], sel: { l: null, r: null }, block: [true, true, true, true], air: [] };
    const K = KEYMAP[mode];
    function attempt(s, i) { if (inRange(s, i)) st.tryNow[i] = true; else st.air.push(i); } // 닿은 곳이 없으면 그대로 든 채로 둔다
    function step(s, io, dt) {
      const inp = { cx: io.mx, cy: io.my, hand: [false, false], foot: [false, false], power: io.key(K.power), t: [null, null, null, null], drop: [false, false, false, false] };
      st.air.length = 0;
      for (let i = 0; i < 4; i++) if (st.pend[i]) { st.pend[i] = false; const m = s.limb[i].mode; if (m === 'grip' || m === 'plant') st.act[i] = false; } // 붙었으면 내려놓는다
      if (mode === 'hold') {
        const raw = [io.lheld || io.key(K.lh), io.rheld || io.key(K.rh), io.key(K.lf), io.key(K.rf)];
        for (let i = 0; i < 4; i++) { if (!raw[i]) st.block[i] = false; if (st.block[i]) raw[i] = false; st.act[i] = raw[i]; }
        inp.hand = [raw[0], raw[1]]; inp.foot = [raw[2], raw[3]];
        return inp;
      }
      if (mode === 'pick') {
        for (const k in LIMB_OF) if (io.pressed(K[k])) { const i = LIMB_OF[k]; if (st.act[i]) { st.act[i] = false; inp.drop[i] = true; } else st.act[i] = true; } // 집기 / 다시 누르면 힘 빼기
        if (io.lmb) for (let i = 0; i < 4; i++) if (st.act[i]) attempt(s, i);                                  // 붙이기
        if (io.rmb) for (let i = 0; i < 4; i++) if (st.act[i]) { st.act[i] = false; inp.drop[i] = true; }      // 든 것 모두 힘 빼기
        // 다리 반동: 들고 있지도 디디고 있지도 않은 다리를 한쪽으로 보내거나 접는다. 키를 놓으면 힘이 빠진다(디뎌지지 않는다)
        const dir = (io.key(K.swingR) ? 1 : 0) - (io.key(K.swingL) ? 1 : 0), tuck = io.key(K.tuck), on = dir !== 0 || tuck;
        const c = s.p[0], hp = s.p[1], ux = (hp.x - c.x) / PHX.C.T, uy = (hp.y - c.y) / PHX.C.T;
        for (const i of [2, 3]) {
          if (st.act[i] || s.limb[i].mode === 'plant') { st.sw[i] = false; continue; }
          if (on) { st.sw[i] = true; inp.t[i] = tuck && !dir ? [hp.x + ux * 20, hp.y + uy * 20] : [hp.x + dir * 70, hp.y + (tuck ? 15 : 45)]; }
          else if (st.sw[i]) { st.sw[i] = false; inp.drop[i] = true; }
        }
      } else { // keys
        for (const side of ['l', 'r']) {
          for (const k of [side + 'h', side + 'f']) if (io.pressed(K[k])) {
            const i = LIMB_OF[k];
            if (st.act[i]) attempt(s, i);                                    // 같은 키를 다시: 접촉 시도
            else { const r = s.p[s.limb[i].root], e = s.p[2 + i]; st.act[i] = true; st.off[i] = [e.x - r.x, e.y - r.y]; }
            st.sel[side] = i;
          }
          if (io.pressed(K[side + 'Drop'])) { for (const i of side === 'l' ? [0, 2] : [1, 3]) if (st.act[i]) { st.act[i] = false; inp.drop[i] = true; } st.sel[side] = null; }
          const dx = (io.key(K[side + 'Right']) ? 1 : 0) - (io.key(K[side + 'Left']) ? 1 : 0), dy = (io.key(K[side + 'Down']) ? 1 : 0) - (io.key(K[side + 'Up']) ? 1 : 0), i = st.sel[side];
          st[side + 'dir'] = [dx, dy];
          if (i !== null && st.act[i] && (dx || dy)) {
            const lb = s.limb[i], o = st.off[i], n = Math.hypot(dx, dy);
            o[0] += dx / n * KEY_SPEED * dt; o[1] += dy / n * KEY_SPEED * dt;
            const l = Math.hypot(o[0], o[1]) || 1, m = Math.max(lb.min * 1.1, Math.min(lb.max * 0.97, l)); o[0] *= m / l; o[1] *= m / l;
          }
        }
        for (let i = 0; i < 4; i++) if (st.act[i]) { const r = s.p[s.limb[i].root]; inp.t[i] = [r.x + st.off[i][0], r.y + st.off[i][1]]; }
        // 힘주기 방향: 누르고 있는 방향키(양쪽 합). 없으면 위쪽
        let px = st.ldir[0] + st.rdir[0], py = st.ldir[1] + st.rdir[1]; if (!px && !py) py = -1;
        const n = Math.hypot(px, py); inp.px = s.p[0].x + px / n * 160; inp.py = s.p[0].y + py / n * 160;
      }
      for (let i = 0; i < 4; i++) {
        const reach = (st.act[i] && !st.tryNow[i]) || st.sw[i];
        if (i < 2) inp.hand[i] = reach; else inp.foot[i - 2] = reach;
        if (st.tryNow[i]) { st.tryNow[i] = false; st.pend[i] = true; }
      }
      return inp;
    }
    return { st, step, mode };
  }
  return { KEYMAP, LABEL, MODES, make, inRange };
})();
if (typeof module !== 'undefined') module.exports = CTRL;
