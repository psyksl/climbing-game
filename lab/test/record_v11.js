// v0.11 영상: 과제 4를 한 번 하고(스크립트 입력, 사람 손 아님) → 결과 화면 → 리플레이 → 멈춤 → 차트의 시간축을 눌러 이동 → 재생 → 차트를 끌어 옮기고 키우기. 사용: node test/record_v11.js
'use strict';
const { chromium } = require('playwright'), fs = require('fs'), path = require('path');
const url = 'file://' + path.join(__dirname, '..', 'climb_lab.html'), out = path.join(__dirname, '..', 'recordings'), K = 1280 / 960;
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: out, size: { width: 1280, height: 720 } } });
  const pg = await ctx.newPage(), errs = [], wait = ms => pg.waitForTimeout(ms), mv = (x, y, o) => pg.mouse.move(x * K, y * K, o), st = () => pg.evaluate(() => ({ p: window.__lab.practice(), c: window.__lab.chart() })); pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(url); await wait(700); for (let i = 0; i < 4; i++) { await pg.keyboard.press('KeyO'); await wait(140); }
  await mv(575, 218, { steps: 8 }); await wait(300); await pg.mouse.click(575 * K, 218 * K, { button: 'right' }); await wait(900);
  await pg.keyboard.down('Space'); await wait(140); await pg.mouse.click(575 * K, 218 * K); await wait(330); await pg.keyboard.up('Space'); await wait(2400); // 성공 → 결과 화면
  let s = await st(); const h = s.p.hits.find(q => q.id === 'replay'); await mv(h.x + h.w / 2, h.y + h.h / 2, { steps: 10 }); await wait(400); await pg.mouse.down(); await wait(60); await pg.mouse.up(); await wait(1600); // 리플레이 단추
  await pg.keyboard.press('Space'); await wait(500); for (let i = 0; i < 4; i++) { await pg.keyboard.press('ArrowLeft'); await wait(180); }                                                                    // 멈추고 뒤로
  s = await st(); const pl = s.c.plot; await mv(pl.x + pl.w * 0.2, pl.y + pl.h / 2, { steps: 10 }); await wait(300); await pg.mouse.down(); await mv(pl.x + pl.w * 0.5, pl.y + pl.h / 2, { steps: 24 }); await wait(200); await pg.mouse.up(); await wait(400); // 시간축을 끌어 옮기기
  await mv(pl.x + pl.w * 0.28, pl.y + pl.h / 2, { steps: 6 }); await pg.mouse.down(); await wait(60); await pg.mouse.up(); await wait(400); await pg.keyboard.press('Space'); await wait(1800);                      // 누른 곳에서 재생
  s = await st(); let r = s.c.rect; await mv(r.x + 80, r.y + 8, { steps: 8 }); await wait(250); await pg.mouse.down(); await mv(r.x - 220, r.y - 150, { steps: 20 }); await wait(150); await pg.mouse.up(); await wait(300); // 차트 옮기기
  s = await st(); r = s.c.rect; await mv(r.x + r.w - 1, r.y + r.h - 1, { steps: 6 }); await wait(250); await pg.mouse.down(); await mv(r.x + r.w + 200, r.y + r.h + 110, { steps: 20 }); await wait(150); await pg.mouse.up(); await wait(500);   // 모서리로 키우기
  await pg.keyboard.press('Space'); await wait(1500);
  s = await st(); const z = s.p.hits.find(q => q.id === 'tl_reset'); if (z) { await mv(z.x + z.w / 2, z.y + z.h / 2, { steps: 6 }); await pg.mouse.down(); await wait(60); await pg.mouse.up(); await wait(500); }                // 제자리(다음 실행에 남지 않게)
  const v = pg.video(); await ctx.close(); await b.close(); fs.renameSync(await v.path(), path.join(out, 'v11_replay_chart.webm')); console.log('v11_replay_chart 페이지 오류:', errs.join(';') || '없음');
})();
