// W1 기본 이동 점검(자동 입력, 사람 결과 아님). 실제 Chromium에서 빌드를 열고 시험용 창구(__p3.run)로 물리 걸음을 직접 진행한다.
// 사용: node test/motion_check.js [JSON 출력]
// 잰다: 디딘 발의 미끄러짐(한 걸음 1/120초당 mm), 다리 뻗음 비율, 무릎이 뒤로 꺾인 횟수, 발이 땅 아래로 들어간 횟수,
//       동작이 바뀔 때 뼈 회전의 한 걸음 최대 변화(도), 엉덩이 높이의 한 걸음 최대 변화, 점프 높이, 단 오르기
'use strict';
const { chromium } = require('playwright'), path = require('path'), fs = require('fs');
const url = 'file://' + path.join(__dirname, '..', 'climb3d.html') + '?test&noshadow';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 960, height: 540 } }), errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(url); await pg.waitForTimeout(1200); await pg.evaluate(() => __p3.pause(true));
  let fail = 0; const out = { version: await pg.evaluate(() => __p3.VERSION), rows: [] };
  const check = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`); if (!c) fail++; out.rows.push({ n, pass: !!c, x }); };
  const ev = (f, a) => pg.evaluate(f, a);
  const seq = async (name, steps) => { // steps: [[걸음 수, 입력], ...]. 입력의 방향은 몸 기준 앞(f)·옆(r)으로 주고 여기서 세계 방향으로 바꾼다
    await ev(o => { __p3.reset(o); __p3.resetStats(); }, LANE);
    out._j = 0; out._jb = ''; let maxRot = 0, maxRotBone = '', maxHip = 0, bad = false, peak = -1, yaw0 = (await ev(() => __p3.body())).yaw;
    for (const [n, i] of steps) { const mx = Math.sin(yaw0) * (i.f || 0) + Math.cos(yaw0) * (i.r || 0) * -1, mz = Math.cos(yaw0) * (i.f || 0) + Math.sin(yaw0) * (i.r || 0);
      for (let k = 0; k < n; k += 12) { const r = await ev(([m, inp]) => { const x = __p3.run(m, inp); return { ...x, y: __p3.body().pos[1] }; }, [Math.min(12, n - k), { mx, mz, run: !!i.run, crouch: !!i.crouch, jump: !!i.jump }]);
        if (r.maxRot > maxRot) { maxRot = r.maxRot; maxRotBone = r.maxRotBone; } if (r.maxJerk > (out._j || 0)) { out._j = r.maxJerk; out._jb = r.maxJerkBone; } maxHip = Math.max(maxHip, r.maxHip); bad = bad || r.bad; peak = Math.max(peak, r.y); } }
    const st = await ev(() => __p3.stats()), bd = await ev(() => __p3.body()), open = await ev(() => __p3.openStances());
    for (const o of open) { st.stanceMaxDev = Math.max(st.stanceMaxDev, o.maxDev); st.stanceMaxPath = Math.max(st.stanceMaxPath, o.path); st.stances.push({ ...o, open: true }); } // 끝날 때 아직 디디고 있는 구간도 넣는다
    return { name, maxRot, maxRotBone, maxJerk: out._j, maxJerkBone: out._jb, maxHip, bad, peak, st, end: bd };
  };
  const mm = v => (v * 1000).toFixed(2);
  const LANE = { pos: [-10, 0, 8], yaw: Math.PI / 2 }; // 막힌 데 없는 길(+x 쪽으로 약 20m)
  // 1. 대기
  { const r = await seq('대기', [[240, {}]]); check('대기 2초: 발이 미끄러지지 않고 다리를 다 펴지 않는다', r.st.maxSlide < 0.0005 && r.st.maxRatio < 0.985, `미끄러짐 최대 ${mm(r.st.maxSlide)}mm/걸음 · 다리 뻗음 ${(r.st.maxRatio * 100).toFixed(1)}%`); out.idle = r; }
  // 2. 걷기·달리기: 디딘 발 미끄러짐
  for (const [nm, inp] of [['걷기', { f: 1 }], ['달리기', { f: 1, run: true }], ['웅크려 걷기', { f: 1, crouch: true }]]) {
    const r = await seq(nm, [[120, inp], [360, inp]]); const sp = Math.hypot(r.end.vel[0], r.end.vel[2]);
    check(`${nm} 4초(속도 ${sp.toFixed(2)}m/s): 디딘 발이 미끄러지지 않는다(한 걸음 0.5mm 아래)`, r.st.maxSlide < 0.0005, `최대 ${mm(r.st.maxSlide)}mm/걸음 · 평균 ${mm(r.st.slideSum / Math.max(1, r.st.slideN))}`);
    check(`${nm}: 무릎이 뒤로 꺾이지 않고, 다리 길이를 2% 넘게 요구하지 않는다(넘는 몫은 다 편 다리로 막힌다)`, r.st.kneeFlip === 0 && r.st.maxRatio < 1.02 && !r.bad, `무릎 뒤로 ${r.st.kneeFlip}번 · 다리 뻗음 최대 ${(r.st.maxRatio * 100).toFixed(1)}%`);
    check(`${nm}: 지지 구간 전체에서 디딘 점(발끝·뒤꿈치)이 처음 닿은 자리에서 1mm 넘게 벗어나지 않는다`, r.st.stanceMaxDev < 0.001, `구간 ${r.st.stances.length}개 · 최대 이탈 ${mm(r.st.stanceMaxDev)}mm · 한 구간 누적 이동 최대 ${mm(r.st.stanceMaxPath)}mm`);
    out[nm] = r; }
  // 3. 동작 바뀜: 걷기→달리기→멈춤, 웅크림→점프→착지. 한 걸음(1/120초) 사이 뼈 회전 변화와 엉덩이 높이 변화
  { const r = await seq('걷기→달리기→멈춤', [[240, { f: 1 }], [240, { f: 1, run: true }], [240, {}]]); check('걷기→달리기→멈춤: 지지 구간 전체 이탈 1mm 아래', r.st.stanceMaxDev < 0.001, `구간 ${r.st.stances.length}개 · 최대 이탈 ${mm(r.st.stanceMaxDev)}mm · 누적 최대 ${mm(r.st.stanceMaxPath)}mm`);
    check('걷기→달리기→멈춤: 자세가 갑자기 바뀌지 않는다(회전량 변화 = 한 걸음 회전량이 바로 앞 걸음보다 달라진 정도. 10° 아래(처음 판의 45~90° 변화를 잡는 기준). 물리의 jerk와는 다른 값. 빠르기 상한 한 걸음 12°. 엉덩이 한 걸음 1cm 아래)', r.maxJerk < 10 && r.maxRot < 12 && r.maxHip < 0.01, `회전량 변화 최대 ${r.maxJerk.toFixed(2)}°(${r.maxJerkBone}) · 빠르기 최대 ${r.maxRot.toFixed(2)}°(${r.maxRotBone}) · 엉덩이 ${mm(r.maxHip)}mm`); out.trans1 = r;
    check('멈춘 뒤 두 발이 디딘 채 서 있다', (await ev(() => __p3.legs())).every(L => L.mode === 'plant'), JSON.stringify(await ev(() => __p3.legs().map(L => L.mode)))); }
  { const r = await seq('웅크림→점프→착지', [[120, { crouch: true }], [72, { jump: true }], [240, {}]]);
    check('웅크림→모으기→밀기→점프→착지: 자세가 갑자기 바뀌지 않는다(회전량 변화 10° 아래, 빠르기 한 걸음 12° 아래. 엉덩이 한 걸음 3cm 아래: 뛰는 속도 3m/s = 한 걸음 2.6cm)', r.maxJerk < 10 && r.maxRot < 12 && r.maxHip < 0.03, `회전량 변화 최대 ${r.maxJerk.toFixed(2)}°(${r.maxJerkBone}) · 빠르기 최대 ${r.maxRot.toFixed(2)}°(${r.maxRotBone}) · 엉덩이 ${mm(r.maxHip)}mm`); out.trans2 = r; }
  // 4. 점프 높이(사람의 제자리 점프 범위: 짧게 ≈0.2m, 다 모으면 ≈0.5m)
  { const tap = await seq('짧은 점프', [[6, { jump: true }], [120, {}]]), full = await seq('모은 점프', [[80, { jump: true }], [160, {}]]);
    check('짧게 누르면 낮게, 0.6초 모으면 높게 뛴다(0.15~0.3m / 0.4~0.55m)', tap.peak > 0.15 && tap.peak < 0.3 && full.peak > 0.4 && full.peak < 0.55, `짧게 ${tap.peak.toFixed(3)}m · 모아서 ${full.peak.toFixed(3)}m`); out.jump = { tap: tap.peak, full: full.peak }; }
  // 5. 단: 낮은 단(0.25m)은 걸어 오르고, 높은 단(0.55m)은 걸어서 막힌다
  { await ev(() => { __p3.reset(); }); const r1 = await ev(() => { __p3.run(1, {}); const b = __p3.body(); return b; });
    const go = async (tx, tz, n, extra = {}) => { for (let k = 0; k < n; k += 12) await ev(([inp, m]) => { const b = __p3.body(); const dx = inp.tx - b.pos[0], dz = inp.tz - b.pos[2], l = Math.hypot(dx, dz) || 1; __p3.run(m, { mx: dx / l, mz: dz / l, run: inp.run, jump: inp.jump }); }, [{ tx, tz, ...extra }, 12]); return ev(() => __p3.body()); };
    let bd = await go(3.5, 2.0, 360); check('낮은 단(0.25m)에 걸어 올라선다', Math.abs(bd.pos[1] - 0.25) < 0.01, `높이 ${bd.pos[1].toFixed(3)}m · 자리 ${bd.pos[0].toFixed(2)},${bd.pos[2].toFixed(2)}`);
    bd = await go(6.0, 2.0, 360); check('높은 단(0.55m)은 걸어서는 막힌다', bd.pos[1] < 0.3 && bd.pos[0] < 5.0, `높이 ${bd.pos[1].toFixed(3)}m · x ${bd.pos[0].toFixed(2)}`);
    await go(6.0, 2.0, 70, { jump: true }); bd = await go(6.0, 2.0, 240); check('높은 단은 모아서 뛰면 올라선다', Math.abs(bd.pos[1] - 0.55) < 0.01, `높이 ${bd.pos[1].toFixed(3)}m`); }
  // 6. 제자리에서 돌기: 발을 고쳐 디디며 돈다(발이 꼬이거나 미끄러지지 않음)
  { const r = await seq('돌기', [[30, { f: -1 }], [240, {}]]); check('뒤로 돌기: 지지 구간 전체 이탈 1mm 아래', r.st.stanceMaxDev < 0.001, `구간 ${r.st.stances.length}개 · 최대 이탈 ${mm(r.st.stanceMaxDev)}mm · 누적 최대 ${mm(r.st.stanceMaxPath)}mm`); check('뒤로 돌기: 디딘 발이 미끄러지지 않고, 자세가 튀지 않고, 끝에 두 발이 디딤', r.st.maxSlide < 0.0005 && r.maxJerk < 10 && (await ev(() => __p3.legs())).every(L => L.mode === 'plant'), `미끄러짐 최대 ${mm(r.st.maxSlide)}mm · 회전량 변화 ${r.maxJerk.toFixed(2)}°(${r.maxJerkBone}) · 무릎 뒤로 ${r.st.kneeFlip}번`); }
  // 6b. 급히 뒤로 돌아 곧바로 걸어감(실제 키 입력 영상에서 본 경우: 돌기 전 방향으로 남은 발이 끌렸다 → 걷기 시작할 때 그 발부터 고쳐 디딘다)
  { const r = await seq('돌아서 걷기', [[150, { f: -1 }]]); check('급히 뒤로 돌아 걷기: 지지 구간 전체 이탈 1mm 아래', r.st.stanceMaxDev < 0.001, `구간 ${r.st.stances.length}개 · 최대 이탈 ${mm(r.st.stanceMaxDev)}mm · 누적 최대 ${mm(r.st.stanceMaxPath)}mm`); check('급히 뒤로 돌아 곧바로 걷기: 디딘 발이 미끄러지지 않고(한 걸음 0.5mm 아래) 자세가 갑자기 바뀌지 않는다', r.st.maxSlide < 0.0005 && r.maxJerk < 10, `미끄러짐 최대 ${mm(r.st.maxSlide)}mm · 회전량 변화 ${r.maxJerk.toFixed(2)}°`); out.turnWalk = r; } // 1.25초(바닥 끝 x = -12에 닿기 전)
  // 7. 입력 표의 겹침
  check('입력 표에 겹친 키가 없다(문맥이 겹치는 것끼리)', (await ev(() => __p3.conflicts())).length === 0);
  check('페이지 오류 없음', !errs.length, errs.join(' | '));
  if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
  console.log(`실패 ${fail}`); await b.close(); process.exit(fail ? 1 : 0);
})();
