// short_browser.mjs가 기록한 입력(실제 키·마우스 이벤트가 계산 걸음마다 만든 입력)을 같은 빌드에서 한 걸음씩 다시 틀어 **1배속 영상**으로 찍는다(p3d-0.15.2).
// 계산 걸음 4개(1/30초)마다 한 장 → 초당 30장으로 묶으므로 영상의 1초 = 게임의 1초다. 화면 기본 렌더링(그림자 켬). 끝의 접촉을 기록한 것과 견준다(같은 계산인지).
// (옆 = 몸의 오른쪽에서 본다. 처음에는 왼쪽에서 찍었는데 초록 코스는 왼쪽 벽이 1.2m 옆이라 카메라가 벽에 막혀 몸통만 크게 찍혔다 — 찍은 영상은 띠 그림으로 확인한다)
// 보는 쪽(VIEWS): back = 뒤 전신, side = 옆 전신, feet = 발 확대(뒤), hands = 손 확대(뒤). **스크립트가 넣은 입력이며 사람 손이 아니다.**
// 사용: [MODE=clip] IN=<short_browser의 OUT.json> [VIEWS=back,side,feet,hands] [T0=초 T1=초] node test/short_video.mjs <출력 폴더>
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url'; import { createRequire } from 'module'; import { execFileSync } from 'child_process';
const HERE = path.dirname(fileURLToPath(import.meta.url)), require = createRequire(import.meta.url), { chromium } = require('playwright');
const [out] = process.argv.slice(2), E = process.env, R = JSON.parse(fs.readFileSync(E.IN, 'utf8')); if (!out) { console.log('사용: IN=입력.json node test/short_video.mjs <출력 폴더>'); process.exit(1); }
const build = path.join(HERE, '..', R.clip ? 'climb3d_mocap.html' : 'climb3d.html'), EVERY = +(E.EVERY || 4), VIEWS = (E.VIEWS || 'back,side,feet,hands').split(','), T0 = +(E.T0 || 0), T1 = +(E.T1 || 1e9), NAME = E.NAME || `짧은구간_${R.route}${R.recover ? '_복구' : ''}`;
// ql·qr(p3d-0.15.5) = 뒤에서 60° 돌아선 비스듬한 전신(왼쪽·오른쪽). 옆(side)은 벽·기둥이 가까운 자리에서 카메라가 당겨져 전신이 잘린다 — 화면 범위 검사가 0장인 쪽을 쓴다
const CAMS = { ql: { off: Math.PI + 1.05, dist: 4.4, pitch: 0.08, dy: 0.45 }, qr: { off: Math.PI - 1.05, dist: 4.4, pitch: 0.08, dy: 0.45 }, back: { off: Math.PI + 0.30, dist: 4.2, pitch: 0.10, dy: 0.45 }, side: { off: -Math.PI / 2 - 0.12, dist: 4.0, pitch: 0.06, dy: 0.45 }, feet: { off: Math.PI + 0.35, dist: 2.1, pitch: 0.16, dy: -0.55 }, hands: { off: Math.PI + 0.30, dist: 2.0, pitch: 0.02, dy: 0.80 } };
fs.mkdirSync(out, { recursive: true }); for (const v of VIEWS) { fs.rmSync(path.join(out, 'f_' + v), { recursive: true, force: true }); fs.mkdirSync(path.join(out, 'f_' + v), { recursive: true }); }
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }), pg = await b.newPage({ viewport: { width: +(E.VW || 960), height: +(E.VH || 640) } }), errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto('file://' + build + '?v=1' + (R.shadow === false || E.SHADOW === '0' ? '&noshadow' : '') + (R.sw ? '&sw=' + R.sw : '')); await pg.waitForTimeout(2500);
const ver = await pg.evaluate(([st, yaw, opts]) => { __p3.pause(true); for (const i of ['help', 'hud']) { const d = document.getElementById(i); if (d) d.style.display = 'none'; }
  const d = document.createElement('div'); d.id = 'lbl'; d.style.cssText = 'position:fixed;left:8px;top:8px;right:8px;background:rgba(28,35,29,.85);color:#f3ecd6;padding:6px 9px;border-radius:6px;font:14px/1.45 sans-serif;white-space:pre-wrap;z-index:99'; document.body.appendChild(d);
  __p3.opt(opts); __p3.wallStart(); __p3.reset({ pos: st, yaw }); return __p3.VERSION; }, [R.startPos, R.startYaw, { handMode: R.opts.handMode, footAssist: R.opts.footAssist, grabAssist: R.opts.grabAssist, poseAssist: R.opts.poseAssist, easy: R.opts.easy, autoBody: R.opts.autoBody, keepHold: R.opts.keepHold, press: R.opts.press, linkPose: !!R.opts.linkPose, planReach: !!R.opts.planReach, wallRest: R.opts.wallRest, diag: false }]);
if (ver !== R.version) console.log(`주의: 기록한 판(${R.version})과 지금 빌드(${ver})가 다르다`);
const keys = x => [x.cy > 0 ? 'W(몸 위로)' : '', x.cy < 0 ? 'S' : '', x.cx > 0 ? 'D' : '', x.cx < 0 ? 'A' : '', x.jump ? 'Space' : ''].filter(Boolean).join(' + ') || '—';
const BND = {}; let n = 0, lastCmd = '', cmdK = -999, last = null; const I = R.inputs, K0 = Math.round(T0 * 120), K1 = Math.min(I.length, Math.round(T1 * 120));
// DIST = 카메라 거리의 배수, DY = 겨누는 높이를 더 내리거나 올림(전신이 잘리지 않게 — p3d-0.15.4, GPT의 0.15.3 검토: 옆 영상에서 발이 잘렸다)
const DIST = +(E.DIST || 1), DY = +(E.DY || 0);
const optTxt = `발 보조 ${R.opts.footAssist ? '켬' : '끔'} · 잡기 보정 ${R.opts.grabAssist ? '켬' : '끔'} · 자세 보조 ${R.opts.poseAssist ? '켬' : '끔'} · 쉬운 조작 ${R.opts.easy ? '켬' : '끔'} · 자동 몸 맞추기 ${R.opts.easy && R.opts.autoBody !== false ? '켬' : '끔'} · 누르기 ${R.opts.press ? '켬' : R.opts.linkPose && R.opts.poseAssist ? '켬(전신 연결에 포함)' : '끔'}${R.opts.keepHold ? ' · 비교: 잡은 손 유지' : ''} · 전신 연결 ${R.opts.linkPose ? '켬' : '끔'} · 뻗기 전 검사 ${R.opts.planReach ? '켬' : '끔'}${R.shadow === false || process.env.SHADOW === '0' ? ' · 그림자 끔(찍는 시간 때문)' : ''}${R.sw ? ' · 비교 스위치 ' + R.sw : ''}`;
// 입력의 출처(p3d-0.15.4, GPT의 0.15.3 검토 M5): 기록에 source가 없으면 끝 접촉 기록(end)이 있는 것 = 브라우저에서 기록한 키·마우스, 없는 것 = 명령 수준. 둘 다 사람 손이 아니다
const SRC = R.source || (R.end ? 'keymouse' : 'command'), srcTxt = SRC === 'keymouse' ? '스크립트가 넣은 키·마우스 이벤트의 기록을 다시 재생(사람 손 아님)' : '명령 입력 재생(키·마우스를 거치지 않음, 사람 손 아님)', title = R.title || (/^stand_|누르기/.test(R.route) ? `장면 ${R.route}` : `짧은 구간(초록 시작 → 6) 경로 ${R.route}`);
for (let k = 0; k < K1; k += EVERY) {
  const part = I.slice(k, k + EVERY);
  for (const p of part) for (const c of p.cmd || []) { lastCmd = c.type === 'hand' ? (c.i ? '우클릭(오른손 보내기)' : '좌클릭(왼손 보내기)') : c.type === 'foot' ? (c.i ? 'Shift+우클릭(오른발)' : 'Shift+좌클릭(왼발)') : c.type === 'release' ? (c.limb === 'hand' ? (c.i ? 'E(오른손 놓기)' : 'Q(왼손 놓기)') : '발 떼기') : c.type; cmdK = k; }
  const lbl = `${ver} · ${R.clip ? '캡처 동작' : '자작 동작'} · ${title}${R.recover ? ' + 실패·복구' : ''} · 1배속 · 게임 시간 ${((k + part.length) / 120).toFixed(1)}초\n${optTxt}\n${srcTxt} · 입력: ${keys(part[part.length - 1])}${k - cmdK < 100 ? ' · ' + lastCmd : ''}`;
  last = await pg.evaluate(([xs, lbl]) => { for (const x of xs) { for (const c of x.cmd || []) __p3.cmd(c); __p3.run(1, { ...x, cmd: [] }); } document.getElementById('lbl').textContent = lbl;
    const L = __p3.climb(); return { h: L.hands.map(h => h.st + (h.st === 'hold' ? ':' + h.box : '')), f: L.feet.map(f => f.st + (f.st === 'plant' ? ':' + f.box : '')) }; }, [part, lbl]);
  if (k < K0) continue;
  for (const v of VIEWS) { const c = CAMS[v]; await pg.evaluate(([c, v]) => { const e = __p3.rig.bones.hips.matrixWorld.elements; __p3.shot({ off: c.off, dist: c.dist * c.k, pitch: c.pitch, at: [e[12], e[13] + c.dy + c.d, e[14]] }); const d = document.getElementById('lbl'); d.dataset.base = d.dataset.base || ''; }, [{ ...c, k: DIST, d: DY }, v]);
    // 전신 보기(back·side)는 그려진 몸 메시의 화면 범위가 머리말 아래 ~ 화면 안에 다 드는지 장마다 잰다(p3d-0.15.5, GPT의 0.15.4 검토: 발끝이 아래에서 잘리고 높은 손이 머리말에 가렸다)
    if (v === 'back' || v === 'side' || v === 'ql' || v === 'qr') { const B = await pg.evaluate(() => { const b = __p3.bodyRect(), l = document.getElementById('lbl').getBoundingClientRect(); return { ...b, lb: l.bottom }; }), m = BND[v] = BND[v] || { top: 1e9, bot: 1e9, left: 1e9, right: 1e9, cut: 0, n: 0 }, mt = B.r[1] - B.lb, mb = B.vh - B.r[3], ml = B.r[0], mr = B.vw - B.r[2]; m.top = Math.min(m.top, mt); m.bot = Math.min(m.bot, mb); m.left = Math.min(m.left, ml); m.right = Math.min(m.right, mr); m.n++; if (Math.min(mt, mb, ml, mr) < 0) m.cut++; }
    await pg.screenshot({ path: path.join(out, 'f_' + v, String(n).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 86 }); }
  n++;
}
await b.close(); const endRec = R.end ? { h: R.end.h.map(h => h.st + (h.st === 'hold' ? ':' + h.box : '')), f: R.end.f.map(f => f.st + (f.st === 'plant' ? ':' + f.box : '')) } : null, same = endRec && T1 > 1e8 ? JSON.stringify(endRec) === JSON.stringify(last) : null;
const VN = { back: '뒤', side: '옆', ql: '비스듬히_왼', qr: '비스듬히_오른', feet: '발확대', hands: '손확대' };
for (const v of VIEWS) { const mp4 = path.join(out, `${NAME}_${VN[v]}_1배속_${ver}.mp4`); execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(120 / EVERY), '-i', path.join(out, 'f_' + v, '%05d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', mp4]); console.log('→', mp4); }
for (const v in BND) { const m = BND[v]; console.log(`[화면 범위] ${VN[v]}: 몸 메시가 머리말 아래·화면 안에서 벗어난 장 ${m.cut}/${m.n} · 가장 작은 여유(px) 머리말 아래 ${m.top.toFixed(0)} · 아래 ${m.bot.toFixed(0)} · 왼 ${m.left.toFixed(0)} · 오른 ${m.right.toFixed(0)}`); }
console.log(ver, `장면 ${n}장 × ${VIEWS.length}`, '끝 접촉', JSON.stringify(last), same === null ? '' : same ? '· 기록한 끝 접촉과 같다' : `· **기록한 끝 접촉과 다르다** ${JSON.stringify(endRec)}`, errs.length ? '오류: ' + errs.join(' / ') : '오류 없음');
