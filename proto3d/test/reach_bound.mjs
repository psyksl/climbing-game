// 닿는 거리의 변화를 잰다(p3d-0.9.0): 몸통 자세의 층이 어깨를 얼마나 옮기고, 성공/실패의 경계를 얼마나 옮기는가. 통과·실패를 세지 않는 측정이다.
// 고정 수치(한도)는 이 측정을 보고 사용자·GPT가 정한다 — 여기서는 후보만 낸다. 스크립트 입력(사람 손 아님). 몸의 기준 자리·팔다리 길이·잡은 접촉은 어느 설정에서도 그대로다.
//   ① 위로: 왼손 턱 A, 한 발을 무릎 높이 발판에 → 몸 위로(W)를 n걸음 → 오른손을 턱 F로. W를 몇 걸음 눌러야 잡히는가(적을수록 낮은 자리에서 닿는다)와, 걸음마다의 "모자란 거리"
//   ② 옆으로: 왼손으로 턱 A를 잡고 두 발로 바닥에 선 자리를 왼쪽으로 옮겨 가며 오른손을 턱 F로. 얼마나 먼 자리까지 잡히는가
// 사용: node test/reach_bound.mjs [JSON]   캡처 동작: MODE=clip
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), THREE = await import('three');
const load = async dir => { const imp = f => import(pathToFileURL(path.join(dir, f)).href); return { ...(await imp('rig.js')), ...(await imp('world.js')), ...(await imp('sim.js')), CL: (await imp('climb.js')).CL }; };
const NEW = await load(path.resolve(HERE, '../src')), OLD = process.env.OLDSRC ? await load(path.resolve(process.env.OLDSRC)) : null;
const clip = process.env.MODE === 'clip', clips = clip ? JSON.parse(fs.readFileSync(path.resolve(HERE, '../assets_local/clips.json'), 'utf8')) : null;
const hand = (i, p) => ({ type: 'hand', i, p }), foot = (i, p) => ({ type: 'foot', i, p }), F = [-0.3, 2.15, -2.86], LOW = [-0.45, 0.5, -2.93];
// 설정: 옛 소스(있으면), 새 소스에서 층을 끈 것(= 옛 소스와 같아야 한다 — 측정이 맞는지의 확인), 손 뻗기의 몫만 0·기본·두 배, 층의 다른 몫을 하나씩 끈 것
const base = { ...NEW.CL }, VARS = [
  ...(OLD ? [['0.8.8 소스', OLD, null, false]] : []),
  ['층 끔(OLDPOSE)', NEW, {}, true],
  ['층 켬 · 손 뻗기의 몫 0', NEW, { PO_REACH: 0 }, false],
  [`층 켬 · 기본(손 뻗기의 몫 ${base.PO_REACH * 100}cm)`, NEW, {}, false],
  [`층 켬 · 손 뻗기의 몫 ${base.PO_REACH * 200}cm`, NEW, { PO_REACH: base.PO_REACH * 2 }, false],
  ['층 켬 · 받치는 발 쪽으로 가는 몫 0', NEW, { PO_SIDE: 0 }, false],
  ['층 켬 · 엉덩이를 빼는 몫 0', NEW, { PO_BACK: 0 }, false],
];
function run(M, cl, off, start, pre, target) {
  Object.assign(NEW.CL, base, cl || {}); globalThis.OLDPOSE = off ? 1 : 0;
  const rig = M.buildCharacter(), sim = M.makeSim(rig, M.makeWorld(), clips); sim.reset({ pos: start, yaw: Math.PI }); sim.opt.wallRest = false; sim.opt.footAssist = false;
  const step = (inp = {}, cmd = []) => sim.step({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd }), rep = (n, inp, cmd) => { for (let i = 0; i < n; i++) step(inp, i ? [] : cmd); };
  pre(rep); const K = sim.climb, ok = K.hands[0].st === 'hold', k0 = K.log.length, wp = n => rig.bones[n].getWorldPosition(new THREE.Vector3());
  rig.root.updateMatrixWorld(true); const sh0 = wp('upperArm.R'), pos0 = sim.body.pos.clone(), tg = new THREE.Vector3(...target); let shMin = sh0.distanceTo(tg), shAt = sh0.clone();
  for (let k = 0; k < 240; k++) { step({}, k === 0 ? [hand(1, target)] : []); if (K.hands[1].st === 'reach') { rig.root.updateMatrixWorld(true); const s = wp('upperArm.R'), d = s.distanceTo(tg); if (d < shMin) { shMin = d; shAt = s; } } else if (k > 5) break; }
  const e = K.log.slice(k0).find(x => x.limb === 'hand' && x.i === 1 && (x.type === 'grab' || x.type === 'reject')), m = e && /(\d+)(cm|mm) 모자람/.exec(e.why || '');
  return { 앞_조건: ok, 결과: e ? e.type : '끝나지 않음', 모자란_cm: e && e.type === 'reject' ? (m ? (m[2] === 'mm' ? +m[1] / 10 : +m[1]) : null) : 0, 까닭: e ? e.why || '' : '', 어깨에서_목표까지_가장_가까이_cm: +(shMin * 100).toFixed(1), 어깨가_목표_쪽으로_간_cm: +((sh0.distanceTo(tg) - shMin) * 100).toFixed(1), 몸_원점이_움직인_cm: +(sim.body.pos.distanceTo(pos0) * 100).toFixed(1), 뻗기_직전: { 몸_원점_높이_cm: +(pos0.y * 100).toFixed(1), 몸_원점_x_cm: +(pos0.x * 100).toFixed(1), 오른_어깨가_원점에서_오른쪽_위_벽쪽_cm: [sh0.x - pos0.x, sh0.y - pos0.y, -(sh0.z - pos0.z)].map(v => +(v * 100).toFixed(1)), 어깨에서_목표까지_cm: +(sh0.distanceTo(tg) * 100).toFixed(1) }, 발: K.feet.map(f => f.st + (f.st === 'plant' ? ':' + f.box.name : '')).join('/') };
}
const out = { mode: clip ? 'clip' : 'proc', 위로: {}, 옆으로: {} };
// ① 위로: 왼발(교차) 또는 오른발(같은 쪽)을 무릎 높이 발판에
for (const [fname, fi] of [['왼발을 발판에(사용자 장면)', 0], ['오른발을 발판에', 1]]) {
  console.log(`\n■ 위로 — ${fname}: W를 n걸음(1걸음 = 1/120초) 누른 뒤 오른손을 턱 F로`); out.위로[fname] = {};
  for (const [vname, M, cl, off] of VARS) { const rows = []; let first = null;
    for (let n = 0; n <= 120; n += 5) { const r = run(M, cl, off, [-0.62, 0, -2.58], rep => { rep(60); rep(150, {}, [hand(0, [-0.72, 1.92, -2.84])]); rep(260, {}, [foot(fi, fi ? [-0.40, 0.5, -2.93] : LOW)]); rep(n, { cy: 1 }); rep(120); }, F); rows.push({ n, ...r }); if (first === null && r.결과 === 'grab') first = n; }
    const at = k => rows.find(r => r.n === k); out.위로[fname][vname] = { 잡히기_시작하는_W_걸음: first, 걸음별: rows.map(r => `${r.n}:${r.결과 === 'grab' ? '잡음' : r.모자란_cm + 'cm'}`).join(' '), W_45걸음일_때: at(45) };
    console.log(`  ${vname.padEnd(28)} 잡히기 시작 = W ${first}걸음 · 45걸음일 때: ${at(45).결과 === 'grab' ? '잡음' : '모자람 ' + at(45).모자란_cm + 'cm'}, 뻗기 직전 몸 높이 ${at(45).뻗기_직전.몸_원점_높이_cm}cm · x ${at(45).뻗기_직전.몸_원점_x_cm} · 어깨(원점에서 오른쪽/위/벽 쪽) ${at(45).뻗기_직전.오른_어깨가_원점에서_오른쪽_위_벽쪽_cm.join('/')} · 어깨→목표 ${at(45).뻗기_직전.어깨에서_목표까지_cm} | ` + rows.filter(r => r.n % 15 === 0).map(r => `${r.n}:${r.결과 === 'grab' ? '잡음' : r.모자란_cm}`).join(' ')); }
}
// ② 옆으로: 선 자리를 왼쪽으로 옮겨 가며(왼손은 몸에서 10cm 왼쪽의 턱 A)
console.log('\n■ 옆으로 — 두 발로 바닥에 서서 W 0.5초 뒤 오른손을 턱 F의 왼쪽 끝으로(선 자리 x를 왼쪽으로 옮겨 감. 턱 F의 왼쪽 끝 x = −0.45)');
for (const [vname, M, cl, off] of VARS) { const rows = []; let last = null;
  for (let x = -0.62; x >= -1.001; x -= 0.02) { const r = run(M, cl, off, [x, 0, -2.58], rep => { rep(60); rep(150, {}, [hand(0, [Math.max(-1.55, x - 0.10), 1.92, -2.84])]); rep(60, { cy: 1 }); rep(120); }, [-0.43, 2.15, -2.86]); rows.push({ x: +x.toFixed(2), ...r }); if (r.결과 === 'grab') last = +x.toFixed(2); }
  out.옆으로[vname] = { 잡히는_가장_먼_자리_x: last, 턱_끝에서_몸까지_cm: last === null ? null : +((-0.45 - last) * 100).toFixed(0), 자리별: rows.map(r => `${r.x}:${r.결과 === 'grab' ? '잡음' : r.모자란_cm + 'cm'}`).join(' ') };
  console.log(`  ${vname.padEnd(28)} 잡히는 가장 먼 자리 x = ${last} (턱 끝에서 ${last === null ? '-' : ((-0.45 - last) * 100).toFixed(0)}cm) | ` + rows.filter((r, i) => i % 3 === 0).map(r => `${r.x}:${r.결과 === 'grab' ? '잡음' : r.모자란_cm}`).join(' ')); }
Object.assign(NEW.CL, base); globalThis.OLDPOSE = 0;
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
