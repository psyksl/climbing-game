// 팔 급회전의 걸음별 기록(p3d-0.10.3, GPT의 0.10.2 검토: "팔 3000~4100°/s 전환은 방향 변화/축 비틀림/목표 변경을 구분해 원인을 확인"). 진단 — 통과·실패 없음. 스크립트 입력(사람 손 아님).
// 뼈의 세계 회전 빠르기를 뼈 축의 방향 변화(swing)와 축 둘레 비틀림(twist)으로 나누고, 손의 상태·목표(H.w·goal)·극 방향(바람/실제)·사건을 같은 걸음에 적는다.
// 사용: node test/arm_trace.mjs <장면 id> <시작초> <끝초> [팔 L|R] [JSON]   설정: GRIP=frame 등(provenance.mjs)
import { prov, provLine } from './provenance.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const __P = prov(); console.log(provLine(__P));
const HERE = path.dirname(fileURLToPath(import.meta.url)), SRC = process.env.SRC ? path.resolve(process.env.SRC) : path.resolve(HERE, '../src'), imp = f => import(pathToFileURL(path.join(SRC, f)).href);
const THREE = await import('three');
const { buildCharacter } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js');
const { SCENES_FOOT, SCENES, SCENES_H, SCENES_HV = [], START } = await import('./scenes_foot.mjs');
const [id, t0s, t1s, sideS = 'R', outF] = process.argv.slice(2), t0 = +t0s, t1 = +t1s, HI = sideS === 'L' ? 0 : 1;
const all = [...SCENES_FOOT.map((s, i) => ['foot' + (i + 1), ...s]), ...SCENES.map((s, i) => ['reach' + (i + 1), ...s]), ...SCENES_H.map(s => [s[0].split(' ')[0], ...s]), ...SCENES_HV.map(s => [s[0].split(' ')[0], ...s])];
const [, title, fn, assist, mode, st0] = all.find(s => s[0] === id), rig = buildCharacter(), sim = makeSim(rig, makeWorld(), null);
sim.reset({ pos: st0 || START, yaw: Math.PI }); sim.opt.wallRest = false; sim.opt.footAssist = !!assist; if (mode) sim.opt.handMode = mode; if (process.env.VARIANT) sim.opt.posture = process.env.VARIANT;
const inputs = [], put = (inp = {}, cmd = []) => inputs.push({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd }), rep = (n, inp, cmd) => { for (let i = 0; i < n; i++) put(inp, i ? [] : cmd); }; fn(sim, put, rep);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), Q = () => new THREE.Quaternion(), // p3d-0.10.4: V가 인자를 받지 않아 V(0,1,0)이 영벡터였다(손의 swing 10,800°/s는 이 오류 — GPT 지적)
  deg = 180 / Math.PI, r1 = v => +v.toFixed(1), mm = v => +(v * 1000).toFixed(1);
const B = rig.bones, names = [`upperArm.${sideS}`, `foreArm.${sideS}`, `hand.${sideS}`], child = { [`upperArm.${sideS}`]: `foreArm.${sideS}`, [`foreArm.${sideS}`]: `hand.${sideS}` };
const prev = {}, rows = [];
for (let k = 0; k < inputs.length; k++) {
  sim.step(inputs[k]); rig.root.updateMatrixWorld(true); const t = (k + 1) / 120, H = sim.climb.hands[HI];
  const rec = {};
  for (const n of names) { const q = B[n].getWorldQuaternion(Q()), ax = child[n] ? B[child[n]].getWorldPosition(V()).sub(B[n].getWorldPosition(V())).normalize() : V(0, 1, 0).applyQuaternion(q), p = prev[n];
    if (p) { const dq = q.clone().multiply(p.q.clone().invert()), full = 2 * Math.acos(Math.min(1, Math.abs(dq.w))) * deg * 120, swing = p.ax.angleTo(ax) * deg * 120;
      // 비틀림 = 앞 걸음의 축을 지금 축으로 가장 적게 돌린 뒤 남는 축 둘레 회전
      // 비틀림(정확한 분해, p3d-0.10.4): 회전 dq = 비틀림(축 = 지금 뼈 축) × 휘돌림. 비틀림 = dq의 벡터부를 지금 축에 투영한 사원수의 각
      const pr = V(dq.x, dq.y, dq.z).dot(ax), tq = Q().set(ax.x * pr, ax.y * pr, ax.z * pr, dq.w); const tl = Math.hypot(tq.x, tq.y, tq.z, tq.w); const twist = tl > 1e-9 ? 2 * Math.acos(Math.min(1, Math.abs(tq.w / tl))) * deg * 120 : 0;
      rec[n] = { full: r1(full), swing: r1(swing), twist: r1(twist) }; }
    prev[n] = { q, ax }; }
  if (t < t0 - 1e-9 || t > t1 + 1e-9) continue;
  const ps = sim.poleS || {}, pl = ps['el' + sideS], plp = ps['el' + sideS + 'p'];
  rows.push({ t: +t.toFixed(4), 손: H.st, 최종_목표: H.goal.toArray().map(mm), 진행_손목: H.w.toArray().map(mm), 어깨_손목_mm: sim.climb.T ? mm(sim.climb.T.sh[HI].distanceTo(H.w)) : null, 팔꿈치_극: pl ? pl.toArray().map(v => +v.toFixed(3)) : null, 극_바람: plp ? plp.toArray().map(v => +v.toFixed(3)) : null,
    뼈: rec, 표시_손목: B[`hand.${sideS}`].getWorldPosition(V()).toArray().map(mm), 팔꿈치: B[`foreArm.${sideS}`].getWorldPosition(V()).toArray().map(mm), 사건: sim.climb.events.filter(e => e.type !== 'try').map(e => e.type + (e.limb ? ':' + e.limb + e.i : '') + (e.why ? '(' + e.why + ')' : '')).join(',') });
}
console.log(`■ ${id} ${title.slice(0, 50)} 팔 ${sideS} ${t0}~${t1}초 (뼈: 전체 / 축 방향 변화 / 비틀림 °/s)`);
for (const x of rows) console.log(`${x.t.toFixed(4)} ${x.손.padEnd(5)} ` + names.map(n => x.뼈[n] ? `${n.split('.')[0]} ${x.뼈[n].full}/${x.뼈[n].swing}/${x.뼈[n].twist}` : '').join(' | ') + ` | 어깨–손목 ${x.어깨_손목_mm}mm 팔꿈치${x.팔꿈치} 표시 손목${x.표시_손목} 극${x.팔꿈치_극} ${x.사건}`);
if (outF) fs.writeFileSync(outF, JSON.stringify({ 실행_출처: __P, id, rows }, null, 1));
