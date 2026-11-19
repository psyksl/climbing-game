// v0.12 영상: 화면 나누기. 과제 4를 한 번 하고(스크립트 입력, 사람 손 아님) → 결과 화면 → 경계선을 끌어 차트 구역 키우기·줄이기 → 차트 구역을 왼쪽으로 끌어다 놓기(키 안내는 오른쪽으로)
// → 리플레이 → 위로, 오른쪽으로, 다시 아래로 → 키 안내 가리기·보이기. 사용: node test/record_v12.js
'use strict';
const { chromium } = require('playwright'), fs = require('fs'), path = require('path');
const url = 'file://' + path.join(__dirname, '..', 'climb_lab.html'), out = path.join(__dirname, '..', 'recordings'), K = 1280 / 960;
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: out, size: { width: 1280, height: 720 } } });
  const pg = await ctx.newPage(), errs = [], wait = ms => pg.waitForTimeout(ms), mv = (x, y, o) => pg.mouse.move(x * K, y * K, o), view = () => pg.evaluate(() => window.__lab.view()), st = () => pg.evaluate(() => ({ p: window.__lab.practice(), c: window.__lab.chart() })); pg.on('pageerror', e => errs.push(e.message));
  // 게임 화면 좌표(960×540 기준) → 지금 화면의 자리(차트 구역이 켜져 있으면 게임 화면이 줄어 있다)
  const g2s = async (x, y) => { const v = await pg.evaluate(() => window.__lab.view()); return [(v.x0 + x * v.s) * K, (v.y0 + y * v.s) * K]; }, gmove = async (x, y, o) => { const q = await g2s(x, y); return pg.mouse.move(q[0], q[1], o); }, gclick = async (x, y, o) => { const q = await g2s(x, y); return pg.mouse.click(q[0], q[1], o); };
  const drag = async (x0, y0, x1, y1) => { await mv(x0, y0, { steps: 10 }); await wait(350); await pg.mouse.down(); await mv(x1, y1, { steps: 26 }); await wait(450); await pg.mouse.up(); await wait(600); };
  await pg.goto(url); await wait(700); for (let i = 0; i < 4; i++) { await pg.keyboard.press('KeyO'); await wait(140); }
  await gmove(575, 218, { steps: 8 }); await wait(300); await gclick(575, 218, { button: 'right' }); await wait(900);
  await pg.keyboard.down('Space'); await wait(140); await gclick(575, 218); await wait(330); await pg.keyboard.up('Space'); await wait(2400);          // 성공 → 결과 화면
  let v = await view(); await drag(420, v.split.y, 420, v.split.y - 90); v = await view(); await drag(420, v.split.y, 420, 538);                       // 경계선: 키우고 다시 가장 작게
  v = await view(); await drag(v.chart.x + 40, v.chart.y + 10, 70, 260);                                                                             // 왼쪽으로 끌어다 놓기
  let s = await st(); const h = s.p.hits.find(q => q.id === 'replay'); if (h) { await mv(h.x + h.w / 2, h.y + h.h / 2, { steps: 10 }); await wait(300); await pg.mouse.down(); await wait(60); await pg.mouse.up(); await wait(2200); } // 리플레이
  v = await view(); await drag(v.chart.x + 40, v.chart.y + 10, 480, 30); v = await view(); await drag(v.chart.x + 40, v.chart.y + 10, 900, 260);        // 위로, 오른쪽으로
  v = await view(); await drag(v.chart.x + 40, v.chart.y + 10, 480, 510);                                                                            // 다시 아래로
  await pg.keyboard.press('KeyK'); await wait(900); await pg.keyboard.press('KeyK'); await wait(900);                                               // 키 안내 가리기·보이기
  const vd = pg.video(); await ctx.close(); await b.close(); fs.renameSync(await vd.path(), path.join(out, 'v12_split_layout.webm')); console.log('v12_split_layout 페이지 오류:', errs.join(';') || '없음');
})();
