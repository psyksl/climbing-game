// 1배속 영상(수정 전후를 같은 출발점·같은 카메라·같은 설정으로 견주는 데 쓴다): 지지 발을 둔 채 한 손 뻗기 → 잡기 또는 막힘 → 복귀.
// 사용자 플레이 1차(녹화 0:47~0:58)의 상황을 옮긴 장면: 왼손으로 턱 A, 왼발은 낮은 발판 → 오른손을 턱 F로.
// 스크립트 입력(사람 손 아님): 같은 계산 코드(src)로 먼저 돌려 걸음마다의 입력 목록을 만든 뒤 실제 화면 루프에 그대로 넣는다.
// 사용: node test/record_reach.mjs <출력 폴더> [이름]   캡처 빌드: BUILD=climb3d_mocap.html MODE=clip   옛 소스로 입력을 만들 때: SRC=<옛 src 폴더>(빌드도 BUILD로 옛 것을 준다)
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';
const HERE = path.dirname(fileURLToPath(import.meta.url)), SRC = process.env.SRC ? path.resolve(process.env.SRC) : path.resolve(HERE, '../src'), imp = f => import(pathToFileURL(path.join(SRC, f)).href), require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { buildCharacter } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js');
const clip = process.env.MODE === 'clip', build = process.env.BUILD ? path.resolve(process.env.BUILD) : path.join(HERE, '..', 'climb3d.html'), out = process.argv[2], tag = process.argv[3] || 'reach';
const clips = clip ? JSON.parse(fs.readFileSync(path.resolve(HERE, '../assets_local/clips.json'), 'utf8')) : null;
const rig = buildCharacter(), hand = (i, p) => ({ type: 'hand', i, p }), foot = (i, p) => ({ type: 'foot', i, p }), rel = (limb, i) => ({ type: 'release', limb, i });
const START = [-0.62, 0, -2.58], F = [-0.3, 2.15, -2.86], AL = [-0.72, 1.92, -2.84], AR = [-0.62, 1.92, -2.84], LOW = [-0.45, 0.5, -2.93];
function make(pos, fn, assist) { const sim = makeSim(rig, makeWorld(), clips), list = []; sim.reset({ pos, yaw: Math.PI }); sim.opt.wallRest = false; sim.opt.footAssist = !!assist; const put = (inp = {}, cmd = []) => { const x = { mx: 0, mz: 0, cxSign: 1, ...inp, cmd }; list.push(x); sim.step(x); }; const rep = (n, inp, cmd) => { for (let i = 0; i < n; i++) put(inp, i ? [] : cmd); }; fn(sim, put, rep); return list; }
// 영상에 함께 보일 입력 목록(걸음 번호 → 글): 스크립트가 넣은 손발 명령과 몸 조작 키. 사람이 누른 것이 아니다
const NAMES = [[F, '턱 F'], [AL, '턱 A'], [AR, '턱 A'], [LOW, '낮은 발판']], nameOf = p => (NAMES.find(([q]) => q[0] === p[0] && q[1] === p[1] && q[2] === p[2]) || [0, '?'])[1], KEY = { cy: ['W(몸 위로)', 'S(몸 아래로)'], cx: ['D(몸 오른쪽)', 'A(몸 왼쪽)'] };
function inputLog(list) { const ev = [], prev = { cy: 0, cx: 0 }; list.forEach((x, k) => { for (const a of ['cy', 'cx']) { const v = x[a] || 0; if (v !== prev[a]) { if (prev[a]) ev.push({ k, text: KEY[a][prev[a] > 0 ? 0 : 1] + ' 뗌' }); if (v) ev.push({ k, text: KEY[a][v > 0 ? 0 : 1] + ' 누름' }); prev[a] = v; } }
  for (const c of x.cmd || []) { const side = c.i ? '오른' : '왼'; if (c.type === 'hand') ev.push({ k, text: `${side}손 ${c.hold ? '누르고 있음' : '클릭'} → ${nameOf(c.p)}` }); else if (c.type === 'foot') ev.push({ k, text: `${side}발 보내기 → ${nameOf(c.p)}` }); else if (c.type === 'release') ev.push({ k, text: `${side}${c.limb === 'foot' ? '발' : '손'} 놓기` }); else if (c.type === 'handUp') ev.push({ k, text: `${side}손 단추 뗌` }); } }); return ev; }
// 앞 조건: 왼손으로 턱 A를 잡고 왼발을 낮은 발판에 올린다(오른발은 놓여 있다)
const setup = rep => { rep(60); rep(150, {}, [hand(0, AL)]); rep(260, {}, [foot(0, LOW)]); };
export const SCENES = [
  ['① 막힘 → 복귀: 올라서다 만 자리에서 오른손을 턱 F로(닿지 않는다) → 거부 → 팔이 돌아옴. 두 번', (sim, put, rep) => { setup(rep); rep(45, { cy: 1 }); rep(120); rep(300, {}, [hand(1, F)]); rep(300, {}, [hand(1, F)]); }, false],
  ['② 잡기: 왼발로 올라선 뒤 오른손을 턱 F로 → 잡음 → 2초', (sim, put, rep) => { setup(rep); rep(120, { cy: 1 }); rep(120); rep(360, {}, [hand(1, F)]); }, false],
  ['③ 잡기 → 놓고 되돌리기: 턱 F를 잡았다가 놓고(오른손) 턱 A로 다시', (sim, put, rep) => { setup(rep); rep(120, { cy: 1 }); rep(120); rep(240, {}, [hand(1, F)]); rep(150, {}, [rel('hand', 1)]); rep(300, {}, [hand(1, AR)]); }, false],
  ['④ 올라서며 뻗기: 몸 위로(W)를 누른 채 오른손을 턱 F로 → 잡음', (sim, put, rep) => { setup(rep); rep(40, { cy: 1 }); rep(1, { cy: 1 }, [hand(1, F)]); rep(200, { cy: 1 }); rep(200); }, false],
  ['⑤ 사용자 플레이와 같은 설정(발 보조 켬): 막힘 → 복귀 → 다시 뻗기', (sim, put, rep) => { setup(rep); rep(45, { cy: 1 }); rep(120); rep(300, {}, [hand(1, F)]); rep(60, { cy: 1 }); rep(360, {}, [hand(1, F)]); }, true],
  ['⑥ 손 조작 2(누르는 동안 뻗고 떼면 잡기): 닿지 않는 자리에서 0.9초 누르다 뗌 → 올라선 뒤 다시 눌러 닿으면 뗌', (sim, put, rep) => { setup(rep); rep(45, { cy: 1 }); rep(120); rep(110, { reach: [null, F] }, [{ ...hand(1, F), hold: true }]); rep(200, {}, [{ type: 'handUp', i: 1 }]); rep(75, { cy: 1 }); rep(60); rep(100, { reach: [null, F] }, [{ ...hand(1, F), hold: true }]); rep(260, {}, [{ type: 'handUp', i: 1 }]); }, false, 2],
];
if (out) {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1120, height: 630 }, recordVideo: { dir: out, size: { width: 1120, height: 630 } } }), pg = await ctx.newPage(), errs = [], info = [];
  pg.on('pageerror', e => errs.push(e.message)); await pg.goto('file://' + build + '?noshadow'); await pg.waitForTimeout(1200);
  await pg.evaluate(m => { if (m) __p3.setMode(m); document.getElementById('help').style.display = 'none'; }, clip ? 'clip' : '');
  // 시점 둘: 사용자 화면과 같은 시점(T로 시작했을 때의 뒤쪽 비스듬한 시점), 옆
  for (const [view, yaw, pitch, dist] of [['뒤에서(사용자 화면과 같은 시점)', 0.25, 0.12, 3.6], ['옆에서', Math.PI * 1.5, 0.10, 3.6]]) for (const [title0, fn, assist, mode] of SCENES.filter((x, i) => !process.env.ONLY || process.env.ONLY.includes(String(i + 1)))) {
    const inputs = make(START, fn, assist), title = title0 + ' · ' + view, evs = inputLog(inputs);
    // 입력과 시간을 영상에 함께 보인다(녹화 도구가 얹는 칸이라 옛 빌드에도 같은 모양으로 나온다): 실제로 흐른 시간, 게임이 계산한 시간, 스크립트가 넣은 입력과 그 시각
    await pg.evaluate(([title, pos, inputs, yaw, pitch, dist, assist, mode, evs]) => { __p3.opt({ handMode: mode || 1, footAssist: assist, wallRest: false, diag: false, helpAll: false }); __p3.reset({ pos, yaw: Math.PI }); __p3.setCam({ yaw, pitch, dist, follow: null }); __p3.setBanner(title + ' — 스크립트 입력(사람 손 아님)');
      let box = document.getElementById('recbox'); if (!box) { box = document.createElement('div'); box.id = 'recbox'; box.style.cssText = 'position:fixed;right:10px;top:8px;width:300px;background:rgba(28,35,29,.86);color:#f3ecd6;padding:7px 10px;border-radius:7px;font:12px/1.5 sans-serif;pointer-events:none'; document.body.appendChild(box); }
      const R = window.__rec = { id: (window.__rec ? window.__rec.id : 0) + 1, r0: performance.now(), g0: __p3.body().t, last: null }, me = R.id; __p3.script(inputs);
      const draw = () => { if (window.__rec.id !== me) return; const on = __p3.scripting(), g = __p3.body().t - R.g0, r = (performance.now() - R.r0) / 1000; if (on) R.last = [r, g]; const [rr, gg] = R.last || [r, g], k = Math.round(gg * 120);
        box.innerHTML = `<b>입력과 시간</b> · 1배속<br>실제 시간 ${rr.toFixed(2)}초 &nbsp; 게임 시간 ${gg.toFixed(2)}초<br><span style="color:#bbc4b2">스크립트가 넣은 입력(사람 손 아님)</span><br>` + evs.filter(e => e.k <= k).slice(-7).map(e => `<span style="color:#9fb0a0">${(e.k / 120).toFixed(2)}초</span> ${e.text}`).join('<br>'); requestAnimationFrame(draw); }; requestAnimationFrame(draw); }, [title, START, inputs, yaw, pitch, dist, assist, mode, evs]);
    const t0 = Date.now(); while (await pg.evaluate(() => __p3.scripting()) && Date.now() - t0 < 120000) await pg.waitForTimeout(200);
    await pg.waitForTimeout(400);
    info.push({ title, 걸음: inputs.length, 초: +(inputs.length / 120).toFixed(2), 끝의_실제_시간_게임_시간: await pg.evaluate(() => window.__rec.last && window.__rec.last.map(x => +x.toFixed(2))), 입력: evs.map(e => `${(e.k / 120).toFixed(2)}초 ${e.text}`), 기록: await pg.evaluate(() => __p3.climbLog().filter(e => e.type !== 'try' && !(e.auto && e.box === '바닥')).map(e => `${e.t.toFixed(2)}초 ${e.type}${e.name ? ' ' + e.name : ''}${e.box ? ' ' + e.box : ''}${e.why ? ' · ' + e.why : ''}`)) });
  }
  const ver = await pg.evaluate(() => __p3.VERSION || document.querySelector('#hud .ver')?.textContent || '');
  const vd = pg.video(); await ctx.close(); const name = `${tag}_${clip ? 'clip' : 'proc'}.webm`; fs.renameSync(await vd.path(), path.join(out, name));
  fs.writeFileSync(path.join(out, name.replace('.webm', '.json')), JSON.stringify({ note: '스크립트 입력(사람 손 아님)', build: path.basename(build), 판: ver, errs, scenes: info }, null, 1));
  await b.close(); console.log(name, ver, errs.length ? errs : '오류 없음'); for (const s of info) console.log(s.title.slice(0, 34), `(${s.초}초) →`, s.기록.filter(x => /grab|reject|slip|release|exit/.test(x)).slice(-4).join(' | ').slice(0, 260));
}
