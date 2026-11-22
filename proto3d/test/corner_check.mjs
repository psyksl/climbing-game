// 다른 벽으로 옮겨 가기 시험(p3d-0.10.4, GPT의 0.10.3 검토: 같은 벽의 앞·끝 잡기, 바깥 모서리에서 벽 A → B, 반대로, 되돌아오기, 손발 지지 조합, 취소·놓기·다시 잡기).
// 지형: src/world.js makeFixtureWorld()(기본 지형·기존 장면과 따로). 입력은 화면과 같은 명령 경로(sim.step에 손·발·몸 명령)이며 스크립트 입력이다(사람 손 아님).
// 브라우저의 실제 마우스·키 입력은 test/corner_browser.js가 따로 본다. 기준은 개발 쪽 진단선이며 사람이 본 품질이 아니다.
// 사용: node test/corner_check.mjs [JSON]
import { prov, provLine } from './provenance.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const __P = prov(); console.log(provLine(__P));
const HERE = path.dirname(fileURLToPath(import.meta.url)), SRC = process.env.SRC ? path.resolve(process.env.SRC) : path.resolve(HERE, '../src'), imp = f => import(pathToFileURL(path.join(SRC, f)).href);
const THREE = await import('three');
const { buildCharacter } = await imp('rig.js'), { makeFixtureWorld } = await imp('world.js'), { makeSim } = await imp('sim.js'), { _dbg } = await imp('climb.js');
const out = { checks: [], 단계: {} }; let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`); out.checks.push({ name, ok, detail }); if (!ok) fail++; };
const V = (...a) => new THREE.Vector3(...a), deg = 180 / Math.PI, yawD = s => +(((s.body.yaw * deg) % 360 + 360) % 360).toFixed(1);
const hand = (i, p) => ({ type: 'hand', i, p }), foot = (i, p) => ({ type: 'foot', i, p });

// ── 1. 몸 방향의 근거(boxFacing): 상자마다 ──
{ const w = makeFixtureWorld(), B = n => w.boxes.find(b => b.name.startsWith(n)), f = (n, fb, from) => _dbg.boxFacing(w, B(n), V(...fb), from ? V(...from) : null).toArray().map(x => Math.round(x * 100) / 100).join(',');
  const r = { A1: f('A1', [0, 0, 1]), A2_앞면: f('A2', [0, 0, 1]), A2_끝옆면: f('A2', [1, 0, 0]), B1: f('B1', [1, 0, 0]), A3_걸친턱: f('A3', [0, 0, 1]), A4_방향지정: f('A4', [1, 0, 0]),
    C_앞에서: f('C', [0, 0, 1], [2.6, 1, -0.4]), C_뒤에서: f('C', [0, 0, -1], [2.6, 1, -1.5]), C_끝옆면_앞에서: f('C', [1, 0, 0], [2.6, 1, -0.4]), C_끝옆면_끝에서: f('C', [1, 0, 0], [3.55, 1, -0.97]), D_앞에서: f('D', [0, 0, 1], [5, 1, -0.5]), D_뒤에서: f('D', [0, 0, -1], [5, 1, -1.5]) };
  out.단계['몸 방향의 근거'] = r; console.log(JSON.stringify(r));
  check('같은 벽의 턱(A1·A2): 앞면을 잡든 끝 옆면을 잡든 몸이 볼 쪽은 벽 A(+z)', r.A1 === '0,0,1' && r.A2_앞면 === '0,0,1' && r.A2_끝옆면 === '0,0,1', `A1 ${r.A1} · A2 앞 ${r.A2_앞면} · A2 끝 ${r.A2_끝옆면}`);
  check('다른 벽의 턱(B1): 벽 B(+x)', r.B1 === '1,0,0', r.B1);
  check('지형 자료에 방향을 적은 걸친 턱(A4)은 그 방향(+z), 적지 않은 걸친 턱(A3)은 자료로 적는다', r.A4_방향지정 === '0,0,1', `A4 ${r.A4_방향지정} · A3(자료) ${r.A3_걸친턱}`);
  check('붙은 벽이 없는 혼자 선 긴 턱(C)·양면 벽(D): 몸이 있는 쪽 면(앞에서 +z, 뒤에서 −z, 끝 쪽에서 +x) — 잡은 면의 방향이 아니다(앞에 서서 끝 옆면을 잡아도 +z)', r.C_앞에서 === '0,0,1' && r.C_뒤에서 === '0,0,-1' && r.C_끝옆면_앞에서 === '0,0,1' && r.C_끝옆면_끝에서 === '1,0,0' && r.D_앞에서 === '0,0,1' && r.D_뒤에서 === '0,0,-1', JSON.stringify(r)); }

// ── 장면 실행기: 걸음마다 몸 방향 빠르기·팔 뼈 빠르기·놓침·떨어짐·몸통이 벽에 든 깊이를 잰다 ──
function scene(pos, yaw, plan, title) {
  const rig = buildCharacter(), world = makeFixtureWorld(), sim = makeSim(rig, world, null); sim.reset({ pos, yaw }); sim.opt.wallRest = false; sim.opt.footAssist = false;
  const S = { title, 단계: [], 사건: [], 몸방향_최대_도초: 0, 팔뼈_최대_도초: 0, 놓침: 0, 떨어짐: 0, 몸통_벽_최대_cm: 0 }, prevQ = {}; let k = 0, py = sim.body.yaw;
  const inside = (p, r) => { let m = 0; for (const b of world.boxes) { if (b.kind === 'floor') continue; const d = Math.min(p.x - b.min.x, b.max.x - p.x, p.y - b.min.y, b.max.y - p.y, p.z - b.min.z, b.max.z - p.z) + r; if (d > m && p.x > b.min.x - r && p.x < b.max.x + r && p.y > b.min.y - r && p.y < b.max.y + r && p.z > b.min.z - r && p.z < b.max.z + r) m = Math.min(d, r * 2); } return m; };
  const step = (inp, cmd) => { sim.step({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd }); k++; rig.root.updateMatrixWorld(true);
    let dy = sim.body.yaw - py; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); S.몸방향_최대_도초 = Math.max(S.몸방향_최대_도초, Math.abs(dy) * deg * 120); py = sim.body.yaw;
    for (const n of ['upperArm.L', 'foreArm.L', 'upperArm.R', 'foreArm.R']) { const q = rig.bones[n].getWorldQuaternion(new THREE.Quaternion()); if (prevQ[n]) S.팔뼈_최대_도초 = Math.max(S.팔뼈_최대_도초, prevQ[n].angleTo(q) * deg * 120); prevQ[n] = q; }
    if (sim.climb.on) for (const [n, r] of [['chest', 0.10], ['hips', 0.09], ['head', 0.09]]) S.몸통_벽_최대_cm = Math.max(S.몸통_벽_최대_cm, inside(rig.bones[n].getWorldPosition(V()), r) * 100);
    for (const e of sim.climb.events) { if (e.type === 'try') continue; if (e.type === 'slip') S.놓침++; if (e.type === 'exit' && /떨어짐/.test(e.why || '')) S.떨어짐++; S.사건.push(`${(k / 120).toFixed(2)} ${e.type}${e.limb ? ' ' + e.limb + e.i : ''}${e.why ? ' ' + e.why : ''}`); } };
  const st = () => ({ 손: sim.climb.hands.map(h => h.st + (h.edge && h.st === 'hold' ? ':' + h.edge.box.name.split(' ')[0] + (h.n.x > 0.5 ? '(+x면)' : h.n.z > 0.5 ? '(앞면)' : h.n.z < -0.5 ? '(뒷면)' : '(-x면)') : '')).join(' / '), 발: sim.climb.feet.map(f => f.st + (f.box && f.st === 'plant' ? ':' + f.box.name : '')).join(' / '), 몸방향_도: yawD(sim), 몸: sim.body.pos.toArray().map(v => +v.toFixed(2)) });
  for (let i = 0; i < 30; i++) step({}, []);
  for (const [what, a, b, n] of plan) { const cmd = what === 'h' ? [hand(a, b)] : what === 'f' ? [foot(a, b)] : what === 'r' ? [{ type: 'release', limb: 'hand', i: a }] : what === 'c' ? [{ type: 'handCancel', i: a }] : what === 'hd' ? [{ ...hand(a, b), hold: true }] : [];
    const N = what === 'h' ? (n || 180) : what === 'f' ? (n || 260) : what === 'w' || what === 'd' || what === 'n' ? a : what === 'hd' ? (n || 30) : (n || 60), inp = what === 'w' ? { cy: 1 } : what === 'd' ? { cx: b } : what === 'hd' ? { reach: a ? [null, b] : [b, null] } : {};
    for (let i = 0; i < N; i++) step(inp, i ? [] : cmd); S.단계.push({ 입력: `${what}${a !== undefined && typeof a === 'number' && what !== 'n' && what !== 'w' ? ' ' + (what === 'd' ? '' : a ? '오른' : '왼') : ''} ${b ? JSON.stringify(b) : ''}`.trim(), 끝_초: +(k / 120).toFixed(2), ...st() }); }
  S.몸방향_최대_도초 = Math.round(S.몸방향_최대_도초); S.팔뼈_최대_도초 = Math.round(S.팔뼈_최대_도초); S.몸통_벽_최대_cm = +S.몸통_벽_최대_cm.toFixed(1);
  out.단계[title] = S; console.log(`\n■ ${title}`); for (const x of S.단계) console.log(`  ${String(x.끝_초).padStart(6)} ${x.입력.padEnd(30)} 손 ${x.손} · 발 ${x.발} · 몸방향 ${x.몸방향_도}° · 몸 ${x.몸.join(',')}`);
  console.log(`  몸방향 최대 ${S.몸방향_최대_도초}°/s · 팔 뼈 최대 ${S.팔뼈_최대_도초}°/s · 놓침 ${S.놓침} · 떨어짐 ${S.떨어짐} · 몸통이 지형에 든 최대 ${S.몸통_벽_최대_cm}cm`); return S; }
const at = (S, i) => S.단계[i];

// ── 2. 벽 A → B(바깥 모서리) → 다시 A ──
const AtoB = [['h', 0, [-0.55, 1.92, -2.84]], ['h', 1, [-0.15, 1.92, -2.84]], ['f', 1, [-0.6, 0.5, -2.93]], ['w', 60],
  ['h', 1, [0.01, 1.91, -2.92]], ['d', 90, 1], ['n', 30], ['h', 1, [0.17, 1.91, -3.12]], ['n', 60], ['h', 0, [0.01, 1.91, -2.92]], ['n', 60], ['d', 90, 1], ['f', 0, [0.07, 0.5, -3.15]], ['n', 30], ['d', 90, 1], ['h', 1, [0.17, 1.91, -3.27]], ['n', 60], ['h', 0, [0.17, 1.91, -3.05]], ['n', 120]];
const back = [['h', 0, [-0.22, 1.92, -2.84]], ['n', 60], ['d', 90, -1], ['h', 1, [0.01, 1.91, -2.92]], ['n', 60], ['d', 60, -1], ['f', 0, [-0.75, 0.5, -2.93]], ['n', 60], ['h', 0, [-0.6, 1.92, -2.84]], ['n', 60], ['h', 1, [-0.2, 1.92, -2.84]], ['n', 120]];
{ const S = scene([-0.45, 0, -2.58], Math.PI, [...AtoB, ...back], '벽 A → 벽 B → 다시 벽 A(바깥 모서리)');
  const iEnd = 4, iB = 7, iRelA = 9, iBoth = 17, iBack = 17 + back.length;
  check('같은 벽의 턱 끝(A2 옆면)을 잡아도 몸은 돌지 않는다(±2°)', /A2.*\(\+x면\)/.test(at(S, iEnd).손) && Math.abs(at(S, iEnd).몸방향_도 - 180) <= 2, `${at(S, iEnd).손} · ${at(S, iEnd).몸방향_도}°`);
  check('다른 벽의 턱(B1)을 잡으면 두 벽 사이(225° ±10)로 돈다', /B1/.test(at(S, iB).손) && Math.abs(at(S, iB).몸방향_도 - 225) <= 10, `${at(S, iB).손} · ${at(S, iB).몸방향_도}°`);
  check('모서리에서 벽 A의 손을 옮기는 동안 벽 B의 손을 놓치지 않는다(몸이 아직 벽 A 앞이면 끝까지 돌지 않는다)', /hold:B1/.test(at(S, iRelA).손) && at(S, iRelA).몸방향_도 < 262, `${at(S, iRelA).손} · ${at(S, iRelA).몸방향_도}°`);
  check('두 손 모두 벽 B(B1)를 잡고 벽 B를 본다(270° ±5)', /^hold:B1.*hold:B1/.test(at(S, iBoth).손) && Math.abs(at(S, iBoth).몸방향_도 - 270) <= 5, `${at(S, iBoth).손} · ${at(S, iBoth).몸방향_도}°`);
  check('되돌아와 두 손 모두 벽 A를 잡고 벽 A를 본다(180° ±3)', /^hold:A1.*hold:A2/.test(at(S, iBack).손) && Math.abs(at(S, iBack).몸방향_도 - 180) <= 3, `${at(S, iBack).손} · ${at(S, iBack).몸방향_도}°`);
  check('A → B → A 동안 놓침·떨어짐이 없고 몸통이 지형에 2cm 넘게 들지 않는다', S.놓침 === 0 && S.떨어짐 === 0 && S.몸통_벽_최대_cm <= 2, `놓침 ${S.놓침} · 떨어짐 ${S.떨어짐} · 몸통 ${S.몸통_벽_최대_cm}cm · 몸방향 최대 ${S.몸방향_최대_도초}°/s · 팔 뼈 최대 ${S.팔뼈_최대_도초}°/s`); }

// ── 3. 반대 방향: 벽 B 앞에서 시작(벽 B를 보고) → 벽 A로 ──
{ const S = scene([0.4, 0, -3.15], -Math.PI / 2, [['h', 1, [0.17, 1.91, -3.27]], ['h', 0, [0.17, 1.91, -3.05]], ['f', 0, [0.07, 0.5, -3.15]], ['w', 60], ['h', 0, [0.01, 1.91, -2.92]], ['n', 60], ['d', 90, -1], ['n', 30], ['h', 1, [0.01, 1.91, -2.95]], ['n', 60], ['h', 1, [-0.2, 1.92, -2.84]], ['n', 120]], '반대 방향: 벽 B에서 시작 → 벽 A');
  const L = S.단계[S.단계.length - 1];
  check('반대 방향: 벽 B를 보고 시작해 A2(벽 A)로 옮겨 가면 몸이 벽 A 쪽으로 돈다', /A2/.test(S.단계[4].손) && S.단계[4].몸방향_도 < 262 && S.단계[4].몸방향_도 > 190, `${S.단계[4].손} · ${S.단계[4].몸방향_도}° → 끝 ${L.손} · ${L.몸방향_도}°`);
  check('반대 방향: 놓침·떨어짐 없음', S.놓침 === 0 && S.떨어짐 === 0, `놓침 ${S.놓침} · 떨어짐 ${S.떨어짐} · 몸통 ${S.몸통_벽_최대_cm}cm`); }

// ── 4. 취소·바꾸기·놓기·다시 잡기(모서리에서) ──
const pre = AtoB.slice(0, 7); // 두 손 A(오른손 A2 옆면), 몸을 모서리 쪽으로 옮긴 데까지
{ // 손 조작 2: B1로 누르는 동안 뻗다가 취소 → 그 손만 놓인 채, 다른 손·발 그대로
  const S = scene([-0.45, 0, -2.58], Math.PI, [...pre, ['hd', 1, [0.17, 1.91, -3.12], 20], ['c', 1], ['n', 60]], '취소: 벽 B로 뻗다가 거둠(손 조작 2)');
  const a = S.단계[pre.length], c = S.단계[pre.length + 2];
  check('취소: 벽 B로 뻗던 손을 거두면 그 손만 놓이고 왼손·디딘 발은 그대로, 몸은 벽 A를 본다', /^hold:A1\(앞면\) \/ free$/.test(c.손) && /plant:A 발판/.test(c.발) && Math.abs(c.몸방향_도 - 180) <= 3 && !S.사건.some(e => /grab hand1/.test(e) && +e.split(' ')[0] > a.끝_초 - 0.2), `${c.손} · ${c.발} · ${c.몸방향_도}°`); }
{ // 손 조작 1: B1로 보낸 뒤 0.1초 만에 A2 앞면으로 바꿈 → A2를 잡는다(B1은 잡지 않는다)
  const S = scene([-0.45, 0, -2.58], Math.PI, [...pre, ['h', 1, [0.17, 1.91, -3.12], 12], ['h', 1, [-0.12, 1.92, -2.84]], ['n', 60]], '바꾸기: 벽 B로 보낸 손을 0.1초 만에 벽 A로');
  const L = S.단계[S.단계.length - 1];
  check('바꾸기: 보낸 지 0.1초 만에 다른 목표(A2 앞면)를 누르면 그곳을 잡고, 벽 B는 잡지 않는다', /^hold:A1\(앞면\) \/ hold:A2\(앞면\)$/.test(L.손) && S.단계[pre.length].손 === S.단계[pre.length - 1].손.replace(/hold:A2\(\+x면\)$/, 'reach') && Math.abs(L.몸방향_도 - 180) <= 3, `${L.손} · ${L.몸방향_도}° · ${S.사건.slice(-4).join(' | ')}`); }
{ // 놓기 → 다시 잡기: B1을 잡았다가 놓고 다시 B1
  const S = scene([-0.45, 0, -2.58], Math.PI, [...pre, ['h', 1, [0.17, 1.91, -3.12]], ['n', 30], ['r', 1, null, 60], ['h', 1, [0.17, 1.91, -3.12]], ['n', 60]], '놓기 → 다시 잡기: 벽 B');
  const g = S.단계[pre.length], r = S.단계[pre.length + 2], L = S.단계[S.단계.length - 1];
  check('놓기 → 다시 잡기: 벽 B를 놓으면 몸이 벽 A로 돌아오고(180° ±5), 다시 잡으면 다시 두 벽 사이로 돈다', /B1/.test(g.손) && /^hold:A1\(앞면\) \/ free$/.test(r.손) && Math.abs(r.몸방향_도 - 180) <= 5 && /B1/.test(L.손) && Math.abs(L.몸방향_도 - 225) <= 10, `잡음 ${g.몸방향_도}° → 놓음 ${r.손} ${r.몸방향_도}° → 다시 ${L.손} ${L.몸방향_도}°`);
  check('놓기 → 다시 잡기: 놓침·떨어짐 없음', S.놓침 === 0 && S.떨어짐 === 0, `놓침 ${S.놓침} · 떨어짐 ${S.떨어짐}`); }

// ── 5. 혼자 선 긴 턱(C)과 양면 벽(D): 앞뒤 양쪽에서, 끝 옆면 ──
{ const S0 = scene([2.6, 0, -0.45], Math.PI, [['h', 0, [2.4, 1.70, -0.90]], ['h', 1, [2.8, 1.70, -0.90]], ['n', 60], ['h', 1, [3.21, 1.69, -0.97]], ['n', 60]], 'C 혼자 선 긴 턱: 가운데에 서서 끝 옆면(자료)');
  out.단계['C 가운데에서 끝 옆면(자료 — 통과·실패로 세지 않는다)'] = { 사건: S0.사건 }; console.log(`  (자료) 가운데에 서서 끝 옆면: ${S0.사건.join(' | ')} — 끝 옆면도 윗면 모서리 잡기라 당기는 방향이 그 면의 바깥·아래에서 50° 넘게 벗어나면 미끄러진다(기존 규칙. 옆으로 당기는 새 규칙은 넣지 않았다)`);
  const S1 = scene([3.55, 0, -0.97], -Math.PI / 2, [['h', 1, [3.21, 1.69, -1.0]], ['n', 60], ['h', 0, [3.21, 1.69, -0.92]], ['n', 60]], 'C 혼자 선 긴 턱: 끝 쪽에 서서 끝 옆면');
  const S2 = scene([2.6, 0, -1.45], 0, [['h', 1, [2.4, 1.70, -1.04]], ['h', 0, [2.8, 1.70, -1.04]], ['n', 60]], 'C 혼자 선 긴 턱: 뒤에서');
  const S3 = scene([5.0, 0, -0.55], Math.PI, [['h', 0, [4.8, 1.88, -0.95]], ['h', 1, [5.2, 1.88, -0.95]], ['n', 60]], 'D 양면 벽: 앞에서');
  const S4 = scene([5.0, 0, -1.45], 0, [['h', 1, [4.8, 1.88, -1.05]], ['h', 0, [5.2, 1.88, -1.05]], ['n', 60]], 'D 양면 벽: 뒤에서');
  const e1 = S0.단계[1], e2 = S1.단계[1], e3 = S1.단계[3], b2 = S2.단계[1], d1 = S3.단계[1], d2 = S4.단계[1];
  check('혼자 선 긴 턱·양면 벽: 앞에서 잡으면 앞(180°), 뒤에서 잡으면 뒤(0°)를 본다(±3°)', /hold:C.*hold:C/.test(e1.손) && Math.abs(e1.몸방향_도 - 180) <= 3 && /hold:C.*hold:C/.test(b2.손) && (b2.몸방향_도 <= 3 || b2.몸방향_도 >= 357) && /hold:D.*hold:D/.test(d1.손) && Math.abs(d1.몸방향_도 - 180) <= 3 && /hold:D.*hold:D/.test(d2.손) && (d2.몸방향_도 <= 3 || d2.몸방향_도 >= 357), `C 앞 ${e1.손} ${e1.몸방향_도}° · C 뒤 ${b2.손} ${b2.몸방향_도}° · D 앞 ${d1.몸방향_도}° · D 뒤 ${d2.몸방향_도}°`);
  check('혼자 선 긴 턱(붙은 벽 없음)의 끝 쪽에 서서 작은 끝 옆면을 잡으면 몸은 끝 쪽(270°)을 그대로 본다 — 긴 면 쪽으로 억지로 돌지 않는다(±3°)', /\(\+x면\)/.test(e2.손) && Math.abs(e2.몸방향_도 - 270) <= 3 && Math.abs(e3.몸방향_도 - 270) <= 3, `한 손 ${e2.손} ${e2.몸방향_도}° · 두 손 ${e3.손} ${e3.몸방향_도}°`); }

console.log(`\n통과 ${out.checks.filter(c => c.ok).length} · 실패 ${fail}`);
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ 실행_출처: __P, ...out }, null, 1));
process.exitCode = fail ? 1 : 0;
