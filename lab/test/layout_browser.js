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
  check('아래 구역의 처음 크기 = 열 줄이 다 보이는 높이(머리줄 18 + 눈금 13 + 여백 4 + 열 줄 × 15). 더 작게도 줄일 수 있다(80까지)', v.fit === 18 + 13 + 4 + 10 * 15 && v.chart.h === v.fit && v.lim.bottom[0] === 80, `처음 ${v.fit} · 가장 작게 ${v.lim.bottom[0]}`);
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
  // 리플레이 도구: 차트가 아래·왼쪽·위·오른쪽 어디에 붙어 있든 차트의 머리줄 바로 아래. 좁으면 다음 줄로 넘어간다
  { await press('KeyY', 300); const got = {}; for (let g = 0; g < 4; g++) { const p = await prac(), vw = await view(); got[vw.dock] = { t: p.tools, k: vw.chartPart, play: vw.play, hits: p.hits.filter(q => /^(rp_|replay$|retry$)/.test(q.id)) }; if (vw.dock === 'left') await shot('03_리플레이_왼쪽_도구_두줄'); if (vw.dock === 'bottom') await shot('03_리플레이_아래_도구'); await press('KeyJ', 250); }
    const inK = (q, r) => r.x >= q.k.x - 0.5 && r.x + r.w <= q.k.x + q.k.w + 0.5 && r.y >= q.k.y && r.y + r.h <= q.k.y + q.k.h;
    check('리플레이 도구는 어디에 붙어 있든 차트의 머리줄 바로 아래에 있다(게임 화면 위에 떠 있지 않다)', ['bottom', 'left', 'top', 'right'].every(d => got[d] && got[d].t && Math.abs(got[d].t.y - (got[d].k.y + 18)) < 0.5 && inK(got[d], got[d].t)), Object.entries(got).map(([d, q]) => `${d}: y ${q.t && Math.round(q.t.y)}(차트 y ${Math.round(q.k.y)})`).join(' · '));
    check('재생·뒤로·앞으로·빠르기·닫기·다시하기 단추가 모두 차트 안에 있다', Object.values(got).every(q => q.hits.length === 6 && q.hits.every(h => inK(q, h))), Object.entries(got).map(([d, q]) => `${d} ${q.hits.length}개`).join(' · '));
    check('넓은 차트에서는 한 줄, 옆에 붙인 좁은 차트에서는 다음 줄로 넘어간다', got.bottom.t.rows === 1 && got.top.t.rows === 1 && got.left.t.rows >= 2 && got.right.t.rows >= 2, Object.entries(got).map(([d, q]) => `${d} ${q.t.rows}줄`).join(' · '));
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
  await dragTo(300, (await view()).split.y, 300, 538); v2 = await view(); check('끝까지 내리면 아주 작게(80) 줄어든다', v2.chart.h === 80 && v2.lim.bottom[0] === 80, `${v2.chart.h}`);
  await dragTo(300, v2.split.y, 300, 540 - v2.fit); v2 = await view(); check('경계선을 끌어 처음 크기로 되돌린다', Math.abs(v2.chart.h - v2.fit) < 0.01, `${v2.chart.h}`);
  { const a0 = await lab(() => window.__lab.lesson().rec.taps.length); check('경계선과 차트 구역을 끄는 동안 손은 움직이지 않았다', a0 === 0, `보낸 손 ${a0}개`); }

  // ── 5. 구역을 잡아 화면의 다른 변으로 끌어다 놓으면 그 변에 붙는다. 키 안내는 왼쪽, 차트가 왼쪽이면 오른쪽
  const grab = z => [z.x + 30, z.y + 10];
  { v = await view(); const g0 = grab(v.chart); const tiny = await dragTo(g0[0], g0[1], g0[0] + 8, g0[1] - 6, view); check('조금 움직인 것은 옮기기로 보지 않는다(자리 그대로)', tiny.drag && tiny.drag.kind === 'dock' && tiny.drag.target === null && (await view()).dock === 'bottom'); }
  const moved = {};
  for (const d of ['right', 'top', 'left', 'bottom']) { v = await view(); const g0 = grab(v.chart), mid = await dragTo(g0[0], g0[1], DOCK_AT[d][0], DOCK_AT[d][1], async () => { const q = await view(); if (d === 'left') await shot('05_끌어다_놓기_미리보기'); return q; });
    const q = await view(); moved[d] = { target: mid.drag && mid.drag.target, before: mid.dock, after: q.dock, guideRight: q.guideRect && q.guideRect.right, gx: q.guideRect && q.guideRect.x, play: q.play, chart: q.chart }; await shot(`06_붙임_${d}`); }
  check('끄는 동안 놓을 자리가 정해지고(아직 옮기지 않음), 놓으면 그 변에 붙는다: 오른쪽 → 위 → 왼쪽 → 아래', Object.entries(moved).every(([d, m]) => m.target === d && m.before !== d && m.after === d), Object.entries(moved).map(([d, m]) => `${m.before}→${m.after}`).join(' · '));
  check('옆에 붙으면 화면을 좌우로 나눈다(차트 구역은 화면 높이 전체)', moved.left.chart.h === 540 && moved.left.chart.x === 0 && moved.left.play.x === moved.left.chart.w && moved.right.chart.x + moved.right.chart.w === 960 && moved.right.play.x === 0);
  check('키 안내는 플레이 구역의 왼쪽, 차트 구역이 왼쪽이면 오른쪽', !moved.right.guideRight && !moved.top.guideRight && !moved.bottom.guideRight && moved.left.guideRight === true && moved.left.gx > moved.left.play.x + 150 && moved.bottom.gx < 480, Object.entries(moved).map(([d, m]) => `${d}: ${m.guideRight ? '오른쪽' : '왼쪽'}`).join(' · '));
  // 옆 붙임에서도 경계선
  { await press('KeyJ', 250); v = await view(); await mv(v.split.x + 1, 400); await wait(100); p = await prac(); const cur = p.cursor; await dragTo(v.split.x, 400, v.split.x + 80, 400); v2 = await view(); const grown = v2.chart.w; await dragTo(v2.split.x, 400, 950, 400); const mx = (await view()).chart.w; await dragTo((await view()).split.x, 400, 5, 400); const mn = (await view()).chart.w;
    check('왼쪽 붙임: 경계선은 좌우 크기 바꾸기, 끌면 따라오고 최소·최대에서 멈춘다', cur === 'ew-resize' && Math.abs(grown - (v.chart.w + 80)) < 1.5 && mx === v.lim.left[1] && mn === v.lim.left[0], `${v.chart.w} → ${grown.toFixed(0)} · 최대 ${mx} · 최소 ${mn}`); await shot('07_왼쪽_가장_좁게');
    await pg.reload(); await wait(700); v2 = await view(); check('다시 실행해도 붙은 쪽과 크기가 남는다', v2.dock === 'left' && v2.chart.w === mn, `${v2.dock} ${v2.chart.w}`);
    for (let g = 0; g < 4 && (await view()).dock !== 'bottom'; g++) await press('KeyJ', 200); }

  // ── 6. 차트 구역의 크기는 그대로이고, 줄이 늘수록 줄 높이·키캡이 줄어든다. 열 줄(모든 액션키)이 다 나와도 줄마다 구분된다
  // 열 가지 동작을 모두 한 번씩: 몸 위·왼쪽·아래·오른쪽, 취소, 모으기, 왼손, 오른손, 왼발, 오른발(자유 연습의 시작 자세에서 제자리 입력). at = 중간에 차트 상태를 찍을 곳
  const tenLanes = async at => { await press('KeyR', 300); await gmv(400, 150); await wait(100); const got = {};
    await pg.keyboard.down('KeyW'); await wait(220); await pg.keyboard.up('KeyW'); await wait(120); if (at) got.c1 = await chart();
    for (const k of ['KeyA', 'KeyS']) { await pg.keyboard.down(k); await wait(220); await pg.keyboard.up(k); await wait(80); } if (at) got.c3 = await chart();
    await pg.keyboard.down('KeyD'); await wait(220); await pg.keyboard.up('KeyD'); await wait(80); await press('KeyX', 150); await pg.keyboard.down('Space'); await wait(200); await pg.keyboard.up('Space'); await wait(500);
    await gclick(257, 170); await wait(700); await gclick(355, 170, { button: 'right' }); await wait(700);
    await pg.keyboard.down('ShiftLeft'); await gclick(310, 338); await wait(500); await gclick(345, 338, { button: 'right' }); await wait(100); await pg.keyboard.up('ShiftLeft'); await wait(500); return got; };
  const { c1, c3 } = await tenLanes(true);
  const c10 = await chart(), ph = (await prac()); v = await view(); await shot('08_열_줄_아래'); if (out) await pg.screenshot({ path: path.join(out, '08z_열_줄_확대.png'), clip: { x: 0, y: v.chart.y * K, width: 640, height: v.chart.h * K } });
  const want = ['moveUp', 'moveLeft', 'moveDown', 'moveRight', 'cancel', 'power', 'limb0', 'limb1', 'limb2', 'limb3'], lanes = c10.heads.map(h => h.lane);
  check('차트에 나올 수 있는 줄은 열 가지이고, 모두 눌렀을 때 열 줄이 다 나온다(떨어지지 않고 하는 중)', ph.phase === 'live' && c10.n === 10 && want.every(k => lanes.includes(k)) && lanes.length === 10, lanes.join(' '));
  check('줄이 늘어도 차트의 크기는 그대로다', [c1, c3, c10].every(q => q.rect.x === v.chartPart.x && q.rect.y === v.chartPart.y && q.rect.w === v.chartPart.w && q.rect.h === v.chartPart.h) && c10.scrollMax === 0, `${c10.rect.w}×${c10.rect.h}`);
  check('줄이 늘수록 줄 높이가 준다: 1줄 50 → 3줄 50 → 열 줄 15', c1.n === 1 && c1.laneH === 50 && c3.n === 3 && c3.laneH === 50 && c10.laneH === 15 && c10.plot.h === 150 && c10.heads.every(h => h.shown), `${c1.laneH} → ${c3.laneH} → ${c10.laneH}`);
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
    check('왼쪽 가장 좁은 구역(180)에서도 열 줄이 다 나온다(화면 높이를 쓰므로 줄은 넉넉하다)', v.dock === 'left' && v.chart.w === 180 && cL.n === 10 && cL.laneH >= 30 && cL.scrollMax === 0 && cL.heads.every(h => h.x >= 0 && h.x + h.w <= cL.plot.x + 1), `줄 높이 ${cL.laneH.toFixed(0)}`);
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

  // ── 9. 차트를 아주 작게: 줄이 다 들어가지 않으면 차트 안에서 휠로 줄을 내려 본다(열 줄 기록이 남아 있는 상태)
  { await tenLanes(); v = await view(); await dragTo(300, v.split.y, 300, 538); v = await view(); let cs = await chart(); await shot('14_아주_작게_줄_내려보기');
    const shownOf = q => q.heads.filter(h => h.shown).map(h => h.lane);
    check('가장 작은 구역(80)에서는 줄 높이를 15로 지키고 나머지 줄은 내려서 본다', v.chart.h === 80 && cs.n === 10 && cs.laneH === 15 && cs.scrollMax > 0 && shownOf(cs).length >= 2 && shownOf(cs).length < 10 && shownOf(cs)[0] === 'moveUp', `보이는 줄 ${shownOf(cs).join(' ')} · 내려 볼 길이 ${cs.scrollMax.toFixed(0)}`);
    await mv(cs.plot.x + 80, cs.plot.y + cs.plot.h / 2); await wait(80); await pg.mouse.wheel(0, 100); await wait(120); await pg.mouse.wheel(0, 100); await wait(120); const cs2 = await chart();
    check('줄 칸에서 휠을 굴리면 줄이 내려간다(시간축과 게임 화면 배율은 건드리지 않는다)', cs2.scroll === 30 && !cs2.manual && shownOf(cs2)[0] !== 'moveUp' && (await view()).s === v.s, `${cs.scroll} → ${cs2.scroll} · 보이는 줄 ${shownOf(cs2).join(' ')}`);
    for (let i = 0; i < 12; i++) { await pg.mouse.wheel(0, 100); await wait(40); } await wait(100); const cs3 = await chart(); check('끝까지 내리면 마지막 줄(오른발)이 보이고 더 내려가지 않는다', cs3.scroll === cs3.scrollMax && shownOf(cs3).includes('limb3'), `보이는 줄 ${shownOf(cs3).join(' ')}`);
    await mv(cs.plot.x + 80, cs3.lanesTop - 6); await wait(80); const spB = (await chart()).span; await pg.mouse.wheel(0, -100); await wait(150); const cs4 = await chart(); check('눈금 줄 위에서 휠은 시간축 확대(줄은 그대로)', cs4.manual && cs4.span < spB && cs4.scroll === cs3.scroll, `${spB.toFixed(2)} → ${cs4.span.toFixed(2)}초`);
    await press('Backslash', 100); v = await view(); await dragTo(300, v.split.y, 300, 540 - v.fit); cs = await chart(); check('다시 키우면 열 줄이 모두 보인다', cs.scrollMax === 0 && shownOf(cs).length === 10); }

  // ── 10. 게임 화면 위에서 휠: 마우스 자리를 기준으로 확대·축소. 차트 위의 휠과 섞이지 않는다
  { await press('KeyR', 300); v = await view(); // 몸(가슴) 자리를 가리킨 채 확대한다
    const ms = await lab(() => { const L = window.__lab; return L.toScreen(L.s.p[0].x, L.s.p[0].y); }); await mv(ms[0], ms[1]); await wait(120); const w0 = await lab(() => { const L = window.__lab, m = G.input.mouse; return L.toWorld(m.x, m.y); }), sp0 = (await chart()).span;
    for (let i = 0; i < 4; i++) { await pg.mouse.wheel(0, -100); await wait(90); } await wait(120); let z = await view(); const w1 = await lab(() => { const L = window.__lab, m = G.input.mouse; return { w: L.toWorld(m.x, m.y), aim: [L.aim.x, L.aim.y] }; }); await shot('15_게임화면_확대');
    check('게임 화면 위에서 휠을 위로 네 번: 배율이 1.1배씩 커진다(차트의 시간축은 그대로)', Math.abs(z.s - v.s * Math.pow(1.1, 4)) < 1e-6 && Math.abs(z.zoom - Math.pow(1.1, 4)) < 1e-6 && (await chart()).span === sp0, `${(v.s * 100).toFixed(0)}% → ${(z.s * 100).toFixed(0)}%`);
    check('구역보다 커진 쪽(세로)은 마우스 아래에 있던 자리가 그대로 있고, 구역보다 작은 쪽(가로)은 가운데에 놓인다. 조준점은 마우스 자리', Math.abs(w1.w[1] - w0[1]) * z.s < 1.5 && Math.abs(z.x0 + 480 * z.s - (z.play.x + z.play.w / 2)) < 0.5 && 540 * z.s > z.play.h && Math.hypot(w1.aim[0] - w1.w[0], w1.aim[1] - w1.w[1]) * z.s < 1, `세로 어긋남 ${(Math.abs(w1.w[1] - w0[1]) * z.s).toFixed(2)}px · 조준 어긋남 ${(Math.hypot(w1.aim[0] - w1.w[0], w1.aim[1] - w1.w[1]) * z.s).toFixed(2)}px`);
    for (let i = 0; i < 4; i++) await press('KeyO', 140); await tryL4(470); await wait(1900); let p2 = await prac(); const body = await lab(() => { const L = window.__lab, q = L.toScreen(L.s.p[0].x, L.s.p[0].y), vw = L.view(); return { in: q[0] > vw.play.x + 20 && q[0] < vw.play.x + vw.play.w - 20 && q[1] > vw.play.y + 20 && q[1] < vw.play.y + vw.play.h - 20, q }; }); await shot('16_확대한_채_과제4');
    check('확대한 채로 과제 4를 마우스로 해서 성공하고, 몸이 플레이 구역 안에 남는다(보기 자리가 따라간다)', p2.ended && p2.ended.kind === 'ok' && body.in, `${p2.ended && p2.ended.kind} · 몸의 화면 자리 (${Math.round(body.q[0])}, ${Math.round(body.q[1])})`);
    await pg.reload(); await wait(700); z = await view(); check('고른 배율이 다시 실행해도 남는다', Math.abs(z.zoom - Math.pow(1.1, 4)) < 1e-6, `${(z.s * 100).toFixed(0)}%`);
    const fitHit = (await prac()).hits.find(q => q.id === 'view_fit'); await press('KeyZ', 200); z = await view(); check('화면 맞춤 키(Z)로 맞춤 크기로 돌아간다(맞춤 단추는 배율을 바꿨을 때만 보인다)', !!fitHit && z.zoom === 1 && Math.abs(z.s - z.fitS) < 1e-9 && !(await prac()).hits.find(q => q.id === 'view_fit'), `${(z.s * 100).toFixed(0)}%`);
    const m2 = await g2s(430, 250); await mv(m2[0], m2[1]); await wait(80); for (let i = 0; i < 3; i++) { await pg.mouse.wheel(0, 100); await wait(90); } z = await view(); await shot('17_게임화면_축소');
    check('휠을 아래로: 작아지고 플레이 구역 가운데에 놓인다', z.zoom < 0.8 && Math.abs(z.x0 + 480 * z.s - (z.play.x + z.play.w / 2)) < 0.5, `${(z.s * 100).toFixed(0)}%`);
    await press('KeyZ', 200); const cz = await chart(); await mv(cz.plot.x + 100, cz.plot.y + 10); await wait(80); await pg.mouse.wheel(0, -100); await wait(150); z = await view(); check('차트 위의 휠은 게임 화면 배율을 바꾸지 않는다', z.zoom === 1 && (await chart()).span < cz.span); await press('Backslash', 100); await press('KeyR', 200); }

  // ── 11. 로그: 잠깐 떴다 사라지던 알림이 시각과 함께 남는다. 차트 구역을 한 번 더 나눈 칸(아래·위 붙임 = 차트 오른쪽, 옆 붙임 = 차트 아래)
  { const logS = () => lab(() => window.__lab.log()); for (let i = 0; i < 4; i++) await press('KeyO', 140); const hitBtn = async id => { const h = (await prac()).hits.find(q => q.id === id); if (!h) return false; await mv(h.x + h.w / 2, h.y + h.h / 2); await wait(60); await pg.mouse.down(); await wait(40); await pg.mouse.up(); await wait(200); return true; };
    await hitBtn('log_clear'); let lg = await logS(); v = await view();
    check('로그 칸은 차트 구역 안, 차트 오른쪽에 있다(아래 붙임)', lg.on && lg.items.length === 0 && !!v.logPart && v.logPart.x === v.chartPart.x + v.chartPart.w && v.logPart.y === v.chart.y && v.logPart.h === v.chart.h && v.chartPart.w + v.logPart.w === v.chart.w, `차트 ${v.chartPart.w} + 기록 ${v.logPart.w}`);
    await tryL4(150); await wait(2600); lg = await logS(); const pE = await prac(), fail = lg.items.find(q => q.kind === 'fail'), hintI = lg.items.find(q => q.kind === 'hint'), sep = lg.items[0]; await shot('18_알림기록_실패');
    check('떨어지면 까닭과 "바꿀 것"이 시각과 함께 남는다(결과 카드의 내용과 같다)', !!fail && fail.text === `떨어짐 — ${pE.ended.reason}` && Math.abs(fail.t - (pE.ended.t - pE.ended.t0)) < 0.02 && !!pE.ended.hint && !!hintI && hintI.text === pE.ended.hint && sep.kind === 'sep' && /연습 4 · 시도/.test(sep.text), `${fail && fail.t.toFixed(2)}초 "${fail && fail.text.slice(0, 40)}…" · "${hintI && hintI.text.slice(0, 30)}…"`);
    check('점프한 순간의 속도·각도·손 놓은 때도 남는다(용어: 이륙 → 점프)', lg.items.some(q => q.kind === 'info' && /^점프 속도 \d+ · 각도 -?\d+°/.test(q.text) && q.t > 0) && !lg.items.some(q => /이륙/.test(q.text)), (lg.items.find(q => q.kind === 'info') || {}).text);
    const n1 = lg.items.length; await wait(2500); check('기다려도 사라지지 않는다', (await logS()).items.length === n1);
    await press('KeyR', 300); await tryL4(470); await wait(1900); lg = await logS(); const seps = lg.items.filter(q => q.kind === 'sep'), okI = lg.items.find(q => q.kind === 'ok'), pO = await prac();
    check('다시 해도 앞 시도의 알림이 남고, 시도마다 구분 줄이 생긴다. 성공도 시각과 함께 남는다', seps.length === 2 && lg.items.indexOf(fail && lg.items.find(q => q.kind === 'fail')) < lg.items.indexOf(seps[1]) && !!okI && okI.text === `성공 — ${pO.ended.okTime.toFixed(2)}초`, `${seps.map(q => q.text).join(' / ')} · ${okI && okI.text}`);
    check('뛰느라 발이 뜬 것은 남기지 않는다', !lg.items.some(q => /밟는 힘이 없어 발이 떴다/.test(q.text) && q.att === lg.att));
    // 리플레이: 알림을 누르면 그 시각으로 간다
    await press('KeyY', 400); const pr = await prac(), seekHit = pr.hits.find(q => q.id.startsWith('log@')); if (seekHit) { await mv(seekHit.x + 30, seekHit.y + seekHit.h / 2); await wait(80); await pg.mouse.down(); await wait(40); await pg.mouse.up(); await wait(200); }
    const pr2 = await prac(), wantT = seekHit ? +seekHit.id.split('@')[2] : NaN; check('리플레이에서 알림을 누르면 재생 시각이 그 알림의 시각으로 간다(멈춤)', !!seekHit && !pr2.rp.playing && Math.abs((pr2.rp.t - pr2.rp.from) - wantT) < 0.02, `알림 ${wantT.toFixed(2)}초 → 재생 ${(pr2.rp.t - pr2.rp.from).toFixed(2)}초`); await shot('19_알림기록_리플레이'); await press('KeyY', 200);
    // 넘치면 휠로 올려 본다. 새 알림이 오면 맨 아래로
    for (let i = 0; i < 2; i++) { await press('KeyR', 300); await tryL4(150); await wait(2600); } lg = await logS(); const lz = (await view()).logPart; await mv(lz.x + lz.w / 2, lz.y + lz.h / 2); await wait(80); const zs = (await view()).zoom; await pg.mouse.wheel(0, -100); await wait(120); await pg.mouse.wheel(0, -100); await wait(120); const lg2 = await logS();
    check('알림이 칸을 넘치면 휠로 올려 본다(게임 화면 배율·차트는 그대로)', lg.max > 0 && lg.scroll === 0 && lg2.scroll === Math.min(lg2.max, 56) && (await view()).zoom === zs, `넘친 길이 ${lg.max.toFixed(0)} · 올린 만큼 ${lg2.scroll}`);
    { const s0 = (await logS()).scroll; await press('KeyR', 300); await tryL4(150); await wait(2600); const l3 = await logS(); // v0.16.3(GPT 화면 지침 6): 올려 읽는 중이면 끌어내리지 않고 "새 로그 N개"로 알린다. 누르면 맨 아래로
      check('올려 읽는 중에 새 알림이 오면 읽던 자리를 지키고 "새 로그 N개"를 띄운다', s0 > 0 && l3.scroll >= s0 && l3.unseen > 0 && (await prac()).hits.some(q => q.id === 'log_new'), `자리 ${s0} → ${l3.scroll} · 새 로그 ${l3.unseen}개`);
      await hitBtn('log_new'); await wait(150); check('"새 로그 N개"를 누르면 가장 새 것이 보이게 맨 아래로', (await logS()).scroll === 0); }
    // 차트/기록 경계선, 옆 붙임에서는 차트 아래
    v = await view(); await mv(v.logSplit.x + 1, v.chart.y + 90); await wait(100); const curL = (await prac()).cursor; await dragTo(v.logSplit.x, v.chart.y + 90, v.logSplit.x - 100, v.chart.y + 90); v2 = await view();
    check('차트와 로그 사이의 경계선을 끌면 두 칸의 너비가 바뀐다', curL === 'ew-resize' && Math.abs(v2.logPart.w - (v.logPart.w + 100)) < 1.5 && v2.chartPart.w + v2.logPart.w === v2.chart.w, `기록 ${v.logPart.w} → ${v2.logPart.w.toFixed(0)}`);
    await dragTo(v2.logSplit.x, v2.chart.y + 90, v.logSplit.x, v2.chart.y + 90); await press('KeyJ', 300); v2 = await view(); await shot('20_알림기록_왼쪽_붙임');
    check('옆 붙임에서는 로그이 차트 아래에 온다', v2.dock === 'left' && v2.logPart.x === v2.chartPart.x && v2.logPart.w === v2.chart.w && v2.logPart.y === v2.chartPart.y + v2.chartPart.h && v2.logSplit && !v2.logSplit.vertical, `차트 ${v2.chartPart.h} + 기록 ${v2.logPart.h}`);
    for (let g = 0; g < 4 && (await view()).dock !== 'bottom'; g++) await press('KeyJ', 200);
    // 켬·끔
    await press('KeyL', 200); v2 = await view(); const onBtn = (await prac()).hits.find(q => q.id === 'log_on'); check('로그 키(L)로 끄면 차트가 구역 전체를 쓴다(머리줄에 다시 켜는 단추)', v2.logPart === null && v2.chartPart.w === v2.chart.w && !!onBtn && (await logS()).items.length > 0);
    await pg.reload(); await wait(700); const offKept = (await view()).logPart === null; await press('KeyL', 200); check('끈 상태가 다시 실행해도 남고, 다시 누르면 켜진다', offKept && !!(await view()).logPart);
    const nm = await lab(() => ({ log: ACT.name.log, fit: ACT.name.viewFit, l: BIND.get('log')[0], z: BIND.get('viewFit')[0], cf1: Object.keys(BIND.conflicts(1)).length, cf2: Object.keys(BIND.conflicts(2)).length }));
    check('로그·화면 맞춤은 키 설정에서 바꿀 수 있는 동작이고 기본 배정에 겹침이 없다', nm.log === '로그' && nm.fit === '화면 맞춤' && nm.l === 'KeyL' && nm.z === 'KeyZ' && nm.cf1 === 0 && nm.cf2 === 0, JSON.stringify(nm)); }

  // ── 12. 보기 설정: 연습을 돕는 표시들을 체크박스로 켜고 끈다(단축키를 몰라도 되게)
  { const hitBtn = async id => { const h = (await prac()).hits.find(q => q.id === id); if (!h) return false; await mv(h.x + Math.min(40, h.w / 2), h.y + h.h / 2); await wait(60); await pg.mouse.down(); await wait(40); await pg.mouse.up(); await wait(200); return true; };
    for (let g = 0; g < 8 && (await lab(() => window.__lab.lesson().i)) >= 0; g++) await press('KeyO', 160); await press('KeyR', 300); v = await view();
    const hasBtn = !!(await prac()).hits.find(q => q.id === 'view_menu'), taps0 = await lab(() => window.__lab.lesson().rec.taps.length); await hitBtn('view_menu'); v2 = await view(); await shot('21_보기_설정');
    const menuKeys = (await lab(() => window.__lab.keys())).filter(k => k.where === 'menu').map(k => `${k.action}:${k.code}`);
    check('플레이 구역 오른쪽 아래에 보기 설정 단추가 늘 있고, 누르면 체크박스 목록이 열린다', hasBtn && !v.menu && v2.menu && !!v2.menuRect && v2.menuRect.x >= 0 && v2.menuRect.y >= 0 && v2.menuRect.x + v2.menuRect.w <= 960 && v2.menuRect.y + v2.menuRect.h <= 540, JSON.stringify(v2.menuRect));
    check('보기 설정 창은 작다(화면의 6% 이하. v0.14.0의 창은 200×250 = 9.6%)', v2.menuRect.w * v2.menuRect.h <= 960 * 540 * 0.06 && v2.menuRect.h <= 130, `${v2.menuRect.w}×${v2.menuRect.h} = 화면의 ${(v2.menuRect.w * v2.menuRect.h / (960 * 540) * 100).toFixed(1)}%`);
    check('단축키가 있는 항목에는 지금 설정된 키가 함께 보인다', ['chart:KeyT', 'log:KeyL', 'guide:KeyK', 'ghost:KeyU', 'viewMenu:Tab'].every(k => menuKeys.includes(k)), menuKeys.join(' '));
    const flip = {}; for (const id of ['chart', 'log', 'guide', 'help', 'status', 'recent', 'ghost', 'stats']) { const before = await view(), lgB = await lab(() => window.__lab.log()); await hitBtn('vm_' + id); const after = await view(), lgA = await lab(() => window.__lab.log());
      const st = q => id === 'chart' ? !!q.chart : id === 'log' ? !!q.logPart || (!q.chart && null) : id === 'guide' ? q.guide : q.show[id]; flip[id] = [id === 'log' ? lgB.on : st(before), id === 'log' ? lgA.on : st(after)]; if (id === 'chart') { flip.chartFull = after.play.h === 540; await hitBtn('vm_chart'); } }
    v2 = await view(); await shot('22_보기_설정_여러_개_끔');
    check('체크박스를 누르면 그 표시가 꺼진다(입력 타임라인·로그·키 안내·조작 설명·상태 알림·누른 키 표시·시범 유령) / 플레이 통계는 켜진다', ['chart', 'log', 'guide', 'help', 'status', 'recent', 'ghost'].every(id => flip[id][0] === true && flip[id][1] === false) && flip.stats[0] === false && flip.stats[1] === true && flip.chartFull, JSON.stringify(flip));
    check('꺼진 것이 실제로 화면에서 빠진다(키 안내·로그 칸·조작 설명 칸)', v2.guideRect === null && v2.logPart === null && v2.helpShown === false && v2.chartPart.w === v2.chart.w);
    check('보기 설정 창 안을 누르는 것은 게임 입력이 아니다(손을 보내지 않는다)', (await lab(() => window.__lab.lesson().rec.taps.length)) === taps0);
    await pg.reload(); await wait(700); v2 = await view(); check('켬·끔은 다시 실행해도 남는다', v2.guide === false && v2.logPart === null && v2.show.help === false && v2.show.status === false && v2.show.recent === false);
    await press('Tab', 250); check('보기 설정 키(Tab)로도 열고, 다시 누르면 닫힌다', (await view()).menu === true && (await press('Tab', 250), (await view()).menu === false)); await press('Tab', 250); for (const id of ['log', 'guide', 'help', 'status', 'recent']) await hitBtn('vm_' + id); v2 = await view();
    check('다시 체크하면 돌아온다', !!v2.guideRect && !!v2.logPart && v2.helpShown === true && v2.show.status && v2.show.recent);
    // 과제 카드·결과 카드
    for (let i = 0; i < 4; i++) await press('KeyO', 140); const hadCard = !!(await prac()).lessonCard; await hitBtn('vm_lesson'); const noCard = (await prac()).lessonCard === null; await hitBtn('vm_lesson'); await hitBtn('vm_result'); await hitBtn('vm_close'); const closed = !(await view()).menu;
    await tryL4(150); await wait(2600); let pe = await prac(); const noResult = pe.phase === 'ended' && pe.ended.rect === null && !pe.hits.find(q => q.id === 'retry'); await shot('23_결과_카드_끔'); await press('KeyR', 300); const again = (await prac()).phase === 'live';
    check('과제 카드를 끄고 켤 수 있다. 결과 카드를 꺼도 시도는 끝난 채 멈추고 다시하기 키는 그대로 된다', hadCard && noCard && closed && noResult && again, `과제 카드 ${hadCard}→${!noCard} · 결과 카드 없음 ${noResult} · R로 다시 ${again}`);
    await press('Tab', 250); await hitBtn('vm_result'); await hitBtn('vm_close');
    // 조작 설명: 화면 위를 덮던 넓은 칸 대신 오른쪽의 좁은 카드(과제 카드와 같은 자리). 자유 연습에서 하는 중에만 나오고, 끌어 옮긴다
    for (let g = 0; g < 8 && (await lab(() => window.__lab.lesson().i)) >= 0; g++) await press('KeyO', 160); await press('KeyR', 300); v = await view(); const hr = v.helpRect; await shot('25_조작_설명_카드');
    const goal = await lab(() => { const L = window.__lab, pl = L.s.world.find(q => q.id === 'G'), a = L.toScreen(pl.cx - 55, pl.cy - 24), b2 = L.toScreen(pl.cx + 55, pl.cy + 8); return { x: a[0], y: a[1], w: b2[0] - a[0], h: b2[1] - a[1] }; }), ov = (a, q) => a.x < q.x + q.w && q.x < a.x + a.w && a.y < q.y + q.h && q.y < a.y + a.h;
    const hands = await lab(() => { const L = window.__lab; return [2, 3].map(i => L.toScreen(L.s.p[i].x, L.s.p[i].y)); });
    check('조작 설명은 플레이 구역 오른쪽의 좁은 카드다(너비 240 이하). 목표 턱과 손을 가리지 않는다', !!hr && hr.w <= 240 && hr.x + hr.w <= v.play.x + v.play.w && hr.x > v.play.x + v.play.w / 2 && !ov(hr, goal) && hands.every(h => !(h[0] >= hr.x && h[0] <= hr.x + hr.w && h[1] >= hr.y && h[1] <= hr.y + hr.h)), hr ? `${hr.w}×${Math.round(hr.h)} 자리 (${Math.round(hr.x)}, ${Math.round(hr.y)})` : '없음');
    await dragTo(hr.x + 60, hr.y + 10, hr.x - 140, hr.y + 60); const hr2 = (await view()).helpRect; check('조작 설명 카드도 위쪽 띠를 잡고 끌어 옮긴다', Math.abs(hr2.x - (hr.x - 200)) < 1.5 && Math.abs(hr2.y - (hr.y + 50)) < 1.5 && hr2.moved);
    for (let i = 0; i < 4; i++) await press('KeyO', 140); const inLesson = (await view()).helpRect === null && !!(await prac()).lessonCard; for (let g = 0; g < 8 && (await lab(() => window.__lab.lesson().i)) >= 0; g++) await press('KeyO', 160);
    check('과제 중에는 조작 설명 카드 대신 과제 카드가 나온다', inLesson); await press('Tab', 250); await hitBtn('vm_resetpos'); await hitBtn('vm_close'); }

  // ── 13. 키 안내·과제 카드·결과 카드를 끌어서 옮긴다. 자리는 저장되고, 보기 설정에서 처음 자리로 되돌린다
  { const hitBtn = async id => { const h = (await prac()).hits.find(q => q.id === id); if (!h) return false; await mv(h.x + h.w / 2, h.y + h.h / 2); await wait(60); await pg.mouse.down(); await wait(40); await pg.mouse.up(); await wait(200); return true; };
    for (let i = 0; i < 4; i++) await press('KeyO', 140); await press('KeyR', 300); v = await view(); const g0 = v.guideRect, c0 = (await prac()).lessonCard;
    await mv(g0.x + 40, g0.y + 5); await wait(100); const curG = (await prac()).cursor; await dragTo(g0.x + 40, g0.y + 5, g0.x + 240, g0.y + 105); v2 = await view(); const g1 = v2.guideRect;
    check('키 안내의 머리 줄을 잡으면 옮기기 마우스 모양이고, 끌면 그만큼 옮겨진다', curG === 'move' && Math.abs(g1.x - (g0.x + 200)) < 1.5 && Math.abs(g1.y - (g0.y + 100)) < 1.5 && g1.moved, `(${Math.round(g0.x)}, ${Math.round(g0.y)}) → (${Math.round(g1.x)}, ${Math.round(g1.y)})`);
    const tapsB = await lab(() => window.__lab.lesson().rec.taps.length); await mv(g1.x + g1.w - 20, g1.y + 60); await wait(100); const curBody = (await prac()).cursor; await pg.mouse.click((g1.x + g1.w - 20) * K, (g1.y + 60) * K); await wait(250);
    check('키 안내의 머리 줄이 아닌 곳은 그대로 게임 입력이다(가려진 곳도 겨누고 손을 보낼 수 있다)', curBody === 'none' && (await lab(() => window.__lab.lesson().rec.taps.length)) === tapsB + 1);
    await press('KeyR', 300); await dragTo(c0.x + 60, c0.y + 10, c0.x - 300, c0.y + 90); let c1 = (await prac()).lessonCard; check('과제 카드도 위쪽 띠를 잡고 끌어 옮긴다', Math.abs(c1.x - (c0.x - 360)) < 1.5 && Math.abs(c1.y - (c0.y + 80)) < 1.5 && c1.moved, `(${Math.round(c0.x)}, ${Math.round(c0.y)}) → (${Math.round(c1.x)}, ${Math.round(c1.y)})`);
    await dragTo(c1.x + 60, c1.y + 10, -400, -300); c1 = (await prac()).lessonCard; v2 = await view(); check('구역 밖으로 끌어도 플레이 구역 안에 머문다', c1.x === v2.play.x && c1.y === v2.play.y);
    await tryL4(150); await wait(2600); let pe = await prac(); const e0 = pe.ended.rect, rb = pe.hits.find(q => q.id === 'retry'); await dragTo(e0.x + e0.w - 20, e0.y + 14, e0.x + e0.w - 20 - 150, e0.y + 14 - 40); pe = await prac(); const e1 = pe.ended.rect; await shot('24_카드_옮김');
    check('결과 카드는 단추가 아닌 곳을 잡고 끌어 옮긴다(끄는 것만으로 다시하기가 눌리지 않는다)', pe.phase === 'ended' && Math.abs(e1.x - (e0.x - 150)) < 1.5 && Math.abs(e1.y - (e0.y - 40)) < 1.5 && !!rb, `(${Math.round(e0.x)}, ${Math.round(e0.y)}) → (${Math.round(e1.x)}, ${Math.round(e1.y)})`);
    await hitBtn('retry'); check('옮긴 결과 카드의 단추는 그대로 눌린다', (await prac()).phase === 'live'); await tryL4(150); await wait(2600); const e2 = (await prac()).ended.rect; check('다음 시도에서도 결과 카드는 옮긴 자리에 나온다', Math.abs(e2.x - e1.x) < 1.5 && Math.abs(e2.y - e1.y) < 1.5);
    await pg.reload(); await wait(700); v2 = await view(); check('옮긴 자리는 다시 실행해도 남는다', !!v2.pos.guide && !!v2.pos.lesson && !!v2.pos.result && Math.abs(v2.guideRect.x - g1.x) < 1.5);
    await press('Tab', 250); await hitBtn('vm_resetpos'); await hitBtn('vm_close'); v2 = await view(); check('보기 설정의 "카드 자리 처음으로"로 모두 제자리', Object.keys(v2.pos).length === 0 && Math.abs(v2.guideRect.x - g0.x) < 1.5 && !v2.guideRect.moved); }

  // ── 14. 차트 머리줄의 안내 글: 항목 사이를 넉넉히 띄운다
  { await press('KeyR', 300); v = await view(); const hs = v.hints, gaps = hs.slice(1).map((q, k) => q.x - (hs[k].x + hs[k].w));
    check('안내 글 세 항목이 따로 놓이고 항목 사이가 20px 이상 떨어져 있다', hs.length === 3 && hs[0].t === '0초 = 첫 입력' && gaps.every(g => g >= 20), `간격 ${gaps.map(g => g.toFixed(0)).join(', ')}px`); }

  // ── 15. 입력 타임라인과 로그를 꺼 둔 동안에도 기록은 계속된다: 하고 난 뒤에 켜면 바로 보인다
  { for (let g = 0; g < 4 && (await view()).dock !== 'bottom'; g++) await press('KeyJ', 200); for (let i = 0; i < 4; i++) await press('KeyO', 140); await press('KeyR', 300);
    const hitBtn = async id => { const h = (await prac()).hits.find(q => q.id === id); if (!h) return false; await mv(h.x + Math.min(40, h.w / 2), h.y + h.h / 2); await wait(60); await pg.mouse.down(); await wait(40); await pg.mouse.up(); await wait(200); return true; };
    await press('KeyT', 200); await press('KeyL', 200); v = await view(); const n0 = (await lab(() => window.__lab.log())).items.length; await tryL4(150); await wait(2600);
    const offOk = v.chart === null && (await view()).chart === null; await press('KeyT', 300); await press('KeyL', 300); v2 = await view(); const p2 = await prac(), lg = await lab(() => window.__lab.log()), mine = p2.marks.filter(q => q.who === 'i'); await shot('26_꺼_둔_동안의_기록');
    check('차트와 로그를 끈 채로 한 시도도, 끝난 뒤 켜면 입력과 로그가 모두 보인다', offOk && !!v2.chartPart && !!v2.logPart && mine.length === 3 && lg.items.length > n0 && lg.items.some(q => q.kind === 'fail' && q.att === lg.att), `입력 표식 ${mine.length}개 · 로그 ${lg.items.length - n0}건 늘어남`);
    await press('KeyR', 300); for (let g = 0; g < 8 && (await lab(() => window.__lab.lesson().i)) >= 0; g++) await press('KeyO', 160); }

  // ── 16. 예전에 저장된 키 배정: 조작 방식 = Tab이 남아 있어도 보기 설정(Tab)과 겹치지 않게 옮긴다
  { const c3 = await b.newContext({ viewport: { width: 1280, height: 720 } }), p3 = await c3.newPage(); await p3.goto(url); await p3.waitForTimeout(400);
    await p3.evaluate(() => { const m = {}; for (const a of BIND.ACTIONS) m[a.id] = BIND.get(a.id).slice(); m.scheme = ['Tab', null]; delete m.viewMenu; localStorage.setItem(BIND.STORE, JSON.stringify(m)); }); await p3.reload(); await p3.waitForTimeout(500);
    const q = await p3.evaluate(() => ({ scheme: BIND.get('scheme'), menu: BIND.get('viewMenu'), cf: Object.keys(BIND.conflicts(1)).length })); check('옛 배정을 불러오면 조작 방식은 ` 로, 보기 설정은 Tab으로(겹침 없음)', q.scheme[0] === 'Backquote' && q.menu[0] === 'Tab' && q.cf === 0, JSON.stringify(q)); await c3.close(); }

  // ── 17. 1920×1080에서도 같은 배치(논리 좌표가 같다)
  { const c2 = await b.newContext({ viewport: { width: 1920, height: 1080 } }), p2 = await c2.newPage(); await p2.goto(url); await p2.waitForTimeout(700); const q = await p2.evaluate(() => window.__lab.view());
    check('1920×1080에서도 같은 나눔(논리 좌표 기준)', q.dock === 'bottom' && q.chart.h === q.fit && q.play.h === 540 - q.fit);
    if (out) { for (let i = 0; i < 4; i++) { await p2.keyboard.press('KeyO'); await p2.waitForTimeout(140); } await p2.keyboard.press('KeyP'); await p2.waitForTimeout(4800); await p2.screenshot({ path: path.join(out, '12_1920x1080_아래.png') }); await p2.keyboard.press('KeyJ'); await p2.waitForTimeout(300); await p2.screenshot({ path: path.join(out, '13_1920x1080_왼쪽.png') }); }
    await c2.close(); }
  console.log('페이지 오류:', errs.join(';') || '없음', '| 실패', fail); await b.close(); process.exit(fail || errs.length ? 1 : 0);
})();
