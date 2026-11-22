// wall_check 결과의 항목별 비교(p3d-0.10.4, GPT의 0.10.3 검토 "총계가 아니라 항목별 전후 차이를 적는다 — 기본과 frame이 모두 76/7이어도 실패 항목이 다르다").
// 사용: node test/wall_diff.mjs <이름=결과.json> <이름=결과.json> [...] [--md 표.md]
//   항목 이름으로 맞대어 PASS / FAIL / 이력을 나란히 적고, 어느 한쪽이라도 PASS가 아닌 항목만 보인다(모두 같으면 "같음").
import fs from 'fs';
const args = process.argv.slice(2), mdAt = args.indexOf('--md'), md = mdAt >= 0 ? args[mdAt + 1] : null, sets = args.filter((a, i) => a.includes('=') && (mdAt < 0 || i !== mdAt + 1)).map(a => { const [n, f] = a.split('='); return [n, JSON.parse(fs.readFileSync(f, 'utf8'))]; });
const st = c => (c.이력 ? '이력' : c.ok ? 'PASS' : 'FAIL');
const names = [], by = sets.map(([n, d]) => { const m = new Map(); for (const c of d.checks || []) { const k = c.name.slice(0, 120); if (!names.includes(k)) names.push(k); m.set(k, c); } return m; });
const lines = [], short = s => s.replace(/\s+/g, ' ').slice(0, 90);
lines.push(`| 항목 | ${sets.map(s => s[0]).join(' | ')} | 비고 |`, `|---|${sets.map(() => '---').join('|')}|---|`);
let diff = 0;
for (const k of names) { const cs = by.map(m => m.get(k)), ss = cs.map(c => (c ? st(c) : '없음'));
  if (ss.every(x => x === 'PASS')) continue; if (new Set(ss).size > 1) diff++;
  const det = cs.map((c, i) => (c && st(c) !== 'PASS' ? `${sets[i][0]}: ${short(c.detail || '')}` : '')).filter(Boolean).join(' / ');
  lines.push(`| ${short(k)} | ${ss.join(' | ')} | ${det} |`); }
const tot = sets.map(([n, d]) => `${n} ${(d.checks || []).filter(c => c.ok && !c.이력).length}/${(d.checks || []).filter(c => !c.ok && !c.이력).length}+이력${(d.checks || []).filter(c => c.이력).length}`).join(' · ');
const txt = `통과/실패: ${tot} · 결과가 갈린 항목 ${diff}\n\n${lines.join('\n')}\n`;
console.log(txt); if (md) fs.writeFileSync(md, txt);
