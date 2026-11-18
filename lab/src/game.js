// 등반 조작 실험실 · 화면과 입력
'use strict';
(() => {
  const W = G.W, H = G.H, OX = -30, OY0 = 130, C = PH.C, BUILD = 'v0.11.0';
  let OY = OY0; // 화면 세로 기준. 과제가 정하면(view) 그 값을 쓴다: 높은 턱이 화면 밖으로 나가지 않게
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
  window.__lab = { keys: () => KEYS.log.slice(), chart: () => ({ mode: chartMode, view: VIEW.start, span: VIEW.span, manual: VIEW.manual, end: CH.end, top: tlTop, rect: CH.rect && { ...CH.rect }, plot: CH.plot && { ...CH.plot }, ax: CH.ax, pad: CH.pad, pps: CH.pps, custom: !!CHR[chartMode], ready: KEYS.ready, panel: !!KEYS.panel }),
    practice: () => ({ phase, ended: ended && { ...ended }, frames: trk.frames.length, rp: rp && { t: rp.t, from: rp.from, to: rp.to, playing: rp.playing, speed: rp.speed }, capture: HUD.capture, cursor: HUD.cursor, hits: HUD.hits.map(h => ({ ...h })) }), lesson: () => ({ i: lessonI, demo: !!demo, ok: lessonOkT, demoOk, demoEnd, rec, demoRec, lastRec, kept, note: lessonNote, ghost: ghost ? { t: ghost.S.t, x: ghost.S.p[0].x, y: ghost.S.p[0].y, dead: ghost.S.dead } : null }), hint: () => hint(), jump: () => jump, ctrlState: () => ctrl.st, opt: () => CTRL.OPT, aim, plog, ui: () => ui, bind: BIND, raw: () => { const m = G.input.mouse; return (m.down[0] || G.input.key('KeyQ') ? 'L' : '-') + (m.down[2] || G.input.key('KeyE') ? 'R' : '-'); }, get s() { return S; }, get bot() { return bot; }, finished: false, results: [] };

  // ---- 연습 과제·시범·입력 기록
  // 입력 기록(rec): 이번 시도에서 누른 것. 시범을 재생하는 동안에는 시범 입력이 같은 방법으로 기록되어 demoRec에 남는다. 그래서 시범 차트와 내 차트를 같은 눈금으로 견줄 수 있다
  let lessonI = -1, demo = null, rec = LESSON.recorder(), demoRec = null, lastRec = null, lmem = {}, lessonOkT = null, demoMsgT = 0, demoOk = null, demoEnd = null, ghost = null, ghostOn = true;
  // 시도의 단계: live(하는 중) → ended(끝남: 결과와 다시하기·리플레이) → replay(리플레이). trk = 몸의 모습을 적어 둔 자취, rp = 재생 시계
  let phase = 'live', ended = null, trk = PRACTICE.track(), rp = null, rpLive = null, rpHold = 0, wonT = null; // demoEnd: 시범이 끝난 순간의 손발 자리(화면 표시를 바꿔도 계산이 같은지 시험에서 견준다)
  const lesson = () => lessonI >= 0 ? LESSON.LIST[lessonI] : null;
  // 과제에 들어올 때: 지금 설정을 보관하고(kept), 결과를 바꾸는 것들을 시범 기준에 맞춘다. 나갈 때 보관한 설정으로 되돌린다.
  // 시범·유령은 withBase로 늘 기준 설정에서 계산하므로, 과제 안에서 플레이어가 보조 설정을 바꿔도 영향을 받지 않는다
  let kept = null, lessonNote = [], lockT = 0;
  const OPT_NAME = { autoFeet: ['자동 발', v => v ? '켬' : '끔'], autoShift: ['체중 이동', v => v ? '켬' : '끔'], assist: ['닿으면 잡기', v => v ? '켬' : '끔'], assistRange: ['잡기 범위', v => v === 'near' ? '커서 근처' : '턱 전체'], autoLoad: ['자동 싣기', v => v ? '켬' : '끔'] };
  function enterLessons() {
    const B = LESSON.BASE, O = CTRL.OPT; kept = { opt: { ...O }, body: PH.getBody(), mode, layout, v05, couple: C.COUPLE, station }; lessonNote = [];
    for (const k of LESSON.TUNED) if (O[k] !== B.opt[k]) { lessonNote.push(`${OPT_NAME[k][0]} ${OPT_NAME[k][1](O[k])} → ${OPT_NAME[k][1](B.opt[k])}`); O[k] = B.opt[k]; }
    if (PH.getBody() !== B.body) { lessonNote.push(`몸 ${PH.BODIES[PH.getBody()].short} → ${PH.BODIES[B.body].short}`); PH.setBody(B.body); }
    if (mode !== B.mode) { lessonNote.push('조작 방식 → D안'); mode = B.mode; }
    if (layout !== B.layout) { lessonNote.push('벽 → 기존 벽'); layout = B.layout; }
    if (v05 !== B.physOn) { lessonNote.push('물리 → v0.6'); v05 = B.physOn; setPhys(v05); }
    if (C.COUPLE !== B.couple) { lessonNote.push('도약 연결 → 끔'); C.COUPLE = B.couple; }
  }
  function leaveLessons() {
    if (!kept) return; for (const k of LESSON.TUNED) CTRL.OPT[k] = kept.opt[k];
    PH.setBody(kept.body); mode = kept.mode; layout = kept.layout; v05 = kept.v05; setPhys(v05); C.COUPLE = kept.couple; station = kept.station; kept = null; lessonNote = [];
  }
  function withBase(fn) { const keep = { ...CTRL.OPT }; Object.assign(CTRL.OPT, LESSON.BASE.opt); try { return fn(); } finally { Object.assign(CTRL.OPT, keep); } }
  function setLesson(i) { // i = -1이면 자유 연습(연습용 턱을 치우고 들어오기 전 설정으로 되돌린다)
    const was = lessonI >= 0; lessonI = i; const l = lesson();
    if (l && !was) enterLessons(); if (!l && was) leaveLessons();
    world = PH.makeWorld(layout); OY = l && l.view !== undefined ? l.view : OY0; aim.mx = null;
    if (l) { for (const r of l.extra || []) world.push(PH.rect(...r)); station = l.station; }
    demo = null; demoRec = null; lastRec = null; tries = 0; reset();
  }
  function startDemo() { if (!lesson()) return; reset(); demo = { pl: LESSON.player(lesson()) }; demoRec = rec; rec.meta.demo = true; rec.meta.opt = { ...LESSON.BASE.opt }; tries--; }
  // 기록에 붙이는 것: 어느 판에서, 어떤 설정·출발 상태로 한 시도인지(나중에 저장·재생할 때 같은 조건인지 확인하는 데 쓴다)
  const recMeta = () => ({ build: BUILD, phys: PH.VERSION, lessons: LESSON.VERSION, lesson: lesson() ? lesson().id : null, station, body: PH.getBody(), mode, layout, physOn: v05, couple: C.COUPLE, opt: { ...CTRL.OPT }, extra: lesson() ? lesson().extra || [] : [], start: S.p.map(q => [+q.x.toFixed(3), +q.y.toFixed(3)]) });
  function reset(st) {
    if (rec.t0 !== null && !demo) lastRec = rec; // 방금 한 시도는 "이전 시도"로 남긴다
    rec = LESSON.recorder(); demo = null; ghost = null; lmem = {}; lessonOkT = null; phase = 'live'; ended = null; trk = PRACTICE.track(); rp = null; rpLive = null; wonT = null; VIEW.reset();
    if (st) station = st;
    if (autoList.length) { bot = BOTS.make(autoList[autoI % autoList.length]); station = bot.def.station; }
    S = PH.create(world, station); tries++; fx = []; why = null; endT = 0; doneT = 0; air = null; jump = null; trail = []; swing = null; lastMiss = null; ctrl = CTRL.make(mode); rec.meta = recMeta();
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
    if (aim.mx === null || Math.abs(m.x - aim.mx) > 0.5 || Math.abs(m.y - aim.my) > 0.5) { if (aim.mx !== null && !HUD.capture) { aim.x = m.x + OX; aim.y = m.y + OY; } aim.mx = m.x; aim.my = m.y; } // 마우스가 차트·단추 위에 있을 때는 조준점이 따라가지 않는다
    const dx = (BIND.down('aimRight', inp) ? 1 : 0) - (BIND.down('aimLeft', inp) ? 1 : 0), dy = (BIND.down('aimDown', inp) ? 1 : 0) - (BIND.down('aimUp', inp) ? 1 : 0);
    if (dx || dy) { aim.held += dt; const sp = BIND.down('aimSlow', inp) ? 90 : Math.min(520, 220 + 600 * aim.held), n = Math.hypot(dx, dy); aim.x += dx / n * sp * dt; aim.y += dy / n * sp * dt; } else aim.held = 0;
    aim.x = Math.max(OX + 4, Math.min(OX + W - 4, aim.x)); aim.y = Math.max(OY + 4, Math.min(OY + H - 30, aim.y));
  }
  function readInput(inp) {
    let io;
    if (mode === 'intent') {
      const footShift = BIND.get('foot').some(c => c === 'ShiftLeft' || c === 'ShiftRight');
      io = { mx: aim.x, my: aim.y, down: id => BIND.down(id, inp), pressed: id => BIND.pressed(id, inp), pressedShift: id => footShift && BIND.pressedWithShift(id, inp), code: id => BIND.active(id, inp) };
      if (demo) { io = demo.pl.step(S.t); aim.x = io.mx; aim.y = io.my; } // 시범: 적어 둔 입력을 같은 시각에 넣는다(조준점도 시범이 옮긴다)
    } else {
      const m = inp.mouse; io = { mx: m.x + OX, my: m.y + OY, lheld: m.down[0], rheld: m.down[2], lmb: inp.clicks.some(c => c.button === 0), rmb: inp.clicks.some(c => c.button === 2), lshift: inp.clicks.some(c => c.button === 0 && c.shift), rshift: inp.clicks.some(c => c.button === 2 && c.shift), key: c => inp.key(c), pressed: c => inp.pressed(c) };
    }
    const out = demo ? withBase(() => ctrl.step(S, io, 1 / 120)) : ctrl.step(S, io, 1 / 120); // 시범은 플레이어 설정과 상관없이 기준 설정으로
    if (mode === 'intent') rec.tick(S.t, io, ctrl.st.sent, demo ? LESSON.BASE.opt : CTRL.OPT);
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
    else if (e.type === 'mat') { if (S.t - plog.sendT < 1.5) plog.fallAfterSend++; endT = practice() ? 0 : bot ? 2.6 : 1.6; G.sfx.thud(); G.shake(5, 0.2); } // 연습(조작 D안)에서는 바로 다시 시작하지 않고 결과 화면으로 간다
    else if (e.type === 'win') { if (lessonI < 0) G.sfx.win(); }
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
      hudUpdate(inp); if (HUD.click && doClick(HUD.click)) return;
      if (!bot) {
        const P_ = id => BIND.pressed(id, inp);
        if (P_('settings')) { if (mode === 'intent') openSettings(); else remap = { list: Object.keys(CTRL.KEYMAP[mode]), i: 0 }; return; }
        if (P_('lessonNext')) { setLesson(lessonI + 1 >= LESSON.LIST.length ? -1 : lessonI + 1); return; }
        if (P_('demo')) { if (lessonI < 0) setLesson(0); startDemo(); return; }
        if (P_('chart')) setChartMode(CHART_NEXT[chartMode]);
        if (P_('replay') && mode === 'intent') { phase === 'replay' ? closeReplay() : openReplay(); return; }
        if (chartMode !== 'off') { const dir = (BIND.down('chartRight', inp) ? 1 : 0) - (BIND.down('chartLeft', inp) ? 1 : 0); if (dir) VIEW.pan(dir * dt * VIEW.span * 0.55, CH.end); // 시간축을 손으로 옮기면 다시 시작할 때까지 자동으로 따라가지 않는다
          if (P_('chartZoomIn')) VIEW.zoom(1 / 1.3, VIEW.start + VIEW.span / 2, CH.end); if (P_('chartZoomOut')) VIEW.zoom(1.3, VIEW.start + VIEW.span / 2, CH.end); if (P_('chartFit')) VIEW.fit(CH.end); }
        if (P_('ghost')) { ghostOn = !ghostOn; if (!ghostOn) ghost = null; }
        if (P_('reset')) { reset(); return; }
        for (let k = 1; k <= 5; k++) if (P_('st' + k)) { if (lessonI >= 0) setLesson(-1); tries = 0; reset(k); return; }
        // 과제 중에는 결과를 바꾸는 큰 설정(조작 방식·도약 연결·벽·물리·몸)을 잠근다. 시범 기준과 달라지면 시범을 따라 할 수 없기 때문이다
        const locked = lessonI >= 0; if (locked && ['scheme', 'couple', 'layout', 'phys', 'body'].some(P_)) lockT = 4;
        if (lockT > 0) lockT -= dt;
        if (!locked && P_('scheme')) { mode = MODE_LIST[(MODE_LIST.indexOf(mode) + 1) % MODE_LIST.length]; tries = 0; reset(); return; }
        if (P_('slow')) slow = !slow;
        if (!locked && P_('couple')) C.COUPLE = C.COUPLE ? 0 : 0.15;
        if (!locked && P_('layout')) { layout = layout ? null : 'near'; world = PH.makeWorld(layout); tries = 0; reset(); return; }
        if (!locked && P_('phys')) { v05 = !v05; setPhys(v05); tries = 0; reset(); return; }
        if (!locked && P_('body')) { const order = ['base', 'prop', 'joint']; PH.setBody(order[(order.indexOf(PH.getBody()) + 1) % order.length]); tries = 0; reset(); return; }
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
        if (phase === 'live') { updateAim(inp, dt); if (mode === 'intent') { noteInputs(inp); noteUsed(inp); } }
        if (demoMsgT > 0) demoMsgT -= dt;
      }
      if (phase === 'replay') { replayUpdate(dt, inp); return; }
      if (phase === 'ended') return; // 결과 화면: 단추와 키(다시하기·리플레이·다음 과제)만 받는다
      if (endT > 0) { endT -= dt; if (endT <= 0 || (!bot && endT < 1.2 && inp.any())) { if (bot) nextAuto(false); reset(); } return; }
      if (S.won && !bot && lessonI < 0 && !practice()) { if (BIND.pressed('power', inp) || inp.pressed('Enter')) reset(); }
      tick++; if (slow && tick % 2) return;
      last = bot ? bot.step(S) : readInput(inp);
      PH.step(S, last, dt);
      stepGhost();
      if (lesson() && lessonOkT === null && !S.dead && lesson().done(S, lmem)) lessonOkT = S.t;
      if (demo && S.t >= lesson().T) { demoOk = lessonOkT !== null; demoEnd = S.p.map(q => [q.x, q.y]); demoMsgT = 3; reset(); tries--; return; } // 시범이 끝나면 같은 자세로 돌아가 직접 해 볼 차례
      // 공중에 떠 있는 동안 손이 잡을 곳에 가장 가까웠던 거리를 기억해 둔다(실패 원인 표시용)
      if (S.limb.some(l => l.mode === 'grip' || l.mode === 'plant')) { air = null; }
      else { if (!air) air = { t: S.t, gap: 1e9 }; if (S.t - air.t > 0.25) for (const i of [0, 1]) { const q = PH.nearestGrip(world, S.p[2 + i].x, S.p[2 + i].y); air.gap = Math.min(air.gap, q.d - C.GRAB_R); } }
      track(dt);
      for (const e of S.events) note(e);
      if (practice()) { // 리플레이용 자취를 적고, 시도가 끝났는지 본다(떨어짐 = 바로, 성공 = 0.8초 더 버틴 뒤)
        if (rec.t0 === null) trk.hold(S, frameExtra()); else trk.push(S, frameExtra());
        if (!lesson() && S.won && wonT === null) wonT = S.t;
        const okT = lesson() ? lessonOkT : wonT;
        if (S.dead) endAttempt('fail'); else if (okT !== null && S.t - okT >= 0.8) endAttempt('ok');
      }
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
      c.fillStyle = pl.goal && !lesson() ? '#d9a521' : TYPE_COL[pl.type]; c.fill(); c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 1.5; c.stroke();
      if (pl.type !== 'rock') for (const e of pl.edges) if (e.grip) G.line(e.ax, e.ay, e.bx, e.by, pl.type === 'sloper' ? '#e9e2ff' : '#fff6d8', 3.5); // 손으로 잡을 수 있는 면
    }
    const lab = (id, t, dx, dy) => { const pl = world.find(p => p.id === id); G.text(t, pl.cx + dx, pl.cy + dy, { size: 11, align: 'center', color: 'rgba(40,40,40,0.75)', weight: 700 }); };
    lab('A', '깊은 턱', -40, 26); lab('B', '턱', 30, 26); if (!lesson()) lab('G', '목표: 두 손으로 잡기', 0, -14); lab('J', '저그', 0, 24); lab('S', '둥근 면(미끄러움)', 0, 24); lab('F1', '발판', 0, 6); lab('F3', '발판', 0, 24); lab('F4', '발판', 0, 24); lab('P', '반동 연습', 0, -14); lab('R', '바위', 6, 60);
    const mk = lesson() && lesson().mark, mp = mk && world.find(p => p.id === mk[0]); // 과제 목표: 금색 테두리와 이름표
    if (mp) { c.beginPath(); mp.pts.forEach((q, i) => i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])); c.closePath(); c.strokeStyle = '#f2b200'; c.lineWidth = 3; c.stroke();
      const tw = G.textW(mk[1], 11, 800) + 14, ty = Math.min(...mp.pts.map(q => q[1])) - 26; G.panel(mp.cx - tw / 2, ty, tw, 18, 'rgba(242,178,0,0.95)'); G.text(mk[1], mp.cx, ty + 13, { size: 11, weight: 800, align: 'center', color: '#1d1d1d' }); }
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
  // ---- 입력 UI(v0.10.0, 사용자 승인 시안 Climb_Input_UI_Handoff_v1): 키캡은 지금 설정된 실제 입력의 모양으로, 색은 수행하는 동작으로 그린다.
  // 어떤 입력인지는 BIND, 키캡 글자는 입력 도감(ClimbInputCatalog), 동작 이름과 색은 ACT(action-names.js)가 따로 맡는다
  const UI = ClimbInputUI, ROLE = UI.catalog.roles, KEYS = { ready: false, panel: null, log: [], amt: {}, last: {}, layout: G.params.get('enter') === 'iso' ? 'iso' : undefined, reduce: G.params.get('motion') === 'reduce' || !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) };
  UI.loadFrom(INPUT_ASSETS.templates).then(() => { KEYS.ready = true; }).catch(() => {}); // 그림이 준비되기 전이나 실패하면 글자 칸으로 대신 그린다
  { const im = new Image(); im.onload = () => { KEYS.panel = im; }; im.src = INPUT_ASSETS.panel; }
  const keyW = (code, h) => { const z = UI.sizes[UI.catalog.resolve(code, { layout: KEYS.layout }).shape]; return h * (z[0] + 20) / (z[1] + 20); };
  const keysW = (codes, h) => codes.reduce((a, cd, k) => a + keyW(cd, h) + (k ? 9 : 0), 0);
  const firstCode = id => BIND.get(id).find(Boolean) || null;
  // 그 동작에 가장 최근에 실제로 쓴 입력(주·보조 가운데). 다시 지정해서 더는 그 동작의 입력이 아니면 지금 설정의 첫 칸을 쓴다 → 설정을 바꾸면 바로 바뀐다
  // 최근에 쓴 입력은 계산 걸음마다 적어 둔다(noteUsed). 클릭처럼 한순간 지나가는 입력은 그리는 때에는 이미 사라져 있기 때문이다
  // 손 입력을 발 조종 키와 함께 쓴 것은 따로 적는다('foot+동작'). 손은 Q로, 발은 Shift+좌클릭으로 보내는 사람도 있기 때문이다
  function noteUsed(inp) { const foot = BIND.down('foot', inp); for (const a of BIND.ACTIONS) { const cd = BIND.active(a.id, inp); if (cd) KEYS.last[a.id.startsWith('send') && (foot || BIND.pressedWithShift(a.id, inp)) ? 'foot+' + a.id : a.id] = cd; } }
  function usedCode(id, key = id) { return BIND.get(id).includes(KEYS.last[key]) && KEYS.last[key] ? KEYS.last[key] : firstCode(id); }
  // 눌림 정도(0~1): 누를 때 85ms, 뗄 때 115ms에 걸쳐 바뀐다. 움직임 줄이기 설정이면 바로 바뀐다
  function pressAmt(key, down) { const now = performance.now(), e = KEYS.amt[key] || (KEYS.amt[key] = { v: down ? 1 : 0, t: now }), d = Math.min(100, now - e.t); e.t = now;
    e.v = KEYS.reduce ? (down ? 1 : 0) : down ? Math.min(1, e.v + d / 85) : Math.max(0, e.v - d / 115); return e.v; }
  function drawKey(code, x, y, h, o = {}) { // 키캡 하나. 돌려주는 값: 차지한 너비
    const c = G.ctx, w = keyW(code, h), role = o.role || 'neutral', down = o.disabled ? false : o.down !== undefined ? !!o.down : BIND.codeDown(code, G.input), p = pressAmt(`${o.where}|${o.action}|${code}`, down);
    KEYS.log.push({ where: o.where || '', action: o.action || '', code: code || 'Unassigned', role, state: o.disabled ? 'disabled' : down ? 'pressed' : 'idle', label: UI.catalog.resolve(code).corner ? `${UI.catalog.resolve(code).corner} ${UI.catalog.resolve(code).label}` : UI.catalog.resolve(code).label, shape: UI.catalog.resolve(code, { layout: KEYS.layout }).shape, fallback: !!UI.catalog.resolve(code).fallback, h, press: p });
    // 작게 그릴 때는 왼·오른 수정 키와 숫자패드를 구석 글자 대신 키 글자 앞에 적는다(L Shift, NUM 1). 구석 글자는 이 크기에서 읽히지 않는다
    const it = UI.catalog.resolve(code), label = it.corner ? `${it.corner} ${it.label}` : undefined;
    if (KEYS.ready) { try { UI.render(c, code, { x, y, w, h }, { role, state: o.disabled ? 'disabled' : 'idle', press: p, big: h < 40, label, layout: KEYS.layout }); return w; } catch (e) { KEYS.ready = false; } }
    G.panel(x + 1, y + h * 0.18, w - 2, h * 0.64, ROLE[role] || ROLE.neutral); G.text(BIND.name(code), x + w / 2, y + h / 2 + 3.5, { size: Math.max(8, Math.min(11, h * 0.3)), weight: 800, align: 'center', color: '#2b2b2b' });
    return w;
  }
  function drawKeys(codes, x, y, h, o = {}) { // 함께 누르는 조합은 +로 잇는다(주·보조처럼 "둘 중 하나"와 다르다). 조합은 모두 눌려야 눌림으로 보인다
    const all = codes.every(cd => BIND.codeDown(cd, G.input)); let xx = x;
    codes.forEach((cd, k) => { if (k) { G.text('+', xx + 4.5, y + h / 2 + 4, { size: 11, weight: 800, align: 'center', color: 'rgba(243,236,214,0.75)' }); xx += 9; } xx += drawKey(cd, xx, y, h, { ...o, down: o.disabled ? false : o.forceDown !== undefined ? o.forceDown : codes.length > 1 ? all : o.down }); });
    return xx - x;
  }
  // 패널 바탕(아홉 조각으로 늘려 그린다). s = 그림 1px이 화면에서 차지하는 크기
  function panelSkin(c, x, y, w, h, s = 0.42) {
    const im = KEYS.panel; if (!im) { c.beginPath(); G.roundRect(x, y, w, h, 16); c.fillStyle = 'rgba(28,35,29,0.97)'; c.fill(); c.strokeStyle = '#636a4b'; c.lineWidth = 3; c.stroke(); return; }
    const iw = 1011, ih = 389, m = 120, dx = x - 11 * s, dy = y - 29 * s, dw = w + 23 * s, dh = h + 56 * s, cs = m * s;
    const cols = [[0, m, dx, cs], [m, iw - 2 * m, dx + cs, dw - 2 * cs], [iw - m, m, dx + dw - cs, cs]], rows = [[0, m, dy, cs], [m, ih - 2 * m, dy + cs, dh - 2 * cs], [ih - m, m, dy + dh - cs, cs]];
    for (const [sy, sh, ty, th] of rows) for (const [sx, sw, tx, tw] of cols) if (tw > 0 && th > 0) c.drawImage(im, sx, sy, sw, sh, tx, ty, tw, th);
  }
  function wrap(t, maxW, size, weight = 600) { const out = []; let cur = ''; for (const w of t.split(' ')) { const nx = cur ? cur + ' ' + w : w; if (G.textW(nx, size, weight) > maxW && cur) { out.push(cur); cur = w; } else cur = nx; } if (cur) out.push(cur); return out; }
  function pill(c, x, y, w, h, fill, stroke, lw = 1.5) { const r = Math.min(h / 2, w / 2); c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2); c.lineTo(x + r, y + h); c.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); } }
  function glass(c, x, y, w, h, r = 12) { const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(22,26,36,0.93)'); g.addColorStop(1, 'rgba(10,12,18,0.90)');
    c.save(); c.shadowColor = 'rgba(0,0,0,0.35)'; c.shadowBlur = 14; c.shadowOffsetY = 3; c.beginPath(); G.roundRect(x, y, w, h, r); c.fillStyle = g; c.fill(); c.restore();
    c.beginPath(); G.roundRect(x, y, w, h, r); c.strokeStyle = 'rgba(255,255,255,0.14)'; c.lineWidth = 1; c.stroke(); }
  const rgba = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;
  function diamond(c, x, y, r, fill, stroke) { c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1.6; c.stroke(); } }

  // ---- 화면 UI의 마우스 처리(차트 옮기기·크기 바꾸기·시간축, 결과·리플레이 버튼). 그리는 쪽이 누를 수 있는 곳(hits)을 알려 주고, 다음 걸음에서 판정한다
  const HUD = { hits: [], hot: null, click: null, drag: null, capture: false, pressIn: null, overChart: false, wheel: 0, cursor: 'none' };
  window.addEventListener('wheel', e => { HUD.wheel += e.deltaY; if (HUD.overChart) e.preventDefault(); }, { passive: false });
  function hudBtn(id, x, y, w, h, label, o = {}) { // 누를 수 있는 칸 하나(글자가 있으면 글자도 그린다)
    const c = G.ctx, hot = HUD.hot === id && !o.off; c.beginPath(); G.roundRect(x, y, w, h, Math.min(7, h / 2)); c.fillStyle = hot ? 'rgba(243,236,214,0.26)' : 'rgba(243,236,214,0.1)'; c.fill(); c.strokeStyle = hot ? INK : 'rgba(243,236,214,0.32)'; c.lineWidth = 1; c.stroke();
    if (label) G.text(label, x + w / 2, y + h / 2 + (o.size || 10) * 0.36, { size: o.size || 10, weight: 800, align: 'center', color: INK });
    if (!o.off) HUD.hits.push({ id, x, y, w, h });
  }
  // ---- 입력 비교 차트: 줄은 "수행한 동작"(결정된 팔다리, 누르고 있던 몸 동작)이고 줄 머리에는 키캡만 둔다. 시범 = 윤곽선, 내 입력 = 채움. 순간 입력 = 마름모, 누르고 있기 = 구간.
  // 0초 = 첫 입력(시범도 나도 각자의 첫 입력). 길이와 자리는 기록의 시각으로 계산한다. 색은 동작을 구분할 뿐 성공·실패를 뜻하지 않는다.
  // 창처럼 다룬다: 끌어서 옮기고, 가장자리를 끌어 크기를 바꾼다. 시간축은 전체 보기·확대·축소·옮기기를 할 수 있고, 리플레이에서는 누른 곳의 시각으로 간다
  const INK = '#f3ecd6', DIM = 'rgba(243,236,214,0.6)';
  const CHART_NEXT = { mini: 'full', full: 'off', off: 'mini' }, CHART_VERB = { mini: '펼치기', full: '끄기', off: '켜기' };
  // 손대지 않은 차트는 줄 수에 맞춰 아래쪽에 붙여 그린다(작게·펼침). 옮기거나 크기를 바꾸면 그 사각형(CHR)을 기억한다(다시 실행해도 남는다)
  const CH_DEF = { mini: { x: 378, w: 438, bottom: 498, lane: 18, span: 4 }, full: { x: 14, w: 932, bottom: 498, lane: 40, span: 3 } }, CH_STORE = 'climbChart_v1', CHR = { mini: null, full: null };
  try { const sv = JSON.parse(localStorage.getItem(CH_STORE) || 'null'); if (sv) for (const k of ['mini', 'full']) if (sv[k] && [sv[k].x, sv[k].y, sv[k].w, sv[k].h].every(Number.isFinite)) CHR[k] = { x: sv[k].x, y: sv[k].y, w: sv[k].w, h: sv[k].h }; } catch (e) {}
  const saveChart = () => { try { localStorage.setItem(CH_STORE, JSON.stringify(CHR)); } catch (e) {} };
  let chartMode = ['mini', 'full', 'off'].includes(G.params.get('chart')) ? G.params.get('chart') : 'mini', tlTop = 540;
  const VIEW = PRACTICE.view(CH_DEF[chartMode === 'full' ? 'full' : 'mini'].span), CH = { rect: null, plot: null, ax: 0, pad: 0, pps: 1, end: 0, minH: 60, n: 1 };
  function setChartMode(m) { chartMode = m; if (m !== 'off') { VIEW.span0 = CH_DEF[m].span; if (!VIEW.manual) VIEW.span = VIEW.span0; } }
  const METR = { big: { head: 38, axis: 16, foot: 24 }, small: { head: 17, axis: 12, foot: 5 } };
  function chartGeom(n) { // n = 줄 수. 돌려주는 값: 사각형, 치수, 줄 높이
    const d = CH_DEF[chartMode], cu = CHR[chartMode], minH = METR.small.head + METR.small.axis + METR.small.foot + n * 12;
    if (!cu) { const big = chartMode === 'full', m = METR[big ? 'big' : 'small'], h = m.head + m.axis + m.foot + n * d.lane; return { r: { x: d.x, y: d.bottom - h, w: d.w, h }, m, big, laneH: d.lane, minH }; }
    const r = PRACTICE.fitRect(cu, { w: 240, h: minH }, { x: 0, y: 0, w: W, h: H }), big = (r.h - 78) / n >= 26 && r.w >= 430, m = METR[big ? 'big' : 'small'];
    return { r, m, big, laneH: Math.min(64, (r.h - m.head - m.axis - m.foot) / n), minH };
  }
  function tlModel(master, mine) {
    const lanes = new Map(), lane = (key, mk) => { if (!lanes.has(key)) lanes.set(key, { key, ...mk(), m: [], i: [] }); return lanes.get(key); };
    const add = (r, who) => { if (!r) return; const z = r.zero(), evs = [];
      for (const b of r.all()) if (ACT.HOLD[b.id]) evs.push({ t: b.a, key: b.id, mk: () => ({ kind: 'hold', id: b.id, ...ACT.HOLD[b.id] }), e: { a: b.a - z, b: b.b - z, live: !!b.live, code: b.code || null } });
      for (const t of r.taps) evs.push({ t: t.t, key: 'limb' + t.limb, mk: () => ({ kind: 'tap', limb: t.limb, ...ACT.LIMB[t.limb] }), e: { a: t.t - z, mark: t.phase === 'charge', id: t.id, code: t.code || null, mod: t.mod || null } });
      evs.sort((p, q) => p.t - q.t); for (const ev of evs) lane(ev.key, ev.mk)[who].push(ev.e); };
    add(master, 'm'); add(mine, 'i'); // 줄 순서: 시범에서 처음 나온 순서, 그다음 내 입력에만 있는 것
    const out = [...lanes.values()]; let end = 0; for (const L of out) for (const e of L.m.concat(L.i)) end = Math.max(end, e.b ?? e.a);
    return { lanes: out, end };
  }
  // 그 줄에 보일 키: 이번 시도에서 실제로 누른 입력이 있으면 그것(아직 그 동작의 입력일 때만), 없으면 지금 설정의 첫 칸. 발은 "발 조종 키 + 손 입력" 조합
  function laneKeys(L) {
    const hm = CTRL.OPT.handMode;
    if (L.kind === 'hold') { const last = L.i[L.i.length - 1], codes = BIND.get(L.id); return { codes: [last && last.code && codes.includes(last.code) ? last.code : firstCode(L.id)], role: L.role, action: L.id }; }
    const side = L.limb % 2; let tap = L.i[L.i.length - 1] || null;
    if (tap && (!tap.id || !BIND.BY[tap.id] || (BIND.BY[tap.id].hm && BIND.BY[tap.id].hm !== hm))) tap = null;
    const id = tap ? tap.id : hm === 1 ? (side ? 'sendR' : 'sendL') : 'sendBest', codes = BIND.get(id), code = tap && tap.code && codes.includes(tap.code) ? tap.code : firstCode(id);
    // 손 선택 2번에서 아직 누르지 않았다면 어느 손이 될지 입력만으로는 알 수 없다 → 손 색을 칠하지 않고 그 사실을 적는다
    const role = tap || hm === 1 ? L.role : 'any', note = !tap && hm === 2 ? '추천·다른 손 입력' : null;
    if (L.limb >= 2) { const fc = BIND.get('foot'); return { codes: [tap && tap.mod && fc.includes(tap.mod) ? tap.mod : firstCode('foot'), code], role, note, action: 'foot+' + id }; }
    return { codes: [code], role, note, action: id };
  }
  const sgn = v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2);
  // 리플레이에서 그 줄의 키가 그 시각에 눌려 있었나(누르고 있기 = 구간 안, 순간 입력 = 누른 뒤 0.15초)
  const laneWasDown = (L, now) => L.kind === 'hold' ? L.i.some(b => b.a <= now && now < b.b) : L.i.some(t => now >= t.a && now - t.a < 0.15);
  function drawChart(master, mine, now) {
    const c = G.ctx, model = tlModel(master, mine), lanes = model.lanes.length ? model.lanes : [{ key: 'power', kind: 'hold', id: 'power', ...ACT.HOLD.power, m: [], i: [] }], n = lanes.length;
    const g = chartGeom(n), { r, m, big, laneH } = g, x = r.x, y = r.y, w = r.w, h = r.h, l = lesson(), ref = l ? '시범' : '이전 시도';
    const labW = Math.max(big ? 64 : 36, Math.min(big ? 128 : 96, laneH * 2.7)), lab = labW + (big ? 34 : 14), ax = x + lab, aw = Math.max(40, w - lab - (big ? 26 : 10)), pad = big ? 12 : 8, pps = (aw - 2 * pad) / VIEW.span, top = y + m.head + m.axis;
    tlTop = y - (big ? 8 : 2); VIEW.follow(now, model.end);
    Object.assign(CH, { rect: r, plot: { x: ax, y: top, w: aw, h: n * laneH }, ax, pad, pps, end: Math.max(model.end, now || 0), minH: g.minH, n });
    panelSkin(c, x, y, w, h, big ? 0.42 : 0.2);
    const X = t => ax + pad + (t - VIEW.start) * pps;
    // 머리줄: 오른쪽에 펼치기·끄기와 시간축 단추(전체·축소·확대, 옮긴 차트는 제자리로), 왼쪽에 제목과 범례(자리가 있으면)
    const bh = big ? 20 : 12, by = y + (big ? 12 : 3), fz = big ? 10.5 : 8.5; let rx = x + w - (big ? 22 : 9);
    { const verb = CHART_VERB[chartMode], kc = firstCode('chart'), kw = big ? keyW(kc, 28) : 0, vt = big ? verb : `${BIND.first('chart')} ${verb}`, vw = kw + G.textW(vt, big ? 11.5 : 8.5, 800) + (big ? 14 : 10);
      rx -= vw; hudBtn('tl_mode', rx, by - (big ? 4 : 0), vw, bh + (big ? 8 : 0)); if (big) drawKey(kc, rx + 2, by - 4, 28, { where: 'chart', action: 'chart' });
      G.text(vt, rx + kw + (big ? 6 : 5), by + bh / 2 + (big ? 4.2 : 3.2), { size: big ? 11.5 : 8.5, weight: 800, color: INK }); }
    for (const [id, t, bw] of [['tl_in', '+', bh + 5], ['tl_out', '−', bh + 5], ['tl_fit', '전체', big ? 36 : 28]].concat(CHR[chartMode] ? [['tl_reset', '제자리', big ? 44 : 34]] : [])) { rx -= bw + 4; hudBtn(id, rx, by, bw, bh, t, { size: fz }); }
    { let lx = x + (big ? 46 : 12); const ty = y + (big ? 25 : 12.5), fit = t2 => lx + t2 < rx - 8;
      if (big && fit(G.textW('입력 비교', 15, 800))) { G.text('입력 비교', lx, ty, { size: 15, weight: 800, color: INK }); lx += G.textW('입력 비교', 15, 800) + 22; }
      const mineT = l ? '내 입력' : '이번 시도', lw = 26 + G.textW(ref, fz, 700) + 14 + 26 + G.textW(mineT, fz, 700);
      if (fit(lw)) { const ph = big ? 8 : 7, pw = big ? 20 : 16, py = ty - (big ? 9 : 7); pill(c, lx, py, pw, ph, null, INK, 1.5); G.text(ref, lx + pw + 5, ty, { size: fz, weight: 700, color: INK }); lx += pw + 5 + G.textW(ref, fz, 700) + 12;
        pill(c, lx, py, pw, ph, INK, null); G.text(mineT, lx + pw + 5, ty, { size: fz, weight: 700, color: INK }); } }
    // 눈금: 보이는 폭에 맞춰 간격을 고른다
    const major = [0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60].find(sv => sv * pps >= (big ? 70 : 44)) || 120, minor = major / 2;
    for (let k = Math.max(0, Math.floor(VIEW.start / minor) - 1); k * minor <= VIEW.start + VIEW.span + minor; k++) { const t = k * minor, gx = X(t), isM = k % 2 === 0; if (gx < ax - 0.5 || gx > ax + aw + 0.5) continue;
      c.fillStyle = isM ? 'rgba(243,236,214,0.16)' : 'rgba(243,236,214,0.07)'; c.fillRect(gx, top - (isM ? 3 : 0), 1, n * laneH + (isM ? 3 : 0));
      if (isM) G.text((major < 0.5 ? t.toFixed(2) : major < 1 ? t.toFixed(1) : `${t}`) + (big || t === 0 ? '초' : ''), gx + (big ? 0 : 3), top - (big ? 5 : 3), { size: big ? 9.5 : 8, weight: 700, align: big ? 'center' : 'left', color: DIM }); }
    const two = laneH >= 26, fs = two ? 9.5 : 8, replaying = phase === 'replay', footDown = BIND.down('foot', G.input);
    lanes.forEach((L, k) => { const ly = top + k * laneH, col = ROLE[L.role], K = laneKeys(L);
      if (k % 2 === 0) { c.fillStyle = 'rgba(243,236,214,0.035)'; c.fillRect(ax, ly, aw, laneH); }
      // 줄 머리: 키캡만(실제 입력의 모양, 동작의 색). 줄 높이와 칸 너비에 맞춘다
      const area = lab - (big ? 34 : 14), kh0 = Math.max(8, Math.min(laneH - 2, 44)), kh = Math.min(kh0, kh0 * area / keysW(K.codes, kh0)), kw = keysW(K.codes, kh);
      drawKeys(K.codes, x + (big ? 24 : 8) + (area - kw) / 2, ly + (laneH - kh) / 2, kh, { role: K.role, where: 'chart', action: K.action, forceDown: replaying ? laneWasDown(L, now) : undefined, down: L.kind === 'tap' && L.limb < 2 ? BIND.codeDown(K.codes[0], G.input) && !footDown : undefined });
      c.save(); c.beginPath(); c.rect(ax, ly, aw, laneH); c.clip();
      const mH = two ? Math.max(6, Math.min(9, laneH * 0.2)) : Math.min(9, laneH - 4), mY = two ? ly + laneH * 0.24 : ly + (laneH - mH) / 2, iH = two ? mH : Math.max(3, mH - 4), iY = two ? ly + laneH * 0.6 : ly + (laneH - iH) / 2;
      if (L.kind === 'hold') {
        L.m.forEach(b => { const a = X(b.a), bw = (b.b - b.a) * pps; c.beginPath(); G.roundRect(a, mY, bw, mH, Math.min(mH / 2, bw / 2)); c.fillStyle = rgba(col, 0.12); c.fill(); c.strokeStyle = col; c.lineWidth = 1.6; c.stroke();
          if (!L.i.length) G.text(`${(b.b - b.a).toFixed(2)}초`, a + bw + 5, mY + mH - (two ? 0.5 : 1.5), { size: fs, weight: 700, color: col }); });
        L.i.forEach((b, q) => { const a = X(b.a), bw = (b.b - b.a) * pps, mm = L.m[q]; c.beginPath(); G.roundRect(a, iY, bw, iH, Math.min(iH / 2, bw / 2)); c.fillStyle = col; c.fill();
          if (bw < 3) { c.beginPath(); c.moveTo(a + bw / 2, iY - 1); c.lineTo(a + bw / 2 - 3, iY - 5); c.lineTo(a + bw / 2 + 3, iY - 5); c.closePath(); c.fill(); } // 아주 짧은 구간: 너비를 부풀리지 않고 표식을 더한다
          const d = b.b - b.a, t = `${d.toFixed(2)}초` + (mm && !b.live ? ` (${ref} ${sgn(d - (mm.b - mm.a))})` : '');
          G.text(t, Math.max(a + bw, mm && !two ? X(mm.b) : 0) + 5, two ? iY + iH - 0.5 : ly + laneH / 2 + 3, { size: fs, weight: 700, color: INK }); });
      } else {
        const rr = two ? 5 : 3.6, my = two ? ly + laneH * 0.33 : ly + laneH / 2, iy = two ? ly + laneH * 0.7 : ly + laneH / 2;
        L.m.forEach(t => { diamond(c, X(t.a), my, rr + (two ? 0 : 1), rgba(col, 0.12), col); if (two && t.mark && !L.i.length) G.text('놓을 손', X(t.a) + 9, my + 3.5, { size: 8.5, weight: 700, color: col }); });
        L.i.forEach((t, q) => { const mm = L.m[q]; diamond(c, X(t.a), iy, two ? rr : 2.6, col, null);
          const tx = (t.mark ? '놓을 손' : '') + (mm ? `${t.mark ? ' ' : ''}${ref} ${sgn(t.a - mm.a)}초` : ''); if (tx && (two || mm)) G.text(two ? tx : sgn(t.a - mm.a), Math.max(X(t.a), mm && !two ? X(mm.a) : 0) + 9, iy + 3.5, { size: two ? 9 : 8, weight: 700, color: INK }); });
      }
      c.restore();
    });
    // 지금 시각(리플레이에서는 재생 시각)
    if (now !== null && X(now) >= ax && X(now) <= ax + aw) { const px = X(now); c.fillStyle = replaying ? '#ffd166' : INK; c.fillRect(px - 0.5, top - 2, replaying ? 2 : 1.5, n * laneH + 4); const t = `${now.toFixed(2)}초`, pw = G.textW(t, big ? 9.5 : 8, 900) + 10; pill(c, px - pw / 2, top - (big ? 16 : 12), pw, big ? 13 : 10, replaying ? '#ffd166' : INK, null); G.text(t, px, top - (big ? 6 : 4.5), { size: big ? 9.5 : 8, weight: 900, align: 'center', color: '#1c231d' }); }
    if (big && w >= 430) { G.text(replaying ? '리플레이: 시간축을 누르거나 끌면 그 시각으로 갑니다.' : `${ref}과의 시간 차이만 견줍니다. 성공 여부는 실제 등반 결과로 확인합니다.`, x + 46, y + h - 9, { size: 10, weight: 600, color: DIM });
      if (w >= 780) G.text('0초 = 첫 입력 · 키캡 = 지금 설정된 입력(실제로 누른 것 우선) · 색 = 수행한 동작', x + w - 24, y + h - 9, { size: 9.5, weight: 600, align: 'right', color: DIM }); }
  }
  function drawChartPanel() { // 과제 중에는 시범과 나, 자유 연습에서는 이전 시도와 이번 시도. 리플레이에서는 내 기록 전체 위로 재생 시각이 지나간다
    tlTop = 540; const l = lesson(), master = l ? demoRec : lastRec, mine = demo ? null : rec.t0 !== null ? rec : null;
    if (chartMode === 'off') { const t = `${BIND.first('chart')} ${ACT.name.chart}`, w = G.textW(t, 9, 800) + 16, d = CH_DEF.mini; G.panel(d.x + d.w - w, d.bottom - 17, w, 17, 'rgba(28,35,29,0.88)', '#636a4b'); G.text(t, d.x + d.w - w / 2, d.bottom - 5, { size: 9, weight: 800, align: 'center', color: INK }); HUD.hits.push({ id: 'tl_mode', x: d.x + d.w - w, y: d.bottom - 17, w, h: 17 }); return; }
    const now = phase === 'replay' ? rp.t - (rec.t0 ?? 0) : demo ? (rec.t0 !== null ? S.t - rec.t0 : null) : phase === 'live' && mine ? S.t - mine.zero() : null;
    drawChart(master, mine, now);
  }
  const inPlot = m => CH.plot && m.x >= CH.plot.x && m.x <= CH.plot.x + CH.plot.w && m.y >= CH.plot.y && m.y <= CH.plot.y + CH.plot.h;
  const timeAt = x => VIEW.start + (x - CH.ax - CH.pad) / CH.pps, pannable = () => CH.end + 0.3 > VIEW.span || VIEW.start > 0;
  function hudUpdate(inp) {
    const m = inp.mouse, anyDown = m.down.some(Boolean), R = chartMode !== 'off' ? CH.rect : null, z = R ? PRACTICE.zone(R, m.x, m.y) : null, hit = HUD.hits.find(q => m.x >= q.x && m.x <= q.x + q.w && m.y >= q.y && m.y <= q.y + q.h) || null;
    // 누른 자리가 UI 안인가로 정한다(pressIn): 밖에서 누른 채 차트 위로 들어온 마우스는 뗄 때까지 게임 입력이고, 차트에서 누른 채 밖으로 나가도 뗄 때까지 UI의 것이다.
    // 판정은 누른 순간의 자리로 한다(화면이 잠깐 느려지면 판정할 때 마우스는 이미 다른 곳에 가 있을 수 있다)
    const inside = (px, py) => !!(R && PRACTICE.zone(R, px, py)) || HUD.hits.some(q => px >= q.x && px <= q.x + q.w && py >= q.y && py <= q.y + q.h);
    if (inp.clicks.length) HUD.pressIn = inp.clicks.some(k => inside(k.x, k.y)); else if (!anyDown) HUD.pressIn = null;
    HUD.overChart = !!z; HUD.hot = hit ? hit.id : null; HUD.click = null;
    HUD.capture = !!HUD.drag || (HUD.pressIn !== null ? HUD.pressIn : !!z || !!hit); BIND.setMouseBlocked(HUD.capture);
    if (HUD.drag) { const d = HUD.drag;
      if (!m.down[0]) { if (d.kind === 'move' || d.kind === 'size') saveChart(); HUD.drag = null; }
      else if (d.kind === 'move' || d.kind === 'size') CHR[chartMode] = PRACTICE.drag(d.r0, d.z, m.x - d.mx, m.y - d.my, { w: 240, h: CH.minH }, { x: 0, y: 0, w: W, h: H });
      else if (d.kind === 'pan') { VIEW.start = d.start; VIEW.pan(-(m.x - d.mx) / CH.pps, CH.end); }
      else if (d.kind === 'seek' && rp) rp.seek((rec.t0 ?? 0) + timeAt(m.x));
    } else if (inp.clicks.some(k => k.button === 0)) {
      const ck = inp.clicks.find(k => k.button === 0), p0 = { x: ck.x, y: ck.y }, z0 = R ? PRACTICE.zone(R, p0.x, p0.y) : null, hit0 = HUD.hits.find(q => p0.x >= q.x && p0.x <= q.x + q.w && p0.y >= q.y && p0.y <= q.y + q.h) || null;
      if (hit0) HUD.click = hit0.id;
      else if (z0) { const base = { z: z0, r0: { ...R }, mx: p0.x, my: p0.y };
        if (z0.edge) HUD.drag = { kind: 'size', cursor: PRACTICE.cursorOf(z0), ...base };
        else if (inPlot(p0) && phase === 'replay') { HUD.drag = { kind: 'seek', cursor: 'pointer' }; rp.seek((rec.t0 ?? 0) + timeAt(p0.x)); }
        else if (inPlot(p0) && pannable()) HUD.drag = { kind: 'pan', cursor: 'grabbing', mx: p0.x, start: VIEW.start };
        else HUD.drag = { kind: 'move', cursor: 'move', ...base }; }
    }
    if (HUD.wheel) { if (z && CH.plot) VIEW.zoom(HUD.wheel > 0 ? 1.2 : 1 / 1.2, inPlot(m) ? timeAt(m.x) : VIEW.start + VIEW.span / 2, CH.end); HUD.wheel = 0; }
    // 마우스 모양: 플레이 중에는 조준점만 보이고(none), UI 위에서는 무엇을 할 수 있는지 보인다. 끝난 뒤와 리플레이에서는 보통 화살표
    let cur = phase === 'live' ? 'none' : 'default';
    if (HUD.drag) cur = HUD.drag.cursor; else if (HUD.capture && hit) cur = 'pointer'; else if (HUD.capture && z) cur = z.edge ? PRACTICE.cursorOf(z) : inPlot(m) ? (phase === 'replay' ? 'pointer' : pannable() ? 'grab' : 'move') : 'move';
    HUD.cursor = cur; const cv = G.ctx.canvas; if (cv.style.cursor !== cur) cv.style.cursor = cur;
  }
  // ---- 시도가 끝난 뒤: 바로 처음으로 돌아가지 않고 결과와 "다시하기 / 리플레이"를 보인다. 연습 과제든 자유 연습이든 같다
  const practice = () => mode === 'intent' && !bot && !demo;
  const failText = () => why && (!air || why.t >= air.t - 0.05) ? why.text : hint() ? '도약이 다음 턱에 이어지지 않았다' : air && air.gap > 0 && air.gap < 1e8 ? `손이 잡을 곳에 닿지 못했다 — 가장 가까웠을 때 ${Math.ceil(air.gap)}px 모자람` : air && air.gap <= 0 ? '손이 닿는 거리였지만 잡지 않았다(버튼을 떼야 잡는다)' : '붙잡은 곳 없이 떨어졌다';
  const frameExtra = () => ({ aim: [aim.x, aim.y], g: ghost ? PRACTICE.clone(ghost.S) : null });
  function endAttempt(kind) { // kind: 'ok' 성공, 'fail' 떨어짐, 'stop' 하다가 리플레이를 열어 멈춤
    if (phase !== 'live') return; trk.push(S, frameExtra(), true);
    ended = { kind, t: S.t, title: kind === 'ok' ? (lesson() ? '성공!' : '목표 도달!') : kind === 'fail' ? '매트에 떨어짐' : '여기까지', sub: kind === 'fail' ? failText() : kind === 'ok' ? `첫 입력부터 ${(S.t - (rec.t0 ?? 0)).toFixed(2)}초 · 시도 ${tries}` : '하는 중에 멈췄다', hint: kind === 'fail' ? hint() : null };
    phase = 'ended';
  }
  function openReplay() { // 내가 한 플레이를 적어 둔 자취 그대로 다시 본다(다시 계산하지 않는다)
    if (!practice() || trk.frames.length < 2) return; if (phase === 'live') endAttempt('stop');
    rpLive = { S, aim: [aim.x, aim.y], gS: ghost ? ghost.S : null }; rp = PRACTICE.clock(rec.t0 ?? trk.t0(), trk.t1()); rp.playing = true; phase = 'replay';
    if (chartMode === 'off') setChartMode('mini'); VIEW.manual = false; VIEW.start = 0;
  }
  function closeReplay() { if (phase !== 'replay') return; S = rpLive.S; aim.x = rpLive.aim[0]; aim.y = rpLive.aim[1]; if (ghost) ghost.S = rpLive.gS; rp = null; rpLive = null; phase = 'ended'; }
  function replayUpdate(dt, inp) {
    if (BIND.pressed('rpPlay', inp)) rp.toggle();
    if (BIND.pressed('rpSpeed', inp)) rp.cycleSpeed();
    for (const [id, d] of [['rpBack', -1], ['rpFwd', 1]]) { if (BIND.pressed(id, inp)) { rp.nudge(d * 0.05); rpHold = 0; } else if (BIND.down(id, inp)) { rpHold += dt; if (rpHold > 0.25) rp.nudge(d * dt); } } // 한 번 = 0.05초, 누르고 있으면 실제 빠르기로 계속
    rp.update(dt); const f = trk.at(rp.t); S = f.s; if (f.aim) { aim.x = f.aim[0]; aim.y = f.aim[1]; } if (ghost) ghost.S = f.g || rpLive.gS;
  }
  function doClick(id) { // 화면의 단추를 눌렀을 때
    if (id === 'retry') { reset(); return true; }
    if (id === 'replay') { phase === 'replay' ? closeReplay() : openReplay(); return true; }
    if (id === 'next') { setLesson(lessonI + 1 >= LESSON.LIST.length ? -1 : lessonI + 1); return true; }
    if (id === 'rp_play' && rp) rp.toggle(); if (id === 'rp_back' && rp) rp.nudge(-0.1); if (id === 'rp_fwd' && rp) rp.nudge(0.1); if (id === 'rp_speed' && rp) rp.cycleSpeed();
    if (id === 'tl_mode') setChartMode(CHART_NEXT[chartMode]);
    if (id === 'tl_fit') VIEW.fit(CH.end); if (id === 'tl_in') VIEW.zoom(1 / 1.3, VIEW.start + VIEW.span / 2, CH.end); if (id === 'tl_out') VIEW.zoom(1.3, VIEW.start + VIEW.span / 2, CH.end);
    if (id === 'tl_reset') { CHR[chartMode] = null; saveChart(); VIEW.reset(); }
    return false;
  }
  function keyBtn(id, act, text, x, y, h, o = {}) { // 키캡 + 동작 이름으로 된 단추. 돌려주는 값: 너비
    const kc = firstCode(act), kw = keyW(kc, h - 4), fz = o.size || 12, w = kw + G.textW(text, fz, 800) + 18;
    hudBtn(id, x, y, w, h, null, { off: o.off }); drawKey(kc, x + 4, y + 2, h - 4, { where: o.where || 'result', action: act, disabled: o.off, down: o.off ? false : undefined });
    G.text(text, x + 4 + kw + 4, y + h / 2 + fz * 0.36, { size: fz, weight: 800, color: o.off ? DIM : INK }); return w;
  }
  const keyBtnW = (act, text, h, fz = 12) => keyW(firstCode(act), h - 4) + G.textW(text, fz, 800) + 18;
  function drawResult() {
    if (phase !== 'ended' || !ended) return; const c = G.ctx, col = ended.kind === 'ok' ? '#7dff9a' : ended.kind === 'fail' ? '#ff9c8a' : INK, lines = [ended.sub].filter(Boolean).map(t => ({ t, c: INK })).concat(ended.hint ? wrap(ended.hint, 470, 12, 700).map(t => ({ t, c: '#ffd166' })) : []);
    const btns = [['retry', 'reset', '다시하기'], ['replay', 'replay', '리플레이']].concat(lesson() ? [['next', 'lessonNext', lessonI === LESSON.LIST.length - 1 ? '자유 연습으로' : '다음 과제']] : []);
    const bws = btns.map(b => keyBtnW(b[1], b[2], 34, 13)), bsum = bws.reduce((a, v) => a + v + 10, -10), w = Math.max(G.textW(ended.title, 20, 900), ...lines.map(q => G.textW(q.t, 12, 700)), bsum) + 56, h = 54 + lines.length * 19 + 50, cx = lesson() ? Math.max(w / 2 + 10, 363) : W / 2, x = cx - w / 2, y = 92; // 과제 카드(오른쪽)를 가리지 않게 그 왼쪽 가운데에 둔다
    panelSkin(c, x, y, w, h, 0.3);
    G.text(ended.title, cx, y + 36, { size: 20, weight: 900, align: 'center', color: col });
    lines.forEach((q, k) => G.text(q.t, cx, y + 60 + k * 19, { size: 12, weight: 700, align: 'center', color: q.c }));
    let bx = cx - bsum / 2; btns.forEach((b, k) => { bx += keyBtn(b[0], b[1], b[2], bx, y + h - 50, 34, { size: 13, off: b[0] === 'replay' && trk.frames.length < 2 }) + 10; });
  }
  function drawReplayBar() {
    if (phase !== 'replay') return; const c = G.ctx, h = 30, items = [['rp_play', 'rpPlay', rp.playing ? '멈춤' : '재생'], ['rp_back', 'rpBack', '뒤로'], ['rp_fwd', 'rpFwd', '앞으로'], ['rp_speed', 'rpSpeed', `속도 ${rp.speed}배`], ['replay', 'replay', '닫기'], ['retry', 'reset', '다시하기']];
    const tt = `${(rp.t - rp.from).toFixed(2)} / ${(rp.to - rp.from).toFixed(2)}초`, tw = G.textW('00.00 / 00.00초', 13, 900) + 16, lw = G.textW('리플레이', 13, 900) + 16, w = lw + items.reduce((a, it) => a + keyBtnW(it[1], it[2], h, 11.5) + 6, 0) + tw + 22, x = (W - w) / 2, y = 8;
    panelSkin(c, x, y, w, h + 12, 0.2);
    G.text('리플레이', x + 14, y + 25, { size: 13, weight: 900, color: '#ffd166' }); let bx = x + 14 + lw;
    for (const it of items) bx += keyBtn(it[0], it[1], it[2], bx, y + 6, h, { size: 11.5, where: 'replay' }) + 6;
    G.text(tt, x + w - 14, y + 25, { size: 13, weight: 900, align: 'right', color: INK });
    G.text(trk.full ? '적어 둔 것은 처음 2분까지입니다 · 차트의 시간축을 누르거나 끌면 그 시각으로' : '내가 한 플레이를 그대로 다시 봅니다 · 차트의 시간축을 누르거나 끌면 그 시각으로', W / 2, y + h + 26, { size: 10, weight: 700, align: 'center', color: '#222', stroke: 'rgba(255,255,255,0.8)', strokeW: 3 });
  }
  // ---- 아래 키 안내(조작 D안): 키캡 = 지금 설정된 입력(실제로 누르고 있는 칸 우선), 옆 = 동작 이름과 그 손발의 상태. 손 선택 2번에서는 지금 추천된 손의 색을 쓴다
  function drawKeyBar() {
    const c = G.ctx, st = ctrl.st, hm = CTRL.OPT.handMode, h = 34, y = H - 37; let x = 8;
    const stateOf = i => { const m = S.limb[i].mode; return m === 'reach' ? (i >= 2 && !st.manual[i] ? '자동' : '움직이는 중') : m === 'free' ? '힘 빠짐' : '붙음'; };
    const chips = [], footDown = BIND.down('foot', G.input), rt = phase === 'replay' ? rp.t : null, tapAt = i => rec.taps.some(t => rt >= t.t && rt - t.t < 0.15 && t.limb === i), heldAt = id => rec.all().some(b => b.id === id && b.a <= rt && rt < b.b);
    for (let k = 0; k < 4; k++) {
      const foot = k >= 2, flip = k % 2; let i, id, name;
      if (hm === 1) { i = k; id = flip ? 'sendR' : 'sendL'; name = ACT.LIMB[i].name; }
      else { const r = st.rec ? (foot ? st.rec.foot : st.rec.hand) % 2 : 0; i = (foot ? 2 : 0) + (flip ? 1 - r : r); id = flip ? 'sendOther' : 'sendBest'; name = `${flip ? '다른' : '추천'} ${foot ? '발' : '손'}: ${ACT.LIMB[i].name}`; }
      chips.push({ codes: foot ? [usedCode('foot'), usedCode(id, 'foot+' + id)] : [usedCode(id)], role: ACT.LIMB[i].role, name, sub: stateOf(i), on: S.limb[i].mode === 'reach', action: foot ? 'foot+' + id : id, down: foot ? undefined : BIND.down(id, G.input) && !footDown, forceDown: rt !== null ? tapAt(i) : undefined });
    }
    chips.push({ codes: [usedCode('power')], role: 'power', name: ACT.HOLD.power.name, sub: st.phase === 'charge' ? '모으는 중' : st.phase === 'throw' ? '던지는 중' : '떼면 던지기', on: !!last.power, action: 'power', down: BIND.down('power', G.input), forceDown: rt !== null ? heldAt('power') : undefined });
    for (const ch of chips) {
      const kw = keysW(ch.codes, h), tw = Math.max(G.textW(ch.name, 11.5, 800), G.textW(ch.sub, 9, 600)), w = 5 + kw + 4 + tw + 9, col = ROLE[ch.role];
      c.beginPath(); G.roundRect(x, y + 3, w, h - 3, 8); c.fillStyle = 'rgba(28,35,29,0.9)'; c.fill(); c.strokeStyle = ch.on ? col : 'rgba(99,106,75,0.9)'; c.lineWidth = ch.on ? 2 : 1; c.stroke();
      drawKeys(ch.codes, x + 5, y + 1, h, { role: ch.role, where: 'bar', action: ch.action, down: ch.down, forceDown: ch.forceDown });
      G.text(ch.name, x + 5 + kw + 4, y + 17, { size: 11.5, weight: 800, color: INK }); G.text(ch.sub, x + 5 + kw + 4, y + 29, { size: 9, weight: 600, color: ch.on ? col : DIM });
      x += w + 6;
    }
  }
  function drawLessonCard() {
    const l = lesson(); if (!l) return; const x = 726, w = 226, y = 64, c = G.ctx, last = lessonI === LESSON.LIST.length - 1, rows = [{ t: `연습 ${lessonI + 1}/${LESSON.LIST.length}`, s: 9, wt: 800, c: 'rgba(255,214,102,0.9)' }];
    for (const ln of wrap(l.name, w - 24, 13, 800)) rows.push({ t: ln, s: 13, wt: 800, c: '#fff' });
    for (const ln of wrap(l.goal, w - 24, 10)) rows.push({ t: ln, s: 10, wt: 600, c: 'rgba(255,255,255,0.88)' });
    if (chartMode !== 'full') for (const tip of l.tips) wrap(tip, w - 34, 9.5, 500).forEach((ln, k) => rows.push({ t: ln, s: 9.5, wt: 500, c: 'rgba(255,255,255,0.62)', dot: k === 0, in: 10 }));
    const st = demo ? { t: '시범 재생 중 · 적어 둔 입력을 그대로 넣는 것(사람 손 아님)', c: '#7fd4ff' }
      : lessonOkT !== null ? { t: `성공! · ${BIND.first('reset')} 다시 · ${BIND.first('lessonNext')} ${last ? '자유 연습으로' : '다음 과제'}`, c: '#7dff9a' }
      : { t: `${demoMsgT > 0 ? '직접 해 보세요 · ' : ''}${BIND.first('demo')} 시범 · ${BIND.first('reset')} 다시 · ${BIND.first('lessonNext')} ${last ? '자유 연습(조작 설명)' : '다음'} · ${BIND.first('ghost')} 유령 ${ghostOn ? '켬' : '끔'} · ${BIND.first('settings')} 키 설정`, c: 'rgba(255,255,255,0.8)' };
    // 설정 안내: 들어올 때 맞춘 것, 지금 시범 기준과 다른 것, 잠근 것
    const O = CTRL.OPT, diff = LESSON.TUNED.filter(k => O[k] !== LESSON.BASE.opt[k]).map(k => `${OPT_NAME[k][0]} ${OPT_NAME[k][1](O[k])}`), info = [];
    if (lessonNote.length) info.push(`시범 기준에 맞춘 설정: ${lessonNote.join(', ')} (과제를 나가면 되돌림)`);
    if (diff.length) info.push(`내 설정이 시범 기준과 다름: ${diff.join(', ')} → 같은 입력이라도 결과가 다를 수 있다. 시범·유령은 기준 설정으로 움직인다`);
    if (O.handMode === 2) info.push('손 선택 2번: 요령의 좌클릭·우클릭은 왼손·오른손 보내기를 뜻한다(추천 손 입력으로 그 손을 보낸다)');
    if (lockT > 0) info.push(`과제 중에는 몸·물리·벽·조작 방식·도약 연결을 바꿀 수 없다. ${BIND.first('lessonNext')}로 자유 연습에 나가서 바꾼다`);
    if (chartMode !== 'full') for (const t of info) wrap(t, w - 24, 9, 600).forEach(ln => rows.push({ t: ln, s: 9, wt: 600, c: '#ffd9a0' }));
    const foot = wrap(st.t, w - 24, 9.5, 700), h = 10 + rows.reduce((a, r) => a + r.s + 4, 0) + 10 + foot.length * 13 + 6;
    glass(c, x, y, w, h); c.fillStyle = '#ffd166'; c.beginPath(); G.roundRect(x, y + 12, 3, 30, 2); c.fill();
    let yy = y + 10; for (const r of rows) { if (r.dot) G.circle(x + 15, yy + r.s - 3.5, 1.6, 'rgba(255,214,102,0.8)'); G.text(r.t, x + 12 + (r.in || 0), yy + r.s, { size: r.s, weight: r.wt, color: r.c }); yy += r.s + 4; }
    c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(x + 12, yy + 4, w - 24, 1); yy += 10;
    foot.forEach((ln, k) => G.text(ln, x + 12, yy + 10 + k * 13, { size: 9.5, weight: 700, color: st.c }));
  }
  // 시범 유령: 연습 과제에서 내가 첫 입력을 하는 순간, 시범 캐릭터가 같은 순간(시범의 첫 입력)부터 흐릿하게 함께 움직인다. 같은 계산을 따로 한 벌 더 돌린다
  function stepGhost() {
    const l = lesson(); if (!l || demo || !ghostOn || rec.t0 === null) return;
    if (!ghost) ghost = { S: PH.create(world, l.station), ctrl: CTRL.make('intent'), pl: LESSON.player(l) };
    // 유령의 시각 = 시범의 첫 입력 시각 + 내 첫 입력 뒤로 지난 시간. 늘 이 식에 맞춰 따라가므로, 껐다 켜도 처음으로 돌아가지 않고 지금 자리로 온다
    const want = Math.min(l.T, LESSON.firstInput(l) + (S.t - rec.t0));
    withBase(() => { while (ghost.S.t < want - 1e-9 && !ghost.S.dead) PH.step(ghost.S, ghost.ctrl.step(ghost.S, ghost.pl.step(ghost.S.t), 1 / 120), 1 / 120); });
  }
  let ghostLayer = null;
  function drawGhost(c) { // 따로 그린 뒤 한 번에 반투명으로 얹는다(팔다리가 겹친 곳이 진해지지 않게)
    if (!ghost || !C.JOINT) return; const s = ghost.S, ch = s.p[0], hp = s.p[1], ux = (ch.x - hp.x) / C.T, uy = (ch.y - hp.y) / C.T, R = [0, 1, 2, 3].map(i => PH.rootPos(s, i)), cv = c.canvas;
    if (!ghostLayer || ghostLayer.width !== cv.width || ghostLayer.height !== cv.height) { ghostLayer = document.createElement('canvas'); ghostLayer.width = cv.width; ghostLayer.height = cv.height; }
    const g = ghostLayer.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); g.setTransform(c.getTransform()); g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [col, ex] of [['#ffffff', 4], ['#3f8fd0', 0]]) { g.strokeStyle = col; g.fillStyle = col;
      for (const i of [2, 3, 0, 1]) { const e = s.p[2 + i], j = PH.jointPos(s, i); g.beginPath(); g.moveTo(R[i].x, R[i].y); g.lineTo(j.x, j.y); g.lineTo(e.x, e.y); g.lineWidth = (i < 2 ? 7 : 9) + ex; g.stroke(); }
      g.beginPath(); g.moveTo(R[0].x, R[0].y); g.lineTo(R[1].x, R[1].y); g.lineTo(R[3].x, R[3].y); g.lineTo(R[2].x, R[2].y); g.closePath(); g.lineWidth = 12 + ex; g.fill(); g.stroke();
      g.beginPath(); g.arc(ch.x + ux * 22, ch.y + uy * 22, 10 + ex / 2, 0, Math.PI * 2); g.fill(); }
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 0.42; c.drawImage(ghostLayer, 0, 0); c.restore();
    G.text('시범', ch.x + ux * 42, ch.y + uy * 42 + 3, { size: 9, weight: 800, align: 'center', color: '#2f6fa8', stroke: 'rgba(255,255,255,0.75)', strokeW: 3 });
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
    const lh = 18, w = Math.max(250, ...rows.map(r => G.textW(r.t, 12, 700) + 16)), h = rows.length * lh + (meter ? 30 : 0) + 8, x = 10, y = Math.min(H - 44, chartMode === 'full' ? tlTop - 4 : H) - h;
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
  // 동작이 많아 두 쪽으로 나눈다: 1쪽 = 조작, 2쪽 = 연습·리플레이·실험실
  const SET_PAGES = [['손', '발', '몸', '몸통', '조준', '보조'], ['연습', '리플레이', '실험실']], SET_PAGE_NAME = ['조작', '연습·리플레이·실험실'];
  function settingsRows() { const hm = CTRL.OPT.handMode, pg = SET_PAGES[ui ? ui.page : 0]; return BIND.ACTIONS.filter(a => (!a.hm || a.hm === hm) && pg.includes(a.g)); }
  function openSettings() { ui = { sel: 0, slot: 0, page: 0, cap: null, msg: '', frame: 0 }; }
  function settingsLayout() {
    const rows = settingsRows(), per = Math.ceil(rows.length / 2), out = [];
    rows.forEach((a, k) => { const col = k < per ? 0 : 1, r = col ? k - per : k, x = 30 + col * 452, y = 92 + r * 22; out.push({ a, k, x, y, s0: [x + 268, y - 14, 82, 19], s1: [x + 354, y - 14, 82, 19] }); });
    const by = 92 + per * 22 + 16;
    return { rows: out, per, btn: { mode: [30, 52, 330, 22], page: [W - 30 - 300, 52, 300, 22], reset: [W / 2 - 170, by, 160, 26], close: [W / 2 + 10, by, 160, 26] }, by };
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
    if (inp.pressed('Tab')) { ui.page = 1 - ui.page; ui.sel = 0; ui.slot = 0; ui.msg = ''; return; }
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
      if (inBox(L.btn.page, x, y)) { ui.page = 1 - ui.page; ui.sel = 0; ui.slot = 0; ui.msg = ''; return; }
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
    { const pb = L.btn.page; G.panel(pb[0], pb[1], pb[2], pb[3], '#2c3b55', '#9fb4d9'); G.text(`${ui.page + 1}/2쪽 · ${SET_PAGE_NAME[ui.page]} — Tab 또는 클릭으로 넘기기`, pb[0] + 8, pb[1] + 16, { size: 12, weight: 700 }); }
    let lastG = null;
    for (const r of L.rows) {
      const a = r.a, sel = ui.sel === r.k;
      let lb = (a.g !== lastG ? a.g + ' · ' : '') + (ACT.name[a.id] || a.label); const wt = sel ? 800 : 500; while (G.textW(lb, 11, wt) > 262 && lb.length > 4) lb = lb.slice(0, -2) + '…'; // 칸을 넘지 않게 줄임
      G.text(lb, r.x, r.y, { size: 11, weight: wt, color: sel ? '#ffd166' : '#e8e8e4' }); lastG = a.g;
      if (sel) G.text(a.label, W / 2, L.by + 70, { size: 11.5, weight: 600, align: 'center', color: '#c8ccd6' }); // 고른 동작의 전체 설명
      for (const sl of [0, 1]) {
        const b = sl ? r.s1 : r.s0, code = BIND.get(a.id)[sl], capping = ui.cap && ui.cap.id === a.id && ui.cap.slot === sl, bad = code && cf[a.id];
        G.panel(b[0], b[1], b[2], b[3], capping ? '#ffd166' : bad ? '#7a1f1f' : '#2a2f3a', sel && ui.slot === sl ? '#fff' : bad ? '#ff6b6b' : '#4a5263');
        if (capping) G.text('누르세요…', b[0] + b[2] / 2, b[1] + 14, { size: 11.5, weight: 700, align: 'center', color: '#111' });
        else { // 키캡(모양 = 입력, 색 = 동작) + 입력 이름. 긴 키는 키캡만
          const kw = keyW(code, 21); let nm = code ? BIND.name(code) : '미지정'; while (G.textW(nm, 10.5, 700) > b[2] - kw - 8 && nm.length > 3) nm = nm.slice(0, -2) + '…';
          const wide = kw + G.textW(nm, 10.5, 700) + 3 > b[2] - 4, tw = wide ? 0 : G.textW(nm, 10.5, 700) + 3, x0 = b[0] + (b[2] - kw - tw) / 2;
          drawKey(code, x0, b[1] - 1, 21, { role: ACT.roleOf(a.id), where: 'settings', action: a.id + ':' + sl, down: false, disabled: !code });
          if (!wide) G.text(nm, x0 + kw + 2, b[1] + 14, { size: 10.5, weight: 700, color: code ? '#fff' : '#8a8f99' });
        }
      }
    }
    for (const [k, t] of [['reset', '기본값 복원'], ['close', '닫기 (Esc)']]) { const b = L.btn[k], sel = ui.sel === (k === 'reset' ? n : n + 1); G.panel(b[0], b[1], b[2], b[3], sel ? '#3d5a8a' : '#2a2f3a', sel ? '#fff' : '#4a5263'); G.text(t, b[0] + b[2] / 2, b[1] + 17, { size: 13, weight: 800, align: 'center' }); }
    const anyCf = Object.keys(cf).length;
    G.text(ui.msg || (anyCf ? `겹친 입력이 있다(빨간 칸). 같은 입력을 두 동작에 쓰면 둘 다 함께 실행된다` : '겹친 입력 없음'), W / 2, L.by + 48, { size: 12, weight: 700, align: 'center', color: ui.msg.startsWith('주의') || (!ui.msg && anyCf) ? '#ff8a8a' : '#a8e6b8' });
  }
  function draw(c) {
    HUD.hits = []; CH.rect = null; CH.plot = null; const liveView = phase !== 'replay'; // 리플레이에서는 그때의 몸만 보인다(효과·이륙 표시·도움 표시는 지금 것이라 감춘다)
    KEYS.log = []; // 이번 프레임에 그린 키캡 목록(시험에서 "화면의 키캡이 지금 설정과 같은지" 확인하는 데 쓴다)
    c.save(); c.translate(-OX, -OY);
    drawWorld(c); drawGhost(c); drawBody(c);
    for (const f of liveView ? fx : []) {
      if (f.kind === 'ring') G.circle(f.x, f.y, 12 + (0.4 - f.t) * 40, null, `rgba(255,255,255,${Math.min(1, f.t * 3)})`, 3);
      else if (f.t > 1.0) G.circle(f.x, f.y, 10, null, '#ff4a4a', 2.5); // 경고 글은 왼쪽 아래 상태 칸으로, 그 자리에는 작은 빨간 고리만
      else if (false) { c.globalAlpha = Math.min(1, f.t * 2); const w = G.textW(f.text, 13, 800) + 14; G.panel(f.x + 14, f.y - 30, w, 22, 'rgba(120,16,16,0.9)'); G.text(f.text, f.x + 21, f.y - 14, { size: 13, weight: 800 }); c.globalAlpha = 1; }
    }
    if (liveView && jump && jump.off) { // 이륙 순간의 속도와 그 뒤 가슴이 지나간 길
      const o = jump.off; for (const q of trail) G.circle(q[0], q[1], 2, 'rgba(20,20,20,0.45)');
      const ex = o.x + o.vx * 0.14, ey = o.y + o.vy * 0.14, a = Math.atan2(o.vy, o.vx);
      G.line(o.x, o.y, ex, ey, '#111', 3); G.line(ex, ey, ex - 10 * Math.cos(a - 0.5), ey - 10 * Math.sin(a - 0.5), '#111', 3); G.line(ex, ey, ex - 10 * Math.cos(a + 0.5), ey - 10 * Math.sin(a + 0.5), '#111', 3);
      G.text(`이륙 ${Math.round(Math.hypot(o.vx, o.vy))}px/s · ${Math.round(Math.atan2(-o.vy, o.vx) * 180 / Math.PI)}°${jump.tR !== null && jump.tP !== null ? ` · 손 놓기 ${jump.tR - jump.tP >= 0 ? '+' : ''}${(jump.tR - jump.tP).toFixed(2)}초` : ''}`, o.x - 10, o.y + 22, { size: 12, weight: 800, color: '#111', align: 'right', stroke: 'rgba(255,255,255,0.7)', strokeW: 3 });
    }
    if (liveView && swing && Math.max(swing.peak, swing.cur) > 6) { // 반동 표시: 손 아래 수직선과 최근 최고 각도
      const r = 118, pk = Math.max(swing.peak, swing.cur) * Math.PI / 180;
      G.line(swing.ax, swing.ay, swing.ax, swing.ay + r, 'rgba(0,0,0,0.25)', 1.5, [3, 5]);
      for (const sg of [-1, 1]) G.line(swing.ax + Math.sin(sg * pk) * (r - 8), swing.ay + Math.cos(pk) * (r - 8), swing.ax + Math.sin(sg * pk) * (r + 8), swing.ay + Math.cos(pk) * (r + 8), '#111', 3);
      const tr = swing.prev ? (swing.peak > swing.prev + 1 ? ' ▲ 커지는 중' : swing.peak < swing.prev - 1 ? ' ▼ 줄어드는 중' : ' ─') : '';
      G.text(`반동 ${Math.round(Math.max(swing.peak, swing.cur))}°${tr}`, swing.ax, swing.ay - 14, { size: 13, weight: 800, align: 'center', color: '#111', stroke: 'rgba(255,255,255,0.7)', strokeW: 3 });
    }
    if (mode === 'intent' && !bot && !S.dead && !ui && phase === 'live') drawIntentHelp(c);
    if (!S.dead && (bot || mode !== 'keys')) { const qx = liveView ? last.cx : aim.x, qy = liveView ? last.cy : aim.y; G.line(qx - 9, qy, qx + 9, qy, '#111', 2); G.line(qx, qy - 9, qx, qy + 9, '#111', 2); G.circle(qx, qy, 5, null, '#fff', 1.5); } // 리플레이에서는 그때의 조준점
    c.restore();
    const K = CTRL.KEYMAP[mode], sp = kn(K.power);
    const O = CTRL.OPT, onoff = v => v ? '켬' : '끔';
    const B = BIND.label, B1 = BIND.first, hm = O.handMode;
    const lines = mode === 'intent' ? [
      hm === 1 ? `${B('sendL')} 왼손 · ${B('sendR')} 오른손 보내기 → 겨눈 구간에 닿으면 잡음   ${B('foot')} 누른 채 손 입력 = 발   조준 ${B1('aimUp')}${B1('aimLeft')}${B1('aimDown')}${B1('aimRight')} 또는 마우스`
               : `${B('sendBest')} 추천 손 · ${B('sendOther')} 다른 손 보내기 → 겨눈 구간에 닿으면 잡음   ${B('foot')} 누른 채 = 발   조준 ${B1('aimUp')}${B1('aimLeft')}${B1('aimDown')}${B1('aimRight')} 또는 마우스`,
      `${B1('moveUp')}${B1('moveLeft')}${B1('moveDown')}${B1('moveRight')} 몸통 옮기기(누른 채, 붙은 팔다리로) · ${B('power')} 누르고 있기 = 모으기, 떼기 = 던지기 · 모으는 중 ${B1('moveLeft')}·${B1('moveRight')} = 좌우 싣기, 떼면서 ${B1('moveUp')} = 팔로도 당김, 손 입력 = 놓을 손 · ${B('cancel')} 취소`,
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
    if ((lesson() || phase !== 'live') && !bot) { /* 과제 중과 결과·리플레이 화면에서는 조작 설명 칸을 그리지 않는다(벽과 목표 턱을 가리지 않게). 설명은 자유 연습 화면에 있다 */ }
    else {
      G.panel(8, 6, 716, 84, 'rgba(255,255,255,0.82)');
      G.text(`조작 ${CTRL.MODES[mode]}`, 18, 25, { size: 14, weight: 800, color: '#222' });
      lines.forEach((t, k) => G.text(t, 18, 43 + k * 15, { size: 11.5, color: '#222', weight: 600 }));
      G.text(`${BIND.first('demo')} 시범 · ${BIND.first('lessonNext')} 연습 과제 · ${BIND.first('chart')} 입력 비교 · ${BIND.first('scheme')} 조작 방식 · ${BIND.first('reset')} 다시 · ${BIND.first('st1')}~${BIND.first('st5')} 시작 자세 · ${BIND.first('slow')} 느리게 · ${BIND.first('couple')} 도약 연결 · ${BIND.first('layout')} 연습 배치 · ${BIND.first('phys')} 물리 ${v05 ? 'v0.6' : 'v0.4'} · ${BIND.first('body')} 몸 비율 · ${BIND.label('settings')} 키 설정`, 18, 104, { size: 11, color: '#333', weight: 600, stroke: 'rgba(255,255,255,0.8)', strokeW: 3 });
    }
    G.text(bot ? bot.def.title : `${station}. ${PH.STATIONS[station].name}   시도 ${tries}${slow ? '   느리게 ×0.5' : ''}`, W - 12, 24, { size: 13, align: 'right', color: '#222', weight: 800, stroke: 'rgba(255,255,255,0.8)' });
    G.text(`${bot ? '자동 시연(사람과 같은 입력만 사용) · ' : ''}도약 연결 ${C.COUPLE ? '켬' : '끔'} · ${layout ? '연습 배치' : '기존 벽'}`, W - 12, 42, { size: 11, align: 'right', color: '#333', stroke: 'rgba(255,255,255,0.8)', strokeW: 3 });
    G.text(`몸: ${PH.BODIES[PH.getBody()].short} (${BIND.first('body')}로 바꿈)`, W - 12, 56, { size: 11, align: 'right', color: '#333', stroke: 'rgba(255,255,255,0.8)', strokeW: 3 }); // 지금 몸(도움말 칸과 겹치지 않게 다음 줄)
    if (mode === 'intent' && !bot) drawKeyBar(); // 조작 D안: 키캡으로 된 키 안내
    else {
      const sh = t => t.replace(/^(왼|오른)/, '').replace('클릭', ''), kname = mode === 'intent' ? (O.handMode === 1 ? [B1('sendL'), B1('sendR'), sh(B1('foot')) + '+' + sh(B1('sendL')), sh(B1('foot')) + '+' + sh(B1('sendR'))] : ['추천/다른', '추천/다른', sh(B1('foot')) + '+손', sh(B1('foot')) + '+손']) : mode === 'hold' ? ['좌클릭', '우클릭', kn(K.lf), kn(K.rf)] : [kn(K.lh), kn(K.rh), kn(K.lf), kn(K.rf)];
      for (let i = 0; i < 4; i++) { const m = S.limb[i].mode, on = m === 'reach'; key(c, 10 + i * 126, LIMB[i], on ? (mode === 'intent' && i >= 2 && !ctrl.st.manual[i] ? '자동' : '움직이는 중') : m === 'free' ? '힘 빠짐' : '붙음', on, COL[i], kname[i]); }
      key(c, 514, mode === 'intent' ? '모으기·던지기' : '힘주기', '', last.power, '#ffd166', mode === 'intent' ? B1('power') : sp);
    }
    if (mode === 'intent' && recent.length && !ui) recent.forEach((r, k) => { const y = Math.min(H - 50, chartMode === 'full' ? tlTop - 8 : H) - (recent.length - 1 - k) * 20, w = G.textW(r.text, 12, 800) + 14; G.ctx.globalAlpha = Math.min(1, r.t * 2); G.panel(W - 12 - w, y - 15, w, 19, 'rgba(10,12,16,0.8)'); G.text(r.text, W - 12 - w + 7, y, { size: 12, weight: 800, color: '#ffd166' }); G.ctx.globalAlpha = 1; });
    tlTop = 540; if (mode === 'intent' && !bot && !ui) { drawLessonCard(); drawChartPanel(); drawResult(); drawReplayBar(); }
    if (mode === 'intent' && !bot && !ui && !(endT > 0) && phase === 'live') drawStatus(); // 떨어진 뒤에는 안내 띠와 겹치지 않게 상태 칸을 숨긴다
    if (showLog && mode === 'intent') drawLog();
    if (ui) drawSettings();
    if (remap) { G.panel(W / 2 - 220, 200, 440, 70, 'rgba(20,30,60,0.95)', '#fff'); G.text(`키 다시 지정 (${remap.i + 1}/${remap.list.length}) — Esc 그만`, W / 2, 226, { size: 13, align: 'center', weight: 600 }); G.text(`「${CTRL.LABEL[remap.list[remap.i]]}」에 쓸 키를 누르세요`, W / 2, 252, { size: 18, align: 'center', weight: 800 }); }
    G.text(`실험 빌드 ${BUILD}`, W - 10, H - 10, { size: 11, align: 'right', color: 'rgba(255,255,255,0.6)', weight: 500 });
    if (endT > 0) G.banner('매트에 떨어짐 — 바로 다시', failText(), 'fail', 380);
    if (endT > 0 && hint()) { const t = hint(), w = G.textW(t, 14, 800) + 28; const hy = Math.min(458, tlTop - 34); G.panel(W / 2 - w / 2, hy, w, 28, 'rgba(255,214,102,0.96)'); G.text(t, W / 2, hy + 19, { size: 14, weight: 800, align: 'center', color: '#111' }); }
    else if (S.won && !lesson() && !(mode === 'intent' && !bot)) G.banner('목표 도달!', `${S.t.toFixed(1)}초 · 시도 ${tries} — R 또는 스페이스로 다시`, 'win', 400);
    else if (bot && bot.m.done) G.banner('건너가서 안정됨', '두 손 + 한 발로 버티는 중', 'win', 440);
  }
  G.run(game, { title: '등반 조작 실험실' });
})();
