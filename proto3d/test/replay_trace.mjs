// 기록한 입력(test/short_browser.mjs의 OUT, test/short_section.mjs·stand_trace.mjs·press_piece.mjs의 RECIN)을 계산에서 다시 틀며 걸음마다 팔의 길을 적는다(p3d-0.15.3, GPT의 0.15.2 검토 작업 B: 맞잡기에서 손이 머리 근처로 돌아가는 길).
// **기록한 입력의 다시 틀기다(사람 손 아님).** 화면에서 기록한 것은 같은 설정으로 다시 틀어 끝 접촉이 기록과 같은지 먼저 확인한다(다르면 그렇게 적는다).
// 열(HAND=0|1의 팔): t · 상태 · 손목(몸 기준 옆·위·앞) · 팔꿈치(옆·위·앞) · 어깨 · 팔뚝·위팔의 줄기–머리 공의 겉 / 판정 부피–머리 공(음수 = 겹침) · 손목 빠르기(m/s)
// 사용: IN=기록.json [LINK=0|1(기록의 설정 대신)] [HAND=0] [T0=초 T1=초] [EVERY=걸음] node test/replay_trace.mjs
import { prov, provLine, provOptLine } from './provenance.mjs';
import fs from 'fs'; import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), imp = f => import(pathToFileURL(path.join(HERE, '../src', f)).href);
const { buildCharacter } = await imp('rig.js'), { makeGym } = await imp('world.js'), { makeSim } = await imp('sim.js'), { DIM } = await imp('rig.js'), THREE = await import('three');
const E = process.env, R = JSON.parse(fs.readFileSync(E.IN, 'utf8')), CLIPS = R.clip ? JSON.parse(fs.readFileSync(path.join(HERE, '../assets_local/clips.json'), 'utf8')) : null, sim = makeSim(buildCharacter(), makeGym(), CLIPS);
sim.reset({ pos: R.startPos, yaw: R.startYaw }); const o = R.opts; Object.assign(sim.opt, { posture: 'fb', footAssist: o.footAssist, grabAssist: o.grabAssist, poseAssist: o.poseAssist, easy: o.easy, autoBody: o.autoBody, keepHold: !!o.keepHold, press: o.press, wallRest: !!o.wallRest, linkPose: E.LINK !== undefined ? E.LINK === '1' : !!o.linkPose });
const K = sim.climb, b = sim.body, I = +(E.HAND || 0), s = I ? 'R' : 'L', T0 = Math.round(+(E.T0 || 0) * 120), T1 = Math.round(+(E.T1 || 1e9) * 120), EV = +(E.EVERY || 4), V = () => new THREE.Vector3(), f3 = v => (v >= 0 ? ' ' : '') + v.toFixed(3), B = sim.rig.bones;
console.log(provLine(prov()), '· 기록', path.basename(E.IN), R.version || '', '· 다시 트는 동작', R.clip ? '캡처' : '자작', '· 전신 연결', sim.opt.linkPose ? '켬' : '끔'); console.log(provOptLine(sim), '· 입력의 출처', (R.source || (R.end ? 'keymouse' : 'command')) === 'keymouse' ? '키·마우스 이벤트 기록' : '명령 수준');
// 머리 기준(p3d-0.15.4, GPT의 0.15.3 검토 M1): 0.15.3은 머리 뼈 + [0, headR·0.9, 0.01]을 머리 가운데로 썼다(옛 몸의 그림 머리). 사람형 몸의 물리가 쓰는 머리 공은 머리 뼈 + DIM.headC(climb.js headShape와 같은 식)이고 둘은 21mm 떨어져 있다.
//   세 가지를 따로 적는다: ① 팔 줄기(가운데 선) – 머리 공의 겉 ② 팔의 판정 부피(줄기 + 그 자리의 팔 반지름) – 머리 공의 겉(음수 = 판정 부피끼리 겹침. 그려진 메시의 겹침을 직접 잰 것은 아니다) ③ 0.15.3의 옛 기준(견주기용)
//   물리의 거부("팔이 머리를 지나감")는 ①이 −1cm보다 깊을 때다(팔이 귀 옆에 붙는 것은 겹침으로 보지 않는다 — selfHits의 rHead). 그래서 ②가 음수여도 물리는 막지 않는다
const lerp = (a, b, t) => a + (b - a) * t, segPt = (a, b, c) => { const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, c.clone().sub(a).dot(ab) / Math.max(1e-9, ab.lengthSq()))); return { t, d: c.distanceTo(a.clone().addScaledVector(ab, t)) }; };
let prev = null, nl = 0, vmax = 0; const mn = { fLine: [9, 0], fVol: [9, 0], uLine: [9, 0], uVol: [9, 0], old: [9, 0] }, low = (k, v, t) => { if (v < mn[k][0]) mn[k] = [v, t]; };
for (let k = 0; k < R.inputs.length && k < T1 + 240; k++) { const x = R.inputs[k]; sim.step(x); for (; nl < K.log.length; nl++) { const e = K.log[nl]; if (k >= T0 && k < T1 && !/^(try|bump)$/.test(e.type)) console.log('     ·', e.t.toFixed(3), e.type, e.name || '', e.why || '', e.hold || e.box || ''); }
  const wr = B[`hand.${s}`].getWorldPosition(V()), el = B[`foreArm.${s}`].getWorldPosition(V()), sh = B[`upperArm.${s}`].getWorldPosition(V()), qHd = B.head.getWorldQuaternion(new THREE.Quaternion()), hb = B.head.getWorldPosition(V());
  const hd = hb.clone().add(V().set(...DIM.headC).applyQuaternion(qHd)), hdOld = hb.clone().add(V().set(0, DIM.headR * 0.9, 0.01).applyQuaternion(qHd));
  const nf = segPt(el, wr, hd), nu = segPt(sh, el, hd), fLine = nf.d - DIM.headR, fVol = fLine - lerp(DIM.armR.fore[0], DIM.armR.fore[1], nf.t), uLine = nu.d - DIM.headR, uVol = uLine - lerp(DIM.armR.upper[0], DIM.armR.upper[1], nu.t), dOld = segPt(el, wr, hdOld).d - DIM.headR, v = prev ? wr.distanceTo(prev) * 120 : 0; prev = wr.clone();
  if (k >= T0 && k < T1) { const t = k / 120; low('fLine', fLine, t); low('fVol', fVol, t); low('uLine', uLine, t); low('uVol', uVol, t); low('old', dOld, t); vmax = Math.max(vmax, v);
    if (k % EV === 0) { const fw = V().set(Math.sin(b.yaw), 0, Math.cos(b.yaw)), lf = V().set(Math.cos(b.yaw), 0, -Math.sin(b.yaw)), loc = p => `${f3(p.clone().sub(b.pos).dot(lf))} ${f3(p.y - b.pos.y)} ${f3(p.clone().sub(b.pos).dot(fw))}`, H = K.hands[I];
      console.log(t.toFixed(3), (H.st + (H.st === 'hold' ? ':' + H.edge.box.name : '')).padEnd(14), '손목', loc(wr), '팔꿈치', loc(el), '어깨', loc(sh), '머리 공', loc(hd), '몸', f3(b.pos.y), '| 팔뚝 줄기–머리', f3(fLine), '부피', f3(fVol), '위팔 줄기–머리', f3(uLine), '부피', f3(uVol), 'v', v.toFixed(2)); } } }
const cm = k => `${(mn[k][0] * 100).toFixed(1)}cm(${mn[k][1].toFixed(3)}초)`;
console.log(`구간 ${(T0 / 120).toFixed(2)}~${(Math.min(T1, R.inputs.length) / 120).toFixed(2)}초 · ${I ? '오른팔' : '왼팔'} · 머리 공 = 머리 뼈 + headC[${DIM.headC}] · 반지름 ${DIM.headR}`);
console.log(`  팔뚝: 줄기–머리 공의 겉 ${cm('fLine')}${mn.fLine[0] < -0.01 ? ' — 물리가 막는 깊이' : ''} · 판정 부피–머리 공 ${cm('fVol')}${mn.fVol[0] < 0 ? ' — 부피끼리 겹침' : ''} · [0.15.3의 옛 기준 ${cm('old')}]`);
console.log(`  위팔: 줄기–머리 공의 겉 ${cm('uLine')} · 판정 부피–머리 공 ${cm('uVol')}${mn.uVol[0] < 0 ? ' — 부피끼리 겹침' : ''} · 손목의 가장 큰 빠르기 ${vmax.toFixed(2)}m/s`);
if (R.end) { const end = { h: K.hands.map(h => h.st + (h.st === 'hold' ? ':' + h.edge.box.name : '')), f: K.feet.map(f => f.st + (f.st === 'plant' ? ':' + f.box.name : '')) }, rec = { h: R.end.h.map(h => h.st + (h.st === 'hold' ? ':' + h.box : '')), f: R.end.f.map(f => f.st + (f.st === 'plant' ? ':' + f.box : '')) }; console.log('끝 접촉', JSON.stringify(end), JSON.stringify(end) === JSON.stringify(rec) ? '· 기록과 같다' : `· **기록과 다르다** ${JSON.stringify(rec)}`); }
