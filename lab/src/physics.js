// 등반 조작 실험실 · 물리 계산부 (브라우저·노드 공용, 화면과 무관)
// 몸: 가슴·엉덩이·양손·양발 6개 질점. 몸통은 막대, 팔다리는 최대·최소 길이가 있는 줄 + 근육.
// 근육은 두 질점 사이에 크기 같고 방향 반대인 힘으로만 작용한다(외부에서 끌어 주는 힘 없음).
'use strict';
const PH = (() => {
  const C = {
    G: 1400, T: 54, A: 72, AMIN: 0, L: 84, LMIN: 26,
    MC: 28, MP: 22, MH: 2, MF: 6,
    SUB: 8, ITER: 4, FLOOR: 640, GRAB_R: 14, PLANT_R: 10, PLANT_V: 260, FOOT_R: 5, MU: 1.0,
    COUPLE: 0, AIMHOLD: 0, LEG_RANGE: 125, REACT: 0, // 다리가 몸통 아래 방향에서 벗어날 수 있는 각도
    // v0.5 근육: 힘을 주기 시작하면 활성도가 TA초 시간상수로 차오르고, 힘을 빼면 TD초로 빠진다(0이면 꺼짐 = v0.4)
    MUSCLE: 1, TA: 0.11, TD: 0.10, ACT0: 0.15, PUSH0: 0.55, LEGPUSH_V05: 2.6,
    // 다리 힘-속도 관계(Hill): 빨리 펴질수록 약해지고, 눌리며 버틸 때는 최대 ECC배까지 강해진다
    FV: 1, VMAX: 3000, FV_A: 0.6, ECC: 1.4,
    // v0.5 손발 궤적: 목표로 바로 튀지 않고 최소 저크 곡선으로(종 모양 속도). 걸리는 시간 = T0 + TK × (거리 / 팔 길이). 0이면 꺼짐
    SMOOTH: 1, SMOOTH_FOOT: 1, MJ_T0: 0.14, MJ_TK: 0.28,
    // v0.5 관절 힘: 붙은 팔다리는 자기 축 방향(밀고 당기기)뿐 아니라 옆으로도 몸을 움직일 수 있다(무릎·고관절·어깨 회전력). 체중의 배수, 0이면 꺼짐
    LAT_LEG: 0.6, LAT_ARM: 0.25, LAT_D: 30, MU_LAT: 0.8,
    PALM: 1, // 손으로 눌러 버틸 때 균형 힘(턱 위로 올라선 자세)
    MOVE_V: 120, // 몸통 옮기기(WASD) 때 팔다리 길이가 바뀌는 최대 빠르기(px/s)
    // 3단계 관절 몸(실험판). JOINT가 0이면 아래 값은 쓰이지 않는다(기존 두 몸은 그대로)
    JOINT: 0, SW: 0, HW: 0,            // SW·HW: 어깨·골반 연결점이 몸통 중심선에서 옆으로 떨어진 거리(반폭)
    JCAP: 1.5,                          // 관절 힘 곡선의 상한(관절이 90°일 때 힘의 배수)
    ARM_K: 1, LEG_K: 1,                 // 관절 몸에서 팔·다리 기준 힘 배율
    HIP_OUT: 130, HIP_IN: 45,           // 허벅지가 몸통 아래 방향에서 바깥쪽·안쪽으로 벗어날 수 있는 각도
    SW_RATE: 5,                         // 팔꿈치가 꺾이는 쪽을 바꾸는 빠르기(1/초). 뒤집힘 없이 팔을 돌려 넘기는 동작
    STAND_V: 60, STAND_ARM: 0.25,        // 서 있기: 발이 몸 아래에 있는데 팔이 체중의 STAND_ARM배 넘게 지고 있으면 다리를 STAND_V(px/s)로 펴서 발이 체중을 받게 한다
    ELEV_ONE: 20, ELEV_BOTH: 2, ELEV_V: 110, // 어깨 올림: 한 팔만 위로 뻗거나 잡으면 그쪽 어깨가 ELEV_ONE px까지 올라간다(몸통이 옆으로 늘어나는 것). 두 팔을 다 올리면 ELEV_BOTH까지만. 빠르기 ELEV_V px/s
    ROT_C: 70, ROT_MAX: 0.4,            // 매달렸을 때 어깨·몸통 근육이 몸통이 도는 것을 줄이는 힘(감쇠 계수, 가슴·엉덩이에 걸리는 짝힘의 상한 = 체중의 배수)
    CROUCH_V: 160,                      // 웅크릴 때 다리가 접히는 최대 빠르기(px/s). 다리가 체중을 받친 채 내려간다(한꺼번에 접혀 몸이 떨어지지 않게)
  };
  // 몸 비율(2단계 비교): 길이만 바꾸고 질량·중력·힘은 그대로 둔다(신체 수치는 한 번에 하나씩). 다리가 접히는 최소 길이는 다리에 비례(26/84 ≈ 0.31)
  const BODIES = {
    base: { A: 72, L: 84, LMIN: 26, name: '기존 몸 (팔 72·다리 84)', short: '기존 몸' },
    prop: { A: 68, L: 98, LMIN: 30, name: '새 비율 (팔 68·다리 98)', short: '새 비율 몸' },
    // 관절 몸: 팔은 어깨에서, 다리는 골반 양옆에서 나온다. 팔꿈치·무릎은 위·아래 마디 길이가 같은 관절이다.
    // 다리: 무릎은 벽 때문에 옆으로만 벌어지므로 가장 많이 접은 각도(35°)가 가장 짧은 길이를 정한다(2 × 마디 × sin(각/2) ≈ 29).
    // 팔: 팔꿈치가 화면 앞뒤로 빠질 수 있어, 정면에서 본 손–어깨 거리는 0까지 줄어든다(팔로 눌러 올라갈 때 손이 어깨 바로 앞을 지나간다. 8px로 두었더니 손 간격에 따라 어깨가 손 옆에 걸려 몸이 옆으로 튕겼다).
    joint: { A: 66, L: 96, AMIN: 0, LMIN: 29, SW: 18, HW: 8, JOINT: 1, ARM_K: 0.8, LEG_K: 1, name: '관절 몸 (어깨 폭 36·골반 폭 16·팔 66·다리 96)', short: '관절 몸' },
  };
  let body = 'base';
  function setBody(k) { const b = BODIES[k]; if (!b) return false; body = k; // 다음 create()부터 적용
    C.A = b.A; C.L = b.L; C.LMIN = b.LMIN; C.AMIN = b.AMIN || 0; C.SW = b.SW || 0; C.HW = b.HW || 0; C.JOINT = b.JOINT || 0; C.ARM_K = b.ARM_K || 1; C.LEG_K = b.LEG_K || 1; return true; }
  const getBody = () => body;
  const MASS = C.MC + C.MP + 2 * C.MH + 2 * C.MF, W = MASS * C.G;
  // 힘 한계(체중 W의 배수)와 스프링 값
  const M = {
    armPull: 1.3 * W, armPush: 0.9 * W, armK: 1.3 * W / 3, armC: 2000, armRate: 320,
    legPush: 1.8 * W, legPull: 0, legPress: 0.15 * W, ankle: 0.15 * W, ankleK: 0.02 * W, ankleC: 300, palm: 0.3 * W, palmK: 0.03 * W, palmC: 400, legK: 1.8 * W / 3, legC: 2400, legRate: 750,
    handReach: 0.3 * W, handKp: 0.3 * W / 15, handKd: 110,
    footReach: 0.5 * W, footKp: 0.5 * W / 15, footKd: 250,
    upK: 0.1 * W, upC: 1500, upMax: 1.5 * W,
    freeC: [4, 4, 10, 10],
  };
  const GRIP = { // th: 손이 버티는 방향의 한계각(면을 누르는 방향 기준)
    ledge: { th: 75, name: '턱' }, incut: { th: 105, name: '깊은 턱' },
    jug: { th: 180, all: true, name: '저그' }, sloper: { th: 40, name: '둥근 면' }, block: null,
    rock: { th: 55, all: true, name: '바위 면' }, // 일반 지형: 표시된 홀드가 아니라 면의 방향과 당기는 방향으로만 정해진다
  };

  // ---- 지형
  function poly(id, type, pts, extra = {}) {
    let cx = 0, cy = 0; for (const q of pts) { cx += q[0]; cy += q[1]; } cx /= pts.length; cy /= pts.length;
    const edges = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      let nx = b[1] - a[1], ny = -(b[0] - a[0]); const l = Math.hypot(nx, ny); nx /= l; ny /= l;
      if ((a[0] - cx) * nx + (a[1] - cy) * ny < 0) { nx = -nx; ny = -ny; }
      const g = GRIP[type];
      edges.push({ ax: a[0], ay: a[1], bx: b[0], by: b[1], nx, ny, grip: !!g && (g.all || ny < -0.5) });
    }
    return { id, type, pts, edges, cx, cy, ...extra };
  }
  const rect = (id, type, x, y, w, h, extra) => poly(id, type, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], extra);
  function makeWorld(variant) { // variant 'near': 건너편 턱을 18px 가깝게 한 연습용 배치
    const bx = variant === 'near' ? 452 : typeof variant === 'number' ? 470 + variant : 470; // 숫자면 건너편 턱을 그만큼 옮긴 시험용 배치
    const dome = []; for (let a = 200; a <= 340; a += 20) dome.push([400 + 36 * Math.cos(a * Math.PI / 180), 248 + 36 * Math.sin(a * Math.PI / 180)]);
    const hex = []; for (let a = 0; a < 360; a += 60) hex.push([415 + 9 * Math.cos(a * Math.PI / 180), 350 + 9 * Math.sin(a * Math.PI / 180)]);
    return [
      rect('A', 'incut', 180, 300, 150, 16), rect('F1', 'ledge', 258, 468, 56, 40),
      poly('J', 'jug', hex), poly('S', 'sloper', dome),
      rect('B', 'ledge', bx, 345, typeof variant === 'number' ? 140 : 158 - (bx - 452), 16), rect('F3', 'ledge', 510, 455, 40, 10), rect('F4', 'ledge', 474, 520, 44, 10),
      rect('G', 'incut', 520, 252, 110, 16, { goal: true }),
      poly('R', 'rock', [[650, 372], [712, 388], [724, 470], [716, 566], [660, 566], [640, 440]]), // 바위 덩어리: 윗면은 비스듬하고 옆면은 가파르다
      poly('R2', 'rock', [[622, 447], [644, 447], [644, 457], [624, 458]]),                // 바위 옆의 작은 돌출부
      rect('P', 'incut', 770, 300, 90, 16),                                              // 반동 연습용
    ];
  }
  function closestOnSeg(e, x, y) {
    const dx = e.bx - e.ax, dy = e.by - e.ay, t = Math.max(0, Math.min(1, ((x - e.ax) * dx + (y - e.ay) * dy) / (dx * dx + dy * dy)));
    return [e.ax + dx * t, e.ay + dy * t];
  }
  // 원(발)과 볼록 다각형: 밀어낼 방향과 깊이
  function polyPush(pl, x, y, r) {
    let best = -1e9, bi = -1;
    for (let i = 0; i < pl.edges.length; i++) { const e = pl.edges[i], d = (x - e.ax) * e.nx + (y - e.ay) * e.ny; if (d > best) { best = d; bi = i; } }
    if (best > r) return null;
    if (best <= 0) { const e = pl.edges[bi]; return { nx: e.nx, ny: e.ny, depth: r - best }; }
    let dm = 1e9, qx = 0, qy = 0;
    for (const e of pl.edges) { const q = closestOnSeg(e, x, y), d = Math.hypot(x - q[0], y - q[1]); if (d < dm) { dm = d; qx = q[0]; qy = q[1]; } }
    if (dm >= r || dm < 1e-9) return null;
    return { nx: (x - qx) / dm, ny: (y - qy) / dm, depth: r - dm };
  }
  function nearestGrip(world, x, y) {
    let best = null;
    for (const pl of world) for (const e of pl.edges) if (e.grip) {
      const q = closestOnSeg(e, x, y), d = Math.hypot(x - q[0], y - q[1]);
      if (!best || d < best.d) best = { d, x: q[0], y: q[1], nx: e.nx, ny: e.ny, type: pl.type, poly: pl.id };
    }
    return best;
  }
  function nearestSurface(world, x, y) { // 발 디딜 면: 가까운 면 중 위를 향한 면을 조금 우선한다
    let best = null;
    for (const pl of world) for (const e of pl.edges) {
      const q = closestOnSeg(e, x, y), d = Math.hypot(x - q[0], y - q[1]), sc = d + 6 * (1 + e.ny);
      if (!best || sc < best.sc) best = { d, sc, x: q[0], y: q[1], nx: e.nx, ny: e.ny, poly: pl.id };
    }
    return best;
  }

  // ---- 팔다리가 몸통에 붙는 자리(어깨·골반)
  // 몸통은 가슴–엉덩이 막대 하나다. 연결점은 그 막대에서 옆으로 k×T만큼 떨어진 점이고(k = ±반폭/T), 막대와 함께 움직이고 돈다:
  //   연결점 = 밑점 + k·R(가슴 − 엉덩이),  R(x, y) = (−y, x),  밑점 = 팔은 가슴, 다리는 엉덩이
  // 이 식은 가슴·엉덩이 위치에 대해 1차식이라, 연결점에 걸린 힘과 위치 보정을 가슴·엉덩이 두 질점에 정확히 나눠 줄 수 있다(힘 + 몸통을 돌리는 짝힘).
  // k가 0이면(기존 두 몸) 연결점이 곧 가슴·엉덩이 질점이라 기존 계산과 완전히 같다.
  function rootOf(s, lb) {
    const b = s.p[lb.root];
    if (!lb.k) return b;
    // 어깨 올림(lb.elev px)은 연결점을 몸통 축 방향(머리 쪽)으로 더 옮긴다: + j·(가슴 − 엉덩이), j = elev/T. 이것도 1차식이라 같은 방식으로 나눌 수 있다
    const c = s.p[0], hp = s.p[1], k = lb.k, j = (lb.elev || 0) / C.T;
    return { x: b.x - k * (c.y - hp.y) + j * (c.x - hp.x), y: b.y + k * (c.x - hp.x) + j * (c.y - hp.y), vx: b.vx - k * (c.vy - hp.vy) + j * (c.vx - hp.vx), vy: b.vy + k * (c.vx - hp.vx) + j * (c.vy - hp.vy), fx: 0, fy: 0, proxy: true };
  }
  function flushRoot(s, lb, r) { // 연결점에 모인 힘을 가슴·엉덩이에 나눈다: 밑점에는 힘 그대로, 가슴·엉덩이에는 몸통을 돌리는 짝힘 ±k·Rᵀ(F)
    if (!r.proxy) return;
    const b = s.p[lb.root], c = s.p[0], hp = s.p[1], k = lb.k, j = (lb.elev || 0) / C.T, tx = k * r.fy + j * r.fx, ty = -k * r.fx + j * r.fy;
    b.fx += r.fx; b.fy += r.fy; c.fx += tx; c.fy += ty; hp.fx -= tx; hp.fy -= ty;
  }
  const rootPos = (s, i) => rootOf(s, s.limb[i]);
  // ---- 관절(팔꿈치·무릎)
  // 위·아래 마디 길이가 같은 관절. 연결점–끝 거리(len)가 정해지면 관절이 얼마나 접혔는지와, 관절에서 그 선까지의 거리(h = 힘의 팔 길이)가 정해진다.
  // 마디 길이는 최대 길이의 절반보다 2% 길게 잡는다: 팔다리를 다 펴도 관절이 조금(약 11°) 굽어 있어, 일직선이 되는 순간 관절이 옆으로 튀는 일이 없다.
  const segLen = lb => lb.max / 2 * 1.02;
  const jointH = (lb, len) => { const U = segLen(lb); return Math.sqrt(Math.max(0, U * U - len * len / 4)); };
  // 관절이 내는 돌림힘에는 한계가 있으므로, 팔다리가 축 방향으로 낼 수 있는 힘은 관절이 깊이 접힐수록 작고 펴질수록 크다(다 펴지면 뼈가 받친다).
  // 기준: 관절 90°에서 1배. 가장 깊이 접으면 약 0.74배, 펴질수록 커져 JCAP배에서 멈춘다.
  const jointCap = (lb, len) => { const U = segLen(lb), h = jointH(lb, Math.min(len, lb.max)); return Math.min(C.JCAP, 0.7071 * U / Math.max(h, 1e-3)); };
  // 관절 위치: 연결점과 끝의 가운데에서 수직으로 h × sw만큼. sw(−1~1)는 관절이 꺾인 쪽. 무릎은 한쪽으로만 꺾이고(왼무릎 +1, 오른무릎 −1),
  // 팔꿈치는 어깨가 도는 만큼 천천히 넘어간다(|sw| < 1인 동안은 팔이 화면 앞뒤로 돌아 짧아 보이는 상태).
  function jointPos(s, i) {
    const lb = s.limb[i], r = rootOf(s, lb), e = s.p[lb.end], dx = e.x - r.x, dy = e.y - r.y, len = Math.hypot(dx, dy) || 1e-6, h = jointH(lb, Math.min(len, lb.max));
    let x = r.x + dx / 2 - dy / len * h * lb.sw, y = r.y + dy / 2 + dx / len * h * lb.sw;
    if (lb.arm && len < 36) { // 손이 어깨 바로 옆에 있을 때: 어깨–손 선의 방향이 조금만 변해도 팔꿈치가 크게 돌기 때문에, 가까울수록 팔꿈치를 몸 기준 바깥·아래쪽 자리로 옮겨 둔다
      const c = s.p[0], hp = s.p[1], ax = (c.x - hp.x) / C.T, ay = (c.y - hp.y) / C.T, side = i % 2 ? 1 : -1;
      let px = -ay * side - 0.6 * ax, py = ax * side - 0.6 * ay; const pl = Math.hypot(px, py) || 1, U = segLen(lb), w = Math.min(1, (36 - len) / 28);
      x += (r.x + px / pl * U - x) * w; y += (r.y + py / pl * U - y) * w;
    }
    return { x, y, h, len, rx: r.x, ry: r.y };
  }
  // 팔꿈치가 가고 싶은 쪽: 몸 기준 바깥쪽·아래쪽. 두 쪽의 차이가 뚜렷할 때만(6px) 바꾸고, 바꿀 때는 SW_RATE 빠르기로 넘어간다
  // 어깨 올림: 손이 어깨보다 위(몸통 축 방향으로 팔 길이의 20% 넘게)에 있으면 그 팔은 "올린 팔"이다.
  // 한 팔만 올렸으면 그쪽 어깨가 많이 올라가고(반대쪽으로 몸통이 기울며 늘어나는 것), 두 팔을 다 올렸으면 조금만 올라간다. 그래서 한 팔로 뻗으면 두 팔보다 멀리 닿는다.
  function updateElev(s, dt) {
    const c = s.p[0], hp = s.p[1], ax = (c.x - hp.x) / C.T, ay = (c.y - hp.y) / C.T;
    const up = [0, 1].map(i => { const lb = s.limb[i], e = s.p[lb.end], bx = c.x - lb.k * (c.y - hp.y), by = c.y + lb.k * (c.x - hp.x); return lb.mode !== 'free' && (e.x - bx) * ax + (e.y - by) * ay > 0.2 * lb.max; });
    for (const i of [0, 1]) { const lb = s.limb[i], want = !up[i] ? 0 : up[1 - i] ? C.ELEV_BOTH : C.ELEV_ONE; lb.elev = (lb.elev || 0) + Math.max(-C.ELEV_V * dt, Math.min(C.ELEV_V * dt, want - (lb.elev || 0))); }
  }
  function updateSwivel(s, dt) {
    const c = s.p[0], hp = s.p[1], ax = (c.x - hp.x) / C.T, ay = (c.y - hp.y) / C.T; // 몸통 축(엉덩이→가슴)
    for (const lb of s.limb) {
      if (!lb.arm) continue;
      const r = rootOf(s, lb), e = s.p[lb.end], dx = e.x - r.x, dy = e.y - r.y, len = Math.hypot(dx, dy) || 1e-6, h = jointH(lb, Math.min(len, lb.max));
      const side = lb.i % 2 ? 1 : -1, ox = -ay * side, oy = ax * side;          // 몸 바깥쪽
      const nx = -dy / len, ny = dx / len, pref = nx * (ox - 0.5 * ax) + ny * (oy - 0.5 * ay); // +쪽 수직 방향이 바깥·아래와 얼마나 맞는가
      if (h * Math.abs(pref) > 6) lb.swT = pref > 0 ? 1 : -1;
      lb.sw += Math.max(-C.SW_RATE * dt, Math.min(C.SW_RATE * dt, lb.swT - lb.sw));
    }
  }

  // 고관절 각도: 몸통 아래 방향에서 허벅지(골반 자리→무릎)가 벗어난 각도(°). out = 그 다리의 바깥쪽인가, over = 가동 범위를 넘은 각도.
  // 무릎은 늘 바깥으로 벌어지므로 허벅지는 골반→발 선보다 바깥쪽으로 bend°만큼 돌아가 있다(웅크려 무릎을 벌리면 발이 몸 안쪽에 있어도 허벅지는 바깥을 향한다).
  function hipAngle(ax, ay, lb, dx, dy) { // (ax, ay): 몸통 축(엉덩이→가슴) 단위 벡터, (dx, dy): 골반 자리→발
    const len = Math.hypot(dx, dy) || 1e-6, bend = Math.atan2(jointH(lb, Math.min(len, lb.max)), len / 2) * 180 / Math.PI, os = lb.i === 2 ? 1 : -1;
    const cr = -ax * dy + ay * dx, dt = -ax * dx - ay * dy, line = Math.atan2(cr, dt) * 180 / Math.PI, ang = line + os * bend, out = os * ang > 0;
    return { ang, line, bend, out, over: Math.abs(ang) - (out ? C.HIP_OUT : C.HIP_IN) };
  }
  // ---- 자세 풀이(의도 → 자세)
  // 붙은 손발은 그 자리에 둔 채, 가슴을 dc, 엉덩이를 dh만큼 옮기고 싶다는 의도를 받아 "팔다리 길이 한계와 몸통 길이를 지키는 가장 가까운 자세"를 찾는다.
  // 물리 계산의 길이 보정과 같은 식을 유령 몸(가슴·엉덩이 두 점)에 되풀이해 적용한다. 결과로 팔이 다 펴진 채 엉덩이만 옆으로 가는 원호 같은 움직임이 저절로 나온다.
  // 돌려주는 값: 목표 가슴·엉덩이 자리, 팔다리별 연결점이 가야 할 변위 g, 팔·다리 한계에 걸린 횟수
  function solvePose(s, dc, dh, o = {}) {
    const c0 = s.p[0], h0 = s.p[1], wc = 1 / c0.m, wh = 1 / h0.m, am = o.armMargin ?? 1, lm = o.legMargin ?? 0.95;
    const wcx = c0.x + dc[0], wcy = c0.y + dc[1], whx = h0.x + dh[0], why = h0.y + dh[1], th0 = Math.atan2(c0.x - h0.x, h0.y - c0.y);
    let cx = wcx, cy = wcy, hx = whx, hy = why, hitArm = 0, hitLeg = 0;
    const att = s.limb.filter(lb => lb.mode === 'grip' || lb.mode === 'plant').map(lb => { const r = rootOf(s, lb), e = s.p[lb.end], cur = Math.hypot(e.x - r.x, e.y - r.y);
      // 팔: 매달릴 때는 다 펴도 되지만, 손 위에서 누르고 있을 때(어깨가 잡은 면 바깥쪽)는 95%까지만 편다(다 펴지면 손이 위로 들려 떨어진다)
      const press = lb.arm && lb.anchor && (r.x - e.x) * lb.anchor.nx + (r.y - e.y) * lb.anchor.ny > 0;
      return { lb, e, mx: Math.max(lb.max * (lb.arm ? (press ? Math.min(am, 0.95) : am) : lm), Math.min(cur, lb.max)), mn: Math.min(lb.arm ? lb.min + 1 : lb.min * 1.15, cur) }; }); // 이미 한계 밖이면 지금 길이까지는 허용
    const hard = last => {
      { const dx = cx - hx, dy = cy - hy, l = Math.hypot(dx, dy) || 1e-6, d = (l - C.T) / l, ws = wc + wh; cx -= dx * d * wc / ws; cy -= dy * d * wc / ws; hx += dx * d * wh / ws; hy += dy * d * wh / ws; }
      for (const a of att) { const lb = a.lb, k = lb.k, j = (lb.elev || 0) / C.T, ac = (lb.arm ? 1 : 0) + j, ah = (lb.arm ? 0 : 1) - j;
        const rx = (lb.arm ? cx : hx) - k * (cy - hy) + j * (cx - hx), ry = (lb.arm ? cy : hy) + k * (cx - hx) + j * (cy - hy), dx = a.e.x - rx, dy = a.e.y - ry, l = Math.hypot(dx, dy) || 1e-6;
        const over = l > a.mx ? l - a.mx : l < a.mn ? l - a.mn : 0; if (!over) continue;
        if (last) { if (lb.arm) hitArm++; else hitLeg++; }
        const ux = dx / l, uy = dy / l, lam = over / (wc * (ac * ac + k * k) + wh * (ah * ah + k * k)), qx = k * uy, qy = -k * ux;
        cx += lam * wc * (ac * ux + qx); cy += lam * wc * (ac * uy + qy); hx += lam * wh * (ah * ux - qx); hy += lam * wh * (ah * uy - qy); }
      if (C.JOINT) for (const a of att) { const lb = a.lb; if (lb.arm) continue; // 고관절 가동 범위: 디딘 다리가 범위를 넘으면 몸통을 그 발 쪽으로 되돌린다
        const k = lb.k, ax = (cx - hx) / C.T, ay = (cy - hy) / C.T, rx = hx - k * (cy - hy), ry = hy + k * (cx - hx), dx = a.e.x - rx, dy = a.e.y - ry;
        const ha = hipAngle(ax, ay, lb, dx, dy), cur0 = a.hip0 ?? (a.hip0 = hipAngle((c0.x - h0.x) / C.T, (c0.y - h0.y) / C.T, lb, a.e.x - rootOf(s, lb).x, a.e.y - rootOf(s, lb).y).over);
        const ov = ha.over - Math.max(0, cur0); if (ov <= 0) continue; // 이미 넘어 있으면 더 나빠지는 만큼만 되돌린다
        if (last) hitLeg++;
        const l = Math.hypot(dx, dy) || 1e-6, sg = Math.sign(ha.ang), t = ov * Math.PI / 180 * l * 0.5, px = -dy / l * sg, py = dx / l * sg; // 발 둘레로 각도를 줄이는 방향
        cx -= px * t; cy -= py * t; hx -= px * t; hy -= py * t; }
    };
    // 되풀이: ① 원하는 자리 쪽으로 조금 당기고, 몸통 기울기를 지금 기울기 쪽으로 조금 되돌린 뒤 ② 한계(몸통 길이·팔다리 길이·고관절)를 지키게 고친다.
    // ①이 없으면 한계만 지키는 아무 자세(예: 내려갈 수 없을 때 몸통을 기울인 자세)가 나온다. 마지막 몇 번은 ②만 해서 한계를 지키는 자세로 끝낸다.
    for (let it = 0; it < 30; it++) {
      if (it > 0 && it < 24) {
        cx += 0.2 * (wcx - cx); cy += 0.2 * (wcy - cy); hx += 0.2 * (whx - hx); hy += 0.2 * (why - hy);
        const th = Math.atan2(cx - hx, hy - cy); let d = th0 - th; d = Math.atan2(Math.sin(d), Math.cos(d)) * 0.15;
        const mx = (cx + hx) / 2, my = (cy + hy) / 2, ca = Math.cos(d), sa = Math.sin(d), rot = (x, y) => [mx + (x - mx) * ca - (y - my) * sa, my + (x - mx) * sa + (y - my) * ca];
        [cx, cy] = rot(cx, cy); [hx, hy] = rot(hx, hy);
      }
      hard(false); hard(it >= 28);
    }
    const g = [null, null, null, null];
    for (const a of att) { const lb = a.lb, k = lb.k, j = (lb.elev || 0) / C.T, r = rootOf(s, lb); g[lb.i] = [(lb.arm ? cx : hx) - k * (cy - hy) + j * (cx - hx) - r.x, (lb.arm ? cy : hy) + k * (cx - hx) + j * (cy - hy) - r.y]; }
    return { c: [cx, cy], hp: [hx, hy], g, hitArm, hitLeg };
  }

  // ---- 몸
  const pt = (x, y, m) => ({ x, y, px: x, py: y, vx: 0, vy: 0, m, fx: 0, fy: 0 });
  const STATIONS = {
    1: { name: '두 손 매달리기', c: [307, 371], hands: [[296, 300], [318, 300]] },
    2: { name: '한 손 매달리기', c: [322, 372], hands: [null, [322, 300]] },
    3: { name: '발판 위 웅크리기', c: [307, 371], p: [308, 425], hands: [[296, 300], [318, 300]], feet: [[280, 463], [294, 463]] },
    4: { name: '건너편 한 손', c: [476, 417], hands: [[476, 345], null] },
    5: { name: '반동 연습(한 손, 주변 빈 공간)', c: [815, 372], hands: [null, [815, 300]] },
  };
  function create(world, station = 1) {
    const st = typeof station === 'object' ? station : STATIONS[station] || STATIONS[1];
    const c = st.c, hp = st.p || [c[0], c[1] + C.T];
    const s = { world, station, t: 0, dead: false, won: false, winT: 0, pushT: -1, aim: null, wasPower: false, pcx: 0, pcy: 0, act: 0, events: [], p: [pt(c[0], c[1], C.MC), pt(hp[0], hp[1], C.MP)], limb: [] };
    for (let i = 0; i < 4; i++) {
      const arm = i < 2, root = arm ? 0 : 1, side = i % 2 ? 1 : -1;
      const at = arm ? st.hands[i] : st.feet && st.feet[i - 2];
      const k = side * (arm ? C.SW : C.HW) / C.T, r = rootOf(s, { root, k });
      const pos = at || (arm ? [r.x + side * 8, r.y + C.A * 0.9] : [r.x + side * 7, r.y + C.L * (st.tuck ? 0.45 : 0.95)]);
      s.p.push(pt(pos[0], pos[1], arm ? C.MH : C.MF));
      const lb = { i, arm, root, k, sw: arm ? side : -side, swT: arm ? side : -side, end: 2 + i, max: arm ? C.A : C.L, min: arm ? C.AMIN : C.LMIN, mode: 'free', anchor: null, L0: 0, tens: 0, lam: 0, slipT: 0, ang: 0, contact: false, noContactT: 0, poly: null, force: 0, brace: false, ext: 0, cmp: 0, cnx: 0, cny: -1, mj: null };
      if (at && arm) { const g = nearestGrip(world, at[0], at[1]); lb.mode = 'grip'; lb.anchor = g; s.p[2 + i].x = g.x; s.p[2 + i].y = g.y; }
      if (at && !arm) { const q = nearestSurface(world, at[0], at[1]); lb.mode = 'plant'; lb.contact = true; lb.brace = true; lb.poly = q.poly; lb.cnx = q.nx; lb.cny = q.ny; }
      lb.L0 = Math.min(lb.max, Math.hypot(pos[0] - r.x, pos[1] - r.y));
      if (at) lb.ext = Math.max(0, Math.hypot(s.p[2 + i].x - r.x, s.p[2 + i].y - r.y) - lb.max); // 시작 자세가 팔다리 길이보다 멀면(몸 비율을 바꿨을 때) 잡는 순간처럼 느슨하게 시작해 천천히 당긴다
      s.limb.push(lb);
    }
    return s;
  }

  function handleInput(s, inp) {
    for (let i = 0; i < 4; i++) {
      const lb = s.limb[i], e = s.p[lb.end], r = rootOf(s, lb), held = lb.arm ? inp.hand[i] : inp.foot[i - 2];
      if (inp.drop && inp.drop[i] && lb.mode === 'reach') { lb.mode = 'free'; continue; } // 붙이려 하지 않고 힘만 뺀다
      if (held && lb.mode !== 'reach') {
        if (lb.mode === 'grip') s.events.push({ type: 'release', limb: i, x: e.x, y: e.y });
        lb.mode = 'reach'; lb.anchor = null; lb.tens = 0; lb.slipT = 0; lb.mj = null;
      } else if (!held && lb.mode === 'reach') {
        if (lb.arm) {
          const g = nearestGrip(s.world, e.x, e.y);
          // 일반 바위 면: 면이 위를 향한 정도로만 잡을 수 있는지가 정해진다(너무 가파르면 손이 걸리지 않는다)
          const steep = g && g.type === 'rock' ? Math.acos(Math.max(-1, Math.min(1, -g.ny))) * 180 / Math.PI : 0;
          if (g && g.d <= C.GRAB_R && steep > GRIP.rock.th) {
            lb.mode = 'free'; s.events.push({ type: 'nohold', limb: i, x: e.x, y: e.y, ang: steep, lim: GRIP.rock.th, kind: g.type });
          } else if (g && g.d <= C.GRAB_R) {
            lb.mode = 'grip'; lb.anchor = g; e.x = g.x; e.y = g.y; e.vx = e.vy = 0;
            lb.brace = false; lb.L0 = lb.max; lb.ext = Math.max(0, Math.hypot(e.x - r.x, e.y - r.y) - lb.max); // 잡는 순간 팔은 느슨하다. 당긴 길이는 힘주기로 정한다
            s.events.push({ type: 'grab', limb: i, x: g.x, y: g.y, poly: g.poly });
          } else { lb.mode = 'free'; s.events.push({ type: 'miss', limb: i, x: e.x, y: e.y, d: g ? g.d - C.GRAB_R : 999 }); }
        } else {
          const q = nearestSurface(s.world, e.x, e.y), near = q && q.d <= C.PLANT_R && q.ny < 0.3, sp = Math.hypot(e.vx, e.vy), ok = near && sp <= C.PLANT_V; // 아래를 향한 면(천장)에는 디딜 수 없다
          if (ok) { e.x = q.x + q.nx * C.FOOT_R; e.y = q.y + q.ny * C.FOOT_R; e.vx = r.vx; e.vy = r.vy; lb.poly = q.poly; lb.cnx = q.nx; lb.cny = q.ny; }
          if (ok) { lb.mode = 'plant'; lb.brace = false; lb.noContactT = 0; lb.contact = true; lb.cmp = Math.max(0, lb.min - Math.hypot(e.x - r.x, e.y - r.y)); lb.ext = Math.max(0, Math.hypot(e.x - r.x, e.y - r.y) - lb.max); lb.L0 = Math.max(lb.min, Math.min(lb.max, Math.hypot(e.x - r.x, e.y - r.y))); s.events.push({ type: 'plant', limb: i, x: e.x, y: e.y }); }
          else { lb.mode = 'free'; s.events.push({ type: 'footmiss', limb: i, x: e.x, y: e.y, d: q ? q.d - C.PLANT_R : 999, fast: near ? sp : 0 }); }
        }
      }
    }
  }

  function substep(s, inp, h) {
    const p = s.p, c = p[0], hp = p[1];
    for (const q of p) { q.fx = 0; q.fy = q.m * C.G; }
    let planted = false;
    const anchored = s.limb.some(l => l.mode === 'grip' || l.mode === 'plant');
    const handOn = s.limb[0].mode === 'grip' || s.limb[1].mode === 'grip';
    for (const lb of s.limb) {
      const r = rootOf(s, lb), e = p[lb.end], arm = lb.arm;
      const dx = e.x - r.x, dy = e.y - r.y, len = Math.hypot(dx, dy) || 1e-6, ux = dx / len, uy = dy / len;
      const rv = (e.vx - r.vx) * ux + (e.vy - r.vy) * uy;
      lb.force = 0;
      if (lb.mode === 'reach') {
        const tg = inp.t && inp.t[lb.i]; // 손발마다 목표가 따로 주어지면 그것을 쓴다
        let gx0 = tg ? tg[0] : inp.cx, gy0 = tg ? tg[1] : inp.cy;
        if (arm ? C.SMOOTH : C.SMOOTH_FOOT) { // 몸 기준 목표를 최소 저크 곡선으로 따라간다: 천천히 출발해 가운데서 가장 빠르고 천천히 멈춘다
          let rx = gx0 - r.x, ry = gy0 - r.y; const rl = Math.hypot(rx, ry) || 1, cap = lb.max * 0.97; if (rl > cap) { rx *= cap / rl; ry *= cap / rl; }
          mjStep(lb, e.x - r.x, e.y - r.y, rx, ry, h);
          gx0 = r.x + lb.mj.p[0]; gy0 = r.y + lb.mj.p[1];
        }
        let tx = gx0 - r.x, ty = gy0 - r.y, tl = Math.hypot(tx, ty);
        if (tl < 1e-3) { tx = 0; ty = 1; tl = 1; }
        if (!arm) { // 다리 가동 범위: 몸통 아래 방향 기준
          const dxn = (hp.x - c.x) / C.T, dyn = (hp.y - c.y) / C.T;
          const cr = dxn * ty - dyn * tx, dt = dxn * tx + dyn * ty, ang = Math.atan2(cr, dt);
          // 관절 몸: 고관절은 바깥쪽으로 많이, 안쪽(몸 중심선 너머)으로는 조금만 벌어진다. 각도가 +면 화면 왼쪽이므로 왼다리의 바깥쪽
          // (허벅지 기준 범위를 골반→발 선의 범위로 옮기면: 바깥쪽은 굽힌 만큼 좁아지고 안쪽은 그만큼 넓어진다)
          const out = (lb.i === 2 ? 1 : -1) * ang > 0, bend = C.JOINT ? Math.atan2(jointH(lb, Math.max(lb.min, Math.min(lb.max, tl))), Math.max(lb.min, Math.min(lb.max, tl)) / 2) * 180 / Math.PI : 0;
          const lim = (C.JOINT ? (out ? C.HIP_OUT - bend : C.HIP_IN + bend) : C.LEG_RANGE) * Math.PI / 180;
          if (Math.abs(ang) > lim) { const a = Math.sign(ang) * lim, ca = Math.cos(a), sa = Math.sin(a); tx = (dxn * ca - dyn * sa) * tl; ty = (dyn * ca + dxn * sa) * tl; }
        }
        const tm = Math.max(lb.min * 1.1, Math.min(lb.max * 0.97, tl)); tx *= tm / tl; ty *= tm / tl;
        const kp = arm ? M.handKp : M.footKp, kd = arm ? M.handKd : M.footKd, fm = arm ? M.handReach : M.footReach;
        let Fx = kp * (r.x + tx - e.x) - kd * (e.vx - r.vx), Fy = kp * (r.y + ty - e.y) - kd * (e.vy - r.vy) - e.m * C.G;
        const fl = Math.hypot(Fx, Fy); if (fl > fm) { Fx *= fm / fl; Fy *= fm / fl; }
        e.fx += Fx; e.fy += Fy; r.fx -= Fx; r.fy -= Fy;
        { // 팔다리를 휘두르는 반작용은 몸통을 반대로 돌린다(각운동량 보존)
          const tau = dx * Fy - dy * Fx, gx = -(c.y - hp.y) / C.T, gy = (c.x - hp.x) / C.T, g = -tau / C.T * (anchored ? C.REACT : 1);
          c.fx += g * gx; c.fy += g * gy; hp.fx -= g * gx; hp.fy -= g * gy;
        }
      } else if (lb.mode === 'grip' || lb.mode === 'plant') {
        if (!arm) planted = true;
        // 관절 몸: 팔다리가 낼 수 있는 힘은 관절(팔꿈치·무릎)이 접힌 정도에 따라 달라진다
        const jf = C.JOINT ? jointCap(lb, len) * (arm ? C.ARM_K : C.LEG_K) : 1;
        const k = arm ? M.armK : M.legK, cc = arm ? M.armC : M.legC, pull = (arm ? M.armPull : M.legPull) * jf;
        // 팔은 몸이 손보다 면 바깥쪽(위)에 있을 때만 밀 수 있다. 아래에 매달렸을 때는 줄처럼 느슨해진다.
        let push = (arm ? (lb.brace && (r.x - e.x) * lb.anchor.nx + (r.y - e.y) * lb.anchor.ny > 0 ? M.armPush : 0) : M.legPush) * jf;
        const actK = C.MUSCLE ? s.act : 1;
        if (!arm && C.MUSCLE && lb.brace) { // 다리가 낼 수 있는 힘: 활성도와 펴지는 속도에 따라 달라진다
          push *= (C.LEGPUSH_V05 / 1.8) * (C.PUSH0 + (1 - C.PUSH0) * actK); // v0.5: 최대 힘은 다리 하나 2.6W, 대신 속도에 따라 줄어든다
          if (C.FV) push *= rv >= 0 ? Math.max(0.05, (1 - rv / C.VMAX) / (1 + rv / (C.FV_A * C.VMAX))) : Math.min(C.ECC, 1 + (C.ECC - 1) * (-rv) / (0.06 * C.VMAX));
        }
        let drive = 0;
        if (inp.power) lb.brace = true;
        if (inp.power) { // 힘주기: 붙은 팔다리가 몸을 커서 쪽으로 옮기도록 길이를 바꾼다
          // 몸(팔은 가슴, 다리는 엉덩이)이 가야 할 변위 중 이 팔다리 방향 성분만큼 늘이거나 줄인다
          // 자세 풀이가 준 목표 자세가 있으면(inp.g) 그 자세에서 이 연결점이 가야 할 변위를 쓴다
          // 목표 자리(pcx, pcy)는 가슴 기준이므로 연결점이 아니라 가슴·엉덩이 질점과 비교한다(연결점이 옆에 있어도 몸통 전체가 그만큼 옮겨 가는 것으로 본다)
          const b0 = p[lb.root], tg = inp.g && inp.g[lb.i], gx = tg ? tg[0] : s.pcx - b0.x, gy = tg ? tg[1] : s.pcy + (arm ? 0 : C.T) - b0.y;
          const Ld = Math.max(lb.min, Math.min(lb.max, len - (gx * ux + gy * uy))), rate = (arm ? M.armRate : M.legRate) * h * (C.MUSCLE ? C.ACT0 + (1 - C.ACT0) * actK : 1) * (inp.gain ?? 1);
          let dL = Math.max(-rate, Math.min(rate, Ld - lb.L0));
          // 도약 연결: 발을 디딘 채 힘을 주기 시작하면, 손이 붙어 있는 동안은 잠깐(COUPLE초) 자세를 버티며 기다렸다가
          // 손을 놓는 순간 또는 시간이 지나면 민다
          if (handOn && s.pushT >= 0 && s.pushT < C.COUPLE) dL = 0;
          if (inp.crouch && !arm) { dL = Math.max(-C.CROUCH_V * h, dL); // 웅크리기: 다리는 체중을 받치며 정해진 빠르기로만 접힌다
            if (Ld >= len - 1.5 && dL < 0) dL = 0; } // 더 내려갈 수 없는 자세(팔이 다 펴짐)면 다리 힘을 빼지 않는다: 받치던 체중을 그대로 받친 채 힘만 모은다
          if (inp.move) { const vm = C.MOVE_V * h; dL = Math.max(-vm, Math.min(vm, dL)); } // 몸통 옮기기(WASD)는 팔다리 길이를 천천히 바꾼다(작은 위쪽 성분에도 다리가 튀듯 펴지지 않게)
          lb.L0 += dL; drive = dL / h;
          if (!arm && lb.L0 < len - 1.5) { lb.L0 = len - 1.5; drive = 0; } // 다리를 접을 때 발을 들어올리지 않는다(몸이 내려오는 만큼만 접힌다)
        }
        if (C.JOINT && !arm && (!inp.power || inp.crouch) && lb.brace && -(ux * lb.cnx + uy * lb.cny) > 0.64 && lb.L0 < lb.max * 0.9) {
          // 관절 몸의 서 있기: 힘주기를 하지 않을 때(와 웅크려 모으는 동안), 몸이 발 위에 있는데 잡은 팔이 체중을 많이 지고 있으면 다리를 조금씩 펴서 체중을 발로 옮긴다
          const load = Math.max(s.limb[0].mode === 'grip' ? s.limb[0].tens : 0, s.limb[1].mode === 'grip' ? s.limb[1].tens : 0) / W;
          if (load > C.STAND_ARM) lb.L0 = Math.max(lb.L0, Math.min(len + 3, lb.L0 + C.STAND_V * h * Math.min(1, (load - C.STAND_ARM) / 0.5)));
        }
        let err = len - lb.L0;
        if (k * err > pull) { lb.L0 = len - pull / k; err = pull / k; } // 버티지 못하면 그만큼 늘어난다
        else if (k * err < -push) { lb.L0 = len + push / k; err = -push / k; }
        lb.L0 = Math.max(lb.min, Math.min(lb.max, lb.L0));
        let Fa = Math.max(-push, Math.min(pull, k * err + cc * (rv - drive)));
        if (arm && Fa) { // 손이 미끄러질 방향으로는 팔 힘을 주지 않는다(줄처럼 팽팽해져 걸리는 힘은 그대로 받는다)
          const a = lb.anchor, cos = Math.sign(Fa) * (ux * a.nx + uy * a.ny);
          if (cos < Math.cos((GRIP[a.type].th - 4) * Math.PI / 180)) { Fa = 0; lb.L0 = len; }
        }
        // 막 디딘 발은 가볍게 누르고만 있다(몸이 흔들려도 따라가며 붙어 있다). 힘주기를 쓴 뒤부터 버팀목이 된다
        if (!arm && !lb.brace) { // 면을 향해 누른다(면을 따라 밀지 않으므로 발이 미끄러지지 않는다)
          // 몸이 발 위쪽(면의 바깥 방향 50° 이내)에 실리면 그 자리에서 받쳐 준다. 그 밖에는 길이가 몸을 따라간다
          const over = -(ux * lb.cnx + uy * lb.cny) > 0.64;
          if (!over || len > lb.L0) { lb.L0 = len; Fa = 0; }
          if ((r.x - e.x) * lb.cnx + (r.y - e.y) * lb.cny > 0) { e.fx -= lb.cnx * M.legPress; e.fy -= lb.cny * M.legPress; r.fx += lb.cnx * M.legPress; r.fy += lb.cny * M.legPress; }
        }
        if (arm && C.PALM && Fa < 0 && lb.anchor && lb.anchor.ny < -0.5 && (r.y < e.y)) {
          // 손으로 눌러 버틸 때(턱 위로 올라선 자세): 손목·어깨 힘으로 가슴을 손 위로 되돌린다. 반력은 잡은 손이 받는다
          const f = Math.max(-M.palm, Math.min(M.palm, -M.palmK * (r.x - e.x) - M.palmC * r.vx));
          r.fx += f;
        }
        if (!arm && Fa < 0 && lb.cny < -0.7 && (!inp.power || inp.crouch)) { // (관절 몸은 웅크려 모으는 동안에도 발목으로 균형을 잡는다)
          // 발목: 체중을 받치고 있는 발은 엉덩이를 발 위로 되돌리는 작은 힘을 낸다(한 발 서기). 반력은 발의 마찰이 받는다
          const f = Math.max(-M.ankle, Math.min(M.ankle, -M.ankleK * (r.x - e.x) - M.ankleC * (r.vx - e.vx)));
          r.fx += f; e.fx -= f;
        }
        r.fx += Fa * ux; r.fy += Fa * uy; e.fx -= Fa * ux; e.fy -= Fa * uy;
        lb.force = Fa;
        let latCap = (arm ? C.LAT_ARM : C.LAT_LEG) * W * actK * (inp.gain ?? 1);
        if (!arm) latCap = Math.min(latCap, C.MU_LAT * Math.max(0, -Fa)); // 발은 누르는 만큼만 옆으로 밀 수 있다(마찰)
        if (inp.power && latCap > 0 && (arm || lb.brace)) { // 옆으로 미는 힘: 목표 방향 중 팔다리 축에 수직인 성분, 반작용은 손·발이 받는다
          const b0 = p[lb.root], tg = inp.g && inp.g[lb.i], gx = tg ? tg[0] : s.pcx - b0.x, gy = tg ? tg[1] : s.pcy + (arm ? 0 : C.T) - b0.y, gu = gx * ux + gy * uy, px = gx - gu * ux, py = gy - gu * uy;
          const vx = (r.vx - e.vx) - rv * -ux, vy = (r.vy - e.vy) - rv * -uy; // 축에 수직인 상대 속도(대략)
          const vu = vx * ux + vy * uy, vpx = vx - vu * ux, vpy = vy - vu * uy;
          let Lx = latCap / C.LAT_D * px - latCap / 300 * vpx, Ly = latCap / C.LAT_D * py - latCap / 300 * vpy; const Ll = Math.hypot(Lx, Ly);
          if (Ll > latCap) { Lx *= latCap / Ll; Ly *= latCap / Ll; }
          r.fx += Lx; r.fy += Ly; e.fx -= Lx; e.fy -= Ly;
        }
      } else {
        const cf = M.freeC[lb.i], Fx = -cf * (e.vx - r.vx), Fy = -cf * (e.vy - r.vy);
        e.fx += Fx; e.fy += Fy; r.fx -= Fx; r.fy -= Fy;
      }
      flushRoot(s, lb, r);
    }
    if (C.JOINT && s.limb.some(l => l.arm && l.mode === 'grip' && l.tens > 0.1 * W)) {
      // 관절 몸: 손에 매달려 있을 때 어깨·몸통 근육이 몸통의 회전을 줄인다(한 손으로 잡은 뒤 몸통이 채찍처럼 돌아가지 않게). 반력은 잡은 손이 받는다
      const nx = -(c.y - hp.y) / C.T, ny = (c.x - hp.x) / C.T, vr = (c.vx - hp.vx) * nx + (c.vy - hp.vy) * ny;
      const f = Math.max(-C.ROT_MAX * W, Math.min(C.ROT_MAX * W, -C.ROT_C * vr));
      c.fx += f * nx; c.fy += f * ny; hp.fx -= f * nx; hp.fy -= f * ny;
    }
    if (planted) { // 발을 디뎠을 때만 몸통을 세우는 힘(발목·골반 역할)
      const gx = -(c.y - hp.y) / C.T, gy = (c.x - hp.x) / C.T;
      let f = (M.upK * (hp.x - c.x) - M.upC * (c.vx - hp.vx)) * gx + (M.upK * (hp.y - C.T - c.y) - M.upC * (c.vy - hp.vy)) * gy;
      f = Math.max(-M.upMax, Math.min(M.upMax, f));
      c.fx += f * gx; c.fy += f * gy; hp.fx -= f * gx; hp.fy -= f * gy;
    }
    for (let i = 0; i < p.length; i++) {
      const q = p[i], lb = i >= 2 ? s.limb[i - 2] : null;
      q.px = q.x; q.py = q.y;
      if (lb && lb.mode === 'grip') { q.x = lb.anchor.x; q.y = lb.anchor.y; q.vx = q.vy = 0; continue; }
      q.vx += q.fx / q.m * h; q.vy += q.fy / q.m * h;
      q.x += q.vx * h; q.y += q.vy * h;
    }
    for (const lb of s.limb) { lb.lam = 0; lb.hit = false; lb.taut = false; if (lb.ext > 0) lb.ext = Math.max(0, lb.ext - 120 * h); if (lb.cmp > 0) lb.cmp = Math.max(0, lb.cmp - 120 * h); }
    for (let it = 0; it < C.ITER; it++) {
      { // 몸통 막대
        const dx = c.x - hp.x, dy = c.y - hp.y, l = Math.hypot(dx, dy) || 1e-6, d = (l - C.T) / l, wc = 1 / c.m, wp = 1 / hp.m, ws = wc + wp;
        c.x -= dx * d * wc / ws; c.y -= dy * d * wc / ws; hp.x += dx * d * wp / ws; hp.y += dy * d * wp / ws;
      }
      for (const lb of s.limb) {
        const r = rootOf(s, lb), e = p[lb.end], pin = lb.mode === 'grip';
        const dx = e.x - r.x, dy = e.y - r.y, l = Math.hypot(dx, dy) || 1e-6;
        const mx = lb.max + lb.ext, mn = lb.min - lb.cmp, over = l > mx ? l - mx : l < mn ? l - mn : 0;
        if (over && !lb.k && !lb.elev) {
          const wr = 1 / r.m, we = pin ? 0 : 1 / e.m, ws = wr + we, d = over / l;
          r.x += dx * d * wr / ws; r.y += dy * d * wr / ws; e.x -= dx * d * we / ws; e.y -= dy * d * we / ws;
          if (pin) lb.lam += over;
          if (lb.mode === 'plant' && l > mx) lb.taut = true;
        } else if (over) { // 연결점이 몸통 옆에 있을 때: 길이 보정을 가슴·엉덩이에 나눈다(연결점 = 밑점 + k·R(가슴 − 엉덩이)의 기울기대로)
          const ux = dx / l, uy = dy / l, k = lb.k, j = (lb.elev || 0) / C.T, ac = (lb.arm ? 1 : 0) + j, ah = (lb.arm ? 0 : 1) - j, wc = 1 / c.m, wh = 1 / hp.m, we = pin ? 0 : 1 / e.m;
          const lam = over / (wc * (ac * ac + k * k) + wh * (ah * ah + k * k) + we), qx = k * uy, qy = -k * ux; // (qx, qy) = k·Rᵀ(u)
          c.x += lam * wc * (ac * ux + qx); c.y += lam * wc * (ac * uy + qy); hp.x += lam * wh * (ah * ux - qx); hp.y += lam * wh * (ah * uy - qy);
          e.x -= lam * we * ux; e.y -= lam * we * uy;
          if (pin && over > 0) lb.lam += over; // 팔이 가장 짧은 길이에 닿아 눌리는 것(어깨가 손 옆을 지나갈 때)은 손을 밀어내는 힘으로 치지 않는다
          if (lb.mode === 'plant' && l > mx) lb.taut = true;
        }
        if (lb.mode === 'plant') { // 디딘 발만 그 지형과 맞닿는다
          for (const pl of s.world) {
            if (pl.id !== lb.poly) continue;
            const hit = polyPush(pl, e.x, e.y, C.FOOT_R + 1.5);
            if (!hit) continue;
            lb.hit = true;
            const dep = hit.depth - 1.5; if (dep <= 0) continue;
            e.x += hit.nx * dep; e.y += hit.ny * dep;
            friction(e, hit.nx, hit.ny, dep);
          }
        }
      }
      for (const q of p) if (q.y > C.FLOOR - 4) { const dep = q.y - (C.FLOOR - 4); q.y = C.FLOOR - 4; friction(q, 0, -1, dep); s.hitMat = true; }
    }
    for (let i = 0; i < p.length; i++) { const q = p[i]; q.vx = (q.x - q.px) / h; q.vy = (q.y - q.py) / h; }
    for (const lb of s.limb) {
      if (lb.mode === 'grip') { const ft = lb.force + 50 * lb.lam / (h * h); lb.tens += (ft - lb.tens) * Math.min(1, h / 0.03); }
      if (!lb.arm) lb.contact = lb.hit;
    }
  }
  // 최소 저크 궤적: 지금 위치·속도·가속도에서 목표까지 T초에 매끄럽게 가는 5차 다항식. 목표가 3px 넘게 바뀌면 지금 상태에서 다시 짠다
  function mjPlan(p0, v0, a0, g, T) {
    const c = [];
    for (let k = 0; k < 2; k++) {
      const d = g[k] - p0[k] - v0[k] * T - 0.5 * a0[k] * T * T, dv = -v0[k] - a0[k] * T, da = -a0[k];
      const c3 = (10 * d - 4 * dv * T + 0.5 * da * T * T) / (T ** 3), c4 = (-15 * d + 7 * dv * T - da * T * T) / (T ** 4), c5 = (6 * d - 3 * dv * T + 0.5 * da * T * T) / (T ** 5);
      c.push([p0[k], v0[k], 0.5 * a0[k], c3, c4, c5]);
    }
    return c;
  }
  function mjStep(lb, hx, hy, gx, gy, h) {
    let m = lb.mj;
    if (!m) m = lb.mj = { p: [hx, hy], v: [0, 0], a: [0, 0], g: [hx, hy], t: 0, T: 0, c: null };
    if (Math.hypot(gx - m.g[0], gy - m.g[1]) > 3 || !m.c) {
      const d = Math.hypot(gx - m.p[0], gy - m.p[1]), full = C.MJ_T0 + C.MJ_TK * d / C.A;
      const T = m.c && m.t < m.T ? Math.max(0.06, Math.min(full, m.T - m.t + 0.02)) : full; // 움직이는 중이면 남은 시간을 유지한다
      m.c = mjPlan(m.p, m.v, m.a, [gx, gy], T); m.g = [gx, gy]; m.t = 0; m.T = T;
    }
    m.t = Math.min(m.T, m.t + h); const t = m.t;
    for (let k = 0; k < 2; k++) { const c = m.c[k]; m.p[k] = c[0] + c[1] * t + c[2] * t * t + c[3] * t ** 3 + c[4] * t ** 4 + c[5] * t ** 5; m.v[k] = c[1] + 2 * c[2] * t + 3 * c[3] * t * t + 4 * c[4] * t ** 3 + 5 * c[5] * t ** 4; m.a[k] = 2 * c[2] + 6 * c[3] * t + 12 * c[4] * t * t + 20 * c[5] * t ** 3; }
    if (m.t >= m.T) { m.v = [0, 0]; m.a = [0, 0]; }
  }
  function friction(q, nx, ny, dep) {
    const mx = q.x - q.px, my = q.y - q.py, dn = mx * nx + my * ny, tx = mx - dn * nx, ty = my - dn * ny, tl = Math.hypot(tx, ty);
    if (tl < 1e-9) return;
    const k = Math.min(1, C.MU * dep / tl);
    q.x -= tx * k; q.y -= ty * k;
  }

  function step(s, inp, dt) {
    s.events.length = 0;
    if (s.dead) return;
    handleInput(s, inp);
    const footOn = s.limb[2].mode === 'plant' || s.limb[3].mode === 'plant';
    if (inp.px !== undefined) { inp = Object.assign({}, inp); } // (아래에서 힘 방향 목표를 따로 쓴다)
    s.pushT = inp.power && footOn ? (s.pushT < 0 ? 0 : s.pushT + dt) : -1;
    // 힘 방향 유지(비교용 선택 사항): 힘주기를 시작한 순간의 방향을 AIMHOLD초 동안 쓴다
    if (inp.power && !s.wasPower) s.aim = { dx: inp.cx - s.p[0].x, dy: inp.cy - s.p[0].y, t: 0 };
    if (!inp.power) s.aim = null; else s.aim.t += dt;
    s.wasPower = inp.power;
    if (s.aim && s.aim.t < C.AIMHOLD) { s.pcx = s.p[0].x + s.aim.dx; s.pcy = s.p[0].y + s.aim.dy; } else { s.pcx = inp.px !== undefined ? inp.px : inp.cx; s.pcy = inp.py !== undefined ? inp.py : inp.cy; }
    // 근육 활성도: 힘을 주는 동안 차오르고, 빼면 빠진다
    s.act += inp.power ? (1 - s.act) * (1 - Math.exp(-dt / C.TA)) : -s.act * (1 - Math.exp(-dt / C.TD));
    const h = dt / C.SUB;
    for (let k = 0; k < C.SUB; k++) substep(s, inp, h);
    s.t += dt;
    if (C.JOINT) { updateSwivel(s, dt); updateElev(s, dt); }
    for (const lb of s.limb) {
      const e = s.p[lb.end];
      if (lb.mode === 'grip') { // 손이 버티는 방향 검사: 면을 누르는 방향에서 한계각을 넘게 당기면 미끄러진다
        const c = rootOf(s, lb); // 당기는 방향은 손→어깨(기존 두 몸은 어깨 = 가슴)
        const a = lb.anchor, dx = c.x - a.x, dy = c.y - a.y, l = Math.hypot(dx, dy) || 1e-6, sg = lb.tens >= 0 ? 1 : -1;
        const cos = sg * (dx * -a.nx + dy * -a.ny) / l, lim = GRIP[a.type].th;
        lb.ang = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI; lb.lim = lim;
        if (Math.abs(lb.tens) > 0.25 * W && lb.ang > lim) lb.slipT += dt; else lb.slipT = 0;
        if (lb.slipT > 0.06) { lb.mode = 'free'; lb.anchor = null; s.events.push({ type: 'slip', limb: lb.i, x: e.x, y: e.y, ang: lb.ang, lim, kind: a.type }); }
      } else if (lb.mode === 'plant') {
        // 발은 면을 눌러야만 붙어 있다. 다리가 팽팽하게 당겨지는데 엉덩이가 면 안쪽(발 아래)에 있으면 발에 매달린 것이므로 떨어진다
        const r = rootOf(s, lb);
        if (lb.taut && (r.x - e.x) * lb.cnx + (r.y - e.y) * lb.cny < 0) { lb.mode = 'free'; s.events.push({ type: 'footoff', limb: lb.i, x: e.x, y: e.y, hang: true }); continue; }
        lb.noContactT = lb.contact ? 0 : lb.noContactT + dt;
        if (lb.noContactT > 0.12) { lb.mode = 'free'; s.events.push({ type: 'footoff', limb: lb.i, x: e.x, y: e.y }); }
      }
    }
    if (s.hitMat) { s.dead = true; s.events.push({ type: 'mat' }); }
    const g = s.limb[0].mode === 'grip' && s.limb[1].mode === 'grip' && s.world.find(pl => pl.goal);
    if (g && s.limb[0].anchor.poly === g.id && s.limb[1].anchor.poly === g.id) { s.winT += dt; if (s.winT > 0.4 && !s.won) { s.won = true; s.events.push({ type: 'win' }); } } else s.winT = 0;
  }
  // 진단용: 전체 운동량·각운동량·역학적 에너지
  function diag(s) {
    let px = 0, py = 0, L = 0, E = 0, m = 0, cx = 0, cy = 0;
    for (const q of s.p) { px += q.m * q.vx; py += q.m * q.vy; m += q.m; cx += q.m * q.x; cy += q.m * q.y; }
    cx /= m; cy /= m;
    for (const q of s.p) { L += q.m * ((q.x - cx) * (q.vy - py / m) - (q.y - cy) * (q.vx - px / m)); E += 0.5 * q.m * (q.vx * q.vx + q.vy * q.vy) - q.m * C.G * q.y; }
    return { px, py, L, E, cx, cy, m };
  }
  const VERSION = 'v0.8.1'; // 물리 판 번호: 계산 결과가 달라지는 변경을 하면 올린다(시범·기록이 어느 물리에서 만든 것인지 적는 데 쓴다)
  return { VERSION, rect, C, M, W, MASS, GRIP, STATIONS, BODIES, setBody, getBody, rootPos, jointPos, jointCap, hipAngle, solvePose, makeWorld, create, step, diag, nearestGrip, nearestSurface };
})();
if (typeof module !== 'undefined') module.exports = PH;
