// v0.6 영상: 실제 브라우저에 마우스·키 입력을 넣어 성공 1회·실패 1회를 녹화한다(사람 손이 아니라 스크립트 입력). 사용: node test/record_v06.js
'use strict';
const { chromium } = require('playwright'), fs = require('fs'), path = require('path');
const url = 'file://' + path.join(__dirname, '..', 'climb_lab.html'), out = path.join(__dirname, '..', 'recordings');
const sx = x => x + 30, sy = y => y - 130;
async function clip(name, act) {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 960, height: 540 }, recordVideo: { dir: out, size: { width: 960, height: 540 } } });
  const pg = await ctx.newPage(); await pg.goto(url); await pg.waitForTimeout(500); await pg.keyboard.press('Digit3'); await pg.waitForTimeout(600);
  const res = await act(pg); await pg.waitForTimeout(400); const v = pg.video(); await ctx.close(); await b.close();
  fs.renameSync(await v.path(), path.join(out, name + '.webm')); console.log(name, res);
}
(async () => {
  // 성공: 턱 가운데를 겨누고(손 미리보기가 보이게 잠시 멈춤), Space를 누른 채 좌·우클릭으로 두 손 지정, 떼서 잡기
  await clip('v06_success', async pg => {
    await pg.mouse.move(sx(400), sy(330), { steps: 10 }); await pg.waitForTimeout(500); await pg.mouse.move(sx(545), sy(348), { steps: 20 }); await pg.waitForTimeout(900);
    await pg.keyboard.down('Space'); await pg.waitForTimeout(200); await pg.mouse.click(sx(545), sy(348)); await pg.waitForTimeout(120); await pg.mouse.click(sx(545), sy(348), { button: 'right' });
    await pg.waitForTimeout(500); await pg.keyboard.up('Space'); await pg.waitForTimeout(2600);
    return await pg.evaluate(() => window.__lab.s.limb.map(l => l.mode + (l.anchor ? '@' + l.anchor.poly : '')).join(','));
  });
  // 턱 위로 올라서기: 건너편 턱으로 뛰어 잡은 뒤 W를 누르고 있으면 당겨 올라가 턱 위로 올라서고, 발이 턱 윗면을 딛는다
  if (process.argv[2] === 'mantle' || process.argv[2] === 'all') await clip('v061_mantle', async pg => {
    await pg.mouse.move(sx(545), sy(348), { steps: 15 }); await pg.waitForTimeout(500);
    await pg.keyboard.down('Space'); await pg.waitForTimeout(200); await pg.mouse.click(sx(545), sy(348)); await pg.waitForTimeout(120); await pg.mouse.click(sx(545), sy(348), { button: 'right' });
    await pg.waitForTimeout(500); await pg.keyboard.up('Space'); await pg.waitForTimeout(2200);
    await pg.mouse.move(sx(560), sy(220), { steps: 10 }); await pg.keyboard.down('KeyW'); await pg.waitForTimeout(2200); await pg.keyboard.up('KeyW'); await pg.waitForTimeout(2200);
    return await pg.evaluate(() => (345 - window.__lab.s.p[0].y).toFixed(0) + 'px above ledge, ' + window.__lab.s.limb.map(l => l.mode + (l.anchor ? '@' + l.anchor.poly : l.poly && l.mode === 'plant' ? '@' + l.poly : '')).join(','));
  });
  if (process.argv[2] === 'mantle') return;
  // 실패: 턱 가까운 끝을 겨누고 길게 모아(세기를 잘못 골라) 손이 겨눈 구간을 지나쳐 떨어진다 → 화면에 원인과 바꿀 것
  await clip('v06_fail', async pg => {
    await pg.mouse.move(sx(400), sy(330), { steps: 10 }); await pg.waitForTimeout(400); await pg.mouse.move(sx(482), sy(348), { steps: 15 }); await pg.waitForTimeout(800);
    await pg.keyboard.down('Space'); await pg.waitForTimeout(200); await pg.mouse.click(sx(482), sy(348)); await pg.waitForTimeout(120); await pg.mouse.click(sx(482), sy(348), { button: 'right' });
    await pg.waitForTimeout(500); await pg.keyboard.up('Space'); await pg.waitForTimeout(1500);
    await pg.screenshot({ path: path.join(out, 'v06_fail.png') }); await pg.waitForTimeout(1000);
    return await pg.evaluate(() => window.__lab.s.dead ? 'fell' : window.__lab.s.limb.map(l => l.mode).join(','));
  });
})();
