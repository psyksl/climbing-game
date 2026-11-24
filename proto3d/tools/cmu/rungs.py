# 원본에서 손·발이 멈춘 자리(0.15초 넘게, 초속 0.15m 아래)를 우리 뼈대 자리로 옮겨 적는다(cmu_convert.mjs와 같은 옮김: 수평 (p-h0)*k, 높이 ankleY+(y-발목바닥)*k)
import sys, os, json, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from amc import *
asf, amcf, t0, t1, k, ankleY, out = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5]), float(sys.argv[6]), sys.argv[7]
bones, par, unit = load_asf(asf); fr = load_amc(amcf); P = [fk(bones, par, unit, x) for x in fr]; n = len(P)
A = {kk: np.array([p[kk] for p in P]) for kk in ['lhand', 'rhand', 'ltoes', 'rtoes', 'ltibia', 'rtibia', 'root', 'lwrist', 'rwrist', 'lfoot', 'rfoot']}
floorAnk = np.sort(np.r_[A['ltibia'][:, 1], A['rtibia'][:, 1]])[int(2 * n * 0.02)]
i0, i1 = max(0, round(t0 * 120)), min(n - 1, round(t1 * 120)); h0 = A['root'][i0]
def ours(p): return [round(float((p[0] - h0[0]) * k), 4), round(float(ankleY + (p[1] - floorAnk) * k), 4), round(float((p[2] - h0[2]) * k), 4)]
res = []
for e, nm in enumerate(['lhand', 'rhand', 'ltoes', 'rtoes']):
    x = A[nm]; v = np.linalg.norm(x[12:] - x[:-12], axis=1) / (12 / 120); s = np.r_[np.zeros(6, bool), v < 0.15, np.zeros(6, bool)]
    i = i0
    while i <= i1:
        if s[i]:
            j = i
            while j <= i1 and s[j]: j += 1
            if j - i >= 18: res.append({'e': e, 't0': round((i - i0) / 120, 3), 't1': round((j - 1 - i0) / 120, 3), 'p': ours(x[i:j].mean(0)), 'src_y': round(float(x[i:j, 1].mean() - floorAnk), 4), 'base': ours(A[nm.replace('hand', 'wrist')][i:j].mean(0)) if e < 2 else ours(A[nm.replace('toes', 'foot')][i:j].mean(0))})
            i = j
        else: i += 1
json.dump({'floorAnk': float(floorAnk), 'k': k, 'holds': res}, open(out, 'w'))
for r in sorted(res, key=lambda r: r['p'][1]): print(['왼손', '오른손', '왼발', '오른발'][r['e']], f"{r['t0']:6.2f}~{r['t1']:6.2f}s", '자리', r['p'], '원본 높이', r['src_y'])
