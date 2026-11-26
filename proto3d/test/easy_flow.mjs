// 쉬운 조작의 흐름 하나: 5단계에서 W를 누르기 전에 턱 B를 먼저 누른다(끔 = 뻗다 거부되고 손이 떨어져 있음, 켬 = 자동 몸 맞추기로 잡음). 사용: EASY=0|1 [WN=걸음] node test/easy_flow.mjs (캡처 동작)
import './provenance.mjs'; import fs from 'fs'; import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), imp = f => import(pathToFileURL(path.join(HERE, '../src', f)).href);
const { buildCharacter } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js'), { limbState } = await imp('climb.js'), { ROUTE, ROUTE_START, hand, foot } = await import('./route_steps.mjs');
const CLIPS = JSON.parse(fs.readFileSync(path.join(HERE, '../assets_local/clips.json'), 'utf8')), sim = makeSim(buildCharacter(), makeWorld(), CLIPS);
sim.reset({ pos: ROUTE_START, yaw: Math.PI }); Object.assign(sim.opt, { wallRest: false, footAssist: true, grabAssist: true, poseAssist: true, posture: 'fb', easy: process.env.EASY === '1' });
const R = ROUTE.slice(0, 4).concat([['먼저 누르고 W', [[240, {}, [foot(1, [-0.18, 0.5, -2.93])]], [96, {}, [hand(1, [0.26, 2.32, -2.86])]], [+(process.env.WN || 150), { cy: 1 }], [240]]]]);
let k = 0, look = null; R.forEach(([name, segs], si) => { for (const [n, inp = {}, cmd = []] of segs) { for (const c of cmd) if (c.p) look = c.p; for (let i = 0; i < n; i++) { sim.step({ mx: 0, mz: 0, cxSign: 1, ...(look ? { look } : {}), ...inp, cmd: i ? [] : cmd }); k++; if (si === 4) for (const e of sim.climb.events) if (e.type !== 'try' && e.type !== 'bump') console.log(`  ${(k / 120).toFixed(2)} ${e.type} ${e.name || ''} ${e.why || ''}`); } } });
const L = limbState(sim.climb); console.log('끝:', L.hands.map(h => h.st + (h.box ? ':' + h.box : '')).join(' / '));
