// 사진의 경로(route_steps.mjs)에서 단계마다 사람에게 얼마나 여유가 있는지 잰다(p3d-0.12.4). 스크립트 입력이며 사람 손이 아니다.
// 손·발 명령 하나마다 입력을 조금씩 흔들어(겨눈 자리를 턱을 따라 ±8·±15cm, 벽면 위 5cm·아래 10cm, 보내는 시각을 0.25·0.5초 이르게/늦게, 뛰는 단계는 0.05초씩) 그 단계의 끝 접촉(어느 손이 어느 턱을 잡았는가)이 기준 실행과 같은지 본다.
// 몸 입력(W·D)은 누르는 길이를 0.6배·1.5배로. 한 가지씩만 흔든 결과이며, 여러 가지가 함께 어긋날 때의 결과가 아니다. 사람의 조준·반응 오차를 잰 것도 아니다.
// 사용: [MODE=clip] [SHARD=i/n] node test/route_tolerance.mjs [결과 JSONL]
import { prov, provLine } from './provenance.mjs';
import fs from 'fs'; import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';
console.log(provLine(prov()));
const HERE = path.dirname(fileURLToPath(import.meta.url)), imp = f => import(pathToFileURL(path.join(HERE, '../src', f)).href);
const { buildCharacter } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js'), { limbState } = await imp('climb.js'), { ROUTE, ROUTE_START } = await import('./route_steps.mjs');
const CLIPS = process.env.MODE === 'clip' ? JSON.parse(fs.readFileSync(path.join(HERE, '../assets_local/clips.json'), 'utf8')) : null, rig = buildCharacter(), outF = process.argv[2];
const [shI, shN] = (process.env.SHARD || '0/1').split('/').map(Number), clone = R => R.map(([n, segs]) => [n, segs.map(([k, inp = {}, cmd = []]) => [k, { ...inp }, cmd.map(c => ({ ...c, p: c.p ? [...c.p] : undefined }))])]);
function run(R, upto, uptoSeg = 99, limb = null, who = '', from = 0) { const sim = makeSim(rig, makeWorld(), CLIPS); sim.reset({ pos: ROUTE_START, yaw: Math.PI }); Object.assign(sim.opt, { wallRest: false, footAssist: true, grabAssist: true, poseAssist: true, posture: 'fb' });
  let look = null, fell = false, moved = false; const why = [];
  for (let si = 0; si <= upto; si++) for (let gi = 0; gi < R[si][1].length && (si < upto || gi <= uptoSeg); gi++) { const [n, inp, cmd] = R[si][1][gi]; for (const c of cmd) if (c.p) look = c.p; for (let i = 0; i < n; i++) { sim.step({ mx: 0, mz: 0, cxSign: 1, ...(look ? { look } : {}), ...inp, cmd: i ? [] : cmd }); if (si === upto) for (const e of sim.climb.events) { if (e.type === 'exit') fell = true; if (gi >= from && e.name === who && /^(grab|step)$/.test(e.type)) moved = true; if (/reject|deny|slip/.test(e.type)) why.push(`${e.name || ''} ${e.why || ''}`.trim()); } } }
  const L = limbState(sim.climb); if (limb) { const x = limb.type === 'hand' ? L.hands[limb.i] : L.feet[limb.i]; return { key: ((limb.type === 'hand' ? x.st === 'hold' : x.st === 'plant') ? x.box : '-') + (moved ? '' : '(옮기지 못함)'), fell, why: why.slice(-2).join(' | ') }; }
  return { key: L.hands.map(h => (h.st === 'hold' ? h.box : '-')).join('/'), feet: L.feet.map(f => (f.st === 'plant' ? f.box : '-')).join('/'), fell, why: why.slice(-2).join(' | '), y: sim.body.pos.y }; }
// 흔들 것의 목록
const V = []; ROUTE.forEach(([name, segs], si) => { const jumpStage = segs.some(s => s[1] && s[1].jump);
  segs.forEach(([n, inp = {}, cmd = []], gi) => {
    cmd.forEach((c, ci) => { if (!c.p) return; const who = c.type === 'hand' ? (c.i ? '오른손' : '왼손') : (c.i ? '오른발' : '왼발');
      for (const dx of [-0.15, -0.08, 0.08, 0.15]) V.push({ si, gi, limb: c, kind: '겨눈 자리(옆)', who, label: `${dx > 0 ? '+' : ''}${dx * 100}cm`, val: dx, mod: R => { R[si][1][gi][2][ci].p[0] += dx; } });
      if (c.type === 'hand') for (const [lb, dy, z] of [['벽면 위 5cm', 0.05, -2.999], ['벽면 아래 10cm', -0.17, -2.999], ['턱 앞면', -0.035, null]]) V.push({ si, gi, limb: c, kind: '겨눈 자리(위아래)', who, label: lb, val: dy, mod: R => { const p = R[si][1][gi][2][ci].p; p[1] += dy; if (z !== null) p[2] = z; } });
      for (const dt of jumpStage ? [-12, -6, 6, 12, 18, 24, 36] : [-60, -30, 30, 60]) V.push({ si, gi, limb: c, shift: dt > 0 ? 1 : 0, kind: '보내는 시각', who, label: `${dt > 0 ? '+' : ''}${(dt / 120).toFixed(2)}초`, val: dt / 120, mod: R => { const S = R[si][1];
        if (dt > 0) S.splice(gi, 0, [dt, { ...(gi > 0 ? S[gi - 1][1] : {}) }, []]); else { let need = -dt; for (let g = gi - 1; g >= 0 && need > 0; g--) { const take = Math.min(need, S[g][0] - 1); S[g][0] -= take; need -= take; } if (need > 0 && si > 0) { const P = R[si - 1][1]; for (let g = P.length - 1; g >= 0 && need > 0; g--) { const take = Math.min(need, P[g][0] - 1); P[g][0] -= take; need -= take; } } } } }); });
    if ((inp.cx || inp.cy) && !inp.jump && n >= 30) for (const k of [0.6, 1.5]) V.push({ si, kind: '몸 입력 길이', who: inp.cy ? '위로(W)' : '오른쪽(D)', label: `${k}배(${(n * k / 120).toFixed(2)}초)`, val: k, mod: R => { R[si][1][gi][0] = Math.round(n * k); } }); }); });
// 같은 턱 안에서 옮기는 손은 명령이 거부돼도 같은 턱을 잡고 있으므로, 그 구간에 실제로 잡았는지(grab·step 사건)를 함께 본다
// 손·발 명령을 흔든 것은 그 명령의 구간이 끝난 때(뛰는 단계는 단계 끝)에 그 손발이 기준과 같은 턱을 잡았는가로 본다 — 단계 끝의 전체 접촉으로 보면 같은 단계의 다음 명령(고정된 자리)과 부딪혀 생긴 실패까지 센다
const base = {}, jumpSt = si => ROUTE[si][1].some(s => s[1] && s[1].jump), segOf = v => (v.limb && !jumpSt(v.si) ? v.gi : 99), getBase = v => { const k = v.si + ':' + segOf(v) + ':' + v.gi + ':' + (v.limb ? v.limb.type + v.limb.i : ''); return base[k] || (base[k] = run(clone(ROUTE), v.si, segOf(v), v.limb || null, v.who, v.gi)); };
console.log(`흔들 것 ${V.length}가지 · 이 조각 ${shI}/${shN}`);
V.forEach((v, idx) => { if (idx % shN !== shI) return; const b = getBase(v), R = clone(ROUTE); v.mod(R); const r = run(R, v.si, segOf(v) === 99 ? 99 : segOf(v) + (v.shift || 0), v.limb || null, v.who, v.limb ? v.gi + (v.shift || 0) : 0), ok = r.key === b.key && !r.fell;
  const row = { si: v.si + 1, stage: ROUTE[v.si][0], kind: v.kind, who: v.who, label: v.label, val: v.val, ok, base: b.key, got: r.key, fell: r.fell, why: r.why }; if (outF) fs.appendFileSync(outF, JSON.stringify(row) + '\n');
  console.log(`${ok ? '같음' : '다름'} [${row.si}] ${v.kind} · ${v.who} ${v.label} → 손 ${r.key}${r.fell ? ' (떨어짐)' : ''}${ok ? '' : ' · 기준 ' + b.key + (r.why ? ' · ' + r.why : '')}`); });
