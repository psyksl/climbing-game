// 클라이밍장을 화면 기본 설정 그대로(지형·옵션을 건드리지 않고) 실제 키·마우스 이벤트로 연다(p3d-0.15.1). **스크립트가 넣는 실제 입력이며 사람 손이 아니다.**
// 보는 것: ① T 키 = 코스 시작 자리, 선택 코스 표시 ② 시작 홀드 둘을 마우스로 잡으면 새 시도가 시작된다 ③ 다음 홀드(초록 3·4)의 미리보기 문구와 실제 잡기
//   ④ 다른 코스의 홀드를 잡아도 선택 코스가 바뀌지 않고 "색 지킴"만 꺼진다 ⑤ 벽에 붙어 있는 동안의 계산 시간(한 걸음 ms)과 게임/실제 시간 비 ⑥ Z 키 = 자동 몸 맞추기 켬·끔
// 사용: [MODE=clip] [BUILD=다른 빌드.html] node test/gym_browser.mjs
import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url'; import { createRequire } from 'module';
const HERE = path.dirname(fileURLToPath(import.meta.url)), require = createRequire(import.meta.url), { chromium } = require('playwright'), THREE = await import('three');
const { makeGym } = await import(pathToFileURL(path.join(HERE, '../src/world.js')).href);
const clip = process.env.MODE === 'clip', build = process.env.BUILD || path.join(HERE, '..', clip ? 'climb3d_mocap.html' : 'climb3d.html'), OLD = !!process.env.BUILD;
const world = makeGym(), C = world.courses.find(c => c.id === 'green'), n = new THREE.Vector3(...C.frame.n), holds = world.boxes.filter(b => b.course === 'green' && b.role !== 'foot').sort((a, b) => a.seq - b.seq);
const front = b => { const c = b.min.clone().add(b.max).multiplyScalar(0.5), half = Math.abs(n.x) * (b.max.x - b.min.x) / 2 + Math.abs(n.z) * (b.max.z - b.min.z) / 2; return c.addScaledVector(n, half).setY(b.max.y).toArray(); };
let fails = 0; const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`); if (!ok) fails++; };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }), pg = await b.newPage({ viewport: { width: 1100, height: 700 } }), errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto('file://' + build + '?noshadow'); await pg.waitForTimeout(1800);
const ver = await pg.evaluate(() => document.title); console.log(`빌드 ${path.basename(build)} · ${ver} · 동작 ${await pg.evaluate(() => __p3.mode())} · 옵션 ${JSON.stringify(await pg.evaluate(() => __p3.opt()))}`);
const gym = () => pg.evaluate(() => __p3.gym()), hands = () => pg.evaluate(() => __p3.climb().hands.map(h => [h.st, h.box || '', h.why || ''])), hud = () => pg.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => /^자유 등반/.test(x.textContent || '') && x.children.length < 8); return d ? d.textContent.replace(/\s+/g, ' ').trim() : ''; });
await pg.mouse.move(550, 350); await pg.keyboard.press('KeyT'); await pg.waitForTimeout(900);
{ const g = await gym(); check('① T 키: 초록 코스의 시작 자리, 시도는 아직 없음', g.world === 'gym' && g.course === 'green' && !g.done && (OLD || g.tryId === 0), JSON.stringify(g)); console.log('   화면: ' + await hud()); }
// 손 하나를 실제 마우스로 보낸다(왼손 = 왼쪽 단추, 오른손 = 오른쪽 단추). 누르기 전의 미리보기 문구를 돌려준다
async function send(i, box, wait = 6000) { const p = front(box), s = await pg.evaluate(p => __p3.screenOf(p), p); if (!(s.x > 5 && s.x < 1095 && s.y > 5 && s.y < 695)) return { tip: '(화면 밖)', ok: false };
  await pg.mouse.move(s.x - 25, s.y + 18); await pg.mouse.move(s.x, s.y, { steps: 4 }); await pg.waitForTimeout(350);
  const tip = (await pg.evaluate(() => __p3.tagsText())).filter(t => /왼손|오른손/.test(t) && /●|○|✕|→/.test(t)).join(' ‖ ').replace(/\s+/g, ' ');
  await pg.mouse.down({ button: i ? 'right' : 'left' }); await pg.waitForTimeout(60); await pg.mouse.up({ button: i ? 'right' : 'left' });
  const ok = await pg.waitForFunction(([i, nm]) => { const h = __p3.climb().hands[i]; return h.st === 'hold' && h.box === nm; }, [i, box.name], { timeout: wait }).then(() => true).catch(() => false); await pg.waitForTimeout(400); return { tip, ok }; }
{ const a = await send(0, holds[0]), c = await send(1, holds[1]), g = await gym(); check('② 시작 홀드 둘을 마우스로 잡음 → 시도 1(오르는 중), 손 홀드 색 준수 중', a.ok && c.ok && (OLD || (g.tryId === 1 && g.clean && g.live && g.phase === 'climb')), JSON.stringify(g) + ' ' + JSON.stringify(await hands())); console.log('   화면: ' + await hud()); }
await pg.evaluate(() => __p3.perf(true)); await pg.waitForTimeout(3000);
{ const p = await pg.evaluate(() => __p3.perf()); console.log('   ⑤ 벽에 매달린 3초: ' + JSON.stringify(p)); check('⑤ 계산 한 걸음이 8.3ms(120Hz) 아래', p['계산_ms_걸음당'] < 8.3, `${p['계산_ms_걸음당']}ms · 게임/실제 ${p['게임_실제_비']}`); }
{ const a = await send(0, holds[2]); console.log(`   ③ 초록 3 미리보기: ${a.tip}`); check('③ 초록 3(왼손): 잡음', a.ok, JSON.stringify(await hands()));
  const c = await send(1, holds[3]); console.log(`   ③ 초록 4 미리보기: ${c.tip}`); check('③ 초록 4(오른손): 미리보기가 "뻗어 보기"이고 실제로 잡음(GPT 재현 사례)', c.ok && (OLD || /→ 오른손 뻗어 보기/.test(c.tip)), `미리보기 "${c.tip}" · ${JSON.stringify(await hands())}`); }
// ④ 다른 코스·코스 밖의 홀드: 지금 손이 닿는 것 가운데 초록이 아닌 것을 하나 찾아 잡는다
{ const cand = await pg.evaluate(() => 0), L = await pg.evaluate(() => __p3.body()), pos = new THREE.Vector3(...(L.pos || [0, 0, 0])); let done = false;
  for (const x of world.boxes.filter(q => q.course !== 'green' && !q.stair && !q.hidden && q.kind !== 'wall' && q.kind !== 'floor' && q.max.y - q.min.y < 0.3).map(q => ({ q, d: new THREE.Vector3(...front(q)).distanceTo(pos.clone().add(new THREE.Vector3(0, 1.5, 0))) })).sort((a, c) => a.d - c.d).slice(0, 8)) {
    for (const i of [0, 1]) { const pr = await pg.evaluate(([i, p]) => __p3.probe('hand', i, p), [i, front(x.q)]); if (!pr.ok) continue; const r = await send(i, x.q, 4000); if (!r.ok) continue; const g = await gym();
      check(`④ 다른 홀드(${x.q.name})를 잡음 → 선택 코스는 초록 그대로, 색 지킴만 꺼짐`, g.course === 'green' && (OLD || (!g.clean && g.live && g.tryId === 1)), JSON.stringify(g)); console.log('   화면: ' + await hud()); done = true; break; } if (done) break; }
  if (!done) check('④ 닿는 다른 홀드를 찾아 잡음', false, '닿는 다른 홀드가 없었다(이 시험의 조건이 서지 않음)'); }
if (!OLD) { const o0 = await pg.evaluate(() => __p3.opt().autoBody); await pg.keyboard.press('KeyZ'); await pg.waitForTimeout(200); const o1 = await pg.evaluate(() => __p3.opt().autoBody), t = await pg.evaluate(() => document.body.innerText.match(/쉬운 조작 [^\n]{0,34}/)?.[0] || '');
  check('⑥ Z 키: 자동 몸 맞추기만 꺼지고 화면에 보인다', o0 === true && o1 === false && /자동 몸 맞추기 끔/.test(t), `${o0} → ${o1} · "${t}"`); }
// ⑦~⑨ p3d-0.15.3(GPT의 0.15.2 검토 — 화면 정리): 개발 키는 개발 모드(F2)에서만 듣는다 · 조작표 접기(K) · T는 코스를 다 돈 다음 누르기 시험 조각 앞
if (!OLD) { const opt = () => pg.evaluate(() => __p3.opt()), help = () => pg.evaluate(() => document.getElementById('help').innerText);
  const a0 = await opt(); await pg.keyboard.press('KeyU'); await pg.keyboard.press('KeyP'); await pg.keyboard.press('KeyY'); await pg.waitForTimeout(200); const a1 = await opt(), h0 = await help();
  check('⑦ 개발 모드 밖: U·P·Y를 눌러도 잡기 보정·누르기·자세 보조가 바뀌지 않고, 조작표에 그 줄이 없다', a1.grabAssist === a0.grabAssist && a1.press === a0.press && a1.poseAssist === a0.poseAssist && !a0.dev && !/잡기 보정 켬·끔/.test(h0), `개발 모드 ${a0.dev} · 조작표에 "잡기 보정" 줄 ${/잡기 보정 켬·끔/.test(h0)}`);
  await pg.keyboard.press('F2'); await pg.waitForTimeout(200); const d1 = await opt(), h1 = await help(); await pg.keyboard.press('KeyU'); await pg.waitForTimeout(200); const d2 = await opt(); await pg.keyboard.press('KeyU'); await pg.waitForTimeout(150);
  check('⑦ F2 = 개발 모드: 조작표에 개발 키가 보이고 U가 잡기 보정을 바꾼다', d1.dev === true && /잡기 보정 켬·끔/.test(h1) && d2.grabAssist === !d1.grabAssist, `개발 모드 ${d1.dev} · 잡기 보정 ${d1.grabAssist} → ${d2.grabAssist}`);
  await pg.keyboard.press('F2'); await pg.waitForTimeout(150); const hf0 = (await help()).length; await pg.keyboard.press('KeyK'); await pg.waitForTimeout(200); const hf1 = await help(); await pg.keyboard.press('KeyK'); await pg.waitForTimeout(200); const hf2 = (await help()).length;
  check('⑧ K: 조작표를 접으면 한 줄이고 다시 누르면 펼쳐진다', hf1.length < 60 && /펼치기/.test(hf1) && hf2 === hf0, `펼침 ${hf0}자 → 접힘 "${hf1.replace(/\n/g, ' ')}" → ${hf2}자`);
  let at = null; for (let k = 0; k < 16; k++) { await pg.keyboard.press('KeyT'); await pg.waitForTimeout(120); at = await pg.evaluate(() => ({ pos: __p3.body().pos, course: __p3.gym().course })); if (!at.course) break; }
  check('⑨ T: 코스를 다 돈 다음 누르기 시험 조각 앞(코스 선택 없음)', at && !at.course && Math.abs(at.pos[0] - 1.5) < 0.05 && Math.abs(at.pos[2] + 1.28) < 0.05, JSON.stringify(at)); }
check('페이지 오류 없음', !errs.length, errs.join(' / ')); await b.close(); console.log(`실패 ${fails}`); process.exit(fails ? 1 : 0);
