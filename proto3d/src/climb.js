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
const short = d => (d < 0.01 ? `${Math.max(1, Math.round(d * 1000))}mm` : `${(d * 100).toFixed(0)}cm`);
const SIDES = ['L', 'R'], KO = { hand: ['왼손', '오른손'], foot: ['왼발', '오른발'] };
const TORSO = ['hips', 'spine', 'chest', 'neck', 'head', 'shoulder.L', 'shoulder.R'];

export const CL = {
  MASS: 70,
  ARM: (DIM.upperArm + DIM.foreArm) * 0.995, PALM: 0.08, LEG: DIM.leg * 0.999, LEG_MIN_H: 0.30,
  SNAP: 0.14, CATCH: 0.002, TRY_T: 0.30,
  HAND_V: 2.4, HAND_T0: 0.22, HAND_T1: 0.60, FOOT_V: 1.1, FOOT_T0: 0.28, FOOT_T1: 0.90,
  ARM_F: 0.65, LEG_F: 1.5, LEG_PERP: 0.35, MU_TOP: 0.9, MU_WALL: 1.0, COM_H: 1.0, MOM: 8,
  GRIP_ANG: 50 * deg, GRIP_MIN: 0.15, SLIP_T: 0.10, SHOCK_V: 1.5,
  KP: 60, KD: 14, ACC_MAX: 7, DAMP: 0.6, SHIFT_V: 0.5, REF_LAG: 0.08,
  BLEND_T: 0.25, TURN: 3, OUT_FEET: 0.30, DANGLE: 0.80, SHOULDER_BACK: -0.2, FACE_MIN: -0.17, SHRUG: 0.42, IDLE_T: 0.05,
  R_TORSO: 0.16, R_HEAD: 0.12, R_GROW: 0.4, 
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
const anchorOf = g => g.p.clone().add(V(0, -Math.sqrt(CL.PALM * CL.PALM - 0.0004), 0)).addScaledVector(g.n, 0.02);
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
  return { on: false, hands: [hand('L', 0), hand('R', 1)], feet: [foot('L', 0), foot('R', 1)], ref: V(), lean: { x: 0, z: 0 }, shrug: [0, 0], bumpT: -9, blend: null, out: null, T: null, events: [], log: [], tick: 0, exited: false,
    stats: { palmErr: 0, footErr: 0, pen: 0, penWhat: '', selfPen: 0, dvMax: 0, dvAt: -1, wallHit: 0 } };
}
function note(S, type, limb, i, why = '', extra = {}) {
  const K = S.climb, e = { k: K.tick, t: +(K.tick / 120).toFixed(3), type, limb, i, name: limb ? KO[limb][i] : '', why, ...extra };
  K.events.push(e); K.log.push(e); if (K.log.length > 300) K.log.shift();
  return e;
}

// ── 몸통의 틀: 어깨·고관절 자리. 물리와 그림이 같은 함수를 쓴다(손이 잡은 자리와 그림이 어긋나지 않게) ──
export function torso(b, K) {
  const tq = { hips: Q().setFromAxisAngle(UP, b.yaw).multiply(Q().setFromAxisAngle(V(0, 0, 1), K.lean.z * 0.4)), spine: Q().setFromEuler(new THREE.Euler(K.lean.x, 0, K.lean.z * 0.6, 'ZXY')), chest: Q(), neck: Q().setFromAxisAngle(X, K.hands.some(h => h.st === 'hold') ? -0.18 : 0), head: Q(), 'shoulder.L': Q().setFromAxisAngle(V(0, 0, 1), K.shrug[0]), 'shoulder.R': Q().setFromAxisAngle(V(0, 0, 1), -K.shrug[1]) };
  if (K.blend) { const k = mj(clamp(K.blend.t / CL.BLEND_T, 0, 1)); for (const n of TORSO) tq[n] = K.blend.q[n].clone().slerp(tq[n], k); }
  const hip = V(b.pos.x, b.pos.y + DIM.hipY, b.pos.z), qH = tq.hips, qS = qH.clone().multiply(tq.spine), qC = qS.clone().multiply(tq.chest);
  const chest = hip.clone().add(V(0, DIM.spine, 0).applyQuaternion(qH)).add(V(0, DIM.chest, 0).applyQuaternion(qS));
  const sh = SIDES.map((s, i) => { const sx = i ? -1 : 1, qSh = qC.clone().multiply(tq[`shoulder.${s}`]); return chest.clone().add(V(sx * DIM.clavX, DIM.clavY, 0).applyQuaternion(qC)).add(V(sx * DIM.shoulderX, 0, 0).applyQuaternion(qSh)); });
  const hj = SIDES.map((s, i) => hip.clone().add(V((i ? -1 : 1) * DIM.hipW, -DIM.hipDrop, 0).applyQuaternion(qH)));
  const head = chest.clone().add(V(0, DIM.neck + DIM.head + DIM.headR * 0.9, 0).applyQuaternion(qC));
  return { tq, hip, sh, hj, chest, head };
}
const joints = S => (S.climb.on && S.climb.T ? S.climb.T : { sh: SIDES.map(s => worldPos(S.rig.bones[`upperArm.${s}`])), hj: SIDES.map(s => worldPos(S.rig.bones[`upLeg.${s}`])) });
const armPole = (yaw, sx) => V(sx * 0.5, -1, -0.35).applyAxisAngle(UP, yaw).normalize();
// 팔꿈치의 기본 방향: 아래·바깥·조금 뒤. 팔꿈치가 벽·턱에 들어가면 들어가지 않을 때까지 더 뒤·바깥으로 돌린다
function armIK(world, sh, tgt, yaw, sx) {
  let ik, pole;
  for (const c of [[0.5, -1, -0.35], [0.6, -0.6, -0.8], [0.3, -0.3, -1], [1, -0.3, -0.4], [0.2, 0.2, -1]]) { pole = V(sx * c[0], c[1], c[2]).applyAxisAngle(UP, yaw).normalize(); ik = twoBone(sh, tgt, DIM.upperArm, DIM.foreArm, pole); if (!world.boxes.some(x => ik.mid.x > x.min.x - 0.03 && ik.mid.x < x.max.x + 0.03 && ik.mid.y > x.min.y - 0.03 && ik.mid.y < x.max.y + 0.03 && ik.mid.z > x.min.z - 0.03 && ik.mid.z < x.max.z + 0.03)) break; }
  return { ik, pole };
}

// ── 판정(미리보기와 실제가 같은 함수를 쓴다) ──
function pathBlocked(world, from, via, goal) { const mid = from.clone().multiplyScalar(0.25).addScaledVector(via, 0.5).addScaledVector(goal, 0.25); return rayHit(world, from, mid) < 1 || rayHit(world, mid, goal) < 1; }
const viaOf = (from, goal, n, lift) => from.clone().add(goal).multiplyScalar(0.5).addScaledVector(n, lift);
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
  const { ik } = armIK(S.world, sh, goal, yaw, sx);
  if (rayHit(S.world, sh.clone().lerp(ik.mid, 0.2), ik.mid) < 1 || rayHit(S.world, ik.mid, ik.mid.clone().lerp(ik.end, 0.9)) < 1) return '팔이 벽·턱을 지나감';
  const hip = worldPos(B.hips), nk = worldPos(B.neck), hd = worldPos(B.head).add(V(0, DIM.headR * 0.9, 0)), left = V(Math.cos(yaw), 0, -Math.sin(yaw));
  const d = segSeg(ik.mid, ik.end, hip, nk), dx = d.dot(left) / 0.20, dz = d.dot(fwd) / 0.13;
  if (dx * dx + dz * dz < 1 && Math.abs(d.y) < 0.05) return '팔이 몸통을 지나감';
  // 팔이 귀 옆에 붙는 것(팔 가운데 선이 머리 가운데에서 11.5cm)까지는 된다. 그보다 가까우면 팔이 머리를 지나간 것이다
  if (segSeg(ik.mid, ik.end, hd, hd).length() < 0.115 || segSeg(sh, ik.mid, hd, hd).length() < 0.115) return '팔이 머리를 지나감';
  return '';
}
// 무릎의 기본 방향: 벽 쪽에서 30° 바깥, 많이 굽힐수록 옆으로(편한 기본값. 허용 판정이 아니다). 무릎이 벽·턱에 들어가면 들어가지 않을 때까지 더 옆으로 돌린다
const nearBox = (world, p, m) => world.boxes.some(x => p.x > x.min.x - m && p.x < x.max.x + m && p.y > x.min.y - m && p.y < x.max.y + m && p.z > x.min.z - m && p.z < x.max.z + m);
function legIK(S, hj, ank, yaw, sx) {
  const bend = clamp((1 - hj.distanceTo(ank) / DIM.leg - 0.05) / 0.35, 0, 1), a0 = lerp(30, 72, bend);
  let ik, pole;
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
  if (!K.on) return { ok: false, why: '손으로 잡은 뒤에 발을 보낼 수 있음(이번 판의 범위)', sure: true };
  if (!g) return { ok: false, why: '디딜 수 있는 면이 아님', sure: true };
  const G = footGeom(g.p, g.n, g.q), hj = joints(S).hj[i], d = hj.distanceTo(G.ank), sure = S.body.vel.length() < 0.3, base = { grip: g.p.toArray(), name: g.box.name, kind: g.kind, sure };
  if (d > DIM.leg * 0.995) return { ...base, ok: false, short: d - DIM.leg * 0.995, why: `발이 닿지 않음(${short(d - DIM.leg * 0.995)} 모자람)` };
  const c = legCheck(S, i, hj, G.ank);
  return c ? { ...base, ok: false, why: c } : { ...base, ok: true, why: '' };
}

// ── 명령: 시도 → (성공 | 거부) → 유지 → 놓기 ──
export function command(S, c) {
  const K = S.climb, pt = c.p ? V(...c.p) : null;
  if (c.type === 'release') { if (c.limb === 'hand') releaseHand(S, c.i, '놓음'); else liftFoot(S, c.i, '뗌'); return; }
  if (c.type === 'hand') {
    const H = K.hands[c.i], g = resolveGrip(S.world, pt);
    note(S, 'try', 'hand', c.i, '', { p: c.p });
    if (!g) { reject(S, H, 'hand', '잡을 수 있는 턱이 아님'); return; }
    if (H.st === 'hold') releaseHand(S, c.i, '옮기려고 놓음');
    const goal = anchorOf(g), via = viaOf(H.w, goal, g.n, 0.10);
    if (pathBlocked(S.world, H.w, via, goal)) { reject(S, H, 'hand', '손이 가는 길이 막힘'); return; }
    Object.assign(H, { st: 'reach', edge: g.edge, t: 0, tryT: 0, T: clamp(H.w.distanceTo(goal) / CL.HAND_V, CL.HAND_T0, CL.HAND_T1), ov: 1, why: '' });
    H.from.copy(H.w); H.via.copy(via); H.goal.copy(goal); H.grip.copy(g.p); H.n.copy(g.n);
  }
  if (c.type === 'foot') {
    const F = K.feet[c.i];
    note(S, 'try', 'foot', c.i, '', { p: c.p });
    if (!K.on) { reject(S, F, 'foot', '손으로 잡은 뒤에 발을 보낼 수 있음(이번 판의 범위)'); return; }
    const g = resolveFoot(S.world, pt, S.body.yaw);
    if (!g) { reject(S, F, 'foot', '디딜 수 있는 면이 아님'); return; }
    if (F.st === 'plant') liftFoot(S, c.i, '옮기려고 뗌');
    const G = footGeom(g.p, g.n, g.q), out = g.kind === 'smear' ? g.n : V(-Math.sin(S.body.yaw), 0, -Math.cos(S.body.yaw));
    // 발이 가는 길: 윗면에는 위·바깥에서 내려 디딘다(턱 모서리를 뚫고 가지 않게)
    Object.assign(F, { st: 'move', kind: g.kind, box: g.box, patch: g.patch, t: 0, tryT: 0, T: clamp(F.a.distanceTo(G.ank) / CL.FOOT_V, CL.FOOT_T0, CL.FOOT_T1), auto: false, why: '' });
    F.from.copy(F.a); F.via.copy(viaOf(F.a, G.ank, out, 0.14)); F.via.y = Math.max(F.a.y, G.ank.y) + (g.kind === 'top' ? 0.10 : 0.03); F.p.copy(g.p); F.ball.copy(G.ball); F.ank.copy(G.ank); F.q.copy(g.q); F.n.copy(g.n);
  }
}
function reject(S, L, limb, why) { const J = joints(S); L.why = why; if (limb === 'hand') { L.rel.copy(L.w).sub(J.sh[L.i]); L.st = 'free'; } else { L.rel.copy(L.a).sub(J.hj[L.i]); L.st = 'free'; } note(S, 'reject', limb, L.i, why); }
function releaseHand(S, i, why, type = 'release') { const K = S.climb, H = K.hands[i]; if (H.st === 'free') return; const was = H.st; H.st = 'free'; H.F = null; H.rel.copy(H.w).sub(joints(S).sh[i]); H.load = 0; H.bad = 0; H.why = why; if (was === 'hold') note(S, type, 'hand', i, why, { vel: S.body.vel.toArray() }); }
function liftFoot(S, i, why, type = 'lift') { const K = S.climb, F = K.feet[i]; if (F.st === 'free') return; const was = F.st; F.st = 'free'; F.F = null; F.cool = 0.22; F.rel.copy(F.a).sub(joints(S).hj[i]); F.load = 0; F.ok = false; F.why = why; if (was === 'plant') note(S, type, 'foot', i, why); }

// 보내는 손발을 한 걸음 옮긴다. 어깨·고관절에서 닿는 데까지만 간다(늘어나지 않는다). 다 가서 닿았으면 잡고, 닿지 않으면 잠깐 더 뻗어 보다가 거부한다
function limbsStep(S, dt) {
  const K = S.climb, J = joints(S);
  for (const H of K.hands) {
    if (H.st !== 'reach') continue;
    H.t += dt;
    const u = mj(Math.min(1, H.t / H.T)), p = H.from.clone().multiplyScalar((1 - u) * (1 - u)).addScaledVector(H.via, 2 * u * (1 - u)).addScaledVector(H.goal, u * u), sh = J.sh[H.i], d = p.clone().sub(sh);
    if (d.length() > CL.ARM) p.copy(sh).addScaledVector(d.normalize(), CL.ARM);
    H.w.copy(p);
    if (H.t < H.T) continue;
    const miss = H.w.distanceTo(H.goal);
    if (miss <= CL.CATCH) { const c = armCheck(S, H.i, sh, H.goal, H.n); if (c) reject(S, H, 'hand', c); else grab(S, H); }
    else if ((H.tryT += dt) > CL.TRY_T) reject(S, H, 'hand', `닿지 않음(${short(miss)} 모자람)`);
  }
  if (!K.on) return;
  for (const F of K.feet) {
    const hj = J.hj[F.i];
    if (F.st === 'move') {
      F.t += dt;
      const k = Math.min(1, F.t / F.T), u = mj(k), p = F.from.clone().multiplyScalar((1 - u) * (1 - u)).addScaledVector(F.via, 2 * u * (1 - u)).addScaledVector(F.ank, u * u), R = DIM.leg * 0.995;
      // 윗면으로 가는 발은 먼저 들어 올린 뒤에 옮긴다(발끝이 턱 모서리를 뚫고 가지 않게)
      if (F.kind === 'top') { const uv = mj(clamp(k / 0.45, 0, 1)), uh = mj(clamp((k - 0.4) / 0.6, 0, 1)); p.set(lerp(F.from.x, F.ank.x, uh), lerp(F.from.y, F.ank.y, uv) + 0.08 * Math.sin(Math.PI * k), lerp(F.from.z, F.ank.z, uh)); }
      const d = p.clone().sub(hj);
      if (d.length() > R) p.copy(hj).addScaledVector(d.normalize(), R);
      F.a.copy(p);
      if (F.t < F.T) continue;
      const miss = F.a.distanceTo(F.ank);
      if (miss <= CL.CATCH) { const c = legCheck(S, F.i, hj, F.ank); if (c) reject(S, F, 'foot', c); else { F.st = 'plant'; F.a.copy(F.ank); F.load = 0; note(S, 'step', 'foot', F.i, F.kind === 'top' ? '윗면' : '벽면', { box: F.box.name }); } }
      else if ((F.tryT += dt) > CL.TRY_T) reject(S, F, 'foot', `발이 닿지 않음(${short(miss)} 모자람)`);
    } else if (F.st === 'free') {
      // 늘어뜨린 발: 고관절 아래의 쉬는 자리로 돌아가고, 윗면에 닿으면 저절로 디딘다(닿은 것은 접촉이다. 붙이는 것이 아니다)
      // 막 뗀 발은 잠깐(0.22초) 다시 디디지 않고 쉬는 자리로 옮겨 간다(끌려가며 디뎠다 뗐다 하지 않게)
      F.cool = Math.max(0, (F.cool || 0) - dt);
      const rest = V((F.i ? -1 : 1) * 0.02, -CL.DANGLE + (F.cool > 0 ? 0.05 * Math.sin(Math.PI * F.cool / 0.22) : 0), -0.06).applyAxisAngle(UP, S.body.yaw);
      F.rel.lerp(rest, 1 - Math.exp(-(F.cool > 0 ? 18 : 10) * dt)); F.a.copy(hj).add(F.rel);
      // 늘어뜨린 발·발끝이 벽·턱 옆면에 들어가면 들어가지 않을 때까지 벽에서 뗀다
      { const fw = V(Math.sin(S.body.yaw), 0, Math.cos(S.body.yaw)); for (let k = 0; k < 10 && (nearBox(S.world, F.a, 0.03) || nearBox(S.world, F.a.clone().addScaledVector(fw, 0.13).add(V(0, -0.05, 0)), 0.01)); k++) { F.a.addScaledVector(fw, -0.03); F.rel.addScaledVector(fw, -0.03); } }
      const g = groundAt(S.world, F.a.x, F.a.z, F.a.y - DIM.ankleY + 0.04, 0, 0), g2 = groundAt(S.world, F.a.x, F.a.z, F.a.y + 0.05, 0, 0.12);
      F.clear = g2.box ? Math.max(0, F.a.y - DIM.ankleY - g2.y) : 9;
      if (g.box && F.a.y - DIM.ankleY <= g.y) {
        // 닿은 발: 다리가 닿는 자리이고 몸이 올라가는 중이 아니면 디딘다. 아니면 발끝만 닿은 채 둔다(면 아래로 들어가지 않게 올려 둔다)
        const yaw = S.body.yaw, fwd = V(Math.sin(yaw), 0, Math.cos(yaw)), p = V(F.a.x, g.y, F.a.z).addScaledVector(fwd, DIM.ballZ), q = Q().setFromAxisAngle(UP, yaw), G = footGeom(p, UP, q);
        F.a.y = g.y + DIM.ankleY; F.rel.copy(F.a).sub(hj);
        if (!(F.cool > 0) && S.body.vel.y <= 0.05 && hj.distanceTo(G.ank) <= DIM.leg * 0.995 && hj.y - g.y >= CL.LEG_MIN_H) {
          Object.assign(F, { st: 'plant', kind: 'top', box: g.box, patch: patchOf(p, fwd, g.box), auto: true, load: 0, why: '' });
          F.p.copy(p); F.ball.copy(G.ball); F.ank.copy(G.ank); F.a.copy(G.ank); F.q.copy(q); F.n.copy(UP);
          note(S, 'step', 'foot', F.i, '닿아서 디딤', { box: g.box.name, auto: true });
        }
      }
    }
  }
}
function grab(S, H) {
  const K = S.climb; H.st = 'hold'; H.w.copy(H.goal); H.load = 0; H.bad = 0; H.jam = 0; H.why = ''; H.F = null;
  note(S, 'grab', 'hand', H.i, '', { box: H.edge.box.name, grip: H.grip.toArray() });
  if (!K.on) enter(S);
}
// 벽 문맥으로 들어간다(첫 손이 잡힌 순간). 몸의 속도는 그대로. 땅에 서 있었으면 두 발은 지금 디딘 자리의 접촉이 된다
function enter(S) {
  const K = S.climb, b = S.body, B = S.rig.bones, hip = worldPos(B.hips);
  K.shrug[0] = 0; K.shrug[1] = 0; K.on = true; K.blend = { t: 0, q: Object.fromEntries(TORSO.map(n => [n, B[n].quaternion.clone()])) };
  K.blend.q.hips = B.hips.getWorldQuaternion(Q());
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
  note(S, 'enter', null, 0, wasGround ? '서서 잡음' : '공중에서 잡음', { vel: b.vel.toArray(), gy });
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
  return F;
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
  const rollT = held.length === 1 && !planted.some(f => f.load > 0.1) ? (held[0].i ? -1 : 1) * (K.hands.some(h => h.st === 'reach') ? 0.12 : 0.3) : 0;
  // 머리 위(25cm 안)에 턱이 있으면 머리가 그 앞으로 지나가게 윗몸을 젖힌다(필요한 만큼만)
  let need = 0; const hx = b.pos.x, hz = b.pos.z, hy = b.pos.y + DIM.hipY + DIM.spine + 0.60, back = fwd.clone().negate();
  for (const x of W.boxes) { if (x.kind === 'floor' || x.min.y > hy + CL.R_HEAD + 0.25 || x.max.y < hy - CL.R_HEAD) continue; if (Math.hypot(hx - clamp(hx, x.min.x, x.max.x), hz - clamp(hz, x.min.z, x.max.z)) >= CL.R_HEAD + 0.02) continue; const supp = Math.max(x.min.x * back.x, x.max.x * back.x) + Math.max(x.min.z * back.z, x.max.z * back.z); need = Math.max(need, supp + CL.R_HEAD + 0.03 - (hx * back.x + hz * back.z)); }
  const leanT = held.length ? Math.min(sup ? -0.2 : -0.04, -Math.asin(clamp(need / 0.60, 0, 0.5))) : 0;
  K.lean.x += (leanT - K.lean.x) * (1 - Math.exp(-8 * dt)); K.lean.z += (rollT - K.lean.z) * (1 - Math.exp(-4 * dt));
  // 어깨(빗장뼈) 올림: 편 팔로 매달리면 그 어깨가 올라가 있고(힘을 뺀 매달림), 다른 손을 위로 뻗거나 몸을 당기면 매달린 어깨는 내리고(몸이 5cm쯤 올라온다) 뻗는 쪽 어깨가 올라간다
  { const reaching = K.hands.some(h => h.st === 'reach' && h.goal.y > b.pos.y + 1.4), up = (inp.cy || 0) > 0;
    K.hands.forEach((h, i) => { const t = h.st === 'reach' && h.goal.y > b.pos.y + 1.4 ? CL.SHRUG : h.st === 'hold' && h.load > 0.5 && !reaching && !up ? CL.SHRUG : 0; K.shrug[i] += (t - K.shrug[i]) * (1 - Math.exp(-5 * dt)); }); }
  // 의도: 기준 자리를 옮긴다(위·아래·좌·우). 벽에 발을 대고 버틸 때는 엉덩이를 벽에서 뗀다
  K.ref.addScaledVector(left, -(inp.cx || 0) * CL.SHIFT_V * dt); K.ref.y += (inp.cy || 0) * CL.SHIFT_V * dt;
  if (held.length && planted.some(f => f.kind === 'smear')) { const c = V(); for (const h of held) c.add(h.goal); c.multiplyScalar(1 / held.length); const cur = K.ref.clone().sub(c).dot(nW); K.ref.addScaledVector(nW, clamp(CL.OUT_FEET - cur, -0.4 * dt, 0.4 * dt)); }
  // 발판 위에 선 발이 몸을 받치면 엉덩이를 그 발 위로 가져간다(균형 잡기). 손이 없으면 좌우도 발바닥 범위 안에 둔다
  { const tops = planted.filter(f => f.kind === 'top' && f.load > 0.1 && f.box.kind !== 'floor'); if (tops.length) { const c = V(); for (const f of tops) c.add(V((f.patch.x0 + f.patch.x1) / 2, 0, (f.patch.z0 + f.patch.z1) / 2)); c.multiplyScalar(1 / tops.length); const d = c.sub(K.ref).setY(0), along = held.length ? fwd.clone().multiplyScalar(d.dot(fwd)) : d; K.ref.add(along.clampLength(0, 0.3 * dt)); } }
  // 접촉 기하와 힘 나누기
  const T = torso(b, K), aDes = K.ref.clone().sub(b.pos).multiplyScalar(CL.KP).addScaledVector(b.vel, -CL.KD).clampLength(0, CL.ACC_MAX), Fd = aDes.add(V(0, PHY.G, 0)).multiplyScalar(m), C = [], who = [], com = V(b.pos.x, b.pos.y + CL.COM_H, b.pos.z);
  for (const f of planted) {
    // 윗면을 디딘 발은 발바닥 범위 안에서 누르는 점을 옮길 수 있다(무게중심 아래에 가장 가까운 점)
    const hj = T.hj[f.i], cop = f.kind === 'top' ? V(clamp(com.x, f.patch.x0, f.patch.x1), f.p.y, clamp(com.z, f.patch.z0, f.patch.z1)) : f.p;
    C.push({ f0: f.F, n: f.n, mu: f.kind === 'top' ? CL.MU_TOP : CL.MU_WALL, w: hj.clone().sub(f.ank).normalize(), cap: CL.LEG_F * BW * clamp((CL.LEG - hj.distanceTo(f.ank)) / 0.03, 0, 1), perp: CL.LEG_PERP * BW, r: cop.clone().sub(com) }); who.push(f);
  }
  for (const h of held) { C.push({ arm: true, f0: h.F, u: h.goal.clone().sub(T.sh[h.i]).normalize(), cap: CL.ARM_F * BW, r: h.goal.clone().sub(com) }); who.push(h); }
  const Fs = solveForces(C, Fd, held.length ? 0 : CL.MOM), acc = V(0, -PHY.G, 0), v0 = b.vel.clone(), p0 = b.pos.clone();
  Fs.forEach((f, i) => { acc.addScaledVector(f, 1 / m); who[i].load = f.length() / BW; who[i].F = f; if (!C[i].arm) who[i].ok = f.lengthSq() > 1; });
  b.vel.addScaledVector(acc, dt); if (who.length) b.vel.multiplyScalar(1 - CL.DAMP * dt);
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
  for (const h of lim) h.load += shock * m / dt / BW;
  K.T = torso(b, K);
  // 손: 당겨지는 방향이 턱이 버티는 범위를 벗어나거나 충격이 크면 미끄러진다
  for (const h of held) {
    const pull = K.T.sh[h.i].clone().sub(h.goal).normalize(), down = -pull.y, out = Math.max(0, pull.dot(h.n)), lat = pull.clone().addScaledVector(h.n, -pull.dot(h.n)).setY(0).length();
    const bad = h.load < CL.GRIP_MIN ? '' : down <= 0.05 ? '위로는 당길 수 없음(어깨가 턱보다 위)' : Math.hypot(out, lat) / down > Math.tan(CL.GRIP_ANG) ? '당기는 방향이 턱에서 벗어남' : '';
    h.bad = bad ? h.bad + dt : 0;
    // 잡은 채 몸이 움직여 팔이 제 몸을 지나가야 하는 자세가 되면(접힌 팔이 몸통에 걸림, 손이 등 뒤로 감) 그 손은 놓친다
    const jam = armCheck(S, h.i, K.T.sh[h.i], h.goal); h.jam = jam ? (h.jam || 0) + dt : 0;
    if (h.jam > 0.15) { releaseHand(S, h.i, `${jam} → 놓침`, 'slip'); continue; }
    if (lim.includes(h) && shock > CL.SHOCK_V) releaseHand(S, h.i, `충격이 커서 놓침(${shock.toFixed(1)}m/s)`, 'slip');
    else if (h.bad > CL.SLIP_T) releaseHand(S, h.i, bad, 'slip');
  }
  // 발: 다리가 닿는 범위를 벗어나면 떨어진다(끌려가지 않는다)
  for (const f of planted) {
    if (K.T.hj[f.i].distanceTo(f.ank) > DIM.leg) { liftFoot(S, f.i, '다리가 닿는 범위를 벗어남'); continue; }
    // 잡은 손이 없는데 누르는 힘도 없는 발은 그 자리에 남지 않는다(벽에 붙어 있지 않는다)
    f.idle = !K.hands.some(h => h.st === 'hold') && f.load < 0.02 ? (f.idle || 0) + dt : 0;
    if (f.idle > CL.IDLE_T) liftFoot(S, f.i, '누르는 힘이 없어 떨어짐');
  }
  for (const x of [...K.hands, ...K.feet]) x.loadS = (x.loadS || 0) + ((x.st === 'hold' || x.st === 'plant' ? Math.min(x.load, 3) : 0) - (x.loadS || 0)) * (1 - Math.exp(-12 * dt));
  limbsStep(S, dt);
  // 기준 자리는 실제 자리에서 멀어지지 않는다(버티지 못해 처지면 따라 내려간다)
  const e = K.ref.clone().sub(b.pos); if (e.length() > CL.REF_LAG) K.ref.copy(b.pos).addScaledVector(e.normalize(), CL.REF_LAG);
  // 누르는 방향이 없으면 기준 자리는 실제 자리로 천천히 돌아온다(닿지 못한 목표를 향해 계속 힘을 주고 있지 않게. 그 자리에서 버티는 힘은 그대로다)
  if (!(inp.cx || inp.cy)) K.ref.lerp(b.pos, 1 - Math.exp(-1.5 * dt));
  { const dv = b.vel.distanceTo(v0); if (dv > K.stats.dvMax) { K.stats.dvMax = dv; K.stats.dvAt = K.tick; } }
  // 나가기: 잡은 손이 없고 ① 디딘 발도 없으면 떨어진다 ② 두 발이 모두 몸 아래의 걸을 수 있는 면에 있으면 지상으로
  if (!K.hands.some(h => h.st === 'hold')) {
    // ① 디딘 발이 모두 몸 아래의 같은 면에 있고 그 발이 몸을 받치면 그 면에 선 것으로 지상에 넘긴다 ② 디딘 발이 없으면 떨어진다(이미 바닥에 주저앉은 높이면 그 면에 선 것으로)
    const pl = K.feet.filter(f => f.st === 'plant'), g = pl.length ? groundAt(W, b.pos.x, b.pos.z, pl[0].p.y + 0.01, 0, 0) : groundAt(W, b.pos.x, b.pos.z, b.pos.y + DIM.hipY - 0.2, 0, 0);
    if (pl.length) { if (g.box && pl.every(f => f.box === g.box) && pl.some(f => f.load > 0.2) && b.vel.length() < 0.5) exit(S, true, g); }
    else {
      // 빠르게 내려오는 중이면 "선 것"으로 넘기지 않는다. 지상 쪽이 그 속도로 착지시킨다(착지 동작과 발 디딤이 그쪽에서 일어난다)
      const low = !!g.box && b.pos.y <= g.y + 0.01 && b.vel.y <= 0, slow = b.vel.length() < 0.5;
      if (low && !slow) b.pos.y = g.y + 1e-4;
      exit(S, low && slow, g);
    }
  }
}

// ── 자세: 몸통의 틀 + 손발 IK(잡은 자리·디딘 자리는 그대로, 어깨·고관절에서 풀어 맞춘다) ──
function poseArm(S, s, sh, target, yaw, sx, grip) {
  const B = S.rig.bones, { ik, pole } = armIK(S.world, sh, target, yaw, sx), hint = pole.clone().negate();
  aimBone(B[`upperArm.${s}`], ik.mid.clone().sub(sh), hint, 'down'); aimBone(B[`foreArm.${s}`], ik.end.clone().sub(ik.mid), hint, 'down');
  aimBone(B[`hand.${s}`], grip ? grip.clone().sub(ik.end) : ik.end.clone().sub(ik.mid), hint, 'down');
  return ik;
}
export function poseClimb(S) {
  const K = S.climb, b = S.body, B = S.rig.bones, T = K.T || torso(b, K), root = S.rig.root;
  root.position.set(b.pos.x, 0, b.pos.z); root.rotation.set(0, 0, 0); root.updateMatrixWorld(true);
  B.hips.position.set(0, T.hip.y, 0); B.hips.quaternion.copy(T.tq.hips);
  for (const n of TORSO.slice(1)) B[n].quaternion.copy(T.tq[n]);
  B.hips.updateMatrixWorld(true);
  for (const H of K.hands) { const sx = H.i ? -1 : 1, tgt = H.st === 'hold' ? H.goal : H.st === 'reach' ? H.w : (H.rel.lerp(V(sx * 0.08, -0.5, 0.1).applyAxisAngle(UP, b.yaw), 0.05), H.w.copy(T.sh[H.i]).add(H.rel)); poseArm(S, H.s, T.sh[H.i], tgt, b.yaw, sx, H.st === 'hold' ? H.grip : null); }
  for (const F of K.feet) {
    const hj = T.hj[F.i], tgt = F.st === 'plant' ? F.ank : F.a, { ik, pole } = legIK(S, hj, tgt, b.yaw, F.i ? -1 : 1);
    aimBone(B[`upLeg.${F.s}`], ik.mid.clone().sub(hj), pole, 'down'); aimBone(B[`leg.${F.s}`], ik.end.clone().sub(ik.mid), pole, 'down');
    setWorldQuat(B[`foot.${F.s}`], F.st === 'free' ? Q().setFromAxisAngle(UP, b.yaw).multiply(Q().setFromAxisAngle(X, 0.35 * clamp((F.clear ?? 9) / 0.15, 0, 1))) : F.q); B[`toe.${F.s}`].quaternion.identity();
  }
}
// 지상 문맥에서 손을 보내는 중: 지상 자세 위에 그 팔만 IK로 덮는다. 거부된 뒤에는 천천히 지상 자세로 돌아간다
export function groundHands(S, dt) {
  const K = S.climb, B = S.rig.bones, yaw = S.body.yaw;
  limbsStep(S, dt);
  for (const H of K.hands) {
    if (H.st === 'free') { H.ov = Math.max(0, H.ov - dt / CL.BLEND_T); if (H.ov <= 0) continue; }
    const sh = worldPos(B[`upperArm.${H.s}`]), names = [`upperArm.${H.s}`, `foreArm.${H.s}`, `hand.${H.s}`], q0 = names.map(n => B[n].quaternion.clone());
    poseArm(S, H.s, sh, H.st === 'free' ? sh.clone().add(H.rel) : H.st === 'hold' ? H.goal : H.w, yaw, H.i ? -1 : 1, H.st === 'hold' ? H.grip : null);
    if (H.st === 'free') names.forEach((n, k) => { B[n].quaternion.copy(q0[k].slerp(B[n].quaternion, mj(H.ov))); B[n].updateMatrixWorld(true); });
  }
}
// 벽에서 나온 뒤: 나오던 순간의 자세에서 지상 자세로 짧게 이어 준다
export function outBlend(S, dt) {
  const K = S.climb, O = K.out, B = S.rig.bones; if (!O) return;
  if (!O.rel) O.rel = O.hipW.clone().sub(S.body.pos);
  O.t += dt; const k = mj(clamp(O.t / CL.BLEND_T, 0, 1)), hipG = worldPos(B.hips).sub(S.body.pos), hip = O.rel.clone().lerp(hipG, k).add(S.body.pos);
  B.hips.position.set(hip.x - S.rig.root.position.x, hip.y, hip.z - S.rig.root.position.z);
  S.rig.list.forEach((x, i) => { x.quaternion.copy(O.q[i].clone().slerp(x.quaternion, k)); });
  B.hips.updateMatrixWorld(true);
  if (O.t >= CL.BLEND_T) K.out = null;
}
// 자세가 확정된 뒤: 놓여 있는 손발의 지금 자리를 적어 두고(다음 명령의 출발점), 접촉 오차와 관통을 잰다
export function afterPose(S) {
  const K = S.climb, B = S.rig.bones, st = K.stats;
  for (const H of K.hands) { const w = worldPos(B[`hand.${H.s}`]); if (H.st === 'hold') st.palmErr = Math.max(st.palmErr, B[`hand.${H.s}`].localToWorld(V(0, -CL.PALM, 0)).distanceTo(H.grip)); else if (H.st === 'free' && !K.on) H.w.copy(w); }
  for (const F of K.feet) { if (F.st === 'plant') st.footErr = Math.max(st.footErr, worldPos(B[`toe.${F.s}`]).distanceTo(F.ball)); else if (!K.on) F.a.copy(worldPos(B[`foot.${F.s}`])); }
  for (const H of K.hands) if (H.st === 'hold') { const sh = worldPos(B[`upperArm.${H.s}`]), c = armCheck(S, H.i, sh, H.goal); if (c && c !== '어깨가 돌아가지 않는 방향(등 뒤)') { st.selfPen++; st.penWhat = `${c} @${K.tick}`; } }
  if (K.on) for (const n of ['hand.L', 'hand.R', 'foreArm.L', 'foreArm.R', 'leg.L', 'leg.R', 'foot.L', 'foot.R', 'toe.L', 'toe.R', 'chest', 'head', 'hips']) { const p = worldPos(B[n]), x = S.world.boxes.find(x => p.x > x.min.x + 0.01 && p.x < x.max.x - 0.01 && p.y > x.min.y + 0.01 && p.y < x.max.y - 0.01 && p.z > x.min.z + 0.01 && p.z < x.max.z - 0.01); if (x) { if (K.tick === K.enterTick) { st.penEnter = (st.penEnter || 0) + 1; st.penEnterWhat = `${n} → ${x.name}`; } else { st.pen++; st.penWhat = `${n} → ${x.name} @${K.tick}`; } } }
}
export const limbState = K => ({
  on: K.on,
  hands: K.hands.map(h => ({ s: h.s, st: h.st, load: h.load, loadS: h.loadS || 0, why: h.why, grip: h.st === 'free' ? null : h.grip.toArray(), w: h.w.toArray(), box: h.st !== 'free' && h.edge ? h.edge.box.name : '' })),
  feet: K.feet.map(f => ({ s: f.s, st: f.st, load: f.load, loadS: f.loadS || 0, ok: f.ok, kind: f.kind, auto: f.auto, why: f.why, p: f.st === 'free' ? null : f.p.toArray(), box: f.st !== 'free' && f.box ? f.box.name : '' })),
});
