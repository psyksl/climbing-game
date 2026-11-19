// GPT의 v0.16.1 검토 N1~N3 대조 시험. 고치기 전 빌드에 돌리면 재현, 고친 빌드에 돌리면 해소를 확인한다.
// 사용: node test/review_v0161.js [결과 JSON 경로]      고치기 전: LAB=옛/lab node test/review_v0161.js
// 입력은 모두 스크립트(사람 손 아님). 실제 브라우저(Chromium)에서 빌드 HTML을 연다
'use strict';
const { chromium } = require('playwright'), path = require('path'), fs = require('fs');
const LAB = process.env.LAB || path.join(__dirname, '..'), url = 'file://' + path.join(LAB, 'climb_lab.html'), K = 1280 / 960, OUT = process.argv[2];
(async () => {
  const b = await chromium.launch(); let fail = 0; const res = { build: LAB, checks: [] };
  const check = (n, c, x = '', data) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`); if (!c) fail++; res.checks.push({ name: n, pass: !!c, detail: x, data }); };
  console.log('대상:', LAB);
  const open = async (q = '', throttle = 1) => { const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }), pg = await ctx.newPage(); if (throttle > 1) { const cdp = await ctx.newCDPSession(pg); await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle }); } await pg.goto(url + q); await pg.waitForTimeout(800); return pg; };
  const lab = (pg, f, a) => pg.evaluate(f, a), wait = (pg, ms) => pg.waitForTimeout(ms);
  const g2s = async (pg, x, y) => { const v = await lab(pg, () => window.__lab.view()); return [(v.x0 + x * v.s) * K, (v.y0 + y * v.s) * K]; };
  const L4 = async (pg, hold) => { const q = await g2s(pg, 575, 218); await pg.mouse.move(q[0], q[1], { steps: 6 }); await wait(pg, 200); await pg.mouse.click(q[0], q[1], { button: 'right' }); await wait(pg, 900); await pg.keyboard.down('Space'); await wait(pg, 140); await pg.mouse.click(q[0], q[1]); await wait(pg, hold - 140); await pg.keyboard.up('Space'); };

  // ── N1. 리플레이의 표시 자세(무릎 방향·골반 돌림)가 그 시각의 것인가. 화면 빠르기를 바꿔(CPU 4배 느리게) 한 번 더
  for (const thr of [1, 4]) {
    const pg = await open('', thr);
    await lab(pg, () => { window.__smp = []; const loop = () => { const L = window.__lab; if (L && L.shape && L.s) window.__smp.push({ t: L.s.t, j: L.shape().joints.map(q => [q.x, q.y]), tw: L.shape().twist }); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    await pg.keyboard.press('Digit3'); await wait(pg, 800);
    await pg.keyboard.down('KeyA'); await wait(pg, 900); await pg.keyboard.up('KeyA'); await pg.keyboard.down('KeyD'); await wait(pg, 1100); await pg.keyboard.up('KeyD'); await wait(pg, 300);
    const preShape = await lab(pg, () => ({ tw: window.__lab.shape().twist, j: window.__lab.shape().joints.map(q => [q.x, q.y]) }));
    await pg.keyboard.press('KeyY'); await wait(pg, 300); if ((await lab(pg, () => window.__lab.practice().rp.playing))) await pg.keyboard.press('Space'); await wait(pg, 200);
    const smp = await lab(pg, () => window.__smp.slice()), t0 = await lab(pg, () => window.__lab.lesson().rec.t0), rp = await lab(pg, () => window.__lab.practice().rp);
    const tt = await lab(pg, () => window.__lab.trackTimes ? window.__lab.trackTimes() : null), onTrack = q => !tt || tt.some(t => Math.abs(t - q.t) < 1e-6), cands = smp.filter(q => q.t > rp.from + 0.1 && q.t < rp.to - 0.1 && onTrack(q)), picks = [0.06, 0.12, 0.18, 0.24, 0.3, 0.36, 0.42, 0.48, 0.54, 0.6, 0.66, 0.72, 0.78, 0.84, 0.9].map(f => cands[Math.floor(f * (cands.length - 1))]).filter(Boolean); let worst = 0, worstTw = 0, matched = 0;
    for (const sm of picks) { const c = await lab(pg, () => window.__lab.chart()), x = c.ax + c.pad + (sm.t - t0 - c.view) * c.pps, y = c.plot.y + 4;
      await pg.mouse.click(x * K, y * K); await wait(pg, 250);
      const r = await lab(pg, () => ({ t: window.__lab.s.t, j: window.__lab.shape().joints.map(q => [q.x, q.y]), tw: window.__lab.shape().twist }));
      const live = smp.find(q => Math.abs(q.t - r.t) < 1e-6); if (!live) continue; matched++;
      for (const i of [2, 3]) worst = Math.max(worst, Math.hypot(r.j[i][0] - live.j[i][0], r.j[i][1] - live.j[i][1])); worstTw = Math.max(worstTw, Math.abs(r.tw - live.tw)); }
    check(`N1 리플레이의 무릎 표시 자리 = 같은 시각에 실제로 그린 자리(CPU ${thr}배 느리게)`, matched >= 3 && worst < 0.5 && worstTw < 0.01, `견준 시각 ${matched}곳 · 무릎 최대 차이 ${worst.toFixed(2)} 논리 px · 골반 돌림 최대 차이 ${worstTw.toFixed(3)}`, { matched, worst, worstTw });
    await pg.keyboard.press('KeyY'); await wait(pg, 250); const post = await lab(pg, () => ({ tw: window.__lab.shape().twist, j: window.__lab.shape().joints.map(q => [q.x, q.y]) }));
    if (thr === 1) { const d = Math.max(...[2, 3].map(i => Math.hypot(post.j[i][0] - preShape.j[i][0], post.j[i][1] - preShape.j[i][1])));
      check('N1 리플레이를 닫으면 끝난 순간의 표시 자세로 돌아온다', d < 0.5 && Math.abs(post.tw - preShape.tw) < 0.01, `무릎 차이 ${d.toFixed(2)}px · 골반 ${Math.abs(post.tw - preShape.tw).toFixed(3)}`);
      await pg.keyboard.press('KeyR'); await pg.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); const nw = await lab(pg, () => ({ turn: window.__lab.shape().turn, want: [0, 1, 2, 3].map(i => window.__lab.bendTurn(i)), tw: window.__lab.shape().twist, tww: window.__lab.pelvisTwist(), t: window.__lab.s.t }));
      const dt = Math.max(...nw.turn.map((v, i) => Math.abs(v - nw.want[i])));
      check('N1 새 시도는 지난 시도의 표시 자세를 끌고 오지 않는다(지금 자세의 값에서 출발)', dt < 0.05 && Math.abs(nw.tw - nw.tww) < 0.1 && Math.abs(nw.tw - nw.tww) < 0.25 * Math.abs(preShape.tw - nw.tww), `시도 시작 ${nw.t.toFixed(3)}초 뒤 · 무릎 방향 차이 ${dt.toFixed(3)} · 골반 ${Math.abs(nw.tw - nw.tww).toFixed(3)} · 지난 시도 끝 골반 ${preShape.tw.toFixed(3)}`); }
    await pg.context().close();
  }

  // ── N2. 발 미리보기는 실제로 고른 발의 판정인가
  { const pg = await open('?chart=off'); let spot = null, stn = null;
    for (const k of ['1', '3', '2', '4']) { await pg.keyboard.press('Digit' + k); await wait(pg, 900); spot = await lab(pg, () => { const S = window.__lab.s, C = PH.C, reach = CTRL.footReach ? (i, x, y) => CTRL.footReach(S, i, x, y).ok : (i, x, y) => { const hj = PH.rootPos(S, i), lb = S.limb[i], d = Math.hypot(x - hj.x, y - hj.y); return d <= lb.max * 0.97 && PH.hipAngle((S.p[0].x - S.p[1].x) / C.T, (S.p[0].y - S.p[1].y) / C.T, lb, x - hj.x, y - hj.y).over <= 0; };
      for (let x = 40; x < 600; x += 4) for (let y = 300; y < 560; y += 4) { const only = (x, y) => { const fa = CTRL.footAim(S, x, y); return fa && reach(2, fa.x, fa.y) && !reach(3, fa.x, fa.y); }; if ([[0, 0], [-3, -3], [3, -3], [-3, 3], [3, 3]].every(([u, w]) => only(x + u, y + w))) { const fa = CTRL.footAim(S, x, y); return { x, y, fx: fa.x, fy: fa.y }; } } return null; }); if (spot) { stn = k; break; } } // 왼발만 닿는 자리가 있는 시작 자세를 고른다 // 둘레 3px도 같은 판정인 자리
    if (!spot) check('N2 시험 자리 찾기', false, '왼발만 닿는 자리를 못 찾음');
    else { const q = await g2s(pg, spot.x - (-30), spot.y - 130); await pg.mouse.move(q[0], q[1], { steps: 4 }); await wait(pg, 150); await pg.keyboard.down('ShiftLeft'); await wait(pg, 200);
      const pre = await lab(pg, () => window.__lab.footPreview ? window.__lab.footPreview() : null);
      check('N2 발을 고르기 전: 미리보기가 발마다 닿는지 구분한다(이 자리 = 왼발만)', !!pre && pre.length === 1 && !pre[0].selected && pre[0].ok.length === 1 && pre[0].ok[0] === 2, pre ? `시작 자세 ${stn} · ` + JSON.stringify(pre.map(p => ({ ok: p.ok, sel: p.selected }))) : '고치기 전 빌드: 발 구분 없이 둘 중 하나만 닿아도 보라색(확인 창구 없음)', { spot, pre });
      await pg.keyboard.press('KeyE'); await wait(pg, 300); // Shift를 누른 채 E = 오른발 직접 보내기
      const sel = await lab(pg, () => ({ fp: window.__lab.footPreview ? window.__lab.footPreview() : null, act: window.__lab.ctrlState().act[3], man: window.__lab.ctrlState().manual[3] }));
      const oldShows = true; // 고치기 전 화면: can = [왼발, 오른발].some(...) → 왼발이 닿으므로 보라색
      check('N2 오른발을 보낸 뒤: 미리보기는 오른발 하나의 판정이다(오른발은 닿지 않음 → 보라색이 아님)', !!sel.fp && sel.act && sel.man && sel.fp.length === 1 && sel.fp[0].selected && sel.fp[0].feet[0] === 3 && sel.fp[0].ok.length === 0, sel.fp ? JSON.stringify(sel.fp.map(p => ({ feet: p.feet, ok: p.ok, sel: p.selected }))) : `고치기 전 빌드: 오른발을 보내는 중(act ${sel.act}, 직접 ${sel.man})인데 화면은 왼발 판정으로 보라색(${oldShows})`, sel);
      await pg.keyboard.up('ShiftLeft'); await wait(pg, 40); const after = await lab(pg, () => window.__lab.footPreview ? window.__lab.footPreview() : null);
      check('N2 발 조종 키를 떼도 보내는 발과 그 목표의 표시가 남는다', !!after && after.length === 1 && after[0].feet[0] === 3 && Math.abs(after[0].x - sel.fp[0].x) < 0.5, after ? JSON.stringify(after.map(p => ({ feet: p.feet, x: Math.round(p.x) }))) : '확인 창구 없음'); }
    // 양발이 닿는 자리
    await pg.keyboard.press('KeyX'); await pg.keyboard.press('Digit3'); await wait(pg, 900); const q2 = await g2s(pg, 300 + 30, 470 - 130); await pg.mouse.move(q2[0], q2[1], { steps: 3 }); await pg.keyboard.down('ShiftLeft'); await wait(pg, 200);
    const both = await lab(pg, () => window.__lab.footPreview ? window.__lab.footPreview() : null); await pg.keyboard.up('ShiftLeft');
    check('N2 양발이 닿는 자리는 두 발 모두 표시', !!both && both.length === 1 && both[0].ok.length === 2, both ? JSON.stringify(both.map(p => p.ok)) : '확인 창구 없음');
    await pg.context().close(); }

  // ── N3. 로그의 성공 시각 = 목표에 닿은 시각(결과 카드가 뜬 시각이 아님). 누르면 그 시각으로 간다
  { const pg = await open(); for (let i = 0; i < 4; i++) { await pg.keyboard.press('KeyO'); await wait(pg, 140); }
    await L4(pg, 470); await wait(pg, 1900); const e = await lab(pg, () => window.__lab.practice().ended), lg = await lab(pg, () => window.__lab.log()), ok = lg.items.filter(q => q.kind === 'ok' && q.att === lg.att).pop();
    check('N3 성공 로그의 시각 = 목표에 닿은 시각(결과 카드 시각이 아님)', !!ok && e.kind === 'ok' && Math.abs(ok.t - e.okTime) < 0.005, ok ? `로그 ${ok.t.toFixed(3)}초 · 목표에 닿은 시각 ${e.okTime.toFixed(3)}초 · 결과 카드 ${(e.t - e.t0).toFixed(3)}초` : '성공 로그 없음', { log: ok && ok.t, okTime: e.okTime, card: e.t - e.t0 });
    await pg.keyboard.press('KeyY'); await wait(pg, 400); if ((await lab(pg, () => window.__lab.practice().rp.playing))) await pg.keyboard.press('Space'); await wait(pg, 200);
    const hit = await lab(pg, () => window.__lab.practice().hits.filter(h => h.id.startsWith('log@')).map(h => ({ ...h, t: +h.id.split('@')[2] })));
    const hOk = hit.find(h => ok && Math.abs(h.t - ok.t) < 1e-6); if (hOk) { await pg.mouse.click((hOk.x + 40) * K, (hOk.y + hOk.h / 2) * K); await wait(pg, 250); }
    const rp = await lab(pg, () => window.__lab.practice().rp);
    check('N3 리플레이에서 성공 로그를 누르면 목표에 닿은 시각으로 간다', !!hOk && Math.abs((rp.t - rp.from) - e.okTime) < 0.02, hOk ? `간 시각 ${(rp.t - rp.from).toFixed(3)}초 · 목표에 닿은 시각 ${e.okTime.toFixed(3)}초` : '누를 수 있는 성공 로그 없음');
    await pg.context().close(); }
  // 기록 범위 밖(?trackmax=1): 로그는 남기되 누를 수 없다
  { const pg = await open('?trackmax=1'); for (let i = 0; i < 4; i++) { await pg.keyboard.press('KeyO'); await wait(pg, 140); }
    await L4(pg, 470); await wait(pg, 1900); await pg.keyboard.press('KeyY'); await wait(pg, 400); if ((await lab(pg, () => window.__lab.practice().rp.playing))) await pg.keyboard.press('Space'); await wait(pg, 200);
    const st = await lab(pg, () => { const L = window.__lab, p = L.practice(), lg = L.log(), t0 = L.lesson().rec.t0; return { end: p.rp.to - p.rp.from, items: lg.items.filter(q => q.att === lg.att && q.t !== null).map(q => q.t), hits: p.hits.filter(h => h.id.startsWith('log@')).map(h => ({ ...h, t: +h.id.split('@')[2] })) }; });
    const outside = st.items.filter(t => t > st.end + 1e-6), outHits = st.hits.filter(h => h.t > st.end + 1e-6), inHits = st.hits.filter(h => h.t <= st.end + 1e-6);
    check('N3 재생 기록이 1초뿐일 때: 기록 밖 로그는 남지만 누를 수 있게 등록되지 않는다', outside.length > 0 && outHits.length === 0, `기록 끝 ${st.end.toFixed(3)}초 · 기록 밖 로그 ${outside.length}건(${outside.map(t => t.toFixed(2)).join(', ')}) · 그중 누를 수 있게 등록된 것 ${outHits.length}건`, st);
    let moved = null; if (outHits.length) { const h = outHits[0], b0 = await lab(pg, () => window.__lab.practice().rp.t); await pg.mouse.click((h.x + 40) * K, (h.y + h.h / 2) * K); await wait(pg, 250); moved = (await lab(pg, () => window.__lab.practice().rp.t)) - b0; }
    check('N3 (고치기 전 재현용) 기록 밖 로그를 눌러도 그 사건으로 가지 못한다 → 고친 뒤에는 누를 수 없다', outHits.length === 0, moved === null ? '누를 수 있는 기록 밖 로그 없음' : `눌렀더니 재생 시각이 ${moved.toFixed(3)}초 움직였지만 사건 시각에는 가지 못함(기록 끝에서 멈춤)`);
    check('N3 기록 안의 로그는 그대로 누를 수 있다', inHits.length === st.items.filter(t => t <= st.end + 1e-6).length, `기록 안 로그 ${st.items.filter(t => t <= st.end + 1e-6).length}건 · 등록 ${inHits.length}건`);
    await pg.context().close(); }
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
  console.log('실패', fail); await b.close(); process.exit(fail ? 1 : 0);
})();
