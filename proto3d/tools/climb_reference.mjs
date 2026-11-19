// 받은 등반·매달리기 동작(원본 뼈대 그대로)에서 자세의 기준 값을 뽑는다. 사용: node tools/climb_reference.mjs <FBX 폴더> <출력.json>
// 재는 것(장면마다, 원본 뼈 자리로): 팔꿈치·무릎 굽힘, 어깨 올림(몸통 축 기준), 고관절 굽힘·벌림, 무릎이 향한 쪽(벽 쪽 0° ~ 옆 90°),
//   몸통 기울기(앞뒤·좌우), 골반과 가슴의 비틀림, 엉덩이가 손보다 벽에서 떨어진 거리, 손·발 사이 너비, 손발을 옮기는 시간과 한 번에 움직이는 손발 수.
// 출력은 통계(범위·가운데 값)뿐이다. 동작 값 자체는 넣지 않는다.
import * as THREE from 'three';
import fs from 'fs';
import path from 'path';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
globalThis.window = globalThis; globalThis.self = globalThis;
globalThis.document = { createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, set src(v) {} }) };
console.warn = () => {};
const GROUPS = [
  ['매달려 있기', /^(Hanging Idle|Hanging)( \(\d+\))?$/], ['옆으로 옮기기(시미)', /Shimmy|Moving While Hanging/], ['매달려 뛰어 옮기기(홉)', /Hang Hop/],
  ['벽 타고 오르내리기', /Climbing (Up|Down) Wall/], ['턱 위로 올라서기', /Climbing To Top|Freehang Climb|Braced Hang To Crouch/], ['매달리러 가기·내려오기', /To Freehang|To Hang|To Braced Hang|To Hanging|Braced Hang Drop|Freehang Drop|^Braced Hang$|Braced To Free|Free Hang To Braced/],
  ['밧줄 오르기', /Climbing A Rope|Rope Climb/], ['사다리', /Ladder/], ['밧줄에 매달려 흔들기', /Swing/], ['벽으로 달려 오르기·벽 차기', /Wall Run|Sprint To Wall|Jump From Wall/], ['그 밖의 Climbing', /^Climbing( \(\d+\))?$|Climbing Down( \(\d+\))?$/],
];
const [dir, outFile] = process.argv.slice(2), V = () => new THREE.Vector3(), deg = r => r * 180 / Math.PI;
const ang = (u, v) => deg(Math.acos(THREE.MathUtils.clamp(u.clone().normalize().dot(v.clone().normalize()), -1, 1)));
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; }, r1 = x => x === null ? null : Math.round(x * 10) / 10;
const stat = a => ({ p5: r1(pct(a, 0.05)), mid: r1(pct(a, 0.5)), p95: r1(pct(a, 0.95)), min: r1(Math.min(...a)), max: r1(Math.max(...a)) });
const out = { note: '사용자가 준 Mixamo 등반 동작의 원본 뼈 자리에서 잰 통계(범위·가운데 값). 동작 값은 넣지 않았다. 각도 = 도, 길이 = 팔 길이(어깨→손목)나 다리 길이(고관절→발목)에 대한 비', groups: {} };
for (const [gname, re] of GROUPS) {
  const files = fs.readdirSync(dir).filter(f => /\.fbx$/i.test(f) && re.test(f.replace(/\.fbx$/i, ''))); if (!files.length) continue;
  const M = {}; const push = (k, v) => { if (Number.isFinite(v)) (M[k] = M[k] || []).push(v); }; const moves = { hand: [], foot: [] }; let simul = [], frames = 0;
  for (const f of files) {
    const buf = fs.readFileSync(path.join(dir, f)), obj = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), ''), clip = obj.animations.find(a => a.tracks.length); if (!clip) continue;
    const b = n => obj.getObjectByName('mixamorig' + n), P = n => b(n).getWorldPosition(V()), mixer = new THREE.AnimationMixer(obj); mixer.clipAction(clip).play();
    obj.updateMatrixWorld(true); const armL = P('LeftArm').distanceTo(P('LeftForeArm')) + P('LeftForeArm').distanceTo(P('LeftHand')), legL = P('LeftUpLeg').distanceTo(P('LeftLeg')) + P('LeftLeg').distanceTo(P('LeftFoot')), shW = P('LeftArm').distanceTo(P('RightArm'));
    const n = Math.round(clip.duration * 30) + 1, ends = { 'hand.L': [], 'hand.R': [], 'foot.L': [], 'foot.R': [] };
    for (let k = 0; k < n; k++) { mixer.setTime(Math.min(k / 30, clip.duration - 1e-6)); obj.updateMatrixWorld(true); frames++;
      const hips = P('Hips'), neck = P('Neck'), left = P('LeftUpLeg').sub(P('RightUpLeg')).setY(0).normalize(), up = new THREE.Vector3(0, 1, 0), fwd = left.clone().cross(up).normalize(); // 골반 기준: 왼쪽·앞(벽 쪽)
      const spine = neck.clone().sub(hips), shL = P('LeftArm').sub(P('RightArm')).setY(0).normalize();
      push('몸통_앞뒤_기울기', deg(Math.atan2(spine.dot(fwd), spine.y))); push('몸통_좌우_기울기_절대', Math.abs(deg(Math.atan2(spine.dot(left), spine.y)))); push('골반_가슴_비틀림_절대', Math.abs(deg(Math.atan2(shL.clone().cross(left).y, shL.dot(left)))));
      const hands = P('LeftHand').add(P('RightHand')).multiplyScalar(0.5); push('엉덩이가_손보다_뒤로(팔 길이 비)', (hands.clone().sub(hips).dot(fwd)) / armL); push('손_사이_너비(어깨 너비 비)', P('LeftHand').distanceTo(P('RightHand')) / shW); push('발_사이_너비(다리 길이 비)', P('LeftFoot').distanceTo(P('RightFoot')) / legL);
      for (const [S, sx] of [['Left', 1], ['Right', -1]]) {
        const sh = P(S + 'Arm'), el = P(S + 'ForeArm'), ha = P(S + 'Hand'), hj = P(S + 'UpLeg'), kn = P(S + 'Leg'), an = P(S + 'Foot');
        push('팔꿈치_굽힘', ang(el.clone().sub(sh), ha.clone().sub(el))); push('어깨_올림(몸통 아래쪽 기준)', ang(el.clone().sub(sh), spine.clone().negate())); push('손_높이(어깨 위로, 팔 길이 비)', (ha.y - sh.y) / armL);
        push('무릎_굽힘', ang(kn.clone().sub(hj), an.clone().sub(kn))); const th = kn.clone().sub(hj); push('고관절_굽힘(몸통 아래쪽 기준)', ang(th, spine.clone().negate()));
        push('고관절_벌림(바깥 +)', deg(Math.atan2(th.dot(left) * sx, -th.y))); const thH = th.clone().setY(0); if (thH.length() > legL * 0.08) push('무릎이_향한_쪽(0=벽 쪽, 90=옆)', deg(Math.atan2(Math.abs(thH.dot(left)), thH.dot(fwd)))); push('발_높이(고관절 아래로, 다리 길이 비)', (hj.y - an.y) / legL);
        ends[`hand.${S[0]}`].push(ha); ends[`foot.${S[0]}`].push(an);
      } }
    // 손발 옮기기: 끝점 빠르기가 0.35m/s를 넘는 구간(몸 전체가 함께 움직이는 몫은 엉덩이 빠르기를 빼지 않는다: 디딘 손발은 세계에서 서 있다)
    const moving = {}; for (const [name, arr] of Object.entries(ends)) { const mv = arr.map((p, k) => k > 0 && p.distanceTo(arr[k - 1]) * 30 / 100 > 0.35); moving[name] = mv; let s = -1; mv.forEach((m, k) => { if (m && s < 0) s = k; if ((!m || k === mv.length - 1) && s >= 0) { const d = arr[k].distanceTo(arr[s]) / 100; if (k - s >= 3 && d > 0.08) moves[name.startsWith('hand') ? 'hand' : 'foot'].push({ dur: (k - s) / 30, dist: d / ((name.startsWith('hand') ? armL : legL) / 100) }); s = -1; } }); }
    for (let k = 0; k < n; k++) simul.push(Object.values(moving).filter(m => m[k]).length);
  }
  const G = { 파일: files.length, 장면: frames, 값: Object.fromEntries(Object.entries(M).map(([k, v]) => [k, stat(v)])) };
  for (const kind of ['hand', 'foot']) if (moves[kind].length) G[kind === 'hand' ? '손_옮기기' : '발_옮기기'] = { 횟수: moves[kind].length, 걸린_시간_초: stat(moves[kind].map(m => m.dur)), 옮긴_거리: stat(moves[kind].map(m => m.dist)) };
  G['한_번에_움직이는_손발_수'] = Object.fromEntries([0, 1, 2, 3, 4].map(k => [k, r1(simul.filter(x => x === k).length / simul.length * 100) + '%']));
  out.groups[gname] = G;
  const g = G.값, s = k => `${g[k].p5}~${g[k].p95}(가운데 ${g[k].mid})`;
  console.log(`\n■ ${gname} — 파일 ${files.length}개 · ${frames}장\n  팔꿈치 ${s('팔꿈치_굽힘')} · 어깨 올림 ${s('어깨_올림(몸통 아래쪽 기준)')} · 무릎 ${s('무릎_굽힘')} · 고관절 굽힘 ${s('고관절_굽힘(몸통 아래쪽 기준)')} · 벌림 ${s('고관절_벌림(바깥 +)')}\n  무릎 방향 ${s('무릎이_향한_쪽(0=벽 쪽, 90=옆)')} · 몸통 앞뒤 ${s('몸통_앞뒤_기울기')} · 좌우 ${s('몸통_좌우_기울기_절대')} · 비틀림 ${s('골반_가슴_비틀림_절대')} · 엉덩이 뒤로 ${s('엉덩이가_손보다_뒤로(팔 길이 비)')}\n  손 너비 ${s('손_사이_너비(어깨 너비 비)')} · 발 너비 ${s('발_사이_너비(다리 길이 비)')} · 손 옮기기 ${G.손_옮기기 ? G.손_옮기기.횟수 + '번 ' + G.손_옮기기.걸린_시간_초.mid + '초' : '-'} · 발 옮기기 ${G.발_옮기기 ? G.발_옮기기.횟수 + '번 ' + G.발_옮기기.걸린_시간_초.mid + '초' : '-'} · 동시에 ${JSON.stringify(G['한_번에_움직이는_손발_수'])}`);
}
if (outFile) fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
