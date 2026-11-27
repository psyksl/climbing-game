// 발을 디디고 몸 위로(W): 걸음마다 몸·골반·가슴·어깨·팔꿈치·발을 한 줄로 적는다(p3d-0.15.3, GPT의 0.15.2 검토 작업 A의 재현 기준). **스크립트 입력이다(사람 손 아님).**
// 장면(SCENE): d = 초록 시작1·2를 잡고 왼발 → 발1, W / h = 손을 초록 3·4로 옮긴 뒤 같은 발·W / r = 시작1·2, 오른발 → 발2, W / d2 = d 뒤에 오른발 → 발2, W
// 사용: [MODE=clip] [SCENE=d] [WN=180(W 걸음 수)] [EVERY=6] [PRESS=0] [FOOT=0(발 보조 끔)] [SW=스위치,…] [JSON=파일] node test/stand_trace.mjs
// 열: t · 몸 y · 벽에서(몸의 기준 자리 → 벽면, m) · ref y · 골반 y/벽에서 · 가슴 벽에서 · 머리−골반(뒤로 +) · 가슴 숙임°(뒤로 젖힘 −) · 어깨–손 L/R · 팔꿈치 높이(어깨 기준) L/R · 팔꿈치 옆(바깥 +) L/R · 걸림 · 멈춤 까닭 · 발(상태:발판:하중:다리 길이 몫)
import { prov, provLine, provOptLine } from './provenance.mjs';
import fs from 'fs'; import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), SRC = process.env.SRC || path.join(HERE, '../src'), imp = f => import(pathToFileURL(path.join(SRC, f)).href);
const { buildCharacter } = await imp('rig.js'), { makeGym } = await imp('world.js'), { makeSim } = await imp('sim.js'), { _dbg, CL } = await imp('climb.js'), { FBI } = await imp('fbik.js'), THREE = await import('three');
const E = process.env; for (const k of (E.SW || '').split(',').filter(Boolean)) { const [a, v] = k.split('='); globalThis[a] = v === undefined ? 1 : +v; }
const CLIPS = E.MODE === 'clip' ? JSON.parse(fs.readFileSync(path.join(HERE, '../assets_local/clips.json'), 'utf8')) : null, rig = buildCharacter(), world = makeGym(), C = world.courses.find(c => c.id === 'green'), box = nm => world.boxes.find(b => b.name === nm);
const n = new THREE.Vector3(...C.frame.n), wallD = p => p.clone().sub(new THREE.Vector3(...C.frame.o)).dot(n);
const front = b => { const c = b.min.clone().add(b.max).multiplyScalar(0.5), half = Math.abs(n.x) * (b.max.x - b.min.x) / 2 + Math.abs(n.z) * (b.max.z - b.min.z) / 2; return c.addScaledVector(n, half).setY(b.max.y).toArray(); }, top = b => b.min.clone().add(b.max).multiplyScalar(0.5).setY(b.max.y).toArray();
const SC = { d: [['hand', 0, '초록 시작1'], ['hand', 1, '초록 시작2'], ['foot', 0, '초록 발1'], ['W']], h: [['hand', 0, '초록 시작1'], ['hand', 1, '초록 시작2'], ['hand', 0, '초록 3'], ['hand', 1, '초록 4'], ['foot', 0, '초록 발1'], ['W']],
  r: [['hand', 0, '초록 시작1'], ['hand', 1, '초록 시작2'], ['foot', 1, '초록 발2'], ['W']], d2: [['hand', 0, '초록 시작1'], ['hand', 1, '초록 시작2'], ['foot', 0, '초록 발1'], ['W'], ['foot', 1, '초록 발2'], ['W']] };
export function runScene(name, o = {}) {
  const sim = makeSim(rig, world, CLIPS); sim.reset({ pos: C.startPos, yaw: C.startYaw }); const K = sim.climb, S = sim.state || sim.S || null, b = sim.body;
  Object.assign(sim.opt, { posture: 'fb', grabAssist: true, poseAssist: true, easy: true, autoBody: true, press: o.press !== false, footAssist: o.footAssist !== false, wallRest: false, linkPose: !!o.link });
  const rows = [], ev = [], rec = []; let nlog = 0, phase = '';
  const row = () => { const T = K.T; if (!T) return null; const fwd = new THREE.Vector3(Math.sin(b.yaw), 0, Math.cos(b.yaw)), left = new THREE.Vector3(Math.cos(b.yaw), 0, -Math.sin(b.yaw)), x = K.fb ? K.fb.x : null;
    const arm = K.hands.map(h => { if (h.st !== 'hold') return null; const sx = h.i ? -1 : 1, sh = T.sh[h.i], el = h.elbow || null; return { d: sh.distanceTo(h.goal), up: el ? el.y - sh.y : null, out: el ? sx * el.clone().sub(sh).dot(left) : null, back: el ? -el.clone().sub(sh).dot(fwd) : null, headUp: el ? el.y - T.head.y : null }; });
    return { t: sim.tick / 120, phase, y: b.pos.y, wd: wallD(b.pos), refY: K.ref.y, refD: wallD(K.ref), hipY: T.hip.y, hipD: wallD(T.hip), chestD: wallD(T.chest), headBack: -T.head.clone().sub(T.hip).dot(fwd), pitchC: x ? x[FBI.PC] * 180 / Math.PI : 0, pitchH: x ? x[FBI.PH] * 180 / Math.PI : 0, pz: x ? x[FBI.PZ] : 0, arm, jam: K.hands.map(h => h.jam || 0), jamWhy: K.hands.map(h => h.jamWhy || ''), jamStop: !!K.jamStop, upWhy: K.upWhy || '', upLim: K.upLim ?? null, wout: K.wout || 0,
      feet: K.feet.map(f => ({ st: f.st, box: f.st !== 'free' && f.box ? f.box.name : '-', load: f.load || 0, len: f.st === 'plant' ? T.hj[f.i].distanceTo(f.ank) / CL.LEG : null, user: !f.auto && !f.byAssist })), hands: K.hands.map(h => (h.st === 'hold' && h.edge ? h.edge.box.name : h.st)) }; };
  const step = (k, inp = {}, cmd = []) => { for (let i = 0; i < k; i++) { if (o.stopAt && sim.tick >= o.stopAt) return; const x = { mx: 0, mz: 0, cxSign: 1, ...inp, cmd: i ? [] : cmd }; rec.push(x); sim.step(x); for (; nlog < K.log.length; nlog++) { const e = K.log[nlog]; if (!/^(try|bump)$/.test(e.type)) ev.push({ t: e.t, phase, type: e.type, name: e.name || '', why: e.why || '', hold: e.hold || '' }); } const r = row(); if (r) rows.push(r); } };
  step(20);
  for (const [kind, a, nm] of SC[name]) { phase = kind === 'W' ? 'W' : `${kind === 'hand' ? (a ? '오른손' : '왼손') : (a ? '오른발' : '왼발')} → ${nm}`;
    if (kind === 'hand') { step(1, {}, [{ type: 'hand', i: a, p: front(box(nm)) }]); let k = 0; for (; k < 420; k++) { step(1); const h = K.hands[a]; if (h.st === 'hold' && h.edge && h.edge.box.name === nm) break; if (h.st === 'free' && !h.arm && k > 30) break; } step(60); }
    else if (kind === 'foot') { step(1, {}, [{ type: 'foot', i: a, p: top(box(nm)) }]); let k = 0; for (; k < 300; k++) { step(1); const f = K.feet[a]; if (f.st === 'plant' && f.box && f.box.name === nm) break; if (f.st !== 'move' && k > 20) break; } step(o.settle ?? 90); }
    else { step(o.wn ?? 180, { cy: 1 }); phase = 'W 뗌'; step(60); } }
  return { rows, ev, sim, rec, optLine: provOptLine(sim), opts: { handMode: 1, ...sim.opt } };
}
const f2 = v => (v === null || v === undefined ? '  -  ' : (v >= 0 ? ' ' : '') + v.toFixed(3));
if (import.meta.url === pathToFileURL(process.argv[1]).href) { console.log(provLine(prov()));
  const name = E.SCENE || 'd', R = runScene(name, { press: E.PRESS !== '0', footAssist: E.FOOT !== '0', wn: +(E.WN || 180), link: E.LINK === '1' }), every = +(E.EVERY || 6); let ei = 0, last = ''; console.log(R.optLine);
  console.log('t      몸y   벽에서  refy   골반y  골반벽 가슴벽 머리뒤 가슴° 골반° | 어깨–손 L/R | 팔꿈치 높이 L/R | 옆 L/R | 걸림 | 멈춤 | 발');
  R.rows.forEach((r, i) => { for (; ei < R.ev.length && R.ev[ei].t <= r.t + 1e-6; ei++) { const e = R.ev[ei]; console.log(`        · ${e.t.toFixed(3)} ${e.type} ${e.name} ${e.why} ${e.hold}`); }
    if (r.phase !== last) { console.log(`--- ${r.phase}`); last = r.phase; } if (i % every) return; const A = r.arm;
    console.log(`${r.t.toFixed(3)} ${f2(r.y)} ${f2(r.wd)} ${f2(r.refY)} ${f2(r.hipY)} ${f2(r.hipD)} ${f2(r.chestD)} ${f2(r.headBack)} ${r.pitchC.toFixed(0).padStart(4)} ${r.pitchH.toFixed(0).padStart(4)} | ${A.map(a => f2(a && a.d)).join('/')} | ${A.map(a => f2(a && a.up)).join('/')} | ${A.map(a => f2(a && a.out)).join('/')} | ${r.jam.map(j => j.toFixed(2)).join('/')} ${r.jamWhy.filter(Boolean).join(',')} | ${r.jamStop ? 'jamStop ' : ''}${r.upWhy} | ${r.feet.map(f => `${f.st}:${f.box}:${f.load.toFixed(2)}:${f.len ? f.len.toFixed(2) : '-'}`).join(' ')}`); });
  const W = R.rows.filter(r => r.phase === 'W'), w0 = W[0], w1 = W[W.length - 1]; if (w0) console.log(`\n장면 ${name}: W 동안 몸 y ${w0.y.toFixed(3)} → ${w1.y.toFixed(3)}(${((w1.y - w0.y) * 100).toFixed(1)}cm) · 가장 낮음 ${(Math.min(...W.map(r => r.y)) - w0.y).toFixed(3)} · 가장 높음 ${(Math.max(...W.map(r => r.y)) - w0.y).toFixed(3)} · 머리 뒤로 가장 큼 ${Math.max(...W.map(r => r.headBack)).toFixed(3)}m · 가슴 가장 젖힘 ${Math.min(...W.map(r => r.pitchC)).toFixed(0)}° · 끝 손 ${w1.hands.join('/')} · 끝 발 ${w1.feet.map(f => f.box).join('/')}`);
  // REC = 다시 틀 입력(test/short_video.mjs의 IN 형식 — 영상·그림으로 볼 때)
  if (E.REC) { const ver = /VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(SRC, 'main.js'), 'utf8'))[1]; fs.writeFileSync(E.REC, JSON.stringify({ version: ver, clip: E.MODE === 'clip', route: 'stand_' + name, source: 'command', recover: false, shadow: false, opts: R.opts, startPos: C.startPos, startYaw: C.startYaw, inputs: R.rec, end: null })); }
  if (E.JSON) fs.writeFileSync(E.JSON, JSON.stringify({ scene: name, rows: R.rows, ev: R.ev })); }
