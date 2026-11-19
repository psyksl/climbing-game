// 등반 게임 3D 모션 시제품(W0·W1 첫 판). 실행: climb3d.html을 브라우저로 연다.
// 고정 간격 1/120초로 이동·상태·자세를 모두 계산하고(sim.js), 그림은 확정된 자세를 화면 빠르기대로 보여 주기만 한다.
import * as THREE from 'three';
import { buildCharacter } from './rig.js';
import { makeWorld, buildWorldMeshes, rayHit } from './world.js';
import { PHY } from './controller.js';
import { makeSim } from './sim.js';
import { BIND, conflicts, keyName, makeInput, setKeys, resetKeys, loadKeys } from './input.js';
import { probeHand, probeFoot, limbState, CL } from './climb.js';
import CLIPS from 'clip-data';
import GALLERY from 'gallery-data'; // 동작 보기용 자료(받은 동작 전부를 이 뼈대로 옮긴 값. 있을 때만)
import { poseRaw } from './clipmotion.js';
import { buildProps, makeSwingRope, applyGrips } from './demo.js'; // 캡처 동작 자료(빌드할 때 assets_local/clips.json이 있으면 들어온다. 없으면 null)

export const VERSION = 'p3d-0.5.0';
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
const sim = makeSim(rig, world, CLIPS); let body = sim.body;
loadKeys();
const input = makeInput(renderer.domElement);
const pending = []; // 다음 계산 걸음에 한 번만 들어갈 명령(손발 보내기·놓기)
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
  // 벽 문맥: 몸 옮기기(화면 기준 좌우·위아래). 문맥이 다르면 isDown이 거짓이라 0이다
  return { mx, mz, run: input.isDown('run'), crouch: input.isDown('crouch'), jump: input.isDown('jump'), cx: (input.isDown('bodyR') ? 1 : 0) - (input.isDown('bodyL') ? 1 : 0), cy: (input.isDown('bodyU') ? 1 : 0) - (input.isDown('bodyD') ? 1 : 0) };
}
// 겨눈 곳: 마우스 자리에서 화면 안쪽으로 쏜 선이 지형에 처음 닿는 점(없으면 null)
const ray = new THREE.Raycaster();
function aimPoint() {
  if (!input.st.has) return null;
  ray.setFromCamera(new THREE.Vector2(input.st.mx / innerWidth * 2 - 1, -(input.st.my / innerHeight) * 2 + 1), camera);
  const a = ray.ray.origin, b = a.clone().addScaledVector(ray.ray.direction, 40), t = rayHit(world, a, b);
  return t < 1 ? a.clone().lerp(b, t) : null;
}
function screenOf(p) { const v = (p.isVector3 ? p.clone() : new THREE.Vector3(...p)).project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, front: v.z < 1 }; }
// 손발 명령: 누른 순간 한 번, 겨눈 점과 함께 다음 계산 걸음으로 보낸다. 시점 조작 중에는 wasPressed가 거짓이라 새지 않는다
function readCommands() {
  const foot = input.isDown('footMod');
  for (const [id, i] of [['limbL', 0], ['limbR', 1]]) if (input.wasPressed(id)) { const a = aimPoint(); pending.push({ type: foot ? 'foot' : 'hand', i, p: a ? a.toArray() : [0, -99, 0] }); }
  for (const [id, i] of [['relL', 0], ['relR', 1]]) if (input.wasPressed(id)) pending.push({ type: 'release', limb: foot ? 'foot' : 'hand', i });
}
// 작은 벽 앞에서 시작(턱 A 아래, 벽을 보고 선다. 시점은 등 뒤)
function wallStart() { if (gal.on) galOpen(false); reset({ pos: [-0.9, 0, -2.58], yaw: Math.PI }); cam.yaw = 0.25; cam.pitch = 0.12; cam.dist = cam.eff = 3.6; cam.follow = null; cam.dirEff = null; cam.target.set(-0.9, 1.3, -2.58); }
function physStep(inp) { const c = pending.splice(0); sim.step(c.length ? { ...inp, cmd: (inp.cmd || []).concat(c) } : inp); }
function reset(o) { sim.reset(o); body = sim.body; pending.length = 0; }

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
const CTX_KO = { ground: '지상 조작', wall: '벽 등반', gallery: '동작 시연', any: '언제나' };
let helpFor = '';
function drawHelp() {
  const m = input.st.mode, key = m + BIND.map(b => b.keys.join()).join('|'); if (key === helpFor) return; helpFor = key;
  const row = b => `<span class=k>${b.keys.map(keyName).filter((v, i, a) => a.indexOf(v) === i).join(' / ')}</span> ${b.label}`;
  const part = (c, on) => { const L = BIND.filter(b => b.ctx.includes(c)); return L.length ? `<div class=${on ? 'on' : 'off'}><b>${CTX_KO[c]}</b>${on && c !== 'any' ? ' ← 지금' : ''}<br>${L.map(row).join('<br>')}</div>` : ''; };
  help.innerHTML = `<b>조작 (임시 배치)</b>` + part(m, true) + ['ground', 'wall'].filter(c => c !== m && m !== 'gallery').map(c => part(c, false)).join('') + part('any', true) + (conflicts().length ? `<span class=warn>겹친 입력: ${conflicts().map(c => keyName(c.key)).join(', ')}</span>` : '');
}
// 손발 이름표·미리보기(임시 표시. 모양·문구는 GPT 검토 대상). 색만이 아니라 글·기호로 상태를 구분한다
const tags = [0, 1, 2, 3, 4].map(() => { const d = document.createElement('div'); d.className = 'tag'; document.body.appendChild(d); return d; });
const mark = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false, transparent: true, opacity: 0.9 })); mark.renderOrder = 9; mark.visible = false; scene.add(mark);
const LOADT = v => `${v.toFixed(1)}배`;
function drawTags() {
  const K = sim.climb, put = (d, p, html, cls) => { const s = screenOf(p); d.style.display = s.front ? 'block' : 'none'; d.style.left = `${s.x + 10}px`; d.style.top = `${s.y - 10}px`; d.className = `tag ${cls}`; d.innerHTML = html; };
  tags.forEach(d => { d.style.display = 'none'; }); mark.visible = false;
  if (gal.on) return;
  K.hands.forEach((h, i) => { const n = i ? '오른손' : '왼손'; if (h.st === 'hold') put(tags[i], h.grip, `● ${n} 잡음 <i>${LOADT(h.loadS || 0)}</i>`, i ? 'R' : 'L'); else if (h.st === 'reach') put(tags[i], h.goal, `→ ${n} 보내는 중`, i ? 'R' : 'L'); });
  K.feet.forEach((f, i) => { const n = i ? '오른발' : '왼발'; if (f.st === 'plant') put(tags[2 + i], f.p, (f.loadS || 0) > 0.05 ? `▲ ${n} 디딤 <i>${LOADT(f.loadS || 0)}</i>` : `△ ${n} 닿아만 있음`, i ? 'R' : 'L'); else if (f.st === 'move') put(tags[2 + i], f.p, `→ ${n} 보내는 중`, i ? 'R' : 'L'); });
  // 미리보기: 겨눈 자리를 지금 자세에서 잡을(디딜) 수 있는지. 실제 판정과 같은 함수. 몸이 움직이는 중이면 확정처럼 보이지 않게 "?"를 붙인다
  if (input.camNow() || input.st.alt) { if (input.st.has) { const d = tags[4]; d.style.display = 'block'; d.style.left = `${input.st.mx + 14}px`; d.style.top = `${input.st.my + 14}px`; d.className = 'tag pv'; d.innerHTML = '시점 조작 중 · 손발 명령 멈춤'; } return; }
  const a = aimPoint(); if (!a) return;
  const foot = input.isDown('footMod'), P = [0, 1].map(i => (foot ? probeFoot : probeHand)(sim, i, a)), g = P.find(x => x.grip);
  if (!g && !foot) return; // 턱이 아닌 곳을 겨눌 때는 손 미리보기를 띄우지 않는다(눌렀을 때의 거부 까닭은 기록에 남는다)
  if (g) { mark.position.set(...g.grip); mark.visible = true; mark.material.color.set(P.some(x => x.ok) ? '#7be08a' : '#ffb35c'); }
  const line = (x, n) => `${x.ok ? '●' : x.short !== undefined ? '○' : '✕'} ${n} ${x.ok ? (foot ? '디딜 수 있음' : '닿음') : x.why}${x.sure === false ? ' <i>? 몸이 움직이는 중</i>' : ''}`;
  const d = tags[4]; d.style.display = 'block'; d.style.left = `${input.st.mx + 14}px`; d.style.top = `${input.st.my + 14}px`; d.className = 'tag pv';
  d.innerHTML = (g ? `<b>${g.name}</b>${g.kind ? (g.kind === 'top' ? ' 윗면' : ' 벽면') : ''}<br>` : '') + (P[0].why === P[1].why && !P[0].ok && !g ? `✕ ${P[0].why}` : line(P[0], foot ? '왼발' : '왼손') + '<br>' + line(P[1], foot ? '오른발' : '오른손'));
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
const LOG_KO = { grab: '잡음', reject: '거부', release: '놓음', slip: '놓침', step: '디딤', lift: '발이 떨어짐', enter: '벽 등반 시작', exit: '벽 등반 끝', bump: '부딪힘' };
function drawHud(fps) {
  if (gal.on) { const c = galClip(); hud.innerHTML = `<div class=ver>3D 모션 시제품 ${VERSION} · 임시 캐릭터(자작)</div><div><b>동작 보기</b> ${gal.i + 1} / ${gal.names.length} &nbsp; <b>${gal.names[gal.i]}</b></div><div><b>분류</b> ${c.cat} &nbsp; <b>지형</b> ${KIND_KO[c.kind] || '-'}${gal.props ? '' : '(숨김)'}${gal.built && gal.built.info.removed ? ` · 맞지 않아 뺀 조각 ${gal.built.info.removed}개` : c.kind !== 'ground' && gal.built && !gal.built.info.pieces ? ' · 조각 없음(손발 자리로는 지형을 정하지 못함)' : ''} &nbsp; <b>시각</b> ${Math.min(gal.t, c.dur).toFixed(2)} / ${c.dur.toFixed(2)}초</div><div class=slow>시연 · 물리 판정 없음</div><div class=dim>받은 동작을 이 캐릭터로 옮겨 지형에 맞춰 튼 것입니다. 잡을 수 있는지·버티는지는 따지지 않습니다(게임 계산은 멈춤).<br>지형은 이 동작에서 손발이 닿는 자리로 만든 임시 조각입니다. 점 = 닿아 있는 손발(붉은색 왼쪽, 푸른색 오른쪽)</div><div class=${slow ? 'slow' : 'real'}>${slow ? '느리게 ×0.25' : '실제 속도'}</div>`; return; }
  const v = Math.hypot(body.vel.x, body.vel.z), st = sim.motion.stats, K = sim.climb;
  const C = sim.clip, cap = C && C.w > 0.5, footName = (L, i) => cap ? (C.feet[i].step ? '고쳐 디딤' : C.feet[i].lock ? (C.feet[i].kind === 'heel' ? '디딤(뒤꿈치)' : '디딤(발끝)') : '옮기는 중') : L.mode === 'plant' ? (L.heel > 0 ? '디딤(뒤꿈치 듦)' : '디딤') : L.mode === 'swing' ? '옮기는 중' : '공중';
  hud.innerHTML = `<div class=ver>3D 모션 시제품 ${VERSION} · 임시 캐릭터(자작)</div>`
    + `<div><b>모션</b> ${!sim.clipSet ? '자작(코드로 만든 동작)' : sim.useClip ? `캡처 동작${cap ? '' : ' → 지금은 자작(웅크림·점프·착지)'}` : '자작(코드로 만든 동작)'}</div>`
    + `<div><b>문맥</b> <span class=ctx>${K.on ? '벽 등반' : '지상 조작'}</span>${input.camNow() ? ' <span class=slow>시점 조작 중 · 손발 명령 멈춤</span>' : ''} &nbsp; <b>상태</b> ${stateName()} &nbsp; <b>속도</b> ${(K.on ? body.vel.length() : v).toFixed(2)} m/s</div>`
    + (K.on ? `<div><b>손</b> ${K.hands.map((h, i) => `${i ? '오른손' : '왼손'} ${h.st === 'hold' ? `잡음(${h.edge.box.name}, 몸무게의 ${LOADT(h.loadS || 0)})` : h.st === 'reach' ? '보내는 중' : '놓음'}`).join(' · ')}</div><div><b>발</b> ${K.feet.map((f, i) => `${i ? '오른발' : '왼발'} ${f.st === 'plant' ? ((f.loadS || 0) > 0.05 ? `디딤(${f.box.name}, ${LOADT(f.loadS || 0)})` : `닿아만 있음(${f.box.name})`) : f.st === 'move' ? '보내는 중' : '떠 있음'}`).join(' · ')}</div>`
      : `<div><b>발</b> ${sim.motion.legs.map((L, i) => `${L.s === 'L' ? '왼발' : '오른발'} ${footName(L, i)}`).join(' · ')}</div>`)
    + `<div class=log>${K.log.filter(e => e.type !== 'try' && !(e.box === '바닥' && e.auto) && !(e.type === 'lift' && /범위/.test(e.why))).slice(-5).map(e => `<span class=t>${e.t.toFixed(2)}초</span> ${LOG_KO[e.type] || e.type}${e.name ? ' ' + e.name : ''}${e.box ? ' · ' + e.box : ''}${e.why ? ' · ' + e.why : ''}`).join('<br>')}</div>`
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
  input.setMode(gal.on ? 'gallery' : sim.climb.on ? 'wall' : 'ground'); drawHelp();
  if (input.wasPressed('reset')) reset();
  if (input.wasPressed('wallStart')) wallStart();
  if (!gal.on && !paused) readCommands();
  if (input.wasPressed('bones')) { skel.visible = !skel.visible; rig.mesh.material.wireframe = skel.visible; }
  if (input.wasPressed('slow')) slow = !slow;
  if (input.wasPressed('motionMode') && sim.clipSet) sim.useClip = !sim.useClip;
  if (input.wasPressed('gallery') && GALLERY) galOpen(!gal.on);
  if (gal.on) { if (input.wasPressed('galNext')) galGo(1); if (input.wasPressed('galPrev')) galGo(-1); if (input.wasPressed('galCatNext')) galGo(1, true); if (input.wasPressed('galCatPrev')) galGo(-1, true); if (input.wasPressed('galProps')) gal.props = !gal.props; }
  if (!paused) frameCore(dtR, readInput()); else renderer.render(scene, camera);
  drawTags(); // 시험이 걸음을 직접 진행하는 동안 화면 쪽 계산은 멈춘다
  input.endFrame(); requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

// 시험용 창구: 입력을 넣고 물리 걸음을 직접 진행한다(그림과 상관없이 같은 결과)
window.__p3 = {
  VERSION, BIND, conflicts, PHY,
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
  shot(o = {}) { cam.yaw = body.yaw + (o.off ?? Math.PI / 2); cam.pitch = o.pitch ?? 0.1; cam.dist = cam.eff = o.dist ?? 3.2; cam.follow = null; cam.dirEff = null; cam.target.set(body.pos.x, body.pos.y + (o.h ?? 0.95), body.pos.z); updateCamera(0); renderer.render(scene, camera); drawHud(fpsS); },
  boneNames: () => rig.list.map(b => b.name),
  galleryList: () => GALLERY ? gal.names.map(n => ({ name: n, cat: GALLERY.clips[n].cat, kind: GALLERY.clips[n].kind, dur: GALLERY.clips[n].dur, holds: (GALLERY.clips[n].holds || []).length })) : null,
  galleryInfo: () => gal.built ? { ...gal.built.info, name: gal.names[gal.i], inside: (() => { stage.updateMatrixWorld(true); const h = rig.bones.hips.getWorldPosition(new THREE.Vector3()); let n = 0; stage.traverse(o => { if (o.isMesh && o.geometry.type === 'BoxGeometry' && new THREE.Box3().setFromObject(o).expandByScalar(-0.03).containsPoint(stage.worldToLocal(h.clone()).applyMatrix4(stage.matrixWorld))) n++; }); return n > 0; })(), grips: gal.built.holds.filter(h => h.grip).length, palmErr: ['L', 'R'].map((s, e) => { const h = gal.built.holds.find(h => h.e === e && h.grip && gal.t * gal.built.clip.fps >= h.f0 && gal.t * gal.built.clip.fps <= h.f1); return h ? rig.bones[`hand.${s}`].localToWorld(new THREE.Vector3(0, -0.08, 0)).distanceTo(galToWorld(h.grip)) : null; }) } : null,
  galleryProps: v => { gal.props = v; },
  gallery(name, t = 0, o = {}) { if (!GALLERY) return false; if (name === null) { galOpen(false); return true; } if (!gal.on) galOpen(true); gal.i = Math.max(0, gal.names.indexOf(name)); gal.t = t; galPose(); const h = rig.bones.hips.getWorldPosition(new THREE.Vector3()); cam.yaw = gal.yaw + (o.off ?? Math.PI / 2); cam.pitch = o.pitch ?? 0.1; cam.dist = cam.eff = o.dist ?? 3.4; cam.follow = null; cam.dirEff = null; cam.target.set(o.fixed ? gal.origin.x : h.x, (o.fixed ? gal.origin.y + 1.0 : h.y) + (o.up ?? 0.1), o.fixed ? gal.origin.z : h.z); const want = cam.target.clone(); updateCamera(0); cam.target.copy(want); camera.position.copy(cam.target).addScaledVector(cam.dirEff, cam.dist); camera.lookAt(cam.target); renderer.render(scene, camera); drawHud(fpsS); return true; },
  // 벽 접촉(W2): 상태·기록·명령·미리보기. 시험은 cmd()로 명령을 넣거나 실제 마우스·키 입력을 쓴다
  climb: () => ({ ...limbState(sim.climb), stats: { ...sim.climb.stats }, lean: { ...sim.climb.lean }, yaw: body.yaw }), climbLog: () => sim.climb.log.slice(), CL,
  cmd: c => { pending.push(c); },
  // 영상·시연용: 계산 걸음마다의 입력 목록을 지금부터 차례로 넣는다(실제 화면 루프로 돈다). 끝나면 저절로 풀린다. 스크립트 입력이며 사람 손이 아니다
  script(inputs) { const k0 = sim.tick; tickInput = k => { const i = k - k0; if (i >= inputs.length - 1) tickInput = null; return inputs[Math.min(i, inputs.length - 1)]; }; }, scripting: () => !!tickInput, pending: () => pending.length, probe: (limb, i, p) => (limb === 'foot' ? probeFoot : probeHand)(sim, i, new THREE.Vector3(...p)),
  screenOf: p => screenOf(p), aim: () => { const a = aimPoint(); return a ? a.toArray() : null; }, wallStart,
  input: () => ({ mode: input.st.mode, cam: input.camNow(), down: [...input.down.keys()], read: (() => { const o = override; override = null; const r = readInput(); override = o; return r; })() }),
  setKeys: (id, keys) => { const r = setKeys(id, keys); helpFor = ''; return r; }, resetKeys: () => { resetKeys(); helpFor = ''; }, tagsText: () => tags.map(d => (d.style.display === 'none' ? '' : d.innerText)),
  hasClips: () => !!sim.clipSet, setMode: m => { if (sim.clipSet) sim.useClip = m === 'clip'; return sim.useClip ? 'clip' : 'proc'; }, mode: () => (sim.useClip ? 'clip' : 'proc'),
  clip: () => sim.clip ? { w: sim.clip.w, on: sim.clip.on, phase: sim.clip.phase, wLoc: sim.clip.wLoc, r: sim.clip.r, stride: sim.clip.stride, feet: sim.clip.feet.map(f => ({ s: f.s, lock: !!f.lock, kind: f.kind, step: !!f.step, off: f.off.length() })) } : null,
  clipInfo: () => sim.clipSet ? Object.fromEntries(Object.entries(sim.clipSet.clips).map(([k, c]) => [k, { src: c.src, n: c.n, dur: c.dur, stride: c.stride, speed: c.speed, duty: c.duty, flight: c.flight }])) : null,
  bonesWorld: () => Object.fromEntries(rig.list.map(b => { b.updateWorldMatrix(true, false); return [b.name, new THREE.Vector3().setFromMatrixPosition(b.matrixWorld).toArray()]; })),
};
