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
  check('떨어지면 결과 화면에서 멈춘다(바로 다시 시작하지 않는다)', s.p.phase === 'ended' && s.p.ended.kind === 'fail' && s.p.ended.title === '매트에 떨어짐', `${s.p.phase} · ${s.p.ended && s.p.ended.sub}`);
  const t1 = s.t; await wait(2500); s = await st();
  check('기다려도 그대로 있다(자동으로 넘어가지 않음)', s.p.phase === 'ended' && s.t === t1);
  check('다시하기·리플레이·다음 과제 단추가 있다', ['retry', 'replay', 'next'].every(id => hitOf(s, id)), s.p.hits.map(h => h.id).join(' '));
  check('결과 화면에서는 보통 마우스 화살표가 보인다', s.p.cursor === 'default' || s.p.cursor === 'pointer', s.p.cursor);
  await pg.keyboard.down('Space'); await wait(300); await pg.keyboard.up('Space'); await wait(100); check('결과 화면에서 Space를 눌러도 다시 시작하지 않는다', (await st()).p.phase === 'ended');
  check('다시하기 단추를 마우스로 누르면 처음 자세에서 다시', await clickHit('retry') && (s = await st()).p.phase === 'live' && s.t < 0.5 && s.taps === 0, `${s.p.phase} · ${s.t.toFixed(2)}초`);
  await tryL4(470); await wait(1800); s = await st(); await shot('02_성공_결과화면');
  check('성공하면 0.8초 더 버틴 뒤 결과 화면', s.p.phase === 'ended' && s.p.ended.kind === 'ok' && s.p.ended.title === '성공!', `${s.p.phase} · ${s.p.ended && s.p.ended.sub}`);

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
  const words = await lab(() => new Promise(res => { const o = G.text, seen = [], R = window.__lab.chart().rect; G.text = (t, x, y, opt) => { if (R && x >= R.x && x <= R.x + R.w && y >= R.y + 40 && y <= R.y + R.h - 26) seen.push(String(t)); return o(t, x, y, opt); }; requestAnimationFrame(() => requestAnimationFrame(() => { G.text = o; res(seen); })); }));
  const keysIn = (await lab(() => window.__lab.keys())).filter(k => k.where === 'chart' && k.action !== 'chart'); await shot('08_펼친차트_키캡만');
  check('펼친 차트의 줄에 동작 이름(왼손·오른손·모으기 …)이 없다', !words.some(t => /왼손|오른손|왼발|오른발|모으기|몸 위로|몸 아래로|몸 왼쪽|몸 오른쪽/.test(t.replace('놓을 손', ''))), words.filter(t => !/^[\d.]+초?$/.test(t)).slice(0, 6).join(' | '));
  check('줄마다 키캡이 있다', keysIn.length >= 3, keysIn.map(k => k.code).join(' '));

  // ── 8. 자유 연습에서도 같은 흐름(같은 부품)
  await press('KeyT', 100); await press('KeyT', 100); for (let i = 0; i < 3; i++) await press('KeyO', 140); s = await st();
  await mv(150, 280); await wait(150); await pg.keyboard.down('Space'); await wait(150); await pg.mouse.click(150 * K, 280 * K); await wait(80); await pg.mouse.click(150 * K, 280 * K, { button: 'right' }); await wait(250); await pg.keyboard.up('Space'); await wait(3200); s = await st(); await shot('09_자유연습_결과화면'); // 두 손을 다 놓을 손으로 지정하고 뛰어 매트에 떨어진다
  check('자유 연습에서 떨어져도 같은 결과 화면(다음 과제 단추는 없음)', s.p.phase === 'ended' && s.p.ended.kind === 'fail' && hitOf(s, 'retry') && hitOf(s, 'replay') && !hitOf(s, 'next'), `${s.p.phase} · 단추 ${s.p.hits.filter(h => !h.id.startsWith('tl_')).map(h => h.id).join(' ')}`);
  await clickHit('replay'); await wait(300); s = await st(); check('자유 연습에서도 리플레이 단추로 다시 본다', s.p.phase === 'replay' && s.p.rp.to - s.p.rp.from > 0.5); await shot('10_자유연습_리플레이');
  await press('KeyR', 300); s = await st(); check('리플레이 중 다시하기 키로 바로 새 시도', s.p.phase === 'live' && s.taps === 0);
  await mv(250, 170); await wait(100); await pg.keyboard.down('KeyQ'); await wait(60); await pg.keyboard.up('KeyQ'); await wait(500); await press('KeyY', 300); s = await st();
  check('하는 중에 리플레이 키를 누르면 거기서 끝내고 본다', s.p.phase === 'replay' && s.p.ended.kind === 'stop');
  console.log('페이지 오류:', errs.join(';') || '없음', '| 실패', fail); await b.close(); process.exit(fail || errs.length ? 1 : 0);
})();
