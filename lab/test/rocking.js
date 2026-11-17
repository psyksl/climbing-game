const PH=require('../src/physics.js'), CTRL=require('../src/controls.js');
const dt=1/120;
// A안 키 입력으로: 발판 위 자세(3번)에서 오른손을 미리 집어 두고(E), 왼손+두 발로 버틴 채 시작
// rocks: 반동 횟수(뒤로 뺐다 앞으로를 몇 번), back: 뒤로 빼는 시간, relD: 마지막 앞으로 밀기 시작 후 왼손 놓기까지
function run(rocks, back, fwd, relD, verbose){
  const s=PH.create(PH.makeWorld(),3), ctl=CTRL.make('pick'), K=CTRL.KEYMAP.pick; const held=new Set(); let pressed=new Set();
  const io={mx:0,my:0,lmb:false,rmb:false,key:c=>held.has(c),pressed:c=>pressed.has(c)};
  let best=-1e9, bestC=-1e9, rel=null, off=null, t0=0.5; const T=[]; // 시간표
  let t=t0; for(let k=0;k<rocks;k++){ T.push([t,t+back,'back']); t+=back; if(k<rocks-1){T.push([t,t+fwd,'fwd']); t+=fwd;} }
  const tGo=t;
  while(s.t<tGo+2.5 && !s.dead){ pressed=new Set(); io.lmb=false;
    if(s.t>0.15 && !run.e){} 
    if(Math.abs(s.t-0.2)<dt/2) pressed.add(K.rh);            // 오른손 집기
    const seg=T.find(x=>s.t>=x[0]&&s.t<x[1]);
    if(seg){ held.add(K.power); if(seg[2]==='back'){ io.mx=s.p[0].x-60; io.my=s.p[0].y+70; } else { io.mx=s.p[0].x+120; io.my=s.p[0].y-60; } }
    else if(s.t>=tGo && s.t<tGo+0.35){ held.add(K.power); io.mx=640; io.my=300; if(rel===null && s.t>=tGo+relD){ pressed.add(K.lh); rel=s.t; } }
    else { held.delete(K.power); io.mx=640; io.my=345; }
    PH.step(s, ctl.step(s,io,dt), dt);
    if(rel!==null && !s.limb.some(l=>l.mode==='plant'||l.mode==='grip')){ if(!off) off={vx:s.p[0].vx,vy:s.p[0].vy,x:s.p[0].x,y:s.p[0].y};
      const h=s.p[3]; if(Math.abs(h.y-345)<14) best=Math.max(best,h.x); bestC=Math.max(bestC,s.p[0].x); }
  }
  return {reach:best, chest:bestC, off};
}
const fmt=r=>`오른손이 턱 높이에서 닿은 최대 x=${r.reach.toFixed(0)}  이륙 속도 ${r.off?Math.hypot(r.off.vx,r.off.vy).toFixed(0):'-'}px/s (${r.off?r.off.vx.toFixed(0):'-'}, ${r.off?r.off.vy.toFixed(0):'-'})`;
let b0=null; for(const relD of [0,0.03,0.06,0.1]) { const r=run(0,0,0,relD); if(!b0||r.reach>b0.reach) b0=r; } console.log('반동 없이 바로 뛰기      ', fmt(b0));
for(const rocks of [1,2,3]) { let b=null,bp=null; for(const back of [0.15,0.25,0.35,0.5]) for(const fwd of [0.15,0.25,0.35]) for(const relD of [0,0.03,0.06,0.1,0.15]) { const r=run(rocks,back,fwd,relD); if(!b||r.reach>b.reach){b=r;bp=[back,fwd,relD];} } console.log(`뒤로 뺐다 뛰기 ×${rocks}        `, fmt(b), '| 뒤로', bp[0],'초, 앞으로',bp[1],'초, 놓기 +'+bp[2]); }
console.log('참고: 건너편 턱 왼쪽 끝 x=470 (기존 벽)');
