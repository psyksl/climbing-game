// 클라이밍장 코스를 오르는 시험 봇(p3d-0.14.0). **스크립트 입력이다(사람 손 아님)** — 봇이 오른다고 사람이 오를 수 있다는 뜻이 아니다.
// 플레이어와 같은 명령만 쓴다: 화면 시선으로 겨눈 자리(쉬운 조작이면 조준 맞춤을 거친다)로 손·발 명령, W·A·D(몸), Space(뛰기). 물리·판정을 건드리지 않는다.
// 하는 것: 코스의 손 홀드를 차례대로(베타) 잡는다. 다음 홀드가 미리보기로 닿지 않으면 → 코스의 발판으로 발을 올리고 → W → 그래도 안 되면 그냥 보낸다(쉬운 조작의 예약·자동 몸 맞추기가 받는다).
//   jump 표시가 있는 홀드는 먼저 누르고 뛴다. 두 손이 완등 홀드를 0.5초 잡으면 완등. 떨어지면 실패.
// 대충 겨누기: NOISE(m)만큼 겨눈 자리를 화면에서 옆·위아래로 흔든다(씨앗 SEED마다 같은 흔들림). 카메라는 기본 시점 한 자리(벽 뒤 3.6m, 0.25rad 비스듬히 — main.js의 T).
// 사용: [MODE=clip] [EASY=0|1(기본 1 = 화면 기본)] [NOISE=0.08] [SEED=1] [COURSE=green] [TRACE=1] [OUT=결과.jsonl] node test/gym_bot.mjs
import { prov, provLine } from './provenance.mjs';
import fs from 'fs'; import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), imp = f => import(pathToFileURL(path.join(HERE, '../src', f)).href);
const { buildCharacter } = await imp('rig.js'), { makeGym, rayHit } = await imp('world.js'), { makeSim } = await imp('sim.js'), { limbState, aimGrip, probeHand, probeFoot } = await imp('climb.js'), THREE = await import('three');
const E = process.env, CLIPS = E.MODE === 'clip' ? JSON.parse(fs.readFileSync(path.join(HERE, '../assets_local/clips.json'), 'utf8')) : null, rig = buildCharacter();
const EASY = E.EASY !== '0', NOISE = +(E.NOISE || 0), SEEDS = (E.SEED || '1').split(',').map(Number), TRACE = !!E.TRACE, OUT = E.OUT;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z), f2 = v => (+v).toFixed(2);
// LADDER=0.20,0.25,... = 재기용 사다리 코스(초록과 같은 큰 홀드, 손 홀드 사이의 높이만 바꾼다 — 왼·오른 번갈아. 발판도 같은 간격). 클라이밍장 코스 대신 이것만 오른다
const LAD = E.LADDER ? E.LADDER.split(',').map(Number) : null;
const ladder = (s, k) => { const hands = [[-0.18, 1.50, 0.32, 'start'], [0.18, 1.50, 0.32, 'start']]; let y = 1.50; for (let j = 0; y + s < 3.45; j++) { y += s; hands.push([j % 2 ? 0.18 : -0.18, +y.toFixed(3), 0.32]); } hands.push([0, +(y + s).toFixed(3), 0.6, 'top']);
  const feet = []; for (let fy = 0.30, j = 0; fy < y - 1.0; fy += s, j++) feet.push([j % 2 ? 0.38 : -0.38, +fy.toFixed(3), 0.24]); return { id: 'lad' + Math.round(s * 100), name: `사다리${Math.round(s * 100)}`, grade: '재기', color: '#3fa34d', wall: 'main', at: -6.6 + 0 * k, hands, feet }; };
const GYMOPT = LAD ? { courses: LAD.map(ladder) } : E.FILLER ? { filler: +E.FILLER } : {};
const mulberry = a => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
console.log(provLine(prov()), `· 쉬운 조작 ${EASY ? '켬' : '끔'} · 누르기 ${E.PRESS === '1' ? '켬' : '끔'} · 흔들기 ${NOISE * 100}cm`);

function climbCourse(courseId, seed) {
  const world = makeGym(LAD ? { courses: GYMOPT.courses.filter(c => c.id === courseId), free: false } : { ...GYMOPT, free: E.FREE !== '0' }), C = world.courses.find(c => c.id === courseId), sim = makeSim(rig, world, CLIPS), rnd = mulberry(seed * 7919 + courseId.length);
  sim.reset({ pos: C.startPos, yaw: C.startYaw }); Object.assign(sim.opt, { wallRest: false, footAssist: true, grabAssist: true, poseAssist: true, posture: 'fb', easy: EASY, press: E.PRESS === '1' });
  const W = C.frame, t = V3(...W.t), n = V3(...W.n), o = V3(...W.o), uOf = p => p.clone().sub(o).dot(t);
  const log = [], ev = [], res = { course: courseId, seed, ok: false, t: 0, moves: 0, rejects: 0, slips: 0, why: '', at: '' };
  let look = null, inp = {}, fell = false, onWall = false, topT = 0;
  const say = s => { log.push(`${f2(sim.tick / 120)} ${s}`); if (TRACE) console.log(`  ${f2(sim.tick / 120)} ${s}`); };
  // 카메라: 등 뒤 3.6m·0.25rad 비스듬히(main.js의 T). 화면처럼 벽·기둥에 막히면 그 앞까지 당긴다(옆면 코스는 비스듬한 쪽이 옆 벽 속이었다)
  const cam = () => { const tg = sim.body.pos.clone().add(V3(0, 1.3, 0)), c = tg.clone().addScaledVector(t, 0.88).addScaledVector(n, 3.46).add(V3(0, 0.43, 0)), k = rayHit(world, tg, c, true); return k < 1 ? tg.lerp(c, Math.max(0.2, k - 0.05)) : c; };
  // 화면에서 겨누기: q(세계 자리)를 옆(t)·위로 흔들어 시선을 쏘고 처음 닿은 곳(쉬운 조작이면 조준 맞춤). 겨눈 곳(look)은 맞추기 전의 닿은 점
  const aimAt = (q, hand) => { const nx = (rnd() * 2 - 1) * NOISE, ny = (rnd() * 2 - 1) * NOISE, c0 = cam(), q2 = q.clone().addScaledVector(t, nx).add(V3(0, ny, 0)), d = q2.clone().sub(c0).normalize(), far = c0.clone().addScaledVector(d, 40), k = rayHit(world, c0, far), hit = k < 1 ? c0.clone().lerp(far, k) : null;
    if (hit) look = hit.toArray(); const g = hand && EASY && hit ? aimGrip(world, c0, d, hit, sim.climb.hands.filter(h => h.st === 'hold').map(h => h.grip)) : null; return (g ? g.p : hit) || q; };
  const rec = E.REC ? [] : null;
  const step = (k, cmd = []) => { for (let i = 0; i < k; i++) { const x = { mx: 0, mz: 0, cxSign: 1, ...(look ? { look } : {}), ...inp, cmd: i ? [] : cmd }; if (rec) rec.push(JSON.parse(JSON.stringify(x))); sim.step(x);
      for (const e of sim.climb.events) { ev.push(e); if (e.type === 'reject') res.rejects++; if (e.type === 'slip') res.slips++; if (TRACE && !/^(try|bump|lift)$/.test(e.type)) say(`${e.type} ${e.name || ''} ${e.why || ''}`); if (e.type === 'exit') { fell = onWall && sim.body.pos.y > 0.25; } }
      if (sim.climb.on) onWall = true; const L = limbState(sim.climb), top = L.hands.every(h => h.st === 'hold' && /완등/.test(h.box) && h.box.startsWith(C.name)); topT = top ? topT + 1 / 120 : 0; if (topT > 0.5) return 'top'; if (fell && !sim.climb.on) return 'fell'; }
    return ''; };
  const L = () => limbState(sim.climb), held = () => L().hands.map(h => (h.st === 'hold' ? h.box : ''));
  const edgePt = (h, du = 0) => { const c = h.min.clone().add(h.max).multiplyScalar(0.5), d = c.clone().sub(o).dot(n), u = uOf(c) + du; return o.clone().addScaledVector(t, u).addScaledVector(n, Math.max(d, 0) + 0.07 - 0.0).setY(h.max.y); }; // 턱의 앞 모서리 가운데(조금 옆으로)
  const frontPt = h => { const c = h.min.clone().add(h.max).multiplyScalar(0.5), u = uOf(c); return o.clone().addScaledVector(t, u).addScaledVector(n, 0.14).setY(h.max.y); };
  const footPt = (f, du = 0) => { const c = f.min.clone().add(f.max).multiplyScalar(0.5); return c.clone().addScaledVector(t, du).setY(f.max.y); };
  // 손 하나를 홀드로: 미리보기가 안 되면 발 올리기 → W → 그래도 안 되면 보낸다. 돌려주는 값 = 'ok' | 'top' | 'fell' | 까닭
  const sendHand = (i, h, du, jump) => { let q = frontPt(h).addScaledVector(t, du);
    for (let attempt = 0; attempt < 3; attempt++) {
      // 손이 가는 길이 막혔다고 거부되면 같은 홀드의 다른 자리(가운데 쪽으로 12cm)를 겨눠 본다(사람도 그렇게 한다)
      if (attempt && /길이 막힘|턱에 걸려/.test(L().hands[i].why || '')) { du = du - Math.sign(du || (i ? 1 : -1)) * 0.12; q = frontPt(h).addScaledVector(t, du); say(`  다른 자리를 겨눔(${f2(du)})`); }
      if (sim.climb.on) { const z0 = approach(i, q, h, jump); if (z0) return z0; }
      const p = aimAt(q, true); res.moves++; say(`${i ? '오른손' : '왼손'} → ${h.name}${jump ? ' (뛰며)' : ''} 겨눈 자리 ${p.toArray().map(f2).join(',')}`);
      let z; if (jump) { inp = { jump: true }; z = step(1); if (!z) z = step(1, [{ type: 'hand', i, p: p.toArray() }]); if (!z) z = step(40); inp = {}; if (z) return z; }
      else { z = step(1, [{ type: 'hand', i, p: p.toArray() }]); if (z) return z; }
      for (let k = 0; k < 40; k++) { z = step(10); if (z) return z; const x = L().hands[i]; if (x.st === 'hold' && x.box === h.name) { z = step(40); return z || (L().hands[i].box === h.name ? 'ok' : '잡은 뒤 놓침'); } if (x.st === 'free' && !x.arm && k > 2) break; }
      say(`  ${h.name}: 잡지 못함(${L().hands[i].why || '-'})`); }
    return `${h.name}을(를) 잡지 못함: ${L().hands[i].why || '-'}`; };
  // 다가가기(사람이 미리보기를 보며 하는 것): 닿지 않으면 → 발 올리기 → 옆으로 멀면 A·D → W. 닿더라도 잡기 보정으로 겨우 닿는 거리(3cm 넘게)면 W를 조금 더(0.6초까지).
  //   뛰어 잡는 홀드는 미리보기와 상관없이 두 번 다가간 뒤 뛴다
  const okNow = (i, q) => probeHand(sim, i, q).ok, bodyU = () => uOf(sim.body.pos);
  const approach = (i, q, h, jump) => { let z;
    for (let r = 0; r < 2 && (jump || !okNow(i, q)); r++) { if (stepUp(h) === 'fell') return 'fell';
      const lat = uOf(q) - bodyU(); if (Math.abs(lat) > 0.18) { inp = { cx: Math.sign(lat) }; for (let k = 0; k < 10 && !okNow(i, q) && !z; k++) z = step(10); inp = {}; if (z) return z; z = step(20); if (z) return z; }
      inp = { cy: 1 }; for (let k = 0; k < 12 && (jump || !okNow(i, q)) && !z; k++) z = step(10); inp = {}; if (z) return z; z = step(30); if (z) return z; }
    const pr = probeHand(sim, i, q); if (!jump && pr.ok && (pr.assist || 0) > 0.03) { inp = { cy: 1 }; for (let k = 0; k < 6 && (probeHand(sim, i, q).assist || 0) > 0.03 && !z; k++) z = step(10); inp = {}; if (z) return z; z = step(20); if (z) return z; }
    return ''; };
  // 발 올리기: 다음 손 홀드가 닿지 않을 때, 아래쪽 발부터 코스의 발판 가운데 디딜 수 있는(미리보기 = 같은 판정) 더 높은 곳으로. 다음 손 홀드보다 1m 넘게 낮은 것만
  const stepUp = h => { const Lf = L().feet, order = [0, 1].sort((a, b) => ((Lf[a].p || [0, -9])[1]) - ((Lf[b].p || [0, -9])[1]));
    for (const i of order) { const cur = Lf[i].st === 'plant' ? Lf[i].p[1] : -1, other = Lf[1 - i].st === 'plant' ? Lf[1 - i].box : '';
      const cand = C.footholds.filter(f => f.max.y > cur + 0.05 && f.max.y < h.max.y - 0.95 && f.name !== other).map(f => ({ f, du: 0 })).filter(c => probeFoot(sim, i, footPt(c.f)).ok).sort((a, b) => b.f.max.y - a.f.max.y);
      if (TRACE && !cand.length) say(`  ${i ? '오른발' : '왼발'}(지금 ${Lf[i].box || '-'}) 올릴 발판 없음: ${C.footholds.filter(f => f.max.y > cur + 0.05 && f.max.y < h.max.y - 0.95 && f.name !== other).map(f => `${f.name} ${probeFoot(sim, i, footPt(f)).why}`).join(' / ')} · 몸 y ${f2(sim.body.pos.y)}`);
      if (!cand.length) continue; const f = cand[0].f, p = aimAt(footPt(f), false); say(`${i ? '오른발' : '왼발'} → ${f.name}`);
      let z = step(1, [{ type: 'foot', i, p: p.toArray() }]); if (z) return z; for (let k = 0; k < 15; k++) { z = step(10); if (z) return z; const x = L().feet[i]; if (x.st === 'plant' && x.box === f.name) break; if (x.st === 'free' && k > 3) break; }
      return 'step'; }
    return ''; };
  // 시작: 시작 홀드에 두 손(홀드가 하나면 둘 다 그 홀드에 — 옆으로 6cm씩)
  const starts = C.holds.filter(h => h.role === 'start'), rest = C.holds.filter(h => h.role !== 'start');
  let z = step(30);
  const sl = starts.length === 1 ? [[0, starts[0], -0.07], [1, starts[0], 0.07]] : [[0, starts[0], 0], [1, starts[1], 0]];
  for (const [i, h, du] of [sl[1], sl[0]]) { z = sendHand(i, h, du, false); if (z !== 'ok') { res.why = z; res.at = '시작'; return fin(); } }
  // 베타: 홀드마다 손 하나. 손 = 홀드가 다른 손보다 오른쪽이면 오른손(엇갈리지 않게). 완등 홀드는 두 손(먼저 닿는 쪽, 그다음 다른 손을 옆에)
  for (const h of rest) { const Lh = L().hands, gu = Lh.map(x => (x.grip ? uOf(V3(...x.grip)) : 0)), hu = uOf(h.min.clone().add(h.max).multiplyScalar(0.5));
    const seqOf = x => { const b = C.holds.find(y => y.name === x.box); return b ? b.seq : -1; };
    let i; if (C.beta && C.beta[h.seq] !== undefined) i = C.beta[h.seq]; else { const lo = seqOf(Lh[0]) <= seqOf(Lh[1]) ? 0 : 1; i = lo; }
    if (h.role === 'top') { z = sendHand(i, h, i ? 0.08 : -0.08, false); if (z === 'top') break; if (z !== 'ok') { res.why = z; res.at = h.name; return fin(); } z = sendHand(1 - i, h, i ? -0.08 : 0.08, false); if (z !== 'ok' && z !== 'top') { res.why = z; res.at = h.name + '(두 손)'; return fin(); } if (z !== 'top') z = step(90); break; }
    // 옆으로 가는 코스: 손을 옮기면 다른 손과 엇갈리는 자리면, 먼저 그 손을 다른 손의 홀드에 모으고(맞잡기) 다른 손을 보낸다
    { const j = 1 - i, cross = (i === 1 && hu < gu[0] - 0.03) || (i === 0 && hu > gu[1] + 0.03); if (cross && Lh[j].box) { const hb = C.holds.find(y => y.name === Lh[j].box); say(`맞잡기: ${i ? '오른손' : '왼손'} → ${hb.name}`); z = sendHand(i, hb, i ? 0.07 : -0.07, false); if (z !== 'ok') { res.why = z; res.at = hb.name + '(맞잡기)'; return fin(); } i = j; } }
    z = sendHand(i, h, 0, !!h.jump); if (z === 'top') break; if (z !== 'ok') { res.why = z; res.at = h.name; return fin(); } }
  res.ok = z === 'top' || L().hands.every(x => x.st === 'hold' && /완등/.test(x.box)); if (!res.ok) { res.why = z || '두 손이 완등 홀드에 없음'; res.at = '완등'; }
  return fin();
  function fin() { if (rec) fs.writeFileSync(E.REC, JSON.stringify({ course: courseId, startPos: C.startPos, startYaw: C.startYaw, easy: EASY, res: { ok: res.ok }, inputs: rec, log })); res.t = +(sim.tick / 120).toFixed(2); res.hands = held(); res.feet = L().feet.map(f => (f.st === 'plant' ? f.box : '')); res.y = +sim.body.pos.y.toFixed(2); if (!TRACE && !res.ok) res.log = log.slice(-8); return res; }
}

const courses = E.COURSE ? E.COURSE.split(',') : makeGym(GYMOPT).courses.map(c => c.id);
for (const c of courses) for (const s of SEEDS) { const r = climbCourse(c, s); if (OUT) fs.appendFileSync(OUT, JSON.stringify(r) + '\n');
  console.log(`${r.ok ? '완등' : '실패'} [${c}] 씨앗 ${s} · ${r.t}초 · 손 명령 ${r.moves} · 거부 ${r.rejects} · 놓침 ${r.slips}${r.ok ? '' : ` · ${r.at}: ${r.why}`} · 손 ${r.hands.join('/')} · 발 ${r.feet.join('/')}`);
  if (!r.ok && r.log) for (const l of r.log) console.log('    ' + l); }
