// 몸 보기(p3d-0.10.0): 사람형 몸과 뼈대를 앞·옆·뒤에서 한꺼번에 보고, 기본 관절 동작과 받은 원본 동작을 튼다. 실행: body3d.html
// 기본 관절 동작은 게임과 같은 길로 만든다: 제어 뼈대(rig.js)에 자세를 주고 → human.js가 새 몸에 옮긴다. 원본 동작은 새 몸의 뼈에 바로 튼다(제어 뼈대·물리 없음).
// 이 화면의 동작은 정해 둔 스크립트다(사람 손 아님). 물리 판정이 없다.
import * as THREE from 'three';
import { buildCharacter, DIM, BODY } from './rig.js';
import { buildHuman, makeRetarget, playClip, restPose } from './human.js';
import { aimBone, setWorldQuat, twoBone, worldPos } from './ik.js';

const VERSION = 'p3d-0.11.9';
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), Q = () => new THREE.Quaternion(), D = Math.PI / 180;
const params = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: params.has('test') });
renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.setSize(innerWidth, innerHeight); renderer.shadowMap.enabled = !params.has('noshadow'); renderer.setScissorTest(true);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#cfd6dc');
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f80, 1.7));
const sun = new THREE.DirectionalLight(0xffffff, 2.0); sun.position.set(3, 6, 5); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3 }); scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshStandardMaterial({ color: '#a9b39c', roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const grid = new THREE.GridHelper(12, 60, 0x7d8774, 0x93a08a); grid.position.y = 0.002; scene.add(grid);
// 발판 두 개(낮은 30cm, 높은 55cm) — 발 올리기 장면에서만 보인다
const box = (w, h, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: '#c8a46a', roughness: 0.9 })); m.position.set(x, h / 2, z); m.castShadow = m.receiveShadow = true; m.visible = false; scene.add(m); return m; };
const stepLow = box(0.30, 0.30, 0.30, 0.10, 0.36), stepHigh = box(0.30, 0.55, 0.30, -0.10, 0.36);
// 1m 턱(p3d-0.10.1, GPT 지적: 원본 ClimbUp 비교에 턱을 함께). RM판에서 손이 짚는 자리로 잰 값: 윗면 1.0m, 앞면 몸 앞 0.40m. 일반판(몸 이동이 빠진 것)은 두 판의 골반 차이만큼 턱을 반대로 옮겨 손이 같은 자리에 오게 한다
const ledge1m = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 1.6), new THREE.MeshStandardMaterial({ color: '#9aa3a8', roughness: 0.95 })); ledge1m.castShadow = ledge1m.receiveShadow = true; ledge1m.visible = false; scene.add(ledge1m);
const LEDGE_BASE = V(0, 0.5, 0.40 + 0.8);

const rig = buildCharacter(); scene.add(rig.root); rig.mesh.visible = BODY === 'old';
const H = BODY === 'human' ? buildHuman() : null, R = H ? makeRetarget(rig, H) : null; if (H) scene.add(H.root);
const skelH = H ? new THREE.SkeletonHelper(H.root) : new THREE.SkeletonHelper(rig.mesh); skelH.visible = params.has('skel'); scene.add(skelH);
const setSkel = on => { skelH.visible = on; for (const m of H ? H.meshes : [rig.mesh]) { m.material.transparent = on; m.material.opacity = on ? 0.35 : 1; m.material.depthWrite = !on; } };
setSkel(params.has('skel'));
const B = rig.bones, rest = rig.list.map(b => ({ b, p: b.position.clone(), q: b.quaternion.clone() }));
const ease = x => x * x * (3 - 2 * x), seg = (t, a, b) => ease(THREE.MathUtils.clamp((t - a) / (b - a), 0, 1)), bump = (t, a, b) => Math.sin(Math.PI * THREE.MathUtils.clamp((t - a) / (b - a), 0, 1));

// 제어 뼈대에 자세를 주는 작은 도구들
const restRig = () => { for (const r of rest) { r.b.position.copy(r.p); r.b.quaternion.copy(r.q); } rig.root.updateMatrixWorld(true); };
const rotLocal = (n, axis, ang) => { B[n].quaternion.multiply(Q().setFromAxisAngle(axis, ang)); B[n].updateMatrixWorld(true); };
function armTo(s, dir, hint, elbow = 10 * D) { // 위팔을 dir 쪽으로, 팔꿈치는 hint(앞 축) 쪽으로 elbow만큼 굽힌다
  const sh = worldPos(B[`upperArm.${s}`]), u = dir.clone().normalize(), h = hint.clone().addScaledVector(u, -hint.dot(u)).normalize();
  const t = sh.clone().addScaledVector(u, (DIM.upperArm + DIM.foreArm) * Math.cos(elbow / 2) * 0.999), ik = twoBone(sh, t, DIM.upperArm, DIM.foreArm, h.clone().negate());
  aimBone(B[`upperArm.${s}`], ik.mid.clone().sub(sh), h); aimBone(B[`foreArm.${s}`], ik.end.clone().sub(ik.mid), h); aimBone(B[`hand.${s}`], ik.end.clone().sub(ik.mid), h);
}
function legTo(s, ankle, pole, footQ) { // 발목을 ankle에, 무릎은 pole 쪽, 발의 회전 footQ(세계)
  const hj = worldPos(B[`upLeg.${s}`]), ik = twoBone(hj, ankle, DIM.thigh, DIM.shin, pole), hint = pole.clone();
  aimBone(B[`upLeg.${s}`], ik.mid.clone().sub(hj), hint); aimBone(B[`leg.${s}`], ik.end.clone().sub(ik.mid), hint); setWorldQuat(B[`foot.${s}`], footQ || Q());
}
const restAnk = s => V(s === 'L' ? DIM.oHip[0] : -DIM.oHip[0], DIM.ankleY, DIM.oHip[2]);
function standLegs(qFoot = [Q(), Q()]) { for (const [i, s] of [[0, 'L'], [1, 'R']]) legTo(s, restAnk(s), V(0, 0, 1), qFoot[i]); }

// 기본 관절 동작: [이름, 길이(초), 자세 함수(장면 안의 시각 t → 제어 뼈대 자세, 손가락 값)]
const DEMOS = [
  ['쉬는 자세(차렷)', 1.5, () => { standLegs(); return { fing: 0.3, pron: 1 }; }],
  ['팔 올리기 — 앞으로(굽힘)', 3.0, t => { standLegs(); const a = 175 * D * bump(t, 0.1, 2.9); for (const s of ['L', 'R']) armTo(s, V(0, -Math.cos(a), Math.sin(a)), V(0, Math.sin(a), Math.cos(a))); return { fing: 0.3, pron: 1 - seg(t, 0, 0.6) + seg(t, 2.4, 3) }; }],
  ['팔 올리기 — 옆으로(벌림)', 3.0, t => { standLegs(); const a = 170 * D * bump(t, 0.1, 2.9); for (const [s, sx] of [['L', 1], ['R', -1]]) armTo(s, V(sx * Math.sin(a), -Math.cos(a), 0), V(0, 0, 1)); return { fing: 0.3, pron: 1 - seg(t, 0, 0.6) + seg(t, 2.4, 3) }; }],
  ['몸통 비틀기(좌우 40°) · 옆으로 굽히기', 4.0, t => { standLegs(); const tw = 40 * D * Math.sin(2 * Math.PI * Math.min(t, 2) / 2), sb = 22 * D * (t > 2 ? Math.sin(2 * Math.PI * (t - 2) / 2) : 0);
    rotLocal('spine', V(0, 1, 0), tw * 0.45); rotLocal('chest', V(0, 1, 0), tw * 0.55); rotLocal('spine', V(0, 0, 1), sb * 0.5); rotLocal('chest', V(0, 0, 1), sb * 0.5); rotLocal('neck', V(0, 1, 0), -tw * 0.3);
    for (const [s, sx] of [['L', 1], ['R', -1]]) armTo(s, V(sx * 0.25, -1, 0.15), V(0, 0, 1), 25 * D); return { fing: 0.3, pron: 1 }; }],
  ['깊게 앉기(발바닥을 붙인 채)', 4.0, t => { const k = bump(t, 0.2, 3.8), drop = 0.48 * k; B.hips.position.y = DIM.hipY - drop; B.hips.position.z = -0.10 * k; rig.root.updateMatrixWorld(true);
    rotLocal('hips', V(1, 0, 0), 38 * D * k); rotLocal('spine', V(1, 0, 0), -8 * D * k); rotLocal('chest', V(1, 0, 0), -10 * D * k); rotLocal('neck', V(1, 0, 0), -15 * D * k);
    for (const [s, sx] of [['L', 1], ['R', -1]]) legTo(s, V(sx * 0.13, DIM.ankleY, DIM.oHip[2] + 0.02), V(sx * 0.35, 0, 1), Q().setFromAxisAngle(V(0, 1, 0), sx * 12 * D * k));
    for (const s of ['L', 'R']) armTo(s, V(0, -0.35, 1), V(0, 1, 0.3), 20 * D * k + 10 * D); return { fing: 0.3, pron: 1 - k }; }],
  ['낮은 발판(30cm)에 왼발 올리기', 3.5, t => { stepLow.visible = true; const k = seg(t, 0.2, 1.4), back = seg(t, 2.4, 3.4), up = Math.max(0, k - back), arc = bump(t, 0.2, 1.4) * 0.12;
    const a0 = restAnk('L'), a1 = V(0.10, 0.30 + DIM.ankleY, 0.30), ank = a0.clone().lerp(a1, up); ank.y += arc * (1 - back);
    B.hips.position.x = -0.04 * up; rig.root.updateMatrixWorld(true); legTo('L', ank, V(0.15, 0.2, 1)); legTo('R', restAnk('R'), V(0, 0, 1)); for (const s of ['L', 'R']) armTo(s, V(0, -1, 0.1), V(0, 0, 1)); return { fing: 0.3, pron: 1 }; }],
  ['높은 발판(55cm)에 오른발 올리기', 3.5, t => { stepHigh.visible = true; const k = seg(t, 0.2, 1.5), back = seg(t, 2.4, 3.4), up = Math.max(0, k - back), arc = bump(t, 0.2, 1.5) * 0.10;
    const a0 = restAnk('R'), a1 = V(-0.10, 0.55 + DIM.ankleY, 0.30), ank = a0.clone().lerp(a1, up); ank.y += arc * (1 - back);
    B.hips.position.x = 0.05 * up; rig.root.updateMatrixWorld(true); rotLocal('hips', V(1, 0, 0), 10 * D * up); rotLocal('spine', V(1, 0, 0), -6 * D * up);
    legTo('R', ank, V(-0.15, 0.3, 1)); legTo('L', restAnk('L'), V(0, 0, 1)); for (const s of ['L', 'R']) armTo(s, V(0, -1, 0.15), V(0, 0, 1)); return { fing: 0.3, pron: 1 }; }],
  ['발목 방향 바꾸기(들기·내리기·안쪽·바깥쪽)', 4.0, t => { const p = 25 * D * Math.sin(2 * Math.PI * Math.min(t, 2) / 2), r = 20 * D * (t > 2 ? Math.sin(2 * Math.PI * (t - 2) / 2) : 0);
    B.hips.position.x = -0.06; rig.root.updateMatrixWorld(true); legTo('R', restAnk('R').add(V(0.02, 0, 0)), V(0, 0, 1));
    legTo('L', restAnk('L').add(V(0.04, 0.18, 0.12)), V(0.1, 0.3, 1), Q().setFromAxisAngle(V(1, 0, 0), -p).multiply(Q().setFromAxisAngle(V(0, 0, 1), -r))); for (const s of ['L', 'R']) armTo(s, V(0, -1, 0.1), V(0, 0, 1)); return { fing: 0.3, pron: 1 }; }],
  ['손가락 굽히기(편 손 → 쥔 손 → 쉬는 손)', 3.0, t => { standLegs(); for (const [s, sx] of [['L', 1], ['R', -1]]) armTo(s, V(sx * 0.35, -0.2, 1), V(0, 1, 0), 30 * D); const f = t < 1 ? 0.3 - 0.3 * seg(t, 0, 0.8) : t < 2 ? seg(t, 1, 1.8) : 1 - 0.7 * seg(t, 2, 2.8); return { fing: f, pron: 0 }; }],
];
const TOTAL = DEMOS.reduce((a, d) => a + d[1], 0);
const CLIPS = H ? H.clips : [];
let CAMD = 5.4, CAMY = null, mode = params.get('mode') || 'joints', clipName = params.get('clip') || 'ClimbUp_1m', T0 = performance.now(), tFixed = null;
function poseAt(t) {
  stepLow.visible = stepHigh.visible = false;
  ledge1m.visible = false;
  if (mode === 'clip' && H) { const c = CLIPS.find(x => x.name === clipName) || CLIPS[0], tt = t % (c.dur + 0.6);
    if (/^ClimbUp_1m/.test(c.name)) { const rm = CLIPS.find(x => x.name === 'ClimbUp_1m_RM'), std = CLIPS.find(x => x.name === 'ClimbUp_1m'), tc = Math.min(tt, c.dur);
      restPose(H); playClip(H, rm, tc); const pR = H.bones.pelvis.getWorldPosition(V()); restPose(H); playClip(H, std, tc); const pS = H.bones.pelvis.getWorldPosition(V());
      ledge1m.position.copy(LEDGE_BASE); if (c === std) ledge1m.position.add(pS.sub(pR)); ledge1m.visible = true; }
    restPose(H); playClip(H, c, Math.min(tt, c.dur)); return { label: `원본 동작 그대로: ${c.name} (${c.dur.toFixed(2)}초${/_RM$/.test(c.name) ? ' · 몸의 이동 포함판' : ''}) — 새 몸의 뼈에 바로 틂, 물리 없음${/^ClimbUp/.test(c.name) ? ' · 회색 상자 = 1m 턱(손이 짚는 자리에 맞춰 놓음)' : ''}`, t: Math.min(tt, c.dur) }; }
  let tt = t % TOTAL, i = 0; while (tt > DEMOS[i][1]) { tt -= DEMOS[i][1]; i++; }
  restRig(); const r = DEMOS[i][2](tt) || {}; rig.root.updateMatrixWorld(true);
  if (H) R.apply([r.fing ?? 0.3, r.fing ?? 0.3], [r.pron ?? 1, r.pron ?? 1]);
  return { label: `${i + 1}/${DEMOS.length} ${DEMOS[i][0]}`, t: tt };
}
// 세 시점(앞·옆·뒤). 같은 크기·같은 거리
const cams = [['앞', 0], ['옆(왼쪽)', Math.PI / 2], ['뒤', Math.PI]].map(([n, a]) => ({ n, a, cam: new THREE.PerspectiveCamera(32, 1, 0.05, 50) }));
const hud = document.createElement('div'); hud.style.cssText = 'position:fixed;left:10px;bottom:4px;background:rgba(28,35,29,.86);color:#f3ecd6;padding:6px 10px;border-radius:7px;font:13px/1.5 system-ui,sans-serif;pointer-events:none'; document.body.appendChild(hud);
const labs = cams.map(() => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;bottom:8px;color:#1c231d;font:700 13px system-ui,sans-serif;background:rgba(243,236,214,.85);padding:1px 8px;border-radius:5px'; document.body.appendChild(d); return d; });
let render = function (info) {
  const BAR = 62, w = innerWidth, h = innerHeight - BAR, cw = Math.floor(w / 3), c = H ? H.bones.pelvis.getWorldPosition(V()) : worldPos(B.hips), tgt = V(c.x, CAMY ?? (mode === 'clip' ? Math.max(1.05, c.y + 0.1) : 1.05), c.z); // 안내 칸은 아래 띠(BAR)에 — 0.10.0은 위에 두어 팔을 다 든 손끝을 가렸다
  cams.forEach((o, k) => { o.cam.aspect = cw / h; o.cam.updateProjectionMatrix(); o.cam.position.set(tgt.x + Math.sin(o.a) * CAMD, tgt.y + 0.15, tgt.z + Math.cos(o.a) * CAMD); o.cam.lookAt(tgt);
    renderer.setViewport(k * cw, BAR, cw, h); renderer.setScissor(k * cw, BAR, cw, h); renderer.render(scene, o.cam); labs[k].textContent = o.n; labs[k].style.left = (k * cw + 8) + 'px'; labs[k].style.bottom = (BAR + 6) + 'px'; });
  renderer.setViewport(0, 0, w, BAR); renderer.setScissor(0, 0, w, BAR); renderer.setClearColor('#1c231d'); renderer.clear(); renderer.setClearColor('#cfd6dc');
  hud.innerHTML = `<b>몸 보기</b> ${VERSION} · ${BODY === 'human' ? '사람형 몸: Quaternius UAL2 남성 마네킹(CC0) · 뼈 65개(끝 표시 포함) · 키 1.83m' : '옛 몸(자작)'}<br>${info.label} · ${info.t.toFixed(2)}초<br><span style="font-size:11.5px;color:#bbc4b2">정해 둔 스크립트 동작(사람 손 아님) · 물리 판정 없음 · ${mode === 'joints' ? '제어 뼈대(21개 뼈)에 자세를 주고 새 몸에 옮김' : '원본 동작 비교'}${skelH.visible ? ' · 뼈대 보임' : ''} · 키: 1 기본 관절 / 2 원본 동작(N 다음) / B 뼈대</span>`;
}
addEventListener('resize', () => renderer.setSize(innerWidth, innerHeight));
addEventListener('keydown', e => { if (e.code === 'Digit1') { mode = 'joints'; T0 = performance.now(); } if (e.code === 'Digit2') { mode = 'clip'; T0 = performance.now(); } if (e.code === 'KeyN') { const i = CLIPS.findIndex(c => c.name === clipName); clipName = CLIPS[(i + 1) % CLIPS.length].name; T0 = performance.now(); } if (e.code === 'KeyB') setSkel(!skelH.visible); });
let frozen = false; function loop() { if (!frozen) { const t = tFixed ?? (performance.now() - T0) / 1000; render(poseAt(t)); } requestAnimationFrame(loop); }
document.title = `몸 보기 ${VERSION}${BODY === 'old' ? ' · 옛 몸' : ''}`;
let lastInfo = null; const _render = render; render = info => { lastInfo = info; _render(info); };
window.__bv = { renderNow(label) { _render({ ...(lastInfo || { t: 0 }), label: label || (lastInfo && lastInfo.label) || '' }); }, freeze() { frozen = true; }, VERSION, DEMOS: DEMOS.map(d => [d[0], d[1]]), TOTAL, clips: CLIPS.map(c => [c.name, c.dur]), cam(d, y) { CAMD = d ?? 5.4; CAMY = y ?? null; }, at(t, m, c) { frozen = false; if (m) mode = m; if (c) clipName = c; tFixed = t; const info = poseAt(t); render(info); return info; }, live() { tFixed = null; T0 = performance.now(); }, skel: setSkel, H, rig };
loop();
