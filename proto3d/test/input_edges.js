// 입력 전환 구간(B1의 남은 확인, p3d-0.8.2): 뜨는 순간·착지·벽 진입·시점 보기 전환·발 지정 키를 먼저 뗌. p3d-0.8.3: 첫 프레임 전의 취소와 누름 하나의 수명 기록. 실제 키·마우스 이벤트(헤드리스 브라우저)로 본다.
// 스크립트 입력이며 사람 손이 아니다. 실제 시간으로 도는 화면이라 한 번의 통과를 근거로 쓰지 않는다(여러 번 돌려 적는다).
// 사용: node test/input_edges.js   캡처 빌드: BUILD=climb3d_mocap.html MODE=clip   고치기 전 빌드와 견주려면 BUILD=<옛 빌드의 절대 경로>
'use strict';
const { chromium } = require('playwright'), path = require('path');
const url = 'file://' + path.resolve(__dirname, '..', process.env.BUILD || 'climb3d.html') + '?test&noshadow';
let fail = 0, pass = 0; const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`); if (ok) pass++; else fail++; };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 1280, height: 720 } }), errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(url); await pg.waitForTimeout(1000);
  await pg.evaluate(m => { __p3.resetKeys(); __p3.opt({ handMode: 1, footAssist: false, wallRest: false, diag: true, helpAll: false }); if (m) __p3.setMode(m); }, process.env.MODE || '');
  const P = f => pg.evaluate(f), wait = ms => pg.waitForTimeout(ms);
  const at = async p => { const s = await pg.evaluate(p => __p3.screenOf(p), p); if (!(s.x > 2 && s.x < 1278 && s.y > 2 && s.y < 718)) throw new Error('겨눌 점이 화면 밖: ' + JSON.stringify(p)); await pg.mouse.move(s.x, s.y); await wait(60); return s; };
  const log = () => P(() => __p3.climbLog().map(e => `${e.type}${e.name ? ' ' + e.name : ''}${e.why ? ' · ' + e.why : ''}`));
  const raf = (f, ms = 4000) => pg.waitForFunction(f, null, { polling: 'raf', timeout: ms }).then(() => true, () => false);
  const until = async (f, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pg.evaluate(f)) return true; await wait(50); } return false; };
  const wallStart = async () => { await P(() => { __p3.setView(false); __p3.wallStart(); __p3.setCam({ yaw: 0, pitch: 0.12, dist: 3.6 }); }); await wait(500); };
  const A = { L: [-1.1, 1.9, -2.84], R: [-0.7, 1.9, -2.84] }, FAR = [1.0, 2.30, -2.86]; // FAR = 턱 B의 앞면(시작 자리에서는 닿지 않는다 → 명령은 나가되 잡지 않아 땅에 남는다)
  const n = (L, re) => L.filter(x => re.test(x)).length, show = L => L.filter(x => /^(try|grab|reject|deny|cancel)/.test(x)).join(' | ').slice(0, 170);

  { // ① 뜨는 순간: 땅에서 우클릭을 누른 바로 뒤에 뜨고, 공중에서 뗀다 → 오른손 명령이 한 번 나가야 한다(사라지면 안 된다)
    // "짧게 눌렀다 떼기"는 0.35초 안에 떼어야 한다. 화면이 느려 누른 시간이 그보다 길어진 시도는 규칙대로 명령이 없는 것이 맞으므로 세지 않고 다시 한다(세 번까지)
    let r = null;
    for (let a = 0; a < 3 && !r; a++) { await wallStart(); await at(FAR); const n0 = (await log()).length, t0 = Date.now();
      await pg.mouse.down({ button: 'right' }); await pg.keyboard.down('Space'); const up = await raf(() => !__p3.body().onGround, 1500); await pg.mouse.up({ button: 'right' }); const dur = Date.now() - t0; await wait(120); await pg.keyboard.up('Space');
      await until(() => __p3.body().onGround && !__p3.climb().on); await wait(250); const L = (await log()).slice(n0); if (dur <= 300 || n(L, /^try 오른손/) > 0) r = { up, dur, L, a }; }
    check('뜨는 순간: 땅에서 우클릭을 누르고 뜬 뒤 공중에서 뗌 → 오른손 명령 1번(사라지지 않는다)', !!r && r.up && n(r.L, /^try 오른손/) === 1, r ? `뜸 ${r.up} · 누른 시간 약 ${r.dur}ms · 오른손 시도 ${n(r.L, /^try 오른손/)}번 · ${r.a + 1}번째 시도 · ${show(r.L)}` : '세 번 모두 누른 시간이 0.3초를 넘어 확인하지 못함(화면이 느림)'); }
  { // ② 착지: 공중에서 우클릭을 누르고(그 순간 오른손 명령), 내려선 뒤에 뗀다 → 명령은 한 번뿐이어야 한다(떼는 순간에 한 번 더 나가면 안 된다)
    await wallStart(); await at(FAR); const n0 = (await log()).length;
    await pg.keyboard.down('Space');
    const down = await raf(() => { const b = __p3.body(); return !b.onGround && b.vel[1] < 0 && b.pos[1] < 0.25; }, 3000); await pg.mouse.down({ button: 'right' });
    const landed = await raf(() => __p3.body().onGround, 1500); await pg.mouse.up({ button: 'right' }); await pg.keyboard.up('Space'); await wait(350); const L = (await log()).slice(n0);
    check('착지: 공중에서 우클릭을 누르고 내려선 뒤 뗌 → 오른손 명령 1번(두 번 나가지 않는다)', down && landed && n(L, /^try 오른손/) === 1, `공중에서 누름 ${down} · 착지 ${landed} · 오른손 시도 ${n(L, /^try 오른손/)}번 · ${show(L)}`); }
  { // ③ 벽 진입: 달리기 키를 누른 채 왼손으로 턱 A를 잡는다 → 벽 문맥. 달리기 키(벽에서는 발 지정과 같은 키)를 떼지 않은 채 다른 손을 보내면 손 명령이어야 한다(다시 눌러야 발 지정)
    // 처음에는 뛰어 잡는 장면으로 만들었으나, 한 손으로 떨어지며 잡으면 충격으로 놓치는 잡기 규칙에 좌우돼 흔들렸다(입력과 무관) → 서서 잡는다
    await wallStart(); await pg.keyboard.down('ShiftLeft'); await wait(80); await at(A.L); await pg.mouse.down({ button: 'left' }); await wait(40); await pg.mouse.up({ button: 'left' });
    const held = await until(() => __p3.climb().hands[0].st === 'hold', 5000); await until(() => __p3.input().mode === 'wall', 3000); await until(() => Math.hypot(...__p3.body().vel) < 0.3, 4000);
    const n0 = (await log()).length, mode = (await P(() => __p3.input())).mode; await at(A.R); await wait(200); const tag = (await P(() => __p3.tagsText())).join(' | ');
    await pg.mouse.down({ button: 'right' }); await wait(40); await pg.mouse.up({ button: 'right' }); await wait(500); const L = (await log()).slice(n0);
    check('벽 진입: 달리기 키를 누른 채 잡아 벽 문맥이 된 뒤, 그 키를 떼지 않고 우클릭 → 오른손 명령(발 명령이 아님). 미리보기도 손 기준', held && mode === 'wall' && n(L, /^try 오른손/) === 1 && n(L, /^(try|reject|deny) 오른발/) === 0 && !/발/.test(tag.split('|').pop()), `잡음 ${held} · 문맥 ${mode} · ${show(L)} · 미리보기 "${tag.replace(/\s+/g, ' ').slice(-50)}"`);
    // 같은 키를 뗐다가 다시 누르면 발 지정이다
    await pg.keyboard.up('ShiftLeft'); await wait(80); await until(() => __p3.climb().hands[1].st !== 'reach', 3000); const n1 = (await log()).length; await pg.keyboard.down('ShiftLeft'); await wait(80); await at([-0.9, 0.9, -3.0]).catch(() => null); await pg.mouse.down({ button: 'left' }); await wait(40); await pg.mouse.up({ button: 'left' }); await wait(400); await pg.keyboard.up('ShiftLeft'); const L1 = (await log()).slice(n1);
    check('벽 진입 뒤: 그 키를 뗐다가 다시 누른 채 좌클릭 → 왼발 명령', n(L1, /^(try|reject|deny|step) 왼발/) >= 1 && n(L1, /^try 왼손/) === 0, show(L1));
    await pg.keyboard.press('KeyQ'); await pg.keyboard.press('KeyE'); await until(() => __p3.body().onGround && !__p3.climb().on); await wait(300); }
  { // ④ 발 지정 키를 먼저 뗌: 땅에서 발 지정 키를 누른 채 우클릭을 누르고, 발 지정 키를 먼저 뗀 뒤 우클릭을 뗀다 → 누르는 순간의 대상(발)으로 나간다
    await wallStart(); await at([-0.35, 0.5, -2.93]); const n0 = (await log()).length;
    await pg.keyboard.down('KeyX'); await wait(60); await pg.mouse.down({ button: 'right' }); await wait(40); await pg.keyboard.up('KeyX'); await wait(60); await pg.mouse.up({ button: 'right' }); await wait(500); const L = (await log()).slice(n0);
    check('발 지정 키를 먼저 뗌: 누르는 순간에 정한 대상(오른발)으로 나간다(떼는 순간에 손으로 바뀌지 않는다)', n(L, /^(try|reject|deny|step) 오른발/) >= 1 && n(L, /^try 오른손/) === 0, show(L)); }
  { // ⑤ 시점 보기 전환: 땅에서 우클릭을 누른 채 시점 보기(V)로 바꾸고 뗀다 → 손 명령이 나가지 않는다. 시점 보기를 끈 뒤에도 뒤늦게 나가지 않는다
    await wallStart(); await at(FAR); const n0 = (await log()).length;
    await pg.mouse.down({ button: 'right' }); await wait(40); await pg.keyboard.press('KeyV'); await wait(120); await pg.mouse.up({ button: 'right' }); await wait(150); await pg.keyboard.press('KeyV'); await wait(400); const L = (await log()).slice(n0), s = await P(() => __p3.input());
    check('시점 보기 전환: 우클릭을 누른 채 시점 보기로 바꾸고 뗌 → 손 명령 없음(끈 뒤에도 없음)', n(L, /^try/) === 0 && s.mode === 'ground', `문맥 ${s.mode} · 시도 ${n(L, /^try/)}번`); }
  { // ⑥ 첫 프레임 전의 취소(GPT의 p3d-0.8.2 검토 P1-A): 벽 문맥·손 조작 2에서 오른쪽 단추를 누른 뒤, 다음 화면 프레임이 오기 전에 마우스가 화면을 벗어난다 → 새 뻗기 명령이 생기면 안 된다.
    // 누름과 벗어남을 한 번의 페이지 실행 안에서 잇달아 낸다(둘 사이에 프레임이 끼지 않는다). 원시 DOM 이벤트이며 사람 손이 아니다
    await P(() => __p3.opt({ handMode: 2 })); await wallStart(); await at(A.L); await pg.mouse.down({ button: 'left' }); await wait(120); await pg.mouse.up({ button: 'left' }); const held0 = await until(() => __p3.climb().hands[0].st === 'hold', 5000); await until(() => __p3.input().mode === 'wall', 3000); await until(() => Math.hypot(...__p3.body().vel) < 0.3, 4000);
    const s = await at(A.R), n0 = (await log()).length, G = () => P(() => (__p3.gestures ? __p3.gestures() : [])), g0 = (await G()).length;
    await pg.evaluate(([x, y]) => { const el = document.querySelector('canvas'); el.dispatchEvent(new MouseEvent('mousedown', { button: 2, clientX: x, clientY: y, bubbles: true, cancelable: true })); document.documentElement.dispatchEvent(new Event('mouseleave')); }, [s.x, s.y]);
    await wait(500); const mid = await P(() => ({ h: __p3.climb().hands.map(h => h.st), held: __p3.aimHeld ? __p3.aimHeld() : [null, null] })), gNew = (await G()).slice(g0);
    await pg.evaluate(() => window.dispatchEvent(new MouseEvent('mouseup', { button: 2, bubbles: true }))); await wait(300); const L2 = (await log()).slice(n0), end = await P(() => __p3.climb().hands.map(h => h.st));
    check('첫 프레임 전의 취소: 누른 뒤 프레임이 오기 전에 화면을 벗어나면 뻗기 명령이 생기지 않고, 떼어도 잡으러 가지 않으며, 잡고 있던 왼손은 그대로다', held0 && n(L2, /^try 오른손/) === 0 && !mid.held[1] && mid.h[1] === 'free' && end[0] === 'hold' && end[1] === 'free', `뻗기 시도 ${n(L2, /^try 오른손/)}번 · 누르는 중 표시 ${mid.held[1]} · 오른손 ${mid.h[1]} → ${end[1]} · 왼손 ${end[0]} · 새 누름 기록 ${gNew.length ? JSON.stringify(gNew.map(g => ({ ctx: g.ctx, limb: g.limb, issued: g.issued, cancelled: g.cancelled }))) : '없음(읽기 전에 버려짐)'}`);
    // 같은 누름은 다시 쓰이지 않지만, 뗐다가 새로 누르면 듣는다
    await at(A.R); await pg.mouse.down({ button: 'right' }); const re = await until(() => __p3.climb().hands[1].st === 'reach', 3000); const g2 = (await G()).slice(-1)[0] || {};
    // ⑦ 프레임 뒤의 취소: 뻗는 중(명령이 나간 뒤)에 화면을 벗어난다 → 거둔다(새로 잡지 않는다). 누름 기록에는 "명령 1번 → 취소"가 남는다
    const n1 = (await log()).length; await P(() => document.documentElement.dispatchEvent(new Event('mouseleave'))); await wait(400); await pg.mouse.up({ button: 'right' }); await wait(300);
    const L3 = (await log()).slice(n1), g3 = (await G()).slice(-1)[0] || {}, e3 = await P(() => __p3.climb().hands.map(h => h.st));
    check('취소 뒤 새로 누르면 듣고(뻗음), 뻗는 중에 화면을 벗어나면 거둔다. 누름 기록: 문맥·대상·명령 1번·취소가 한 줄에 남는다', re && g2 && g2.issued === 1 && n(L3, /^cancel 오른손/) === 1 && n(L3, /^grab 오른손/) === 0 && e3[1] === 'free' && e3[0] === 'hold' && g3.issued === 1 && g3.cancelled === 'mouseleave' && g3.ctx === 'wall' && g3.limb === 'hand', `다시 눌러 뻗음 ${re} · ${show(L3)} · 누름 기록 ${JSON.stringify({ ctx: g3.ctx, limb: g3.limb, issued: g3.issued, cancelled: g3.cancelled })}`);
    await P(() => __p3.opt({ handMode: 1 })); }
  { // ⑧ 화면 밖에서 뗀 뒤의 재진입(GPT의 p3d-0.8.3 검토 P1): 취소된 뒤 문서에 mouseup이 오지 않은 채로 돌아온다. 원시 DOM 이벤트를 페이지 안에서 낸다(실제 마우스는 뗌을 늘 페이지에 전하므로 이 경계를 만들 수 없다). 사람 손이 아니다
    // 순서: 누름 → (프레임 뒤 또는 앞에) 화면 벗어남 = 취소 → [mouseup 없음] → 누른 채 돌아옴(buttons에 그 단추가 남음): 명령 없음 → 실제 새 누름: 첫 번부터 뻗어야 한다
    await P(() => __p3.opt({ handMode: 2 })); const G = () => P(() => (__p3.gestures ? __p3.gestures() : []));
    const ev = (type, btn, held, xy) => pg.evaluate(([type, btn, held, x, y]) => { const el = document.querySelector('canvas'), o = { button: btn, buttons: held, clientX: x, clientY: y, bubbles: true, cancelable: true }; if (type === 'mouseleave' || type === 'mouseenter') document.documentElement.dispatchEvent(new MouseEvent(type, { ...o, bubbles: false })); else (type === 'mouseup' ? window : el).dispatchEvent(new MouseEvent(type, o)); }, [type, btn, held, xy.x, xy.y]);
    for (const [nm, hi, keep, before] of [['오른손 · 프레임 뒤에 벗어남', 1, 0, false], ['오른손 · 프레임 전에 벗어남', 1, 0, true], ['왼손 · 프레임 뒤에 벗어남', 0, 1, false]]) {
      const btn = hi ? 2 : 0, mask = hi ? 2 : 1, tgt = hi ? A.R : A.L, oth = hi ? A.L : A.R, hn = hi ? '오른손' : '왼손';
      await wallStart(); await at(oth); await pg.mouse.down({ button: hi ? 'left' : 'right' }); await wait(120); await pg.mouse.up({ button: hi ? 'left' : 'right' }); const held0 = await until(new Function(`return __p3.climb().hands[${keep}].st === 'hold'`), 5000); await until(() => __p3.input().mode === 'wall', 3000); await until(() => Math.hypot(...__p3.body().vel) < 0.3, 4000);
      const xy = await at(tgt), n0 = (await log()).length, g0 = (await G()).length, tries = async () => n((await log()).slice(n0), new RegExp('^try ' + hn)), stOf = () => P(() => __p3.climb().hands.map(h => h.st));
      if (before) await pg.evaluate(([b, m, x, y]) => { const el = document.querySelector('canvas'); el.dispatchEvent(new MouseEvent('mousedown', { button: b, buttons: m, clientX: x, clientY: y, bubbles: true, cancelable: true })); document.documentElement.dispatchEvent(new MouseEvent('mouseleave', { buttons: m })); }, [btn, mask, xy.x, xy.y]);
      else { await ev('mousedown', btn, mask, xy); await until(new Function(`return __p3.climb().hands[${hi}].st === 'reach'`), 3000); await ev('mouseleave', btn, mask, xy); }
      await wait(350); const t1 = await tries(), s1 = await stOf();
      await ev('mouseenter', btn, mask, xy); await ev('mousemove', btn, mask, xy); await wait(350); const t2 = await tries(), s2 = await stOf();
      await ev('mousedown', btn, mask, xy); const re = await until(new Function(`return __p3.climb().hands[${hi}].st === 'reach'`), 2500), t3 = await tries(), s3 = await stOf();
      await ev('mouseup', btn, 0, xy); const grabbed = await until(new Function(`return __p3.climb().hands[${hi}].st === 'hold'`), 4000), gs = (await G()).slice(g0).map(g => `${g.ctx}/${g.limb}/명령 ${g.issued}${g.cancelled ? '/취소 ' + g.cancelled : ''}`);
      check(`재진입(${nm}): 취소 뒤 뗌이 전해지지 않아도 — 누른 채 돌아오면 명령 없음, 새로 누르면 첫 번에 뻗고 떼면 잡는다. 다른 손은 그대로`, held0 && t1 === (before ? 0 : 1) && s1[hi] === 'free' && t2 === t1 && s2[hi] === 'free' && re && t3 === t1 + 1 && grabbed && s3[keep] === 'hold', `취소 뒤 시도 ${t1}번·${s1[hi]} → 누른 채 돌아옴 ${t2}번·${s2[hi]} → 새 누름 ${t3}번·${s3[hi]}${re ? '' : '(뻗지 않음)'} → 뗌 ${grabbed ? '잡음' : '못 잡음'} · 다른 손 ${s3[keep]} · 누름 기록 [${gs.join(' → ')}]`);
      await pg.keyboard.press('KeyQ'); await pg.keyboard.press('KeyE'); await until(() => __p3.body().onGround && !__p3.climb().on); await wait(300); }
    await P(() => __p3.opt({ handMode: 1 })); }
  check('페이지 오류 없음', errs.length === 0, errs.join(' | '));
  console.log(`통과 ${pass} · 실패 ${fail}`); await b.close(); process.exit(fail ? 1 : 0);
})();
