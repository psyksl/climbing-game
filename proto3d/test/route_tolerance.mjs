// 사진의 경로(route_steps.mjs)에서 단계마다 사람에게 얼마나 여유가 있는지 잰다(p3d-0.12.4). 스크립트 입력이며 사람 손이 아니다.
// 손·발 명령 하나마다 입력을 조금씩 흔들어(손은 화면의 기본 시점에서 겨눈 자리를 옆으로 ±8·±15cm, 위아래로 ±5·±10·±20cm — 시선이 지형에 닿은 점을 넘긴다. AIMSNAP=1이면 조준 맞춤을 거친다, 보내는 시각을 0.25·0.5초 이르게/늦게, 뛰는 단계는 0.05초씩) 그 단계의 끝 접촉(어느 손이 어느 턱을 잡았는가)이 기준 실행과 같은지 본다.
// 뛰는 단계의 '이르게'는 손을 먼저 보내고(누르고) 그 뒤에 뛰는 것이다(−1.5초까지). EASY=1이면 쉬운 조작(예약·자동 몸 맞추기)을 켠다.
// 몸 입력(W·D)은 누르는 길이를 0.6배·1.5배로. 한 가지씩만 흔든 결과이며, 여러 가지가 함께 어긋날 때의 결과가 아니다. 사람의 조준·반응 오차를 잰 것도 아니다.
// 사용: [MODE=clip] [SHARD=i/n] node test/route_tolerance.mjs [결과 JSONL]
import { prov, provLine } from './provenance.mjs';
import fs from 'fs'; import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';
console.log(provLine(prov()));
const HERE = path.dirname(fileURLToPath(import.meta.url)), imp = f => import(pathToFileURL(path.join(HERE, '../src', f)).href);
const { buildCharacter } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js'), { limbState, aimGrip } = await imp('climb.js'), { rayHit } = await imp('world.js'), THREE = await import('three'), { ROUTE, ROUTE_START } = await import('./route_steps.mjs');
const CLIPS = process.env.MODE === 'clip' ? JSON.parse(fs.readFileSync(path.join(HERE, '../assets_local/clips.json'), 'utf8')) : null, rig = buildCharacter(), outF = process.argv[2];
const [shI, shN] = (process.env.SHARD || '0/1').split('/').map(Number), clone = R => R.map(([n, segs]) => [n, segs.map(([k, inp = {}, cmd = []]) => [k, { ...inp }, cmd.map(c => ({ ...c, p: c.p ? [...c.p] : undefined }))])]);
// 실제 플레이처럼: 화면의 기본 시점(몸 뒤 3.6m, 옆으로 0.25rad, 위로 0.12rad — main.js의 wallStart)에서 "턱의 그 자리에서 화면상 옆·위아래로 어긋난 점"을 겨눈 시선을 쏘아, 지형에 닿은 점을 손 명령의 자리로 넘긴다.
// AIMSNAP=1이면 화면과 같이 조준 맞춤(aimGrip)을 거친다. 카메라는 한 가지 자리뿐이다(시점을 돌리며 겨누는 것은 재지 않는다)
const SNAP = process.env.AIMSNAP === '1', V3 = (x, y, z) => new THREE.Vector3(x, y, z);
function viaRay(sim, c) { const b = sim.body.pos, o = V3(b.x + 0.88, b.y + 1.73, b.z + 3.46), q = V3(c.p[0] + c.aimOff[0], c.p[1] + c.aimOff[1], c.p[2]), d = q.clone().sub(o).normalize(), far = o.clone().addScaledVector(d, 40), t = rayHit(sim.world, o, far), hit = t < 1 ? o.clone().lerp(far, t) : null;
  const g = SNAP ? aimGrip(sim.world, o, d, hit) : null, p = g ? g.p : hit; return { ...c, p: p ? p.toArray() : [0, -99, 0] }; }
function run(R, upto, uptoSeg = 99, limb = null, who = '', from = 0) { const sim = makeSim(rig, makeWorld(), CLIPS); sim.reset({ pos: ROUTE_START, yaw: Math.PI }); Object.assign(sim.opt, { wallRest: false, footAssist: true, grabAssist: true, poseAssist: true, posture: 'fb', easy: process.env.EASY === '1' });
  let look = null, fell = false, moved = false; const why = [];
  for (let si = 0; si <= upto; si++) for (let gi = 0; gi < R[si][1].length && (si < upto || gi <= uptoSeg); gi++) { const [n, inp, cmd] = R[si][1][gi]; for (const c of cmd) if (c.p) look = c.p; const cmd1 = cmd.map(c => (c.aimOff ? viaRay(sim, c) : c)); for (const c of cmd1) if (c.p) look = c.p;
    for (let i = 0; i < n; i++) { sim.step({ mx: 0, mz: 0, cxSign: 1, ...(look ? { look } : {}), ...inp, cmd: i ? [] : cmd1 }); if (si === upto) for (const e of sim.climb.events) { if (e.type === 'exit') fell = true; if (gi >= from && e.name === who && /^(grab|step)$/.test(e.type)) moved = true; if (/reject|deny|slip/.test(e.type)) why.push(`${e.name || ''} ${e.why || ''}`.trim()); } } }
  const L = limbState(sim.climb); if (limb) { const x = limb.type === 'hand' ? L.hands[limb.i] : L.feet[limb.i]; return { key: ((limb.type === 'hand' ? x.st === 'hold' : x.st === 'plant') ? x.box : '-') + (moved ? '' : '(옮기지 못함)'), fell, why: why.slice(-2).join(' | ') }; }
  return { key: L.hands.map(h => (h.st === 'hold' ? h.box : '-')).join('/'), feet: L.feet.map(f => (f.st === 'plant' ? f.box : '-')).join('/'), fell, why: why.slice(-2).join(' | '), y: sim.body.pos.y }; }
// 흔들 것의 목록
const V = []; ROUTE.forEach(([name, segs], si) => { const jumpStage = segs.some(s => s[1] && s[1].jump);
  segs.forEach(([n, inp = {}, cmd = []], gi) => {
    cmd.forEach((c, ci) => { if (!c.p) return; const who = c.type === 'hand' ? (c.i ? '오른손' : '왼손') : (c.i ? '오른발' : '왼발');
      for (const dx of [-0.15, -0.08, 0.08, 0.15]) V.push({ si, gi, limb: c, kind: '겨눈 자리(옆)', who, label: `${dx > 0 ? '+' : ''}${dx * 100}cm`, val: dx, mod: R => { const x = R[si][1][gi][2][ci]; if (c.type === 'hand') x.aimOff = [dx, 0]; else x.p[0] += dx; } });
      if (c.type === 'hand') for (const dy of [0.20, 0.10, 0.05, -0.05, -0.10, -0.20]) V.push({ si, gi, limb: c, kind: '겨눈 자리(위아래)', who, label: `${dy > 0 ? '위' : '아래'} ${Math.abs(dy) * 100}cm`, val: dy, mod: R => { R[si][1][gi][2][ci].aimOff = [0, dy]; } });
      for (const dt of jumpStage ? [-180, -120, -60, -30, -12, -6, 6, 12, 18, 24, 36] : [-60, -30, 30, 60]) V.push({ si, gi, limb: c, shift: dt > 0 ? 1 : jumpStage ? -gi : 0, kind: '보내는 시각', who, label: `${dt > 0 ? '+' : ''}${(dt / 120).toFixed(2)}초`, val: dt / 120, mod: R => { const S = R[si][1];
        if (dt > 0) S.splice(gi, 0, [dt, { ...(gi > 0 ? S[gi - 1][1] : {}) }, []]); else if (jumpStage) { const sg = S.splice(gi, 1)[0]; S.unshift([-dt, {}, sg[2]]); } else { let need = -dt; for (let g = gi - 1; g >= 0 && need > 0; g--) { const take = Math.min(need, S[g][0] - 1); S[g][0] -= take; need -= take; } if (need > 0 && si > 0) { const P = R[si - 1][1]; for (let g = P.length - 1; g >= 0 && need > 0; g--) { const take = Math.min(need, P[g][0] - 1); P[g][0] -= take; need -= take; } } } } }); });
    if ((inp.cx || inp.cy) && !inp.jump && n >= 30) for (const k of [0.6, 1.5]) V.push({ si, kind: '몸 입력 길이', who: inp.cy ? '위로(W)' : '오른쪽(D)', label: `${k}배(${(n * k / 120).toFixed(2)}초)`, val: k, mod: R => { R[si][1][gi][0] = Math.round(n * k); } }); }); });
// 같은 턱 안에서 옮기는 손은 명령이 거부돼도 같은 턱을 잡고 있으므로, 그 구간에 실제로 잡았는지(grab·step 사건)를 함께 본다
// 손·발 명령을 흔든 것은 그 명령의 구간이 끝난 때(뛰는 단계는 단계 끝)에 그 손발이 기준과 같은 턱을 잡았는가로 본다 — 단계 끝의 전체 접촉으로 보면 같은 단계의 다음 명령(고정된 자리)과 부딪혀 생긴 실패까지 센다
const base = {}, jumpSt = si => ROUTE[si][1].some(s => s[1] && s[1].jump), segOf = v => (v.limb && !jumpSt(v.si) ? v.gi : 99), getBase = v => { const k = v.si + ':' + segOf(v) + ':' + v.gi + ':' + (v.limb ? v.limb.type + v.limb.i : ''); return base[k] || (base[k] = run(clone(ROUTE), v.si, segOf(v), v.limb || null, v.who, v.gi)); };
console.log(`흔들 것 ${V.length}가지 · 이 조각 ${shI}/${shN}`);
V.forEach((v, idx) => { if (idx % shN !== shI) return; const b = getBase(v), R = clone(ROUTE); v.mod(R); const r = run(R, v.si, segOf(v) === 99 ? 99 : segOf(v) + (v.shift || 0), v.limb || null, v.who, v.limb ? v.gi + (v.shift || 0) : 0), ok = r.key === b.key && !r.fell;
  const row = { si: v.si + 1, stage: ROUTE[v.si][0], kind: v.kind, who: v.who, label: v.label, val: v.val, ok, base: b.key, got: r.key, fell: r.fell, why: r.why }; if (outF) fs.appendFileSync(outF, JSON.stringify(row) + '\n');
  console.log(`${ok ? '같음' : '다름'} [${row.si}] ${v.kind} · ${v.who} ${v.label} → 손 ${r.key}${r.fell ? ' (떨어짐)' : ''}${ok ? '' : ' · 기준 ' + b.key + (r.why ? ' · ' + r.why : '')}`); });
