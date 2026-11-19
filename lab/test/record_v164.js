// v0.16.4 영상: 발 입력 한 번 뒤 거부된 디딤의 되풀이(고치기 전) / 두 번 뒤 그만둠(고친 뒤). 스크립트 입력(사람 손 아님).
// 시작 자세 3 → 왼발만 닿는 자리를 겨누고 발 조종 키 + 오른발 입력 한 번 → 1.1초 뒤 키를 떼고 조준점을 멀리 옮긴다 → 7초 동안 본다(로그·상태 칸 보임)
// 사용: node test/record_v164.js [빌드 폴더(기본 = 이 lab)] [영상 이름]
'use strict';
const { chromium } = require('playwright'), fs = require('fs'), path = require('path');
const LAB = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..'), name = process.argv[3] || 'v164_contact_retry';
const url = 'file://' + path.join(LAB, 'climb_lab.html'), out = path.join(__dirname, '..', 'recordings'), K = 1280 / 960;
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: out, size: { width: 1280, height: 720 } } });
  const pg = await ctx.newPage(), errs = [], wait = ms => pg.waitForTimeout(ms), lab = f => pg.evaluate(f); pg.on('pageerror', e => errs.push(e.message));
  const amove = async (x, y, steps = 14) => { const v = await lab(() => window.__lab.view()); await pg.mouse.move((v.x0 + (x - v.ox) * v.s) * K, (v.y0 + (y - v.oy) * v.s) * K, { steps }); };
  await pg.goto(url); await wait(800); await pg.keyboard.press('Digit3'); await wait(1000);
  const spot = await lab(() => { const S = window.__lab.s, reach = CTRL.footReach ? (i, x, y) => CTRL.footReach(S, i, x, y).ok : (i, x, y) => { const C = PH.C, hj = PH.rootPos(S, i), lb = S.limb[i], dx = x - hj.x, dy = y - hj.y; return Math.hypot(dx, dy) <= lb.max * 0.97 && PH.hipAngle((S.p[0].x - S.p[1].x) / C.T, (S.p[0].y - S.p[1].y) / C.T, lb, dx, dy).over <= 0; };
    for (let x = 40; x < 600; x += 4) for (let y = 300; y < 560; y += 4) { const only = (x, y) => { const fa = CTRL.footAim(S, x, y); return fa && reach(2, fa.x, fa.y) && !reach(3, fa.x, fa.y); }; if ([[0, 0], [-3, -3], [3, -3], [-3, 3], [3, 3]].every(([u, w]) => only(x + u, y + w))) return { x, y }; } return null; });
  await amove(spot.x, spot.y); await wait(500); await pg.keyboard.down('ShiftLeft'); await wait(600); await pg.keyboard.press('KeyE'); await wait(1100); await pg.keyboard.up('ShiftLeft'); await wait(300);
  await amove(560, 200, 20); await wait(7000);
  const log = await lab(() => window.__lab.log().items.filter(q => q.kind !== 'sep').map(q => ({ t: q.t, text: q.text, n: q.n || 1 })));
  const vd = pg.video(); await ctx.close(); await b.close(); fs.renameSync(await vd.path(), path.join(out, name + '.webm'));
  console.log(JSON.stringify(log, null, 0)); console.log(name, '페이지 오류:', errs.join(';') || '없음');
})();
