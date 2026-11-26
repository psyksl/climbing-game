// 몸의 층·벽 딛기 영상(p3d-0.8.0). 벽 딛기 실험을 켠 설정(손 조작 1 · 발 보조 켬 · 벽 딛기 켬. p3d-0.8.1부터 벽 딛기의 기본값은 끔)으로, 같은 장면을 뒤에서 한 번·옆에서 한 번 찍는다(정상 속도).
// 스크립트 입력(사람 손 아님): 같은 계산 코드(src)로 먼저 돌려 걸음마다의 입력 목록을 만든 뒤 실제 화면 루프에 그대로 넣는다.
// 사용: node test/record_w5.mjs <출력 폴더>   캡처 빌드: BUILD=climb3d_mocap.html MODE=clip
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
function make(pos, fn) { const sim = makeSim(rig, makeWorld(), clips), list = []; sim.reset({ pos, yaw: Math.PI }); sim.opt.wallRest = true; sim.opt.footAssist = true; const put = (inp = {}, cmd = []) => { const x = { mx: 0, mz: 0, cxSign: 1, ...inp, cmd }; list.push(x); sim.step(x); }; const rep = (n, inp, cmd) => { for (let i = 0; i < n; i++) put(inp, i ? [] : cmd); }; fn(sim, put, rep); return list; }
const hangB = (rep) => { rep(60); rep(1, { jump: true }, [hand(0, B.L), hand(1, B.R)]); rep(59, { jump: true }); rep(330); }, D = [1.0, 2.48, -2.86], cut = [rel('foot', 0), rel('foot', 1)];
const pump = (sim, put, n, anti = false) => { for (let k = 0; k < n; k++) { const vx = sim.body.vel.x, c = vx > 0.003 ? 1 : vx < -0.003 ? -1 : 1; put({ cx: anti ? -c : c }); } };
const toLeftEnd = (sim, put) => { let last = sim.body.vel.x, k = 0; while (k++ < 400) { put({ cx: sim.body.vel.x > 0 ? 1 : -1 }); const v = sim.body.vel.x; if (last < 0 && v >= 0) break; last = v; } };
const SCENES = [
  ['① 뛰어 턱 B를 잡으면 발이 벽을 딛는다 → 몸을 왼쪽·오른쪽으로', [0.7, 0, -2.65], (sim, put, rep) => { hangB(rep); rep(120, { cx: -1 }); rep(200, { cx: 1 }); rep(150); }],
  ['② 벽을 디딘 채 당겨 오르며(W) 오른손을 위의 턱 D로 — 뛰지 않는다', [0.7, 0, -2.65], (sim, put, rep) => { hangB(rep); rep(150, { cy: 1 }, [hand(1, D)]); rep(240); }],
  ['③ 벽을 디딘 채 짧게 뛰고(Space 0.07초) 오른손을 턱 D로', [0.7, 0, -2.65], (sim, put, rep) => { hangB(rep); rep(8, { jump: true }); rep(4); rep(1, {}, [hand(1, D)]); rep(300); }],
  ['④ 두 발을 직접 떼고 흔들기(제때 A/D) → 반대로 넣어 멈추기', [0.7, 0, -2.65], (sim, put, rep) => { hangB(rep); rep(60, {}, cut); pump(sim, put, 480); pump(sim, put, 300, true); rep(120); }],
  ['⑤ 발을 뗀 채 매달려 뛰기(Space) — 팔로만', [0.7, 0, -2.65], (sim, put, rep) => { hangB(rep); rep(150, {}, cut); rep(60, { jump: true }); rep(240); }],
  ['⑥ 턱 A를 서서 잡고 당겨 오른다 → 두 손을 놓고 내려선다', [-0.9, 0, -2.58], (sim, put, rep) => { rep(60); rep(150, {}, [hand(0, [-1.1, 1.92, -2.84])]); rep(150, {}, [hand(1, [-0.7, 1.92, -2.84])]); rep(150, { cy: 1 }); rep(300); rep(1, {}, [rel('hand', 0), rel('hand', 1)]); rep(240); }],
];
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1120, height: 630 }, recordVideo: { dir: out, size: { width: 1120, height: 630 } } }), pg = await ctx.newPage(), errs = [], info = [];
pg.on('pageerror', e => errs.push(e.message)); await pg.goto('file://' + path.join(HERE, '..', build) + '?noshadow&world=old'); await pg.waitForTimeout(1200);
await pg.evaluate(m => { if (m) __p3.setMode(m); document.getElementById('help').style.display = 'none'; __p3.opt({ handMode: 1, footAssist: true, wallRest: true, diag: false, helpAll: false }); }, clip ? 'clip' : '');
for (const [view, yaw, dist] of [['뒤에서', 0.0, 3.9], ['옆에서', Math.PI * 1.5, 3.9]]) for (const [title0, pos, fn] of SCENES) {
  const inputs = make(pos, fn), title = title0 + ' · ' + view;
  await pg.evaluate(([title, pos, inputs, yaw, dist]) => { __p3.reset({ pos, yaw: Math.PI }); __p3.setCam({ yaw, pitch: 0.10, dist, follow: null }); __p3.setBanner(title + ' — 스크립트 입력(사람 손 아님)'); __p3.script(inputs); }, [title, pos, inputs, yaw, dist]);
  const t0 = Date.now(); while (await pg.evaluate(() => __p3.scripting()) && Date.now() - t0 < 120000) await pg.waitForTimeout(200);
  await pg.waitForTimeout(400);
  info.push({ title, 걸음: inputs.length, 기록: await pg.evaluate(() => __p3.climbLog().filter(e => e.type !== 'try' && !(e.auto && e.box === '바닥')).map(e => `${e.t.toFixed(2)}초 ${e.type}${e.name ? ' ' + e.name : ''}${e.box ? ' ' + e.box : ''}${e.why ? ' · ' + e.why : ''}`)) });
}
const vd = pg.video(); await ctx.close(); const name = `w5_${clip ? 'clip' : 'proc'}.webm`; fs.renameSync(await vd.path(), path.join(out, name));
fs.writeFileSync(path.join(out, name.replace('.webm', '.json')), JSON.stringify({ note: '스크립트 입력(사람 손 아님)', build, errs, scenes: info }, null, 1));
await b.close(); console.log(name, errs.length ? errs : '오류 없음'); for (const s of info) console.log(s.title.slice(0, 30), '→', s.기록.filter(x => /grab|reject|push|slip|exit/.test(x)).slice(-3).join(' | ').slice(0, 200));
