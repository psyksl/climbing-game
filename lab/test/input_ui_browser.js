// 입력 UI(키캡·입력 비교 차트·키 안내)를 실제 브라우저에서 확인한다: 인계 문서의 "적용 확인 목록" 1~6번. 사용: node test/input_ui_browser.js [스크린샷 폴더]
// 여기의 입력은 모두 스크립트가 넣는다(사람 손 아님). 7번(사람이 보기에 가려지지 않는지, 읽기 쉬운지)은 사람이 직접 확인해야 한다
'use strict';
const { chromium } = require('playwright'), path = require('path');
const url = 'file://' + path.join(__dirname, '..', 'climb_lab.html'), out = process.argv[2];
(async () => {
  const b = await chromium.launch(); let fail = 0; const check = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`); if (!c) fail++; };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }), pg = await ctx.newPage(), K = 1280 / 960, errs = []; pg.on('pageerror', e => errs.push(e.message));
  const shot = async n => { if (out) await pg.screenshot({ path: path.join(out, n + '.png') }); };
  const keys = () => pg.evaluate(() => window.__lab.keys()), key1 = async (where, action) => (await keys()).filter(k => k.where === where && k.action === action);
  const str = ks => ks.map(k => `${k.code}/${k.role}/${k.state}`).join(' + '), press = async (k, ms = 60) => { await pg.keyboard.press(k); await pg.waitForTimeout(ms); };
  const lab = f => pg.evaluate(f);
  await pg.goto(url); await pg.waitForTimeout(700);

  // ── 1. 기본 설정: 그림이 준비되고, 아래 키 안내가 BIND의 지금 설정과 같다
  const c0 = await lab(() => window.__lab.chart()); check('키캡 틀과 패널 그림이 준비된다(외부 파일 없이)', c0.ready && c0.panel);
  let bar = (await keys()).filter(k => k.where === 'bar'); await shot('01_기본_키안내_접힌차트');
  check('아래 키 안내: 왼손 = 좌클릭(코럴), 오른손 = 우클릭(파랑)', str(bar.filter(k => k.action === 'sendL')) === 'Mouse0/left/idle' && str(bar.filter(k => k.action === 'sendR')) === 'Mouse2/right/idle', str(bar.filter(k => k.action.startsWith('send'))));
  check('아래 키 안내: 발 = 발 조종 키 + 손 입력 조합(보라), 모으기 = 긴 Space(노랑)', str(bar.filter(k => k.action === 'foot+sendL')) === 'ShiftLeft/foot/idle + Mouse0/foot/idle' && bar.find(k => k.action === 'power').shape === 'space' && bar.find(k => k.action === 'power').role === 'power', str(bar.filter(k => k.action === 'foot+sendL')));
  const allDef = await lab(() => BIND.ACTIONS.every(a => a.def.filter(Boolean).every(c => !ClimbInputCatalog.resolve(c).fallback)) && BIND.ACTIONS.every(a => ACT.name[a.id])); check('BIND 전체: 기본 입력과 동작 이름에 빠진 것이 없다', allDef);

  // ── 2. 실행 중 다시 지정: 설정 화면에서 바꾸면 그 화면과 게임 화면의 키캡이 바로 바뀐다(다시 불러오지 않는다)
  await press('Escape', 250); await shot('02_설정_지정전');
  check('설정 화면: 동작마다 두 칸 모두 키캡으로 나온다', (await keys()).filter(k => k.where === 'settings').length === (await lab(() => BIND.ACTIONS.filter(a => !a.hm || a.hm === 1).length)) * 2);
  await press('ArrowDown'); await press('Enter', 120); await press('KeyJ', 200);
  check('오른손 보내기 주 입력을 우클릭 → J로: 설정 화면의 키캡이 바로 J', str(await key1('settings', 'sendR:0')) === 'KeyJ/right/idle', str(await key1('settings', 'sendR:0')));
  await press('ArrowRight'); await press('Enter', 120); await press('KeyK', 200); await shot('03_설정_주J_보조K');
  check('보조 입력을 E → K로: 두 번째 칸도 바로 바뀐다', str(await key1('settings', 'sendR:1')) === 'KeyK/right/idle');
  await press('Escape', 250); await shot('04_게임_오른손J');
  check('게임 화면의 키 안내도 바로 J(파랑 키캡)', str(await key1('bar', 'sendR')) === 'KeyJ/right/idle', str(await key1('bar', 'sendR')));
  // 마우스 ↔ 키보드: 오른손을 좌클릭에 배정하면 마우스 왼쪽 버튼이 파랑으로 나온다. 왼손도 좌클릭이므로 같은 버튼이 두 색으로 보인다
  await press('Escape', 250); await press('ArrowDown'); await press('Enter', 120); await pg.mouse.click(640, 360); await pg.waitForTimeout(200); await shot('05_설정_오른손_좌클릭');
  await press('Escape', 250); await shot('06_게임_오른손_좌클릭_파랑');
  check('오른손을 좌클릭에 배정: 마우스 왼쪽 버튼이 오른손 색(파랑)', str(await key1('bar', 'sendR')) === 'Mouse0/right/idle' && str(await key1('bar', 'sendL')) === 'Mouse0/left/idle', `오른손 ${str(await key1('bar', 'sendR'))} · 왼손 ${str(await key1('bar', 'sendL'))}`);
  await lab(() => BIND.resetAll()); await pg.waitForTimeout(100);
  check('기본값 복원 뒤 다시 우클릭', str(await key1('bar', 'sendR')) === 'Mouse2/right/idle');

  // ── 3. 주·보조 칸: 실제로 누른 칸을 보이고 기록에도 남긴다
  await pg.mouse.move(250 * K, 170 * K); await pg.waitForTimeout(150);
  await pg.keyboard.down('KeyQ'); await pg.waitForTimeout(120); const qDown = await key1('bar', 'sendL'); await pg.keyboard.up('KeyQ'); await pg.waitForTimeout(250);
  const tapQ = await lab(() => { const t = window.__lab.lesson().rec.taps; return t[t.length - 1]; });
  check('보조 입력 Q로 왼손 보내기: 누르는 동안 Q 키캡이 눌림으로', str(qDown) === 'KeyQ/left/pressed', str(qDown));
  check('기록에 결정된 팔다리·쓴 동작·실제 누른 입력이 남는다', tapQ && tapQ.limb === 0 && tapQ.id === 'sendL' && tapQ.code === 'KeyQ', JSON.stringify(tapQ));
  check('뗀 뒤에도 최근에 쓴 Q를 보인다(주 입력으로 돌아가지 않음)', str(await key1('bar', 'sendL')) === 'KeyQ/left/idle');
  await press('KeyT', 200); check('펼친 차트의 왼손 줄도 실제로 누른 Q', str(await key1('chart', 'sendL')) === 'KeyQ/left/idle', str(await key1('chart', 'sendL'))); await shot('07_펼침_보조입력Q');
  await pg.mouse.click(250 * K, 170 * K); await pg.waitForTimeout(250);
  check('이어서 좌클릭을 쓰면 좌클릭으로 바뀐다', str(await key1('bar', 'sendL')) === 'Mouse0/left/idle' && str(await key1('chart', 'sendL')) === 'Mouse0/left/idle');

  // ── 4. 발 조합: 발의 색과 실제로 누른 수정 키(왼·오른 Shift 구분)
  await press('KeyR', 300); await pg.mouse.move(330 * K, 345 * K); await pg.keyboard.down('ShiftRight'); await pg.waitForTimeout(80); await pg.mouse.down(); await pg.waitForTimeout(150);
  const footBar = await key1('bar', 'foot+sendL'); await pg.mouse.up(); await pg.keyboard.up('ShiftRight'); await pg.waitForTimeout(250);
  const tapF = await lab(() => { const t = window.__lab.lesson().rec.taps; return t[t.length - 1]; }), footLane = await key1('chart', 'foot+sendL');
  check('오른 Shift + 좌클릭 = 왼발: 기록에 수정 키가 오른 Shift로 남는다', tapF && tapF.limb === 2 && tapF.mod === 'ShiftRight' && tapF.code === 'Mouse0', JSON.stringify(tapF));
  check('차트의 왼발 줄: 오른 Shift + 좌클릭 조합, 둘 다 발 색(보라)', str(footLane) === 'ShiftRight/foot/idle + Mouse0/foot/idle' && footLane[0].label === 'R Shift', `${str(footLane)} · 글자 ${footLane[0] && footLane[0].label}`);
  check('누르는 동안 아래 키 안내의 왼발 조합이 눌림으로', footBar.length === 2 && footBar.every(k => k.state === 'pressed') && footBar[0].code === 'ShiftRight', str(footBar)); await shot('08_펼침_발조합_오른Shift');

  // ── 5. 손 선택 2번: 입력(추천·다른 손)만으로 손을 짐작하지 않고, 기록의 결정된 팔다리로 줄과 색을 정한다
  await press('KeyR', 300); await press('KeyH', 150); bar = (await keys()).filter(k => k.where === 'bar');
  const best = bar.find(k => k.action === 'sendBest'), other = bar.find(k => k.action === 'sendOther'), recHand = await lab(() => window.__lab.ctrlState().rec.hand % 2);
  check('2번 방식 키 안내: 추천 손 입력은 지금 추천된 손의 색, 다른 손 입력은 반대 손의 색', best && other && best.role === (recHand ? 'right' : 'left') && other.role === (recHand ? 'left' : 'right') && best.code === 'Mouse0', `추천 ${best && best.role} · 다른 ${other && other.role} · 게임의 추천 ${recHand ? '오른손' : '왼손'}`);
  await pg.mouse.move(250 * K, 170 * K); await pg.waitForTimeout(200); await pg.mouse.click(250 * K, 170 * K, { button: 'right' }); await pg.waitForTimeout(250);
  const tap2 = await lab(() => { const t = window.__lab.lesson().rec.taps; return t[t.length - 1]; }), lane2 = await key1('chart', 'sendOther');
  check('2번 방식 기록: 쓴 동작(다른 손)과 결정된 손이 따로 남고, 차트 줄의 색은 결정된 손', tap2 && tap2.id === 'sendOther' && tap2.code === 'Mouse2' && lane2.length === 1 && lane2[0].role === (tap2.limb ? 'right' : 'left'), `${JSON.stringify(tap2)} · 줄 ${str(lane2)}`); await shot('09_펼침_손방식2');
  // 과제에서 시범만 있고 아직 내가 누르지 않은 줄: 어느 손이 될지 모르므로 손 색을 칠하지 않는다
  for (let i = 0; i < 4; i++) await press('KeyO', 140); await press('KeyP'); await pg.waitForTimeout(4900);
  const anyL = (await keys()).filter(k => k.where === 'chart' && k.action === 'sendBest');
  check('2번 방식에서 아직 누르지 않은 손 줄은 손 색을 칠하지 않는다', anyL.length === 2 && anyL.every(k => k.role === 'any'), str(anyL)); await shot('10_펼침_손방식2_누르기전');
  for (let i = 0; i < 3; i++) await press('KeyO', 140); await press('KeyH', 150);

  // ── 6. 긴 키·미지정·미등록·숫자패드·한/영
  await lab(() => { BIND.set('power', 0, null); BIND.set('cancel', 0, 'VendorKeyXYZ123'); BIND.set('st1', 1, 'Numpad1'); BIND.set('ghost', 1, 'Lang1'); BIND.set('demo', 1, 'NumpadEnter'); }); await pg.waitForTimeout(150);
  const pw = (await key1('bar', 'power'))[0]; check('모으기를 비우면 미지정 키캡', pw && pw.code === 'Unassigned' && pw.label === '미지정', JSON.stringify(pw));
  await press('Escape', 250); const sk = (await keys()).filter(k => k.where === 'settings'), by = a => sk.find(k => k.action === a) || {}; await shot('11_설정_미지정_미등록_숫자패드_한영');
  check('미등록 코드는 공통 키캡에 코드 이름으로', by('cancel:0').fallback === true && by('cancel:0').shape === 'short' && by('cancel:0').label === 'VendorKeyXYZ123', JSON.stringify(by('cancel:0')));
  check('숫자열 1과 숫자패드 1을 구분', by('st1:0').label === '1' && by('st1:1').label === 'NUM 1', `${by('st1:0').label} / ${by('st1:1').label}`);
  check('한/영, 숫자패드 Enter(세로로 긴 키)', by('ghost:1').label === '한/영' && by('demo:1').shape === 'numenter', `${by('ghost:1').label} · ${by('demo:1').shape}`);
  check('비어 있는 칸은 사용 불가 상태의 미지정 키캡', by('power:0').code === 'Unassigned' && by('power:0').state === 'disabled');
  await press('Escape', 200); await lab(() => BIND.resetAll()); await pg.waitForTimeout(100);

  // ── 7. 눌림·해제, 포커스를 잃으면 해제, 키 반복이 명령을 늘리지 않음, 두 칸을 함께 눌러도 한 번
  await press('KeyR', 300); await pg.keyboard.down('Space'); await pg.waitForTimeout(200); const sp1 = (await key1('bar', 'power'))[0], chg = await lab(() => window.__lab.ctrlState().phase);
  await pg.evaluate(() => window.dispatchEvent(new Event('blur'))); await pg.waitForTimeout(250); const sp2 = (await key1('bar', 'power'))[0];
  await pg.evaluate(() => window.dispatchEvent(new Event('focus'))); await pg.keyboard.up('Space'); await pg.waitForTimeout(200);
  check('Space를 누르는 동안 눌림, 창이 포커스를 잃으면 바로 해제', sp1.state === 'pressed' && chg === 'charge' && sp2.state === 'idle', `${sp1.state}(${chg}) → ${sp2.state}`);
  await press('KeyR', 300); await pg.mouse.move(250 * K, 170 * K); await pg.waitForTimeout(100); for (let i = 0; i < 4; i++) { await pg.keyboard.down('KeyQ'); await pg.waitForTimeout(60); } await pg.keyboard.up('KeyQ'); await pg.waitForTimeout(150);
  check('키를 누르고 있어 생기는 반복 입력은 명령을 늘리지 않는다', (await lab(() => window.__lab.lesson().rec.taps.length)) === 1);
  await lab(() => BIND.set('power', 1, 'KeyK')); await press('KeyR', 300);
  await pg.keyboard.down('Space'); await pg.waitForTimeout(250); await pg.keyboard.down('KeyK'); await pg.waitForTimeout(150); await pg.keyboard.up('Space'); await pg.waitForTimeout(200); const mid = await lab(() => window.__lab.ctrlState().phase); await pg.keyboard.up('KeyK'); await pg.waitForTimeout(250);
  const pb = await lab(() => window.__lab.lesson().rec.bars.filter(q => q.id === 'power'));
  check('주·보조를 겹쳐 눌러도 모으기는 한 번(하나를 떼도 이어짐)', mid === 'charge' && pb.length === 1 && pb[0].b - pb[0].a > 0.5 && pb[0].code === 'Space', `${mid} · 구간 ${pb.length}개 ${pb[0] ? (pb[0].b - pb[0].a).toFixed(2) + '초' : ''}`);
  await lab(() => BIND.resetAll());

  // ── 8. 짧은 구간(0.1초)과 긴 구간(3초), 긴 기록의 시간축 이동
  await press('KeyR', 300); await pg.keyboard.down('KeyA'); await pg.waitForTimeout(100); await pg.keyboard.up('KeyA'); await pg.waitForTimeout(500);
  await pg.keyboard.down('KeyD'); await pg.waitForTimeout(3000); await pg.keyboard.up('KeyD'); await pg.waitForTimeout(300);
  const bars = await lab(() => window.__lab.lesson().rec.bars.map(q => [q.id, +(q.b - q.a).toFixed(2)])), v1 = await lab(() => window.__lab.chart()); await shot('12_펼침_짧은구간_긴구간_자동이동');
  check('0.1초 구간과 3초 구간이 시각대로 기록된다', bars.length === 2 && bars[0][1] > 0.06 && bars[0][1] < 0.2 && bars[1][1] > 2.9 && bars[1][1] < 3.2, JSON.stringify(bars));
  check('기록이 3초보다 길면 시간축이 따라 움직인다(전체를 줄이지 않는다)', v1.view > 0.3 && v1.end > 3.4, `보이는 시작 ${v1.view.toFixed(2)}초 · 기록 끝 ${v1.end.toFixed(2)}초`);
  await pg.keyboard.down('Comma'); await pg.waitForTimeout(900); await pg.keyboard.up('Comma'); await pg.waitForTimeout(150); const v2 = await lab(() => window.__lab.chart()); await shot('13_펼침_시간축_앞으로');
  check('시간축 이동 키(,)로 앞쪽을 본다', v2.view < 0.05, `보이는 시작 ${v2.view.toFixed(2)}초`);

  // ── 9. 접힘·펼침·끔은 계산 결과를 바꾸지 않는다: 같은 시범을 세 상태에서 돌려 끝 자세를 견준다
  for (let i = 0; i < 4; i++) await press('KeyO', 140);
  const ends = {}; for (const m of ['full', 'off', 'mini']) { const mode = await lab(() => window.__lab.chart().mode); await press('KeyP'); await pg.waitForTimeout(4900); ends[mode] = await lab(() => ({ p: window.__lab.lesson().demoEnd, ok: window.__lab.lesson().demoOk })); await press('KeyT', 150); }
  const same = (a, c) => a && c && a.p.every((q, i) => q[0] === c.p[i][0] && q[1] === c.p[i][1]);
  check('차트를 작게·펼침·끔으로 바꿔도 시범의 끝 자세가 완전히 같다', Object.keys(ends).length === 3 && ends.mini.ok && same(ends.mini, ends.full) && same(ends.mini, ends.off), Object.keys(ends).join(' / '));
  // 내 입력도 같은 결과: 펼친 채로 한 시도를 다시 계산하면 같은 자리(차트가 입력을 가로채지 않는다)
  await press('KeyR', 300); await pg.mouse.move(575 * K, 218 * K, { steps: 6 }); await pg.waitForTimeout(150); await pg.mouse.click(575 * K, 218 * K, { button: 'right' }); await pg.waitForTimeout(900);
  await pg.keyboard.down('Space'); await pg.waitForTimeout(140); await pg.mouse.click(575 * K, 218 * K); await pg.waitForTimeout(330); await pg.keyboard.up('Space'); await pg.waitForTimeout(700); await shot('14_펼침_과제4_내입력');
  const rp = await lab(() => { const L = window.__lab, S = L.s, rec = L.lesson().rec, s2 = PH.create(S.world, S.station), ctl = CTRL.make('intent'), pl = LESSON.player({ steps: LESSON.toSteps(rec) });
    while (s2.t < S.t - 1e-9) PH.step(s2, ctl.step(s2, pl.step(s2.t), 1 / 120), 1 / 120); return { d: Math.max(...s2.p.map((q, i) => Math.hypot(q.x - S.p[i].x, q.y - S.p[i].y))), mode: L.chart().mode, n: rec.ev.length }; });
  check('차트를 펼친 채로 한 시도: 기록을 다시 계산하면 화면의 몸과 같은 자리', rp.mode === 'full' && rp.d < 1e-6 && rp.n >= 4, `차이 ${rp.d.toExponential(1)}px · 입력 ${rp.n}개`);

  // ── 10. 움직임 줄이기: 눌림이 중간 단계 없이 바로 바뀐다. 꺾인(ISO) Enter 배열 선택
  { const p3 = await ctx.newPage(); await p3.goto(url + '?motion=reduce&enter=iso'); await p3.waitForTimeout(600); const seen = new Set();
    await p3.keyboard.down('Space'); for (let i = 0; i < 6; i++) { seen.add((await p3.evaluate(() => window.__lab.keys().find(k => k.where === 'bar' && k.action === 'power').press))); await p3.waitForTimeout(25); }
    await p3.keyboard.up('Space'); for (let i = 0; i < 6; i++) { await p3.waitForTimeout(25); seen.add((await p3.evaluate(() => window.__lab.keys().find(k => k.where === 'bar' && k.action === 'power').press))); }
    check('움직임 줄이기 설정이면 눌림 정도가 0 또는 1만 나온다', [...seen].every(v => v === 0 || v === 1) && seen.has(1) && seen.has(0), [...seen].join(' '));
    await p3.evaluate(() => BIND.set('demo', 1, 'Enter')); await p3.keyboard.press('Escape'); await p3.waitForTimeout(250);
    const en = await p3.evaluate(() => window.__lab.keys().find(k => k.action === 'demo:1')); check('주소에 enter=iso를 주면 Enter가 꺾인 모양으로', en && en.shape === 'iso', en && en.shape);
    if (out) await p3.screenshot({ path: path.join(out, '17_ISO_Enter.png') }); await p3.evaluate(() => BIND.resetAll()); await p3.close(); }
  { const p4 = await ctx.newPage(); await p4.goto(url); await p4.waitForTimeout(600); const seen = [];
    await p4.keyboard.down('Space'); for (let i = 0; i < 8; i++) { seen.push(await p4.evaluate(() => window.__lab.keys().find(k => k.where === 'bar' && k.action === 'power').press)); await p4.waitForTimeout(16); } await p4.keyboard.up('Space');
    check('보통 설정에서는 눌림이 짧게 이어져 바뀐다(중간 단계가 보임)', seen.some(v => v > 0 && v < 1) && seen[seen.length - 1] === 1, seen.map(v => v.toFixed(2)).join(' ')); await p4.close(); }

  // ── 11. 1920×1080에서도 같은 배치
  if (out) { const c2 = await b.newContext({ viewport: { width: 1920, height: 1080 } }), p2 = await c2.newPage(), K2 = 2; await p2.goto(url + '?chart=full'); await p2.waitForTimeout(700);
    for (let i = 0; i < 6; i++) { await p2.keyboard.press('KeyO'); await p2.waitForTimeout(140); } await p2.keyboard.press('KeyP'); await p2.waitForTimeout(5000);
    await p2.mouse.move(337 * K2, 60 * K2, { steps: 5 }); await p2.waitForTimeout(150); await p2.mouse.click(337 * K2, 60 * K2, { button: 'right' }); await p2.waitForTimeout(1050);
    await p2.keyboard.down('Space'); await p2.waitForTimeout(180); await p2.mouse.click(337 * K2, 60 * K2); await p2.waitForTimeout(450); await p2.keyboard.down('KeyW'); await p2.waitForTimeout(40); await p2.keyboard.up('Space'); await p2.waitForTimeout(450); await p2.keyboard.up('KeyW'); await p2.waitForTimeout(900);
    await p2.screenshot({ path: path.join(out, '15_1920x1080_펼침.png') }); await p2.keyboard.press('KeyT'); await p2.keyboard.press('KeyT'); await p2.waitForTimeout(200); await p2.screenshot({ path: path.join(out, '16_1920x1080_접힘.png') }); await c2.close(); }
  console.log('페이지 오류:', errs.join(';') || '없음', '| 실패', fail); await b.close(); process.exit(fail || errs.length ? 1 : 0);
})();
