// 브라우저 확인 + 녹화. 사용: node test/record.js  (Playwright 필요)
'use strict';
const { chromium } = require('playwright'), fs = require('fs'), path = require('path');
const url = 'file://' + path.join(__dirname, '..', 'climb_lab.html'), out = path.join(__dirname, '..', 'recordings');
(async () => {
  const b = await chromium.launch();
  // 2) 자동 시연 녹화
  for (const name of (process.argv[2] ? process.argv[2].split(' ') : ['swing', 'jump', 'jug', 'top', 'early', 'late', 'footpos'])) {
    const ctx = await b.newContext({ viewport: { width: 960, height: 540 }, recordVideo: { dir: out, size: { width: 960, height: 540 } } });
    const pg = await ctx.newPage(); await pg.goto(url + '?auto=' + name);
    await pg.waitForFunction(() => window.__lab.s.dead || window.__lab.bot.m.done, null, { timeout: 40000 });
    await pg.waitForTimeout(900); await pg.screenshot({ path: path.join(out, name.replace(',', '+') + '.png') });
    await pg.waitForFunction(() => window.__lab.finished, null, { timeout: 40000 });
    const res = await pg.evaluate(() => window.__lab.results);
    await pg.waitForTimeout(300); const v = pg.video(); await ctx.close();
    fs.renameSync(await v.path(), path.join(out, name.replace(',', '+') + '.webm'));
    console.log('녹화', name, JSON.stringify(res));
  }
  await b.close();
})();
