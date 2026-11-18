// 실제 브라우저에서 연습 과제의 시범이 모두 성공하는지, 입력 기록이 남는지 확인한다. 사용: node test/lessons_browser.js [스크린샷 폴더]
'use strict';
const { chromium } = require('playwright'), path = require('path');
const url = 'file://' + path.join(__dirname, '..', 'climb_lab.html'), shot = process.argv[2];
(async () => {
  const b = await chromium.launch(); let fail = 0; const check = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`); if (!c) fail++; };
  const pg = await b.newPage({ viewport: { width: 960, height: 540 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(url); await pg.waitForTimeout(400);
  const names = await pg.evaluate(() => LESSON.LIST.map(l => [l.name, l.T]));
  for (let i = 0; i < names.length; i++) {
    await pg.keyboard.press('KeyO'); await pg.waitForTimeout(150);
    const li = await pg.evaluate(() => window.__lab.lesson().i); if (li !== i) { check(`과제 ${i + 1} 열기`, false, `지금 ${li}`); continue; }
    await pg.keyboard.press('KeyP'); await pg.waitForTimeout(names[i][1] * 1000 + 700);
    const r = await pg.evaluate(() => { const l = window.__lab.lesson(); return { demo: l.demo, ok: l.demoOk, n: l.demoRec ? l.demoRec.bars.length + l.demoRec.taps.length : 0 }; });
    check(`시범 ${i + 1}: ${names[i][0]}`, r.demo === false && r.ok === true && r.n > 0, `기록된 입력 ${r.n}개`);
    if (shot && i === 3) await pg.screenshot({ path: path.join(shot, 'lesson_after_demo.png') });
  }
  // 직접 입력도 기록된다: Space를 0.3초 누르면 내 입력에 0.3초쯤의 막대가 남는다
  await pg.keyboard.down('Space'); await pg.waitForTimeout(300); await pg.keyboard.up('Space'); await pg.waitForTimeout(150);
  const mine = await pg.evaluate(() => { const r = window.__lab.lesson().rec, b = r.bars.find(q => q.id === 'power'); return b ? b.b - b.a : null; });
  check('내 입력 기록: Space를 누른 시간이 남는다(0.2~0.45초)', mine !== null && mine > 0.2 && mine < 0.45, mine === null ? '없음' : mine.toFixed(2) + '초');
  await pg.keyboard.press('KeyO'); await pg.waitForTimeout(150);
  check('마지막 과제 다음은 자유 연습', (await pg.evaluate(() => window.__lab.lesson().i)) === -1);
  console.log('페이지 오류:', errs.join(';') || '없음', '| 실패', fail); await b.close(); process.exit(fail || errs.length ? 1 : 0);
})();
