# 닿은 자리 지도: 손발이 0.15초 넘게 멈춘 자리(바닥 10cm 위만)를 위(x–z)·정면(x–y)·옆(z–y)으로 찍어 지형을 짐작한다. 수직 평면에 맞으면 그 평면까지의 거리도 적는다
import sys, os, numpy as np
sys.path.insert(0, os.path.dirname(__file__)); from amc import *
from PIL import Image, ImageDraw, ImageFont
FPS=120; font=ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',13)
def contacts(asf,amcf):
    bones,par,unit=load_asf(asf); fr=load_amc(amcf); P=[fk(bones,par,unit,x) for x in fr]; n=len(P)
    A={k:np.array([p[k] for p in P]) for k in ['lhand','rhand','lfoot','rfoot','lfemur','root']}
    floor=np.percentile(np.minimum(A['lfoot'][:,1],A['rfoot'][:,1]),2)
    for k in A: A[k][:,1]-=floor
    out=[]
    for k in ['lhand','rhand','lfoot','rfoot']:
        x=A[k]; v=np.linalg.norm(x[12:]-x[:-12],axis=1)/(12/FPS); s=np.r_[np.zeros(6),v,np.zeros(6)]<0.15
        i=0
        while i<n:
            if s[i]:
                j=i
                while j<n and s[j]: j+=1
                if j-i>=18 and x[i:j,1].mean()>0.10: out.append((k,x[i:j].mean(0),i/FPS,(j-i)/FPS))
                i=j
            else: i+=1
    return out, A
def draw(out, A, title, path):
    W=360; img=Image.new('RGB',(3*W,W+30),(240,237,230)); d=ImageDraw.Draw(img)
    pts=np.array([o[1] for o in out]) if out else np.zeros((1,3)); allp=np.vstack([pts,A['root']])
    lo=allp.min(0)-0.3; hi=allp.max(0)+0.3; lo[1]=-0.1; span=max((hi-lo)); s=(W-20)/span
    views=[(0,2,'위에서(x–z)'),(0,1,'정면(x–y)'),(2,1,'옆(z–y)')]
    for v,(a,b,lab) in enumerate(views):
        ox=v*W; P=lambda q:(ox+10+(q[a]-lo[a])*s, W-10-(q[b]-lo[b])*s)
        r=A['root'][::30]; 
        for q in r: x,y=P(q); d.point((x,y),fill=(150,150,150))
        for k,q,t,du in out:
            x,y=P(q); col=(230,120,0) if k[0]=='l' else (0,140,230); rr=4
            if 'hand' in k: d.ellipse([x-rr,y-rr,x+rr,y+rr],outline=col,width=2)
            else: d.rectangle([x-rr,y-rr,x+rr,y+rr],fill=col)
        d.text((ox+6,4),lab,fill=(0,0,0),font=font)
    d.text((6,W+8),title+'  ○ 손  ■ 발(주황 왼쪽·파랑 오른쪽)  회색 = 엉덩이 자취',fill=(0,0,0),font=font)
    img.save(path)
if __name__=='__main__':
    base,outd=sys.argv[1],sys.argv[2]
    for subj in sorted(os.listdir(base)):
        d=os.path.join(base,subj); asf=os.path.join(d,[f for f in os.listdir(d) if f.endswith('.asf')][0])
        for f in sorted(x for x in os.listdir(d) if x.endswith('.amc')):
            out,A=contacts(asf,os.path.join(d,f)); nm=f[:-4]
            hands=[o for o in out if 'hand' in o[0]]; feet=[o for o in out if 'foot' in o[0]]
            hh=np.array([o[1][1] for o in hands]) if hands else np.array([0]); fh=np.array([o[1][1] for o in feet]) if feet else np.array([0])
            print(f"{nm:7s} 손 닿음 {len(hands):3d}(높이 {hh.min():.2f}~{hh.max():.2f}m) 발 디딤(바닥 위) {len(feet):3d}(높이 {fh.min():.2f}~{fh.max():.2f}m)")
            draw(out,A,nm,os.path.join(outd,nm+'_contacts.png'))
