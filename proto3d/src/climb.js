// 벽 접촉(W2 첫 판): 손을 보내 잡기 · 발 디디기 · 놓기. 접근 A(직접 만든 제어 + 상자 지형 조회).
// 원칙: 손발 자리는 물리가 정한다. 애니메이션으로 닿지 않는 곳을 성공시키지 않는다. 손을 놓아도 몸의 속도는 그대로 이어진다.
// 몸 = 질점 하나(속도·중력) + 팔다리 힘. 팔은 당기기만(곧게 펴지면 줄처럼 버틴다), 다리는 밀기만(마찰 범위 안에서만). 발은 벽에 붙지 않는다.
// 숫자(힘·마찰·각도·시간)는 모두 첫 판의 임시값이다. 캡처 통계는 편한 기본 자세에만 쓰고 허용 판정에는 쓰지 않는다.
import * as THREE from 'three';
import { DIM } from './rig.js';
import { groundAt, pushOut, rayHit } from './world.js';
import { PHY } from './controller.js';
import { aimBone, setWorldQuat, twoBone, worldPos } from './ik.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), Q = () => new THREE.Quaternion(), clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp, UP = V(0, 1, 0), X = V(1, 0, 0), deg = Math.PI / 180;
const mj = u => u * u * u * (10 - 15 * u + 6 * u * u);
// 임계 감쇠 스프링(걸음 길이와 무관하게 안정). p·v를 goal 쪽으로 한 걸음 옮긴다. hl = 반감기(초)
function springS(o, k, goal, hl, dt) { const y = 1.3862943611 / (hl + 1e-5), e = Math.exp(-y * dt), v = o[k + 'V'] || 0, j0 = o[k] - goal, j1 = v + j0 * y; o[k] = e * (j0 + j1 * dt) + goal; o[k + 'V'] = e * (v - j1 * y * dt); }
function springV(p, v, goal, hl, dt) { const y = 1.3862943611 / (hl + 1e-5), e = Math.exp(-y * dt), j0 = p.clone().sub(goal), j1 = v.clone().addScaledVector(j0, y); p.copy(j0).addScaledVector(j1, dt).multiplyScalar(e).add(goal); v.addScaledVector(j1, -y * dt).multiplyScalar(e); }
const short = d => (d < 0.01 ? `${Math.max(1, Math.round(d * 1000))}mm` : `${(d * 100).toFixed(0)}cm`);
const SIDES = ['L', 'R'], KO = { hand: ['왼손', '오른손'], foot: ['왼발', '오른발'] };
const TORSO = ['hips', 'spine', 'chest', 'neck', 'head', 'shoulder.L', 'shoulder.R'];

export const CL = {
  MASS: 70,
  ARM: (DIM.upperArm + DIM.foreArm) * 0.995, PALM: 0.08, LEG: DIM.leg * 0.999, LEG_MIN_H: 0.30,
  SNAP: 0.14, CATCH: 0.004, TRY_T: 0.30,
  HAND_V: 3.2, HAND_ACC: 30, HAND_T0: 0.22, HAND_T1: 0.60, FOOT_V: 1.1, FOOT_T0: 0.28, FOOT_T1: 0.90,
  // p3d-0.8.8 손의 빠르기 곡선(사용자 플레이 1차): HAND_ACC2 = 떠날 때의 가속, HAND_DEC = 다가갈 때의 감속, HAND_V1 = 닿는 순간의 빠르기. 놓인 팔이 쉬는 자리로 돌아가는 시간 = RET_T0 + RET_K × 거리(m), RET_T1까지
  HAND_ACC2: 20, HAND_DEC: 14, HAND_V1: 0.5, RET_T0: 0.30, RET_K: 0.30, RET_T1: 0.62, EXT_DEC: 40,
  // p3d-0.9.0 몸통 자세의 층(실험값 — 비교 측정 뒤 정한다. GPT의 0.8.8 검토): 골반이 몸의 기준 자리에서 벗어나는 몫(K.po)과 그것을 되받는 윗몸.
  //   PO_W = 골반 쪽 무게 ÷ 윗몸 쪽 무게(골반·넓적다리 뿌리 0.22 : 가슴·머리·팔 0.48로 어림. 발에 붙은 다리의 나머지는 세지 않는다), PO_H = 골반에서 윗몸 무게중심까지의 높이.
  //   골반이 P만큼 가면 윗몸의 무게중심은 −PO_W × P만큼 간다(두 점의 무게를 단 평균이 물리의 기준 자리에 남는다 — 몸의 자리를 몰래 옮기지 않는다. 전신 균형을 검증한 것은 아니다)
  //   PO_SIDE = 받치는 발 쪽으로 가는 정도(발이 몸 가운데에서 벗어난 거리 × 이 값, PO_SIDE_MAX까지), PO_BACK = 깊이 접은 다리를 위해 엉덩이를 벽에서 빼는 거리(가장 클 때), PO_YAW = 발을 엇갈려 디딜 때 골반이 도는 각(가장 클 때), PO_REACH = 팔을 거의 다 펴야 닿는 손을 뻗을 때 골반이 반대쪽으로 가는 거리(가장 클 때. 윗몸이 그만큼 목표 쪽으로 간다 = 닿는 거리가 는다 → 고정 수치는 비교 측정 뒤)
  PO_W: 0.46, PO_H: 0.33, PO_SIDE: 0.30, PO_SIDE_MAX: 0.035, PO_BACK: 0.09, PO_YAW: 0.60, PO_REACH: 0, // PO_REACH는 0으로 둔다: 재 보니(test/reach_bound.mjs) 골반을 반대로 보내도 어깨가 목표에 가까워지지 않았다(0 ~ −1cm. 윗몸이 기울며 뻗는 어깨가 내려간다). 값은 실험용으로 남겨 둔다
  ARM_F: 0.65, LEG_F: 1.5, LEG_PERP: 0.35, MU_TOP: 0.9, MU_WALL: 1.0, COM_H: 1.0, MOM: 8,
  GRIP_ANG: 50 * deg, GRIP_MIN: 0.15, SLIP_T: 0.10, SHOCK_V: 1.5,
  KP: 60, KD: 14, ACC_MAX: 7, DAMP: 0.6, SHIFT_V: 0.5, REF_LAG: 0.08,
  BLEND_T: 0.25, TURN: 3, OUT_FEET: 0.30, DANGLE: 0.80, SHOULDER_BACK: -0.2, FACE_MIN: -0.17, SHRUG: 0.42, IDLE_T: 0.05,
  R_TORSO: 0.12, R_HEAD: 0.11, R_GROW: 0.4, TOPPLE: 0.10, ASSIST_T: 0.30,
  // p3d-0.7.0 반동·벽에서 뛰기(임시값):
  //   SWING_A = 손으로만 매달렸을 때 A/D로 엉덩이를 흔드는 힘(가속, 벽과 나란한 쪽). 흔들리는 쪽과 같은 때에 넣으면 커지고 반대로 넣으면 줄어든다. HANG_DAMP = 매달려 흔들릴 때의 감쇠(초당)
  //   PUSH_A·PUSH_T = 벽에서 뛰기의 미는 가속과 시간(손발이 낼 수 있는 힘 안에서만 난다 — 디딘 발이 없으면 팔로 당기는 만큼만). 오르는 중에 떼면 밀기가 그때 끝난다
  //   FOLD = 팔이 다 접힌 거리(어깨~손목). 몸이 그보다 손에 가까워진 채 올라가면 그 손은 놓인다
  SWIVEL_ACC: 300, SWING_A: 1.3, HANG_DAMP: 0.12, PUSH_A: 17, PUSH_T: 0.20, FOLD: 0.24, ARM_BURST: 0.85, // ARM_BURST = 뛰는 동안(0.2초) 한 팔이 순간적으로 낼 수 있는 당기는 힘(몸무게 배). 평소 버티는 힘은 ARM_F
};

// ── 지형: 잡을 수 있는 모서리(상자 윗면의 가장자리)와 디딜 수 있는 면 ──
export function gripEdges(world) {
  if (world.edges && world.edgesN === world.boxes.length) return world.edges;
  const E = [];
  for (const b of world.boxes) {
    if (b.kind === 'floor') continue;
    const y = b.max.y;
    E.push({ box: b, n: V(0, 0, 1), a: V(b.min.x, y, b.max.z), b: V(b.max.x, y, b.max.z) });
    E.push({ box: b, n: V(0, 0, -1), a: V(b.min.x, y, b.min.z), b: V(b.max.x, y, b.min.z) });
    E.push({ box: b, n: V(1, 0, 0), a: V(b.max.x, y, b.min.z), b: V(b.max.x, y, b.max.z) });
    E.push({ box: b, n: V(-1, 0, 0), a: V(b.min.x, y, b.min.z), b: V(b.min.x, y, b.max.z) });
  }
  world.edges = E; world.edgesN = world.boxes.length;
  return E;
}
const insideAny = (world, p, skip) => world.boxes.some(b => b !== skip && p.x > b.min.x && p.x < b.max.x && p.y > b.min.y && p.y < b.max.y && p.z > b.min.z && p.z < b.max.z);
// 손이 들어갈 틈: 모서리 바로 앞(아래·위)과 윗면 위가 다른 상자로 막혀 있지 않아야 한다
const openAt = (world, e, p) => !insideAny(world, p.clone().addScaledVector(e.n, 0.05).add(V(0, -0.04, 0)), e.box) && !insideAny(world, p.clone().addScaledVector(e.n, 0.05).add(V(0, 0.04, 0)), null) && !insideAny(world, p.clone().addScaledVector(e.n, -0.03).add(V(0, 0.04, 0)), e.box);
export function resolveGrip(world, pt) {
  let best = null;
  for (const e of gripEdges(world)) {
    const ab = e.b.clone().sub(e.a), len = ab.length();
    if (len < 0.12) continue;
    const t = clamp(pt.clone().sub(e.a).dot(ab) / (len * len), 0.05 / len, 1 - 0.05 / len), p = e.a.clone().addScaledVector(ab, t), d = p.distanceTo(pt);
    // 겨눈 점이 그 턱(얇은 상자)의 겉에 있으면 모서리에서 조금 멀어도 그 턱의 모서리로 본다(아래에서 올려다보면 턱의 밑면을 겨누게 된다)
    const b = e.box, on = b.max.y - b.min.y < 0.12 && pt.x > b.min.x - 0.03 && pt.x < b.max.x + 0.03 && pt.y > b.min.y - 0.03 && pt.y < b.max.y + 0.03 && pt.z > b.min.z - 0.03 && pt.z < b.max.z + 0.03;
    if ((d <= CL.SNAP || (on && d <= 0.30)) && (!best || d < best.d) && openAt(world, e, p)) best = { d, edge: e, p, n: e.n };
  }
  return best;
}
// 손목이 가야 할 자리: 손바닥(손목에서 8cm)이 모서리에 걸리도록 모서리 아래·조금 앞
// 잡을 때의 손목 자리: 모서리에서 턱 바깥으로 GRIP_OUT, 손바닥 길이만큼 아래. p3d-0.8.3: 바깥으로 2cm → 4cm(팔뚝 끝의 실제 반지름 3.6cm가 턱 앞면에 들어가지 않게. 2cm일 때는 잡고 있는 자세에서 팔뚝 끝 표면이 턱 안 1.5cm였다)
const GRIP_OUT = 0.04, anchorOf = g => g.p.clone().add(V(0, -Math.sqrt(CL.PALM * CL.PALM - GRIP_OUT * GRIP_OUT), 0)).addScaledVector(g.n, GRIP_OUT);
// 발을 디딜 면: 윗면(올라서는 면) 또는 옆면(벽에 대고 누르는 면). 얇은 턱은 앞면을 겨눠도 윗면으로 본다
export function resolveFoot(world, pt, yaw) {
  let best = null;
  for (const b of world.boxes) {
    const m = 0.06;
    if (pt.x < b.min.x - m || pt.x > b.max.x + m || pt.y < b.min.y - m || pt.y > b.max.y + m || pt.z < b.min.z - m || pt.z > b.max.z + m) continue;
    const thin = b.max.y - b.min.y < 0.12, dTop = Math.abs(pt.y - b.max.y);
    if (dTop <= m || thin || b.kind === 'floor') {
      const p = V(clamp(pt.x, b.min.x + 0.01, b.max.x - 0.01), b.max.y, clamp(pt.z, b.min.z + 0.01, b.max.z - 0.01)), d = p.distanceTo(pt);
      if (!insideAny(world, p.clone().add(V(0, 0.05, 0)), b) && (!best || d < best.d)) best = { d, p, n: UP.clone(), kind: 'top', box: b };
      continue;
    }
    const faces = [[V(0, 0, 1), b.max.z - pt.z], [V(0, 0, -1), pt.z - b.min.z], [V(1, 0, 0), b.max.x - pt.x], [V(-1, 0, 0), pt.x - b.min.x]].sort((a, c) => Math.abs(a[0]) - Math.abs(c[0]));
    const [n, dist] = faces.sort((a, c) => Math.abs(a[1]) - Math.abs(c[1]))[0];
    if (Math.abs(dist) > m) continue;
    const p = pt.clone().addScaledVector(n, dist);
    if (!insideAny(world, p.clone().addScaledVector(n, 0.05), b) && (!best || Math.abs(dist) < best.d)) best = { d: Math.abs(dist), p, n, kind: 'smear', box: b };
  }
  if (!best) return null;
  const fwd = best.kind === 'smear' ? best.n.clone().negate() : V(Math.sin(yaw), 0, Math.cos(yaw)), fy = Math.atan2(fwd.x, fwd.z);
  const q = Q().setFromAxisAngle(UP, fy).multiply(Q().setFromAxisAngle(X, best.kind === 'smear' ? -0.6 : 0));
  return { ...best, q, patch: best.kind === 'top' ? patchOf(best.p, fwd, best.box) : null };
}
// 발바닥이 윗면에 닿는 범위(축에 나란한 네모로 어림): 누르는 점(압력 중심)은 이 안에서만 옮길 수 있다
function patchOf(p, fwd, box) {
  const a = p.clone().addScaledVector(fwd, -(DIM.ballZ - DIM.heelZ)), c = p.clone().addScaledVector(fwd, 0.06), w = 0.045, sx = Math.abs(fwd.z) * w, sz = Math.abs(fwd.x) * w;
  return { x0: Math.max(box.min.x, Math.min(a.x, c.x) - sx), x1: Math.min(box.max.x, Math.max(a.x, c.x) + sx), z0: Math.max(box.min.z, Math.min(a.z, c.z) - sz), z1: Math.min(box.max.z, Math.max(a.z, c.z) + sz), y: p.y };
}
const footGeom = (p, n, q) => { const ball = p.clone().addScaledVector(n, 0.02); return { ball, ank: ball.clone().sub(V(0, -(DIM.ankleY - 0.02), DIM.ballZ).applyQuaternion(q)) }; };

// ── 상태 ──
export function makeClimb() {
  const hand = (s, i) => ({ s, i, st: 'free', w: V(), rel: V(i ? -0.08 : 0.08, -0.5, 0.1), from: V(), via: V(), goal: V(), grip: V(), n: V(0, 0, 1), edge: null, t: 0, T: 0, tryT: 0, load: 0, bad: 0, ov: 0, why: '' });
  const foot = (s, i) => ({ s, i, st: 'free', a: V(), rel: V(0, -CL.DANGLE, 0), from: V(), via: V(), p: V(), ball: V(), ank: V(), q: Q(), n: UP.clone(), kind: 'top', box: null, patch: null, t: 0, T: 0, tryT: 0, load: 0, ok: false, auto: false, why: '' });
  return { on: false, hands: [hand('L', 0), hand('R', 1)], feet: [foot('L', 0), foot('R', 1)], ref: V(), lean: { x: 0, z: 0 }, shrug: [0, 0], pz: { twist: 0, hipRoll: 0, lookY: 0, lookP: 0, tuck: 0, breath: 0 }, po: { x: 0, z: 0, yaw: 0 }, sideIn: 0, accS: V(), bumpT: -9, blend: null, out: null, T: null, events: [], log: [], tick: 0, exited: false,
    stats: { palmErr: 0, footErr: 0, pen: 0, penWhat: '', selfPen: 0, dvMax: 0, dvAt: -1, wallHit: 0 } };
}
function note(S, type, limb, i, why = '', extra = {}) {
  const K = S.climb, e = { k: K.tick, t: +(K.tick / 120).toFixed(3), type, limb, i, name: limb ? KO[limb][i] : '', why, ...extra };
  K.events.push(e); K.log.push(e); if (K.log.length > 300) K.log.shift();
  return e;
}

// ── 몸통의 틀: 어깨·고관절 자리. 물리와 그림이 같은 함수를 쓴다(손이 잡은 자리와 그림이 어긋나지 않게) ──
// 몸통 자세의 층을 쓰는가: 비교 스위치 OLDPOSE(시험)·K.oldPose(화면의 실험 설정)가 켜져 있으면 0.8.8의 몸통 그대로다
export const poseOn = K => !globalThis.OLDPOSE && !K.oldPose && !!K.po;
export function torso(b, K) {
  // 몸의 층(p3d-0.8.0, K.pz — 계산 걸음에서만 바뀐다): 가슴 비틀기(뻗는 손·잡은 손 쪽 어깨가 벽으로)와 골반의 반대 비틀기, 골반 기울기(체중이 실린 쪽이 올라가고 어깨 선은 반대로), 머리가 목표(옮기는 발 > 뻗는 손 > 겨눈 곳)를 보고 몸이 옆으로 기울어도 머리는 덜 기운다, 뛰는 동안 윗몸을 젖히고 위를 봄, 숨
  const Z = K.pz, br = 0.02 * Math.sin(Z.breath * 1.9), tk = clamp(Z.tuck, 0, 1);
  // 잡은 팔이 머리에 닿으면 **목과 머리**가 비킨다(p3d-0.8.6. K.hg). 0.8.5는 윗몸 전체를 기울였는데, 팔을 다 편 채로 윗몸이 물러나면 팔 길이에 끌려 몸이 벽 쪽으로 딸려 가고 디딘 발이 떨어졌다
  const hgx = K.hg ? K.hg.x : 0, hgz = K.hg ? K.hg.z : 0;
  const tq = { hips: Q().setFromAxisAngle(UP, b.yaw - Z.twist * 0.3).multiply(Q().setFromAxisAngle(V(0, 0, 1), K.lean.z * 0.4 + Z.hipRoll)), spine: Q().setFromEuler(new THREE.Euler(K.lean.x - 0.16 * tk, 0, K.lean.z * 0.6 - Z.hipRoll * 1.2, 'ZXY')), chest: Q().setFromAxisAngle(UP, Z.twist * 1.3),
    neck: Q().setFromAxisAngle(X, K.hands.some(h => h.st === 'hold') ? -0.18 : 0).multiply(Q().setFromEuler(new THREE.Euler(Z.lookP * 0.4 - 0.12 * tk + hgx, Z.lookY * 0.4, -K.lean.z * 0.4 + hgz, 'YXZ'))), head: Q().setFromEuler(new THREE.Euler(Z.lookP * 0.6 - 0.14 * tk + hgx * 0.5, Z.lookY * 0.6, -K.lean.z * 0.4 + hgz * 0.5, 'YXZ')),
    'shoulder.L': Q().setFromAxisAngle(V(0, 0, 1), K.shrug[0] + br), 'shoulder.R': Q().setFromAxisAngle(V(0, 0, 1), -K.shrug[1] - br) };
  if (K.blend) { const k = mj(clamp(K.blend.t / CL.BLEND_T, 0, 1)); for (const n of TORSO) tq[n] = K.blend.q[n].clone().slerp(tq[n], k); }
  const hip = V(b.pos.x, b.pos.y + DIM.hipY, b.pos.z), qS = tq.hips.clone().multiply(tq.spine);
  // p3d-0.9.0 몸통 자세의 층(K.po — 계산 걸음에서만 바뀐다): 골반이 기준 자리에서 옆(x, 왼쪽이 +)·앞뒤(z, 벽 쪽이 +)로 벗어나고 제 축으로 돈다(yaw). 윗몸은 골반을 축으로 반대로 기울어 무게를 되받는다.
  //   윗몸의 무게중심(골반 위 PO_H)이 −(1 + PO_W) × P만큼 가도록 척추를 돌린다(가장 작은 회전). 골반이 도는 것은 고관절의 자리와 골반의 그림에만 들어가고 가슴·어깨의 방향은 그대로다(척추가 되돌린다).
  const P = poseOn(K) ? K.po : null;
  if (P && (P.x || P.z || P.yaw)) { const kb = K.blend ? mj(clamp(K.blend.t / CL.BLEND_T, 0, 1)) : 1, off = V(Math.cos(b.yaw), 0, -Math.sin(b.yaw)).multiplyScalar(P.x * kb).add(V(Math.sin(b.yaw), 0, Math.cos(b.yaw)).multiplyScalar(P.z * kb));
    hip.add(off); const L = V(0, CL.PO_H, 0).applyQuaternion(qS), w = L.clone().cross(off.multiplyScalar(-(1 + CL.PO_W))).multiplyScalar(1 / L.lengthSq()), a = w.length();
    if (a > 1e-6) qS.premultiply(Q().setFromAxisAngle(w.multiplyScalar(1 / a), Math.min(a, 0.6)));
    tq.hips = tq.hips.clone().multiply(Q().setFromAxisAngle(UP, P.yaw * kb)); tq.spine = tq.hips.clone().invert().multiply(qS); }
  const qH = tq.hips, qC = qS.clone().multiply(tq.chest);
  const chest = hip.clone().add(V(0, DIM.spine, 0).applyQuaternion(qH)).add(V(0, DIM.chest, 0).applyQuaternion(qS));
  const sh = SIDES.map((s, i) => { const sx = i ? -1 : 1, qSh = qC.clone().multiply(tq[`shoulder.${s}`]); return chest.clone().add(V(sx * DIM.clavX, DIM.clavY, 0).applyQuaternion(qC)).add(V(sx * DIM.shoulderX, 0, 0).applyQuaternion(qSh)); });
  const hj = SIDES.map((s, i) => hip.clone().add(V((i ? -1 : 1) * DIM.hipW, -DIM.hipDrop, 0).applyQuaternion(qH)));
  const head = chest.clone().add(V(0, DIM.neck + DIM.head + DIM.headR * 0.9, 0).applyQuaternion(qC));
  return { tq, hip, sh, hj, chest, head, qC };
}
const joints = S => (S.climb.on && S.climb.T ? S.climb.T : { sh: SIDES.map(s => worldPos(S.rig.bones[`upperArm.${s}`])), hj: SIDES.map(s => worldPos(S.rig.bones[`upLeg.${s}`])) });
const armPole = (yaw, sx) => V(sx * 0.5, -1, -0.35).applyAxisAngle(UP, yaw).normalize();
// 팔꿈치의 기본 방향: 아래·바깥·조금 뒤. 팔꿈치가 벽·턱에 들어가면 들어가지 않을 때까지 더 뒤·바깥으로 돌린다
// q = 가슴의 방향(벽 문맥). 팔꿈치의 기본 방향은 몸통을 따라 돈다(몸이 옆으로 기울어 흔들릴 때 팔꿈치가 머리 쪽으로 접히지 않게). 없으면 몸이 보는 쪽만
// full(뻗는 팔, p3d-0.8.2): 팔꿈치 한 점만이 아니라 팔뚝·위팔의 캡슐(armHit)까지 지형에 겹치지 않는 후보를 고른다. 다 겹치면 가장 덜 겹치는 후보와 그 겹침(hit)을 돌려준다.
//   잡은 팔과 판정(armCheck)은 전처럼 팔꿈치만 본다(잡은 손의 팔뚝은 턱에 닿아 있는 것이 정상이라 캡슐로 보면 후보가 걸음마다 바뀐다)
function armIK(world, sh, tgt, yaw, sx, q = null, full = false, tb = null) {
  let ik, pole, best = null;
  for (const c of [[0.5, -1, -0.35], [0.6, -0.6, -0.8], [0.3, -0.3, -1], [1, -0.3, -0.4], [0.2, 0.2, -1]]) { pole = V(sx * c[0], c[1], c[2]); if (q) pole.applyQuaternion(q); else pole.applyAxisAngle(UP, yaw); pole.normalize(); ik = twoBone(sh, tgt, DIM.upperArm, DIM.foreArm, pole);
    const elbowIn = world.boxes.some(x => ik.mid.x > x.min.x - 0.03 && ik.mid.x < x.max.x + 0.03 && ik.mid.y > x.min.y - 0.03 && ik.mid.y < x.max.y + 0.03 && ik.mid.z > x.min.z - 0.03 && ik.mid.z < x.max.z + 0.03);
    if (!full) { if (!elbowIn) break; continue; }
    const hit = armHit(world, sh, ik, tb), cost = (hit ? hit.d : 0) + (elbowIn ? 0.05 : 0); if (!best || cost < best.cost - 1e-6) best = { ik, pole: pole.clone(), hit, cost }; if (!cost) break; }
  return full ? best : { ik, pole };
}
// 팔의 대리 형상이 지형에 겹친 가장 깊은 곳(B4). p3d-0.8.3: **그려지는 팔의 실제 굵기**로 잰다(rig.js의 팔 메시: 팔뚝 반지름 4.5 → 3.6cm, 위팔 5.5 → 4.5cm, 손목 끝은 둥글게 닫힌다).
// 0.8.2는 반지름 3cm(손목 옆 1.8cm)의 다섯 점이었고, 대리 형상으로는 0인데 메시의 팔뚝 끝이 턱 안 2cm에 들어가 있었다(GPT의 반례. 표면으로 재면 여덟 장면 중 여섯에서 1.3~2.4cm).
// 팔뚝 = 팔꿈치~손목의 열한 점(2.7cm 간격. 공 사이의 골은 여유 ARM_PAD로 덮는다), 위팔 = 팔꿈치 쪽 여섯 점(어깨 쪽은 몸통과 같이 벽 앞에 있다).
// 돌려주는 값 { d = 겹친 깊이, n = 가장 얕게 빠지는 쪽, t = 팔뚝에서 손목 쪽 몫(위팔이면 -1), f = 팔뚝만의 겹침 } 또는 null. 바닥은 보지 않는다
// tb = 잡으러 가는 턱(있으면): 그 턱에는 여유를 1mm만 둔다. 잡을 때의 손목 자리는 턱 앞면에서 4cm 앞이고 팔뚝 끝의 반지름이 3.6cm라, 여유 4mm를 다 두면 잡는 자리에 들어가지 못한다(표면은 겹치지 않는다)
export const ARM_R = { fore: [0.045, 0.036], upper: [0.055, 0.045] }, ARM_PAD = 0.004, ARM_PAD_GRIP = 0.001;
export const ARM_PTS = Array.from({ length: 11 }, (_, k) => [k / 10, lerp(ARM_R.fore[0], ARM_R.fore[1], k / 10)]), ARM_UP = [0.45, 0.56, 0.67, 0.78, 0.89, 1].map(t => [t, lerp(ARM_R.upper[0], ARM_R.upper[1], t)]);
// 공(가운데 p, 반지름 r)이 상자에 겹친 깊이와 빠지는 쪽. 모서리는 둥글게 잰다(상자를 r만큼 부풀린 네모로 재면 모서리 앞에서 겹치지 않는데도 겹쳤다고 본다 —
// 당겨 올라가 어깨가 턱 앞 아래에 있을 때 위팔이 늘 "겹침"이 되어 손이 끝내 가지 못했다)
function sphereBox(p, r, x) {
  const cx = clamp(p.x, x.min.x, x.max.x), cy = clamp(p.y, x.min.y, x.max.y), cz = clamp(p.z, x.min.z, x.max.z), dx = p.x - cx, dy = p.y - cy, dz = p.z - cz, d2 = dx * dx + dy * dy + dz * dz;
  if (d2 > 1e-12) { const d = Math.sqrt(d2); return d >= r ? null : { d: r - d, n: V(dx / d, dy / d, dz / d) }; }
  const e = [[p.x - x.min.x, -1, 0, 0], [x.max.x - p.x, 1, 0, 0], [p.y - x.min.y, 0, -1, 0], [x.max.y - p.y, 0, 1, 0], [p.z - x.min.z, 0, 0, -1], [x.max.z - p.z, 0, 0, 1]].reduce((u, v) => (v[0] < u[0] ? v : u));
  return { d: e[0] + r, n: V(e[1], e[2], e[3]) };
}
// ── 제 몸(p3d-0.8.5): 뻗는 팔이 제 머리·몸통을 비켜 간다 ──
// 부피는 그리는 메시와 같은 치수다(rig.js): 머리 = 반지름 11cm의 공(메시는 0.9 × 1.05 × 1로 눌린 타원체 — 가장 긴 반지름으로 잡는다), 가슴 상자 0.36 × 0.24 × 0.21, 골반·허리 상자 0.30 × 0.34 × 0.19.
// 벽 문맥에서는 torso()의 값(물리와 그림이 같은 값), 지상에서는 앞 걸음에 확정된 뼈 자리에서 만든다
function selfShapes(S, i = -1) { const B = selfBody(S); if (!B) return null;
  // 다른 팔(p3d-0.8.5 → 0.8.6: 줄기 3cm가 아니라 **그려지는 굵기** — 위팔 5.5 → 4.5cm, 팔뚝 4.5 → 3.6cm). 앞 걸음에 확정된 뼈 자리에서 읽는다. 팔을 엇갈려 잡을 때 두 팔뚝이 서로를 지나가지 않게 한다(팔꿈치 방향을 고르는 데와 손목이 가는 길에 쓴다. 이것으로 잡기를 거부하지는 않는다)
  if (i >= 0 && !globalThis.NOARMS) { const o = i ? 'L' : 'R', Bn = S.rig.bones, a = worldPos(Bn[`upperArm.${o}`]), e = worldPos(Bn[`foreArm.${o}`]), w = worldPos(Bn[`hand.${o}`]); B.caps = [{ a, b: e, ra: ARM_R.upper[0], rb: ARM_R.upper[1] }, { a: e, b: w, ra: ARM_R.fore[0], rb: ARM_R.fore[1] }]; }
  return B; }
function selfBody(S) {
  const K = S.climb; if (globalThis.NOSELF) return null;
  // 지상(땅에 서서·뛰며 뻗는 팔): 앞 걸음에 확정된 자세의 뼈에서 읽는다(지상 문맥의 어깨 자리도 그렇게 읽는다 — joints)
  if (!K.on || !K.T) { const Bn = S.rig.bones, wq = n => Bn[n].getWorldQuaternion(Q()), qHd = wq('head'), qC = wq('chest'), qH = wq('hips');
    return { head: { c: worldPos(Bn.head).add(V(0, DIM.headR * 0.9, 0.01).applyQuaternion(qHd)), r: DIM.headR },
      boxes: [{ c: worldPos(Bn.chest).add(V(0, 0.11, 0.005).applyQuaternion(qC)), q: qC, qi: qC.clone().invert(), h: V(0.18, 0.12, 0.105) }, { c: worldPos(Bn.hips).add(V(0, 0.07, 0).applyQuaternion(qH)), q: qH, qi: qH.clone().invert(), h: V(0.15, 0.17, 0.095) }] }; }
  const T = K.T, tq = T.tq, qH = tq.hips, qC = T.qC, qN = qC.clone().multiply(tq.neck), qHd = qN.clone().multiply(tq.head);
  const hb = T.chest.clone().add(V(0, DIM.neck, 0).applyQuaternion(qC)).add(V(0, DIM.head, 0).applyQuaternion(qN));
  return { head: { c: hb.add(V(0, DIM.headR * 0.9, 0.01).applyQuaternion(qHd)), r: DIM.headR },
    boxes: [{ c: T.chest.clone().add(V(0, 0.11, 0.005).applyQuaternion(qC)), q: qC, qi: qC.clone().invert(), h: V(0.18, 0.12, 0.105) }, { c: T.hip.clone().add(V(0, 0.07, 0).applyQuaternion(qH)), q: qH, qi: qH.clone().invert(), h: V(0.15, 0.17, 0.095) }] };
}
// 반지름 r의 공(p)이 제 몸에 겹친 가장 깊은 곳 { d, n(빠져나가는 쪽) } 또는 null
// 반지름 r의 공(p)이 제 몸에 겹친 곳. **머리·몸통(body)과 다른 팔(arm)을 따로 돌려준다**(p3d-0.8.6):
// 0.8.5는 셋 가운데 가장 깊은 것 하나만 돌려줘서, 다른 팔에 더 깊이 겹친 걸음에는 몸통의 겹침이 가려졌다(다른 팔과의 겹침으로는 멈추지 않으므로 몸통 검사까지 빠졌다).
// rArm = 다른 팔에 대해 쓰는 반지름(실제 굵기). 다른 팔과는 살이 눌리는 만큼(ARM_SQ)까지 겹침으로 보지 않는다
const ARM_SQ = 0.012;
// 거리 0의 경계(p3d-0.8.7, GPT의 0.8.6 검토): 점이 머리의 가운데나 다른 팔의 가운데 선 위에 놓이면 빠져나갈 방향(가운데에서 그 점으로)을 계산할 수 없다.
// 0.8.6은 그때 겹침 자체를 버렸다(가장 깊이 겹친 자리에서 "겹치지 않음"이 나왔다). 겹침과 깊이는 그대로 남기고, 방향은 아래 순서로 정한다(같은 입력이면 늘 같은 방향):
//   ① 부르는 쪽이 넘긴 방향(hint — 뻗는 손은 앞 걸음에 실제로 쓴 방향) ② 가슴 가운데에서 그 점으로 가는 쪽(몸 밖) ③ 위 ④ 옆 ⑤ 앞. 캡슐이면 축과 나란한 몫을 뺀다(옆으로 빠져나가는 방향만 뜻이 있다).
// 이렇게 정한 결과에는 deg: true를 붙인다. 부르는 쪽은 이것을 "앞 걸음의 방향"으로 기억하지 않는다
const DEG_L = 1e-4;
function degN(B, p, axis, hint) {
  for (const c of [hint, B.boxes && B.boxes[0] ? p.clone().sub(B.boxes[0].c) : null, UP, X, V(0, 0, 1)]) { if (!c) continue; const n = c.clone(); if (axis) n.addScaledVector(axis, -n.dot(axis)); const l2 = n.lengthSq(); if (Number.isFinite(l2) && l2 > 1e-8) return n.multiplyScalar(1 / Math.sqrt(l2)); }
  return UP.clone(); }
function selfHits(B, p, r, headOnly = false, rHead = Math.min(r, 0.01), rArm = r, hint = null) {
  let body = null, arm = null;
  // 머리: 팔이 귀 옆에 붙는 것(팔의 가운데 선이 머리 가운데에서 12cm)까지는 겹침이 아니다
  { const v = p.clone().sub(B.head.c), L = v.length(), d = rHead + B.head.r - L; if (d > 0) body = L > DEG_L ? { d, n: v.multiplyScalar(1 / L), head: true } : { d, n: degN(B, p, null, hint && hint.body), head: true, deg: true }; }
  if (!headOnly) for (const x of B.boxes) { const l = p.clone().sub(x.c).applyQuaternion(x.qi), q = V(Math.abs(l.x) - x.h.x, Math.abs(l.y) - x.h.y, Math.abs(l.z) - x.h.z), o = V(Math.max(q.x, 0), Math.max(q.y, 0), Math.max(q.z, 0)), out = o.length(), d = r - (out + Math.min(Math.max(q.x, q.y, q.z), 0));
    if (d > 0 && (!body || d > body.d)) { const n = out > 1e-6 ? V(o.x * Math.sign(l.x), o.y * Math.sign(l.y), o.z * Math.sign(l.z)).normalize() : q.x >= q.y && q.x >= q.z ? V(Math.sign(l.x) || 1, 0, 0) : q.y >= q.z ? V(0, Math.sign(l.y) || 1, 0) : V(0, 0, Math.sign(l.z) || 1); body = { d, n: n.applyQuaternion(x.q) }; } }
  if (B.caps && rArm > 0) for (const c of B.caps) { const ab = c.b.clone().sub(c.a), t = clamp(p.clone().sub(c.a).dot(ab) / Math.max(1e-9, ab.lengthSq()), 0, 1), v = p.clone().sub(c.a.clone().addScaledVector(ab, t)), L = v.length(), d = rArm + lerp(c.ra, c.rb, t) - ARM_SQ - L; if (!(d > 0) || (arm && d <= arm.d)) continue;
    if (L > DEG_L) arm = { d, n: v.multiplyScalar(1 / L), arm: true, ci: B.caps.indexOf(c), ct: t, L };
    else { const al = ab.length(); arm = { d, n: degN(B, p, al > 1e-6 ? ab.clone().multiplyScalar(1 / al) : null, hint && hint.arm), arm: true, ci: B.caps.indexOf(c), ct: t, L, deg: true }; } }
  return { body, arm };
}
// 팔의 겹침 { body, arm }(둘 다 없으면 null).
//   body = 팔뚝의 가운데 줄기(반지름 SELF_R)가 머리·몸통에 겹친 가장 깊은 곳. 몸통에 대해서는 팔꿈치 쪽 15%를 뺀다(팔꿈치는 몸 옆에 붙어 있는 것이 보통이다). 머리에 대해서는 팔꿈치와 위팔까지 본다.
//          팔을 몸 옆에 붙인 보통 자세가 걸리지 않게 실제 굵기가 아니라 줄기로 잰다(test/arm_mesh.mjs의 검사와 같은 뜻)
//   arm  = 이 팔(팔뚝 전체와 위팔의 팔꿈치 쪽 절반, **실제 굵기**)이 다른 팔의 위팔·팔뚝에 겹친 가장 깊은 곳(p3d-0.8.6)
const SELF_R = 0.02;
function armSelf(B, ik, sh = null, extra = 0, xa = 0) { if (!B) return null; let body = null, arm = null; const up = (h, t) => { if (h.body && (!body || h.body.d > body.d)) body = { ...h.body, t }; if (h.arm && (!arm || h.arm.d > arm.d)) arm = { ...h.arm, t }; };
  for (const [t, r] of ARM_PTS) up(selfHits(B, ik.mid.clone().lerp(ik.end, t), SELF_R + extra, t < 0.15, 0.01 + extra, r + extra + xa), t);
  if (sh) for (const t of [0.4, 0.55, 0.7, 0.85]) up(selfHits(B, sh.clone().lerp(ik.mid, t), SELF_R, true, 0.01 + extra, t >= 0.55 ? lerp(ARM_R.upper[0], ARM_R.upper[1], t) + extra + xa : 0), -1);
  return body || arm ? { body, arm } : null; }
const sd = (x, k) => (x && x[k] ? x[k].d : 0);
// 팔꿈치가 갈 쪽을 고른다(뻗는 팔). 기본 후보(armIK)가 지형에도 제 몸에도 겹치지 않으면 그대로 쓴다(0.8.4와 같다).
// 겹치면 어깨–손목 축 둘레를 15°씩 다 돌려 보고 지형(가장 무겁게) → 제 몸 → 기본 방향에서 벗어난 정도 → 지금 방향에서 벗어난 정도의 순서로 가장 나은 쪽을 고른다.
// (0.8.4까지는 후보 다섯 가운데 지형만 보고 골라, 얼굴 앞 벽면처럼 가까운 곳을 짚을 때 지형도 몸도 비는 쪽이 있는데도 팔꿈치가 머리 위·가슴 속으로 갔다 — test/self_diag.mjs)
function pickPole(S, sh, target, yaw, sx, qC, tb, B) {
  const base = armIK(S.world, sh, target, yaw, sx, qC, true, tb), s0 = armSelf(B, base.ik, sh);
  if (!B || (!base.cost && !s0)) return { pole: base.pole, self: s0 };
  const u = target.clone().sub(sh); if (u.lengthSq() < 1e-8) return { pole: base.pole, self: s0 }; u.normalize();
  const e0 = base.pole.clone().addScaledVector(u, -base.pole.dot(u)); if (e0.lengthSq() < 1e-8) return { pole: base.pole, self: s0 }; e0.normalize();
  const e1 = u.clone().cross(e0), prev = S.pw && S.poleS && S.poleS['el' + (sx > 0 ? 'L' : 'R')], pa = prev ? Math.atan2(prev.dot(e1), prev.dot(e0)) : 0; let best = null;
  for (let j = 0; j < 24; j++) { const a = j * Math.PI / 12, an = a > Math.PI ? a - 2 * Math.PI : a, pl = e0.clone().multiplyScalar(Math.cos(a)).addScaledVector(e1, Math.sin(a)), ik = twoBone(sh, target, DIM.upperArm, DIM.foreArm, pl), th = armHit(S.world, sh, ik, tb), sf = armSelf(B, ik, sh);
    let dp = Math.abs(an - pa); if (dp > Math.PI) dp = 2 * Math.PI - dp;
    const cost = 10 * (th ? th.d : 0) + 3 * sd(sf, 'body') + 3 * sd(sf, 'arm') + 0.004 * Math.abs(an) + (prev ? 0.006 * dp : 0); if (!best || cost < best.cost - 1e-7) best = { cost, pole: pl, self: sf }; }
  return best;
}
// 되돌린 시도(p3d-0.8.4): 제 머리(공)·몸통 가운데(캡슐)를 팔뚝의 장애물로 넣어 보았다. 손 조작 2로 손을 끌어 몸 앞을 가로지르는 장면에서 팔뚝 중심선이 머리·가슴에 드는 걸음이 123 → 142로 늘고,
// 당겨 올라간 자세에서는 몸에서 밀려난 팔뚝이 벽에 1.7cm 들어갔다. 팔꿈치 방향만으로는 풀리지 않는다 — 손이 가는 길 자체가 몸을 비켜 가야 한다(다음 판). 겹침은 test/arm_mesh.mjs가 잰다
function armHit(world, sh, ik, tb = null, extra = 0) {
  let worst = null;
  const test = (p, r0, t) => { for (const x of world.boxes) { if (x.kind === 'floor') continue; const h = sphereBox(p, r0 + (x === tb ? ARM_PAD_GRIP : ARM_PAD), x); if (h && (!worst || h.d > worst.d)) worst = { d: h.d, n: h.n, t }; } };
  for (const [t, r] of ARM_PTS) test(ik.mid.clone().lerp(ik.end, t), r, t);
  const fore = worst;
  let up = null; { const keep = worst; worst = null; for (const [t, r] of ARM_UP) test(sh.clone().lerp(ik.mid, t), r + extra, -1); up = worst; worst = up && (!keep || up.d > keep.d) ? up : keep; }
  if (worst) { worst.f = fore; worst.u = up; } // f = 팔뚝만의 가장 깊은 겹침(손을 멈추거나 빼내는 것은 이것으로만 한다). u = 위팔만의 가장 깊은 겹침(p3d-0.8.4. 가슴이 비켜 주는 데 쓴다) // f = 팔뚝만의 가장 깊은 겹침(없으면 null). 손을 멈추거나 빼내는 것은 이것으로만 한다(아래 limbsStep)
  return worst;
}

// ── 판정(미리보기와 실제가 같은 함수를 쓴다) ──
function pathBlocked(world, from, via, goal) { const mid = from.clone().multiplyScalar(0.25).addScaledVector(via, 0.5).addScaledVector(goal, 0.25); return rayHit(world, from, mid) < 1 || rayHit(world, mid, goal) < 1; }
const viaOf = (from, goal, n, lift) => from.clone().add(goal).multiplyScalar(0.5).addScaledVector(n, lift);
// 두 선분의 가장 가까운 점들 { a(첫 선분 위), b(둘째 선분 위), t(둘째 선분의 몫 0~1) }
function segPts(p1, q1, p2, q2) {
  const d1 = q1.clone().sub(p1), d2 = q2.clone().sub(p2), r = p1.clone().sub(p2), a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s = 0, t = 0;
  if (a <= 1e-9 && e <= 1e-9) { s = 0; t = 0; } else if (a <= 1e-9) t = clamp(f / e, 0, 1); else { const c = d1.dot(r); if (e <= 1e-9) s = clamp(-c / a, 0, 1); else { const b = d1.dot(d2), den = a * e - b * b; s = den > 1e-9 ? clamp((b * f - c * e) / den, 0, 1) : 0; t = (b * s + f) / e; if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); } } }
  return { a: p1.clone().addScaledVector(d1, s), b: p2.clone().addScaledVector(d2, t), t };
}
// 벽을 마주 보고 본 그림(앞뒤를 지운 그림)에서 두 선분이 엇갈리는(가장 가까운) 자리의 앞뒤 차이: { side(+1 = 첫 선분이 벽 쪽 · −1 = 몸 쪽), gap(그림에서의 거리), depth(앞뒤 거리) }
function crossSide(a0, a1, b0, b1, fwd) {
  const fl = p => p.clone().addScaledVector(fwd, -p.dot(fwd)), A0 = fl(a0), A1 = fl(a1), B0 = fl(b0), B1 = fl(b1), cp = segPts(A0, A1, B0, B1), la = A0.distanceTo(A1), s = la > 1e-6 ? cp.a.distanceTo(A0) / la : 0;
  const d = a0.clone().lerp(a1, s).sub(b0.clone().lerp(b1, cp.t)).dot(fwd); return { side: Math.sign(d) || 0, gap: cp.a.distanceTo(cp.b), depth: Math.abs(d) };
}
// 다른 팔을 돌아가는 길(p3d-0.8.6): 손목이 목표로 곧게 가는 길이 다른 팔의 팔뚝을 가로지르면, 그 팔뚝의 앞(벽 쪽)이나 뒤(몸 쪽)로 돌아가는 경유점을 돌려준다(없으면 null).
// 어느 쪽으로 도는가(H.pass, +1 = 벽 쪽 · −1 = 몸 쪽. 한 번 정하면 이 뻗기 동안 바꾸지 않는다):
//   지금 두 팔뚝이 이미 엇갈려 있으면(풀 때) 지금 놓인 쪽 그대로, 아니면 벽 쪽(잡은 팔의 밑)으로 돈다.
//   (0.8.5는 손목이 늘 몸 쪽으로 다가가서, 끝 자세가 벽 쪽일 때 두 팔뚝이 서로를 가로질렀다. 굵기를 지키게 하면 그 자리에서 멈춰 교차가 되지 않았다)
// 경유점 = 다른 팔뚝 위의 한 점(그 손목에서 10cm 넘게 아래 — 잡은 손목과 턱 사이에는 자리가 없다)에서 고른 쪽으로 두 반지름 + 1.5cm. 옆으로 그 점을 지나고 나면 목표로 간다
function armVia(S, H, sh, goal, SB, fwdW, leftW, yaw, sx, qC) {
  if (!SB || !SB.caps || globalThis.NOVIA) return null; const c = SB.caps[1], RW = ARM_R.fore[1], len = c.a.distanceTo(c.b); if (len < 0.05) return null;
  const tMax = clamp(1 - 0.10 / len, 0, 1), cp = segPts(H.w, goal, c.a, c.b), t = Math.min(cp.t, tMax), q = c.a.clone().lerp(c.b, t), rc = lerp(c.ra, c.rb, t), clear = RW + rc + 0.015;
  if (cp.a.distanceTo(cp.b) >= clear) return null;
  const gq = segPts(goal, goal, c.a, c.b); if (goal.distanceTo(gq.b) < RW + lerp(c.ra, c.rb, gq.t) - ARM_SQ) return null; // 목표 자체가 다른 팔에 겹친다: 돌아갈 길이 없다(손은 그 앞에서 멈춘다)
  const dir = Math.sign(goal.clone().sub(q).dot(leftW)) || 1, s0 = H.w.clone().sub(q).dot(leftW) * dir; if (s0 > 0.02) return null; // 이미 옆으로 지나왔다
  // 쪽은 손목이 그 팔뚝의 22cm 안에 왔을 때 정한다(뻗기 시작한 걸음에는 가슴이 아직 돌아가지 않아 끝 자세가 다르게 나온다). 그 전에는 곧게 간다
  if (!H.pass && H.w.distanceTo(q) > 0.22) return null;
  // 쪽을 정한다: 지금 그림에서 두 팔뚝이 이미 엇갈려 있으면(풀 때) 지금 놓인 쪽 그대로. 아니면 **벽 쪽(잡은 팔의 밑)** 으로 돈다 — 교차 중에는 건너가는 팔의 어깨를 벽 쪽으로 비틀어 두므로 끝 자세가 벽 쪽에서 성립한다.
  // (작업 중에 해 본 것: ① 목표에 닿았을 때의 자세로 정하기 — 뻗기 시작한 걸음에는 가슴이 아직 돌지 않아 반대쪽이 나왔다 ② 지금 팔뚝이 치우친 쪽 — 늘어뜨린 손에서는 맞았지만 턱을 잡고 있던 손에서 시작하면 몸 쪽이 나와 끝에서 막혔다)
  if (!H.pass) { const el = worldPos(S.rig.bones[`foreArm.${H.s}`]), cur = crossSide(el, H.w, c.a, c.b, fwdW); H.pass = cur.gap < 0.01 && cur.depth > 0.01 && cur.side ? cur.side : (globalThis.PASS ?? 1); }
  return q.addScaledVector(fwdW, H.pass * clear).addScaledVector(leftW, dir * 0.04);
}
function segSeg(p1, q1, p2, q2) {
  const d1 = q1.clone().sub(p1), d2 = q2.clone().sub(p2), r = p1.clone().sub(p2), a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r), c = d1.dot(r), bb = d1.dot(d2), den = a * e - bb * bb;
  let s = den > 1e-9 ? clamp((bb * f - c * e) / den, 0, 1) : 0, t = e > 1e-9 ? (bb * s + f) / e : 0;
  if (t < 0) { t = 0; s = a > 1e-9 ? clamp(-c / a, 0, 1) : 0; } else if (t > 1) { t = 1; s = a > 1e-9 ? clamp((bb - c) / a, 0, 1) : 0; }
  return p1.clone().addScaledVector(d1, s).sub(p2.clone().addScaledVector(d2, t));
}
// 팔이 그 자리에 놓일 수 있는가: 어깨가 돌아가는 방향인지, 팔이 벽·턱이나 제 몸을 지나가지 않는지
function armCheck(S, i, sh, goal, n) {
  const B = S.rig.bones, sx = i ? -1 : 1, yaw = S.body.yaw, fwd = V(Math.sin(yaw), 0, Math.cos(yaw)), dir = goal.clone().sub(sh).normalize();
  if (dir.dot(fwd) < CL.SHOULDER_BACK) return '어깨가 돌아가지 않는 방향(등 뒤)';
  // 턱을 등진 채(100° 넘게 돌아선 채)로는 잡지 않는다. 잡은 손 아래에서 몸을 크게 돌리는 동작은 이번 판에 없다
  if (n && !S.climb.on && fwd.dot(n) > -CL.FACE_MIN) return '턱을 등지고 있음(돌아선 뒤에 잡기)';
  // p3d-0.8.5: 팔꿈치 방향은 그림과 같은 함수(heldPole)로 고른다 — 제 몸에 겹치지 않는 쪽이 있으면 그쪽으로 판정한다(팔 교차를 기본 후보 하나로 거부하지 않는다)
  const { ik, self } = heldPole(S, i ? 'R' : 'L', sh, goal, yaw, sx, S.climb.on && S.climb.T ? S.climb.T.qC : null);
  if (rayHit(S.world, sh.clone().lerp(ik.mid, 0.2), ik.mid) < 1 || rayHit(S.world, ik.mid, ik.mid.clone().lerp(ik.end, 0.9)) < 1) return '팔이 벽·턱을 지나감';
  // 팔뚝: 어느 쪽으로 팔꿈치를 두어도 팔뚝의 줄기가 제 몸에 5mm 넘게 겹치면 그 자리에는 팔을 둘 수 없다(p3d-0.8.5. 전에는 기본 후보의 팔뚝이 엉덩이–목 선 둘레 20 × 13cm 안이거나 머리 가운데에서 11.5cm 안이면 거부했다)
  if (sd(self, 'body') > 0.005) return self.body.head ? '팔이 머리를 지나감' : '팔이 몸통을 지나감';
  // (위팔과 머리도 위의 self에 들어 있다: 귀 옆에 붙는 것 = 가운데 선이 머리 가운데에서 11.5cm까지는 된다)
  return '';
}
// 무릎의 기본 방향: 벽 쪽에서 30° 바깥, 많이 굽힐수록 옆으로(편한 기본값. 허용 판정이 아니다). 무릎이 벽·턱에 들어가면 들어가지 않을 때까지 더 옆으로 돌린다
const nearBox = (world, p, m) => world.boxes.some(x => p.x > x.min.x - m && p.x < x.max.x + m && p.y > x.min.y - m && p.y < x.max.y + m && p.z > x.min.z - m && p.z < x.max.z + m);
// 무릎이 굽는 쪽(극 방향의 각 a: 0 = 벽 쪽, 90 = 옆 바깥). p3d-0.9.0: 발이 놓인 자리에서 정한다.
//   0.8.8까지는 다리가 접힐수록 30° → 72°로 바깥을 향했다 — 발이 어디에 있든 같아서, 발이 몸 안쪽(엇갈림)이나 몸 아래에 있을 때 넓적다리가 옆으로 눕고 정강이가 안으로 꺾였다("제기차기").
//   지금: 골반의 틀(골반이 돈 만큼 함께 돈다)에서 발이 고관절보다 바깥에 있으면 그만큼 바깥으로, 안쪽이면 벽 쪽·안쪽으로. 접힐수록 조금 더 바깥. 벽·턱에 닿으면 닿지 않을 때까지만 바깥으로 돌린다(먼저 가까운 각부터).
//   이 각은 이 함수의 방향 값이며 사람 무릎 관절을 잰 각이 아니다. 무릎을 벌리는 자세나 엇갈린 발을 막지 않는다
function legIK(S, hj, ank, yaw, sx, placed = true) {
  // 새 규칙은 디딘 발과 보내는 발에만 쓴다(placed). 늘어뜨린 발·뛰는 중에 접어 올린 다리는 발이 고관절 바로 아래를 오가서 "발의 자리"가 뜻이 없다(해 보니 한 걸음 튐이 캡처 동작에서 65 → 166회로 늘었다) → 0.8.8의 규칙 그대로
  const bend = clamp((1 - hj.distanceTo(ank) / DIM.leg - 0.05) / 0.35, 0, 1), K = S.climb, np = poseOn(K) && K.on && placed;
  let ik, pole;
  if (np) { const py = yaw + K.po.yaw, d = ank.clone().sub(hj), ox = sx * (d.x * Math.cos(py) - d.z * Math.sin(py)), fz = d.x * Math.sin(py) + d.z * Math.cos(py);
    // 거의 편 다리는 무릎의 쪽이 정해지지 않는다(늘어뜨린 발이 조금만 흔들려도 각이 크게 바뀐다) → 접힌 만큼만 발의 자리를 따른다
    const a0 = clamp(26 - 6 * bend + 0.75 * clamp((bend - 0.08) / 0.30, 0, 1) * Math.atan2(ox, Math.max(fz, 0.12)) / deg, -35, 85), list = [0, 12, 24, 36, 48, 60, 75, 90, -15, -30].map(x => a0 + x).filter(a => a <= 115 && a >= -50);
    // 닿지 않는 첫 후보. 모두 닿으면 벽·턱에서 가장 멀리 있는 후보(0.8.8은 마지막 후보 = 안쪽을 썼다 — 벽에 바짝 붙은 자세에서 무릎이 벽 안에 남았다)
    let best = null;
    for (const a of list) { const pl = V(sx * Math.sin(a * deg), 0.1, Math.cos(a * deg)).applyAxisAngle(UP, py).normalize(), k2 = twoBone(hj, ank, DIM.thigh, DIM.shin, pl); let m = 0.05; if (!nearBox(S.world, k2.mid, 0.05)) { best = { ik: k2, pole: pl }; break; } while (m > -0.04 && nearBox(S.world, k2.mid, m)) m -= 0.015; if (!best || m > best.m) best = { ik: k2, pole: pl, m }; }
    return { ik: best.ik, pole: best.pole }; }
  const a0 = lerp(30, 72, bend);
  for (const a of [a0, 60, 80, 95, 110, 10, -15]) { if (a > 0 && a < a0) continue; pole = V(sx * Math.sin(a * deg), 0.1, Math.cos(a * deg)).applyAxisAngle(UP, yaw).normalize(); ik = twoBone(hj, ank, DIM.thigh, DIM.shin, pole); if (!nearBox(S.world, ik.mid, 0.05)) break; }
  return { ik, pole };
}
function legCheck(S, i, hj, ank) {
  const { ik } = legIK(S, hj, ank, S.body.yaw, i ? -1 : 1);
  return nearBox(S.world, ik.mid, 0.03) || rayHit(S.world, hj.clone().lerp(ik.mid, 0.2), ik.mid) < 1 || rayHit(S.world, ik.mid, ik.mid.clone().lerp(ik.end, 0.85)) < 1 ? '다리가 벽·턱을 지나감' : '';
}

export function probeHand(S, i, pt) {
  const g = resolveGrip(S.world, pt), H = S.climb.hands[i];
  if (!g) return { ok: false, why: '잡을 수 있는 턱이 아님', sure: true };
  const goal = anchorOf(g), sh = joints(S).sh[i], d = sh.distanceTo(goal), sure = S.body.vel.length() < 0.3, base = { grip: g.p.toArray(), name: g.edge.box.name, sure };
  if (pathBlocked(S.world, H.w, viaOf(H.w, goal, g.n, 0.10), goal)) return { ...base, ok: false, why: '손이 가는 길이 막힘' };
  if (d > CL.ARM) return { ...base, ok: false, short: d - CL.ARM, why: `닿지 않음(${short(d - CL.ARM)} 모자람)` };
  const c = armCheck(S, i, sh, goal, g.n);
  return c ? { ...base, ok: false, why: c } : { ...base, ok: true, why: '' };
}
export function probeFoot(S, i, pt) {
  const K = S.climb, g = resolveFoot(S.world, pt, S.body.yaw);
  if (!K.on && !S.body.onGround) return { ok: false, why: '공중에서는 발을 보낼 수 없음', sure: true };
  if (!g) return { ok: false, why: '디딜 수 있는 면이 아님', sure: true };
  const G = footGeom(g.p, g.n, g.q), hj = joints(S).hj[i], d = hj.distanceTo(G.ank), sure = S.body.vel.length() < 0.3, base = { grip: g.p.toArray(), name: g.box.name, kind: g.kind, sure };
  if (d > DIM.leg * 0.995) return { ...base, ok: false, short: d - DIM.leg * 0.995, why: `발이 닿지 않음(${short(d - DIM.leg * 0.995)} 모자람)` };
  const c = legCheck(S, i, hj, G.ank);
  return c ? { ...base, ok: false, why: c } : { ...base, ok: true, why: '' };
}

// ── 명령: 시도 → (성공 | 거부) → 유지 → 놓기 ──
export function command(S, c) {
  const K = S.climb, pt = c.p ? V(...c.p) : null;
  // 직접 뗀 발(userOff)은 사용자가 그 발을 다시 보내거나 보조를 켜고 끌 때(= 보조 다시 시작)까지 보조·벽 딛기가 다시 보내지 않는다.
  // 시간이 지났거나 손을 옮겼다고 다시 붙이지 않는다(p3d-0.8.1, GPT 결정. 0.7.0은 1.5초 뒤, 0.8.0은 손을 새로 잡으면 다시 보냈다)
  if (c.type === 'assistResume') { for (const F of K.feet) { F.userOff = false; F.offBox = null; } return; }
  if (c.type === 'release') { if (c.limb === 'hand') releaseHand(S, c.i, '놓음'); else liftFoot(S, c.i, '뗌'); return; }
  if (c.type === 'hand') {
    const H = K.hands[c.i], g = resolveGrip(S.world, pt);
    note(S, 'try', 'hand', c.i, '', { p: c.p, hold: !!c.hold });
    if (!K.on && H.st === 'free' && !(H.ov > 0)) seedBend(S, 'el' + H.s, `upperArm.${H.s}`, `foreArm.${H.s}`, `hand.${H.s}`);
    if (c.hold) {
      // 누르는 동안 뻗기(손 조작 2번): 누르는 순간 그 손을 놓고 조작을 시작한다. 이것은 의도적인 놓기다(거부와 다르다)
      if (H.st === 'hold') releaseHand(S, c.i, '뻗으려고 놓음');
      Object.assign(H, { st: 'reach', drag: true, t: 0, T: 9, wait: 0, blockT: 0, sp: 0, shPrev: null, ov: 1, why: '' });
      H.from.copy(H.w); aimHand(S, H, pt);
      return;
    }
    // 눌러 보내기(손 조작 1번): 갈 수 없는 목표를 누르면 거부만 하고 지금 잡고 있는 손은 그대로 둔다(GPT의 p3d-0.5.0 검토 3장. 전에는 거부가 잡은 손까지 풀어 그 걸음에 떨어졌다)
    if (!g) { deny(S, H, 'hand', '잡을 수 있는 턱이 아님'); return; }
    const goal = anchorOf(g);
    if (H.st === 'hold' && g.p.distanceTo(H.grip) < 0.04) { deny(S, H, 'hand', '이미 잡고 있는 자리'); return; }
    if (pathBlocked(S.world, H.w, viaOf(H.w, goal, g.n, 0.10), goal)) { deny(S, H, 'hand', '손이 가는 길이 막힘'); return; }
    if (H.st === 'hold') releaseHand(S, c.i, '옮기려고 놓음');
    Object.assign(H, { st: 'reach', drag: false, edge: g.edge, t: 0, T: 2.5, wait: 0, blockT: 0, sp: 0, shPrev: null, ov: 1, why: '' });
    H.from.copy(H.w); H.goal.copy(goal); H.grip.copy(g.p); H.n.copy(g.n);
  }
  // 누르던 단추를 뗌: 그때 겨눈 곳이 턱이면 잡으러 가고(짧게), 아니면 헛손질
  // 뻗던 손을 거둠(B2): 잡으러 가지 않고 그 손만 놓인 채로 돌아간다. 이미 붙은 다른 접촉은 건드리지 않는다
  if (c.type === 'handCancel') { const H = K.hands[c.i]; if (H.st === 'reach' && H.drag) { H.rel.copy(H.w).sub(joints(S).sh[H.i]); H.ret = K.on ? { from: H.rel.clone(), t: 0 } : null; H.st = 'free'; H.drag = false; H.why = '손 보내기 취소'; note(S, 'cancel', 'hand', c.i, '손 보내기 취소'); } return; }
  if (c.type === 'handUp') { const H = K.hands[c.i]; if (H.st === 'reach' && H.drag) { H.drag = false; H.t = 0; H.wait = CL.TRY_T - 0.12; if (!H.edge) reject(S, H, 'hand', '헛손질(잡을 곳이 아님)'); } return; }
  if (c.type === 'foot') {
    const F = K.feet[c.i];
    if (!c.auto) { if (!c.shifted) note(S, 'try', 'foot', c.i, '', { p: c.p }); F.userOff = false; F.offBox = null; } // shifted = 체중을 옮긴 뒤 같은 명령을 이어서 하는 것(기록은 한 번만)
    const g = resolveFoot(S.world, pt, S.body.yaw);
    if (!g) { deny(S, F, 'foot', '디딜 수 있는 면이 아님'); return; }
    if (!K.on && !S.body.onGround) { deny(S, F, 'foot', '공중에서는 발을 보낼 수 없음'); return; }
    const G = footGeom(g.p, g.n, g.q), far = joints(S).hj[c.i].distanceTo(G.ank) - DIM.leg * 0.995;
    // 한참 닿지 않는 자리면 디딘 발을 떼지 않는다(몸을 옮기면 닿을 만한 거리는 보내 본다)
    if (far > 0.25) { deny(S, F, 'foot', `발이 닿지 않음(${short(far)} 모자람)`); return; }
    // 손으로 잡지 않고도 발부터 올릴 수 있다(p3d-0.6.0, 사용자 의견 7). 땅에 선 채 벽 문맥으로 들어간다
    if (!K.on) enter(S, '발부터 올림');
    // 손 없이 디디고 있는 발을 옮길 때는 먼저 체중을 남는 발 위로 옮긴다(옮길 발이 밀어 준다). 그 뒤에 뗀다 — 바로 떼면 한 발로는 무게중심을 끌어올 수 없어 넘어간다
    const other = K.feet[1 - c.i];
    if (!c.shifted && F.st === 'plant' && F.kind === 'top' && other.st === 'plant' && other.kind === 'top' && !K.hands.some(h => h.st === 'hold')) { K.pendFoot = { cmd: { ...c, shifted: true }, t: 0, stay: 1 - c.i }; return; }
    if (F.st === 'plant') liftFoot(S, c.i, '옮기려고 뗌'); if (F.relV) F.relV.set(0, 0, 0);
    const out = g.kind === 'smear' ? g.n : V(-Math.sin(S.body.yaw), 0, -Math.cos(S.body.yaw));
    // 발이 가는 길: 윗면에는 위·바깥에서 내려 디딘다(턱 모서리를 뚫고 가지 않게)
    Object.assign(F, { st: 'move', kind: g.kind, box: g.box, patch: g.patch, t: 0, tryT: 0, T: clamp(F.a.distanceTo(G.ank) / CL.FOOT_V, CL.FOOT_T0, CL.FOOT_T1), auto: false, byAssist: !!c.auto, why: '' });
    F.from.copy(F.a); F.via.copy(viaOf(F.a, G.ank, out, 0.14)); F.via.y = Math.max(F.a.y, G.ank.y) + (g.kind === 'top' ? 0.10 : 0.03); F.p.copy(g.p); F.ball.copy(G.ball); F.ank.copy(G.ank); F.q.copy(g.q); F.n.copy(g.n);
    // 윗면으로 가는 호(p3d-0.9.0): 가운데 점을 벽에서 떼고 높여, 발볼·발끝이 어느 상자에도 들어가지 않는 가장 낮은 호를 고른다(가는 길 16곳). 없으면 옛 길(먼저 들고 나서 옮김)
    F.arc = false;
    if (g.kind === 'top' && poseOn(K)) { const fw = V(0, 0, 1).applyQuaternion(g.q), pts = [fw.clone().multiplyScalar(DIM.ballZ).add(V(0, -DIM.ankleY + 0.015, 0)), fw.clone().multiplyScalar(DIM.toeZ).add(V(0, -DIM.ankleY + 0.02, 0)), V(0, -DIM.ankleY + 0.015, 0)];
      for (const [lift, back] of [[0.12, 0.10], [0.18, 0.14], [0.24, 0.16], [0.30, 0.18], [0.38, 0.22]]) { const via = viaOf(F.a, G.ank, out, back); via.y = Math.max(F.a.y, G.ank.y) + lift; let ok = true;
        for (let j = 1; j < 16 && ok; j++) { const u = j / 16, q = F.from.clone().multiplyScalar((1 - u) * (1 - u)).addScaledVector(via, 2 * u * (1 - u)).addScaledVector(G.ank, u * u); for (const o of pts) if (insideAny(S.world, q.clone().add(o))) { ok = false; break; } }
        if (ok) { F.via.copy(via); F.arc = true; break; } } }
  }
}
// 누르는 동안 뻗는 손의 목표: 겨눈 곳 가까이에 턱이 있으면 그 턱의 잡을 자리, 없으면 겨눈 점 앞(허공)
function aimHand(S, H, pt) {
  const g = resolveGrip(S.world, pt);
  if (g) { H.edge = g.edge; H.goal.copy(anchorOf(g)); H.grip.copy(g.p); H.n.copy(g.n); }
  else { H.edge = null; const sh = joints(S).sh[H.i]; H.goal.copy(pt).addScaledVector(sh.clone().sub(pt).normalize(), 0.07); }
}
// 거부: 새 명령을 받아들이지 않을 뿐, 지금의 접촉·움직임은 그대로 둔다
function deny(S, L, limb, why) { L.why = why; note(S, 'reject', limb, L.i, why, { kept: L.st }); }
// 실패: 옮기기 시작한 손발이 닿지 못했다(그 손발은 놓인 채 남는다. 전 자리로 되돌려 붙이지 않는다)
function reject(S, L, limb, why) { const J = joints(S), K = S.climb; L.why = why; if (limb === 'hand') { L.rel.copy(L.w).sub(J.sh[L.i]); L.st = 'free'; L.drag = false; L.swivel = false; L.selfBlock = 0; L.armCross = 0; L.pass = 0; L.hn = null; L.ret = K.on ? { from: L.rel.clone(), t: 0 } : null; } else { L.rel.copy(L.a).sub(J.hj[L.i]); L.st = 'free'; L.cool = 0.3; if (L.byAssist) K.assistBad = { p: L.p.clone(), k: K.tick }; } note(S, 'reject', limb, L.i, why, L.byAssist && limb === 'foot' ? { auto: true } : {}); }
function releaseHand(S, i, why, type = 'release') { const K = S.climb, H = K.hands[i]; if (H.st === 'free') return; const was = H.st; H.st = 'free'; H.swivel = false; H.selfBlock = 0; H.armCross = 0; H.pass = 0; H.hn = null; H.F = null; H.rel.copy(H.w).sub(joints(S).sh[i]); H.ret = K.on ? { from: H.rel.clone(), t: 0 } : null; H.load = 0; H.bad = 0; H.why = why; if (was === 'hold') note(S, type, 'hand', i, why, { vel: S.body.vel.toArray() }); }
function liftFoot(S, i, why, type = 'lift') { const K = S.climb, F = K.feet[i]; if (F.st === 'free') return; const was = F.st; F.st = 'free'; F.F = null; F.cool = 0.22; if (why === '뗌') { F.userOff = true; F.offBox = F.box; } F.rel.copy(F.a).sub(joints(S).hj[i]); F.load = 0; F.ok = false; F.why = why; if (was === 'plant') note(S, type, 'foot', i, why); }

// 보내는 손발을 한 걸음 옮긴다. 어깨·고관절에서 닿는 데까지만 간다(늘어나지 않는다). 다 가서 닿았으면 잡고, 닿지 않으면 잠깐 더 뻗어 보다가 거부한다
function limbsStep(S, dt) {
  const K = S.climb, J = joints(S);
  for (const H of K.hands) {
    if (H.st !== 'reach') continue;
    const sh = J.sh[H.i];
    if (H.drag && S.inp && S.inp.reach && S.inp.reach[H.i]) aimHand(S, H, V(...S.inp.reach[H.i]));
    H.t += dt;
    // 손은 몸과 함께 가고(어깨가 간 만큼), 그 위에서 목표를 향해 빠르기 한계 안에서 다가간다. 정해 둔 시간표가 아니라 실제 거리로 간다 → 닿을 수 있게 된 걸음에 닿는다
    const shMv = H.shPrev ? sh.distanceTo(H.shPrev) : 0; if (H.shPrev) H.w.add(sh).sub(H.shPrev); H.shPrev = sh.clone();
    const rel0 = H.w.clone().sub(sh), w0 = H.w.clone(), aim = H.goal.clone(); { const dg = H.w.distanceTo(H.goal); if (H.edge && (dg > 0.05 || !globalThis.OLDHAND)) aim.addScaledVector(H.n, Math.min(0.10, dg * 0.6)); } // p3d-0.8.8: 다가가는 길의 띄움은 끝까지 이어서 줄어든다(전에는 5cm 앞에서 3cm가 한 걸음에 없어져 손이 가는 방향이 꺾였다)
    // 다른 팔을 가로지르는 길이면 그 팔뚝을 돌아가는 경유점부터 간다(p3d-0.8.6. 목표는 그대로다)
    { const yw = S.body.yaw, vi = armVia(S, H, sh, H.goal, selfShapes(S, H.i), V(Math.sin(yw), 0, Math.cos(yw)), V(Math.cos(yw), 0, -Math.sin(yw)), yw, H.i ? -1 : 1, K.on && K.T ? K.T.qC : null); H.viaOn = !!vi; if (vi) aim.copy(vi); }
    // 손의 빠르기(p3d-0.8.8): 일정한 빠르기로 가서 딱 멈추지 않고, 떠날 때 붙고 다가가며 줄어든다(끝 = 목표, 닿지 않는 목표면 팔을 다 편 자리). 0.8.7까지는 0.1초에 초속 3.2m가 되어 그대로 턱에 닿았다(찌르듯 뻗고 굳는 모양).
    // 몸이 빨리 움직일 때(뛰는 중·떨어지는 중)는 줄이지 않는다 — 그때는 손이 움직이는 몸을 따라잡아야 한다(p3d-0.6.0의 교훈: 목표 가까이에서 느려지면 1cm 앞에서 못 잡는다). 닿았는지의 판정은 그대로다
    const dv = aim.sub(H.w), dl = dv.length();
    if (globalThis.OLDHAND) H.sp = Math.min(CL.HAND_V, (H.sp || 0) + CL.HAND_ACC * dt);
    else { const g = H.goal.clone().sub(sh), gl = g.length(), end = gl > CL.ARM ? sh.clone().addScaledVector(g, CL.ARM / gl) : H.goal;
      // 받쳐진 채 가만히 있을 때만(w = 1) 새 곡선이다: 뛰는 중·떠 있는 중·몸이 초속 0.9m 넘게 움직이는 중에는 전과 같다(w = 0. 뛰어 잡기의 타이밍을 바꾸지 않는다 — 처음에는 가르지 않아 캡처 동작의 뛰어 잡기 장면 둘이 달라졌다)
      const calm = (K.on || S.body.onGround) && !K.push && !(S.inp && S.inp.jump) ? clamp((0.9 - S.body.vel.length()) / 0.6, 0, 1) : 0;
      const cap = lerp(CL.HAND_V, Math.min(CL.HAND_V, Math.sqrt(2 * CL.HAND_DEC * Math.max(0, H.w.distanceTo(end) - CL.HAND_V * dt * 0.5)) + CL.HAND_V1), calm); H.sp = Math.min(cap, (H.sp || 0) + lerp(CL.HAND_ACC, CL.HAND_ACC2, calm) * dt); }
    // 손목이 제 몸을 비켜 간다(p3d-0.8.5, 손 조작 1·2 공통 — 목표는 그대로 두고 가는 길만 바꾼다): 손목(반지름 3.6cm)이 머리·몸통·다른 팔의 2.5cm 안에 있고 몸 쪽으로 가려 하면,
    // 그 몫을 지우고 겉면을 따라 간다. 겉면에 똑바로 부딪쳐 옆으로 갈 몫이 없으면 위·앞(벽 쪽)으로 비켜 간다. 옮긴 뒤에도 겹쳐 있으면(몸이 손 쪽으로 움직였을 때) 겹친 만큼 밖으로 뺀다.
    // 지형은 이 뒤에 본다(지형이 먼저다). 몸과 벽 사이가 좁아 지나갈 수 없으면 손은 거기서 멈추고(H.selfBlock) 닿지 않은 까닭으로 알린다
    // p3d-0.8.6: 머리·몸통과 다른 팔을 **따로** 본다(둘 다 닿아 있으면 둘 다 비킨다). 다른 팔은 실제 굵기로 보고, 똑바로 부딪쳐 옆으로 갈 몫이 없으면 앞(벽 쪽)·뒤(몸 쪽) 가운데 빈 쪽으로 돌아간다
    // (앞뒤 7cm 자리에 손목을 놓아 보고 지형·몸통에 덜 겹치는 쪽. 같으면 몸 쪽 — 잡고 있는 손목과 벽 사이에는 자리가 없다). 한 번 고른 쪽은 이 뻗기 동안 바꾸지 않는다(H.pass)
    const SB = selfShapes(S, H.i), RW = ARM_R.fore[1], fwdW = V(Math.sin(S.body.yaw), 0, Math.cos(S.body.yaw)); let selfTouch = false, armTouch = false;
    const hn = H.hn || (H.hn = { body: null, arm: null }), keepN = hh => { if (hh.body && !hh.body.deg) hn.body = hh.body.n.clone(); if (hh.arm && !hh.arm.deg) hn.arm = hh.arm.n.clone(); };
    if (SB && dl > 1e-6) { const hh = selfHits(SB, H.w, RW + 0.025, false, RW + 0.025, RW + 0.025, hn); keepN(hh);
      for (const [h, isArm] of [[hh.body, false], [hh.arm, true]]) { if (!h) continue; const into = dv.dot(h.n); if (into >= 0) continue; if (isArm) armTouch = true; else selfTouch = true; dv.addScaledVector(h.n, -into);
        if (dv.length() >= 0.35 * dl) continue; let pref;
        if (isArm) { if (!H.pass) { const cost = sg => { const t = fwdW.clone().multiplyScalar(sg); t.addScaledVector(h.n, -t.dot(h.n)); if (t.lengthSq() < 1e-6) return 9; const q = H.w.clone().addScaledVector(t.normalize(), 0.07); let c = 0; for (const x of S.world.boxes) { const g = x.kind === 'floor' ? null : sphereBox(q, RW + ARM_PAD, x); if (g) c = Math.max(c, g.d); } const b2 = selfHits(SB, q, RW, false, RW, 0).body; return b2 ? Math.max(c, b2.d) : c; }; H.pass = cost(-1) <= cost(1) + 1e-4 ? -1 : 1; } pref = fwdW.clone().multiplyScalar(H.pass); }
        else pref = fwdW.clone().multiplyScalar(0.6).add(UP);
        const tg = pref.addScaledVector(h.n, -pref.dot(h.n)); if (tg.lengthSq() > 1e-6) dv.addScaledVector(tg.normalize(), 0.6 * dl); } }
    { const l2 = dv.length(); if (l2 > 1e-6) { const stp = dv.clone().multiplyScalar(Math.min(selfTouch || armTouch ? dl / l2 : 1, H.sp * dt / l2));
        // 팔이 다 펴지는 끝에서는 펴지는 빠르기를 줄인다(p3d-0.8.8): 팔 길이의 끝에 초속 3m로 닿으면 팔꿈치가 한 걸음에 펴지며 팔뚝이 17~24° 튀었다(IK는 다 펴질 때 팔꿈치 각이 가장 빨리 변한다). 어깨에서 멀어지는 몫만 줄이고 옆으로 가는 몫은 그대로다
        if (!globalThis.OLDHAND) { const r0v = H.w.clone().sub(sh), L0 = r0v.length(); if (L0 > 0.3 * CL.ARM) { const ur = r0v.multiplyScalar(1 / L0), vr = stp.dot(ur), lim = (Math.sqrt(2 * CL.EXT_DEC * Math.max(0, CL.ARM - L0)) + 0.25) * dt; if (vr > lim) stp.addScaledVector(ur, lim - vr); } }
        H.w.add(stp); } }
    if (SB) for (let it = 0; it < 2; it++) { const hh = selfHits(SB, H.w, RW, false, RW, RW, hn); keepN(hh); if (!hh.body && !hh.arm) break; if (hh.body) { H.w.addScaledVector(hh.body.n, Math.min(hh.body.d, 0.02 + shMv)); selfTouch = true; } if (hh.arm) { H.w.addScaledVector(hh.arm.n, Math.min(hh.arm.d, 0.02 + shMv)); armTouch = true; } }
    H.selfBlock = selfTouch || H.stopB ? (H.selfBlock || 0) + dt : 0; H.armCross = armTouch || H.stopA ? (H.armCross || 0) + dt : 0; H.stopB = false; H.stopA = false;
    const d = H.w.clone().sub(sh); if (d.length() > CL.ARM) H.w.copy(sh).addScaledVector(d.normalize(), CL.ARM);
    // B4: 뻗는 손이 벽·턱 속으로 들어가지 않는다. ① 이 걸음에 간 길(앞 자리 → 새 자리)이 지형을 가로지르면 닿은 데서 멈춘다(얇은 것을 한 걸음에 건너뛰지 않게) ② 그래도 겹치면 들어간 만큼 가장 얕은 쪽으로 빼낸다(손목 둘레 = 팔뚝 끝의 실제 반지름 3.6cm + 여유. p3d-0.8.2까지는 1.5cm여서 그려진 팔뚝 끝이 턱에 들어갔다. 잡을 때의 손목 자리는 턱 앞면에서 4cm 앞이라 막히지 않는다). 손은 겉면을 따라 미끄러져 간다
    let wristHit = false;
    { const t = rayHit(S.world, w0, H.w); if (t < 1) { H.w.copy(w0).lerp(H.w.clone(), Math.max(0, t - 0.02)); wristHit = true; } }
    for (const x of S.world.boxes) { const h = sphereBox(H.w, ARM_R.fore[1] + (H.edge && H.edge.box === x ? ARM_PAD_GRIP : ARM_PAD), x); if (h) { H.w.addScaledVector(h.n, h.d); H.thru = (H.thru || 0) + 1; wristHit = true; } }
    // 팔뚝도 지형을 지나가지 않는다(B4 보완, p3d-0.8.2). 손목만 막으면 몸이 움직이거나 높이 올라간 자세에서 팔뚝이 턱을 가로질렀다(재현: test/reach_sweep.mjs ②~⑦).
    // 팔꿈치를 어느 쪽으로 돌려도 팔뚝 캡슐이 겹치면, 겹친 만큼 손목을 가장 얕은 쪽으로 빼낸다(팔뚝의 그 점은 손목이 움직인 거리의 t배만큼 움직인다). 손은 턱에 걸려 더 가지 못한다
    // 순서는 "팔꿈치 먼저": 나아간 자리에서 그림의 팔이 겹치면 ① 손목은 이번 걸음에 나아가지 않고(앞 자리), 굽는 쪽은 나아간 자리에서 겹치지 않는 쪽으로 돈다(H.poleWant — 그림이 이 값을 쓴다)
    // ② 앞 자리에서도 겹치면(몸이 움직여 팔이 턱 쪽으로 끌려갈 때) 겹친 만큼 손목을 가장 얕은 쪽으로 빼낸다. 한 걸음에 1.2cm + 그 걸음에 어깨가 움직인 거리까지(한 번에 다 빼내면 팔이 한 걸음에 30° 넘게 튄다. 몸이 빨리 떨어질 때는 그만큼 더 빼내야 팔이 턱에 끌려 들어가지 않는다)
    H.armBlock = false; H.poleWant = null;
    { const qC = K.on && K.T ? K.T.qC : null, sx = H.i ? -1 : 1, key = 'el' + H.s, tb = H.edge ? H.edge.box : null, tryAt = (w, want) => dryBend(S, key, () => reachArm(S, H.s, sh, w, S.body.yaw, sx, qC, want, tb));
      // 손을 멈추거나 빼내는 것은 **팔뚝**의 겹침으로만 한다. 위팔의 겹침은 굽는 쪽을 고르는 데만 쓴다(가장 덜 겹치는 쪽으로 돈다):
      // 위팔은 어깨에 붙어 있어 손목을 옮겨도 거의 움직이지 않고, 어깨가 벽에 얼마나 가까운지는 몸통 쪽의 일이다. 위팔로도 손을 멈추면, 당겨 올라가 어깨가 턱 바로 앞 아래에 있을 때
      // 팔을 어느 쪽으로 돌려도 위팔(반지름 5cm)이 턱 끝에 2~4cm 걸려 손이 끝내 가지 못한다(턱 A → 턱 F). 그 겹침은 남아 있고 test/arm_mesh.mjs가 잰다 — 몸통·어깨 연결의 과제다
      const fd = R => (R.hit && R.hit.f ? R.hit.f.d : 0);
      let A = tryAt(H.w, null);
      if (fd(A) > 0) { const B = tryAt(w0, A.want); H.armBlock = true; if (fd(B) < fd(A)) { H.w.copy(w0); H.poleWant = A.want; A = B; }
        // 빼낼 쪽은 해 보고 고른다: 겹친 면의 바깥쪽과 여섯 축 방향으로 손목을 조금 옮겨 보고, 그림의 팔뚝이 가장 덜 겹치는 쪽으로 간다.
        // (0.8.2는 "겹친 면의 바깥쪽으로, 깊이 ÷ t만큼"이었다. 팔을 접은 자세에서 팔꿈치 쪽이 겹쳤을 때 그렇게 밀면 손목이 어깨에 가까워지며 팔꿈치가 오히려 벽 속으로 들어갔다 — 표면으로 재니 5cm)
        for (let it = 0, left = 0.012 + shMv; it < 2 && fd(A) > 0 && left > 1e-4; it++) { const st = Math.min(left, Math.max(0.004, fd(A))); let best = null;
          for (const dir of [A.hit.f.n, V(1, 0, 0), V(-1, 0, 0), V(0, 1, 0), V(0, -1, 0), V(0, 0, 1), V(0, 0, -1)]) { const w = H.w.clone().addScaledVector(dir, st), R2 = tryAt(w, H.poleWant), d = fd(R2); if (!best || d < best.d - 1e-5) best = { d, w, R2 }; if (!d) break; }
          if (!best || best.d >= fd(A) - 1e-5) break; H.w.copy(best.w); A = best.R2; left -= st; } }
      // 팔이 제 몸을 지나가는 자리로는 나아가지 않는다(p3d-0.8.5): 팔꿈치를 어느 쪽으로 두어도 팔의 줄기가 머리·몸통에 4mm 넘게 겹치면, 덜 겹치던 앞 자리로 손목을 되돌린다(앞 자리도 겹치면 겹친 만큼 가장 얕은 쪽으로 뺀다. 한 걸음에 1.2cm + 어깨가 움직인 거리까지).
      // p3d-0.8.6: 머리·몸통과 다른 팔을 따로 본다(다른 팔에 더 깊이 겹쳐 있어도 몸통의 겹침을 놓치지 않는다). **다른 팔도 길을 막는다**: 팔꿈치를 어느 쪽으로 두어도 이 팔이 다른 팔에(굵기 기준, 눌림 여유 1.2cm 밖으로) 겹치면
      // 그 자리로는 나아가지 않는다 — 이동하는 손이 멈춘다(H.armCross). 잡고 있는 손을 놓거나 자리를 건너뛰지 않는다
      { const bD = R => sd(R.self, 'body'), aD = R => sd(R.self, 'arm');
        if (bD(A) > 0.004 || aD(A) > 0.004) { const B0 = tryAt(w0, null), better = (bD(A) > 0.004 && bD(B0) < bD(A) - 1e-5) || (aD(A) > 0.004 && !globalThis.NOARMSTOP && aD(B0) < aD(A) - 1e-5);
          if (better && bD(B0) <= bD(A) + 1e-5 && aD(B0) <= aD(A) + 1e-5) { if (aD(A) > 0.004 && !globalThis.NOARMSTOP) H.stopA = true; if (bD(A) > 0.004) H.stopB = true; H.w.copy(w0); A = B0; }
          if (bD(A) > 0.004) { H.w.addScaledVector(A.self.body.n, Math.min(bD(A), 0.012 + shMv)); H.stopB = true; }
          if (aD(A) > 0.004 && !globalThis.NOARMSTOP) { H.w.addScaledVector(A.self.arm.n, Math.min(aD(A), 0.012 + shMv)); H.stopA = true; } } }
      H.up = A.hit && A.hit.u ? { d: A.hit.u.d, n: A.hit.u.n.clone() } : null; }
    if (H.armBlock) { const d2 = H.w.clone().sub(sh); if (d2.length() > CL.ARM) H.w.copy(sh).addScaledVector(d2.normalize(), CL.ARM); }
    // 막힌 채 이어진 시간(손목이 지형에 닿아 멈췄거나 팔뚝이 걸려 기다리는 중). 화면의 "팔 경로 막힘"과 거부 까닭은 0.12초 넘게 이어졌을 때만 쓴다(스치는 한두 걸음에 깜박이지 않게)
    H.blockT = H.armBlock || wristHit ? (H.blockT || 0) + dt : 0;
    // 누르고 있는 동안에는 잡지 않는다(떼는 순간에 잡는다)
    // 팔꿈치가 아직 돌아가는 중인가(화면이 '막힘'과 나눠 보인다). p3d-0.8.5: 손 조작 2(누르는 동안 뻗기)에서도 걸음마다 갱신한다 — 0.8.4는 아래의 `continue` 뒤에서 정해 손 조작 2에서는 갱신되지 않았다
    H.swivel = H.armBlock && ((S.poleS && S.poleS['el' + H.s + 'w']) || 0) > 0.5;
    if (H.drag) continue;
    const miss = H.w.distanceTo(H.goal), far = sh.distanceTo(H.goal) - CL.ARM;
    // 이번 걸음에 갈 수 있는 거리의 반(1.3cm) 안이면 닿은 것이다(몸이 움직이는 중에도 놓치지 않게)
    // p3d-0.8.8: 이 거리는 손의 지금 빠르기가 아니라 가장 빠른 빠르기(HAND_V)로 잰다 — 다가가며 느려지게 하자 이 거리가 4mm로 줄어, 턱에 막혀 마지막 몇 mm를 가지 못하는 손이 끝내 잡지 못했다(놓았던 손을 턱 A로 되돌리는 장면. 영상의 기록에서 찾음). 0.8.7까지와 같은 1.3cm다
    if (H.edge && miss <= Math.max(CL.CATCH, (globalThis.OLDHAND ? H.sp : CL.HAND_V) * dt * 0.5) && far <= 0.002) { const c = armCheck(S, H.i, sh, H.goal, H.n); if (c) reject(S, H, 'hand', c); else grab(S, H); continue; }
    // 더 갈 수 없게 된 뒤(팔이 다 펴졌거나 멈춤)로 TRY_T만큼만 더 뻗고 있는다. 그사이 몸이 다가가면 잡는다
    // 팔꿈치가 아직 돌고 있는 동안(팔꿈치 먼저)은 "더 갈 수 없게 된 시간"으로 세지 않는다. 세면 팔꿈치가 다 돌기 전에 0.3초가 차서 닿을 수 있는 턱을 거부한다
    // p3d-0.8.6: 다른 팔에 막혀 서 있는 동안 그 팔이 자리를 내 주느라 팔꿈치를 돌리고 있으면 그것도 세지 않는다
    // 제 몸·다른 팔에 막혀 서 있는 동안 이 팔의 팔꿈치가 비는 쪽으로 돌고 있으면 그것도 세지 않는다(다 돌기 전에 0.3초가 차면 갈 수 있는 길을 거부한다)
    const yielding = (H.stopA && ((S.poleS && S.poleS['el' + (H.i ? 'L' : 'R') + 'w']) || 0) > 0.5) || ((H.stopA || H.stopB) && ((S.poleS && S.poleS['el' + H.s + 'w']) || 0) > 0.5);
    if (H.w.clone().sub(sh).distanceTo(rel0) < 0.0015 && !H.swivel && !yielding) H.wait += dt;
    // 까닭의 순서(p3d-0.8.6): 팔이 턱에 걸림 → 팔을 다 펴도 닿지 않는 거리(몸·다른 팔에 스쳤더라도 거리가 까닭이다) → 제 몸에 가림 → 다른 팔에 가림
    if (H.wait > CL.TRY_T || H.t > H.T) reject(S, H, 'hand', H.blockT > 0.12 ? '팔이 턱에 걸려 닿지 않음' : far > 0.02 ? `닿지 않음(${short(Math.max(far, miss))} 모자람)` : (H.selfBlock || 0) > 0.12 ? '몸에 막혀 닿지 않음' : (H.armCross || 0) > 0.12 ? '다른 팔에 막혀 닿지 않음' : `닿지 않음(${short(Math.max(far, miss))} 모자람)`);
  }
  if (!K.on) return;
  for (const F of K.feet) {
    const hj = J.hj[F.i];
    if (F.st === 'move') {
      F.t += dt;
      const k = Math.min(1, F.t / F.T), u = mj(k), p = F.from.clone().multiplyScalar((1 - u) * (1 - u)).addScaledVector(F.via, 2 * u * (1 - u)).addScaledVector(F.ank, u * u), R = DIM.leg * 0.995;
      // 윗면으로 가는 발은 먼저 들어 올린 뒤에 옮긴다(발끝이 턱 모서리를 뚫고 가지 않게)
      // p3d-0.9.0: 들면서 함께 간다(F.arc = 명령 때 발끝이 턱을 뚫지 않는 것을 확인한 호. 가운데가 벽에서 조금 멀고 높다). 0.8.8까지는 먼저 거의 곧게 들어 올린 뒤(처음 45%) 옆·앞으로 갔다 — 발이 몸 아래에서 무릎 높이까지 올라오는 동안 다리가 깊이 접혀 무릎이 옆으로 벌어졌다
      if (F.kind === 'top' && !F.arc) { const uv = mj(clamp(k / 0.45, 0, 1)), uh = mj(clamp((k - 0.4) / 0.6, 0, 1)); p.set(lerp(F.from.x, F.ank.x, uh), lerp(F.from.y, F.ank.y, uv) + 0.08 * Math.sin(Math.PI * k), lerp(F.from.z, F.ank.z, uh)); }
      const d = p.clone().sub(hj);
      if (d.length() > R) p.copy(hj).addScaledVector(d.normalize(), R);
      F.a.copy(p);
      if (F.t < F.T) continue;
      const miss = F.a.distanceTo(F.ank);
      if (miss <= CL.CATCH) { const c = legCheck(S, F.i, hj, F.ank); if (c) reject(S, F, 'foot', c); else { F.st = 'plant'; F.a.copy(F.ank); F.load = 0; note(S, 'step', 'foot', F.i, (F.kind === 'top' ? '윗면' : '벽면') + (F.byAssist ? ' · 발 보조' : ''), { box: F.box.name, assist: !!F.byAssist }); } }
      else if ((F.tryT += dt) > CL.TRY_T) reject(S, F, 'foot', `발이 닿지 않음(${short(miss)} 모자람)`);
    } else if (F.st === 'free') {
      // 늘어뜨린 발: 고관절 아래의 쉬는 자리로 돌아가고, 윗면에 닿으면 저절로 디딘다(닿은 것은 접촉이다. 붙이는 것이 아니다)
      // 막 뗀 발은 잠깐(0.22초) 다시 디디지 않고 쉬는 자리로 옮겨 간다(끌려가며 디뎠다 뗐다 하지 않게)
      F.cool = Math.max(0, (F.cool || 0) - dt);
      // p3d-0.8.0: 쉬는 자리로 딱 맞춰 가지 않고 덜 감쇠된 스프링으로 뒤따른다(몸이 움직이면 관성으로 늦게 따라오다 지나친다 = 진자. 두 다리의 빠르기를 조금 다르게 해 한 덩어리로 움직이지 않게 한다).
      //   흔들기(A/D)를 넣으면 다리가 그쪽으로 먼저 간다(가는 쪽 다리가 더 크게, 무릎을 조금 접어) — 옆으로 미는 힘(SWING_A)의 원인을 몸이 보여 준다. 벽에서 뛰는 동안에는 무릎을 접어 올렸다가 편다
      { const Kc = S.climb, yaw = S.body.yaw, sd = Kc.sideIn || 0, tk = clamp(Kc.pz.tuck, 0, 1), sx = F.i ? -1 : 1, lead = sd * sx > 0;
        // (p3d-0.8.1에서 "발끝이 벽 가까이 오는 비접촉 자세"를 넣었다가 뺐다: 발이 엉덩이 아래·앞에 늘어져 있다가 바닥에 닿아 디디면 벽 바로 앞에 서게 되어 굽힌 무릎이 벽에 들어갔다 — 한 손 매달림 뒤 다시 잡는 장면 60조합 가운데 25조합, 최대 750걸음. 쉬는 자리는 0.7.0처럼 엉덩이 조금 뒤다)
        const rest = V(sx * 0.02, -CL.DANGLE + (F.cool > 0 ? 0.05 * Math.sin(Math.PI * F.cool / 0.22) : 0) + 0.36 * tk + (lead ? 0.10 : 0.04) * Math.abs(sd), -0.06 - 0.30 * tk).applyAxisAngle(UP, yaw).addScaledVector(V(Math.cos(yaw), 0, -Math.sin(yaw)), sd * (lead ? 0.30 : 0.15));
        // 한 발만 디디고 있으면 놓인 다리는 디딘 발의 반대쪽으로 뻗어 둔다(실제 영상에서 되풀이해 보이는 모양 — 품질 검토 13절). 지금 몸 모델에서는 균형에 효과가 없는 "모양"이다(연출 후보라고 적어 둔다)
        { const O = Kc.feet[1 - F.i], wf = O.st === 'plant' && Kc.hands.some(h => h.st === 'hold') ? clamp(((O.loadS || 0) - 0.05) / 0.15, 0, 1) : 0; if (wf > 0) { const lf = V(Math.cos(yaw), 0, -Math.sin(yaw)), dd = hj.clone().sub(O.p).dot(lf), sg = Math.abs(dd) < 0.06 ? sx : dd > 0 ? 1 : -1; rest.addScaledVector(lf, sg * 0.26 * wf); rest.y += 0.05 * wf; } }
        const w = F.cool > 0 ? 16 : (F.i ? 6.4 : 5.6) + 5 * tk + 3 * Math.abs(sd), zeta = F.cool > 0 ? 1 : 0.55; F.relV = F.relV || V();
        F.relV.addScaledVector(F.rel.clone().sub(rest), -w * w * dt).multiplyScalar(1 / (1 + 2 * zeta * w * dt)).addScaledVector(Kc.accS, -0.55 * dt);
        F.rel.addScaledVector(F.relV, dt); const L = F.rel.length(), L1 = clamp(L, 0.45, DIM.leg * 0.985); if (L !== L1) { F.rel.multiplyScalar(L1 / L); const n = F.rel.clone().normalize(); F.relV.addScaledVector(n, -F.relV.dot(n)); } }
      F.a.copy(hj).add(F.rel);
      // 늘어뜨린 발·발끝이 벽·턱 옆면에 들어가면 들어가지 않을 때까지 벽에서 뗀다
      // 벽·턱의 옆면만 본다(발이 윗면 위에 있거나 바닥에 가까운 것은 아래의 "닿은 발"이 다룬다). 들어간 만큼만 가장 얕은 쪽(옆 또는 위)으로 빼내고(한 걸음에 5cm까지), 그쪽으로 들어가던 속도는 지운다
      // (전에는 언제나 뒤로 3cm씩 밀어, 바닥·윗면 가까이에서는 걸음마다 30cm씩 날아갔고 옆의 발판에 닿으면 3cm 단위로 떨었다)
      { const fw = V(Math.sin(S.body.yaw), 0, Math.cos(S.body.yaw)), out = (q, m, top) => { let n = null; for (const x of S.world.boxes) { if (x.kind === 'floor' || q.y >= x.max.y + top || q.y <= x.min.y - m) continue; const d = [[q.x - x.min.x + m, -1, 0, 0], [x.max.x + m - q.x, 1, 0, 0], [q.z - x.min.z + m, 0, 0, -1], [x.max.z + m - q.z, 0, 0, 1]]; if (d.some(e => e[0] <= 0)) continue; d.push([x.max.y + top - q.y, 0, 1, 0]); const o = d.sort((a, c) => a[0] - c[0])[0], k = Math.min(o[0], 0.05); n = V(o[1] * k, o[2] * k, o[3] * k); q.add(n); } return n; };
        for (const [off, m, top] of [[V(), 0.03, -0.02], [fw.clone().multiplyScalar(0.13).add(V(0, -0.05, 0)), 0.01, 0.01]]) { const q = F.a.clone().add(off), n = out(q, m, top); if (n) { F.a.add(n); F.rel.add(n); if (F.relV) { const u = n.clone().normalize(); F.relV.addScaledVector(u, -Math.min(0, F.relV.dot(u))); } } } }
      const g = groundAt(S.world, F.a.x, F.a.z, F.a.y - DIM.ankleY + 0.04, 0, 0), g2 = groundAt(S.world, F.a.x, F.a.z, F.a.y + 0.05, 0, 0.12);
      F.clear = g2.box ? Math.max(0, F.a.y - DIM.ankleY - g2.y) : 9;
      if (g.box && F.a.y - DIM.ankleY <= g.y) {
        // 닿은 발: 다리가 닿는 자리이고 몸이 올라가는 중이 아니면 디딘다. 아니면 발끝만 닿은 채 둔다(면 아래로 들어가지 않게 올려 둔다)
        const yaw = S.body.yaw, fwd = V(Math.sin(yaw), 0, Math.cos(yaw)), p = V(F.a.x, g.y, F.a.z).addScaledVector(fwd, DIM.ballZ), q = Q().setFromAxisAngle(UP, yaw), G = footGeom(p, UP, q);
        F.a.y = g.y + DIM.ankleY; F.rel.copy(F.a).sub(hj); if (F.relV) { if (F.relV.y < 0) F.relV.y = 0; F.relV.multiplyScalar(0.85); }
        if (!(F.cool > 0) && !(F.userOff && F.offBox === g.box) && S.body.vel.y <= 0.05 && hj.distanceTo(G.ank) <= DIM.leg * 0.995 && hj.y - g.y >= CL.LEG_MIN_H) {
          Object.assign(F, { st: 'plant', kind: 'top', box: g.box, patch: patchOf(p, fwd, g.box), auto: true, load: 0, why: '' });
          F.p.copy(p); F.ball.copy(G.ball); F.ank.copy(G.ank); F.a.copy(G.ank); F.q.copy(q); F.n.copy(UP);
          note(S, 'step', 'foot', F.i, '닿아서 디딤', { box: g.box.name, auto: true });
        }
      }
    }
  }
}
function grab(S, H) {
  const K = S.climb; H.st = 'hold'; H.drag = false; H.swivel = false; H.selfBlock = 0; H.armCross = 0; H.pass = 0; H.hn = null; H.w.copy(H.goal); H.load = 0; H.bad = 0; H.jam = 0; H.why = ''; H.F = null;
  note(S, 'grab', 'hand', H.i, '', { box: H.edge.box.name, grip: H.grip.toArray() });
  if (!K.on) enter(S, S.body.onGround ? '서서 잡음' : '공중에서 잡음');
}
// 벽 문맥으로 들어간다(첫 손이 잡힌 순간). 몸의 속도는 그대로. 땅에 서 있었으면 두 발은 지금 디딘 자리의 접촉이 된다
function enter(S, why) {
  const K = S.climb, b = S.body, B = S.rig.bones, hip = worldPos(B.hips);
  K.shrug[0] = 0; K.shrug[1] = 0; K.pendFoot = null; K.push = null; K.jumpHeld = !!(S.inp && S.inp.jump); K.on = true; K.blend = { t: 0, q: Object.fromEntries(TORSO.map(n => [n, B[n].quaternion.clone()])) };
  K.blend.q.hips = B.hips.getWorldQuaternion(Q());
  for (const s of SIDES) { seedBend(S, 'kn' + s, `upLeg.${s}`, `leg.${s}`, `foot.${s}`); if (K.hands[s === 'L' ? 0 : 1].st === 'free') seedBend(S, 'el' + s, `upperArm.${s}`, `foreArm.${s}`, `hand.${s}`); }
  const wasGround = b.onGround, gy = b.ground;
  b.pos.set(hip.x, hip.y - DIM.hipY, hip.z); b.push = null; b.charging = false; b.charge = 0; b.onGround = false; K.ref.copy(b.pos); K.lean.x = 0; K.lean.z = 0;
  K.T = torso(b, K);
  for (const F of K.feet) {
    const ank = worldPos(B[`foot.${F.s}`]), toe = worldPos(B[`toe.${F.s}`]), q = B[`foot.${F.s}`].getWorldQuaternion(Q());
    F.a.copy(ank); F.rel.copy(ank).sub(K.T.hj[F.i]); F.st = 'free'; F.load = 0;
    const g = groundAt(S.world, toe.x, toe.z, toe.y + 0.05, 0.02, 0.02);
    if (wasGround && g.box && toe.y - g.y < 0.06) { const fwd = V(0, 0, 1).applyQuaternion(q).setY(0).normalize(), p = V(toe.x, g.y, toe.z); Object.assign(F, { st: 'plant', kind: 'top', box: g.box, patch: patchOf(p, fwd, g.box), auto: true, why: '' }); F.p.copy(p); F.ball.copy(toe); F.ank.copy(ank); F.q.copy(q); F.n.copy(UP); }
  }
  for (const H of K.hands) if (H.st === 'free') { H.w.copy(worldPos(B[`hand.${H.s}`])); H.rel.copy(H.w).sub(K.T.sh[H.i]); }
  K.enterTick = K.tick;
  note(S, 'enter', null, 0, why, { vel: b.vel.toArray(), gy });
}
function exit(S, standing, g) {
  const K = S.climb, b = S.body, B = S.rig.bones;
  K.on = false; K.exited = true; K.blend = null;
  K.out = { t: 0, q: S.rig.list.map(x => x.quaternion.clone()), hipW: worldPos(B.hips), rel: null };
  for (const F of K.feet) { F.st = 'free'; F.load = 0; }
  for (const H of K.hands) if (H.st === 'free') H.ov = 0;
  b.onGround = standing; b.airT = 0; b.landImpact = 0; b.tuck = 0; b.r = 0.04; b.noTuck = true;
  if (standing) { b.ground = g.y; b.pos.y = g.y; b.vel.y = 0; } else b.events.push({ type: 'walkoff', t: b.t });
  note(S, 'exit', null, 0, standing ? '손을 놓고 섬' : '손을 놓고 떨어짐', { vel: b.vel.toArray(), standing });
}

// 몸통(엉덩이~어깨의 원기둥)과 머리(공)를 상자와 맞댄다. 한 걸음에 크게 밀려나지 않게 가장 얕은 쪽으로만 민다
function collide(S, T) {
  const b = S.body, K = S.climb;
  const parts = [{ n: '몸통', x: b.pos.x, z: b.pos.z, y0: b.pos.y + 0.85, y1: b.pos.y + 1.50, r: CL.R_TORSO }, { n: '머리', x: T.head.x, z: T.head.z, y0: T.head.y - CL.R_HEAD, y1: T.head.y + CL.R_HEAD, r: CL.R_HEAD }];
  let bump = '';
  for (const P of parts) for (const x of S.world.boxes) {
    if (x.kind === 'floor' || P.y1 <= x.min.y || P.y0 >= x.max.y) continue;
    const cx = clamp(P.x, x.min.x, x.max.x), cz = clamp(P.z, x.min.z, x.max.z), dx = P.x - cx, dz = P.z - cz, d = Math.hypot(dx, dz);
    if (d >= P.r) continue;
    let nx, nz, ph;
    if (d > 1e-6) { nx = dx / d; nz = dz / d; ph = P.r - d; }
    else { const o = [[P.x - x.min.x + P.r, -1, 0], [x.max.x - P.x + P.r, 1, 0], [P.z - x.min.z + P.r, 0, -1], [x.max.z - P.z + P.r, 0, 1]].sort((a, c) => a[0] - c[0])[0]; ph = o[0]; nx = o[1]; nz = o[2]; }
    const pDown = P.y1 - x.min.y, pUp = x.max.y - P.y0, mid = (P.y0 + P.y1) / 2 < (x.min.y + x.max.y) / 2;
    if (mid && pDown < ph) { b.pos.y -= pDown; P.y0 -= pDown; P.y1 -= pDown; if (b.vel.y > 0) b.vel.y = 0; bump = `${P.n}: ${x.name} 아래에 닿음`; }
    else if (!mid && pUp < ph) { b.pos.y += pUp; P.y0 += pUp; P.y1 += pUp; if (b.vel.y < 0) b.vel.y = 0; }
    else { b.pos.x += nx * ph; b.pos.z += nz * ph; P.x += nx * ph; P.z += nz * ph; const vn = b.vel.x * nx + b.vel.z * nz; if (vn < 0) { b.vel.x -= vn * nx; b.vel.z -= vn * nz; K.stats.wallHit = Math.max(K.stats.wallHit, -vn); } }
  }
  if (bump && K.tick - K.bumpT > 120) { note(S, 'bump', null, 0, bump); K.bumpT = K.tick; }
  // 엉덩이는 바닥·윗면 아래로 내려가지 않는다(주저앉은 높이까지)
  { const g = groundAt(S.world, b.pos.x, b.pos.z, b.pos.y + DIM.hipY, 0, 0.1); if (g.box && b.pos.y + DIM.hipY - 0.22 < g.y) { b.pos.y = g.y + 0.22 - DIM.hipY; if (b.vel.y < 0) b.vel.y = 0; } }
}

// 힘 나누기: 원하는 힘(Fd)에 가장 가깝고, 무게중심 둘레의 돌림힘이 가장 작게 남도록 접촉마다 힘을 정한다(한 접촉씩 번갈아 푼다).
//   팔 = 어깨→손 방향으로 당기기만(0 ~ cap). 다리 = 디딘 면의 마찰 범위 안의 어느 방향이든(면을 누르는 쪽만, 다리 축에서 벗어난 몫은 perp까지, 크기는 cap까지. 다 펴진 다리는 더 밀지 못한다).
//   r = 힘이 걸리는 점(잡은 자리·디딘 자리) − 무게중심. 발 하나로 설 때 무게중심이 발 위에 없으면 돌림힘을 없앨 수 없어 힘이 기울고, 몸이 그쪽으로 넘어간다.
//   돌림힘은 손으로 잡고 있지 않을 때만 따진다(lam). 손에 매달린 몸은 흔들릴 뿐 넘어가지 않고, 그 흔들림은 팔 길이 구속이 만든다.
// 진단: 섞은 뒤의 힘이 그 걸음의 한계를 1N 넘게 넘은 횟수와 가장 큰 넘침(N). loose = 한계를 다시 걸지 않는다(p3d-0.8.3까지의 동작, 견주기용)
export const FSTAT = { n: 0, over: 0, max: 0, loose: false };
function solveForces(C, Fd, lam) {
  const F = C.map(c => (c.f0 ? c.f0.clone() : V())), eps = 0.02;
  for (let it = 0; it < 40; it++) C.forEach((c, i) => {
    const R = Fd.clone(), Mo = V();
    C.forEach((k, j) => { if (j !== i) { R.sub(F[j]); Mo.add(k.r.clone().cross(F[j])); } });
    if (c.cap <= 0) { F[i].set(0, 0, 0); return; }
    // 팔은 다리보다 아껴 쓴다(다리가 받칠 수 있으면 다리가 받친다)
    if (c.arm) { const ru = c.r.clone().cross(c.u), t = clamp((c.u.dot(R) - lam * ru.dot(Mo)) / (1 + 0.3 + lam * ru.lengthSq()), 0, c.cap); F[i].copy(c.u).multiplyScalar(t); return; }
    const a = 1 + eps + lam * c.r.lengthSq(), b = R.clone().addScaledVector(Mo.clone().cross(c.r), -lam), f = b.clone().addScaledVector(c.r, lam * c.r.dot(b) / (a - lam * c.r.lengthSq())).multiplyScalar(1 / a);
    const cone = () => { const fn = f.dot(c.n); if (fn <= 0) { f.set(0, 0, 0); return; } const ft = f.clone().addScaledVector(c.n, -fn), l = ft.length(); if (l > c.mu * fn) f.copy(c.n).multiplyScalar(fn).addScaledVector(ft, c.mu * fn / l); };
    cone();
    const ax = Math.max(0, f.dot(c.w)), pp = f.clone().addScaledVector(c.w, -f.dot(c.w)); if (pp.length() > c.perp) pp.setLength(c.perp);
    f.copy(c.w).multiplyScalar(ax).add(pp); cone(); if (f.length() > c.cap) f.setLength(c.cap);
    F[i].copy(f);
  });
  // 앞 걸음의 답과 반씩 섞는다(두 팔이 비슷한 방향일 때 힘이 걸음마다 이 팔 저 팔로 옮겨 다니지 않게)
  C.forEach((c, i) => { if (c.f0) F[i].lerp(c.f0, 0.5); });
  // 한계는 넘지 못하는 값이다: 섞은 뒤에도 지금 걸음의 한계 안에 둔다(한계가 앞 걸음보다 줄었을 때 앞 걸음의 힘이 절반 남아 한계를 넘던 것 — p3d-0.8.4)
  C.forEach((c, i) => { const over = F[i].length() - Math.max(0, c.cap); FSTAT.n++; if (over > 1) { FSTAT.over++; FSTAT.max = Math.max(FSTAT.max, over); } if (FSTAT.loose) return; if (c.cap <= 0) F[i].set(0, 0, 0); else if (over > 0) F[i].setLength(c.cap); });
  return F;
}

// 잡은 팔(과 잡을 수 있는지의 판정)의 팔꿈치 방향(p3d-0.8.5). 기본 후보(armIK)의 팔뚝 줄기가 제 몸에 겹치지 않으면 그대로다(0.8.4와 같다).
// 겹치면 어깨–손목 축 둘레를 다 돌려 보고 제 몸에 겹치지 않는 쪽을 고른다(팔꿈치가 지형 안이면 벌점). 그림(poseArm)과 판정(armCheck)이 같은 함수를 쓴다.
// 전에는 기본 후보 하나로만 "팔이 머리·몸통을 지나감"을 판정해서, 팔꿈치를 다른 쪽으로 두면 되는 팔 교차까지 놓쳤다
const elbowIn = (world, p) => world.boxes.some(x => p.x > x.min.x - 0.03 && p.x < x.max.x + 0.03 && p.y > x.min.y - 0.03 && p.y < x.max.y + 0.03 && p.z > x.min.z - 0.03 && p.z < x.max.z + 0.03);
function heldPole(S, s, sh, goal, yaw, sx, qC) {
  const base = armIK(S.world, sh, goal, yaw, sx, qC), B = selfShapes(S, s === 'L' ? 0 : 1), XA = globalThis.NOYIELD ? 0 : (globalThis.XA ?? 0.06), s0 = armSelf(B, base.ik, sh, 0, XA);
  // p3d-0.8.6: 잡고 있는 팔은 다른 팔이 6cm 안으로 다가오면 팔꿈치를 돌려 미리 자리를 내 준다(뻗는 팔은 겹치기 전에 멈추므로, 겹친 뒤에야 비키면 둘 다 서 버린다)
  if (!s0) return { pole: base.pole, ik: base.ik, self: null };
  const u = goal.clone().sub(sh); if (u.lengthSq() < 1e-8) return { pole: base.pole, ik: base.ik, self: s0 }; u.normalize();
  const e0 = base.pole.clone().addScaledVector(u, -base.pole.dot(u)); if (e0.lengthSq() < 1e-8) return { pole: base.pole, ik: base.ik, self: s0 }; e0.normalize();
  const e1 = u.clone().cross(e0), prev = S.pw && S.poleS && S.poleS['el' + s], pa = prev ? Math.atan2(prev.dot(e1), prev.dot(e0)) : 0; let best = null;
  for (let j = 0; j < 24; j++) { const a = j * Math.PI / 12, an = a > Math.PI ? a - 2 * Math.PI : a, pl = e0.clone().multiplyScalar(Math.cos(a)).addScaledVector(e1, Math.sin(a)), ik = twoBone(sh, goal, DIM.upperArm, DIM.foreArm, pl), sf = armSelf(B, ik, sh), sm = XA ? armSelf(B, ik, sh, 0, XA) : sf;
    let dp = Math.abs(an - pa); if (dp > Math.PI) dp = 2 * Math.PI - dp;
    // 실제 겹침(머리·몸통, 여유 밖의 다른 팔)이 먼저다. 다른 팔과의 여유(6cm 안)는 가볍게만 본다 — 여유를 벌리려고 팔꿈치를 머리 쪽으로 돌리면 머리에 닿는다(0.8.6 작업 중에, 그것을 윗몸이 비키느라 엇갈려 잡은 몸이 36cm 옆으로 밀려갔다)
    const cost = 3 * sd(sf, 'body') + 3 * sd(sf, 'arm') + (globalThis.MW ?? 0.2) * Math.max(0, sd(sm, 'arm') - sd(sf, 'arm')) + (elbowIn(S.world, ik.mid) ? 0.05 : 0) + 0.004 * Math.abs(an) + (prev ? 0.006 * dp : 0); if (!best || cost < best.cost - 1e-7) best = { cost, pole: pl, ik, self: sf }; }
  return best;
}

// ── 벽 문맥의 한 걸음 ──
export function stepClimb(S, inp, dt) {
  const b = S.body, K = S.climb, W = S.world, m = CL.MASS, BW = m * PHY.G;
  b.events.length = 0; b.t += dt;
  if (K.blend && (K.blend.t += dt) >= CL.BLEND_T) K.blend = null;
  const held = K.hands.filter(h => h.st === 'hold'), planted = K.feet.filter(f => f.st === 'plant');
  // 몸은 잡은 턱 쪽을 본다
  const nW = V(); for (const h of held) nW.add(h.n);
  if (nW.lengthSq() > 0.01) { nW.normalize(); const d = Math.atan2(-nW.x, -nW.z) - b.yaw; b.yaw += clamp(Math.atan2(Math.sin(d), Math.cos(d)), -CL.TURN * dt, CL.TURN * dt); }
  // 기울기(편한 기본 자세의 임시 규칙): 발로 버티면 윗몸을 조금 뒤로. 손으로만 매달리면 잡은 손의 어깨가 올라가고 엉덩이가 그 손 아래로 온다(한 손 매달림)
  const left = V(Math.cos(b.yaw), 0, -Math.sin(b.yaw)), fwd = V(Math.sin(b.yaw), 0, Math.cos(b.yaw)), sup = planted.some(f => f.load > 0.1 && f.box.kind !== 'floor');
  let rollT = held.length === 1 && !planted.some(f => f.load > 0.1) ? (held[0].i ? -1 : 1) * (K.hands.some(h => h.st === 'reach') ? 0.12 : 0.3) : 0;
  // 손으로만 매달려 좌우로 흔들릴 때는 몸 전체가 손을 축으로 기운다(몸통이 꼿꼿한 채 옆으로만 밀리면 팔이 머리를 지나가게 된다)
  const swingRoll = held.length && !planted.some(f => f.load > 0.1);
  if (swingRoll) { const c = V(); for (const h of held) c.add(h.goal); c.multiplyScalar(1 / held.length); rollT += clamp(Math.atan2(b.pos.clone().sub(c).dot(left), c.y - b.pos.y - DIM.hipY), -0.6, 0.6); }
  // 발로 받치고 있을 때도 윗몸은 잡은 손 쪽으로 기운다(엉덩이가 옆으로 가면 몸통이 손을 향해 눕는다. 실제 영상에서 몸통 기울기는 −10~38°를 오간다 — 품질 검토 13절). 발이 받치는 만큼 덜 기운다
  // p3d-0.8.4(몸 연결): 뻗는 손이 가는 자리도 함께 본다. 전에는 손을 떼어 뻗는 순간 "잡은 손"이 하나로 줄어 윗몸이 남은 손 쪽으로(= 뻗는 목표의 반대쪽으로) 더 기울었다 — 턱 A → 턱 F에서 뻗는 어깨가 목표에서 12cm 멀어졌다
  else if (held.length) { const c = V(), rs = globalThis.NOLEAN ? [] : K.hands.filter(h => h.st === 'reach' && h.edge); for (const h of [...held, ...rs]) c.add(h.goal); c.multiplyScalar(1 / (held.length + rs.length)); rollT += 0.75 * clamp(Math.atan2(b.pos.clone().sub(c).dot(left), Math.max(0.25, c.y - b.pos.y - DIM.hipY)), -0.6, 0.6); }
  // p3d-0.8.8 몸 연결(사용자 플레이 1차 — "팔만 움직이고 몸은 굳어 있다"): 받치는 발이 있고 한 손으로 잡은 채 다른 손을 뻗을 때, 팔을 거의 다 펴야 닿는 거리면 윗몸이 목표 쪽으로 기울고(K.stretch) 골반이 따라 기운다.
  //   stretch = 어깨에서 목표까지가 팔 길이의 80%를 넘는 만큼(0~1. 가까운 목표에는 팔만 간다). 몸의 자리(무게중심)는 옮기지 않는다 — 올라서고 옆으로 가는 것은 플레이어의 조작(W·A·D) 그대로다.
  //   어깨가 목표 쪽으로 몇 cm 가므로 닿는 거리가 그만큼 는다(잰 값은 품질 검토 21절). 비교 스위치 NOSTRETCH
  { const rch = K.hands.find(h => h.st === 'reach'), Tn = K.T || torso(b, K); let st = 0, sd2 = 0;
    // 목표가 옆에 있으면 그쪽으로 더 기울고(side), 위에 있으면 가슴이 벽 쪽으로 다가가고 뻗는 쪽 골반이 올라간다(stretchUp). 해 보고 뺀 것: 위로 뻗을 때 어깨 선을 반대로 기울이기 — 이미 있는 "잡은 손·뻗는 목표 쪽으로 눕는 기울기"와 맞서 윗몸이 오히려 덜 움직였다(8.6° → 5.3°)
    if (rch && held.length && !swingRoll && planted.some(f => f.load > 0.1) && !globalThis.NOSTRETCH) { const d = rch.goal.clone().sub(Tn.sh[rch.i]), L = Math.max(d.length(), 1e-6), uy = clamp(d.y / L, 0, 1), ux = -d.dot(left) / L; st = clamp((L - 0.80 * CL.ARM) / (0.25 * CL.ARM), 0, 1); sd2 = 0.16 * ux * (1 - uy); K.stretchUp = uy; }
    K.stretch = K.stretch || { s: 0, side: 0 }; springS(K.stretch, 's', st, 0.10, dt); springS(K.stretch, 'side', st * sd2, 0.10, dt); rollT += K.stretch.side; }
  // 머리 위(25cm 안)에 턱이 있으면 머리가 그 앞으로 지나가게 윗몸을 젖힌다(필요한 만큼만)
  let need = 0; const hx = b.pos.x, hz = b.pos.z, hy = b.pos.y + DIM.hipY + DIM.spine + 0.60, back = fwd.clone().negate();
  for (const x of W.boxes) { if (x.kind === 'floor' || x.min.y > hy + CL.R_HEAD + 0.25 || x.max.y < hy - CL.R_HEAD) continue; if (Math.hypot(hx - clamp(hx, x.min.x, x.max.x), hz - clamp(hz, x.min.z, x.max.z)) >= CL.R_HEAD + 0.02) continue; const supp = Math.max(x.min.x * back.x, x.max.x * back.x) + Math.max(x.min.z * back.z, x.max.z * back.z); need = Math.max(need, supp + CL.R_HEAD + 0.03 - (hx * back.x + hz * back.z)); }
  const leanT = held.length ? Math.min((sup ? -0.2 : -0.04) + (sup ? 0.09 * K.stretch.s * (K.stretchUp || 0) : 0), -Math.asin(clamp(need / 0.60, 0, 0.5))) : 0;
  // 잡은 팔이 머리에 닿으면 비켜 준다(p3d-0.8.5: 윗몸 → 0.8.6: 목·머리. torso()가 K.hg를 목·머리의 회전에 쓴다): 팔을 다 펴서 엇갈려 잡으면 팔꿈치를 어느 쪽으로 두어도 팔이 얼굴 앞을 지나가는데, 윗몸이 잡은 손 쪽으로 기울며 머리가 그 팔에 들어가 0.15초 뒤 손을 놓쳤다.
  // 겹친 깊이만큼 머리가 팔에서 멀어지는 쪽으로 윗몸을 기울이고(K.hg — 앞뒤·좌우), 여유 1.5cm를 두고도 닿지 않을 때만 천천히 되돌린다. 계산 걸음에서만 바뀌고 torso()를 거친다(물리 = 그림). 기존 접촉을 놓는 대신 몸이 비킨다
  { const g = K.hg || (K.hg = { x: 0, z: 0 }), Tn = K.T || torso(b, K); let hit = false, loose = true;
    if (!globalThis.NOSELF) for (const h of held) { const hp = heldPole(S, h.s, Tn.sh[h.i], h.goal, b.yaw, h.i ? -1 : 1, Tn.qC), sf = hp.self && hp.self.body && hp.self.body.head ? hp.self.body : null;
      if (sf) { hit = true; const k = Math.min(sf.d / 0.01, 2) * 5 * dt / 0.65 * 0.1; g.x += -sf.n.dot(fwd) * k * 6.5; g.z += sf.n.dot(left) * k * 6.5; }
      else if (loose) { const s2 = armSelf(selfShapes(S, h.i), hp.ik, Tn.sh[h.i], 0.015); if (s2 && s2.body && s2.body.head) loose = false; } }
    if (!hit && loose) { const k = Math.exp(-1.2 * dt); g.x *= k; g.z *= k; } g.x = clamp(g.x, -0.35, 0.35); g.z = clamp(g.z, -0.35, 0.35); } // p3d-0.8.6: 윗몸이 아니라 목·머리의 각이다(끝 0.35rad = 20°. 머리 가운데가 7cm쯤 비킨다. 그래도 닿으면 더 비키지 않는다)
  K.lean.x += (leanT - K.lean.x) * (1 - Math.exp(-8 * dt)); K.lean.z += (rollT - K.lean.z) * (1 - Math.exp(-(swingRoll ? 14 : K.stretch.s > 0.02 && !globalThis.NOSTRETCH ? 8 : 4) * dt));
  // 어깨(빗장뼈) 올림: 편 팔로 매달리면 그 어깨가 올라가 있고(힘을 뺀 매달림), 다른 손을 위로 뻗거나 몸을 당기면 매달린 어깨는 내리고(몸이 5cm쯤 올라온다) 뻗는 쪽 어깨가 올라간다
  { const reaching = K.hands.some(h => h.st === 'reach' && h.goal.y > b.pos.y + 1.4), up = (inp.cy || 0) > 0;
    K.hands.forEach((h, i) => { const t = h.st === 'reach' && h.goal.y > b.pos.y + 1.4 ? CL.SHRUG : h.st === 'hold' && h.load > 0.5 && !reaching && !up ? CL.SHRUG : 0; K.shrug[i] += (t - K.shrug[i]) * (1 - Math.exp(-(h.st === 'reach' && !globalThis.NOSTRETCH ? 9 : 5) * dt)); }); }
  // 의도: 기준 자리를 옮긴다(위·아래·좌·우). 벽에 발을 대고 버틸 때는 엉덩이를 벽에서 뗀다
  // 좌우는 화면에서 보이는 쪽(cxSign = 시점이 몸의 뒤쪽이면 +1, 앞쪽이면 -1. 화면 쪽이 정해 준다. 없으면 몸 기준)
  // 손으로만 매달려 있을 때(받치는 발이 없음) = 흔들기: 좌우 입력은 기준 자리를 옮기지 않고 엉덩이를 흔드는 힘이 된다(아래). 수평 기준 자리는 몸을 따라간다(흔들림을 붙잡지 않게)
  const hanging = held.length && !planted.some(f => f.load > 0.1), side = -(inp.cx || 0) * (inp.cxSign || 1);
  // 몸의 층 갱신(스프링으로 뒤따른다. 그리기에서는 읽기만 한다)
  { const Z = K.pz, reach = K.hands.find(h => h.st === 'reach'), one = held.length === 1 && !reach ? held[0] : null;
    // p3d-0.8.4(몸 연결): 위팔이 턱·벽에 겹치면 그 어깨가 벽에서 멀어지게 가슴을 연다(K.open). 전에는 뻗는 쪽 어깨를 언제나 벽 쪽으로 0.30 돌려, 턱 바로 아래에서 뻗으면 어깨가 턱 앞면 2cm 앞까지 가서 위팔(반지름 5.5cm)이 턱에 겹쳤다.
    //   겹친 깊이만큼 열고, 여유(1.5cm)를 두고도 겹치지 않을 때만 천천히 되돌린다(그 사이에서는 그대로 둔다 — 열었다 닫았다 떨지 않게). 손은 이 때문에 멈추지 않는다(손을 멈추는 것은 팔뚝의 겹침뿐)
    { const fw = V(Math.sin(b.yaw), 0, Math.cos(b.yaw)), Tn = K.T || torso(b, K); K.open = K.open || [0, 0]; K.upHit = K.upHit || [0, 0];
      for (const h of K.hands) { let d = 0, loose = true;
        if (h.st !== 'free' && S.poleS && S.poleS['el' + h.s]) { const tgt = h.st === 'hold' ? h.goal : h.w, ik = twoBone(Tn.sh[h.i], tgt, DIM.upperArm, DIM.foreArm, S.poleS['el' + h.s]), tb = h.edge ? h.edge.box : null, u = (armHit(W, Tn.sh[h.i], ik, tb) || {}).u, u2 = (armHit(W, Tn.sh[h.i], ik, tb, 0.015) || {}).u;
          if (u && u.n.dot(fw) < -0.3) d = u.d; loose = !(u2 && u2.n.dot(fw) < -0.3); }
        K.upHit[h.i] = d; K.open[h.i] = clamp(K.open[h.i] + (d > 0 ? Math.min(d / 0.01, 2) * 5 * dt : loose ? -0.8 * dt : 0), 0, 1); } }
    // 팔을 엇갈려 잡고 있는 동안(p3d-0.8.5): 나중에 건너간 팔의 어깨를 벽 쪽으로 둔 채로 있는다(가슴을 그대로 비틀어 둔다). 두 어깨와 두 손이 한 평면에 놓이면 두 팔이 X자로 서로를 지나가므로, 어깨의 앞뒤를 달리해 한 팔이 다른 팔 앞을 지나가게 한다
    // p3d-0.8.6: 뻗는 손의 목표가 다른 손 너머(교차)일 때도 같은 쪽으로 비튼다. 푸는 동안에도 스프링으로 이어서 돌아온다(목표가 바뀔 뿐 값은 건너뛰지 않는다)
    if (reach) K.lastReach = reach.i;
    const xs = globalThis.XTW ?? 1, gOf = h => (h.st === 'hold' || (h.st === 'reach' && h.edge) ? h.goal : null), g0 = gOf(K.hands[0]), g1 = gOf(K.hands[1]), isX = !!g0 && !!g1 && g0.clone().sub(g1).dot(left) < -0.02 && !globalThis.NOARMS;
    // 교차 중에는 더 크게 비튼다(0.45 — 가슴이 34°쯤 돈다. 0.30으로는 엇갈려 잡은 두 팔뚝이 2.6cm 겹쳤고 다 편 교차는 길이 없었다. 윗몸을 뒤로 물리는 것으로 풀면 팔 길이에 끌려 몸이 딸려 갔다)
    const XT = globalThis.XT ?? 0.45, crossed = !reach && isX ? xs * ((K.lastReach ?? 1) ? 1 : -1) * XT : 0, reachT = reach ? (reach.i ? 1 : -1) * (isX ? xs * XT : 0.30) : 0;
    springS(Z, 'twist', clamp((reach ? reachT : one ? (one.i ? 1 : -1) * 0.18 : crossed) + (globalThis.NOOPEN ? 0 : 0.5) * (K.open[0] - K.open[1]), -0.6, 0.6), 0.12, dt);
    let hr = 0; const pl = planted.filter(f => f.load > 0.05);
    if (pl.length) { const c = V(); for (const f of pl) c.add(f.p); c.multiplyScalar(1 / pl.length); hr = clamp(b.pos.clone().sub(c).dot(left) / 0.25, -1, 1) * 0.22; }
    else if (hanging) hr = clamp(b.vel.dot(left) * 0.10, -0.15, 0.15) + side * 0.10;
    springS(Z, 'hipRoll', hr + 0.035 * (Z.idleW || 0) * Math.sin(Z.breath * 1.5) - 0.06 * K.stretch.s * (K.stretchUp || 0) * (reach ? (reach.i ? 1 : -1) : 0), 0.10, dt);
    const mv = K.feet.find(f => f.st === 'move'), tgt = mv ? mv.p : reach ? reach.goal : inp.look ? V(...inp.look) : null; let ly = 0, lp = 0;
    if (tgt && K.T) { const d = tgt.clone().sub(K.T.head).applyQuaternion(K.T.qC.clone().invert()); if (d.z > -0.1) { ly = clamp(Math.atan2(d.x, d.z), -1.0, 1.0); lp = clamp(-Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.7, 0.8); } }
    if (!tgt && hanging) ly = side * 0.5;
    // 가만히 있는 동안(1.5초 넘게 입력·손발 이동 없음): 머리가 천천히 둘러보고 골반이 아주 조금 오간다(실제 영상에서는 머무는 동안에도 몸이 계속 움직인다 — 품질 검토 13.2). 모양만이다
    K.idleT = inp.cx || inp.cy || inp.jump || reach || mv || b.vel.length() > 0.12 ? 0 : (K.idleT || 0) + dt;
    { const wI = clamp((K.idleT - 1.5) / 1.0, 0, 1); if (wI > 0 && !tgt) { ly += 0.38 * wI * Math.sin(Z.breath * 1.18); lp += 0.10 * wI * Math.sin(Z.breath * 0.83 + 1); } Z.idleW = wI; }
    springS(Z, 'lookY', ly, 0.09, dt); springS(Z, 'lookP', lp, 0.09, dt); springS(Z, 'tuck', K.push ? 1 : 0, 0.07, dt); Z.breath += dt;
    K.sideIn = hanging ? side : 0; }
  // p3d-0.9.0 몸통 자세의 층(K.po)의 목표 — 붙은 손발과 가는 발에서 한꺼번에 정한다(GPT의 0.8.8 검토: 발 올리기 → 디딤 → 몸 올리기 → 손 뻗기를 한 흐름으로). 손으로 잡고 있을 때만 쓴다(발로만 서 있을 때의 균형은 그대로 둔다).
  //   ① 받치는 발 쪽으로: 하중을 받는 발들의 가운데(가는 발은 빼고)가 몸 가운데에서 옆으로 벗어난 만큼 골반이 그쪽으로 간다. 발을 들기 전에 골반이 남는 발 위로 가고, 디딘 발에 하중이 실리면 그 발 쪽으로 옮겨 간다.
  //   ② 엉덩이를 벽에서 뺀다: 벽 쪽의 발판에 올린(올리는) 다리가 깊이 접히는 만큼. 무릎이 몸과 벽 사이로 들어올 자리가 생긴다. 다리를 펴고 올라서면 돌아온다.
  //   ③ 골반이 돈다: 발이 제 고관절보다 안쪽(반대쪽)으로 넘어가는 만큼 그 다리의 고관절이 벽 쪽으로 나온다(엇갈려 디딜 때 골반을 틀지 않고 다리만 꺾이지 않게).
  //   ④ 손을 뻗을 때: 팔을 거의 다 펴야 닿는 거리면 골반이 목표의 반대쪽으로 가고 윗몸이 목표 쪽으로 간다(무게는 그대로). 어깨가 그만큼 목표에 가까워진다 — 닿는 거리가 달라지므로 PO_REACH는 비교 측정용 실험값이다.
  //   몸의 기준 자리(b.pos)는 옮기지 않는다. 값은 스프링으로 뒤따르고 torso()를 거쳐 물리와 그림에 함께 들어간다
  { const P = K.po, Tn = K.T || torso(b, K); let tx = 0, tz = 0, ty = 0;
    if (poseOn(K) && held.length && !K.push) {
      const mv = K.feet.find(f => f.st === 'move'), sup = planted.filter(f => f.load > 0.05);
      // 쓰는 때: 발을 옮기는 동안, 또는 발판 위의 한 발이 하중의 60%를 넘게 받는 만큼(그 발로 올라서는 중). 바닥에 서 있을 때는(두 발이든 한 발이든) 옮기지 않는다 — 바닥에 선 자세의 어깨 자리가 0.8.8과 달라지지 않게.
      //   처음에는 가리지 않았다. 그랬더니 바닥에 서서 옆으로 뻗는 손이 3cm 덜 닿았고, 팔을 다 편 교차(1.6cm 기준에 걸쳐 있는 아슬아슬한 장면)가 어깨 1~2cm 차이로 "다른 팔에 막힘"이 됐다
      if (sup.length) { let c = 0, w = 0, top = null; for (const f of sup) { c += f.ank.clone().sub(b.pos).dot(left) * f.load; w += f.load; if (!top || f.load > top.load) top = f; } const one = mv ? 1 : top.box.kind !== 'floor' ? clamp((top.load / w - 0.6) / 0.25, 0, 1) : 0; tx += one * clamp(c / w * CL.PO_SIDE * (mv ? 1.4 : 1), -CL.PO_SIDE_MAX, CL.PO_SIDE_MAX); }
      for (const f of K.feet) { if (f.st === 'free' || f.kind !== 'top' || (f.st === 'plant' && f.box.kind === 'floor')) continue; const hj = Tn.hj[f.i], d = f.ank.clone().sub(hj), sx = f.i ? -1 : 1;
        const fold = clamp((0.66 - d.length() / DIM.leg) / 0.26, 0, 1), front = clamp((d.dot(fwd) - 0.08) / 0.12, 0, 1); tz = Math.min(tz, -CL.PO_BACK * fold * front);
        ty += -sx * CL.PO_YAW * clamp((-sx * d.dot(left) - 0.05) / 0.20, 0, 1); }
      const rch = K.hands.find(h => h.st === 'reach'); if (rch && K.stretch.s > 0.01) { const d = rch.goal.clone().sub(Tn.sh[rch.i]); tx += -CL.PO_REACH * K.stretch.s * clamp(d.dot(left) / Math.max(d.length(), 1e-6) * 1.6, -1, 1); }
    }
    springS(P, 'x', tx, 0.13, dt); springS(P, 'z', tz, 0.15, dt); springS(P, 'yaw', clamp(ty, -0.7, 0.7), 0.15, dt); }
  if (hanging) { K.ref.x = b.pos.x; K.ref.z = b.pos.z; } else K.ref.addScaledVector(left, side * CL.SHIFT_V * dt);
  if (!K.push) K.ref.y += (inp.cy || 0) * CL.SHIFT_V * dt;
  // 벽에서 뛰기: 누르는 순간 밀기 시작(모으기 없음, 지상 점프와 같다). 방향 = 위 + 좌우(A/D) + 벽에서 조금 떨어지는 쪽. S를 누르고 있으면 벽을 차고 뒤로
  const jumpPress = !!inp.jump && !K.jumpHeld; K.jumpHeld = !!inp.jump;
  if (jumpPress && !K.push && (held.length || planted.length)) {
    const out = nW.lengthSq() > 0.01 ? nW.clone() : fwd.clone().negate(), back = (inp.cy || 0) < 0;
    const dir = back ? out.clone().multiplyScalar(0.85).add(V(0, 0.45, 0)) : V(0, 1 + 0.3 * Math.max(0, inp.cy || 0), 0).addScaledVector(left, side * 0.75).addScaledVector(out, 0.12);
    K.push = { t: 0, dir: dir.normalize(), held: true, v0: b.vel.clone() }; note(S, 'push', null, 0, back ? '벽을 차고 뒤로' : side ? (side > 0 ? '왼쪽 위로 뛰기' : '오른쪽 위로 뛰기') : '위로 뛰기');
  }
  if (K.push) { if (!inp.jump) K.push.held = false; if ((K.push.t += dt) > CL.PUSH_T || !K.push.held) { const P = K.push; K.push = null; note(S, 'pushEnd', null, 0, '', { dv: +b.vel.clone().sub(P.v0).length().toFixed(2), vel: b.vel.toArray() }); } }
  if (held.length && planted.some(f => f.kind === 'smear')) { const c = V(); for (const h of held) c.add(h.goal); c.multiplyScalar(1 / held.length); const cur = K.ref.clone().sub(c).dot(nW); K.ref.addScaledVector(nW, clamp(CL.OUT_FEET - cur, -0.4 * dt, 0.4 * dt)); }
  // 균형 잡기(기준 자리를 받치는 발 위로):
  //   손으로 잡고 있을 때 = 발판 위의 발이 몸을 받치면 벽 쪽 깊이만 그 발 위로.
  //   손이 없을 때 = 좌우·깊이 모두. 발을 옮기려는 중이면 남는 발 위로, 몸 위로(W)를 누르면 높은 발 위로, 아니면 디딘 발들의 가운데로.
  { const ctr = f => V((f.patch.x0 + f.patch.x1) / 2, 0, (f.patch.z0 + f.patch.z1) / 2), topsAll = planted.filter(f => f.kind === 'top');
    if (held.length) { const tops = topsAll.filter(f => f.load > 0.1 && f.box.kind !== 'floor'); if (tops.length) { const c = V(); for (const f of tops) c.add(ctr(f)); c.multiplyScalar(1 / tops.length); const d = c.sub(K.ref).setY(0); K.ref.add(fwd.clone().multiplyScalar(d.dot(fwd)).clampLength(0, 0.3 * dt));
      // 몸 위로(W)를 누르고 있으면 가장 높이 디딘 발 쪽으로 엉덩이가 옆으로도 간다(높은 발 → 엉덩이를 그 위로 → 다리로 일어서기. 실제 영상 두 편에서 올라가는 일은 다리가 했다 — 품질 검토 12·13절). 임시 — 조작은 기획 결정 대기
      // p3d-0.8.4(GPT): 좌우(A/D)를 직접 누르고 있으면 자동으로 옮기지 않는다 — 직접 낸 의도가 먼저다
      if ((inp.cy || 0) > 0 && !(inp.cx || 0) && !(S.opt && S.opt.rockOver === false)) { const hi = tops.reduce((a, f) => (f.p.y > a.p.y ? f : a), tops[0]), dl = ctr(hi).sub(K.ref).setY(0).dot(left); K.ref.addScaledVector(left, clamp(dl, -0.35 * dt, 0.35 * dt)); } } }
    else if (topsAll.length) {
      const P = K.pendFoot, hi = topsAll.reduce((a, f) => (f.p.y > a.p.y ? f : a), topsAll[0]);
      const tgt = P && K.feet[P.stay].st === 'plant' ? ctr(K.feet[P.stay]) : (inp.cy || 0) > 0 && topsAll.length > 1 && hi.p.y > Math.min(...topsAll.map(f => f.p.y)) + 0.05 ? ctr(hi) : topsAll.reduce((a, f) => a.add(ctr(f)), V()).multiplyScalar(1 / topsAll.length);
      K.ref.add(tgt.sub(K.ref).setY(0).clampLength(0, 0.45 * dt));
      if (P) { const st = K.feet[P.stay], off = st.st === 'plant' ? Math.hypot(b.pos.x - clamp(b.pos.x, st.patch.x0, st.patch.x1), b.pos.z - clamp(b.pos.z, st.patch.z0, st.patch.z1)) : 0; if ((P.t += dt) > 0.6 || off < 0.012) { K.pendFoot = null; command(S, P.cmd); } }
    }
    if (held.length && K.pendFoot) { const P = K.pendFoot; K.pendFoot = null; command(S, P.cmd); } }
  // 접촉 기하와 힘 나누기
  // 원하는 힘: 보통은 기준 자리로 가는 힘(PD). 매달려 흔들릴 때는 위아래만(좌우·앞뒤는 흔들림에 맡긴다). 뛰는 동안에는 미는 쪽으로 PUSH_A
  const aDes = K.push ? K.push.dir.clone().multiplyScalar(CL.PUSH_A) : K.ref.clone().sub(b.pos).multiplyScalar(CL.KP).addScaledVector(b.vel, -CL.KD).clampLength(0, CL.ACC_MAX);
  if (hanging && !K.push) { aDes.x = 0; aDes.z = 0; }
  const T = torso(b, K), Fd = aDes.add(V(0, PHY.G, 0)).multiplyScalar(m), C = [], who = [], com = V(b.pos.x, b.pos.y + CL.COM_H, b.pos.z);
  for (const f of planted) {
    // 윗면을 디딘 발은 발바닥 범위 안에서 누르는 점을 옮길 수 있다(무게중심 아래에 가장 가까운 점)
    const hj = T.hj[f.i], cop = f.kind === 'top' ? V(clamp(com.x, f.patch.x0, f.patch.x1), f.p.y, clamp(com.z, f.patch.z0, f.patch.z1)) : f.p;
    C.push({ f0: f.F, n: f.n, mu: f.kind === 'top' ? CL.MU_TOP : CL.MU_WALL, w: hj.clone().sub(f.ank).normalize(), cap: CL.LEG_F * BW * clamp((CL.LEG - hj.distanceTo(f.ank)) / 0.03, 0, 1), perp: CL.LEG_PERP * BW, r: cop.clone().sub(com) }); who.push(f);
  }
  for (const h of held) { C.push({ arm: true, f0: h.F, u: h.goal.clone().sub(T.sh[h.i]).normalize(), cap: (K.push ? CL.ARM_BURST : CL.ARM_F) * BW, r: h.goal.clone().sub(com) }); who.push(h); }
  const Fs = solveForces(C, Fd, held.length ? 0 : CL.MOM), acc = V(0, -PHY.G, 0), v0 = b.vel.clone(), p0 = b.pos.clone();
  Fs.forEach((f, i) => { acc.addScaledVector(f, 1 / m); who[i].load = who[i].act = f.length() / BW; who[i].pas = 0; who[i].cap = C[i].cap / BW; who[i].F = f; if (!C[i].arm) who[i].ok = f.lengthSq() > 1; });
  // 흔들기: 손으로만 매달렸을 때 A/D는 벽과 나란한 쪽으로 몸을 미는 힘(엉덩이·다리를 차서 흔드는 것을 질점 몸에 옮긴 근사. 팔 길이 구속이 진자 운동으로 바꾼다)
  if (hanging && side && !K.push) acc.addScaledVector(left, side * CL.SWING_A);
  b.vel.addScaledVector(acc, dt); if (who.length && !K.push) b.vel.multiplyScalar(1 - (hanging ? CL.HANG_DAMP : CL.DAMP) * dt);
  b.pos.addScaledVector(b.vel, dt);
  // 곧게 편 팔은 줄처럼 버틴다(더 늘어나지 않는다). 이때 받은 충격을 손이 나눠 받는다. 몸통·머리는 벽·턱 속으로 들어가지 않는다(가장 얕은 쪽으로만 민다)
  const lim = []; let armDv = 0;
  for (let round = 0; round < 2; round++) {
    for (let it = 0; it < 4; it++) for (const h of held) {
      const d = h.goal.clone().sub(T.sh[h.i].clone().add(b.pos).sub(p0)), L = d.length();
      if (L <= CL.ARM) continue;
      const u = d.multiplyScalar(1 / L); b.pos.addScaledVector(u, L - CL.ARM); const vn = b.vel.dot(u); if (vn < 0) { b.vel.addScaledVector(u, -vn); armDv -= vn; }
      if (!lim.includes(h)) lim.push(h);
    }
    // 디딘 다리는 끝까지 접힌 것보다 더 접히지 않는다
    for (const f of planted) if (f.kind === 'top') { const hy = T.hj[f.i].y + b.pos.y - p0.y; if (hy - f.p.y < CL.LEG_MIN_H) { b.pos.y += CL.LEG_MIN_H - (hy - f.p.y); if (b.vel.y < 0) b.vel.y = 0; } }
    collide(S, torso(b, K));
  }
  for (let it = 0; it < 4; it++) for (const h of held) { const d = h.goal.clone().sub(T.sh[h.i].clone().add(b.pos).sub(p0)), L = d.length(); if (L > CL.ARM) b.pos.addScaledVector(d.multiplyScalar(1 / L), L - CL.ARM); }
  const shock = lim.length ? armDv / lim.length : 0;
  // 손의 하중 = 근육이 당기는 힘(act. 한계 cap 안) + 다 편 팔이 줄처럼 버티는 몫(pas. 뼈대가 받는 것이라 당기는 한계와 무관하다. 충격도 여기 든다)
  for (const h of lim) { h.pas = shock * m / dt / BW; h.load += h.pas; }
  K.T = torso(b, K);
  // 몸의 가속(걸러서 적어 둔다): 늘어뜨린 다리가 관성으로 뒤따르는 데 쓴다
  K.accS.lerp(b.vel.clone().sub(v0).multiplyScalar(1 / dt).clampLength(0, 25), 1 - Math.exp(-30 * dt));
  // 손: 당겨지는 방향이 턱이 버티는 범위를 벗어나거나 충격이 크면 미끄러진다
  for (const h of held) {
    const pull = K.T.sh[h.i].clone().sub(h.goal).normalize(), down = -pull.y, out = Math.max(0, pull.dot(h.n)), lat = pull.clone().addScaledVector(h.n, -pull.dot(h.n)).setY(0).length();
    const bad = h.load < CL.GRIP_MIN ? '' : down <= 0.05 ? '위로는 당길 수 없음(어깨가 턱보다 위)' : Math.hypot(out, lat) / down > Math.tan(CL.GRIP_ANG) ? '당기는 방향이 턱에서 벗어남' : '';
    h.bad = bad ? h.bad + dt : 0;
    // 잡은 채 몸이 움직여 팔이 제 몸을 지나가야 하는 자세가 되면(접힌 팔이 몸통에 걸림, 손이 등 뒤로 감) 그 손은 놓친다
    // 뛰어서 몸이 손을 지나 올라가면(팔이 다 접힌 채 위로 가는 중) 그 손은 놓인다(누르기로 바꾸는 동작 = 맨틀은 아직 없다)
    if (K.T.sh[h.i].distanceTo(h.goal) < CL.FOLD && b.vel.y > 0.3) { releaseHand(S, h.i, '몸이 손을 지나 올라가 놓음'); continue; }
    const jam = armCheck(S, h.i, K.T.sh[h.i], h.goal); h.jam = jam ? (h.jam || 0) + dt : 0;
    if (h.jam > 0.15) { releaseHand(S, h.i, `${jam} → 놓침`, 'slip'); continue; }
    if (lim.includes(h) && shock > CL.SHOCK_V) releaseHand(S, h.i, `충격이 커서 놓침(${shock.toFixed(1)}m/s)`, 'slip');
    else if (h.bad > CL.SLIP_T) releaseHand(S, h.i, bad, 'slip');
  }
  // 발: 다리가 닿는 범위를 벗어나면 떨어진다(끌려가지 않는다)
  const noHands = !K.hands.some(h => h.st === 'hold');
  for (const f of planted) {
    if (K.T.hj[f.i].distanceTo(f.ank) > DIM.leg) { liftFoot(S, f.i, '다리가 닿는 범위를 벗어남'); continue; }
    // 잡은 손이 없으면: 벽면에 댄 발은 버티지 못하고 바로 떨어진다(손이 받아 주던 미는 힘이 없다. 저절로 벽을 차지 않는다). 몸이 떨어지는 중인데 누르는 힘이 없는 발도 그 자리에 남지 않는다(윗면에 가만히 올려 둔 발은 그대로 둔다)
    f.idle = noHands && (f.kind === 'smear' || (f.load < 0.02 && b.vel.y < -0.4)) ? (f.idle || 0) + dt : 0;
    if (f.idle > CL.IDLE_T) liftFoot(S, f.i, f.kind === 'smear' ? '손 없이는 벽면의 발로 버틸 수 없음' : '누르는 힘이 없어 떨어짐');
  }
  // 손 없이 발로만 서 있을 때: 무게중심이 발바닥 범위에서 TOPPLE(10cm) 넘게 벗어나 그쪽으로 가고 있으면 균형을 잃은 것이다 → 발을 떼고 떨어진다(천천히 기울며 버티지 않는다)
  if (noHands) { const pl = K.feet.filter(f => f.st === 'plant' && f.kind === 'top'); if (pl.length) { let dmin = 9, away = 0; for (const f of pl) { const dx = b.pos.x - clamp(b.pos.x, f.patch.x0, f.patch.x1), dz = b.pos.z - clamp(b.pos.z, f.patch.z0, f.patch.z1), d = Math.hypot(dx, dz); if (d < dmin) { dmin = d; away = d > 1e-6 ? (b.vel.x * dx + b.vel.z * dz) / d : 0; } } if (dmin > CL.TOPPLE && away > 0.15) for (const f of pl) liftFoot(S, f.i, '균형을 잃음'); } }
  for (const x of [...K.hands, ...K.feet]) x.loadS = (x.loadS || 0) + ((x.st === 'hold' || x.st === 'plant' ? Math.min(x.load, 3) : 0) - (x.loadS || 0)) * (1 - Math.exp(-12 * dt));
  // 놓인 손은 어깨 아래의 쉬는 자리로 돌아간다(스프링. 전에는 그리는 쪽에서 한 걸음에 5%씩 당겨 처음에 너무 빨랐다 — 자세는 계산 걸음에서 정한다)
  // p3d-0.8.8 팔의 복귀(사용자 플레이 1차): 거부되거나 놓은 팔은 정해진 시간(거리에 따라 0.30~0.62초)에 걸쳐 천천히 떠나 천천히 닿고, 곧은 선이 아니라 몸 옆으로 도는 호를 그리며 내려온다.
  // 0.8.7까지는 반감기 0.11초의 스프링이었다: 놓는 걸음에 가속 100m/s²로 떠나 초속 5m까지 갔고(올라갈 때 3.2보다 빨라 팔을 떨어뜨리는 것처럼 보였다), 머리 위에서 곧게 내려와 손이 제 어깨를 지나갔다
  for (const H of K.hands) if (H.st === 'free') { H.relV = H.relV || V(); const goal = V((H.i ? -1 : 1) * 0.08, -0.5, 0.1).applyAxisAngle(UP, b.yaw);
    if (H.ret && !globalThis.OLDHAND) { const R = H.ret, D = R.from.distanceTo(goal), Tt = clamp(CL.RET_T0 + CL.RET_K * D, CL.RET_T0, CL.RET_T1), k = mj(clamp((R.t += dt) / Tt, 0, 1));
      const u0 = R.from.clone().normalize(), u1 = goal.clone().normalize(), L0 = R.from.length(), L1 = goal.length(), ang = u0.angleTo(u1), side = left.clone().multiplyScalar((H.i ? -1 : 1) * 0.8).addScaledVector(fwd, 0.3).add(V(0, -0.3, 0)).normalize();
      const mid = u0.clone().add(u1); if (mid.lengthSq() < 1e-6) mid.copy(side); mid.normalize().lerp(side, clamp(ang / 2.6, 0, 1)).normalize();
      const dir = u0.clone().lerp(mid, k).lerp(mid.clone().lerp(u1, k), k).normalize(), prev = H.rel.clone();
      H.rel.copy(dir).multiplyScalar(lerp(L0, L1, k) * (1 - 0.50 * Math.sin(Math.PI * k) * clamp(ang / 2, 0, 1))); H.relV.copy(H.rel).sub(prev).multiplyScalar(1 / dt); if (R.t >= Tt) H.ret = null; }
    else springV(H.rel, H.relV, goal, 0.11, dt); }
  else { H.ret = null; if (H.relV) H.relV.set(0, 0, 0); }
  limbsStep(S, dt);
  if (S.opt && S.opt.footAssist) assistFeet(S, dt);
  if (S.opt && S.opt.wallRest) restFeet(S, dt);
  // 기준 자리는 실제 자리에서 멀어지지 않는다(버티지 못해 처지면 따라 내려간다)
  const e = K.ref.clone().sub(b.pos); if (e.length() > CL.REF_LAG) K.ref.copy(b.pos).addScaledVector(e.normalize(), CL.REF_LAG);
  // 누르는 방향이 없으면 기준 자리는 실제 자리로 천천히 돌아온다(닿지 못한 목표를 향해 계속 힘을 주고 있지 않게. 그 자리에서 버티는 힘은 그대로다)
  if (!(inp.cx || inp.cy)) K.ref.lerp(b.pos, 1 - Math.exp(-1.5 * dt));
  { const dv = b.vel.distanceTo(v0); if (dv > K.stats.dvMax) { K.stats.dvMax = dv; K.stats.dvAt = K.tick; } }
  // 나가기: 잡은 손이 없고 ① 디딘 발도 없으면 떨어진다 ② 두 발이 모두 몸 아래의 걸을 수 있는 면에 있으면 지상으로
  if (!K.hands.some(h => h.st === 'hold')) {
    // ① 디딘 발이 모두 몸 아래의 같은 면에 있고 그 발이 몸을 받치면 그 면에 선 것으로 지상에 넘긴다 ② 디딘 발이 없으면 떨어진다(이미 바닥에 주저앉은 높이면 그 면에 선 것으로)
    const pl = K.feet.filter(f => f.st === 'plant'), g = pl.length ? groundAt(W, b.pos.x, b.pos.z, pl[0].p.y + 0.01, 0, 0) : groundAt(W, b.pos.x, b.pos.z, b.pos.y + DIM.hipY - 0.2, 0, 0);
    if (K.feet.some(f => f.st === 'move') || K.pendFoot) return;
    if (pl.length) { if (g.box && pl.every(f => f.box === g.box) && pl.some(f => f.load > 0.2) && b.vel.length() < 0.5) exit(S, true, g); }
    else {
      // 빠르게 내려오는 중이면 "선 것"으로 넘기지 않는다. 지상 쪽이 그 속도로 착지시킨다(착지 동작과 발 디딤이 그쪽에서 일어난다)
      // 벽 문맥의 몸 자리(엉덩이 − 선 키)는 웅크려 매달리면 바닥보다 낮을 수 있다. 그 채로 지상에 넘기면 바닥을 찾지 못해 끝없이 떨어진다(p3d-0.8.1에서 찾음: 위로 튕긴 걸음에 손을 놓칠 때) → 넘기기 전에 바닥 위로 올린다
      if (g.box && b.pos.y < g.y + 1e-4) b.pos.y = g.y + 1e-4;
      const low = !!g.box && b.pos.y <= g.y + 0.01 && b.vel.y <= 0, slow = b.vel.length() < 0.5;
      if (low && !slow) b.pos.y = g.y + 1e-4;
      exit(S, low && slow, g);
    }
  }
}

// ── 발 보조(간편 조작): 손으로 잡고 있는 동안, 놓여 있는 발을 가까운 발판 윗면으로 보낸다 ──
// 하는 것: 지금 몸 가까이의 실제 윗면에서 후보를 고르고, 직접 보낼 때와 같은 명령·같은 이동·같은 판정을 거친다. 한 번에 한 발씩.
// 하지 않는 것: 벽면에 발을 붙이기, 다음 경로 미리 찾기, 순간이동, 손이 없을 때 구하기, 디디고 있는 발을 더 나은 자리로 자꾸 옮기기(뗀 발만 보낸다).
function assistFeet(S, dt) {
  const K = S.climb, b = S.body, held = K.hands.filter(h => h.st === 'hold');
  K.assistT = Math.max(0, (K.assistT || 0) - dt);
  if (!held.length || K.assistT > 0 || K.feet.some(f => f.st === 'move') || b.vel.length() > 0.8) return;
  const fwd = V(Math.sin(b.yaw), 0, Math.cos(b.yaw));
  for (const F of K.feet) {
    if (F.st !== 'free' || F.cool > 0 || F.userOff) continue;
    const hj = K.T.hj[F.i], other = K.feet[1 - F.i]; let best = null;
    for (const x of S.world.boxes) {
      // 손으로 잡은 턱에는 발을 올리지 않는다(2D에서 정한 원칙). 고관절에서 38~82cm 아래의 윗면만 본다
      if (x.kind === 'floor' || held.some(h => h.edge && h.edge.box === x)) continue;
      const drop = hj.y - x.max.y; if (drop < 0.38 || drop > 0.82) continue;
      const p = V(clamp(hj.x + fwd.x * 0.10, x.min.x + 0.04, x.max.x - 0.04), x.max.y, clamp(hj.z + fwd.z * 0.10, x.min.z + 0.02, x.max.z - 0.03)), h = Math.hypot(p.x - hj.x, p.z - hj.z);
      if (h > 0.40 || (other.st !== 'free' && p.distanceTo(other.p) < 0.14)) continue;
      if (K.assistBad && K.tick - K.assistBad.k < 240 && p.distanceTo(K.assistBad.p) < 0.10) continue;
      const score = h + Math.abs(drop - 0.60) * 0.5;
      if ((!best || score < best.score) && probeFoot(S, F.i, p).ok) best = { p, score };
    }
    if (best) { command(S, { type: 'foot', i: F.i, p: best.p.toArray(), auto: true }); K.assistT = CL.ASSIST_T; return; }
  }
}

// ── 벽 딛기(p3d-0.8.0, 임시·옵션): 손으로 매달려 있고 놓인 발이 있으면 그 발을 앞의 벽면에 댄다 ──
// 사람은 두 손으로 매달리면 발로 벽을 디디고 무릎을 접어 윗몸을 벽에서 뺀다(품질 검토 11절: 캡처 비교). 우리 몸은 발을 늘어뜨린 판자였다.
// 하는 것: 고관절 앞·아래의 벽면을 찾아 직접 보낼 때와 같은 명령·같은 판정으로 보낸다(한 번에 한 발). 발은 누르기만 한다 — 손이 당겨 주는 동안만 버틴다.
// 하지 않는 것: 발 자리(턱·발판)를 대신 고르기(그것은 사용자나 발 보조의 일), 직접 뗀 발을 다시 대기, 흔드는 중·뛰는 중·빠르게 움직이는 중에 대기.
function restFeet(S, dt) {
  const K = S.climb, b = S.body, held = K.hands.filter(h => h.st === 'hold');
  K.restT = held.length && !K.push && !K.sideIn && b.vel.length() < 0.6 && !K.feet.some(f => f.st === 'move') ? (K.restT || 0) + dt : 0;
  if (K.restT < 0.35) return;
  const fwd = V(Math.sin(b.yaw), 0, Math.cos(b.yaw)), left = V(Math.cos(b.yaw), 0, -Math.sin(b.yaw));
  for (const F of K.feet) {
    if (F.st !== 'free' || F.cool > 0 || F.userOff) continue;
    const o = K.T.hj[F.i].clone().add(V(0, -0.40, 0)).addScaledVector(left, (F.i ? -1 : 1) * 0.20), t = rayHit(S.world, o, o.clone().addScaledVector(fwd, 0.75));
    if (t >= 1) continue;
    const p = o.addScaledVector(fwd, 0.75 * t), g = resolveFoot(S.world, p, b.yaw);
    if (!g || g.kind !== 'smear' || held.some(h => h.edge && h.edge.box === g.box) || !probeFoot(S, F.i, p).ok) continue;
    command(S, { type: 'foot', i: F.i, p: p.toArray(), auto: true }); K.restT = 0.15; return;
  }
}

// ── 자세: 몸통의 틀 + 손발 IK(잡은 자리·디딘 자리는 그대로, 어깨·고관절에서 풀어 맞춘다) ──
// 뼈 방향은 그대로 맞추되 비틀림(뼈의 길이 축 둘레)은 앞 걸음에서 이어 간다: 앞 걸음의 회전을 가장 적게 돌려 새 방향에 맞추고, 원하는 비틀림 쪽으로는 정해진 빠르기(rate, rad/s)로만 다가간다.
// 전에는 기준 방향(hint)이 뼈와 거의 나란해지는 자세에서 비틀림이 한 걸음에 180° 뒤집혔다(p3d-0.7.0 품질 검토 3절). S.pw = 앞 걸음의 확정된 자세(뼈의 세계 회전)
// lim(rad/s)을 주면 뼈 전체의 회전도 그 빠르기로만 바뀐다(붙어 있지 않은 팔다리에만 쓴다. 붙은 손발은 자리가 정확해야 하므로 쓰지 않는다)
function aimCont(S, bone, dir, hint, rate = 8, lim = 0) {
  aimBone(bone, dir, hint, 'down');
  const pw = S.pw && S.pw[bone.name]; if (!pw) return;
  const qT = bone.getWorldQuaternion(Q()), yN = V(0, 1, 0).applyQuaternion(qT), yP = V(0, 1, 0).applyQuaternion(pw);
  const qC = Q().setFromUnitVectors(yP, yN).multiply(pw), zC = V(0, 0, 1).applyQuaternion(qC), zT = V(0, 0, 1).applyQuaternion(qT);
  const phi = Math.atan2(zC.clone().cross(zT).dot(yN), zC.dot(zT));
  const q = Q().setFromAxisAngle(yN, clamp(phi, -rate * PHY.DT, rate * PHY.DT)).multiply(qC);
  setWorldQuat(bone, lim ? pw.clone().rotateTowards(q, lim * PHY.DT) : q);
}
// 굽는 쪽: 고른 극 방향 쪽으로 정해진 빠르기(rate)로만 돌고(후보가 바뀌는 걸음에 튀지 않게), 팔다리 축에 수직인 몫만 쓴다.
// 극 방향이 축과 거의 나란한 자세(내려뜨린 팔, 앞으로 든 허벅지)에서는 수직 몫이 작아 걸음마다 뒤집힌다 → 그만큼 앞 걸음의 굽는 쪽을 이어 쓴다. 판정(armCheck·legCheck)은 고른 후보 그대로 본다
function bendDir(S, key, a, t, want, rate = 7, snap = false, soft = false) {
  const PS = S.poleS || (S.poleS = {}), live = !!S.pw && !snap, pole = live && PS[key + 'p'] ? PS[key + 'p'] : (PS[key + 'p'] = want.clone());
  { const ang = pole.angleTo(want); if (ang > 1e-4) pole.lerp(want, Math.min(1, rate * PHY.DT / ang)).normalize(); }
  const u = t.clone().sub(a).normalize(), p = pole.clone().addScaledVector(u, -pole.dot(u)), L = p.length(), prev = live && PS[key];
  let q = null;
  if (prev) { q = prev.clone().addScaledVector(u, -prev.dot(u)); if (q.lengthSq() > 1e-6) { q.normalize(); const k = clamp(L / 0.35, 0, 1); p.multiplyScalar(k / Math.max(L, 1e-6)).addScaledVector(q, 1 - k); } else q = null; }
  if (p.lengthSq() < 1e-8) p.set(0, 0, 1).addScaledVector(u, -u.z);
  p.normalize();
  // soft(팔, p3d-0.8.2): 굽는 쪽이 실제로 도는 각도에도 한계를 둔다. 극 방향이 조금만 바뀌어도, 축과 비스듬할 때는 수직 몫이 한 걸음에 30° 넘게 돈다(잡은 손을 떼어 보내는 걸음에 팔이 튀었다).
  // 도는 빠르기는 rate의 1.5배까지, 그 빠르기도 SWIVEL_ACC로만 오르고, 다 와 갈수록 남은 각도의 1/4씩만 간다(멈출 때도 튀지 않게)
  if (soft) { let w = 0; if (q) { const ang = q.angleTo(p), step = Math.min(ang * 0.25, Math.min(rate * 1.5, (PS[key + 'w'] || 0) + CL.SWIVEL_ACC * PHY.DT) * PHY.DT); if (ang > 1e-5) { const ax = q.clone().cross(p); if (ax.lengthSq() < 1e-10) ax.copy(u); p.copy(q).applyAxisAngle(ax.normalize(), step); w = step / PHY.DT; } } PS[key + 'w'] = w; }
  PS[key] = p.clone();
  return p;
}
// 굽는 쪽의 출발값을 지금 자세에서 읽어 둔다(지상 자세에서 벽 자세로 넘어갈 때 무릎·팔꿈치가 지금 방향에서 이어 돌게)
function seedBend(S, key, a, mid, end) {
  const B = S.rig.bones, pa = worldPos(B[a]), u = worldPos(B[end]).sub(pa).normalize(), d = worldPos(B[mid]).sub(pa), p = d.addScaledVector(u, -d.dot(u));
  if (p.lengthSq() < 1e-6) return;
  const PS = S.poleS || (S.poleS = {}); PS[key] = p.normalize().clone(); PS[key + 'p'] = p.clone();
}
// 원하는 세계 회전 쪽으로 정해진 빠르기로만 돈다(놓인 발의 방향처럼 규칙이 바뀌는 걸음에 튀지 않게)
function turnCont(S, bone, qT, rate = 10) { const pw = S.pw && S.pw[bone.name]; setWorldQuat(bone, pw ? pw.clone().rotateTowards(qT, rate * PHY.DT) : qT); }
// 뻗는 팔의 굽는 쪽과 팔꿈치 자리(p3d-0.8.2). 그림(poseArm)과 물리의 팔 캡슐 검사(limbsStep)가 같은 계산을 쓴다:
// 캡슐이 겹치지 않는 후보를 고르고(armIK full), 그쪽으로 정해진 빠르기(7rad/s)로 돌되 지금 굽는 쪽이 지형에 겹치면 더 빨리(23rad/s) 돌린다
function reachArm(S, s, sh, target, yaw, sx, qC, want = null, tb = null) {
  // p3d-0.8.5: 후보를 고를 때와 도는 길을 볼 때 제 몸(머리·몸통)도 함께 본다(at). 손을 멈추거나 빼내는 데 쓰는 겹침(hit)은 전처럼 지형의 것이고, 제 몸의 겹침은 따로(self) 돌려준다
  const B = selfShapes(S, s === 'L' ? 0 : 1), wp = want || pickPole(S, sh, target, yaw, sx, qC, tb, B).pole, prev = S.pw && S.poleS && S.poleS['el' + s];
  const at = pl => { const ik2 = twoBone(sh, target, DIM.upperArm, DIM.foreArm, pl), th = armHit(S.world, sh, ik2, tb), sf = armSelf(B, ik2, sh), ds = Math.max(sd(sf, 'body'), sd(sf, 'arm')); return th && th.d >= ds ? th : ds > 0 ? { d: ds } : null; }, hit0 = prev ? at(prev) : null;
  // 도는 길: 팔꿈치는 어깨–손목 축 둘레를 돈다. 가까운 쪽으로 돌면 벽·턱 속을 지나고 먼 쪽은 비어 있으면 먼 쪽으로 돈다(가까운 쪽으로만 돌면 팔꿈치가 벽 안 10cm를 지나갔다)
  let go = wp, far = false;
  if (prev) { const u = target.clone().sub(sh).normalize(), q = prev.clone().addScaledVector(u, -prev.dot(u)), pT = wp.clone().addScaledVector(u, -wp.dot(u));
    if (q.lengthSq() > 1e-6 && pT.lengthSq() > 1e-6) { q.normalize(); pT.normalize(); const ang = q.angleTo(pT), ax = q.clone().cross(pT);
      if (ang > 0.35 && ax.lengthSq() > 1e-8) { ax.normalize(); const arc = (sg, tot) => { let d = 0; for (let a = 0.2; a < tot; a += 0.2) { const h = at(q.clone().applyAxisAngle(ax, sg * a)); if (h) d = Math.max(d, h.d); } return d; }, dS = arc(1, ang);
        if (dS > 0.004 && arc(-1, 2 * Math.PI - ang) < dS) { go = q.clone().applyAxisAngle(ax, -1.2); far = true; } } } }
  const pole = bendDir(S, 'el' + s, sh, target, go, hit0 || want || far ? 23 : 7, false, true), ik = twoBone(sh, target, DIM.upperArm, DIM.foreArm, pole);
  return { pole, ik, hit: armHit(S.world, sh, ik, tb), self: armSelf(B, ik, sh), want: wp };
}
// 시험·진단용(test/self_diag.mjs): 게임 코드에서는 쓰지 않는다
export const _dbg = { armHit: (...a) => armHit(...a), armIK: (...a) => armIK(...a), armSelf: (...a) => armSelf(...a), selfHits: (...a) => selfHits(...a), ARM_SQ, selfShapes: (...a) => selfShapes(...a), heldPole: (...a) => heldPole(...a) };
// 굽는 쪽의 상태를 바꾸지 않고 계산만 해 본다(물리 쪽 검사용. 상태는 그림을 확정할 때만 나아간다)
function dryBend(S, key, f) { const PS = S.poleS || (S.poleS = {}), a = PS[key] ? PS[key].clone() : null, b = PS[key + 'p'] ? PS[key + 'p'].clone() : null, w = PS[key + 'w'], r = f(); if (a) PS[key] = a; else delete PS[key]; if (b) PS[key + 'p'] = b; else delete PS[key + 'p']; PS[key + 'w'] = w; return r; }
function poseArm(S, s, sh, target, yaw, sx, grip, held = !!grip, anchor = null, reach = false, tb = null) {
  const B = S.rig.bones, free = !(held || grip), qC = S.climb.on && S.climb.T ? S.climb.T.qC : null, A0 = reach ? null : held ? heldPole(S, s, sh, target, yaw, sx, qC) : armIK(S.world, sh, target, yaw, sx, qC);
  // 팔꿈치 방향은 고른 후보 쪽으로 정해진 빠르기(7rad/s)로만 돈다. 후보가 바뀌는 걸음(팔꿈치가 턱에 닿아 다른 쪽으로 돌릴 때, 벽 문맥을 드나들 때)에 팔꿈치가 한 걸음에 튀지 않게 한다. 판정(armCheck)은 그대로 고른 후보로 본다
  const R = reach ? reachArm(S, s, sh, target, yaw, sx, qC, reach.isVector3 ? reach : null, tb) : null, pole = R ? R.pole : bendDir(S, 'el' + s, sh, target, A0.pole, 7, false, true), ik = R ? R.ik : twoBone(sh, target, DIM.upperArm, DIM.foreArm, pole), lim = free && !reach ? 14 : 0;
  // lim(회전 빠르기 누르기)은 놓인 팔만. 뻗는 손의 자리는 물리 상태(H.w)라 그림이 늦게 따라가면 그림의 손·팔뚝이 벽 속을 지나간다(0.8.0~0.8.1: 겨누는 곳을 바꾸는 순간 그림의 손목이 벽 안 7~10cm)
  const hint = pole.clone().negate();
  aimCont(S, B[`upperArm.${s}`], ik.mid.clone().sub(sh), hint, 8, lim); aimCont(S, B[`foreArm.${s}`], ik.end.clone().sub(ik.mid), hint, 8, lim);
  // 손의 방향: 잡았으면 턱 쪽(정확히). 뻗는 중에는 가까워질수록(40cm 안) 팔뚝 방향에서 턱 쪽으로 미리 돌려 둔다(잡는 걸음에 손이 꺾이지 않게). 놓인 손은 팔뚝을 따라가되 천천히 돈다
  const fa = ik.end.clone().sub(ik.mid).normalize(), near = grip && !held ? clamp(1 - ik.end.distanceTo(anchor || grip) / 0.40, 0, 1) : 1;
  const hd = grip ? fa.clone().lerp(grip.clone().sub(held || !anchor ? ik.end : anchor).normalize(), near).normalize() : fa;
  aimCont(S, B[`hand.${s}`], hd, hint, 8, held ? 0 : 22);
  return ik;
}
export function poseClimb(S) {
  const K = S.climb, b = S.body, B = S.rig.bones, T = K.T || torso(b, K), root = S.rig.root;
  root.position.set(b.pos.x, 0, b.pos.z); root.rotation.set(0, 0, 0); root.updateMatrixWorld(true);
  B.hips.position.set(T.hip.x - b.pos.x, T.hip.y, T.hip.z - b.pos.z); B.hips.quaternion.copy(T.tq.hips);
  for (const n of TORSO.slice(1)) B[n].quaternion.copy(T.tq[n]);
  B.hips.updateMatrixWorld(true);
  for (const H of K.hands) { const sx = H.i ? -1 : 1, tgt = H.st === 'hold' ? H.goal : H.st === 'reach' ? H.w : H.w.copy(T.sh[H.i]).add(H.rel); poseArm(S, H.s, T.sh[H.i], tgt, b.yaw, sx, H.st === 'hold' || (H.st === 'reach' && H.edge) ? H.grip : null, H.st === 'hold', H.goal, H.st === 'reach' && (H.poleWant || true), H.st === 'reach' && H.edge ? H.edge.box : null); }
  for (const F of K.feet) {
    const hj = T.hj[F.i], tgt = F.st === 'plant' ? F.ank : F.a, want = legIK(S, hj, tgt, b.yaw, F.i ? -1 : 1, F.st !== 'free').pole;
    let pole = bendDir(S, 'kn' + F.s, hj, tgt, want), ik = twoBone(hj, tgt, DIM.thigh, DIM.shin, pole), lim = F.st === 'plant' ? 0 : 14;
    // 무릎이 벽·턱에 닿았으면(2cm 안) 고른 쪽으로 더 빨리 돌려 빼낸다(천천히 돌리는 동안 벽 안에 남지 않게)
    if (nearBox(S.world, ik.mid, 0.02)) { pole = bendDir(S, 'kn' + F.s, hj, tgt, want, 26); ik = twoBone(hj, tgt, DIM.thigh, DIM.shin, pole); lim = lim && 30; }
    aimCont(S, B[`upLeg.${F.s}`], ik.mid.clone().sub(hj), pole, 8, lim); aimCont(S, B[`leg.${F.s}`], ik.end.clone().sub(ik.mid), pole, 8, lim);
    if (F.st === 'plant') setWorldQuat(B[`foot.${F.s}`], F.q); else turnCont(S, B[`foot.${F.s}`], F.st === 'free' ? Q().setFromAxisAngle(UP, b.yaw).multiply(Q().setFromAxisAngle(X, 0.35 * clamp((F.clear ?? 9) / 0.15, 0, 1))) : F.q);
    B[`toe.${F.s}`].quaternion.identity();
  }
}
// 지상 문맥에서 손을 보내는 중: 지상 자세 위에 그 팔만 IK로 덮는다. 거부된 뒤에는 천천히 지상 자세로 돌아간다
export function groundHands(S, dt) {
  const K = S.climb, B = S.rig.bones, yaw = S.body.yaw;
  limbsStep(S, dt);
  for (const H of K.hands) {
    if (H.st === 'free') { H.ov = Math.max(0, H.ov - dt / CL.BLEND_T); if (H.ov <= 0) continue; }
    const sh = worldPos(B[`upperArm.${H.s}`]), names = [`upperArm.${H.s}`, `foreArm.${H.s}`, `hand.${H.s}`], q0 = names.map(n => B[n].quaternion.clone());
    poseArm(S, H.s, sh, H.st === 'free' ? sh.clone().add(H.rel) : H.st === 'hold' ? H.goal : H.w, yaw, H.i ? -1 : 1, H.st === 'hold' || (H.st === 'reach' && H.edge) ? H.grip : null, H.st === 'hold', H.goal, H.st === 'reach' && (H.poleWant || true), H.st === 'reach' && H.edge ? H.edge.box : null);
    if (H.st === 'free') names.forEach((n, k) => { B[n].quaternion.copy(q0[k].slerp(B[n].quaternion, mj(H.ov))); B[n].updateMatrixWorld(true); });
  }
}
// 벽에서 나온 뒤: 나오던 순간의 자세에서 지상 자세로 짧게 이어 준다
export function outBlend(S, dt) {
  const K = S.climb, O = K.out, B = S.rig.bones; if (!O) return;
  if (!O.rel) O.rel = O.hipW.clone().sub(S.body.pos);
  // 팔은 더 천천히(0.5초) 지상 자세로 넘어간다: 손을 놓자마자 팔이 내려오지 않고 잠깐 위에 남는다(캡처 비교 11절)
  O.t += dt; const k = mj(clamp(O.t / CL.BLEND_T, 0, 1)), kA = mj(clamp(O.t / 0.5, 0, 1)), hipG = worldPos(B.hips).sub(S.body.pos), hip = O.rel.clone().lerp(hipG, k).add(S.body.pos);
  B.hips.position.set(hip.x - S.rig.root.position.x, hip.y, hip.z - S.rig.root.position.z);
  S.rig.list.forEach((x, i) => { x.quaternion.copy(O.q[i].clone().slerp(x.quaternion, /Arm|hand|shoulder/.test(x.name) ? kA : k)); });
  B.hips.updateMatrixWorld(true);
  if (O.t >= 0.5) K.out = null;
}
// 지상 자세의 윗몸이 벽·턱 속으로 들어가지 않게 한다(p3d-0.8.0): 벽 바로 앞에 내려서 웅크리면 앞으로 숙인 가슴·머리가 벽을 뚫었다(벽에서 놓고 떨어질 때마다).
// 머리·가슴이 들어간 만큼 척추를 뒤로 세운다(가장 얕은 수평 방향으로). 세우는 각도는 정해진 빠르기로만 바뀐다(튀지 않게). 몸의 자리·속도·접촉은 건드리지 않는다(자세만)
export function torsoClear(S, dt) {
  const B = S.rig.bones, st = S.tc || (S.tc = { a: 0, ax: V(1, 0, 0) }), hip = worldPos(B.hips); let want = 0, dir = null;
  for (const n of ['head', 'chest']) {
    const p = worldPos(B[n]), r = 0.12; if (n === 'head') p.y += 0.08;
    for (const x of S.world.boxes) {
      if (x.kind === 'floor' || p.y < x.min.y - r || p.y > x.max.y + r) continue;
      const e = [[p.x - x.min.x + r, -1, 0], [x.max.x + r - p.x, 1, 0], [p.z - x.min.z + r, 0, -1], [x.max.z + r - p.z, 0, 1]]; if (e.some(v => v[0] <= 0)) continue;
      const o = e.sort((u, v) => u[0] - v[0])[0], ang = Math.asin(Math.min(0.9, o[0] / Math.max(0.25, p.distanceTo(hip))));
      if (ang > want) { want = ang; dir = V(o[1], 0, o[2]); }
    }
  }
  if (dir) st.ax.copy(UP).cross(dir).normalize();
  st.a += clamp(want - st.a, -5 * dt, 5 * dt);
  if (st.a > 1e-3) setWorldQuat(B.spine, Q().setFromAxisAngle(st.ax, st.a).multiply(B.spine.getWorldQuaternion(Q())));
}
// 자세가 확정된 뒤: 놓여 있는 손발의 지금 자리를 적어 두고(다음 명령의 출발점), 접촉 오차와 관통을 잰다
export function afterPose(S) {
  const K = S.climb, B = S.rig.bones, st = K.stats;
  // 이 걸음의 확정된 자세를 적어 둔다(다음 걸음의 비틀림 잇기가 읽는다)
  S.pw = S.pw || {}; for (const x of S.rig.list) x.getWorldQuaternion(S.pw[x.name] || (S.pw[x.name] = Q()));
  for (const H of K.hands) { const w = worldPos(B[`hand.${H.s}`]); if (H.st === 'hold') st.palmErr = Math.max(st.palmErr, B[`hand.${H.s}`].localToWorld(V(0, -CL.PALM, 0)).distanceTo(H.grip)); else if (H.st === 'free' && !K.on) H.w.copy(w); }
  for (const F of K.feet) { if (F.st === 'plant') st.footErr = Math.max(st.footErr, worldPos(B[`toe.${F.s}`]).distanceTo(F.ball)); else if (!K.on) F.a.copy(worldPos(B[`foot.${F.s}`])); }
  for (const H of K.hands) if (H.st === 'hold') { const sh = worldPos(B[`upperArm.${H.s}`]), c = armCheck(S, H.i, sh, H.goal); if (c && c !== '어깨가 돌아가지 않는 방향(등 뒤)') { st.selfPen++; st.penWhat = `${c} @${K.tick}`; } }
  if (K.on) for (const n of ['hand.L', 'hand.R', 'foreArm.L', 'foreArm.R', 'leg.L', 'leg.R', 'foot.L', 'foot.R', 'toe.L', 'toe.R', 'chest', 'head', 'hips']) { const p = worldPos(B[n]), x = S.world.boxes.find(x => p.x > x.min.x + 0.01 && p.x < x.max.x - 0.01 && p.y > x.min.y + 0.01 && p.y < x.max.y - 0.01 && p.z > x.min.z + 0.01 && p.z < x.max.z - 0.01); if (x) { if (K.tick === K.enterTick) { st.penEnter = (st.penEnter || 0) + 1; st.penEnterWhat = `${n} → ${x.name}`; } else { st.pen++; st.penWhat = `${n} → ${x.name} @${K.tick}`; } } }
}
export const limbState = K => ({
  on: K.on,
  hands: K.hands.map(h => ({ s: h.s, st: h.st, armBlock: h.st === 'reach' && (h.blockT || 0) > 0.12, selfBlock: h.st === 'reach' && (h.selfBlock || 0) > 0.12, armCross: h.st === 'reach' && (h.armCross || 0) > 0.12, swivel: h.st === 'reach' && !!h.swivel, up: h.st === 'reach' && h.up ? { d: h.up.d, n: h.up.n.toArray() } : null, load: h.load, act: h.act || 0, pas: h.pas || 0, loadS: h.loadS || 0, cap: h.cap || 0, why: h.why, grip: h.st === 'free' ? null : h.grip.toArray(), w: h.w.toArray(), box: h.st !== 'free' && h.edge ? h.edge.box.name : '' })),
  feet: K.feet.map(f => ({ s: f.s, st: f.st, load: f.load, loadS: f.loadS || 0, cap: f.cap || 0, ok: f.ok, kind: f.kind, auto: f.auto, why: f.why, p: f.st === 'free' ? null : f.p.toArray(), box: f.st !== 'free' && f.box ? f.box.name : '' })),
});
