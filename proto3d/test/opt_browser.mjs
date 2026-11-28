// 발 보조 기본 끔(p3d-0.15.7, 사용자 결정)과 저장 설정의 전환을 브라우저에서 확인한다: 새 프로필 · 0.15.6이 저장한 옛 기본값 · F로 고른 값 · 주소의 설정(저장되지 않음) · 섞이지 않음.
// **스크립트가 넣는 실제 키 이벤트이며 사람 손이 아니다.** 사용: [BUILD=다른 빌드.html] node test/opt_browser.mjs
import path from 'path'; import { fileURLToPath } from 'url'; import { createRequire } from 'module';
const HERE = path.dirname(fileURLToPath(import.meta.url)), require = createRequire(import.meta.url), { chromium } = require('playwright');
(async () => { const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }), file = 'file://' + (process.env.BUILD ? path.resolve(process.env.BUILD) : path.join(HERE, '..', 'climb3d.html')); let fails = 0;
  const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${d}`); if (!ok) fails++; };
  const open = async (ctx, q = '') => { const pg = await ctx.newPage(); await pg.goto(file + q); await pg.waitForTimeout(1200); return pg; }, opt = pg => pg.evaluate(() => __p3.opt()), saved = pg => pg.evaluate(() => JSON.parse(localStorage.getItem('p3dOpt_v1') || 'null'));
  { const ctx = await b.newContext(), pg = await open(ctx); const o = await opt(pg); check('① 새 프로필: 발 보조 끔으로 시작', o.footAssist === false, JSON.stringify({ foot: o.footAssist, link: o.linkPose, plan: o.planReach, guard: o.autoGuard })); await ctx.close(); }
  { const ctx = await b.newContext(); let pg = await open(ctx); await pg.evaluate(() => localStorage.setItem('p3dOpt_v1', JSON.stringify({ handMode: 1, footAssist: true, easy: true, helpFold: false }))); await pg.close(); pg = await open(ctx); const o = await opt(pg);
    check('② 0.15.6이 저장한 옛 기본값(발 보조 켬, 고른 표시 없음)은 새 기본을 덮지 않는다', o.footAssist === false, `발 보조 ${o.footAssist}`);
    await pg.keyboard.press('KeyF'); await pg.waitForTimeout(200); const o2 = await opt(pg), s2 = await saved(pg); check('③ F = 켬, 고른 값으로 저장된다', o2.footAssist === true && s2 && s2.footAssist === true && s2.footAssistSet === true, JSON.stringify({ 지금: o2.footAssist, 저장: s2 && s2.footAssist, 표시: s2 && s2.footAssistSet })); await pg.close();
    pg = await open(ctx); const o3 = await opt(pg); check('④ 다시 열면 직접 고른 값(켬)을 따른다', o3.footAssist === true, `발 보조 ${o3.footAssist}`); await pg.close();
    pg = await open(ctx, '?foot=0&link=1&plan=1&guard=1'); const o4 = await opt(pg); await pg.keyboard.press('KeyK'); await pg.waitForTimeout(200); const s4 = await saved(pg);
    check('⑤ 주소의 설정이 저장된 값보다 먼저이고, 주소로 정한 값은 저장되지 않는다', o4.footAssist === false && o4.linkPose === true && o4.planReach === true && o4.autoGuard === true && s4.footAssist === true && !s4.linkPose && !s4.planReach && !s4.autoGuard, JSON.stringify({ 지금: [o4.footAssist, o4.linkPose, o4.planReach, o4.autoGuard], 저장: [s4.footAssist, s4.linkPose, s4.planReach, s4.autoGuard] })); await pg.close();
    pg = await open(ctx); const o5 = await opt(pg); check('⑥ 그 뒤에 기본 주소로 열면 주소로 켰던 설정이 섞이지 않는다', o5.linkPose === false && o5.planReach === false && o5.autoGuard === false && o5.footAssist === true, JSON.stringify([o5.footAssist, o5.linkPose, o5.planReach, o5.autoGuard])); await ctx.close(); }
  console.log(`실패 ${fails}`); await b.close(); process.exit(fails ? 1 : 0); })();
