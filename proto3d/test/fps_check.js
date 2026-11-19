// 화면 빠르기(FPS)에 따라 계산 결과가 달라지지 않는가(W1.1, GPT 검토 1번). 실제 Chromium에서 빌드의 실제 프레임 함수(frameCore)를 프레임 간격 목록대로 돌린다.
// 같은 계산 걸음(1/120초) 입력을 넣고, 같은 계산 시각의 뼈 자리·발 상태·디딘 자리·몸 자리를 기준(120fps = 한 프레임에 한 걸음)과 견준다.
// 프레임: 30 / 60 / 120 / 144fps, 그리고 7~45ms로 들쭉날쭉한 간격(고정 씨앗). 스크립트 입력(사람 손 아님). GPU 성능 측정이 아니다.
// 사용: node test/fps_check.js [JSON 출력]
'use strict';
const { chromium } = require('playwright'), path = require('path'), fs = require('fs');
const url = 'file://' + path.join(__dirname, '..', 'climb3d.html') + '?test&noshadow';
// 입력: GPT 재현 도구와 같은 짜임(걷기 → 달리기 → 돌며 걷기 → 웅크리기 → 점프)
const N = 1100, inputs = [];
for (let k = 0; k < N; k++) inputs.push({ mx: k >= 400 && k < 660 ? Math.sin((k - 400) / 80) : 0, mz: k < 660 ? Math.cos(k >= 400 ? (k - 400) / 80 : 0) : 0, run: k >= 180 && k < 400, crouch: k >= 660 && k < 780, jump: k >= 800 && k < 872 });
let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const sched = { '120': Array(N + 10).fill(1 / 120), '60': Array(N).fill(1 / 60), '30': Array(N).fill(1 / 30), '144': Array(N + 300).fill(1 / 144), '들쭉날쭉': Array.from({ length: N }, () => 0.007 + rnd() * 0.038) };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 640, height: 360 } }), errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(url); await pg.waitForTimeout(1000); await pg.evaluate(() => __p3.pause(true));
  const names = await pg.evaluate(() => __p3.boneNames()), runs = {};
  for (const [k, d] of Object.entries(sched)) { runs[k] = await pg.evaluate(([d, inp]) => { __p3.reset({ pos: [0, 0, 4], yaw: 0 }); return __p3.simFrames(d, inp, 4); }, [d, inputs]); }
  const ref = runs['120'], out = { version: await pg.evaluate(() => __p3.VERSION), N, compare: {} }; let fail = 0;
  for (const [k, a] of Object.entries(runs)) { if (k === '120') continue;
    const byK = new Map(a.map(s => [s.k, s])); let maxBone = 0, where = null, maxRoot = 0, maxPlant = 0, modeMis = 0, n = 0;
    for (const r of ref) { const s = byK.get(r.k); if (!s) continue; n++;
      maxRoot = Math.max(maxRoot, Math.hypot(...s.pos.map((x, i) => x - r.pos[i])));
      s.bones.forEach((p, j) => { const d = Math.hypot(...p.map((x, i) => x - r.bones[j][i])); if (d > maxBone) { maxBone = d; where = { k: r.k, bone: names[j] }; } });
      if (s.modes.join() !== r.modes.join()) modeMis++;
      s.plants.forEach((p, j) => { maxPlant = Math.max(maxPlant, Math.hypot(...p.map((x, i) => x - r.plants[j][i]))); }); }
    out.compare[k] = { 견준_시각: n, 뼈_최대차이_m: maxBone, where, 몸_최대차이_m: maxRoot, 디딘자리_최대차이_m: maxPlant, 발상태_다른_시각: modeMis };
    const ok = n > 200 && maxBone < 1e-9 && maxRoot < 1e-9 && maxPlant < 1e-9 && modeMis === 0; if (!ok) fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${k}fps: 같은 계산 시각 ${n}곳 · 뼈 최대 차이 ${maxBone.toExponential(2)}m${where ? `(${where.bone}, 걸음 ${where.k})` : ''} · 몸 ${maxRoot.toExponential(2)}m · 디딘 자리 ${maxPlant.toExponential(2)}m · 발 상태가 다른 시각 ${modeMis}`); }
  console.log(`페이지 오류: ${errs.join(' | ') || '없음'}`);
  if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
  console.log(`실패 ${fail}`); await b.close(); process.exit(fail ? 1 : 0);
})();
