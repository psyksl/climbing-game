// 자세 보조 탐침: 다른 벽 시험 지형에서 벽 A → 벽 B의 턱 B1(corner_check의 첫 장면 앞부분). 스크립트 입력이며 사람 손이 아니다. PA=1이면 자세 보조 켬
import { prov, provLine } from './provenance.mjs';
import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';
console.log(provLine(prov()));
const HERE = path.dirname(fileURLToPath(import.meta.url)), imp = f => import(pathToFileURL(path.join(HERE, '../src', f)).href);
const { buildCharacter } = await imp('rig.js'), { makeFixtureWorld } = await imp('world.js'), { makeSim } = await imp('sim.js');
const rig = buildCharacter(), sim = makeSim(rig, makeFixtureWorld(), null); sim.reset({ pos: [-0.45, 0, -2.58], yaw: Math.PI }); sim.opt.wallRest = false; sim.opt.footAssist = false; sim.opt.poseAssist = !!process.env.PA; if (process.env.POSTURE) sim.opt.posture = process.env.POSTURE;
const hand = (i, p) => ({ type: 'hand', i, p }), foot = (i, p) => ({ type: 'foot', i, p });
const plan = [['h', 0, [-0.55, 1.92, -2.84]], ['h', 1, [-0.15, 1.92, -2.84]], ['f', 1, [-0.6, 0.5, -2.93]], ['w', 60], ['h', 1, [0.01, 1.91, -2.92]], ['d', 90, 1], ['n', 30], ['h', 1, [0.17, 1.91, -3.12]], ['n', 60]];
for (const [what, a, b] of plan) { const cmd = what === 'h' ? [hand(a, b)] : what === 'f' ? [foot(a, b)] : [], N = what === 'h' ? 180 : what === 'f' ? 260 : a, inp = what === 'w' ? { cy: 1 } : what === 'd' ? { cx: b } : {}, ev = [];
  for (let i = 0; i < N; i++) { sim.step({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd: i ? [] : cmd }); for (const e of sim.climb.events) if (e.type !== 'try') ev.push(`${e.type}(${e.name || ''} ${e.why || ''})`); }
  const K = sim.climb; console.log(`${what} ${what === 'h' || what === 'f' ? (a ? '오른' : '왼') + ' ' + JSON.stringify(b) : a} → 손 ${K.hands.map(h => h.st).join('/')} 발 ${K.feet.map(f => f.st).join('/')} 몸 ${sim.body.pos.toArray().map(v => v.toFixed(2)).join(',')} 방향 ${(sim.body.yaw * 57.3).toFixed(0)}° 뺌 ${typeof K.wout === 'number' ? K.wout.toFixed(2) : '-'} · ${ev.join(' | ').slice(0, 220)}`); }
