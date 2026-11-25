// 사진의 경로(route_steps.mjs)를 가는 영상을 찍는다(p3d-0.12.4). 계산 걸음 4개(1/30초)마다 멈춰 찍어 1배속으로 묶는다. 스크립트 입력이며 사람 손이 아니다.
// 화면 기본 설정(새 자세·잡기 보정·자세 보조·발 보조 켬, 벽 딛기 끔, 손 조작 1). 겨눈 곳(look)은 마지막으로 보낸 목표. 단계마다 접촉 상태를 적어 영상 속 결과가 계산 시험(route_try.mjs)과 같은지 본다.
// 사용: [MODE=clip] node test/route_video.mjs <출력 폴더> [끝 단계]
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url'; import { createRequire } from 'module'; import { execFileSync } from 'child_process';
const HERE = path.dirname(fileURLToPath(import.meta.url)), require = createRequire(import.meta.url), { chromium } = require('playwright');
const { ROUTE, ROUTE_START } = await import('./route_steps.mjs');
const [out, uptoS] = process.argv.slice(2); if (!out) { console.log('사용: node test/route_video.mjs <출력 폴더> [끝 단계]'); process.exit(1); }
const clip = process.env.MODE === 'clip', build = path.join(HERE, '..', clip ? 'climb3d_mocap.html' : 'climb3d.html'), EVERY = 4;
const inputs = []; let look = null; ROUTE.slice(0, +(uptoS || 999)).forEach(([name, segs], si) => { for (const [n, inp = {}, cmd = []] of segs) { for (const c of cmd) if (c.p) look = c.p; for (let i = 0; i < n; i++) inputs.push({ x: { mx: 0, mz: 0, cxSign: 1, ...(look ? { look } : {}), ...inp, cmd: i ? [] : cmd }, si, name }); } });
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(path.join(out, 'f'), { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }), pg = await b.newPage({ viewport: { width: 960, height: 600 } }), errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto('file://' + build + '?test&noshadow&posture=fb'); await pg.waitForTimeout(1800);
const ver = await pg.evaluate(([m, st]) => { __p3.pause(true); if (m) __p3.setMode(m); for (const i of ['help', 'hud']) document.getElementById(i).style.display = 'none';
  const d = document.createElement('div'); d.id = 'lbl'; d.style.cssText = 'position:fixed;left:8px;top:8px;right:8px;background:rgba(28,35,29,.85);color:#f3ecd6;padding:6px 9px;border-radius:6px;font:15px/1.45 sans-serif;white-space:pre-wrap'; document.body.appendChild(d);
  __p3.opt({ handMode: 1, footAssist: true, wallRest: false, diag: false, grabAssist: true, poseAssist: true }); __p3.reset({ pos: st, yaw: Math.PI }); return __p3.VERSION; }, [clip ? 'clip' : '', ROUTE_START]);
const keys = x => [x.cy > 0 ? '위로(W)' : '', x.cy < 0 ? '아래로(S)' : '', x.cx > 0 ? '오른쪽(D)' : '', x.cx < 0 ? '왼쪽(A)' : '', x.jump ? '뛰기(Space)' : ''].filter(Boolean).join(' + ') || '—';
let n = 0, lastSi = -1, lastCmd = '', cmdT = -9; const log = [];
for (let k = 0; k < inputs.length; k += EVERY) {
  const part = inputs.slice(k, k + EVERY), I = part[part.length - 1];
  for (const p of part) for (const c of p.x.cmd) { lastCmd = c.type === 'hand' ? (c.i ? '오른손' : '왼손') + ' 보내기(클릭)' : c.type === 'foot' ? (c.i ? '오른발' : '왼발') + ' 보내기(클릭)' : '놓기'; cmdT = k; }
  const st = await pg.evaluate(([xs, lbl]) => { for (const x of xs) { for (const c of x.cmd || []) __p3.cmd(c); __p3.run(1, x); } const e = __p3.rig.bones.hips.matrixWorld.elements; __p3.shot({ off: Math.PI + 0.32 + Math.PI - __p3.body().yaw, dist: 4.3, pitch: 0.10, at: [e[12], e[13] + 0.45, e[14]] }); document.getElementById('lbl').textContent = lbl;
    const L = __p3.climb(); return L ? { h: L.hands.map(h => h.st + (h.st === 'hold' ? ':' + h.box : '')), f: L.feet.map(f => f.st + (f.st === 'plant' ? ':' + f.box : '')), on: L.on } : null; },
    [part.map(p => p.x), `${ver} ${clip ? '캡처 동작' : '자작 동작'} · 스크립트 입력(사람 손 아님) · 게임 시간 ${((k + part.length) / 120).toFixed(1)}초\n[${I.si + 1}/${ROUTE.length}] ${I.name}\n입력: ${keys(I.x)}${k - cmdT < 90 ? ' · ' + lastCmd : ''}`]);
  if (I.si !== lastSi || k + EVERY >= inputs.length) { if (st) log.push(`${((k + part.length) / 120).toFixed(2)}초 [${I.si + 1}] 손 ${st.h.join(' / ')} · 발 ${st.f.join(' / ')} · ${st.on ? '벽' : '지상'}`); lastSi = I.si; }
  await pg.screenshot({ path: path.join(out, 'f', String(n++).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 88 });
}
await b.close(); const mp4 = path.join(out, 'route_1x.mp4');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', '30', '-i', path.join(out, 'f', '%05d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '21', mp4]);
fs.writeFileSync(path.join(out, 'log.txt'), log.join('\n') + '\n'); console.log(log.join('\n')); console.log(ver, `장면 ${n}`, errs.length ? '오류: ' + errs.join(' / ') : '오류 없음', '→', mp4);
