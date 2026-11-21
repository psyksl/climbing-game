// 벽 접촉 점검(W2 첫 판). 스크립트 입력이며 사람 손이 아니다. 성공만 모으지 않고 거부·놓침·떨어짐을 함께 본다.
// 손: 시도 → 잡음/거부 → 유지 → 놓기. 발: 누르는 힘과 마찰로만 버틴다(벽에 붙지 않는다). 놓는 걸음에 속도가 이어지는지, 접촉 오차·관통·거부 까닭을 적는다.
// 사용: node test/wall_check.mjs [결과 JSON]   캡처 동작으로: MODE=clip (assets_local/clips.json이 있을 때)
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import * as THREE from 'three';
const HERE = path.dirname(fileURLToPath(import.meta.url)), SRC = path.resolve(HERE, '../src'), imp = f => import(pathToFileURL(path.join(SRC, f)).href);
const { buildCharacter, DIM } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js'), { limbState, CL, probeHand, FSTAT } = await imp('climb.js'), { PHY } = await imp('controller.js'), clamp = THREE.MathUtils.clamp;
const CLP = path.resolve(HERE, '../assets_local/clips.json'), useClip = process.env.MODE === 'clip';
if (useClip && !fs.existsSync(CLP)) { console.log('clips.json 없음 → 건너뜀'); process.exit(0); }
const clips = useClip ? JSON.parse(fs.readFileSync(CLP, 'utf8')) : null, rig = buildCharacter(), DT = PHY.DT, G = PHY.G;
globalThis.KDBG = !!process.env.KDBG; FSTAT.loose = !!process.env.LOOSE; globalThis.NOOPEN = !!process.env.NOOPEN; globalThis.NOSELF = !!process.env.NOSELF; globalThis.NOARMS = !!process.env.NOARMS; if (process.env.XTW) globalThis.XTW = +process.env.XTW; if (process.env.MW) globalThis.MW = +process.env.MW; if (process.env.XT) globalThis.XT = +process.env.XT; globalThis.NOLEAN = !!process.env.NOLEAN; let sim, rec, fails = 0; const jk = { prev: null, sim: null, d: [], max: 0, what: '', n: 0, minY: 9, minAt: '' };
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
    if (sim.body.pos.y < jk.minY) { jk.minY = sim.body.pos.y; jk.minAt = `#${out.checks.length} @${sim.tick}`; }
    // 한 걸음 회전 튐(지상의 motion_check와 같은 재는 법): 뼈의 제자리 회전이 한 걸음에 바뀐 양이 바로 앞 걸음과 얼마나 다른가. 벽에 붙어 있거나 막 나온 걸음만 센다(지상 구간은 motion_check가 본다)
    { const cur = rig.list.map(b => b.quaternion.clone()); if (jk.prev && jk.sim === sim) rig.list.forEach((b, k) => { const d = jk.prev[k].angleTo(cur[k]) * 180 / Math.PI, j = jk.d[k] === undefined ? 0 : Math.abs(d - jk.d[k]); jk.d[k] = d; if ((sim.climb.on || on0) && j > jk.max) { jk.max = j; jk.what = `${b.name} @${sim.tick} ${sim.climb.events.filter(e => e.type !== 'try').map(e => e.type + (e.name ? ' ' + e.name : '')).join(',')}`; } if ((sim.climb.on || on0) && j > 12) { jk.n++; if (process.env.JK) console.log(`      튐 ${j.toFixed(1)}° ${b.name} @${sim.tick} #${out.checks.length} [${sim.climb.hands.map(h => h.st[0]).join("")}${sim.climb.feet.map(f => f.st[0]).join("")}${sim.climb.push ? "P" : ""}] ${sim.climb.on ? '벽' : '나옴'} ${sim.climb.events.filter(e => e.type !== 'try').map(e => e.type + (e.name ? ' ' + e.name : '') + (e.why ? '(' + e.why + ')' : '')).join(',')}`); } }); else jk.d = []; jk.prev = cur; jk.sim = sim; }
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
// ── 15. 벽 딛기(p3d-0.8.0, 옵션): 손으로 매달리면 놓인 발을 앞의 벽면에 댄다. 발은 누르기만 한다(손이 당겨 주는 동안만 버틴다) ──
{ const hangR = () => { hangB(); sim.opt.wallRest = true; run(480); };
  hangR(); const f = L().feet, h = L().hands, gap = sim.body.pos.z + 2.86;
  check('벽 딛기: 두 손으로 매달리면 두 발이 벽면을 디디고(하중을 나눠 받음), 엉덩이가 벽에서 떨어지고, 가만히 버틴다', f.every(x => x.st === 'plant' && x.kind === 'smear' && x.loadS > 0.1) && h.every(x => x.st === 'hold') && gap > 0.22 && speed() < 0.05, `발 ${f.map(x => x.kind + ' ' + x.loadS.toFixed(2)).join(' / ')} · 손 ${h.map(x => x.loadS.toFixed(2)).join(' / ')} · 엉덩이–벽 ${cm(gap)} · 속도 ${speed().toFixed(3)}`);
  { const y0 = sim.body.pos.y; let p = y0; for (let k = 0; k < 150; k++) { run(1, { jump: true }); p = Math.max(p, sim.body.pos.y); }
    hangB(); const y1 = sim.body.pos.y; let q = y1; for (let k = 0; k < 150; k++) { run(1, { jump: true }); q = Math.max(q, sim.body.pos.y); }
    check('벽 딛기: 벽을 디딘 채 뛰면 다리가 밀어 매달려 뛸 때보다 높이 오른다', p - y0 > q - y1 + 0.10, `디딘 채 +${cm(p - y0)} · 매달려 +${cm(q - y1)}`); out.cases['15 벽 딛기'] = { 디딘_채_뛴_높이_cm: +((p - y0) * 100).toFixed(1), 매달려_뛴_높이_cm: +((q - y1) * 100).toFixed(1) }; }
  // 손을 다 놓으면 벽면의 발은 버티지 못한다(붙지 않는다)
  hangR(); const k1 = rec.length; run(1, {}, [rel('hand', 0), rel('hand', 1)]); run(14);
  check('벽 딛기: 두 손을 놓으면 벽면의 발은 버티지 못하고 떨어진다(발이 벽에 붙지 않는다)', !sim.climb.on && sim.body.vel.y < -0.6 && evs(k1).filter(x => x.type === 'lift' && /벽면의 발/.test(x.why)).length === 2, `0.12초 뒤 세로 속도 ${sim.body.vel.y.toFixed(2)}m/s · ${evs(k1).filter(x => x.type !== 'try').map(x => x.type + (x.why ? '(' + x.why + ')' : '')).join(' → ').slice(0, 120)}`);
  // 직접 뗀 발은 다시 대지 않는다. 손을 새로 잡으면 다시 댄다
  hangR(); run(1, {}, [rel('foot', 0)]); run(360); const off = L().feet[0].st;
  check('벽 딛기: 직접 뗀 발은 저절로 다시 대지 않는다(3초 뒤에도 놓여 있음)', off === 'free' && L().feet[1].st === 'plant', `왼발 ${off} · 오른발 ${L().feet[1].st}`);
  // 손을 옮겨 잡아도 그 발을 다시 대지 않는다(다른 손을 고르는 것이 그 발을 다시 보내라는 뜻은 아니다). 보조를 다시 시작하면(켜고 끄기) 다시 댄다
  run(150, {}, [hand(1, [1.12, 2.32, -2.86])]); run(300); const off2 = L().feet[0].st, moved = hold(1);
  run(1, {}, [{ type: 'assistResume' }]); run(360); const back = L().feet[0].st;
  check('직접 뗀 발: 손을 옮겨 잡아도 다시 대지 않고, 보조를 다시 시작하면 다시 댄다', moved && off2 === 'free' && back === 'plant', `손 옮긴 뒤 왼발 ${off2} · 보조 다시 시작 뒤 ${back}`);
  // 흔드는 입력(A/D)을 넣고 있으면 발을 대지 않는다(반동을 덮어쓰지 않는다)
  hangB(); sim.opt.wallRest = true; pump(3 * 120, 'in'); const sw = L().feet.every(x => x.st === 'free'), a = amp(225);
  check('벽 딛기: 매달려 흔드는 동안에는 발을 대지 않는다(반동이 그대로 커진다)', sw && a > 0.15, `흔드는 동안 발 ${sw ? '놓임' : '디딤'} · 진폭 ${cm(a)}`); }
// ── 16. 발 선택이 결과를 가르는 장면(p3d-0.8.1, GPT의 첫 몸 동작 비교): 턱 A를 두 손으로 잡은 채 오른손을 턱 F(23cm 위, 오른쪽)로 ──
// 같은 손 배치에서 발만 다르게 고른다. 발은 사용자가 고르고(발 보조·벽 딛기 끔) W는 "지금 붙은 손발로 위로"의 뜻이다. 발을 바꿨다고 주는 보너스는 없다 — 닿고 못 닿고는 디딘 자리와 다리 길이에서 나온다
{ const F = [-0.3, 2.15, -2.86], knee = i => { const h = sim.climb.T.hj[i], f = sim.climb.feet[i]; return f.st === 'plant' ? h.distanceTo(f.ank) / (CL.LEG / 0.999) : NaN; };
  const go = (feetCmd, wT, rock = true) => { start([-0.9, 0, -2.58]); sim.opt.rockOver = rock; run(150, {}, [hand(0, A.L)]); run(150, {}, [hand(1, A.R)]); for (const c of feetCmd) run(260, {}, [c]);
    const y0 = sim.body.pos.y, x0 = sim.body.pos.x, i = feetCmd.length ? feetCmd[0].i : 1, k0 = knee(i); if (wT) run(wT, { cy: 1 });
    const o = { 오른_높이_cm: +((sim.body.pos.y - y0) * 100).toFixed(1), 옆으로_간_거리_cm: +((sim.body.pos.x - x0) * 100).toFixed(1), 디딘_다리_길이비_처음: +k0.toFixed(2), 손을_보낼_때: +knee(i).toFixed(2), 디딘_발_하중_몸무게배: +(L().feet[i].loadS).toFixed(2) }; const k1 = rec.length;
    // 잡는 순간의 값은 잡기 이벤트가 생긴 그 걸음에 적는다(p3d-0.8.3, GPT 지적: 전에는 다 가라앉은 뒤의 값을 "잡을 때"라고 적었다). 다리 길이비 = 고관절–발목 거리 ÷ 다리 길이이며 무릎이 펴진 퍼센트가 아니다
    let atGrab = null; const kneeDeg = r => { const a = DIM.thigh, b = DIM.shin, d = r * (a + b); return Math.acos(clamp((a * a + b * b - d * d) / (2 * a * b), -1, 1)) * 180 / Math.PI; }, snap = () => ({ 걸음: sim.tick, 다리_길이비: +knee(i).toFixed(3), 무릎각_도: +kneeDeg(knee(i)).toFixed(0), 디딘_발_하중: +(sim.climb.feet[i].load || 0).toFixed(2), 손_하중: sim.climb.hands.map(h => +(h.load || 0).toFixed(2)) }), sent = snap();
    run(1, wT ? { cy: 1 } : {}, [hand(1, F)]); for (let q = 0; q < 370; q++) { run(1, q < 220 && wT ? { cy: 1 } : {}); if (!atGrab && sim.climb.events.some(e => e.type === 'grab' && e.box === '턱 F')) atGrab = snap(); }
    const g = evs(k1).find(x => x.type === 'grab' && x.box === '턱 F'), tr = evs(k1).find(x => x.type === 'try');
    return { ...o, 잡음: !!g && hold(0) && hold(1) && L().hands[1].box === '턱 F', 손을_보낸_뒤_잡기까지_초: g && tr ? +(g.t - tr.t).toFixed(2) : null, 손을_보내는_걸음: sent, 잡는_걸음: atGrab, 다_가라앉은_뒤: g ? snap() : null, 끝: evs(k1).filter(x => /grab|reject|slip/.test(x.type)).map(x => x.type + (x.why ? '(' + x.why + ')' : '')).join(' → ').slice(0, 80) }; };
  const R = { '두 발 바닥 · W 없음': go([], 0), '두 발 바닥 · W 2초': go([], 240), '왼발을 넓은 발판에 · W 2초': go([foot(0, [-1.32, 0.3, -2.75])], 240), '오른발을 낮은 발판에 · W 없음': go([foot(1, [-0.3, 0.5, -2.93])], 0), '오른발을 낮은 발판에 · W 2초': go([foot(1, [-0.3, 0.5, -2.93])], 240), '오른발을 낮은 발판에 · W 1초': go([foot(1, [-0.3, 0.5, -2.93])], 120), '(비교) 오른발을 낮은 발판에 · W 2초 · 엉덩이 옮기기 끔': go([foot(1, [-0.3, 0.5, -2.93])], 240, false) };
  out.cases['16 발 선택이 결과를 가르는 장면(턱 A → 턱 F)'] = R; const ok = R['오른발을 낮은 발판에 · W 2초'];
  check('턱 A → 턱 F: 바닥에 선 채로는(W를 눌러도), 왼발을 넓은 발판에 올려도 닿지 않는다', !R['두 발 바닥 · W 없음'].잡음 && !R['두 발 바닥 · W 2초'].잡음 && !R['왼발을 넓은 발판에 · W 2초'].잡음, `바닥 ${R['두 발 바닥 · W 2초'].끔 || R['두 발 바닥 · W 2초'].끝} · 넓은 발판 ${R['왼발을 넓은 발판에 · W 2초'].끝}`);
  check('턱 A → 턱 F: 오른발을 낮은 발판에 올리고 W로 올라서면 닿는다(두 손으로 잡은 채 끝남). 발이 받친 채 다리가 펴지며 오른다', ok.잡음 && ok.디딘_발_하중_몸무게배 > 0.2 && ok.손을_보낼_때 > ok.디딘_다리_길이비_처음 + 0.05, `오른 높이 ${ok.오른_높이_cm}cm · 옆으로 ${ok.옆으로_간_거리_cm}cm · 다리 길이비 ${ok.디딘_다리_길이비_처음} → ${ok.손을_보낼_때}(손을 보낼 때) → ${ok.잡는_걸음 ? ok.잡는_걸음.다리_길이비 + '(잡는 걸음 @' + ok.잡는_걸음.걸음 + ', 무릎각 ' + ok.잡는_걸음.무릎각_도 + '°)' : '-'} → ${ok.다_가라앉은_뒤 ? ok.다_가라앉은_뒤.다리_길이비 + '(다 가라앉은 뒤)' : '-'} · 발 하중 ${ok.디딘_발_하중_몸무게배}배 · 손 보내고 ${ok.손을_보낸_뒤_잡기까지_초}초 뒤 잡음`);
  console.log('      (자료) ' + Object.entries(R).map(([k, v]) => `${k}: ${v.잡음 ? '잡음' : '못 잡음'}(오른 높이 ${v.오른_높이_cm}cm)`).join(' · ')); }
// ── 17. 당겨 오른 뒤 한 손을 놓고 매달렸다가 다시 잡기(누르는 때를 바꿔 가며): 무릎·발이 벽에 들어가지 않는다 ──
// p3d-0.8.1에서 찾은 퇴행의 재발 방지: 늘어뜨린 발의 쉬는 자리를 벽 쪽으로 옮겼더니 발이 벽 바로 앞 바닥에 디뎌 굽힌 무릎이 벽에 들어갔다(실제 입력 시험이 먼저 잡았고, 위의 장면들은 이 누르는 때를 덮지 못했다)
{ let n = 0, bad = 0, worst = 0, what = '';
  for (const wT of [60, 140, 240]) for (const gap of [10, 150]) for (const rw of [100, 250, 400]) { start([-0.9, 0, -2.58]); run(150, {}, [hand(0, A.L)]); run(150, {}, [hand(1, A.R)]); run(wT, { cy: 1 }); run(gap); run(rw, {}, [rel('hand', 1)]); run(60, {}, [hand(0, [-1.3, 1.5, -3.0])]); run(200, {}, [hand(1, A.R)]); run(200);
    const st = sim.climb.stats; n++; if (st.pen > 0) { bad++; if (st.pen > worst) { worst = st.pen; what = `W ${wT}걸음·쉼 ${gap}·놓고 ${rw}: ${st.penWhat}`; } } }
  check('당겨 오름 → 한 손 놓기 → 다시 잡기(누르는 때 18가지): 어느 경우에도 지형 관통 0', bad === 0, `관통이 있던 경우 ${bad}/${n}${bad ? ' · 가장 긴 것 ' + worst + '걸음(' + what + ')' : ''}`); out.cases['17 한 손 놓고 다시 잡기의 관통'] = { 경우: n, 관통이_있던_경우: bad, 가장_긴_걸음: worst }; }
// ── 18. 발 보조를 켜고 끄는 순간(GPT Reply07: "보조 모드 변경 시 이미 붙은 접촉의 유지·이동 중 목표 처리도 기록한다") ──
// 정한 것(p3d-0.8.2): 켜고 끄는 것은 이미 붙은 손발을 건드리지 않는다. 보조가 보내던 발은 끈 뒤에도 가던 자리까지 간다(끄는 것이 "떼기"가 되지 않게). 끈 뒤에는 보조가 새로 보내지 않는다
{ const con = () => JSON.stringify([sim.climb.hands.map(h => (h.st === 'hold' ? h.edge.box.name + h.goal.toArray().map(v => v.toFixed(4)) : h.st)), sim.climb.feet.map(f => (f.st === 'plant' ? f.box.name + f.p.toArray().map(v => v.toFixed(4)) : f.st === 'move' ? 'move' + f.ank.toArray().map(v => v.toFixed(4)) : f.st))]);
  const go = cut => { start([-0.8, 0, -2.60]); sim.opt.footAssist = true; run(150, {}, [hand(0, [-0.95, 1.92, -2.84])]); run(150, {}, [hand(1, [-0.65, 1.92, -2.84])]); const k0 = rec.length; let R = null;
    for (let k = 0; k < 540; k++) { const mv = sim.climb.feet.findIndex(f => f.st === 'move' && f.byAssist);
      if (!R && mv >= 0) { const tgt = sim.climb.feet[mv].ank.clone(); if (cut) { sim.opt.footAssist = false; run(1, { cy: 1 }, [{ type: 'assistResume' }]); } else run(1, { cy: 1 }); R = { foot: mv, c1: con(), tgt, at: rec.length }; continue; }
      run(1, { cy: k < 300 ? 1 : 0 }); }
    const st = evs(k0).filter(x => x.type === 'step' && x.assist); return { R, steps: st.length, after: R ? rec.slice(R.at).flatMap(r => r.ev).filter(x => x.type === 'step' && x.assist).length : 0, F: R ? sim.climb.feet[R.foot] : null }; };
  // 접촉이 그대로인지는 같은 걸음의 "끄지 않은 경우"와 견준다(그 걸음에 다른 까닭으로 발이 떨어지는 우연과 섞이지 않게)
  const keep = go(false), cut = go(true), F = cut.F, arrived = !!cut.R && F.st === 'plant' && F.ank.distanceTo(cut.R.tgt) < 0.02; if (cut.R) cut.R.same = !!keep.R && keep.R.c1 === cut.R.c1;
  check('발 보조를 끄는 순간: 붙어 있던 손발은 그대로이고, 보조가 보내던 발은 가던 자리에 디딘다. 끈 뒤의 보조 디딤은 그 발 하나뿐이다', !!cut.R && cut.R.same && arrived && cut.after === 1, cut.R ? `끄는 걸음에 접촉 ${cut.R.same ? '그대로' : '바뀜'} · 가던 발 ${F.st}${arrived ? '(가던 자리)' : ''} · 끈 뒤 보조 디딤 ${cut.after}번(가던 발 1번까지) · 계속 켠 경우 ${keep.steps}번` : '보조가 보내는 발이 없었음');
  // 끈 채 직접 디딘 발과 잡은 손은 보조를 켜는 걸음에도 그대로다
  const on1 = tg => { start([-0.9, 0, -2.58]); sim.opt.footAssist = false; run(150, {}, [hand(0, A.L)]); run(150, {}, [hand(1, A.R)]); run(200, {}, [foot(1, [-0.35, 0.5, -2.93])]); if (tg) { sim.opt.footAssist = true; run(1, {}, [{ type: 'assistResume' }]); } else run(1); return { c: con(), f: L().feet[1].st }; }, cA = on1(false), cB = on1(true);
  check('발 보조를 켜는 순간: 잡은 손과 직접 디딘 발은 켜지 않은 경우와 같다(그 걸음에 달라지는 접촉이 없다)', cA.c === cB.c && cB.f === 'plant', cA.c === cB.c ? '' : `켜지 않음 ${cA.c} ‖ 켬 ${cB.c}`);
  out.cases['18 발 보조 켬·끔의 순간'] = { 끄는_걸음에_접촉_그대로: !!cut.R && cut.R.same, 가던_발: F ? F.st : '-', 끈_뒤_보조_디딤: cut.after, 계속_켠_경우_보조_디딤: keep.steps }; }
check('위의 모든 장면에서 몸이 바닥 아래로 떨어지지 않는다(몸 자리의 가장 낮은 높이가 −0.6m 위. 웅크려 매달리면 조금 음수가 된다)', jk.minY > -0.6, `가장 낮은 높이 ${jk.minY.toFixed(2)}m (${jk.minAt})`);
check('벽 동작 전체(위의 모든 장면): 뼈의 한 걸음 회전량이 바로 앞 걸음보다 12° 넘게 달라지지 않는다(지상 동작과 같은 기준)', jk.max <= 12, `가장 큰 튐 ${jk.max.toFixed(1)}° (${jk.what}) · 12° 넘은 횟수 ${jk.n}`); out.cases['벽 동작의 한 걸음 회전 튐'] = { 최대_도: +jk.max.toFixed(1), 어디: jk.what, '12도_넘은_횟수': jk.n };
// ── 19. W의 자동 옆 옮김보다 A/D가 먼저(p3d-0.8.4, GPT): 오른발을 낮은 발판에 올린 채 W만 누르면 엉덩이가 그 발 쪽(오른쪽)으로 가고, W + 몸 왼쪽을 함께 누르면 왼쪽으로 간다 ──
{ const go = cx => { start([-0.9, 0, -2.58]); run(150, {}, [hand(0, A.L)]); run(150, {}, [hand(1, A.R)]); run(260, {}, [foot(1, [-0.3, 0.5, -2.93])]); const x0 = sim.body.pos.x; run(120, { cy: 1, cx, cxSign: 1 }); return sim.body.pos.x - x0; }, w = go(0), wl = go(-1);
  check('W + 몸 왼쪽(A): 자동 옆 옮김이 직접 누른 좌우를 이기지 않는다(W만 = 디딘 발 쪽으로, W + 왼쪽 = 왼쪽으로)', w > 0.02 && wl < -0.02, `W만 ${cm(w)} · W + 왼쪽 ${cm(wl)}`); }
// ── 20. 팔 교차와 몸 앞을 가로지르는 길(p3d-0.8.5): 손 조작 1. 목표와 다른 손의 접촉은 그대로 두고, 뻗는 팔이 제 머리·몸통을 비켜 간다. 가까운 교차(다른 손 15cm 너머)는 거부되지 않는다 ──
// 재는 것: 팔뚝의 줄기(팔꿈치–손목 아홉 점)가 머리 타원체·가슴 상자에 든 걸음(arm_mesh와 같은 기준), 손목 표면(반지름 3.6cm)이 머리·가슴에 든 가장 깊은 깊이, 두 팔뚝 줄기 사이의 거리(자료 — 통과·실패로 보지 않는다)
{ const inv = new THREE.Matrix4(), HR = DIM.headR, wp = n => rig.bones[n].getWorldPosition(new THREE.Vector3()), loc = (p, bone, c) => p.clone().applyMatrix4(inv.copy(rig.bones[bone].matrixWorld).invert()).sub(new THREE.Vector3(...c));
  const dHead = p => { const l = loc(p, 'head', [0, HR * 0.9, 0.01]); return (1 - Math.hypot(l.x / (HR * 0.9), l.y / (HR * 1.05), l.z / HR)) * HR * 0.9; }, dChest = p => { const l = loc(p, 'chest', [0, 0.11, 0.005]); return Math.min(0.18 - Math.abs(l.x), 0.12 - Math.abs(l.y), 0.105 - Math.abs(l.z)); };
  const segDist = (a0, a1, b0, b1) => { let m = 9; for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) m = Math.min(m, a0.clone().lerp(a1, i / 8).distanceTo(b0.clone().lerp(b1, j / 8))); return m; };
  // 굵기 기준의 팔–팔 겹침(p3d-0.8.6): 뻗는 팔의 팔뚝(반지름 4.5 → 3.6cm)이 다른 팔의 팔뚝·위팔(5.5 → 4.5cm)에 겹친 깊이 = 두 반지름의 합 − 가운데 선 사이의 거리. 살이 눌리는 여유 1.2cm를 넘는 걸음을 센다
  const capOv = (a0, a1, ra0, ra1, b0, b1, rb0, rb1) => { let m = -9; for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) m = Math.max(m, ra0 + (ra1 - ra0) * i / 10 + rb0 + (rb1 - rb0) * j / 10 - a0.clone().lerp(a1, i / 10).distanceTo(b0.clone().lerp(b1, j / 10))); return m; };
  const armOv = (sd, od) => { const a = wp(`foreArm.${sd}`), w = wp(`hand.${sd}`), s2 = wp(`upperArm.${od}`), a2 = wp(`foreArm.${od}`), w2 = wp(`hand.${od}`); return Math.max(capOv(a, w, 0.045, 0.036, a2, w2, 0.045, 0.036), capOv(a, w, 0.045, 0.036, s2, a2, 0.055, 0.045)); };
  const leg = (i, p, n) => { const k0 = rec.length, sd = i ? 'R' : 'L', od = i ? 'L' : 'R', o = { 줄기_든_걸음: 0, 손목_겹침_cm: 0, 팔뚝_사이_최소_cm: 900, 팔뚝_4cm_안_걸음: 0, 굵기_겹침_최대_cm: 0, 굵기_겹침_여유_넘은_걸음: 0, 뻗은_걸음: 0 };
    let pw = null, ptw = sim.climb.pz.twist; o.손목_한걸음_최대_cm = 0; o.비틀기_한걸음_최대 = 0;
    for (let k = 0; k < n; k++) { run(1, {}, k === 0 ? [hand(i, p)] : null); { const tw = sim.climb.pz.twist; o.비틀기_한걸음_최대 = Math.max(o.비틀기_한걸음_최대, Math.abs(tw - ptw)); ptw = tw; } if (sim.climb.hands[i].st !== 'reach') { pw = null; continue; } rig.root.updateMatrixWorld(true); const a = wp(`foreArm.${sd}`), w = wp(`hand.${sd}`); if (pw) o.손목_한걸음_최대_cm = Math.max(o.손목_한걸음_최대_cm, w.distanceTo(pw) * 100); pw = w.clone();
      let worst = 0; for (let j = 0; j <= 8; j++) { const q = a.clone().lerp(w, j / 8); worst = Math.max(worst, dHead(q), dChest(q)); } if (worst > 0.001) o.줄기_든_걸음++;
      o.손목_겹침_cm = Math.max(o.손목_겹침_cm, (Math.max(dHead(w), dChest(w)) + 0.036) * 100); const sdist = segDist(a, w, wp(`foreArm.${od}`), wp(`hand.${od}`)) * 100; o.팔뚝_사이_최소_cm = Math.min(o.팔뚝_사이_최소_cm, sdist); if (sdist < 4) o.팔뚝_4cm_안_걸음++; { const ov = armOv(sd, od) * 100; o.뻗은_걸음++; o.굵기_겹침_최대_cm = Math.max(o.굵기_겹침_최대_cm, ov); if (ov > 1.2) o.굵기_겹침_여유_넘은_걸음++; } }
    o.끝 = evs(k0).filter(e => e.limb === 'hand' && e.i === i && e.type !== 'try').map(e => e.type + (e.why ? `(${e.why})` : '')).join(' → '); o.두_손 = L().hands.map(h => h.st).join('/'); o.손목_겹침_cm = +o.손목_겹침_cm.toFixed(1); o.팔뚝_사이_최소_cm = +o.팔뚝_사이_최소_cm.toFixed(1);
    if (hold(0) && hold(1)) { rig.root.updateMatrixWorld(true); o.잡은_채_팔뚝_사이_cm = +(segDist(wp('foreArm.L'), wp('hand.L'), wp('foreArm.R'), wp('hand.R')) * 100).toFixed(1); o.잡은_채_굵기_겹침_cm = +(Math.max(armOv('L', 'R'), armOv('R', 'L')) * 100).toFixed(1); } o.굵기_겹침_최대_cm = +o.굵기_겹침_최대_cm.toFixed(1); return o; };
  const R = {}, pre = [], HS = () => L().hands.map(h => h.st).join('/'), slips = (k0 = 0) => evs(k0).filter(e => e.type === 'slip' || (e.type === 'release' && !/옮기려고/.test(e.why || ''))).map(e => `${e.name} ${e.why}`).join(' ');
  // 장면의 앞 조건(먼저 잡아 둘 손)이 두 모션에서 모두 성립하는 자리로 잡았다. 성립하지 않으면 실패로 끝낸다
  // ① 서서 15cm 교차 → 1초 → 되돌리기 → 1.5초(가슴 비틀기가 돌아오는지)
  start([-0.9, 0, -2.58]); run(220, {}, [hand(1, [-0.85, 1.92, -2.84])]); pre.push(hold(1)); const X1 = '서서 오른손만 잡고 → 왼손을 오른손 15cm 너머로'; R[X1] = leg(0, [-0.70, 1.92, -2.84], 260); run(120); R['  1초 뒤'] = { 두_손: HS(), 비틀기: +sim.climb.pz.twist.toFixed(2) };
  R['  → 왼손을 되돌림'] = leg(0, [-1.15, 1.92, -2.84], 200); // 되돌리는 자리는 두 모션에서 모두 닿는 곳(-1.2는 캡처 모션에서 2cm 모자랐다 — 엇갈려 잡은 자세가 0.8.5와 달라졌다)
  { let m = 0, pt = sim.climb.pz.twist; for (let k = 0; k < 180; k++) { run(1); m = Math.max(m, Math.abs(sim.climb.pz.twist - pt)); pt = sim.climb.pz.twist; } R['  되돌린 뒤 1.5초'] = { 두_손: HS(), 비틀기: +sim.climb.pz.twist.toFixed(3), 비틀기_한걸음_최대: m, 놓침: slips() }; }
  // ② 한 손 매달림(팔을 다 편 채)에서 15cm 교차: 굵기를 지키면 길이 없다 → 손이 멈추고 까닭을 알린다(0.8.5에서는 두 팔뚝이 서로를 지나가며 잡았다)
  start([-0.9, 0, -2.58]); run(150, {}, [hand(0, A.L)]); run(150, {}, [hand(1, A.R)]); run(200, { cy: 1 }); run(60, {}, [rel('hand', 1)]); pre.push(hold(0)); const X2 = '당겨 올라갔다 한 손 매달림(팔을 다 폄) → 오른손을 왼손 15cm 너머로', kx = rec.length; R[X2] = leg(1, [-1.25, 1.92, -2.84], 300); run(60); R['  그 뒤 '] = { 두_손: HS(), 놓침: slips(kx) };
  // ③ 닿지 않는 거리의 교차
  start([-0.9, 0, -2.58]); run(150, {}, [hand(0, A.L)]); pre.push(hold(0)); R['서서 왼손만 잡고(오른손 늘어뜨림) → 오른손을 왼손 28cm 너머로(닿지 않는 거리)'] = leg(1, [-1.38, 1.92, -2.84], 200);
  // ④ 팔을 거의 다 편 23cm 교차 → 4초
  start([-0.9, 0, -2.58]); run(220, {}, [hand(1, [-0.85, 1.92, -2.84])]); pre.push(hold(1)); const ext = '서서 오른손만 잡고 → 왼손을 오른손 23cm 너머로(팔을 거의 다 편 교차)'; R[ext] = leg(0, [-0.62, 1.92, -2.84], 260); run(120); R['  1초 뒤  '] = { 두_손: HS(), 놓침: slips() };
  run(360); R['  4초 뒤'] = { 두_손: HS(), 놓침: slips(), 윗몸_비킴_rad: [sim.climb.hg ? +sim.climb.hg.x.toFixed(2) : 0, sim.climb.hg ? +sim.climb.hg.z.toFixed(2) : 0] };
  // ⑥ 엇갈려 잡은 채 5초: 몸이 저절로 옮겨 가지 않는다(0.8.6 작업 중에 찾은 것: 잡은 팔의 팔꿈치가 다른 팔에 자리를 내 주다 머리에 닿고, 윗몸이 그것을 비키느라 몸이 36cm 옆으로 밀려가며 두 발이 떨어졌다)
  start([-0.9, 0, -2.58]); run(220, {}, [hand(1, [-0.85, 1.92, -2.84])]); run(120, {}, [hand(0, [-0.70, 1.92, -2.84])]); const still0 = sim.body.pos.clone(), kS = rec.length; let drift = 0; for (let k = 0; k < 600; k++) { run(1); drift = Math.max(drift, sim.body.pos.distanceTo(still0)); }
  R['엇갈려 잡은 채 5초'] = { 두_손: HS(), 몸이_옮겨_간_가장_먼_거리_cm: +(drift * 100).toFixed(1), 발이_떨어진_횟수: evs(kS).filter(e => e.type === 'lift').length, 윗몸_비킴_rad: [sim.climb.hg ? +sim.climb.hg.x.toFixed(2) : 0, sim.climb.hg ? +sim.climb.hg.z.toFixed(2) : 0] };
  // ⑦ 턱을 잡고 있던 손에서 시작하는 교차(옆으로 옮겨 가다 손을 넘기는 흔한 순서. 늘어뜨린 손에서 시작할 때와 손목이 가는 길이 다르다 — 작업 중에 영상의 기록에서 이 순서만 막히는 것을 찾았다)
  const fromHeld = [[-1.15, -0.70], [-1.15, -0.62], [-1.05, -0.70], [-1.25, -0.70]].map(([fr, to]) => { start([-0.9, 0, -2.58]); run(220, {}, [hand(1, [-0.85, 1.92, -2.84])]); run(240, {}, [hand(0, [fr, 1.92, -2.84])]); const ok0 = hold(0) && hold(1), k0 = rec.length, o = leg(0, [to, 1.92, -2.84], 300); run(120); return { 자리: `${Math.round(fr * 100)} → ${Math.round(to * 100)}`, 앞_조건: ok0, ...o, 두_손_1초_뒤: HS(), 놓침: slips(k0) }; });
  R['턱을 잡고 있던 손에서 시작하는 교차 네 가지'] = fromHeld;
  // ⑤ 지상 문맥
  start([-0.9, 0, -2.58]); R['땅에 서서(아무것도 잡지 않고) 왼손을 오른쪽 위 턱으로(닿지 않는 거리, 지상 문맥)'] = leg(0, [-0.62, 1.92, -2.84], 200);
  out.cases['20 팔 교차'] = R; const legs = Object.values(R).filter(r => r.줄기_든_걸음 !== undefined), xl = [X1, '  → 왼손을 되돌림', X2, ext].map(k => R[k]);
  check('팔 교차 장면의 앞 조건: 먼저 잡아 둘 손이 네 장면 모두 잡혀 있다', pre.every(Boolean), pre.map(x => (x ? '잡음' : '못 잡음')).join(', '));
  check('정상 팔 교차(서서 15cm 너머): 거부되지 않고 잡으며, 1초 뒤에도 두 손이 그대로이고, 되돌려 잡을 수 있다(잡고 있던 손은 한 번도 놓이지 않는다)', /grab/.test(R[X1].끝) && R[X1].두_손 === 'hold/hold' && R['  1초 뒤'].두_손 === 'hold/hold' && /grab/.test(R['  → 왼손을 되돌림'].끝) && R['  되돌린 뒤 1.5초'].두_손 === 'hold/hold' && !R['  되돌린 뒤 1.5초'].놓침, `${R[X1].끝} → 되돌림 ${R['  → 왼손을 되돌림'].끝} ${R['  되돌린 뒤 1.5초'].놓침}`);
  check('교차·되돌리기·길이 없는 교차·닿지 않는 교차·다 편 교차·지상에서 뻗기의 여섯 구간: 뻗는 팔뚝의 줄기가 제 머리·가슴에 들지 않고, 손목 표면이 1.5cm 넘게 들지 않는다', legs.every(r => r.줄기_든_걸음 === 0 && r.손목_겹침_cm <= 1.5), `줄기가 든 걸음 ${legs.map(r => r.줄기_든_걸음).join(', ')} · 손목 표면 겹침 ${legs.map(r => r.손목_겹침_cm.toFixed(1)).join(', ')}cm`);
  check('팔을 거의 다 편 교차(다른 손 23cm 너머): 잡고, 4초 뒤에도 두 손이 그대로다(머리가 팔에 들어가 놓치지 않는다)', /grab/.test(R[ext].끝) && R['  1초 뒤  '].두_손 === 'hold/hold' && R['  4초 뒤'].두_손 === 'hold/hold', `${R[ext].끝} · 1초 뒤 ${R['  1초 뒤  '].두_손} · 4초 뒤 ${R['  4초 뒤'].두_손} ${R['  4초 뒤'].놓침} · 목·머리가 비킨 각(앞뒤, 좌우) ${R['  4초 뒤'].윗몸_비킴_rad.join(', ')}rad`);
  // p3d-0.8.6: 굵기 기준. 기준 1.6cm = 살이 눌리는 여유 1.2cm(코드의 ARM_SQ) + 멈춤 판정의 여유 0.4cm. 그려진 뼈 자리로 잰다
  check('팔끼리 지나가지 않는다(굵기 기준): 교차·되돌리기·길이 없는 교차·다 편 교차의 네 구간에서 뻗는 팔뚝과 다른 팔(팔뚝·위팔)의 겹침이 1.6cm를 넘는 걸음이 없고, 엇갈려 잡은 채로도 넘지 않는다', xl.every(r => r.굵기_겹침_최대_cm <= 1.6) && [X1, ext].every(k => R[k].잡은_채_굵기_겹침_cm <= 1.6), `뻗는 동안 가장 깊은 겹침 ${xl.map(r => r.굵기_겹침_최대_cm).join(', ')}cm(걸음 ${xl.map(r => r.뻗은_걸음).join(', ')}) · 엇갈려 잡은 채 ${[X1, ext].map(k => R[k].잡은_채_굵기_겹침_cm).join(', ')}cm`);
  check('길이 없으면 이동하는 손이 멈춘다: 팔을 다 편 한 손 매달림에서의 교차는 "다른 팔에 가려 닿지 않음"으로 끝나고, 잡고 있던 손은 그대로이며(놓침·해제 없음), 손목이 한 걸음에 5cm 넘게 건너뛰지 않는다', /다른 팔에 가려/.test(R[X2].끝) && R['  그 뒤 '].두_손 === 'hold/free' && !R['  그 뒤 '].놓침 && xl.every(r => r.손목_한걸음_최대_cm <= 5), `${R[X2].끝} · 두 손 ${R['  그 뒤 '].두_손} ${R['  그 뒤 '].놓침} · 손목이 한 걸음에 간 가장 먼 거리 ${xl.map(r => r.손목_한걸음_최대_cm.toFixed(1)).join(', ')}cm`);
  check('교차 중의 가슴 비틀기는 이어서 변한다: 교차·되돌리기와 그 뒤 1.5초 동안 한 걸음에 0.03rad 넘게 바뀌지 않고(목표가 한꺼번에 바뀌는 크기는 0.18~0.63rad이다 — 건너뛰면 그만큼 나온다), 되돌린 뒤에는 0으로 돌아온다(0.03rad 안)', [R[X1], R['  → 왼손을 되돌림'], R['  되돌린 뒤 1.5초']].every(r => r.비틀기_한걸음_최대 <= 0.03) && Math.abs(R['  되돌린 뒤 1.5초'].비틀기) <= 0.03, `엇갈려 잡은 채 ${R['  1초 뒤'].비틀기}rad · 한 걸음 변화의 최대 ${[R[X1], R['  → 왼손을 되돌림'], R['  되돌린 뒤 1.5초']].map(r => r.비틀기_한걸음_최대.toFixed(4)).join(', ')} · 되돌린 뒤 1.5초 ${R['  되돌린 뒤 1.5초'].비틀기}rad`);
  check('턱을 잡고 있던 손에서 시작하는 교차 네 가지(10~30cm 옆에서 15·23cm 너머로): 모두 잡고 1초 뒤에도 두 손이 그대로이며, 뻗는 동안과 잡은 채의 팔–팔 겹침이 1.6cm를 넘지 않고, 팔뚝의 줄기가 머리·가슴에 들지 않는다', fromHeld.every(r => r.앞_조건 && /grab/.test(r.끝) && r.두_손_1초_뒤 === 'hold/hold' && !r.놓침 && r.굵기_겹침_최대_cm <= 1.6 && r.잡은_채_굵기_겹침_cm <= 1.6 && r.줄기_든_걸음 === 0), fromHeld.map(r => `${r.자리}: ${/grab/.test(r.끝) ? '잡음' : r.끝} 겹침 ${r.굵기_겹침_최대_cm}/${r.잡은_채_굵기_겹침_cm}cm`).join(' · '));
  { const r = R['엇갈려 잡은 채 5초']; check('엇갈려 잡은 채 5초: 두 손이 그대로이고 몸이 5cm 넘게 옮겨 가지 않으며 디딘 발이 떨어지지 않는다', r.두_손 === 'hold/hold' && r.몸이_옮겨_간_가장_먼_거리_cm <= 5 && r.발이_떨어진_횟수 === 0, `몸이 옮겨 간 가장 먼 거리 ${r.몸이_옮겨_간_가장_먼_거리_cm}cm · 발이 떨어진 횟수 ${r.발이_떨어진_횟수} · 목·머리가 비킨 각 ${r.윗몸_비킴_rad.join(', ')}rad`); }
  console.log(`      (자료) 두 팔뚝 줄기 사이: 뻗는 동안 가장 가까이 ${legs.map(r => r.팔뚝_사이_최소_cm).join(', ')}cm · 끝 ${legs.map(r => (/grab/.test(r.끝) ? '잡음' : /reject\(([^)]*)/.exec(r.끝)?.[1] || r.끝)).join(' | ')}`); }

// ── 21. 손 조작 2(누르는 동안 뻗기)에서도 "팔꿈치가 도는 중"이 걸음마다 갱신된다(p3d-0.8.5. 0.8.4는 손 조작 1에서만 갱신했다) ──
// 왼손으로 턱 A를 잡고, 오른손을 누른 채 턱 위·아래의 일곱 곳으로 0.5초마다 옮기며 몸도 위·아래·좌·우로 옮긴다(arm_mesh ③과 같은 입력. 그 가운데 몇 걸음에서 팔뚝이 턱에 걸려 팔꿈치가 먼저 돈다) → 뗀다
{ start([-0.9, 0, -2.58]); run(150, {}, [hand(0, A.L)]); const pts = [[-0.78, 1.55, -3.0], [-0.78, 2.25, -3.0], [-0.95, 1.5, -3.0], [-0.6, 2.3, -3.0], [-0.78, 2.03, -3.0], [-0.5, 1.6, -3.0], [-0.72, 2.06, -3.0]]; let sw = 0, blk = 0, both2 = 0, n = 0;
  for (let k = 0; k < 840; k++) { const p = pts[Math.floor(k / 60) % 7]; run(1, { reach: [null, p], cy: [1, -1, 0, 0][Math.floor(k / 48) % 4], cx: [0, 0, -1, 1][Math.floor(k / 48) % 4] }, k === 0 ? [{ type: 'hand', i: 1, p, hold: true }] : null); const H = sim.climb.hands[1]; if (H.st !== 'reach') continue; n++; if (H.swivel) sw++; if (H.armBlock) blk++; if (H.swivel && !H.armBlock) both2++; }
  run(1, {}, [{ type: 'handUp', i: 1 }]); run(30); const after = sim.climb.hands[1];
  check('손 조작 2: 팔뚝이 걸려 팔꿈치가 도는 걸음에 swivel이 참이 되고(막힘이 아닌 걸음에는 거짓), 손을 거둔 뒤에는 거짓이다', n > 800 && sw > 0 && both2 === 0 && !after.swivel && hold(0), `뻗은 걸음 ${n} · 팔뚝이 걸린 걸음 ${blk} · 그 가운데 팔꿈치가 도는 중 ${sw} · 걸리지 않았는데 참인 걸음 ${both2} · 거둔 뒤 ${after.st}/${!!after.swivel}`); }
// ── 22. 충돌 결과를 나눠 돌려준다(p3d-0.8.6): 한 점이 가슴 상자에 1cm, 다른 팔에는 그보다 깊이(3cm) 겹쳐 있어도 몸통의 겹침이 사라지지 않는다 ──
{ const { _dbg } = await imp('climb.js'), V3 = THREE.Vector3, Q4 = THREE.Quaternion, B = { head: { c: new V3(0, 3, 0), r: 0.11 }, boxes: [{ c: new V3(0, 0, 0), q: new Q4(), qi: new Q4(), h: new V3(0.18, 0.12, 0.105) }], caps: [{ a: new V3(0.2, -0.3, 0.115), b: new V3(0.2, 0.3, 0.115), ra: 0.045, rb: 0.045 }] };
  const p = new V3(0.17, 0, 0.115), h = _dbg.selfHits ? _dbg.selfHits(B, p, 0.02, false, 0.01, 0.04) : (() => { const one = _dbg.selfHit ? _dbg.selfHit(B, p, 0.02) : null; return { body: one && !one.arm ? one : null, arm: one && one.arm ? one : null }; })(); // 0.8.5 소스에는 나눠 돌려주는 함수가 없다(대조용)
  check('충돌 결과 분리: 다른 팔에 더 깊이 겹친 점에서도 몸통의 겹침이 따로 나온다(0.8.5는 더 깊은 하나만 돌려줘 몸통 검사가 가려졌다)', !!h.body && !!h.arm && h.arm.d > h.body.d && h.body.d > 0.005, `몸통 ${h.body ? (h.body.d * 100).toFixed(1) : '없음'}cm · 다른 팔 ${h.arm ? (h.arm.d * 100).toFixed(1) : '없음'}cm`); }
// 힘의 한계(p3d-0.8.4): LOOSE=1이면 p3d-0.8.3까지처럼 섞은 뒤 한계를 다시 걸지 않는다(견주기용). 아래 숫자는 "걸기 전에 넘어 있던" 횟수다
console.log(`기록  힘의 한계: 접촉·걸음 ${FSTAT.n}번 가운데 섞은 뒤 한계를 1N 넘게 넘어 있던 것 ${FSTAT.over}번(가장 큰 넘침 ${FSTAT.max.toFixed(0)}N = 몸무게의 ${(FSTAT.max / (CL.MASS * PHY.G)).toFixed(2)}배) · ${FSTAT.loose ? '한계를 다시 걸지 않음(옛 동작)' : '한계 안으로 되돌림'}`); out.cases['힘의 한계'] = { ...FSTAT };
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
process.exit(fails ? 1 : 0);
