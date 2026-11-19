// W1 영상: 실제 키 입력(키보드 이벤트)으로 걷기 → 달리기 → 멈춤 → 돌기 → 웅크려 걷기 → 짧은 점프 → 모은 점프 → 낮은 단 → 높은 단 뛰어오르기 → Alt+마우스 시점. 스크립트 입력(사람 손 아님).
// 사용: node test/record_w1.js [영상 이름]
'use strict';
const { chromium } = require('playwright'), fs = require('fs'), path = require('path');
const url = 'file://' + path.join(__dirname, '..', 'climb3d.html') + '?noshadow', out = path.join(__dirname, '..', 'recordings'), name = process.argv[2] || 'w1_basic_motion';
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 960, height: 540 }, recordVideo: { dir: out, size: { width: 960, height: 540 } } }), pg = await ctx.newPage(), errs = [];
  pg.on('pageerror', e => errs.push(e.message)); const k = pg.keyboard, w = ms => pg.waitForTimeout(ms), log = [];
  const note = async tag => log.push({ tag, t: (await pg.evaluate(() => __p3.body().t)).toFixed(2), state: await pg.evaluate(() => __p3.state()), fps: await pg.evaluate(() => document.getElementById('hud').innerText.match(/(\d+) fps/)?.[1]) });
  await pg.goto(url); await w(1200); await pg.mouse.move(480, 270);
  await k.down('KeyW'); await w(1500); await note('걷기'); await k.down('ShiftLeft'); await w(1600); await note('달리기'); await k.up('ShiftLeft'); await w(700); await k.up('KeyW'); await w(900); await note('멈춤');
  await k.down('KeyS'); await w(500); await k.up('KeyS'); await w(900); await note('돌기');
  await k.down('KeyC'); await k.down('KeyW'); await w(1300); await note('웅크려 걷기'); await k.up('KeyW'); await w(500); await k.up('KeyC'); await w(600);
  await k.down('Space'); await w(80); await k.up('Space'); await w(1100); await note('짧은 점프');
  await k.down('Space'); await w(650); await note('모으기'); await k.up('Space'); await w(1300); await note('모은 점프');
  // 시점: Alt를 누른 채 마우스를 옮긴다(캐릭터는 움직이지 않아야 한다)
  const before = await pg.evaluate(() => __p3.body().pos);
  await k.down('AltLeft'); for (let i = 0; i < 30; i++) { await pg.mouse.move(480 + i * 12, 270 + Math.sin(i / 5) * 20); await w(40); } await k.up('AltLeft'); await w(400);
  const after = await pg.evaluate(() => __p3.body().pos); await note('시점 돌림');
  for (let i = 0; i < 3; i++) { await pg.mouse.wheel(0, 120); await w(150); } await w(500);
  await k.press('KeyR'); await w(800);
  const fin = { camMovedBody: Math.hypot(after[0] - before[0], after[2] - before[2]) };
  const vd = pg.video(); await ctx.close(); await b.close(); fs.renameSync(await vd.path(), path.join(out, name + '.webm'));
  console.log(JSON.stringify({ log, fin, errs }, null, 1));
})();
