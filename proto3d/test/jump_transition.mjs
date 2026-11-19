// 점프 전환 점검(스크립트 입력, 사람 손 아님): 모으기 → 밀기 → 뜨기 → 공중 → 착지에서 뼈 회전이 한 걸음에 얼마나 변하는지를 구간별로 적는다.
// 약한/중간/최대 모으기, 웅크림에서 출발, 걷다가·달리다가 점프를 견준다. 물리 값(뛰는 속도·뜬 시각·가장 높은 높이)과 뜨기 전 디딘 발의 이탈도 함께 적는다.
// 사용: node test/jump_transition.mjs [결과 JSON]   고치기 전 소스와 견주려면 SRC=<옛 src 폴더> CLIPS=<clips.json>   한 경우의 걸음별 값: TRACE=<경우 이름> [TRACE_AT=<걸음>]
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.env.SRC ? path.resolve(process.env.SRC) : path.resolve(HERE, '../src');
const CL = process.env.CLIPS || path.resolve(HERE, '../assets_local/clips.json');
if (!fs.existsSync(CL)) { console.log('clips.json 없음 → 건너뜀'); process.exit(0); }
const imp = f => import(pathToFileURL(path.join(SRC, f)).href);
const { buildCharacter } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js');
const CASES = {
  '약한 모으기(0.05초)': [[60, {}], [6, { jump: 1 }], [200, {}]],
  '중간 모으기(0.3초)': [[60, {}], [36, { jump: 1 }], [220, {}]],
  '최대 모으기(0.6초)': [[60, {}], [72, { jump: 1 }], [240, {}]],
  '웅크림에서 최대 모으기': [[120, { crouch: 1 }], [72, { jump: 1 }], [240, {}]],
  '걷다가 짧게': [[240, { f: 1 }], [6, { f: 1, jump: 1 }], [200, { f: 1 }]],
  '달리다가 짧게': [[240, { f: 1, run: 1 }], [6, { f: 1, run: 1, jump: 1 }], [200, { f: 1, run: 1 }]],
  '달리다가 최대 모으기': [[240, { f: 1, run: 1 }], [72, { f: 1, run: 1, jump: 1 }], [240, { f: 1, run: 1 }]],
};
const rig = buildCharacter(), sim = makeSim(rig, makeWorld(), JSON.parse(fs.readFileSync(CL, 'utf8'))), out = {};
sim.useClip = true;
for (const [name, segs] of Object.entries(CASES)) {
  sim.reset({ pos: [-10, 0, 8], yaw: Math.PI / 2 }); sim.step({ mx: 0, mz: 0 });
  const prev = rig.list.map(b => b.quaternion.clone()), last = [], rows = [];
  let k = 0, takeoff = -1, land = -1, peak = 0, vy0 = 0;
  sim.motion.stats.stances = []; sim.motion.stats.stanceMaxDev = 0;
  for (const [n, a] of segs) for (let i = 0; i < n; i++, k++) {
    sim.step({ mx: a.f || 0, mz: 0, run: !!a.run, crouch: !!a.crouch, jump: !!a.jump });
    for (const e of sim.body.events) { if (e.type === 'takeoff') { takeoff = k; vy0 = e.vy; } if (e.type === 'land' && takeoff >= 0 && land < 0) land = k; }
    peak = Math.max(peak, sim.body.pos.y);
    let rot = 0, rb = '', jer = 0, jb = '';
    rig.list.forEach((b, j) => { const r = prev[j].angleTo(b.quaternion) * 180 / Math.PI, jk = last[j] === undefined ? 0 : Math.abs(r - last[j]); if (r > rot) { rot = r; rb = b.name; } if (jk > jer) { jer = jk; jb = b.name; } last[j] = r; prev[j].copy(b.quaternion); });
    rows.push({ k, rot, rb, jer, jb, feet: sim.clip.feet.map(f => (f.step ? 'S' : f.skip ? 'K' : f.lock ? f.kind[0] : '-')).join(''), aw: sim.clip.act ? sim.clip.act.w : 0, sp: Math.hypot(sim.body.vel.x, sim.body.vel.z), kind: sim.clip.act ? sim.clip.act.kind : '', hipY: rig.bones.hips.position.y, drop: sim.clip.drop, ratio: Math.max(...sim.motion.legs.map(L => L.ik.ratio)) });
  }
  const win = (a, b) => { const R = rows.filter(r => r.k >= a && r.k <= b); if (!R.length) return { 회전: 0, 뼈: '', 걸음: -1, 변화: 0, 변화뼈: '', 변화걸음: -1 }; const m = R.reduce((x, r) => (r.rot > x.rot ? r : x), R[0]), j = R.reduce((x, r) => (r.jer > x.jer ? r : x), R[0]); return { 회전: +m.rot.toFixed(2), 뼈: m.rb, 걸음: m.k, 변화: +j.jer.toFixed(2), 변화뼈: j.jb, 변화걸음: j.k }; };
  const st = sim.motion.stats, dev = Math.max(0, ...st.stances.filter(s => s.t0 * 120 < takeoff + 2).map(s => s.maxDev));
  const R = { 뜬_걸음: takeoff, 닿은_걸음: land, 뛰는_속도: +vy0.toFixed(3), 가장_높이: +peak.toFixed(3), 뜨기_전_지지구간_이탈_mm: +(dev * 1000).toFixed(2), 밀기_끝_10걸음: win(takeoff - 10, takeoff - 1), 뜨는_순간_앞뒤_3걸음: win(takeoff - 1, takeoff + 3), 공중: win(takeoff + 4, land - 2), 착지_뒤_30걸음: win(land - 1, land + 30), 전체: win(2, rows.length - 1) };
  out[name] = R;
  const w = x => `${x.회전}°(${x.뼈}@${x.걸음}) 변화 ${x.변화}°`;
  console.log(`${name}: 뜸 ${takeoff} · 속도 ${R.뛰는_속도} · 높이 ${R.가장_높이}m · 이탈 ${R.뜨기_전_지지구간_이탈_mm}mm\n    밀기 끝 ${w(R.밀기_끝_10걸음)} | 뜨는 순간 ${w(R.뜨는_순간_앞뒤_3걸음)} | 공중 ${w(R.공중)} | 착지 ${w(R.착지_뒤_30걸음)} | 전체 ${w(R.전체)}`);
  const at = process.env.TRACE_AT ? +process.env.TRACE_AT : takeoff - 4, span = process.env.TRACE_AT ? 7 : 9;
  if (process.env.TRACE === name) for (const r of rows.filter(r => r.k >= at - span && r.k <= at + span)) console.log(`      k=${r.k} ${r.kind} w${r.aw.toFixed(2)} 발 ${r.feet} 속도 ${r.sp.toFixed(2)} 엉덩이 ${r.hipY.toFixed(3)} 낮춤 ${r.drop.toFixed(4)} 다리 뻗음 ${r.ratio.toFixed(4)} 회전 ${r.rot.toFixed(1)} ${r.rb} 변화 ${r.jer.toFixed(1)}`);
}
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ note: '스크립트 입력(사람 손 아님). 회전 = 뼈의 한 계산 걸음(1/120초) 회전, 변화 = 바로 앞 걸음과의 차이', src: process.env.SRC ? '고치기 전(p3d-0.4.0)' : '지금', cases: out }, null, 1));
