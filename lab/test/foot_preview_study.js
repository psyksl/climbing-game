// 발 미리보기 판정 대 실제 결과(v0.16.2, GPT 검토 N2 뒤): 미리보기가 "닿음/닿지 않음"이라고 한 자리에 그 발을 실제로 보내면 겨눈 면에 디디는가.
// 오차 없는 고정 입력(사람 결과 아님). 사용: node test/foot_preview_study.js [src 폴더] [JSON 출력 파일]
'use strict';
const path = require('path'), fs = require('fs'), LAB = (process.argv[2] && process.argv[2] !== '-' ? path.resolve(process.argv[2]) : path.join(__dirname, '..', 'src')) + '/';
global.PH = require(LAB + 'physics.js'); global.CTRL = require(LAB + 'controls.js'); const LESSON = require(LAB + 'lessons.js');
const PH = global.PH, CTRL = global.CTRL; PH.setBody('joint'); Object.assign(CTRL.OPT, LESSON.BASE.opt);
const reachOf = CTRL.footReach || ((s, i, x, y) => { const C = PH.C, hj = PH.rootPos(s, i), lb = s.limb[i], dx = x - hj.x, dy = y - hj.y, len = Math.hypot(dx, dy) <= lb.max * 0.97, hip = PH.hipAngle((s.p[0].x - s.p[1].x) / C.T, (s.p[0].y - s.p[1].y) / C.T, lb, dx, dy).over <= 0; return { len, hip, ok: len && hip }; }); // 고치기 전 빌드: 그때 화면의 판정식
const DT = 1 / 120, out = { build: PH.VERSION, rows: [] };
function settle(st) { const s = PH.create(PH.makeWorld(), st), ctl = CTRL.make('intent'), pl = LESSON.player({ steps: [] }); while (s.t < 0.8) PH.step(s, ctl.step(s, pl.step(s.t), DT), DT); return { s, ctl }; }
function send(st, i, ax, ay) { // 0.8초 가만히 둔 뒤 조준 → 발 조종 키 + 그 발의 입력 → 0.15초 뒤 키를 뗀다 → 2.5초까지 본다
  const s = PH.create(PH.makeWorld(), st), ctl = CTRL.make('intent'), id = i === 2 ? 'sendL' : 'sendR';
  const pl = LESSON.player({ steps: [[0.5, 'aim', ax, ay], [0.8, 'down', 'foot'], [0.8, 'press', id], [0.8, 'pressShift', id], [0.95, 'up', 'foot']] });
  let tgt = null, ok = null, prev = s.limb[i].mode;
  while (s.t < 3.3 && !s.dead) { PH.step(s, ctl.step(s, pl.step(s.t), DT), DT); const ft = ctl.st.footTgt && ctl.st.footTgt[i]; if (ft && !tgt) tgt = { ...ft };
    const lb = s.limb[i]; if (s.t > 0.8 && lb.mode === 'plant' && prev !== 'plant' && ok === null) ok = !!tgt && lb.poly === tgt.poly && Math.hypot(s.p[2 + i].x - tgt.x, s.p[2 + i].y - tgt.y) < 20; prev = lb.mode; }
  const lb = s.limb[i], endOn = lb.mode === 'plant' && !!tgt && lb.poly === tgt.poly && Math.hypot(s.p[2 + i].x - tgt.x, s.p[2 + i].y - tgt.y) < 20; return { planted: ok === true || endOn, tgt, end: lb.mode + (lb.mode === 'plant' ? '@' + lb.poly : ''), ex: Math.round(s.p[2 + i].x), ey: Math.round(s.p[2 + i].y), dead: s.dead, far: ctl.st.footFar && ctl.st.footFar.i === i ? ctl.st.footFar.why : null, hold: [0, 1].map(h => s.limb[h].mode === 'grip' ? s.limb[h].poly : null) };
}
const starts = Object.keys(PH.STATIONS).filter(k => k !== '0').slice(0, 4);
for (const k of starts) { const st = PH.STATIONS[k], { s } = settle(k);
  const hp = s.p[1];
  for (let x = hp.x - 120; x <= hp.x + 120; x += 20) for (let y = hp.y - 40; y <= hp.y + 120; y += 20) { const fa = CTRL.footAim(s, x, y); if (!fa || fa.raw) continue;
    for (const i of [2, 3]) { const pr = reachOf(s, i, fa.x, fa.y), hj = PH.rootPos(s, i), ratio = Math.hypot(fa.x - hj.x, fa.y - hj.y) / s.limb[i].max, r = send(k, i, x, y); out.rows.push({ station: k, i, ax: x, ay: y, fx: +fa.x.toFixed(1), fy: +fa.y.toFixed(1), say: pr.ok, ratio: +ratio.toFixed(3), len: pr.len, hip: pr.hip, planted: r.planted, tpoly: r.tgt && r.tgt.poly, end: r.end, ex: r.ex, ey: r.ey, dead: r.dead, far: r.far, hold: r.hold }); } } }
const cnt = (a, b) => out.rows.filter(r => r.say === a && r.planted === b).length;
out.matrix = { sayOk_planted: cnt(true, true), sayOk_notPlanted: cnt(true, false), sayNo_planted: cnt(false, true), sayNo_notPlanted: cnt(false, false) };
console.log(`판 ${PH.VERSION} · 출발 자세 ${starts.join(', ')} · 시도 ${out.rows.length}`);
console.log(`미리보기 "닿음" → 실제 디딤 ${out.matrix.sayOk_planted} / 못 디딤 ${out.matrix.sayOk_notPlanted}`);
console.log(`미리보기 "닿지 않음" → 실제 디딤 ${out.matrix.sayNo_planted} / 못 디딤 ${out.matrix.sayNo_notPlanted}`);
const why = out.rows.filter(r => !r.say && r.planted); console.log(`"닿지 않음"인데 디딘 경우의 까닭: 다리 길이 ${why.filter(r => !r.len).length} · 고관절 ${why.filter(r => r.len && !r.hip).length}`);
if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
