// 기록한 입력(test/short_browser.mjs의 OUT — 자동 이벤트 입력의 걸음마다의 기록)을 계산에서 다시 틀며 **계산 한 걸음(1/120초 몫)의 시간 분포**를 잰다(p3d-0.15.7).
// 그리기 없음 — 화면이 부드러운지를 재는 것이 아니다(그것은 브라우저에서 따로). **기록한 입력의 다시 틀기다(사람 손 아님).** node의 다시 틀기는 브라우저 기록의 재현이 아니다(길이 조금 달라질 수 있다).
// 걸음을 그때의 상태로 나눠 적는다: 지상 / 정지(매달림) / 몸 이동(W·A·D) / 발 옮기기 / 손 뻗기 / 맞잡기(다른 손이 잡은 턱으로 뻗는 중). 겹치면 뒤의 것.
// 같은 입력·같은 설정의 두 판이 같은 계산을 하는지 견주려고 걸음마다의 상태 요약(digest)을 함께 낸다(DUMP=파일이면 걸음마다 한 줄).
// 화면처럼 자세 통계(S.noStat)는 재지 않는다 — 0.15.6까지의 화면은 쟀다(STAT=1이면 잰다. 0.15.6 이전의 소스에는 이 스위치가 없어 늘 잰다).
// 사용: IN=기록.json [REP=3(첫 번은 예열, 나머지를 합침)] [LINK=0|1 PLAN=0|1 GUARD=0|1 FOOT=0|1(기록의 설정 대신)] [SW=스위치,...] [DUMP=파일] [TAG=이름] node test/step_dist.mjs
import { prov, provLine, provOptLine } from './provenance.mjs';
import fs from 'fs'; import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), imp = f => import(pathToFileURL(path.join(HERE, '../src', f)).href);
const E = process.env; for (const k of (E.SW || '').split(',').filter(Boolean)) { const [a, v] = k.split('='); globalThis[a] = v === undefined ? 1 : +v; }
const { buildCharacter } = await imp('rig.js'), { makeGym } = await imp('world.js'), { makeSim } = await imp('sim.js');
const R = JSON.parse(fs.readFileSync(E.IN, 'utf8')); if (R.clip) process.env.MODE = 'clip';
const CLIPS = R.clip ? JSON.parse(fs.readFileSync(path.join(HERE, '../assets_local/clips.json'), 'utf8')) : null;
const pick = (k, d) => (E[k] !== undefined ? E[k] === '1' : !!d), REP = Math.max(1, +(E.REP || 3)), PH = ['지상', '정지(매달림)', '몸 이동(W·A·D)', '발 옮기기', '손 뻗기', '맞잡기'];
const phase = (sim, x) => { const K = sim.climb; if (!K.on) return 0; const rh = K.hands.filter(h => h.st === 'reach');
  if (rh.some(h => { const o = K.hands[1 - h.i]; return o.st === 'hold' && o.edge && h.edge && o.edge.box === h.edge.box; })) return 5;
  if (rh.length) return 4; if (K.feet.some(f => f.st === 'move')) return 3; if ((x.cy || 0) !== 0 || (x.cx || 0) !== 0 || x.jump) return 2; return 1; };
// 걸음마다의 상태 요약: 몸의 자리·빠르기, 손발의 상태와 자리, 전신 자세의 값을 32비트로 접는다(같은 계산이면 같은 값)
const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer); let H = 0;
const mix = v => { f64[0] = v; H = Math.imul(H ^ u32[0], 16777619) >>> 0; H = Math.imul(H ^ u32[1], 16777619) >>> 0; };
const digest = sim => { const b = sim.body, K = sim.climb; for (const v of [b.pos.x, b.pos.y, b.pos.z, b.vel.x, b.vel.y, b.vel.z, b.yaw]) mix(v);
  for (const h of K.hands) { mix(h.st === 'hold' ? 1 : h.st === 'reach' ? 2 : 0); mix(h.w.x); mix(h.w.y); mix(h.w.z); } for (const f of K.feet) { mix(f.st === 'plant' ? 1 : f.st === 'move' ? 2 : 0); mix(f.w ? f.w.x : 0); mix(f.w ? f.w.y : 0); mix(f.w ? f.w.z : 0); }
  if (K.fb && K.fb.x) for (const v of K.fb.x) mix(v); return H; };
function run(keep) { const sim = makeSim(buildCharacter(), makeGym(), CLIPS), o = R.opts; sim.reset({ pos: R.startPos, yaw: R.startYaw }); H = 2166136261; sim.noStat = E.STAT !== '1';
  Object.assign(sim.opt, { posture: 'fb', footAssist: pick('FOOT', o.footAssist), grabAssist: o.grabAssist, poseAssist: o.poseAssist, easy: o.easy, autoBody: o.autoBody, keepHold: !!o.keepHold, press: o.press, wallRest: !!o.wallRest, linkPose: pick('LINK', o.linkPose), planReach: pick('PLAN', o.planReach), autoGuard: pick('GUARD', o.autoGuard) });
  const ms = [], ph = [], dg = []; for (const x of R.inputs) { const p = phase(sim, x), t = performance.now(); sim.step(x); ms.push(performance.now() - t); ph.push(p); if (keep) dg.push(digest(sim)); } return { ms, ph, dg, sim }; }
const first = run(true), runs = REP > 1 ? Array.from({ length: REP - 1 }, () => run(false)) : [first], sim = first.sim;
if (E.DUMP) fs.writeFileSync(E.DUMP, first.dg.map((d, i) => `${i} ${d.toString(16)}`).join('\n') + '\n');
const q = (s, p) => s[Math.min(s.length - 1, Math.floor(p * s.length))], f = (v, n = 2) => v.toFixed(n).padStart(7);
const stat = idx => { const all = []; for (const r of runs) for (const i of idx) all.push(r.ms[i]); if (!all.length) return null; const s = all.sort((a, b) => a - b), sum = s.reduce((a, b) => a + b, 0); return { n: idx.length, mean: sum / s.length, p50: q(s, 0.5), p95: q(s, 0.95), p99: q(s, 0.99), max: s[s.length - 1], over: s.filter(x => x > 8.33).length / s.length, sum: sum / runs.length }; };
console.log(provLine(prov()), '· 기록', path.basename(E.IN), R.version || '', '· 입력', R.inputs.length, '걸음 · 되풀이', runs.length, REP > 1 ? '(예열 1번 뒤)' : '(예열 없음)', E.TAG ? '· ' + E.TAG : '');
console.log(provOptLine(sim)); console.log(`node ${process.version} · 그리기 없음 · 기록한 입력의 다시 틀기(사람 손 아님)`);
const N = R.inputs.length, wall = [...Array(N).keys()].filter(i => first.ph[i] > 0), A = stat(wall);
console.log('구간                 걸음    평균    가운데     95%     99%   가장 긴  8.33ms 넘는 몫  계산 합(ms)');
for (let p = 0; p < PH.length; p++) { const s = stat([...Array(N).keys()].filter(i => first.ph[i] === p)); if (s) console.log(`${PH[p].padEnd(16)} ${String(s.n).padStart(6)} ${f(s.mean)} ${f(s.p50)} ${f(s.p95)} ${f(s.p99)} ${f(s.max, 1)}    ${(100 * s.over).toFixed(1).padStart(5)}%     ${s.sum.toFixed(0).padStart(7)}`); }
// 60fps 화면이면 한 프레임 = 두 걸음(그리기 시간은 빼고). 두 걸음의 합이 16.7ms를 넘는 프레임의 몫과 가장 긴 "두 걸음"
let over = 0, fr = 0, mx2 = 0; for (const r of runs) for (let k = 0; k + 1 < wall.length; k += 2) { const t = r.ms[wall[k]] + r.ms[wall[k + 1]]; fr++; if (t > 16.7) over++; mx2 = Math.max(mx2, t); }
console.log(`벽 전체          ${String(A.n).padStart(6)} ${f(A.mean)} ${f(A.p50)} ${f(A.p95)} ${f(A.p99)} ${f(A.max, 1)}    ${(100 * A.over).toFixed(1).padStart(5)}%     ${A.sum.toFixed(0).padStart(7)}`);
console.log(`[요약] 벽에서 게임 1초의 계산 ${(A.mean * 120).toFixed(0)}ms · 두 걸음(60fps의 한 프레임 몫)이 16.7ms를 넘는 몫 ${(100 * over / fr).toFixed(1)}% · 가장 긴 두 걸음 ${mx2.toFixed(1)}ms · 끝 손 ${sim.climb.hands.map(h => h.st + (h.edge ? '(' + h.edge.box.name + ')' : '')).join(' / ')} · 끝 높이 ${sim.body.pos.y.toFixed(3)} · 상태 요약 ${first.dg[N - 1].toString(16)}`);
