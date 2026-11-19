// v0.16.2 영상(GPT 검토 N1~N3 반송용, 스크립트 입력 = 사람 손 아님):
// ① 발 고르기 전 미리보기(발마다 L·R) → 오른발 보내기(그 발의 판정만, 닿지 않음 = 회색) → 발 조종 키를 떼고 마우스를 옮겨도 목표 고정 → 닿지 못하고 까닭 알림
// ② 왼발 보내기(닿음 = 보라) → 디딤
// ③ A/D로 체중 이동(무릎·골반 모양이 바뀜) → 리플레이 → 차트를 눌러 앞뒤로 옮기기 → 방향키 → 무릎·골반이 그 시각의 모양으로 돌아오는지
// 사용: node test/record_v16.js
'use strict';
const { chromium } = require('playwright'), fs = require('fs'), path = require('path');
const url = 'file://' + path.join(__dirname, '..', 'climb_lab.html'), out = path.join(__dirname, '..', 'recordings'), K = 1280 / 960;
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: out, size: { width: 1280, height: 720 } } });
  const pg = await ctx.newPage(), errs = [], wait = ms => pg.waitForTimeout(ms), lab = f => pg.evaluate(f); pg.on('pageerror', e => errs.push(e.message));
  const g2s = async (x, y) => { const v = await lab(() => window.__lab.view()); return [(v.x0 + x * v.s) * K, (v.y0 + y * v.s) * K]; }, gmove = async (x, y, o) => { const q = await g2s(x, y); return pg.mouse.move(q[0], q[1], o); }, amove = async (x, y, o) => { const v = await lab(() => window.__lab.view()); return gmove(x - v.ox, y - v.oy, o); }; // amove = 조준점(게임 좌표)이 그 자리에 오도록
  const log = []; const note = async tag => log.push({ tag, t: +(await lab(() => window.__lab.s.t)).toFixed(3), fp: await lab(() => window.__lab.footPreview()), m: await lab(() => window.__lab.s.limb.map(l => l.mode)) });
  await pg.goto(url); await wait(800); await pg.keyboard.press('Digit3'); await wait(1000);
  const spot = await lab(() => { const S = window.__lab.s; for (let x = 40; x < 600; x += 4) for (let y = 300; y < 560; y += 4) { const only = (x, y) => { const fa = CTRL.footAim(S, x, y); return fa && CTRL.footReach(S, 2, fa.x, fa.y).ok && !CTRL.footReach(S, 3, fa.x, fa.y).ok; }; if ([[0, 0], [-3, -3], [3, -3], [-3, 3], [3, 3]].every(([u, w]) => only(x + u, y + w))) return { x, y }; } return null; }); // 둘레 3px도 같은 판정인 자리(화면 반올림에 흔들리지 않게)
  if (!spot) throw new Error('왼발만 닿는 자리를 못 찾음');
  // ① 조준 → 발 조종 키(Shift)를 누른 채 미리보기 → 오른발 보내기 → 키 떼기 → 마우스를 멀리 옮김
  await amove(spot.x, spot.y, { steps: 14 }); await wait(500); await pg.keyboard.down('ShiftLeft'); await wait(1300); await note('발 고르기 전');
  await pg.keyboard.press('KeyE'); await wait(1100); await note('오른발 보냄'); await pg.keyboard.up('ShiftLeft'); await wait(400);
  await gmove(560, 200, { steps: 20 }); await wait(400); await note('키 뗀 뒤 마우스 옮김'); await wait(2000); await note('닿지 못함');
  // ② 같은 자리에 왼발(닿음)
  await pg.keyboard.press('KeyR'); await wait(900); await amove(spot.x, spot.y, { steps: 14 }); await wait(400); await pg.keyboard.down('ShiftLeft'); await wait(700);
  await pg.keyboard.press('KeyQ'); await wait(500); await note('왼발 보냄'); await pg.keyboard.up('ShiftLeft'); await wait(1500); await note('왼발 결과');
  // ③ 체중 이동 → 리플레이 → 앞뒤로 옮기기
  await pg.keyboard.down('KeyA'); await wait(900); await pg.keyboard.up('KeyA'); await pg.keyboard.down('KeyD'); await wait(1100); await pg.keyboard.up('KeyD'); await wait(500);
  await pg.keyboard.press('KeyY'); await wait(1500); if (await lab(() => window.__lab.practice().rp.playing)) await pg.keyboard.press('Space'); await wait(500);
  const t0 = await lab(() => window.__lab.lesson().rec.t0), rp = await lab(() => window.__lab.practice().rp);
  for (const f of [0.85, 0.35, 0.65, 0.15, 0.55]) { const c = await lab(() => window.__lab.chart()), t = rp.from + (rp.to - rp.from) * f, x = c.ax + c.pad + (t - t0 - c.view) * c.pps, y = c.plot.y + 4;
    await pg.mouse.move(x * K, y * K, { steps: 10 }); await wait(250); await pg.mouse.click(x * K, y * K); await wait(1100); }
  for (let i = 0; i < 6; i++) { await pg.keyboard.press('ArrowLeft'); await wait(220); } for (let i = 0; i < 6; i++) { await pg.keyboard.press('ArrowRight'); await wait(220); }
  await pg.keyboard.press('Space'); await wait(2000); await pg.keyboard.press('KeyY'); await wait(800);
  const vd = pg.video(); await ctx.close(); await b.close(); fs.renameSync(await vd.path(), path.join(out, 'v16_foot_preview_replay_shape.webm'));
  console.log(JSON.stringify(log)); console.log('v16_foot_preview_replay_shape 페이지 오류:', errs.join(';') || '없음');
})();
