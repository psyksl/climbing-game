// 사용자 플레이 영상(0.11.1, 8편 4분 34초)에서 찾은 문제의 점검(p3d-0.11.2). 스크립트 입력(사람 손 아님). 사용: node test/play_fix_check.mjs [JSON]   자세: VARIANT=fb(기본)|rule · 캡처 동작: MODE=clip
// ① 점프하며 잡기: 점프를 누른 때 기준으로 클릭이 언제까지 잡히는가 ② 한 손 매달림에서 다른 손을 바로 옆에 모으기 ③ 옆으로 팽팽하게 당겨지는 잡기는 잡자마자 놓치지 않고 잡기 전에 거부 ④ 발 없이 매달린 다리의 무릎 간격
import { prov, provLine } from './provenance.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const __P = prov(); console.log(provLine(__P));
const HERE = path.dirname(fileURLToPath(import.meta.url)), imp = f => import(pathToFileURL(path.join(HERE, '../src', f)).href);
const THREE = await import('three');
const { buildCharacter } = await imp('rig.js'), W = await imp('world.js'), { makeSim } = await imp('sim.js');
const CLP = path.join(HERE, '../assets_local/clips.json'); if (process.env.MODE === 'clip' && !fs.existsSync(CLP)) { console.log('clips.json 없음 → 건너뜀'); process.exit(0); }
const clips = process.env.MODE === 'clip' ? JSON.parse(fs.readFileSync(CLP, 'utf8')) : null, POST = process.env.VARIANT || 'fb';
const hand = (i, p) => ({ type: 'hand', i, p }), out = { 자세: POST, 동작: clips ? '캡처' : '자작', checks: [], cases: {} }; let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`); out.checks.push({ name, ok, detail }); if (!ok) fail++; };
const mk = pos => { const rig = buildCharacter(), sim = makeSim(rig, W.makeWorld(), clips); sim.opt.posture = POST; sim.reset({ pos, yaw: Math.PI }); sim.opt.posture = POST; sim.opt.footAssist = false; sim.opt.wallRest = false; const ev = [];
  const run = (n, inp = {}, cmd = []) => { for (let k = 0; k < n; k++) { sim.step({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd: k ? [] : cmd }); for (const e of sim.climb.events) if (e.type !== 'try' && e.limb === 'hand') ev.push({ i: e.i, type: e.type, why: e.why || '' }); } }; return { rig, sim, run, ev }; };
// ① 점프하며 잡기(턱 B, 왼손 하나). 점프 0.5초 누름. 클릭 = 점프를 누른 때 기준 −0.4 ~ +0.45초
{ const rows = [];
for (let off = -48; off <= 54; off += 6) { const T = mk([0.62, 0, -2.65]); const j0 = 60, c0 = j0 + off; for (let s = 0; s < 460; s++) T.run(1, { jump: s >= j0 && s < j0 + 60 }, s === c0 ? [hand(0, [0.5, 2.32, -2.86])] : []);
    const g = T.ev.find(e => e.type === 'grab'), r = T.ev.find(e => e.type === 'reject'); rows.push({ 클릭_초: +(off / 120).toFixed(3), 결과: g ? '잡음' : r ? '거부: ' + r.why : '없음' }); }
  const late = rows.filter(r => r.클릭_초 > 0 && r.결과 === '잡음').map(r => r.클릭_초), lastOk = late.length ? Math.max(...late) : 0, firstBad = rows.find(r => r.클릭_초 > lastOk && r.결과 !== '잡음');
  out.cases['점프 잡기 클릭 시각'] = rows; console.log('  ' + rows.map(r => `${r.클릭_초}:${r.결과 === '잡음' ? 'O' : 'X'}`).join(' '));
  check('점프 잡기: 점프를 누르고 0.25초 뒤에 클릭해도 잡히고(0.11.1 자작은 0.2초까지), 앞당겨 누른 클릭(−0.4초)도 잡힌다', rows.filter(r => r.클릭_초 >= -0.4 && r.클릭_초 <= 0.25).every(r => r.결과 === '잡음'), `점프 뒤 ${lastOk}초까지 잡음`);
  check('점프 잡기: 늦은 클릭은 떠 있는 동안 "점프 정점이 지남"으로 거부된다(착지 뒤 "40cm 모자람"이 아니라)', !firstBad || /정점이 지남/.test(firstBad.결과), firstBad ? firstBad.결과 : '늦은 클릭 없음'); }
// ② 손 모으기: 오른손만 뛰어 잡아 턱 B(0.9)에 매달림 → 왼손을 dx 옆에
{ const rows = []; for (const dx of [0.10, 0.12, 0.18, 0.25, 0.35]) { const T = mk([0.62, 0, -2.65]); T.run(30); T.run(1, { jump: true }, [hand(1, [0.9, 2.32, -2.86])]); T.run(59, { jump: true }); T.run(180); const ok0 = T.sim.climb.hands[1].st === 'hold'; T.ev.length = 0; T.run(240, {}, [hand(0, [0.9 - dx, 2.32, -2.86])]);
    const e = T.ev.find(x => x.i === 0 && (x.type === 'grab' || x.type === 'reject')); rows.push({ 간격_cm: Math.round(dx * 100), 앞_조건: ok0, 결과: e ? (e.type === 'grab' ? '잡음' : '거부: ' + e.why) : '없음' }); }
  out.cases['손 모으기'] = rows; console.log('  ' + rows.map(r => `${r.간격_cm}cm:${r.결과}`).join(' · '));
  check('손 모으기: 한 손 매달림에서 다른 손을 10·18·25·35cm 옆(같은 턱)에 잡는다(0.11.1: 18cm 안은 "닿지 않음·몸에 막혀·팔이 턱에 걸려")', rows.every(r => r.앞_조건) && rows.filter(r => r.간격_cm !== 12).every(r => r.결과 === '잡음'), rows.map(r => `${r.간격_cm}cm ${r.결과}`).join(' · ')); }
// ③ 옆으로 팽팽한 잡기: 왼손으로 턱 B(0.95)에 매달려 오른손을 턱 E(1.8, 1.90)로
{ const T = mk([1.05, 0, -2.65]); T.run(30); T.run(1, { jump: true }, [hand(0, [0.95, 2.32, -2.86])]); T.run(59, { jump: true }); T.run(200); const ok0 = T.sim.climb.hands[0].st === 'hold'; T.ev.length = 0; T.run(300, {}, [hand(1, [1.8, 1.90, -2.86])]);
  const seq = T.ev.filter(e => e.i === 1).map(e => e.type + (e.why ? `(${e.why})` : '')).join(' → '); out.cases['옆으로 팽팽한 잡기'] = { 앞_조건: ok0, 사건: seq };
  check('옆으로 팽팽한 잡기: 잡자마자 놓치지 않고(0.11.1: grab → slip) 잡기 전에 "팔이 옆으로 당겨져 버틸 수 없음"으로 거부, 왼손은 그대로', ok0 && !/slip/.test(seq) && /옆으로 당겨져/.test(seq) && T.sim.climb.hands[0].st === 'hold', seq); }
// ④ 발 없이 두 손 매달림: 늘어뜨린 다리의 무릎 간격
{ const T = mk([0.7, 0, -2.65]); T.run(30); T.run(1, { jump: true }, [hand(0, [0.5, 2.32, -2.86]), hand(1, [0.9, 2.32, -2.86])]); T.run(59, { jump: true }); T.run(300); T.rig.root.updateMatrixWorld(true);
  const P = n => T.rig.bones[n].getWorldPosition(new THREE.Vector3()), kn = P('leg.L').distanceTo(P('leg.R')), hp = P('upLeg.L').distanceTo(P('upLeg.R')), ft = P('foot.L').distanceTo(P('foot.R'));
  out.cases['늘어뜨린 다리'] = { 무릎_간격_cm: +(kn * 100).toFixed(1), 엉덩이_폭_cm: +(hp * 100).toFixed(1), 발_간격_cm: +(ft * 100).toFixed(1) };
  check('발 없이 매달린 다리: 무릎 간격이 엉덩이 폭 + 6cm 안(0.11.1: 무릎 29cm · 엉덩이 18cm — O자 다리)', T.sim.climb.feet.every(f => f.st === 'free') && kn <= hp + 0.06, `무릎 ${(kn * 100).toFixed(1)}cm · 엉덩이 ${(hp * 100).toFixed(1)}cm · 발 ${(ft * 100).toFixed(1)}cm`); }
console.log(`\n통과 ${out.checks.filter(c => c.ok).length} · 실패 ${fail}`);
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ 실행_출처: __P, ...out }, null, 1));
process.exitCode = fail ? 1 : 0;
