// 뻗는 손의 손목·손등·손가락 뒤집힘(p3d-0.11.6, 사용자 "팔로 턱을 잡으려고 할 때 팔목부터 손등, 손가락 등 오도방정 떨면서 뒤집히고 난리").
// 마네킹(그림)의 손 뼈·아래팔·손가락 첫 마디의 세계 회전 빠르기(°/s)와 손바닥이 보는 쪽(손바닥 법선 · 벽 쪽)을 계산 걸음마다 잰다. 스크립트 입력(사람 손 아님).
// 기준(개발 쪽 진단선): 뻗는 동안 손 뼈 900°/s 넘는 걸음 수, 손바닥 법선이 0.1초 안에 120° 넘게 뒤집힌 횟수, 잡기 직전 0.15초 동안 손바닥이 벽을 보는 정도(+1 = 벽, −1 = 화면 쪽).
// 사용: node test/hand_flip.mjs [JSON]   캡처 동작: MODE=clip   장면: ONLY=D,reach2   보정 끔: NOASSIST=1   자세: VARIANT=rule
import { prov, provLine } from './provenance.mjs';
import fs from 'fs'; import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';
const __P = prov(); console.log(provLine(__P));
const HERE = path.dirname(fileURLToPath(import.meta.url)), SRC = process.env.SRC ? path.resolve(process.env.SRC) : path.resolve(HERE, '../src'), imp = f => import(pathToFileURL(path.join(SRC, f)).href);
const THREE = await import('three');
const { buildCharacter } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js'), { buildHuman, makeRetarget } = await imp('human.js');
const SC = await import('./scenes_foot.mjs');
const clips = process.env.MODE === 'clip' ? JSON.parse(fs.readFileSync(path.resolve(HERE, '../assets_local/clips.json'), 'utf8')) : null;
const all = [...SC.SCENES.map((s, i) => ['reach' + (i + 1), ...s]), ...SC.SCENES_H.map(s => [s[0].split(' ')[0], ...s]), ...(SC.SCENES_V115 || []).map(s => [s[0].split(' ')[0], ...s]), ...(SC.SCENES_U || []).map(s => [s[0].split(' ')[0], ...s])]
  .filter(s => (process.env.ONLY ? process.env.ONLY.split(',') : ['reach1', 'reach2', 'reach3', 'h1', 'h3', 'h5', 'A', 'B', 'C', 'D', 'E', 'F', 'u6', 'u8', 'u12']).includes(s[0]));
const rig = buildCharacter(), H = buildHuman(), R = makeRetarget(rig, H), V = () => new THREE.Vector3(), wp = n => H.bones[n].getWorldPosition(V()), wq = n => H.bones[n].getWorldQuaternion(new THREE.Quaternion());
const ang = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a.clone().invert().multiply(b).w))) * 180 / Math.PI;
const palmN = h => { const a = wp(`index_01_${h}`).sub(wp(`pinky_01_${h}`)), f = wp(`middle_01_${h}`).sub(wp(`hand_${h}`)); const n = f.clone().cross(a).normalize(); return h === 'r' ? n.negate() : n; }; // 쉬는 자세에서 손바닥이 몸 안쪽을 보게 부호를 맞췄다
const out = { scenes: {} }; let TOT = { fast: 0, flip: 0 };
for (const [id, title, fn, assist, , st0] of all) {
  const world = makeWorld(), sim = makeSim(rig, world, clips); sim.reset({ pos: st0 || SC.START, yaw: Math.PI }); sim.opt.wallRest = false; sim.opt.footAssist = !!assist; sim.opt.posture = process.env.VARIANT || 'fb'; sim.opt.grabAssist = !process.env.NOASSIST;
  const inputs = [], put = (inp = {}, cmd = []) => inputs.push({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd }), rep = (n, inp, cmd) => { for (let i = 0; i < n; i++) put(inp, i ? [] : cmd); }; fn(sim, put, rep);
  // 쉬는 자세의 손바닥 법선 부호 확인(오른손 손바닥은 몸 안쪽)
  const prev = {}, hist = { l: [], r: [] }, mk = () => ({ wr: 0, wrM: 0, wrAt: 0, fr: 0, frM: 0, frAt: 0, fast: 0, max: 0, maxAt: 0, maxB: '', fastF: 0, maxF: 0, maxFAt: 0, flips: [], pre: [], n: 0, away: 0, awayT: [] }), rows = { l: mk(), r: mk() };
  for (let k = 0; k < inputs.length; k++) { sim.step(inputs[k]); R.apply(sim.fing, sim.pron, sim.climb, world, sim.gw); H.root.updateMatrixWorld(true);
    for (const [i, h] of [[0, 'l'], [1, 'r']]) { const Hd = sim.climb.hands[i], st = Hd.st, moving = st === 'reach' || st === 'move' || (sim.ctx === 'ground' && sim.climb && Hd.st !== 'hold' && sim.reach && sim.reach[i]);
      const bones = [`hand_${h}`, `lowerarm_${h}`, `index_02_${h}`, `middle_02_${h}`];
      const qs = bones.map(wq); const pn = palmN(h); const rw = qs[1].clone().invert().multiply(qs[0]), rf = qs[0].clone().invert().multiply(qs[3]);
      if (prev[h]) { bones.forEach((b, j) => { const w = ang(prev[h].qs[j], qs[j]) * 120; if (st === 'reach' && j === 0) { const ww = ang(prev[h].rw, rw) * 120, wf = ang(prev[h].rf, rf) * 120; if (ww > 600) rows[h].wr++; if (ww > rows[h].wrM) { rows[h].wrM = ww; rows[h].wrAt = (k + 1) / 120; } if (wf > 600) rows[h].fr++; if (wf > rows[h].frM) { rows[h].frM = wf; rows[h].frAt = (k + 1) / 120; } }
        if (st === 'reach') { if (j < 2) { if (w > 900) rows[h].fast++; if (w > rows[h].max) { rows[h].max = w; rows[h].maxAt = (k + 1) / 120; rows[h].maxB = b; } } else { if (w > 900) rows[h].fastF++; if (w > rows[h].maxF) { rows[h].maxF = w; rows[h].maxFAt = (k + 1) / 120; } } } }); }
      if (st === 'reach') { rows[h].n++; const tw = pn.dot(new THREE.Vector3(0, 0, -1)); if (tw < -0.3) { rows[h].away++; if (!rows[h].awayT.length || k - rows[h].awayT.at(-1).k > 30) rows[h].awayT.push({ k, t: +((k + 1) / 120).toFixed(2), tw: +tw.toFixed(2) }); } }
      hist[h].push({ k, pn, st }); if (hist[h].length > 13) hist[h].shift();
      if (hist[h].length === 13 && st !== 'hold' && st !== 'free') { const d = Math.acos(Math.max(-1, Math.min(1, hist[h][0].pn.dot(pn)))) * 180 / Math.PI; if (d > 120 && (!rows[h].flips.length || k - rows[h].flips.at(-1).k > 12)) rows[h].flips.push({ k, t: +((k + 1) / 120).toFixed(3), d: +d.toFixed(0), st }); }
      if (process.env.TRACE && process.env.TRACE.split(':')[0] === h && st !== 'free') { const [, t0, t1] = process.env.TRACE.split(':').map(Number), t = (k + 1) / 120; if (t >= t0 && t <= t1) { const fa = wp(`hand_${h}`).sub(wp(`lowerarm_${h}`)).normalize(); console.log(`  ${t.toFixed(3)} ${st} 손바닥 벽${pn.dot(new THREE.Vector3(0, 0, -1)).toFixed(2)} 위${pn.y.toFixed(2)} 옆${pn.x.toFixed(2)} 팔뚝(${fa.toArray().map(v => v.toFixed(2))}) 손뼈${prev[h] ? (ang(prev[h].qs[0], qs[0]) * 120).toFixed(0) : '-'} 아래팔${prev[h] ? (ang(prev[h].qs[1], qs[1]) * 120).toFixed(0) : '-'} 손가락${prev[h] ? (ang(prev[h].qs[2], qs[2]) * 120).toFixed(0) : '-'} fing${sim.fing[i].toFixed(2)} pron${sim.pron[i].toFixed(2)} gw${sim.gw[i].toFixed(2)} edge${Hd.edge ? 1 : 0} 손목(${Hd.w.toArray().map(v => v.toFixed(2))})`); } }
      if (process.env.LOCAL && st === 'reach' && sim.pron[i] < 0.02 && sim.gw[i] < 0.01) { const qc = rig.bones[`hand.${i ? 'R' : 'L'}`].getWorldQuaternion(new THREE.Quaternion()); const lp = pn.clone().applyQuaternion(qc.invert()); (globalThis.__LP ||= []).push([h, lp]); }
      prev[h] = { qs, rw, rf };
      for (const e of sim.climb.events) if (e.limb === 'hand' && e.i === i && e.type === 'grab') { const toWall = e.n ? e.n.clone().negate() : new THREE.Vector3(0, 0, -1); rows[h].pre.push({ t: +((k + 1) / 120).toFixed(3), 손바닥_벽쪽: +pn.dot(new THREE.Vector3(0, 0, -1)).toFixed(2), 손바닥_아래: +(-pn.y).toFixed(2) }); }
    }
  }
  out.scenes[id] = { 제목: title, rows };
  for (const h of ['l', 'r']) { const r = rows[h]; TOT.fast += r.fast; TOT.flip += r.flips.length; TOT.fastF = (TOT.fastF || 0) + r.fastF; TOT.wr = (TOT.wr || 0) + r.wr; TOT.fr = (TOT.fr || 0) + r.fr; TOT.wrM = Math.max(TOT.wrM || 0, r.wrM); TOT.frM = Math.max(TOT.frM || 0, r.frM); TOT.away = (TOT.away || 0) + r.away; TOT.n = (TOT.n || 0) + r.n; }
  console.log(`■ ${id} ${title.slice(0, 40)}`);
  for (const h of ['l', 'r']) { const r = rows[h]; if (!r.n) continue; console.log(`   ${h} 뻗는 ${r.n}걸음: 손·아래팔 900°/s↑ ${r.fast}걸음(최대 ${r.max.toFixed(0)} @${r.maxAt.toFixed(3)} ${r.maxB}) · 손가락 900°/s↑ ${r.fastF}(최대 ${r.maxF.toFixed(0)} @${r.maxFAt.toFixed(3)}) · 손목(손↔아래팔) 600°/s↑ ${r.wr}(최대 ${r.wrM.toFixed(0)} @${r.wrAt.toFixed(3)}) · 손가락(↔손) 600°/s↑ ${r.fr}(최대 ${r.frM.toFixed(0)} @${r.frAt.toFixed(3)}) · 손바닥이 벽 반대(−0.3 아래) ${r.away}걸음 ${r.awayT.slice(0, 4).map(a => a.t + 's ' + a.tw).join(' ')} · 0.1초에 120° 넘게 뒤집힘 ${r.flips.length} ${r.flips.slice(0, 4).map(f => f.t + 's ' + f.d + '° ' + f.st).join(' / ')}  잡을 때 손바닥 ${r.pre.map(p => `${p.t}s 벽${p.손바닥_벽쪽} 아래${p.손바닥_아래}`).join(' / ')}`); }
}
if (globalThis.__LP) for (const h of ['l', 'r']) { const a = __LP.filter(x => x[0] === h).map(x => x[1]); if (!a.length) continue; const m = a.reduce((s, v) => s.add(v), new THREE.Vector3()).divideScalar(a.length); console.log('control-hand local palm', h, a.length, m.toArray().map(v => v.toFixed(3)), 'spread', Math.max(...a.map(v => v.distanceTo(m))).toFixed(3)); }
console.log(`합계(뻗는 동안): 손목(손↔아래팔) 600°/s↑ ${TOT.wr}걸음(최대 ${TOT.wrM.toFixed(0)}) · 손가락(↔손) 600°/s↑ ${TOT.fr}(최대 ${TOT.frM.toFixed(0)}) · 손·아래팔(세계) 900°/s↑ ${TOT.fast}걸음 · 손가락 900°/s↑ ${TOT.fastF} · 손바닥 벽 반대 ${TOT.away}/${TOT.n}걸음 · 0.1초 120° 뒤집힘 ${TOT.flip}`);
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ 실행_출처: __P, ...out, 합계: TOT }, null, 1));
