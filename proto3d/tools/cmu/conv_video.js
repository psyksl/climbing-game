// 옮긴 CMU 동작(우리 마네킹, 동작 보기 화면)과 원본 재생을 같은 시각에 나란히.
// 사용: node conv_video.js <climb3d_mocap.html> <동작 이름> <원본 재생 mp4> <원본 시작초> <출력 mp4> [장/초=15]
'use strict';
const { chromium } = require('playwright'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const [file, name, srcMp4, t0s, out, fpsS] = process.argv.slice(2), t0 = +t0s, fps = +(fpsS || 15), tmp = out + '_frames';
(async () => {
  fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 420, height: 480 } }), errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + file + '?test&noshadow'); await pg.waitForTimeout(1800);
  await pg.evaluate(() => { __p3.pause(true); __p3.reset({ pos: [-14, 0, 14], yaw: Math.PI / 2 }); for (const i of ['help', 'hud']) { const e = document.getElementById(i); if (e) e.style.display = 'none'; } });
  const c = (await pg.evaluate(() => __p3.galleryList())).find(x => x.name === name); if (!c) { console.log('없는 동작', name); process.exit(1); }
  const n = Math.floor(c.dur * fps);
  for (let i = 0; i < n; i++) { const t = i / fps, shots = [];
    for (const off of [Math.PI, Math.PI / 2]) { await pg.evaluate(([nm, t, off]) => __p3.gallery(nm, t, { off, dist: 3.8, pitch: 0.05, up: 0.0 }), [name, t, off]); shots.push(path.join(tmp, `${off > 2 ? 'a' : 'b'}${String(i).padStart(4, '0')}.png`)); await pg.screenshot({ path: shots[shots.length - 1], clip: { x: 60, y: 30, width: 300, height: 420 } }); }
  }
  await b.close();
  // 원본 재생에서 같은 시각의 장면(30장/초 영상 → fps)
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t0), '-t', String(n / fps), '-i', srcMp4, '-vf', `fps=${fps},scale=600:300`, path.join(tmp, 'c%04d.png')]);
  const F = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc';
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(fps), '-start_number', '0', '-i', path.join(tmp, 'a%04d.png'), '-framerate', String(fps), '-start_number', '0', '-i', path.join(tmp, 'b%04d.png'), '-framerate', String(fps), '-start_number', '1', '-i', path.join(tmp, 'c%04d.png'),
    '-filter_complex', `[0:v]scale=214:300[a];[1:v]scale=214:300[b];[a][b][2:v]hstack=3,pad=iw:ih+30:0:30:color=0x1c231d,drawtext=fontfile=${F}:text='${name} | 왼쪽 둘 = 우리 마네킹(옮긴 자세 그대로, 뒤·옆) | 오른쪽 = 원본 재생(정면·옆) | 동작 파일 ${t0}초부터':fontcolor=0xf3ecd6:fontsize=14:x=6:y=7`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', out]);
  console.log(name, n, '장', errs.length ? '오류: ' + errs.join(' | ') : '오류 없음', '→', out);
})();
