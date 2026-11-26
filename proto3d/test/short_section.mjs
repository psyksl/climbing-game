// 짧은 구간(p3d-0.15.2, GPT의 0.15.1 재검토가 고정한 구간): 초록 시작1·2 → 초록 3 → 4 → 5 → 6(맞잡기), 발은 초록 발 홀드. 지형은 그대로다.
// **스크립트 입력이다(사람 손 아님)** — 이 파일은 명령을 계산에 바로 넣어 순서와 걸리는 곳을 찾는 도구다. 실제 키·마우스로 같은 순서를 넣는 것은 test/short_browser.mjs.
// 순서(ROUTE): a = 발1 → 발2 → 발3 → 발4 순서로 디디는 길, b = 다른 발 순서(오른발부터, 발1을 쓰지 않음), c = 발 보조에 맡김(발 명령 없음)
// 걸음마다 보는 것: 수동으로 디딘 발이 발 보조에 의해 옮겨졌는가(step … 발 보조), 손이 풀린 까닭의 갈래, 거부.
// 사용: [MODE=clip] [ROUTE=a|b|c] [KEEP=1] [FOOT=0(발 보조 끔)] [TRACE=1] node test/short_section.mjs
import { prov, provLine } from './provenance.mjs';
import fs from 'fs'; import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), imp = f => import(pathToFileURL(path.join(HERE, '../src', f)).href);
const { buildCharacter } = await imp('rig.js'), { makeGym } = await imp('world.js'), { makeSim } = await imp('sim.js'), { limbState } = await imp('climb.js'), THREE = await import('three');
const E = process.env, CLIPS = E.MODE === 'clip' ? JSON.parse(fs.readFileSync(path.join(HERE, '../assets_local/clips.json'), 'utf8')) : null, rig = buildCharacter(), world = makeGym();
const C = world.courses.find(c => c.id === 'green'), n = new THREE.Vector3(...C.frame.n), box = nm => world.boxes.find(b => b.name === nm);
const front = b => { const c = b.min.clone().add(b.max).multiplyScalar(0.5), half = Math.abs(n.x) * (b.max.x - b.min.x) / 2 + Math.abs(n.z) * (b.max.z - b.min.z) / 2; return c.addScaledVector(n, half).setY(b.max.y); }, top = b => b.min.clone().add(b.max).multiplyScalar(0.5).setY(b.max.y);
export const ROUTES = {
  // a: 손을 먼저 올리고(3·4) 발을 하나씩 — 발 하나를 디디고 그 발로 올라선(W) 뒤 다음 발. 왼발부터
  a: [['hand', 0, '초록 시작1'], ['hand', 1, '초록 시작2'], ['hand', 0, '초록 3'], ['hand', 1, '초록 4'], ['foot', 0, '초록 발1'], ['W', 0.8], ['foot', 1, '초록 발2'], ['W', 0.8], ['hand', 0, '초록 5'], ['foot', 0, '초록 발3'], ['W', 0.8], ['hand', 1, '초록 6'], ['foot', 1, '초록 발4'], ['W', 0.6], ['hand', 0, '초록 6', -0.07]],
  // b: 다른 발 순서 — 오른발부터(발1을 쓰지 않음)
  b: [['hand', 0, '초록 시작1'], ['hand', 1, '초록 시작2'], ['hand', 0, '초록 3'], ['hand', 1, '초록 4'], ['foot', 1, '초록 발2'], ['W', 0.8], ['foot', 0, '초록 발3'], ['W', 0.8], ['hand', 0, '초록 5'], ['hand', 1, '초록 6'], ['foot', 1, '초록 발4'], ['W', 0.6], ['hand', 0, '초록 6', -0.07]],
  // c: 발 명령 없이(발 보조에 맡김)
  c: [['hand', 0, '초록 시작1'], ['hand', 1, '초록 시작2'], ['hand', 0, '초록 3'], ['hand', 1, '초록 4'], ['W', 1.5], ['hand', 0, '초록 5'], ['hand', 1, '초록 6'], ['W', 0.8], ['hand', 0, '초록 6', -0.07]],
  // d: 시작 홀드를 잡은 채 발부터(손은 어깨 높이) — 발 하나를 디디고 W
  d: [['hand', 0, '초록 시작1'], ['hand', 1, '초록 시작2'], ['foot', 0, '초록 발1'], ['W', 0.8], ['foot', 1, '초록 발2'], ['W', 0.8], ['hand', 0, '초록 3'], ['hand', 1, '초록 4'], ['foot', 0, '초록 발3'], ['W', 0.8], ['foot', 1, '초록 발4'], ['W', 0.8], ['hand', 0, '초록 5'], ['hand', 1, '초록 6'], ['W', 0.5], ['hand', 0, '초록 6', -0.07]],
};
export function runRoute(steps, opt = {}) {
  const sim = makeSim(rig, world, CLIPS), out = [], rec = []; sim.reset({ pos: C.startPos, yaw: C.startYaw }); const K = sim.climb;
  Object.assign(sim.opt, { posture: 'fb', grabAssist: true, poseAssist: true, easy: true, press: true, footAssist: opt.footAssist !== false, wallRest: false, keepHold: !!opt.keepHold, autoBody: opt.autoBody !== false });
  let look = null, nlog = 0; const manual = [null, null], moved = [], rel = {}, rej = [];
  const step = (k, inp = {}, cmd = []) => { for (let i = 0; i < k; i++) { const x = { mx: 0, mz: 0, cxSign: 1, ...(look ? { look } : {}), ...inp, cmd: i ? [] : cmd }; rec.push(x); sim.step(x);
      for (; nlog < K.log.length; nlog++) { const e = K.log[nlog]; if (e.limb === 'hand' && e.cause && e.cause !== 'command') rel[e.cause] = (rel[e.cause] || 0) + 1; if (e.type === 'reject' || e.type === 'deny') rej.push(`${e.name} ${e.why}`);
        if (e.limb === 'foot' && (e.type === 'step' || e.type === 'lift') && manual[e.i] && !e.user) moved.push(`${(e.t).toFixed(2)}초 ${e.name} ${e.type} ${e.why || ''}(수동으로 디딘 ${manual[e.i]}에서)`); } } };
  const feetNow = () => K.feet.map(f => (f.st === 'plant' && f.box ? f.box.name : f.st === 'move' ? '(가는 중)' : '-')), handsNow = () => K.hands.map(h => (h.st === 'hold' && h.edge ? h.edge.box.name : h.st === 'reach' ? '(뻗는 중)' : '-'));
  step(20);
  for (const [kind, a, b2, du = 0] of steps) { const t0 = sim.tick; let res = '';
    if (kind === 'hand') { const p = front(box(b2)).add(new THREE.Vector3(du, 0, 0)); look = p.toArray(); step(24); step(1, {}, [{ type: 'hand', i: a, p: p.toArray() }]); let k = 0; for (; k < 420; k++) { step(1); const h = K.hands[a]; if (h.st === 'hold' && h.edge && h.edge.box.name === b2) break; if (h.st === 'free' && !h.arm && k > 30) break; if (h.st === 'hold' && h.arm && k > 300) break; } step(36);
      const h = K.hands[a]; res = h.st === 'hold' && h.edge && h.edge.box.name === b2 ? '잡음' : `못 잡음(${h.why || (h.arm ? '예약 중' : '-')})`; }
    else if (kind === 'foot') { const p = top(box(b2)); look = p.toArray(); step(24); manual[a] = null; step(1, {}, [{ type: 'foot', i: a, p: p.toArray() }]); let k = 0; for (; k < 300; k++) { step(1); const f = K.feet[a]; if (f.st === 'plant' && f.box && f.box.name === b2) break; if (f.st !== 'move' && k > 20) break; } step(36);
      const f = K.feet[a]; if (f.st === 'plant' && f.box && f.box.name === b2) { manual[a] = b2; res = '디딤'; } else res = `못 디딤(${f.why || '-'} · 지금 ${feetNow()[a]})`; }
    else if (kind === 'W') { step(Math.round(a * 120), { cy: 1 }); step(36); res = `몸 높이 ${sim.body.pos.y.toFixed(2)}m`; }
    for (let i = 0; i < 2; i++) if (manual[i] && feetNow()[i] !== manual[i] && !moved.some(m => m.includes(`${i ? '오른발' : '왼발'}`) && m.includes(manual[i]))) moved.push(`${(sim.tick / 120).toFixed(2)}초 ${i ? '오른발' : '왼발'}이 ${manual[i]}에 있지 않음(지금 ${feetNow()[i]})`);
    for (let i = 0; i < 2; i++) if (manual[i] && feetNow()[i] !== manual[i]) manual[i] = null;
    out.push({ step: `${kind === 'W' ? 'W ' + a + '초' : (kind === 'hand' ? (a ? '오른손' : '왼손') : (a ? '오른발' : '왼발')) + ' → ' + b2}`, res, t: +((sim.tick - t0) / 120).toFixed(2), hands: handsNow(), feet: feetNow(), y: +sim.body.pos.y.toFixed(2) }); if (opt.trace) console.log(`  ${out[out.length - 1].step}: ${res} · ${((sim.tick - t0) / 120).toFixed(2)}초 · 손 ${handsNow().join('/')} · 발 ${feetNow().join('/')} · 몸 ${sim.body.pos.y.toFixed(2)}m`); }
  step(120); const ok = K.hands.every(h => h.st === 'hold' && h.edge && h.edge.box.name === '초록 6');
  return { ok, out, moved, rel, rej, t: +(sim.tick / 120).toFixed(2), rec, hands: handsNow(), feet: feetNow() };
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) { console.log(provLine(prov()));
  for (const r of (E.ROUTE || 'a,b,c,d').split(',')) { const R = runRoute(ROUTES[r], { keepHold: E.KEEP === '1', footAssist: E.FOOT !== '0', trace: !!E.TRACE });
    console.log(`경로 ${r}: ${R.ok ? '초록 6에 두 손' : '실패'} · ${R.t}초 · 끝 손 ${R.hands.join('/')} · 발 ${R.feet.join('/')} · 손이 풀림 ${Object.entries(R.rel).map(([k, v]) => k + ' ' + v).join('·') || '없음'} · 거부 ${R.rej.length}${R.rej.length ? '(' + R.rej.slice(0, 4).join(' / ') + ')' : ''} · 수동 발이 옮겨짐 ${R.moved.length}${R.moved.length ? ': ' + R.moved.join(' ; ') : ''}`);
    if (E.REC) fs.writeFileSync(E.REC.replace('.json', `_${r}.json`), JSON.stringify({ route: r, ok: R.ok, steps: R.out })); } }
