// 손을 따라가는 가까운 영상(p3d-0.11.8 확인 영상): 계산 걸음 2개(1/60초)마다 찍어 1배속 영상으로 묶는다. 수정 전(비교 스위치)과 지금을 나란히.
// 스크립트 입력(사람 손 아님). 장면 입력이 진행 중의 상태를 보지 않는 장면만(foot·reach·h 등).
// 사용: node test/hand_video.mjs <출력 폴더> <장면 id> <L|R> <시작 초> <끝 초> <수정 전 스위치(쉼표, 없으면 -)>   캡처 동작: MODE=clip   시점: OFF=뒤(기본)|옆
// 수정 전을 옛 빌드로: BEFORE_BUILD=<옛 proto3d 폴더> BEFORE_LABEL=<이름표>   자세: POSTURE=fb|rule(없으면 화면 기본)   잡기 보정: ASSIST=0|1(없으면 화면 기본)
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url'; import { createRequire } from 'module'; import { execFileSync } from 'child_process';
const HERE = path.dirname(fileURLToPath(import.meta.url)), require = createRequire(import.meta.url), { chromium } = require('playwright');
const SC = await import('./scenes_foot.mjs');
const [out, id, side, t0s, t1s, globS] = process.argv.slice(2), t0 = +t0s, t1 = +t1s, clip = process.env.MODE === 'clip', glob = globS && globS !== '-' ? globS.split(',') : [];
const list = [...SC.SCENES_FOOT.map((s, i) => ['foot' + (i + 1), ...s]), ...SC.SCENES.map((s, i) => ['reach' + (i + 1), ...s]), ...SC.SCENES_H.map(s => [s[0].split(' ')[0], ...s])];
const sc = list.find(s => s[0] === id); if (!sc) { console.log('장면 없음', id); process.exit(1); }
const [, title, fn, assist, mode, st0] = sc, inputs = [], put = (inp = {}, cmd = []) => inputs.push({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd }), rep = (n, inp, cmd) => { for (let i = 0; i < n; i++) put(inp, i ? [] : cmd); };
if (/\bsim\.|swingThen/.test(fn.toString())) { console.log('상태를 보는 장면은 지원하지 않음'); process.exit(1); }
fn(null, put, rep);
const bname = clip ? 'climb3d_mocap.html' : 'climb3d.html', build = path.join(HERE, '..', bname), buildB = process.env.BEFORE_BUILD ? path.join(process.env.BEFORE_BUILD, bname) : build, off0 = process.env.OFF === '옆' ? -Math.PI / 2 : Math.PI;
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
async function shoot(tag, g, label, file) {
  const dir = path.join(out, tag); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
  const pg = await b.newPage({ viewport: { width: 480, height: 480 } }), errs = []; pg.on('pageerror', e => errs.push(e.message));
  if (g.length) await pg.addInitScript(gg => { for (const k of gg) globalThis[k] = 1; }, g);
  await pg.goto('file://' + file + '?test&noshadow' + (process.env.POSTURE ? '&posture=' + process.env.POSTURE : '')); await pg.waitForTimeout(1800);
  const ver = await pg.evaluate(([m, label]) => { __p3.pause(true); if (m) __p3.setMode(m); for (const i of ['help', 'hud']) document.getElementById(i).style.display = 'none'; const d = document.createElement('div'); d.id = 'lbl'; d.style.cssText = 'position:fixed;left:6px;top:6px;right:6px;background:rgba(28,35,29,.85);color:#f3ecd6;padding:4px 7px;border-radius:5px;font:13px/1.4 sans-serif'; d.textContent = label; document.body.appendChild(d); return __p3.VERSION; }, [clip ? 'clip' : '', label]);
  await pg.evaluate(([st, assist, mode, ga]) => { __p3.opt({ handMode: mode || 1, footAssist: !!assist, wallRest: false, diag: false, ...(ga === '' ? {} : { grabAssist: ga === '1' }) }); __p3.reset({ pos: st, yaw: Math.PI }); }, [st0 || SC.START, assist, mode, process.env.ASSIST ?? '']);
  const k0 = Math.round(t0 * 120), k1 = Math.min(Math.round(t1 * 120), inputs.length - 1);
  await pg.evaluate(([part]) => { for (const x of part) { for (const c of x.cmd || []) __p3.cmd(c); __p3.run(1, x); } }, [inputs.slice(0, k0)]);
  let n = 0;
  for (let k = k0; k <= k1; k += 2) {
    if (k > k0) await pg.evaluate(([part]) => { for (const x of part) { for (const c of x.cmd || []) __p3.cmd(c); __p3.run(1, x); } }, [inputs.slice(k - 2, k)]);
    await pg.evaluate(([off, side, k, label]) => { const e = __p3.rig.bones['hand.' + side].matrixWorld.elements; __p3.shot({ off: off + Math.PI - __p3.body().yaw, dist: 0.8, pitch: 0.05, at: [e[12], e[13] - 0.05, e[14]] }); document.getElementById('lbl').textContent = label + ' · 게임 시간 ' + ((k + 1) / 120).toFixed(3) + '초'; }, [off0, side, k, label]);
    await pg.screenshot({ path: path.join(dir, String(n++).padStart(4, '0') + '.jpg'), type: 'jpeg', quality: 90 });
  }
  await pg.close(); return { dir, n, ver, errs };
}
const A = await shoot('before', glob, process.env.BEFORE_LABEL || `수정 전 · 비교 스위치 ${glob.join(',') || '없음'}`, buildB), B = await shoot('after', [], process.env.AFTER_LABEL || '지금', build);
await b.close();
const base = path.join(out, `${id}_${side}_hand`), args = (fps, name) => ['-v', 'error', '-y', '-framerate', String(fps), '-i', path.join(A.dir, '%04d.jpg'), '-framerate', String(fps), '-i', path.join(B.dir, '%04d.jpg'), '-filter_complex', 'hstack=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', name];
execFileSync('ffmpeg', args(60, base + '_1x.mp4')); execFileSync('ffmpeg', args(15, base + '_0.25x.mp4'));
console.log(A.ver, `${title} · ${side}손 · ${t0}~${t1}초 · 장면 ${A.n}/${B.n}`, A.errs.concat(B.errs).length ? '오류: ' + A.errs.concat(B.errs).join(' / ') : '오류 없음', '→', base + '_1x.mp4');
