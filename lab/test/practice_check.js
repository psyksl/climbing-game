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
// 화면 나누기: 차트 구역과 플레이 구역
const W = 960, H = 540;
{ const z = P.dockZones('bottom', 160, W, H); check('아래에 붙이면 위는 플레이, 아래는 차트, 둘이 화면을 빈틈없이 나눈다', z.chart.y === 380 && z.chart.h === 160 && z.play.h === 380 && z.play.y === 0 && z.line.y === 380 && !z.vertical);
  const l = P.dockZones('left', 300, W, H), r = P.dockZones('right', 300, W, H), t = P.dockZones('top', 160, W, H);
  check('왼쪽·오른쪽·위에 붙이기', l.chart.w === 300 && l.play.x === 300 && l.play.w === 660 && l.vertical && r.chart.x === 660 && r.play.x === 0 && r.line.x === 660 && t.play.y === 160 && t.chart.y === 0);
  for (const d of ['bottom', 'top', 'left', 'right']) { const q = P.dockZones(d, 200, W, H); if (q.chart.w * q.chart.h + q.play.w * q.play.h !== W * H) check(`${d}: 두 구역의 넓이 합이 화면과 같다`, false); } }
check('끌어다 놓을 곳: 마우스가 가장 가까운 변', P.dockTarget(40, 270, W, H) === 'left' && P.dockTarget(930, 200, W, H) === 'right' && P.dockTarget(480, 20, W, H) === 'top' && P.dockTarget(480, 500, W, H) === 'bottom' && P.dockTarget(480, 300, W, H) === 'bottom');
check('경계선을 끌면 구역 크기가 마우스를 따라가고 최소·최대에서 멈춘다', P.splitSize('bottom', 0, 340, W, H, 142, 320) === 200 && P.splitSize('bottom', 0, 530, W, H, 142, 320) === 142 && P.splitSize('bottom', 0, 10, W, H, 142, 320) === 320 && P.splitSize('left', 350, 0, W, H, 220, 520) === 350 && P.splitSize('right', 700, 0, W, H, 220, 520) === 260 && P.splitSize('top', 0, 180, W, H, 142, 320) === 180);
{ const v = P.fitView({ x: 0, y: 0, w: 960, h: 380 }, W, H), v2 = P.fitView({ x: 300, y: 0, w: 660, h: 540 }, W, H), v3 = P.fitView({ x: 0, y: 0, w: W, h: H }, W, H);
  check('플레이 화면은 비율을 지켜 구역 안에 들어간다(가운데 맞춤)', Math.abs(v.s - 380 / 540) < 1e-9 && Math.abs(v.x0 - (960 - 960 * v.s) / 2) < 1e-9 && v.y0 === 0 && Math.abs(v2.s - 660 / 960) < 1e-9 && v2.x0 === 300 && Math.abs(v2.y0 - (540 - 540 * v2.s) / 2) < 1e-9 && v3.s === 1 && v3.x0 === 0, `아래 160: ${(v.s * 100).toFixed(0)}% · 옆 300: ${(v2.s * 100).toFixed(0)}%`); }
{ const vw = P.view(4); vw.follow(1, 1, 60); const a = [vw.start, vw.span]; vw.follow(5.4, 5.4, 60); const b2 = [vw.start, vw.span]; vw.follow(20, 20, 60); const c2 = [vw.start, vw.span]; vw.follow(100, 100, 60); const d2 = [vw.start, vw.span];
  check('기록이 길어지면 시간축이 줄어 전체가 보이고(0초부터), 가장 긴 폭을 넘으면 지금 시각을 따라간다', a[0] === 0 && a[1] === 4 && b2[0] === 0 && b2[1] > 5.4 && c2[0] === 0 && c2[1] > 20 && d2[1] === 60 && d2[0] > 40, `${a[1]} → ${b2[1].toFixed(2)} → ${c2[1].toFixed(1)} → ${d2[1]}초(시작 ${d2[0].toFixed(1)}초)`);
  const vm = P.view(4); vm.zoom(0.5, 1, 10); const sp = vm.span; vm.follow(9, 10, 60); check('손으로 확대한 시간축은 저절로 바뀌지 않는다', vm.manual && vm.span === sp); }
check('줄이 늘수록 줄 높이가 줄고, 가장 작게는 11, 가장 크게는 50', P.laneHeight(126, 3) === 42 && P.laneHeight(126, 4) === 31.5 && P.laneHeight(126, 10) === 12.6 && P.laneHeight(60, 10) === 11 && P.laneHeight(500, 2) === 50);
PH.setBody('base'); process.exit(fail ? 1 : 0);
