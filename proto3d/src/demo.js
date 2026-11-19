// 동작 시연장(동작 보기에서 쓴다): 옮긴 동작 하나에 맞는 지형 조각을 그 동작의 "손발이 닿는 자리"에서 만들어 함께 보인다.
// - 게임 동작이 아니다. 캡처 동작을 지형에 맞춰 트는 자동 시연이고, 잡을 수 있는지·버티는지의 물리 판정이 없다(화면에 그렇게 밝힌다).
// - 지형은 동작마다 변환할 때 뽑아 둔 값(clip.holds: 손·발이 거의 서 있던 구간과 그 자리)과 이름으로 정한 지형 종류(clip.kind)에서 만든다.
// - 잡은 손은 그 구간 동안 지형의 그 자리에 붙인다(팔 두 마디 IK). 팔 길이·어깨 폭이 원본과 달라 옮긴 자세만으로는 손이 몇 cm씩 떠다니기 때문이다.
import * as THREE from 'three';
import { DIM } from './rig.js';
import { setWorldQuat, worldPos, twoBone } from './ik.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), clamp = THREE.MathUtils.clamp, med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const PALM = V(0, -0.08, 0), DOWN = V(0, -1, 0);
const MAT = { block: new THREE.MeshStandardMaterial({ color: '#b3aa98', roughness: 0.95 }), edge: new THREE.MeshStandardMaterial({ color: '#c98a4a', roughness: 0.8 }), rope: new THREE.MeshStandardMaterial({ color: '#8a6a3c', roughness: 0.9 }), metal: new THREE.MeshStandardMaterial({ color: '#7d8791', roughness: 0.6 }), hold: new THREE.MeshStandardMaterial({ color: '#c9a04a', roughness: 0.8 }) };
const box = (g, mat, x0, x1, y0, y1, z0, z1) => { if (x1 - x0 < 1e-3 || y1 - y0 < 1e-3 || z1 - z0 < 1e-3) return; const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
const cyl = (g, mat, a, b, r) => { const d = b.clone().sub(a), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 10), mat); m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(V(0, 1, 0), d.clone().normalize()); m.castShadow = true; g.add(m); return m; };
// 높이가 비슷한 것끼리 묶는다
function levels(hs, tol = 0.16) { const out = []; for (const h of [...hs].sort((a, b) => a.p[1] - b.p[1])) { const L = out[out.length - 1]; if (L && h.p[1] - L[L.length - 1].p[1] < tol) L.push(h); else out.push([h]); } return out; }

// 지형 조각과 손이 붙을 자리(grip)를 만든다. 좌표는 동작의 뿌리 기준(앞 = +z, 왼쪽 = +x, 땅 = 0)
export function buildProps(clip) {
  // 손: 엉덩이보다 15cm 넘게 위에서 서 있을 때만 잡은 것으로 본다(내려뜨린 손·서 있는 자세의 손은 뺀다. 손으로 눌러 올라서는 순간도 빠진다)
  const g = new THREE.Group(), H = (clip.holds || []).filter(h => h.e >= 2 || (h.r ?? 1) >= 0.15).map(h => ({ ...h, grip: null })), hands = H.filter(h => h.e < 2), feet = H.filter(h => h.e >= 2), kind = clip.kind, info = { kind, pieces: 0, dynamic: null };
  const bracket = h => { box(g, MAT.hold, h.p[0] - 0.09, h.p[0] + 0.09, h.p[1] - 0.07, h.p[1] - 0.02, h.p[2] - 0.04, h.p[2] + 0.08); h.grip = V(h.p[0], h.p[1], h.p[2]); }; // 벽 없이 떠 있는 작은 홀드(임시)
  const xs = hs => [Math.min(...hs.map(h => h.p[0])), Math.max(...hs.map(h => h.p[0]))];
  if (kind === 'ledge' && (hands.length || feet.some(f => f.p[1] > 0.5))) {
    const standing = feet.filter(f => (f.r ?? -1) < -0.45 && (f.d ?? 0) < 0.35), fMax = Math.max(0, ...standing.map(f => f.p[1])), top = fMax > 0.5 ? standing.filter(f => f.p[1] > fMax - 0.15) : []; // 서서 디딘 발(엉덩이 아래 멀리, 옆으로 가까이) 가운데 가장 높은 것(0.5m 넘게) = 윗면에 올라선 발. 벽에 댄 발은 뺀다
    const lowAll = H.filter(h => h.p[1] > 0.2 && h.p[1] < fMax - 0.12 && !top.includes(h));
    if (top.length && (lowAll.length || hands.length)) { // 올라서거나 내려오는 동작: 윗면 = 올라선 발의 높이. 그 아래에서 닿는 손발 = 벽, 윗면 모서리 높이의 손 = 모서리를 잡은 손, 그 밖 = 작은 홀드
      // 윗면이 어느 쪽에 있는가: 올라선 발이 벽에 닿는 손발보다 앞(+z)이면 앞쪽, 뒤면 뒤쪽(올라가서 돌아 내려오는 동작은 뒤쪽이다). 벽면은 그 경계
      const y = med(top.map(f => f.p[1])) - 0.02, low = lowAll.length ? lowAll : hands, mz = a => a.reduce((s, h) => s + h.p[2], 0) / a.length, sg = mz(top) >= mz(low) ? 1 : -1;
      const zw = sg > 0 ? Math.max(...low.map(h => h.p[2] + (h.e < 2 ? 0.04 : 0.05))) : Math.min(...low.map(h => h.p[2] - (h.e < 2 ? 0.04 : 0.05))), [x0, x1] = xs(H), a = x0 - 0.6, b = x1 + 0.6, far = sg > 0 ? Math.max(zw + 1.2, ...top.map(h => h.p[2] + 0.7)) : Math.min(zw - 1.2, ...top.map(h => h.p[2] - 0.7));
      box(g, MAT.block, a, b, lowAll.length ? 0 : y - 0.3, y - 0.07, Math.min(zw, far), Math.max(zw, far)); box(g, MAT.edge, a, b, y - 0.07, y, Math.min(zw, far), Math.max(zw, far)); // 아래 벽에 닿는 손발이 없으면(허공에 매달림) 윗면 판만 둔다
      for (const h of hands) { if (Math.abs(h.p[1] - y) < 0.14) h.grip = V(h.p[0], y + 0.02, sg > 0 ? Math.max(h.p[2], zw + 0.05) : Math.min(h.p[2], zw - 0.05)); else if (h.p[1] < y) { box(g, MAT.hold, h.p[0] - 0.09, h.p[0] + 0.09, h.p[1] - 0.07, h.p[1] - 0.02, Math.min(zw, zw - sg * 0.08), Math.max(zw, zw - sg * 0.08)); h.grip = V(h.p[0], h.p[1], zw - sg * 0.04); } else bracket(h); }
    } else if (hands.length) { // 매달리는 동작: 턱 = 손으로 가장 오래 잡는 높이 하나. 다른 높이의 손은 벽의 작은 홀드(높이마다 턱을 쌓지 않는다)
      const Ls = levels(hands), dur = L => L.reduce((a, h) => a + h.f1 - h.f0, 0), main = Ls.reduce((a, L) => (dur(L) > dur(a) ? L : a), Ls[0]);
      const y = med(main.map(h => h.p[1])) - 0.02, ze = Math.min(...main.map(h => h.p[2])) - 0.05, [x0, x1] = xs(H), a = x0 - 0.6, b = x1 + 0.6; // 윗면 높이, 턱의 모서리(손이 걸리는 가장 앞쪽보다 조금 앞)
      const under = H.filter(h => h.p[1] > 0.2 && h.p[1] < y - 0.25 && !main.includes(h)), zw = under.length ? Math.max(ze, Math.max(...under.map(f => f.p[2] + (f.e < 2 ? 0.04 : 0.05)))) : null; // 턱 아래 벽에 닿는 손발
      box(g, MAT.edge, a, b, y - 0.07, y, ze, ze + 0.28); if (zw !== null) box(g, MAT.block, a, b, 0, y - 0.07, zw, zw + 0.3);
      for (const h of main) h.grip = V(h.p[0], y + 0.02, Math.max(h.p[2], ze + 0.05));
      for (const h of hands) if (!main.includes(h)) { if (zw !== null && h.p[1] < y) { box(g, MAT.hold, h.p[0] - 0.09, h.p[0] + 0.09, h.p[1] - 0.07, h.p[1] - 0.02, zw - 0.08, zw); h.grip = V(h.p[0], h.p[1], zw - 0.04); } else bracket(h); }
    }
  } else if (kind === 'wall' && H.length) {
    const up = H.filter(h => h.p[1] > 0.2); if (up.length) { const zw = Math.max(...up.map(h => h.p[2] + (h.e < 2 ? 0.04 : 0.06))), [x0, x1] = xs(H), top = Math.max(...up.map(h => h.p[1])) + 0.8;
      box(g, MAT.block, x0 - 0.9, x1 + 0.9, 0, top, zw, zw + 0.3);
      for (const h of up) { box(g, MAT.hold, h.p[0] - 0.08, h.p[0] + 0.08, h.p[1] - 0.06, h.p[1] - 0.01, zw - 0.07, zw); if (h.e < 2) h.grip = V(h.p[0], h.p[1], zw - 0.035); } }
  } else if (kind === 'rope') {
    if (hands.length >= 2 && !/Swing/i.test(clip.src || '')) { const x = med(hands.map(h => h.p[0])), z = med(hands.map(h => h.p[2])), top = Math.max(...hands.map(h => h.p[1])) + 1.6; cyl(g, MAT.rope, V(x, 0.05, z), V(x, top, z), 0.022); for (const h of hands) h.grip = V(x, h.p[1], z); }
    else info.dynamic = 'rope'; // 흔들리는 밧줄: 장면마다 두 손 자리에 맞춰 그린다
  } else if (kind === 'ladder' && H.some(h => h.p[1] > 0.2)) {
    const up = H.filter(h => h.p[1] > 0.2), z = med(hands.length ? hands.map(h => h.p[2]) : up.map(h => h.p[2])) + 0.02, x = med(up.map(h => h.p[0])), top = Math.max(...up.map(h => h.p[1]), 2) + 0.9, step = 0.3, off = med(up.map(h => ((h.p[1] - (h.e < 2 ? 0 : 0.02)) % step + step) % step));
    for (const sx of [-0.25, 0.25]) cyl(g, MAT.metal, V(x + sx, 0, z), V(x + sx, top, z), 0.02);
    for (let y = off; y < top; y += step) if (y > 0.1) cyl(g, MAT.metal, V(x - 0.25, y, z), V(x + 0.25, y, z), 0.016);
    for (const h of hands) h.grip = V(clamp(h.p[0], x - 0.22, x + 0.22), off + Math.round((h.p[1] - off) / step) * step, z);
  } else if (kind === 'stairs') {
    const steps = []; for (const f of feet.filter(f => f.p[1] > 0.06).sort((a, b) => a.p[1] - b.p[1])) if (!steps.some(s => Math.abs(s.p[1] - f.p[1]) < 0.08)) steps.push(f);
    const x = feet.length ? med(feet.map(f => f.p[0])) : 0; steps.forEach((s, i) => { const z1 = steps[i + 1] ? steps[i + 1].p[2] - 0.14 : s.p[2] + 0.5; box(g, MAT.block, x - 0.7, x + 0.7, 0, s.p[1] - 0.02, s.p[2] - 0.14, Math.max(z1, s.p[2] + 0.12)); });
  } else if (kind === 'narrow') {
    const up = feet.filter(f => f.p[1] > 0.2); if (up.length) { const y = med(up.map(f => f.p[1])) - 0.02, [x0, x1] = xs(up), z = med(up.map(f => f.p[2])); box(g, MAT.block, x0 - 1.0, x1 + 1.0, 0, y, z - 0.16, z + 0.16); }
  }
  // 맞춤 확인: 동작 내내 엉덩이가 지나는 자리가 조각 안에 들어가면 그 조각은 이 동작의 지형이 아니다(돌아서 내려오는 동작처럼 벽의 방향을 손발 자리만으로는 알 수 없는 경우) → 그 조각을 빼고 적어 둔다
  { g.updateMatrixWorld(true); const bad = new Set(), pt = V(); for (let f = 0; f < clip.n; f++) { pt.set(clip.hip[f * 3], clip.hip[f * 3 + 1], clip.hip[f * 3 + 2]); for (const m of g.children) if (m.geometry.type === 'BoxGeometry' && new THREE.Box3().setFromObject(m).expandByScalar(-0.04).containsPoint(pt)) bad.add(m); }
    info.removed = bad.size; for (const m of bad) g.remove(m); }
  info.pieces = g.children.length;
  return { group: g, holds: H, info };
}

// 흔들리는 밧줄: 두 손의 가운데를 지나 위쪽 고정점까지 한 줄(장면마다 다시 놓는다). 고정점은 동작 전체에서 손이 지나간 자리의 가운데 위쪽
export function makeSwingRope(group, clip, palmsAt) {
  let top = 0, sx = 0, sz = 0, n = 0; for (let f = 0; f < clip.n; f += 2) { const [a, b] = palmsAt(f / clip.fps); top = Math.max(top, a.y, b.y); sx += (a.x + b.x) / 2; sz += (a.z + b.z) / 2; n++; }
  const anchor = V(sx / n, top + 3.0, sz / n), mesh = cyl(group, MAT.rope, anchor, anchor.clone().add(V(0, -1, 0)), 0.022);
  // 두 손이 모여 있고 엉덩이보다 위에 있을 때만 밧줄이 손을 지난다(잡고 있는 것으로 본다). 놓은 뒤에는 고정점에서 곧게 늘어진다
  return (a, b, hipY) => { const held = a.distanceTo(b) < 0.45 && (a.y + b.y) / 2 > hipY + 0.15, mid = held ? a.clone().add(b).multiplyScalar(0.5) : V(anchor.x, 0.3, anchor.z), d = mid.clone().sub(anchor), len = d.length() + (held ? 1.0 : 0); d.normalize(); mesh.scale.set(1, len, 1); mesh.position.copy(anchor).addScaledVector(d, len / 2); mesh.quaternion.setFromUnitVectors(V(0, 1, 0), d); return held; };
}

// 잡은 손을 지형의 그 자리에 붙인다(옮긴 자세를 넣은 뒤에 부른다). toWorld = 뿌리 기준 자리 → 세계 자리. 돌려주는 값: 지금 닿아 있는 손발의 세계 자리(표시용)
export function applyGrips(rig, clip, holds, t, toWorld) {
  const B = rig.bones, f = t * clip.fps, marks = [];
  for (const h of holds) { const w = clamp(Math.min(f - (h.f0 - 2), (h.f1 + 2) - f) / 2, 0, 1); if (w <= 0) continue;
    if (h.e < 2 && h.grip) { const s = h.e === 0 ? 'L' : 'R', sh = worldPos(B[`upperArm.${s}`]), hq = B[`hand.${s}`].getWorldQuaternion(new THREE.Quaternion()), wr = worldPos(B[`hand.${s}`]), el = worldPos(B[`foreArm.${s}`]);
      const tgt = toWorld(h.grip).sub(PALM.clone().applyQuaternion(hq)), goal = wr.clone().lerp(tgt, w * w * (3 - 2 * w)), ik = twoBone(sh, goal, DIM.upperArm, DIM.foreArm, el.clone().sub(sh).normalize()), dirs = [ik.mid.clone().sub(sh).normalize(), ik.end.clone().sub(ik.mid).normalize()];
      [`upperArm.${s}`, `foreArm.${s}`].forEach((bn, j) => { const base = B[bn].getWorldQuaternion(new THREE.Quaternion()), cur = DOWN.clone().applyQuaternion(base); setWorldQuat(B[bn], new THREE.Quaternion().setFromUnitVectors(cur, dirs[j]).multiply(base)); });
      setWorldQuat(B[`hand.${s}`], hq); marks.push({ e: h.e, p: toWorld(h.grip) });
    } else if (h.e >= 2 && w >= 1) marks.push({ e: h.e, p: toWorld(V(...h.p)) });
  }
  return marks;
}
