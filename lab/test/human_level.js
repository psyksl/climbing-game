// 사람 기준으로 다시 보기: (1) 잡을 수 있는 시간 창이 몇 ms인가 (2) 사람 수준의 반응 지연·흔들림을 넣으면 성공률이 얼마인가
const PH=require('../src/physics.js'), CTRL=require('../src/controls.js');
const {sim,okCatch}=require('./keys.js');
const d=(a,x,y)=>Math.hypot(a.x-a.x+a.x-x,a.y-y);
let seed=12345; const rnd=()=>{seed=(seed*1664525+1013904223)>>>0; return seed/4294967296;}; const gauss=()=>{let u=0;for(let i=0;i<12;i++)u+=rnd();return u-6;};
const phiOf=s=>{const a=s.limb[1].anchor,c=s.p[0];return a?Math.atan2(c.x-a.x,c.y-a.y)*57.3:0;};
// 도약(A안): relErr = 손 놓기 시차의 오차(초), react = 초록 고리를 보고 누르기까지의 지연(초). react=null이면 누르지 않고 창 길이만 잰다
const jump=(relErr,react)=>a=>{ const {s,m,io}=a,[tx,ty]=a.B(); io.mx=tx; io.my=ty; const t=s.t-0.4, rel=0.05+relErr;
  a.hold('power', t>=0 && t<Math.max(0,rel)+0.3); if(!m.rel&&t>=rel){a.tap('lh');a.tap('rh');m.rel=true;}
  const inR=[0,1].some(i=>s.limb[i].mode==='reach'&&CTRL.inRange(s,i)&&Math.hypot(s.p[2+i].x-tx,s.p[2+i].y-ty)<40);
  if(m.rel&&s.t-0.4>rel+0.1){ if(inR){ if(m.t0===undefined)m.t0=s.t; m.t1=s.t; } }
  if(react!==null && m.t0!==undefined && !m.clicked && s.t>=m.t0+react){ a.click(); m.clicked=true; }
  for(const i of [0,1]) if(s.limb[i].mode==='grip'&&s.limb[i].anchor.poly==='B'){ if(!m.got)m.got=s.t; } if(m.got&&s.t-m.got>1)m.done=true; };
const swing=(angErr,react)=>a=>{ const {s,m,io}=a,[tx,ty]=a.B(); io.mx=tx; io.my=ty;
  if(m.ph===0){ const phi=phiOf(s); m.max=Math.max(m.max||0,Math.abs(phi)); a.hold('swingL',s.t>0.3&&phi>0); a.hold('swingR',s.t<=0.3||phi<=0);
    if(m.max>55&&phi<-10)m.ready=true; if(m.ready&&phi>42+angErr&&s.p[0].vx>0){a.hold('swingL',false);a.hold('swingR',false);a.tap('rh');a.tap('lh');m.ph=1;m.tr=s.t;} return; }
  const inR=[0,1].some(i=>s.limb[i].mode==='reach'&&CTRL.inRange(s,i)&&Math.hypot(s.p[2+i].x-tx,s.p[2+i].y-ty)<40);
  if(s.t-m.tr>0.08&&inR){ if(m.t0===undefined)m.t0=s.t; m.t1=s.t; }
  if(react!==null && m.t0!==undefined && !m.clicked && s.t>=m.t0+react){ a.click(); m.clicked=true; }
  for(const i of [0,1]) if(s.limb[i].mode==='grip'&&s.limb[i].anchor&&s.limb[i].anchor.poly==='B'){ if(!m.got)m.got=s.t; } if(m.got&&s.t-m.got>1)m.done=true; };
const w1=sim('pick',3,null,jump(0,null),4).m, w2=sim('pick',2,null,swing(0,null),14).m, w3=sim('pick',2,'near',swing(0,null),14).m;
const ms=m=>m.t0===undefined?'없음':Math.round((m.t1-m.t0)*1000)+'ms';
console.log('손이 턱에 닿아 있는 시간(이 안에 좌클릭해야 잡힘): 도약', ms(w1), '| 스윙(기존 벽)', ms(w2), '| 스윙(연습 배치)', ms(w3));
// 사람 수준: 반응 238±53ms(단순 시각 반응 시간), 손 놓기 시차 오차 SD 60ms, 놓는 각도 오차 SD 8°
const N=200; const rate=(mk,st,v,T)=>{let ok=0;for(let k=0;k<N;k++){ if(okCatch(sim('pick',st,v,mk(),T)))ok++; } return Math.round(ok/N*100)+'%';};
console.log('사람 수준 입력으로 성공률(200회): 보고 누르기(반응 238±53ms)');
console.log('  도약', rate(()=>jump(gauss()*0.06, Math.max(0.12,0.238+gauss()*0.053)),3,null,4), '| 스윙 기존 벽', rate(()=>swing(gauss()*8, Math.max(0.12,0.238+gauss()*0.053)),2,null,14), '| 스윙 연습 배치', rate(()=>swing(gauss()*8, Math.max(0.12,0.238+gauss()*0.053)),2,'near',14));
console.log('미리 맞춰 누르기(예측, 누르는 시점 오차 SD 50ms, 창이 열린 뒤 60ms를 겨냥)');
console.log('  도약', rate(()=>jump(gauss()*0.06, Math.max(0,0.06+gauss()*0.05)),3,null,4), '| 스윙 기존 벽', rate(()=>swing(gauss()*8, Math.max(0,0.06+gauss()*0.05)),2,null,14), '| 스윙 연습 배치', rate(()=>swing(gauss()*8, Math.max(0,0.06+gauss()*0.05)),2,'near',14));
