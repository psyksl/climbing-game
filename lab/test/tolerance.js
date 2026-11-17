// 입력 여유 측정: 사람이 맞출 수 있는 폭인지 가늠하는 참고치(자동 조작기 기준)
'use strict';
const PH = require('../src/physics.js'), { play } = require('./run.js');
const row = (label, xs, f) => console.log(label.padEnd(40), xs.map(x => (f(x) ? 'O' : '.')).join(' '));
const rels = [-0.4, -0.3, -0.2, -0.15, -0.1, -0.05, 0, 0.03, 0.06, 0.09, 0.12, 0.15, 0.18, 0.21, 0.25, 0.3, 0.4];
console.log('도약: 손 놓기가 밀기보다 늦은 시간(초). 음수 = 손을 먼저 놓음');
console.log(' '.repeat(40), rels.map(r => String(r)).join(' '));
for (const [name, couple] of [['기존(연결 없음)', 0], ['새 조작(연결 0.15초)', 0.15], ['비교(연결 0.25초)', 0.25]]) {
  PH.C.COUPLE = couple;
  row(`  ${name}`, rels, rel => play('jump', { rel }, 7).ok);
  row(`  ${name} · 놓자마자 턱 조준`, rels, rel => play('jump', { rel, aimT: true }, 7).ok);
}
PH.C.COUPLE = 0.15;
console.log('도약: 놓자마자 커서를 다음 턱으로 옮길 때, 힘 방향 유지(초)의 효과');
for (const hold of [0, 0.2, 0.35]) { PH.C.AIMHOLD = hold; row(`  방향 유지 ${hold}초`, rels, rel => play('jump', { rel, aimT: true }, 7).ok); }
PH.C.AIMHOLD = 0;
const fxs = [266, 272, 278, 284, 290, 296, 302, 308];
console.log('도약: 오른발 위치 x (발판 258~314)'); console.log(' '.repeat(40), fxs.join(' ')); row('  새 조작', fxs, fx => play('jump', { fx }, 7).ok);
const angs = [20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70];
console.log('스윙: 놓는 각도(°)'); console.log(' '.repeat(40), angs.join(' '));
row('  진폭 55°', angs, rel => play('swing', { amp: 55, rel }).ok); row('  진폭 40°', angs, rel => play('swing', { amp: 40, rel }).ok);
