// 게임 화면 안 글자 크기 비교 화면(v0.16.3): 차트를 아래(게임 화면 66%)에 둔 1280×720 화면에서 ① 시작 자세 3 + 발 조종 키 미리보기 ② 과제 4(목표 이름표) ③ 확대 2배.
// 사용: node test/text_scale_shots.js <폴더> [빌드 폴더(기본 = 이 lab)]
'use strict';
const { chromium } = require('playwright'), path = require('path'), fs = require('fs');
const out = process.argv[2], LAB = process.argv[3] ? path.resolve(process.argv[3]) : path.join(__dirname, '..'), url = 'file://' + path.join(LAB, 'climb_lab.html'), K = 1280 / 960;
(async () => {
  fs.mkdirSync(out, { recursive: true }); const b = await chromium.launch(), pg = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage(), lab = f => pg.evaluate(f), wait = ms => pg.waitForTimeout(ms);
  const amove = async (x, y) => { const v = await lab(() => window.__lab.view()); await pg.mouse.move((v.x0 + (x - v.ox) * v.s) * K, (v.y0 + (y - v.oy) * v.s) * K, { steps: 6 }); };
  await pg.goto(url); await wait(800); await pg.keyboard.press('Digit3'); await wait(1000);
  const spot = await lab(() => { const S = window.__lab.s; if (!CTRL.footReach) return { x: 230, y: 505 }; for (let x = 40; x < 600; x += 4) for (let y = 300; y < 560; y += 4) { const only = (x, y) => { const fa = CTRL.footAim(S, x, y); return fa && CTRL.footReach(S, 2, fa.x, fa.y).ok && !CTRL.footReach(S, 3, fa.x, fa.y).ok; }; if ([[0, 0], [-3, -3], [3, -3], [-3, 3], [3, 3]].every(([u, w]) => only(x + u, y + w))) return { x, y }; } return { x: 230, y: 505 }; });
  await amove(spot.x, spot.y); await wait(300); await pg.keyboard.down('ShiftLeft'); await wait(500); await pg.screenshot({ path: path.join(out, '1_발미리보기_66.png') }); await pg.keyboard.up('ShiftLeft');
  for (let i = 0; i < 4; i++) { await pg.keyboard.press('KeyO'); await wait(150); } await amove(575, 218); await wait(600); await pg.screenshot({ path: path.join(out, '2_과제4_66.png') });
  const v = await lab(() => window.__lab.view()); await pg.mouse.move((v.x0 + 400 * v.s) * K, (v.y0 + 200 * v.s) * K); for (let i = 0; i < 4; i++) { await pg.mouse.wheel(0, -100); await wait(200); } await wait(500);
  await pg.screenshot({ path: path.join(out, '3_과제4_확대.png') });
  console.log('배율', JSON.stringify(await lab(() => window.__lab.view().s))); await b.close();
})();
