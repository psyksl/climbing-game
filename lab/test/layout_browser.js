// 화면 나누기(v0.12.0)를 실제 브라우저에서 확인한다: 차트 구역과 플레이 구역, 경계선으로 크기 바꾸기, 구역을 끌어 다른 변에 붙이기,
// 구역 크기는 그대로 두고 줄·시간축이 줄어드는지, 열 줄(모든 액션키)이 구분되는 크기인지, 옆의 반투명 키 안내와 가리기, 구역을 옮겨도 조준이 맞는지.
// 사용: node test/layout_browser.js [스크린샷 폴더]. 여기의 입력은 모두 스크립트가 넣는다(사람 손 아님)
'use strict';
const { chromium } = require('playwright'), path = require('path');
const url = 'file://' + path.join(__dirname, '..', 'climb_lab.html'), out = process.argv[2];
(async () => {
  const b = await chromium.launch(); let fail = 0; const check = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`); if (!c) fail++; };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }), pg = await ctx.newPage(), K = 1280 / 960, errs = []; pg.on('pageerror', e => errs.push(e.message));
  const shot = async n => { if (out) await pg.screenshot({ path: path.join(out, n + '.png') }); }, lab = f => pg.evaluate(f), wait = ms => pg.waitForTimeout(ms), press = async (k, ms = 100) => { await pg.keyboard.press(k); await wait(ms); };
  const view = () => lab(() => window.__lab.view()), chart = () => lab(() => window.__lab.chart()), prac = () => lab(() => window.__lab.practice());
  const mv = (x, y, o) => pg.mouse.move(x * K, y * K, o);                                    // 화면 좌표(960×540 기준)
  const g2s = async (x, y) => { const v = await view(); return [v.x0 + x * v.s, v.y0 + y * v.s]; }; // 게임 화면 좌표 → 지금 화면의 자리
  const gmv = async (x, y, o) => { const q = await g2s(x, y); return mv(q[0], q[1], o); }, gclick = async (x, y, o) => { const q = await g2s(x, y); await mv(q[0], q[1], { steps: 4 }); await wait(120); return pg.mouse.click(q[0] * K, q[1] * K, o); };
  const dragTo = async (x0, y0, x1, y1, mid) => { await mv(x0, y0); await wait(60); await pg.mouse.down(); await mv(x1, y1, { steps: 8 }); await wait(80); const m = mid ? await mid() : null; await pg.mouse.up(); await wait(150); return m; };
  const DOCK_AT = { left: [60, 270], right: [900, 270], top: [480, 40], bottom: [480, 500] };
  await pg.goto(url); await wait(700);

  // ── 1. 처음 상태: 아래에 차트 구역, 위에 플레이 구역. 차트 구역의 크기 = 열 줄이 구분되는 가장 작은 높이
  let v = await view(), c = await chart();
  check('처음에는 차트 구역이 아래에 붙어 있고, 두 구역이 화면을 빈틈없이 나눈다', c.mode === 'on' && v.dock === 'bottom' && v.play.y === 0 && v.chart.y === v.play.h && v.play.h + v.chart.h === 540 && v.play.w === 960, `플레이 ${v.play.w}×${v.play.h} · 차트 ${v.chart.w}×${v.chart.h}`);
  check('아래 구역의 처음 크기 = 가장 작은 크기 = 머리줄 18 + 눈금 13 + 여백 4 + 열 줄 × 15', v.fit === 18 + 13 + 4 + 10 * 15 && v.chart.h === v.fit && v.lim.bottom[0] === v.fit, `${v.fit}`);
  check('게임 화면은 비율을 지켜 플레이 구역에 줄여 넣는다', Math.abs(v.s - v.play.h / 540) < 1e-9 && Math.abs(v.x0 - (960 - 960 * v.s) / 2) < 1e-9 && v.y0 === 0, `배율 ${(v.s * 100).toFixed(1)}%`);
  await shot('01_아래_자유연습');

  // ── 2. 네 방향 모두: 조준이 맞는다(마우스 자리 = 조준점), 과제 4를 마우스로 해서 성공한다
  const aimAt = async () => { await gmv(300, 300, { steps: 3 }); await wait(120); await gmv(520, 260, { steps: 3 }); await wait(150); const q = await lab(() => ({ aim: [window.__lab.aim.x, window.__lab.aim.y], ox: window.__lab.view().ox, oy: window.__lab.view().oy })); return Math.hypot(q.aim[0] - (520 + q.ox), q.aim[1] - (260 + q.oy)) * (await view()).s; }; // 화면에서의 오차(논리 좌표 px)
  const tryL4 = async hold => { await gmv(575, 218, { steps: 6 }); await wait(200); await gclick(575, 218, { button: 'right' }); await wait(900); await pg.keyboard.down('Space'); await wait(140); const q = await g2s(575, 218); await pg.mouse.click(q[0] * K, q[1] * K); await wait(hold - 140); await pg.keyboard.up('Space'); };
  for (let i = 0; i < 4; i++) await press('KeyO', 140);
  const res = {};
  for (const d of ['bottom', 'left', 'top', 'right']) {
    v = await view(); if (v.dock !== d) { await press('KeyJ', 200); v = await view(); }
    await press('KeyR', 300); const err = await aimAt(); await tryL4(470); await wait(1900); const p = await prac();
    res[d] = { dock: v.dock, s: v.s, err, kind: p.ended && p.ended.kind, ok: p.ended && p.ended.okTime }; await shot(`02_과제4_${d}`);
  }
  check('차트 자리 키(J)로 아래 → 왼쪽 → 위 → 오른쪽', ['bottom', 'left', 'top', 'right'].every(d => res[d].dock === d));
  check('네 방향 모두 마우스 자리에 조준점이 온다(화면에서 1px 미만: 마우스 한 칸과 떨림 거르기 0.5px 안)', Object.values(res).every(r => r.err < 1), Object.entries(res).map(([d, r]) => `${d} ${r.err.toFixed(2)}px(게임 화면 ${(r.s * 100).toFixed(0)}%)`).join(' · '));
  check('네 방향 모두 과제 4를 마우스로 해서 성공한다(스크립트 입력)', Object.values(res).every(r => r.kind === 'ok'), Object.entries(res).map(([d, r]) => `${d} ${r.kind}${r.ok ? ' ' + r.ok.toFixed(2) + '초' : ''}`).join(' · '));
  { const p = await prac(); v = await view(); check('결과 카드는 플레이 구역 안에 놓인다', !!p.ended.rect && p.ended.rect.x >= v.play.x && p.ended.rect.x + p.ended.rect.w <= v.play.x + v.play.w && p.ended.rect.y >= v.play.y && p.ended.rect.y + p.ended.rect.h <= v.play.y + v.play.h, JSON.stringify(p.ended.rect)); }
  // 리플레이 도구: 플레이 구역 안, 차트가 위에 붙어 있으면 위쪽, 그 밖에는 아래쪽
  { await press('KeyY', 300); let p = await prac(); v = await view(); const inPlay = q => q.x >= v.play.x && q.x + q.w <= v.play.x + v.play.w && q.y >= v.play.y && q.y + q.h <= v.play.y + v.play.h;
    const okR = v.dock === 'right' && inPlay(p.tools) && p.tools.y > 400; await press('KeyJ', 250); await press('KeyJ', 250); await press('KeyJ', 250); p = await prac(); v = await view(); await shot('03_리플레이_위_붙임');
    check('리플레이 도구는 플레이 구역 안: 차트가 위에 붙으면 위쪽, 그 밖에는 아래쪽', okR && v.dock === 'top' && inPlay(p.tools) && p.tools.y - v.play.y < 10, `위 붙임: 도구 y ${Math.round(p.tools.y)} · 플레이 구역 y ${v.play.y}`);
    await press('KeyJ', 250); await press('KeyY', 200); }

  // ── 3. 과제의 목표(시범이 겨누는 곳)는 어느 쪽에 붙여도 플레이 구역 안에 보이고 과제 카드에 가려지지 않는다
  { const bad = [], under = []; await press('KeyR', 200); for (let i = 0; i < 2; i++) await press('KeyO', 140); // 과제 4 → 6 → 자유 → 과제 1부터
    await press('KeyO', 140); for (let d = 0; d < 4; d++) { v = await view();
      for (let li = 0; li < 6; li++) { await press('KeyO', 160); const q = await lab(() => { const L = window.__lab, l = LESSON.LIST[L.lesson().i], vw = L.view(), card = L.practice().lessonCard, gd = vw.guideRect, inR = (r, p) => !!r && p[0] >= r.x && p[0] <= r.x + r.w && p[1] >= r.y && p[1] <= r.y + r.h;
          return { id: l && l.id, pts: l ? l.steps.filter(st => st[1] === 'aim').map(st => { const p = L.toScreen(st[2], st[3]); return { p, out: p[0] < vw.play.x + 4 || p[0] > vw.play.x + vw.play.w - 4 || p[1] < vw.play.y + 4 || p[1] > vw.play.y + vw.play.h - 4, card: inR(card, p), guide: inR(gd, p) }; }) : [] }; });
        for (const t of q.pts) { if (t.out || t.card) bad.push(`${v.dock}/${q.id}(${Math.round(t.p[0])},${Math.round(t.p[1])})${t.out ? ' 밖' : ' 카드 밑'}`); if (t.guide) under.push(`${v.dock}/${q.id}`); } }
      await press('KeyO', 160); await press('KeyJ', 250); await press('KeyO', 160); }
    check('여섯 과제 × 네 방향: 시범이 겨누는 곳이 모두 플레이 구역 안이고 과제 카드에 가려지지 않는다', bad.length === 0, bad.join(' '));
    check('반투명 키 안내 밑에 들어가는 목표도 없다', under.length === 0, [...new Set(under)].join(' '));
    for (let g = 0; g < 8 && (await lab(() => window.__lab.lesson().i)) >= 0; g++) await press('KeyO', 160); v = await view(); if (v.dock !== 'bottom') for (let g = 0; g < 4 && (await view()).dock !== 'bottom'; g++) await press('KeyJ', 200); }

  // ── 4. 경계선: 가리키면 크기 바꾸기 마우스 모양, 끌면 크기가 따라오고 최소·최대에서 멈춘다. 경계선 위에서 휠을 굴려도 바뀐다
  await press('KeyR', 300); v = await view();
  await mv(300, v.split.y + 2); await wait(100); let p = await prac(); check('아래 붙임: 경계선에서 위아래 크기 바꾸기 마우스 모양', p.cursor === 'ns-resize' && p.capture, p.cursor);
  await dragTo(300, v.split.y, 300, v.split.y - 70); let v2 = await view(); check('경계선을 위로 70 끌면 차트 구역이 70 커진다', Math.abs(v2.chart.h - (v.chart.h + 70)) < 1.5 && v2.play.h + v2.chart.h === 540, `${v.chart.h} → ${v2.chart.h.toFixed(1)}`); await shot('04_아래_키움');
  await dragTo(300, v2.split.y, 300, 20); v2 = await view(); check('끝까지 올려도 가장 큰 크기에서 멈춘다(플레이 구역이 남는다)', v2.chart.h === v2.lim.bottom[1] && v2.play.h >= 200, `${v2.chart.h}`);
  await mv(300, v2.split.y); await wait(80); await pg.mouse.wheel(0, 100); await wait(150); const w1 = (await view()).chart.h; await pg.mouse.wheel(0, -100); await wait(150); const w2 = (await view()).chart.h;
  check('경계선 위에서 휠: 굴린 쪽으로 경계선이 간다(아래로 = 차트 구역이 작아짐, 위로 = 커짐). 마우스를 움직이기 전에는 이어서 굴릴 수 있다', w1 === v2.chart.h - 12 && w2 === v2.chart.h, `${v2.chart.h} → ${w1} → ${w2}`);
  await dragTo(300, w2 ? (await view()).split.y : 0, 300, 538); v2 = await view(); check('끝까지 내려도 가장 작은 크기(열 줄이 구분되는 높이)에서 멈춘다', v2.chart.h === v2.fit, `${v2.chart.h}`);
  { const a0 = await lab(() => window.__lab.lesson().rec.taps.length); check('경계선과 차트 구역을 끄는 동안 손은 움직이지 않았다', a0 === 0, `보낸 손 ${a0}개`); }

  // ── 5. 구역을 잡아 화면의 다른 변으로 끌어다 놓으면 그 변에 붙는다. 키 안내는 왼쪽, 차트가 왼쪽이면 오른쪽
  const grab = z => [z.x + 30, z.y + 10];
  { v = await view(); const g0 = grab(v.chart); const tiny = await dragTo(g0[0], g0[1], g0[0] + 8, g0[1] - 6, view); check('조금 움직인 것은 옮기기로 보지 않는다(자리 그대로)', tiny.drag && tiny.drag.kind === 'dock' && tiny.drag.target === null && (await view()).dock === 'bottom'); }
  const moved = {};
  for (const d of ['right', 'top', 'left', 'bottom']) { v = await view(); const g0 = grab(v.chart), mid = await dragTo(g0[0], g0[1], DOCK_AT[d][0], DOCK_AT[d][1], async () => { const q = await view(); if (d === 'left') await shot('05_끌어다_놓기_미리보기'); return q; });
    const q = await view(); moved[d] = { target: mid.drag && mid.drag.target, before: mid.dock, after: q.dock, guideRight: q.guideRect && q.guideRect.right, gx: q.guideRect && q.guideRect.x, play: q.play, chart: q.chart }; await shot(`06_붙임_${d}`); }
  check('끄는 동안 놓을 자리가 정해지고(아직 옮기지 않음), 놓으면 그 변에 붙는다: 오른쪽 → 위 → 왼쪽 → 아래', Object.entries(moved).every(([d, m]) => m.target === d && m.before !== d && m.after === d), Object.entries(moved).map(([d, m]) => `${m.before}→${m.after}`).join(' · '));
  check('옆에 붙으면 화면을 좌우로 나눈다(차트 구역은 화면 높이 전체)', moved.left.chart.h === 540 && moved.left.chart.x === 0 && moved.left.play.x === moved.left.chart.w && moved.right.chart.x + moved.right.chart.w === 960 && moved.right.play.x === 0);
  check('키 안내는 플레이 구역의 왼쪽, 차트 구역이 왼쪽이면 오른쪽', !moved.right.guideRight && !moved.top.guideRight && !moved.bottom.guideRight && moved.left.guideRight === true && moved.left.gx > moved.left.play.x + moved.left.play.w / 2 && moved.bottom.gx < 480, Object.entries(moved).map(([d, m]) => `${d}: ${m.guideRight ? '오른쪽' : '왼쪽'}`).join(' · '));
  // 옆 붙임에서도 경계선
  { await press('KeyJ', 250); v = await view(); await mv(v.split.x + 1, 400); await wait(100); p = await prac(); const cur = p.cursor; await dragTo(v.split.x, 400, v.split.x + 80, 400); v2 = await view(); const grown = v2.chart.w; await dragTo(v2.split.x, 400, 950, 400); const mx = (await view()).chart.w; await dragTo((await view()).split.x, 400, 5, 400); const mn = (await view()).chart.w;
    check('왼쪽 붙임: 경계선은 좌우 크기 바꾸기, 끌면 따라오고 최소·최대에서 멈춘다', cur === 'ew-resize' && Math.abs(grown - (v.chart.w + 80)) < 1.5 && mx === v.lim.left[1] && mn === v.lim.left[0], `${v.chart.w} → ${grown.toFixed(0)} · 최대 ${mx} · 최소 ${mn}`); await shot('07_왼쪽_가장_좁게');
    await pg.reload(); await wait(700); v2 = await view(); check('다시 실행해도 붙은 쪽과 크기가 남는다', v2.dock === 'left' && v2.chart.w === mn, `${v2.dock} ${v2.chart.w}`);
    for (let g = 0; g < 4 && (await view()).dock !== 'bottom'; g++) await press('KeyJ', 200); }

  // ── 6. 차트 구역의 크기는 그대로이고, 줄이 늘수록 줄 높이·키캡이 줄어든다. 열 줄(모든 액션키)이 다 나와도 줄마다 구분된다
  await press('KeyR', 300); await gmv(400, 150); await wait(100);
  await pg.keyboard.down('KeyW'); await wait(220); await pg.keyboard.up('KeyW'); await wait(120); const c1 = await chart();
  for (const k of ['KeyA', 'KeyS']) { await pg.keyboard.down(k); await wait(220); await pg.keyboard.up(k); await wait(80); } const c3 = await chart();
  await pg.keyboard.down('KeyD'); await wait(220); await pg.keyboard.up('KeyD'); await wait(80); await press('KeyX', 150); await pg.keyboard.down('Space'); await wait(200); await pg.keyboard.up('Space'); await wait(500);
  await gclick(257, 170); await wait(700); await gclick(355, 170, { button: 'right' }); await wait(700);
  await pg.keyboard.down('ShiftLeft'); await gclick(310, 338); await wait(500); await gclick(345, 338, { button: 'right' }); await wait(100); await pg.keyboard.up('ShiftLeft'); await wait(500);
  const c10 = await chart(), ph = (await prac()); v = await view(); await shot('08_열_줄_아래'); if (out) await pg.screenshot({ path: path.join(out, '08z_열_줄_확대.png'), clip: { x: 0, y: v.chart.y * K, width: 640, height: v.chart.h * K } });
  const want = ['moveUp', 'moveLeft', 'moveDown', 'moveRight', 'cancel', 'power', 'limb0', 'limb1', 'limb2', 'limb3'], lanes = c10.heads.map(h => h.lane);
  check('차트에 나올 수 있는 줄은 열 가지이고, 모두 눌렀을 때 열 줄이 다 나온다(떨어지지 않고 하는 중)', ph.phase === 'live' && c10.n === 10 && want.every(k => lanes.includes(k)) && lanes.length === 10, lanes.join(' '));
  check('줄이 늘어도 차트 구역의 크기는 그대로다', [c1, c3, c10].every(q => q.rect.x === v.chart.x && q.rect.y === v.chart.y && q.rect.w === v.chart.w && q.rect.h === v.chart.h), `${c10.rect.w}×${c10.rect.h}`);
  check('줄이 늘수록 줄 높이가 준다: 1줄 50 → 3줄 50 → 열 줄 15', c1.n === 1 && c1.laneH === 50 && c3.n === 3 && c3.laneH === 50 && c10.laneH === 15 && c10.plot.h === 150, `${c1.laneH} → ${c3.laneH} → ${c10.laneH}`);
  { const hs = c10.heads, rows = hs.map(h => h.y + h.h / 2), inZone = hs.every(h => h.x >= v.chart.x && h.x + h.w <= c10.plot.x + 1 && h.y >= c10.plot.y - 0.5 && h.y + h.h <= c10.plot.y + c10.plot.h + 0.5);
    check('열 줄일 때: 줄 머리 키캡이 모두 제 줄 안에 있고 서로 겹치지 않으며 높이 13 이상(720p에서 17px)', inZone && rows.every((y, k) => !k || Math.abs(y - rows[k - 1] - 15) < 0.01) && hs.every(h => h.h >= 13), hs.map(h => `${h.lane} ${h.w.toFixed(0)}×${h.h.toFixed(1)}`).join(' · ')); }
  { const mk = ph.marks.filter(q => q.who === 'i'), byLane = k => mk.filter(q => q.lane === k), codes = k => byLane(k).map(q => q.codes.join('+')).join(',');
    check('줄마다 그때 누른 키의 시작 표식이 있다(취소 X, 발은 Shift + 클릭)', want.every(k => byLane(k).length >= 1) && codes('cancel') === 'KeyX' && codes('limb2') === 'ShiftLeft+Mouse0' && codes('limb3') === 'ShiftLeft+Mouse2' && codes('limb0') === 'Mouse0' && codes('limb1') === 'Mouse2' && codes('power') === 'Space', want.map(k => `${k}:${codes(k)}`).join(' ')); }
  { const r = await lab(() => { const rec = window.__lab.lesson().rec; return { presses: rec.presses, ev: rec.ev.filter(e => e[2] === 'cancel').length }; });
    check('취소는 기록에 실제 누른 키와 함께 남는다', r.presses.length === 1 && r.presses[0].id === 'cancel' && r.presses[0].code === 'KeyX' && r.ev === 1, JSON.stringify(r.presses)); }
  // 시간축: 기록이 길어지면 줄어들어 전체가 보인다
  check('기록이 길어지면 시간축이 줄어 전체가 보인다(0초부터 기록 끝까지)', c1.span === 4 && c10.view === 0 && c10.span > 4.5 && c10.end < c10.span && !c10.manual && c10.pps < c1.pps, `보이는 구간 4초 → ${c10.span.toFixed(2)}초(기록 끝 ${c10.end.toFixed(2)}초) · 1초 = ${c1.pps.toFixed(0)}px → ${c10.pps.toFixed(0)}px`);
  // 옆에 붙인 가장 좁은 차트에서도 열 줄
  { await press('KeyJ', 300); const cL = await chart(); v = await view(); await shot('09_열_줄_왼쪽_가장_좁게');
    check('왼쪽 가장 좁은 구역(240)에서도 열 줄이 다 나온다(화면 높이를 쓰므로 줄은 넉넉하다)', v.dock === 'left' && v.chart.w === 240 && cL.n === 10 && cL.laneH >= 40 && cL.heads.every(h => h.x >= 0 && h.x + h.w <= cL.plot.x + 1), `줄 높이 ${cL.laneH.toFixed(0)}`);
    for (let g = 0; g < 4 && (await view()).dock !== 'bottom'; g++) await press('KeyJ', 200); }

  // ── 7. 키 안내: 반투명, 키 안내 동작(K)으로 가리고 다시 보인다. 가린 상태도 저장된다
  { v = await view(); const bar = (await lab(() => window.__lab.keys())).filter(k => k.where === 'bar');
    check('키 안내는 반투명이고 플레이 구역 안에 있다(손 둘·발 둘·모으기)', !!v.guideRect && v.guideRect.alpha > 0.3 && v.guideRect.alpha < 0.8 && v.guideRect.x >= v.play.x && v.guideRect.y >= v.play.y && v.guideRect.y + v.guideRect.h <= v.play.y + v.play.h && new Set(bar.map(k => k.action)).size === 5, `불투명도 ${v.guideRect && v.guideRect.alpha} · ${[...new Set(bar.map(k => k.action))].join(' ')}`);
    await press('KeyK', 200); v2 = await view(); const bar2 = (await lab(() => window.__lab.keys())).filter(k => k.where === 'bar'); await shot('10_키안내_가림');
    check('키 안내 동작(K)으로 가린다', v2.guide === false && v2.guideRect === null && bar2.length === 0);
    await pg.reload(); await wait(700); check('가린 상태가 다시 실행해도 남는다', (await view()).guide === false);
    await press('KeyK', 200); check('다시 누르면 보인다', (await view()).guide === true && !!(await view()).guideRect);
    const names = await lab(() => ({ guide: ACT.name.guide, dock: ACT.name.dock, k: BIND.get('guide')[0], j: BIND.get('dock')[0], cf1: Object.keys(BIND.conflicts(1)).length, cf2: Object.keys(BIND.conflicts(2)).length, ph: BIND.phasesOf('guide').join(',') + '|' + BIND.phasesOf('dock').join(',') }));
    check('키 안내·차트 자리는 키 설정에서 바꿀 수 있는 동작이고 기본 배정에 겹침이 없다', names.guide === '키 안내' && names.dock === '차트 자리' && names.k === 'KeyK' && names.j === 'KeyJ' && names.cf1 === 0 && names.cf2 === 0, JSON.stringify(names)); }

  // ── 8. 차트 구역을 끄면 화면 전체가 플레이 구역(게임 화면 100%), 다시 켜면 그 자리·크기로
  { await press('KeyT', 200); v = await view(); c = await chart(); const e1 = await aimAt(); await shot('11_차트_끔');
    check('차트 구역 켬·끔 키(T)로 끄면 화면 전체가 플레이 구역', c.mode === 'off' && v.chart === null && v.s === 1 && v.play.w === 960 && v.play.h === 540 && e1 < 1, `게임 화면 ${(v.s * 100).toFixed(0)}% · 조준 오차 ${e1.toFixed(2)}px`);
    const off = c.off; await mv(off.x + off.w / 2, off.y + off.h / 2); await wait(80); await pg.mouse.down(); await wait(40); await pg.mouse.up(); await wait(200); v = await view();
    check('꺼져 있을 때의 작은 단추를 누르면 다시 켜진다(아래, 같은 크기)', !!off && v.dock === 'bottom' && !!v.chart && v.chart.h === v.fit); }
  // 차트 머리줄의 단추
  { const hit = async id => { const h = (await prac()).hits.find(q => q.id === id); if (!h) return false; await mv(h.x + h.w / 2, h.y + h.h / 2); await wait(60); await pg.mouse.down(); await wait(40); await pg.mouse.up(); await wait(200); return true; };
    const a = await hit('tl_dock'), d1 = (await view()).dock; const bq = await hit('tl_mode'), m1 = (await chart()).mode; await press('KeyT', 200); for (let g = 0; g < 4 && (await view()).dock !== 'bottom'; g++) await press('KeyJ', 200);
    check('차트 머리줄의 자리·끄기 단추', a && d1 === 'left' && bq && m1 === 'off' && (await chart()).mode === 'on' && (await view()).dock === 'bottom'); }

  // ── 9. 1920×1080에서도 같은 배치(논리 좌표가 같다)
  { const c2 = await b.newContext({ viewport: { width: 1920, height: 1080 } }), p2 = await c2.newPage(); await p2.goto(url); await p2.waitForTimeout(700); const q = await p2.evaluate(() => window.__lab.view());
    check('1920×1080에서도 같은 나눔(논리 좌표 기준)', q.dock === 'bottom' && q.chart.h === q.fit && q.play.h === 540 - q.fit);
    if (out) { for (let i = 0; i < 4; i++) { await p2.keyboard.press('KeyO'); await p2.waitForTimeout(140); } await p2.keyboard.press('KeyP'); await p2.waitForTimeout(4800); await p2.screenshot({ path: path.join(out, '12_1920x1080_아래.png') }); await p2.keyboard.press('KeyJ'); await p2.waitForTimeout(300); await p2.screenshot({ path: path.join(out, '13_1920x1080_왼쪽.png') }); }
    await c2.close(); }
  console.log('페이지 오류:', errs.join(';') || '없음', '| 실패', fail); await b.close(); process.exit(fail || errs.length ? 1 : 0);
})();
