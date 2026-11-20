// 캡처 동작(사람 동작을 이 뼈대로 옮긴 값)에서 pose_freeze와 같은 방법으로 "뼈가 처음 자세에서 얼마나 변하는가"(도)를 잰다.
// 우리 벽 동작과 견주는 용도다. 게임용 턱 오르기 동작이며 암벽등반 기술 자료가 아니다. 사람의 정답 값도 아니다(이 뼈대로 옮긴 뒤의 값).
// 사용: node tools/capture_range.mjs "Braced Hang Shimmy" "Free Hang Hop Right" …   (assets_local/gallery.json이 있어야 한다)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const GAL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets_local/gallery.json');
if (!fs.existsSync(GAL)) { console.log('gallery.json 없음 → 건너뜀'); process.exit(0); }
const g = JSON.parse(fs.readFileSync(GAL, 'utf8')), B = g.bones;
const ang = (a, b) => { const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]); return 2 * Math.acos(Math.min(1, d)) * 180 / Math.PI; };
const grp = { 골반: ['hips'], 척추: ['spine'], 가슴: ['chest'], 목: ['neck'], 머리: ['head'], 허벅지: ['upLeg.L', 'upLeg.R'], 무릎: ['leg.L', 'leg.R'], 발목: ['foot.L', 'foot.R'], 발가락: ['toe.L', 'toe.R'], 어깨: ['shoulder.L', 'shoulder.R'] };
const rows = [];
for (const name of process.argv.slice(2)) { const c = g.clips[name]; if (!c) { console.log('없음', name); continue; }
  const q = (f, b) => c.q.slice((f * B.length + b) * 4, (f * B.length + b) * 4 + 4), r = {};
  for (const [k, list] of Object.entries(grp)) { let m = 0, st = 0; for (const bn of list) { const b = B.indexOf(bn); for (let f = 1; f < c.n; f++) { m = Math.max(m, ang(q(0, b), q(f, b))); st = Math.max(st, ang(q(f - 1, b), q(f, b))); } } r[k] = m.toFixed(0); }
  rows.push(`| ${name} (${c.dur.toFixed(1)}초) | ` + Object.keys(grp).map(k => r[k]).join(' | ') + ' |'); }
console.log('| 동작 | ' + Object.keys(grp).join(' | ') + ' |'); console.log('|---|' + Object.keys(grp).map(() => '---').join('|') + '|'); console.log(rows.join('\n'));
