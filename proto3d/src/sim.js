// 고정 간격(1/120초) 계산 한 걸음: 이동(controller) → 상태(motion, clipmotion) → 자세·접촉 확정(poseProc → poseClip) → 측정.
// 실제 실행 루프와 시험 도구가 모두 이 step()만 부른다(W1.1, GPT 검토: 그리기 빈도에 따라 결과가 달라지던 문제).
// 다음 계산이 읽는 값(IK 결과, 발목 자리, 발끝/뒤꿈치 축, 다리가 닿는지, 엉덩이 높이)은 모두 여기서 정해진다.
// 그리기는 이렇게 확정된 뼈 자세를 보여 주기만 하고, 계산 상태를 바꾸지 않는다.
import * as THREE from 'three';
import { groundAt } from './world.js';
import { makeBody, stepBody, PHY } from './controller.js';
import { makeMotion, stepMotion, poseProc, measure } from './motion.js';
import { makeClipSet, makeClipState, stepClip, poseClip } from './clipmotion.js';

// clips = 캡처 동작 자료(없으면 null → 자작 모션만). S.useClip으로 두 모션을 바꾼다(자료가 있을 때만).
export function makeSim(rig, world, clips = null) {
  const S = { rig, world, body: null, motion: null, clip: null, clipSet: clips ? makeClipSet(clips) : null, useClip: !!clips, tick: 0 };
  const pose = dt => { poseProc(S.motion, S.body); if (S.clip) poseClip(S.clip, S.motion, S.body, world, groundAt, dt); measure(S.motion, S.body); };
  S.reset = o => { S.body = o ? makeBody(new THREE.Vector3(...o.pos), o.yaw ?? 0) : makeBody(); S.motion = makeMotion(rig, S.body); S.clip = S.clipSet ? makeClipState(S.clipSet, rig, S.body) : null; S.tick = 0; if (S.clip && S.useClip) { S.clip.w = 1; S.clip.on = true; S.clip.init = true; } pose(0); };
  S.step = inp => { stepBody(S.body, inp, world); stepMotion(S.motion, S.body, inp, world, groundAt, PHY.DT); if (S.clip) stepClip(S.clip, S.motion, S.body, inp, PHY.DT, S.useClip); pose(PHY.DT); S.tick++; };
  S.reset();
  return S;
}
