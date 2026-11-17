// 등반 조작 실험실 · 화면과 입력
'use strict';
(() => {
  const W = G.W, H = G.H, OX = -30, OY = 130, C = PH.C;
  const LIMB = ['왼손', '오른손', '왼발', '오른발'], COL = ['#e86a5a', '#4fb3e8', '#e86a5a', '#4fb3e8'], DARK = ['#8a3b3b', '#2a6f97', '#8a3b3b', '#2a6f97'];
  const world = PH.makeWorld();
  const autoList = G.auto ? (G.auto === 'all' ? Object.keys(BOTS.defs) : [G.auto].filter(n => BOTS.defs[n])) : [];
  let S, station = 1, tries = 0, fx = [], why = null, endT = 0, block = [true, true, true, true], slow = false, tick = 0, bot = null, autoI = 0, doneT = 0, air = null, last = BOTS.idle();
  window.__lab = { get s() { return S; }, get bot() { return bot; }, finished: false, results: [] };

  function reset(st) {
    if (st) station = st;
    if (autoList.length) { bot = BOTS.make(autoList[autoI % autoList.length]); station = bot.def.station; }
    S = PH.create(world, station); tries++; fx = []; why = null; endT = 0; doneT = 0; air = null; block = [true, true, true, true];
  }
  function readInput(inp) {
    const m = inp.mouse, raw = [m.down[0] || inp.key('KeyQ'), m.down[2] || inp.key('KeyE'), inp.key('KeyA'), inp.key('KeyD')];
    for (let i = 0; i < 4; i++) { if (!raw[i]) block[i] = false; if (block[i]) raw[i] = false; } // 재시작 때 눌려 있던 버튼은 한 번 떼야 듣는다
    return { cx: m.x + OX, cy: m.y + OY, hand: [raw[0], raw[1]], foot: [raw[2], raw[3]], power: inp.key('Space') || inp.key('ShiftLeft') || inp.key('KeyW') };
  }
  function note(e) {
    const n = LIMB[e.limb];
    if (e.type === 'grab') { fx.push({ x: e.x, y: e.y, t: 0.4, kind: 'ring' }); G.sfx.grab(); }
    else if (e.type === 'plant') { fx.push({ x: e.x, y: e.y, t: 0.3, kind: 'ring' }); G.sfx.beep(); }
    else if (e.type === 'miss') { say(e, e.d < 80 ? `${n} 허공 — 잡을 곳까지 ${Math.ceil(e.d)}px 모자람` : `${n} 허공 — 근처에 잡을 곳이 없다`); G.sfx.miss(); }
    else if (e.type === 'footmiss') { if (e.d < 30) say(e, `${n} 헛디딤 — 면까지 ${Math.ceil(e.d)}px`, true); }
    else if (e.type === 'slip') { say(e, `${n} 미끄러짐 — 당기는 방향 ${Math.round(e.ang)}°, 이 ${PH.GRIP[e.kind].name}의 한계 ${e.lim}°`); G.sfx.fail(); }
    else if (e.type === 'footoff') say(e, `${n} 접촉 끊김 — 누르는 힘이 없어 발이 떴다`, true);
    else if (e.type === 'mat') { endT = 1.3; G.sfx.thud(); G.shake(5, 0.2); }
    else if (e.type === 'win') G.sfx.win();
  }
  function say(e, text, minor) { fx.push({ x: e.x, y: e.y, t: 1.6, kind: 'text', text }); if (!minor) why = { text, t: S.t }; }

  const game = {
    init() { reset(1); },
    update(dt, inp) {
      for (const f of fx) f.t -= dt; fx = fx.filter(f => f.t > 0);
      if (!bot) {
        if (inp.pressed('KeyR')) { reset(); return; }
        for (let k = 1; k <= 4; k++) if (inp.pressed('Digit' + k)) { tries = 0; reset(k); return; }
        if (inp.pressed('KeyT')) slow = !slow;
      }
      if (endT > 0) { endT -= dt; if (endT <= 0 || (!bot && inp.any())) { if (bot) nextAuto(false); reset(); } return; }
      if (S.won && !bot) { if (inp.pressed('Space') || inp.pressed('Enter')) reset(); }
      tick++; if (slow && tick % 2) return;
      last = bot ? bot.step(S) : readInput(inp);
      PH.step(S, last, dt);
      // 공중에 떠 있는 동안 손이 잡을 곳에 가장 가까웠던 거리를 기억해 둔다(실패 원인 표시용)
      if (S.limb.some(l => l.mode === 'grip' || l.mode === 'plant')) { air = null; }
      else { if (!air) air = { t: S.t, gap: 1e9 }; if (S.t - air.t > 0.25) for (const i of [0, 1]) { const q = PH.nearestGrip(world, S.p[2 + i].x, S.p[2 + i].y); air.gap = Math.min(air.gap, q.d - C.GRAB_R); } }
      for (const e of S.events) note(e);
      if (bot && bot.m.done) { doneT += dt; if (doneT > 2) { nextAuto(true); reset(); } }
    },
    draw,
  };
  function nextAuto(ok) { window.__lab.results.push({ name: autoList[autoI % autoList.length], ok }); autoI++; if (autoI >= autoList.length) window.__lab.finished = true; }

  // ---- 그리기
  const TYPE_COL = { ledge: '#7d828c', incut: '#b9793a', jug: '#d9573a', sloper: '#8b7fa8', block: '#6b6f78' };
  function drawWorld(c) {
    c.fillStyle = '#cfcabd'; c.fillRect(OX, OY, W, H);
    for (let y = 150; y < C.FLOOR; y += 40) for (let x = OX + 20; x < OX + W; x += 40) G.circle(x, y, 1.5, 'rgba(0,0,0,0.13)');
    c.fillStyle = '#3c5a8a'; c.fillRect(OX, C.FLOOR, W, 60);
    for (const pl of world) {
      c.beginPath(); pl.pts.forEach((q, i) => i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])); c.closePath();
      c.fillStyle = pl.goal ? '#d9a521' : TYPE_COL[pl.type]; c.fill(); c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 1.5; c.stroke();
      for (const e of pl.edges) if (e.grip) G.line(e.ax, e.ay, e.bx, e.by, pl.type === 'sloper' ? '#e9e2ff' : '#fff6d8', 3.5); // 손으로 잡을 수 있는 면
    }
    const lab = (id, t, dx, dy) => { const pl = world.find(p => p.id === id); G.text(t, pl.cx + dx, pl.cy + dy, { size: 11, align: 'center', color: 'rgba(40,40,40,0.75)', weight: 700 }); };
    lab('A', '깊은 턱', -40, 26); lab('B', '턱', 30, 26); lab('G', '목표: 두 손으로 잡기', 0, -14); lab('J', '저그', 0, 24); lab('S', '둥근 면(미끄러움)', 0, 24); lab('F1', '발판', 0, 8); lab('F3', '발판', 0, 24);
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
        G.line(e.x, e.y, last.cx, last.cy, 'rgba(255,255,255,0.6)', 1.5, [4, 4]);
        const q = lb.arm ? PH.nearestGrip(world, e.x, e.y) : PH.nearestSurface(world, e.x, e.y), ok = q && q.d <= (lb.arm ? C.GRAB_R : C.PLANT_R);
        if (ok) G.circle(q.x, q.y, 13 + Math.sin(S.t * 14) * 2, null, '#3dff8f', 3); // 지금 떼면 붙는다
      }
    }
  }
  function key(c, x, label, sub, on, col) {
    G.panel(x, H - 26, 84, 21, on ? col : 'rgba(10,12,16,0.55)', on ? '#fff' : null);
    G.text(label, x + 6, H - 11, { size: 12, weight: 800, color: on ? '#111' : '#e8e8e4' });
    G.text(sub, x + 79, H - 11, { size: 10, weight: 600, align: 'right', color: on ? '#222' : 'rgba(255,255,255,0.55)' });
  }
  function draw(c) {
    c.save(); c.translate(-OX, -OY);
    drawWorld(c); drawBody(c);
    for (const f of fx) {
      if (f.kind === 'ring') G.circle(f.x, f.y, 12 + (0.4 - f.t) * 40, null, `rgba(255,255,255,${Math.min(1, f.t * 3)})`, 3);
      else { c.globalAlpha = Math.min(1, f.t * 2); const w = G.textW(f.text, 13, 800) + 14; G.panel(f.x + 14, f.y - 30, w, 22, 'rgba(120,16,16,0.9)'); G.text(f.text, f.x + 21, f.y - 14, { size: 13, weight: 800 }); c.globalAlpha = 1; }
    }
    if (!S.dead) { G.line(last.cx - 9, last.cy, last.cx + 9, last.cy, '#111', 2); G.line(last.cx, last.cy - 9, last.cx, last.cy + 9, '#111', 2); G.circle(last.cx, last.cy, 5, null, '#fff', 1.5); }
    c.restore();
    G.panel(8, 6, 610, 62, 'rgba(255,255,255,0.78)');
    G.text('등반 조작 실험실', 18, 26, { size: 16, weight: 800, color: '#222' });
    G.text('누르고 있는 동안 그 손발이 커서를 따라간다 → 떼는 순간 닿은 곳을 잡는다/디딘다. 붙은 손발은 키 없이 유지된다.', 18, 44, { size: 12, color: '#333', weight: 500 });
    G.text('스페이스: 붙은 팔다리로 몸을 커서 쪽으로 당기고 민다(도약)   R 다시 · 1~4 시작 자세 · T 느리게', 18, 60, { size: 12, color: '#333', weight: 500 });
    G.text(bot ? bot.def.title : `${station}. ${PH.STATIONS[station].name}   시도 ${tries}${slow ? '   느리게 ×0.5' : ''}`, W - 12, 24, { size: 13, align: 'right', color: '#222', weight: 800, stroke: 'rgba(255,255,255,0.8)' });
    if (bot) G.text('자동 시연 (사람과 같은 입력만 사용)', W - 12, 42, { size: 11, align: 'right', color: '#444' });
    key(c, 10, '왼손', '좌클릭·Q', last.hand[0], COL[0]); key(c, 98, '오른손', '우클릭·E', last.hand[1], COL[1]);
    key(c, 186, '왼발', 'A', last.foot[0], COL[2]); key(c, 274, '오른발', 'D', last.foot[1], COL[3]); key(c, 362, '힘주기', 'Space', last.power, '#ffd166');
    G.text('실험 빌드 v0.2', W - 10, H - 10, { size: 11, align: 'right', color: 'rgba(255,255,255,0.6)', weight: 500 });
    if (endT > 0) G.banner('매트에 떨어짐 — 바로 다시', why && (!air || why.t >= air.t - 0.05) ? why.text : air && air.gap > 0 && air.gap < 1e8 ? `손이 잡을 곳에 닿지 못했다 — 가장 가까웠을 때 ${Math.ceil(air.gap)}px 모자람` : air && air.gap <= 0 ? '손이 닿는 거리였지만 잡지 않았다(버튼을 떼야 잡는다)' : '붙잡은 곳 없이 떨어졌다', 'fail', 400);
    else if (S.won) G.banner('목표 도달!', `${S.t.toFixed(1)}초 · 시도 ${tries} — R 또는 스페이스로 다시`, 'win', 400);
    else if (bot && bot.m.done) G.banner('건너가서 안정됨', '두 손 + 한 발로 버티는 중', 'win', 440);
  }
  G.run(game, { title: '등반 조작 실험실' });
})();
