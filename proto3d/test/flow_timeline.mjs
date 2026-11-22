// 한 흐름의 시간표(p3d-0.10.3, GPT의 0.10.2 검토 3번: "발 명령→발이 떠남→발판에 닿음→하중이 실림→골반/가슴 이동→다음 손이 움직임을 한 타임라인으로. 허용 범위에 들어와 유지되는 시간, 회전 오차 포함").
// 0.10.2의 response_study는 골반 층 x/z가 처음 1cm 안에 든 시각이었다(유지·회전·가슴/어깨를 보지 않음) → 여기서는 0.2초 유지를 정착으로 본다. 진단 — 통과·실패 없음. 스크립트 입력(사람 손 아님).
// 사용: node test/flow_timeline.mjs [JSON]   장면: ONLY=h1,h3   설정: GRIP=frame · POSTURE=base · PO_FAST=1(provenance.mjs)
import { prov, provLine } from './provenance.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const __P = prov(); console.log(provLine(__P));
const HERE = path.dirname(fileURLToPath(import.meta.url)), SRC = path.resolve(HERE, '../src'), imp = f => import(pathToFileURL(path.join(SRC, f)).href);
const THREE = await import('three');
const { buildCharacter } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js');
const { SCENES_H, SCENES_HV, START } = await import('./scenes_foot.mjs');
const all = [...SCENES_H.map(s => [s[0].split(' ')[0], ...s]), ...SCENES_HV.map(s => [s[0].split(' ')[0], ...s])].filter(s => (process.env.ONLY || 'h1,h3,h5,m1').split(',').includes(s[0]));
const HOLD = 24, f3 = v => (v === null || v === undefined ? null : +v.toFixed(3)), out = {};
for (const [id, title, fn, assist, , st0] of all) {
  const rig = buildCharacter(), sim = makeSim(rig, makeWorld(), null); sim.reset({ pos: st0 || START, yaw: Math.PI }); sim.opt.wallRest = false; sim.opt.footAssist = !!assist; if (process.env.VARIANT) sim.opt.posture = process.env.VARIANT;
  const inputs = [], put = (inp = {}, cmd = []) => inputs.push({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd }), rep = (n, inp, cmd) => { for (let i = 0; i < n; i++) put(inp, i ? [] : cmd); }; fn(sim, put, rep);
  const fk = inputs.findIndex(x => (x.cmd || []).some(c => c.type === 'foot' && c.i === (id[0] === 'm' ? 1 : 0))), FI = id[0] === 'm' ? 1 : 0;
  const hk = inputs.findIndex((x, k) => k > fk && (x.cmd || []).some(c => c.type === 'hand'));
  const T = {}, mark = (k, n) => { if (T[n] === undefined) T[n] = +((k - fk) / 120).toFixed(3); };
  let po = 0, ch = 0, sh = 0, prevSh = null, prevCh = null, settledPo = null, settledCh = null, settledSh = null, plantK = null; const series = [];
  for (let k = 0; k < inputs.length; k++) { sim.step(inputs[k]); const K = sim.climb, F = K.feet[FI];
    if (k < fk) continue;
    if (F.st === 'move') mark(k, '발이 떠남'); for (const e of K.events) { if (e.limb === 'foot' && e.i === FI && (e.type === 'step' || e.type === 'plant') && K.feet[FI].box && K.feet[FI].box.kind !== 'floor') { mark(k, '발판에 디딤'); plantK = k; } if (e.limb === 'hand' && k > hk && hk >= 0 && (e.type === 'grab' || e.type === 'reject')) mark(k, '다음 손 ' + (e.type === 'grab' ? '잡음' : '거부')); }
    if (plantK !== null) { if ((F.loadS || 0) > 0.3) mark(k, '하중 30%'); if ((F.loadS || 0) > 0.6) mark(k, '하중 60%'); }
    if (inputs[k].cy > 0) mark(k, 'W 누름'); if (hk >= 0 && k === hk) mark(k, '다음 손 명령'); if (hk >= 0 && k > hk && K.hands.some(h => h.st === 'reach')) mark(k, '다음 손이 움직임');
    // 정착: 골반 층(x/z 1cm·돌림 3° 안), 가슴·어깨(자리의 빠르기 초속 3cm 아래)가 HOLD 걸음 이어짐
    if (plantK !== null && K.po && K.poT && K.T) { const okPo = Math.hypot(K.po.x - K.poT.x, K.po.z - K.poT.z) < 0.01 && Math.abs(K.po.yaw - Math.max(-0.7, Math.min(0.7, K.poT.yaw))) < 3 / 57.3; po = okPo ? po + 1 : 0; if (po >= HOLD && settledPo === null) settledPo = k - HOLD + 1;
      const c = K.T.chest, s0 = K.T.sh[0].clone().add(K.T.sh[1]).multiplyScalar(0.5); const vc = prevCh ? c.distanceTo(prevCh) * 120 : 9, vs = prevSh ? s0.distanceTo(prevSh) * 120 : 9; prevCh = c.clone(); prevSh = s0.clone();
      ch = vc < 0.03 ? ch + 1 : 0; sh = vs < 0.03 ? sh + 1 : 0; if (ch >= HOLD && settledCh === null) settledCh = k - HOLD + 1; if (sh >= HOLD && settledSh === null) settledSh = k - HOLD + 1;
      if (k % 6 === 0) series.push([+((k - fk) / 120).toFixed(3), +(Math.hypot(K.po.x - K.poT.x, K.po.z - K.poT.z) * 100).toFixed(1), +((K.po.yaw - K.poT.yaw) * 57.3).toFixed(1), +(vc * 100).toFixed(1), +(F.loadS || 0).toFixed(2)]); } }
  if (settledPo !== null) T['골반 층 정착(유지 0.2초)'] = f3((settledPo - fk) / 120); if (settledCh !== null) T['가슴 정착(초속 3cm 아래 0.2초)'] = f3((settledCh - fk) / 120); if (settledSh !== null) T['어깨 정착'] = f3((settledSh - fk) / 120);
  out[id] = { 제목: title, 기준: '발 명령 = 0초', 시각: Object.fromEntries(Object.entries(T).sort((a, b) => a[1] - b[1])), 표본_6걸음마다: { 열: ['초', '골반층 거리 cm', '골반층 돌림 차 °', '가슴 빠르기 cm/s', '발 하중 배'], 값: series } };
  console.log(`\n■ ${id} ${title.slice(0, 50)} (발 명령 = 0초)`); for (const [n, t] of Object.entries(out[id].시각)) console.log(`  ${String(t).padStart(6)}초  ${n}`);
}
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ 실행_출처: __P, ...out }, null, 1));
