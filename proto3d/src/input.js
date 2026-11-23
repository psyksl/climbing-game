// 입력: 동작 표(BIND)와 문맥. 키 이름을 코드에 고정해 쓰지 않고 이 표에서 읽는다(2D판의 원칙을 이어받음).
// 문맥: ground = 지상 이동, wall = 벽 등반(벽 문맥인 동안), view = 시점 보기(조작 멈춤), gallery = 동작 보기, any = 언제나.
//   - 동작은 자기 문맥이 지금 문맥일 때만 눌린 것으로 본다(isDown·wasPressed·wasReleased가 한곳에서 정한다).
//   - 키를 누른 채 문맥이 바뀌면 그 키는 다시 누를 때까지 새 문맥의 동작을 일으키지 않는다.
//   - 포커스를 잃으면 눌린 키를 모두 뗀 것으로 본다.
// p3d-0.6.0(사용자 의견): Alt를 쓰지 않는다(브라우저 메뉴로 넘어간다). 시점 돌리기 = 지상에서는 우클릭을 누른 채 끌기, 벽에서는 시점 보기 모드(V)에 들어가서 우클릭 끌기.
//   시점 보기 모드에서는 지상·벽 동작이 모두 듣지 않는다(문맥이 view라서) → 시점을 보다가 실수로 뛰거나 손을 놓지 않는다.
//   우클릭은 지상에서 "끌기 = 시점"과 "짧게 누르기 = 오른손"을 나눠 쓴다(drag 표시가 있는 동작과 없는 동작은 같은 단추여도 겹침이 아니다).
// 같은 키를 두 동작에 쓰면, 두 동작이 쓰이는 문맥이 겹칠 때만 겹침이다(겹침 검사와 실제 실행이 같은 기준 = ctxOverlap).
// dev = 개발·시험용 키(조작 안내에서 접어 둔다).
const DEFAULT = [
  { id: 'moveF', ctx: ['ground'], keys: ['KeyW'], label: '앞으로' },
  { id: 'moveB', ctx: ['ground'], keys: ['KeyS'], label: '뒤로' },
  { id: 'moveL', ctx: ['ground'], keys: ['KeyA'], label: '왼쪽' },
  { id: 'moveR', ctx: ['ground'], keys: ['KeyD'], label: '오른쪽' },
  { id: 'run', ctx: ['ground'], keys: ['ShiftLeft'], label: '달리기(누른 채)' },
  // p3d-0.8.1(GPT 결정): 달리기는 발 지정을 겸하지 않는다. 지상에서 발부터 올리려면 따로 둔 이 동작을 누른 채 클릭한다(벽에서는 footMod)
  // p3d-0.8.3(GPT 답): 이름은 "발 선택". 지상(footGround)과 벽(footMod)은 같은 논리 동작이다. 기본 키는 그대로(지상 X, 벽 Shift)이고, 둘 다 X로 쓰는 시범 프로필은 주소에 ?footx(저장하지 않는다)
  { id: 'footGround', ctx: ['ground'], keys: ['KeyX'], label: '발 선택(누른 채 클릭 = 손 대신 발 · 땅에 서서 발부터 올리기)' },
  { id: 'crouch', ctx: ['ground'], keys: ['KeyC'], label: '웅크리기(누른 채)' },
  { id: 'jump', ctx: ['ground', 'wall'], keys: ['Space'], label: '점프(오래 누르면 높이). 벽에서는 A/D·W·S로 방향' },
  { id: 'limbL', ctx: ['ground', 'wall'], keys: ['Mouse0'], contact: true, label: '왼손 보내기(겨눈 턱으로)' },
  { id: 'limbR', ctx: ['ground', 'wall'], keys: ['Mouse2'], contact: true, label: '오른손 보내기(지상에서는 짧게 누르기)' },
  { id: 'relL', ctx: ['ground', 'wall'], keys: ['KeyQ'], contact: true, label: '왼손 놓기' },
  { id: 'relR', ctx: ['ground', 'wall'], keys: ['KeyE'], contact: true, label: '오른손 놓기' },
  { id: 'footMod', ctx: ['wall'], keys: ['ShiftLeft'], label: '발 선택(누른 채 클릭·놓기 = 손 대신 발)' },
  { id: 'bodyU', ctx: ['wall'], keys: ['KeyW'], label: '몸 위로' },
  { id: 'bodyD', ctx: ['wall'], keys: ['KeyS'], label: '몸 아래로' },
  { id: 'bodyL', ctx: ['wall'], keys: ['KeyA'], label: '몸 왼쪽(화면 기준)' },
  { id: 'bodyR', ctx: ['wall'], keys: ['KeyD'], label: '몸 오른쪽(화면 기준)' },
  { id: 'camDrag', ctx: ['ground', 'view'], keys: ['Mouse2'], drag: true, label: '누른 채 끌기 = 시점 돌리기' },
  { id: 'viewMode', ctx: ['any'], keys: ['KeyV'], label: '시점 보기 모드(조작 멈춤) 켬·끔' },
  { id: 'camZoom', ctx: ['any'], keys: ['Wheel'], label: '시점 가까이·멀리' },
  { id: 'handMode', ctx: ['any'], keys: ['KeyH'], label: '손 조작 방식 바꾸기(눌러 보내기 ↔ 누르는 동안 뻗기)' },
  { id: 'footAssist', ctx: ['any'], keys: ['KeyF'], label: '발 보조 켬·끔' },
  { id: 'grabAssist', ctx: ['any'], keys: ['KeyU'], label: '잡기 보정 켬·끔' }, // p3d-0.11.4(임시 키)
  { id: 'wallRest', ctx: ['any'], keys: ['KeyJ'], dev: true, label: '실험: 벽 딛기(매달리면 발을 벽에 대고 버팀) 켬·끔 · 기본 끔' },
  { id: 'poseMode', ctx: ['any'], keys: ['KeyO'], dev: true, label: '비교: 몸 자세(전신 자세 풀이 ↔ 옛 규칙 0.10.4) · 기본 전신 자세 풀이' },
  { id: 'wallStart', ctx: ['any'], keys: ['KeyT'], label: '작은 벽 앞에서 시작' },
  { id: 'reset', ctx: ['any'], keys: ['KeyR'], label: '처음 자리로' },
  { id: 'helpAll', ctx: ['any'], keys: ['KeyK'], label: '조작표 모두 보기·접기' },
  { id: 'diag', ctx: ['any'], keys: ['KeyI'], dev: true, label: '진단 정보(하중·오차·실행 성능)' },
  { id: 'bones', ctx: ['any'], keys: ['KeyB'], dev: true, label: '뼈대 보기' },
  { id: 'slow', ctx: ['any'], keys: ['KeyN'], dev: true, label: '느리게(0.25배)' },
  { id: 'motionMode', ctx: ['any'], keys: ['KeyM'], dev: true, label: '모션 바꾸기(캡처 ↔ 자작)' },
  { id: 'gallery', ctx: ['any'], keys: ['KeyG'], dev: true, label: '동작 보기 켬·끔' },
  { id: 'galPrev', ctx: ['gallery'], keys: ['BracketLeft'], dev: true, label: '동작 보기: 앞 동작' },
  { id: 'galNext', ctx: ['gallery'], keys: ['BracketRight'], dev: true, label: '동작 보기: 다음 동작' },
  { id: 'galCatPrev', ctx: ['gallery'], keys: ['Minus'], dev: true, label: '동작 보기: 앞 지형' },
  { id: 'galCatNext', ctx: ['gallery'], keys: ['Equal'], dev: true, label: '동작 보기: 다음 지형' },
  { id: 'galProps', ctx: ['gallery'], keys: ['Digit0'], dev: true, label: '동작 보기: 지형 조각 보임·숨김' },
];
export const BIND = DEFAULT.map(b => ({ ...b, keys: b.keys.slice(), ctx: b.ctx.slice() }));
const STORE = 'p3dBind_v2';
const ctxOverlap = (a, b) => a.includes('any') || b.includes('any') || a.some(c => b.includes(c));
export function conflicts() { const out = []; for (let i = 0; i < BIND.length; i++) for (let j = i + 1; j < BIND.length; j++) { const a = BIND[i], b = BIND[j]; if (!!a.drag !== !!b.drag) continue; for (const k of a.keys) if (b.keys.includes(k) && ctxOverlap(a.ctx, b.ctx)) out.push({ key: k, a: a.id, b: b.id }); } return out; }
export const keyName = c => ({ Space: 'Space', ShiftLeft: 'L Shift', Wheel: '휠', BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Mouse0: '좌클릭', Mouse1: '휠클릭', Mouse2: '우클릭', Mouse3: '옆 버튼 1', Mouse4: '옆 버튼 2' }[c] || c.replace(/^Key|^Digit/, ''));
// 키 다시 정하기(설정 화면은 아직 없다. 저장·복원·겹침 검사까지의 경로만 잇는다)
export function setKeys(id, keys, save = true) { const b = BIND.find(q => q.id === id); if (!b) return false; b.keys = keys.slice(); if (save) try { localStorage.setItem(STORE, JSON.stringify(Object.fromEntries(BIND.map(q => [q.id, q.keys])))); } catch (e) { return true; } return true; }
export function resetKeys() { BIND.forEach((b, i) => { b.keys = DEFAULT[i].keys.slice(); }); try { localStorage.removeItem(STORE); } catch (e) { return; } }
export function loadKeys() { try { const o = JSON.parse(localStorage.getItem(STORE) || 'null'); if (o) for (const b of BIND) if (Array.isArray(o[b.id])) b.keys = o[b.id].filter(k => typeof k === 'string'); } catch (e) { return; } }
export const TAP = { PX: 6, T: 0.35 };

export function makeInput(el) {
  // down: 키 → 누른 순간의 { mode, x, y, t, moved }. pressed·released: 이번 화면 프레임에 새로 눌린·떼어진 키
  const down = new Map(), pressed = new Map(), released = new Map(), st = { mdx: 0, mdy: 0, wheel: 0, mx: 0, my: 0, moved: false, mode: 'ground', has: false };
  // fresh = 실제로 새로 도착한 누름(마우스 단추의 mousedown, 반복이 아닌 keydown). 그 키가 아직 "눌린 채"로 남아 있으면(밖에서 떼어 뗌을 듣지 못했거나, 취소로 버린 누름이 남아 있거나)
  // 옛 기록을 치우고 새 누름으로 받는다(p3d-0.8.4, GPT P1: 취소 뒤 화면 밖에서 떼고 돌아와 누른 첫 클릭이 사라졌다). 키보드의 자동 반복(e.repeat)은 새 누름이 아니다
  const press = (code, fresh = false) => { const old = down.get(code); if (old && fresh) { if (!old.dead) { old.dur = (performance.now() - old.t) / 1000; released.set(code, old); } down.delete(code); } if (!down.has(code)) { const rec = { mode: st.mode, x: st.mx, y: st.my, t: performance.now(), moved: 0, with: new Map([...down].map(([c, r]) => [c, r.mode])) }; pressed.set(code, rec); down.set(code, rec); } }; // with = 이 키를 누른 순간(이벤트 시각)에 눌려 있던 다른 키와 그 키를 누른 문맥
  const lift = code => { const rec = down.get(code); if (rec) { rec.dur = (performance.now() - rec.t) / 1000; released.set(code, rec); down.delete(code); } };
  addEventListener('keydown', e => { if (e.code === 'Space' || e.code === 'Tab') e.preventDefault(); press(e.code, !e.repeat); });
  addEventListener('keyup', e => { lift(e.code); });
  const drop = () => { down.clear(); pressed.clear(); released.clear(); };
  addEventListener('blur', drop); document.addEventListener('visibilitychange', () => { if (document.hidden) drop(); });
  // 돌아왔을 때의 단추 상태(e.buttons): 눌린 것으로 남아 있는 마우스 단추가 실제로는 떼어져 있으면 그 기록을 치운다. 버린 누름(dead)은 조용히, 살아 있는 누름은 보통의 뗌으로.
  // 누른 채 돌아온 것(buttons에 그 단추가 남아 있음)은 그대로 둔다 — 버린 누름은 버린 채로 남아 새 명령이 되지 않는다
  const MASK = [1, 4, 2, 8, 16], syncButtons = e => { if (typeof e.buttons !== 'number') return; for (let b = 0; b < 5; b++) { const code = `Mouse${b}`, rec = down.get(code); if (rec && !(e.buttons & MASK[b])) { if (rec.dead) down.delete(code); else lift(code); } } };
  document.documentElement.addEventListener('mouseenter', syncButtons);
  el.addEventListener('mousemove', e => { st.mdx += e.movementX || 0; st.mdy += e.movementY || 0; st.mx = e.clientX; st.my = e.clientY; st.has = true; st.moved = true; for (const rec of down.values()) rec.moved = Math.max(rec.moved, Math.hypot(e.clientX - rec.x, e.clientY - rec.y)); syncButtons(e); });
  el.addEventListener('mousedown', e => { e.preventDefault(); st.mx = e.clientX; st.my = e.clientY; st.has = true; press(`Mouse${e.button}`, true); });
  addEventListener('mouseup', e => { lift(`Mouse${e.button}`); });
  el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('wheel', e => { e.preventDefault(); st.wheel += Math.sign(e.deltaY); }, { passive: false });
  // 그 키 누름이 이 동작을 일으키는가: 문맥이 맞고, 누른 뒤로 문맥이 바뀌지 않았을 때
  const active = (b, rec) => !!rec && !rec.dead && (b.ctx.includes('any') || (b.ctx.includes(st.mode) && rec.mode === st.mode));
  const find = id => BIND.find(q => q.id === id);
  const isDown = id => { const b = find(id); return !!b && b.keys.some(k => active(b, down.get(k))); };
  const wasPressed = id => { const b = find(id); return !!b && b.keys.some(k => active(b, pressed.get(k))); };
  const wasReleased = id => { const b = find(id); return !!b && b.keys.some(k => active(b, released.get(k))); };
  // 이 동작의 키를 누른 순간에 다른 동작(mod)의 키가 눌려 있었는가(p3d-0.8.2). 화면 프레임이 아니라 이벤트 시각으로 본다:
  // 한 프레임 안에 "발 지정 키 누름 → 단추 누름 → 발 지정 키 뗌"이 다 들어오면 프레임 끝의 상태로는 순서를 잃는다(느린 화면에서 발 명령이 손 명령으로 나갔다)
  const pressedWith = (id, modId) => { const b = find(id), m = find(modId); return !!b && !!m && b.keys.some(k => { const r = pressed.get(k); return active(b, r) && (m.ctx.includes('any') || m.ctx.includes(r.mode)) && m.keys.some(k2 => r.with.get(k2) === r.mode); }); };
  // 끌고 있는가(누른 뒤 TAP.PX 넘게 움직임) / 짧게 눌렀다 뗐는가(움직이지 않고 TAP.T초 안에 뗌)
  const dragging = id => { const b = find(id); return !!b && b.keys.some(k => { const r = down.get(k); return active(b, r) && r.moved > TAP.PX; }); };
  const tapped = id => { const b = find(id); return !!b && b.keys.some(k => { const r = released.get(k); return active(b, r) && r.moved <= TAP.PX && r.dur <= TAP.T; }); };
  // 그 동작의 지금 눌려 있는(또는 이번 프레임에 눌렸다 떼어진) 누름을 버린다(p3d-0.8.3, 취소): 아직 읽지 않은 누름도 명령이 되지 않고, 누른 채 돌아와도 같은 누름이 다시 쓰이지 않는다.
  // 단추를 뗐다가 다시 눌러야 새 누름이다(눌린 채인 키는 press가 새 기록을 만들지 않는다)
  const kill = id => { const b = find(id); let n = 0; if (b) for (const k of b.keys) for (const m of [down, pressed, released]) { const r = m.get(k); if (r && !r.dead) { r.dead = true; n++; } } return n > 0; };
  return {
    down, isDown, wasPressed, wasReleased, pressedWith, dragging, tapped, kill, st,
    setMode(m) { st.mode = m; },
    endFrame() { pressed.clear(); released.clear(); st.mdx = 0; st.mdy = 0; st.wheel = 0; st.moved = false; },
  };
}
