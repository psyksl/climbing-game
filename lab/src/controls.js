// 조작 방식(비교용 세 가지). 키 입력 → 물리 입력으로 바꾸는 층이며 화면과 무관하다(노드에서 시험 가능).
// 키를 바꾸려면 아래 KEYMAP을 고치거나, 게임 안에서 F2로 다시 지정한다.
'use strict';
const CTRL = (() => {
  const PHX = typeof PH !== 'undefined' ? PH : require('./physics.js');
  const KEYMAP = {
    // D안 "의도 조작"(v0.5 기본): 좌·우클릭 = 왼손·오른손을 보내기(닿으면 잡음), Shift+클릭 = 발. Space 누르고 있기 = 힘 모으기, 떼기 = 커서 쪽으로 던지기
    intent: { power: 'Space', foot: 'ShiftLeft', autoFeet: 'KeyF', autoShift: 'KeyG', assist: 'KeyV', cancel: 'KeyX' },
    // A안 "집기와 붙이기 분리": 손발 키로 떼어 집고(누르고 있지 않아도 커서를 따라옴), 좌클릭으로 붙인다
    pick: { lh: 'KeyQ', rh: 'KeyE', lf: 'KeyA', rf: 'KeyD', swingL: 'KeyZ', tuck: 'KeyX', swingR: 'KeyC', power: 'Space' },
    // B안 "키보드 좌우 분담": 왼손은 왼쪽 팔다리, 오른손은 오른쪽 팔다리. 방향키로 끝점을 움직이고 같은 키로 접촉 시도
    keys: { lh: 'KeyQ', lf: 'KeyZ', lUp: 'KeyW', lLeft: 'KeyA', lDown: 'KeyS', lRight: 'KeyD', lDrop: 'KeyE',
            rh: 'KeyU', rf: 'KeyM', rUp: 'KeyI', rLeft: 'KeyJ', rDown: 'KeyK', rRight: 'KeyL', rDrop: 'KeyO', power: 'Space' },
    // C안(v0.3 방식): 누르고 있는 동안 커서를 따라오고, 떼는 순간 붙는다
    hold: { lh: 'KeyQ', rh: 'KeyE', lf: 'KeyA', rf: 'KeyD', power: 'Space' },
  };
  const LABEL = { foot: '발 고르기(누른 채 클릭)', autoFeet: '자동 발 켬·끔', autoShift: '자동 체중 이동 켬·끔', assist: '닿으면 잡기 켬·끔', cancel: '들고 있는 손발 힘 빼기', lh: '왼손', rh: '오른손', lf: '왼발', rf: '오른발', swingL: '다리 왼쪽으로', tuck: '다리 접기', swingR: '다리 오른쪽으로', power: '힘주기',
    lUp: '왼쪽 ↑', lLeft: '왼쪽 ←', lDown: '왼쪽 ↓', lRight: '왼쪽 →', lDrop: '왼쪽 힘 빼기', rUp: '오른쪽 ↑', rLeft: '오른쪽 ←', rDown: '오른쪽 ↓', rRight: '오른쪽 →', rDrop: '오른쪽 힘 빼기' };
  const MODES = { intent: 'D안 · 의도 조작 (클릭으로 손을 보내고, Space로 모았다 던지기)', pick: 'A안 · 집기와 붙이기 분리 (키로 집고, 클릭으로 붙임)', keys: 'B안 · 키보드 좌우 분담 (GPT 제안)', hold: 'C안 · 누르는 동안 이동, 떼면 붙음 (v0.3)' };
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
    if (mode === 'intent') return makeIntent();
    return { st, step, mode };
  }
  // ---- D안: 의도 조작. 플레이어는 어느 손발을 어디로, 언제 던질지만 정하고 균형·발 위치·손 놓는 순간은 게임이 채운다
  const OPT = { autoFeet: true, autoShift: true, assist: true, handMode: 1, assistRange: 'near' }; // assistRange: 'near' 커서 근처 구간만 / 'ledge' 겨눈 턱 전체
  const P = { MOVE_STEP: 26, MOVE_GAIN: 0.55, MOVE_MARGIN: 0.95, ANGLE_MARGIN: 10, CATCH_SPAN: 28, REC_MARGIN: 22, REC_HOLD: 0.15, CATCH_R: 45, FOOT_CATCH_R: 30, SHIFT_T: 0.2, THROW_T: 0.32, REL_MIN: 0.03, REL_MAX: 0.14, CROUCH: 40, THROW_D: 250, FEET_V: 150, FULL_CHARGE: 0.6, ROCK_MAX: 0.45, GAIN0: 0.25, CROUCH_MODE: 'away', SWAY_V: 160, SWAY_MAX: 40 };
  function footCandidates(s, i, ot = null) { // ot: 다른 발이 가려는 곳(있으면) // 발을 디딜 만한 곳: 위를 향한 면, 다리가 닿는 곳, 엉덩이보다 아래
    const hp = s.p[1], L = PHX.C.L, side = i === 2 ? -1 : 1, other = s.limb[5 - i], op = s.p[2 + (5 - i)];
    const cx = hp.x + side * 12, cy = hp.y + 0.72 * L; let best = null;
    const ox = other.mode === 'plant' ? op.x : ot && !ot.swing ? ot.x : null;
    for (const pl of s.world) for (const e of pl.edges) {
      if (e.ny > -0.35) continue;
      const len = Math.hypot(e.bx - e.ax, e.by - e.ay), n = Math.max(1, Math.round(len / 6));
      for (let k = 0; k <= n; k++) {
        const x = e.ax + (e.bx - e.ax) * k / n, y = e.ay + (e.by - e.ay) * k / n;
        const d = Math.hypot(x - hp.x, y - hp.y); if (d > 0.93 * L || d < 1.2 * PHX.C.LMIN || y < hp.y + 8) continue; // 다리가 접히는 한계보다 가까운 곳은 디딜 수 없다
        if (other.mode === 'plant' && Math.hypot(x - op.x, y - op.y) < 14) continue;
        if (ox !== null && side * (x - ox) < -4) continue; // 다리를 꼬지 않는다: 왼발은 오른발(또는 오른발이 가려는 곳)보다 오른쪽에 두지 않는다
        let sc = Math.hypot(x - cx, y - cy) + (side * (x - hp.x) < -10 ? 25 : 0) + (other.mode === 'plant' && side * (x - op.x) < 0 ? 30 : 0); // 다리를 꼬지 않는다
        if (sc > 70) continue;
        if (!best || sc < best.sc) best = { x: x + e.nx * PHX.C.FOOT_R, y: y + e.ny * PHX.C.FOOT_R, sx: x, sy: y, sc, poly: pl.id };
      }
    }
    return best;
  }
  // 잡기 보조가 허용하는 곳. 'near': 커서에서 가장 가까운 잡을 곳 주변 ±CATCH_SPAN 구간(같은 지형), 'ledge': 그 지형 전체
  function aimSeg(s, io) {
    const a = PHX.nearestGrip(s.world, io.mx, io.my); if (!a || a.d > 60) return null;
    return { poly: a.poly, x: a.x, y: a.y, whole: OPT.assistRange === 'ledge' };
  }
  // true = 잡아도 됨, 숫자 = 허용 구간 밖에 닿음(구간 끝까지 거리), null = 겨눈 곳이 아님
  function catchAllowed(s, g, io) {
    const a = aimSeg(s, io);
    if (!a) return Math.hypot(g.x - io.mx, g.y - io.my) <= P.CATCH_SPAN ? true : null;
    if (g.poly !== a.poly) return null;
    if (a.whole) return true;
    const d = Math.hypot(g.x - a.x, g.y - a.y); return d <= P.CATCH_SPAN ? true : d - P.CATCH_SPAN;
  }
  // 몸통을 (dx,dy)만큼 옮겨도 되는가: 붙은 팔다리가 길이 범위(최소~최대의 95%) 안에 있고, 잡은 손이 미끄러질 각도(한계 - 10°)를 넘지 않아야 한다
  function moveOk(s, dx, dy) {
    const C = PHX.C, c = s.p[0], hp = s.p[1];
    for (const lb of s.limb) {
      if (lb.mode !== 'grip' && lb.mode !== 'plant') continue;
      const r = lb.arm ? c : hp, e = s.p[lb.end], x = r.x + dx - e.x, y = r.y + dy - e.y, L = Math.hypot(x, y);
      const cur = Math.hypot(r.x - e.x, r.y - e.y), grow = L > cur, shrink = L < cur;
      if (grow && L > lb.max * P.MOVE_MARGIN) return lb.arm ? '팔' : '다리';             // 이미 한계를 넘어 있으면 줄어드는 쪽만 허용
      if (shrink && L < lb.min * 1.15 + (lb.arm ? 12 : 0)) return lb.arm ? '팔' : '다리';
      if (lb.arm && lb.mode === 'grip') { const a = lb.anchor, cx = c.x + dx - a.x, cy = c.y + dy - a.y, l = Math.hypot(cx, cy) || 1;
        const hang = Math.acos(Math.max(-1, Math.min(1, (cx * -a.nx + cy * -a.ny) / l))) * 180 / Math.PI, push = 180 - hang, lim = PHX.GRIP[a.type].th - P.ANGLE_MARGIN;
        if (Math.min(hang, push) > lim) return '손 각도'; }
    }
    return null;
  }
  // 몸 싣기(모으는 중 A/D): 몸통 옮기기와 같은 한계(팔다리 길이·손 각도)를 본다.
  // 다만 두 손이 다 잡혀 있으면 가슴은 두 팔에 매달린 채 몸통이 기울어 엉덩이만 옆으로 갈 수 있으므로, 팔 길이 때문에 막힐 때는 디딘 다리만 본다
  function swayOk(s, dx) {
    const why = moveOk(s, dx, 0);
    if (why !== '팔' || !(s.limb[0].mode === 'grip' && s.limb[1].mode === 'grip')) return why;
    const hp = s.p[1];
    for (const i of [2, 3]) { const lb = s.limb[i]; if (lb.mode !== 'plant') continue; const e = s.p[2 + i], L = Math.hypot(hp.x + dx - e.x, hp.y - e.y), cur = Math.hypot(hp.x - e.x, hp.y - e.y);
      if (L > cur && L > lb.max * P.MOVE_MARGIN) return '다리'; if (L < cur && L < lb.min * 1.15) return '다리'; }
    return null;
  }
  function makeIntent() {
    const st = { mode: 'intent', act: [false, false, false, false], armT: [0, 0, 0, 0], mark: [false, false], manual: [false, false, false, false], auto: [null, null, null, null],
      tryNow: [false, false, false, false], pend: [false, false, false, false], block: [0, 0, 0, 0], staleT: [0, 0, 0, 0], cool: [0, 0, 0, 0],
      phase: 'idle', pt: 0, power: 1, move: null, shift: null, air: [], swingLegs: false, opt: OPT, last: '',
      rec: { hand: 1, foot: 3, pendH: null, pendF: null, tH: 0, tF: 0 }, sent: [], miss: [], seg: null };
    const K = KEYMAP.intent;
    const gripping = (s, i) => s.limb[i].mode === 'grip';
    function attempt(i) { st.tryNow[i] = true; }
    function detach(s, i) { st.act[i] = true; st.armT[i] = 0; st.auto[i] = null; }
    // 2번 방식의 추천: 커서까지 가깝고, 덜 매달려 있고, 이미 떨어져 있는 손을 고른다. 다른 손이 확실히(REC_MARGIN) 낫고 그 상태가 REC_HOLD초 이어질 때만 바꾼다
    function recScore(s, i, io) {
      const lb = s.limb[i], r = s.p[lb.root], side = i % 2 ? 1 : -1, sx = r.x + side * 10, d = Math.hypot(io.mx - sx, io.my - r.y);
      let sc = d;
      if (lb.mode === 'grip' || lb.mode === 'plant') sc += 40 * Math.max(0, lb.arm ? lb.tens : -lb.force) / PHX.W;
      else sc -= 50; // 이미 떨어져 있는 손발이 우선
      const o = s.limb[i < 2 ? 1 - i : 5 - i];
      if ((lb.mode === 'grip' || lb.mode === 'plant') && !(o.mode === 'grip' || o.mode === 'plant') && i < 2) sc += 150; // 마지막 남은 손은 되도록 놓지 않는다
      return sc;
    }
    function updateRec(s, io, dt) {
      for (const [key, a, b, pk, tk] of [['hand', 0, 1, 'pendH', 'tH'], ['foot', 2, 3, 'pendF', 'tF']]) {
        const cur = st.rec[key], other = cur === a ? b : a;
        if (recScore(s, other, io) < recScore(s, cur, io) - P.REC_MARGIN) { if (st.rec[pk] !== other) { st.rec[pk] = other; st.rec[tk] = 0; } st.rec[tk] += dt; if (st.rec[tk] >= P.REC_HOLD) { st.rec[key] = other; st.rec[pk] = null; } }
        else st.rec[pk] = null;
      }
    }
    function step(s, io, dt) {
      const C = PHX.C, c = s.p[0], hp = s.p[1];
      st.seg = aimSeg(s, io);
      const inp = { cx: io.mx, cy: io.my, hand: [false, false], foot: [false, false], power: false, t: [null, null, null, null], drop: [false, false, false, false] };
      st.air.length = 0;
      for (let i = 0; i < 4; i++) if (st.pend[i]) { st.pend[i] = false; const m = s.limb[i].mode; if (m === 'grip' || m === 'plant') { st.act[i] = false; st.manual[i] = false; st.auto[i] = null; } else { st.block[i] = s.t + 0.25; if (st.auto[i]) st.auto[i] = null; } }
      for (let i = 0; i < 4; i++) { if (st.act[i]) st.armT[i] += dt; if (st.act[i] && s.limb[i].mode === 'free' && !st.pend[i] && st.armT[i] > 0.05) st.act[i] = true; }
      st.sent.length = 0; st.miss.length = 0;
      // (보조 켜고 끄기는 화면 쪽에서 항상 받는다: 떨어지는 중에도 놓치지 않게)
      if (io.pressed('cancel')) {
        if (st.mark[0] || st.mark[1]) { st.mark = [false, false]; st.last = '놓을 손 지정 모두 취소'; }
        else for (let i = 0; i < 4; i++) if (st.act[i]) { st.act[i] = false; st.manual[i] = false; inp.drop[i] = true; }
      }
      updateRec(s, io, dt);
      for (const i of [0, 1]) if (st.mark[i] && s.limb[i].mode !== 'grip') st.mark[i] = false;
      // Space: 누르고 있으면 힘 모으기, 떼면 던지기
      const sp = io.down('power');
      const spDown = sp && !st.spPrev; st.spPrev = sp;
      if (spDown && st.phase !== 'charge') { if (st.phase === 'throw') st.mark = [false, false]; if (st.shift) { detach(s, st.shift.i); st.shift = null; } st.phase = 'charge'; st.pt = 0; st.anchor = [c.x, c.y]; st.sway = 0; st.swayUsed = false;
        // A/D를 누른 채 모으기 시작하면: 자동으로 목표 반대쪽에 싣지 않고, 지금 엉덩이 속도를 이어 가는 자리에서 시작한다
        if (io.down('moveLeft') || io.down('moveRight')) { st.swayUsed = true; st.sway = Math.max(-P.SWAY_MAX, Math.min(P.SWAY_MAX, hp.vx * 0.15)); } }
      if (!sp && st.phase === 'charge') { st.power = Math.max(0.15, Math.min(1, (st.pt - 0.04) / P.FULL_CHARGE));
        // 놓을 손을 정하지 않았고 아직 붙든 손이 있으면 뛰지 않는다: 발을 디딘 채 몸만 싣는 작은 반동으로 제한
        st.jump = st.mark[0] || st.mark[1] || !(gripping(s, 0) || gripping(s, 1));
        // 실패 안내용: 뗀 순간 겨눈 곳(잡기 보조가 기준으로 삼는 점, 없으면 커서)
        { const a = aimSeg(s, io); st.aimAt = a ? { x: a.x, y: a.y } : { x: io.mx, y: io.my }; }
        if (!st.jump) st.power = Math.min(st.power, P.ROCK_MAX); st.phase = 'throw'; st.pt = 0; st.tAnchor = [c.x, c.y]; } // 짧게 누르면 작은 반동, 오래 누르면 힘껏 던지기
      // 클릭: 손발 하나에 대한 의도
      // 입력 → 손발: 1번 방식은 입력마다 손이 정해져 있고, 2번 방식은 누르는 순간의 추천 손(또는 그 반대 손)으로 확정한다
      const footMod = io.down('foot') || io.pressed('foot');
      const ins = OPT.handMode === 1 ? [['sendL', 0], ['sendR', 1]] : [['sendBest', 'best'], ['sendOther', 'other']];
      for (const [id, which] of ins) {
        if (!io.pressed(id)) continue;
        const foot = footMod || io.pressedShift(id);
        let side = which;
        if (which === 'best') side = (foot ? st.rec.foot : st.rec.hand) % 2;
        if (which === 'other') side = 1 - (foot ? st.rec.foot : st.rec.hand) % 2;
        const i = foot ? 2 + side : side, lb = s.limb[i];
        st.sent.push({ i, id, t: s.t, mode: lb.mode, phase: st.phase });
        if (st.phase === 'charge' && i < 2 && lb.mode === 'grip') { st.mark[i] = !st.mark[i]; st.last = st.mark[i] ? `${['왼손', '오른손'][i]}: 도약할 때 놓음` : `${['왼손', '오른손'][i]}: 놓기 지정 취소`; continue; }
        if (lb.mode === 'grip' || lb.mode === 'plant') {
          const other = 1 - i;
          if (i < 2 && OPT.autoShift && st.phase === 'idle' && gripping(s, other) && !st.shift) { st.shift = { i, t: 0 }; st.phase = 'shift'; }
          else detach(s, i);
          if (i >= 2) st.manual[i] = true;
        } else if (st.act[i]) { // 이미 보내는 중: 지금 닿아 있으면 바로 잡기(보조를 끈 경우의 잡기)
          if (CTRL.inRange(s, i)) attempt(i);
        } else { detach(s, i); if (i >= 2) st.manual[i] = true; }
      }
      const dx0 = io.mx - c.x, dy0 = io.my - c.y, dl = Math.hypot(dx0, dy0) || 1, ux = dx0 / dl, uy = dy0 / dl;
      const anyFoot = s.limb[2].mode === 'plant' || s.limb[3].mode === 'plant', anyHold = s.limb.some(l => l.mode === 'grip' || l.mode === 'plant');
      st.swayKey = 0;
      if (st.phase === 'charge') { st.pt += dt; inp.power = true; const A = st.anchor;
        // 2단계 ②: 모으는 동안 A/D로 몸을 좌우로 싣는다(웅크림·세기는 Space가 정한다). 누른 순간 자리에서 ±SWAY_MAX px까지, 떼면 그 자리를 유지
        const sk = (io.down('moveRight') ? 1 : 0) - (io.down('moveLeft') ? 1 : 0); st.swayKey = sk;
        // 팔다리 길이·손 각도 한계에 닿으면 더 싣지 않는다(다리가 다 펴져 발이 떨어지지 않게). 반대쪽으로 되돌리는 것은 언제나 된다
        st.swayBlock = sk && Math.sign(st.sway || sk) === sk ? swayOk(s, sk * 8) : null;
        if (sk && !st.swayBlock) st.sway = Math.max(-P.SWAY_MAX, Math.min(P.SWAY_MAX, st.sway + sk * P.SWAY_V * dt));
        if (P.CROUCH_MODE === 'down') { inp.px = A[0] + st.sway; inp.py = A[1] + P.CROUCH; } else { inp.px = A[0] + st.sway - (st.swayUsed ? 0 : ux * P.CROUCH * 0.6); inp.py = A[1] + P.CROUCH * 0.8; } } // 누른 순간의 자리 기준으로 목표 쪽 반대·아래로 몸을 싣는다
      else if (st.phase === 'throw') {
        st.pt += dt; inp.power = true; const jumpT = st.jump, D = jumpT ? P.THROW_D : 10 + (P.THROW_D - 10) * st.power ** 3, A = st.tAnchor, ax = io.mx - A[0], ay = io.my - A[1], al = Math.hypot(ax, ay) || 1; inp.px = A[0] + ax / al * D; inp.py = A[1] + ay / al * D; // 뗀 순간의 자리 기준
        inp.gain = jumpT ? P.GAIN0 + (1 - P.GAIN0) * st.power : 0.3 + 0.7 * st.power; // 뛸 때는 다리를 끝까지 펴되, 미는 빠르기를 모은 정도에 비례시킨다
        st.lastGain = inp.gain; // 시험용: 실제로 물리에 넘긴 값
        for (const i of [0, 1]) if (st.mark[i] && gripping(s, i)) { // 표시한 손은 게임이 놓는 순간을 고른다: 팔이 몸을 붙잡기 시작하거나, 늦어도 REL_MAX초
          const restrain = st.pt > 0.04 && s.limb[i].tens > 0.15 * PHX.W, feetOff = !anyFoot;
          if (st.pt >= P.REL_MIN && (restrain || feetOff || st.pt >= P.REL_MAX)) { st.mark[i] = false; detach(s, i); }
        }
        // 던지기는 정한 시간 동안. 발이 아직 디뎌져 있으면(작은 반동) 몸이 목표에서 멈출 때까지 붙든다
        const settled = Math.hypot(c.vx, c.vy) < 60;
        if (!anyHold || (st.pt >= P.THROW_T * (0.5 + 0.5 * st.power) && (!anyFoot || settled || st.pt > 0.6))) { st.phase = 'idle'; st.mark = [false, false]; }
      } else if (st.phase === 'shift') { // 손을 떼기 전에 몸을 남은 지지점 쪽으로 먼저 옮긴다
        const sh = st.shift; sh.t += dt; const o = s.limb[1 - sh.i].anchor;
        if (!o) { detach(s, sh.i); st.shift = null; st.phase = 'idle'; } else {
        const xs = [o.x]; for (const f of [2, 3]) if (s.limb[f].mode === 'plant') xs.push(s.p[2 + f].x);
        // 발이 디뎌져 있으면 지지점들 사이에 이미 있을 때 옮기지 않는다(밖에 있을 때만 가장 가까운 끝으로). 손만 남으면 그 손 아래로
        const tx = xs.length > 1 ? Math.max(Math.min(...xs), Math.min(Math.max(...xs), c.x)) : o.x;
        inp.power = true; inp.px = tx; inp.py = c.y;
        if ((sh.t > 0.06 && Math.abs(c.x - tx) < 6 && Math.abs(c.vx) < 40) || sh.t >= P.SHIFT_T) { detach(s, sh.i); st.shift = null; st.phase = 'idle'; } } // 옮기는 동안 남은 손마저 떨어지면 바로 뗀다
      }
      // 몸통 WASD: 누르는 동안 붙은 팔다리가 몸을 그 방향으로 옮기고, 떼면 그 자리에서 버틴다. 길이·각도 한계를 넘는 쪽으로는 가지 않는다
      st.move = null;
      const mx = (io.down('moveRight') ? 1 : 0) - (io.down('moveLeft') ? 1 : 0), my = (io.down('moveDown') ? 1 : 0) - (io.down('moveUp') ? 1 : 0);
      if ((mx || my) && st.phase !== 'charge' && st.phase !== 'throw' && anyHold) {
        const n = Math.hypot(mx, my), ux2 = mx / n, uy2 = my / n; let k = P.MOVE_STEP, why = null, dx = ux2, dy = uy2;
        // 좌우로만 누를 때 팔이 다 펴져 막히면, 다리를 펴서 몸을 조금 들며 옆으로 간다(손 아래 원호를 따라 엉덩이를 빼는 움직임)
        const dirs = my === 0 ? [0, 0.35, 0.7, 1.2, 2].map(t => [ux2, -t]) : [[ux2, uy2]];
        search: for (const [a0, b0] of dirs) { const l = Math.hypot(a0, b0); for (const f of [1, 0.6, 0.3, 0.12]) { why = moveOk(s, a0 / l * P.MOVE_STEP * f, b0 / l * P.MOVE_STEP * f); if (!why) { k = P.MOVE_STEP * f; dx = a0 / l; dy = b0 / l; break search; } } }
        // 위로 올라갈 때 아래 발판에 디딘 자동 발이 다 펴져 막으면, 손이 붙어 있는 한 그 발을 엉덩이 아래로 당겨 올리고 올라간다(자동 발이 곧 새 자리를 고른다)
        if (why === '다리' && my < 0 && (gripping(s, 0) || gripping(s, 1))) {
          const lift = [2, 3].filter(i => { const lb = s.limb[i], e = s.p[2 + i]; return lb.mode === 'plant' && !st.manual[i] && Math.hypot(hp.x + ux2 * P.MOVE_STEP * 0.3 - e.x, hp.y + uy2 * P.MOVE_STEP * 0.3 - e.y) > lb.max * P.MOVE_MARGIN; });
          if (lift.length) { for (const i of lift) { st.auto[i] = { x: hp.x + (i === 2 ? -10 : 10), y: hp.y + 0.5 * C.L }; st.block[i] = s.t + 0.25; } why = null; k = P.MOVE_STEP * 0.3; dx = ux2; dy = uy2; }
        }
        st.move = { dx, dy, blocked: why };
        if (!why) { inp.power = true; inp.move = true; inp.px = c.x + dx * k; inp.py = c.y + dy * k; inp.gain = P.MOVE_GAIN; if (st.shift) { detach(s, st.shift.i); st.shift = null; st.phase = 'idle'; } }
      }
      // 발이 하나도 디뎌지지 않은 채 모으기·던지기: 다리를 접었다가 커서 쪽으로 차서 몸에 반동을 준다(엉덩이·상체 반동)
      st.swingLegs = !anyFoot && (st.phase === 'charge' || st.phase === 'throw') && (gripping(s, 0) || gripping(s, 1));
      // 자동 발
      const handOn = gripping(s, 0) || gripping(s, 1), calm = Math.hypot(c.vx, c.vy) < P.FEET_V;
      for (const i of [2, 3]) {
        const lb = s.limb[i];
        if (st.manual[i]) continue;
        if (st.swingLegs) { st.auto[i] = { swing: true }; continue; }
        if (st.auto[i] && st.auto[i].swing) { st.auto[i] = null; inp.drop[i] = true; continue; }
        if (!OPT.autoFeet || !handOn || st.phase === 'charge' || st.phase === 'throw') { if (st.auto[i]) { st.auto[i] = null; inp.drop[i] = true; } continue; }
        if (lb.mode === 'plant') {
          const e = s.p[2 + i], len = Math.hypot(e.x - hp.x, e.y - hp.y), bad = len > 0.96 * C.L || Math.abs(e.x - hp.x) > 0.8 * C.L;
          st.staleT[i] = bad ? st.staleT[i] + dt : 0;
          const otherOk = (gripping(s, 0) && gripping(s, 1)) || s.limb[5 - i].mode === 'plant';
          if (st.staleT[i] > 0.3 && otherOk && s.t > st.cool[i] && calm) { const cand = footCandidates(s, i, st.auto[5 - i]); if (cand && Math.hypot(cand.x - e.x, cand.y - e.y) > 15) { st.auto[i] = cand; st.cool[i] = s.t + 0.8; st.staleT[i] = 0; } }
          continue;
        }
        if (!calm || s.t < st.block[i]) continue;
        const cand = footCandidates(s, i, st.auto[5 - i]);
        if (!cand) { if (st.auto[i]) { st.auto[i] = null; inp.drop[i] = true; } continue; }
        st.auto[i] = cand;
      }
      // 닿으면 붙기: 보낸 손은 커서 근처의 잡을 곳에 닿는 순간, 자동 발은 고른 곳에 닿는 순간
      for (let i = 0; i < 4; i++) {
        const lb = s.limb[i], e = s.p[2 + i];
        if (lb.mode !== 'reach' || st.tryNow[i] || s.t < st.block[i]) continue;
        if (i < 2 && st.act[i] && OPT.assist && st.armT[i] > 0.06) {
          const g = PHX.nearestGrip(s.world, e.x, e.y);
          if (g && g.d <= C.GRAB_R) { const ok = catchAllowed(s, g, io); if (ok === true) attempt(i); else if (ok !== null) st.miss.push({ i, x: g.x, y: g.y, d: ok }); }
        }
        if (i >= 2 && st.act[i] && st.manual[i]) { const q = PHX.nearestSurface(s.world, e.x, e.y); if (q && q.d <= C.PLANT_R && q.ny < 0.3 && Math.hypot(q.x - io.mx, q.y - io.my) <= P.FOOT_CATCH_R && Math.hypot(e.vx, e.vy) < C.PLANT_V) attempt(i); }
        if (i >= 2 && st.auto[i] && !st.auto[i].swing) { const a = st.auto[i]; if (Math.hypot(e.x - a.x, e.y - a.y) < 8 && Math.hypot(e.vx - hp.vx, e.vy - hp.vy) < C.PLANT_V) attempt(i); }
      }
      // 물리 입력 만들기
      for (let i = 0; i < 4; i++) {
        let reach = st.act[i] || (i >= 2 && !!st.auto[i]);
        if (i >= 2 && st.auto[i]) inp.t[i] = st.auto[i].swing
          ? (st.phase === 'charge' ? [hp.x - ux * 35, hp.y + 25] : [hp.x + ux * 80, hp.y + uy * 80 + 20])
          : [st.auto[i].x, st.auto[i].y];
        else if (st.act[i]) inp.t[i] = [io.mx, io.my];
        if (st.tryNow[i]) { reach = false; st.tryNow[i] = false; st.pend[i] = true; }
        if (i < 2) inp.hand[i] = reach; else inp.foot[i - 2] = reach;
      }
      return inp;
    }
    return { st, step, mode: 'intent' };
  }
  return { KEYMAP, LABEL, MODES, OPT, P, make, inRange, footCandidates, catchAllowed, aimSeg };
})();
if (typeof module !== 'undefined') module.exports = CTRL;
