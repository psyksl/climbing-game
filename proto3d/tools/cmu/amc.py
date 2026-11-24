# ASF/AMC 읽기 + 정방향 계산(FK). 단위: ASF length × (1/0.45) 인치 → 미터 (CMU: length 0.45 → 1 unit = 1/0.45 inch)
import numpy as np, re, sys, math
def R(axis, deg):
    a=math.radians(deg); c,s=math.cos(a),math.sin(a)
    if axis=='x': return np.array([[1,0,0],[0,c,-s],[0,s,c]])
    if axis=='y': return np.array([[c,0,s],[0,1,0],[-s,0,c]])
    return np.array([[c,-s,0],[s,c,0],[0,0,1]])
# 회전: ASF·AMC의 "XYZ"는 x → y → z 순서로 고정 축 둘레를 돌린다 = 행렬 Rz·Ry·Rx (널리 쓰이는 CMU 읽기 코드와 같은 약속)
def eulXYZ(x,y,z): return R('z',z) @ R('y',y) @ R('x',x)
def load_asf(path):
    txt=open(path,encoding='latin-1').read().replace('\r','')
    sc=1.0
    m=re.search(r'length\s+([\d.]+)', txt.split(':root')[0]); 
    if m: sc=float(m.group(1))
    bones={}; 
    bd=txt.split(':bonedata')[1].split(':hierarchy')[0]
    for blk in re.findall(r'begin(.*?)end', bd, re.S):
        d={}; 
        for ln in blk.strip().split('\n'):
            p=ln.split()
            if not p: continue
            if p[0]=='name': d['name']=p[1]
            elif p[0]=='direction': d['dir']=np.array(list(map(float,p[1:4])))
            elif p[0]=='length': d['len']=float(p[1])
            elif p[0]=='axis': d['axis']=list(map(float,p[1:4]))
            elif p[0]=='dof': d['dof']=p[1:]
        d.setdefault('dof',[]); bones[d['name']]=d
    hier=txt.split(':hierarchy')[1].split('end')[0]
    par={}
    for ln in hier.strip().split('\n'):
        p=ln.split()
        if len(p)<2 or p[0]=='begin': continue
        for c in p[1:]: par[c]=p[0]
    for n,d in bones.items():
        C=eulXYZ(*d['axis']); d['C']=C; d['Ci']=C.T
    inch=0.0254; unit=(1.0/sc)*inch
    return bones, par, unit
def load_amc(path):
    frames=[]; cur=None
    for ln in open(path,encoding='latin-1'):
        ln=ln.strip()
        if not ln or ln[0] in '#:': continue
        if re.fullmatch(r'\d+', ln): cur={}; frames.append(cur); continue
        p=ln.split(); cur[p[0]]=list(map(float,p[1:]))
    return frames
def fk(bones, par, unit, fr):
    # 루트: TX TY TZ RX RY RZ (axis XYZ)
    r=fr['root']; pos={'root':np.array(r[:3])*unit}; rot={'root':eulXYZ(*r[3:6])}
    order=[]; 
    kids={}
    for c,p in par.items(): kids.setdefault(p,[]).append(c)
    stack=['root']
    while stack:
        p=stack.pop()
        for c in kids.get(p,[]):
            d=bones[c]; vals=fr.get(c,[]); ang={'rx':0,'ry':0,'rz':0}
            for k,v in zip(d['dof'],vals): ang[k]=v
            M=d['C'] @ eulXYZ(ang['rx'],ang['ry'],ang['rz']) @ d['Ci']
            rot[c]=rot[p] @ M
            pos[c]=pos[p] + rot[c] @ (d['dir']*d['len']*unit)
            stack.append(c)
    return pos
