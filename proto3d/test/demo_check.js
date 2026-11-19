// 동작 시연장 점검(스크립트가 틀고 잰다. 사람이 본 결과가 아니다): 동작 보기의 모든 동작에 대해
//  ① 지형 종류별로 지형 조각이 만들어졌는지 ② 잡은 구간 동안 손바닥이 잡는 자리에서 얼마나 떨어져 있는지(붙이기 뒤) ③ 엉덩이가 지형 조각 안으로 들어가지 않는지 ④ 자세 값이 깨지지 않는지
// 사용: node test/demo_check.js [결과 JSON]   (climb3d_mocap.html과 동작 보기 자료가 있어야 한다)
'use strict';
const { chromium } = require('playwright'), path = require('path'), fs = require('fs');
const file = path.join(__dirname, '..', 'climb3d_mocap.html');
if (!fs.existsSync(file)) { console.log('climb3d_mocap.html 없음 → 건너뜀'); process.exit(0); }
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 640, height: 480 } }), errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + file + '?test&noshadow'); await pg.waitForTimeout(1800); await pg.evaluate(() => { __p3.pause(true); __p3.reset({ pos: [-14, 0, 14], yaw: Math.PI / 2 }); });
  const list = await pg.evaluate(() => __p3.galleryList()); if (!list) { console.log('동작 보기 자료 없음 → 건너뜀'); await b.close(); return; }
  const rows = await pg.evaluate(list => list.map(c => { let maxErr = 0, n = 0, bad = false, info = null, inside = 0;
    for (let i = 0; i <= 24; i++) { __p3.gallery(c.name, c.dur * i / 24); info = __p3.galleryInfo(); for (const e of info.palmErr) if (e !== null) { maxErr = Math.max(maxErr, e); n++; } if (info.inside) inside++; const bw = __p3.bonesWorld(); if (Object.values(bw).some(p => p.some(v => !Number.isFinite(v)))) bad = true; }
    return { name: c.name, kind: c.kind, holds: c.holds, pieces: info.pieces, removed: info.removed || 0, grips: info.grips, palmErrMax: maxErr, samples: n, inside, bad }; }), list);
  await pg.evaluate(() => __p3.gallery(null));
  const KO = { ledge: '턱·매달리기', wall: '벽', rope: '밧줄', ladder: '사다리', stairs: '계단', narrow: '좁은 길', ground: '땅' }; let fail = 0;
  const check = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`); if (!c) fail++; };
  for (const k of Object.keys(KO)) { const R = rows.filter(r => r.kind === k); if (!R.length) continue; const withP = R.filter(r => r.pieces > 0), g = R.filter(r => r.grips > 0), err = Math.max(0, ...R.map(r => r.palmErrMax));
    if (k === 'ground') { check(`${KO[k]}: ${R.length}개 — 지형 조각을 놓지 않는다`, withP.length === 0); continue; }
    if (R.some(r => r.removed)) console.log(`      ${KO[k]}: 엉덩이가 지나가서 뺀 조각이 있는 동작: ${R.filter(r => r.removed).map(r => `${r.name}(${r.removed}개)`).join(', ')}`);
    console.log(`      ${KO[k]}: 동작 ${R.length}개 · 지형 조각이 놓인 것 ${withP.length}개 · 손을 붙인 것 ${g.length}개 · 붙인 손바닥과 잡는 자리의 거리 최대 ${(err * 100).toFixed(1)}cm` + (withP.length < R.length ? ` · 조각이 없는 것: ${R.filter(r => !r.pieces).map(r => r.name).join(', ')}` : ''));
    check(`${KO[k]}: 지형 조각이 놓인 동작이 있다`, withP.length > 0, `${withP.length}/${R.length}`);
    check(`${KO[k]}: 붙인 손바닥이 잡는 자리에서 3cm 안(팔이 닿는 한)`, err < 0.03, `최대 ${(err * 100).toFixed(1)}cm` + (err >= 0.03 ? ' · ' + R.filter(r => r.palmErrMax >= 0.03).map(r => `${r.name} ${(r.palmErrMax * 100).toFixed(0)}cm`).join(', ') : '')); }
  { const R = rows.filter(r => r.inside > 0); check('엉덩이가 지형 조각 안으로 들어가는 동작 없음(25곳씩 봄)', R.length === 0, R.map(r => `${r.name} ${r.inside}곳`).join(', ')); }
  check('자세 값이 깨진 동작 없음', !rows.some(r => r.bad), rows.filter(r => r.bad).map(r => r.name).join(', '));
  check('페이지 오류 없음', !errs.length, errs.join(' | '));
  if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ note: '스크립트가 튼 시연을 잰 값(사람이 본 결과 아님). 지형은 동작의 손발 자리에서 만든 것이라 "맞는다"는 것은 물리 판정이 아니다', rows }, null, 1));
  console.log(`실패 ${fail}`); await b.close(); process.exit(fail ? 1 : 0);
})();
