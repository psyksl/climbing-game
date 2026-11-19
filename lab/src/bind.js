// 입력 설정: 모든 동작을 사용자가 키보드 키나 마우스 버튼에 직접 지정한다(동작마다 두 칸: 주·보조). 브라우저에 저장된다.
// 코드 형식: 키보드는 KeyboardEvent.code('KeyQ', 'Space', 'ArrowUp' …), 마우스는 'Mouse0'(좌) 'Mouse1'(휠) 'Mouse2'(우) 'Mouse3'·'Mouse4'(옆 버튼)
'use strict';
const BIND = (() => {
  const STORE = 'climbBind_v1';
  // hm: 손 선택 방식(1 = 버튼마다 손이 정해짐, 2 = 게임이 추천하는 손). 없으면 두 방식 공통
  // ctx: 'replay' = 리플레이 도구(아래 PHASES의 rp). 동작마다 쓰이는 단계는 아래 phasesOf가 한곳에서 정한다(겹침 검사와 실제 실행이 같은 기준을 쓴다)
  const ACTIONS = [
    { id: 'sendL', g: '손', hm: 1, label: '왼손 보내기 · (모으는 중) 왼손 놓기 지정/취소', def: ['Mouse0', 'KeyQ'] },
    { id: 'sendR', g: '손', hm: 1, label: '오른손 보내기 · (모으는 중) 오른손 놓기 지정/취소', def: ['Mouse2', 'KeyE'] },
    { id: 'sendBest', g: '손', hm: 2, label: '추천 손 보내기 · (모으는 중) 추천 손 놓기 지정/취소', def: ['Mouse0', 'KeyQ'] },
    { id: 'sendOther', g: '손', hm: 2, label: '다른 손 보내기 · (모으는 중) 다른 손 놓기 지정/취소', def: ['Mouse2', 'KeyE'] },
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
    { id: 'autoLoad', g: '보조', label: '모을 때 자동 싣기 켬·끔 (관절 몸 비교용: 끔 = Space는 아래로 웅크리기만, 좌우는 A/D)', def: ['KeyN', null] },
    { id: 'log', g: '연습', label: '로그 켬·끔 (경고·점프·결과가 시각과 함께 남는 칸. 차트 구역 옆)', def: ['KeyL', null] },
    { id: 'demo', g: '연습', label: '시범 보기 (지금 연습 과제의 시범을 재생)', def: ['KeyP', null] },
    { id: 'lessonNext', g: '연습', label: '다음 연습 과제 (끝까지 가면 자유 연습)', def: ['KeyO', null] },
    { id: 'chart', g: '연습', label: '입력 타임라인 구역 켬·끔 (화면을 차트 구역과 플레이 구역으로 나눈다)', def: ['KeyT', null] },
    { id: 'dock', g: '연습', label: '차트 구역 자리 옮기기 (아래 → 왼쪽 → 위 → 오른쪽. 마우스로 구역을 끌어다 놓아도 된다)', def: ['KeyJ', null] },
    { id: 'viewMenu', g: '연습', label: '보기 설정 열기·닫기 (연습을 돕는 표시들을 체크박스로 켜고 끈다. 다시 누르면 닫힌다)', def: ['Tab', null] },
    { id: 'viewFit', g: '연습', label: '게임 화면 맞춤 (휠로 확대·축소한 게임 화면을 플레이 구역에 맞는 크기로 되돌린다)', def: ['KeyZ', null] },
    { id: 'guide', g: '연습', label: '키 안내 보이기·가리기 (플레이 구역 옆의 반투명 키 안내)', def: ['KeyK', null] },
    { id: 'chartLeft', g: '연습', label: '입력 타임라인의 시간축을 앞(이른 쪽)으로', def: ['Comma', null] },
    { id: 'chartRight', g: '연습', label: '입력 타임라인의 시간축을 뒤(늦은 쪽)로', def: ['Period', null] },
    { id: 'chartZoomOut', g: '연습', label: '입력 타임라인의 시간축 축소(더 긴 시간을 한눈에)', def: ['BracketLeft', null] },
    { id: 'chartZoomIn', g: '연습', label: '입력 타임라인의 시간축 확대', def: ['BracketRight', null] },
    { id: 'chartFit', g: '연습', label: '입력 타임라인 전체 보기(처음부터 끝까지)', def: ['Backslash', null] },
    { id: 'replay', g: '연습', label: '리플레이 보기·닫기 (시도가 끝난 뒤. 하는 중에 누르면 거기서 끝내고 본다)', def: ['KeyY', null] },
    { id: 'rpPlay', g: '리플레이', ctx: 'replay', label: '리플레이 재생·멈춤', def: ['Space', null] },
    { id: 'rpBack', g: '리플레이', ctx: 'replay', label: '리플레이 뒤로 (한 번 = 0.05초, 누르고 있으면 계속)', def: ['ArrowLeft', null] },
    { id: 'rpFwd', g: '리플레이', ctx: 'replay', label: '리플레이 앞으로 (한 번 = 0.05초, 누르고 있으면 계속)', def: ['ArrowRight', null] },
    { id: 'rpSpeed', g: '리플레이', ctx: 'replay', label: '리플레이 재생 속도 (1 → 0.5 → 0.25배)', def: ['ArrowDown', null] },
    { id: 'ghost', g: '연습', label: '시범 유령 켬·끔 (내 첫 입력에 맞춰 시범 캐릭터가 흐릿하게 함께 움직임)', def: ['KeyU', null] },
    { id: 'reset', g: '실험실', label: '같은 자세로 다시', def: ['KeyR', null] },
    { id: 'scheme', g: '실험실', label: '조작 방식 바꾸기 (D·A·B·C안)', def: ['Backquote', null] },
    { id: 'st1', g: '실험실', label: '시작 자세 1 · 두 손 매달리기', def: ['Digit1', null] },
    { id: 'st2', g: '실험실', label: '시작 자세 2 · 한 손 매달리기', def: ['Digit2', null] },
    { id: 'st3', g: '실험실', label: '시작 자세 3 · 발판 위 웅크리기', def: ['Digit3', null] },
    { id: 'st4', g: '실험실', label: '시작 자세 4 · 건너편 한 손', def: ['Digit4', null] },
    { id: 'st5', g: '실험실', label: '시작 자세 5 · 반동 연습', def: ['Digit5', null] },
    { id: 'slow', g: '실험실', label: '절반 속도', def: ['Digit6', null] },
    { id: 'couple', g: '실험실', label: '도약 연결 켬·끔 (A·B·C안 비교용)', def: ['Digit7', null] },
    { id: 'layout', g: '실험실', label: '연습 배치 (건너편 턱 18px 가깝게)', def: ['Digit8', null] },
    { id: 'phys', g: '실험실', label: '물리 v0.6 ↔ v0.4', def: ['Digit9', null] },
    { id: 'body', g: '실험실', label: '몸 바꾸기 (기존 → 새 비율 → 관절 몸)', def: ['Minus', null] },
    { id: 'settings', g: '실험실', label: '키 설정 열기·닫기', def: ['Escape', 'Digit0'] },
  ];
  const BY = Object.fromEntries(ACTIONS.map(a => [a.id, a]));
  // 시도의 단계: live(하는 중) · ended(결과 화면) · replay(리플레이). 동작이 실제로 실행되는 단계를 여기 한곳에서 정한다.
  //   all = 언제나(다시하기·리플레이·다음 과제·시범·차트·설정·시작 자세), opt = 하는 중과 결과 화면(보조 설정·실험실 전환), rp = 리플레이 도구, 나머지(손발·몸·조준) = 하는 중에만
  const PHASES = { all: ['live', 'ended', 'replay'], opt: ['live', 'ended'], rp: ['replay'], play: ['live'] };
  const ALL_IDS = ['settings', 'reset', 'replay', 'lessonNext', 'demo', 'chart', 'dock', 'guide', 'log', 'viewFit', 'viewMenu', 'chartLeft', 'chartRight', 'chartZoomOut', 'chartZoomIn', 'chartFit', 'st1', 'st2', 'st3', 'st4', 'st5'];
  const OPT_IDS = ['handMode', 'assistRange', 'assist', 'autoFeet', 'autoShift', 'autoLoad', 'ghost', 'slow', 'scheme', 'couple', 'layout', 'phys', 'body'];
  const kindOf = id => BY[id] && BY[id].ctx === 'replay' ? 'rp' : ALL_IDS.includes(id) ? 'all' : OPT_IDS.includes(id) ? 'opt' : 'play';
  const phasesOf = id => PHASES[kindOf(id)];
  let map = {};
  function defaults() { map = Object.fromEntries(ACTIONS.map(a => [a.id, [a.def[0] || null, a.def[1] || null]])); }
  function load() {
    defaults();
    try { const s = typeof localStorage !== 'undefined' && JSON.parse(localStorage.getItem(STORE) || 'null'); if (s) for (const id in s) if (map[id] && Array.isArray(s[id])) map[id] = [s[id][0] || null, s[id][1] || null];
      // v0.15.0: Tab은 보기 설정의 기본 키가 됐다. 예전에 저장된 배정에 조작 방식 = Tab이 남아 있으면 겹치므로 조작 방식을 새 기본 키로 옮긴다
      if (s && map.viewMenu.includes('Tab') && map.scheme.includes('Tab')) map.scheme = map.scheme.map(c => c === 'Tab' ? 'Backquote' : c); } catch (e) {}
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(map)); return true; } catch (e) { return false; } }
  function resetAll() { defaults(); save(); }
  function set(id, slot, code) { map[id][slot] = code; save(); }
  const get = id => map[id] || [null, null];
  // 같은 입력을 쓰는 동작들(같은 손 선택 방식에서 함께 쓰이는 것끼리만). "발 + 손 입력"처럼 의도된 조합은 겹침이 아니다
  // 겹침: 같은 손 선택 방식에서, 함께 쓰이는 단계가 하나라도 있는 두 동작이 같은 입력을 쓰면 겹친 것이다(예: 리플레이 재생을 R에 두면 다시하기와 겹친다. Space는 모으기와 단계가 달라 겹치지 않는다)
  function conflicts(hm) {
    const use = {}, out = {};
    for (const a of ACTIONS) { if (a.hm && a.hm !== hm) continue; for (const c of map[a.id]) if (c) (use[c] = use[c] || []).push(a.id); }
    for (const c in use) { const ids = use[c]; for (const x of ids) for (const y of ids) if (x !== y && phasesOf(x).some(ph => phasesOf(y).includes(ph)) && !(out[x] || []).includes(y)) (out[x] = out[x] || []).push(y); }
    return out;
  }
  // 엔진 입력(raw)에 대해: 지금 눌려 있나 / 이번 프레임에 새로 눌렸나
  // 마우스가 화면 UI(차트 옮기기·크기 바꾸기·버튼)에 쓰이는 동안에는 마우스 버튼에 배정된 동작이 실행되지 않게 막는다
  let mouseBlocked = false; const setMouseBlocked = v => { mouseBlocked = !!v; };
  const mouseBtn = c => c && c.startsWith('Mouse') ? +c.slice(5) : -1;
  function down(id, raw) { for (const c of get(id)) { if (!c) continue; const b = mouseBtn(c); if (b >= 0 && mouseBlocked) continue; if (b >= 0 ? raw.mouse.down[b] : raw.key(c)) return true; } return false; }
  function pressed(id, raw) { for (const c of get(id)) { if (!c) continue; const b = mouseBtn(c); if (b >= 0 && mouseBlocked) continue; if (b >= 0 ? raw.clicks.some(k => k.button === b) : raw.pressed(c)) return true; } return false; }
  // 단계에 맞는 실행: 그 단계에서 쓰이는 동작만 반응한다. 리플레이에서는 리플레이 도구가 먼저다 — 겹치게 지정했더라도 같은 입력으로 다른 동작(다시하기·설정 등)이 함께 실행되지 않는다
  const codeHit = (c, raw, edge) => { const b = mouseBtn(c); if (b >= 0 && mouseBlocked) return false; return b >= 0 ? (edge ? raw.clicks.some(k => k.button === b) : !!raw.mouse.down[b]) : (edge ? raw.pressed(c) : !!raw.key(c)); };
  function hitIn(id, raw, phase, edge) {
    if (!BY[id] || !phasesOf(id).includes(phase)) return false;
    for (const c of get(id)) { if (!c || !codeHit(c, raw, edge)) continue;
      if (phase === 'replay' && kindOf(id) !== 'rp' && ACTIONS.some(a => kindOf(a.id) === 'rp' && map[a.id].includes(c))) continue; // 리플레이 도구가 쓰는 입력
      return true; }
    return false;
  }
  const pressedIn = (id, raw, phase) => hitIn(id, raw, phase, true), downIn = (id, raw, phase) => hitIn(id, raw, phase, false);
  // 그 동작의 두 칸(주·보조) 가운데 지금 실제로 쓰이고 있는 입력: 이번 프레임에 새로 눌린 것이 먼저, 없으면 눌려 있는 것. 기록과 화면이 "실제로 누른 키"를 보이는 데 쓴다
  function active(id, raw) { let dn = null; for (const c of get(id)) { if (!c) continue; const b = mouseBtn(c); if (b >= 0 && mouseBlocked) continue; if (b >= 0 ? raw.clicks.some(k => k.button === b) : raw.pressed(c)) return c; if (!dn && (b >= 0 ? raw.mouse.down[b] : raw.key(c))) dn = c; } return dn; }
  const codeDown = (c, raw) => { if (!c) return false; const b = mouseBtn(c); return b >= 0 ? !!raw.mouse.down[b] : !!raw.key(c); };
  // 마우스 버튼으로 눌렸고 그 순간 Shift가 눌려 있었나(Shift를 빨리 떼도 발 조작으로 인식하기 위해)
  function pressedWithShift(id, raw) { if (mouseBlocked) return false; for (const c of get(id)) { const b = mouseBtn(c); if (b >= 0 && raw.clicks.some(k => k.button === b && k.shift)) return true; } return false; }
  const NAMES = { Mouse0: '좌클릭', Mouse1: '휠 클릭', Mouse2: '우클릭', Mouse3: '마우스 뒤', Mouse4: '마우스 앞', Space: 'Space', Escape: 'Esc', Tab: 'Tab', Enter: 'Enter', Backspace: 'Backspace',
    ShiftLeft: '왼Shift', ShiftRight: '오른Shift', ControlLeft: '왼Ctrl', ControlRight: '오른Ctrl', AltLeft: '왼Alt', AltRight: '오른Alt', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\', BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Backquote: '`', CapsLock: 'CapsLock' };
  function name(c) { if (!c) return '—'; if (NAMES[c]) return NAMES[c]; if (c.startsWith('Key')) return c.slice(3); if (c.startsWith('Digit')) return c.slice(5); if (c.startsWith('Numpad')) return '숫자패드 ' + c.slice(6);
    const cat = typeof ClimbInputCatalog !== 'undefined' && ClimbInputCatalog.keys[c]; return cat ? cat.label : c; } // 나머지는 입력 도감의 글자(한/영, 한자 …)를 쓴다. 도감에도 없으면 코드 그대로
  const label = id => { const b = get(id).filter(Boolean); return b.length ? b.map(name).join(' / ') : '없음'; };
  const first = id => name(get(id).find(Boolean) || null);
  load();
  return { ACTIONS, BY, load, save, resetAll, set, get, conflicts, down, pressed, pressedWithShift, pressedIn, downIn, phasesOf, kindOf, active, codeDown, setMouseBlocked, name, label, first, STORE };
})();
if (typeof module !== 'undefined') module.exports = BIND;
