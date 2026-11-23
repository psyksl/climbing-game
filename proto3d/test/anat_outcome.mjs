// 관절 범위(p3d-0.11.1)를 켠 것과 끈 것(NOANAT — 0.11.0과 같다)의 장면별 끝 접촉 상태·손발 사건을 견준다. 스크립트 입력(사람 손 아님). 사용: node test/anat_outcome.mjs [JSON]   자세: POSTURE=fb(기본)|rule
import { prov, provLine } from './provenance.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const __P = prov(); console.log(provLine(__P));
const HERE = path.dirname(fileURLToPath(import.meta.url)), SRC = path.resolve(HERE, '../src'), imp = f => import(pathToFileURL(path.join(SRC, f)).href);
const { buildCharacter } = await imp('rig.js'), W = await imp('world.js'), { makeSim } = await imp('sim.js');
const SC = await import('./scenes_foot.mjs'), { SCENES_C } = await import('./scenes_corner.mjs');
const POST = process.env.VARIANT || 'fb', pad = s => [s[0], s[1], s[2], s[3], s[4], null, 'main'];
const all = [...SC.SCENES_FOOT.map((s, i) => ['foot' + (i + 1), ...pad(s)]), ...SC.SCENES.map((s, i) => ['reach' + (i + 1), ...pad(s)]), ...SC.SCENES_H.map(s => [s[0].split(' ')[0], ...pad(s)]), ...SC.SCENES_HV.map(s => [s[0].split(' ')[0], ...pad(s)]), ...SC.SCENES_J.map(s => [s[0].split(' ')[0], ...pad(s)]), ...SCENES_C.map(s => [...s, 'corner'])];
function runScene([id, title, fn, assist, mode, st0, yaw0, wn], off) { globalThis.NOANAT = off ? 1 : undefined; const rig = buildCharacter(), sim = makeSim(rig, wn === 'corner' ? W.makeFixtureWorld() : W.makeWorld(), null); sim.opt.posture = POST; sim.reset({ pos: st0 || SC.START, yaw: yaw0 ?? Math.PI }); sim.opt.wallRest = false; sim.opt.footAssist = !!assist; sim.opt.handMode = mode || 1; sim.opt.posture = POST;
  const inputs = [], put = (inp = {}, cmd = []) => inputs.push({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd }), rep = (n, inp, cmd) => { for (let i = 0; i < n; i++) put(inp, i ? [] : cmd); }; fn(sim, put, rep); const ev = [];
  for (let k = 0; k < inputs.length; k++) { sim.step(inputs[k]); for (const e of sim.climb.events) if (/^(grab|reject|slip|deny)$/.test(e.type) || (e.type === 'lift' && !/옮기려고/.test(e.why || ''))) ev.push(`${e.type} ${e.name || ''}${e.why ? '(' + e.why.replace(/\(.*$/, '') + ')' : ''}`); }
  const K = sim.climb; return { end: K.hands.map(h => (h.st === 'hold' ? h.edge.box.name : h.st)).join(' / ') + ' · ' + K.feet.map(f => (f.st === 'plant' ? f.box.name : f.st)).join(' / '), ev: ev.join(' → '), y: +sim.body.pos.y.toFixed(2) }; }
const out = { 자세: POST, 장면: {} }; let same = 0, diff = 0;
for (const sc of all) { const a = runScene(sc, true), b = runScene(sc, false), eq = a.end === b.end; out.장면[sc[0]] = { 끈_것: a, 켠_것: b, 끝이_같음: eq }; if (eq) same++; else { diff++; console.log(`${sc[0].padEnd(7)} 끔: ${a.end}\n        켬: ${b.end}\n        끔 사건: ${a.ev.slice(0, 260)}\n        켬 사건: ${b.ev.slice(0, 260)}`); } }
console.log(`장면 ${all.length}개: 끝 접촉 상태가 같음 ${same} · 다름 ${diff}`); out.합 = { 같음: same, 다름: diff };
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ 실행_출처: __P, ...out }, null, 1));
