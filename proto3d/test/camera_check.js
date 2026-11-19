// 카메라 벽 통과(W1.1 → W2 준비, GPT 검토 3-5번): 벽 앞에서 시점을 벽 쪽으로 돌려도 카메라가 벽 안·벽 너머로 가지 않고, 목표(몸)와 카메라 사이에 지형이 없어야 한다.
// 실제 프레임 함수(frameCore)를 돌린다. 스크립트 입력(사람 손 아님). 사용: node test/camera_check.js [JSON 출력]
'use strict';
const { chromium } = require('playwright'), path = require('path'), fs = require('fs');
const url = 'file://' + path.join(__dirname, '..', process.env.BUILD || 'climb3d.html') + '?test&noshadow';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 640, height: 360 } }), errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(url); await pg.waitForTimeout(1000); await pg.evaluate(() => __p3.pause(true));
  let fail = 0; const out = []; const check = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`); if (!c) fail++; out.push({ n, pass: !!c, x }); };
  const idle = Array(240).fill({ mx: 0, mz: 0 });
  for (const [nm, pos, yaw, cy, pitch] of [['벽(면 z=-3) 앞 0.5m, 카메라를 벽 쪽으로', [0, 0, -2.5], 0, Math.PI, 0.25], ['벽 앞, 카메라를 비스듬히 벽 쪽으로', [0.5, 0, -2.6], 0, Math.PI + 0.6, 0.4], ['모서리 벽 옆, 카메라를 모서리 쪽으로', [2.6, 0, -2.0], 0, Math.PI / 2 + 0.3, 0.2], ['열린 곳(막힘 없음)', [0, 0, 6], 0, Math.PI + 0.35, 0.28]]) {
    const r = await pg.evaluate(([pos, yaw, cy, pitch, idle]) => { __p3.reset({ pos, yaw }); __p3.setCam({ yaw: cy, pitch, dist: 4.2, follow: null }); const b0 = __p3.body().pos; __p3.simFrames(Array(240).fill(1 / 60), idle, 1000); return { cam: __p3.cam(), inside: __p3.camInside(), b0, b1: __p3.body().pos }; }, [pos, yaw, cy, pitch, idle]);
    const open = nm.startsWith('열린');
    check(`${nm}: 카메라가 지형 안에 있지 않다`, !r.inside, `카메라 ${r.cam.pos.map(v => v.toFixed(2)).join(', ')}`);
    if (!open) check(`${nm}: 막힘을 알아채고 카메라를 당기거나 올렸다`, r.cam.blocked, `거리 ${r.cam.dist} → ${r.cam.eff.toFixed(2)}m · 카메라 높이 ${r.cam.pos[1].toFixed(2)}m`);
    else check(`${nm}: 막히지 않으면 원래 거리 그대로`, !r.cam.blocked && Math.abs(r.cam.eff - r.cam.dist) < 0.05, `거리 ${r.cam.eff.toFixed(2)}m`);
    const visible = await pg.evaluate(() => { const c = __p3.cam(); return __p3.lineClear(c.target, c.pos); });
    check(`${nm}: 몸(목표)과 카메라 사이에 지형이 없다`, visible);
    check(`${nm}: 카메라만 움직였을 뿐 몸은 그대로다`, Math.hypot(r.b1[0] - r.b0[0], r.b1[2] - r.b0[2]) < 1e-6);
  }
  check('페이지 오류 없음', !errs.length, errs.join(' | '));
  if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
  console.log(`실패 ${fail}`); await b.close(); process.exit(fail ? 1 : 0);
})();
