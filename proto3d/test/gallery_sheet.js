// 동작 보기 자료에서 동작 하나를 여러 장면으로 찍어 한 장에 늘어놓는다(옮긴 자세 그대로. 스크립트가 찍음).
// 사용: node test/gallery_sheet.js <폴더> <off 각도(도), 기본 90 = 옆> <동작 이름> [동작 이름 …]   (climb3d_mocap.html과 동작 보기 자료가 있어야 한다)
'use strict';
const { chromium } = require('playwright'), path = require('path'), fs = require('fs');
const file = path.join(__dirname, '..', 'climb3d_mocap.html'), [dir, offDeg, ...names] = process.argv.slice(2);
if (!fs.existsSync(file)) { console.log('climb3d_mocap.html 없음 → 건너뜀'); process.exit(0); }
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 420, height: 480 } }), errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + file + '?test&noshadow'); await pg.waitForTimeout(1800);
  await pg.evaluate(() => { __p3.pause(true); __p3.reset({ pos: [-14, 0, 14], yaw: Math.PI / 2 }); document.getElementById('help').style.display = 'none'; document.getElementById('hud').style.display = 'none'; });
  const list = await pg.evaluate(() => __p3.galleryList()); if (!list) { console.log('동작 보기 자료 없음'); await b.close(); return; }
  fs.mkdirSync(dir, { recursive: true }); const sheet = await b.newPage({ viewport: { width: 1240, height: 330 } }), N = 8;
  for (const name of names) { const c = list.find(x => x.name === name); if (!c) { console.log('없는 동작:', name); continue; }
    const cells = [];
    for (let i = 0; i < N; i++) { const t = c.dur * i / (N - 1); await pg.evaluate(([n, t, off]) => __p3.gallery(n, t, { off, dist: 3.6, pitch: 0.05, up: 0.0 }), [name, t, +offDeg * Math.PI / 180]); await pg.waitForTimeout(120);
      cells.push([t, (await pg.screenshot({ type: 'jpeg', quality: 78, clip: { x: 110, y: 60, width: 200, height: 380 } })).toString('base64')]); }
    await sheet.setContent(`<body style="margin:4px;background:#fff"><div style="font:700 14px sans-serif">${name} · ${c.cat} · ${c.dur.toFixed(2)}초 (옮긴 자세 그대로, 시점은 엉덩이를 따라감)</div><div style="display:flex">${cells.map(([t, im]) => `<div style="position:relative"><img src="data:image/jpeg;base64,${im}" width=152><div style="position:absolute;left:3px;top:1px;font:11px sans-serif">${t.toFixed(2)}s</div></div>`).join('')}</div></body>`);
    await sheet.screenshot({ path: path.join(dir, name.replace(/[^\w()]+/g, '_') + '.png'), clip: { x: 0, y: 0, width: 1228, height: 312 } }); }
  console.log('오류:', errs.join(' | ') || '없음'); await b.close();
})();
