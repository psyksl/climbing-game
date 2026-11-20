// 벽 접촉 점검(W2 첫 판). 스크립트 입력이며 사람 손이 아니다. 성공만 모으지 않고 거부·놓침·떨어짐을 함께 본다.
// 손: 시도 → 잡음/거부 → 유지 → 놓기. 발: 누르는 힘과 마찰로만 버틴다(벽에 붙지 않는다). 놓는 걸음에 속도가 이어지는지, 접촉 오차·관통·거부 까닭을 적는다.
// 사용: node test/wall_check.mjs [결과 JSON]   캡처 동작으로: MODE=clip (assets_local/clips.json이 있을 때)
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import * as THREE from 'three';
const HERE = path.dirname(fileURLToPath(import.meta.url)), SRC = path.resolve(HERE, '../src'), imp = f => import(pathToFileURL(path.join(SRC, f)).href);
const { buildCharacter } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js'), { limbState, CL, probeHand } = await imp('climb.js'), { PHY } = await imp('controller.js');
const CLP = path.resolve(HERE, '../assets_local/clips.json'), useClip = process.env.MODE === 'clip';
if (useClip && !fs.existsSync(CLP)) { console.log('clips.json 없음 → 건너뜀'); process.exit(0); }
const clips = useClip ? JSON.parse(fs.readFileSync(CLP, 'utf8')) : null, rig = buildCharacter(), DT = PHY.DT, G = PHY.G;
globalThis.KDBG = !!process.env.KDBG; let sim, rec, fails = 0; const jk = { prev: null, sim: null, d: [], max: 0, what: '', n: 0 };
const out = { note: '스크립트 입력(사람 손 아님). 모션 = ' + (useClip ? '캡처' : '자작'), checks: [], cases: {} };
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`); out.checks.push({ name, ok, detail }); if (!ok) fails++; };
const start = (pos, yaw = Math.PI, extra = []) => { const w = makeWorld(); for (const [name, min, max] of extra) w.boxes.push({ name, min: new THREE.Vector3(...min), max: new THREE.Vector3(...max), kind: 'block' }); sim = makeSim(rig, w, clips); sim.reset({ pos, yaw }); rec = []; run(30); };
function run(n, inp = {}, cmd = null) {
  for (let i = 0; i < n; i++) {
    const v0 = sim.body.vel.clone(), on0 = sim.climb.on;
    sim.step({ mx: 0, mz: 0, ...inp, cmd: i === 0 && cmd ? cmd : [] });
    rec.push({ k: sim.tick, pos: sim.body.pos.clone(), vel: sim.body.vel.clone(), dv: sim.body.vel.clone().sub(v0), on: sim.climb.on, on0, ev: sim.climb.events.slice(), bev: sim.body.events.map(e => e.type) });
    if (process.env.TRACE) for (const e of sim.climb.events) if (e.type !== 'try') console.log(`      ${e.t.toFixed(2)}초 ${e.type} ${e.name} ${e.box || ''} ${e.why}`);
    if (!rig.list.every(b => Number.isFinite(b.quaternion.x) && Number.isFinite(b.position.y))) throw new Error('자세 값이 깨짐 @' + sim.tick);
    // 한 걸음 회전 튐(지상의 motion_check와 같은 재는 법): 뼈의 제자리 회전이 한 걸음에 바뀐 양이 바로 앞 걸음과 얼마나 다른가. 벽에 붙어 있거나 막 나온 걸음만 센다(지상 구간은 motion_check가 본다)
    { const cur = rig.list.map(b => b.quaternion.clone()); if (jk.prev && jk.sim === sim) rig.list.forEach((b, k) => { const d = jk.prev[k].angleTo(cur[k]) * 180 / Math.PI, j = jk.d[k] === undefined ? 0 : Math.abs(d - jk.d[k]); jk.d[k] = d; if ((sim.climb.on || on0) && j > jk.max) { jk.max = j; jk.what = `${b.name} @${sim.tick} ${sim.climb.events.filter(e => e.type !== 'try').map(e => e.type + (e.name ? ' ' + e.name : '')).join(',')}`; } if ((sim.climb.on || on0) && j > 12) { jk.n++; if (process.env.JK) console.log(`      튐 ${j.toFixed(0)}° ${b.name} @${sim.tick} #${out.checks.length} [${sim.climb.hands.map(h => h.st[0]).join("")}${sim.climb.feet.map(f => f.st[0]).join("")}${sim.climb.push ? "P" : ""}] ${sim.climb.on ? '벽' : '나옴'} ${sim.climb.events.filter(e => e.type !== 'try').map(e => e.type + (e.name ? ' ' + e.name : '') + (e.why ? '(' + e.why + ')' : '')).join(',')}`); } }); else jk.d = []; jk.prev = cur; jk.sim = sim; }
  }
}
const hand = (i, p) => ({ type: 'hand', i, p }), foot = (i, p) => ({ type: 'foot', i, p }), rel = (limb, i) => ({ type: 'release', limb, i });
const evs = (from = 0) => rec.slice(from).flatMap(r => r.ev), last = type => evs().filter(e => e.type === type).pop();
const L = () => limbState(sim.climb), cm = v => (v * 100).toFixed(1) + 'cm', mm = v => (v * 1000).toFixed(2) + 'mm';
const speed = () => sim.body.vel.length(), hold = i => L().hands[i].st === 'hold';
const save = name => { const st = sim.climb.stats; out.cases[name] = { 손바닥_오차_mm: +(st.palmErr * 1000).toFixed(3), 발_오차_mm: +(st.footErr * 1000).toFixed(3), 지형_관통_걸음: st.pen, 잡는_순간_지상_자세의_관통: st.penEnter ? `${st.penEnter}걸음(${st.penEnterWhat})` : 0, 팔이_몸을_지나간_걸음: st.selfPen, 관통_부위: st.penWhat, 벽에_부딪힌_속도: +st.wallHit.toFixed(2), 기록: sim.climb.log.filter(e => e.type !== 'try').map(e => `${e.t.toFixed(2)}초 ${e.type} ${e.name}${e.box ? ' ' + e.box : ''}${e.why ? ' · ' + e.why : ''}`) }; return st; };
const A = { L: [-1.1, 1.92, -2.84], R: [-0.7, 1.92, -2.84] }, B = { L: [0.5, 2.32, -2.86], R: [0.9, 2.32, -2.86] };
// 뛰어 잡기(p3d-0.6.0: 점프는 누르면 바로 뜬다). 점프를 누르는 걸음에서 delay걸음 뒤에 두 손을 보낸다. 점프는 60걸음 누르고 있는다(가장 높이)
const jumpGrab = (delay = 0, wait = 600) => { if (delay === 0) { run(1, { jump: true }, [hand(0, B.L), hand(1, B.R)]); run(59, { jump: true }); } else { run(Math.min(delay, 60), { jump: true }); if (delay > 60) run(delay - 60); run(1, { jump: delay < 60 }, [hand(0, B.L), hand(1, B.R)]); if (delay < 59) run(59 - delay, { jump: true }); } run(wait); };

// ── 1. 땅에 서서 턱 A 잡기 ──
start([-0.9, 0, -2.58]);
run(150, {}, [hand(0, A.L)]);
{ const e = evs(); check('서서 왼손으로 턱 A: 시도 → 잡음 순서로 기록되고 벽 문맥이 된다', e.some(x => x.type === 'try') && e.some(x => x.type === 'grab' && x.box === '턱 A') && sim.climb.on, e.filter(x => x.type !== 'try').map(x => x.type).join(' → '));
  const f = L().feet; check('잡은 뒤에도 두 발이 바닥을 디디고 몸무게를 받친다(손이 몸을 끌어올리지 않는다)', f.every(x => x.st === 'plant' && x.box === '바닥') && f[0].loadS + f[1].loadS > 0.7 && speed() < 0.15, `발 ${f.map(x => x.loadS.toFixed(2)).join(' + ')}배 · 왼손 ${L().hands[0].loadS.toFixed(2)}배 · 속도 ${speed().toFixed(2)}`); }
// 거부: 닿지 않는 턱, 턱이 아닌 곳
run(200, {}, [hand(1, [-0.4, 2.82, -2.86])]);
{ const r = last('reject'); check('닿지 않는 턱 C: 잠깐 뻗어 보다가 거부하고 까닭(모자란 거리)을 남긴다', !!r && /닿지 않음\(\d+cm 모자람\)/.test(r.why) && L().hands[1].st === 'free' && hold(0), r ? r.why : '거부 없음'); }
run(60, {}, [hand(1, [-0.9, 1.4, -3.0])]);
{ const r = last('reject'); check('턱이 아닌 벽면: 바로 거부', !!r && r.why === '잡을 수 있는 턱이 아님' && L().hands[1].st === 'free', r ? r.why : ''); }
run(150, {}, [hand(1, A.R)]);
check('오른손도 턱 A를 잡는다', hold(0) && hold(1));
{ const k0 = rec.length; run(360, { cy: 1 }); run(120);
  const lifts = evs(k0).filter(x => x.type === 'lift'); check('몸 위로(두 팔로 당김): 다리가 닿는 범위를 벗어나면 발이 저절로 떨어지고 까닭이 남는다', lifts.length >= 2 && lifts.every(x => /범위/.test(x.why)) && L().feet.every(x => x.st === 'free') && sim.body.pos.y > 0.2, `발 떨어짐 ${lifts.length}번 · 몸 높이 +${cm(sim.body.pos.y)} · 손 ${L().hands.map(x => x.loadS.toFixed(2)).join(' + ')}배`); }
{ const st = save('1 서서 턱 A 잡고 당겨 오르기'); check('잡은 손바닥이 턱에서 2mm 안, 지형 관통 0, 팔이 몸을 지나가지 않음', st.palmErr < 0.002 && st.pen === 0 && st.selfPen === 0, `손바닥 ${mm(st.palmErr)} · 관통 ${st.pen}걸음${st.pen ? '(' + st.penWhat + ')' : ''} · 몸 지나감 ${st.selfPen}걸음`); }
// 두 손을 놓으면: 떨어져 땅에 선다
{ const k0 = rec.length, v0 = sim.body.vel.clone(); run(1, {}, [rel('hand', 0), rel('hand', 1)]); const dv = rec[k0].dv.length(); run(240);
  check('두 손 놓기: 놓는 걸음의 속도 변화는 중력 한 걸음 몫뿐이다', dv < G * DT * 1.5 + 0.02 && !sim.climb.on, `속도 변화 ${dv.toFixed(3)}m/s (중력 한 걸음 ${(G * DT).toFixed(3)})`);
  check('떨어져 땅에 내려선다(지상 문맥으로 돌아옴)', sim.body.onGround && Math.abs(sim.body.pos.y) < 0.01 && !sim.climb.on && rec.slice(k0).some(r => r.bev.includes('land')), `높이 ${cm(sim.body.pos.y)}`); }

// ── 2. 손이 가는 길이 막힌 경우, 몸이 등진 경우 ──
start([-0.9, 0, -2.58], Math.PI, [['가림판', [-1.4, 1.50, -2.95], [-0.8, 1.56, -2.50]]]);
run(120, {}, [hand(0, A.L)]);
{ const r = last('reject'); check('손과 턱 사이에 판이 있으면 거부(선이 통하는지가 아니라 손이 가는 길을 본다)', !!r && /막힘|지나감/.test(r.why) && !sim.climb.on, r ? r.why : '거부 없음'); }
{ const rows = [];
  for (const yaw of [Math.PI, Math.PI * 0.75, Math.PI / 2, Math.PI / 4, 0, -Math.PI / 4, -Math.PI / 2, -Math.PI * 0.75]) for (const i of [0, 1]) {
    start([-0.9, 0, -2.70], yaw); run(150, {}, [hand(i, [-0.9, 1.92, -2.84])]); const g = last('grab'), r = last('reject'); run(60);
    rows.push({ yaw: Math.round(yaw * 180 / Math.PI), 손: i ? '오른손' : '왼손', 결과: g ? '잡음' : '거부', 까닭: r ? r.why : '', pen: sim.climb.stats.pen, self: sim.climb.stats.selfPen, palm: sim.climb.stats.palmErr, what: sim.climb.stats.penWhat });
  }
  out.cases['2 몸의 방향을 바꿔 가며 같은 턱 잡기'] = rows;
  const ok = rows.filter(r => r.결과 === '잡음'), bad = ok.filter(r => r.pen || r.self || r.palm > 0.002);
  check('몸 방향 8가지 × 두 손: 잡은 경우에는 팔이 벽·몸을 지나가지 않고, 등진 방향은 거부된다', bad.length === 0 && rows.some(r => r.결과 === '거부') && ok.length > 0, `잡음 ${ok.length} · 거부 ${rows.length - ok.length}(${[...new Set(rows.filter(r => r.까닭).map(r => r.까닭.replace(/\(\d+cm 모자람\)/, '')))].join(', ')}) · 잡았는데 관통 ${bad.length}${bad.length ? ' ' + JSON.stringify(bad) : ''}`); }

// ── 3. 뛰어서 턱 B → 두 손 매달림 → 한 손 놓기 → 다시 잡기 → 두 손 놓기 ──
start([0.7, 0, -2.65]);
jumpGrab(0, 600);
{ const h = L().hands, e = evs().find(x => x.type === 'enter'); check('뛰면서 두 손을 보내 턱 B를 잡는다(공중에서 잡음)', hold(0) && hold(1) && !!e && e.why === '공중에서 잡음', e ? `잡는 순간 속도 ${e.vel.map(v => v.toFixed(2)).join(', ')}` : '');
  check('두 손 매달림: 흔들림이 가라앉고, 발은 떠 있고, 두 손이 몸무게를 나눠 받는다', speed() < 0.05 && L().feet.every(f => f.st === 'free') && h[0].loadS + h[1].loadS > 0.9 && h[0].loadS + h[1].loadS < 1.3, `속도 ${speed().toFixed(3)} · 손 ${h.map(x => x.loadS.toFixed(2)).join(' + ')}배 · 발 높이 +${cm(sim.body.pos.y)}`); }
{ const k0 = rec.length; run(1, {}, [rel('hand', 1)]); const dv = rec[k0].dv.length(); run(480);
  check('한 손 놓기: 놓는 걸음에 속도가 튀지 않고, 남은 손으로 계속 매달린다(편 팔이 몸무게를 받는다)', dv < G * DT * 1.5 + 0.02 && hold(0) && sim.climb.on && Math.abs(L().hands[0].loadS - 1) < 0.15, `속도 변화 ${dv.toFixed(3)}m/s · 왼손 ${L().hands[0].loadS.toFixed(2)}배 · 몸통 기울기 ${(sim.climb.lean.z * 180 / Math.PI).toFixed(0)}°`);
  const xs = rec.slice(k0).map(r => r.pos.x); out.cases['3 한 손 매달림의 흔들림'] = { 좌우_폭_cm: +((Math.max(...xs) - Math.min(...xs)) * 100).toFixed(1), 끝_속도: +speed().toFixed(3) }; }
run(200, {}, [hand(1, B.R)]);
check('놓았던 손으로 다시 잡는다', hold(0) && hold(1));
// 흔들리는 중에 놓기: 한 손을 놓아 몸이 옆으로 움직이는 순간 남은 손도 놓는다 → 수평 속도가 이어져야 한다
{ run(1, {}, [rel('hand', 1)]); let best = 0; for (let i = 0; i < 200; i++) { run(1); const h = Math.hypot(sim.body.vel.x, sim.body.vel.z); if (i > 20 && h > 0.25 && h < best - 0.005) break; best = Math.max(best, h); }
  const k0 = rec.length, vb = sim.body.vel.clone(); run(1, {}, [rel('hand', 0)]); const va = rec[k0].vel, dv = rec[k0].dv.length(); run(12); const vh = Math.hypot(sim.body.vel.x, sim.body.vel.z), vy = sim.body.vel.y;
  check('흔들리다 두 손을 놓기: 수평 속도가 그대로 이어지고(0.1초 뒤에도), 세로는 중력만큼만 변한다', dv < G * DT * 1.5 + 0.02 && Math.abs(vh - Math.hypot(vb.x, vb.z)) < 0.03 && Math.abs(vy - (va.y - G * 12 * DT)) < 0.05 && !sim.climb.on, `놓기 전 수평 ${Math.hypot(vb.x, vb.z).toFixed(2)} → 0.1초 뒤 ${vh.toFixed(2)}m/s · 세로 ${vy.toFixed(2)}(중력만이면 ${(va.y - G * 12 * DT).toFixed(2)})`);
  run(200); check('떨어져 땅에 선다', sim.body.onGround && rec.slice(k0).some(r => r.bev.includes('land')), `착지 속도 ${rec.slice(k0).flatMap(r => r.bev).includes('land') ? '기록됨' : '없음'}`); }
{ const st = save('3 뛰어 잡기 → 매달림 → 한 손 → 다시 잡기 → 놓기'); check('매달리는 동안 손바닥 오차 2mm 안, 지형 관통 0', st.palmErr < 0.002 && st.pen === 0 && st.selfPen === 0, `손바닥 ${mm(st.palmErr)} · 관통 ${st.pen}${st.pen ? '(' + st.penWhat + ')' : ''}${st.penEnter ? ` · 잡는 순간의 지상 자세 관통 ${st.penEnter}걸음(${st.penEnterWhat})` : ''} · 벽에 부딪힌 속도 ${st.wallHit.toFixed(2)}m/s`); }

// ── 4. 늦게 보낸 손은 못 잡는다(타이밍) ──
start([0.7, 0, -2.65]);
jumpGrab(70, 300);
{ const r = evs().filter(x => x.type === 'reject'); check('점프를 누르고 0.58초 뒤에 보낸 손: 닿지 않아 거부되고 그대로 땅에 내려선다(애니메이션이 대신 잡아 주지 않는다)', r.length === 2 && !sim.climb.on && sim.body.onGround, r.map(x => x.why).join(' / ')); }

// ── 5. 벽에 댄 발은 몸을 매달지 못한다 ──
// 발은 면을 누르는 쪽으로만 힘을 낸다(당기지 못한다). 벽면의 발이 몸무게를 받으려면 벽을 눌러야 하고, 그 미는 힘은 손이 받아 줘야 한다. 손을 놓으면 발은 몸을 벽에서 밀어낼 뿐이다.
function smearCase(name, feetY, lower) {
  start([0.7, 0, -2.65]);
  jumpGrab(0, 360);
  run(150, {}, [foot(0, [0.60, feetY, -3.0])]); if (lower !== null) run(150, {}, [foot(1, [0.80, feetY, -3.0])]); if (lower) run(lower, { cy: -1 }); run(300);
  const f = L().feet, h = L().hands, before = { 발: f.map(x => `${x.st}${x.kind && x.st === 'plant' ? '(' + (x.kind === 'top' ? '윗면' : '벽면') + ')' : ''} ${x.loadS.toFixed(2)}배`), 손_합: +(h[0].loadS + h[1].loadS).toFixed(2), 벽에서_엉덩이까지_cm: +((sim.body.pos.z + 3) * 100).toFixed(0), 속도: +speed().toFixed(3) };
  const k0 = rec.length, y0 = sim.body.pos.y; let pull = 0, up = 0, exitK = -1, landK = -1;
  run(1, {}, [rel('hand', 0), rel('hand', 1)]);
  for (let i = 0; i < 180; i++) { run(1); for (const x of sim.climb.feet) if (x.st === 'plant' && x.F && x.F.dot(x.n) < -1e-6) pull++; if (sim.climb.on && i > 6 && sim.body.vel.y > 0.02) up++; if (exitK < 0 && !sim.climb.on) exitK = i; if (landK < 0 && sim.body.onGround && !sim.climb.on) landK = i; }
  const tEnd = exitK / 120, frac = exitK > 0 ? (y0 - rec[k0 + exitK].pos.y) / (0.5 * G * (exitK * DT) ** 2) : 1;
  out.cases[name] = { 놓기_전: before, 놓은_뒤: { 발이_떨어지기까지_초: +tEnd.toFixed(2), 그동안_내려간_거리의_자유낙하_대비: +frac.toFixed(2), 발이_벽_쪽으로_당긴_걸음: pull, 몸이_올라간_걸음: up, 땅에_닿기까지_초: +(landK / 120).toFixed(2), 벽에서_밀려난_속도: +rec[k0 + 1 + Math.max(0, exitK)].vel.z.toFixed(2) } };
  return { before, f, h, pull, up, exitK, landK, frac };
}
{ const r = smearCase('5a 매달린 채 한 발을 벽면에', 0.85, null);
  check('매달린 채 한 발을 벽면에 댄 뒤 두 손을 놓으면: 발이 몸을 당기지 않고(누르는 쪽만), 몸이 다시 올라가지 않고, 0.6초 안에 발이 떨어지고, 1초 안에 땅에 닿는다', r.pull === 0 && r.up === 0 && r.exitK >= 0 && r.exitK < 72 && r.landK >= 0 && r.landK < 120, `놓기 전 ${r.before.발.join(' / ')} · 발이 떨어지기까지 ${(r.exitK / 120).toFixed(2)}초 · 그동안 내려간 거리 = 자유낙하의 ${(r.frac * 100).toFixed(0)}% · 땅까지 ${(r.landK / 120).toFixed(2)}초`); save('5a'); }
{ const r = smearCase('5b 엉덩이를 빼고 두 발을 벽면에(발이 몸무게 일부를 받는 자세)', 0.85, 0);
  check('두 발로 벽을 누르며 버티는 자세: 손이 있을 때는 발이 몸무게 일부를 받는다(누르는 힘 + 마찰)', r.f.every(x => x.st === 'plant') && r.f[0].loadS + r.f[1].loadS > 0.3, `발 ${r.before.발.join(' / ')} · 손 합 ${r.before.손_합}배 · 벽에서 엉덩이까지 ${r.before.벽에서_엉덩이까지_cm}cm`);
  check('그 자세에서 두 손을 놓으면: 발은 몸을 벽에서 밀어낼 뿐 매달지 못한다(당김 0, 다시 올라가지 않음, 0.6초 안에 발이 떨어지고 땅에 닿는다)', r.pull === 0 && r.up === 0 && r.exitK >= 0 && r.exitK < 72 && r.landK >= 0 && r.landK < 120, `발이 떨어지기까지 ${(r.exitK / 120).toFixed(2)}초 · 그동안 내려간 거리 = 자유낙하의 ${(r.frac * 100).toFixed(0)}% · 땅까지 ${(r.landK / 120).toFixed(2)}초`); save('5b'); }

// ── 6. 발판: 올라선 발은 몸을 받친다(정상 지지) ──
start([-1.07, 0, -2.64]);
run(150, {}, [hand(0, [-1.42, 1.92, -2.84])]); run(150, {}, [hand(1, [-1.10, 1.92, -2.84])]);
{ const x0 = sim.body.pos.x; run(110, { cx: -1 }); run(120); check('두 손으로 잡고 몸 왼쪽(A): 바닥을 디딘 발로 밀어 몸이 옆으로 옮겨 간다', sim.body.pos.x < x0 - 0.2 && hold(0) && hold(1), `몸 ${cm(x0 - sim.body.pos.x)} 왼쪽으로`); }
run(200, {}, [foot(0, [-1.45, 0.30, -2.72])]);
{ const f = L().feet[0], st = last('step'); check('왼발을 넓은 발판 윗면에 올린다', f.st === 'plant' && f.kind === 'top' && f.box === '넓은 발판', st ? `${st.name} ${st.why} ${st.box}` : L().feet[0].why); }
run(100, { cy: 1 }); run(240);
{ const f = L().feet, h = L().hands, onStep = f.filter(x => x.st === 'plant' && x.box === '넓은 발판'); out.cases['6 넓은 발판에 올라서기'] = { 발: f.map(x => `${x.st}${x.box ? '(' + x.box + ')' : ''} ${x.loadS.toFixed(2)}배`), 손: h.map(x => `${x.st} ${x.loadS.toFixed(2)}배`), 몸_자리: sim.body.pos.toArray().map(v => +v.toFixed(3)) };
  check('몸 위로(W): 발판을 디딘 발로 올라서면 발이 몸무게 대부분을 받는다(손은 거의 힘을 받지 않는다)', onStep.length > 0 && onStep.reduce((a, x) => a + x.loadS, 0) > 0.8 && h[0].loadS + h[1].loadS < 0.25 && sim.body.pos.y > 0.2, `발 ${f.map(x => x.loadS.toFixed(2)).join(' + ')}배 · 손 ${h.map(x => x.loadS.toFixed(2)).join(' + ')}배 · 몸 높이 +${cm(sim.body.pos.y)}`); }
{ const k0 = rec.length; run(1, {}, [rel('hand', 0), rel('hand', 1)]); run(360); const ys = rec.slice(k0).map(r => r.pos.y);
  check('두 손을 놓아도 발판 위에 서 있다(무게중심이 발판 위에 있는 정상 지지는 허용)', Math.min(...ys) > 0.2 && speed() < 0.05, `놓은 뒤 3초 동안 가장 낮은 높이 +${cm(Math.min(...ys))} · 끝 속도 ${speed().toFixed(3)} · ${sim.climb.on ? '벽 문맥(발로 섬)' : '지상 문맥(발판 위에 섬)'}`);
  const st = save('6 올라서기의 접촉 오차'); check('발판에 올라서는 동안 디딘 발의 오차 2mm 안, 지형 관통 0', st.footErr < 0.002 && st.pen === 0 && st.selfPen === 0, `디딘 발 ${mm(st.footErr)} · 관통 ${st.pen}${st.pen ? '(' + st.penWhat + ')' : ''}`); }
// 견줌: 좁은 발판(깊이 14cm)에서 같은 일을 하면 어떻게 되는지 적어 둔다(합격·불합격을 정하지 않는다)
start([-0.72, 0, -2.58]);
run(150, {}, [hand(0, [-0.95, 1.92, -2.84])]); run(150, {}, [hand(1, [-0.65, 1.92, -2.84])]);
run(200, {}, [foot(1, [-0.45, 0.5, -2.93])]); run(170, { cy: 1 }); run(240);
{ const f = L().feet, h = L().hands, before = { 발: f.map(x => `${x.st}${x.box ? '(' + x.box + ')' : ''} ${x.loadS.toFixed(2)}배`), 손: h.map(x => `${x.loadS.toFixed(2)}배`), 몸_높이_cm: +(sim.body.pos.y * 100).toFixed(1) }; const k0 = rec.length; run(1, {}, [rel('hand', 0), rel('hand', 1)]); run(360);
  out.cases['6b 좁은 발판(14cm)에서 두 손 놓기 — 기록만'] = { 놓기_전: before, 놓은_뒤_3초: { 높이_cm: +(sim.body.pos.y * 100).toFixed(1), 문맥: sim.climb.on ? '벽' : '지상', 기록: evs(k0).map(e => `${e.t.toFixed(2)}초 ${e.type} ${e.name} ${e.why}`) } };
  console.log('기록  좁은 발판에서 두 손 놓기:', JSON.stringify(out.cases['6b 좁은 발판(14cm)에서 두 손 놓기 — 기록만'])); }

// ── 7. 미리보기와 실제 결과가 같은 판정을 쓰는지 ──
{ let same = 0, n = 0; const diff = [];
  for (const [x, z] of [[-0.9, -2.58], [-0.9, -2.45], [-0.6, -2.62], [-1.3, -2.36], [0.5, -2.6]]) for (const p of [A.L, A.R, [-0.2, 2.82, -2.86], B.L, [-0.9, 1.4, -3.0], [-0.35, 0.5, -2.86]]) for (const i of [0, 1]) {
    start([x, 0, z]); const pv = probeHand(sim, i, new THREE.Vector3(...p)); run(150, {}, [hand(i, p)]); const got = !!last('grab'); n++; if (pv.ok === got) same++; else diff.push(`(${x},${z}) → ${p} ${i ? '오른손' : '왼손'}: 미리보기 ${pv.ok ? '닿음' : pv.why} / 실제 ${got ? '잡음' : last('reject').why}`);
  }
  out.cases['7 미리보기와 실제'] = { 경우: n, 같음: same, 다른_것: diff };
  check('서 있는 자세에서 미리보기(닿음/안 닿음)와 실제 결과가 같다(고정 입력 측정. 전체 상황의 정확도가 아니다)', same === n, `${same}/${n}${diff.length ? ' · ' + diff[0] : ''}`); }

// ── 8. 거부는 놓기가 아니다(GPT의 p3d-0.5.0 검토 3장: 잘못된 목표를 누르면 잡고 있던 손까지 풀렸다) ──
start([0.7, 0, -2.65]); jumpGrab(0, 480); run(1, {}, [rel('hand', 1)]); run(360);
{ const k0 = rec.length; run(60, {}, [hand(0, [0.5, 1.4, -3.0])]); const r = evs(k0).find(x => x.type === 'reject');
  check('잡고 있는 손으로 턱이 아닌 곳을 누름: 거부만 하고 그 손은 계속 잡고 있다(떨어지지 않는다)', !!r && r.why === '잡을 수 있는 턱이 아님' && hold(0) && sim.climb.on && !evs(k0).some(x => x.type === 'release' || x.type === 'exit'), `${r ? r.why : '거부 없음'} · 왼손 ${L().hands[0].st} · ${sim.climb.on ? '벽 문맥 유지' : '떨어짐'}`); }
{ const k0 = rec.length; run(60, {}, [hand(0, B.L)]); const r = evs(k0).find(x => x.type === 'reject');
  check('잡고 있는 그 자리를 다시 누름: 거부(놓았다 다시 잡지 않는다)', !!r && hold(0) && !evs(k0).some(x => x.type === 'release'), r ? r.why : '거부 없음'); }
{ const k0 = rec.length; run(60, {}, [hand(1, [0.9, 1.4, -3.0])]); const r = evs(k0).find(x => x.type === 'reject');
  check('빈손으로 턱이 아닌 곳을 누름: 거부, 다른 손은 그대로', !!r && L().hands[1].st === 'free' && hold(0) && sim.climb.on, r ? r.why : '거부 없음'); }
{ const k0 = rec.length; run(140, {}, [hand(0, [1.15, 2.32, -2.86])]); const e = evs(k0).filter(x => x.type !== 'try').map(x => `${x.type}${x.why ? '(' + x.why + ')' : ''}`);
  check('옮기기를 실제로 시작한 뒤 닿지 못함: 놓음 → 실패 → 떨어짐 순서로 남고, 손이 전 자리로 되돌아가 붙지 않는다', /^release\(옮기려고 놓음\)/.test(e[0] || '') && e.some(x => /^reject\(닿지 않음/.test(x)) && e.some(x => /^exit/.test(x)) && !sim.climb.on, e.join(' → ')); }
start([0.7, 0, -2.65]); jumpGrab(0, 480);
{ const k0 = rec.length; run(30, {}, [rel('hand', 0), rel('hand', 1)]); const e = evs(k0).map(x => x.type);
  check('직접 놓기: 놓음으로 기록되고 떨어진다', e.filter(x => x === 'release').length === 2 && e.includes('exit') && !e.includes('reject')); }
// 발도 같다: 디딘 발로 디딜 수 없는 곳을 누르면 그 발은 그대로 디디고 있다
start([-0.9, 0, -2.58]); run(150, {}, [hand(0, A.L)]);
{ const k0 = rec.length, st0 = L().feet[0].st; run(60, {}, [foot(0, [-0.9, 3.2, -3.0])]); const r = evs(k0).find(x => x.type === 'reject');
  check('디딘 발로 닿지 않는 곳을 누름: 거부만 하고 그 발은 계속 디디고 있다', st0 === 'plant' && !!r && L().feet[0].st === 'plant' && !evs(k0).some(x => x.type === 'lift'), r ? r.why : '거부 없음'); }

// ── 9. 뛰어 잡기: 손을 보내는 시각을 바꿔 가며(점프를 누른 뒤 0~0.7초) 잡히는 구간이 하나로 이어져 있는지 ──
// GPT의 측정(p3d-0.5.0): 0~0.033초 잡힘 / 0.05~0.15초 실패 / 0.167~0.417초 잡힘 — 손이 정해 둔 시간표대로만 가서 생긴 구멍이었다. 이 장면의 계산 결과이며 사람의 성공률이 아니다
{ const rows = []; for (let d = 0; d <= 84; d += 2) { start([0.7, 0, -2.65]); jumpGrab(d, 150); const g = evs().filter(x => x.type === 'grab').length; rows.push({ 지연_초: +(d / 120).toFixed(3), 잡은_손: g, 유지: hold(0) || hold(1) }); }
  const ok = rows.map(r => r.잡은_손 > 0), first = ok.indexOf(true), last = ok.lastIndexOf(true), holes = ok.slice(first, last + 1).filter(x => !x).length;
  out.cases['9 뛰어 잡기 지연 스캔'] = { 잡히는_구간_초: first < 0 ? null : [rows[first].지연_초, rows[last].지연_초], 구간_안의_실패: holes, 표: rows };
  check('잡히는 지연 구간이 하나로 이어져 있다(구간 안에 실패가 없다)', first >= 0 && holes === 0 && last - first >= 5, first < 0 ? '잡힌 경우 없음' : `점프를 누른 뒤 ${rows[first].지연_초}~${rows[last].지연_초}초에 보내면 잡힘 · 구간 안의 실패 ${holes}개 · 두 손 모두 잡힌 지연 ${rows.filter(r => r.잡은_손 === 2).length}/${rows.length}`); }

// ── 10. 발부터 올리기(사용자 의견 7: 손으로 잡지 않으면 낮은 턱에 발을 올릴 수 없었다) ──
start([-0.35, 0, -2.62]);
run(200, {}, [foot(1, [-0.30, 0.5, -2.93])]);
{ const f = L().feet[1], e = evs().filter(x => x.type !== 'try').map(x => `${x.type} ${x.name} ${x.why}`);
  check('땅에 서서 손 없이 오른발을 낮은 발판(깊이 14cm)에 올린다', f.st === 'plant' && f.box === '낮은 발판' && sim.climb.on && L().hands.every(h => h.st === 'free'), e.join(' / ')); }
run(200, { cy: 1 }); run(240);
{ const f = L().feet; out.cases['10 발부터 올린 뒤 몸 위로'] = { 문맥: sim.climb.on ? '벽(발로 섬)' : '지상', 몸_높이_cm: +(sim.body.pos.y * 100).toFixed(1), 발: f.map(x => `${x.st}${x.box ? '(' + x.box + ')' : ''} ${x.loadS.toFixed(2)}배`), 기록: evs().filter(x => x.type !== 'try').map(x => `${x.t.toFixed(2)}초 ${x.type} ${x.name} ${x.why}`) };
  console.log('기록  발부터 올린 뒤 몸 위로(W):', JSON.stringify(out.cases['10 발부터 올린 뒤 몸 위로']).slice(0, 420)); }
start([-0.35, 0, -2.62]); run(200, {}, [foot(1, [-0.30, 0.5, -2.93])]); run(120, {}, [rel('foot', 1)]); run(60);
check('올렸던 발을 떼면 두 발이 바닥에 닿아 지상 문맥으로 돌아온다', !sim.climb.on && sim.body.onGround && Math.abs(sim.body.pos.y) < 0.01, `문맥 ${sim.climb.on ? '벽' : '지상'} · 높이 ${cm(sim.body.pos.y)}`);

// ── 11. 발 보조(간편 조작): 놓여 있는 발을 가까운 발판 윗면으로 보낸다. 같은 명령·같은 판정. 발판이 없으면 붙이지 않는다 ──
{ const climbUp = assist => { start([-0.8, 0, -2.60]); sim.opt.footAssist = assist; run(150, {}, [hand(0, [-0.95, 1.92, -2.84])]); run(150, {}, [hand(1, [-0.65, 1.92, -2.84])]); run(300, { cy: 1 }); run(240); return { y: sim.body.pos.y, feet: L().feet, hands: L().hands, steps: evs().filter(x => x.type === 'step' && x.assist) }; };
  const off = climbUp(false), on = climbUp(true), fOn = on.feet.filter(x => x.st === 'plant' && x.box === '낮은 발판');
  out.cases['11 발 보조 켬·끔'] = { 끔: { 몸_높이_cm: +(off.y * 100).toFixed(1), 발: off.feet.map(x => `${x.st}${x.box ? '(' + x.box + ')' : ''} ${x.loadS.toFixed(2)}배`), 손_합: +(off.hands[0].loadS + off.hands[1].loadS).toFixed(2) }, 켬: { 몸_높이_cm: +(on.y * 100).toFixed(1), 발: on.feet.map(x => `${x.st}${x.box ? '(' + x.box + ')' : ''} ${x.loadS.toFixed(2)}배`), 손_합: +(on.hands[0].loadS + on.hands[1].loadS).toFixed(2), 보조가_보낸_발: on.steps.length } };
  check('발 보조 켬: 당겨 오르는 동안 뗀 발이 가까운 낮은 발판으로 가서 디디고 몸무게를 받는다(끔에서는 두 발이 떠 있다)', fOn.length > 0 && on.steps.length > 0 && fOn.reduce((a, x) => a + x.loadS, 0) > 0.2 && off.feet.every(x => x.box !== '낮은 발판'), `켬: 발 ${on.feet.map(x => `${x.st}${x.box ? '(' + x.box + ')' : ''} ${x.loadS.toFixed(2)}`).join(' / ')} · 손 합 ${(on.hands[0].loadS + on.hands[1].loadS).toFixed(2)}배 ‖ 끔: 손 합 ${(off.hands[0].loadS + off.hands[1].loadS).toFixed(2)}배`); }
{ start([0.7, 0, -2.65]); sim.opt.footAssist = true; jumpGrab(0, 480); const steps = evs().filter(x => x.type === 'step').length;
  check('발 보조 켬: 발판이 없는 곳(턱 B 아래)에서는 발을 벽에 붙이지 않고 매달린 채 둔다', steps === 0 && L().feet.every(f => f.st === 'free') && hold(0) && hold(1), `디딤 ${steps}번 · 발 ${L().feet.map(f => f.st).join(', ')}`);
  const k0 = rec.length; run(1, {}, [rel('hand', 0), rel('hand', 1)]); run(12); check('발 보조 켬: 손을 놓고 떨어지는 발을 벽에 다시 붙여 구하지 않는다', !sim.climb.on && !evs(k0).some(x => x.type === 'step')); }

// ── 12. 몸 좌우의 기준: cxSign(화면에서 보이는 쪽. 화면 쪽이 시점으로 정해 준다) ──
{ const shift = sign => { start([-0.9, 0, -2.58]); run(150, {}, [hand(0, A.L)]); run(150, {}, [hand(1, A.R)]); const x0 = sim.body.pos.x; run(60, { cx: 1, cxSign: sign }); return sim.body.pos.x - x0; }, a = shift(1), b = shift(-1);
  check('"몸 오른쪽" 입력: 시점이 몸 뒤에 있으면 +x(화면 오른쪽), 시점이 반대편이면 -x(그때의 화면 오른쪽)로 간다', a > 0.03 && b < -0.03, `뒤에서 볼 때 ${cm(a)} · 반대편에서 볼 때 ${cm(b)}`); }

// ── 13. 반동(흔들기): 손으로만 매달려 A/D. 흔들리는 쪽과 같은 때에 넣으면 커지고, 반대로 넣으면 줄고, 안 넣으면 그대로(조금씩 줄어듦) ──
const hangB = () => { start([0.7, 0, -2.65]); jumpGrab(0, 400); };
const pump = (n, mode) => { for (let k = 0; k < n; k++) { const vx = sim.body.vel.x; run(1, { cxSign: 1, cx: mode === 'in' ? (vx > 0.003 ? 1 : vx < -0.003 ? -1 : 1) : mode === 'anti' ? (vx > 0 ? -1 : 1) : mode === 'hold' ? 1 : 0 }); } };
const amp = n => { const xs = []; for (let k = 0; k < n; k++) { run(1, { cxSign: 1 }); xs.push(sim.body.pos.x); } return (Math.max(...xs) - Math.min(...xs)) / 2; };
{ hangB(); pump(4 * 120, 'in'); const a1 = amp(225); hangB(); pump(2 * 120, 'in'); const a20 = amp(225); hangB(); pump(2 * 120, 'in'); pump(2 * 120, 'anti'); const a2 = amp(225); hangB(); pump(4 * 120, 'none'); const a3 = amp(225); hangB(); pump(2 * 120, 'in'); pump(3 * 120, 'none'); const a4 = amp(225);
  out.cases['13 반동'] = { '제때 4초 → 진폭_cm': +(a1 * 100).toFixed(1), '제때 2초': +(a20 * 100).toFixed(1), '제때 2초 + 반대로 2초': +(a2 * 100).toFixed(1), '아무것도 안 함': +(a3 * 100).toFixed(1), '제때 2초 + 3초 쉼': +(a4 * 100).toFixed(1) };
  check('반동: 흔들리는 쪽과 같은 때에 A/D를 넣으면 커지고(4초에 25cm 넘게), 반대로 넣으면 2초에 3분의 1 아래로 줄고, 안 넣으면 조금씩 줄어든다', a1 > 0.25 && a2 < a20 / 3 && a3 < 0.01 && a4 > 0.05 && a4 < a1 && hold(0) && hold(1), `진폭(가운데에서 한쪽 끝까지): 제때 4초 ${cm(a1)} · 제때 2초 ${cm(a20)} → 이어서 반대로 2초 ${cm(a2)} · 안 함 ${cm(a3)} · 제때 2초 뒤 3초 쉼 ${cm(a4)}`); }
// ── 14. 벽에서 뛰기 ──
{ hangB(); const y0 = sim.body.pos.y; let p = y0, k0 = rec.length; for (let k = 0; k < 150; k++) { run(1, { jump: true }); p = Math.max(p, sim.body.pos.y); } run(240);
  const e = evs(k0).filter(x => x.type !== 'try').map(x => `${x.type}${x.why ? '(' + x.why + ')' : ''}`);
  check('매달린 채 뛰기(Space): 팔로 끌어 올려 몸이 15cm 넘게 오르고, 손을 보내지 않으면 다시 매달린다(놓치지 않음)', p - y0 > 0.15 && hold(0) && hold(1) && !e.some(x => /^slip/.test(x)), `+${cm(p - y0)} · ${e.join(' → ')}`); }
start([-0.9, 0, -2.58]); run(150, {}, [hand(0, A.L)]); run(150, {}, [hand(1, A.R)]); run(200, {}, [foot(1, [-0.30, 0.5, -2.93])]); run(240);
{ const y0 = sim.body.pos.y; let p = y0; for (let k = 0; k < 150; k++) { run(1, { jump: true }); p = Math.max(p, sim.body.pos.y); }
  check('발판을 디딘 채 뛰기: 다리가 밀어 매달려 뛸 때보다 더 높이 오른다(40cm 넘게)', p - y0 > 0.40, `+${cm(p - y0)}`); out.cases['14 벽에서 뛰기'] = { 발판에서_오른_높이_cm: +((p - y0) * 100).toFixed(1) }; }
// B → D(위): 뛰고 나서 손을 보내야 닿는다. 너무 일찍 보내면 그 손이 끌어 주지 못해 낮게 뛴다
{ const rows = []; for (const t of [0, 6, 12, 18, 24, 36, 48]) { hangB(); run(1, { jump: true }); run(t, { jump: true }); run(1, { jump: true }, [hand(1, [1.0, 2.48, -2.86])]); run(150); rows.push({ t: +(t / 120).toFixed(3), ok: evs().some(x => x.type === 'grab' && x.box === '턱 D') }); }
  hangB(); run(1, {}, [hand(1, [1.0, 2.48, -2.86])]); run(150); const noJump = evs().some(x => x.type === 'grab' && x.box === '턱 D');
  hangB(); run(60, { cy: 1 }); run(1, { cy: 1 }, [hand(1, [1.0, 2.48, -2.86])]); run(150, { cy: 1 }); const pull = evs().some(x => x.type === 'grab' && x.box === '턱 D');
  out.cases['14b 턱 B → 턱 D(위로 뛰어 잡기)'] = { 뛰기를_누른_뒤_손을_보낸_시각: rows, 뛰지_않고: noJump, 당겨_오른_뒤: pull };
  const okT = rows.filter(r => r.ok).map(r => r.t);
  check('턱 B → 턱 D(26cm 위): 뛰지 않거나 당겨 오르기만 해서는 못 잡고, 뛰고 나서 손을 보내면 잡는다(너무 일찍 보내면 못 잡음)', !noJump && !pull && okT.length >= 3 && !rows[0].ok, `뛰기를 누른 뒤 ${rows.map(r => `${r.t}초 ${r.ok ? '잡음' : '못 잡음'}`).join(' · ')} · 뛰지 않고 ${noJump ? '잡음' : '못 잡음'} · 당겨 오른 뒤 ${pull ? '잡음' : '못 잡음'}`); }
// B → E(옆): 흔들지 않으면 못 잡고, 흔들어 오른쪽으로 가는 중에 뛰면 잡는다. 늦게 뛰면 못 잡는다
{ const tryE = (swing, d) => { hangB(); if (swing) { pump(3 * 112, 'in'); let last = sim.body.vel.x, k = 0; while (k++ < 400) { run(1, { cxSign: 1, cx: sim.body.vel.x > 0 ? 1 : -1 }); const v = sim.body.vel.x; if (last < 0 && v >= 0) break; last = v; } run(d, { cxSign: 1, cx: 1 }); }
    run(24, { jump: true, cx: 1, cxSign: 1 }); run(1, { jump: true, cx: 1, cxSign: 1 }, [hand(1, [1.8, 1.90, -2.86]), rel('hand', 0)]); run(150); return evs().some(x => x.type === 'grab' && x.box === '턱 E'); };
  const no = tryE(false), rows = [20, 30, 40, 50, 60, 70, 80].map(d => ({ 왼쪽_끝_뒤_초: +(d / 120).toFixed(2), ok: tryE(true, d) }));
  out.cases['14c 턱 B → 턱 E(흔들어 옆으로 뛰어 잡기)'] = { 흔들지_않고: no, 흔들고: rows };
  check('턱 B → 턱 E(옆으로 0.9m): 흔들지 않으면 못 잡고, 흔들어 오른쪽으로 가는 중에 뛰면 잡고, 늦게(되돌아올 때) 뛰면 못 잡는다', !no && rows.filter(r => r.ok).length >= 3 && !rows[rows.length - 1].ok, `흔들지 않고 ${no ? '잡음' : '못 잡음'} · 흔들어 왼쪽 끝을 지난 뒤 ${rows.map(r => `${r.왼쪽_끝_뒤_초}초 ${r.ok ? '잡음' : '못 잡음'}`).join(' · ')}`); }

console.log(`실패 ${fails}`);
check('벽 동작 전체(위의 모든 장면): 뼈의 한 걸음 회전량이 바로 앞 걸음보다 12° 넘게 달라지지 않는다(지상 동작과 같은 기준)', jk.max <= 12, `가장 큰 튐 ${jk.max.toFixed(1)}° (${jk.what}) · 12° 넘은 횟수 ${jk.n}`); out.cases['벽 동작의 한 걸음 회전 튐'] = { 최대_도: +jk.max.toFixed(1), 어디: jk.what, '12도_넘은_횟수': jk.n };
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
process.exit(fails ? 1 : 0);
