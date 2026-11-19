// 등반 조작 실험실 · 화면과 입력
'use strict';
(() => {
  const W = G.W, H = G.H, OX = -30, OY0 = 130, C = PH.C, BUILD = 'v0.16.3';
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
  const aim = { x: 400, y: 330, mx: null, my: null, held: 0, ox: 0, oy: 0, byMouse: false, resync: false, sig: '' }; // 조준점(게임 좌표). 마우스를 움직이면 마우스로, 조준 키를 누르면 키로 움직인다
  const plog = { sends: 0, confuse: 0, slips: 0, fallAfterSend: 0, lag: [], pending: [], lastSend: null, sendT: -9 };
  const V05 = { MUSCLE: C.MUSCLE, SMOOTH: C.SMOOTH, SMOOTH_FOOT: C.SMOOTH_FOOT, LAT_LEG: C.LAT_LEG, LAT_ARM: C.LAT_ARM };
  let v05 = G.params.get('phys') !== 'v04';
  function setPhys(on) { for (const k in V05) C[k] = on ? V05[k] : 0; } // 물리 v0.6(근육·궤적·관절 힘) ↔ v0.4
  if (autoList.length) v05 = false; // 자동 시연(?auto=)은 v0.4 물리에 맞춰 만든 조작기라 v0.4 물리로 돈다
  setPhys(v05);
  const kn = c => (c || '?').replace('Key', '').replace('Digit', '').replace('Arrow', '');
  let recent = [], spWas = false, lastMiss = null, showLog = false, S, station = 1, tries = 0, fx = [], why = null, endT = 0, slow = false, tick = 0, bot = null, autoI = 0, doneT = 0, air = null, jump = null, trail = [], swing = null, last = BOTS.idle();
  window.__lab = { keys: () => KEYS.log.slice(), chart: () => ({ mode: LAY.chart ? 'on' : 'off', dock: LAY.dock, size: LAY.size[LAY.dock], view: VIEW.start, span: VIEW.span, manual: VIEW.manual, end: CH.end, rect: CH.rect && { ...CH.rect }, plot: CH.plot && { ...CH.plot }, ax: CH.ax, pad: CH.pad, pps: CH.pps, n: CH.n, laneH: CH.laneH, big: CH.big, heads: CH.heads.map(q => ({ ...q })), off: CH.off && { ...CH.off }, scroll: CH.scroll, scrollMax: CH.scrollMax, head: CH.head, lanesTop: CH.lanesTop, ready: KEYS.ready, panel: !!KEYS.panel }),
    footPreview: () => FP.list.map(q => ({ ...q })),
    trackTimes: () => trk.frames.map(f => f.t), // 시험용: 자취에 적힌 장면의 시각
    labelScale: () => ({ s: VW.s, k: lblK(VW.s) }), cursorTags: () => CT.list.slice(), statusRows: () => STR.list.slice(), // 시험용(v0.16.3): 글 배율, 커서 옆 표시, 상태 칸의 줄
    logTest: (t, k) => logAdd(t, k), sayTest: t => say(S.p[0], t, true, true), // 시험용: 로그·경고를 직접 넣는다
    log: () => ({ playable: (LOG.playable || []).slice(), on: LAY.log, rect: LOG.rect && { ...LOG.rect }, items: LOG.items.map(q => ({ att: q.att, kind: q.kind, text: q.text, t: q.t, st: q.st, n: q.n || 1, lastT: q.lastT ?? null })), unseen: LOG.unseen || 0, scroll: LOG.scroll, att: LOG.att, scroll: LOG.scroll, max: LOG.max, size: { ...LAY.logSize }, stats: showLog }),
    shape: () => ({ turn: SHAPE.turn.slice(), twist: SHAPE.twist, joints: [0, 1, 2, 3].map(i => { const j = limbJoint(S, i, SHAPE.turn[i]); return { x: j.x, y: j.y, depth: j.depth }; }) }), bendTurn: i => bendTurn(S, i), pelvisTwist: () => pelvisTwist(S),
    view: () => ({ s: VW.s, x0: VW.x0, y0: VW.y0, ox: OX, oy: OY, show: { ...LAY.show, ghost: ghostOn, stats: showLog }, pos: JSON.parse(JSON.stringify(LAY.pos)), menu: VM.open, menuRect: VM.rect && { ...VM.rect }, helpShown: !!HELP.rect, helpRect: HELP.rect && { ...HELP.rect }, hints: (CH.hints || []).map(q => ({ ...q })), zoom: LAY.zoom, fitS: VW.fit, cam: { ...CAM }, hud: { ...HV }, markOff: !!HELP.markOff, play: { ...PZ }, chart: CZ && { ...CZ }, chartPart: KZ && { ...KZ }, logPart: LZ && { ...LZ }, logSplit: LSP && { ...LSP }, split: SPL && { ...SPL }, dock: LAY.dock, size: { ...LAY.size }, lim: LAY_LIM, fit: LAY_FIT, guide: LAY.guide, guideRect: GD.rect && { ...GD.rect }, drag: HUD.drag && { kind: HUD.drag.kind, target: HUD.drag.target || null } }), toScreen: (x, y) => toScreen(x, y), toWorld: (x, y) => toWorld(x, y),
    failReason, practice: () => ({ phase, ended: ended && { ...ended }, marks: CH.marks.map(q => ({ ...q })), hover: CH.hover, tools: CH.tools && { ...CH.tools }, bar: CH.bar && { ...CH.bar }, lessonCard: LC.rect && { ...LC.rect }, trackEnd: trk.end(), trackFull: trk.full, okWait: OK_WAIT, frames: trk.frames.length, rp: rp && { t: rp.t, from: rp.from, to: rp.to, playing: rp.playing, speed: rp.speed }, capture: HUD.capture, cursor: HUD.cursor, hits: HUD.hits.map(h => ({ ...h })) }), lesson: () => ({ i: lessonI, demo: !!demo, ok: lessonOkT, demoOk, demoEnd, rec, demoRec, lastRec, kept, note: lessonNote, ghost: ghost ? { t: ghost.S.t, x: ghost.S.p[0].x, y: ghost.S.p[0].y, dead: ghost.S.dead } : null }), hint: () => hint(), jump: () => jump, ctrlState: () => ctrl.st, opt: () => CTRL.OPT, aim, plog, ui: () => ui, bind: BIND, raw: () => { const m = G.input.mouse; return (m.down[0] || G.input.key('KeyQ') ? 'L' : '-') + (m.down[2] || G.input.key('KeyE') ? 'R' : '-'); }, get s() { return S; }, get bot() { return bot; }, finished: false, results: [] };

  // ---- 연습 과제·시범·입력 기록
  // 입력 기록(rec): 이번 시도에서 누른 것. 시범을 재생하는 동안에는 시범 입력이 같은 방법으로 기록되어 demoRec에 남는다. 그래서 시범 차트와 내 차트를 같은 눈금으로 견줄 수 있다
  let lessonI = -1, demo = null, rec = LESSON.recorder(), demoRec = null, lastRec = null, lmem = {}, lessonOkT = null, demoMsgT = 0, demoOk = null, demoEnd = null, ghost = null, ghostOn = true;
  // 시도의 단계: live(하는 중) → ended(끝남: 결과와 다시하기·리플레이) → replay(리플레이). trk = 몸의 모습을 적어 둔 자취, rp = 재생 시계
  const TRK_MAX = G.params.get('trackmax') !== null ? Math.max(1, +G.params.get('trackmax')) : PRACTICE.MAX_S; // 자취를 연속으로 적는 시간(초). 시험에서 짧게 줄여 본다
  let phase = 'live', ended = null, trk = PRACTICE.track(TRK_MAX), rp = null, rpLive = null, rpHold = 0, wonT = null; // demoEnd: 시범이 끝난 순간의 손발 자리(화면 표시를 바꿔도 계산이 같은지 시험에서 견준다)
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
    LOG.att++; aim.resync = true; rec = LESSON.recorder(); demo = null; ghost = null; lmem = {}; lessonOkT = null; phase = 'live'; ended = null; trk = PRACTICE.track(TRK_MAX); rp = null; rpLive = null; wonT = null; VIEW.reset();
    if (st) station = st;
    if (autoList.length) { bot = BOTS.make(autoList[autoI % autoList.length]); station = bot.def.station; }
    S = PH.create(world, station); tries++; fx = []; why = null; endT = 0; doneT = 0; air = null; jump = null; trail = []; swing = null; lastMiss = null; ctrl = CTRL.make(mode); rec.meta = recMeta(); resetShape(S);
  }
  // 최근 입력 표시(영상에서 어떤 입력을 썼는지 보이게)
  function noteInputs(inp) {
    const add = t => { recent.push({ t: 1.4, text: t }); if (recent.length > 5) recent.shift(); };
    const foot = BIND.down('foot', inp);
    for (const id of CTRL.OPT.handMode === 1 ? ['sendL', 'sendR'] : ['sendBest', 'sendOther']) if (BIND.pressed(id, inp)) {
      const code = BIND.get(id).find(c => c && (c.startsWith('Mouse') ? inp.clicks.some(k => 'Mouse' + k.button === c) : inp.pressed(c)));
      const asFoot = foot || BIND.pressedWithShift(id, inp), what = BIND.BY[id].label.split(' ·')[0]; add(`${asFoot ? BIND.first('foot') + '+' : ''}${BIND.name(code)} (${asFoot ? what.replace('손', '발') : what})`); } // 발 조종 키와 함께 누른 것은 발 보내기로 적는다
    for (const [id, t] of [['moveUp', '위'], ['moveDown', '아래'], ['moveLeft', '왼쪽'], ['moveRight', '오른쪽']]) if (BIND.pressed(id, inp)) add(`${BIND.first(id)} (몸통 ${t})`);
    const sp = BIND.down('power', inp); if (sp !== spWas) add(`${BIND.first('power')} ${sp ? '누름 (모으기)' : '뗌 (던지기)'}`); spWas = sp;
    if (BIND.pressed('cancel', inp)) add(`${BIND.first('cancel')} (취소)`);
  }
  function updateAim(inp, dt) {
    const m = inp.mouse;
    // 마우스가 움직이면 조준점이 마우스 자리로 간다(마우스가 차트·단추 위에 있을 때는 따라가지 않는다).
    // 게임 화면이 저절로 움직였을 때(확대한 채 보기 자리가 몸을 따라감)는 조준점을 벽의 그 자리에 그대로 둔다 — 겨눈 곳이 화면과 함께 밀려나면 안 된다.
    // 그러면 조준점과 (플레이 중에는 보이지 않는) 마우스 자리가 어긋나므로 그 차이(ox, oy)를 기억해 두고, 마우스가 움직이면 그 차이를 둔 채 따라 움직인다.
    // 다시 맞추는 때: 새 시도, 내가 배율을 바꿨을 때, 마우스가 차트·단추 위에 다녀왔을 때
    const moved = aim.mx === null || Math.abs(m.x - aim.mx) > 0.5 || Math.abs(m.y - aim.my) > 0.5, sig = `${VW.s}|${VW.x0}|${VW.y0}|${OY}`;
    if (HUD.capture) aim.resync = true;
    else if (aim.resync) { aim.resync = false; aim.ox = 0; aim.oy = 0; if (aim.byMouse && aim.mx !== null) { const q = toWorld(m.x, m.y); aim.x = q[0]; aim.y = q[1]; } }
    else if (sig !== aim.sig && aim.byMouse && aim.mx !== null) { const q = toScreen(aim.x, aim.y); aim.ox = q[0] - aim.mx; aim.oy = q[1] - aim.my; }
    if (moved) { if (aim.mx !== null && !HUD.capture) { const q = toWorld(m.x + aim.ox, m.y + aim.oy); aim.x = q[0]; aim.y = q[1]; aim.byMouse = true; } aim.mx = m.x; aim.my = m.y; }
    aim.sig = sig;
    const dx = (BIND.down('aimRight', inp) ? 1 : 0) - (BIND.down('aimLeft', inp) ? 1 : 0), dy = (BIND.down('aimDown', inp) ? 1 : 0) - (BIND.down('aimUp', inp) ? 1 : 0);
    if (dx || dy) { aim.byMouse = false; aim.held += dt; const sp = BIND.down('aimSlow', inp) ? 90 : Math.min(520, 220 + 600 * aim.held), n = Math.hypot(dx, dy); aim.x += dx / n * sp * dt; aim.y += dy / n * sp * dt; } else aim.held = 0;
    const v = visible(); aim.x = Math.max(v.x0 + 4, Math.min(v.x1 - 4, aim.x)); aim.y = Math.max(v.y0 + 4, Math.min(v.y1 - 4, aim.y)); // 조준점은 플레이 구역에 보이는 범위 안에 둔다
  }
  function readInput(inp) {
    let io;
    if (mode === 'intent') {
      const footShift = BIND.get('foot').some(c => c === 'ShiftLeft' || c === 'ShiftRight');
      io = { mx: aim.x, my: aim.y, down: id => BIND.down(id, inp), pressed: id => BIND.pressed(id, inp), pressedShift: id => footShift && BIND.pressedWithShift(id, inp), code: id => BIND.active(id, inp) };
      if (demo) { io = demo.pl.step(S.t); aim.x = io.mx; aim.y = io.my; } // 시범: 적어 둔 입력을 같은 시각에 넣는다(조준점도 시범이 옮긴다)
    } else {
      const m = inp.mouse, q = toWorld(m.x, m.y); io = { mx: q[0], my: q[1], lheld: m.down[0], rheld: m.down[2], lmb: inp.clicks.some(c => c.button === 0), rmb: inp.clicks.some(c => c.button === 2), lshift: inp.clicks.some(c => c.button === 0 && c.shift), rshift: inp.clicks.some(c => c.button === 2 && c.shift), key: c => inp.key(c), pressed: c => inp.pressed(c) };
    }
    const out = demo ? withBase(() => ctrl.step(S, io, 1 / 120)) : ctrl.step(S, io, 1 / 120); // 시범은 플레이어 설정과 상관없이 기준 설정으로
    if (mode === 'intent') rec.tick(S.t, io, ctrl.st.sent, demo ? LESSON.BASE.opt : CTRL.OPT);
    for (const i of ctrl.st.air) { const text = `${LIMB[i]}: 닿은 곳이 없다 — 그대로 들고 있음`; fx.push({ x: S.p[2 + i].x, y: S.p[2 + i].y, t: 0.9, kind: 'text', text }); logAdd(text, 'warn'); }
    if (mode === 'intent') {
      for (const m of ctrl.st.miss || []) { lastMiss = { d: m.d, t: S.t, x: m.x, y: m.y }; } for (const m of ctrl.st.miss || []) if (!fx.some(f => f.miss === m.i && f.t > 0.6)) { const text = `${LIMB[m.i]}: 겨눈 구간 밖에 닿음 (${Math.ceil(m.d)}px 벗어남)`; fx.push({ x: m.x, y: m.y, t: 1.0, kind: 'text', miss: m.i, text }); logAdd(text, 'warn'); }
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
    else if (e.type === 'footoff') say(e, e.hang ? `${n} 떨어짐 — 발에 매달릴 수는 없다(몸이 발 아래에 있다)` : `${n}이 떨어짐 — 밟는 힘이 없어 발이 떴다`, !e.hang, !e.hang && mode === 'intent' && !bot && (ctrl.st.phase === 'throw' || (jump && jump.tP !== null && S.t - jump.tP < 1))); // 뛰느라 발이 뜬 것은 로그에 남기지 않는다
    else if (e.type === 'mat') { if (S.t - plog.sendT < 1.5) plog.fallAfterSend++; endT = practice() ? 0 : bot ? 2.6 : 1.6; G.sfx.thud(); G.shake(5, 0.2); } // 연습(조작 D안)에서는 바로 다시 시작하지 않고 결과 화면으로 간다
    else if (e.type === 'win') { if (lessonI < 0) G.sfx.win(); }
  }
  function say(e, text, minor, noLog) { const same = fx.find(f => f.kind === 'text' && f.text === text); if (same) { same.x = e.x; same.y = e.y; same.t = 1.6; same.n = (same.n || 1) + 1; } else fx.push({ x: e.x, y: e.y, t: 1.6, kind: 'text', text, n: 1 }); // 같은 경고가 떠 있으면 새로 쌓지 않고 횟수만 늘린다(v0.16.3)
    if (!noLog) logAdd(text, 'warn'); if (!minor) why = { text, t: S.t }; } // 화면에 잠깐 뜨는 알림은 로그에도 남긴다

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
      relayout(); hudUpdate(inp); if (HUD.click && doClick(HUD.click)) return;
      if (!bot) {
        const P_ = id => BIND.pressedIn(id, inp, phase); // 그 단계에서 쓰이는 동작만 반응한다(리플레이에서는 리플레이 도구가 먼저)
        if (P_('settings')) { if (mode === 'intent') openSettings(); else remap = { list: Object.keys(CTRL.KEYMAP[mode]), i: 0 }; return; }
        if (P_('lessonNext')) { setLesson(lessonI + 1 >= LESSON.LIST.length ? -1 : lessonI + 1); return; }
        if (P_('demo')) { if (lessonI < 0) setLesson(0); startDemo(); return; }
        if (P_('chart')) setChart(!LAY.chart);
        if (P_('dock')) setDock(DOCKS[(DOCKS.indexOf(LAY.dock) + 1) % DOCKS.length]);
        if (P_('guide')) { LAY.guide = !LAY.guide; saveLay(); }
        if (P_('log')) setLog(!LAY.log);
        if (P_('viewFit')) setZoom(1);
        if (P_('viewMenu')) VM.open = !VM.open;
        if (P_('replay') && mode === 'intent') { phase === 'replay' ? closeReplay() : openReplay(); return; }
        if (CZ) { const dir = (BIND.downIn('chartRight', inp, phase) ? 1 : 0) - (BIND.downIn('chartLeft', inp, phase) ? 1 : 0); if (dir) VIEW.pan(dir * dt * VIEW.span * 0.55, CH.end); // 시간축을 손으로 옮기면 다시 시작할 때까지 자동으로 따라가지 않는다
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
      PH.step(S, last, dt); if (C.JOINT) updateShape(S, dt); // 표시 자세도 물리 걸음마다 따라간다
      stepGhost();
      if (lesson() && lessonOkT === null && !S.dead && lesson().done(S, lmem)) lessonOkT = S.t;
      if (demo && S.t >= lesson().T) { demoOk = lessonOkT !== null; demoEnd = S.p.map(q => [q.x, q.y]); demoMsgT = 3; reset(); tries--; return; } // 시범이 끝나면 같은 자세로 돌아가 직접 해 볼 차례
      // 공중에 떠 있는 동안 손이 잡을 곳에 가장 가까웠던 거리를 기억해 둔다(실패 원인 표시용)
      if (S.limb.some(l => l.mode === 'grip' || l.mode === 'plant')) { air = null; }
      else { if (!air) air = { t: S.t, gap: 1e9 }; if (S.t - air.t > 0.25) for (const i of [0, 1]) { const q = PH.nearestGrip(world, S.p[2 + i].x, S.p[2 + i].y); air.gap = Math.min(air.gap, q.d - C.GRAB_R); } }
      track(dt);
      if (mode === 'intent' && !bot && ctrl.st.footFar && ctrl.st.footFar.t === S.t) logAdd(footFarText(ctrl.st.footFar), 'warn'); // 직접 보낸 발이 닿지 못하고 멈춘 까닭
      if (jump && jump.off && !jump.logged && (jump.tR !== null || S.t - jump.off.t > 0.3)) { jump.logged = true; const o = jump.off; // 이륙한 순간의 빠르기·방향·손 놓은 때를 로그에 남긴다
        logAdd(`점프 속도 ${Math.round(Math.hypot(o.vx, o.vy))} · 각도 ${Math.round(Math.atan2(-o.vy, o.vx) * 180 / Math.PI)}°${jump.tR !== null && jump.tP !== null ? ` · 손 놓기 ${jump.tR - jump.tP >= 0 ? '+' : ''}${(jump.tR - jump.tP).toFixed(2)}초` : ''}`, 'info', o.t); } // 시각은 발이 떨어진 순간
      for (const e of S.events) note(e);
      if (practice()) { // 리플레이용 자취를 적고, 시도가 끝났는지 본다(떨어짐 = 바로, 성공 = 0.8초 더 버틴 뒤)
        if (rec.t0 === null) trk.hold(S, frameExtra()); else trk.push(S, frameExtra());
        if (!lesson() && S.won && wonT === null) wonT = S.t;
        const okT = lesson() ? lessonOkT : wonT;
        if (S.dead) endAttempt(okT !== null ? 'ok' : 'fail'); else if (okT !== null && S.t - okT >= OK_WAIT) endAttempt('ok');
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
        if (side > 0) return `바꿀 것: 힘 — 손이 겨눈 구간을 지나쳐 ${Math.ceil(lastMiss.d)}px 뒤에 닿았다(힘 ${pw}%). 덜 모으거나 더 먼 곳을 겨눈다`;
        if (side < 0) return `바꿀 것: 힘 — 손이 겨눈 구간에 못 미쳐 ${Math.ceil(lastMiss.d)}px 앞에 닿았다(힘 ${pw}%). ${pw >= 99 ? '이미 가장 세게 뛰었다. 더 가까운 곳을 겨눈다' : '더 모으거나 더 가까운 곳을 겨눈다'}`;
        return `손이 겨눈 구간 밖에 닿음 (${Math.ceil(lastMiss.d)}px 벗어남)`;
      }
      if (jump.lean >= 4 && jump.near && jump.near.d > C.GRAB_R) {
        const side = sideOf(jump.near.along, jump.near.d), gap = Math.ceil(jump.near.d - C.GRAB_R);
        if (side < 0) return `바꿀 것: 힘 — 손이 겨눈 곳에 ${gap}px 못 미쳤다(힘 ${pw}%). ${pw >= 99 ? '이미 가장 세게 뛰었다. 더 가까운 곳을 겨눈다' : '더 모은다'}`;
        if (side > 0) return `바꿀 것: 힘 — 손이 겨눈 곳을 지나쳤다(가장 가까울 때 ${gap}px, 힘 ${pw}%). 덜 모은다`;
      }
    } else if (d > win) return `바꿀 것: 타이밍 — 손 놓기가 밀기보다 ${d > 5 ? '너무' : d.toFixed(2) + '초'} 늦어 팔에 붙잡혔다 (여유 약 ${win.toFixed(2)}초)`;
    if (jump.lean < 4) return `바꿀 것: 발 위치 — 발이 엉덩이보다 앞(가려는 쪽)에 있어 ${ang > 90 ? '뒤로' : '위로만'} 밀렸다. 발을 반대쪽에 두기`;
    if (air && air.gap <= 0) return mode === 'hold' ? '바꿀 것: 잡는 타이밍 — 손이 닿았지만 버튼을 떼지 않았다' : null; // "버튼을 떼야 잡는다"는 C안에만 맞는 말이다. 다른 조작에서는 까닭을 지어내지 않는다
    return `바꿀 것: 방향 — 점프 속도 ${sp}, 각도 ${ang}°(수평에서 위로). 손이 잡을 곳에서 가장 가까울 때 ${air && air.gap < 1e8 ? Math.ceil(air.gap) : '?'}px 떨어져 있었다`;
  }
  function nextAuto(ok) { window.__lab.results.push({ name: autoList[autoI % autoList.length], ok }); autoI++; if (autoI >= autoList.length) window.__lab.finished = true; }

  // ---- 그리기
  const TYPE_COL = { ledge: '#7d828c', incut: '#b9793a', jug: '#d9573a', sloper: '#8b7fa8', block: '#6b6f78', rock: '#9a917f' };
  // 게임 화면 안의 이름표·안내(v0.16.3, GPT 화면 지침 1): 그림은 게임 화면 배율(VW.s)로 줄거나 커져도 글은 맞춤(100%) 크기로 그린다.
  // 기준점(x, y)을 중심으로 키우므로 글·바탕 칸·기준점에서의 간격이 함께 커진다. 기준점 자체(가리키는 자리)는 그대로다
  const LBL = { k: 1 }, LBL_MIN = 0.85, lblK = sc => Math.min(1, Math.max(sc, LBL_MIN)) / sc; // 화면에서의 글 크기 = 맞춤의 85~100%: 줄인 화면에서는 85%까지만 줄고(720p에서 11 크기 글 ≈ 12.5px), 키운 화면에서는 맞춤 크기 그대로
  function atLabel(x, y, fn, k = LBL.k) { const c = G.ctx; if (Math.abs(k - 1) < 1e-3) return fn(); c.save(); c.translate(x, y); c.scale(k, k); c.translate(-x, -y); try { return fn(); } finally { c.restore(); } }
  function drawWorld(c) {
    const v = visible(); // 플레이 구역이 게임 화면보다 넓거나 높으면 벽과 바닥을 그만큼 이어 그린다
    c.fillStyle = '#cfcabd'; c.fillRect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);
    for (let y = 150 - 40 * Math.max(0, Math.ceil((150 - v.y0) / 40)); y < C.FLOOR; y += 40) for (let x = OX + 20 - 40 * Math.max(0, Math.ceil((OX + 20 - v.x0) / 40)); x < v.x1; x += 40) G.circle(x, y, 1.5, 'rgba(0,0,0,0.13)');
    c.fillStyle = '#5d6672'; c.fillRect(v.x0, C.FLOOR, v.x1 - v.x0, Math.max(60, v.y1 - C.FLOOR));
    for (const pl of world) {
      c.beginPath(); pl.pts.forEach((q, i) => i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])); c.closePath();
      c.fillStyle = pl.goal && !lesson() ? '#d9a521' : TYPE_COL[pl.type]; c.fill(); c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 1.5; c.stroke();
      if (pl.type !== 'rock') for (const e of pl.edges) if (e.grip) G.line(e.ax, e.ay, e.bx, e.by, pl.type === 'sloper' ? '#e9e2ff' : '#fff6d8', 3.5); // 손으로 잡을 수 있는 면
    }
    const lab = (id, t, dx, dy) => { const pl = world.find(p => p.id === id), x = pl.cx + dx, y = pl.cy + dy; atLabel(x, y - 4, () => G.text(t, x, y, { size: 11, align: 'center', color: 'rgba(40,40,40,0.75)', weight: 700 })); };
    lab('A', '깊은 턱', -40, 26); lab('B', '턱', 30, 26); if (!lesson()) lab('G', '목표: 두 손으로 잡기', 0, -14); lab('J', '저그', 0, 24); lab('S', '둥근 면(미끄러움)', 0, 24); lab('F1', '발판', 0, 6); lab('F3', '발판', 0, 24); lab('F4', '발판', 0, 24); lab('P', '반동 연습', 0, -14); lab('R', '바위', 6, 60);
    const mk = lesson() && lesson().mark, mp = mk && world.find(p => p.id === mk[0]); // 과제 목표: 금색 테두리와 이름표
    if (mp) { c.beginPath(); mp.pts.forEach((q, i) => i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])); c.closePath(); c.strokeStyle = '#f2b200'; c.lineWidth = 3; c.stroke();
      const tw = G.textW(mk[1], 11, 800) + 14, ty = Math.min(...mp.pts.map(q => q[1])) - 26; atLabel(mp.cx, ty + 22, () => { G.panel(mp.cx - tw / 2, ty, tw, 18, 'rgba(242,178,0,0.95)'); G.text(mk[1], mp.cx, ty + 13, { size: 11, weight: 800, align: 'center', color: '#1d1d1d' }); }); } // 이름표 아래 끝(목표 바로 위)을 기준으로
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
  // ---- 사람다운 몸 그리기(v0.16.0, 4단계 첫 판). 물리는 그대로 두고 그림만 바꾼다(물리의 질점 6개·관절 길이는 같다).
  // 조사(README v0.16.0 절): 고관절 정상 범위(AAOS 평균) 굽힘 128°·폄 17°·벌림 33°·모음 14°·안쪽 돌림 42°·바깥 돌림 44°. 두 발로 뛸 때 무릎은 발끝 쪽(앞)을 향하고 무릎 사이 간격이 발목 간격보다 크게 벌어지지 않는 것이 보통이다(무릎이 안·밖으로 꺾이는 것은 부상 위험 자세로 다룬다).
  // 등반에서는 무릎이 벽 쪽(화면 안쪽)으로 굽고, 발을 넓게 벌리고 엉덩이를 벽에 붙일 때(개구리 자세)만 무릎을 옆으로 연다.
  // 그래서 무릎·팔꿈치가 굽는 방향을 "옆(화면)" 몫과 "벽 쪽(화면 안쪽)" 몫으로 나눈다. 화면에 보이는 것은 옆 몫뿐이다 → 웅크려도 무릎이 <> 모양으로 벌어지지 않는다.
  const SHAPE = { turn: [0.85, 0.85, 0.3, 0.3], twist: 0 }; // turn = 굽는 방향 가운데 옆으로 향하는 몫(0 = 모두 벽 쪽, 1 = 모두 옆). 화면 한 장마다 조금씩 따라간다
  const clamp01 = v => Math.max(0, Math.min(1, v));
  function bendTurn(s, i) {
    const lb = s.limb[i]; if (lb.arm) return 0.85; // 팔꿈치는 매달릴 때 옆·뒤로 벌어진다(옆 몫이 크다)
    const ch = s.p[0], hp = s.p[1], e = s.p[lb.end], ax = (ch.x - hp.x) / C.T, ay = (ch.y - hp.y) / C.T, dx = e.x - hp.x, dy = e.y - hp.y;
    const lat = Math.abs(dx * -ay + dy * ax), down = -(dx * ax + dy * ay);                       // 몸통 축에 수직인 거리, 엉덩이 아래로 내려간 거리
    const wide = clamp01((lat / lb.max - 0.2) / 0.35), high = clamp01(1 - down / (0.85 * lb.max)); // 발이 옆으로 멀고 엉덩이 가까이 올라와 있을수록 개구리 자세
    return 0.22 + 0.6 * wide * (0.45 + 0.55 * high);
  }
  // 화면에 그릴 팔꿈치·무릎: 물리의 관절 자리(옆으로 굽은 높이 h)에서 옆 몫만 남긴다. depth = 벽 쪽으로 굽은 정도(0~1, 그늘에 쓴다)
  function limbJoint(s, i, turn) {
    const j = PH.jointPos(s, i), lb = s.limb[i], mx = (j.rx + s.p[lb.end].x) / 2, my = (j.ry + s.p[lb.end].y) / 2, U = lb.max / 2 * 1.02;
    return { x: mx + (j.x - mx) * turn, y: my + (j.y - my) * turn, rx: j.rx, ry: j.ry, depth: Math.min(1, j.h * Math.sqrt(Math.max(0, 1 - turn * turn)) / U) };
  }
  // 골반 돌림(-1 ~ 1): 한 다리가 몸 안쪽(반대편 다리 쪽)으로 넘어가면 골반이 그쪽으로 돈다. 골반을 틀지 않고 발만 반대편으로 꺾이는 꼭두각시 모양을 피한다
  function pelvisTwist(s) {
    const ch = s.p[0], hp = s.p[1], ax = (ch.x - hp.x) / C.T, ay = (ch.y - hp.y) / C.T; let t = 0;
    for (const i of [2, 3]) { const lb = s.limb[i], r = PH.rootPos(s, i), e = s.p[lb.end], h = PH.hipAngle(ax, ay, lb, e.x - r.x, e.y - r.y), os = i === 2 ? 1 : -1, inward = -os * h.line;
      if (inward > 12) t += -os * clamp01((inward - 12) / 30); }
    return Math.max(-1, Math.min(1, t));
  }
  // 표시 자세(v0.16.2, GPT 검토 N1): 물리 한 걸음(1/120초)마다 update에서 따라간다(그리기 횟수·화면 빠르기와 상관없다). 그리기는 읽기만 한다.
  // 자취의 각 장에 함께 적고(frameExtra), 리플레이에서는 그 장의 값을 그대로 쓴다. 머리 방향은 조준점에서 계산하므로 장에 적힌 조준점으로 복원된다
  function updateShape(s, dt) { for (let i = 0; i < 4; i++) SHAPE.turn[i] += (bendTurn(s, i) - SHAPE.turn[i]) * Math.min(1, dt * 8); SHAPE.twist += (pelvisTwist(s) - SHAPE.twist) * Math.min(1, dt * 6); }
  function resetShape(s) { if (!C.JOINT || !s) return; for (let i = 0; i < 4; i++) SHAPE.turn[i] = bendTurn(s, i); SHAPE.twist = pelvisTwist(s); } // 새 시도: 지금 자세의 값에서 바로 출발(지난 시도의 값을 끌고 오지 않는다)
  const shapeCopy = () => ({ turn: SHAPE.turn.slice(), twist: SHAPE.twist }), shapeSet = q => { if (!q) return; SHAPE.turn = q.turn.slice(); SHAPE.twist = q.twist; };
  const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16), f = v => Math.round(v * (1 - k)); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };
  // 몸통: 어깨·가슴(윗옷)과 골반(바지)을 나눠 그리고 허리로 잇는다. 골반은 돌림만큼 한쪽이 좁아 보인다. 머리는 목 위에서 겨누는 쪽을 조금 바라본다
  function drawTorso(c, s, R, twist, look, col = { top: '#3b3f46', bot: '#2c3a52', head: '#3b3f46' }) {
    const ch = s.p[0], hp = s.p[1], ux = (ch.x - hp.x) / C.T, uy = (ch.y - hp.y) / C.T, nx = -uy, ny = ux, wx = hp.x + ux * C.T * 0.42, wy = hp.y + uy * C.T * 0.42, ww = (C.HW || 8) + 6;
    const lh = { x: R[2].x - nx * 5, y: R[2].y - ny * 5 }, rh = { x: R[3].x + nx * 5, y: R[3].y + ny * 5 }, pw = 1 - 0.35 * Math.abs(twist);  // 엉덩이 바깥 선
    if (twist > 0) { lh.x = hp.x + (lh.x - hp.x) * pw; lh.y = hp.y + (lh.y - hp.y) * pw; } else if (twist < 0) { rh.x = hp.x + (rh.x - hp.x) * pw; rh.y = hp.y + (rh.y - hp.y) * pw; }
    c.lineJoin = 'round';
    c.beginPath(); c.moveTo(wx - nx * ww, wy - ny * ww); c.lineTo(wx + nx * ww, wy + ny * ww); c.lineTo(rh.x, rh.y); c.lineTo(lh.x, lh.y); c.closePath(); c.fillStyle = col.bot; c.strokeStyle = col.bot; c.lineWidth = 9; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(R[0].x, R[0].y); c.lineTo(R[1].x, R[1].y); c.lineTo(wx + nx * (ww + 1), wy + ny * (ww + 1)); c.lineTo(wx - nx * (ww + 1), wy - ny * (ww + 1)); c.closePath(); c.fillStyle = col.top; c.strokeStyle = col.top; c.lineWidth = 11; c.fill(); c.stroke();
    if (twist) { c.globalAlpha = 0.25 * Math.abs(twist); c.beginPath(); const sx = twist > 0 ? lh : rh; c.moveTo(wx, wy); c.lineTo(sx.x, sx.y); c.lineTo(hp.x, hp.y); c.closePath(); c.fillStyle = '#000'; c.fill(); c.globalAlpha = 1; } // 돌아간 쪽 그늘
    const nkx = ch.x + ux * 9, nky = ch.y + uy * 9, hx = ch.x + ux * 21 + (look ? look[0] : 0), hy = ch.y + uy * 21 + (look ? look[1] : 0);
    G.line(nkx, nky, hx, hy, col.top, 7); G.circle(hx, hy, 9.5, col.head);
  }
  function drawBody(c) {
    const p = S.p, ch = p[0], hp = p[1], ux = (ch.x - hp.x) / C.T, uy = (ch.y - hp.y) / C.T;
    if (C.JOINT) { // 관절 몸: 팔은 어깨에서, 다리는 골반 양옆에서 나온다. 팔꿈치·무릎은 굽는 방향의 옆 몫만 화면에 보이고(벽 쪽 몫은 그늘), 위팔·허벅지는 굵고 아래는 가늘다
      const R = [0, 1, 2, 3].map(i => PH.rootPos(S, i)); // 그리기는 표시 자세를 바꾸지 않는다(읽기만)
      const tgt = [aim.x - ch.x, aim.y - ch.y], tl = tgt ? Math.hypot(tgt[0], tgt[1]) || 1 : 1, look = tgt ? [tgt[0] / tl * 3, tgt[1] / tl * 3] : null;
      for (const i of [2, 3, 0, 1]) { // 다리 먼저, 그 위에 몸통, 팔은 맨 위
        const lb = S.limb[i], e = p[lb.end], j = limbJoint(S, i, SHAPE.turn[i]), r = { x: j.rx, y: j.ry }, w0 = lb.arm ? 7.5 : 10.5, w1 = lb.arm ? 6 : 8;
        c.globalAlpha = lb.mode === 'free' ? 0.65 : 1; c.lineCap = 'round';
        G.line(r.x, r.y, j.x, j.y, shade(DARK[i], 0.25 * j.depth), w0); G.line(j.x, j.y, e.x, e.y, DARK[i], w1);  // 위팔·허벅지는 벽 쪽으로 굽은 만큼 어둡게(멀어 보이게)
        G.circle(j.x, j.y, lb.arm ? 3.8 : 4.6, shade(DARK[i], 0.15 * j.depth), 'rgba(255,255,255,0.6)', 1.2); c.globalAlpha = 1;
        if (i === 3) drawTorso(c, S, R, SHAPE.twist, look);
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
  const FP = { list: [] }, CT = { list: [] }, STR = { list: [] }; // 발 미리보기에 그린 것(시험이 읽는다)
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
    // 발 디딜 자리 미리보기(v0.16.2, GPT 검토 N2). 판정은 조작과 같은 CTRL.footReach(발마다, 지금 자세 기준. 디딤 성공 보장이 아니다).
    //  · 발을 고르기 전(발 조종 키를 누른 채): 조준한 자리에 어느 발이 닿는지 발마다 표시(왼발만 / 오른발만 / 둘 다 / 둘 다 안 됨)
    //  · 발을 보낸 뒤: 실제로 보내고 있는 발과 그 발이 가는 고정 목표만, 그 발의 판정으로 표시(발 조종 키를 떼도 그대로)
    FP.list = []; { const sel = [2, 3].filter(i => st.act[i] && st.manual[i] && st.footTgt && st.footTgt[i]);
      const items = sel.length ? sel.map(i => ({ tgt: st.footTgt[i], feet: [i], selected: true })) : foot && st.footAim ? [{ tgt: st.footAim, feet: [2, 3], selected: false }] : [];
      for (const it of items) { const fa = it.tgt, ok = it.feet.filter(i => CTRL.footReach(S, i, fa.x, fa.y).ok), can = ok.length > 0, col = can ? '#9b7be0' : 'rgba(90,90,90,0.85)';
        FP.list.push({ feet: it.feet.slice(), ok: ok.slice(), selected: it.selected, x: fa.x, y: fa.y });
        if (!fa.raw && fa.bx !== undefined) { const dx = fa.bx - fa.ax, dy = fa.by - fa.ay, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, t = (fa.sx - fa.ax) * ux + (fa.sy - fa.ay) * uy, t0 = Math.max(0, t - 12), t1 = Math.min(L, t + 12);
          G.line(fa.ax + ux * t0, fa.ay + uy * t0, fa.ax + ux * t1, fa.ay + uy * t1, 'rgba(255,255,255,0.85)', 7); G.line(fa.ax + ux * t0, fa.ay + uy * t0, fa.ax + ux * t1, fa.ay + uy * t1, col, 4, can ? null : [4, 3]); }
        atLabel(fa.x, fa.y, () => { // 고리·L·R 표시·문구는 화면에서 늘 같은 크기(확대·축소와 상관없이)
        G.circle(fa.x, fa.y, 5.5, null, col, 2.5);
        const tag = (lab, x, on) => { const w = 13; c.beginPath(); G.roundRect(x, fa.y - 24, w, 13, 3); c.fillStyle = on ? '#9b7be0' : 'rgba(255,255,255,0.85)'; c.fill(); c.strokeStyle = on ? '#fff' : 'rgba(90,90,90,0.8)'; c.lineWidth = 1; c.stroke(); G.text(on ? lab : '×', x + w / 2, fa.y - 14, { size: 9, weight: 900, align: 'center', color: on ? '#fff' : '#555' }); };
        if (it.selected) tag(it.feet[0] === 2 ? 'L' : 'R', fa.x - 6.5, can); else { tag('L', fa.x - 15, ok.includes(2)); tag('R', fa.x + 2, ok.includes(3)); } // 어느 발이 닿는지(× = 그 발은 닿지 않음)
        if (!can) G.text('지금 자세에서는 닿지 않음', fa.x, fa.y + 17, { size: 10, weight: 800, align: 'center', color: '#333', stroke: 'rgba(255,255,255,0.85)', strokeW: 3 }); });
        if (it.selected) { const e = S.p[2 + it.feet[0]]; G.line(e.x, e.y, fa.x, fa.y, can ? 'rgba(155,123,224,0.7)' : 'rgba(90,90,90,0.6)', 1.5, [4, 4]); } } } // 보내는 발 → 그 발의 목표
    // 입력 → 손발
    CT.list = []; const ids = O.handMode === 1 ? [['sendL', foot ? 2 : 0, false], ['sendR', foot ? 3 : 1, false]]
      : (() => { const r = foot ? st.rec.foot : st.rec.hand, o = foot ? 5 - r : 1 - r; return [['sendBest', r, true], ['sendOther', o, false]]; })();
    ids.forEach(([id, li, best], k) => {
      const lb = S.limb[li], e = S.p[lb.end], col = COL[li], strong = O.handMode === 1 || best;
      const verb = charge && li < 2 && lb.mode === 'grip' ? (st.mark[li] ? '놓기 취소' : '도약 때 놓기') : '보내기';
      G.line(e.x, e.y, ax, ay, strong ? col : 'rgba(80,80,80,0.35)', strong ? 2 : 1, [5, 5]);
      const tag = LAY.show.cursorLong ? `${BIND.first(id)} → ${LIMB[li]} ${verb}${best ? ' (추천)' : ''}` : `${BIND.first(id)}${verb !== '보내기' ? ' ' + verb : ''}${best ? ' 추천' : ''}`, tw = G.textW(tag, 12, 800) + 12; CT.list.push(tag); // 기본은 짧게: 입력 이름(손발 위 표시와 같은 것). 모으는 중의 "도약 때 놓기"처럼 뜻이 바뀔 때만 동작을 붙인다(GPT 화면 지침 7)
      let tx, ty;
      if (O.handMode === 1) { tx = k === 0 ? ax - 16 - tw : ax + 16; ty = ay - 30; } else { tx = ax - tw / 2; ty = best ? ay - 44 : ay + 16; }
      atLabel(ax, ay, () => { G.panel(tx, ty, tw, 20, strong ? col : 'rgba(255,255,255,0.8)', strong ? '#fff' : 'rgba(0,0,0,0.3)'); G.text(tag, tx + 6, ty + 14, { size: 12, weight: 800, color: '#111' }); });
      // 같은 표시를 그 손발에도
      const bt = BIND.first(id), bw = G.textW(bt, 11, 800) + 10, bx = e.x + (li % 2 ? 6 : -6 - bw); // 왼쪽 손발은 왼쪽 위, 오른쪽은 오른쪽 위에 붙여 겹치지 않게
      atLabel(e.x, e.y, () => { G.panel(bx, e.y - 32, bw, 17, strong ? col : 'rgba(255,255,255,0.8)', '#fff'); G.text(bt, bx + bw / 2, e.y - 19, { size: 11, weight: 800, align: 'center', color: '#111' });
      if (strong) G.circle(e.x, e.y, 18 + (best ? Math.sin(S.t * 10) * 2 : 0), null, col, 2.5); });
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
  // 높이 26 미만은 작은 크기 전용 그리기(또렷한 윤곽과 큰 글자), 그 위는 인계 받은 키캡 틀
  const keyLabel = code => { const it = UI.catalog.resolve(code); return it.corner ? `${it.corner} ${it.label}` : undefined; }; // 왼·오른 수정 키와 숫자패드는 키 글자 앞에 적는다(L Shift, NUM 1)
  const keyW = (code, h) => { if (h < 26) return UI.smallSize(code, h, { label: keyLabel(code), layout: KEYS.layout })[0]; const z = UI.sizes[UI.catalog.resolve(code, { layout: KEYS.layout }).shape]; return h * (z[0] + 20) / (z[1] + 20); };
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
  function drawKey(code, x, y, h, o = {}) { // 키캡 하나. 돌려주는 값: 차지한 너비. o.outline = 윤곽만(시범), o.ghost = 흐리게(지금 설정 기준 안내)
    const c = G.ctx, w = keyW(code, h), role = o.role || 'neutral', down = o.disabled ? false : o.down !== undefined ? !!o.down : BIND.codeDown(code, G.input), p = pressAmt(`${o.where}|${o.action}|${code}|${o.who || ''}|${o.t ?? ''}`, down), it = UI.catalog.resolve(code, { layout: KEYS.layout }), label = keyLabel(code), state = o.disabled ? 'disabled' : 'idle';
    KEYS.log.push({ where: o.where || '', action: o.action || '', code: code || 'Unassigned', role, state: o.disabled ? 'disabled' : down ? 'pressed' : 'idle', label: label || it.label, shape: it.shape, fallback: !!it.fallback, h, press: p, small: h < 26, guide: !!o.ghost, outline: !!o.outline, who: o.who, t: o.t, n: o.n });
    if (h < 26) { UI.renderSmall(c, code, { x, y, w, h }, { role, state, press: p, label, layout: KEYS.layout, outline: o.outline, ghost: o.ghost }); return w; }
    if (KEYS.ready) { try { c.save(); if (o.ghost) c.globalAlpha *= 0.62; UI.render(c, code, { x, y, w, h }, { role, state, press: p, big: h < 40, label, layout: KEYS.layout }); c.restore(); return w; } catch (e) { c.restore(); KEYS.ready = false; } }
    G.panel(x + 1, y + h * 0.18, w - 2, h * 0.64, ROLE[role] || ROLE.neutral); G.text(BIND.name(code), x + w / 2, y + h / 2 + 3.5, { size: Math.max(8, Math.min(11, h * 0.3)), weight: 800, align: 'center', color: '#2b2b2b' });
    return w;
  }
  function drawKeys(codes, x, y, h, o = {}) { // 함께 누르는 조합은 +로 잇는다(주·보조처럼 "둘 중 하나"와 다르다). 조합은 모두 눌려야 눌림으로 보인다
    const all = codes.every(cd => BIND.codeDown(cd, G.input)); let xx = x;
    codes.forEach((cd, k) => { if (k) { G.text('+', xx + 4.5, y + h / 2 + Math.min(4, h * 0.2), { size: Math.min(11, Math.max(7, h * 0.5)), weight: 800, align: 'center', color: 'rgba(243,236,214,0.75)' }); xx += 9; } xx += drawKey(cd, xx, y, h, { ...o, down: o.disabled ? false : o.forceDown !== undefined ? o.forceDown : codes.length > 1 ? all : o.down }); });
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

  // ---- 화면 UI의 마우스 처리(차트 옮기기·크기 바꾸기·시간축, 결과·리플레이 단추). 그리는 쪽이 누를 수 있는 곳(hits)을 알려 주고, 다음 걸음에서 판정한다
  const HUD = { hits: [], hot: null, click: null, drag: null, capture: false, pressIn: null, overChart: false, onSplit: false, onLogSplit: false, splitHold: null, wheel: 0, cursor: 'none' };
  window.addEventListener('wheel', e => { HUD.wheel += e.deltaY; e.preventDefault(); }, { passive: false }); // 휠은 차트 안에서 시간축 확대·축소에만 쓴다. 차트 밖에서는 아무 일도 하지 않는다
  function hudBtn(id, x, y, w, h, label, o = {}) { // 누를 수 있는 칸 하나(글자가 있으면 글자도 그린다). primary = 주 단추(밝게 채움)
    const c = G.ctx, hot = HUD.hot === id && !o.off; c.beginPath(); G.roundRect(x, y, w, h, Math.min(7, h / 2));
    c.fillStyle = o.primary ? (hot ? '#fff8e2' : INK) : hot ? 'rgba(243,236,214,0.26)' : 'rgba(243,236,214,0.1)'; c.fill(); c.strokeStyle = hot ? INK : 'rgba(243,236,214,0.32)'; c.lineWidth = 1; c.stroke();
    if (label) G.text(label, x + w / 2, y + h / 2 + (o.size || 10) * 0.36, { size: o.size || 10, weight: 800, align: 'center', color: o.primary ? '#1c231d' : o.off ? DIM : INK });
    if (!o.off) HUD.hits.push({ id, x, y, w, h });
  }
  function icon(c, kind, cx, cy, z, col) { // 재생 도구의 그림(글자 대신). z = 반 크기
    c.save(); c.fillStyle = col; c.strokeStyle = col; c.lineWidth = Math.max(1.4, z * 0.3); c.lineCap = 'round'; c.lineJoin = 'round'; const tri = (x0, d) => { c.beginPath(); c.moveTo(x0 - d * z * 0.55, cy - z); c.lineTo(x0 + d * z * 0.75, cy); c.lineTo(x0 - d * z * 0.55, cy + z); c.closePath(); c.fill(); };
    if (kind === 'play') tri(cx + z * 0.05, 1);
    else if (kind === 'pause') { c.fillRect(cx - z * 0.75, cy - z, z * 0.55, z * 2); c.fillRect(cx + z * 0.2, cy - z, z * 0.55, z * 2); }
    else if (kind === 'back') { tri(cx + z * 0.25, -1); c.fillRect(cx - z * 0.85, cy - z, z * 0.3, z * 2); }
    else if (kind === 'fwd') { tri(cx - z * 0.25, 1); c.fillRect(cx + z * 0.55, cy - z, z * 0.3, z * 2); }
    else if (kind === 'close') { c.beginPath(); c.moveTo(cx - z * 0.8, cy - z * 0.8); c.lineTo(cx + z * 0.8, cy + z * 0.8); c.moveTo(cx + z * 0.8, cy - z * 0.8); c.lineTo(cx - z * 0.8, cy + z * 0.8); c.stroke(); }
    else if (kind === 'retry') { c.beginPath(); c.arc(cx, cy, z * 0.85, -Math.PI * 0.35, Math.PI * 1.3); c.stroke(); c.beginPath(); c.moveTo(cx + z * 0.25, cy - z * 1.25); c.lineTo(cx + z * 0.95, cy - z * 0.6); c.lineTo(cx + z * 0.1, cy - z * 0.3); c.closePath(); c.fill(); }
    else if (kind === 'grip') { for (const dx of [-0.5, 0.5]) for (const dy of [-0.9, 0, 0.9]) { c.beginPath(); c.arc(cx + dx * z, cy + dy * z, Math.max(0.9, z * 0.2), 0, 7); c.fill(); } }
    c.restore();
  }
  // ---- 화면 나누기(v0.12.0, 사용자 결정): 화면을 차트 구역과 플레이 구역으로 나눈다. 차트 구역은 아래·왼쪽·위·오른쪽 가운데 한 변에 붙는다.
  // 경계선을 끌거나 경계선 위에서 휠을 굴려 구역 크기를 바꾸고, 구역을 잡아 화면의 다른 변 쪽으로 끌어다 놓으면 그 변에 붙는다. 붙는 쪽·크기·켬끔은 저장되어 다시 실행해도 남는다.
  // 플레이 구역에는 게임 화면(960×540)을 비율을 지켜 줄여 넣는다(VW). 화면 좌표 ↔ 게임 좌표는 toWorld·toScreen 한곳에서 바꾼다(조준, 결과 카드 자리 찾기가 쓴다)
  const DOCKS = ['bottom', 'left', 'top', 'right'], DOCK_NAME = { bottom: '아래', left: '왼쪽', top: '위', right: '오른쪽' }, LAY_STORE = 'climbLayout_v1';
  // 차트에 나올 수 있는 줄은 열 가지다: 왼손·오른손·왼발·오른발 보내기, 모으기, 취소, 몸 위·아래·왼쪽·오른쪽(조준 키와 설정 키는 차트에 넣지 않는다).
  // 열 줄이 모두 나와도 줄마다 구분되는 가장 작은 높이(LAY_FIT)를 위·아래 구역의 기본 크기이자 가장 작은 크기로 쓴다
  const CHM = { head: 18, axis: 13, foot: 4, laneMin: 15, laneMax: 50, lanes: 10 }, LAY_FIT = CHM.head + CHM.axis + CHM.foot + CHM.lanes * CHM.laneMin;
  // 구역은 아주 작게도 줄일 수 있다(줄이 다 들어가지 않으면 차트 안에서 휠로 줄을 내려 본다). 처음 크기는 열 줄이 다 보이는 LAY_FIT
  const LAY_LIM = { bottom: [80, 320], top: [80, 320], left: [180, 460], right: [180, 460] }, laySize = (d, v) => Math.max(LAY_LIM[d][0], Math.min(LAY_LIM[d][1], v));
  // log = 로그 구역(차트 구역을 한 번 더 나눈 것: 위·아래 붙임이면 오른쪽, 옆 붙임이면 아래), logSize.h = 그 너비(위·아래 붙임), logSize.v = 그 높이(옆 붙임). zoom = 게임 화면 배율(1 = 플레이 구역에 맞춤)
  const LAY = { dock: 'bottom', size: { bottom: LAY_FIT, top: LAY_FIT, left: 300, right: 300 }, chart: true, guide: true, log: true, logSize: { h: 270, v: 150 }, zoom: 1,
    show: { help: true, lesson: true, result: true, status: true, recent: true, cursorLong: false, helpMore: false }, // 보기 설정의 체크박스로 켜고 끄는 것들(차트·로그·키 안내는 위의 chart·log·guide)
    pos: {} };                                                                    // 끌어서 옮긴 카드의 자리(플레이 구역의 왼쪽 위 기준). 없으면 제자리
  try { const sv = JSON.parse(localStorage.getItem(LAY_STORE) || 'null'); if (sv) { if (DOCKS.includes(sv.dock)) LAY.dock = sv.dock; for (const d of DOCKS) if (sv.size && Number.isFinite(sv.size[d])) LAY.size[d] = laySize(d, sv.size[d]); for (const k of ['chart', 'guide', 'log']) if (typeof sv[k] === 'boolean') LAY[k] = sv[k];
    for (const k of ['h', 'v']) if (sv.logSize && Number.isFinite(sv.logSize[k])) LAY.logSize[k] = sv.logSize[k]; if (Number.isFinite(sv.zoom) && sv.zoom > 0.1 && sv.zoom < 10) LAY.zoom = sv.zoom;
    for (const k in LAY.show) if (sv.show && typeof sv.show[k] === 'boolean') LAY.show[k] = sv.show[k]; for (const k of ['guide', 'lesson', 'help', 'result']) if (sv.pos && sv.pos[k] && Number.isFinite(sv.pos[k].x) && Number.isFinite(sv.pos[k].y)) LAY.pos[k] = { x: sv.pos[k].x, y: sv.pos[k].y }; } } catch (e) {}
  { const q = G.params; if (q.get('chart') !== null) LAY.chart = q.get('chart') !== 'off'; if (DOCKS.includes(q.get('dock'))) LAY.dock = q.get('dock'); if (q.get('size') !== null && Number.isFinite(+q.get('size'))) LAY.size[LAY.dock] = laySize(LAY.dock, +q.get('size')); if (q.get('guide') !== null) LAY.guide = q.get('guide') !== 'off'; if (q.get('log') !== null) LAY.log = q.get('log') !== 'off'; if (q.get('zoom') !== null && +q.get('zoom') > 0) LAY.zoom = +q.get('zoom'); }
  const saveLay = () => { try { localStorage.setItem(LAY_STORE, JSON.stringify(LAY)); } catch (e) {} };
  // PZ = 플레이 구역, CZ = 차트 구역 전체(없으면 null), KZ = 그 안의 차트 부분, LZ = 그 안의 로그 부분(없으면 null), SPL = 플레이/차트 경계선, LSP = 차트/기록 경계선
  // VW = 게임 화면이 놓이는 배율과 자리, HV = 게임 화면에 붙은 안내(조작 설명 칸, 오른쪽 위 글)가 놓이는 배율과 자리(맞춤 때의 것. 확대해서 옮겨 보아도 구역 안에 머문다)
  let PZ = { x: 0, y: 0, w: W, h: H }, CZ = null, KZ = null, LZ = null, SPL = null, LSP = null, VW = { s: 1, x0: 0, y0: 0, fit: 1, fitsX: true, fitsY: true }, HV = { s: 1, x0: 0, y0: 0 };
  const CAM = { cx: W / 2, cy: H / 2 }, ZOOM_LIM = [0.3, 2.5], LOG_MIN = { h: 140, v: 56 }; // ZOOM_LIM = 게임 화면의 실제 배율 범위
  const logLim = () => CZ ? (SPL.vertical ? [LOG_MIN.v, Math.max(LOG_MIN.v, CZ.h - 130)] : [LOG_MIN.h, Math.max(LOG_MIN.h, CZ.w - 260)]) : [0, 0];
  function relayout() { // 차트 구역은 조작 D안에서만 쓴다(다른 조작·자동 시연은 화면 전체가 플레이 구역)
    if (LAY.chart && mode === 'intent' && !bot) { const z = PRACTICE.dockZones(LAY.dock, LAY.size[LAY.dock], W, H); PZ = z.play; CZ = z.chart; SPL = { ...z.line, vertical: z.vertical };
      if (!LAY.log) { KZ = CZ; LZ = null; LSP = null; }
      else if (SPL.vertical) { const lm = logLim(), lh = Math.max(lm[0], Math.min(lm[1], LAY.logSize.v)); KZ = { x: CZ.x, y: CZ.y, w: CZ.w, h: CZ.h - lh }; LZ = { x: CZ.x, y: CZ.y + CZ.h - lh, w: CZ.w, h: lh }; LSP = { x: CZ.x, y: LZ.y, w: CZ.w, h: 0, vertical: false }; }
      else { const lm = logLim(), lw = Math.max(lm[0], Math.min(lm[1], LAY.logSize.h)); KZ = { x: CZ.x, y: CZ.y, w: CZ.w - lw, h: CZ.h }; LZ = { x: CZ.x + CZ.w - lw, y: CZ.y, w: lw, h: CZ.h }; LSP = { x: LZ.x, y: CZ.y, w: 0, h: CZ.h, vertical: true }; } }
    else { PZ = { x: 0, y: 0, w: W, h: H }; CZ = null; KZ = null; LZ = null; SPL = null; LSP = null; }
    // 게임 화면: 맞춤 배율 × 내가 고른 배율. 차트가 옆에 붙으면 게임 화면을 아래로 붙인다 → 위에 남는 띠에 과제 카드와 키 안내를 둔다(게임 화면을 덜 가린다)
    const ay = SPL && SPL.vertical ? 1 : 0.5, fit = PRACTICE.fitView(PZ, W, H, ay).s; LAY.zoom = Math.max(ZOOM_LIM[0] / fit, Math.min(ZOOM_LIM[1] / fit, LAY.zoom));
    VW = PRACTICE.camView(PZ, W, H, ay, LAY.zoom, CAM.cx, CAM.cy);
    if (S && (!VW.fitsX || !VW.fitsY)) { // 확대해서 게임 화면이 구역보다 크면: 몸이 구역 가장자리로 나가지 않게 보기 자리가 따라간다
      const xs = S.p.map(q => q.x), ys = S.p.map(q => q.y), bx = (Math.min(...xs) + Math.max(...xs)) / 2, by = (Math.min(...ys) + Math.max(...ys)) / 2; // 몸 전체(손발 끝까지)의 가운데
      const f = PRACTICE.camFollow(VW, PZ, VW.x0 + (bx - OX) * VW.s, VW.y0 + (by - OY) * VW.s, Math.min(130, PZ.w * 0.3), Math.min(120, PZ.h * 0.34)); if (f.moved) VW = PRACTICE.camView(PZ, W, H, ay, LAY.zoom, f.cx, f.cy); }
    CAM.cx = VW.cx; CAM.cy = VW.cy;
    HV = { s: VW.fit, x0: PZ.x + (PZ.w - W * VW.fit) / 2, y0: PZ.y + (PZ.h - H * VW.fit) * ay }; // 안내는 늘 맞춤 배율·맞춤 자리에 둔다(게임 화면을 확대하거나 옮겨 보아도 따라 움직이지 않는다)
  }
  function setZoom(z, mx, my) { // mx·my를 주면 그 자리의 점이 그대로 있게 바꾼다(휠). 없으면 맞춤 자리로
    const ay = SPL && SPL.vertical ? 1 : 0.5, zz = Math.max(ZOOM_LIM[0] / VW.fit, Math.min(ZOOM_LIM[1] / VW.fit, Math.abs(z - 1) < 0.03 ? 1 : z));
    if (mx !== undefined) { const v = PRACTICE.camZoom(VW, PZ, W, H, ay, zz, mx, my); CAM.cx = v.cx; CAM.cy = v.cy; }
    LAY.zoom = zz; saveLay(); relayout(); aim.resync = true;
  }
  const toWorld = (sx, sy) => [(sx - VW.x0) / VW.s + OX, (sy - VW.y0) / VW.s + OY], toScreen = (wx, wy) => [VW.x0 + (wx - OX) * VW.s, VW.y0 + (wy - OY) * VW.s];
  const visible = () => { const a = toWorld(PZ.x, PZ.y), b = toWorld(PZ.x + PZ.w, PZ.y + PZ.h); return { x0: a[0], y0: a[1], x1: b[0], y1: b[1] }; }; // 플레이 구역에 보이는 게임 좌표 범위(게임 화면보다 넓은 쪽은 벽이 이어져 보인다)
  // 끌어서 옮길 수 있는 카드(키 안내·과제 카드·결과 카드)의 자리: 옮긴 적이 있으면 그 자리(플레이 구역 안으로 맞춘다), 없으면 제자리(dx, dy)
  function panelAt(id, w, h, dx, dy) { const q = LAY.pos[id]; if (!q) return [dx, dy]; return [Math.max(PZ.x, Math.min(PZ.x + PZ.w - w, PZ.x + q.x)), Math.max(PZ.y, Math.min(PZ.y + PZ.h - h, PZ.y + q.y))]; }
  function setChart(on) { LAY.chart = !!on; saveLay(); relayout(); }
  function setLog(on) { LAY.log = !!on; saveLay(); relayout(); }
  function setDock(d) { LAY.dock = d; saveLay(); relayout(); VIEW.manual = false; VIEW.start = 0; }

  // ---- 입력 비교 차트(차트 구역 안): 줄은 "수행한 동작"(결정된 팔다리, 누르고 있던 몸 동작, 취소)이고 줄 머리에는 키캡만 둔다. 시범 = 윤곽선, 내 입력 = 채움. 순간 입력 = 마름모, 누르고 있기 = 구간.
  // 0초 = 첫 입력(시범도 나도 각자의 첫 입력). 길이와 자리는 기록의 시각으로 계산한다. 색은 동작을 구분할 뿐 성공·실패를 뜻하지 않는다.
  // 기록마다 시작점 왼쪽에 고정 크기의 "시작 표식"(그때 실제로 누른 키)을 둔다. 표식의 크기는 누른 시간과 상관없다. 누른 시간은 막대의 두 끝과, 가리켰을 때 나오는 숫자로만 읽는다.
  // 구역의 크기는 그대로다: 줄이 늘면 줄 높이와 키캡이 줄고, 기록이 길어지면 시간축이 줄어 전체가 보인다(확대·축소·옮기기를 하면 다시 시작할 때까지 손으로 정한 대로)
  const INK = '#f3ecd6', DIM = 'rgba(243,236,214,0.6)';
  const VIEW = PRACTICE.view(4), CH = { rect: null, plot: null, tools: null, bar: null, ax: 0, pad: 0, pps: 1, end: 0, n: 1, laneH: 0, big: false, marks: [], heads: [], hover: null, tip: null, off: null, scroll: 0, scrollMax: 0, head: 18, lanesTop: 0 };
  function tlModel(master, mine) {
    const lanes = new Map(), lane = (key, mk) => { if (!lanes.has(key)) lanes.set(key, { key, ...mk(), m: [], i: [] }); return lanes.get(key); };
    const add = (r, who) => { if (!r) return; const z = r.zero(), evs = [];
      for (const b of r.all()) if (ACT.HOLD[b.id]) evs.push({ t: b.a, key: b.id, mk: () => ({ kind: 'hold', id: b.id, ...ACT.HOLD[b.id] }), e: { who, a: b.a - z, b: b.b - z, live: !!b.live, code: b.code || null } });
      for (const t of r.taps) evs.push({ t: t.t, key: 'limb' + t.limb, mk: () => ({ kind: 'tap', limb: t.limb, ...ACT.LIMB[t.limb] }), e: { who, a: t.t - z, mark: t.phase === 'charge', id: t.id, code: t.code || null, mod: t.mod || null } });
      for (const p of r.presses || []) if (ACT.PRESS[p.id]) evs.push({ t: p.t, key: p.id, mk: () => ({ kind: 'press', id: p.id, ...ACT.PRESS[p.id] }), e: { who, a: p.t - z, code: p.code || null } });
      evs.sort((p, q) => p.t - q.t); for (const ev of evs) lane(ev.key, ev.mk)[who].push(ev.e); };
    add(master, 'm'); add(mine, 'i'); // 줄 순서: 시범에서 처음 나온 순서, 그다음 내 입력에만 있는 것
    const out = [...lanes.values()]; let end = 0; for (const L of out) for (const e of L.m.concat(L.i)) end = Math.max(end, e.b ?? e.a);
    return { lanes: out, end };
  }
  // 기록의 한 입력에 보일 키: **그때 실제로 누른 키**(기록의 code·mod). 지금 그 동작에 다른 키가 배정돼 있어도 기록대로 보인다.
  // 실제 키가 없는 기록(적어 둔 시범)에만 지금 설정의 키를 쓰고, 그것은 조작 안내라는 표시(guide)를 붙인다. 손 선택 2번에서는 어느 손이 될지 입력만으로는 알 수 없으므로 손 색을 칠하지 않는다
  function eventKeys(L, e) {
    if (L.kind !== 'tap') return e && e.code ? { codes: [e.code], role: L.role, guide: false, action: L.id } : { codes: [firstCode(L.id)], role: L.role, guide: true, action: L.id };
    const foot = L.limb >= 2;
    if (e && e.code) return { codes: foot ? [e.mod || firstCode('foot'), e.code] : [e.code], role: L.role, guide: false, action: (foot ? 'foot+' : '') + (e.id || '') };
    const hm = CTRL.OPT.handMode, id = hm === 1 ? (L.limb % 2 ? 'sendR' : 'sendL') : 'sendBest';
    return { codes: foot ? [firstCode('foot'), firstCode(id)] : [firstCode(id)], role: hm === 1 ? L.role : 'any', guide: true, action: (foot ? 'foot+' : '') + id };
  }
  // 줄 머리의 키캡: 그 줄에서 가장 최근에 실제로 누른 키(내 기록 먼저, 없으면 견주는 기록). 실제 키가 하나도 없으면 지금 설정 기준 안내
  function laneKeys(L) { const real = [...L.i].reverse().find(e => e.code) || [...L.m].reverse().find(e => e.code); return eventKeys(L, real || null); }
  const laneWasDown = (L, now) => L.kind === 'hold' ? L.i.some(b => b.a <= now && now < b.b) : L.i.some(t => now >= t.a && now - t.a < 0.15); // 리플레이에서 그 시각에 눌려 있었나
  const evName = (L, e) => L.kind !== 'tap' ? L.name : `${L.name} ${e.mark ? '· 놓을 손 지정' : '보내기'}`;
  function drawChart(master, mine, now) {
    const c = G.ctx, model = tlModel(master, mine), lanes = model.lanes.length ? model.lanes : [{ key: 'power', kind: 'hold', id: 'power', ...ACT.HOLD.power, m: [], i: [] }], n = lanes.length;
    const x = KZ.x, y = KZ.y, w = KZ.w, h = KZ.h, l = lesson(), ref = l ? '시범' : '이전 시도', mineT = l ? '내 입력' : '이번 시도', replaying = phase === 'replay';
    // 머리 = 머리줄 + (리플레이 중이면) 재생 도구 줄들. 줄이 늘수록 줄 높이가 줄고(가장 작게 15), 그래도 다 들어가지 않으면 차트 안에서 휠로 줄을 내려 본다
    const items = replaying ? replayToolItems() : null, fl = items ? PRACTICE.flow(items.map(q => q.w), w - 12, 4) : null, head = CHM.head + (fl ? fl.rows * RT.row + 2 : 0);
    const availH = Math.max(CHM.laneMin, h - head - CHM.axis - CHM.foot), laneH = PRACTICE.laneHeight(availH, n, CHM.laneMin, CHM.laneMax), big = laneH >= 36, viewH = Math.min(n * laneH, availH), scrollMax = Math.max(0, n * laneH - availH); // 넉넉하면(big) 줄마다 두 줄(위 시범, 아래 나)로 그린다
    CH.scroll = Math.max(0, Math.min(scrollMax, CH.scroll));
    const mh = big ? Math.min(24, laneH / 2 - 1) : Math.max(7, Math.min(22, laneH - 2));              // 시작 표식의 높이(누른 시간과 상관없음)
    const kh0 = Math.max(7, Math.min(laneH - (big ? 4 : 1.5), 44)), heads = lanes.map(L => laneKeys(L));
    const labW = Math.max(24, Math.min(Math.max(...heads.map(K => keysW(K.codes, kh0))), big ? 116 : 96, w * 0.26)), lab = labW + 12, ax = x + lab, aw = Math.max(40, w - lab - 8);
    let mwMax = mh; for (const L of lanes) for (const e of L.m.concat(L.i)) mwMax = Math.max(mwMax, keysW(eventKeys(L, e).codes, mh)); // 0초의 표식이 잘리지 않게 왼쪽을 비운다
    const pad = Math.min(72, mwMax) + 8, plotW = Math.max(1, aw - pad - 10), top = y + head + CHM.axis;
    VIEW.follow(now, model.end, Math.max(VIEW.span0, plotW / 14)); const pps = plotW / VIEW.span, X = t => ax + pad + (t - VIEW.start) * pps;
    Object.assign(CH, { rect: { x, y, w, h }, plot: { x: ax, y: top, w: aw, h: viewH }, ax, pad, pps, end: Math.max(model.end, now || 0), n, laneH, big, marks: [], heads: [], hover: null, tip: null, scrollMax, head, lanesTop: top });
    // 머리줄: 왼쪽에 잡는 곳 표시·제목·범례, 오른쪽에 끄기·자리 옮기기와 시간축 단추(전체·축소·확대). 좁으면 범례부터 뺀다
    const bh = 13, by = y + 3, fz = 9; let rx = x + w - 5;
    for (const [id, t, bw] of [['tl_mode', `${BIND.first('chart')} 끄기`, 0], ['tl_dock', `${BIND.first('dock')} 자리`, 0]].concat(LAY.log ? [] : [['log_on', `${BIND.first('log')} 로그`, 0]], [['tl_in', '+', 17], ['tl_out', '−', 17], ['tl_fit', '전체', 0]])) { const ww = bw || G.textW(t, fz, 800) + 10; if (rx - ww < x + 16) break; rx -= ww; hudBtn(id, rx, by, ww, bh, t, { size: fz }); rx -= 3; } // 좁으면 들어가는 데까지만(키는 그대로 쓸 수 있다)
    { let lx = x + 8; const ty = y + 13, fit = t2 => lx + t2 < rx - 6;
      icon(c, 'grip', lx + 2, ty - 3.5, 3.5, DIM); lx += 10;
      if (fit(G.textW(ACT.name.chart, 10.5, 800))) { G.text(ACT.name.chart, lx, ty, { size: 10.5, weight: 800, color: INK }); lx += G.textW(ACT.name.chart, 10.5, 800) + 12; }
      if (fit(16 + 5 + G.textW(ref, fz, 700) + 10 + 16 + 5 + G.textW(mineT, fz, 700))) { const ph = 7, pw = 16, py = ty - 7; pill(c, lx, py, pw, ph, null, INK, 1.4); G.text(ref, lx + pw + 5, ty, { size: fz, weight: 700, color: INK }); lx += pw + 5 + G.textW(ref, fz, 700) + 10;
        pill(c, lx, py, pw, ph, INK, null); G.text(mineT, lx + pw + 5, ty, { size: fz, weight: 700, color: INK }); lx += pw + 5 + G.textW(mineT, fz, 700) + 12; }
      // 안내 글은 항목마다 넉넉히 띄우고 가는 세로줄로 나눈다(붙여 쓰면 어디까지가 한 항목인지 읽기 어렵다). 좁으면 들어가는 항목까지만
      CH.hints = []; lx += 6; for (const t of replaying ? ['시간축을 누르거나 끌면 그 시각으로'] : ['0초 = 첫 입력', '표식 = 그때 누른 키', '흐린 윤곽 = 지금 설정 기준']) { const tw2 = G.textW(t, 8.5, 600); if (!fit(tw2 + 10)) break; c.fillStyle = 'rgba(243,236,214,0.28)'; c.fillRect(lx, ty - 8, 1, 10); G.text(t, lx + 10, ty, { size: 8.5, weight: 600, color: DIM }); CH.hints.push({ t, x: lx + 10, w: tw2 }); lx += 10 + tw2 + 14; } }
    if (fl) { CH.tools = { x: x + 6, y: y + CHM.head, w: w - 12, h: fl.rows * RT.row, rows: fl.rows }; drawReplayStrip(x + 6, y + CHM.head, items, fl); }
    // 눈금: 보이는 폭에 맞춰 간격을 고른다
    const major = [0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60].find(sv => sv * pps >= 44) || 120, minor = major / 2;
    for (let k = Math.max(0, Math.floor(VIEW.start / minor) - 1); k * minor <= VIEW.start + VIEW.span + minor; k++) { const t = k * minor, gx = X(t), isM = k % 2 === 0; if (gx < ax - 0.5 || gx > ax + aw + 0.5) continue;
      c.fillStyle = isM ? 'rgba(243,236,214,0.16)' : 'rgba(243,236,214,0.07)'; c.fillRect(gx, top - (isM ? 3 : 0), 1, viewH + (isM ? 3 : 0));
      if (isM) G.text((major < 0.5 ? t.toFixed(2) : major < 1 ? t.toFixed(1) : `${t}`) + (t === 0 ? '초' : ''), gx + 3, top - 3, { size: 8, weight: 700, color: DIM }); }
    const mo = G.input.mouse, footDown = BIND.down('foot', G.input), hoverOk = HUD.overChart && !HUD.drag && mo.x >= ax && mo.x <= ax + aw && mo.y >= top && mo.y <= top + viewH;
    const near = e => now !== null && e.a <= now + 1e-6 && now <= (e.b ?? e.a) + 0.15;   // 재생 시각(또는 지금) 근처의 입력
    let hover = null; const later = [], fs = Math.max(7, Math.min(9.5, laneH * 0.62));
    // 한 줄(row)의 기록을 그린다: 정확한 시작 눈금 + 막대(또는 마름모) + 시작 표식. 표식끼리, 또는 표식과 앞 기록이 겹치면 묶음 표식(개수)으로 보인다 — 기록 자체는 하나도 빼지 않는다
    const drawRow = (L, list, who, ry, rh, withMarks) => { const col = ROLE[L.role] || ROLE.neutral, outline = who === 'm', bhh = Math.max(3, Math.min(9, rh * 0.36)), bY = ry + (rh - bhh) / 2, groups = []; let right = -1e9;
      for (const e of list) { const xs = X(e.a), xe = L.kind === 'hold' ? X(e.b) : xs, K = eventKeys(L, e), mw = keysW(K.codes, mh);
        if (L.kind === 'hold') { const bw = xe - xs; c.beginPath(); G.roundRect(xs, bY, bw, bhh, Math.min(bhh / 2, bw / 2)); if (outline) { c.fillStyle = rgba(col, 0.1); c.fill(); c.strokeStyle = col; c.lineWidth = 1.3; c.stroke(); } else { c.fillStyle = col; c.fill(); } }
        else diamond(c, xs, ry + rh / 2, Math.max(2.4, Math.min(4, rh * 0.3)), outline ? rgba(col, 0.12) : col, outline ? col : null);
        c.fillStyle = col; c.fillRect(xs - 0.75, ry + 1, 1.5, rh - 2);                                                                  // 시작 눈금: 정확한 시작 시각
        if (withMarks) { if (groups.length && xs - 4 - mw < right) groups[groups.length - 1].items.push(e); else groups.push({ x: xs, K, mw, items: [e] }); right = Math.max(right, xe + 2, xs + 5); }
        if (hoverOk && mo.y >= ry && mo.y <= ry + rh && mo.x >= xs - 3 && mo.x <= Math.max(xe, xs) + 4) hover = { L, e, who, group: null };
        later.push(() => { if (!(near(e) || (hover && (hover.e === e || (hover.group && hover.group.includes(e)))))) return; // 숫자는 가리킨 기록과 재생 시각 근처의 기록에만 붙인다
          if (L.kind === 'hold') G.text(`${(e.b - e.a).toFixed(2)}초`, xe + 5, ry + rh / 2 + fs * 0.36, { size: fs, weight: 800, color: INK }); else if (e.mark && big) G.text('놓을 손', xs + 8, ry + rh / 2 + 3.5, { size: 8.5, weight: 800, color: INK }); }); }
      for (const gp of groups) { const mx = gp.x - 4 - gp.mw, my = ry + (rh - mh) / 2, hi = gp.items.some(near);
        if (hoverOk && mo.y >= ry && mo.y <= ry + rh && mo.x >= mx - 1 && mo.x <= gp.x - 3) hover = { L, e: gp.items[0], who, group: gp.items.length > 1 ? gp.items : null };
        later.push(() => { c.strokeStyle = col; c.lineWidth = 1; c.beginPath(); c.moveTo(gp.x - 4, ry + rh / 2); c.lineTo(gp.x, ry + rh / 2); c.stroke();                       // 표식과 시작 눈금을 잇는 짧은 선
          if (hi || (hover && gp.items.includes(hover.e))) { c.beginPath(); G.roundRect(mx - 1.5, my - 1.5, gp.mw + 3, mh + 3, 4); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke(); }
          drawKeys(gp.K.codes, mx, my, mh, { role: gp.K.role, outline, ghost: gp.K.guide, where: 'mark', action: gp.K.action, who, t: gp.items[0].a, n: gp.items.length, forceDown: hi && !outline });
          if (gp.items.length > 1) { const bt = `×${gp.items.length}`, bw2 = G.textW(bt, 8, 900) + 7; pill(c, mx - 2, my - 5, bw2, 10, INK, null); G.text(bt, mx - 2 + bw2 / 2, my + 2.7, { size: 8, weight: 900, align: 'center', color: '#1c231d' }); } });
        CH.marks.push({ who, lane: L.key, t: gp.items[0].a, n: gp.items.length, codes: gp.K.codes, guide: gp.K.guide, x: mx, w: gp.mw }); } };
    c.save(); c.beginPath(); c.rect(x, top, w, viewH); c.clip(); // 줄은 차트의 줄 칸 안에서만 보인다(내려 보기)
    lanes.forEach((L, k) => { const ly = top + k * laneH - CH.scroll, K = heads[k];
      if (k % 2 === 0) { c.fillStyle = 'rgba(243,236,214,0.045)'; c.fillRect(x + 4, ly, w - 8, laneH); }
      // 줄 머리: 키캡만(그 줄에서 실제로 누른 키. 없으면 지금 설정 기준 안내를 흐리게)
      const kh = Math.min(kh0, kh0 * labW / keysW(K.codes, kh0)), kw = keysW(K.codes, kh), hx = x + 6 + (labW - kw) / 2, hy = ly + (laneH - kh) / 2;
      drawKeys(K.codes, hx, hy, kh, { role: K.role, ghost: K.guide, where: 'chart', action: K.action, forceDown: replaying ? laneWasDown(L, now) : undefined, down: L.kind === 'tap' && L.limb < 2 ? BIND.codeDown(K.codes[0], G.input) && !footDown : undefined });
      CH.heads.push({ lane: L.key, x: hx, y: hy, w: kw, h: kh, codes: K.codes, shown: hy >= top - 0.5 && hy + kh <= top + viewH + 0.5 });
      c.save(); c.beginPath(); c.rect(ax, ly, aw, laneH); c.clip();
      if (big) { drawRow(L, L.m, 'm', ly + 1, laneH / 2 - 1, true); drawRow(L, L.i, 'i', ly + laneH / 2, laneH / 2 - 1, true); }
      else { drawRow(L, L.m, 'm', ly + 0.5, laneH - 1, !L.i.length); drawRow(L, L.i, 'i', ly + 0.5, laneH - 1, true); } // 좁을 때는 한 줄에 겹쳐 그리고, 표식은 내 기록에(없으면 견주는 기록에) 붙인다
      c.restore(); });
    c.restore();
    c.save(); c.beginPath(); c.rect(ax, top - 1, aw, viewH + 2); c.clip(); for (const f of later) f(); c.restore();
    if (scrollMax > 0) { // 줄이 더 있다: 오른쪽 끝의 가는 막대와 "위·아래에 몇 줄"
      const bh2 = Math.max(10, viewH * viewH / (n * laneH)), by2 = top + (viewH - bh2) * CH.scroll / scrollMax; c.fillStyle = 'rgba(243,236,214,0.14)'; c.fillRect(x + w - 4, top, 3, viewH); c.fillStyle = 'rgba(243,236,214,0.7)'; c.fillRect(x + w - 4, by2, 3, bh2);
      const up = Math.round(CH.scroll / laneH), dn = Math.round((scrollMax - CH.scroll) / laneH), t = `${up ? `▲ ${up}줄 ` : ''}${dn ? `▼ ${dn}줄` : ''}`.trim(), tw = G.textW(t, 8, 800) + 8; pill(c, x + w - 8 - tw, top + viewH - 11, tw, 10, 'rgba(16,21,18,0.9)', null); G.text(t, x + w - 8 - tw / 2, top + viewH - 3.3, { size: 8, weight: 800, align: 'center', color: INK }); }
    // 리플레이할 수 있는 끝: 연속으로 적힌 데까지만 재생한다(그 뒤는 적지 않았다)
    if (trk.full && mine && phase !== 'live') { const xe = X(trk.end() - mine.zero()); if (xe < ax + aw) { c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(Math.max(ax, xe), top, ax + aw - Math.max(ax, xe), viewH); if (xe >= ax) { c.fillStyle = '#ff9c8a'; c.fillRect(xe - 0.75, top - 3, 1.5, viewH + 3); G.text('리플레이 기록 끝', xe - 4, top + 9, { size: 8.5, weight: 800, align: 'right', color: '#ff9c8a' }); } } }
    // 지금 시각(리플레이에서는 재생 시각)
    if (now !== null && X(now) >= ax && X(now) <= ax + aw) { const px = X(now); c.fillStyle = replaying ? '#ffd166' : INK; c.fillRect(px - 0.5, top - 2, replaying ? 2 : 1.5, viewH + 4); const t = `${now.toFixed(2)}초`, pw = G.textW(t, 8, 900) + 10; pill(c, px - pw / 2, top - 12, pw, 10, replaying ? '#ffd166' : INK, null); G.text(t, px, top - 4.5, { size: 8, weight: 900, align: 'center', color: '#1c231d' }); }
    CH.hover = hover ? { lane: hover.L.key, who: hover.who, t: hover.e.a, n: hover.group ? hover.group.length : 1 } : null;
    if (hover) CH.tip = { hover, ref, mineT };
  }
  // 가리킨 기록의 설명: 그때 누른 키(크게), 동작 이름, 시작 시각, 누른 시간. 묶음이면 안에 든 기록을 모두 적는다
  function drawTip(hv, mo, ref, mineT) {
    const c = G.ctx, L = hv.L, items = hv.group || [hv.e], who = hv.who === 'm' ? ref : mineT, K0 = eventKeys(L, items[0]), lines = [];
    const line = e => `${e.a.toFixed(2)}초에 시작` + (L.kind === 'hold' ? ` · ${(e.b - e.a).toFixed(2)}초 누름${e.live ? '(누르는 중)' : ''}` : e.mark ? ' · 놓을 손 지정' : '');
    if (items.length === 1) lines.push(line(items[0])); else { lines.push(`겹쳐 보이는 기록 ${items.length}개`); items.slice(0, 6).forEach(e => lines.push({ e, t: line(e) })); if (items.length > 6) lines.push(`… ${items.length - 6}개 더(확대하면 따로 보입니다)`); }
    if (K0.guide) lines.push('키는 지금 설정 기준입니다(시범에는 실제로 누른 키가 없습니다)');
    const kh = 30, kw = keysW(K0.codes, kh), title = `${who} · ${evName(L, items[0])}`, tw = Math.max(kw + 8 + G.textW(title, 11.5, 800), ...lines.map(q => G.textW(typeof q === 'string' ? q : q.t, 10, 700) + (typeof q === 'string' ? 0 : 44))), w = tw + 20, h = 14 + kh + lines.length * 15;
    const x = Math.max(4, Math.min(W - w - 4, mo.x - w / 2)), y = mo.y - h - 14 < 4 ? mo.y + 18 : mo.y - h - 14;
    c.beginPath(); G.roundRect(x, y, w, h, 8); c.fillStyle = 'rgba(16,21,18,0.97)'; c.fill(); c.strokeStyle = '#8b9370'; c.lineWidth = 1; c.stroke();
    drawKeys(K0.codes, x + 8, y + 6, kh, { role: K0.role, ghost: K0.guide, where: 'tip', action: K0.action, down: false }); G.text(title, x + 8 + kw + 8, y + 26, { size: 11.5, weight: 800, color: INK });
    lines.forEach((q, k) => { const yy = y + 10 + kh + k * 15 + 10; if (typeof q === 'string') G.text(q, x + 10, yy, { size: 10, weight: 700, color: k === 0 ? INK : DIM });
      else { const Kq = eventKeys(L, q.e); drawKeys(Kq.codes, x + 10, yy - 11, 14, { role: Kq.role, ghost: Kq.guide, where: 'tip', action: Kq.action, down: false }); G.text(q.t, x + 54, yy, { size: 10, weight: 700, color: INK }); } });
  }
  // 리플레이 도구(v0.13.0, 사용자 결정): 차트의 머리줄 바로 아래에 둔다 — 차트가 아래·위·왼쪽·오른쪽 어디에 붙어 있어도 같다. 너비에 다 들어가지 않으면 다음 줄로 넘긴다(옆에 붙인 좁은 차트에서는 두세 줄).
  // 재생 그림이 주 표시이고 키캡은 단축키를 알려 주는 작은 보조 표시다. 시각을 옮기는 축은 차트의 시간축 하나다
  const RT = { row: 25, bh: 22, kh: 18 };
  function replayToolItems() {
    const btn = (id, act, o = {}) => ({ id, act, ...o, w: (o.text ? G.textW(o.text, 10, 900) + 3 : 15) + keyW(firstCode(act), RT.kh) + 13 }), note = trk.full ? `처음 ${Math.round(trk.maxS)}초까지 적혔습니다` : null;
    return [btn('rp_play', 'rpPlay', { icon: rp.playing ? 'pause' : 'play', primary: true }), btn('rp_back', 'rpBack', { icon: 'back' }), btn('rp_fwd', 'rpFwd', { icon: 'fwd' }), btn('rp_speed', 'rpSpeed', { text: `${rp.speed}×` }),
      { time: true, w: G.textW('00.00 / 00.00초', 10.5, 900) + 8 }, btn('replay', 'replay', { icon: 'close' }), btn('retry', 'reset', { icon: 'retry' })].concat(note ? [{ note, w: G.textW(note, 9, 700) + 6 }] : []);
  }
  function drawReplayStrip(x, y, items, fl) {
    const c = G.ctx; items.forEach((q, k) => { const bx = x + fl.at[k].x, by = y + fl.at[k].row * RT.row + 1, cy = by + RT.bh / 2;
      if (q.time) { G.text(`${(rp.t - rp.from).toFixed(2)} / ${(rp.to - rp.from).toFixed(2)}초`, bx + 4, cy + 3.8, { size: 10.5, weight: 900, color: INK }); return; }
      if (q.note) { G.text(q.note, bx + 3, cy + 3.2, { size: 9, weight: 700, color: '#ff9c8a' }); return; }
      const kc = firstCode(q.act), kw = keyW(kc, RT.kh); hudBtn(q.id, bx, by, q.w, RT.bh, null, { primary: q.primary });
      if (q.text) G.text(q.text, bx + 6, cy + 3.5, { size: 10, weight: 900, color: INK }); else icon(c, q.icon, bx + 11, cy, 4.5, q.primary ? '#1c231d' : INK);
      drawKey(kc, bx + q.w - kw - 4, by + (RT.bh - RT.kh) / 2, RT.kh, { where: 'replay', action: q.act, down: false }); });
  }
  // 차트 구역을 껐을 때만: 플레이 구역 아래에 떠 있는 도구 줄(얇은 진행 축 포함. 같은 재생 시계)
  function drawReplayTools() {
    CH.tools = null; CH.bar = null; if (phase !== 'replay') return; const c = G.ctx, h = 32, KH = 22, w = Math.min(PZ.w - 8, 660), x = PZ.x + (PZ.w - w) / 2, y = PZ.y + PZ.h - h - 4;
    CH.tools = { x, y, w, h, rows: 1 };
    c.beginPath(); G.roundRect(x, y, w, h, 8); c.fillStyle = 'rgba(28,35,29,0.95)'; c.fill(); c.strokeStyle = '#636a4b'; c.lineWidth = 1.5; c.stroke();
    let bx = x + 6; const tool = (id, act, ic, o = {}) => { const kc = firstCode(act), kw = keyW(kc, KH), bw = (o.text ? G.textW(o.text, 10.5, 900) + 4 : 16) + kw + 14; hudBtn(id, bx, y + 3, bw, h - 6, null, { primary: o.primary });
      if (o.text) G.text(o.text, bx + 7, y + h / 2 + 3.8, { size: 10.5, weight: 900, color: INK }); else icon(c, ic, bx + 13, y + h / 2, 5, o.primary ? '#1c231d' : INK);
      drawKey(kc, bx + bw - kw - 4, y + (h - KH) / 2, KH, { where: 'replay', action: act, down: false }); bx += bw + 4; };
    tool('rp_play', 'rpPlay', rp.playing ? 'pause' : 'play', { primary: true }); tool('rp_back', 'rpBack', 'back'); tool('rp_fwd', 'rpFwd', 'fwd'); tool('rp_speed', 'rpSpeed', null, { text: `${rp.speed}×` });
    const tt = `${(rp.t - rp.from).toFixed(2)} / ${(rp.to - rp.from).toFixed(2)}초`; G.text(tt, bx + 4, y + h / 2 + 4.2, { size: 11.5, weight: 900, color: INK }); bx += G.textW('00.00 / 00.00초', 11.5, 900) + 12;
    let ex = x + w - 6; const tail = (id, act, ic) => { const kc = firstCode(act), kw = keyW(kc, KH), bw = 16 + kw + 14; ex -= bw; hudBtn(id, ex, y + 3, bw, h - 6); icon(c, ic, ex + 13, y + h / 2, 5, INK); drawKey(kc, ex + bw - kw - 4, y + (h - KH) / 2, KH, { where: 'replay', action: act, down: false }); ex -= 4; };
    tail('retry', 'reset', 'retry'); tail('replay', 'replay', 'close');
    if (trk.full) { const t = `처음 ${Math.round(trk.maxS)}초까지 적혔습니다`; if (bx + G.textW(t, 9, 700) < ex) G.text(t, bx, y + h / 2 + 3.5, { size: 9, weight: 700, color: '#ff9c8a' }); }
    else if (ex - bx > 60) { const px = bx + 4, pw = ex - bx - 8, py = y + h / 2 - 2, f = (rp.t - rp.from) / Math.max(1e-6, rp.to - rp.from); CH.bar = { x: px, y: y + 3, w: pw, h: h - 6 };
      c.fillStyle = 'rgba(243,236,214,0.2)'; c.fillRect(px, py, pw, 4); c.fillStyle = '#ffd166'; c.fillRect(px, py, pw * f, 4); c.fillRect(px + pw * f - 1, py - 4, 2, 12); }
  }
  // ---- 로그(v0.13.0, 사용자 요청): 화면에 잠깐 떴다 사라지던 알림(경고, 이륙, 결과와 "바꿀 것")을 시각과 함께 쌓아 둔다. 차트 구역을 한 번 더 나눈 칸에 보인다
  // (차트가 위·아래에 붙어 있으면 차트 오른쪽, 옆에 붙어 있으면 차트 아래). 시도가 바뀌어도 남고, 휠로 올려 본다. 리플레이에서는 재생 시각 뒤의 알림을 흐리게 두고, 알림을 누르면 그 시각으로 간다
  const LOG = { items: [], att: 0, scroll: 0, max: 0 }, LOG_COL = { warn: '#ffb7a8', fail: '#ff9c8a', ok: '#7dff9a', hint: '#ffd9a0', info: INK };
  // at = 사건이 일어난 시각(물리 시각). 없으면 지금. 시각 열·본문·누르면 가는 재생 시각이 모두 이 시각이다(v0.16.2, GPT 검토 N3: 성공은 결과 카드가 뜬 시각이 아니라 목표에 닿은 시각)
  function logAdd(text, kind, at) {
    if (mode !== 'intent' || bot || demo || !text || !S) return; const last = LOG.items[LOG.items.length - 1], ev = at ?? S.t;
    if (last && last.att === LOG.att && last.text === text && last.kind === kind) { last.n = (last.n || 1) + 1; last.lastT = rec.t0 !== null ? ev - rec.t0 : null; return; } // 같은 알림이 잇달아 나오면 한 줄로 묶고 횟수·마지막 시각만 고친다(시각과 누르면 가는 곳은 처음 것, v0.16.3)
    if (!last || last.att !== LOG.att) LOG.items.push({ att: LOG.att, kind: 'sep', text: `${lesson() ? `연습 ${lessonI + 1}` : `자유 연습 · 시작 자세 ${station}`} · 시도 ${tries}`, t: null, st: S.t });
    LOG.items.push({ att: LOG.att, kind, text, t: rec.t0 !== null ? ev - rec.t0 : null, st: ev }); if (LOG.items.length > 300) LOG.items.splice(0, LOG.items.length - 300);
    if (LOG.scroll > 0) LOG.unseen = (LOG.unseen || 0) + 1; // 올려 읽는 중이면 끌어내리지 않고 "새 로그 N개"로 알린다(맨 아래에 있으면 새 것이 그대로 보인다)
  }
  function drawLogZone(now) {
    const c = G.ctx, z = LZ, pad = 8, head = 18, fz = 10, lh = 13, tcol = 40, tw = Math.max(40, z.w - pad * 2 - tcol - 6); LOG.rect = { ...z };
    c.fillStyle = '#161c17'; c.fillRect(z.x, z.y, z.w, z.h);
    c.save(); c.beginPath(); c.rect(z.x, z.y, z.w, z.h); c.clip();
    G.text(ACT.name.log, z.x + pad, z.y + 13, { size: 10.5, weight: 800, color: INK });
    { let rx = z.x + z.w - 5; for (const [id, t] of [['log_off', `${BIND.first('log')} 끄기`], ['log_clear', '지우기'], ['log_stats', '통계']]) { const ww = G.textW(t, 9, 800) + 10; rx -= ww; if (rx > z.x + pad + G.textW(ACT.name.log, 10.5, 800) + 4) hudBtn(id, rx, z.y + 3, ww, 13, t, { size: 9 }); rx -= 3; } }
    const rows = []; for (const it of LOG.items) { if (it.kind === 'sep') { rows.push({ it, sep: true, h: 17 }); continue; } wrap(it.n > 1 ? `${it.text}  ×${it.n}${it.lastT !== null && it.lastT !== undefined ? ` (마지막 ${it.lastT.toFixed(2)}초)` : ''}` : it.text, tw, fz, 600).forEach((ln, k, all) => rows.push({ it, ln, first: k === 0, h: lh + (k === all.length - 1 ? 3 : 0) })); }
    const total = rows.reduce((a, r) => a + r.h, 0), top = z.y + head + 2, viewH = z.h - head - 6; LOG.max = Math.max(0, total - viewH); if (LOG.scroll > 0 && LOG.total !== undefined && total > LOG.total) LOG.scroll += total - LOG.total; LOG.total = total; LOG.scroll = Math.max(0, Math.min(LOG.max, LOG.scroll)); if (LOG.scroll === 0) LOG.unseen = 0; LOG.rows = rows.length; // 올려 읽는 중에 새 줄이 생겨도 읽던 자리가 그대로 있게
    c.beginPath(); c.rect(z.x, top, z.w, viewH); c.clip();
    if (!rows.length) wrap('아직 남은 것이 없습니다. 경고·점프·결과가 시각과 함께 여기에 남습니다.', z.w - pad * 2, 9.5, 600).forEach((ln, k) => G.text(ln, z.x + pad, top + 12 + k * 13, { size: 9.5, weight: 600, color: DIM }));
    let yy = total <= viewH ? top : top + viewH - total + LOG.scroll; // 적을 때는 위에서부터, 넘치면 가장 새 것이 아래에 오게
    // 리플레이에서는 이번 시도의 로그 한 건(여러 줄이면 그 줄 모두)을 누르면 그 시각으로 간다. 하는 중에는 남기기만 한다
    const blocks = new Map(); { let y2 = yy; for (const r of rows) { if (!r.sep) { const q = blocks.get(r.it) || { y0: y2, y1: y2 }; q.y1 = y2 + lh; blocks.set(r.it, q); } y2 += r.h; } }
    const playable = it => it.att === LOG.att && it.t !== null && trk.frames.length > 1 && it.st >= trk.t0() - 1e-6 && it.st <= trk.end() + 1e-6; // 연속으로 적힌 자취 안의 사건만 재생할 수 있다
    LOG.playable = []; for (const [it] of blocks) if (phase === 'replay' && playable(it)) LOG.playable.push(it.t);
    for (const [it, q] of blocks) { const seek = phase === 'replay' && playable(it), id = `log@${it.att}@${it.t}`; if (!seek || q.y0 < top || q.y1 > top + viewH) continue;
      if (HUD.hot === id) { c.fillStyle = 'rgba(243,236,214,0.12)'; c.fillRect(z.x + 3, q.y0 - 1, z.w - 9, q.y1 - q.y0 + 2); } HUD.hits.push({ id, x: z.x + 3, y: q.y0 - 1, w: z.w - 9, h: q.y1 - q.y0 + 2 }); }
    rows.forEach(r => { const vis = yy + r.h > top && yy < top + viewH, it = r.it, cur = it.att === LOG.att;
      if (vis && r.sep) { c.fillStyle = 'rgba(243,236,214,0.14)'; c.fillRect(z.x + pad, yy + 8, z.w - pad * 2, 1); const t = it.text, w2 = G.textW(t, 8.5, 800) + 10; c.fillStyle = '#161c17'; c.fillRect(z.x + pad + 6, yy + 2, w2, 13); G.text(t, z.x + pad + 11, yy + 12, { size: 8.5, weight: 800, color: cur ? '#ffd166' : DIM }); }
      else if (vis) { const later = cur && phase === 'replay' && it.t !== null && now !== null && it.t > now + 0.02; c.globalAlpha = later ? 0.35 : cur ? 1 : 0.6;
        if (r.first) G.text(it.t === null ? '시작 전' : `${it.t.toFixed(2)}초`, z.x + pad + tcol, yy + 10, { size: 8.5, weight: 800, align: 'right', color: DIM });
        if (r.first && cur && phase === 'replay' && it.t !== null && !playable(it)) G.text('재생 기록 없음', z.x + z.w - 8, yy + 10, { size: 8, weight: 700, align: 'right', color: '#ff9c8a' }); // 기록 밖 사건: 남기되 누를 수 없다
        G.text(r.ln, z.x + pad + tcol + 6, yy + 10, { size: fz, weight: it.kind === 'fail' || it.kind === 'ok' ? 800 : 600, color: LOG_COL[it.kind] || INK }); c.globalAlpha = 1; }
      yy += r.h; });
    if (LOG.unseen > 0 && LOG.scroll > 0) { const t = `새 로그 ${LOG.unseen}개 ↓`, w3 = G.textW(t, 9, 800) + 14; hudBtn('log_new', z.x + z.w / 2 - w3 / 2, top + viewH - 17, w3, 15, t, { size: 9, primary: true }); HUD.hits.unshift(HUD.hits.pop()); } // 줄 위에 떠 있으므로 줄보다 먼저 맞춘다 // 누르면 맨 아래(가장 새 것)로
    if (LOG.max > 0) { const bh2 = Math.max(10, viewH * viewH / total), by2 = top + (viewH - bh2) * (1 - LOG.scroll / LOG.max); c.fillStyle = 'rgba(243,236,214,0.14)'; c.fillRect(z.x + z.w - 4, top, 3, viewH); c.fillStyle = 'rgba(243,236,214,0.7)'; c.fillRect(z.x + z.w - 4, by2, 3, bh2); }
    c.restore();
  }
  function drawChartPanel() { // 과제 중에는 시범과 나, 자유 연습에서는 이전 시도와 이번 시도. 리플레이에서는 내 기록 전체 위로 재생 시각이 지나간다
    const l = lesson(), master = l ? demoRec : lastRec, mine = demo ? null : rec.t0 !== null ? rec : null, c = G.ctx; CH.tip = null; CH.off = null; LOG.rect = null;
    if (!CZ) { const t = `${BIND.first('chart')} ${ACT.name.chart}`, w = G.textW(t, 9, 800) + 16, x = W - 112 - w, y = H - 24; if (phase !== 'replay') { G.panel(x, y, w, 17, 'rgba(28,35,29,0.88)', '#636a4b'); G.text(t, x + w / 2, y + 12, { size: 9, weight: 800, align: 'center', color: INK }); HUD.hits.push({ id: 'tl_mode', x, y, w, h: 17 }); CH.off = { x, y, w, h: 17 }; } drawReplayTools(); return; }
    const now = phase === 'replay' ? rp.t - (rec.t0 ?? 0) : demo ? (rec.t0 !== null ? S.t - rec.t0 : null) : phase === 'live' && mine ? S.t - mine.zero() : null;
    c.fillStyle = '#1b221c'; c.fillRect(CZ.x, CZ.y, CZ.w, CZ.h);
    c.save(); c.beginPath(); c.rect(KZ.x, KZ.y, KZ.w, KZ.h); c.clip(); drawChart(master, mine, now); c.restore();
    if (LZ) { drawLogZone(now); const hot = HUD.drag ? HUD.drag.kind === 'logsplit' : HUD.onLogSplit, t = hot ? 3 : 1.5; c.fillStyle = hot ? INK : '#4a5140'; if (LSP.vertical) c.fillRect(LSP.x - t / 2, LSP.y, t, LSP.h); else c.fillRect(LSP.x, LSP.y - t / 2, LSP.w, t); } // 차트와 로그 사이의 경계선
    // 경계선: 가리키거나 끄는 동안 밝게. 가운데의 점 셋은 "여기를 잡는다"는 표시
    { const hot = HUD.drag ? HUD.drag.kind === 'split' : HUD.onSplit, t = hot ? 3 : 2; c.fillStyle = hot ? INK : '#636a4b'; if (SPL.vertical) c.fillRect(SPL.x - t / 2, 0, t, H); else c.fillRect(0, SPL.y - t / 2, W, t);
      c.fillStyle = hot ? '#1c231d' : INK; for (const k of [-1, 0, 1]) { c.beginPath(); c.arc(SPL.vertical ? SPL.x : W / 2 + k * 7, SPL.vertical ? H / 2 + k * 7 : SPL.y, hot ? 1.1 : 1.4, 0, 7); c.fill(); } }
    if (CH.tip) drawTip(CH.tip.hover, G.input.mouse, CH.tip.ref, CH.tip.mineT);
  }
  function drawDockPreview() { // 차트 구역을 끌고 있을 때: 놓으면 붙을 자리를 미리 보인다
    const d = HUD.drag; if (!d || d.kind !== 'dock' || !d.target || d.target === LAY.dock) return; const c = G.ctx, z = PRACTICE.dockZones(d.target, LAY.size[d.target], W, H).chart;
    c.fillStyle = 'rgba(243,236,214,0.22)'; c.fillRect(z.x, z.y, z.w, z.h); c.strokeStyle = INK; c.lineWidth = 2; c.setLineDash([8, 6]); c.strokeRect(z.x + 2, z.y + 2, z.w - 4, z.h - 4); c.setLineDash([]);
    const t = `놓으면 ${DOCK_NAME[d.target]}에 붙습니다`, tw = G.textW(t, 12, 800) + 20; G.panel(z.x + z.w / 2 - tw / 2, z.y + z.h / 2 - 13, tw, 26, 'rgba(28,35,29,0.95)', INK); G.text(t, z.x + z.w / 2, z.y + z.h / 2 + 4.5, { size: 12, weight: 800, align: 'center', color: INK });
  }
  const inRect = (q, px, py) => !!q && px >= q.x && px <= q.x + q.w && py >= q.y && py <= q.y + q.h;
  const inPlot = m => inRect(CH.plot, m.x, m.y);
  const timeAt = x => VIEW.start + (x - CH.ax - CH.pad) / CH.pps, pannable = () => CH.end + 0.3 > VIEW.span || VIEW.start > 0;
  const nearSplit = (px, py) => !!SPL && (SPL.vertical ? Math.abs(px - SPL.x) <= 4 : Math.abs(py - SPL.y) <= 4);
  const nearLogSplit = (px, py) => !!LSP && inRect(CZ, px, py) && (LSP.vertical ? Math.abs(px - LSP.x) <= 3 : Math.abs(py - LSP.y) <= 3);
  function hudUpdate(inp) {
    const m = inp.mouse, anyDown = m.down.some(Boolean), z = inRect(CZ, m.x, m.y), inK = inRect(KZ, m.x, m.y), inL = inRect(LZ, m.x, m.y);
    if (HUD.splitHold && (!SPL || Math.hypot(m.x - HUD.splitHold.x, m.y - HUD.splitHold.y) > 3)) HUD.splitHold = null; // 휠로 크기를 바꾸면 경계선이 마우스에서 멀어진다. 마우스를 움직이기 전까지는 계속 경계선을 잡고 있는 것으로 본다
    const onSplit = nearSplit(m.x, m.y) || !!HUD.splitHold, onLogSplit = !onSplit && nearLogSplit(m.x, m.y), hit = HUD.hits.find(q => inRect(q, m.x, m.y)) || null, onTools = !CZ && inRect(CH.tools, m.x, m.y);
    // 누른 자리가 UI 안인가로 정한다(pressIn): 밖에서 누른 채 차트 위로 들어온 마우스는 뗄 때까지 게임 입력이고, 차트에서 누른 채 밖으로 나가도 뗄 때까지 UI의 것이다.
    // 판정은 누른 순간의 자리로 한다(화면이 잠깐 느려지면 판정할 때 마우스는 이미 다른 곳에 가 있을 수 있다)
    const inside = (px, py) => inRect(CZ, px, py) || nearSplit(px, py) || (!CZ && inRect(CH.tools, px, py)) || HUD.hits.some(q => inRect(q, px, py));
    if (inp.clicks.length) HUD.pressIn = inp.clicks.some(k => inside(k.x, k.y)); else if (!anyDown) HUD.pressIn = null;
    HUD.overChart = z || onSplit; HUD.onSplit = onSplit && !HUD.drag; HUD.onLogSplit = onLogSplit && !HUD.drag; HUD.hot = hit ? hit.id : null; HUD.click = null;
    HUD.capture = !!HUD.drag || (HUD.pressIn !== null ? HUD.pressIn : z || onSplit || !!hit || onTools); BIND.setMouseBlocked(HUD.capture);
    const seekBar = px => { if (rp && CH.bar) rp.seek(rp.from + (rp.to - rp.from) * Math.max(0, Math.min(1, (px - CH.bar.x) / CH.bar.w))); };
    if (HUD.drag) { const d = HUD.drag;
      if (!m.down[0]) { if (d.kind === 'split' || d.kind === 'logsplit' || d.kind === 'panel') saveLay(); if (d.kind === 'dock' && d.target && d.target !== LAY.dock) setDock(d.target); HUD.drag = null; }
      else if (d.kind === 'split' && SPL) { LAY.size[LAY.dock] = Math.round(PRACTICE.splitSize(LAY.dock, m.x, m.y, W, H, LAY_LIM[LAY.dock][0], LAY_LIM[LAY.dock][1])); relayout(); }
      else if (d.kind === 'logsplit' && LSP) { const lm = logLim(); if (LSP.vertical) LAY.logSize.h = Math.round(Math.max(lm[0], Math.min(lm[1], CZ.x + CZ.w - m.x))); else LAY.logSize.v = Math.round(Math.max(lm[0], Math.min(lm[1], CZ.y + CZ.h - m.y))); relayout(); }
      else if (d.kind === 'dock') d.target = Math.hypot(m.x - d.mx, m.y - d.my) > 16 ? PRACTICE.dockTarget(m.x, m.y, W, H) : null; // 조금 움직인 것은 옮기기로 보지 않는다
      else if (d.kind === 'panel') { if (d.moved || Math.hypot(m.x - d.mx, m.y - d.my) > 3) { d.moved = true; LAY.pos[d.id] = { x: Math.round(Math.max(PZ.x, Math.min(PZ.x + PZ.w - d.w, m.x - d.ox)) - PZ.x), y: Math.round(Math.max(PZ.y, Math.min(PZ.y + PZ.h - d.h, m.y - d.oy)) - PZ.y) }; } } // 카드 옮기기(플레이 구역 안에서)
      else if (d.kind === 'pan') { VIEW.start = d.start; VIEW.pan(-(m.x - d.mx) / CH.pps, CH.end); }
      else if (d.kind === 'seek' && rp) rp.seek((rec.t0 ?? 0) + timeAt(m.x));
      else if (d.kind === 'bar') seekBar(m.x);
    } else if (inp.clicks.some(k => k.button === 0)) {
      // 잡는 곳을 나눈다: 단추 → 경계선(구역 크기) → 차트/기록 경계선 → 시간축(리플레이: 시각 옮기기, 확대했을 때: 시간축 옮기기) → 차트 구역의 그 밖(다른 변으로 끌어다 놓기)
      const ck = inp.clicks.find(k => k.button === 0), p0 = { x: ck.x, y: ck.y }, hit0 = HUD.hits.find(q => inRect(q, p0.x, p0.y)) || null;
      const mvR = hit0 && hit0.id.startsWith('mv_') ? { guide: GD.rect, lesson: LC.rect, help: HELP.rect, result: ended && ended.rect }[hit0.id.slice(3)] : null;
      if (mvR) HUD.drag = { kind: 'panel', id: hit0.id.slice(3), cursor: 'move', mx: p0.x, my: p0.y, ox: p0.x - mvR.x, oy: p0.y - mvR.y, w: mvR.w, h: mvR.h, moved: false };
      else if (hit0) HUD.click = hit0.id;
      else if (inRect(CH.bar, p0.x, p0.y)) { HUD.drag = { kind: 'bar', cursor: 'pointer' }; seekBar(p0.x); }
      else if (nearSplit(p0.x, p0.y)) HUD.drag = { kind: 'split', cursor: SPL.vertical ? 'ew-resize' : 'ns-resize' };
      else if (nearLogSplit(p0.x, p0.y)) HUD.drag = { kind: 'logsplit', cursor: LSP.vertical ? 'ew-resize' : 'ns-resize' };
      else if (inRect(KZ, p0.x, p0.y) && inPlot(p0) && phase === 'replay') { HUD.drag = { kind: 'seek', cursor: 'pointer' }; rp.seek((rec.t0 ?? 0) + timeAt(p0.x)); }
      else if (inRect(KZ, p0.x, p0.y) && inPlot(p0) && pannable()) HUD.drag = { kind: 'pan', cursor: 'grabbing', mx: p0.x, start: VIEW.start };
      else if (inRect(CZ, p0.x, p0.y)) HUD.drag = { kind: 'dock', cursor: 'move', mx: p0.x, my: p0.y, target: null };
    }
    if (HUD.wheel) { // 휠이 하는 일은 마우스가 있는 곳에 따라 다르다
      const up = HUD.wheel < 0;
      if (onSplit && !HUD.drag) { const grow = (LAY.dock === 'bottom' || LAY.dock === 'right') === up; LAY.size[LAY.dock] = laySize(LAY.dock, LAY.size[LAY.dock] + (grow ? 12 : -12)); saveLay(); relayout(); HUD.splitHold = { x: m.x, y: m.y }; } // 경계선: 구역 크기(굴린 쪽으로 경계선이 간다)
      else if (inL) LOG.scroll += up ? 28 : -28;                                                                                              // 로그: 올려·내려 보기
      else if (inK && CH.plot && CH.scrollMax > 0 && m.y >= CH.lanesTop) CH.scroll += up ? -CH.laneH : CH.laneH;                              // 차트의 줄 칸(줄이 다 들어가지 않을 때): 줄을 올려·내려 보기
      else if (inK && CH.plot) VIEW.zoom(up ? 1 / 1.2 : 1.2, inPlot(m) ? timeAt(m.x) : VIEW.start + VIEW.span / 2, CH.end);                     // 차트(줄이 다 보일 때, 또는 눈금 줄 위): 시간축 확대·축소
      else if (!z && inRect(PZ, m.x, m.y) && !ui) setZoom(LAY.zoom * (up ? 1.1 : 1 / 1.1), m.x, m.y);                                          // 게임 화면: 마우스 자리를 기준으로 확대·축소
      HUD.wheel = 0; }
    // 마우스 모양: 플레이 중에는 조준점만 보이고(none), UI 위에서는 무엇을 할 수 있는지 보인다. 끝난 뒤와 리플레이에서는 보통 화살표
    let cur = phase === 'live' ? 'none' : 'default';
    if (HUD.drag) cur = HUD.drag.cursor; else if (HUD.capture && hit) cur = hit.id.startsWith('mv_') ? 'move' : hit.id === 'vm_bg' ? 'default' : 'pointer'; else if (HUD.capture && inRect(CH.bar, m.x, m.y)) cur = 'pointer';
    else if (HUD.capture && onSplit) cur = SPL.vertical ? 'ew-resize' : 'ns-resize'; else if (HUD.capture && onLogSplit) cur = LSP.vertical ? 'ew-resize' : 'ns-resize';
    else if (HUD.capture && z) cur = inK && inPlot(m) && phase === 'replay' ? 'pointer' : inK && inPlot(m) && pannable() ? 'grab' : 'move'; else if (HUD.capture && onTools) cur = 'default';
    HUD.cursor = cur; const cv = G.ctx.canvas; if (cv.style.cursor !== cur) cv.style.cursor = cur;
  }
  // ---- 시도가 끝난 뒤: 바로 처음으로 돌아가지 않고 결과와 "다시하기 / 리플레이"를 보인다. 연습 과제든 자유 연습이든 같다
  const practice = () => mode === 'intent' && !bot && !demo;
  const OK_WAIT = G.params.get('okwait') !== null ? Math.max(0, +G.params.get('okwait')) : 0.8; // 성공한 뒤 결과 화면이 뜰 때까지 보여 주는 시간. 성공 시각에는 들어가지 않는다
  // 떨어진 까닭: 판정이 실제로 남긴 까닭(미끄러짐·걸리지 않음·허공 …)을 먼저 쓴다. 없으면 본 사실만 적는다 — 까닭을 모르면 조작을 지어내어 가르치지 않는다.
  // (C안은 "누르는 동안 따라오고 떼는 순간 붙는" 조작이라 "버튼을 떼야 잡는다"가 맞다. D안은 클릭으로 보내고 닿으면 잡으므로 그 말을 쓰지 않는다)
  function failReason(e) { // e = { mode, why, air, assist }. 계산만 한다(시험에서 경우별로 확인한다)
    if (e.why && (!e.air || e.why.t >= e.air.t - 0.05)) return e.why.text;
    if (e.air && e.air.gap > 0 && e.air.gap < 1e8) return `손이 잡을 곳에 닿지 못했다 — 가장 가까웠을 때 ${Math.ceil(e.air.gap)}px 모자람`;
    if (e.air && e.air.gap <= 0) return e.mode === 'hold' ? '손이 닿는 거리였지만 잡지 않았다(버튼을 떼야 잡는다)' : `손이 잡을 수 있는 거리까지 갔지만 잡지 못했다${e.mode === 'intent' && e.assist === false ? ' (닿으면 잡기가 꺼져 있었다)' : ''}`;
    return '붙잡은 곳 없이 떨어졌다';
  }
  const failText = () => failReason({ mode, why, air, assist: CTRL.OPT.assist });
  const frameExtra = () => ({ aim: [aim.x, aim.y], g: ghost ? PRACTICE.clone(ghost.S) : null, shape: shapeCopy() }); // shape = 그 순간의 표시 자세(무릎 방향·골반 돌림)
  // 시각 세 가지를 따로 둔다: okT = 성공 조건을 채운 시각(걸린 시간은 이것으로 센다), t = 결과가 확정된 시각(성공 뒤 OK_WAIT초를 더 보여 준 뒤), 리플레이의 끝 = 자취의 끝.
  // 성공은 조건을 채운 순간 정해진다. 그 뒤 보여 주는 동안 떨어져도 성공이다(떨어졌다는 사실은 함께 적는다)
  function endAttempt(kind) { // kind: 'ok' 성공, 'fail' 떨어짐, 'stop' 하다가 리플레이를 열어 멈춤
    if (phase !== 'live') return; trk.finish(S, frameExtra());
    const t0 = rec.t0 ?? 0, okT = lesson() ? lessonOkT : wonT, at = v => `${(v - t0).toFixed(2)}초`;
    ended = { kind, t: S.t, t0, okT: kind === 'ok' ? okT : null, okTime: kind === 'ok' ? okT - t0 : null, tries, more: false, pos: null,
      title: kind === 'ok' ? (lesson() ? '과제 성공' : '목표 도달') : kind === 'fail' ? '매트에 떨어졌습니다' : '멈춤',
      sub: kind === 'ok' ? `성공 시각 ${at(okT)} · ${lesson() ? '이번 과제 ' : ''}시도 ${tries}번째` : `${kind === 'fail' ? '떨어진' : '멈춘'} 시각 ${at(S.t)} · ${lesson() ? '이번 과제 ' : ''}시도 ${tries}번째`,
      reason: kind === 'fail' ? failText() : kind === 'ok' && S.dead ? '성공한 뒤 떨어졌습니다(과제는 성공으로 봅니다)' : null, hint: kind === 'fail' ? hint() : null };
    if (kind === 'ok') { logAdd(`성공 — ${at(okT)}`, 'ok', okT); if (ended.reason) logAdd(ended.reason, 'warn'); } else if (kind === 'fail') { logAdd(`떨어짐 — ${ended.reason}`, 'fail'); if (ended.hint) logAdd(ended.hint, 'hint'); } // 결과와 "바꿀 것"도 로그에 남는다
    phase = 'ended';
  }
  function openReplay() { // 내가 한 플레이를 적어 둔 자취 그대로 다시 본다(다시 계산하지 않는다). 연속으로 적힌 데까지만 재생한다
    if (!practice() || trk.frames.length < 2) return; if (phase === 'live') endAttempt('stop');
    rpLive = { S, aim: [aim.x, aim.y], gS: ghost ? ghost.S : null, shape: shapeCopy() }; rp = PRACTICE.clock(rec.t0 ?? trk.t0(), trk.end()); rp.playing = true; phase = 'replay'; VIEW.manual = false; VIEW.start = 0;
  }
  function closeReplay() { if (phase !== 'replay') return; S = rpLive.S; aim.x = rpLive.aim[0]; aim.y = rpLive.aim[1]; if (ghost) ghost.S = rpLive.gS; shapeSet(rpLive.shape); rp = null; rpLive = null; phase = 'ended'; } // 실제로 끝난 순간의 몸으로 돌아온다(자취가 아니라 따로 들고 있던 것)
  const RP_STEP = 0.05; // 한 번 넘기는 시간(키와 단추가 같다). 계산 한 걸음(1/120초)이나 화면 한 장이 아니다
  function replayUpdate(dt, inp) {
    if (BIND.pressedIn('rpPlay', inp, 'replay')) rp.toggle();
    if (BIND.pressedIn('rpSpeed', inp, 'replay')) rp.cycleSpeed();
    for (const [id, d] of [['rpBack', -1], ['rpFwd', 1]]) { if (BIND.pressedIn(id, inp, 'replay')) { rp.nudge(d * RP_STEP); rpHold = 0; } else if (BIND.downIn(id, inp, 'replay')) { rpHold += dt; if (rpHold > 0.25) rp.nudge(d * dt); } } // 누르고 있으면 실제 빠르기로 계속
    rp.update(dt); const f = trk.at(rp.t); S = f.s; if (f.aim) { aim.x = f.aim[0]; aim.y = f.aim[1]; } if (ghost) ghost.S = f.g || rpLive.gS; shapeSet(f.shape); // 그 장의 표시 자세
  }
  function doClick(id) { // 화면의 단추를 눌렀을 때
    if (id === 'retry') { reset(); return true; }
    if (id === 'replay') { phase === 'replay' ? closeReplay() : openReplay(); return true; }
    if (id === 'next') { setLesson(lessonI + 1 >= LESSON.LIST.length ? -1 : lessonI + 1); return true; }
    if (id === 'more' && ended) { ended.more = !ended.more; ended.pos = null; }
    if (id === 'rp_play' && rp) rp.toggle(); if (id === 'rp_back' && rp) rp.nudge(-RP_STEP); if (id === 'rp_fwd' && rp) rp.nudge(RP_STEP); if (id === 'rp_speed' && rp) rp.cycleSpeed();
    if (id.startsWith('log@') && rp) { const t = +id.split('@')[2], abs = (rec.t0 ?? 0) + t; if (Number.isFinite(t) && abs >= trk.t0() - 1e-6 && abs <= trk.end() + 1e-6) { rp.playing = false; rp.seek(abs); } } // 기록 밖이면 옮기지 않는다
    if (id === 'view_menu') VM.open = !VM.open; if (id === 'vm_close') VM.open = false; if (id === 'vm_resetpos') { LAY.pos = {}; saveLay(); if (ended) ended.pos = null; }
    if (id.startsWith('vm_')) { const it = VIEW_ITEMS.find(q => 'vm_' + q.id === id); if (it) it.set(!it.get()); }
    if (id === 'log_off') setLog(false); if (id === 'log_on') setLog(true); if (id === 'log_clear') { LOG.items = []; LOG.scroll = 0; LOG.unseen = 0; LOG.total = undefined; } if (id === 'log_new') { LOG.scroll = 0; LOG.unseen = 0; } if (id === 'help_more') { LAY.show.helpMore = !LAY.show.helpMore; saveLay(); } if (id === 'log_stats') showLog = !showLog; if (id === 'view_fit') setZoom(1);
    if (id === 'tl_mode') setChart(!LAY.chart); if (id === 'tl_dock') setDock(DOCKS[(DOCKS.indexOf(LAY.dock) + 1) % DOCKS.length]);
    if (id === 'tl_fit') VIEW.fit(CH.end); if (id === 'tl_in') VIEW.zoom(1 / 1.3, VIEW.start + VIEW.span / 2, CH.end); if (id === 'tl_out') VIEW.zoom(1.3, VIEW.start + VIEW.span / 2, CH.end);
    return false;
  }
  // 결과 카드: 큰 창으로 장면을 덮지 않는다. 마지막 자세·과제 목표·과제 카드·차트를 가리지 않는 빈 자리를 찾아 작게 놓고, 그런 자리가 없으면 차트 바로 위에 둔다
  const LC = { rect: null };
  function placeCard(w, h) {
    const box = (x0, y0, x1, y1) => ({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }), avoid = [], k = VW.s, around = (pts, l, t, r, b) => { const q = pts.map(p => toScreen(p[0], p[1])), xs = q.map(p => p[0]), ys = q.map(p => p[1]); return box(Math.min(...xs) - l * k, Math.min(...ys) - t * k, Math.max(...xs) + r * k, Math.max(...ys) + b * k); };
    avoid.push(around(S.p.map(q => [q.x, q.y]), 26, 30, 26, 22));
    const mk = lesson() && lesson().mark, mp = mk && world.find(p => p.id === mk[0]); if (mp) avoid.push(around(mp.pts, 60, 34, 60, 12));
    if (ghost && ghost.S) avoid.push(around(ghost.S.p.map(q => [q.x, q.y]), 16, 24, 16, 14)); // 시범 유령의 마지막 자세도 가리지 않는다
    if (LC.rect) avoid.push(LC.rect); if (HELP.rect) avoid.push(HELP.rect); if (GD.rect) avoid.push(GD.rect); if (CH.tools) avoid.push(CH.tools);
    avoid.push(box(HV.x0 + (HELP.rtx - 230) * HV.s, HV.y0 + 8 * HV.s, HV.x0 + HELP.rtx * HV.s, HV.y0 + 60 * HV.s)); // 오른쪽 위의 글(시작 자세·시도 수)
    const over = (x, y) => avoid.reduce((a, q) => a + Math.max(0, Math.min(x + w, q.x + q.w) - Math.max(x, q.x)) * Math.max(0, Math.min(y + h, q.y + q.h) - Math.max(y, q.y)), 0);
    const bx = avoid[0].x + avoid[0].w / 2, by = avoid[0].y + avoid[0].h / 2; let best = null;
    for (let y = PZ.y + 8; y <= PZ.y + PZ.h - 8 - h; y += 14) for (let x = PZ.x + 8; x <= PZ.x + PZ.w - w - 8; x += 14) { const o = over(x, y), d = Math.hypot(x + w / 2 - bx, y + h / 2 - by), sc = o * 1000 + d; if (!best || sc < best.sc) best = { x, y, o, sc }; }
    if (best) return { x: best.x, y: best.y, free: best.o === 0 }; // 빈 자리가 없으면 가장 덜 가리는 자리
    return { x: PZ.x + 8, y: Math.max(PZ.y + 4, PZ.y + PZ.h - h - 8), free: false };
  }
  function drawResult() {
    if (phase !== 'ended' || !ended) return; const c = G.ctx, col = ended.kind === 'ok' ? '#7dff9a' : ended.kind === 'fail' ? '#ff9c8a' : INK;
    if (!LAY.show.result) { ended.rect = null; // 결과 카드를 껐을 때: 끝났다는 것과 다음에 누를 키만 한 줄로
      G.text(`${ended.title} · ${BIND.first('reset')} 다시하기 · ${BIND.first('replay')} 리플레이`, PZ.x + PZ.w / 2, PZ.y + PZ.h - 30, { size: 11, weight: 800, align: 'center', color: '#1d1d1d', stroke: 'rgba(255,255,255,0.8)', strokeW: 3 }); return; }
    const btns = [['retry', 'reset', '다시하기', true], ['replay', 'replay', '리플레이', false]].concat(lesson() ? [['next', 'lessonNext', lessonI === LESSON.LIST.length - 1 ? '자유 연습' : '다음 과제', false]] : []);
    const w = Math.max(250, btns.reduce((a, q) => a + G.textW(q[2], 11.5, 800) + keyW(firstCode(q[1]), 20) + 18 + 6, 18)), tw = w - 24; // 너비는 단추 줄에 맞춘다
    const lines = [{ t: ended.sub, c: INK }].concat(ended.reason ? wrap(ended.reason, tw, 10.5, 700).map(t => ({ t, c: '#ffd9a0' })) : []).concat(ended.more && ended.hint ? wrap(ended.hint, tw, 10, 600).map(t => ({ t, c: DIM })) : []);
    const h = 30 + lines.length * 15 + (ended.hint ? 18 : 4) + 36; const sig = `${h}|${PZ.x}|${PZ.y}|${PZ.w}|${PZ.h}|${GD.rect ? GD.rect.x : ''}`; if (!LAY.pos.result && (!ended.pos || ended.pos.sig !== sig)) ended.pos = { ...placeCard(w, h), h, sig }; const [x, y] = LAY.pos.result ? panelAt('result', w, h, 0, 0) : [ended.pos.x, ended.pos.y]; // 옮긴 적이 없으면 빈 자리를 찾는다(구역을 옮기거나 크기를 바꾸면 다시)
    ended.rect = { x, y, w, h }; c.beginPath(); G.roundRect(x, y, w, h, 10); c.fillStyle = 'rgba(28,35,29,0.96)'; c.fill(); c.strokeStyle = '#636a4b'; c.lineWidth = 1.5; c.stroke(); c.fillStyle = col; c.beginPath(); G.roundRect(x, y + 10, 3, 18, 2); c.fill();
    G.text(ended.title, x + 12, y + 24, { size: 15, weight: 900, color: col }); let yy = y + 30; for (const q of lines) { G.text(q.t, x + 12, yy + 11, { size: 10.5, weight: 700, color: q.c }); yy += 15; }
    if (ended.hint) { const t = ended.more ? '접기' : '자세히', bw = G.textW(t, 9.5, 800) + 14; hudBtn('more', x + 12, yy + 2, bw, 14, t, { size: 9.5 }); yy += 18; } else yy += 4;
    let bx = x + 12; for (const [id, act, text, primary] of btns) { const kc = firstCode(act), kw = keyW(kc, 20), off = id === 'replay' && trk.frames.length < 2, bw = G.textW(text, 11.5, 800) + kw + 18; hudBtn(id, bx, yy + 4, bw, 26, null, { primary, off });
      G.text(text, bx + 7, yy + 21, { size: 11.5, weight: 800, color: primary ? '#1c231d' : off ? DIM : INK }); drawKey(kc, bx + bw - kw - 5, yy + 7, 20, { where: 'result', action: act, disabled: off, down: false }); bx += bw + 6; }
    icon(c, 'grip', x + w - 12, y + 13, 3.6, HUD.hot === 'mv_result' || (HUD.drag && HUD.drag.id === 'result') ? INK : 'rgba(243,236,214,0.35)'); HUD.hits.push({ id: 'mv_result', x, y, w, h }); // 단추가 아닌 곳을 잡고 끌면 옮겨진다(단추가 먼저 눌린다)
  }
  // ---- 보기 설정(v0.14.0, 사용자 요청): 연습을 돕는 표시들을 체크박스로 켜고 끈다(단축키를 몰라도 되게). 단축키가 있는 것은 옆에 키캡을 보인다. 켬·끔은 저장된다
  const VM = { open: false, rect: null };
  const showSet = k => v => { LAY.show[k] = v; saveLay(); };
  const VIEW_ITEMS = [
    { id: 'chart', name: () => ACT.name.chart, get: () => LAY.chart, set: v => setChart(v), act: 'chart' },
    { id: 'log', name: () => ACT.name.log, get: () => LAY.log, set: v => setLog(v), act: 'log' },
    { id: 'guide', name: () => ACT.name.guide, get: () => LAY.guide, set: v => { LAY.guide = v; saveLay(); }, act: 'guide' },
    { id: 'help', name: () => '조작 설명', get: () => LAY.show.help, set: showSet('help') },
    { id: 'lesson', name: () => '과제 카드', get: () => LAY.show.lesson, set: showSet('lesson') },
    { id: 'result', name: () => '결과 카드', get: () => LAY.show.result, set: showSet('result') },
    { id: 'status', name: () => '상태 알림', get: () => LAY.show.status, set: showSet('status') },
    { id: 'recent', name: () => '누른 키 표시', get: () => LAY.show.recent, set: showSet('recent') },
    { id: 'cursorLong', name: () => '커서 옆 긴 설명', get: () => LAY.show.cursorLong, set: showSet('cursorLong') }, // 끄면(기본) 커서 옆에는 입력 이름만(손발 위 표시와 같은 것), 켜면 "좌클릭 → 왼손 보내기"처럼 길게
    { id: 'ghost', name: () => ACT.name.ghost, get: () => ghostOn, set: v => { ghostOn = v; if (!v) ghost = null; }, act: 'ghost' },
    { id: 'stats', name: () => '플레이 통계', get: () => showLog, set: v => { showLog = v; } },
  ];
  function drawViewMenu() { // 작게: 두 줄 나란히, 작은 글씨. 설정일 뿐이라 크게 볼 것이 아니다(사용자 의견). 보기 설정 키를 다시 누르면 닫힌다
    VM.rect = null; if (!VM.open) return; const c = G.ctx, rowH = 15, colW = 112, n = Math.ceil(VIEW_ITEMS.length / 2), w = colW * 2 + 12, h = 17 + n * rowH + 22, x = Math.max(4, Math.min(W - w - 4, PZ.x + PZ.w - w - 8)), y = Math.max(4, Math.min(H - h - 4, PZ.y + PZ.h - 26 - h));
    VM.rect = { x, y, w, h }; c.beginPath(); G.roundRect(x, y, w, h, 7); c.fillStyle = 'rgba(22,28,23,0.96)'; c.fill(); c.strokeStyle = '#8b9370'; c.lineWidth = 1; c.stroke();
    G.text(ACT.name.viewMenu, x + 8, y + 12, { size: 9.5, weight: 900, color: INK }); { const kc = firstCode('viewMenu'), kw = keyW(kc, 11); drawKey(kc, x + 12 + G.textW(ACT.name.viewMenu, 9.5, 900), y + 3, 11, { where: 'menu', action: 'viewMenu', down: false }); G.text('다시 누르면 닫힘', x + 16 + G.textW(ACT.name.viewMenu, 9.5, 900) + kw, y + 12, { size: 8, weight: 600, color: DIM }); }
    hudBtn('vm_close', x + w - 17, y + 3, 13, 12, null); icon(c, 'close', x + w - 10.5, y + 9, 2.8, INK);
    VIEW_ITEMS.forEach((it, k) => { const col = k < n ? 0 : 1, rx = x + 6 + col * colW, ry = y + 17 + (col ? k - n : k) * rowH, id = 'vm_' + it.id, on = !!it.get(), hot = HUD.hot === id;
      if (hot) { c.fillStyle = 'rgba(243,236,214,0.1)'; c.fillRect(rx - 2, ry, colW - 2, rowH); }
      c.beginPath(); G.roundRect(rx + 2, ry + 3, 9, 9, 2); c.fillStyle = on ? INK : 'rgba(243,236,214,0.08)'; c.fill(); c.strokeStyle = on ? INK : 'rgba(243,236,214,0.5)'; c.lineWidth = 1; c.stroke();
      if (on) { c.strokeStyle = '#1c231d'; c.lineWidth = 1.6; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); c.moveTo(rx + 4, ry + 7.6); c.lineTo(rx + 5.9, ry + 9.6); c.lineTo(rx + 9.2, ry + 5.2); c.stroke(); }
      G.text(it.name(), rx + 15, ry + 11, { size: 9, weight: 700, color: on ? INK : DIM });
      if (it.act) { const kc = firstCode(it.act), kw = keyW(kc, 11); drawKey(kc, rx + colW - 8 - kw, ry + 2, 11, { where: 'menu', action: it.act, down: false }); }
      HUD.hits.push({ id, x: rx - 2, y: ry, w: colW - 2, h: rowH }); });
    const fy = y + h - 18, t1 = '카드 자리 처음으로', w1 = G.textW(t1, 8.5, 800) + 10, t2 = ACT.name.viewFit, w2 = G.textW(t2, 8.5, 800) + 10;
    hudBtn('vm_resetpos', x + 6, fy, w1, 14, t1, { size: 8.5, off: !Object.keys(LAY.pos).length }); hudBtn('view_fit', x + 10 + w1, fy, w2, 14, t2, { size: 8.5, off: Math.abs(LAY.zoom - 1) < 1e-6 });
    HUD.hits.push({ id: 'vm_bg', x, y, w, h }); // 창의 빈 곳을 눌러도 게임 입력이 되지 않게
  }
  // ---- 조작 설명 카드(v0.15.0, 사용자 의견 "시야를 너무 가린다"): 화면 위를 덮던 넓은 흰 칸을 없애고, 과제 카드와 같은 모양·같은 자리(플레이 구역 오른쪽)의 좁은 카드로 바꿨다.
  // 자유 연습에서 하는 중에만 나온다(과제 중에는 그 자리에 과제 카드). 위쪽 띠를 잡고 끌어 옮기고, 보기 설정에서 끈다. 실험실의 임시 안내다(본 게임에는 튜토리얼·설정 화면이 대신한다)
  function drawHelpCard() {
    HELP.rect = null; if (lesson() || phase !== 'live' || !LAY.show.help) return; const c = G.ctx, w = 236, xd = PZ.x + PZ.w - w - 8, yd = cardY(), B = BIND.label, B1 = BIND.first, O = CTRL.OPT, onoff = v => v ? '켬' : '끔', hm = O.handMode;
    const items = [
      ['손', hm === 1 ? `${B('sendL')} = 왼손, ${B('sendR')} = 오른손 보내기. 겨눈 곳에 닿으면 잡는다` : `${B('sendBest')} = 추천 손, ${B('sendOther')} = 다른 손 보내기. 겨눈 곳에 닿으면 잡는다`],
      ['발', `${B('foot')} 누른 채 손 입력`],
      ['조준', `마우스 또는 ${B1('aimUp')}${B1('aimLeft')}${B1('aimDown')}${B1('aimRight')}`],
      ['몸', `${B1('moveUp')}${B1('moveLeft')}${B1('moveDown')}${B1('moveRight')} 누른 채(붙은 팔다리로 몸을 옮긴다)`],
      ['점프', `${B('power')} 누르고 있기 = 모으기, 떼면 뛴다`],
      ['모으는 중', `${B1('moveLeft')}·${B1('moveRight')} = 좌우 싣기 / 떼면서 ${B1('moveUp')} = 팔로도 당김 / 손 입력 = 놓을 손 / ${B('cancel')} = 취소`],
      ['보조', `손 선택 ${hm}번(${B1('handMode')}) / 잡기 범위 ${O.assistRange === 'near' ? '커서 근처' : '턱 전체'}(${B1('assistRange')}) / 자동 발 ${onoff(O.autoFeet)}(${B1('autoFeet')}) / 체중 이동 ${onoff(O.autoShift)}(${B1('autoShift')}) / 자동 싣기 ${C.JOINT ? onoff(O.autoLoad) : '켬'}(${B1('autoLoad')}) / 닿으면 잡기 ${onoff(O.assist)}(${B1('assist')})`],
      ['그 밖', `${B1('demo')} 시범 / ${B1('lessonNext')} 연습 과제 / ${B1('reset')} 다시 / ${B1('st1')}~${B1('st5')} 시작 자세 / ${B1('viewMenu')} 보기 설정 / ${B('settings')} 키 설정`],
      ['실험실', `${B1('scheme')} 조작 방식 / ${B1('slow')} 느리게 / ${B1('couple')} 도약 연결 / ${B1('layout')} 연습 배치 / ${B1('phys')} 물리 ${v05 ? 'v0.6' : 'v0.4'} / ${B1('body')} 몸 비율`],
    ];
    const more = LAY.show.helpMore, shown = more ? items : items.slice(0, 5); // 기본은 핵심 다섯 줄(손·발·조준·몸·점프). 나머지는 [자세히](GPT 화면 지침 7: 긴 설명을 한 번에 펼쳐 두지 않는다)
    const lw = 46, rows = []; for (const [lab, t] of shown) wrap(t, w - 22 - lw, 9, 600).forEach((ln, k) => rows.push({ lab: k ? '' : lab, ln, gap: k ? 0 : 3 }));
    const h = 28 + rows.reduce((a, r) => a + 11.5 + r.gap, 0) + 8, [x, y] = panelAt('help', w, h, xd, yd);
    HELP.rect = { x, y, w, h, moved: !!LAY.pos.help }; c.save(); c.globalAlpha = 0.93; glass(c, x, y, w, h); c.restore(); { const t = more ? '접기' : '자세히', bw = G.textW(t, 8.5, 800) + 10; hudBtn('help_more', x + w - 26 - bw, y + 5, bw, 14, t, { size: 8.5 }); } HUD.hits.push({ id: 'mv_help', x, y, w, h: 24 }); icon(c, 'grip', x + w - 12, y + 12, 3.6, HUD.hot === 'mv_help' || (HUD.drag && HUD.drag.id === 'help') ? INK : 'rgba(255,255,255,0.35)');
    c.fillStyle = '#9fd0ff'; c.beginPath(); G.roundRect(x, y + 9, 3, 14, 2); c.fill(); G.text('조작 설명', x + 12, y + 19, { size: 12, weight: 800, color: '#fff' }); G.text(CTRL.MODES[mode].split(' (')[0], x + 12 + G.textW('조작 설명', 12, 800) + 8, y + 19, { size: 8.5, weight: 600, color: 'rgba(255,255,255,0.55)' });
    let yy = y + 26; for (const r of rows) { yy += r.gap; if (r.lab) G.text(r.lab, x + 12, yy + 9, { size: 9, weight: 800, color: 'rgba(255,214,102,0.9)' }); G.text(r.ln, x + 12 + lw, yy + 9, { size: 9, weight: 600, color: 'rgba(255,255,255,0.86)' }); yy += 11.5; }
  }
  // ---- 키 안내(조작 D안): 플레이 구역의 왼쪽에 반투명하게 세로로 둔다("보고 싶으면 보는" 안내). 차트 구역이 왼쪽에 붙어 있으면 오른쪽으로 간다. 키 안내 동작(BIND guide)으로 가린다.
  // 키캡 = 지금 설정된 입력(실제로 누르고 있는 칸 우선), 옆 = 동작 이름과 그 손발의 상태. 손 선택 2번에서는 지금 추천된 손의 색을 쓴다
  const GD = { rect: null }, HELP = { body: [], h: 112, rtx: W - 12, rect: null };
  function drawGuide(helpShown) {
    GD.rect = null; const c = G.ctx;
    if (!LAY.guide) { const right = !!CZ && LAY.dock === 'left' && !LC.rect; c.globalAlpha = 0.5; G.text(`${BIND.first('guide')} ${ACT.name.guide}`, right ? PZ.x + PZ.w - 8 : PZ.x + 8, PZ.y + 14, { size: 8.5, weight: 700, align: right ? 'right' : 'left', color: '#1d1d1d', stroke: 'rgba(255,255,255,0.7)', strokeW: 2.5 }); c.globalAlpha = 1; return; } // 가렸을 때는 다시 켜는 키만 작게
    const st = ctrl.st, hm = CTRL.OPT.handMode, h = 26, gap = 3;
    const stateOf = i => { const m = S.limb[i].mode; return m === 'reach' ? (i >= 2 && !st.manual[i] ? '자동' : '움직이는 중') : m === 'free' ? '힘 빠짐' : '붙음'; };
    const chips = [], footDown = BIND.down('foot', G.input), past = phase === 'replay';
    for (let k = 0; k < 4; k++) {
      const foot = k >= 2, flip = k % 2; let i, id, name;
      if (hm === 1) { i = k; id = flip ? 'sendR' : 'sendL'; name = ACT.LIMB[i].name; }
      else { const r = st.rec ? (foot ? st.rec.foot : st.rec.hand) % 2 : 0; i = (foot ? 2 : 0) + (flip ? 1 - r : r); id = flip ? 'sendOther' : 'sendBest'; name = `${flip ? '다른' : '추천'} ${foot ? '발' : '손'}: ${ACT.LIMB[i].name}`; }
      chips.push({ codes: foot ? [usedCode('foot'), usedCode(id, 'foot+' + id)] : [usedCode(id)], role: ACT.LIMB[i].role, name, sub: stateOf(i), on: S.limb[i].mode === 'reach', action: foot ? 'foot+' + id : id, down: foot ? undefined : BIND.down(id, G.input) && !footDown, forceDown: past ? false : undefined });
    }
    chips.push({ codes: [usedCode('power')], role: 'power', name: ACT.HOLD.power.name, sub: st.phase === 'charge' ? '모으는 중' : st.phase === 'throw' ? '던지는 중' : '떼면 던지기', on: !!last.power, action: 'power', down: BIND.down('power', G.input), forceDown: past ? false : undefined });
    const kwMax = Math.max(...chips.map(ch => keysW(ch.codes, h))), w = 5 + kwMax + 5 + Math.max(...chips.map(ch => Math.max(G.textW(ch.name, 10.5, 800), G.textW(ch.sub, 8.5, 600)))) + 8, total = chips.length * (h + gap) - gap + 13;
    // 자리: 게임 화면 위에 남는 띠가 넉넉하면 그 띠에(게임 화면을 가리지 않는다), 아니면 조작 설명 칸 아래에. 오른쪽으로 갈 때는 과제 카드를 피한다
    const right = !!CZ && LAY.dock === 'left', band = HV.y0 - PZ.y >= total + 10, card = LC.rect || HELP.rect, xd = right ? (band && card ? card.x - w - 8 : PZ.x + PZ.w - w - 8) : PZ.x + 8;
    const y0 = band ? PZ.y + 6 : right ? (card ? card.y + card.h + 6 : HV.y0 + 64 * HV.s) : helpShown ? HV.y0 + HELP.h * HV.s + 4 : PZ.y + 8, yd = Math.max(PZ.y + 4, Math.min(PZ.y + PZ.h - total - 8, y0));
    const [x, y] = panelAt('guide', w, total, xd, yd); // 머리의 글 줄을 잡고 끌면 옮겨진다
    const alpha = past ? 0.35 : 0.62, grab = HUD.hot === 'mv_guide' || (HUD.drag && HUD.drag.id === 'guide'); GD.rect = { x, y, w, h: total, right, alpha, moved: !!LAY.pos.guide }; c.save(); c.globalAlpha = grab ? 1 : alpha;
    if (grab) { c.fillStyle = 'rgba(28,35,29,0.85)'; c.beginPath(); G.roundRect(x, y - 1, w, 12, 4); c.fill(); } icon(c, 'grip', x + 5, y + 5, 3.2, grab ? INK : '#1d1d1d'); HUD.hits.push({ id: 'mv_guide', x, y: y - 1, w, h: 12 });
    G.text(`${ACT.name.guide} · ${BIND.first('guide')} 가리기`, x + 12, y + 8, { size: 8.5, weight: 700, color: grab ? INK : '#1d1d1d', stroke: grab ? null : 'rgba(255,255,255,0.7)', strokeW: 2.5 }); c.globalAlpha = alpha;
    chips.forEach((ch, k) => { const yy = y + 13 + k * (h + gap), col = ROLE[ch.role];
      c.beginPath(); G.roundRect(x, yy, w, h, 7); c.fillStyle = 'rgba(28,35,29,0.9)'; c.fill(); c.strokeStyle = ch.on ? col : 'rgba(99,106,75,0.9)'; c.lineWidth = ch.on ? 2 : 1; c.stroke();
      drawKeys(ch.codes, x + 5 + (kwMax - keysW(ch.codes, h)), yy, h, { role: ch.role, where: 'bar', action: ch.action, down: ch.down, forceDown: ch.forceDown });
      G.text(ch.name, x + 5 + kwMax + 5, yy + 11.5, { size: 10.5, weight: 800, color: INK }); G.text(ch.sub, x + 5 + kwMax + 5, yy + 22, { size: 8.5, weight: 600, color: ch.on ? col : DIM }); });
    c.restore();
  }
  const cardY = () => HV.y0 - PZ.y >= 100 ? PZ.y + 8 : HV.y0 + 64 * HV.s; // 과제 카드의 위쪽 자리: 게임 화면 위에 띠가 남으면 그 띠부터, 아니면 오른쪽 위 글 아래
  function drawLessonCard() {
    const l = lesson(); if (!l || !LAY.show.lesson) return; const w = 226, xd = PZ.x + PZ.w - w - 8, yd = cardY(), c = G.ctx, last = lessonI === LESSON.LIST.length - 1;
    const st = demo ? { t: '시범 재생 중 · 적어 둔 입력을 그대로 넣는 것(사람 손 아님)', c: '#7fd4ff' }
      : lessonOkT !== null ? { t: `성공! · ${BIND.first('reset')} 다시 · ${BIND.first('lessonNext')} ${last ? '자유 연습으로' : '다음 과제'}`, c: '#7dff9a' }
      : { t: `${demoMsgT > 0 ? '직접 해 보세요 · ' : ''}${BIND.first('demo')} 시범 · ${BIND.first('reset')} 다시 · ${BIND.first('lessonNext')} ${last ? '자유 연습(조작 설명)' : '다음'} · ${BIND.first('ghost')} 유령 ${ghostOn ? '켬' : '끔'} · ${BIND.first('settings')} 키 설정`, c: 'rgba(255,255,255,0.8)' };
    // 설정 안내: 들어올 때 맞춘 것, 지금 시범 기준과 다른 것, 잠근 것
    const O = CTRL.OPT, diff = LESSON.TUNED.filter(k => O[k] !== LESSON.BASE.opt[k]).map(k => `${OPT_NAME[k][0]} ${OPT_NAME[k][1](O[k])}`), info = [];
    if (lessonNote.length) info.push(`시범 기준에 맞춘 설정: ${lessonNote.join(', ')} (과제를 나가면 되돌림)`);
    if (diff.length) info.push(`내 설정이 시범 기준과 다름: ${diff.join(', ')} → 같은 입력이라도 결과가 다를 수 있다. 시범·유령은 기준 설정으로 움직인다`);
    if (O.handMode === 2) info.push('손 선택 2번: 요령의 좌클릭·우클릭은 왼손·오른손 보내기를 뜻한다(추천 손 입력으로 그 손을 보낸다)');
    if (lockT > 0) info.push(`과제 중에는 몸·물리·벽·조작 방식·도약 연결을 바꿀 수 없다. ${BIND.first('lessonNext')}로 자유 연습에 나가서 바꾼다`);
    const foot = wrap(st.t, w - 24, 9.5, 700), build = (tips, notes) => { const rows = [{ t: `연습 ${lessonI + 1}/${LESSON.LIST.length}`, s: 9, wt: 800, c: 'rgba(255,214,102,0.9)' }];
      for (const ln of wrap(l.name, w - 24, 13, 800)) rows.push({ t: ln, s: 13, wt: 800, c: '#fff' });
      for (const ln of wrap(l.goal, w - 24, 10)) rows.push({ t: ln, s: 10, wt: 600, c: 'rgba(255,255,255,0.88)' });
      if (tips) for (const tip of l.tips) wrap(tip, w - 34, 9.5, 500).forEach((ln, k) => rows.push({ t: ln, s: 9.5, wt: 500, c: 'rgba(255,255,255,0.62)', dot: k === 0, in: 10 }));
      if (notes) for (const t of info) wrap(t, w - 24, 9, 600).forEach(ln => rows.push({ t: ln, s: 9, wt: 600, c: '#ffd9a0' }));
      return { rows, h: 10 + rows.reduce((a, r) => a + r.s + 4, 0) + 10 + foot.length * 13 + 6 }; };
    // 플레이 구역에 다 들어가지 않으면 요령부터, 그다음 설정 안내를 접는다(차트 구역이 클 때)
    const room = LAY.pos.lesson ? PZ.h - 8 : PZ.y + PZ.h - 8 - yd, pick = [build(true, true), build(false, true), build(false, false)], { rows, h } = pick.find(q => q.h <= room) || pick[2], [x, y] = panelAt('lesson', w, h, xd, yd);
    LC.rect = { x, y, w, h, moved: !!LAY.pos.lesson }; glass(c, x, y, w, h); HUD.hits.push({ id: 'mv_lesson', x, y, w, h: 24 }); icon(c, 'grip', x + w - 12, y + 12, 3.6, HUD.hot === 'mv_lesson' || (HUD.drag && HUD.drag.id === 'lesson') ? INK : 'rgba(255,255,255,0.35)'); c.fillStyle = '#ffd166'; c.beginPath(); G.roundRect(x, y + 12, 3, 30, 2); c.fill(); // 위쪽 띠(grip 표시)를 잡고 끌면 옮겨진다
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
      for (const i of [2, 3, 0, 1]) { const e = s.p[2 + i], j = limbJoint(s, i, bendTurn(s, i)); g.beginPath(); g.moveTo(R[i].x, R[i].y); g.lineTo(j.x, j.y); g.lineTo(e.x, e.y); g.lineWidth = (i < 2 ? 7 : 9) + ex; g.stroke(); } // 유령도 같은 규칙(무릎은 벽 쪽으로)
      g.beginPath(); g.moveTo(R[0].x, R[0].y); g.lineTo(R[1].x, R[1].y); g.lineTo(R[3].x, R[3].y); g.lineTo(R[2].x, R[2].y); g.closePath(); g.lineWidth = 12 + ex; g.fill(); g.stroke();
      g.beginPath(); g.arc(ch.x + ux * 22, ch.y + uy * 22, 10 + ex / 2, 0, Math.PI * 2); g.fill(); }
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 0.42; c.drawImage(ghostLayer, 0, 0); c.restore();
    atLabel(ch.x + ux * 42, ch.y + uy * 42, () => G.text('시범', ch.x + ux * 42, ch.y + uy * 42 + 3, { size: 9, weight: 800, align: 'center', color: '#2f6fa8', stroke: 'rgba(255,255,255,0.75)', strokeW: 3 }));
  }
  // 왼쪽 아래 상태 칸: 모으기 세기, 놓을 손·이동 중인 손, 체중 이동, 몸통이 막힌 이유, 최근 경고를 한곳에 모은다(캐릭터 주변에 글이 겹치지 않게)
  const footFarText = f => `${LIMB[f.i]}: 겨눈 자리에 닿지 않는다 — ${f.why === 'len' ? '다리 길이보다 멀다. 몸을 그쪽으로 옮긴 뒤 디딘다' : '그 높이까지 다리를 들 수 없다. 몸을 더 올린 뒤(몸 위로) 디딘다'}`;
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
    if (st.footFar && S.t - st.footFar.t < 0.4) rows.push({ t: footFarText(st.footFar), c: '#ff8a8a' });
    if (st.phase === 'charge' && (st.sway || st.swayKey)) rows.push({ t: `몸 싣기 ${st.sway < 0 ? '← 왼쪽' : st.sway > 0 ? '오른쪽 →' : ''} ${Math.round(Math.abs(st.sway))}px / ${CTRL.P.SWAY_MAX} (${BIND.first('moveLeft')}·${BIND.first('moveRight')})`, c: '#ffd166' });
    if (st.move && st.move.blocked) rows.push({ t: st.move.blocked === '손 각도' ? `몸통: 더 못 감 — ${st.move.hand !== null && st.move.hand !== undefined ? LIMB[st.move.hand] : '손'}이 미끄러질 각도. 그 손을 옮기거나 놓으면 갈 수 있다` : `몸통: 더 못 감 — ${st.move.blocked} 길이 한계`, c: '#ff8a8a' });
    const warns = fx.filter(f => f.kind === 'text').slice(-3);
    for (const f of warns) rows.push({ t: f.n > 1 ? `${f.text}  ×${f.n}` : f.text, c: '#ff8a8a', a: Math.min(1, f.t * 2) });
    STR.list = rows.map(r => r.t); if (!rows.length && !meter) return;
    const lh = 18, w = Math.max(250, ...rows.map(r => G.textW(r.t, 12, 700) + 16)), h = rows.length * lh + (meter ? 30 : 0) + 8, x = PZ.x + 10, y = PZ.y + PZ.h - 8 - h;
    G.panel(x, y, w, h, 'rgba(10,12,16,0.82)');
    let yy = y + 6;
    if (meter) { const c = G.ctx; G.text(meter.text, x + 8, yy + 11, { size: 12, weight: 800, color: '#ffd166' }); c.fillStyle = '#ffd166'; c.fillRect(x + 8, yy + 16, 150 * meter.pw, 6); c.fillStyle = '#7dffb0'; c.fillRect(x + 8, yy + 24, 150 * meter.act, 3);
      G.text('힘 · 근육', x + 164, yy + 25, { size: 10, weight: 600, color: 'rgba(255,255,255,0.6)' }); yy += 30; }
    for (const r of rows) { G.ctx.globalAlpha = r.a ?? 1; G.text(r.t, x + 8, yy + 13, { size: 12, weight: 700, color: r.c }); G.ctx.globalAlpha = 1; yy += lh; }
  }
  function drawLog() {
    const l = plog, avg = l.lag.length ? l.lag.reduce((a, b) => a + b, 0) / l.lag.length : 0, mx = l.lag.length ? Math.max(...l.lag) : 0, slowN = l.lag.filter(x => x > 0.15).length;
    const rows = ['플레이 기록 (새로고침하면 지워짐)', `손발 입력 ${l.sends}회`, `손 선택 헷갈림 추정 ${l.confuse}회 (0.8초 안에 다른 손으로 바꾸거나 취소)`, `미끄러져 놓침 ${l.slips}회`, `손을 보낸 뒤 1.5초 안에 떨어짐 ${l.fallAfterSend}회`,
      `입력 → 손이 떨어지기까지 평균 ${(avg * 1000).toFixed(0)}ms · 최대 ${(mx * 1000).toFixed(0)}ms · 0.15초 넘음 ${slowN}회`];
    const lx = Math.max(PZ.x + 4, PZ.x + PZ.w - 470), ly = PZ.y + Math.min(120, Math.max(4, PZ.h - 40 - rows.length * 18));
    G.panel(lx, ly, 460, 20 + rows.length * 18, 'rgba(10,12,16,0.85)');
    rows.forEach((t, k) => G.text(t, lx + 10, ly + 18 + k * 18, { size: 12, weight: k ? 600 : 800, color: k ? '#e8e8e4' : '#ffd166' }));
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
    relayout(); HUD.hits = []; CH.rect = null; CH.plot = null; CH.tools = null; CH.bar = null; LC.rect = null; const liveView = phase !== 'replay'; // 리플레이에서는 그때의 몸만 보인다(효과·이륙 표시·도움 표시는 지금 것이라 감춘다)
    KEYS.log = []; // 이번 프레임에 그린 키캡 목록(시험에서 "화면의 키캡이 지금 설정과 같은지" 확인하는 데 쓴다)
    c.save(); c.beginPath(); c.rect(PZ.x, PZ.y, PZ.w, PZ.h); c.clip(); c.translate(VW.x0, VW.y0); c.scale(VW.s, VW.s); c.translate(-OX, -OY); LBL.k = lblK(VW.s); // 게임 화면은 플레이 구역 안에만 그린다. 글은 맞춤 크기로(atLabel)
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
      atLabel(o.x, o.y, () => G.text(`점프 속도 ${Math.round(Math.hypot(o.vx, o.vy))} · 각도 ${Math.round(Math.atan2(-o.vy, o.vx) * 180 / Math.PI)}°${jump.tR !== null && jump.tP !== null ? ` · 손 놓기 ${jump.tR - jump.tP >= 0 ? '+' : ''}${(jump.tR - jump.tP).toFixed(2)}초` : ''}`, o.x - 10, o.y + 22, { size: 12, weight: 800, color: '#111', align: 'right', stroke: 'rgba(255,255,255,0.7)', strokeW: 3 }));
    }
    if (liveView && swing && Math.max(swing.peak, swing.cur) > 6) { // 반동 표시: 손 아래 수직선과 최근 최고 각도
      const r = 118, pk = Math.max(swing.peak, swing.cur) * Math.PI / 180;
      G.line(swing.ax, swing.ay, swing.ax, swing.ay + r, 'rgba(0,0,0,0.25)', 1.5, [3, 5]);
      for (const sg of [-1, 1]) G.line(swing.ax + Math.sin(sg * pk) * (r - 8), swing.ay + Math.cos(pk) * (r - 8), swing.ax + Math.sin(sg * pk) * (r + 8), swing.ay + Math.cos(pk) * (r + 8), '#111', 3);
      const tr = swing.prev ? (swing.peak > swing.prev + 1 ? ' ▲ 커지는 중' : swing.peak < swing.prev - 1 ? ' ▼ 줄어드는 중' : ' ─') : '';
      atLabel(swing.ax, swing.ay, () => G.text(`반동 ${Math.round(Math.max(swing.peak, swing.cur))}°${tr}`, swing.ax, swing.ay - 14, { size: 13, weight: 800, align: 'center', color: '#111', stroke: 'rgba(255,255,255,0.7)', strokeW: 3 }));
    }
    if (mode === 'intent' && !bot && !S.dead && !ui && phase === 'live') drawIntentHelp(c);
    if (!S.dead && (bot || mode !== 'keys')) { const qx = liveView ? last.cx : aim.x, qy = liveView ? last.cy : aim.y; atLabel(qx, qy, () => { G.line(qx - 9, qy, qx + 9, qy, '#111', 2); G.line(qx, qy - 9, qx, qy + 9, '#111', 2); G.circle(qx, qy, 5, null, '#fff', 1.5); }); } // 조준점도 화면에서 늘 같은 크기 // 리플레이에서는 그때의 조준점
    c.restore(); LBL.k = 1;
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
    // 게임 화면에 붙은 안내(조작 설명 칸, 오른쪽 위 글, 띠)는 게임 화면과 같은 배율로 그린다 → 벽·목표를 가리는 정도가 화면을 나누기 전과 같다
    const helpShown = !(mode === 'intent' && !bot), body = []; // 넓은 흰 설명 칸은 옛 조작(A·B·C안)과 자동 시연에만 남긴다. 조작 D안은 오른쪽의 조작 설명 카드(drawHelpCard) // 게임 화면을 맞춤보다 키웠을 때도 조작 설명 칸을 숨긴다(커진 화면의 윗부분을 가리지 않게) // 조작 D안의 설명은 칸 너비를 넘지 않게 항목(·) 단위로 줄을 나눈다. HELP.h = 설명 칸과 그 아래 한 줄까지의 높이
    if (mode === 'intent') { let cur = ''; for (const sg of lines.flatMap(t => t.split('   ')).flatMap(t => t.split(' · '))) { const nx = cur ? cur + ' · ' + sg : sg; if (G.textW(nx, 11, 600) > 698 && cur) { body.push(cur); cur = sg; } else cur = nx; } if (cur) body.push(cur); } else body.push(...lines.filter(Boolean));
    HELP.body = body; HELP.h = Math.max(110, 6 + 22 + body.length * 13 + 6 + 22); // 과제 중과 결과·리플레이 화면에서는 조작 설명 칸을 그리지 않는다(벽과 목표 턱을 가리지 않게). 설명은 자유 연습 화면에 있다
    HELP.shown = helpShown; c.save(); c.beginPath(); c.rect(PZ.x, PZ.y, PZ.w, PZ.h); c.clip(); c.translate(HV.x0, HV.y0); c.scale(HV.s, HV.s);
    if (helpShown) {
      G.panel(8, 6, 716, HELP.h - 26, 'rgba(255,255,255,0.82)');
      G.text(`조작 ${CTRL.MODES[mode]}`, 18, 24, { size: 14, weight: 800, color: '#222' });
      HELP.body.forEach((t, k) => G.text(t, 18, 39 + k * 13, { size: mode === 'intent' ? 11 : 11.5, color: '#222', weight: 600 }));
      G.text(`${BIND.first('demo')} 시범 · ${BIND.first('lessonNext')} 연습 과제 · ${BIND.first('chart')} ${ACT.name.chart} · ${BIND.first('scheme')} 조작 방식 · ${BIND.first('reset')} 다시 · ${BIND.first('st1')}~${BIND.first('st5')} 시작 자세 · ${BIND.first('slow')} 느리게 · ${BIND.first('couple')} 도약 연결 · ${BIND.first('layout')} 연습 배치 · ${BIND.first('phys')} 물리 ${v05 ? 'v0.6' : 'v0.4'} · ${BIND.first('body')} 몸 비율 · ${BIND.label('settings')} 키 설정`, 18, HELP.h - 6, { size: 11, color: '#333', weight: 600, stroke: 'rgba(255,255,255,0.8)', strokeW: 3 });
    }
    const rtx = HELP.rtx = mode === 'intent' && !bot && (lesson() ? LAY.show.lesson && !LAY.pos.lesson : LAY.show.help && !LAY.pos.help && phase === 'live') && cardY() < HV.y0 + 64 * HV.s * lblK(HV.s) ? Math.min(W - 12, (PZ.x + PZ.w - 236 - 8 - 10 - HV.x0) / HV.s) : W - 12; // 과제 카드가 이 글의 높이까지 올라와 있으면 카드 왼쪽으로 비킨다
    atLabel(rtx, 0, () => { // 오른쪽 위 글도 게임 화면 배율과 상관없이 맞춤 크기로(오른쪽 위 모서리 기준)
    G.text(bot ? bot.def.title : `${station}. ${PH.STATIONS[station].name}   시도 ${tries}${slow ? '   느리게 ×0.5' : ''}`, rtx, 24, { size: 13, align: 'right', color: '#222', weight: 800, stroke: 'rgba(255,255,255,0.8)' });
    if (!lesson()) G.text(`${bot ? '자동 시연(사람과 같은 입력만 사용) · ' : ''}도약 연결 ${C.COUPLE ? '켬' : '끔'} · ${layout ? '연습 배치' : '기존 벽'}`, rtx, 42, { size: 11, align: 'right', color: '#333', stroke: 'rgba(255,255,255,0.8)', strokeW: 3 });
    if (!lesson()) G.text(`몸: ${PH.BODIES[PH.getBody()].short} (${BIND.first('body')}로 바꿈)`, rtx, 56, { size: 11, align: 'right', color: '#333', stroke: 'rgba(255,255,255,0.8)', strokeW: 3 }); // 지금 몸(도움말 칸과 겹치지 않게 다음 줄)
    }, lblK(HV.s));
    if (endT > 0) G.banner('매트에 떨어짐 — 바로 다시', failText(), 'fail', 380);
    if (endT > 0 && hint()) { const t = hint(), w = G.textW(t, 14, 800) + 28, hy = 458; G.panel(W / 2 - w / 2, hy, w, 28, 'rgba(255,214,102,0.96)'); G.text(t, W / 2, hy + 19, { size: 14, weight: 800, align: 'center', color: '#111' }); }
    else if (S.won && !lesson() && !(mode === 'intent' && !bot)) G.banner('목표 도달!', `${S.t.toFixed(1)}초 · 시도 ${tries} — R 또는 스페이스로 다시`, 'win', 400);
    else if (bot && bot.m.done) G.banner('건너가서 안정됨', '두 손 + 한 발로 버티는 중', 'win', 440);
    c.restore();
    if (!(mode === 'intent' && !bot)) { // 옛 조작(A·B·C안)과 자동 시연: 아래 띠 그대로
      const sh = t => t.replace(/^(왼|오른)/, '').replace('클릭', ''), kname = mode === 'intent' ? (O.handMode === 1 ? [B1('sendL'), B1('sendR'), sh(B1('foot')) + '+' + sh(B1('sendL')), sh(B1('foot')) + '+' + sh(B1('sendR'))] : ['추천/다른', '추천/다른', sh(B1('foot')) + '+손', sh(B1('foot')) + '+손']) : mode === 'hold' ? ['좌클릭', '우클릭', kn(K.lf), kn(K.rf)] : [kn(K.lh), kn(K.rh), kn(K.lf), kn(K.rf)];
      for (let i = 0; i < 4; i++) { const m = S.limb[i].mode, on = m === 'reach'; key(c, 10 + i * 126, LIMB[i], on ? (mode === 'intent' && i >= 2 && !ctrl.st.manual[i] ? '자동' : '움직이는 중') : m === 'free' ? '힘 빠짐' : '붙음', on, COL[i], kname[i]); }
      key(c, 514, mode === 'intent' ? '모으기·던지기' : '힘주기', '', last.power, '#ffd166', mode === 'intent' ? B1('power') : sp);
    }
    if (mode === 'intent' && recent.length && !ui && LAY.show.recent) recent.forEach((r, k) => { const y = PZ.y + PZ.h - 26 - (recent.length - 1 - k) * 20, w = G.textW(r.text, 12, 800) + 14, rx = PZ.x + PZ.w - 12; G.ctx.globalAlpha = Math.min(1, r.t * 2); G.panel(rx - w, y - 15, w, 19, 'rgba(10,12,16,0.8)'); G.text(r.text, rx - w + 7, y, { size: 12, weight: 800, color: '#ffd166' }); G.ctx.globalAlpha = 1; });
    GD.rect = null; HELP.rect = null; if (mode === 'intent' && !bot && !ui) { drawLessonCard(); drawHelpCard(); drawGuide(false); drawChartPanel(); drawResult(); }
    if (mode === 'intent' && !bot && !ui && !(endT > 0) && phase === 'live' && LAY.show.status) drawStatus(); // 떨어진 뒤에는 안내 띠와 겹치지 않게 상태 칸을 숨긴다
    if (showLog && mode === 'intent') drawLog();
    { // 플레이 구역의 오른쪽 아래: 게임 화면 배율과 빌드. 배율을 바꿨으면 맞춤으로 되돌리는 단추
      const by = !CZ && CH.tools ? CH.tools.y - 6 : PZ.y + PZ.h - 8, vt = `게임 화면 ${Math.round(VW.s * 100)}% · 실험 빌드 ${BUILD}`; G.text(vt, PZ.x + PZ.w - 10, by, { size: 9.5, align: 'right', color: 'rgba(255,255,255,0.45)', weight: 500 }); // 배율·빌드는 보조 정보라 작고 흐리게(GPT 화면 지침 10)
      if (mode === 'intent' && !bot && !ui) { // 보기 설정 단추(늘 보인다)와, 배율을 바꿨을 때의 맞춤 단추
        const t0 = `${BIND.first('viewMenu')} ${ACT.name.viewMenu}`, w0 = G.textW(t0, 9, 800) + 12, x0 = PZ.x + PZ.w - 14 - G.textW(vt, 9.5, 500) - w0; if (x0 > PZ.x + 4) hudBtn('view_menu', x0, by - 12, w0, 15, t0, { size: 9, primary: VM.open });
        if (Math.abs(LAY.zoom - 1) > 1e-6) { const t = `${BIND.first('viewFit')} ${ACT.name.viewFit}`, w = G.textW(t, 9, 800) + 12, x = x0 - w - 4; if (x > PZ.x + 4) hudBtn('view_fit', x, by - 12, w, 15, t, { size: 9 }); } } }
    if (mode === 'intent' && !bot && !ui) { // 확대해서 과제의 목표가 구역 밖에 있으면 어느 쪽인지 가장자리에 알린다
      const mk = lesson() && lesson().mark, mp = mk && world.find(pl => pl.id === mk[0]), q = mp && toScreen(mp.cx, mp.cy);
      if (q && (q[0] < PZ.x + 6 || q[0] > PZ.x + PZ.w - 6 || q[1] < PZ.y + 6 || q[1] > PZ.y + PZ.h - 6)) { const ex = Math.max(PZ.x + 22, Math.min(PZ.x + PZ.w - 22, q[0])), ey = Math.max(PZ.y + 22, Math.min(PZ.y + PZ.h - 22, q[1])), a = Math.atan2(q[1] - ey, q[0] - ex);
        G.circle(ex, ey, 14, 'rgba(242,178,0,0.95)', '#1d1d1d', 1.5); G.line(ex - 6 * Math.cos(a), ey - 6 * Math.sin(a), ex + 7 * Math.cos(a), ey + 7 * Math.sin(a), '#1d1d1d', 2.5); G.line(ex + 7 * Math.cos(a), ey + 7 * Math.sin(a), ex + 7 * Math.cos(a) - 6 * Math.cos(a - 0.6), ey + 7 * Math.sin(a) - 6 * Math.sin(a - 0.6), '#1d1d1d', 2.5); G.line(ex + 7 * Math.cos(a), ey + 7 * Math.sin(a), ex + 7 * Math.cos(a) - 6 * Math.cos(a + 0.6), ey + 7 * Math.sin(a) - 6 * Math.sin(a + 0.6), '#1d1d1d', 2.5);
        G.text('목표', ex, ey + (ey < PZ.y + PZ.h / 2 ? 27 : -19), { size: 9.5, weight: 800, align: 'center', color: '#1d1d1d', stroke: 'rgba(255,255,255,0.8)', strokeW: 3 }); HELP.markOff = true; } else HELP.markOff = false; }
    drawDockPreview(); if (mode === 'intent' && !bot && !ui) drawViewMenu(); else VM.rect = null;
    if (ui) drawSettings();
    if (remap) { G.panel(W / 2 - 220, 200, 440, 70, 'rgba(20,30,60,0.95)', '#fff'); G.text(`키 다시 지정 (${remap.i + 1}/${remap.list.length}) — Esc 그만`, W / 2, 226, { size: 13, align: 'center', weight: 600 }); G.text(`「${CTRL.LABEL[remap.list[remap.i]]}」에 쓸 키를 누르세요`, W / 2, 252, { size: 18, align: 'center', weight: 800 }); }
  }
  G.run(game, { title: '등반 조작 실험실' });
})();
