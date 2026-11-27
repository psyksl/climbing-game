// 짧은 구간(p3d-0.15.2, GPT의 0.15.1 재검토가 고정한 구간): 초록 시작1·2 → 초록 3 → 4 → 5 → 6(맞잡기), 발은 초록 발 홀드. 지형은 그대로다.
// **스크립트 입력이다(사람 손 아님)** — 이 파일은 명령을 계산에 바로 넣어 순서와 걸리는 곳을 찾는 도구다. 실제 키·마우스로 같은 순서를 넣는 것은 test/short_browser.mjs.
// 순서(ROUTE): a = 발1 → 발2 → 발3 → 발4 순서로 디디는 길, b = 다른 발 순서(오른발부터, 발1을 쓰지 않음), c = 발 보조에 맡김(발 명령 없음)
// 걸음마다 보는 것: 수동으로 디딘 발이 발 보조에 의해 옮겨졌는가(step … 발 보조), 손이 풀린 까닭의 갈래, 거부.
// 사용: [MODE=clip] [ROUTE=a|b|c|d] [LINK=1(전신 연결 켬)] [SW=스위치,이름=값] [KEEP=1] [FOOT=0(발 보조 끔)] [TRACE=1] node test/short_section.mjs
import { prov, provLine, provOptLine } from './provenance.mjs';
import fs from 'fs'; import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), imp = f => import(pathToFileURL(path.join(HERE, '../src', f)).href);
const { buildCharacter } = await imp('rig.js'), { makeGym } = await imp('world.js'), { makeSim } = await imp('sim.js'), { limbState } = await imp('climb.js'), { FBI } = await imp('fbik.js'), THREE = await import('three');
// HANDWAIT = 손 명령마다 겨눈 뒤 그만큼(걸음) 더 기다렸다가 누른다(p3d-0.15.6: 명령이 몇 걸음 늦어지는 것만으로 경로의 결과가 갈리는지 — 뻗기 전 검사의 기다림과 견준다)
const HANDWAIT = +(process.env.HANDWAIT || 0);
const E = process.env; for (const k of (E.SW || '').split(',').filter(Boolean)) { const [a, v] = k.split('='); globalThis[a] = v === undefined ? 1 : +v; }
const CLIPS = E.MODE === 'clip' ? JSON.parse(fs.readFileSync(path.join(HERE, '../assets_local/clips.json'), 'utf8')) : null, rig = buildCharacter(), world = makeGym();
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
  Object.assign(sim.opt, { posture: 'fb', grabAssist: true, poseAssist: true, easy: true, press: true, footAssist: opt.footAssist !== false, wallRest: false, keepHold: !!opt.keepHold, autoBody: opt.autoBody !== false, linkPose: !!opt.link });
  let look = null, nlog = 0; const manual = [null, null], moved = [], rel = {}, rej = [], relWhy = []; const st = { n: 0, pitchMin: 0, headBack: 0, leanT: 0, backT: 0, wingT: 0, elHeadT: 0, wing: [0, 0], wingAny: 0, elHead: [0, 0], elHeadAny: 0, wDrop: 0, wY: null };
  const step = (k, inp = {}, cmd = []) => { for (let i = 0; i < k; i++) { const x = { mx: 0, mz: 0, cxSign: 1, ...(look ? { look } : {}), ...inp, cmd: i ? [] : cmd }; rec.push(x); sim.step(x); if (opt.onTick) opt.onTick(sim, x);
      // 자세 통계(p3d-0.15.3): 벽에 붙어 있는 걸음마다 — 가슴 젖힘(풀이 값, 뒤로 −), 머리가 골반보다 뒤로 간 거리, 잡은 팔의 팔꿈치(그려진 뼈)가 어깨 높이 −3cm보다 위이면서 옆으로 15cm 넘게 벌어진 시간(닭 날개), W를 누르는 동안 몸이 내려간 가장 큰 폭
      if (K.on && K.T && K.fb) { const T = K.T, b = sim.body, fw = new THREE.Vector3(Math.sin(b.yaw), 0, Math.cos(b.yaw)), lf = new THREE.Vector3(Math.cos(b.yaw), 0, -Math.sin(b.yaw)), pc = K.fb.x[FBI.PC] * 180 / Math.PI, hb = -T.head.clone().sub(T.hip).dot(fw); st.n++; st.pitchMin = Math.min(st.pitchMin, pc); st.headBack = Math.max(st.headBack, hb); if (pc < -25) st.leanT += 1 / 120; if (hb > 0.25) st.backT += 1 / 120;
        // wingT·elHeadT는 잡은 팔마다 더한 값이라 단위가 **팔·초**다(두 팔이 함께 해당하면 게임 1초에 2). p3d-0.15.4(GPT의 0.15.3 검토 M2): 팔별 시간과 "어느 한 팔이라도 해당한 시간"(게임 시간)을 함께 센다. 옛 값은 그대로 둔다
        { let wAny = false, eAny = false; for (const h of K.hands) if (h.st === 'hold') { const el = sim.rig.bones[`foreArm.${h.s}`].getWorldPosition(new THREE.Vector3()), sh = T.sh[h.i], out = (h.i ? -1 : 1) * el.clone().sub(sh).dot(lf); if (el.y > sh.y - 0.03 && out > 0.15) { st.wingT += 1 / 120; st.wing[h.i] += 1 / 120; wAny = true; } if (el.y > T.head.y - 0.05) { st.elHeadT += 1 / 120; st.elHead[h.i] += 1 / 120; eAny = true; } }
          if (wAny) st.wingAny += 1 / 120; if (eAny) st.elHeadAny += 1 / 120; }
        if ((x.cy || 0) > 0) { if (st.wY === null) st.wY = b.pos.y; st.wDrop = Math.max(st.wDrop, st.wY - b.pos.y); st.wY = Math.max(st.wY, b.pos.y); } else st.wY = null; }
      for (; nlog < K.log.length; nlog++) { const e = K.log[nlog]; if (e.limb === 'hand' && e.cause && e.cause !== 'command') { rel[e.cause] = (rel[e.cause] || 0) + 1; relWhy.push(`${e.t.toFixed(2)}초 ${e.name} ${e.why}(${e.hold || ''})`); } if (e.type === 'reject' || e.type === 'deny') rej.push(`${e.name} ${e.why}`);
        if (e.limb === 'foot' && (e.type === 'step' || e.type === 'lift') && manual[e.i] && !e.user) moved.push(`${(e.t).toFixed(2)}초 ${e.name} ${e.type} ${e.why || ''}(수동으로 디딘 ${manual[e.i]}에서)`); } } };
  const feetNow = () => K.feet.map(f => (f.st === 'plant' && f.box ? f.box.name : f.st === 'move' ? '(가는 중)' : '-')), handsNow = () => K.hands.map(h => (h.st === 'hold' && h.edge ? h.edge.box.name : h.st === 'reach' ? '(뻗는 중)' : '-'));
  step(20);
  for (const [kind, a, b2, du = 0] of steps) { const t0 = sim.tick; let res = '';
    if (kind === 'hand') { const p = front(box(b2)).add(new THREE.Vector3(du, 0, 0)); look = p.toArray(); step(24 + HANDWAIT); step(1, {}, [{ type: 'hand', i: a, p: p.toArray() }]); let k = 0; for (; k < 420; k++) { step(1); const h = K.hands[a]; if (h.st === 'hold' && h.edge && h.edge.box.name === b2) break; if (h.st === 'free' && !h.arm && k > 30) break; if (h.st === 'hold' && h.arm && k > 300) break; } step(36);
      const h = K.hands[a]; res = h.st === 'hold' && h.edge && h.edge.box.name === b2 ? '잡음' : `못 잡음(${h.why || (h.arm ? '예약 중' : '-')})`; }
    else if (kind === 'foot') { const p = top(box(b2)); look = p.toArray(); step(24); manual[a] = null; step(1, {}, [{ type: 'foot', i: a, p: p.toArray() }]); let k = 0; for (; k < 300; k++) { step(1); const f = K.feet[a]; if (f.st === 'plant' && f.box && f.box.name === b2) break; if (f.st !== 'move' && k > 20) break; } step(36);
      const f = K.feet[a]; if (f.st === 'plant' && f.box && f.box.name === b2) { manual[a] = b2; res = '디딤'; } else res = `못 디딤(${f.why || '-'} · 지금 ${feetNow()[a]})`; }
    else if (kind === 'W') { step(Math.round(a * 120), { cy: 1 }); step(36); res = `몸 높이 ${sim.body.pos.y.toFixed(2)}m`; }
    for (let i = 0; i < 2; i++) if (manual[i] && feetNow()[i] !== manual[i] && !moved.some(m => m.includes(`${i ? '오른발' : '왼발'}`) && m.includes(manual[i]))) moved.push(`${(sim.tick / 120).toFixed(2)}초 ${i ? '오른발' : '왼발'}이 ${manual[i]}에 있지 않음(지금 ${feetNow()[i]})`);
    for (let i = 0; i < 2; i++) if (manual[i] && feetNow()[i] !== manual[i]) manual[i] = null;
    out.push({ step: `${kind === 'W' ? 'W ' + a + '초' : (kind === 'hand' ? (a ? '오른손' : '왼손') : (a ? '오른발' : '왼발')) + ' → ' + b2}`, res, t: +((sim.tick - t0) / 120).toFixed(2), hands: handsNow(), feet: feetNow(), y: +sim.body.pos.y.toFixed(2) }); if (opt.trace) console.log(`  ${out[out.length - 1].step}: ${res} · ${((sim.tick - t0) / 120).toFixed(2)}초 · 손 ${handsNow().join('/')} · 발 ${feetNow().join('/')} · 몸 ${sim.body.pos.y.toFixed(2)}m`); }
  step(120); const ok = K.hands.every(h => h.st === 'hold' && h.edge && h.edge.box.name === '초록 6');
  return { ok, out, moved, rel, relWhy, rej, st, optLine: provOptLine(sim), opts: { handMode: 1, ...sim.opt }, t: +(sim.tick / 120).toFixed(2), rec, hands: handsNow(), feet: feetNow() };
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) { console.log(provLine(prov()));
  for (const r of (E.ROUTE || 'a,b,c,d').split(',')) { const R = runRoute(ROUTES[r], { keepHold: E.KEEP === '1', footAssist: E.FOOT !== '0', trace: !!E.TRACE, link: E.LINK === '1' });
    if (R.optLine !== globalThis.__optLine) console.log(globalThis.__optLine = R.optLine);
    console.log(`경로 ${r}: ${R.ok ? '초록 6에 두 손' : '실패'} · ${R.t}초 · 끝 손 ${R.hands.join('/')} · 발 ${R.feet.join('/')} · 손이 풀림 ${Object.entries(R.rel).map(([k, v]) => k + ' ' + v).join('·') || '없음'}${R.relWhy.length ? '[' + R.relWhy.join(' / ') + ']' : ''} · 거부 ${R.rej.length}${R.rej.length ? '(' + R.rej.slice(0, 4).join(' / ') + ')' : ''} · 수동 발이 옮겨짐 ${R.moved.length}${R.moved.length ? ': ' + R.moved.join(' ; ') : ''}`);
    console.log(`    자세: 가슴 가장 젖힘 ${R.st.pitchMin.toFixed(0)}° · 25° 넘게 젖힌 시간 ${R.st.leanT.toFixed(2)}초 · 머리가 골반 뒤로 가장 멀리 ${(R.st.headBack * 100).toFixed(0)}cm(25cm 넘은 시간 ${R.st.backT.toFixed(2)}초) · 팔꿈치가 어깨 높이에서 옆으로 벌어짐 ${R.st.wingT.toFixed(2)}팔·초(왼 ${R.st.wing[0].toFixed(2)}초 · 오른 ${R.st.wing[1].toFixed(2)}초 · 어느 한 팔이라도 ${R.st.wingAny.toFixed(2)}초) · 팔꿈치가 머리 높이 ${R.st.elHeadT.toFixed(2)}팔·초(왼 ${R.st.elHead[0].toFixed(2)} · 오른 ${R.st.elHead[1].toFixed(2)} · 어느 한 팔이라도 ${R.st.elHeadAny.toFixed(2)}초) · W 중 몸이 내려간 가장 큰 폭 ${(R.st.wDrop * 100).toFixed(1)}cm`);
    // RECIN = 다시 틀 입력(test/short_video.mjs의 IN 형식)
    if (E.RECIN) { const ver = /VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(HERE, '../src/main.js'), 'utf8'))[1]; fs.writeFileSync(E.RECIN.replace('.json', `_${r}.json`), JSON.stringify({ version: ver, clip: E.MODE === 'clip', route: r + '(명령 수준)', source: 'command', recover: false, shadow: false, opts: R.opts, startPos: C.startPos, startYaw: C.startYaw, inputs: R.rec, end: null })); }
    if (E.REC) fs.writeFileSync(E.REC.replace('.json', `_${r}.json`), JSON.stringify({ route: r, ok: R.ok, steps: R.out })); } }
