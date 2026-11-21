// 실행 성능과 입력 → 반응 시간을 실제 브라우저에서 잰다(p3d-0.8.8, GPT의 사용자 플레이 영상 검토 4번).
// 재는 것: ① 실제 시간 대비 게임 시간, 버린 시간(프레임 간격이 0.1초를 넘어 계산에 넣지 않은 몫), 프레임 간격, 계산·그리기에 든 시간
//          ② 긴 프레임을 일부러 만들었을 때 버린 시간이 잡히는가(계측이 일하는지의 확인)
//          ③ 실제 마우스 입력에서 입력 → 움직임 시작 → 잡음/거부 → 팔이 돌아와 멈춤까지의 실제 시간
// 이 환경의 브라우저는 그래픽 카드 없이 소프트웨어로 그린다. 그리기 시간과 fps는 사용자 PC의 값이 아니다. 계산 시간(걸음당)만 대략 견줄 수 있다.
// 스크립트가 누른 마우스다(사람 손 아님). 통과·실패를 세지 않는 진단이다.
// 사용: node test/perf_probe.mjs [결과.json]   캡처 빌드: BUILD=climb3d_mocap.html
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const HERE = path.dirname(fileURLToPath(import.meta.url)), require = createRequire(import.meta.url), { chromium } = require('playwright');
const build = process.env.BUILD ? path.resolve(process.env.BUILD) : path.join(HERE, '..', 'climb3d.html'), outFile = process.argv[2];
const START = [-0.62, 0, -2.58], F = [-0.3, 2.15, -2.86], AL = [-0.72, 1.92, -2.84], AR = [-0.5, 1.92, -2.84];
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const pg = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage(), errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto('file://' + build + '?noshadow&manual'); await pg.waitForTimeout(1500);
const wait = ms => pg.waitForTimeout(ms), out = { 빌드: path.basename(build), 판: await pg.evaluate(() => __p3.VERSION), 창_제목: await pg.title(), 주의: '소프트웨어 그리기(그래픽 카드 없음). fps·그리기 시간은 사용자 PC의 값이 아니다. 스크립트가 누른 마우스(사람 손 아님)' };
const at = async p => { const s = await pg.evaluate(p => __p3.screenOf(p), p); if (!(s.x > 2 && s.x < 1278 && s.y > 2 && s.y < 718)) throw new Error('겨눌 점이 화면 밖: ' + JSON.stringify(p)); await pg.mouse.move(s.x, s.y); await wait(80); };
await pg.evaluate(pos => { __p3.opt({ handMode: 1, footAssist: false, wallRest: false, diag: true, helpAll: false }); __p3.reset({ pos, yaw: Math.PI }); __p3.setCam({ yaw: 0.25, pitch: 0.12, dist: 3.6, follow: null }); }, START); await wait(600);
// 걸음마다가 아니라 화면 프레임마다 손 상태와 손목 자리를 적는다(사람이 보는 것은 화면 프레임이다)
await pg.evaluate(() => { const L = window.__probe = { down: [], rows: [] }; addEventListener('mousedown', e => L.down.push({ t: performance.now(), button: e.button }), true);
  const tick = () => { const h = __p3.climb().hands, m = n => { const e = __p3.rig.bones[n].matrixWorld.elements; return [e[12], e[13], e[14]]; }; L.rows.push({ t: performance.now(), st: h.map(x => x.st), w: [m('hand.L'), m('hand.R')] }); requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
// 한 번의 누름을 따라간다: 입력 → 상태가 '보내는 중' → 손목이 1cm 움직임 → 잡음 또는 거부 → 손목이 멈춤(0.25초 동안 초속 3cm 아래)
const follow = async (i, p, label, ms) => { await at(p); const n0 = await pg.evaluate(() => __probe.rows.length), d0 = await pg.evaluate(() => __probe.down.length), l0 = await pg.evaluate(() => __p3.climbLog().length);
  await pg.mouse.down({ button: i ? 'right' : 'left' }); await wait(45); await pg.mouse.up({ button: i ? 'right' : 'left' }); await wait(ms);
  return pg.evaluate(([i, n0, d0, l0, label]) => { const L = __probe, t0 = L.down[d0] && L.down[d0].t, rows = L.rows.slice(Math.max(0, n0 - 1)), dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const w0 = rows[0].w[i], iReach = rows.findIndex(r => r.t >= t0 && r.st[i] === 'reach'), iMove = rows.findIndex(r => r.t >= t0 && dist(r.w[i], w0) > 0.01), iEnd = iReach < 0 ? -1 : rows.findIndex((r, k) => k > iReach && r.st[i] !== 'reach');
    let iStill = -1; for (let k = Math.max(1, iEnd); iEnd >= 0 && k < rows.length; k++) { let ok = true, j = k; for (; j < rows.length && rows[j].t - rows[k].t < 250; j++) if (dist(rows[j].w[i], rows[j - 1].w[i]) / Math.max(1e-3, (rows[j].t - rows[j - 1].t) / 1000) > 0.03) { ok = false; break; } if (ok && j < rows.length) { iStill = k; break; } }
    const ms = k => (k < 0 ? null : +(rows[k].t - t0).toFixed(0)), ev = __p3.climbLog().slice(l0).filter(e => e.limb === 'hand' && e.i === i && e.type !== 'try').map(e => e.type + (e.why ? `(${e.why})` : '')).join(' → ');
    const fr = rows.slice(1).map((r, k) => r.t - rows[k].t); return { 장면: label, 사건: ev, 입력에서_ms: { 상태가_보내는_중: ms(iReach), 손목이_1cm_움직임: ms(iMove), 잡음_또는_거부: ms(iEnd), 손목이_멈춤: ms(iStill) }, 그동안의_프레임_간격_ms: { 평균: +(fr.reduce((a, x) => a + x, 0) / fr.length).toFixed(1), 가장_김: +Math.max(...fr).toFixed(1) } }; }, [i, n0, d0, l0, label]); };
await pg.evaluate(() => __p3.perf(true));
out.입력_반응 = [];
out.입력_반응.push(await follow(0, AL, '땅에 서서 왼손을 턱 A로 → 잡음', 1500));
out.입력_반응.push(await follow(1, F, '왼손으로 턱 A를 잡고 서서 오른손을 턱 F로(닿지 않는다) → 거부 → 팔이 돌아옴', 2600));
out.입력_반응.push(await follow(1, AR, '오른손을 턱 A로 → 잡음', 1800));
out.실행_성능 = await pg.evaluate(() => __p3.perf());
out.화면의_진단_줄 = await pg.evaluate(() => [...document.querySelectorAll('#hud .dim')].map(d => d.textContent).find(t => /^실행/.test(t)) || null);
// 긴 프레임을 일부러 만든다: 0.35초 동안 화면 쪽을 붙잡아 둔다 → 버린 시간이 0.25초쯤 늘어야 한다
{ const p0 = await pg.evaluate(() => __p3.perf()); await pg.evaluate(() => { const t = performance.now(); while (performance.now() - t < 350); }); await wait(400); const p1 = await pg.evaluate(() => __p3.perf());
  out.긴_프레임_확인 = { 일부러_멈춘_ms: 350, 버린_초_전: p0.버린_초, 버린_초_후: p1.버린_초, 늘어난_초: +(p1.버린_초 - p0.버린_초).toFixed(3), 가장_긴_프레임_ms: p1.가장_긴_프레임_ms, 계측이_잡았는가: p1.버린_초 - p0.버린_초 > 0.15 }; }
out.errs = errs; await b.close();
console.log(JSON.stringify(out, null, 1)); if (outFile) fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
