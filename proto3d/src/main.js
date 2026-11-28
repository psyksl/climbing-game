// 등반 게임 3D 모션 시제품(W0·W1 첫 판). 실행: climb3d.html을 브라우저로 연다.
// 고정 간격 1/120초로 이동·상태·자세를 모두 계산하고(sim.js), 그림은 확정된 자세를 화면 빠르기대로 보여 주기만 한다.
import * as THREE from 'three';
import { buildCharacter, BODY } from './rig.js';
import { buildHuman, makeRetarget } from './human.js';
import { makeWorld, makeFixtureWorld, makeGym, buildWorldMeshes, rayHit } from './world.js';
import { PHY } from './controller.js';
import { makeSim } from './sim.js';
import { BIND, conflicts, keyName, makeInput, setKeys, resetKeys, loadKeys, TAP } from './input.js';
import { probeHand, probeFoot, limbState, CL, aimGrip } from './climb.js';
import { makeCourseState, courseSelect, courseReset, courseStep, courseView } from './course.js';
import CLIPS from 'clip-data';
import REFIDX from 'ref-data'; // 참고 자세 색인(캡처 빌드에만. 자작 빌드는 null)
import GALLERY from 'gallery-data'; // 동작 보기용 자료(받은 동작 전부를 이 뼈대로 옮긴 값. 있을 때만)
import { poseRaw } from './clipmotion.js';
import { buildProps, makeSwingRope, applyGrips } from './demo.js'; // 캡처 동작 자료(빌드할 때 assets_local/clips.json이 있으면 들어온다. 없으면 null)

export const VERSION = 'p3d-0.15.7';
// p3d-0.15.7: 한 파일로 주는 시험 빌드는 설정을 파일 안에 적어 둔다(P3D_PROFILE = 주소의 ? 뒤와 같은 글. 예: "link=1&plan=1&guard=1&foot=0"). 주소에 적은 값이 그보다 먼저다.
//   0.15.6의 "해 보기" 파일은 기본 빌드를 주소만 바꿔 여는 작은 파일이라 기본 빌드가 같은 폴더에 있어야 했고, 주소로 켠 설정이 저장되어 다른 파일을 열 때 섞일 수 있었다(GPT의 0.15.6 검토)
const params = new URLSearchParams(globalThis.P3D_PROFILE || ''); for (const [k, v] of new URLSearchParams(location.search)) params.set(k, v);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: params.has('test') });
renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.setSize(innerWidth, innerHeight); renderer.shadowMap.enabled = !params.has('noshadow');
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#cfd6dc'); scene.fog = new THREE.Fog('#cfd6dc', 18, 40);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 100);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f80, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(4, 8, 5); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 }); scene.add(sun);

// 지형(p3d-0.14.0): 화면 기본 = 클라이밍장. ?world=old = 옛 작은 벽(시험의 기준 장면 — ?test·?manual로 여는 브라우저 시험은 따로 정하지 않으면 이것), ?world=corner = 다른 벽으로 옮겨 가기 시험용(p3d-0.10.4)
const WNAME = params.get('world') || (params.has('test') || params.has('manual') ? 'old' : 'gym');
const world = WNAME === 'corner' ? makeFixtureWorld() : WNAME === 'old' ? makeWorld() : makeGym(); buildWorldMeshes(world, scene);
if (world.gym) { Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 13, bottom: -3 }); sun.shadow.mapSize.set(2048, 2048); sun.position.set(2, 14, 8); scene.fog = new THREE.Fog('#cfd6dc', 40, 90); } // 클라이밍장은 12m 벽을 멀리서도 보게 안개를 멀리
const rig = buildCharacter(); scene.add(rig.root);
const skel = new THREE.SkeletonHelper(rig.mesh); skel.visible = false; scene.add(skel);
// 사람형 몸(p3d-0.10.0, 기본): 제어 뼈대(rig)는 계산에만 쓰고 숨긴다. 그릴 때마다 제어 뼈대의 확정된 자세를 새 몸에 옮긴다(human.js — 계산 상태를 바꾸지 않는다). 옛 몸: 주소에 ?body=old
const human = BODY === 'human' ? buildHuman() : null, retarget = human ? makeRetarget(rig, human) : null;
if (human) { scene.add(human.root); rig.mesh.visible = false; }
const draw = () => { if (human) retarget.apply(sim.fing, sim.pron, sim.climb, sim.world, sim.gw); renderer.render(scene, camera); };
const sim = makeSim(rig, world, CLIPS); let body = sim.body;
// p3d-0.15.7(성능): 그려진 자세의 통계(팔이 제 몸·지형을 지나간 걸음 수 — 시험이 읽는다)는 화면에서 재지 않는다. 계산의 상태와는 무관하다. 브라우저 시험 프로필(?test·?manual)과 ?stat 에서는 잰다
sim.noStat = !(params.has('test') || params.has('manual') || params.has('stat'));
// 자세 규칙(p3d-0.10.1, 비교용): 주소에 ?posture=rule(기본) | base(0.10.0) | ref(참고 자세 — 캡처 빌드에만 색인이 있다) | solve(p3d-0.10.2 함께 고르는 자세 실험)
// 잡는 손의 접촉 틀(p3d-0.10.2, 비교용): ?grip=frame = 첫 마디를 턱 모서리에 두는 손목 자리(닿는 거리가 약 6cm 는다 — 기획 결정 대기). 기본 = 0.10.1의 손목 자리. climb.js가 부를 때마다 읽는다
if (params.get('grip') === 'frame') globalThis.GRIP_FRAME = 1;
// p3d-0.11.2: 기본 = 전신 자세 풀이(fb). 옛 규칙은 ?posture=rule 또는 화면에서 O 키(전신 자세 풀이 ↔ 옛 규칙)
let POSTURE = ['rule', 'base', 'ref', 'solve', 'fb'].includes(params.get('posture')) && (params.get('posture') !== 'ref' || (REFIDX && REFIDX.frames)) ? params.get('posture') : (BODY === 'old' ? 'rule' : 'fb');
const applyPosture = () => { sim.opt.posture = POSTURE; sim.ref = POSTURE === 'ref' ? REFIDX : null; }; applyPosture();
loadKeys();
const input = makeInput(renderer.domElement);
const pending = []; // 다음 계산 걸음에 한 번만 들어갈 명령(손발 보내기·놓기)
// 고를 수 있는 조작 설정(저장됨). handMode 1 = 눌러 보내기, 2 = 누르는 동안 뻗기(떼면 잡기). footAssist = 발 보조(간편 조작). diag = 진단 정보. helpAll = 조작표 모두 보기
const OPT = { handMode: 1, grabAssist: true, poseAssist: true, easy: true, autoBody: true, keepHold: false, press: true, linkPose: false, planReach: false, autoGuard: false, footAssist: false, wallRest: false, diag: false, helpAll: false, helpFold: true, dev: false, oldPose: false };
// 조작표 접힘(p3d-0.15.5: 새 프로필의 기본 = 접힘). 저장된 값은 사용자가 K로 직접 고른 것(helpFoldSet)일 때만 따른다 — 0.15.3·0.15.4는 고르지 않아도 기본값(펼침)을 저장했다
// 발 보조(p3d-0.15.7, 사용자 결정 2026-11-28: **기본 끔** — 직접 디디는 것이 기본. F = 켬(초보자용 자동 발, 옵션으로 남긴다)). 저장된 값은 사용자가 F로 직접 고른 것(footAssistSet)일 때만 따른다 —
//   0.15.6까지는 고르지 않아도 옛 기본값(켬)을 저장했으므로, 그 값이 새 기본을 덮어쓰지 않게 한다. 주소의 ?foot=1|0 이 저장된 값보다 먼저다(시험·비교 진입 파일이 켬·끔을 분명히 적는다)
let SAVED0 = {}; try { const sv = JSON.parse(localStorage.getItem('p3dOpt_v1') || '{}'); if (!sv.helpFoldSet) delete sv.helpFold; if (!sv.footAssistSet) delete sv.footAssist; SAVED0 = { ...sv }; Object.assign(OPT, sv); } catch (e) { OPT.handMode = 1; }
// 주소·파일 안의 설정으로 정한 값(URLK)은 저장하지 않는다(그 실행에만 쓴다) — 사용자가 그 뒤에 키로 직접 바꾸면 그때부터 저장한다(userSet)
const URLK = new Set(), urlOpt = (p, k) => { if (params.has(p)) { OPT[k] = params.get(p) !== '0'; URLK.add(k); } }, userSet = k => URLK.delete(k);
urlOpt('foot', 'footAssist');
// 비교 후보(p3d-0.15.2): ?keep=1 = 보조가 먼저 잡은 손을 놓지 않음(기본 끔. 키를 새로 두지 않는다 — GPT의 0.15.1 재검토). 저장된 설정보다 주소가 먼저다
urlOpt('keep', 'keepHold');
// 전신 연결(p3d-0.15.3 — **비교 후보, 화면 기본 끔**. 닿는 범위·버티는 범위가 달라지는 변경이라 사용자·GPT의 결정 전에는 기본으로 두지 않는다): ?link=1 = 켬(개발 모드의 9 키로도). 저장된 설정보다 주소가 먼저다
urlOpt('link', 'linkPose');
// 뻗기 전 검사(p3d-0.15.5, 비교 후보 — 기본 끔, 키 없음): ?plan=1
urlOpt('plan', 'planReach');
// 자동 이동 보호(p3d-0.15.6, 비교 후보 — 기본 끔, 키 없음): ?guard=1
urlOpt('guard', 'autoGuard');
// 비교 스위치(p3d-0.15.4, 견주는 영상·시험용): ?sw=NOHELDCLR,FOLD_KEEP=0.3 → 계산의 전역 비교 스위치를 켠다(시험의 환경 변수와 같은 이름). 화면 위쪽에 켠 스위치를 적는다
const SW_URL = (params.get('sw') || '').split(',').filter(Boolean); for (const k of SW_URL) { const [a, v] = k.split('='); if (/^[A-Z][A-Z0-9_]*$/.test(a)) globalThis[a] = v === undefined ? 1 : +v; }
// 개발 모드(p3d-0.15.3): F2 또는 ?dev — 개발 키(잡기 보정 U·자세 보조 Y·누르기 P·전신 연결 9·벽 딛기 J·몸 자세 O·진단 I·뼈대 B·느리게 N·모션 M·동작 보기 G)는 이때만 듣는다. 진단 정보도 이때만 보인다
if (params.has('dev')) OPT.dev = params.get('dev') !== '0';
let DIAG = false;
// 시범용 수동 프로필(p3d-0.8.1, GPT 권고): 주소에 ?manual 을 붙이면 발 보조·벽 딛기를 끄고 시작한다(발은 사용자가 고른다). 저장된 사용자 옵션은 덮어쓰지 않는다(이 프로필에서는 저장하지 않는다)
const MANUAL = /[?&]manual\b/.test(location.search); if (MANUAL) { OPT.footAssist = false; OPT.wallRest = false; }
// 시범 프로필 ?footx(GPT 답): 벽에서도 발 선택을 X로(지상과 같은 키). 저장된 키 설정을 덮지 않는다(이 실행에만 적용)
// p3d-0.11.9 비교용: 주소에 ?oldrise 를 붙이면 몸 위로(W)가 옛 빠르기(초속 약 0.25m)로 돈다(새 빠르기 = 누른 빠르기 0.5m/s를 따라감). 화면 왼쪽 위에 표시
const OLDRISE_URL = /[?&]oldrise\b/.test(location.search); if (OLDRISE_URL) globalThis.OLDRISE = 1;
const FOOTX = /[?&]footx\b/.test(location.search); if (FOOTX) setKeys('footMod', ['KeyX'], false);
const saveOpt = () => { if (MANUAL) return; const o = { ...OPT }; for (const k of URLK) { if (k in SAVED0) o[k] = SAVED0[k]; else delete o[k]; } try { localStorage.setItem('p3dOpt_v1', JSON.stringify(o)); } catch (e) { return; } };
// 계산이 읽는 설정은 이 한곳에서만 옮긴다(p3d-0.15.3: 다섯 군데에 흩어져 있어 새 설정을 빠뜨리기 쉬웠다)
function syncOpt() { for (const k of ['footAssist', 'grabAssist', 'poseAssist', 'easy', 'autoBody', 'keepHold', 'press', 'linkPose', 'planReach', 'autoGuard', 'wallRest']) sim.opt[k] = OPT[k]; sim.climb.oldPose = OPT.oldPose; DIAG = !!(OPT.dev && DIAG); input.setDev(OPT.dev); }
syncOpt();
let viewMode = false, cxSign = 1; // viewMode = 시점 보기 모드(조작 멈춤). cxSign = 몸 좌우 입력을 화면에서 보이는 쪽으로 맞추는 부호
const aim = { world: null, held: [null, null], foot: [false, false], tap: [false, false] }; // 겨눈 자리(세계 좌표). 마우스를 움직이지 않는 동안에는 화면이 저절로 움직여도 이 자리를 그대로 겨눈다
const cam = { yaw: Math.PI + 0.35, pitch: 0.28, dist: 4.2, target: new THREE.Vector3(0, 1.1, 2), eff: 4.2, follow: null, followOff: 0, blocked: false }; // eff = 벽에 막혀 줄인 실제 거리, follow = 영상용 따라가기(몸 방향 기준 각도)
// 동작 보기: 받은 동작을 하나씩 이 캐릭터로 튼다(게임 계산은 멈춘다. 발 고정·IK 없이 옮긴 자세 그대로)
const gal = { on: false, i: 0, t: 0, names: GALLERY ? Object.keys(GALLERY.clips) : [], origin: new THREE.Vector3(), yaw: 0 };
if (GALLERY) for (const c of Object.values(GALLERY.clips)) { c.hip = Float32Array.from(c.hip); c.q = Float32Array.from(c.q); }
const galClip = () => GALLERY.clips[gal.names[gal.i]];
// 시연장: 동작에 맞는 지형 조각을 놓고, 잡은 손은 그 자리에 붙인다(물리 판정 없음). gal.props = 지형 보임
const KIND_KO = { ledge: '턱·매달리기', wall: '벽', rope: '밧줄', ladder: '사다리', stairs: '계단', narrow: '좁은 길', ground: '땅' };
const stage = new THREE.Group(), dots = [0, 1, 2, 3].map(e => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicMaterial({ color: e % 2 ? '#4f9be0' : '#e0705c' })); m.visible = false; return m; }); // 닿아 있는 손발 표시(왼쪽 = 붉은색, 오른쪽 = 푸른색)
scene.add(stage); dots.forEach(d => scene.add(d)); gal.props = true; gal.built = null;
const galToWorld = p => p.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), gal.yaw).add(gal.origin);
function galBuild() { const c = galClip(); stage.clear(); stage.position.copy(gal.origin); stage.rotation.set(0, gal.yaw, 0); const b = buildProps(c); stage.add(b.group); gal.built = { clip: c, holds: b.holds, info: b.info, rope: null };
  if (b.info.dynamic === 'rope') { const palms = t => { poseRaw(rig, GALLERY.bones, c, t, new THREE.Vector3(), 0); return ['L', 'R'].map(s => rig.bones[`hand.${s}`].localToWorld(new THREE.Vector3(0, -0.08, 0))); }; gal.built.rope = makeSwingRope(b.group, c, palms); b.info.pieces++; } }
function galPose() { const c = galClip(), t = Math.min(gal.t, c.dur); if (!gal.built || gal.built.clip !== c) galBuild(); stage.visible = gal.on && gal.props;
  poseRaw(rig, GALLERY.bones, c, t, gal.origin, gal.yaw); dots.forEach(d => { d.visible = false; });
  if (gal.props) { for (const m of applyGrips(rig, c, gal.built.holds, t, galToWorld)) { dots[m.e].position.copy(m.p); dots[m.e].visible = true; }
    if (gal.built.rope) { const inv = p => p.clone().sub(gal.origin).applyAxisAngle(new THREE.Vector3(0, 1, 0), -gal.yaw), pl = ['L', 'R'].map(s => inv(rig.bones[`hand.${s}`].localToWorld(new THREE.Vector3(0, -0.08, 0)))); gal.built.rope(pl[0], pl[1], rig.bones.hips.position.y - gal.origin.y); } } }
function galOpen(v) { gal.on = v && !!GALLERY; if (gal.on) { gal.origin.copy(body.pos); gal.yaw = body.yaw; gal.t = 0; galPose(); } else { stage.visible = false; dots.forEach(d => { d.visible = false; }); reset({ pos: gal.origin.toArray(), yaw: gal.yaw }); } }
// cat = 지형 종류가 다른 다음(앞) 동작으로 넘어간다
function galGo(d, cat) { const n = gal.names.length; if (cat) { const K = k => GALLERY.clips[gal.names[k]].kind, c0 = K(gal.i); let k = gal.i; do { k = (k + d + n) % n; } while (K(k) === c0 && k !== gal.i); gal.i = k; } else gal.i = (gal.i + d + n) % n; gal.t = 0; }
let slow = false, acc = 0, last = performance.now(), override = null, paused = false, fresh = true, lastDelta = []; // override = 시험에서 넣는 입력

function readInput() {
  if (override) return override;
  const f = (input.isDown('moveF') ? 1 : 0) - (input.isDown('moveB') ? 1 : 0), r = (input.isDown('moveR') ? 1 : 0) - (input.isDown('moveL') ? 1 : 0);
  // 시점 기준 이동: 화면 위 = 시점이 보는 쪽
  const cy = cam.yaw + Math.PI, fx = Math.sin(cy), fz = Math.cos(cy), rx = -fz, rz = fx;
  let mx = fx * f + rx * r, mz = fz * f + rz * r; const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
  // 벽 문맥: 몸 옮기기. 좌우는 화면에서 보이는 쪽(cxSign), 위아래는 그대로. 문맥이 다르면 isDown이 거짓이라 0이다
  // reach = 누르는 동안 뻗는 손이 지금 겨누는 점(손 조작 2번)
  const a = aim.world ? aim.world.toArray() : null, ah = handPoint() ? handPoint().toArray() : null;
  return { mx, mz, run: input.isDown('run'), crouch: input.isDown('crouch'), jump: input.isDown('jump'), cx: (input.isDown('bodyR') ? 1 : 0) - (input.isDown('bodyL') ? 1 : 0), cy: (input.isDown('bodyU') ? 1 : 0) - (input.isDown('bodyD') ? 1 : 0), cxSign, reach: [aim.held[0] && ah, aim.held[1] && ah], look: a, aimHand: ah };
}
// 겨눈 곳: 마우스 자리에서 화면 안쪽으로 쏜 선이 지형에 처음 닿는 점(없으면 null)
const ray = new THREE.Raycaster();
function rayPoint() {
  if (!input.st.has) return null;
  ray.setFromCamera(new THREE.Vector2(input.st.mx / innerWidth * 2 - 1, -(input.st.my / innerHeight) * 2 + 1), camera);
  const a = ray.ray.origin, b = a.clone().addScaledVector(ray.ray.direction, 40), t = rayHit(world, a, b);
  return t < 1 ? a.clone().lerp(b, t) : null;
}
// 겨눈 자리 고정(사용자 의견 4: 뛰면 화면만 움직여 조준이 벗어났다): 마우스를 움직였을 때만 겨눈 자리를 새로 정한다.
// 마우스가 가만히 있으면 화면이 저절로 움직여도 겨눈 자리(벽의 그 점)는 그대로다. 표시는 그 점에 그린다
// 쉬운 조작 ① 조준 맞춤: 손을 보낼 자리는 누른 자리의 시선에서 가장 가까운 잡을 수 있는 턱 모서리(aim.grip). 겨눈 점(aim.world)과 함께, 마우스를 움직였을 때만 새로 정한다. 발과 볼 곳에는 겨눈 점을 그대로 쓴다
function updateAim() { if (input.st.moved || !aim.world || aim.resync) { aim.world = rayPoint(); const g = OPT.easy && input.st.has && !globalThis.NOAIMSNAP ? aimGrip(world, ray.ray.origin, ray.ray.direction, aim.world, sim.climb.hands.filter(h => h.st === 'hold').map(h => h.grip)) : null; aim.grip = g ? g.p.clone() : null; aim.resync = false; } }
function handPoint() { return aim.grip || aim.world; }
function aimPoint() { return aim.world; }
function screenOf(p) { const v = (p.isVector3 ? p.clone() : new THREE.Vector3(...p)).project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, front: v.z < 1 }; }
// 손발 명령: 겨눈 점과 함께 다음 계산 걸음으로 보낸다. 시점 보기 모드에서는 문맥이 view라 wasPressed가 거짓이어서 새지 않는다
//   왼손 = 누르는 순간. 오른손 = 벽에서는 누르는 순간, 지상에서는 짧게 눌렀다 뗄 때(지상의 우클릭 끌기는 시점이다).
//   손 조작 2번(누르는 동안 뻗기)은 벽 문맥의 두 손과 지상의 왼손에 쓴다. 발은 언제나 눌러 보내기.
function wantsFoot() { return input.isDown(input.st.mode === 'ground' ? 'footGround' : 'footMod'); }
function readCommands() {
  // 손인가 발인가(B1, p3d-0.8.1): wantsFoot() 한곳에서 정하고 명령·미리보기가 함께 쓴다. 달리기 키는 관여하지 않는다(달리며 뛰어 클릭하면 언제나 손).
  // 대상은 누르는 순간에 정해 두고(aim.foot), 짧게 눌렀다 떼는 입력(지상의 오른쪽 단추)이 떼는 순간에 다른 대상으로 바뀌지 않게 한다
  const ground = input.st.mode === 'ground', p = foot => { const q = foot ? aim.world : handPoint(); return q ? q.toArray() : [0, -99, 0]; };
  for (const [id, i] of [['limbL', 0], ['limbR', 1]]) {
    // 누르는 순간에 정해 두는 것 둘(p3d-0.8.2): 대상(손·발 = 그 순간 발 지정 키가 눌려 있었는가, 이벤트 시각 기준)과 보내는 방식(짧게 눌렀다 떼기 = 땅에 서서 누른 오른쪽 단추).
    // 방식을 떼는 순간의 상태로 다시 정하면 ① 땅에서 누르고 뜬 뒤에 떼면 명령이 사라지고 ② 공중에서 눌러 이미 보낸 뒤 내려서서 떼면 한 번 더 나간다(둘 다 실제 이벤트로 재현됨)
    if (input.wasPressed(id)) { aim.foot[i] = input.pressedWith(id, ground ? 'footGround' : 'footMod'); aim.tap[i] = ground && body.onGround && i === 1;
      const g = { i, tick: sim.tick, ctx: input.st.mode, onGround: !!body.onGround, limb: aim.foot[i] ? 'foot' : 'hand', tap: aim.tap[i], issued: 0, cancelled: '' }; gest.open[i] = g; gest.log.push(g); if (gest.log.length > 40) gest.log.shift(); }
    // 지상에서 떠 있는 동안(뛰거나 벽에서 놓고 떨어지는 중)은 우클릭도 누르는 순간 오른손(그동안 시점 돌리기는 쉰다)
    const foot = !!aim.foot[i], tapOnly = !!aim.tap[i], hold = OPT.handMode === 2 && !foot && !tapOnly;
    if (tapOnly ? input.tapped(id) : input.wasPressed(id)) { pending.push({ type: foot ? 'foot' : 'hand', i, p: p(foot), hold }); aim.held[i] = hold; if (gest.open[i]) gest.open[i].issued++; }
    if (aim.held[i] && (input.wasReleased(id) || !input.isDown(id))) { aim.held[i] = null; pending.push({ type: 'handUp', i }); }
  }
  for (const [id, i] of [['relL', 0], ['relR', 1]]) if (input.wasPressed(id)) pending.push({ type: 'release', limb: input.pressedWith(id, ground ? 'footGround' : 'footMod') ? 'foot' : 'hand', i });
}
// 작은 벽 앞에서 시작(턱 A 아래, 벽을 보고 선다. 시점은 등 뒤)
// 클라이밍장에서는 코스의 시작 자리로(누를 때마다 다음 코스). 시점은 등 뒤에서 벽을 본다(옛 벽과 같은 0.25rad 비스듬히)
let courseI = -1;
function wallStart() { if (gal.on) galOpen(false);
  // p3d-0.15.3: 코스를 다 돈 다음 한 번은 누르기 시험 조각(혼자 선 대) 앞이다(코스 선택 없음 = 자유 등반)
  if (world.gym) { courseI = (courseI + 1) % (world.courses.length + (world.pressPiece ? 1 : 0)); if (courseI === world.courses.length) { const P = world.pressPiece; reset({ pos: P.startPos, yaw: P.startYaw }); cam.yaw = 0.25; cam.pitch = 0.12; cam.dist = cam.eff = 3.6; cam.follow = null; cam.dirEff = null; cam.target.set(P.startPos[0], 1.3, P.startPos[2]); courseSelect(gym, null, sim.tick); return; }
    const C = world.courses[courseI], n = C.frame.n; reset({ pos: C.startPos, yaw: C.startYaw }); cam.yaw = Math.atan2(n[0], n[2]) + 0.25; cam.pitch = 0.12; cam.dist = cam.eff = 3.6; cam.follow = null; cam.dirEff = null; cam.target.set(C.startPos[0], 1.3, C.startPos[2]); courseSelect(gym, C, sim.tick); return; }
  reset({ pos: world.fixture ? [-0.45, 0, -2.58] : [-0.9, 0, -2.58], yaw: Math.PI }); cam.yaw = 0.25; cam.pitch = 0.12; cam.dist = cam.eff = 3.6; cam.follow = null; cam.dirEff = null; cam.target.set(-0.9, 1.3, -2.58); }
// 누르는 동안 뻗던 손을 거둔다(B2): 시점 보기 전환·손 조작 방식 바꾸기·창이 가려지거나 포커스를 잃음. 새로 잡지 않고 다른 접촉은 그대로 둔다
// p3d-0.8.3(GPT P1-A): 아직 읽지 않은 누름도 버린다. 단추를 누른 뒤 첫 화면 프레임이 오기 전에 마우스가 화면을 벗어나면, 취소할 때는 아직 뻗기(aim.held)가 없어 아무것도 하지 않고
// 바로 뒤의 readCommands가 그 누름으로 새 뻗기 명령을 만들었다. 손발 단추의 누름 자체를 버려(input.kill) 이번 프레임에도, 누른 채 돌아온 뒤에도 명령이 되지 않게 한다. 이미 붙은 손발은 건드리지 않는다
function cancelHolds(why = '') { for (const i of [0, 1]) { const dead = input.kill(i ? 'limbR' : 'limbL'), g = gest.open[i]; if (aim.held[i]) { aim.held[i] = null; pending.push({ type: 'handCancel', i }); } if (g && dead) { g.cancelled = why || 'cancel'; gest.open[i] = null; } } }
// 누름 하나의 수명 기록(진단·시험용): 누른 순간의 문맥·땅/공중·손발 대상·보내는 방식, 명령이 나갔는지, 취소됐는지. 떼는 순간의 상태로 다시 해석하지 않는다는 것을 시험이 이 기록으로 본다
const gest = { open: [null, null], log: [] };
let lostFocus = false;
addEventListener('blur', () => { lostFocus = 'blur'; }); document.addEventListener('visibilitychange', () => { if (document.hidden) lostFocus = 'hidden'; });
// 마우스가 화면 밖으로 나간 채 단추를 떼면 그 뗌을 듣지 못할 수 있다 → 나가는 순간에 거둔다(밖에서 떼어도 잡으러 가지 않는다)
document.documentElement.addEventListener('mouseleave', () => { lostFocus = 'mouseleave'; });
// 입력 기록(p3d-0.15.2, 시험·영상용): 실제 키·마우스로 넣은 입력을 계산 걸음마다(계산에 넘어간 그대로) 적어 두었다가, 같은 입력을 멈춘 화면에서 한 걸음씩 다시 틀어 영상으로 찍는다(__p3.recStart / recStop)
let REC = null;
function physStep(inp) { const c = pending.splice(0), x = c.length ? { ...inp, cmd: (inp.cmd || []).concat(c) } : inp; if (REC) REC.push(JSON.parse(JSON.stringify(x))); sim.step(x); }
function reset(o) { sim.reset(o || world.spawn); courseReset(gym, sim.tick); syncOpt(); body = sim.body; pending.length = 0; aim.held[0] = aim.held[1] = null; }

const CAM = { AIR_BOX: 0.9, WALL_DEAD: 0.12, WALL_RATE: 2.5, LAND_T: 0.8 }, lerpN = (a, b, t) => a + (b - a) * t;
function updateCamera(dt) {
  // 시점 돌리기: 우클릭을 누른 채 끌기(지상, 시점 보기 모드). 시점만 돈다
  if (input.dragging('camDrag') && (viewMode || body.onGround)) { cam.yaw -= input.st.mdx * 0.005; cam.pitch = THREE.MathUtils.clamp(cam.pitch + input.st.mdy * 0.004, -0.2, 1.2); cam.follow = null; aim.resync = true; }
  if (input.st.wheel) { cam.dist = THREE.MathUtils.clamp(cam.dist * (1 + input.st.wheel * 0.1), 1.2, 12); aim.resync = true; }
  if (cam.follow !== null) { let d = body.yaw + cam.followOff - cam.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); cam.yaw += d * (1 - Math.exp(-6 * dt)); }
  const hw = gal.on ? rig.bones.hips.getWorldPosition(new THREE.Vector3()) : null, want = gal.on ? new THREE.Vector3(hw.x, hw.y + 0.25, hw.z) : new THREE.Vector3(body.pos.x, rig.bones.hips.position.y + 0.25, body.pos.z);
  // 따라가기(사용자 의견 4): 뛰어오른 동안에는 화면을 멈춰 둔다(몸이 화면 밖으로 나가려 할 때만 그만큼 따라간다). 잡거나 내려선 뒤에 천천히 따라간다.
  // 벽에서는 느리게, 작은 흔들림(12cm 안)은 따라가지 않는다. 지상에서는 전처럼 바로 따라간다
  { const d = want.clone().sub(cam.target), L = d.length(), air = !gal.on && !sim.climb.on && !body.onGround, wall = !gal.on && sim.climb.on;
    if (cam.follow !== null || gal.on) cam.target.lerp(want, 1 - Math.exp(-8 * dt));
    else if (air) { if (L > CAM.AIR_BOX) cam.target.add(d.setLength(L - CAM.AIR_BOX)); cam.settle = 0; }
    else if (wall) { if (L > CAM.WALL_DEAD) cam.target.add(d.setLength((L - CAM.WALL_DEAD) * (1 - Math.exp(-CAM.WALL_RATE * dt)))); cam.settle = 0; }
    else { cam.settle = Math.min(1, (cam.settle ?? 1) + dt / CAM.LAND_T); cam.target.lerp(want, 1 - Math.exp(-lerpN(CAM.WALL_RATE, 8, cam.settle) * dt)); } }
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

// 클라이밍장의 코스 상태(화면·기록만 — 물리는 모른다). p3d-0.15.1: 선택한 코스 / 잡고 있는 홀드 / 시도 / 기록을 나눴다(course.js. GPT의 0.15.0 검토: 잡은 홀드의 색이 곧 코스여서
//   다른 색을 잡으면 코스 이름이 바뀌고 앞 코스의 "완등!"이 남았다). 문구는 임시(GPT에 디자인 요청)
const gym = makeCourseState(world.courses || []);
function gymStep(dt) { if (!world.gym) return; const K = sim.climb; courseStep(gym, { tick: sim.tick, on: K.on, onGround: !!body.onGround, pos: [body.pos.x, body.pos.y, body.pos.z], hands: K.hands.map(h => ({ st: h.st, box: h.st === 'hold' && h.edge ? h.edge.box : null })) }, dt); }
// 코스 줄(p3d-0.15.2, GPT의 0.15.1 재검토 — 임시): 위에는 "자유 등반 · 코스 · 시도"만 짧게. 기록은 완등한 뒤에만, 손 홀드 색 준수(손만 검사하는 실험 규칙)는 진단(I)에서만 보인다
const gymLine = () => { if (!world.gym) return ''; const v = courseView(gym), C = v.course, T = v.try, R = v.rec, sec = x => `${x.toFixed(1)}초`;
  const now = !T ? '' : T.done ? ` · <b>완등!</b> ${sec(T.doneT)}` : v.live ? ` · 시도 ${T.id} · ${sec((sim.tick - T.t0) / 120)}${v.phase === 'air' ? ' · 공중' : ''}` : '';
  const best = T && T.done && R && R.tops ? ` <span class=dim>· 가장 빠른 기록 ${sec(R.free)}</span>` : '';
  const dev = DIAG && T ? ` <span class=dim>· 손 홀드 색 준수(실험): ${T.done ? (T.doneClean ? '지킴' : '안 지킴') : T.clean ? '지키는 중' : `안 지킴(${T.cleanWhy})`}${R && R.clean !== null ? ` · 지킨 기록 ${sec(R.clean)}` : ''}</span>` : '';
  return `<div><b>자유 등반</b> ${C ? `· <span style="color:${C.color === '#2a2a2e' ? '#000' : C.color}">■</span> ${C.name}${now}${best}${dev}` : ''} <span class=dim>· T = 다음 코스</span></div>`; };
// 화면 안내(임시. 모양·문구는 GPT 검토 대상)
const hud = document.createElement('div'); hud.id = 'hud'; document.body.appendChild(hud);
const banner = document.createElement('div'); banner.id = 'banner'; document.body.appendChild(banner); // 영상용 장면 이름(시험이 정한다)
const help = document.createElement('div'); help.id = 'help'; document.body.appendChild(help);
const CTX_KO = { ground: '지상 조작', wall: '벽 등반', view: '시점 보기(조작 멈춤)', gallery: '동작 시연', any: '언제나' };
let helpFor = '';
// 조작 안내(임시 배치): 평소에는 지금 문맥에서 쓰는 키만 보인다. 개발·시험용 키와 다른 문맥의 키는 "조작표 모두 보기"로 편다
function drawHelp() {
  const m = input.st.mode, key = m + OPT.helpFold + OPT.dev + OPT.handMode + OPT.footAssist + OPT.wallRest + BIND.map(b => b.keys.join()).join('|'); if (key === helpFor) return; helpFor = key;
  const row = b => `<span class=k>${b.keys.map(keyName).filter((v, i, a) => a.indexOf(v) === i).join(' / ')}</span> ${b.label}`, kOf = id => keyName(BIND.find(b => b.id === id).keys[0]);
  const part = (c, on, dev) => { const L = BIND.filter(b => b.ctx.includes(c) && (dev || !b.dev)); return L.length ? `<div class=${on ? 'on' : 'off'}><b>${CTX_KO[c]}</b>${on && c !== 'any' ? ' ← 지금' : ''}<br>${L.map(row).join('<br>')}</div>` : ''; };
  // p3d-0.15.3(임시 배치): 접힘 = 한 줄만. 펼침 = 지금 문맥 + 공통. 개발 모드 = 다른 문맥과 개발 키까지(개발 키는 개발 모드에서만 듣는다 — 보이는 줄과 듣는 키가 같다)
  // p3d-0.15.4(GPT 시안 — 사용자 확정 아님): 접힌 줄은 지금 문맥의 핵심만, 키는 실제 배정에서 가져온 키캡으로(글자를 고정해 적지 않는다). 개발 모드는 작은 배지
  const cap = (...ids) => `<span class=k>${ids.map(kOf).filter((v, i, a) => a.indexOf(v) === i).join(' ')}</span>`, badge = OPT.dev ? ' <span class=badge>개발 모드</span>' : '';
  if (OPT.helpFold) { help.innerHTML = `<b>조작</b>${badge} ` + (m === 'wall' ? `${cap('limbL', 'limbR')} 손 ${cap('footMod')} 발 선택 ${cap('bodyU', 'bodyL', 'bodyD', 'bodyR')} 몸 이동 ${cap('jump')} 점프` : `${cap('moveF', 'moveL', 'moveB', 'moveR')} 걷기 ${cap('run')} 달리기 ${cap('jump')} 점프 ${cap('limbL', 'limbR')} 손`) + ` ${cap('helpAll')} 조작표 펼치기`; return; }
  help.innerHTML = `<b>조작 (임시 배치)</b>${badge}` + part(m, true, OPT.dev)
    + (OPT.dev ? ['ground', 'wall', 'view'].filter(c => c !== m && m !== 'gallery').map(c => part(c, false, true)).join('') + part('any', true, true) : part('any', true, false))
    + (conflicts().length ? `<span class=warn>겹친 입력: ${conflicts().map(c => keyName(c.key)).join(', ')}</span>` : '');
}
// 손발 이름표·미리보기(임시 표시. 모양·문구는 GPT 검토 대상). 색만이 아니라 글·기호로 상태를 구분한다
// 손 보내기가 거부된 까닭의 플레이 문구(p3d-0.15.6, GPT의 0.15.5 검토 02_UI_FEEDBACK — 시안 반영, 사용자 확정 아님): [까닭, 힌트]. 자세한 까닭·cm는 개발 모드에서만 보인다(예측과 실제의 거리 오차가 커서 확정 수치처럼 내세우지 않는다)
const HAND_WHY = why => (/^닿지 않음/.test(why) ? ['지금은 손이 닿지 않아요.', ''] : /자세 확인/.test(why) ? ['자세 확인이 끝나지 않았어요.', '다시 눌러 보세요.'] : /막|걸려|지나감|꺾이지|돌아가지|등지고/.test(why) ? ['지금 자세에서는 팔이 막혀요.', '몸이나 발 위치를 바꿔 보세요.'] : null);
// 목표 자리의 짧은 반응(거부 · 예약 · 계산 중) — 손 이름표(tags[0·1])와 따로 둔다
const fbTag = (() => { const d = document.createElement('div'); d.className = 'tag'; document.body.appendChild(d); return d; })();
const tags = [0, 1, 2, 3, 4].map(() => { const d = document.createElement('div'); d.className = 'tag'; document.body.appendChild(d); return d; });
const mark = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false, transparent: true, opacity: 0.9 })); mark.renderOrder = 9; mark.visible = false; scene.add(mark);
// 진단 표시(임시): 하중과 그 손발이 지금 낼 수 있는 한계를 함께 적는다(둘 다 몸무게의 배수. 하중 ÷ 한계가 아니다 — GPT Reply07 5장)
// p3d-0.8.3(GPT 답): "현재 하중"과 "허용 한계"를 낱말로 나눠 적는다(같은 단위 = 몸무게의 배수). 한계가 0이면(다 펴진 다리는 더 밀지 못한다) 그렇게 적는다. 지금 순간의 값이며 앞으로 버틸지·피로를 뜻하지 않는다
// 진단 표시(임시, 몸무게의 배수): 손 = 근육이 당기는 힘(당김 한계 안) · 다 편 팔이 줄처럼 버티는 몫(한계와 무관) · 고른 값(둘의 합을 약 0.08초로 고른 표시용 값) · 당김 한계. 발 = 지금 미는 힘 · 고른 값 · 한계. '힘쓰는 정도(%)'로 보이지 않는다
// p3d-0.8.5: 손인지 발인지는 부르는 쪽이 알려 준다. 0.8.4는 `pas` 값이 있는지로 갈랐는데 발에도 그 값(0)이 있어 발 이름표에 '당김 · 편 팔 버팀 · 당김 한계'가 나왔다
const LOADT = (x, arm) => (DIAG ? ` <i>${arm ? `당김 ${(x.act || 0).toFixed(2)} · 편 팔 버팀 ${(x.pas || 0).toFixed(2)} · 고른 값 ${(x.loadS || 0).toFixed(2)} · 당김 한계 ${x.cap > 1e-3 ? x.cap.toFixed(2) : '0(더 못 냄)'}` : `미는 힘 ${(x.load || 0).toFixed(2)} · 고른 값 ${(x.loadS || 0).toFixed(2)} · 미는 한계 ${x.cap > 1e-3 ? x.cap.toFixed(2) : '0(더 못 냄)'}`}</i>` : '');
function drawTags() {
  const K = sim.climb, put = (d, p, html, cls, dx = 10) => { const s = screenOf(p); d.style.display = s.front ? 'block' : 'none'; d.style.left = `${s.x + dx}px`; d.style.top = `${s.y - 10}px`; d.className = `tag ${cls}`; d.innerHTML = html; };
  tags.forEach(d => { d.style.display = 'none'; }); fbTag.style.display = 'none'; mark.visible = false;
  if (gal.on) return;
  // 두 손이 가까우면 이름표를 좌우로 벌린다(왼손은 왼쪽으로)
  const near = K.hands.every(h => h.st !== 'free') && (() => { const a = screenOf(K.hands[0].st === 'hold' ? K.hands[0].grip : K.hands[0].goal), b = screenOf(K.hands[1].st === 'hold' ? K.hands[1].grip : K.hands[1].goal); return Math.abs(a.y - b.y) < 22 && Math.abs(a.x - b.x) < 150; })();
  // 취소 알림(임시 모양·문구): 뻗던 손을 거둔 뒤 0.9초 동안 그 손 자리에 한 번만 보인다(뻗는 표시는 이미 사라졌다). 놓기·실패와 다른 기호를 쓴다
  { const now = sim.tick / 120; for (let k = K.log.length - 1; k >= 0 && now - K.log[k].t < 0.9; k--) { const e = K.log[k]; if (e.type === 'cancel' && e.limb === 'hand' && K.hands[e.i].st === 'free') { put(tags[e.i], rig.bones[`hand.${e.i ? 'R' : 'L'}`].getWorldPosition(new THREE.Vector3()), `⤺ ${e.name} 보내기 취소`, 'pv'); break; } } }
  K.hands.forEach((h, i) => { const n = i ? '오른손' : '왼손', dx = near && !i ? -112 : 10; const ARMT = h.arm ? ' · <b>◌ 예약</b>' : ''; if (h.st === 'hold') put(tags[i], h.grip, `● ${n} 잡고 있음${LOADT(h, true)}${ARMT}`, i ? 'R' : 'L', dx); else if (h.st === 'free' && h.arm) put(tags[i], h.arm.p, `◌ ${n} 예약 · 닿으면 잡아요.`, i ? 'R' : 'L', dx); else if (h.st === 'reach') put(tags[i], h.w, (h.drag ? `◌ ${n} 뻗는 중${h.edge ? ' · 떼면 잡기' : ''}` : `→ ${n} 보내는 중`) + (h.swivel ? ` · <b>⤴ 팔꿈치 돌리는 중 ${'◜◝◞◟'[Math.floor(sim.tick / 10) % 4]}</b>` : (h.blockT || 0) > 0.12 ? ' · <b>⤬ 팔 경로 막힘</b>' : (h.stopB && (h.selfBlock || 0) > 0.12) ? ' · <b>⤬ 몸에 막힘</b>' : (h.stopA && (h.armCross || 0) > 0.12) ? ' · <b>⤬ 다른 팔에 막힘</b>' : h.auto ? ' · <b>몸을 옮겨 닿는 중</b>' : ''), i ? 'R' : 'L', dx); });
  // 목표 자리의 반응(p3d-0.15.6, 시안): ① 거부 = 그 손 색의 표식이 0.15초 밝게 반응하고 1초쯤 까닭을 보인다(손은 그대로 붙어 있다 — 손을 떼었다 다시 잡는 몸짓을 넣지 않는다) ② 잡은 채의 예약 = 목표에 작은 대기 표식 ③ 계산이 0.1초 넘게 걸리면 "자세 확인 중"(금방 끝나면 깜빡이지 않게 보이지 않는다)
  { const now = sim.tick / 120; let done = false;
    for (let k = K.log.length - 1; k >= 0 && now - K.log[k].t < 1.0 && !done; k--) { const e = K.log[k]; if (e.type !== 'reject' || e.limb !== 'hand') continue; const w = HAND_WHY(e.why); let tr = null; for (let j = k - 1; j >= 0 && e.t - K.log[j].t < 3; j--) if (K.log[j].type === 'try' && K.log[j].limb === 'hand' && K.log[j].i === e.i && K.log[j].p) { tr = K.log[j]; break; }
      if (w && tr) { put(fbTag, new THREE.Vector3(...tr.p), `⤬ <b>막힘</b> · ${w[0]}`, (e.i ? 'R' : 'L') + (now - e.t < 0.15 ? ' flash' : ''), 14); done = true; } }
    if (!done) for (const h of K.hands) { if (h.planWait && h.planWait.t > 12) { put(fbTag, new THREE.Vector3(...h.planWait.p), '… 자세 확인 중', h.i ? 'R' : 'L', 14); break; } if (h.st === 'hold' && h.arm) { put(fbTag, new THREE.Vector3(...h.arm.p), `◌ ${h.i ? '오른손' : '왼손'} · 닿으면 잡아요.`, h.i ? 'R' : 'L', 14); break; } } }
  const nearF = K.feet.every(f => f.st !== 'free') && (() => { const a = screenOf(K.feet[0].p), b = screenOf(K.feet[1].p); return Math.abs(a.y - b.y) < 22 && Math.abs(a.x - b.x) < 150; })();
  K.feet.forEach((f, i) => { const n = i ? '오른발' : '왼발', dx = nearF && !i ? -112 : 10; if (f.st === 'plant' && !(f.auto && f.box.kind === 'floor' && !DIAG)) put(tags[2 + i], f.p, (f.loadS || 0) > 0.05 ? `▲ ${n} 디딤${LOADT(f, false)}` : `△ ${n} 닿아만 있음`, i ? 'R' : 'L', dx); else if (f.st === 'move') put(tags[2 + i], f.p, `→ ${n} 보내는 중${f.byAssist ? '(보조)' : ''}`, i ? 'R' : 'L', dx); });
  // 미리보기: 겨눈 자리를 지금 자세에서 잡을(디딜) 수 있는지. 실제 판정과 같은 함수. 몸이 움직이는 중이면 확정처럼 보이지 않게 "?"를 붙인다
  const tip = (html, x, y) => { const d = tags[4]; d.style.display = 'block'; d.className = 'tag pv'; d.innerHTML = html; const w = d.offsetWidth, h = d.offsetHeight, maxX = innerWidth - (help.offsetWidth + 22) - w; d.style.left = `${Math.max(6, Math.min(x + 16, maxX > 6 ? maxX : innerWidth - w - 6))}px`; d.style.top = `${Math.max(6, Math.min(y - h - 26 > 6 ? y - h - 26 : y + 22, innerHeight - h - 6))}px`;
    // 상태 판·조작표와 겹치면(p3d-0.15.5) 꼬리표만 옮긴다 — 겨눈 자리·판정은 그대로다. 먼저 겨눈 점의 아래쪽, 그래도 겹치면 판의 오른쪽·아래
    const ov = el => { const a = d.getBoundingClientRect(), b = el.getBoundingClientRect(); return el.style.display !== 'none' && a.left < b.right + 6 && a.right > b.left - 6 && a.top < b.bottom + 6 && a.bottom > b.top - 6; };
    if (ov(hud) || ov(help)) { d.style.top = `${Math.min(y + 22, innerHeight - h - 6)}px`; if (ov(hud)) { const b = hud.getBoundingClientRect(); if (b.right + 10 + w < innerWidth - 6) d.style.left = `${b.right + 10}px`; else d.style.top = `${Math.min(b.bottom + 10, innerHeight - h - 6)}px`; } if (ov(help)) { const b = help.getBoundingClientRect(); d.style.top = `${Math.min(b.bottom + 10, innerHeight - h - 6)}px`; } } };
  if (viewMode) { if (input.st.has) tip('시점 보기 모드 · 조작 멈춤', input.st.mx, input.st.my); return; }
  const foot = wantsFoot(), a = foot ? aimPoint() : handPoint(); if (!a) return;
  const sa = screenOf(a), P = [0, 1].map(i => (foot ? probeFoot : probeHand)(sim, i, a)), g = P.find(x => x.grip);
  if (!g && !foot) return; // 턱이 아닌 곳을 겨눌 때는 손 미리보기를 띄우지 않는다(눌렀을 때의 거부 까닭은 기록에 남는다)
  if (g) { mark.position.set(...g.grip); mark.visible = true; mark.material.color.set(P.some(x => x.ok) ? (foot ? '#7be08a' : '#e4ebf1') : '#ffb35c'); }
  // 단추 이름표(임시 모양, GPT 답): 발 선택을 누르고 있으면 같은 단추의 이름이 왼손·오른손 → 왼발·오른발로 바뀐다. 키 설정에서 읽는다(이름을 코드에 고정해 쓰지 않는다)
  const cap = id => { const bd = BIND.find(x => x.id === id); return bd && bd.keys[0] ? `<span style="display:inline-block;padding:0 5px;margin-right:4px;border:1px solid ${foot ? '#e0a94f' : '#8fa3b5'};border-radius:4px;font-size:11px;color:${foot ? '#ffd58a' : '#cfd9e2'}">${keyName(bd.keys[0])}</span>` : ''; };
  // 손 미리보기의 문구(p3d-0.15.2, GPT의 0.15.1 재검토의 표 — 임시): 미리보기는 지금 자세의 한 장면으로 본 것이라 "닿음"이라 해도 뻗는 동안 막히거나 버티던 손이 풀릴 수 있다(잰 것: 67 가운데 16).
  //   그래서 성공을 약속하는 말("닿음", "다가가거나 뛰면 닿음")을 쓰지 않는다. 뻗어 볼 수 있음 = "뻗어 보기", 거리가 모자람 = "몸 위치를 바꿔 시도", 길·제 몸·관절에 막힘 = "현재 자세에서 막힘". 자세한 까닭과 cm는 진단(I)에서만.
  //   발 미리보기는 그대로다. 표식 색도 확정 성공처럼 보이는 초록을 쓰지 않는다(뻗어 보기 = 밝은 회색)
  const act = x => (foot ? (x.verdict === 'near' || /닿지 않음/.test(x.why) ? '조금 더 가까이' + (DIAG ? ` (${x.why})` : '') : x.why) : (x.verdict === 'near' ? '몸 위치를 바꿔 시도' : '현재 자세에서 막힘') + (DIAG ? ` (${x.why})` : ''));
  const line = (x, n) => `${x.ok ? (foot ? '●' : '→') : x.short !== undefined ? '○' : '✕'} ${n} ${x.ok ? (foot ? '디딜 수 있음' : '뻗어 보기' + (DIAG && x.assist ? ' (잡기 보정)' : '')) : act(x)}${x.sure === false ? ' <i>? 지금 자세 기준</i>' : ''}`;
  tip((g ? `<b>${g.name}</b>${g.kind ? (g.kind === 'top' ? ' 윗면' : ' 벽면') : ''}<br>` : '') + (P[0].why === P[1].why && !P[0].ok && !g ? `✕ ${P[0].why}` : cap('limbL') + line(P[0], foot ? '왼발' : '왼손') + '<br>' + cap('limbR') + line(P[1], foot ? '오른발' : '오른손')), sa.front ? sa.x : input.st.mx, sa.front ? sa.y : input.st.my);
}
function stateName() {
  if (sim.climb.on) { const K = sim.climb, h = K.hands.filter(x => x.st === 'hold').length, f = K.feet.filter(x => x.st === 'plant' && x.load > 0.05).length; return h === 2 ? (f ? '두 손 + 발' : '두 손 매달림') : h === 1 ? (f ? '한 손 + 발' : '한 손 매달림') : '손 없이 발로 섬'; }
  if (!body.onGround) return body.vel.y > 0 ? '공중(오름)' : '공중(내림)';
  if (body.push) return '밀기';
  if (body.charging) return `점프 준비 ${Math.round(body.charge / PHY.CHARGE_MAX * 100)}%`;
  if (sim.motion.prm.land > 0.25) return '착지';
  const v = Math.hypot(body.vel.x, body.vel.z);
  if (sim.motion.prm.crouch > 0.5) return v > 0.12 ? '웅크려 걷기' : '웅크림';
  return v < 0.12 ? '대기' : sim.motion.prm.runW > 0.5 ? '달리기' : '걷기';
}
// 개발 항목의 설정(잡기 보정·자세 보조·누르기·전신 연결): 개발 모드에서는 모두 보인다. 그 밖에는 기본값(앞의 셋 켬·전신 연결 끔)과 다른 것만 굵게 보인다 — 키가 숨어 있어도 기본이 아닌 상태로 하고 있다는 것은 알 수 있게(p3d-0.15.3, 임시)
// p3d-0.15.4(GPT의 0.15.3 검토 M4·UI 시안 — 사용자 확정 아님): 저장한 설정이 아니라 **실제로 적용되는 것**을 보인다(sim.effect = 계산과 같은 식). 전신 연결은 누르기를 포함하므로 누르기 설정이 꺼져 있어도 "누르기 끔"이라고 쓰지 않는다
const DEV_OPT = [['grabAssist', '잡기 보정', true], ['poseAssist', '자세 보조', true], ['press', '누르기', true], ['linkPose', '전신 연결(시험)', false], ['planReach', '뻗기 전 검사(시험)', false], ['autoGuard', '자동 이동 보호(시험)', false]];
const devState = k => { const e = sim.effect(); return k === 'linkPose' ? (e.link ? '켬 · 누르기 포함' : OPT.linkPose ? '끔(자세 보조가 꺼져 있어 적용되지 않음)' : '끔') : k === 'press' ? (e.pressByLink ? '· 전신 연결에 포함' : e.press ? '켬' : '끔') : OPT[k] ? '켬' : '끔'; };
const devDiff = ([k, , d]) => (k === 'press' ? sim.effect().press !== d : k === 'linkPose' ? !!OPT.linkPose !== d : !!OPT[k] !== d);
const devLine = () => (OPT.dev ? DEV_OPT.map(([k, n]) => ` &nbsp; ${n} ${devState(k)}`).join('') + ' &nbsp; <span class=badge>개발 모드</span>' : DEV_OPT.filter(devDiff).map(([k, n]) => ` &nbsp; <b>${n} ${devState(k)}</b>`).join(''));
// 몸 위로(W)가 멈춘 까닭(climb.js의 K.upWhy — 임시 문구. GPT의 0.15.2 검토: 막히면 정지하고 이유를 보인다)
// 몸 위로(W)가 멈춘 까닭의 문구(p3d-0.15.4, GPT 시안 `ui_wording.json` — 사용자 확정 아님): 원인 한 줄 + 힌트 한 줄. 실제 조건 = leg 디딘 다리의 골반–발목이 다리 길이의 97% · top 누르는 팔이 닿는 높이(손 + 팔 길이의 몫) · fold 어깨–손이 접힘 한계 + 3cm · gap 누르기 끔에서 어깨가 손 높이에 온 것 · jam 잡은 팔이 제 몸에 걸림
const UP_KO = { leg: ['다리가 뻗는 한계에 닿았어요.', '손이나 발 위치를 바꿔 보세요.'], top: ['현재 손 위치로는 더 밀어 올리기 어려워요.', '손이나 발 위치를 바꿔 보세요.'], fold: ['팔이 접혀 더 올라가기 어려워요.', '손을 옮기거나 몸 위치를 바꿔 보세요.'], gap: ['현재 손 위치에서 더 올라가기 어려워요.', '손을 옮겨 다시 시도해 보세요.'], jam: ['팔이 몸에 막혔어요.', '몸이나 손 위치를 바꿔 보세요.'] };
const sideKo = n => (/왼/.test(n || '') ? '왼발' : /오른/.test(n || '') ? '오른발' : '발'), FC_KO = { rise: '몸이 올라가 다리가 닿지 않음', reach: '몸이 옮겨 가 다리가 닿지 않음', joint: '다리가 꺾이는 한계', physics: '디딘 자리가 버티지 못함' };
// 발 기록(GPT 시안): 일반 화면 = 무슨 일이 났는지 한 줄(지지가 풀린 것과 몸이 떨어지는 것을 구분한다), 개발 모드 = 홀드 이름·누가 디뎠는지·까닭까지
const footLog = e => (e.type === 'lift' && e.placed === 'user' && e.fcause !== 'command' ? `${sideKo(e.name)} 지지가 풀렸어요.${OPT.dev ? ` <span class=dim>${e.hold} · 직접 선택 · ${FC_KO[e.fcause] || e.why}</span>` : ''}` : e.type === 'step' && e.assist ? `발 보조 · ${sideKo(e.name)}을 디뎠어요.${OPT.dev ? ` <span class=dim>${e.box} · 발 보조</span>` : ''}` : null);
// 일반 화면의 손 기록(p3d-0.15.6): 거부 = 까닭 + 힌트, 예약 = "닿으면 잡아요." 같은 거부를 이어 누르면 줄을 쌓지 않고 횟수만 붙인다. 개발 모드에서는 원래 문구(까닭·cm)를 그대로 보인다
const handLog = e => { if (OPT.dev || e.limb !== 'hand') return ''; if (e.type === 'arm') return `${e.name} · 닿으면 잡아요.`; if (e.type !== 'reject') return ''; const w = HAND_WHY(e.why); if (!w) return ''; const L = sim.climb.log; let n = 0; for (let k = L.length - 1; k >= 0; k--) { const x = L[k]; if (x.type === 'try' || x.type === 'plan' || x.type === 'guard') continue; if (x.type === 'reject' && x.limb === 'hand' && x.i === e.i && HAND_WHY(x.why) && HAND_WHY(x.why)[0] === w[0]) n++; else break; }
  return `${e.name} · <span class=warn>${w[0]}</span>${w[1] ? ' ' + w[1] : ''}${n > 1 ? ` (${n}번)` : ''}`; };
const LOG_KO = { cancel: '취소', grab: '잡음', reject: '거부', release: '놓음', slip: '놓침', step: '디딤', lift: '발이 떨어짐', enter: '벽 등반 시작', exit: '벽 등반 끝', bump: '부딪힘', push: '도약 힘주기 시작', pushEnd: '도약 힘주기 끝', assist: '잡기 보정', arm: '예약', auto: '자동', wstop: '몸 위로 멈춤' };
// 임시 표시(진단 정보): 최근 300프레임의 실행 성능. 게임 시간 ÷ 실제 시간이 100%보다 낮으면 게임이 실제보다 느리게 가고 있는 것이다(느리게 ×0.25를 켜면 25%)
function perfLine() { const w = perfWin(); return w ? `<div class=dim>실행(최근 ${w.n}프레임) ${w.fps.toFixed(0)} fps · 가장 긴 프레임 ${w.maxMs.toFixed(0)}ms · CPU 계산 시간 ${w.stepMs.toFixed(1)}ms/프레임 · 화면 갱신 처리 시간 ${w.drawMs.toFixed(1)}ms/프레임(그리기 호출까지. 그래픽 카드의 전체 비용이 아니다) · 게임 시간 ÷ 실제 시간 ${(w.simRatio * 100).toFixed(0)}% · 버린 시간 ${w.drop.toFixed(2)}초(전체 ${PERF.drop.toFixed(2)}초)</div>` : ''; }
function drawHud(fps) {
  if (gal.on) { const c = galClip(); hud.innerHTML = `<div class=ver>3D 모션 시제품 ${VERSION} · ${BODY === 'old' ? '옛 몸(자작)' : '사람형 몸(Quaternius 마네킹, CC0)'}</div><div><b>동작 보기</b> ${gal.i + 1} / ${gal.names.length} &nbsp; <b>${gal.names[gal.i]}</b></div><div><b>분류</b> ${c.cat} &nbsp; <b>지형</b> ${KIND_KO[c.kind] || '-'}${gal.props ? '' : '(숨김)'}${gal.built && gal.built.info.removed ? ` · 맞지 않아 뺀 조각 ${gal.built.info.removed}개` : c.kind !== 'ground' && gal.built && !gal.built.info.pieces ? ' · 조각 없음(손발 자리로는 지형을 정하지 못함)' : ''} &nbsp; <b>시각</b> ${Math.min(gal.t, c.dur).toFixed(2)} / ${c.dur.toFixed(2)}초</div><div class=slow>시연 · 물리 판정 없음</div><div class=dim>받은 동작을 이 캐릭터로 옮겨 지형에 맞춰 튼 것입니다. 잡을 수 있는지·버티는지는 따지지 않습니다(게임 계산은 멈춤).<br>지형은 이 동작에서 손발이 닿는 자리로 만든 임시 조각입니다. 점 = 닿아 있는 손발(붉은색 왼쪽, 푸른색 오른쪽)</div><div class=${slow ? 'slow' : 'real'}>${slow ? '느리게 ×0.25' : '실제 속도'}</div>`; return; }
  const v = Math.hypot(body.vel.x, body.vel.z), st = sim.motion.stats, K = sim.climb;
  const C = sim.clip, cap = C && C.w > 0.5, footName = (L, i) => cap ? (C.feet[i].step ? '고쳐 디딤' : C.feet[i].lock ? (C.feet[i].kind === 'heel' ? '디딤(뒤꿈치)' : '디딤(발끝)') : '옮기는 중') : L.mode === 'plant' ? (L.heel > 0 ? '디딤(뒤꿈치 듦)' : '디딤') : L.mode === 'swing' ? '옮기는 중' : '공중';
  // p3d-0.15.5(GPT의 0.15.4 화면 검토 — 시범 값, 사용자 확정 아님): 일반 화면의 상태 판은 폭 320px, 판 번호 · 코스 줄 · 문맥과 접촉 · 중요한 안내 · 마지막 기록 한 줄만. 몸·자세 방식·동작·설정 전체·기록 다섯 줄은 개발 모드(F2)에서 본다
  hud.classList.toggle('dev', !!OPT.dev);
  hud.innerHTML = (!OPT.dev ? `<div class=ver>${VERSION}${SW_URL.length ? ' · 비교 스위치 ' + SW_URL.join(',') : ''}</div>` : `<div class=ver>3D 모션 시제품 ${VERSION}${OLDRISE_URL ? ' · W 옛 빠르기(?oldrise)' : ''} · ${BODY === 'old' ? '옛 몸(자작)' : '사람형 몸(Quaternius 마네킹, CC0) · 자세 ' + ({ fb: '전신 자세 풀이(O = 옛 규칙과 바꾸기)', rule: '옛 규칙 0.10.4(O = 전신 자세 풀이)', base: '0.10.0', solve: '함께 고르기(실험)', ref: '참고 자세(실험)' })[POSTURE] + (globalThis.GRIP_FRAME ? ' · 손 접촉 틀(실험)' : '')}${SW_URL.length ? ' · 비교 스위치 ' + SW_URL.join(',') : ''}</div>`)
    + (!OPT.dev ? '' : K.on ? `<div><b>동작</b> 벽 등반(IK) <span class=dim>· 지상 동작: ${sim.clipSet && sim.useClip ? '캡처' : '자작'}</span></div>` : `<div><b>모션</b> ${!sim.clipSet ? '자작(코드로 만든 동작)' : sim.useClip ? `캡처 동작${cap ? '' : ' → 지금은 자작(웅크림·점프·착지)'}` : '자작(코드로 만든 동작)'}</div>`)
    + gymLine() + `<div><b>문맥</b> <span class=ctx>${viewMode ? '시점 보기 · 조작 멈춤' : K.on ? '벽 등반' : '지상 조작'}</span> &nbsp; <b>상태</b> ${stateName()}${DIAG ? ` &nbsp; <b>속도</b> ${(K.on ? body.vel.length() : v).toFixed(2)} m/s` : ''}</div>`
    + `<div class=dim>${OPT.dev ? `손 조작 ${OPT.handMode === 2 ? '2 · 누르는 동안 뻗고 떼면 잡기' : '1 · 눌러 보내기'} &nbsp; 발 보조 ${OPT.footAssist ? '켬' : '끔'} &nbsp; 쉬운 조작 ${OPT.easy ? '켬' : '끔'} &nbsp; 자동 몸 맞추기 ${OPT.easy && OPT.autoBody ? '켬' : '끔'}` : [OPT.handMode === 2 ? '손 조작 2' : '', OPT.footAssist ? '발 보조 켬(자동 발)' : '', OPT.easy ? '' : '쉬운 조작 끔', OPT.easy && !OPT.autoBody ? '자동 몸 맞추기 끔' : ''].filter(Boolean).join(' &nbsp; ')}${devLine()}${OPT.keepHold ? ' &nbsp; <b>비교: 보조가 잡은 손을 놓지 않음</b>' : ''}${OPT.wallRest ? ' &nbsp; <b>실험: 벽 딛기 켬</b>' : ''}${OPT.oldPose ? ' &nbsp; <b>비교: 옛 몸 자세(0.8.8)</b>' : ''}${FOOTX ? ' &nbsp; <b>발 선택 = X(시범 프로필)</b>' : ''}${MANUAL ? ' &nbsp; <b>수동 발 프로필</b>(저장하지 않음)' : ''}</div>`
    + (K.on && K.upWhy && UP_KO[K.upWhy] ? `<div class=warn>${UP_KO[K.upWhy][0]} <span class=dim>${UP_KO[K.upWhy][1]}</span></div>` : '')
    + (K.on ? `<div><b>손</b> ${K.hands.map((h, i) => `${i ? '오른손' : '왼손'} ${h.st === 'hold' ? `잡음(${h.edge.box.name}${DIAG ? `, 몸무게의 ${(h.loadS || 0).toFixed(1)}배` : ''})` : h.st === 'reach' ? '보내는 중' : '놓음'}`).join(' · ')}</div><div><b>발</b> ${K.feet.map((f, i) => `${i ? '오른발' : '왼발'} ${f.st === 'plant' ? ((f.loadS || 0) > 0.05 ? `디딤(${f.box.name}${DIAG ? `, ${(f.loadS || 0).toFixed(1)}배` : ''})` : `닿아만 있음(${f.box.name})`) : f.st === 'move' ? '보내는 중' : '떠 있음'}`).join(' · ')}</div>`
      : `<div><b>발</b> ${sim.motion.legs.map((L, i) => `${L.s === 'L' ? '왼발' : '오른발'} ${footName(L, i)}`).join(' · ')}</div>`)
    + `<div class=log>${K.log.filter(e => e.type !== 'try' && (OPT.dev || !/^(plan|guard)$/.test(e.type)) && !(e.box === '바닥' && e.auto) && !(e.type === 'lift' && /범위/.test(e.why) && e.placed !== 'user')).slice(OPT.dev ? -5 : -1).map(e => `<span class=t>${e.t.toFixed(2)}초</span> ${footLog(e) || handLog(e) || `${LOG_KO[e.type] || e.type}${e.name ? ' ' + e.name : ''}${e.box ? ' · ' + e.box : ''}${e.why ? ' · ' + (e.type === 'wstop' ? (UP_KO[e.why] ? UP_KO[e.why][0] : e.why) : e.why) : ''}${e.keptGrip ? ' 현재 잡기를 유지했어요.' : ''}`}`).join('<br>')}</div>`
    + (DIAG ? perfLine() : '')
    + (DIAG ? `<div class=dim>지지 구간 최대 이탈 ${(st.stanceMaxDev * 1000).toFixed(2)} mm · 다리 뻗음 최대 ${(st.maxRatio * 100).toFixed(0)}% · ${fps.toFixed(0)} fps</div>` : '')
    + `<div class=${slow ? 'slow' : 'real'}>${slow ? '느리게 ×0.25' : '실제 속도'}</div>`;
}

// 실행 성능(p3d-0.8.8, 임시 표시 — 진단 정보 I 키): 실제로 흐른 시간과 게임이 계산한 시간, 0.1초 제한으로 버린 시간, 프레임 간격, 계산·그리기에 든 시간을 따로 센다
const PERF = { frames: 0, real: 0, sim: 0, drop: 0, maxMs: 0, long: 0, stepMs: 0, drawMs: 0, steps: 0, win: [] };
const perfWin = () => { const w = PERF.win, n = w.length, sum = k => w.reduce((a, f) => a + f[k], 0); return n ? { n, fps: n / Math.max(1e-6, sum(0)), maxMs: Math.max(...w.map(f => f[0])) * 1000, simRatio: sum(1) / Math.max(1e-6, sum(0)), stepMs: sum(2) / n, drawMs: sum(3) / n, drop: sum(4) } : null; };
let fpsS = 60, tickInput = null; // tickInput = 시험이 계산 걸음마다 넣는 입력(걸음 번호 → 입력)
// 한 화면 프레임: ① 누적 시간만큼 고정 걸음 계산(이동·상태·자세 모두 sim.step) ② 확정된 자세를 그린다. 실제 루프와 시험(simFrames)이 같이 쓴다
function frameCore(dtR, inp, onTick) {
  if (gal.on) { gal.t += dtR * (slow ? 0.25 : 1); if (gal.t > galClip().dur + 0.5) gal.t = 0; galPose(); updateCamera(dtR); draw(); drawHud(fpsS); return; } // 동작 보기: 게임 계산을 하지 않는다
  acc += dtR * (slow ? 0.25 : 1); const p0 = performance.now(); let nStep = 0;
  while (acc >= PHY.DT) { physStep(tickInput ? tickInput(sim.tick) : inp); acc -= PHY.DT; nStep++; gymStep(PHY.DT); if (onTick) onTick(); }
  if (body.pos.y < -8) reset(); // 바닥 밖으로 떨어지면 처음 자리로
  const p1 = performance.now();
  updateCamera(dtR); draw(); drawHud(fpsS); // 그리기는 계산 상태를 바꾸지 않는다
  PERF.cur = [nStep * PHY.DT, p1 - p0, performance.now() - p1, nStep];
}
function frame(now) {
  const raw = (now - last) / 1000, dtR = Math.min(0.1, raw); last = now; fpsS += (1 / Math.max(dtR, 1e-3) - fpsS) * 0.05; PERF.cur = null;
  if (lostFocus) { cancelHolds(lostFocus); lostFocus = false; }
  if (input.wasPressed('viewMode')) { viewMode = !viewMode; cancelHolds('viewMode'); }
  input.setMode(gal.on ? 'gallery' : viewMode ? 'view' : sim.climb.on ? 'wall' : 'ground'); drawHelp();
  if (input.wasPressed('reset')) reset();
  if (input.wasPressed('wallStart')) wallStart();
  if (input.wasPressed('handMode')) { cancelHolds('handMode'); OPT.handMode = OPT.handMode === 2 ? 1 : 2; saveOpt(); }
  // 보조를 켜고 끄는 것은 "보조 다시 시작"의 뜻이다: 직접 뗀 발의 표시를 지운다(그 밖에는 그 발을 다시 보낼 때만 지워진다)
  if (input.wasPressed('poseAssist')) { OPT.poseAssist = !OPT.poseAssist; syncOpt(); saveOpt(); }
  if (input.wasPressed('press')) { OPT.press = !OPT.press; syncOpt(); saveOpt(); }
  if (input.wasPressed('autoBody')) { OPT.autoBody = !OPT.autoBody; syncOpt(); saveOpt(); }
  if (input.wasPressed('easy')) { OPT.easy = !OPT.easy; syncOpt(); aim.resync = true; saveOpt(); }
  if (input.wasPressed('grabAssist')) { OPT.grabAssist = !OPT.grabAssist; syncOpt(); saveOpt(); }
  if (input.wasPressed('footAssist')) { OPT.footAssist = !OPT.footAssist; OPT.footAssistSet = true; userSet('footAssist'); syncOpt(); pending.push({ type: 'assistResume' }); saveOpt(); }
  if (input.wasPressed('wallRest')) { OPT.wallRest = !OPT.wallRest; syncOpt(); pending.push({ type: 'assistResume' }); saveOpt(); }
  if (input.wasPressed('diag')) { OPT.diag = !OPT.diag; syncOpt(); saveOpt(); }
  // 실험 비교(p3d-0.9.0): 몸통 자세의 층을 끄면 0.8.8의 몸통·무릎·발의 길 그대로다. 붙은 손발은 건드리지 않는다(골반과 무릎이 스프링으로 옮겨 간다)
  if (input.wasPressed('poseMode')) { POSTURE = POSTURE === 'fb' ? 'rule' : 'fb'; applyPosture(); }
  if (input.wasPressed('helpAll')) { OPT.helpFold = !OPT.helpFold; OPT.helpFoldSet = true; saveOpt(); }
  if (input.wasPressed('devMode')) { OPT.dev = !OPT.dev; syncOpt(); saveOpt(); }
  if (input.wasPressed('linkPose')) { OPT.linkPose = !OPT.linkPose; userSet('linkPose'); syncOpt(); saveOpt(); }
  // 몸 좌우 입력의 기준: 화면에서 보이는 오른쪽. 시점이 몸의 옆(벽과 나란한 쪽)에 가까워 불안정할 때는 마지막 부호를 그대로 쓴다
  { const cr = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion), d = -Math.cos(body.yaw) * cr.x + Math.sin(body.yaw) * cr.z; if (Math.abs(d) > 0.3) cxSign = d > 0 ? 1 : -1; }
  updateAim();
  if (!gal.on && !paused) readCommands();
  if (input.wasPressed('bones')) { skel.visible = !skel.visible; rig.mesh.material.wireframe = skel.visible; if (human) for (const m of human.meshes) m.material.wireframe = skel.visible; }
  if (input.wasPressed('slow')) slow = !slow;
  if (input.wasPressed('motionMode') && sim.clipSet) sim.useClip = !sim.useClip;
  if (input.wasPressed('gallery') && GALLERY) galOpen(!gal.on);
  if (gal.on) { if (input.wasPressed('galNext')) galGo(1); if (input.wasPressed('galPrev')) galGo(-1); if (input.wasPressed('galCatNext')) galGo(1, true); if (input.wasPressed('galCatPrev')) galGo(-1, true); if (input.wasPressed('galProps')) gal.props = !gal.props; }
  if (!paused) frameCore(dtR, readInput()); else draw();
  // 실행 성능 기록: 게임 계산을 한 프레임만 센다(멈춤·동작 보기는 빼고). 버린 시간 = 프레임 간격이 0.1초를 넘어 계산에 넣지 않은 몫
  if (PERF.cur) { const c = PERF.cur, lost = raw - dtR; PERF.frames++; PERF.real += raw; PERF.sim += c[0]; PERF.drop += lost; PERF.maxMs = Math.max(PERF.maxMs, raw * 1000); if (raw > 0.025) PERF.long++; PERF.stepMs += c[1]; PERF.drawMs += c[2]; PERF.steps += c[3]; PERF.win.push([raw, c[0], c[1], c[2], lost]); if (PERF.win.length > 300) PERF.win.shift(); }
  drawTags(); // 시험이 걸음을 직접 진행하는 동안 화면 쪽 계산은 멈춘다
  input.endFrame(); requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

// 시험용 창구: 입력을 넣고 물리 걸음을 직접 진행한다(그림과 상관없이 같은 결과)
document.title = `등반 3D 모션 시제품 ${VERSION}${CLIPS ? ' · 캡처 동작' : ''}${BODY === 'old' ? ' · 옛 몸' : ''}${POSTURE !== 'fb' ? ' · 자세 ' + POSTURE : ''}${globalThis.GRIP_FRAME ? ' · grip frame' : ''}`;
window.__p3 = {
  perf: reset => { const r = { 프레임: PERF.frames, 실제_초: +PERF.real.toFixed(3), 게임_초: +PERF.sim.toFixed(3), 게임_실제_비: +(PERF.sim / Math.max(1e-6, PERF.real)).toFixed(4), 버린_초: +PERF.drop.toFixed(3), 평균_fps: +(PERF.frames / Math.max(1e-6, PERF.real)).toFixed(1), 가장_긴_프레임_ms: +PERF.maxMs.toFixed(1), 프레임_25ms_넘음: PERF.long, 계산_ms_프레임당: +(PERF.stepMs / Math.max(1, PERF.frames)).toFixed(3), 계산_ms_걸음당: +(PERF.stepMs / Math.max(1, PERF.steps)).toFixed(4), 그리기_ms_프레임당: +(PERF.drawMs / Math.max(1, PERF.frames)).toFixed(3), 느리게: slow }; if (reset) Object.assign(PERF, { frames: 0, real: 0, sim: 0, drop: 0, maxMs: 0, long: 0, stepMs: 0, drawMs: 0, steps: 0, win: [] }); return r; },
  // posture: 시험용 자세 규칙 바꾸기(p3d-0.10.1)
  VERSION, BIND, conflicts, PHY, rig, posture(p) { sim.opt.posture = p; sim.ref = p === 'ref' ? REFIDX : null; return !!(p !== 'ref' || (REFIDX && REFIDX.frames)); },
  gestures: () => gest.log.map(g => ({ ...g })), aimHeld: () => aim.held.map(v => !!v),
  body: () => ({ pos: body.pos.toArray(), vel: body.vel.toArray(), yaw: body.yaw, onGround: body.onGround, charge: body.charge, t: body.t, events: body.events.slice() }),
  state: stateName, stats: () => ({ ...sim.motion.stats, stances: sim.motion.stats.stances.slice() }), resetStats: () => { Object.assign(sim.motion.stats, { maxSlide: 0, slideSum: 0, slideN: 0, maxRatio: 0, kneeFlip: 0, below: 0, stances: [], stanceMaxDev: 0, stanceMaxPath: 0 }); for (const L of sim.motion.legs) L.stance = null; },
  openStances: () => sim.motion.legs.filter(L => L.stance).map(L => ({ leg: L.s, maxDev: L.stance.maxDev, path: L.stance.path, kinds: L.stance.kinds.join('>') })),
  legs: () => sim.motion.legs.map((L, i) => sim.clip && sim.clip.on ? { s: L.s, mode: sim.clip.feet[i].lock ? 'plant' : 'swing', heel: sim.clip.feet[i].kind === 'toe' ? 1 : -1, slide: L.slide, clip: true } : { s: L.s, mode: L.mode, heel: L.heel, slide: L.slide }), prm: () => ({ ...sim.motion.prm, phase: sim.motion.phase }),
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
    const snap = () => { if (sim.tick % every) return; out.push({ k: sim.tick, vel: body.vel.toArray(), climb: JSON.stringify(limbState(sim.climb)), pos: body.pos.toArray(), bones: rig.list.map(b => { b.updateWorldMatrix(true, false); return new THREE.Vector3().setFromMatrixPosition(b.matrixWorld).toArray(); }), modes: sim.motion.legs.map(L => L.mode), plants: sim.motion.legs.map(L => L.plant.toArray()) }); };
    try { for (const d of frameDts) { if (sim.tick >= inputs.length) break; frameCore(d, null, snap); } } finally { tickInput = null; acc = 0; } return out; },
  // 시험용 한 장: 시점을 몸 기준으로 바로 놓고 그린다(멈춘 채 찍을 때). off = 몸이 보는 쪽 기준 시점 각도
  // 시험·영상용(p3d-0.15.5, GPT의 0.15.4 검토 — "최종 메시 화면 범위로 검사"): 지금 그려진 몸 메시(스키닝을 적용한 꼭짓점 전부)의 화면 범위 [왼, 위, 오른, 아래](CSS 픽셀). 옛 몸은 뼈대의 상자로 잰다
  bodyRect() { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0; const v = new THREE.Vector3(), put = () => { const q = v.project(camera), x = (q.x + 1) / 2 * innerWidth, y = (1 - q.y) / 2 * innerHeight; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); n++; };
    if (human) { human.root.updateMatrixWorld(true); for (const m of human.meshes) { const P = m.geometry.attributes.position; for (let i = 0; i < P.count; i++) { m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld); put(); } } }
    else { rig.root.updateMatrixWorld(true); for (const k in rig.bones) { rig.bones[k].getWorldPosition(v); put(); } }
    return { r: [x0, y0, x1, y1], n, vw: innerWidth, vh: innerHeight }; },
  shot(o = {}) { cam.yaw = body.yaw + (o.off ?? Math.PI / 2); cam.pitch = o.pitch ?? 0.1; cam.dist = cam.eff = o.dist ?? 3.2; cam.follow = null; cam.dirEff = null; if (o.at) cam.target.set(o.at[0], o.at[1], o.at[2]); else cam.target.set(body.pos.x, body.pos.y + (o.h ?? 0.95), body.pos.z); updateCamera(0); draw(); drawHud(fpsS); },
  boneNames: () => rig.list.map(b => b.name),
  galleryList: () => GALLERY ? gal.names.map(n => ({ name: n, cat: GALLERY.clips[n].cat, kind: GALLERY.clips[n].kind, dur: GALLERY.clips[n].dur, holds: (GALLERY.clips[n].holds || []).length })) : null,
  galleryInfo: () => gal.built ? { ...gal.built.info, name: gal.names[gal.i], inside: (() => { stage.updateMatrixWorld(true); const h = rig.bones.hips.getWorldPosition(new THREE.Vector3()); let n = 0; stage.traverse(o => { if (o.isMesh && o.geometry.type === 'BoxGeometry' && new THREE.Box3().setFromObject(o).expandByScalar(-0.03).containsPoint(stage.worldToLocal(h.clone()).applyMatrix4(stage.matrixWorld))) n++; }); return n > 0; })(), grips: gal.built.holds.filter(h => h.grip).length, palmErr: ['L', 'R'].map((s, e) => { const h = gal.built.holds.find(h => h.e === e && h.grip && gal.t * gal.built.clip.fps >= h.f0 && gal.t * gal.built.clip.fps <= h.f1); return h ? rig.bones[`hand.${s}`].localToWorld(new THREE.Vector3(0, -0.08, 0)).distanceTo(galToWorld(h.grip)) : null; }) } : null,
  galleryProps: v => { gal.props = v; },
  gallery(name, t = 0, o = {}) { if (!GALLERY) return false; if (name === null) { galOpen(false); return true; } if (!gal.on) galOpen(true); gal.i = Math.max(0, gal.names.indexOf(name)); gal.t = t; galPose(); const h = rig.bones.hips.getWorldPosition(new THREE.Vector3()); cam.yaw = gal.yaw + (o.off ?? Math.PI / 2); cam.pitch = o.pitch ?? 0.1; cam.dist = cam.eff = o.dist ?? 3.4; cam.follow = null; cam.dirEff = null; cam.target.set(o.fixed ? gal.origin.x : h.x, (o.fixed ? gal.origin.y + 1.0 : h.y) + (o.up ?? 0.1), o.fixed ? gal.origin.z : h.z); const want = cam.target.clone(); updateCamera(0); cam.target.copy(want); camera.position.copy(cam.target).addScaledVector(cam.dirEff, cam.dist); camera.lookAt(cam.target); draw(); drawHud(fpsS); return true; },
  // 벽 접촉(W2): 상태·기록·명령·미리보기. 시험은 cmd()로 명령을 넣거나 실제 마우스·키 입력을 쓴다
  climb: () => ({ ...limbState(sim.climb), stats: { ...sim.climb.stats }, lean: { ...sim.climb.lean }, yaw: body.yaw, plan: sim.climb.planLast || null }), climbLog: () => sim.climb.log.slice(), CL,
  cmd: c => { pending.push(c); },
  recStart: () => { REC = []; return sim.tick; }, recStop: () => { const r = REC; REC = null; return r; }, tick: () => sim.tick,
  // 영상·시연용: 계산 걸음마다의 입력 목록을 지금부터 차례로 넣는다(실제 화면 루프로 돈다). 끝나면 저절로 풀린다. 스크립트 입력이며 사람 손이 아니다
  script(inputs) { const k0 = sim.tick; tickInput = k => { const i = k - k0; if (i >= inputs.length - 1) tickInput = null; return inputs[Math.min(i, inputs.length - 1)]; }; }, scripting: () => !!tickInput, pending: () => pending.length, probe: (limb, i, p) => (limb === 'foot' ? probeFoot : probeHand)(sim, i, new THREE.Vector3(...p)),
  screenOf: p => screenOf(p), aim: () => { const a = aimPoint(); return a ? a.toArray() : null; }, aimGrip: () => (aim.grip ? aim.grip.toArray() : null), wallStart, gym: () => { const v = courseView(gym), T = v.try; return { course: v.course && v.course.id, phase: v.phase, done: !!(T && T.done), tryId: T ? T.id : 0, clean: !!(T && T.clean), cleanWhy: T ? T.cleanWhy : '', doneT: T ? T.doneT : 0, live: v.live, rec: v.rec, world: WNAME }; },
  opt: o => { if (o) { if (('footAssist' in o && o.footAssist !== OPT.footAssist) || ('wallRest' in o && o.wallRest !== OPT.wallRest)) pending.push({ type: 'assistResume' }); if ('handMode' in o && o.handMode !== OPT.handMode) cancelHolds('handMode'); Object.assign(OPT, o); syncOpt(); helpFor = ''; } return { ...OPT, viewMode, cxSign }; }, setView: v => { viewMode = !!v; }, aimSet: p => { aim.world = p ? new THREE.Vector3(...p) : null; },
  input: () => ({ mode: input.st.mode, view: viewMode, cxSign, down: [...input.down.keys()], read: (() => { const o = override; override = null; const r = readInput(); override = o; return r; })() }),
  setKeys: (id, keys) => { cancelHolds('setKeys'); const r = setKeys(id, keys); helpFor = ''; return r; }, resetKeys: () => { resetKeys(); helpFor = ''; }, tagsText: () => tags.map(d => (d.style.display === 'none' ? '' : d.innerText)),
  hasClips: () => !!sim.clipSet, setMode: m => { if (sim.clipSet) sim.useClip = m === 'clip'; return sim.useClip ? 'clip' : 'proc'; }, mode: () => (sim.useClip ? 'clip' : 'proc'),
  clip: () => sim.clip ? { w: sim.clip.w, on: sim.clip.on, phase: sim.clip.phase, wLoc: sim.clip.wLoc, r: sim.clip.r, stride: sim.clip.stride, feet: sim.clip.feet.map(f => ({ s: f.s, lock: !!f.lock, kind: f.kind, step: !!f.step, off: f.off.length() })) } : null,
  clipInfo: () => sim.clipSet ? Object.fromEntries(Object.entries(sim.clipSet.clips).map(([k, c]) => [k, { src: c.src, n: c.n, dur: c.dur, stride: c.stride, speed: c.speed, duty: c.duty, flight: c.flight }])) : null,
  bonesWorld: () => Object.fromEntries(rig.list.map(b => { b.updateWorldMatrix(true, false); return [b.name, new THREE.Vector3().setFromMatrixPosition(b.matrixWorld).toArray()]; })),
};
