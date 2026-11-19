// W1.1 가까운 영상: 걷기→달리기→멈춤, 급히 뒤로 돌기, 웅크림→모으기→점프→착지. 실제 화면 루프에 입력을 넣는다(스크립트 입력 = 사람 손 아님).
// 영상 세 개: near = 비스듬한 앞 가까이(실제 속도), side = 옆(실제 속도), side_slow = 옆(0.25배 느리게, 화면 왼쪽 위에 "느리게 ×0.25" 표시)
// 사용: node test/record_w11.js
'use strict';
const { chromium } = require('playwright'), fs = require('fs'), path = require('path');
const url = 'file://' + path.join(__dirname, '..', 'climb3d.html') + '?noshadow', out = path.join(__dirname, '..', 'recordings');
const SCENES = [
  ['걷기→달리기→멈춤', [[1500, { f: 1 }], [2000, { f: 1, run: 1 }], [1600, {}]]],
  ['급히 뒤로 돌기', [[1200, { f: 1 }], [1600, { f: -1 }], [1200, {}]]],
  ['웅크림→모으기→점프→착지', [[900, { crouch: 1 }], [650, { jump: 1 }], [1800, {}]]],
];
const VIEWS = [['near', { followOff: 0.75, dist: 2.3, pitch: 0.12 }, 1], ['side', { followOff: Math.PI / 2, dist: 3.0, pitch: 0.08 }, 1], ['side_slow', { followOff: Math.PI / 2, dist: 3.0, pitch: 0.08 }, 4]];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }), info = {};
  for (const [vname, cam, slowK] of VIEWS) {
    const ctx = await b.newContext({ viewport: { width: 960, height: 540 }, recordVideo: { dir: out, size: { width: 960, height: 540 } } }), pg = await ctx.newPage(), errs = [];
    pg.on('pageerror', e => errs.push(e.message)); await pg.goto(url); await pg.waitForTimeout(1200);
    if (slowK > 1) { await pg.keyboard.press('KeyN'); await pg.waitForTimeout(100); }
    info[vname] = [];
    for (const [title, segs] of SCENES) {
      await pg.evaluate(([title, cam]) => { __p3.reset({ pos: [0, 0, 6], yaw: 0 }); __p3.setCam({ follow: true, yaw: cam.followOff, ...cam }); __p3.setOverride({ mx: 0, mz: 0 }); __p3.setBanner(title); }, [title, cam]);
      await pg.waitForTimeout(700 * slowK);
      for (const [ms, a] of segs) { await pg.evaluate(a => __p3.setOverride({ mx: 0, mz: a.f || 0, run: !!a.run, crouch: !!a.crouch, jump: !!a.jump }), a); await pg.waitForTimeout(ms * slowK); }
      info[vname].push({ title, fps: await pg.evaluate(() => document.getElementById('hud').innerText.match(/(\d+) fps/)?.[1]), slide: await pg.evaluate(() => __p3.stats().stanceMaxDev) });
    }
    await pg.evaluate(() => __p3.setBanner(''));
    const vd = pg.video(); await ctx.close(); fs.renameSync(await vd.path(), path.join(out, `w11_${vname}.webm`)); info[vname].errs = errs;
  }
  await b.close(); console.log(JSON.stringify(info, null, 1));
})();
