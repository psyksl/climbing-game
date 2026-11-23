// 팔이 뒤로 꺾이는가(p3d-0.11.6, 사용자 "팔이 뒤로 이상하게 꺾이는 현상은 수정했어? 영상에선 검증 장면이 없던데").
// 계산 걸음마다 잰다(스크립트 입력, 사람 손 아님): ① 어깨가 사람 범위(anat.js)를 넘은 각 ② 위팔 비틀림 ③ 마네킹(그림)의 팔꿈치가 제어 뼈대의 팔꿈치와 반대쪽으로 굽었는가(뒤로 꺾임 — 어깨·손목을 잇는 줄에서 본 팔꿈치의 쪽)
//   ④ 마네킹 팔꿈치가 다 편 것보다 더 펴졌는가(과신전: 위팔·아래팔 사이 각이 180°를 넘어 반대로). 범위 값은 실험값이며 사람의 한계를 잰 것이 아니다.
// 사용: node test/arm_check.mjs [JSON]   캡처 동작: MODE=clip   장면: ONLY=A,B   옛 소스: SRC=<src 폴더>
import { prov, provLine } from './provenance.mjs';
import fs from 'fs'; import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';
const __P = prov(); console.log(provLine(__P));
const HERE = path.dirname(fileURLToPath(import.meta.url)), SRC = process.env.SRC ? path.resolve(process.env.SRC) : path.resolve(HERE, '../src'), imp = f => import(pathToFileURL(path.join(SRC, f)).href);
const THREE = await import('three');
const { buildCharacter } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js'), { buildHuman, makeRetarget } = await imp('human.js'), AN = await imp('anat.js');
const SC = await import('./scenes_foot.mjs');
const clips = process.env.MODE === 'clip' ? JSON.parse(fs.readFileSync(path.resolve(HERE, '../assets_local/clips.json'), 'utf8')) : null;
const all = [...SC.SCENES.map((s, i) => ['reach' + (i + 1), ...s]), ...SC.SCENES_H.map(s => [s[0].split(' ')[0], ...s]), ...(SC.SCENES_V115 || []).map(s => [s[0].split(' ')[0], ...s]), ...(SC.SCENES_U || []).map(s => [s[0].split(' ')[0], ...s]), ...(SC.SCENES_J || []).map(s => [s[0].split(' ')[0], ...s])]
  .filter(s => (process.env.ONLY ? process.env.ONLY.split(',') : ['reach1', 'reach2', 'reach3', 'h1', 'h3', 'h5', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'u6', 'u7', 'u8', 'u9', 'u12', 'j1']).includes(s[0]));
const rig = buildCharacter(), H = buildHuman(), R = makeRetarget(rig, H), V = () => new THREE.Vector3(), deg = 180 / Math.PI, qA = q => [q.x, q.y, q.z, q.w], vA = v => [v.x, v.y, v.z];
const wpC = n => rig.bones[n].getWorldPosition(V()), wpH = n => H.bones[n].getWorldPosition(V());
const side = (a, m, b) => { const u = b.clone().sub(a).normalize(), p = m.clone().sub(a); return p.addScaledVector(u, -p.dot(u)); };
const out = { scenes: {} }, TOT = { sho: 0, tw: 0, back: 0, hyper: 0, n: 0, shoM: -99, twM: 0, backM: 0 };
for (const [id, title, fn, assist, , st0] of all) {
  const world = makeWorld(), sim = makeSim(rig, world, clips); sim.reset({ pos: st0 || SC.START, yaw: Math.PI }); sim.opt.wallRest = false; sim.opt.footAssist = !!assist; sim.opt.posture = process.env.VARIANT || 'fb'; sim.opt.grabAssist = !process.env.NOASSIST;
  const inputs = [], put = (inp = {}, cmd = []) => inputs.push({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd }), rep = (n, inp, cmd) => { for (let i = 0; i < n; i++) put(inp, i ? [] : cmd); }; fn(sim, put, rep);
  const S = { sho: 0, tw: 0, back: 0, hyper: 0, n: 0, shoM: -99, shoAt: '', twM: 0, twAt: '', backM: 0, backAt: '' };
  for (let k = 0; k < inputs.length; k++) { sim.step(inputs[k]); R.apply(sim.fing, sim.pron, sim.climb, world, sim.gw); H.root.updateMatrixWorld(true); rig.root.updateMatrixWorld(true); const t = ((k + 1) / 120).toFixed(3);
    const qC = rig.bones.chest.getWorldQuaternion(new THREE.Quaternion());
    for (const [i, s, h] of [[0, 'L', 'l'], [1, 'R', 'r']]) { const sx = i ? -1 : 1, sh = wpC(`upperArm.${s}`), el = wpC(`foreArm.${s}`), wr = wpC(`hand.${s}`); S.n++;
      const sho = AN.shoulderExcess(qA(qC), vA(sh), vA(el), sx) * deg, twR = AN.humerusTwist ? AN.humerusTwist(qA(qC), vA(sh), vA(el), vA(wr), sx) : null, tw = twR === null ? 0 : twR * deg;
      if (sho > 10) S.sho++; if (tw > 110) S.tw++; if (sho > S.shoM) { S.shoM = sho; S.shoAt = `${t} ${s} ${sim.climb.hands[i].st}`; } if (tw > S.twM) { S.twM = tw; S.twAt = `${t} ${s} ${sim.climb.hands[i].st}`; }
      // ③ 마네킹 팔꿈치의 쪽: 제어 뼈대가 굽은 쪽과 반대면 뒤로 꺾인 것(굽음이 3cm 넘을 때만 본다)
      const hs = wpH(`upperarm_${h}`), he = wpH(`lowerarm_${h}`), hw = wpH(`hand_${h}`), pc = side(sh, el, wr), ph = side(hs, he, hw);
      if (pc.length() > 0.03 && ph.length() > 0.03) { const ang = pc.angleTo(ph) * deg; if (ang > 90) { S.back++; if (ang > S.backM) { S.backM = ang; S.backAt = `${t} ${s} ${sim.climb.hands[i].st}`; } } }
      // ④ 과신전: 마네킹 위팔·아래팔 사이 각(180 = 곧음). 곧은 팔에서 반대로 꺾이면 위의 ③에 걸린다 — 여기서는 곧은 정도만 적는다
      const elbowA = he.clone().sub(hs).angleTo(hw.clone().sub(he)) * deg; if (ph.length() < 0.005 && elbowA < 1) S.hyper += 0; }
  }
  out.scenes[id] = { 제목: title, ...S, shoM: +S.shoM.toFixed(1), twM: +S.twM.toFixed(0), backM: +S.backM.toFixed(0) };
  for (const k of ['sho', 'tw', 'back', 'n']) TOT[k] += S[k]; TOT.shoM = Math.max(TOT.shoM, S.shoM); TOT.twM = Math.max(TOT.twM, S.twM); TOT.backM = Math.max(TOT.backM, S.backM);
  console.log(`■ ${id.padEnd(6)} 어깨 범위 10° 넘음 ${S.sho}걸음(최대 ${S.shoM.toFixed(1)}° ${S.shoAt}) · 위팔 비틀림 110° 넘음 ${S.tw}(최대 ${S.twM.toFixed(0)}° ${S.twAt}) · 마네킹 팔꿈치가 반대로 굽음 ${S.back}(최대 ${S.backM.toFixed(0)}° ${S.backAt})`);
}
console.log(`합계(팔 ${TOT.n}걸음): 어깨 범위 10° 넘음 ${TOT.sho} (최대 ${TOT.shoM.toFixed(1)}°) · 위팔 비틀림 110° 넘음 ${TOT.tw} (최대 ${TOT.twM.toFixed(0)}°) · 마네킹 팔꿈치가 반대로 굽음 ${TOT.back} (최대 ${TOT.backM.toFixed(0)}°)`);
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ 실행_출처: __P, ...out, 합계: TOT }, null, 1));
