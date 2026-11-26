// 반동·벽에서 뛰기 영상(p3d-0.7.0). 스크립트 입력(사람 손 아님): 흔들기처럼 몸의 움직임에 맞춰 넣는 입력은 같은 계산 코드(src)로 먼저 돌려 걸음마다의 입력 목록을 만든 뒤, 실제 화면 루프에 그대로 넣는다(고정 간격 계산이라 같은 결과).
// 사용: node test/record_w3.mjs <출력 폴더>   캡처 빌드: BUILD=climb3d_mocap.html MODE=clip
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
function make(pos, fn) { const sim = makeSim(rig, makeWorld(), clips), list = []; sim.reset({ pos, yaw: Math.PI }); const put = (inp = {}, cmd = []) => { const x = { mx: 0, mz: 0, cxSign: 1, ...inp, cmd }; list.push(x); sim.step(x); }; const rep = (n, inp, cmd) => { for (let i = 0; i < n; i++) put(inp, i ? [] : cmd); }; fn(sim, put, rep); return list; }
const hangB = (rep) => { rep(60); rep(1, { jump: true }, [hand(0, B.L), hand(1, B.R)]); rep(59, { jump: true }); rep(300); };
const pump = (sim, put, n, anti = false) => { for (let k = 0; k < n; k++) { const vx = sim.body.vel.x, c = vx > 0.003 ? 1 : vx < -0.003 ? -1 : 1; put({ cx: anti ? -c : c }); } };
const toLeftEnd = (sim, put) => { let last = sim.body.vel.x, k = 0; while (k++ < 400) { put({ cx: sim.body.vel.x > 0 ? 1 : -1 }); const v = sim.body.vel.x; if (last < 0 && v >= 0) break; last = v; } };
const SCENES = [
  ['⑩ 반동: 흔들리는 쪽과 같은 때에 A/D → 커짐 / 반대로 → 멈춤', [0.7, 0, -2.65], (sim, put, rep) => { hangB(rep); pump(sim, put, 480); pump(sim, put, 300, true); rep(120); }],
  ['⑪ 흔들어 오른쪽으로 가는 중에 뛰고(Space+D) 오른손을 턱 E로', [0.7, 0, -2.65], (sim, put, rep) => { hangB(rep); pump(sim, put, 336); toLeftEnd(sim, put); rep(40, { cx: 1 }); rep(24, { jump: true, cx: 1 }); rep(1, { jump: true, cx: 1 }, [hand(1, [1.8, 1.90, -2.86]), rel('hand', 0)]); rep(300); }],
  ['⑫ 흔들지 않고 옆으로 뛰면 닿지 않는다', [0.7, 0, -2.65], (sim, put, rep) => { hangB(rep); rep(24, { jump: true, cx: 1 }); rep(1, { jump: true, cx: 1 }, [hand(1, [1.8, 1.90, -2.86]), rel('hand', 0)]); rep(300); }],
  ['⑬ 매달린 채 뛰고(Space) 0.2초 뒤 오른손을 위의 턱 D로', [0.7, 0, -2.65], (sim, put, rep) => { hangB(rep); rep(25, { jump: true }); rep(1, { jump: true }, [hand(1, [1.0, 2.48, -2.86])]); rep(300); }],
  ['⑭ 뛰기와 동시에 손을 보내면 그 손이 끌어 주지 못해 닿지 않는다', [0.7, 0, -2.65], (sim, put, rep) => { hangB(rep); rep(1, { jump: true }, [hand(1, [1.0, 2.48, -2.86])]); rep(300, { jump: true }); }],
  ['⑮ 발판을 디딘 채 뛰기(다리로 밀어 더 높이) → 손을 보내지 않으면 몸이 손을 지나 올라가 놓이고 떨어진다', [-0.9, 0, -2.58], (sim, put, rep) => { rep(60); rep(150, {}, [hand(0, [-1.1, 1.92, -2.84])]); rep(150, {}, [hand(1, [-0.7, 1.92, -2.84])]); rep(200, {}, [{ type: 'foot', i: 1, p: [-0.30, 0.5, -2.93] }]); rep(200); rep(150, { jump: true }); rep(240); }],
];
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1120, height: 630 }, recordVideo: { dir: out, size: { width: 1120, height: 630 } } }), pg = await ctx.newPage(), errs = [], info = [];
pg.on('pageerror', e => errs.push(e.message)); await pg.goto('file://' + path.join(HERE, '..', build) + '?noshadow&world=old'); await pg.waitForTimeout(1200);
await pg.evaluate(m => { if (m) __p3.setMode(m); document.getElementById('help').style.display = 'none'; __p3.opt({ handMode: 1, footAssist: false, diag: false, helpAll: false }); }, clip ? 'clip' : '');
for (const [title, pos, fn] of SCENES) {
  const inputs = make(pos, fn);
  await pg.evaluate(([title, pos, inputs]) => { __p3.reset({ pos, yaw: Math.PI }); __p3.setCam({ yaw: 0.35, pitch: 0.10, dist: 4.2, follow: null }); __p3.setBanner(title + ' — 스크립트 입력(사람 손 아님)'); __p3.script(inputs); }, [title, pos, inputs]);
  const t0 = Date.now(); while (await pg.evaluate(() => __p3.scripting()) && Date.now() - t0 < 120000) await pg.waitForTimeout(200);
  await pg.waitForTimeout(400);
  info.push({ title, 걸음: inputs.length, 기록: await pg.evaluate(() => __p3.climbLog().filter(e => e.type !== 'try' && !(e.auto && e.box === '바닥')).map(e => `${e.t.toFixed(2)}초 ${e.type}${e.name ? ' ' + e.name : ''}${e.box ? ' ' + e.box : ''}${e.why ? ' · ' + e.why : ''}`)) });
}
const vd = pg.video(); await ctx.close(); const name = `w3_${clip ? 'clip' : 'proc'}.webm`; fs.renameSync(await vd.path(), path.join(out, name));
fs.writeFileSync(path.join(out, name.replace('.webm', '.json')), JSON.stringify({ note: '스크립트 입력(사람 손 아님)', build, errs, scenes: info }, null, 1));
await b.close(); console.log(name, errs.length ? errs : '오류 없음'); for (const s of info) console.log(s.title.slice(0, 30), '→', s.기록.filter(x => /grab|reject|push|slip|exit/.test(x)).slice(-3).join(' | ').slice(0, 200));
