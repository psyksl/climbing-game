// 등반 조작 실험실 · 화면과 입력
'use strict';
(() => {
  const W = G.W, H = G.H, OX = -30, OY = 130, C = PH.C;
  const LIMB = ['왼손', '오른손', '왼발', '오른발'], COL = ['#e86a5a', '#4fb3e8', '#e86a5a', '#4fb3e8'], DARK = ['#8a3b3b', '#2a6f97', '#8a3b3b', '#2a6f97'];
  let world = PH.makeWorld(), layout = null;
  const autoList = G.auto ? (G.auto === 'all' ? Object.keys(BOTS.defs) : G.auto.split(',').filter(n => BOTS.defs[n])) : [];
  if (G.params.get('couple') !== null) C.COUPLE = +G.params.get('couple');
  PH.setBody(PH.BODIES[G.params.get('body')] ? G.params.get('body') : 'joint'); // 기본은 관절 몸(3단계 실험판). 주소에 ?body=base|prop|joint로 고를 수 있다
  const MODE_LIST = ['intent', 'pick', 'keys', 'hold'];
  try { const saved = JSON.parse(localStorage.getItem('climbKeys') || 'null'); if (saved) for (const m in saved) Object.assign(CTRL.KEYMAP[m], saved[m]); } catch (e) {}
  let mode = MODE_LIST.includes(G.params.get('mode')) ? G.params.get('mode') : 'intent', ctrl = CTRL.make(mode), remap = null, ui = null;
  if (G.params.get('hand') === '2') CTRL.OPT.handMode = 2;
  if (G.params.get('assist') === 'ledge') CTRL.OPT.assistRange = 'ledge';
  const aim = { x: 400, y: 330, mx: null, my: null, held: 0 }; // 조준점(게임 좌표). 마우스를 움직이면 마우스로, 조준 키를 누르면 키로 움직인다
  const plog = { sends: 0, confuse: 0, slips: 0, fallAfterSend: 0, lag: [], pending: [], lastSend: null, sendT: -9 };
  const V05 = { MUSCLE: C.MUSCLE, SMOOTH: C.SMOOTH, SMOOTH_FOOT: C.SMOOTH_FOOT, LAT_LEG: C.LAT_LEG, LAT_ARM: C.LAT_ARM };
  let v05 = G.params.get('phys') !== 'v04';
  function setPhys(on) { for (const k in V05) C[k] = on ? V05[k] : 0; } // 물리 v0.6(근육·궤적·관절 힘) ↔ v0.4
  if (autoList.length) v05 = false; // 자동 시연(?auto=)은 v0.4 물리에 맞춰 만든 조작기라 v0.4 물리로 돈다
  setPhys(v05);
  const kn = c => (c || '?').replace('Key', '').replace('Digit', '').replace('Arrow', '');
  let recent = [], spWas = false, lastMiss = null, showLog = false, S, station = 1, tries = 0, fx = [], why = null, endT = 0, slow = false, tick = 0, bot = null, autoI = 0, doneT = 0, air = null, jump = null, trail = [], swing = null, last = BOTS.idle();
  window.__lab = { hint: () => hint(), jump: () => jump, ctrlState: () => ctrl.st, opt: () => CTRL.OPT, aim, plog, ui: () => ui, bind: BIND, raw: () => { const m = G.input.mouse; return (m.down[0] || G.input.key('KeyQ') ? 'L' : '-') + (m.down[2] || G.input.key('KeyE') ? 'R' : '-'); }, get s() { return S; }, get bot() { return bot; }, finished: false, results: [] };

  function reset(st) {
    if (st) station = st;
    if (autoList.length) { bot = BOTS.make(autoList[autoI % autoList.length]); station = bot.def.station; }
    S = PH.create(world, station); tries++; fx = []; why = null; endT = 0; doneT = 0; air = null; jump = null; trail = []; swing = null; lastMiss = null; ctrl = CTRL.make(mode);
  }
  // 최근 입력 표시(영상에서 어떤 입력을 썼는지 보이게)
  function noteInputs(inp) {
    const add = t => { recent.push({ t: 1.4, text: t }); if (recent.length > 5) recent.shift(); };
    const foot = BIND.down('foot', inp);
    for (const id of CTRL.OPT.handMode === 1 ? ['sendL', 'sendR'] : ['sendBest', 'sendOther']) if (BIND.pressed(id, inp)) {
      const code = BIND.get(id).find(c => c && (c.startsWith('Mouse') ? inp.clicks.some(k => 'Mouse' + k.button === c) : inp.pressed(c)));
      add(`${foot || BIND.pressedWithShift(id, inp) ? BIND.first('foot') + '+' : ''}${BIND.name(code)} (${BIND.BY[id].label.split(' ·')[0]})`); }
    for (const [id, t] of [['moveUp', '위'], ['moveDown', '아래'], ['moveLeft', '왼쪽'], ['moveRight', '오른쪽']]) if (BIND.pressed(id, inp)) add(`${BIND.first(id)} (몸통 ${t})`);
    const sp = BIND.down('power', inp); if (sp !== spWas) add(`${BIND.first('power')} ${sp ? '누름 (모으기)' : '뗌 (던지기)'}`); spWas = sp;
    if (BIND.pressed('cancel', inp)) add(`${BIND.first('cancel')} (취소)`);
  }
  function updateAim(inp, dt) {
    const m = inp.mouse;
    if (aim.mx === null || Math.abs(m.x - aim.mx) > 0.5 || Math.abs(m.y - aim.my) > 0.5) { if (aim.mx !== null) { aim.x = m.x + OX; aim.y = m.y + OY; } aim.mx = m.x; aim.my = m.y; }
    const dx = (BIND.down('aimRight', inp) ? 1 : 0) - (BIND.down('aimLeft', inp) ? 1 : 0), dy = (BIND.down('aimDown', inp) ? 1 : 0) - (BIND.down('aimUp', inp) ? 1 : 0);
    if (dx || dy) { aim.held += dt; const sp = BIND.down('aimSlow', inp) ? 90 : Math.min(520, 220 + 600 * aim.held), n = Math.hypot(dx, dy); aim.x += dx / n * sp * dt; aim.y += dy / n * sp * dt; } else aim.held = 0;
    aim.x = Math.max(OX + 4, Math.min(OX + W - 4, aim.x)); aim.y = Math.max(OY + 4, Math.min(OY + H - 30, aim.y));
  }
  function readInput(inp) {
    let io;
    if (mode === 'intent') {
      const footShift = BIND.get('foot').some(c => c === 'ShiftLeft' || c === 'ShiftRight');
      io = { mx: aim.x, my: aim.y, down: id => BIND.down(id, inp), pressed: id => BIND.pressed(id, inp), pressedShift: id => footShift && BIND.pressedWithShift(id, inp) };
    } else {
      const m = inp.mouse; io = { mx: m.x + OX, my: m.y + OY, lheld: m.down[0], rheld: m.down[2], lmb: inp.clicks.some(c => c.button === 0), rmb: inp.clicks.some(c => c.button === 2), lshift: inp.clicks.some(c => c.button === 0 && c.shift), rshift: inp.clicks.some(c => c.button === 2 && c.shift), key: c => inp.key(c), pressed: c => inp.pressed(c) };
    }
    const out = ctrl.step(S, io, 1 / 120);
    for (const i of ctrl.st.air) fx.push({ x: S.p[2 + i].x, y: S.p[2 + i].y, t: 0.9, kind: 'text', text: `${LIMB[i]}: 닿은 곳이 없다 — 그대로 들고 있음` });
    if (mode === 'intent') {
      for (const m of ctrl.st.miss || []) { lastMiss = { d: m.d, t: S.t, x: m.x, y: m.y }; } for (const m of ctrl.st.miss || []) if (!fx.some(f => f.miss === m.i && f.t > 0.6)) fx.push({ x: m.x, y: m.y, t: 1.0, kind: 'text', miss: m.i, text: `${LIMB[m.i]}: 겨눈 구간 밖에 닿음 (${Math.ceil(m.d)}px 벗어남)` });
      logSends(inp);
    }
    return out;
  }
  // 첫 플레이 확인용 기록: 손 선택 헷갈림(추정), 원치 않은 손 놓기, 입력 후 반응 지연
  function logSends(inp) {
    const st = ctrl.st;
    for (const e of st.sent) {
      plog.sends++;
      if (plog.lastSend && S.t - plog.lastSend.t < 0.8 && plog.lastSend.i !== e.i && (plog.lastSend.i < 2) === (e.i < 2)) plog.confuse++; // 0.8초 안에 다른 손으로 바꿈
      if (e.phase !== 'charge' && (e.mode === 'grip' || e.mode === 'plant')) plog.pending.push({ i: e.i, t: S.t });
      plog.lastSend = e; plog.sendT = S.t;
    }
    if (BIND.pressed('cancel', inp) && plog.lastSend && S.t - plog.lastSend.t < 0.8) plog.confuse++; // 보내자마자 취소
    plog.pending = plog.pending.filter(p => { const m = S.limb[p.i].mode; if (m === 'reach' || m === 'free') { plog.lag.push(S.t - p.t); return false; } return S.t - p.t < 1; });
  }
  function note(e) {
    const n = LIMB[e.limb];
    if (e.type === 'grab') { fx.push({ x: e.x, y: e.y, t: 0.4, kind: 'ring' }); G.sfx.grab(); }
    else if (e.type === 'plant') { fx.push({ x: e.x, y: e.y, t: 0.3, kind: 'ring' }); G.sfx.beep(); }
    else if (e.type === 'miss') { if (e.d < 40) { say(e, `${n} 허공 — 잡을 곳까지 ${Math.ceil(e.d)}px 모자람`); G.sfx.miss(); } } // 멀리서 뗀 것은 일부러 놓은 것으로 본다
    else if (e.type === 'nohold') { say(e, `${n} 걸리지 않음 — 면 기울기 ${Math.round(e.ang)}°, ${PH.GRIP[e.kind].name}은 ${e.lim}°까지`); G.sfx.miss(); }
    else if (e.type === 'footmiss') { if (e.fast) say(e, `${n} 디디지 못함 — 발이 너무 빠르다`, true); else if (e.d < 30) say(e, `${n} 헛디딤 — 면까지 ${Math.ceil(e.d)}px`, true); }
    else if (e.type === 'slip') { plog.slips++; say(e, `${n} 미끄러짐 — 당기는 방향 ${Math.round(e.ang)}°, 이 ${PH.GRIP[e.kind].name}의 한계 ${e.lim}°`); G.sfx.fail(); }
    else if (e.type === 'footoff') say(e, e.hang ? `${n} 떨어짐 — 발에 매달릴 수는 없다(몸이 발 아래에 있다)` : `${n} 접촉 끊김 — 누르는 힘이 없어 발이 떴다`, !e.hang);
    else if (e.type === 'mat') { if (S.t - plog.sendT < 1.5) plog.fallAfterSend++; endT = bot ? 2.6 : 1.6; G.sfx.thud(); G.shake(5, 0.2); }
    else if (e.type === 'win') G.sfx.win();
  }
  function say(e, text, minor) { fx.push({ x: e.x, y: e.y, t: 1.6, kind: 'text', text }); if (!minor) why = { text, t: S.t }; }

  const game = {
    init() { reset(1); },
    update(dt, inp) {
      for (const f of fx) f.t -= dt; fx = fx.filter(f => f.t > 0); for (const r of recent) r.t -= dt; recent = recent.filter(r => r.t > 0);
      if (ui) { ui.frame = (ui.frame || 0) + 1; settingsUpdate(inp); return; }
      if (remap) { // (A·B·C안) 키 다시 지정: 순서대로 누른다. Esc로 그만둔다
        const codes = inp.codes();
        if (codes.includes('Escape')) remap = null;
        else if (codes.length) { CTRL.KEYMAP[mode][remap.list[remap.i]] = codes[0]; remap.i++; if (remap.i >= remap.list.length) { try { localStorage.setItem('climbKeys', JSON.stringify(CTRL.KEYMAP)); } catch (e) {} remap = null; reset(); } }
        return;
      }
      if (!bot) {
        const P_ = id => BIND.pressed(id, inp);
        if (P_('settings')) { if (mode === 'intent') openSettings(); else remap = { list: Object.keys(CTRL.KEYMAP[mode]), i: 0 }; return; }
        if (P_('reset')) { reset(); return; }
        for (let k = 1; k <= 5; k++) if (P_('st' + k)) { tries = 0; reset(k); return; }
        if (P_('scheme')) { mode = MODE_LIST[(MODE_LIST.indexOf(mode) + 1) % MODE_LIST.length]; tries = 0; reset(); return; }
        if (P_('slow')) slow = !slow;
        if (P_('couple')) C.COUPLE = C.COUPLE ? 0 : 0.15;
        if (P_('layout')) { layout = layout ? null : 'near'; world = PH.makeWorld(layout); tries = 0; reset(); return; }
        if (P_('phys')) { v05 = !v05; setPhys(v05); tries = 0; reset(); return; }
        if (P_('body')) { const order = ['base', 'prop', 'joint']; PH.setBody(order[(order.indexOf(PH.getBody()) + 1) % order.length]); tries = 0; reset(); return; }
        if (mode === 'intent') {
          if (P_('log')) showLog = !showLog;
          const O = CTRL.OPT;
          if (P_('autoFeet')) O.autoFeet = !O.autoFeet;
          if (P_('autoShift')) O.autoShift = !O.autoShift;
          if (P_('autoLoad')) O.autoLoad = !O.autoLoad;
          if (P_('assist')) O.assist = !O.assist;
          if (P_('handMode')) O.handMode = O.handMode === 1 ? 2 : 1;
          if (P_('assistRange')) O.assistRange = O.assistRange === 'near' ? 'ledge' : 'near';
        }
        updateAim(inp, dt); if (mode === 'intent') noteInputs(inp);
      }
      if (endT > 0) { endT -= dt; if (endT <= 0 || (!bot && endT < 1.2 && inp.any())) { if (bot) nextAuto(false); reset(); } return; }
      if (S.won && !bot) { if (BIND.pressed('power', inp) || inp.pressed('Enter')) reset(); }
      tick++; if (slow && tick % 2) return;
      last = bot ? bot.step(S) : readInput(inp);
      PH.step(S, last, dt);
      // 공중에 떠 있는 동안 손이 잡을 곳에 가장 가까웠던 거리를 기억해 둔다(실패 원인 표시용)
      if (S.limb.some(l => l.mode === 'grip' || l.mode === 'plant')) { air = null; }
      else { if (!air) air = { t: S.t, gap: 1e9 }; if (S.t - air.t > 0.25) for (const i of [0, 1]) { const q = PH.nearestGrip(world, S.p[2 + i].x, S.p[2 + i].y); air.gap = Math.min(air.gap, q.d - C.GRAB_R); } }
      track(dt);
      for (const e of S.events) note(e);
      if (bot && bot.m.done) { doneT += dt; if (doneT > 2) { nextAuto(true); reset(); } }
    },
    draw,
  };
  // 도약·반동 기록: 실패했을 때 무엇을 바꿔야 할지 보여 주기 위한 측정(조작에는 영향 없음)
  function track(dt) {
    const L = S.limb, hands = [0, 1].filter(i => L[i].mode === 'grip'), feet = [2, 3].filter(i => L[i].mode === 'plant'), c = S.p[0];
    if (feet.length) {
      if (!jump || jump.off) jump = { tP: null, tR: null, off: null };
      const pushing = mode === 'intent' && !bot ? ctrl.st.phase === 'throw' : last.power && (last.cy < c.y - 20 || !hands.length);
      if (pushing && jump.tP === null) jump.tP = S.t; // 밀기 시작(D안은 Space를 뗀 순간)
      if (!last.power && hands.length && !(mode === 'intent' && !bot && ctrl.st.phase === 'throw')) jump.tP = null;
      if (!hands.length && jump.tR === null) jump.tR = S.t;
      if (hands.length) jump.tR = null;
      jump.ext = Math.max(...feet.map(i => Math.hypot(S.p[2 + i].x - S.p[1].x, S.p[2 + i].y - S.p[1].y) / L[i].max));
      jump.lean = S.p[1].x - feet.reduce((a, i) => a + S.p[2 + i].x, 0) / feet.length; // 엉덩이가 발보다 얼마나 오른쪽인가
    } else if (jump && !jump.off && jump.tP !== null) {
      jump.off = { x: c.x, y: c.y, vx: c.vx, vy: c.vy, t: S.t, held: hands.length > 0 }; trail = [];
      jump.aim = mode === 'intent' && ctrl.st.aimAt ? { ...ctrl.st.aimAt } : null; jump.near = null;
      if (jump.tR === null && !hands.length) jump.tR = S.t;
    }
    if (jump && jump.off && jump.tR === null && !hands.length) jump.tR = S.t;
    // 공중에서 손이 겨눈 곳에 가장 가까웠던 순간: 거리와, 이륙점→겨눈 곳 방향으로 본 앞뒤(음수 = 못 미침, 양수 = 지나침)
    if (jump && jump.off && jump.aim && !feet.length) for (const i of [0, 1]) { if (S.limb[i].mode === 'grip') continue;
      const h = S.p[2 + i], d = Math.hypot(h.x - jump.aim.x, h.y - jump.aim.y);
      if (!jump.near || d < jump.near.d) jump.near = { d, along: alongAim(h.x, h.y) }; }
    if (jump && jump.off && !hands.length && !feet.length && trail.length < 400 && Math.round(S.t * 120) % 4 === 0) trail.push([c.x, c.y]);
    // 반동: 손으로만 매달려 있을 때 가슴이 손 아래에서 벗어난 각도의 반주기별 최고값
    const hanging = hands.length && Math.hypot(S.p[2 + hands[0]].x - c.x, S.p[2 + hands[0]].y - c.y) > 0.8 * C.A; // 팔이 펴져 매달려 있을 때만(당겨 올라간 자세는 흔들림이 아님)
    if (hands.length && !feet.length && hanging) {
      const a = L[hands[0]].anchor, phi = Math.atan2(c.x - a.x, c.y - a.y) * 180 / Math.PI;
      if (!swing || swing.ax !== a.x) swing = { ax: a.x, ay: a.y, side: Math.sign(phi) || 1, cur: 0, peak: 0, prev: 0 };
      if (Math.sign(phi) === -swing.side && Math.abs(phi) > 2) { swing.prev = swing.peak; swing.peak = swing.cur; swing.cur = 0; swing.side = -swing.side; }
      swing.cur = Math.max(swing.cur, Math.abs(phi)); swing.phi = phi;
    } else swing = null;
  }
  // 이륙점→겨눈 곳 방향으로 잰 (x,y)의 앞뒤 위치. 음수 = 겨눈 곳보다 앞(못 미침), 양수 = 뒤(지나침)
  function alongAim(x, y) { const a = jump.aim, o = jump.off, ux = a.x - o.x, uy = a.y - o.y, l = Math.hypot(ux, uy) || 1; return ((x - a.x) * ux + (y - a.y) * uy) / l; }
  // 못 미침/지나침이 분명한가: 앞뒤 차이가 6px 이상이고, 겨눈 곳에서 벗어난 거리의 60% 이상이 앞뒤 방향일 때만(옆으로 빗나간 것은 판단하지 않는다)
  const sideOf = (along, d) => Math.abs(along) >= 6 && Math.abs(along) >= 0.6 * d ? Math.sign(along) : 0;
  function hint() { // 떨어진 뒤: 방향·타이밍·발 위치 중 무엇을 바꿀지
    if (!jump || jump.tP === null || !jump.off) return null;
    const d = jump.tR === null ? 9 : jump.tR - jump.tP, o = jump.off, ang = Math.round(Math.atan2(-o.vy, o.vx) * 180 / Math.PI), sp = Math.round(Math.hypot(o.vx, o.vy));
    const win = (C.COUPLE || 0) + 0.15;
    if (mode === 'intent' && !bot) { // D안: 손 놓는 순간은 게임이 고르므로 모으기·발 위치·방향만 본다
      // 세기를 탓하려면 손이 겨눈 곳보다 앞에서 모자랐는지, 뒤로 지나쳤는지를 먼저 확인한다. 근거가 없으면 사실만 알린다
      const pw = Math.round(ctrl.st.power * 100);
      if (lastMiss && jump.off && lastMiss.t >= jump.off.t) {
        const side = jump.aim ? sideOf(alongAim(lastMiss.x, lastMiss.y), Math.hypot(lastMiss.x - jump.aim.x, lastMiss.y - jump.aim.y)) : 0;
        if (side > 0) return `바꿀 것: 세기 — 손이 겨눈 구간을 지나쳐 ${Math.ceil(lastMiss.d)}px 뒤에 닿았다(세기 ${pw}%). 덜 모으거나 더 먼 곳을 겨눈다`;
        if (side < 0) return `바꿀 것: 세기 — 손이 겨눈 구간에 못 미쳐 ${Math.ceil(lastMiss.d)}px 앞에 닿았다(세기 ${pw}%). ${pw >= 99 ? '이미 가장 세게 뛰었다. 더 가까운 곳을 겨눈다' : '더 모으거나 더 가까운 곳을 겨눈다'}`;
        return `손이 겨눈 구간 밖에 닿음 (${Math.ceil(lastMiss.d)}px 벗어남)`;
      }
      if (jump.lean >= 4 && jump.near && jump.near.d > C.GRAB_R) {
        const side = sideOf(jump.near.along, jump.near.d), gap = Math.ceil(jump.near.d - C.GRAB_R);
        if (side < 0) return `바꿀 것: 세기 — 손이 겨눈 곳에 ${gap}px 못 미쳤다(세기 ${pw}%). ${pw >= 99 ? '이미 가장 세게 뛰었다. 더 가까운 곳을 겨눈다' : '더 모은다'}`;
        if (side > 0) return `바꿀 것: 세기 — 손이 겨눈 곳을 지나쳤다(가장 가까울 때 ${gap}px, 세기 ${pw}%). 덜 모은다`;
      }
    } else if (d > win) return `바꿀 것: 타이밍 — 손 놓기가 밀기보다 ${d > 5 ? '너무' : d.toFixed(2) + '초'} 늦어 팔에 붙잡혔다 (여유 약 ${win.toFixed(2)}초)`;
    if (jump.lean < 4) return `바꿀 것: 발 위치 — 발이 엉덩이보다 앞(가려는 쪽)에 있어 ${ang > 90 ? '뒤로' : '위로만'} 밀렸다. 발을 반대쪽에 두기`;
    if (air && air.gap <= 0) return '바꿀 것: 잡는 타이밍 — 손이 닿았지만 버튼을 떼지 않았다';
    return `바꿀 것: 방향 — 이륙 ${sp}px/s, 수평에서 ${ang}° 위. 손이 잡을 곳에서 가장 가까울 때 ${air && air.gap < 1e8 ? Math.ceil(air.gap) : '?'}px 떨어져 있었다`;
  }
  function nextAuto(ok) { window.__lab.results.push({ name: autoList[autoI % autoList.length], ok }); autoI++; if (autoI >= autoList.length) window.__lab.finished = true; }

  // ---- 그리기
  const TYPE_COL = { ledge: '#7d828c', incut: '#b9793a', jug: '#d9573a', sloper: '#8b7fa8', block: '#6b6f78', rock: '#9a917f' };
  function drawWorld(c) {
    c.fillStyle = '#cfcabd'; c.fillRect(OX, OY, W, H);
    for (let y = 150; y < C.FLOOR; y += 40) for (let x = OX + 20; x < OX + W; x += 40) G.circle(x, y, 1.5, 'rgba(0,0,0,0.13)');
    c.fillStyle = '#3c5a8a'; c.fillRect(OX, C.FLOOR, W, 60);
    for (const pl of world) {
      c.beginPath(); pl.pts.forEach((q, i) => i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])); c.closePath();
      c.fillStyle = pl.goal ? '#d9a521' : TYPE_COL[pl.type]; c.fill(); c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 1.5; c.stroke();
      if (pl.type !== 'rock') for (const e of pl.edges) if (e.grip) G.line(e.ax, e.ay, e.bx, e.by, pl.type === 'sloper' ? '#e9e2ff' : '#fff6d8', 3.5); // 손으로 잡을 수 있는 면
    }
    const lab = (id, t, dx, dy) => { const pl = world.find(p => p.id === id); G.text(t, pl.cx + dx, pl.cy + dy, { size: 11, align: 'center', color: 'rgba(40,40,40,0.75)', weight: 700 }); };
    lab('A', '깊은 턱', -40, 26); lab('B', '턱', 30, 26); lab('G', '목표: 두 손으로 잡기', 0, -14); lab('J', '저그', 0, 24); lab('S', '둥근 면(미끄러움)', 0, 24); lab('F1', '발판', 0, 6); lab('F3', '발판', 0, 24); lab('F4', '발판', 0, 24); lab('P', '반동 연습', 0, -14); lab('R', '바위', 6, 60);
  }
  function ik(a, b, len, bend) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, d = Math.min(L, len - 0.01), h = Math.sqrt(Math.max(0, (len / 2) ** 2 - (d / 2) ** 2));
    return [a[0] + dx / 2 - dy / L * h * bend, a[1] + dy / 2 + dx / L * h * bend];
  }
  // 팔꿈치·무릎이 꺾이는 쪽: 화면에 고정하지 않고 몸 기준으로 고른다. 벽을 보고 있는 사람을 뒤에서 본다고 보고,
  // 왼팔·왼다리는 몸의 왼쪽 바깥으로, 오른팔·오른다리는 오른쪽 바깥으로 꺾인다. 팔꿈치는 조금 아래로, 무릎은 조금 위로 향하는 쪽을 더 낫게 본다.
  // 두 쪽이 비슷하면(4px 이내) 이전 쪽을 유지해 깜빡이지 않게 한다
  const bendMem = [-1, 1, -1, 1];
  function chooseBend(i, r, e, len, ux, uy) {
    const side = i % 2 ? 1 : -1, rx = -uy, ry = ux, arm = i < 2;
    const sc = b => { const m = ik(r, e, len, b), dx = m[0] - r[0], dy = m[1] - r[1]; return side * (dx * rx + dy * ry) + (arm ? -0.4 : 0.25) * (dx * ux + dy * uy); };
    const prev = bendMem[i], a = sc(prev), o = sc(-prev);
    if (o > a + 4) bendMem[i] = -prev;
    return bendMem[i];
  }
  function drawBody(c) {
    const p = S.p, ch = p[0], hp = p[1], ux = (ch.x - hp.x) / C.T, uy = (ch.y - hp.y) / C.T;
    if (C.JOINT) { // 관절 몸: 팔은 어깨에서, 다리는 골반 양옆에서 나오고, 팔꿈치·무릎은 물리가 정한 자리에 그린다
      const R = [0, 1, 2, 3].map(i => PH.rootPos(S, i));
      for (const i of [2, 3, 0, 1]) { // 다리 먼저, 그 위에 몸통, 팔은 맨 위
        const lb = S.limb[i], r = R[i], e = p[lb.end], j = PH.jointPos(S, i);
        c.beginPath(); c.moveTo(r.x, r.y); c.lineTo(j.x, j.y); c.lineTo(e.x, e.y);
        c.strokeStyle = DARK[i]; c.lineWidth = lb.arm ? 7 : 9; c.lineCap = 'round'; c.lineJoin = 'round'; c.globalAlpha = lb.mode === 'free' ? 0.65 : 1; c.stroke();
        G.circle(j.x, j.y, lb.arm ? 4.5 : 5.5, DARK[i], 'rgba(255,255,255,0.75)', 1.5); c.globalAlpha = 1; // 팔꿈치·무릎
        if (i === 3) { // 몸통: 어깨–골반 사다리꼴 + 머리
          c.beginPath(); c.moveTo(R[0].x, R[0].y); c.lineTo(R[1].x, R[1].y); c.lineTo(R[3].x, R[3].y); c.lineTo(R[2].x, R[2].y); c.closePath();
          c.fillStyle = '#3b3f46'; c.strokeStyle = '#3b3f46'; c.lineWidth = 12; c.lineJoin = 'round'; c.fill(); c.stroke();
          G.circle(ch.x + ux * 22, ch.y + uy * 22, 10, '#3b3f46');
        }
      }
    } else for (const i of [2, 3, 0, 1]) { // 다리 먼저, 팔 나중
      const lb = S.limb[i], r = p[lb.root], e = p[lb.end], mid = ik([r.x, r.y], [e.x, e.y], lb.max + 2, chooseBend(i, [r.x, r.y], [e.x, e.y], lb.max + 2, ux, uy));
      c.beginPath(); c.moveTo(r.x, r.y); c.lineTo(mid[0], mid[1]); c.lineTo(e.x, e.y);
      c.strokeStyle = DARK[i]; c.lineWidth = lb.arm ? 7 : 9; c.lineCap = 'round'; c.lineJoin = 'round'; c.globalAlpha = lb.mode === 'free' ? 0.65 : 1; c.stroke(); c.globalAlpha = 1;
      if (i === 3) { G.line(hp.x, hp.y, ch.x, ch.y, '#3b3f46', 20); c.lineCap = 'round'; G.circle(ch.x + ux * 20, ch.y + uy * 20, 10, '#3b3f46'); }
    }
    for (let i = 0; i < 4; i++) {
      const lb = S.limb[i], e = p[lb.end], on = lb.mode === 'grip' || lb.mode === 'plant';
      c.beginPath();
      if (lb.arm) G.roundRect(e.x - 9, e.y - 9, 18, 18, 6); else c.ellipse(e.x, e.y, 12, 7, 0, 0, Math.PI * 2);
      c.fillStyle = lb.mode === 'free' ? 'rgba(255,255,255,0.55)' : COL[i]; c.fill();
      let ring = on ? '#fff' : 'rgba(0,0,0,0.6)';
      if (lb.mode === 'grip' && Math.abs(lb.tens) > 0.25 * PH.W) { const k = lb.ang / lb.lim; ring = k > 0.9 ? '#ff3b30' : k > 0.7 ? '#ffd23c' : '#fff'; } // 미끄러지기 직전 경고
      c.strokeStyle = ring; c.lineWidth = on ? 3.5 : 1.5; c.stroke();
      G.text(i % 2 ? 'R' : 'L', e.x, e.y + 4, { size: 11, weight: 900, align: 'center', color: '#111' });
      if (mode === 'intent' && !bot) {
        const st = ctrl.st;
        if (i < 2 && st.mark[i]) { G.circle(e.x, e.y, 16 + Math.sin(S.t * 18) * 2, null, '#ffb020', 3);
          } 
        if (i >= 2 && st.auto[i] && !st.auto[i].swing) { const a = st.auto[i]; G.circle(a.sx, a.sy, 6, null, 'rgba(40,40,40,0.55)', 2); }
        if (st.act[i] && lb.mode === 'reach' && (st.phase === 'charge' || st.phase === 'throw')) { G.circle(e.x, e.y, 15, null, '#29d3e8', 3); }
      }
      if (lb.mode === 'reach') {
        const r = PH.rootPos(S, i);
        G.circle(r.x, r.y, lb.max, null, 'rgba(255,255,255,0.35)', 1.5); // 닿는 범위
        const tg = last.t && last.t[i] ? last.t[i] : [last.cx, last.cy];
        G.line(e.x, e.y, tg[0], tg[1], 'rgba(255,255,255,0.6)', 1.5, [4, 4]);
        if (mode === 'keys' && !bot) { const sel = ctrl.st.sel.l === i || ctrl.st.sel.r === i; G.circle(tg[0], tg[1], sel ? 7 : 4, null, sel ? '#111' : 'rgba(0,0,0,0.4)', 2); }
        const q = lb.arm ? PH.nearestGrip(world, e.x, e.y) : PH.nearestSurface(world, e.x, e.y), ok = q && q.d <= (lb.arm ? C.GRAB_R : C.PLANT_R);
        const steep = ok && lb.arm && q.type === 'rock' && Math.acos(Math.max(-1, Math.min(1, -q.ny))) * 180 / Math.PI > PH.GRIP.rock.th;
        if (ok) G.circle(q.x, q.y, 13 + Math.sin(S.t * 14) * 2, null, steep ? '#ff9a3d' : '#3dff8f', 3); // 초록: 지금 떼면 붙는다. 주황: 닿았지만 면이 가파르다
      }
    }
  }
  function key(c, x, label, sub, on, col, k) {
    G.panel(x, H - 26, 122, 21, on ? col : 'rgba(10,12,16,0.55)', on ? '#fff' : null);
    G.text(`${k} ${label}`, x + 6, H - 11, { size: 12, weight: 800, color: on ? '#111' : '#e8e8e4' });
    if (G.textW(`${k} ${label}`, 12, 800) + G.textW(sub, 10, 600) < 108) G.text(sub, x + 117, H - 11, { size: 10, weight: 600, align: 'right', color: on ? '#222' : 'rgba(255,255,255,0.55)' });
  }
  // ---- D안 도움 표시: 입력별로 움직일 손(1번 방식) 또는 추천 손(2번 방식)을 누르기 전에 보여 준다. 잡기 보조가 허용하는 구간도 표시
  function drawIntentHelp(c) {
    const st = ctrl.st, O = CTRL.OPT, ax = last.cx, ay = last.cy, foot = BIND.down('foot', G.input), charge = st.phase === 'charge';
    // 잡기 허용 구간
    if (st.seg && O.assist) {
      const pl = world.find(p => p.id === st.seg.poly);
      if (pl) for (const e of pl.edges) if (e.grip) {
        if (st.seg.whole) { G.line(e.ax, e.ay, e.bx, e.by, 'rgba(61,255,143,0.55)', 7); continue; }
        const dx = e.bx - e.ax, dy = e.by - e.ay, L = Math.hypot(dx, dy), t = Math.max(0, Math.min(1, ((st.seg.x - e.ax) * dx + (st.seg.y - e.ay) * dy) / (L * L)));
        const qx = e.ax + dx * t, qy = e.ay + dy * t; if (Math.hypot(qx - st.seg.x, qy - st.seg.y) > 1) continue;
        const sp = CTRL.P.CATCH_SPAN / L, t0 = Math.max(0, t - sp), t1 = Math.min(1, t + sp);
        G.line(e.ax + dx * t0, e.ay + dy * t0, e.ax + dx * t1, e.ay + dy * t1, 'rgba(61,255,143,0.75)', 7);
      }
    }
    // 입력 → 손발
    const ids = O.handMode === 1 ? [['sendL', foot ? 2 : 0, false], ['sendR', foot ? 3 : 1, false]]
      : (() => { const r = foot ? st.rec.foot : st.rec.hand, o = foot ? 5 - r : 1 - r; return [['sendBest', r, true], ['sendOther', o, false]]; })();
    ids.forEach(([id, li, best], k) => {
      const lb = S.limb[li], e = S.p[lb.end], col = COL[li], strong = O.handMode === 1 || best;
      const verb = charge && li < 2 && lb.mode === 'grip' ? (st.mark[li] ? '놓기 취소' : '도약 때 놓기') : '보내기';
      G.line(e.x, e.y, ax, ay, strong ? col : 'rgba(80,80,80,0.35)', strong ? 2 : 1, [5, 5]);
      const tag = `${BIND.first(id)} → ${LIMB[li]} ${verb}${best ? ' (추천)' : ''}`, tw = G.textW(tag, 12, 800) + 12;
      let tx, ty;
      if (O.handMode === 1) { tx = k === 0 ? ax - 16 - tw : ax + 16; ty = ay - 30; } else { tx = ax - tw / 2; ty = best ? ay - 44 : ay + 16; }
      G.panel(tx, ty, tw, 20, strong ? col : 'rgba(255,255,255,0.8)', strong ? '#fff' : 'rgba(0,0,0,0.3)'); G.text(tag, tx + 6, ty + 14, { size: 12, weight: 800, color: '#111' });
      // 같은 표시를 그 손발에도
      const bt = BIND.first(id), bw = G.textW(bt, 11, 800) + 10, bx = e.x + (li % 2 ? 6 : -6 - bw); // 왼쪽 손발은 왼쪽 위, 오른쪽은 오른쪽 위에 붙여 겹치지 않게
      G.panel(bx, e.y - 32, bw, 17, strong ? col : 'rgba(255,255,255,0.8)', '#fff'); G.text(bt, bx + bw / 2, e.y - 19, { size: 11, weight: 800, align: 'center', color: '#111' });
      if (strong) G.circle(e.x, e.y, 18 + (best ? Math.sin(S.t * 10) * 2 : 0), null, col, 2.5);
    });
    if (st.move) { // 몸통 이동(WASD) 방향과 막힌 이유
      const ch = S.p[0], ex = ch.x + st.move.dx * 34, ey = ch.y + st.move.dy * 34, a = Math.atan2(st.move.dy, st.move.dx), col = st.move.blocked ? '#ff5a5a' : '#111';
      G.line(ch.x, ch.y, ex, ey, col, 4); G.line(ex, ey, ex - 10 * Math.cos(a - 0.5), ey - 10 * Math.sin(a - 0.5), col, 4); G.line(ex, ey, ex - 10 * Math.cos(a + 0.5), ey - 10 * Math.sin(a + 0.5), col, 4);
    }
    { // 2단계 ④: 엉덩이가 움직이는 방향(노란 짧은 화살표). 손발이 붙어 있고 25px/s보다 빠를 때만, 길이는 빠르기에 비례(최대 40px)
      const hp = S.p[1], v = Math.hypot(hp.vx, hp.vy);
      if (v > 25 && S.limb.some(l => l.mode === 'grip' || l.mode === 'plant')) {
        const k = Math.min(40, 8 + v * 0.12) / v, ex = hp.x + hp.vx * k, ey = hp.y + hp.vy * k, a = Math.atan2(hp.vy, hp.vx);
        for (const [col, w] of [['rgba(0,0,0,0.55)', 6], ['#ffd166', 3]]) { G.line(hp.x, hp.y, ex, ey, col, w); G.line(ex, ey, ex - 8 * Math.cos(a - 0.5), ey - 8 * Math.sin(a - 0.5), col, w); G.line(ex, ey, ex - 8 * Math.cos(a + 0.5), ey - 8 * Math.sin(a + 0.5), col, w); }
      }
    }
  }
  // 왼쪽 아래 상태 칸: 모으기 세기, 놓을 손·이동 중인 손, 체중 이동, 몸통이 막힌 이유, 최근 경고를 한곳에 모은다(캐릭터 주변에 글이 겹치지 않게)
  function drawStatus() {
    const st = ctrl.st, rows = [], L2 = i => ['왼손', '오른손'][i];
    const marks = [0, 1].filter(i => st.mark[i]), moving = [0, 1].filter(i => st.act[i] && S.limb[i].mode === 'reach');
    let meter = null;
    if (st.phase === 'charge' || st.phase === 'throw') {
      const full = marks.length > 0 || !(S.limb[0].mode === 'grip' || S.limb[1].mode === 'grip');
      const pw = st.phase === 'charge' ? Math.max(0.15, Math.min(1, (st.pt - 0.04) / CTRL.P.FULL_CHARGE)) : st.power;
      meter = { pw: full ? pw : Math.min(pw, CTRL.P.ROCK_MAX), act: S.act, text: st.phase === 'throw' ? '던지는 중' : full ? '모으는 중 → 떼면 뜀' : '모으는 중 → 놓을 손이 없어 몸만 실음' };
    }
    if (marks.length) rows.push({ t: `놓을 손: ${marks.map(L2).join('·')} (주황 고리) · ${BIND.first('cancel')} 모두 취소`, c: '#ffb020' });
    if (moving.length && (st.phase === 'charge' || st.phase === 'throw')) rows.push({ t: `이동 중: ${moving.map(L2).join('·')} (하늘색 고리)`, c: '#29d3e8' });
    if (st.shift) rows.push({ t: `체중 옮기는 중 — 곧 ${L2(st.shift.i)}을 뗌`, c: '#e8e8e4' });
    if (st.leanOn) rows.push({ t: '몸이 뻗는 손을 따라가는 중', c: '#e8e8e4' });
    if (st.phase === 'charge' && st.dip > 1) rows.push({ t: `가라앉기 ${Math.round(st.dip)}px / ${CTRL.P.DIP_MAX} (${BIND.first('moveDown')}) — ${BIND.first('moveUp')}를 누르며 떼면 팔로도 당긴다`, c: '#ffd166' });
    if (st.phase === 'throw' && st.pulling) rows.push({ t: '팔로 끌어 올리는 중 (온몸 도약)', c: '#ffd166' });
    if (st.noStandT !== undefined && S.t - st.noStandT < 1.5) rows.push({ t: '손으로 잡은 턱에는 발을 올려 설 수 없다', c: '#ff8a8a' });
    if (st.phase === 'charge' && (st.sway || st.swayKey)) rows.push({ t: `몸 싣기 ${st.sway < 0 ? '← 왼쪽' : st.sway > 0 ? '오른쪽 →' : ''} ${Math.round(Math.abs(st.sway))}px / ${CTRL.P.SWAY_MAX} (${BIND.first('moveLeft')}·${BIND.first('moveRight')})`, c: '#ffd166' });
    if (st.move && st.move.blocked) rows.push({ t: `몸통: 더 못 감 — ${st.move.blocked} ${st.move.blocked === '손 각도' ? '한계(더 가면 미끄러짐)' : '길이 한계'}`, c: '#ff8a8a' });
    const warns = fx.filter(f => f.kind === 'text').slice(-3);
    for (const f of warns) rows.push({ t: f.text, c: '#ff8a8a', a: Math.min(1, f.t * 2) });
    if (!rows.length && !meter) return;
    const lh = 18, w = Math.max(250, ...rows.map(r => G.textW(r.t, 12, 700) + 16)), h = rows.length * lh + (meter ? 30 : 0) + 8, x = 10, y = H - 32 - h;
    G.panel(x, y, w, h, 'rgba(10,12,16,0.82)');
    let yy = y + 6;
    if (meter) { const c = G.ctx; G.text(meter.text, x + 8, yy + 11, { size: 12, weight: 800, color: '#ffd166' }); c.fillStyle = '#ffd166'; c.fillRect(x + 8, yy + 16, 150 * meter.pw, 6); c.fillStyle = '#7dffb0'; c.fillRect(x + 8, yy + 24, 150 * meter.act, 3);
      G.text('세기 · 근육', x + 164, yy + 25, { size: 10, weight: 600, color: 'rgba(255,255,255,0.6)' }); yy += 30; }
    for (const r of rows) { G.ctx.globalAlpha = r.a ?? 1; G.text(r.t, x + 8, yy + 13, { size: 12, weight: 700, color: r.c }); G.ctx.globalAlpha = 1; yy += lh; }
  }
  function drawLog() {
    const l = plog, avg = l.lag.length ? l.lag.reduce((a, b) => a + b, 0) / l.lag.length : 0, mx = l.lag.length ? Math.max(...l.lag) : 0, slowN = l.lag.filter(x => x > 0.15).length;
    const rows = ['플레이 기록 (새로고침하면 지워짐)', `손발 입력 ${l.sends}회`, `손 선택 헷갈림 추정 ${l.confuse}회 (0.8초 안에 다른 손으로 바꾸거나 취소)`, `미끄러져 놓침 ${l.slips}회`, `손을 보낸 뒤 1.5초 안에 떨어짐 ${l.fallAfterSend}회`,
      `입력 → 손이 떨어지기까지 평균 ${(avg * 1000).toFixed(0)}ms · 최대 ${(mx * 1000).toFixed(0)}ms · 0.15초 넘음 ${slowN}회`];
    G.panel(W - 470, 120, 460, 20 + rows.length * 18, 'rgba(10,12,16,0.85)');
    rows.forEach((t, k) => G.text(t, W - 460, 138 + k * 18, { size: 12, weight: k ? 600 : 800, color: k ? '#e8e8e4' : '#ffd166' }));
  }
  // ---- 키 설정 화면(배틀그라운드식): 동작마다 두 칸, 칸을 고르고 새 키나 마우스 버튼을 누른다
  function settingsRows() { const hm = CTRL.OPT.handMode; return BIND.ACTIONS.filter(a => !a.hm || a.hm === hm); }
  function openSettings() { ui = { sel: 0, slot: 0, cap: null, msg: '', frame: 0 }; }
  function settingsLayout() {
    const rows = settingsRows(), per = Math.ceil(rows.length / 2), out = [];
    rows.forEach((a, k) => { const col = k < per ? 0 : 1, r = col ? k - per : k, x = 30 + col * 452, y = 92 + r * 22; out.push({ a, k, x, y, s0: [x + 268, y - 14, 82, 19], s1: [x + 354, y - 14, 82, 19] }); });
    const by = 92 + per * 22 + 16;
    return { rows: out, per, btn: { mode: [30, 52, 330, 22], reset: [W / 2 - 170, by, 160, 26], close: [W / 2 + 10, by, 160, 26] }, by };
  }
  const inBox = (b, x, y) => x >= b[0] && x <= b[0] + b[2] && y >= b[1] && y <= b[1] + b[3];
  function settingsUpdate(inp) {
    const L = settingsLayout(), n = L.rows.length;
    if (ui.cap) { // 새 입력 받기
      if (ui.cap.t === ui.frame) return;
      if (inp.pressed('Escape')) { ui.cap = null; ui.msg = '취소했다'; return; }
      const code = inp.codes().find(c => c !== 'Escape') || (inp.clicks[0] ? 'Mouse' + inp.clicks[0].button : null);
      if (!code) return;
      BIND.set(ui.cap.id, ui.cap.slot, code);
      const cf = BIND.conflicts(CTRL.OPT.handMode)[ui.cap.id];
      ui.msg = cf ? `주의: ${BIND.name(code)}이(가) '${cf.map(id => BIND.BY[id].label.split(' (')[0].split(' ·')[0]).join("', '")}'에도 쓰이고 있다 (빨간 칸)` : `${BIND.name(code)}로 바꿈 · 저장됨`;
      ui.cap = null; return;
    }
    if (ui.frame > 1 && (inp.pressed('Escape') || BIND.get('settings').some(c => c && !c.startsWith('Mouse') && inp.pressed(c)))) { ui = null; ctrl = CTRL.make(mode); return; }
    const per = L.per, col = ui.sel < n ? (ui.sel < per ? 0 : 1) : -1;
    if (inp.pressed('ArrowDown')) ui.sel = Math.min(n + 1, ui.sel + 1);
    if (inp.pressed('ArrowUp')) ui.sel = Math.max(0, ui.sel - 1);
    if (inp.pressed('ArrowRight')) { if (ui.sel >= n) ui.sel = n + 1; else if (ui.slot === 0) ui.slot = 1; else if (col === 0 && ui.sel + per < n) { ui.sel += per; ui.slot = 0; } }
    if (inp.pressed('ArrowLeft')) { if (ui.sel >= n) ui.sel = n; else if (ui.slot === 1) ui.slot = 0; else if (col === 1) { ui.sel -= per; ui.slot = 1; } }
    const act = () => { if (ui.sel < n) { ui.cap = { id: L.rows[ui.sel].a.id, slot: ui.slot, t: ui.frame }; ui.msg = ''; } else if (ui.sel === n) { BIND.resetAll(); ui.msg = '기본값으로 되돌림 · 저장됨'; } else { ui = null; ctrl = CTRL.make(mode); } };
    if (inp.pressed('Enter') || inp.pressed('NumpadEnter')) { act(); return; }
    if ((inp.pressed('Delete') || inp.pressed('Backspace')) && ui.sel < n) { BIND.set(L.rows[ui.sel].a.id, ui.slot, null); ui.msg = '비움 · 저장됨'; }
    for (const ck of inp.clicks) {
      if (ck.button !== 0) continue; const x = ck.x, y = ck.y;
      if (inBox(L.btn.mode, x, y)) { CTRL.OPT.handMode = CTRL.OPT.handMode === 1 ? 2 : 1; ui.sel = 0; ui.msg = `손 선택 ${CTRL.OPT.handMode}번 방식의 키를 보여 준다`; return; }
      if (inBox(L.btn.reset, x, y)) { ui.sel = n; act(); return; }
      if (inBox(L.btn.close, x, y)) { ui.sel = n + 1; act(); return; }
      for (const r of L.rows) for (const sl of [0, 1]) if (inBox(sl ? r.s1 : r.s0, x, y)) { ui.sel = r.k; ui.slot = sl; ui.cap = { id: r.a.id, slot: sl, t: ui.frame }; ui.msg = ''; return; }
    }
  }
  function drawSettings() {
    const L = settingsLayout(), n = L.rows.length, cf = BIND.conflicts(CTRL.OPT.handMode), c = G.ctx;
    c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, 0, W, H);
    G.panel(16, 10, W - 32, H - 20, 'rgba(18,22,30,0.97)', '#7a8599');
    G.text('키 설정', 30, 36, { size: 18, weight: 800 });
    G.text('칸을 클릭하거나 방향키로 고르고 Enter → 새 키나 마우스 버튼을 누른다 · Delete 비우기 · Esc 닫기 · 바꾸면 바로 저장되고 다시 열어도 남는다', 112, 36, { size: 11.5, color: '#c8ccd6', weight: 500 });
    const mb = L.btn.mode; G.panel(mb[0], mb[1], mb[2], mb[3], '#2c3b55', '#9fb4d9'); G.text(`손 선택 방식: ${CTRL.OPT.handMode}번 ${CTRL.OPT.handMode === 1 ? '(입력마다 손이 정해짐)' : '(게임이 추천하는 손)'} — 클릭해서 바꾸기`, mb[0] + 8, mb[1] + 16, { size: 12, weight: 700 });
    let lastG = null;
    for (const r of L.rows) {
      const a = r.a, sel = ui.sel === r.k;
      let lb = (a.g !== lastG ? a.g + ' · ' : '') + a.label.replace(/…$/, ''); const wt = sel ? 800 : 500; while (G.textW(lb, 11, wt) > 262 && lb.length > 4) lb = lb.slice(0, -2) + '…'; // 칸을 넘지 않게 줄임
      G.text(lb, r.x, r.y, { size: 11, weight: wt, color: sel ? '#ffd166' : '#e8e8e4' }); lastG = a.g;
      if (sel) G.text(a.label, W / 2, L.by + 70, { size: 11.5, weight: 600, align: 'center', color: '#c8ccd6' }); // 고른 동작의 전체 설명
      for (const sl of [0, 1]) {
        const b = sl ? r.s1 : r.s0, code = BIND.get(a.id)[sl], capping = ui.cap && ui.cap.id === a.id && ui.cap.slot === sl, bad = code && cf[a.id];
        G.panel(b[0], b[1], b[2], b[3], capping ? '#ffd166' : bad ? '#7a1f1f' : '#2a2f3a', sel && ui.slot === sl ? '#fff' : bad ? '#ff6b6b' : '#4a5263');
        G.text(capping ? '누르세요…' : BIND.name(code), b[0] + b[2] / 2, b[1] + 14, { size: 11.5, weight: 700, align: 'center', color: capping ? '#111' : code ? '#fff' : '#777' });
      }
    }
    for (const [k, t] of [['reset', '기본값 복원'], ['close', '닫기 (Esc)']]) { const b = L.btn[k], sel = ui.sel === (k === 'reset' ? n : n + 1); G.panel(b[0], b[1], b[2], b[3], sel ? '#3d5a8a' : '#2a2f3a', sel ? '#fff' : '#4a5263'); G.text(t, b[0] + b[2] / 2, b[1] + 17, { size: 13, weight: 800, align: 'center' }); }
    const anyCf = Object.keys(cf).length;
    G.text(ui.msg || (anyCf ? `겹친 입력이 있다(빨간 칸). 같은 입력을 두 동작에 쓰면 둘 다 함께 실행된다` : '겹친 입력 없음'), W / 2, L.by + 48, { size: 12, weight: 700, align: 'center', color: ui.msg.startsWith('주의') || (!ui.msg && anyCf) ? '#ff8a8a' : '#a8e6b8' });
  }
  function draw(c) {
    c.save(); c.translate(-OX, -OY);
    drawWorld(c); drawBody(c);
    for (const f of fx) {
      if (f.kind === 'ring') G.circle(f.x, f.y, 12 + (0.4 - f.t) * 40, null, `rgba(255,255,255,${Math.min(1, f.t * 3)})`, 3);
      else if (f.t > 1.0) G.circle(f.x, f.y, 10, null, '#ff4a4a', 2.5); // 경고 글은 왼쪽 아래 상태 칸으로, 그 자리에는 작은 빨간 고리만
      else if (false) { c.globalAlpha = Math.min(1, f.t * 2); const w = G.textW(f.text, 13, 800) + 14; G.panel(f.x + 14, f.y - 30, w, 22, 'rgba(120,16,16,0.9)'); G.text(f.text, f.x + 21, f.y - 14, { size: 13, weight: 800 }); c.globalAlpha = 1; }
    }
    if (jump && jump.off) { // 이륙 순간의 속도와 그 뒤 가슴이 지나간 길
      const o = jump.off; for (const q of trail) G.circle(q[0], q[1], 2, 'rgba(20,20,20,0.45)');
      const ex = o.x + o.vx * 0.14, ey = o.y + o.vy * 0.14, a = Math.atan2(o.vy, o.vx);
      G.line(o.x, o.y, ex, ey, '#111', 3); G.line(ex, ey, ex - 10 * Math.cos(a - 0.5), ey - 10 * Math.sin(a - 0.5), '#111', 3); G.line(ex, ey, ex - 10 * Math.cos(a + 0.5), ey - 10 * Math.sin(a + 0.5), '#111', 3);
      G.text(`이륙 ${Math.round(Math.hypot(o.vx, o.vy))}px/s · ${Math.round(Math.atan2(-o.vy, o.vx) * 180 / Math.PI)}°${jump.tR !== null && jump.tP !== null ? ` · 손 놓기 ${jump.tR - jump.tP >= 0 ? '+' : ''}${(jump.tR - jump.tP).toFixed(2)}초` : ''}`, o.x - 10, o.y + 22, { size: 12, weight: 800, color: '#111', align: 'right', stroke: 'rgba(255,255,255,0.7)', strokeW: 3 });
    }
    if (swing && Math.max(swing.peak, swing.cur) > 6) { // 반동 표시: 손 아래 수직선과 최근 최고 각도
      const r = 118, pk = Math.max(swing.peak, swing.cur) * Math.PI / 180;
      G.line(swing.ax, swing.ay, swing.ax, swing.ay + r, 'rgba(0,0,0,0.25)', 1.5, [3, 5]);
      for (const sg of [-1, 1]) G.line(swing.ax + Math.sin(sg * pk) * (r - 8), swing.ay + Math.cos(pk) * (r - 8), swing.ax + Math.sin(sg * pk) * (r + 8), swing.ay + Math.cos(pk) * (r + 8), '#111', 3);
      const tr = swing.prev ? (swing.peak > swing.prev + 1 ? ' ▲ 커지는 중' : swing.peak < swing.prev - 1 ? ' ▼ 줄어드는 중' : ' ─') : '';
      G.text(`반동 ${Math.round(Math.max(swing.peak, swing.cur))}°${tr}`, swing.ax, swing.ay - 14, { size: 13, weight: 800, align: 'center', color: '#111', stroke: 'rgba(255,255,255,0.7)', strokeW: 3 });
    }
    if (mode === 'intent' && !bot && !S.dead && !ui) drawIntentHelp(c);
    if (!S.dead && (bot || mode !== 'keys')) { G.line(last.cx - 9, last.cy, last.cx + 9, last.cy, '#111', 2); G.line(last.cx, last.cy - 9, last.cx, last.cy + 9, '#111', 2); G.circle(last.cx, last.cy, 5, null, '#fff', 1.5); }
    c.restore();
    const K = CTRL.KEYMAP[mode], sp = kn(K.power);
    const O = CTRL.OPT, onoff = v => v ? '켬' : '끔';
    const B = BIND.label, B1 = BIND.first, hm = O.handMode;
    const lines = mode === 'intent' ? [
      hm === 1 ? `${B('sendL')} 왼손 · ${B('sendR')} 오른손 보내기 → 겨눈 구간에 닿으면 잡음   ${B('foot')} 누른 채 손 입력 = 발   조준 ${B1('aimUp')}${B1('aimLeft')}${B1('aimDown')}${B1('aimRight')} 또는 마우스`
               : `${B('sendBest')} 추천 손 · ${B('sendOther')} 다른 손 보내기 → 겨눈 구간에 닿으면 잡음   ${B('foot')} 누른 채 = 발   조준 ${B1('aimUp')}${B1('aimLeft')}${B1('aimDown')}${B1('aimRight')} 또는 마우스`,
      `${B1('moveUp')}${B1('moveLeft')}${B1('moveDown')}${B1('moveRight')} 몸통 옮기기(누른 채, 붙은 팔다리로) · ${B('power')} 누르고 있기 = 모으기, 떼기 = 던지기 · 모으는 중 ${B1('moveLeft')}·${B1('moveRight')} = 몸 좌우로 싣기, 떼면서 ${B1('moveUp')} = 팔로도 끌어 올림 · 모으는 중 손 입력 = 놓을 손 지정/취소 · ${B('cancel')} 취소`,
      `손 선택 ${hm}번(${B1('handMode')}) · 잡기 범위 ${O.assistRange === 'near' ? '커서 근처' : '턱 전체'}(${B1('assistRange')}) · 자동 발 ${onoff(O.autoFeet)}(${B1('autoFeet')}) · 체중 이동 ${onoff(O.autoShift)}(${B1('autoShift')}) · 모을 때 자동 싣기 ${C.JOINT ? onoff(O.autoLoad) : '켬(기존 몸 고정)'}(${B1('autoLoad')}) · 닿으면 잡기 ${onoff(O.assist)}(${B1('assist')}) · ${B1('settings')} 키 설정 · ${B1('log')} 기록`,
    ] : mode === 'pick' ? [
      `${kn(K.lh)} 왼손 · ${kn(K.rh)} 오른손 · ${kn(K.lf)} 왼발 · ${kn(K.rf)} 오른발 : 한 번 눌러 집기 (떼어져서 커서를 따라온다. 누르고 있지 않아도 된다)`,
      `좌클릭 : 집은 손발을 그 자리에 붙이기      우클릭 또는 같은 키 다시 : 붙이지 않고 힘 빼기`,
      `${kn(K.swingL)} / ${kn(K.swingR)} 누르고 있기 : 다리를 왼쪽 / 오른쪽으로 (반동)   ${kn(K.tuck)} : 다리 접기   ${sp} : 붙은 팔다리로 밀기·당기기 (커서 쪽)`,
    ] : mode === 'keys' ? [
      `왼손 담당  ${kn(K.lh)} 왼손 · ${kn(K.lf)} 왼발 고르기 → ${kn(K.lUp)}${kn(K.lLeft)}${kn(K.lDown)}${kn(K.lRight)} 로 움직이기 → 같은 키 다시 : 붙이기   ${kn(K.lDrop)} : 힘 빼기`,
      `오른손 담당  ${kn(K.rh)} 오른손 · ${kn(K.rf)} 오른발 고르기 → ${kn(K.rUp)}${kn(K.rLeft)}${kn(K.rDown)}${kn(K.rRight)} 로 움직이기 → 같은 키 다시 : 붙이기   ${kn(K.rDrop)} : 힘 빼기`,
      `${sp} : 붙은 팔다리로 밀기·당기기 (누르고 있는 방향키 쪽, 없으면 위)`,
    ] : [
      `좌클릭(${kn(K.lh)}) 왼손 · 우클릭(${kn(K.rh)}) 오른손 · ${kn(K.lf)} 왼발 · ${kn(K.rf)} 오른발 : 누르고 있는 동안 커서를 따라오고, 떼는 순간 붙는다`,
      `${sp} : 붙은 팔다리로 밀기·당기기 (커서 쪽)`, '',
    ];
    G.panel(8, 6, 716, 84, 'rgba(255,255,255,0.82)');
    G.text(`조작 ${CTRL.MODES[mode]}`, 18, 25, { size: 14, weight: 800, color: '#222' });
    lines.forEach((t, k) => G.text(t, 18, 43 + k * 15, { size: 11.5, color: '#222', weight: 600 }));
    G.text(`${BIND.first('scheme')} 조작 방식 · ${BIND.first('reset')} 다시 · ${BIND.first('st1')}~${BIND.first('st5')} 시작 자세 · ${BIND.first('slow')} 느리게 · ${BIND.first('couple')} 도약 연결 · ${BIND.first('layout')} 연습 배치 · ${BIND.first('phys')} 물리 ${v05 ? 'v0.6' : 'v0.4'} · ${BIND.first('body')} 몸 비율 · ${BIND.label('settings')} 키 설정`, 18, 104, { size: 11, color: '#333', weight: 600, stroke: 'rgba(255,255,255,0.8)', strokeW: 3 });
    G.text(bot ? bot.def.title : `${station}. ${PH.STATIONS[station].name}   시도 ${tries}${slow ? '   느리게 ×0.5' : ''}`, W - 12, 24, { size: 13, align: 'right', color: '#222', weight: 800, stroke: 'rgba(255,255,255,0.8)' });
    G.text(`${bot ? '자동 시연(사람과 같은 입력만 사용) · ' : ''}도약 연결 ${C.COUPLE ? '켬' : '끔'} · ${layout ? '연습 배치' : '기존 벽'}`, W - 12, 42, { size: 11, align: 'right', color: '#333', stroke: 'rgba(255,255,255,0.8)', strokeW: 3 });
    G.text(`몸: ${PH.BODIES[PH.getBody()].short} (${BIND.first('body')}로 바꿈)`, W - 12, 56, { size: 11, align: 'right', color: '#333', stroke: 'rgba(255,255,255,0.8)', strokeW: 3 }); // 지금 몸(도움말 칸과 겹치지 않게 다음 줄)
    const sh = t => t.replace(/^(왼|오른)/, '').replace('클릭', ''), kname = mode === 'intent' ? (O.handMode === 1 ? [B1('sendL'), B1('sendR'), sh(B1('foot')) + '+' + sh(B1('sendL')), sh(B1('foot')) + '+' + sh(B1('sendR'))] : ['추천/다른', '추천/다른', sh(B1('foot')) + '+손', sh(B1('foot')) + '+손']) : mode === 'hold' ? ['좌클릭', '우클릭', kn(K.lf), kn(K.rf)] : [kn(K.lh), kn(K.rh), kn(K.lf), kn(K.rf)];
    for (let i = 0; i < 4; i++) { const m = S.limb[i].mode, on = m === 'reach'; key(c, 10 + i * 126, LIMB[i], on ? (mode === 'intent' && i >= 2 && !ctrl.st.manual[i] ? '자동' : '움직이는 중') : m === 'free' ? '힘 빠짐' : '붙음', on, COL[i], kname[i]); }
    key(c, 514, mode === 'intent' ? '모으기·던지기' : '힘주기', '', last.power, '#ffd166', mode === 'intent' ? B1('power') : sp);
    if (mode === 'intent' && recent.length && !ui) recent.forEach((r, k) => { const y = H - 40 - (recent.length - 1 - k) * 20, w = G.textW(r.text, 12, 800) + 14; G.ctx.globalAlpha = Math.min(1, r.t * 2); G.panel(W - 12 - w, y - 15, w, 19, 'rgba(10,12,16,0.8)'); G.text(r.text, W - 12 - w + 7, y, { size: 12, weight: 800, color: '#ffd166' }); G.ctx.globalAlpha = 1; });
    if (mode === 'intent' && !bot && !ui && !(endT > 0)) drawStatus(); // 떨어진 뒤에는 안내 띠와 겹치지 않게 상태 칸을 숨긴다
    if (showLog && mode === 'intent') drawLog();
    if (ui) drawSettings();
    if (remap) { G.panel(W / 2 - 220, 200, 440, 70, 'rgba(20,30,60,0.95)', '#fff'); G.text(`키 다시 지정 (${remap.i + 1}/${remap.list.length}) — Esc 그만`, W / 2, 226, { size: 13, align: 'center', weight: 600 }); G.text(`「${CTRL.LABEL[remap.list[remap.i]]}」에 쓸 키를 누르세요`, W / 2, 252, { size: 18, align: 'center', weight: 800 }); }
    G.text('실험 빌드 v0.8.1', W - 10, H - 10, { size: 11, align: 'right', color: 'rgba(255,255,255,0.6)', weight: 500 });
    if (endT > 0) G.banner('매트에 떨어짐 — 바로 다시', why && (!air || why.t >= air.t - 0.05) ? why.text : hint() ? '도약이 다음 턱에 이어지지 않았다' : air && air.gap > 0 && air.gap < 1e8 ? `손이 잡을 곳에 닿지 못했다 — 가장 가까웠을 때 ${Math.ceil(air.gap)}px 모자람` : air && air.gap <= 0 ? '손이 닿는 거리였지만 잡지 않았다(버튼을 떼야 잡는다)' : '붙잡은 곳 없이 떨어졌다', 'fail', 380);
    if (endT > 0 && hint()) { const t = hint(), w = G.textW(t, 14, 800) + 28; G.panel(W / 2 - w / 2, 458, w, 28, 'rgba(255,214,102,0.96)'); G.text(t, W / 2, 477, { size: 14, weight: 800, align: 'center', color: '#111' }); }
    else if (S.won) G.banner('목표 도달!', `${S.t.toFixed(1)}초 · 시도 ${tries} — R 또는 스페이스로 다시`, 'win', 400);
    else if (bot && bot.m.done) G.banner('건너가서 안정됨', '두 손 + 한 발로 버티는 중', 'win', 440);
  }
  G.run(game, { title: '등반 조작 실험실' });
})();
