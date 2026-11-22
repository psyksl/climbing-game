// 잡은 손의 확대 그림(p3d-0.10.2, GPT의 0.10.1 검토 5절 "접촉 전후 그림"): 같은 장면·같은 순간을 여러 빌드로 찍어 한 장에 늘어놓는다. 스크립트 입력(사람 손 아님).
// 순간: 잡고 0.1초 · 잡고 0.5초(안정) · 놓은 직후. 시점: 옆 위에서(손가락이 윗면을 덮는지) · 앞 아래에서(손바닥과 앞면). 그림은 판정이 아니다.
// 사용: node test/hand_shots.mjs <출력.png> <장면 id> <손 0|1> "<빌드1.html>[?주소]|이름1" "<빌드2.html>|이름2" ...
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const HERE = path.dirname(fileURLToPath(import.meta.url)), require = createRequire(import.meta.url), { chromium } = require('playwright');
const { SCENES_FOOT, SCENES, SCENES_H, SCENES_HV, START } = await import('./scenes_foot.mjs'), { SCENES_C } = await import('./scenes_corner.mjs'), NTH = +(process.env.NTH || 1); // NTH = 그 손의 몇 번째 잡기를 찍을지(p3d-0.10.4). 다른 벽 시험 지형 장면(c1~c8)은 빌드 주소에 ?world=corner
const [outPng, id, hiS, ...builds] = process.argv.slice(2), hi = +hiS;
const all = [...SCENES_FOOT.map((s, i) => ['foot' + (i + 1), ...s]), ...SCENES.map((s, i) => ['reach' + (i + 1), ...s]), ...SCENES_H.map(s => [s[0].split(' ')[0], ...s]), ...SCENES_HV.map(s => [s[0].split(' ')[0], ...s]), ...SCENES_C], sc = all.find(s => s[0] === id);
const [, title, fn, assist, mode, st0, yaw0] = sc, inputs = [], put = (inp = {}, cmd = []) => inputs.push({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd }), rep = (n, inp, cmd) => { for (let i = 0; i < n; i++) put(inp, i ? [] : cmd); }; fn(null, put, rep);
const b = await chromium.launch(), rows = [];
for (const spec of builds) { const [file, name] = spec.split('|'), [f0, q] = file.split('?');
  const pg = await b.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 }); await pg.goto('file://' + path.resolve(f0) + '?noshadow' + (q ? '&' + q : '')); await pg.waitForTimeout(1200);
  await pg.evaluate(([st, assist, mode, y0]) => { __p3.pause(true); __p3.opt({ handMode: mode || 1, footAssist: !!assist, wallRest: false, diag: false }); __p3.reset({ pos: st, yaw: y0 }); document.getElementById('help').style.display = 'none'; }, [st0 || START, assist, mode, yaw0 ?? Math.PI]);
  // 잡기·놓기 걸음 찾기: 진행하며 사건을 본다
  let k = 0, nG = 0; const marks = [], seenG = new Set(); let grabK = null;
  while (k < inputs.length && marks.length < 3) { const ev = await pg.evaluate(([x, hi]) => { for (const c of x.cmd || []) __p3.cmd(c); __p3.run(1, x); return __p3.climbLog().slice(-4).filter(e => e.limb === 'hand' && e.i === hi).map(e => e.type + ':' + e.t); }, [inputs[k], hi]); k++;
    const g = ev.find(e => e.startsWith('grab')), r = ev.find(e => e.startsWith('release'));
    if (g && !seenG.has(g)) { seenG.add(g); nG++; if (grabK === null && !marks.length && nG === NTH) grabK = k; } if (grabK !== null && k === grabK + 12) marks.push(['잡고 0.1초', k]); if (grabK !== null && k === grabK + 60) marks.push(['잡고 0.5초', k]); if (r && marks.length >= 2 && marks.length < 3 && k > grabK + 60) marks.push(['놓은 직후', k]);
    if (marks.length && marks[marks.length - 1][1] === k) { const shots = [];
      for (const [vn, off, pitch] of [['옆 위', Math.PI / 2 + 0.5, 0.55], ['앞 아래', Math.PI + 0.35, -0.15]]) { const p = await pg.evaluate(([off, pitch, hi]) => { const h = __p3.rig.bones[hi ? 'hand.R' : 'hand.L'].matrixWorld.elements, by = __p3.body().pos[1]; __p3.shot({ off: off + Math.PI - __p3.body().yaw, dist: 0.75, pitch, h: h[13] - by + 0.04 }); const s = __p3.screenOf([h[12], h[13] + 0.04, h[14]]); return [s.x, s.y]; }, [off, pitch, hi]);
        const x = Math.max(0, Math.min(900 - 300, Math.round(p[0] - 150))), y = Math.max(0, Math.min(700 - 300, Math.round(p[1] - 150)));
        shots.push([vn, (await pg.screenshot({ type: 'jpeg', quality: 85, clip: { x, y, width: 300, height: 300 } })).toString('base64')]); }
      rows.push([name, marks[marks.length - 1][0], ((k) / 120).toFixed(3), shots]); } }
  await pg.close(); }
await b.close();
const html = `<html><body style="margin:0;font:13px sans-serif;background:#fff"><div style="padding:6px"><b>${title.replace(/</g, '&lt;')}</b> — ${hi ? '오른손' : '왼손'} 확대(스크립트 입력, 사람 손 아님). 그림은 판정이 아니다.</div><table style="border-collapse:collapse">` +
  rows.map(([n, m, t, s]) => `<tr><td style="padding:4px;width:160px;vertical-align:top"><b>${n}</b><br>${m}<br>${t}초</td>${s.map(([v, img]) => `<td style="padding:2px"><div>${v}</div><img src="data:image/jpeg;base64,${img}" width=300></td>`).join('')}</tr>`).join('') + '</table></body></html>';
const b2 = await chromium.launch(), pg2 = await b2.newPage({ viewport: { width: 820, height: 200 } }); await pg2.setContent(html); await pg2.screenshot({ path: outPng, fullPage: true }); await b2.close(); console.log(outPng, rows.length + '장면');
