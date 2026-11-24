// 사람 관절의 범위(p3d-0.11.1): 사용자 플레이(0.11.0) "관절이 사람 관절이 아니라 좀비 관절처럼 움직이고 말도 안 되는 방향으로 꺾이고 뒤틀린다".
// 0.11.0까지는 팔다리를 두 마디 IK로만 풀었다 — 고관절이 어느 쪽으로든 얼마든지 돌고, 무릎이 넓적다리의 어느 쪽으로든 굽었다. 그래서 발을 머리 높이의 벽면에 대거나 다리를 옆으로 일자로 벌린 자세가 그대로 받아들여졌다.
// 여기에 범위를 한곳에 둔다. 판정(발을 보낼 수 있는가·디딜 수 있는가·계속 디딜 수 있는가), IK(무릎이 굽는 쪽), 전신 자세 풀이(골반이 돌아 범위 안으로 들인다)가 같은 함수를 쓴다.
// 값은 흔히 알려진 관절 가동 범위에서 잡은 실험값이다(이번에 새로 조사하지 않았다. 사람마다 다르고 등반가는 더 넓다). 단위 rad. 배열 수학(THREE를 쓰지 않는다).

const D = Math.PI / 180;
// 고관절: 넓적다리가 골반에서 뻗는 방향. 방위(0 = 앞, +90 = 제 쪽 옆, ±180 = 뒤, −90 = 반대쪽 옆)마다 "똑바로 아래에서 들어 올릴 수 있는 각"의 끝
//   앞 120°(무릎이 가슴 쪽), 앞·바깥 115°, 옆 90°(무릎을 바깥으로 돌려 연 자세 — 엉덩이를 벽에 붙이고 옆 발판을 디딘 개구리 자세까지. 78°로 두었을 때는 그 자세가 거부됐다), 뒤·바깥 40°, 뒤 20°, 반대쪽 옆 25°, 앞·안쪽 70°
const HIP = [[-180, 20], [-90, 25], [-45, 70], [0, 120], [45, 115], [90, 90], [135, 40], [180, 20]];
// KNEE_EXT·KNEE_INT = 넓적다리의 바깥·안쪽 돌림의 끝, KNEE_MAX = 무릎을 접는 끝, ARM_TWIST = 위팔이 기준에서 도는 끝(양쪽)
//   바깥 돌림을 65°로 두었을 때는 엉덩이를 벽에 붙이고 무릎을 옆으로 연 채 발판을 디딘 자세(등반에서 흔한 자세)가 30° 넘는 것으로 재져 디딘 발이 떨어졌다 → 85°
export const ANAT = { KNEE_EXT: 85 * D, KNEE_INT: 40 * D, KNEE_MAX: 150 * D, ARM_TWIST: 100 * D, hip: HIP };
const hipMax = az => { const a = az / D; for (let i = 1; i < HIP.length; i++) if (a <= HIP[i][0]) { const [a0, e0] = HIP[i - 1], [a1, e1] = HIP[i]; return (e0 + (e1 - e0) * (a - a0) / (a1 - a0)) * D; } return HIP[HIP.length - 1][1] * D; };
const qrot = (q, v) => { const x = v[0], y = v[1], z = v[2], qx = q[0], qy = q[1], qz = q[2], qw = q[3], ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
  return [ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], len = a => Math.hypot(a[0], a[1], a[2]);
const nrm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const axisRot = (v, k, th) => { const c = Math.cos(th), s = Math.sin(th), kv = cross(k, v), kd = dot(k, v) * (1 - c); return [v[0] * c + kv[0] * s + k[0] * kd, v[1] * c + kv[1] * s + k[1] * kd, v[2] * c + kv[2] * s + k[2] * kd]; };

// 고관절이 범위를 넘은 각(rad. 안이면 음수). qH = 골반의 세계 회전 [x,y,z,w], hj = 고관절, knee = 무릎, sx = 왼다리 +1 · 오른다리 −1
export function hipExcess(qH, hj, knee, sx) {
  const t = nrm([knee[0] - hj[0], knee[1] - hj[1], knee[2] - hj[2]]), L = qrot(qH, [1, 0, 0]), U = qrot(qH, [0, 1, 0]), F = qrot(qH, [0, 0, 1]);
  const out = dot(t, L) * sx, up = dot(t, U), fwd = dot(t, F), el = Math.acos(Math.min(1, Math.max(-1, -up)));
  if (el < 8 * D) return el - 20 * D; // 거의 아래로 늘어뜨린 넓적다리는 방위가 뜻이 없다
  return el - hipMax(Math.atan2(out, fwd));
}
// 다리 선(고관절 → 발목)이 뻗는 방향의 끝: 넓적다리의 범위만으로는 "무릎을 접어 발을 엉덩이 옆·어깨 높이에 대는" 자세가 걸러지지 않았다(무릎을 접으면 넓적다리는 범위 안이다).
//   앞 105°(발이 고관절보다 조금 높은 높은 디딤까지), 앞·바깥 100°, 옆 75°, 뒤 30°, 반대쪽 옆 62°, 앞·안쪽 80°(엇갈려 디디기). 넓적다리의 방향·비틀림이 먼저 거르고 이것은 느슨한 바깥 울타리다
//   (옆 62°·반대쪽 옆 30°로 두었을 때는 엇갈려 디디는 보통 발(몸 건너편 49cm, 62cm 아래)이 거부됐다)
const LINE = [[-180, 30], [-90, 62], [-45, 80], [0, 105], [45, 100], [90, 75], [135, 45], [180, 30]];
const tabMax = (T, az) => { const a = az / D; for (let i = 1; i < T.length; i++) if (a <= T[i][0]) { const [a0, e0] = T[i - 1], [a1, e1] = T[i]; return (e0 + (e1 - e0) * (a - a0) / (a1 - a0)) * D; } return T[T.length - 1][1] * D; };
// 다리 전체가 범위를 넘은 각(rad. 안이면 음수): 넓적다리의 방향, 다리 선의 방향, 정강이가 위를 향하는 정도(발목이 무릎보다 한참 높으면 발바닥으로 누를 수 없다 — 수평에서 25° 위까지), 넓적다리의 비틀림 가운데 가장 큰 것
export function legExcess(qH, hj, knee, ank, sx) {
  const L = qrot(qH, [1, 0, 0]), U = qrot(qH, [0, 1, 0]), F = qrot(qH, [0, 0, 1]), u = nrm([ank[0] - hj[0], ank[1] - hj[1], ank[2] - hj[2]]), el = Math.acos(Math.min(1, Math.max(-1, -dot(u, U))));
  const line = el < 8 * D ? el - 25 * D : el - tabMax(LINE, Math.atan2(dot(u, L) * sx, dot(u, F)));
  const sh = nrm([ank[0] - knee[0], ank[1] - knee[1], ank[2] - knee[2]]), shin = Math.asin(Math.min(1, Math.max(-1, sh[1]))) - 25 * D;
  return Math.max(hipExcess(qH, hj, knee, sx), line, shin, twistOver(femurTwist(qH, hj, knee, ank, sx)));
}
// 넓적다리의 비틀림(rad. + = 바깥 돌림: 발이 몸 안쪽으로 간다, − = 안쪽 돌림: 발이 바깥으로 간다). 무릎이 거의 펴져 있으면 null
//   기준(비틀지 않았을 때 정강이가 굽어 가는 쪽) = 쉬는 자세의 "뒤"를 넓적다리가 든 만큼 가장 적게 돌린 것 + 넓적다리를 든 만큼(4·sin³) 골반의 "아래" 쪽으로:
//   늘어뜨린 넓적다리 = 뒤, 앞으로 든 넓적다리 = 아래, 옆으로 30° 벌린 넓적다리 = 거의 뒤(14°), 옆으로 수평까지 든 넓적다리 = 거의 아래(76°) — 무릎을 옆으로 열고 정강이를 내린 자세(개구리)가 기준 가까이에 온다.
//   (아래 쪽 몫을 1.5·sin²으로 두었을 때는 옆 발판을 개구리 자세로 디딘 다리가 바깥 돌림 80~90°로 재져 거부됐다)
//   되돌린 두 시도: ① "다리 선(고관절 → 발목)을 가장 적게 돌린 틀" — 넓적다리를 앞으로 들고 정강이를 옆으로 눕힌 자세(안쪽 돌림 90°)가 0°로 나왔다(깊이 접은 다리에서는 다리 선이 넓적다리를 대신하지 못한다)
//   ② 골반의 "아래 + 조금 뒤"를 넓적다리에 수직으로 눕힌 것 — 거의 늘어뜨린 넓적다리에서 골반이 13° 기운 것만으로 기준이 32° 돌았다(거의 편 다리가 안쪽 돌림 51°로 재졌다)
export function femurTwist(qH, hj, knee, ank, sx) {
  const t = nrm([knee[0] - hj[0], knee[1] - hj[1], knee[2] - hj[2]]), sh = [ank[0] - knee[0], ank[1] - knee[1], ank[2] - knee[2]], k = dot(sh, t), p = [sh[0] - t[0] * k, sh[1] - t[1] * k, sh[2] - t[2] * k];
  if (len(p) < 0.10) return null;
  const U = qrot(qH, [0, 1, 0]), F = qrot(qH, [0, 0, 1]), dn = [-U[0], -U[1], -U[2]], ax = cross(dn, t), sn = len(ax), cs = dot(dn, t);
  let b = [-F[0], -F[1], -F[2]]; if (sn > 1e-5) b = axisRot(b, [ax[0] / sn, ax[1] / sn, ax[2] / sn], Math.atan2(sn, cs));
  const w = 4 * sn * sn, d = [dn[0] - t[0] * cs, dn[1] - t[1] * cs, dn[2] - t[2] * cs]; b = [b[0] + w * d[0], b[1] + w * d[1], b[2] + w * d[2]];
  const kb = dot(b, t); b = [b[0] - t[0] * kb, b[1] - t[1] * kb, b[2] - t[2] * kb]; if (len(b) < 1e-4) return null; const b0 = nrm(b), pn = nrm(p);
  return -sx * Math.atan2(dot(cross(b0, pn), t), dot(b0, pn));
}
const twistOver = tw => (tw === null ? -1 : Math.max(tw - ANAT.KNEE_EXT, -tw - ANAT.KNEE_INT));
// 두 마디의 가운데 관절 자리: a = 뿌리 관절, e = 끝, pole = 굽는 쪽
const midAt = (a, e, l1, l2, pole) => { const dv = [e[0] - a[0], e[1] - a[1], e[2] - a[2]], d0 = len(dv), d = Math.min(Math.max(d0, Math.abs(l1 - l2) + 1e-4), (l1 + l2) * 0.999), u = d0 > 1e-6 ? [dv[0] / d0, dv[1] / d0, dv[2] / d0] : [0, -1, 0], x = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - x * x)), k = dot(pole, u), q = nrm([pole[0] - u[0] * k, pole[1] - u[1] * k, pole[2] - u[2] * k]);
  return { mid: [a[0] + u[0] * x + q[0] * h, a[1] + u[1] * x + q[1] * h, a[2] + u[2] * x + q[2] * h], u, q, h }; };
// 굽는 쪽(pole)을 관절의 범위 안으로: 주어진 쪽이 범위 안이면 그대로, 아니면 다리(팔) 선 둘레로 가장 적게 돌려 범위에 드는 쪽. 어느 쪽으로도 들지 않으면 가장 덜 넘는 쪽.
//   cost(가운데 관절 자리) = 넘은 각(rad, 안이면 ≤ 0). 돌려주는 값 = { pole, over(남은 넘침), moved(돌린 각) }
export function fitPole(a, e, l1, l2, pole, cost) {
  const m0 = midAt(a, e, l1, l2, pole); if (m0.h < 0.03) return { pole, over: 0, moved: 0 };
  const c0 = cost(m0.mid); if (c0 <= 0) return { pole, over: c0, moved: 0 };
  const at = th => { const pl = axisRot(m0.q, m0.u, th); return [pl, cost(midAt(a, e, l1, l2, pl).mid)]; }; let best = [0, pole, c0];
  for (let k = 1; k <= 30; k++) for (const sg of [1, -1]) { const th = sg * k * 6 * D, [pl, c] = at(th); if (c < best[2]) best = [th, pl, c];
    if (c <= 0) { let lo = sg * (k - 1) * 6 * D, hi = th, ph = pl; for (let it = 0; it < 4; it++) { const md = (lo + hi) / 2, [pm, cm] = at(md); if (cm <= 0) { hi = md; ph = pm; } else lo = md; } return { pole: ph, over: 0, moved: hi }; } }
  return { pole: best[1], over: best[2], moved: best[0] };
}
// 무릎의 자리 하나가 범위를 넘은 각(rad): 넓적다리의 방향과 비틀림 가운데 큰 것(무릎이 굽는 쪽을 고를 때 쓴다 — 다리 선·정강이는 무릎을 돌려도 바뀌지 않는다)
export const kneeExcess = (qH, hj, kn, ank, sx) => Math.max(hipExcess(qH, hj, kn, sx), twistOver(femurTwist(qH, hj, kn, ank, sx)));
// 무릎이 굽는 쪽을 사람 다리의 범위 안으로(넓적다리의 방향 + 비틀림)
export function clampKnee(qH, hj, ank, pole, sx, l1, l2) { return fitPole(hj, ank, l1, l2, pole, kn => kneeExcess(qH, hj, kn, ank, sx)); }
// 그려진 무릎의 돌림(잴 때): 넓적다리의 비틀림 그대로(펴져 있으면 0)
export function kneeTurn(qH, hj, knee, ank, sx) { return femurTwist(qH, hj, knee, ank, sx) ?? 0; }

// ── 팔 ──
// 어깨: 위팔이 가슴에서 뻗는 방향. 방위(0 = 앞, +90 = 제 쪽 옆, ±180 = 뒤, −90 = 가슴을 가로질러 반대쪽)마다 아래에서 들어 올릴 수 있는 각의 끝.
//   앞·옆 = 머리 위까지(180°), 옆에서 뒤로 30° 넘어가면 줄어든다(어깨 높이에서 팔을 등 뒤로 젖히는 한계), 뒤 = 50°(팔을 뒤로 뻗기), 가로질러 = 35°(가슴이 막는다), 앞·안쪽 45° = 120°
const SHO = [[-180, 50], [-135, 35], [-90, 35], [-45, 120], [0, 180], [90, 180], [120, 110], [150, 60], [180, 50]];
// 어깨가 범위를 넘은 각(rad). qC = 가슴의 세계 회전, sh = 어깨, el = 팔꿈치. 머리 위 가까이에서는 방위가 뜻이 없다 → 똑바로 위에서 30° 안은 어느 쪽으로 기울어도 범위 안이다(처음에는 0°였다 — 머리 위로 든 팔이 안쪽으로 15° 기운 것만으로 14° 넘침이 됐다)
export function shoulderExcess(qC, sh, el, sx) {
  const t = nrm([el[0] - sh[0], el[1] - sh[1], el[2] - sh[2]]), L = qrot(qC, [1, 0, 0]), U = qrot(qC, [0, 1, 0]), F = qrot(qC, [0, 0, 1]), e = Math.acos(Math.min(1, Math.max(-1, -dot(t, U))));
  if (e < 8 * D) return e - 35 * D;
  return Math.min(e - tabMax(SHO, Math.atan2(dot(t, L) * sx, dot(t, F))), Math.PI - e - 30 * D);
}
// 위팔의 비틀림(rad, 부호 없음): 기준(비틀지 않았을 때 팔뚝이 굽어 가는 쪽) = 쉬는 자세의 "앞"을 위팔이 든 만큼 가장 적게 돌린 것 — 늘어뜨린 팔 = 앞, 옆으로 든 팔 = 앞, 앞으로 든 팔 = 위.
//   머리 위로 든 팔(135° 넘게)은 재지 않는다(앞으로 들었는가 옆으로 들었는가에 따라 기준이 달라진다 — 어깨의 방향 범위가 대신 거른다). 팔꿈치가 거의 펴져 있으면 null
//   (처음에는 가슴의 "앞 + 조금 위"를 위팔에 수직으로 눕혀 기준으로 삼았다 — 위팔이 그 방향과 나란해지는 자세(앞·위로 63° 든 팔)에서 기준이 사라져 한 걸음에 151°가 재졌다)
export function humerusTwist(qC, sh, el, wr) {
  const t = nrm([el[0] - sh[0], el[1] - sh[1], el[2] - sh[2]]), U = qrot(qC, [0, 1, 0]), F = qrot(qC, [0, 0, 1]), dn = [-U[0], -U[1], -U[2]], cs = dot(dn, t); if (cs < Math.cos(135 * D)) return null;
  const fa = [wr[0] - el[0], wr[1] - el[1], wr[2] - el[2]], k = dot(fa, t), p = [fa[0] - t[0] * k, fa[1] - t[1] * k, fa[2] - t[2] * k]; if (len(p) < 0.07) return null;
  const ax = cross(dn, t), sn = len(ax); let b = F; if (sn > 1e-5) b = axisRot(F, [ax[0] / sn, ax[1] / sn, ax[2] / sn], Math.atan2(sn, cs));
  const kb = dot(b, t); b = [b[0] - t[0] * kb, b[1] - t[1] * kb, b[2] - t[2] * kb]; if (len(b) < 1e-4) return null;
  return Math.acos(Math.min(1, Math.max(-1, dot(nrm(b), nrm(p)))));
}
// 팔 전체가 범위를 넘은 각(rad. 안이면 음수): 어깨의 방향과 위팔의 비틀림(기준에서 ARM_TWIST까지) 가운데 큰 것
export function armExcess(qC, sh, el, wr, sx) { const tw = humerusTwist(qC, sh, el, wr); return Math.max(shoulderExcess(qC, sh, el, sx), tw === null ? -1 : tw - ANAT.ARM_TWIST); }
// 팔꿈치가 굽는 쪽을 사람 팔의 범위 안으로
export function clampElbow(qC, sh, wr, pole, sx, l1, l2) { return fitPole(sh, wr, l1, l2, pole, el => armExcess(qC, sh, el, wr, sx)); }
// 다리를 가장 깊이 접었을 때의 고관절 ~ 발목 거리(무릎 150°)
export const legMin = (l1, l2) => Math.sqrt(l1 * l1 + l2 * l2 - 2 * l1 * l2 * Math.cos(Math.PI - ANAT.KNEE_MAX));
