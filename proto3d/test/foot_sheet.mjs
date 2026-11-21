// 발 올리기 → 디딤 → 몸 올리기 → 손 뻗기를 장면별로 찍어 한 장에 늘어놓는다(p3d-0.9.0, GPT의 0.8.8 검토). 개발 쪽이 먼저 눈으로 보는 데 쓴다.
// 뒤(사용자 화면과 같은 쪽)와 옆 두 시점. 같은 계산 걸음마다 멈춰 찍으므로 수정 전후의 빌드를 같은 순간끼리 견줄 수 있다. 스크립트 입력(사람 손 아님).
// 사용: node test/foot_sheet.mjs <폴더> [이름]   다른 빌드: BUILD=<html>   캡처 동작: MODE=clip   장면 고르기: ONLY=1,3   발 보조 켬: ASSIST=1
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const HERE = path.dirname(fileURLToPath(import.meta.url)), require = createRequire(import.meta.url), { chromium } = require('playwright');
const build = process.env.BUILD ? path.resolve(process.env.BUILD) : path.join(HERE, '..', 'climb3d.html'), dir = process.argv[2], tag = process.argv[3] || 'foot', clip = process.env.MODE === 'clip';
const hand = (i, p) => ({ type: 'hand', i, p }), foot = (i, p) => ({ type: 'foot', i, p }), rel = (limb, i) => ({ type: 'release', limb, i });
// 자리: 턱 A(왼쪽 위), 턱 F(오른쪽 위), 넓은 발판(높이 30cm, 왼쪽), 낮은 발판(이름과 달리 높이 50cm = 무릎 높이, 오른쪽)
const A1 = [-0.72, 1.92, -2.84], A2 = [-1.15, 1.92, -2.84], F = [-0.3, 2.15, -2.86];
// 장면 = [이름, 출발 자리, 준비(찍지 않음), 찍는 구간, 찍는 간격(걸음), 장 수]. 구간의 한 줄 = [걸음 수, 입력, 첫 걸음의 명령]
export const SCENES = [
  ['1 낮은 발판(30cm) · 같은 쪽 발(왼발)', [-1.05, 0, -2.58], [[60], [150, {}, [hand(0, A2)]]], [[120, {}, [foot(0, [-1.35, 0.30, -2.72])]]], 8, 12],
  ['2 무릎 높이 발판(50cm) · 같은 쪽 발(오른발)', [-0.62, 0, -2.58], [[60], [150, {}, [hand(0, A1)]]], [[120, {}, [foot(1, [-0.40, 0.5, -2.93])]]], 8, 12],
  ['3 무릎 높이 발판 · 교차(왼발을 오른쪽으로) — 사용자가 짚은 장면', [-0.62, 0, -2.58], [[60], [150, {}, [hand(0, A1)]]], [[120, {}, [foot(0, [-0.45, 0.5, -2.93])]]], 8, 12],
  ['4 옆 발판(오른발을 47cm 옆으로)', [-0.62, 0, -2.58], [[60], [150, {}, [hand(0, A1)]]], [[120, {}, [foot(1, [-0.15, 0.5, -2.93])]]], 8, 12],
  ['5 디딘 뒤 몸 올리기(W 1초) → 오른손을 턱 F로', [-0.62, 0, -2.58], [[60], [150, {}, [hand(0, A1)]], [200, {}, [foot(1, [-0.40, 0.5, -2.93])]]], [[120, { cy: 1 }], [60], [120, {}, [hand(1, F)]]], 20, 14],
  ['6 가는 중에 취소(0.2초 뒤 그 발을 놓음)', [-0.62, 0, -2.58], [[60], [150, {}, [hand(0, A1)]]], [[24, {}, [foot(1, [-0.40, 0.5, -2.93])]], [96, {}, [rel('foot', 1)]]], 8, 12],
  ['7 닿지 않는 발판(왼쪽에 서서 오른발을 멀리) → 거부 → 돌아옴', [-0.95, 0, -2.58], [[60], [150, {}, [hand(0, A2)]]], [[150, {}, [foot(1, [-0.50, 0.5, -2.93])]]], 10, 12],
];
if (!dir) { console.log('사용: node test/foot_sheet.mjs <폴더> [이름]'); process.exit(1); }
fs.mkdirSync(dir, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const pg = await b.newPage({ viewport: { width: 460, height: 500 } }), errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto('file://' + build + '?test&noshadow'); await pg.waitForTimeout(1800);
const ver = await pg.evaluate(m => { __p3.pause(true); if (m) __p3.setMode(m); for (const id of ['help', 'hud']) document.getElementById(id).style.display = 'none'; return __p3.VERSION; }, clip ? 'clip' : '');
const sheet = await b.newPage({ viewport: { width: 1500, height: 700 } }), log = [];
for (const [k, [title, start, pre, act, every, N]] of SCENES.entries()) {
  if (process.env.ONLY && !process.env.ONLY.split(',').includes(String(k + 1))) continue;
  const rows = [];
  for (const [vname, off] of [['뒤에서', Math.PI], ['옆에서', -Math.PI / 2]]) {
    // 구간을 걸음 단위의 목록으로 편다(같은 걸음에 찍도록)
    const steps = []; for (const [n, inp = {}, cmd = []] of act) for (let i = 0; i < n; i++) steps.push([inp, i ? [] : cmd]);
    await pg.evaluate(([start, pre, assist]) => { __p3.opt({ handMode: 1, footAssist: assist, wallRest: false, diag: false }); __p3.reset({ pos: start, yaw: Math.PI }); for (const [n, inp = {}, cmd = []] of pre) { for (const c of cmd) __p3.cmd(c); __p3.run(n, { mx: 0, mz: 0, cxSign: 1, ...inp }); } }, [start, pre, !!process.env.ASSIST]);
    const k0 = await pg.evaluate(() => __p3.climbLog().length), cells = [];
    for (let f = 0; f < N; f++) {
      if (f) await pg.evaluate(([part]) => { for (const [inp, cmd] of part) { for (const c of cmd) __p3.cmd(c); __p3.run(1, { mx: 0, mz: 0, cxSign: 1, ...inp }); } }, [steps.slice((f - 1) * every, f * every)]);
      await pg.evaluate(off => __p3.shot({ off, dist: 3.3, pitch: 0.06, h: 0.95 }), off); await pg.waitForTimeout(90);
      cells.push((await pg.screenshot({ type: 'jpeg', quality: 80, clip: { x: 120, y: 40, width: 220, height: 440 } })).toString('base64'));
    }
    rows.push(`<div style="font:12px sans-serif;margin-top:3px">${vname} · ${(every / 120).toFixed(3)}초 간격</div><div style="display:flex">${cells.map(im => `<img src="data:image/jpeg;base64,${im}" width=${Math.floor(1480 / N)}>`).join('')}</div>`);
    if (vname === '뒤에서') log.push(title + ' → ' + (await pg.evaluate(k0 => __p3.climbLog().slice(k0).filter(e => e.type !== 'try' && !(e.auto && e.box === '바닥')).map(e => `${e.type}${e.name ? ' ' + e.name : ''}${e.box ? ' ' + e.box : ''}${e.why ? ' · ' + e.why : ''}`).join(' | '), k0)));
  }
  await sheet.setContent(`<body style="margin:4px;background:#fff"><div style="font:700 14px sans-serif">${ver}${clip ? ' 캡처' : ''} · ${title} (스크립트 입력, 사람 손 아님)</div>${rows.join('')}</body>`);
  const h = await sheet.evaluate(() => document.body.scrollHeight + 8); await sheet.setViewportSize({ width: 1500, height: h });
  await sheet.screenshot({ path: path.join(dir, `${tag}_${k + 1}.png`), clip: { x: 0, y: 0, width: 1492, height: h } });
}
await b.close(); console.log(ver, '오류:', errs.join(' | ') || '없음'); for (const l of log) console.log(l);
