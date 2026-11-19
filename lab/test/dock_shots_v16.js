// v0.16.2 화면(GPT 반송용): 차트 구역을 아래·왼쪽·위·오른쪽에 붙이고, 처음 크기와 가장 작은 크기에서 리플레이 화면을 찍는다.
// 장면: 시작 자세 3에서 A/D로 체중 이동 → 리플레이를 열고 가운데로 옮김(무릎·골반은 그 시각의 모양). 스크립트 입력(사람 손 아님). 사용: node test/dock_shots_v16.js <폴더>
'use strict';
const { chromium } = require('playwright'), path = require('path'), fs = require('fs');
const url = 'file://' + path.join(__dirname, '..', 'climb_lab.html'), out = process.argv[2] || path.join(__dirname, '..', 'recordings', 'v16_docks'), K = 1280 / 960;
const LIM = { bottom: 80, top: 80, left: 180, right: 180 }, NAME = { bottom: '아래', left: '왼쪽', top: '위', right: '오른쪽' };
(async () => {
  fs.mkdirSync(out, { recursive: true }); const b = await chromium.launch(), rows = [];
  for (const dock of ['bottom', 'left', 'top', 'right']) for (const small of [false, true]) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }), pg = await ctx.newPage(), errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(url); await pg.waitForTimeout(500);
    await pg.evaluate(([d, sz]) => { const v = JSON.parse(localStorage.getItem('climbLayout_v1') || '{}'); v.dock = d; v.size = v.size || {}; if (sz) v.size[d] = sz; else delete v.size[d]; localStorage.setItem('climbLayout_v1', JSON.stringify(v)); }, [dock, small ? LIM[dock] : null]);
    await pg.reload(); await pg.waitForTimeout(800); await pg.keyboard.press('Digit3'); await pg.waitForTimeout(900);
    await pg.keyboard.down('KeyA'); await pg.waitForTimeout(800); await pg.keyboard.up('KeyA'); await pg.keyboard.down('KeyD'); await pg.waitForTimeout(900); await pg.keyboard.up('KeyD'); await pg.waitForTimeout(300);
    await pg.keyboard.press('KeyY'); await pg.waitForTimeout(400); if (await pg.evaluate(() => window.__lab.practice().rp.playing)) await pg.keyboard.press('Space'); await pg.waitForTimeout(200);
    for (let i = 0; i < 20; i++) { await pg.keyboard.press('ArrowRight'); await pg.waitForTimeout(30); } // 리플레이는 처음에서 열린다 → 1초 지점으로 await pg.waitForTimeout(400);
    const v = await pg.evaluate(() => ({ ...window.__lab.view(), c: window.__lab.chart() })), name = `${NAME[dock]}_${small ? '가장작게' : '처음크기'}`;
    await pg.screenshot({ path: path.join(out, name + '.png') });
    rows.push({ name, dock, size: v.chart && (dock === 'bottom' || dock === 'top' ? v.chart.h : v.chart.w), scale: +v.s.toFixed(3), lane: v.c && v.c.laneH, errs: errs.join(';') || '없음' });
    await ctx.close(); }
  await b.close(); fs.writeFileSync(path.join(out, 'docks.json'), JSON.stringify(rows, null, 1)); for (const r of rows) console.log(`${r.name}: 구역 ${r.size}px · 게임 화면 배율 ${r.scale} · 줄 높이 ${r.lane} · 페이지 오류 ${r.errs}`);
})();
