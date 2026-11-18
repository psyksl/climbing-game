// D안(의도 조작) 검증: 사람 수준 조작기로 반복해 성공률을 잰다.
// 사람 수준 = 화면을 보고 반응하는 데 0.238±0.053초(단순 시각 반응 시간 연구), 조준 오차, 누르고 있는 시간의 흔들림.
// 조준 오차와 시간 흔들림의 크기는 가정한 값이다.
'use strict';
const PH = require('../src/physics.js'), CTRL = require('../src/controls.js');
const dt = 1 / 120;
let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const gauss = () => { let u = 0; for (let i = 0; i < 12; i++) u += rnd(); return u - 6; };
const react = () => Math.max(0.15, 0.238 + 0.053 * gauss());
// 한 번 실행: policy(api)가 매 프레임 키·마우스 상태를 정한다
function run(station, policy, T = 5, opt = {}, variant) {
  Object.assign(CTRL.OPT, { autoFeet: true, autoShift: true, assist: true, handMode: 1, assistRange: 'near' }, opt);
  const s = PH.create(PH.makeWorld(variant), station), ctl = CTRL.make('intent'), held = new Set();
  let pressedNow = new Set(), footNow = false;
  // 입력은 동작 이름으로 준다(키 설정과 무관). 1번 방식: sendL/sendR, 2번 방식: sendBest/sendOther
  const io = { mx: 0, my: 0, down: id => held.has(id) || (id === 'foot' && footNow), pressed: id => pressedNow.has(id), pressedShift: () => false };
  const m = {}, log = [];
  const api = { s, m, io, held, ctl,
    press(id) { pressedNow.add(id); }, hold(id, on) { on ? held.add(id) : held.delete(id); },
    click(side, foot) { if (foot) footNow = true; pressedNow.add(CTRL.OPT.handMode === 1 ? (side ? 'sendR' : 'sendL') : (side ? 'sendOther' : 'sendBest')); },
    space(on) { on ? held.add('power') : held.delete('power'); } };
  while (s.t < T && !s.dead) {
    pressedNow = new Set(); footNow = false;
    policy(api);
    PH.step(s, ctl.step(s, io, dt), dt);
    for (const e of s.events) log.push(`${s.t.toFixed(2)} ${e.type}${e.limb ?? ''}${e.poly ? '@' + e.poly : ''}`);
  }
  return { s, m, log, ctl };
}
const onB = s => [0, 1].filter(i => s.limb[i].mode === 'grip' && s.limb[i].anchor.poly === 'B').length;
const BT = s => { const pl = s.world.find(p => p.id === 'B'); return [pl.pts[0][0], pl.pts[0][1]]; };
// 시나리오
const SC = {
  // ① 오른손으로 매달린 채 왼발 옮기기 — 자동 발: 아무것도 안 하고 기다린다
  footAuto: () => ({ station: 2, T: 2, policy: a => { a.io.mx = 330; a.io.my = 330; }, ok: r => !r.s.dead && r.s.limb[2].mode === 'plant' && r.s.limb[1].mode === 'grip' }),
  // ① 직접: 자동 발을 끄고 Shift+좌클릭으로 왼발을 발판 위에 보낸다(조준 오차 ±8px)
  footManual: () => { const ex = 8 * gauss(), ey = 4 * gauss(), t0 = 0.3 + 0.3 * rnd(); return { station: 2, T: 2.5, opt: { autoFeet: false },
    policy: a => { a.io.mx = 296 + ex; a.io.my = 466 + ey; if (!a.m.c && a.s.t > t0) { a.click(0, true); a.m.c = 1; } }, ok: r => !r.s.dead && r.s.limb[2].mode === 'plant' && r.s.limb[1].mode === 'grip' }; },
  // ③ 발로 밀어 건너편 잡기: Space 누름 → (반응 시간 뒤) 두 손 클릭으로 '던질 때 놓음' 표시 → Space 뗌. 커서는 건너편 턱 왼쪽(오차 ±12px)
  // 사람이 거리에 맞춰 누르는 시간을 고른다고 본다: 겨눈 곳(턱 왼쪽 끝에서 ax px)에 맞는 시간 ± 0.07초(가정), 조준 오차 ±12px
  dyno: (o = {}) => { const ax = o.ax ?? 14, ex = 12 * gauss(), ey = 6 * gauss(), t0 = 0.3 + 0.3 * rnd(), rc = react();
    const plan = Math.max(0.04, 0.09 + 0.03 * gauss()); // Space를 누르고 곧바로 손을 클릭하는 것은 반응이 아니라 계획된 연속 동작으로 본다(가정)
    gauss.cached = gauss();
    // 거리에 맞는 모으기 시간(v0.6.2 성공 지도의 가운데)
    const ideal = o.hold ?? (ax < 30 ? 0.2 : ax < 55 ? 0.34 : 0.55), hold = Math.max(plan + 0.04, ideal + 0.07 * gauss.cached);
    return { station: 3, T: 3.5, variant: o.variant, opt: o.opt, policy: a => { const [bx, by] = BT(a.s); a.io.mx = bx + ax + ex; a.io.my = by + 3 + ey; const t = a.s.t - t0;
      a.space(t >= 0 && t < hold); if (!a.m.k && t >= plan) { a.click(0); a.click(1); a.m.k = 1; } },
      ok: r => !r.s.dead && onB(r.s) >= 1 }; },
  // 사용자 동작: 왼손·두 발로 버티고 오른손을 먼저 보내 둔 뒤, (반동 n번) 모았다 던지며 오른손으로 건너편을 잡는다.
  // 반동이 있을 때 사람은 고정된 박자가 아니라 몸의 흔들림에 맞춰 누르고 뗀다고 본다: 엉덩이가 목표 쪽 끝에 이르면 누르고(모으기 = 뒤로 싣기),
  // 반대쪽 끝에서 돌아서는 순간 뗀다(던지기). 그 순간을 맞히는 오차는 ±0.05초(가정, 반응이 아니라 박자 예측)
  reach3: (o = {}) => { const ax = o.ax ?? 70, ex = 12 * gauss(), ey = 6 * gauss(), t0 = 0.4 + 0.2 * rnd(), rc = react(), rocks = o.rocks || 0, hold = Math.max(rc + 0.08, (o.hold ?? 0.75) + 0.12 * gauss()); // +70px을 겨눌 때 맞는 모으기 시간(v0.6.2 성공 지도: 0.6초 이상)
    return { station: 3, T: 5, opt: o.opt, policy: a => { const [bx, by] = BT(a.s); a.io.mx = bx + ax + ex; a.io.my = by + 3 + ey; const t = a.s.t - t0, m = a.m, s = a.s, vx = s.p[1].vx;
      if (!m.r) { m.r = 1; a.click(1); m.n = 0; m.st = 'wait'; }
      if (t < 0) return;
      if (rocks === 0) { a.space(t < hold); if (!m.k && t >= rc) { a.click(0); m.k = 1; } return; }
      // 반동: 짧게 한 번 눌렀다 떼서 몸을 목표 쪽으로 흔든 뒤, 끝에서 누르고 반대쪽 끝에서 뗀다
      if (m.st === 'wait') { m.st = 'tap'; m.ts = t; }
      if (m.st === 'tap') { a.space(t - m.ts < 0.15); if (t - m.ts >= 0.15 && vx < 0) { m.st = 'fwdEnd'; } }
      if (m.st === 'tap' && t - m.ts >= 0.15 && vx >= 0) m.st = 'toFwd';
      if (m.st === 'toFwd') { a.space(false); if (vx < 5) { m.st = 'charge'; m.ts = t; m.dl = 0.05 * gauss(); m.n++; } }
      if (m.st === 'fwdEnd') { m.st = 'charge'; m.ts = t; m.dl = 0.05 * gauss(); m.n++; }
      if (m.st === 'charge') { a.space(true); if (!m.k && m.n === rocks && t - m.ts >= rc) { a.click(0); m.k = 1; }
        if (t - m.ts > 0.12 && vx > -5 && m.tr === undefined) m.tr = t + m.dl;           // 뒤쪽 끝에서 돌아서는 순간(+오차)
        if (m.tr !== undefined && t >= m.tr && (m.n < rocks || m.k)) { a.space(false); m.tr = undefined; m.st = m.n < rocks ? 'toFwd' : 'done'; } }
    }, ok: r => !r.s.dead && r.s.limb[1].mode === 'grip' && r.s.limb[1].anchor.poly === 'B' }; },
};
function rate(mk, N = 100) { let ok = 0; const fails = {}; for (let k = 0; k < N; k++) { const sc = mk(); const r = run(sc.station, sc.policy, sc.T, sc.opt, sc.variant); if (sc.ok(r)) ok++; else { const why = r.s.dead ? 'mat' : 'stuck'; fails[why] = (fails[why] || 0) + 1; } } return { pct: Math.round(ok / N * 100), fails }; }
module.exports = { run, SC, rate, gauss, rnd, react };
if (require.main === module) {
  const show = (n, r) => console.log(`${n.padEnd(56)} ${String(r.pct).padStart(3)}%  ${JSON.stringify(r.fails)}`);
  const N = 100;
  show('① 오른손 매달린 채 왼발 옮기기 · 자동 발', rate(SC.footAuto, 20));
  show('① 오른손 매달린 채 왼발 옮기기 · 직접(Shift+클릭)', rate(SC.footManual, N));
  for (const range of ['near', 'ledge']) {
    const nm = range === 'near' ? '커서 근처(±' + CTRL.P.CATCH_SPAN + 'px)' : '턱 전체';
    console.log(`-- 잡기 보조 범위: ${nm}`);
    show('③ 두 손 다이노 · 턱 가까운 끝을 겨누고 짧게(0.2초)', rate(() => SC.dyno({ ax: 14, opt: { assistRange: range } }), N));
    show('③ 두 손 다이노 · 턱 가운데를 겨누고 길게(0.55초)', rate(() => SC.dyno({ ax: 75, opt: { assistRange: range } }), N));
    show('③ 두 손 다이노 · 가까운 끝을 겨누고 길게(0.6초, 세기 잘못 고름)', rate(() => SC.dyno({ ax: 14, hold: 0.6, opt: { assistRange: range } }), N));
    show('세 점 → 오른손 멀리 잡기 · 반동 없이', rate(() => SC.reach3({ rocks: 0, opt: { assistRange: range } }), N));
    show('세 점 → 오른손 멀리 잡기 · 반동 1번', rate(() => SC.reach3({ rocks: 1, opt: { assistRange: range } }), N));
  }
  show('③ 두 손 다이노 · 닿으면 잡기 끔(초록 고리를 보고 클릭)', rate(() => { const sc = SC.dyno({ ax: 75 }), pol = sc.policy; sc.opt = { assist: false };
    sc.policy = a => { pol(a); const s = a.s; for (const i of [0, 1]) { const inR = s.limb[i].mode === 'reach' && CTRL.inRange(s, i); if (inR && a.m['seen' + i] === undefined) { a.m['seen' + i] = s.t; a.m['rc' + i] = react(); }
      if (a.m['seen' + i] !== undefined && !a.m['cl' + i] && s.t >= a.m['seen' + i] + a.m['rc' + i]) { a.click(i); a.m['cl' + i] = 1; } } }; return sc; }, N));
}
