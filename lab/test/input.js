// 실제 브라우저(Chromium)에 마우스·키 이벤트를 넣어 손 상태를 확인한다. 사용: node test/input.js [html경로]
'use strict';
const { chromium } = require('playwright'), path = require('path');
const url = 'file://' + path.resolve(process.argv[2] || path.join(__dirname, '..', 'climb_lab.html'));
(async () => {
  const b = await chromium.launch(); let fail = 0;
  const pg = await b.newPage({ viewport: { width: 960, height: 540 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(url); await pg.waitForTimeout(300);
  const hands = () => pg.evaluate(() => window.__lab.s.limb.slice(0, 2).map(l => l.mode === 'reach' ? 'R' : l.mode === 'grip' ? 'g' : 'f').join(''));
  const fresh = async () => { await pg.mouse.move(480, 300); await pg.keyboard.press('Digit1'); await pg.waitForTimeout(150); };
  const wait = () => pg.waitForTimeout(120);
  const check = async (name, want, wantRaw) => { await wait(); const got = await hands(), raw = await pg.evaluate(() => window.__lab.raw()); const ok = (want === null || got === want) && raw === wantRaw; if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: 눌림 인식 ${raw} (기대 ${wantRaw})${want === null ? '' : `, 손 상태 ${got} (기대 ${want})`}`); };
  // 표기: R = 누르는 동안 커서를 따라가는 중, g = 잡고 있음, f = 놓여 있음(허공)
  await fresh(); await pg.mouse.down({ button: 'left' }); await check('좌클릭 누름', 'Rg', 'L-');
  await pg.mouse.down({ button: 'right' }); await check('좌 누른 채 우클릭', 'RR', 'LR');
  await pg.mouse.up({ button: 'left' }); await check('둘 중 좌만 뗌', 'fR', '-R');
  await pg.mouse.up({ button: 'right' }); await check('우도 뗌', 'ff', '--');
  await fresh(); await pg.mouse.down({ button: 'right' }); await check('우클릭 누름', 'gR', '-R');
  await pg.mouse.down({ button: 'left' }); await check('우 누른 채 좌클릭', 'RR', 'LR');
  await pg.mouse.up({ button: 'right' }); await check('둘 중 우만 뗌', 'Rf', 'L-');
  await pg.mouse.up({ button: 'left' }); await check('좌도 뗌', 'ff', '--');
  await fresh(); await pg.mouse.down({ button: 'left' }); await pg.mouse.down({ button: 'right' }); await wait();
  await pg.mouse.move(1200, 700); await pg.mouse.up({ button: 'right' }); await check('창 밖으로 나가 우만 뗌', null, 'L-');
  await pg.mouse.up({ button: 'left' }); await check('창 밖에서 좌도 뗌', null, '--');
  await pg.mouse.move(480, 300); await check('창 안으로 돌아옴(눌린 채 남지 않음)', null, '--');
  // 포커스를 잃는 동안 버튼을 뗀 경우: 브라우저는 뗀 사실을 페이지에 알리지 않는다
  await fresh(); await pg.mouse.down({ button: 'left' }); await wait();
  const other = await b.newPage(); await other.bringToFront(); await pg.evaluate(() => window.dispatchEvent(new Event('blur')));
  await check('좌 누른 채 포커스 잃음: 왼손은 뗀 것으로 처리, 잡고 있던 오른손은 그대로(일시정지)', null, '--');
  await pg.bringToFront(); await pg.evaluate(() => window.dispatchEvent(new Event('focus'))); await pg.mouse.up({ button: 'left' }); await pg.mouse.move(500, 310);
  await check('포커스 복귀 후 움직임: 눌린 채 남지 않음, 오른손 유지', 'fg', '--');
  await pg.mouse.down({ button: 'right' }); await check('복귀 뒤 우클릭은 정상 동작', 'fR', '-R'); await pg.mouse.up({ button: 'right' });
  // 버튼을 누른 채로 돌아온 경우: 한 번 뗄 때까지 무시해서 잡은 손을 놓지 않는다
  await fresh(); await pg.evaluate(() => window.dispatchEvent(new Event('blur'))); await pg.mouse.down({ button: 'left' }); await pg.evaluate(() => window.dispatchEvent(new Event('focus'))); await pg.mouse.move(520, 320);
  await check('포커스 복귀용 클릭은 손을 놓지 않음', 'gg', '--'); await pg.mouse.up({ button: 'left' }); await pg.mouse.down({ button: 'left' }); await check('한 번 뗀 뒤 다시 누르면 동작', 'Rg', 'L-'); await pg.mouse.up({ button: 'left' });
  await other.close();
  // 키보드로 손을 누른 채 포커스를 잃었다 돌아오는 경우
  await fresh(); await pg.keyboard.down('KeyQ'); await wait(); await pg.evaluate(() => window.dispatchEvent(new Event('blur'))); await pg.evaluate(() => window.dispatchEvent(new Event('focus')));
  await check('Q 누른 채 포커스 잃음: 키가 눌린 채 남지 않음(왼손은 뗀 것으로 처리, 오른손 유지)', 'fg', '--'); await pg.keyboard.up('KeyQ');
  console.log('페이지 오류:', errs.join(';') || '없음', '| 실패', fail); await b.close(); process.exit(fail ? 1 : 0);
})();
