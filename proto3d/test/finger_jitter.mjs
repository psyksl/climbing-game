// 손가락 떨림(자세 정리 ⑪, p3d-0.11.7). 스크립트 입력(사람 손 아님). 기준은 개발 쪽 진단선.
// 마네킹 손가락 뼈(01·02·03)의 지역 회전을 계산 걸음마다 재서, 0.1초 창(12걸음) 안에 오간 길(각 걸음 회전량의 합)이 3°를 넘으면서 창의 처음과 끝 사이 회전이 그 길의 1/3보다 작으면 "떨림"으로 센다(무릎 0.1초 왕복 검사와 같은 생각).
// 손의 상태(잡음·뻗음·놓임)별로 나눠 센다. 진행 중의 상태를 보고 입력을 정하는 장면(C)도 실제로 돌린다(걸음마다 바로 진행).
// 사용: node test/finger_jitter.mjs [JSON]   캡처 동작: MODE=clip   장면: ONLY=h1,C
import { prov, provLine } from './provenance.mjs';
import fs from 'fs'; import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';
const __P = prov(); console.log(provLine(__P));
const HERE = path.dirname(fileURLToPath(import.meta.url)), SRC = process.env.SRC ? path.resolve(process.env.SRC) : path.resolve(HERE, '../src'), imp = f => import(pathToFileURL(path.join(SRC, f)).href);
const THREE = await import('three');
const { buildCharacter } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js'), { buildHuman, makeRetarget } = await imp('human.js');
const SC = await import('./scenes_foot.mjs');
const clips = process.env.MODE === 'clip' ? JSON.parse(fs.readFileSync(path.resolve(HERE, '../assets_local/clips.json'), 'utf8')) : null;
const pick = (arr, pre) => (arr || []).map((s, i) => [pre ? pre + (i + 1) : s[0].split(' ')[0], ...s]);
const all = [...pick(SC.SCENES_FOOT, 'foot'), ...pick(SC.SCENES, 'reach'), ...pick(SC.SCENES_H), ...pick(SC.SCENES_V115), ...pick(SC.SCENES_U), ...pick(SC.SCENES_J), ...pick(SC.SCENES_GW)].filter(s => !process.env.ONLY || process.env.ONLY.split(',').includes(s[0]));
const rig = buildCharacter(), H = buildHuman(), R = makeRetarget(rig, H), deg = 180 / Math.PI, W = 12;
const FING = ['index', 'middle', 'ring', 'pinky', 'thumb'].flatMap(f => ['01', '02', '03'].flatMap(k => ['l', 'r'].map(s => `${f}_${k}_${s}`))).filter(n => H.bones[n]);
const out = { scenes: {} }, TOT = { hold: 0, reach: 0, free: 0 }; let worst = { v: 0, at: '' };
for (const [id, title, fn, assist, , st0] of all) {
  const world = makeWorld(), sim = makeSim(rig, world, clips); sim.reset({ pos: st0 || SC.START, yaw: Math.PI }); sim.opt.wallRest = false; sim.opt.footAssist = !!assist; sim.opt.posture = process.env.VARIANT || 'fb'; sim.opt.grabAssist = !process.env.NOASSIST;
  const hist = Object.fromEntries(FING.map(n => [n, []])), cnt = { hold: 0, reach: 0, free: 0 }; let mx = { v: 0, at: '' }, k = -1;
  const measure = inp => { sim.step(inp); k++; R.apply(sim.fing, sim.pron, sim.climb, world, sim.gw); H.root.updateMatrixWorld(true);
    const seen = new Set();
    for (const n of FING) { const q = H.bones[n].quaternion.clone(), h = hist[n]; h.push(q); if (h.length > W + 1) h.shift(); if (h.length < W + 1) continue;
      let path = 0; for (let i = 1; i < h.length; i++) path += 2 * Math.acos(Math.min(1, Math.abs(h[i].dot(h[i - 1]))));
      const net = 2 * Math.acos(Math.min(1, Math.abs(h[0].dot(h[h.length - 1]))));
      if (path * deg > 3 && net < path / 3) { const side = n.endsWith('_l') ? 0 : 1, key = `${side}`; if (seen.has(key)) continue; seen.add(key); const st = sim.climb.on ? sim.climb.hands[side].st : 'ground'; const s2 = st === 'hold' ? 'hold' : st === 'reach' ? 'reach' : 'free'; cnt[s2]++;
        if (path * deg > mx.v) mx = { v: path * deg, at: `${((k + 1) / 120).toFixed(3)}초 ${n} ${st} 오간 길 ${(path * deg).toFixed(1)}° 순 ${(net * deg).toFixed(1)}°` }; } } };
  const put = (inp = {}, cmd = []) => measure({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd }), rep = (n, inp, cmd) => { for (let i = 0; i < n; i++) put(inp, i ? [] : cmd); }; fn(sim, put, rep);
  for (const s of ['hold', 'reach', 'free']) TOT[s] += cnt[s]; if (mx.v > worst.v) worst = { v: mx.v, at: `${id} ${mx.at}` };
  out.scenes[id] = { 제목: title, 걸음: k + 1, 떨림_손걸음: cnt, 가장_큰: mx.at };
  if (cnt.hold + cnt.reach + cnt.free) console.log(`■ ${id.padEnd(6)} 잡음 ${cnt.hold} · 뻗음 ${cnt.reach} · 놓임/땅 ${cnt.free} — 가장 큰 ${mx.at}`);
}
console.log(`\n합계(장면 ${all.length}개): 떨리는 손-걸음 — 잡음 ${TOT.hold} · 뻗음 ${TOT.reach} · 놓임/땅 ${TOT.free}. 가장 큰: ${worst.at}`);
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ 실행_출처: __P, ...out, 합계: TOT, 가장_큰: worst.at }, null, 1));
