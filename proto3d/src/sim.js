// 고정 간격(1/120초) 계산 한 걸음: 이동(controller) → 상태(motion) → 자세·접촉 확정(solvePose).
// 실제 실행 루프와 시험 도구가 모두 이 step()만 부른다(W1.1, GPT 검토: 그리기 빈도에 따라 결과가 달라지던 문제).
// 다음 계산이 읽는 값(IK 결과, 발목 자리, 발끝/뒤꿈치 축, 다리가 닿는지, 엉덩이 높이)은 모두 여기서 정해진다.
// 그리기는 이렇게 확정된 뼈 자세를 보여 주기만 하고, 계산 상태를 바꾸지 않는다.
import * as THREE from 'three';
import { groundAt } from './world.js';
import { makeBody, stepBody, PHY } from './controller.js';
import { makeMotion, stepMotion, solvePose } from './motion.js';

export function makeSim(rig, world) {
  const S = { rig, world, body: null, motion: null, tick: 0 };
  S.reset = o => { S.body = o ? makeBody(new THREE.Vector3(...o.pos), o.yaw ?? 0) : makeBody(); S.motion = makeMotion(rig, S.body); S.tick = 0; solvePose(S.motion, S.body); };
  S.step = inp => { stepBody(S.body, inp, world); stepMotion(S.motion, S.body, inp, world, groundAt, PHY.DT); solvePose(S.motion, S.body); S.tick++; };
  S.reset();
  return S;
}
