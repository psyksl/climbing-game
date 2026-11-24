# 원본 재생(단위 m, y 위, 120장/초 → 30장/초 1배속). 정면(x–y)·옆(z–y) 두 시점, 바닥선, 시각. 멈춰 있는 손발(초속 0.15m 아래)은 색 점
import sys, os, numpy as np, subprocess
sys.path.insert(0, os.path.dirname(__file__)); from amc import *
from PIL import Image, ImageDraw, ImageFont
asf, amcf, out = sys.argv[1:4]; FPS=120; STEP=4
bones,par,unit=load_asf(asf); fr=load_amc(amcf); P=[fk(bones,par,unit,x) for x in fr]
names=list(P[0].keys()); A={n:np.array([p[n] for p in P]) for n in names}
floor=np.percentile(np.minimum(A['lfoot'][:,1],A['rfoot'][:,1]),2)
for n in names: A[n][:,1]-=floor
top=max(A[n][:,1].max() for n in names); span=max(2.6, top+0.3)
rt=A['root'].copy(); k=60
for j in range(len(rt)): rt[j]=A['root'][max(0,j-k):j+k+1].mean(0)
W,H=480,480; s=(H-40)/span
font=ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',14)
kids=[(c_,p_) for c_,p_ in par.items()]
def spd(n,i): j=max(0,i-6); k=min(len(P)-1,i+6); return np.linalg.norm(A[n][k]-A[n][j])/((k-j)/FPS) if k>j else 0
pr=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{2*W}x{H}','-r','30','-i','-','-c:v','libx264','-pix_fmt','yuv420p','-crf','23',out],stdin=subprocess.PIPE)
for i in range(0,len(P),STEP):
    img=Image.new('RGB',(2*W,H),(236,233,225)); d=ImageDraw.Draw(img)
    for v,(ax,lab) in enumerate([(0,'정면 (x)'),(2,'옆 (z)')]):
        ox=v*W; prj=lambda q:(ox+W/2+(q[ax]-rt[i][ax])*s, H-20-(q[1])*s)
        y0=H-20; d.line([(ox,y0),(ox+W,y0)],fill=(150,140,120),width=2)
        for cc,pp in kids:
            if pp=='root' and cc not in A: continue
            a=prj(A[pp][i]); b=prj(A[cc][i]); col=(200,60,60) if cc.startswith('l') else (60,90,200) if cc.startswith('r') else (40,40,40)
            d.line([a,b],fill=col,width=3)
        for n,col in [('lhand',(230,120,0)),('rhand',(0,150,230)),('lfoot',(230,120,0)),('rfoot',(0,150,230))]:
            q=prj(A[n][i]); still=spd(n,i)<0.15; r=6 if still else 3
            d.ellipse([q[0]-r,q[1]-r,q[0]+r,q[1]+r],fill=col if still else None,outline=col)
        d.text((ox+6,6),lab,fill=(0,0,0),font=font)
    d.text((6,H-18),f'{os.path.basename(amcf)}  {i/FPS:6.2f}초 / 장 {i}  (원본 재생, 120장/초, 단위 m, 바닥 = 발 높이 2% 백분위)',fill=(0,0,0),font=font)
    pr.stdin.write(img.tobytes())
pr.stdin.close(); pr.wait(); print(out, len(P), '장')
