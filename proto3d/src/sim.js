// 고정 간격(1/120초) 계산 한 걸음: 이동(controller) → 상태(motion, clipmotion) → 자세·접촉 확정(poseProc → poseClip) → 측정.
// 실제 실행 루프와 시험 도구가 모두 이 step()만 부른다(W1.1, GPT 검토: 그리기 빈도에 따라 결과가 달라지던 문제).
// 다음 계산이 읽는 값(IK 결과, 발목 자리, 발끝/뒤꿈치 축, 다리가 닿는지, 엉덩이 높이)은 모두 여기서 정해진다.
// 그리기는 이렇게 확정된 뼈 자세를 보여 주기만 하고, 계산 상태를 바꾸지 않는다.
import * as THREE from 'three';
import { groundAt } from './world.js';
import { makeBody, stepBody, PHY } from './controller.js';
import { makeMotion, stepMotion, poseProc, measure } from './motion.js';
import { makeClipSet, makeClipState, stepClip, poseClip } from './clipmotion.js';
import { makeClimb, command, stepClimb, poseClimb, groundHands, outBlend, afterPose, torsoClear } from './climb.js';
import { DIM } from './rig.js';

// clips = 캡처 동작 자료(없으면 null → 자작 모션만). S.useClip으로 두 모션을 바꾼다(자료가 있을 때만).
// 벽 문맥(W2): 손이 턱을 잡으면 S.climb.on. 그동안은 지상 이동 대신 climb.js의 물리·자세가 돈다. 손을 다 놓으면 속도를 그대로 가지고 지상 이동으로 돌아온다.
// inp.cmd = 이 걸음에 한 번만 들어오는 명령 목록({ type: 'hand'|'foot'|'release', limb, i, p }). inp.cx·cy = 벽에서 몸 옮기기(좌우·위아래)
export function makeSim(rig, world, clips = null) {
  // opt.footAssist = 발 보조(간편 조작). 시험의 기본값은 끔(직접 보낸 발만) — 화면 쪽이 켠다
  // p3d-0.14.0: 상자가 많은 지형(클라이밍장)에서는 계산에 몸 둘레 4.5m 안의 상자만 넘긴다(S.world = 그 목록을 담은 같은 틀의 보기, S.worldAll = 모두).
  //   계산이 지형을 보는 곳(팔·몸의 겹침, 길 막힘, 발 디딜 곳, 머리 여유 …)은 모두 몸에서 2m 안이라 결과는 같다 — 홀드 300개를 더한 벽에서 같은 오름이 3.4배 느려졌다(1배속 아래).
  //   몸이 0.5m 움직일 때마다 고친다(그래서 늘 4.0m 안은 들어 있다). 손 명령이 겨눈 턱을 찾는 것과 미리보기는 모든 상자에서 찾는다(climb.js — 먼 턱도 "닿지 않음"으로 알리게). 상자 60개 이하(옛 벽)는 그대로. NOCULL = 끔
  const big = world.boxes.length > 60 && !globalThis.NOCULL, view = big ? { ...world, boxes: [], edges: null, edgesN: -1, full: world } : world; let viewAt = null;
  const cull = () => { if (!big) return; const p = S.body.pos; if (viewAt && viewAt.distanceTo(p) < 0.5) return; viewAt = p.clone(); const R2 = 4.5 * 4.5;
    view.boxes = world.boxes.filter(b => b.kind === 'floor' || (Math.max(b.min.x - p.x, 0, p.x - b.max.x) ** 2 + Math.max(b.min.z - p.z, 0, p.z - b.max.z) ** 2 < R2 && b.min.y < p.y + 6 && b.max.y > p.y - 3)); view.edges = null; view.edgesN = -1; };
  const S = { rig, world: view, worldAll: world, opt: { footAssist: false, wallRest: false, rockOver: true }, inp: null, body: null, motion: null, clip: null, climb: null, clipSet: clips ? makeClipSet(clips) : null, useClip: !!clips, tick: 0 };
  const ground = () => { S.motion = makeMotion(rig, S.body); S.clip = S.clipSet ? makeClipState(S.clipSet, rig, S.body) : null; if (S.clip) S.clip.world = view; if (S.clip && S.useClip) { S.clip.w = 1; S.clip.on = true; S.clip.init = true; } };
  const pose = dt => {
    const K = S.climb;
    if (K.on) { poseClimb(S); if (S.tc) S.tc.a = 0; }
    else { poseProc(S.motion, S.body); if (S.clip) { S.clip.reach = S.climb.hands.map(h => h.st === 'reach'); poseClip(S.clip, S.motion, S.body, view, groundAt, dt); } outBlend(S, dt); torsoClear(S, dt); groundHands(S, dt); measure(S.motion, S.body); }
    afterPose(S);
  };
  S.reset = o => { S.body = o ? makeBody(new THREE.Vector3(...o.pos), o.yaw ?? 0) : makeBody(); viewAt = null; cull(); S.climb = makeClimb(); ground(); S.tick = 0; S.pw = null; S.poleS = null; S.tc = null; S.fing = [0.3, 0.3]; S.pron = [1, 1]; S.gw = [0, 0]; pose(0); };
  S.step = inp => {
    cull(); const K = S.climb; K.events.length = 0; K.tick = S.tick; K.exited = false; S.inp = inp;
    for (const c of inp.cmd || []) command(S, c);
    if (K.on) { stepClimb(S, inp, PHY.DT); if (K.exited) ground(); }
    // B3: 웅크린 채 점프도 0.08초에 뜬다. 자작 모션은 p3d-0.8.0, 캡처 모션은 p3d-0.8.2(엉덩이 오름을 늦추는 처리, clipmotion.js)에서 풀었다
    else { stepBody(S.body, inp, view); stepMotion(S.motion, S.body, inp, view, groundAt, PHY.DT); if (S.clip) stepClip(S.clip, S.motion, S.body, inp, PHY.DT, S.useClip); }
    pose(PHY.DT); fingStep(PHY.DT); S.tick++;
  };
  // 손가락의 굽힘(0 = 편 손, 0.3 = 쉬는 손, 1 = 잡은 손). 제어 뼈대에는 손가락이 없어 그림(human.js)이 이 값을 읽는다. 계산 걸음에서만 바뀐다(그리기 빈도와 무관)
  // S.pron = 놓인 손의 아래팔 비틀기(0 = 손바닥이 팔꿈치 안쪽 쪽 = 잡을 때의 방향, 1 = 손바닥이 몸 쪽 = 늘어뜨린 손의 편한 방향). 제어 뼈대의 손은 늘 앞 방향이라 그림에서만 돌린다
  const fingStep = dt => { const K = S.climb; for (let i = 0; i < 2; i++) { const st = K.hands[i].st, want = st === 'hold' ? 1 : st === 'reach' ? 0 : 0.3, r = want > S.fing[i] ? 28 : 10; S.fing[i] += (want - S.fing[i]) * (1 - Math.exp(-r * dt));
    const pw = st === 'free' ? 1 : 0; S.pron[i] += (pw - S.pron[i]) * (1 - Math.exp(-(pw > S.pron[i] ? 5 : 14) * dt));
    // 잡은 손을 턱 앞면에 맞춰 세우는 정도(그림, human.js). 0.4초쯤에 오른다 — 손가락(0.1초)만큼 빨리 세우면 잡는 걸음 둘레에서 아래팔이 초속 1,000° 넘게 돌았다
    // 뻗는 손은 턱에 30cm 안으로 다가가면 미리 세운다(닿기 전에 손 모양을 만든다)
    // p3d-0.10.2(사람형 몸): 놓은 손도 턱에서 멀어질 때까지 세운 모양을 둔다(손바닥이 모서리를 쓸고 지나가 놓은 직후 손이 턱에 31mm 들었다 — grip_check). 뻗는 손은 45cm 안에서 미리 세운다(30cm로는 잡기 0.1초 전에 13%밖에 세워지지 않았다)
    const Hh = K.hands[i], hb = DIM.grip, d = Hh.edge ? Hh.w.distanceTo(Hh.goal) : 9, gwT = st === 'hold' ? 1 : st === 'reach' && Hh.edge ? Math.min(1, Math.max(0, 1 - (d - 0.03) / (hb ? 0.42 : 0.27))) : hb && st === 'free' && Hh.edge ? Math.min(1, Math.max(0, 1 - (d - 0.03) / 0.12)) : 0;
    S.gw[i] += (gwT - S.gw[i]) * (1 - Math.exp(-(gwT > S.gw[i] ? 12 : 20) * dt)); } };
  S.reset();
  return S;
}
