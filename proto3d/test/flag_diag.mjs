// 자유 다리 균형의 크기 재기(진단, 통과·실패 없음. 스크립트 입력이며 사람 손이 아니다). GPT Reply07 3장 "자유 다리의 위치가 균형에 실제 영향을 주는 작은 진단"의 첫 걸음.
// 이 판의 물리는 몸을 점 하나(몸 자리 + COM_H)로 본다 → 놓인 다리를 어디에 두든 힘·균형이 달라지지 않는다(효과 0). 여기서는 효과를 넣지 않고, "넣는다면 얼마나 큰 효과인가"만 잰다:
//   같은 쪽 손과 발로 버티는 자세(오른손 + 오른발)에서, 놓인 왼다리를 ① 늘어뜨림 ② 왼쪽으로 뻗음 ③ 오른쪽으로 넘김(디딘 발 너머)에 두었을 때
//   몸 마디의 질량으로 구한 무게중심과, 손–발을 잇는 축 둘레로 몸을 돌리려는 중력의 돌림힘(문이 열리듯 도는 쪽)을 적는다.
// 마디 질량 몫은 흔히 쓰는 인체 측정 표의 어림값이다(머리·목 8%, 몸통 50%, 위팔 2.8%, 팔뚝 1.6%, 손 0.6%, 허벅지 10%, 정강이 4.65%, 발 1.45%). 이 캐릭터의 값도, 사람의 정답도 아니다.
// 사용: node test/flag_diag.mjs
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import * as THREE from 'three';
const P3 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), imp = f => import(pathToFileURL(path.join(P3, 'src', f)).href);
const { buildCharacter, DIM } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js'), { twoBone } = await imp('ik.js'), { CL } = await imp('climb.js');
const rig = buildCharacter(), sim = makeSim(rig, makeWorld(), null), V = (x, y, z) => new THREE.Vector3(x, y, z), wp = n => rig.bones[n].getWorldPosition(new THREE.Vector3());
const seg = (a, b, t) => a.clone().lerp(b, t), M = [], add = (m, p) => M.push([m, p]);
const run = (n, inp = {}, cmd = null) => { for (let i = 0; i < n; i++) sim.step({ mx: 0, mz: 0, ...inp, cmd: i === 0 && cmd ? cmd : [] }); };
for (const [title, drop, hi] of [['같은 쪽 손·발(오른손 + 오른발)', 0, 1], ['엇갈린 손·발(왼손 + 오른발)', 1, 0]]) {
sim.reset({ pos: [-0.9, 0, -2.58], yaw: Math.PI }); run(30);
run(150, {}, [{ type: 'hand', i: 0, p: [-1.1, 1.92, -2.84] }]); run(150, {}, [{ type: 'hand', i: 1, p: [-0.7, 1.92, -2.84] }]); run(240, {}, [{ type: 'foot', i: 1, p: [-0.35, 0.5, -2.93] }]);
run(240, { cy: 1 }); run(1, {}, [{ type: 'release', limb: 'hand', i: drop }]); run(240);
const K = sim.climb, H = K.hands[hi], F = K.feet[1]; M.length = 0;
if (H.st !== 'hold' || F.st !== 'plant') { console.log(title + ': 자세를 만들지 못함(손 ' + H.st + ' · 오른발 ' + F.st + ')'); continue; }
// 몸 마디의 무게중심(놓인 왼다리만 가상의 발목 자리로 바꿔 계산한다. 그림과 물리는 건드리지 않는다)
const hips = wp('hips'), neck = wp('neck'), head = wp('head');
add(0.081, head.clone().add(V(0, 0.08, 0))); add(0.497, seg(hips, neck, 0.45));
for (const s of ['L', 'R']) { const sh = wp('upperArm.' + s), el = wp('foreArm.' + s), wr = wp('hand.' + s); add(0.028, seg(sh, el, 0.44)); add(0.016, seg(el, wr, 0.43)); add(0.006, wr); }
{ const hj = wp('upLeg.R'), kn = wp('leg.R'), an = wp('foot.R'); add(0.10, seg(hj, kn, 0.43)); add(0.0465, seg(kn, an, 0.43)); add(0.0145, an); }
const hjL = wp('upLeg.L'), yaw = sim.body.yaw, left = V(Math.cos(yaw), 0, -Math.sin(yaw)), out = V(-Math.sin(yaw), 0, -Math.cos(yaw)); // out = 벽에서 멀어지는 쪽
const com = ank => { const ik = twoBone(hjL, ank, DIM.thigh, DIM.shin, out), P = M.concat([[0.10, seg(hjL, ik.mid, 0.43)], [0.0465, seg(ik.mid, ik.end, 0.43)], [0.0145, ik.end]]), tot = P.reduce((a, x) => a + x[0], 0); return P.reduce((a, x) => a.addScaledVector(x[1], x[0] / tot), V(0, 0, 0)); };
const grip = H.goal.clone(), footP = F.p.clone(), axis = grip.clone().sub(footP).normalize(), mass = 70, g = 9.81;
const cases = { '① 늘어뜨림(고관절 아래)': hjL.clone().add(V(0, -0.86, 0)).addScaledVector(out, 0.03), '② 왼쪽으로 뻗음(옆 55cm, 아래 60cm)': hjL.clone().addScaledVector(left, 0.55).add(V(0, -0.60, 0)).addScaledVector(out, 0.03), '③ 오른쪽으로 넘김(디딘 발 너머 35cm, 아래 70cm)': hjL.clone().addScaledVector(left, -0.45).add(V(0, -0.70, 0)).addScaledVector(out, 0.10) };
const point = V(sim.body.pos.x, sim.body.pos.y + CL.COM_H, sim.body.pos.z), tq = c => axis.dot(c.clone().sub(footP).cross(V(0, -mass * g, 0)));
console.log(`\n■ ${title}: ${hi ? '오른손' : '왼손'} ${H.edge.box.name} + 오른발 ${F.box.name}(다른 손과 왼발은 놓음). 손–발 축의 기울기 ${(Math.acos(axis.y) * 180 / Math.PI).toFixed(0)}°(세로에서)`);
console.log(`물리가 쓰는 무게중심(점 하나): 축에서 옆으로 ${(point.clone().sub(footP).dot(left) * 100 - axis.dot(left) / axis.y * (point.y - footP.y) * 100).toFixed(1)}cm · 놓인 다리를 어디에 두어도 같다(효과 0)`);
console.log('| 놓인 왼다리 | 마디 질량으로 구한 무게중심: 축에서 옆으로(+ = 왼쪽) | ①과의 차이 | 축 둘레의 돌림힘(70kg) | ①과의 차이 |'); console.log('|---|---|---|---|---|');
let base = null, baseT = null;
for (const [nm, ank] of Object.entries(cases)) { const c = com(ank), off = (c.clone().sub(footP).dot(left) - axis.dot(left) / axis.y * (c.y - footP.y)) * 100, t = tq(c); if (base === null) { base = off; baseT = t; }
  console.log(`| ${nm} | ${off.toFixed(1)}cm | ${(off - base >= 0 ? '+' : '') + (off - base).toFixed(1)}cm | ${t.toFixed(1)}N·m | ${(t - baseT >= 0 ? '+' : '') + (t - baseT).toFixed(1)}N·m |`); }
}
console.log('\n읽는 법: 돌림힘이 0에 가까울수록 손–발 축 둘레로 돌지 않는다(문이 열리듯 도는 것을 다리로 막는 것이 플래깅). 축이 세로에 가까우면 중력은 축과 거의 나란해서, 무게중심이 옆으로 치우쳐 있어도 돌림힘은 작다(옆으로 치우친 거리 × 몸무게가 아니다). 이 판의 물리에는 이 회전이 없어 위 차이가 결과에 반영되지 않는다.');
