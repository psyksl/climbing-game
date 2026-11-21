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
  await pg.evaluate(m => { __p3.resetKeys(); __p3.opt({ handMode: 1, footAssist: false, wallRest: false, diag: true, helpAll: false }); if (m) __p3.setMode(m); }, process.env.MODE || '');
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
  { // 단추 이름표(임시 모양, p3d-0.8.4): 커서 옆 미리보기에 그 단추가 지금 보내는 손발이 단추 이름과 함께 나오고, 발 선택을 누르고 있으면 왼손·오른손 → 왼발·오른발로 바뀐다
    await at([-0.9, 1.92, -2.84]); await wait(350); const t1 = ((await P(() => __p3.tagsText()))[4] || '').replace(/\s+/g, ' ');
    await pg.keyboard.down('ShiftLeft'); await at([-0.9, 1.92, -2.84]); await wait(350); const t2 = ((await P(() => __p3.tagsText()))[4] || '').replace(/\s+/g, ' '); await pg.keyboard.up('ShiftLeft'); await wait(150);
    check('단추 이름표(임시): 미리보기에 "좌클릭 … 왼손 / 우클릭 … 오른손"이 나오고, 발 선택을 누르면 같은 단추가 "왼발 / 오른발"로 바뀐다', /좌클릭.*왼손.*우클릭.*오른손/.test(t1) && /좌클릭.*왼발.*우클릭.*오른발/.test(t2) && !/왼손|오른손/.test(t2), `손: ${t1.slice(0, 70)} ‖ 발 선택: ${t2.slice(0, 70)}`); }
  { await wait(300); const t = (await P(() => __p3.tagsText())).join(' | '); { const m = /잡음 당김 ([0-9.]+) · 편 팔 버팀 [0-9.]+ · 고른 값 ([0-9.]+) · 당김 한계 (0\.65)/.exec(t.replace(/\s+/g, ' ')); check('진단 표시(임시): 잡은 손의 이름표에 당기는 힘·편 팔로 버티는 몫·고른 값·당김 한계가 따로 나온다(모두 몸무게의 배수). 당기는 힘은 한계를 넘지 않는다', !!m && +m[1] <= +m[3] + 0.005, t.replace(/\s+/g, ' ').slice(0, 130)); } }
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
  { // 벽 딛기 실험을 켠 설정(손 조작 1 · 발 보조 켬 · 벽 딛기 켬. 기본값은 끔)으로 실제 키·마우스: 뛰어 턱 B를 두 손으로 잡으면 발이 벽을 디디고, Space로 뛰어 오르고, 왼발 떼기 키를 누르면 그 발은 다시 대지 않는다
    await P(() => __p3.opt({ handMode: 1, footAssist: true, wallRest: true })); await P(() => { __p3.setView(false); __p3.reset({ pos: [0.7, 0, -2.65], yaw: Math.PI }); __p3.setCam({ yaw: 0, pitch: 0.12, dist: 3.6 }); }); await wait(400);
    // (뛰는 0.5초 안에 마우스를 두 번 옮겨 누르면 화면이 느릴 때 놓친다 → 뛰어 왼손으로 잡은 다음, 매달린 채 오른손을 보낸다)
    const Bp = { L: [0.5, 2.3, -2.86], R: [0.9, 2.3, -2.86] }; await at(Bp.L); await pg.keyboard.down('Space'); await until(() => !__p3.body().onGround, 2000); await pg.mouse.down({ button: 'left' }); await wait(30); await pg.mouse.up({ button: 'left' });
    await handIs(0, 'hold'); await pg.keyboard.up('Space'); await at(Bp.R); await pg.mouse.down({ button: 'right' }); await wait(30); await pg.mouse.up({ button: 'right' }); await wait(300);
    const both = await until(() => __p3.climb().hands.every(h => h.st === 'hold'), 3000), braced = await until(() => __p3.climb().feet.every(f => f.st === 'plant' && f.kind === 'smear' && f.loadS > 0.1), 8000), s = await st();
    check('벽 딛기 실험을 켠 설정 · 실제 입력: 뛰어 턱 B를 잡고 두 손으로 매달리면 두 발이 벽면을 디딘다', both && braced, `손 ${s.c.hands.map(h => h.st).join('/')} · 발 ${s.c.feet.map(f => f.st + ' ' + f.kind + ' ' + f.loadS.toFixed(2)).join(' / ')}`);
    if (shots) await shot('braced_default'); await P(() => __p3.opt({ footAssist: false, wallRest: false })); }
  { // 발 선택이 결과를 가르는 장면을 실제 키·마우스로(수동 발: 발 보조·벽 딛기 끔): 턱 A를 두 손으로 → Shift + 오른쪽 단추로 오른발을 낮은 발판에 → W를 누른 채 올라서고 → 오른쪽 단추로 턱 F
    await P(() => __p3.opt({ handMode: 1, footAssist: false, wallRest: false })); await wallStart(); const F = [-0.3, 2.13, -2.86];
    await click(A.L); await handIs(0, 'hold'); await click(A.R, 'right'); await handIs(1, 'hold'); await still();
    await pg.keyboard.down('ShiftLeft'); await wait(60); await click([-0.3, 0.5, -2.93], 'right'); await wait(80); await pg.keyboard.up('ShiftLeft');
    const stepped = await until(() => { const f = __p3.climb().feet[1]; return f.st === 'plant' && f.box === '낮은 발판'; }, 6000); await still();
    const y0 = (await st()).b.pos[1]; await at(F); await pg.keyboard.down('KeyW'); await until(() => __p3.body().pos[1] > 0.25, 7000); await wait(150); const y1 = (await st()).b.pos[1], load = (await st()).c.feet[1].loadS;
    await pg.mouse.down({ button: 'right' }); await wait(40); await pg.mouse.up({ button: 'right' }); const got = await until(() => { const h = __p3.climb().hands; return h[1].st === 'hold' && h[1].box === '턱 F' && h[0].st === 'hold'; }, 5000); await pg.keyboard.up('KeyW');
    const s = await st();
    check('실제 입력 · 수동 발: 오른발을 낮은 발판에 올리고(Shift + 단추) W로 올라서서 오른손으로 턱 F를 잡는다(왼손 유지, 발이 받친 채)', stepped && got && load > 0.2, `발 디딤 ${stepped} · 오른 높이 ${((y1 - y0) * 100).toFixed(0)}cm · 발 하중 ${load.toFixed(2)}배 · 오른손 ${s.c.hands[1].st}(${s.c.hands[1].box}) 왼손 ${s.c.hands[0].st}`);
    if (shots) await shot('standup_F');
    // 같은 손 배치에서 발을 고르지 않으면(두 발 바닥) 같은 입력으로 닿지 않는다
    await wallStart(); await click(A.L); await handIs(0, 'hold'); await click(A.R, 'right'); await handIs(1, 'hold'); await still(); const n0 = (await log()).length;
    await at(F); await pg.keyboard.down('KeyW'); await wait(1800); await pg.mouse.down({ button: 'right' }); await wait(40); await pg.mouse.up({ button: 'right' }); await wait(1500); await pg.keyboard.up('KeyW'); await wait(400);
    const s2 = await st(), L2 = (await log()).slice(n0);
    check('실제 입력 · 수동 발: 발을 고르지 않으면(두 발 바닥) 같은 입력으로 턱 F에 닿지 않는다', !(s2.c.hands[1].st === 'hold' && s2.c.hands[1].box === '턱 F'), L2.filter(x => /^(grab|reject|slip)/.test(x)).join(' | ').slice(0, 140)); }
  // ── ③-2 입력 결함 B1·B2(GPT의 p3d-0.7.0 검토). 실제 키·마우스 이벤트로 본다(명령을 직접 넣는 시험은 이 경로를 지나지 않는다) ──
  { // B2: 손 조작 2번으로 오른손을 뻗는 중에 시점 보기(V)로 바꾼 뒤 단추를 뗀다 → 그 손은 거둬진다(뻗은 채 남지 않고, 새로 잡지도 않는다). 왼손은 그대로
    await P(() => __p3.opt({ handMode: 2 })); await wallStart(); await click(A.L); await handIs(0, 'hold'); await still();
    await at(A.R); await pg.mouse.down({ button: 'right' }); const reached = await handIs(1, 'reach'); await wait(150);
    await key('KeyV', 80); await wait(250); await pg.mouse.up({ button: 'right' }); await wait(150); await key('KeyV', 80); await wait(700);
    const s = await st(), L = await log(), k = L.map((x, i) => (/^cancel 오른손/.test(x) ? i : -1)).filter(i => i >= 0).pop();
    check('B2: 뻗는 중에 시점 보기로 바꾸고 뗌 → 오른손은 거둬지고(뻗은 채 남지 않음) 새로 잡지 않으며 왼손은 그대로 잡고 있다', reached && s.c.hands[1].st === 'free' && s.c.hands[0].st === 'hold' && k >= 0 && !L.slice(k).some(x => /^grab 오른손/.test(x)) && !s.i.view, `오른손 ${s.c.hands[1].st} · 왼손 ${s.c.hands[0].st} · ${L.slice(-3).join(' | ')}`);
    // 포커스를 잃어도 같다
    await at(A.R); await pg.mouse.down({ button: 'right' }); await handIs(1, 'reach'); await wait(120); await P(() => window.dispatchEvent(new Event('blur'))); await wait(500); await pg.mouse.up({ button: 'right' }); await wait(300);
    const s2 = await st(), L2 = await log();
    check('B2: 뻗는 중에 창이 포커스를 잃음 → 오른손은 거둬지고 왼손은 그대로', s2.c.hands[1].st === 'free' && s2.c.hands[0].st === 'hold' && /^cancel 오른손/.test(L2.filter(x => /오른손/.test(x)).pop() || ''), `오른손 ${s2.c.hands[1].st} · ${L2.slice(-2).join(' | ')}`);
    // 나머지 경로: 손 조작 방식 바꾸기(H), 마우스가 화면 밖으로 나감, 창이 가려짐, 키 다시 정하기. 모두 거두기만 하고 새로 잡지 않으며 왼손은 그대로다
    for (const [nm, fn] of [['손 조작 방식 바꾸기(H)', async () => { await key('KeyH', 80); await wait(200); await key('KeyH', 80); }], ['마우스가 화면 밖으로 나감', () => P(() => document.documentElement.dispatchEvent(new Event('mouseleave')))], ['창이 가려짐', () => P(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); Object.defineProperty(document, 'hidden', { value: false, configurable: true }); })], ['키 다시 정하기', () => P(() => { __p3.setKeys('helpAll', ['KeyK']); })]]) {
      await P(() => __p3.opt({ handMode: 2 })); await at(A.R); await pg.mouse.down({ button: 'right' }); const r0 = await handIs(1, 'reach'); await wait(120); const n9 = (await log()).length; await fn(); await wait(220); const tg9 = (await P(() => __p3.tagsText())).join(' | '); await wait(230); await pg.mouse.up({ button: 'right' }); await wait(350);
      const s9 = await st(), L9 = (await log()).slice(n9);
      check(`B2: 뻗는 중에 ${nm} → 오른손은 거둬지고(새로 잡지 않음) 왼손은 그대로. 그 손 자리에 잠깐 "보내기 취소"가 보인다(임시 표시)`, r0 && s9.c.hands[1].st === 'free' && s9.c.hands[0].st === 'hold' && L9.some(x => /^cancel 오른손/.test(x)) && !L9.some(x => /^grab 오른손/.test(x)) && /오른손 보내기 취소/.test(tg9), `오른손 ${s9.c.hands[1].st} · 왼손 ${s9.c.hands[0].st} · ${L9.join(' | ').slice(0, 90)}`); }
    await P(() => __p3.opt({ handMode: 1 })); }
  { // 팔 경로 막힘 표시(임시 모양, GPT 답): 손 조작 2로 오른손을 턱 A 바로 위 벽면으로 뻗으면 팔뚝이 턱에 걸린다 → 그 손 이름표에 "팔 경로 막힘"이 뜬다(그냥 멈춘 것처럼 보이지 않게)
    await P(() => __p3.opt({ handMode: 2 })); await wallStart(); await click(A.L); await handIs(0, 'hold'); await still();
    await at([-0.95, 2.05, -3.0]); await pg.mouse.down({ button: 'right' }); await handIs(1, 'reach'); const seen = await until(() => __p3.tagsText().some(t => /팔 경로 막힘/.test(t)), 4000), blk = await P(() => __p3.climb().hands[1].armBlock);
    await pg.mouse.up({ button: 'right' }); await wait(600); const L = await log();
    check('팔 경로 막힘: 턱 바로 위 벽면으로 뻗어 팔뚝이 턱에 걸리면 그 손 이름표에 "팔 경로 막힘"이 보이고, 떼면 헛손질로 끝난다(왼손은 그대로)', seen && blk && (await st()).c.hands[0].st === 'hold', `표시 ${seen} · 상태 ${blk} · ${L.slice(-2).join(' | ')}`);
    await P(() => __p3.opt({ handMode: 1 })); await key('KeyQ'); await until(() => __p3.body().onGround && !__p3.climb().on); await wait(300); }
  { // B1: 달리기 키(와 앞으로)를 누른 채 뛰고, 달리기 키를 떼지 않은 채 왼쪽 단추 → 손 명령이어야 한다(전에는 발 명령이 나가 "공중에서는 발을 보낼 수 없음"으로 거부됐다)
    await wallStart(); await at(A.L); const n0 = (await log()).length;
    await pg.keyboard.down('ShiftLeft'); await pg.keyboard.down('KeyW'); await wait(60); await pg.keyboard.down('Space'); await until(() => !__p3.body().onGround, 2000); await wait(40);
    await pg.mouse.down({ button: 'left' }); await wait(40); await pg.mouse.up({ button: 'left' }); await wait(700);
    await pg.keyboard.up('Space'); await pg.keyboard.up('KeyW'); await pg.keyboard.up('ShiftLeft'); await wait(300);
    const L = (await log()).slice(n0);
    check('B1: 달리기 키를 누른 채 뛰어 왼쪽 단추 → 왼손 명령(발 명령이 아님)', L.some(x => /^try 왼손/.test(x)) && !L.some(x => /^(try|reject) 왼발/.test(x)), L.filter(x => /^(try|grab|reject)/.test(x)).join(' | ').slice(0, 200));
    // 서서(이동 키 없이) 달리기 키 + 단추는 전처럼 발이다(발부터 올리기)
    await wallStart(); const n1 = (await log()).length; await pg.keyboard.down('KeyX'); await wait(60); await click([-0.35, 0.5, -2.93]); await wait(500); await pg.keyboard.up('KeyX');
    const L3 = (await log()).slice(n1);
    check('B1: 땅에 서서 발 지정 키(따로 둔 동작, 기본 X) + 왼쪽 단추 → 왼발 명령(발부터 올리기)', L3.some(x => /^try 왼발/.test(x)), L3.join(' | ').slice(0, 160));
    // 달리기 키는 서 있을 때도 발 지정이 아니다(0.8.0의 임시 조건을 없앰): 서서 달리기 키 + 단추 → 손 명령
    await wallStart(); const n2 = (await log()).length; await pg.keyboard.down('ShiftLeft'); await wait(60); await click(A.L); await wait(600); await pg.keyboard.up('ShiftLeft');
    const L4 = (await log()).slice(n2);
    check('B1: 땅에 서서 달리기 키 + 왼쪽 단추 → 손 명령(달리기는 발 지정을 겸하지 않는다)', L4.some(x => /^try 왼손/.test(x)) && !L4.some(x => /^(try|reject) 왼발/.test(x)), L4.filter(x => /^(try|grab|reject)/.test(x)).join(' | ').slice(0, 160));
    // 미리보기도 같은 판단을 쓴다: 달리기 키를 누른 채 턱을 겨누면 손 미리보기(왼손·오른손 이름)가 뜬다. 문구의 거리 숫자는 서 있는 몸의 작은 움직임으로 1cm쯤 달라질 수 있어 숫자를 뺀 글로 견준다(캡처 모션에서 46cm와 45cm로 갈려 거짓 실패가 났다)
    const pv = async k => { await wallStart(); if (k) await pg.keyboard.down(k); await at([-0.35, 0.5, -2.93]); await wait(300); const t = (await P(() => __p3.tagsText())).join(' | '); if (k) await pg.keyboard.up(k); return t; };
    const tNone = await pv(null), tRun = await pv('ShiftLeft'), tFoot = await pv('KeyX');
    check('B1: 미리보기도 같은 판단을 쓴다 — 달리기 키를 누른 채 겨누면 아무것도 누르지 않았을 때와 같고(손 기준), 발 지정 키를 누르면 발 미리보기로 바뀐다', tRun.replace(/\d+/g, '#') === tNone.replace(/\d+/g, '#') && tFoot !== tNone && /발/.test(tFoot), `누르지 않음 "${tNone.slice(-40)}" · 달리기 "${tRun.slice(-40)}" · 발 지정 "${tFoot.slice(-60)}"`); }
  await key('KeyE'); await until(() => __p3.body().onGround && !__p3.climb().on); await wait(300);

  // ── ④ 화면: 뛰어오른 동안 화면을 멈춰 둔다 ──
  await wallStart(); await P(() => __p3.setCam({ yaw: 0, pitch: 0.12, dist: 3.6 })); await pg.keyboard.down('KeyS'); await wait(700); await pg.keyboard.up('KeyS'); await still(); await wait(1200);
  // 기준 = 발이 땅을 떠난 순간의 화면(누르고 뜨기까지 0.08초 동안은 땅에 있어 따라간다)
  { await pg.keyboard.down('Space'); await until(() => !__p3.body().onGround, 2000); const t0 = (await st()).cam.target; let maxD = 0, peak = 0; for (let i = 0; i < 12; i++) { const s = await st(); if (s.b.onGround) break; maxD = Math.max(maxD, Math.hypot(...s.cam.target.map((v, k) => v - t0[k]))); peak = Math.max(peak, s.b.pos[1]); await wait(40); } await pg.keyboard.up('Space'); await until(() => __p3.body().onGround); await wait(1500); const t1 = (await st()).cam.target;
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
