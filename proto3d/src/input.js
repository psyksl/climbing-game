// 입력: 동작 표(BIND)와 문맥. 키 이름을 코드에 고정해 쓰지 않고 이 표에서 읽는다(2D판의 원칙을 이어받음).
// 문맥: ground = 지상 이동, wall = 벽 등반(손이 턱을 잡고 있는 동안), gallery = 동작 보기, any = 언제나.
// W2부터 문맥을 실제 실행에 적용한다(전에는 겹침 표시에만 썼다):
//   - 동작은 자기 문맥이 지금 문맥일 때만 눌린 것으로 본다.
//   - 키를 누른 채 문맥이 바뀌면 그 키는 다시 누를 때까지 새 문맥의 동작을 일으키지 않는다(걷다가 잡는 순간 W가 "몸 위로"가 되지 않게).
//   - contact 동작(손발 보내기·놓기)은 시점 조작 중에는 일어나지 않는다. 시점 조작 중에 누른 채로 시점 키만 떼어도 일어나지 않는다. 이미 잡은 손은 그대로다.
//   - 포커스를 잃으면 눌린 키를 모두 뗀 것으로 본다.
// 같은 키를 두 동작에 쓰면, 두 동작이 쓰이는 문맥이 겹칠 때만 겹침이다(겹침 검사와 실제 실행이 같은 기준 = ctxOverlap).
const DEFAULT = [
  { id: 'moveF', ctx: ['ground'], keys: ['KeyW'], label: '앞으로' },
  { id: 'moveB', ctx: ['ground'], keys: ['KeyS'], label: '뒤로' },
  { id: 'moveL', ctx: ['ground'], keys: ['KeyA'], label: '왼쪽' },
  { id: 'moveR', ctx: ['ground'], keys: ['KeyD'], label: '오른쪽' },
  { id: 'run', ctx: ['ground'], keys: ['ShiftLeft'], label: '달리기(누른 채)' },
  { id: 'crouch', ctx: ['ground'], keys: ['KeyC'], label: '웅크리기(누른 채)' },
  { id: 'jump', ctx: ['ground'], keys: ['Space'], label: '모으기(누른 채) → 떼면 점프' },
  { id: 'limbL', ctx: ['ground', 'wall'], keys: ['Mouse0'], contact: true, label: '왼손 보내기(겨눈 턱으로)' },
  { id: 'limbR', ctx: ['ground', 'wall'], keys: ['Mouse2'], contact: true, label: '오른손 보내기(겨눈 턱으로)' },
  { id: 'relL', ctx: ['ground', 'wall'], keys: ['KeyQ'], contact: true, label: '왼손 놓기' },
  { id: 'relR', ctx: ['ground', 'wall'], keys: ['KeyE'], contact: true, label: '오른손 놓기' },
  { id: 'footMod', ctx: ['wall'], keys: ['ShiftLeft'], label: '누른 채 = 손 대신 발(보내기·떼기)' },
  { id: 'bodyU', ctx: ['wall'], keys: ['KeyW'], label: '몸 위로' },
  { id: 'bodyD', ctx: ['wall'], keys: ['KeyS'], label: '몸 아래로' },
  { id: 'bodyL', ctx: ['wall'], keys: ['KeyA'], label: '몸 왼쪽' },
  { id: 'bodyR', ctx: ['wall'], keys: ['KeyD'], label: '몸 오른쪽' },
  { id: 'camRotate', ctx: ['any'], keys: ['AltLeft', 'AltRight'], label: '누른 채 마우스 = 시점 돌리기' },
  { id: 'camZoom', ctx: ['any'], keys: ['Wheel'], label: '시점 가까이·멀리' },
  { id: 'reset', ctx: ['any'], keys: ['KeyR'], label: '처음 자리로' },
  { id: 'wallStart', ctx: ['any'], keys: ['KeyT'], label: '작은 벽 앞으로' },
  { id: 'bones', ctx: ['any'], keys: ['KeyB'], label: '뼈대 보기' },
  { id: 'slow', ctx: ['any'], keys: ['KeyN'], label: '느리게(0.25배)' },
  { id: 'motionMode', ctx: ['any'], keys: ['KeyM'], label: '모션 바꾸기(캡처 ↔ 자작)' },
  { id: 'gallery', ctx: ['any'], keys: ['KeyG'], label: '동작 보기 켬·끔' },
  { id: 'galPrev', ctx: ['gallery'], keys: ['BracketLeft'], label: '동작 보기: 앞 동작' },
  { id: 'galNext', ctx: ['gallery'], keys: ['BracketRight'], label: '동작 보기: 다음 동작' },
  { id: 'galCatPrev', ctx: ['gallery'], keys: ['Minus'], label: '동작 보기: 앞 지형' },
  { id: 'galCatNext', ctx: ['gallery'], keys: ['Equal'], label: '동작 보기: 다음 지형' },
  { id: 'galProps', ctx: ['gallery'], keys: ['KeyH'], label: '동작 보기: 지형 조각 보임·숨김' },
];
export const BIND = DEFAULT.map(b => ({ ...b, keys: b.keys.slice(), ctx: b.ctx.slice() }));
const STORE = 'p3dBind_v1';
const ctxOverlap = (a, b) => a.includes('any') || b.includes('any') || a.some(c => b.includes(c));
export function conflicts() { const out = []; for (let i = 0; i < BIND.length; i++) for (let j = i + 1; j < BIND.length; j++) { const a = BIND[i], b = BIND[j]; for (const k of a.keys) if (b.keys.includes(k) && ctxOverlap(a.ctx, b.ctx)) out.push({ key: k, a: a.id, b: b.id }); } return out; }
export const keyName = c => ({ Space: 'Space', ShiftLeft: 'L Shift', AltLeft: 'Alt', AltRight: 'Alt', Wheel: '휠', BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Mouse0: '좌클릭', Mouse1: '휠클릭', Mouse2: '우클릭', Mouse3: '옆 버튼 1', Mouse4: '옆 버튼 2' }[c] || c.replace(/^Key/, ''));
// 키 다시 정하기(설정 화면은 아직 없다. 저장·복원·겹침 검사까지의 경로만 잇는다)
export function setKeys(id, keys, save = true) { const b = BIND.find(q => q.id === id); if (!b) return false; b.keys = keys.slice(); if (save) try { localStorage.setItem(STORE, JSON.stringify(Object.fromEntries(BIND.map(q => [q.id, q.keys])))); } catch (e) { return true; } return true; }
export function resetKeys() { BIND.forEach((b, i) => { b.keys = DEFAULT[i].keys.slice(); }); try { localStorage.removeItem(STORE); } catch (e) { return; } }
export function loadKeys() { try { const o = JSON.parse(localStorage.getItem(STORE) || 'null'); if (o) for (const b of BIND) if (Array.isArray(o[b.id])) b.keys = o[b.id].filter(k => typeof k === 'string'); } catch (e) { return; } }

export function makeInput(el) {
  // down: 키 → 누른 순간의 { mode, cam }. pressed: 이번 화면 프레임에 새로 눌린 키
  const down = new Map(), pressed = new Map(), st = { mdx: 0, mdy: 0, wheel: 0, alt: false, mx: 0, my: 0, mode: 'ground', has: false };
  const camNow = () => BIND.find(q => q.id === 'camRotate').keys.some(k => down.has(k));
  const press = code => { if (!down.has(code)) { const rec = { mode: st.mode, cam: camNow() }; pressed.set(code, rec); down.set(code, rec); } };
  addEventListener('keydown', e => { if (e.code.startsWith('Alt') || e.code === 'Space' || e.code === 'Tab') e.preventDefault(); press(e.code); });
  addEventListener('keyup', e => { if (e.code.startsWith('Alt')) e.preventDefault(); down.delete(e.code); });
  const drop = () => { down.clear(); pressed.clear(); };
  addEventListener('blur', drop); document.addEventListener('visibilitychange', () => { if (document.hidden) drop(); });
  el.addEventListener('mousemove', e => { st.mdx += e.movementX || 0; st.mdy += e.movementY || 0; st.alt = e.altKey; st.mx = e.clientX; st.my = e.clientY; st.has = true; });
  el.addEventListener('mousedown', e => { e.preventDefault(); st.mx = e.clientX; st.my = e.clientY; st.has = true; press(`Mouse${e.button}`); });
  addEventListener('mouseup', e => { down.delete(`Mouse${e.button}`); });
  el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('wheel', e => { e.preventDefault(); st.wheel += Math.sign(e.deltaY); }, { passive: false });
  // 그 키 누름이 이 동작을 일으키는가: 문맥이 맞고, 누른 뒤로 문맥이 바뀌지 않았고, 접촉 명령이면 시점 조작과 겹치지 않았을 때
  const active = (b, rec) => !!rec && (b.ctx.includes('any') || (b.ctx.includes(st.mode) && rec.mode === st.mode)) && !(b.contact && (rec.cam || camNow()));
  const isDown = id => { const b = BIND.find(q => q.id === id); return !!b && b.keys.some(k => active(b, down.get(k))); };
  const wasPressed = id => { const b = BIND.find(q => q.id === id); return !!b && b.keys.some(k => active(b, pressed.get(k))); };
  return {
    down, isDown, wasPressed, st, camNow,
    setMode(m) { st.mode = m; },
    endFrame() { pressed.clear(); st.mdx = 0; st.mdy = 0; st.wheel = 0; },
  };
}
