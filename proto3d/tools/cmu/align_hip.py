# 주의: OpenCV가 이 MPG를 25장/초로 읽는다(실제 29.97, ffprobe로 확인) → 추정 결과의 시각(i/25)을 실제 시각으로 고친다
# 촬영 영상 ↔ 동작 파일 시각 맞추기(빠르기 ×1, 어긋남만): 무릎 각(왼·오른, 영상은 MediaPipe 3D 추정) + 엉덩이 높이(영상은 화면 세로 자리, 위가 +)를 30Hz로 견준다
import sys, os, json, numpy as np
sys.path.insert(0, os.path.dirname(__file__)); from amc import *
pj, asf, amcf = sys.argv[1:4]; J = json.load(open(pj)); fr = J['frames']
T = np.array([f['t'] for f in fr]) * J['fps'] / (30000/1001); ok = np.array([f['ok'] for f in fr])
def ang(a, b, c): u, v = a - b, c - b; return np.degrees(np.arccos(np.clip((u*v).sum(-1) / (np.linalg.norm(u,axis=-1)*np.linalg.norm(v,axis=-1)+1e-9), -1, 1)))
W = np.array([f['world'] if f['ok'] else [[np.nan]*3]*33 for f in fr]); I = np.array([f['img'] if f['ok'] else [[np.nan]*3]*33 for f in fr])
vk = np.stack([ang(W[:,23], W[:,25], W[:,27]), ang(W[:,24], W[:,26], W[:,28]), -(I[:,23,1] + I[:,24,1]) / 2], 1)
tg = np.arange(0, T[-1], 1/30); vs = np.stack([np.interp(tg, T[ok], vk[ok, j]) for j in range(3)], 1)
bones,par,unit = load_asf(asf); am = load_amc(amcf); P = [fk(bones,par,unit,x) for x in am[::4]]
A = {k: np.array([p[k] for p in P]) for k in ['lhipjoint','lfemur','ltibia','rhipjoint','rfemur','rtibia','root']}
ms = np.stack([ang(A['lhipjoint'], A['lfemur'], A['ltibia']), ang(A['rhipjoint'], A['rfemur'], A['rtibia']), A['root'][:,1]], 1)
def z(a): return (a - a.mean(0)) / (a.std(0) + 1e-9)
res = []
for off in range(-int(3*30), len(vs) - int(0.6*len(ms))):
    a0, b0 = max(0, off), max(0, -off); n = min(len(vs) - a0, len(ms) - b0)
    if n < 0.7 * len(ms): continue
    c = (z(vs[a0:a0+n]) * z(ms[b0:b0+n])).mean(0); res.append((float(c[2]), off/30, c))
res.sort(key=lambda r: -r[0]); b = res[0]
sec = next((r for r in res if abs(r[1] - b[1]) > 1.0), None)
print(f"{os.path.basename(pj)[:-5]}: 동작 0초 = 영상 {b[1]:+.2f}초 · 상관 평균 {b[0]:.2f} (왼무릎 {b[2][0]:.2f} 오른무릎 {b[2][1]:.2f} 엉덩이 높이 {b[2][2]:.2f}) · 다음 후보 {sec[1]:+.2f}초({sec[0]:.2f}) · 영상에서 사람 찾음 {ok.mean()*100:.0f}%")
