// 전신 자세 풀이(p3d-0.11.0): 붙은 손발과 몸의 자리(무게중심)를 주면 골반·척추·가슴·어깨(빗장뼈)를 한꺼번에 푼다.
// 0.10.x까지는 손발마다 따로 IK를 풀고 골반·가슴·어깨는 규칙을 덧대어 맞췄다(기울기·비틀기·골반 층·엉덩이 빼기·어깨 올림…). 규칙 하나를 고치면 다른 장면이 깨지는 일이 되풀이됐다.
// 여기서는 그 규칙들 대신 "값(비용)" 하나를 줄인다: 팔다리가 닿는가(늘어나지 않게·접히지 않게), 팔다리가 오는 방향이 편한가, 몸통·머리·무릎이 지형에 들지 않는가,
//   몸통의 축이 받치는 쪽을 향하는가, 척추가 꺾이는 한계, 그리고 무게중심은 물리가 준 자리에 그대로(골반이 가면 윗몸이 반대로 간다).
// 몸의 자리(무게중심)·손발 접촉·판정은 물리(climb.js)가 정한다. 이 풀이는 그 둘레에 몸을 놓을 뿐이다 — 닿지 않는 곳을 닿게 하지 않는다(어깨가 목표 쪽으로 몇 cm 가는 만큼은 닿는 거리가 달라진다. 잰 값은 문서).
// 계산은 고정 계산 걸음(stepClimb)에서만 한다. 물리와 그림은 같은 fk()로 어깨·고관절 자리를 읽는다. 숫자(무게)는 모두 실험값이다.
import { DIM } from './rig.js';

// 풀 값 11개: 골반의 벗어남(왼쪽·위·벽 쪽, m) · 골반의 회전(돌림·숙임·옆 기울기, rad. 몸이 보는 쪽 기준) · 가슴의 회전(같은 순서, 몸이 보는 쪽 기준) · 빗장뼈 올림(왼·오른, rad)
export const NF = 11;
const PX = 0, PY = 1, PZ = 2, YH = 3, PH = 4, RH = 5, YC = 6, PC = 7, RC = 8, SL = 9, SR = 10;
const LO = [-0.16, -0.10, -0.18, -0.8, -0.6, -0.5, -0.9, -0.6, -0.5, -0.25, -0.25], HI = [0.16, 0.10, 0.12, 0.8, 0.6, 0.5, 0.9, 0.6, 0.5, 0.60, 0.60];
// 무게(1 = "1만큼의 값"). W_*는 아래 resid()에서 쓴다
export const FBW = {
  com: 25, axis: 1.5, regP: 2.0, regH: [1.0, 1.6, 1.6], regC: [2.2, 0.5, 0.5], spineLim: 10, spine: 0.7, clav: 2.2, clavLim: 15,
  armOver: 80, armFold: 30, armPref: 3.5, grip: 12, behind: 30, armBack: 10, armCross: 5, reach: 30, reachSat: 0.25,
  legOver: 60, legFold: 30, legAdd: 6, knee: 12, thigh: 12, moveK: 0.6, over: 3.0, body: 25, head: 30,
  wP: 0.42, wC: 0.58, spineT: 0.55, // wP·wC = 무게중심을 셀 때 골반·윗몸의 몫, spineT = 척추 뼈가 골반과 가슴 사이에서 도는 몫
  hl: [0.10, 0.10, 0.10, 0.12, 0.12, 0.12, 0.09, 0.09, 0.09, 0.07, 0.07], // 풀이 값이 뒤따르는 반감기(초): 골반 자리 · 골반 회전 · 가슴 회전 · 빗장뼈
  step: 0.025, lambda: 0.05, // 한 걸음에 풀이가 옮기는 가장 큰 양(m·rad), 감쇠
};

// ── 작은 수학(배열. 걸음마다 수천 번 부르므로 THREE 객체를 만들지 않는다) ──
const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qrot = (q, v) => { const x = v[0], y = v[1], z = v[2], qx = q[0], qy = q[1], qz = q[2], qw = q[3], ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
  return [ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx]; };
const qinv = q => [-q[0], -q[1], -q[2], q[3]];
const qY = a => [0, Math.sin(a / 2), 0, Math.cos(a / 2)], qX = a => [Math.sin(a / 2), 0, 0, Math.cos(a / 2)], qZ = a => [0, 0, Math.sin(a / 2), Math.cos(a / 2)];
const qypr = (y, p, r) => qmul(qmul(qY(y), qX(p)), qZ(r));
function qslerp(a, b, t) { let c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3], s = 1; if (c < 0) { c = -c; s = -1; } let k0 = 1 - t, k1 = t; if (c < 0.9995) { const th = Math.acos(c), sn = Math.sin(th); k0 = Math.sin((1 - t) * th) / sn; k1 = Math.sin(t * th) / sn; }
  const q = [k0 * a[0] + s * k1 * b[0], k0 * a[1] + s * k1 * b[1], k0 * a[2] + s * k1 * b[2], k0 * a[3] + s * k1 * b[3]], l = Math.hypot(q[0], q[1], q[2], q[3]); return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; }
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = a => Math.hypot(a[0], a[1], a[2]);
const nrm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const hp = (x, e = 0.004) => 0.5 * (x + Math.sqrt(x * x + e * e)); // 매끄러운 max(0, x)
// 점에서 가장 가까운 상자 겉까지(안이면 음수)
function sdBoxes(boxes, p) { let m = 9; for (const b of boxes) { const dx = Math.max(b.min[0] - p[0], 0, p[0] - b.max[0]), dy = Math.max(b.min[1] - p[1], 0, p[1] - b.max[1]), dz = Math.max(b.min[2] - p[2], 0, p[2] - b.max[2]), o = Math.hypot(dx, dy, dz);
    const d = o > 0 ? o : -Math.min(p[0] - b.min[0], b.max[0] - p[0], p[1] - b.min[1], b.max[1] - p[1], p[2] - b.min[2], b.max[2] - p[2]); if (d < m) m = d; } return m; }
// 두 마디 IK의 가운데 관절(무릎·팔꿈치) 자리
function midJoint(a, t, l1, l2, pole) { const d0 = sub(t, a), dist = len(d0) || 1e-6, u = mul(d0, 1 / dist), d = Math.min(Math.max(dist, Math.abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4), ca = Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
  let pp = sub(pole, mul(u, dot(pole, u))); const pl = len(pp); pp = pl > 1e-6 ? mul(pp, 1 / pl) : [0, 0, 0]; return add(add(a, mul(u, l1 * ca)), mul(pp, l1 * Math.sqrt(1 - ca * ca))); }

// ── 몸통의 틀(풀 값 → 골반·척추·가슴·어깨·고관절·머리). 물리·그림·풀이가 모두 이 함수를 쓴다 ──
// pos = 몸의 자리(발 높이 기준), yaw = 몸이 보는 쪽, k = 땅 → 벽 섞기의 몫(0~1, 골반의 벗어남에만)
export function fk(x, pos, yaw, k = 1) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), L = [cy, 0, -sy], F = [sy, 0, cy];
  const hip = [pos[0] + (L[0] * x[PX] + F[0] * x[PZ]) * k, pos[1] + DIM.hipY + x[PY] * k, pos[2] + (L[2] * x[PX] + F[2] * x[PZ]) * k];
  const qH = qypr(yaw + x[YH], x[PH], x[RH]), qC = qypr(yaw + x[YC], x[PC], x[RC]), qS = qslerp(qH, qC, FBW.spineT);
  const chest = add(add(hip, qrot(qH, DIM.oSpine)), qrot(qS, DIM.oChest));
  const sh = [0, 1].map(i => { const sx = i ? -1 : 1, qSh = qmul(qC, qZ(sx * x[SL + i])); return add(add(chest, qrot(qC, [sx * DIM.oClav[0], DIM.oClav[1], DIM.oClav[2]])), qrot(qSh, [sx * DIM.oSh[0], DIM.oSh[1], DIM.oSh[2]])); });
  const hj = [0, 1].map(i => add(hip, qrot(qH, [(i ? -1 : 1) * DIM.oHip[0], DIM.oHip[1], DIM.oHip[2]])));
  return { hip, qH, qS, qC, chest, sh, hj, L, F };
}
const NEUTRAL = new Float64Array(NF);
const comOf = g => add(mul(g.hip, FBW.wP), mul(add(g.chest, qrot(g.qC, [0, 0.10, 0])), FBW.wC));

// ── 값(잔차) ── c = { pos, yaw, boxes, arms: [{ st, goal, load }], legs: [{ st, ank, load }], hang(0~1 손이 받는 몫), sup(발판 위에 섰는가 0~1), shr[2](빗장뼈가 바라는 올림), tuck }
function resid(x, c, out) {
  const g = fk(x, c.pos, c.yaw), W = FBW, r = out; let n = 0;
  // ① 무게중심은 물리가 준 자리에(골반이 가면 윗몸이 반대로)
  { const cm = comOf(g); r[n++] = W.com * (cm[0] - c.com0[0]); r[n++] = W.com * (cm[1] - c.com0[1]); r[n++] = W.com * (cm[2] - c.com0[2]); }
  // ② 몸통의 축(골반 → 가슴)은 받치는 쪽을 향한다: 손에 매달리면 손 쪽, 발로 서면 위(발판 위에서는 조금 뒤로)
  { const ax = nrm(sub(g.chest, g.hip)); r[n++] = W.axis * (ax[0] - c.axis[0]); r[n++] = W.axis * (ax[1] - c.axis[1]); r[n++] = W.axis * (ax[2] - c.axis[2]); }
  // ③ 덜 움직이는 쪽(기본 자세로 돌아가려는 약한 힘)과 한계
  r[n++] = W.regP * x[PX]; r[n++] = W.regP * x[PY]; r[n++] = W.regP * x[PZ];
  r[n++] = W.regH[0] * x[YH]; r[n++] = W.regH[1] * x[PH]; r[n++] = W.regH[2] * x[RH];
  r[n++] = W.regC[0] * (x[YC] - (c.twist || c.yawT)) * (c.twist ? 1.5 : 1); r[n++] = W.regC[1] * (x[PC] - c.pitch); r[n++] = W.regC[2] * x[RC];
  { const dy = x[YC] - x[YH], dp = x[PC] - x[PH], dr = x[RC] - x[RH]; // 척추가 꺾이는 정도(가슴 − 골반): 비틀기 35°, 숙임·젖힘 30°, 옆 25°를 넘으면 크게
    r[n++] = W.spine * dy; r[n++] = W.spine * dp; r[n++] = W.spine * dr; r[n++] = W.spineLim * hp(Math.abs(dy) - 0.61); r[n++] = W.spineLim * hp(Math.abs(dp) - 0.52); r[n++] = W.spineLim * hp(Math.abs(dr) - 0.44); }
  for (let i = 0; i < 2; i++) { const s = x[SL + i]; r[n++] = W.clav * (s - c.shr[i]); r[n++] = W.clavLim * hp(s - 0.50); r[n++] = W.clavLim * hp(-0.18 - s); }
  // ④ 팔: 잡은 손은 늘어나지 않게·다 접히지 않게, 편한 길이 쪽으로 조금, 손이 가슴의 등 뒤·몸 건너편 멀리로 가지 않게. 뻗는 손은 어깨가 목표에 닿을 만큼 다가간다(끝없이 따라가지 않게 포화)
  const qCi = qinv(g.qC);
  for (let i = 0; i < 2; i++) { const A = c.arms[i], sx = i ? -1 : 1;
    if (A.st === 0) { r[n++] = 0; r[n++] = 0; r[n++] = 0; r[n++] = 0; r[n++] = 0; r[n++] = 0; r[n++] = 0; continue; }
    const d3 = sub(A.goal, g.sh[i]), d = len(d3) || 1e-6, u = qrot(qCi, mul(d3, 1 / d)), out = u[0] * sx;
    if (A.st === 1) { r[n++] = W.armOver * hp(d - 0.985 * c.ARM); r[n++] = W.armFold * hp(0.27 - d); r[n++] = W.armPref * (d - 0.85 * c.ARM) * A.w; r[n++] = W.armBack * hp(-0.10 - u[2]); r[n++] = W.armCross * hp(-0.45 - out);
      // 잡은 손이 미끄러지지 않는 쪽에 어깨를 둔다(당기는 방향이 아래에서 40° 안 — 물리의 한계는 50°. 어깨가 턱보다 높아지지 않게)
      const down = d3[1], hor = Math.hypot(d3[0], d3[2]); r[n++] = W.grip * hp(hor - 0.84 * down - 0.02);
      // 잡은 손이 몸의 등 뒤로 가지 않게(물리의 판정: 어깨 → 손이 몸이 보는 쪽에서 −0.2보다 뒤면 놓친다. 여유 0.1)
      r[n++] = W.behind * hp(-0.10 - (d3[0] * g.F[0] + d3[2] * g.F[2]) / d); }
    else { const e = hp(d - 0.92 * c.ARM), sat = W.reachSat * Math.tanh(e / W.reachSat); r[n++] = W.reach * sat * A.w; r[n++] = 0; r[n++] = 0; r[n++] = 0.5 * W.armBack * hp(-0.10 - u[2]) * A.w; r[n++] = 0.5 * W.armCross * hp(-0.45 - out) * A.w; r[n++] = 0; r[n++] = 0.3 * W.behind * hp(-0.10 - (d3[0] * g.F[0] + d3[2] * g.F[2]) / d) * A.w; } }
  // ⑤ 다리: 디딘 발은 늘어나지 않게·다 접히지 않게, 다리가 몸 건너편으로 깊이 넘어가지 않게, 무릎·넓적다리가 지형에 닿지 않게(골반이 물러나거나 돌아서 자리를 만든다). 가는 발은 그 자리를 미리 본다(약하게)
  const qHi = qinv(g.qH);
  for (let i = 0; i < 2; i++) { const Lg = c.legs[i], sx = i ? -1 : 1;
    if (Lg.st === 0) { r[n++] = 0; r[n++] = 0; r[n++] = 0; r[n++] = 0; r[n++] = 0; r[n++] = 0; r[n++] = 0; continue; }
    const k = Lg.st === 1 ? 1 : W.moveK * Lg.w, d3 = sub(Lg.ank, g.hj[i]), d = len(d3) || 1e-6, v = qrot(qHi, mul(d3, 1 / d)), out = v[0] * sx;
    // 하중을 받는 발 위로 고관절이 간다(다리가 받치는 힘의 방향과 다리 축이 맞도록 — "엉덩이를 디딘 발 위로"). 하중만큼만
    if (Lg.st === 1) { const dl = d3[0] * g.L[0] + d3[2] * g.L[2], df = d3[0] * g.F[0] + d3[2] * g.F[2]; r[n++] = W.over * Lg.load * dl; r[n++] = W.over * 0.5 * Lg.load * df; } else { r[n++] = 0; r[n++] = 0; }
    const over = hp(d - 0.975 * c.LEG); r[n++] = W.legOver * (Lg.st === 1 ? over : 0.15 * Math.tanh(over / 0.15)) * k; r[n++] = W.legFold * hp(c.LEGMIN - d) * k; r[n++] = W.legAdd * hp(-0.30 - out) * k;
    const pole = qrot(g.qH, nrm([sx * 0.57, 0.1, 0.82])), kn = midJoint(g.hj[i], Lg.ank, DIM.thigh, DIM.shin, pole), th = [(g.hj[i][0] + kn[0]) / 2, (g.hj[i][1] + kn[1]) / 2, (g.hj[i][2] + kn[2]) / 2];
    r[n++] = W.knee * hp(c.kneeClr - sdBoxes(c.boxes, kn)) * k; r[n++] = W.thigh * hp(c.kneeClr * 0.8 - sdBoxes(c.boxes, th)) * k; }
  // ⑥ 몸통·머리가 지형에 들지 않게(가슴 세 곳, 골반 두 곳, 머리)
  { const R = 0.105, m = 0.025; for (const o of [[0, 0.03, 0.03], [0.10, 0.03, 0.02], [-0.10, 0.03, 0.02]]) r[n++] = W.body * hp(R + m - sdBoxes(c.boxes, add(g.chest, qrot(g.qC, o))));
    for (const o of [[0.07, 0.07, 0.04], [-0.07, 0.07, 0.04]]) r[n++] = W.body * hp(0.10 + m - sdBoxes(c.boxes, add(g.hip, qrot(g.qH, o))));
    const hd = add(g.chest, qrot(g.qC, [DIM.oNeck[0] + DIM.oHead[0] + DIM.headCT[0], DIM.oNeck[1] + DIM.oHead[1] + DIM.headCT[1], DIM.oNeck[2] + DIM.oHead[2] + DIM.headCT[2]])); r[n++] = W.head * hp(DIM.headR + 0.04 - sdBoxes(c.boxesHead, hd)); }
  // (머리는 아래로 15cm 늘인 상자와 견준다 — 머리 위 가까이에 턱이 있으면 그 밑으로 들어가지 않고 앞으로 비켜 올라간다. 0.10.x의 "머리 위 25cm 안에 턱이 있으면 윗몸을 젖힌다" 규칙을 대신한다)
  return n;
}
const cost = (r, n) => { let s = 0; for (let i = 0; i < n; i++) s += r[i] * r[i]; return s; };

// 대칭 양의 정부호 행렬 풀기(촐레스키). A는 n×n 배열(망가뜨린다)
function solveSPD(A, b, n) { for (let i = 0; i < n; i++) { for (let j = 0; j <= i; j++) { let s = A[i * n + j]; for (let k = 0; k < j; k++) s -= A[i * n + k] * A[j * n + k]; A[i * n + j] = i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / A[j * n + j]; } }
  const y = new Float64Array(n); for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= A[i * n + k] * y[k]; y[i] = s / A[i * n + i]; }
  const x = new Float64Array(n); for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= A[k * n + i] * x[k]; x[i] = s / A[i * n + i]; } return x; }

const R0 = new Float64Array(96), R1 = new Float64Array(96), JJ = new Float64Array(96 * NF), AA = new Float64Array(NF * NF), GG = new Float64Array(NF);
// 풀이 한 걸음(감쇠 최소제곱, 수치 미분). xs를 그 자리에서 고친다. 돌려주는 값 = 값(비용)
export function solveStep(xs, c, iters = 1) {
  let c0 = 0;
  for (let it = 0; it < iters; it++) {
    const n = resid(xs, c, R0); c0 = cost(R0, n); const h = 1e-4;
    for (let j = 0; j < NF; j++) { const keep = xs[j]; xs[j] = keep + h; resid(xs, c, R1); xs[j] = keep; for (let i = 0; i < n; i++) JJ[i * NF + j] = (R1[i] - R0[i]) / h; }
    for (let a = 0; a < NF; a++) { let gsum = 0; for (let i = 0; i < n; i++) gsum += JJ[i * NF + a] * R0[i]; GG[a] = -gsum; for (let b = 0; b <= a; b++) { let s = 0; for (let i = 0; i < n; i++) s += JJ[i * NF + a] * JJ[i * NF + b]; AA[a * NF + b] = s; AA[b * NF + a] = s; } }
    let tr = 0; for (let a = 0; a < NF; a++) tr += AA[a * NF + a]; const lam = FBW.lambda * (tr / NF + 1e-6); for (let a = 0; a < NF; a++) AA[a * NF + a] += lam;
    const d = solveSPD(AA, GG, NF); let mx = 0; for (let a = 0; a < NF; a++) mx = Math.max(mx, Math.abs(d[a])); const sc = mx > FBW.step ? FBW.step / mx : 1;
    // 값이 줄지 않으면 걸음을 반으로(두 번까지)
    let k = sc; for (let tryN = 0; tryN < 3; tryN++) { const keep = Array.from(xs); for (let a = 0; a < NF; a++) xs[a] = Math.min(HI[a], Math.max(LO[a], keep[a] + d[a] * k)); const c1 = cost(R1, resid(xs, c, R1)); if (c1 <= c0 + 1e-12) { c0 = c1; break; } for (let a = 0; a < NF; a++) xs[a] = keep[a]; k *= 0.5; }
  }
  return c0;
}
// 임계 감쇠 스프링으로 뒤따르기(climb.js의 springS와 같은 식)
function follow(o, i, goal, hl, dt) { const y = 1.3862943611 / (hl + 1e-5), e = Math.exp(-y * dt), v = o.v[i], j0 = o.x[i] - goal, j1 = v + j0 * y; o.x[i] = e * (j0 + j1 * dt) + goal; o.v[i] = e * (v - j1 * y * dt); }
export const makeFB = () => ({ xs: new Float64Array(NF), x: new Float64Array(NF), v: new Float64Array(NF), hang: 0, sup: 0, cost: 0, axis: [0, 1, 0] });
// 계산 걸음마다 한 번: 풀이 값(xs)을 한 걸음 고치고, 쓰는 값(x)이 그것을 뒤따른다
export function stepFB(fb, c, dt) {
  c.com0 = comOf(fk(NEUTRAL, c.pos, c.yaw));
  fb.cost = solveStep(fb.xs, c, c.iters || 1);
  for (let i = 0; i < NF; i++) follow(fb, i, fb.xs[i], FBW.hl[i], dt);
}
export const FBI = { PX, PY, PZ, YH, PH, RH, YC, PC, RC, SL, SR };
