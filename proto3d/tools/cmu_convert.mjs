// CMU 동작(ASF·AMC, 120장/초)을 이 시제품의 뼈대(rig.js, 뼈 21개)로 옮겨 동작 보기 자료(gallery.json과 같은 모양)로 만든다.
// 사용: node tools/cmu_convert.mjs <출력.json> <ASF> <AMC> <이름> <시작초> <끝초> [<ASF> <AMC> <이름> <시작초> <끝초> …]
// - 원본 자료와 옮긴 값은 저장소에 넣지 않는다(이용 조건 확인 전. 출력은 assets_local/ 또는 세션 임시 폴더에). 이 도구만 저장소에 있다.
// - 읽기 약속(tools/cmu/amc.py와 같음): ASF length 0.45 → 1단위 = 1/0.45인치, y 위, "XYZ" 회전 = Rz·Ry·Rx, 뼈 방향은 ASF 틀(axis)에서. 확인: docs/CMU_동작_분석.md 1절.
// - 옮기는 방법(tools/mixamo_convert.mjs와 같은 원리): 원본 뼈가 쉬는 자세에서 지금까지 돈 세계 회전 × (우리 쉬는 방향 → 원본 쉬는 방향).
//   CMU의 쉬는 자세는 팔을 옆으로 편 T자, 우리는 팔을 내린 자세라 팔은 뼈마다 맞춘다. 두 뼈대 모두 왼쪽 = +x, 앞 = +z.
// - 다리: 발목 자리 = 고관절 기준 원본 발목 자리 × 다리 길이 비(두 마디 IK), 엉덩이 높이 = 원본 고관절 높이(바닥 기준) × 비. 바닥 = 그 파일 발목 높이의 2% 백분위.
// - 출력의 fit = 엉덩이 기준으로 줄인 원본 관절 자리와 옮긴 우리 관절 자리의 가장 큰 차이(m). 팔 길이 비가 달라 손 끝은 조금 다르다.
import * as THREE from 'three';
import fs from 'fs';
import path from 'path';
import { buildCharacter, DIM } from '../src/rig.js';
import { setWorldQuat, twoBone } from '../src/ik.js';
import { BONES } from './mixamo_convert.mjs';
import { armExcess, legExcess, kneeExcess } from '../src/anat.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), D = Math.PI / 180;
const r4 = x => Math.round(x * 1e4) / 1e4;
const eulXYZ = (x, y, z) => new THREE.Matrix4().makeRotationZ(z * D).multiply(new THREE.Matrix4().makeRotationY(y * D)).multiply(new THREE.Matrix4().makeRotationX(x * D));

export function loadAsf(file) {
  const txt = fs.readFileSync(file, 'latin1').replace(/\r/g, '');
  const sc = +(txt.split(':root')[0].match(/length\s+([\d.]+)/) || [0, 1])[1];
  const bones = {};
  for (const blk of txt.split(':bonedata')[1].split(':hierarchy')[0].split(/\bbegin\b/).slice(1)) {
    const d = { dof: [] };
    for (const ln of blk.split('\n')) { const p = ln.trim().split(/\s+/);
      if (p[0] === 'name') d.name = p[1]; else if (p[0] === 'direction') d.dir = V(+p[1], +p[2], +p[3]); else if (p[0] === 'length') d.len = +p[1];
      else if (p[0] === 'axis') d.axis = [+p[1], +p[2], +p[3]]; else if (p[0] === 'dof') d.dof = p.slice(1); }
    if (!d.name) continue; d.C = eulXYZ(...d.axis); d.Ci = d.C.clone().invert(); bones[d.name] = d;
  }
  const par = {};
  for (const ln of txt.split(':hierarchy')[1].split(/\bend\b/)[0].split('\n')) { const p = ln.trim().split(/\s+/); if (p.length < 2 || p[0] === 'begin') continue; for (const c of p.slice(1)) par[c] = p[0]; }
  return { bones, par, unit: (1 / sc) * 0.0254 };
}
export function loadAmc(file) {
  const fr = []; let cur = null;
  for (const raw of fs.readFileSync(file, 'latin1').split('\n')) { const ln = raw.trim(); if (!ln || ln[0] === '#' || ln[0] === ':') continue;
    if (/^\d+$/.test(ln)) { cur = {}; fr.push(cur); continue; } const p = ln.split(/\s+/); cur[p[0]] = p.slice(1).map(Number); }
  return fr;
}
// 한 장의 세계 자리(뼈 끝)·세계 회전(쉬는 자세 기준)
export function fk(S, f) {
  const r = f.root, pos = { root: V(r[0], r[1], r[2]).multiplyScalar(S.unit) }, rot = { root: eulXYZ(r[3], r[4], r[5]) };
  const kids = {}; for (const [c, p] of Object.entries(S.par)) (kids[p] = kids[p] || []).push(c);
  const st = ['root'];
  while (st.length) { const p = st.pop(); for (const c of kids[p] || []) { const d = S.bones[c], a = { rx: 0, ry: 0, rz: 0 }; (f[c] || []).forEach((v, i) => { a[d.dof[i]] = v; });
    rot[c] = rot[p].clone().multiply(d.C.clone().multiply(eulXYZ(a.rx, a.ry, a.rz)).multiply(d.Ci));
    pos[c] = pos[p].clone().add(d.dir.clone().multiplyScalar(d.len * S.unit).applyMatrix4(new THREE.Matrix4().extractRotation(rot[c]))); st.push(c); } }
  return { pos, rot };
}
// 우리 뼈 ← CMU 뼈(회전을 가져올 뼈). 우리 뼈가 가리키는 방향 = 그 CMU 뼈의 방향(dir)
const SRC = { hips: 'root', spine: 'upperback', chest: 'thorax', neck: 'lowerneck', head: 'head' };
for (const s of ['L', 'R']) { const c = s.toLowerCase(); Object.assign(SRC, { [`shoulder.${s}`]: `${c}clavicle`, [`upperArm.${s}`]: `${c}humerus`, [`foreArm.${s}`]: `${c}radius`, [`hand.${s}`]: `${c}hand`, [`upLeg.${s}`]: `${c}femur`, [`leg.${s}`]: `${c}tibia`, [`foot.${s}`]: `${c}foot`, [`toe.${s}`]: `${c}toes` }); }
const CHILD = {}; for (const s of ['L', 'R']) Object.assign(CHILD, { [`upperArm.${s}`]: `foreArm.${s}`, [`foreArm.${s}`]: `hand.${s}`, [`upLeg.${s}`]: `leg.${s}`, [`leg.${s}`]: `foot.${s}`, [`shoulder.${s}`]: `upperArm.${s}` });
const HAND_DIR = { 'hand.L': V(0, -1, 0), 'hand.R': V(0, -1, 0) }; // 우리 손의 쉬는 방향(팔을 내린 자세)

export function convert(asf, amc, t0, t1, fps = 30, opt = {}) {
  const S = loadAsf(asf), all = loadAmc(amc), step = Math.round(120 / fps), F = all.map(f => fk(S, f));
  const ankY = F.flatMap(x => [x.pos.ltibia.y, x.pos.rtibia.y]).sort((a, b) => a - b), floorAnk = ankY[Math.floor(ankY.length * 0.02)];
  const srcLeg = (S.bones.lfemur.len + S.bones.ltibia.len) * S.unit, k = DIM.leg / srcLeg;
  const rig = buildCharacter(), B = rig.bones; rig.root.updateMatrixWorld(true);
  const TB = {}; for (const n of BONES) { TB[n] = new THREE.Quaternion(); const c = CHILD[n];
    const ours = c ? B[c].getWorldPosition(V()).sub(B[n].getWorldPosition(V())).normalize() : HAND_DIR[n]; if (!ours) continue;
    TB[n].setFromUnitVectors(ours, S.bones[SRC[n]].dir.clone().normalize()); }
  const i0 = Math.max(0, Math.round(t0 * 120)), i1 = Math.min(all.length - 1, Math.round(t1 * 120)), h0 = F[i0].pos.root;
  const out = { src: `${path.basename(amc)} ${t0}~${t1}초`, fps, n: 0, dur: 0, loop: false, k: r4(k * 100), hip: [], q: [], fit: {}, cat: 'CMU', kind: 'ground', holds: [] };
  const fit = {}, con = [[], []], eff = [[], [], [], []]; let armReach = 0; const pinCut = [0, 0, 0, 0];
  for (let i = i0; i <= i1; i += step) {
    const { pos, rot } = F[i], qOf = n => new THREE.Quaternion().setFromRotationMatrix(rot[SRC[n]]).multiply(TB[n]);
    B.hips.position.set((pos.root.x - h0.x) * k, DIM.hipY, (pos.root.z - h0.z) * k); rig.root.updateMatrixWorld(true);
    for (const n of BONES) setWorldQuat(B[n], qOf(n)); rig.root.updateMatrixWorld(true);
    const hj = s => B[`upLeg.${s}`].getWorldPosition(V()), sh = ['l', 'r'];
    const dy = ['L', 'R'].reduce((a, s, j) => a + (DIM.ankleY + (pos[`${sh[j]}hipjoint`].y - floorAnk) * k - hj(s).y), 0) / 2;
    B.hips.position.y += dy; rig.root.updateMatrixWorld(true);
    ['L', 'R'].forEach((s, j) => { const a = hj(s), sj = pos[`${sh[j]}hipjoint`], t = a.clone().addScaledVector(pos[`${sh[j]}tibia`].clone().sub(sj), k), pole = B[`leg.${s}`].getWorldPosition(V()).sub(a).normalize();
      const ik = twoBone(a, t, DIM.thigh, DIM.shin, pole), dirs = [ik.mid.clone().sub(a).normalize(), ik.end.clone().sub(ik.mid).normalize()];
      [`upLeg.${s}`, `leg.${s}`].forEach((bn, m) => { const base = qOf(bn), cur = V(0, -1, 0).applyQuaternion(base); setWorldQuat(B[bn], new THREE.Quaternion().setFromUnitVectors(cur, dirs[m]).multiply(base)); });
      setWorldQuat(B[`foot.${s}`], qOf(`foot.${s}`)); setWorldQuat(B[`toe.${s}`], qOf(`toe.${s}`)); });
    rig.root.updateMatrixWorld(true);
    // 맞춤 확인: 엉덩이 기준 원본 관절 자리 × k ↔ 우리 관절 자리
    const hw = B.hips.getWorldPosition(V()), pairs = { 'hand.L': 'lwrist', 'hand.R': 'rwrist', 'foreArm.L': 'lhumerus', 'foreArm.R': 'rhumerus', 'leg.L': 'lfemur', 'leg.R': 'rfemur', 'foot.L': 'ltibia', 'foot.R': 'rtibia', head: 'lowerneck' };
    for (const [ob, cb] of Object.entries(pairs)) { const d = B[ob].getWorldPosition(V()).sub(hw).distanceTo(pos[cb].clone().sub(pos.root).multiplyScalar(k)); fit[ob] = Math.max(fit[ob] || 0, d); }
    // 닿음 후보(원본에서 손발이 초속 0.15m 아래로 멈춤) — 동작 보기 자료의 con·eff 모양
    const spd = (nm) => { const a = F[Math.max(0, i - 6)].pos[nm], b = F[Math.min(all.length - 1, i + 6)].pos[nm]; return a.distanceTo(b) / (12 / 120); };
    ['ltoes', 'rtoes'].forEach((nm, j) => con[j].push(spd(nm) < 0.15 ? '1' : '0'));
    ['lhand', 'rhand', 'ltoes', 'rtoes'].forEach((nm, j) => eff[j].push(spd(nm) < 0.15 ? '1' : '0'));
    out.hip.push(r4(B.hips.position.x), r4(B.hips.position.y), r4(B.hips.position.z)); for (const n of BONES) { const q = B[n].quaternion; out.q.push(r4(q.x), r4(q.y), r4(q.z), r4(q.w)); }
    out.n++;
  }
  // 손발 고정(handFit, 기본 켬): 원본에서 손·발이 멈춘 구간(0.15초 넘게)에는 우리 손목·발목을 그 구간이 시작할 때의 자리에 둔다(두 마디 IK, 방향만 가장 적게 돌림, 손·발 회전은 그대로). 앞뒤 0.1초는 섞는다.
  //   회전만 옮기면 팔·몸통의 길이 비가 달라 몸이 움직일 때 멈춘 손이 미끄러졌다(13_34에서 16cm). 손목을 원본 세계 자리(다리 길이 비로 줄임)에 맞추는 첫 시도는 팔이 짧아 닿지 않고(닿음 비 1.35) 팔뚝 방향이 원본과 65° 달라져 버렸다.
  //   사람 관절 범위(anat.js)가 먼저다: 고정하면 범위를 넘는 장면(원본 방향보다 1° 넘게 더 넘음)은 고정의 무게를 범위 안이 되는 가장 큰 값까지 줄인다(그만큼 미끄러짐이 남는다) —
  //   팔을 깊이 굽혀 매달린 장면(01_08 1.9~2.6초)에서 손목을 5~12cm 옮기자 팔꿈치가 굽는 면이 돌아 위팔 비틀림이 142°가 됐다
  if (opt.handFit !== false) {
    const blend = Math.round(0.1 * fps), pose = f => { B.hips.position.set(out.hip[3*f], out.hip[3*f+1], out.hip[3*f+2]); BONES.forEach((nm, j) => B[nm].quaternion.set(...out.q.slice(4*(f*21+j), 4*(f*21+j)+4))); rig.root.updateMatrixWorld(true); };
    const LIMB = [['upperArm.L', 'foreArm.L', 'hand.L', DIM.upperArm, DIM.foreArm, 1, 'arm'], ['upperArm.R', 'foreArm.R', 'hand.R', DIM.upperArm, DIM.foreArm, -1, 'arm'], ['upLeg.L', 'leg.L', 'foot.L', DIM.thigh, DIM.shin, 1, 'leg'], ['upLeg.R', 'leg.R', 'foot.R', DIM.thigh, DIM.shin, -1, 'leg']];
    const BALLL = V(0, -(DIM.ankleY - 0.02), DIM.ballZ), tip = (L, e) => e < 2 ? B[L[2]].getWorldPosition(V()) : B[L[2]].localToWorld(BALLL.clone()); // 발은 발볼을 고정한다(원본의 멈춤도 발가락으로 판정. 발목을 고정하면 뒤꿈치를 들 때 발볼이 움직였다 — 13_34 왼발 8.4cm)
    const endP = [[], [], [], []]; for (let f = 0; f < out.n; f++) { pose(f); LIMB.forEach((L, e) => endP[e].push(tip(L, e))); }
    const ivs = [0, 1, 2, 3].map(e => { const r = [], str = eff[e]; let i = 0; while (i < out.n) { if (str[i] === '1') { let j = i; while (j < out.n && str[j] === '1') j++; if (j - i >= Math.ceil(0.15 * fps)) r.push([i, j - 1]); i = j; } else i++; } return r; });
    const vA = v => [v.x, v.y, v.z], qA = q => [q.x, q.y, q.z, q.w];
    const excess = L => { const a = vA(B[L[0]].getWorldPosition(V())), m = vA(B[L[1]].getWorldPosition(V())), e = vA(B[L[2]].getWorldPosition(V()));
      if (L[6] === 'arm') return armExcess(qA(B.chest.getWorldQuaternion(new THREE.Quaternion())), a, m, e, L[5]);
      const qH = qA(B.hips.getWorldQuaternion(new THREE.Quaternion())); return Math.max(legExcess(qH, a, m, e, L[5]), kneeExcess(qH, a, m, e, L[5])); };
    const save = L => [L[0], L[1], L[2]].map(n => B[n].quaternion.clone()), load = (L, s) => { [L[0], L[1], L[2]].forEach((n, i) => B[n].quaternion.copy(s[i])); rig.root.updateMatrixWorld(true); };
    const aim = (L, t0, e) => { const a = B[L[0]].getWorldPosition(V()), pole = B[L[1]].getWorldPosition(V()).sub(a).normalize(), eq = B[L[2]].getWorldQuaternion(new THREE.Quaternion()), t = e >= 2 ? t0.clone().sub(BALLL.clone().applyQuaternion(eq)) : t0;
      const ik = twoBone(a, t, L[3], L[4], pole), dirs = [ik.mid.clone().sub(a).normalize(), ik.end.clone().sub(ik.mid).normalize()];
      [L[0], L[1]].forEach((bn, m) => { const base = B[bn].getWorldQuaternion(new THREE.Quaternion()), cur = B[m ? L[2] : L[1]].getWorldPosition(V()).sub(B[bn].getWorldPosition(V())).normalize(); setWorldQuat(B[bn], new THREE.Quaternion().setFromUnitVectors(cur, dirs[m]).multiply(base)); rig.root.updateMatrixWorld(true); });
      setWorldQuat(B[L[2]], eq); rig.root.updateMatrixWorld(true); return ik.ratio || 0; };
    for (let f = 0; f < out.n; f++) { pose(f); let touched = false;
      LIMB.forEach((L, e) => { let w = 0, tgt = null; for (const [a, b] of ivs[e]) { const ww = Math.min(1, (f - (a - blend)) / blend, ((b + blend) - f) / blend); if (ww > w) { w = ww; tgt = endP[e][a]; } } if (w <= 0) return;
        const s0 = save(L), ex0 = excess(L), lim = Math.max(0, ex0) + D; let ratio = aim(L, endP[e][f].clone().lerp(tgt, w), e);
        if (excess(L) > lim) { let lo = 0, hi = w; for (let it = 0; it < 8; it++) { const mid = (lo + hi) / 2; load(L, s0); aim(L, endP[e][f].clone().lerp(tgt, mid), e); if (excess(L) > lim) hi = mid; else lo = mid; } load(L, s0); ratio = aim(L, endP[e][f].clone().lerp(tgt, lo), e); pinCut[e]++; }
        if (L[6] === 'arm') armReach = Math.max(armReach, ratio); touched = true; });
      if (touched) BONES.forEach((nm, j) => { const q = B[nm].quaternion; out.q.splice(4*(f*21+j), 4, r4(q.x), r4(q.y), r4(q.z), r4(q.w)); });
    }
  }
  out.dur = r4(out.n / fps); out.fit = Object.fromEntries(Object.entries(fit).map(([a, b]) => [a, r4(b)])); out.con = con.map(c => c.join('')); out.eff = eff.map(c => c.join('')); out.duty = con.map(c => r4(c.filter(x => x === '1').length / c.length)); out.flight = 0; out.yfix = 0; out.legRatio = 0; out.armReach = r4(armReach); out.pinCut = pinCut;
  return out;
}

if (process.argv[1] && process.argv[1].endsWith('cmu_convert.mjs')) {
  const [outFile, ...rest] = process.argv.slice(2), clips = {};
  for (let i = 0; i + 4 < rest.length + 1 && rest[i]; i += 5) { const [asf, amc, name, t0, t1] = rest.slice(i, i + 5); const c = convert(asf, amc, +t0, +t1, 30, { handFit: process.env.NOHANDFIT ? false : true }); clips[name] = c; console.log(name.padEnd(28), `${c.n}장 ${c.dur}초 · k ${c.k} · 팔 닿음 비(1 넘으면 못 닿음) ${c.armReach} · 범위 때문에 고정을 줄인 장면(왼손·오른손·왼발·오른발) ${c.pinCut} · 맞춤(가장 큰 차이 m) ${JSON.stringify(c.fit)}`); }
  fs.writeFileSync(outFile, JSON.stringify({ note: 'CMU 동작을 이 뼈대로 옮긴 값(저장소에 넣지 않음)', bones: BONES, clips }));
}
