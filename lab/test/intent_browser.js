// 실제 브라우저(Chromium)에 키·마우스 이벤트를 넣어 D안(의도 조작)을 확인한다. 사용: node test/intent_browser.js [스크린샷 경로 앞부분]
'use strict';
const { chromium } = require('playwright'), path = require('path');
const url = 'file://' + path.join(__dirname, '..', 'climb_lab.html'), shot = process.argv[2], OX = -30, OY = 130;
const sx = x => x - OX, sy = y => y - OY; // 게임 좌표 → 화면 좌표
(async () => {
  const b = await chromium.launch(); let fail = 0;
  const check = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`); if (!c) fail++; };
  const pg = await b.newPage({ viewport: { width: 960, height: 540 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(url + '?body=base&chart=off'); // 차트 구역을 끄고(화면 전체가 게임 화면) 조작만 본다. 차트 구역을 켠 채의 조준은 layout_browser.js가 본다
  await pg.waitForTimeout(300); // 기존 몸 기준 확인(관절 몸은 아래에서 따로)
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
  // 길게 모으면 멀리 가므로 턱 가운데(545)를 겨눈다(잡기 보조가 커서 근처 구간만 허용)
  await fresh(3); await pg.mouse.move(sx(545), sy(348)); await pg.keyboard.down('Space'); await pg.waitForTimeout(250);
  await pg.mouse.click(sx(545), sy(348)); await pg.mouse.click(sx(545), sy(348), { button: 'right' }); await pg.waitForTimeout(150);
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
  // 6. 모으는 동안 지정 취소
  await fresh(3); await pg.mouse.move(sx(490), sy(345)); await pg.keyboard.down('Space'); await pg.waitForTimeout(200);
  await pg.mouse.click(sx(490), sy(345)); await pg.mouse.click(sx(490), sy(345), { button: 'right' }); await pg.waitForTimeout(100);
  await pg.mouse.click(sx(490), sy(345)); await pg.waitForTimeout(100);
  const m1 = await pg.evaluate(() => window.__lab.ctrlState().mark.join(','));
  await pg.keyboard.press('KeyX'); await pg.waitForTimeout(100); const m2 = await pg.evaluate(() => window.__lab.ctrlState().mark.join(','));
  await pg.keyboard.up('Space'); await pg.waitForTimeout(600);
  check('모으는 중: 같은 손을 다시 누르면 지정 취소, X는 모두 취소, 지정 없이 떼면 뛰지 않음', m1 === 'false,true' && m2 === 'false,false' && (await modes()).startsWith('grip@A,grip@A'), `${m1} → ${m2} → ${await modes()}`);
  // 7. 키보드만으로: 방향키로 조준, Space + Q·E로 두 손 지정, 떼서 다이노
  await fresh(3); await pg.mouse.move(5, 5); await pg.waitForTimeout(100); // 마우스는 구석에 두고 건드리지 않는다
  await pg.evaluate(() => { window.__lab.aim.x = 320; window.__lab.aim.y = 330; });
  await pg.keyboard.down('ArrowRight'); for (let k = 0; k < 60; k++) { const ax = await pg.evaluate(() => window.__lab.aim.x); if (ax >= 486) break; await pg.waitForTimeout(16); } await pg.keyboard.up('ArrowRight');
  await pg.keyboard.down('ArrowDown'); for (let k = 0; k < 60; k++) { const ay = await pg.evaluate(() => window.__lab.aim.y); if (ay >= 348) break; await pg.waitForTimeout(16); } await pg.keyboard.up('ArrowDown');
  const aimPos = await pg.evaluate(() => [Math.round(window.__lab.aim.x), Math.round(window.__lab.aim.y)]);
  await pg.keyboard.down('Space'); await pg.waitForTimeout(90); await pg.keyboard.press('KeyQ'); await pg.keyboard.press('KeyE'); await pg.waitForTimeout(80); await pg.keyboard.up('Space'); await pg.waitForTimeout(1500);
  check('키보드만: 방향키로 조준점을 옮기고 Space+Q·E로 뛰어 건너편 잡기', (await modes()).split(',').slice(0, 2).some(m => m === 'grip@B'), `조준 ${aimPos} → ${await modes()}`);
  // 8. 2번 방식: 추천 손이 커서를 조금 움직여도 바뀌지 않고, 누른 순간의 추천 손이 떨어진다
  await pg.keyboard.press('KeyH'); await pg.waitForTimeout(80);
  check('H로 손 선택 2번 방식 켜기', (await pg.evaluate(() => window.__lab.opt().handMode)) === 2);
  await fresh(1);
  await pg.mouse.move(sx(470), sy(290)); await pg.waitForTimeout(300); let flips = 0, prev = await pg.evaluate(() => window.__lab.ctrlState().rec.hand);
  for (let k = 0; k < 40; k++) { await pg.mouse.move(sx(470 + (k % 2 ? 8 : -8)), sy(290 + (k % 3 - 1) * 6)); await pg.waitForTimeout(20); const r = await pg.evaluate(() => window.__lab.ctrlState().rec.hand); if (r !== prev) flips++; prev = r; }
  const rec = prev; await pg.mouse.click(sx(470), sy(290)); await pg.waitForTimeout(350);
  const ms = (await modes()).split(',');
  check('2번 방식: 커서를 ±8px 흔들어도 추천 손이 바뀌지 않음, 누르면 추천 손이 떨어짐', flips === 0 && ms[rec] === 'reach' && ms[1 - rec].startsWith('grip'), `바뀐 횟수 ${flips}, 추천 ${['왼손', '오른손'][rec]} → ${ms.slice(0, 2)}`);
  await pg.mouse.move(sx(240), sy(290)); await pg.waitForTimeout(400);
  check('2번 방식: 커서를 반대쪽 멀리 옮기면 추천이 바뀜', (await pg.evaluate(() => window.__lab.ctrlState().rec.hand)) !== rec || ms[rec] === 'reach');
  await pg.keyboard.press('KeyH'); await pg.waitForTimeout(80);
  check('H로 1번 방식으로 돌아오기', (await pg.evaluate(() => window.__lab.opt().handMode)) === 1);
  // 8-1. WASD 몸통: 두 손 매달림에서 W를 누르면 당겨 올라가고, 떼면 그 높이에서 버틴다. S는 팔이 다 펴져 있어 더 내려가지 않는다
  await fresh(1); await pg.mouse.move(sx(400), sy(250)); await pg.waitForTimeout(200);
  const y0 = await pg.evaluate(() => window.__lab.s.p[0].y);
  await pg.keyboard.down('KeyW'); await pg.waitForTimeout(900); await pg.keyboard.up('KeyW'); await pg.waitForTimeout(600);
  const y1 = await pg.evaluate(() => window.__lab.s.p[0].y);
  check('W를 누른 채: 턱걸이처럼 가슴이 올라가고, 떼면 그 높이에서 버팀', y0 - y1 > 30 && (await modes()).startsWith('grip@A,grip@A'), `${Math.round(y0 - y1)}px 올라감`);
  await pg.keyboard.down('KeyD'); await pg.waitForTimeout(500); const xd = await pg.evaluate(() => [window.__lab.s.p[0].x, window.__lab.ctrlState().move]); await pg.keyboard.up('KeyD');
  check('D를 누른 채: 몸통이 오른쪽으로 가거나, 한계면 막힌 이유를 보여 줌', xd[1] && (xd[1].blocked || xd[0] > 300), JSON.stringify(xd[1]));
  if (shot) await pg.screenshot({ path: shot + '_wasd.png' });
  // 9. 키 설정: 열기, 칸 바꾸기, 겹침 안내, 기본값 복원, 저장·다시 실행 복원
  await fresh(1); await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
  check('Esc로 키 설정 열기', !!(await pg.evaluate(() => window.__lab.ui())));
  const slotPos = await pg.evaluate(() => { const r = window.__lab.bind.ACTIONS.filter(a => !a.hm || a.hm === window.__lab.opt().handMode); const k = r.findIndex(a => a.id === 'sendL'); return k; });
  // 왼손 보내기의 둘째 칸(Q)을 클릭하고 M을 누른다
  await pg.mouse.click(30 + 354 + 40, 92 + slotPos * 22 - 5); await pg.waitForTimeout(80); await pg.keyboard.press('KeyM'); await pg.waitForTimeout(80);
  check('칸을 클릭하고 M → 왼손 보내기 둘째 칸이 M', (await pg.evaluate(() => window.__lab.bind.get('sendL')[1])) === 'KeyM');
  if (shot) await pg.screenshot({ path: shot + '_settings.png' });
  // 오른손 보내기 둘째 칸에도 M → 겹침 안내
  await pg.mouse.click(30 + 354 + 40, 92 + (slotPos + 1) * 22 - 5); await pg.waitForTimeout(80); await pg.keyboard.press('KeyM'); await pg.waitForTimeout(80);
  const msg = await pg.evaluate(() => window.__lab.ui().msg);
  check('같은 키를 다른 동작에 넣으면 겹침 안내', msg.startsWith('주의') && msg.includes('M'), msg);
  if (shot) await pg.screenshot({ path: shot + '_conflict.png' });
  // 기본값 복원(방향키·Enter로)
  for (let k = 0; k < 40; k++) { await pg.keyboard.press('ArrowDown'); await pg.waitForTimeout(20); } await pg.keyboard.press('ArrowLeft'); await pg.waitForTimeout(40);
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(80);
  check('키보드로 "기본값 복원" → Q·E로 돌아옴', (await pg.evaluate(() => window.__lab.bind.get('sendL')[1] + ',' + window.__lab.bind.get('sendR')[1])) === 'KeyQ,KeyE');
  // 다시 M으로 바꾸고 닫은 뒤 새로고침 → 남아 있어야 함
  await pg.mouse.click(30 + 354 + 40, 92 + slotPos * 22 - 5); await pg.waitForTimeout(80); await pg.keyboard.press('KeyM'); await pg.waitForTimeout(80); await pg.keyboard.press('Escape'); await pg.waitForTimeout(100);
  await pg.reload(); await pg.waitForTimeout(400);
  check('새로고침(다시 실행) 뒤에도 바꾼 키가 남음', (await pg.evaluate(() => window.__lab.bind.get('sendL')[1])) === 'KeyM');
  await fresh(1); await pg.keyboard.press('KeyM'); await pg.waitForTimeout(350);
  check('바꾼 키(M)로 실제로 왼손이 움직임', (await modes()).split(',')[0] === 'reach', await modes());
  await pg.evaluate(() => window.__lab.bind.resetAll());
  // 실패 안내: 못 미침과 지나침을 구분한다(모은 힘이 낮다는 이유만으로 오래 누르라고 하지 않는다)
  const jumpHint = async (x, hold) => { await fresh(3); await pg.mouse.move(sx(x), sy(348)); await pg.waitForTimeout(200);
    await pg.keyboard.down('Space'); await pg.waitForTimeout(40); await pg.mouse.click(sx(x), sy(348)); await pg.mouse.click(sx(x), sy(348), { button: 'right' });
    await pg.waitForTimeout(hold - 40); await pg.keyboard.up('Space'); await pg.waitForTimeout(2200); return { m: await modes(), h: await pg.evaluate(() => window.__lab.hint()) || '' }; };
  let jh = await jumpHint(482, 650);
  check('실패 안내: 가까운 끝을 겨누고 길게 → "지나쳐 … 덜 모으거나"', !jh.m.includes('@B') && jh.h.includes('지나쳐') && jh.h.includes('덜 모으'), jh.h);
  jh = await jumpHint(600, 150);
  check('실패 안내: 먼 끝을 겨누고 짧게 → "못 미쳐 … 더 모으거나"', !jh.m.includes('@B') && jh.h.includes('못 미쳐') && !jh.h.includes('지나'), jh.h);
  // 2단계 ②: 모으는 동안 A로 몸을 왼쪽에 싣는다(Space를 먼저 누르고 A)
  await fresh(3); await pg.mouse.move(sx(545), sy(348)); await pg.keyboard.down('Space'); await pg.waitForTimeout(80); await pg.keyboard.down('KeyA'); await pg.waitForTimeout(300);
  const sw = await pg.evaluate(() => { const st = window.__lab.ctrlState(); return { sway: st.sway, phase: st.phase, vx: window.__lab.s.p[1].vx }; });
  check('모으는 중 A: 몸 싣기 값이 왼쪽(음수)이고 엉덩이가 왼쪽으로 움직임', sw.phase === 'charge' && sw.sway < -10 && sw.vx < 0, JSON.stringify(sw));
  if (shot) await pg.screenshot({ path: shot + '_sway.png' });
  await pg.keyboard.up('KeyA'); await pg.keyboard.up('Space'); await pg.waitForTimeout(800);
  // 몸 비율 바꾸기(- 키): 같은 벽에서 몸만 바뀌고, 다시 누르면 돌아온다
  await pg.keyboard.press('Minus'); await pg.waitForTimeout(300);
  let bd = await pg.evaluate(() => [window.__lab.s.limb[0].max, window.__lab.s.limb[2].max].join('/'));
  check('- 키: 새 비율 몸(팔 68·다리 98)으로 바뀜', bd === '68/98', bd);
  if (shot) await pg.screenshot({ path: shot + '_body.png' });
  await pg.keyboard.press('Minus'); await pg.waitForTimeout(300);
  bd = await pg.evaluate(() => [window.__lab.s.limb[0].max, window.__lab.s.limb[2].max, window.__lab.s.limb[0].k !== 0].join('/'));
  check('- 키 다시: 관절 몸(팔 66·다리 96, 어깨에서 팔이 나옴)으로 바뀜', bd === '66/96/true', bd);
  if (shot) await pg.screenshot({ path: shot + '_joint.png' });
  await pg.keyboard.press('Minus'); await pg.waitForTimeout(300);
  bd = await pg.evaluate(() => [window.__lab.s.limb[0].max, window.__lab.s.limb[2].max].join('/'));
  check('- 키 한 번 더: 기존 몸(팔 72·다리 84)으로 돌아옴', bd === '72/84', bd);
  console.log('페이지 오류:', errs.join(';') || '없음', '| 실패', fail); await b.close(); process.exit(fail ? 1 : 0);
})();
