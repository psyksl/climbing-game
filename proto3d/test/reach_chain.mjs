// 진단(통과·실패 없음): 지지 발을 둔 채 한 손 뻗기 → 잡기 또는 막힘 → 복귀. 걸음마다 손·어깨·가슴·골반·지지 발을 적고, 구간별 시간과 "각 부분이 얼마나 움직였는가"를 낸다.
// 사용자 플레이 1차(녹화 0:47~0:58)의 상황을 옮긴 것: 왼손으로 턱 A, 왼발은 낮은 발판, 오른발은 바닥 → 오른손을 턱 F로.
// 사용: node test/reach_chain.mjs [JSON]   캡처 동작: MODE=clip   발 보조 켬: ASSIST=1
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), SRC = path.resolve(HERE, '../src'), imp = f => import(pathToFileURL(path.join(SRC, f)).href);
const THREE = await import('three');
const { buildCharacter } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js'), { limbState, CL } = await imp('climb.js');
const clip = process.env.MODE === 'clip', clips = clip ? JSON.parse(fs.readFileSync(path.resolve(HERE, '../assets_local/clips.json'), 'utf8')) : null;
const rig = buildCharacter(), hand = (i, p) => ({ type: 'hand', i, p }), foot = (i, p) => ({ type: 'foot', i, p });
export const START = [-0.62, 0, -2.58];
const F = [-0.3, 2.15, -2.86], AL = [-0.72, 1.92, -2.84], LOW = [-0.45, 0.5, -2.93], deg = r => r * 180 / Math.PI;
export const SCENES = {
  // 막힘: 올라서지 않은 채 오른손을 턱 F로(닿지 않는 거리) → 거부 → 팔이 돌아옴
  '막힘(닿지 않음) → 복귀': { pre: (rep) => { rep(60); rep(150, {}, [hand(0, AL)]); rep(260, {}, [foot(0, LOW)]); rep(120); }, act: [hand(1, F)], hold: {}, n: 300 },
  // 잡기: 왼발로 조금 올라선 뒤(W 0.9초) 오른손을 턱 F로 → 잡음
  '잡기': { pre: (rep) => { rep(60); rep(150, {}, [hand(0, AL)]); rep(260, {}, [foot(0, LOW)]); rep(Number(process.env.RISE || 150), { cy: 1 }); rep(90); }, act: [hand(1, F)], hold: {}, n: 300 },
};
const out = { mode: clip ? 'clip' : 'proc', assist: !!process.env.ASSIST, scenes: {} };
for (const [name, sc] of Object.entries(SCENES)) {
  const sim = makeSim(rig, makeWorld(), clips); sim.reset({ pos: START, yaw: Math.PI }); sim.opt.wallRest = false; sim.opt.footAssist = !!process.env.ASSIST;
  const step = (inp = {}, cmd = []) => sim.step({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd }), rep = (n, inp, cmd) => { for (let i = 0; i < n; i++) step(inp, i ? [] : cmd); };
  sc.pre(rep);
  const K = sim.climb, wp = n => rig.bones[n].getWorldPosition(new THREE.Vector3()), snap = () => { rig.root.updateMatrixWorld(true); const T = K.T; return { t: 0, hand: K.hands[1].st, w: wp('hand.R'), sh: wp('upperArm.R'), el: wp('foreArm.R'), chest: wp('chest'), hip: wp('hips'), head: wp('head'), twist: K.pz.twist, leanX: K.lean.x, leanZ: K.lean.z, shrug: K.shrug[1], hipRoll: K.pz.hipRoll, pos: sim.body.pos.clone(), feet: K.feet.map(f => `${f.st}${f.st === 'plant' ? ':' + (f.box && f.box.name) + ' ' + (f.loadS || 0).toFixed(2) : ''}`), hands: K.hands.map(h => h.st), lh: K.hands[0].loadS || 0 }; };
  const s0 = snap(), rows = [], k0 = K.log.length; let pw = s0.w.clone();
  for (let k = 0; k < sc.n; k++) { step(sc.hold, k === 0 ? sc.act : []); const s = snap(); s.t = (k + 1) / 120; s.v = s.w.distanceTo(pw) * 120; pw = s.w.clone(); rows.push(s); }
  const ev = K.log.slice(k0).filter(e => e.type !== 'try').map(e => ({ t: +((e.k - (K.tick - sc.n)) / 120).toFixed(3), type: e.type, name: e.name, why: e.why, box: e.box }));
  // 구간: 뻗기 시작 → 손목이 가장 멀리 간 때(또는 잡은 때) → 끝남(잡음·거부) → 팔이 쉬는 자리에 든 때(손목 속도 0.05m/s 아래로 0.1초)
  const iEnd = rows.findIndex(r => r.hand !== 'reach'), end = iEnd < 0 ? null : rows[iEnd], res = ev.find(e => e.type === 'grab' || e.type === 'reject');
  let iStop = -1; for (let i = 1; i < rows.length; i++) if (rows[i].hand === 'reach' && rows[i].v < 0.05 && rows[i - 1].v >= 0.05) { iStop = i; break; }
  let iRest = -1; if (iEnd >= 0) for (let i = iEnd; i < rows.length - 12; i++) if (rows.slice(i, i + 12).every(r => r.v < 0.05)) { iRest = i; break; }
  const vmax = Math.max(...rows.map(r => r.v)), tVmax = rows.find(r => r.v === vmax).t, mx = (f) => Math.max(...rows.slice(0, (iEnd < 0 ? rows.length : iEnd) + 1).map(f));
  const cm = v => +(v * 100).toFixed(1), R = {
    시작: { 손: s0.hands.join('/'), 발: s0.feet.join(' / '), 몸_원점: s0.pos.toArray().map(v => +v.toFixed(3)), 왼손_하중: +s0.lh.toFixed(2), 목표까지_어깨에서_cm: cm(s0.sh.distanceTo(new THREE.Vector3(...F))), 팔_길이_cm: cm(CL.ARM) },
    결과: res ? `${res.type}${res.why ? '(' + res.why + ')' : ''}` : '끝나지 않음', 사건: ev.map(e => `${e.t}초 ${e.type} ${e.name || ''} ${e.box || ''} ${e.why || ''}`.trim()),
    시간_초: { 손목이_멈춘_때: iStop < 0 ? null : rows[iStop].t, 끝난_때: end ? end.t : null, 멈춘_채_기다린_시간: iStop >= 0 && end ? +(end.t - rows[iStop].t).toFixed(3) : null, 팔이_쉬는_자리에_든_때: iRest < 0 ? null : rows[iRest].t, 복귀에_걸린_시간: iRest >= 0 && end ? +(rows[iRest].t - end.t).toFixed(3) : null },
    손목: { 가장_빠른_속도_mps: +vmax.toFixed(2), 그때: tVmax, 간_거리_cm: cm(mx(r => r.w.distanceTo(s0.w))) },
    뻗는_동안_움직인_만큼: { 오른_어깨_cm: cm(mx(r => r.sh.distanceTo(s0.sh))), 가슴_cm: cm(mx(r => r.chest.distanceTo(s0.chest))), 골반_cm: cm(mx(r => r.hip.distanceTo(s0.hip))), 머리_cm: cm(mx(r => r.head.distanceTo(s0.head))), 몸_원점_cm: cm(mx(r => r.pos.distanceTo(s0.pos))), 가슴_비틀기_도: +deg(mx(r => Math.abs(r.twist - s0.twist))).toFixed(1), 윗몸_좌우_기울기_도: +deg(mx(r => Math.abs(r.leanZ - s0.leanZ))).toFixed(1), 어깨_올림_도: +deg(mx(r => Math.abs(r.shrug - s0.shrug))).toFixed(1), 골반_기울기_도: +deg(mx(r => Math.abs(r.hipRoll - s0.hipRoll))).toFixed(1) },
    끝: { 손: rows.at(-1).hands.join('/'), 발: rows.at(-1).feet.join(' / ') },
  };
  out.scenes[name] = R; console.log(`\n■ ${name} [${out.mode}${out.assist ? ', 발 보조 켬' : ''}]`); console.log(JSON.stringify(R, null, 1).replace(/\n\s+/g, ' ').replace(/ ?\} ?,/g, '},\n ').slice(0, 2600));
  if (process.env.ROWS) for (let i = 0; i < rows.length; i += 6) { const r = rows[i]; console.log(`${r.t.toFixed(2)} ${r.hand.padEnd(5)} v ${r.v.toFixed(2)} 손 ${r.w.toArray().map(v => v.toFixed(2)).join(',')} 어깨 ${r.sh.toArray().map(v => v.toFixed(2)).join(',')} 비틀 ${deg(r.twist).toFixed(0)} 기울 ${deg(r.leanZ).toFixed(0)} 올림 ${deg(r.shrug).toFixed(0)}`); }
}
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
