// 참고 자세 색인(p3d-0.10.1, GPT의 0.10.0 검토 "참고 자세 선택 + 접촉 IK"): 받은 Mixamo 등반 동작(벽·턱 계열)을 이 뼈대(제어 뼈대 21개)로 틀어
// 장면마다 ① 손발 배치(골반 기준, 몸이 벽을 보는 틀) ② 그때의 골반 돌림·기울기, 가슴의 돌림·옆 굽힘·앞 굽힘, 무릎·팔꿈치가 향하는 쪽을 잰다.
// 결과는 assets_local/ref_index.json(저장소에 넣지 않는다 — Mixamo 동작에서 뽑은 값). 게임은 캡처 빌드에서만 이 색인을 읽는다(sim.ref, 실험 설정 기본 끔).
// 사용: node tools/ref_pose.mjs [출력]   (assets_local/gallery.json이 있어야 한다)
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), imp = f => import(pathToFileURL(path.resolve(HERE, '../src', f)).href);
const THREE = await import('three');
const { buildCharacter, DIM } = await imp('rig.js'), { poseRaw } = await imp('clipmotion.js');
const G = JSON.parse(fs.readFileSync(path.resolve(HERE, '../assets_local/gallery.json'), 'utf8'));
const out = process.argv[2] || path.resolve(HERE, '../assets_local/ref_index.json');
const rig = buildCharacter(), B = rig.bones, V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), wp = n => B[n].getWorldPosition(V()), wq = n => B[n].getWorldQuaternion(new THREE.Quaternion());
const deg = r => r * 180 / Math.PI, r3 = v => +v.toFixed(3), r1 = v => +v.toFixed(1);
// 몸의 틀: 동작은 벽을 +z로 본다(잡는 자리 p의 z가 몸보다 크다). 골반 자리 기준의 상대 자리를 쓴다
function metrics() {
  const hip = wp('hips'), qH = wq('hips'), qC = wq('chest'), fH = V(0, 0, 1).applyQuaternion(qH), uH = V(0, 1, 0).applyQuaternion(qH), fC = V(0, 0, 1).applyQuaternion(qC), uC = V(0, 1, 0).applyQuaternion(qC);
  const ang = (f, u) => ({ yaw: deg(Math.atan2(f.x, f.z)), pitch: deg(Math.asin(THREE.MathUtils.clamp(-f.y, -1, 1))), roll: deg(Math.atan2(u.x, u.y)) });
  const P = ang(fH, uH), C = ang(fC, uC);
  // 무릎·팔꿈치가 향하는 쪽: 가운데 관절이 뿌리–끝 선에서 벗어난 방향(몸의 틀, 왼쪽 = +x)을 "바깥으로 연 각"으로(0 = 앞(벽 쪽), +90 = 몸 바깥 옆)
  const pole = (a, m, e, sx) => { const A = wp(a), M = wp(m), E = wp(e), u = E.clone().sub(A).normalize(), p = M.clone().sub(A); p.addScaledVector(u, -p.dot(u)); const L = p.length(); return L < 0.01 ? null : r1(deg(Math.atan2(sx * p.x, p.z))); };
  return { pelvis: { yaw: r1(P.yaw), pitch: r1(P.pitch), roll: r1(P.roll) }, chest: { yaw: r1(C.yaw - P.yaw), pitch: r1(C.pitch - P.pitch), roll: r1(C.roll - P.roll) },
    knee: [pole('upLeg.L', 'leg.L', 'foot.L', 1), pole('upLeg.R', 'leg.R', 'foot.R', -1)], elbow: [pole('upperArm.L', 'foreArm.L', 'hand.L', 1), pole('upperArm.R', 'foreArm.R', 'hand.R', -1)], hip };
}
const frames = [];
for (const [name, c] of Object.entries(G.clips)) {
  if (!['wall', 'ledge'].includes(c.kind)) continue;
  for (let f = 0; f < c.n; f++) {
    poseRaw(rig, G.bones, c, f / c.fps, V(), 0); rig.root.updateMatrixWorld(true);
    const m = metrics(), hip = m.hip, rel = n => wp(n).sub(hip), palm = s => B[`hand.${s}`].localToWorld(V(0, -0.08, 0)).sub(hip);
    const con = c.eff ? c.eff.map(s => s[f] === '1') : [false, false, false, false];
    // 두 손이 골반보다 위에 있고 적어도 한 손이 닿아 있는 장면만(벽에 붙은 자세)
    if (!(con[0] || con[1])) continue;
    frames.push({ clip: name, f, con: con.map(Number), feat: [...palm('L').toArray(), ...palm('R').toArray(), ...rel('foot.L').toArray(), ...rel('foot.R').toArray()].map(r3), pelvis: m.pelvis, chest: m.chest, knee: m.knee, elbow: m.elbow });
  }
}
const note = 'Mixamo(Adobe) 등반 동작을 이 시제품의 제어 뼈대로 틀어 뽑은 값(골반 기준 손발 자리 + 골반·가슴 각, 무릎·팔꿈치 방향). 저장소에 넣지 않는다.';
fs.writeFileSync(out, JSON.stringify({ note, dim: { hipY: DIM.hipY, leg: DIM.leg, arm: DIM.arm }, feat: '손바닥 L/R(손목에서 8cm), 발목 L/R — 골반 뼈 기준, 몸은 +z(벽)를 본다', frames }));
// 요약: 손발 배치별 각도의 범위(사람의 정답이 아니라 이 동작 묶음의 값)
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) * p)] : null; }, rng = a => `${r1(q(a, 0.1))} ~ ${r1(q(a, 0.9))} (가운데 ${r1(q(a, 0.5))})`;
const clipsUsed = new Set(frames.map(x => x.clip));
console.log(out, '장면', frames.length, '동작', clipsUsed.size);
const grp = { '한 발이 다른 발보다 25cm 넘게 높다(발 올림)': x => Math.abs(x.feat[7] - x.feat[10]) > 0.25, '두 발 높이가 비슷하다': x => Math.abs(x.feat[7] - x.feat[10]) < 0.1, '한 손이 다른 손보다 25cm 넘게 높다(뻗기)': x => Math.abs(x.feat[1] - x.feat[4]) > 0.25 };
for (const [g, fn] of Object.entries(grp)) { const a = frames.filter(fn); if (!a.length) continue; const highFootLeft = a.map(x => x.feat[7] > x.feat[10]);
  console.log(`■ ${g}: ${a.length}장면 · 골반 돌림 ${rng(a.map(x => x.pelvis.yaw * (x.feat[7] > x.feat[10] ? 1 : -1)))}° (높은 발 쪽이 +) · 골반 옆 기울기 ${rng(a.map(x => x.pelvis.roll))} · 골반 앞 숙임 ${rng(a.map(x => x.pelvis.pitch))} · 가슴(골반 기준) 돌림 ${rng(a.map(x => x.chest.yaw))} 옆 ${rng(a.map(x => x.chest.roll))} 앞 ${rng(a.map(x => x.chest.pitch))}`);
  const kHigh = a.map(x => x.knee[x.feat[7] > x.feat[10] ? 0 : 1]).filter(v => v !== null), kLow = a.map(x => x.knee[x.feat[7] > x.feat[10] ? 1 : 0]).filter(v => v !== null);
  console.log(`   무릎을 연 각(0 = 벽 쪽, 90 = 옆): 높은 발 ${rng(kHigh)} · 낮은 발 ${rng(kLow)} · 팔꿈치 ${rng(a.flatMap(x => x.elbow).filter(v => v !== null))}`); void highFootLeft; }
