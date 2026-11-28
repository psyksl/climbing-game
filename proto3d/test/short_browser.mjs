// 짧은 구간을 **실제 키·마우스 이벤트**로 넣는다(p3d-0.15.2, GPT의 0.15.1 재검토). 스크립트가 넣는 실제 입력이며 사람 손이 아니다.
// 화면 기본 설정 그대로(지형·옵션·그림자를 건드리지 않는다. SHADOW=0이면 그림자 끔 대조). 구간 = 초록 시작1·2 → 3·4 → 5 → 6(두 손), 발은 초록 발 홀드.
// 넣는 것: T(코스 시작 자리), 좌클릭·우클릭(손), Shift+클릭(발), W 누르고 있기, Q·E(손 놓기). 단계마다 상태가 정해질 때까지 기다린다(사람이 보고 기다리듯이).
// 입력은 계산 걸음마다 기록해(__p3.recStart) 파일로 남긴다 → test/short_video.mjs가 같은 입력을 한 걸음씩 다시 틀어 1배속 영상으로 찍는다.
// 사용: [MODE=clip] [ROUTE=a|b|c|d|e|f|g] [RECOVER=1(실패·취소·복구 장면을 끼움)] [KEEP=1] [LINK=1] [PLAN=1] [GUARD=1] [FOOT=0|1(발 보조 — p3d-0.15.7부터 화면 기본 끔)] [VIDEO=폴더(실제 시간 녹화)] OUT=입력.json node test/short_browser.mjs
import fs from 'fs'; import path from 'path'; import crypto from 'crypto'; import { fileURLToPath, pathToFileURL } from 'url'; import { createRequire } from 'module';
const HERE = path.dirname(fileURLToPath(import.meta.url)), require = createRequire(import.meta.url), { chromium } = require('playwright'), THREE = await import('three');
const { makeGym } = await import(pathToFileURL(path.join(HERE, '../src/world.js')).href), { ROUTES } = await import(pathToFileURL(path.join(HERE, 'short_section.mjs')).href);
const E = process.env, clip = E.MODE === 'clip', build = E.BUILD || path.join(HERE, '..', clip ? 'climb3d_mocap.html' : 'climb3d.html'), RT = E.ROUTE || 'a';
const world = makeGym(), C = world.courses.find(c => c.id === 'green'), n = new THREE.Vector3(...C.frame.n), box = nm => world.boxes.find(b => b.name === nm);
const front = (b, du = 0, dy = 0) => { const c = b.min.clone().add(b.max).multiplyScalar(0.5), half = Math.abs(n.x) * (b.max.x - b.min.x) / 2 + Math.abs(n.z) * (b.max.z - b.min.z) / 2; return c.addScaledVector(n, half).setY(b.max.y + dy).add(new THREE.Vector3(du, 0, 0)).toArray(); };
let fails = 0; const log = [], say = s => { log.push(s); console.log(s); }, check = (name, ok, d = '') => { say(`${ok ? 'PASS' : 'FAIL'}  ${name} ${d}`); if (!ok) fails++; };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }), pg = await b.newPage({ viewport: { width: 1280, height: 760 }, ...(E.VIDEO ? { recordVideo: { dir: E.VIDEO, size: { width: 1280, height: 760 } } } : {}) }), errs = []; pg.on('pageerror', e => errs.push(e.message));
{ const q = [E.SHADOW === '0' ? 'noshadow' : '', E.KEEP === '1' ? 'keep=1' : '', E.LINK === '1' ? 'link=1' : E.LINK === '0' ? 'link=0' : '', E.PLAN === '1' ? 'plan=1' : '', E.GUARD === '1' ? 'guard=1' : '', E.FOOT === '0' ? 'foot=0' : E.FOOT === '1' ? 'foot=1' : ''].filter(Boolean); await pg.goto('file://' + build + (q.length ? '?' + q.join('&') : '')); } await pg.waitForTimeout(2500);
const P = (f, a) => pg.evaluate(f, a), tick = () => P(() => __p3.tick()), st = () => P(() => { const L = __p3.climb(); return { h: L.hands.map(h => ({ st: h.st, box: h.box || '', why: h.why || '', arm: !!h.arm })), f: L.feet.map(f => ({ st: f.st, box: f.box || '', why: f.why || '' })), y: __p3.body().pos[1], t: __p3.tick() }; });
const untilTicks = async k => { const t0 = await tick(); for (let i = 0; i < 400; i++) { await pg.waitForTimeout(40); if (await tick() - t0 >= k) return; } };
const opts = await P(() => __p3.opt()), ver = await P(() => __p3.VERSION);
say(`빌드 ${path.basename(build)} · ${ver} · 동작 ${await P(() => __p3.mode())} · 그림자 ${E.SHADOW === '0' ? '끔(대조)' : '기본'} · 옵션 ${JSON.stringify(opts)}`);
await pg.mouse.move(640, 380); await pg.keyboard.press('KeyT'); await pg.waitForTimeout(900);
check('T 키(실제 키): 초록 코스의 시작 자리', (await P(() => __p3.gym())).course === 'green');
// 기록은 같은 자리에서 다시 시작한 걸음부터 한다(T가 한 것과 같은 자리·같은 방향. 영상이 같은 처음에서 다시 틀 수 있게)
await P(([pos, yaw]) => { __p3.reset({ pos, yaw }); __p3.recStart(); }, [C.startPos, C.startYaw]); await untilTicks(30);
const evFrom = { k: 0 }, events = async () => { const r = await P(k => { const L = __p3.climbLog(); return L.filter(e => e.k > k && !/^(try|bump)$/.test(e.type)).map(e => ({ k: e.k, s: `${e.t.toFixed(2)} ${e.type} ${e.name || ''} ${e.why || ''}${e.cause && e.cause !== 'command' ? ' [' + e.cause + ']' : ''}${e.keptGrip ? ' (잡기 유지)' : ''}`.trim() })); }, evFrom.k); if (r.length) evFrom.k = r[r.length - 1].k; return r.map(x => x.s); };
const steps = [];
async function hand(i, name, du = 0) { await perf0(); const p = front(box(name), du), s = await P(p => __p3.screenOf(p), p); await pg.mouse.move(s.x - 18, s.y + 12); await pg.mouse.move(s.x, s.y, { steps: 5 }); await pg.waitForTimeout(280);
  const tip = (await P(() => __p3.tagsText())).filter(t => /왼손|오른손/.test(t) && /→|○|✕/.test(t)).join(' ').replace(/\s+/g, ' ').slice(0, 90), t0 = await tick();
  await pg.mouse.down({ button: i ? 'right' : 'left' }); await pg.waitForTimeout(70); await pg.mouse.up({ button: i ? 'right' : 'left' });
  let r = null; for (let k = 0; k < 120; k++) { await pg.waitForTimeout(50); const x = await st(), h = x.h[i]; if (h.st === 'hold' && h.box === name) { r = '잡음'; break; } if (x.t - t0 > 60 && h.st === 'free' && !h.arm) { r = `못 잡음(${h.why || '-'})`; break; } if (x.t - t0 > 420) { r = h.arm ? '예약된 채 기다림' : `못 잡음(${h.why || '-'})`; break; } }
  await untilTicks(30); const x = await st(); steps.push({ step: `${i ? '오른손' : '왼손'} → ${name}`, key: i ? '우클릭' : '좌클릭', res: r, tip, t: +((x.t - t0) / 120).toFixed(2), ...snap(x), ev: await events(), perf: await perf1() }); return r === '잡음'; }
async function foot(i, name) { await perf0(); const p = front(box(name), 0, -0.012), s = await P(p => __p3.screenOf(p), p); await pg.keyboard.down('ShiftLeft'); await pg.mouse.move(s.x - 14, s.y + 10); await pg.mouse.move(s.x, s.y, { steps: 5 }); await pg.waitForTimeout(280); const t0 = await tick();
  const tip = (await P(() => __p3.tagsText())).filter(t => /왼발|오른발/.test(t) && /●|○|✕/.test(t)).join(' ').replace(/\s+/g, ' ').slice(0, 90);
  await pg.mouse.down({ button: i ? 'right' : 'left' }); await pg.waitForTimeout(70); await pg.mouse.up({ button: i ? 'right' : 'left' }); await pg.waitForTimeout(60); await pg.keyboard.up('ShiftLeft');
  let r = null; for (let k = 0; k < 100; k++) { await pg.waitForTimeout(50); const x = await st(), f = x.f[i]; if (f.st === 'plant' && f.box === name) { r = '디딤'; break; } if (x.t - t0 > 40 && f.st !== 'move') { r = `못 디딤(${f.why || '-'} · 지금 ${f.st === 'plant' ? f.box : '-'})`; break; } if (x.t - t0 > 360) { r = '못 디딤(시간)'; break; } }
  await untilTicks(30); const x = await st(); steps.push({ step: `${i ? '오른발' : '왼발'} → ${name}`, key: `Shift+${i ? '우클릭' : '좌클릭'}`, res: r, tip, t: +((x.t - t0) / 120).toFixed(2), ...snap(x), ev: await events(), perf: await perf1() }); return r === '디딤'; }
async function keyHold(code, sec, label) { await perf0(); const t0 = await tick(); await pg.keyboard.down(code); await untilTicks(Math.round(sec * 120)); await pg.keyboard.up(code); await untilTicks(36); const x = await st(); steps.push({ step: label, key: code.replace('Key', ''), res: `몸 높이 ${x.y.toFixed(2)}m`, t: +((x.t - t0) / 120).toFixed(2), ...snap(x), ev: await events(), perf: await perf1() }); }
async function tap(code, label) { await perf0(); const t0 = await tick(); await pg.keyboard.press(code); await untilTicks(40); const x = await st(); steps.push({ step: label, key: code.replace('Key', ''), res: '', t: +((x.t - t0) / 120).toFixed(2), ...snap(x), ev: await events(), perf: await perf1() }); }
// 단계마다의 실행 성능(기본 렌더링 그대로): 그 단계 동안의 평균 프레임 시간·게임/실제 시간 비·계산과 그리기의 몫. 이 환경은 GPU가 없어(소프트웨어 그리기) 그리기가 사람의 기계보다 훨씬 느리다
const perf0 = () => P(() => { __p3.perf(true); }), perf1 = async () => { const p = await P(() => __p3.perf()); return { fps: p['평균_fps'], ratio: p['게임_실제_비'], step: p['계산_ms_걸음당'], draw: p['그리기_ms_프레임당'], long: p['가장_긴_프레임_ms'] }; };
const snap = x => ({ hands: x.h.map(h => (h.st === 'hold' ? h.box : h.st === 'reach' ? '(뻗는 중)' : h.arm ? '(예약)' : '-')), feet: x.f.map(f => (f.st === 'plant' ? f.box : f.st === 'move' ? '(가는 중)' : '-')), y: +x.y.toFixed(2), at: +(x.t / 120).toFixed(2) });
const manual = [null, null], changed = [];
for (const [kind, a, b2, du = 0] of ROUTES[RT]) {
  if (kind === 'hand') await hand(a, b2, du); else if (kind === 'foot') { manual[a] = (await foot(a, b2)) ? b2 : null; } else if (kind === 'W') await keyHold('KeyW', a, `W ${a}초`);
  const L = steps[steps.length - 1]; for (let i = 0; i < 2; i++) if (manual[i] && L.feet[i] !== manual[i]) { changed.push(`${L.step} 뒤: ${i ? '오른발' : '왼발'}이 수동으로 디딘 ${manual[i]}에 있지 않다(지금 ${L.feet[i]}) — ${L.ev.filter(e => e.includes(i ? '오른발' : '왼발')).join(' / ') || '기록 없음'}`); manual[i] = null; }
  // 실패·취소·복구 장면(RECOVER=1): 초록 3·4를 잡고 두 발을 디딘 뒤에 끼운다
  if (E.RECOVER === '1' && kind === 'W' && steps.filter(s => /^W/.test(s.step)).length === 2 && !steps.some(s => /복구|취소|놓기/.test(s.step))) {
    await tap('KeyQ', '왼손 놓기(Q) — 명시적으로 놓음'); const r1 = await hand(0, steps.find(s => /왼손 →/.test(s.step) && s.res === '잡음' && !/시작/.test(s.step)) ? '초록 3' : '초록 시작1'); steps[steps.length - 1].step += ' (놓은 손 복구)';
    const far = await hand(0, '초록 7'); steps[steps.length - 1].step += ' (먼 홀드 — 못 잡는 것을 봄)'; if (!far) { await pg.waitForTimeout(400); await hand(0, '초록 3'); steps[steps.length - 1].step += ' (같은 손 재시도·복구)'; }
    { const p = front(box('초록 6')), s = await P(p => __p3.screenOf(p), p); await pg.mouse.move(s.x, s.y, { steps: 4 }); await pg.waitForTimeout(250); const t0 = await tick(); await pg.mouse.down({ button: 'right' }); await pg.waitForTimeout(70); await pg.mouse.up({ button: 'right' }); await untilTicks(14); await pg.keyboard.press('KeyE'); await untilTicks(60); const x = await st();
      steps.push({ step: '오른손 → 초록 6을 보내다 E로 취소', key: '우클릭 → E', res: x.h[1].st === 'free' ? '취소됨(손 비어 있음)' : x.h[1].st, t: +((x.t - t0) / 120).toFixed(2), ...snap(x), ev: await events(), perf: await perf1() }); await hand(1, '초록 4'); steps[steps.length - 1].step += ' (취소한 손 복구)'; } }
}
await untilTicks(120); const end = await st(), g = await P(() => __p3.gym()), rec = await P(() => __p3.recStop());
const ok = end.h.every(h => h.st === 'hold' && h.box === '초록 6');
for (const s of steps) say(`  ${s.at.toFixed(2).padStart(6)}초 [${s.key}] ${s.step}: ${s.res}${s.tip ? ' · 미리보기 "' + s.tip + '"' : ''} · 손 ${s.hands.join('/')} · 발 ${s.feet.join('/')} · 몸 ${s.y}m${s.ev.length ? '\n          ' + s.ev.join(' | ') : ''}`);
check(`경로 ${RT}: 초록 6을 두 손으로 잡고 끝남(훈련 구간의 목표 — 정식 완등 기록이 아니다)`, ok, `손 ${end.h.map(h => h.box || '-').join('/')} · 발 ${end.f.map(f => (f.st === 'plant' ? f.box : '-')).join('/')} · 화면 ${JSON.stringify({ course: g.course, phase: g.phase, tryId: g.tryId, done: g.done })}`);
check('훈련 구간의 목표는 코스 완등으로 기록되지 않는다', !g.done && g.rec.tops === 0, JSON.stringify(g.rec));
{ const grp = { '손 보내기': steps.filter(x => /손 →/.test(x.step)), '발 보내기': steps.filter(x => /발 →/.test(x.step)), 'W(몸 올리기)': steps.filter(x => /^W/.test(x.step)) }, avg = (a, k) => (a.reduce((m, x) => m + (x.perf[k] || 0), 0) / Math.max(1, a.length));
  say('실행 성능(단계 종류별 평균, ' + (E.SHADOW === '0' ? '그림자 끔' : '기본 렌더링') + ' · 이 환경은 소프트웨어 그리기): ' + Object.entries(grp).filter(([, a]) => a.length).map(([k, a]) => `${k} ${a.length}번 — ${avg(a, 'fps').toFixed(1)}fps · 게임/실제 ${avg(a, 'ratio').toFixed(2)} · 계산 ${avg(a, 'step').toFixed(2)}ms/걸음 · 그리기 ${avg(a, 'draw').toFixed(0)}ms/프레임 · 가장 긴 프레임 ${Math.max(...a.map(x => x.perf.long || 0)).toFixed(0)}ms`).join(' ‖ ')); }
say(`수동으로 디딘 발이 그 자리에 있지 않게 된 것 ${changed.length}${changed.length ? ':\n   ' + changed.join('\n   ') : ''}`);
say(`거부·풀림: ${steps.flatMap(s => s.ev).filter(e => / reject | deny | slip |\[(assist|cancel|body|physics)\]/.test(e)).join(' | ') || '없음'}`);
check('페이지 오류 없음', !errs.length, errs.join(' / '));
if (E.OUT) fs.writeFileSync(E.OUT, JSON.stringify({ version: ver, build: path.basename(build), sha256: crypto.createHash('sha256').update(fs.readFileSync(build)).digest('hex'), clip, route: RT, source: 'keymouse', recover: E.RECOVER === '1', shadow: E.SHADOW !== '0', opts, startPos: C.startPos, startYaw: C.startYaw, ok, steps, changed, end: { h: end.h, f: end.f }, inputs: rec, log }));
// VIDEO=폴더(p3d-0.15.6, GPT 추가 전달문 6절 "현재 UI가 켜진 실제 시간 영상"): 이 실행의 화면을 실제 시간 그대로 녹화한다(프레임을 강제로 공급하지 않는다 — 이 기계의 그리기 속도가 그대로 찍힌다)
if (E.VIDEO) { const v = pg.video(); await pg.close(); if (v) say('실제 시간 녹화 ' + await v.path()); }
await b.close(); say(`실패 ${fails} · 기록한 계산 걸음 ${rec.length}(${(rec.length / 120).toFixed(1)}초)`); process.exit(fails ? 1 : 0);
