# 단위·축·프레임률 확인: ① 다리 길이 ② 발이 닿은 높이(바닥이 평평한가) ③ 무릎이 앞으로 굽는가 ④ 손발이 모두 떨어진(떨어지는) 구간의 엉덩이 가속도
import sys, os, numpy as np
sys.path.insert(0, os.path.dirname(__file__)); from amc import *
base=sys.argv[1]; FPS=120.0
for subj in sorted(os.listdir(base)):
    d=os.path.join(base,subj); asf=[f for f in os.listdir(d) if f.endswith('.asf')][0]; bones,par,unit=load_asf(os.path.join(d,asf))
    leg=(bones['lfemur']['len']+bones['ltibia']['len'])*unit
    for f in sorted(x for x in os.listdir(d) if x.endswith('.amc')):
        fr=load_amc(os.path.join(d,f)); P=[fk(bones,par,unit,x) for x in fr]
        J=lambda n: np.array([p[n] for p in P])
        root=J('root'); lf=J('lfoot'); rf=J('rfoot'); lt=J('ltoes'); lh=J('lhand'); rh=J('rhand'); lk=J('ltibia'); lfe=J('lfemur')
        floor=np.percentile(np.minimum(lf[:,1],rf[:,1]),2)
        # 무릎이 앞으로: 몸 앞(발끝 방향) 쪽으로 무릎이 나가는가 — 무릎(lfemur 끝)이 엉덩이–발목 선보다 발끝 쪽인지
        hipL=J('lhipjoint'); fwd=lt-lf; fwd[:,1]=0; fwd/=np.linalg.norm(fwd,axis=1,keepdims=True)+1e-9
        a=hipL; b=lf; k=lfe; t=np.clip(np.sum((k-a)*(b-a),1)/np.sum((b-a)**2,1),0,1)[:,None]; off=k-(a+t*(b-a)); kneefwd=np.sum(off*fwd,1)
        bent=np.linalg.norm(off,axis=1)>0.05; kf=np.mean(kneefwd[bent]>0) if bent.any() else float('nan')
        # 자유 낙하: 손발 모두 낮은 자리(바닥+0.15)보다 높고 손이 엉덩이보다 아래…는 매달림과 구분 어려움 → 엉덩이 수직 가속도가 -7~-12인 연속 구간(0.15초 이상)
        y=root[:,1]; acc=(y[2:]-2*y[1:-1]+y[:-2])*FPS*FPS; 
        from numpy.lib.stride_tricks import sliding_window_view as sw
        w=int(0.15*FPS); m=sw(acc,w).mean(1) if len(acc)>w else np.array([0]); i=np.argmin(m)
        print(f"{f:11s} 다리 {leg:.2f}m | 바닥(발 2%) {floor:+.3f} 발 높이 표준편차(닿을 때) {np.std(np.minimum(lf[:,1],rf[:,1])[np.minimum(lf[:,1],rf[:,1])<floor+0.05]):.3f} | 굽은 무릎이 발끝 쪽 {kf*100:4.0f}% | 엉덩이 0.15초 평균 가속도 최저 {m[i]:6.1f}m/s² ({(i+1)/FPS:.2f}초)")
