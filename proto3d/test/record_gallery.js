// 동작 시연장 영상: 지형이 있는 동작을 지형 종류 순서로 차례로 튼다(캡처를 지형에 맞춰 튼 자동 시연. 물리 판정 없음. 게임 동작이 아니라 준비해 둔 재료).
// 사용: node test/record_gallery.js <출력 폴더> [이름,이름,…]   (climb3d_mocap.html과 동작 보기 자료가 있어야 한다. 영상은 저장소에 넣지 않는다)
'use strict';
const { chromium } = require('playwright'), fs = require('fs'), path = require('path');
const file = path.join(__dirname, '..', 'climb3d_mocap.html'), out = process.argv[2];
if (!fs.existsSync(file)) { console.log('climb3d_mocap.html 없음 → 건너뜀'); process.exit(0); }
// 이름을 주지 않으면: 지형이 있는 동작 전부(좌우를 뒤집은 것 (1)(2)… 는 빼고)를 지형 종류 순서로
const PICK = process.argv[3] ? process.argv[3].split(',') : null, ORDER = ['ledge', 'wall', 'rope', 'ladder', 'stairs', 'narrow'], KO = { ledge: '턱·매달리기', wall: '벽', rope: '밧줄', ladder: '사다리', stairs: '계단', narrow: '좁은 길' };
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 960, height: 540 }, recordVideo: { dir: out, size: { width: 960, height: 540 } } }), pg = await ctx.newPage(), errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + file + '?noshadow'); await pg.waitForTimeout(1500);
  const list = await pg.evaluate(() => { document.getElementById('help').style.display = 'none'; __p3.reset({ pos: [-14, 0, 14], yaw: Math.PI / 2 }); return __p3.galleryList(); });
  const names = PICK || ORDER.flatMap(k => list.filter(c => c.kind === k && !/ \(\d+\)$/.test(c.name)).map(c => c.name));
  for (const n of names) { const c = list.find(x => x.name === n); if (!c) { console.log('없는 동작:', n); continue; }
    await pg.evaluate(([n, k]) => { __p3.gallery(n, 0, { off: 2.36, dist: 4.4, pitch: 0.14 }); __p3.setBanner(`시연(물리 판정 없음) · ${k} · ${n}`); }, [n, KO[c.kind] || '땅']); await pg.waitForTimeout(Math.min(5200, c.dur * 1000 + 450)); }
  console.log('동작', names.length, '개');
  const vd = pg.video(); await ctx.close(); fs.renameSync(await vd.path(), path.join(out, 'demo_stage.webm')); await b.close(); console.log('오류:', errs.join(' | ') || '없음');
})();
