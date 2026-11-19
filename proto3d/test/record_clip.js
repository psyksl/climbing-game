// 캡처 모션 / 자작 모션 비교 영상: 같은 입력·같은 시점으로 두 모드를 각각 찍는다(스크립트 입력 = 사람 손 아님).
// 사용: node test/record_clip.js <출력 폴더>   (climb3d_mocap.html이 있어야 한다. 캡처 동작이 담긴 영상은 저장소에 넣지 않는다)
'use strict';
const { chromium } = require('playwright'), fs = require('fs'), path = require('path');
const file = path.join(__dirname, '..', 'climb3d_mocap.html'), out = process.argv[2];
if (!fs.existsSync(file)) { console.log('climb3d_mocap.html 없음 → 건너뜀'); process.exit(0); }
const SCENES = [
  ['걷기 → 달리기 → 멈춤', [[2200, { f: 1 }], [2200, { f: 1, run: 1 }], [1600, {}]]],
  ['급히 뒤로 돌기', [[1200, { f: 1 }], [1800, { f: -1 }], [1200, {}]]],
  ['웅크림 → 모으기 → 점프 → 착지', [[900, { crouch: 1 }], [650, { jump: 1 }], [1800, {}]]],
  ['달리다 짧게 점프', [[1500, { f: 1, run: 1 }], [60, { f: 1, run: 1, jump: 1 }], [1500, { f: 1, run: 1 }], [900, {}]]],
  ['웅크리기 → 웅크려 걷기 → 일어서기', [[1200, { crouch: 1 }], [2200, { crouch: 1, f: 1 }], [1200, {}]]],
  ['짧은 점프', [[400, {}], [50, { jump: 1 }], [1500, {}]]],
];
const VIEWS = [['side', { followOff: Math.PI / 2, dist: 3.2, pitch: 0.08 }], ['near', { followOff: 0.75, dist: 2.4, pitch: 0.12 }]];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }), info = {};
  for (const [mode, label] of [['clip', '캡처 동작'], ['proc', '자작 동작']]) for (const [vname, cam] of VIEWS) {
    const ctx = await b.newContext({ viewport: { width: 960, height: 540 }, recordVideo: { dir: out, size: { width: 960, height: 540 } } }), pg = await ctx.newPage(), errs = [];
    pg.on('pageerror', e => errs.push(e.message)); await pg.goto('file://' + file + '?noshadow'); await pg.waitForTimeout(1200);
    await pg.evaluate(m => { __p3.setMode(m); document.getElementById('help').style.display = 'none'; }, mode);
    for (const [title, segs] of SCENES) {
      await pg.evaluate(([title, cam, label]) => { __p3.reset({ pos: [-12, 0, 8], yaw: Math.PI / 2 }); __p3.setCam({ follow: true, yaw: Math.PI / 2 + cam.followOff, ...cam }); __p3.setOverride({ mx: 0, mz: 0 }); __p3.setBanner(`${label} · ${title} (스크립트 입력)`); }, [title, cam, label]);
      await pg.waitForTimeout(700);
      for (const [ms, a] of segs) { await pg.evaluate(a => __p3.setOverride({ mx: a.f || 0, mz: 0, run: !!a.run, crouch: !!a.crouch, jump: !!a.jump }), a); await pg.waitForTimeout(ms); } // 몸이 +x를 보고 시작한다
    }
    const key = `${mode}_${vname}`; info[key] = { fps: await pg.evaluate(() => document.getElementById('hud').innerText.match(/(\d+) fps/)?.[1]), errs };
    const vd = pg.video(); await ctx.close(); fs.renameSync(await vd.path(), path.join(out, `motion_${key}.webm`));
  }
  await b.close(); console.log(JSON.stringify(info));
})();
