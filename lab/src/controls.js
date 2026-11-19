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
  const OPT = { autoFeet: true, autoShift: true, assist: true, handMode: 1, assistRange: 'near', autoLoad: false }; // autoLoad: 모을 때 목표 반대쪽으로 자동으로 싣기(비교용. 기본은 끔 = Space는 아래로 웅크리기만, 좌우는 A/D) // assistRange: 'near' 커서 근처 구간만 / 'ledge' 겨눈 턱 전체
  const P = { MOVE_STEP: 26, MOVE_GAIN: 0.55, MOVE_MARGIN: 0.95, ANGLE_MARGIN: 10, CATCH_SPAN: 28, REC_MARGIN: 22, REC_HOLD: 0.15, CATCH_R: 45, FOOT_CATCH_R: 30, FOOT_LAND_R: 18, FOOT_REACH_K: 1.1, REJ_MAX: 2, SHIFT_T: 0.2, THROW_T: 0.32, REL_MIN: 0.03, REL_MAX: 0.14, CROUCH: 40, THROW_D: 250, FEET_V: 150, FULL_CHARGE: 0.6, ROCK_MAX: 0.45, GAIN0: 0.25, CROUCH_MODE: 'away', SWAY_V: 160, SWAY_MAX: 40, LEAN_MAX: 24, DIP_V: 160, DIP_MAX: 28, PULL_T: 0.45, SPLIT_MAX: 58 }; // SPLIT_MAX: 거의 편 다리가 몸통 아래 방향에서 옆으로 벌어질 수 있는 각도(°). 넘으면 자동 발이 그 발을 다시 디딘다
  const handHolds = (s, poly) => [0, 1].some(k => s.limb[k].mode === 'grip' && s.limb[k].anchor.poly === poly);
  function footCandidates(s, i, ot = null) { // ot: 다른 발이 가려는 곳(있으면) // 발을 디딜 만한 곳: 위를 향한 면, 다리가 닿는 곳, 엉덩이보다 아래
    const hp = s.p[1], hj = PHX.rootPos(s, i), L = PHX.C.L, side = i === 2 ? -1 : 1, other = s.limb[5 - i], op = s.p[2 + (5 - i)]; // hj: 이 다리가 붙은 골반 자리(기존 두 몸은 엉덩이 점)
    const cx = hp.x + side * 12, cy = hp.y + 0.72 * L; let best = null;
    const ox = other.mode === 'plant' ? op.x : ot && !ot.swing ? ot.x : null;
    for (const pl of s.world) for (const e of pl.edges) {
      if (e.ny > -0.35) continue;
      if (handHolds(s, pl.id)) continue; // 손으로 잡고 있는 턱에는 발을 올리지 않는다(벽의 턱은 발판이 아니다. 그 위에 올라서는 것은 말이 안 되는 움직임)
      const len = Math.hypot(e.bx - e.ax, e.by - e.ay), n = Math.max(1, Math.round(len / 6));
      for (let k = 0; k <= n; k++) {
        const x = e.ax + (e.bx - e.ax) * k / n, y = e.ay + (e.by - e.ay) * k / n;
        const d = Math.hypot(x - hj.x, y - hj.y); if (d > 0.93 * L || d < 1.2 * PHX.C.LMIN || y < hp.y + 8) continue; // 다리가 접히는 한계보다 가까운 곳은 디딜 수 없다
        if (PHX.C.JOINT && PHX.hipAngle((s.p[0].x - hp.x) / PHX.C.T, (s.p[0].y - hp.y) / PHX.C.T, s.limb[i], x - hj.x, y - hj.y).over > -5) continue; // 관절 몸: 고관절 가동 범위(여유 5°) 안의 자리만
        if (other.mode === 'plant' && Math.hypot(x - op.x, y - op.y) < 14) continue;
        if (ox !== null && side * (x - ox) < -4) continue; // 다리를 꼬지 않는다: 왼발은 오른발(또는 오른발이 가려는 곳)보다 오른쪽에 두지 않는다
        let sc = Math.hypot(x - cx, y - cy) + (side * (x - hp.x) < -10 ? 25 : 0) + (other.mode === 'plant' && side * (x - op.x) < 0 ? 30 : 0); // 다리를 꼬지 않는다
        if (sc > 70) continue;
        if (!best || sc < best.sc) best = { x: x + e.nx * PHX.C.FOOT_R, y: y + e.ny * PHX.C.FOOT_R, sx: x, sy: y, sc, poly: pl.id };
      }
    }
    return best;
  }
  // 발을 직접 보낼 때 겨누는 자리(v0.15.0): 조준점 둘레(FOOT_CATCH_R)의 면 가운데 "올라설 수 있는 면"(위를 향한 면)을 먼저 고른다.
  // 가파른 옆면이 조준점에 더 가깝더라도 바로 옆의 평평한 윗면을 고른다(바위 옆의 작은 돌출부 같은 발 자리). 둘레에 평평한 면이 없으면 가장 가까운 면이다.
  // 전에는 발이 조준점으로 가다가 먼저 닿는 면에 디뎠다 → 돌출부를 겨눠도 그 옆의 가파른 바위 면에 디디고 미끄러져 떨어졌다
  function footAim(s, mx, my) {
    let best = null;
    for (const pl of s.world) for (const e of pl.edges) { if (e.ny >= 0.3) continue; // 아래를 향한 면(천장)에는 디딜 수 없다
      const dx = e.bx - e.ax, dy = e.by - e.ay, t = Math.max(0, Math.min(1, ((mx - e.ax) * dx + (my - e.ay) * dy) / (dx * dx + dy * dy))), qx = e.ax + dx * t, qy = e.ay + dy * t, d = Math.hypot(mx - qx, my - qy);
      if (d > P.FOOT_CATCH_R) continue; const sc = d + 40 * (1 + e.ny);                // 가파를수록 뒤로: 윗면(ny = -1)은 그대로, 곧추선 면(ny = 0)은 40px 먼 것으로 친다
      if (!best || sc < best.sc) best = { sc, d, sx: qx, sy: qy, e, poly: pl.id }; }
    if (!best) return null;
    // 그 자리에 발을 놓았을 때 물리가 같은 면에 디디게 한다: 옆의 다른 면이 더 가깝게 잡히는 자리면 면의 가운데 쪽으로 조금씩 옮긴다
    const e = best.e, R = PHX.C.FOOT_R, cxm = (e.ax + e.bx) / 2, cym = (e.ay + e.by) / 2; let x = best.sx, y = best.sy;
    for (let k = 0; k < 8; k++) { const q = PHX.nearestSurface(s.world, x + e.nx * R, y + e.ny * R); if (q && q.poly === best.poly && Math.abs(q.nx - e.nx) < 0.02 && Math.abs(q.ny - e.ny) < 0.02) break; x += (cxm - x) * 0.3; y += (cym - y) * 0.3; }
    return { x: x + e.nx * R, y: y + e.ny * R, sx: x, sy: y, nx: e.nx, ny: e.ny, poly: best.poly, flat: e.ny <= -0.7, ax: e.ax, ay: e.ay, bx: e.bx, by: e.by };
  }
  // 한 발이 (x, y)에 닿을 수 있는가(v0.16.2, GPT 검토 N2): len = 다리 길이 안, hip = 고관절 범위 안, ok = 둘 다. 지금 자세 기준의 판정이다(몸을 옮기면 바뀐다).
  // "닿는 범위 안"일 뿐 디딤 성공을 보장하지 않는다(디딜 면·빠르기는 실제로 닿을 때 판정). 화면의 발 미리보기와 조작의 "닿지 않음" 안내가 이 함수 하나를 쓴다
  function footReach(s, i, x, y) {
    const C = PHX.C, hj = PHX.rootPos(s, i), lb = s.limb[i], dx = x - hj.x, dy = y - hj.y, len = Math.hypot(dx, dy) <= lb.max * P.FOOT_REACH_K; // 몸이 뻗는 발을 따라가므로 다리 길이보다 조금 먼 곳까지 닿는다(foot_preview_study.js로 잰 값)
    const hip = !C.JOINT || PHX.hipAngle((s.p[0].x - s.p[1].x) / C.T, (s.p[0].y - s.p[1].y) / C.T, lb, dx, dy).over <= 0;
    return { len, hip, ok: len && hip };
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
      const r = PHX.rootPos(s, lb.i), e = s.p[lb.end], x = r.x + dx - e.x, y = r.y + dy - e.y, L = Math.hypot(x, y);
      const cur = Math.hypot(r.x - e.x, r.y - e.y), grow = L > cur, shrink = L < cur;
      if (grow && L > lb.max * P.MOVE_MARGIN) return lb.arm ? '팔' : '다리';             // 이미 한계를 넘어 있으면 줄어드는 쪽만 허용
      if (shrink && L < lb.min * 1.15 + (lb.arm ? 12 : 0)) return lb.arm ? '팔' : '다리';
      if (lb.arm && lb.mode === 'grip') { const a = lb.anchor, cx = r.x + dx - a.x, cy = r.y + dy - a.y, l = Math.hypot(cx, cy) || 1;
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
    for (const i of [2, 3]) { const lb = s.limb[i]; if (lb.mode !== 'plant') continue; const hj = PHX.rootPos(s, i), e = s.p[2 + i], L = Math.hypot(hj.x + dx - e.x, hj.y - e.y), cur = Math.hypot(hj.x - e.x, hj.y - e.y);
      if (L > cur && L > lb.max * P.MOVE_MARGIN) return '다리'; if (L < cur && L < lb.min * 1.15) return '다리'; }
    return null;
  }
  // 관절 몸: 자세 풀이가 준 목표 자세에서 잡은 손이 미끄러질 각도(한계 - 10°)를 넘는가
  function poseSlips(s, po, skip) { // skip = 하중을 뺄 손(그 손의 각도는 보지 않는다)
    for (const i of [0, 1]) { const lb = s.limb[i]; if (i === skip || lb.mode !== 'grip' || !po.g[i]) continue;
      const r = PHX.rootPos(s, i), a = lb.anchor, x = r.x + po.g[i][0] - a.x, y = r.y + po.g[i][1] - a.y, l = Math.hypot(x, y) || 1;
      const hang = Math.acos(Math.max(-1, Math.min(1, (x * -a.nx + y * -a.ny) / l))) * 180 / Math.PI;
      const x0 = r.x - a.x, y0 = r.y - a.y, l0 = Math.hypot(x0, y0) || 1, hang0 = Math.acos(Math.max(-1, Math.min(1, (x0 * -a.nx + y0 * -a.ny) / l0))) * 180 / Math.PI;
      const lim = PHX.GRIP[a.type].th - P.ANGLE_MARGIN, bad = v => Math.min(v, 180 - v) > lim;
      if (bad(hang) && Math.min(hang, 180 - hang) > Math.min(hang0, 180 - hang0)) return i + 1; } // 이미 넘어 있으면 더 나빠지는 쪽만 막는다. 돌려주는 값: 막는 손(1 = 왼손, 2 = 오른손), 없으면 0
    return 0;
  }
  // 관절 몸: 몸통을 (dx,dy)만큼 옮기려는 의도를 자세로 푼다. 돌려주는 값: { po(목표 자세) | null, why(막힌 이유), hx·hy(엉덩이가 실제로 갈 변위) }
  function poseMove(s, dx, dy) {
    const hp = s.p[1], c = s.p[0], n = Math.hypot(dx, dy) || 1; let why = null, hand = null;
    for (const f of [1, 0.5, 0.25]) {
      const po = PHX.solvePose(s, [dx * f, dy * f], [dx * f, dy * f]);
      { const sl = poseSlips(s, po); if (sl) { why = '손 각도'; hand = sl - 1; continue; } }
      const hx = po.hp[0] - hp.x, hy = po.hp[1] - hp.y, cx = po.c[0] - c.x, cy = po.c[1] - c.y;
      const prog = Math.max((hx * dx + hy * dy) / n, (cx * dx + cy * dy) / n); // 원하는 방향으로 엉덩이나 가슴이 실제로 가는 거리
      if (prog < 0.15 * n * f || prog < 1.2) { why = po.hitLeg > po.hitArm ? '다리' : '팔'; continue; }
      return { po, why: null, hx, hy };
    }
    return { po: null, why, hand, hx: 0, hy: 0 }; // hand = 각도 한계로 막은 손(왼손 0, 오른손 1)
  }
  function makeIntent() {
    const st = { mode: 'intent', act: [false, false, false, false], armT: [0, 0, 0, 0], mark: [false, false], manual: [false, false, false, false], auto: [null, null, null, null],
      tryNow: [false, false, false, false], pend: [false, false, false, false], block: [0, 0, 0, 0], staleT: [0, 0, 0, 0], cool: [0, 0, 0, 0], placed: [false, false, false, false], rej: [null, null, null, null], gaveUp: null, // placed = 플레이어가 직접 디딘 발(자동 발이 다시 디디지 않는다)
      trail: [false, false], phase: 'idle', pt: 0, power: 1, move: null, shift: null, air: [], swingLegs: false, opt: OPT, last: '',
      rec: { hand: 1, foot: 3, pendH: null, pendF: null, tH: 0, tF: 0 }, sent: [], miss: [], seg: null };
    const K = KEYMAP.intent;
    const gripping = (s, i) => s.limb[i].mode === 'grip';
    function attempt(i) { st.tryNow[i] = true; }
    function detach(s, i) { st.act[i] = true; st.armT[i] = 0; st.auto[i] = null; st.rej[i] = null; } // 새로 보낼 때마다 거부 횟수를 지운다
    // 2번 방식의 추천: 커서까지 가깝고, 덜 매달려 있고, 이미 떨어져 있는 손을 고른다. 다른 손이 확실히(REC_MARGIN) 낫고 그 상태가 REC_HOLD초 이어질 때만 바꾼다
    function recScore(s, i, io) {
      const lb = s.limb[i], r = PHX.rootPos(s, i), side = i % 2 ? 1 : -1, sx = r.x + (lb.k ? 0 : side * 10), d = Math.hypot(io.mx - sx, io.my - r.y);
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
      for (let i = 2; i < 4; i++) if (s.limb[i].mode !== 'plant') st.placed[i] = false; // 직접 디딘 발이 떨어지면 다시 자동 발이 맡는다
      for (let i = 0; i < 4; i++) if (st.pend[i]) { st.pend[i] = false; const m = s.limb[i].mode; if (m === 'plant' && st.manual[i]) st.placed[i] = true; if (m === 'grip' || m === 'plant') { st.act[i] = false; st.manual[i] = false; st.auto[i] = null; st.rej[i] = null; } else { st.block[i] = s.t + 0.25; if (st.auto[i]) st.auto[i] = null;
        // 거부된 접촉(v0.16.4): 같은 자리(12px 안)에서 REJ_MAX번 거부되면 다시 시도하지 않고 그 손발을 그만둔다(발이면 자동 발이 맡는다). 전에는 0.25초마다 끝없이 다시 디뎠다 떨어졌다
        const e = s.p[s.limb[i].end], hang = s.events.some(v => v.type === 'footoff' && v.limb === i && v.hang), q = st.rej[i];
        if (q && Math.hypot(e.x - q.x, e.y - q.y) < 12) q.n++; else st.rej[i] = { x: e.x, y: e.y, n: 1 };
        if (st.rej[i].n >= P.REJ_MAX && st.act[i]) { st.act[i] = false; st.manual[i] = false; inp.drop[i] = true; st.gaveUp = { i, t: s.t, why: hang ? 'hang' : 'rej' }; st.rej[i] = null; } } }
      for (let i = 0; i < 4; i++) { if (st.act[i]) st.armT[i] += dt; if (st.act[i] && s.limb[i].mode === 'free' && !st.pend[i] && st.armT[i] > 0.05) st.act[i] = true; }
      st.sent.length = 0; st.miss.length = 0;
      for (const i of [0, 1]) if (st.trail[i] && s.limb[i].mode === 'reach') { st.trail[i] = false; st.act[i] = false; inp.drop[i] = true; } // 놓기만 하는 손: 붙은 것을 뗀 다음 프레임에 힘을 뺀다
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
      if (spDown && st.phase !== 'charge') { if (st.phase === 'throw') st.mark = [false, false]; if (st.shift) { detach(s, st.shift.i); st.shift = null; } st.phase = 'charge'; st.pt = 0; st.anchor = [c.x, c.y]; st.sway = 0; st.dip = 0; }
      if (!sp && st.phase === 'charge') { st.pullHand = undefined; st.power = Math.max(0.15, Math.min(1, (st.pt - 0.04) / P.FULL_CHARGE));
        // 놓을 손을 정하지 않았고 아직 붙든 손이 있으면 뛰지 않는다: 발을 디딘 채 몸만 싣는 작은 반동으로 제한
        st.jump = st.mark[0] || st.mark[1] || !(gripping(s, 0) || gripping(s, 1));
        // 실패 안내용: 뗀 순간 겨눈 곳(잡기 보조가 기준으로 삼는 점, 없으면 커서)
        { const a = aimSeg(s, io); st.aimAt = a ? { x: a.x, y: a.y } : { x: io.mx, y: io.my }; }
        if (!st.jump) st.power = Math.min(st.power, P.ROCK_MAX); st.phase = 'throw'; st.pt = 0; st.tAnchor = [c.x, c.y]; } // 짧게 누르면 작은 반동, 오래 누르면 힘껏 던지기
      // 클릭: 손발 하나에 대한 의도
      // 입력 → 손발: 1번 방식은 입력마다 손이 정해져 있고, 2번 방식은 누르는 순간의 추천 손(또는 그 반대 손)으로 확정한다
      st.footAim = footAim(s, io.mx, io.my); // 발을 직접 보낼 때 겨누는 자리(올라설 수 있는 면 먼저)
      // 직접 보낸 발은 발 조종 키를 누르고 있는 동안만 조준점을 따라온다. 키를 떼면 그때 겨누던 자리로 계속 가고, 마우스는 손을 조종하는 데 쓴다(사용자 의견: 키를 뗐는데도 발이 마우스를 따라다녔다)
      st.footTgt = st.footTgt || [null, null, null, null]; for (const i of [2, 3]) { if (!(st.act[i] && st.manual[i])) st.footTgt[i] = null; else if (io.down('foot') || !st.footTgt[i]) st.footTgt[i] = st.footAim ? { ...st.footAim } : { x: io.mx, y: io.my, raw: true }; }
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
        // Space는 아래로 웅크리며 힘을 모으고, 좌우는 A/D가 맡는다(누르는 순서와 상관없이 같다). 자동 싣기(목표 반대쪽)는 비교용 선택 사항
        const load = (C.JOINT ? OPT.autoLoad : true) ? -ux * P.CROUCH * 0.6 : 0; // 기존 두 몸은 비교 기준이라 v0.7.2 방식(자동 싣기) 그대로 둔다
        if (C.JOINT) { // 관절 몸: 원하는 자리(웅크림 + 몸 싣기)를 자세로 풀어서 팔다리별 목표를 준다
          if (sk) st.sway = Math.max(-P.SWAY_MAX, Math.min(P.SWAY_MAX, st.sway + sk * P.SWAY_V * dt));
          // 웅크리는 깊이: 디딘 다리가 길이의 절반(무릎 약 60°)보다 더 접히지 않는 만큼만. 이미 그만큼 접혀 있으면 내려가지 않고 그 자리에서 힘만 모은다
          let room = P.CROUCH * 0.8; for (const i of [2, 3]) if (s.limb[i].mode === 'plant') { const hj = PHX.rootPos(s, i), e = s.p[2 + i]; room = Math.min(room, Math.max(0, Math.hypot(e.x - hj.x, e.y - hj.y) - 0.5 * s.limb[i].max)); }
          if (st.crouchY === undefined || st.pt <= dt) st.crouchY = A[1] + (room < 4 ? 0 : room); // 모으기 시작할 때 한 번 정한다. 여유가 4px도 안 되면 내려가지 않는다
          // 모으는 동안 S = 더 깊이 가라앉기(팔을 펴고 다리를 더 접는다), W = 다시 올라오기. S로 가라앉았다가 W를 누르며 떼면 팔과 상체까지 쓰는 온몸 도약이 된다
          const vk = (io.down('moveDown') ? 1 : 0) - (io.down('moveUp') ? 1 : 0); st.dipKey = vk;
          // 가라앉을 수 있는 만큼만: 매달린 팔(손이 어깨보다 위)이 다 펴질 때까지, 디딘 다리가 길이의 36%까지 접힐 때까지. 여유가 없으면 가라앉지 않는다(억지로 내리면 몸이 옆으로 돈다)
          // (여유는 지금 자세에서 다시 잰다. 팔 여유는 3px을 남긴다: 팔이 다 펴져 체중이 팔에 걸리면 다리 힘이 빠진다)
          let dipRoom = P.DIP_MAX;
          for (const i of [0, 1]) if (s.limb[i].mode === 'grip') { const r = PHX.rootPos(s, i), e = s.p[2 + i]; if (e.y < r.y - 10) dipRoom = Math.min(dipRoom, Math.max(0, s.limb[i].max - 3 - Math.hypot(e.x - r.x, e.y - r.y))); }
          for (const i of [2, 3]) if (s.limb[i].mode === 'plant') { const hj = PHX.rootPos(s, i), e = s.p[2 + i]; dipRoom = Math.min(dipRoom, Math.max(0, Math.hypot(e.x - hj.x, e.y - hj.y) - 0.36 * s.limb[i].max)); }
          const dipStep = Math.min(P.DIP_V * dt, dipRoom * 0.5); // 남은 여유의 절반씩만 다가간다(지나치지 않게)
          // 가라앉기 값은 "지금 실제로 내려간 만큼 + 남은 여유"를 넘지 않는다(몸이 못 내려가는데 값만 쌓이면 몸이 옆으로 밀린다)
          if (vk > 0) st.dip = Math.max(0, Math.min(P.DIP_MAX, st.dip + dipStep, Math.max(0, c.y - st.crouchY) + dipRoom)); else if (vk < 0) st.dip = Math.max(0, st.dip - P.DIP_V * dt);
          const want = [A[0] + st.sway + load - c.x, st.crouchY + st.dip - c.y], po = PHX.solvePose(s, want, want);
          // 몸 싣기 값이 실제로 갈 수 있는 자리보다 12px 넘게 앞서 나가지 않게 한다(한계에 닿으면 더 쌓이지 않는다)
          const got = po.hp[0] - hp.x, lag = want[0] - got; st.swayBlock = sk && Math.abs(lag) > 12 && Math.sign(lag) === sk ? (po.hitLeg > po.hitArm ? '다리' : '팔') : null;
          if (st.swayBlock) st.sway -= lag - 12 * Math.sign(lag);
          inp.g = po.g; inp.px = po.c[0]; inp.py = po.c[1]; inp.crouch = true;
        } else {
          st.swayBlock = sk && Math.sign(st.sway || sk) === sk ? swayOk(s, sk * 8) : null;
          if (sk && !st.swayBlock) st.sway = Math.max(-P.SWAY_MAX, Math.min(P.SWAY_MAX, st.sway + sk * P.SWAY_V * dt));
          inp.px = A[0] + st.sway + load; inp.py = A[1] + P.CROUCH * 0.8;
        } }
      else if (st.phase === 'throw') {
        st.pt += dt; inp.power = true; const jumpT = st.jump, D = jumpT ? P.THROW_D : 10 + (P.THROW_D - 10) * st.power ** 3, A = st.tAnchor, ax = io.mx - A[0], ay = io.my - A[1], al = Math.hypot(ax, ay) || 1; inp.px = A[0] + ax / al * D; inp.py = A[1] + ay / al * D; // 뗀 순간의 자리 기준
        inp.gain = jumpT ? P.GAIN0 + (1 - P.GAIN0) * st.power : 0.3 + 0.7 * st.power; // 뛸 때는 다리를 끝까지 펴되, 미는 빠르기를 모은 정도에 비례시킨다
        st.lastGain = inp.gain; // 시험용: 실제로 물리에 넘긴 값
        // 관절 몸의 온몸 도약: 던지는 동안 W를 누르고 있으면, 놓을 손 하나가 바로 놓이지 않고 팔로 몸을 끌어 올리다가 어깨가 손을 지나면 그 손으로 눌러 민 뒤 놓는다(다리 + 팔·상체).
        // 두 손을 다 놓기로 했으면 겨눈 곳에서 먼 손이 끝까지 당기고, 가까운 손은 평소처럼 먼저 놓여 뻗는다. 끝까지 당긴 손은 따라 뻗지 않는다(뻗을 시간이 없다).
        // 놓는 때: 팔이 다 펴져 몸을 붙잡기 시작할 때(어깨가 손보다 위에서 팔 길이 92% 이상, 또는 몸이 손에서 멀어지는데 팔에 힘이 걸림), 늦어도 PULL_T초
        st.pulling = false;
        if (C.JOINT && io.down('moveUp')) {
          const mk = [0, 1].filter(i => st.mark[i] && gripping(s, i));
          const pi = mk.length === 2 ? (Math.hypot(s.p[2].x - io.mx, s.p[2].y - io.my) >= Math.hypot(s.p[3].x - io.mx, s.p[3].y - io.my) ? 0 : 1) : mk.length === 1 && (st.pullHand === undefined || st.pullHand === mk[0]) ? mk[0] : -1;
          if (pi >= 0) { st.pullHand = pi;
            const r = PHX.rootPos(s, pi), e = s.p[2 + pi], dx = e.x - r.x, dy = e.y - r.y, len = Math.hypot(dx, dy) || 1, toward = (r.vx * dx + r.vy * dy) / len; // 어깨가 손 쪽으로 가는 빠르기
            const done = (dy > 0 && len > 0.92 * s.limb[pi].max) || (st.pt > 0.08 && toward < -20 && s.limb[pi].tens > 0.3 * PHX.W) || st.pt >= P.PULL_T;
            if (done) { st.mark[pi] = false; detach(s, pi); st.trail[pi] = true; } else st.pulling = true; }
        }
        for (const i of [0, 1]) if (st.mark[i] && gripping(s, i) && !(st.pulling && st.pullHand === i)) { // 표시한 손은 게임이 놓는 순간을 고른다: 팔이 몸을 붙잡기 시작하거나, 늦어도 REL_MAX초
          const restrain = st.pt > 0.04 && s.limb[i].tens > 0.15 * PHX.W, feetOff = !anyFoot;
          if (st.pt >= P.REL_MIN && (restrain || feetOff || st.pt >= P.REL_MAX)) { st.mark[i] = false; detach(s, i);
            // 관절 몸의 한 팔 도약: 다른 손을 먼저 보내 두었으면(그 손으로 잡으려는 것) 놓는 손은 따라 뻗지 않고 그냥 놓는다. 그래야 몸통이 뻗는 팔 쪽으로 돌아 더 멀리 닿는다
            if (C.JOINT && st.act[1 - i] && s.limb[1 - i].mode === 'reach') st.trail[i] = true; }
        }
        // 던지기는 정한 시간 동안. 발이 아직 디뎌져 있으면(작은 반동) 몸이 목표에서 멈출 때까지 붙든다
        const settled = Math.hypot(c.vx, c.vy) < 60;
        if (!anyHold || (!st.pulling && st.pt >= P.THROW_T * (0.5 + 0.5 * st.power) && (!anyFoot || settled || st.pt > 0.6))) { st.phase = 'idle'; st.mark = [false, false]; }
      } else if (st.phase === 'shift') { // 손을 떼기 전에 몸을 남은 지지점 쪽으로 먼저 옮긴다
        const sh = st.shift; sh.t += dt; const o = s.limb[1 - sh.i].anchor;
        if (!o) { detach(s, sh.i); st.shift = null; st.phase = 'idle'; } else {
        const xs = [o.x]; for (const f of [2, 3]) if (s.limb[f].mode === 'plant') xs.push(s.p[2 + f].x);
        // 발이 디뎌져 있으면 지지점들 사이에 이미 있을 때 옮기지 않는다(밖에 있을 때만 가장 가까운 끝으로). 손만 남으면 그 손 아래로
        const sh0 = PHX.rootPos(s, 1 - sh.i).x - c.x; // 남는 손 쪽 어깨가 가슴에서 옆으로 떨어진 거리(기존 두 몸은 0). 손만 남으면 그 어깨가 손 아래로 가게 한다
        const tx = xs.length > 1 ? Math.max(Math.min(...xs), Math.min(Math.max(...xs), c.x)) : o.x - sh0;
        if (sh.y0 === undefined) sh.y0 = c.y; // 높이는 옮기기 시작한 순간 그대로(매번 지금 높이를 목표로 하면 다리가 펴지며 몸이 조금씩 올라간다)
        inp.power = true; inp.px = tx; inp.py = C.JOINT ? sh.y0 : c.y;
        if ((sh.t > 0.06 && Math.abs(c.x - tx) < 6 && Math.abs(c.vx) < 40) || sh.t >= P.SHIFT_T) { detach(s, sh.i); st.shift = null; st.phase = 'idle'; } } // 옮기는 동안 남은 손마저 떨어지면 바로 뗀다
      }
      // 몸통 WASD: 누르는 동안 붙은 팔다리가 몸을 그 방향으로 옮기고, 떼면 그 자리에서 버틴다. 길이·각도 한계를 넘는 쪽으로는 가지 않는다
      st.move = null;
      const mx = (io.down('moveRight') ? 1 : 0) - (io.down('moveLeft') ? 1 : 0), my = (io.down('moveDown') ? 1 : 0) - (io.down('moveUp') ? 1 : 0);
      if ((mx || my) && st.phase !== 'charge' && st.phase !== 'throw' && anyHold) {
        const n = Math.hypot(mx, my), ux2 = mx / n, uy2 = my / n; let k = P.MOVE_STEP, why = null, dx = ux2, dy = uy2, pm = null;
        if (C.JOINT) { // 관절 몸: 의도(방향)를 자세로 푼다. 팔이 다 펴져 있으면 엉덩이만 원호를 그리며 가는 식의 움직임이 여기서 나온다
          pm = poseMove(s, ux2 * P.MOVE_STEP, uy2 * P.MOVE_STEP); why = pm.why;
          if (pm.po) { const l = Math.hypot(pm.hx, pm.hy) || 1; dx = pm.hx / l; dy = pm.hy / l; }
        } else {
        // 좌우로만 누를 때 팔이 다 펴져 막히면, 다리를 펴서 몸을 조금 들며 옆으로 간다(손 아래 원호를 따라 엉덩이를 빼는 움직임)
        const dirs = my === 0 ? [0, 0.35, 0.7, 1.2, 2].map(t => [ux2, -t]) : [[ux2, uy2]];
        search: for (const [a0, b0] of dirs) { const l = Math.hypot(a0, b0); for (const f of [1, 0.6, 0.3, 0.12]) { why = moveOk(s, a0 / l * P.MOVE_STEP * f, b0 / l * P.MOVE_STEP * f); if (!why) { k = P.MOVE_STEP * f; dx = a0 / l; dy = b0 / l; break search; } } }
        }
        // 위로 올라갈 때 아래 발판에 디딘 자동 발이 다 펴져 막으면, 손이 붙어 있는 한 그 발을 엉덩이 아래로 당겨 올리고 올라간다(자동 발이 곧 새 자리를 고른다)
        if (why === '다리' && my < 0 && (gripping(s, 0) || gripping(s, 1))) {
          const lift = [2, 3].filter(i => { const lb = s.limb[i], e = s.p[2 + i]; const hj = PHX.rootPos(s, i); return lb.mode === 'plant' && !st.manual[i] && Math.hypot(hj.x + ux2 * P.MOVE_STEP * 0.3 - e.x, hj.y + uy2 * P.MOVE_STEP * 0.3 - e.y) > lb.max * P.MOVE_MARGIN; });
          if (lift.length) { for (const i of lift) { st.auto[i] = { x: hp.x + (i === 2 ? -10 : 10), y: hp.y + 0.5 * C.L }; st.block[i] = s.t + 0.25; } why = null; k = P.MOVE_STEP * 0.3; dx = ux2; dy = uy2; pm = null; }
        }
        st.move = { dx, dy, blocked: why, hand: why === '손 각도' && pm ? pm.hand : null };
        if (!why && pm && pm.po) { inp.g = pm.po.g; inp.px = pm.po.c[0]; inp.py = pm.po.c[1]; }
        else if (!why) { inp.px = c.x + dx * k; inp.py = c.y + dy * k; }
        if (!why) { inp.power = true; inp.move = true; inp.gain = P.MOVE_GAIN; if (st.shift) { detach(s, st.shift.i); st.shift = null; st.phase = 'idle'; } }
      }
      // 관절 몸: 뻗는 손이 닿지 않으면 몸이 그쪽으로 따라가 준다(의도 = "저기를 잡겠다" → 자세). 손을 보내기 시작한 자리에서 좌우로 LEAN_MAX px까지만.
      // 위아래로는 따라가지 않는다(다리를 미리 펴 버리면 도약할 때 밀 거리가 없어진다. 높이는 W/S나 도약으로 정한다)
      st.leanOn = false;
      if (C.JOINT && st.phase === 'idle' && !st.move && !inp.power && anyHold) {
        const i = [0, 1].find(k => st.act[k] && s.limb[k].mode === 'reach');
        if (i === undefined) st.lean = null; else {
          if (!st.lean || st.lean.i !== i) st.lean = { i, x: c.x, y: c.y };
          const r = PHX.rootPos(s, i), tx = io.mx - r.x, ty = io.my - r.y, d = Math.hypot(tx, ty) || 1, need = d - 0.9 * s.limb[i].max; // 팔 길이의 90%보다 먼 만큼
          // 목표 자리는 "시작한 자리에서 옆으로 D만큼, 높이는 그대로"로 고정한다(매번 지금 자리에서 조금 더 가라고 하면 다리가 펴지며 몸이 점점 올라간다)
          const sg = Math.sign(tx) || 1, used = sg * (c.x - st.lean.x), D = Math.max(0, Math.min(P.LEAN_MAX, used + need));
          let wx = st.lean.x + sg * D - c.x, wy = st.lean.y - c.y; const wl = Math.hypot(wx, wy);
          // (잡기 보조가 허용하는 구간 끝까지만 닿으면 되므로 그만큼은 뺀다)
          // 따라가면 닿을 수 있는 거리일 때만 한다. 그보다 멀면(도약으로 갈 곳) 자세를 바꾸지 않는다: 미리 기울면 발로 밀 자세가 무너진다
          if (need > 2 && used + need - (st.seg ? P.CATCH_SPAN : 0) <= P.LEAN_MAX + 6 && Math.abs(tx) > 8 && wl > 2) { if (wl > P.MOVE_STEP) { wx *= P.MOVE_STEP / wl; wy *= P.MOVE_STEP / wl; } const pm = poseMove(s, wx, wy);
            if (pm.po) { inp.power = true; inp.move = true; inp.gain = P.MOVE_GAIN; inp.g = pm.po.g; inp.px = pm.po.c[0]; inp.py = pm.po.c[1]; st.leanOn = true; } }
        }
      } else if (st.phase !== 'idle') st.lean = null;
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
          const e = s.p[2 + i], hj = PHX.rootPos(s, i), len = Math.hypot(e.x - hj.x, e.y - hj.y), ha = C.JOINT ? PHX.hipAngle((c.x - hp.x) / C.T, (c.y - hp.y) / C.T, lb, e.x - hj.x, e.y - hj.y) : null, bad = len > 0.96 * C.L || Math.abs(e.x - hp.x) > 0.8 * C.L || (ha && (ha.over > 0 || (ha.bend < 20 && Math.abs(ha.line) > P.SPLIT_MAX))); // 관절 몸: 고관절 범위를 넘은 발, 거의 편 채 옆으로 너무 벌어진 다리(다리 찢기)도 다시 디딘다
          st.staleT[i] = bad && !st.placed[i] ? st.staleT[i] + dt : 0; // 플레이어가 직접 디딘 발은 자동 발이 옮기지 않는다(높이 디딘 발 = 하이 스텝)
          const otherOk = (gripping(s, 0) && gripping(s, 1)) || s.limb[5 - i].mode === 'plant';
          if (st.staleT[i] > 0.3 && otherOk && s.t > st.cool[i] && calm) { const cand = footCandidates(s, i, st.auto[5 - i]); if (cand && Math.hypot(cand.x - e.x, cand.y - e.y) > 15) { st.auto[i] = cand; st.cool[i] = s.t + 0.8; st.staleT[i] = 0; }
            // 다시 디딜 곳이 없는데 다리가 거의 편 채 옆으로 너무 벌어져 있으면(다리 찢기), 두 손으로 잡고 있을 때는 그 발을 떼어 엉덩이 아래로 늘어뜨린다
            else if (!cand && ha && ha.bend < 20 && Math.abs(ha.line) > P.SPLIT_MAX && gripping(s, 0) && gripping(s, 1)) { st.auto[i] = { x: hp.x + (i === 2 ? -10 : 10), y: hp.y + 0.5 * C.L }; st.block[i] = s.t + 0.25; st.cool[i] = s.t + 0.8; st.staleT[i] = 0; } }
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
        if (i >= 2 && st.act[i] && st.manual[i]) { const q = PHX.nearestSurface(s.world, e.x, e.y), ft = st.footTgt[i], fa = ft && !ft.raw ? ft : null, ax0 = ft ? ft.x : io.mx, ay0 = ft ? ft.y : io.my; // 겨눈 발 자리가 있으면 그 지형에 닿았을 때만 디딘다(가는 길에 스친 다른 면에는 디디지 않는다)
          if (q && q.d <= C.PLANT_R && q.ny < 0.3 && (fa ? q.poly === fa.poly && q.nx * fa.nx + q.ny * fa.ny > 0.95 && Math.hypot(q.x - fa.sx, q.y - fa.sy) <= P.FOOT_LAND_R : Math.hypot(q.x - ax0, q.y - ay0) <= P.FOOT_CATCH_R) && Math.hypot(e.vx, e.vy) < C.PLANT_V) { // 겨눈 그 면에 닿았을 때만(같은 지형의 옆면·밑면에 먼저 닿아도 디디지 않는다)
            if (handHolds(s, q.poly)) st.noStandT = s.t; else attempt(i); } } // 직접 보낸 발도 손으로 잡은 턱에는 디디지 않는다
        if (i >= 2 && st.act[i] && st.manual[i]) { // 직접 보낸 발이 겨눈 자리에 닿지 못한 채 멈춰 있으면 까닭을 알린다(아무 말 없이 발이 허공에 떠 있지 않게)
          const fa = st.footTgt[i], tx = fa ? fa.x : io.mx, ty = fa ? fa.y : io.my, far = Math.hypot(e.x - tx, e.y - ty) > 14 && Math.hypot(e.vx - hp.vx, e.vy - hp.vy) < 80; st.stall = st.stall || [0, 0, 0, 0];
          st.stall[i] = far ? st.stall[i] + dt : 0;
          if (st.stall[i] > 0.6) { const rr = footReach(s, i, tx, ty); st.footFar = { i, t: s.t, why: !rr.len ? 'len' : 'hip' }; }
          if (st.stall[i] > 1.4 && !io.down('foot')) { st.act[i] = false; st.manual[i] = false; inp.drop[i] = true; st.stall[i] = 0; } } // 키를 뗀 뒤에도 닿지 못하면 그 발은 그만두고 자동 발에 맡긴다
        if (i >= 2 && st.auto[i] && !st.auto[i].swing) { const a = st.auto[i]; if (Math.hypot(e.x - a.x, e.y - a.y) < 8 && Math.hypot(e.vx - hp.vx, e.vy - hp.vy) < C.PLANT_V) attempt(i); }
      }
      // 물리 입력 만들기
      for (let i = 0; i < 4; i++) {
        let reach = st.act[i] || (i >= 2 && !!st.auto[i]);
        if (i >= 2 && st.auto[i]) inp.t[i] = st.auto[i].swing
          ? (st.phase === 'charge' ? [hp.x - ux * 35, hp.y + 25] : [hp.x + ux * 80, hp.y + uy * 80 + 20])
          : [st.auto[i].x, st.auto[i].y];
        else if (st.act[i] && i >= 2 && st.manual[i] && st.footTgt[i] && st.footTgt[i].raw) inp.t[i] = [st.footTgt[i].x, st.footTgt[i].y];
        else if (st.act[i] && i >= 2 && st.manual[i] && st.footTgt[i]) { // 직접 보낸 발은 겨눈 발 자리로 간다
          // 위를 향한 면에는 위에서 내려 디딘다: 발이 아직 그 면보다 낮고 옆에 있으면 먼저 발 자리의 조금 위로 간다(아래에서 곧장 가면 턱의 옆면·밑면에 걸린다)
          const fa = st.footTgt[i], e = s.p[2 + i], up = (e.x - fa.sx) * fa.nx + (e.y - fa.sy) * fa.ny, lat = Math.abs((e.x - fa.sx) * -fa.ny + (e.y - fa.sy) * fa.nx);
          inp.t[i] = fa.ny < -0.5 && up < 7 && lat > 6 ? [fa.sx + fa.nx * 18, fa.sy + fa.ny * 18] : [fa.x, fa.y]; }
        else if (st.act[i]) inp.t[i] = [io.mx, io.my];
        if (st.tryNow[i]) { reach = false; st.tryNow[i] = false; st.pend[i] = true; }
        if (i < 2) inp.hand[i] = reach; else inp.foot[i - 2] = reach;
      }
      return inp;
    }
    return { st, step, mode: 'intent' };
  }
  return { KEYMAP, LABEL, MODES, OPT, P, make, inRange, footCandidates, catchAllowed, aimSeg, footAim, footReach };
})();
if (typeof module !== 'undefined') module.exports = CTRL;
