// 반응성 측정(p3d-0.10.2, GPT의 0.10.1 검토 3절: "입력→반응 시작, 지지점 변경, 몸의 이동, 정착 시간을 분리해 잰다", "골반 보정의 시간 상수를 두 배로 늘린 비용"). 진단 — 통과·실패 없음. 스크립트 입력(사람 손 아님).
// 비교: base(0.10.0 규칙) · rule(지금 기본, 골반 2배 느림) · rule_fast(같은 규칙, 골반 0.15초 — PO_FAST) · solve(함께 고르는 자세 실험)
// 재는 것(장면마다): ① W를 누른 뒤 몸이 5mm 오를 때까지 ② W를 뗀 뒤 몸의 빠르기가 초속 2cm 아래로 0.1초 머물 때까지 ③ 발 명령 → 디딤 ④ 손 명령 → 잡음/거부
//   ⑤ 골반 층(K.po)이 목표(K.poT)에서 떨어진 거리의 평균·최대(벽 문맥) ⑥ 발판에 디딘 뒤 골반 층이 목표 1cm 안에 들어올 때까지 ⑦ 골반 층이 움직인 가장 빠른 빠르기
// 사용: node test/response_study.mjs [JSON]   장면: ONLY=h1,h3
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), SRC = path.resolve(HERE, '../src'), imp = f => import(pathToFileURL(path.join(SRC, f)).href);
const { buildCharacter } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js');
const { SCENES_H, SCENES_HV, START } = await import('./scenes_foot.mjs');
const all = [...SCENES_H.map(s => [s[0].split(' ')[0], ...s]), ...SCENES_HV.map(s => [s[0].split(' ')[0], ...s])].filter(s => (process.env.ONLY || 'h1,h2,h3,h4,h5,v4,v5,m1').split(',').includes(s[0]));
const VARS = [['base', 'base', 0], ['rule', 'rule', 0], ['rule_fast', 'rule', 1], ['solve', 'solve', 0]];
const r2 = v => (v === null || v === undefined ? null : +v.toFixed(3)), out = {};
for (const [id, title, fn, assist, , st0] of all) {
  out[id] = { 제목: title };
  for (const [vn, post, fast] of VARS) {
    globalThis.PO_FAST = fast ? 1 : 0;
    const sim = makeSim(buildCharacter(), makeWorld(), null); sim.reset({ pos: st0 || START, yaw: Math.PI }); sim.opt.wallRest = false; sim.opt.footAssist = !!assist; sim.opt.posture = post;
    const inputs = [], put = (inp = {}, cmd = []) => inputs.push({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd }), rep = (n, inp, cmd) => { for (let i = 0; i < n; i++) put(inp, i ? [] : cmd); }; fn(sim, put, rep);
    let wOn = -1, wOff = -1; inputs.forEach((x, k) => { if (x.cy > 0) { if (wOn < 0) wOn = k; wOff = k; } });
    let y0 = null, onset = null, settle = null, still = 0, lagS = 0, lagN = 0, lagMax = 0, vMax = 0, prevPo = null, plantT = null, poSettle = null; const cmds = [], res = [];
    for (let k = 0; k < inputs.length; k++) {
      const x = inputs[k]; for (const c of x.cmd || []) if (c.type === 'hand' || c.type === 'foot') cmds.push({ k, limb: c.type, i: c.i });
      sim.step(x); const K = sim.climb, b = sim.body, t = (k + 1) / 120;
      if (k === wOn) y0 = b.pos.y; if (wOn >= 0 && k >= wOn && onset === null && b.pos.y - y0 > 0.005) onset = (k - wOn + 1) / 120;
      if (wOff >= 0 && k > wOff && settle === null) { if (b.vel.length() < 0.02) { still++; if (still >= 12) settle = (k - wOff - 11) / 120; } else still = 0; }
      for (const e of K.events) if (['grab', 'reject', 'plant', 'step', 'deny'].includes(e.type)) { const c = [...cmds].reverse().find(c => c.limb === e.limb && c.i === e.i && !c.done); if (c) { c.done = true; res.push({ limb: e.limb, i: e.i, type: e.type, dt: (k - c.k + 1) / 120 }); }
        if ((e.type === 'plant' || e.type === 'step') && e.limb === 'foot' && K.feet[e.i].box && K.feet[e.i].box.kind !== 'floor') { plantT = k; poSettle = null; } }
      if (K.on && K.po && K.poT) { const d = Math.hypot(K.po.x - K.poT.x, K.po.z - K.poT.z); lagS += d; lagN++; lagMax = Math.max(lagMax, d);
        if (prevPo) vMax = Math.max(vMax, Math.hypot(K.po.x - prevPo[0], K.po.z - prevPo[1]) * 120); prevPo = [K.po.x, K.po.z];
        if (plantT !== null && poSettle === null && Math.abs(K.po.z - K.poT.z) < 0.01 && Math.abs(K.po.x - K.poT.x) < 0.01) poSettle = (k - plantT) / 120; }
    }
    out[id][vn] = { W_누른_뒤_몸이_5mm_오르기_초: r2(onset), W_뗀_뒤_정착_초: r2(settle), 명령_결과: res.map(r => `${r.limb}${r.i} ${r.type} ${r.dt.toFixed(2)}초`), 골반층_목표와_거리_평균_cm: r2(lagS / Math.max(lagN, 1) * 100), 골반층_목표와_거리_최대_cm: r2(lagMax * 100), 발판에_디딘_뒤_골반층이_목표_1cm_안_초: r2(poSettle), 골반층_가장_빠른_빠르기_cm_s: r2(vMax * 100) };
  }
}
globalThis.PO_FAST = 0;
for (const [id, R] of Object.entries(out)) { console.log(`\n■ ${id} ${R.제목.slice(0, 60)}`);
  for (const vn of VARS.map(v => v[0])) { const x = R[vn]; console.log(`  ${vn.padEnd(9)} W→오름 ${x.W_누른_뒤_몸이_5mm_오르기_초} · W뗀→정착 ${x.W_뗀_뒤_정착_초} · 골반층 뒤처짐 평균 ${x.골반층_목표와_거리_평균_cm}cm 최대 ${x.골반층_목표와_거리_최대_cm}cm · 디딘 뒤 1cm 안 ${x.발판에_디딘_뒤_골반층이_목표_1cm_안_초}초 · 골반층 최대 ${x.골반층_가장_빠른_빠르기_cm_s}cm/s · ${x.명령_결과.join(', ')}`); } }
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
