// 시험 봇(gym_bot.mjs)이 코스를 오른 입력을 화면 빌드에서 그대로 다시 틀어 영상으로 찍는다(p3d-0.14.0). **스크립트 입력이며 사람 손이 아니다.**
// 계산 걸음 4개(1/30초)마다 찍어 1배속으로 묶는다. 화면 기본 설정(새 자세·잡기 보정·자세 보조·발 보조·쉬운 조작 켬). 끝의 접촉을 봇의 결과와 견준다(같은 계산인지).
// 사용: [MODE=clip] REC=<gym_bot이 남긴 입력.json> node test/gym_video.mjs <출력 폴더>
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url'; import { createRequire } from 'module'; import { execFileSync } from 'child_process';
const HERE = path.dirname(fileURLToPath(import.meta.url)), require = createRequire(import.meta.url), { chromium } = require('playwright');
const [out] = process.argv.slice(2), R = JSON.parse(fs.readFileSync(process.env.REC, 'utf8')); if (!out) { console.log('사용: REC=입력.json node test/gym_video.mjs <출력 폴더>'); process.exit(1); }
const clip = process.env.MODE === 'clip', build = path.join(HERE, '..', clip ? 'climb3d_mocap.html' : 'climb3d.html'), EVERY = 4;
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(path.join(out, 'f'), { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }), pg = await b.newPage({ viewport: { width: 960, height: 600 } }), errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto('file://' + build + '?test&noshadow&posture=fb&world=gym'); await pg.waitForTimeout(1800);
const ver = await pg.evaluate(([m, st, yaw, easy]) => { __p3.pause(true); if (m) __p3.setMode(m); for (const i of ['help', 'hud']) document.getElementById(i).style.display = 'none';
  const d = document.createElement('div'); d.id = 'lbl'; d.style.cssText = 'position:fixed;left:8px;top:8px;right:8px;background:rgba(28,35,29,.85);color:#f3ecd6;padding:6px 9px;border-radius:6px;font:15px/1.45 sans-serif;white-space:pre-wrap'; document.body.appendChild(d);
  __p3.opt({ handMode: 1, footAssist: true, wallRest: false, diag: false, grabAssist: true, poseAssist: true, easy }); __p3.reset({ pos: st, yaw }); return __p3.VERSION; }, [clip ? 'clip' : '', R.startPos, R.startYaw, R.easy]);
const keys = x => [x.cy > 0 ? '위로(W)' : '', x.cx > 0 ? '오른쪽(D)' : '', x.cx < 0 ? '왼쪽(A)' : '', x.jump ? '뛰기(Space)' : ''].filter(Boolean).join(' + ') || '—';
let n = 0, lastCmd = '', cmdT = -9, last = null; const I = R.inputs;
for (let k = 0; k < I.length; k += EVERY) {
  const part = I.slice(k, k + EVERY);
  for (const p of part) for (const c of p.cmd) { lastCmd = c.type === 'hand' ? (c.i ? '오른손' : '왼손') + ' 보내기(클릭)' : c.type === 'foot' ? (c.i ? '오른발' : '왼발') + ' 보내기(Shift+클릭)' : '놓기'; cmdT = k; }
  last = await pg.evaluate(([xs, lbl]) => { for (const x of xs) { for (const c of x.cmd || []) __p3.cmd(c); __p3.run(1, { ...x, cmd: [] }); } const e = __p3.rig.bones.hips.matrixWorld.elements; __p3.shot({ off: Math.PI + 0.30, dist: 4.4, pitch: 0.12, at: [e[12], e[13] + 0.5, e[14]] }); document.getElementById('lbl').textContent = lbl;
    const L = __p3.climb(); return L ? { h: L.hands.map(h => h.st + (h.st === 'hold' ? ':' + h.box : '')), f: L.feet.map(f => f.st + (f.st === 'plant' ? ':' + f.box : '')) } : null; },
    [part, `${ver} 클라이밍장 · ${R.course} 코스 · ${clip ? '캡처 동작' : '자작 동작'} · 쉬운 조작 ${R.easy ? '켬' : '끔'} · 스크립트 입력(사람 손 아님) · 게임 시간 ${((k + part.length) / 120).toFixed(1)}초\n입력: ${keys(part[part.length - 1])}${k - cmdT < 90 ? ' · ' + lastCmd : ''}`]);
  await pg.screenshot({ path: path.join(out, 'f', String(n++).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 88 });
}
await b.close(); const mp4 = path.join(out, 'gym_1x.mp4');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', '30', '-i', path.join(out, 'f', '%05d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', mp4]);
console.log(ver, `장면 ${n}`, '끝 접촉', JSON.stringify(last), '· 봇 결과', R.res.ok ? '완등' : '실패', errs.length ? '오류: ' + errs.join(' / ') : '오류 없음', '→', mp4);
