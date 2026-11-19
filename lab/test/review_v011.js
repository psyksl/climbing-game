// GPT의 v0.11.0 검토에서 짚은 정확성 문제 R1~R5를 확인한다. 같은 시험을 수정 전 빌드와 수정 후 빌드에 돌려 대조한다.
// 사용: node test/review_v011.js            (지금 빌드)
//       LAB=/경로/v0.11.0/lab node test/review_v011.js   (그 폴더의 빌드와 소스: 수정 전 재현)
// 여기의 입력은 모두 스크립트가 넣는다(사람 손 아님)
'use strict';
const { chromium } = require('playwright'), path = require('path');
const LAB = process.env.LAB || path.join(__dirname, '..'), url = 'file://' + path.join(LAB, 'climb_lab.html');
(async () => {
  let fail = 0; const check = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`); if (!c) fail++; };
  console.log(`대상: ${LAB}`);
  // ── R3 (계산): 2분 제한 뒤의 공백을 리플레이가 건너뛰어 재생하지 않는다
  { const P = require(path.join(LAB, 'src', 'practice.js')), tr = P.track(), s = { t: 0, world: {}, events: [], p: [{ x: 0, y: 0 }] };
    for (let i = 0; i < 130 * 120; i++) { s.t += 1 / 120; s.p[0].x = s.t; tr.push(s); } tr.finish ? tr.finish(s) : tr.push(s, null, true);
    const fr = tr.frames, end = tr.end ? tr.end() : tr.t1(); let gap = 0; for (let i = 1; i < fr.length; i++) gap = Math.max(gap, fr[i].t - fr[i - 1].t);
    check('R3 130초 시도: 리플레이할 수 있는 끝이 연속으로 적힌 데(약 120초)까지다', end < 120.1, `끝 ${end.toFixed(3)}초`);
    check('R3 자취에 빠진 구간이 없다(장 사이 간격이 1/60초)', gap < 1 / 60 + 1e-6, `가장 큰 간격 ${gap.toFixed(3)}초`);
    check('R3 125초를 물으면 재생 범위 안의 마지막 모습만 준다(범위 밖의 시각은 재생 대상이 아니다)', tr.at(125).t <= end + 1e-9 && end < 121, `돌려준 모습 ${tr.at(125).t.toFixed(3)}초 · 재생 끝 ${end.toFixed(3)}초`);
    check('R3 실제로 끝난 순간의 모습은 따로 들고 있다', !!tr.final && Math.abs(tr.final.t - 130) < 0.01 && tr.final.s.p[0].x > 129.9, tr.final ? `${tr.final.t.toFixed(1)}초` : '없음');
    for (const T of [119, 120, 121]) { const t2 = P.track(), q = { t: 0, world: {}, events: [], p: [] }; for (let i = 0; i < T * 120; i++) { q.t += 1 / 120; t2.push(q); } t2.finish ? t2.finish(q) : t2.push(q, null, true); const e2 = t2.end ? t2.end() : t2.t1(); let g2 = 0; for (let i = 1; i < t2.frames.length; i++) g2 = Math.max(g2, t2.frames[i].t - t2.frames[i - 1].t);
      check(`R3 ${T}초 시도: 끝 ${T <= 120 ? '= 실제 끝' : '= 약 120초'}, 빠진 구간 없음`, g2 < 1 / 60 + 1e-6 && (T <= 120 ? Math.abs(e2 - T) < 0.02 : e2 < 120.1), `끝 ${e2.toFixed(3)}초 · 간격 ${g2.toFixed(3)}초 · ${t2.frames.length}장`); } }
  const b = await chromium.launch(), K = 1280 / 960, errs = [];
  const open = async q => { const pg = await b.newPage({ viewport: { width: 1280, height: 720 } }); pg.on('pageerror', e => errs.push(e.message)); await pg.goto(url + (q || '')); await pg.waitForTimeout(600); return pg; };
  const st = pg => pg.evaluate(() => ({ p: window.__lab.practice(), taps: window.__lab.lesson().rec.taps.length, ev: window.__lab.lesson().rec.ev.length, li: window.__lab.lesson().i, ui: !!window.__lab.ui(), ok: window.__lab.lesson().ok, t0: window.__lab.lesson().rec.t0, mode: window.__lab.chart().mode }));
  const keys = pg => pg.evaluate(() => window.__lab.keys());
  // 게임 화면 좌표(960×540 기준) → 지금 화면의 자리(v0.12.0부터 차트 구역이 켜져 있으면 게임 화면이 줄어 있다. 옛 빌드에는 view가 없다)
  const g2s = async (pg, x, y) => { const v = await pg.evaluate(() => window.__lab.view ? window.__lab.view() : { x0: 0, y0: 0, s: 1 }); return [(v.x0 + x * v.s) * K, (v.y0 + y * v.s) * K]; };
  const gmove = async (pg, x, y, o) => { const q = await g2s(pg, x, y); return pg.mouse.move(q[0], q[1], o); }, gclick = async (pg, x, y, o) => { const q = await g2s(pg, x, y); return pg.mouse.click(q[0], q[1], o); };
  const tryL4 = async (pg, hold) => { await gmove(pg, 575, 218, { steps: 6 }); await pg.waitForTimeout(200); await gclick(pg, 575, 218, { button: 'right' }); await pg.waitForTimeout(900); await pg.keyboard.down('Space'); await pg.waitForTimeout(140); await gclick(pg, 575, 218); await pg.waitForTimeout(hold - 140); await pg.keyboard.up('Space'); };
  const lesson4 = async pg => { for (let i = 0; i < 4; i++) { await pg.keyboard.press('KeyO'); await pg.waitForTimeout(140); } };

  // ── R1: 리플레이 키를 다른 동작의 키로 다시 지정해도 그 동작이 함께 실행되지 않고, 겹침으로 알린다
  { const pg = await open(); await lesson4(pg); await tryL4(pg, 470); await pg.waitForTimeout(1900);
    const cf = await pg.evaluate(() => { BIND.set('rpPlay', 0, 'KeyR'); return BIND.conflicts(1); });
    check('R1 재생·멈춤을 R로 지정하면 다시하기와 겹침으로 알린다', !!cf.rpPlay && cf.rpPlay.includes('reset'), JSON.stringify(cf));
    await pg.keyboard.press('KeyY'); await pg.waitForTimeout(400); let a = await st(pg); await pg.keyboard.press('KeyR'); await pg.waitForTimeout(250); let c = await st(pg);
    check('R1 리플레이에서 R을 누르면 멈춤만 된다(새 시도가 시작되지 않는다)', a.p.phase === 'replay' && c.p.phase === 'replay' && a.p.rp.playing && !c.p.rp.playing, `${a.p.phase} → ${c.p.phase}${c.p.rp ? ' · 재생 ' + c.p.rp.playing : ''}`);
    if (c.p.phase !== 'replay') { await pg.close(); } else {
      await pg.evaluate(() => { BIND.resetAll(); BIND.set('rpBack', 0, 'KeyO'); BIND.set('rpSpeed', 0, 'KeyP'); BIND.set('rpFwd', 0, 'KeyT'); BIND.set('rpPlay', 1, 'Escape'); }); await pg.waitForTimeout(100);
      const cf2 = await pg.evaluate(() => BIND.conflicts(1)); check('R1 O·P·T·Esc로 지정하면 다음 과제·시범·차트·설정과 겹침으로 알린다', ['rpBack', 'rpSpeed', 'rpFwd', 'rpPlay'].every(id => cf2[id]), Object.keys(cf2).join(' '));
      const t0 = (await st(pg)).p.rp.t; await pg.keyboard.press('KeyO'); await pg.waitForTimeout(200); c = await st(pg); check('R1 O(뒤로): 다음 과제로 넘어가지 않고 0.05초 뒤로', c.li === 3 && c.p.phase === 'replay' && Math.abs((t0 - c.p.rp.t) - 0.05) < 1e-6, `과제 ${c.li + 1} · ${c.p.phase}`);
      await pg.keyboard.press('KeyP'); await pg.waitForTimeout(200); c = await st(pg); check('R1 P(속도): 시범이 시작되지 않고 속도만 바뀐다', c.p.phase === 'replay' && c.p.rp.speed === 0.5, `${c.p.phase}${c.p.rp ? ' · ' + c.p.rp.speed + '배' : ''}`);
      const m0 = c.mode; await pg.keyboard.press('KeyT'); await pg.waitForTimeout(200); c = await st(pg); check('R1 T(앞으로): 차트가 바뀌지 않는다', c.mode === m0 && c.p.phase === 'replay');
      await pg.keyboard.press('Escape'); await pg.waitForTimeout(200); c = await st(pg); check('R1 Esc(보조 재생·멈춤): 설정 화면이 열리지 않는다', !c.ui && c.p.phase === 'replay', `설정 화면 ${c.ui ? '열림' : '닫힘'}`);
      await pg.evaluate(() => BIND.resetAll()); const cf3 = await pg.evaluate(() => [BIND.conflicts(1), BIND.conflicts(2)]); check('R1 기본값으로 되돌리면 겹침이 없다', Object.keys(cf3[0]).length === 0 && Object.keys(cf3[1]).length === 0);
      const e0 = (await st(pg)).ev; for (const k of ['KeyQ', 'KeyE', 'KeyW', 'KeyA', 'KeyX']) { await pg.keyboard.press(k); await pg.waitForTimeout(60); } c = await st(pg); check('R1 리플레이 중에는 게임 입력(손·몸·취소)이 실행되지 않는다', c.ev === e0 && c.p.phase === 'replay', `입력 기록 ${e0} → ${c.ev}`);
      await pg.keyboard.press('KeyR'); await pg.waitForTimeout(250); check('R1 기본값에서는 R이 다시하기', (await st(pg)).p.phase === 'live'); await pg.close(); } }

  // ── R2: 지난 기록은 그때 실제로 누른 키로 보인다(지금 배정이 바뀌어도)
  { const pg = await open('?chart=full'); await gmove(pg, 250, 170); await pg.waitForTimeout(150);
    await pg.keyboard.down('Space'); await pg.waitForTimeout(300); await pg.keyboard.up('Space'); await pg.waitForTimeout(300);
    await pg.keyboard.down('KeyQ'); await pg.waitForTimeout(60); await pg.keyboard.up('KeyQ'); await pg.waitForTimeout(500); await gclick(pg, 250, 170); await pg.waitForTimeout(400);
    await pg.evaluate(() => { BIND.set('power', 0, 'KeyJ'); }); await pg.waitForTimeout(150);
    let ks = await keys(pg), lane = ks.filter(k => k.where === 'chart' && k.action === 'power'), bar = ks.filter(k => k.where === 'bar' && k.action === 'power');
    check('R2 Space로 모은 기록: 모으기를 J로 바꿔도 차트는 Space를 보인다', lane.length === 1 && lane[0].code === 'Space', lane.map(k => k.code).join(' '));
    check('R2 아래 키 안내는 지금 배정(J)을 보인다', bar.length === 1 && bar[0].code === 'KeyJ', bar.map(k => k.code).join(' '));
    const marks = ks.filter(k => k.where === 'mark'); check('R2 한 동작에 보조(Q)와 주(좌클릭)를 번갈아 쓴 기록: 입력마다 그때 누른 키가 보인다', marks.some(k => k.code === 'KeyQ') && marks.some(k => k.code === 'Mouse0'), marks.map(k => k.code).join(' ') || '기록별 표식 없음');
    await pg.evaluate(() => { BIND.set('sendL', 0, 'KeyZ'); BIND.set('sendL', 1, 'KeyC'); }); await pg.waitForTimeout(150); ks = await keys(pg);
    const ll = ks.filter(k => k.where === 'chart' && (k.action === 'sendL')); check('R2 왼손 보내기를 Z·C로 바꿔도 왼손 줄은 그때 누른 키(좌클릭)', ll.length === 1 && ll[0].code === 'Mouse0' && ll[0].role === 'left', ll.map(k => `${k.code}/${k.role}`).join(' '));
    await pg.keyboard.press('KeyH'); await pg.waitForTimeout(200); ks = await keys(pg); const l2 = ks.filter(k => k.where === 'chart' && k.role === 'left');
    check('R2 손 선택 방식을 2번으로 바꿔도 지난 기록의 왼손 줄이 그대로(좌클릭, 왼손 색)', l2.length === 1 && l2[0].code === 'Mouse0', ks.filter(k => k.where === 'chart').map(k => `${k.action}:${k.code}/${k.role}`).join(' '));
    await pg.evaluate(() => BIND.resetAll()); await pg.close(); }

  // ── R4: 지금 조작(D안)과 맞지 않는 실패 안내가 나오지 않는다
  { const pg = await open(); await lesson4(pg); await pg.keyboard.press('KeyV'); await pg.waitForTimeout(100); await tryL4(pg, 470); await pg.waitForTimeout(3000);
    const e = (await st(pg)).p.ended || {}, txt = [e.title, e.sub, e.reason, e.hint].filter(Boolean).join(' | ');
    check('R4 닿으면 잡기를 끄고 뛰어 떨어졌을 때: "버튼을 떼" 안내가 없다', (await st(pg)).p.phase === 'ended' && e.kind === 'fail' && !/버튼을 떼/.test(txt), txt);
    const fr = await pg.evaluate(() => window.__lab.failReason ? [['intent', false], ['intent', true], ['hold', true], ['pick', true]].map(([m, a]) => window.__lab.failReason({ mode: m, why: null, air: { t: 1, gap: -2 }, assist: a })) : null);
    check('R4 경우별 문구: D안은 본 사실만, C안(떼는 순간 붙는 조작)에서만 버튼 안내', !!fr && !/버튼/.test(fr[0]) && /꺼져/.test(fr[0]) && !/버튼|꺼져/.test(fr[1]) && /버튼을 떼야/.test(fr[2]) && !/버튼/.test(fr[3]), fr ? fr.join(' / ') : '경우별 함수 없음');
    const fr2 = await pg.evaluate(() => window.__lab.failReason ? [window.__lab.failReason({ mode: 'intent', why: { t: 2, text: '오른손 걸리지 않음 — 면 기울기 80°' }, air: { t: 1, gap: -2 }, assist: true }), window.__lab.failReason({ mode: 'intent', why: null, air: { t: 1, gap: 31.2 }, assist: true }), window.__lab.failReason({ mode: 'intent', why: null, air: null, assist: true })] : null);
    check('R4 판정이 남긴 까닭이 있으면 그것을 먼저, 없으면 거리 사실, 아무것도 없으면 단순 사실', !!fr2 && /걸리지 않음/.test(fr2[0]) && /32px 모자람/.test(fr2[1]) && fr2[2] === '붙잡은 곳 없이 떨어졌다', fr2 ? fr2.join(' / ') : '');
    await pg.close(); }

  // ── R5: 성공 시간에 결과 화면을 띄우기 전 대기가 섞이지 않는다
  { const times = [];
    for (const q of ['', '?okwait=0.2']) { const pg = await open(q); await lesson4(pg); await tryL4(pg, 470); await pg.waitForTimeout(2200); const s = await st(pg), e = s.p.ended || {}, shown = parseFloat((String(e.sub).match(/([\d.]+)초/) || [])[1]), real = s.ok - s.t0;
      times.push({ q, shown, real, wait: e.t - s.ok, kind: e.kind }); await pg.close(); }
    const a = times[0]; check('R5 결과에 적힌 시간 = 성공 조건을 채운 시각(첫 입력 기준)', a.kind === 'ok' && Math.abs(a.shown - a.real) < 0.006, `적힌 ${a.shown}초 · 조건을 채운 시각 ${a.real.toFixed(3)}초 · 그 뒤 결과 화면까지 ${a.wait.toFixed(2)}초`);
    const c = times[1]; check('R5 대기 길이를 바꿔도 적힌 성공 시간은 조건을 채운 시각 그대로', c.kind === 'ok' && Math.abs(c.shown - c.real) < 0.006 && Math.abs(c.wait - 0.2) < 0.05, `대기 ${c.wait.toFixed(2)}초일 때 적힌 ${c.shown}초 · 조건 ${c.real.toFixed(3)}초`);
    const pg = await open(); await lesson4(pg); await tryL4(pg, 150); await pg.waitForTimeout(2800); const e = (await st(pg)).p.ended || {}; check('R5 떨어진 시도에는 성공 시간을 적지 않는다', e.kind === 'fail' && !/성공/.test(String(e.sub)) && (e.okTime === null || e.okTime === undefined), String(e.sub)); await pg.close(); }
  console.log('페이지 오류:', errs.join(';') || '없음', '| 실패', fail); await b.close(); process.exit(fail || errs.length ? 1 : 0);
})();
