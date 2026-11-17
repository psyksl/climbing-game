// 실제 브라우저(Chromium)에 키·마우스 이벤트를 넣어 D안(의도 조작)을 확인한다. 사용: node test/intent_browser.js [스크린샷 경로 앞부분]
'use strict';
const { chromium } = require('playwright'), path = require('path');
const url = 'file://' + path.join(__dirname, '..', 'climb_lab.html'), shot = process.argv[2], OX = -30, OY = 130;
const sx = x => x - OX, sy = y => y - OY; // 게임 좌표 → 화면 좌표
(async () => {
  const b = await chromium.launch(); let fail = 0;
  const check = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`); if (!c) fail++; };
  const pg = await b.newPage({ viewport: { width: 960, height: 540 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(url); await pg.waitForTimeout(300);
  const modes = () => pg.evaluate(() => window.__lab.s.limb.map(l => l.mode + (l.anchor ? '@' + l.anchor.poly : '')).join(','));
  const fresh = async k => { await pg.keyboard.press('Digit' + k); await pg.waitForTimeout(250); };
  // 1. 자동 발
  await fresh(2); await pg.mouse.move(sx(330), sy(330)); await pg.waitForTimeout(1200);
  check('자동 발: 오른손 매달림에서 기다리면 왼발이 발판에 디뎌짐', (await modes()).split(',')[2] === 'plant', await modes());
  // 2. 직접 발: F로 자동 끄고 Shift+좌클릭
  await pg.keyboard.press('KeyF'); await pg.waitForTimeout(100); await fresh(2);
  check('F로 자동 발 끄기', (await pg.evaluate(() => window.__lab.opt().autoFeet)) === false);
  await pg.keyboard.down('ShiftLeft'); await pg.mouse.click(sx(296), sy(466)); await pg.keyboard.up('ShiftLeft'); await pg.waitForTimeout(900);
  check('직접 발: Shift+좌클릭한 발판에 왼발이 디뎌지고 오른손 그대로', (await modes()).startsWith('free,grip@A,plant'), await modes());
  await pg.keyboard.press('KeyF'); await pg.waitForTimeout(100);
  check('F로 자동 발 다시 켜기', (await pg.evaluate(() => window.__lab.opt().autoFeet)) === true);
  // 3. Space를 누르지 않은 클릭은 손을 보낸다(던질 때 놓음 표시가 아니다)
  await fresh(1); await pg.mouse.click(sx(420), sy(250), { button: 'right' }); await pg.waitForTimeout(300); // 자동 체중 이동이 켜져 있으면 최대 0.2초 뒤에 떨어진다
  check('Space 없이 우클릭: 오른손이 (체중을 옮긴 뒤) 떨어져 커서로 감', (await modes()).split(',')[1] === 'reach', await modes());
  // 4. 두 손 다이노
  await fresh(3); await pg.mouse.move(sx(490), sy(345)); await pg.keyboard.down('Space'); await pg.waitForTimeout(250);
  await pg.mouse.click(sx(490), sy(345)); await pg.mouse.click(sx(490), sy(345), { button: 'right' }); await pg.waitForTimeout(150);
  const marked = await pg.evaluate(() => window.__lab.ctrlState().mark.join(','));
  check('Space를 누른 채 클릭: 손이 떨어지지 않고 "던질 때 놓음" 표시', marked === 'true,true' && (await modes()).startsWith('grip@A,grip@A'), marked);
  if (shot) await pg.screenshot({ path: shot + '_charge.png' });
  await pg.keyboard.up('Space'); await pg.waitForTimeout(1400);
  check('Space를 떼면 던지고, 두 손이 건너편 턱을 잡음', (await modes()).startsWith('grip@B,grip@B'), await modes());
  if (shot) await pg.screenshot({ path: shot + '_caught.png' });
  // 5. 세 점으로 버티다 오른손 멀리 잡기
  await fresh(3); await pg.mouse.move(sx(490), sy(345)); await pg.mouse.click(sx(490), sy(345), { button: 'right' }); await pg.waitForTimeout(500);
  await pg.keyboard.down('Space'); await pg.waitForTimeout(250); await pg.mouse.click(sx(490), sy(345)); await pg.waitForTimeout(250); await pg.keyboard.up('Space'); await pg.waitForTimeout(1400);
  check('오른손을 먼저 보내고, 왼손·두 발로 버티다 던져 오른손으로 건너편 잡기', (await modes()).split(',')[1] === 'grip@B', await modes());
  console.log('페이지 오류:', errs.join(';') || '없음', '| 실패', fail); await b.close(); process.exit(fail ? 1 : 0);
})();
