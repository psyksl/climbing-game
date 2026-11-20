// 지상 이동 물리(W1). 이동·점프·착지는 입력과 이 물리가 정한다. 애니메이션은 몸을 옮기지 않는다(제자리 모션 + 발 고정).
// 단위 m·s. 고정 간격 1/120초. 점프 속도는 사람의 제자리 점프(무게중심 0.2~0.5m 상승) 범위로 둔다.
import * as THREE from 'three';
import { groundAt, pushOut } from './world.js';

export const PHY = {
  DT: 1 / 120, G: 9.81, R: 0.26, HEIGHT: 1.75, STEP_UP: 0.32,
  WALK: 1.4, RUN: 4.2, CROUCH: 0.8, CHARGE_MOVE: 0.4, ACC: 4, DEC: 6, // W1.1: 사람은 한두 걸음에 걸쳐 속도를 낸다(전에는 0.16초 만에 걷는 속도 → 출발 첫 걸음에 뒤에 남은 발이 끌렸다)
   AIR_ACC: 1.5, TURN: 6, // TURN = 몸이 도는 빠르기(rad/s): 반 바퀴 약 0.5초 — 그 사이 발을 고쳐 디딜 수 있게
  TUCK: 0.24, TUCK_T: 0.12, // 공중에서 무릎을 당겨 발이 몸보다 더 올라가는 몫(m)과 그때까지 걸리는 시간
  JUMP_H0: 0.6, JUMP_H1: 1.0, // 방향을 누른 채 뛰면 그쪽으로 0.6~1.6m/s(제자리 멀리뛰기 범위 안)
  PUSH_T: 0.08, LOW_G: 2.4, // p3d-0.6.0(사용자 결정 "언제나 즉시 점프"): 누르면 0.08초 뒤에 JUMP_V1로 뜬다. 오르는 동안 누르고 있지 않으면 중력을 LOW_G배로 받아 낮게 뛴다(바로 떼면 약 0.2m, 끝까지 누르면 약 0.49m)
  PUSH_T0: 0.14, PUSH_T1: 0.24, // 밀기: 떼고 나서 발을 디딘 채 다리를 펴는 시간(짧게 모으면 0.14초, 다 모으면 0.24초). 이 동안 발은 땅에 있다. 다 모았을 때 펴는 끝 빠르기 ≈ 뛰는 속도가 되게 맞춘 값
  CHARGE_MAX: 0.6, JUMP_V0: 2.0, JUMP_V1: 3.1, // 짧게 누르면 2.0m/s(약 0.2m), 0.6초 모으면 3.1m/s(약 0.49m)
};

export function makeBody(pos = new THREE.Vector3(0, 0, 4), yaw = 0) { // 처음에는 벽을 등지고 넓은 쪽을 본다
  return { pos: pos.clone(), vel: new THREE.Vector3(), yaw, onGround: true, ground: 0, charge: 0, charging: false, airT: 0, landImpact: 0, events: [], t: 0, stepT: 0 };
}

// input: { mx, mz (세계 기준 이동 방향, 길이 0~1), run, crouch, jump (누르고 있음) }
export function stepBody(b, input, world) {
  const P = PHY, dt = P.DT; b.events.length = 0; b.t += dt;
  const want = new THREE.Vector2(input.mx || 0, input.mz || 0); if (want.length() > 1) want.normalize();
  const pressed = !!input.jump && !b.jumpHeld; b.jumpHeld = !!input.jump;
  const top = input.crouch ? P.CROUCH : input.run ? P.RUN : P.WALK;
  const yawErr = want.lengthSq() > 0.01 ? Math.abs(Math.atan2(Math.sin(Math.atan2(want.x, want.y) - b.yaw), Math.cos(Math.atan2(want.x, want.y) - b.yaw))) : 0;
  const turnK = b.onGround ? Math.max(0.03, THREE.MathUtils.clamp((Math.cos(yawErr) + 0.2) / 1.2, 0, 1) ** 2) : 1; // 뒤로 돌 때는 먼저 돌고 나서 속도를 낸다(사람처럼 돌며 걸음을 고쳐 디딘다)
  const tv = want.clone().multiplyScalar(top * turnK), hv = new THREE.Vector2(b.vel.x, b.vel.z);
  if (b.onGround) { const dv = tv.clone().sub(hv), acc = tv.lengthSq() > hv.lengthSq() ? P.ACC : P.DEC, m = Math.min(dv.length(), acc * dt); if (dv.lengthSq() > 1e-12) hv.add(dv.normalize().multiplyScalar(m)); }
  else if (want.lengthSq() > 0.01) { const dv = tv.clone().sub(hv), m = Math.min(dv.length(), P.AIR_ACC * dt); if (dv.lengthSq() > 1e-12) hv.add(dv.normalize().multiplyScalar(m)); } // 공중: 방향을 누를 때만 그쪽으로 조금 바꾼다. 누르지 않으면 수평 속도는 그대로(W2: 손을 놓거나 뛴 뒤 속도가 사라지지 않게. 전에는 입력이 없으면 1.5m/s²로 줄였다)
  b.vel.x = hv.x; b.vel.z = hv.y;
  // 몸의 방향: 움직이려는 쪽으로 돈다(땅에 있을 때)
  const hvNow = new THREE.Vector2(b.vel.x, b.vel.z), face = hvNow.length() > 0.35 && hvNow.dot(want) > 0 ? hvNow : want; // 몸은 실제로 움직이는 쪽을 본다(벽에 막혀 옆으로 미끄러질 때 벽을 보지 않게)
  if (b.onGround && face.lengthSq() > 0.01 && want.lengthSq() > 0.01) { const ty = Math.atan2(face.x, face.y); let d = ty - b.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); b.yaw += THREE.MathUtils.clamp(d, -P.TURN * dt, P.TURN * dt); }
  // 점프: 누르는 순간 밀기 시작(달리던 속도는 그대로), 0.08초 뒤에 뜬다. 모으기는 없다(b.charging은 늘 거짓 — 옛 코드와 시험이 읽는 값이라 남겨 둔다)
  b.charging = false; b.charge = 0;
  // 웅크린 채 누르면 다리를 펴는 데 시간이 더 걸린다(깊이 웅크렸으면 0.30초). 서 있을 때는 0.08초
  b.crouchK = (b.crouchK || 0) + ((input.crouch && b.onGround ? 1 : 0) - (b.crouchK || 0)) * (1 - Math.exp(-7 * dt));
  if (pressed && b.onGround && !b.push) { b.push = { t: 0, k: 1, dur: P.PUSH_T + (0.30 - P.PUSH_T) * b.crouchK, held: true }; b.events.push({ type: 'push', k: 1, t: b.t }); }
  else if (b.push && b.onGround) {
    if (!input.jump) b.push.held = false;
    if ((b.push.t += dt) >= b.push.dur) { const k = b.push.held ? 1 : 0; b.push = null; b.vel.y = P.JUMP_V1; b.jumpRise = true; if (want.lengthSq() > 0.01) { const d = want.clone().normalize(), along = b.vel.x * d.x + b.vel.z * d.y, need = P.JUMP_H0 + P.JUMP_H1 * k; if (along < need) { b.vel.x += d.x * (need - along); b.vel.z += d.y * (need - along); } } b.onGround = false; b.airT = 0; b.events.push({ type: 'takeoff', k, vy: b.vel.y, t: b.t }); }
  } else if (b.push) b.push = null;
  if (b.onGround || b.vel.y <= 0) b.jumpRise = false;
  // 적분
  if (!b.onGround) { b.vel.y -= P.G * dt * (b.jumpRise && !input.jump ? P.LOW_G : 1); b.airT += dt; }
  b.pos.addScaledVector(b.vel, dt);
  if (b.onGround) b.noTuck = false; // 벽에서 놓고 떨어질 때는 다리를 당기지 않는다(당긴 발 높이로 옆의 발판 위에 올라서 버리지 않게)
  const tuck = b.onGround || b.noTuck ? 0 : P.TUCK * Math.min(1, b.airT / P.TUCK_T); b.tuck = tuck; // 공중: 발 높이 = 몸 자리 + 당긴 몫
  if (b.r !== undefined && (b.r += 0.4 * dt) >= P.R) b.r = undefined; // 벽에서 막 내려온 몸: 벽에 붙어 있던 만큼만 가깝다가 천천히 지상 반지름으로 돌아간다(한 걸음에 튀어나오지 않게)
  const side = pushOut(world, b.pos, b.r ?? P.R, b.pos.y + tuck, b.pos.y + P.HEIGHT, P.STEP_UP);
  if (side) { const vn = b.vel.x * side.nx + b.vel.z * side.nz; if (vn < 0) { b.vel.x -= vn * side.nx; b.vel.z -= vn * side.nz; } }
  // 공중: 이번 걸음에 내려온 만큼은 지나친 면도 찾는다(다리를 당기지 않고 빠르게 떨어질 때 바닥을 지나쳐 버리지 않게)
  const g = groundAt(world, b.pos.x, b.pos.z, b.pos.y + tuck, b.onGround ? P.STEP_UP : 0.02 + Math.max(0, -b.vel.y) * dt);
  if (b.onGround) {
    if (g.y > -Infinity && b.pos.y - g.y < 0.35) { if (g.y > b.pos.y + 0.01) b.stepT = b.t; b.pos.y = g.y; b.vel.y = 0; b.ground = g.y; }
    else { b.onGround = false; b.airT = 0; b.events.push({ type: 'walkoff', t: b.t }); }
  } else if (b.vel.y <= 0 && g.y > -Infinity && b.pos.y <= g.y) { // 당긴 발이 윗면 위에 있으면 그 면에 내려선다(발을 당겨 단 위로 뛰어오르기)
    const impact = -b.vel.y; b.pos.y = g.y; b.vel.y = 0; b.onGround = true; b.ground = g.y; b.landImpact = THREE.MathUtils.clamp(impact / 4.5, 0.15, 1);
    b.events.push({ type: 'land', impact, t: b.t, airT: b.airT });
  }
  b.landImpact = Math.max(0, b.landImpact - dt * 2.2);
  return b;
}
