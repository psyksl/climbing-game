// 발 디디기 점검(v0.15.0): 직접 보낸 발(발 조종 키 + 손 입력)이 겨눈 "올라설 수 있는 면"에 디디는가. 오차 없는 고정 입력(사람 결과 아님).
// 사용: node test/foot_aim_check.js [src 폴더]  (고치기 전의 src 폴더를 주면 그때의 결과를 볼 수 있다)
// 상황: 턱(B)을 두 손으로 잡고 매달린 채, 바위 옆의 작은 돌출부(R2, 너비 22px)에 오른발을 디딘다. 돌출부 바로 옆에는 가파른 바위 옆면이 있다
'use strict';
const path = require('path'), LAB = (process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..', 'src')) + '/';
global.PH = require(LAB + 'physics.js'); global.CTRL = require(LAB + 'controls.js'); const LESSON = require(LAB + 'lessons.js');
const PH = global.PH, CTRL = global.CTRL; PH.setBody('joint'); Object.assign(CTRL.OPT, LESSON.BASE.opt);
let fail = 0; const check = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`); if (!c) fail++; };
const foot = (t, id) => [[t, 'down', 'foot'], [t, 'press', id], [t, 'pressShift', id], [t + 0.15, 'up', 'foot']];
function trial(st, steps, T, pre) {
  const s = PH.create(PH.makeWorld(), st), ctl = CTRL.make('intent'), all = (pre || []).concat(steps).sort((a, b) => a[0] - b[0]), pl = LESSON.player({ steps: all }), r = { onNub: 0, planted: [], far: null, blocked: new Set(), hand: null, hipMin: 1e9 };
  while (s.t < T && !s.dead) { PH.step(s, ctl.step(s, pl.step(s.t), 1 / 120), 1 / 120); for (const e of s.events) if (e.type === 'plant' && e.limb === 3) r.planted.push(s.limb[3].poly);
    if (s.limb[3].mode === 'plant' && s.limb[3].poly === 'R2') r.onNub += 1 / 120; if (ctl.st.footFar && ctl.st.footFar.i === 3) r.far = ctl.st.footFar.why; if (ctl.st.move && ctl.st.move.blocked) { r.blocked.add(ctl.st.move.blocked); if (ctl.st.move.hand !== null && ctl.st.move.hand !== undefined) r.hand = ctl.st.move.hand; } r.hipMin = Math.min(r.hipMin, s.p[1].y); }
  r.end = s.limb[3].mode + (s.limb[3].mode === 'plant' ? '@' + s.limb[3].poly : ''); r.dead = s.dead; r.s = s; return r;
}
const hang = { name: 't', c: [565, 417], hands: [[540, 345], [600, 345]] };
// 1. 겨누는 자리: 돌출부와 바위 옆면 사이를 겨눠도 올라설 수 있는 윗면을 고른다
if (CTRL.footAim) { const s = PH.create(PH.makeWorld(), hang), a = CTRL.footAim(s, 645, 437), b = CTRL.footAim(s, 633, 444), c = CTRL.footAim(s, 700, 420), d = CTRL.footAim(s, 400, 420);
  check('조준점이 바위 옆면에 더 가까워도(645, 437) 바로 옆의 돌출부 윗면을 고른다', !!a && a.poly === 'R2' && a.flat && Math.abs(a.sy - 447) < 0.01 && a.sx >= 622 && a.sx <= 644, a ? `${a.poly} (${a.sx.toFixed(0)}, ${a.sy.toFixed(0)})` : '없음');
  check('돌출부 한가운데를 겨누면 그 자리', !!b && b.poly === 'R2' && Math.abs(b.sx - 633) < 0.5);
  check('둘레에 평평한 면이 없으면 가장 가까운 면(바위의 비스듬한 윗면·옆면)', !!c && c.poly === 'R', c ? `${c.poly} 기울기 ny=${c.ny.toFixed(2)}` : '없음');
  check('둘레 30px 안에 면이 없으면 없음(발은 조준점으로 간다)', d === null);
} else check('발 겨누기 보조(CTRL.footAim)가 있다', false, '이 빌드에는 없다(고치기 전)');
// 2. 팔로 몸을 올린 뒤(몸 위로 0.8초) 오른발을 보낸다: 세 가지 조준점 모두 돌출부에 디디고 그대로 서 있다
for (const [ax, ay, tag] of [[633, 444, '윗면 가운데'], [645, 437, '돌출부와 바위 옆면 사이'], [640, 448, '오른쪽 끝']]) {
  const r = trial(hang, [[0.3, 'aim', ax, ay], [0.5, 'down', 'moveUp'], ...foot(1.3, 'sendR'), [2.0, 'up', 'moveUp']], 4.5);
  check(`몸을 올린 뒤 오른발 · ${tag}: 돌출부에 디디고 2.5초 넘게 서 있다`, r.onNub > 2.5 && r.planted[0] === 'R2' && !r.dead, `디딘 곳 ${r.planted.join('→') || '없음'} · 돌출부에 ${r.onNub.toFixed(1)}초 · 끝 ${r.end}`); }
// 3. 매달린 낮은 자세에서는 돌출부가 엉덩이 높이라 발이 닿지 않는다 → 까닭을 알린다(아무 말 없이 발이 떠 있지 않게)
{ const r = trial(hang, [[0.3, 'aim', 633, 444], ...foot(0.9, 'sendR')], 3.5);
  check('매달린 채 바로 보내면 디디지 못하고, 까닭("그 높이까지 다리를 들 수 없다")을 알린다', r.onNub === 0 && r.far === 'hip', `끝 ${r.end} · 알린 까닭 ${r.far}`); }
// 4. 사용자 화면의 자세(왼손 = 턱 오른쪽 끝, 오른손 = 바위 윗면): 몸 위로가 오른손의 각도 한계로 막힌다 → 어느 손 때문인지 알린다
{ const st = { name: 'u', c: [612, 417], hands: [[612, 345], null] }, pre = [[0.2, 'aim', 690, 380], [0.5, 'press', 'sendR']];
  const r = trial(st, [[2.6, 'aim', 645, 437], [2.7, 'down', 'moveUp'], ...foot(3.7, 'sendR'), [5.5, 'up', 'moveUp']], 7, pre);
  check('그 자세에서 몸 위로는 "손 각도"로 막히고, 막는 손이 오른손이라고 알린다(몸이 올라가지 않아 돌출부에 발이 닿지 않는다)', r.blocked.has('손 각도') && r.hand === 1 && r.onNub === 0 && r.far === 'hip', `막힌 까닭 ${[...r.blocked].join(', ')} · 손 ${r.hand} · 발 ${r.far}`); }
// 5. 발 조종 키를 떼면 발은 마우스를 따라오지 않는다: 그때 겨누던 자리로 계속 간다(조준점을 딴 데로 옮겨도 그대로). 누르고 있는 동안에는 따라온다
if (CTRL.footAim) { const mk = keep => { const s = PH.create(PH.makeWorld(), hang), ctl = CTRL.make('intent');
    const steps = [[0.3, 'aim', 633, 444], [0.5, 'down', 'moveUp'], [1.3, 'down', 'foot'], [1.3, 'press', 'sendR'], [1.3, 'pressShift', 'sendR']].concat(keep ? [] : [[1.4, 'up', 'foot']], [[1.45, 'aim', 520, 300], [2.0, 'up', 'moveUp']]).sort((a, b) => a[0] - b[0]), pl = LESSON.player({ steps }); let tgt = null, t145 = null;
    while (s.t < 3.5 && !s.dead) { PH.step(s, ctl.step(s, pl.step(s.t), 1 / 120), 1 / 120); const ft = ctl.st.footTgt && ctl.st.footTgt[3]; if (ft && s.t > 1.5 && s.t < 1.6) tgt = [ft.x, ft.y]; }
    return { tgt, end: s.limb[3].mode + (s.limb[3].mode === 'plant' ? '@' + s.limb[3].poly : '') }; };
  const off = mk(false), on = mk(true);
  check('발 조종 키를 뗀 뒤 조준점을 옮겨도 발의 목표는 뗄 때 겨누던 돌출부 그대로이고, 거기에 디딘다', !!off.tgt && Math.abs(off.tgt[0] - 633) < 1 && Math.abs(off.tgt[1] - 442) < 1 && off.end === 'plant@R2', `목표 ${off.tgt && off.tgt.map(v => v.toFixed(0)).join(',')} · 끝 ${off.end}`);
  check('발 조종 키를 누르고 있는 동안에는 조준점을 따라간다(목표가 옮겨 간다)', !!on.tgt && Math.hypot(on.tgt[0] - 633, on.tgt[1] - 442) > 50, `목표 ${on.tgt && on.tgt.map(v => v.toFixed(0)).join(',')}`); }
process.exit(fail ? 1 : 0);
