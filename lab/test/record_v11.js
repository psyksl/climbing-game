// v0.11 영상: 과제 4를 한 번 하고(스크립트 입력, 사람 손 아님) → 결과 화면 → 리플레이 → 멈춤 → 차트의 시간축을 눌러 이동 → 재생. (차트 구역의 크기·자리 바꾸기는 record_v12.js) 사용: node test/record_v11.js
'use strict';
const { chromium } = require('playwright'), fs = require('fs'), path = require('path');
const url = 'file://' + path.join(__dirname, '..', 'climb_lab.html'), out = path.join(__dirname, '..', 'recordings'), K = 1280 / 960;
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: out, size: { width: 1280, height: 720 } } });
  const pg = await ctx.newPage(), errs = [], wait = ms => pg.waitForTimeout(ms), mv = (x, y, o) => pg.mouse.move(x * K, y * K, o), st = () => pg.evaluate(() => ({ p: window.__lab.practice(), c: window.__lab.chart() })); pg.on('pageerror', e => errs.push(e.message));
  // 게임 화면 좌표(960×540 기준) → 지금 화면의 자리(차트 구역이 켜져 있으면 게임 화면이 줄어 있다)
  const g2s = async (x, y) => { const v = await pg.evaluate(() => window.__lab.view()); return [(v.x0 + x * v.s) * K, (v.y0 + y * v.s) * K]; }, gmove = async (x, y, o) => { const q = await g2s(x, y); return pg.mouse.move(q[0], q[1], o); }, gclick = async (x, y, o) => { const q = await g2s(x, y); return pg.mouse.click(q[0], q[1], o); };
  await pg.goto(url); await wait(700); for (let i = 0; i < 4; i++) { await pg.keyboard.press('KeyO'); await wait(140); }
  await gmove(575, 218, { steps: 8 }); await wait(300); await gclick(575, 218, { button: 'right' }); await wait(900);
  await pg.keyboard.down('Space'); await wait(140); await gclick(575, 218); await wait(330); await pg.keyboard.up('Space'); await wait(2400); // 성공 → 결과 화면
  let s = await st(); const h = s.p.hits.find(q => q.id === 'replay'); await mv(h.x + h.w / 2, h.y + h.h / 2, { steps: 10 }); await wait(400); await pg.mouse.down(); await wait(60); await pg.mouse.up(); await wait(1600); // 리플레이 단추
  await pg.keyboard.press('Space'); await wait(500); for (let i = 0; i < 4; i++) { await pg.keyboard.press('ArrowLeft'); await wait(180); }                                                                    // 멈추고 뒤로
  s = await st(); const pl = s.c.plot; await mv(pl.x + pl.w * 0.2, pl.y + pl.h / 2, { steps: 10 }); await wait(300); await pg.mouse.down(); await mv(pl.x + pl.w * 0.5, pl.y + pl.h / 2, { steps: 24 }); await wait(200); await pg.mouse.up(); await wait(400); // 시간축을 끌어 옮기기
  await mv(pl.x + pl.w * 0.28, pl.y + pl.h / 2, { steps: 6 }); await pg.mouse.down(); await wait(60); await pg.mouse.up(); await wait(400); await pg.keyboard.press('Space'); await wait(1800);                      // 누른 곳에서 재생
  await wait(600);
  const v = pg.video(); await ctx.close(); await b.close(); fs.renameSync(await v.path(), path.join(out, 'v11_replay_chart.webm')); console.log('v11_replay_chart 페이지 오류:', errs.join(';') || '없음');
})();
