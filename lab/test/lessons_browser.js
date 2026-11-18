// 실제 브라우저에서 연습 과제의 시범이 모두 성공하는지, 입력 기록이 남는지 확인한다. 사용: node test/lessons_browser.js [스크린샷 폴더]
'use strict';
const { chromium } = require('playwright'), path = require('path');
const url = 'file://' + path.join(__dirname, '..', 'climb_lab.html'), shot = process.argv[2];
(async () => {
  const b = await chromium.launch(); let fail = 0; const check = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`); if (!c) fail++; };
  const pg = await b.newPage({ viewport: { width: 960, height: 540 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(url); await pg.waitForTimeout(400);
  const names = await pg.evaluate(() => LESSON.LIST.map(l => [l.name, l.T]));
  // 시범이 겨누는 곳은 모두 화면 안, 그리고 과제 카드(오른쪽)와 타임라인 띠(아래)에 가려지지 않는 곳이어야 한다(v0.9.0에서는 5·6번 과제의 높은 턱이 화면 밖에 있었다)
  const off = await pg.evaluate(() => LESSON.LIST.flatMap(l => l.steps.filter(st => st[1] === 'aim').map(st => ({ id: l.id, x: st[2] + 30, y: st[3] - (l.view !== undefined ? l.view : 130) })).filter(q => q.x < 8 || q.x > 720 || q.y < 30 || q.y > 400)));
  check('시범이 겨누는 곳이 모두 화면 안이고 가려지지 않는다', off.length === 0, off.map(q => `${q.id}(${q.x},${q.y})`).join(' '));
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
  await pg.keyboard.press('KeyO'); await pg.waitForTimeout(150);
  check('마지막 과제 다음은 자유 연습', (await pg.evaluate(() => window.__lab.lesson().i)) === -1);
  console.log('페이지 오류:', errs.join(';') || '없음', '| 실패', fail); await b.close(); process.exit(fail || errs.length ? 1 : 0);
})();
