// 등반 게임 3D 모션 시제품(W0·W1 첫 판). 실행: climb3d.html을 브라우저로 연다.
// 고정 간격 1/120초로 물리(controller)와 자세(motion)를 계산하고, 그림은 화면 빠르기대로 그린다.
import * as THREE from 'three';
import { buildCharacter } from './rig.js';
import { makeWorld, buildWorldMeshes, groundAt } from './world.js';
import { makeBody, stepBody, PHY } from './controller.js';
import { makeMotion, stepMotion, applyPose } from './motion.js';
import { BIND, conflicts, keyName, makeInput } from './input.js';

export const VERSION = 'p3d-0.1.0';
const params = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: params.has('test') });
renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.setSize(innerWidth, innerHeight); renderer.shadowMap.enabled = !params.has('noshadow');
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#cfd6dc'); scene.fog = new THREE.Fog('#cfd6dc', 18, 40);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 100);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f80, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(4, 8, 5); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 }); scene.add(sun);

const world = makeWorld(); buildWorldMeshes(world, scene);
const rig = buildCharacter(); scene.add(rig.root);
const skel = new THREE.SkeletonHelper(rig.mesh); skel.visible = false; scene.add(skel);
let body = makeBody(), motion = makeMotion(rig, body);
const input = makeInput(renderer.domElement);
const cam = { yaw: Math.PI + 0.35, pitch: 0.28, dist: 4.2, target: new THREE.Vector3(0, 1.1, 2) };
let slow = false, acc = 0, last = performance.now(), override = null, paused = false, fresh = true, lastDelta = []; // override = 시험에서 넣는 입력

function readInput() {
  if (override) return override;
  const f = (input.isDown('moveF') ? 1 : 0) - (input.isDown('moveB') ? 1 : 0), r = (input.isDown('moveR') ? 1 : 0) - (input.isDown('moveL') ? 1 : 0);
  // 시점 기준 이동: 화면 위 = 시점이 보는 쪽
  const cy = cam.yaw + Math.PI, fx = Math.sin(cy), fz = Math.cos(cy), rx = -fz, rz = fx;
  let mx = fx * f + rx * r, mz = fz * f + rz * r; const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
  return { mx, mz, run: input.isDown('run'), crouch: input.isDown('crouch'), jump: input.isDown('jump') };
}
function physStep(inp) { stepBody(body, inp, world); stepMotion(motion, body, inp, world, groundAt, PHY.DT); }
function reset(o) { body = o ? makeBody(new THREE.Vector3(...o.pos), o.yaw ?? 0) : makeBody(); motion = makeMotion(rig, body); }

function updateCamera(dt) {
  if (input.isDown('camRotate') || input.st.alt) { cam.yaw -= input.st.mdx * 0.005; cam.pitch = THREE.MathUtils.clamp(cam.pitch + input.st.mdy * 0.004, -0.2, 1.2); } // 시점만 돈다(손발·이동 명령으로 새지 않음)
  if (input.st.wheel) cam.dist = THREE.MathUtils.clamp(cam.dist * (1 + input.st.wheel * 0.1), 1.6, 12);
  const want = new THREE.Vector3(body.pos.x, motion.prm.hipY + 0.25, body.pos.z); cam.target.lerp(want, 1 - Math.exp(-8 * dt));
  camera.position.set(cam.target.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist, cam.target.y + Math.sin(cam.pitch) * cam.dist, cam.target.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist);
  camera.lookAt(cam.target);
}

// 화면 안내(임시. 모양·문구는 GPT 검토 대상)
const hud = document.createElement('div'); hud.id = 'hud'; document.body.appendChild(hud);
const help = document.createElement('div'); help.id = 'help'; document.body.appendChild(help);
help.innerHTML = `<b>조작 (지상 이동)</b><br>` + BIND.map(b => `<span class=k>${b.keys.map(keyName).filter((v, i, a) => a.indexOf(v) === i).join(' / ')}</span> ${b.label}`).join('<br>') + (conflicts().length ? `<br><span class=warn>겹친 입력: ${conflicts().map(c => c.key).join(', ')}</span>` : '');
function stateName() {
  if (!body.onGround) return body.vel.y > 0 ? '공중(오름)' : '공중(내림)';
  if (body.push) return '밀기';
  if (body.charging) return `점프 준비 ${Math.round(body.charge / PHY.CHARGE_MAX * 100)}%`;
  if (motion.prm.land > 0.25) return '착지';
  const v = Math.hypot(body.vel.x, body.vel.z);
  if (motion.prm.crouch > 0.5) return v > 0.12 ? '웅크려 걷기' : '웅크림';
  return v < 0.12 ? '대기' : motion.prm.runW > 0.5 ? '달리기' : '걷기';
}
function drawHud(fps) {
  const v = Math.hypot(body.vel.x, body.vel.z), st = motion.stats;
  hud.innerHTML = `<div class=ver>3D 모션 시제품 ${VERSION} · 임시 캐릭터(자작)</div>`
    + `<div><b>문맥</b> 지상 이동 &nbsp; <b>상태</b> ${stateName()} &nbsp; <b>속도</b> ${v.toFixed(2)} m/s</div>`
    + `<div><b>발</b> ${motion.legs.map(L => `${L.s === 'L' ? '왼발' : '오른발'} ${L.mode === 'plant' ? (L.heel > 0 ? '디딤(뒤꿈치 듦)' : '디딤') : L.mode === 'swing' ? '옮기는 중' : '공중'}`).join(' · ')}</div>`
    + `<div class=dim>디딘 발 미끄러짐 최대 ${(st.maxSlide * 1000).toFixed(2)} mm/걸음 · 다리 뻗음 최대 ${(st.maxRatio * 100).toFixed(0)}% · ${fps.toFixed(0)} fps${slow ? ' · 느리게 ×0.25' : ''}</div>`;
}

let fpsS = 60;
function frame(now) {
  const dtR = Math.min(0.1, (now - last) / 1000); last = now; fpsS += (1 / Math.max(dtR, 1e-3) - fpsS) * 0.05;
  if (input.wasPressed('reset')) reset();
  if (input.wasPressed('bones')) { skel.visible = !skel.visible; rig.mesh.material.wireframe = skel.visible; }
  if (input.wasPressed('slow')) slow = !slow;
  acc += dtR * (slow ? 0.25 : 1);
  const inp = readInput();
  if (paused) acc = 0; // 시험이 걸음을 직접 진행하는 동안 화면 쪽 물리는 멈춘다
  while (acc >= PHY.DT) { physStep(inp); acc -= PHY.DT; }
  if (body.pos.y < -8) reset(); // 바닥 밖으로 떨어지면 처음 자리로
  if (!paused) applyPose(motion, body); updateCamera(dtR); renderer.render(scene, camera); drawHud(fpsS);
  input.endFrame(); requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

// 시험용 창구: 입력을 넣고 물리 걸음을 직접 진행한다(그림과 상관없이 같은 결과)
window.__p3 = {
  VERSION, BIND, conflicts, PHY,
  body: () => ({ pos: body.pos.toArray(), vel: body.vel.toArray(), yaw: body.yaw, onGround: body.onGround, charge: body.charge, t: body.t, events: body.events.slice() }),
  state: stateName, stats: () => ({ ...motion.stats }), resetStats: () => Object.assign(motion.stats, { maxSlide: 0, slideSum: 0, slideN: 0, maxRatio: 0, kneeFlip: 0, below: 0 }),
  legs: () => motion.legs.map(L => ({ s: L.s, mode: L.mode, heel: L.heel, slide: L.slide })), prm: () => ({ ...motion.prm, phase: motion.phase }),
  cam: () => ({ ...cam, target: cam.target.toArray() }),
  setOverride: v => { override = v; }, reset: o => { reset(o); fresh = true; }, pause: v => { paused = v; },
  // n걸음 진행하고 매 걸음 자세를 적용한다. 돌려주는 값: 뼈 회전의 한 걸음 최대 변화(도)와 엉덩이 높이 변화
  run(n, inp) {
    if (fresh) { physStep(inp); applyPose(motion, body); n--; fresh = false; lastDelta = []; } // 다시 시작한 첫 걸음(쉬는 자세 → 첫 자세)은 재지 않는다
    const prev = rig.list.map(b => b.quaternion.clone()); let maxRot = 0, maxRotBone = '', maxJerk = 0, maxJerkBone = '', maxHip = 0, lastHip = motion.prm.hipY;
    for (let i = 0; i < n; i++) { physStep(inp); applyPose(motion, body);
      rig.list.forEach((b, k) => { const a = prev[k].angleTo(b.quaternion) * 180 / Math.PI; if (a > maxRot) { maxRot = a; maxRotBone = b.name; }
        const j = lastDelta[k] === undefined ? 0 : Math.abs(a - lastDelta[k]); if (j > maxJerk) { maxJerk = j; maxJerkBone = b.name; } lastDelta[k] = a; prev[k].copy(b.quaternion); }); // 튐 = 한 걸음 회전량이 바로 앞 걸음과 갑자기 다름
      maxHip = Math.max(maxHip, Math.abs(motion.prm.hipY - lastHip)); lastHip = motion.prm.hipY; }
    return { maxRot, maxRotBone, maxJerk, maxJerkBone, maxHip, bad: rig.list.some(b => !Number.isFinite(b.quaternion.x)) };
  },
  bonesWorld: () => Object.fromEntries(rig.list.map(b => { b.updateWorldMatrix(true, false); return [b.name, new THREE.Vector3().setFromMatrixPosition(b.matrixWorld).toArray()]; })),
};
