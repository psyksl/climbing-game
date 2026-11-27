// 뻗기 전 검사의 답이 낡지 않는가(p3d-0.15.6, GPT의 0.15.5 검토 2절 A — "목표를 겨누고 잠깐 기다리면 자세가 바뀌어도 예전 답을 재사용한다").
// GPT의 재현(첨부 HTML에 고정된 reproduce_cache.cjs)을 저장소의 소스로 옮긴 것이다. **스크립트 입력(사람 손 아님).**
//   ① 재현 장면: 노랑 시작 두 손(쉬운 조작·전신 연결·검사 켬) → 왼손 노랑 3을 겨누고 10걸음 → 미리보기를 부르며 WAIT걸음 → 같은 손 명령.
//      "쓰인 답"(명령이 실제로 따른 결정)과 "그 걸음의 상태에서 처음부터 새로 계산한 답"이 같은가, 끝에 두 손이 남는가
//   ② 같은 목표를 오래 겨눔: 기다리는 걸음 수 0~90을 훑어 ①을 되풀이(쓰인 답 ≠ 새 답인 것이 0인가)
//   ③ 미리보기를 부른 것 자체가 물리 상태를 바꾸지 않는가: 미리보기를 걸음마다 부른 실행과 한 번도 부르지 않은 실행의 명령 직전 상태·끝 상태가 같은가
//   ④ 몸을 옮긴 뒤 같은 목표: 겨눈 채 A를 0.15초 눌러 몸을 옮긴 뒤 명령 — 쓰인 답 = 새 답
//   ⑤ 옵션을 바꾼 뒤: 겨눈 채 전신 연결을 끄고(답의 뜻이 달라진다) 명령 — 쓰인 답 = 새 답
// 사용: [MODE=clip] [OLDPLANCACHE=1(0.15.5의 캐시 — 결함 재현)] node test/plan_cache_check.mjs
import { prov, provLine, provOptLine } from './provenance.mjs';
import fs from 'fs'; import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), imp = f => import(pathToFileURL(path.join(HERE, '../src', f)).href), E = process.env;
const { buildCharacter } = await imp('rig.js'), { makeGym } = await imp('world.js'), { makeSim } = await imp('sim.js'), { probeHand, planFresh } = await imp('climb.js'), THREE = await import('three');
const CLIPS = E.MODE === 'clip' ? JSON.parse(fs.readFileSync(path.join(HERE, '../assets_local/clips.json'), 'utf8')) : null, rig = buildCharacter(), world = makeGym();
console.log(provLine(prov()));
let pass = 0, fail = 0; const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${info}`); ok ? pass++ : fail++; };
const front = (b, n) => { const c = b.min.clone().add(b.max).multiplyScalar(0.5), half = Math.abs(n.x) * (b.max.x - b.min.x) / 2 + Math.abs(n.z) * (b.max.z - b.min.z) / 2; return c.addScaledVector(n, half).setY(b.max.y); };
// 장면 하나: 시작 두 손 → 목표를 겨누고 pre걸음 → (미리보기를 부르며) wait걸음 → mid(sim, step)(선택) → 명령 → 420걸음
function run(o) { const C = world.courses.find(c => c.id === o.course), sim = makeSim(rig, world, CLIPS), n = new THREE.Vector3(...C.frame.n), holds = world.boxes.filter(b => b.course === C.id && b.role !== 'foot').sort((a, b) => a.seq - b.seq);
  sim.reset({ pos: C.startPos, yaw: C.startYaw }); Object.assign(sim.opt, { posture: 'fb', grabAssist: true, poseAssist: true, easy: true, press: true, footAssist: true, wallRest: false, keepHold: false, linkPose: o.link !== false, planReach: true });
  let look = null; const step = (k, cmd = [], inp = {}) => { for (let j = 0; j < k; j++) sim.step({ mx: 0, mz: 0, cxSign: 1, ...(look ? { look } : {}), ...inp, cmd: j ? [] : cmd }); };
  step(12); for (let j = 0; j < 2; j++) { look = front(holds[j], n).toArray(); step(90, [{ type: 'hand', i: j, p: look }]); }
  const K = sim.climb, tgt = world.boxes.find(b => b.name === o.hold), p = front(tgt, n), i = o.hand; look = p.toArray(); step(o.pre ?? 10);
  const pv = []; for (let k = 0; k <= o.wait; k++) { if (k) step(1); if (o.preview !== false) { const pr = probeHand(sim, i, p); pv.push(pr.ok ? 'ok' : pr.why || '안 됨'); } }
  if (o.mid) o.mid(sim, step);
  const sig = () => JSON.stringify([sim.tick, sim.body.pos.toArray(), sim.body.vel.toArray(), Array.from(K.fb.x), Array.from(K.fb.xs), Array.from(K.fb.v), K.hands.map(h => [h.st, h.goal.toArray()]), K.feet.map(f => [f.st, f.ank ? f.ank.toArray() : null])]);
  // "그 걸음의 상태에서 처음부터 새로 계산한 답" — 캐시·진행 중인 계산을 쓰지 않는다(상태를 바꾸지 않는다)
  const s0 = sig(), fresh = planFresh(sim, i, p), pure = s0 === sig(), log0 = K.log.length;
  const pl0 = K.planLast; step(1, [{ type: 'hand', i, p: p.toArray() }]); let used = K.planLast !== pl0 ? K.planLast : null, waited = 0;
  // 계산을 기다리는 명령(p3d-0.15.6)은 몇 걸음 뒤에 결정이 난다 → 결정이 날 때까지(60걸음 안) 따라간다
  for (let k = 0; k < 420; k++) { step(1); if (!used && K.planLast !== pl0) { used = K.planLast; waited = k + 1; } }
  const ev = K.log.slice(log0).filter(e => !/^(try|bump)$/.test(e.type)).map(e => `${e.type}:${e.why || ''}`);
  return { fresh: fresh ? fresh.act + (fresh.kind ? '·' + fresh.kind : '') : '-', used: used ? used.act + (used.kind ? '·' + used.kind : '') : '-', waited, hands: K.hands.map(h => h.st), pv, sig0: s0, end: sig(), pure, ev, optLine: provOptLine(sim) }; }
const Y = { course: 'yellow', hold: '노랑 3', hand: 0 };
// ① GPT의 재현
{ const r = run({ ...Y, wait: 17 }); console.log(r.optLine);
  check('① 겨누고 17걸음 기다린 뒤 누름: 명령이 따른 답 = 그 상태에서 새로 계산한 답', r.used === r.fresh, `쓰인 답 ${r.used} · 새 답 ${r.fresh} · 기다린 걸음 ${r.waited} · 미리보기 처음 "${r.pv[0]}" → 끝 "${r.pv[r.pv.length - 1]}"`);
  check('① 그 명령 뒤 두 손이 그대로 남는다(새 답이 거부일 때)', !/^deny/.test(r.fresh) || (r.hands[0] === 'hold' && r.hands[1] === 'hold'), `끝 손 ${r.hands.join('/')} · 사건 ${r.ev.slice(0, 4).join(' | ')}`);
  check('① 새 답을 계산해 본 것이 상태를 바꾸지 않는다', r.pure); }
// ② 기다리는 걸음 수를 훑는다
{ const bad = [], lost = [], acts = {}; for (const w of [0, 1, 2, 3, 5, 8, 12, 17, 24, 30, 45, 60, 90]) { const r = run({ ...Y, wait: w }); acts[w] = r.used; if (r.used !== r.fresh) bad.push(`${w}걸음: 쓰인 ${r.used} ≠ 새 ${r.fresh}`); if (/^deny/.test(r.fresh) && r.hands.some(h => h !== 'hold')) lost.push(`${w}걸음 ${r.hands.join('/')}`); }
  check('② 기다린 걸음 0~90의 열세 가지: 쓰인 답 ≠ 새 답인 것 0', !bad.length, bad.join(' · ') || Object.entries(acts).map(([w, a]) => `${w}:${a}`).join(' '));
  check('② 새 답이 거부인데 손을 잃은 것 0', !lost.length, lost.join(' · ')); }
// ③ 미리보기를 부르든 안 부르든 같은 계산
{ const a = run({ ...Y, wait: 17 }), b = run({ ...Y, wait: 17, preview: false });
  check('③ 미리보기를 걸음마다 부른 실행과 부르지 않은 실행: 명령 직전의 상태가 같다', a.sig0 === b.sig0);
  check('③ 끝 상태·쓰인 답도 같다(미리보기가 결과를 바꾸지 않는다)', a.end === b.end && a.used === b.used, `부름 ${a.used} ${a.hands.join('/')} · 안 부름 ${b.used} ${b.hands.join('/')}`); }
// ④ 몸을 옮긴 뒤 같은 목표
{ const r = run({ ...Y, wait: 17, mid: (sim, step) => { step(18, [], { cx: -1 }); step(20); } });
  check('④ 겨눈 채 몸을 옆으로 옮긴 뒤 누름: 쓰인 답 = 새 답', r.used === r.fresh, `쓰인 ${r.used} · 새 ${r.fresh} · 끝 손 ${r.hands.join('/')}`); }
// ⑤ 옵션을 바꾼 뒤
{ const r = run({ ...Y, wait: 17, mid: sim => { sim.opt.linkPose = false; } });
  check('⑤ 겨눈 채 전신 연결을 끈 뒤 누름: 쓰인 답 = 새 답', r.used === r.fresh, `쓰인 ${r.used} · 새 ${r.fresh} · 끝 손 ${r.hands.join('/')}`); }
// 정상 경로가 그대로인가(초록 3 왼손): 기다린 걸음 0·17·60
{ const out = []; let ok = true; for (const w of [0, 17, 60]) { const r = run({ course: 'green', hold: '초록 3', hand: 0, wait: w }); out.push(`${w}걸음: ${r.used}(새 ${r.fresh}) 기다림 ${r.waited} 끝 ${r.hands.join('/')}`); if (r.used !== r.fresh || r.hands.some(h => h !== 'hold')) ok = false; }
  check('정상 경로(초록 시작 → 왼손 초록 3): 기다린 걸음 0·17·60 모두 잡고 두 손 유지, 쓰인 답 = 새 답', ok, out.join(' · ')); }
console.log(`\n통과 ${pass} · 실패 ${fail}`);
