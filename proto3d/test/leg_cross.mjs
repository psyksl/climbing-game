// 다리끼리 지나감(p3d-0.11.6, 사용자 "57초~1분 사이에 오른발이 왼발을 관통하면서 빠져나온다" — 0.11.5 영상 F 장면, 오른발을 낮은 발판으로 보낼 때).
// 제어 뼈대의 정강이·발(발목 → 발끝) 캡슐과 다른 다리의 넓적다리·정강이·발 캡슐 사이의 틈(표면 거리)을 계산 걸음마다 잰다. 넓적다리끼리는 뺀다(골반에서 붙어 있다).
// 반지름은 마네킹 다리 굵기에 맞춘 개발 쪽 근사(넓적다리 7cm, 정강이 5cm, 발 4cm) — 메시 거리가 아니다. 스크립트 입력(사람 손 아님).
// 사용: node test/leg_cross.mjs [JSON]   캡처 동작: MODE=clip   장면: ONLY=F,u12   비교 스위치: OLDLEGX=1
import { prov, provLine } from './provenance.mjs';
import fs from 'fs'; import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';
const __P = prov(); console.log(provLine(__P));
const HERE = path.dirname(fileURLToPath(import.meta.url)), SRC = process.env.SRC ? path.resolve(process.env.SRC) : path.resolve(HERE, '../src'), imp = f => import(pathToFileURL(path.join(SRC, f)).href);
const THREE = await import('three');
const { buildCharacter } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js');
const SC = await import('./scenes_foot.mjs');
const clips = process.env.MODE === 'clip' ? JSON.parse(fs.readFileSync(path.resolve(HERE, '../assets_local/clips.json'), 'utf8')) : null;
const all = [...SC.SCENES_FOOT.map((s, i) => ['foot' + (i + 1), ...s]), ...SC.SCENES_H.map(s => [s[0].split(' ')[0], ...s]), ...SC.SCENES_V115.map(s => [s[0].split(' ')[0], ...s]), ...SC.SCENES_U.map(s => [s[0].split(' ')[0], ...s])]
  .filter(s => (process.env.ONLY ? process.env.ONLY.split(',') : ['foot1', 'foot2', 'foot3', 'foot4', 'foot9', 'h1', 'h2', 'F', 'u3', 'u5', 'u9', 'u12']).includes(s[0]));
const R = { th: 0.07, sh: 0.05, ft: 0.04 };
function segSeg(p1, q1, p2, q2) { const d1 = q1.clone().sub(p1), d2 = q2.clone().sub(p2), r = p1.clone().sub(p2), a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r), c = d1.dot(r), bb = d1.dot(d2), den = a * e - bb * bb, cl = (x, l, h) => Math.max(l, Math.min(h, x));
  let s = den > 1e-9 ? cl((bb * f - c * e) / den, 0, 1) : 0, t = e > 1e-9 ? (bb * s + f) / e : 0; if (t < 0) { t = 0; s = a > 1e-9 ? cl(-c / a, 0, 1) : 0; } else if (t > 1) { t = 1; s = a > 1e-9 ? cl((bb - c) / a, 0, 1) : 0; }
  return p1.clone().addScaledVector(d1, s).distanceTo(p2.clone().addScaledVector(d2, t)); }
const out = { scenes: {} }; let TOT = { bad: 0, min: 9 };
for (const [id, title, fn, assist, , st0] of all) {
  const rig = buildCharacter(), world = makeWorld(), sim = makeSim(rig, world, clips); sim.reset({ pos: st0 || SC.START, yaw: Math.PI }); sim.opt.wallRest = false; sim.opt.footAssist = !!assist; sim.opt.posture = process.env.VARIANT || 'fb'; sim.opt.grabAssist = !process.env.NOASSIST;
  const inputs = [], put = (inp = {}, cmd = []) => inputs.push({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd }), rep = (n, inp, cmd) => { for (let i = 0; i < n; i++) put(inp, i ? [] : cmd); }; fn(sim, put, rep);
  const B = rig.bones, P = n => B[n].getWorldPosition(new THREE.Vector3()); let min = 9, minAt = 0, minWhat = '', bad = 0, spans = [], cur = null;
  for (let k = 0; k < inputs.length; k++) { sim.step(inputs[k]); rig.root.updateMatrixWorld(true);
    const L = s => ({ hip: P(`upLeg.${s}`), knee: P(`leg.${s}`), ank: P(`foot.${s}`), toe: P(`toe.${s}`) }), a = L('L'), b = L('R');
    let g = 9, what = '';
    for (const [x, y, nx] of [[a, b, 'L→R'], [b, a, 'R→L']]) for (const [p, q, r, n1] of [[x.knee, x.ank, R.sh, '정강이'], [x.ank, x.toe, R.ft, '발']]) for (const [p2, q2, r2, n2] of [[y.hip, y.knee, R.th, '넓적다리'], [y.knee, y.ank, R.sh, '정강이'], [y.ank, y.toe, R.ft, '발']]) { const d = segSeg(p, q, p2, q2) - r - r2; if (d < g) { g = d; what = `${nx[0]} ${n1} ↔ ${nx[2]} ${n2}`; } }
    if (g < min) { min = g; minAt = (k + 1) / 120; minWhat = what; } if (g < -0.01) { bad++; if (!cur) cur = { t0: (k + 1) / 120, d: g, what }; else if (g < cur.d) { cur.d = g; cur.what = what; } cur.t1 = (k + 1) / 120; } else if (cur) { spans.push(cur); cur = null; } }
  if (cur) spans.push(cur);
  out.scenes[id] = { 제목: title, 가장_좁은_틈_cm: +(min * 100).toFixed(1), 그때: +minAt.toFixed(3), 무엇: minWhat, '1cm_넘게_겹친_걸음': bad, 구간: spans.map(s => ({ ...s, d: +(s.d * 100).toFixed(1) })) };
  TOT.bad += bad; TOT.min = Math.min(TOT.min, min);
  console.log(`■ ${id} ${title.slice(0, 40)}: 가장 좁은 틈 ${(min * 100).toFixed(1)}cm @${minAt.toFixed(3)} (${minWhat}), 1cm 넘게 겹친 걸음 ${bad} ${spans.slice(0, 4).map(s => `[${s.t0.toFixed(2)}~${s.t1.toFixed(2)}s ${(s.d * 100).toFixed(1)}cm ${s.what}]`).join(' ')}`);
}
console.log(`합계: 1cm 넘게 겹친 걸음 ${TOT.bad}, 가장 좁은 틈 ${(TOT.min * 100).toFixed(1)}cm`);
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ 실행_출처: __P, ...out, 합계: TOT }, null, 1));
