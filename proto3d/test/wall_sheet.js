// 우리 벽 동작을 여러 장면으로 찍어 한 장에 늘어놓는다(스크립트 입력, 사람 손 아님). 캡처 동작의 gallery_sheet.js와 같은 틀·같은 시점이라 나란히 견줄 수 있다.
// 사용: node test/wall_sheet.js <폴더>   (climb3d_mocap.html이 있으면 그것으로, 없으면 climb3d.html로 찍는다)
'use strict';
const { chromium } = require('playwright'), path = require('path'), fs = require('fs');
const P3 = path.join(__dirname, '..'), file = fs.existsSync(path.join(P3, 'climb3d_mocap.html')) ? path.join(P3, 'climb3d_mocap.html') : path.join(P3, 'climb3d.html'), dir = process.argv[2];
if (!dir) { console.log('사용: node test/wall_sheet.js <폴더>'); process.exit(1); }
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 420, height: 480 } }), errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + file + '?test&noshadow'); await pg.waitForTimeout(1800);
  await pg.evaluate(() => { __p3.pause(true); document.getElementById('help').style.display = 'none'; document.getElementById('hud').style.display = 'none';
    const A = { L: [-1.1, 1.92, -2.84], R: [-0.7, 1.92, -2.84] }, B = { L: [0.5, 2.32, -2.86], R: [0.9, 2.32, -2.86] }, h = (i, p) => ({ type: 'hand', i, p });
    window.T = { run: (n, inp = {}) => __p3.run(n, { mx: 0, mz: 0, ...inp }),
      hangB(wait = 400) { __p3.reset({ pos: [0.7, 0, -2.65], yaw: Math.PI }); T.run(30); __p3.cmd(h(0, B.L)); __p3.cmd(h(1, B.R)); T.run(60, { jump: true }); T.run(wait); },
      onA(foot) { __p3.reset({ pos: [-0.9, 0, -2.58], yaw: Math.PI }); T.run(30); __p3.cmd(h(0, A.L)); T.run(150); __p3.cmd(h(1, A.R)); T.run(150); if (foot) { __p3.cmd({ type: 'foot', i: 1, p: [-0.30, 0.5, -2.93] }); T.run(440); } },
      pump(n) { for (let k = 0; k < n; k++) { const vx = __p3.body().vel[0]; T.run(1, { cxSign: 1, cx: vx > 0.003 ? 1 : vx < -0.003 ? -1 : 1 }); } } }; });
  // [파일 이름, 제목, 시점(몸 기준 각도), 준비, 장면 사이에 할 일(없으면 좌우 체중 이동), 벽 딛기 옵션]
  const SC = [
    ['ours_swing_back', '우리: 두 손 매달려 제때 흔들기(4초 키운 뒤 한 주기) · 뒤에서 · 벽 딛기 끔', Math.PI, 'T.hangB(); T.pump(480);', 'T.pump(28)', false],
    ['ours_swing_side', '우리: 같은 흔들기 · 옆에서 · 벽 딛기 끔', Math.PI / 2, 'T.hangB(); T.pump(480);', 'T.pump(28)', false],
    ['ours_hangjump_side', '우리: 매달린 채 뛰기(Space) · 옆에서 · 벽 딛기 끔', Math.PI / 2, 'T.hangB();', 'T.run(13, { jump: true })', false],
    ['ours_braced_side', '우리: 뛰어 잡은 뒤 벽을 딛기까지(0.3초 간격) · 옆에서 · 벽 딛기 켬', Math.PI / 2, 'T.hangB(60);', 'T.run(36)', true],
    ['ours_bracedjump_side', '우리: 벽을 디딘 채 뛰기(Space) · 옆에서 · 벽 딛기 켬', Math.PI / 2, 'T.hangB();', 'T.run(9, { jump: true })', true],
    ['ours_bracedshift_back', '우리: 벽을 디딘 채 몸 왼쪽 1초 → 오른쪽 1초 · 뒤에서 · 벽 딛기 켬', Math.PI, 'T.hangB();', null, true],
    ['ours_footjump_side', '우리: 발판을 디디고 뛰기 · 옆에서', Math.PI / 2, 'T.onA(true);', 'T.run(13, { jump: true })', false],
    ['ours_shift_back', '우리: 두 발 바닥·두 손 턱에서 몸 왼쪽 1초 → 오른쪽 1초 · 뒤에서', Math.PI, 'T.onA(false);', null, false],
    ['ours_reach_back', '우리: 벽을 디딘 채 오른손을 25cm 오른쪽으로 옮겨 잡기(0.075초 간격) · 뒤에서 · 벽 딛기 켬', Math.PI, 'T.hangB(); __p3.cmd({ type: "hand", i: 1, p: [1.17, 2.32, -2.86] });', 'T.run(9)', true],
    ['ours_standup_back', '우리: 오른발을 낮은 발판에 올린 뒤 W로 올라서며 오른손을 턱 F로(0.33초 간격) · 뒤에서 · 수동 발', Math.PI, 'T.onA(false); __p3.cmd({ type: "foot", i: 1, p: [-0.3, 0.5, -2.93] }); T.run(260);', '__p3.T9 = (__p3.T9 || 0) + 1; if (__p3.T9 === 6) __p3.cmd({ type: "hand", i: 1, p: [-0.3, 2.15, -2.86] }); T.run(40, { cy: 1 })', false],
    ['ours_standup_side', '우리: 같은 장면 · 옆에서(반대쪽)', -Math.PI / 2, '__p3.T9 = 0; T.onA(false); __p3.cmd({ type: "foot", i: 1, p: [-0.3, 0.5, -2.93] }); T.run(260);', '__p3.T9 = (__p3.T9 || 0) + 1; if (__p3.T9 === 6) __p3.cmd({ type: "hand", i: 1, p: [-0.3, 2.15, -2.86] }); T.run(40, { cy: 1 })', false],
    ['ours_hang_side', '우리: 뛰어 턱 B에 매달림(발은 벽 가까이, 닿지 않음. 0.3초 간격) · 옆에서 · 기본 설정', Math.PI / 2, 'T.hangB(40);', 'T.run(36)', false],
    ['ours_fall_side', '우리: 두 손을 놓고 떨어져 내려섬(0.125초 간격) · 옆에서(반대쪽)', -Math.PI / 2, 'T.hangB(); __p3.cmd({ type: "release", limb: "hand", i: 0 }); __p3.cmd({ type: "release", limb: "hand", i: 1 });', 'T.run(15)', false],
  ];
  fs.mkdirSync(dir, { recursive: true }); const sheet = await b.newPage({ viewport: { width: 1240, height: 330 } }), N = 8;
  for (const [id, title, off, setup, stepJs, rest] of SC) { const cells = []; await pg.evaluate(([s, rest]) => { __p3.opt({ wallRest: rest, footAssist: false, handMode: 1 }); (0, eval)(s); }, [setup, rest]);
    for (let i = 0; i < N; i++) { if (i) await pg.evaluate(([s, i]) => { if (s) (0, eval)(s); else T.run(34, { cxSign: 1, cx: i <= 3 ? -1 : 1 }); }, [stepJs, i]);
      await pg.evaluate(off => __p3.shot({ off, dist: 3.6, pitch: 0.05, h: 1.0 }), off); await pg.waitForTimeout(120);
      cells.push((await pg.screenshot({ type: 'jpeg', quality: 78, clip: { x: 110, y: 60, width: 200, height: 380 } })).toString('base64')); }
    await sheet.setContent(`<body style="margin:4px;background:#fff"><div style="font:700 14px sans-serif">${title} (스크립트 입력)</div><div style="display:flex">${cells.map(im => `<img src="data:image/jpeg;base64,${im}" width=152>`).join('')}</div></body>`);
    await sheet.screenshot({ path: path.join(dir, id + '.png'), clip: { x: 0, y: 0, width: 1228, height: 312 } }); }
  console.log('오류:', errs.join(' | ') || '없음'); await b.close();
})();
