// 같은 속도에서 캡처 모션과 자작 모션의 걸음을 숫자로 견준다(스크립트 입력, 사람 손 아님. 캡처 쪽 값도 "이 뼈대로 옮긴 뒤"의 값이다).
// 잰다(일정한 속도가 된 뒤 12초): 분당 걸음 수, 한 걸음 길이, 한 발이 닿아 있는 몫, 두 발 다 뜬 몫, 무릎 굽힘 범위, 엉덩이 높이·좌우 흔들림 폭, 팔 앞뒤 흔들림 폭, 골반·가슴 비틀림 폭
// 사용: node test/gait_compare.mjs [출력.json]   (assets_local/clips.json이 없으면 건너뜀)
import * as THREE from 'three';
import fs from 'fs';
import { buildCharacter } from '../src/rig.js';
import { makeWorld } from '../src/world.js';
import { makeSim } from '../src/sim.js';
const cf = new URL('../assets_local/clips.json', import.meta.url);
if (!fs.existsSync(cf)) { console.log('assets_local/clips.json 없음 → 건너뜀'); process.exit(0); }
// 시험용 바닥: 게임의 바닥은 x = -30~30이라 달리기 4.2m/s로 14.5초(예열 2.5 + 측정 12)를 가면 끝을 넘는다(p3d-0.4.0까지의 오류: 마지막 17걸음이 바닥 밖 공중이었다).
// 여기서만 바닥을 x = -200~200으로 늘리고, 측정하는 동안 몸이 바닥 안에 있고 물리상 땅에 닿아 있으며 속도가 맞는지를 걸음마다 확인한다. 어긋나면 측정을 실패로 끝낸다.
// (달리기에서 두 발이 다 뜨는 것은 동작의 일이고, 여기서 보는 것은 몸의 물리 상태다. 둘을 섞지 않는다.)
const world = makeWorld(), floor = world.boxes.find(b => b.kind === 'floor'); floor.min.x = -200; floor.max.x = 200;
const rig = buildCharacter(), sim = makeSim(rig, world, JSON.parse(fs.readFileSync(cf, 'utf8'))), B = rig.bones, out = {}, bad = [];
const W = n => B[n].getWorldPosition(new THREE.Vector3()), ang = (a, b, c) => { const u = W(b).sub(W(a)).normalize(), v = W(c).sub(W(b)).normalize(); return Math.acos(Math.max(-1, Math.min(1, u.dot(v)))) * 180 / Math.PI; };
const yawOf = n => { const f = new THREE.Vector3(1, 0, 0).applyQuaternion(B[n].getWorldQuaternion(new THREE.Quaternion())).cross(new THREE.Vector3(0, 1, 0)); return Math.atan2(f.z, f.x) * 180 / Math.PI; }; // 몸이 +x를 보고 간다
for (const [name, inp] of [['걷기', { mx: 1, mz: 0 }], ['달리기', { mx: 1, mz: 0, run: true }]]) for (const mode of ['clip', 'proc']) {
  sim.useClip = mode === 'clip'; sim.reset({ pos: [-28, 0, 14], yaw: Math.PI / 2 }); for (let i = 0; i < 300; i++) sim.step(inp); // 바닥(±30m) 안에서 12초를 가도록 왼쪽 끝에서 출발
  const N = 1440, R = { knee: [1e9, -1e9], hipY: [1e9, -1e9], hipZ: [1e9, -1e9], arm: [1e9, -1e9], pelvis: [1e9, -1e9], chest: [1e9, -1e9] }, mm = (k, v) => { R[k][0] = Math.min(R[k][0], v); R[k][1] = Math.max(R[k][1], v); };
  let strikes = 0, conL = 0, fly = 0, was = null, x0 = sim.body.pos.x; const target = inp.run ? 4.2 : 1.4, v = { off: 0, air: 0, y: 0, sp: 0 };
  for (let i = 0; i < N; i++) { sim.step(inp);
    { const b = sim.body, sp = Math.hypot(b.vel.x, b.vel.z); if (b.pos.x < floor.min.x + 0.5 || b.pos.x > floor.max.x - 0.5 || b.pos.z < floor.min.z + 0.5 || b.pos.z > floor.max.z - 0.5) v.off++; if (!b.onGround) v.air++; v.y = Math.max(v.y, Math.abs(b.pos.y)); v.sp = Math.max(v.sp, Math.abs(sp - target)); }
    const con = sim.motion.legs.map((L, j) => mode === 'clip' ? !!sim.clip.feet[j].lock : L.mode === 'plant'); if (was) con.forEach((c, j) => { if (c && !was[j]) strikes++; }); was = con; if (con[0]) conL++; if (!con[0] && !con[1]) fly++;
    mm('knee', ang('upLeg.L', 'leg.L', 'foot.L')); mm('hipY', B.hips.position.y); mm('hipZ', W('hips').z); const sh = W('upperArm.L'), hd = W('hand.L'); mm('arm', Math.atan2(hd.x - sh.x, sh.y - hd.y) * 180 / Math.PI); mm('pelvis', yawOf('hips')); mm('chest', yawOf('chest')); }
  const key = `${name}·${mode === 'clip' ? '캡처' : '자작'}`; if (v.off || v.air || v.y > 0.001 || v.sp > 0.02) bad.push(`${key}: 바닥 밖 ${v.off}걸음 · 몸이 공중 ${v.air}걸음 · 높이 어긋남 ${(v.y * 1000).toFixed(1)}mm · 속도 어긋남 ${v.sp.toFixed(3)}m/s`);
  const T = N / 120, dist = sim.body.pos.x - x0, r1 = v => +v.toFixed(1);
  out[key] = { 측정_구간_끝_x: +sim.body.pos.x.toFixed(2), 속도: +(dist / T).toFixed(2), 분당_걸음: Math.round(strikes / T * 60), 걸음_길이_m: +(dist / strikes).toFixed(2), 한발_닿은_몫: +(conL / N).toFixed(2), 둘다_뜬_몫: +(fly / N).toFixed(2),
    무릎_굽힘_도: R.knee.map(r1), 엉덩이_높이_폭_cm: r1((R.hipY[1] - R.hipY[0]) * 100), 엉덩이_좌우_폭_cm: r1((R.hipZ[1] - R.hipZ[0]) * 100), 팔_앞뒤_도: R.arm.map(r1), 골반_비틀림_폭_도: r1(R.pelvis[1] - R.pelvis[0]), 가슴_비틀림_폭_도: r1(R.chest[1] - R.chest[0]) };
}
console.table(out);
if (bad.length) { console.log('측정 구간이 잘못됨 → 결과를 쓰지 않는다:\n  ' + bad.join('\n  ')); process.exit(1); }
console.log('측정 구간 확인: 네 경우 모두 바닥 안 · 몸이 땅에 닿음 · 높이 0 · 속도 맞음');
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ note: '스크립트 입력(사람 손 아님). 캡처 쪽도 이 뼈대로 옮기고 발을 고정한 뒤의 값', rows: out }, null, 1));
