// 자세 방식 둘(옛 규칙 rule / 전신 자세 풀이 fb)을 같은 장면·같은 순간에 나란히 찍는다(p3d-0.11.0). 개발 쪽이 눈으로 보는 데 쓴다 — 그림은 판정이 아니다. 스크립트 입력(사람 손 아님).
// 열 = 시각, 줄 = [rule 뒤, fb 뒤, rule 옆, fb 옆]. 계산 걸음을 직접 진행하며 멈춰 찍는다(같은 걸음끼리 견준다).
// 사용: node test/pose_sheet.mjs <출력.png> <장면 id(h1, reach3, c1 …)> <시각들: 2.0,2.5,3.0 또는 시작:끝:간격>   방식: MODES=rule,fb   빌드: BUILD=<html>
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const HERE = path.dirname(fileURLToPath(import.meta.url)), require = createRequire(import.meta.url), { chromium } = require('playwright');
const { SCENES_FOOT, SCENES, SCENES_H, SCENES_HV, SCENES_J = [], START } = await import('./scenes_foot.mjs'), { SCENES_C } = await import('./scenes_corner.mjs');
const [outPng, id, ts] = process.argv.slice(2), build = process.env.BUILD ? path.resolve(process.env.BUILD) : path.join(HERE, '..', 'climb3d.html'), modes = (process.env.MODES || 'rule,fb').split(',');
const pad = s => [s[0], s[1], s[2], s[3], s[4], null, 'main'];
const all = [...SCENES_FOOT.map((s, i) => ['foot' + (i + 1), ...pad(s)]), ...SCENES.map((s, i) => ['reach' + (i + 1), ...pad(s)]), ...SCENES_H.map(s => [s[0].split(' ')[0], ...pad(s)]), ...SCENES_HV.map(s => [s[0].split(' ')[0], ...pad(s)]), ...SCENES_J.map(s => [s[0].split(' ')[0], ...pad(s)]), ...SCENES_C.map(s => [...s, 'corner'])];
const sc = all.find(s => s[0] === id); if (!sc) throw new Error('장면 없음: ' + id);
const [, title, fn, assist, mode, st0, yaw0, wname] = sc, inputs = [], put = (inp = {}, cmd = []) => inputs.push({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd }), rep = (n, inp, cmd) => { for (let i = 0; i < n; i++) put(inp, i ? [] : cmd); }; fn(null, put, rep);
const times = ts.includes(':') ? (() => { const [a, b, d] = ts.split(':').map(Number), o = []; for (let t = a; t <= b + 1e-9; t += d) o.push(+t.toFixed(3)); return o; })() : ts.split(',').map(Number);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }), CW = 300, CH = 470;
const rows = [];
for (const [vname, off] of [['뒤', Math.PI], ['옆', -Math.PI / 2]]) for (const m of modes) {
  const pg = await b.newPage({ viewport: { width: 560, height: 560 } }); await pg.goto('file://' + build + '?test&noshadow' + (wname === 'corner' ? '&world=corner' : '')); await pg.waitForTimeout(1500);
  await pg.evaluate(([st, assist, mode, post, y0]) => { __p3.pause(true); for (const i of ['help', 'hud']) document.getElementById(i).style.display = 'none'; __p3.opt({ handMode: mode || 1, footAssist: !!assist, wallRest: false, diag: false }); __p3.posture(post); __p3.reset({ pos: st, yaw: y0 }); __p3.posture(post); }, [st0 || START, assist, mode, m, yaw0 ?? Math.PI]);
  const cells = []; let k = 0;
  for (const t of times) { const k1 = Math.min(inputs.length, Math.round(t * 120)); if (k1 > k) await pg.evaluate(([part]) => { for (const x of part) { for (const c of x.cmd || []) __p3.cmd(c); __p3.run(1, x); } }, [inputs.slice(k, k1)]); k = Math.max(k, k1);
    await pg.evaluate(([off, y0]) => { __p3.shot({ off: off + y0 - __p3.body().yaw, dist: 3.0, pitch: 0.06, h: 1.05 }); }, [off, yaw0 ?? Math.PI]);
    cells.push((await pg.screenshot({ type: 'jpeg', quality: 86, clip: { x: (560 - CW) / 2, y: 60, width: CW, height: CH } })).toString('base64')); }
  rows.push([`${m} · ${vname}`, cells]); await pg.close(); }
const html = `<html><body style="margin:0;font:13px sans-serif;background:#fff"><div style="padding:5px"><b>${id}</b> ${title.replace(/</g, '&lt;').slice(0, 90)} — 스크립트 입력(사람 손 아님). 그림은 판정이 아니다</div><table style="border-collapse:collapse"><tr><td></td>${times.map(t => `<td style="text-align:center">${t}초</td>`).join('')}</tr>` +
  rows.map(([n, cells]) => `<tr><td style="padding:3px;white-space:nowrap"><b>${n}</b></td>${cells.map(c => `<td style="padding:1px"><img src="data:image/jpeg;base64,${c}" width=${CW * 0.62}></td>`).join('')}</tr>`).join('') + '</table></body></html>';
const pg2 = await b.newPage({ viewport: { width: 80 + times.length * (CW * 0.62 + 2), height: 300 } }); await pg2.setContent(html); await pg2.screenshot({ path: outPng, fullPage: true }); await b.close(); console.log(outPng, times.length + '열');
