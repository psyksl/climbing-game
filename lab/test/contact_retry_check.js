// 거부된 접촉의 다시 시도(v0.16.4): 발 입력 한 번 뒤 같은 자리에서 디딤·해제가 끝없이 되풀이되지 않는가. 오차 없는 고정 입력(사람 결과 아님).
// 사용: node test/contact_retry_check.js [src 폴더] [JSON 출력]   (고치기 전의 src 폴더를 주면 그때의 되풀이를 볼 수 있다)
// 상황(v0.16.2 영상과 같은 경로): 시작 자세 3, 왼발만 닿는 자리를 겨누고 발 조종 키 + 오른발 입력 한 번 → 1.1초 뒤 키를 떼고 조준점을 멀리 옮긴다 → 8초까지 본다
'use strict';
const path = require('path'), fs = require('fs'), LAB = (process.argv[2] && process.argv[2] !== '-' ? path.resolve(process.argv[2]) : path.join(__dirname, '..', 'src')) + '/';
global.PH = require(LAB + 'physics.js'); global.CTRL = require(LAB + 'controls.js'); const LESSON = require(LAB + 'lessons.js');
const PH = global.PH, CTRL = global.CTRL; PH.setBody('joint'); Object.assign(CTRL.OPT, LESSON.BASE.opt);
const DT = 1 / 120; let fail = 0; const out = { src: LAB, rows: [] }, check = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`); if (!c) fail++; out.rows.push({ n, pass: !!c, x }); };
const s0 = PH.create(PH.makeWorld(), 3), c0 = CTRL.make('intent'), p0 = LESSON.player({ steps: [] }); while (s0.t < 1.0) PH.step(s0, c0.step(s0, p0.step(s0.t), DT), DT);
const reach = CTRL.footReach || ((s, i, x, y) => { const C = PH.C, hj = PH.rootPos(s, i), lb = s.limb[i], dx = x - hj.x, dy = y - hj.y; const ok = Math.hypot(dx, dy) <= lb.max * 0.97 && PH.hipAngle((s.p[0].x - s.p[1].x) / C.T, (s.p[0].y - s.p[1].y) / C.T, lb, dx, dy).over <= 0; return { ok }; });
let spot = null; for (let x = 40; x < 600 && !spot; x += 4) for (let y = 300; y < 560; y += 4) { const only = (x, y) => { const fa = CTRL.footAim(s0, x, y); return fa && reach(s0, 2, fa.x, fa.y).ok && !reach(s0, 3, fa.x, fa.y).ok; }; if ([[0, 0], [-3, -3], [3, -3], [-3, 3], [3, 3]].every(([u, w]) => only(x + u, y + w))) { spot = { x, y }; break; } }
const run = steps => { const s = PH.create(PH.makeWorld(), 3), ctl = CTRL.make('intent'), pl = LESSON.player({ steps }), r = { plants: 0, hangOff: 0, cycles: [], end: null, gaveUp: null, lastPlant: null, lifts: [] };
  let prev = s.limb[3].mode;
  while (s.t < 8 && !s.dead) { PH.step(s, ctl.step(s, pl.step(s.t), DT), DT);
    for (const e of s.events) if (e.limb === 3) { if (e.type === 'plant') { r.plants++; r.lastPlant = s.t; } if (e.type === 'footoff' && e.hang) { r.hangOff++; r.cycles.push(+s.t.toFixed(2)); } }
    if (ctl.st.gaveUp && !r.gaveUp) r.gaveUp = { ...ctl.st.gaveUp, t: +ctl.st.gaveUp.t.toFixed(2) }; if (prev !== 'reach' && s.limb[3].mode === 'reach' && ctl.st.act[3]) r.lifts.push(+s.t.toFixed(2)); prev = s.limb[3].mode; }
  r.end = s.limb[3].mode + (s.limb[3].mode === 'plant' ? '@' + s.limb[3].poly : ''); r.dead = s.dead; r.stillSending = !!ctl.st.act[3]; return r; };
if (!spot) check('시험 자리 찾기', false, '왼발만 닿는 자리를 못 찾음');
else {
  const r = run([[0.5, 'aim', spot.x, spot.y], [1.0, 'down', 'foot'], [1.0, 'press', 'sendR'], [1.0, 'pressShift', 'sendR'], [2.1, 'up', 'foot'], [2.5, 'aim', 560, 200]]);
  out.case = { spot, ...r };
  console.log(`조준 ${spot.x},${spot.y} · 디딤 ${r.plants}번 · 디디자마자 "발에 매달림"으로 떨어짐 ${r.hangOff}번(${r.cycles.slice(0, 6).join(', ')}${r.cycles.length > 6 ? ' …' : ''}초) · 그만둠 ${r.gaveUp ? `${r.gaveUp.t}초(${r.gaveUp.why})` : '없음'} · 끝 ${r.end}`);
  check('발 입력 한 번 뒤 거부된 디딤을 끝없이 다시 시도하지 않는다(2번까지)', r.hangOff <= 2, `거부 ${r.hangOff}번`);
  check('그만둘 때 까닭을 남긴다("발에 매달리게 된다")', !!r.gaveUp && r.gaveUp.why === 'hang', r.gaveUp ? r.gaveUp.why : '없음');
  check('그만둔 뒤 그 발은 자동 발이 맡아 디디고, 떨어지지 않는다', !r.stillSending && r.end.startsWith('plant') && !r.dead, `끝 ${r.end} · 아직 보내는 중 ${r.stillSending}`);
  // 같은 입력을 다시 하면 다시 시도한다(새 입력은 막지 않는다)
  const r2 = run([[0.5, 'aim', spot.x, spot.y], [1.0, 'down', 'foot'], [1.0, 'press', 'sendR'], [1.0, 'pressShift', 'sendR'], [1.15, 'up', 'foot'], [3.5, 'down', 'foot'], [3.5, 'press', 'sendR'], [3.5, 'pressShift', 'sendR'], [3.65, 'up', 'foot']]);
  const again = r2.lifts.filter(t => t >= 3.5 && t < 3.6);
  check('그만둔 뒤에도 플레이어가 다시 보내면 그 발이 다시 나간다(새 입력은 막지 않는다)', !!r2.gaveUp && again.length > 0 && r2.hangOff <= 4, `그만둠 ${r2.gaveUp ? r2.gaveUp.t + '초' : '없음'} · 다시 나간 시각 ${again.join(', ') || '없음'} · 거부 합계 ${r2.hangOff}번 · 끝 ${r2.end}`);
}
if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
console.log(`실패 ${fail}`); process.exit(fail ? 1 : 0);
