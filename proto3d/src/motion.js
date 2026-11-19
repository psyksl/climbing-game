// 기본 모션(W1): 클립을 재생하지 않고, 몸의 실제 속도·상태(물리 결과)로 자세를 만든다.
// - 걸음 주기: 위상 φ는 실제 이동 거리 / 보폭으로만 나아간다(속도와 보폭이 늘 맞는다).
// - 디딘 발은 세계 좌표에 고정한다(미끄러지지 않음). 다리가 모자라면 뒤꿈치를 들어 발끝을 축으로 돌린다(발끝은 그대로).
// - 다리는 두 마디 IK(무릎은 앞으로), 팔은 걸음에 맞춘 흔들기. 상태 값(달리기·웅크림·모으기·공중·착지)은 시간에 따라 부드럽게 바뀐다.
// - 애니메이션은 몸을 옮기지 않는다. 몸의 자리는 controller.js가 정하고, 여기서는 그 자리에 맞는 자세만 만든다.
import * as THREE from 'three';
import { DIM } from './rig.js';
import { aimBone, setWorldQuat, worldPos, twoBone } from './ik.js';

const PHY_DT = 1 / 120;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp, smooth = t => t * t * (3 - 2 * t);
const UP = V(0, 1, 0);
// 걸음 모양(속도에 따라 걷기 ↔ 달리기 사이를 섞는다)
export const GAIT_EXC = 0.66, GAIT_EXC_RUN = 0.58, GAIT_FRONT = 0.24; // 달리기는 디딘 발이 끝까지 펴지기 전에 떼도록 조금 좁게 // 디딘 발이 몸에 대해 움직일 수 있는 거리(m)와 그중 앞쪽(발을 내리는 자리) 몫. 다리 0.84m·엉덩이 관절 0.85m에서 잰 값
export const GAIT = {
  // 한 주기(두 걸음)의 보폭 m. 디딘 발이 몸에 대해 움직이는 거리(duty × 보폭)가 다리로 닿는 범위(앞 FRONT + 뒤, 합 EXC)를 넘지 않게 묶는다
  stride: (v, r) => Math.min(0.8 + 0.48 * v, lerp(GAIT_EXC, GAIT_EXC_RUN, r) / lerp(0.60, 0.30, r)),
  duty: r => lerp(0.60, 0.30, r),                    // 한 발이 땅에 닿아 있는 몫(걷기 0.60, 달리기 0.30)
  lift: r => lerp(0.09, 0.17, r),                    // 흔드는 발의 높이
  runW: v => clamp((v - 2.0) / 1.8, 0, 1),            // 2.0m/s부터 달리기 쪽으로
};

export function makeMotion(rig, body) {
  const fwd0 = yawVec(body.yaw);
  const legs = ['L', 'R'].map((s, i) => {
    const sx = s === 'L' ? 1 : -1, side = V(fwd0.z, 0, -fwd0.x).multiplyScalar(sx); // 캐릭터 왼쪽 = +x(앞 +z 기준)
    const c = body.pos.clone().addScaledVector(side, DIM.hipW * 1.15);
    return { s, sx, off: i * 0.5, mode: 'plant', plant: c.clone(), plantYaw: body.yaw, from: c.clone(), fromYaw: body.yaw, t: 0, dur: 0.3, foot: c.clone(), ankle: c.clone().setY(c.y + DIM.ankleY), pitch: 0, yaw: body.yaw, slide: 0, heel: 0 };
  });
  return {
    rig, legs, phase: 0, prm: { speed: 0, runW: 0, crouch: 0, charge: 0, air: 0, land: 0, lean: 0, hipY: body.pos.y + DIM.hipY - 0.025 }, hipVisY: body.pos.y,
    arms: { swing: 0 }, stats: { maxSlide: 0, slideSum: 0, slideN: 0, maxRatio: 0, kneeFlip: 0, below: 0 }, lastVel: V(), lastSpeed: 0, idleT: 0, takeoffT: -9,
  };
}
export function yawVec(yaw) { return V(Math.sin(yaw), 0, Math.cos(yaw)); }

const follow = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

// 매 물리 걸음마다 부른다(dt = 1/120). body = controller의 몸, world = 지형(발 디딜 높이)
export function stepMotion(M, body, input, world, groundAt, dt) {
  const P = M.prm, hv = V(body.vel.x, 0, body.vel.z), speed = hv.length(), fwd = yawVec(body.yaw), side = V(fwd.z, 0, -fwd.x);
  for (const e of body.events) { if (e.type === 'takeoff') { M.takeoffT = body.t; for (const L of M.legs) { M.hipOffTO = M.hipOff; L.mode = 'air'; L.preBehind = undefined; L.airFrom = L.foot.clone().sub(body.pos).addScaledVector(body.vel, PHY_DT); L.airT0 = body.t; L.airPitch = L.heel || 0; L.airAnk = L.ankleT ? L.ankleT.clone().sub(L.foot).sub(V(0, DIM.ankleY, 0)) : V(); } } if (e.type === 'land') landFeet(M, body, world, groundAt); }
  if (!body.onGround) for (const L of M.legs) if (L.mode !== 'air') { L.mode = 'air'; L.preBehind = undefined; L.airFrom = L.foot.clone().sub(body.pos).addScaledVector(body.vel, PHY_DT); L.airT0 = body.t; L.airPitch = L.heel || 0; L.airAnk = L.ankleT ? L.ankleT.clone().sub(L.foot).sub(V(0, DIM.ankleY, 0)) : V(); M.takeoffT = body.t - 0.3; } // 걸어서 떨어짐: 발 자리·발목 모양을 이어서 // 걸어서 떨어짐: 발이 옛 자리에 남지 않게
  // 상태 값: 목표로 부드럽게 옮긴다(갑자기 튀지 않게). 걷기/달리기의 섞음은 실제 속도에서 나온다
  P.speed = follow(P.speed, body.onGround ? speed : P.speed, 12, dt);
  P.runW = follow(P.runW, GAIT.runW(speed), 6, dt);
  P.crouch = follow(P.crouch, input.crouch && body.onGround ? 1 : 0, 7, dt);
  const pu = body.push ? clamp(body.push.t / body.push.dur, 0, 1) : 0; M.pushHeel = body.push ? 0.75 * pu * pu : 0; // 밀기 끝에는 발끝으로 선다(뒤꿈치 듦 → 다리가 길어진 채 땅을 떠난다)
  if (body.push) P.charge = (1 - pu * pu) * (M.pushFrom ?? P.charge); else { P.charge = follow(P.charge, body.charging ? body.charge / 0.6 : 0, body.charging ? 10 : 18, dt); M.pushFrom = P.charge; } // 밀기: 웅크린 깊이에서 다 편 자세로(발은 디딘 채)
  P.air = follow(P.air, body.onGround ? 0 : 1, body.onGround ? 10 : 6, dt);
  P.land = follow(P.land, body.landImpact, body.landImpact > P.land ? 30 : 6, dt); // 착지 충격도 한 번에 넣지 않는다
  const accel = (speed - M.lastSpeed) / dt; M.lastSpeed = speed; P.lean = follow(P.lean, clamp(accel * 0.02, -0.12, 0.15), 6, dt);
  // 걸음 위상: 실제로 간 거리 / 보폭
  const duty = GAIT.duty(P.runW), S = GAIT.stride(Math.max(speed, 0.4), P.runW);
  const moving = body.onGround && speed > 0.12;
  if (moving) M.phase = (M.phase + speed * dt / S) % 1;
  for (const L of M.legs) stepLeg(M, L, body, world, groundAt, { speed, S, duty, moving, fwd, side, dt });
  // 엉덩이 높이(세계): 땅 높이는 부드럽게 따라가고(계단에서 튀지 않게), 웅크림·모으기·착지·달리기만큼 낮춘다
  const bob = moving ? (lerp(0.022, 0.035, P.runW) * Math.cos(4 * Math.PI * (M.phase - duty / 2))) : Math.sin(body.t * 1.6) * 0.004;
  let hip = DIM.hipY - 0.025 - lerp(0.015, 0.075, P.runW) * clamp(speed / 1.5, 0, 1) - 0.30 * P.crouch - 0.30 * P.charge - 0.22 * P.land + bob * (1 - P.crouch);
  hip += 0.07 * (M.pushHeel / 0.75); // 발끝으로 선 만큼 엉덩이도 높다
  hip -= 1.2 * Math.max(0, ...M.legs.map(L => L.mode === 'plant' ? (L.overAmt || 0) : 0)); // 디딘 발에 닿지 않으면 무릎을 굽혀 엉덩이를 낮춘다
  if (!body.onGround) { hip = DIM.hipY - 0.03; }
  // 엉덩이 높이 = 몸 자리(발 기준) + 높이 차. 높이 차는 속도가 있는 스프링이다: 착지하면 내려오던 속도로 이어서 무릎을 굽혀 받고, 계단에서 몸 자리가 바뀌어도 엉덩이는 이어진다
  if (M.hipOff === undefined) { M.hipOff = hip; M.offV = 0; M.lastY = body.pos.y; }
  if (body.onGround && M.wasGround) M.hipOff -= body.pos.y - M.lastY; // 디딘 채 몸 자리가 오르내리면(계단) 그만큼 높이 차로 옮긴다
  const w = body.onGround ? 20 : 26;
  for (const e of body.events) if (e.type === 'takeoff') M.offV = 0; // 땅을 떠나는 순간 다리 펴기를 멈춘다(그 뒤로는 몸 전체가 뛰는 속도로 오른다)
  if (body.push) { if (M.pushOff0 === undefined) M.pushOff0 = M.hipOff; const h2 = lerp(M.pushOff0, DIM.hipY - 0.025 + 0.07, pu * pu); M.offV = (h2 - M.hipOff) / dt; M.hipOff = h2; } // 밀기: 지금 높이에서 발끝으로 선 높이까지, 점점 빨라지며 편다
  else { M.pushOff0 = undefined; M.offV += (w * w * (hip - M.hipOff) - 2 * w * M.offV) * dt; M.hipOff += M.offV * dt; }
  for (const e of body.events) if (e.type === 'land') M.offV -= e.impact; // 착지: 다음 걸음부터 엉덩이가 내려오던 속도로 이어 내려간다
  M.lastY = body.pos.y; M.wasGround = body.onGround;
  P.hipY = body.pos.y + M.hipOff;
}

function neutralFoot(body, L, ahead = 0) {
  const fwd = yawVec(body.yaw), side = V(fwd.z, 0, -fwd.x);
  return body.pos.clone().addScaledVector(side, L.sx * DIM.hipW * 1.15).addScaledVector(fwd, ahead);
}
function footOut(world, p) { for (const b of world.boxes) { if (b.kind === 'floor' || b.max.y <= p.y + 0.35) continue; const r = 0.09, cx = clamp(p.x, b.min.x, b.max.x), cz = clamp(p.z, b.min.z, b.max.z), dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz); if (d >= r) continue; if (d > 1e-6) { p.x = cx + dx / d * r; p.z = cz + dz / d * r; } else { const o = [[p.x - b.min.x, -1, 0], [b.max.x - p.x, 1, 0], [p.z - b.min.z, 0, -1], [b.max.z - p.z, 0, 1]].sort((a, c) => a[0] - c[0])[0]; p.x += o[1] * (o[0] + r); p.z += o[2] * (o[0] + r); } } }
function groundY(world, groundAt, x, z, y) { const g = groundAt(world, x, z, y + 0.35, 0.0, 0.0); return g.y > -Infinity ? g.y : y; }

function stepLeg(M, L, body, world, groundAt, g) {
  const { speed, S, duty, moving, fwd, dt } = g;
  if (L.mode === 'air') { // 공중: 몸 기준 자리(웅크려 당긴 다리)
    const tuck = clamp((body.t - M.takeoffT) * 2.5, 0, 1) * (1 - 0.5 * smooth(clamp((-body.vel.y - 0.5) / 1.5, 0, 1))); // 내려오면서 다리를 조금씩 편다(한 번에 바꾸지 않음)
    const p = neutralFoot(body, L, (L.s === 'L' ? 0.06 : -0.06) * (0.5 + speed * 0.2)), g = groundY(world, groundAt, p.x, p.z, body.pos.y), h = body.pos.y - g;
    const tuckVis = 0.10 + 0.18 * tuck, up = body.vel.y > 0 ? tuckVis : Math.min(tuckVis, Math.max(0, h)); // 내려올 때는 땅까지 남은 높이만큼만 당겨 둔다 → 닿는 순간 발이 이미 땅에 있다
    p.y = Math.max(g, body.pos.y + up); L.gy = g; L.falling = body.vel.y <= 0;
    const w = smooth(clamp((body.t - (L.airT0 ?? body.t)) / 0.15, 0, 1)); if (L.airFrom && w < 1) p.lerpVectors(body.pos.clone().add(L.airFrom), p, w); // 뛰는 순간의 발 자리(몸 기준)에서 이어서
    L.foot.copy(p); L.pitch = lerp(L.airPitch || 0, 0.25 * tuck, w) * (body.vel.y > 0 ? 1 : clamp(h / 0.25, 0, 1)); L.yaw = body.yaw; L.airW = w; return; // 내려오며 땅에 가까워지면 발을 평평하게
  }
  if (L.mode === 'swing') {
    L.t += dt; // 흔들기 진행 q는 줄어들지 않는다(빨라지거나 느려지면 남은 시간만 바꾼다 → 발이 뒤로 가지 않음)
    let rem = (1 - L.q) * L.dur;
    if (moving && L.gait) { const p = (M.phase + L.off) % 1, rate = speed / S, wrapped = p < L.p0 - 1e-6; rem = wrapped ? 0 : Math.min(1.2, (1 - p) / rate); }
    if (!L.gait || speed < 1.0) rem = Math.min(rem, (1 - L.q) * 0.3); // 느려지거나 멈출 때는 걸음을 짧게 마무리한다(발이 몸 뒤에 남아 늘어나지 않게)
    if (L.hurry) { L.remCap = Math.max(0.05, Math.min(L.remCap ?? rem, rem) - dt * 6); rem = Math.min(rem, L.remCap); } // 서둘러 내릴 때도 한 번에 빨라지지 않게
    L.q = rem <= dt ? Math.min(1, L.q + dt / 0.12) : Math.min(1, L.q + Math.min((1 - L.q) * dt / rem, dt / 0.12)); L.dur = L.t + rem; // 흔들기 전체를 0.12초보다 빨리 끝내지는 않는다(빨라지는 순간 다리가 튀지 않게)
    const q = L.q, remain = rem;
    // 내릴 자리 = 몸이 내릴 때 있을 자리 기준(걷는 중) 또는 기본 자리(멈춘 뒤)
    const mv = smooth(clamp((speed - 0.05) / 0.6, 0, 1)); // 걷는 정도(0 = 멈춤). 멈추거나 출발할 때 발 목표가 한 번에 바뀌지 않게 이 값으로 섞는다
    const ahead = mv * Math.min(duty * S / 2, GAIT_FRONT); // 앞으로 너무 멀리 내리면 닿지 않는다
    const to = neutralFoot(body, L, ahead).addScaledVector(V(body.vel.x, 0, body.vel.z), remain);
    { const sd = V(fwd.z, 0, -fwd.x).multiplyScalar(L.sx), gap = to.clone().sub(body.pos).dot(sd); if (gap < 0.06) to.addScaledVector(sd, 0.06 - gap); } // 몸 가운데를 넘어 반대편에 내리지 않는다(다리가 꼬이지 않게)
    footOut(world, to); // 발 내릴 자리가 지형(벽) 안이면 밖으로
    to.y = groundY(world, groundAt, to.x, to.z, body.pos.y);
    if (L.preBehind === undefined && q > 0.5) L.preBehind = to.clone().sub(body.pos).dot(yawVec(body.yaw)) < -0.02; // 내릴 자리가 몸 앞이면 뒤꿈치 축(발끝 듦), 뒤면 발끝 축
    const e = smooth(q), lift = lerp(0.07, GAIT.lift(M.prm.runW), mv) * (1 - Math.cos(2 * Math.PI * q)) / 2 + Math.max(0, to.y - L.from.y) * Math.sin(Math.PI * Math.min(1, q * 1.4));
    L.foot.lerpVectors(L.from, to, e); L.foot.y = lerp(L.from.y, to.y, e) + lift;
    L.yaw = lerpAngle(L.fromYaw, body.yaw, e); L.pitch = (L.fromPitch || 0) * (1 - smooth(Math.min(1, q * 2))) - lerp(0.1, 0.25, mv) * Math.sin(Math.PI * q) * q; // 뗄 때의 발목 각도(뒤꿈치 듦)에서 이어서, 내릴 때 발끝을 든다
    if (q >= 1) { L.mode = 'plant'; L.since = 0; L.plant.copy(to); L.plantYaw = L.yaw; L.foot.copy(to); L.slide = 0; }
    return;
  }
  // 디딘 발: 세계 자리 고정
  L.foot.copy(L.plant); L.yaw = L.plantYaw; L.since = (L.since || 0) + dt;
  const other = M.legs.find(o => o !== L);
  if (moving) { // 위상이 흔들기 구간에 들어가면 뗀다(걷기는 다른 발이 디뎌 있을 때만)
    const p = (M.phase + L.off) % 1;
    const stale = Math.abs(Math.atan2(Math.sin(body.yaw - L.plantYaw), Math.cos(body.yaw - L.plantYaw))) > 0.9; // 돌기 전 방향 그대로 남은 발
    if (stale && other.mode === 'plant' && L.since > 0.06) { startSwing(L, 0.26); return; } // 걷기 시작할 때 옛 방향의 발부터 고쳐 디딘다(위상보다 먼저)
    if (L.over && other.mode === 'swing') other.hurry = true; // 이 발이 닿지 않게 되면 흔드는 발을 서둘러 내린다
    if ((p >= duty || L.over) && L.since > 0.06 && (other.mode === 'plant' || M.prm.runW > 0.5)) { startSwing(L, (1 - p) / (speed / S)); L.gait = true; L.p0 = p; } // 막 디딘 발은 곧바로 다시 떼지 않는다. 다리가 닿지 않게 되면(L.over) 위상보다 일찍 뗀다
  } else if (body.onGround && other.mode === 'plant') { // 멈춰 있음: 기본 자리에서 멀거나 발 방향이 몸과 많이 다르면 한 발씩 고쳐 디딘다
    const n = neutralFoot(body, L), dErr = Math.hypot(n.x - L.plant.x, n.z - L.plant.z), yawErr = Math.abs(Math.atan2(Math.sin(body.yaw - L.plantYaw), Math.cos(body.yaw - L.plantYaw)));
    const oErr = (() => { const no = neutralFoot(body, other); return Math.hypot(no.x - other.plant.x, no.z - other.plant.z); })();
    if ((dErr > 0.09 || yawErr > 0.6) && dErr >= oErr - 1e-6 && M.prm.charge < 0.05) startSwing(L, yawErr > 0.6 ? 0.24 : 0.32); // 돌 때는 빨리 고쳐 디딘다
  }
}
function startSwing(L, dur) { L.gait = false; L.since = 0; L.fromPitch = L.heel || 0; L.liftOff = L.ankleT ? L.ankleT.clone().sub(L.plant).sub(V(0, DIM.ankleY, 0)) : V(); L.q = 0; L.hurry = false; L.remCap = undefined; L.preBehind = undefined; L.pitch = L.fromPitch; L.mode = 'swing'; L.t = 0; L.dur = clamp(dur, 0.12, 0.6); L.from.copy(L.plant); L.fromYaw = L.plantYaw; } // liftOff = 뗄 때 발목 자리(뒤꿈치를 든 만큼). 흔들기는 거기서 이어서 시작한다
function landFeet(M, body, world, groundAt) {
  for (const L of M.legs) { const p = L.foot.clone(); p.y = groundY(world, groundAt, p.x, p.z, body.pos.y); L.mode = 'plant'; L.since = 0; L.plant.copy(p); L.plantYaw = body.yaw; L.foot.copy(p); }
}
function lerpAngle(a, b, t) { const d = Math.atan2(Math.sin(b - a), Math.cos(b - a)); return a + d * t; }

// 자세를 뼈에 적용한다(그리기 전, 또는 시험에서 매 걸음)
const qYaw = new THREE.Quaternion(), qTmp = new THREE.Quaternion(), eul = new THREE.Euler();
export function applyPose(M, body) {
  const B = M.rig.bones, P = M.prm, fwd = yawVec(body.yaw), side = V(fwd.z, 0, -fwd.x), t = body.t;
  M.rig.root.position.set(body.pos.x, 0, body.pos.z); M.rig.root.rotation.set(0, 0, 0); M.rig.root.updateMatrixWorld(true);
  const moving = P.speed > 0.12 && body.onGround, ph = M.phase * 2 * Math.PI, gaitW = clamp(P.speed / 1.2, 0, 1) * (1 - P.air);
  // 골반: 위치·방향(걸음에 따른 비틀림), 앞으로 기울기
  const twist = gaitW * lerp(0.10, 0.16, P.runW) * Math.sin(ph);
  const leanF = 0.05 * gaitW + 0.16 * P.runW * gaitW + P.lean + 0.30 * P.crouch + 0.22 * P.charge + 0.18 * P.land - 0.10 * P.air;
  B.hips.position.set(body.pos.x - M.rig.root.position.x, P.hipY, body.pos.z - M.rig.root.position.z);
  qYaw.setFromAxisAngle(UP, body.yaw + twist * 0.6);
  setWorldQuat(B.hips, qYaw.clone().multiply(qTmp.setFromEuler(eul.set(leanF * 0.35, 0, 0))));
  // 척추·가슴: 기울기를 나눠 받고, 골반 비틀림과 반대로 돈다
  B.spine.quaternion.setFromEuler(eul.set(leanF * 0.30, -twist * 0.5, 0)); B.spine.updateMatrixWorld(true);
  const breath = Math.sin(t * 1.6) * 0.015 * (1 - gaitW);
  B.chest.quaternion.setFromEuler(eul.set(leanF * 0.35 - breath, -twist * 0.7, 0)); B.chest.updateMatrixWorld(true);
  // 머리: 앞(몸이 가는 쪽)을 본다
  setWorldQuat(B.neck, new THREE.Quaternion().setFromAxisAngle(UP, body.yaw).multiply(qTmp.setFromEuler(eul.set(0.05 + leanF * 0.2, 0, 0))));
  B.head.quaternion.setFromEuler(eul.set(-leanF * 0.15 - 0.03 * P.air, 0, 0)); B.head.updateMatrixWorld(true);
  // 다리: IK
  for (const L of M.legs) {
    const hipJ = worldPos(B[`upLeg.${L.s}`]);
    // 디딘 발이 닿지 않으면 뒤꿈치를 들어 발끝을 축으로 돌린다(발끝 자리는 그대로)
    const fy = yawVec(L.yaw), sole = L.foot.clone();
    let pitch = L.pitch, ankle = sole.clone().setY(sole.y + DIM.ankleY);
    if (L.mode === 'swing' && L.liftOff) ankle.addScaledVector(L.liftOff, 1 - smooth(L.q || 0)); // 뗀 직후에는 뒤꿈치를 든 발목 자리에서 출발
    if (L.mode === 'air' && L.airAnk) ankle.addScaledVector(L.airAnk, 1 - (L.airW ?? 1)); // 뛴 직후: 발끝으로 섰던 발목 자리에서
    const reach = DIM.leg * (0.985 - 0.035 * P.runW); // 달리기는 디딘 다리를 끝까지 펴기 전에 뗀다(무릎을 조금 굽힌 채)
    const solvePivot = (behind, force = 0) => { // 디딘 발: 발이 몸 뒤면 발끝을 축으로 뒤꿈치를, 앞이면 뒤꿈치를 축으로 발끝을 든다(닿는 데 필요한 만큼만). 축 = 발끝·뒤꿈치 뼈 자리
      const pivot = sole.clone().addScaledVector(fy, behind ? DIM.toeZ : DIM.heelZ).add(V(0, 0.02, 0)), r0 = V(0, DIM.ankleY - 0.02, -(behind ? DIM.toeZ : DIM.heelZ));
      const at = a => pivot.clone().add(r0.clone().applyAxisAngle(V(1, 0, 0), a).applyAxisAngle(UP, L.yaw)), maxA = behind ? 0.96 : -0.55;
      let a = 0, an = sole.clone().setY(sole.y + DIM.ankleY);
      if (an.distanceTo(hipJ) > reach) { let lo = 0, hi = 1; if (at(maxA).distanceTo(hipJ) > reach) lo = hi; else for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (at(maxA * m).distanceTo(hipJ) > reach) lo = m; else hi = m; } a = maxA * hi; an = at(a); }
      if (behind && force > a) { a = force; an = at(a); }
      return { a, an };
    };
    if (L.mode === 'plant') {
      if (M.pushHeel > 0) L.pivotBehind = true; else if (!L.heel || L.pivotBehind === undefined) L.pivotBehind = sole.clone().sub(hipJ).dot(fy) < 0; // 밀기 = 발끝으로 선다 // 축(발끝/뒤꿈치)은 발이 평평해졌을 때만 바꾼다
      const r = solvePivot(L.pivotBehind, M.pushHeel); pitch = r.a; ankle = r.an;
      L.heel = pitch; L.overAmt = Math.max(0, ankle.distanceTo(hipJ) - reach); L.over = ankle.distanceTo(hipJ) > reach * 1.004;
    } else L.over = false;
    if (L.mode === 'air' && L.falling && L.gy !== undefined) { // 내려올 때: 땅에 닿기 직전에 디딜 때의 발목 모양으로 미리 옮긴다
      const hgt = sole.y - L.gy, w = smooth(clamp(1 - hgt / 0.2, 0, 1)); if (w > 0) { if (L.preBehind === undefined) L.preBehind = sole.clone().sub(hipJ).dot(fy) < 0; const bh = L.preBehind, r = solvePivot(bh); ankle.lerp(r.an, w); pitch = lerp(pitch, r.a, w); L.pivotBehind = bh; L.heel = r.a; } }
    if (L.mode === 'swing' && (L.q || 0) > 0.5) { // 내리기 직전에는 디딜 때의 발목 모양(발끝 듦/뒤꿈치 듦)으로 미리 옮겨 둔다 → 디디는 순간 튀지 않음
      if (L.preBehind === undefined) L.preBehind = sole.clone().sub(hipJ).dot(fy) < 0; const behind = L.preBehind, r = solvePivot(behind), w = smooth(clamp((L.q - 0.5) / 0.5, 0, 1)); // 축은 한 번 정하면 디딜 때까지 그대로(매 걸음 바뀌면 발이 떨린다)
      ankle.lerp(r.an, w); pitch = lerp(pitch, r.a, w); L.pivotBehind = behind; L.heel = r.a; // 디딘 뒤에도 같은 축·각도에서 이어지게
    }
    const fside = V(fy.z, 0, -fy.x), pole = fy.clone().multiplyScalar(2).add(fwd).normalize().addScaledVector(fside, L.sx * 0.12).add(V(0, -0.05, 0)).normalize(); // 무릎은 발끝 쪽(몸이 돌아도 발 방향을 따른다)
    const ik = twoBone(hipJ, ankle, DIM.thigh, DIM.shin, pole);
    aimBone(B[`upLeg.${L.s}`], ik.mid.clone().sub(hipJ), pole, 'down');
    aimBone(B[`leg.${L.s}`], ik.end.clone().sub(ik.mid), pole, 'down');
    setWorldQuat(B[`foot.${L.s}`], new THREE.Quaternion().setFromAxisAngle(UP, L.yaw).multiply(qTmp.setFromAxisAngle(V(1, 0, 0), pitch)));
    L.ik = ik; L.ankleT = ankle;
  }
  // 팔: 걸음과 반대로 흔들고, 달리면 팔꿈치를 굽힌다. 웅크림·모으기 = 앞으로/뒤로, 공중 = 위로
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1, legPh = s === 'L' ? ph + Math.PI : ph; // 왼팔은 오른다리와 함께
    const swingA = gaitW * lerp(0.32, 0.75, P.runW) * Math.sin(legPh);
    let pitchA = -swingA - 0.45 * P.crouch + 0.55 * P.charge - 1.6 * P.air * clamp(1.2 - (t - M.takeoffT) * 1.6, 0.2, 1) * (1 - P.charge) - 0.25 * P.land;
    const abd = 0.12 + 0.10 * P.air + 0.05 * P.crouch;
    B[`upperArm.${s}`].quaternion.setFromEuler(eul.set(pitchA, 0, sx * abd)); B[`upperArm.${s}`].updateMatrixWorld(true);
    const elbow = lerp(0.18, 1.45, P.runW) * gaitW + 0.15 + 0.5 * P.crouch + 0.25 * P.air + Math.max(0, -swingA) * 0.3;
    B[`foreArm.${s}`].quaternion.setFromEuler(eul.set(-elbow, 0, 0)); B[`foreArm.${s}`].updateMatrixWorld(true);
    B[`hand.${s}`].quaternion.setFromEuler(eul.set(-0.1, 0, 0)); B[`hand.${s}`].updateMatrixWorld(true);
  }
  measure(M, body);
}

// 측정(시험용): 디딘 발의 미끄러짐, 다리 뻗음 비율, 무릎이 뒤로 꺾임, 발이 땅 아래로 들어감
function measure(M, body) {
  const B = M.rig.bones, st = M.stats, fwd = yawVec(body.yaw);
  for (const L of M.legs) {
    const ankW = worldPos(B[`foot.${L.s}`]), heelPivot = L.mode === 'plant' && L.heel < 0;
    const toeW = heelPivot ? B[`foot.${L.s}`].localToWorld(V(0, -(DIM.ankleY - 0.02), DIM.heelZ)) : worldPos(B[`toe.${L.s}`]); // 디딘 축: 발끝을 들면 뒤꿈치
    if (L.mode === 'plant') { // 디딘 축(뒤꿈치를 들면 발끝, 발끝을 들면 뒤꿈치, 평평하면 발끝)과 디딘 자리의 어긋남
      const toePlant = L.plant.clone().addScaledVector(yawVec(L.plantYaw), DIM.toeZ);
      const d = Math.hypot(toeW.x - toePlant.x, toeW.z - toePlant.z);
      if (L.prevToe && L.wasPlant && L.prevHeelPivot === heelPivot) { const v = Math.hypot(toeW.x - L.prevToe.x, toeW.z - L.prevToe.z); st.maxSlide = Math.max(st.maxSlide, v); st.slideSum += v; st.slideN++; }
      L.slide = d; L.wasPlant = true;
    } else L.wasPlant = false;
    L.prevToe = toeW.clone(); L.prevHeelPivot = heelPivot;
    st.maxRatio = Math.max(st.maxRatio, L.ik ? L.ik.ratio : 0);
    // 무릎: 엉덩이-발목 선보다 앞(발 방향)에 있어야 한다
    const hip = worldPos(B[`upLeg.${L.s}`]), knee = worldPos(B[`leg.${L.s}`]), mid = hip.clone().add(ankW).multiplyScalar(0.5), kf = knee.clone().sub(mid).dot(yawVec(L.yaw));
    if (kf < -0.01) st.kneeFlip++;
    const ground = L.mode === 'plant' ? L.plant.y : -Infinity; if (ankW.y < ground + DIM.ankleY * 0.5 && L.mode === 'plant' && L.heel === 0) st.below++;
  }
}
