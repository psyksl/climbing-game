/* 키 모양은 KeyboardEvent.code, 표시 글자는 label로 결정합니다.
   출처: Climb_Input_UI_Handoff_v1/src/catalog.js (사용자 승인 시안). 게임에 연결하며 바꾼 것: 역할 색에 body(몸 옮기기 = up과 같은 색)와 any(아직 어느 손인지 정해지지 않은 입력)를 더함. */
(function(root){
  'use strict';
  const keys={};
  function add(code,label,shape='square',group='일반',extra={}){keys[code]={code,label,shape,group,...extra};}
  for(let n=65;n<=90;n++)add('Key'+String.fromCharCode(n),String.fromCharCode(n));
  const shifted=[')', '!', '@', '#', '$', '%', '^', '&', '*', '('];
  for(let n=0;n<10;n++)add('Digit'+n,String(n),'square','숫자',{secondary:shifted[n]});
  for(let n=1;n<=24;n++)add('F'+n,'F'+n,'square','기능');
  const punct={Backquote:['`','~'],Minus:['−','_'],Equal:['=','+'],BracketLeft:['[','{'],BracketRight:[']','}'],Backslash:['\\','|'],Semicolon:[';',':'],Quote:["'",'"'],Comma:[',','<'],Period:['.','>'],Slash:['/','?']};
  for(const [code,[label,secondary]]of Object.entries(punct))add(code,label,'square','기호',{secondary});
  for(const [code,label]of Object.entries({Escape:'Esc',PrintScreen:'PrtSc',ScrollLock:'ScrLk',Pause:'Pause',Insert:'Ins',Delete:'Del',Home:'Home',End:'End',PageUp:'PgUp',PageDown:'PgDn',Help:'Help',NumLock:'NumLk',ContextMenu:'Menu',Fn:'Fn',FnLock:'FnLock'}))add(code,label,'square','기능');
  add('Space','SPACE','space','긴 키');add('Tab','Tab','tab','긴 키');add('CapsLock','Caps','caps','긴 키');add('Backspace','Backspace','backspace','긴 키');add('Enter','Enter','enter','긴 키');
  for(const [prefix,label]of [['Shift','Shift'],['Control','Ctrl'],['Alt','Alt'],['Meta','Meta']])for(const side of ['Left','Right'])add(prefix+side,label,prefix==='Shift'?(side==='Left'?'enter':'shift'):'short','수정 키',{corner:side==='Left'?'L':'R'});
  for(const [code,label]of Object.entries({ArrowLeft:'←',ArrowUp:'↑',ArrowRight:'→',ArrowDown:'↓'}))add(code,label,'square','방향');
  for(let n=0;n<10;n++)add('Numpad'+n,String(n),n===0?'numzero':'square','숫자패드',{corner:'NUM'});
  const num={NumpadAdd:'+',NumpadSubtract:'−',NumpadMultiply:'×',NumpadDivide:'÷',NumpadDecimal:'.',NumpadComma:',',NumpadEqual:'=',NumpadHash:'#',NumpadStar:'*',NumpadParenLeft:'(',NumpadParenRight:')',NumpadBackspace:'⌫',NumpadClear:'Clear',NumpadClearEntry:'CE',NumpadMemoryAdd:'M+',NumpadMemoryClear:'MC',NumpadMemoryRecall:'MR',NumpadMemoryStore:'MS',NumpadMemorySubtract:'M−'};
  for(const [code,label]of Object.entries(num))add(code,label,code==='NumpadAdd'?'numenter':'square','숫자패드',{corner:'NUM'});
  add('NumpadEnter','Enter','numenter','숫자패드',{corner:'NUM'});
  for(const [code,label]of Object.entries({Lang1:'한/영',Lang2:'한자',Lang3:'Lang3',Lang4:'Lang4',Lang5:'Lang5',Convert:'변환',NonConvert:'무변환',KanaMode:'かな',IntlBackslash:'\\',IntlRo:'ろ',IntlYen:'¥',Hiragana:'ひらがな',Katakana:'カタカナ'}))add(code,label,'short','국제');
  const media={AudioVolumeMute:'Mute',AudioVolumeDown:'Vol −',AudioVolumeUp:'Vol +',MediaPlayPause:'Play/Pause',MediaPlay:'Play',MediaPause:'Pause',MediaStop:'Stop',MediaSelect:'Media',MediaTrackNext:'Next',MediaTrackPrevious:'Prev',BrowserBack:'Back',BrowserForward:'Forward',BrowserRefresh:'Refresh',BrowserStop:'Stop',BrowserSearch:'Search',BrowserFavorites:'Favorite',BrowserHome:'Home',LaunchApp1:'App 1',LaunchApp2:'App 2',LaunchMail:'Mail',Power:'Power',Sleep:'Sleep',WakeUp:'Wake',Eject:'Eject'};
  for(const [code,label]of Object.entries(media))add(code,label,'short','확장');
  for(const code of ['Again','Copy','Cut','Find','Open','Paste','Props','Select','Undo','Abort','Resume','Suspend','Hyper','Super','Turbo'])add(code,code,'short','확장');
  for(const [code,label]of Object.entries({Mouse0:'좌클릭',Mouse1:'휠 클릭',Mouse2:'우클릭',Mouse3:'뒤 버튼',Mouse4:'앞 버튼'}))add(code,label,code==='Mouse3'||code==='Mouse4'?'mouseSide':'mouse','마우스');
  add('Unassigned','미지정','short','표시 상태');add('Unidentified','?','short','표시 상태');
  const roles={neutral:'#f1e5cc',left:'#f58b78',right:'#6abfe6',power:'#edc266',up:'#a7d6b2',body:'#a7d6b2',foot:'#b7a1d5',any:'#a39a86'};
  function resolve(code,options={}){
    const normalized=code==null||code===''?'Unassigned':String(code);
    const known=keys[normalized];
    const item=known||{code:normalized,label:normalized,shape:'short',group:'기타',fallback:true};
    const shape=normalized==='Enter'&&options.layout==='iso'?'iso':item.shape;
    return {...item,shape,label:options.label??item.label};
  }
  const api={keys,roles,resolve,states:['idle','pressed','disabled']};
  if(typeof module!=='undefined')module.exports=api;else root.ClimbInputCatalog=api;
})(typeof window!=='undefined'?window:globalThis);
