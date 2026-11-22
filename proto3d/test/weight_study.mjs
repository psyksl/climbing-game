// 체중 싣기의 비교(p3d-0.10.4, GPT의 0.10.3 검토 "자동 체중 이동을 일괄 가속하지 않는다 — 발을 놓는 것과 체중을 싣는 것을 구분하고, 발이 닿자마자 W / 기다린 뒤 W / A·D 이동을 같은 장면에서 비교").
// 장면: h1의 시작(왼손 턱 A → 왼발 낮은 발판). 발이 발판에 디딘 걸음 = 0초. 그 뒤 입력만 바꾼다. 스크립트 입력(사람 손 아님).
// 하중은 세로 힘으로 잰다: 발판 발의 받침 = 그 발의 힘 F.y ÷ 몸무게(m·g), 손·다른 발도 같은 식(0.10.3의 loadS는 |F|를 부드럽게 한 값이라 옆으로 미는 힘까지 들어 있었다 — GPT 지적).
//   잰 것: 발판 발 세로 받침 30%·60%에 든 때(0.1초 유지), 몸이 5mm·3cm 오른 때, 엉덩이가 발판 발 위(옆 5cm 안)에 온 때, 손의 세로 받침, 팔 뼈 가장 빠른 회전.
//   "60%에 든 때"는 플레이어가 기다려야 하는 시간이 아니다(입력은 언제든 받는다). 가슴·어깨가 느리게 움직이는 것도 자세가 맞게 자리 잡았다는 뜻이 아니다.
// 사용: node test/weight_study.mjs [JSON]
import { prov, provLine } from './provenance.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const __P = prov(); console.log(provLine(__P));
const HERE = path.dirname(fileURLToPath(import.meta.url)), SRC = process.env.SRC ? path.resolve(process.env.SRC) : path.resolve(HERE, '../src'), imp = f => import(pathToFileURL(path.join(SRC, f)).href);
const THREE = await import('three');
const { buildCharacter } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js'), { CL } = await imp('climb.js');
const { START, AL, LOW } = await import('./scenes_foot.mjs');
const BW = CL.MASS * 9.81, deg = 180 / Math.PI;
// 입력 계획(발이 디딘 뒤): [이름, (rep) => {...}]
const PLANS = [
  ['① 디디자마자 W 1초', rep => { rep(120, { cy: 1 }); rep(180); }],
  ['② 1.5초 기다린 뒤 W 1초', rep => { rep(180); rep(120, { cy: 1 }); rep(180); }],
  ['③ 디디자마자 D(발판 쪽으로) 0.5초 → W 1초', rep => { rep(60, { cx: 1 }); rep(120, { cy: 1 }); rep(120); }],
  ['④ 입력 없음(자동으로 옮겨 가는 몫만)', rep => { rep(420); }],
];
const out = { plans: {} };
for (const [name, plan] of PLANS) {
  const rig = buildCharacter(), sim = makeSim(rig, makeWorld(), null); sim.reset({ pos: START, yaw: Math.PI }); sim.opt.wallRest = false; sim.opt.footAssist = false;
  const put = (inp, cmd) => sim.step({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd }), pre = (n, inp = {}, cmd = []) => { for (let i = 0; i < n; i++) put(inp, i ? [] : cmd); };
  pre(60); pre(150, {}, [{ type: 'hand', i: 0, p: AL }]); let k = 0, plantK = null; put({}, [{ type: 'foot', i: 0, p: LOW }]);
  for (; k < 400 && plantK === null; k++) { put({}, []); if (sim.climb.feet[0].st === 'plant' && sim.climb.feet[0].box && sim.climb.feet[0].box.kind !== 'floor') plantK = k; }
  const y0 = sim.body.pos.y, rows = [], marks = {}, hold = {}, mark = (key, t, ok) => { hold[key] = ok ? (hold[key] || 0) + 1 : 0; if (hold[key] === 12 && marks[key] === undefined) marks[key] = +(t - 0.1 + 1 / 120).toFixed(3); };
  let t = 0, armMax = 0; const prevQ = {}, rec = [];
  const rep = (n, inp = {}) => { for (let i = 0; i < n; i++) { put(inp, []); t += 1 / 120; rig.root.updateMatrixWorld(true); const K = sim.climb, F = K.feet[0], fy = F.st === 'plant' && F.F ? F.F.y / BW : 0, hy = K.hands.reduce((s, h) => s + (h.st === 'hold' && h.F ? h.F.y / BW : 0), 0), oy = K.feet[1].st === 'plant' && K.feet[1].F ? K.feet[1].F.y / BW : 0;
      mark('발판_발_세로받침_30', t, fy > 0.3); mark('발판_발_세로받침_60', t, fy > 0.6); mark('몸_5mm_오름', t, sim.body.pos.y - y0 > 0.005); mark('몸_3cm_오름', t, sim.body.pos.y - y0 > 0.03);
      if (K.T) mark('엉덩이가_발판_발_위', t, Math.abs(K.T.hip.x - F.a.x) < 0.05);
      for (const n of ['upperArm.L', 'foreArm.L', 'upperArm.R', 'foreArm.R']) { const q = rig.bones[n].getWorldQuaternion(new THREE.Quaternion()); if (prevQ[n]) armMax = Math.max(armMax, prevQ[n].angleTo(q) * deg * 120); prevQ[n] = q; }
      if (Math.round(t * 120) % 12 === 0) rec.push({ 초: +t.toFixed(2), 입력: inp.cy ? 'W' : inp.cx ? 'D' : '', 발판_발: +fy.toFixed(2), 손: +hy.toFixed(2), 바닥_발: +oy.toFixed(2), 몸_오름_cm: +((sim.body.pos.y - y0) * 100).toFixed(1) }); } };
  plan(rep);
  out.plans[name] = { 발판에_디딘_걸음_초: +((plantK + 1) / 120).toFixed(3), 때_초: marks, 팔_뼈_최대_도초: Math.round(armMax), 시간표: rec };
  console.log(`\n■ ${name}  (0초 = 발판에 디딘 걸음)`); console.log('  ' + Object.entries(marks).map(([k2, v]) => `${k2} ${v}초`).join(' · ') + ` · 팔 뼈 최대 ${Math.round(armMax)}°/s`);
  console.log('  ' + rec.filter((_, j) => j % 2 === 0).map(r => `${r.초}${r.입력}: 발판 ${r.발판_발}/손 ${r.손}/바닥 ${r.바닥_발}/↑${r.몸_오름_cm}`).join('  '));
}
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ 실행_출처: __P, 하중_정의: '세로 힘 F.y ÷ (몸무게 × g), 0.1초 유지', ...out }, null, 1));
