// 자동 시험: 물리 계산부만으로 각 방법을 끝까지 돌려 본다. 화면·재미와는 무관한 "성립 여부" 검사다.
'use strict';
const PH = require('../src/physics.js'), BOTS = require('../src/bots.js');
if (!process.env.V05) { PH.C.MUSCLE = 0; PH.C.SMOOTH = 0; PH.C.SMOOTH_FOOT = 0; PH.C.LAT_LEG = 0; PH.C.LAT_ARM = 0; PH.C.PALM = 0; } // 회귀 시험: v0.4 물리 그대로
const dt = 1 / 120;
function play(name, over, T = 14) {
  const s = PH.create(PH.makeWorld(), BOTS.defs[name].station), b = BOTS.make(name, over), log = [];
  let stableT = 0;
  while (s.t < T && !s.dead) {
    PH.step(s, b.step(s), dt);
    for (const e of s.events) log.push(`${s.t.toFixed(2)} ${e.type}${e.limb ?? ''}${e.poly ? '@' + e.poly : ''}`);
    if (b.m.done) { stableT += dt; if (stableT > 2.5) break; }
  }
  const sp = Math.max(...s.p.map(q => Math.hypot(q.vx, q.vy)));
  const onB = [0, 1].filter(i => s.limb[i].mode === 'grip' && s.limb[i].anchor.poly === 'B').length;
  return { ok: BOTS.defs[name].win ? s.won : !s.dead && !!b.m.done && onB === 2 && s.limb[3].mode === 'plant' && sp < 80, s, b, log, sp, onB };
}
module.exports = { play };
if (require.main === module) {
  let fail = 0;
  const check = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name} ${extra}`); if (!cond) fail++; };
  // 1) 가만히 두면 가만히 있다
  for (const st of [1, 2, 3, 4]) { const s = PH.create(PH.makeWorld(), st); for (let i = 0; i < 360; i++) PH.step(s, BOTS.idle(), dt); check(`정지 유지: ${PH.STATIONS[st].name}`, !s.dead && Math.max(...s.p.map(q => Math.hypot(q.vx, q.vy))) < 5); }
  // 2) 한 손 매달려 다리만으로 흔들기: 진폭이 커진다
  { const s = PH.create(PH.makeWorld(), 1), b = BOTS.make('swing', { amp: 999 }); let a1 = 0, a2 = 0;
    while (s.t < 7) { PH.step(s, b.step(s), dt); const c = s.p[0], a = s.limb[1].anchor; if (!a) break; const phi = Math.abs(Math.atan2(c.x - a.x, c.y - a.y)) * 57.3; if (s.t < 2.2) a1 = Math.max(a1, phi); else a2 = Math.max(a2, phi); }
    check('한 손 매달려 흔들기(다리 반동)', a2 > a1 + 20 && a2 > 45, `처음 ${a1.toFixed(0)}° → 최대 ${a2.toFixed(0)}°`); }
  // 3) 공중에서는 입력이 있어도 운동량·각운동량이 보존된다(끌어 주는 힘 없음)
  { const s = PH.create(PH.makeWorld(), 2); for (let i = 0; i < 20; i++) PH.step(s, BOTS.idle(), dt);
    const inp = BOTS.idle(); inp.hand = [true, true]; inp.foot = [true, true]; let d0 = null, worst = 0, worstP = 0;
    for (let i = 0; i < 40; i++) { inp.cx = s.p[1].x + (i < 20 ? 80 : -80); inp.cy = s.p[1].y + 30; PH.step(s, inp, dt); const g = PH.diag(s); if (i === 2) d0 = g; if (d0) { worst = Math.max(worst, Math.abs(g.L - d0.L)); worstP = Math.max(worstP, Math.abs(g.px - d0.px)); } }
    check('공중에서 수평 운동량 보존', worstP < 50, `오차 ${worstP.toFixed(1)}`);
    console.log(`INFO  공중 각운동량 변화 ${worst.toFixed(0)} (손을 뻗는 힘은 작게 남는 오차로 허용)`); }
  // 3-1) 반동 연습 자세: 다리를 접었다 펴서 키우기, 힘을 빼서 줄이기
  { const amp = (pol, T) => { const s = PH.create(PH.makeWorld(), 5); let cur = 0, lastA = 0;
      while (s.t < T) { const c = s.p[0], hp = s.p[1], a = s.limb[1].anchor, phi = Math.atan2(c.x - a.x, c.y - a.y) * 57.3, inp = BOTS.idle(), ux = (hp.x - c.x) / 54, uy = (hp.y - c.y) / 54;
        if (s.t > T - 2) lastA = Math.max(lastA, Math.abs(phi));
        if (s.t < 0.45) { inp.foot = [true, true]; inp.cx = hp.x + 70; inp.cy = hp.y + 45; } else pol(s, inp, phi, hp, ux, uy);
        PH.step(s, inp, dt); }
      return lastA; };
    const fold = (inp, tuck, hp, ux, uy) => { inp.foot = [true, true]; inp.cx = hp.x + ux * (tuck ? 20 : 120); inp.cy = hp.y + uy * (tuck ? 20 : 120); };
    const side = (inp, phi, hp) => { inp.foot = [true, true]; inp.cx = hp.x + (phi < 0 ? 70 : -70); inp.cy = hp.y + 45; };
    const none = amp(() => {}, 6), up = amp((s, inp, phi, hp, ux, uy) => fold(inp, Math.abs(phi) < 12, hp, ux, uy), 6);
    check('다리 접었다 펴기로 반동 키우기(아래를 지날 때 접기)', up > none + 15, `가만히 ${none.toFixed(0)}° / 접었다 펴기 ${up.toFixed(0)}°`);
    const big = amp((s, inp, phi, hp) => side(inp, phi, hp), 6);
    const relax = amp((s, inp, phi, hp) => { if (s.t < 6) side(inp, phi, hp); }, 10), keep = amp((s, inp, phi, hp, ux, uy) => { if (s.t < 6) side(inp, phi, hp); else fold(inp, false, hp, ux, uy); }, 10);
    check('다리를 좌우로 보내 반동 키우기', big > 55, `${big.toFixed(0)}°`);
    check('다리 힘을 빼면 반동이 줄어든다', relax < big * 0.5 && relax < keep, `${big.toFixed(0)}° → 힘 빼기 ${relax.toFixed(0)}° / 다리 뻗고 버티기 ${keep.toFixed(0)}°`); }
  // 3-2) 일반 바위 지형: 표시된 홀드가 아니라 면의 방향으로 잡힘이 정해진다
  { const s = PH.create(PH.makeWorld(), { c: [680, 452], hands: [[680, 380], null] }), ev = [];
    const run = (T, f) => { const t1 = s.t + T; while (s.t < t1 && !s.dead) { const inp = BOTS.idle(); f && f(inp); PH.step(s, inp, dt); for (const e of s.events) ev.push(e.type + e.limb + (e.poly || '')); } };
    run(1.5); check('바위 윗면(비스듬함)에 매달리기', s.limb[0].mode === 'grip' && s.limb[0].anchor.poly === 'R' && !s.dead);
    run(0.4, inp => { inp.hand[1] = true; inp.cx = 645; inp.cy = 410; }); run(0.1);
    check('바위의 가파른 옆면은 잡히지 않는다', ev.includes('nohold1'), ev.join(','));
    run(0.4, inp => { inp.hand[1] = true; inp.cx = 633; inp.cy = 447; }); run(0.3);
    check('바위 옆 작은 돌출부는 잡힌다', s.limb[1].mode === 'grip' && s.limb[1].anchor.poly === 'R2');
  }
  { const s = PH.create(PH.makeWorld(), { c: [633, 519], hands: [null, [633, 447]], tuck: true }); for (let i = 0; i < 300; i++) { const inp = BOTS.idle(); inp.foot = [true, true]; inp.cx = s.p[1].x; inp.cy = s.p[1].y + 30; PH.step(s, inp, dt); }
    check('돌출부 한 손으로 매달려 버티기(다리 접고)', s.limb[1].mode === 'grip' && s.limb[1].anchor.poly === 'R2' && !s.dead); }
  // 3-3) 도약 입력 여유: 밀기와 손 놓기의 순서·간격
  { const win = c => { PH.C.COUPLE = c; const ok = []; for (let rel = -0.3; rel <= 0.41; rel += 0.03) if (play('jump', { rel, aimT: true }, 7).ok) ok.push(rel); PH.C.COUPLE = 0; return ok; };
    // 0초(동시)에서 시작해 끊기지 않고 이어지는 범위만 센다
    const span = a => { const has = r => a.some(x => Math.abs(x - r) < 0.001); let lo = 0, hi = 0; while (has(hi + 0.03)) hi += 0.03; while (has(lo - 0.03)) lo -= 0.03; return has(0) ? [lo, hi] : [0, -1]; };
    const o = span(win(0)), n = span(win(0.15));
    check('도약: 새 조작이 기존보다 늦게 놓아도 성립', n[1] > o[1] && n[0] <= o[0], `연속 성공 범위 — 기존 ${o[0].toFixed(2)}~+${o[1].toFixed(2)}초 / 새 조작 ${n[0].toFixed(2)}~+${n[1].toFixed(2)}초 (놓자마자 다음 턱 조준, 0.03초 간격)`); }
  // 3-4) 발 접촉: 발은 면을 눌러 받칠 때만 붙어 있다
  { const pose = (hip, foot, hands, brace) => { const s = PH.create(PH.makeWorld(), { c: [hip[0], hip[1] - 54], p: hip, hands: hands || [null, null], feet: [null, foot], tuck: true }); s.limb[3].brace = brace; s.limb[3].L0 = Math.hypot(foot[0] - hip[0], foot[1] - hip[1]); let off = null; for (let i = 0; i < 600 && !s.dead; i++) { PH.step(s, BOTS.idle(), dt); if (off === null && s.limb[3].mode !== 'plant') off = s.t; } return { s, off }; };
    const hangs = [[[540, 400], [560, 340]], [[500, 370], [560, 340]], [[560, 410], [560, 340]]].map(([h, f]) => pose(h, f, null, false));
    check('양손을 놓고 발이 엉덩이보다 위: 발에 매달리지 못하고 떨어진다', hangs.every(r => r.s.dead && r.off < 0.5), `발이 떨어지기까지 ${hangs.map(r => r.off.toFixed(2)).join(' / ')}초 (수정 전: 5초 내내 매달림)`);
    const st1 = pose([560, 270], [560, 340], null, false), st2 = pose([560, 270], [560, 340], null, true);
    check('발판 위 한 발로 체중 받치기(손 없이 5초)', !st1.s.dead && st1.s.limb[3].mode === 'plant' && !st2.s.dead && Math.abs(st1.s.p[1].y - 270) < 12, `엉덩이 높이 변화 ${(st1.s.p[1].y - 270).toFixed(1)}px`);
    const hf = pose([476, 471], [492, 515], [[476, 345], null], false);
    check('한 손과 한 발로 버티기(5초)', !hf.s.dead && hf.s.limb[0].mode === 'grip' && hf.s.limb[3].mode === 'plant'); }
  // 4) 세 가지 방법 + 실패 예
  for (const name of Object.keys(BOTS.defs)) {
    const r = play(name), def = BOTS.defs[name];
    check(def.title, def.expectFail ? r.s.dead : r.ok, def.expectFail ? '(실패해야 정상)' : `t=${r.s.t.toFixed(1)}s`);
    if (process.argv.includes('-v') || (!def.expectFail && !r.ok)) console.log('   ', r.log.join(', '));
  }
  process.exit(fail ? 1 : 0);
}
