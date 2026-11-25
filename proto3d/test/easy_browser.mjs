// 쉬운 조작 ① 조준 맞춤을 실제 마우스 입력으로 확인한다(p3d-0.13.0). 화면이 실제 시간으로 도는 채로, 벽 앞에 서서 턱 A의 위쪽 벽면·아래쪽 벽면·턱 앞면을 마우스로 겨누고 눌러 본다.
// 쉬운 조작 켬: 세 자리 모두 맞춘 자리(__p3.aimGrip)가 턱 A의 모서리이고 누르면 왼손이 턱 A를 잡는다. 끔: 벽면을 누르면 거부("잡을 수 있는 턱이 아님")된다. 스크립트가 넣는 실제 마우스 이벤트이며 사람 손이 아니다.
// 사용: [MODE=clip] node test/easy_browser.mjs
import path from 'path'; import { fileURLToPath } from 'url'; import { createRequire } from 'module';
const HERE = path.dirname(fileURLToPath(import.meta.url)), require = createRequire(import.meta.url), { chromium } = require('playwright');
const clip = process.env.MODE === 'clip', build = path.join(HERE, '..', clip ? 'climb3d_mocap.html' : 'climb3d.html');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`); if (!ok) fails++; };
const SPOTS = [['턱 A 위쪽 벽면(8cm 위)', [-1.1, 2.00, -3.0]], ['턱 A 아래쪽 벽면(12cm 아래)', [-1.1, 1.73, -3.0]], ['턱 A 앞면', [-1.1, 1.885, -2.84]]];
for (const easy of [true, false]) for (const [name, pt] of SPOTS) {
  const pg = await b.newPage({ viewport: { width: 1100, height: 700 } }), errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + build + '?test&noshadow&manual'); await pg.waitForTimeout(1500);
  await pg.evaluate(([m, easy]) => { if (m) __p3.setMode(m); __p3.opt({ easy, handMode: 1, footAssist: false }); __p3.wallStart(); }, [clip ? 'clip' : '', easy]); await pg.waitForTimeout(700);
  const s = await pg.evaluate(p => __p3.screenOf(p), pt); if (!(s.x > 5 && s.x < 1095 && s.y > 5 && s.y < 695)) { check(`${name}: 겨눌 점이 화면 안`, false, JSON.stringify(s)); await pg.close(); continue; }
  await pg.mouse.move(s.x - 30, s.y + 20); await pg.mouse.move(s.x, s.y, { steps: 4 }); await pg.waitForTimeout(250);
  const g = await pg.evaluate(() => ({ grip: __p3.aimGrip(), aim: __p3.aim() }));
  await pg.mouse.down({ button: 'left' }); await pg.waitForTimeout(60); await pg.mouse.up({ button: 'left' });
  const ok = await pg.waitForFunction(() => { const L = __p3.climb(); return L.hands[0].st === 'hold' && L.hands[0].box === '턱 A'; }, null, { timeout: 10000 }).then(() => true).catch(() => false);
  const log = await pg.evaluate(() => __p3.climbLog().filter(e => e.type !== 'try').slice(-2).map(e => `${e.type}:${e.why || ''}`).join(' | '));
  const onEdge = !!g.grip && Math.abs(g.grip[1] - 1.92) < 0.005 && Math.abs(g.grip[2] + 2.84) < 0.005;
  if (easy) check(`쉬운 조작 켬 · ${name}: 맞춘 자리가 턱 A의 모서리이고 누르면 왼손이 잡는다`, onEdge && ok, `맞춘 자리 ${g.grip ? g.grip.map(v => v.toFixed(2)) : '없음'} · ${log}`);
  else if (/벽면/.test(name)) check(`쉬운 조작 끔 · ${name}: 전처럼 거부된다(대조)`, !ok && /잡을 수 있는 턱이 아님/.test(log), log);
  else check(`쉬운 조작 끔 · ${name}: 전처럼 잡는다`, ok, log + ' · ' + await pg.evaluate(() => JSON.stringify(__p3.climb().hands.map(h => [h.st, h.box, h.why]))) + ' · 겨눈 점 ' + (g.aim ? g.aim.map(v => v.toFixed(2)) : '없음'));
  if (errs.length) check('페이지 오류 없음', false, errs.join(' / ')); await pg.close(); }
await b.close(); console.log(`실패 ${fails}`); process.exit(fails ? 1 : 0);
