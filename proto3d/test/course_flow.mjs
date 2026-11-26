// 코스 시도의 수명주기를 실제 계산(물리)으로 확인한다(p3d-0.15.2, GPT의 0.15.1 재검토: 공중에서 시도가 끊기던 것). **스크립트 입력이다(사람 손 아님).**
// 초록 시작 홀드 둘을 잡은 자세(발은 바닥)에서 ① 두 손을 놓는다(바닥에 서 있으므로 그 걸음에 끝나야 한다) ② 벽에서 뛰어오르다(Space) 두 손을 놓는다(손 없는 공중) ③ 뛰며 초록 4로 손을 보낸다(뛰어 잡기) ④ 손 없는 공중에서 다시 잡는다.
// 걸음마다 화면과 같은 코스 모듈(src/course.js)을 불러 단계(phase)·시도 번호를 적는다. 사용: [MODE=clip] node test/course_flow.mjs
import { prov, provLine } from './provenance.mjs';
import fs from 'fs'; import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), imp = f => import(pathToFileURL(path.join(HERE, '../src', f)).href);
const { buildCharacter } = await imp('rig.js'), { makeGym } = await imp('world.js'), { makeSim } = await imp('sim.js'), { makeCourseState, courseSelect, courseStep, courseView } = await imp('course.js'), THREE = await import('three');
const E = process.env, CLIPS = E.MODE === 'clip' ? JSON.parse(fs.readFileSync(path.join(HERE, '../assets_local/clips.json'), 'utf8')) : null, rig = buildCharacter(), world = makeGym();
console.log(provLine(prov())); let pass = 0, fail = 0; const ok = (name, c, got = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${name} ${got}`); };
const C = world.courses.find(c => c.id === 'green'), n = new THREE.Vector3(...C.frame.n), holds = world.boxes.filter(b => b.course === 'green' && b.role !== 'foot').sort((a, b) => a.seq - b.seq);
const front = b => { const c = b.min.clone().add(b.max).multiplyScalar(0.5), half = Math.abs(n.x) * (b.max.x - b.min.x) / 2 + Math.abs(n.z) * (b.max.z - b.min.z) / 2; return c.addScaledVector(n, half).setY(b.max.y).toArray(); };
function mk() { const sim = makeSim(rig, world, CLIPS), G = makeCourseState(world.courses), seq = []; sim.reset({ pos: C.startPos, yaw: C.startYaw }); Object.assign(sim.opt, { posture: 'fb', grabAssist: true, poseAssist: true, easy: true, press: true, footAssist: true, wallRest: false }); courseSelect(G, C, 0);
  const step = (k, inp = {}, cmd = []) => { for (let i = 0; i < k; i++) { sim.step({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd: i ? [] : cmd }); courseStep(G, { tick: sim.tick, on: sim.climb.on, onGround: !!sim.body.onGround, pos: sim.body.pos.toArray(), hands: sim.climb.hands.map(h => ({ st: h.st, box: h.st === 'hold' && h.edge ? h.edge.box : null })) }, 1 / 120);
      const v = courseView(G), s = `${v.phase}#${v.try ? v.try.id : 0}`; if (seq[seq.length - 1] !== s) seq.push(s); } };
  step(12); step(90, {}, [{ type: 'hand', i: 0, p: front(holds[0]) }]); step(90, {}, [{ type: 'hand', i: 1, p: front(holds[1]) }]); step(30);
  return { sim, G, seq, step, view: () => courseView(G) }; }
// 한 걸음씩 가며 단계별 걸음 수와, 시도가 끝난 걸음의 몸 상태를 적는다
const follow = (T, n, inp = {}) => { const cnt = { climb: 0, air: 0 }; let end = null; for (let k = 0; k < n && !end; k++) { T.step(1, inp); const v = T.view(); if (v.live) cnt[v.phase] = (cnt[v.phase] || 0) + 1; else end = { k, onGround: !!T.sim.body.onGround, y: T.sim.body.pos.y, why: v.try ? v.try.end : '' }; } return { cnt, end }; };
{ const T = mk(); ok('준비: 시작 홀드 둘을 잡음 → 시도 1, 오르는 중', T.view().phase === 'climb' && T.view().try.id === 1, T.seq.join(' → '));
  T.step(1, {}, [{ type: 'release', limb: 'hand', i: 0 }, { type: 'release', limb: 'hand', i: 1 }]); const r = follow(T, 120);
  ok('① 바닥에 선 채 두 손을 놓음 → 곧 지상 대기가 되어 시도 1이 "내려옴"으로 끝난다', !!r.end && r.end.onGround && r.end.why === '내려옴' && T.G.nTry === 1, `단계 ${T.seq.join(' → ')} · ${r.end ? r.end.k : '-'}걸음 뒤`); }
const REL = [{ type: 'release', limb: 'hand', i: 0 }, { type: 'release', limb: 'hand', i: 1 }], JN = +(process.env.JN || 14);
{ const T = mk(); T.step(JN, { jump: true }); T.step(1, { jump: true }, REL); const r = follow(T, 600), air = r.cnt.air || 0;
  ok('② 벽에서 뛰어오르다 두 손을 놓음: 손 없는 공중 동안 시도 1이 이어지고, 발이 땅을 디딘 걸음에 끝난다', air > 5 && !!r.end && r.end.onGround && r.end.why === '내려옴' && T.G.nTry === 1 && T.view().try.airT > 0.04, `단계 ${T.seq.join(' → ')} · 공중 ${air}걸음(${(air / 120).toFixed(2)}초) · 끝난 걸음의 몸 높이 ${r.end ? r.end.y.toFixed(2) : '-'}m`);
  T.step(60); ok('   내려선 뒤: 선택은 초록 그대로, 시도 수 1', T.view().course.id === 'green' && T.view().rec.tries === 1, T.seq.join(' → ')); }
{ const T = mk(), t0 = T.view().try.t0; T.step(JN, { jump: true }); T.step(1, { jump: true }, REL); let air = 0; for (let k = 0; k < 6; k++) { T.step(1); if (T.view().phase === 'air') air++; }
  T.step(1, {}, [{ type: 'hand', i: 1, p: front(holds[1]) }]); let got = -1; for (let k = 0; k < 300 && got < 0 && T.view().live; k++) { T.step(1); if (T.view().phase === 'air') air++; if (T.sim.climb.hands[1].st === 'hold') got = k; } if (got >= 0) T.step(30); const v = T.view();
  if (air < 3) ok('④ 손 없는 공중에서 다시 잡기: 공중이 되지 않았다(이 시험의 조건이 서지 않음)', false, T.seq.join(' → '));
  else if (got < 0) ok('④ 손 없는 공중에서 시작 홀드로 손을 보냄: 내려설 때까지 잡지 못함 → 내려선 걸음에 시도 1이 내려옴으로 끝난다(공중에서 새 시도가 생기지 않음. 내려선 뒤에 잡으면 그것은 새 시도다)', !v.live && T.G.nTry === 1 && v.try.end === '내려옴', `단계 ${T.seq.join(' → ')} · 공중 ${air}걸음 · ${T.sim.climb.hands[1].why || ''}`);
  else ok('④ 손 없는 공중에서 시작 홀드를 다시 잡음: 같은 시도(번호 1·같은 시작 시각), 시도 수 1, 색 지킴 그대로', v.live && v.try.id === 1 && v.try.t0 === t0 && v.rec.tries === 1 && v.try.clean && v.try.airT > 0.02, `단계 ${T.seq.join(' → ')} · 공중 ${air}걸음 · 손을 보내고 ${got}걸음 뒤 잡음`); }
{ const T = mk(), t0 = T.view().try.t0; T.step(1, { jump: true }); T.step(1, { jump: true }, [{ type: 'hand', i: 1, p: front(holds[3]) }]); let got = -1, air = 0; for (let k = 0; k < 400 && got < 0 && T.view().live; k++) { T.step(1, k < 40 ? { jump: true } : {}); if (T.view().phase === 'air') air++; const h = T.sim.climb.hands[1]; if (h.st === 'hold' && h.edge && h.edge.box === holds[3]) got = k; }
  T.step(60); const v = T.view();
  if (got < 0) ok('③ 뛰며 초록 4로 손을 보냄: 잡지 못했다(이 시험의 조건이 서지 않음 — 뛰어 잡기가 성립하지 않음)', false, `단계 ${T.seq.join(' → ')} · ${T.sim.climb.hands[1].why || ''}`);
  else ok('③ 뛰며 초록 4를 잡음: 같은 시도(번호 1·같은 시작 시각), 시도 수 1, 색 지킴 그대로', v.live && v.try.id === 1 && v.try.t0 === t0 && v.rec.tries === 1 && v.try.clean, `단계 ${T.seq.join(' → ')} · 공중 ${air}걸음 · ${got}걸음 뒤 잡음 · 손 ${T.sim.climb.hands.map(h => (h.st === 'hold' && h.edge ? h.edge.box.name : '-')).join('/')}`); }
console.log(`코스 흐름: 통과 ${pass} · 실패 ${fail}`); process.exit(fail ? 1 : 0);
