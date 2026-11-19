// Mixamo FBX(뼈 65개, 접두어 mixamorig) 동작을 이 시제품의 뼈대(rig.js, 뼈 21개)로 옮겨 작은 JSON으로 만든다.
// 사용: node tools/mixamo_convert.mjs <FBX 폴더> <출력 clips.json> [목록.json]
// - 원본 FBX와 변환한 JSON은 저장소에 넣지 않는다(assets_local/ = .gitignore). 이 도구만 저장소에 있다.
// - 옮기는 방법: 뼈마다 "원본의 쉬는 자세(T자)에서 지금까지 돈 세계 회전"을 구해 우리 뼈에 준다. 우리 뼈의 쉬는 방향(팔을 내림)과 원본의 쉬는 방향(팔을 옆으로)이 다른 만큼은 뼈마다 한 번 맞춘다(TB).
//   → 우리 뼈가 가리키는 방향 = 원본 뼈가 가리키는 방향. 팔다리 길이의 비가 달라 손 끝 자리는 조금 다르다(출력의 fit에 적는다).
// - 다리는 한 번 더 맞춘다: 발목 자리 = 고관절 기준 원본 발목 자리 × 다리 길이 비(두 마디 IK), 엉덩이 높이 = 원본 발목이 쉬는 높이일 때 우리 발목도 쉬는 높이(발바닥이 땅)에 오게.
//   방향만 옮기면 넓적다리·정강이 비와 발목 높이가 달라 디딘 발이 1~3cm 뜨거나 묻힌다.
// - 엉덩이 자리: 다리 길이 비(k)로 줄이고, 걷기·달리기는 한 주기의 평균 이동(뿌리 이동)을 빼서 "제자리 + 보폭"으로 나눈다. 몸을 옮기는 것은 controller.js다.
import * as THREE from 'three';
import fs from 'fs';
import path from 'path';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { buildCharacter, DIM } from '../src/rig.js';
import { setWorldQuat, twoBone } from '../src/ik.js';
globalThis.window = globalThis; globalThis.self = globalThis;
globalThis.document = { createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, set src(v) {} }) };
const warn = console.warn; console.warn = () => {};

export const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'shoulder.L', 'upperArm.L', 'foreArm.L', 'hand.L', 'shoulder.R', 'upperArm.R', 'foreArm.R', 'hand.R', 'upLeg.L', 'leg.L', 'foot.L', 'toe.L', 'upLeg.R', 'leg.R', 'foot.R', 'toe.R'];
const SRC = { hips: 'Hips', spine: 'Spine', chest: 'Spine2', neck: 'Neck', head: 'Head' };
for (const [s, S] of [['L', 'Left'], ['R', 'Right']]) Object.assign(SRC, { [`shoulder.${s}`]: `${S}Shoulder`, [`upperArm.${s}`]: `${S}Arm`, [`foreArm.${s}`]: `${S}ForeArm`, [`hand.${s}`]: `${S}Hand`, [`upLeg.${s}`]: `${S}UpLeg`, [`leg.${s}`]: `${S}Leg`, [`foot.${s}`]: `${S}Foot`, [`toe.${s}`]: `${S}ToeBase` });
// 뼈가 가리키는 방향을 정하는 자식(없으면 회전만 옮긴다). 발은 넣지 않는다: 두 뼈대 모두 쉬는 자세에서 발바닥이 평평하므로 회전만 옮겨야 발바닥이 평평하게 남는다
const CHILD = {}; for (const s of ['L', 'R']) Object.assign(CHILD, { [`upperArm.${s}`]: `foreArm.${s}`, [`foreArm.${s}`]: `hand.${s}`, [`upLeg.${s}`]: `leg.${s}`, [`leg.${s}`]: `foot.${s}`, [`shoulder.${s}`]: `upperArm.${s}` });
const SRC_END = { 'hand.L': 'LeftHandMiddle1', 'hand.R': 'RightHandMiddle1' };

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const r4 = x => Math.round(x * 1e4) / 1e4, r3 = x => Math.round(x * 1e3) / 1e3;

export function convert(file, opt = {}) {
  const buf = fs.readFileSync(file), obj = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  const clip = obj.animations.find(a => a.tracks.length); if (!clip) throw new Error('동작 없음');
  const sb = n => obj.getObjectByName('mixamorig' + n); if (!sb('Hips')) throw new Error('mixamorig 뼈대가 아님');
  obj.updateMatrixWorld(true);
  const wp = b => b.getWorldPosition(V()), wq = b => b.getWorldQuaternion(new THREE.Quaternion());
  // 원본의 쉬는 자세
  const rest = {}; for (const n of BONES) rest[n] = wq(sb(SRC[n])).invert();
  const restAnkY = (wp(sb('LeftFoot')).y + wp(sb('RightFoot')).y) / 2, restToeY = (wp(sb('LeftToeBase')).y + wp(sb('RightToeBase')).y) / 2;
  const sLeg = wp(sb('LeftUpLeg')).distanceTo(wp(sb('LeftLeg'))) + wp(sb('LeftLeg')).distanceTo(wp(sb('LeftFoot'))), k = DIM.leg / sLeg, restHipY = wp(sb('Hips')).y;
  if (wp(sb('LeftArm')).x <= 0) throw new Error('왼쪽이 +x가 아님');
  const rig = buildCharacter(), B = rig.bones; rig.root.updateMatrixWorld(true);
  // TB: 우리 쉬는 방향 → 원본 쉬는 방향
  const TB = {}; for (const n of BONES) {
    TB[n] = new THREE.Quaternion(); const c = CHILD[n]; if (!c && !SRC_END[n]) continue;
    const ours = c ? B[c].getWorldPosition(V()).sub(B[n].getWorldPosition(V())).normalize() : V(0, -1, 0);
    const src = wp(sb(c ? SRC[c] : SRC_END[n])).sub(wp(sb(SRC[n]))).normalize();
    TB[n].setFromUnitVectors(ours, src);
  }
  const mixer = new THREE.AnimationMixer(obj); mixer.clipAction(clip).play();
  const fps = opt.fps || 30, nAll = Math.max(2, Math.round(clip.duration * fps) + 1), frames = [];
  for (let f = 0; f < nAll; f++) {
    mixer.setTime(Math.min(f / fps, clip.duration - 1e-6)); obj.updateMatrixWorld(true);
    const hp = wp(sb('Hips')), fr = { hip: hp.clone(), q: {}, src: {} };
    for (const n of BONES) fr.q[n] = wq(sb(SRC[n])).multiply(rest[n]).multiply(TB[n]); // 세계 회전(우리 뼈)
    fr.leg = ['Left', 'Right'].map(S => ({ hipJ: wp(sb(S + 'UpLeg')), ank: wp(sb(S + 'Foot')), toe: wp(sb(S + 'ToeBase')) }));
    for (const n of ['hand.L', 'hand.R', 'foot.L', 'foot.R', 'head', 'leg.L', 'leg.R', 'foreArm.L', 'foreArm.R']) fr.src[n] = wp(sb(SRC[n])).sub(hp).multiplyScalar(k); // 맞춤 확인용(엉덩이 기준, 줄인 값)
    frames.push(fr);
  }
  // 뿌리 이동: 걷기·달리기(loop) = 처음→끝을 같은 빠르기로, 그 밖 = 첫 자리 고정
  const h0 = frames[0].hip, h1 = frames[nAll - 1].hip, net = V(h1.x - h0.x, 0, h1.z - h0.z), loop = !!opt.loop, inplace = loop || !!opt.inplace, n = loop ? nAll - 1 : nAll; // inplace = 반복하지 않는 동작에서도 처음→끝의 수평 이동을 뺀다(달리며 뛰기)
  const out = { src: path.basename(file), fps, n, dur: r4(n / fps), loop, k: r4(k * 100), hip: [], q: [], fit: {} };
  if (loop) { out.stride = r4(net.length() * k); out.speed = r4(out.stride / out.dur); out.srcSpeed = r4(net.length() / 100 / clip.duration); }
  let fitMax = {}, lowest = [], legClamp = 0;
  const pose = [];
  for (let f = 0; f < n; f++) {
    const fr = frames[f], u = inplace ? f / (nAll - 1) : 0;
    const hx = (fr.hip.x - h0.x - net.x * u) * k, hz = (fr.hip.z - h0.z - net.z * u) * k, hy = DIM.hipY + (fr.hip.y - restHipY) * k;
    B.hips.position.set(hx, hy, hz); rig.root.updateMatrixWorld(true);
    for (const nm of BONES) setWorldQuat(B[nm], fr.q[nm]);
    rig.root.updateMatrixWorld(true);
    { // 다리 맞춤: 엉덩이 높이 → 발목 자리(IK) → 발 회전
      const hj = s => B[`upLeg.${s}`].getWorldPosition(V());
      const dy = ['L', 'R'].reduce((a, s, i) => a + (DIM.ankleY + (fr.leg[i].hipJ.y - restAnkY) * k - hj(s).y), 0) / 2;
      B.hips.position.y += dy; rig.root.updateMatrixWorld(true);
      ['L', 'R'].forEach((s, i) => { const a = hj(s), t = a.clone().addScaledVector(fr.leg[i].ank.clone().sub(fr.leg[i].hipJ), k), pole = B[`leg.${s}`].getWorldPosition(V()).sub(a).normalize();
        const ik = twoBone(a, t, DIM.thigh, DIM.shin, pole), dirs = [ik.mid.clone().sub(a).normalize(), ik.end.clone().sub(ik.mid).normalize()];
        [`upLeg.${s}`, `leg.${s}`].forEach((bn, j) => { const base = fr.q[bn], cur = V(0, -1, 0).applyQuaternion(base); setWorldQuat(B[bn], new THREE.Quaternion().setFromUnitVectors(cur, dirs[j]).multiply(base)); }); // 비틀림은 원본 것을 그대로, 방향만 가장 적게 돌려 맞춘다
        setWorldQuat(B[`foot.${s}`], fr.q[`foot.${s}`]); setWorldQuat(B[`toe.${s}`], fr.q[`toe.${s}`]); legClamp = Math.max(legClamp, ik.ratio); });
      rig.root.updateMatrixWorld(true);
    }
    const hw = B.hips.getWorldPosition(V());
    for (const nm in fr.src) { const d = B[nm].getWorldPosition(V()).sub(hw).distanceTo(fr.src[nm]); fitMax[nm] = Math.max(fitMax[nm] || 0, d); }
    let low = Infinity; for (const s of ['L', 'R']) { const F = B[`foot.${s}`]; low = Math.min(low, F.localToWorld(V(0, -(DIM.ankleY - 0.02), DIM.toeZ)).y - 0.02, F.localToWorld(V(0, -(DIM.ankleY - 0.02), DIM.heelZ)).y - 0.02); }
    lowest.push(low);
    pose.push({ hip: [hx, B.hips.position.y, hz], q: BONES.map(nm => B[nm].quaternion.clone()) });
  }
  const sorted = [...lowest].sort((a, b) => a - b), yfix = opt.yfit ? -sorted[Math.floor(sorted.length * 0.1)] : 0; // 다리를 발목 자리로 맞춘 뒤에는 쓰지 않는다(yfit을 줄 때만). 우리 발이 원본보다 길어 뒤꿈치를 들면 발끝 점이 1~2cm 땅 아래로 내려가는데, 실행할 때 발끝을 땅에 고정하며 풀린다
  out.yfix = r4(yfix); out.legRatio = r4(legClamp); out.fit = Object.fromEntries(Object.entries(fitMax).map(([a, b]) => [a, r4(b)]));
  // 발 닿음: 원본에서 발목이나 발볼이 낮고(쉬는 높이 + 4cm 아래) 거의 서 있을 때(수평 빠르기가 느릴 때). 높이만으로는 흔드는 발이 땅을 스치는 순간과 구분되지 않는다.
  // 걷기·달리기는 왼발이 닿기 시작하는 장면을 0번으로 돌려 놓는다(두 동작을 같은 위상으로 섞으려고)
  const hgt = pose.map(p => { B.hips.position.set(p.hip[0], p.hip[1] + yfix, p.hip[2]); BONES.forEach((nm, i) => B[nm].quaternion.copy(p.q[i])); rig.root.updateMatrixWorld(true);
    return ['L', 'R'].map(s => { const F = B[`foot.${s}`]; return [F.localToWorld(V(0, -(DIM.ankleY - 0.02), DIM.toeZ)).y - 0.02, F.localToWorld(V(0, -(DIM.ankleY - 0.02), DIM.heelZ)).y - 0.02]; }); });
  const vAvg = net.length() / clip.duration, slow = 60 + 0.1 * vAvg, spd = (f, i, key) => { const a = frames[Math.min(f + 1, nAll - 1)].leg[i][key], b = frames[Math.max(f - 1, 0)].leg[i][key], dt = (Math.min(f + 1, nAll - 1) - Math.max(f - 1, 0)) / fps; return Math.hypot(a.x - b.x, a.z - b.z) / dt; };
  const con = hgt.map((h, f) => [0, 1].map(i => { const L = frames[f].leg[i]; return (L.toe.y < restToeY + 4 && spd(f, i, 'toe') < slow) || (L.ank.y < restAnkY + 4 && spd(f, i, 'ank') < slow); }));
  let rot = 0; if (loop) { for (let f = 0; f < n; f++) if (con[f][0] && !con[(f + n - 1) % n][0]) { rot = f; break; } }
  const order = Array.from({ length: n }, (_, i) => (i + rot) % n);
  out.contact = ['L', 'R'].map((s, i) => order.map(f => con[f][i] ? (hgt[f][i][1] < hgt[f][i][0] - 0.01 ? 'h' : hgt[f][i][0] < hgt[f][i][1] - 0.01 ? 't' : '#') : '.').join(''));
  out.duty = [0, 1].map(i => r4(con.filter(c => c[i]).length / n)); out.flight = r4(con.filter(c => !c[0] && !c[1]).length / n);
  out.con = [0, 1].map(i => order.map(f => con[f][i] ? '1' : '0').join('')); // 장면마다 발이 닿았는지(왼발, 오른발)
  if (opt.marks) { // 점프 동작의 표시: A = 도약 전 가장 낮게 웅크린 장면, G = 발이 아직 땅에 있는 마지막 장면, TO = 두 발이 뜬 첫 장면, LD = 다시 닿은 첫 장면, B = 착지 뒤 가장 낮은 장면.
    // 공중 구간의 엉덩이 높이에서 "뛰어오른 몫"(포물선)을 뺀다 → 실행할 때 몸의 높이는 물리가 정하고, 동작은 몸 기준 자세만 준다
    const low = f => Math.min(hgt[f][0][0], hgt[f][0][1], hgt[f][1][0], hgt[f][1][1]), hy = f => pose[f].hip[1]; let TO = 1; while (TO < n - 2 && !(low(TO) > 0.03 && low(TO + 1) > 0.03)) TO++; let LD = TO + 1; while (LD < n - 1 && low(LD) > 0.02) LD++;
    let A = 0, B = LD; for (let f = 0; f <= TO; f++) if (hy(f) < hy(A)) A = f; for (let f = LD; f < n; f++) if (hy(f) < hy(B)) B = f;
    let G = TO; while (G > A && low(G) > 0.012) G--; // G = 뜨기 전에 발이 아직 땅에 있는 마지막 장면(미는 동작의 끝)
    let Hc = 0; for (let f = G; f <= LD; f++) { const sN = (f - G) / (LD - G); Hc = Math.max(Hc, hy(f) - (hy(G) + (hy(LD) - hy(G)) * sN)); }
    for (let f = G; f <= LD; f++) { const sN = (f - G) / (LD - G); pose[f].hip[1] -= Hc * 4 * sN * (1 - sN); }
    out.marks = { A: r4(A / fps), G: r4(G / fps), TO: r4(TO / fps), LD: r4(LD / fps), B: r4(B / fps), rise: r4(Hc) };
  }
  const rq = opt.coarse ? r3 : r4; // 동작 보기용(coarse)은 소수 셋째 자리까지
  for (const f of order) { const p = pose[f]; out.hip.push(rq(p.hip[0]), rq(p.hip[1] + yfix), rq(p.hip[2])); for (const q of p.q) out.q.push(rq(q.x), rq(q.y), rq(q.z), rq(q.w)); }
  if (opt.coarse) { delete out.fit; delete out.contact; }
  return out;
}

// 이름으로 나눈 분류(동작 보기와 목록에서 쓴다)
export const category = n => /\bHang|Hanging|Shimmy|Freehang|Climb|Rope|Ladder|Wall|Swing/i.test(n) ? '등반·매달리기' : /Jump|Fall|Land|Flip|Trip|Drop/i.test(n) ? '점프·낙하' : /Walk|Run|Sprint|Strafe|Turn|Sneak|Stairs|Crawl|Change Direction|Wheelbarrow/i.test(n) ? '걷기·달리기' : /Idle|Stand|Crouch|Kneel|Bored|Looking|Breathing|Getting Up|Situp|Teeter|Floating|Stretch|Pose/i.test(n) ? '서 있기·일어서기' : '기타';

if (process.argv[1] && process.argv[1].endsWith('mixamo_convert.mjs')) {
  const args = process.argv.slice(2), all = args[0] === '--all'; if (all) args.shift();
  const [dir, outFile, listFile] = args;
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  if (all) { // 동작 보기용: 폴더의 FBX를 모두 옮긴다(초당 15장, 원본 이동 포함, 반복 처리 없음)
    const clips = {}, files = fs.readdirSync(dir).filter(f => /\.fbx$/i.test(f)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })); let bad = 0;
    for (const f of files) { try { const r = convert(path.join(dir, f), { fps: 15, coarse: true }); r.cat = category(f); clips[f.replace(/\.fbx$/i, '')] = r; } catch (e) { bad++; console.log('실패', f, e.message); } }
    fs.writeFileSync(outFile, JSON.stringify({ note: 'Mixamo(Adobe) 동작을 이 시제품 뼈대로 옮긴 값(동작 보기용). 저장소에 넣지 않는다.', bones: BONES, clips }));
    console.log(outFile, Object.keys(clips).length, '개 · 실패', bad, '·', fs.statSync(outFile).size, 'bytes');
  } else {
    const list = JSON.parse(fs.readFileSync(listFile || new URL('./mixamo_clips.json', import.meta.url), 'utf8')), clips = {};
    for (const [name, c] of Object.entries(list)) { const r = convert(path.join(dir, c.file), c); clips[name] = r; console.log(name.padEnd(14), c.file.padEnd(28), `${r.n}장 ${r.dur}초`, r.loop ? `보폭 ${r.stride}m · ${r.speed}m/s(원본 ${r.srcSpeed})` : '', `다리 뻗음 최대 ${r.legRatio}`, r.marks ? `표시 ${JSON.stringify(r.marks)}` : '', `닿은 몫 L ${r.duty[0]} R ${r.duty[1]} · 둘 다 뜸 ${r.flight}`, '\n   L ' + r.contact[0] + '\n   R ' + r.contact[1] + '\n   끝 자리 차이(최대, m):', JSON.stringify(r.fit)); }
    fs.writeFileSync(outFile, JSON.stringify({ note: 'Mixamo(Adobe) 동작을 이 시제품 뼈대로 옮긴 값. 저장소에 넣지 않는다.', bones: BONES, clips }));
    console.log(outFile, fs.statSync(outFile).size, 'bytes');
  }
}
