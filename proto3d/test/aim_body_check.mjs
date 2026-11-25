// 윗몸이 겨눈 곳을 따라가는 규칙(p3d-0.12.4)이 잡기의 결과를 바꾸는지 잰다. 스크립트 입력이며 사람 손이 아니다.
// 장면: 왼손 턱 A + 왼발 낮은 발판 → W를 0.1~1.0초 눌러 몸 높이를 바꾼 뒤(닿는 경계를 지나가게) 1초 동안 목표를 겨누기만 하고 → 오른손을 그 목표로 보낸다. 겨눈 곳(look)은 걸음마다 넘긴다(실제 플레이처럼).
// 규칙 켬/끔(OLDAIMBODY)을 같은 입력으로 돌려 ① 누르기 직전의 미리보기(닿음·모자란 거리) ② 결과(잡음/거부와 까닭) ③ 누르기 직전의 몸 기준 자리를 견준다.
// 사용: [MODE=clip] node test/aim_body_check.mjs
import { prov, provLine } from './provenance.mjs';
import fs from 'fs'; import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';
console.log(provLine(prov()));
const HERE = path.dirname(fileURLToPath(import.meta.url)), imp = f => import(pathToFileURL(path.join(HERE, '../src', f)).href);
const { buildCharacter } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js'), { probeHand } = await imp('climb.js');
const CLIPS = process.env.MODE === 'clip' ? JSON.parse(fs.readFileSync(path.join(HERE, '../assets_local/clips.json'), 'utf8')) : null, rig = buildCharacter();
const { START, F, AL, AR, LOW } = await import('./scenes_foot.mjs'), TARGETS = [['턱 F', F], ['턱 F 오른쪽', [F[0] + 0.12, F[1], F[2]]], ['턱 A 오른쪽 끝', AR]];
function once(off, wN, T) {
  globalThis.OLDAIMBODY = off; const sim = makeSim(rig, makeWorld(), CLIPS); sim.reset({ pos: START, yaw: Math.PI }); sim.opt.wallRest = false; sim.opt.footAssist = false; sim.opt.grabAssist = true; sim.opt.poseAssist = true; sim.opt.posture = 'fb';
  const ev = [], step = (inp = {}, cmd = []) => { sim.step({ mx: 0, mz: 0, cxSign: 1, look: T, ...inp, cmd }); for (const e of sim.climb.events) if (e.type !== 'try') ev.push(e); }, rep = (n, inp, cmd) => { for (let i = 0; i < n; i++) step(inp, i ? [] : cmd); };
  rep(60); rep(150, {}, [{ type: 'hand', i: 0, p: AL }]); rep(260, {}, [{ type: 'foot', i: 0, p: LOW }]); rep(wN, { cy: 1 }); rep(120);
  const pr = probeHand(sim, 1, new (rig.bones.hips.position.constructor)(...T)), pos = sim.body.pos.clone(), aim = sim.climb.aim ? sim.climb.aim.y : 0, n0 = ev.length;
  rep(300, {}, [{ type: 'hand', i: 1, p: T }]); const res = ev.slice(n0).filter(e => e.name && /오른손/.test(e.name) && /grab|reject|deny/.test(e.type)).pop(), H = sim.climb.hands[1];
  if (process.env.DEBUG) console.log(`   ${off ? '끔' : '켬'} W ${wN}: ` + ev.map(e => `${e.type}(${e.name || ''} ${e.why || ''})`).join(' | ').slice(0, 600) + ` · 누르기 직전 몸 ${pos.toArray().map(v => v.toFixed(2))}`);
  return { ok: pr.ok, short: pr.short || 0, why: pr.why || '', pos, aim, out: H.st === 'hold' ? '잡음' : (res ? res.type + ': ' + (res.why || '') : H.st) };
}
let diffOut = 0, diffPrev = 0, maxShort = 0, maxPos = 0, n = 0;
for (const [name, T] of TARGETS.filter(t => !process.env.ONLY || t[0] === process.env.ONLY)) for (const wN of (process.env.WN ? process.env.WN.split(',').map(Number) : [12, 24, 36, 48, 60, 84, 108, 132])) { const a = once(true, wN, T), b = once(false, wN, T); n++;
  const dS = Math.abs(a.short - b.short), dP = a.pos.distanceTo(b.pos); maxShort = Math.max(maxShort, dS); maxPos = Math.max(maxPos, dP); const dO = a.out.replace(/[0-9.]+cm/g, '') !== b.out.replace(/[0-9.]+cm/g, ''), dV = a.ok !== b.ok; if (dO) diffOut++; if (dV) diffPrev++;
  console.log(`${dO || dV ? '다름' : '같음'}  ${name} · W ${(wN / 120).toFixed(2)}초 · 끔: 미리보기 ${a.ok ? '닿음' : a.why} → ${a.out} | 켬(가슴 바람 ${(b.aim * 57.3).toFixed(0)}°): 미리보기 ${b.ok ? '닿음' : b.why} → ${b.out} · 모자란 거리 차 ${(dS * 100).toFixed(1)}cm · 몸 자리 차 ${(dP * 100).toFixed(1)}cm`); }
console.log(`장면 ${n}개 · 결과가 다른 장면 ${diffOut} · 미리보기의 닿음/안 닿음이 다른 장면 ${diffPrev} · 미리보기의 모자란 거리 차 최대 ${(maxShort * 100).toFixed(1)}cm · 누르기 직전의 몸 기준 자리 차 최대 ${(maxPos * 100).toFixed(1)}cm`);
