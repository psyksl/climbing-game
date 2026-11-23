// 뻗는 손을 가까이서 계산 걸음마다 찍어 한 장에 늘어놓는다(p3d-0.11.6, 사용자 "손목·손등·손가락이 뒤집히고 난리"). 스크립트 입력(사람 손 아님).
// 다른 뼈를 가운데로: BONE=upperArm.L (p3d-0.11.6 뒤 Blender 어깨 무게 비교에서 씀)
// 사용: node test/hand_closeup.mjs <출력.png> <장면 id> <L|R> <시작 초> <끝 초> [간격 걸음=3]   비교 스위치: GLOB=OLDPALM,OLDFINGAV   캡처 동작: MODE=clip
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url'; import { createRequire } from 'module';
const HERE = path.dirname(fileURLToPath(import.meta.url)), require = createRequire(import.meta.url), { chromium } = require('playwright');
const SC = await import('./scenes_foot.mjs');
const [outPng, id, side, t0s, t1s, everyS] = process.argv.slice(2), t0 = +t0s, t1 = +t1s, every = +(everyS || 3), clip = process.env.MODE === 'clip';
const list = [...SC.SCENES_FOOT.map((s, i) => ['foot' + (i + 1), ...s]), ...SC.SCENES.map((s, i) => ['reach' + (i + 1), ...s]), ...SC.SCENES_H.map(s => [s[0].split(' ')[0], ...s]), ...SC.SCENES_V115.map(s => [s[0].split(' ')[0], ...s]), ...SC.SCENES_U.map(s => [s[0].split(' ')[0], ...s]), ...(SC.SCENES_GW || []).map(s => [s[0].split(' ')[0], ...s])], sc = list.find(s => s[0] === id);
const [, title, fn, assist, mode, st0] = sc, inputs = [], put = (inp = {}, cmd = []) => inputs.push({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd }), rep = (n, inp, cmd) => { for (let i = 0; i < n; i++) put(inp, i ? [] : cmd); };
// p3d-0.11.7: 진행 중의 상태를 보고 입력을 정하는 장면(swingThen 등)은 node 쪽 시뮬레이션을 함께 돌리며 입력을 만든다(dense_strip.mjs와 같다)
if (/\bsim\.|swingThen/.test(fn.toString())) { const imp = f => import(new URL('../src/' + f, import.meta.url).href), { buildCharacter } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js');
  const sim = makeSim(buildCharacter(), makeWorld(), clip ? JSON.parse(fs.readFileSync(path.join(HERE, '../assets_local/clips.json'), 'utf8')) : null); sim.reset({ pos: st0 || SC.START, yaw: Math.PI }); sim.opt.wallRest = false; sim.opt.footAssist = !!assist; sim.opt.grabAssist = true; sim.opt.posture = 'fb'; sim.opt.handMode = mode || 1;
  const putL = (inp = {}, cmd = []) => { const x = { mx: 0, mz: 0, cxSign: 1, ...inp, cmd }; inputs.push(x); sim.step(x); }; fn(sim, putL, (n, inp, cmd) => { for (let i = 0; i < n; i++) putL(inp, i ? [] : cmd); }); }
else fn(null, put, rep);
const build = path.join(HERE, '..', clip ? 'climb3d_mocap.html' : 'climb3d.html');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const pg = await b.newPage({ viewport: { width: 300, height: 300 } }), errs = []; pg.on('pageerror', e => errs.push(e.message)); if (process.env.GLOB) await pg.addInitScript(g => { for (const k of g.split(',')) globalThis[k] = 1; }, process.env.GLOB);
await pg.goto('file://' + build + '?test&noshadow'); await pg.waitForTimeout(1800);
const ver = await pg.evaluate(m => { __p3.pause(true); if (m) __p3.setMode(m); for (const i of ['help', 'hud']) document.getElementById(i).style.display = 'none'; return __p3.VERSION; }, clip ? 'clip' : '');
await pg.evaluate(([st, assist, mode]) => { __p3.opt({ handMode: mode || 1, footAssist: !!assist, wallRest: false, diag: false }); __p3.reset({ pos: st, yaw: Math.PI }); }, [st0 || SC.START, assist, mode]);
const k0 = Math.round(t0 * 120), k1 = Math.round(t1 * 120); await pg.evaluate(([part]) => { for (const x of part) { for (const c of x.cmd || []) __p3.cmd(c); __p3.run(1, x); } }, [inputs.slice(0, k0)]);
const rows = { 뒤: [], 옆: [] };
for (let k = k0; k <= Math.min(k1, inputs.length - 1); k += every) {
  if (k > k0) await pg.evaluate(([part]) => { for (const x of part) { for (const c of x.cmd || []) __p3.cmd(c); __p3.run(1, x); } }, [inputs.slice(k - every, k)]);
  for (const [nm, off] of [['뒤', Math.PI], ['옆', -Math.PI / 2]]) { await pg.evaluate(([off, side, BONE, DIST]) => { const e = __p3.rig.bones[BONE || ('hand.' + side)].matrixWorld.elements; __p3.shot({ off: off + Math.PI - __p3.body().yaw, dist: DIST, pitch: 0.05, at: [e[12], e[13] - 0.05, e[14]] }); }, [off, side, process.env.BONE || '', +(process.env.DIST || 0.75)]);
    rows[nm].push([(await pg.screenshot({ type: 'jpeg', quality: 85 })).toString('base64'), ((k + 1) / 120).toFixed(3)]); }
}
const sheet = await b.newPage({ viewport: { width: 1500, height: 900 } }), n = rows.뒤.length, cols = Math.min(n, 12), w = Math.floor(1480 / cols);
await sheet.setContent(`<body style="margin:4px;background:#fff;font:12px sans-serif"><div style="font:700 14px sans-serif">${ver}${clip ? ' 캡처' : ''}${process.env.GLOB ? ' [' + process.env.GLOB + ']' : ''} · ${id} ${side}손 가까이 · ${t0}~${t1}초 ${every}걸음마다 (스크립트 입력, 사람 손 아님)</div>${Object.entries(rows).map(([nm, cs]) => `<div>${nm}에서</div><div style="display:flex;flex-wrap:wrap">${cs.map(([im, t]) => `<div style="position:relative;width:${w}px"><img style="width:${w - 2}px" src="data:image/jpeg;base64,${im}"><span style="position:absolute;left:2px;top:2px;background:#fff">${t}</span></div>`).join('')}</div>`).join('')}</body>`);
const h = await sheet.evaluate(() => document.body.scrollHeight + 8); await sheet.setViewportSize({ width: 1500, height: h }); await sheet.screenshot({ path: outPng });
console.log(ver, n, '장', errs.length ? '오류: ' + errs.join(' / ') : '오류 없음'); await b.close();
