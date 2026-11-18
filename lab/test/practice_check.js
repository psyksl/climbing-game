// 연습 공용 부품(자취·재생 시계·차트 시야·창 조작)을 계산으로 확인한다. 사용: node test/practice_check.js
'use strict';
const PH = require('../src/physics.js'), CTRL = require('../src/controls.js'), LESSON = require('../src/lessons.js'), P = require('../src/practice.js');
let fail = 0; const check = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`); if (!c) fail++; };
const dt = 1 / 120;
// 시범 하나를 돌리며 자취를 적는다(게임과 같은 순서)
function run(l) { PH.setBody('joint'); Object.assign(CTRL.OPT, LESSON.BASE.opt); const world = PH.makeWorld(); for (const r of l.extra || []) world.push(PH.rect(...r));
  const s = PH.create(world, l.station), ctl = CTRL.make('intent'), pl = LESSON.player(l), tr = P.track(), all = []; let first = null;
  while (s.t < l.T && !s.dead) { const io = pl.step(s.t), out = ctl.step(s, io, dt); if (first === null && (io.down('power') || io.down('moveUp') || ctl.st.sent.length)) first = s.t; PH.step(s, out, dt);
    all.push({ t: s.t, p: s.p.map(q => [q.x, q.y]) }); first === null ? tr.hold(s) : tr.push(s); }
  tr.finish(s); return { s, tr, all, first }; }
const L = LESSON.LIST.find(l => l.id === 'wjump'), R = run(L), fr = R.tr.frames;
check('자취: 첫 입력 전에는 한 장만, 그 뒤로 1/60초마다 한 장', fr.length > 100 && Math.abs((fr[5].t - fr[4].t) - 1 / 60) < 1e-9 && fr[0].t <= R.first + dt + 1e-9, `${fr.length}장 · 첫 장 ${fr[0].t.toFixed(3)}초 · 첫 입력 ${R.first.toFixed(3)}초`);
// 자취의 모습은 그 시각에 실제로 계산된 모습과 완전히 같다
let worst = 0; for (const f of fr) { const a = R.all.find(q => Math.abs(q.t - f.t) < 1e-9); if (!a) { worst = 1e9; break; } f.s.p.forEach((q, i) => { worst = Math.max(worst, Math.hypot(q.x - a.p[i][0], q.y - a.p[i][1])); }); }
check('자취의 모습이 그때 계산된 모습과 같다(리플레이 = 실제로 한 플레이)', worst === 0, `가장 큰 차이 ${worst}px`);
check('자취의 끝은 시도가 끝난 순간(제한 시간 안에서 끝났을 때)', Math.abs(R.tr.end() - R.s.t) < 1e-9 && fr[fr.length - 1].s.p[3].y === R.s.p[3].y && Math.abs(R.tr.final.t - R.tr.end()) < 1e-9 && !R.tr.full);
// 제한 시간을 넘긴 시도: 연속으로 적힌 데까지만 재생 범위이고, 끝난 순간의 모습은 따로 들고 있다(빈 구간을 건너뛰어 재생하지 않는다)
{ const tr = P.track(), q = { t: 0, world: {}, events: [], p: [{ x: 0, y: 0 }] }; for (let i = 0; i < 130 * 120; i++) { q.t += 1 / 120; q.p[0].x = q.t; tr.push(q); } tr.finish(q);
  let gap = 0; for (let i = 1; i < tr.frames.length; i++) gap = Math.max(gap, tr.frames[i].t - tr.frames[i - 1].t);
  check('2분 제한: 130초 시도의 재생 범위는 약 120초까지, 빈 구간 없음', tr.full && tr.end() < 120.1 && tr.end() > 119.9 && gap < 1 / 60 + 1e-6, `끝 ${tr.end().toFixed(3)}초 · ${tr.frames.length}장 · 가장 큰 간격 ${gap.toFixed(4)}초`);
  check('끝난 순간(130초)의 모습은 따로 들고 있다', Math.abs(tr.final.t - 130) < 0.01 && tr.final.s.p[0].x > 129.9 && tr.at(125).t <= tr.end());
  const bytes = JSON.stringify(R.tr.frames[10].s, (k, v) => k === 'world' ? undefined : v).length; console.log(`참고  자취 한 장은 약 ${bytes}바이트(글자로 적었을 때) → 2분 = 7201장 ≈ ${(bytes * 7201 / 1e6).toFixed(0)}MB, 시범 유령이 있으면 그 두 배`);
  const t3 = P.track(3); for (let i = 0; i < 10 * 120; i++) { q.t += 1 / 120; t3.push(q); } check('제한 시간은 연습마다 정할 수 있다(3초로 주면 3초까지만)', t3.full && Math.abs((t3.end() - t3.t0()) - 3) < 0.02, `${(t3.end() - t3.t0()).toFixed(3)}초`); }
check('자취는 계산 중인 몸과 따로다(나중에 몸이 바뀌어도 자취는 그대로)', (() => { const y = fr[10].s.p[0].y; R.s.p[0].y += 50; fr[10].s.limb[0].mode = fr[10].s.limb[0].mode; return fr[10].s.p[0].y === y && fr[10].s.world === R.s.world; })());
check('어느 시각이든 그 시각까지의 마지막 모습을 준다', R.tr.at(-5) === fr[0] && R.tr.at(1e9) === fr[fr.length - 1] && R.tr.at(fr[40].t + 0.004) === fr[40] && R.tr.at(fr[40].t) === fr[40]);
// 재생 시계
const ck = P.clock(1, 3); ck.toggle(); for (let i = 0; i < 60; i++) ck.update(1 / 60);
check('재생: 1초 지나면 1초 앞으로', ck.playing && Math.abs(ck.t - 2) < 1e-9, ck.t.toFixed(3));
for (let i = 0; i < 120; i++) ck.update(1 / 60); check('끝에 닿으면 멈춘다', !ck.playing && ck.t === 3);
ck.toggle(); check('끝에서 재생을 누르면 처음부터', ck.playing && ck.t === 1);
ck.nudge(0.5); check('조금 넘기면 멈춘 채 그만큼 간다', !ck.playing && Math.abs(ck.t - 1.5) < 1e-9); ck.nudge(-9); check('범위를 벗어나지 않는다', ck.t === 1); ck.seek(2.2); check('시각을 바로 옮긴다', ck.t === 2.2);
ck.cycleSpeed(); ck.toggle(); for (let i = 0; i < 60; i++) ck.update(1 / 60); check('속도 0.5배: 1초에 0.5초', ck.speed === 0.5 && Math.abs(ck.t - 2.7) < 1e-9, ck.t.toFixed(3));
// 차트 시야
const v = P.view(3); v.follow(1, 1); check('시야: 처음에는 0초부터', v.start === 0);
v.follow(5, 5); check('지금 시각이 오른쪽 끝에 가까워지면 따라간다', Math.abs(v.start - (5 - 3 * 0.88)) < 1e-9, v.start.toFixed(2));
v.pan(-1, 5); const s1 = v.start; v.follow(6, 6); check('손으로 옮기면 더는 따라가지 않는다', v.manual && v.start === s1);
v.reset(); v.start = 2; v.zoom(0.5, 3, 10); check('확대: 기준 시각이 화면의 같은 자리에 머문다', Math.abs(v.span - 1.5) < 1e-9 && Math.abs((3 - v.start) / v.span - 1 / 3) < 1e-9, `시작 ${v.start.toFixed(2)} 폭 ${v.span}`);
v.zoom(1e-9, 3, 10); check('확대 한계 0.5초', v.span === 0.5); v.fit(7.2); check('전체 보기: 0초부터 끝까지', v.start === 0 && Math.abs(v.span - 7.5) < 1e-9);
v.pan(999, 7.2); check('끝 너머로는 옮기지 못한다', v.start <= 7.2);
// 창 조작
const r = { x: 100, y: 100, w: 300, h: 120 }, box = { x: 0, y: 0, w: 960, h: 540 }, min = { w: 200, h: 80 };
check('잡는 곳: 모서리·변·안쪽·밖', P.cursorOf(P.zone(r, 101, 101)) === 'nwse-resize' && P.cursorOf(P.zone(r, 399, 160)) === 'ew-resize' && P.cursorOf(P.zone(r, 250, 219)) === 'ns-resize' && P.cursorOf(P.zone(r, 250, 160)) === 'move' && P.zone(r, 50, 50) === null && P.cursorOf(P.zone(r, 399, 101)) === 'nesw-resize');
const mv = P.drag(r, P.zone(r, 250, 160), 2000, -2000, min, box); check('옮기기: 화면 밖으로 나가지 않는다', mv.x === 660 && mv.y === 0 && mv.w === 300 && mv.h === 120, JSON.stringify(mv));
const rs = P.drag(r, P.zone(r, 399, 219), 100, 50, min, box); check('오른쪽 아래 모서리: 왼쪽 위는 그대로, 크기만 커진다', rs.x === 100 && rs.y === 100 && rs.w === 400 && rs.h === 170, JSON.stringify(rs));
const rl = P.drag(r, P.zone(r, 101, 160), 500, 0, min, box); check('왼쪽 변: 최소 너비에서 멈추고 오른쪽 끝은 그대로', rl.w === 200 && rl.x + rl.w === 400, JSON.stringify(rl));
const rt = P.drag(r, P.zone(r, 250, 101), 0, -500, min, box); check('위쪽 변: 화면 위에서 멈춘다', rt.y === 0 && rt.y + rt.h === 220, JSON.stringify(rt));
check('저장된 자리가 화면 밖이면 안으로 들인다', JSON.stringify(P.fitRect({ x: 900, y: 500, w: 50, h: 9999 }, min, box)) === JSON.stringify({ x: 760, y: 0, w: 200, h: 540 }));
PH.setBody('base'); process.exit(fail ? 1 : 0);
