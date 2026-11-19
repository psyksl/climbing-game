// 지지 구간 측정이 실제 미끄러짐을 잡는지 확인한다: 걷는 중 디딘 자리를 일부러 5mm 옮기면 최대 이탈이 5mm로 나와야 한다.
// 사용: node test/stance_measure_sanity.mjs
import * as THREE from 'three';
import { buildCharacter } from '../src/rig.js';
import { makeWorld } from '../src/world.js';
import { makeSim } from '../src/sim.js';
const sim = makeSim(buildCharacter(), makeWorld()); sim.reset({ pos: [-10, 0, 8], yaw: Math.PI / 2 });
let bumped = false;
for (let i = 0; i < 360; i++) { sim.step({ mx: 1, mz: 0 }); const L = sim.motion.legs[0]; if (!bumped && i > 150 && L.mode === 'plant' && L.stance && L.stance.n > 5) { L.plant.x += 0.005; bumped = true; } }
const d = sim.motion.stats.stanceMaxDev * 1000, ok = Math.abs(d - 5) < 0.2;
console.log(`${ok ? 'PASS' : 'FAIL'}  디딘 자리를 5mm 옮기면 지지 구간 최대 이탈이 5mm로 잡힌다: ${d.toFixed(2)}mm`); process.exit(ok ? 0 : 1);
