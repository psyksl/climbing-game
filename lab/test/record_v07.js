// v0.7 영상: 모으는 동안 A/D로 흔들다 떼는 도약. 실제 브라우저에 키·마우스 입력을 넣어 녹화한다(사람 손이 아니라 스크립트 입력). 사용: node test/record_v07.js
'use strict';
const { chromium } = require('playwright'), fs = require('fs'), path = require('path');
const url = 'file://' + path.join(__dirname, '..', 'climb_lab.html'), out = path.join(__dirname, '..', 'recordings');
const sx = x => x + 30, sy = y => y - 130;
async function clip(name, act) {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 960, height: 540 }, recordVideo: { dir: out, size: { width: 960, height: 540 } } });
  const pg = await ctx.newPage(); await pg.goto(url + '?body=base&chart=off'); await pg.waitForTimeout(500); await pg.keyboard.press('Digit3'); await pg.waitForTimeout(600);
  const res = await act(pg); await pg.waitForTimeout(400); const v = pg.video(); await ctx.close(); await b.close();
  fs.renameSync(await v.path(), path.join(out, name + '.webm')); console.log(name, res);
}
// 오른손을 건너편 턱 쪽으로 먼저 보내고(세 점), Space를 누른 채 왼손 지정 → A로 몸을 왼쪽에 실었다가 D → 엉덩이가 돌아서고 off초 뒤에 뗀다
const sway = off => async pg => {
  const tx = 600; await pg.mouse.move(sx(400), sy(330), { steps: 8 }); await pg.waitForTimeout(300); await pg.mouse.move(sx(tx), sy(348), { steps: 12 }); await pg.waitForTimeout(400);
  await pg.mouse.click(sx(tx), sy(348), { button: 'right' }); await pg.waitForTimeout(700);
  await pg.keyboard.down('Space'); await pg.waitForTimeout(60); await pg.mouse.click(sx(tx), sy(348)); await pg.keyboard.down('KeyA'); await pg.waitForTimeout(350);
  await pg.keyboard.up('KeyA'); await pg.keyboard.down('KeyD');
  const t0 = Date.now(); while (Date.now() - t0 < 1500) { const vx = await pg.evaluate(() => window.__lab.s.p[1].vx); if (vx > 5) break; await pg.waitForTimeout(8); }
  await pg.waitForTimeout(off * 1000); await pg.keyboard.up('Space'); await pg.keyboard.up('KeyD'); await pg.waitForTimeout(2200);
  return await pg.evaluate(() => window.__lab.s.dead ? 'fell' : window.__lab.s.limb.map(l => l.mode + (l.anchor ? '@' + l.anchor.poly : '')).join(','));
};
(async () => { await clip('v07_sway_ok', sway(0.1)); await clip('v07_sway_late', sway(0.4)); })();
