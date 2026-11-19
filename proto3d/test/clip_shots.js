// 캡처 모션과 자작 모션을 같은 입력·같은 시점으로 찍어 한 장에 나란히 놓는다(위 줄 = 캡처, 아래 줄 = 자작). 스크립트 입력(사람 손 아님).
// 사용: node test/clip_shots.js <폴더>   (climb3d_mocap.html이 있어야 한다: assets_local/clips.json을 만든 뒤 node build.js)
'use strict';
const { chromium } = require('playwright'), path = require('path'), fs = require('fs');
const file = path.join(__dirname, '..', 'climb3d_mocap.html'), dir = process.argv[2];
if (!fs.existsSync(file)) { console.log('climb3d_mocap.html 없음(캡처 자료가 없는 환경) → 건너뜀'); process.exit(0); }
// [이름, 준비 구간, 찍을 구간들(걸음 수, 입력), 찍는 걸음(준비 뒤부터)]
const SC = [
  ['walk', [[300, { mz: -1 }]], [[400, { mz: -1 }]], [0, 12, 24, 36, 48, 60]],
  ['run', [[300, { mz: -1, run: true }]], [[400, { mz: -1, run: true }]], [0, 8, 16, 24, 32, 40]],
  ['start', [[60, {}]], [[400, { mz: -1 }]], [0, 20, 40, 60, 90, 120]],
  ['stop', [[240, { mz: -1 }]], [[400, {}]], [10, 30, 50, 80, 120, 180]],
  ['crouch', [[60, {}]], [[90, { crouch: true }], [400, { crouch: true, mz: -1 }]], [30, 80, 130, 160, 190, 220]],
  ['jump', [[60, {}]], [[72, { jump: true }], [400, {}]], [40, 70, 92, 110, 135, 160, 185, 230]],
  ['tapjump', [[60, {}]], [[6, { jump: true }], [400, {}]], [4, 16, 28, 40, 55, 75, 100, 140]],
  ['runjump', [[300, { mz: -1, run: true }]], [[8, { mz: -1, run: true, jump: true }], [400, { mz: -1, run: true }]], [6, 20, 32, 44, 56, 68, 84, 110]],
];
const VIEWS = [['side', Math.PI / 2], ['front', Math.PI * 0.86]], only = process.argv[3] ? process.argv[3].split(',') : null;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 400, height: 460 } }), errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + file + '?test&noshadow'); await pg.waitForTimeout(1800); await pg.evaluate(() => { __p3.pause(true); document.getElementById('help').style.display = 'none'; document.getElementById('hud').style.display = 'none'; }); fs.mkdirSync(dir, { recursive: true });
  const sheet = await b.newPage({ viewport: { width: 1300, height: 720 } });
  for (const [name, pre, segs, shots] of SC) { if (only && !only.includes(name)) continue; for (const [view, off] of VIEWS) {
    const cells = { clip: [], proc: [] };
    for (const mode of ['clip', 'proc']) {
      await pg.evaluate(mode => { __p3.setMode(mode); __p3.reset({ pos: [0, 0, 14], yaw: Math.PI }); }, mode);
      for (const [n, inp] of pre) await pg.evaluate(([n, inp]) => { __p3.run(n, { mx: 0, mz: 0, ...inp }); }, [n, inp]);
      let at = 0; const inputAt = k => { let a = 0; for (const [n, inp] of segs) { if (k < a + n) return inp; a += n; } return segs[segs.length - 1][1]; };
      for (const s of shots) { while (at < s) { const inp = inputAt(at); let n = 1; while (at + n < s && inputAt(at + n) === inp) n++; await pg.evaluate(([n, inp]) => { __p3.run(n, { mx: 0, mz: 0, ...inp }); }, [n, inp]); at += n; }
        await pg.evaluate(off => __p3.shot({ off, dist: 3.4, pitch: 0.06, h: 1.0 }), off);
        cells[mode].push((await pg.screenshot({ type: 'jpeg', quality: 80, clip: { x: 100, y: 20, width: 200, height: 420 } })).toString('base64')); }
    }
    const w = Math.floor(1210 / shots.length), row = (m, label) => `<div style="display:flex;align-items:center"><div style="width:60px;font:700 14px sans-serif">${label}</div>${cells[m].map((c, i) => `<div style="position:relative"><img src="data:image/jpeg;base64,${c}" width=${w}><div style="position:absolute;left:4px;top:2px;font:11px sans-serif">${(shots[i] / 120).toFixed(2)}s</div></div>`).join('')}</div>`;
    await sheet.setContent(`<body style="margin:6px;background:#fff"><div style="font:700 15px sans-serif;margin-bottom:4px">${name} · ${view} (스크립트 입력)</div>${row('clip', '캡처')}${row('proc', '자작')}</body>`);
    await sheet.screenshot({ path: path.join(dir, `${name}_${view}.png`), clip: { x: 0, y: 0, width: 1290, height: Math.min(716, 40 + 2 * Math.ceil(w * 2.1)) } });
  } }
  console.log('오류:', errs.join(' | ') || '없음'); await b.close();
})();
