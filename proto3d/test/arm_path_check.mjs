// 안전한 팔 경로 점검(p3d-0.10.4, GPT의 0.10.3 검토 "손목이 어깨에 약 2.9cm까지 가까워진다 — 속도 제한만으로 안전한 팔 경로가 완성되지 않았다").
// 모든 장면(발 9 · 한 손 뻗기 6 · h1~h5 · 변형 10)을 계산 걸음마다(1/120초) 재서, 뻗는 손마다 적는다. 스크립트 입력(사람 손 아님). 기준은 개발 쪽 진단선이며 사람의 한계를 잰 것이 아니다.
//   ① 어깨–손목 가장 가까운 거리(물리의 손목 H.w ↔ 어깨 T.sh, 뻗는 동안) — 기준 WRIST_MIN(14cm, 팔을 다 접어도 손목은 어깨에서 이만큼 떨어진다)
//   ② 어깨→손목 축이 도는 가장 빠른 각속도(뻗는 동안, °/s)
//   ③ 제어 뼈대 위팔·팔뚝의 가장 빠른 회전(뻗는 동안, °/s)
//   ④ 막힌 동안의 팔꿈치 헤맴: 손이 막혀(멈춤·지형) 있고 목표·몸·접촉이 바뀌지 않은 걸음에 위팔이 돈 각의 합(°)과 그 걸음 수
//   ⑤ 손의 결과(잡음·거부 까닭)
// 사용: node test/arm_path_check.mjs [JSON]   장면: ONLY=reach3,v6   손목 자리: GRIP=frame   스위치: 실행 출처 참고
import { prov, provLine } from './provenance.mjs'; // 실행 출처 — 소스보다 먼저 불러와 설정 스위치를 켠다
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const __P = prov(); console.log(provLine(__P));
const HERE = path.dirname(fileURLToPath(import.meta.url)), SRC = process.env.SRC ? path.resolve(process.env.SRC) : path.resolve(HERE, '../src'), imp = f => import(pathToFileURL(path.join(SRC, f)).href);
const THREE = await import('three');
const { buildCharacter } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js'), { CL } = await imp('climb.js');
const { SCENES_FOOT, SCENES, SCENES_H, SCENES_HV = [], START } = await import('./scenes_foot.mjs');
const all = [...SCENES_FOOT.map((s, i) => ['foot' + (i + 1), ...s]), ...SCENES.map((s, i) => ['reach' + (i + 1), ...s]), ...SCENES_H.map(s => [s[0].split(' ')[0], ...s]), ...SCENES_HV.map(s => [s[0].split(' ')[0], ...s])].filter(s => !process.env.ONLY || process.env.ONLY.split(',').includes(s[0]));
const WMIN = CL.WRIST_MIN ?? 0.14, deg = 180 / Math.PI;
const out = { 기준: { 어깨_손목_최소_m: WMIN }, scenes: {} }, sum = { 장면: 0, 손목_어깨_최소_cm: 99, 기준_안쪽_걸음: 0, 축_최대: 0, 팔뼈_최대: 0, 헤맴_합: 0, 헤맴_걸음: 0 };
for (const [id, title, fn, assist, , st0] of all) {
  const rig = buildCharacter(), sim = makeSim(rig, makeWorld(), null); sim.reset({ pos: st0 || START, yaw: Math.PI }); sim.opt.wallRest = false; sim.opt.footAssist = !!assist; if (process.env.VARIANT) sim.opt.posture = process.env.VARIANT;
  const inputs = [], put = (inp = {}, cmd = []) => inputs.push({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd }), rep = (n, inp, cmd) => { for (let i = 0; i < n; i++) put(inp, i ? [] : cmd); };
  fn(sim, put, rep);
  const st = [0, 1].map(() => ({ minD: 9, minT: 0, inside: 0, axMax: 0, axT: 0, boneMax: 0, boneT: 0, boneN: '', wander: 0, wanderN: 0, prevAx: null, prevQ: {}, prevGoal: null, prevBody: null, res: [] }));
  for (let k = 0; k < inputs.length; k++) {
    sim.step(inputs[k]); rig.root.updateMatrixWorld(true); const K = sim.climb, t = (k + 1) / 120;
    for (const e of K.events) if (e.limb === 'hand' && ['grab', 'reject', 'slip'].includes(e.type)) st[e.i].res.push(`${t.toFixed(2)} ${e.type}${e.why ? ' ' + e.why : ''}`);
    for (const H of K.hands) { const s = st[H.i], q = {};
      for (const n of [`upperArm.${H.s}`, `foreArm.${H.s}`]) q[n] = rig.bones[n].getWorldQuaternion(new THREE.Quaternion());
      if (H.st !== 'reach' || !K.T) { s.prevAx = null; s.prevQ = q; s.prevGoal = null; continue; }
      const sh = K.T.sh[H.i], r = H.w.clone().sub(sh), L = r.length(), ax = r.clone().normalize();
      if (L < s.minD) { s.minD = L; s.minT = t; } if (L < WMIN - 0.005) s.inside++;
      if (s.prevAx) { const w = s.prevAx.angleTo(ax) * deg * 120; if (w > s.axMax) { s.axMax = w; s.axT = t; } }
      let upW = 0;
      for (const n in q) { const p = s.prevQ[n]; if (!p) continue; const w = p.angleTo(q[n]) * deg * 120; if (n.startsWith('upper')) upW = w; if (w > s.boneMax) { s.boneMax = w; s.boneT = t; s.boneN = n; } }
      // 막힌 동안의 헤맴: 손이 막혀 있고(H.blockT·멈춤) 목표가 1mm 안, 몸이 1mm 안으로 그대로인 걸음
      const same = s.prevGoal && s.prevGoal.distanceTo(H.goal) < 0.001 && s.prevBody && s.prevBody.distanceTo(sim.body.pos) < 0.001;
      if ((H.blockT > 0 || H.selfBlock > 0 || H.armCross > 0) && same) { s.wander += upW / 120; s.wanderN++; }
      s.prevAx = ax; s.prevQ = q; s.prevGoal = H.goal.clone(); s.prevBody = sim.body.pos.clone(); }
  }
  const rows = st.map((s, i) => ({ 손: i ? '오른손' : '왼손', 뻗음: s.minD < 9, 어깨_손목_최소_cm: s.minD < 9 ? +(s.minD * 100).toFixed(1) : null, 그때: +s.minT.toFixed(3), 기준_안쪽_걸음: s.inside, 축_최대_도초: Math.round(s.axMax), 축_때: +s.axT.toFixed(3), 팔뼈_최대_도초: Math.round(s.boneMax), 팔뼈: s.boneN, 팔뼈_때: +s.boneT.toFixed(3), 막힌_동안_위팔_헤맴_도: Math.round(s.wander), 헤맴_걸음: s.wanderN, 결과: s.res })).filter(r => r.뻗음);
  out.scenes[id] = { 제목: title, rows }; sum.장면++;
  for (const r of rows) { sum.손목_어깨_최소_cm = Math.min(sum.손목_어깨_최소_cm, r.어깨_손목_최소_cm); sum.기준_안쪽_걸음 += r.기준_안쪽_걸음; sum.축_최대 = Math.max(sum.축_최대, r.축_최대_도초); sum.팔뼈_최대 = Math.max(sum.팔뼈_최대, r.팔뼈_최대_도초); sum.헤맴_합 += r.막힌_동안_위팔_헤맴_도; sum.헤맴_걸음 += r.헤맴_걸음; }
  for (const r of rows) console.log(`${id.padEnd(7)} ${r.손} 어깨–손목 최소 ${String(r.어깨_손목_최소_cm).padStart(5)}cm(@${r.그때}) 안쪽 ${String(r.기준_안쪽_걸음).padStart(3)}걸음 · 축 ${String(r.축_최대_도초).padStart(5)}°/s(@${r.축_때}) · ${r.팔뼈} ${r.팔뼈_최대_도초}°/s(@${r.팔뼈_때}) · 막힌 헤맴 ${r.막힌_동안_위팔_헤맴_도}°/${r.헤맴_걸음}걸음 · ${r.결과.join(' / ')}`);
}
console.log(`\n합: ${sum.장면}장면 · 어깨–손목 가장 가까움 ${sum.손목_어깨_최소_cm.toFixed(1)}cm · 기준(${WMIN * 100}cm) 안쪽 걸음 ${sum.기준_안쪽_걸음} · 축 최대 ${sum.축_최대}°/s · 팔뼈 최대 ${sum.팔뼈_최대}°/s · 막힌 동안 위팔 헤맴 ${sum.헤맴_합}° / ${sum.헤맴_걸음}걸음`);
out.합 = sum;
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ 실행_출처: __P, ...out }, null, 1));
