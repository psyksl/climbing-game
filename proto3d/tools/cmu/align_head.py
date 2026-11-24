# 사다리 영상(정면 큰 화면 + 오른쪽 위 작은 화면) 시각 맞추기: 큰 화면에서 검은 옷의 가장 높은 줄(머리 위) ↔ 동작 파일의 머리 높이. 빠르기 ×1, 어긋남만 찾는다
import sys, os, subprocess, numpy as np
sys.path.insert(0, os.path.dirname(__file__)); from amc import *
vid, asf, amcf = sys.argv[1:4]; W, H = 176, 120
raw = subprocess.run(['ffmpeg','-v','error','-i',vid,'-vf',f'fps=30,scale={W}:{H},format=gray','-f','rawvideo','-'],capture_output=True).stdout
F = np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.float32)
M = np.ones((H, W), bool); M[:int(0.47*H), int(0.53*W):] = False; M[:int(0.12*H), :] = False; M[int(0.92*H):, :] = False
top = []
for f in F:
    dark = (f < 45) & M; rows = np.where(dark.sum(1) >= 3)[0]; top.append(rows[0] if len(rows) else np.nan)
top = np.array(top, float); ok = ~np.isnan(top); top[~ok] = np.interp(np.where(~ok)[0], np.where(ok)[0], top[ok]); vsig = -top
bones,par,unit = load_asf(asf); fr = load_amc(amcf); P = [fk(bones,par,unit,x) for x in fr[::4]]; hd = np.array([p['head'][1] for p in P])
def z(a): return (a - a.mean()) / (a.std() + 1e-9)
v, m = z(vsig), z(hd); best = None
for off in range(-30, len(v) - len(m) + 30):
    a0, b0 = max(0, off), max(0, -off); n = min(len(v) - a0, len(m) - b0)
    if n < len(m) * 0.85: continue
    c = float(np.dot(z(v[a0:a0+n]), z(m[b0:b0+n])) / n)
    if best is None or c > best[0]: best = (c, off / 30)
print(f"{os.path.basename(vid)}: 머리 높이 맞춤 → 동작 0초 = 영상 {best[1]:+.2f}초, 상관 {best[0]:.2f}")
