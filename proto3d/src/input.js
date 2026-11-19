// 입력: 동작 표(BIND)와 문맥. 키 이름을 코드에 고정해 쓰지 않고 이 표에서 읽는다(2D판의 원칙을 이어받음).
// 문맥: ground = 지상 이동, camera = 시점(언제나), wall = 벽 등반(W2에서 쓴다), gallery = 동작 보기, any = 언제나.
// 같은 키를 두 동작에 쓰면, 두 동작이 쓰이는 문맥이 겹칠 때만 겹침이다(겹침 검사와 실제 실행이 같은 기준 = ctxOverlap).
export const BIND = [
  { id: 'moveF', ctx: ['ground'], keys: ['KeyW'], label: '앞으로' },
  { id: 'moveB', ctx: ['ground'], keys: ['KeyS'], label: '뒤로' },
  { id: 'moveL', ctx: ['ground'], keys: ['KeyA'], label: '왼쪽' },
  { id: 'moveR', ctx: ['ground'], keys: ['KeyD'], label: '오른쪽' },
  { id: 'run', ctx: ['ground'], keys: ['ShiftLeft'], label: '달리기(누른 채)' },
  { id: 'crouch', ctx: ['ground'], keys: ['KeyC'], label: '웅크리기(누른 채)' },
  { id: 'jump', ctx: ['ground'], keys: ['Space'], label: '모으기(누른 채) → 떼면 점프' },
  { id: 'camRotate', ctx: ['any'], keys: ['AltLeft', 'AltRight'], label: '누른 채 마우스 = 시점 돌리기' },
  { id: 'camZoom', ctx: ['any'], keys: ['Wheel'], label: '시점 가까이·멀리' },
  { id: 'reset', ctx: ['any'], keys: ['KeyR'], label: '처음 자리로' },
  { id: 'bones', ctx: ['any'], keys: ['KeyB'], label: '뼈대 보기' },
  { id: 'slow', ctx: ['any'], keys: ['KeyN'], label: '느리게(0.25배)' },
  { id: 'motionMode', ctx: ['any'], keys: ['KeyM'], label: '모션 바꾸기(캡처 ↔ 자작)' },
  { id: 'gallery', ctx: ['any'], keys: ['KeyG'], label: '동작 보기 켬·끔' },
  { id: 'galPrev', ctx: ['gallery'], keys: ['BracketLeft'], label: '동작 보기: 앞 동작' },
  { id: 'galNext', ctx: ['gallery'], keys: ['BracketRight'], label: '동작 보기: 다음 동작' },
  { id: 'galCatPrev', ctx: ['gallery'], keys: ['Minus'], label: '동작 보기: 앞 분류' },
  { id: 'galCatNext', ctx: ['gallery'], keys: ['Equal'], label: '동작 보기: 다음 분류' },
];
const ctxOverlap = (a, b) => a.includes('any') || b.includes('any') || a.some(c => b.includes(c));
export function conflicts() { const out = []; for (let i = 0; i < BIND.length; i++) for (let j = i + 1; j < BIND.length; j++) { const a = BIND[i], b = BIND[j]; for (const k of a.keys) if (b.keys.includes(k) && ctxOverlap(a.ctx, b.ctx)) out.push({ key: k, a: a.id, b: b.id }); } return out; }
export const keyName = c => ({ Space: 'Space', ShiftLeft: 'L Shift', AltLeft: 'Alt', AltRight: 'Alt', Wheel: '휠', BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=' }[c] || c.replace(/^Key/, ''));

export function makeInput(el) {
  const down = new Set(), pressed = new Set(), st = { mdx: 0, mdy: 0, wheel: 0, alt: false };
  addEventListener('keydown', e => { if (e.code.startsWith('Alt') || e.code === 'Space' || e.code === 'Tab') e.preventDefault(); if (!down.has(e.code)) pressed.add(e.code); down.add(e.code); });
  addEventListener('keyup', e => { if (e.code.startsWith('Alt')) e.preventDefault(); down.delete(e.code); });
  addEventListener('blur', () => down.clear()); // 포커스를 잃으면 눌린 키가 남지 않게
  el.addEventListener('mousemove', e => { st.mdx += e.movementX || 0; st.mdy += e.movementY || 0; st.alt = e.altKey; });
  el.addEventListener('wheel', e => { e.preventDefault(); st.wheel += Math.sign(e.deltaY); }, { passive: false });
  const isDown = id => { const b = BIND.find(q => q.id === id); return !!b && b.keys.some(k => down.has(k)); };
  const wasPressed = id => { const b = BIND.find(q => q.id === id); return !!b && b.keys.some(k => pressed.has(k)); };
  return {
    down, isDown, wasPressed, st,
    endFrame() { pressed.clear(); st.mdx = 0; st.mdy = 0; st.wheel = 0; },
  };
}
