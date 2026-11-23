// 정해 준 구간을 빠짐없이 찍어 한 장에 늘어놓는다(p3d-0.9.0). motion_scan.mjs가 찾은 사건을 눈으로 확인하는 데 쓴다.
// 영상(초당 25장)이나 0.1초 간격 장면으로는 0.03~0.06초짜리 튐이 한두 장에만 걸리거나 빠진다 → 계산 걸음을 직접 진행하며 1/60초(기본)마다 찍는다.
// 무릎·팔꿈치·손목·발목이 지나간 자리를 점으로 겹쳐 그린다(자취) — 한 장에서 튄 자리가 보인다. 스크립트 입력(사람 손 아님).
// 시점은 세계에 고정한다(p3d-0.10.2: 몸 방향을 따라 돌리면 몸이 45° 돌 때 옆 카메라가 벽에 막혀 몸 안으로 들어갔다)
// 사용: node test/dense_strip.mjs <출력.png> <장면 id(foot3, reach3, h1 …)> <시작 초> <끝 초> [간격 걸음=2]   다른 빌드: BUILD=<html>   캡처 동작: MODE=clip   자세 규칙: POSTURE=base|rule|ref
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const HERE = path.dirname(fileURLToPath(import.meta.url)), require = createRequire(import.meta.url), { chromium } = require('playwright');
const { SCENES_FOOT, SCENES, SCENES_H, SCENES_V115 = [], SCENES_U = [], START } = await import('./scenes_foot.mjs');
const [outPng, id, t0s, t1s, everyS] = process.argv.slice(2); if (!outPng || !id) { console.log('사용: node test/dense_strip.mjs <출력.png> <장면 id> <시작 초> <끝 초> [간격 걸음]'); process.exit(1); }
const t0 = +t0s, t1 = +t1s, every = +(everyS || 2), clip = process.env.MODE === 'clip', build = process.env.BUILD ? path.resolve(process.env.BUILD) : path.join(HERE, '..', process.env.MODE === 'clip' ? 'climb3d_mocap.html' : 'climb3d.html');
const list = [...SCENES_FOOT.map((s, i) => ['foot' + (i + 1), ...s]), ...SCENES.map((s, i) => ['reach' + (i + 1), ...s]), ...SCENES_H.map(s => [s[0].split(' ')[0], ...s]), ...SCENES_V115.map(s => [s[0].split(' ')[0], ...s]), ...SCENES_U.map(s => [s[0].split(' ')[0], ...s])], sc = list.find(s => s[0] === id); if (!sc) throw new Error('장면 없음: ' + id);
const [, title, fn, assist, mode, st0] = sc, inputs = [], put = (inp = {}, cmd = []) => inputs.push({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd }), rep = (n, inp, cmd) => { for (let i = 0; i < n; i++) put(inp, i ? [] : cmd); };
fn(null, put, rep);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const pg = await b.newPage({ viewport: { width: 460, height: 500 } }), errs = []; pg.on('pageerror', e => errs.push(e.message)); if (process.env.GLOB) await pg.addInitScript(g => { for (const k of g.split(',')) globalThis[k] = 1; }, process.env.GLOB); // p3d-0.11.6: 비교 스위치(OLDPALM 등)를 페이지에 켠다
await pg.goto('file://' + build + '?test&noshadow'); await pg.waitForTimeout(1800);
const ver = await pg.evaluate(m => { __p3.pause(true); if (m) __p3.setMode(m); for (const i of ['help', 'hud']) document.getElementById(i).style.display = 'none'; return __p3.VERSION; }, clip ? 'clip' : '');
const rows = [], k0 = Math.round(t0 * 120), k1 = Math.round(t1 * 120);
for (const [vname, off] of [['뒤에서', Math.PI], ['옆에서', -Math.PI / 2]]) {
  await pg.evaluate(([st, assist, mode, post]) => { __p3.opt({ handMode: mode || 1, footAssist: !!assist, wallRest: false, diag: false }); if (post) __p3.posture(post); __p3.reset({ pos: st, yaw: Math.PI }); }, [st0 || START, assist, mode, process.env.POSTURE || '']);
  // 시작 전까지 진행
  await pg.evaluate(([part]) => { for (const x of part) { for (const c of x.cmd || []) __p3.cmd(c); __p3.run(1, x); } }, [inputs.slice(0, k0)]);
  const cells = [], trail = [];
  for (let k = k0; k <= Math.min(k1, inputs.length - 1); k += every) {
    if (k > k0) await pg.evaluate(([part]) => { for (const x of part) { for (const c of x.cmd || []) __p3.cmd(c); __p3.run(1, x); } }, [inputs.slice(k - every, k)]);
    // 지난 자리의 자취: 이번 장면까지의 관절 자리(세계 좌표)를 모아 두고, 이번 시점으로 화면에 옮겨 점으로 그린다
    const info = await pg.evaluate(([off, trail, DIST, CAMH]) => { __p3.shot({ off: off + Math.PI - __p3.body().yaw, dist: DIST, pitch: 0.06, h: CAMH }); const R = __p3.rig, n = ['leg.L', 'leg.R', 'foreArm.L', 'foreArm.R', 'foot.L', 'foot.R', 'hand.L', 'hand.R'], now = n.map(x => { const e = R.bones[x].matrixWorld.elements; return [e[12], e[13], e[14]]; });
      const pts = [...trail, now].map(fr => fr.map(p => __p3.screenOf(p))); return { now, pts, t: __p3.body().t }; }, [off, trail, +(process.env.DIST || 3.3), +(process.env.CAMH || 0.95)]);
    trail.push(info.now);
    await pg.evaluate(pts => { let c = document.getElementById('trailc'); if (!c) { c = document.createElement('canvas'); c.id = 'trailc'; c.width = innerWidth; c.height = innerHeight; c.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none'; document.body.appendChild(c); } const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
      const col = ['#e63946', '#1d70e0', '#f4a261', '#2a9d8f', '#e63946', '#1d70e0', '#f4a261', '#2a9d8f'];
      pts.forEach((fr, i) => fr.forEach((p, j) => { if (j >= 4) return; g.fillStyle = col[j]; g.globalAlpha = 0.25 + 0.75 * (i + 1) / pts.length; g.beginPath(); g.arc(p.x, p.y, i === pts.length - 1 ? 3.5 : 2, 0, 7); g.fill(); }));
      g.globalAlpha = 1; g.font = '13px sans-serif'; g.fillStyle = '#111'; }, info.pts);
    const img = (await pg.screenshot({ type: 'jpeg', quality: 82, clip: { x: 120, y: 40, width: 220, height: 440 } })).toString('base64');
    cells.push([img, ((k + 1) / 120).toFixed(3)]);
  }
  rows.push([vname, cells]);
}
const N = rows[0][1].length, cols = Math.min(N, 15), w = Math.floor(1480 / cols), sheet = await b.newPage({ viewport: { width: 1500, height: 900 } });
await sheet.setContent(`<body style="margin:4px;background:#fff;font:12px sans-serif"><div style="font:700 14px sans-serif">${ver}${clip ? ' 캡처' : ''} · ${id} ${title} · ${t0}~${t1}초를 ${(every / 120).toFixed(4)}초(${every}걸음)마다 빠짐없이 (스크립트 입력, 사람 손 아님)</div><div>점 = 지나간 자리(빨강 왼무릎, 파랑 오른무릎, 주황 왼팔꿈치, 초록 오른팔꿈치. 진할수록 최근)</div>${rows.map(([v, cells]) => `<div style="margin-top:3px">${v}</div><div style="display:flex;flex-wrap:wrap">${cells.map(([im, t]) => `<div style="position:relative"><img src="data:image/jpeg;base64,${im}" width=${w}><div style="position:absolute;left:2px;top:1px;background:#fff;padding:0 2px">${t}</div></div>`).join('')}</div>`).join('')}</body>`);
const h = await sheet.evaluate(() => document.body.scrollHeight + 8); await sheet.setViewportSize({ width: 1500, height: h });
await sheet.screenshot({ path: outPng, clip: { x: 0, y: 0, width: 1492, height: h } });
await b.close(); console.log(ver, N + '장 × 2시점', '오류:', errs.join(' | ') || '없음');
