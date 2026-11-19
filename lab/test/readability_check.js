// 작은 화면 읽기 쉬움 점검(v0.16.3, GPT v0.16.1 검토의 화면 지침 1·6·7·10). 실제 Chromium, 1280×720, 스크립트 입력(사람 손 아님).
// 사용: node test/readability_check.js [스크린샷 폴더]      고치기 전 빌드: LAB=옛/lab node test/readability_check.js
// ① 게임 화면 안 글의 배율: 차트를 붙여 게임 화면이 66%여도 글은 맞춤의 85% 아래로 줄지 않고, 확대해도 맞춤보다 커지지 않는다
// ② 같은 경고가 이어지면 로그는 한 줄 + 횟수, 왼쪽 아래 상태 칸도 한 줄
// ③ 로그를 올려 읽는 중에 새 로그가 와도 읽던 자리가 그대로이고 "새 로그 N개"가 뜬다. 누르면 맨 아래로
// ④ 조작 설명 카드는 기본으로 핵심 다섯 줄, [자세히]로 펼친다
// ⑤ 커서 옆 표시는 기본으로 입력 이름만(손발 위 표시와 같은 것). 보기 설정의 "커서 옆 긴 설명"을 켜면 길게
'use strict';
const { chromium } = require('playwright'), path = require('path'), fs = require('fs');
const LAB = process.env.LAB || path.join(__dirname, '..'), url = 'file://' + path.join(LAB, 'climb_lab.html'), K = 1280 / 960, out = process.argv[2];
(async () => {
  if (out) fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch(); let fail = 0; const res = [];
  const check = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`); if (!c) fail++; res.push({ n, pass: !!c, x }); };
  console.log('대상:', LAB);
  const pg = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage(), errs = []; pg.on('pageerror', e => errs.push(e.message));
  const lab = (f, a) => pg.evaluate(f, a), wait = ms => pg.waitForTimeout(ms), has = async k => lab(k => !!window.__lab[k], k);
  const amove = async (x, y) => { const v = await lab(() => window.__lab.view()); await pg.mouse.move((v.x0 + (x - v.ox) * v.s) * K, (v.y0 + (y - v.oy) * v.s) * K, { steps: 5 }); };
  const click = async id => { const h = (await lab(() => window.__lab.practice().hits)).find(q => q.id === id); if (!h) return false; await pg.mouse.move((h.x + h.w / 2) * K, (h.y + h.h / 2) * K, { steps: 4 }); await wait(120); await pg.mouse.down(); await wait(40); await pg.mouse.up(); await wait(250); return true; };
  await pg.goto(url); await wait(900); await pg.keyboard.press('Digit3'); await wait(900);

  // ① 글 배율
  if (await has('labelScale')) {
    const a = await lab(() => window.__lab.labelScale());
    check('① 차트가 아래(게임 화면 66%): 게임 화면 안 글의 화면 크기 = 맞춤의 85%', Math.abs(a.s - 0.657) < 0.01 && Math.abs(a.s * a.k - 0.85) < 0.005, `게임 화면 ${(a.s * 100).toFixed(1)}% · 글 보정 ×${a.k.toFixed(3)} → 화면에서 ${(a.s * a.k * 100).toFixed(1)}%`);
    if (out) await pg.screenshot({ path: path.join(out, '1_차트아래_66.png') });
    await pg.keyboard.press('KeyT'); await wait(300); const off = await lab(() => window.__lab.labelScale());
    check('① 차트를 끄면(100%) 보정 없음', Math.abs(off.s - 1) < 0.01 && Math.abs(off.k - 1) < 1e-6, `게임 화면 ${(off.s * 100).toFixed(0)}% · ×${off.k.toFixed(3)}`);
    const v = await lab(() => window.__lab.view()); await pg.mouse.move((v.x0 + 400 * v.s) * K, (v.y0 + 250 * v.s) * K); for (let i = 0; i < 5; i++) { await pg.mouse.wheel(0, -100); await wait(120); } await wait(200);
    const zm = await lab(() => window.__lab.labelScale());
    check('① 확대해도 글은 맞춤 크기 그대로(커지지 않음)', zm.s > 1.3 && Math.abs(zm.s * zm.k - 1) < 0.005, `게임 화면 ${(zm.s * 100).toFixed(0)}% · 화면에서 ${(zm.s * zm.k * 100).toFixed(0)}%`);
    if (out) await pg.screenshot({ path: path.join(out, '1_확대.png') });
    await pg.keyboard.press('KeyZ'); await pg.keyboard.press('KeyT'); await wait(300);
  } else check('① 게임 화면 안 글의 배율 보정이 있다', false, '이 빌드에는 없다(고치기 전: 글이 게임 화면과 함께 66%로 준다)');

  // ⑤ 커서 옆 표시
  await amove(520, 250); await wait(300);
  if (await has('cursorTags')) {
    const t1 = await lab(() => window.__lab.cursorTags()), bind = await lab(() => [BIND.first('sendL'), BIND.first('sendR')]);
    check('⑤ 커서 옆 표시 = 입력 이름만(손발 위 표시와 같음)', t1.length === 2 && t1[0] === bind[0] && t1[1] === bind[1], JSON.stringify(t1));
    await pg.keyboard.press('Tab'); await wait(250); const ok = await click('vm_cursorLong'); await pg.keyboard.press('Tab'); await wait(250); await amove(520, 250); await wait(250);
    const t2 = await lab(() => window.__lab.cursorTags());
    check('⑤ 보기 설정 "커서 옆 긴 설명"을 켜면 길게', ok && t2.length === 2 && t2[0].includes('→') && t2[0].startsWith(bind[0]), JSON.stringify(t2));
    if (ok) { await pg.keyboard.press('Tab'); await wait(200); await click('vm_cursorLong'); await pg.keyboard.press('Tab'); await wait(200); }
  } else check('⑤ 커서 옆 표시를 짧게', false, '이 빌드에는 없다(고치기 전: "좌클릭 → 왼손 보내기"처럼 늘 길게)');

  // ④ 조작 설명 카드
  { const r1 = await lab(() => window.__lab.view().helpRect), more = (await lab(() => window.__lab.practice().hits)).some(q => q.id === 'help_more');
    if (more) { await click('help_more'); const r2 = await lab(() => window.__lab.view().helpRect); await click('help_more'); const r3 = await lab(() => window.__lab.view().helpRect);
      check('④ 조작 설명 카드: 기본은 짧게, [자세히]로 펼치고 [접기]로 되돌림', r1 && r2 && r3 && r2.h > r1.h + 30 && Math.abs(r3.h - r1.h) < 0.5, `높이 ${r1 && r1.h.toFixed(0)} → 펼침 ${r2 && r2.h.toFixed(0)} → 접기 ${r3 && r3.h.toFixed(0)}`); }
    else check('④ 조작 설명 카드를 접고 펼 수 있다', false, `이 빌드에는 없다(카드 높이 ${r1 ? r1.h.toFixed(0) : '?'}로 늘 다 펼침)`); }

  // ② 같은 경고 묶기 · ③ 새 로그 N개
  if (await has('logTest')) {
    for (let i = 0; i < 4; i++) { await lab(() => window.__lab.logTest('오른발 떨어짐 — 시험용 같은 경고', 'warn')); await wait(60); }
    const L = await lab(() => window.__lab.log()), same = L.items.filter(q => q.text === '오른발 떨어짐 — 시험용 같은 경고');
    check('② 같은 경고 4번 → 로그 한 줄, 횟수 4', same.length === 1 && same[0].n === 4, `줄 ${same.length} · 횟수 ${same[0] && same[0].n}`);
    for (let i = 0; i < 3; i++) await lab(() => window.__lab.sayTest('상태 칸 시험용 같은 경고'));
    await wait(150); // 상태 칸은 다음 그림에서 만들어진다
    const st = await lab(() => window.__lab.statusRows());
    check('② 상태 칸: 같은 경고는 한 줄(×횟수)', st.filter(t => t.startsWith('상태 칸 시험용 같은 경고')).length === 1 && st.some(t => t.endsWith('×3')), JSON.stringify(st));
    for (let i = 0; i < 30; i++) await lab(i => window.__lab.logTest(`시험용 로그 ${i}`, 'info'), i);
    await wait(150); const z = await lab(() => window.__lab.view().logPart); await pg.mouse.move((z.x + z.w / 2) * K, (z.y + z.h / 2) * K); for (let i = 0; i < 3; i++) { await pg.mouse.wheel(0, -100); await wait(100); } await wait(150);
    const before = await lab(() => window.__lab.log()); await lab(() => window.__lab.logTest('읽는 중에 온 새 로그', 'info')); await lab(() => window.__lab.logTest('읽는 중에 온 새 로그 2', 'info')); await wait(200);
    const after = await lab(() => window.__lab.log()), btn = (await lab(() => window.__lab.practice().hits)).some(q => q.id === 'log_new');
    check('③ 올려 읽는 중에 새 로그가 와도 맨 아래로 끌어내리지 않는다', before.scroll > 0 && after.scroll > before.scroll, `읽던 자리(아래에서) ${before.scroll}px → ${after.scroll}px`);
    check('③ "새 로그 N개" 단추가 뜬다', after.unseen === 2 && btn, `새 로그 ${after.unseen}개 · 단추 ${btn}`);
    if (out) await pg.screenshot({ path: path.join(out, '3_새로그.png') });
    await click('log_new'); const fin = await lab(() => window.__lab.log());
    check('③ 단추를 누르면 맨 아래(가장 새 것)로', fin.scroll === 0 && fin.unseen === 0, `자리 ${fin.scroll} · 새 로그 ${fin.unseen}`);
  } else check('② ③ 로그 묶기·새 로그 알림', false, '이 빌드에는 없다(고치기 전: 같은 경고가 줄마다 쌓이고, 새 로그가 오면 맨 아래로 끌어내린다)');
  check('페이지 오류 없음', !errs.length, errs.join(';'));
  if (out) fs.writeFileSync(path.join(out, 'readability.json'), JSON.stringify(res, null, 1));
  console.log(`실패 ${fail}`); await b.close(); process.exit(fail ? 1 : 0);
})();
