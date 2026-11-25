globalThis.PADBG = !!process.env.PADBG;
// 벽 접촉 점검(W2 첫 판). 스크립트 입력이며 사람 손이 아니다. 성공만 모으지 않고 거부·놓침·떨어짐을 함께 본다.
// 손: 시도 → 잡음/거부 → 유지 → 놓기. 발: 누르는 힘과 마찰로만 버틴다(벽에 붙지 않는다). 놓는 걸음에 속도가 이어지는지, 접촉 오차·관통·거부 까닭을 적는다.
// 사용: node test/wall_check.mjs [결과 JSON]   캡처 동작으로: MODE=clip (assets_local/clips.json이 있을 때)
import { prov, provLine } from './provenance.mjs'; // 실행 출처(p3d-0.10.3) — 소스보다 먼저 불러와 설정 스위치를 켠다
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import * as THREE from 'three';
const __P = prov(); console.log(provLine(__P));
const HERE = path.dirname(fileURLToPath(import.meta.url)), SRC = path.resolve(HERE, '../src'), imp = f => import(pathToFileURL(path.join(SRC, f)).href);
const { buildCharacter, DIM } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js'), { limbState, CL, probeHand, FSTAT } = await imp('climb.js'), { PHY } = await imp('controller.js'), clamp = THREE.MathUtils.clamp;
const CLP = path.resolve(HERE, '../assets_local/clips.json'), useClip = process.env.MODE === 'clip';
if (useClip && !fs.existsSync(CLP)) { console.log('clips.json 없음 → 건너뜀'); process.exit(0); }
const clips = useClip ? JSON.parse(fs.readFileSync(CLP, 'utf8')) : null, rig = buildCharacter(), DT = PHY.DT, G = PHY.G;
for (const k of ['OLDHAND', 'NOSTRETCH', 'OLDPOSE']) globalThis[k] = !!process.env[k]; // p3d-0.8.8 비교 스위치: OLDHAND = 손의 빠르기 곡선과 팔의 복귀를 0.8.7처럼, NOSTRETCH = 뻗을 때의 몸 연결 끔
globalThis.KDBG = !!process.env.KDBG; FSTAT.loose = !!process.env.LOOSE; globalThis.NOOPEN = !!process.env.NOOPEN; globalThis.NOSELF = !!process.env.NOSELF; globalThis.NOARMS = !!process.env.NOARMS; if (process.env.XTW) globalThis.XTW = +process.env.XTW; if (process.env.MW) globalThis.MW = +process.env.MW; if (process.env.XT) globalThis.XT = +process.env.XT; globalThis.NOLEAN = !!process.env.NOLEAN; let sim, rec, fails = 0; const jk = { prev: null, sim: null, d: [], max: 0, what: '', n: 0, minY: 9, minAt: '' };
const out = { note: '스크립트 입력(사람 손 아님). 모션 = ' + (useClip ? '캡처' : '자작'), checks: [], cases: {} };
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`); out.checks.push({ name, ok, detail }); if (!ok) fails++; };
// p3d-0.10.3(GPT의 0.10.2 검토 5번): 옛 몸 치수에 묶인 숫자 기대는 새 몸에서 "이력"으로 옮긴다(결과는 그대로 적고 실패로 세지 않는다). 그 요구는 새 몸의 실제 경계에서 대체 시험(아래 '새 몸 경계')으로 지킨다. 옛 몸에서는 그대로 시험이다
const OLDBODY = process.env.BODY === 'old', histOrCheck = (name, ok, detail = '') => { if (OLDBODY) return check(name, ok, detail); console.log(`이력  ${name} — 새 몸에서는 이력(옛 몸 치수의 숫자 기대. 대체 시험: 새 몸 경계) — ${ok ? '통과' : '실패'} ${detail}`); out.checks.push({ name, ok, detail, 이력: true }); };
const start = (pos, yaw = Math.PI, extra = []) => { const w = makeWorld(); for (const [name, min, max] of extra) w.boxes.push({ name, min: new THREE.Vector3(...min), max: new THREE.Vector3(...max), kind: 'block' }); sim = makeSim(rig, w, clips); if (process.env.VARIANT) sim.opt.posture = process.env.VARIANT; sim.reset({ pos, yaw }); rec = []; run(30); };
function run(n, inp = {}, cmd = null) {
  for (let i = 0; i < n; i++) {
    const v0 = sim.body.vel.clone(), on0 = sim.climb.on;
    sim.step({ mx: 0, mz: 0, ...inp, cmd: i === 0 && cmd ? cmd : [] });
    rec.push({ k: sim.tick, pos: sim.body.pos.clone(), vel: sim.body.vel.clone(), dv: sim.body.vel.clone().sub(v0), on: sim.climb.on, on0, ev: sim.climb.events.slice(), bev: sim.body.events.map(e => e.type) });
    if (process.env.TRACE) for (const e of sim.climb.events) if (e.type !== 'try') console.log(`      ${e.t.toFixed(2)}초 ${e.type} ${e.name} ${e.box || ''} ${e.why}`);
    if (!rig.list.every(b => Number.isFinite(b.quaternion.x) && Number.isFinite(b.position.y))) { const K = sim.climb, f3 = v => v ? [v.x, v.y, v.z].map(q => (+q).toFixed(3)).join(',') : '-'; console.log('NaN 뼈', rig.list.filter(b => !Number.isFinite(b.quaternion.x) || !Number.isFinite(b.position.y)).map(b => b.name).join(' '), '몸', f3(sim.body.pos), 'vel', f3(sim.body.vel), 'ref', f3(K.ref), 'fb', K.fb && K.fb.x ? Array.from(K.fb.x).map(v => v.toFixed(2)).join(',') : '-', '발', K.feet.map(f => f.st + ' p ' + f3(f.p) + ' ank ' + f3(f.ank) + ' goal ' + f3(f.goal)).join(' / '), 'hj', K.T ? K.T.hj.map(f3).join(' / ') : '-'); throw new Error('자세 값이 깨짐 @' + sim.tick); }
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

// ── 자세 보조 탐침: 가장 높은 턱(턱 C)을 두 손으로 잡고 발을 높이 올리기(사용자 영상 v2 24~31초·44초 "거부 왼발 · 다리가 그렇게는 올라가지 않음"). 스크립트 입력이며 사람 손이 아니다 ──
// 턱 C까지: 왼손 턱 A·왼발 낮은 발판·W → 오른손 턱 F → 왼손 턱 F → W → 벽에서 뛰며 두 손을 턱 C로. PA=1이면 자세 보조 켬
{ const AL = [-0.72, 1.92, -2.84], LOW = [-0.45, 0.5, -2.93], ev0 = () => evs().filter(e => e.type !== 'try').map(e => e.type + '(' + (e.name || '') + ' ' + (e.why || '') + ')').slice(-6).join(' | ');
  const st = () => { const K = sim.climb, T = K.T; return `몸 ${sim.body.pos.toArray().map(v => v.toFixed(2)).join(',')} 고관절 y ${T ? T.hj[0].y.toFixed(2) : '-'} 손 ${L().hands.map(h => h.st + (h.box ? ':' + h.box : '')).join('/')} 발 ${L().feet.map(f => f.st + (f.box ? ':' + f.box : '')).join('/')} out ${typeof K.wout === "number" ? K.wout.toFixed(2) : "-"}`; };
  start([-0.62, 0, -2.58]); sim.opt.poseAssist = !!process.env.PA; sim.opt.grabAssist = true; run(60); run(150, {}, [hand(0, AL)]); run(260, {}, [foot(0, LOW)]); run(60, { cy: 1 }); run(260, { cy: 1 }, [hand(1, [-0.25, 2.15, -2.86])]); run(260, { cy: 1 }, [hand(0, [-0.40, 2.15, -2.86])]); run(120, { cy: 1 });
  console.log('턱 F 두 손:', st());
  run(1, { jump: true, cy: 1 }, []); run(8, { jump: true, cy: 1 }); run(1, { jump: true }, [hand(0, [-0.55, 2.82, -2.86]), hand(1, [-0.15, 2.82, -2.86])]); run(50, { jump: true }); run(300);
  console.log('턱 C로 뛰기:', st(), '·', ev0());
  if (L().hands.every(h => h.st === 'hold' && h.box === '턱 C')) { const k0 = rec.length, hy = sim.climb.T.hj[0].y;
    for (const [nm, cmd] of [['오른발 벽면', foot(1, [-0.15, hy - 0.55, -3.0])], ['왼발 턱 F 윗면', foot(0, [-0.40, 2.15, -2.93])], ['왼발 턱 A 윗면', foot(0, [-0.70, 1.92, -2.92])], ['W로 당겨 오른 채 왼발 턱 A 윗면', foot(0, [-0.70, 1.92, -2.92]), 1]]) { const k1 = rec.length; if (cmd === undefined) continue; const up = nm.startsWith('W'); if (up) run(90, { cy: 1 }); run(300, up ? { cy: 1 } : {}, [cmd]); console.log(`${nm}: ${evs(k1).filter(e => e.type !== 'try').map(e => e.type + '(' + (e.why || '') + ')').join(' | ')} · ${st()}`); } }
}
