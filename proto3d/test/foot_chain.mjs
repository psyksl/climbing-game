// 진단(통과·실패 없음): 발 올리기 → 디딤과 지지 전환 → 몸 올리기. 걸음마다 발·무릎·골반·가슴과 손발의 하중을 적고, 구간별 시간과 "각 부분이 얼마나 움직였는가"를 낸다(p3d-0.9.0, GPT의 0.8.8 검토).
// 장면은 test/foot_sheet.mjs와 같다(그림으로 본 것과 같은 입력). 스크립트 입력(사람 손 아님).
// 사용: node test/foot_chain.mjs [JSON]   캡처 동작: MODE=clip   옛 소스로: SRC=<옛 src 폴더>   비교 스위치: OLDPOSE=1(몸통 자세의 층 끔)
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), SRC = process.env.SRC ? path.resolve(process.env.SRC) : path.resolve(HERE, '../src'), imp = f => import(pathToFileURL(path.join(SRC, f)).href);
const THREE = await import('three');
const { buildCharacter, DIM } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js');
for (const k of ['OLDPOSE', 'OLDHAND', 'NOSTRETCH']) if (process.env[k]) globalThis[k] = 1;
const clip = process.env.MODE === 'clip', clips = clip ? JSON.parse(fs.readFileSync(path.resolve(HERE, '../assets_local/clips.json'), 'utf8')) : null;
const rig = buildCharacter(), hand = (i, p) => ({ type: 'hand', i, p }), foot = (i, p) => ({ type: 'foot', i, p }), deg = r => r * 180 / Math.PI, cm = v => +(v * 100).toFixed(1);
const A1 = [-0.72, 1.92, -2.84], A2 = [-1.15, 1.92, -2.84];
// [이름, 출발, 잡는 자리, 보내는 발, 겨누는 자리]
const SCENES = [
  ['1 낮은 발판(30cm) · 같은 쪽 발(왼발)', [-1.05, 0, -2.58], A2, 0, [-1.35, 0.30, -2.72]],
  ['2 무릎 높이 발판(50cm) · 같은 쪽 발(오른발)', [-0.62, 0, -2.58], A1, 1, [-0.40, 0.5, -2.93]],
  ['3 무릎 높이 발판 · 교차(왼발을 오른쪽으로)', [-0.62, 0, -2.58], A1, 0, [-0.45, 0.5, -2.93]],
  ['4 옆 발판(오른발을 47cm 옆으로)', [-0.62, 0, -2.58], A1, 1, [-0.15, 0.5, -2.93]],
];
const out = { mode: clip ? 'clip' : 'proc', src: process.env.SRC ? '옛 소스' : (process.env.OLDPOSE ? '자세의 층 끔' : '지금'), scenes: {} };
for (const [name, start, grip, fi, tgt] of SCENES) {
  const sim = makeSim(rig, makeWorld(), clips); sim.reset({ pos: start, yaw: Math.PI }); sim.opt.wallRest = false; sim.opt.footAssist = false;
  const step = (inp = {}, cmd = []) => sim.step({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd }), rep = (n, inp, cmd) => { for (let i = 0; i < n; i++) step(inp, i ? [] : cmd); };
  rep(60); rep(150, {}, [hand(0, grip)]);
  const K = sim.climb, s = fi ? 'R' : 'L', sx = fi ? -1 : 1, yaw = sim.body.yaw, left = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), wp = n => rig.bones[n].getWorldPosition(new THREE.Vector3());
  const snap = () => { rig.root.updateMatrixWorld(true); const hj = wp(`upLeg.${s}`), kn = wp(`leg.${s}`), an = wp(`foot.${s}`), th = kn.clone().sub(hj), F = K.feet[fi], O = K.feet[1 - fi];
    return { st: F.st, an, kn, hj, hips: wp('hips'), chest: wp('chest'), head: wp('head'), pos: sim.body.pos.clone(), load: F.loadS || 0, oLoad: O.st === 'plant' ? O.loadS || 0 : 0, oSt: O.st, oAn: wp(`foot.${fi ? 'L' : 'R'}`), hand: K.hands[0].loadS || 0, hSt: K.hands[0].st,
      // 넓적다리가 향한 쪽: 수평 몫이 벽 쪽(0°)에서 바깥(+90°)·안쪽(−)으로 얼마나 돌아 있는가. 넓적다리가 수평에서 얼마나 들렸는가(아래로 늘어진 것이 −90°)
      thighOut: deg(Math.atan2(sx * th.dot(left), th.dot(fwd))), thighUp: deg(Math.asin(th.y / th.length())), thighH: Math.hypot(th.dot(left), th.dot(fwd)), knOut: sx * kn.clone().sub(hj).dot(left), fold: 1 - hj.distanceTo(an) / DIM.leg }; };
  const s0 = snap(), rows = [], k0 = K.log.length; let prev = s0, pathLen = 0;
  for (let k = 0; k < 360; k++) { step(k >= 150 && k < 270 ? { cy: 1 } : {}, k === 0 ? [foot(fi, tgt)] : []); const r = snap(); r.t = (k + 1) / 120; r.v = r.an.distanceTo(prev.an) * 120; if (r.st === 'move') pathLen += r.an.distanceTo(prev.an); prev = r; rows.push(r); }
  const ev = K.log.slice(k0).filter(e => e.type !== 'try' && !(e.auto && e.box === '바닥')).map(e => `${((e.k - (K.tick - 360)) / 120).toFixed(2)}초 ${e.type}${e.name ? ' ' + e.name : ''}${e.box ? ' ' + e.box : ''}${e.why ? ' · ' + e.why : ''}`);
  const iPl = rows.findIndex(r => r.st === 'plant'), mv = rows.slice(0, iPl < 0 ? 150 : iPl), tOf = f => { const i = rows.findIndex(f); return i < 0 ? null : rows[i].t; }, mx = (a, f) => Math.max(...a.map(f)), end = iPl < 0 ? null : rows[iPl];
  // 가는 길에서 곧은 길(출발 발목 → 끝 발목)과 가장 멀어진 거리, 끝 높이보다 가장 높이 올라간 만큼
  const line = end ? end.an.clone().sub(s0.an) : null, dev = end ? mx(mv, r => { const d = r.an.clone().sub(s0.an), u = line.clone().normalize(); return d.sub(u.multiplyScalar(d.dot(u))).length(); }) : null;
  // "먼저 들고 나서 옮기는가": 높이의 절반을 올랐을 때 수평으로는 몇 %를 갔는가(50%에 가까우면 함께 간다. 0에 가까우면 먼저 든다)
  const hz = r => Math.hypot(r.an.x - s0.an.x, r.an.z - s0.an.z), halfUp = end ? mv.find(r => r.an.y - s0.an.y >= (end.an.y - s0.an.y) / 2) : null;
  const up = rows.slice(150, 270), R = {
    사건: ev,
    발이_가는_동안: end ? { 걸린_초: end.t, 곧은_거리_cm: cm(line.length()), 간_길이_cm: cm(pathLen), 곧은_길에서_가장_멀어진_cm: cm(dev), 끝_높이보다_가장_높이_cm: cm(mx(mv, r => r.an.y) - end.an.y), 높이의_절반일_때_수평으로_간_퍼센트: halfUp ? Math.round(hz(halfUp) / Math.max(1e-6, hz(end)) * 100) : null, 발목의_가장_빠른_속도_mps: +mx(mv, r => r.v).toFixed(2) } : '디디지 못함',
    다리의_모양: { 넓적다리가_바깥으로_가장_돈_각_도: +mx(mv, r => (r.thighH > 0.12 ? r.thighOut : -99)).toFixed(0), 그때_넓적다리가_들린_각_도: (() => { const r = mv.filter(x => x.thighH > 0.12).sort((a, c) => c.thighOut - a.thighOut)[0]; return r ? +r.thighUp.toFixed(0) : null; })(), 무릎이_고관절보다_옆으로_가장_나간_cm: cm(mx(mv, r => r.knOut)), 디딘_뒤_넓적다리가_향한_쪽_도: end ? +end.thighOut.toFixed(0) : null, 디딘_뒤_무릎이_옆으로_나간_cm: end ? cm(end.knOut) : null, 가장_깊이_접힌_정도: +mx(mv, r => r.fold).toFixed(2) },
    발이_가는_동안_움직인_만큼: { 골반_cm: cm(mx(mv, r => r.hips.distanceTo(s0.hips))), 골반_옆으로_cm: cm(mx(mv, r => Math.abs(r.hips.clone().sub(s0.hips).dot(left)))), 골반_벽에서_멀어진_cm: cm(mx(mv, r => -r.hips.clone().sub(s0.hips).dot(fwd))), 가슴_cm: cm(mx(mv, r => r.chest.distanceTo(s0.chest))), 머리_cm: cm(mx(mv, r => r.head.distanceTo(s0.head))), 몸_원점_cm: cm(mx(mv, r => r.pos.distanceTo(s0.pos))) },
    지지: { 떼기_전: `그 발 ${s0.load.toFixed(2)} · 다른 발 ${s0.oLoad.toFixed(2)} · 왼손 ${s0.hand.toFixed(2)}(몸무게 배)`, 가는_동안_가장_큰: `다른 발 ${mx(mv, r => r.oLoad).toFixed(2)} · 왼손 ${mx(mv, r => r.hand).toFixed(2)}`, 남은_발이_미끄러진_cm: cm(mx(rows, r => (r.oSt === 'plant' ? r.oAn.distanceTo(s0.oAn) : 0))), 왼손: rows.every(r => r.hSt === 'hold') ? '내내 잡음' : '놓침' },
    닿음과_하중: end ? { 닿은_때_초: end.t, 닿는_순간의_하중: +end.load.toFixed(2), 하중이_몸무게의_10퍼센트를_넘은_때_초: tOf(r => r.st === 'plant' && r.load > 0.10), '30퍼센트를_넘은_때_초': tOf(r => r.st === 'plant' && r.load > 0.30), 몸_올리기_앞의_하중: +rows[149].load.toFixed(2) } : null,
    몸_올리기_W_1초: { 몸_원점이_올라간_cm: cm(up.at(-1).pos.y - rows[149].pos.y), 그_발의_하중_가장_큰: +mx(up, r => r.load).toFixed(2), 다른_발: up.at(-1).oSt === 'plant' ? `디딤 ${up.at(-1).oLoad.toFixed(2)}` : '떨어짐', 왼손_하중_가장_큰: +mx(up, r => r.hand).toFixed(2), 골반이_옆으로_cm: cm(up.at(-1).hips.clone().sub(rows[149].hips).dot(left)), 끝의_넓적다리가_향한_쪽_도: +up.at(-1).thighOut.toFixed(0) },
  };
  out.scenes[name] = R; console.log(`\n■ ${name} [${out.mode} · ${out.src}]`); for (const [k, v] of Object.entries(R)) console.log('  ' + k + ': ' + JSON.stringify(v));
}
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
