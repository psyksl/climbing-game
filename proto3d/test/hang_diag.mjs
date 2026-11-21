import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import * as THREE from 'three';
const HERE = path.dirname(fileURLToPath(import.meta.url)), SRC = path.resolve(HERE, '../src'), imp = f => import(pathToFileURL(path.join(SRC, f)).href);
const { buildCharacter, DIM } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js'), { limbState, CL, probeHand, FSTAT } = await imp('climb.js'), { PHY } = await imp('controller.js'), clamp = THREE.MathUtils.clamp;
const CLP = path.resolve(HERE, '../assets_local/clips.json'), useClip = process.env.MODE === 'clip';
if (useClip && !fs.existsSync(CLP)) { console.log('clips.json 없음 → 건너뜀'); process.exit(0); }
const clips = useClip ? JSON.parse(fs.readFileSync(CLP, 'utf8')) : null, rig = buildCharacter(), DT = PHY.DT, G = PHY.G;
// 매달림 진단(p3d-0.8.4, GPT의 p3d-0.8.3 검토): 통과·실패가 없다. 스크립트 입력이며 사람 손이 아니다.
//   ① 무입력 매달림(뛰어 두 손으로 턱 B) ② 잡은 직후의 충격 ③ 일부러 흔든 뒤 놓아 둠 — 을 나눠 시간 흐름으로 적는다(0.5초 창: 속도의 가장 큰 값, 좌우·위아래·앞뒤 진폭, 손이 당기는 힘과 편 팔로 버티는 몫의 가장 큰 값)
//   사용: node test/hang_diag.mjs [결과 JSON]   캡처 동작: MODE=clip
let sim; const start = pos => { sim = makeSim(rig, makeWorld(), clips); sim.reset({ pos, yaw: Math.PI }); run(30); };
function run(n, inp = {}, cmd = null, log = null) { for (let i = 0; i < n; i++) { sim.step({ mx: 0, mz: 0, ...inp, cmd: i === 0 && cmd ? cmd : [] }); if (log) log(); } }
const hand = (i, p) => ({ type: 'hand', i, p }), B = { L: [0.5, 2.32, -2.86], R: [0.9, 2.32, -2.86] }, Lm = () => limbState(sim.climb);
const windows = (sec, inp = {}) => { const rows = []; for (let w = 0; w < sec * 2; w++) { let vmax = 0; const lo = [9, 9, 9], hi = [-9, -9, -9], ld = [0, 0], pa = [0, 0]; let pz = [9, -9]; run(60, inp, null, () => { const b = sim.body, p = b.pos.toArray(); vmax = Math.max(vmax, b.vel.length()); p.forEach((v, k) => { lo[k] = Math.min(lo[k], v); hi[k] = Math.max(hi[k], v); }); const h = Lm().hands; ld[0] = Math.max(ld[0], h[0].act); ld[1] = Math.max(ld[1], h[1].act); pa[0] = Math.max(pa[0], h[0].pas); pa[1] = Math.max(pa[1], h[1].pas); const z = sim.climb.pz || 0; pz = [Math.min(pz[0], z), Math.max(pz[1], z)]; });
  rows.push({ t: +((w + 1) * 0.5).toFixed(1), '가장 큰 속도_m/s': +vmax.toFixed(3), '진폭_cm(좌우·위아래·앞뒤)': lo.map((v, k) => +((hi[k] - v) * 50).toFixed(2)), '손 하중 최대': ld.map(v => +v.toFixed(2)), '편 팔 버팀 최대': pa.map(v => +v.toFixed(2)), '몸의 층 pz 폭_cm': +((pz[1] - pz[0]) * 100).toFixed(2), 발: Lm().feet.map(f => f.st).join('/') }); } return rows; };
const out = { note: '스크립트 입력(사람 손 아님). 모션 = ' + (useClip ? '캡처' : '자작') };
start([0.7, 0, -2.65]); run(1, { jump: true }, [hand(0, B.L), hand(1, B.R)]); run(59, { jump: true });
out['① 뛰어 잡은 뒤 무입력 8초'] = windows(8);
{ const vx = []; for (let k = 0; k < 240; k++) { const v = sim.body.vel.x; run(1, { cxSign: 1, cx: v > 0.003 ? 1 : v < -0.003 ? -1 : 1 }); } out['③ 제때 흔들기 2초 뒤 무입력 8초'] = windows(8, { cxSign: 1 }); }
for (const [k, rows] of Object.entries(out)) { if (!Array.isArray(rows)) continue; console.log(`── ${k}`); for (const r of rows) console.log(`  ${String(r.t).padStart(4)}초  속도 ${r['가장 큰 속도_m/s'].toFixed(3)}  진폭 ${r['진폭_cm(좌우·위아래·앞뒤)'].map(v => v.toFixed(2)).join(' · ')}cm  당김 ${r['손 하중 최대'].join(' + ')} · 편 팔 버팀 ${r['편 팔 버팀 최대'].join(' + ')}  발 ${r.발}`); }
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
