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
  };
  const MASS = C.MC + C.MP + 2 * C.MH + 2 * C.MF, W = MASS * C.G;
  // 힘 한계(체중 W의 배수)와 스프링 값
  const M = {
    armPull: 1.3 * W, armPush: 0.9 * W, armK: 1.3 * W / 3, armC: 2000, armRate: 320,
    legPush: 1.8 * W, legPull: 0, legPress: 0.15 * W, ankle: 0.15 * W, ankleK: 0.02 * W, ankleC: 300, legK: 1.8 * W / 3, legC: 2400, legRate: 750,
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
    const bx = variant === 'near' ? 452 : 470;
    const dome = []; for (let a = 200; a <= 340; a += 20) dome.push([400 + 36 * Math.cos(a * Math.PI / 180), 248 + 36 * Math.sin(a * Math.PI / 180)]);
    const hex = []; for (let a = 0; a < 360; a += 60) hex.push([415 + 9 * Math.cos(a * Math.PI / 180), 350 + 9 * Math.sin(a * Math.PI / 180)]);
    return [
      rect('A', 'incut', 180, 300, 150, 16), rect('F1', 'ledge', 258, 468, 56, 40),
      poly('J', 'jug', hex), poly('S', 'sloper', dome),
      rect('B', 'ledge', bx, 345, 158 - (bx - 452), 16), rect('F3', 'ledge', 510, 455, 40, 10), rect('F4', 'ledge', 474, 520, 44, 10),
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
    const s = { world, station, t: 0, dead: false, won: false, winT: 0, pushT: -1, aim: null, wasPower: false, pcx: 0, pcy: 0, events: [], p: [pt(c[0], c[1], C.MC), pt(hp[0], hp[1], C.MP)], limb: [] };
    for (let i = 0; i < 4; i++) {
      const arm = i < 2, root = arm ? 0 : 1, side = i % 2 ? 1 : -1;
      const at = arm ? st.hands[i] : st.feet && st.feet[i - 2];
      const r = s.p[root];
      const pos = at || (arm ? [r.x + side * 8, r.y + C.A * 0.9] : [r.x + side * 7, r.y + C.L * (st.tuck ? 0.45 : 0.95)]);
      s.p.push(pt(pos[0], pos[1], arm ? C.MH : C.MF));
      const lb = { i, arm, root, end: 2 + i, max: arm ? C.A : C.L, min: arm ? C.AMIN : C.LMIN, mode: 'free', anchor: null, L0: 0, tens: 0, lam: 0, slipT: 0, ang: 0, contact: false, noContactT: 0, poly: null, force: 0, brace: false, ext: 0, cmp: 0, cnx: 0, cny: -1 };
      if (at && arm) { const g = nearestGrip(world, at[0], at[1]); lb.mode = 'grip'; lb.anchor = g; s.p[2 + i].x = g.x; s.p[2 + i].y = g.y; }
      if (at && !arm) { const q = nearestSurface(world, at[0], at[1]); lb.mode = 'plant'; lb.contact = true; lb.brace = true; lb.poly = q.poly; lb.cnx = q.nx; lb.cny = q.ny; }
      lb.L0 = Math.min(lb.max, Math.hypot(pos[0] - r.x, pos[1] - r.y));
      s.limb.push(lb);
    }
    return s;
  }

  function handleInput(s, inp) {
    for (let i = 0; i < 4; i++) {
      const lb = s.limb[i], e = s.p[lb.end], r = s.p[lb.root], held = lb.arm ? inp.hand[i] : inp.foot[i - 2];
      if (inp.drop && inp.drop[i] && lb.mode === 'reach') { lb.mode = 'free'; continue; } // 붙이려 하지 않고 힘만 뺀다
      if (held && lb.mode !== 'reach') {
        if (lb.mode === 'grip') s.events.push({ type: 'release', limb: i, x: e.x, y: e.y });
        lb.mode = 'reach'; lb.anchor = null; lb.tens = 0; lb.slipT = 0;
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
          const q = nearestSurface(s.world, e.x, e.y), near = q && q.d <= C.PLANT_R, sp = Math.hypot(e.vx, e.vy), ok = near && sp <= C.PLANT_V;
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
      const r = p[lb.root], e = p[lb.end], arm = lb.arm;
      const dx = e.x - r.x, dy = e.y - r.y, len = Math.hypot(dx, dy) || 1e-6, ux = dx / len, uy = dy / len;
      const rv = (e.vx - r.vx) * ux + (e.vy - r.vy) * uy;
      lb.force = 0;
      if (lb.mode === 'reach') {
        const tg = inp.t && inp.t[lb.i]; // 손발마다 목표가 따로 주어지면 그것을 쓴다
        let tx = (tg ? tg[0] : inp.cx) - r.x, ty = (tg ? tg[1] : inp.cy) - r.y, tl = Math.hypot(tx, ty);
        if (tl < 1e-3) { tx = 0; ty = 1; tl = 1; }
        if (!arm) { // 다리 가동 범위: 몸통 아래 방향 기준
          const dxn = (hp.x - c.x) / C.T, dyn = (hp.y - c.y) / C.T, lim = C.LEG_RANGE * Math.PI / 180;
          const cr = dxn * ty - dyn * tx, dt = dxn * tx + dyn * ty, ang = Math.atan2(cr, dt);
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
        const k = arm ? M.armK : M.legK, cc = arm ? M.armC : M.legC, pull = arm ? M.armPull : M.legPull;
        // 팔은 몸이 손보다 면 바깥쪽(위)에 있을 때만 밀 수 있다. 아래에 매달렸을 때는 줄처럼 느슨해진다.
        const push = arm ? (lb.brace && (r.x - e.x) * lb.anchor.nx + (r.y - e.y) * lb.anchor.ny > 0 ? M.armPush : 0) : M.legPush;
        let drive = 0;
        if (inp.power) lb.brace = true;
        if (inp.power) { // 힘주기: 붙은 팔다리가 몸을 커서 쪽으로 옮기도록 길이를 바꾼다
          // 몸(팔은 가슴, 다리는 엉덩이)이 가야 할 변위 중 이 팔다리 방향 성분만큼 늘이거나 줄인다
          const gx = s.pcx - r.x, gy = s.pcy + (arm ? 0 : C.T) - r.y;
          const Ld = Math.max(lb.min, Math.min(lb.max, len - (gx * ux + gy * uy))), rate = (arm ? M.armRate : M.legRate) * h;
          let dL = Math.max(-rate, Math.min(rate, Ld - lb.L0));
          // 도약 연결: 발을 디딘 채 힘을 주기 시작하면, 손이 붙어 있는 동안은 잠깐(COUPLE초) 자세를 버티며 기다렸다가
          // 손을 놓는 순간 또는 시간이 지나면 민다
          if (handOn && s.pushT >= 0 && s.pushT < C.COUPLE) dL = 0;
          lb.L0 += dL; drive = dL / h;
          if (!arm && lb.L0 < len - 1.5) { lb.L0 = len - 1.5; drive = 0; } // 다리를 접을 때 발을 들어올리지 않는다(몸이 내려오는 만큼만 접힌다)
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
        if (!arm && Fa < 0 && lb.cny < -0.7 && !inp.power) {
          // 발목: 체중을 받치고 있는 발은 엉덩이를 발 위로 되돌리는 작은 힘을 낸다(한 발 서기). 반력은 발의 마찰이 받는다
          const f = Math.max(-M.ankle, Math.min(M.ankle, -M.ankleK * (r.x - e.x) - M.ankleC * (r.vx - e.vx)));
          r.fx += f; e.fx -= f;
        }
        r.fx += Fa * ux; r.fy += Fa * uy; e.fx -= Fa * ux; e.fy -= Fa * uy;
        lb.force = Fa;
      } else {
        const cf = M.freeC[lb.i], Fx = -cf * (e.vx - r.vx), Fy = -cf * (e.vy - r.vy);
        e.fx += Fx; e.fy += Fy; r.fx -= Fx; r.fy -= Fy;
      }
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
        const r = p[lb.root], e = p[lb.end], pin = lb.mode === 'grip';
        const dx = e.x - r.x, dy = e.y - r.y, l = Math.hypot(dx, dy) || 1e-6;
        const mx = lb.max + lb.ext, mn = lb.min - lb.cmp, over = l > mx ? l - mx : l < mn ? l - mn : 0;
        if (over) {
          const wr = 1 / r.m, we = pin ? 0 : 1 / e.m, ws = wr + we, d = over / l;
          r.x += dx * d * wr / ws; r.y += dy * d * wr / ws; e.x -= dx * d * we / ws; e.y -= dy * d * we / ws;
          if (pin) lb.lam += over;
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
    const h = dt / C.SUB;
    for (let k = 0; k < C.SUB; k++) substep(s, inp, h);
    s.t += dt;
    const c = s.p[0];
    for (const lb of s.limb) {
      const e = s.p[lb.end];
      if (lb.mode === 'grip') { // 손이 버티는 방향 검사: 면을 누르는 방향에서 한계각을 넘게 당기면 미끄러진다
        const a = lb.anchor, dx = c.x - a.x, dy = c.y - a.y, l = Math.hypot(dx, dy) || 1e-6, sg = lb.tens >= 0 ? 1 : -1;
        const cos = sg * (dx * -a.nx + dy * -a.ny) / l, lim = GRIP[a.type].th;
        lb.ang = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI; lb.lim = lim;
        if (Math.abs(lb.tens) > 0.25 * W && lb.ang > lim) lb.slipT += dt; else lb.slipT = 0;
        if (lb.slipT > 0.06) { lb.mode = 'free'; lb.anchor = null; s.events.push({ type: 'slip', limb: lb.i, x: e.x, y: e.y, ang: lb.ang, lim, kind: a.type }); }
      } else if (lb.mode === 'plant') {
        // 발은 면을 눌러야만 붙어 있다. 다리가 팽팽하게 당겨지는데 엉덩이가 면 안쪽(발 아래)에 있으면 발에 매달린 것이므로 떨어진다
        const r = s.p[lb.root];
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
  return { C, M, W, MASS, GRIP, STATIONS, makeWorld, create, step, diag, nearestGrip, nearestSurface };
})();
if (typeof module !== 'undefined') module.exports = PH;
