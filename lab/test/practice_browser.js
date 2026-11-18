// 연습 기능을 실제 브라우저에서 확인한다: 끝난 뒤 다시하기·리플레이, 리플레이 재생·시각 옮기기, 차트를 창처럼 옮기고 크기 바꾸기, 시간축 전체·확대·축소·이동. 사용: node test/practice_browser.js [스크린샷 폴더]
// 여기의 입력은 모두 스크립트가 넣는다(사람 손 아님)
'use strict';
const { chromium } = require('playwright'), path = require('path');
const url = 'file://' + path.join(__dirname, '..', 'climb_lab.html'), out = process.argv[2];
(async () => {
  const b = await chromium.launch(); let fail = 0; const check = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`); if (!c) fail++; };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }), pg = await ctx.newPage(), K = 1280 / 960, errs = []; pg.on('pageerror', e => errs.push(e.message));
  const shot = async n => { if (out) await pg.screenshot({ path: path.join(out, n + '.png') }); }, lab = f => pg.evaluate(f), wait = ms => pg.waitForTimeout(ms), press = async (k, ms = 80) => { await pg.keyboard.press(k); await wait(ms); };
  const st = () => lab(() => ({ p: window.__lab.practice(), c: window.__lab.chart(), taps: window.__lab.lesson().rec.taps.length, t: window.__lab.s.t, aim: [window.__lab.aim.x, window.__lab.aim.y], pos: window.__lab.s.p.map(q => [q.x, q.y]) }));
  const mv = (x, y, o) => pg.mouse.move(x * K, y * K, o), hitOf = (s, id) => { const h = s.p.hits.find(q => q.id === id); return h ? [h.x + h.w / 2, h.y + h.h / 2] : null; };
  const clickHit = async id => { const h = hitOf(await st(), id); if (!h) return false; await mv(h[0], h[1]); await wait(60); await pg.mouse.down(); await wait(40); await pg.mouse.up(); await wait(150); return true; };
  // 과제 4를 스크립트로 한 번 한다. hold = Space를 누르는 시간(ms): 470쯤이면 성공, 150이면 못 미쳐 떨어진다
  const tryL4 = async hold => { await mv(575, 218, { steps: 6 }); await wait(200); await pg.mouse.click(575 * K, 218 * K, { button: 'right' }); await wait(900); await pg.keyboard.down('Space'); await wait(140); await pg.mouse.click(575 * K, 218 * K); await wait(hold - 140 > 0 ? hold - 140 : 10); await pg.keyboard.up('Space'); };
  await pg.goto(url); await wait(700);

  // ── 4. 실패·성공해도 바로 처음으로 돌아가지 않고, 다시하기·리플레이 단추가 나온다
  for (let i = 0; i < 4; i++) await press('KeyO', 140);
  await tryL4(150); await wait(2600); let s = await st(); await shot('01_실패_결과화면');
  check('떨어지면 결과 화면에서 멈춘다(바로 다시 시작하지 않는다)', s.p.phase === 'ended' && s.p.ended.kind === 'fail' && s.p.ended.title === '매트에 떨어졌습니다', `${s.p.phase} · ${s.p.ended && s.p.ended.sub}`);
  const t1 = s.t; await wait(2500); s = await st();
  check('기다려도 그대로 있다(자동으로 넘어가지 않음)', s.p.phase === 'ended' && s.t === t1);
  check('다시하기·리플레이·다음 과제 단추가 있다', ['retry', 'replay', 'next'].every(id => hitOf(s, id)), s.p.hits.map(h => h.id).join(' '));
  check('결과 화면에서는 보통 마우스 화살표가 보인다', s.p.cursor === 'default' || s.p.cursor === 'pointer', s.p.cursor);
  await pg.keyboard.down('Space'); await wait(300); await pg.keyboard.up('Space'); await wait(100); check('결과 화면에서 Space를 눌러도 다시 시작하지 않는다', (await st()).p.phase === 'ended');
  check('다시하기 단추를 마우스로 누르면 처음 자세에서 다시', await clickHit('retry') && (s = await st()).p.phase === 'live' && s.t < 0.5 && s.taps === 0, `${s.p.phase} · ${s.t.toFixed(2)}초`);
  await tryL4(470); await wait(1800); s = await st(); await shot('02_성공_결과화면');
  check('성공하면 0.8초 더 보여 준 뒤 결과 화면', s.p.phase === 'ended' && s.p.ended.kind === 'ok' && s.p.ended.title === '과제 성공', `${s.p.phase} · ${s.p.ended && s.p.ended.sub}`);
  // 결과 카드: 큰 창으로 장면을 덮지 않는다 — 마지막 자세, 과제 카드, 차트와 겹치지 않는 자리에 작게
  { const q = await lab(() => { const L = window.__lab, p = L.practice(), e = p.ended.rect, xs = L.s.p.map(v => v.x + 30), ys = L.s.p.map(v => v.y - 130), body = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }, ov = (a, b) => !!a && !!b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      return { e, body: ov(e, body), card: ov(e, p.lessonCard), chart: ov(e, L.chart().rect), area: e.w * e.h }; });
    check('결과 카드가 마지막 자세·과제 카드·차트를 가리지 않고, 작다(화면의 8% 이하)', !q.body && !q.card && !q.chart && q.area < 960 * 540 * 0.08, `${Math.round(q.e.w)}×${Math.round(q.e.h)} 자리 (${Math.round(q.e.x)}, ${Math.round(q.e.y)}) · 화면의 ${(q.area / (960 * 540) * 100).toFixed(1)}%`); }

  // ── 5. 리플레이: 내가 한 플레이를 그대로 다시 본다. 재생·멈춤, 좌우 방향키
  const endPos = s.pos, nTaps = s.taps; await press('KeyY', 500); s = await st(); await shot('03_리플레이_재생중');
  check('리플레이 키로 열린다: 0초(첫 입력)부터 재생', s.p.phase === 'replay' && s.p.rp.playing && s.p.rp.t - s.p.rp.from > 0.2 && s.p.rp.t - s.p.rp.from < 0.9, `${(s.p.rp.t - s.p.rp.from).toFixed(2)}초 지남 / 전체 ${(s.p.rp.to - s.p.rp.from).toFixed(2)}초`);
  check('차트에는 내가 한 입력이 모두 들어 있다', s.taps === nTaps && nTaps >= 2);
  const a1 = s.p.rp.t; await wait(500); s = await st(); check('시간이 실제 빠르기로 흐른다', Math.abs((s.p.rp.t - a1) - 0.5) < 0.2, `0.5초 동안 ${(s.p.rp.t - a1).toFixed(2)}초`);
  await press('Space', 120); s = await st(); const a2 = s.p.rp.t; await wait(300); check('재생·멈춤 키로 멈춘다', !s.p.rp.playing && (await st()).p.rp.t === a2);
  await press('ArrowLeft', 100); s = await st(); check('← 한 번 = 0.05초 뒤로', Math.abs((a2 - s.p.rp.t) - 0.05) < 1e-6, (a2 - s.p.rp.t).toFixed(3));
  await press('ArrowRight', 60); await press('ArrowRight', 100); s = await st(); check('→ 두 번 = 0.1초 앞으로', Math.abs((s.p.rp.t - a2) - 0.05) < 1e-6);
  const a3 = s.p.rp.t; await pg.keyboard.down('ArrowLeft'); await wait(900); await pg.keyboard.up('ArrowLeft'); await wait(80); s = await st(); check('←를 누르고 있으면 계속 뒤로 간다', a3 - s.p.rp.t > 0.4, `${(a3 - s.p.rp.t).toFixed(2)}초 뒤로`);
  // 몸의 모습: 리플레이의 끝은 실제로 끝난 순간의 모습과 같다
  await lab(() => { const L = window.__lab; }); await pg.keyboard.down('ArrowRight'); await wait(3200); await pg.keyboard.up('ArrowRight'); await wait(100); s = await st();
  check('끝까지 넘기면 실제로 끝난 순간의 몸과 같은 모습', Math.abs(s.p.rp.t - s.p.rp.to) < 1e-6 && Math.max(...s.pos.map((q, i) => Math.hypot(q[0] - endPos[i][0], q[1] - endPos[i][1]))) === 0, `${(s.p.rp.t - s.p.rp.from).toFixed(2)} / ${(s.p.rp.to - s.p.rp.from).toFixed(2)}초`);
  await press('Space', 300); s = await st(); check('끝에서 재생을 누르면 처음부터 다시', s.p.rp.playing && s.p.rp.t - s.p.rp.from < 0.6);
  await press('ArrowDown', 100); s = await st(); const a4 = s.p.rp.t; await wait(600); check('속도 키: 0.5배로 느리게', s.p.rp.speed === 0.5 && Math.abs(((await st()).p.rp.t - a4) - 0.3) < 0.15);
  await press('ArrowDown', 60); await press('ArrowDown', 60);

  // ── 7. 멈춘 뒤 차트의 시간축을 누르면 재생 시각이 그리로 가고, 재생하면 거기서부터
  await press('Space', 120); s = await st(); if (s.p.rp.playing) { await press('Space', 120); s = await st(); }
  const pl = s.c.plot, cx = pl.x + pl.w * 0.42, want = s.p.rp.from + s.c.view + (cx - s.c.ax - s.c.pad) / s.c.pps;
  await mv(cx, pl.y + pl.h / 2); await wait(80); await pg.mouse.down(); await wait(60); await pg.mouse.up(); await wait(150); s = await st(); await shot('04_리플레이_차트를_눌러_이동');
  check('차트의 시간축을 누르면 재생 시각이 그 자리로', !s.p.rp.playing && Math.abs(s.p.rp.t - want) < 0.02, `간 시각 ${(s.p.rp.t - s.p.rp.from).toFixed(2)}초 · 누른 곳 ${(want - s.p.rp.from).toFixed(2)}초`);
  await mv(100, 150); await press('Space', 400); s = await st(); check('재생하면 거기서부터 이어진다', s.p.rp.playing && s.p.rp.t > want + 0.2 && s.p.rp.t < want + 0.8, `${(s.p.rp.t - want).toFixed(2)}초 지남`);
  await press('Space', 100); const pl2 = (await st()).c.plot; await mv(pl2.x + pl2.w * 0.2, pl2.y + 4); await pg.mouse.down(); await mv(pl2.x + pl2.w * 0.5, pl2.y + 4, { steps: 6 }); await wait(80); const mid = await st(); await pg.mouse.up(); await wait(80);
  check('시간축을 끌면 재생 시각이 따라온다', Math.abs((mid.p.rp.t - mid.p.rp.from) - (mid.c.view + (pl2.x + pl2.w * 0.5 - mid.c.ax - mid.c.pad) / mid.c.pps)) < 0.03);
  check('리플레이 단추(재생·뒤로·앞으로·속도·닫기·다시하기)가 화면에 있다', ['rp_play', 'rp_back', 'rp_fwd', 'rp_speed', 'replay', 'retry'].every(id => hitOf(mid, id)));
  check('재생 도구는 차트 바로 위에 붙어 있다(화면 맨 위의 따로 떨어진 줄이 아니다)', !!mid.p.tools && Math.abs((mid.p.tools.y + mid.p.tools.h) - mid.c.rect.y) < 8 && Math.abs(mid.p.tools.x - mid.c.rect.x) < 1, mid.p.tools ? `도구 줄 아래 ${Math.round(mid.p.tools.y + mid.p.tools.h)} · 차트 위 ${Math.round(mid.c.rect.y)}` : '없음');
  { const b0 = (await st()).p.rp.t; await clickHit('rp_fwd'); const b1 = (await st()).p.rp.t; await press('ArrowRight', 80); const b2 = (await st()).p.rp.t; check('한 번 넘기기는 단추와 키가 같다(0.05초)', Math.abs((b1 - b0) - 0.05) < 1e-6 && Math.abs((b2 - b1) - 0.05) < 1e-6, `단추 ${(b1 - b0).toFixed(3)}초 · 키 ${(b2 - b1).toFixed(3)}초`); }
  await clickHit('rp_play'); check('재생 단추를 마우스로', (await st()).p.rp.playing); await clickHit('rp_play');
  await clickHit('replay'); s = await st(); check('닫으면 결과 화면으로 돌아오고 몸은 끝난 순간 그대로', s.p.phase === 'ended' && Math.max(...s.pos.map((q, i) => Math.hypot(q[0] - endPos[i][0], q[1] - endPos[i][1]))) === 0);

  // ── 6. 시간축: 전체 보기·확대·축소·옮기기
  await press('KeyY', 200); await press('Space', 100); s = await st(); const span0 = s.c.span;
  await clickHit('tl_in'); s = await st(); check('확대 단추: 보이는 폭이 줄어든다', s.c.span < span0 * 0.8, `${span0} → ${s.c.span.toFixed(2)}초`);
  await clickHit('tl_out'); await clickHit('tl_out'); s = await st(); check('축소 단추: 보이는 폭이 늘어난다', s.c.span > span0 * 1.2, `${s.c.span.toFixed(2)}초`);
  await clickHit('tl_fit'); s = await st(); check('전체 단추: 0초부터 기록 끝까지 한눈에', s.c.view === 0 && Math.abs(s.c.span - (s.c.end + 0.3)) < 0.05, `0 ~ ${s.c.span.toFixed(2)}초 (기록 끝 ${s.c.end.toFixed(2)}초)`);
  await press('BracketRight', 80); await press('BracketRight', 80); await press('BracketRight', 80); s = await st(); const sp1 = s.c.span; check('확대 키(])', sp1 < s.c.end);
  await pg.keyboard.down('Period'); await wait(600); await pg.keyboard.up('Period'); await wait(80); s = await st(); const v1 = s.c.view; check('확대한 채 옮기기 키(.)로 뒤쪽을 본다', v1 > 0.2, `보이는 시작 ${v1.toFixed(2)}초`); await shot('05_차트_확대_이동');
  const pl3 = s.c.plot; await clickHit('replay'); await mv(pl3.x + pl3.w * 0.3, pl3.y + 4); await pg.mouse.down(); await mv(pl3.x + pl3.w * 0.7, pl3.y + 4, { steps: 6 }); await wait(60); await pg.mouse.up(); await wait(100); s = await st();
  check('리플레이가 아닐 때 확대한 시간축을 끌면 옮겨진다', s.c.view < v1 - 0.1 && s.c.rect.x === (await st()).c.rect.x, `${v1.toFixed(2)} → ${s.c.view.toFixed(2)}초`);
  await mv(pl3.x + pl3.w * 0.5, pl3.y + 4); await pg.mouse.wheel(0, -300); await wait(150); const sp2 = (await st()).c.span; await pg.mouse.wheel(0, 600); await wait(150); const sp3 = (await st()).c.span;
  check('차트 위에서 마우스 휠로 확대·축소', sp2 < sp1 && sp3 > sp2, `${sp1.toFixed(2)} → ${sp2.toFixed(2)} → ${sp3.toFixed(2)}초`);
  await press('Backslash', 80); check('전체 보기 키(\\)', (await st()).c.view === 0);

  // ── 1·2. 차트를 창처럼: 끌어서 옮기고, 가장자리·모서리를 끌어 크기를 바꾼다
  await press('KeyR', 300); s = await st(); let r = s.c.rect; check('손대지 않은 차트는 아래쪽 제자리', !s.c.custom && Math.abs(r.y + r.h - 498) < 1);
  await mv(r.x + 60, r.y + 8); await wait(100); s = await st(); check('차트 위에서는 옮기기 마우스 모양(게임 조준점 대신)', s.p.cursor === 'move' && s.p.capture, s.p.cursor);
  await pg.mouse.down(); await mv(r.x - 240, r.y - 200, { steps: 8 }); await wait(60); await pg.mouse.up(); await wait(120); s = await st(); let r2 = s.c.rect; await shot('06_차트_옮김');
  check('끌면 옮겨진다(크기는 그대로)', Math.abs(r2.x - (r.x - 300)) < 2 && Math.abs(r2.y - (r.y - 208)) < 2 && Math.abs(r2.w - r.w) < 0.01 && Math.abs(r2.h - r.h) < 0.01 && s.c.custom, JSON.stringify(r2));
  r = r2; const curs = {}; for (const [n, x, y] of [['오른쪽 아래', r.x + r.w - 1, r.y + r.h - 1], ['왼쪽 위', r.x + 1, r.y + 1], ['오른쪽 변', r.x + r.w - 1, r.y + r.h / 2], ['아래 변', r.x + r.w / 2, r.y + r.h - 1], ['오른쪽 위', r.x + r.w - 1, r.y + 1]]) { await mv(x, y); await wait(70); curs[n] = (await st()).p.cursor; }
  check('모서리·변에 닿으면 창처럼 크기 바꾸기 마우스 모양', curs['오른쪽 아래'] === 'nwse-resize' && curs['왼쪽 위'] === 'nwse-resize' && curs['오른쪽 변'] === 'ew-resize' && curs['아래 변'] === 'ns-resize' && curs['오른쪽 위'] === 'nesw-resize', JSON.stringify(curs));
  await mv(r.x + r.w - 1, r.y + r.h - 1); await pg.mouse.down(); await mv(r.x + r.w + 159, r.y + r.h + 119, { steps: 8 }); await wait(60); await pg.mouse.up(); await wait(120); s = await st(); r2 = s.c.rect; await shot('07_차트_키움');
  check('오른쪽 아래 모서리를 끌면 커진다(왼쪽 위는 그대로)', Math.abs(r2.x - r.x) < 0.01 && Math.abs(r2.y - r.y) < 0.01 && Math.abs(r2.w - (r.w + 160)) < 2 && Math.abs(r2.h - (r.h + 120)) < 2, JSON.stringify(r2));
  r = r2; await mv(r.x + 1, r.y + r.h / 2); await pg.mouse.down(); await mv(r.x + 2000, r.y + r.h / 2, { steps: 6 }); await wait(60); await pg.mouse.up(); await wait(120); r2 = (await st()).c.rect;
  check('너무 줄이면 최소 크기에서 멈춘다(오른쪽 끝은 그대로)', Math.abs(r2.w - 240) < 0.01 && Math.abs((r2.x + r2.w) - (r.x + r.w)) < 0.01, JSON.stringify(r2));
  // 차트 위의 마우스는 게임 입력이 아니다. 차트 밖에서는 그대로 게임 입력이다
  r = r2; const a0 = (await st()); await mv(r.x + r.w / 2, r.y + 8); await wait(80); await pg.mouse.down(); await wait(40); await pg.mouse.up(); await wait(120); await pg.mouse.click((r.x + r.w / 2) * K, (r.y + 8) * K, { button: 'right' }); await wait(150); s = await st();
  check('차트 위에서 누른 마우스는 손을 보내지 않고, 조준점도 따라가지 않는다', s.taps === a0.taps && s.aim[0] === a0.aim[0] && s.aim[1] === a0.aim[1] && s.p.phase === 'live', `보낸 손 ${s.taps}개`);
  await mv(250, 170, { steps: 4 }); await wait(120); await pg.mouse.click(250 * K, 170 * K); await wait(200); s = await st(); check('차트 밖에서는 그대로 손을 보낸다', s.taps === a0.taps + 1 && s.p.cursor === 'none', `보낸 손 ${s.taps}개 · 마우스 모양 ${s.p.cursor}`);
  // 다시 불러와도 자리와 크기가 남는다. "제자리" 단추로 되돌린다
  const saved = (await st()).c.rect; await pg.reload(); await wait(700); s = await st(); check('다시 불러와도 차트의 자리와 크기가 남는다', s.c.custom && Math.abs(s.c.rect.x - saved.x) < 0.01 && Math.abs(s.c.rect.w - saved.w) < 0.01, JSON.stringify(s.c.rect));
  await clickHit('tl_reset'); s = await st(); check('제자리 단추로 처음 자리·크기로', !s.c.custom && Math.abs(s.c.rect.y + s.c.rect.h - 498) < 1 && s.c.rect.w === 438);

  // ── 3. 차트의 줄 머리에는 이름 없이 키캡만
  for (let i = 0; i < 4; i++) await press('KeyO', 140); await press('KeyP'); await wait(4800); await press('KeyT', 300);
  // 차트가 그린 글자만 본다: 제목('입력 비교')부터 아래 설명 줄 앞까지
  const words = await lab(() => new Promise(res => { const o = G.text, seen = []; G.text = (t, x, y, opt) => { seen.push(String(t)); return o(t, x, y, opt); }; requestAnimationFrame(() => requestAnimationFrame(() => { G.text = o; const a = seen.lastIndexOf('입력 비교'), b = seen.findIndex((t, k) => k > a && /^(막대나 표식|리플레이:)/.test(t)); res(a >= 0 && b > a ? seen.slice(a + 1, b) : null); })); }));
  const keysIn = (await lab(() => window.__lab.keys())).filter(k => k.where === 'chart' && k.action !== 'chart'); await shot('08_펼친차트_키캡만');
  check('펼친 차트의 줄에 동작 이름(왼손·오른손·모으기 …)이 없다', !!words && words.length > 5 && !words.some(t => /왼손|오른손|왼발|오른발|모으기|몸 위로|몸 아래로|몸 왼쪽|몸 오른쪽/.test(t.replace('놓을 손', ''))), words ? `차트의 글자 ${words.length}개: ${words.filter(t => !/^[\d.]+초?$/.test(t)).slice(0, 8).join(' | ')}` : '차트 글자를 찾지 못함');
  check('줄마다 키캡이 있다', keysIn.length >= 3, keysIn.map(k => k.code).join(' '));

  // ── 기록별 시작 표식: 그때 실제로 누른 키가 시작점 왼쪽에 고정 크기로 붙는다. 가리키면 설명이 나온다
  { await press('KeyR', 300); await mv(575, 218, { steps: 6 }); await wait(200); await pg.mouse.click(575 * K, 218 * K, { button: 'right' }); await wait(900); await pg.keyboard.down('Space'); await wait(140); await pg.mouse.click(575 * K, 218 * K); await wait(330); await pg.keyboard.up('Space'); await wait(1900);
    s = await st(); const mine = s.p.marks.filter(q => q.who === 'i'), dem = s.p.marks.filter(q => q.who === 'm'), sp = mine.find(q => q.lane === 'power'), hand = mine.find(q => q.lane === 'limb1'); await shot('11_시작표식_펼침');
    check('내 기록마다 시작 표식이 있고 그때 누른 키다(우클릭·Space·좌클릭)', mine.length === 3 && !!sp && sp.codes[0] === 'Space' && !!hand && hand.codes[0] === 'Mouse2' && mine.every(q => !q.guide), mine.map(q => `${q.lane}:${q.codes.join('+')}`).join(' '));
    check('시범의 표식은 지금 설정 기준 안내로 구분된다', dem.length === 3 && dem.every(q => q.guide), dem.map(q => `${q.lane}:${q.codes.join('+')}${q.guide ? '(안내)' : ''}`).join(' '));
    const rec2 = await lab(() => { const r = window.__lab.lesson().rec, b = r.bars.find(q => q.id === 'power'); return { a: b.a - r.t0, b: b.b - r.t0 }; });
    check('표식은 시작점 왼쪽에 놓이고 폭이 누른 시간과 상관없다(Space 표식 < 60px)', Math.abs((sp.x + sp.w + 4) - (s.c.ax + s.c.pad + (rec2.a - s.c.view) * s.c.pps)) < 0.5 && sp.w < 60 && sp.w > 20, `표식 ${sp.w.toFixed(0)}px · 막대 ${((rec2.b - rec2.a) * s.c.pps).toFixed(0)}px(${(rec2.b - rec2.a).toFixed(2)}초)`);
    await mv(s.c.ax + s.c.pad + (rec2.a + 0.1 - s.c.view) * s.c.pps, s.c.plot.y + s.c.plot.h / 3 + s.c.plot.h / 6 + 6); await wait(250); s = await st(); const tipKeys = (await lab(() => window.__lab.keys())).filter(k => k.where === 'tip'); await shot('12_시작표식_가리킴');
    check('막대를 가리키면 그 기록의 설명(누른 키·시각·누른 시간)이 나온다', !!s.p.hover && s.p.hover.lane === 'power' && s.p.hover.who === 'i' && tipKeys.length === 1 && tipKeys[0].code === 'Space', JSON.stringify(s.p.hover)); }
  // 촘촘한 입력: 표식이 겹치면 묶음(개수)으로 보이고 기록은 하나도 빠지지 않는다. 확대하면 따로 보인다
  { for (let i = 0; i < 3; i++) await press('KeyO', 140); await press('KeyT', 100); await press('KeyT', 100); await press('KeyT', 100); await mv(250, 170); await wait(150);
    for (let i = 0; i < 5; i++) { await pg.keyboard.down('KeyA'); await wait(40); await pg.keyboard.up('KeyA'); await wait(50); } await wait(300);
    s = await st(); const n = await lab(() => window.__lab.lesson().rec.bars.filter(b => b.id === 'moveLeft').length), mk = s.p.marks.filter(q => q.lane === 'moveLeft'), tot = mk.reduce((a, q) => a + q.n, 0); await shot('13_촘촘한_입력_묶음');
    check('짧게 다섯 번 누른 A: 표식은 묶여도 개수의 합이 기록 수와 같다(조용히 빼지 않는다)', n === 5 && tot === 5 && mk.length < 5 && mk.some(q => q.n > 1) && mk.every(q => q.codes[0] === 'KeyA'), `기록 ${n}개 · 표식 ${mk.length}개(${mk.map(q => '×' + q.n).join(' ')})`);
    for (let i = 0; i < 6; i++) await press('BracketRight', 60); s = await st(); const mk2 = s.p.marks.filter(q => q.lane === 'moveLeft'); await shot('14_촘촘한_입력_확대');
    check('확대하면 표식이 따로 보인다', mk2.length > mk.length, `표식 ${mk.length}개 → ${mk2.length}개`); await press('Backslash', 80); await press('KeyT', 100); await press('KeyT', 100); }
  // ── 8. 자유 연습에서도 같은 흐름(같은 부품)
  await press('KeyR', 300); s = await st();
  await mv(150, 280); await wait(150); await pg.keyboard.down('Space'); await wait(150); await pg.mouse.click(150 * K, 280 * K); await wait(80); await pg.mouse.click(150 * K, 280 * K, { button: 'right' }); await wait(250); await pg.keyboard.up('Space'); await wait(3200); s = await st(); await shot('09_자유연습_결과화면'); // 두 손을 다 놓을 손으로 지정하고 뛰어 매트에 떨어진다
  check('자유 연습에서 떨어져도 같은 결과 화면(다음 과제 단추는 없음)', s.p.phase === 'ended' && s.p.ended.kind === 'fail' && hitOf(s, 'retry') && hitOf(s, 'replay') && !hitOf(s, 'next'), `${s.p.phase} · 단추 ${s.p.hits.filter(h => !h.id.startsWith('tl_')).map(h => h.id).join(' ')}`);
  await clickHit('replay'); await wait(300); s = await st(); check('자유 연습에서도 리플레이 단추로 다시 본다', s.p.phase === 'replay' && s.p.rp.to - s.p.rp.from > 0.5); await shot('10_자유연습_리플레이');
  await press('KeyR', 300); s = await st(); check('리플레이 중 다시하기 키로 바로 새 시도', s.p.phase === 'live' && s.taps === 0);
  await mv(250, 170); await wait(100); await pg.keyboard.down('KeyQ'); await wait(60); await pg.keyboard.up('KeyQ'); await wait(500); await press('KeyY', 300); s = await st();
  check('하는 중에 리플레이 키를 누르면 거기서 끝내고 본다', s.p.phase === 'replay' && s.p.ended.kind === 'stop');
  // ── 차트를 껐을 때: 도구 줄 안의 얇은 진행 축(같은 재생 시계)
  { await press('KeyT', 80); await press('KeyT', 80); await press('KeyT', 80); s = await st(); let guard = 0; while ((await st()).c.mode !== 'off' && guard++ < 3) await press('KeyT', 80); s = await st();
    check('차트를 꺼도 리플레이 도구 줄이 남고 진행 축이 나온다', s.c.mode === 'off' && s.p.phase === 'replay' && !!s.p.tools && !!s.p.bar, `차트 ${s.c.mode}`);
    if (s.p.bar) { if (s.p.rp.playing) await press('Space', 100); const bb = s.p.bar; await mv(bb.x + bb.w * 0.5, bb.y + bb.h / 2); await pg.mouse.down(); await wait(60); await pg.mouse.up(); await wait(120); s = await st(); check('진행 축을 누르면 그 비율의 시각으로', Math.abs((s.p.rp.t - s.p.rp.from) / (s.p.rp.to - s.p.rp.from) - 0.5) < 0.02, `${((s.p.rp.t - s.p.rp.from) / (s.p.rp.to - s.p.rp.from) * 100).toFixed(0)}%`); }
    await press('KeyT', 80); }
  // ── 리플레이 범위: 연속으로 적힌 데까지만(시험에서는 2초로 줄여 본다). 실제 끝의 모습은 닫았을 때 그대로 돌아온다
  { const p2 = await ctx.newPage(); await p2.goto(url + '?trackmax=2'); await p2.waitForTimeout(600); const st2 = () => p2.evaluate(() => ({ p: window.__lab.practice(), c: window.__lab.chart(), t: window.__lab.s.t, pos: window.__lab.s.p.map(q => [q.x, q.y]), t0: window.__lab.lesson().rec.t0 }));
    await p2.mouse.move(250 * K, 170 * K); await p2.waitForTimeout(150); await p2.keyboard.down('KeyA'); await p2.waitForTimeout(1500); await p2.keyboard.up('KeyA'); await p2.keyboard.down('KeyD'); await p2.waitForTimeout(2500); await p2.keyboard.up('KeyD'); await p2.waitForTimeout(200);
    await p2.keyboard.press('KeyY'); await p2.waitForTimeout(300); let q = await st2(); const live = q.t; await p2.keyboard.press('Space'); await p2.waitForTimeout(100);
    check('2초 제한: 4초쯤 한 시도의 리플레이 길이는 2초(뒤는 적지 않았다고 알림)', q.p.trackFull && Math.abs((q.p.rp.to - q.p.rp.from) - 2) < 0.03, `길이 ${(q.p.rp.to - q.p.rp.from).toFixed(2)}초`);
    await p2.keyboard.down('ArrowRight'); await p2.waitForTimeout(2600); await p2.keyboard.up('ArrowRight'); await p2.waitForTimeout(100); q = await st2(); check('끝까지 넘겨도 적힌 끝에서 멈춘다(빈 구간으로 넘어가지 않는다)', Math.abs(q.p.rp.t - q.p.rp.to) < 1e-6 && q.t <= q.p.rp.to + 1e-6, `재생 ${(q.p.rp.t - q.p.rp.from).toFixed(2)}초 · 화면의 몸 ${(q.t - q.t0).toFixed(2)}초`);
    const pl = q.c.plot; await p2.mouse.move((pl.x + pl.w - 4) * K, (pl.y + 4) * K); await p2.mouse.down(); await p2.waitForTimeout(60); await p2.mouse.up(); await p2.waitForTimeout(100); q = await st2(); check('적힌 끝 너머를 눌러도 끝으로만 간다', q.p.rp.t <= q.p.rp.to + 1e-6);
    if (out) await p2.screenshot({ path: path.join(out, '15_리플레이_기록끝_표시.png') });
    await p2.keyboard.press('KeyY'); await p2.waitForTimeout(200); q = await st2(); check('닫으면 실제로 끝난 순간(적힌 끝보다 뒤)의 몸으로 돌아온다', q.p.phase === 'ended' && q.t > q.t0 + 3.5, `${(q.t - q.t0).toFixed(2)}초의 몸`); await p2.close(); }
  console.log('페이지 오류:', errs.join(';') || '없음', '| 실패', fail); await b.close(); process.exit(fail || errs.length ? 1 : 0);
})();
