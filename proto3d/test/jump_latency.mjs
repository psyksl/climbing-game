// 점프의 반응 시각(B3): 입력을 받은 걸음 → 자세가 움직이기 시작한 걸음(엉덩이가 1mm 넘게 움직임) → 발이 땅을 떠난 걸음(물리) → 그림의 두 발끝이 모두 디딘 높이보다 3cm 넘게 뜬 걸음.
// 스크립트 입력이며 사람 손이 아니다. 사용: node test/jump_latency.mjs   캡처 동작으로: MODE=clip
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import * as THREE from 'three';
const P3 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), imp = f => import(pathToFileURL(path.join(P3, 'src', f)).href);
const { buildCharacter } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js');
const CLP = path.join(P3, 'assets_local/clips.json'), useClip = process.env.MODE === 'clip' && fs.existsSync(CLP), clips = useClip ? JSON.parse(fs.readFileSync(CLP, 'utf8')) : null;
const rig = buildCharacter(), ms = k => (k === null ? '-' : (k / 120 * 1000).toFixed(0) + 'ms');
console.log(`모션 = ${useClip ? '캡처' : '자작'} · 한 걸음 = 8.3ms`);
console.log('| 출발 자세 | 입력 받음 | 자세가 움직이기 시작 | 발이 땅을 떠남(물리) | 그림의 두 발끝이 3cm 뜸 |'); console.log('|---|---|---|---|---|');
for (const [name, pre] of [['서 있음', {}], ['웅크림(1.25초 누른 뒤)', { crouch: true }], ['걷는 중', { mz: -1 }], ['달리는 중', { mz: -1, run: true }]]) {
  const sim = makeSim(rig, makeWorld(), clips); sim.reset({ pos: [0, 0, 8], yaw: Math.PI });
  for (let i = 0; i < 150; i++) sim.step({ mx: 0, mz: 0, ...pre });
  const hip = () => rig.bones.hips.getWorldPosition(new THREE.Vector3()).y, toe = () => Math.min(...['L', 'R'].map(s => rig.bones['toe.' + s].getWorldPosition(new THREE.Vector3()).y)) - sim.body.ground;
  let move = null, off = null, vis = null, toe0 = 9; const base = []; for (let i = 0; i < 90; i++) { const a = hip(); sim.step({ mx: 0, mz: 0, ...pre }); base.push(Math.abs(hip() - a)); toe0 = Math.min(toe0, toe()); } const noise = Math.max(...base);
  for (let k = 1; k <= 60; k++) { const a = hip(); sim.step({ mx: 0, mz: 0, ...pre, crouch: false, jump: true }); if (move === null && Math.abs(hip() - a) > noise + 0.001) move = k; if (off === null && !sim.body.onGround) off = k; if (vis === null && toe() > toe0 + 0.03) vis = k; }
  console.log(`| ${name} | 0ms(같은 걸음) | ${ms(move)} | ${ms(off)} | ${ms(vis)} |`); }
