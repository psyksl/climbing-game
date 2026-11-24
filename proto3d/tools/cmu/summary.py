import sys, os, numpy as np
sys.path.insert(0, os.path.dirname(__file__)); from amc import *
base=sys.argv[1]
for subj in sorted(os.listdir(base)):
    d=os.path.join(base,subj); asf=[f for f in os.listdir(d) if f.endswith('.asf')][0]
    bones,par,unit=load_asf(os.path.join(d,asf))
    for f in sorted(x for x in os.listdir(d) if x.endswith('.amc')):
        fr=load_amc(os.path.join(d,f)); n=len(fr)
        P=[fk(bones,par,unit,fr[i]) for i in range(0,n,max(1,n//200))]
        ry=np.array([p['root'][1] for p in P]); lh=np.array([p['lhand'][1] for p in P]); rh=np.array([p['rhand'][1] for p in P])
        lf=np.array([p['lfoot'][1] for p in P]); rf=np.array([p['rfoot'][1] for p in P])
        hx=np.array([p['root'] for p in P]); horiz=np.linalg.norm(hx[-1][[0,2]]-hx[0][[0,2]])
        flo=min(lf.min(),rf.min())
        print(f"{f:12s} {n:5d}장 {n/120:5.1f}초 | 엉덩이 높이 {ry.min()-flo:.2f}~{ry.max()-flo:.2f}m (오른 양 {ry[-1]-ry[0]:+.2f}) 수평 이동 {horiz:.2f}m | 손 최고 {max(lh.max(),rh.max())-flo:.2f}m | 발 최고 {max(lf.max(),rf.max())-flo:.2f}m | 키(머리) {P[0]['head'][1]-flo:.2f}m")
