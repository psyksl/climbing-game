// 잡은 손의 물리 접촉과 그림 접촉(p3d-0.10.2, GPT의 0.10.1 검토 3번 "손목 0mm를 잘 잡음으로 판정하지 않는다 — 접촉 표면·법선·손목→잡는 점 변환을 정의해 손바닥·손가락·팔의 도달/충돌과 같이").
// 잡는 단계마다 잰다: 직전(잡기 0.1초 전) · 직후(잡은 걸음 ~0.1초) · 안정(잡고 0.5초 뒤) · 놓은 직후 · 다시 잡은 직후. 스크립트 입력(사람 손 아님). 기준은 개발 쪽 진단선이며 사람이 본 품질이 아니다.
//   손가락 네 개마다(메시): 가운데·끝 마디 정점 가운데 윗면 위(앞 모서리에서 5mm 넘게 안쪽)에 있는 것이 윗면에서 떨어진 가장 가까운 거리 — "덮음" = −3~+4mm
//   손바닥: 손목→가운뎃손가락 첫 마디의 가운데 점이 턱 앞면에서 떨어진 거리 · 손 메시(손·손가락 정점)가 턱·벽에 든 가장 깊은 곳 · 팔뚝 메시가 든 곳
//   물리: 어깨 → 잡는 손목 자리(anchor) 거리 ÷ 팔 길이, 잡음이 이어지는가
// 사용: node test/grip_check.mjs [JSON]   장면: ONLY=h1,h5   자세 설정: VARIANT=   옛 소스: SRC=
import { prov, provLine } from './provenance.mjs'; // 실행 출처(p3d-0.10.3) — 소스보다 먼저 불러와 설정 스위치를 켠다
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const __P = prov(); console.log(provLine(__P));
const HERE = path.dirname(fileURLToPath(import.meta.url)), SRC = process.env.SRC ? path.resolve(process.env.SRC) : path.resolve(HERE, '../src'), imp = f => import(pathToFileURL(path.join(SRC, f)).href);
const THREE = await import('three');
const { buildCharacter } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js'), { CL } = await imp('climb.js'), { buildHuman, makeRetarget } = await imp('human.js');
const { SCENES, SCENES_H, SCENES_HV = [], START } = await import('./scenes_foot.mjs');
const all = [...SCENES.map((s, i) => ['reach' + (i + 1), ...s]), ...SCENES_H.map(s => [s[0].split(' ')[0], ...s]), ...SCENES_HV.map(s => [s[0].split(' ')[0], ...s])].filter(s => (process.env.ONLY ? process.env.ONLY.split(',') : ['h1', 'h3', 'h5', 'reach3', 'm1', 'm5', 'v6']).includes(s[0]));
const rig = buildCharacter(), H = buildHuman(), R = makeRetarget(rig, H), V = () => new THREE.Vector3(), wp = n => H.bones[n].getWorldPosition(V());
const FING = ['index', 'middle', 'ring', 'pinky'], PAD = 0.009;
const vb = H.meshes.map(m => { const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight, o = []; for (let k = 0; k < si.count; k++) { let b = 0, w = -1; for (let j = 0; j < 4; j++) if (sw.getComponent(k, j) > w) { w = sw.getComponent(k, j); b = si.getComponent(k, j); } o.push(H.list[b].name); } return o; });
const inside = (v, bx) => Math.min(v.x - bx.min.x, bx.max.x - v.x, v.y - bx.min.y, bx.max.y - v.y, v.z - bx.min.z, bx.max.z - v.z);
function handPen(world, h) { const re = new RegExp(`^(hand|index|middle|ring|pinky|thumb)\\w*_${h}$`), ra = new RegExp(`^lowerarm_${h}$`), v = V(); let dH = 0, dA = 0, bH = '';
  H.meshes.forEach((m, mi) => { m.updateMatrixWorld(true); const n = m.geometry.attributes.position.count; for (let j = 0; j < n; j++) { const nm = vb[mi][j], isH = re.test(nm), isA = ra.test(nm); if (!isH && !isA) continue; m.getVertexPosition(j, v).applyMatrix4(m.matrixWorld);
    for (const bx of world.boxes) { if (bx.kind === 'floor') continue; const d = inside(v, bx); if (d > 0) { if (isH && d > dH) { dH = d; bH = nm + '→' + bx.name; } if (isA && d > dA) dA = d; } } } }); return { dH, dA, bH }; }
function measure(sim, world, i) { const K = sim.climb, Hd = K.hands[i], h = i ? 'r' : 'l', bx = Hd.edge ? Hd.edge.box : null; if (!bx) return null;
  const n = Hd.n.clone().setY(0).normalize(), top = bx.max.y, front = V().copy(Hd.grip).setY(0); // 앞면의 자리: 잡는 점(모서리)
  // p3d-0.10.3: 윗면의 x·z 범위를 모두 본다(GPT 지적 — 0.10.2는 x만 봐서 모서리·옆면 쪽에서 윗면 밖 정점을 셀 수 있었다)
  // 손가락의 덮음은 메시로 잰다(p3d-0.10.2): 끝 마디(03)·가운데 마디(02) 정점 가운데 윗면 위(앞 모서리에서 5mm 넘게 안쪽)에 있는 것의 윗면까지 가장 가까운 거리. −3~+4mm면 "덮음"(닿음). 뼈 반지름을 가정하지 않는다
  const fingers = FING.map(f => { const re = new RegExp(`^${f}_0[23]_${h}$`), v = V(); let gap = 9, behind = -9;
    H.meshes.forEach((m, mi) => { const N = m.geometry.attributes.position.count; for (let j = 0; j < N; j++) { if (!re.test(vb[mi][j])) continue; m.getVertexPosition(j, v).applyMatrix4(m.matrixWorld); const bh = -v.clone().sub(Hd.grip).dot(n);
      if (bh > 0.005 && v.x > bx.min.x - 0.002 && v.x < bx.max.x + 0.002 && v.z > bx.min.z - 0.002 && v.z < bx.max.z + 0.002) { const g = v.y - top; if (g < gap) { gap = g; behind = bh; } } } });
    return { f, gap, behind, over: gap < 9, wrap: gap > -0.003 && gap < 0.004 }; });
  const w = wp(`hand_${h}`), m1 = wp(`middle_01_${h}`), palmC = w.clone().lerp(m1, 0.5), palmOut = palmC.clone().sub(Hd.grip).dot(n);
  const pen = handPen(world, h), sh = K.T ? K.T.sh[i] : null, reach = sh ? sh.distanceTo(Hd.goal) / CL.ARM : null;
  return { 덮은_손가락: fingers.filter(x => x.wrap).length, 손가락: fingers.map(x => `${x.f[0]} 틈${(x.gap * 1000).toFixed(0)} 안${(x.behind * 1000).toFixed(0)}`).join(' '), 손바닥_가운데_앞면에서_mm: +(palmOut * 1000).toFixed(1), 첫마디_윗면에서_mm: +((m1.y - top) * 1000).toFixed(1),
    손_관통_mm: +(pen.dH * 1000).toFixed(1), 손_관통_곳: pen.bH, 팔뚝_관통_mm: +(pen.dA * 1000).toFixed(1), 어깨_손목_팔길이비: reach === null ? null : +reach.toFixed(3), 손목_모서리_아래_mm: +((Hd.grip.y - Hd.goal.y) * 1000).toFixed(1), 손목_앞면_앞_mm: +(Hd.goal.clone().sub(Hd.grip).dot(n) * 1000).toFixed(1), 세움: +sim.gw[i].toFixed(2), 상태: Hd.st }; }
const out = { src: process.env.SRC ? '옛 소스' : '지금', variant: process.env.VARIANT || '기본', scenes: {} };
for (const [id, title, fn, assist, , st0] of all) {
  const world = makeWorld(), sim = makeSim(rig, world, null); sim.reset({ pos: st0 || START, yaw: Math.PI }); sim.opt.wallRest = false; sim.opt.footAssist = !!assist; if (process.env.VARIANT) sim.opt.posture = process.env.VARIANT;
  const inputs = [], put = (inp = {}, cmd = []) => inputs.push({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd }), rep = (n, inp, cmd) => { for (let i = 0; i < n; i++) put(inp, i ? [] : cmd); }; fn(sim, put, rep);
  // 먼저 한 번 돌려 잡기·놓기의 걸음을 찾는다
  const evs = []; { const s2 = makeSim(buildCharacter(), makeWorld(), null); s2.reset({ pos: st0 || START, yaw: Math.PI }); s2.opt.wallRest = false; s2.opt.footAssist = !!assist; if (process.env.VARIANT) s2.opt.posture = process.env.VARIANT;
    for (let k = 0; k < inputs.length; k++) { s2.step(inputs[k]); for (const e of s2.climb.events) if (e.limb === 'hand' && ['grab', 'release', 'slip'].includes(e.type)) evs.push({ k, type: e.type, i: e.i }); } }
  const marks = new Map(); let nG = {};
  for (const e of evs) { if (e.type === 'grab') { nG[e.i] = (nG[e.i] || 0) + 1; const tag = nG[e.i] > 1 ? '다시 잡은' : ''; marks.set(e.k - 12, [...(marks.get(e.k - 12) || []), [e.i, `${tag}잡기 직전(0.1초 전)`]]); marks.set(e.k + 1, [...(marks.get(e.k + 1) || []), [e.i, `${tag}잡은 직후`]]); marks.set(e.k + 12, [...(marks.get(e.k + 12) || []), [e.i, `${tag}잡고 0.1초`]]); marks.set(e.k + 60, [...(marks.get(e.k + 60) || []), [e.i, `${tag}잡고 0.5초(안정)`]]); }
    else marks.set(e.k + 1, [...(marks.get(e.k + 1) || []), [e.i, `${e.type === 'slip' ? '미끄러진' : '놓은'} 직후`]]); }
  const rows = [];
  for (let k = 0; k < inputs.length; k++) { sim.step(inputs[k]); R.apply(sim.fing, sim.pron, sim.climb, world, sim.gw); H.root.updateMatrixWorld(true);
    for (const [i, tag] of marks.get(k) || []) { const Hd = sim.climb.hands[i]; const m = Hd.edge || Hd.st === 'hold' ? measure(sim, world, i) : null; rows.push({ 걸음초: +((k + 1) / 120).toFixed(3), 손: i ? '오른손' : '왼손', 순간: tag, ...(m || { 상태: Hd.st, 비고: '턱 없음' }) }); } }
  out.scenes[id] = { 제목: title, 사건: evs.map(e => `${((e.k + 1) / 120).toFixed(3)} ${e.type} ${e.i ? 'R' : 'L'}`), rows };
  console.log(`\n■ ${id} ${title.slice(0, 50)} [${out.variant} · ${out.src}]`);
  for (const r of rows) console.log(`  ${String(r.걸음초).padEnd(6)} ${r.손} ${r.순간.padEnd(14)} ${r.상태} 세움${r.세움} 덮음 ${r.덮은_손가락}/4 [${r.손가락}] 손바닥↔앞면 ${r.손바닥_가운데_앞면에서_mm}mm 첫마디↔윗면 ${r.첫마디_윗면에서_mm}mm 손관통 ${r.손_관통_mm}mm 팔뚝관통 ${r.팔뚝_관통_mm}mm 팔길이비 ${r.어깨_손목_팔길이비} 손목(모서리 아래 ${r.손목_모서리_아래_mm}·앞 ${r.손목_앞면_앞_mm})`);
}
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ 실행_출처: __P, ...out }, null, 1));
