// 웅크린 채 뛰기(B3) 진단: 뜨는 시각, 그림 엉덩이의 한 걸음 최대 이동, 발이 땅 밑으로 들어가는 깊이, 엉덩이 오름을 늦춘 몫(캡처 모션)을 경우별로 적는다. 통과·실패 없음.
// 스크립트 입력이며 사람 손이 아니다. 사용: node test/crouch_jump.mjs   캡처 동작으로: MODE=clip   고치기 전과 견주려면 SRC=<옛 proto3d 폴더>
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import * as THREE from 'three';
const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), P3 = process.env.SRC ? path.resolve(process.env.SRC) : HERE, imp = f => import(pathToFileURL(path.join(P3, 'src', f)).href);
const { buildCharacter } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js');
const CLP = path.join(HERE, 'assets_local/clips.json'), useClip = process.env.MODE === 'clip' && fs.existsSync(CLP), clips = useClip ? JSON.parse(fs.readFileSync(CLP, 'utf8')) : null, rig = buildCharacter();
console.log(`모션 = ${useClip ? '캡처' : '자작'}`);
for (const [name, pre, during, post] of [['웅크림→점프(웅크림 뗌)', { crouch: true }, { jump: true }, {}], ['웅크림 누른 채 점프', { crouch: true }, { crouch: true, jump: true }, { crouch: true }], ['웅크려 걷다 점프', { mz: -1, crouch: true }, { mz: -1, crouch: true, jump: true }, { mz: -1, crouch: true }], ['웅크림 0.2초 뒤 점프', { crouch: true, _n: 24 }, { jump: true }, {}], ['서서 점프', {}, { jump: true }, {}]]) {
  for (const hold of [6, 72]) { const sim = makeSim(rig, makeWorld(), clips); if (useClip) sim.useClip = true; sim.reset({ pos: [0, 0, 8], yaw: Math.PI });
    const n0 = pre._n || 150; for (let i = 0; i < 60; i++) sim.step({ mx: 0, mz: 0 }); for (let i = 0; i < n0; i++) sim.step({ mx: 0, mz: 0, ...pre });
    const hip = () => rig.bones.hips.getWorldPosition(new THREE.Vector3()), toe = () => Math.min(...['L', 'R'].flatMap(s => [rig.bones['toe.' + s], rig.bones['foot.' + s]]).map(b => b.getWorldPosition(new THREE.Vector3()).y));
    let lowAt = "", mx = 0, at = 0, low = 9, off = null, p = hip(), limMax = 0, limEnd = null;
    for (let k = 1; k <= 300; k++) { sim.step({ mx: 0, mz: 0, ...(k <= hold ? during : post) }); const q = hip(), d = q.distanceTo(p); if (d > mx) { mx = d; at = k; } p = q; { const tz = toe() - sim.body.ground; if (tz < low) { low = tz; lowAt = k + (sim.body.onGround ? "(땅)" : "(공중)"); } } if (off === null && !sim.body.onGround) off = k; if (sim.clip && sim.clip.lim !== undefined) { limMax = Math.max(limMax, sim.clip.lim); if (limEnd === null && off !== null && !sim.clip.limOn) limEnd = k; } }
    console.log(`${name} · 누름 ${(hold / 120).toFixed(2)}초: 뜸 ${(off / 120 * 1000).toFixed(0)}ms · 엉덩이 한 걸음 최대 ${(mx * 1000).toFixed(1)}mm(@${at}) · 발 가장 낮은 높이 ${(low * 100).toFixed(1)}cm(@${lowAt}) · 늦춘 몫 최대 ${(limMax * 100).toFixed(1)}cm, 끝난 걸음 ${limEnd}`); } }
