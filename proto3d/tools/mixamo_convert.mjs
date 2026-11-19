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
const PALM = new THREE.Vector3(0, -0.08, 0), BALL = new THREE.Vector3(0, -(DIM.ankleY - 0.02), DIM.ballZ); // 손바닥 가운데(손목에서 8cm), 발볼
export const EFF = ['hand.L', 'hand.R', 'foot.L', 'foot.R'];

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
  const fps = opt.fps || 30, nRaw = Math.max(2, Math.round(clip.duration * fps) + 1); let frames = [];
  for (let f = 0; f < nRaw; f++) {
    mixer.setTime(Math.min(f / fps, clip.duration - 1e-6)); obj.updateMatrixWorld(true);
    const hp = wp(sb('Hips')), fr = { hip: hp.clone(), q: {}, src: {} };
    for (const n of BONES) fr.q[n] = wq(sb(SRC[n])).multiply(rest[n]).multiply(TB[n]); // 세계 회전(우리 뼈)
    fr.leg = ['Left', 'Right'].map(S => ({ hipJ: wp(sb(S + 'UpLeg')), ank: wp(sb(S + 'Foot')), toe: wp(sb(S + 'ToeBase')) }));
    fr.eff = [wp(sb('LeftHand')), wp(sb('RightHand')), fr.leg[0].toe, fr.leg[1].toe]; // 손목·발볼(원본, cm): 서 있는지(닿아 있는지) 판정에 쓴다
    for (const n of ['hand.L', 'hand.R', 'foot.L', 'foot.R', 'head', 'leg.L', 'leg.R', 'foreArm.L', 'foreArm.R']) fr.src[n] = wp(sb(SRC[n])).sub(hp).multiplyScalar(k); // 맞춤 확인용(엉덩이 기준, 줄인 값)
    frames.push(fr);
  }
  if (opt.frames) frames = frames.slice(opt.frames[0], opt.frames[1] + 1); // 동작의 한 토막만 쓴다(장면 번호, 초당 30장 기준)
  const nAll = frames.length;
  // 뿌리 이동: 걷기·달리기(loop) = 처음→끝을 같은 빠르기로, 그 밖 = 첫 자리 고정
  const h0 = frames[0].hip, h1 = frames[nAll - 1].hip, net = V(h1.x - h0.x, 0, h1.z - h0.z), loop = !!opt.loop, inplace = loop || !!opt.inplace, n = loop ? nAll - 1 : nAll; // inplace = 반복하지 않는 동작에서도 처음→끝의 수평 이동을 뺀다(달리며 뛰기)
  const out = { src: path.basename(file), fps, n, dur: r4(n / fps), loop, k: r4(k * 100), hip: [], q: [], fit: {} };
  const cycles = opt.cycles || 1; // 동작 하나에 걸음 주기가 두 번 들어 있으면 2(보폭 = 한 주기의 거리)
  if (loop) { out.stride = r4(net.length() * k / cycles); out.speed = r4(net.length() * k / out.dur); out.srcSpeed = r4(net.length() / 100 / (n / fps)); if (cycles > 1) out.cycles = cycles; }
  if (opt.pingpong) out.pp = true; // 반복 지점이 없는 가만히 있는 자세: 끝까지 갔다가 거꾸로 돌아온다
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
    const effOurs = [['hand.L', PALM], ['hand.R', PALM], ['foot.L', BALL], ['foot.R', BALL]].map(([bn, l]) => B[bn].localToWorld(l.clone()));
    pose.push({ eff: effOurs, hip: [hx, B.hips.position.y, hz], q: BONES.map(nm => B[nm].quaternion.clone()) });
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
  if (opt.holds) { // 손발 닿음(동작 준비용): 원본에서 그 손발이 거의 서 있는 구간(0.2초 이상) = 무언가를 잡거나 디딘 구간. 닿은 자리는 이 뼈대로 옮긴 뒤의 자리(뿌리 기준)
    const SPD = 38, run = EFF.map((_, e) => frames.slice(0, n).map((fr, f) => { const a = frames[Math.min(f + 1, n - 1)].eff[e], b = frames[Math.max(f - 1, 0)].eff[e], dt = (Math.min(f + 1, n - 1) - Math.max(f - 1, 0)) / fps; return dt > 0 && a.distanceTo(b) / dt < SPD; }));
    // holds의 r = 그 손발이 엉덩이보다 얼마나 위인가(손이 허리 아래에서 서 있는 것은 잡은 것이 아니라 내려뜨린 손이다), d = 엉덩이에서 옆으로 떨어진 거리(발이 엉덩이 바로 아래 멀리 있으면 서 있는 발, 앞으로 나가 있으면 벽에 댄 발)
    out.eff = []; out.holds = [];
    run.forEach((r, e) => { for (let f = 1; f < n - 1; f++) if (!r[f] && r[f - 1] && r[f + 1]) r[f] = true; // 한 장짜리 틈은 메운다
      // 느리게 미끄러지는 손발은 닿은 것이 아니다: 구간이 시작한 자리에서 7cm 넘게 벗어나면 거기서 구간을 끊는다
      { let a0 = -1; for (let f = 0; f < n; f++) { if (!r[f]) { a0 = -1; continue; } if (a0 < 0) a0 = f; else if (frames[f].eff[e].distanceTo(frames[a0].eff[e]) > 7) { r[f] = false; a0 = -1; } } }
      let s0 = -1; for (let f = 0; f <= n; f++) { const on = f < n && r[f]; if (on && s0 < 0) s0 = f; if (!on && s0 >= 0) { if (f - s0 >= Math.max(3, Math.round(0.2 * fps))) { const m = V(); let rel = 0, hd = 0; for (let k = s0; k < f; k++) { const q = pose[k].eff[e]; m.add(q); rel += q.y - pose[k].hip[1]; hd += Math.hypot(q.x - pose[k].hip[0], q.z - pose[k].hip[2]); } m.multiplyScalar(1 / (f - s0)); out.holds.push({ e, f0: s0, f1: f - 1, p: [r3(m.x), r3(m.y + yfix), r3(m.z)], r: r3(rel / (f - s0)), d: r3(hd / (f - s0)) }); } else for (let k = s0; k < f; k++) r[k] = false; s0 = -1; } }
      out.eff.push(r.map(x => (x ? '1' : '0')).join('')); });
  }
  const rq = opt.coarse ? r3 : r4; // 동작 보기용(coarse)은 소수 셋째 자리까지
  for (const f of order) { const p = pose[f]; out.hip.push(rq(p.hip[0]), rq(p.hip[1] + yfix), rq(p.hip[2])); for (const q of p.q) out.q.push(rq(q.x), rq(q.y), rq(q.z), rq(q.w)); }
  if (opt.coarse) { delete out.fit; delete out.contact; }
  return out;
}

// 이름으로 나눈 분류(동작 보기와 목록에서 쓴다)
export const category = n => /\bHang|Hanging|Shimmy|Freehang|Climb|Rope|Ladder|Wall|Swing/i.test(n) ? '등반·매달리기' : /Jump|Fall|Land|Flip|Trip|Drop/i.test(n) ? '점프·낙하' : /Walk|Run|Sprint|Strafe|Turn|Sneak|Stairs|Crawl|Change Direction|Wheelbarrow|Side Step/i.test(n) ? '걷기·달리기' : /Idle|Stand|Crouch|Kneel|Bored|Looking|Breathing|Getting Up|Situp|Teeter|Floating|Stretch|Pose/i.test(n) ? '서 있기·일어서기' : '기타';

// 이름으로 정한 지형 종류(동작 시연장에서 어떤 지형을 놓을지)
export const terrainKind = n => /Rope|Swing/i.test(n) ? 'rope' : /Ladder/i.test(n) ? 'ladder' : /Wall Run|Sprint To Wall|Jump From Wall|Climbing (Up|Down) Wall/i.test(n) ? 'wall' : /Stairs/i.test(n) ? 'stairs' : /Teeter|Cover Sneak/i.test(n) ? 'narrow'
  : /\bHang|Hanging|Shimmy|Freehang|Climbing To Top|^Climbing( \(\d+\))?$|^Climbing Down( \(\d+\))?$/i.test(n) ? 'ledge' : 'ground';
export const KIND_KO = { ledge: '턱·매달리기', wall: '벽', rope: '밧줄', ladder: '사다리', stairs: '계단', narrow: '좁은 길·벽에 붙기', ground: '땅' };

if (process.argv[1] && process.argv[1].endsWith('mixamo_convert.mjs')) {
  const args = process.argv.slice(2), all = args[0] === '--all'; if (all) args.shift();
  const [dir, outFile, listFile] = args;
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  if (all) { // 동작 보기용: 폴더의 FBX를 모두 옮긴다(초당 15장, 원본 이동 포함, 반복 처리 없음)
    const clips = {}, files = fs.readdirSync(dir).filter(f => /\.fbx$/i.test(f)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })); let bad = 0;
    for (const f of files) { try { const r = convert(path.join(dir, f), { fps: 15, coarse: true, holds: true }); r.cat = category(f); r.kind = terrainKind(f.replace(/\.fbx$/i, '')); clips[f.replace(/\.fbx$/i, '')] = r; } catch (e) { bad++; console.log('실패', f, e.message); } }
    fs.writeFileSync(outFile, JSON.stringify({ note: 'Mixamo(Adobe) 동작을 이 시제품 뼈대로 옮긴 값(동작 보기용). 저장소에 넣지 않는다.', bones: BONES, clips }));
    console.log(outFile, Object.keys(clips).length, '개 · 실패', bad, '·', fs.statSync(outFile).size, 'bytes');
    if (listFile) { // 동작 표(이름·분류·지형·길이·손발이 닿는 구간 수와 높이). 동작 값은 들어가지 않는다
      const rows = ['동작,분류,지형,길이(초),왼손 잡음(구간 수),오른손 잡음,왼발 디딤,오른발 디딤,손 잡는 높이(m),땅 위 발 디딤 높이(m),끝날 때 엉덩이 높이 변화(m)'];
      for (const [nm, c] of Object.entries(clips)) { const cnt = e => c.holds.filter(h => h.e === e).length, hs = [...new Set(c.holds.filter(h => h.e < 2).map(h => h.p[1].toFixed(1)))].sort().join(' '), fs2 = [...new Set(c.holds.filter(h => h.e >= 2 && h.p[1] > 0.08).map(h => h.p[1].toFixed(1)))].sort().join(' ');
        rows.push([`"${nm}"`, c.cat, KIND_KO[c.kind], c.dur, cnt(0), cnt(1), cnt(2), cnt(3), `"${c.kind === 'ground' || c.kind === 'stairs' || c.kind === 'narrow' ? '' : hs}"`, `"${fs2}"`, r3(c.hip[c.hip.length - 2] - c.hip[1])].join(',')); }
      fs.writeFileSync(listFile, rows.join('\n') + '\n'); console.log(listFile, rows.length - 1, '줄'); }
  } else {
    const list = JSON.parse(fs.readFileSync(listFile || new URL('./mixamo_clips.json', import.meta.url), 'utf8')), clips = {};
    for (const [name, c] of Object.entries(list)) { const r = convert(path.join(dir, c.file), c); clips[name] = r; console.log(name.padEnd(14), c.file.padEnd(28), `${r.n}장 ${r.dur}초`, r.loop ? `보폭 ${r.stride}m · ${r.speed}m/s(원본 ${r.srcSpeed})` : '', `다리 뻗음 최대 ${r.legRatio}`, r.marks ? `표시 ${JSON.stringify(r.marks)}` : '', `닿은 몫 L ${r.duty[0]} R ${r.duty[1]} · 둘 다 뜸 ${r.flight}`, '\n   L ' + r.contact[0] + '\n   R ' + r.contact[1] + '\n   끝 자리 차이(최대, m):', JSON.stringify(r.fit)); }
    fs.writeFileSync(outFile, JSON.stringify({ note: 'Mixamo(Adobe) 동작을 이 시제품 뼈대로 옮긴 값. 저장소에 넣지 않는다.', bones: BONES, clips }));
    console.log(outFile, fs.statSync(outFile).size, 'bytes');
  }
}
