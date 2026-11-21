import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import * as THREE from 'three';
const HERE = path.dirname(fileURLToPath(import.meta.url)), SRC = path.resolve(HERE, '../src'), imp = f => import(pathToFileURL(path.join(SRC, f)).href);
const { buildCharacter, DIM } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js'), { PHY } = await imp('controller.js'), clamp = THREE.MathUtils.clamp;
const CLP = path.resolve(HERE, '../assets_local/clips.json'), useClip = process.env.MODE === 'clip';
if (useClip && !fs.existsSync(CLP)) { console.log('clips.json 없음 → 건너뜀'); process.exit(0); }
const clips = useClip ? JSON.parse(fs.readFileSync(CLP, 'utf8')) : null, rig = buildCharacter(), DT = PHY.DT, G = PHY.G;
// 제자리 점프 비교(p3d-0.8.4, GPT의 p3d-0.8.3 검토 4장): 같은 물리·같은 입력(Space를 0.5초 누름)에서 자작 모션과 캡처 모션의 모습을 숫자로 견준다. 통과·실패가 없다. 스크립트 입력이며 사람 손이 아니다
//   뜨는 시각(물리 — 두 모션에서 같아야 한다), 가장 높은 곳, 공중에서 두 발의 앞뒤 벌어짐·좌우 간격, 엉덩이가 물리 자리에서 벗어난 거리, 다리 길이비(고관절–발목 ÷ 다리 길이)
//   사용: node test/jump_compare.mjs [결과 JSON]   캡처: MODE=clip
const sim = makeSim(rig, makeWorld(), clips); sim.reset({ pos: [0, 0, 0], yaw: 0 }); const B = rig.bones, wp = n => B[n].getWorldPosition(new THREE.Vector3());
for (let i = 0; i < 60; i++) sim.step({ mx: 0, mz: 0, cmd: [] });
const rows = []; let off = -1, land = -1, apex = 0;
for (let k = 0; k < 150; k++) { sim.step({ mx: 0, mz: 0, jump: k < 60, cmd: [] }); rig.root.updateMatrixWorld(true); const b = sim.body, fL = wp('foot.L'), fR = wp('foot.R'), hip = wp('hips'), hjL = wp('upLeg.L'), hjR = wp('upLeg.R');
  if (off < 0 && !b.onGround) off = k + 1; if (off > 0 && land < 0 && b.onGround) land = k + 1; apex = Math.max(apex, b.pos.y);
  rows.push({ k: k + 1, air: !b.onGround, y: b.pos.y, split: fL.z - fR.z, wide: Math.abs(fL.x - fR.x), hipOff: [hip.x - b.pos.x, hip.z - b.pos.z], len: [hjL.distanceTo(fL), hjR.distanceTo(fR)].map(v => v / (DIM.thigh + DIM.shin)), footY: [fL.y, fR.y] }); }
const air = rows.filter(r => r.air), mx = (f) => air.reduce((a, r) => (Math.abs(f(r)) > Math.abs(a) ? f(r) : a), 0), at = t => rows[Math.min(rows.length - 1, off - 1 + Math.round(t * 120))];
const out = { 모션: useClip ? '캡처' : '자작', '뜨는 시각_ms(누른 뒤)': +(off / 120 * 1000).toFixed(0), '공중 시간_s': +((land - off) / 120).toFixed(3), '가장 높은 곳_cm': +(apex * 100).toFixed(1),
  '두 발 앞뒤 벌어짐_최대_cm(왼발−오른발)': +(mx(r => r.split) * 100).toFixed(1), '두 발 좌우 간격_cm(최소~최대)': [Math.min(...air.map(r => r.wide)), Math.max(...air.map(r => r.wide))].map(v => +(v * 100).toFixed(1)),
  '엉덩이가 몸 자리에서 벗어남_최대_cm(좌우, 앞뒤)': [mx(r => r.hipOff[0]), mx(r => r.hipOff[1])].map(v => +(v * 100).toFixed(1)),
  '다리 길이비(왼, 오른)': Object.fromEntries([['뜨는 걸음', 0], ['뜬 뒤 0.1초', 0.1], ['뜬 뒤 0.2초', 0.2], ['가장 높은 곳 근처(0.3초)', 0.3]].map(([n, t]) => [n, at(t).len.map(v => +v.toFixed(2))])) };
console.log(JSON.stringify(out, null, 1)); if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
