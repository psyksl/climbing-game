// 등반 게임 3D 모션 시제품(W0·W1 첫 판). 실행: climb3d.html을 브라우저로 연다.
// 고정 간격 1/120초로 이동·상태·자세를 모두 계산하고(sim.js), 그림은 확정된 자세를 화면 빠르기대로 보여 주기만 한다.
import * as THREE from 'three';
import { buildCharacter } from './rig.js';
import { makeWorld, buildWorldMeshes, rayHit } from './world.js';
import { PHY } from './controller.js';
import { makeSim } from './sim.js';
import { BIND, conflicts, keyName, makeInput } from './input.js';
import CLIPS from 'clip-data';
import GALLERY from 'gallery-data'; // 동작 보기용 자료(받은 동작 전부를 이 뼈대로 옮긴 값. 있을 때만)
import { poseRaw } from './clipmotion.js'; // 캡처 동작 자료(빌드할 때 assets_local/clips.json이 있으면 들어온다. 없으면 null)

export const VERSION = 'p3d-0.3.0';
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
const sim = makeSim(rig, world, CLIPS); let body = sim.body, motion = sim.motion;
const input = makeInput(renderer.domElement);
const cam = { yaw: Math.PI + 0.35, pitch: 0.28, dist: 4.2, target: new THREE.Vector3(0, 1.1, 2), eff: 4.2, follow: null, followOff: 0, blocked: false }; // eff = 벽에 막혀 줄인 실제 거리, follow = 영상용 따라가기(몸 방향 기준 각도)
// 동작 보기: 받은 동작을 하나씩 이 캐릭터로 튼다(게임 계산은 멈춘다. 발 고정·IK 없이 옮긴 자세 그대로)
const gal = { on: false, i: 0, t: 0, names: GALLERY ? Object.keys(GALLERY.clips) : [], origin: new THREE.Vector3(), yaw: 0 };
if (GALLERY) for (const c of Object.values(GALLERY.clips)) { c.hip = Float32Array.from(c.hip); c.q = Float32Array.from(c.q); }
const galClip = () => GALLERY.clips[gal.names[gal.i]], galPose = () => poseRaw(rig, GALLERY.bones, galClip(), Math.min(gal.t, galClip().dur), gal.origin, gal.yaw);
function galOpen(v) { gal.on = v && !!GALLERY; if (gal.on) { gal.origin.copy(body.pos); gal.yaw = body.yaw; gal.t = 0; galPose(); } else reset({ pos: gal.origin.toArray(), yaw: gal.yaw }); }
function galGo(d, cat) { const n = gal.names.length; if (cat) { const c0 = galClip().cat; let k = gal.i; do { k = (k + d + n) % n; } while (GALLERY.clips[gal.names[k]].cat === c0 && k !== gal.i); if (d < 0) { const c1 = GALLERY.clips[gal.names[k]].cat; while (GALLERY.clips[gal.names[(k - 1 + n) % n]].cat === c1 && k !== 0) k = (k - 1 + n) % n; } gal.i = k; } else gal.i = (gal.i + d + n) % n; gal.t = 0; }
let slow = false, acc = 0, last = performance.now(), override = null, paused = false, fresh = true, lastDelta = []; // override = 시험에서 넣는 입력

function readInput() {
  if (override) return override;
  const f = (input.isDown('moveF') ? 1 : 0) - (input.isDown('moveB') ? 1 : 0), r = (input.isDown('moveR') ? 1 : 0) - (input.isDown('moveL') ? 1 : 0);
  // 시점 기준 이동: 화면 위 = 시점이 보는 쪽
  const cy = cam.yaw + Math.PI, fx = Math.sin(cy), fz = Math.cos(cy), rx = -fz, rz = fx;
  let mx = fx * f + rx * r, mz = fz * f + rz * r; const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
  return { mx, mz, run: input.isDown('run'), crouch: input.isDown('crouch'), jump: input.isDown('jump') };
}
function physStep(inp) { sim.step(inp); }
function reset(o) { sim.reset(o); body = sim.body; motion = sim.motion; }

function updateCamera(dt) {
  if (input.isDown('camRotate') || input.st.alt) { cam.yaw -= input.st.mdx * 0.005; cam.pitch = THREE.MathUtils.clamp(cam.pitch + input.st.mdy * 0.004, -0.2, 1.2); cam.follow = null; } // 시점만 돈다(손발·이동 명령으로 새지 않음)
  if (input.st.wheel) cam.dist = THREE.MathUtils.clamp(cam.dist * (1 + input.st.wheel * 0.1), 1.2, 12);
  if (cam.follow !== null) { let d = body.yaw + cam.followOff - cam.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); cam.yaw += d * (1 - Math.exp(-6 * dt)); }
  const hw = gal.on ? rig.bones.hips.getWorldPosition(new THREE.Vector3()) : null, want = gal.on ? new THREE.Vector3(hw.x, hw.y + 0.25, hw.z) : new THREE.Vector3(body.pos.x, rig.bones.hips.position.y + 0.25, body.pos.z); cam.target.lerp(want, 1 - Math.exp(-8 * dt));
  // 벽 통과 막기: 목표에서 원하는 자리까지 지형과 맞댄다. 막히면 ① 카메라를 조금씩 위로 올려(내려다봄) 1m 넘게 떨어질 수 있는 자리를 찾고 ② 없으면 가장 먼 자리를 벽 앞 0.2m까지만 쓴다. 당길 때는 바로, 물러날 때는 천천히
  let best = null;
  for (const up of [0, 0.25, 0.5, 0.8, 1.1]) {
    const pch = Math.min(1.35, cam.pitch + up), dir = new THREE.Vector3(Math.sin(cam.yaw) * Math.cos(pch), Math.sin(pch), Math.cos(cam.yaw) * Math.cos(pch));
    const hit = rayHit(world, cam.target, cam.target.clone().addScaledVector(dir, cam.dist)), allow = hit >= 1 ? cam.dist : Math.max(0.12, hit * cam.dist - 0.2);
    if (!best || allow > best.allow + 0.3) best = { dir, allow, hit, up };
    if (allow >= Math.min(cam.dist, 1.0)) break;
  }
  cam.blocked = best.hit < 1 || best.up > 0; cam.eff = best.allow < cam.eff ? best.allow : cam.eff + (best.allow - cam.eff) * (1 - Math.exp(-3 * dt));
  cam.dirEff = cam.dirEff ? cam.dirEff.lerp(best.dir, 1 - Math.exp(-10 * dt)).normalize() : best.dir.clone();
  camera.position.copy(cam.target).addScaledVector(cam.dirEff, Math.min(cam.eff, best.allow));
  camera.lookAt(cam.target);
}

// 화면 안내(임시. 모양·문구는 GPT 검토 대상)
const hud = document.createElement('div'); hud.id = 'hud'; document.body.appendChild(hud);
const banner = document.createElement('div'); banner.id = 'banner'; document.body.appendChild(banner); // 영상용 장면 이름(시험이 정한다)
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
  if (gal.on) { const c = galClip(); hud.innerHTML = `<div class=ver>3D 모션 시제품 ${VERSION} · 임시 캐릭터(자작)</div><div><b>동작 보기</b> ${gal.i + 1} / ${gal.names.length} &nbsp; <b>${gal.names[gal.i]}</b></div><div><b>분류</b> ${c.cat} &nbsp; <b>시각</b> ${Math.min(gal.t, c.dur).toFixed(2)} / ${c.dur.toFixed(2)}초</div><div class=dim>받은 동작을 이 캐릭터로 옮긴 그대로(원본의 이동 포함 · 발 고정 없음 · 게임 계산은 멈춤)</div><div class=${slow ? 'slow' : 'real'}>${slow ? '느리게 ×0.25' : '실제 속도'}</div>`; return; }
  const v = Math.hypot(body.vel.x, body.vel.z), st = motion.stats;
  const C = sim.clip, cap = C && C.w > 0.5, footName = (L, i) => cap ? (C.feet[i].step ? '고쳐 디딤' : C.feet[i].lock ? (C.feet[i].kind === 'heel' ? '디딤(뒤꿈치)' : '디딤(발끝)') : '옮기는 중') : L.mode === 'plant' ? (L.heel > 0 ? '디딤(뒤꿈치 듦)' : '디딤') : L.mode === 'swing' ? '옮기는 중' : '공중';
  hud.innerHTML = `<div class=ver>3D 모션 시제품 ${VERSION} · 임시 캐릭터(자작)</div>`
    + `<div><b>모션</b> ${!sim.clipSet ? '자작(코드로 만든 동작)' : sim.useClip ? `캡처 동작${cap ? '' : ' → 지금은 자작(웅크림·점프·착지)'}` : '자작(코드로 만든 동작)'}</div>`
    + `<div><b>문맥</b> 지상 이동 &nbsp; <b>상태</b> ${stateName()} &nbsp; <b>속도</b> ${v.toFixed(2)} m/s</div>`
    + `<div><b>발</b> ${motion.legs.map((L, i) => `${L.s === 'L' ? '왼발' : '오른발'} ${footName(L, i)}`).join(' · ')}</div>`
    + `<div class=dim>지지 구간 최대 이탈 ${(st.stanceMaxDev * 1000).toFixed(2)} mm · 다리 뻗음 최대 ${(st.maxRatio * 100).toFixed(0)}% · ${fps.toFixed(0)} fps</div>`
    + `<div class=${slow ? 'slow' : 'real'}>${slow ? '느리게 ×0.25' : '실제 속도'}</div>`;
}

let fpsS = 60, tickInput = null; // tickInput = 시험이 계산 걸음마다 넣는 입력(걸음 번호 → 입력)
// 한 화면 프레임: ① 누적 시간만큼 고정 걸음 계산(이동·상태·자세 모두 sim.step) ② 확정된 자세를 그린다. 실제 루프와 시험(simFrames)이 같이 쓴다
function frameCore(dtR, inp, onTick) {
  if (gal.on) { gal.t += dtR * (slow ? 0.25 : 1); if (gal.t > galClip().dur + 0.5) gal.t = 0; galPose(); updateCamera(dtR); renderer.render(scene, camera); drawHud(fpsS); return; } // 동작 보기: 게임 계산을 하지 않는다
  acc += dtR * (slow ? 0.25 : 1);
  while (acc >= PHY.DT) { physStep(tickInput ? tickInput(sim.tick) : inp); acc -= PHY.DT; if (onTick) onTick(); }
  if (body.pos.y < -8) reset(); // 바닥 밖으로 떨어지면 처음 자리로
  updateCamera(dtR); renderer.render(scene, camera); drawHud(fpsS); // 그리기는 계산 상태를 바꾸지 않는다
}
function frame(now) {
  const dtR = Math.min(0.1, (now - last) / 1000); last = now; fpsS += (1 / Math.max(dtR, 1e-3) - fpsS) * 0.05;
  if (input.wasPressed('reset')) reset();
  if (input.wasPressed('bones')) { skel.visible = !skel.visible; rig.mesh.material.wireframe = skel.visible; }
  if (input.wasPressed('slow')) slow = !slow;
  if (input.wasPressed('motionMode') && sim.clipSet) sim.useClip = !sim.useClip;
  if (input.wasPressed('gallery') && GALLERY) galOpen(!gal.on);
  if (gal.on) { if (input.wasPressed('galNext')) galGo(1); if (input.wasPressed('galPrev')) galGo(-1); if (input.wasPressed('galCatNext')) galGo(1, true); if (input.wasPressed('galCatPrev')) galGo(-1, true); }
  if (!paused) frameCore(dtR, readInput()); else renderer.render(scene, camera); // 시험이 걸음을 직접 진행하는 동안 화면 쪽 계산은 멈춘다
  input.endFrame(); requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

// 시험용 창구: 입력을 넣고 물리 걸음을 직접 진행한다(그림과 상관없이 같은 결과)
window.__p3 = {
  VERSION, BIND, conflicts, PHY,
  body: () => ({ pos: body.pos.toArray(), vel: body.vel.toArray(), yaw: body.yaw, onGround: body.onGround, charge: body.charge, t: body.t, events: body.events.slice() }),
  state: stateName, stats: () => ({ ...motion.stats, stances: motion.stats.stances.slice() }), resetStats: () => { Object.assign(motion.stats, { maxSlide: 0, slideSum: 0, slideN: 0, maxRatio: 0, kneeFlip: 0, below: 0, stances: [], stanceMaxDev: 0, stanceMaxPath: 0 }); for (const L of motion.legs) L.stance = null; },
  openStances: () => motion.legs.filter(L => L.stance).map(L => ({ leg: L.s, maxDev: L.stance.maxDev, path: L.stance.path, kinds: L.stance.kinds.join('>') })),
  legs: () => motion.legs.map((L, i) => sim.clip && sim.clip.on ? { s: L.s, mode: sim.clip.feet[i].lock ? 'plant' : 'swing', heel: sim.clip.feet[i].kind === 'toe' ? 1 : -1, slide: L.slide, clip: true } : { s: L.s, mode: L.mode, heel: L.heel, slide: L.slide }), prm: () => ({ ...motion.prm, phase: motion.phase }),
  cam: () => ({ yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist, eff: cam.eff, blocked: cam.blocked, target: cam.target.toArray(), pos: camera.position.toArray() }),
  setCam: o => { Object.assign(cam, o); if (o.dist) cam.eff = o.dist; cam.dirEff = null; }, // 영상용: { yaw, pitch, dist, follow: true/null, followOff }
  lineClear: (a, b) => rayHit(world, new THREE.Vector3(...a), new THREE.Vector3(...b)) >= 1 - 1e-6,
  camInside: () => world.boxes.some(b => b.kind !== 'floor' && camera.position.x > b.min.x && camera.position.x < b.max.x && camera.position.y > b.min.y && camera.position.y < b.max.y && camera.position.z > b.min.z && camera.position.z < b.max.z),
  setOverride: v => { override = v; }, setBanner: t => { banner.textContent = t; banner.style.display = t ? 'block' : 'none'; }, reset: o => { reset(o); fresh = true; }, pause: v => { paused = v; },
  // n걸음 진행하고 매 걸음 자세를 적용한다. 돌려주는 값: 뼈 회전의 한 걸음 최대 변화(도)와 엉덩이 높이 변화
  run(n, inp) {
    if (fresh) { physStep(inp); n--; fresh = false; lastDelta = []; } // 다시 시작한 첫 걸음(쉬는 자세 → 첫 자세)은 재지 않는다
    const prev = rig.list.map(b => b.quaternion.clone()); let maxRot = 0, maxRotBone = '', maxJerk = 0, maxJerkBone = '', maxHip = 0, lastHip = rig.bones.hips.position.y;
    for (let i = 0; i < n; i++) { physStep(inp); // 실제 실행과 같은 경로(sim.step)
      rig.list.forEach((b, k) => { const a = prev[k].angleTo(b.quaternion) * 180 / Math.PI; if (a > maxRot) { maxRot = a; maxRotBone = b.name; }
        const j = lastDelta[k] === undefined ? 0 : Math.abs(a - lastDelta[k]); if (j > maxJerk) { maxJerk = j; maxJerkBone = b.name; } lastDelta[k] = a; prev[k].copy(b.quaternion); }); // 튐 = 한 걸음 회전량이 바로 앞 걸음과 갑자기 다름
      maxHip = Math.max(maxHip, Math.abs(rig.bones.hips.position.y - lastHip)); lastHip = rig.bones.hips.position.y; }
    return { maxRot, maxRotBone, maxJerk, maxJerkBone, maxHip, bad: rig.list.some(b => !Number.isFinite(b.quaternion.x)) };
  },
  // 화면 프레임 흉내: frameDts(초) 목록대로 실제 frameCore를 돌리고, 계산 걸음 every마다 뼈 자리·발 상태를 적는다(FPS별 비교용)
  simFrames(frameDts, inputs, every = 4) { const out = []; acc = 0; tickInput = k => inputs[Math.min(k, inputs.length - 1)];
    const snap = () => { if (sim.tick % every) return; out.push({ k: sim.tick, pos: body.pos.toArray(), bones: rig.list.map(b => { b.updateWorldMatrix(true, false); return new THREE.Vector3().setFromMatrixPosition(b.matrixWorld).toArray(); }), modes: motion.legs.map(L => L.mode), plants: motion.legs.map(L => L.plant.toArray()) }); };
    try { for (const d of frameDts) { if (sim.tick >= inputs.length) break; frameCore(d, null, snap); } } finally { tickInput = null; acc = 0; } return out; },
  // 시험용 한 장: 시점을 몸 기준으로 바로 놓고 그린다(멈춘 채 찍을 때). off = 몸이 보는 쪽 기준 시점 각도
  shot(o = {}) { cam.yaw = body.yaw + (o.off ?? Math.PI / 2); cam.pitch = o.pitch ?? 0.1; cam.dist = cam.eff = o.dist ?? 3.2; cam.follow = null; cam.dirEff = null; cam.target.set(body.pos.x, body.pos.y + (o.h ?? 0.95), body.pos.z); updateCamera(0); renderer.render(scene, camera); drawHud(fpsS); },
  boneNames: () => rig.list.map(b => b.name),
  galleryList: () => GALLERY ? gal.names.map(n => ({ name: n, cat: GALLERY.clips[n].cat, dur: GALLERY.clips[n].dur })) : null,
  gallery(name, t = 0, o = {}) { if (!GALLERY) return false; if (name === null) { galOpen(false); return true; } if (!gal.on) galOpen(true); gal.i = Math.max(0, gal.names.indexOf(name)); gal.t = t; galPose(); const h = rig.bones.hips.getWorldPosition(new THREE.Vector3()); cam.yaw = gal.yaw + (o.off ?? Math.PI / 2); cam.pitch = o.pitch ?? 0.1; cam.dist = cam.eff = o.dist ?? 3.4; cam.follow = null; cam.dirEff = null; cam.target.set(o.fixed ? gal.origin.x : h.x, (o.fixed ? gal.origin.y + 1.0 : h.y) + (o.up ?? 0.1), o.fixed ? gal.origin.z : h.z); const want = cam.target.clone(); updateCamera(0); cam.target.copy(want); camera.position.copy(cam.target).addScaledVector(cam.dirEff, cam.dist); camera.lookAt(cam.target); renderer.render(scene, camera); drawHud(fpsS); return true; },
  hasClips: () => !!sim.clipSet, setMode: m => { if (sim.clipSet) sim.useClip = m === 'clip'; return sim.useClip ? 'clip' : 'proc'; }, mode: () => (sim.useClip ? 'clip' : 'proc'),
  clip: () => sim.clip ? { w: sim.clip.w, on: sim.clip.on, phase: sim.clip.phase, wLoc: sim.clip.wLoc, r: sim.clip.r, stride: sim.clip.stride, feet: sim.clip.feet.map(f => ({ s: f.s, lock: !!f.lock, kind: f.kind, step: !!f.step, off: f.off.length() })) } : null,
  clipInfo: () => sim.clipSet ? Object.fromEntries(Object.entries(sim.clipSet.clips).map(([k, c]) => [k, { src: c.src, n: c.n, dur: c.dur, stride: c.stride, speed: c.speed, duty: c.duty, flight: c.flight }])) : null,
  bonesWorld: () => Object.fromEntries(rig.list.map(b => { b.updateWorldMatrix(true, false); return [b.name, new THREE.Vector3().setFromMatrixPosition(b.matrixWorld).toArray()]; })),
};
