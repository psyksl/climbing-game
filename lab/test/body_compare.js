// 2단계 ①: 같은 벽에서 몸 비율만 바꿔 비교한다(기존 팔 72·다리 84 ↔ 새 비율 팔 68·다리 98). 질량·중력·힘·벽은 그대로.
// 재는 것: 시작 자세가 버티는지, 손 닿는 높이, 턱 위로 올라서기, 이륙 속도, 거리별 성공률, 자동 조작기 성공률, 반동 이득.
// 거리표·반동은 오차 없는 고정 입력 또는 "가정한 사람 오차를 넣은 자동 조작기"(사람 결과 아님). 사용: node test/body_compare.js [N=40]
'use strict';
const PH = require('../src/physics.js'), { run, SC } = require('./intent.js'), TK = require('./takeoff_study.js'), RS = require('./rock_study.js');
const N = +process.argv[2] || 40, M = 107, C = PH.C;
const modes = s => s.limb.map(l => l.mode[0] + (l.anchor ? l.anchor.poly : l.mode === 'plant' && l.poly ? l.poly.id || '' : '')).join(' ');
const rate = (mk, dx) => { let ok = 0; for (let k = 0; k < N; k++) { const sc = mk(); if (sc.ok(run(sc.station, sc.policy, sc.T, sc.opt, dx))) ok++; } return Math.round(ok / N * 100); };
const out = {};
for (const body of ['base', 'prop']) {
  PH.setBody(body); const o = out[body] = {};
  // 1) 시작 자세: 입력 없이 3초(자동 발·자동 체중 이동 켬)
  o.stations = [1, 2, 3, 4, 5].map(k => { const r = run(k, () => {}, 3, {}); return `${k}:${r.s.dead ? '떨어짐' : '버팀'}(${modes(r.s)})`; });
  // 2) 손 닿는 높이(그림 기하): 발판에 서서 몸통을 세우고 팔을 위로 뻗었을 때. 몸통 옮기기가 허용하는 다리·팔 95%까지
  o.reach = { geo: (C.L + C.T + C.A) / M, move: (0.95 * C.L + C.T + 0.95 * C.A) / M };
  // 3) 턱 위로 올라서기: 건너편 턱 B에 두 손으로 매달려 W 3초 → 2초 쉼
  { let tAbove = null; const r = run({ c: [490, 417], hands: [[480, 345], [500, 345]] }, a => { const on = a.s.t < 3; a.io.mx = 560; a.io.my = 220; a.hold('moveUp', on);
      if (tAbove === null && a.s.p[0].y < 345) tAbove = a.s.t; }, 5, {});
    o.mantle = { above: 345 - r.s.p[0].y, feetOnB: [2, 3].filter(i => r.s.limb[i].mode === 'plant' && r.s.limb[i].poly && (r.s.limb[i].poly.id || r.s.limb[i].poly) === 'B').length, tAbove, dead: r.s.dead, modes: modes(r.s) }; }
  // 4) 이륙(두 손 다이노, 오차 없는 입력)
  o.takeoff = [0.2, 0.4, 0.7].map(h => { const r = TK.trial(h), f = r.off || {}; return { h, vx: f.vx, vy: f.vy, v: f.v, y: f.y }; });
  // 5) 거리별 성공률(턱 전체, 자동 조작기)
  const L = { assistRange: 'ledge' }, dxs = [0, 30, 60, 90, 120, 150, 180];
  o.dist = [['두 손 다이노(0.8초)', () => SC.dyno({ ax: 75, hold: 0.8, opt: L })], ['세 점, 반동 없이', () => SC.reach3({ rocks: 0, opt: L })], ['세 점, 반동 1번', () => SC.reach3({ rocks: 1, opt: L })]]
    .map(([n, mk]) => [n, dxs.map(dx => rate(mk, dx))]); o.dxs = dxs;
  // 6) 기본 시험(커서 근처 ±28px, 자동 조작기). 모으기 시간은 기존 몸에 맞춘 값 그대로
  const NR = { assistRange: 'near' };
  o.intent = [['다이노 가까운 끝 짧게(0.2초)', () => SC.dyno({ ax: 14, opt: NR })], ['다이노 가운데 길게(0.55초)', () => SC.dyno({ ax: 75, opt: NR })], ['세 점 반동 없이', () => SC.reach3({ rocks: 0, opt: NR })], ['세 점 반동 1번', () => SC.reach3({ rocks: 1, opt: NR })]]
    .map(([n, mk]) => [n, rate(mk, 0)]);
  // 7) 반동: 같은 총시간 반동 없이와 비교(오차 없는 입력, 턱 전체)
  o.rock = [0, 0.1, 0.2, 0.3].map(off => { const r = RS.farthest('rock', 0, off), same = RS.farthest('none', r.rec.spT, 0); return { off, best: r.best, same: same.best, t: r.rec.spT, o: r.rec.off, so: same.rec.off }; });
}
PH.setBody('base');
const B = out.base, P = out.prop, f = (v, d = 2) => v === undefined || v === null ? '-' : v.toFixed(d);
console.log(`몸 비율 비교 (같은 벽) — 왼쪽 ${PH.BODIES.base.name} / 오른쪽 ${PH.BODIES.prop.name}\n`);
console.log('1) 시작 자세, 입력 없이 3초');
for (let k = 0; k < 5; k++) console.log(`   ${B.stations[k].padEnd(30)} | ${P.stations[k]}`);
console.log('2) 손 닿는 높이 (발판에 서서 팔을 위로, 기하 계산)');
console.log(`   끝까지 폈을 때 ${f(B.reach.geo)}m | ${f(P.reach.geo)}m · 몸통 옮기기 한계(95%) ${f(B.reach.move)}m | ${f(P.reach.move)}m`);
console.log('3) 턱 위로 올라서기 (B에 두 손 매달림 → W 3초)');
for (const [k, o] of [['기존', B], ['새 비율', P]]) console.log(`   ${k}: 가슴이 턱 위 ${Math.round(o.mantle.above)}px · 턱 위에 디딘 발 ${o.mantle.feetOnB}개 · 가슴이 턱을 넘은 시각 ${o.mantle.tAbove ? o.mantle.tAbove.toFixed(2) + '초' : '-'} · ${o.mantle.dead ? '떨어짐' : o.mantle.modes}`);
console.log('4) 이륙 속도 (두 손 다이노, 수평·수직 m/s)');
for (let k = 0; k < 3; k++) { const a = B.takeoff[k], b = P.takeoff[k]; console.log(`   ${a.h}초 모음: ${f(a.vx)}, ${f(a.vy)} (합 ${f(a.v)}) | ${f(b.vx)}, ${f(b.vy)} (합 ${f(b.v)})`); }
console.log(`5) 거리별 성공률 (턱 전체, 자동 조작기 ${N}회) · 옮긴 거리 ${B.dxs.join(' ')}px`);
for (let k = 0; k < B.dist.length; k++) { console.log(`   ${B.dist[k][0].padEnd(16)} 기존   ${B.dist[k][1].map(x => String(x).padStart(4) + '%').join('')}`); console.log(`   ${''.padEnd(16)} 새 비율 ${P.dist[k][1].map(x => String(x).padStart(4) + '%').join('')}`); }
console.log(`6) 기본 시험 (커서 근처 ±28px, 자동 조작기 ${N}회, 모으기 시간은 기존 몸 기준)`);
for (let k = 0; k < B.intent.length; k++) console.log(`   ${B.intent[k][0].padEnd(24)} ${String(B.intent[k][1]).padStart(4)}% | ${String(P.intent[k][1]).padStart(4)}%`);
console.log('7) 반동 1번 (돌아서고 +n초에 뗌) vs 같은 총시간 반동 없이: 가장 먼 성공 거리 · 이륙 수평·수직');
for (let k = 0; k < B.rock.length; k++) { const s = (r) => `${r.best}px vs ${r.same}px (${f(r.o && r.o.vx / M)},${f(r.o && -r.o.vy / M)} vs ${f(r.so && r.so.vx / M)},${f(r.so && -r.so.vy / M)})`; console.log(`   +${B.rock[k].off}초: ${s(B.rock[k]).padEnd(40)} | ${s(P.rock[k])}`); }
