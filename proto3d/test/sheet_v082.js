// p3d-0.8.2에서 고친 두 장면을 한 장에 늘어놓는다(스크립트 입력, 사람 손 아님): ① 웅크린 채 점프(옆에서) ② 당겨 올라간 자세에서 한 손을 턱 위·아래로 뻗기(옆·뒤에서).
// 사용: node test/sheet_v082.js <폴더>   캡처 빌드: BUILD=climb3d_mocap.html MODE=clip   고치기 전 빌드와 견주려면 BUILD=<옛 빌드의 절대 경로> LABEL=<이름>
// 캡처 빌드로 찍은 그림은 저장소·전달 묶음에 넣지 않는다.
'use strict';
const { chromium } = require('playwright'), path = require('path'), fs = require('fs');
const file = path.resolve(__dirname, '..', process.env.BUILD || 'climb3d.html'), dir = process.argv[2], label = process.env.LABEL || 'p3d-0.8.2', mode = process.env.MODE || '';
if (!dir) { console.log('사용: node test/sheet_v082.js <폴더>'); process.exit(1); }
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 420, height: 480 } }), errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + file + '?test&noshadow'); await pg.waitForTimeout(1800);
  await pg.evaluate(m => { __p3.pause(true); if (m) __p3.setMode(m); document.getElementById('help').style.display = 'none'; document.getElementById('hud').style.display = 'none'; const st = document.createElement('style'); st.textContent = '.tag{display:none!important}'; document.head.appendChild(st);
    const A = { L: [-1.1, 1.92, -2.84], R: [-0.7, 1.92, -2.84] }, h = (i, p) => ({ type: 'hand', i, p });
    window.T = { run: (n, inp = {}) => __p3.run(n, { mx: 0, mz: 0, ...inp }), k: 0,
      up() { __p3.reset({ pos: [-0.9, 0, -2.58], yaw: Math.PI }); T.run(30); __p3.cmd(h(0, A.L)); T.run(150); __p3.cmd(h(1, A.R)); T.run(150); T.run(150, { cy: 1 }); T.k = 0; },
      reach(n) { const pts = [[-0.78, 1.55, -3.0], [-0.78, 2.25, -3.0], [-0.95, 1.5, -3.0], [-0.6, 2.3, -3.0]]; for (let i = 0; i < n; i++, T.k++) { const p = pts[Math.floor(T.k / 60) % pts.length]; if (T.k === 0) __p3.cmd({ type: 'hand', i: 1, p, hold: true }); T.run(1, { cy: 1, reach: [null, p] }); } } }; }, mode);
  // [파일 이름, 제목, 시점, 준비, 장면 사이에 할 일, 따라가는 높이]
  const SC = [
    ['crouch_jump_side', '웅크린 채 점프: 누른 순간부터 0.05초 간격 · 옆에서', Math.PI / 2, '__p3.reset({ pos: [0, 0, 8], yaw: Math.PI }); T.run(30); T.run(150, { crouch: true });', 'T.run(6, { jump: true })', 0.9],
    ['reach_up_side', '당겨 올라간 자세에서 뻗는 오른손의 겨눈 곳을 턱 아래 왼쪽 → 턱 위 오른쪽으로 바꾼 직후(0.025초 간격, 가까이서) · 옆에서(오른쪽)', -Math.PI / 2, 'T.up(); T.reach(196);', 'T.reach(3)', 1.55, 1.5],
    ['reach_up_back', '같은 순간 · 뒤에서', Math.PI, 'T.up(); T.reach(196);', 'T.reach(3)', 1.55, 1.5],
  ];
  fs.mkdirSync(dir, { recursive: true }); const sheet = await b.newPage({ viewport: { width: 1240, height: 330 } }), N = 8;
  for (const [id, title, off, setup, stepJs, hh, dist = 3.2] of SC) { const cells = []; await pg.evaluate(s => { __p3.opt({ wallRest: false, footAssist: false, handMode: 2 }); (0, eval)(s); }, setup);
    for (let i = 0; i < N; i++) { if (i) await pg.evaluate(s => { (0, eval)(s); }, stepJs);
      await pg.evaluate(([off, hh, dist]) => __p3.shot({ off, dist, pitch: 0.05, h: hh }), [off, hh, dist]); await pg.waitForTimeout(120);
      cells.push((await pg.screenshot({ type: 'jpeg', quality: 80, clip: { x: 110, y: 60, width: 200, height: 380 } })).toString('base64')); }
    await sheet.setContent(`<body style="margin:4px;background:#fff"><div style="font:700 14px sans-serif">${label}${mode === 'clip' ? ' · 캡처 모션' : ' · 자작 모션'} — ${title} (스크립트 입력)</div><div style="display:flex">${cells.map(im => `<img src="data:image/jpeg;base64,${im}" width=152>`).join('')}</div></body>`);
    await sheet.screenshot({ path: path.join(dir, id + '.png'), clip: { x: 0, y: 0, width: 1228, height: 312 } }); }
  console.log('오류:', errs.join(' | ') || '없음'); await b.close();
})();
