// v0.9 영상: 연습 과제의 시범(적어 둔 입력 재생)과 입력 기록 차트, 이어서 조금 다르게 누른 시도(스크립트 입력, 사람 손 아님). 사용: node test/record_v09.js
'use strict';
const { chromium } = require('playwright'), fs = require('fs'), path = require('path');
const url = 'file://' + path.join(__dirname, '..', 'climb_lab.html'), out = path.join(__dirname, '..', 'recordings');
const sx = x => x + 30, sy = y => y - 40; // 6번 과제는 높은 턱이 보이게 화면 세로 기준이 40이다(lessons.js의 view)
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 960, height: 540 }, recordVideo: { dir: out, size: { width: 960, height: 540 } } });
  const pg = await ctx.newPage(); await pg.goto(url); await pg.waitForTimeout(500);
  for (let i = 0; i < 6; i++) { await pg.keyboard.press('KeyO'); await pg.waitForTimeout(140); } // 6번째 과제: 온몸 도약
  await pg.waitForTimeout(900); await pg.keyboard.press('KeyP'); await pg.waitForTimeout(5400);       // 시범
  // 직접 해 보는 것처럼: 같은 순서인데 Space를 0.5초만 누르고 W를 누르지 않는다 → 못 미친다. 차트에서 시범과 차이가 보인다
  await pg.mouse.move(sx(307), sy(98), { steps: 8 }); await pg.waitForTimeout(300); await pg.mouse.click(sx(307), sy(98), { button: 'right' }); await pg.waitForTimeout(1000);
  await pg.keyboard.down('Space'); await pg.waitForTimeout(120); await pg.mouse.click(sx(307), sy(98)); await pg.waitForTimeout(380); await pg.keyboard.up('Space'); await pg.waitForTimeout(2600);
  const r = await pg.evaluate(() => window.__lab.lesson().demoOk);
  const v = pg.video(); await ctx.close(); await b.close(); fs.renameSync(await v.path(), path.join(out, 'v09_lesson_demo.webm')); console.log('v09_lesson_demo 시범 성공:', r);
})();
