// 코스 상태(src/course.js)의 시험(p3d-0.15.1). 앞의 넷은 GPT의 0.15.0 검토가 옛 함수에서 재현한 합성 입력 그대로다(옛 결과: 초록 / 빨강 / 초록 완등 / "빨강인데 완등·초록의 시간").
// 접촉 기록을 손으로 만들어 넣는다(실제 플레이의 전 과정은 gym_bot.mjs가 같은 모듈을 걸음마다 불러 본다).
import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), { makeCourseState, courseSelect, courseReset, courseStep, courseView, TOP_T } = await import(pathToFileURL(path.join(HERE, '../src/course.js')).href);
const courses = [{ id: 'green', name: '초록', startPos: [0, 0, 0] }, { id: 'red', name: '빨강', startPos: [4, 0, 0] }], DT = 1 / 120;
const box = (course, role = 'hand', name = `${course} ${role}`) => ({ course, role, name }), B = { gs: box('green', 'start'), g1: box('green'), gt: box('green', 'top'), rs: box('red', 'start'), r1: box('red'), rt: box('red', 'top'), free: { name: '볼륨', role: undefined, course: undefined } };
let pass = 0, fail = 0; const ok = (name, cond, got) => { if (cond) pass++; else fail++; console.log(`${cond ? '통과' : '실패'} · ${name}${cond ? '' : ' → ' + JSON.stringify(got)}`); };
function mk() { const G = makeCourseState(courses); let tick = 0; const st = (hands, on = true, pos = [0, 0, 0], onGround = false) => ({ tick, on, onGround, pos, hands: hands.map(b => (b ? { st: 'hold', box: b } : { st: 'free', box: null })) });
  return { G, run: (hands, n = 1, on = true, pos = [0, 0, 0]) => { for (let i = 0; i < n; i++) { tick++; courseStep(G, st(hands, on, pos), DT); } }, ground: (pos, n = 1) => { for (let i = 0; i < n; i++) { tick++; courseStep(G, st([null, null], false, pos, true), DT); } }, air: (pos, n = 1) => { for (let i = 0; i < n; i++) { tick++; courseStep(G, st([null, null], false, pos, false), DT); } }, tick: () => tick, view: () => courseView(G) }; }
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
// p3d-0.15.2(GPT의 0.15.1 재검토가 합성 기록으로 재현한 것 — 0.15.1의 결과: 공중에서 시도가 '내려옴'으로 끝남 / 다시 잡으면 시도 2·색 지킴 꺼짐 / 공중에서 빨강 시작 자리 위로 가면 선택이 빨강)
{ const T = mk(); T.ground([0, 0, 0]); T.run([B.gs, B.gs], 20); const t0 = T.view().try.t0; T.air([0.2, 1.3, 0], 19); let v = T.view();
  ok('⑭ 손을 다 떼고 공중(아직 내려서지 않음) → 시도 1이 이어진다(옛: 내려옴으로 끝남)', v.live && v.try.id === 1 && v.phase === 'air' && !v.try.end, { live: v.live, phase: v.phase, id: v.try && v.try.id });
  T.run([B.g1, null], 5); v = T.view(); ok('⑮ 공중에서 초록의 다음 홀드를 다시 잡음 → 같은 시도·같은 시작 시각·색 지킴 그대로(옛: 시도 2, 색 지킴 꺼짐)', v.try.id === 1 && v.try.t0 === t0 && v.try.clean && v.rec.tries === 1 && v.phase === 'climb', { id: v.try.id, t0: v.try.t0, clean: v.try.clean, tries: v.rec.tries });
  T.air([4, 2, 0], 10); v = T.view(); ok('⑯ 공중에서 빨강의 시작 자리 위를 지남 → 선택 코스는 초록 그대로(옛: 빨강)', v.course.id === 'green' && v.live && v.try.id === 1, { c: v.course.id, live: v.live });
  T.ground([4, 0, 0], 2); v = T.view(); ok('⑰ 그 자리에 내려섬 → 그때 시도가 끝나고(내려옴), 지상 대기라 선택이 빨강으로 바뀐다', v.course.id === 'red' && !v.live && T.G.last === null && T.G.rec.get('green').tries === 1, { c: v.course.id, live: v.live }); }
{ const T = mk(); T.ground([0, 0, 0]); T.run([B.gs, B.gs]); T.run([B.gt, B.gt], TOPN); T.air([0, 2, 0], 30); let v = T.view(); ok('⑱ 완등한 뒤 뛰어내리는 공중 → 완등 표시 그대로', v.phase === 'done' && v.live && v.try.done, v.phase);
  T.ground([0.2, 0, 0], 2); v = T.view(); ok('   내려서면 시도가 끝나고(완등 뒤 내려옴) 완등 표시는 다음 시도까지 남는다', !v.live && v.try && v.try.done && v.try.end === '완등 뒤 내려옴' && v.phase === 'done', v.try && v.try.end); }
{ const T = mk(); T.ground([0, 0, 0]); T.run([B.gs, B.gs]); T.air([0, 1.5, 0], 10); courseReset(T.G, T.tick()); let v = T.view(); ok('⑲ 공중에서 다시 시작 → 시도 없음, 선택은 그대로', v.course.id === 'green' && !v.try && v.phase === 'wait', v);
  T.air([0, 1.0, 0], 5); ok('   다시 시작한 뒤의 공중에는 시도가 생기지 않는다', !T.view().try && T.G.nTry === 1, T.G.nTry); }
{ const T = mk(); T.ground([0, 0, 0]); T.run([B.gs, B.gs]); T.air([0.1, 1.4, 0], 40); T.ground([0.1, 0, 0], 2); const v = T.view(); ok('⑳ 뛰었다가 다시 잡지 못하고 내려섬 → 시도 1이 내려옴으로 끝난다(완등 아님), 공중에 있던 시간이 남는다', !v.live && v.try.id === 1 && v.try.end === '내려옴' && !v.try.done && v.try.airT > 0.3 && v.phase === 'ended', v.try && [v.try.end, v.try.airT]);
  T.run([B.gs, B.gs]); ok('   다시 붙으면 시도 2', T.view().try.id === 2 && T.view().rec.tries === 2, T.view().try.id); }
{ const T = mk(); T.ground([0, 0, 0]); T.run([B.gs, B.gs], 5); T.run([null, null], 60, true, [0, 0.6, 0]); const v = T.view(); ok('㉑ 손을 다 떼고 발판에 서 있음(벽에 붙어 있음, 잡은 손 없음) → 시도는 이어진다', v.live && v.try.id === 1 && v.phase === 'climb' && !(v.try.airT > 0), [v.live, v.phase]);
  T.run([B.g1, null], 3); ok('   다시 잡아도 같은 시도, 색 지킴 그대로', T.view().try.id === 1 && T.view().try.clean, T.view().try.id); }
{ const T = mk(); T.air([0, 0.4, 0], 20); ok('㉒ 시도 없이 땅에서 뛴 공중 → 선택도 시도도 생기지 않는다', !T.view().course && !T.view().try, T.view()); T.ground([0, 0, 0]); T.air([0, 0.5, 0], 10); T.run([B.g1, null], 3); const v = T.view();
  ok('   초록을 고른 뒤 땅에서 뛰어 첫 홀드를 잡으면 그때 시도 1(시작 홀드가 아니라 색 지킴은 꺼짐)', v.try.id === 1 && !v.try.clean && /시작/.test(v.try.cleanWhy), v.try); }
console.log(`코스 상태: 통과 ${pass} · 실패 ${fail}`); process.exit(fail ? 1 : 0);
