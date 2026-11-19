// 실제 브라우저에서 연습 과제의 시범이 모두 성공하는지, 입력 기록이 남는지 확인한다. 사용: node test/lessons_browser.js [스크린샷 폴더]
'use strict';
const { chromium } = require('playwright'), path = require('path');
const url = 'file://' + path.join(__dirname, '..', 'climb_lab.html'), shot = process.argv[2];
(async () => {
  const b = await chromium.launch(); let fail = 0; const check = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`); if (!c) fail++; };
  const pg = await b.newPage({ viewport: { width: 960, height: 540 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(url); await pg.waitForTimeout(400); const LIST_N = await pg.evaluate(() => LESSON.LIST.length);
  // 게임 화면 좌표(960×540 기준) → 지금 화면의 자리(차트 구역이 켜져 있으면 게임 화면이 줄어 있다)
  const g2s = async (x, y) => { const v = await pg.evaluate(() => window.__lab.view()); return [v.x0 + x * v.s, v.y0 + y * v.s]; }, gmove = async (x, y, o) => { const q = await g2s(x, y); return pg.mouse.move(q[0], q[1], o); }, gclick = async (x, y, o) => { const q = await g2s(x, y); return pg.mouse.click(q[0], q[1], o); };
  const names = await pg.evaluate(() => LESSON.LIST.map(l => [l.name, l.T]));
  // 시범이 겨누는 곳은 모두 플레이 구역 안, 그리고 과제 카드에 가려지지 않는 곳이어야 한다(v0.9.0에서는 5·6번 과제의 높은 턱이 화면 밖에 있었다).
  // 과제마다 실제로 들어가서 그 과제의 화면 기준·배치로 잰다(차트 구역은 기본값인 아래 붙임. 네 방향 모두는 layout_browser.js가 본다)
  const off = []; for (let i = 0; i < LIST_N; i++) { await pg.keyboard.press('KeyO'); await pg.waitForTimeout(160);
    off.push(...await pg.evaluate(() => { const L = window.__lab, l = LESSON.LIST[L.lesson().i], v = L.view(), card = L.practice().lessonCard, inR = (r, p) => !!r && p[0] >= r.x && p[0] <= r.x + r.w && p[1] >= r.y && p[1] <= r.y + r.h;
      return l.steps.filter(st => st[1] === 'aim').map(st => ({ id: l.id, p: L.toScreen(st[2], st[3]) })).filter(q => q.p[0] < v.play.x + 4 || q.p[0] > v.play.x + v.play.w - 4 || q.p[1] < v.play.y + 4 || q.p[1] > v.play.y + v.play.h - 4 || inR(card, q.p)).map(q => ({ id: q.id, x: Math.round(q.p[0]), y: Math.round(q.p[1]) })); })); }
  await pg.keyboard.press('KeyO'); await pg.waitForTimeout(160); // 자유 연습으로
  check('시범이 겨누는 곳이 모두 플레이 구역 안이고 과제 카드에 가려지지 않는다', off.length === 0, off.map(q => `${q.id}(${q.x},${q.y})`).join(' '));
  for (let i = 0; i < names.length; i++) {
    await pg.keyboard.press('KeyO'); await pg.waitForTimeout(150);
    const li = await pg.evaluate(() => window.__lab.lesson().i); if (li !== i) { check(`과제 ${i + 1} 열기`, false, `지금 ${li}`); continue; }
    await pg.keyboard.press('KeyP'); await pg.waitForTimeout(names[i][1] * 1000 + 700);
    const r = await pg.evaluate(() => { const l = window.__lab.lesson(); return { demo: l.demo, ok: l.demoOk, n: l.demoRec ? l.demoRec.bars.length + l.demoRec.taps.length : 0 }; });
    check(`시범 ${i + 1}: ${names[i][0]}`, r.demo === false && r.ok === true && r.n > 0, `기록된 입력 ${r.n}개`);
    if (shot && i === 3) await pg.screenshot({ path: path.join(shot, 'lesson_after_demo.png') });
  }
  // 시범 유령: 첫 입력 전에는 없고, 내 첫 입력 순간 시범의 첫 입력 시각에서 출발해 같은 빠르기로 함께 간다. 0초 = 첫 입력
  const g0 = await pg.evaluate(() => window.__lab.lesson().ghost);
  await pg.keyboard.press('KeyR'); await pg.waitForTimeout(400);
  const g1 = await pg.evaluate(() => window.__lab.lesson().ghost);
  check('유령: 내 첫 입력 전에는 없다', g1 === null, g0 === null ? '' : '(시범 뒤에 남아 있었음)');
  await pg.keyboard.down('Space'); await pg.waitForTimeout(250);
  const g2 = await pg.evaluate(() => { const l = window.__lab.lesson(), L = LESSON.LIST[l.i]; return { g: l.ghost, el: window.__lab.s.t - l.rec.t0, f: LESSON.firstInput(L), zero: l.rec.zero(), t0: l.rec.t0 }; });
  check('유령: 내 첫 입력에 맞춰 시범의 첫 입력 시각에서 출발한다', !!g2.g && Math.abs(g2.g.t - (g2.f + g2.el)) < 0.03, g2.g ? `유령 ${g2.g.t.toFixed(2)}초 = 시범 첫 입력 ${g2.f} + 지난 시간 ${g2.el.toFixed(2)}` : '없음');
  check('타임라인의 0초 = 첫 입력', g2.zero === g2.t0);
  await pg.keyboard.up('Space'); await pg.keyboard.press('KeyU'); await pg.waitForTimeout(100);
  check('U로 유령을 끈다', (await pg.evaluate(() => window.__lab.lesson().ghost)) === null);
  await pg.keyboard.press('KeyU'); await pg.keyboard.press('KeyR'); await pg.waitForTimeout(300);
  if (shot) await pg.screenshot({ path: path.join(shot, 'lesson_ghost.png') });
  // 직접 입력도 기록된다: Space를 0.3초 누르면 내 입력에 0.3초쯤의 막대가 남는다
  await pg.keyboard.down('Space'); await pg.waitForTimeout(300); await pg.keyboard.up('Space'); await pg.waitForTimeout(150);
  const mine = await pg.evaluate(() => { const r = window.__lab.lesson().rec, b = r.bars.find(q => q.id === 'power'); return b ? b.b - b.a : null; });
  check('내 입력 기록: Space를 누른 시간이 남는다(0.2~0.45초)', mine !== null && mine > 0.2 && mine < 0.45, mine === null ? '없음' : mine.toFixed(2) + '초');
  // 유령을 껐다 켜면 처음부터가 아니라 내 경과 시간에 맞는 자리에서 이어 간다(v0.9.1에서는 시범의 첫 입력으로 돌아갔다)
  await pg.keyboard.press('KeyR'); await pg.waitForTimeout(300); await pg.keyboard.down('KeyW'); await pg.waitForTimeout(500);
  await pg.keyboard.press('KeyU'); await pg.waitForTimeout(400); await pg.keyboard.press('KeyU'); await pg.waitForTimeout(200);
  const g3 = await pg.evaluate(() => { const l = window.__lab.lesson(), L = LESSON.LIST[l.i]; return { g: l.ghost, want: Math.min(L.T, LESSON.firstInput(L) + window.__lab.s.t - l.rec.t0) }; });
  await pg.keyboard.up('KeyW');
  check('유령을 껐다 켜면 내 경과 시간에 맞는 자리로 돌아온다', !!g3.g && Math.abs(g3.g.t - g3.want) < 0.03, g3.g ? `유령 ${g3.g.t.toFixed(2)}초, 맞는 시각 ${g3.want.toFixed(2)}초` : '없음');
  await pg.keyboard.press('KeyO'); await pg.waitForTimeout(150);
  check('마지막 과제 다음은 자유 연습', (await pg.evaluate(() => window.__lab.lesson().i)) === -1);
  // 실제 마우스·키 입력으로 한 시도의 기록(조준점 이동 포함)을 다시 계산하면 화면의 몸과 같은 자리에 온다 → 저장·재생에 쓸 수 있는 기록이다
  for (let i = 0; i < 4; i++) { await pg.keyboard.press('KeyO'); await pg.waitForTimeout(140); }
  await gmove(300, 300); await gmove(575, 218, { steps: 12 }); await pg.waitForTimeout(200); await gclick(575, 218, { button: 'right' }); await pg.waitForTimeout(900);
  await pg.keyboard.down('Space'); await pg.waitForTimeout(140); await gclick(577, 220); await pg.waitForTimeout(330); await pg.keyboard.up('Space'); await pg.waitForTimeout(700);
  const rp = await pg.evaluate(() => { const lab = window.__lab, S = lab.s, rec = lab.lesson().rec, s2 = PH.create(S.world, S.station), ctl = CTRL.make('intent'), pl = LESSON.player({ steps: LESSON.toSteps(rec) });
    const d0 = Math.max(...s2.p.map((q, i) => Math.hypot(q.x - rec.meta.start[i][0], q.y - rec.meta.start[i][1])));
    while (s2.t < S.t - 1e-9) PH.step(s2, ctl.step(s2, pl.step(s2.t), 1 / 120), 1 / 120);
    return { d: Math.max(...s2.p.map((q, i) => Math.hypot(q.x - S.p[i].x, q.y - S.p[i].y))), d0, aim: rec.aim.length, ev: rec.ev.length, t: S.t, meta: rec.meta, moved: Math.hypot(S.p[0].x - rec.meta.start[0][0], S.p[0].y - rec.meta.start[0][1]) }; });
  check('내 시도의 기록을 다시 계산하면 화면의 몸과 같은 자리', rp.d < 1e-6 && rp.d0 < 0.01 && rp.aim > 5 && rp.ev >= 4 && rp.moved > 30, `차이 ${rp.d.toExponential(1)}px · ${rp.t.toFixed(2)}초 · 조준 ${rp.aim}개 · 입력 ${rp.ev}개 · 몸이 움직인 거리 ${Math.round(rp.moved)}px`);
  check('기록에 판 번호·설정·출발 상태가 붙는다', !!rp.meta && /^v\d/.test(rp.meta.build) && /^v\d/.test(rp.meta.phys) && rp.meta.lessons >= 1 && rp.meta.lesson === 'jump1' && rp.meta.body === 'joint' && rp.meta.opt.handMode === 1 && rp.meta.start.length === 6, rp.meta ? `빌드 ${rp.meta.build} · 물리 ${rp.meta.phys} · 과제 묶음 ${rp.meta.lessons}판 · ${rp.meta.lesson}` : '없음');
  // 과제 중에는 몸·물리·벽·조작 방식을 바꾸는 키가 잠긴다
  await pg.keyboard.press('Minus'); await pg.keyboard.press('Backquote'); await pg.waitForTimeout(150); // 조작 방식 키는 v0.15.0부터 ` (Tab은 보기 설정)
  check('과제 중에는 몸·조작 방식 바꾸기가 잠긴다', await pg.evaluate(() => PH.getBody() === 'joint' && window.__lab.lesson().i === 3 && !!window.__lab.ctrlState().mark));
  for (let i = 0; i < 3; i++) { await pg.keyboard.press('KeyO'); await pg.waitForTimeout(140); }
  // 내 설정이 달라도 시범은 기준 설정으로 성공한다: 손 선택 2번(H) + 자동 발 끔(F) + 닿으면 잡기 끔(V) + 자동 싣기 켬(N)으로 바꾸고 다시 여섯 과제
  for (const k of ['KeyH', 'KeyF', 'KeyV', 'KeyN']) await pg.keyboard.press(k); await pg.waitForTimeout(100);
  const mine0 = await pg.evaluate(() => ({ ...window.__lab.opt() }));
  for (let i = 0; i < names.length; i++) {
    await pg.keyboard.press('KeyO'); await pg.waitForTimeout(150);
    if (i === 0) { for (const k of ['KeyF', 'KeyV', 'KeyN']) await pg.keyboard.press(k); await pg.waitForTimeout(80); if (shot) await pg.screenshot({ path: path.join(shot, 'lesson_settings.png') }); } // 과제 안에서도 다시 바꿔 둔다(들어올 때 기준에 맞춰졌으므로)
    await pg.keyboard.press('KeyP'); await pg.waitForTimeout(names[i][1] * 1000 + 700);
    const r = await pg.evaluate(() => { const l = window.__lab.lesson(); return { i: l.i, demo: l.demo, ok: l.demoOk }; });
    check(`내 설정이 달라도(손 선택 2번·자동 발 끔 등) 시범 ${i + 1} 성공`, r.i === i && r.demo === false && r.ok === true);
  }
  await pg.keyboard.press('KeyO'); await pg.waitForTimeout(150);
  const mine1 = await pg.evaluate(() => ({ ...window.__lab.opt() }));
  check('과제를 나오면 들어가기 전 설정으로 돌아온다', JSON.stringify(mine0) === JSON.stringify(mine1), JSON.stringify(mine1));
  console.log('페이지 오류:', errs.join(';') || '없음', '| 실패', fail); await b.close(); process.exit(fail || errs.length ? 1 : 0);
})();
