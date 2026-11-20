// 발 선택이 결과를 가르는 장면(p3d-0.8.1, GPT의 첫 몸 동작 비교). 수동 발 프로필(손 조작 1 · 발 보조 끔 · 벽 딛기 끔)로, 같은 장면을 뒤에서 한 번·옆에서 한 번 찍는다(정상 속도).
// 스크립트 입력(사람 손 아님): 같은 계산 코드(src)로 먼저 돌려 걸음마다의 입력 목록을 만든 뒤 실제 화면 루프에 그대로 넣는다.
// 사용: node test/record_w6.mjs <출력 폴더>   캡처 빌드: BUILD=climb3d_mocap.html MODE=clip
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';
const HERE = path.dirname(fileURLToPath(import.meta.url)), SRC = path.resolve(HERE, '../src'), imp = f => import(pathToFileURL(path.join(SRC, f)).href), require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { buildCharacter } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js');
const clip = process.env.MODE === 'clip', build = process.env.BUILD || 'climb3d.html', out = process.argv[2];
const clips = clip ? JSON.parse(fs.readFileSync(path.resolve(HERE, '../assets_local/clips.json'), 'utf8')) : null;
const rig = buildCharacter(), B = { L: [0.5, 2.32, -2.86], R: [0.9, 2.32, -2.86] }, hand = (i, p) => ({ type: 'hand', i, p }), rel = (limb, i) => ({ type: 'release', limb, i });
// 장면 하나 = 출발 자리 + (sim, put)으로 입력을 만드는 함수. put(입력)은 한 걸음을 돌리고 그 입력을 목록에 적는다
function make(pos, fn) { const sim = makeSim(rig, makeWorld(), clips), list = []; sim.reset({ pos, yaw: Math.PI }); sim.opt.wallRest = false; sim.opt.footAssist = false; const put = (inp = {}, cmd = []) => { const x = { mx: 0, mz: 0, cxSign: 1, ...inp, cmd }; list.push(x); sim.step(x); }; const rep = (n, inp, cmd) => { for (let i = 0; i < n; i++) put(inp, i ? [] : cmd); }; fn(sim, put, rep); return list; }
const hangB = (rep) => { rep(60); rep(1, { jump: true }, [hand(0, B.L), hand(1, B.R)]); rep(59, { jump: true }); rep(330); }, D = [1.0, 2.48, -2.86], cut = [rel('foot', 0), rel('foot', 1)];
const pump = (sim, put, n, anti = false) => { for (let k = 0; k < n; k++) { const vx = sim.body.vel.x, c = vx > 0.003 ? 1 : vx < -0.003 ? -1 : 1; put({ cx: anti ? -c : c }); } };
const toLeftEnd = (sim, put) => { let last = sim.body.vel.x, k = 0; while (k++ < 400) { put({ cx: sim.body.vel.x > 0 ? 1 : -1 }); const v = sim.body.vel.x; if (last < 0 && v >= 0) break; last = v; } };
const A = { L: [-1.1, 1.92, -2.84], R: [-0.7, 1.92, -2.84] }, F = [-0.3, 2.15, -2.86], foot = (i, p) => ({ type: 'foot', i, p }), onA = rep => { rep(60); rep(150, {}, [hand(0, A.L)]); rep(150, {}, [hand(1, A.R)]); };
const SCENES = [
  ['① 발을 고르지 않고(두 발 바닥) W로 당겨 오르며 오른손을 턱 F로 — 닿지 않는다', [-0.9, 0, -2.58], (sim, put, rep) => { onA(rep); rep(240, { cy: 1 }); rep(1, { cy: 1 }, [hand(1, F)]); rep(220, { cy: 1 }); rep(200); }],
  ['② 왼발을 넓은 발판에 올리고 W → 오른손을 턱 F로 — 10cm 모자란다', [-0.9, 0, -2.58], (sim, put, rep) => { onA(rep); rep(260, {}, [foot(0, [-1.32, 0.3, -2.75])]); rep(240, { cy: 1 }); rep(1, { cy: 1 }, [hand(1, F)]); rep(220, { cy: 1 }); rep(200); }],
  ['③ 오른발을 낮은 발판에 올리고 W로 올라서며 오른손을 턱 F로 — 잡는다', [-0.9, 0, -2.58], (sim, put, rep) => { onA(rep); rep(260, {}, [foot(1, [-0.3, 0.5, -2.93])]); rep(240, { cy: 1 }); rep(1, { cy: 1 }, [hand(1, F)]); rep(220, { cy: 1 }); rep(240); }],
  ['④ 뛰어 턱 B에 매달림(발은 벽 가까이, 닿지 않음) → 흔들기 → 두 손 놓기', [0.7, 0, -2.65], (sim, put, rep) => { hangB(rep); pump(sim, put, 420); rep(60); rep(1, {}, [rel('hand', 0), rel('hand', 1)]); rep(240); }],
];
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1120, height: 630 }, recordVideo: { dir: out, size: { width: 1120, height: 630 } } }), pg = await ctx.newPage(), errs = [], info = [];
pg.on('pageerror', e => errs.push(e.message)); await pg.goto('file://' + path.join(HERE, '..', build) + '?noshadow'); await pg.waitForTimeout(1200);
await pg.evaluate(m => { if (m) __p3.setMode(m); document.getElementById('help').style.display = 'none'; __p3.opt({ handMode: 1, footAssist: false, wallRest: false, diag: false, helpAll: false }); }, clip ? 'clip' : '');
for (const [view, yaw, dist] of [['뒤에서', 0.0, 3.9], ['옆에서', Math.PI * 1.5, 3.9]]) for (const [title0, pos, fn] of SCENES.filter((x, i) => !process.env.ONLY || process.env.ONLY.includes(String(i + 1)))) {
  const inputs = make(pos, fn), title = title0 + ' · ' + view;
  await pg.evaluate(([title, pos, inputs, yaw, dist]) => { __p3.reset({ pos, yaw: Math.PI }); __p3.setCam({ yaw, pitch: 0.10, dist, follow: null }); __p3.setBanner(title + ' — 스크립트 입력(사람 손 아님)'); __p3.script(inputs); }, [title, pos, inputs, yaw, dist]);
  const t0 = Date.now(); while (await pg.evaluate(() => __p3.scripting()) && Date.now() - t0 < 120000) await pg.waitForTimeout(200);
  await pg.waitForTimeout(400);
  info.push({ title, 걸음: inputs.length, 끝_자리: await pg.evaluate(() => __p3.body().pos.map(x => +x.toFixed(2))), 기록: await pg.evaluate(() => __p3.climbLog().filter(e => e.type !== 'try' && !(e.auto && e.box === '바닥')).map(e => `${e.t.toFixed(2)}초 ${e.type}${e.name ? ' ' + e.name : ''}${e.box ? ' ' + e.box : ''}${e.why ? ' · ' + e.why : ''}`)) });
}
const vd = pg.video(); await ctx.close(); const name = `w6_${clip ? 'clip' : 'proc'}.webm`; fs.renameSync(await vd.path(), path.join(out, name));
fs.writeFileSync(path.join(out, name.replace('.webm', '.json')), JSON.stringify({ note: '스크립트 입력(사람 손 아님)', build, errs, scenes: info }, null, 1));
await b.close(); console.log(name, errs.length ? errs : '오류 없음'); for (const s of info) console.log(s.title.slice(0, 30), '→', s.기록.filter(x => /grab|reject|push|slip|exit/.test(x)).slice(-3).join(' | ').slice(0, 200));
