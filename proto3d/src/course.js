// 클라이밍장의 코스 상태(p3d-0.15.1). 화면·기록용이다 — 물리는 이것을 모르고, 어떤 색의 홀드든 그대로 잡을 수 있다.
// GPT의 0.15.0 검토: 0.15.0까지는 "두 손 가운데 먼저 찾은 손이 잡은 홀드의 색"이 곧 코스였다. 그래서
//   ① 왼손 초록·오른손 빨강이면 초록, 손을 바꾸면 빨강 ② 초록을 완등한 뒤 빨강을 잡으면 코스 이름은 빨강인데 "완등!"과 초록의 시간이 남았다.
// 여기서는 네 가지를 따로 둔다:
//   선택한 코스(sel)  = 플레이어가 고른 것(T 키, 또는 땅에 서서 그 코스의 시작 자리 가까이 감). 벽에 붙은 뒤에는 무엇을 잡아도 바뀌지 않는다.
//   잡고 있는 홀드    = 그때그때의 접촉(이 파일이 따로 저장하지 않는다. 걸음마다 넘겨받는다)
//   시도(try)         = 벽에 붙은 때부터 땅에 내려오거나 완등하거나 다시 시작할 때까지. 번호(id)와 그 시도의 코스(바뀌지 않는다)를 가진다.
//   기록(rec)         = 코스마다: 시도 수, 완등 수, 가장 빠른 완등(자유 등반 / 색 지킴)을 따로.
// 완등 = 그 시도의 코스의 완등 홀드를 두 손으로 함께 잡고 TOP_T초(게임용 후보값. 공식 경기 규칙이 아니다).
// 색 지킴(임시 규칙 — 기획 결정 대기) = 그 시도에서 손이 잡은 홀드가 모두 그 코스의 홀드이고, 처음 잡은 홀드가 시작 홀드. 발은 따지지 않는다.
//   자유 등반의 완등과 색 지킴의 완등은 다른 기록이다. 다른 색을 잡아도 시도는 이어지고, 색 지킴만 꺼진다(무엇 때문에 꺼졌는지 남긴다).
export const TOP_T = 0.5, NEAR_START = 2.5;

export function makeCourseState(courses) { return { courses, sel: null, try: null, nTry: 0, rec: new Map(), topT: 0, last: null }; }
const recOf = (G, id) => { if (!G.rec.has(id)) G.rec.set(id, { tries: 0, tops: 0, free: null, clean: null }); return G.rec.get(id); };

// 코스를 고른다(T 키). 하던 시도는 끝낸다(완등하지 않은 채면 '그만둠')
export function courseSelect(G, course, tick) { endTry(G, tick, '그만둠'); G.sel = course || null; G.last = null; }
// 다시 시작(R·떨어져 되돌아감 따위): 선택은 그대로, 시도만 끝낸다. 끝난 시도의 완등 표시도 지운다
export function courseReset(G, tick) { endTry(G, tick, '다시 시작'); G.last = null; }
function endTry(G, tick, why) { const T = G.try; if (!T) return; T.end = why; T.endTick = tick; G.last = T; G.try = null; G.topT = 0; }

// 계산 걸음마다 한 번. st = { tick, on(벽에 붙어 있음), pos([x,y,z] 몸 자리), hands: [{ st, box }] (box = 잡은 홀드의 상자 또는 null) }
export function courseStep(G, st, dt) {
  const held = st.hands.filter(h => h.st === 'hold' && h.box).map(h => h.box);
  if (!st.on && !held.length) {
    // 땅: 하던 시도가 있으면 끝낸다(완등했으면 '완등 뒤 내려옴', 아니면 '내려옴'). 시작 자리 가까이 가면 그 코스를 고른다
    if (G.try) endTry(G, st.tick, G.try.done ? '완등 뒤 내려옴' : '내려옴');
    let best = null; for (const C of G.courses) { const d = Math.hypot(st.pos[0] - C.startPos[0], st.pos[2] - C.startPos[2]); if (!best || d < best.d) best = { d, C }; }
    if (best && best.d < NEAR_START && best.C !== G.sel) { G.sel = best.C; G.last = null; }
    return; }
  if (!G.try && held.length) {
    // 벽에 붙음(첫 홀드를 잡음) = 새 시도. 코스는 이때의 선택으로 굳는다(없으면 코스 없는 자유 등반)
    const C = G.sel; G.try = { id: ++G.nTry, course: C, t0: st.tick, clean: !!C, cleanWhy: '', first: null, used: new Set(), done: false, doneT: 0, doneClean: false }; G.topT = 0; G.last = null; if (C) recOf(G, C.id).tries++; }
  const T = G.try; if (!T) return;
  for (const b of held) { if (T.used.has(b)) continue; T.used.add(b);
    if (!T.first) { T.first = b; if (T.clean && !(b.course === T.course.id && b.role === 'start')) { T.clean = false; T.cleanWhy = '시작 홀드가 아닌 곳에서 시작'; } }
    if (T.clean && b.course !== T.course.id) { T.clean = false; T.cleanWhy = `${b.name || '다른 홀드'}을(를) 잡음`; } }
  if (T.done || !T.course) return;
  const top = held.length === 2 && held.every(b => b.role === 'top' && b.course === T.course.id);
  G.topT = top ? G.topT + dt : 0;
  if (G.topT > TOP_T) { T.done = true; T.doneT = (st.tick - T.t0) * dt; T.doneClean = T.clean; const R = recOf(G, T.course.id); R.tops++;
    if (R.free === null || T.doneT < R.free) R.free = T.doneT; if (T.clean && (R.clean === null || T.doneT < R.clean)) R.clean = T.doneT; }
}
// 화면에 보일 것(문구는 main.js가 만든다): 선택 코스, 지금 시도(없으면 방금 끝난 시도), 그 코스의 기록
export function courseView(G) { const T = G.try || G.last, C = G.sel; return { course: C, try: T && (!C || T.course === C) ? T : null, live: !!G.try, rec: C ? recOf(G, C.id) : null }; }
