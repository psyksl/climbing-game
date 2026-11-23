// 사람 관절의 범위 점검(p3d-0.11.1, 사용자 플레이 0.11.0 "관절이 좀비 관절처럼 말도 안 되는 방향으로 꺾이고 뒤틀린다" — 화면 캡처 8장).
// ① 캡처의 자세를 다시 만든다: 턱 A를 잡고 발을 벽면의 높은 곳·옆으로 먼 곳에 보낸다. 범위를 켜면 거부(또는 디딘 뒤 떨어짐)되고, 끈 것(NOANAT=1 — 0.11.0과 같다)은 그대로 디딘다.
// ② 보통 장면(발 9 · 한 손 뻗기 6 · h1~h5 · 변형 · 다른 벽)에서 디딘·가는 다리의 고관절이 범위를 넘은 가장 큰 각과 무릎이 굽는 쪽을 걸음마다 잰다(범위를 켠 채).
// 스크립트 입력(사람 손 아님). 범위 값은 실험값이며 사람의 한계를 잰 것이 아니다. 사용: node test/anat_check.mjs [JSON]   자세 방식: POSTURE=fb(기본) | rule
import { prov, provLine } from './provenance.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const __P = prov(); console.log(provLine(__P));
const HERE = path.dirname(fileURLToPath(import.meta.url)), SRC = path.resolve(HERE, '../src'), imp = f => import(pathToFileURL(path.join(SRC, f)).href);
const THREE = await import('three');
const { buildCharacter, DIM } = await imp('rig.js'), W = await imp('world.js'), { makeSim } = await imp('sim.js'), { legExcess, kneeTurn, shoulderExcess, humerusTwist } = await imp('anat.js');
const SC = await import('./scenes_foot.mjs'), { SCENES_C } = await import('./scenes_corner.mjs');
const POST = process.env.VARIANT || 'fb', out = { 자세: POST, 범위: globalThis.NOANAT ? '끔(0.11.0)' : '켬', checks: [], 캡처_자세: [], 장면: {} }, deg = 180 / Math.PI; let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`); out.checks.push({ name, ok, detail }); if (!ok) fail++; };
const hand = (i, p) => ({ type: 'hand', i, p }), foot = (i, p) => ({ type: 'foot', i, p });
const qA = q => [q.x, q.y, q.z, q.w], vA = v => [v.x, v.y, v.z];
// 지금 자세에서 다리 i의 고관절 넘침·무릎 돌림(그려진 뼈 자리로 잰다)
function legNow(sim, rig, i) { const s = i ? 'R' : 'L', B = rig.bones, P = n => B[n].getWorldPosition(new THREE.Vector3()), hj = P(`upLeg.${s}`), kn = P(`leg.${s}`), an = P(`foot.${s}`), qH = B.hips.getWorldQuaternion(new THREE.Quaternion()), sx = i ? -1 : 1;
  const u = an.clone().sub(hj).normalize(), pole = kn.clone().sub(hj); pole.addScaledVector(u, -pole.dot(u)); const bent = pole.length() > 0.03;
  return { hip: legExcess(qA(qH), vA(hj), vA(kn), vA(an), sx) * deg, turn: bent ? kneeTurn(qA(qH), vA(hj), vA(kn), vA(an), sx) * deg : 0, footAboveHip: an.y - hj.y }; }

// 지금 자세에서 팔 i의 어깨 넘침·위팔 비틀림(그려진 뼈 자리, 가슴의 틀)
function armNow(rig, i) { const s = i ? 'R' : 'L', B = rig.bones, P = n => B[n].getWorldPosition(new THREE.Vector3()), sh = P(`upperArm.${s}`), el = P(`foreArm.${s}`), wr = P(`hand.${s}`), qC = B.chest.getWorldQuaternion(new THREE.Quaternion()), sx = i ? -1 : 1, tw = humerusTwist(qA(qC), vA(sh), vA(el), vA(wr));
  return { sho: shoulderExcess(qA(qC), vA(sh), vA(el), sx) * deg, tw: tw === null ? 0 : tw * deg }; }
// ── ① 캡처의 자세: 턱 A 두 손(또는 한 손) + 발을 말이 안 되는 자리로 ──
// [이름, [[발, 자리] …](차례로 보낸다), 기대: 'no' = 마지막에 보낸 발이 그 자리에 디디고 있으면 안 된다 · 'yes' = 디뎌야 한다 · 'info' = 적기만 한다]
const CASES = [
  ['오른발을 머리 높이의 벽면에(캡처 1·mocap 1)', [[1, [-0.45, 1.55, -3.0]]], 'no'],
  ['오른발을 어깨 높이의 벽면에, 옆으로(캡처 1·2)', [[1, [-0.30, 1.30, -3.0]]], 'no'],
  ['두 발을 양옆 엉덩이 높이의 벽면에 — 일자 벌리기(캡처 mocap 2)', [[0, [-1.55, 0.95, -3.0]], [1, [-0.25, 0.95, -3.0]]], 'no'],
  ['두 발을 양옆 엉덩이보다 높은 벽면에(캡처 mocap 3)', [[0, [-1.50, 1.10, -3.0]], [1, [-0.30, 1.10, -3.0]]], 'no'],
  ['왼발을 몸 건너편(오른쪽) 엉덩이 높이의 벽면에(캡처 4)', [[0, [-0.25, 0.95, -3.0]]], 'no'],
  ['왼발 한쪽만 옆으로 먼 엉덩이 높이의 벽면에(높은 옆 디딤 — 유연한 사람은 된다)', [[0, [-1.55, 0.95, -3.0]]], 'info'],
  ['왼발을 몸 건너편(오른쪽) 무릎 높이의 벽면에(엇갈려 디딤)', [[0, [-0.35, 0.55, -3.0]]], 'info'],
  ['오른발을 낮은 발판에(보통)', [[1, [-0.45, 0.5, -2.93]]], 'yes'],
  ['왼발을 넓은 발판에(보통)', [[0, [-1.45, 0.30, -2.75]]], 'yes'],
  ['오른발을 무릎 높이 벽면에(보통)', [[1, [-0.75, 0.45, -3.0]]], 'yes'],
  ['오른발을 넓적다리 높이 벽면에, 앞으로(보통)', [[1, [-0.80, 0.65, -3.0]]], 'yes'],
  ['오른발을 엉덩이 높이 벽면에, 앞으로(고관절이 벽에서 30cm — 무릎이 갈 자리가 없다)', [[1, [-0.80, 0.85, -3.0]]], 'info'],
];
for (const [name, seq, want] of CASES) { const rig = buildCharacter(), sim = makeSim(rig, W.makeWorld(), null); sim.opt.posture = POST; sim.reset({ pos: [-0.9, 0, -2.58], yaw: Math.PI }); sim.opt.wallRest = false; sim.opt.footAssist = false; sim.opt.posture = POST;
  const ev = [], run = (n, cmd = [], inp = {}) => { for (let k = 0; k < n; k++) { sim.step({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd: k ? [] : cmd }); for (const e of sim.climb.events) if (e.limb === 'foot' && e.type !== 'try') ev.push((e.i ? '오' : '왼') + ' ' + e.type + (e.why ? `(${e.why})` : '')); } };
  run(30); run(150, [hand(0, [-1.1, 1.92, -2.84])]); run(150, [hand(1, [-0.7, 1.92, -2.84])]); ev.length = 0; let worst = { hip: -99, turn: 0 };
  for (const [fi, pt] of seq) { run(1, [foot(fi, pt)]); for (let k = 0; k < 300; k++) { run(1); rig.root.updateMatrixWorld(true); for (const F of sim.climb.feet) if (F.st !== 'free') { const m = legNow(sim, rig, F.i); if (m.hip > worst.hip) worst = m; } } }
  const [fi, pt] = seq[seq.length - 1], on = f => { const F = sim.climb.feet[f[0]]; return F.st === 'plant' && Math.hypot(F.p.x - f[1][0], F.p.y - f[1][1]) < 0.08; }, there = seq.every(on);
  const row = { 자세: name, 기대: want, 보낸_발이_모두_그_자리에_디딤: there, 사건: ev, 끝: sim.climb.feet.map(F => F.st + (F.st === 'plant' && F.box ? ':' + F.box.name : '')).join(' / '), 고관절_넘침_최대_도: +worst.hip.toFixed(1), 무릎_돌림_도: +worst.turn.toFixed(1) };
  out.캡처_자세.push(row); console.log(`  [${want}] ${name}: ${there ? '디딤' : '디디지 않음'} · ${ev.join(' → ') || '사건 없음'} · 다리 넘침 최대 ${row.고관절_넘침_최대_도}°`); }
if (!globalThis.NOANAT) { const R = out.캡처_자세, bad = R.filter(r => r.기대 === 'no'), ok = R.filter(r => r.기대 === 'yes');
  check('말이 안 되는 자리(머리·어깨 높이의 벽면, 양옆 일자 벌리기, 엉덩이보다 높은 양옆, 몸 건너편 엉덩이 높이)에 보낸 발은 그 자리에 디디고 있지 않다', bad.every(r => !r.보낸_발이_모두_그_자리에_디딤), bad.map(r => (r.보낸_발이_모두_그_자리에_디딤 ? '디딤' : '아님')).join(' | '));
  check('보통 자리(낮은 발판·넓은 발판·무릎 높이 벽면·넓적다리 높이 벽면)는 그대로 디딘다', ok.every(r => r.보낸_발이_모두_그_자리에_디딤), ok.map(r => (r.보낸_발이_모두_그_자리에_디딤 ? '디딤' : '아님')).join(' | ')); }

// ── ② 보통 장면: 디딘·가는 다리의 고관절 넘침과 무릎 돌림 ──
const pad = s => [s[0], s[1], s[2], s[3], s[4], null, 'main'];
const all = [...SC.SCENES_FOOT.map((s, i) => ['foot' + (i + 1), ...pad(s)]), ...SC.SCENES.map((s, i) => ['reach' + (i + 1), ...pad(s)]), ...SC.SCENES_H.map(s => [s[0].split(' ')[0], ...pad(s)]), ...SC.SCENES_HV.map(s => [s[0].split(' ')[0], ...pad(s)]), ...SC.SCENES_J.map(s => [s[0].split(' ')[0], ...pad(s)]), ...SCENES_C.map(s => [...s, 'corner'])].filter(s => !process.env.ONLY || process.env.ONLY.split(',').includes(s[0]));
let gHip = -99, gHipAt = '', gExt = 0, gInt = 0, overSteps = 0, lifts = 0, denies = 0; const ARM = { hold: { sho: -99, tw: 0, at: '', n: 0, over: 0 }, reach: { sho: -99, tw: 0, at: '', n: 0, over: 0 }, free: { sho: -99, tw: 0, at: '', n: 0, over: 0 } };
for (const [id, title, fn, assist, , st0, yaw0, wn] of all) { const rig = buildCharacter(), sim = makeSim(rig, wn === 'corner' ? W.makeFixtureWorld() : W.makeWorld(), null); sim.opt.posture = POST; sim.reset({ pos: st0 || SC.START, yaw: yaw0 ?? Math.PI }); sim.opt.wallRest = false; sim.opt.footAssist = !!assist; sim.opt.posture = POST;
  const inputs = [], put = (inp = {}, cmd = []) => inputs.push({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd }), rep = (n, inp, cmd) => { for (let i = 0; i < n; i++) put(inp, i ? [] : cmd); }; fn(sim, put, rep);
  let mh = -99, mt = [0, 0], at = 0; const ev = [];
  for (let k = 0; k < inputs.length; k++) { sim.step(inputs[k]); for (const e of sim.climb.events) { if (/꺾이는 한계/.test(e.why || '')) { lifts++; ev.push(`${((k + 1) / 120).toFixed(2)} ${e.type} ${e.name}(${e.why})`); } if (/그렇게는 올라가지|접을 수 없음/.test(e.why || '')) { denies++; ev.push(`${((k + 1) / 120).toFixed(2)} ${e.type} ${e.name}(${e.why})`); } }
    if (!sim.climb.on) continue; rig.root.updateMatrixWorld(true);
    for (const H of sim.climb.hands) { const m = armNow(rig, H.i), A = ARM[H.st] || ARM.free; A.n++; if (m.sho > 10 || m.tw > 110) A.over++; if (m.sho > A.sho) { A.sho = m.sho; A.at = `${id} @${((k + 1) / 120).toFixed(2)} ${H.s}`; } if (m.tw > A.tw) { A.tw = m.tw; A.twAt = `${id} @${((k + 1) / 120).toFixed(2)} ${H.s}`; } }
    for (const F of sim.climb.feet) { if (F.st === 'free') continue; const m = legNow(sim, rig, F.i); if (m.hip > mh) { mh = m.hip; at = (k + 1) / 120; } if (m.hip > 14) overSteps++; mt[0] = Math.max(mt[0], m.turn); mt[1] = Math.min(mt[1], m.turn); } }
  out.장면[id] = { 고관절_넘침_최대_도: +mh.toFixed(1), 그때_초: +at.toFixed(2), 무릎_바깥_돌림_최대_도: +mt[0].toFixed(0), 무릎_안쪽_돌림_최대_도: +(-mt[1]).toFixed(0), 범위_사건: ev };
  if (mh > gHip) { gHip = mh; gHipAt = `${id} @${at.toFixed(2)}`; } gExt = Math.max(gExt, mt[0]); gInt = Math.max(gInt, -mt[1]);
  if (ev.length || mh > 8) console.log(`  ${id.padEnd(7)} 고관절 넘침 최대 ${mh.toFixed(1)}°(@${at.toFixed(2)}) · 무릎 바깥 ${mt[0].toFixed(0)}° 안쪽 ${(-mt[1]).toFixed(0)}° ${ev.join(' | ')}`); }
console.log(`보통 장면 ${all.length}개: 고관절 넘침 최대 ${gHip.toFixed(1)}°(${gHipAt}) · 14° 넘은 걸음 ${overSteps} · 무릎 돌림 바깥 최대 ${gExt.toFixed(0)}° 안쪽 최대 ${gInt.toFixed(0)}° · 범위로 떨어진 발 ${lifts} · 범위로 거부된 발 ${denies}`);
for (const [k, A] of Object.entries(ARM)) console.log(`팔(${k}): 어깨 넘침 최대 ${A.sho.toFixed(1)}°(${A.at}) · 위팔 비틀림 최대 ${A.tw.toFixed(0)}°(${A.twAt || ''}) · 넘은 걸음(어깨 10° 또는 비틀림 110° 넘게) ${A.over}/${A.n}`);
out.팔 = ARM;
out.보통_장면_합 = { 장면: all.length, 고관절_넘침_최대_도: +gHip.toFixed(1), 어디: gHipAt, 넘침_14도_넘은_걸음: overSteps, 무릎_바깥_최대_도: +gExt.toFixed(0), 무릎_안쪽_최대_도: +gInt.toFixed(0), 범위로_떨어진_발: lifts, 범위로_거부된_발: denies };
if (!globalThis.NOANAT) check('보통 장면에서 그려진 넓적다리의 비틀림이 범위(바깥 85°, 안쪽 40°) + 10°를 넘지 않는다', gExt <= 95 && gInt <= 50, `바깥 ${gExt.toFixed(0)}° · 안쪽 ${gInt.toFixed(0)}°`);
console.log(`\n통과 ${out.checks.filter(c => c.ok).length} · 실패 ${fail}`);
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ 실행_출처: __P, ...out }, null, 1));
process.exitCode = fail ? 1 : 0;
