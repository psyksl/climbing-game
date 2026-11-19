// 캡처 동작(외부 자료를 이 뼈대로 옮긴 값, tools/mixamo_convert.mjs)으로 지상 이동 자세를 만든다. 자작 모션(motion.js)과 바꿔 가며 비교할 수 있다.
// - 애니메이션은 몸을 옮기지 않는다: 몸의 자리는 controller.js가 정하고, 걸음 위상은 실제 간 거리 / 보폭으로만 나아간다(자작 모션과 같은 규칙).
// - 서 있기·걷기·달리기를 속도에 따라 섞는다(걷기와 달리기는 "왼발이 닿는 순간 = 위상 0"으로 맞춰 둔 값).
// - 디딘 발: 변환할 때 정해 둔 "닿음" 구간에서 발의 한 점을 세계 좌표에 고정하고(축 = 뒤꿈치 → 발볼), 다리는 두 마디 IK로 맞춘다. 발을 뗀 뒤에는 고정 자리에서 캡처 자리로 부드럽게 돌아간다.
//   앞쪽 축은 발끝이 아니라 발볼(DIM.ballZ)이다: 사람 발은 발볼에서 굽고, 캡처 동작도 뒤꿈치를 들 때 발볼이 땅에 남는다(발가락 뼈가 따로 돈다).
// - 웅크림·모으기·밀기·공중·착지는 자작 모션이 맡고, 사이는 짧게 섞는다(C.w: 0 = 자작, 1 = 캡처). 넘겨줄 때 두 쪽의 디딘 자리를 맞춘다.
// - 모든 상태는 고정 계산 걸음(sim.step)에서만 바뀐다. 그리기는 읽기만 한다.
import * as THREE from 'three';
import { DIM } from './rig.js';
import { aimBone, setWorldQuat, worldPos, twoBone } from './ik.js';
import { groundY } from './motion.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp, smooth = t => t * t * (3 - 2 * t);
const UP = V(0, 1, 0), DOWN = V(0, -1, 0), SOLE = 0.02, LOCAL = { toe: V(0, -(DIM.ankleY - SOLE), DIM.ballZ), heel: V(0, -(DIM.ankleY - SOLE), DIM.heelZ) };
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
export const CLIP = {
  LIFT: 0.015, AWAY: 0.035,  // 일찍 떼기: 캡처 자세에서 축이 되는 점이 이만큼(m) 들리거나 고정 자리에서 이만큼 멀어지면
  CON_LOC: 0.3,             // 걷기 동작이 이만큼 섞이기 전에는 두 발 모두 디딘 것으로 본다(서 있기)
  KIND: 0.012,              // 축 바꿈(뒤꿈치 ↔ 발끝): 다른 점이 이만큼 더 낮아야 한다
  IN: 9, OUT: 14,           // 자작 → 캡처, 캡처 → 자작으로 섞이는 빠르기(1/초)
  LAND_WAIT: 0.35,          // 착지 뒤 이 시간은 자작 모션(무릎으로 받기)에 맡긴다
  LOC_V: 0.8,               // 이 속도에서 걷기 동작이 다 섞인다(그 아래는 서 있기와 섞여 보폭이 줄어든다)
  RESTEP_D: 0.18, RESTEP_T: 0.24, RESTEP_LIFT: 0.05, // 고정한 발이 캡처 자리에서 이만큼(m) 벗어나면 들어서 고쳐 디딘다
  YAW_MAX: 0.6,             // 고정한 발의 방향이 몸과 이만큼(rad) 넘게 벌어지면 디딘 점을 축으로 발을 돌린다(제자리 돌기 = 발볼로 돈다. 디딘 점은 그대로)
  REACH: 0.99, DROP_MAX: 0.06, // 다리가 닿지 않으면 엉덩이를 이만큼까지 낮추고, 그래도 닿지 않으면 그 발을 고쳐 디딘다
  SETTLE: 60, SETTLED: 3e-4,    // 닿는 순간 발이 땅에 내려앉는 빠르기(1/초)와 다 내려앉았다고 보는 거리(m)
};

export function makeClipSet(data) {
  const set = { names: data.bones, clips: {} };
  for (const [k, c] of Object.entries(data.clips)) set.clips[k] = { ...c, nb: data.bones.length, hip: Float32Array.from(c.hip), q: Float32Array.from(c.q) };
  const need = ['idle', 'walk', 'run'].filter(k => !set.clips[k]); if (need.length) throw new Error('동작 없음: ' + need.join(', '));
  { const cR = set.clips.walk.con[1], n = cR.length; let a = 0; while (a < n && !(cR[a] === '1' && cR[(a + n - 1) % n] === '0')) a++; let len = 0; while (len < n && cR[(a + len) % n] === '1') len++; set.startPhase = ((a + len * 0.5) / n) % 1; } // 출발 = 오른발이 몸 바로 아래에서 버티고 왼발을 막 든 때(서 있던 두 발 자리와 가장 가깝다)
  return set;
}
const newSnap = rig => ({ hip: V(), q: rig.list.map(() => new THREE.Quaternion()), ank: [V(), V()], footQ: [new THREE.Quaternion(), new THREE.Quaternion()], pole: [V(), V()], legQ: [[new THREE.Quaternion(), new THREE.Quaternion()], [new THREE.Quaternion(), new THREE.Quaternion()]] });
const copySnap = (a, b) => { b.hip.copy(a.hip); a.q.forEach((q, i) => b.q[i].copy(q)); for (let i = 0; i < 2; i++) { b.ank[i].copy(a.ank[i]); b.footQ[i].copy(a.footQ[i]); b.pole[i].copy(a.pole[i]); b.legQ[i][0].copy(a.legQ[i][0]); b.legQ[i][1].copy(a.legQ[i][1]); } };
const newPose = n => ({ hip: V(), q: Array.from({ length: n }, () => new THREE.Quaternion()) });
function sample(c, u, out) {
  const x = ((u % 1) + 1) % 1 * c.n, f0 = Math.floor(x) % c.n, f1 = (f0 + 1) % c.n, t = x - Math.floor(x), nb = c.nb, H = c.hip, Q = c.q;
  out.hip.set(lerp(H[f0 * 3], H[f1 * 3], t), lerp(H[f0 * 3 + 1], H[f1 * 3 + 1], t), lerp(H[f0 * 3 + 2], H[f1 * 3 + 2], t));
  for (let i = 0; i < nb; i++) { const a = (f0 * nb + i) * 4, b = (f1 * nb + i) * 4, s = Q[a] * Q[b] + Q[a + 1] * Q[b + 1] + Q[a + 2] * Q[b + 2] + Q[a + 3] * Q[b + 3] < 0 ? -1 : 1;
    out.q[i].set(lerp(Q[a], s * Q[b], t), lerp(Q[a + 1], s * Q[b + 1], t), lerp(Q[a + 2], s * Q[b + 2], t), lerp(Q[a + 3], s * Q[b + 3], t)).normalize(); }
}
const conAt = (c, u, i) => c.con[i][Math.floor(((u % 1) + 1) % 1 * c.n) % c.n] === '1'; // 그 위상에서 발이 닿아 있는지(변환할 때 원본의 높이·빠르기로 정해 둔 값)
function mix(a, b, w, out) { out.hip.lerpVectors(a.hip, b.hip, w); for (let i = 0; i < a.q.length; i++) out.q[i].slerpQuaternions(a.q[i], b.q[i], w); }

export function makeClipState(set, rig, body) {
  const n = set.names.length;
  return { set, rig, drop: 0, w: 0, on: false, init: false, phase: 0, idleT: 0, wLoc: 0, r: 0, gy: body.pos.y, groundT: 9, lastSpeed: 0, A: newPose(n), Bp: newPose(n), Cp: newPose(n),
    G: Object.assign(newSnap(rig), { kind: [null, null] }), // G = 자작에게 넘겨준 순간의 최종 자세(얼려 둔 것)
    P0: newSnap(rig), F: newSnap(rig), // P0 = 이번 걸음의 자작 자세, F = 넘겨받은 순간의 자작 자세(얼려 둔 것)
    feet: ['L', 'R'].map(s => ({ s, con: false, skip: false, kind: 'toe', lock: null, off: V(), yawOff: 0, gOff: 0, step: null, last: null, lastQ: new THREE.Quaternion() })) };
}

// 상태 진행(고정 걸음마다, stepMotion 뒤): 누가 맡는지(C.w), 걸음 위상, 섞는 몫
export function stepClip(C, M, body, input, dt, enabled) {
  const W = C.set.clips, speed = Math.hypot(body.vel.x, body.vel.z);
  C.groundT = body.onGround ? C.groundT + dt : 0;
  const tgt = enabled && body.onGround && !input.crouch && !body.charging && !body.push && C.groundT > CLIP.LAND_WAIT ? 1 : 0;
  if (tgt && !C.on) C.init = true; // 넘겨받는 순간: 발 고정을 자작 모션이 디딘 자리에서 시작한다
  if (!tgt && C.on) { // 넘겨주는 순간: 뼈대에 남아 있는 바로 앞 걸음의 최종 자세를 얼려 둔다. 섞는 동안 캡처 쪽은 더 나아가지 않는다(나아가면 자작이 디딘 발을 캡처의 뗀 발이 끌고 간다)
    const G = C.G, B = C.rig.bones; G.hip.copy(B.hips.position); C.rig.list.forEach((b, i) => G.q[i].copy(b.quaternion));
    C.feet.forEach((f, i) => { G.ank[i].copy(f.last || M.legs[i].ankleT); G.footQ[i].copy(f.lastQ); G.pole[i].copy(f.lastPole || M.legs[i].pole); B[`upLeg.${f.s}`].getWorldQuaternion(G.legQ[i][0]); B[`leg.${f.s}`].getWorldQuaternion(G.legQ[i][1]); G.kind[i] = f.lock && !f.step ? f.kind : null; f.lock = null; f.step = null; f.skip = false; f.off.set(0, 0, 0); });
  }
  C.on = !!tgt;
  C.w += (tgt - C.w) * (1 - Math.exp(-(tgt ? CLIP.IN : CLIP.OUT) * dt)); if (Math.abs(tgt - C.w) < 1e-3) C.w = tgt;
  const gs = body.onGround ? speed : C.lastSpeed;
  C.wLoc += (clamp(gs / CLIP.LOC_V, 0, 1) - C.wLoc) * (1 - Math.exp(-10 * dt));
  C.r += (clamp((gs - W.walk.speed) / (W.run.speed - W.walk.speed), 0, 1) - C.r) * (1 - Math.exp(-8 * dt));
  if (gs > 0.1 && C.lastSpeed <= 0.1 && C.wLoc < 0.2) C.phase = C.set.startPhase;
  C.stride = lerp(W.walk.stride, W.run.stride, C.r) * Math.max(0.25, C.wLoc);
  if (body.onGround && gs > 0.02) C.phase = (C.phase + gs * dt / C.stride) % 1;
  C.idleT += dt; C.lastSpeed = gs;
  C.gy = body.onGround ? C.gy + (body.pos.y - C.gy) * (1 - Math.exp(-12 * dt)) : body.pos.y; // 계단: 기준 땅 높이는 부드럽게 따라간다
}

const qYaw = new THREE.Quaternion(), qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), qT = new THREE.Quaternion(), LEGS = ['upLeg.L', 'leg.L', 'foot.L', 'upLeg.R', 'leg.R', 'foot.R'];
// 자세 확정(고정 걸음마다, 자작 자세를 푼 뒤): 뼈대에는 자작 자세가 들어 있다 → C.w만큼 캡처 자세로 바꾼다
export function poseClip(C, M, body, world, groundAt, dt) {
  const rig = C.rig, B = rig.bones, names = C.set.names, W = C.set.clips, w = C.w, P0 = C.P0;
  if (w <= 0) { for (const f of C.feet) { f.lock = null; f.con = false; f.last = null; f.step = null; f.off.set(0, 0, 0); } for (const L of M.legs) L.cd = null; return; }
  if (w < 1 || C.init) { P0.hip.copy(B.hips.position); rig.list.forEach((b, i) => P0.q[i].copy(b.quaternion)); M.legs.forEach((L, i) => { P0.ank[i].copy(L.ankleT); B[`foot.${L.s}`].getWorldQuaternion(P0.footQ[i]); P0.pole[i].copy(L.pole); B[`upLeg.${L.s}`].getWorldQuaternion(P0.legQ[i][0]); B[`leg.${L.s}`].getWorldQuaternion(P0.legQ[i][1]); }); }
  if (C.init) copySnap(P0, C.F);
  if (!C.on) { // 자작이 넘겨받는 중: 얼려 둔 캡처 쪽 최종 자세(G)에서 이번 걸음의 자작 자세(P0)로. 디딘 발은 축이 되는 점(넘겨줄 때 두 쪽이 같은 자리로 맞춰 둔 점)을 기준으로 섞어 그 점이 움직이지 않는다
    const G = C.G; B.hips.position.lerpVectors(P0.hip, G.hip, w); rig.list.forEach((b, i) => { if (!LEGS.includes(b.name)) b.quaternion.slerpQuaternions(P0.q[i], G.q[i], w); }); rig.root.updateMatrixWorld(true);
    M.legs.forEach((L, i) => { const hipJ = worldPos(B[`upLeg.${L.s}`]), fq = new THREE.Quaternion().slerpQuaternions(P0.footQ[i], G.footQ[i], w), k = G.kind[i];
      const ank = k ? LOCAL[k].clone().applyQuaternion(P0.footQ[i]).add(P0.ank[i]).lerp(LOCAL[k].clone().applyQuaternion(G.footQ[i]).add(G.ank[i]), w).sub(LOCAL[k].clone().applyQuaternion(fq)) : P0.ank[i].clone().lerp(G.ank[i], w);
      const pole = P0.pole[i].clone().lerp(G.pole[i], w).normalize(), ik = twoBone(hipJ, ank, DIM.thigh, DIM.shin, pole), dirs = [ik.mid.clone().sub(hipJ).normalize(), ik.end.clone().sub(ik.mid).normalize()];
      [`upLeg.${L.s}`, `leg.${L.s}`].forEach((bn, j) => { const base = new THREE.Quaternion().slerpQuaternions(P0.legQ[i][j], G.legQ[i][j], w), cur = DOWN.clone().applyQuaternion(base); setWorldQuat(B[bn], qT.setFromUnitVectors(cur, dirs[j]).clone().multiply(base)); });
      setWorldQuat(B[`foot.${L.s}`], fq); L.ik = ik; L.cd = null; });
    return;
  }
  // 캡처가 맡거나 넘겨받는 중: 섞는 상대 = 넘겨받은 순간에 얼려 둔 자작 자세(그 뒤의 자작 다리 상태는 캡처 쪽 발에 맞춰 덮어쓰므로 자세로 쓰지 않는다)
  const S0 = C.F;
  // 섞은 캡처 자세
  const A = C.A; sample(W.idle, C.idleT / W.idle.dur, A);
  if (C.wLoc > 1e-3) { sample(W.walk, C.phase, C.Bp); if (C.r > 1e-3) { sample(W.run, C.phase, C.Cp); mix(C.Bp, C.Cp, C.r, C.Bp); } mix(A, C.Bp, C.wLoc, A); }
  qYaw.setFromAxisAngle(UP, body.yaw);
  const hl = A.hip.clone().applyQuaternion(qYaw), hipClip = V(hl.x, C.gy + A.hip.y, hl.z); // 뿌리(rig.root)는 몸 자리의 땅에 있다
  B.hips.position.copy(hipClip); names.forEach((n, i) => B[n].quaternion.copy(A.q[i])); B.hips.quaternion.premultiply(qYaw); rig.root.updateMatrixWorld(true);
  // 발: 닿음 판정 → 고정 → 발목 목표
  const tg = C.feet.map((f, i) => {
    const L = M.legs[i], F = B[`foot.${f.s}`], ankC = worldPos(F), fq = F.getWorldQuaternion(new THREE.Quaternion()), hipJ = worldPos(B[`upLeg.${f.s}`]), kneeC = worldPos(B[`leg.${f.s}`]);
    const legQ = [B[`upLeg.${f.s}`].getWorldQuaternion(new THREE.Quaternion()), B[`leg.${f.s}`].getWorldQuaternion(new THREE.Quaternion())]; // 캡처 자세의 다리 뼈 회전(비틀림의 기준)
    const pt = k => LOCAL[k].clone().applyQuaternion(fq).add(ankC), hT = pt('toe').y - SOLE - C.gy, hH = pt('heel').y - SOLE - C.gy;
    // 닿음: 걷기 동작이 충분히 섞이기 전에는 서 있는 것(두 발 디딤). 그 뒤로는 걷기나 달리기 한쪽이 거의 다일 때 그쪽 값, 둘을 섞는 동안(빨라지거나 느려지는 중)에는 둘 다 닿아 있을 때만
    // (한쪽 값만 쓰면 섞은 자세에서는 이미 뗀 발을 계속 고정해 다리가 끌려간다)
    const con = C.wLoc < CLIP.CON_LOC ? true : C.r < 0.15 ? conAt(W.walk, C.phase, i) : C.r > 0.85 ? conAt(W.run, C.phase, i) : conAt(W.walk, C.phase, i) && conAt(W.run, C.phase, i), gAt = (x, z) => groundY(world, groundAt, x, z, body.pos.y);
    let changed = false;
    // 일찍 떼기: 변환할 때 정한 닿음 구간은 장면(1/30초) 단위라, 달릴 때는 한 장면 늦게 떼면 몸이 14cm 더 가서 다리가 끌려간다.
    // 캡처 자세에서 축이 되는 점이 이미 땅에서 들렸거나(LIFT) 고정 자리에서 멀어졌으면(AWAY) 그 걸음에 바로 뗀다(다음에 다시 닿을 때까지 고정하지 않는다)
    if (f.lock && !f.step && !C.init && C.wLoc >= CLIP.CON_LOC) { const pc = pt(f.kind); if (pc.y - SOLE - C.gy > CLIP.LIFT || Math.hypot(pc.x - f.lock.p.x, pc.z - f.lock.p.z) > CLIP.AWAY) { f.yawOff = wrap(f.lock.yaw0 - body.yaw); f.lock = null; f.skip = true; changed = true; } }
    if (C.init) { // 자작 모션에게서 넘겨받음: 그 발이 지금 딛고 있는 발끝 자리에 고정
      const p = LOCAL.toe.clone().applyQuaternion(P0.footQ[i]).add(P0.ank[i]); p.y = gAt(p.x, p.z);
      f.kind = 'toe'; f.lock = { p, yaw0: L.plantYaw ?? body.yaw }; f.con = true; f.step = null; f.yawOff = 0; f.last = P0.ank[i].clone(); f.lastQ.copy(P0.footQ[i]); changed = true;
    } else if (f.step) { // 고쳐 디디는 중: 캡처 자리로 옮겨 간다
      f.step.t += dt; if (f.step.t >= CLIP.RESTEP_T) { f.step = null; f.con = false; }
    } else if (con && !f.lock && !f.skip) { // 닿기 시작: 낮은 쪽 점을 축으로
      f.kind = hH < hT ? 'heel' : 'toe'; const p = pt(f.kind); p.y = gAt(p.x, p.z); f.lock = { p, yaw0: body.yaw + f.yawOff }; changed = true;
    } else if (!con && f.lock) { f.yawOff = wrap(f.lock.yaw0 - body.yaw); f.lock = null; changed = true; }
    else if (f.lock) { // 축 바꿈: 새 축의 자리는 바로 앞 걸음의 실제 자세에서 잡는다(발이 평평할 때 바뀌므로 그 점은 이미 땅에 있다)
      const other = f.kind === 'heel' ? 'toe' : 'heel', hk = f.kind === 'heel' ? hH : hT, ho = f.kind === 'heel' ? hT : hH;
      if (ho < hk - CLIP.KIND && f.last) { const p = LOCAL[other].clone().applyQuaternion(f.lastQ).add(f.last); p.y = gAt(p.x, p.z); f.lock.p.copy(p); f.kind = other; changed = true; }
    }
    if (!f.step) f.con = con || C.init; if (!con || C.wLoc < CLIP.CON_LOC) f.skip = false; // 서 있을 때는 일찍 뗀 발도 다시 고정한다
    if (f.lock) { const d = wrap(f.lock.yaw0 - body.yaw); if (Math.abs(d) > CLIP.YAW_MAX) f.lock.yaw0 = body.yaw + Math.sign(d) * CLIP.YAW_MAX; }
    let dy = f.lock ? wrap(f.lock.yaw0 - body.yaw) : f.yawOff;
    // 고쳐 디디기: 고정 자리가 캡처 자리에서 너무 멀거나 발 방향이 몸과 많이 다르면(다른 발이 디딘 동안) 한 발을 들어 옮긴다
    const fqOf = d => { const q = qA.setFromAxisAngle(UP, d).clone().multiply(fq); return w < 1 ? qB.slerpQuaternions(S0.footQ[i], q, w).clone() : q; }; // 발 회전(세계): 섞는 동안에는 상대 자세의 발 회전과 섞은 값. 발목 목표를 이 회전으로 구하므로 디딘 점은 섞는 동안에도 그대로다
    const fqF = fqOf(dy);
    let T = f.lock ? f.lock.p.clone().add(V(0, SOLE, 0)).sub(LOCAL[f.kind].clone().applyQuaternion(fqF)) : null;
    const o = C.feet[1 - i];
    const far = f.lock && T.distanceTo(hipJ) > DIM.leg * CLIP.REACH + CLIP.DROP_MAX * 0.6; // 엉덩이를 낮춰도 닿지 않는 자리
    if (f.lock && !f.step && (far || Math.hypot(T.x - ankC.x, T.z - ankC.z) > CLIP.RESTEP_D)) {
      if (o.lock && !o.step) { f.step = { t: 0, off0: (f.last || T).clone().sub(ankC), yaw0: dy }; f.lock = null; f.off.set(0, 0, 0); T = null; changed = false; } // 다른 발이 디딘 동안: 들어서 옮긴다
      else if (far) { f.yawOff = dy; f.lock = null; f.skip = true; T = null; changed = true; } // 다른 발이 떠 있는데 닿지 않음: 고정을 풀고 캡처 자리로 돌아간다(다시 닿을 때까지 고정하지 않는다)
    }
    if (!f.lock) {
      f.gOff += (gAt(ankC.x, ankC.z) - C.gy - f.gOff) * (1 - Math.exp(-15 * dt));
      T = ankC.clone(); T.y += f.gOff;
      if (!f.step) f.yawOff *= Math.exp(-12 * dt);
    }
    if (f.step) { const u = clamp(f.step.t / CLIP.RESTEP_T, 0, 1), e = 1 - smooth(u); T.addScaledVector(f.step.off0, e); T.y += CLIP.RESTEP_LIFT * Math.sin(Math.PI * u); f.yawOff = f.step.yaw0 * e; dy = f.yawOff; }
    else if (changed && f.last) f.off.copy(f.last).sub(T); // 고정·뗌·축 바꿈의 순간: 바로 앞 자리에서 이어서
    const fin = T.clone().add(f.off);
    if (!f.lock) { // 떠 있는 발: 다리가 다 펴지는 거리에 가까워지면 목표를 부드럽게 당긴다(다 편 다리는 발목이 조금만 움직여도 무릎 각도가 크게 바뀐다). 디딘 발은 당기지 않는다(엉덩이를 낮춰 맞춘다). 고쳐 디디려고 든 발은 0.08초에 걸쳐 들어온다(드는 순간 무릎이 튀지 않게)
      const v = fin.clone().sub(hipJ), d = v.length(), a0 = DIM.leg * 0.95, span = DIM.leg * (CLIP.REACH - 0.95); if (d > a0) fin.lerp(hipJ.clone().addScaledVector(v, (a0 + span * (1 - Math.exp(-(d - a0) / span))) / d), f.step ? smooth(clamp(f.step.t / 0.08, 0, 1)) : 1); }
    f.off.multiplyScalar(Math.exp(-(f.lock ? CLIP.SETTLE : 16) * dt)); if (f.off.lengthSq() < 1e-10) f.off.set(0, 0, 0);
    const fqFin = fqOf(dy);
    f.last = fin.clone(); f.lastQ.copy(fqFin);
    return { fin, fq: fqFin, legQ, pole: kneeC.sub(hipJ).normalize().applyAxisAngle(UP, dy).addScaledVector(V(0, 0, 1).applyQuaternion(fqFin), 0.08).normalize(), dy }; // 무릎은 발이 향한 쪽을 따른다(몸이 돌아도 고정한 발 위에서 다리가 꼬이지 않게)
  });
  C.init = false;
  M.phase = C.phase; M.visPhase = C.phase; // 걸음 위상의 약속이 같다(0 = 왼발이 닿는 순간) → 자작 모션이 넘겨받을 때 같은 걸음에서 이어진다
  // 다리가 닿지 않으면 엉덩이를 낮춘다
  // 엉덩이를 딱 필요한 만큼 낮춘다(발목 목표가 다리 길이의 REACH 안에 들어오게). 한 번에 낮추지 않고, 되돌릴 때는 더 천천히(발을 뗀 직후 엉덩이가 튀지 않게)
  let need = 0; C.feet.forEach((f, i) => { const v = tg[i].fin.clone().sub(worldPos(B[`upLeg.${f.s}`])), R = DIM.leg * CLIP.REACH, h2 = v.x * v.x + v.z * v.z; if (v.lengthSq() > R * R) need = Math.max(need, h2 >= R * R ? CLIP.DROP_MAX : -v.y - Math.sqrt(R * R - h2)); });
  need = clamp(need, 0, CLIP.DROP_MAX); C.drop = need > C.drop ? Math.min(need, C.drop + 0.6 * dt) : C.drop + (need - C.drop) * (1 - Math.exp(-20 * dt)); hipClip.y -= C.drop; // 낮추는 빠르기는 0.6m/s까지(한 걸음 5mm)
  // 마무리: 자작 자세와 섞고(넘겨받는 동안), 다리는 섞은 발목 목표로 IK
  if (w < 1) { B.hips.position.lerpVectors(S0.hip, hipClip, w); rig.list.forEach((b, i) => { if (!LEGS.includes(b.name)) { qT.copy(b.quaternion); b.quaternion.slerpQuaternions(S0.q[i], qT, w); } }); } // slerpQuaternions는 결과를 쓰기 전에 첫 값을 복사하므로 자기 자신을 둘째 값으로 주면 안 된다
  else B.hips.position.copy(hipClip);
  rig.root.updateMatrixWorld(true);
  C.feet.forEach((f, i) => {
    const L = M.legs[i], t = tg[i], hipJ = worldPos(B[`upLeg.${f.s}`]);
    // 발목 목표 = 캡처 쪽 값 그대로(넘겨받은 순간의 발목 자리에서 이어지게 해 둔 값)
    const ank = t.fin, fq = t.fq, pole = w < 1 ? S0.pole[i].clone().lerp(t.pole, w).normalize() : t.pole; f.lastPole = t.pole;
    const ik = twoBone(hipJ, ank, DIM.thigh, DIM.shin, pole);
    // 뼈의 비틀림은 캡처 자세의 것을 그대로 쓴다: 캡처(넘겨받는 동안은 자작과 섞은) 다리 뼈 회전을, 뼈가 IK가 정한 방향을 보도록 가장 적게 돌린다.
    // (무릎 방향이나 다리 평면으로 비틀림을 새로 정하면 다리가 거의 펴지는 순간 기준이 사라져 180° 가까이 뒤집힌다)
    const yawFix = qA.setFromAxisAngle(UP, t.dy), dirs = [ik.mid.clone().sub(hipJ).normalize(), ik.end.clone().sub(ik.mid).normalize()];
    [`upLeg.${f.s}`, `leg.${f.s}`].forEach((bn, j) => { const base = yawFix.clone().multiply(t.legQ[j]); if (w < 1) base.copy(qT.slerpQuaternions(S0.legQ[i][j], base, w));
      const cur = DOWN.clone().applyQuaternion(base); setWorldQuat(B[bn], qT.setFromUnitVectors(cur, dirs[j]).clone().multiply(base)); });
    setWorldQuat(B[`foot.${f.s}`], fq);
    L.ik = ik;
    { // 캡처가 맡는 동안: 측정용 설명과, 자작 모션이 넘겨받을 때 쓸 디딘 자리를 맞춰 둔다
      // 발이 실제로 향한 쪽(발끝이 벌어진 만큼 포함)과 디딘 점에서 자작 모션의 디딘 자리를 거꾸로 구한다 → 넘겨받아도 디딘 점이 그대로다
      const ff = V(1, 0, 0).applyQuaternion(fq).cross(UP), yaw = Math.atan2(ff.x, ff.z), // 발의 옆 축 × 위 = 발이 향한 쪽(달릴 때 발을 뒤로 차 올려 90° 넘게 숙여져도 뒤집히지 않는다)
        g = groundY(world, groundAt, ank.x, ank.z, body.pos.y), dir = V(Math.sin(yaw), 0, Math.cos(yaw));
      L.cd = { plant: !!f.lock && f.off.lengthSq() < CLIP.SETTLED * CLIP.SETTLED, kind: f.kind, yaw, ground: f.lock ? f.lock.p.y : g, toeZ: DIM.ballZ };
      L.plantYaw = L.yaw = L.fromYaw = yaw; L.since = 1; L.heel = 0; L.pitch = 0; L.pivotBehind = undefined; L.over = false; L.overAmt = 0; L.ankleT = ank.clone(); L.gait = false; L.hurry = false; L.remCap = undefined; L.preBehind = undefined;
      if (f.lock && !f.step) { const pv = LOCAL[f.kind].clone().applyQuaternion(fq).add(ank); L.mode = 'plant'; L.plant.set(pv.x, f.lock.p.y, pv.z).addScaledVector(dir, -(f.kind === 'toe' ? DIM.ballZ : DIM.heelZ)); L.foot.copy(L.plant); L.q = 1; }
      else { L.mode = 'swing'; L.from.set(ank.x, ank.y - DIM.ankleY, ank.z); L.foot.copy(L.from); L.plant.set(ank.x, g, ank.z); L.q = 0; L.t = 0; L.dur = 0.2; L.fromPitch = 0; L.liftOff = V(); L.fromBody = body.pos.clone(); } // 떠 있는 발: 자작 모션이 넘겨받으면 그 자리에서 이어서 내린다
    }
  });
}
