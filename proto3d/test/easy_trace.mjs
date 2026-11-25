// 쉬운 조작(예약·자동 몸 맞추기)의 한 가지 흔들기를 걸음마다 따라가 본다(route_tolerance.mjs와 같은 조준 방식).
// 사용: [MODE=clip] [EASY=1] [AIMSNAP=1] SI=3 GI=3 CI=0 OFF=0.15,0 [EVERY=20] node test/easy_trace.mjs
import fs from 'fs'; import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), imp = f => import(pathToFileURL(path.join(HERE, '../src', f)).href);
const { buildCharacter } = await imp('rig.js'), { makeWorld, rayHit } = await imp('world.js'), { makeSim } = await imp('sim.js'), { limbState, aimGrip, probeHand } = await imp('climb.js'), THREE = await import('three'), { ROUTE, ROUTE_START } = await import('./route_steps.mjs');
const CLIPS = process.env.MODE === 'clip' ? JSON.parse(fs.readFileSync(path.join(HERE, '../assets_local/clips.json'), 'utf8')) : null, rig = buildCharacter();
const SI = +(process.env.SI || 3) - 1, GI = +(process.env.GI || 0), CI = +(process.env.CI || 0), OFF = (process.env.OFF || '0,0').split(',').map(Number), EVERY = +(process.env.EVERY || 20), SNAP = process.env.AIMSNAP === '1', V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const sim = makeSim(rig, makeWorld(), CLIPS); sim.reset({ pos: ROUTE_START, yaw: Math.PI }); Object.assign(sim.opt, { wallRest: false, footAssist: true, grabAssist: true, poseAssist: true, posture: 'fb', easy: process.env.EASY === '1' });
let look = null, tp = null, ti = 0;
for (let si = 0; si <= SI; si++) for (let gi = 0; gi < ROUTE[si][1].length; gi++) { const [n, inp = {}, cmd = []] = ROUTE[si][1][gi];
  const cmd1 = cmd.map((c, ci) => { if (!(si === SI && gi === GI && ci === CI) || !c.p) return c; const b = sim.body.pos, o = V3(b.x + 0.88, b.y + 1.73, b.z + 3.46), q = V3(c.p[0] + OFF[0], c.p[1] + OFF[1], c.p[2]), d = q.clone().sub(o).normalize(), far = o.clone().addScaledVector(d, 40), t = rayHit(sim.world, o, far), hit = t < 1 ? o.clone().lerp(far, t) : null, g = SNAP ? aimGrip(sim.world, o, d, hit) : null, p = g ? g.p : hit; tp = p ? p.toArray() : [0, -99, 0]; ti = c.i; console.log(`겨눈 자리 ${tp.map(v => v.toFixed(3))} (원래 ${c.p})`); return { ...c, p: tp }; });
  for (const c of cmd1) if (c.p) look = c.p;
  for (let i = 0; i < n; i++) { sim.step({ mx: 0, mz: 0, cxSign: 1, ...(look ? { look } : {}), ...inp, cmd: i ? [] : cmd1 });
    if (si === SI) { for (const e of sim.climb.events) console.log(`  [${gi}:${i}] ${e.type} ${e.name || ''} ${e.why || ''}`);
      if (tp && gi >= GI && i % EVERY === 0) { const L = limbState(sim.climb), H = L.hands[ti], pr = probeHand(sim, ti, V3(...tp)), b = sim.body.pos; console.log(`${gi}:${String(i).padStart(3)} 몸 ${b.x.toFixed(3)},${b.y.toFixed(3)},${b.z.toFixed(3)} 빠르기 ${sim.body.vel.length().toFixed(2)} 손 ${H.st}${H.box ? '(' + H.box + ')' : ''} 미리보기 ${pr.ok ? '됨' : pr.why}${H.arm ? ' 예약 ' + H.arm.t.toFixed(2) + (H.arm.auto ? ' 자동' : '') : ''}`); } } } }
