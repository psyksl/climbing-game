// 몸 보기(body3d.html)의 1배속 영상: 기본 관절 동작 전부(약 30초)와 받은 원본 동작(ClimbUp_1m·RM판·NinjaJump 셋)을 앞·옆·뒤 세 시점으로.
// 장면마다 시각을 정해 멈춰 찍고(1/30초 간격) 초당 30장으로 묶는다 — 화면 속도와 무관한 1배속. 정해 둔 스크립트 동작(사람 손 아님), 물리 판정 없음.
// 사용: node test/record_body.mjs <출력 폴더>   뼈대를 겹쳐 보기: SKEL=1   옛 몸: QUERY=body=old
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const HERE = path.dirname(fileURLToPath(import.meta.url)), require = createRequire(import.meta.url), { chromium } = require('playwright');
const out = process.argv[2]; if (!out) { console.log('사용: node test/record_body.mjs <출력 폴더>'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const pg = await b.newPage({ viewport: { width: 1200, height: 560 } }), errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto('file://' + path.join(HERE, '..', 'body3d.html') + '?test' + (process.env.SKEL ? '&skel' : '') + (process.env.QUERY ? '&' + process.env.QUERY : '')); await pg.waitForTimeout(2000);
const info = await pg.evaluate(() => ({ TOTAL: __bv.TOTAL, clips: __bv.clips, ver: __bv.VERSION }));
const tag = process.env.SKEL ? '_skel' : '';
async function rec(name, list) { const dir = path.join(out, 'f_' + name); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
  let n = 0; for (const [t, m, c] of list) { await pg.evaluate(([t, m, c]) => __bv.at(t, m, c), [t, m, c]); await pg.screenshot({ path: path.join(dir, String(n++).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 88 }); }
  const mp4 = path.join(out, name + '.mp4'); execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(dir, '%05d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', mp4]); fs.rmSync(dir, { recursive: true, force: true }); console.log(mp4, n + '장'); }
const fr = (T, f) => Array.from({ length: Math.round(T * 30) }, (_, i) => f(i / 30));
await rec('body_joints' + tag, fr(info.TOTAL, t => [t, 'joints']));
const L = []; for (const [c, d] of info.clips) if (c !== 'A_TPose') for (let r = 0; r < 2; r++) L.push(...fr(d + 0.6, t => [t, 'clip', c]));
await rec('body_clips' + tag, L);
// 앞·옆·뒤 그림(쉬는 자세, 원본 T자 자세)
await pg.evaluate(() => __bv.at(0.5, 'joints')); await pg.screenshot({ path: path.join(out, `body_rest${tag}.png`) });
await pg.evaluate(() => __bv.at(0.1, 'clip', 'A_TPose')); await pg.screenshot({ path: path.join(out, `body_tpose${tag}.png`) });
console.log(info.ver, errs.join(' | ') || '오류 없음'); await b.close();
