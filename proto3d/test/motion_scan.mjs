// 걸음마다(1/120초) 모든 뼈를 재서 튐을 찾는다(p3d-0.9.0 — 사용자 지적: "장면을 끊어서 보면 중간을 놓친다").
// 영상에서 장면을 몇 장 뽑아 보는 것으로는 0.03~0.06초짜리 튐을 놓친다(0.9.0의 무릎 넘어감을 그렇게 놓쳤다). 그래서 계산 걸음마다 뼈의 세계 회전 빠르기를 재고, 붙어 있는 팔다리(디딘 다리·잡은 팔)가 빠르게 도는 구간을 사건으로 묶어 낸다.
// 찾은 사건은 test/dense_strip.mjs로 그 구간을 빠짐없이(1/60초마다) 찍어 눈으로 본다 — 숫자로 찾고 그림으로 확인한다.
// 재는 것(진단. 기준은 개발 쪽이 정한 값이며 사람의 한계를 잰 것이 아니다):
//   ① 붙은 팔다리의 뼈(디딘 다리의 넓적다리·정강이, 잡은 팔의 위팔·팔뚝)가 초속 300°를 넘는 구간
//   ② 어떤 뼈든 초속 900°를 넘는 구간
//   ③ 한 걸음 회전량이 바로 앞 걸음보다 12° 넘게 달라진 걸음(wall_check의 튐과 같은 잣대)
// 사용: node test/motion_scan.mjs [JSON]   캡처 동작: MODE=clip   옛 소스: SRC=<src 폴더>   장면 고르기: ONLY=foot3,reach1   비교 스위치: OLDPOSE=1   자세 설정: VARIANT=base|rule|solve
import { prov, provLine } from './provenance.mjs'; // 실행 출처(p3d-0.10.3) — 소스보다 먼저 불러와 설정 스위치를 켠다
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const __P = prov(); console.log(provLine(__P));
const HERE = path.dirname(fileURLToPath(import.meta.url)), SRC = process.env.SRC ? path.resolve(process.env.SRC) : path.resolve(HERE, '../src'), imp = f => import(pathToFileURL(path.join(SRC, f)).href);
const THREE = await import('three');
const { buildCharacter } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js');
const { SCENES_FOOT, SCENES, SCENES_H, SCENES_HV = [], START } = await import('./scenes_foot.mjs');
for (const k of ['OLDPOSE', 'OLDHAND', 'PO_FAST']) if (process.env[k]) globalThis[k] = 1;
const clip = process.env.MODE === 'clip', clips = clip ? JSON.parse(fs.readFileSync(path.resolve(HERE, '../assets_local/clips.json'), 'utf8')) : null;
const rig = buildCharacter(), names = rig.list.map(b => b.name);
const LIMB = { 'upLeg.L': ['foot', 0], 'leg.L': ['foot', 0], 'upLeg.R': ['foot', 1], 'leg.R': ['foot', 1], 'upperArm.L': ['hand', 0], 'foreArm.L': ['hand', 0], 'upperArm.R': ['hand', 1], 'foreArm.R': ['hand', 1] };
const ATT = 300, ANY = 900, JERK = 12;
const all = [...SCENES_FOOT.map((s, i) => ['foot' + (i + 1), ...s]), ...SCENES.map((s, i) => ['reach' + (i + 1), ...s]), ...SCENES_H.map(s => [s[0].split(' ')[0], ...s]), ...SCENES_HV.map(s => [s[0].split(' ')[0], ...s])].filter(s => !process.env.ONLY || process.env.ONLY.split(',').includes(s[0]));
const out = { mode: clip ? 'clip' : 'proc', src: process.env.VARIANT ? '자세 ' + process.env.VARIANT : process.env.SRC ? '옛 소스' : process.env.OLDPOSE ? '자세의 층 끔' : '지금', 기준: { 붙은_팔다리_초속_도: ATT, 모든_뼈_초속_도: ANY, 한_걸음_변화_도: JERK }, scenes: {} };
for (const [id, title, fn, assist, mode, st0] of all) {
  const sim = makeSim(rig, makeWorld(), clips); sim.reset({ pos: st0 || START, yaw: Math.PI }); sim.opt.wallRest = false; sim.opt.footAssist = !!assist; if (process.env.VARIANT) sim.opt.posture = process.env.VARIANT;
  const inputs = [], put = (inp = {}, cmd = []) => inputs.push({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd }), rep = (n, inp, cmd) => { for (let i = 0; i < n; i++) put(inp, i ? [] : cmd); };
  fn(sim, put, rep);
  const prev = new Map(), lastD = new Map(), peak = {}, events = [], jerks = []; let cur = null;
  // p3d-0.10.2(GPT의 0.10.1 검토 7절): 부위별 위반을 사건의 대표 뼈와 따로 센다 — 같은 걸음에 더 빠른 팔이 다리의 위반을 가리지 않게
  const part = {}, knee = [[], []], jit = [];
  for (let k = 0; k < inputs.length; k++) {
    sim.step(inputs[k]); rig.root.updateMatrixWorld(true); const K = sim.climb, t = (k + 1) / 120, ev = K.events.filter(e => e.type !== 'try').map(e => e.type + (e.name ? ' ' + e.name : ''));
    let hit = null;
    for (const b of rig.list) {
      const q = b.getWorldQuaternion(new THREE.Quaternion()), p = prev.get(b.name); prev.set(b.name, q); if (!p) continue;
      const d = p.angleTo(q) * 180 / Math.PI, w = d * 120, ld = lastD.get(b.name); lastD.set(b.name, d);
      if (!peak[b.name] || w > peak[b.name][0]) peak[b.name] = [Math.round(w), +t.toFixed(3)];
      if (k > 1 && ld !== undefined && Math.abs(d - ld) > JERK && K.on) jerks.push(`${t.toFixed(3)} ${b.name} ${Math.abs(d - ld).toFixed(1)}°`);
      const L = LIMB[b.name], att = L && K.on && (L[0] === 'foot' ? K.feet[L[1]].st === 'plant' : K.hands[L[1]].st === 'hold');
      if ((att && w > ATT) || w > ANY) { if (!hit || w > hit.w) hit = { bone: b.name, w, att: !!att }; }
      if (att && w > ATT) { const P2 = part[b.name] || (part[b.name] = { n: 0, max: 0, at: 0, first: t }); P2.n++; if (w > P2.max) { P2.max = w; P2.at = t; } }
    }
    // 디딘 무릎의 왕복(p3d-0.10.2 — 검토의 h3: 0.092초에 이동 방향이 6번 바뀜, 경로 129mm에 순이동 8mm): 디딘 동안 무릎 자리의 12걸음(0.1초) 창마다 경로·순이동·방향 바뀜을 센다
    for (const i of [0, 1]) { const st = K.on && K.feet[i].st === 'plant', kp = rig.bones[`leg.${i ? 'R' : 'L'}`].getWorldPosition(new THREE.Vector3()), Q = knee[i];
      if (!st) { Q.length = 0; continue; } Q.push(kp); if (Q.length > 13) Q.shift();
      if (Q.length === 13) { let path = 0, rev = 0, pd = null; for (let j = 1; j < 13; j++) { const d = Q[j].clone().sub(Q[j - 1]), l = d.length(); path += l; if (l > 5e-4) { if (pd && pd.dot(d) < 0) rev++; pd = d; } }
        const net = Q[12].distanceTo(Q[0]); if (rev >= 3 && path > 0.02 && net < path / 3) jit.push({ t, leg: i ? 'R' : 'L', path, net, rev }); } }
    if (hit) { if (cur && k - cur.k1 <= 2) { cur.k1 = k; if (hit.w > cur.w) Object.assign(cur, { w: hit.w, bone: hit.bone, att: hit.att, at: t }); cur.ev.push(...ev); } else { cur = { k0: k, k1: k, w: hit.w, bone: hit.bone, att: hit.att, at: t, ev: [...ev], state: K.hands.map(h => h.st[0]).join('') + K.feet.map(f => f.st[0]).join('') }; events.push(cur); } }
    else if (cur && ev.length && k - cur.k1 <= 2) cur.ev.push(...ev);
  }
  const R = { 제목: title, 걸음: inputs.length, 사건: events.map(e => ({ 구간_초: [+((e.k0 + 1) / 120).toFixed(3), +((e.k1 + 1) / 120).toFixed(3)], 가장_빠른_뼈: e.bone, 초속_도: Math.round(e.w), 붙은_팔다리: e.att, 손발_상태: e.state, 그때_일: [...new Set(e.ev)].join(', ') })), 한_걸음_변화_12도_넘음: jerks.length, 튐_목록: jerks.slice(0, 12), 뼈마다_가장_빠른_초속_도: Object.fromEntries(['hips', 'chest', 'upLeg.L', 'leg.L', 'upLeg.R', 'leg.R', 'upperArm.L', 'foreArm.L', 'upperArm.R', 'foreArm.R'].map(n => [n, peak[n]])) };
  R.부위별_위반 = Object.fromEntries(Object.entries(part).map(([n, v]) => [n, { 걸음: v.n, 가장_빠름_초속_도: Math.round(v.max), 그때_초: +v.at.toFixed(3), 처음_초: +v.first.toFixed(3) }]));
  { const by = {}; for (const j of jit) { const k2 = j.leg; if (!by[k2] || j.path > by[k2].path) by[k2] = j; } R.무릎_왕복 = { 창: jit.length, 가장_심한: Object.values(by).map(j => ({ 다리: j.leg, 끝_초: +j.t.toFixed(3), 경로_mm: +(j.path * 1000).toFixed(1), 순이동_mm: +(j.net * 1000).toFixed(1), 방향_바뀜: j.rev })) }; }
  out.scenes[id] = R;
  console.log(`\n■ ${id} ${title} [${out.mode} · ${out.src}]`);
  console.log(`  사건 ${R.사건.length}개 · 12° 넘는 한 걸음 변화 ${jerks.length}번`);
  { const pv = Object.entries(R.부위별_위반); if (pv.length) console.log(`  부위별(붙은 팔다리 초속 ${ATT}° 넘은 걸음): ${pv.map(([n, v]) => `${n} ${v.걸음}걸음 최대 ${v.가장_빠름_초속_도}°(${v.그때_초}초)`).join(' · ')}`); }
  if (R.무릎_왕복.창) console.log(`  디딘 무릎 왕복: 0.1초 창 ${R.무릎_왕복.창}개 · ${R.무릎_왕복.가장_심한.map(j => `${j.다리} ${j.끝_초}초 경로 ${j.경로_mm}mm 순이동 ${j.순이동_mm}mm 방향 바뀜 ${j.방향_바뀜}`).join(' · ')}`);
  for (const e of R.사건) console.log(`  ${e.구간_초[0].toFixed(3)}~${e.구간_초[1].toFixed(3)}초  ${e.붙은_팔다리 ? '붙은 ' : '      '}${e.가장_빠른_뼈.padEnd(10)} 초속 ${String(e.초속_도).padStart(5)}°  [${e.손발_상태}]  ${e.그때_일}`);
}
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ 실행_출처: __P, ...out }, null, 1));
// 검사(통과·실패): 디딘 다리(넓적다리·정강이)가 초속 300°를 넘는 구간이 없다. 0.9.0을 사용자에게 보낸 뒤 사용자가 영상 21초쯤에서 짚은 튐(디딘 무릎이 0.06초에 반대쪽으로 — 초속 1,620°)이 이것이다.
//   wall_check의 "한 걸음 회전량 변화 12°" 검사는 이것을 잡지 못했다 — 빠르기가 정해진 한계로 몇 걸음에 걸쳐 오르면 걸음 사이의 변화는 작다. 빠르기 자체를 재야 한다
{ // p3d-0.10.2: 다리의 판정은 부위별 누적으로(사건의 대표 뼈가 팔이어도 같은 때의 다리 위반을 센다)
  const legs = Object.entries(out.scenes).flatMap(([id, r]) => Object.entries(r.부위별_위반).filter(([n]) => /Leg|leg/.test(n)).map(([n, v]) => `${id} ${n} ${v.걸음}걸음 최대 ${v.가장_빠름_초속_도}°(${v.그때_초}초)`));
  console.log(`\n${legs.length ? 'FAIL' : 'PASS'}  디딘 다리가 초속 ${ATT}°를 넘는 걸음이 없다(장면 ${Object.keys(out.scenes).length}개, 걸음마다, 부위별로 센다) ${legs.length ? legs.join(' · ') : '0개'}`);
  const jw = Object.entries(out.scenes).filter(([, r]) => r.무릎_왕복.창).map(([id, r]) => `${id} ${r.무릎_왕복.가장_심한.map(j => `${j.다리} ${j.끝_초}초 ${j.경로_mm}/${j.순이동_mm}mm ${j.방향_바뀜}번`).join(' ')}`);
  console.log(`${jw.length ? 'FAIL' : 'PASS'}  디딘 무릎이 0.1초 안에 오가지 않는다(창 12걸음: 방향 바뀜 3번 이상 + 경로 2cm 넘음 + 순이동이 경로의 1/3 미만 — 개발 쪽 진단선) ${jw.length ? jw.join(' · ') : '0개'}`);
  if (legs.length || jw.length) process.exitCode = 1;
  const arms = Object.entries(out.scenes).flatMap(([id, r]) => r.사건.filter(e => e.초속_도 > 2000).map(e => `${id} ${e.구간_초[0]}초 ${e.가장_빠른_뼈} 초속 ${e.초속_도}°`));
  console.log(`기록  어떤 뼈든 초속 2,000°를 넘는 구간(알려진 것 — 통과·실패로 세지 않음): ${arms.length ? arms.join(' · ') : '없음'}`); }
