// 브라우저 확인 + 녹화. 사용: node test/record.js  (Playwright 필요)
'use strict';
const { chromium } = require('playwright'), fs = require('fs'), path = require('path');
const url = 'file://' + path.join(__dirname, '..', 'climb_lab.html'), out = path.join(__dirname, '..', 'recordings');
(async () => {
  const b = await chromium.launch();
  // 1) 실제 입력 경로: 마우스 버튼·키가 손발 상태로 이어지는지
  { const pg = await b.newPage({ viewport: { width: 960, height: 540 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(url); await pg.waitForTimeout(400);
    const st = () => pg.evaluate(() => window.__lab.s.limb.map(l => l.mode).join(','));
    const r = [await st()];
    await pg.mouse.move(380, 200); await pg.mouse.down({ button: 'left' }); await pg.waitForTimeout(300); r.push(await st());
    await pg.mouse.up({ button: 'left' }); await pg.waitForTimeout(100); r.push(await st());
    await pg.mouse.move(300 - -30, 300 - 130 + 0); await pg.mouse.down({ button: 'left' }); await pg.waitForTimeout(400); await pg.mouse.up({ button: 'left' }); await pg.waitForTimeout(100); r.push(await st());
    await pg.keyboard.down('KeyA'); await pg.waitForTimeout(200); r.push(await st()); await pg.keyboard.up('KeyA');
    await pg.keyboard.press('Digit3'); await pg.waitForTimeout(200); r.push(await st());
    console.log('입력 확인:', r.join(' | '), '오류:', errs.join(';') || '없음'); await pg.close(); }
  // 2) 자동 시연 녹화
  for (const name of ['swing', 'jump', 'jug', 'top', 'early', 'late']) {
    const ctx = await b.newContext({ viewport: { width: 960, height: 540 }, recordVideo: { dir: out, size: { width: 960, height: 540 } } });
    const pg = await ctx.newPage(); await pg.goto(url + '?auto=' + name);
    await pg.waitForFunction(() => window.__lab.s.dead || window.__lab.bot.m.done, null, { timeout: 40000 });
    await pg.waitForTimeout(700); await pg.screenshot({ path: path.join(out, name + '.png') });
    await pg.waitForFunction(() => window.__lab.finished, null, { timeout: 40000 });
    const res = await pg.evaluate(() => window.__lab.results[0]);
    await pg.waitForTimeout(300); const v = pg.video(); await ctx.close();
    fs.renameSync(await v.path(), path.join(out, name + '.webm'));
    console.log('녹화', name, JSON.stringify(res));
  }
  await b.close();
})();
