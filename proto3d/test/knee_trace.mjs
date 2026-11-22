// 디딘 다리 무릎의 걸음별 기록(p3d-0.10.2, GPT의 0.10.1 검토 1번): 후보 각·값·지금 쪽·극 방향·하중·골반 목표/실제·충돌 빼내기를 같은 120Hz 기록으로 잇는다. 진단 — 통과·실패 없음. 스크립트 입력(사람 손 아님).
// 사용: node test/knee_trace.mjs <장면 id> <시작초> <끝초> [다리 L|R] [JSON]   비교: VARIANT=base|rule   옛 소스: SRC=<src>
import { prov, provLine } from './provenance.mjs'; // 실행 출처(p3d-0.10.3) — 소스보다 먼저 불러와 설정 스위치를 켠다
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const __P = prov(); console.log(provLine(__P));
const HERE = path.dirname(fileURLToPath(import.meta.url)), SRC = process.env.SRC ? path.resolve(process.env.SRC) : path.resolve(HERE, '../src'), imp = f => import(pathToFileURL(path.join(SRC, f)).href);
const THREE = await import('three');
const { buildCharacter } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js');
const { SCENES_FOOT, SCENES, SCENES_H, SCENES_HV = [], START } = await import(process.env.SCN ? pathToFileURL(path.resolve(process.env.SCN)).href : './scenes_foot.mjs');
const [id, t0s, t1s, legS = 'L', outF] = process.argv.slice(2), t0 = +t0s, t1 = +t1s, LI = legS === 'L' ? 0 : 1;
const all = [...SCENES_FOOT.map((s, i) => ['foot' + (i + 1), ...s]), ...SCENES.map((s, i) => ['reach' + (i + 1), ...s]), ...SCENES_H.map(s => [s[0].split(' ')[0], ...s]), ...SCENES_HV.map(s => [s[0].split(' ')[0], ...s])];
const sc = all.find(s => s[0] === id); if (!sc) { console.error('장면 없음', id); process.exit(2); }
const [, title, fn, assist, , st0] = sc, rig = buildCharacter(), sim = makeSim(rig, makeWorld(), null);
sim.reset({ pos: st0 || START, yaw: Math.PI }); sim.opt.wallRest = false; sim.opt.footAssist = !!assist; if (process.env.VARIANT) sim.opt.posture = process.env.VARIANT;
const inputs = [], put = (inp = {}, cmd = []) => inputs.push({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd }), rep = (n, inp, cmd) => { for (let i = 0; i < n; i++) put(inp, i ? [] : cmd); }; fn(sim, put, rep);
const V = () => new THREE.Vector3(), Qw = b => b.getWorldQuaternion(new THREE.Quaternion()), r = (v, n = 1) => +v.toFixed(n), mm = v => r(v * 1000, 1);
const rows = []; let pq = null, pk = null, pdir = null;
for (let k = 0; k < inputs.length; k++) {
  globalThis.__KT = []; sim.step(inputs[k]); rig.root.updateMatrixWorld(true); const KT = globalThis.__KT; globalThis.__KT = null;
  const t = (k + 1) / 120, K = sim.climb, B = rig.bones, q = Qw(B[`upLeg.${legS}`]), kn = B[`leg.${legS}`].getWorldPosition(V()), hjw = B[`upLeg.${legS}`].getWorldPosition(V());
  const w = pq ? pq.angleTo(q) * 180 / Math.PI * 120 : 0, dirv = kn.clone().sub(hjw).normalize(), dw = pdir ? pdir.angleTo(dirv) * 180 / Math.PI * 120 : 0;
  const step = pk ? kn.distanceTo(pk) : 0; pq = q; pk = kn.clone(); pdir = dirv;
  if (t < t0 - 1e-9 || t > t1 + 1e-9) continue;
  // 이 다리의 poseClimb 기록(leg 항목)과 그 바로 앞의 후보들
  const li = KT.findIndex(e => e.leg === legS); let cand = [], pick = null;
  if (li >= 0) { for (let j = li - 1; j >= 0; j--) { const e = KT[j]; if (e.leg) break; if (e.pick !== undefined) { if (!pick) pick = e; else break; } else if (pick) cand.push(e); } }
  cand.sort((a, b) => a.sc - b.sc); const L = li >= 0 ? KT[li] : null, F = K.feet[LI];
  rows.push({ t: r(t, 4), 발: F.st, 하중: r(F.load || 0, 2), 다른발하중: r(K.feet[1 - LI].load || 0, 2), 손: K.hands.map(h => h.st).join('/'),
    무릎_초속도: r(w), 방향_초속도: r(dw), 무릎_한걸음_mm: mm(step), 무릎: kn.toArray().map(v => mm(v)),
    고른각: pick && pick.pick, 바라는각: pick && r(pick.a0), 지금각: pick && r(pick.aCur), 접힘: pick && r(pick.bend, 3), 값: pick && r(pick.sc), 여유_mm: pick && mm(pick.dist),
    차선: cand.slice(0, 3).map(c => `${c.a}:${r(c.sc)}(${mm(c.dist)})`).join(' '), 빼내기: L ? L.near : null,
    극_바람: L ? L.want.map(v => r(v, 3)) : null, 극_실제: L ? L.pole.map(v => r(v, 3)) : null,
    골반: K.po ? [mm(K.po.x), mm(K.po.z), r(K.po.yaw * 180 / Math.PI)] : null, 골반_목표: K.poT ? [mm(K.poT.x), mm(K.poT.z), r(K.poT.yaw * 180 / Math.PI)] : null,
    고관절: L ? L.hj.map(v => mm(v)) : null, 몸: sim.body.pos.toArray().map(v => mm(v)), 사건: K.events.filter(e => e.type !== 'try').map(e => e.type + (e.why ? '(' + e.why + ')' : '')).join(',') });
}
console.log(`■ ${id} ${title.slice(0, 40)} [${process.env.VARIANT || '기본'}] ${legS} ${t0}~${t1}s`);
for (const x of rows) console.log(`${x.t.toFixed(4)} ${x.발[0]} 하중${x.하중} 무릎${String(x.무릎_초속도).padStart(6)}°/s 방향${String(x.방향_초속도).padStart(6)} 걸음${String(x.무릎_한걸음_mm).padStart(5)}mm 고른${x.고른각} 바람${x.바라는각} 지금${x.지금각} 값${x.값} 여유${x.여유_mm} | ${x.차선} | 빼${x.빼내기 ? 1 : 0} 골반${x.골반} 목표${x.골반_목표} 고관절${x.고관절} ${x.사건}`);
if (outF) fs.writeFileSync(outF, JSON.stringify({ 실행_출처: __P, id, title, variant: process.env.VARIANT || '기본', rows }, null, 1));
