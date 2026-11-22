// 대표 장면의 자세를 참고 자세(Mixamo 등반 동작 색인)와 같은 잣대로 견준다(p3d-0.10.1). 진단 — 통과·실패를 세지 않는다. 스크립트 입력(사람 손 아님).
// 순간: ① 발을 보내기 직전 ② 발이 발판 모서리를 넘는 순간 ③ 디딘 순간 ④ W로 올라가는 중간 ⑤ 다음 손을 보내는 순간 ⑥ 잡음/거부. 그 밖에 벽 문맥의 6걸음마다 차이의 평균.
// 참고 값 = 지금 손발 배치에 가장 가까운 참고 장면 8개의 무게 평균(사람의 정답이 아니라 이 동작 묶음의 값). 색인이 없으면(assets_local/ref_index.json) 우리 값만 적는다.
// 사용: node test/ref_compare.mjs [JSON]   비교 설정: VARIANT=base|rule|ref (기본 = 지금 설정)   옛 소스: SRC=<src>
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), SRC = process.env.SRC ? path.resolve(process.env.SRC) : path.resolve(HERE, '../src'), imp = f => import(pathToFileURL(path.join(SRC, f)).href);
const THREE = await import('three');
const { buildCharacter, DIM } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js'), { CL } = await imp('climb.js');
const RP = await import(pathToFileURL(path.resolve(HERE, '../src/refpose.js')).href);
const idxF = path.resolve(HERE, '../assets_local/ref_index.json'), INDEX = fs.existsSync(idxF) ? JSON.parse(fs.readFileSync(idxF, 'utf8')) : null;
const { SCENES_FOOT, SCENES, START } = await import('./scenes_foot.mjs');
const VAR = process.env.VARIANT || '';
const rig = buildCharacter(), V = () => new THREE.Vector3(), r1 = v => (v === null || v === undefined ? null : +v.toFixed(1));
const PICK = (process.env.ONLY || 'reach2,foot2,foot3').split(',');
const all = [...SCENES_FOOT.map((s, i) => ['foot' + (i + 1), ...s]), ...SCENES.map((s, i) => ['reach' + (i + 1), ...s])].filter(s => PICK.includes(s[0]));
const out = { variant: VAR || '지금 설정', index: INDEX ? INDEX.frames.length + '장면' : '없음', scenes: {} };
const sample = sim => { const K = sim.climb, B = rig.bones, yaw = sim.body.yaw, m = RP.poseMetrics(rig, yaw), hip = B.hips.getWorldPosition(V());
  const pts = [B['hand.L'].localToWorld(V().set(0, -CL.PALM, 0)), B['hand.R'].localToWorld(V().set(0, -CL.PALM, 0)), B['foot.L'].getWorldPosition(V()), B['foot.R'].getWorldPosition(V())];
  const con = [K.hands[0].st === 'hold', K.hands[1].st === 'hold', K.feet[0].st === 'plant', K.feet[1].st === 'plant'], ref = RP.lookup(INDEX, RP.featOf(pts, hip, yaw), con);
  return { m, ref }; };
const row = (name, s) => ({ 순간: name, 우리: { 골반: [s.m.pelvis.yaw, s.m.pelvis.roll, s.m.pelvis.pitch].map(r1), 가슴: [s.m.chest.yaw, s.m.chest.roll, s.m.chest.pitch].map(r1), 무릎: s.m.knee.map(r1), 팔꿈치: s.m.elbow.map(r1) },
  참고: s.ref ? { 골반: [s.ref.pelvis.yaw, s.ref.pelvis.roll, s.ref.pelvis.pitch].map(r1), 가슴: [s.ref.chest.yaw, s.ref.chest.roll, s.ref.chest.pitch].map(r1), 무릎: s.ref.knee.map(r1), 팔꿈치: s.ref.elbow.map(r1), 가장_가까운_거리_m: r1(s.ref.dist * 100) / 100, 동작: s.ref.clips } : null });
for (const [id, title, fn, assist, mode, st0] of all) {
  const sim = makeSim(rig, makeWorld(), null); sim.reset({ pos: st0 || START, yaw: Math.PI }); sim.opt.wallRest = false; sim.opt.footAssist = !!assist;
  if (VAR) { sim.opt.posture = VAR; if (VAR === 'ref') sim.ref = INDEX; }
  const inputs = [], put = (inp = {}, cmd = []) => inputs.push({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd }), rep = (n, inp, cmd) => { for (let i = 0; i < n; i++) put(inp, i ? [] : cmd); }; fn(sim, put, rep);
  const rows = [], diff = { n: 0, 골반돌림: 0, 골반옆: 0, 가슴돌림: 0, 가슴앞: 0, 높은무릎: 0, 팔꿈치: 0 }; let footI = -1, phase = 0, wMid = -1, wStart = -1, wEnd = -1;
  inputs.forEach((x, k) => { if (x.cy > 0 && wStart < 0) wStart = k; if (x.cy > 0) wEnd = k; }); wMid = wStart >= 0 ? Math.round((wStart + wEnd) / 2) : -1;
  for (let k = 0; k < inputs.length; k++) {
    const x = inputs[k], fc = (x.cmd || []).find(c => c.type === 'foot'), hc = (x.cmd || []).find(c => c.type === 'hand' && (c.i === 1));
    if (fc && phase === 0 && sim.climb.on) { rows.push(row('① 발을 보내기 직전', sample(sim))); footI = fc.i; phase = 1; }
    if (hc && sim.climb.on && phase >= 1) rows.push(row('⑤ 다음 손을 보내는 순간', sample(sim)));
    sim.step(x); const K = sim.climb;
    if (phase === 1 && footI >= 0 && K.feet[footI].st === 'move' && K.feet[footI].box && rig.bones[`foot.${footI ? 'R' : 'L'}`].getWorldPosition(V()).y - DIM.ankleY > K.feet[footI].box.max.y) { rows.push(row('② 발이 모서리를 넘는 순간', sample(sim))); phase = 2; }
    if (phase >= 1 && phase < 3 && footI >= 0 && K.feet[footI].st === 'plant' && K.feet[footI].box && K.feet[footI].box.kind !== 'floor') { rows.push(row('③ 디딘 순간', sample(sim))); phase = 3; }
    if (k === wMid && K.on) rows.push(row('④ W로 올라가는 중간', sample(sim)));
    for (const e of K.events) if ((e.type === 'grab' || e.type === 'reject') && e.limb === 'hand' && e.i === 1) rows.push(row(`⑥ ${e.type === 'grab' ? '잡음' : '거부'}${e.why ? '(' + e.why + ')' : ''}`, sample(sim)));
    if (K.on && k % 6 === 0 && INDEX) { const s = sample(sim); if (s.ref) { const hi = rig.bones['foot.L'].getWorldPosition(V()).y > rig.bones['foot.R'].getWorldPosition(V()).y ? 0 : 1; diff.n++;
      diff.골반돌림 += Math.abs(s.m.pelvis.yaw - s.ref.pelvis.yaw); diff.골반옆 += Math.abs(s.m.pelvis.roll - s.ref.pelvis.roll); diff.가슴돌림 += Math.abs(s.m.chest.yaw - s.ref.chest.yaw); diff.가슴앞 += Math.abs(s.m.chest.pitch - s.ref.chest.pitch);
      if (s.m.knee[hi] !== null && s.ref.knee[hi] !== null) diff.높은무릎 += Math.abs(s.m.knee[hi] - s.ref.knee[hi]); const el = [0, 1].map(i => (s.m.elbow[i] !== null && s.ref.elbow[i] !== null ? Math.abs(s.m.elbow[i] - s.ref.elbow[i]) : 0)); diff.팔꿈치 += (el[0] + el[1]) / 2; } }
  }
  const avg = diff.n ? Object.fromEntries(Object.entries(diff).filter(([k]) => k !== 'n').map(([k, v]) => [k, r1(v / diff.n)])) : null;
  out.scenes[id] = { 제목: title, 순간: rows, 참고와의_차이_평균_도: avg, 표본: diff.n };
  console.log(`\n■ ${id} ${title.slice(0, 50)} [${out.variant}]  (각: 골반 = 돌림/옆/앞, 가슴 = 골반 기준 돌림/옆/앞, 무릎·팔꿈치 = 바깥으로 연 각 L/R)`);
  for (const r of rows) console.log(`  ${r.순간.padEnd(16)} 우리 골반 ${r.우리.골반.join('/')} 가슴 ${r.우리.가슴.join('/')} 무릎 ${r.우리.무릎.join('/')} 팔꿈치 ${r.우리.팔꿈치.join('/')}` + (r.참고 ? `\n  ${''.padEnd(16)} 참고 골반 ${r.참고.골반.join('/')} 가슴 ${r.참고.가슴.join('/')} 무릎 ${r.참고.무릎.join('/')} 팔꿈치 ${r.참고.팔꿈치.join('/')} (가장 가까운 ${r.참고.가장_가까운_거리_m}m)` : ''));
  if (avg) console.log(`  참고와의 차이(벽 문맥 6걸음마다 ${diff.n}표본의 평균, 도): ${Object.entries(avg).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
}
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
