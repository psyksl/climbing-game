// 잡기 보정(p3d-0.11.4, 사용자 결정 2026-11-23)의 점검. 스크립트 입력(사람 손 아님). 사용: node test/assist_check.mjs [JSON]   자세: VARIANT=fb(기본)|rule · 캡처 동작: MODE=clip
// ① 땅에서 손을 뻗어 조금 모자람: 보정 끔이면 "닿지 않음", 켬이면 8cm 안은 잡고 그보다 멀면 거부 ② 한 손 매달림에서 흔들어(A/D) 옆의 먼 턱: 켬일 때 흔드는 때에 따라 잡히고, 흔들지 않으면 거부
// 잡은 뒤 몸이 끌려가는 빠르기(한 걸음에 몸 자리가 가장 크게 옮겨진 거리)를 함께 잰다 ③ 점프하며 잡기의 클릭 시각 범위(끔 / 켬)
import { prov, provLine } from './provenance.mjs';
// [실제 설정] 한 줄(p3d-0.15.5, GPT의 0.15.4 검토: 회귀 파일에 실제 설정이 없었다): 이 시험이 **처음** 만든 sim의 설정을 끝날 때 적는다(처음에는 마지막 sim을 적었는데, 벽 회귀의 마지막 장면은 옛 자세 방식과 견주는 장면이라 "자세 rule · 전신 연결 끔"이 찍혔다)(계산이 읽는 값 — provenance.mjs provOptLine)
import { provOptLine } from './provenance.mjs'; let lastSim__ = null; process.on('exit', () => { if (lastSim__) console.log(provOptLine(lastSim__)); });
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const __P = prov(); console.log(provLine(__P));
const HERE = path.dirname(fileURLToPath(import.meta.url)), imp = f => import(pathToFileURL(path.join(HERE, '../src', f)).href);
const THREE = await import('three');
const CLM = await imp('climb.js'), { buildCharacter } = await imp('rig.js'), W = await imp('world.js'), { makeSim } = await imp('sim.js');
const mkSim__ = (...a) => { const s = makeSim(...a); lastSim__ = lastSim__ || s; return s; };
const CLP = path.join(HERE, '../assets_local/clips.json'); if (process.env.MODE === 'clip' && !fs.existsSync(CLP)) { console.log('clips.json 없음 → 건너뜀'); process.exit(0); }
const clips = process.env.MODE === 'clip' ? JSON.parse(fs.readFileSync(CLP, 'utf8')) : null, POST = process.env.VARIANT || 'fb';
const hand = (i, p) => ({ type: 'hand', i, p }), out = { 자세: POST, 동작: clips ? '캡처' : '자작', checks: [], cases: {} }; let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`); out.checks.push({ name, ok, detail }); if (!ok) fail++; };
const mk = (pos, assist) => { const rig = buildCharacter(), sim = mkSim__(rig, W.makeWorld(), clips); sim.opt.posture = POST; sim.reset({ pos, yaw: Math.PI }); sim.opt.posture = POST; sim.opt.footAssist = false; sim.opt.wallRest = false; sim.opt.grabAssist = assist; const ev = []; let pop = 0, gap = 0, t = 0;
  const run = (n, inp = {}, cmd = []) => { for (let k = 0; k < n; k++) { const p0 = sim.body.pos.clone(), on0 = sim.climb.on; sim.step({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd: k ? [] : cmd }); t++; if (on0 && sim.climb.on) pop = Math.max(pop, sim.body.pos.distanceTo(p0)); for (const e of sim.climb.events) if (e.type !== 'try' && (e.limb === 'hand' || e.type === 'assist')) ev.push({ t: +(t / 120).toFixed(2), i: e.i, type: e.type, why: e.why || '' });
    for (const h of sim.climb.hands) if (h.st === 'hold') { rig.root.updateMatrixWorld(true); const w = rig.bones[`hand.${h.s}`].getWorldPosition(new THREE.Vector3()); gap = Math.max(gap, w.distanceTo(h.goal) - 0.10); } } };
  return { rig, sim, run, ev, st: () => ({ pop: +(pop * 100).toFixed(1), gap: +(Math.max(0, gap) * 100).toFixed(1) }) }; };
const seq = T => T.ev.map(e => `${e.type}${e.i !== undefined ? (e.i ? 'R' : 'L') : ''}${e.why ? '(' + e.why + ')' : ''}`).join(' → ');
// ① 땅에서 오른손을 턱 A의 오른쪽 끝으로(몸의 오른쪽. 서 있는 자리를 왼쪽으로 옮겨 가며 거리를 바꾼다)
{ const rows = []; for (const x of [-1.00, -1.06, -1.10, -1.14, -1.20, -1.30]) { const r = { 서는_자리: x }; for (const as of [false, true]) { const T = mk([x, 0, -2.58], as); T.run(30); r[(as ? '켬' : '끔') + '_미리보기'] = (CLM.probeHand(T.sim, 1, new THREE.Vector3(-0.65, 1.92, -2.84)).ok ? '닿음' : '못 닿음'); T.run(260, {}, [hand(1, [-0.65, 1.92, -2.84])]); r[as ? '켬' : '끔'] = seq(T) || '없음'; if (as) Object.assign(r, T.st(), { 끝: T.sim.climb.hands.map(h => h.st).join('/') }); } rows.push(r); }
  out.cases['① 땅에서 조금 모자란 손'] = rows; for (const r of rows) console.log('  ', JSON.stringify(r));
  const sh = r => +((/닿지 않음\((\d+)(mm|cm)/.exec(r.끔) || [])[1] || 0) / ((/mm/.test(r.끔)) ? 10 : 1);
  check('① 땅: 보정 끔에서 "닿지 않음 N cm" 거부였던 거리 가운데 8cm 이하는 켬에서 잡고, 9cm 넘게 모자라면 켬에서도 거부한다', rows.every(r => !/닿지 않음/.test(r.끔) || (sh(r) <= 8 ? /grab/.test(r.켬) : /reject/.test(r.켬) && !/grab/.test(r.켬)) || (sh(r) > 8 && sh(r) <= 9)), rows.map(r => `${r.서는_자리}: 끔 ${sh(r) || '잡음'}cm → 켬 ${/grab/.test(r.켬) ? '잡음' : '거부'}`).join(' · '));
  check('① 땅: 미리보기(probeHand)와 실제 결과가 같다(보정 끔·켬 모두. 0.11.4는 미리보기가 보정을 몰랐다)', rows.every(r => ['끔', '켬'].every(a => (r[a + '_미리보기'] === '닿음') === /grab/.test(r[a]))), rows.map(r => `${r.서는_자리}: 끔 ${r['끔_미리보기']}/${/grab/.test(r.끔) ? '잡음' : '못 잡음'} 켬 ${r['켬_미리보기']}/${/grab/.test(r.켬) ? '잡음' : '못 잡음'}`).join(' · '));
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
// ④ 한 손 매달림에서 벽 점프(사용자: "점프를 하면 보정을 해 줘야 되는데 반응도 없다"): 두 손으로 턱 B를 잡고 두 발을 벽면(0.8m)에 댄 뒤 왼손을 놓고 Space 0.3초. 몸이 오른 높이(끔 / 켬), 두 손 점프는 켬·끔 같아야 한다
{ const foot = (i, p) => ({ type: 'foot', i, p }), rel = (l, i) => ({ type: 'release', limb: l, i }), rows = [];
  for (const n of [1, 2]) for (const as of [false, true]) { const T = mk([0.7, 0, -2.65], as); T.run(30); T.run(1, { jump: true }, [hand(0, [0.5, 2.32, -2.86]), hand(1, [0.9, 2.32, -2.86])]); T.run(59, { jump: true }); T.run(200);
    T.run(240, {}, [foot(0, [0.45, 0.8, -3.0])]); T.run(240, {}, [foot(1, [0.95, 0.8, -3.0])]); if (n === 1) T.run(120, {}, [rel('hand', 0)]); T.run(120);
    const pre = T.sim.climb.hands.map(h => h.st).join('/') + ' ' + T.sim.climb.feet.map(f => f.st).join('/'), y0 = T.sim.body.pos.y; let ym = y0; for (let k = 0; k < 150; k++) { T.run(1, { jump: k < 36 }); ym = Math.max(ym, T.sim.body.pos.y); }
    rows.push({ 손: n, 보정: as ? '켬' : '끔', 뛰기_전: pre, 오른_높이_cm: +((ym - y0) * 100).toFixed(1) }); }
  out.cases['④ 벽 점프'] = rows; for (const r of rows) console.log('  ', JSON.stringify(r)); const g = (n, a) => rows.find(r => r.손 === n && r.보정 === a);
  check('④ 앞 조건: 뛰기 전 한 손 경우는 오른손만, 두 손 경우는 두 손이 잡혀 있고 두 발이 벽면을 디뎠다', g(1, '켬').뛰기_전 === 'free/hold plant/plant' && g(2, '켬').뛰기_전 === 'hold/hold plant/plant', rows.map(r => r.뛰기_전).join(' · '));
  check(POST === 'fb' ? '④ 한 손 + 두 발 벽면 점프(fb, 화면 기본): 보정 켬이면 25cm 넘게 오른다(0.11.4: 7cm)' : '④ 한 손 + 두 발 벽면 점프(옛 규칙 — 25cm 기준은 fb의 측정에 맞춘 것이라 여기서는 끔보다 5cm 넘게 높은지만 본다)', POST === 'fb' ? g(1, '켬').오른_높이_cm > 25 : g(1, '켬').오른_높이_cm > g(1, '끔').오른_높이_cm + 5, `끔 ${g(1, '끔').오른_높이_cm}cm → 켬 ${g(1, '켬').오른_높이_cm}cm`);
  check('④ 두 손 점프는 보정 켬·끔이 같다(한 손 점프만 돕는다)', Math.abs(g(2, '켬').오른_높이_cm - g(2, '끔').오른_높이_cm) < 0.5, `끔 ${g(2, '끔').오른_높이_cm}cm · 켬 ${g(2, '켬').오른_높이_cm}cm`); }
console.log(`\n통과 ${out.checks.filter(c => c.ok).length} · 실패 ${fail}`);
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ 실행_출처: __P, ...out }, null, 1));
process.exitCode = fail ? 1 : 0;
