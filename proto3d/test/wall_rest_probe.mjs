// 벽 딛기(J) 탐침(p3d-0.12.3): 턱 B에 두 손으로 매달려 벽 딛기를 켠 뒤 4초 동안 몸 자리·발 하중·기준 자리를 적는다. wall_check.mjs의 앞부분(준비 함수)을 그대로 쓴다. 스크립트 입력(사람 손 아님).
// 사용: [POSEASSIST=1] [MODE=clip] POSTURE=fb node test/wall_rest_probe.mjs   촘촘히: EV=6 K0=100 K1=200
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
const hangB = () => { start([0.7, 0, -2.65]); jumpGrab(0, 400); };
{ hangB(); sim.opt.wallRest = true; for (let k = 0; k < 480; k++) { run(1); if ((k + 1) % +(process.env.EV || 40) === 0 && (k + 1) >= +(process.env.K0 || 0) && (k + 1) <= +(process.env.K1 || 9999)) { const K = sim.climb, f = L().feet, h = L().hands; rig.root.updateMatrixWorld(true); const hd = rig.bones.head.getWorldPosition(new THREE.Vector3());
  console.log(((k + 1) / 120).toFixed(2), '몸', sim.body.pos.toArray().map(v => v.toFixed(2)).join(','), '속도', speed().toFixed(3), '발', f.map(x => x.st[0] + (x.kind || '-') + ' ' + (x.loadS || 0).toFixed(2)).join('/'), '손', h.map(x => x.st[0] + ' ' + (x.loadS || 0).toFixed(2)).join('/'), '머리', hd.toArray().map(v => v.toFixed(2)).join(','), 'look', K.pz.lookP.toFixed(2), 'ref', K.ref.toArray().map(v => v.toFixed(2)).join(','), 'hg', K.hg ? K.hg.x.toFixed(2) + ',' + K.hg.z.toFixed(2) : '-', 'hc', (K.hc || 0).toFixed(2), 'Thead', K.T.head.toArray().map(v => v.toFixed(2)).join(','), 'fbPC', K.fb && K.fb.x ? K.fb.x[7].toFixed(2) : '-', 'acc', K.accS ? K.accS.toArray().map(v => v.toFixed(1)).join(',') : '-', 'wout', (K.wout || 0).toFixed(2), '청', (K.clearNeed || 0).toFixed(2), evs().slice(-2).map(e => e.type + ':' + (e.why || '')).join('|')); } } }
