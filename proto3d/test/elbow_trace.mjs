// 잡은 팔·뻗는 팔의 팔꿈치가 어깨에서 어느 쪽에 있는가(몸 틀: 바깥 옆 / 위 / 뒤 = 벽 반대쪽)를 걸음마다 적는다. 스크립트 입력이며 사람 손이 아니다.
// 사용: [POSTURE=fb] [PA=1] node test/elbow_trace.mjs <장면 id> <L|R> <시작 초> <끝 초> [간격 걸음]
import { prov, provLine } from './provenance.mjs';
import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url'; import * as THREE from 'three';
console.log(provLine(prov()));
const HERE = path.dirname(fileURLToPath(import.meta.url)), imp = f => import(pathToFileURL(path.join(HERE, '../src', f)).href);
const { buildCharacter } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js'), SC = await import('./scenes_foot.mjs');
const [id, side, t0s, t1s, evS] = process.argv.slice(2), every = +(evS || 12);
const list = [...SC.SCENES_FOOT.map((s, i) => ['foot' + (i + 1), ...s]), ...SC.SCENES_H.map(s => [s[0].split(' ')[0], ...s]), ...(SC.SCENES_P || []).map(s => [s[0].split(' ')[0], ...s])], sc = list.find(s => s[0] === id); if (!sc) throw new Error('장면 없음 ' + id);
const [, title, fn, assist, mode, st0] = sc, inputs = [], put = (inp = {}, cmd = []) => inputs.push({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd }), rep = (n, inp, cmd) => { for (let i = 0; i < n; i++) put(inp, i ? [] : cmd); }; fn(null, put, rep);
// MODE=clip: 캡처 동작(assets_local/clips.json)으로 돈다 — 영상·사용자 빌드와 같은 조건. 없으면 자작 동작(땅에서의 자세가 달라 벽에 붙는 순간의 상태가 조금 다르고, 아슬아슬한 장면은 흐름이 갈린다)
const CLIPS = process.env.MODE === 'clip' ? JSON.parse((await import('fs')).readFileSync(path.join(HERE, '../assets_local/clips.json'), 'utf8')) : null;
const rig = buildCharacter(), sim = makeSim(rig, makeWorld(), CLIPS); sim.reset({ pos: st0 || SC.START, yaw: Math.PI }); sim.opt.wallRest = false; sim.opt.footAssist = !!assist; sim.opt.grabAssist = true; sim.opt.poseAssist = !!process.env.PA; if (process.env.POSTURE) sim.opt.posture = process.env.POSTURE;
const wp = n => rig.bones[n].getWorldPosition(new THREE.Vector3()), i = side === 'L' ? 0 : 1;
console.log(title, '·', side, '· 바깥 = 그 팔 쪽 옆, 뒤 = 벽 반대쪽(cm). 팔꿈치 각 = 굽힌 각');
for (let k = 0; k < inputs.length; k++) { sim.step(inputs[k]); const t = (k + 1) / 120; if (t < +t0s || t > +t1s || (k + 1) % every) continue; rig.root.updateMatrixWorld(true);
  const yaw = sim.body.yaw, left = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), s = wp('upperArm.' + side), e = wp('foreArm.' + side), h = wp('hand.' + side), d = e.clone().sub(s), hd = h.clone().sub(s), K = sim.climb, H = K.hands[i];
  const out = d.dot(left) * (i ? -1 : 1), back = -d.dot(fwd), bend = 180 - e.clone().sub(s).angleTo(e.clone().sub(h)) * 57.3;
  console.log(`${t.toFixed(2)} ${H.st.padEnd(5)} 팔꿈치 바깥 ${(out * 100).toFixed(0).padStart(4)} 위 ${(d.y * 100).toFixed(0).padStart(4)} 뒤 ${(back * 100).toFixed(0).padStart(4)} · 손 바깥 ${(hd.dot(left) * (i ? -1 : 1) * 100).toFixed(0).padStart(4)} 위 ${(hd.y * 100).toFixed(0).padStart(4)} 앞 ${(hd.dot(fwd) * 100).toFixed(0).padStart(4)} · 굽힘 ${bend.toFixed(0).padStart(3)}° · 몸 y ${sim.body.pos.y.toFixed(2)} z ${sim.body.pos.z.toFixed(2)}`); }
