// 정상 속도 영상: 점프·팔 우회·턱 F(p3d-0.8.3~0.8.4) + 팔 교차 둘(p3d-0.8.5): 웅크린 채 점프, 턱을 돌아 뻗는 팔, 턱 F(발을 고르고 올라서기). 뒤에서 한 번·옆에서 한 번(정상 속도). 수동 발 프로필.
// 스크립트 입력(사람 손 아님): 같은 계산 코드(src)로 먼저 돌려 걸음마다의 입력 목록을 만든 뒤 실제 화면 루프에 그대로 넣는다.
// 사용: node test/record_w7.mjs <출력 폴더>   캡처 빌드: BUILD=climb3d_mocap.html MODE=clip
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
const drag = (i, p) => ({ type: 'hand', i, p, hold: true }), up = i => ({ type: 'handUp', i });
const SCENES = [
  ['① 선 채 점프(길게 누름) — 견줄 기준', [0, 0, 6], (sim, put, rep) => { rep(90); rep(72, { jump: true }); rep(200); }],
  ['② 웅크린 채 점프(길게 누름): 0.09초에 뜬다. 발을 디딘 채 다리가 펴지기 시작해 뜬 뒤에 다 펴진다', [0, 0, 6], (sim, put, rep) => { rep(60); rep(150, { crouch: true }); rep(72, { jump: true }); rep(200); }],
  ['③ 웅크린 채 점프(짧게 누름)', [0, 0, 6], (sim, put, rep) => { rep(60); rep(150, { crouch: true }); rep(6, { jump: true }); rep(200); }],
  ['④ 팔 우회: 왼손으로 턱 A를 잡고 오른손을 턱 바로 위 벽면으로 뻗음(팔이 턱에 걸려 멈춘다) → 턱 아래 → 턱 위 오른쪽으로', [-0.9, 0, -2.58], (sim, put, rep) => { rep(60); rep(150, {}, [hand(0, A.L)]); const P = [[-0.95, 2.05, -3], [-0.78, 1.55, -3], [-0.6, 2.3, -3], [-0.78, 1.55, -3]]; rep(1, { reach: [null, P[0]] }, [drag(1, P[0])]); for (const p of P) rep(150, { reach: [null, p] }); rep(1, {}, [up(1)]); rep(120); }],
  ['⑤ 턱 A → 턱 F: 오른발을 낮은 발판에 올리고 W로 올라서며 오른손을 턱 F로 — 잡는다(p3d-0.8.4: 윗몸이 뻗는 쪽으로 따라간다)', [-0.9, 0, -2.58], (sim, put, rep) => { onA(rep); rep(260, {}, [foot(1, [-0.3, 0.5, -2.93])]); rep(240, { cy: 1 }); rep(1, { cy: 1 }, [hand(1, F)]); rep(220, { cy: 1 }); rep(240); }],
  // p3d-0.8.5: 팔 교차와 몸 앞을 가로지르는 길
  ['⑥ 팔 교차(p3d-0.8.6: 뻗는 팔이 잡은 팔의 벽 쪽으로 돌아 들어간다): 오른손으로 턱 A를 잡고 왼손을 그 15cm 너머로 → 되돌리기 → 23cm 너머로(팔을 거의 다 편 교차)', [-0.9, 0, -2.58], (sim, put, rep) => { rep(60); rep(220, {}, [hand(1, [-0.85, 1.92, -2.84])]); rep(300, {}, [hand(0, [-0.70, 1.92, -2.84])]); rep(240, {}, [hand(0, [-1.15, 1.92, -2.84])]); rep(480, {}, [hand(0, [-0.62, 1.92, -2.84])]); }],
  ['⑦ 턱 A에서 당겨 올라갔다 오른손을 놓고(팔을 다 폄. 발은 바닥을 디딘다 — 공중 매달림이 아니다) 오른손을 왼손 15cm 너머로 — 지금 자세·모델에서는 길을 찾지 못해 손이 멈춘다(왼손은 그대로) → 턱 A 오른쪽으로 다시 잡기', [-0.9, 0, -2.58], (sim, put, rep) => { onA(rep); rep(200, { cy: 1 }); rep(80, {}, [rel('hand', 1)]); rep(320, {}, [hand(1, [-1.25, 1.92, -2.84])]); rep(260, {}, [hand(1, A.R)]); }],
];
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1120, height: 630 }, recordVideo: { dir: out, size: { width: 1120, height: 630 } } }), pg = await ctx.newPage(), errs = [], info = [];
pg.on('pageerror', e => errs.push(e.message)); await pg.goto('file://' + path.join(HERE, '..', build) + '?noshadow&world=old'); await pg.waitForTimeout(1200);
await pg.evaluate(m => { if (m) __p3.setMode(m); document.getElementById('help').style.display = 'none'; __p3.opt({ handMode: 1, footAssist: false, wallRest: false, diag: false, helpAll: false }); }, clip ? 'clip' : '');
for (const [view, yaw, dist] of [['뒤에서', 0.0, 3.9], ['옆에서', Math.PI * 1.5, 3.9]]) for (const [title0, pos, fn] of SCENES.filter((x, i) => !process.env.ONLY || process.env.ONLY.includes(String(i + 1)))) {
  const inputs = make(pos, fn), title = title0 + ' · ' + view;
  await pg.evaluate(([title, pos, inputs, yaw, dist]) => { __p3.reset({ pos, yaw: Math.PI }); __p3.setCam({ yaw, pitch: 0.10, dist, follow: null }); __p3.setBanner(title + ' — 스크립트 입력(사람 손 아님)'); __p3.script(inputs); }, [title, pos, inputs, yaw, dist]);
  const t0 = Date.now(); while (await pg.evaluate(() => __p3.scripting()) && Date.now() - t0 < 120000) await pg.waitForTimeout(200);
  await pg.waitForTimeout(400);
  info.push({ title, 걸음: inputs.length, 끝_자리: await pg.evaluate(() => __p3.body().pos.map(x => +x.toFixed(2))), 기록: await pg.evaluate(() => __p3.climbLog().filter(e => e.type !== 'try' && !(e.auto && e.box === '바닥')).map(e => `${e.t.toFixed(2)}초 ${e.type}${e.name ? ' ' + e.name : ''}${e.box ? ' ' + e.box : ''}${e.why ? ' · ' + e.why : ''}`)) });
}
const vd = pg.video(); await ctx.close(); const name = `w7_${clip ? 'clip' : 'proc'}.webm`; fs.renameSync(await vd.path(), path.join(out, name));
fs.writeFileSync(path.join(out, name.replace('.webm', '.json')), JSON.stringify({ note: '스크립트 입력(사람 손 아님)', build, errs, scenes: info }, null, 1));
await b.close(); console.log(name, errs.length ? errs : '오류 없음'); for (const s of info) console.log(s.title.slice(0, 30), '→', s.기록.filter(x => /grab|reject|push|slip|exit/.test(x)).slice(-3).join(' | ').slice(0, 200));
