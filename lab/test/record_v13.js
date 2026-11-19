// v0.13 영상: 과제 4를 떨어지게 한 번, 성공하게 한 번(스크립트 입력, 사람 손 아님) → 알림 기록에 까닭·"바꿀 것"·이륙·성공이 남는 것 → 리플레이(도구가 차트 머리에) → 알림을 눌러 그 시각으로
// → 차트를 왼쪽으로(도구가 두 줄, 기록은 차트 아래) → 다시 아래로 → 차트를 아주 작게 줄이고 줄을 휠로 내려 보기 → 게임 화면 위에서 휠로 확대·축소. 사용: node test/record_v13.js
'use strict';
const { chromium } = require('playwright'), fs = require('fs'), path = require('path');
const url = 'file://' + path.join(__dirname, '..', 'climb_lab.html'), out = path.join(__dirname, '..', 'recordings'), K = 1280 / 960;
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: out, size: { width: 1280, height: 720 } } });
  const pg = await ctx.newPage(), errs = [], wait = ms => pg.waitForTimeout(ms), mv = (x, y, o) => pg.mouse.move(x * K, y * K, o), view = () => pg.evaluate(() => window.__lab.view()), st = () => pg.evaluate(() => ({ p: window.__lab.practice(), c: window.__lab.chart() })); pg.on('pageerror', e => errs.push(e.message));
  // 게임 화면 좌표(960×540 기준) → 지금 화면의 자리(차트 구역이 켜져 있으면 게임 화면이 줄어 있다)
  const g2s = async (x, y) => { const v = await pg.evaluate(() => window.__lab.view()); return [(v.x0 + x * v.s) * K, (v.y0 + y * v.s) * K]; }, gmove = async (x, y, o) => { const q = await g2s(x, y); return pg.mouse.move(q[0], q[1], o); }, gclick = async (x, y, o) => { const q = await g2s(x, y); return pg.mouse.click(q[0], q[1], o); };
  const drag = async (x0, y0, x1, y1) => { await mv(x0, y0, { steps: 10 }); await wait(300); await pg.mouse.down(); await mv(x1, y1, { steps: 24 }); await wait(400); await pg.mouse.up(); await wait(500); };
  const L4 = async hold => { await gmove(575, 218, { steps: 8 }); await wait(300); await gclick(575, 218, { button: 'right' }); await wait(900); await pg.keyboard.down('Space'); await wait(140); await gclick(575, 218); await wait(hold - 140); await pg.keyboard.up('Space'); };
  await pg.goto(url); await wait(700); for (let i = 0; i < 4; i++) { await pg.keyboard.press('KeyO'); await wait(140); }
  await L4(150); await wait(3000); await pg.keyboard.press('KeyR'); await wait(400); await L4(470); await wait(2400);                                // 떨어짐 → 다시 → 성공
  let s = await st(); const h = s.p.hits.find(q => q.id === 'replay'); if (h) { await mv(h.x + h.w / 2, h.y + h.h / 2, { steps: 10 }); await wait(300); await pg.mouse.down(); await wait(60); await pg.mouse.up(); await wait(1800); } // 리플레이
  s = await st(); const lg = s.p.hits.find(q => q.id.startsWith('log@')); if (lg) { await mv(lg.x + 60, lg.y + lg.h / 2, { steps: 10 }); await wait(400); await pg.mouse.down(); await wait(60); await pg.mouse.up(); await wait(900); } // 알림을 눌러 그 시각으로
  await pg.keyboard.press('Space'); await wait(1300); await pg.keyboard.press('Space'); await wait(300);
  let v = await view(); await drag(v.chart.x + 40, v.chart.y + 10, 70, 260); await wait(900);                                                       // 왼쪽으로: 도구 두 줄, 기록은 아래
  v = await view(); await drag(v.chart.x + 40, v.chart.y + 8, 480, 510); await pg.keyboard.press('KeyY'); await wait(400);                           // 다시 아래로, 리플레이 닫기
  v = await view(); await drag(420, v.split.y, 420, 538); s = await st(); await mv(s.c.plot.x + 120, s.c.plot.y + s.c.plot.h / 2, { steps: 6 }); await wait(300); // 아주 작게
  for (let i = 0; i < 3; i++) { await pg.mouse.wheel(0, 100); await wait(350); } for (let i = 0; i < 3; i++) { await pg.mouse.wheel(0, -100); await wait(250); }      // 줄을 내려 보기
  v = await view(); await drag(420, v.split.y, 420, 540 - v.fit); await pg.keyboard.press('KeyR'); await wait(400);
  const q = await g2s(400, 260); await pg.mouse.move(q[0], q[1], { steps: 8 }); await wait(300); for (let i = 0; i < 4; i++) { await pg.mouse.wheel(0, -100); await wait(300); } await wait(600); // 게임 화면 확대
  for (let i = 0; i < 7; i++) { await pg.mouse.wheel(0, 100); await wait(250); } await wait(500); await pg.keyboard.press('KeyZ'); await wait(900);                        // 축소 → 화면 맞춤
  const vd = pg.video(); await ctx.close(); await b.close(); fs.renameSync(await vd.path(), path.join(out, 'v13_tools_log_zoom.webm')); console.log('v13_tools_log_zoom 페이지 오류:', errs.join(';') || '없음');
})();
