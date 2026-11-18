// 입력 설정: 모든 동작을 사용자가 키보드 키나 마우스 버튼에 직접 지정한다(동작마다 두 칸: 주·보조). 브라우저에 저장된다.
// 코드 형식: 키보드는 KeyboardEvent.code('KeyQ', 'Space', 'ArrowUp' …), 마우스는 'Mouse0'(좌) 'Mouse1'(휠) 'Mouse2'(우) 'Mouse3'·'Mouse4'(옆 버튼)
'use strict';
const BIND = (() => {
  const STORE = 'climbBind_v1';
  // hm: 손 선택 방식(1 = 버튼마다 손이 정해짐, 2 = 게임이 추천하는 손). 없으면 두 방식 공통
  const ACTIONS = [
    { id: 'sendL', g: '손', hm: 1, label: '왼손 보내기 · (모으는 중) 왼손 놓기 지정/취소', def: ['Mouse0', 'KeyQ'] },
    { id: 'sendR', g: '손', hm: 1, label: '오른손 보내기 · (모으는 중) 오른손 놓기 지정/취소', def: ['Mouse2', 'KeyE'] },
    { id: 'sendBest', g: '손', hm: 2, label: '추천 손 보내기 · (모으는 중) 추천 손 놓기 지정/취소', def: ['Mouse0', 'KeyQ'] },
    { id: 'sendOther', g: '손', hm: 2, label: '다른 손 보내기 · (모으는 중) 다른 손 놓기 지정/취소', def: ['Mouse2', 'KeyE'] },
    { id: 'markHand', g: '손', label: '놓을 손 미리 지정 (누른 채 손 입력 = 지정/취소, 뛰기 전까지 잡고 있음)', def: ['KeyC', null] },
    { id: 'foot', g: '발', label: '발 직접 조작 (누른 채 손 입력 = 발)', def: ['ShiftLeft', 'ShiftRight'] },
    { id: 'power', g: '몸', label: '힘 모으기 (떼면 던지기)', def: ['Space', null] },
    { id: 'cancel', g: '몸', label: '취소 (모으는 중: 놓을 손 지정 모두 취소 / 평소: 든 손발 힘 빼기)', def: ['KeyX', null] },
    { id: 'moveUp', g: '몸통', label: '몸통 위로 (누른 채, 붙은 팔다리로 당기고 밀기)', def: ['KeyW', null] },
    { id: 'moveDown', g: '몸통', label: '몸통 아래로 (누른 채)', def: ['KeyS', null] },
    { id: 'moveLeft', g: '몸통', label: '몸통 왼쪽으로 (누른 채)', def: ['KeyA', null] },
    { id: 'moveRight', g: '몸통', label: '몸통 오른쪽으로 (누른 채)', def: ['KeyD', null] },
    { id: 'aimUp', g: '조준', label: '조준점 위로', def: ['ArrowUp', null] },
    { id: 'aimDown', g: '조준', label: '조준점 아래로', def: ['ArrowDown', null] },
    { id: 'aimLeft', g: '조준', label: '조준점 왼쪽으로', def: ['ArrowLeft', null] },
    { id: 'aimRight', g: '조준', label: '조준점 오른쪽으로', def: ['ArrowRight', null] },
    { id: 'aimSlow', g: '조준', label: '조준점 천천히 (누른 채)', def: ['ControlLeft', null] },
    { id: 'handMode', g: '보조', label: '손 선택 방식 바꾸기 (1 ↔ 2)', def: ['KeyH', null] },
    { id: 'assistRange', g: '보조', label: '잡기 보조 범위 (커서 근처 ↔ 턱 전체)', def: ['KeyB', null] },
    { id: 'assist', g: '보조', label: '닿으면 잡기 켬·끔', def: ['KeyV', null] },
    { id: 'autoFeet', g: '보조', label: '자동 발 켬·끔', def: ['KeyF', null] },
    { id: 'autoShift', g: '보조', label: '자동 체중 이동 켬·끔', def: ['KeyG', null] },
    { id: 'log', g: '보조', label: '플레이 기록 보기', def: ['KeyL', null] },
    { id: 'reset', g: '실험실', label: '같은 자세로 다시', def: ['KeyR', null] },
    { id: 'scheme', g: '실험실', label: '조작 방식 바꾸기 (D·A·B·C안)', def: ['Tab', null] },
    { id: 'st1', g: '실험실', label: '시작 자세 1 · 두 손 매달리기', def: ['Digit1', null] },
    { id: 'st2', g: '실험실', label: '시작 자세 2 · 한 손 매달리기', def: ['Digit2', null] },
    { id: 'st3', g: '실험실', label: '시작 자세 3 · 발판 위 웅크리기', def: ['Digit3', null] },
    { id: 'st4', g: '실험실', label: '시작 자세 4 · 건너편 한 손', def: ['Digit4', null] },
    { id: 'st5', g: '실험실', label: '시작 자세 5 · 반동 연습', def: ['Digit5', null] },
    { id: 'slow', g: '실험실', label: '절반 속도', def: ['Digit6', null] },
    { id: 'couple', g: '실험실', label: '도약 연결 켬·끔 (A·B·C안 비교용)', def: ['Digit7', null] },
    { id: 'layout', g: '실험실', label: '연습 배치 (건너편 턱 18px 가깝게)', def: ['Digit8', null] },
    { id: 'phys', g: '실험실', label: '물리 v0.6 ↔ v0.4', def: ['Digit9', null] },
    { id: 'settings', g: '실험실', label: '키 설정 열기·닫기', def: ['Escape', 'Digit0'] },
  ];
  const BY = Object.fromEntries(ACTIONS.map(a => [a.id, a]));
  let map = {};
  function defaults() { map = Object.fromEntries(ACTIONS.map(a => [a.id, [a.def[0] || null, a.def[1] || null]])); }
  function load() {
    defaults();
    try { const s = typeof localStorage !== 'undefined' && JSON.parse(localStorage.getItem(STORE) || 'null'); if (s) for (const id in s) if (map[id] && Array.isArray(s[id])) map[id] = [s[id][0] || null, s[id][1] || null]; } catch (e) {}
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(map)); return true; } catch (e) { return false; } }
  function resetAll() { defaults(); save(); }
  function set(id, slot, code) { map[id][slot] = code; save(); }
  const get = id => map[id] || [null, null];
  // 같은 입력을 쓰는 동작들(같은 손 선택 방식에서 함께 쓰이는 것끼리만). "발 + 손 입력"처럼 의도된 조합은 겹침이 아니다
  function conflicts(hm) {
    const use = {};
    for (const a of ACTIONS) { if (a.hm && a.hm !== hm) continue; for (const c of map[a.id]) if (c) (use[c] = use[c] || []).push(a.id); }
    const out = {}; for (const c in use) if (use[c].length > 1) for (const id of use[c]) (out[id] = out[id] || []).push(...use[c].filter(x => x !== id));
    return out;
  }
  // 엔진 입력(raw)에 대해: 지금 눌려 있나 / 이번 프레임에 새로 눌렸나
  const mouseBtn = c => c && c.startsWith('Mouse') ? +c.slice(5) : -1;
  function down(id, raw) { for (const c of get(id)) { if (!c) continue; const b = mouseBtn(c); if (b >= 0 ? raw.mouse.down[b] : raw.key(c)) return true; } return false; }
  function pressed(id, raw) { for (const c of get(id)) { if (!c) continue; const b = mouseBtn(c); if (b >= 0 ? raw.clicks.some(k => k.button === b) : raw.pressed(c)) return true; } return false; }
  // 마우스 버튼으로 눌렸고 그 순간 Shift가 눌려 있었나(Shift를 빨리 떼도 발 조작으로 인식하기 위해)
  function pressedWithShift(id, raw) { for (const c of get(id)) { const b = mouseBtn(c); if (b >= 0 && raw.clicks.some(k => k.button === b && k.shift)) return true; } return false; }
  const NAMES = { Mouse0: '좌클릭', Mouse1: '휠 클릭', Mouse2: '우클릭', Mouse3: '마우스 뒤', Mouse4: '마우스 앞', Space: 'Space', Escape: 'Esc', Tab: 'Tab', Enter: 'Enter', Backspace: 'Backspace',
    ShiftLeft: '왼Shift', ShiftRight: '오른Shift', ControlLeft: '왼Ctrl', ControlRight: '오른Ctrl', AltLeft: '왼Alt', AltRight: '오른Alt', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\', BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Backquote: '`', CapsLock: 'CapsLock' };
  function name(c) { if (!c) return '—'; if (NAMES[c]) return NAMES[c]; if (c.startsWith('Key')) return c.slice(3); if (c.startsWith('Digit')) return c.slice(5); if (c.startsWith('Numpad')) return '숫자패드 ' + c.slice(6); return c; }
  const label = id => { const b = get(id).filter(Boolean); return b.length ? b.map(name).join(' / ') : '없음'; };
  const first = id => name(get(id).find(Boolean) || null);
  load();
  return { ACTIONS, BY, load, save, resetAll, set, get, conflicts, down, pressed, pressedWithShift, name, label, first, STORE };
})();
if (typeof module !== 'undefined') module.exports = BIND;
