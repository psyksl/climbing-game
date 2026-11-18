// 입력 UI의 표(이름표·입력 도감·키 설정)가 서로 빠짐없이 맞는지 확인한다(그림 없이 계산만). 사용: node test/input_ui_check.js
'use strict';
const BIND = require('../src/bind.js'), ACT = require('../src/action-names.js'), CAT = require('../src/input-catalog.js'), fs = require('fs'), path = require('path');
let fail = 0; const check = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`); if (!c) fail++; };
const ids = BIND.ACTIONS.map(a => a.id);
check('모든 동작에 짧은 이름이 있다(이름표)', ids.every(id => ACT.name[id]), ids.filter(id => !ACT.name[id]).join(' ') || `${ids.length}개`);
check('이름표에 없는 동작 이름이 남아 있지 않다', Object.keys(ACT.name).every(id => BIND.BY[id]), Object.keys(ACT.name).filter(id => !BIND.BY[id]).join(' '));
const names = ids.map(id => ACT.name[id]); check('동작 이름이 겹치지 않고 짧다(8자 이하)', new Set(names).size === names.length && names.every(n => n.length <= 8), names.filter(n => n.length > 8).join(' '));
check('역할 색이 모두 도감에 있다', [...Object.values(ACT.role), ...ACT.LIMB.map(l => l.role), ...Object.values(ACT.HOLD).map(h => h.role)].every(r => CAT.roles[r]));
const defs = BIND.ACTIONS.flatMap(a => a.def.filter(Boolean)); check('기본 입력이 모두 도감에 있다(대체 키캡 없이)', defs.every(c => CAT.keys[c]), defs.filter(c => !CAT.keys[c]).join(' ') || `${defs.length}칸`);
check('타임차트의 누르고 있기 줄은 모두 키 설정에 있는 동작이다', Object.keys(ACT.HOLD).every(id => BIND.BY[id]));
check('미지정·미등록 입력도 표시할 수 있다', CAT.resolve(null).code === 'Unassigned' && CAT.resolve('VendorKeyXYZ123').fallback === true && CAT.resolve('VendorKeyXYZ123').shape === 'short');
check('숫자열 1과 숫자패드 1, 왼·오른 Shift를 구분한다', CAT.resolve('Numpad1').corner === 'NUM' && !CAT.resolve('Digit1').corner && CAT.resolve('ShiftLeft').corner === 'L' && CAT.resolve('ShiftRight').corner === 'R');
check('한/영·한자 키 글자가 있다', CAT.resolve('Lang1').label === '한/영' && CAT.resolve('Lang2').label === '한자');
const shapes = ['square', 'short', 'tab', 'caps', 'backspace', 'enter', 'shift', 'space', 'numenter', 'numzero', 'iso', 'mouse', 'mouseSide'];
check('키캡 틀 그림 13종이 저장소에 있다', shapes.every(s => fs.existsSync(path.join(__dirname, '..', 'assets', 'input', 'templates', s + '.png'))) && new Set(Object.values(CAT.keys).map(k => k.shape)).size <= shapes.length);
process.exit(fail ? 1 : 0);
