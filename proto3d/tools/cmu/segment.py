# 구간 분류(자동 1차 후보, 눈으로 확인 전). 지형 정보가 없으므로 "멈춘 손발(초속 0.15m 아래, ±0.05초)"을 잡음·디딤 후보로 본다.
import sys, os, json, numpy as np
sys.path.insert(0, os.path.dirname(__file__)); from amc import *
FPS=120
def runs(mask, minlen):
    out=[]; i=0; n=len(mask)
    while i<n:
        if mask[i]:
            j=i
            while j<n and mask[j]: j+=1
            if j-i>=minlen: out.append((i,j))
            i=j
        else: i+=1
    return out
def yaw(v): return np.degrees(np.arctan2(v[:,0], v[:,2]))
def wrap(a): return (a+180)%360-180
def analyze(asf, amcf):
    bones,par,unit=load_asf(asf); fr=load_amc(amcf); P=[fk(bones,par,unit,x) for x in fr]; n=len(P)
    A={k:np.array([p[k] for p in P]) for k in P[0]}
    floor=np.percentile(np.minimum(A['lfoot'][:,1],A['rfoot'][:,1]),2)
    for k in A: A[k][:,1]-=floor
    def speed(k):
        x=A[k]; v=np.zeros(n); h=6
        for i in range(n): a=max(0,i-h); b=min(n-1,i+h); v[i]=np.linalg.norm(x[b]-x[a])/((b-a)/FPS) if b>a else 0
        return v
    still={k:speed(k)<0.15 for k in ['lhand','rhand','lfoot','rfoot']}
    root=A['root']; sh=(A['lclavicle']+A['rclavicle'])/2
    pel=yaw(np.cross(A['lhipjoint']-A['rhipjoint'],[0,1,0])*-1); che=yaw(np.cross(A['lclavicle']-A['rclavicle'],[0,1,0])*-1)
    twist=wrap(che-pel)
    footS=still['lfoot']|still['rfoot']; handS=still['lhand']|still['rhand']
    handUp={k:A[k][:,1]>sh[:,1]+0.05 for k in ['lhand','rhand']}
    ev=[]
    T=lambda i:round(i/FPS,2)
    # 1 발 올리기
    for f in ['lfoot','rfoot']:
        st=runs(still[f],18)
        for (a0,a1),(b0,b1) in zip(st,st[1:]):
            h0=A[f][a0:a1,1].mean(); h1=A[f][b0:b1,1].mean(); other='rfoot' if f=='lfoot' else 'lfoot'
            if h1-h0>=0.20 and b0-a1<=FPS*2.5: ev.append(dict(kind='발 올리기',t0=T(a1),t1=T(b0),foot=f[0],dh=round(h1-h0,2),other_still=round(float(still[other][a1:b0].mean()),2),hands_still=round(float(handS[a1:b0].mean()),2)))
    # 2 체중 이동: 두 발 모두 멈춘 채 엉덩이가 발–발 선 방향으로 8cm 넘게
    both=runs(still['lfoot']&still['rfoot'],36)
    for a,b in both:
        ax=A['lfoot'][a]-A['rfoot'][a]; ax[1]=0; L=np.linalg.norm(ax)
        if L<0.1: continue
        ax/=L; p=(root[a:b]-root[a])@ax; i=np.argmax(np.abs(p))
        if abs(p[i])>=0.08: ev.append(dict(kind='체중 이동',t0=T(a),t1=T(a+i),shift=round(float(p[i]),2),foot_gap=round(float(L),2),root_dy=round(float(root[a+i,1]-root[a,1]),2)))
    # 3 골반·가슴 회전: 비틀림 20° 넘게 0.3초 / 발이 멈춘 채 골반 30° 넘게 돎
    for a,b in runs(np.abs(twist)>20,36): ev.append(dict(kind='가슴–골반 비틀림',t0=T(a),t1=T(b),max_deg=round(float(np.abs(twist[a:b]).max()))))
    for a,b in runs(footS,60):
        d=wrap(pel[a:b]-pel[a]); i=np.argmax(np.abs(d))
        if abs(d[i])>=30: ev.append(dict(kind='골반 돌기(발 디딘 채)',t0=T(a),t1=T(a+i),deg=round(float(d[i]))))
    # 4 매달리기: 손 하나 이상 멈춤 + 어깨 위, 멈춘 발 없음, 0.3초
    hang=(((still['lhand']&handUp['lhand'])|(still['rhand']&handUp['rhand'])) & ~footS)
    for a,b in runs(hang,36): ev.append(dict(kind='매달리기',t0=T(a),t1=T(b),hands=int(round(float(((still['lhand']&handUp['lhand'])[a:b]&(still['rhand']&handUp['rhand'])[a:b]).mean())))+1,root_min=round(float(root[a:b,1].min()),2)))
    # 5 몸 끌어올리기: 2초 안에 엉덩이 20cm 넘게 오름, 그동안 손이 잡고 있음(어깨 위 멈춤 50% 넘음). 발 디딤 비율도 적는다(팔로만인지 다리로 일어서는지)
    # 6 내려오기: 3초 안에 30cm 넘게 내려감
    w=int(FPS*2)
    i=0
    while i<n-w:
        dy=root[i+w,1]-root[i,1]
        if dy>=0.20:
            hs=float(((still['lhand']&handUp['lhand'])|(still['rhand']&handUp['rhand']))[i:i+w].mean()); fs=float(footS[i:i+w].mean())
            ev.append(dict(kind='몸 끌어올리기' if hs>0.5 and fs<0.5 else '다리로 올라서기' if fs>=0.5 else '오르기(손발 섞임)',t0=T(i),t1=T(i+w),dy=round(float(dy),2),hands_hold=round(hs,2),feet_plant=round(fs,2))); i+=w
        elif dy<=-0.30:
            j=i+w; fall=float((~footS & ~handS)[i:j].mean())
            ev.append(dict(kind='내려오기' if fall<0.3 else '뛰어내리기·떨어짐',t0=T(i),t1=T(j),dy=round(float(dy),2),no_contact=round(fall,2))); i+=w
        else: i+=12
    ev.sort(key=lambda e:e['t0'])
    return dict(file=os.path.basename(amcf),frames=n,sec=round(n/FPS,1),events=ev)
if __name__=='__main__':
    base=sys.argv[1]; res=[]
    for subj in sorted(os.listdir(base)):
        d=os.path.join(base,subj); asf=os.path.join(d,[f for f in os.listdir(d) if f.endswith('.asf')][0])
        for f in sorted(x for x in os.listdir(d) if x.endswith('.amc')): res.append(analyze(asf,os.path.join(d,f)))
    json.dump(res,open(sys.argv[2],'w'),ensure_ascii=False,indent=1)
    for r in res:
        from collections import Counter
        c=Counter(e['kind'] for e in r['events'])
        print(f"{r['file']:11s} {r['sec']:6.1f}초 | "+' · '.join(f"{k} {v}" for k,v in c.items()))
