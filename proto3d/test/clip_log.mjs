// 캡처 모션 진단(스크립트 입력, 사람 손 아님): 실제 실행과 같은 계산(sim.step)을 돌려 장면마다
//  지지 구간의 디딘 점 이탈, 한 걸음 회전량·회전량 변화가 큰 순간(시각·뼈), 다리 뻗음, 엉덩이 높이 변화를 적는다.
// 사용: node test/clip_log.mjs [clip|proc] [출력.json]   (assets_local/clips.json이 없으면 건너뜀)
import * as THREE from 'three';
import fs from 'fs';
import { buildCharacter } from '../src/rig.js';
import { makeWorld } from '../src/world.js';
import { makeSim } from '../src/sim.js';
const cf = new URL('../assets_local/clips.json', import.meta.url);
if (!fs.existsSync(cf)) { console.log('assets_local/clips.json 없음 → 건너뜀'); process.exit(0); }
const mode = process.argv[2] || 'clip', SC = {
  '대기': [[240, {}]], '걷기': [[480, { f: 1 }]], '달리기': [[480, { f: 1, run: true }]], '웅크려 걷기': [[480, { f: 1, crouch: true }]],
  '걷기→달리기→멈춤': [[240, { f: 1 }], [240, { f: 1, run: true }], [240, {}]], '웅크림→점프→착지': [[120, { crouch: true }], [72, { jump: true }], [240, {}]],
  '달리다 점프': [[240, { f: 1, run: true }], [30, { f: 1, run: true, jump: true }], [240, { f: 1, run: true }]],
  '뒤로 돌기': [[30, { f: -1 }], [240, {}]], '돌아서 걷기': [[150, { f: -1 }]], '걷다 뒤로': [[240, { f: 1 }], [300, { f: -1 }]], '옆으로 꺾기': [[240, { f: 1 }], [300, { r: 1 }]],
};
const rig = buildCharacter(), sim = makeSim(rig, makeWorld(), JSON.parse(fs.readFileSync(cf, 'utf8'))), out = {};
sim.useClip = mode === 'clip';
for (const [name, segs] of Object.entries(SC)) {
  sim.reset({ pos: [-10, 0, 8], yaw: Math.PI / 2 }); sim.step({ mx: 0, mz: 0 }); sim.motion.stats.stances = []; sim.motion.stats.stanceMaxDev = 0; sim.motion.stats.maxRatio = 0; sim.motion.stats.kneeFlip = 0; sim.motion.stats.below = 0; for (const L of sim.motion.legs) L.stance = null;
  const prev = rig.list.map(b => b.quaternion.clone()), last = []; let k = 0, top = [], topJ = [], hipPrev = rig.bones.hips.position.y, maxHip = 0;
  for (const [n, a] of segs) for (let i = 0; i < n; i++, k++) {
    sim.step({ mx: a.f || 0, mz: -(a.r || 0), run: !!a.run, crouch: !!a.crouch, jump: !!a.jump }); // 몸이 +x를 보고 시작한다(앞 = +x, 오른쪽 = -z)
    let rot = 0, rb = '', jer = 0, jb = '';
    rig.list.forEach((b, j) => { const r = prev[j].angleTo(b.quaternion) * 180 / Math.PI, jk = last[j] === undefined ? 0 : Math.abs(r - last[j]); if (r > rot) { rot = r; rb = b.name; } if (jk > jer) { jer = jk; jb = b.name; } last[j] = r; prev[j].copy(b.quaternion); });
    const C = sim.clip, info = `${(k / 120).toFixed(3)}초 w=${C.w.toFixed(2)} ${C.feet.map(f => (f.step ? 'S' : f.lock ? f.kind[0] : '-')).join('')}`;
    top.push([rot, rb, info]); topJ.push([jer, jb, info]); maxHip = Math.max(maxHip, Math.abs(rig.bones.hips.position.y - hipPrev)); hipPrev = rig.bones.hips.position.y;
  }
  const st = sim.motion.stats, open = sim.motion.legs.filter(L => L.stance).map(L => L.stance), all = [...st.stances, ...open], dev = Math.max(0, ...all.map(s => s.maxDev));
  top.sort((a, b) => b[0] - a[0]); topJ.sort((a, b) => b[0] - a[0]);
  out[name] = { 지지구간: all.length, 최대이탈_mm: +(dev * 1000).toFixed(2), 다리뻗음: +st.maxRatio.toFixed(3), 무릎뒤로: st.kneeFlip, 땅아래: st.below, 한걸음회전_최대: +top[0][0].toFixed(2), 회전량변화_최대: +topJ[0][0].toFixed(2), 엉덩이_한걸음_mm: +(maxHip * 1000).toFixed(1) };
  console.log(`${name.padEnd(12)} 구간 ${String(all.length).padStart(2)} · 이탈 ${(dev * 1000).toFixed(2)}mm · 뻗음 ${(st.maxRatio * 100).toFixed(1)}% · 무릎 뒤로 ${st.kneeFlip} · 땅 아래 ${st.below} · 엉덩이 ${(maxHip * 1000).toFixed(1)}mm/걸음\n     회전 ${top.slice(0, 2).map(t => `${t[0].toFixed(1)}° ${t[1]} @${t[2]}`).join(' | ')}\n     변화 ${topJ.slice(0, 2).map(t => `${t[0].toFixed(1)}° ${t[1]} @${t[2]}`).join(' | ')}`);
}
if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify({ mode, note: '스크립트 입력(사람 손 아님)', scenes: out }, null, 1));
