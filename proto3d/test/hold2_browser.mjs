// 손 조작 2(누르는 동안 뻗고 떼면 잡기)를 **실제 키·마우스 이벤트**로 확인한다(p3d-0.15.8, GPT의 0.15.7 2차 검토). 스크립트가 넣는 실제 입력이며 사람 손이 아니다.
// 바뀐 것: 이미 붙어 있는 손은 누르는 동안 목표만 고르고 그대로 붙어 있다가, 버튼을 떼는 순간에 그 자리로 옮긴다(갈 수 없으면 거부만 — 손은 붙어 있다). 붙어 있지 않은 손은 전처럼 누르는 동안 뻗는다.
// 장면: ① 빈손 = 누르는 동안 뻗고 떼면 잡음 ② 붙은 손 = 누르는 동안 유지, 떼면 옮김(+ 뗀 뒤 첫 움직임까지의 시간) ③ 빈 벽을 잘못 겨눔 ④ 낮은 발 홀드를 손으로 겨눔 ⑤ 두 손을 연달아 눌렀다 뗌
//       ⑥ 누른 채 Shift를 눌렀다 뗌(손 명령 그대로) ⑦ 누른 채 창을 벗어남(명령 없음) ⑧ 누른 채 시점 보기(V) = 취소 ⑨ 일부러 놓기(Q)는 그대로
// OLD=1이면 주소에 ?sw=OLDHOLD2를 붙여 옛 동작(누르는 순간 놓음)으로 같은 장면을 돈다 — 견주기용(그때는 FAIL이 옛 동작의 모습이다).
// 사용: [MODE=clip] [OLD=1] [VIDEO=폴더(실제 시간 녹화)] [BUILD=빌드.html] node test/hold2_browser.mjs
import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url'; import { createRequire } from 'module';
const HERE = path.dirname(fileURLToPath(import.meta.url)), require = createRequire(import.meta.url), { chromium } = require('playwright'), THREE = await import('three');
const { makeGym } = await import(pathToFileURL(path.join(HERE, '../src/world.js')).href);
const E = process.env, clip = E.MODE === 'clip', build = E.BUILD || path.join(HERE, '..', clip ? 'climb3d_mocap.html' : 'climb3d.html'), OLD = E.OLD === '1';
const world = makeGym(), C = world.courses.find(c => c.id === 'green'), n = new THREE.Vector3(...C.frame.n), box = nm => world.boxes.find(b => b.name === nm);
const front = (b, du = 0, dy = 0) => { const c = b.min.clone().add(b.max).multiplyScalar(0.5), half = Math.abs(n.x) * (b.max.x - b.min.x) / 2 + Math.abs(n.z) * (b.max.z - b.min.z) / 2; return c.addScaledVector(n, half).setY(b.max.y + dy).add(new THREE.Vector3(du, 0, 0)).toArray(); };
let fails = 0; const say = s => console.log(s), check = (name, ok, d = '') => { say(`${ok ? 'PASS' : 'FAIL'}  ${name} ${d}`); if (!ok) fails++; };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }), pg = await b.newPage({ viewport: { width: 1280, height: 760 }, ...(E.VIDEO ? { recordVideo: { dir: E.VIDEO, size: { width: 1280, height: 760 } } } : {}) }), errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto('file://' + build + (OLD ? '?sw=OLDHOLD2' : '')); await pg.waitForTimeout(2500);
const P = (f, a) => pg.evaluate(f, a), tick = () => P(() => __p3.tick());
const st = () => P(() => { const L = __p3.climb(); return { h: L.hands.map(h => ({ st: h.st, box: h.box || '', why: h.why || '', arm: !!h.arm })), on: L.on, y: __p3.body().pos[1], pick: __p3.aimPick(), t: __p3.tick() }; });
const untilTicks = async k => { const t0 = await tick(); for (let i = 0; i < 400; i++) { await pg.waitForTimeout(40); if (await tick() - t0 >= k) return; } };
const until = async (f, maxTicks = 420) => { const t0 = await tick(); for (let i = 0; i < 600; i++) { const s = await st(); if (f(s)) return s; if (s.t - t0 > maxTicks) return s; await pg.waitForTimeout(40); } return st(); };
const hs = s => s.h.map(h => (h.st === 'hold' ? h.box : h.st + (h.arm ? '(예약)' : ''))).join(' / ');
const evFrom = { k: 0 }, events = async () => { const r = await P(k => __p3.climbLog().filter(e => e.k > k && !/^(try|bump|plan)$/.test(e.type)).map(e => ({ k: e.k, s: `${e.type} ${e.name || ''} ${e.why || ''}`.trim() })), evFrom.k); if (r.length) evFrom.k = r[r.length - 1].k; return r.map(x => x.s).join(' ; '); };
const aimAt = async p => { const s = await P(p => __p3.screenOf(p), p); await pg.mouse.move(s.x - 18, s.y + 12); await pg.mouse.move(s.x, s.y, { steps: 5 }); await pg.waitForTimeout(250); return s; };
const BTN = ['left', 'right'];
// 빈 벽의 한 점: 시작 자리 위쪽의 벽면에서 어느 홀드에서도 가장 먼 자리(조준 맞춤 26cm에 걸리지 않게 45cm 넘게 떨어진 곳)
const emptyPoint = () => { const t = new THREE.Vector3(n.z, 0, -n.x), f0 = new THREE.Vector3(...front(box('초록 시작1'))), holds = world.boxes.filter(x => x.kind !== 'wall' && x.kind !== 'floor'); let best = null;
  for (let u = -1.6; u <= 1.6; u += 0.1) for (let y = 1.0; y <= 2.6; y += 0.1) { const p = f0.clone().addScaledVector(t, u).setY(y); let d = 9; for (const x of holds) d = Math.min(d, p.distanceTo(p.clone().clamp(x.min, x.max))); if (!best || d > best.d) best = { p: p.toArray(), d }; } return best; };
const EMPTY = emptyPoint();
// 누르고(잠깐 들고 있다가) 뗀다. hold = 들고 있는 걸음 수. 돌려주는 것: 누르는 동안의 상태, 뗀 뒤 정해진 상태
async function press(i, p, { hold = 40, settle = s => true, mid = null } = {}) { await aimAt(p); await pg.mouse.down({ button: BTN[i] }); await untilTicks(hold); const during = await st(); if (mid) await mid(); const t0 = await tick(); await pg.mouse.up({ button: BTN[i] }); const after = await until(settle); return { during, after, t0 }; }
say(`빌드 ${path.basename(build)} · ${await P(() => __p3.VERSION)} · 동작 ${await P(() => __p3.mode())} · ${OLD ? '옛 동작(OLDHOLD2 — 견주기)' : '새 동작'} · 실제 키·마우스 이벤트(스크립트 — 사람 손 아님)`);
await P(() => __p3.opt({ handMode: 2 })); say(`설정 ${JSON.stringify(await P(() => { const o = __p3.opt(), e = __p3.effect(); return { 손_조작: o.handMode, 발_보조: o.footAssist, 쉬운_조작: e.easy, 전신_연결: e.link, 검사: e.plan, 보호: e.guard }; }))}`);
await pg.mouse.move(640, 380); await pg.keyboard.press('KeyT'); await pg.waitForTimeout(1200);
check('T 키: 초록 코스의 시작 자리', (await P(() => __p3.gym())).course === 'green');
// ① 빈손: 누르는 동안 뻗고 떼면 잡는다(두 손 다)
{ const a = await press(0, front(box('초록 시작1')), { hold: 70, settle: s => s.h[0].st === 'hold' }); check('① 빈 왼손: 누르는 동안 뻗고(reach) 떼면 잡는다', a.during.h[0].st === 'reach' && a.after.h[0].box === '초록 시작1', `누르는 동안 ${a.during.h[0].st} → ${hs(a.after)}`);
  const c = await press(1, front(box('초록 시작2')), { hold: 70, settle: s => s.h[1].st === 'hold' }); check('① 빈 오른손도 같다', c.during.h[1].st === 'reach' && c.after.h[1].box === '초록 시작2', `누르는 동안 ${c.during.h[1].st} → ${hs(c.after)}`); await events(); }
// ② 붙은 손: 누르는 동안 그대로 붙어 있고, 떼면 옮긴다. 뗀 뒤 손이 움직이기 시작할 때까지의 걸음 수
{ await aimAt(front(box('초록 3'))); await pg.mouse.down({ button: 'left' }); await untilTicks(50); const during = await st(), tag = (await P(() => __p3.tagsText())).find(t => /왼손/.test(t) && /고르는|잡고/.test(t)) || '';
  const t0 = await tick(); await pg.mouse.up({ button: 'left' }); const mv = await until(s => s.h[0].st === 'reach' || s.h[0].box === '초록 3', 120), after = await until(s => s.h[0].st === 'hold' && s.h[0].box === '초록 3');
  check('② 붙은 왼손: 누르는 동안 시작 홀드에 그대로 붙어 있다', during.h[0].st === 'hold' && during.h[0].box === '초록 시작1' && (OLD || during.pick[0] === true), `누르는 동안 ${hs(during)} · 꼬리표 "${tag.replace(/\s+/g, ' ').slice(0, 40)}"`);
  check('② 버튼을 떼면 겨눈 초록 3으로 옮겨 잡는다', after.h[0].box === '초록 3', `${hs(after)} · 뗀 뒤 손이 움직이기까지 ${mv.t - t0}걸음(${((mv.t - t0) / 120 * 1000).toFixed(0)}ms 게임 시간) · ${await events()}`); }
// ③ 빈 벽을 잘못 겨눔: 손은 그대로 붙어 있고 거부만 한다
{ const s0 = await st(), a = await press(1, EMPTY.p, { hold: 40, settle: s => true }); await untilTicks(60); const s2 = await st();
  check(`③ 붙은 오른손으로 빈 벽(가장 가까운 홀드에서 ${(EMPTY.d * 100).toFixed(0)}cm)을 눌렀다 뗌: 누르는 동안에도 뗀 뒤에도 붙어 있다`, a.during.h[1].st === 'hold' && s2.h[1].st === 'hold' && s2.h[1].box === s0.h[1].box && s2.h[0].st === 'hold', `누르는 동안 ${hs(a.during)} → ${hs(s2)} · ${await events()}`); }
// ④ 낮은 발 홀드를 손으로 겨눔(녹화에서 손이 발 높이로 내려가던 장면): 손이 먼저 떨어지지 않는다(갈 수 있으면 옮기고, 못 가면 거부·예약)
{ const a = await press(1, front(box('초록 발1')), { hold: 40, settle: s => true }); await untilTicks(40); const s1 = await st(); await untilTicks(320); const s2 = await st();
  check('④ 붙은 오른손으로 낮은 발 홀드를 눌렀다 뗌: 누르는 동안 붙어 있고, 뗀 뒤 손이 빈 채로 남지 않는다', a.during.h[1].st === 'hold' && s1.h[1].st !== 'free' && s2.h[1].st === 'hold', `누르는 동안 ${hs(a.during)} → 0.3초 뒤 ${hs(s1)} → ${hs(s2)} · ${await events()}`);
  if (s2.h[1].box !== '초록 시작2') { await press(1, front(box('초록 시작2')), { hold: 30, settle: s => s.h[1].box === '초록 시작2' }); await events(); } }
// ⑤ 두 손을 연달아 눌렀다 뗌(빈 벽): 둘 다 붙어 있다 — 옛 동작은 둘 다 놓고 떨어진다
{ const p = EMPTY.p; await aimAt(p); await pg.mouse.down({ button: 'left' }); await pg.waitForTimeout(60); await pg.mouse.down({ button: 'right' }); await untilTicks(40); const during = await st(); await pg.mouse.up({ button: 'left' }); await pg.waitForTimeout(60); await pg.mouse.up({ button: 'right' }); await untilTicks(120); const s2 = await st();
  check('⑤ 두 손을 연달아 눌렀다 뗌(빈 벽): 두 손이 다 붙어 있다', during.h.every(h => h.st === 'hold') && s2.h.every(h => h.st === 'hold') && s2.on, `누르는 동안 ${hs(during)} → ${hs(s2)} · 벽 ${s2.on ? '위' : '에서 떨어짐'} · ${await events()}`);
  if (!s2.on || !s2.h.every(h => h.st === 'hold')) { say('  (옛 동작에서는 여기서 떨어진다 — 뒤 장면은 다시 붙은 뒤에)'); await pg.keyboard.press('KeyT'); await pg.waitForTimeout(1200); await press(0, front(box('초록 시작1')), { hold: 70, settle: s => s.h[0].st === 'hold' }); await press(1, front(box('초록 시작2')), { hold: 70, settle: s => s.h[1].st === 'hold' }); await events(); } }
// ⑥ 누른 채 Shift(발 지정 키)를 눌렀다 뗌: 대상은 누르는 순간에 정해졌다(손). 손 명령이 나간다
{ const g0 = (await P(() => __p3.gestures())).length; await aimAt(front(box('초록 4'))); await pg.mouse.down({ button: 'right' }); await untilTicks(20); await pg.keyboard.down('ShiftLeft'); await untilTicks(20); await pg.mouse.up({ button: 'right' }); await pg.keyboard.up('ShiftLeft'); const after = await until(s => s.h[1].box === '초록 4'), g = (await P(() => __p3.gestures())).slice(g0);
  check('⑥ 누른 채 Shift를 눌러도 손 명령 그대로(초록 4를 잡는다)', after.h[1].box === '초록 4' && g.length && g[g.length - 1].limb === 'hand', `${hs(after)} · 대상 ${g.length ? g[g.length - 1].limb : '-'} · ${await events()}`); }
// ⑦ 누른 채 창을 벗어남: 명령 없음, 손은 그대로
{ const s0 = await st(); await aimAt(front(box('초록 5'))); await pg.mouse.down({ button: 'left' }); await untilTicks(30); await P(() => document.documentElement.dispatchEvent(new MouseEvent('mouseleave'))); await untilTicks(20); const mid = await st(); await pg.mouse.up({ button: 'left' }); await untilTicks(120); const s2 = await st(), g = await P(() => __p3.gestures());
  check('⑦ 누른 채 창을 벗어난 뒤 뗌: 명령이 나가지 않고 왼손은 그대로', s2.h[0].st === 'hold' && s2.h[0].box === s0.h[0].box && mid.pick[0] === false, `${hs(s2)} · 취소 까닭 ${g[g.length - 1].cancelled || '-'} · ${await events() || '사건 없음'}`); }
// ⑧ 누른 채 시점 보기(V) = 취소
{ const s0 = await st(); await aimAt(front(box('초록 5'))); await pg.mouse.down({ button: 'left' }); await untilTicks(30); await pg.keyboard.press('KeyV'); await untilTicks(20); await pg.mouse.up({ button: 'left' }); await untilTicks(120); const s2 = await st(); await pg.keyboard.press('KeyV'); await untilTicks(20);
  check('⑧ 누른 채 시점 보기로 바꿈: 명령이 나가지 않고 왼손은 그대로', s2.h[0].st === 'hold' && s2.h[0].box === s0.h[0].box, `${hs(s2)} · ${await events() || '사건 없음'}`); }
// ⑨ 일부러 놓기(Q)는 그대로
{ await pg.keyboard.press('KeyQ'); await untilTicks(40); const s2 = await st(); check('⑨ Q = 왼손 놓기(그대로)', s2.h[0].st !== 'hold', `${hs(s2)} · ${await events()}`); }
check('페이지 오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
say(`실패 ${fails}`); await pg.close(); await b.close(); process.exit(fails ? 1 : 0);
