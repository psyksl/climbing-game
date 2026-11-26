// 코스 상태(src/course.js)의 시험(p3d-0.15.1). 앞의 넷은 GPT의 0.15.0 검토가 옛 함수에서 재현한 합성 입력 그대로다(옛 결과: 초록 / 빨강 / 초록 완등 / "빨강인데 완등·초록의 시간").
// 접촉 기록을 손으로 만들어 넣는다(실제 플레이의 전 과정은 gym_bot.mjs가 같은 모듈을 걸음마다 불러 본다).
import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), { makeCourseState, courseSelect, courseReset, courseStep, courseView, TOP_T } = await import(pathToFileURL(path.join(HERE, '../src/course.js')).href);
const courses = [{ id: 'green', name: '초록', startPos: [0, 0, 0] }, { id: 'red', name: '빨강', startPos: [4, 0, 0] }], DT = 1 / 120;
const box = (course, role = 'hand', name = `${course} ${role}`) => ({ course, role, name }), B = { gs: box('green', 'start'), g1: box('green'), gt: box('green', 'top'), rs: box('red', 'start'), r1: box('red'), rt: box('red', 'top'), free: { name: '볼륨', role: undefined, course: undefined } };
let pass = 0, fail = 0; const ok = (name, cond, got) => { if (cond) pass++; else fail++; console.log(`${cond ? '통과' : '실패'} · ${name}${cond ? '' : ' → ' + JSON.stringify(got)}`); };
function mk() { const G = makeCourseState(courses); let tick = 0; const st = (hands, on = true, pos = [0, 0, 0]) => ({ tick, on, pos, hands: hands.map(b => (b ? { st: 'hold', box: b } : { st: 'free', box: null })) });
  return { G, run: (hands, n = 1, on = true, pos = [0, 0, 0]) => { for (let i = 0; i < n; i++) { tick++; courseStep(G, st(hands, on, pos), DT); } }, ground: (pos, n = 1) => { for (let i = 0; i < n; i++) { tick++; courseStep(G, st([null, null], false, pos), DT); } }, tick: () => tick, view: () => courseView(G) }; }
const TOPN = Math.ceil(TOP_T * 120) + 2;
{ const T = mk(); T.ground([0, 0, 0]); T.run([B.gs, null]); T.run([B.g1, B.r1]); ok('① 왼손 초록·오른손 빨강 → 선택 코스는 초록 그대로', T.view().course.id === 'green', T.view().course.id);
  T.run([B.r1, B.g1]); ok('② 같은 두 색, 손을 바꿈 → 여전히 초록(옛: 빨강)', T.view().course.id === 'green', T.view().course.id);
  ok('   다른 색을 잡았으므로 색 지킴은 꺼지고 까닭이 남음', T.view().try.clean === false && /빨강|red/.test(T.view().try.cleanWhy), T.view().try); }
{ const T = mk(); T.ground([0, 0, 0]); T.run([B.gs, B.gs]); T.run([B.g1, B.gs], 30); T.run([B.gt, B.g1], 30); T.run([B.gt, B.gt], TOPN); const v = T.view();
  ok('③ 초록 완등(두 손 완등 홀드 0.5초) → 완등, 색 지킴', v.course.id === 'green' && v.try.done && v.try.doneClean, v.try);
  T.run([B.rs, B.gt]); const w = T.view(); ok('④ 초록 완등 뒤 빨강을 잡음 → 코스는 초록 그대로, 완등은 초록 시도의 것(옛: 빨강 + 완등)', w.course.id === 'green' && w.try.done && w.try.course.id === 'green', { c: w.course.id, done: w.try.done });
  T.ground([4, 0, 0], 3); const x = T.view(); ok('⑤ 내려와 빨강의 시작 자리로 감 → 선택 = 빨강, 완등 표시 없음(초록의 완료가 넘어오지 않음)', x.course.id === 'red' && !x.try, { c: x.course.id, t: x.try });
  ok('   빨강의 기록은 비어 있고 초록의 기록은 남아 있음', x.rec.tops === 0 && T.G.rec.get('green').tops === 1 && T.G.rec.get('green').clean !== null, [x.rec, T.G.rec.get('green')]);
  T.run([B.rs, B.rs]); T.run([B.rt, B.rt], TOPN); const y = T.view(); ok('⑥ 빨강 시도: 시도 번호가 새로 붙고 빨강의 완등으로 기록', y.try.id === 2 && y.try.done && y.try.course.id === 'red' && y.rec.tops === 1, y.try); }
{ const T = mk(); T.ground([0, 0, 0]); T.run([B.gs, B.gs]); T.run([B.free, B.gs], 5); T.run([B.gt, B.gt], TOPN); const v = T.view();
  ok('⑦ 코스 밖 홀드를 한 번 쓰고 완등 → 완등(자유 등반), 색 지킴 기록은 없음', v.try.done && !v.try.doneClean && v.rec.free !== null && v.rec.clean === null, [v.try, v.rec]); }
{ const T = mk(); T.ground([0, 0, 0]); T.run([B.g1, null]); T.run([B.gt, B.gt], TOPN); const v = T.view(); ok('⑧ 시작 홀드가 아닌 곳에서 시작 → 완등은 자유 등반으로만', v.try.done && !v.try.doneClean && /시작/.test(v.try.cleanWhy), v.try); }
{ const T = mk(); T.ground([0, 0, 0]); T.run([B.gs, B.gs]); T.run([B.rt, B.rt], TOPN); const v = T.view(); ok('⑨ 초록을 고르고 빨강의 완등 홀드를 두 손으로 잡음 → 초록의 완등이 아님', !v.try.done && T.G.rec.get('green').tops === 0, v.try); }
{ const T = mk(); T.ground([0, 0, 0]); T.run([B.gs, B.gs]); T.run([B.gt, B.gt], TOPN - 10); T.run([B.gt, null], 3); T.run([B.gt, B.gt], TOPN - 10); ok('⑩ 완등 홀드를 0.5초 못 채우고 한 손을 뗐다 다시 잡음 → 시간은 다시 센다', !T.view().try.done, T.view().try); T.run([B.gt, B.gt], 12); ok('   이어서 0.5초를 채우면 완등', T.view().try.done, T.view().try); }
{ const T = mk(); T.ground([0, 0, 0]); T.run([B.gs, B.gs]); T.run([B.g1, B.gs], 10); T.ground([0.3, 0, 0], 2); const v = T.view(); ok('⑪ 오르다 땅에 내려옴 → 시도가 끝나고(내려옴) 선택은 그대로', v.course.id === 'green' && !v.live && v.try && v.try.end === '내려옴' && !v.try.done, v.try);
  T.run([B.gs, B.gs]); ok('   다시 붙으면 새 시도(번호 2), 시도 수 2', T.view().try.id === 2 && T.view().rec.tries === 2, [T.view().try.id, T.view().rec]); }
{ const T = mk(); T.ground([0, 0, 0]); T.run([B.gs, B.gs]); T.run([B.gt, B.gt], TOPN); courseSelect(T.G, courses[1], T.tick()); const v = T.view(); ok('⑫ 완등한 채 다음 코스를 고름(T 키) → 빨강, 완등 표시 없음', v.course.id === 'red' && !v.try, v);
  courseSelect(T.G, courses[0], T.tick()); ok('   초록으로 돌아오면 지난 시도의 "완등!"은 다시 뜨지 않고 기록(완등 1)만 남음', !T.view().try && T.view().rec.tops === 1, T.view()); }
{ const T = mk(); T.ground([0, 0, 0]); T.run([B.gs, B.gs]); courseReset(T.G, T.tick()); ok('⑬ 다시 시작 → 시도 없음, 선택은 그대로', T.view().course.id === 'green' && !T.view().try, T.view()); }
console.log(`코스 상태: 통과 ${pass} · 실패 ${fail}`); process.exit(fail ? 1 : 0);
