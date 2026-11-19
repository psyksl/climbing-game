// 벽 접촉(W2) 조작 영상: 성공만이 아니라 거부·놓침·떨어짐을 함께 담는다. 스크립트 입력(사람 손 아님) — 계산 걸음마다 정해 둔 입력을 실제 화면 루프로 돌린다.
// 사용: node test/record_w2.js <출력 폴더>   캡처 빌드: BUILD=climb3d_mocap.html MODE=clip (캡처 동작이 담긴 영상은 저장소에 넣지 않는다)
'use strict';
const { chromium } = require('playwright'), fs = require('fs'), path = require('path');
const build = process.env.BUILD || 'climb3d.html', file = path.join(__dirname, '..', build), out = process.argv[2];
if (!fs.existsSync(file)) { console.log(build + ' 없음 → 건너뜀'); process.exit(0); }
const hand = (i, p) => ({ type: 'hand', i, p }), foot = (i, p) => ({ type: 'foot', i, p }), rel = (limb, i) => ({ type: 'release', limb, i });
const A = { L: [-1.1, 1.92, -2.84], R: [-0.7, 1.92, -2.84] }, B = { L: [0.5, 2.32, -2.86], R: [0.9, 2.32, -2.86] };
// 장면 = [제목, 출발 자리, [[걸음 수, 누르고 있는 입력, 첫 걸음의 명령]...]]
const SCENES = [
  ['① 서서 턱 A를 잡고 → 당겨 오르고 → 한 손 놓기 → 다시 잡기 → 두 손 놓기', [-0.9, 0, -2.58], [[60], [150, {}, [hand(0, A.L)]], [140, {}, [hand(1, A.R)]], [330, { cy: 1 }], [120], [240, {}, [rel('hand', 1)]], [160, {}, [hand(1, A.R)]], [200, {}, [rel('hand', 0), rel('hand', 1)]]]],
  ['② 거부되는 시도: 닿지 않는 턱 · 턱이 아닌 벽면', [-0.9, 0, -2.58], [[60], [150, {}, [hand(0, A.L)]], [200, {}, [hand(1, [-0.4, 2.82, -2.86])]], [140, {}, [hand(1, [-0.9, 1.4, -3.0])]], [120, {}, [rel('hand', 0)]]]],
  ['③ 뛰어서 턱 B → 두 손 매달림 → 한 손 → 다시 잡기 → 흔들리다 놓기', [0.7, 0, -2.65], [[60], [72, { jump: true }], [420, {}, [hand(0, B.L), hand(1, B.R)]], [360, {}, [rel('hand', 1)]], [200, {}, [hand(1, B.R)]], [70, {}, [rel('hand', 1)]], [240, {}, [rel('hand', 0)]]]],
  ['④ 늦게 보낸 손은 닿지 않는다(타이밍)', [0.7, 0, -2.65], [[60], [72, { jump: true }], [52], [300, {}, [hand(0, B.L), hand(1, B.R)]]]],
  ['⑤ 두 발을 벽에 대고 버티기 → 두 손을 놓으면 떨어진다(발은 붙지 않는다)', [0.7, 0, -2.65], [[60], [72, { jump: true }], [360, {}, [hand(0, B.L), hand(1, B.R)]], [150, {}, [foot(0, [0.60, 0.85, -3.0])]], [420, {}, [foot(1, [0.80, 0.85, -3.0])]], [260, {}, [rel('hand', 0), rel('hand', 1)]]]],
  ['⑥ 넓은 발판에 올라서기 → 두 손을 놓아도 선다', [-1.07, 0, -2.64], [[60], [150, {}, [hand(0, [-1.42, 1.92, -2.84])]], [150, {}, [hand(1, [-1.10, 1.92, -2.84])]], [110, { cx: -1 }], [120], [200, {}, [foot(0, [-1.45, 0.30, -2.72])]], [100, { cy: 1 }], [240], [300, {}, [rel('hand', 0), rel('hand', 1)]]]],
  ['⑦ 좁은 발판(14cm)에서 두 손을 놓으면 넘어간다', [-0.72, 0, -2.58], [[60], [150, {}, [hand(0, [-0.95, 1.92, -2.84])]], [150, {}, [hand(1, [-0.65, 1.92, -2.84])]], [200, {}, [foot(1, [-0.45, 0.5, -2.93])]], [170, { cy: 1 }], [200], [300, {}, [rel('hand', 0), rel('hand', 1)]]]],
];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1120, height: 630 }, recordVideo: { dir: out, size: { width: 1120, height: 630 } } }), pg = await ctx.newPage(), errs = [], info = [];
  pg.on('pageerror', e => errs.push(e.message)); await pg.goto('file://' + file + '?noshadow'); await pg.waitForTimeout(1200);
  await pg.evaluate(m => { if (m) __p3.setMode(m); document.getElementById('help').style.display = 'none'; }, process.env.MODE || '');
  for (const [title, pos, segs] of SCENES) {
    const inputs = []; for (const [n, held = {}, cmd = []] of segs) for (let i = 0; i < n; i++) inputs.push({ mx: 0, mz: 0, ...held, cmd: i ? [] : cmd });
    await pg.evaluate(([title, pos, inputs]) => { __p3.reset({ pos, yaw: Math.PI }); __p3.setCam({ yaw: 0.35, pitch: 0.10, dist: 3.9, follow: null }); __p3.setBanner(title + ' — 스크립트 입력(사람 손 아님)'); __p3.script(inputs); }, [title, pos, inputs]);
    const t0 = Date.now(); while (await pg.evaluate(() => __p3.scripting()) && Date.now() - t0 < 120000) await pg.waitForTimeout(200);
    await pg.waitForTimeout(500);
    info.push({ title, 걸음: inputs.length, 기록: await pg.evaluate(() => __p3.climbLog().filter(e => e.type !== 'try' && !(e.auto && e.box === '바닥')).map(e => `${e.t.toFixed(2)}초 ${e.type}${e.name ? ' ' + e.name : ''}${e.box ? ' ' + e.box : ''}${e.why ? ' · ' + e.why : ''}`)) });
  }
  const vd = pg.video(); await ctx.close(); const name = `w2_${process.env.MODE === 'clip' ? 'clip' : 'proc'}.webm`; fs.renameSync(await vd.path(), path.join(out, name));
  fs.writeFileSync(path.join(out, name.replace('.webm', '.json')), JSON.stringify({ note: '스크립트 입력(사람 손 아님)', build, errs, scenes: info }, null, 1));
  await b.close(); console.log(name, errs.length ? errs : '오류 없음'); for (const s of info) console.log(s.title, '→', s.기록.slice(-3).join(' | '));
})();
