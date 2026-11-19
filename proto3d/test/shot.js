// 빠른 화면 확인: node test/shot.js <png> [쿼리]
const { chromium } = require('playwright'), path = require('path');
(async () => { const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('file://' + path.join(__dirname, '..', 'climb3d.html') + (process.argv[3] || '?test')); await p.waitForTimeout(2500); await p.screenshot({ path: process.argv[2] }); console.log('오류:', errs.join(' | ') || '없음'); await b.close(); })();
