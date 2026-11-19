// v0.10 영상: 키캡의 눌림·해제(약 10초). 차트 구역을 켠 채로 Q·E·좌클릭·우클릭·Shift+좌클릭·Space·W를 차례로 누른다(스크립트 입력, 사람 손 아님). 사용: node test/record_v10.js
'use strict';
const { chromium } = require('playwright'), fs = require('fs'), path = require('path');
const url = 'file://' + path.join(__dirname, '..', 'climb_lab.html'), out = path.join(__dirname, '..', 'recordings'), K = 1280 / 960;
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: out, size: { width: 1280, height: 720 } } });
  const pg = await ctx.newPage(), errs = []; pg.on('pageerror', e => errs.push(e.message)); await pg.goto(url); await pg.waitForTimeout(900);
  // 게임 화면 좌표(960×540 기준) → 지금 화면의 자리(차트 구역이 켜져 있으면 게임 화면이 줄어 있다)
  const g2s = async (x, y) => { const v = await pg.evaluate(() => window.__lab.view()); return [(v.x0 + x * v.s) * K, (v.y0 + y * v.s) * K]; }, gmove = async (x, y, o) => { const q = await g2s(x, y); return pg.mouse.move(q[0], q[1], o); }, gclick = async (x, y, o) => { const q = await g2s(x, y); return pg.mouse.click(q[0], q[1], o); };
  const hold = async (down, up, ms) => { await down(); await pg.waitForTimeout(ms); await up(); await pg.waitForTimeout(450); };
  await gmove(250, 170, { steps: 6 }); await pg.waitForTimeout(400);
  await hold(() => pg.keyboard.down('KeyQ'), () => pg.keyboard.up('KeyQ'), 450);          // 왼손(보조 입력 Q)
  await hold(() => pg.mouse.down(), () => pg.mouse.up(), 450);                              // 왼손(주 입력 좌클릭)
  await gmove(420, 170, { steps: 6 });
  await hold(() => pg.keyboard.down('KeyE'), () => pg.keyboard.up('KeyE'), 450);          // 오른손(보조 입력 E)
  await hold(() => pg.mouse.down({ button: 'right' }), () => pg.mouse.up({ button: 'right' }), 450); // 오른손(우클릭)
  await gmove(330, 345, { steps: 6 }); await pg.keyboard.down('ShiftLeft'); await pg.waitForTimeout(250);
  await hold(() => pg.mouse.down(), () => pg.mouse.up(), 450); await pg.keyboard.up('ShiftLeft'); await pg.waitForTimeout(450); // 왼발(왼 Shift + 좌클릭)
  await hold(() => pg.keyboard.down('KeyW'), () => pg.keyboard.up('KeyW'), 700);          // 몸 위로
  await hold(() => pg.keyboard.down('Space'), () => pg.keyboard.up('Space'), 800);        // 모으기
  await pg.waitForTimeout(700);
  const v = pg.video(); await ctx.close(); await b.close(); fs.renameSync(await v.path(), path.join(out, 'v10_input_ui_press.webm')); console.log('v10_input_ui_press 페이지 오류:', errs.join(';') || '없음');
})();
