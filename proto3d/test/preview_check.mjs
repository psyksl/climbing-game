// 미리보기(probeHand)와 실제 잡기의 맞대기(p3d-0.15.1, GPT 검토의 "초록 4" 재현에서 시작). **스크립트 입력이다(사람 손 아님).**
// 상태 = 클라이밍장 코스의 시작 두 홀드를 잡은 자세와, 거기서 다음 홀드를 번갈아 잡아 간 자세(W·A·D 없음, DEPTH까지). 겨눈 곳(look)을 걸음마다 넘긴다.
// 표본 = 각 상태에서 가슴 둘레 R(기본 1.15m) 안의 모든 홀드(코스 밖 홀드·발 홀드 포함) × 두 손. 겨눈 자리 = 홀드 앞 모서리 가운데.
// 실제 = 같은 상태를 처음부터 다시 만들어 그 손을 보내고 2초. "잡음" = 그 홀드를 잡고 있다. 몸 입력은 없다. 화면 기본 보조(잡기 보정·자세 보조·누르기·발 보조)는 켬.
//   쉬운 조작은 끔(예약·자동 몸 맞추기가 끼면 "지금 자세에서 닿는가"가 아니게 된다). EASY=1이면 켬으로도 본다(그때의 "안 됨 → 잡음"은 몸을 옮겨 잡은 것일 수 있다).
// 사용: [MODE=clip] [COURSES=green,yellow] [DEPTH=3] [R=1.15] [EASY=1] [OUT=파일.jsonl] node test/preview_check.mjs
import { prov, provLine, provOptLine } from './provenance.mjs';
import fs from 'fs'; import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), imp = f => import(pathToFileURL(path.join(HERE, '../src', f)).href);
const { buildCharacter } = await imp('rig.js'), { makeGym } = await imp('world.js'), { makeSim } = await imp('sim.js'), { probeHand, limbState, planHand } = await imp('climb.js'), THREE = await import('three');
const E = process.env, CLIPS = E.MODE === 'clip' ? JSON.parse(fs.readFileSync(path.join(HERE, '../assets_local/clips.json'), 'utf8')) : null, rig = buildCharacter();
const world = makeGym(), DEPTH = +(E.DEPTH || 3), R = +(E.R || 1.15), EASY = E.EASY === '1', f2 = v => (+v).toFixed(2);
console.log(provLine(prov()), `· 쉬운 조작 ${EASY ? '켬' : '끔'} · 깊이 ${DEPTH} · 둘레 ${R}m`);
const IDS = (E.COURSES || world.courses.map(c => c.id).join(',')).split(',');
const front = (b, n) => { const c = b.min.clone().add(b.max).multiplyScalar(0.5), half = Math.abs(n.x) * (b.max.x - b.min.x) / 2 + Math.abs(n.z) * (b.max.z - b.min.z) / 2; return c.addScaledVector(n, half).setY(b.max.y); };
// 코스 C에서 손 홀드를 d개째까지 잡은 상태를 만든다(실패하면 null). 돌려주는 값 = { sim, step }
function state(C, d) { const sim = makeSim(rig, world, CLIPS), n = new THREE.Vector3(...C.frame.n), holds = world.boxes.filter(b => b.course === C.id && b.role !== 'foot').sort((a, b) => a.seq - b.seq);
  sim.reset({ pos: C.startPos, yaw: C.startYaw }); Object.assign(sim.opt, { posture: 'fb', grabAssist: true, poseAssist: true, easy: EASY, press: true, footAssist: true, wallRest: false, keepHold: E.KEEP === '1', linkPose: E.LINK === '1' }); if (!globalThis.__optLine) console.log(globalThis.__optLine = provOptLine(sim) + ' — 화면 기본과 다른 것: 쉬운 조작' + (EASY ? ' 켬(같음)' : ' 끔(화면은 켬)'));
  let look = null; const step = (k, cmd = []) => { for (let i = 0; i < k; i++) sim.step({ mx: 0, mz: 0, cxSign: 1, ...(look ? { look } : {}), cmd: i ? [] : cmd }); }, setLook = p => { look = p.toArray(); };
  step(12); for (let j = 0; j < 2 + d; j++) { if (j >= holds.length) return null; const p = front(holds[j], n), i = j % 2; setLook(p); if (j >= 2) step(30); step(j < 2 ? 90 : 150, [{ type: 'hand', i, p: p.toArray() }]); const h = sim.climb.hands[i]; if (!(h.st === 'hold' && h.edge && h.edge.box === holds[j])) return null; }
  return { sim, step, setLook, n }; }
const rows = [], out = E.OUT ? fs.createWriteStream(E.OUT) : null;
for (const id of IDS) { const C = world.courses.find(c => c.id === id); if (!C) continue;
  for (let d = 0; d <= DEPTH; d++) { const S0 = state(C, d); if (!S0) break; const chest = S0.sim.body.pos.clone().add(new THREE.Vector3(0, 1.3, 0));
    const near = world.boxes.filter(b => !b.stair && !b.hidden && b.kind !== 'floor' && b.kind !== 'wall' && b.max.y - b.min.y < 0.3 && front(b, S0.n).distanceTo(chest) < R);
    for (const b of near) for (const i of [0, 1]) { const S = state(C, d), p = front(b, S.n), h0 = S.sim.climb.hands[i]; if (h0.st === 'hold' && h0.edge && h0.edge.box === b) continue;
      S.setLook(p); S.step(30); const pos0 = S.sim.body.pos.clone(), pr = probeHand(S.sim, i, p); if (!pr.grip) continue;
      const before = JSON.stringify([Array.from(S.sim.climb.fb.xs), S.sim.body.pos.toArray(), S.sim.climb.log.length, S.sim.climb.hands.map(h => [h.st, h.grip.toArray()])]); probeHand(S.sim, i, p);
      const pure = before === JSON.stringify([Array.from(S.sim.climb.fb.xs), S.sim.body.pos.toArray(), S.sim.climb.log.length, S.sim.climb.hands.map(h => [h.st, h.grip.toArray()])]);
      // PRED=1(p3d-0.15.5): 뻗기 전 검사의 예측(그대로 a / 버티는 팔을 지키며 g)을 함께 적는다 — 검사를 켜지 않은 채(실제는 그대로) 예측과 실제를 맞대어 보는 데 쓴다
      const pd = E.PRED === '1' ? planHand(S.sim, i, p) : null, pk = x => (x ? { lose: x.lose, when: x.when, t: +x.t.toFixed(3), jam: +Math.max(...x.jam).toFixed(3), far: +x.far.toFixed(3), ms: +x.ms.toFixed(1) } : null);
      const held0 = S.sim.climb.hands.map(h => h.st === 'hold'), log0 = S.sim.climb.log.length, k0 = S.sim.tick; let first = -1; S.step(1, [{ type: 'hand', i, p: p.toArray() }]);
      // p3d-0.15.2(GPT의 0.15.1 재검토): "2초 뒤 잡고 있는가"(got)만 보던 것을 나눈다 — first = 처음 그 홀드를 잡은 걸음(-1 = 한 번도 못 잡음), got = 2초 뒤에도 잡고 있음, lost = 버티던 다른 손이 풀림(lostWhy·lostCause = 그 까닭과 갈래)
      for (let k = 1; k < 240; k++) { S.step(1); const hh = S.sim.climb.hands[i]; if (first < 0 && hh.st === 'hold' && hh.edge && hh.edge.box.name === pr.name) first = S.sim.tick - k0; }
      const h = S.sim.climb.hands[i], got = h.st === 'hold' && !!h.edge && h.edge.box.name === pr.name, lost = held0[1 - i] && S.sim.climb.hands[1 - i].st !== 'hold';
      const evs = S.sim.climb.log.slice(log0).filter(e => e.limb === 'hand' && (e.type === 'release' || e.type === 'slip' || e.type === 'reject') && e.cause), oEv = evs.filter(e => e.i === 1 - i).pop(), mEv = evs.filter(e => e.i === i && e.cause !== 'command').pop();
      const row = { course: id, d, hold: b.name, i, ok: pr.ok, why: pr.why || '', short: pr.short === undefined ? null : +pr.short.toFixed(3), sure: pr.sure, first, got, lost, lostWhy: lost && oEv ? oEv.why : '', lostCause: lost && oEv ? oEv.cause : '', dropWhy: first >= 0 && !got && mEv ? mEv.why : '', dropCause: first >= 0 && !got && mEv ? mEv.cause : '', move: +S.sim.body.pos.distanceTo(pos0).toFixed(3), end: h.st === 'hold' ? '' : (limbState(S.sim.climb).hands[i].why || ''), pure, ...(pd ? { pred: { a: pk(pd.a), g: pk(pd.b) } } : {}) };
      rows.push(row); if (out) out.write(JSON.stringify(row) + '\n'); } } }
const by = (rs, key) => { const m = {}; for (const r of rs) m[key(r)] = (m[key(r)] || 0) + 1; return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '); };
const cnt = f => rows.filter(f).length, N = rows.length;
console.log(`표본 ${N} · 미리보기 됨 → 잡음 ${cnt(r => r.ok && r.got)} · 안 됨 → 못 잡음 ${cnt(r => !r.ok && !r.got)} · **안 됨 → 잡음 ${cnt(r => !r.ok && r.got)}** · **됨 → 못 잡음 ${cnt(r => r.ok && !r.got)}** · 미리보기가 상태를 바꿈 ${cnt(r => !r.pure)}`);
{ const okR = rows.filter(r => r.ok), f = okR.filter(r => r.first >= 0), keep = f.filter(r => r.got), both = keep.filter(r => !r.lost);
  console.log(`  미리보기 "됨" ${okR.length} 가운데: 처음 잡음 ${f.length} · 그 가운데 2초 유지 ${keep.length} · 그 가운데 버티던 손도 유지 ${both.length} ‖ 한 번도 못 잡음 ${okR.length - f.length} · 잡았다 놓침 ${f.length - keep.length}`);
  const L = rows.filter(r => r.lost); console.log(`  버티던 손이 풀림 ${L.length}/${N}: ` + (by(L, r => `${r.lostCause || '?'}(${(r.lostWhy || '').replace(/\(.*\)/, '')})`) || '-')); }
console.log('  안 됨 → 잡음의 미리보기 까닭: ' + (by(rows.filter(r => !r.ok && r.got), r => r.why.replace(/\(.*\)/, '')) || '-'));
console.log('  됨 → 못 잡음의 끝 까닭: ' + (by(rows.filter(r => r.ok && !r.got), r => r.end.replace(/\(.*\)/, '') || '(까닭 없음)') || '-'));
console.log('  안 됨 → 잡음(거리): 모자람 ' + rows.filter(r => !r.ok && r.got && r.short !== null).map(r => `${r.course}${r.d}/${r.hold}/${r.i ? '오' : '왼'} ${Math.round(r.short * 100)}cm·몸 ${Math.round(r.move * 100)}cm`).slice(0, 30).join(', '));
if (out) out.end();
