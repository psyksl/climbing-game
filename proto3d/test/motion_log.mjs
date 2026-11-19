// 장면별 동작 기록(W1.1, GPT 검토 4번 반송 항목): 실제 실행과 같은 계산(sim.step)을 고정 간격으로 돌려
//  ① 지지 구간마다 디딘 점(발끝·뒤꿈치)의 최대 이탈·누적 이동·축 바뀜(평평 > 뒤꿈치 듦 등)
//  ② 다리 상태가 바뀐 시각(디딤 / 옮기는 중 / 공중)
//  ③ 걸음(1/120초)마다 무릎·발목·팔꿈치 각도와, 한 걸음 회전량이 가장 큰 뼈 · 회전량 변화(앞 걸음 대비)가 가장 큰 뼈
// 를 JSON으로 남긴다. 스크립트 입력(사람 손 아님). 사용: node test/motion_log.mjs <출력.json>
import * as THREE from 'three';
import fs from 'fs';
import { buildCharacter } from '../src/rig.js';
import { makeWorld } from '../src/world.js';
import { makeSim } from '../src/sim.js';
const SCENES = {
  '걷기→달리기→멈춤': [[180, { f: 1 }], [240, { f: 1, run: true }], [190, {}]],
  '급히 뒤로 돌기': [[144, { f: 1 }], [192, { f: -1 }], [144, {}]],
  '웅크림→모으기→점프→착지': [[108, { crouch: true }], [78, { jump: true }], [216, {}]],
};
const rig = buildCharacter(), sim = makeSim(rig, makeWorld()), B = rig.bones, out = { version: 'p3d-0.1.1', note: '스크립트 입력(사람 손 아님). 각도: 무릎·팔꿈치 = 굽힘(0 = 다 폄), 발목 = 발 축 각도(+ 뒤꿈치 듦, - 발끝 듦)', scenes: {} };
const W = n => B[n].getWorldPosition(new THREE.Vector3()), ang = (a, b, c) => { const u = W(b).sub(W(a)).normalize(), v = W(c).sub(W(b)).normalize(); return Math.acos(Math.max(-1, Math.min(1, u.dot(v)))) * 180 / Math.PI; };
for (const [name, segs] of Object.entries(SCENES)) {
  sim.reset({ pos: [0, 0, 6], yaw: 0 }); sim.motion.stats.stances = [];
  const prev = rig.list.map(b => b.quaternion.clone()), last = []; let modes = sim.motion.legs.map(L => L.mode);
  const S = { steps: [], transitions: [], stances: null }; let k = 0;
  for (const [n, a] of segs) for (let i = 0; i < n; i++, k++) {
    sim.step({ mx: 0, mz: a.f || 0, run: !!a.run, crouch: !!a.crouch, jump: !!a.jump });
    let rot = 0, rotB = '', jer = 0, jerB = '';
    rig.list.forEach((b, j) => { const r = prev[j].angleTo(b.quaternion) * 180 / Math.PI, jk = last[j] === undefined ? 0 : Math.abs(r - last[j]); if (r > rot) { rot = r; rotB = b.name; } if (k > 1 && jk > jer) { jer = jk; jerB = b.name; } last[j] = r; prev[j].copy(b.quaternion); });
    const m = sim.motion.legs.map(L => L.mode); m.forEach((x, j) => { if (x !== modes[j]) S.transitions.push({ t: +sim.body.t.toFixed(3), leg: sim.motion.legs[j].s, from: modes[j], to: x }); }); modes = m;
    S.steps.push({ t: +sim.body.t.toFixed(3), speed: +Math.hypot(sim.body.vel.x, sim.body.vel.z).toFixed(3), onGround: sim.body.onGround,
      kneeL: +ang('upLeg.L', 'leg.L', 'foot.L').toFixed(1), kneeR: +ang('upLeg.R', 'leg.R', 'foot.R').toFixed(1), elbowL: +ang('upperArm.L', 'foreArm.L', 'hand.L').toFixed(1), elbowR: +ang('upperArm.R', 'foreArm.R', 'hand.R').toFixed(1),
      ankleL: +((sim.motion.legs[0].heel || 0) * 57.3).toFixed(1), ankleR: +((sim.motion.legs[1].heel || 0) * 57.3).toFixed(1), legs: m.join('/'), maxRot: +rot.toFixed(2), maxRotBone: rotB, maxRotChange: +jer.toFixed(2), maxRotChangeBone: jerB, hipY: +sim.motion.prm.hipY.toFixed(4) });
  }
  for (const L of sim.motion.legs) if (L.stance) sim.motion.stats.stances.push({ leg: L.s, t0: +L.stance.t0.toFixed(3), dur: null, maxDev: L.stance.maxDev, path: L.stance.path, kinds: L.stance.kinds.join('>'), open: true });
  S.stances = sim.motion.stats.stances.map(s => ({ ...s, maxDev_mm: +(s.maxDev * 1000).toFixed(3), path_mm: +(s.path * 1000).toFixed(3) }));
  const top = [...S.steps].sort((a, b) => b.maxRotChange - a.maxRotChange).slice(0, 5);
  S.summary = { 지지구간: S.stances.length, 최대이탈_mm: Math.max(0, ...S.stances.map(s => s.maxDev_mm)), 한구간_누적_최대_mm: Math.max(0, ...S.stances.map(s => s.path_mm)), 상태바뀜: S.transitions.length,
    한걸음_회전_최대: Math.max(...S.steps.map(s => s.maxRot)), 회전량변화_큰_걸음5: top.map(s => ({ t: s.t, bone: s.maxRotChangeBone, change: s.maxRotChange, rot: s.maxRot, legs: s.legs, kneeL: s.kneeL, kneeR: s.kneeR })) };
  out.scenes[name] = S;
  console.log(`${name}: 지지 구간 ${S.summary.지지구간}개 · 최대 이탈 ${S.summary.최대이탈_mm}mm · 한 구간 누적 최대 ${S.summary.한구간_누적_최대_mm}mm · 다리 상태 바뀜 ${S.summary.상태바뀜}번 · 한 걸음 회전 최대 ${S.summary.한걸음_회전_최대.toFixed(1)}° · 회전량 변화가 큰 걸음: ${top.slice(0, 3).map(s => `${s.t}초 ${s.maxRotChangeBone} ${s.maxRotChange.toFixed(1)}°`).join(', ')}`);
}
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
