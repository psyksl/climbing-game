// 타이밍 여유 측정: 놓는 시점을 바꿔 가며 성공 비율을 본다(사람이 맞출 수 있는 폭인지 가늠하는 참고치)
'use strict';
const { play } = require('./run.js');
const row = (label, xs, f) => console.log(label.padEnd(34), xs.map(x => (f(x) ? 'O' : '.')).join(' '), ' ', xs.join(' '));
row('스윙: 놓는 각도(°), 진폭 55°', [20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70], rel => play('swing', { amp: 55, rel }).ok);
row('스윙: 놓는 각도(°), 진폭 40°', [20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70], rel => play('swing', { amp: 40, rel }).ok);
row('도약: 손 놓는 지연(초)', [0, 0.02, 0.04, 0.06, 0.08, 0.1, 0.12, 0.16, 0.2], rel => play('jump', { rel }).ok);
row('도약: 웅크리는 시간(초)', [0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0], lean => play('jump', { lean }).ok);
row('저그: 손 뻗기 시작 각도(°)', [10, 15, 20, 25, 30, 35, 40, 45], rel => play('jug', { rel }).ok);
