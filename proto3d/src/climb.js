// 벽 접촉(W2 첫 판): 손을 보내 잡기 · 발 디디기 · 놓기. 접근 A(직접 만든 제어 + 상자 지형 조회).
// 원칙: 손발 자리는 물리가 정한다. 애니메이션으로 닿지 않는 곳을 성공시키지 않는다. 손을 놓아도 몸의 속도는 그대로 이어진다.
// 몸 = 질점 하나(속도·중력) + 팔다리 힘. 팔은 당기기만(곧게 펴지면 줄처럼 버틴다), 다리는 밀기만(마찰 범위 안에서만). 발은 벽에 붙지 않는다.
// 숫자(힘·마찰·각도·시간)는 모두 첫 판의 임시값이다. 캡처 통계는 편한 기본 자세에만 쓰고 허용 판정에는 쓰지 않는다.
import * as THREE from 'three';
import { DIM, headEll } from './rig.js';
import { groundAt, pushOut, rayHit } from './world.js';
import { PHY } from './controller.js';
import { aimBone, setWorldQuat, twoBone, worldPos } from './ik.js';
import { featOf, lookup } from './refpose.js';
import { fk as fbFK, makeFB, stepFB, solveStep as fbSolve, FBI, FBW, fbHeldPen, fbFollow } from './fbik.js';
import { legExcess, kneeExcess, clampKnee, legMin, armExcess, clampElbow, fitPole, fitPoleLow } from './anat.js';

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
  ARM: (DIM.upperArm + DIM.foreArm) * 0.995, PALM: DIM.palm, LEG: DIM.leg * 0.999, LEG_MIN_H: 0.30,
  SNAP: 0.14, CATCH: 0.004, TRY_T: 0.30,
  // p3d-0.11.4 잡기 보정(사용자 결정 2026-11-23: "너무 심한 거리가 아니면, 반동을 주거나 했을 때 닿을 수 있어 보이는 거리는 보정해서 잡게 해 달라. 대신 어색하면 안 되고, 필요하면 다른 손발을 놓게"):
  //   팔을 다 뻗어도 ASSIST_S 안으로 모자라면 잡고, 몸이 손 쪽으로 ASSIST_V로 끌려가며 그 거리를 메운다(잡은 팔의 길이 한계에 여유 H.slack을 두었다가 줄인다).
  //   어깨가 목표 쪽으로 움직이는 중이면(반동·점프) 그 빠르기 1m/s당 ASSIST_D만큼 더 허용한다(ASSIST_MAX까지). 끌려가는 동안 다른 손이 버티지 못하면 그 손을 놓는다. 발은 다리가 닿는 범위를 벗어나면 떨어진다(원래 규칙). 실험값
  GRIP_BAD_CAP: 0.10, // p3d-0.11.4: 당기는 방향이 턱이 버티는 범위 밖인 손이 당기는 힘의 한계(몸무게 배수, GRIP_MIN 0.15보다 작게)
  ASSIST_S: 0.08, ASSIST_D: 0.10, ASSIST_MAX: 0.28, ASSIST_V: 1.2,
  ASSIST_BURST1: 1.3, PALM_DOWN: 0.6, CROSS_A0: 0, CROSS_KW: 4, CROSS_RATE: 2.5, SMEAR_IDLE_T: 1.2, HELD_SLOW: 1.2, TIPTOE_MAX: 0.35, HELD_SLOW_BEND: 0.08, PLANT_HV: 1.0, PLANT_HV_T: 0.3, REACH_POLE_W: 9, LEGX_CLR: 0.01, PALM_TW: 120 * Math.PI / 180, // 잡기 보정: 한 손만 잡고 뛸 때 그 팔의 순간 힘(몸무게 배. 기본 ARM_BURST 0.85). 두 손 점프는 그대로
  NEW_T: 1.0, ASSIST_GRIP_ANG: 72 * Math.PI / 180, ASSIST_SHOCK_V: 2.4, // 잡기 보정: 막 잡은 손으로 보는 시간(초)
  ASSIST_WRIST: 15, // 잡기 보정이 켜져 있으면 손목 한계(wristMax 70°)를 이만큼 더 허용한다(비스듬히 잡을 때 아래팔을 돌려 손을 옆으로 세워 잡는 몫. 그림은 70°에서 멈춘다)
  HAND_V: 3.2, HAND_ACC: 30, HAND_V_DYN: 5.5, HAND_ACC_DYN: 60, STAND_SH: 1.42, HAND_T0: 0.22, HAND_T1: 0.60, FOOT_V: 1.1, FOOT_T0: 0.28, FOOT_T1: 0.90,
  // p3d-0.8.8 손의 빠르기 곡선(사용자 플레이 1차): HAND_ACC2 = 떠날 때의 가속, HAND_DEC = 다가갈 때의 감속, HAND_V1 = 닿는 순간의 빠르기. 놓인 팔이 쉬는 자리로 돌아가는 시간 = RET_T0 + RET_K × 거리(m), RET_T1까지
  HAND_ACC2: 20, HAND_DEC: 14, HAND_V1: 0.5, RET_T0: 0.30, RET_K: 0.30, RET_T1: 0.62, EXT_DEC: 40,
  // p3d-0.9.0 몸통 자세의 층(실험값 — 비교 측정 뒤 정한다. GPT의 0.8.8 검토): 골반이 몸의 기준 자리에서 벗어나는 몫(K.po)과 그것을 되받는 윗몸.
  //   PO_W = 골반 쪽 무게 ÷ 윗몸 쪽 무게(골반·넓적다리 뿌리 0.22 : 가슴·머리·팔 0.48로 어림. 발에 붙은 다리의 나머지는 세지 않는다), PO_H = 골반에서 윗몸 무게중심까지의 높이.
  //   골반이 P만큼 가면 윗몸의 무게중심은 −PO_W × P만큼 간다(두 점의 무게를 단 평균이 물리의 기준 자리에 남는다 — 몸의 자리를 몰래 옮기지 않는다. 전신 균형을 검증한 것은 아니다)
  //   PO_SIDE = 받치는 발 쪽으로 가는 정도(발이 몸 가운데에서 벗어난 거리 × 이 값, PO_SIDE_MAX까지), PO_BACK = 깊이 접은 다리를 위해 엉덩이를 벽에서 빼는 거리(가장 클 때), PO_YAW = 발을 엇갈려 디딜 때 골반이 도는 각(가장 클 때), PO_REACH = 팔을 거의 다 펴야 닿는 손을 뻗을 때 골반이 반대쪽으로 가는 거리(가장 클 때. 윗몸이 그만큼 목표 쪽으로 간다 = 닿는 거리가 는다 → 고정 수치는 비교 측정 뒤)
  HIP_TOL: 15 * deg, PELVIS_ALLOW: 12 * deg, HIP_TOL_CMD: 15 * deg, HIP_TOL_HOLD: 22 * deg, HIP_HOLD_T: 0.25, KNEE_HYST: 6, SH_OMEGA: 8, SH_OMEGA_DYN: 16, WRIST_COMF: 0.30, WRIST_MIN: 0.14, SH_AVOID: 0.20, // SH_OMEGA = 뻗는 손목이 어깨 둘레를 도는 각속도의 한계(rad/s), WRIST_MIN = 어깨–손목 최소 거리(m), SH_AVOID = 손이 가는 길이 어깨에서 떨어질 거리(m. 그보다 가까이 지나면 경유점) — p3d-0.10.3 실험값
  SIDE_FACE: globalThis.SIDE_FACE ?? 1, TURN_ACC: globalThis.TURN_ACC ?? 18, // SIDE_FACE = 턱 옆면 법선의 몫(몸이 보는 쪽. 0.5로 줄여 봤으나 가속 한계와 함께 켜면 h3에서 늘어진 오른 다리가 발판 가까이 가 무릎을 빼내며 초속 464°로 디뎠다 → 1 = 그대로), TURN_ACC = 몸이 도는 빠르기의 가속 한계(rad/s²) — p3d-0.10.2 실험값
  // p3d-0.10.2: 디딘 무릎이 지금 쪽의 해를 두고 다른 쪽으로 넘어가는 값의 차이(1 = 1°만큼의 값). 실험값
  PO_W: 0.46, PO_H: 0.33, PO_SIDE: 0.30, PO_SIDE_MAX: 0.035, PO_BACK: 0.09, PO_YAW: 0.60, PO_REACH: 0, // PO_REACH는 0으로 둔다: 재 보니(test/reach_bound.mjs) 골반을 반대로 보내도 어깨가 목표에 가까워지지 않았다(0 ~ −1cm. 윗몸이 기울며 뻗는 어깨가 내려간다). 값은 실험용으로 남겨 둔다
  ARM_F: 0.65, ARM_TQ: 0.13, LEG_F: 1.5, LEG_PERP: 0.35, LEG_PERP_SMEAR: 0.08, MU_TOP: 0.9, MU_WALL: 1.0, COM_H: 1.0, MOM: 8,
  GRIP_ANG: 50 * deg, GRIP_MIN: 0.15, SLIP_T: 0.10, SHOCK_V: 1.5,
  KP: 60, KD: 14, ACC_MAX: 7, DAMP: 0.6, SHIFT_V: 0.5, REF_LAG: 0.08, RISE_V: 0.75, // RISE_V = 몸 위로(W)의 빠르기(p3d-0.11.10, 사용자 "둘 다 더 빠르게" → 0.11.9의 0.5에서 1.5배). 옆(A·D)은 SHIFT_V
  BLEND_T: 0.25, TURN: 3, OUT_FEET: 0.30, DANGLE: 0.80, SHOULDER_BACK: -0.2, FACE_MIN: -0.17, SHRUG: 0.42, IDLE_T: 0.05,
  R_TORSO: 0.12, R_HEAD: 0.11, R_GROW: 0.4, TOPPLE: 0.10, ASSIST_T: 0.30,
  // p3d-0.12.0 자세 보조(사용자 2026-11-25: "불가능하다고 거부되는 동작이 엉덩이를 빼면 되는 경우면 보조해 달라. 진짜 안 되면 어쩔 수 없다"):
  //   OUT_MAX = 몸을 벽에서 더 뺄 수 있는 가장 큰 거리, OUT_V = 빼고 돌아오는 빠르기, OUT_STEP = 시험해 보는 간격, OUT_WAIT = 보조를 기다리는 가장 긴 시간(넘으면 원래 까닭으로 거부),
  //   OUT_GRIP = 뺀 뒤에도 잡은 손이 당기는 방향이 아래에서 이 각 안이어야 한다(물리의 놓침은 GRIP_ANG 50°), OUT_PELVIS = 그 가운데 골반이 무게중심보다 더 빠지는 몫(전신 자세 풀이의 골반 앞뒤 값). 실험값
  OUT_MAX: 0.24, OUT_V: 0.6, OUT_STEP: 0.04, OUT_WAIT: 1.0, OUT_GRIP: 40 * deg, OUT_PELVIS: 0.6, OUT_HAND: 0.14, ROCK_SPAN: 0.10, FOLD_GAP: 0.16, PRESS_F: 0.55, PRESS_TOP: 0.90, OVER_OUT: 0.12, FOLD_KEEP: 0.30, FOLD_FRONT: 0.09, LOW_SIDE: 0.08, LOW_ON: Math.cos(48 * deg), LOW_OFF: Math.cos(42 * deg), SH_Y0: 1.44, LOOK_UP: 0.35, LOOK_EL: 32 * deg, CLEAR_LAT: 0.06, AIM_SNAP: 0.26, AIM_SIDE: 0.20, ARM_T: 2.0, ARM_MAX: 1.0, ARM_TRY: 0.40, AUTO_MAX: 0.30, AUTO_T: 1.2, AIM_YAW: 0.12,
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
    if ((d <= CL.SNAP || (on && d <= 0.30)) && (!best || d < best.d) && openAt(world, e, p) && handFits(world, { p, n: e.n, edge: e })) best = { d, edge: e, p, n: e.n };
  }
  return best;
}
// 쉬운 조작 ① 조준 맞춤(p3d-0.13.0, 사용자: "너무 완벽한 포인트를 집어야 한다. 대충 해도 되어야 한다"): 누른 자리의 시선(o에서 d 쪽)에서 가장 가까운 잡을 수 있는 턱 모서리를 고른다.
//   resolveGrip은 겨눈 점(시선이 지형에 닿은 점)에서 3차원 거리 14cm 안의 모서리만 잡는다 — 턱이 벽에서 14~16cm 튀어나와 있어, 턱 바로 위아래의 벽면을 누르면 깊이만으로 한계를 넘어 거부됐다(여유 측정: 벽면 위 5cm 8/24, 아래 10cm 0/24).
//   여기서는 깊이를 빼고(시선과 모서리 사이의 수직 거리) AIM_SNAP 안이면 고른다. 정확히 누른 것(resolveGrip이 잡는 것)은 그대로 둔다. 시선이 닿은 면보다 40cm 넘게 뒤에 있는 모서리(가려진 것)와 손이 들어갈 틈이 없는 모서리는 고르지 않는다.
//   입력만 바꾼다: 고른 점을 손 명령의 자리로 넘기면 판정(닿는 거리·길·관절)은 그대로다. 화면(main.js)과 여유 측정(route_tolerance)이 함께 쓴다
export function aimGrip(world, o, d, hit, avoid = null) {
  // 고침(p3d-0.13.1, 여유 측정의 "팔이 턱에 걸려" 13가지가 모두 이것이었다): 누른 자리의 턱이 **보는 쪽을 향한 모서리**일 때만 그대로 쓴다.
  //   턱의 옆 끝 모서리(길이 = 턱의 깊이 14cm, 벽을 따라 옆을 향함)도 잡는 선이라, 턱 끝에서 14cm 안의 벽면(턱 위로 스쳐 지나간 시선도 벽에 닿는다)을 누르면 3차원 거리로는 앞 모서리(깊이 14cm 앞)보다 끝 모서리가 가까워 그쪽으로 갔다 — 매달린 팔로는 닿지 않는 자리다.
  //   옆을 향한 모서리는 시선으로 찾는 아래의 후보들과 견주고(벌점 AIM_SIDE), 향한 모서리가 가까이 없을 때만 고른다. OLDAIMSIDE = 전처럼 누른 자리의 결과를 그대로
  const facing = e => e.n.dot(d) < -0.3, g0 = hit ? resolveGrip(world, hit) : null;
  //   그리고 누른 점이 **그 턱의 겉 위**일 때만 그대로 쓴다: 벽면을 누른 점이 위 턱의 밑 3cm 안이면 resolveGrip은 그 턱의 "겉"으로 보고 30cm까지 너그럽게 잡아 주어, 화면에서는 아래 턱의 모서리(5cm)가 더 가까운데 위 턱(11cm)으로 갔다(11단계: 턱 B의 5cm 위를 눌렀는데 턱 D). OLDAIMON = 전처럼
  const onBox = (x, q) => q.x > x.min.x - 0.002 && q.x < x.max.x + 0.002 && q.y > x.min.y - 0.002 && q.y < x.max.y + 0.002 && q.z > x.min.z - 0.002 && q.z < x.max.z + 0.002;
  if (g0 && ((facing(g0.edge) && (globalThis.OLDAIMON || onBox(g0.edge.box, hit))) || globalThis.OLDAIMSIDE)) return { p: g0.p, edge: g0.edge, d: 0, exact: true };
  const sHit = hit ? hit.clone().sub(o).dot(d) : Infinity; let best = g0 && !facing(g0.edge) ? { p: g0.p, edge: g0.edge, d: 0, cost: CL.AIM_SIDE, exact: true } : null, fall = g0;
  for (const e of gripEdges(world)) { const ab = e.b.clone().sub(e.a), len = ab.length(); if (len < 0.12) continue;
    // 시선(반직선)과 모서리(선분, 끝 5cm는 뺀다)의 가장 가까운 두 점
    const u = ab.clone().multiplyScalar(1 / len), w0 = o.clone().sub(e.a), b = d.dot(u), dd = d.dot(w0), e2 = u.dot(w0), den = 1 - b * b; let t = den < 1e-6 ? e2 : (e2 - b * dd) / den; t = clamp(t, 0.05, len - 0.05);
    const p = e.a.clone().addScaledVector(u, t), s = Math.max(0, p.clone().sub(o).dot(d)), dist = p.distanceTo(o.clone().addScaledVector(d, s));
    if (dist > CL.AIM_SNAP || s > sHit + 0.40) continue; // avoid = 지금 손이 잡고 있는 자리들: 그 6cm 안의 후보는 벌점(어느 손을 보내도 "이미 잡고 있는 자리"거나 다른 손과 겹친다 — 12단계: 턱 D의 10cm 아래를 눌렀는데 오른손이 잡고 있는 턱 B의 그 자리로 맞췄다)
    const cost = dist + (globalThis.OLDAIMSIDE ? (e.n.dot(d) < -0.5 ? 0 : 0.06) : facing(e) ? 0 : CL.AIM_SIDE) + (avoid && avoid.some(a => a.distanceTo(p) < 0.06) ? 0.10 : 0);
    if ((!best || cost < best.cost) && openAt(world, e, p) && handFits(world, { p, n: e.n, edge: e })) best = { p, edge: e, d: dist, cost }; }
  return best || (fall ? { p: fall.p, edge: fall.edge, d: 0, exact: true } : null);
}
// 손목이 가야 할 자리: 손바닥(손목에서 8cm)이 모서리에 걸리도록 모서리 아래·조금 앞
// 잡을 때의 손목 자리: 모서리에서 턱 바깥으로 GRIP_OUT, 손바닥 길이만큼 아래. p3d-0.8.3: 바깥으로 2cm → 4cm(팔뚝 끝의 실제 반지름 3.6cm가 턱 앞면에 들어가지 않게. 2cm일 때는 잡고 있는 자세에서 팔뚝 끝 표면이 턱 안 1.5cm였다)
const GRIP_OUT = DIM.armR.fore[1] + 0.004;
// p3d-0.10.2(사람형 몸, 비교 설정 grip=frame): 손목 자리를 손의 접촉 틀(rig.js DIM.grip)에서 정한다 — 모서리 아래 L·cos(tilt) − kU, 앞 kN + L·sin(tilt). 0.10.1까지는 "손바닥 8cm"의 대각선(아래 5.9cm·앞 5.4cm)이라 마네킹 손을 세우면 첫 마디가 윗면보다 5.9cm 위에 떠 손가락이 윗면에 닿지 못했다(grip_check: 덮은 손가락 0/4, 틈 14~22mm)
//   기본은 0.10.1의 손목 자리(닿는 거리가 그대로)다. 첫 마디를 모서리에 두는 접촉 틀은 비교 설정: ?grip=frame(화면) · GRIP_FRAME=1(시험) — 위로 뻗을 때 닿는 거리가 약 6cm 는다(h3 "7cm 모자람" → "1cm", foot7 잡힘).
//   닿는 거리의 변화는 기획 결정이라(측정해 후보로 낸다) 기본으로 두지 않았다. 부를 때마다 읽는다(화면이 시작할 때 정한다)
const GRIP_OLD = { down: Math.sqrt(DIM.palm * DIM.palm - GRIP_OUT * GRIP_OUT), out: GRIP_OUT }, GRIP_NEW = DIM.grip ? (() => { const G = DIM.grip, t = G.tilt * Math.PI / 180; return { down: G.L * Math.cos(t) - G.kU, out: G.kN + G.L * Math.sin(t) }; })() : GRIP_OLD;
export const gripD = () => (globalThis.GRIP_FRAME && !globalThis.OLDGRIP ? GRIP_NEW : GRIP_OLD), palmLen = () => Math.hypot(gripD().down, gripD().out); // palmLen = 제어 뼈대의 손목 → 잡는 점(모서리) 거리(손바닥 점을 잴 때)
const anchorOf = g => { const D = gripD(); return g.p.clone().add(V(0, -D.down, 0)).addScaledVector(g.n, D.out); };
// 발을 디딜 면: 윗면(올라서는 면) 또는 옆면(벽에 대고 누르는 면). 얇은 턱은 앞면을 겨눠도 윗면으로 본다
export function resolveFoot(world, pt, yaw) {
  let best = null;
  for (const b of world.boxes) {
    const m = 0.06;
    if (pt.x < b.min.x - m || pt.x > b.max.x + m || pt.y < b.min.y - m || pt.y > b.max.y + m || pt.z < b.min.z - m || pt.z > b.max.z + m) continue;
    const thin = b.max.y - b.min.y < 0.12, dTop = Math.abs(pt.y - b.max.y);
    // 기운 면의 계단 조각(b.stair, p3d-0.15.0)은 윗면을 디디지 않는다(2~4cm의 어긋남일 뿐이다) — 옆면(기운 면의 겉)에 대는 발로만 본다
    if (!b.stair && (dTop <= m || thin || b.kind === 'floor')) {
      const p = V(clamp(pt.x, b.min.x + 0.01, b.max.x - 0.01), b.max.y, clamp(pt.z, b.min.z + 0.01, b.max.z - 0.01)), d = p.distanceTo(pt);
      // 사람형 몸(p3d-0.10.0): 발이 길다(발볼에서 발끝까지 9.2cm). 발끝이 벽·다른 상자에 들지 않게 발볼 자리를 몸 쪽으로 물린다(1cm씩 12cm까지, 그 윗면 안에서만). 옛 몸은 하지 않는다(0.9.1과 같게)
      if (DIM.boxCollide && b.kind !== 'floor' && yaw !== undefined) { const fw = V(Math.sin(yaw), 0, Math.cos(yaw)), tip = () => p.clone().addScaledVector(fw, DIM.toeZ - DIM.ballZ).add(V(0, 0.025, 0));
        for (let k = 0; k < 12 && insideAny(world, tip(), b); k++) { p.addScaledVector(fw, -0.01); p.x = clamp(p.x, b.min.x + 0.01, b.max.x - 0.01); p.z = clamp(p.z, b.min.z + 0.01, b.max.z - 0.01); } }
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
// 손이 풀린 까닭의 갈래(p3d-0.15.2, GPT의 0.15.1 재검토: "왜 어떤 손을 놓았는가를 모든 경로에서 기록한다"). 손을 놓는 모든 경로는 releaseHand 하나를 거치고, 기록에 cause로 남는다
//   'command' = 플레이어가 시킨 것(놓기·그 손을 다른 곳으로 보냄) · 'assist' = 보조가 다른 손을 놓음(잡기 보정) · 'cancel' = 새 잡기를 거둠(먼저 잡은 손은 그대로)
//   'body' = 잡은 채로는 팔이 제 몸·지형을 지나가야 해서 놓침 · 'physics' = 버틸 수 없는 방향·충격·몸이 손을 지나 올라감
export const relCause = why => (/^놓음$|^뻗으려고 놓음|^옮기려고 놓음/.test(why) ? 'command' : /놓음\(잡기 보정\)$/.test(why) ? 'assist' : /^새 잡기를 취소/.test(why) ? 'cancel' : /→ 놓침$/.test(why) ? 'body' : 'physics');
function note(S, type, limb, i, why = '', extra = {}) {
  const K = S.climb, e = { k: K.tick, t: +(K.tick / 120).toFixed(3), type, limb, i, name: limb ? KO[limb][i] : '', why, ...extra };
  K.events.push(e); K.log.push(e); if (K.log.length > 300) K.log.shift();
  return e;
}

// ── 몸통의 틀: 어깨·고관절 자리. 물리와 그림이 같은 함수를 쓴다(손이 잡은 자리와 그림이 어긋나지 않게) ──
// 몸통 자세의 층을 쓰는가: 비교 스위치 OLDPOSE(시험)·K.oldPose(화면의 실험 설정)가 켜져 있으면 0.8.8의 몸통 그대로다
export const poseOn = K => !globalThis.OLDPOSE && !K.oldPose && !!K.po;
// 전신 자세 풀이를 쓰는가(사람형 몸에서만)
export const fbOn = K => K.post === 'fb' && !!K.fb && DIM.boxCollide && poseOn(K);
export function torso(b, K) {
  // 몸의 층(p3d-0.8.0, K.pz — 계산 걸음에서만 바뀐다): 가슴 비틀기(뻗는 손·잡은 손 쪽 어깨가 벽으로)와 골반의 반대 비틀기, 골반 기울기(체중이 실린 쪽이 올라가고 어깨 선은 반대로), 머리가 목표(옮기는 발 > 뻗는 손 > 겨눈 곳)를 보고 몸이 옆으로 기울어도 머리는 덜 기운다, 뛰는 동안 윗몸을 젖히고 위를 봄, 숨
  const Z = K.pz, br = 0.02 * Math.sin(Z.breath * 1.9), tk = clamp(Z.tuck, 0, 1);
  // 잡은 팔이 머리에 닿으면 **목과 머리**가 비킨다(p3d-0.8.6. K.hg). 0.8.5는 윗몸 전체를 기울였는데, 팔을 다 편 채로 윗몸이 물러나면 팔 길이에 끌려 몸이 벽 쪽으로 딸려 가고 디딘 발이 떨어졌다
  // p3d-0.10.1(사람형 몸): 머리가 위의 턱 밑에 다가가면 고개를 젖힌다(K.hc, 계산 걸음에서만 바뀐다). 새 몸은 키가 커서 잡고 있는 턱 밑에 머리가 닿아 W로 오르지 못했다(14.6cm, 옛 몸 29.2cm)
  const hgx = (K.hg ? K.hg.x : 0) - (K.hc || 0) * 0.6, hgz = K.hg ? K.hg.z : 0;
  const tq = { hips: Q().setFromAxisAngle(UP, b.yaw - Z.twist * 0.3).multiply(Q().setFromAxisAngle(V(0, 0, 1), K.lean.z * 0.4 + Z.hipRoll)), spine: Q().setFromEuler(new THREE.Euler(K.lean.x - 0.16 * tk, 0, K.lean.z * 0.6 - Z.hipRoll * 1.2, 'ZXY')), chest: Q().setFromAxisAngle(UP, Z.twist * 1.3),
    neck: Q().setFromAxisAngle(X, K.hands.some(h => h.st === 'hold') ? -0.18 : 0).multiply(Q().setFromEuler(new THREE.Euler(Z.lookP * 0.4 - 0.12 * tk + hgx, Z.lookY * 0.4, -K.lean.z * 0.4 + hgz, 'YXZ'))), head: Q().setFromEuler(new THREE.Euler(Z.lookP * 0.6 - 0.14 * tk + hgx * 0.5, Z.lookY * 0.6, -K.lean.z * 0.4 + hgz * 0.5, 'YXZ')),
    'shoulder.L': Q().setFromAxisAngle(V(0, 0, 1), K.shrug[0] + br), 'shoulder.R': Q().setFromAxisAngle(V(0, 0, 1), -K.shrug[1] - br) };
  // 전신 자세 풀이(p3d-0.11.0, K.post === 'fb'): 골반·척추·가슴·빗장뼈의 회전과 골반의 자리는 풀이 값(K.fb.x — 계산 걸음에서만 바뀐다)에서 온다. 목·머리는 위의 식 그대로(옆 기울기만 가슴의 것으로). 아래의 어깨·고관절 계산은 같다
  const FB = fbOn(K) ? K.fb : null;
  if (FB) { const x = FB.x, g = fbFK(x, [b.pos.x, b.pos.y, b.pos.z], b.yaw), qa = a => new THREE.Quaternion(a[0], a[1], a[2], a[3]), qH = qa(g.qH), qS = qa(g.qS), lz = x[FBI.RC] - K.lean.z;
    tq.hips = qH; tq.spine = qH.clone().invert().multiply(qS); tq.chest = qS.clone().invert().multiply(qa(g.qC));
    tq['shoulder.L'] = Q().setFromAxisAngle(V(0, 0, 1), x[FBI.SL] + br); tq['shoulder.R'] = Q().setFromAxisAngle(V(0, 0, 1), -x[FBI.SR] - br);
    tq.neck.multiply(Q().setFromAxisAngle(V(0, 0, 1), -lz * 0.4)); tq.head.multiply(Q().setFromAxisAngle(V(0, 0, 1), -lz * 0.4)); }
  if (K.blend) { const k = mj(clamp(K.blend.t / CL.BLEND_T, 0, 1)); for (const n of TORSO) tq[n] = K.blend.q[n].clone().slerp(tq[n], k); }
  const hip = V(b.pos.x, b.pos.y + DIM.hipY, b.pos.z), qS = tq.hips.clone().multiply(tq.spine);
  // p3d-0.9.0 몸통 자세의 층(K.po — 계산 걸음에서만 바뀐다): 골반이 기준 자리에서 옆(x, 왼쪽이 +)·앞뒤(z, 벽 쪽이 +)로 벗어나고 제 축으로 돈다(yaw). 윗몸은 골반을 축으로 반대로 기울어 무게를 되받는다.
  //   윗몸의 무게중심(골반 위 PO_H)이 −(1 + PO_W) × P만큼 가도록 척추를 돌린다(가장 작은 회전). 골반이 도는 것은 고관절의 자리와 골반의 그림에만 들어가고 가슴·어깨의 방향은 그대로다(척추가 되돌린다).
  const P = poseOn(K) && !FB ? K.po : null;
  if (FB) { const kb = K.blend ? mj(clamp(K.blend.t / CL.BLEND_T, 0, 1)) : 1, x = FB.x; hip.add(V(Math.cos(b.yaw), 0, -Math.sin(b.yaw)).multiplyScalar(x[FBI.PX] * kb)).add(V(Math.sin(b.yaw), 0, Math.cos(b.yaw)).multiplyScalar(x[FBI.PZ] * kb)); hip.y += x[FBI.PY] * kb; qS.copy(tq.hips).multiply(tq.spine); }
  if (P && (P.x || P.z || P.yaw)) { const kb = K.blend ? mj(clamp(K.blend.t / CL.BLEND_T, 0, 1)) : 1, off = V(Math.cos(b.yaw), 0, -Math.sin(b.yaw)).multiplyScalar(P.x * kb).add(V(Math.sin(b.yaw), 0, Math.cos(b.yaw)).multiplyScalar(P.z * kb));
    hip.add(off); const L = V(0, CL.PO_H, 0).applyQuaternion(qS), w = L.clone().cross(off.multiplyScalar(-(1 + CL.PO_W))).multiplyScalar(1 / L.lengthSq()), a = w.length();
    if (a > 1e-6) qS.premultiply(Q().setFromAxisAngle(w.multiplyScalar(1 / a), Math.min(a, 0.6)));
    tq.hips = tq.hips.clone().multiply(Q().setFromAxisAngle(UP, P.yaw * kb)); tq.spine = tq.hips.clone().invert().multiply(qS); }
  const qH = tq.hips, qC = qS.clone().multiply(tq.chest);
  const chest = hip.clone().add(V(...DIM.oSpine).applyQuaternion(qH)).add(V(...DIM.oChest).applyQuaternion(qS));
  const sh = SIDES.map((s, i) => { const sx = i ? -1 : 1, qSh = qC.clone().multiply(tq[`shoulder.${s}`]); return chest.clone().add(V(sx * DIM.oClav[0], DIM.oClav[1], DIM.oClav[2]).applyQuaternion(qC)).add(V(sx * DIM.oSh[0], DIM.oSh[1], DIM.oSh[2]).applyQuaternion(qSh)); });
  const hj = SIDES.map((s, i) => hip.clone().add(V((i ? -1 : 1) * DIM.oHip[0], DIM.oHip[1], DIM.oHip[2]).applyQuaternion(qH)));
  // 머리 공: 옛 몸은 0.9.1과 같게 가슴 방향 하나로 둔다. 사람형 몸(p3d-0.10.1)은 목·머리의 회전까지 따라간다(그림의 머리 = 물리의 머리. 고개 젖히기 K.hc가 실제로 머리를 턱에서 비키게)
  const qN = qC.clone().multiply(tq.neck), head = DIM.boxCollide ? chest.clone().add(V(...DIM.oNeck).applyQuaternion(qC)).add(V(...DIM.oHead).applyQuaternion(qN)).add(V(...DIM.headCT).applyQuaternion(qN.clone().multiply(tq.head)))
    : chest.clone().add(V(...DIM.oNeck).add(V(...DIM.oHead)).add(V(...DIM.headCT)).applyQuaternion(qC));
  return { tq, hip, sh, hj, chest, head, qC };
}
const joints = S => (S.climb.on && S.climb.T ? S.climb.T : { sh: SIDES.map(s => worldPos(S.rig.bones[`upperArm.${s}`])), hj: SIDES.map(s => worldPos(S.rig.bones[`upLeg.${s}`])) });
const armPole = (yaw, sx) => V(sx * 0.5, -1, -0.35).applyAxisAngle(UP, yaw).normalize();
// 팔꿈치의 기본 방향: 아래·바깥·조금 뒤. 팔꿈치가 벽·턱에 들어가면 들어가지 않을 때까지 더 뒤·바깥으로 돌린다
// q = 가슴의 방향(벽 문맥). 팔꿈치의 기본 방향은 몸통을 따라 돈다(몸이 옆으로 기울어 흔들릴 때 팔꿈치가 머리 쪽으로 접히지 않게). 없으면 몸이 보는 쪽만
// full(뻗는 팔, p3d-0.8.2): 팔꿈치 한 점만이 아니라 팔뚝·위팔의 캡슐(armHit)까지 지형에 겹치지 않는 후보를 고른다. 다 겹치면 가장 덜 겹치는 후보와 그 겹침(hit)을 돌려준다.
//   잡은 팔과 판정(armCheck)은 전처럼 팔꿈치만 본다(잡은 손의 팔뚝은 턱에 닿아 있는 것이 정상이라 캡슐로 보면 후보가 걸음마다 바뀐다)
// 팔이 사람 어깨·위팔의 범위를 넘은 각(rad, 안이면 0). qC = 가슴의 방향(없으면 몸이 보는 쪽). 사람형 몸에서만(p3d-0.11.1, src/anat.js)
// ELBOW_UP = 팔꿈치가 어깨와 손목 둘 다보다 높이 올라간 만큼의 값(1m = 0.25): 접은 팔의 위팔이 몸통에 조금 닿는다고 팔꿈치를 머리 위로 세우지 않게(손은 어깨 옆에 있고 팔꿈치만 하늘을 가리키는 팔이 뻗는 중에 그려졌다)
// ARM_AW(1rad = 0.12 → 10° ≈ 지형 겹침 2mm·제 몸 겹침 7mm): 0.5로 두었을 때는 보통의 팔 교차가 "다른 팔에 막혀" 거부됐다(잡은 팔이 범위를 지키느라 비켜 주지 못했다). 0.12에서 잡은 팔의 범위 밖 걸음은 그대로 0
const WRIST_W = 0.3; // p3d-0.12.0: 잡은 팔의 팔꿈치를 고를 때 손목이 한계에 가까운 만큼(rad)의 값
const ARM_AW = 0.12, ELBOW_UP = 0.25, ELBOW_IN = 0.4, ELBOW_WING = 0.07; // ELBOW_WING(p3d-0.11.4, 잡은 팔 — 날개 값이 걸린 걸음에는 판정(armCheck)이 거부할 후보(제 몸 5mm 넘게, 팔이 벽·턱을 지나감)에 0.5를 더한다. 더하지 않았더니 그런 후보가 뽑혀 잡은 손이 놓쳤다(다른 벽 시험 A→B→A)): 손이 어깨 위일 때 위팔이 바깥으로 벌어진 몫(0.35 넘는 만큼) 1당 값(최대 0.045 — 팔꿈치가 지형에 드는 값 0.05보다 작게. 0.15로 두었더니 다른 벽의 턱을 잡을 때 벽 속 팔꿈치가 뽑혀 "팔이 벽·턱을 지나감"으로 거부됐다). 실험값
const ELBOW_BACK = 0.2; // p3d-0.12.1: 잡은 팔의 팔꿈치가 어깨보다 뒤로 간 몫의 값(heldPole). 실험값
function armOver(sh, ik, sx, q, yaw) { if (!(DIM.boxCollide && !globalThis.NOANAT)) return 0; const qq = q || Q().setFromAxisAngle(UP, yaw); return Math.max(0, armExcess([qq.x, qq.y, qq.z, qq.w], [sh.x, sh.y, sh.z], [ik.mid.x, ik.mid.y, ik.mid.z], [ik.end.x, ik.end.y, ik.end.z], sx)); }
function armIK(world, sh, tgt, yaw, sx, q = null, full = false, tb = null) {
  let ik, pole, best = null;
  // p3d-0.11.1: 후보 다섯 가운데 "팔꿈치가 지형에 들지 않는 첫 후보"가 아니라, 지형 겹침 + 사람 어깨의 범위를 넘는 만큼이 가장 작은 후보(같으면 앞의 것)
  if (DIM.boxCollide && !globalThis.NOANAT) { let k = 0;
    for (const c of [[0.5, -1, -0.35], [0.6, -0.6, -0.8], [0.3, -0.3, -1], [1, -0.3, -0.4], [0.2, 0.2, -1], [1, 0.1, 0.3], [0.7, -0.7, 0.5]]) { const pl = V(sx * c[0], c[1], c[2]); if (q) pl.applyQuaternion(q); else pl.applyAxisAngle(UP, yaw); pl.normalize(); const k2 = twoBone(sh, tgt, DIM.upperArm, DIM.foreArm, pl);
      const eIn = world.boxes.some(x => k2.mid.x > x.min.x - 0.03 && k2.mid.x < x.max.x + 0.03 && k2.mid.y > x.min.y - 0.03 && k2.mid.y < x.max.y + 0.03 && k2.mid.z > x.min.z - 0.03 && k2.mid.z < x.max.z + 0.03), ov = armOver(sh, k2, sx, q, yaw);
      const hit = full ? armHit(world, sh, k2, tb) : null, cost = (hit ? hit.d : 0) + (eIn ? 0.05 : 0) + ARM_AW * ov + 0.002 * k++; if (!best || cost < best.cost - 1e-6) best = { ik: k2, pole: pl.clone(), hit, cost: cost - 0.002 * (k - 1), over: ov }; }
    return best; }
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
export const ARM_R = { fore: DIM.armR.fore, upper: DIM.armR.upper }, ARM_PAD = 0.004, ARM_PAD_GRIP = 0.001;
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
// 머리의 모양(p3d-0.10.4, 사람형 몸): 머리뼈 둘레의 타원체(옆 0.9·위아래 1.05·앞뒤 1.0 × 머리 반지름, 가운데 = 머리뼈 + (0, 0.9R, 0.01)) — 팔 검사(wall_check 20, test/arm_mesh.mjs)와 같은 모양.
//   팔의 줄기 검사(armSelf)에만, 줄기(가운데 선)로 쓴다(검사와 같은 뜻 — 줄기 반지름 1cm를 더하면 정상 교차가 막혔다) — 손목이 비켜 가는 길(공)에도 쓰면 교차 두 장면이 "다른 팔에 막혀"로 바뀌었다(해 봄).
//   0.10.3까지는 그보다 1.7cm 높은 공이라 턱·뺨 높이를 지나는 팔뚝 줄기가 검사의 머리에는 들고 물리의 머리에는 들지 않았다(땅에서 몸 앞을 가로질러 뻗기 — 2mm). c·r(공)은 다른 곳(머리 비킴 등)이 그대로 쓴다
const headShape = (hb, qHd) => { const R = DIM.headR, c = hb.clone().add(V(...DIM.headC).applyQuaternion(qHd)); if (!DIM.boxCollide || globalThis.OLDHEAD) return { c, r: R }; const E0 = headEll(); return { c, r: R, e: { c: hb.clone().add(V(...E0.c).applyQuaternion(qHd)), q: qHd, qi: qHd.clone().invert(), ax: V(...E0.r) } }; };
function selfBody(S) {
  const K = S.climb; if (globalThis.NOSELF) return null;
  // 지상(땅에 서서·뛰며 뻗는 팔): 앞 걸음에 확정된 자세의 뼈에서 읽는다(지상 문맥의 어깨 자리도 그렇게 읽는다 — joints)
  if (!K.on || !K.T) { const Bn = S.rig.bones, wq = n => Bn[n].getWorldQuaternion(Q()), qHd = wq('head'), qC = wq('chest'), qH = wq('hips');
    return { head: headShape(worldPos(Bn.head), qHd),
      boxes: [{ c: worldPos(Bn.chest).add(V(...DIM.boxChest.c).applyQuaternion(qC)), q: qC, qi: qC.clone().invert(), h: V(...DIM.boxChest.h) }, { c: worldPos(Bn.hips).add(V(...DIM.boxHip.c).applyQuaternion(qH)), q: qH, qi: qH.clone().invert(), h: V(...DIM.boxHip.h) }] }; }
  const T = K.T, tq = T.tq, qH = tq.hips, qC = T.qC, qN = qC.clone().multiply(tq.neck), qHd = qN.clone().multiply(tq.head);
  const hb = T.chest.clone().add(V(...DIM.oNeck).applyQuaternion(qC)).add(V(...DIM.oHead).applyQuaternion(qN));
  return { head: headShape(hb, qHd),
    boxes: [{ c: T.chest.clone().add(V(...DIM.boxChest.c).applyQuaternion(qC)), q: qC, qi: qC.clone().invert(), h: V(...DIM.boxChest.h) }, { c: T.hip.clone().add(V(...DIM.boxHip.c).applyQuaternion(qH)), q: qH, qi: qH.clone().invert(), h: V(...DIM.boxHip.h) }] };
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
function selfHits(B, p, r, headOnly = false, rHead = Math.min(r, 0.01), rArm = r, hint = null, ell = false) {
  let body = null, arm = null;
  // 머리: 팔이 귀 옆에 붙는 것(팔의 가운데 선이 머리 가운데에서 12cm)까지는 겹침이 아니다
  if (B.head.e && ell) { const E = B.head.e, l = p.clone().sub(E.c).applyQuaternion(E.qi), k = Math.hypot(l.x / E.ax.x, l.y / E.ax.y, l.z / E.ax.z), d = (1 - k) * E.ax.x; if (d > 0) { const g = V(l.x / (E.ax.x * E.ax.x), l.y / (E.ax.y * E.ax.y), l.z / (E.ax.z * E.ax.z)), gl = g.length(); body = gl > 1e-6 && k > DEG_L ? { d, n: g.multiplyScalar(1 / gl).applyQuaternion(E.q), head: true } : { d, n: degN(B, p, null, hint && hint.body), head: true, deg: true }; } }
  else { const v = p.clone().sub(B.head.c), L = v.length(), d = rHead + B.head.r - L; if (d > 0) body = L > DEG_L ? { d, n: v.multiplyScalar(1 / L), head: true } : { d, n: degN(B, p, null, hint && hint.body), head: true, deg: true }; }
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
  for (const [t, r] of ARM_PTS) up(selfHits(B, ik.mid.clone().lerp(ik.end, t), SELF_R + extra, t < 0.15, 0.01 + extra, r + extra + xa, null, true), t);
  if (sh) for (const t of [0.4, 0.55, 0.7, 0.85]) up(selfHits(B, sh.clone().lerp(ik.mid, t), SELF_R, true, 0.01 + extra, t >= 0.55 ? lerp(ARM_R.upper[0], ARM_R.upper[1], t) + extra + xa : 0, null, true), -1);
  return body || arm ? { body, arm } : null; }
const sd = (x, k) => (x && x[k] ? x[k].d : 0);
// 팔꿈치가 갈 쪽을 고른다(뻗는 팔). 기본 후보(armIK)가 지형에도 제 몸에도 겹치지 않으면 그대로 쓴다(0.8.4와 같다).
// 겹치면 어깨–손목 축 둘레를 15°씩 다 돌려 보고 지형(가장 무겁게) → 제 몸 → 기본 방향에서 벗어난 정도 → 지금 방향에서 벗어난 정도의 순서로 가장 나은 쪽을 고른다.
// (0.8.4까지는 후보 다섯 가운데 지형만 보고 골라, 얼굴 앞 벽면처럼 가까운 곳을 짚을 때 지형도 몸도 비는 쪽이 있는데도 팔꿈치가 머리 위·가슴 속으로 갔다 — test/self_diag.mjs)
function pickPole(S, sh, target, yaw, sx, qC, tb, B) {
  const base = armIK(S.world, sh, target, yaw, sx, qC, true, tb), s0 = armSelf(B, base.ik, sh);
  if (!B || (base.cost < 1e-6 && !s0)) return { pole: base.pole, self: s0 };
  const u = target.clone().sub(sh); if (u.lengthSq() < 1e-8) return { pole: base.pole, self: s0 }; u.normalize();
  const e0 = base.pole.clone().addScaledVector(u, -base.pole.dot(u)); if (e0.lengthSq() < 1e-8) return { pole: base.pole, self: s0 }; e0.normalize();
  const e1 = u.clone().cross(e0), prev = S.pw && S.poleS && S.poleS['el' + (sx > 0 ? 'L' : 'R')], pa = prev ? Math.atan2(prev.dot(e1), prev.dot(e0)) : 0; let best = null;
  for (let j = 0; j < 24; j++) { const a = j * Math.PI / 12, an = a > Math.PI ? a - 2 * Math.PI : a, pl = e0.clone().multiplyScalar(Math.cos(a)).addScaledVector(e1, Math.sin(a)), ik = twoBone(sh, target, DIM.upperArm, DIM.foreArm, pl), th = armHit(S.world, sh, ik, tb), sf = armSelf(B, ik, sh);
    let dp = Math.abs(an - pa); if (dp > Math.PI) dp = 2 * Math.PI - dp;
    const cost = 10 * (th ? th.d : 0) + 3 * sd(sf, 'body') + 3 * sd(sf, 'arm') + ARM_AW * armOver(sh, ik, sx, qC, yaw) + ELBOW_UP * Math.max(0, ik.mid.y - Math.max(sh.y, target.y)) + 0.004 * Math.abs(an) + (prev ? 0.006 * dp : 0); if (!best || cost < best.cost - 1e-7) best = { cost, pole: pl, self: sf }; }
  return best;
}
// 되돌린 시도(p3d-0.8.4): 제 머리(공)·몸통 가운데(캡슐)를 팔뚝의 장애물로 넣어 보았다. 손 조작 2로 손을 끌어 몸 앞을 가로지르는 장면에서 팔뚝 중심선이 머리·가슴에 드는 걸음이 123 → 142로 늘고,
// 당겨 올라간 자세에서는 몸에서 밀려난 팔뚝이 벽에 1.7cm 들어갔다. 팔꿈치 방향만으로는 풀리지 않는다 — 손이 가는 길 자체가 몸을 비켜 가야 한다(다음 판). 겹침은 test/arm_mesh.mjs가 잰다
function armHit(world, sh, ik, tb = null, extra = 0, extraAll = 0) {
  let worst = null;
  const isT = Array.isArray(tb) ? x => tb.includes(x) : x => x === tb, test = (p, r0, t) => { for (const x of world.boxes) { if (x.kind === 'floor') continue; const h = sphereBox(p, r0 + extraAll + (isT(x) ? ARM_PAD_GRIP : ARM_PAD), x); if (h && (!worst || h.d > worst.d)) worst = { d: h.d, n: h.n, t, box: x.name }; } };
  for (const [t, r] of ARM_PTS) test(ik.mid.clone().lerp(ik.end, t), r, t);
  const fore = worst;
  let up = null; { const keep = worst; worst = null; for (const [t, r] of ARM_UP) test(sh.clone().lerp(ik.mid, t), r + extra, -1); up = worst; worst = up && (!keep || up.d > keep.d) ? up : keep; }
  if (worst) { worst.f = fore; worst.u = up; } // f = 팔뚝만의 가장 깊은 겹침(손을 멈추거나 빼내는 것은 이것으로만 한다). u = 위팔만의 가장 깊은 겹침(p3d-0.8.4. 가슴이 비켜 주는 데 쓴다) // f = 팔뚝만의 가장 깊은 겹침(없으면 null). 손을 멈추거나 빼내는 것은 이것으로만 한다(아래 limbsStep)
  return worst;
}

// ── 판정(미리보기와 실제가 같은 함수를 쓴다) ──
// 손이 가는 길(p3d-0.10.4): 한 경유점(목표 면의 바깥 10cm)으로 막히면, 지금 잡은 면의 바깥 + 목표 면의 바깥 쪽으로 더 멀리(10 · 16 · 22cm) 돌아가는 길도 본다 — 같은 턱의 앞면을 잡은 손을 그 턱의 끝(옆면)으로 옮길 때
//   곧은 길이 턱 모서리를 가로질러 "길이 막힘"으로 거부됐다(다른 벽 시험 지형). 실제 손은 목표 쪽 띄움과 지형 미끄러짐으로 돌아간다(limbsStep). 모두 막히면 막힘
function handPathBlocked(world, H, goal, g) { if (!pathBlocked(world, H.w, viaOf(H.w, goal, g.n, 0.10), goal)) return false; if (globalThis.OLDHANDPATH) return true;
  // 다른 길을 찾는 것은 목표 턱이나 지금 잡은 턱 자신의 모서리에 막혔을 때만이다(그 두 턱을 빼면 곧은 길이 열릴 때). 손과 턱 사이의 다른 판·벽에 막히면 그대로 막힘
  { const hb = H.st === 'hold' && H.edge ? H.edge.box : null, w2 = { boxes: world.boxes.filter(b => b !== g.edge.box && b !== hb) }; if (pathBlocked(w2, H.w, viaOf(H.w, goal, g.n, 0.10), goal)) return true; }
  const n2 = g.n.clone(); if (H.st === 'hold' && H.n) n2.add(H.n); if (n2.lengthSq() < 1e-6) return true; n2.normalize();
  for (const lift of [0.10, 0.16, 0.22]) if (!pathBlocked(world, H.w, viaOf(H.w, goal, n2, lift), goal)) return false;
  // 목표 면의 바깥 12 · 20cm 자리를 거쳐 가는 꺾인 길(다른 턱의 끝 옆면으로 — 가운데 경유점은 두 자리의 가운데라 볼록한 모서리를 돌아가지 못한다)
  const nh = H.st === 'hold' && H.n ? H.n : null; for (const out of [0.12, 0.20]) for (const side of nh ? [0, 0.08, 0.14] : [0]) { const v = goal.clone().addScaledVector(g.n, out); if (side) v.addScaledVector(nh, side); if (rayHit(world, H.w, v) >= 1 && rayHit(world, v, goal) >= 1) return false; } return true; } // side = 지금 잡은 면의 바깥으로 더(그 면 앞을 지나 돌아간다)
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
// p3d-0.11.4(사용자 지적 "왼손이 오른손을 지나갈 때 계속 오른손 아래로만 지나가려 한다 — 위로 지나가게"): 경유점이 잡은 손목에서 10cm 넘게 아래(그 팔뚝 위)라 손이 다른 손 밑으로 지나간다(재 보니 지나갈 때 손목이 7~10cm 아래).
//   실험(CROSSOVER=1, 기본 아님): 잡은 손목 위 OVER_UP·벽에서 5cm 앞으로 넘어가 목표로 내려오고, 끝 자세는 잡은 팔뚝의 바깥(몸 쪽)에 얹으며(H.pass −1) 가슴을 반대로 비튼다.
//   기본으로 넣지 못한 까닭(15·23cm 교차, 턱을 잡던 손에서 시작하는 교차 — 자작 동작·옛 규칙/fb): 넘어가는 것은 되지만(지나갈 때 손목이 8~10cm 위) 끝 자세가 "팔이 머리를 지나감"(건너가는 팔이 얼굴 앞을 지난다)으로 막히거나,
//   비틀기를 옛 방향으로 두면 "다른 팔에 막힘"·"팔이 턱에 걸림"이 된다. 머리·목이 비키는 동작과 가슴 비틀기를 함께 풀어야 한다(다음 판)
const OVER_UP = 0.09;
const assistOn = S => !!(S.opt && S.opt.grabAssist) && !globalThis.NOASSIST;
// p3d-0.12.0 자세 보조(S.opt.poseAssist — 화면 기본 켬, 시험 기본 끔. NOPOSEASSIST = 끔): 거부될 손발을 위해 몸을 벽에서 빼 본다
// POSEASSIST = 시험용: 옵션을 켜지 않은 시험 묶음 전체를 자세 보조 켬으로 돌려 본다
// 새 자세 방식(전신 자세 풀이)에서만 일한다: 옛 규칙 자세(O 키)에서는 몸이 턱을 피해 기울지 않아 턱 여유를 늘 가장 크게 청했고(선 채로 24cm), 옆 벽의 턱이 3cm 모자라 거부됐다(다른 벽 시험 4 → 6 실패)
// 설정이 실제로 켜는 것(p3d-0.15.4, GPT의 0.15.3 검토 M4): 전신 연결은 누르기를 포함한다 — 누르기 설정이 꺼져 있어도 켜진다. 화면 표시(main.js)와 시험 기록(provenance)이 계산과 같은 식을 쓰게 한곳에 둔다.
//   새 자세 방식(fb)이 실제로 돌고 있는지(fbOn)는 걸음마다의 상태라 여기에 넣지 않는다 — 아래 세 판정이 따로 본다
export const optEffect = opt => { const o = opt || {}, poseAssist = (!!o.poseAssist || !!globalThis.POSEASSIST) && !globalThis.NOPOSEASSIST, link = (!!o.linkPose || !!globalThis.LINKPOSE) && !globalThis.NOLINKPOSE && poseAssist, pressSet = (!!o.press || !!globalThis.PRESSON) && !globalThis.NOPRESS;
  // plan = 뻗기 전 검사(p3d-0.15.5, S.opt.planReach — 화면·시험 모두 기본 끔, 비교 후보. PLANREACH = 시험 전체 켬, NOPLANREACH = 끔). 새 자세 방식 + 자세 보조에서만
  const plan = (!!o.planReach || !!globalThis.PLANREACH) && !globalThis.NOPLANREACH && poseAssist;
  return { poseAssist, link, pressSet, press: pressSet || link, pressByLink: link && !pressSet, plan }; };
const planOn = S => optEffect(S.opt).plan && fbOn(S.climb);
const poseAssistOn = S => optEffect(S.opt).poseAssist && fbOn(S.climb);
const outDir = S => V(-Math.sin(S.body.yaw), 0, -Math.cos(S.body.yaw)); // 벽에서 멀어지는 쪽(몸이 보는 쪽의 반대)
// 지금보다 더 뺄 수 있는 거리: OUT_MAX까지, 그리고 잡은 손마다 당기는 방향(어깨 → 손의 반대)이 아래에서 OUT_GRIP 안에 남고 팔이 다 펴지지 않는 만큼. 잡은 손이 없으면 0(기댈 데가 없다)
// 벽에서 떨어진 정도는 두 어깨의 가운데로 잰다: 가슴이 틀어져 한 어깨만 물러나 있으면(발을 옆 발판에 디딘 뒤의 자세) 그 어깨로 재면 여유가 0이 되어, 몸을 빼야 풀리는 자세에서 몸을 뺄 수 없었다
function outRoom(S) { const K = S.climb, T = K.T || joints(S), o = outDir(S); let room = CL.OUT_MAX - (K.wout || 0), any = false; const mid = T.sh[0].clone().add(T.sh[1]).multiplyScalar(0.5);
  for (const h of K.hands) { if (h.st !== 'hold') continue; any = true; const pull = T.sh[h.i].clone().sub(h.goal); pull.addScaledVector(o, mid.clone().sub(T.sh[h.i]).dot(o)); const down = -pull.y, out = pull.dot(o); room = Math.min(room, Math.tan(CL.OUT_GRIP) * Math.max(down, 0) - out);
    const L2 = CL.ARM * 0.985, b = pull.dot(o), cq = pull.lengthSq() - L2 * L2; if (cq < 0) room = Math.min(room, -b + Math.sqrt(b * b - cq)); else room = 0; }
  return any ? Math.max(0, room) : 0; }
// test(d) = 몸(고관절·어깨)을 d만큼 더 뺀 것으로 본 판정('' = 통과). 통과하는 가장 작은 d(OUT_STEP 간격)를 돌려준다. 없으면 0
function outNeed(S, test) { const room = outRoom(S); for (let d = CL.OUT_STEP; d <= room + 1e-6; d += CL.OUT_STEP) if (!test(d)) return d; return 0; }
// 손: 턱·제 몸·손목 때문에 거부될 손은 한 번 몸을 OUT_HAND만큼 빼고 다시 해 본다. 참 = 아직 거부하지 않는다(기다린다)
function handOutTry(S, H, why, dt) { const K = S.climb; if (!poseAssistOn(S) || !/손목|걸려|막혀|지나감|돌아가지/.test(why) || !K.on) return false;
  // 몸을 뺄 수 없어도 머리·몸에 막힌 손은 고개가 비킬 시간을 한 번 더 준다
  if (!H.outTried) { const room = Math.min(outRoom(S), CL.OUT_HAND); if (room < 0.03 && !(H.headTouch || (H.selfBlock || 0) > 0 || (H.selfTot || 0) > 0.05)) return false; H.outTried = true; H.outT0 = 0; H.needOut = (K.wout || 0) + room; H.wait = 0; H.blockT = 0; H.stall = 0; H.best = undefined; H.t = Math.min(H.t, H.T - CL.OUT_WAIT - CL.TRY_T); H.outWhy = why; return true; }
  H.outT0 = (H.outT0 || 0) + dt; return H.outT0 < CL.OUT_WAIT && (K.wout || 0) < (H.needOut || 0) - 0.01; }
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
  if (!H.pass) { const el = worldPos(S.rig.bones[`foreArm.${H.s}`]), cur = crossSide(el, H.w, c.a, c.b, fwdW); H.pass = cur.gap < 0.01 && cur.depth > 0.01 && cur.side ? cur.side : (globalThis.PASS ?? (globalThis.CROSSOVER ? -1 : 1)); H.over = DIM.boxCollide && !!globalThis.CROSSOVER && !(cur.gap < 0.01 && cur.depth > 0.01 && cur.side); }
  if (H.over) { const sw = c.b.clone().sub(H.w).dot(leftW) * dir; if (sw < -0.02) return null; return c.b.clone().add(V(0, OVER_UP, 0)).addScaledVector(fwdW, -0.05).addScaledVector(leftW, dir * 0.03); } // 위로 넘어간다: 잡은 손목 위 11cm(벽에서 2cm 더 떨어져 그 손가락을 피한다). 그 손목을 옆으로 지나면 목표로
  return q.addScaledVector(fwdW, H.pass * clear).addScaledVector(leftW, dir * 0.04);
}
function segSeg(p1, q1, p2, q2) {
  const d1 = q1.clone().sub(p1), d2 = q2.clone().sub(p2), r = p1.clone().sub(p2), a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r), c = d1.dot(r), bb = d1.dot(d2), den = a * e - bb * bb;
  let s = den > 1e-9 ? clamp((bb * f - c * e) / den, 0, 1) : 0, t = e > 1e-9 ? (bb * s + f) / e : 0;
  if (t < 0) { t = 0; s = a > 1e-9 ? clamp(-c / a, 0, 1) : 0; } else if (t > 1) { t = 1; s = a > 1e-9 ? clamp((bb - c) / a, 0, 1) : 0; }
  return p1.clone().addScaledVector(d1, s).sub(p2.clone().addScaledVector(d2, t));
}
// 잡는 모서리의 틀(p3d-0.10.4, GPT의 0.10.3 검토 "윗면 네 모서리 — 앞면·뒷면·두 끝 옆면 — 를 같은 틀로, 손목·팔뚝·손가락과 판정·충돌을 함께"): t = 모서리 방향, n = 잡은 면의 바깥(수평), u = 위.
//   fd = 바라는 손의 방향(손목 → 손가락 뿌리) = u·cos(tilt) − n·sin(tilt). 그림(human.js)이 손을 세우는 방향과 같다. 물리의 손목 자리(anchorOf)도 이 틀(아래·바깥)이다
export function gripFrame(g) { const n = g.n.clone().setY(0).normalize(), u = UP.clone(), t = u.clone().cross(n).normalize(), k = (DIM.grip ? DIM.grip.tilt : 14) * Math.PI / 180; return { t, n, u, fd: u.clone().multiplyScalar(Math.cos(k)).addScaledVector(n, -Math.sin(k)).normalize() }; }
// 손이 들어갈 자리(같은 틀): 손바닥(모서리 아래·면 앞)과 손가락(윗면 위·모서리 뒤)의 자리가 다른 상자에 5mm 넘게 들면 그 자리는 잡을 수 없다(잡는 턱 자신은 뺀다 — 손가락이 윗면에 닿는 것은 정상).
//   0.10.3까지는 모서리 앞 세 점(openAt)만 봐서, 손 폭(±4.5cm)의 끝이나 손가락이 옆 벽에 드는 자리도 잡았다
export function handFits(world, g) { const H = DIM.grip && DIM.grip.hand; if (!H || !DIM.boxCollide || globalThis.OLDHANDFIT) return true; const F = gripFrame(g), pts = [];
  for (const a of [-H.half, 0, H.half]) { for (const dn of [-0.03, -0.07, -H.palmDown]) for (const o of H.palmOut) pts.push(g.p.clone().addScaledVector(F.t, a).addScaledVector(F.u, dn).addScaledVector(F.n, o));
    for (const b of [0.008, H.fingBack]) for (const up of H.fingUp) pts.push(g.p.clone().addScaledVector(F.t, a).addScaledVector(F.u, up).addScaledVector(F.n, -b)); }
  for (const p of pts) for (const b of world.boxes) { if (b === g.edge.box || b.kind === 'floor') continue; if (Math.min(p.x - b.min.x, b.max.x - p.x, p.y - b.min.y, b.max.y - p.y, p.z - b.min.z, b.max.z - p.z) > 0.005) return false; }
  return true; }
// 팔이 그 자리에 놓일 수 있는가: 어깨가 돌아가는 방향인지, 팔이 벽·턱이나 제 몸을 지나가지 않는지
function armCheck(S, i, sh, goal, n) {
  const B = S.rig.bones, sx = i ? -1 : 1, yaw = S.body.yaw, fwd = V(Math.sin(yaw), 0, Math.cos(yaw)), dir = goal.clone().sub(sh).normalize();
  if (dir.dot(fwd) < CL.SHOULDER_BACK) return '어깨가 돌아가지 않는 방향(등 뒤)';
  // 턱을 등진 채(100° 넘게 돌아선 채)로는 잡지 않는다. 잡은 손 아래에서 몸을 크게 돌리는 동작은 이번 판에 없다
  if (n && !S.climb.on && fwd.dot(n) > -CL.FACE_MIN) return '턱을 등지고 있음(돌아선 뒤에 잡기)';
  // p3d-0.8.5: 팔꿈치 방향은 그림과 같은 함수(heldPole)로 고른다 — 제 몸에 겹치지 않는 쪽이 있으면 그쪽으로 판정한다(팔 교차를 기본 후보 하나로 거부하지 않는다)
  const { ik, self } = heldPole(S, i ? 'R' : 'L', sh, goal, yaw, sx, S.climb.on && S.climb.T ? S.climb.T.qC : null, n || null);
  if (rayHit(S.world, sh.clone().lerp(ik.mid, 0.2), ik.mid) < 1 || rayHit(S.world, ik.mid, ik.mid.clone().lerp(ik.end, 0.9)) < 1) return '팔이 벽·턱을 지나감';
  // 팔뚝: 어느 쪽으로 팔꿈치를 두어도 팔뚝의 줄기가 제 몸에 5mm 넘게 겹치면 그 자리에는 팔을 둘 수 없다(p3d-0.8.5. 전에는 기본 후보의 팔뚝이 엉덩이–목 선 둘레 20 × 13cm 안이거나 머리 가운데에서 11.5cm 안이면 거부했다)
  if (sd(self, 'body') > 0.005) return self.body.head ? '팔이 머리를 지나감' : '팔이 몸통을 지나감';
  // 손목(p3d-0.10.4, 같은 틀): 고른 팔꿈치에서 팔뚝이 오는 쪽과 바라는 손의 방향 사이가 손목이 꺾이는 한계(wristMax)를 넘으면 그 자리는 이 팔로 잡지 못한다(그림은 한계에서 멈춰 손가락이 공중에 섰다)
  if (n && DIM.boxCollide && DIM.grip && DIM.grip.wristMax && !globalThis.OLDWRIST) { const fa = ik.end.clone().sub(ik.mid).normalize(), fd = gripFrame({ n }).fd; const wm = DIM.grip.wristMax + (S.opt && S.opt.grabAssist && !globalThis.NOASSIST ? CL.ASSIST_WRIST : 0); if (fa.angleTo(fd) > wm * Math.PI / 180 + 1e-3) return '손목이 그쪽으로 꺾이지 않음'; }
  // (위팔과 머리도 위의 self에 들어 있다: 귀 옆에 붙는 것 = 가운데 선이 머리 가운데에서 11.5cm까지는 된다)
  return '';
}
// 무릎의 기본 방향: 벽 쪽에서 30° 바깥, 많이 굽힐수록 옆으로(편한 기본값. 허용 판정이 아니다). 무릎이 벽·턱에 들어가면 들어가지 않을 때까지 더 옆으로 돌린다
// 점에서 가장 가까운 상자 겉면까지의 거리(안에 들어가 있으면 음수, 바닥은 뺀다)
// p3d-0.15.1(성능): 클라이밍장은 몸 둘레의 상자가 86개쯤이라 이 함수가 계산 시간의 37%였다(한 걸음 11.7ms — 120Hz의 한도 8.3ms를 넘는다). 한 축으로 이미 m보다 먼 상자는 거리를 재지 않고 넘긴다
//   (세 축 거리의 합성은 가장 큰 축 거리보다 작을 수 없으므로 결과는 같다)
const boxDist = (world, p) => { let m = 9; for (const x of world.boxes) { if (x.kind === 'floor') continue; const dx = Math.max(x.min.x - p.x, 0, p.x - x.max.x); if (dx >= m) continue; const dy = Math.max(x.min.y - p.y, 0, p.y - x.max.y); if (dy >= m) continue; const dz = Math.max(x.min.z - p.z, 0, p.z - x.max.z); if (dz >= m) continue; const out = Math.hypot(dx, dy, dz); m = Math.min(m, out > 0 ? out : -Math.min(p.x - x.min.x, x.max.x - p.x, p.y - x.min.y, x.max.y - p.y, p.z - x.min.z, x.max.z - p.z)); } return m; };
const nearBox = (world, p, m) => world.boxes.some(x => p.x > x.min.x - m && p.x < x.max.x + m && p.y > x.min.y - m && p.y < x.max.y + m && p.z > x.min.z - m && p.z < x.max.z + m);
// 무릎이 굽는 쪽(극 방향의 각 a: 0 = 벽 쪽, 90 = 옆 바깥). p3d-0.9.0: 발이 놓인 자리에서 정한다.
//   0.8.8까지는 다리가 접힐수록 30° → 72°로 바깥을 향했다 — 발이 어디에 있든 같아서, 발이 몸 안쪽(엇갈림)이나 몸 아래에 있을 때 넓적다리가 옆으로 눕고 정강이가 안으로 꺾였다("제기차기").
//   지금: 골반의 틀(골반이 돈 만큼 함께 돈다)에서 발이 고관절보다 바깥에 있으면 그만큼 바깥으로, 안쪽이면 벽 쪽·안쪽으로. 접힐수록 조금 더 바깥. 벽·턱에 닿으면 닿지 않을 때까지만 바깥으로 돌린다(먼저 가까운 각부터).
//   이 각은 이 함수의 방향 값이며 사람 무릎 관절을 잰 각이 아니다. 무릎을 벌리는 자세나 엇갈린 발을 막지 않는다
// 무릎 각 하나를 재는 값(p3d-0.10.2): 바라는 각에서 먼 만큼 + 넓적다리·정강이 앞쪽이 벽·턱에서 kneeClr보다 가까운 만큼(1mm = 2). legIK의 후보 고르기와 함께 고르는 자세(solve)가 같은 식을 쓴다
// 다리끼리의 틈(p3d-0.11.6): 다리 o의 지금 뼈 자리(넓적다리·정강이·발 캡슐) — 반지름은 마네킹 다리 굵기에 맞춘 근사(넓적다리 7cm, 정강이 5cm, 발 4cm)
const LEG_R = { th: 0.07, sh: 0.05, ft: 0.04 };
function otherLeg(S, o) { const B = S.rig.bones, s = o ? 'R' : 'L', T = S.climb.on && S.climb.T, P = n => worldPos(B[n]); return { hip: T ? T.hj[o].clone() : P(`upLeg.${s}`), knee: P(`leg.${s}`), ank: P(`foot.${s}`), toe: P(`toe.${s}`) }; }
function closestOnSeg(a, b, p) { const ab = b.clone().sub(a), t = clamp(p.clone().sub(a).dot(ab) / Math.max(ab.lengthSq(), 1e-9), 0, 1); return a.clone().addScaledVector(ab, t); }
function legGap(hj, knee, ank, o) { const toe = null; let g = 9;
  for (const [p, q, r] of [[hj.clone().lerp(knee, 0.35), knee, LEG_R.th], [knee, ank, LEG_R.sh]]) for (const [p2, q2, r2] of [[o.hip.clone().lerp(o.knee, 0.35), o.knee, LEG_R.th], [o.knee, o.ank, LEG_R.sh], [o.ank, o.toe, LEG_R.ft]]) g = Math.min(g, segSeg(p, q, p2, q2).length() - r - r2);
  return g; }
// p3d-0.15.1(성능): 무릎 각을 고를 때(다리마다 걸음마다 50~80번) 재는 점은 모두 고관절에서 넓적다리 + 정강이의 1/4 안에 있고, 값에는 kneeClr보다 가까운 것만 들어간다(max(0, kneeClr − 거리)).
//   그래서 고관절 둘레 그 거리 안의 상자만 추려 넘겨도 값이 같다(추린 것 밖의 상자는 kneeClr보다 멀다). 클라이밍장에서 한 걸음 7.4 → 약 5ms
const kneeBoxes = (S, hj) => { const r = DIM.thigh + 0.25 * DIM.shin + DIM.kneeClr + 0.02; return { boxes: S.world.boxes.filter(x => x.kind !== 'floor' && hj.x > x.min.x - r && hj.x < x.max.x + r && hj.y > x.min.y - r && hj.y < x.max.y + r && hj.z > x.min.z - r && hj.z < x.max.z + r) }; };
function kneeEval(S, hj, ank, sx, py, a, W = S.world) { const pl = V(sx * Math.sin(a * deg), 0.1, Math.cos(a * deg)).applyAxisAngle(UP, py).normalize(), k2 = twoBone(hj, ank, DIM.thigh, DIM.shin, pl);
  const dist = DIM.boxCollide ? Math.min(...[0.45, 0.7, 1].map(t => boxDist(W, hj.clone().lerp(k2.mid, t))), boxDist(W, k2.mid.clone().lerp(k2.end, 0.25))) : boxDist(W, k2.mid); return { ik: k2, pole: pl, dist }; }
// ㉮ 규칙의 바라는 무릎 각: 높이 디딘(디디러 가는) 발은 30~40°, 서 있는 낮은 발은 10°
// 디딘·가는 다리가 바라는 무릎 각(도, 골반 틀: 0 = 앞, + = 바깥) — legIK0의 고르기와 전신 자세 풀이(fbik의 무릎 여유)가 같은 값을 쓴다(p3d-0.11.7)
// 엇갈린 정도(0~1): 발목이 고관절에서 몸 안쪽으로 10cm 넘게 가면 늘기 시작해 22cm에서 1
const crossK = (sx, hj, ank, py) => { if (globalThis.OLDCROSSKNEE) return 0; const d = ank.clone().sub(hj), ox = sx * (d.x * Math.cos(py) - d.z * Math.sin(py)); return clamp((-ox - 0.10) / 0.12, 0, 1); };
function kneeWant(S, sx, hj, ank, py) { const bend = clamp((1 - hj.distanceTo(ank) / DIM.leg - 0.05) / 0.35, 0, 1); let a0 = kneeA0(S, sx, ank, bend); const K = S.climb, cr = globalThis.OLDCROSSKNEE ? 0 : K.crS ? K.crS[sx > 0 ? 0 : 1] : crossK(sx, hj, ank, py); if (cr > 0) a0 = lerp(a0, CL.CROSS_A0, cr); return a0; }
function kneeA0(S, sx, ank, bend) { const K = S.climb, i = sx > 0 ? 0 : 1, F = K.feet[i], O = K.feet[1 - i], oy = O.st === 'plant' ? O.ank.y : S.body.pos.y + DIM.ankleY, high = ank.y - oy > 0.10 || (F.st === 'move' && F.box && F.box.kind !== 'floor'); return high ? 30 + 10 * bend : 10; }
// 사람 관절의 범위(p3d-0.11.1, src/anat.js)를 쓰는가: 사람형 몸에서만. 끄기 = 시험 스위치 NOANAT
const anatOn = () => DIM.boxCollide && !globalThis.NOANAT, qArr = q => [q.x, q.y, q.z, q.w], vArr = v => [v.x, v.y, v.z];
const pelvisQ = S => (S.climb.on && S.climb.T ? S.climb.T.tq.hips : Q().setFromAxisAngle(UP, S.body.yaw));
// 다리 IK: 무릎이 굽는 쪽을 사람 다리의 범위 안에서 고른다(넓적다리의 방향 + 비틀림: 바깥 85°, 안쪽 40°). 디딘·가는 다리는 후보를 고를 때 범위를 값에 넣고(legIK0), 늘어뜨린 다리는 고른 뒤에 범위 안으로 누른다. 판정·그림 모두 이 함수를 쓴다
function legIK(S, hj, ank, yaw, sx, placed = true, fixed = false) {
  const r = legIK0(S, hj, ank, yaw, sx, placed, fixed); if (!anatOn() || r.picked) return r;
  const c = clampKnee(qArr(pelvisQ(S)), vArr(hj), vArr(ank), vArr(r.pole), sx, DIM.thigh, DIM.shin); if (!c.moved) return r;
  const pole = V(c.pole[0], c.pole[1], c.pole[2]); return { ...r, ik: twoBone(hj, ank, DIM.thigh, DIM.shin, pole), pole, kneeOver: Math.abs(c.moved) };
}
// 고관절이 범위를 넘은 각(rad. 안이면 음수): 지금 골반에서 그 발목 자리로 다리를 놓았을 때
//   골반의 틀로 잰 것과, 몸이 보는 쪽의 곧은 틀로 잰 것에서 골반이 기울고 돌아 도와줄 수 있는 몫(PELVIS_ALLOW)을 뺀 것 가운데 큰 쪽 — 골반을 한껏 기울여 범위에 맞춘 자세(옆으로 일자로 벌린 다리)를 받아들이지 않는다
const legOver = (S, hj, knee, ank, sx) => Math.max(legExcess(qArr(pelvisQ(S)), vArr(hj), vArr(knee), vArr(ank), sx), legExcess(qArr(Q().setFromAxisAngle(UP, S.body.yaw)), vArr(hj), vArr(knee), vArr(ank), sx) - CL.PELVIS_ALLOW);
function hipOver(S, i, hj, ank) { const sx = i ? -1 : 1, r = legIK(S, hj, ank, S.body.yaw, sx); return legOver(S, hj, r.ik.mid, ank, sx); }
// 디딘 채로 버틸 수 있는가(걸음마다): 골반의 틀과 곧은 틀 둘 다에서 넘을 때만 넘은 것으로 본다(골반이 돌아와 풀 수 있는 넘침으로는 발을 떼지 않는다 — 옛 규칙의 골반 층은 관절을 보지 않고 돌아서, 곧은 틀로는 멀쩡한 다리가 골반의 틀로 30° 넘게 재져 다른 벽 장면의 디딘 발이 떨어졌다)
function hipHold(S, i, hj, ank) { const sx = i ? -1 : 1, r = legIK(S, hj, ank, S.body.yaw, sx), a = [vArr(hj), vArr(r.ik.mid), vArr(ank), sx], P = legExcess(qArr(pelvisQ(S)), ...a), B = legExcess(qArr(Q().setFromAxisAngle(UP, S.body.yaw)), ...a); return Math.max(Math.min(P, B), B - CL.PELVIS_ALLOW); }
function legIK0(S, hj, ank, yaw, sx, placed = true, fixed = false) {
  // 새 규칙은 디딘 발과 보내는 발에만 쓴다(placed). 늘어뜨린 발·뛰는 중에 접어 올린 다리는 발이 고관절 바로 아래를 오가서 "발의 자리"가 뜻이 없다(해 보니 한 걸음 튐이 캡처 동작에서 65 → 166회로 늘었다) → 0.8.8의 규칙 그대로
  // (p3d-0.10.1에서 늘어뜨린 다리에도 여유로 무릎 방향을 고르게 해 봤으나 관통이 6 → 7.1cm로 늘고 디딘 다리가 초속 317°로 튀어 되돌렸다)
  const bend = clamp((1 - hj.distanceTo(ank) / DIM.leg - 0.05) / 0.35, 0, 1), K = S.climb, np = poseOn(K) && K.on && placed;
  let ik, pole;
  if (np) { const py = yaw + K.po.yaw, d = ank.clone().sub(hj), ox = sx * (d.x * Math.cos(py) - d.z * Math.sin(py)), fz = d.x * Math.sin(py) + d.z * Math.cos(py);
    // 거의 편 다리는 무릎의 쪽이 정해지지 않는다(늘어뜨린 발이 조금만 흔들려도 각이 크게 바뀐다) → 접힌 만큼만 발의 자리를 따른다
    let a0 = clamp(26 - 6 * bend + 0.75 * clamp((bend - 0.08) / 0.30, 0, 1) * Math.atan2(ox, Math.max(fz, 0.12)) / deg, -35, 85);
    // ㉮ 규칙(p3d-0.10.1, 사람형 몸): 무릎을 여는 각을 발의 역할로 — 높이 디딘(디디러 가는) 발은 30~40°, 서 있는 낮은 발은 10°. 0.10.0까지는 발이 옆으로 나간 만큼 열어 높은 발이 50~80°(개구리), 엇갈린 발은 안쪽 −45~−69°였다(참고 색인: 높은 발 가운데 38°, 낮은 발 0°)
    //   벽·턱과의 여유는 그대로 값에 들어간다(아래). 엇갈려 디딘 발도 바깥 쪽 바람으로 두고 여유가 모자라면 그 값이 정한다
    if (K.post !== 'base' && DIM.boxCollide) { const i = sx > 0 ? 0 : 1, F = K.feet[i], O = K.feet[1 - i], oy = O.st === 'plant' ? O.ank.y : S.body.pos.y + DIM.ankleY, high = ank.y - oy > 0.10 || (F.st === 'move' && F.box && F.box.kind !== 'floor');
      // p3d-0.11.7(자세 정리 ①): 발이 몸 가운데를 넘어 엇갈려 디뎌지면(ox < −10cm) 무릎을 바깥으로 열지 않고 앞(벽 쪽, CROSS_A0)으로 둔다(kneeWant) — 바깥으로 열면 정강이가 몸 앞을 가로지르는 "4자·개구리" 모양이 되고 디딘 다른 넓적다리와 부딪혔다(posture_audit ①②).
      //   0.10.0처럼 안쪽으로 크게 꺾지는 않는다(−45~−69°는 그것대로 어색했다). 앞으로 둔 무릎이 벽에 닿지 않게 엉덩이를 빼는 것은 전신 자세 풀이가 한다(같은 바람을 넘긴다)
      a0 = kneeWant(S, sx, hj, ank, py);
      if (K.post === 'ref' && K.refT && K.refT.knee[i] !== null) a0 = a0 * (1 - K.refT.w) + (K.refT.knee[i] - sx * K.po.yaw / deg) * K.refT.w; }
    const list = [0, 12, 24, 36, 48, 60, 75, 90, -15, -30].map(x => a0 + x).filter(a => a <= 115 && a >= -50);
    // 후보(5°마다)마다 값을 매겨 가장 싼 것을 고른다(p3d-0.9.0 고침): 바라는 각(a0)에서 먼 만큼 + 지금 굽어 있는 쪽에서 먼 만큼 + 무릎이 벽·턱에서 6cm보다 가까운 만큼(실제 거리. 1cm = 8°).
    //   처음에는 "닿지 않는 후보(5cm) 가운데 고르고, 없으면 가장 덜 닿는 것"이었다. 발판에 올라서며 엉덩이가 벽 10cm까지 다가가면 모든 후보가 5cm 안이 되고, 후보끼리 거의 같아 걸음마다 먼 쪽으로 바뀌어
    //   무릎이 0.06초 사이에 반대쪽으로 넘어갔다(초속 11m — 사용자가 영상 21초쯤에서 짚었다. 장면을 0.1초 간격으로 뽑아 본 그림에서는 놓쳤다). 지금 쪽에서 먼 만큼을 값에 넣어 이어지게 한다
    // 함께 고르는 자세(solve, p3d-0.10.2 실험 설정): 계산 걸음에서 골반과 함께 고른 각을 그대로 쓴다(poseClimb에서만. 미리보기 판정은 아래의 후보 고르기)
    if (fixed && K.post === 'solve' && K.knA && K.knA[sx > 0 ? 0 : 1] !== null && K.knA[sx > 0 ? 0 : 1] !== undefined) { const c = kneeEval(S, hj, ank, sx, py, K.knA[sx > 0 ? 0 : 1]); return { ik: c.ik, pole: c.pole }; }
    const PS0 = S.poleS && S.poleS['kn' + (sx > 0 ? 'L' : 'R') + 'p'], aCur = PS0 ? (() => { const l = PS0.clone().applyAxisAngle(UP, -py); return Math.atan2(sx * l.x, l.z) / deg; })() : a0; let best = null;
    // p3d-0.11.1: 사람 다리의 범위(넓적다리의 방향·비틀림)를 넘는 만큼도 값에 넣는다(1° = 4). 고른 뒤에 범위 안으로 누르면(첫 시도) 눌린 무릎이 벽·발판을 지나가 발 디딤이 "다리가 벽·턱을 지나감"으로 거부됐다 — 여유와 범위를 함께 따져 고른다
    const qH = anatOn() ? qArr(pelvisQ(S)) : null, hjA = vArr(hj), anA = vArr(ank);
    // p3d-0.11.6(사용자 "오른발이 왼발을 관통하면서 빠져나온다"): 다른 다리(넓적다리·정강이·발)와의 틈이 LEGX_CLR보다 좁은 만큼도 값에 넣는다(1cm = 15°). 다른 다리의 자리는 그 다리의 지금 뼈(앞 걸음의 자세)
    const oL = DIM.boxCollide && !globalThis.OLDLEGX && !globalThis.NOLX_KNEE && K.feet[sx > 0 ? 0 : 1].st === 'move' ? otherLeg(S, sx > 0 ? 1 : 0) : null; // 가는 다리만(디딘 무릎까지 다른 다리를 보게 하면 가는 발이 돌아가는 동안 디딘 무릎이 22mm 오갔다 — motion_scan v2)
    const WK = globalThis.OLDKNEEBOX ? S.world : kneeBoxes(S, hj);
    const evalA = a => { const c = kneeEval(S, hj, ank, sx, py, a, WK), sc = Math.abs(a - a0) + 0.6 * Math.abs(a - aCur) + (K.post !== 'base' && DIM.boxCollide ? 2000 : 800) * Math.max(0, DIM.kneeClr - c.dist) + (qH ? 4 * Math.max(0, kneeExcess(qH, hjA, vArr(c.ik.mid), anA, sx)) / deg : 0) + (oL ? 1500 * Math.max(0, CL.LEGX_CLR - legGap(hj, c.ik.mid, ank, oL)) : 0); return { ...c, sc, a }; };
    for (let a = -50; a <= 115; a += 5) { const c = evalA(a); if (globalThis.__KT) globalThis.__KT.push({ sx, a, sc: c.sc, dist: c.dist }); if (!best || c.sc < best.sc) best = c; }
    // p3d-0.10.2(GPT의 0.10.1 검토 1번 — h3의 디딘 무릎 흔들림): 5° 격자에서 고른 각을 그대로 쓰면, 골반의 틀이 돌 때(손이 턱의 옆면을 잡아 몸이 초속 172°로 돈다) 세계 좌표의 바람이 +1.5°·+1.5°·−3.5°의 톱니가 되어
    //   무릎이 3걸음마다 ±15mm 왕복했다(knee_trace). 고른 격자점 둘레 ±5°에서 값이 가장 낮은 각을 연속으로 찾아 쓴다(황금 분할 10번 → 0.1° 안). 새 규칙에만(0.10.0 규칙과 옛 몸은 그대로)
    //   그리고 지금 굽은 쪽(aCur) 둘레에서도 같은 방법으로 찾는다. 두 벽 사이의 좁은 여유(능선)에 무릎이 끼어 있다가 능선이 낮아지면 격자의 가장 싼 점이 다른 쪽(9° 떨어진 곳)으로 넘어가 바람이 한 걸음에 뛰었다(v3, 초속 318°).
    //   지금 쪽의 해가 격자 쪽보다 KNEE_HYST만큼 비쌀 때만 넘어간다(넘어갈 때는 한계 빠르기로 돈다)
    if (K.post !== 'base' && DIM.boxCollide) { const gold = (lo, hi) => { const g = 0.381966; let x1 = lo + g * (hi - lo), x2 = hi - g * (hi - lo), f1 = evalA(x1), f2 = evalA(x2);
        for (let it = 0; it < 10; it++) { if (f1.sc <= f2.sc) { hi = x2; x2 = x1; f2 = f1; x1 = lo + g * (hi - lo); f1 = evalA(x1); } else { lo = x1; x1 = x2; f1 = f2; x2 = hi - g * (hi - lo); f2 = evalA(x2); } }
        return f1.sc <= f2.sc ? f1 : f2; };
      let c = gold(best.a - 5, best.a + 5); if (c.sc < best.sc) best = c;
      if (PS0) { const lc = gold(Math.max(-50, aCur - 5), Math.min(115, aCur + 5)); if (lc.sc <= best.sc + CL.KNEE_HYST) best = lc; } }
    if (globalThis.__KT) globalThis.__KT.push({ sx, pick: best.a, a0, aCur, bend, sc: best.sc, dist: best.dist });
    return { ik: best.ik, pole: best.pole, picked: true }; }
  // p3d-0.11.2(사용자 영상: 발을 떼고 매달리면 다리가 O자로 벌어짐 — 늘어뜨린 무릎이 바깥으로 30°, 무릎 간격 29cm > 엉덩이 폭 18cm): 사람형 몸의 늘어뜨린 다리는 무릎이 거의 앞(벽 쪽)을 본다(8° → 많이 접으면 30°).
  //   늘어뜨린 다리(placed = false)에만 — 옛 규칙 비교(OLDPOSE)에서 옮기는 다리도 이 갈래를 써서 처음에는 그 모양까지 바뀌었다. 0.11.1까지는 30°(조금 굽힘) ~ 72°(많이 굽힘). 지형에 닿으면 아래 후보 차례로 바깥으로 돈다(그대로)
  const a0 = DIM.boxCollide && !globalThis.OLDFREEKNEE && !placed ? lerp(8, 30, bend) : lerp(30, 72, bend);
  for (const a of [a0, 60, 80, 95, 110, 10, -15]) { if (a > 0 && a < a0) continue; pole = V(sx * Math.sin(a * deg), 0.1, Math.cos(a * deg)).applyAxisAngle(UP, yaw).normalize(); ik = twoBone(hj, ank, DIM.thigh, DIM.shin, pole); if (!nearBox(S.world, ik.mid, 0.05)) break; }
  return { ik, pole };
}
// ── 함께 고르는 자세(p3d-0.10.2 실험 설정 posture=solve. GPT의 0.10.1 검토 1번 "골반의 허용된 이동·회전, 가슴 방향, 무릎 방향을 같은 접촉·길이·충돌·시간 연속성 아래 함께 고르는 제한된 자세 구조 실험") ──
// 규칙(rule)은 골반의 목표를 정한 뒤 스프링으로 따라가고, 무릎은 그 골반에 맞춰 따로 고른다. 여기서는 골반(옆·앞뒤·돌림)과 디딘·가는 다리의 무릎 각을 한 비용으로 함께 고른다:
//   ① 골반: 규칙이 정한 목표로 가는 부드러운 기준 경로(스프링, 반감기 SV.hl)에서 벗어난 만큼(4mm = 1, 1.5° = 1의 제곱). 한 걸음에 기준에서 3mm·1.5°까지만 벗어난다
//   ② 무릎: 바라는 각에서 먼 만큼 + 넓적다리·정강이의 벽 여유(legIK와 같은 식, kneeEval) + 앞 걸음의 각에서 바뀐 만큼의 제곱(1° = 1). 한 걸음에 바뀌는 각은 초속 200°까지
//   ③ 잡은 손까지 어깨가 팔 길이의 97%(또는 기준 경로의 자세가 이미 그보다 멀면 그 거리)를 넘는 만큼(1mm = 3. 골반이 움직이면 윗몸이 반대로 기울어 어깨가 옮겨 간다 — 가슴 방향은 이 몫으로 함께 정해진다)
// 몸의 기준 자리(b.pos)·손발의 접촉·물리의 힘은 건드리지 않는다(골반의 층과 무릎 방향만). 팔꿈치는 지금처럼 따로 고른다(heldPole·pickPole) — 이번 실험의 범위 밖이다. 값은 모두 실험값
const SV = { hl: 0.2, dP: 0.003, dY: 1.5 * Math.PI / 180, va: 200, sP: 0.004, sY: 1.5 * Math.PI / 180, wArm: 3000 };
function solvePose(S, K, T, held, dt) {
  const b = S.body, P = K.po, legs = K.feet.filter(f => f.st !== 'free');
  if (!K.knA) K.knA = [null, null];
  for (const f of K.feet) if (f.st === 'free') K.knA[f.i] = null;
  const T0 = torso(b, K);
  for (const f of legs) if (K.knA[f.i] === null) { const sx = f.i ? -1 : 1, ank = f.st === 'plant' ? f.ank : f.a, hj = T0.hj[f.i], PS0 = S.poleS && S.poleS['kn' + f.s + 'p'], py = b.yaw + P.yaw; // 새로 붙은 다리는 지금 굽은 쪽에서 출발
    K.knA[f.i] = PS0 ? (() => { const l = PS0.clone().applyAxisAngle(UP, -py); return Math.atan2(sx * l.x, l.z) / deg; })() : kneeA0(S, sx, ank, clamp((1 - hj.distanceTo(ank) / DIM.leg - 0.05) / 0.35, 0, 1)); }
  // 부드러운 기준(규칙과 같은 스프링을 한 걸음 미리 돌려 본 값)
  const R = { x: P.x, xV: P.xV || 0, z: P.z, zV: P.zV || 0, yaw: P.yaw, yawV: P.yawV || 0 }; springS(R, 'x', T.x, SV.hl, dt); springS(R, 'z', T.z, SV.hl, dt); springS(R, 'yaw', T.yaw, SV.hl, dt);
  const x0 = [R.x, R.z, R.yaw, K.knA[0] ?? 0, K.knA[1] ?? 0], prevA = [K.knA[0] ?? 0, K.knA[1] ?? 0], box = [SV.dP, SV.dP, SV.dY, SV.va * dt, SV.va * dt], ctr = [R.x, R.z, R.yaw, prevA[0], prevA[1]];
  // 팔 길이: 기준 경로의 자세보다 더 늘어나는 만큼만 센다(이미 팔을 다 편 매달림에서 97%를 넘는 것 자체를 벌하면 골반이 벽 쪽에 묶여 무릎이 75°로 벌어졌다 — h3)
  P.x = R.x; P.z = R.z; P.yaw = R.yaw; const TR = torso(b, K), dR = held.map(h => Math.max(0.97 * CL.ARM, TR.sh[h.i].distanceTo(h.goal)));
  const cost = x => { P.x = x[0]; P.z = x[1]; P.yaw = x[2]; const Tn = torso(b, K), py = b.yaw + x[2]; let c = ((x[0] - R.x) / SV.sP) ** 2 + ((x[1] - R.z) / SV.sP) ** 2 + ((x[2] - R.yaw) / SV.sY) ** 2;
    for (const f of legs) { const sx = f.i ? -1 : 1, ank = f.st === 'plant' ? f.ank : f.a, hj = Tn.hj[f.i], bend = clamp((1 - hj.distanceTo(ank) / DIM.leg - 0.05) / 0.35, 0, 1), a = x[3 + f.i], e = kneeEval(S, hj, ank, sx, py, a);
      c += Math.abs(a - kneeA0(S, sx, ank, bend)) + 2000 * Math.max(0, DIM.kneeClr - e.dist) + (a - prevA[f.i]) ** 2; }
    held.forEach((h, k) => { c += SV.wArm * Math.max(0, Tn.sh[h.i].distanceTo(h.goal) - dR[k]); });
    return c; };
  let x = x0.slice(), best = cost(x); const act = [0, 1, 2, ...legs.map(f => 3 + f.i)];
  for (let r = 0; r < 5; r++) { const fr = 1 / (1 << r); for (const k of act) for (const sg of [1, -1]) { const y = x.slice(); y[k] = clamp(y[k] + sg * box[k] * fr * 0.5, ctr[k] - box[k], ctr[k] + box[k]); if (y[k] === x[k]) continue; const c = cost(y); if (c < best) { best = c; x = y; } } }
  P.xV = R.xV; P.zV = R.zV; P.yawV = R.yawV; // 기준 스프링의 빠르기를 잇는다(벗어난 몫은 빠르기에 넣지 않는다 — 넣으면 기준이 스스로 커져 엉덩이가 25cm까지 빠졌다. 해 봄)
  P.x = x[0]; P.z = x[1]; P.yaw = x[2];
  for (const f of legs) K.knA[f.i] = x[3 + f.i];
  if (globalThis.__KT) globalThis.__KT.push({ solve: x.slice(), cost: best, ref: [R.x, R.z, R.yaw] });
}
// 상자가 보는 쪽(p3d-0.10.3): 다른 상자에 막히지 않은 옆면 가운데 가장 넓은 면의 바깥 법선(수평). 턱 A는 앞면(+z), 모서리 벽은 −x 면. 고른 면이 잡은 면의 법선과 반대쪽이면(뒤에서 잡음) 잡은 면을 쓴다
const FACING = new WeakMap();
function boxFacing(world, box, fallback, from = null) { if (box.face && !globalThis.NOBOXFACE) return box.face.clone(); if (FACING.has(box)) return FACING.get(box).clone(); // box.face = 지형 자료에 적은 벽의 방향(p3d-0.10.4)
  const c = box.min.clone().add(box.max).multiplyScalar(0.5), sz = box.max.clone().sub(box.min), cand = [];
  for (const [n, a] of [[V(1, 0, 0), sz.z * sz.y], [V(-1, 0, 0), sz.z * sz.y], [V(0, 0, 1), sz.x * sz.y], [V(0, 0, -1), sz.x * sz.y]]) { const p = c.clone().add(V(n.x * (sz.x / 2 + 0.02), 0, n.z * (sz.z / 2 + 0.02))); if (!world.boxes.some(b => b !== box && b.kind !== 'floor' && p.x > b.min.x && p.x < b.max.x && p.y > b.min.y && p.y < b.max.y && p.z > b.min.z && p.z < b.max.z)) cand.push([n, a]); }
  // p3d-0.10.4: 넓이가 같으면 몸이 있는 쪽 면(from = 몸 자리) → 잡은 면 쪽 순서
  //   네 옆면이 모두 열린 상자(붙은 벽이 없는 혼자 선 턱·기둥)는 넓이로 정하지 않고 몸이 있는 쪽 면을 본다(p3d-0.10.4 — 붙은 벽이 없으니 "벽이 보는 쪽"이 없다. 끝에 서서 끝을 잡으면 끝 쪽을 본다)
  const fb = fallback.clone().setY(0), fr = from ? from.clone().sub(c).setY(0) : null;
  if (cand.length === 4 && fr && fr.lengthSq() > 1e-6 && !globalThis.OLDTIE) { const fn = fr.clone().normalize(), hx = sz.x / 2, hz = sz.z / 2, side = n => (n.x ? Math.max(0, Math.abs(fr.x) - hx) * Math.sign(fr.x) * n.x : Math.max(0, Math.abs(fr.z) - hz) * Math.sign(fr.z) * n.z); cand.sort((a, b) => side(b[0]) - side(a[0]) || b[0].dot(fn) - a[0].dot(fn)); return cand[0][0].clone(); }
  cand.sort((a, b) => b[1] - a[1] || (fr && !globalThis.OLDTIE ? b[0].dot(fr) - a[0].dot(fr) : 0) || b[0].dot(fb) - a[0].dot(fb)); const f = cand.length ? cand[0][0] : fb.normalize(); if (cand.length < 2 || cand[0][1] > cand[1][1] + 1e-9) FACING.set(box, f); return f.clone(); } // 넓이가 같은 면이 둘이면(양쪽이 열린 벽) 잡은 면 쪽을 고르고 기억하지 않는다
function legCheck(S, i, hj, ank, tol = CL.HIP_TOL) {
  const { ik } = legIK(S, hj, ank, S.body.yaw, i ? -1 : 1);
  // 사람 관절의 범위(p3d-0.11.1): 고관절이 그만큼 올라가거나 벌어지지 않으면, 또는 다리를 그만큼 접을 수 없으면 그 자리에는 발을 둘 수 없다(전에는 닿기만 하면 머리 높이의 벽면에도 발을 댔다)
  if (anatOn()) { if (legOver(S, hj, ik.mid, ank, i ? -1 : 1) > tol) return '다리가 그렇게는 올라가지 않음'; if (hj.distanceTo(ank) < legMin(DIM.thigh, DIM.shin) - 0.01) return '다리를 그만큼 접을 수 없음'; }
  return nearBox(S.world, ik.mid, 0.03) || rayHit(S.world, hj.clone().lerp(ik.mid, 0.2), ik.mid) < 1 || rayHit(S.world, ik.mid, ik.mid.clone().lerp(ik.end, 0.85)) < 1 ? '다리가 벽·턱을 지나감' : '';
}

// p3d-0.11.2(사용자 영상: 한 손으로 턱 B에 매달린 채 오른쪽 아래의 턱 E를 잡으면 잡자마자 0.1초 뒤 "당기는 방향이 턱에서 벗어남"으로 놓치기를 7번 되풀이): 잡는 순간에 이미 미끄러질 자세면 잡지 않고 까닭을 알린다.
//   다른 손으로 매달려 몸이 거의 멈춰 있을 때만(흔들어 뛰며 잡는 손은 몸이 그 아래로 가므로 막지 않는다 — 처음에는 가르지 않아 턱 B → E의 흔들어 뛰어 잡기가 모두 막혔다).
//   조건은 놓침 판정(아래 held 고리)과 같다 — 팔이 85% 넘게 펴져(잡은 뒤 몸이 조금만 흔들려도 팽팽해져 하중을 받는다. 93%로 두었을 때는 92%로 잡은 손이 곧 팽팽해져 놓쳤다) 당기는 방향이 턱이 버티는 범위(GRIP_ANG) 밖이고, 하중을 받는 발이 없다(발이 받치면 그 손의 하중이 작아 미끄러지지 않는다)
// 몸 아래(수평 자리)에서 가장 높은 지형 윗면의 높이(없으면 0)
function groundBelow(world, p) { let y = 0; for (const x of world.boxes) if (p.x > x.min.x && p.x < x.max.x && p.z > x.min.z && p.z < x.max.z && x.max.y <= p.y + 0.05) y = Math.max(y, x.max.y); return y; }
function sidePull(S, i, sh, goal, n) { const K = S.climb; if (!K.on || globalThis.OLDSIDEPULL || !K.hands.some((o, j) => j !== i && o.st === 'hold') || S.body.vel.length() > 0.6 || sh.distanceTo(goal) < 0.85 * CL.ARM || K.feet.some(f => f.st === 'plant' && (f.load || 0) > 0.15)) return '';
  const pull = sh.clone().sub(goal).normalize(), down = -pull.y, out = Math.max(0, pull.dot(n)), lat = pull.clone().addScaledVector(n, -pull.dot(n)).setY(0).length();
  return down > 0.05 && Math.hypot(out, lat) / down > Math.tan(CL.GRIP_ANG + 3 * deg) ? '팔이 옆으로 당겨져 버틸 수 없음' : ''; }
// 손 i가 지금 잡은 자리를 놓고 goal로 뻗을 때 어깨가 옮겨 가는 만큼(전신 자세 풀이에서만. 그 밖에는 0). 같은 계산 걸음·같은 목표는 다시 풀지 않는다
function reachShift(S, i, goal) { const K = S.climb, fb = K.fb, c = fb && fb.ctx; if (globalThis.OLDPROBE || !K.on || !fbOn(K) || !c || K.hands[i].st !== 'hold') return V();
  const key = `${K.tick}|${i}|${goal.x.toFixed(3)},${goal.y.toFixed(3)},${goal.z.toFixed(3)}`; if (K.rsKey && K.rsKey[i] === key) return K.rsVal[i].clone();
  const yaw = S.body.yaw, left = V(Math.cos(yaw), 0, -Math.sin(yaw)), fwd = V(Math.sin(yaw), 0, Math.cos(yaw)), A = fbAims(S, K.hands.filter(h => h.st === 'hold' && h.i !== i), left, fwd);
  const c2 = { ...c, axis: [A.ax.x, A.ax.y, A.ax.z], yawT: A.yawT + (K.aim ? K.aim.y : 0), arms: c.arms.map((a, j) => (j === i ? { st: 2, goal: [goal.x, goal.y, goal.z], w: 1 } : a)), shr: c.shr.map((v, j) => (j === i ? (goal.y > S.body.pos.y + 1.4 ? 0.40 : 0) : c.arms[j].st === 1 ? 0 : v)) };
  // p3d-0.15.1(GPT 검토의 재현: 초록 3을 잡고 초록 4를 겨누면 "19cm 모자람"인데 눌러 보면 몸이 2mm도 움직이지 않고 0.26초 만에 잡았다): 6번만 풀어서는 자세가 다 바뀌지 않는다
  //   (풀이 한 걸음이 옮기는 양이 FBW.step = 0.025로 묶여 있어, 어깨가 29cm 올라가는 자세까지 30번쯤 걸리는데 6번째의 6cm만 보았다).
  //   뻗어 본 자세는 시간에 따라 움직이는 것이 아니므로 걸음을 크게(0.12) 주고, 어깨가 한 번에 1.5mm 아래로 움직일 때까지 푼다(16번까지. 재 본 사례: 9번에 끝 자세와 4mm, 걸린 시간은 6번 풀 때와 비슷). OLDPROBE6 = 6번만
  const a = fbFK(fb.xs, c.pos, c.yaw).sh[i], xs = Float64Array.from(fb.xs); let b2 = a;
  if (globalThis.OLDPROBE6) { fbSolve(xs, c2, 6); b2 = fbFK(xs, c.pos, c.yaw).sh[i]; } else for (let it = 0; it < 16; it++) { fbSolve(xs, c2, 1, 0.12); const q = fbFK(xs, c.pos, c.yaw).sh[i], m = Math.hypot(q[0] - b2[0], q[1] - b2[1], q[2] - b2[2]); b2 = q; if (m < 0.0015) break; }
  const v = V(b2[0] - a[0], b2[1] - a[1], b2[2] - a[2]);
  (K.rsKey = K.rsKey || [])[i] = key; (K.rsVal = K.rsVal || [])[i] = v.clone(); return v; }
// ── 뻗기 전 검사(p3d-0.15.5, GPT의 0.15.4 검토 단계 B: "움직이기 전에 자세와 이동 경로를 검사하는 작은 실험") ──
// 손 i를 goal로 보내면 버티는 손이 제 몸에 걸려 놓치는가를 손을 떼기 전에 본다. 몸의 자리·발·다른 손은 그대로 둔다(큰 몸 이동은 보지 않는다 — 범용 계획기가 아니다). 판정은 물리와 같은 함수(armCheck)다.
//   ① 뻗는 동안: 풀이 문맥을 "이 손이 그 턱으로 뻗는 중"으로 바꿔 끝 자세를 풀고(미리보기 reachShift와 같은 방식: 큰 걸음으로 16번까지),
//      풀이 값이 실제 한 걸음의 한도(FBW.step)로 그 자세까지 가고 쓰는 값이 그것을 뒤따르는 지연(stepFB와 같은 식)을 계산 걸음마다 따라가며 네 걸음마다(1/30초) 버티는 손의 armCheck를 부른다 — 끝 자세만 보지 않는다
//   ② 잡은 뒤(닿을 때만): "그 턱도 잡음"으로 바꿔 같은 식으로 PLAN_T2초 더(새 손도 본다) — 새 손을 잡은 뒤 자세가 자리를 잡으며 옛 팔이 걸리는 것
//   걸림이 물리가 놓치는 시간(0.15초)만큼 이어지면 그 손을 놓친다고 본다. prot = 버티는 팔을 지키는 풀이 항(fbik heldPen)을 처음부터 켠 후보(전신 연결 켬에서만 뜻이 있다)
//   처음에는 stepFB를 걸음마다 그대로 굴렸다(가장 충실하다). 한 번에 계산 걸음 12~45개의 시간이 들어 명령을 누른 프레임이 멈췄다 → 끝 자세 + 지연으로 바꿨다. PLAN_FULL = 처음 방식(비교용)
// 돌려주는 값: lose = 놓칠 손(-1 = 없음) · when = 'reach'|'settle' · t = 그때(초) · why · jam = 손별로 가장 길게 이어진 걸림(초) · dev = 가슴이 시작 자세에서 가장 크게 벗어난 각(rad: 돌림·앞뒤·옆) · far = ① 끝의 어깨–목표 거리 − 팔 길이(양수 = 모자람) · ms
// 상태를 바꾸지 않는다(K.fb·K.T·그 손의 상태를 잠깐 바꿔 재고 되돌린다). 스위치: PLAN_T2
export function planReach(S, i, goal, prot = false) {
  const K = S.climb, fb = K.fb, c = fb && fb.ctx, b = S.body; if (!K.on || !fbOn(K) || !c || !K.T) return null;
  const sup = K.hands.filter(h => h.i !== i && h.st === 'hold'); if (!sup.length) return null;
  const t00 = typeof performance !== 'undefined' ? performance.now() : 0, yaw = b.yaw, left = V(Math.cos(yaw), 0, -Math.sin(yaw)), fwd = V(Math.sin(yaw), 0, Math.cos(yaw)), dt = 1 / 120, a3 = v => [v.x, v.y, v.z], H = K.hands[i], FULL = !!globalThis.PLAN_FULL, EV = FULL ? 2 : 4;
  const f2 = { xs: Float64Array.from(fb.xs), x: Float64Array.from(fb.x), v: Float64Array.from(fb.v), hang: fb.hang, sup: fb.sup, cost: fb.cost, axis: fb.axis }, aimY = K.aim ? K.aim.y : 0;
  const g2 = [null, null]; g2[i] = goal; for (const h of sup) g2[h.i] = h.goal; const isX = !!g2[0] && !!g2[1] && g2[0].clone().sub(g2[1]).dot(left) < -0.02, twist = isX ? (i ? 1 : -1) * 0.45 * (globalThis.XTW ?? (globalThis.CROSSOVER ? -1 : 1)) : 0;
  const mk = st => { const A = fbAims(S, st === 2 ? sup : [...sup, { goal }], left, fwd);
    return { ...c, axis: a3(A.ax), yawT: A.yawT + aimY, twist, arms: c.arms.map((a, j) => (j === i ? { st, goal: a3(goal), w: 1, clr: 0, clr0: null, pole: null, low: 0, cone: 0 } : prot && a.st === 1 && a.pole ? { ...a, clr: 1, clr0: [-9, -9] } : a)), shr: c.shr.map((v, j) => (j === i ? (st === 2 && goal.y > b.pos.y + 1.4 ? 0.40 : 0) : st === 2 ? 0 : v)) }; };
  const fb0 = K.fb, T0 = K.T, st0 = H.st, goal0 = H.goal, jam = [0, 0], jmax = [0, 0], x0 = [fb.x[FBI.YC], fb.x[FBI.PC], fb.x[FBI.RC]], dev = [0, 0, 0], LOSE = 0.15, R = { lose: -1, when: '', t: 0, why: '', jam: jmax, dev, far: null, prot };
  const dist = (H.w || K.T.sh[i]).distanceTo(goal), T1 = clamp(0.2 + 0.45 * dist, 0.25, 0.7), T2 = globalThis.PLAN_T2 ?? 0.6, NV = f2.xs.length;
  try { K.fb = f2; H.st = 'reach'; H.goal = goal.clone();
    const run = (cx, T, ph, t0, who) => { const n = Math.round(T / dt); let xa = null, xb = null, kN = 1;
      if (!FULL) { xa = Float64Array.from(f2.xs); xb = Float64Array.from(f2.xs); let prev = null; for (let it = 0; it < 16; it++) { fbSolve(xb, cx, 1, 0.12); let m = 0; if (prev) for (let a = 0; a < NV; a++) m = Math.max(m, Math.abs(xb[a] - prev[a])); if (prev && m < 0.004) break; prev = Float64Array.from(xb); }
        let mx = 0; for (let a = 0; a < NV; a++) mx = Math.max(mx, Math.abs(xb[a] - xa[a])); kN = Math.max(1, mx / FBW.step); cx.xEnd = xb; }
      for (let k = 1; k <= n; k++) {
        if (FULL) { cx.iters = f2.cost > 3 ? 2 : 1; stepFB(f2, cx, dt); } else { const u = Math.min(1, k / kN); for (let a = 0; a < NV; a++) f2.xs[a] = xa[a] + (xb[a] - xa[a]) * u; fbFollow(f2, f2.xs, dt); }
        if (k % EV) continue;
        K.T = torso(b, K); dev[0] = Math.max(dev[0], Math.abs(f2.x[FBI.YC] - x0[0])); dev[1] = Math.max(dev[1], Math.abs(f2.x[FBI.PC] - x0[1])); dev[2] = Math.max(dev[2], Math.abs(f2.x[FBI.RC] - x0[2]));
        for (const [j, gj] of who) { const w = armCheck(S, j, K.T.sh[j], gj); jam[j] = w ? jam[j] + EV * dt : 0; jmax[j] = Math.max(jmax[j], jam[j]); if (jam[j] > LOSE - 1e-6 && R.lose < 0) { R.lose = j; R.when = ph; R.t = t0 + k * dt; R.why = w; } }
        if (R.lose >= 0) return false; } return true; };
    const who1 = sup.map(h => [h.i, h.goal]); const cx1 = mk(2); let ok = run(cx1, T1, 'reach', 0, who1);
    // 닿는가: 뻗은 끝 자세의 어깨에서(중간에 놓쳐 멈췄어도 끝 자세로 잰다) 팔 길이 + 잡기 보정의 가만히 있을 때 몫 — 미리보기(probeHand)와 같은 기준
    { const xe = FULL || !cx1.xEnd ? null : cx1.xEnd, AS = assistOn(S) ? CL.ASSIST_S : 0; let sh = null; if (xe) { const p0 = fbFK(fb.x, c.pos, c.yaw).sh[i], p1 = fbFK(xe, c.pos, c.yaw).sh[i]; sh = T0.sh[i].clone().add(V(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2])); } else { K.T = torso(b, K); sh = K.T.sh[i]; } R.far = sh.distanceTo(goal) - CL.ARM - AS; }
    // 닿지 않으면 손은 뻗은 채 머물다 돌아온다 → 뻗는 문맥으로 0.4초 더 본다. 닿으면 잡은 뒤를 본다
    if (ok && R.far > 0.02) ok = run(mk(2), 0.4, 'reach', T1, who1);
    else if (ok) { H.st = 'hold'; run(mk(1), T2, 'settle', T1, [...who1, [i, goal]]); }
  } finally { K.fb = fb0; K.T = T0; H.st = st0; H.goal = goal0; }
  R.ms = typeof performance !== 'undefined' ? performance.now() - t00 : 0; return R; }
// 뻗기 전 검사의 결정(p3d-0.15.5). 고치려는 것 = "새 명령 때문에 버티는 손이 제 몸에 걸려 풀리는 것"뿐이다(미끄러짐·과부하·점프·사용자가 놓는 것은 그대로).
//   go    = 그대로 보낸다(놓칠 손이 없다 · 또는 잡은 뒤에 옛 손이 풀리지만 지킬 길을 못 찾음 — 새 손은 잡히므로 막지 않는다. 0.11.4의 "필요하면 다른 쪽을 놓고 원했던 턱을 잡게"와 같은 결과)
//   guard = 버티는 팔을 지키는 풀이 항을 처음부터 켜고 보낸다(그 길로는 놓치지 않고 닿는다고 나옴. 전신 연결 켬에서만)
//   deny  = 손을 떼지 않고 거부한다: ㉠ 어차피 닿지 않는데(far) 뻗으면 버티는 손이 풀림 ㉡ 닿지만 뻗는 동안 버티는 손이 풀리고 지킬 길도 없음(jam)
//   몸이 움직이는 중·뛰는 중에는 부르지 않는다(가만히 있을 때의 분명한 것만 미리 막는다)
export function planDecide(S, i, goal) { const a = planReach(S, i, goal, false); if (!a) return { act: 'go', a: null }; if (a.lose < 0) return { act: 'go', a };
  const guardOk = linkOn(S) && !globalThis.NOHELDCLR;
  if (a.when === 'reach') { if (a.far > 0.02) return { act: 'deny', kind: 'far', why: `닿지 않음(${short(a.far)} 모자람)`, a };
    // 지키며 뻗으면 뻗는 동안은 버티고 닿는다 → 보낸다(잡은 뒤에 풀리는 것은 아래 줄과 같이 막지 않는다)
    const g = guardOk ? planReach(S, i, goal, true) : null; if (g && g.far <= 0.02 && (g.lose < 0 || g.when === 'settle')) return { act: 'guard', a, g, after: g.lose >= 0 };
    return { act: 'deny', kind: 'jam', why: '버티는 팔이 몸에 걸려 그렇게는 뻗지 못함', a, g }; }
  const g = guardOk ? planReach(S, i, goal, true) : null; if (g && g.lose < 0 && g.far <= 0.02) return { act: 'guard', a, g };
  return { act: 'go', a, g, after: true }; }
// 시험·진단용: 겨눈 점 pt를 명령과 같은 식으로 턱에 맞춘 뒤 두 후보(그대로 / 버티는 팔을 지키며)를 굴려 본다
export function planHand(S, i, pt) { const g = resolveGrip(S.worldAll || S.world, pt); if (!g) return null; const goal = anchorOf(g); return { a: planReach(S, i, goal, false), b: planReach(S, i, goal, true) }; }
// 돌려주는 값의 verdict(p3d-0.15.1 — 발 미리보기의 kind(윗면·벽면)와 다른 이름, GPT의 0.15.0 검토 — "닿지 않음"을 단정하지 않게 화면이 셋으로 나눠 보인다):
//   'reach' = 지금 자세에서 닿는다 · 'near' = 거리만 모자란다(다가가거나 뛰면 닿을 수 있다 — short = 모자란 거리) · 'block' = 지금 자세에서는 길·제 몸·관절에 막힌다 · 'none' = 잡을 턱이 아니다
//   sure는 "몸이 거의 멈춰 있다"(자세 기준이 곧 바뀌지 않는다)일 뿐, 결과를 확신한다는 뜻이 아니다. 'reach'라도 뻗는 동안 다른 팔·몸·턱에 막힐 수 있다(재 본 것: test/preview_check.mjs)
export function probeHand(S, i, pt) { const r = probeHand0(S, i, pt); r.verdict = r.ok ? 'reach' : r.short !== undefined ? 'near' : r.grip ? 'block' : 'none'; return r; }
function probeHand0(S, i, pt) {
  const g = resolveGrip(S.worldAll || S.world, pt), H = S.climb.hands[i];
  if (!g) return { ok: false, why: '잡을 수 있는 턱이 아님', sure: true };
  // p3d-0.13.1: 잡고 있는 손을 옮길 때의 닿는 거리는 **손을 놓고 뻗은 자세의 어깨**로 잰다(reachShift — 전신 자세 풀이를 "이 손이 그 턱으로 뻗는 중"으로 바꿔 풀어 본 어깨의 옮겨 감).
  //   0.13.0까지는 잡은 채의 어깨로 재서, 눌러 보면 잡히는 자리를 18~34cm "모자람"으로 보였다(윗몸이 뻗는 쪽으로 돌고 기우는 몫을 몰랐다). OLDPROBE = 전처럼
  const goal = anchorOf(g), sh = joints(S).sh[i].clone().add(reachShift(S, i, goal)), d = sh.distanceTo(goal), sure = S.body.vel.length() < 0.3, base = { grip: g.p.toArray(), name: g.edge.box.name, sure };
  if (handPathBlocked(S.world, H, goal, g)) return { ...base, ok: false, why: '손이 가는 길이 막힘' };
  // p3d-0.11.5: 미리보기도 잡기 보정과 같은 판정(정지 ASSIST_S + 목표 쪽으로 움직이는 빠르기만큼). 0.11.4는 미리보기가 보정을 몰라 잡히는 거리에서도 "조금 더 가까이"라고 보였다
  const u = goal.clone().sub(sh).normalize(), A = assistOn(S) ? Math.min(CL.ASSIST_MAX, CL.ASSIST_S + CL.ASSIST_D * Math.min(Math.max(0, S.body.vel.dot(u)), 2)) : 0, far = d - CL.ARM;
  if (far > A) return { ...base, ok: false, short: far, why: `닿지 않음(${short(far)} 모자람)` };
  const c = armCheck(S, i, far > 0 ? sh.clone().addScaledVector(u, far) : sh, goal, g.n) || (assistOn(S) ? '' : sidePull(S, i, sh, goal, g.n));
  return c ? { ...base, ok: false, why: c } : { ...base, ok: true, why: '', assist: far > 0 ? far : 0 };
}
export function probeFoot(S, i, pt) {
  const K = S.climb, g = resolveFoot(S.worldAll || S.world, pt, S.body.yaw);
  if (!K.on && !S.body.onGround) return { ok: false, why: '공중에서는 발을 보낼 수 없음', sure: true };
  if (!g) return { ok: false, why: '디딜 수 있는 면이 아님', sure: true };
  const G = footGeom(g.p, g.n, g.q), hj = joints(S).hj[i], d = hj.distanceTo(G.ank), sure = S.body.vel.length() < 0.3, base = { grip: g.p.toArray(), name: g.box.name, kind: g.kind, sure };
  if (d > DIM.leg * 0.995) return { ...base, ok: false, short: d - DIM.leg * 0.995, why: `발이 닿지 않음(${short(d - DIM.leg * 0.995)} 모자람)` };
  const c = legCheck(S, i, hj, G.ank, CL.HIP_TOL_CMD);
  return c ? { ...base, ok: false, why: c } : { ...base, ok: true, why: '' };
}

// 누르기(p3d-0.15.0, 옵션 S.opt.press — 화면 켬·시험 끔, 전신 자세 풀이에서만. 사용자 결정 2026-11-26 "진행해"): 발판을 디디고 오를 때 낮은 손을 놓지 않고 몸이 그 손 위로 올라간다(손은 당기는 손에서 누르는 손이 된다).
//   전에는 ① 곧게 선 어깨가 가장 낮은 손보다 16cm 아래에서 오르기를 멈췄고(FOLD_GAP) ② 그 위로 가면 "몸이 손을 지나 올라가 놓음" ③ 전신 자세 풀이가 어깨를 손 아래에 두려고 가슴을 젖혔다 — 그래서 번갈아 오르는 손 사이가 약 32cm를 넘으면 닿지 않았다(클라이밍장의 빨강·하양).
//   하는 것: 디딘 발이 있을 때만. 어깨가 손보다 위로 올라가면 그 팔은 손에서 어깨 쪽으로 **미는** 힘을 낸다(PRESS_F까지, 미는 방향이 위에서 GRIP_ANG 안일 때만 버틴다). 어깨가 손 높이 둘레를 지나는 동안에는 당기는 힘도 미는 힘도 줄어든다(다리가 받친다).
//   하지 않는 것: 발 없이 손으로만 눌러 올라서기(맨틀), 손바닥을 윗면에 올려놓는 손 모양(손목 자리는 잡을 때 그대로다 — 그림은 다음 일). NOPRESS = 끔
// 지지 손 전환의 비교 후보(p3d-0.15.2, GPT의 0.15.1 재검토 — **규칙 개정 후보이며 기본은 끔**. 0.11.4의 사용자 결정 "필요하면 다른 쪽을 놓고 원했던 턱을 잡게"가 지금의 규칙이다):
//   S.opt.keepHold가 켜져 있으면 잡기 보정이 먼저 잡은 손을 놓는 세 경로(끌려가지 못함 / 넓힌 각에서 옆으로 당겨짐 / 막 잡은 손이 버티지 못함)에서 그 손을 놓지 않는다.
//   끌려가지 못한 새 손은 잡기를 거두고(같은 턱 규칙과 같은 처리), 버티지 못하는 방향으로 당겨지는 새 손은 보조 없는 규칙대로 미끄러진다. 놓기·뛰기를 시킨 것과 실제로 버티지 못해 미끄러지는 것은 그대로다
const keepHoldOn = S => !!(S.opt && S.opt.keepHold) && !globalThis.NOKEEPHOLD;
const CANCEL_WHY = '새 잡기를 취소했어요. 몸 위치를 바꿔 다시 시도하세요.';
const pressOn = S => optEffect(S.opt).press && fbOn(S.climb);
// 전신 연결(p3d-0.15.3, S.opt.linkPose — 화면 켬·시험 끔. NOLINKPOSE = 끔. 자세 보조가 켜진 새 자세 방식에서만): GPT의 0.15.2 검토 작업 A "발과 몸통과 팔을 한 번에 연결하기".
// LINKPOSE = 시험용: 옵션을 켜지 않은 시험 묶음 전체를 전신 연결 켬으로 돌려 본다(POSEASSIST와 같은 쓰임)
const linkOn = S => optEffect(S.opt).link && fbOn(S.climb);
const FB0 = new Float64Array(11);
// 잡은 손마다: 곧게 선 몸(몸의 기준 자리에 세운 어깨 — 지금 자세로 재지 않는다)의 어깨가 손에서 FOLD_KEEP보다 가까워지지 않으려면 기준 자리가 벽 쪽으로 더 갈 수 있는 거리(음수 = 그만큼 벽에서 물러나야 한다)
function foldRoom(S, hands, left, fwd) { const K = S.climb, b = S.body, g = fbFK(FB0, [0, 0, 0], 0), D = globalThis.FOLD_KEEP ?? CL.FOLD_KEEP; let room = 9;
  for (const h of hands) { const r = h.goal.clone().sub(K.ref), dy = h.goal.y - (b.pos.y + g.sh[h.i][1]), dx = r.dot(left) - g.sh[h.i][0], f = r.dot(fwd) - g.sh[h.i][2]; let need = Math.sqrt(Math.max(0, D * D - dy * dy - dx * dx));
    // 어깨보다 낮은 손이 몸통 앞(어깨 너비 안, 골반 위)에 있으면 손목이 몸통 상자의 앞면(사람형 몸의 배 상자: 골반 가운데에서 앞 17cm)에서 팔뚝 굵기 + 여유(FOLD_FRONT 9cm)만큼 떨어져 있어야 한다 — 어깨에서의 거리만 보면 가슴·배 앞의 낮은 손에는 몸이 다시 벽에 붙어 팔뚝이 몸통을 지나갔다(손목이 배 상자 앞 1.2cm: 팔꿈치를 어느 쪽에 두어도 걸렸다)
    const kx = clamp(1 - (Math.abs(r.dot(left)) - Math.abs(g.sh[0][0])) / 0.10, 0, 1), ky = clamp(-dy / 0.10, 0, 1) * clamp((h.goal.y - (b.pos.y + DIM.hipY - 0.15)) / 0.10, 0, 1); need = Math.max(need, ((DIM.boxHip ? DIM.boxHip.c[2] + DIM.boxHip.h[2] : 0.12) + (globalThis.FOLD_FRONT ?? CL.FOLD_FRONT) - g.sh[h.i][2]) * kx * ky);
    if (need > 0) room = Math.min(room, f - need); }
  return room; }
// p3d-0.15.1(GPT의 0.15.0 검토): 자동 몸 맞추기(③)를 조준 맞춤·예약(①②)과 따로 켜고 끈다 — S.opt.autoBody(없으면 켬 = 0.13.0~0.15.0과 같다). 쉬운 조작이 꺼져 있으면 함께 꺼진다
const armOn = S => !!(S.opt && S.opt.easy) && !globalThis.NOARMREACH, autoBodyOn = S => !!(S.opt && S.opt.easy) && S.opt.autoBody !== false && !globalThis.NOAUTOBODY && !globalThis.NOARMREACH;
const jumping = S => (S.climb.on ? !!S.climb.push : !!S.body.push || (!S.body.onGround && S.body.vel.y > 0));
// ── 명령: 시도 → (성공 | 거부) → 유지 → 놓기 ──
export function command(S, c) {
  const K = S.climb, pt = c.p ? V(...c.p) : null;
  // 직접 뗀 발(userOff)은 사용자가 그 발을 다시 보내거나 보조를 켜고 끌 때(= 보조 다시 시작)까지 보조·벽 딛기가 다시 보내지 않는다.
  // 시간이 지났거나 손을 옮겼다고 다시 붙이지 않는다(p3d-0.8.1, GPT 결정. 0.7.0은 1.5초 뒤, 0.8.0은 손을 새로 잡으면 다시 보냈다)
  if (c.type === 'assistResume') { for (const F of K.feet) { F.userOff = false; F.offBox = null; } return; }
  if (c.type === 'release') { if (c.limb === 'hand') { K.hands[c.i].arm = null; releaseHand(S, c.i, '놓음'); } else liftFoot(S, c.i, '뗌'); return; }
  if (c.type === 'hand') {
    const H = K.hands[c.i], g = resolveGrip(S.worldAll || S.world, pt); H.arm = null;
    if (!c.armed) note(S, 'try', 'hand', c.i, '', { p: c.p, hold: !!c.hold });
    if (!K.on && H.st === 'free' && !(H.ov > 0)) seedBend(S, 'el' + H.s, `upperArm.${H.s}`, `foreArm.${H.s}`, `hand.${H.s}`);
    if (c.hold) {
      // 누르는 동안 뻗기(손 조작 2번): 누르는 순간 그 손을 놓고 조작을 시작한다. 이것은 의도적인 놓기다(거부와 다르다)
      if (H.st === 'hold') releaseHand(S, c.i, '뻗으려고 놓음');
      Object.assign(H, { st: 'reach', drag: true, t: 0, T: 9, wait: 0, best: undefined, lastFar: undefined, stall: 0, lock: null, lockN: 0, lockBest: undefined, selfTot: 0, armTot: 0, blockT: 0, sp: 0, shPrev: null, ov: 1, why: '' });
      H.from.copy(H.w); aimHand(S, H, pt);
      return;
    }
    // 눌러 보내기(손 조작 1번): 갈 수 없는 목표를 누르면 거부만 하고 지금 잡고 있는 손은 그대로 둔다(GPT의 p3d-0.5.0 검토 3장. 전에는 거부가 잡은 손까지 풀어 그 걸음에 떨어졌다)
    if (!g) { deny(S, H, 'hand', '잡을 수 있는 턱이 아님'); return; }
    const goal = anchorOf(g);
    if (H.st === 'hold' && g.p.distanceTo(H.grip) < 0.04) { deny(S, H, 'hand', '이미 잡고 있는 자리'); return; }
    if (handPathBlocked(S.world, H, goal, g)) { deny(S, H, 'hand', '손이 가는 길이 막힘'); return; }
    // 쉬운 조작 ② 예약(p3d-0.13.0, 사용자: "대충 해도 되어야 한다"): 가만히 있는데 닿지 않는 턱을 누르면, 손을 떼어 0.3초 뻗다가 거부하는 대신 지금 잡은 자리를 그대로 둔 채 ARM_T 동안 기다린다(H.arm).
    //   그사이 닿게 되면(몸을 옮김 · ③ 자동 몸 맞추기) 또는 뛰기 시작하면 그때 보낸다 — 같은 명령·같은 판정을 거친다. 시간이 지나면 원래 까닭으로 거부한다(거부는 놓기가 아니다).
    //   발판에서 뛰어 턱 C를 잡을 때 점프와 거의 동시에(−0.10 ~ +0.05초) 눌러야 했던 것이 "먼저 누르고 2초 안에 뛰기"가 된다. 움직이는 중(뛰는 중·떠 있는 중)의 누름은 전처럼 바로 보낸다. NOARMREACH = 끔
    //   고침(같은 판, 여유 측정에서 찾음): 미리보기의 "모자람"은 손을 잡은 채의 어깨로 잰 것이라, 손을 놓고 뻗으면 윗몸이 목표 쪽으로 돌고 기울어 18~34cm가 더 닿는다. 모자란 손을 모두 예약으로 돌리자 전에는 바로 잡던 자리를 2초 기다린 뒤 거부했다(3·5단계).
    //   그래서 ARM_TRY 안으로 모자란 것은 전과 똑같이 바로 뻗고(끔과 같은 결과), 뻗다가 거리 때문에 거부되면 그때 예약으로 남긴다(H.armP → 아래 뻗기의 거부). 그보다 먼 것만 손을 놓지 않고 예약한다
    H.armP = null;
    if (armOn(S) && !c.armed && !jumping(S) && S.body.vel.length() < 0.3) { const pr = probeHand(S, c.i, pt);
      if (!pr.ok && pr.short !== undefined && pr.short > CL.ARM_TRY && pr.short <= CL.ARM_MAX) { H.arm = { p: c.p.slice(), t: 0, short: pr.short, jump: false, tried: false, why: pr.why }; H.why = ''; note(S, 'arm', 'hand', c.i, `닿으면 잡음(${short(pr.short)} 모자람)`); return; }
      H.armP = c.p.slice(); }
    // 뻗기 전 검사(p3d-0.15.5, 옵션 — 기본 끔): 가만히 있고 다른 손이 버티고 있을 때, 손을 떼기 전에 그 뻗기가 버티는 손을 제 몸에 걸리게 하는지 본다(planDecide). 잡던 자리로 돌아가는 손(H.st === 'reach')에는 걸지 않는다
    //   거부는 놓기가 아니다 — 두 손이 그대로 남는다. 쉬운 조작에서 거리가 모자란 것이면 먼 턱처럼 예약으로 기다린다(몸을 옮기면 잡는다)
    if (planOn(S) && K.on && H.st !== 'reach' && !jumping(S) && S.body.vel.length() < 0.3) { const pl = planDecide(S, c.i, goal); K.planLast = { tick: K.tick, i: c.i, act: pl.act, kind: pl.kind || '', ms: (pl.a ? pl.a.ms : 0) + (pl.g ? pl.g.ms : 0) };
      if (pl.act !== 'go' || pl.after) note(S, 'plan', 'hand', c.i, pl.act === 'deny' ? (pl.kind === 'far' ? '닿지 않고 뻗으면 버티는 손이 풀림 → 뻗지 않음' : '뻗는 동안 버티는 손이 풀림 → 뻗지 않음') : pl.act === 'guard' ? '버티는 팔을 지키며 뻗음' : '잡은 뒤 먼저 잡은 손이 풀릴 수 있음', { act: pl.act, lose: pl.a.lose, when: pl.a.when, at: pl.a.t, jamWhy: pl.a.why, far: pl.a.far });
      if (pl.act === 'deny' && pl.kind === 'far') { const pr = probeHand(S, c.i, pt); if (!pr.ok && pr.short !== undefined && pr.why) pl.why = pr.why; }
      if (pl.act === 'deny') { if (pl.kind === 'far' && armOn(S) && !c.armed && pl.a.far <= CL.ARM_MAX) { H.arm = { p: c.p.slice(), t: 0, short: Math.max(pl.a.far, 0), jump: false, tried: false, why: pl.why }; H.why = ''; H.armP = null; note(S, 'arm', 'hand', c.i, `닿으면 잡음(${short(Math.max(pl.a.far, 0))} 모자람)`); } else deny(S, H, 'hand', pl.why); return; }
      if (pl.act === 'guard') for (const h of K.hands) if (h.i !== c.i && h.st === 'hold') h.clrOn = true; }
    // 쉬운 조작 ②의 되돌아가기(p3d-0.13.1): 잡고 있던 자리를 적어 둔다. 뻗다가 거리 때문에 거부되면 그 자리로 돌아가 잡은 채 예약으로 기다린다(아래 뻗기의 거부). NOARMBACK = 돌아가지 않음(0.13.0)
    H.back = H.st === 'hold' && H.armP && !globalThis.NOARMBACK ? H.grip.clone() : null;
    // p3d-0.15.1: 방금 놓은 턱(H.leftBox)을 적어 둔다 — 그 턱에 대한 팔뚝의 여유는 떠나는 동안에도 잡고 있을 때의 값(ARM_PAD_GRIP 1mm)으로 본다(아래 limbsStep의 tb).
    //   잡고 있을 때는 그 턱이 "잡는 턱"이라 1mm였다가 놓는 걸음에 보통 여유(4mm)로 바뀌어, 같은 자세의 팔뚝이 그 턱에 3~5mm 겹친 것으로 세어져 손이 첫 걸음부터 나아가지 못했다
    //   (완등 홀드 바로 아래 26cm의 홀드에서 손을 모으러 올릴 때 "팔이 턱에 걸려 닿지 않음"). 손목이 놓은 자리에서 20cm 넘게 떠나면 보통 여유로 돌아간다. OLDLEFTPAD = 전처럼
    const leftBox = H.st === 'hold' && H.edge && !globalThis.OLDLEFTPAD ? H.edge.box : null;
    if (H.st === 'hold') releaseHand(S, c.i, '옮기려고 놓음');
    H.leftBox = leftBox;
    Object.assign(H, { st: 'reach', drag: false, edge: g.edge, t: 0, T: 2.5, wait: 0, best: undefined, lastFar: undefined, stall: 0, lock: null, lockN: 0, lockBest: undefined, selfTot: 0, armTot: 0, blockT: 0, sp: 0, shPrev: null, ov: 1, why: '', auto: false, autoT: 0, autoDone: false });
    H.from.copy(H.w); H.goal.copy(goal); H.grip.copy(g.p); H.n.copy(g.n);
  }
  // 누르던 단추를 뗌: 그때 겨눈 곳이 턱이면 잡으러 가고(짧게), 아니면 헛손질
  // 뻗던 손을 거둠(B2): 잡으러 가지 않고 그 손만 놓인 채로 돌아간다. 이미 붙은 다른 접촉은 건드리지 않는다
  if (c.type === 'handCancel') { const H = K.hands[c.i]; if (H.st === 'reach' && H.drag) { H.rel.copy(H.w).sub(joints(S).sh[H.i]); H.ret = K.on ? { from: H.rel.clone(), t: 0 } : null; H.st = 'free'; H.drag = false; H.why = '손 보내기 취소'; note(S, 'cancel', 'hand', c.i, '손 보내기 취소'); } return; }
  if (c.type === 'handUp') { const H = K.hands[c.i]; if (H.st === 'reach' && H.drag) { H.drag = false; H.t = 0; H.wait = CL.TRY_T - 0.12; if (!H.edge) reject(S, H, 'hand', '헛손질(잡을 곳이 아님)'); } return; }
  if (c.type === 'foot') {
    const F = K.feet[c.i];
    if (!c.auto) { if (!c.shifted) note(S, 'try', 'foot', c.i, '', { p: c.p }); F.userOff = false; F.offBox = null; } // shifted = 체중을 옮긴 뒤 같은 명령을 이어서 하는 것(기록은 한 번만)
    const g = resolveFoot(S.worldAll || S.world, pt, S.body.yaw);
    if (!g) { deny(S, F, 'foot', '디딜 수 있는 면이 아님'); return; }
    if (!K.on && !S.body.onGround) { deny(S, F, 'foot', '공중에서는 발을 보낼 수 없음'); return; }
    const G = footGeom(g.p, g.n, g.q), far = joints(S).hj[c.i].distanceTo(G.ank) - DIM.leg * 0.995;
    // 한참 닿지 않는 자리면 디딘 발을 떼지 않는다(몸을 옮기면 닿을 만한 거리는 보내 본다)
    if (far > 0.25) { deny(S, F, 'foot', `발이 닿지 않음(${short(far)} 모자람)`); return; }
    // 사람 관절의 범위(p3d-0.11.1): 지금 골반에서 고관절이 한참(범위 + HIP_TOL_CMD) 넘게 꺾여야 하는 자리면 디딘 발을 떼지 않고 거부한다(골반이 돌아 들일 수 있는 만큼은 보내 본다 — 디딜 때 다시 본다)
    // p3d-0.12.0 자세 보조: 엉덩이를 벽에서 빼면 범위 안에 드는 자리면 거부하지 않고 보낸다(preOut = 청할 거리. 디딜 때 다시 본다)
    let preOut = 0;
    if (anatOn() && hipOver(S, c.i, joints(S).hj[c.i], G.ank) > CL.HIP_TOL_CMD) { const o = poseAssistOn(S) && K.on ? outNeed(S, d => (hipOver(S, c.i, joints(S).hj[c.i].clone().addScaledVector(outDir(S), d), G.ank) > CL.HIP_TOL_CMD ? 'x' : '')) : 0; if (!o) { deny(S, F, 'foot', '다리가 그렇게는 올라가지 않음'); return; } preOut = (K.wout || 0) + o; }
    // 손으로 잡지 않고도 발부터 올릴 수 있다(p3d-0.6.0, 사용자 의견 7). 땅에 선 채 벽 문맥으로 들어간다
    if (!K.on) enter(S, '발부터 올림');
    // 손 없이 디디고 있는 발을 옮길 때는 먼저 체중을 남는 발 위로 옮긴다(옮길 발이 밀어 준다). 그 뒤에 뗀다 — 바로 떼면 한 발로는 무게중심을 끌어올 수 없어 넘어간다
    const other = K.feet[1 - c.i];
    if (!c.shifted && F.st === 'plant' && F.kind === 'top' && other.st === 'plant' && other.kind === 'top' && !K.hands.some(h => h.st === 'hold')) { K.pendFoot = { cmd: { ...c, shifted: true }, t: 0, stay: 1 - c.i }; return; }
    if (F.st === 'plant') liftFoot(S, c.i, '옮기려고 뗌'); if (F.relV) F.relV.set(0, 0, 0);
    const out = g.kind === 'smear' ? g.n : V(-Math.sin(S.body.yaw), 0, -Math.cos(S.body.yaw));
    // 발이 가는 길: 윗면에는 위·바깥에서 내려 디딘다(턱 모서리를 뚫고 가지 않게)
    Object.assign(F, { st: 'move', kind: g.kind, box: g.box, patch: g.patch, t: 0, tryT: 0, needOut: preOut, outT: 0, T: clamp(F.a.distanceTo(G.ank) / CL.FOOT_V, CL.FOOT_T0, CL.FOOT_T1), auto: false, byAssist: !!c.auto, why: '' });
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
function releaseHand(S, i, why, type = 'release') { const K = S.climb, H = K.hands[i]; if (H.st === 'free') return; const was = H.st; H.st = 'free'; H.slack = 0; H.swivel = false; H.selfBlock = 0; H.armCross = 0; H.pass = 0; H.over = false; H.hn = null; H.F = null; H.rel.copy(H.w).sub(joints(S).sh[i]); H.ret = K.on ? { from: H.rel.clone(), t: 0 } : null; H.load = 0; H.bad = 0; H.why = why; if (was === 'hold') note(S, type, 'hand', i, why, { vel: S.body.vel.toArray(), cause: relCause(why), hold: H.edge ? H.edge.box.name : '' }); }
// 발이 떨어진 까닭의 갈래(p3d-0.15.3, GPT의 0.15.2 검토 작업 B: "수동 발이 떨어지는 원인과 그 뒤 자동 발의 재배치를 각각 기록한다"). 기록의 placed = 그 발을 누가 디뎠는가('user' 직접 · 'assist' 발 보조 · 'auto' 닿아서 디딤), hold = 디디고 있던 발판
//   'command' = 시킨 것(떼기·다른 곳으로 보내기 — 직접이든 발 보조든) · 'rise' = 몸이 올라가(W·점프) 다리가 닿는 범위를 벗어남(아래 발이 남은 것) · 'reach' = 몸이 옆·아래로 가서 범위를 벗어남 · 'joint' = 다리가 꺾이는 한계 · 'physics' = 그 밖(균형·힘 없음)
const footCause = (S, why) => (/뗌$/.test(why) ? 'command' : /닿는 범위를 벗어남/.test(why) ? (((S.inp && S.inp.cy > 0) || S.climb.push || S.body.vel.y > 0.05) ? 'rise' : 'reach') : /꺾이는 한계/.test(why) ? 'joint' : 'physics');
function liftFoot(S, i, why, type = 'lift') { const K = S.climb, F = K.feet[i]; if (F.st === 'free') return; const was = F.st; F.offTick = K.tick; F.st = 'free'; F.F = null; F.cool = 0.22; if (why === '뗌') { F.userOff = true; F.offBox = F.box; } F.rel.copy(F.a).sub(joints(S).hj[i]); F.lmax = DIM.boxCollide ? F.rel.length() : 0; F.load = 0; F.ok = false; F.why = why; if (was === 'plant') note(S, type, 'foot', i, why, { hold: F.box ? F.box.name : '', placed: F.byAssist ? 'assist' : F.auto ? 'auto' : 'user', fcause: footCause(S, why) }); } // p3d-0.10.2(사람형 몸): 뗄 때의 다리 길이에서 늘어진 발의 길이 한계로 천천히 줄인다(F.lmax) — 다 펴진 다리가 떨어지는 걸음에 한계(98.5%)로 13mm 줄며 무릎이 79mm 튀었다(m3, 초속 802°)

// 보내는 손발을 한 걸음 옮긴다. 어깨·고관절에서 닿는 데까지만 간다(늘어나지 않는다). 다 가서 닿았으면 잡고, 닿지 않으면 잠깐 더 뻗어 보다가 거부한다
function limbsStep(S, dt) {
  const K = S.climb, J = joints(S);
  // 예약된 손(쉬운 조작 ②): 닿게 됐거나(probeHand = 누를 때와 같은 판정) 뛰기 시작한 걸음에 보낸다. ARM_T가 지나면 지금의 까닭으로 거부(접촉은 그대로)
  for (const H of K.hands) if (H.arm) { const A = H.arm, jn = jumping(S), pr = probeHand(S, H.i, V(...A.p)); A.t += dt; if (pr.short !== undefined) A.short = pr.short; A.why = pr.why;
    if ((jn && !A.jump) || (A.tried ? pr.ok && S.body.pos.distanceTo(A.pos0) > 0.05 : pr.ok || (pr.short !== undefined && pr.short <= CL.ARM_TRY - 0.05))) { H.arm = null; command(S, { type: 'hand', i: H.i, p: A.p, armed: true }); }
    else if (A.t > CL.ARM_T) { H.arm = null; deny(S, H, 'hand', pr.why || '닿지 않음'); }
    else A.jump = jn; }
  for (const H of K.hands) {
    if (H.st !== 'reach') continue;
    const sh = J.sh[H.i];
    if (H.drag && S.inp && S.inp.reach && S.inp.reach[H.i]) aimHand(S, H, V(...S.inp.reach[H.i]));
    H.t += dt;
    // 손은 몸과 함께 가고(어깨가 간 만큼), 그 위에서 목표를 향해 빠르기 한계 안에서 다가간다. 정해 둔 시간표가 아니라 실제 거리로 간다 → 닿을 수 있게 된 걸음에 닿는다
    const lk0 = H.lock ? { sb: H.selfBlock || 0, ac: H.armCross || 0, bt: H.blockT || 0, st: H.selfTot || 0, at: H.armTot || 0 } : null; // 묶인 손(아래 H.lock)의 막힘 시간은 이 값에서 이어 센다
    const shMv = H.shPrev ? sh.distanceTo(H.shPrev) : 0; if (H.shPrev) H.w.add(sh).sub(H.shPrev); H.shPrev = sh.clone();
    const rel0 = H.w.clone().sub(sh), w0 = H.w.clone(), aim = H.goal.clone(); { const dg = H.w.distanceTo(H.goal); if (H.edge && (dg > 0.05 || !globalThis.OLDHAND)) aim.addScaledVector(H.n, Math.min(0.10, dg * 0.6)); } // p3d-0.8.8: 다가가는 길의 띄움은 끝까지 이어서 줄어든다(전에는 5cm 앞에서 3cm가 한 걸음에 없어져 손이 가는 방향이 꺾였다)
    // 다른 팔을 가로지르는 길이면 그 팔뚝을 돌아가는 경유점부터 간다(p3d-0.8.6. 목표는 그대로다)
    { const yw = S.body.yaw, vi = armVia(S, H, sh, H.goal, selfShapes(S, H.i), V(Math.sin(yw), 0, Math.cos(yw)), V(Math.cos(yw), 0, -Math.sin(yw)), yw, H.i ? -1 : 1, K.on && K.T ? K.T.qC : null); H.viaOn = !!vi; if (vi) aim.copy(vi); }
    // p3d-0.10.3(사람형 몸): 가는 길(지금 손목 → 이번 목표)이 어깨 SH_AVOID 안을 지나면 그 가장 가까운 점을 어깨에서 SH_AVOID만큼 밀어낸 자리를 경유점으로 삼는다(목표는 그대로). 손목이 어깨를 뚫고 지나가는 길이 팔꿈치를 뒤집었다(reach3)
    // 실험(기본 끔, SHVIA=1): 이 경유점은 reach3·v6의 팔 최대 빠르기를 더 줄였지만(1,926 → 1,365°/s) 팔 교차 장면 셋을 깨뜨렸다(길이 없으면 멈춤, 막힌 뒤 다른 길, 교차 줄기)
    if (DIM.boxCollide && globalThis.SHVIA && !H.viaOn) { const ab = aim.clone().sub(H.w), L2 = ab.lengthSq(); if (L2 > 1e-6) { const tt = clamp(sh.clone().sub(H.w).dot(ab) / L2, 0, 1), cp = H.w.clone().addScaledVector(ab, tt), off = cp.clone().sub(sh), dd = off.length();
      if (tt > 0.02 && tt < 0.98 && dd < CL.SH_AVOID) { const yw = S.body.yaw, out = dd > 1e-3 ? off.multiplyScalar(1 / dd) : V(Math.cos(yw), 0, -Math.sin(yw)).multiplyScalar(H.i ? -1 : 1); aim.copy(sh).addScaledVector(out, CL.SH_AVOID * 1.15); H.shVia = true; } else H.shVia = false; } }
    // 손의 빠르기(p3d-0.8.8): 일정한 빠르기로 가서 딱 멈추지 않고, 떠날 때 붙고 다가가며 줄어든다(끝 = 목표, 닿지 않는 목표면 팔을 다 편 자리). 0.8.7까지는 0.1초에 초속 3.2m가 되어 그대로 턱에 닿았다(찌르듯 뻗고 굳는 모양).
    // 몸이 빨리 움직일 때(뛰는 중·떨어지는 중)는 줄이지 않는다 — 그때는 손이 움직이는 몸을 따라잡아야 한다(p3d-0.6.0의 교훈: 목표 가까이에서 느려지면 1cm 앞에서 못 잡는다). 닿았는지의 판정은 그대로다
    const aimT = aim.clone(), dv = aim.sub(H.w), dl = dv.length();
    if (globalThis.OLDHAND) H.sp = Math.min(CL.HAND_V, (H.sp || 0) + CL.HAND_ACC * dt);
    else { const g = H.goal.clone().sub(sh), gl = g.length(), end = gl > CL.ARM ? sh.clone().addScaledVector(g, CL.ARM / gl) : H.goal;
      // 받쳐진 채 가만히 있을 때만(w = 1) 새 곡선이다: 뛰는 중·떠 있는 중·몸이 초속 0.9m 넘게 움직이는 중에는 전과 같다(w = 0. 뛰어 잡기의 타이밍을 바꾸지 않는다 — 처음에는 가르지 않아 캡처 동작의 뛰어 잡기 장면 둘이 달라졌다)
      const calm = (K.on || S.body.onGround) && !K.push && !(S.inp && S.inp.jump) ? clamp((0.9 - S.body.vel.length()) / 0.6, 0, 1) : 0;
      H.calm = calm;
      // p3d-0.11.2(사용자 영상: 점프하며 잡기가 5번에 1~2번): 뛰는 중·떠 있는 중(calm 0)에는 팔을 휘두르듯 빨리 간다(HAND_V_DYN 초속 5.5m, 가속 60). 0.11.1까지는 가만히 뻗을 때와 같은 초속 3.2m라
      //   엉덩이 높이의 손이 머리 위 턱까지 1.4m를 가는 데 0.45초가 걸려, 점프를 누르고 0.2초 넘어 클릭하면 정점이 지난 뒤에 닿았다. 사람이 뛰면서 팔을 휘둘러 올리는 손은 이보다 훨씬 빠르다(실험값)
      const vDyn = DIM.boxCollide && !globalThis.OLDJUMPHAND ? CL.HAND_V_DYN : CL.HAND_V, aDyn = DIM.boxCollide && !globalThis.OLDJUMPHAND ? CL.HAND_ACC_DYN : CL.HAND_ACC;
      const cap = lerp(vDyn, Math.min(CL.HAND_V, Math.sqrt(2 * CL.HAND_DEC * Math.max(0, H.w.distanceTo(end) - CL.HAND_V * dt * 0.5)) + CL.HAND_V1), calm); H.sp = Math.min(cap, (H.sp || 0) + lerp(aDyn, CL.HAND_ACC2, calm) * dt); }
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
        else { pref = fwdW.clone().multiplyScalar(0.6).add(UP);
          // p3d-0.11.9: 앞(벽 쪽) 7cm 자리가 지형에 닿으면 바깥·위로 비켜 간다 — 몸과 벽 사이에 낀 손이 벽을 따라 턱 밑으로 올라가 "팔이 턱에 걸려" 멈췄다(foot2 fb). OLDSELFPREF = 늘 앞·위
          if (DIM.boxCollide && !globalThis.OLDSELFPREF) { const q = H.w.clone().addScaledVector(fwdW, 0.07); if (S.world.boxes.some(x => x.kind !== 'floor' && sphereBox(q, RW + ARM_PAD, x))) { const oL = V(Math.cos(S.body.yaw), 0, -Math.sin(S.body.yaw)).multiplyScalar(H.i ? -1 : 1); pref = oL.multiplyScalar(0.6).add(UP); } } }
        const tg = pref.addScaledVector(h.n, -pref.dot(h.n)); if (tg.lengthSq() > 1e-6) dv.addScaledVector(tg.normalize(), 0.6 * dl); } }
    { const l2 = dv.length(); if (l2 > 1e-6) { const stp = dv.clone().multiplyScalar(Math.min(selfTouch || armTouch ? dl / l2 : 1, H.sp * dt / l2));
        // 팔이 다 펴지는 끝에서는 펴지는 빠르기를 줄인다(p3d-0.8.8): 팔 길이의 끝에 초속 3m로 닿으면 팔꿈치가 한 걸음에 펴지며 팔뚝이 17~24° 튀었다(IK는 다 펴질 때 팔꿈치 각이 가장 빨리 변한다). 어깨에서 멀어지는 몫만 줄이고 옆으로 가는 몫은 그대로다
        if (!globalThis.OLDHAND) { const r0v = H.w.clone().sub(sh), L0 = r0v.length(); if (L0 > 0.3 * CL.ARM) { const ur = r0v.multiplyScalar(1 / L0), vr = stp.dot(ur), lim = (Math.sqrt(2 * CL.EXT_DEC * Math.max(0, CL.ARM - L0)) + 0.25) * dt; if (vr > lim) stp.addScaledVector(ur, lim - vr); } }
        // p3d-0.10.3(사람형 몸): 어깨 둘레를 도는 빠르기의 한계(어깨 관절의 각속도 SH_OMEGA). 손목이 어깨 가까이를 지날 때 같은 손 빠르기로도 어깨→손목 축이 한 걸음에 43° 돌아 팔꿈치가 뒤집혔다(reach3, 팔뚝 초속 3,002°). 어깨에서 먼 손(보통 뻗기)에는 걸리지 않는다
        // p3d-0.10.4: 어깨 둘레의 바닥(손목은 어깨에서 WRIST_MIN보다 가까이 가지 않는다). 0.10.3까지는 손목이 곧은 길로 가서 어깨 2.9cm 안을 지났다(팔을 다 접어도 손목은 어깨에서 14cm쯤 — 위팔·팔뚝 27cm, 팔꿈치 가장 작은 각 약 30°).
        //   어깨 쪽으로 들어가는 몫을 지우고, 지운 만큼 어깨를 돌아 목표 쪽으로 간다(어깨를 둘러싼 공의 겉을 따라). 도는 쪽이 몸 안쪽(머리 쪽)이면 그 몫을 지운다(위·앞으로 돈다 — 머리 앞을 지나며 팔뚝이 머리에 들었다. FLOORIN=1이면 지우지 않음) 이미 안쪽이면 한 걸음에 1.2cm까지만 밖으로 낸다(0.10.3의 WMIN 실험은 한 걸음에 바닥으로 옮겨 팔이 튀었다).
        // p3d-0.11.1 되돌린 시도 둘(뻗는 팔이 사람 어깨의 범위를 벗어나는 걸음을 줄이려고): ① 뻗는 동안의 바닥을 14cm에서 20~30cm로 넓힘 — 범위 밖 걸음은 줄었지만(11% → 1.5%) 손이 턱 A를 돌아가지 못해 대표 장면 h1을 비롯한 7장면의 턱 F 잡기가 "팔이 턱에 걸려 닿지 않음"으로 바뀌었다
        //   ② "손목은 가슴의 앞면보다 뒤로 가지 않는다" — 윗몸이 뒤로 누우면 머리 위의 턱이 가슴의 틀로는 뒤라서 걸리지 않았다. 남긴 것은 아래의 "어깨를 도는 쪽은 가슴의 뒤쪽이 아니다"뿐이다. 손이 가는 길을 어깨 둘레의 호로 다시 짜는 일은 다음 판의 재료다
        // p3d-0.11.9(사용자 지적: h1 6.16~6.68초 팔뚝이 위팔에 붙게 접힌 채 손이 가슴에 붙어 올라감 — 팔꿈치 각 30°, 손목이 어깨에서 14cm): 손목이 어깨 아래에서 위로 넘어가는 동안은 바닥을 WRIST_COMF(30cm, 팔꿈치 약 70°)로 둔다 — 손이 어깨 둘레의 바깥 호를 돌고 팔꿈치·어깨는 따라간다.
        //   0.11.1에서 모든 뻗기의 바닥을 20~30cm로 넓혔을 때는 턱 A를 돌아가지 못해 7장면이 거부됐다(위 주석) — 이번에는 아래에서 위로 넘어가는 구간에만, 다른 손 너머로 건너가는 교차에는 쓰지 않는다. OLDCOMF = 14cm 그대로
        //   이 구간에서는 아래의 "바깥으로 쳐들며 돌기"를 쓰지 않는다(COMFDETOUR = 씀): 바깥 호와 함께 쓰면 손이 어깨 바깥 30cm로 돌 때 팔꿈치를 아래·뒤로 두는 답이 위팔 비틀림 범위 밖이 되어 팔꿈치가 어깨보다 27cm 위로 들렸다. 쓰지 않으면 팔꿈치가 어깨 높이 아래·뒤에 머물다 뻗을 때 따라 올라간다
        const crossing0 = (() => { const oL = V(Math.cos(S.body.yaw), 0, -Math.sin(S.body.yaw)).multiplyScalar(H.i ? -1 : 1), oth = K.hands[1 - H.i]; return oth.st === 'hold' && aimT.clone().sub(oth.goal).dot(oL) < 0.02; })();
        const rF0 = DIM.boxCollide && !globalThis.OLDCOMF && K.on && H.w.y < sh.y + 0.10 && aimT.y > sh.y - 0.05 && !crossing0 ? CL.WRIST_COMF : CL.WRIST_MIN;
        const floorStep = (stp, rF) => {
        if (DIM.boxCollide && !globalThis.NOWFLOOR) { const r0v = H.w.clone().sub(sh), L0 = r0v.length(); if (L0 > 1e-4) { const ur = r0v.multiplyScalar(1 / L0), vr = stp.dot(ur), vMin = L0 >= rF ? rF - L0 : Math.min(rF - L0, 0.012);
          if (vr < vMin) { const lost = vMin - vr; stp.addScaledVector(ur, lost); const tgt = aimT.clone().sub(sh); tgt.addScaledVector(ur, -tgt.dot(ur)); if (!globalThis.FLOORIN) { const o = V(Math.cos(S.body.yaw), 0, -Math.sin(S.body.yaw)).multiplyScalar(H.i ? -1 : 1); o.addScaledVector(ur, -o.dot(ur)); const inw = -tgt.dot(o); if (inw > 0 && o.lengthSq() > 1e-6) tgt.addScaledVector(o.normalize(), inw); } if (tgt.lengthSq() < 1e-6) { tgt.copy(fwdW).multiplyScalar(0.5).add(V(Math.cos(S.body.yaw), 0, -Math.sin(S.body.yaw)).multiplyScalar(H.i ? -1 : 1)); tgt.addScaledVector(ur, -tgt.dot(ur)); }
            // p3d-0.11.1: 어깨를 도는 쪽은 가슴의 뒤쪽이 아니다(가슴의 틀. 윗몸이 뻗는 쪽으로 돌아 있으면 "몸의 옆"이 가슴에서는 뒤다 — 손목이 어깨 뒤 21cm를 지나 위팔이 150° 비틀린 팔이 그려졌다). 뒤로 가는 몫을 지우고, 손목이 가슴 앞면보다 뒤에 있으면 앞으로 가는 몫을 더한다
            if (DIM.boxCollide && !globalThis.NOANAT && K.on && K.T && K.T.qC) { const fC = V(0, 0, 1).applyQuaternion(K.T.qC), ft = fC.clone().addScaledVector(ur, -fC.dot(ur)); if (ft.lengthSq() > 1e-6) { ft.normalize(); const bk = tgt.dot(ft); if (bk < 0) tgt.addScaledVector(ft, -bk); }
              // p3d-0.11.2(사용자 영상 0.11.1: 한 손 매달림에서 다른 손을 바로 옆에 모으지 못함): 손목이 어깨 아래에서 위로 올라가야 하면 바깥쪽으로 쳐들며 돈다(벽 가까이에서 사람이 팔을 옆으로 들어 올리는 길).
              //   0.11.1은 "가슴 앞쪽으로" 돌게 했는데, 벽을 보는 몸에서 가슴 앞은 어깨와 벽 사이(자리가 없다)라 손목이 벽과 어깨 사이에 끼여 멈췄다("닿지 않음 55cm")
              //   다른 손이 잡은 자리 너머로 건너가는 교차에는 쓰지 않는다(바깥으로 쳐든 팔이 건너가며 머리를 지나가 다 편 교차가 "팔이 머리를 지나감 → 놓침"이 됐다 — 교차는 0.8.6의 벽 쪽 경유점이 맡는다)
              const oL = V(Math.cos(S.body.yaw), 0, -Math.sin(S.body.yaw)).multiplyScalar(H.i ? -1 : 1), oth = K.hands[1 - H.i], crossing = oth.st === 'hold' && aimT.clone().sub(oth.goal).dot(oL) < 0.02;
              if (H.w.y < sh.y + 0.04 && aimT.y > sh.y && !crossing && !globalThis.OLDDETOUR && (rF !== CL.WRIST_COMF || globalThis.COMFDETOUR)) { const oT = oL.addScaledVector(ur, -oL.dot(ur)).add(UP.clone().addScaledVector(ur, -ur.y)); if (oT.lengthSq() > 1e-6) tgt.addScaledVector(oT.normalize(), 0.8 * Math.max(tgt.length(), 0.1)); } }
            if (tgt.lengthSq() > 1e-8) stp.addScaledVector(tgt.normalize(), lost); H.shFloor = (H.shFloor || 0) + 1; } } }
        };
        // 30cm 호는 그 걸음의 손목 자리가 지금 자리보다 지형(손목 둘레 + 3cm)에 더 들지 않을 때만 쓴다(쉬는 손이 벽 가까이 있어도 출발할 수 있게 — 처음에는 닿기만 해도 껐더니 foot2가 첫 걸음에 꺼졌다). 한 번 닿으면 이 뻗기 동안은 14cm 바닥으로 간다(걸음마다 오가지 않게) — 한 손 매달림에서 다른 손을 옆에 모을 때 30cm 호가 손을 잡은 턱 밑(벽 쪽)으로 데려가 팔이 턱에 걸렸다(play_fix_check 손 모으기)
        { const key = H.goal.x.toFixed(3) + ',' + H.goal.y.toFixed(3) + ',' + H.goal.z.toFixed(3); if (H.comfKey !== key) { H.comfKey = key; H.comfOff = false; }
          if (rF0 === CL.WRIST_COMF && !H.comfOff) { const sC = stp.clone(); floorStep(sC, rF0); const q = H.w.clone().add(sC), dep = p => { let m = 0; for (const x of S.world.boxes) { if (x.kind === 'floor') continue; const h = sphereBox(p, ARM_R.fore[1] + ARM_PAD + 0.03, x); if (h) m = Math.max(m, h.d); } return m; };
            if (dep(q) > dep(H.w) + 0.003) { H.comfOff = true; floorStep(stp, CL.WRIST_MIN); } else stp.copy(sC); }
          else floorStep(stp, rF0 === CL.WRIST_COMF ? CL.WRIST_MIN : rF0); }
        // p3d-0.10.3(사람형 몸): 어깨 둘레를 도는 빠르기의 한계(어깨 관절의 각속도 SH_OMEGA). 손목이 어깨 가까이를 지날 때 같은 손 빠르기로도 어깨→손목 축이 한 걸음에 43° 돌아 팔꿈치가 뒤집혔다(reach3, 팔뚝 초속 3,002°).
        //   p3d-0.10.4: 받쳐진 채 가만히 뻗을 때 8rad/s, 뛰는 중·떠 있는 중에는 12rad/s(SH_OMEGA_DYN — 손의 빠르기 곡선과 같은 calm으로 가른다. 실험값. 8로 두면 어깨를 돌아가는 길 때문에 뛰어 잡기가 지연 0초에서만 됐다)
        //   p3d-0.10.4: 한계는 실제 각속도다(옆으로 가는 거리 ≤ SH_OMEGA × 지금 거리 × dt). 0.10.3은 거리 대신 max(거리, 14cm)를 써서 어깨 3.5cm 안에서는 8rad/s가 지켜지지 않았다(GPT 지적. 축 4,608°/s)
        if (DIM.boxCollide && !globalThis.NOSHOMEGA && !globalThis.NOSHOM) { const r0v = H.w.clone().sub(sh), L0 = r0v.length(); if (L0 > 1e-4) { const ur = r0v.multiplyScalar(1 / L0), tg = stp.clone().addScaledVector(ur, -stp.dot(ur)), mx = (globalThis.OLDSHOM ? CL.SH_OMEGA : lerp(CL.SH_OMEGA_DYN, CL.SH_OMEGA, H.calm ?? 1)) * (globalThis.OLDSHOM ? Math.max(L0, CL.WRIST_MIN) : L0) * dt; if (tg.length() > mx) stp.addScaledVector(tg, mx / tg.length() - 1); } }
        H.w.add(stp); } }
    // p3d-0.10.3(사람형 몸, 실험·기본 끔 WMIN=1 — 교차 장면의 팔 줄기 시험을 깨뜨려 기본에서 뺐다): 손목은 어깨에서 WRIST_MIN보다 가까이 가지 않는다(팔을 다 접어도 손목은 어깨에서 14cm쯤 — 위팔·팔뚝 27cm, 팔꿈치 가장 작은 각 약 30°). 0.10.2까지는 뻗는 손목의 길이 어깨 3.5cm 안을 지났다(reach3)
    if (DIM.boxCollide && globalThis.WMIN) { const d0 = H.w.clone().sub(sh), L0 = d0.length(); if (L0 < CL.WRIST_MIN) H.w.copy(sh).addScaledVector(L0 > 1e-4 ? d0.multiplyScalar(1 / L0) : fwdW.clone(), CL.WRIST_MIN); }
    // p3d-0.12.0 자세 보조: 머리에 닿은 손목은 아래·벽 쪽으로는 밀어내지 않는다(고개가 비킨다 — 아래 K.hg). 밀어내면 얼굴 앞의 턱으로 가던 손이 턱 밑·벽 쪽에 끼여 "팔이 턱에 걸려"로 거부됐다
    if (SB) for (let it = 0; it < 2; it++) { const hh = selfHits(SB, H.w, RW, false, RW, RW, hn); keepN(hh); if (!hh.body && !hh.arm) break; if (hh.body) { const nn = hh.body.n; if (hh.body.head && poseAssistOn(S)) { if (nn.y < 0) nn.y = 0; const tw = nn.dot(fwdW); if (tw > 0) nn.addScaledVector(fwdW, -tw); } H.w.addScaledVector(nn, Math.min(hh.body.d, 0.02 + shMv)); selfTouch = true; } if (hh.arm) { H.w.addScaledVector(hh.arm.n, Math.min(hh.arm.d, 0.02 + shMv)); armTouch = true; } }
    // p3d-0.10.1(사람형 몸): 뻗는 손목이 머리에 닿아 있는가 — 머리가 비켜 준다(아래 K.hg). 손을 얼굴 앞의 턱에 모으는 자세에서 새 몸(머리 반지름 11.5cm)은 손목이 2~3cm 앞에서 머리에 막혀 되돌려 잡지 못했다
    H.headTouch = null; if (DIM.boxCollide && SB && SB.head) { const dh = H.w.distanceTo(SB.head.c) - SB.head.r - RW - 0.01; if (dh < 0) H.headTouch = { d: -dh, n: H.w.clone().sub(SB.head.c).normalize() }; }
    // 까닭을 고를 때 쓰는 누적(p3d-0.10.1): 흔들려 걸음마다 닿았다 떨어졌다 하면 이어진 시간(selfBlock·armCross)이 0으로 돌아가 까닭이 '닿지 않음(7cm 모자람)'으로 잘못 나왔다
    if (selfTouch || H.stopB) H.selfTot = (H.selfTot || 0) + dt; if (armTouch || H.stopA) H.armTot = (H.armTot || 0) + dt;
    H.selfBlock = selfTouch || H.stopB ? (H.selfBlock || 0) + dt : 0; H.armCross = armTouch || H.stopA ? (H.armCross || 0) + dt : 0; H.stopB = false; H.stopA = false;
    const d = H.w.clone().sub(sh); if (d.length() > CL.ARM) H.w.copy(sh).addScaledVector(d.normalize(), CL.ARM);
    // B4: 뻗는 손이 벽·턱 속으로 들어가지 않는다. ① 이 걸음에 간 길(앞 자리 → 새 자리)이 지형을 가로지르면 닿은 데서 멈춘다(얇은 것을 한 걸음에 건너뛰지 않게) ② 그래도 겹치면 들어간 만큼 가장 얕은 쪽으로 빼낸다(손목 둘레 = 팔뚝 끝의 실제 반지름 3.6cm + 여유. p3d-0.8.2까지는 1.5cm여서 그려진 팔뚝 끝이 턱에 들어갔다. 잡을 때의 손목 자리는 턱 앞면에서 4cm 앞이라 막히지 않는다). 손은 겉면을 따라 미끄러져 간다
    let wristHit = false;
    { const t = rayHit(S.world, w0, H.w); if (t < 1) { H.w.copy(w0).lerp(H.w.clone(), Math.max(0, t - 0.02)); wristHit = true; } }
    for (const x of S.world.boxes) { const h = sphereBox(H.w, ARM_R.fore[1] + (H.edge && H.edge.box === x ? ARM_PAD_GRIP : ARM_PAD), x); if (h) { H.w.addScaledVector(h.n, h.d + (DIM.boxCollide && !globalThis.OLDWRISTG ? 0.002 : 0)); H.thru = (H.thru || 0) + 1; wristHit = true; } } // p3d-0.11.9: 2mm 더 뗀다(아래 팔뚝 검사의 손목 끝 반지름과 같아 0mm 겹침이 막힘으로 세어졌다)
    // 팔뚝도 지형을 지나가지 않는다(B4 보완, p3d-0.8.2). 손목만 막으면 몸이 움직이거나 높이 올라간 자세에서 팔뚝이 턱을 가로질렀다(재현: test/reach_sweep.mjs ②~⑦).
    // 팔꿈치를 어느 쪽으로 돌려도 팔뚝 캡슐이 겹치면, 겹친 만큼 손목을 가장 얕은 쪽으로 빼낸다(팔뚝의 그 점은 손목이 움직인 거리의 t배만큼 움직인다). 손은 턱에 걸려 더 가지 못한다
    // 순서는 "팔꿈치 먼저": 나아간 자리에서 그림의 팔이 겹치면 ① 손목은 이번 걸음에 나아가지 않고(앞 자리), 굽는 쪽은 나아간 자리에서 겹치지 않는 쪽으로 돈다(H.poleWant — 그림이 이 값을 쓴다)
    // ② 앞 자리에서도 겹치면(몸이 움직여 팔이 턱 쪽으로 끌려갈 때) 겹친 만큼 손목을 가장 얕은 쪽으로 빼낸다. 한 걸음에 1.2cm + 그 걸음에 어깨가 움직인 거리까지(한 번에 다 빼내면 팔이 한 걸음에 30° 넘게 튄다. 몸이 빨리 떨어질 때는 그만큼 더 빼내야 팔이 턱에 끌려 들어가지 않는다)
    H.armBlock = false; H.poleWant = null;
    { const qC = K.on && K.T ? K.T.qC : null, sx = H.i ? -1 : 1, key = 'el' + H.s, tb0 = H.edge ? H.edge.box : null, tb = H.leftBox && tb0 && H.leftBox !== tb0 && H.w.distanceTo(H.from) < 0.20 ? [tb0, H.leftBox] : tb0, tryAt = (w, want) => dryBend(S, key, () => reachArm(S, H.s, sh, w, S.body.yaw, sx, qC, want, tb));
      // 손을 멈추거나 빼내는 것은 **팔뚝**의 겹침으로만 한다. 위팔의 겹침은 굽는 쪽을 고르는 데만 쓴다(가장 덜 겹치는 쪽으로 돈다):
      // 위팔은 어깨에 붙어 있어 손목을 옮겨도 거의 움직이지 않고, 어깨가 벽에 얼마나 가까운지는 몸통 쪽의 일이다. 위팔로도 손을 멈추면, 당겨 올라가 어깨가 턱 바로 앞 아래에 있을 때
      // 팔을 어느 쪽으로 돌려도 위팔(반지름 5cm)이 턱 끝에 2~4cm 걸려 손이 끝내 가지 못한다(턱 A → 턱 F). 그 겹침은 남아 있고 test/arm_mesh.mjs가 잰다 — 몸통·어깨 연결의 과제다
      const fd = R => (R.hit && R.hit.f ? R.hit.f.d : 0);
      let A = tryAt(H.w, null);
      H.blockAt = '';
      if (fd(A) > 0) { const B = tryAt(w0, A.want); H.armBlock = true; H.blockAt = `${A.hit.f.box} ${Math.round(A.hit.f.d * 1000)}mm`; if (fd(B) < fd(A)) { H.w.copy(w0); H.poleWant = A.want; A = B; }
        // 빼낼 쪽은 해 보고 고른다: 겹친 면의 바깥쪽과 여섯 축 방향으로 손목을 조금 옮겨 보고, 그림의 팔뚝이 가장 덜 겹치는 쪽으로 간다.
        // (0.8.2는 "겹친 면의 바깥쪽으로, 깊이 ÷ t만큼"이었다. 팔을 접은 자세에서 팔꿈치 쪽이 겹쳤을 때 그렇게 밀면 손목이 어깨에 가까워지며 팔꿈치가 오히려 벽 속으로 들어갔다 — 표면으로 재니 5cm)
        for (let it = 0, left = 0.012 + shMv; it < 2 && fd(A) > 0 && left > 1e-4; it++) { const st = Math.min(left, Math.max(0.004, fd(A))); let best = null;
          for (const dir of [A.hit.f.n, V(1, 0, 0), V(-1, 0, 0), V(0, 1, 0), V(0, -1, 0), V(0, 0, 1), V(0, 0, -1)]) { const w = H.w.clone().addScaledVector(dir, st), R2 = tryAt(w, H.poleWant), d = fd(R2); if (!best || d < best.d - 1e-5) best = { d, w, R2 }; if (!d) break; }
          if (!best || best.d >= fd(A) - 1e-5) break; H.w.copy(best.w); A = best.R2; left -= st; } }
      // 팔이 제 몸을 지나가는 자리로는 나아가지 않는다(p3d-0.8.5): 팔꿈치를 어느 쪽으로 두어도 팔의 줄기가 머리·몸통에 4mm 넘게 겹치면, 덜 겹치던 앞 자리로 손목을 되돌린다(앞 자리도 겹치면 겹친 만큼 가장 얕은 쪽으로 뺀다. 한 걸음에 1.2cm + 어깨가 움직인 거리까지).
      // p3d-0.8.6: 머리·몸통과 다른 팔을 따로 본다(다른 팔에 더 깊이 겹쳐 있어도 몸통의 겹침을 놓치지 않는다). **다른 팔도 길을 막는다**: 팔꿈치를 어느 쪽으로 두어도 이 팔이 다른 팔에(굵기 기준, 눌림 여유 1.2cm 밖으로) 겹치면
      // 그 자리로는 나아가지 않는다 — 이동하는 손이 멈춘다(H.armCross). 잡고 있는 손을 놓거나 자리를 건너뛰지 않는다
      // p3d-0.10.4(사람형 몸): 몸통·머리에 대한 여유 4mm → 1mm(BT). 시험(wall_check 20)은 팔뚝 줄기가 머리·가슴에 1mm 넘게 들면 센다 — 막힌 팔이 4mm 안에서 머리에 2mm 든 채 서 있었다(땅에서 몸 앞을 가로질러 뻗기)
      { const bD = R => sd(R.self, 'body'), aD = R => sd(R.self, 'arm'), BT = DIM.boxCollide && !globalThis.OLDSELFTOL ? 0.001 : 0.004;
        if (bD(A) > BT || aD(A) > 0.004) { const B0 = tryAt(w0, null), better = (bD(A) > BT && bD(B0) < bD(A) - 1e-5) || (aD(A) > 0.004 && !globalThis.NOARMSTOP && aD(B0) < aD(A) - 1e-5);
          if (better && bD(B0) <= bD(A) + 1e-5 && aD(B0) <= aD(A) + 1e-5) { if (aD(A) > 0.004 && !globalThis.NOARMSTOP) H.stopA = true; if (bD(A) > BT) H.stopB = true; H.w.copy(w0); A = B0; }
          if (bD(A) > BT) { H.w.addScaledVector(A.self.body.n, Math.min(bD(A), 0.012 + shMv)); H.stopB = true; }
          if (aD(A) > 0.004 && !globalThis.NOARMSTOP) { H.w.addScaledVector(A.self.arm.n, Math.min(aD(A), 0.012 + shMv)); H.stopA = true; } } }
      // p3d-0.11.9: 위의 팔뚝·제 몸 처리가 손목을 지형 속으로 옮기지 않는다(앞 걸음 자리로 되돌리거나 여섯 방향으로 옮겨 볼 때 손목의 지형 겹침은 보지 않았다 — 앞 걸음 자리가 이미 벽 속이면 걸음마다 1cm씩 더 들어가 손목이 벽 속 14cm까지 갔다. h1 fb). 손목은 다시 겉으로 빼낸다. OLDWRISTG = 빼지 않음
      if (!globalThis.OLDWRISTG && DIM.boxCollide) { let moved = false; for (const x of S.world.boxes) { const h = sphereBox(H.w, ARM_R.fore[1] + (H.edge && H.edge.box === x ? ARM_PAD_GRIP : ARM_PAD), x); if (h) { H.w.addScaledVector(h.n, h.d + 0.002); moved = true; } } if (moved) { wristHit = true; A = tryAt(H.w, H.poleWant); } } // 2mm 더: 정확히 반지름만큼만 떼면 다음 걸음의 팔뚝 검사가 0mm 겹침을 막힘으로 보고 손목을 앞 자리로 되돌려 벽을 따라 미끄러지다 멈췄다(foot2)
      H.up = A.hit && A.hit.u ? { d: A.hit.u.d, n: A.hit.u.n.clone() } : null;
      // 무엇에 걸렸는지(진단·추적용. 판정에는 쓰지 않는다): 나아가려던 자리에서 팔뚝이 걸린 상자의 이름과 깊이(blockAt), 손목만 닿았으면 '(손목)'
      H.blockBox = H.blockAt || (A.hit && A.hit.f ? A.hit.f.box : wristHit ? '(손목)' : '');
    }
    if (H.armBlock) { const d2 = H.w.clone().sub(sh); if (d2.length() > CL.ARM) H.w.copy(sh).addScaledVector(d2.normalize(), CL.ARM); }
    // 막힌 채 이어진 시간(손목이 지형에 닿아 멈췄거나 팔뚝이 걸려 기다리는 중). 화면의 "팔 경로 막힘"과 거부 까닭은 0.12초 넘게 이어졌을 때만 쓴다(스치는 한두 걸음에 깜박이지 않게)
    H.blockT = H.armBlock || wristHit ? (H.blockT || 0) + dt : 0;
    // 누르고 있는 동안에는 잡지 않는다(떼는 순간에 잡는다)
    // 팔꿈치가 아직 돌아가는 중인가(화면이 '막힘'과 나눠 보인다). p3d-0.8.5: 손 조작 2(누르는 동안 뻗기)에서도 걸음마다 갱신한다 — 0.8.4는 아래의 `continue` 뒤에서 정해 손 조작 2에서는 갱신되지 않았다
    // p3d-0.10.4: 막힌 손은 마지막 유효 자세를 지킨다(GPT의 0.10.3 검토 — 막힌 채 1.5초 동안 팔꿈치가 300~700°/s로 헤맸다: 손목이 머리·턱 사이에서 걸음마다 1~2cm 흔들리고, 그때마다 팔꿈치 후보를 새로 골랐다).
    //   막힌 채(지형·제 몸·다른 팔) 0.1초 동안 목표 쪽으로 3mm도 나아가지 못하면 그때의 손목 자리(어깨 기준)와 팔꿈치 방향을 묶어 둔다(H.lock). 목표가 1cm, 몸이 1.5cm, 몸 방향이 3° 넘게 바뀌거나 손발 접촉이 바뀌면 풀고 다시 찾는다.
    //   묶인 동안에도 막힘의 시간은 그대로 센다(거부 까닭과 때는 같다). 취소·다른 목표·놓기는 바로 듣는다(목표가 바뀌면 풀린다)
    //   다른 팔(팔꿈치·손목)이 묶은 때보다 1cm 넘게 움직였으면 푼다. 묶인 동안의 막힘 종류(지형·제 몸·다른 팔)는 묶은 때의 것으로 센다
    if (!globalThis.NOLOCK) { const blockedNow = H.blockT > 0 || H.selfBlock > 0 || H.armCross > 0, sig = K.hands.map(h => h.st + (h.st === 'hold' && h.edge ? h.edge.box.name : '')).join('/') + '|' + K.feet.map(f => f.st + (f.box ? f.box.name : '')).join('/'), gd = H.w.distanceTo(H.goal);
      const os = H.i ? 'L' : 'R', oEl = worldPos(S.rig.bones[`foreArm.${os}`]), oWr = worldPos(S.rig.bones[`hand.${os}`]), swv = ((S.poleS && S.poleS['el' + os + 'w']) || 0) > 0.5; // 다른 팔이 자리를 내 주는 중(그 팔꿈치가 도는 중)이면 묶지 않는다
      if (H.lock) { const L = H.lock; if (L.goal.distanceTo(H.goal) > 0.01 || S.body.pos.distanceTo(L.body) > 0.015 || Math.abs(S.body.yaw - L.yaw) > 0.05 || sig !== L.sig || swv || oEl.distanceTo(L.oEl) > 0.01 || oWr.distanceTo(L.oWr) > 0.01) { H.lock = null; H.lockN = 0; H.lockBest = gd; H.lockBlk = 0; H.unlocks = (H.unlocks || 0) + 1; }
        else { H.w.copy(sh).add(L.rel); H.poleWant = L.pole.clone(); const k = L.kind; H.armBlock = k.terr; H.blockT = k.terr ? lk0.bt + dt : 0; H.selfBlock = k.self ? lk0.sb + dt : 0; H.armCross = k.arm ? lk0.ac + dt : 0; H.selfTot = lk0.st + (k.self ? dt : 0); H.armTot = lk0.at + (k.arm ? dt : 0); } }
      // 나아감은 가장 가까웠던 거리로 잰다(막힌 손은 걸음마다 1~2cm 오가며 "조금 나아갔다"를 되풀이했다 — reach3). 지난 0.1초 가운데 절반 넘게 막혀 있었어야 묶는다
      if (!H.lock) { if (H.lockBest === undefined || gd < H.lockBest - 0.003 || swv) { H.lockN = 0; H.lockBest = gd; H.lockBlk = 0; } else { H.lockN = (H.lockN || 0) + 1; if (blockedNow) H.lockBlk = (H.lockBlk || 0) + 1; }
        if (H.lockN >= 12 && H.lockBlk >= 6 && S.poleS && S.poleS['el' + H.s]) { H.lock = { rel: H.w.clone().sub(sh), pole: S.poleS['el' + H.s].clone(), goal: H.goal.clone(), body: S.body.pos.clone(), yaw: S.body.yaw, sig, oEl, oWr, kind: { terr: H.blockT > 0, self: H.selfBlock > 0, arm: H.armCross > 0 } }; H.poleWant = H.lock.pole.clone(); } } }
    H.swivel = !H.lock && H.armBlock && ((S.poleS && S.poleS['el' + H.s + 'w']) || 0) > 0.5;
    if (H.drag) continue;
    const miss = H.w.distanceTo(H.goal), far = sh.distanceTo(H.goal) - CL.ARM;
    // 이번 걸음에 갈 수 있는 거리의 반(1.3cm) 안이면 닿은 것이다(몸이 움직이는 중에도 놓치지 않게)
    // p3d-0.8.8: 이 거리는 손의 지금 빠르기가 아니라 가장 빠른 빠르기(HAND_V)로 잰다 — 다가가며 느려지게 하자 이 거리가 4mm로 줄어, 턱에 막혀 마지막 몇 mm를 가지 못하는 손이 끝내 잡지 못했다(놓았던 손을 턱 A로 되돌리는 장면. 영상의 기록에서 찾음). 0.8.7까지와 같은 1.3cm다
    if (H.edge && miss <= Math.max(CL.CATCH, (globalThis.OLDHAND ? H.sp : CL.HAND_V) * dt * 0.5) && far <= 0.002) { const c = armCheck(S, H.i, sh, H.goal, H.n) || (assistOn(S) ? '' : sidePull(S, H.i, sh, H.goal, H.n)); if (c && handOutTry(S, H, c, dt)) continue; if (c) reject(S, H, 'hand', c); else { if (H.outTried) note(S, 'assist', 'hand', H.i, `자세 보조 · 엉덩이를 ${short(S.climb.wout || 0)} 뺌`); grab(S, H); } continue; } // 잡기 보정이 켜져 있으면 옆 당김으로 미리 거부하지 않는다(잡은 뒤 버티지 못하면 다른 손을 놓는다 — 아래 slip)
    // 더 갈 수 없게 된 뒤(팔이 다 펴졌거나 멈춤)로 TRY_T만큼만 더 뻗고 있는다. 그사이 몸이 다가가면 잡는다
    // 팔꿈치가 아직 돌고 있는 동안(팔꿈치 먼저)은 "더 갈 수 없게 된 시간"으로 세지 않는다. 세면 팔꿈치가 다 돌기 전에 0.3초가 차서 닿을 수 있는 턱을 거부한다
    // p3d-0.8.6: 다른 팔에 막혀 서 있는 동안 그 팔이 자리를 내 주느라 팔꿈치를 돌리고 있으면 그것도 세지 않는다
    // 제 몸·다른 팔에 막혀 서 있는 동안 이 팔의 팔꿈치가 비는 쪽으로 돌고 있으면 그것도 세지 않는다(다 돌기 전에 0.3초가 차면 갈 수 있는 길을 거부한다)
    // 잡기 보정(p3d-0.11.4): 손이 목표 쪽으로 다 뻗었고(팔이 펴져 더 못 가거나, 몸이 목표 쪽으로 움직이는 중) 모자란 거리가 허용 안이면 잡는다. 팔이 턱에 걸렸거나 몸·다른 팔에 막힌 손은 보정하지 않는다(까닭이 거리가 아니다)
    //   몸·다른 팔에 막혀 목표 앞에서 선 손(교차·손 모으기 — 사용자: "실제로는 조금만 노력하면 잡을 수 있다")은 목표 ASSIST_S + 2cm 안에 와서 0.1초 막혀 있으면 잡는다. 잡은 뒤의 팔꿈치는 겹치지 않는 쪽을 고른다(heldPole)
    const blkNear = (H.selfBlock > 0.1 || H.armCross > 0.1) && miss <= CL.ASSIST_S + 0.02 && !globalThis.OLDASSISTX;
    if (H.edge && (far > 0.002 || blkNear) && S.opt && S.opt.grabAssist && !globalThis.NOASSIST && miss <= Math.max(far, 0) + 0.03 + (blkNear ? CL.ASSIST_S : 0) && !(H.blockT > 0) && (blkNear || (!(H.selfBlock > 0) && !(H.armCross > 0)))) {
      const u = H.goal.clone().sub(sh).normalize(), vT = Math.max(0, S.body.vel.dot(u)), A = Math.min(CL.ASSIST_MAX, CL.ASSIST_S + CL.ASSIST_D * Math.min(vT, 2));
      // p3d-0.15.1: 다른 손이 같은 턱을 잡고 있을 때(손 모으기)는, 모자란 만큼 몸이 끌려가면 그 손의 팔이 길이를 넘는 경우에 보정으로 잡지 않는다(잡았다가 0.03초 뒤에 거두지 않게 — 아래 끌려감의 같은 턱 규칙과 짝)
      const oM = K.hands[1 - H.i], matchOk = globalThis.OLDMATCHREL || !(oM.st === 'hold' && oM.edge && (oM.edge.box === H.edge.box || keepHoldOn(S))) || (K.T ? K.T.sh[oM.i] : joints(S).sh[oM.i]).clone().addScaledVector(u, Math.max(far, 0)).distanceTo(oM.goal) <= CL.ARM + 0.01;
      if (far <= A && matchOk && (H.wait > 0.03 || vT > 0.3 || blkNear)) { const shV = sh.clone().addScaledVector(u, Math.max(far, 0)), c = armCheck(S, H.i, shV, H.goal, H.n); if (!c) { H.slack = Math.max(far, 0) + 0.002; H.assisted = far; grab(S, H); note(S, 'assist', 'hand', H.i, `잡기 보정 ${blkNear ? '막힌 손 ' + short(miss) : short(far)}${vT > 0.3 ? ' · 반동' : ''}`); continue; } } }
    const yielding = (H.stopA && ((S.poleS && S.poleS['el' + (H.i ? 'L' : 'R') + 'w']) || 0) > 0.5) || ((H.stopA || H.stopB) && ((S.poleS && S.poleS['el' + H.s + 'w']) || 0) > 0.5);
    // p3d-0.10.1: 몸이 흔들려 손이 조금씩 움직이면 "멈춰 있음"이 쌓이지 않아, 막힌 손이 거부되지 않고 2.5초 한도까지 턱 앞에서 머뭇거렸다(새 몸의 되돌려 잡기, 다른 팔에 막힘).
    //   목표에 3mm 넘게 더 가까워지지 않은 채 0.25초가 지나면 그때부터도 센다
    if (H.best === undefined || miss < H.best - 0.003) { H.best = miss; H.stall = 0; } else H.stall = (H.stall || 0) + dt;
    // 쉬운 조작 ③ 자동 몸 맞추기(p3d-0.13.0, 고침): 뻗은 손이 더 가지 못하고 멈췄는데(H.wait) 모자란 거리가 AUTO_MAX 안이고 막힌 것이 아니면, 거부까지의 시간(TRY_T)이 반쯤 찼을 때부터 그 시간을 세지 않고 몸을 목표 쪽으로 옮긴다(stepClimb가 W·A·D와 같은 입력을 넣는다).
    //   모자람이 0.35초 동안 줄지 않거나 AUTO_T가 지나면 그만두고 전처럼 TRY_T 뒤에 거부한다. 처음에는 손을 잡은 채(예약) 몸을 옮겼는데, 그 모자람이 실제보다 18~34cm 크게 재져 필요 없는 때에 몸을 2초씩 옮겼다(3단계: 왼쪽으로 14cm 흔들림)
    { const can = autoBodyOn(S) && K.on && H.edge && !H.autoDone && far > 0.02 && far <= CL.AUTO_MAX && !(H.blockT > 0) && !(H.selfBlock > 0) && !(H.armCross > 0) && !jumping(S);
      if (can && (H.wait > CL.TRY_T * 0.5 || H.auto)) { if (!H.auto) { H.auto = true; H.autoT = 0; H.autoBest = far; H.autoStall = 0; note(S, 'auto', 'hand', H.i, `몸을 옮겨 닿는 중(${short(far)} 모자람)`); }
        H.autoT += dt; if (far < H.autoBest - 0.002) { H.autoBest = far; H.autoStall = 0; } else H.autoStall += dt; if (H.autoT > CL.AUTO_T || H.autoStall > 0.35) { H.auto = false; H.autoDone = true; } }
      else if (H.auto) { H.auto = false; H.autoDone = true; } }
    if ((H.w.clone().sub(sh).distanceTo(rel0) < 0.0015 || H.stall > 0.25) && !H.swivel && !yielding && !H.auto) H.wait += dt;
    // 까닭의 순서(p3d-0.8.6): 팔이 턱에 걸림 → 팔을 다 펴도 닿지 않는 거리(몸·다른 팔에 스쳤더라도 거리가 까닭이다) → 제 몸에 가림 → 다른 팔에 가림
    // p3d-0.11.2: 떠 있는 채 내려가는 중이고 목표가 어깨보다 위인데 팔 길이로 모자라면 더 기다려도 멀어지기만 한다 → 그 자리에서 까닭(정점이 지남)을 알린다.
    //   0.11.1까지는 손이 그대로 기다리다가 착지한 뒤 0.3초에야 "닿지 않음(40cm 모자람)"(땅에서 잰 거리)으로 거부돼 왜 못 잡았는지 알기 어려웠다
    //   거리가 실제로 늘어나는 중일 때만(옆으로 날아가며 턱에 다가가는 중에는 내려가도 거리가 준다 — 처음에는 이것을 보지 않아 턱 B → E의 흔들어 뛰어 잡기가 모두 막혔다)
    const farUp = H.lastFar !== undefined && far > H.lastFar + 0.0005; H.lastFar = far;
    //   그리고 땅에 내려서서도 닿지 않는 높이일 때만(내려선 뒤 서서 닿는 턱은 그대로 기다린다 — 처음에는 이것도 보지 않아 턱 E 1.9m를 착지 뒤에 잡던 장면이 막혔다). 서서 닿는 높이 = 아래 지형 + 선 어깨 높이(STAND_SH 1.42m — 사람형 몸을 세워 잰 값) + 팔 길이
    const floorY = groundBelow(S.world, S.body.pos), standReach = floorY + CL.STAND_SH + CL.ARM;
    if (!K.on && !S.body.onGround && S.body.vel.y < -0.4 && H.goal.y > sh.y && H.goal.y > standReach + 0.02 && far > 0.03 && farUp && !globalThis.OLDJUMPHAND && !(assistOn(S) && far <= CL.ASSIST_S)) { reject(S, H, 'hand', `닿지 않음(점프 정점이 지남 · ${short(far)} 모자람)`); continue; }
    if (H.wait > CL.TRY_T || H.t > H.T) { const why = H.blockT > 0.12 ? '팔이 턱에 걸려 닿지 않음' : far > 0.02 ? `닿지 않음(${short(Math.max(far, miss))} 모자람)` : (H.selfBlock || 0) > 0.12 || ((H.selfTot || 0) > 0.3 && (H.selfTot || 0) >= (H.armTot || 0)) ? '몸에 막혀 닿지 않음' : (H.armCross || 0) > 0.12 || (H.armTot || 0) > 0.3 ? '다른 팔에 막혀 닿지 않음' : `닿지 않음(${short(Math.max(far, miss))} 모자람)`; if (handOutTry(S, H, why, dt)) continue; reject(S, H, 'hand', why);
      //   p3d-0.13.1: 손을 뗀 채 기다리면 한 손으로 버티는 자세가 되어 그 뒤의 점프가 낮아졌다(턱 C: 점프 1.5초 전에 누르면 실패, 1초 전은 성공). 사람처럼 잡던 자리로 손을 되돌려 놓고 기다린다.
      //   되돌아간 뒤의 예약은 뛰기 시작하거나, 몸이 5cm 넘게 옮겨 가 닿게 됐을 때만 보낸다(같은 자리에서 다시 뻗어 봐야 같은 거부다)
      if (armOn(S) && H.armP && /^닿지 않음\(/.test(why) && H.t < CL.ARM_T) { const A = { p: H.armP, t: H.t, short: Math.max(far, 0), jump: jumping(S), tried: true, why, pos0: S.body.pos.clone() }, bk = H.back; H.back = null;
        if (bk && K.on) command(S, { type: 'hand', i: H.i, p: bk.toArray(), armed: true }); H.arm = A; note(S, 'arm', 'hand', H.i, bk && K.on ? '잡던 자리로 돌아가 기다림' : '닿으면 잡음'); } H.armP = null; H.back = null; }
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
      // p3d-0.11.6: 가는 발이 다른 다리(넓적다리·정강이)를 지나가지 않게 그 둘레로 돌아간다(뒤 = 벽 반대쪽으로 조금 기울여). 도착에 가까울수록(마지막 15%) 줄여 디딜 자리는 그대로 둔다 — 엇갈려 디디러 가는 왼발이 디딘 오른쪽 넓적다리를 9cm 지나갔다(leg_cross)
      if (DIM.boxCollide && !globalThis.OLDLEGX && !globalThis.NOLX_PATH && S.climb.feet[1 - F.i].st !== 'free') { const yaw = S.body.yaw, back = V(-Math.sin(yaw), 0, -Math.cos(yaw)), oL = otherLeg(S, 1 - F.i), wk = 1 - mj(clamp((k - 0.85) / 0.15, 0, 1));
        for (let it = 0; it < 3 && wk > 0; it++) { let worst = 0, dir = null; for (const [a, b, r] of [[oL.hip.clone().lerp(oL.knee, 0.3), oL.knee, LEG_R.th], [oL.knee, oL.ank, LEG_R.sh], [oL.ank, oL.toe, LEG_R.ft]]) { const c = closestOnSeg(a, b, p), dd = p.distanceTo(c) - r - LEG_R.sh - 0.01; if (dd < worst) { worst = dd; const h = p.clone().sub(c).setY(0); dir = (h.lengthSq() > 1e-6 ? h.normalize() : back.clone()).addScaledVector(back, 0.5).normalize(); } }
          if (!dir) break; p.addScaledVector(dir, -worst * wk); } }
      const d = p.clone().sub(hj);
      if (d.length() > R) p.copy(hj).addScaledVector(d.normalize(), R);
      F.a.copy(p);
      if (F.t < F.T) continue;
      const miss = F.a.distanceTo(F.ank);
      if (miss <= CL.CATCH) { const c = legCheck(S, F.i, hj, F.ank);
        // p3d-0.12.0 자세 보조: 고관절이 그만큼 꺾이지 않아 거부될 발은, 엉덩이를 벽에서 빼면 되는지 먼저 본다(고관절을 d만큼 뒤로 둔 같은 판정). 되면 그만큼 빼기를 청하고(F.needOut) 발은 목표 앞에서 기다린다. 어느 d로도 안 되거나 OUT_WAIT이 지나면 원래 까닭으로 거부
        if (c && poseAssistOn(S) && /올라가지 않음|접을 수 없음|벽·턱을 지나감/.test(c) && (F.outT = (F.outT || 0) + dt) < CL.OUT_WAIT) { const d = outNeed(S, dd => legCheck(S, F.i, hj.clone().addScaledVector(outDir(S), dd), F.ank)); if (d > 0) { F.needOut = Math.max(F.needOut || 0, (globalThis.OLDOUTSUM ? (S.climb.out || 0) : (S.climb.wout || 0)) + d); continue; } }
        if (c) reject(S, F, 'foot', c); else { if (F.needOut) note(S, 'assist', 'foot', F.i, `자세 보조 · 엉덩이를 ${short(S.climb.wout || 0)} 뺌`); F.holdOut = F.needOut || 0; F.needOut = 0; F.outT = 0; F.st = 'plant'; F.a.copy(F.ank); F.load = 0; note(S, 'step', 'foot', F.i, (F.kind === 'top' ? '윗면' : '벽면') + (F.byAssist ? ' · 발 보조' : ''), { box: F.box.name, assist: !!F.byAssist }); } }
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
        // p3d-0.11.7(자세 정리 ④): 다른 발이 바닥에 서 있고 엉덩이가 선 높이(95% 넘게)면 뻗지 않는다 — 땅에 서서 손을 잡다 몸이 1cm 들려 떨어진 발이 26cm 옆으로 뻗었다가 넓게(60cm) 디뎠다. 무릎을 굽힌 채 바닥에 선 때(다른 벽 시험 c1, 엉덩이 0.85m)는 전처럼 뻗는다 — 거기서까지 빼면 바닥에 다시 디딘 다리의 넓적다리가 안쪽으로 55° 비틀렸다(anat_check 한계 50°). OLDFLAGFLOOR = 전처럼
        // p3d-0.11.6: 다른 발이 이 다리 쪽으로 엇갈려 디뎠으면(crossed) 제 쪽 바깥으로 뻗는다 — 엇갈린 다리를 가로질러 뻗으면 그 다리를 지나간다
        { const O = Kc.feet[1 - F.i], wf = O.st === 'plant' && Kc.hands.some(h => h.st === 'hold') && (globalThis.OLDFLAGFLOOR || !DIM.boxCollide || (O.box && O.box.kind !== 'floor') || !Kc.T || Kc.T.hip.y - O.p.y < 0.95 * DIM.hipY) ? clamp(((O.loadS || 0) - 0.05) / 0.15, 0, 1) : 0; if (wf > 0) { const lf = V(Math.cos(yaw), 0, -Math.sin(yaw)), dd = hj.clone().sub(O.p).dot(lf), crossed = DIM.boxCollide && !globalThis.OLDLEGX && !globalThis.NOLX_FLAG && O.p.clone().sub(S.climb.T ? S.climb.T.hj[0].clone().lerp(S.climb.T.hj[1], 0.5) : S.body.pos).dot(lf) * sx > 0.02, sg = crossed ? sx : Math.abs(dd) < 0.06 ? sx : dd > 0 ? 1 : -1; rest.addScaledVector(lf, sg * 0.26 * wf); rest.y += 0.05 * wf; } }
        const w = F.cool > 0 ? 16 : (F.i ? 6.4 : 5.6) + 5 * tk + 3 * Math.abs(sd), zeta = F.cool > 0 ? 1 : 0.55; F.relV = F.relV || V();
        F.relV.addScaledVector(F.rel.clone().sub(rest), -w * w * dt).multiplyScalar(1 / (1 + 2 * zeta * w * dt)).addScaledVector(Kc.accS, -0.55 * dt);
        F.rel.addScaledVector(F.relV, dt); if (F.lmax > DIM.leg * 0.985) F.lmax = Math.max(DIM.leg * 0.985, F.lmax - 0.12 * dt); const L = F.rel.length(), L1 = clamp(L, 0.45, Math.max(DIM.leg * 0.985, F.lmax || 0)); if (L !== L1) { F.rel.multiplyScalar(L1 / L); const n = F.rel.clone().normalize(); F.relV.addScaledVector(n, -F.relV.dot(n)); } }
      // p3d-0.11.6: 늘어뜨린 다리가 다른 다리(디딘·가는 다리)를 지나가면 그 다리 뒤(벽 반대쪽)로 비킨다 — 엇갈려 디딘 왼발의 정강이가 늘어진 오른쪽 넓적다리를 12cm 지나갔다(leg_cross). 비키는 양(F.lx)은 계산 걸음에서 초속 1.2m까지만 바뀐다
      if (DIM.boxCollide && !globalThis.OLDLEGX && (globalThis.LX_FREE || (globalThis.FREECROSS && S.climb.crS && S.climb.crS[1 - F.i] > 0.3 && S.climb.feet[1 - F.i].box && S.climb.feet[1 - F.i].box.kind !== 'floor')) && S.climb.feet[1 - F.i].st !== 'free') {
        // 실험(기본 끔): FREECROSS = 다른 발이 바닥이 아닌 발판에 엇갈려 디뎌졌을 때(자세 정리 ② — h1의 W 구간 겹침 11.9 → 6.8cm였지만 다른 벽 시험의 두 벽 잡기가 깨져 뺐다), LX_FREE = 언제나(같은 까닭으로 뺐다).
        //   (0.11.6 끝에 이 줄 가운데에 주석을 붙여 아래 선언이 주석이 되어 있었다 — 꺼져 있어서 드러나지 않았다)
        const yaw = S.body.yaw, back = V(-Math.sin(yaw), 0, -Math.cos(yaw)), oL = otherLeg(S, 1 - F.i), sx = F.i ? -1 : 1, base = hj.clone().add(F.rel);
        const gapAt = x => { const a = base.clone().addScaledVector(back, x), kn = legIK(S, hj, a, yaw, sx, false).ik.mid; return legGap(hj, kn, a, oL); };
        const clearAt = x => !nearBox(S.world, base.clone().addScaledVector(back, x), 0.08); let want = 0; if (gapAt(F.lx || 0) < CL.LEGX_CLR || (F.lx || 0) > 0) { want = 0; for (let x = 0; x <= 0.40; x += 0.04) { if (!clearAt(x)) break; want = x; if (gapAt(x) >= CL.LEGX_CLR + 0.01) break; } }
        F.lx = (F.lx || 0) + clamp(want - (F.lx || 0), -1.2 * dt, 1.2 * dt); if (F.lx > 1e-4) { F.rel.addScaledVector(back, F.lx); const L = F.rel.length(); if (L > DIM.leg * 0.985) F.rel.multiplyScalar(DIM.leg * 0.985 / L); F.rel.addScaledVector(back, 0); } }
      else F.lx = 0;
      F.a.copy(hj).add(F.rel);
      // 늘어뜨린 발·발끝이 벽·턱 옆면에 들어가면 들어가지 않을 때까지 벽에서 뗀다
      // 벽·턱의 옆면만 본다(발이 윗면 위에 있거나 바닥에 가까운 것은 아래의 "닿은 발"이 다룬다). 들어간 만큼만 가장 얕은 쪽(옆 또는 위)으로 빼내고(한 걸음에 5cm까지), 그쪽으로 들어가던 속도는 지운다
      // (전에는 언제나 뒤로 3cm씩 밀어, 바닥·윗면 가까이에서는 걸음마다 30cm씩 날아갔고 옆의 발판에 닿으면 3cm 단위로 떨었다)
      { const fw = V(Math.sin(S.body.yaw), 0, Math.cos(S.body.yaw)), out = (q, m, top) => { let n = null; for (const x of S.world.boxes) { if (x.kind === 'floor' || q.y >= x.max.y + top || q.y <= x.min.y - m) continue; const d = [[q.x - x.min.x + m, -1, 0, 0], [x.max.x + m - q.x, 1, 0, 0], [q.z - x.min.z + m, 0, 0, -1], [x.max.z + m - q.z, 0, 0, 1]]; if (d.some(e => e[0] <= 0)) continue; d.push([x.max.y + top - q.y, 0, 1, 0]); const o = d.sort((a, c) => a[0] - c[0])[0], k = Math.min(o[0], 0.05); n = V(o[1] * k, o[2] * k, o[3] * k); q.add(n); } return n; };
        // 발끝 점: 사람형 몸은 발이 길다(발목에서 발끝 24cm) — 그 끝으로 잰다
        for (const [off, m, top] of [[V(), 0.03, -0.02], [DIM.boxCollide ? fw.clone().multiplyScalar(DIM.toeZ - 0.01).add(V(0, -(DIM.ankleY - 0.03), 0)) : fw.clone().multiplyScalar(0.13).add(V(0, -0.05, 0)), 0.01, 0.01]]) { const q = F.a.clone().add(off), n = out(q, m, top); if (n) { F.a.add(n); F.rel.add(n); if (F.relV) { const u = n.clone().normalize(); F.relV.addScaledVector(u, -Math.min(0, F.relV.dot(u))); } } } }
      const g = groundAt(S.world, F.a.x, F.a.z, F.a.y - DIM.ankleY + 0.04, 0, 0), g2 = groundAt(S.world, F.a.x, F.a.z, F.a.y + 0.05, 0, 0.12);
      F.clear = g2.box ? Math.max(0, F.a.y - DIM.ankleY - g2.y) : 9;
      if (g.box && F.a.y - DIM.ankleY <= g.y) {
        // 닿은 발: 다리가 닿는 자리이고 몸이 올라가는 중이 아니면 디딘다. 아니면 발끝만 닿은 채 둔다(면 아래로 들어가지 않게 올려 둔다)
        const yaw = S.body.yaw, fwd = V(Math.sin(yaw), 0, Math.cos(yaw)), p = V(F.a.x, g.y, F.a.z).addScaledVector(fwd, DIM.ballZ), q = Q().setFromAxisAngle(UP, yaw), G = footGeom(p, UP, q);
        F.a.y = g.y + DIM.ankleY; F.rel.copy(F.a).sub(hj); if (F.relV) { if (F.relV.y < 0) F.relV.y = 0; F.relV.multiplyScalar(0.85); }
        // p3d-0.11.7(자세 정리 ⑤): 몸이 옆으로 빨리 가는 동안(PLANT_HV 초속 1m 넘게 — 다른 벽 시험에서 두 손으로 모서리를 돌아오는 몸은 0.65~0.78, C의 흔들림은 1.7~2.4)은 닿기만 하고 디디지 않는다 — C(흔들어 턱 E를 잡음)에서 초속 1.5m로 가는 중에 닿은 두 발이 바로 디뎌져, 몸이 50cm 더 간 뒤 두 다리가 35° 비스듬히 모인 채 멈췄다. OLDPLANTV = 전처럼
        //   막 떨어진 발(PLANT_HV_T 안)도 그대로 디딘다 — 서서 옆의 턱을 잡으면(D) 잡기 보정이 몸을 1~2cm 당겨 두 발이 떨어지는데, 막으면 몸이 바닥 위로 45cm 흔들려 갔다(옛 규칙은 0.03초 뒤 다시 디딤)
        //   다른 발이 이미 디뎌 있으면(매달려 흔드는 것이 아니다) 그대로 디딘다 — 그것까지 막으면 다른 벽 시험에서 모서리를 돌아오며 닿은 발이 늦게 디뎌져 몸이 10cm 더 가고 다음 손이 닿지 않아 떨어졌다
        const hvOk = globalThis.OLDPLANTV || !DIM.boxCollide || Math.hypot(S.body.vel.x, S.body.vel.z) <= CL.PLANT_HV || S.climb.feet[1 - F.i].st === 'plant' || (S.climb.tick - (F.offTick ?? -1e9)) * PHY.DT < CL.PLANT_HV_T;
        if (hvOk && !(F.cool > 0) && !(F.userOff && F.offBox === g.box) && S.body.vel.y <= 0.05 && hj.distanceTo(G.ank) <= DIM.leg * 0.995 && hj.y - g.y >= CL.LEG_MIN_H) {
          Object.assign(F, { st: 'plant', kind: 'top', box: g.box, patch: patchOf(p, fwd, g.box), auto: true, load: 0, why: '' });
          F.p.copy(p); F.ball.copy(G.ball); F.ank.copy(G.ank); F.a.copy(G.ank); F.q.copy(q); F.n.copy(UP);
          note(S, 'step', 'foot', F.i, '닿아서 디딤', { box: g.box.name, auto: true });
        }
      }
    }
  }
}
function grab(S, H) {
  const K = S.climb; if (!(H.slack > 0)) H.slack = 0; H.grabTick = K.tick; H.st = 'hold'; H.drag = false; H.swivel = false; H.selfBlock = 0; H.armCross = 0; H.pass = 0; H.over = false; H.hn = null; H.w.copy(H.goal); H.load = 0; H.bad = 0; H.jam = 0; H.why = ''; H.F = null;
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
  K.fb = null; K.post = DIM.boxCollide ? ((S.opt && S.opt.posture) || 'rule') : 'base'; if (K.post === 'fb') K.fb = makeFB();
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
  // 사람형 몸(p3d-0.10.0): 몸통 = 골반·가슴 두 원기둥. 자리·높이는 그리는 메시를 잰 상자(DIM.boxHip·boxChest)를 따라 기울고 돌며, 반지름 = 상자의 앞뒤 반 두께.
  //   옛 몸의 원기둥(몸 원점 둘레 반지름 12cm)으로는 새 몸의 골반·가슴 앞면(몸 원점에서 17cm 앞)이 벽에 5cm 넘게 들어갔다(test/human_check.mjs)
  const torsoParts = DIM.boxCollide ? [['골반', T.hip, T.tq.hips, DIM.boxHip], ['가슴', T.chest, T.qC, DIM.boxChest]].map(([n, o, q, bx]) => { const c = o.clone().add(V(...bx.c).applyQuaternion(q)); return { n: '몸통', part: n, x: c.x, z: c.z, y0: c.y - bx.h[1], y1: c.y + bx.h[1], r: bx.h[2] }; })
    : [{ n: '몸통', x: b.pos.x, z: b.pos.z, y0: b.pos.y + 0.85, y1: b.pos.y + 1.50, r: CL.R_TORSO }];
  // p3d-0.11.9: 사람형 몸은 어깨 두 곳도 맞댄다(위팔 뿌리 굵기 — 전신 풀이의 어깨 항목과 같은 부피). 골반·가슴만 보면 전신 풀이가 골반을 뒤로 뺀 만큼 몸이 벽에 6cm 더 붙었고(h1: 옛 규칙 −2.845 → fb −2.91), 머리를 턱 밑에서 빼려고 가슴이 돌며 한쪽 어깨가 벽면 4cm 앞까지 나가 턱 F가 "팔이 턱에 걸려"로 거부됐다. OLDPHYSH = 맞대지 않음
  const shParts = DIM.boxCollide && !globalThis.OLDPHYSH && T.sh ? T.sh.map(p => ({ n: '어깨', x: p.x, z: p.z, y0: p.y - DIM.armR.upper[0], y1: p.y + DIM.armR.upper[0], r: DIM.armR.upper[0] })) : [];
  const parts = [...torsoParts, ...shParts, { n: '머리', x: T.head.x, z: T.head.z, y0: T.head.y - CL.R_HEAD, y1: T.head.y + CL.R_HEAD, r: DIM.boxCollide ? DIM.headR : CL.R_HEAD }];
  const shift = (dx, dy, dz) => { for (const Q2 of parts) { Q2.x += dx; Q2.z += dz; Q2.y0 += dy; Q2.y1 += dy; } };
  let bump = '';
  for (const P of parts) for (const x of S.world.boxes) {
    if (x.kind === 'floor' || P.y1 <= x.min.y || P.y0 >= x.max.y) continue;
    const cx = clamp(P.x, x.min.x, x.max.x), cz = clamp(P.z, x.min.z, x.max.z), dx = P.x - cx, dz = P.z - cz, d = Math.hypot(dx, dz);
    if (d >= P.r) continue;
    let nx, nz, ph;
    if (d > 1e-6) { nx = dx / d; nz = dz / d; ph = P.r - d; }
    else { const o = [[P.x - x.min.x + P.r, -1, 0], [x.max.x - P.x + P.r, 1, 0], [P.z - x.min.z + P.r, 0, -1], [x.max.z - P.z + P.r, 0, 1]].sort((a, c) => a[0] - c[0])[0]; ph = o[0]; nx = o[1]; nz = o[2]; }
    const pDown = P.y1 - x.min.y, pUp = x.max.y - P.y0, mid = (P.y0 + P.y1) / 2 < (x.min.y + x.max.y) / 2;
    if (mid && pDown < ph) { b.pos.y -= pDown; if (DIM.boxCollide) shift(0, -pDown, 0); else { P.y0 -= pDown; P.y1 -= pDown; } if (b.vel.y > 0) b.vel.y = 0; bump = `${P.n}: ${x.name} 아래에 닿음`; }
    else if (!mid && pUp < ph) { b.pos.y += pUp; if (DIM.boxCollide) shift(0, pUp, 0); else { P.y0 += pUp; P.y1 += pUp; } if (b.vel.y < 0) b.vel.y = 0; }
    else { b.pos.x += nx * ph; b.pos.z += nz * ph; if (DIM.boxCollide) shift(nx * ph, 0, nz * ph); else { P.x += nx * ph; P.z += nz * ph; } const vn = b.vel.x * nx + b.vel.z * nz; if (vn < 0) { b.vel.x -= vn * nx; b.vel.z -= vn * nz; K.stats.wallHit = Math.max(K.stats.wallHit, -vn); } }
  }
  if (bump && K.tick - K.bumpT > 120) { note(S, 'bump', null, 0, bump); K.bumpT = K.tick; }
  // p3d-0.12.0 자세 보조: 머리·어깨·몸통이 튀어나온 턱(벽·바닥이 아닌 상자)의 높이에 걸쳐 있거나 바로 아래(6cm)에서 올라가는 중이면, 그 턱의 바깥 면을 비켜 갈 만큼 몸을 벽에서 빼기를 청한다(K.clearNeed = 지금 뺀 거리 + 더 필요한 거리).
  //   없으면 벽에 붙은 몸이 턱 밑에 머리·어깨를 대고 멈췄다(사용자 영상: "부딪힘 · 머리: 턱 F 아래에 닿음", "몸통: 턱 A 아래에 닿음"). 사람은 윗몸을 뒤로 빼고 턱 앞을 지나 올라간다
  if (poseAssistOn(S)) { const o = outDir(S), lf = V(-o.z, 0, o.x); let need = -9;
    // 곧게 선 몸(몸의 기준 자리에 세운 골반·가슴·머리)으로도 잰다: 지금 자세로만 재면 풀이가 이미 윗몸을 젖히고 비틀어 턱을 피한 뒤라(가슴 숙임 한계 34°·옆 기울기 29°) 청하는 거리가 작게 나오고, 몸은 턱 밑에 낀 채 뒤틀려 있었다
    const neut = DIM.boxCollide ? [[DIM.hipY + DIM.boxHip.c[1], DIM.boxHip.h[1], DIM.boxHip.h[2], DIM.boxHip.h[0]], [1.345, DIM.boxChest.h[1], DIM.boxChest.h[2], 0.19], [1.68, DIM.headR, DIM.headR, DIM.headR]].map(([cy, hy, r, hw]) => ({ x: b.pos.x, z: b.pos.z, y0: b.pos.y + cy - hy, y1: b.pos.y + cy + hy, r, hw })) : [];
    // p3d-0.12.3: 옆으로 겹친 폭이 CLEAR_LAT(6cm)보다 좁으면 세지 않는다 — 머리가 턱 A의 끝에 4cm 걸친 것만으로 몸 전체를 24cm 뺐고, 낮은 손의 버티는 각을 지키느라 풀이가 가슴을 벽 쪽으로 24° 숙여 얼굴이 벽에 붙었다(사용자: "얼굴을 벽에 처박고 있다". 캡처 p2). 좁게 걸친 것은 풀이의 머리·몸통 여유 항이 옆으로 비킨다. OLDCLEARLAT = 옛 방식
    // 올라가는 중이 아니면 턱 밑에 6cm 넘게 겹친 부위만 센다: 서 있는 높이에서 머리 꼭대기가 턱 밑면에 4~5cm 걸친 것만으로 몸을 24cm 빼고 있었다(h1: 턱 F를 잡고 선 자세). 올라가는 중에는 6cm 앞서 본다
    for (const P of [...parts, ...neut]) for (const x of S.world.boxes) { if (x.kind === 'floor' || x.kind === 'wall' || P.y1 <= x.min.y + (b.vel.y > 0.03 ? -0.06 : 0.06) || P.y0 >= x.max.y + 0.02) continue; const hw = P.hw || P.r;
      const cs = [[x.min.x, x.min.z], [x.min.x, x.max.z], [x.max.x, x.min.z], [x.max.x, x.max.z]], ol = cs.map(c2 => c2[0] * lf.x + c2[1] * lf.z), pl = P.x * lf.x + P.z * lf.z; if (Math.min(pl + hw, Math.max(...ol)) - Math.max(pl - hw, Math.min(...ol)) < (globalThis.OLDCLEARLAT ? 0 : globalThis.CLEAR_LAT ?? CL.CLEAR_LAT)) continue;
      const ext = Math.max(...cs.map(c2 => c2[0] * o.x + c2[1] * o.z)); need = Math.max(need, ext + P.r + 0.015 - (P.x * o.x + P.z * o.z)); }
    // 디딘 발이 없으면(손에만 매달림) 청하지 않는다: 매달린 몸의 앞뒤 자리는 손 밑으로 정해져 몸 빼기가 듣지 않고, 청한 거리만 한계까지 쌓여 발을 올릴 때 쓸 여유를 다 썼다(높은 발판 1.2m가 다시 거부됐다)
    K.clearNeed = need > -9 && K.feet.some(f => f.st === 'plant') ? Math.max(0, (K.wout || 0) + need) : 0; } else K.clearNeed = 0;
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
    const a = 1 + (c.eps ?? eps) + lam * c.r.lengthSq(), b = R.clone().addScaledVector(Mo.clone().cross(c.r), -lam), f = b.clone().addScaledVector(c.r, lam * c.r.dot(b) / (a - lam * c.r.lengthSq())).multiplyScalar(1 / a);
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
function heldPole(S, s, sh, goal, yaw, sx, qC, nG) {
  // p3d-0.12.0 자세 보조: 팔꿈치를 고를 때 손목도 본다 — 팔뚝이 오는 쪽과 잡는 손의 방향(gripFrame의 fd) 사이가 손목 한계에 가까워지면(한계 − 8°부터) 그만큼 값에 넣는다(WRIST_W).
  //   없으면 꽉 접힌 팔에서 팔꿈치가 손보다 높이·어깨 뒤로 들린 후보가 골라져(위팔 범위·날개 값만 보고) 손목이 91° 꺾여 "손목이 그쪽으로 꺾이지 않음"으로 거부됐다(사용자 영상 v1 30~31.8초: 손이 어깨 위 19cm).
  //   사람은 팔꿈치를 손 아래에 두고 팔뚝을 세운다. nG = 잡는 면의 법선(판정이 넘겨 준다. 그림은 그 손의 상태에서 읽는다 — 같은 값)
  { const Hh = S.climb.hands[s === 'L' ? 0 : 1]; if (nG === undefined) nG = Hh && Hh.n && Hh.st !== 'free' && Hh.goal && Hh.goal.distanceToSquared(goal) < 4e-4 ? Hh.n : null; }
  const wOn = nG && poseAssistOn(S) && DIM.boxCollide && DIM.grip && DIM.grip.wristMax && !globalThis.OLDWRIST, wFd = wOn ? gripFrame({ n: nG }).fd : null, wLim = wOn ? (DIM.grip.wristMax + (assistOn(S) ? CL.ASSIST_WRIST : 0) - 8) * deg : 0;
  const wr = ik => (wOn ? WRIST_W * Math.max(0, ik.end.clone().sub(ik.mid).normalize().angleTo(wFd) - wLim) : 0);
  const base = armIK(S.world, sh, goal, yaw, sx, qC), B = selfShapes(S, s === 'L' ? 0 : 1), XA = globalThis.NOYIELD ? 0 : (globalThis.XA ?? 0.06), s0 = armSelf(B, base.ik, sh, 0, XA);
  // p3d-0.8.6: 잡고 있는 팔은 다른 팔이 6cm 안으로 다가오면 팔꿈치를 돌려 미리 자리를 내 준다(뻗는 팔은 겹치기 전에 멈추므로, 겹친 뒤에야 비키면 둘 다 서 버린다)
  // p3d-0.11.4(사용자 영상 0.11.3 v2 29.9초·v3 45초·v4 3초): 당겨 올라가 손이 어깨 위 30cm 안에 오면 기본 후보(바깥·아래)가 팔뚝을 수평으로 눕혀 팔꿈치가 손 높이까지 들렸다(닭 날개, 한 팔이면 머리 위로 접힘).
  //   재 보니 팔꿈치는 손보다 21cm 낮았지만 위팔이 바깥으로 거의 수평(어깨에서 옆 23cm·위 11cm)이었다 — 손이 어깨 앞·위에 있으면 사람은 팔꿈치를 앞(벽 쪽)·아래로 두고 팔뚝을 세운다.
  //   전신 자세 풀이(fb, 화면 기본)에서만 쓴다(옛 규칙에서는 앞으로 옮긴 위팔이 턱에 닿아 가슴이 열리며 다른 벽 시험의 흐름이 갈라졌다 — 그 규칙은 어깨가 벽에 가까워 앞쪽 후보가 대개 벽에 든다). 팔을 굽혔고(어깨–손 거리가 팔 길이의 85% 안 — 거의 편 팔은 팔꿈치 방향이 모양을 바꾸지 않는데 서서 잡는 보통 자세에까지 걸려 다른 벽 시험의 흐름이 갈라졌다) 손이 어깨보다 10cm 넘게 위일 때 위팔이 바깥으로 벌어진 몫(위팔 방향 · 바깥, 0.35 넘는 만큼)을 값에 넣고, 기본 후보가 그만큼 벌어져 있으면 둘레를 다 돌려 본다
  const outW = V(sx, 0, 0); if (qC) outW.applyQuaternion(qC); else outW.applyAxisAngle(UP, yaw);
  // p3d-0.11.5(사용자 스크린샷 0.11.4: 잡은 팔이 머리 위로 접힘): 몸이 손 밑으로 들어가 손이 머리 위(어깨보다 안쪽)에 오면 기본 후보의 팔꿈치가 얼굴 앞·안쪽으로 가 팔뚝이 머리를 덮었다.
  //   팔을 엇갈려 잡은 것이 아니면(이 손의 목표가 다른 손의 목표를 넘어 반대쪽에 있지 않으면) 손이 어깨보다 10cm 넘게 위일 때 팔꿈치가 어깨에서 바깥 5cm보다 안쪽인 만큼을 값에 넣는다(ELBOW_IN — 처음에는 안쪽으로 든 만큼만 넣었더니 팔꿈치가 정면 앞에 섰다). 사람형 몸·fb에서만. 실험값
  const oH = S.climb.hands[s === 'L' ? 1 : 0], crossed = oH && oH.st !== 'free' && goal.clone().sub(oH.goal).dot(outW) < -0.02;
  const ein = ik => (DIM.boxCollide && !globalThis.OLDPOLE && S.climb.post === 'fb' && !crossed && goal.y > sh.y + 0.10 ? ELBOW_IN * Math.max(0, 0.05 - ik.mid.clone().sub(sh).dot(outW)) : 0);
  // p3d-0.12.1(사용자, 0.12.0 영상 p2: "오른손으로 턱을 잡을 때 팔꿈치가 뒤로 간다. 보통 그렇게 꺾이지 않는다. 팔꿈치가 오른쪽으로 빠졌다가 옆구리로 붙으면서 상체가 올라간다"):
  //   재 보니 손이 어깨 바로 위 37~48cm일 때 팔꿈치는 어깨에서 바깥 7cm·뒤 14cm였다(바깥으로 벌어지는 것을 막는 위의 벌점 때문에 앞 아니면 뒤로 갔고, 앞은 벽·턱·머리에 막혀 뒤가 골라졌다).
  //   자세 보조 켬(새 자세 방식): ① 손이 어깨보다 위일 때 팔꿈치가 어깨보다 뒤(가슴이 보는 쪽의 반대)로 간 몫을 값에 넣는다(ELBOW_BACK) ② 바깥 벌림의 벌점은 팔뚝이 누운 만큼만 건다 —
  //   0.11.4에서 막으려던 닭 날개는 팔꿈치가 손 높이까지 들려 팔뚝이 수평인 자세였다. 팔뚝이 서 있으면(팔꿈치가 손보다 충분히 아래) 팔꿈치가 옆으로 나가는 것이 당겨 오르는 보통 모양이다. OLDELBACK = 옛 방식
  const eb = poseAssistOn(S) && !globalThis.OLDELBACK, fwdC = V(0, 0, 1); if (qC) fwdC.applyQuaternion(qC); else fwdC.applyAxisAngle(UP, yaw);
  const flat = ik => (eb ? clamp((0.62 - (ik.end.y - ik.mid.y) / DIM.foreArm) / 0.30, 0, 1) : 1);
  const ebk = ik => (eb && DIM.boxCollide && goal.y > sh.y + 0.10 ? ELBOW_BACK * Math.max(0, -ik.mid.clone().sub(sh).dot(fwdC) / DIM.upperArm - 0.10) : 0);
  const ehi = ik => (DIM.boxCollide && !globalThis.OLDPOLE && S.climb.post === 'fb' && goal.y > sh.y + 0.10 && sh.distanceTo(goal) < 0.85 * CL.ARM ? flat(ik) * ELBOW_WING * Math.max(0, ik.mid.clone().sub(sh).dot(outW) / DIM.upperArm - 0.35) : 0) + ebk(ik), e0hi = ehi(base.ik) + ein(base.ik);
  if (!s0 && !(base.over > 0) && !(e0hi > 0.004) && !(wr(base.ik) > 0)) return { pole: base.pole, ik: base.ik, self: null };
  const u = goal.clone().sub(sh); if (u.lengthSq() < 1e-8) return { pole: base.pole, ik: base.ik, self: s0 }; u.normalize();
  const e0 = base.pole.clone().addScaledVector(u, -base.pole.dot(u)); if (e0.lengthSq() < 1e-8) return { pole: base.pole, ik: base.ik, self: s0 }; e0.normalize();
  const e1 = u.clone().cross(e0), prev = S.pw && S.poleS && S.poleS['el' + s], pa = prev ? Math.atan2(prev.dot(e1), prev.dot(e0)) : 0; let best = null;
  // p3d-0.15.1(완등 홀드에 두 손 모으기의 실패를 따라가다 찾음 — 초록 11을 잡은 왼팔): 몸이 손 가까이 올라와 팔이 깊게 접히면(어깨–손 24cm) 둘레의 모든 방향이 지형·제 몸·어깨 범위 가운데 하나에 걸리는데,
  //   이 값에는 지형이 "팔꿈치가 상자 안이면 0.05"로만 들어 있어 어깨 범위를 21° 넘는 방향(0.044) 대신 **팔뚝이 벽 속으로 71mm 든 방향**이 골라졌다. 그 팔꿈치가 방금 잡았던 홀드 밑에 끼어, 손을 놓고 위로 보내면 "팔이 턱에 걸려"로 거부됐다.
  //   지형에 든 깊이(3.5cm보다 깊은 몫만 — 얕게 스치는 겹침까지 세면 후보가 걸음마다 오가 붙은 팔이 초속 300°를 넘는 걸음이 596 → 2,153번이 됐다. 2cm 문턱은 foot2·foot8에 남았다. HELD_DB)도 값에 넣는다(뻗는 팔의 고르기와 같은 1m = 10 — 단단한 조건이 부드러운 조건(관절 범위)에 가려지지 않게). 자세 보조 켬(새 자세 방식)에서만. OLDHELDTERR = 전처럼
  const HT = poseAssistOn(S) && DIM.boxCollide && !globalThis.OLDHELDTERR, tbH = HT ? (() => { const Hh = S.climb.hands[s === 'L' ? 0 : 1]; return Hh && Hh.edge ? Hh.edge.box : null; })() : null;
  const WH = HT ? (() => { const r = DIM.upperArm + DIM.foreArm + 0.08; return { boxes: S.world.boxes.filter(x => x.kind !== 'floor' && sh.x > x.min.x - r && sh.x < x.max.x + r && sh.y > x.min.y - r && sh.y < x.max.y + r && sh.z > x.min.z - r && sh.z < x.max.z + r) }; })() : null;
  const terr = ik => { if (!HT) return 0; const h = armHit(WH, sh, ik, tbH); return h ? 10 * Math.max(0, h.d - (globalThis.HELD_DB ?? 0.035)) : 0; };
  for (let j = 0; j < 24; j++) { const a = j * Math.PI / 12, an = a > Math.PI ? a - 2 * Math.PI : a, pl = e0.clone().multiplyScalar(Math.cos(a)).addScaledVector(e1, Math.sin(a)), ik = twoBone(sh, goal, DIM.upperArm, DIM.foreArm, pl), sf = armSelf(B, ik, sh), sm = XA ? armSelf(B, ik, sh, 0, XA) : sf;
    let dp = Math.abs(an - pa); if (dp > Math.PI) dp = 2 * Math.PI - dp;
    // 실제 겹침(머리·몸통, 여유 밖의 다른 팔)이 먼저다. 다른 팔과의 여유(6cm 안)는 가볍게만 본다 — 여유를 벌리려고 팔꿈치를 머리 쪽으로 돌리면 머리에 닿는다(0.8.6 작업 중에, 그것을 윗몸이 비키느라 엇갈려 잡은 몸이 36cm 옆으로 밀려갔다)
    const cost = 3 * sd(sf, 'body') + 3 * sd(sf, 'arm') + (globalThis.MW ?? 0.2) * Math.max(0, sd(sm, 'arm') - sd(sf, 'arm')) + (elbowIn(S.world, ik.mid) ? 0.05 : 0) + (e0hi > 0.004 && (sd(sf, 'body') > 0.005 || rayHit(S.world, sh.clone().lerp(ik.mid, 0.2), ik.mid) < 1 || rayHit(S.world, ik.mid, ik.mid.clone().lerp(ik.end, 0.9)) < 1) ? 0.5 : 0) + ARM_AW * armOver(sh, ik, sx, qC, yaw) + ehi(ik) + ein(ik) + wr(ik) + terr(ik) + 0.004 * Math.abs(an) + (prev ? 0.006 * dp : 0);
    if (!best || cost < best.cost - 1e-7) best = { cost, pole: pl, ik, self: sf }; }
  return best;
}

// ── 벽 문맥의 한 걸음 ──
// 전신 자세 풀이의 한 걸음(p3d-0.11.0): 붙은 손발·가는 손발·하중·지형을 모아 풀이에 넘긴다(src/fbik.js). 풀이 값은 torso()를 거쳐 물리와 그림에 함께 들어간다
const boxArr = x => x._a || (x._a = { min: [x.min.x, x.min.y, x.min.z], max: [x.max.x, x.max.y, x.max.z] });
// 몸통의 축과 가슴이 향하려는 쪽(잡은 손들로 정한다). fbUpdate와 미리보기(reachShift)가 같은 식을 쓴다
function fbAims(S, held, left, fwd) { const b = S.body, fb = S.climb.fb;
  const lean = held.length ? 0.05 + 0.15 * fb.sup : 0, ax = V(0, 1, 0).addScaledVector(fwd, -lean).normalize();
  if (held.length) { const c = V(); for (const h of held) c.add(h.goal); c.multiplyScalar(1 / held.length).sub(V(b.pos.x, b.pos.y + DIM.hipY + 0.15, b.pos.z)); if (c.lengthSq() > 1e-4) ax.multiplyScalar(1 - fb.hang).addScaledVector(c.normalize(), fb.hang).normalize(); }
  let yawT = 0; if (held.length) { const cH = V(); for (const h of held) cH.add(h.goal); cH.multiplyScalar(1 / held.length).sub(V(b.pos.x, b.pos.y, b.pos.z)); yawT = clamp(Math.atan2(cH.dot(left), Math.max(0.15, cH.dot(fwd))) * 0.6, -0.5, 0.5); }
  return { ax, yawT }; }
function fbUpdate(S, inp, dt, held, planted, left, fwd) {
  const b = S.body, K = S.climb, fb = K.fb, BW = CL.MASS * PHY.G, pos = [b.pos.x, b.pos.y, b.pos.z], a3 = v => [v.x, v.y, v.z];
  const boxes = []; for (const x of S.world.boxes) { if (x.kind === 'floor' || x.max.x < pos[0] - 1.3 || x.min.x > pos[0] + 1.3 || x.max.z < pos[2] - 1.3 || x.min.z > pos[2] + 1.3 || x.max.y < pos[1] - 0.3 || x.min.y > pos[1] + 2.5) continue; boxes.push(Object.assign(boxArr(x), { src: x })); }
  // 손이 받는 몫(세로 힘 기준, 천천히 바뀐다)과 발판 위에 섰는가
  let hl = 0, fl = 0; for (const h of held) hl += Math.max(0, h.F ? h.F.y / BW : h.load || 0); for (const f of planted) fl += Math.max(0, f.F ? f.F.y / BW : f.load || 0);
  const hangT = held.length ? (planted.length ? hl / (hl + fl + 1e-3) : 1) : 0, supT = held.length && planted.some(f => f.load > 0.1 && f.box.kind !== 'floor') ? 1 : 0, kS = 1 - Math.exp(-7 * dt);
  fb.hang += (hangT - fb.hang) * kS; fb.sup += (supT - fb.sup) * kS;
  // 몸통의 축이 향할 쪽: 발로 서면 위(발판 위에서는 벽에서 조금 뒤로), 손에 매달리면 무게중심 → 잡은 손들의 가운데
  const AY = fbAims(S, held, left, fwd), ax = AY.ax;
  // 팔을 엇갈려 잡을 때(나중에 건너간 팔의 어깨가 벽 쪽) 가슴이 돌아 있으려는 쪽 — 두 팔이 서로를 지나가지 않게(p3d-0.8.5의 규칙을 풀이의 바람으로)
  const gOf = h => (h.st === 'hold' || (h.st === 'reach' && h.edge) ? h.goal : null), g0 = gOf(K.hands[0]), g1 = gOf(K.hands[1]), isX = !!g0 && !!g1 && g0.clone().sub(g1).dot(left) < -0.02, rch = K.hands.find(h => h.st === 'reach');
  const twist = isX ? (((rch ? rch.i : (K.lastReach ?? 1)) ? 1 : -1) * 0.45 * (globalThis.XTW ?? (globalThis.CROSSOVER ? -1 : 1))) : 0, up = (inp.cy || 0) > 0;
  // 가슴이 향하려는 쪽: 잡은 손들의 가운데(몸이 보는 쪽에서 옆으로 치우친 만큼, 끝 ±0.5rad). 두 손을 나란히 잡으면 0 — 가슴이 까닭 없이 한쪽으로 틀어지지 않게
  let yawT = AY.yawT;
  // p3d-0.11.9: 다리를 거의 다 편(93%) 채 발판에 서서 손을 잡고 있는데 몸이 처지기 시작하면(0.2초 넘게 아래로) 그때부터 잡은 팔이 옆으로 비스듬히 당기지 않게 어깨를 손 아래 쪽에 둔다(fbik의 stand).
  //   처지기 전에 늘 걸면 다 편 다리로 서서 손을 엇갈려 보내는 교차가 턱에 걸렸다(교차 네 가지 중 둘). 손을 뻗거나 발을 옮기거나 W·A·D를 누르거나 다리를 굽히면 풀린다. OLDGRIPLAT = 옛 방식
  { const tall = planted.some(f => f.kind === 'top' && (f.load || 0) > 0.4 && K.T && f.ank && K.T.hj[f.i].distanceTo(f.ank) > 0.93 * CL.LEG), busy = up || (inp.cx || 0) || K.hands.some(h => h.st === 'reach') || K.feet.some(f => f.st === 'move');
    K.sagT = tall && !busy && b.vel.y < -0.01 ? (K.sagT || 0) + dt : 0; if (globalThis.OLDGRIPLAT || busy || !tall) K.standFix = false; else if (K.sagT > 0.2) K.standFix = true; }
  yawT += K.aim ? K.aim.y : 0;
  // 풀이가 잡은 팔과 견줄 머리 타원(p3d-0.15.4): 앞 걸음의 목·고개 자세를 가슴에 붙여 넘긴다(가운데의 가슴 기준 자리, 가슴 기준 방향). selfBody의 머리와 같은 식
  let headE = null; if (K.T && K.T.tq && linkOn(S) && !globalThis.NOHELDCLR) { const T0 = K.T, qC0 = T0.qC, qN0 = qC0.clone().multiply(T0.tq.neck), qHd0 = qN0.clone().multiply(T0.tq.head), qCi0 = qC0.clone().invert(), E0 = headEll(), ec = V(...DIM.oNeck).applyQuaternion(qC0).add(V(...DIM.oHead).applyQuaternion(qN0)).add(V(...E0.c).applyQuaternion(qHd0)).applyQuaternion(qCi0), qr = qCi0.multiply(qHd0); headE = { off: [ec.x, ec.y, ec.z], q: [qr.x, qr.y, qr.z, qr.w], r: E0.r }; }
  const c = { pos, yaw: b.yaw, boxes, headE, ARM: CL.ARM, LEG: CL.LEG, LEGMIN: 0.30, kneeClr: DIM.kneeClr, axis: a3(ax), pitch: -0.12 * clamp(K.pz.tuck, 0, 1), twist, yawT,
    arms: K.hands.map(h => ({ st: h.st === 'hold' ? 1 : h.st === 'reach' ? 2 : 0, goal: a3(h.goal), w: 1, clr: 0, clr0: null, pole: h.st === 'hold' && h.elPole ? a3(h.elPole) : null, low: h.st === 'hold' && h.low && !globalThis.NOLINKSOLVE ? 1 : 0, cone: h.st === 'hold' && h.low && !globalThis.NOLINKSOLVE ? (planted.some(f => f.kind === 'top' && f.box && f.box.kind !== 'floor') ? 1 : globalThis.FLOORROOM && !globalThis.NOFLOORCONE && (fb.hang || 0) < 0.3 && (held.length === 2 || globalThis.FLOORCONE1) && planted.some(f => f.kind === 'top' && f.box) ? (globalThis.FLOORCONE ?? 2) : 0) : 0 })),
    legs: K.feet.map(f => ({ st: f.st === 'plant' || (f.st === 'move' && f.outT > 0 && poseAssistOn(S)) ? 1 : f.st === 'move' ? 2 : 0, ank: a3(f.ank), w: 1, pole: S.poleS && S.poleS['kn' + f.s + 'p'] ? a3(S.poleS['kn' + f.s + 'p']) : null, aW: f.st !== 'free' && K.T && !globalThis.OLDFBKNEE ? kneeWant(S, f.i ? -1 : 1, K.T.hj[f.i], f.ank, b.yaw + K.po.yaw) : null, kw: f.st !== 'free' && K.T && !globalThis.OLDFBKNEE && !globalThis.OLDCROSSKNEE ? 1 + CL.CROSS_KW * (K.crS ? K.crS[f.i] : 0) : 1, load: f.st === 'plant' && f.box && f.box.kind !== 'floor' ? clamp(f.F ? f.F.y / BW : f.load || 0, 0, 1) : 0 })),
    shr: K.hands.map(h => (h.st === 'reach' && h.goal.y > b.pos.y + 1.4 ? 0.40 : h.st === 'hold' && (h.load || 0) > 0.5 && !up && !rch ? 0.28 : 0)), iters: fb.cost > 3 ? 2 : 1, stand: K.standFix ? 1 : 0, pa: poseAssistOn(S) ? 1 : 0, press: pressOn(S) && planted.some(f => f.kind === 'top' && f.box && f.box.kind !== 'floor') ? 1 : 0, foldD: (globalThis.FOLD_SOLVE ?? 0.26) + (globalThis.FOLD_HANG ?? 0.10) * clamp(fb.hang, 0, 1), foldHi: linkOn(S) && !globalThis.NOLINKSOLVE && !globalThis.NOFOLDALL ? (globalThis.FOLD_HI ?? CL.FOLD_KEEP) + 0.06 * clamp(fb.hang, 0, 1) : 0, pzT: -Math.min(0.16, (K.woutL || 0) * CL.OUT_PELVIS) };
  // p3d-0.11.9: 손으로 잡고 있는 턱은 아래로 늘리지 않는다(실제 턱 + 머리 여유만). 매달린 사람의 머리는 잡은 손 밑에 온다 — 늘린 상자(15cm) + 여유(4cm)로는 잡은 턱 밑 약 30cm 안에 머리가 들어갈 수 없어,
  //   W로 올라서면 풀이가 가슴을 31° 비틀고 29° 기울여 머리를 옆으로 뺐다(h1. 그 비틀린 가슴 때문에 뻗는 팔이 접혀 올라갔다 — 사용자 지적). 잡지 않은 턱은 그대로 늘린다(밑으로 들어가지 않고 비켜 올라간다). OLDHEADHELD = 모두 늘림
  const heldBox = new Set(globalThis.OLDHEADHELD ? [] : K.hands.filter(h => h.st === 'hold' && h.edge).map(h => h.edge.box));
  c.boxesHead = boxes.map(x => (heldBox.has(x.src) ? { min: x.min, max: x.max } : { min: [x.min[0], x.min[1] - 0.15, x.min[2]], max: x.max }));
  // 전신 연결(p3d-0.15.4): 한 손을 뻗는 동안 **버티는 손의 팔이 실제로 제 몸통·머리에 걸리기 시작하면**(물리의 걸림 h.jam이 HELD_JAM초 넘게 이어짐 — 0.15초가 되면 놓친다) 그때부터 그 뻗기가 끝날 때까지 풀이가 그 팔을 겹치기 4mm 앞까지 빼낸다(fbik heldPen).
  //   처음에는 뻗는 동안 늘 걸었다(걸리기 전부터 막았다). 표본에서는 버티던 손이 풀리는 것이 18 → 4였지만 클라이밍장 봇의 완등이 20 → 13이 됐다 — 팔이 머리 옆을 스치며 지나가 잡던 뻗기(물리는 0.15초 안의 걸림을 놓침으로 세지 않는다)까지 "닿지 않음"이 됐다. 고치려는 것은 "걸린 채 0.15초가 지나 놓치는 것"뿐이다. NOHELDCLR = 끔
  //   켜진 뒤에는 그 손을 놓거나 몸 위로(W)를 누를 때까지 둔다(W에서는 0.12.0의 걸림 멈춤이 맡는다). 처음에는 뻗기가 끝나면 껐는데, 쉬운 조작(화면 기본)에서는 모자란 손이 잡던 자리로 돌아가 다시 잡는 순간 항이 꺼져 자세가 되돌아가며 다시 걸려 놓쳤다. HELD_REACHONLY = 뻗는 동안에만(처음 넣은 방식)
  { const rch2 = K.hands.some(h => h.st === 'reach'), up2 = (inp.cy || 0) > 0, on = linkOn(S) && !globalThis.NOHELDCLR && !up2 && !K.push; for (const h of K.hands) { const A = c.arms[h.i]; if (!on || h.st !== 'hold' || !A.pole || (globalThis.HELD_REACHONLY && !rch2)) { h.clrOn = false; continue; } if ((h.jam || 0) > (globalThis.HELD_JAM ?? 0.025) && (rch2 || !globalThis.HELD_REACHTRIG)) h.clrOn = true; if (h.clrOn) { A.clr = 1; A.clr0 = [-9, -9]; } } }
  stepFB(fb, c, dt); fb.ctx = c;
  K.po.x = 0; K.po.z = 0; K.po.yaw = fb.x[FBI.YH]; K.po.xV = 0; K.po.zV = 0; K.po.yawV = 0;
}
export function stepClimb(S, inp, dt) {
  const b = S.body, K = S.climb, W = S.world, m = CL.MASS, BW = m * PHY.G;
  b.events.length = 0; b.t += dt;
  // 자세 규칙(p3d-0.10.1, GPT의 0.10.0 검토 "㉮와 참고 자세 선택 + 접촉 IK를 대표 장면에서 비교"): 'rule' = 사람형 몸의 새 규칙(기본), 'base' = 0.10.0, 'ref' = 참고 자세 색인(캡처 빌드의 실험 설정)
  K.post = DIM.boxCollide ? (S.opt.posture || 'rule') : 'base';
  // 엇갈린 정도(crossK)는 계산 걸음마다 한 번, 초속 CROSS_RATE까지만 바뀐다(p3d-0.11.7). 바닥이 아닌 발판이고 그 발판이 몸이 보는 벽에 붙어 있을 때만 센다(두 벽 사이에서 몸이 돌아 옆 벽의 발판에 남은 발까지 엇갈림으로 보면 다른 벽 시험의 잡기가 깨졌다). 그대로 쓰면 몸이 경계(안쪽 10cm)를 오갈 때 무릎의 바람이 뛰어 디딘 무릎이 0.1초 사이에 5cm 오갔다(motion_scan v3)
  if (K.on && K.T && DIM.boxCollide) { K.crS = K.crS || [0, 0]; const bf = V(Math.sin(b.yaw), 0, Math.cos(b.yaw)); for (const F of K.feet) { const al = F.box && F.box.kind !== 'floor' ? clamp((-boxFacing(S.world, F.box, bf.clone().negate()).dot(bf) - 0.5) / 0.3, 0, 1) : 0, tgt = F.st === 'free' || !al ? 0 : al * crossK(F.i ? -1 : 1, K.T.hj[F.i], F.st === 'plant' ? F.ank : F.a, b.yaw + K.po.yaw); K.crS[F.i] += clamp(tgt - K.crS[F.i], -CL.CROSS_RATE * dt, CL.CROSS_RATE * dt); } } else K.crS = [0, 0];
  if (K.post === 'fb' && !K.fb) K.fb = makeFB();
  if (K.post === 'ref' && S.ref && K.tick % 4 === 0 && K.T) { const B = S.rig.bones, P2 = CL.PALM, pts = [B['hand.L'].localToWorld(V(0, -P2, 0)), B['hand.R'].localToWorld(V(0, -P2, 0)), worldPos(B['foot.L']), worldPos(B['foot.R'])];
    const r = lookup(S.ref, featOf(pts, worldPos(B.hips), b.yaw), [K.hands[0].st === 'hold', K.hands[1].st === 'hold', K.feet[0].st === 'plant', K.feet[1].st === 'plant']);
    K.refT = r ? { w: clamp(1 - (r.dist - 0.4) / 0.6, 0, 1), yaw: r.pelvis.yaw * deg, knee: r.knee, dist: r.dist, clips: r.clips } : null; }
  if (K.blend && (K.blend.t += dt) >= CL.BLEND_T) K.blend = null;
  const held = K.hands.filter(h => h.st === 'hold'), planted = K.feet.filter(f => f.st === 'plant');
  // 몸은 잡은 턱 쪽을 본다
  // p3d-0.10.2(새 규칙): 턱의 옆면(끝)을 잡으면 그 법선이 벽과 나란해 몸이 45°를 초속 200°로 가속·감속 없이 돌았다(h3·m1·m3·m5). 옆면의 몫을 SIDE_FACE로 줄이고, 도는 빠르기에 가속 한계(TURN_ACC)를 둔다 — 최대 빠르기(TURN)는 그대로. 실험값
  // p3d-0.10.3(새 규칙, GPT의 0.10.2 검토 2번 "손목 방향과 몸 전체 방향을 분리"): 몸이 보는 쪽은 잡은 **면**의 법선이 아니라 그 턱이 붙은 **벽이 보는 쪽**(boxFacing: 상자의 열린 옆면 가운데 가장 넓은 것)으로 정한다.
  //   같은 벽의 얇은 턱 끝(옆면)을 잡으면 몸은 돌지 않고 손목만 그 면을 따른다(그림). 다른 벽(모서리 벽 등)에 있는 잡을 곳이면 그 벽 쪽으로 돈다. 0.10.2까지는 옆면 법선을 평균해 몸이 45° 돌았다. 비교: YAWMODE=face(0.10.2)
  const nr = K.post !== 'base' && DIM.boxCollide, yawWall = nr && globalThis.YAWMODE !== 'face', nW = V(); for (const h of held) { if (yawWall && h.edge) nW.add(boxFacing(S.world, h.edge.box, h.n, b.pos)); else nW.addScaledVector(h.n, nr && Math.abs(h.n.y) < 0.5 && Math.abs(h.n.x) > 0.7 ? CL.SIDE_FACE : 1); }
  // p3d-0.10.4: 몸은 잡은 손이 등 뒤로 가는 쪽으로는 돌지 않는다(다른 벽 시험 지형: 모서리에서 벽 A의 손을 놓자 남은 벽 B의 손 쪽으로 몸이 90° 돌아, 몸이 아직 벽 A 앞에 있는데 벽 B의 손이 등 뒤가 되어 놓쳤다).
  //   목표 쪽으로 가는 길에서, 잡은 손마다 어깨 → 잡은 자리가 몸의 앞쪽(armCheck의 등 뒤 기준 + 0.15)에 남는 데까지만 간다. 몸이 모서리를 돌아가면 더 돈다. 끄기: YAWFREE=1
  const yawOk = (y) => { const c = Math.cos(y - b.yaw), sn = Math.sin(y - b.yaw), f = V(Math.sin(y), 0, Math.cos(y)); for (const h of held) { if (!K.T) return true; const r = K.T.sh[h.i].clone().sub(b.pos), sh = V(r.x * c + r.z * sn, r.y, -r.x * sn + r.z * c).add(b.pos), dir = h.goal.clone().sub(sh); dir.y *= 0.5; if (dir.normalize().dot(f) < CL.SHOULDER_BACK + 0.15) return false; } return true; };
  if (nW.lengthSq() > 0.01) { nW.normalize(); const d0 = Math.atan2(-nW.x, -nW.z) - b.yaw; let d = Math.atan2(Math.sin(d0), Math.cos(d0));
    if (nr && yawWall && !globalThis.YAWFREE && Math.abs(d) > 0.02 && !yawOk(b.yaw + d)) { let ok = 0; for (let j = 1; j <= 16; j++) { if (yawOk(b.yaw + d * j / 16)) ok = j; else break; } d = d * ok / 16; }
    if (nr) { const want = clamp(d * 8, -CL.TURN, CL.TURN), w0 = K.yawW || 0; K.yawW = w0 + clamp(want - w0, -CL.TURN_ACC * dt, CL.TURN_ACC * dt); b.yaw += clamp(K.yawW * dt, -Math.abs(d), Math.abs(d)); }
    else b.yaw += clamp(d, -CL.TURN * dt, CL.TURN * dt); } else K.yawW = 0;
  // 기울기(편한 기본 자세의 임시 규칙): 발로 버티면 윗몸을 조금 뒤로. 손으로만 매달리면 잡은 손의 어깨가 올라가고 엉덩이가 그 손 아래로 온다(한 손 매달림)
  const left = V(Math.cos(b.yaw), 0, -Math.sin(b.yaw)), fwd = V(Math.sin(b.yaw), 0, Math.cos(b.yaw)), sup = planted.some(f => f.load > 0.1 && f.box.kind !== 'floor');
  // 쉬운 조작 ③ 자동 몸 맞추기(p3d-0.13.0): 예약된 손의 목표가 AUTO_MAX 안으로 모자라고 몸 입력(W·A·S·D·점프)이 없으면, 어깨에서 목표 쪽으로 W·A·D를 누른 것과 같은 입력을 넣는다.
  //   몸은 플레이어가 누를 때와 같은 길로만 움직인다(지금 붙은 손발이 낼 수 있는 힘, 같은 빠르기 한계·멈춤 규칙). 닿게 되면 예약이 손을 보낸다. 닿는 거리가 실제로 느는 보조다 — W를 얼마나 누를지 맞추지 않아도 된다. NOAUTOBODY = 끔
  //   고침: 뻗다가 멈춘 손(H.auto — limbsStep이 정한다)에만 한다. 위아래와 옆 가운데 더 큰 쪽 하나만 누른다(둘을 함께 누르면 한 발로 선 몸이 좌우로 흔들렸다)
  // p3d-0.15.1: 자동 몸 맞추기가 한 일을 잰다 — 시작할 때의 몸 자리·접촉을 적어 두고, 끝날 때(잡음·멈춤·거부·직접 입력) 몸이 옮겨 간 거리와 그사이 바뀐 접촉을 기록(autoEnd)과 K.autoStat에 남긴다.
  //   AUTO_MAX(30cm)는 "손이 모자란 거리"의 발동 조건이지 몸이 옮겨 가는 거리의 한계가 아니다(한계는 AUTO_T 1.2초와 0.35초 동안 나아지지 않으면 멈춤)
  { const sig = () => K.hands.map(h => (h.st === 'hold' && h.edge ? h.edge.box.name : '-')).join('/') + ' | ' + K.feet.map(f => (f.st === 'plant' && f.box ? f.box.name : '-')).join('/');
    for (const h of K.hands) { const on = h.st === 'reach' && h.auto; if (on && !h.autoPos0) { h.autoPos0 = b.pos.clone(); h.autoSig = sig(); h.autoPath = 0; h.autoLast = b.pos.clone(); }
      else if (on) { h.autoPath += b.pos.distanceTo(h.autoLast); h.autoLast.copy(b.pos); }
      else if (h.autoPos0) { const mv = b.pos.distanceTo(h.autoPos0), s1 = sig(), got = h.st === 'hold', chg = s1 !== h.autoSig; (K.autoStat = K.autoStat || []).push({ i: h.i, moved: mv, path: h.autoPath, got, sig0: h.autoSig, sig1: s1 });
        note(S, 'autoEnd', 'hand', h.i, `몸이 ${Math.round(mv * 100)}cm 옮겨 감 · ${got ? '잡음' : '못 잡음'}${chg ? ` · 접촉 바뀜(${h.autoSig} → ${s1})` : ''}`); h.autoPos0 = null; } } }
  if (autoBodyOn(S) && K.T && !(inp.cx || 0) && !(inp.cy || 0) && !inp.jump && !K.push) { const H = K.hands.find(h => h.st === 'reach' && h.auto);
    if (H) { const u = H.goal.clone().sub(K.T.sh[H.i]).normalize(), l = u.dot(left), vert = Math.abs(u.y) >= Math.abs(l), cy = vert ? (u.y > 0.3 ? 1 : u.y < -0.5 ? -1 : 0) : 0, sd = !vert && Math.abs(l) > 0.3 ? Math.sign(l) : 0; if (cy || sd) inp = { ...inp, cy, cx: -sd, cxSign: 1, auto: true }; } }
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
    for (const h of K.hands) if (h.st !== 'hold') h.elPole = null;
    if (!globalThis.NOSELF) for (const h of held) { const hp = heldPole(S, h.s, Tn.sh[h.i], h.goal, b.yaw, h.i ? -1 : 1, Tn.qC), sf = hp.self && hp.self.body && hp.self.body.head ? hp.self.body : null; h.elPole = hp.ik.mid.clone().sub(Tn.sh[h.i]);
      if (sf) { hit = true; const k = Math.min(sf.d / 0.01, 2) * 5 * dt / 0.65 * 0.1 * (DIM.boxCollide ? 3 : 1); g.x += -sf.n.dot(fwd) * k * 6.5; g.z += sf.n.dot(left) * k * 6.5; } // 사람형 몸은 세 배 빨리 비킨다(p3d-0.10.1: 땅 → 벽 섞기 동안 머리가 팔에 5걸음 겹쳤다)
      else if (loose) { const s2 = armSelf(selfShapes(S, h.i), hp.ik, Tn.sh[h.i], 0.015); if (s2 && s2.body && s2.body.head) loose = false; } }
    // p3d-0.11.2: 목표 6cm 안까지 온 뻗는 팔의 끝 자세가 머리를 지나가야 하면(한 손 매달림에서 다른 손을 머리 위의 턱에 모을 때) 잡은 팔과 같이 머리가 비킨다(고개를 젖히고 옆으로 뺀다). 0.11.1까지는 손목이 목표 1cm 앞에서 "몸에 막혀"로 거부됐다
    if (DIM.boxCollide && !globalThis.NOSELF && !globalThis.NOREACHYIELD) for (const h of K.hands) if (h.st === 'reach' && h.edge && h.w.distanceTo(h.goal) < (poseAssistOn(S) ? 0.30 : 0.06)) { const hp = heldPole(S, h.s, Tn.sh[h.i], h.goal, b.yaw, h.i ? -1 : 1, Tn.qC), sf = hp.self && hp.self.body && hp.self.body.head ? hp.self.body : null;
      if (sf) { hit = true; const k = Math.min(sf.d / 0.01, 2) * 5 * dt / 0.65 * 0.3; g.x += -sf.n.dot(fwd) * k * 6.5; g.z += sf.n.dot(left) * k * 6.5; } }
    // p3d-0.12.0 자세 보조: 뻗는 손이 머리에 닿으면 고개가 빨리 비킨다(0.1 → 0.5)
    if (DIM.boxCollide) for (const h of K.hands) if (h.st === 'reach' && h.headTouch) { hit = true; const k = Math.min(h.headTouch.d / 0.01, 2) * 5 * dt / 0.65 * (h.over ? 0.4 : poseAssistOn(S) ? 0.5 : 0.1); g.x += -h.headTouch.n.dot(fwd) * k * 6.5; g.z += h.headTouch.n.dot(left) * k * 6.5; }
    if (!hit && loose) { const k = Math.exp(-1.2 * dt); g.x *= k; g.z *= k; } g.x = clamp(g.x, -0.35, 0.35); g.z = clamp(g.z, -0.35, 0.35);
    // p3d-0.12.4 자세 보조: 볼 곳을 보느라 돌린 고개가 잡은 팔에 닿으면 고개 돌리기를 줄인다(K.lookK 1 → 0, 닿는 동안 초당 6, 여유 1.5cm를 두고도 닿지 않으면 초당 1.5로 되돌린다). 볼 곳을 따라 도는 것은 모양인데, 머리의 충돌 공이 고개를 따라 움직여
    //   겨눈 곳(실제 플레이에서는 마우스가 늘 넘긴다)을 보는 것만으로 "팔이 머리를 지나감 → 놓침 → 떨어짐"이 났다(왼손 턱 A·왼발 발판·W 0.5~0.9초에 턱 F를 겨눔. 겨눈 곳 없이 도는 시험에서는 나지 않아 몰랐다). OLDLOOKYIELD = 옛 방식
    K.lookK = poseAssistOn(S) && !globalThis.OLDLOOKYIELD ? clamp((K.lookK ?? 1) + (hit ? -6 * dt : loose ? 1.5 * dt : 0), 0, 1) : 1; }
  // 고개 젖히기(p3d-0.10.1, 사람형 몸만): 머리 공 위 15cm 안에 턱·벽의 아랫면이 있고 머리가 그 아래로 반지름 + 2cm 안에 들면 그만큼 젖힌다(지렛대 18cm로 각을 정함, 끝 0.5rad).
  //   반지름 + 4cm 밖으로 벗어나면 천천히 되돌린다(젖힌 뒤의 머리 자리로 재므로 사이에 2cm의 이력을 둔다 — 걸음마다 젖혔다 폈다 하지 않게)
  if (DIM.boxCollide) { const hd = (K.T || torso(b, K)).head, r = DIM.headR; let need = 0, near = false;
    for (const x of S.world.boxes) { if (x.kind === 'floor' || x.min.y < hd.y || x.min.y > hd.y + r + 0.15) continue;
      const d = Math.hypot(hd.x - clamp(hd.x, x.min.x, x.max.x), hd.z - clamp(hd.z, x.min.z, x.max.z)), wv = clamp(1 - (x.min.y - hd.y - r) / 0.15, 0, 1);
      if (d < r + 0.04) near = true; if (d < r + 0.02) need = Math.max(need, (r + 0.02 - d) * wv); }
    K.hc = clamp((K.hc || 0) + (need > 0 ? need / 0.18 * Math.min(1, 12 * dt) : near ? 0 : -(K.hc || 0) * (1 - Math.exp(-2 * dt))), 0, 0.5); } // p3d-0.8.6: 윗몸이 아니라 목·머리의 각이다(끝 0.35rad = 20°. 머리 가운데가 7cm쯤 비킨다. 그래도 닿으면 더 비키지 않는다)
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
    // (해 보고 뺀 것, 실험 OPENCAND=1: 잡은 손을 armCheck처럼 heldPole이 고른 팔꿈치로 보기 — 교차는 그대로 깨지고 다른 벽 시험이 하나 더 깨졌다)
    // p3d-0.8.4(몸 연결): 위팔이 턱·벽에 겹치면 그 어깨가 벽에서 멀어지게 가슴을 연다(K.open). 전에는 뻗는 쪽 어깨를 언제나 벽 쪽으로 0.30 돌려, 턱 바로 아래에서 뻗으면 어깨가 턱 앞면 2cm 앞까지 가서 위팔(반지름 5.5cm)이 턱에 겹쳤다.
    //   겹친 깊이만큼 열고, 여유(1.5cm)를 두고도 겹치지 않을 때만 천천히 되돌린다(그 사이에서는 그대로 둔다 — 열었다 닫았다 떨지 않게). 손은 이 때문에 멈추지 않는다(손을 멈추는 것은 팔뚝의 겹침뿐)
    { const fw = V(Math.sin(b.yaw), 0, Math.cos(b.yaw)), Tn = K.T || torso(b, K); K.open = K.open || [0, 0]; K.upHit = K.upHit || [0, 0];
      for (const h of K.hands) { let d = 0, loose = true;
        if (h.st !== 'free' && S.poleS && S.poleS['el' + h.s]) { const tgt = h.st === 'hold' ? h.goal : h.w, ik = h.st === 'hold' && DIM.boxCollide && !globalThis.OLDELBOW && globalThis.OPENCAND ? heldPole(S, h.s, Tn.sh[h.i], tgt, b.yaw, h.i ? -1 : 1, Tn.qC).ik : twoBone(Tn.sh[h.i], tgt, DIM.upperArm, DIM.foreArm, S.poleS['el' + h.s]), tb = h.edge ? h.edge.box : null, u = (armHit(W, Tn.sh[h.i], ik, tb) || {}).u, u2 = (armHit(W, Tn.sh[h.i], ik, tb, 0.015) || {}).u;
          if (u && u.n.dot(fw) < -0.3) d = u.d; loose = !(u2 && u2.n.dot(fw) < -0.3); }
        K.upHit[h.i] = d; K.open[h.i] = clamp(K.open[h.i] + (d > 0 ? Math.min(d / 0.01, 2) * 5 * dt : loose ? -0.8 * dt : 0), 0, 1); } }
    // 팔을 엇갈려 잡고 있는 동안(p3d-0.8.5): 나중에 건너간 팔의 어깨를 벽 쪽으로 둔 채로 있는다(가슴을 그대로 비틀어 둔다). 두 어깨와 두 손이 한 평면에 놓이면 두 팔이 X자로 서로를 지나가므로, 어깨의 앞뒤를 달리해 한 팔이 다른 팔 앞을 지나가게 한다
    // p3d-0.8.6: 뻗는 손의 목표가 다른 손 너머(교차)일 때도 같은 쪽으로 비튼다. 푸는 동안에도 스프링으로 이어서 돌아온다(목표가 바뀔 뿐 값은 건너뛰지 않는다)
    if (reach) K.lastReach = reach.i;
    const xs = globalThis.XTW ?? (globalThis.CROSSOVER ? -1 : 1), gOf = h => (h.st === 'hold' || (h.st === 'reach' && h.edge) ? h.goal : null), g0 = gOf(K.hands[0]), g1 = gOf(K.hands[1]), isX = !!g0 && !!g1 && g0.clone().sub(g1).dot(left) < -0.02 && !globalThis.NOARMS;
    // 교차 중에는 더 크게 비튼다(0.45 — 가슴이 34°쯤 돈다. 0.30으로는 엇갈려 잡은 두 팔뚝이 2.6cm 겹쳤고 다 편 교차는 길이 없었다. 윗몸을 뒤로 물리는 것으로 풀면 팔 길이에 끌려 몸이 딸려 갔다)
    const XT = globalThis.XT ?? 0.45, crossed = !reach && isX ? xs * ((K.lastReach ?? 1) ? 1 : -1) * XT : 0, reachT = reach ? (reach.i ? 1 : -1) * (isX ? xs * XT : 0.30) : 0;
    springS(Z, 'twist', clamp((reach ? reachT : one ? (one.i ? 1 : -1) * 0.18 : crossed) + (globalThis.NOOPEN ? 0 : 0.5) * (K.open[0] - K.open[1]), -0.6, 0.6), 0.12, dt);
    let hr = 0; const pl = planted.filter(f => f.load > 0.05);
    if (pl.length) { const c = V(); for (const f of pl) c.add(f.p); c.multiplyScalar(1 / pl.length); hr = clamp(b.pos.clone().sub(c).dot(left) / 0.25, -1, 1) * 0.22; }
    else if (hanging) hr = clamp(b.vel.dot(left) * 0.10, -0.15, 0.15) + side * 0.10;
    springS(Z, 'hipRoll', hr + 0.035 * (Z.idleW || 0) * Math.sin(Z.breath * 1.5) - 0.06 * K.stretch.s * (K.stretchUp || 0) * (reach ? (reach.i ? 1 : -1) : 0), 0.10, dt);
    const mv = K.feet.find(f => f.st === 'move'), tgt = mv ? mv.p : reach ? reach.goal : inp.look ? V(...inp.look) : null; let ly = 0, lp = 0;
    if (tgt && K.T) { const d = tgt.clone().sub(K.T.head).applyQuaternion(K.T.qC.clone().invert()); if (d.z > -0.1) { ly = clamp(Math.atan2(d.x, d.z), -1.0, 1.0); lp = clamp(-Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.7, 0.8); } }
    // p3d-0.12.3 자세 보조(사용자: "위로 올라가려면 위를 봐야 하는데 얼굴을 벽에 처박고 있다"): 볼 곳이 없을 때(옮기는 발·뻗는 손·겨눈 곳이 모두 없음 — 스크립트 장면, 마우스가 벽 밖)도 손을 잡고 있으면 가장 높이 잡은 손의 조금 위를 본다.
    //   전에는 가슴이 향한 쪽을 그대로 봐서, 엉덩이를 빼고 가슴이 벽 쪽으로 숙은 자세에서 얼굴이 벽을 향했다(캡처 p2: 가슴 −24°, 얼굴 위로 10°). 가만히 있을 때의 둘러보기는 그 위에 얹힌다. OLDLOOKUP = 옛 방식
    if (!tgt && K.T && held.length && poseAssistOn(S) && !globalThis.OLDLOOKUP) { const top = held.reduce((a, h) => (h.goal.y > a.goal.y ? h : a), held[0]), up = top.goal.clone().add(V(0, CL.LOOK_UP, 0)).sub(K.T.head), hz = V(up.x, 0, up.z), el = Math.min(globalThis.LOOK_EL ?? CL.LOOK_EL, Math.atan2(up.y, hz.length()));
      if (hz.length() < 0.05) hz.set(0, 0, 1).applyQuaternion(K.T.qC).setY(0); hz.normalize(); const d = hz.multiplyScalar(Math.cos(el)).add(V(0, Math.sin(el), 0)).applyQuaternion(K.T.qC.clone().invert()); if (d.z > -0.1) { ly = clamp(Math.atan2(d.x, d.z), -1.0, 1.0) * 0.5; lp = clamp(-Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.7, 0.8); } }
    if (!tgt && hanging) ly = side * 0.5;
    // 가만히 있는 동안(1.5초 넘게 입력·손발 이동 없음): 머리가 천천히 둘러보고 골반이 아주 조금 오간다(실제 영상에서는 머무는 동안에도 몸이 계속 움직인다 — 품질 검토 13.2). 모양만이다
    K.idleT = inp.cx || inp.cy || inp.jump || reach || mv || b.vel.length() > 0.12 ? 0 : (K.idleT || 0) + dt;
    { const wI = clamp((K.idleT - 1.5) / 1.0, 0, 1); if (wI > 0 && !tgt) { ly += 0.38 * wI * Math.sin(Z.breath * 1.18); lp += 0.10 * wI * Math.sin(Z.breath * 0.83 + 1); } Z.idleW = wI; }
    // p3d-0.12.4 자세 보조(사용자: "머리가 마우스를 따라가면 그에 맞게 상체 조정도 있는가" → "그렇게 진행해"): 겨눈 곳(inp.look)이 있고 손을 뻗거나 발을 옮기는 중이 아니면 가슴도 그쪽으로 조금 따라간다(K.aim → fbUpdate의 가슴 목표).
    //   좌우로만, AIM_YAW까지, 머리보다 느리게(0.22초). 앞뒤(젖힘·숙임)는 넣었다가 뺐다 — 가슴 숙임의 바람을 6배로, 몸통 축의 바람을 4배로 주어도 듣지 않았다(잡은 손의 버티는 각이 가슴의 앞뒤를 정한다). 가만히 있을 때만(손·발을 보내는 중, W·A·D·점프, 몸이 초속 0.15m 넘게 움직이는 중에는 0.08초로 0으로 돌아간다 — 겨눈 곳을 넘긴 채 W로 오르게 두었더니 같은 입력의 몸 높이가 0.26 → 0.13m로 달라졌다: 조준만으로 오르는 결과가 바뀌면 안 된다). 손을 뻗는 동안에는 0으로 돌아간다 — 뻗을 때는 뻗는 어깨가 벽 쪽으로 나가야 해서 보는 쪽으로 가슴을 돌리면 덜 닿는다. 방향은 몸의 기준 자리에서 잰다(가슴에서 재면 제 값을 되먹는다). OLDAIMBODY = 끔
    { let ay = 0; const calm = !mv && !reach && !(inp.cx || 0) && !(inp.cy || 0) && !K.push && !inp.jump && b.vel.length() < 0.15; if (calm && inp.look && held.length && poseAssistOn(S) && !globalThis.OLDAIMBODY) { const d = V(...inp.look).sub(V(b.pos.x, b.pos.y + 1.68, b.pos.z)), f = d.dot(fwd), l = d.dot(left); if (f > -0.1) ay = clamp(Math.atan2(l, Math.max(0.15, f)), -1, 1) * (globalThis.AIM_YAW ?? CL.AIM_YAW); }
      K.aim = K.aim || { y: 0 }; springS(K.aim, 'y', ay, calm ? 0.22 : 0.08, dt); }
    { const lk = K.lookK ?? 1; ly *= lk; lp *= lk; }
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
      if (sup.length) { let c = 0, w = 0, top = null; for (const f of sup) { c += f.ank.clone().sub(b.pos).dot(left) * f.load; w += f.load; if (!top || f.load > top.load) top = f; } // 멀리 뻗어야 닿는 발판으로 가는 발에는 쓰지 않는다(다리를 78% 넘게 펴야 하는 만큼 줄인다): 골반이 남는 발 쪽으로 가면 뻗는 발이 그만큼 덜 닿는다(해 보니 5cm 모자라던 옆 발판이 8cm 모자랐다 — 영상의 기록에서 찾음)
        const farK = mv ? 1 - clamp((Tn.hj[mv.i].distanceTo(mv.ank) / DIM.leg - 0.78) / 0.14, 0, 1) : 1;
        const one = mv ? farK : top.box.kind !== 'floor' ? clamp((top.load / w - 0.6) / 0.25, 0, 1) : 0; tx += one * clamp(c / w * CL.PO_SIDE * (mv ? 1.4 : 1), -CL.PO_SIDE_MAX, CL.PO_SIDE_MAX); }
      for (const f of K.feet) { if (f.st === 'free' || f.kind !== 'top' || (f.st === 'plant' && f.box.kind === 'floor')) continue; const hj = Tn.hj[f.i], d = f.ank.clone().sub(hj), sx = f.i ? -1 : 1;
        const fold = clamp((0.66 - d.length() / DIM.leg) / 0.26, 0, 1), front = clamp((d.dot(fwd) - 0.08) / 0.12, 0, 1); tz = Math.min(tz, -CL.PO_BACK * fold * front);
        ty += -sx * CL.PO_YAW * clamp((-sx * d.dot(left) - 0.05) / 0.20, 0, 1); }
      // ㉮ 규칙(p3d-0.10.1, 사람형 몸): 발판에 높이 디딘 발(다른 발보다 10cm 넘게 높고 제 쪽에 있는 것)이 하중을 받는 만큼 골반이 그 발 쪽으로 돈다(끝 0.35rad = 20°). 참고 색인의 "발 올림" 장면은 가운데 9°, 올라가는 순간은 30°대였다
      if (K.post !== 'base' && DIM.boxCollide) { const pf = planted.filter(f => f.box.kind !== 'floor');
        for (const f of pf) { const o = K.feet[1 - f.i], dh = f.ank.y - (o.st === 'plant' ? o.ank.y : b.pos.y + DIM.ankleY), sx = f.i ? -1 : 1, own = sx * f.ank.clone().sub(Tn.hj[f.i]).dot(left) > -0.05;
          if (own) ty += sx * 0.35 * clamp((dh - 0.10) / 0.25, 0, 1) * clamp((f.load - 0.1) / 0.3, 0, 1); }
        // ㉮ 규칙: 높이 디딘 다리가 바라는 무릎 각(35°)에서 넓적다리가 벽·턱에 여유(kneeClr)만큼 떨어지지 못하면, 무릎을 더 벌리기 전에 엉덩이를 그만큼 벽에서 뺀다(끝 12cm).
        //   0.10.0은 무릎만 벌려(여유 값이 무릎을 77~80°로 밀었다) 개구리 자세가 됐고 그래도 넓적다리가 벽에 5~6cm 들었다. 사람은 엉덩이를 빼서 무릎이 들어올 자리를 만든다(참고 영상 5382882의 5.0~5.4초)
        for (const f of [...pf, ...K.feet.filter(g => g.st === 'move' && g.box && g.box.kind !== 'floor')]) { const sx = f.i ? -1 : 1, hj = Tn.hj[f.i], an = f.st === 'move' ? f.ank : f.ank, py = b.yaw + K.po.yaw;
          const pl = V(sx * Math.sin(35 * deg), 0.1, Math.cos(35 * deg)).applyAxisAngle(UP, py).normalize(), k2 = twoBone(hj, an, DIM.thigh, DIM.shin, pl);
          const dist = Math.min(...[0.45, 0.7, 1].map(t => boxDist(S.world, hj.clone().lerp(k2.mid, t)))); tz = Math.min(tz, -clamp((DIM.kneeClr - dist) * 1.3, 0, 0.10) * clamp(1 - (K.hc || 0) / 0.25, 0, 1)); } } // 머리가 위의 턱 밑에서 고개를 젖히는 동안(K.hc)은 덜 뺀다 — 골반을 빼면 윗몸이 앞으로 기울어 머리가 턱에 닿아 W로 오르지 못했다(턱 A → 턱 F, 오른 높이 28 → 15cm) // 고관절 자리는 지금 골반의 자리를 따르므로 빼는 만큼 여유가 생겨 저절로 멈춘다(이력을 더하면 스스로 커져 늘 끝까지 빠졌다 — 해 봄)
      if (K.post === 'ref' && K.refT) ty = ty * (1 - K.refT.w) + K.refT.yaw * K.refT.w; // 참고 자세: 가까운 참고 장면의 골반 돌림을 그 거리만큼(0.4m 안 = 다 따름, 1m 밖 = 따르지 않음)
      const rch = K.hands.find(h => h.st === 'reach'); if (rch && K.stretch.s > 0.01) { const d = rch.goal.clone().sub(Tn.sh[rch.i]); tx += -CL.PO_REACH * K.stretch.s * clamp(d.dot(left) / Math.max(d.length(), 1e-6) * 1.6, -1, 1); }
    }
    const slow = K.post !== 'base' && DIM.boxCollide && !globalThis.PO_FAST ? 2 : 1; // PO_FAST = 시험용 비교 스위치(0.15초로 따라감)
    // 새 규칙(p3d-0.10.1)은 골반이 두 배 천천히 따라간다 — 골반 돌림·엉덩이 빼기가 0.15초로 따라가면 어깨가 함께 움직여 잡은 팔이 초속 300°를 넘는 걸음이 늘었다(718 → 1,052)
    K.poT = { x: tx, z: tz, yaw: ty }; if (fbOn(K)) { K.knA = null; fbUpdate(S, inp, dt, held, planted, left, fwd); } else if (K.post === 'solve' && poseOn(K)) solvePose(S, K, { x: tx, z: tz, yaw: clamp(ty, -0.7, 0.7) }, held, dt); else { K.knA = null; springS(P, 'x', tx, 0.13 * slow, dt); springS(P, 'z', tz, 0.15 * slow, dt); springS(P, 'yaw', clamp(ty, -0.7, 0.7), 0.15 * slow, dt); } }
  // p3d-0.12.0 자세 보조: 손발이 청한 "몸을 벽에서 빼는 거리"(K.woutT)를 따라 K.out이 OUT_V로 움직인다. 기준 자리의 깊이(발판 가운데·벽 딛기의 OUT_FEET)와 전신 자세 풀이의 골반 앞뒤 값에 더해진다.
  //   가는 발 = 청한 값(F.needOut), 디딘 발 = 디딜 때의 값을 지킨다(F.holdOut — 몸이 다시 붙으면 고관절이 범위를 넘어 발이 떨어진다. 4cm 덜 빼도 판정을 통과하면 천천히 줄인다), 뻗는 손 = H.needOut. 잡은 손이 없으면 0
  { let T = 0; for (const F of K.feet) { if (F.st === 'free') { F.needOut = 0; F.holdOut = 0; F.outT = 0; } else if (F.st === 'move') { F.holdOut = 0; T = Math.max(T, F.needOut || 0); }
      else { if (F.holdOut > 0 && K.tick % 6 === 0 && K.T && F.ank && !legCheck(S, F.i, K.T.hj[F.i].clone().addScaledVector(outDir(S), -CL.OUT_STEP), F.ank)) F.holdOut = Math.max(0, F.holdOut - 0.3 * 6 * dt); T = Math.max(T, F.holdOut || 0); } }
    for (const H of K.hands) { if (H.st !== 'reach') { H.needOut = 0; H.outTried = false; } else T = Math.max(T, H.needOut || 0); }
    // 골반만 뒤로 빼는 몫(K.woutL)은 손발이 청한 것만 따른다: 턱을 비켜 가려는 몫(clearNeed)까지 골반 치우침에 넣으면 무게중심을 맞추느라 가슴이 벽 쪽으로 나가 턱에 더 가까워졌고, 풀이가 가슴을 한계(34°)까지 틀어 잡은 팔이 몸통을 지나갔다
    const TL = T; T = Math.max(T, K.clearNeed || 0);
    if (!poseAssistOn(S) || !held.length) T = 0; else T = Math.min(T, (K.wout || 0) + outRoom(S));
    K.woutT = T; K.wout = (K.wout || 0) + clamp(T - (K.wout || 0), -CL.OUT_V * dt, CL.OUT_V * dt);
    K.woutL = Math.min(K.wout, (K.woutL || 0) + clamp(Math.min(TL, T) - (K.woutL || 0), -CL.OUT_V * dt, CL.OUT_V * dt)); }
  // p3d-0.12.3 자세 보조: 벽면에 댄 발(smear)이 있으면 기준 자리의 깊이를 몸에 맞춰 되돌리지 않는다(OLDSMEARLEAD = 옛 방식). 되돌리면 "발 하중이 0.1을 넘어야 몸이 벽에서 떨어지고, 몸이 떨어져야 발 하중이 는다"가 되어, 하중이 0.09~0.10에 머물면 끝내 벽에 붙은 채 흔들렸다(캡처·벽 딛기: 고개를 들어 몸 자리가 1cm 달라진 것만으로 갈렸다)
  if (hanging) { K.ref.x = b.pos.x; if (!(poseAssistOn(S) && !globalThis.OLDSMEARLEAD && planted.some(f => f.kind === 'smear'))) K.ref.z = b.pos.z; } else K.ref.addScaledVector(left, side * CL.SHIFT_V * dt);
  const upV = globalThis.RISE_V ?? (globalThis.OLDRISE ? CL.SHIFT_V : CL.RISE_V); // RISE_V = 시험용: 위아래 빠르기만 바꿔 본다(빠르기 탓인 결과와 구조 탓인 결과를 가르려고)
  // 오버행(p3d-0.15.0): 오버행 면의 홀드(box.tilt > 0)를 잡았거나 그리로 손을 뻗는 동안, 몸의 기준 자리는 그 손목 자리보다 OVER_OUT만큼은 벽에서 떨어져 있다.
  //   위의 균형 잡기는 몸을 디딘 발판 위로 보내는데, 오버행에서는 발판이 손보다 벽 쪽 깊이 있어(15°·높이 1.5m면 40cm) 어깨가 홀드의 밑으로 들어가 팔이 그 홀드에 걸렸다("팔이 턱에 걸려").
  //   사람은 발은 안쪽에 두고 엉덩이·어깨를 손 아래로 뺀다. 곧은 벽의 홀드에는 걸지 않는다(전과 같다). OLDOVEROUT = 끔
  if (!globalThis.OLDOVEROUT) { let lim = null; for (const h of K.hands) if ((h.st === 'hold' || h.st === 'reach') && h.edge && h.edge.box.tilt > 0) { const d = h.goal.clone().sub(K.ref).dot(fwd); lim = lim === null ? d : Math.min(lim, d); }
    if (lim !== null && lim < CL.OVER_OUT) K.ref.addScaledVector(fwd, -Math.min(CL.OVER_OUT - lim, 0.6 * dt)); }
  // p3d-0.11.10: 남은 거리로 멈출 수 있는 빠르기를 넘지 않는다(제동 2.5m/s²: v ≤ √(2·a·d)) 기준 자리(ref)가 오르는 빠르기도 같은 한계(기준 자리가 몸보다 앞서 올라가 있으면 따라가는 힘이 다리를 지나치게 편다) — 발판(바닥 아님: 바닥에 선 다리는 이미 다 펴져 있어 팔로 당겨 오르지 못했다)에 디딘 다리가 다 펴지는 자리(97%)·잡은 팔이 다 접히는 자리(FOLD+3cm)까지 — 팔은 0으로 멈추지 않고 초속 0.28m("몸이 손을 지나 올라가 놓음"의 0.3 아래)까지만 줄인다(0으로 멈추면 매달려 당겨 오르는 높이가 21 → 12cm로 줄었다). 0.75m/s로 오르자 다리가 길이의 100.6%까지 지나쳐 발이 몸을 놓고 손에 걸린 몸이 옆으로 초속 1m로 휘청였다. OLDBRAKE = 옛 방식
  // p3d-0.12.2 자세 보조(사용자: 윗몸·고개가 과하게 젖혀진다): 발판을 디디고 오를 때는 잡은 손이 어깨에서 접힘 거리(FOLD_D 36cm) 안으로 들어오기 전에 오르기를 멈춘다(전에는 초속 0.28m로 계속 올랐다).
  //   계속 오르면 낮은 쪽 손이 어깨 높이에 오고, 전신 자세 풀이가 어깨를 손에서 36cm 떼려고 가슴을 한계(34°)까지 젖혀 머리가 골반보다 35cm 뒤로 갔다(캡처 동작의 p2: 몸 높이 0.48m).
  //   접힘 거리를 줄여 보면(0.30~0.22) 덜 젖혀지지만 "몸이 손을 지나 올라가 놓음"으로 그 손을 놓쳤다 → 거리는 그대로 두고 높이를 멈춘다. 더 오르려면 낮은 손을 올려 잡는다(누르기 = 맨틀은 아직 없다).
  //   손에만 매달려 당겨 오를 때(발판 없음)는 옛 방식 그대로. OLDFOLDSTOP = 옛 방식
  // 전신 연결: 낮은 손(h.low) — 곧게 선 어깨(지금 자세로 재지 않는다)에서 손으로 가는 선이 위에서 LOW_ON(48°)보다 더 누우면 켜지고 LOW_OFF(42°) 안으로 서면 꺼진다(이력). 줄 모델(팔의 선 방향으로만 당김)이 버티는 한계(GRIP_ANG 50°) 바로 앞이다.
  //   새 규칙(팔 힘의 방향·걸리기 전 멈춤·풀이의 팔 항)은 낮은 손에만 건다 — 손이 어깨보다 충분히 위인 보통 등반은 0.15.2와 같다(처음에는 발판을 디딘 모든 손에 걸었더니 클라이밍장 봇 30번의 완등이 20 → 14쯤으로 줄었다: 벽면을 디딘 발이 몸을 벽에서 떼어 두는 규칙을 이기고, 턱 밑에 몸이 끼었다)
  { const on = linkOn(S), g = on ? fbFK(FB0, [0, 0, 0], 0) : null; for (const h of K.hands) { if (!on || h.st !== 'hold') { h.low = false; continue; }
      const u = h.goal.clone().sub(V(b.pos.x, b.pos.y + g.sh[h.i][1], b.pos.z).addScaledVector(left, g.sh[h.i][0]).addScaledVector(fwd, g.sh[h.i][2])).normalize(); h.low = u.y < (h.low ? CL.LOW_OFF : CL.LOW_ON); } }
  // (p3d-0.15.3: 무엇이 오르기를 멈추는지 upWhy에 적는다 — 'leg' 디딘 다리가 다 펴짐 · 'top' 누르는 팔이 다 펴짐 · 'fold' 팔이 다 접힘 · 'gap' 손이 어깨 높이 · 'jam' 팔이 제 몸에 걸림. 값은 전과 같다)
  let upLim = 9, upWhy = ''; const limUp = (v, why) => { if (v < upLim) { upLim = v; upWhy = why; } };
  if ((inp.cy || 0) > 0 && K.T && !globalThis.OLDBRAKE) { const sup = planted.filter(f => f.kind === 'top' && f.ank && f.box && f.box.kind !== 'floor'); if (sup.length) limUp(Math.sqrt(2 * 2.5 * Math.max(0, 0.97 * CL.LEG - Math.min(...sup.map(f => K.T.hj[f.i].distanceTo(f.ank))))), 'leg'); { const prs = pressOn(S) && sup.length, stand = sup.length && poseAssistOn(S) && !globalThis.OLDFOLDSTOP && !prs, gap = globalThis.FOLD_GAP ?? CL.FOLD_GAP; for (const h of held) { if (prs) limUp(Math.sqrt(2 * 2.5 * Math.max(0, h.goal.y + CL.PRESS_TOP * CL.ARM - (b.pos.y + CL.SH_Y0))), 'top'); limUp(Math.max(0.28, Math.sqrt(2 * 2.5 * Math.max(0, K.T.sh[h.i].distanceTo(h.goal) - CL.FOLD - 0.03))), 'fold'); if (stand) limUp(Math.sqrt(2 * 2.5 * Math.max(0, h.goal.y - (b.pos.y + CL.SH_Y0) - gap)), 'gap'); } } }
  // p3d-0.12.0 자세 보조: 잡은 팔이 제 몸에 걸리기 시작하면(놓치기 0.15초 전부터 쌓이는 h.jam) 더 올라가지 않고, 걸림이 풀릴 때까지 조금 내려온다. W를 뗄 때까지 다시 오르지 않는다(걸림 경계에서 오르내리며 떨지 않게).
  //   없으면 좁게 잡은 두 손으로 끝까지 당겨 올린 높이에서 접힌 팔이 가슴에 걸려 "팔이 몸통을 지나감 → 놓침"이 됐다 — 사람은 팔이 더 접히지 않는 데서 멈춘다
  { const jam = poseAssistOn(S) && held.some(h => (h.jam || 0) > 0); if (!((inp.cy || 0) > 0)) K.jamStop = false; else if (jam) K.jamStop = true;
    if (K.jamStop && !K.push) { upLim = 0; upWhy = 'jam'; if (jam) K.ref.y = Math.min(K.ref.y, b.pos.y) - 0.25 * dt; }
    // 전신 연결(p3d-0.15.3): 걸린 뒤에 내려오는 대신, 지금 빠르기로 멈출 수 있는 높이(2cm + v²/5 — 제동 2.5m/s²)의 어깨와 거기서 4cm 더 위의 어깨로 같은 판정(armCheck)을 미리 해 보고 둘 다 걸리면(얇게 스치는 구간은 지나가게 둔다 — 걸림은 0.15초를 넘어야 놓친다) 그 자리에서 멈춘다(내려가지 않고, 손을 놓치지도 않는다). 까닭은 upWhy로 화면에 알린다. OLDPREJAM = 끔
    else if (linkOn(S) && !globalThis.OLDPREJAM && (inp.cy || 0) > 0 && !K.push && K.T && upLim > 0 && held.some(h => { if (!h.low) return false; const d0 = 0.02 + Math.max(0, b.vel.y) * b.vel.y / 5; return [d0, d0 + 0.04].every(dy => armCheck(S, h.i, K.T.sh[h.i].clone().add(V(0, dy, 0)), h.goal)); })) { upLim = 0; upWhy = 'jam'; } }
  K.upWhy = (inp.cy || 0) > 0 && !K.push && upLim < 0.03 ? upWhy : ''; if (globalThis.DBGUP) { K.upLimDbg = upLim; K.upWhyDbg = upWhy; }
  // 멈춘 까닭은 W를 누르는 동안 한 번만 기록에 남긴다(전신 연결 켬에서만 — 끔의 기록은 앞 판과 같게 둔다)
  if (!((inp.cy || 0) > 0)) K.upNoted = ''; else if (K.upWhy && K.upNoted !== K.upWhy && linkOn(S) && !inp.auto) { K.upNoted = K.upWhy; note(S, 'wstop', null, 0, K.upWhy); }
  // p3d-0.15.3(GPT의 0.15.2 검토: W를 누르는데 몸이 내려간다): 아래의 "기준 자리는 몸보다 upLim × 0.12 넘게 앞서지 않는다"는 오르기를 멈출 때 앞선 몫을 거두는 것인데,
  //   멈춘 채(upLim 0) 몸이 조금이라도 처지면 기준 자리가 걸음마다 그 처진 몸으로 내려와 다시 올라가지 않았다(시작 홀드 + 발1 + W: 걸림이 풀린 뒤에도 13cm 더 내려감).
  //   이제 W를 누르기 시작한 높이(K.wY0) 아래로는 이 식이 기준 자리를 내리지 않는다. 걸린 팔을 풀려고 내려오는 몫(위의 jam)은 따로다. OLDWSINK = 전처럼
  //   (해 보고 뺀 것: "앞 걸음의 기준 자리 아래로는 내리지 않는다" — 재 본 장면에서 결과가 같았고, 이미 잰 회귀·봇 기준을 다시 재야 해서 넣지 않았다)
  if (!((inp.cy || 0) > 0) || K.push) K.wY0 = null; else if (K.wY0 === null || K.wY0 === undefined) K.wY0 = K.ref.y;
  if (!K.push) K.ref.y += (inp.cy || 0) * Math.min(upV, upLim) * dt;
  if (!K.push && upLim < 9 && (inp.cy || 0) > 0) K.ref.y = Math.min(K.ref.y, Math.max(b.pos.y + upLim * 0.12, globalThis.OLDWSINK ? -9 : Math.min(K.wY0 ?? -9, K.ref.y)));
  // 전신 자세 풀이(p3d-0.11.0, 임시 — 조작에 닿는 것이라 기획 확인 대상): 발이 받치지 않는 매달림에서 위·아래 입력이 없으면 팔이 거의 펴질 때까지(96%) 몸이 천천히 가라앉는다(쉬는 매달림은 팔을 편다).
  //   0.10.x까지는 뛰어 잡은 높이에 팔을 굽힌 채 끝없이 머물렀다(피로가 없어서). 당겨 올라간 채 다른 손을 보내려면 W를 누르고 있어야 한다. 끄기: S.opt.hangSink = false
  if (fbOn(K) && hanging && !K.push && !(inp.cy || 0) && !(S.opt && S.opt.hangSink === false) && K.T) { let slack = 9; for (const h of held) slack = Math.min(slack, 0.96 * CL.ARM - K.T.sh[h.i].distanceTo(h.goal)); if (slack > 0.004 && slack < 9) K.ref.y -= Math.min(0.30, slack * 4) * dt; }
  // 벽에서 뛰기: 누르는 순간 밀기 시작(모으기 없음, 지상 점프와 같다). 방향 = 위 + 좌우(A/D) + 벽에서 조금 떨어지는 쪽. S를 누르고 있으면 벽을 차고 뒤로
  const jumpPress = !!inp.jump && !K.jumpHeld; K.jumpHeld = !!inp.jump;
  if (jumpPress && !K.push && (held.length || planted.length)) {
    const out = nW.lengthSq() > 0.01 ? nW.clone() : fwd.clone().negate(), back = (inp.cy || 0) < 0;
    const dir = back ? out.clone().multiplyScalar(0.85).add(V(0, 0.45, 0)) : V(0, 1 + 0.3 * Math.max(0, inp.cy || 0), 0).addScaledVector(left, side * 0.75).addScaledVector(out, 0.12);
    K.push = { t: 0, dir: dir.normalize(), held: true, v0: b.vel.clone() }; note(S, 'push', null, 0, back ? '벽을 차고 뒤로' : side ? (side > 0 ? '왼쪽 위로 뛰기' : '오른쪽 위로 뛰기') : '위로 뛰기');
  }
  if (K.push) { if (!inp.jump) K.push.held = false; if ((K.push.t += dt) > CL.PUSH_T || !K.push.held) { const P = K.push; K.push = null; note(S, 'pushEnd', null, 0, '', { dv: +b.vel.clone().sub(P.v0).length().toFixed(2), vel: b.vel.toArray() }); } }
  if (held.length && planted.some(f => f.kind === 'smear')) { const c = V(); for (const h of held) c.add(h.goal); c.multiplyScalar(1 / held.length); const cur = K.ref.clone().sub(c).dot(nW); K.ref.addScaledVector(nW, clamp(CL.OUT_FEET + (K.wout || 0) - cur, -0.4 * dt, 0.4 * dt)); }
  // 균형 잡기(기준 자리를 받치는 발 위로):
  //   손으로 잡고 있을 때 = 발판 위의 발이 몸을 받치면 벽 쪽 깊이만 그 발 위로.
  //   손이 없을 때 = 좌우·깊이 모두. 발을 옮기려는 중이면 남는 발 위로, 몸 위로(W)를 누르면 높은 발 위로, 아니면 디딘 발들의 가운데로.
  { const ctr = f => V((f.patch.x0 + f.patch.x1) / 2, 0, (f.patch.z0 + f.patch.z1) / 2), topsAll = planted.filter(f => f.kind === 'top');
    if (held.length) { const tops = topsAll.filter(f => f.load > 0.1 && f.box.kind !== 'floor'); if (tops.length) { const c = V(); for (const f of tops) c.add(ctr(f)); c.multiplyScalar(1 / tops.length);
      const d = c.sub(K.ref).setY(0); let tw = d.dot(fwd) - (K.wout || 0), fold = false; if (linkOn(S) && !globalThis.NOFOLDROOM) { const fr = foldRoom(S, held, left, fwd); if (fr < tw) { tw = fr; fold = true; } } K.foldLim = fold; K.ref.add(fwd.clone().multiplyScalar(tw).clampLength(0, (K.wout || K.woutT || (fold && tw < 0) ? CL.OUT_V : 0.3) * dt));
      // 몸 위로(W)를 누르고 있으면 가장 높이 디딘 발 쪽으로 엉덩이가 옆으로도 간다(높은 발 → 엉덩이를 그 위로 → 다리로 일어서기. 실제 영상 두 편에서 올라가는 일은 다리가 했다 — 품질 검토 12·13절). 임시 — 조작은 기획 결정 대기
      // p3d-0.8.4(GPT): 좌우(A/D)를 직접 누르고 있으면 자동으로 옮기지 않는다 — 직접 낸 의도가 먼저다
      // (범위에는 뻗는 손의 목표도 넣고, 발 쪽으로 가는 양만 줄인다 — 처음에는 잡은 손만 보고 양쪽을 다 눌러, 한 손을 떼어 보내는 동안 몸이 남은 손 밑으로 끌려가 턱 F가 15cm 모자랐다)
      // p3d-0.12.0 자세 보조: 높은 발 쪽으로 가더라도 잡은 손들의 좌우 범위에서 ROCK_SPAN(10cm)보다 더 벗어나지 않는다 — 손 범위 밖의 발판까지 몸이 가면 다 당겨 올린 높이에서 먼 쪽 팔이 가슴 앞을 가로질러 "팔이 몸통을 지나감"으로 놓쳤다
      // p3d-0.11.10: 높은 발 쪽으로 옮기는 빠르기도 오르는 빠르기에 맞춘다(0.5m/s일 때 0.35) — W를 1.5배로 하자 다 일어선 뒤에도 몸이 발에서 25cm 옆이라 손을 놓으면 떨어졌다. OLDROCK = 옛 방식
      // 전신 연결(p3d-0.15.3, GPT의 0.15.2 검토 작업 B "플레이어가 지정한 지지점과 보조가 고른 지지점을 구분"): 직접 디딘 발(발 보조·닿아서 디딤이 아닌 것)이 있으면 그 가운데 가장 높은 발 쪽으로 간다 —
      //   전에는 발 보조가 놓은 발이 6cm 더 높다는 것만으로 몸이 그쪽으로 넘어가, 직접 디디고 올라서던 발이 다리 길이를 벗어나 떨어졌다(짧은 구간 경로 a: 발1에 올라서는 중에 홀드 14로). NOUSERFOOT = 전처럼
      if ((inp.cy || 0) > 0 && !(inp.cx || 0) && !(S.opt && S.opt.rockOver === false)) { const mine = linkOn(S) && !globalThis.NOUSERFOOT ? tops.filter(f => !f.byAssist && !f.auto) : [], pool = mine.length ? mine : tops, hi = pool.reduce((a, f) => (f.p.y > a.p.y ? f : a), pool[0]); let dl = ctr(hi).sub(K.ref).setY(0).dot(left); if (poseAssistOn(S) && held.length) { const hs = K.hands.filter(h => h.st === 'hold' || (h.st === 'reach' && h.edge)), hl = hs.map(h => h.goal.clone().sub(K.ref).setY(0).dot(left));
        // 전신 연결(p3d-0.15.3): 어깨보다 낮은 손(누르는 높이)은 제 쪽에 남는다 — 높은 손은 몸이 10cm까지 넘어가도 되지만(ROCK_SPAN), 낮은 왼손이 가슴 오른쪽 앞에 오면 팔뚝이 가슴을 가로질러 "팔이 몸통을 지나감"이 됐다. 곧게 선 어깨 높이로 잰다(지금 자세로 재지 않는다)
        const sp = hs.map(h => (linkOn(S) && !globalThis.NOLOWSIDE && h.st === 'hold' ? lerp(CL.ROCK_SPAN, -CL.LOW_SIDE, clamp((b.pos.y + CL.SH_Y0 - h.goal.y) / 0.10, 0, 1)) : CL.ROCK_SPAN));
        dl = dl > 0 ? Math.min(dl, Math.max(0, Math.max(...hl.map((l, k) => l + sp[k])))) : Math.max(dl, Math.min(0, Math.min(...hl.map((l, k) => l - sp[k])))); } { const rk = 0.35 * (globalThis.OLDROCK ? 1 : (globalThis.RISE_V ?? (globalThis.OLDRISE ? CL.SHIFT_V : CL.RISE_V)) / CL.SHIFT_V); K.ref.addScaledVector(left, clamp(dl, -rk * dt, rk * dt)); } } }
      // 전신 연결(p3d-0.15.4): 바닥에 서서 잡고 있을 때도 몸의 깊이를 잡은 손까지 보고 정한다(같은 식 foldRoom). 0.15.3은 발판을 디뎠을 때만 보아, 바닥에서는 선 자리 그대로 풀이의 팔 항만 바뀌었다 —
      //   가슴이 곧게 서면서(−34° → −17°) 어깨 높이의 손목이 가슴 상자 앞 6cm에 붙었고, 다른 손을 뻗으려 가슴이 기울면 남은 팔뚝이 몸통에 걸려 0.4초 만에 놓쳤다(미리보기 표본: 초록 시작에서 초록 5·발7·발8, 노랑 3).
      //   물러나기만 한다(바닥에는 깊이를 맞출 발판이 없다 — 다가가는 것은 사용자의 걷기·W).
      //   **기본으로 넣지 못했다(FLOORROOM=1일 때만 돈다)**: 버티던 손이 풀리는 표본 넷은 풀렸지만, 물러난 자세에서는 같은 턱에 두 손을 모으는 맞잡기가 "다른 팔에 막혀"로 거부됐고(미리보기 표본 4 → 11) 클라이밍장 봇의 완등이 줄었다(잃은 다섯 사례 가운데 넷이 이 규칙만으로도 실패)
      //   **두 손을 다 잡고 있을 때만** 물러난다. 한 손만 잡은 채 물러나면 다음 손이 모자랐다(노랑 시작에서 두 번째 손이 노랑 2에 12cm — 벽에서는 사용자가 앞으로 걸을 수 없다).
      //   해 보고 뺀 것: 뻗는 손이 모자라면 다시 다가가기 — 다가가는 동안 버티는 팔이 다시 몸통에 걸려 표본 아홉 가운데 일곱이 풀렸다(풀이의 heldPen은 가슴이 도는 것은 막아도 몸이 옮겨 가는 것은 못 막는다)
      else if (linkOn(S) && globalThis.FLOORROOM && !globalThis.NOFLOORDEPTH && topsAll.length && held.length === 2 && !K.push && !jumping(S)) { const fr = foldRoom(S, held, left, fwd); K.foldLim = fr < 0; if (fr < 0) K.ref.addScaledVector(fwd, Math.max(fr, -CL.OUT_V * dt)); } }
    else if (topsAll.length) {
      const P = K.pendFoot, hi = topsAll.reduce((a, f) => (f.p.y > a.p.y ? f : a), topsAll[0]);
      const tgt = P && K.feet[P.stay].st === 'plant' ? ctr(K.feet[P.stay]) : (inp.cy || 0) > 0 && topsAll.length > 1 && hi.p.y > Math.min(...topsAll.map(f => f.p.y)) + 0.05 ? ctr(hi) : topsAll.reduce((a, f) => a.add(ctr(f)), V()).multiplyScalar(1 / topsAll.length);
      K.ref.add(tgt.sub(K.ref).setY(0).clampLength(0, 0.45 * dt));
      if (P) { const st = K.feet[P.stay], off = st.st === 'plant' ? Math.hypot(b.pos.x - clamp(b.pos.x, st.patch.x0, st.patch.x1), b.pos.z - clamp(b.pos.z, st.patch.z0, st.patch.z1)) : 0; if ((P.t += dt) > 0.6 || off < 0.012) { K.pendFoot = null; command(S, P.cmd); } }
    }
    if (held.length && K.pendFoot) { const P = K.pendFoot; K.pendFoot = null; command(S, P.cmd); } }
  // 접촉 기하와 힘 나누기
  // 원하는 힘: 보통은 기준 자리로 가는 힘(PD). 매달려 흔들릴 때는 위아래만(좌우·앞뒤는 흔들림에 맡긴다). 뛰는 동안에는 미는 쪽으로 PUSH_A
  // p3d-0.11.9: 몸 위로·옆으로(W·A·D)를 누르는 동안은 누른 빠르기(SHIFT_V)를 따라가게 한다 — 늦춤(KD)을 실제 빠르기가 아니라 "누른 빠르기와의 차"에 건다.
  //   전에는 늦춤이 빠르기 자체에 걸려 기준 자리와의 차(REF_LAG 8cm로 묶임)가 낼 수 있는 빠르기가 KP·8cm/KD = 초속 0.34m(옆으로도 가면 0.25m)에서 멈췄다 — 엉덩이가 오르는 빠르기가 사람(CMU 사다리 0.40~0.46m/s)의 절반이었다.
  //   힘의 한계(팔·다리)와 막힘은 그대로다(힘 나누기가 정한다). OLDRISE = 옛 방식
  //   위로 따라가는 몫은 디딘 다리가 다 펴질수록 줄인다(가장 여유 있는 디딘 발 기준, 다리 길이의 91~97%) — 줄이지 않으면 빨리 오른 몸이 다리를 다 펴고 지나가 디딘 발이 떨어졌다(① 낮은 발판: 발이 떨어져 바닥까지 떨어짐).
  //   위에서 받치는 발이 없으면(매달림) 줄이지 않는다(팔로 당겨 오른다)
  let upK = 1; { const sup = planted.filter(f => f.kind === 'top' && K.T && f.ank); if (sup.length && (inp.cy || 0) > 0) { const d = Math.min(...sup.map(f => K.T.hj[f.i].distanceTo(f.ank) / CL.LEG)); upK = clamp((0.97 - d) / 0.06, 0, 1); }
    // 잡은 팔이 다 접힐수록(어깨–손이 FOLD에 다가갈수록) 줄인다 — 맨틀(누르기)이 없어서, 접힌 팔로 빨리 오르면 "몸이 손을 지나 올라가 놓음"(초속 0.3m 넘게)이 걸려 손을 놓쳤다(다른 벽 시험 A→B→A)
    if ((inp.cy || 0) > 0 && K.T) for (const h of held) upK = Math.min(upK, clamp((K.T.sh[h.i].distanceTo(h.goal) - CL.FOLD - 0.03) / 0.10, 0, 1)); }
  const vCmd = !K.push && !globalThis.OLDRISE ? V(0, (inp.cy || 0) * Math.min(upV * (globalThis.OLDBRAKE ? upK : 1), upLim), 0).addScaledVector(left, hanging || !globalThis.RISE_SIDE ? 0 : side * CL.SHIFT_V) : V(); // 옆(A·D)은 옛 방식 그대로(RISE_SIDE = 시험용: 옆에도 건다 — 다른 벽 시험이 9개 깨졌다)
  const aDes = K.push ? K.push.dir.clone().multiplyScalar(CL.PUSH_A) : K.ref.clone().sub(b.pos).multiplyScalar(CL.KP).addScaledVector(b.vel.clone().sub(vCmd), -CL.KD).clampLength(0, CL.ACC_MAX);
  if (hanging && !K.push) { aDes.x = 0; aDes.z = 0; }
  const T = torso(b, K), Fd = aDes.add(V(0, PHY.G, 0)).multiplyScalar(m), C = [], who = [], com = V(b.pos.x, b.pos.y + CL.COM_H, b.pos.z);
  // p3d-0.11.2(사용자 영상: 두 손으로 매달린 채 두 발을 매끈한 벽면의 엉덩이 높이 양옆에 댄 개구리 자세가 모든 영상에 나옴): 벽면을 디딘 발(smear)은 다리 축 방향으로만 거의 민다(옆으로 미는 힘 LEG_PERP_SMEAR 몸무게의 0.08배).
  //   0.11.1까지는 윗면을 디딘 발과 같이 0.35배까지 옆으로 밀 수 있어, 엉덩이 높이에 수평으로 뻗은 다리로도 몸무게의 0.24배씩 받쳤다(발 아래로 디딘 보통 문지르기와 같은 값). 수평 다리로 몸을 위로 받치려면 고관절이 몸무게 × 다리 길이의 돌림힘을 내야 한다(실험값)
  for (const f of planted) {
    // 윗면을 디딘 발은 발바닥 범위 안에서 누르는 점을 옮길 수 있다(무게중심 아래에 가장 가까운 점)
    const hj = T.hj[f.i], cop = f.kind === 'top' ? V(clamp(com.x, f.patch.x0, f.patch.x1), f.p.y, clamp(com.z, f.patch.z0, f.patch.z1)) : f.p;
    C.push({ f0: f.F, n: f.n, mu: f.kind === 'top' ? CL.MU_TOP : CL.MU_WALL, w: hj.clone().sub(f.ank).normalize(), cap: CL.LEG_F * BW * clamp((CL.LEG - hj.distanceTo(f.ank)) / 0.03, 0, 1), perp: (f.kind === 'smear' && DIM.boxCollide && !globalThis.OLDSMEAR ? CL.LEG_PERP_SMEAR : CL.LEG_PERP) * BW, r: cop.clone().sub(com) }); who.push(f);
  }
  // p3d-0.11.4(사용자 "손이 닿을 거리인데 잡을 수 없다"): 땅에 서서 턱을 비스듬히 잡으면 힘 나누기가 손에 몸무게의 15% 넘게 실어, 발로 설 수 있는데도 0.1초 뒤 "당기는 방향이 턱에서 벗어남"으로 놓쳤다(서는 자리 4cm 차이로 잡음·놓침이 갈렸다).
  //   사람은 버티지 못하는 방향으로는 손에 힘을 싣지 않는다 → 발이 디뎌 있고 뛰는 중이 아니면, 당기는 방향이 턱이 버티는 범위(GRIP_ANG)를 벗어난 손은 GRIP_BAD_CAP까지만 당긴다(뛰는 중에도 묶었더니 벽을 디딘 채 뛰는 높이가 35.8 → 25.1cm로 줄었다). 발이 받치지 못하면(매달림) 몸이 처지며 다 편 팔이 받는 몫(pas)이 생겨 전처럼 놓친다
  const gripOk = h => { const pull = T.sh[h.i].clone().sub(h.goal).normalize(), down = -pull.y, out = Math.max(0, pull.dot(h.n)), lat = pull.clone().addScaledVector(h.n, -pull.dot(h.n)).setY(0).length(); return down > 0.05 && Math.hypot(out, lat) / down <= Math.tan(CL.GRIP_ANG); };
  // p3d-0.11.5 점프 보정(사용자: "점프를 하면 보정을 해 줘야 되는데 반응도 없다"): 한 손으로 매달려 뛰면 한 팔의 순간 힘 0.85배로는 중력도 못 이겨 0.0~0.3cm(발을 벽에 대면 7cm) 올랐다 → 잡기 보정이 켜져 있으면 한 손만 잡고 뛸 때 ASSIST_BURST1
  // 누르기: 어깨가 손보다 위(어깨 → 손이 아래로 25% 넘게 기움)면 미는 팔(u = 손 → 어깨). 당기는 팔은 당기는 방향이 버틸 수 있는 범위(GRIP_ANG)의 끝에 다가갈수록 힘을 줄인다 — 버티지 못할 방향으로는 당기지 않는다
  //   (처음에는 높이로만 줄였더니, 어깨가 손 높이 가까이 올라간 채 발을 옮길 때 두 손이 "당기는 방향이 턱에서 벗어남"으로 함께 미끄러졌다 — 초록, 누르기 끔에서는 3/3이던 코스)
  const prsF = pressOn(S) && planted.some(f => f.kind === 'top' && f.box && f.box.kind !== 'floor');
  const linkF = linkOn(S) && prsF && !K.push && !globalThis.OLDARMLINE;
  for (const h of held) { const uh = h.goal.clone().sub(T.sh[h.i]).normalize(), pk = prsF && !K.push ? clamp((-uh.y - 0.25) / 0.35, 0, 1) : 0; h.pressK = pk; h.cone = false;
    if (linkF && h.low) { const d = T.sh[h.i].distanceTo(h.goal); h.cone = true; C.push({ hand: true, f0: h.F, n: UP, mu: Math.tan(CL.GRIP_ANG), w: uh.y >= 0 ? uh : uh.clone().negate(), cap: CL.ARM_F * BW, perp: CL.ARM_TQ * BW / Math.max(d, 0.20), eps: 0.3, r: h.goal.clone().sub(com) }); who.push(h); continue; }
    if (pk > 0) { C.push({ arm: true, f0: null, u: uh.clone().negate(), cap: CL.PRESS_F * BW * pk, r: h.goal.clone().sub(com) }); who.push(h); continue; }
    const cap = (K.push ? (assistOn(S) && held.length === 1 && !globalThis.OLDBURST ? CL.ASSIST_BURST1 : CL.ARM_BURST) : CL.ARM_F) * BW * (prsF && !K.push ? clamp((Math.tan(CL.GRIP_ANG) - Math.hypot(uh.x, uh.z) / Math.max(uh.y, 1e-3)) / 0.3, 0, 1) : 1);  C.push({ arm: true, f0: h.F, u: uh, cap: DIM.boxCollide && !globalThis.OLDGRIPCAP && !K.push && planted.length && !gripOk(h) ? Math.min(cap, CL.GRIP_BAD_CAP * BW) : cap, r: h.goal.clone().sub(com) }); who.push(h); }
  const Fs = solveForces(C, Fd, held.length ? 0 : CL.MOM), acc = V(0, -PHY.G, 0), v0 = b.vel.clone(), p0 = b.pos.clone();
  if (globalThis.DBGUP) K.FyDbg = Fs.reduce((t, f) => t + f.y, 0) / BW;
  Fs.forEach((f, i) => { acc.addScaledVector(f, 1 / m); who[i].load = who[i].act = f.length() / BW; who[i].pas = 0; who[i].cap = C[i].cap / BW; who[i].F = f; if (!C[i].arm && !C[i].hand) who[i].ok = f.lengthSq() > 1; });
  // 흔들기: 손으로만 매달렸을 때 A/D는 벽과 나란한 쪽으로 몸을 미는 힘(엉덩이·다리를 차서 흔드는 것을 질점 몸에 옮긴 근사. 팔 길이 구속이 진자 운동으로 바꾼다)
  if (hanging && side && !K.push) acc.addScaledVector(left, side * CL.SWING_A);
  b.vel.addScaledVector(acc, dt); if (who.length && !K.push) b.vel.multiplyScalar(1 - (hanging ? CL.HANG_DAMP : CL.DAMP) * dt);
  b.pos.addScaledVector(b.vel, dt);
  // 곧게 편 팔은 줄처럼 버틴다(더 늘어나지 않는다). 이때 받은 충격을 손이 나눠 받는다. 몸통·머리는 벽·턱 속으로 들어가지 않는다(가장 얕은 쪽으로만 민다)
  const lim = []; let armDv = 0;
  for (let round = 0; round < 2; round++) {
    for (let it = 0; it < 4; it++) for (const h of held) {
      const d = h.goal.clone().sub(T.sh[h.i].clone().add(b.pos).sub(p0)), L = d.length(), AL = CL.ARM + (h.slack || 0);
      if (L <= AL) continue;
      const u = d.multiplyScalar(1 / L); b.pos.addScaledVector(u, L - AL); const vn = b.vel.dot(u); if (vn < 0) { b.vel.addScaledVector(u, -vn); armDv -= vn; }
      if (!lim.includes(h)) lim.push(h);
    }
    // 디딘 다리는 끝까지 접힌 것보다 더 접히지 않는다
    for (const f of planted) if (f.kind === 'top') { const hy = T.hj[f.i].y + b.pos.y - p0.y; if (hy - f.p.y < CL.LEG_MIN_H) { b.pos.y += CL.LEG_MIN_H - (hy - f.p.y); if (b.vel.y < 0) b.vel.y = 0; } }
    collide(S, torso(b, K));
  }
  for (let it = 0; it < 4; it++) for (const h of held) { const d = h.goal.clone().sub(T.sh[h.i].clone().add(b.pos).sub(p0)), L = d.length(), AL = CL.ARM + (h.slack || 0); if (L > AL) b.pos.addScaledVector(d.multiplyScalar(1 / L), L - AL); }
  // 잡기 보정의 끌려감(p3d-0.11.4): 여유를 ASSIST_V로 줄인다. 다른 손 때문에 끌려가지 못하면(줄인 여유보다 1cm 넘게 멀다) 그 손을 놓는다 — 원했던 턱을 잡은 손이 먼저다(사용자 결정)
  for (const h of held) if (h.slack > 0) { h.slack = Math.max(0, h.slack - CL.ASSIST_V * dt); const L = h.goal.distanceTo(T.sh[h.i].clone().add(b.pos).sub(p0));
    // p3d-0.15.1(GPT의 0.15.0 검토 — 완등 홀드에 두 손을 모을 때 먼저 잡은 손이 풀림): 다른 손이 **같은 턱**을 잡고 있으면 그 손을 놓지 않는다. 두 손 모두 "원했던 턱"에 있으므로
    //   끌려가지 못한 새 손의 잡기를 거둔다(먼저 잡은 손·발은 그대로). 다른 턱을 잡은 손은 전처럼 놓는다(0.11.4의 사용자 결정). OLDMATCHREL = 전처럼
    if (L > CL.ARM + h.slack + 0.01) { const same = !globalThis.OLDMATCHREL && h.edge && held.some(o => o !== h && !(o.slack > 0) && o.st === 'hold' && o.edge && o.edge.box === h.edge.box);
      // 문구(GPT의 0.15.1 재검토, 임시): 새 잡기를 거둘 때는 CANCEL_WHY. 먼저 잡은 접촉이 실제로 남아 있는지는 기록의 keptGrip에 적고(kept는 거부 기록이 이미 다른 뜻으로 쓴다) 화면이 그때만 "현재 잡기를 유지했어요"를 덧붙인다
      if (same || (keepHoldOn(S) && held.some(o => o !== h && !(o.slack > 0) && o.st === 'hold'))) { releaseHand(S, h.i, CANCEL_WHY, 'reject'); const e = K.log[K.log.length - 1]; if (e && e.why === CANCEL_WHY) { e.keptGrip = K.hands.some(o => o !== h && o.st === 'hold'); e.sameHold = !!same; } }
      else for (const o of held) if (o !== h && !(o.slack > 0) && o.st === 'hold') releaseHand(S, o.i, '잡으려고 놓음(잡기 보정)'); } }
  const shock = lim.length ? armDv / lim.length : 0;
  // 손의 하중 = 근육이 당기는 힘(act. 한계 cap 안) + 다 편 팔이 줄처럼 버티는 몫(pas. 뼈대가 받는 것이라 당기는 한계와 무관하다. 충격도 여기 든다)
  for (const h of lim) { h.pas = shock * m / dt / BW; h.load += h.pas; }
  K.T = torso(b, K);
  // 몸의 가속(걸러서 적어 둔다): 늘어뜨린 다리가 관성으로 뒤따르는 데 쓴다
  K.accS.lerp(b.vel.clone().sub(v0).multiplyScalar(1 / dt).clampLength(0, 25), 1 - Math.exp(-30 * dt));
  // 손: 당겨지는 방향이 턱이 버티는 범위를 벗어나거나 충격이 크면 미끄러진다
  for (const h of held) {
    const pull = K.T.sh[h.i].clone().sub(h.goal).normalize(), down = -pull.y, out = Math.max(0, pull.dot(h.n)), lat = pull.clone().addScaledVector(h.n, -pull.dot(h.n)).setY(0).length();
    // 잡기 보정(p3d-0.11.4): 막 잡은 손(NEW_T 안)은 몸이 그 손 아래로 흔들려 오는 동안 당기는 방향의 한계를 ASSIST_GRIP_ANG까지 넓힌다(다른 손을 놓고 흔들려 오는 첫 0.3~0.5초에 각이 커서 곧바로 놓쳤다)
    const gAng = assistOn(S) && K.tick - (h.grabTick ?? -1e9) < CL.NEW_T / dt ? CL.ASSIST_GRIP_ANG : CL.GRIP_ANG;
    const bad = h.load < CL.GRIP_MIN || (h.cone && !lim.includes(h)) ? '' : h.pressK > 0 ? (Math.hypot(pull.x, pull.z) / Math.max(pull.y, 1e-3) > Math.tan(CL.GRIP_ANG) ? '누르는 방향이 턱에서 벗어남' : '') : down <= 0.05 ? '위로는 당길 수 없음(어깨가 턱보다 위)' : Math.hypot(out, lat) / down > Math.tan(gAng) ? '당기는 방향이 턱에서 벗어남' : '';
    //   넓힌 한계 안이지만 원래 한계(GRIP_ANG) 밖이고 먼저 잡던 다른 손이 있으면 그 손을 놓아 몸이 새 손 아래로 오게 한다(두 손이 함께 버티면 몸이 그 자리에 머물러 넓힌 시간이 끝나는 순간 새 손이 놓쳤다)
    const sideBad = !bad && gAng !== CL.GRIP_ANG && h.load >= CL.GRIP_MIN && down > 0.05 && Math.hypot(out, lat) / down > Math.tan(CL.GRIP_ANG); h.sideT = sideBad ? (h.sideT || 0) + dt : 0; // 원래 놓치던 때와 같이 SLIP_T 동안 이어질 때만(잠깐 튄 하중으로 다른 손을 놓지 않게)
    if (h.sideT > CL.SLIP_T) { const o = held.find(x => x !== h && x.st === 'hold' && (x.grabTick ?? -1e9) < (h.grabTick ?? -1e9)); if (o && !keepHoldOn(S)) releaseHand(S, o.i, '옮겨 잡으려고 놓음(잡기 보정)'); h.sideT = 0; }
    h.bad = bad ? h.bad + dt : 0;
    // 잡은 채 몸이 움직여 팔이 제 몸을 지나가야 하는 자세가 되면(접힌 팔이 몸통에 걸림, 손이 등 뒤로 감) 그 손은 놓친다
    // 뛰어서 몸이 손을 지나 올라가면(팔이 다 접힌 채 위로 가는 중) 그 손은 놓인다(누르기로 바꾸는 동작 = 맨틀은 아직 없다)
    if (K.T.sh[h.i].distanceTo(h.goal) < CL.FOLD && b.vel.y > 0.3 && !(pressOn(S) && planted.length && !K.push)) { releaseHand(S, h.i, '몸이 손을 지나 올라가 놓음'); continue; }
    const jam = armCheck(S, h.i, K.T.sh[h.i], h.goal); h.jam = jam ? (h.jam || 0) + dt : 0; h.jamWhy = jam || '';
    if (h.jam > (K.jamStop ? 0.6 : 0.15)) { releaseHand(S, h.i, `${jam} → 놓침`, 'slip'); continue; }
    if (lim.includes(h) && shock > (assistOn(S) && K.tick - (h.grabTick ?? -1e9) < CL.NEW_T / dt ? CL.ASSIST_SHOCK_V : CL.SHOCK_V)) releaseHand(S, h.i, `충격이 커서 놓침(${shock.toFixed(1)}m/s)`, 'slip'); // 잡기 보정: 막 잡은 손(뛰어 잡기·흔들어 잡기)은 ASSIST_SHOCK_V까지 버틴다
    else if (h.bad > CL.SLIP_T) {
      // 잡기 보정(p3d-0.11.4): 막 잡은 손(NEW_T 안)이 버티지 못하는 방향으로 당겨지면, 다른 손이 잡고 있으면 그 손을 놓는다 — 몸이 새 손 아래로 흔들려 가고 원했던 턱은 그대로 잡혀 있다(사용자 결정: "필요하면 다른 쪽을 놓고 원했던 턱을 잡게")
      const o = held.find(x => x !== h && x.st === 'hold'); if (assistOn(S) && !keepHoldOn(S) && o && K.tick - (h.grabTick ?? -1e9) < CL.NEW_T / dt && (o.grabTick ?? -1e9) < (h.grabTick ?? -1e9)) { releaseHand(S, o.i, '옮겨 잡으려고 놓음(잡기 보정)'); h.bad = 0; }
      else releaseHand(S, h.i, bad, 'slip'); }
  }
  // 발: 다리가 닿는 범위를 벗어나면 떨어진다(끌려가지 않는다)
  const noHands = !K.hands.some(h => h.st === 'hold');
  for (const f of planted) {
    // p3d-0.11.8(결정 3, 발끝으로 서기): 윗면에 디딘 발은 엉덩이가 올라가 다리가 닿는 범위를 넘으려 하면 발볼을 축으로 뒤꿈치를 든다(발목이 발볼 둘레로 돎, TIPTOE_MAX 20°까지 — 3~4cm). 두 발 모두 바닥을 디딘 채 서 있을 때만·W로 끌어올리는 중이 아닐 때만(한 발이 발판에 있을 때도 쓰면 다른 벽 c1에서 한 손으로 모서리를 돌다 손을 놓쳤고 넓적다리 비틀림이 109°까지 갔다. 조건이 풀리면 그때의 발끝 높이에 멈춰 두었다가 다시 디딜 때 새로 잰다): 발판에서도 쓰고 34°까지 두었더니 몸이 올라갈 때 발이 떨어져 다시 디디는 흐름(발 보조·발 올리기)과 다른 벽 시험이 깨졌다 — 서서 잡으면 잡기 보정이 몸을 1~2cm 당겨 거의 편 다리의 발이 떨어져 0.45초 떠 있었다(자세 정리 ④). 발볼 자리(디딘 점)는 그대로라 접촉은 같다. OLDTIPTOE = 전처럼
    if (DIM.boxCollide && !globalThis.OLDTIPTOE && f.kind === 'top' && f.ball && f.box && f.box.kind === 'floor' && !((inp.cy || 0) > 0) && K.feet.every(F => F.st === 'plant' && F.box && F.box.kind === 'floor')) { const key = f.p.x.toFixed(4) + ',' + f.p.z.toFixed(4);
      if (f.tipKey !== key) { f.tipKey = key; f.tipA = f.ank.clone(); f.tipQ = f.q.clone(); f.tip = 0; }
      const hj = K.T.hj[f.i], need = DIM.leg * 0.985, rel0 = f.tipA.clone().sub(f.ball), fw = rel0.clone().setY(0); let th = 0;
      if (fw.lengthSq() > 1e-8 && hj.distanceTo(f.tipA) > need) { fw.normalize(); const ax = fw.clone().cross(UP).normalize(), sg = rel0.clone().applyAxisAngle(ax, 0.1).y > rel0.y ? 1 : -1, at = t => f.ball.clone().add(rel0.clone().applyAxisAngle(ax, sg * t));
        if (hj.distanceTo(at(CL.TIPTOE_MAX)) <= need) { let lo = 0, hi = CL.TIPTOE_MAX; for (let it = 0; it < 10; it++) { const md = (lo + hi) / 2; if (hj.distanceTo(at(md)) <= need) hi = md; else lo = md; } th = hi; } else th = CL.TIPTOE_MAX;
        f.ank.copy(at(th)); f.q.copy(Q().setFromAxisAngle(ax, sg * th).multiply(f.tipQ)); }
      else if (f.tip > 0) { f.ank.copy(f.tipA); f.q.copy(f.tipQ); }
      f.tip = th; }
    if (K.T.hj[f.i].distanceTo(f.ank) > DIM.leg) { liftFoot(S, f.i, '다리가 닿는 범위를 벗어남'); continue; }
    // 사람 관절의 범위(p3d-0.11.1): 몸이 움직여 디딘 다리의 고관절이 범위를 HIP_TOL_HOLD 넘게 벗어난 채 HIP_HOLD_T 동안 이어지면 그 발은 떨어진다(몸이 내려가 발이 엉덩이보다 한참 높아졌을 때 등)
    if (anatOn()) { f.hipT = hipHold(S, f.i, K.T.hj[f.i], f.ank) > CL.HIP_TOL_HOLD ? (f.hipT || 0) + dt : 0; if (f.hipT > CL.HIP_HOLD_T) { f.hipT = 0; liftFoot(S, f.i, '다리가 꺾이는 한계를 넘음'); continue; } }
    // 잡은 손이 없으면: 벽면에 댄 발은 버티지 못하고 바로 떨어진다(손이 받아 주던 미는 힘이 없다. 저절로 벽을 차지 않는다). 몸이 떨어지는 중인데 누르는 힘이 없는 발도 그 자리에 남지 않는다(윗면에 가만히 올려 둔 발은 그대로 둔다)
    f.idle = noHands && (f.kind === 'smear' || (f.load < 0.02 && b.vel.y < -0.4)) ? (f.idle || 0) + dt : 0;
    if (f.idle > CL.IDLE_T) liftFoot(S, f.i, f.kind === 'smear' ? '손 없이는 벽면의 발로 버틸 수 없음' : '누르는 힘이 없어 떨어짐');
    // p3d-0.11.7(자세 정리 ③): 손으로 잡고 있어도, 벽면에 높이 댄 발(발목이 고관절 −25cm보다 위)이 힘을 받지 않은 채(몸무게의 5% 이하) SMEAR_IDLE_T 넘게 있으면 내린다 — 하는 일 없이 다리를 엉덩이 높이 옆으로 든 채 버티고 있었다(사용자 그림 24, u2 3초 넘게)
    if (!noHands && DIM.boxCollide && !globalThis.OLDSMEARIDLE) { f.sIdle = f.kind === 'smear' && (f.loadS || 0) <= 0.05 && f.ank.y > K.T.hj[f.i].y - 0.25 ? (f.sIdle || 0) + dt : 0; if (f.sIdle > CL.SMEAR_IDLE_T) { f.sIdle = 0; liftFoot(S, f.i, '힘이 실리지 않아 발을 내림'); } }
  }
  // 손 없이 발로만 서 있을 때: 무게중심이 발바닥 범위에서 TOPPLE(10cm) 넘게 벗어나 그쪽으로 가고 있으면 균형을 잃은 것이다 → 발을 떼고 떨어진다(천천히 기울며 버티지 않는다)
  if (noHands) { const pl = K.feet.filter(f => f.st === 'plant' && f.kind === 'top'); if (pl.length) { let dmin = 9, away = 0; for (const f of pl) { const dx = b.pos.x - clamp(b.pos.x, f.patch.x0, f.patch.x1), dz = b.pos.z - clamp(b.pos.z, f.patch.z0, f.patch.z1), d = Math.hypot(dx, dz); if (d < dmin) { dmin = d; away = d > 1e-6 ? (b.vel.x * dx + b.vel.z * dz) / d : 0; } } if (dmin > CL.TOPPLE && away > 0.15) for (const f of pl) liftFoot(S, f.i, '균형을 잃음'); } }
  for (const x of [...K.hands, ...K.feet]) x.loadS = (x.loadS || 0) + ((x.st === 'hold' || x.st === 'plant' ? Math.min(x.load, 3) : 0) - (x.loadS || 0)) * (1 - Math.exp(-12 * dt));
  // 놓인 손은 어깨 아래의 쉬는 자리로 돌아간다(스프링. 전에는 그리는 쪽에서 한 걸음에 5%씩 당겨 처음에 너무 빨랐다 — 자세는 계산 걸음에서 정한다)
  // p3d-0.8.8 팔의 복귀(사용자 플레이 1차): 거부되거나 놓은 팔은 정해진 시간(거리에 따라 0.30~0.62초)에 걸쳐 천천히 떠나 천천히 닿고, 곧은 선이 아니라 몸 옆으로 도는 호를 그리며 내려온다.
  // 0.8.7까지는 반감기 0.11초의 스프링이었다: 놓는 걸음에 가속 100m/s²로 떠나 초속 5m까지 갔고(올라갈 때 3.2보다 빨라 팔을 떨어뜨리는 것처럼 보였다), 머리 위에서 곧게 내려와 손이 제 어깨를 지나갔다
  for (const H of K.hands) if (H.st === 'free') { H.relV = H.relV || V(); const goal = V((H.i ? -1 : 1) * 0.08, -0.5, 0.1).applyAxisAngle(UP, b.yaw);
    // p3d-0.11.7(자세 정리 ⑦): 늘어뜨린 손의 쉬는 자리가 넓적다리·골반과 겹치면 비킨다(넓적다리에서 수직인 쪽 + 뒤, 골반에서는 바깥 + 조금 뒤) — 옆으로 든 넓적다리가 늘어뜨린 손을 지나갔다(posture_audit ⑦, foot4: 무릎이 엉덩이 높이로 옆에 올라오는 동안).
    //   손목 둘레 반지름 5cm + 넓적다리 7cm + 여유 3cm. 바뀐 쉬는 자리로는 지금의 스프링이 따라간다(한 걸음에 옮기지 않는다)
    //   0.11.7에서는 잡는 걸음의 팔꿈치 튐(4 → 32번)을 만들어 실험으로 뒀다. 0.11.8에서 팔꿈치 상태를 하나로 합친 뒤에는 튐이 늘지 않아(4 → 4) 기본으로 켠다. OLDHANDHIP = 끔
    if (K.T && DIM.boxCollide && !globalThis.OLDHANDHIP) { const sh = K.T.sh[H.i], out = left.clone().multiplyScalar(H.i ? -1 : 1).addScaledVector(fwd, -0.35).normalize();
      for (let it = 0; it < 4; it++) { const p = sh.clone().add(goal); let worst = 0, dir = null;
        for (const o of [0, 1]) { const lg = otherLeg(S, o), a = lg.hip, k2 = lg.knee, c = closestOnSeg(a, k2, p), dd = p.distanceTo(c) - 0.15; if (dd < worst) { worst = dd; const h = p.clone().sub(c); dir = h.lengthSq() > 1e-6 ? h.normalize().lerp(fwd.clone().negate(), 0.5).normalize() : fwd.clone().negate(); } }
        { const c = K.T.hip, dd = p.distanceTo(c) - 0.19; if (dd < worst) { worst = dd; const h = p.clone().sub(c); h.y = 0; dir = h.lengthSq() > 1e-6 ? h.normalize().lerp(out, 0.5).normalize() : out.clone(); } }
        if (!dir) break; goal.addScaledVector(dir, -worst); }
      if (goal.length() > CL.ARM * 0.98) goal.setLength(CL.ARM * 0.98); }
    // p3d-0.11.9: 쉬는 손 자리가 지형(벽·턱·발판) 속이면 겹친 만큼 바깥으로 뺀다(손 둘레 5cm + 여유 1cm). 쉬는 자리는 어깨에서 벽 쪽으로 10cm라, 어깨가 벽면 가까이 있으면 늘어뜨린 손이 벽 속에 있었고 그 자리에서 뻗기 시작한 손이 턱 F에 "팔이 턱에 걸려" 거부됐다(h1 fb). OLDHANDWALL = 빼지 않음
    if (K.T && DIM.boxCollide && !globalThis.OLDHANDWALL) { const sh = K.T.sh[H.i];
      for (let it = 0; it < 3; it++) { const p = sh.clone().add(goal); let worst = null; for (const x of S.world.boxes) { if (x.kind === 'floor') continue; const h = sphereBox(p, 0.06, x); if (h && (!worst || h.d > worst.d)) worst = h; } if (!worst) break; goal.addScaledVector(worst.n, worst.d); }
      if (goal.length() > CL.ARM * 0.98) goal.setLength(CL.ARM * 0.98); }
    if (H.ret && !globalThis.OLDHAND) { const R = H.ret, D = R.from.distanceTo(goal), Tt = clamp(CL.RET_T0 + CL.RET_K * D, CL.RET_T0, CL.RET_T1), k = mj(clamp((R.t += dt) / Tt, 0, 1));
      const u0 = R.from.clone().normalize(), u1 = goal.clone().normalize(), L0 = R.from.length(), L1 = goal.length(), ang = u0.angleTo(u1), side = left.clone().multiplyScalar((H.i ? -1 : 1) * 0.8).addScaledVector(fwd, 0.3).add(V(0, -0.3, 0)).normalize();
      const mid = u0.clone().add(u1); if (mid.lengthSq() < 1e-6) mid.copy(side); mid.normalize().lerp(side, clamp(ang / 2.6, 0, 1)).normalize();
      const dir = u0.clone().lerp(mid, k).lerp(mid.clone().lerp(u1, k), k).normalize(), prev = H.rel.clone();
      // p3d-0.11.9(후보 3을 보다 찾음): 호의 가운데에서 어깨 쪽으로 당기는 몫에 바닥(RET_FLOOR 28cm, 처음과 끝이 그보다 가까우면 그 거리까지)을 둔다(OLDRETFLOOR = 없음) — 머리 위에서 몸 옆으로 내려오는 큰 호(140°)에서 손목이 어깨 12cm 앞까지 당겨져 팔이 26°로 접혔다(reach3 10.6초, 거부된 뒤 돌아오는 손)
      const Lr = lerp(L0, L1, k) * (1 - 0.50 * Math.sin(Math.PI * k) * clamp(ang / 2, 0, 1)), Lf = globalThis.OLDRETFLOOR || !DIM.boxCollide ? Lr : Math.max(Lr, Math.min(globalThis.RET_FLOOR ?? 0.28, lerp(L0, L1, k)));
      H.rel.copy(dir).multiplyScalar(Lf); H.relV.copy(H.rel).sub(prev).multiplyScalar(1 / dt); if (R.t >= Tt) H.ret = null; }
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
  const fwd = V(Math.sin(b.yaw), 0, Math.cos(b.yaw)), left = V(Math.cos(b.yaw), 0, -Math.sin(b.yaw)), gather = poseAssistOn(S) && !globalThis.OLDFEETGATHER;
  for (const F of K.feet) {
    if (F.st !== 'free' || F.cool > 0 || F.userOff) continue;
    const hj = K.T.hj[F.i], other = K.feet[1 - F.i]; let best = null;
    for (const x of S.world.boxes) {
      // 손으로 잡은 턱에는 발을 올리지 않는다(2D에서 정한 원칙). 고관절에서 38~82cm 아래의 윗면만 본다
      if (x.kind === 'floor' || held.some(h => h.edge && h.edge.box === x)) continue;
      const drop = hj.y - x.max.y; if (drop < 0.38 || drop > 0.82) continue;
      const p = V(clamp(hj.x + fwd.x * 0.10, x.min.x + 0.04, x.max.x - 0.04), x.max.y, clamp(hj.z + fwd.z * 0.10, x.min.z + 0.02, x.max.z - 0.03)), h = Math.hypot(p.x - hj.x, p.z - hj.z);
      if (h > 0.40 || (other.st !== 'free' && p.distanceTo(other.p) < 0.14)) continue;
      // p3d-0.12.0 자세 보조: 두 발을 한쪽의 발판에 모으지 않는다(사용자: "자꾸 양 발을 오므리면서 한쪽으로 모으려고 한다").
      // 제 고관절에서 몸 가운데 선을 넘어가는 자리(안쪽 8cm 넘게)와, 다른 발이 디딘 자리에서 골반 너비(18cm)보다 가까운 자리로는 보내지 않는다 — 그 발은 있던 자리에 둔다
      if (gather) { const lat = (p.x - hj.x) * left.x + (p.z - hj.z) * left.z; if (lat * (F.i ? -1 : 1) < -0.08 || (other.st !== 'free' && p.distanceTo(other.p) < 0.18)) continue; }
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
function bendDir(S, key, a, t, want, rate = 7, snap = false, soft = false, cap = 0) {
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
  // cap(p3d-0.10.2, 디딘 다리): 다리 축에 수직으로 실제 도는 각도도 rate와 같은 한계로. 극 방향이 다리 축과 비스듬하면 수직 몫이 극 방향보다 빨리 돈다(v3: 극 방향 초속 200° → 무릎 방향 288°)
  if (cap && q) { const ang = q.angleTo(p), mx = cap * PHY.DT; if (ang > mx) { const ax = q.clone().cross(p); if (ax.lengthSq() < 1e-10) ax.copy(u); p.copy(q).applyAxisAngle(ax.normalize(), mx); } }
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
// p3d-0.11.8(결정 1): 팔꿈치가 사람 어깨의 범위를 넘으면 범위 안의 가장 가까운 쪽으로 돌리고 **그 결과를 팔꿈치 상태(el)에 적는다** — 물리 판정(armHit·가슴 열기 K.open)·그림·다음 걸음이 같은 팔꿈치를 쓴다.
//   0.11.6~0.11.7은 그림에서만 고치고(범위 보정 + 빠르기 한계 elA) 상태에는 적지 않아, 잡는 걸음에 잡은 팔의 규칙이 보정 전 방향에서 이어 가 팔꿈치가 한 걸음에 튀었다(⑦·⑨의 뿌리). 돌린 팔꿈치가 지형에 2cm 안으로 들거나 제 몸·다른 팔에 더 들면 돌리지 않는다(전과 같은 조건)
// p3d-0.11.8(결정 1): 잡은 팔의 팔꿈치는 지금 쪽이 쓸 만하면(어깨 범위 안, 팔꿈치·위팔이 지형에 들지 않음 — 잡은 손의 팔뚝은 턱에 닿는 것이 정상이라 보지 않는다, 제 몸·다른 팔에 들지 않음) 고른 쪽으로 천천히(HELD_SLOW rad/s) 옮겨 간다 — 뻗는 동안 범위 보정으로 정해진 팔꿈치와 잡은 팔이 고르는 팔꿈치가 다르면, 거의 편 팔에서는 팔꿈치 자리는 그대로인 채 위팔만 초속 460°로 비틀렸다(reach6 6.33초). 쓸 수 없거나 다른 손이 뻗는 중이면(잡은 팔이 자리를 내 줘야 한다 — 0.8.6 규칙. 천천히 두면 다른 벽 시험에서 왼손이 벽 B에 오지 못했다) 전처럼 7rad/s. 굽은 팔(팔꿈치가 어깨–손목 선에서 HELD_SLOW_BEND 넘게)도 7 — 천천히 옮기는 것은 팔꿈치 자리가 거의 그대로인 편 팔(비틀림만 보이는 경우)에만. 굽은 팔까지 천천히 두면 다음 뻗기가 다른 팔꿈치에서 시작해 교차의 길이 바뀌었다. 두 손을 엇갈려 잡은 동안도 7(엇갈린 팔이 서로를 비켜야 한다 — 천천히 두면 "턱을 잡고 있던 손에서 시작하는 교차"가 깨졌다)
// p3d-0.11.9: 잡은 직후 0.6초는 보통 빠르기(OLDGRABRATE = 없음) — 뻗던 팔의 팔꿈치 방향(아래·뒤 → 바깥·아래)이 편 팔의 느린 빠르기 때문에 오래 남아 몸이 움직이며 위팔이 127~164° 비틀렸다(F·u9·u12)
function heldRate(S, s, sh, target, sx, qC, yaw) { if (!DIM.boxCollide || globalThis.OLDELBOW || globalThis.NOHELDSLOW) return 7; if (S.climb.hands[s === 'L' ? 1 : 0].st === 'reach') return 7; { const Hs = S.climb.hands[s === 'L' ? 0 : 1]; if (!globalThis.OLDGRABRATE && Hs.grabTick !== undefined && (S.climb.tick - Hs.grabTick) * PHY.DT < 0.6) return 7; } const pv = S.pw && S.poleS && S.poleS['el' + s]; if (!pv) return 7; const ik = twoBone(sh, target, DIM.upperArm, DIM.foreArm, pv); { const u = target.clone().sub(sh).normalize(), m = ik.mid.clone().sub(sh); if (m.addScaledVector(u, -m.dot(u)).length() > CL.HELD_SLOW_BEND) return 7; } if (armOver(sh, ik, sx, qC, yaw) > 0.05 || elbowIn(S.world, ik.mid) || nearBox(S.world, sh.clone().lerp(ik.mid, 0.5), 0.02)) return 7; const sf = armSelf(selfShapes(S, s === 'L' ? 0 : 1), ik, sh); if (sd(sf, 'body') > 0.0005 || sd(sf, 'arm') > 0.003) return 7; const o = S.climb.hands[s === 'L' ? 1 : 0], left = V(Math.cos(S.body.yaw), 0, -Math.sin(S.body.yaw)); if (o.st === 'hold' && o.goal && target.clone().sub(o.goal).dot(left) * (s === 'L' ? 1 : -1) < 0) return 7; return CL.HELD_SLOW; }
function elbowFix(S, s, sh, target, pole, sx, qC, yaw, tb = null, gate = 0.05) {
  if (!DIM.boxCollide || globalThis.NOANAT || globalThis.OLDELBOW) return null; const ik = twoBone(sh, target, DIM.upperArm, DIM.foreArm, pole); if (armOver(sh, ik, sx, qC, yaw) <= gate) return null;
  //   보정 전 팔이 이미 지형에 들면 고치지 않는다(전처럼 "팔이 벽·턱을 지나감"으로 빨리 거부되게) — 고친 팔꿈치로 벽을 비켜 손이 1초 더 붙어 있다가 "턱에 걸려"로 거부되는 동안 가슴이 돌아 다른 손이 놓쳤다(다른 벽 시험 A → B → A). 보정은 갈 수 있는 뻗기의 모양을 사람 범위로 맞추는 데만 쓴다
  { const h0 = armHit(S.world, sh, ik, tb); if (h0 && h0.d > 0.002 && !globalThis.FIXHIT) return null; }
  const qq = qC ? [qC.x, qC.y, qC.z, qC.w] : [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)], Bs = selfShapes(S, s === 'L' ? 0 : 1), e = [ik.end.x, ik.end.y, ik.end.z];
  //   범위 안이면서 팔(위팔·팔뚝)이 지형에 들지 않고 제 몸·다른 팔에 들지 않는 가장 가까운 쪽(fitPole이 6°씩 양쪽으로 찾는다). 범위만 보고 고르면 그 팔꿈치가 턱에 걸려 손 모으기 18cm가 "팔이 턱에 걸려"로 거부됐다(play_fix_check)
  const cost = m => { const mid = V(m[0], m[1], m[2]), k = { mid, end: ik.end }, h = armHit(S.world, sh, k, tb, 0, globalThis.ELFIX_M ?? 0), sf = armSelf(Bs, k, sh), bd = sd(sf, 'body'), ad = sd(sf, 'arm'), bad = (h ? h.d : 0) > 0.002 || bd > 0.0005 || ad > 0.003; return armExcess(qq, [sh.x, sh.y, sh.z], m, e, sx) - 0.05 + (bad ? 0.2 + ((h ? h.d : 0) + bd + ad) * 10 : 0); }; // 뻗는 손이 멈추는 기준(몸 1mm·다른 팔 4mm)보다 엄하게 — 처음에 2mm로 두어 고친 팔꿈치가 몸에 1~2mm 들고 손이 "몸에 막혀" 멈췄다(다른 벽 시험)
  //   p3d-0.11.9: 두 쪽 답 가운데 바라는 팔꿈치 방향(몸이 보는 쪽 기준 바깥 0.75·아래 0.6·뒤 0.25 — 가슴 틀이 아니라 몸 틀. 가슴이 비틀려 있어도 같은 쪽)에 더 가까운 답(OLDFITHI = 가장 가까운 답, ELPREF=0 = 더 낮은 답)
  const nat = V(sx * 0.75, -0.6, -0.25).applyAxisAngle(UP, yaw).normalize(), c = globalThis.OLDFITHI ? fitPole([sh.x, sh.y, sh.z], e, DIM.upperArm, DIM.foreArm, [pole.x, pole.y, pole.z], cost) : fitPoleLow([sh.x, sh.y, sh.z], e, DIM.upperArm, DIM.foreArm, [pole.x, pole.y, pole.z], cost, 0.6, globalThis.ELPREF === 0 ? null : [nat.x, nat.y, nat.z]); if (!c.moved || c.over > 0) return null;
  const p2 = V(c.pole[0], c.pole[1], c.pole[2]), u = target.clone().sub(sh).normalize(), pp = p2.clone().addScaledVector(u, -p2.dot(u)); if (pp.lengthSq() < 1e-8) return null; pp.normalize();
  if (S.poleS) { S.poleS['el' + s] = pp.clone(); S.poleS['el' + s + 'p'] = pp.clone(); } return { pole: pp, ik: twoBone(sh, target, DIM.upperArm, DIM.foreArm, pp) };
}
// 고친 팔꿈치도 앞 걸음의 상태에서 초속 REACH_POLE_W까지만 바뀐다(뻗는 팔·잡은 팔 같음). 상태에 적고 {pole, ik}
function poleRate(S, s, sh, target, pv0, pole) {
  const u = target.clone().sub(sh).normalize(), q0 = pv0.clone().addScaledVector(u, -pv0.dot(u)); if (q0.lengthSq() < 1e-8) return null; q0.normalize();
  const a = q0.angleTo(pole), mx = CL.REACH_POLE_W * PHY.DT; if (a <= mx) return null; const ax2 = q0.clone().cross(pole); if (ax2.lengthSq() < 1e-10) ax2.copy(u);
  const p2 = q0.applyAxisAngle(ax2.normalize(), mx); S.poleS['el' + s] = p2.clone(); S.poleS['el' + s + 'p'] = p2.clone(); return { pole: p2, ik: twoBone(sh, target, DIM.upperArm, DIM.foreArm, p2) };
}
function reachArm(S, s, sh, target, yaw, sx, qC, want = null, tb = null) {
  // p3d-0.8.5: 후보를 고를 때와 도는 길을 볼 때 제 몸(머리·몸통)도 함께 본다(at). 손을 멈추거나 빼내는 데 쓰는 겹침(hit)은 전처럼 지형의 것이고, 제 몸의 겹침은 따로(self) 돌려준다
  const B = selfShapes(S, s === 'L' ? 0 : 1), wp = want || pickPole(S, sh, target, yaw, sx, qC, tb, B).pole, prev = S.pw && S.poleS && S.poleS['el' + s];
  const at = (pl, anat = false) => { const ik2 = twoBone(sh, target, DIM.upperArm, DIM.foreArm, pl), th = armHit(S.world, sh, ik2, tb), sf = armSelf(B, ik2, sh), ds = Math.max(sd(sf, 'body'), sd(sf, 'arm'), anat ? (globalThis.ARC_ANAT ?? 0.1) * Math.max(0, armOver(sh, ik2, sx, qC, yaw) - 0.05) : 0); return th && th.d >= ds ? th : ds > 0 ? { d: ds } : null; }, hit0 = prev ? at(prev) : null, UNI = DIM.boxCollide && !globalThis.OLDELBOW;
  // 도는 길: 팔꿈치는 어깨–손목 축 둘레를 돈다. 가까운 쪽으로 돌면 벽·턱 속을 지나고 먼 쪽은 비어 있으면 먼 쪽으로 돈다(가까운 쪽으로만 돌면 팔꿈치가 벽 안 10cm를 지나갔다)
  let go = wp, far = false;
  // p3d-0.11.9(사용자 지적: 팔꿈치를 뒤로 뺐다가 손이 목표로 다가가며 팔꿈치·어깨가 따라간다): 위쪽 목표로 뻗는 동안 바라는 팔꿈치 방향은 손목 높이에 따라 "아래·뒤"(손이 어깨 아래)에서 "바깥·아래"(손이 어깨 위)로 바뀐다(몸 틀).
  //   후보 고르기(armIK)의 고정 후보는 손이 어깨 바깥 아래에 있을 때 팔 축과 나란해져 팔꿈치가 위로 들렸고, 뒤를 향한 채 남으면 팔을 펼 때 어깨 뒤로 젖혀져 범위를 33° 넘었다. 지형에 든 후보면(hit) 이 방향을 쓰지 않는다. OLDREACHPOLE = 쓰지 않음
  //   발로 받친 뻗기에만, 다른 손 너머로 건너가는 교차에는 쓰지 않는다(처음에는 가리지 않아 팔 교차 장면 여섯과 한 손 매달림의 손 모으기가 깨졌다)
  //   전신 풀이(fb, 화면 기본)에서만 쓴다(REACHPOLERULE = 옛 규칙 자세에도). 옛 규칙 자세(O 키 비교·시험 기본)에 넣었더니 손목이 어깨 옆·아래에서 위로 크게 돌 때 이 방향(아래·뒤)이 어깨를 뒤로 젖혀 범위 보정(elbowFix)과 걸음마다 다투었고, 그 사이 팔꿈치가 축과 함께 머리 쪽으로 끌려가 손이 "몸에 막혀" 턱 F 13cm 앞에서 묶였다(자작 동작 foot2·foot3·foot8 — 0.11.8은 잡음). 범위를 넘는 방향을 막거나(다른 벽 시험 왼손 거부), 범위 안으로 고쳐 쓰거나(다른 벽 시험 실패 1 → 3), 손목 높이로 가려 막거나(캡처 foot8 거부) 모두 다른 곳을 깨서 옛 규칙 자세는 0.11.8의 팔꿈치 고르기로 둔다
  //   제 몸·다른 팔에 드는 방향도 쓰지 않는다(손을 멈추는 기준과 같게 몸 1mm·다른 팔 4mm. OLDPOLESELF = 지형만 봄): 지형만 보았더니 자작 동작·옛 규칙 자세에서 팔이 머리에 걸린 채 손이 묶여 턱 F 13cm 앞에서 끝났다(foot2·foot3·foot8. 0.11.8은 잡음)
  { const Hh = S.climb.hands[s === 'L' ? 0 : 1], oH = S.climb.hands[s === 'L' ? 1 : 0], oL0 = V(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(s === 'L' ? 1 : -1), crossingP = oH.st === 'hold' && Hh.goal.clone().sub(oH.goal).dot(oL0) < 0.02, footed = S.climb.feet.some(f => f.st === 'plant');
    if (DIM.boxCollide && !globalThis.OLDREACHPOLE && (fbOn(S.climb) || globalThis.REACHPOLERULE) && S.climb.on && Hh.st === 'reach' && Hh.goal.y > sh.y - 0.05 && footed && !crossingP) { const k = clamp((target.y - sh.y + 0.10) / 0.35, 0, 1), bd = V(sx * 0.45, -0.6, -0.65), od = V(sx * 0.85, -0.5, -0.15), p0 = bd.lerp(od, k).applyAxisAngle(UP, yaw).normalize();
      const ik0 = twoBone(sh, target, DIM.upperArm, DIM.foreArm, p0), sf0 = globalThis.OLDPOLESELF ? null : armSelf(B, ik0, sh);
      if (!armHit(S.world, sh, ik0, tb) && sd(sf0, 'body') <= 0.001 && sd(sf0, 'arm') <= 0.004) go = p0; } }
  // 도는 길은 실제로 향하는 방향(go)으로 본다(OLDARCWP = 후보 wp로 봄): 위의 뻗는 팔꿈치 방향을 쓰는 동안 후보로 보면 후보와 반대쪽(바깥)으로 도는 길을 보지 않아, 안쪽에 있던 팔꿈치가 머리를 지나는 가까운 길로 돌다 손이 "몸에 막혀" 묶였다(자작 동작·옛 규칙 자세 foot2·foot3·foot8)
  if (prev) { const gT = globalThis.OLDARCWP ? wp : go, u = target.clone().sub(sh).normalize(), q = prev.clone().addScaledVector(u, -prev.dot(u)), pT = gT.clone().addScaledVector(u, -gT.dot(u));
    if (q.lengthSq() > 1e-6 && pT.lengthSq() > 1e-6) { q.normalize(); pT.normalize(); const ang = q.angleTo(pT), ax = q.clone().cross(pT);
      if (ang > 0.35 && ax.lengthSq() > 1e-8) { ax.normalize(); const arc = (sg, tot, anat) => { let d = 0; for (let a = 0.2; a < tot; a += 0.2) { const h = at(q.clone().applyAxisAngle(ax, sg * a), anat); if (h) d = Math.max(d, h.d); } return d; }, ARCA = UNI && !!globalThis.ARCANAT, dS = arc(1, ang, ARCA);
        // p3d-0.11.8(결정 1, 팔꿈치 규칙 하나로): 도는 길을 고를 때 사람 어깨의 범위도 본다(UNI) — 가까운 길이 등 뒤(범위 밖)를 가로지르면 먼 길로. 전에는 지형·제 몸만 보고, 범위 밖을 지나는 걸음은 그림에서만 고쳤다(그림과 상태가 달라져 잡는 걸음에 팔꿈치가 튀었다)
        //   기본은 끔(ARCANAT=1로 켬): 범위 벌점과 겹침을 한 값으로 견주면 범위 밖을 지나는 가까운 길 대신 턱을 스치는 먼 길을 골라 팔꿈치가 벽 쪽으로 돌았고, 몸을 다 올린 자리(h4, 몸 높이 0.18~0.22m)에서 턱 F가 "팔이 턱에 걸려"로 거부됐다(결정 1 전에는 잡혔다). 먼 길의 겹침을 따로 견주는 조건(아래)으로도 풀리지 않았다. 빼면 300°/s 넘는 걸음이 891 → 1,197(결정 1 전 1,287), 어깨 범위 10° 넘음 65 → 66
        //   켰을 때도 먼 길이 지형·제 몸에 가까운 길보다 더 들면 고르지 않는다(ARCA, OLDARCMIX = 이 조건 없이): 범위 벌점과 겹침을 한 값으로 견주었더니 범위 밖을 지나는 가까운 길 대신 턱을 스치는 먼 길을 골라 팔꿈치가 벽 쪽으로 돌았고, 몸을 다 올린 자리(h4, 몸 높이 0.18~0.22m)에서 턱 F가 "팔이 턱에 걸려"로 거부됐다(결정 1 전에는 잡혔다)
        if (dS > 0.004 && arc(-1, 2 * Math.PI - ang, ARCA) < dS && (!ARCA || globalThis.OLDARCMIX || arc(-1, 2 * Math.PI - ang, false) <= arc(1, ang, false) + 0.002)) { go = q.clone().applyAxisAngle(ax, -1.2); far = true; } } } }
  // p3d-0.11.1: 지금 굽은 쪽이 사람 어깨의 범위를 7° 넘게 벗어나 있으면(손목이 빨리 올라가 어깨→손목 축이 돌았는데 팔꿈치는 늘어뜨렸을 때의 쪽에 남아 등 뒤로 간 경우) 조금 빨리 돌린다(10rad/s. 23으로 두면 팔뚝이 초속 1,600°까지 돌았다 — 0.10.4에서 899로 줄인 것)
  const ovPrev = prev ? armOver(sh, twoBone(sh, target, DIM.upperArm, DIM.foreArm, prev), sx, qC, yaw) : 0;
  const pv0 = UNI && S.pw && S.poleS && S.poleS['el' + s] ? S.poleS['el' + s].clone() : null;
  let pole = bendDir(S, 'el' + s, sh, target, go, hit0 || want || far ? 23 : ovPrev > 0.12 ? 10 : 7, false, true), ik = twoBone(sh, target, DIM.upperArm, DIM.foreArm, pole);
  if (UNI && !globalThis.NOELFIXR) { const f = elbowFix(S, s, sh, target, pole, sx, qC, yaw, tb, globalThis.OLDELGATE ? 0.05 : (globalThis.ELGATE ?? 0.17)); if (f) { pole = f.pole; ik = f.ik;
    // 고친 팔꿈치도 앞 걸음의 상태에서 초속 REACH_POLE_W까지만 바뀐다(한 걸음에 보정이 들어서면 위팔이 43.7° 튀었다 — wall_check). 0.11.6의 그림 쪽 빠르기 한계(elA)를 상태로 옮긴 것
    if (pv0 && !globalThis.NOELFIXRATE) { const u = target.clone().sub(sh).normalize(), q0 = pv0.addScaledVector(u, -pv0.dot(u)); if (q0.lengthSq() > 1e-8) { q0.normalize(); const a = q0.angleTo(pole), mx = CL.REACH_POLE_W * PHY.DT; if (a > mx) { const ax2 = q0.clone().cross(pole); if (ax2.lengthSq() < 1e-10) ax2.copy(u); pole = q0.clone().applyAxisAngle(ax2.normalize(), mx); ik = twoBone(sh, target, DIM.upperArm, DIM.foreArm, pole); S.poleS['el' + s] = pole.clone(); S.poleS['el' + s + 'p'] = pole.clone(); } } } } }
  if (globalThis.__AT) globalThis.__AT.push({ s, wp: wp.toArray(), go: go.toArray(), far, hit0: hit0 ? +hit0.d.toFixed(4) : 0, want: !!want, rate: hit0 || want || far ? 23 : 7 });
  // 팔꿈치 먼저(H.poleWant)에 넘기는 바라는 방향은 실제로 쓴 방향(go). OLDWANTWP = 후보(wp) — 위의 뻗는 팔꿈치 방향(p0)을 쓰는 동안 후보를 넘기면 다음 걸음에 p0로 다시 덮어써 둘이 다투다 손이 묶였다(foot2 옛 규칙 자세 0.37초)
  return { pole, ik, hit: armHit(S.world, sh, ik, tb), self: armSelf(B, ik, sh), want: globalThis.OLDWANTWP ? wp : go };
}
// 시험·진단용(test/self_diag.mjs): 게임 코드에서는 쓰지 않는다
// 진단용(test·추적 도구만 쓴다): 손 i의 팔꿈치를 어깨–손목 축 둘레로 n등분해 돌려 보고 방향마다 지형·제 몸 겹침과 어깨 범위 넘음을 돌려준다(상태를 바꾸지 않는다)
const armRing = (S, i, n = 24, tgt = null) => { const H = S.climb.hands[i], sh = joints(S).sh[i], sx = i ? -1 : 1, qC = S.climb.on && S.climb.T ? S.climb.T.qC : null, B = selfShapes(S, i), goal = tgt || (H.st === 'reach' ? H.w : H.goal), u = goal.clone().sub(sh).normalize(), e1 = Math.abs(u.y) < 0.9 ? UP.clone().cross(u).normalize() : V(1, 0, 0).cross(u).normalize(), tb = H.edge ? H.edge.box : null, out = [];
  for (let k = 0; k < n; k++) { const pl = e1.clone().applyAxisAngle(u, k * 2 * Math.PI / n), ik = twoBone(sh, goal, DIM.upperArm, DIM.foreArm, pl), th = armHit(S.world, sh, ik, tb), sf = armSelf(B, ik, sh); out.push({ a: Math.round(k * 360 / n), el: ik.mid.toArray(), hit: th ? { d: th.d, box: th.box, fore: th.f ? th.f.d : 0, up: th.u ? th.u.d : 0 } : null, body: sd(sf, 'body'), arm: sd(sf, 'arm'), over: armOver(sh, ik, sx, qC, S.body.yaw) }); }
  return { sh: sh.toArray(), goal: goal.toArray(), cur: S.poleS && S.poleS['el' + (i ? 'R' : 'L')] ? twoBone(sh, goal, DIM.upperArm, DIM.foreArm, S.poleS['el' + (i ? 'R' : 'L')]).mid.toArray() : null, ring: out }; };
export const _dbg = { armRing, footAnk: (S, pt) => { const g = resolveFoot(S.world, pt, S.body.yaw); return g ? footGeom(g.p, g.n, g.q).ank : null; }, legParts: (S, i, ank) => { const hj = joints(S).hj[i], sx = i ? -1 : 1, r = legIK(S, hj, ank, S.body.yaw, sx), qP = qArr(pelvisQ(S)), qB = qArr(Q().setFromAxisAngle(UP, S.body.yaw)), a = [vArr(hj), vArr(r.ik.mid), vArr(ank), sx]; return { hj: a[0], knee: a[1], ank: a[2], picked: !!r.picked, pelvis: { leg: legExcess(qP, ...a) / deg, knee: kneeExcess(qP, ...a) / deg }, body: { leg: legExcess(qB, ...a) / deg, knee: kneeExcess(qB, ...a) / deg }, over: hipOver(S, i, hj, ank) / deg }; }, boxFacing: (...a) => boxFacing(...a), armHit: (...a) => armHit(...a), armIK: (...a) => armIK(...a), armSelf: (...a) => armSelf(...a), selfHits: (...a) => selfHits(...a), ARM_SQ, selfShapes: (...a) => selfShapes(...a), heldPole: (...a) => heldPole(...a) };
// 굽는 쪽의 상태를 바꾸지 않고 계산만 해 본다(물리 쪽 검사용. 상태는 그림을 확정할 때만 나아간다)
function dryBend(S, key, f) { const PS = S.poleS || (S.poleS = {}), a = PS[key] ? PS[key].clone() : null, b = PS[key + 'p'] ? PS[key + 'p'].clone() : null, w = PS[key + 'w'], r = f(); if (a) PS[key] = a; else delete PS[key]; if (b) PS[key + 'p'] = b; else delete PS[key + 'p']; PS[key + 'w'] = w; return r; }
function poseArm(S, s, sh, target, yaw, sx, grip, held = !!grip, anchor = null, reach = false, tb = null) {
  const B = S.rig.bones, free = !(held || grip), qC = S.climb.on && S.climb.T ? S.climb.T.qC : null, A0 = reach ? null : held ? heldPole(S, s, sh, target, yaw, sx, qC) : armIK(S.world, sh, target, yaw, sx, qC);
  // 팔꿈치 방향은 고른 후보 쪽으로 정해진 빠르기(7rad/s)로만 돈다. 후보가 바뀌는 걸음(팔꿈치가 턱에 닿아 다른 쪽으로 돌릴 때, 벽 문맥을 드나들 때)에 팔꿈치가 한 걸음에 튀지 않게 한다. 판정(armCheck)은 그대로 고른 후보로 본다
  const pvH = held && !reach && S.pw && S.poleS && S.poleS['el' + s] ? S.poleS['el' + s].clone() : null;
  const R = reach ? reachArm(S, s, sh, target, yaw, sx, qC, reach.isVector3 ? reach : null, tb) : null; let pole = R ? R.pole : bendDir(S, 'el' + s, sh, target, A0.pole, held ? heldRate(S, s, sh, target, sx, qC, yaw) : 7, false, true), ik = R ? R.ik : twoBone(sh, target, DIM.upperArm, DIM.foreArm, pole); const Hs0 = S.climb.hands[s === 'L' ? 0 : 1], lim = free && !reach && !(DIM.boxCollide && !globalThis.OLDRETLIM && S.climb.on && Hs0 && Hs0.ret) ? 14 : 0; // p3d-0.11.9: 돌아오는 호(H.ret — 이미 0.3~0.62초에 걸쳐 부드럽게 정한 길) 동안은 뼈 빠르기 한계를 걸지 않는다(OLDRETLIM = 건다). 위팔·팔뚝이 따로 늦게 따라가 호의 가운데에서 그려진 손목이 어깨 14cm 앞까지 접혔다(정한 길은 28cm, reach3 10.6초)
  // p3d-0.11.6(사용자 "팔이 뒤로 이상하게 꺾이는 현상"): 뻗는 팔이 어깨–손목 축을 돌아 위로 갈 때 팔꿈치가 등 뒤로 넘어가 어깨 범위를 49°까지 넘었다(test/arm_check.mjs, 뻗는 걸음의 0.4%).
  //   범위를 넘으면 팔꿈치를 범위 안의 가장 가까운 쪽으로 돌린다(손목 자리는 그대로 — 그림만이 아니라 판정과 같은 뼈). 돌린 팔꿈치가 지형에 2cm 안으로 들거나 제 몸·다른 팔에 더 들면 돌리지 않는다(처음에는 몸을 보지 않아 팔 교차 장면 둘이 깨졌다 — wall_check)
  if (!R && held && !globalThis.OLDELBOW && !globalThis.NOELFIXH) { const f = elbowFix(S, s, sh, target, pole, sx, qC, yaw); if (f) { pole = f.pole; ik = f.ik; const r = pvH && !globalThis.NOHELDFIXRATE ? poleRate(S, s, sh, target, pvH, pole) : null; if (r) { pole = r.pole; ik = r.ik; } } } // 잡은 팔도 같은 보정(상태에 적음). 빠르기 한계도 같게(NOHELDFIXRATE = 한계 없음: foot2에서 잡은 팔꿈치가 한 걸음에 뒤집혀 위팔이 초속 10,698°)
  if (R && DIM.boxCollide && !globalThis.NOANAT && !globalThis.OLDREACHANAT && globalThis.OLDELBOW && armOver(sh, ik, sx, qC, yaw) > 0.05) { const c = clampElbow([qC ? qC.x : 0, qC ? qC.y : 0, qC ? qC.z : 0, qC ? qC.w : 1].map((v, j) => qC ? v : [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)][j]), [sh.x, sh.y, sh.z], [ik.end.x, ik.end.y, ik.end.z], [pole.x, pole.y, pole.z], sx, DIM.upperArm, DIM.foreArm);
    if (c.moved) { const p2 = V(c.pole[0], c.pole[1], c.pole[2]), k2 = twoBone(sh, ik.end, DIM.upperArm, DIM.foreArm, p2); const Bs = selfShapes(S, s === 'L' ? 0 : 1), s0 = armSelf(Bs, ik, sh), s1 = armSelf(Bs, k2, sh), dS = x => Math.max(sd(x, 'body'), sd(x, 'arm'));
      if (!nearBox(S.world, k2.mid, 0.02) && !nearBox(S.world, sh.clone().lerp(k2.mid, 0.5), 0.02) && dS(s1) <= dS(s0) + 0.002) { pole = p2; ik = k2; } } }
  //   돌린 팔꿈치는 앞 걸음에 그린 쪽에서 초속 REACH_POLE_W(rad)까지만 바뀐다 — 범위의 경계를 넘나들거나 범위 안의 가까운 쪽이 바뀌는 걸음에 팔꿈치가 튀지 않게(처음에는 손목·아래팔 비틀림이 14,003°/s로 튀었다)
  if (R && DIM.boxCollide && !globalThis.OLDREACHANAT && globalThis.OLDELBOW) { const PSr = S.poleS || (S.poleS = {}), kr = 'elA' + s, pv = PSr[kr];
    if (pv && S.pw) { const a = pv.angleTo(pole), mx = CL.REACH_POLE_W * PHY.DT; if (a > mx) { pole = pv.clone().lerp(pole, mx / a).normalize(); ik = twoBone(sh, target, DIM.upperArm, DIM.foreArm, pole); } }
    PSr[kr] = pole.clone(); } else if (S.poleS) delete S.poleS['elA' + s];
  // lim(회전 빠르기 누르기)은 놓인 팔만. 뻗는 손의 자리는 물리 상태(H.w)라 그림이 늦게 따라가면 그림의 손·팔뚝이 벽 속을 지나간다(0.8.0~0.8.1: 겨누는 곳을 바꾸는 순간 그림의 손목이 벽 안 7~10cm)
  // p3d-0.11.7: 비틀림의 기준(hint)은 어깨–손목 축에 수직인 몫으로 — 범위 보정·빠르기 한계(0.11.6)를 거친 뻗는 팔의 극 방향은 축 방향 몫이 커서, 위팔에 수직으로 눕히면 부호가 뒤집혀 위팔·아래팔의 비틀림이 잡은 팔과 180° 달랐다(잡는 걸음부터 초속 456°로 되돌아 돎, foot8 5.59초).
  //   twoBone은 수직 몫만 쓰므로 팔꿈치 자리는 그대로다. OLDHINTPERP = 전처럼
  if (R && pole !== R.pole && !globalThis.OLDHINTPERP) { const ax = target.clone().sub(sh); if (ax.lengthSq() > 1e-8) { ax.normalize(); const pp = pole.clone().addScaledVector(ax, -pole.dot(ax)); if (pp.lengthSq() > 1e-8) pole = pp.normalize(); } }
  const hint = pole.clone().negate();
  aimCont(S, B[`upperArm.${s}`], ik.mid.clone().sub(sh), hint, 8, lim); aimCont(S, B[`foreArm.${s}`], ik.end.clone().sub(ik.mid), hint, 8, lim);
  // 손의 방향: 잡았으면 턱 쪽(정확히). 뻗는 중에는 가까워질수록(40cm 안) 팔뚝 방향에서 턱 쪽으로 미리 돌려 둔다(잡는 걸음에 손이 꺾이지 않게). 놓인 손은 팔뚝을 따라가되 천천히 돈다
  const fa = ik.end.clone().sub(ik.mid).normalize(), near = grip && !held ? clamp(1 - ik.end.distanceTo(anchor || grip) / 0.40, 0, 1) : 1;
  const hd = grip ? fa.clone().lerp(grip.clone().sub(held || !anchor ? ik.end : anchor).normalize(), near).normalize() : fa;
  // p3d-0.11.6(사용자 "턱을 잡으려고 할 때 팔목부터 손등, 손가락이 뒤집히고 난리"): 뻗는 손의 손바닥(제어 손의 +z)이 팔꿈치 반대쪽(−pole)을 따라가 팔꿈치가 돌 때마다 손바닥이 화면 쪽으로 돌았다(뻗는 걸음의 34%).
  //   뻗는 손은 손바닥이 벽 쪽(몸 앞) + 조금 아래를 보게 한다. 팔뚝이 그 방향과 나란하면 aimCont가 앞 걸음의 비틀림을 이어 쓴다(비틀기 8rad/s 한계)
  //   손목은 팔뚝에 대해 ±PALM_TW까지만 비튼다(사람의 아래팔 비틀기 범위. 넘으면 그림의 아래팔이 비틀림을 반씩 나누다 ±180°에서 한 걸음에 뒤집혔다 — 21,000°/s). 원하는 비틀림이 범위를 넘으면 앞 걸음에 있던 쪽 끝에 머문다(반대쪽 끝으로 건너뛰지 않는다)
  let palmHint = hint;
  if (reach && !held && !globalThis.OLDPALM) { const u = hd.clone().normalize(), fz = V(0, 0, 1).applyQuaternion(B[`foreArm.${s}`].getWorldQuaternion(Q())).projectOnPlane(u), hz = V(0, 0, 1).applyQuaternion(B[`hand.${s}`].getWorldQuaternion(Q())).projectOnPlane(u), w = V(Math.sin(yaw), 0, Math.cos(yaw)).addScaledVector(UP, -CL.PALM_DOWN).projectOnPlane(u);
    if (fz.lengthSq() > 1e-6 && w.lengthSq() > 1e-6 && hz.lengthSq() > 1e-6) { fz.normalize(); w.normalize(); hz.normalize(); const mid = sx * Math.PI / 2, tw = (x, y) => Math.atan2(x.clone().cross(y).dot(u), x.dot(y));
      // d = 마네킹의 손·아래팔 비틀림(0 = 쉬는 관계). 지금 값(앞 걸음의 손)에서 이어 재고, 원하는 값은 지금 값에서 가까운 쪽으로 잰 뒤 범위로 누른다. 한 걸음의 목표는 지금 값에서 0.5rad 안 — aimCont는 세계에서 가까운 길로 도므로, 멀리 두면 범위 밖(±180°)으로 돌아간다
      const d0 = tw(fz, hz) - mid; let dw = tw(fz, w) - mid; while (dw - d0 > Math.PI) dw -= 2 * Math.PI; while (dw - d0 < -Math.PI) dw += 2 * Math.PI;
      const d = d0 + clamp(clamp(dw, -CL.PALM_TW, CL.PALM_TW) - d0, -0.5, 0.5); palmHint = fz.applyAxisAngle(u, mid + d); } }
  aimCont(S, B[`hand.${s}`], hd, palmHint, 8, held ? 0 : 22);
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
    const hj = T.hj[F.i], tgt = F.st === 'plant' ? F.ank : F.a, want = legIK(S, hj, tgt, b.yaw, F.i ? -1 : 1, F.st !== 'free', true).pole;
    // 디딘 다리의 무릎이 도는 빠르기(p3d-0.9.0 고침): 몸통 자세의 층을 켠 채 디딘 다리는 초속 3.5라디안(200°)까지, 벽·턱에 2cm 안으로 닿았을 때도 8라디안까지. 0.8.8까지는 7 / 26이었다 — 26은 무릎을 0.06초에 반대쪽으로 돌릴 수 있다
    const pl0 = F.st === 'plant' && poseOn(K), r0 = pl0 ? 3.5 : 7, r1 = pl0 ? (K.post !== 'base' && DIM.boxCollide ? (globalThis.KNEE_R1 ?? 4.5) : 8) : 26; // p3d-0.10.2(새 규칙): 디딘 다리의 빼내기 4.5rad/s(258°/s. p3d-0.10.3에서 5 → 4.5: 팔의 길을 고친 뒤 v7에서 늘어진 오른발이 무릎을 벽 안에 둔 채 디뎌 304°/s). 8이면 발판 옆을 지나는 디딘 무릎이 초속 458°로 돌았다(h3, 손 접촉 틀을 넣은 뒤)
    const capK = poseOn(K) && K.post !== 'base' && DIM.boxCollide; // p3d-0.10.2: 새 규칙에서는 실제 도는 각도에도 같은 한계(bendDir의 cap). 발이 떨어진 걸음에 늘어진 다리의 규칙으로 바뀌며 무릎이 한 걸음에 43mm(초속 802°) 튀었다(m3)
    const PSk = S.poleS || (S.poleS = {}), keep = capK ? [PSk['kn' + F.s] && PSk['kn' + F.s].clone(), PSk['kn' + F.s + 'p'] && PSk['kn' + F.s + 'p'].clone()] : null; // 빼내기로 다시 부를 때 같은 앞 걸음에서 시작하게(p3d-0.10.2: 두 번 부르면 한 걸음에 3.5 + 5rad/s를 돌아 디딘 다리가 초속 438°로 돌았다)
    let pole = bendDir(S, 'kn' + F.s, hj, tgt, want, r0, false, false, capK ? r0 : 0), ik = twoBone(hj, tgt, DIM.thigh, DIM.shin, pole), lim = F.st === 'plant' ? 0 : 14;
    // 무릎이 벽·턱에 닿았으면(2cm 안) 고른 쪽으로 더 빨리 돌려 빼낸다(천천히 돌리는 동안 벽 안에 남지 않게)
    if (nearBox(S.world, ik.mid, 0.02)) { if (keep) { if (keep[0]) PSk['kn' + F.s] = keep[0]; if (keep[1]) PSk['kn' + F.s + 'p'] = keep[1]; } pole = bendDir(S, 'kn' + F.s, hj, tgt, want, r1, false, false, capK ? r1 : 0); ik = twoBone(hj, tgt, DIM.thigh, DIM.shin, pole); lim = lim && 30; }
    if (globalThis.__KT) globalThis.__KT.push({ leg: F.s, st: F.st, near: nearBox(S.world, ik.mid, 0.02), want: want.toArray(), pole: pole.toArray(), knee: ik.mid.toArray(), hj: hj.toArray() });
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
  for (const H of K.hands) { const w = worldPos(B[`hand.${H.s}`]); if (H.st === 'hold') st.palmErr = Math.max(st.palmErr, B[`hand.${H.s}`].localToWorld(V(0, -palmLen(), 0)).distanceTo(H.grip)); else if (H.st === 'free' && !K.on) H.w.copy(w); }
  for (const F of K.feet) { if (F.st === 'plant') st.footErr = Math.max(st.footErr, worldPos(B[`toe.${F.s}`]).distanceTo(F.ball)); else if (!K.on) F.a.copy(worldPos(B[`foot.${F.s}`])); }
  for (const H of K.hands) if (H.st === 'hold') { const sh = worldPos(B[`upperArm.${H.s}`]), c = armCheck(S, H.i, sh, H.goal); if (c && c !== '어깨가 돌아가지 않는 방향(등 뒤)') { st.selfPen++; st.penWhat = `${c} @${K.tick}`; } }
  if (K.on) for (const n of ['hand.L', 'hand.R', 'foreArm.L', 'foreArm.R', 'leg.L', 'leg.R', 'foot.L', 'foot.R', 'toe.L', 'toe.R', 'chest', 'head', 'hips']) { const p = worldPos(B[n]), x = S.world.boxes.find(x => p.x > x.min.x + 0.01 && p.x < x.max.x - 0.01 && p.y > x.min.y + 0.01 && p.y < x.max.y - 0.01 && p.z > x.min.z + 0.01 && p.z < x.max.z - 0.01); if (x) { if (K.tick === K.enterTick) { st.penEnter = (st.penEnter || 0) + 1; st.penEnterWhat = `${n} → ${x.name}`; } else { st.pen++; st.penWhat = `${n} → ${x.name} @${K.tick}`; } } }
}
export const limbState = K => ({
  on: K.on,
  hands: K.hands.map(h => ({ s: h.s, st: h.st, armBlock: h.st === 'reach' && (h.blockT || 0) > 0.12, selfBlock: h.st === 'reach' && (h.selfBlock || 0) > 0.12, armCross: h.st === 'reach' && (h.armCross || 0) > 0.12, swivel: h.st === 'reach' && !!h.swivel, up: h.st === 'reach' && h.up ? { d: h.up.d, n: h.up.n.toArray() } : null, load: h.load, act: h.act || 0, pas: h.pas || 0, loadS: h.loadS || 0, cap: h.cap || 0, why: h.why, arm: h.arm ? { p: h.arm.p, short: h.arm.short, t: h.arm.t, tried: !!h.arm.tried } : null, auto: h.st === 'reach' && !!h.auto, grip: h.st === 'free' ? null : h.grip.toArray(), w: h.w.toArray(), box: h.st !== 'free' && h.edge ? h.edge.box.name : '' })),
  feet: K.feet.map(f => ({ s: f.s, st: f.st, load: f.load, loadS: f.loadS || 0, cap: f.cap || 0, ok: f.ok, kind: f.kind, auto: f.auto, why: f.why, p: f.st === 'free' ? null : f.p.toArray(), box: f.st !== 'free' && f.box ? f.box.name : '' })),
});
