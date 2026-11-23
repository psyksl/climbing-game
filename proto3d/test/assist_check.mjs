// 잡기 보정(p3d-0.11.4, 사용자 결정 2026-11-23)의 점검. 스크립트 입력(사람 손 아님). 사용: node test/assist_check.mjs [JSON]   자세: VARIANT=fb(기본)|rule · 캡처 동작: MODE=clip
// ① 땅에서 손을 뻗어 조금 모자람: 보정 끔이면 "닿지 않음", 켬이면 8cm 안은 잡고 그보다 멀면 거부 ② 한 손 매달림에서 흔들어(A/D) 옆의 먼 턱: 켬일 때 흔드는 때에 따라 잡히고, 흔들지 않으면 거부
// 잡은 뒤 몸이 끌려가는 빠르기(한 걸음에 몸 자리가 가장 크게 옮겨진 거리)를 함께 잰다 ③ 점프하며 잡기의 클릭 시각 범위(끔 / 켬)
import { prov, provLine } from './provenance.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const __P = prov(); console.log(provLine(__P));
const HERE = path.dirname(fileURLToPath(import.meta.url)), imp = f => import(pathToFileURL(path.join(HERE, '../src', f)).href);
const THREE = await import('three');
const { buildCharacter } = await imp('rig.js'), W = await imp('world.js'), { makeSim } = await imp('sim.js');
const CLP = path.join(HERE, '../assets_local/clips.json'); if (process.env.MODE === 'clip' && !fs.existsSync(CLP)) { console.log('clips.json 없음 → 건너뜀'); process.exit(0); }
const clips = process.env.MODE === 'clip' ? JSON.parse(fs.readFileSync(CLP, 'utf8')) : null, POST = process.env.VARIANT || 'fb';
const hand = (i, p) => ({ type: 'hand', i, p }), out = { 자세: POST, 동작: clips ? '캡처' : '자작', checks: [], cases: {} }; let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`); out.checks.push({ name, ok, detail }); if (!ok) fail++; };
const mk = (pos, assist) => { const rig = buildCharacter(), sim = makeSim(rig, W.makeWorld(), clips); sim.opt.posture = POST; sim.reset({ pos, yaw: Math.PI }); sim.opt.posture = POST; sim.opt.footAssist = false; sim.opt.wallRest = false; sim.opt.grabAssist = assist; const ev = []; let pop = 0, gap = 0, t = 0;
  const run = (n, inp = {}, cmd = []) => { for (let k = 0; k < n; k++) { const p0 = sim.body.pos.clone(), on0 = sim.climb.on; sim.step({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd: k ? [] : cmd }); t++; if (on0 && sim.climb.on) pop = Math.max(pop, sim.body.pos.distanceTo(p0)); for (const e of sim.climb.events) if (e.type !== 'try' && (e.limb === 'hand' || e.type === 'assist')) ev.push({ t: +(t / 120).toFixed(2), i: e.i, type: e.type, why: e.why || '' });
    for (const h of sim.climb.hands) if (h.st === 'hold') { rig.root.updateMatrixWorld(true); const w = rig.bones[`hand.${h.s}`].getWorldPosition(new THREE.Vector3()); gap = Math.max(gap, w.distanceTo(h.goal) - 0.10); } } };
  return { rig, sim, run, ev, st: () => ({ pop: +(pop * 100).toFixed(1), gap: +(Math.max(0, gap) * 100).toFixed(1) }) }; };
const seq = T => T.ev.map(e => `${e.type}${e.i !== undefined ? (e.i ? 'R' : 'L') : ''}${e.why ? '(' + e.why + ')' : ''}`).join(' → ');
// ① 땅에서 오른손을 턱 A의 오른쪽 끝으로(몸의 오른쪽. 서 있는 자리를 왼쪽으로 옮겨 가며 거리를 바꾼다)
{ const rows = []; for (const x of [-1.00, -1.06, -1.10, -1.14, -1.20, -1.30]) { const r = { 서는_자리: x }; for (const as of [false, true]) { const T = mk([x, 0, -2.58], as); T.run(30); T.run(260, {}, [hand(1, [-0.65, 1.92, -2.84])]); r[as ? '켬' : '끔'] = seq(T) || '없음'; if (as) Object.assign(r, T.st(), { 끝: T.sim.climb.hands.map(h => h.st).join('/') }); } rows.push(r); }
  out.cases['① 땅에서 조금 모자란 손'] = rows; for (const r of rows) console.log('  ', JSON.stringify(r));
  const sh = r => +((/닿지 않음\((\d+)(mm|cm)/.exec(r.끔) || [])[1] || 0) / ((/mm/.test(r.끔)) ? 10 : 1);
  check('① 땅: 보정 끔에서 "닿지 않음 N cm" 거부였던 거리 가운데 8cm 이하는 켬에서 잡고, 9cm 넘게 모자라면 켬에서도 거부한다', rows.every(r => !/닿지 않음/.test(r.끔) || (sh(r) <= 8 ? /grab/.test(r.켬) : /reject/.test(r.켬) && !/grab/.test(r.켬)) || (sh(r) > 8 && sh(r) <= 9)), rows.map(r => `${r.서는_자리}: 끔 ${sh(r) || '잡음'}cm → 켬 ${/grab/.test(r.켬) ? '잡음' : '거부'}`).join(' · '));
  check('① 땅: 보정으로 잡은 뒤 몸이 한 걸음에 2cm 넘게 옮겨지지 않는다(끌려가는 빠르기 초속 1.2m = 한 걸음 1cm)', rows.filter(r => /assist/.test(r.켬)).every(r => r.pop <= 2.0), rows.filter(r => /assist/.test(r.켬)).map(r => `${r.pop}cm`).join(', ')); }
// ② 한 손 매달림(왼손 턱 B, 발 없음)에서 오른손을 오른쪽 아래의 턱 E로. 매달린 자리 0.8 = 가만히는 23cm 모자람, 0.9 = 10cm 모자람(3cm 안팎은 몸을 옮기는 사이에 메워진다)
//   흔들기 = A/D를 0.375초씩 번갈아 눌러 키운 뒤, 오른쪽으로 흔들려 가는 빠르기가 그동안의 최대의 80%를 넘는 걸음에 뻗는다(이 장면의 흔들림은 초속 0.5m쯤)
if (POST !== 'fb') { console.log('② 건너뜀: 장면(매달린 자리 0.8·0.9)을 화면 기본 자세(fb)의 거리에 맞춰 두었다 — 옛 규칙에서는 같은 자리의 정지 모자람이 6cm라 전제가 맞지 않는다'); out.cases['② 건너뜀'] = '옛 규칙: 장면이 fb의 거리에 맞춰져 있음'; } else
{ const rows = []; const E = [1.80, 1.90, -2.86];
  for (const [name, bx, sw] of [['0.8 가만히', 0.8, 0], ['0.8 흔들어 오른쪽으로 갈 때', 0.8, 1], ['0.9 가만히', 0.9, 0]]) for (const as of [false, true]) {
    const T = mk([bx + 0.15, 0, -2.65], as); T.run(30); T.run(1, { jump: true }, [hand(0, [bx, 2.32, -2.86])]); T.run(59, { jump: true }); T.run(200); for (let k = 0; k < 900 && T.sim.body.vel.length() > 0.08; k++) T.run(1); const v0 = +T.sim.body.vel.length().toFixed(3); const ok0 = T.sim.climb.hands[0].st === 'hold'; T.ev.length = 0; // 뛰어 잡은 흔들림이 가라앉을 때까지(초속 8cm 아래) 기다린다 — 기다리지 않으면 "가만히"가 흔들리는 중이 되어 반동 허용이 붙는다
    let vmax = 0, fired = !sw; if (!sw) T.run(1, {}, [hand(1, E)]);
    for (let k = 0; k < 600 && !fired; k++) { const v = T.sim.body.vel.x; vmax = Math.max(vmax, Math.abs(v)); if (k > 200 && v > 0.8 * vmax && v > 0.25) { T.run(1, {}, [hand(1, E)]); fired = true; } else T.run(1, { cx: Math.floor(k / 45) % 2 ? 1 : -1 }); }
    T.run(300); rows.push({ 경우: name, 보정: as ? '켬' : '끔', 앞_조건: ok0, 뻗기_전_빠르기: v0, 뻗음: fired, 흔들림_최대_빠르기: +vmax.toFixed(2), 사건: seq(T), 끝: T.sim.climb.hands.map(h => h.st).join('/'), ...T.st() }); }
  out.cases['② 한 손 매달림에서 오른쪽 아래의 턱 E'] = rows; for (const r of rows) console.log('  ', JSON.stringify(r));
  const g = (n, a) => rows.find(r => r.경우 === n && r.보정 === a);
  check('② 앞 조건: 모든 경우에 왼손이 턱 B에 매달려 있고 흔드는 경우는 뻗었다', rows.every(r => r.앞_조건 && r.뻗음));
  check('② 보정 끔: 세 경우 모두 턱 E를 잡지 못한다(거리가 모자람)', rows.filter(r => r.보정 === '끔').every(r => !/grab/.test(r.사건)), rows.filter(r => r.보정 === '끔').map(r => r.사건).join(' · '));
  check('② 보정 켬, 가만히 23cm 모자람: 거부된다(너무 먼 거리는 보정하지 않는다)', !/grab/.test(g('0.8 가만히', '켬').사건), g('0.8 가만히', '켬').사건);
  check('② 보정 켬, 같은 자리에서 흔들어 오른쪽으로 갈 때 뻗음: 턱 E를 잡고 끝까지 잡고 있다(먼저 잡던 왼손은 필요하면 놓인다 — 잡자마자 놓치지 않는다)', /grab/.test(g('0.8 흔들어 오른쪽으로 갈 때', '켬').사건) && !/slipR/.test(g('0.8 흔들어 오른쪽으로 갈 때', '켬').사건) && g('0.8 흔들어 오른쪽으로 갈 때', '켬').끝.endsWith('hold'), g('0.8 흔들어 오른쪽으로 갈 때', '켬').사건);
  check('② 보정 켬, 가만히 10cm 모자람: 잡고 끝까지 잡고 있다(0.11.3: 잡자마자 "당기는 방향"으로 놓치거나 미리 "옆으로 당겨져"로 거부)', /grab/.test(g('0.9 가만히', '켬').사건) && !/slipR/.test(g('0.9 가만히', '켬').사건) && g('0.9 가만히', '켬').끝.endsWith('hold'), g('0.9 가만히', '켬').사건);
  check('② 보정으로 잡은 뒤 몸이 한 걸음에 3cm 넘게 옮겨지지 않는다(흔들리던 빠르기 + 끌려감)', rows.filter(r => /assist/.test(r.사건)).every(r => r.pop <= 3.0), rows.filter(r => /assist/.test(r.사건)).map(r => `${r.pop}cm`).join(', ')); }
// ③ 점프하며 잡기(사용자: "점프하면서 클릭했을 때 잡는 게 5번 중 1~2번"): 턱 B(왼손, 2.32m)와 턱 F(왼손, 2.15m — 바로 밑에서 뛴다). 점프 0.5초 누름, 클릭 = 점프를 누른 때 기준 −0.2 ~ +0.6초(0.05초 간격)
{ const rows = []; for (const [name, st, g] of [['턱 B', [0.62, 0, -2.65], [0.5, 2.32, -2.86]], ['턱 F(바로 밑)', [-0.3, 0, -2.62], [-0.3, 2.15, -2.86]]]) for (const as of [false, true]) { const r = { 턱: name, 보정: as ? '켬' : '끔', 결과: [] };
    for (let off = -24; off <= 72; off += 6) { const T = mk(st, as); const j0 = 60; for (let k = 0; k < 520; k++) T.run(1, { jump: k >= j0 && k < j0 + 60 }, k === j0 + off ? [hand(0, g)] : []);
      const ok = T.sim.climb.hands[0].st === 'hold'; r.결과.push(`${(off / 120).toFixed(2)}:${ok ? 'O' : 'X'}${ok ? '' : '(' + ((T.ev.find(e => e.type === 'reject' || e.type === 'slip') || {}).why || '없음').slice(0, 14) + ')'}`); }
    r.잡은_수 = r.결과.filter(x => /:O/.test(x)).length; rows.push(r); console.log('  ', r.턱, r.보정, r.잡은_수 + '/' + r.결과.length, r.결과.join(' ')); }
  out.cases['③ 점프하며 잡기'] = rows; const g = (n, a) => rows.find(r => r.턱 === n && r.보정 === a);
  check('③ 점프 잡기: 보정 켬에서 잡히는 클릭 시각이 끔보다 줄지 않고, 두 턱 모두 끔보다 늘거나 같다', ['턱 B', '턱 F(바로 밑)'].every(n => g(n, '켬').잡은_수 >= g(n, '끔').잡은_수), rows.map(r => `${r.턱} ${r.보정} ${r.잡은_수}/${r.결과.length}`).join(' · '));
  check('③ 점프 잡기: 보정 켬에서 잡은 손이 잡자마자 놓치는 경우가 없다(끝에 잡혀 있지 않은 경우의 까닭이 "놓침"이 아니다)', rows.filter(r => r.보정 === '켬').every(r => !r.결과.some(x => /충격|당기는 방향/.test(x))), rows.filter(r => r.보정 === '켬').map(r => r.결과.filter(x => /충격|당기는 방향/.test(x)).join(',') || '없음').join(' · ')); }
console.log(`\n통과 ${out.checks.filter(c => c.ok).length} · 실패 ${fail}`);
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ 실행_출처: __P, ...out }, null, 1));
process.exitCode = fail ? 1 : 0;
