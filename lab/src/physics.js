// 등반 조작 실험실 · 물리 계산부 (브라우저·노드 공용, 화면과 무관)
// 몸: 가슴·엉덩이·양손·양발 6개 질점. 몸통은 막대, 팔다리는 최대·최소 길이가 있는 줄 + 근육.
// 근육은 두 질점 사이에 크기 같고 방향 반대인 힘으로만 작용한다(외부에서 끌어 주는 힘 없음).
'use strict';
const PH = (() => {
  const C = {
    G: 1400, T: 54, A: 72, AMIN: 0, L: 84, LMIN: 26,
    MC: 28, MP: 22, MH: 2, MF: 6,
    SUB: 8, ITER: 4, FLOOR: 640, GRAB_R: 14, PLANT_R: 10, FOOT_R: 5, MU: 1.0,
    LEG_RANGE: 125, REACT: 0, // 다리가 몸통 아래 방향에서 벗어날 수 있는 각도
  };
  const MASS = C.MC + C.MP + 2 * C.MH + 2 * C.MF, W = MASS * C.G;
  // 힘 한계(체중 W의 배수)와 스프링 값
  const M = {
    armPull: 1.3 * W, armPush: 0.9 * W, armK: 1.3 * W / 3, armC: 2000, armRate: 320,
    legPush: 1.8 * W, legPull: 0, legK: 1.8 * W / 3, legC: 2400, legRate: 750,
    handReach: 0.3 * W, handKp: 0.3 * W / 15, handKd: 110,
    footReach: 0.5 * W, footKp: 0.5 * W / 15, footKd: 250,
    upK: 0.1 * W, upC: 1500, upMax: 1.5 * W,
    freeC: [4, 4, 10, 10],
  };
  const GRIP = { // th: 손이 버티는 방향의 한계각(면을 누르는 방향 기준)
    ledge: { th: 75, name: '턱' }, incut: { th: 105, name: '깊은 턱' },
    jug: { th: 180, all: true, name: '저그' }, sloper: { th: 40, name: '둥근 면' }, block: null,
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
  function makeWorld() {
    const dome = []; for (let a = 200; a <= 340; a += 20) dome.push([400 + 36 * Math.cos(a * Math.PI / 180), 248 + 36 * Math.sin(a * Math.PI / 180)]);
    const hex = []; for (let a = 0; a < 360; a += 60) hex.push([415 + 9 * Math.cos(a * Math.PI / 180), 350 + 9 * Math.sin(a * Math.PI / 180)]);
    return [
      rect('A', 'incut', 180, 300, 150, 16), rect('F1', 'ledge', 296, 440, 44, 60),
      poly('J', 'jug', hex), poly('S', 'sloper', dome),
      rect('B', 'ledge', 470, 330, 140, 16), rect('F3', 'ledge', 510, 440, 40, 10),
      rect('G', 'incut', 520, 240, 110, 16, { goal: true }),
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
  function nearestSurface(world, x, y) {
    let best = null;
    for (const pl of world) for (const e of pl.edges) {
      const q = closestOnSeg(e, x, y), d = Math.hypot(x - q[0], y - q[1]);
      if (!best || d < best.d) best = { d, x: q[0], y: q[1], nx: e.nx, ny: e.ny, poly: pl.id };
    }
    return best;
  }

  // ---- 몸
  const pt = (x, y, m) => ({ x, y, px: x, py: y, vx: 0, vy: 0, m, fx: 0, fy: 0 });
  const STATIONS = {
    1: { name: '두 손 매달리기', c: [307, 371], hands: [[296, 300], [318, 300]] },
    2: { name: '한 손 매달리기', c: [322, 372], hands: [null, [322, 300]] },
    3: { name: '발판 위 웅크리기', c: [333, 351.1], p: [330, 405], hands: [[304, 300], [328, 300]], feet: [[318, 435], [334, 435]] },
    4: { name: '건너편 한 손', c: [476, 402], hands: [[476, 330], null] },
  };
  function create(world, station = 1) {
    const st = STATIONS[station] || STATIONS[1];
    const c = st.c, hp = st.p || [c[0], c[1] + C.T];
    const s = { world, station, t: 0, dead: false, won: false, winT: 0, events: [], p: [pt(c[0], c[1], C.MC), pt(hp[0], hp[1], C.MP)], limb: [] };
    for (let i = 0; i < 4; i++) {
      const arm = i < 2, root = arm ? 0 : 1, side = i % 2 ? 1 : -1;
      const at = arm ? st.hands[i] : st.feet && st.feet[i - 2];
      const r = s.p[root];
      const pos = at || (arm ? [r.x + side * 8, r.y + C.A * 0.9] : [r.x + side * 7, r.y + C.L * 0.95]);
      s.p.push(pt(pos[0], pos[1], arm ? C.MH : C.MF));
      const lb = { i, arm, root, end: 2 + i, max: arm ? C.A : C.L, min: arm ? C.AMIN : C.LMIN, mode: 'free', anchor: null, L0: 0, tens: 0, lam: 0, slipT: 0, ang: 0, contact: false, noContactT: 0, poly: null, force: 0, brace: false, ext: 0 };
      if (at && arm) { const g = nearestGrip(world, at[0], at[1]); lb.mode = 'grip'; lb.anchor = g; s.p[2 + i].x = g.x; s.p[2 + i].y = g.y; }
      if (at && !arm) { lb.mode = 'plant'; lb.contact = true; lb.poly = nearestSurface(world, at[0], at[1]).poly; }
      lb.L0 = Math.min(lb.max, Math.hypot(pos[0] - r.x, pos[1] - r.y));
      s.limb.push(lb);
    }
    return s;
  }

  function handleInput(s, inp) {
    for (let i = 0; i < 4; i++) {
      const lb = s.limb[i], e = s.p[lb.end], r = s.p[lb.root], held = lb.arm ? inp.hand[i] : inp.foot[i - 2];
      if (held && lb.mode !== 'reach') {
        if (lb.mode === 'grip') s.events.push({ type: 'release', limb: i, x: e.x, y: e.y });
        lb.mode = 'reach'; lb.anchor = null; lb.tens = 0; lb.slipT = 0;
      } else if (!held && lb.mode === 'reach') {
        if (lb.arm) {
          const g = nearestGrip(s.world, e.x, e.y);
          if (g && g.d <= C.GRAB_R) {
            lb.mode = 'grip'; lb.anchor = g; e.x = g.x; e.y = g.y; e.vx = e.vy = 0;
            lb.brace = false; lb.L0 = lb.max; lb.ext = Math.max(0, Math.hypot(e.x - r.x, e.y - r.y) - lb.max); // 잡는 순간 팔은 느슨하다. 당긴 길이는 힘주기로 정한다
            s.events.push({ type: 'grab', limb: i, x: g.x, y: g.y, poly: g.poly });
          } else { lb.mode = 'free'; s.events.push({ type: 'miss', limb: i, x: e.x, y: e.y, d: g ? g.d - C.GRAB_R : 999 }); }
        } else {
          const q = nearestSurface(s.world, e.x, e.y), ok = q && q.d <= C.PLANT_R;
          if (ok) { e.x = q.x + q.nx * C.FOOT_R; e.y = q.y + q.ny * C.FOOT_R; e.vx = r.vx; e.vy = r.vy; lb.poly = q.poly; }
          if (ok) { lb.mode = 'plant'; lb.noContactT = 0; lb.contact = true; lb.L0 = Math.max(lb.min, Math.min(lb.max, Math.hypot(e.x - r.x, e.y - r.y))); s.events.push({ type: 'plant', limb: i, x: e.x, y: e.y }); }
          else { lb.mode = 'free'; s.events.push({ type: 'footmiss', limb: i, x: e.x, y: e.y, d: q ? q.d - C.PLANT_R : 999 }); }
        }
      }
    }
  }

  function substep(s, inp, h) {
    const p = s.p, c = p[0], hp = p[1];
    for (const q of p) { q.fx = 0; q.fy = q.m * C.G; }
    let planted = false;
    const anchored = s.limb.some(l => l.mode === 'grip' || l.mode === 'plant');
    for (const lb of s.limb) {
      const r = p[lb.root], e = p[lb.end], arm = lb.arm;
      const dx = e.x - r.x, dy = e.y - r.y, len = Math.hypot(dx, dy) || 1e-6, ux = dx / len, uy = dy / len;
      const rv = (e.vx - r.vx) * ux + (e.vy - r.vy) * uy;
      lb.force = 0;
      if (lb.mode === 'reach') {
        let tx = inp.cx - r.x, ty = inp.cy - r.y, tl = Math.hypot(tx, ty);
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
          const gx = inp.cx - r.x, gy = inp.cy + (arm ? 0 : C.T) - r.y;
          const Ld = Math.max(lb.min, Math.min(lb.max, len - (gx * ux + gy * uy))), rate = (arm ? M.armRate : M.legRate) * h;
          const dL = Math.max(-rate, Math.min(rate, Ld - lb.L0));
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
    for (const lb of s.limb) { lb.lam = 0; lb.hit = false; if (lb.ext > 0) lb.ext = Math.max(0, lb.ext - 120 * h); }
    for (let it = 0; it < C.ITER; it++) {
      { // 몸통 막대
        const dx = c.x - hp.x, dy = c.y - hp.y, l = Math.hypot(dx, dy) || 1e-6, d = (l - C.T) / l, wc = 1 / c.m, wp = 1 / hp.m, ws = wc + wp;
        c.x -= dx * d * wc / ws; c.y -= dy * d * wc / ws; hp.x += dx * d * wp / ws; hp.y += dy * d * wp / ws;
      }
      for (const lb of s.limb) {
        const r = p[lb.root], e = p[lb.end], pin = lb.mode === 'grip';
        const dx = e.x - r.x, dy = e.y - r.y, l = Math.hypot(dx, dy) || 1e-6;
        const mx = lb.max + lb.ext, over = l > mx ? l - mx : l < lb.min ? l - lb.min : 0;
        if (over) {
          const wr = 1 / r.m, we = pin ? 0 : 1 / e.m, ws = wr + we, d = over / l;
          r.x += dx * d * wr / ws; r.y += dy * d * wr / ws; e.x -= dx * d * we / ws; e.y -= dy * d * we / ws;
          if (pin) lb.lam += over;
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
