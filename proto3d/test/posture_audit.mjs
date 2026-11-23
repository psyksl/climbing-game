// 자세 문제 목록을 같은 잣대로 잰다(p3d-0.11.6 뒤, 사용자 "자세 문제 정리를 먼저"). 스크립트 입력(사람 손 아님). 기준은 개발 쪽 진단선이며 사람이 본 품질이 아니다.
// 걸음마다(계산 걸음 1/120초), 제어 뼈대로 잰다:
//   ① 개구리: 디딘 다리의 넓적다리가 바깥으로 돈 각(kneeTurn) > 45° 이면서 고관절–발목 거리가 다리 길이의 60% 아래(깊이 접힘)
//      + 함께 적는 값: 무릎 사이 거리 ÷ 고관절 사이 거리, 골반(hips)이 가장 가까운 벽·턱까지의 거리
//   ② 엇갈린 다리 겹침: leg_cross와 같은 캡슐(넓적다리 7·정강이 5·발 4cm)이 1cm 넘게 겹침
//   ③ 닿아만 있는 발: 디딘 발인데 하중이 몸무게의 5% 이하이고 발목이 고관절 높이 −25cm보다 위(들린 채 벽에 댐)
//   ④ 땅에 선 채(몸 0.3m/s 아래, 두 발목 높이 20cm 아래) 손을 뻗거나 잡은 동안 두 발목 거리 > 55cm, 또는 좌우가 엇갈림(왼발이 몸의 오른쪽)
//   ⑥ 닭 날개: 잡은 손이 어깨에서 30cm 안이고 팔꿈치가 어깨보다 위
//   ⑦ 빈손이 엉덩이·허벅지에 듦: 벽 문맥에서 놓인(free) 손목(반지름 4cm)이 넓적다리 캡슐(7cm)·골반 공(13cm)과 겹침
// 사용: node test/posture_audit.mjs [JSON]   캡처 동작: MODE=clip   장면: ONLY=h1,F   자세: VARIANT=rule   보정 끔: NOASSIST=1
import { prov, provLine } from './provenance.mjs';
import fs from 'fs'; import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';
const __P = prov(); console.log(provLine(__P));
const HERE = path.dirname(fileURLToPath(import.meta.url)), SRC = process.env.SRC ? path.resolve(process.env.SRC) : path.resolve(HERE, '../src'), imp = f => import(pathToFileURL(path.join(SRC, f)).href);
const THREE = await import('three');
const { buildCharacter, DIM } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js'), AN = await imp('anat.js');
const SC = await import('./scenes_foot.mjs');
const clips = process.env.MODE === 'clip' ? JSON.parse(fs.readFileSync(path.resolve(HERE, '../assets_local/clips.json'), 'utf8')) : null;
const pick = (arr, pre) => (arr || []).map((s, i) => [pre ? pre + (i + 1) : s[0].split(' ')[0], ...s]);
const all = [...pick(SC.SCENES_FOOT, 'foot'), ...pick(SC.SCENES, 'reach'), ...pick(SC.SCENES_H), ...pick(SC.SCENES_V115), ...pick(SC.SCENES_U), ...pick(SC.SCENES_J), ...pick(SC.SCENES_GW)]
  .filter(s => !process.env.ONLY || process.env.ONLY.split(',').includes(s[0]));
const V = () => new THREE.Vector3(), Q = () => new THREE.Quaternion(), qA = q => [q.x, q.y, q.z, q.w], vA = v => [v.x, v.y, v.z], deg = 180 / Math.PI, R = { th: 0.07, sh: 0.05, ft: 0.04 };
function segSeg(p1, q1, p2, q2) { const d1 = q1.clone().sub(p1), d2 = q2.clone().sub(p2), r = p1.clone().sub(p2), a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r), c = d1.dot(r), bb = d1.dot(d2), den = a * e - bb * bb, cl = (x) => Math.max(0, Math.min(1, x));
  let s = den > 1e-9 ? cl((bb * f - c * e) / den) : 0, t = e > 1e-9 ? (bb * s + f) / e : 0; if (t < 0) { t = 0; s = a > 1e-9 ? cl(-c / a) : 0; } else if (t > 1) { t = 1; s = a > 1e-9 ? cl((bb - c) / a) : 0; }
  return p1.clone().addScaledVector(d1, s).distanceTo(p2.clone().addScaledVector(d2, t)); }
const ptSeg = (p, a, b) => { const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / Math.max(ab.lengthSq(), 1e-9))); return p.distanceTo(a.clone().addScaledVector(ab, t)); };
const boxDist = (world, p) => { let m = 9; for (const b of world.boxes) { if (b.kind === 'floor') continue; const dx = Math.max(b.min.x - p.x, 0, p.x - b.max.x), dy = Math.max(b.min.y - p.y, 0, p.y - b.max.y), dz = Math.max(b.min.z - p.z, 0, p.z - b.max.z); m = Math.min(m, Math.hypot(dx, dy, dz)); } return m; };
const KEYS = ['frog', 'legx', 'touch', 'gfeet', 'wing', 'handhip'], NAME = { frog: '① 개구리', legx: '② 다리 겹침', touch: '③ 닿아만 있는 발(들림)', gfeet: '④ 땅 뻗기 발 벌어짐·엇갈림', wing: '⑥ 닭 날개', handhip: '⑦ 빈손이 엉덩이·허벅지에 듦' };
const out = { scenes: {} }, TOT = Object.fromEntries(KEYS.map(k => [k, 0])); let TOTN = 0; const worst = Object.fromEntries(KEYS.map(k => [k, { v: 0, at: '' }]));
for (const [id, title, fn, assist, , st0] of all) {
  const rig = buildCharacter(), world = makeWorld(), sim = makeSim(rig, world, clips); sim.reset({ pos: st0 || SC.START, yaw: Math.PI }); sim.opt.wallRest = false; sim.opt.footAssist = !!assist; sim.opt.posture = process.env.VARIANT || 'fb'; sim.opt.grabAssist = !process.env.NOASSIST;
  const inputs = [], put = (inp = {}, cmd = []) => inputs.push({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd }), rep = (n, inp, cmd) => { for (let i = 0; i < n; i++) put(inp, i ? [] : cmd); }; fn(sim, put, rep);
  const B = rig.bones, P = n => B[n].getWorldPosition(V()), cnt = Object.fromEntries(KEYS.map(k => [k, 0])), mx = Object.fromEntries(KEYS.map(k => [k, { v: 0, t: 0, x: '' }])); let frogHip = 9, frogKK = 0;
  const note = (k, v, t, x = '') => { cnt[k]++; if (v > mx[k].v) mx[k] = { v, t, x }; if (v > worst[k].v) worst[k] = { v, at: `${id} @${t}s ${x}` }; };
  for (let k = 0; k < inputs.length; k++) { sim.step(inputs[k]); rig.root.updateMatrixWorld(true); const t = +((k + 1) / 120).toFixed(3), K = sim.climb, onW = K.on;
    const qH = qA(B.hips.getWorldQuaternion(Q())), L = s => ({ hip: P(`upLeg.${s}`), knee: P(`leg.${s}`), ank: P(`foot.${s}`), toe: P(`toe.${s}`) }), legs = [L('L'), L('R')];
    // ① 개구리
    if (onW) for (const [i, lg] of legs.entries()) { const F = K.feet[i]; if (F.st !== 'plant') continue; const sx = i ? -1 : 1, turn = AN.kneeTurn(qH, vA(lg.hip), vA(lg.knee), vA(lg.ank), sx) * deg, fold = lg.hip.distanceTo(lg.ank) / DIM.leg;
      if (turn > 45 && fold < 0.6) { const kk = legs[0].knee.distanceTo(legs[1].knee) / Math.max(legs[0].hip.distanceTo(legs[1].hip), 0.05), hd = boxDist(world, P('hips')); note('frog', turn, t, `${i ? 'R' : 'L'} 바깥 ${turn.toFixed(0)}° 접힘 ${(fold * 100).toFixed(0)}% 무릎간격/고관절간격 ${kk.toFixed(1)} 골반–벽 ${(hd * 100).toFixed(0)}cm`); frogHip = Math.min(frogHip, hd); frogKK = Math.max(frogKK, kk); } }
    // ② 다리 겹침
    { let g = 9; for (const [x, y] of [[legs[0], legs[1]], [legs[1], legs[0]]]) for (const [p, q, r] of [[x.knee, x.ank, R.sh], [x.ank, x.toe, R.ft]]) for (const [p2, q2, r2] of [[y.hip, y.knee, R.th], [y.knee, y.ank, R.sh], [y.ank, y.toe, R.ft]]) g = Math.min(g, segSeg(p, q, p2, q2) - r - r2); if (g < -0.01) note('legx', -g * 100, t, `${(-g * 100).toFixed(1)}cm`); }
    // ③ 닿아만 있는 발(들린 채)
    if (onW) for (const [i, F] of K.feet.entries()) if (F.st === 'plant' && (F.loadS || 0) <= 0.05 && legs[i].ank.y > legs[i].hip.y - 0.25 && F.box && F.box.kind !== 'floor') note('touch', legs[i].ank.y - legs[i].hip.y + 0.25, t, `${i ? 'R' : 'L'}`);
    // ④ 땅에 선 채 손을 뻗거나 잡은 동안의 발(p3d-0.11.7에 바꿈: 걷는 중의 보폭 74cm는 보통 걸음이라 세지 않는다 — 몸의 수평 빠르기 0.3m/s 아래, 두 발목이 바닥 높이(20cm 아래)일 때만. 벽 문맥에 들어온 뒤도 센다)
    if (K.hands.some(h => h.st === 'reach' || h.st === 'hold') && Math.hypot(sim.body.vel.x, sim.body.vel.z) < 0.3 && Math.max(legs[0].ank.y, legs[1].ank.y) < 0.2) { const d = legs[0].ank.clone().setY(0).distanceTo(legs[1].ank.clone().setY(0)), yaw = sim.body.yaw, left = V().set(Math.cos(yaw), 0, -Math.sin(yaw)), cross = legs[0].ank.clone().sub(legs[1].ank).dot(left) < -0.02;
      if (d > 0.55 || cross) note('gfeet', d * 100, t, `${(d * 100).toFixed(0)}cm${cross ? ' 엇갈림' : ''}`); }
    // ⑥ 닭 날개
    if (onW) for (const [i, H] of K.hands.entries()) { if (H.st !== 'hold') continue; const s = i ? 'R' : 'L', sh = P(`upperArm.${s}`), el = P(`foreArm.${s}`), wr = P(`hand.${s}`), dsw = sh.distanceTo(wr); if (dsw < 0.30 && el.y > sh.y) note('wing', (el.y - sh.y) * 100, t, `${s} 손–어깨 ${(dsw * 100).toFixed(0)}cm 팔꿈치 +${((el.y - sh.y) * 100).toFixed(0)}cm`); }
    // ⑦ 빈손이 엉덩이·허벅지에
    if (onW) for (const [i, H] of K.hands.entries()) { if (H.st !== 'free') continue; const wr = P(`hand.${i ? 'R' : 'L'}`), pel = P('hips'); let d = 9; for (const lg of legs) d = Math.min(d, ptSeg(wr, lg.hip, lg.knee) - 0.11); d = Math.min(d, wr.distanceTo(pel) - 0.17); if (d < 0) note('handhip', -d * 100, t, `${i ? 'R' : 'L'} ${(-d * 100).toFixed(1)}cm`); }
  }
  for (const k of KEYS) TOT[k] += cnt[k]; TOTN += inputs.length;
  out.scenes[id] = { 제목: title, 걸음: inputs.length, 걸음수: cnt, 가장_큰: Object.fromEntries(KEYS.map(k => [k, mx[k].v ? `${mx[k].v.toFixed(1)} @${mx[k].t}s ${mx[k].x}` : ''])) };
  const s = KEYS.filter(k => cnt[k]).map(k => `${NAME[k]} ${cnt[k]}걸음(${mx[k].x} @${mx[k].t}s)`).join(' · ');
  if (s) console.log(`■ ${id.padEnd(7)} ${s}`);
}
console.log(`\n합계(장면 ${all.length}개, ${TOTN}걸음):`);
for (const k of KEYS) console.log(`  ${NAME[k].padEnd(18)} ${String(TOT[k]).padStart(5)}걸음  가장 큰: ${worst[k].at}`);
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ 실행_출처: __P, ...out, 합계: TOT, 가장_큰: worst }, null, 1));
