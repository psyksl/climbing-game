// 동작 보기 영상: 받은 동작 가운데 고른 것들을 이 캐릭터로 옮긴 그대로 차례로 튼다(발 고정·IK 없음. 게임 동작이 아니라 참고 자료).
// 사용: node test/record_gallery.js <출력 폴더> [이름,이름,…]   (climb3d_mocap.html과 동작 보기 자료가 있어야 한다. 영상은 저장소에 넣지 않는다)
'use strict';
const { chromium } = require('playwright'), fs = require('fs'), path = require('path');
const file = path.join(__dirname, '..', 'climb3d_mocap.html'), out = process.argv[2];
if (!fs.existsSync(file)) { console.log('climb3d_mocap.html 없음 → 건너뜀'); process.exit(0); }
const NAMES = process.argv[3] ? process.argv[3].split(',') : ['Hanging Idle', 'Braced Hang Shimmy', 'Left Shimmy', 'Braced Hang Hop Up', 'Braced Hang Hop Right', 'Free Hang Hop Left', 'Climbing Up Wall', 'Climbing Down Wall', 'Idle To Braced Hang', 'Jump To Hang', 'Stand To Freehang', 'Braced Hang To Crouch', 'Freehang Climb', 'Climbing To Top', 'Braced To Free Hang', 'Climbing A Rope', 'Climbing Ladder'];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 960, height: 540 }, recordVideo: { dir: out, size: { width: 960, height: 540 } } }), pg = await ctx.newPage(), errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + file + '?noshadow'); await pg.waitForTimeout(1500);
  const list = await pg.evaluate(() => { document.getElementById('help').style.display = 'none'; __p3.reset({ pos: [-14, 0, 14], yaw: Math.PI / 2 }); return __p3.galleryList(); });
  for (const n of NAMES) { const c = list.find(x => x.name === n); if (!c) { console.log('없는 동작:', n); continue; }
    await pg.evaluate(([n]) => { __p3.gallery(n, 0, { off: 2.2, dist: 4.2, pitch: 0.12 }); __p3.setBanner(`동작 보기(받은 동작을 옮긴 그대로) · ${n}`); }, [n]); await pg.waitForTimeout(Math.min(6000, c.dur * 1000 + 500)); }
  const vd = pg.video(); await ctx.close(); fs.renameSync(await vd.path(), path.join(out, 'gallery_climb.webm')); await b.close(); console.log('오류:', errs.join(' | ') || '없음');
})();
