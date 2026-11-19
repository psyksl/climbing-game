// 벽 접촉(W2)을 실제 브라우저에서 확인한다: ① 입력 문맥이 실제 실행에 적용되는지(누른 채 전환·시점 조작·포커스 잃음·키 다시 정하기) ② 실제 마우스·키로 잡기 → 놓기 ③ 미리보기 문구 ④ 화면 빠르기(FPS)에 따라 손 접촉·몸 자리·놓기 결과가 달라지지 않는지.
// 스크립트 입력이며 사람 손이 아니다. 사용: node test/wall_browser.js [결과 JSON] [스크린샷 폴더]   캡처 빌드: BUILD=climb3d_mocap.html MODE=clip
'use strict';
const { chromium } = require('playwright'), path = require('path'), fs = require('fs');
const url = 'file://' + path.join(__dirname, '..', process.env.BUILD || 'climb3d.html') + '?test&noshadow', shots = process.argv[3];
const out = { checks: [], fps: {} }; let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`); out.checks.push({ name, ok, detail }); if (!ok) fail++; };
(async () => {
  if (shots) fs.mkdirSync(shots, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 1280, height: 720 } }), errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(url); await pg.waitForTimeout(1000); await pg.evaluate(m => { __p3.resetKeys(); if (m) __p3.setMode(m); }, process.env.MODE || '');
  const P = f => pg.evaluate(f), wait = ms => pg.waitForTimeout(ms), shot = async n => { if (shots) await pg.screenshot({ path: path.join(shots, n + '.png') }); };
  const at = async p => { const s = await pg.evaluate(p => __p3.screenOf(p), p); await pg.mouse.move(s.x, s.y); await wait(60); };
  const click = async (p, button = 'left') => { await at(p); await pg.mouse.down({ button }); await wait(40); await pg.mouse.up({ button }); };
  const log = () => P(() => __p3.climbLog().map(e => `${e.type}${e.name ? ' ' + e.name : ''}${e.why ? ' · ' + e.why : ''}`));
  const st = () => P(() => ({ c: __p3.climb(), i: __p3.input(), b: __p3.body() }));
  const A = { L: [-1.1, 1.9, -2.84], R: [-0.7, 1.9, -2.84] };
  // 실제 시간으로 도는 화면이라(소프트웨어 그리기는 느리다) 정해진 시간만 기다리지 않고 조건이 될 때까지 본다
  const until = async (f, ms = 5000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pg.evaluate(f)) return true; await wait(50); } return false; };
  const handIs = (i, v) => until(new Function(`return __p3.climb().hands[${i}].st === '${v}'`));

  // ── ① 문맥 ──
  await P(() => { __p3.wallStart(); __p3.setCam({ yaw: 0, pitch: 0.12, dist: 3.6 }); }); await wait(500);
  await pg.keyboard.down('KeyW'); await wait(150);
  { const s = await st(); check('지상 문맥: W = 앞으로(이동 입력이 들어간다)', s.i.mode === 'ground' && Math.hypot(s.i.read.mx, s.i.read.mz) > 0.9 && s.i.read.cy === 0, `문맥 ${s.i.mode} · 이동 ${Math.hypot(s.i.read.mx, s.i.read.mz).toFixed(2)} · 몸 위로 ${s.i.read.cy}`); }
  await until(() => __p3.body().pos[2] < -2.72 && Math.hypot(__p3.body().vel[0], __p3.body().vel[2]) < 0.05); await click(A.L); await handIs(0, 'hold'); await wait(100);
  { const s = await st(); check('W를 누른 채 손이 턱을 잡아 벽 문맥이 되면: 그 W는 "몸 위로"가 되지 않고 이동도 멈춘다(다시 눌러야 한다)', s.i.mode === 'wall' && s.c.hands[0].st === 'hold' && s.i.read.cy === 0 && s.i.read.mx === 0 && s.i.read.mz === 0 && s.i.down.includes('KeyW'), `문맥 ${s.i.mode} · W 눌림 ${s.i.down.includes('KeyW')} · 몸 위로 ${s.i.read.cy} · 이동 ${s.i.read.mx},${s.i.read.mz}`); }
  await pg.keyboard.up('KeyW'); await wait(60); await pg.keyboard.down('KeyW'); await wait(60);
  { const s = await st(); check('W를 뗐다가 다시 누르면 "몸 위로"', s.i.read.cy === 1, `몸 위로 ${s.i.read.cy}`); }
  await pg.keyboard.up('KeyW');
  // 시점 조작 중에는 손발 명령이 새지 않는다
  { const tries = async () => (await log()).filter(x => /^try/.test(x)).length, n0 = await tries(); await pg.keyboard.down('AltLeft'); await at(A.R); await pg.mouse.down({ button: 'right' }); await wait(80);
    await wait(120); const s1 = await st(), yaw0 = (await P(() => __p3.cam())).yaw; await pg.mouse.move(700, 300); await pg.mouse.move(760, 320); await wait(80); const yaw1 = (await P(() => __p3.cam())).yaw;
    await pg.keyboard.up('AltLeft'); await wait(120); const n1 = await tries(), s2 = await st(); await pg.mouse.up({ button: 'right' }); await wait(60);
    check('시점 조작(Alt) 중의 클릭은 손 명령이 되지 않는다. Alt만 먼저 떼어도 그 클릭은 명령이 되지 않는다. 잡고 있던 손은 그대로', n1 === n0 && s2.c.hands[0].st === 'hold' && s2.c.hands[1].st === 'free' && s1.i.cam && Math.abs(yaw1 - yaw0) > 0.05, `손발 시도 ${n0} → ${n1}번 · 왼손 ${s2.c.hands[0].st} · 오른손 ${s2.c.hands[1].st} · 시점 ${yaw0.toFixed(2)} → ${yaw1.toFixed(2)}`); }
  await P(() => __p3.setCam({ yaw: 0.25, pitch: 0.12, dist: 3.6 })); await wait(300);
  await click(A.R, 'right'); await handIs(1, 'hold');
  { const s = await st(); check('시점 조작을 끝낸 뒤의 우클릭은 오른손 명령이 된다', s.c.hands[1].st === 'hold', `오른손 ${s.c.hands[1].st}`); await shot('1_두손_잡음'); }
  // 포커스 잃음
  await pg.keyboard.down('KeyW'); await wait(80); const cyBefore = (await st()).i.read.cy;
  await P(() => window.dispatchEvent(new Event('blur'))); await wait(80);
  { const s = await st(); check('포커스를 잃으면 눌린 키가 모두 풀린다(몸 위로 멈춤). 잡은 손은 그대로', cyBefore === 1 && s.i.read.cy === 0 && s.i.down.length === 0 && s.c.hands.every(h => h.st === 'hold'), `전 ${cyBefore} → 후 ${s.i.read.cy} · 눌린 키 ${s.i.down.length}개 · 손 ${s.c.hands.map(h => h.st).join(', ')}`); }
  await pg.keyboard.up('KeyW');
  // 키 다시 정하기
  await P(() => __p3.setKeys('relL', ['KeyF'])); await pg.keyboard.down('KeyQ'); await wait(150); await pg.keyboard.up('KeyQ'); await wait(150); const afterQ = (await st()).c.hands[0].st; await pg.keyboard.down('KeyF'); await wait(150); await pg.keyboard.up('KeyF'); await handIs(0, 'free');
  { const s = await st(), cf = await P(() => __p3.conflicts().length), stored = await P(() => localStorage.getItem('p3dBind_v1')); check('키 다시 정하기: 왼손 놓기를 F로 바꾸면 Q는 듣지 않고 F가 듣는다(저장됨, 겹침 없음)', afterQ === 'hold' && s.c.hands[0].st === 'free' && cf === 0 && /KeyF/.test(stored || ''), `Q 뒤 ${afterQ} · F 뒤 ${s.c.hands[0].st} · 겹침 ${cf}`); }
  await P(() => __p3.resetKeys());
  { const c = await P(() => __p3.conflicts()); check('기본 입력 표에 겹친 키가 없다(문맥이 겹치는 것끼리)', c.length === 0, JSON.stringify(c)); }

  // ── ② 실제 마우스·키로: 다시 잡기 → 당겨 오르기 → 한 손 놓기 → 다시 잡기 → 두 손 놓기 ──
  await click(A.L); await handIs(0, 'hold');
  await pg.keyboard.down('KeyW'); await until(() => __p3.body().pos[1] > 0.2, 9000); await pg.keyboard.up('KeyW'); await wait(300); await shot('2_당겨_오름');
  { const s = await st(); check('W로 당겨 오른다(두 손, 발은 떠 있음)', s.c.hands.every(h => h.st === 'hold') && s.b.pos[1] > 0.15 && s.c.feet.every(f => f.st !== 'plant'), `몸 높이 +${(s.b.pos[1] * 100).toFixed(0)}cm`); }
  await pg.keyboard.down('KeyE'); await wait(150); await pg.keyboard.up('KeyE'); await handIs(1, 'free'); await wait(1500); await shot('3_한손');
  { const s = await st(); check('E = 오른손 놓기: 왼손으로 남는다', s.c.hands[0].st === 'hold' && s.c.hands[1].st === 'free' && s.i.mode === 'wall'); }
  // 미리보기: 닿지 않는 턱 C와 닿는 턱 A
  const FAR = [0.3, 2.30, -2.86], farS = await pg.evaluate(p => __p3.screenOf(p), FAR);
  // 시점이 몸을 따라 움직이므로 멈춘 뒤에 겨눈다(겨눈 화면 자리가 그사이 다른 곳이 되지 않게)
  await wait(1500); await at(FAR); await wait(300); await at(FAR); await wait(200); const pvFar = (await P(() => __p3.tagsText()))[4], aimFar = await P(() => __p3.aim()); await shot('4_미리보기_먼_턱');
  // 가까운 턱: 몸이 흔들리는 중이라 닿을 때도 안 닿을 때도 있다 → 같은 순간의 판정 결과와 화면 문구가 같은지를 본다
  await at(A.R); await wait(300); await at(A.R); await wait(200);
  const near = await P(() => { const a = __p3.aim(); return { text: __p3.tagsText()[4], pr: a ? [0, 1].map(i => __p3.probe('hand', i, a)) : null }; }), pvNear = near.text;
  const nearOk = !!near.pr && near.pr.every((x, i) => pvNear.includes(`${i ? '오른손' : '왼손'} ${x.ok ? '닿음' : x.why}`));
  check('미리보기: 먼 턱(턱 B)은 두 손 모두 "닿지 않음(모자란 거리)", 가까운 턱은 손마다 그 순간의 판정 결과와 같은 문구가 보인다', farS.y > 5 && farS.y < 715 && /턱 B/.test(pvFar) && (pvFar.match(/닿지 않음\(\d+cm 모자람\)/g) || []).length === 2 && /턱 A/.test(pvNear) && nearOk, `먼 턱(겨눈 점 ${aimFar ? aimFar.map(v => v.toFixed(2)).join(',') : '없음'}): ${pvFar.replace(/\n/g, ' / ')} ‖ 가까운 턱: ${pvNear.replace(/\n/g, ' / ')}`);
  await click(A.R, 'right'); await handIs(1, 'hold');
  { const s = await st(); check('우클릭으로 오른손을 다시 잡는다', s.c.hands.every(h => h.st === 'hold')); }
  await pg.keyboard.down('KeyQ'); await pg.keyboard.down('KeyE'); await wait(150); await pg.keyboard.up('KeyQ'); await pg.keyboard.up('KeyE'); await wait(150); await shot('5_떨어지는_중'); await until(() => __p3.body().onGround && !__p3.climb().on); await wait(300);
  { const s = await st(), l = await log(); check('Q+E = 두 손 놓기: 떨어져 지상 문맥으로 돌아온다', s.i.mode === 'ground' && !s.c.on && s.b.onGround, l.slice(-4).join(' → ')); await shot('6_내려섬'); }
  out.log = await log(); out.stats = (await st()).c.stats;
  check('실제 입력으로 하는 동안 잡은 손바닥 오차 2mm 안, 지형 관통 0', out.stats.palmErr < 0.002 && out.stats.pen === 0, `손바닥 ${(out.stats.palmErr * 1000).toFixed(2)}mm · 관통 ${out.stats.pen}${out.stats.pen ? '(' + out.stats.penWhat + ')' : ''}`);

  // ── ④ 화면 빠르기별 비교: 뛰어 잡기 → 매달림 → 한 손 놓기 → 다시 잡기 → 두 손 놓기 → 착지 ──
  await P(() => __p3.pause(true));
  const N = 1500, inputs = [], B = { L: [0.5, 2.32, -2.86], R: [0.9, 2.32, -2.86] };
  for (let k = 0; k < N; k++) inputs.push({ mx: 0, mz: 0, jump: k >= 30 && k < 102, cx: k >= 420 && k < 470 ? 1 : 0, cy: 0, cmd: k === 102 ? [{ type: 'hand', i: 0, p: B.L }, { type: 'hand', i: 1, p: B.R }] : k === 600 ? [{ type: 'release', limb: 'hand', i: 1 }] : k === 900 ? [{ type: 'hand', i: 1, p: B.R }] : k === 1200 ? [{ type: 'release', limb: 'hand', i: 0 }, { type: 'release', limb: 'hand', i: 1 }] : [] });
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const sched = { '120': Array(N + 10).fill(1 / 120), '60': Array(N).fill(1 / 60), '30': Array(N).fill(1 / 30), '144': Array(N + 400).fill(1 / 144), '들쭉날쭉': Array.from({ length: N }, () => 0.007 + rnd() * 0.038) }, runs = {};
  for (const [k, d] of Object.entries(sched)) runs[k] = await pg.evaluate(([d, inp]) => { __p3.reset({ pos: [0.7, 0, -2.65], yaw: Math.PI }); const r = __p3.simFrames(d, inp, 4); return { r, log: __p3.climbLog().map(e => `${e.k} ${e.type} ${e.name} ${e.why}`), end: __p3.body() }; }, [d, inputs]);
  const ref = runs['120'], grabbed = ref.log.filter(x => / grab /.test(x)).length, exited = ref.log.some(x => / exit /.test(x));
  check('비교에 쓴 입력에서 실제로 잡기 3번·놓기·떨어짐이 일어난다(빈 비교가 아님)', grabbed === 3 && exited && ref.end.onGround, ref.log.filter(x => !/ try /.test(x)).join(' | ').slice(0, 300));
  for (const [k, a] of Object.entries(runs)) { if (k === '120') continue;
    const byK = new Map(a.r.map(s => [s.k, s])); let maxBone = 0, maxPos = 0, maxVel = 0, stMis = 0, n = 0;
    for (const r of ref.r) { const s = byK.get(r.k); if (!s) continue; n++; maxPos = Math.max(maxPos, Math.hypot(...s.pos.map((x, i) => x - r.pos[i]))); maxVel = Math.max(maxVel, Math.hypot(...s.vel.map((x, i) => x - r.vel[i]))); s.bones.forEach((p, j) => { maxBone = Math.max(maxBone, Math.hypot(...p.map((x, i) => x - r.bones[j][i]))); }); if (s.climb !== r.climb) stMis++; }
    const sameLog = a.log.join('|') === ref.log.join('|'), ok = n > 300 && maxBone < 1e-9 && maxPos < 1e-9 && maxVel < 1e-9 && stMis === 0 && sameLog; if (!ok) fail++;
    out.fps[k] = { 견준_시각: n, 뼈_최대차이_m: maxBone, 몸_최대차이_m: maxPos, 속도_최대차이: maxVel, 손발_상태가_다른_시각: stMis, 기록이_같음: sameLog };
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${k}fps: 같은 계산 시각 ${n}곳 · 뼈 ${maxBone.toExponential(1)}m · 몸 ${maxPos.toExponential(1)}m · 속도 ${maxVel.toExponential(1)} · 손발 상태(잡은 자리·하중 포함)가 다른 시각 ${stMis} · 잡기·놓기 기록 ${sameLog ? '같음' : '다름'}`); }
  check('페이지 오류 없음', errs.length === 0, errs.join(' | '));
  if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
  console.log(`실패 ${fail}`); await b.close(); process.exit(fail ? 1 : 0);
})();
