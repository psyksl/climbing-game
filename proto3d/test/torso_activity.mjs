// 몸통이 얼마나 움직이는가(p3d-0.11.0): 같은 입력에서 골반·가슴·어깨(빗장뼈) 뼈가 돈 각의 합과 범위, 손발 결과를 옛 규칙(rule)과 전신 자세 풀이(fb)로 나란히 잰다.
// "굳어 있지 않다"의 숫자일 뿐 자연스러움의 판정이 아니다(판정은 영상과 사람 플레이). 스크립트 입력(사람 손 아님).
// 사용: node test/torso_activity.mjs [JSON]   장면: ONLY=h1,j1,reach3,c1
import { prov, provLine } from './provenance.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const __P = prov(); console.log(provLine(__P));
const HERE = path.dirname(fileURLToPath(import.meta.url)), SRC = path.resolve(HERE, '../src'), imp = f => import(pathToFileURL(path.join(SRC, f)).href);
const THREE = await import('three');
const { buildCharacter } = await imp('rig.js'), W = await imp('world.js'), { makeSim } = await imp('sim.js');
const SC = await import('./scenes_foot.mjs'), { SCENES_C } = await import('./scenes_corner.mjs');
const pad = s => [s[0], s[1], s[2], s[3], s[4], null, 'main'];
const all = [...SC.SCENES_FOOT.map((s, i) => ['foot' + (i + 1), ...pad(s)]), ...SC.SCENES.map((s, i) => ['reach' + (i + 1), ...pad(s)]), ...SC.SCENES_H.map(s => [s[0].split(' ')[0], ...pad(s)]), ...SC.SCENES_HV.map(s => [s[0].split(' ')[0], ...pad(s)]), ...SC.SCENES_J.map(s => [s[0].split(' ')[0], ...pad(s)]), ...SCENES_C.map(s => [...s, 'corner'])];
const ids = (process.env.ONLY || 'h1,h3,reach3,j1,foot3,m1').split(','), out = { scenes: {} }, deg = 180 / Math.PI;
for (const id of ids) { const [, title, fn, assist, , st0, yaw0, wn] = all.find(s => s[0] === id), row = {};
  for (const post of ['rule', 'fb']) { const rig = buildCharacter(), sim = makeSim(rig, wn === 'corner' ? W.makeFixtureWorld() : W.makeWorld(), null); sim.opt.posture = post; sim.reset({ pos: st0 || SC.START, yaw: yaw0 ?? Math.PI }); sim.opt.wallRest = false; sim.opt.footAssist = !!assist; sim.opt.posture = post;
    const inputs = [], put = (inp = {}, cmd = []) => inputs.push({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd }), rep = (n, inp, cmd) => { for (let i = 0; i < n; i++) put(inp, i ? [] : cmd); }; fn(sim, put, rep);
    const prev = {}, trav = { hips: 0, chest: 0, 'shoulder.L': 0, 'shoulder.R': 0 }, peak = { hips: 0, chest: 0 }, ev = []; let ms = Date.now(), on = 0;
    for (let k = 0; k < inputs.length; k++) { sim.step(inputs[k]); rig.root.updateMatrixWorld(true); for (const e of sim.climb.events) if (['grab', 'reject', 'slip', 'exit'].includes(e.type)) ev.push(`${((k + 1) / 120).toFixed(2)} ${e.type}${e.limb ? ' ' + e.limb[0] + e.i : ''}`);
      if (!sim.climb.on) { for (const n in trav) prev[n] = null; continue; } on++;
      for (const n in trav) { const q = rig.bones[n].getWorldQuaternion(new THREE.Quaternion()); if (prev[n]) { const a = prev[n].angleTo(q) * deg; trav[n] += a; if (n in peak) peak[n] = Math.max(peak[n], a * 120); } prev[n] = q; } }
    row[post] = { 벽에_있던_초: +(on / 120).toFixed(1), 돈_각의_합_도: Object.fromEntries(Object.entries(trav).map(([n, v]) => [n, Math.round(v)])), 가장_빠른_회전_도초: Object.fromEntries(Object.entries(peak).map(([n, v]) => [n, Math.round(v)])), 사건: ev, 계산_ms_걸음당: +((Date.now() - ms) / inputs.length).toFixed(2) }; }
  out.scenes[id] = { 제목: title, ...row }; const a = row.rule, b = row.fb;
  console.log(`${id.padEnd(7)} 골반 ${a.돈_각의_합_도.hips}° → ${b.돈_각의_합_도.hips}° · 가슴 ${a.돈_각의_합_도.chest}° → ${b.돈_각의_합_도.chest}° · 빗장뼈 ${a.돈_각의_합_도['shoulder.L'] + a.돈_각의_합_도['shoulder.R']}° → ${b.돈_각의_합_도['shoulder.L'] + b.돈_각의_합_도['shoulder.R']}° · 가장 빠름(가슴) ${a.가장_빠른_회전_도초.chest} → ${b.가장_빠른_회전_도초.chest}°/s · 계산 ${a.계산_ms_걸음당} → ${b.계산_ms_걸음당}ms/걸음 · 사건 ${a.사건.join(',') === b.사건.join(',') ? '같음' : '다름: ' + a.사건.map(x => x.replace(/^[\d.]+ /, '')).join(' ') + ' → ' + b.사건.map(x => x.replace(/^[\d.]+ /, '')).join(' ')}`); }
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ 실행_출처: __P, ...out }, null, 1));
