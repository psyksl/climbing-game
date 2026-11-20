// 고정 간격(1/120초) 계산 한 걸음: 이동(controller) → 상태(motion, clipmotion) → 자세·접촉 확정(poseProc → poseClip) → 측정.
// 실제 실행 루프와 시험 도구가 모두 이 step()만 부른다(W1.1, GPT 검토: 그리기 빈도에 따라 결과가 달라지던 문제).
// 다음 계산이 읽는 값(IK 결과, 발목 자리, 발끝/뒤꿈치 축, 다리가 닿는지, 엉덩이 높이)은 모두 여기서 정해진다.
// 그리기는 이렇게 확정된 뼈 자세를 보여 주기만 하고, 계산 상태를 바꾸지 않는다.
import * as THREE from 'three';
import { groundAt } from './world.js';
import { makeBody, stepBody, PHY } from './controller.js';
import { makeMotion, stepMotion, poseProc, measure } from './motion.js';
import { makeClipSet, makeClipState, stepClip, poseClip } from './clipmotion.js';
import { makeClimb, command, stepClimb, poseClimb, groundHands, outBlend, afterPose } from './climb.js';

// clips = 캡처 동작 자료(없으면 null → 자작 모션만). S.useClip으로 두 모션을 바꾼다(자료가 있을 때만).
// 벽 문맥(W2): 손이 턱을 잡으면 S.climb.on. 그동안은 지상 이동 대신 climb.js의 물리·자세가 돈다. 손을 다 놓으면 속도를 그대로 가지고 지상 이동으로 돌아온다.
// inp.cmd = 이 걸음에 한 번만 들어오는 명령 목록({ type: 'hand'|'foot'|'release', limb, i, p }). inp.cx·cy = 벽에서 몸 옮기기(좌우·위아래)
export function makeSim(rig, world, clips = null) {
  // opt.footAssist = 발 보조(간편 조작). 시험의 기본값은 끔(직접 보낸 발만) — 화면 쪽이 켠다
  const S = { rig, world, opt: { footAssist: false, wallRest: false }, inp: null, body: null, motion: null, clip: null, climb: null, clipSet: clips ? makeClipSet(clips) : null, useClip: !!clips, tick: 0 };
  const ground = () => { S.motion = makeMotion(rig, S.body); S.clip = S.clipSet ? makeClipState(S.clipSet, rig, S.body) : null; if (S.clip && S.useClip) { S.clip.w = 1; S.clip.on = true; S.clip.init = true; } };
  const pose = dt => {
    const K = S.climb;
    if (K.on) poseClimb(S);
    else { poseProc(S.motion, S.body); if (S.clip) poseClip(S.clip, S.motion, S.body, world, groundAt, dt); outBlend(S, dt); groundHands(S, dt); measure(S.motion, S.body); }
    afterPose(S);
  };
  S.reset = o => { S.body = o ? makeBody(new THREE.Vector3(...o.pos), o.yaw ?? 0) : makeBody(); S.climb = makeClimb(); ground(); S.tick = 0; S.pw = null; S.poleS = null; pose(0); };
  S.step = inp => {
    const K = S.climb; K.events.length = 0; K.tick = S.tick; K.exited = false; S.inp = inp;
    for (const c of inp.cmd || []) command(S, c);
    if (K.on) { stepClimb(S, inp, PHY.DT); if (K.exited) ground(); }
    // B3(웅크린 채 점프도 0.08초에 뜬다)는 자작 모션에서만 풀었다. 캡처 모션은 뜨는 걸음의 자세 연결이 남아 전처럼 웅크린 만큼 늦게(최대 0.30초) 뜬다 — 미해결로 적어 둔다
    else { S.body.slowCrouch = !!(S.clip && S.useClip); stepBody(S.body, inp, world); stepMotion(S.motion, S.body, inp, world, groundAt, PHY.DT); if (S.clip) stepClip(S.clip, S.motion, S.body, inp, PHY.DT, S.useClip); }
    pose(PHY.DT); S.tick++;
  };
  S.reset();
  return S;
}
