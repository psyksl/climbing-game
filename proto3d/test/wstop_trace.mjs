// 사용자 녹화(p3d-0.15.7 2차, 2026-11-28)의 "손으로 잡고 발도 디뎠는데 W가 안 먹힘"을 명령 수준으로 다시 넣어 걸음마다 잰다. **스크립트 입력(사람 손 아님)**. 게임 코드는 고치지 않는다(읽기만).
// 장면: r1 = 왼손 빨강 2 + 오른발 빨강 발2 → W / r3 = r1에 오른손 빨강 시작을 먼저 시도 / r2 = 두 손 빨강 시작 + 왼발 발1 → W → 오른발 발2 → W
// 적는 것: 몸 높이·빠르기·머리 꼭대기·몸 빼기(wout)와 청한 거리(clearNeed)·화면에 뜨는 멈춘 까닭(upWhy)·안쪽 까닭과 여유(DBGUP)·세로 힘의 합(몸무게 배)·손발의 힘/한계
// 사용: [MODE=clip] SCN=r1|r2|r3 [LINK=0|1 PLAN=0|1 GUARD=0|1(기본 = 해 보기 설정: 셋 다 켬)] [WSEC=5] [CX=±1(W 2초 뒤부터 A·D를 함께)] [AD=1(멈추면 A·D 번갈아)] [BRIEF=1(요약만)] [DX=시작 자리를 벽과 나란히 옮김(m)] [SW=스위치,...] node test/wstop_trace.mjs
import { prov, provLine, provOptLine } from './provenance.mjs';
import fs from 'fs'; import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), imp = f => import(pathToFileURL(path.join(HERE, '../src', f)).href), E = process.env;
globalThis.DBGUP = 1; for (const k of (E.SW || '').split(',').filter(Boolean)) { const [a, v] = k.split('='); globalThis[a] = v === undefined ? 1 : +v; }
const { buildCharacter } = await imp('rig.js'), { makeGym } = await imp('world.js'), { makeSim } = await imp('sim.js'), THREE = await import('three');
const CLIPS = E.MODE === 'clip' ? JSON.parse(fs.readFileSync(path.join(HERE, '../assets_local/clips.json'), 'utf8')) : null, rig = buildCharacter(), world = makeGym();
const on = (k, d) => (E[k] !== undefined ? E[k] === '1' : d);
const SCN = { r1: { course: '빨강', steps: [['hand', 0, '빨강 2'], ['foot', 1, '빨강 발2'], ['W']] },
  r2: { course: '빨강', steps: [['hand', 0, '빨강 시작'], ['hand', 1, '빨강 시작'], ['foot', 0, '빨강 발1'], ['W', 1.0], ['foot', 1, '빨강 발2'], ['W']] },
  b7: { course: '파랑', stand: ['파랑 5', '파랑 6'], steps: [['hand', 0, '파랑 5'], ['hand', 1, '파랑 6'], ['foot', 1, '파랑 발6'], ['foot', 0, '파랑 발5'], ['W', 1.2], ['hand', 0, '파랑 7'], ['hand', 1, '파랑 8'], ['foot', 0, '파랑 발8'], ['foot', 1, '파랑 발7'], ['W']] },
  // b7p(p3d-0.15.8): 사용자 녹화 162~171초의 지지 상태(왼손 파랑 7 · 오른손 파랑 8 · 왼발 파랑 발8 · 오른발 파랑 발7)를 **시험용 발판 위에 서서 잡은 뒤 발판을 치워** 세운다 — 봇·명령으로는 그 자리까지 가지 못했다.
  //   사용자가 간 길(입력)의 재현이 아니라 같은 손발 지지의 대표 상태다. PLAT = 발판 윗면 높이(m)
  b7p: { course: '파랑', stand: ['파랑 7', '파랑 8'], plat: +(E.PLAT || 0.55), steps: [['hand', 0, '파랑 7'], ['hand', 1, '파랑 8'], ['foot', 0, '파랑 발8'], ['foot', 1, '파랑 발7'], ['unplat'], ['W']] },
  r3: { course: '빨강', steps: [['hand', 0, '빨강 2'], ['hand', 1, '빨강 시작'], ['foot', 1, '빨강 발2'], ['W']] } }[E.SCN || 'r1']; if (E.STEPS) SCN.steps = JSON.parse(E.STEPS);
const C = world.courses.find(c => c.name === SCN.course || c.id === SCN.course) || world.courses.find(c => world.boxes.some(b => b.course === c.id && b.name.startsWith(SCN.course)));
if (!C) { console.log('코스 없음', world.courses.map(c => c.id + '/' + c.name).join(' ')); process.exit(1); }
const n = new THREE.Vector3(...C.frame.n), box = nm => world.boxes.find(b => b.name === nm);
const front = b => { const c = b.min.clone().add(b.max).multiplyScalar(0.5), half = Math.abs(n.x) * (b.max.x - b.min.x) / 2 + Math.abs(n.z) * (b.max.z - b.min.z) / 2; return c.addScaledVector(n, half).setY(b.max.y); }, top = b => b.min.clone().add(b.max).multiplyScalar(0.5).setY(b.max.y);
let PB = null; const sim = makeSim(rig, world, CLIPS); { const p0 = [...C.startPos], dx = +(E.DX || 0); if (SCN.plat) p0[1] = SCN.plat; if (SCN.stand) { const d0 = p0[0] * n.x + p0[2] * n.z, lat = SCN.stand.map(nm => { const x = box(nm), c = x.min.clone().add(x.max).multiplyScalar(0.5); return c.x * n.z - c.z * n.x; }).reduce((u, v) => u + v, 0) / SCN.stand.length; p0[0] = d0 * n.x + lat * n.z; p0[2] = d0 * n.z - lat * n.x; } p0[0] += dx * n.z; p0[2] -= dx * n.x; if (SCN.plat) { PB = { name: '시험 발판', min: new THREE.Vector3(p0[0] - 1.2, 0, p0[2] - 1.2), max: new THREE.Vector3(p0[0] + 1.2, SCN.plat, p0[2] + 1.2), kind: 'floor' }; const wz = C.frame.n; PB.min.addScaledVector(new THREE.Vector3(...wz), 0); world.boxes.push(PB); world.edges = null; world.edgesN = -1; } sim.reset({ pos: p0, yaw: C.startYaw }); } const K = sim.climb, b = sim.body;
Object.assign(sim.opt, { posture: 'fb', grabAssist: true, poseAssist: true, easy: true, press: true, autoBody: true, footAssist: false, wallRest: false, keepHold: false, linkPose: on('LINK', true), planReach: on('PLAN', true), autoGuard: on('GUARD', true) });
let look = null, nlog = 0; const f2 = v => (v == null ? '  -  ' : v.toFixed(3));
const logs = () => { const o = []; for (; nlog < K.log.length; nlog++) { const e = K.log[nlog]; o.push(`${e.t.toFixed(2)} ${e.type} ${e.name || ''} ${e.why || e.hold || ''}`); } return o; };
const step = (k, inp = {}, cmd = []) => { for (let i = 0; i < k; i++) sim.step({ mx: 0, mz: 0, cxSign: 1, ...(look ? { look } : {}), ...inp, cmd: i ? [] : cmd }); };
const hn = () => K.hands.map(h => (h.st === 'hold' && h.edge ? h.edge.box.name : h.st)).join('/'), fn = () => K.feet.map(f => (f.st === 'plant' && f.box ? f.box.name : f.st)).join('/');
console.log(provLine(prov()), '· 장면', E.SCN || 'r1', '· 스크립트 입력(사람 손 아님)'); console.log(provOptLine(sim));
step(20);
for (const [kind, a, nm] of SCN.steps) {
  if (kind === 'hand') { const p = front(box(nm)); look = p.toArray(); step(24); step(1, {}, [{ type: 'hand', i: a, p: p.toArray() }]); for (let k = 0; k < 420; k++) { step(1); const h = K.hands[a]; if (h.st === 'hold' && h.edge && h.edge.box.name === nm) break; if (h.st === 'free' && !h.arm && k > 30) break; } step(36); console.log(`손${a} → ${nm}: ${hn()}  | ${logs().join(' ; ')}`); }
  else if (kind === 'foot') { const p = top(box(nm)); look = p.toArray(); step(24); step(1, {}, [{ type: 'foot', i: a, p: p.toArray() }]); for (let k = 0; k < 300; k++) { step(1); const f = K.feet[a]; if (f.st === 'plant' && f.box && f.box.name === nm) break; if (f.st !== 'move' && k > 30) break; } step(24); console.log(`발${a} → ${nm}: ${fn()}  | ${logs().join(' ; ')}`); }
  else if (kind === 'unplat') { for (const w of [world, sim.world]) { const j = w.boxes.indexOf(PB); if (j >= 0) w.boxes.splice(j, 1); w.edges = null; w.edgesN = -1; } step(90); console.log(`발판을 치움(0.75초 뒤): 몸 높이 ${f2(b.pos.y)} · 손 ${hn()} · 발 ${fn()}  | ${logs().join(' ; ')}`); }
  else { const sec = a || +(E.WSEC || 3.5), N = Math.round(sec * 120); const y0 = b.pos.y; let stuckAt = -1, ymax = -9, nl2 = K.log.length; const why = {}, ev = [];
    console.log(`W ${sec}초 — 걸음  몸높이  빠르기  머리꼭대기  빼기(wout) 청함(clearNeed) 멈춘 까닭  손 / 발`);
    for (let k = 0; k < N; k++) { let inp = { cy: 1 }; if (E.CX && k >= 240) inp = { cy: 1, cx: +E.CX }; if (E.AD === '1' && stuckAt >= 0) inp = { cy: 1, cx: Math.floor((k - stuckAt) / 60) % 2 ? 1 : -1 };
      step(1, inp); if (stuckAt < 0 && k > 60 && Math.abs(b.vel.y) < 0.01) stuckAt = k;
      if (K.upWhy) why[K.upWhy] = (why[K.upWhy] || 0) + 1; ymax = Math.max(ymax, b.pos.y); for (const e of K.log.slice(nl2)) ev.push(`${e.type}${e.name ? ' ' + e.name : ''} ${e.why || ''}`.trim()); nl2 = K.log.length;
      if (!E.BRIEF && (k % 30 === 29 || k === N - 1)) { const T = K.T; console.log(`  ${String(k + 1).padStart(4)}  ${f2(b.pos.y)}  ${f2(b.vel.y)}  ${f2(T ? T.head.y + 0.1 : null)}  ${f2(K.wout || 0)}  ${f2(K.clearNeed || 0)}  ${(K.upWhy || '-').padEnd(5)} lim ${f2(K.upLimDbg)} ${(K.upWhyDbg || '-').padEnd(4)} ref-몸 ${f2(K.ref ? K.ref.y - b.pos.y : null)} 깊이 ${f2(b.pos.x * n.x + b.pos.z * n.z)} 옆 ${f2(b.pos.x * n.z - b.pos.z * n.x)} 발옆 ${K.feet.map(q => (q.st === 'plant' && q.w ? f2(q.w.x * n.z - q.w.z * n.x) : '-')).join(',')} 힘합 ${f2(K.FyDbg)} 손 ${K.hands.map(h => (h.st === 'hold' ? `${(h.load || 0).toFixed(2)}/${(h.cap || 0).toFixed(2)}${h.low ? 'L' : ''}${h.pressK ? 'P' : ''}${h.cone ? 'C' : ''}` : '-')).join(' ')} 발 ${K.feet.map(q => (q.st === 'plant' ? `${(q.load || 0).toFixed(2)}/${(q.cap || 0).toFixed(2)}` : '-')).join(' ')} ${K.guardHold ? 'guardHold ' : ''}${K.jamStop ? 'jamStop ' : ''} ${hn()} / ${fn()}  ${logs().join(' ; ')}`); } }
    if (!a) console.log(`  [요약] 끝 높이 ${((b.pos.y - y0) * 100).toFixed(1)}cm · 가장 높이 ${((ymax - y0) * 100).toFixed(1)}cm · 멈춘 까닭이 뜬 걸음 ${JSON.stringify(why)} / ${N} · 끝의 안쪽 까닭 ${K.upWhyDbg || '-'} 여유 ${f2(K.upLimDbg)} · 힘합 ${f2(K.FyDbg)} · 끝 손 ${hn()} 발 ${fn()} · 사건: ${[...new Set(ev)].join(' | ') || '없음'}`);
    console.log(`  → W ${sec}초 동안 몸 ${((b.pos.y - y0) * 100).toFixed(1)}cm 올라감${stuckAt >= 0 ? ` · ${(stuckAt / 120).toFixed(2)}초에 멈춤` : ''}`); }
}
for (const nm of new Set(SCN.steps.filter(s => s[2]).map(s => s[2]))) { const x = box(nm); console.log(`  ${nm}: 밑면 ${x.min.y.toFixed(3)} 윗면 ${x.max.y.toFixed(3)} 벽에서 튀어나온 끝 ${(Math.max(...[[x.min.x, x.min.z], [x.max.x, x.max.z]].map(c => c[0] * n.x + c[1] * n.z))).toFixed(3)}`); }
