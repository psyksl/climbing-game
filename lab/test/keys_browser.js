// 실제 브라우저에 키·마우스 이벤트를 넣어 새 조작(A안·B안)의 첫 시험 ①을 해 본다. 사용: node test/keys_browser.js
'use strict';
const { chromium } = require('playwright'), path = require('path');
const url = 'file://' + path.join(__dirname, '..', 'climb_lab.html'), shot = process.argv[2];
(async () => {
  const b = await chromium.launch(); let fail = 0;
  const check = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`); if (!c) fail++; };
  const modes = pg => pg.evaluate(() => window.__lab.s.limb.map(l => l.mode).join(','));
  { // A안: 2번 자세(오른손 매달림) → A로 왼발 집기 → 커서를 발판 위로 → 좌클릭으로 디디기
    const pg = await b.newPage({ viewport: { width: 960, height: 540 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(url + '?mode=pick&phys=v04&body=base'); await pg.waitForTimeout(300); await pg.keyboard.press('Digit2'); await pg.waitForTimeout(300);
    await pg.mouse.move(302 + 30, 465 - 130); await pg.keyboard.press('KeyA'); await pg.waitForTimeout(500);
    check('A안: A를 한 번 누르면 왼발이 떼어져 커서를 따라온다(누르고 있지 않음)', (await modes(pg)).split(',')[2] === 'reach');
    if (shot) await pg.screenshot({ path: shot + '_pick.png' });
    await pg.mouse.click(302 + 30, 465 - 130); await pg.waitForTimeout(300);
    check('A안: 좌클릭으로 왼발이 발판에 디뎌지고 오른손은 그대로', (await modes(pg)) === 'free,grip,plant,free', await modes(pg));
    await pg.keyboard.press('KeyQ'); await pg.mouse.move(700, 150); await pg.waitForTimeout(300); await pg.mouse.click(700, 150); await pg.waitForTimeout(150);
    check('A안: 닿은 곳 없이 클릭하면 붙지 않고 계속 들고 있다', (await modes(pg)).split(',')[0] === 'reach');
    await pg.mouse.click(700, 150, { button: 'right' }); await pg.waitForTimeout(150);
    check('A안: 우클릭으로 힘 빼기', (await modes(pg)).split(',')[0] === 'free');
    await pg.keyboard.down('KeyC'); await pg.waitForTimeout(250); const sw = (await modes(pg)).split(',')[3]; await pg.keyboard.up('KeyC'); await pg.waitForTimeout(150);
    check('A안: C를 누르는 동안만 남은 다리가 움직이고, 놓으면 디뎌지지 않고 힘이 빠진다', sw === 'reach' && (await modes(pg)).split(',')[3] === 'free');
    console.log('   페이지 오류:', errs.join(';') || '없음'); await pg.close(); }
  { // B안: Z로 왼발 고르기 → S·A로 이동 → Z로 접촉 시도. 동시에 U가 아닌 M(오른발)을 L로 움직여 좌우 독립 확인
    const pg = await b.newPage({ viewport: { width: 960, height: 540 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(url + '?mode=keys&phys=v04&body=base'); await pg.waitForTimeout(300); await pg.keyboard.press('Digit2'); await pg.waitForTimeout(300);
    const pos = () => pg.evaluate(() => { const s = window.__lab.s; return [s.p[4].x - s.p[1].x, s.p[4].y - s.p[1].y, s.p[5].x - s.p[1].x, s.p[5].y - s.p[1].y]; });
    await pg.keyboard.press('KeyZ'); await pg.keyboard.press('KeyM'); await pg.waitForTimeout(100); const p0 = await pos();
    await pg.keyboard.down('KeyA'); await pg.keyboard.down('KeyL'); await pg.waitForTimeout(350); await pg.keyboard.up('KeyA'); await pg.keyboard.up('KeyL'); const p1 = await pos();
    check('B안: 왼발은 왼쪽(A), 오른발은 오른쪽(L)으로 동시에 따로 움직인다', p1[0] - p0[0] < -25 && p1[2] - p0[2] > 25, `왼발 ${(p1[0] - p0[0]).toFixed(0)}px, 오른발 +${(p1[2] - p0[2]).toFixed(0)}px`);
    if (shot) await pg.screenshot({ path: shot + '_keys.png' });
    // 왼발을 발판 윗면(302,463)으로 몰고 가서 붙이기
    for (let k = 0; k < 120; k++) { const f = await pg.evaluate(() => { const s = window.__lab.s; return [s.p[4].x, s.p[4].y]; }); const dx = 302 - f[0], dy = 463 - f[1];
      for (const [key, on] of [['KeyA', dx < -5], ['KeyD', dx > 5], ['KeyW', dy < -5], ['KeyS', dy > 5]]) await (on ? pg.keyboard.down(key) : pg.keyboard.up(key));
      if (Math.abs(dx) <= 5 && Math.abs(dy) <= 5) break; await pg.waitForTimeout(25); }
    await pg.waitForTimeout(150); await pg.keyboard.press('KeyZ'); await pg.waitForTimeout(250);
    check('B안: 같은 키(Z)를 다시 눌러 왼발이 발판에 디뎌지고 오른손은 그대로', (await modes(pg)).startsWith('free,grip,plant'), await modes(pg));
    console.log('   페이지 오류:', errs.join(';') || '없음'); await pg.close(); }
  await b.close(); process.exit(fail ? 1 : 0);
})();
