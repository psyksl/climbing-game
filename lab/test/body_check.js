// 신체 수치 점검(바꾸지 않고 재기만 한다): 길이 단위, 도달 범위, 접촉 안정성. 사람 값은 대략적인 기준이며 출처는 docs/동작_연구.md 3장.
'use strict';
const PH = require('../src/physics.js'), C = PH.C, PXM = 107, dt = 1 / 120;
const idle = () => ({ cx: 0, cy: 0, hand: [false, false], foot: [false, false], power: false });
const m = px => (px / PXM).toFixed(2) + 'm';
console.log('1) 길이 (107px = 1m로 환산. 이 환산 자체가 팔+몸통 기준으로 고른 값)');
const rows = [
  ['팔(어깨~손)', C.A, '약 0.70~0.75m (키 1.75m 기준)'],
  ['몸통(어깨~고관절)', C.T, '약 0.50~0.55m'],
  ['다리(고관절~발)', C.L, '약 0.90~0.95m'],
  ['어깨 폭', 0, '약 0.40m (지금은 두 팔이 가슴 한 점에 붙음)'],
  ['골반 폭', 0, '약 0.30m (두 다리가 엉덩이 한 점에 붙음)'],
  ['키(발~머리끝, 그림 기준)', C.L + C.T + 30, '1.75m를 가정한 사람'],
];
for (const [n, px, h] of rows) console.log(`  ${n.padEnd(22)} ${String(px).padStart(4)}px = ${m(px).padStart(6)}   사람: ${h}`);
console.log(`  다리÷팔 ${(C.L / C.A).toFixed(2)} (사람 약 1.3)   양팔 벌린 길이 ${m(2 * C.A)} (사람 ≈ 키)   중력 ${(C.G / PXM / 9.81).toFixed(2)}g (사람 1g)`);
console.log('2) 도달 범위');
console.log(`  발판에 서서 손이 닿는 가장 높은 곳: 발에서 ${m(C.L + C.T + C.A)} 위 (사람: 키의 약 1.25배 ≈ 2.2m)`);
console.log(`  잡기 판정 반경 ${C.GRAB_R}px = ${m(C.GRAB_R)} · 디딤 판정 반경 ${C.PLANT_R}px = ${m(C.PLANT_R)} · 발 크기 반지름 ${C.FOOT_R}px = ${m(C.FOOT_R)} (실제 신발 길이 약 0.27m)`);
console.log(`  질량: 가슴 ${(C.MC / PH.MASS * 100).toFixed(0)}% 엉덩이 ${(C.MP / PH.MASS * 100).toFixed(0)}% 손 하나 ${(C.MH / PH.MASS * 100).toFixed(1)}% 발 하나 ${(C.MF / PH.MASS * 100).toFixed(1)}% (사람: 팔 하나 약 5%, 다리 하나 약 16%, 몸통+머리 약 58%)`);
console.log('3) 접촉 안정성 (입력 없이 3초)');
function hold(name, st, T = 3) {
  const s = PH.create(PH.makeWorld(), st); const ev = []; let jx = [], jy = [];
  for (let i = 0; i < T / dt && !s.dead; i++) { PH.step(s, idle(), dt); for (const e of s.events) ev.push(e.type + (e.limb ?? '')); if (i > 60) for (const k of [4, 5]) if (s.limb[k - 2].mode === 'plant') { jx.push(s.p[k].x); jy.push(s.p[k].y); } }
  const sd = a => { if (a.length < 2) return 0; const mu = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - mu) ** 2, 0) / a.length); };
  console.log(`  ${name.padEnd(34)} ${s.dead ? '떨어짐' : '버팀'} · 손발 ${s.limb.map(l => l.mode[0]).join('')} · 디딘 발 떨림 ±${Math.max(sd(jx), sd(jy)).toFixed(2)}px${ev.length ? ' · ' + ev.join(',') : ''}`);
}
hold('턱 끝 모서리를 한 손으로', { c: [180, 372], hands: [[180, 300], null] });
hold('턱 끝 모서리를 두 손으로', { c: [190, 371], hands: [[180, 300], [200, 300]] });
hold('발판 모서리에 한 발 + 두 손', { c: [300, 371], p: [300, 425], hands: [[290, 300], [312, 300]], feet: [null, [258, 463]] });
hold('발판 모서리 바깥쪽(옆면)에 한 발 + 두 손', { c: [252, 371], p: [252, 425], hands: [[240, 300], [262, 300]], feet: [null, [253, 480]] });
hold('바위 윗면(엉덩이보다 높은 곳)에 한 발 + 건너편 턱 한 손 — 자세가 성립하는지', { c: [596, 363], p: [596, 417], hands: [[566, 345], null], feet: [null, [662, 376]] });
hold('바위 비스듬한 면 한 손(손만)', { c: [680, 452], hands: [[680, 380], null] });
