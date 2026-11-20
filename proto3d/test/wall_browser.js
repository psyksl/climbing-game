// 벽 조작을 실제 브라우저에서 확인한다(p3d-0.6.0): ① 입력 문맥(누른 채 전환·시점 보기 모드·우클릭 끌기와 짧게 누르기·Alt를 쓰지 않음·포커스 잃음·키 다시 정하기)
// ② 실제 마우스·키로 잡기 → 놓기 ③ 손 조작 2번(누르는 동안 뻗기) ④ 화면(점프 중 멈춤·겨눈 자리 고정·미리보기) ⑤ 화면 빠르기(FPS)에 따라 결과가 달라지지 않는지.
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
  await pg.goto(url); await pg.waitForTimeout(1000);
  // 기준 설정으로 고정: 손 조작 1번(눌러 보내기), 발 보조 끔. 보조·2번은 아래에서 따로 켠다
  await pg.evaluate(m => { __p3.resetKeys(); __p3.opt({ handMode: 1, footAssist: false, diag: true, helpAll: false }); if (m) __p3.setMode(m); }, process.env.MODE || '');
  const P = f => pg.evaluate(f), wait = ms => pg.waitForTimeout(ms), shot = async n => { if (shots) await pg.screenshot({ path: path.join(shots, n + '.png') }); };
  const scr = p => pg.evaluate(p => __p3.screenOf(p), p);
  const at = async p => { const s = await scr(p); if (!(s.x > 2 && s.x < 1278 && s.y > 2 && s.y < 718)) throw new Error('겨눌 점이 화면 밖: ' + JSON.stringify(p)); await pg.mouse.move(s.x, s.y); await wait(60); return s; };
  const click = async (p, button = 'left') => { await at(p); await pg.mouse.down({ button }); await wait(40); await pg.mouse.up({ button }); };
  const log = () => P(() => __p3.climbLog().map(e => `${e.type}${e.name ? ' ' + e.name : ''}${e.why ? ' · ' + e.why : ''}`));
  const tries = async () => (await log()).filter(x => /^try/.test(x)).length;
  const st = () => P(() => ({ c: __p3.climb(), i: __p3.input(), b: __p3.body(), cam: __p3.cam() }));
  const A = { L: [-1.1, 1.9, -2.84], R: [-0.7, 1.9, -2.84] };
  // 실제 시간으로 도는 화면이라(소프트웨어 그리기는 느리다) 정해진 시간만 기다리지 않고 조건이 될 때까지 본다
  const until = async (f, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pg.evaluate(f)) return true; await wait(50); } return false; };
  const handIs = (i, v) => until(new Function(`return __p3.climb().hands[${i}].st === '${v}'`));
  const still = () => until(() => Math.hypot(...__p3.body().vel) < 0.05);
  const key = async (k, ms = 150) => { await pg.keyboard.down(k); await wait(ms); await pg.keyboard.up(k); };
  const wallStart = async () => { await P(() => { __p3.setView(false); __p3.wallStart(); __p3.setCam({ yaw: 0, pitch: 0.12, dist: 3.6 }); }); await wait(500); };

  // ── ① 문맥 ──
  { const alt = await P(() => __p3.BIND.filter(b => b.keys.some(k => /^Alt/.test(k))).map(b => b.id)); check('Alt를 쓰는 동작이 없다(브라우저 메뉴로 넘어가던 문제)', alt.length === 0, alt.join(',')); }
  await wallStart();
  // 지상: 우클릭 끌기 = 시점, 손 명령 아님
  { const n0 = await tries(), y0 = (await st()).cam.yaw; await pg.mouse.move(640, 360); await pg.mouse.down({ button: 'right' }); await pg.mouse.move(700, 370, { steps: 6 }); await pg.mouse.move(760, 380, { steps: 6 }); await wait(120); const y1 = (await st()).cam.yaw; await pg.mouse.up({ button: 'right' }); await wait(120);
    check('지상: 우클릭을 누른 채 끌면 시점이 돌고, 떼어도 오른손 명령이 되지 않는다', Math.abs(y1 - y0) > 0.2 && (await tries()) === n0, `시점 ${y0.toFixed(2)} → ${y1.toFixed(2)} · 손 시도 ${n0} → ${await tries()}`); }
  await P(() => __p3.setCam({ yaw: 0, pitch: 0.12, dist: 3.6 })); await wait(300);
  // Alt는 아무 일도 하지 않는다
  { const y0 = (await st()).cam.yaw; await pg.keyboard.down('AltLeft'); await pg.mouse.move(500, 300); await pg.mouse.move(620, 330, { steps: 5 }); await wait(100); await pg.keyboard.up('AltLeft'); const y1 = (await st()).cam.yaw; check('Alt를 누른 채 마우스를 움직여도 시점이 돌지 않는다', Math.abs(y1 - y0) < 1e-6, `시점 ${y0.toFixed(3)} → ${y1.toFixed(3)}`); }
  await pg.keyboard.down('KeyW'); await wait(150);
  { const s = await st(); check('지상 문맥: W = 앞으로(이동 입력이 들어간다)', s.i.mode === 'ground' && Math.hypot(s.i.read.mx, s.i.read.mz) > 0.9 && s.i.read.cy === 0, `문맥 ${s.i.mode} · 이동 ${Math.hypot(s.i.read.mx, s.i.read.mz).toFixed(2)}`); }
  await until(() => __p3.body().pos[2] < -2.72 && Math.hypot(__p3.body().vel[0], __p3.body().vel[2]) < 0.05); await click(A.L); await handIs(0, 'hold'); await wait(100);
  { const s = await st(); check('W를 누른 채 손이 턱을 잡아 벽 문맥이 되면: 그 W는 "몸 위로"가 되지 않고 이동도 멈춘다(다시 눌러야 한다)', s.i.mode === 'wall' && s.c.hands[0].st === 'hold' && s.i.read.cy === 0 && s.i.read.mx === 0 && s.i.read.mz === 0 && s.i.down.includes('KeyW'), `문맥 ${s.i.mode} · 몸 위로 ${s.i.read.cy}`); }
  await pg.keyboard.up('KeyW'); await wait(60); await pg.keyboard.down('KeyW'); await wait(60);
  { const s = await st(); check('W를 뗐다가 다시 누르면 "몸 위로"', s.i.read.cy === 1); } await pg.keyboard.up('KeyW');
  // 벽: 우클릭은 누르는 순간 오른손
  await click(A.R, 'right'); await handIs(1, 'hold');
  { const s = await st(); check('벽 문맥: 우클릭 = 오른손(누르는 순간)', s.c.hands[1].st === 'hold'); await shot('1_두손_잡음'); }
  // 시점 보기 모드: 조작이 모두 멈추고 우클릭 끌기로 시점만 돈다
  await key('KeyV', 80); await wait(100);
  { const n0 = await tries(), s0 = await st(); await pg.keyboard.down('Space'); await pg.keyboard.down('KeyQ'); await pg.keyboard.down('KeyW'); await wait(150); const mid = await st(); await pg.keyboard.up('Space'); await pg.keyboard.up('KeyQ'); await pg.keyboard.up('KeyW');
    await click([-0.2, 1.9, -2.84]); await pg.mouse.move(600, 360); await pg.mouse.down({ button: 'right' }); await pg.mouse.move(680, 380, { steps: 6 }); await pg.mouse.move(760, 400, { steps: 6 }); await wait(120); const s1 = await st(); await pg.mouse.up({ button: 'right' }); await wait(100);
    check('시점 보기 모드(V): 놓기·몸 옮기기·점프·손 보내기가 모두 듣지 않고, 우클릭 끌기로 시점만 돈다. 잡은 손은 그대로', s0.i.mode === 'view' && mid.i.read.cy === 0 && !mid.i.read.jump && s1.c.hands.every(h => h.st === 'hold') && (await tries()) === n0 && Math.abs(s1.cam.yaw - s0.cam.yaw) > 0.2, `문맥 ${s0.i.mode} · 몸 위로 ${mid.i.read.cy} · 손 ${s1.c.hands.map(h => h.st).join(', ')} · 손 시도 ${n0} → ${await tries()} · 시점 ${s0.cam.yaw.toFixed(2)} → ${s1.cam.yaw.toFixed(2)}`); await shot('2_시점_보기_모드'); }
  // 반대편에서 보면 "몸 오른쪽"이 화면의 오른쪽이 되도록 부호가 바뀐다
  { await P(() => __p3.setCam({ yaw: Math.PI, pitch: 0.2, dist: 3.6 })); await wait(300); const s = await st(); check('시점을 반대편으로 돌리면 몸 좌우 입력의 기준이 뒤집힌다(화면에서 보이는 쪽). 시점을 돌린 것만으로 잡은 손·몸은 움직이지 않는다', s.i.cxSign === -1 && s.c.hands.every(h => h.st === 'hold'), `cxSign ${s.i.cxSign}`); }
  await P(() => __p3.setCam({ yaw: 0, pitch: 0.12, dist: 3.6 })); await key('KeyV', 80); await wait(300);
  { const s = await st(); check('V를 다시 누르면 벽 문맥으로 돌아온다', s.i.mode === 'wall' && s.i.cxSign === 1, `문맥 ${s.i.mode}`); }
  // 포커스 잃음
  await pg.keyboard.down('KeyW'); await wait(80); const cyBefore = (await st()).i.read.cy;
  await P(() => window.dispatchEvent(new Event('blur'))); await wait(80);
  { const s = await st(); check('포커스를 잃으면 눌린 키가 모두 풀린다(몸 위로 멈춤). 잡은 손은 그대로', cyBefore === 1 && s.i.read.cy === 0 && s.i.down.length === 0 && s.c.hands.every(h => h.st === 'hold'), `전 ${cyBefore} → 후 ${s.i.read.cy} · 눌린 키 ${s.i.down.length}개`); }
  await pg.keyboard.up('KeyW');
  // 키 다시 정하기
  await P(() => __p3.setKeys('relL', ['KeyZ'])); await key('KeyQ'); await wait(150); const afterQ = (await st()).c.hands[0].st; await key('KeyZ'); await handIs(0, 'free');
  { const s = await st(), cf = await P(() => __p3.conflicts().length), stored = await P(() => localStorage.getItem('p3dBind_v2')); check('키 다시 정하기: 왼손 놓기를 Z로 바꾸면 Q는 듣지 않고 Z가 듣는다(저장됨, 겹침 없음)', afterQ === 'hold' && s.c.hands[0].st === 'free' && cf === 0 && /KeyZ/.test(stored || ''), `Q 뒤 ${afterQ} · Z 뒤 ${s.c.hands[0].st} · 겹침 ${cf}`); }
  await P(() => __p3.resetKeys());
  { const c = await P(() => __p3.conflicts()); check('기본 입력 표에 겹친 키가 없다(문맥이 겹치는 것끼리. 끌기와 누르기는 같은 단추를 나눠 쓴다)', c.length === 0, JSON.stringify(c)); }

  // ── ② 실제 마우스·키로: 다시 잡기 → 당겨 오르기 → 한 손 놓기 → 잘못 누르기 → 다시 잡기 → 두 손 놓기 ──
  await click(A.L); await handIs(0, 'hold');
  await pg.keyboard.down('KeyW'); await until(() => __p3.body().pos[1] > 0.2, 9000); await pg.keyboard.up('KeyW'); await wait(300); await shot('3_당겨_오름');
  { const s = await st(); check('W로 당겨 오른다(두 손, 발은 떠 있음)', s.c.hands.every(h => h.st === 'hold') && s.b.pos[1] > 0.15 && s.c.feet.every(f => f.st !== 'plant'), `몸 높이 +${(s.b.pos[1] * 100).toFixed(0)}cm`); }
  await key('KeyE'); await handIs(1, 'free'); await wait(1500); await shot('4_한손');
  { const s = await st(); check('E = 오른손 놓기: 왼손으로 남는다', s.c.hands[0].st === 'hold' && s.c.hands[1].st === 'free' && s.i.mode === 'wall'); }
  // 잡고 있는 왼손으로 턱이 아닌 벽면을 누른다 → 거부, 계속 잡고 있다(실제 클릭으로)
  { const n0 = (await log()).length; await click([-1.1, 1.45, -3.0]); await wait(400); const s = await st(), l = (await log()).slice(n0); check('잡고 있는 손으로 턱이 아닌 곳을 클릭: 거부만 하고 계속 매달려 있다', s.c.hands[0].st === 'hold' && s.i.mode === 'wall' && l.some(x => /^reject/.test(x)) && !l.some(x => /^release|^exit/.test(x)), l.join(' → ')); }
  // 미리보기
  const FAR = [0.3, 2.30, -2.86];
  await still(); await wait(800); await at(FAR); await wait(300); await at(FAR); await wait(200); const pvFar = (await P(() => __p3.tagsText()))[4], aimFar = await P(() => __p3.aim()); await shot('5_미리보기_먼_턱');
  await at(A.R); await wait(300); await at(A.R); await wait(200);
  const near = await P(() => { const a = __p3.aim(); return { text: __p3.tagsText()[4], pr: a ? [0, 1].map(i => __p3.probe('hand', i, a)) : null }; }), pvNear = near.text;
  const said = x => (x.ok ? '닿음' : /닿지 않음/.test(x.why) ? '조금 더 가까이' : x.why), nearOk = !!near.pr && near.pr.every((x, i) => pvNear.includes(`${i ? '오른손' : '왼손'} ${said(x)}`));
  check('미리보기: 먼 턱(턱 B)은 두 손 모두 닿지 않는다고, 가까운 턱은 손마다 그 순간의 판정 결과와 같은 문구로 보인다', /턱 B/.test(pvFar) && (pvFar.match(/조금 더 가까이/g) || []).length === 2 && /턱 A/.test(pvNear) && nearOk, `먼 턱(겨눈 점 ${aimFar ? aimFar.map(v => v.toFixed(2)).join(',') : '없음'}): ${pvFar.replace(/\n/g, ' / ')} ‖ 가까운 턱: ${pvNear.replace(/\n/g, ' / ')}`);
  await click(A.R, 'right'); await handIs(1, 'hold');
  { const s = await st(); check('우클릭으로 오른손을 다시 잡는다', s.c.hands.every(h => h.st === 'hold')); }
  // 겨눈 자리 고정: 마우스를 움직이지 않으면 화면이 저절로 움직여도 겨눈 자리는 그대로다
  { await at(A.R); await wait(200); const a0 = await P(() => __p3.aim()); await P(() => __p3.setCam({ yaw: 0.35, pitch: 0.2, dist: 3.9 })); await wait(300); const a1 = await P(() => __p3.aim()); await pg.mouse.move(400, 400); await wait(150); const a2 = await P(() => __p3.aim());
    check('겨눈 자리 고정: 마우스가 가만히 있으면 화면이 움직여도 겨눈 자리(벽의 그 점)가 그대로이고, 마우스를 움직이면 그 자리로 새로 겨눈다', !!a0 && !!a1 && Math.hypot(...a0.map((v, i) => v - a1[i])) < 1e-6 && (!a2 || Math.hypot(...a0.map((v, i) => v - a2[i])) > 0.1), `전 ${a0 && a0.map(v => v.toFixed(2))} · 화면이 움직인 뒤 ${a1 && a1.map(v => v.toFixed(2))} · 마우스를 옮긴 뒤 ${a2 && a2.map(v => v.toFixed(2))}`); await P(() => __p3.setCam({ yaw: 0, pitch: 0.12, dist: 3.6 })); await wait(200); }
  await pg.keyboard.down('KeyQ'); await pg.keyboard.down('KeyE'); await wait(150); await pg.keyboard.up('KeyQ'); await pg.keyboard.up('KeyE'); await wait(150); await shot('6_떨어지는_중'); await until(() => __p3.body().onGround && !__p3.climb().on); await wait(300);
  { const s = await st(), l = await log(); check('Q+E = 두 손 놓기: 떨어져 지상 문맥으로 돌아온다', s.i.mode === 'ground' && !s.c.on && s.b.onGround, l.slice(-4).join(' → ')); }
  out.log = await log(); out.stats = (await st()).c.stats;
  check('실제 입력으로 하는 동안 잡은 손바닥 오차 2mm 안, 지형 관통 0', out.stats.palmErr < 0.002 && out.stats.pen === 0, `손바닥 ${(out.stats.palmErr * 1000).toFixed(2)}mm · 관통 ${out.stats.pen}${out.stats.pen ? '(' + out.stats.penWhat + ')' : ''}`);

  // 지상: 우클릭을 짧게 누르면 오른손
  await wallStart(); await pg.keyboard.down('KeyW'); await until(() => __p3.body().pos[2] < -2.72 && Math.hypot(__p3.body().vel[0], __p3.body().vel[2]) < 0.05); await pg.keyboard.up('KeyW');
  await click(A.R, 'right'); await handIs(1, 'hold'); await until(() => __p3.input().mode === 'wall', 2000);
  { const s = await st(); check('지상: 우클릭을 짧게 눌렀다 떼면 오른손을 보낸다', s.c.hands[1].st === 'hold' && s.i.mode === 'wall', `오른손 ${s.c.hands[1].st}`); }

  // ── ③ 손 조작 2번: 누르는 동안 뻗고, 떼면 잡는다 ──
  await P(() => __p3.opt({ handMode: 2 }));
  { await at(A.L); await pg.mouse.down({ button: 'left' }); await until(() => __p3.climb().hands[0].st === 'reach', 2000); await wait(900); const mid = await st(); await shot('7_누르는_동안_뻗기'); await pg.mouse.up({ button: 'left' }); const ok = await handIs(0, 'hold');
    check('손 조작 2번: 왼쪽 단추를 누르고 있는 동안 왼손이 겨눈 턱으로 뻗어 있고(아직 잡지 않음), 떼면 잡는다', mid.c.hands[0].st === 'reach' && ok, `누르는 중 ${mid.c.hands[0].st} → 뗀 뒤 ${(await st()).c.hands[0].st}`); }
  { const n0 = (await log()).length; await at([-1.1, 1.45, -3.0]); await pg.mouse.down({ button: 'left' }); await wait(500); const mid = await st(); await pg.mouse.up({ button: 'left' }); await wait(300); const s = await st(), l = (await log()).slice(n0);
    check('손 조작 2번: 잡고 있던 손으로 누르면 그 손을 놓고 뻗는다(의도적인 놓기). 턱이 아닌 곳에서 떼면 헛손질이고 다른 손은 그대로', mid.c.hands[0].st === 'reach' && s.c.hands[0].st === 'free' && s.c.hands[1].st === 'hold' && l.some(x => /뻗으려고 놓음/.test(x)) && l.some(x => /헛손질/.test(x)), l.filter(x => !/^try/.test(x)).join(' → ')); }
  await P(() => __p3.opt({ handMode: 1 }));
  await key('KeyE'); await until(() => __p3.body().onGround && !__p3.climb().on); await wait(300);

  // ── ④ 화면: 뛰어오른 동안 화면을 멈춰 둔다 ──
  await wallStart(); await P(() => __p3.setCam({ yaw: 0, pitch: 0.12, dist: 3.6 })); await pg.keyboard.down('KeyS'); await wait(700); await pg.keyboard.up('KeyS'); await still(); await wait(1200);
  { const t0 = (await st()).cam.target; await pg.keyboard.down('Space'); await until(() => !__p3.body().onGround, 2000); let maxD = 0, peak = 0; for (let i = 0; i < 12; i++) { const s = await st(); if (s.b.onGround) break; maxD = Math.max(maxD, Math.hypot(...s.cam.target.map((v, k) => v - t0[k]))); peak = Math.max(peak, s.b.pos[1]); await wait(40); } await pg.keyboard.up('Space'); await until(() => __p3.body().onGround); await wait(1500); const t1 = (await st()).cam.target;
    check('점프: 누르면 바로 뜨고(0.4m 넘게), 떠 있는 동안 화면은 움직이지 않는다(따라가는 점이 2cm 안)', peak > 0.4 && maxD < 0.02, `가장 높이 +${(peak * 100).toFixed(0)}cm · 떠 있는 동안 화면의 움직임 ${(maxD * 100).toFixed(1)}cm · 내려선 뒤 ${(Math.hypot(...t1.map((v, k) => v - t0[k])) * 100).toFixed(1)}cm`); }

  // ── ⑤ 화면 빠르기별 비교: 뛰어 잡기 → 매달림 → 한 손 놓기 → 다시 잡기 → 두 손 놓기 → 착지 ──
  await P(() => __p3.pause(true));
  const N = 1500, inputs = [], B = { L: [0.5, 2.32, -2.86], R: [0.9, 2.32, -2.86] };
  for (let k = 0; k < N; k++) inputs.push({ mx: 0, mz: 0, jump: k >= 30 && k < 90, cx: k >= 420 && k < 470 ? 1 : 0, cy: 0, cmd: k === 30 ? [{ type: 'hand', i: 0, p: B.L }, { type: 'hand', i: 1, p: B.R }] : k === 600 ? [{ type: 'release', limb: 'hand', i: 1 }] : k === 900 ? [{ type: 'hand', i: 1, p: B.R }] : k === 1200 ? [{ type: 'release', limb: 'hand', i: 0 }, { type: 'release', limb: 'hand', i: 1 }] : [] });
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
})().catch(e => { console.log('FAIL  시험이 중간에 멈춤: ' + e.message); process.exit(1); });
