// v0.8 영상 겸 실제 브라우저 확인: 관절 몸으로 매달리기·좌우 체중 이동·손 교차·도약 후 잡기·팔 힘으로 허리까지 올라가기.
// 실제 브라우저에 키·마우스 입력을 넣는다(사람 손이 아니라 스크립트 입력). 사용: node test/record_v08.js
'use strict';
const { chromium } = require('playwright'), fs = require('fs'), path = require('path');
const url = 'file://' + path.join(__dirname, '..', 'climb_lab.html'), out = path.join(__dirname, '..', 'recordings');
const sx = x => x + 30, sy = y => y - 130;
let fail = 0; const check = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`); if (!c) fail++; };
const st = pg => pg.evaluate(() => { const s = window.__lab.s; return { dead: s.dead, modes: s.limb.map(l => l.mode + (l.anchor ? '@' + l.anchor.poly : l.mode === 'plant' ? '@' + l.poly : '')), hip: [s.p[1].x, s.p[1].y], chest: [s.p[0].x, s.p[0].y], hands: [s.p[2].x, s.p[3].x], body: PH.getBody() }; });
async function clip(name, station, act) {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 960, height: 540 }, recordVideo: { dir: out, size: { width: 960, height: 540 } } });
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(url); await pg.waitForTimeout(500); await pg.keyboard.press('Digit' + station); await pg.waitForTimeout(900);
  await act(pg); await pg.waitForTimeout(500); check(`${name}: 페이지 오류 없음`, !errs.length, errs.join(';'));
  const v = pg.video(); await ctx.close(); await b.close(); fs.renameSync(await v.path(), path.join(out, name + '.webm'));
}
(async () => {
  // 1) 두 손 매달리기 → A, D로 좌우 체중 이동 → 오른손을 왼손 너머로 교차 → 왼손을 더 왼쪽으로
  await clip('v08_joint_shift_cross', 1, async pg => {
    await pg.mouse.move(sx(420), sy(420)); let a = await st(pg); check('기본 몸이 관절 몸', a.body === 'joint', a.body);
    await pg.keyboard.down('KeyA'); await pg.waitForTimeout(800); await pg.keyboard.up('KeyA'); await pg.waitForTimeout(300); let b = await st(pg);
    check('A: 엉덩이가 왼쪽으로 15px 이상, 두 발 디딘 채', b.hip[0] < a.hip[0] - 15 && b.modes[2].startsWith('plant') && b.modes[3].startsWith('plant'), `${Math.round(b.hip[0] - a.hip[0])}px`);
    await pg.keyboard.down('KeyD'); await pg.waitForTimeout(1300); await pg.keyboard.up('KeyD'); await pg.waitForTimeout(500); let c = await st(pg);
    check('D: 엉덩이가 오른쪽으로(처음 자리보다 15px 이상)', c.hip[0] > a.hip[0] + 15, `${Math.round(c.hip[0] - a.hip[0])}px`);
    await pg.keyboard.down('KeyA'); await pg.waitForTimeout(450); await pg.keyboard.up('KeyA'); await pg.waitForTimeout(700);
    await pg.mouse.move(sx(250), sy(298), { steps: 12 }); await pg.waitForTimeout(300); await pg.mouse.click(sx(250), sy(298), { button: 'right' }); await pg.waitForTimeout(1500); let d = await st(pg);
    check('손 교차: 오른손이 왼손보다 왼쪽에서 잡음', d.modes[1] === 'grip@A' && d.hands[1] < d.hands[0] - 8, `왼손 ${Math.round(d.hands[0])}, 오른손 ${Math.round(d.hands[1])}`);
    await pg.mouse.move(sx(210), sy(298), { steps: 8 }); await pg.waitForTimeout(300); await pg.mouse.click(sx(210), sy(298)); await pg.waitForTimeout(1600); let e = await st(pg);
    check('이어서 왼손을 더 왼쪽으로: 교차가 풀림', e.modes[0] === 'grip@A' && e.hands[0] < e.hands[1] && !e.dead, `왼손 ${Math.round(e.hands[0])}, 오른손 ${Math.round(e.hands[1])}`);
  });
  // 2) 발판에서 오른손을 먼저 보내고(세 점) Space로 모아 뛰어 잡기 → W로 허리까지 올라가 버티기(턱 위에 올라서지는 않는다)
  await clip('v08_joint_jump_mantle', 3, async pg => {
    await pg.mouse.move(sx(400), sy(330), { steps: 8 }); await pg.waitForTimeout(300); await pg.mouse.move(sx(545), sy(348), { steps: 12 }); await pg.waitForTimeout(400);
    await pg.mouse.click(sx(545), sy(348), { button: 'right' }); await pg.waitForTimeout(900);
    await pg.keyboard.down('Space'); await pg.waitForTimeout(120); await pg.mouse.click(sx(545), sy(348)); await pg.waitForTimeout(380); await pg.keyboard.up('Space'); await pg.waitForTimeout(1800); let a = await st(pg);
    check('도약 후 건너편 턱을 잡음', !a.dead && (a.modes[1] === 'grip@B' || a.modes[0] === 'grip@B'), a.modes.join(','));
    if (a.modes[0] !== 'grip@B' || a.modes[1] !== 'grip@B') { const i = a.modes[0] === 'grip@B' ? 1 : 0; await pg.mouse.move(sx(520), sy(346), { steps: 6 }); await pg.mouse.click(sx(520), sy(346), { button: i ? 'right' : 'left' }); await pg.waitForTimeout(1200); }
    // 두 손이 거의 같은 자리를 잡았으면 왼손을 어깨 폭만큼 왼쪽으로 옮겨 잡는다(어깨 폭이 있는 몸은 두 손을 모은 채로는 올라서기 어렵다)
    a = await st(pg); if (Math.abs(a.hands[0] - a.hands[1]) < 24) { const tx = Math.max(480, Math.min(a.hands[0], a.hands[1]) - 40); await pg.mouse.move(sx(tx), sy(346), { steps: 8 }); await pg.waitForTimeout(200); await pg.mouse.click(sx(tx), sy(346)); await pg.waitForTimeout(1300); }
    a = await st(pg); check('올라서기 전에 두 손을 벌려 잡음(12px 이상)', a.modes[0] === 'grip@B' && a.modes[1] === 'grip@B' && Math.abs(a.hands[0] - a.hands[1]) >= 12, `손 x ${Math.round(a.hands[0])}/${Math.round(a.hands[1])}`);
    await pg.mouse.move(sx(600), sy(240), { steps: 8 }); await pg.keyboard.down('KeyW'); await pg.waitForTimeout(3000); await pg.keyboard.up('KeyW'); await pg.waitForTimeout(1500); let b = await st(pg);
    check('W로 팔 힘으로 허리까지 올라가 버팀(가슴이 턱 위 40px 이상), 잡은 턱 위에 올라서지 않음', !b.dead && 345 - b.chest[1] >= 40 && !b.modes[2].endsWith('@B') && !b.modes[3].endsWith('@B'), `가슴 턱 위 ${Math.round(345 - b.chest[1])}px · ${b.modes.join(',')}`);
  });
  console.log('실패', fail); process.exit(fail ? 1 : 0);
})();
