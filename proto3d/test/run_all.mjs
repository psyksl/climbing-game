// 시험 묶음 실행기(p3d-0.10.2, GPT의 0.10.1 검토 7절 "FAIL이 상위 실행기의 실패로 연결되는지 확인"). 빌드 → 계산 시험 → 브라우저 시험을 차례로 돌리고, 하나라도 실패(종료 코드 ≠ 0)하면 이 실행기도 실패로 끝난다.
// 알려진 실패도 실패로 센다(통과로 바꾸지 않는다). 각 시험의 FAIL 줄을 모아 보인다. 사용: node test/run_all.mjs [빠르게: QUICK=1 → 브라우저 시험 뺌]   결과 JSON: node test/run_all.mjs <JSON>
import { prov, provLine } from './provenance.mjs'; // 실행 출처(p3d-0.10.3) — 소스보다 먼저 불러와 설정 스위치를 켠다
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __P = prov(); console.log(provLine(__P));
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUITES = [
  ['빌드', ['build.js'], {}],
  ['벽 시험(새 몸)', ['test/wall_check.mjs'], {}],
  ['벽 시험(옛 몸)', ['test/wall_check.mjs'], { BODY: 'old' }],
  ['새 몸 맞춤(human_check)', ['test/human_check.mjs'], {}],
  ['걸음마다 재기(motion_scan)', ['test/motion_scan.mjs'], {}],
  ...(process.env.QUICK ? [] : [['FPS 비교', ['test/fps_check.js'], {}], ['입력 경계', ['test/input_edges.js'], {}], ['지상 동작', ['test/motion_check.js'], {}], ['벽 브라우저', ['test/wall_browser.js'], {}], ['카메라', ['test/camera_check.js'], {}]]),
];
const res = [];
for (const [name, args, env] of SUITES) {
  const t0 = Date.now(), r = spawnSync(process.execPath, args, { cwd: ROOT, env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 1 << 28 }), out = (r.stdout || '') + (r.stderr || '');
  const fails = out.split('\n').filter(l => /^\s*FAIL\b/.test(l)).map(l => l.trim().slice(0, 220)), code = r.status ?? 1;
  res.push({ 시험: name, 종료_코드: code, 실패_줄: fails, 초: +((Date.now() - t0) / 1000).toFixed(1) });
  console.log(`${code ? 'FAIL' : 'PASS'}  ${name} (종료 코드 ${code}, ${((Date.now() - t0) / 1000).toFixed(0)}초)${fails.length ? '\n      ' + fails.join('\n      ') : ''}`);
}
const bad = res.filter(r => r.종료_코드);
console.log(`\n시험 묶음 ${res.length}개 중 실패 ${bad.length}개${bad.length ? ': ' + bad.map(r => r.시험).join(', ') : ''}`);
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ 실행_출처: __P, 시험: res }, null, 1));
process.exitCode = bad.length ? 1 : 0;
