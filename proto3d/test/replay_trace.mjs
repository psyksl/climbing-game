// 기록한 입력(test/short_browser.mjs의 OUT, test/short_section.mjs·stand_trace.mjs·press_piece.mjs의 RECIN)을 계산에서 다시 틀며 걸음마다 팔의 길을 적는다(p3d-0.15.3, GPT의 0.15.2 검토 작업 B: 맞잡기에서 손이 머리 근처로 돌아가는 길).
// **기록한 입력의 다시 틀기다(사람 손 아님).** 화면에서 기록한 것은 같은 설정으로 다시 틀어 끝 접촉이 기록과 같은지 먼저 확인한다(다르면 그렇게 적는다).
// 열(HAND=0|1의 팔): t · 상태 · 손목(몸 기준 옆·위·앞) · 팔꿈치(옆·위·앞) · 어깨 · 손목–머리 가운데 · 팔뚝 줄기–머리 겉(음수 = 겹침) · 손목 빠르기(m/s)
// 사용: IN=기록.json [LINK=0|1(기록의 설정 대신)] [HAND=0] [T0=초 T1=초] [EVERY=걸음] node test/replay_trace.mjs
import { prov, provLine } from './provenance.mjs';
import fs from 'fs'; import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), imp = f => import(pathToFileURL(path.join(HERE, '../src', f)).href);
const { buildCharacter } = await imp('rig.js'), { makeGym } = await imp('world.js'), { makeSim } = await imp('sim.js'), { DIM } = await imp('rig.js'), THREE = await import('three');
const E = process.env, R = JSON.parse(fs.readFileSync(E.IN, 'utf8')), CLIPS = R.clip ? JSON.parse(fs.readFileSync(path.join(HERE, '../assets_local/clips.json'), 'utf8')) : null, sim = makeSim(buildCharacter(), makeGym(), CLIPS);
sim.reset({ pos: R.startPos, yaw: R.startYaw }); const o = R.opts; Object.assign(sim.opt, { posture: 'fb', footAssist: o.footAssist, grabAssist: o.grabAssist, poseAssist: o.poseAssist, easy: o.easy, autoBody: o.autoBody, keepHold: !!o.keepHold, press: o.press, wallRest: !!o.wallRest, linkPose: E.LINK !== undefined ? E.LINK === '1' : !!o.linkPose });
const K = sim.climb, b = sim.body, I = +(E.HAND || 0), s = I ? 'R' : 'L', T0 = Math.round(+(E.T0 || 0) * 120), T1 = Math.round(+(E.T1 || 1e9) * 120), EV = +(E.EVERY || 4), V = () => new THREE.Vector3(), f3 = v => (v >= 0 ? ' ' : '') + v.toFixed(3), B = sim.rig.bones;
console.log(provLine(prov()), '· 기록', path.basename(E.IN), R.version || '', '· 다시 트는 동작', R.clip ? '캡처' : '자작', '· 전신 연결', sim.opt.linkPose ? '켬' : '끔');
let prev = null, nl = 0, minHead = 9, minAt = 0, vmax = 0; const rows = [];
for (let k = 0; k < R.inputs.length && k < T1 + 240; k++) { const x = R.inputs[k]; sim.step(x); for (; nl < K.log.length; nl++) { const e = K.log[nl]; if (k >= T0 && k < T1 && !/^(try|bump)$/.test(e.type)) console.log('     ·', e.t.toFixed(3), e.type, e.name || '', e.why || '', e.hold || e.box || ''); }
  const wr = B[`hand.${s}`].getWorldPosition(V()), el = B[`foreArm.${s}`].getWorldPosition(V()), sh = B[`upperArm.${s}`].getWorldPosition(V()), hd = B.head.getWorldPosition(V()).add(V().set(0, DIM.headR * 0.9, 0.01).applyQuaternion(B.head.getWorldQuaternion(new THREE.Quaternion())));
  // 팔뚝 줄기(팔꿈치 → 손목)에서 머리 가운데까지의 가장 가까운 거리 − 머리 반지름
  const ab = wr.clone().sub(el), t = Math.max(0, Math.min(1, hd.clone().sub(el).dot(ab) / Math.max(1e-9, ab.lengthSq()))), dHead = hd.distanceTo(el.clone().addScaledVector(ab, t)) - DIM.headR, v = prev ? wr.distanceTo(prev) * 120 : 0; prev = wr.clone();
  if (k >= T0 && k < T1) { if (dHead < minHead) { minHead = dHead; minAt = k / 120; } vmax = Math.max(vmax, v);
    if (k % EV === 0) { const fw = V().set(Math.sin(b.yaw), 0, Math.cos(b.yaw)), lf = V().set(Math.cos(b.yaw), 0, -Math.sin(b.yaw)), loc = p => `${f3(p.clone().sub(b.pos).dot(lf))} ${f3(p.y - b.pos.y)} ${f3(p.clone().sub(b.pos).dot(fw))}`, H = K.hands[I];
      console.log((k / 120).toFixed(3), (H.st + (H.st === 'hold' ? ':' + H.edge.box.name : '')).padEnd(14), '손목', loc(wr), '팔꿈치', loc(el), '어깨', loc(sh), '머리', loc(hd), '손목–머리', f3(wr.distanceTo(hd)), '팔뚝–머리 겉', f3(dHead), 'v', v.toFixed(2)); } } }
console.log(`구간 ${(T0 / 120).toFixed(2)}~${(Math.min(T1, R.inputs.length) / 120).toFixed(2)}초 · ${I ? '오른팔' : '왼팔'} · 팔뚝 줄기와 머리 겉의 가장 가까운 거리 ${(minHead * 100).toFixed(1)}cm(${minAt.toFixed(3)}초${minHead < 0 ? ' — 겹침' : ''}) · 손목의 가장 큰 빠르기 ${vmax.toFixed(2)}m/s`);
if (R.end) { const end = { h: K.hands.map(h => h.st + (h.st === 'hold' ? ':' + h.edge.box.name : '')), f: K.feet.map(f => f.st + (f.st === 'plant' ? ':' + f.box.name : '')) }, rec = { h: R.end.h.map(h => h.st + (h.st === 'hold' ? ':' + h.box : '')), f: R.end.f.map(f => f.st + (f.st === 'plant' ? ':' + f.box : '')) }; console.log('끝 접촉', JSON.stringify(end), JSON.stringify(end) === JSON.stringify(rec) ? '· 기록과 같다' : `· **기록과 다르다** ${JSON.stringify(rec)}`); }
