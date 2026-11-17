// 등반 조작 실험실 · 화면과 입력
'use strict';
(() => {
  const W = G.W, H = G.H, OX = -30, OY = 130, C = PH.C;
  const LIMB = ['왼손', '오른손', '왼발', '오른발'], COL = ['#e86a5a', '#4fb3e8', '#e86a5a', '#4fb3e8'], DARK = ['#8a3b3b', '#2a6f97', '#8a3b3b', '#2a6f97'];
  let world = PH.makeWorld(), layout = null;
  const autoList = G.auto ? (G.auto === 'all' ? Object.keys(BOTS.defs) : G.auto.split(',').filter(n => BOTS.defs[n])) : [];
  if (G.params.get('couple') !== null) C.COUPLE = +G.params.get('couple');
  const MODE_LIST = ['pick', 'keys', 'hold'];
  try { const saved = JSON.parse(localStorage.getItem('climbKeys') || 'null'); if (saved) for (const m in saved) Object.assign(CTRL.KEYMAP[m], saved[m]); } catch (e) {}
  let mode = MODE_LIST.includes(G.params.get('mode')) ? G.params.get('mode') : 'pick', ctrl = CTRL.make(mode), remap = null;
  const kn = c => (c || '?').replace('Key', '').replace('Digit', '').replace('Arrow', '');
  let S, station = 1, tries = 0, fx = [], why = null, endT = 0, slow = false, tick = 0, bot = null, autoI = 0, doneT = 0, air = null, jump = null, trail = [], swing = null, last = BOTS.idle();
  window.__lab = { raw: () => { const m = G.input.mouse; return (m.down[0] || G.input.key('KeyQ') ? 'L' : '-') + (m.down[2] || G.input.key('KeyE') ? 'R' : '-'); }, get s() { return S; }, get bot() { return bot; }, finished: false, results: [] };

  function reset(st) {
    if (st) station = st;
    if (autoList.length) { bot = BOTS.make(autoList[autoI % autoList.length]); station = bot.def.station; }
    S = PH.create(world, station); tries++; fx = []; why = null; endT = 0; doneT = 0; air = null; jump = null; trail = []; swing = null; ctrl = CTRL.make(mode);
  }
  function readInput(inp) {
    const m = inp.mouse, io = { mx: m.x + OX, my: m.y + OY, lheld: m.down[0], rheld: m.down[2], lmb: inp.clicks.some(c => c.button === 0), rmb: inp.clicks.some(c => c.button === 2), key: c => inp.key(c), pressed: c => inp.pressed(c) };
    const out = ctrl.step(S, io, 1 / 120);
    for (const i of ctrl.st.air) fx.push({ x: S.p[2 + i].x, y: S.p[2 + i].y, t: 0.9, kind: 'text', text: `${LIMB[i]}: 닿은 곳이 없다 — 그대로 들고 있음` });
    return out;
  }
  function note(e) {
    const n = LIMB[e.limb];
    if (e.type === 'grab') { fx.push({ x: e.x, y: e.y, t: 0.4, kind: 'ring' }); G.sfx.grab(); }
    else if (e.type === 'plant') { fx.push({ x: e.x, y: e.y, t: 0.3, kind: 'ring' }); G.sfx.beep(); }
    else if (e.type === 'miss') { if (e.d < 40) { say(e, `${n} 허공 — 잡을 곳까지 ${Math.ceil(e.d)}px 모자람`); G.sfx.miss(); } } // 멀리서 뗀 것은 일부러 놓은 것으로 본다
    else if (e.type === 'nohold') { say(e, `${n} 걸리지 않음 — 면 기울기 ${Math.round(e.ang)}°, ${PH.GRIP[e.kind].name}은 ${e.lim}°까지`); G.sfx.miss(); }
    else if (e.type === 'footmiss') { if (e.fast) say(e, `${n} 디디지 못함 — 발이 너무 빠르다`, true); else if (e.d < 30) say(e, `${n} 헛디딤 — 면까지 ${Math.ceil(e.d)}px`, true); }
    else if (e.type === 'slip') { say(e, `${n} 미끄러짐 — 당기는 방향 ${Math.round(e.ang)}°, 이 ${PH.GRIP[e.kind].name}의 한계 ${e.lim}°`); G.sfx.fail(); }
    else if (e.type === 'footoff') say(e, e.hang ? `${n} 떨어짐 — 발에 매달릴 수는 없다(몸이 발 아래에 있다)` : `${n} 접촉 끊김 — 누르는 힘이 없어 발이 떴다`, !e.hang);
    else if (e.type === 'mat') { endT = bot ? 2.6 : 1.6; G.sfx.thud(); G.shake(5, 0.2); }
    else if (e.type === 'win') G.sfx.win();
  }
  function say(e, text, minor) { fx.push({ x: e.x, y: e.y, t: 1.6, kind: 'text', text }); if (!minor) why = { text, t: S.t }; }

  const game = {
    init() { reset(1); },
    update(dt, inp) {
      for (const f of fx) f.t -= dt; fx = fx.filter(f => f.t > 0);
      if (remap) { // 키 다시 지정: 순서대로 누른다. Esc로 그만둔다
        const codes = inp.codes();
        if (codes.includes('Escape')) remap = null;
        else if (codes.length) { CTRL.KEYMAP[mode][remap.list[remap.i]] = codes[0]; remap.i++; if (remap.i >= remap.list.length) { try { localStorage.setItem('climbKeys', JSON.stringify(CTRL.KEYMAP)); } catch (e) {} remap = null; reset(); } }
        return;
      }
      if (!bot) {
        if (inp.pressed('KeyR')) { reset(); return; }
        for (let k = 1; k <= 5; k++) if (inp.pressed('Digit' + k)) { tries = 0; reset(k); return; }
        if (inp.pressed('Tab')) { mode = MODE_LIST[(MODE_LIST.indexOf(mode) + 1) % MODE_LIST.length]; tries = 0; reset(); return; }
        if (inp.pressed('Digit6')) slow = !slow;
        if (inp.pressed('Digit7')) C.COUPLE = C.COUPLE ? 0 : 0.15;
        if (inp.pressed('Digit8')) { layout = layout ? null : 'near'; world = PH.makeWorld(layout); tries = 0; reset(); return; }
        if (inp.pressed('Digit9')) C.AIMHOLD = C.AIMHOLD ? 0 : 0.2;
        if (inp.pressed('Digit0')) { remap = { list: Object.keys(CTRL.KEYMAP[mode]), i: 0 }; return; }
      }
      if (endT > 0) { endT -= dt; if (endT <= 0 || (!bot && endT < 1.2 && inp.any())) { if (bot) nextAuto(false); reset(); } return; }
      if (S.won && !bot) { if (inp.pressed('Space') || inp.pressed('Enter')) reset(); }
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
      if (last.power && jump.tP === null && (last.cy < c.y - 20 || !hands.length)) jump.tP = S.t; // 위쪽으로 밀기 시작
      if (!last.power && hands.length) jump.tP = null;
      if (!hands.length && jump.tR === null) jump.tR = S.t;
      if (hands.length) jump.tR = null;
      jump.ext = Math.max(...feet.map(i => Math.hypot(S.p[2 + i].x - S.p[1].x, S.p[2 + i].y - S.p[1].y) / L[i].max));
      jump.lean = S.p[1].x - feet.reduce((a, i) => a + S.p[2 + i].x, 0) / feet.length; // 엉덩이가 발보다 얼마나 오른쪽인가
    } else if (jump && !jump.off && jump.tP !== null) {
      jump.off = { x: c.x, y: c.y, vx: c.vx, vy: c.vy, t: S.t, held: hands.length > 0 }; trail = [];
      if (jump.tR === null && !hands.length) jump.tR = S.t;
    }
    if (jump && jump.off && jump.tR === null && !hands.length) jump.tR = S.t;
    if (jump && jump.off && !hands.length && !feet.length && trail.length < 400 && Math.round(S.t * 120) % 4 === 0) trail.push([c.x, c.y]);
    // 반동: 손으로만 매달려 있을 때 가슴이 손 아래에서 벗어난 각도의 반주기별 최고값
    if (hands.length && !feet.length) {
      const a = L[hands[0]].anchor, phi = Math.atan2(c.x - a.x, c.y - a.y) * 180 / Math.PI;
      if (!swing || swing.ax !== a.x) swing = { ax: a.x, ay: a.y, side: Math.sign(phi) || 1, cur: 0, peak: 0, prev: 0 };
      if (Math.sign(phi) === -swing.side && Math.abs(phi) > 2) { swing.prev = swing.peak; swing.peak = swing.cur; swing.cur = 0; swing.side = -swing.side; }
      swing.cur = Math.max(swing.cur, Math.abs(phi)); swing.phi = phi;
    } else swing = null;
  }
  function hint() { // 떨어진 뒤: 방향·타이밍·발 위치 중 무엇을 바꿀지
    if (!jump || jump.tP === null || !jump.off) return null;
    const d = jump.tR === null ? 9 : jump.tR - jump.tP, o = jump.off, ang = Math.round(Math.atan2(-o.vy, o.vx) * 180 / Math.PI), sp = Math.round(Math.hypot(o.vx, o.vy));
    const win = (C.COUPLE || 0) + 0.15;
    if (d > win) return `바꿀 것: 타이밍 — 손 놓기가 밀기보다 ${d > 5 ? '너무' : d.toFixed(2) + '초'} 늦어 팔에 붙잡혔다 (여유 약 ${win.toFixed(2)}초)`;
    if (jump.lean < 4) return `바꿀 것: 발 위치 — 발이 엉덩이보다 앞(가려는 쪽)에 있어 ${ang > 90 ? '뒤로' : '위로만'} 밀렸다. 발을 반대쪽에 두기`;
    if (air && air.gap <= 0) return '바꿀 것: 잡는 타이밍 — 손이 닿았지만 버튼을 떼지 않았다';
    return `바꿀 것: 방향 — 이륙 ${sp}px/s, 수평에서 ${ang}° 위. 손이 ${air && air.gap < 1e8 ? Math.ceil(air.gap) : '?'}px 모자랐다`;
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
  function drawBody(c) {
    const p = S.p, ch = p[0], hp = p[1], ux = (ch.x - hp.x) / C.T, uy = (ch.y - hp.y) / C.T;
    for (const i of [2, 3, 0, 1]) { // 다리 먼저, 팔 나중
      const lb = S.limb[i], r = p[lb.root], e = p[lb.end], mid = ik([r.x, r.y], [e.x, e.y], lb.max + 2, i % 2 ? -1 : 1);
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
      if (lb.mode === 'reach') {
        const r = p[lb.root];
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
    G.text(sub, x + 117, H - 11, { size: 10, weight: 600, align: 'right', color: on ? '#222' : 'rgba(255,255,255,0.55)' });
  }
  function draw(c) {
    c.save(); c.translate(-OX, -OY);
    drawWorld(c); drawBody(c);
    for (const f of fx) {
      if (f.kind === 'ring') G.circle(f.x, f.y, 12 + (0.4 - f.t) * 40, null, `rgba(255,255,255,${Math.min(1, f.t * 3)})`, 3);
      else { c.globalAlpha = Math.min(1, f.t * 2); const w = G.textW(f.text, 13, 800) + 14; G.panel(f.x + 14, f.y - 30, w, 22, 'rgba(120,16,16,0.9)'); G.text(f.text, f.x + 21, f.y - 14, { size: 13, weight: 800 }); c.globalAlpha = 1; }
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
    if (!S.dead && (bot || mode !== 'keys')) { G.line(last.cx - 9, last.cy, last.cx + 9, last.cy, '#111', 2); G.line(last.cx, last.cy - 9, last.cx, last.cy + 9, '#111', 2); G.circle(last.cx, last.cy, 5, null, '#fff', 1.5); }
    c.restore();
    const K = CTRL.KEYMAP[mode], sp = kn(K.power);
    const lines = mode === 'pick' ? [
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
    G.text('Tab 조작 방식 바꾸기 · R 다시 · 1~5 시작 자세 · 6 느리게 · 7 도약 연결 · 8 연습 배치 · 0 키 다시 지정', 18, 104, { size: 11, color: '#333', weight: 600, stroke: 'rgba(255,255,255,0.8)', strokeW: 3 });
    G.text(bot ? bot.def.title : `${station}. ${PH.STATIONS[station].name}   시도 ${tries}${slow ? '   느리게 ×0.5' : ''}`, W - 12, 24, { size: 13, align: 'right', color: '#222', weight: 800, stroke: 'rgba(255,255,255,0.8)' });
    G.text(`${bot ? '자동 시연(사람과 같은 입력만 사용) · ' : ''}도약 연결 ${C.COUPLE ? '켬' : '끔'} · ${layout ? '연습 배치' : '기존 벽'}`, W - 12, 42, { size: 11, align: 'right', color: '#333', stroke: 'rgba(255,255,255,0.8)', strokeW: 3 });
    const kname = mode === 'hold' ? ['좌클릭', '우클릭', kn(K.lf), kn(K.rf)] : [kn(K.lh), kn(K.rh), kn(K.lf), kn(K.rf)];
    for (let i = 0; i < 4; i++) { const m = S.limb[i].mode, on = m === 'reach'; key(c, 10 + i * 126, LIMB[i], on ? '움직이는 중' : m === 'free' ? '힘 빠짐' : '붙음', on, COL[i], kname[i]); }
    key(c, 514, '힘주기', '', last.power, '#ffd166', sp);
    if (remap) { G.panel(W / 2 - 220, 200, 440, 70, 'rgba(20,30,60,0.95)', '#fff'); G.text(`키 다시 지정 (${remap.i + 1}/${remap.list.length}) — Esc 그만`, W / 2, 226, { size: 13, align: 'center', weight: 600 }); G.text(`「${CTRL.LABEL[remap.list[remap.i]]}」에 쓸 키를 누르세요`, W / 2, 252, { size: 18, align: 'center', weight: 800 }); }
    G.text('실험 빌드 v0.4', W - 10, H - 10, { size: 11, align: 'right', color: 'rgba(255,255,255,0.6)', weight: 500 });
    if (endT > 0) G.banner('매트에 떨어짐 — 바로 다시', why && (!air || why.t >= air.t - 0.05) ? why.text : hint() ? '도약이 다음 턱에 이어지지 않았다' : air && air.gap > 0 && air.gap < 1e8 ? `손이 잡을 곳에 닿지 못했다 — 가장 가까웠을 때 ${Math.ceil(air.gap)}px 모자람` : air && air.gap <= 0 ? '손이 닿는 거리였지만 잡지 않았다(버튼을 떼야 잡는다)' : '붙잡은 곳 없이 떨어졌다', 'fail', 380);
    if (endT > 0 && hint()) { const t = hint(), w = G.textW(t, 14, 800) + 28; G.panel(W / 2 - w / 2, 458, w, 28, 'rgba(255,214,102,0.96)'); G.text(t, W / 2, 477, { size: 14, weight: 800, align: 'center', color: '#111' }); }
    else if (S.won) G.banner('목표 도달!', `${S.t.toFixed(1)}초 · 시도 ${tries} — R 또는 스페이스로 다시`, 'win', 400);
    else if (bot && bot.m.done) G.banner('건너가서 안정됨', '두 손 + 한 발로 버티는 중', 'win', 440);
  }
  G.run(game, { title: '등반 조작 실험실' });
})();
