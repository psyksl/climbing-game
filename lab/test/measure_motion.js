const PH=require('../src/physics.js'); const dt=1/120, PXM=107; // px per metre (팔+몸통 기준)
const idle=()=>({cx:0,cy:0,hand:[false,false],foot:[false,false],power:false});
const com=s=>{let m=0,x=0,y=0;for(const q of s.p){m+=q.m;x+=q.m*q.x;y+=q.m*q.y;}return [x/m,y/m];};
// 1) 손 뻗기: 두 손 매달린 자세에서 오른손을 60px 옆 위로
{ const s=PH.create(PH.makeWorld(),1); for(let i=0;i<60;i++)PH.step(s,idle(),dt);
  const h=s.p[3], x0=h.x,y0=h.y, tx=x0+45, ty=y0+40; let vmax=0,amax=0,pv=0,tArr=null,over=0,sum=0,n=0; const c0=[s.p[0].x,s.p[0].y]; let cmax=0; const prof=[];
  for(let i=0;i<90;i++){ const inp=idle(); inp.hand[1]=true; inp.cx=tx; inp.cy=ty; PH.step(s,inp,dt); const v=Math.hypot(h.vx,h.vy); amax=Math.max(amax,Math.abs(v-pv)/dt); pv=v; vmax=Math.max(vmax,v);
    const d=Math.hypot(h.x-tx,h.y-ty); if(tArr===null){sum+=v;n++; prof.push(v|0); if(d<6) tArr=(i+1)*dt;} cmax=Math.max(cmax,Math.hypot(s.p[0].x-c0[0],s.p[0].y-c0[1])); }
  const dist=Math.hypot(45,40);
  console.log(`손 뻗기 ${dist.toFixed(0)}px(${(dist/PXM).toFixed(2)}m): 도착 ${tArr===null?"-":tArr.toFixed(3)}초, 최고 속도 ${(vmax/PXM).toFixed(1)}m/s, 최고 가속 ${(amax/PXM/9.81).toFixed(0)}g, 최고/평균 속도비 ${(vmax/(sum/n)).toFixed(2)}, 그동안 가슴이 움직인 거리 ${cmax.toFixed(1)}px`);
  console.log('  속도 변화(px/s, 1/120초 간격):', prof.join(' ')); }
// 2) 발 옮기기: 발판 위 웅크린 자세에서 오른발을 든다 → 무게중심·엉덩이 반응
{ const s=PH.create(PH.makeWorld(),3); for(let i=0;i<60;i++)PH.step(s,idle(),dt); const c0=com(s), f0=s.limb.map(l=>l.force/PH.W);
  const hip0=[s.p[1].x,s.p[1].y]; let d=0; for(let i=0;i<60;i++){ const inp=idle(); inp.foot[1]=true; inp.cx=s.p[1].x+40; inp.cy=s.p[1].y+50; PH.step(s,inp,dt); d=Math.max(d,Math.hypot(s.p[1].x-hip0[0],s.p[1].y-hip0[1])); }
  const c1=com(s); console.log(`발 들기: 들기 전 미리 옮긴 무게중심 0px(입력 즉시 떼어짐), 든 뒤 0.5초 무게중심 이동 ${Math.hypot(c1[0]-c0[0],c1[1]-c0[1]).toFixed(1)}px, 엉덩이 최대 이동 ${d.toFixed(1)}px`); }
// 3) 힘주기: 다리 힘이 최대에 이르는 시간
{ const s=PH.create(PH.makeWorld(),3); for(let i=0;i<60;i++)PH.step(s,idle(),dt); let t=null, t0=s.t, vy=[], off=null;
  for(let i=0;i<60;i++){ const inp=idle(); inp.power=true; inp.cx=s.p[0].x+60; inp.cy=s.p[0].y-200; inp.hand=[true,true]; PH.step(s,inp,dt); const F=Math.max(...s.limb.slice(2).map(l=>-l.force/PH.W)); if(t===null&&F>1.6)t=s.t-t0; if(off===null && !s.limb.some(l=>l.mode==='plant')) off=[s.t-t0, Math.hypot(s.p[1].vx,s.p[1].vy)]; }
  console.log(`밀기: 다리 힘이 최대의 90%에 이르는 시간 ${(t*1000).toFixed(0)}ms, 발이 떨어질 때까지 ${off[0].toFixed(2)}초, 이륙 속도 ${(off[1]/PXM).toFixed(1)}m/s`); }
// 4) 질량 분포
console.log('질량 비율(%): 가슴', (PH.C.MC/PH.MASS*100).toFixed(0), '엉덩이', (PH.C.MP/PH.MASS*100).toFixed(0), '손 하나', (PH.C.MH/PH.MASS*100).toFixed(1), '발 하나', (PH.C.MF/PH.MASS*100).toFixed(1));
console.log('길이(px): 팔', PH.C.A, '몸통', PH.C.T, '다리', PH.C.L, '| 중력', (PH.C.G/PXM/9.81).toFixed(2)+'g (107px=1m 기준)');
// 5) 매달린 몸의 흔들림 주기
{ const s=PH.create(PH.makeWorld(),5); for(const q of s.p){ if(q!==s.p[3]) q.vx=120; } let last=null, per=[]; let prev=0; for(let i=0;i<600;i++){ PH.step(s,idle(),dt); const phi=s.p[0].x-815; if(prev<0&&phi>=0){ if(last!==null) per.push(s.t-last); last=s.t;} prev=phi; } console.log('한 손 매달림 흔들림 주기', per.map(x=>x.toFixed(2)).join(', '), '초'); }
