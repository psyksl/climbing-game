/* 공통 Canvas 입력 아이콘 렌더러. 실행 게임의 BIND와 연결해서 사용합니다.
   출처: Climb_Input_UI_Handoff_v1/src/input-ui.js (사용자 승인 시안). 게임에 연결하며 바꾼 것:
   - loadFrom(주소 표): 한 파일 빌드에 묻어 둔 그림(data 주소)을 불러온다. ready(): 그림이 준비됐는지
   - options.press(0~1): 눌림 정도. 게임 쪽에서 짧게 보간해 넘긴다(없으면 state대로 0 또는 1)
   - options.big: 작게 그리는 키캡에서 글자를 키 면에 맞춰 크게 쓴다
   - 역할 색이 neutral이 아닌 마우스는 그 색을, any는 어느 손인지 정해지지 않았다는 뜻의 회갈색을 쓴다 */
(function(root){
  'use strict';
  const catalog=typeof module!=='undefined'?require('./input-catalog.js'):root.ClimbInputCatalog;
  const sizes={square:[104,104],short:[130,104],tab:[150,104],caps:[172,104],backspace:[192,104],enter:[216,104],shift:[252,104],space:[460,96],numenter:[104,208],numzero:[192,104],iso:[164,176],mouse:[104,136],mouseSide:[120,120]};
  const images={},cache=new Map();let makeCanvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
  const font='"Noto Sans CJK KR", "Malgun Gothic", sans-serif';
  function configure(opts){if(opts.images)Object.assign(images,opts.images);if(opts.createCanvas)makeCanvas=opts.createCanvas;cache.clear();}
  async function load(baseUrl='assets/templates/'){
    await Promise.all(Object.keys(sizes).map(shape=>new Promise((resolve,reject)=>{
      const im=new Image();im.onload=()=>{images[shape]=im;resolve();};im.onerror=()=>reject(new Error('입력 이미지 로드 실패 '+shape));im.src=baseUrl+shape+'.png';
    })));
  }
  function loadFrom(map){
    return Promise.all(Object.keys(sizes).map(shape=>new Promise((resolve,reject)=>{
      if(!map[shape])return reject(new Error('입력 이미지 없음 '+shape));
      const im=new Image();im.onload=()=>{images[shape]=im;resolve();};im.onerror=()=>reject(new Error('입력 이미지 로드 실패 '+shape));im.src=map[shape];
    }))).then(()=>{cache.clear();});
  }
  const ready=()=>Object.keys(sizes).every(shape=>images[shape]);
  function rr(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
  function mouseMask(ctx,code,w,h){
    ctx.save();ctx.scale(w/104,h/(code==='Mouse3'||code==='Mouse4'?120:136));
    if(code==='Mouse0'||code==='Mouse2'){
      if(code==='Mouse2'){ctx.translate(104,0);ctx.scale(-1,1);}
      ctx.beginPath();ctx.moveTo(48,5);ctx.bezierCurveTo(23,5,9,18,6,48);ctx.lineTo(7,68);ctx.bezierCurveTo(18,62,31,57,48,57);ctx.closePath();ctx.fill();
    }else if(code==='Mouse1'){rr(ctx,46,20,11,31,5);ctx.fill();}
    else {ctx.translate(code==='Mouse3'?40:27,code==='Mouse3'?68:52);ctx.rotate(.72);rr(ctx,-12,-6,27,12,5);ctx.fill();}
    ctx.restore();
  }
  function render(ctx,code,bounds,options={}){
    const item=catalog.resolve(code,options),shape=item.shape,size=sizes[shape],im=images[shape];
    if(!im)throw new Error('이미지 미준비 '+shape+'; load 또는 configure를 먼저 호출하세요.');
    const press=options.press==null?(options.state==='pressed'?1:0):Math.max(0,Math.min(1,options.press));
    const state=options.state==='disabled'?'disabled':press>0.5?'pressed':'idle',role=options.role||'neutral';
    const tint=catalog.roles[role]||catalog.roles.neutral;
    const [nw,nh]=size,scale=Math.min(bounds.w/(nw+20),bounds.h/(nh+20));
    const x=bounds.x+(bounds.w-nw*scale)/2,y=bounds.y+(bounds.h-nh*scale)/2;
    const cacheKey=[shape,role,state,item.code].join('|');
    let layer=cache.get(cacheKey);
    if(!layer){layer=makeCanvas(nw,nh);const lc=layer.getContext('2d');lc.drawImage(im,0,0,nw,nh);
    if(shape==='mouse'||shape==='mouseSide'){
      lc.globalCompositeOperation='source-atop';lc.fillStyle=role==='neutral'?({'Mouse0':'#f58b78','Mouse2':'#6abfe6','Mouse1':'#edc266','Mouse3':'#b7a1d5','Mouse4':'#b7a1d5'}[item.code]||tint):tint;
      lc.globalAlpha=state==='pressed'?.92:.70;mouseMask(lc,item.code,nw,nh);lc.globalAlpha=1;lc.globalCompositeOperation='source-over';
    }else if(role!=='neutral'){
      lc.globalCompositeOperation='source-atop';lc.globalAlpha=.26;lc.fillStyle=tint;lc.fillRect(0,0,nw,nh);lc.globalAlpha=1;lc.globalCompositeOperation='source-over';
    }
    if(cache.size>=128)cache.delete(cache.keys().next().value);cache.set(cacheKey,layer);}
    ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
    if(state==='disabled')ctx.globalAlpha=.40;
    const dy=5*press,sy=1-.06*press;
    ctx.translate(0,dy);ctx.scale(1,sy);ctx.drawImage(layer,0,0);
    let labelBox=null;
    if(shape!=='mouse'&&shape!=='mouseSide'){
      const face=shape==='iso'?{x:20,y:12,w:nw-32,h:nh*.43}:{x:10,y:8,w:nw-20,h:nh*.72};
      const cy=face.y+face.h*.52;
      let sizeFont=shape==='space'?48:item.label.length===1?(options.big?46:34):(options.big?(item.label.length<=3?38:32):23);
      let lines=[String(item.label)];
      if(lines[0].length>17){const mid=Math.ceil(lines[0].length/2);lines=[lines[0].slice(0,mid),lines[0].slice(mid)];sizeFont=16;}
      ctx.font=`700 ${sizeFont}px ${font}`;
      while(lines.some(s=>ctx.measureText(s).width>face.w-8)&&sizeFont>10){sizeFont--;ctx.font=`700 ${sizeFont}px ${font}`;}
      const maxText=face.w-8;
      lines=lines.map(s=>{let t=s;while(ctx.measureText(t).width>maxText&&t.length>1)t=t.slice(0,-1);return t===s?t:t.slice(0,-1)+'…';});
      ctx.font=`700 ${sizeFont}px ${font}`;ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillStyle='rgba(255,255,245,.65)';lines.forEach((s,i)=>ctx.fillText(s,face.x+face.w/2,cy+(i-(lines.length-1)/2)*(sizeFont+2)+1));
      ctx.fillStyle='#3f3a31';lines.forEach((s,i)=>ctx.fillText(s,face.x+face.w/2,cy+(i-(lines.length-1)/2)*(sizeFont+2)));
      if(item.corner){ctx.font=`600 10px ${font}`;ctx.fillStyle='#847e71';ctx.fillText(item.corner,nw/2,nh*.75);}
      if(item.secondary&&options.secondary){ctx.font=`500 11px ${font}`;ctx.textAlign='left';ctx.fillStyle='#81796a';ctx.fillText(item.secondary,face.x+8,face.y+11);}
      labelBox={fontSize:sizeFont,lines,fullLabel:String(item.label)};
    }
    ctx.restore();
    return{code:item.code,shape,state,role,label:item.label,fallback:!!item.fallback,labelBox};
  }
  function drawBinding(ctx,bind,action,bounds,options={}){
    const codes=bind.get(action);
    const preferred=codes.includes(options.lastUsedCode)&&options.lastUsedCode?options.lastUsedCode:
      options.slot==null?codes.find(Boolean):codes[options.slot];
    return render(ctx,preferred||null,bounds,options);
  }
  function drawChord(ctx,codes,bounds,options={}){
    const list=codes.length?codes:[null],gap=options.gap??9;
    const weights=list.map(code=>{const size=sizes[catalog.resolve(code,options).shape];return(size[0]+20)/(size[1]+20);});
    const unit=(bounds.w-gap*(list.length-1))/weights.reduce((a,b)=>a+b,0);let x=bounds.x;
    return list.map((code,i)=>{const w=unit*weights[i],result=render(ctx,code,{x,y:bounds.y,w,h:bounds.h},options);x+=w+gap;return result;});
  }
  const api={sizes,catalog,configure,load,loadFrom,ready,render,drawBinding,drawChord};
  if(typeof module!=='undefined')module.exports=api;else root.ClimbInputUI=api;
})(typeof window!=='undefined'?window:globalThis);
